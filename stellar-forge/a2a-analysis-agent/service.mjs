// SPDX-License-Identifier: MIT
import express from 'express';
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import Database from 'better-sqlite3';
import {Kysely,SqliteDialect} from 'kysely';
import {A2A_PROTOCOL_VERSION,AGENT_CARD_PATH,Message,TaskState} from '@a2a-js/sdk';
import {DefaultRequestHandler,DefaultExecutionEventBusManager,ResultManager,AgentEvent} from '@a2a-js/sdk/server';
import {UnsupportedOperationError,RequestMalformedError} from '@a2a-js/sdk/errors';
import {agentCardHandler,jsonRpcHandler} from '@a2a-js/sdk/server/express';
import {acquireDatasetLease} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import {SCHEMA,need,validateConfig,privateDirectory,statePaths,digest,safeError} from './config.mjs';
import {openOriginalAnalysis,verifyProcedure} from './native.mjs';
import {CommittedTaskStore,scopeKey} from './task-store.mjs';
import {AnalysisExecutor,isTerminal} from './executor.mjs';

const HISTORY_INDEX="CREATE INDEX IF NOT EXISTS sf_a2a_initial_message ON tasks(tenant,owner,json_extract(history,'$[0].messageId'))";
const require=createRequire(import.meta.url);
function inputIdentity(message){
  const value=Message.toJSON(message);
  delete value.taskId;delete value.contextId;
  return digest(value);
}
function matchInitial(task,message){
  const original=task.history?.[0];
  if(!original||original.messageId!==message.messageId||inputIdentity(original)!==inputIdentity(message)||
    message.contextId&&message.contextId!==task.contextId)
    throw new RequestMalformedError('The original message ID belongs to a different request.');
  return task;
}

export class AnalysisRequestHandler extends DefaultRequestHandler {
  constructor(card,store,executor,eventBuses){
    super(card,store,executor,eventBuses,undefined,undefined,undefined,undefined,{validateInputModes:true});
    this.analysisStore=store;this.analysisExecutor=executor;this.analysisBuses=eventBuses;
    this.initialSends=new Map();this.turns=new Set();
  }
  async initial(request,context){
    const message=request.message;
    if(!message?.messageId)throw new RequestMalformedError('message.messageId is required.');
    const key=scopeKey(context,'message:'+message.messageId);
    let selected=this.initialSends.get(key);
    if(!selected){
      selected=(async()=>{
        const prior=await this.analysisStore.findInitialMessage(message.messageId,context);
        if(prior)return matchInitial(prior,message);
        const started=await super.sendMessage({...request,configuration:{...request.configuration,returnImmediately:true}},context);
        return this.analysisStore.load(started.id,context);
      })();
      this.initialSends.set(key,selected);
    }
    try{return matchInitial(await selected,message);}
    finally{if(this.initialSends.get(key)===selected)this.initialSends.delete(key);}
  }
  async sendMessage(request,context){
    if(this.analysisExecutor.closing)throw new UnsupportedOperationError('The service is restarting; reopen the retained task.');
    let task;
    if(!request.message?.taskId)task=await this.initial(request,context);
    else{
      const key=scopeKey(context,request.message.taskId);
      if(this.turns.has(key)||this.analysisExecutor.isRunning(context,request.message.taskId))
        throw new UnsupportedOperationError('This task is running. Use GetTask or SubscribeToTask.');
      this.turns.add(key);
      try{
        task=await super.sendMessage({...request,configuration:{...request.configuration,returnImmediately:true}},context);
      }finally{this.turns.delete(key);}
    }
    if(request.configuration?.returnImmediately!==true){
      const active=this.analysisExecutor.entryFor(context,task.id);
      if(active)await active.done;
    }
    return super.getTask({id:task.id,tenant:request.tenant??'',
      ...(request.configuration?.historyLength===undefined?{}:{historyLength:request.configuration.historyLength})},context);
  }
  async *sendMessageStream(request,context){
    // The native nonblocking request owns an independent ResultManager drain.
    // Disconnecting this SSE consumer only detaches its subscription.
    const first=await this.sendMessage({...request,configuration:{...request.configuration,returnImmediately:true}},context);
    if(isTerminal(first)){yield {payload:{$case:'task',value:first}};return;}
    let yielded=false;
    try{
      for await(const event of super.resubscribe({id:first.id,tenant:request.tenant??''},context)){
        yielded=true;yield event;
      }
    }catch(error){
      // A short task can finish between SendMessage and the native subscription.
      if(!yielded){
        const completed=await super.getTask({id:first.id,tenant:request.tenant??''},context);
        if(isTerminal(completed)){yield {payload:{$case:'task',value:completed}};return;}
      }
      throw error;
    }
  }
  async cancelTask(request,context){
    const before=await super.getTask({id:request.id,tenant:request.tenant??''},context);
    const prior=before.metadata?.analysis;
    if(before.status.state===TaskState.TASK_STATE_CANCELED){
      const unresolved=!prior?.originalCancellation||
        ['REQUEST_UNCONFIRMED','NOT_FOUND','RUNNING','QUEUED','PENDING'].includes(prior.originalCancellation.status);
      if(prior?.cancelRequested&&prior.plan?.calls?.queryExport&&unresolved){
        const originalCancellation=await this.analysisExecutor.cancelOriginal(prior.plan);
        const manager=new ResultManager(this.analysisStore,context);
        await manager.processEvent(AgentEvent.statusUpdate({taskId:before.id,contextId:before.contextId,
          status:before.status,metadata:{analysis:{...prior,originalCancellation,stage:'cancelled'}}}));
        return super.getTask({id:before.id,tenant:request.tenant??''},context);
      }
      return before;
    }
    let cancellation;
    if(!isTerminal(before)&&!this.analysisBuses.getByTaskId(request.id,context)){
      // After restart, SDK CancelTask has no executor bus. Retain the cancellation
      // intent through its original ResultManager, then address the exact native job.
      const manager=new ResultManager(this.analysisStore,context);
      await manager.processEvent(AgentEvent.statusUpdate({taskId:before.id,contextId:before.contextId,
        status:before.status,metadata:{analysis:{...before.metadata?.analysis,cancelRequested:true}}}));
      cancellation=await this.analysisExecutor.cancelOriginal(before.metadata?.analysis?.plan);
    }
    const cancelled=await super.cancelTask(request,context);
    if(cancellation){
      const manager=new ResultManager(this.analysisStore,context);
      await manager.processEvent(AgentEvent.statusUpdate({taskId:cancelled.id,contextId:cancelled.contextId,
        status:cancelled.status,metadata:{analysis:{...cancelled.metadata?.analysis,
          cancelRequested:true,originalCancellation:cancellation,stage:'cancelled'}}}));
      return super.getTask({id:cancelled.id,tenant:request.tenant??''},context);
    }
    return cancelled;
  }
}

export function makeCard(config){
  return {
    name:config.name,description:config.description,version:'1.0.0',
    supportedInterfaces:[{url:config.publicUrl,protocolBinding:'JSONRPC',tenant:'',protocolVersion:A2A_PROTOCOL_VERSION}],
    provider:{organization:'Stellar Forge',url:'https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace'},
    capabilities:{streaming:true,pushNotifications:false,extensions:[],extendedAgentCard:false},
    securitySchemes:{Bearer:{scheme:{$case:'httpAuthSecurityScheme',
      value:{description:'Operator-provided access token.',scheme:'bearer',bearerFormat:'opaque'}}}},
    securityRequirements:[{schemes:{Bearer:{list:[]}}}],
    defaultInputModes:['application/json','text/plain'],
    defaultOutputModes:['application/json','application/x-ndjson','text/csv','text/html','application/zip','application/vnd.sqlite3'],
    skills:[
      {id:'analysis_catalog',name:'Available analyses',description:'List the analytical procedures and source selections available to this caller.',
        tags:['analysis','catalog'],examples:['{"action":"catalog"}'],inputModes:['application/json','text/plain'],
        outputModes:['application/json'],securityRequirements:[]},
      {id:'analysis_run',name:'Complete analytical exports',description:'Run a selected saved query or report and receive the complete original files.',
        tags:['analysis','query','report','export'],examples:['{"action":"run","procedureId":"query_monthly"}'],
        inputModes:['application/json','text/plain'],outputModes:[],securityRequirements:[]},
      {id:'analysis_resume',name:'Continue an analysis',description:'Continue the original analytical jobs retained in an existing task.',
        tags:['analysis','recovery'],examples:['{"action":"resume"}'],
        inputModes:['application/json','text/plain'],outputModes:[],securityRequirements:[]}
    ],
    documentationUrl:new URL('/',config.publicUrl).href,signatures:[]
  };
}
function authentication(config,environment){
  const selected=config.principals.map(p=>{
    const token=environment[p.tokenEnv];
    need(typeof token==='string'&&token.length>=32&&token.length<=1024&&!/\s/.test(token),
      'A2A_ANALYSIS_TOKEN_ENV_REQUIRED');
    return {name:p.name,digest:createHash('sha256').update(token).digest()};
  });
  need(new Set(selected.map(p=>p.digest.toString('hex'))).size===selected.length,'A2A_ANALYSIS_PRINCIPAL_TOKENS_DUPLICATED');
  return (req,res,next)=>{
    const header=req.headers.authorization;
    const match=typeof header==='string'?/^Bearer ([^\s]+)$/i.exec(header):null;
    if(!match){res.set('WWW-Authenticate','Bearer');res.status(401).json({error:'Authentication required.'});return;}
    const presented=createHash('sha256').update(match[1]).digest();
    const principal=selected.find(p=>timingSafeEqual(p.digest,presented));
    if(!principal){res.set('WWW-Authenticate','Bearer');res.status(401).json({error:'Authentication required.'});return;}
    req.analysisPrincipal={isAuthenticated:true,userName:principal.name};next();
  };
}
async function privateDatabase(path,{required=true}={}){
  let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT'&&!required)return;throw error;}
  need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o077)===0&&
    (process.getuid===undefined||info.uid===process.getuid()),'A2A_ANALYSIS_PRIVATE_DATABASE_REQUIRED');
}
async function child(argv){
  return new Promise((resolve,reject)=>{
    const processChild=spawn(process.execPath,argv,{stdio:'inherit',shell:false});
    processChild.once('error',reject);
    processChild.once('exit',(code,signal)=>code===0?resolve():reject(new Error('A2A_ANALYSIS_MIGRATION_FAILED_'+(signal??code))));
  });
}
export async function initializeDatabase(input){
  const config=validateConfig(input);await privateDirectory(config.directory,{create:true});
  const lease=await acquireDatasetLease(config.directory),paths=statePaths(config);
  try{
    await privateDatabase(paths.database,{required:false});
    const oldMask=process.umask(0o077);
    try{
      const sdkDist=dirname(require.resolve('@a2a-js/sdk'));
      await child([join(sdkDist,'cli','a2a_db.js'),'upgrade','--url','sqlite:'+paths.database,'--store','tasks']);
      lease.assertHeld();await privateDatabase(paths.database);
      const sqlite=new Database(paths.database,{fileMustExist:true});
      try{sqlite.exec(HISTORY_INDEX);}finally{sqlite.close();}
    }finally{process.umask(oldMask);}
    return {schema:SCHEMA,status:'INITIALIZED'};
  }finally{await lease.close();}
}
export async function checkConfiguration(input){
  const config=validateConfig(input);await privateDirectory(config.directory);
  const native=await openOriginalAnalysis(config);
  try{
    const procedures=[];
    for(const p of config.procedures)procedures.push({id:p.id,...await verifyProcedure(native,p)});
    return {schema:SCHEMA,status:'ORIGINAL_SELECTIONS_READY',procedures};
  }finally{await native.close();}
}

export async function openAnalysisServer(input,{environment=process.env}={}){
  const config=validateConfig(input);await privateDirectory(config.directory);
  const authenticate=authentication(config,environment),lease=await acquireDatasetLease(config.directory);
  let db,native,executor,server,closing=false;
  try{
    const path=statePaths(config).database;await privateDatabase(path);
    const oldMask=process.umask(0o077);let sqlite;
    try{sqlite=new Database(path,{fileMustExist:true});}finally{process.umask(oldMask);}
    try{
      need(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get(),
        'A2A_ANALYSIS_RUN_INIT_FIRST');
      need(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='sf_a2a_initial_message'").get(),
        'A2A_ANALYSIS_RUN_INIT_FIRST');
      sqlite.pragma('journal_mode = WAL');sqlite.pragma('synchronous = FULL');sqlite.pragma('busy_timeout = 10000');
      db=new Kysely({dialect:new SqliteDialect({database:sqlite})});
    }catch(error){sqlite.close();throw error;}
    const store=new CommittedTaskStore(db,{sqlite,assertHeld:()=>lease.assertHeld()});
    native=await openOriginalAnalysis(config);
    executor=new AnalysisExecutor({config,native,taskStore:store});
    const buses=new DefaultExecutionEventBusManager(),app=express();
    app.disable('x-powered-by');app.disable('etag');
    app.use((_req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');next();});
    app.get('/healthz',(_req,res)=>res.status(closing?503:200).json({schema:SCHEMA,status:closing?'restarting':'running'}));
    let handler,card,cardRoute,rpcRoute;
    app.get('/readyz',authenticate,async(_req,res)=>{
      try{
        lease.assertHeld();const workspaces=[];
        for(const w of config.workspaces){
          const state=await native.call(w.name,'state');
          need(state.workspace_id===w.workspaceId,'A2A_ANALYSIS_WORKSPACE_ID_CHANGED');
          workspaces.push({name:w.name,workspaceId:state.workspace_id});
        }
        res.json({schema:SCHEMA,status:'ORIGINAL_WORKSPACES_CONNECTED',workspaces});
      }catch(error){res.status(503).json({schema:SCHEMA,error:safeError(error)});}
    });
    app.use('/'+AGENT_CARD_PATH,(req,res,next)=>cardRoute(req,res,next));
    app.get('/',(_req,res)=>res.type('text/plain').send(config.name+'\n\n'+config.description+
      '\n\nAgent Card: '+new URL('/'+AGENT_CARD_PATH,config.publicUrl).href+
      '\nConnect this agent in the Agent workspace to select and run an analysis.\n'));
    app.use('/a2a',authenticate,express.json({limit:'1mb'}),(req,res,next)=>rpcRoute(req,res,next));
    app.use((error,_req,res,_next)=>{
      res.status(error.status===413?413:400).json({jsonrpc:'2.0',id:null,
        error:{code:-32700,message:error.status===413?'Request body is too large.':'Invalid request JSON.'}});
    });
    server=createServer(app);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);server.listen(config.listen.port,config.listen.host,()=>{server.off('error',reject);resolve();});
    });
    const address=server.address();
    if(config.listen.port===0&&new URL(config.publicUrl).port==='0'){
      const url=new URL(config.publicUrl);url.port=String(address.port);config.publicUrl=url.href;
    }
    card=makeCard(config);handler=new AnalysisRequestHandler(card,store,executor,buses);
    cardRoute=agentCardHandler({agentCardProvider:handler});
    rpcRoute=jsonRpcHandler({requestHandler:handler,userBuilder:async request=>request.analysisPrincipal});
    async function close(){
      if(closing)return;closing=true;
      const stopped=new Promise(resolve=>server.close(()=>resolve()));
      await executor.close();
      server.closeAllConnections();
      await stopped;await native.close();await db.destroy();await lease.close();
    }
    return {config,card,handler,executor,store,server,address,close};
  }catch(error){
    server?.closeAllConnections();server?.close();
    if(executor)await executor.close();
    if(native)await native.close();
    if(db)await db.destroy();
    await lease.close();throw error;
  }
}
