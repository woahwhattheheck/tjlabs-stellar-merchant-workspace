// MIT. Complete saved publisher refresh on the original installed IATI Applications, client, MCP and CLI.
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { openInstalledIatiPage } from './browser.mjs';

const SCHEMA='stellar-forge.iati-refresh-operator-receiving.v1';
const ROOT='stellar/scf-starforge-20261009/';
const SDK=ROOT+'sf30-seller-sdk/';
const OPERATOR='stellar-forge/mcp-merchant-operator/';
const SHA=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(canonical(value),null,2)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(left,right)=>encode(left).equals(encode(right));
const check=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'IATI_RECEIVING_ASSERTION'});};
const uuid=value=>{const x=hash(value);return x.slice(0,8)+'-'+x.slice(8,12)+'-4'+x.slice(13,16)+'-a'+x.slice(17,20)+'-'+x.slice(20,32);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorValue=error=>({code:error.code??'IATI_RECEIVING_ERROR',message:String(error.message??error).slice(0,3000)});
const observed=promise=>{void promise.catch(()=>{});return promise;};
const CRITICAL=[
 ...['refresh.py','refresh_packet.py','refresh_http.py','refresh_cli.py','REFRESH.md',
 'receiving/refresh.py','receiving/refresh.mjs','receiving/refresh_archive.py','receiving/REFRESH.md','receiving/browser.mjs',
 'public/refresh.js','public/refresh.css','iati_source.py','iati_workspace.py','cli.py','cli.mjs',
 'managed.py','server.py','client.mjs','client.d.mts','public/index.html','public/app.js','public/style.css'].map(name=>SDK+'iati/'+name),
 ...['xml_source.py','workspace.py','server.py','native.mjs'].map(name=>SDK+'xml/'+name),
 SDK+'dataset-handler.mjs',ROOT+'distribution/contributions/iati.json',
 ROOT+'distribution/runtime-workspace/application-iati.mjs',ROOT+'distribution/runtime-workspace/providers/iati.mjs',
 ROOT+'distribution/runtime-workspace/model.mjs',ROOT+'distribution/runtime-workspace/server.mjs',
 ROOT+'distribution/runtime-workspace/applications.mjs',ROOT+'distribution/runtime-workspace/managed-workspace.mjs',
 ROOT+'distribution/runtime-workspace/application-provider.mjs',ROOT+'distribution/runtime-install.mjs',
 ROOT+'sf46-release/runtime-package.mjs',ROOT+'merchant-fleet-gateway/state-lease.mjs',
 OPERATOR+'source-workspace.mjs',OPERATOR+'catalog/source-workspace.mjs',
 OPERATOR+'retained-file-reads.mjs',OPERATOR+'retained-file-contracts.mjs',
 'stellar-forge/mcp-paid-agent/http-tools.mjs',ROOT+'sf33-failure-contract/contract.mjs'
];
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDirectory(path){
 check(isAbsolute(path)&&resolve(path)===path&&path!=='/','Select a canonical private directory.');
 await mkdir(path,{recursive:true,mode:0o700});
 const info=await lstat(path);
 check(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&(!process.getuid||info.uid===process.getuid())&&
  await realpath(path)===path,'The receiver requires its original owned private directory without aliases.');
}
async function syncDirectory(path){const h=await open(path,constants.O_RDONLY);try{await h.sync();}finally{await h.close();}}
async function publish(path,data,immutable=false){
 data=Buffer.isBuffer(data)?data:encode(data);
 if(immutable&&await exists(path)){check((await readFile(path)).equals(data),'A retained immutable receiving selection changed.');return;}
 const temporary=join(dirname(path),'.iati-receiving-'+randomUUID()+'.partial');
 const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
 check((await readFile(temporary)).equals(data),'A complete staged receiving record changed.');
 // The complete callback holds the original kernel lease. Rename avoids an
 // interrupted extra hard link on private connection files requiring nlink=1.
 await rename(temporary,path);await syncDirectory(dirname(path));
}
async function identity(path){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const before=await handle.stat({bigint:true});check(before.isFile(),'Select a complete regular original file.');
  const sha=createHash('sha256'),git=createHash('sha1').update(Buffer.from('blob '+before.size+'\0'));
  let bytes=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){sha.update(chunk);git.update(chunk);bytes+=chunk.length;}
  const after=await handle.stat({bigint:true});
  check(BigInt(bytes)===before.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),
   'An original file changed while its complete bytes were retained.');
  return{bytes,sha256:sha.digest('hex'),gitBlob:git.digest('hex')};
 }finally{await handle.close();}
}
async function boundedJson(response,maximum=64*1024*1024){
 let bytes=0;const chunks=[];
 for await(const chunk of response.body??[]){bytes+=chunk.length;check(bytes<=maximum,'The original JSON response exceeds its full metadata boundary.');chunks.push(chunk);}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));
 if(!response.ok)throw Object.assign(new Error(value.message??value.error??'Original HTTP operation failed.'),{code:value.error??'IATI_HTTP',status:response.status});
 return value;
}
const runtimeBinding=value=>Object.fromEntries(['installationId','profileId','profileSha256','lockSha256',
 'sourceCommit','sourceManifestSha256','directory','sourceRoot','dependencyCount'].map(key=>[key,value[key]]));
async function until(read,accept,message,{timeoutMs=240000}={}){
 const deadline=Date.now()+timeoutMs;let value;
 do{value=await read();if(await accept(value))return value;await pause(750);}while(Date.now()<deadline);
 throw Object.assign(new Error(message),{code:'IATI_RECEIVING_WAIT',last:value});
}



/** Run one caller-owned whole receiving; the original installer/controller remain the execution authorities. */
export async function runIatiPublisherRefreshReceiving({
 coreInputFile,outputDirectory,sourceRoot,runtimeDirectory,operationId,actor,
 pythonExecutable,chromiumExecutable,playwrightModule
}={}){
 process.umask(0o077);
 check(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(operationId),'Retain one original refresh operator operation.');
 check(plain(actor)&&typeof actor.id==='string'&&actor.id.trim()&&typeof actor.label==='string'&&actor.label.trim(),'Pass the actual named receiving operator.');
 for(const path of [coreInputFile,outputDirectory,sourceRoot,runtimeDirectory,pythonExecutable,chromiumExecutable,playwrightModule])
  check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','Select complete canonical original paths.');
 check(await realpath(sourceRoot)===sourceRoot,'Retain the actual selected repository source without aliases.');
 await privateDirectory(outputDirectory);
 const original=path=>import(pathToFileURL(join(sourceRoot,path)).href);
 const {acquireStateLease}=await original(ROOT+'merchant-fleet-gateway/state-lease.mjs');
 const lease=await acquireStateLease(outputDirectory),contexts=new Set(),activeApplications=new Map(),mcpOwners=new Set();
 let appsServer,appApi,appsModel,browser,mcp,sourceClient,receivedClient,progress,selection,result,failure;
 const progressPath=join(outputDirectory,'progress.json');
 const save=async()=>{lease.assertHeld();progress.updatedAt=new Date().toISOString();await publish(progressPath,progress);};
 const stage=async(name,value)=>{progress.stages[name]=value;await save();return value;};
 const endpointDocument=async(name,url)=>publish(join(outputDirectory,'connections',name+'.txt'),Buffer.from(url+'\n'));
 try{
  const coreInputIdentity=await identity(coreInputFile),coreInputBytes=await readFile(coreInputFile);
  check(coreInputBytes.length===coreInputIdentity.bytes&&hash(coreInputBytes)===coreInputIdentity.sha256,'The full original core input changed.');
  const coreConfig=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(coreInputBytes));
  check(plain(coreConfig)&&typeof coreConfig.operationId==='string'&&coreConfig.operationId!==operationId&&
   typeof coreConfig.actor==='string'&&typeof coreConfig.reviewer==='string','Retain the original core operation and named actor/reviewer.');
  const directory=coreConfig.workspaceDirectory,receivedDirectory=coreConfig.receivedDirectory,coreOutput=coreConfig.outputDirectory;
  const scopes=[directory,receivedDirectory,coreOutput,outputDirectory];
  for(const path of scopes)check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','Keep exact original private core directories.');
  for(let i=0;i<scopes.length;i++)for(let j=i+1;j<scopes.length;j++)
   check(scopes[i]!==scopes[j]&&!scopes[i].startsWith(scopes[j]+'/')&&!scopes[j].startsWith(scopes[i]+'/'),
    'Source, independent receiver, core output and operator output must be separate.');
  const {inspectMerchantRuntime}=await original(ROOT+'sf46-release/runtime-package.mjs');
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  check(runtime.state==='READY'&&runtime.dependencyCount===0,'Use the actual original READY zero-dependency operator installation.');
  const installedRoot=await realpath(runtime.sourceRoot),installed=path=>import(pathToFileURL(join(installedRoot,path)).href);
  check(coreConfig.sourceRoot===installedRoot,'The unchanged core input must select this actual installed source root.');
  const sources=[];
  for(const path of CRITICAL){
   const selected=await identity(join(sourceRoot,path)),actual=await identity(join(installedRoot,path));
   check(same(selected,actual),'The READY installation differs from the complete selected original '+path);
   sources.push({path,...actual});
  }
  const callback=await identity(fileURLToPath(import.meta.url));
  check(same(callback,await identity(join(installedRoot,SDK+'iati/receiving/refresh.mjs'))),'Execute this complete receiver from its original installed source.');
  const inputs=[];
  for(const value of [coreConfig.before,coreConfig.after]){
   const actual=await identity(value.path);
   check(actual.bytes===value.bytes&&actual.sha256===value.sha256,'Keep each complete selected publisher body unchanged.');
   inputs.push({path:value.path,...actual,provenance:value.provenance});
  }
  selection={schema:SCHEMA,operationId,actor,sourceRoot,runtime:runtimeBinding(runtime),coreInput:{path:coreInputFile,...coreInputIdentity},
   coreConfiguration:coreConfig,inputs,sources,callback,
   execution:{node:process.execPath,nodeVersion:process.versions.node,pythonExecutable,chromiumExecutable,playwrightModule}};
  await publish(join(outputDirectory,'selection.json'),selection,true);
  await publish(join(outputDirectory,'core-input.json'),coreInputBytes,true);
  progress=await json(progressPath)??{schema:SCHEMA,operationId,createdAt:new Date().toISOString(),stages:{},applications:{},downloads:{}};
  check(progress.schema===SCHEMA&&progress.operationId===operationId,'Retain the same original operator progress.');
  for(const name of ['connections','mcp','downloads','cli','views','temporary','attempts','packet','processes','reads','actions'])
   await privateDirectory(join(outputDirectory,name));
  const final=await json(join(outputDirectory,'result.json'));
  if(final){check(final.state==='COMPLETE'&&final.selectionSha256===hash(encode(selection)),'The completed operator selection changed.');
   for(const item of final.files){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete returned file changed.');}
   return{...final,reused:true};
  }
  let core=await json(join(coreOutput,'result.json'));
  if(!core)core=await runProcess('complete-original-core',[pythonExecutable,'-B',join(installedRoot,SDK+'iati/receiving/refresh.py'),'--input',coreInputFile]);
  const durable=await json(join(coreOutput,'result.json'));
  check(core&&durable&&same(core,durable)&&core.schema==='stellar-forge.iati-refresh-core-receiving.v1'&&core.state==='COMPLETE'&&
   core.operationId===coreConfig.operationId&&core.workspaceDirectory===directory&&core.receivedDirectory===receivedDirectory&&
   SHA.test(core.planId)&&SHA.test(core.promotedRunId)&&plain(core.baseline)&&Array.isArray(core.files),
   'The original complete core must close both workspaces after full refresh/review/promotion and independent receiving.');
  core=durable;
  const coreSelection=await json(join(coreOutput,'selection.json'));
  check(coreSelection?.schema==='stellar-forge.iati-refresh-receiving-selection.v1'&&same(coreSelection.input,coreConfig)&&
   coreSelection.sha256===core.selectionSha256,'The complete core result lost its immutable original input selection.');
  for(const row of core.files){
   check(typeof row.path==='string'&&!isAbsolute(row.path)&&!row.path.split('/').some(x=>!x||x==='.'||x==='..'),'Retain original core-relative output descriptors.');
   const actual=await identity(join(coreOutput,row.path));check(actual.bytes===row.bytes&&actual.sha256===row.sha256,'A complete core file changed.');
  }
  const corePacket={...core.customerHandover},actualPacket=await identity(corePacket.path);
  check(actualPacket.bytes===corePacket.bytes&&actualPacket.sha256===corePacket.sha256,'The full core customer packet changed.');
  const originalPacket={path:join(coreOutput,core.sourceArchive.path),bytes:core.sourceArchive.bytes,sha256:core.sourceArchive.sha256};
  const originalReceivedPacket={path:join(coreOutput,core.receivedArchive.path),bytes:core.receivedArchive.bytes,sha256:core.receivedArchive.sha256};
  const planId=core.planId;
  await stage('nativeCore',{operationId:core.operationId,planId,baseline:core.baseline,pendingRequestId:core.pendingRequestId,
   result:{path:join(coreOutput,'result.json'),...await identity(join(coreOutput,'result.json'))}});
  const {createRuntimeWorkspace,openRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/model.mjs');
  const {startRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/server.mjs');
  const {connectIatiWorkspace}=await installed(SDK+'iati/client.mjs');
  const appState=async id=>(await appApi('/api/applications/state?historyLimit=30')).applications.find(item=>item.id===id);
  let attached;
  async function setupApplication(name,workspace){
   let owned=progress.applications[name];
   if(!owned){
    owned={name,workspace,label:actor.label.slice(0,80)+' · '+(name==='source'?'Original publisher refresh work':'Received publisher refresh work'),
     saveRequestId:uuid(operationId+':application:'+name),runs:[]};
    progress.applications[name]=owned;await save();
   }
   if(!owned.reviewId){
    const reviewed=await appApi('/api/applications/review',{runtimeId:attached.runtimeId,kind:'iati',label:owned.label,
     settings:{workspaceDirectory:workspace,pythonExecutable,port:0}});
    owned.reviewId=reviewed.id;await save();
   }
   if(!owned.id){
    const saved=await appApi('/api/applications/save',{requestId:owned.saveRequestId,reviewId:owned.reviewId});
    owned.id=saved.applicationId;owned.revision=saved.revision;owned.connection=saved.connection;await save();
   }
   let connected=await appState(owned.id);
   if(!connected?.release)await appApi('/api/applications/connect',{applicationId:owned.id});
   connected=await until(()=>appState(owned.id),value=>{
    check(value&&!value.error,'The original Applications entry is unavailable.');
    if(value.adoption?.phase==='FAILED'&&!value.adoption.active)throw Object.assign(new Error(value.adoption.state?.error?.message??'Original runtime adoption failed.'),{code:'IATI_RECEIVING_ADOPTION'});
    return Boolean(value.release);
   },'The original full managed-runtime adoption did not finish.');
   owned.release=connected.release;await save();return owned;
  }
  async function startApplication(owned){
   let current=await appState(owned.id);
   if(current.current&&!current.current.active&&['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)){
    await appApi('/api/applications/recover',{applicationId:owned.id,operationId:current.current.id});
    current=await appState(owned.id);
   }
   if(!current.current?.active&&!['PENDING','QUEUED','RUNNING'].includes(current.current?.phase)){
    let attempt=owned.runs.at(-1);
    if(!attempt||attempt.dispatched||attempt.finished){
     attempt={requestId:uuid(operationId+':run:'+owned.name+':'+owned.runs.length),createdAt:new Date().toISOString()};
     owned.runs.push(attempt);await save();
    }
    if(!attempt.reviewId){const reviewed=await appApi('/api/applications/start-review',{applicationId:owned.id});attempt.reviewId=reviewed.id;await save();}
    const started=await appApi('/api/applications/start',{applicationId:owned.id,requestId:attempt.requestId,reviewId:attempt.reviewId});
    attempt.dispatched=true;attempt.operationId=started.operationId;await save();
   }
   current=await until(()=>appState(owned.id),value=>{
    check(value&&!value.error,'The saved original Applications entry became unavailable.');
    if(value.current&&!value.current.active&&['FAILED','SUCCEEDED','CANCELLED'].includes(value.current.phase))
     throw Object.assign(new Error('The original IATI command ended before its verified startup.'),{code:'IATI_RECEIVING_START',original:value.current});
    return value.phase==='RUNNING'&&value.current?.active&&typeof value.current.privateUrl==='string';
   },'The original managed IATI command produced no verified startup.');
   activeApplications.set(owned.id,current.current.id);
   const launched=current.current.url?.original;
   check(launched?.schema==='stellar-forge.iati-workspace-launch.v1'&&launched.workspace===owned.workspace,
    'The Applications observer must verify the exact original workspace before Open.');
   await endpointDocument(owned.name,current.current.privateUrl);
   const client=await connectIatiWorkspace({consoleUrlFile:join(outputDirectory,'connections',owned.name+'.txt'),timeoutMs:900000});
   const actual=await client.launch();
   check(actual.bindingSha256===launched.bindingSha256&&actual.workspace===owned.workspace&&actual.pid===launched.pid,
    'The authenticated original launch differs from the actual Applications observation.');
   owned.current={operationId:current.current.id,origin:client.origin,bindingSha256:launched.bindingSha256,pid:launched.pid};
   await save();
   return{client,url:current.current.privateUrl,owned};
  }
  async function stopApplication(owned){
   let current=await appState(owned.id);
   if(current.current&&(current.current.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase))){
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId:current.current.id});
    current=await until(()=>appState(owned.id),value=>!value.current?.active&&
     !['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(value.current?.phase),'The original IATI command has not completed its Stop.',{timeoutMs:90000});
   }
   activeApplications.delete(owned.id);
   if(owned.runs.at(-1)){owned.runs.at(-1).finished=true;owned.runs.at(-1).terminal=current.current?.phase??null;}
   owned.stopped=current.current?{operationId:current.current.id,phase:current.current.phase,result:current.current.result}:null;
   await save();
   const output=current.current?await appApi('/api/applications/output?'+new URLSearchParams({applicationId:owned.id,operationId:current.current.id})):null;
   if(output)await publish(join(outputDirectory,'applications-'+owned.name+'-'+current.current.id+'.json'),output);
   return owned.stopped;
  }
  async function runCli(name,workspace,args,{repeat=false}={}){
   const folder=join(outputDirectory,'cli',name);await privateDirectory(folder);
   const request={node:process.execPath,args:[join(installedRoot,SDK+'iati/cli.mjs'),'--python',pythonExecutable,'--workspace',workspace,...args]};
   await publish(join(folder,'request.json'),request,true);
   const done=await json(join(folder,'result.json'));
   if(done&&!repeat){check(done.exitCode===0,'A retained original CLI command failed.');return JSON.parse(await readFile(done.stdout,'utf8'));}
   const attempt=(await readdir(folder)).filter(file=>/^stdout-\d+\.json$/.test(file)).length;
   const stdout=join(folder,'stdout-'+attempt+'.json'),stderr=join(folder,'stderr-'+attempt+'.log');
   const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);let child;
   try{
    child=spawn(request.node,request.args,{shell:false,cwd:outputDirectory,
     env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath},stdio:['ignore',out.fd,err.fd]});
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    await out.sync();await err.sync();
    const receipt={...request,stdout,stderr,exitCode:exit.code,signal:exit.signal,endedAt:new Date().toISOString(),
     stdoutFile:await identity(stdout),stderrFile:await identity(stderr)};
    await publish(join(folder,'attempt-'+attempt+'.json'),receipt);
    check(exit.code===0,'Original IATI CLI failed; its exact stderr is retained at '+stderr);
    await publish(join(folder,'result.json'),receipt);
    return JSON.parse(await readFile(stdout,'utf8'));
   }finally{await out.close();await err.close();}
  }
  const {MerchantSourceWorkspaces,readSourceWorkspaceConfiguration}=await installed(OPERATOR+'source-workspace.mjs');
  const {sourceWorkspaceTools}=await installed(OPERATOR+'catalog/source-workspace.mjs');
  const {createMcpToolHandler,MCP_VERSION}=await installed('stellar-forge/mcp-paid-agent/http-tools.mjs');
  const tools=sourceWorkspaceTools((name,description,properties,required,flags={})=>({
   name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},
   annotations:{readOnlyHint:flags.readOnly===true,idempotentHint:flags.idempotent===true}
  }));
  async function startMcp(){
   const configFile=join(outputDirectory,'mcp','connections.json');
   await publish(configFile,{schema:'stellar-forge.source-workspace-connection.v1',workspaces:{
    source:{format:'iati',label:actor.label.slice(0,120)+' / original publisher refresh',consoleUrlFile:join(outputDirectory,'connections','source.txt')},
    received:{format:'iati',label:actor.label.slice(0,120)+' / received publisher refresh',consoleUrlFile:join(outputDirectory,'connections','received.txt')}
   }},true);
   const sourceWorkspaces=await readSourceWorkspaceConfiguration(configFile);
   const adapter=new MerchantSourceWorkspaces({sourceWorkspaces,exportsDirectory:join(outputDirectory,'mcp')});
   const token=randomBytes(32).toString('hex'),requests=new Set(),sockets=new Set();
   let closing=false,server=null,adapterClosed=false,closePromise=null;
   const close=()=>{
    if(closePromise)return closePromise;
    closePromise=(async()=>{
     closing=true;
     const errors=[];
     const closed=new Promise(resolve=>{
      if(!server?.listening){resolve();return;}
      server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')errors.push(error);resolve();});
     });
     try{
      server?.closeIdleConnections();
      await Promise.allSettled([...requests]);
      if(!adapterClosed){await adapter.close();adapterClosed=true;}
     }catch(error){errors.push(error);}
     finally{
      for(const socket of sockets)socket.destroy();
      server?.closeAllConnections();
      await closed;
     }
     if(errors.length)throw new AggregateError(errors,'The original MCP adapter close needs its retained cleanup continuation.');
    })().finally(()=>{closePromise=null;if(adapterClosed&&!server?.listening&&sockets.size===0)mcpOwners.delete(owner);});
    return closePromise;
   };
   const owner={close};mcpOwners.add(owner);
   try{
    const handler=createMcpToolHandler({tools,call:(name,args)=>adapter.call(name,args)},{
     bearerToken:token,serverName:'Original IATI source receiving',serverVersion:'1.0.0',
     instructions:'Operate the declared original IATI saved-refresh consoles with their exact publisher editions, baseline decisions, requests and complete packets.'
    });
    server=createServer((request,response)=>{
     if(closing){response.writeHead(503);response.end();return;}
     const pending=handler(request,response).catch(error=>{if(!response.headersSent)response.writeHead(500);response.end();});
     requests.add(pending);pending.finally(()=>requests.delete(pending));
    });
    server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    server.requestTimeout=240000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint='http://127.0.0.1:'+server.address().port+'/mcp';
    let next=0;
    const rpc=async(method,params)=>{
     const id=++next;
     const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(240000),
      headers:{authorization:'Bearer '+token,'content-type':'application/json',
       accept:'application/json, text/event-stream','mcp-protocol-version':MCP_VERSION},
      body:JSON.stringify({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})})});
     const envelope=await boundedJson(response);
     check(envelope.id===id&&!envelope.error,'The original MCP response envelope was rejected.');
     if(envelope.result?.isError)throw Object.assign(new Error(envelope.result.structuredContent?.reason??'Original source MCP call failed.'),
      {code:envelope.result.structuredContent?.code??'IATI_MCP'});
     return envelope.result;
    };
    await rpc('initialize',{protocolVersion:MCP_VERSION,capabilities:{},clientInfo:{name:actor.label,version:'1.0.0'}});
    const catalog=(await rpc('tools/list')).tools;
    check(['merchant_source_iati_refresh_plan','merchant_source_iati_refresh_request','merchant_source_iati_refresh_save','merchant_source_iati_refresh_export','merchant_source_file_read'].every(name=>catalog.some(tool=>tool.name===name)),
     'The actual original MCP catalog omitted the IATI operating tools.');
    const missing=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(240000),headers:{'content-type':'application/json'},body:'{}'});
    check(missing.status===401,'The actual source MCP endpoint must require the original bearer token.');await missing.body?.cancel();
    return{adapter,endpoint,call:async(name,args={})=>(await rpc('tools/call',{name,arguments:args})).structuredContent,close};
   }catch(error){
    try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Original MCP startup failed and retained adapter cleanup remains pending.');}
    throw error;
   }
  }
  async function runProcess(name,argv,{repeat=false,acceptedExitCodes=[0]}={}){
   const folder=join(outputDirectory,'processes',name);await privateDirectory(folder);
   await publish(join(folder,'request.json'),{argv},true);
   const done=await json(join(folder,'result.json'));
   if(done&&!repeat){
    check(acceptedExitCodes.includes(done.exitCode),'The retained original process did not finish successfully.');
    return JSON.parse(await readFile(done.stdout,'utf8'));
   }
   const number=(await readdir(folder)).filter(file=>/^stdout-\d+\.json$/.test(file)).length;
   const stdout=join(folder,'stdout-'+number+'.json'),stderr=join(folder,'stderr-'+number+'.log');
   const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
   try{
    const child=spawn(argv[0],argv.slice(1),{shell:false,cwd:outputDirectory,
     env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath},stdio:['ignore',out.fd,err.fd]});
    const ended=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    await out.sync();await err.sync();
    const receipt={argv,exitCode:ended.code,signal:ended.signal,stdout,stderr,
     stdoutFile:await identity(stdout),stderrFile:await identity(stderr),endedAt:new Date().toISOString()};
    await publish(join(folder,'attempt-'+number+'.json'),receipt,true);
    check(acceptedExitCodes.includes(ended.code),'The original process failed; complete output remains at '+folder);
    const result=JSON.parse(await readFile(stdout,'utf8'));
    await publish(join(folder,'result.json'),receipt);
    return result;
   }finally{await out.close();await err.close();}
  }

  async function retainedExport(name,workspace,plan,snapshot){
   let selected=progress.downloads[name];
   if(selected){
    check(selected.workspace===workspace&&selected.plan===plan&&selected.snapshot===snapshot,'The original remote archive selection changed.');
    return selected.metadata;
   }
   const metadata=await mcp.call('merchant_source_iati_refresh_export',{workspace,plan,expectedSnapshot:snapshot});
   check(metadata.workspace===workspace&&metadata.format==='iati'&&metadata.kind==='refresh'&&metadata.plan===plan&&
    metadata.snapshot===snapshot&&SHA.test(metadata.sha256)&&metadata.exportId===metadata.sha256&&
    Number.isSafeInteger(metadata.bytes)&&metadata.bytes>0,'The original MCP export must bind the complete selected refresh journal.');
   progress.downloads[name]={workspace,plan,snapshot,metadata,offset:0,prefixSha256:hash(Buffer.alloc(0))};await save();
   return metadata;
  }
  async function downloadMcp(name,{interrupt=false}={}){
   const selected=progress.downloads[name];check(selected,'Retain the original full archive selection first.');
   const metadata=selected.metadata,path=join(outputDirectory,'downloads','mcp-'+name+'.zip'),partial=path+'.partial';
   if(await exists(path)){
    const actual=await identity(path);check(actual.bytes===metadata.bytes&&actual.sha256===metadata.sha256,'The original completed remote file changed.');
    selected.file={path,...actual};await save();return selected.file;
   }
   const handle=await open(partial,await exists(partial)?'r+':'wx+',0o600);
   let readId=null,offset=selected.offset??0,sha=createHash('sha256');
   try{
    const info=await handle.stat();check(info.isFile()&&info.size>=offset,'The original retained prefix is shorter than its committed offset.');
    if(info.size>offset){await handle.truncate(offset);await handle.sync();}
    const buffer=Buffer.alloc(196608);let position=0;
    while(position<offset){const value=await handle.read(buffer,0,Math.min(buffer.length,offset-position),position);
     check(value.bytesRead>0,'The full retained prefix could not be verified.');sha.update(buffer.subarray(0,value.bytesRead));position+=value.bytesRead;}
    check(sha.copy().digest('hex')===selected.prefixSha256,'The durably retained original file prefix changed.');
    while(offset<metadata.bytes){
     const limit=interrupt&&!selected.interrupted?Math.min(16384,Math.max(1,Math.floor(metadata.bytes/2))):196608;
     const chunk=await mcp.call('merchant_source_file_read',{workspace:selected.workspace,exportId:metadata.exportId,
      ...(readId?{readId}:{}),offset,limit});
     check(chunk.workspace===selected.workspace&&chunk.exportId===metadata.exportId&&chunk.file.sha256===metadata.sha256&&
      chunk.file.bytes===metadata.bytes&&chunk.offset===offset&&chunk.encoding==='base64','The retained file read changed its full source binding.');
     const data=Buffer.from(chunk.data,'base64');
     check(data.length===chunk.bytesRead&&data.length>0&&offset+data.length<=metadata.bytes,'The complete original file range is invalid.');
     let written=0;
     while(written<data.length){const part=await handle.write(data,written,data.length-written,offset+written);
      check(part.bytesWritten>0,'The original native file range could not be written.');written+=part.bytesWritten;}
     await handle.sync();sha.update(data);offset+=data.length;
     check(chunk.nextOffset===(offset===metadata.bytes?null:offset),'The original retained range returned a different continuation.');
     readId=chunk.nextOffset===null?null:chunk.readId;
     selected.offset=offset;selected.prefixSha256=sha.copy().digest('hex');await save();
     if(interrupt&&!selected.interrupted&&offset<metadata.bytes){
      if(readId){await mcp.call('merchant_source_file_release',{workspace:selected.workspace,readId});readId=null;}
      await mcp.close();mcp=null;selected.interrupted={offset,prefixSha256:selected.prefixSha256,at:new Date().toISOString()};await save();
      mcp=await startMcp();
     }
    }
   }finally{
    await handle.close();
    if(readId&&mcp)await mcp.call('merchant_source_file_release',{workspace:selected.workspace,readId}).catch(()=>{});
   }
   const actual=await identity(partial);check(actual.bytes===metadata.bytes&&actual.sha256===metadata.sha256,'The full remote file does not match its original SHA-256.');
   await rename(partial,path);await syncDirectory(dirname(path));selected.file={path,...actual};await save();return selected.file;
  }
  async function saveResponse(name,response){
   check(response.ok,'The authenticated original full download failed.');
   const destination=join(outputDirectory,'downloads',name),temporary=destination+'.partial-'+randomUUID();
   const handle=await open(temporary,'wx',0o600);let bytes=0;
   const length=response.headers.get('content-length'),declared=length&&/^\d+$/.test(length)?Number(length):null;
   try{for await(const chunk of response.body??[]){bytes+=chunk.length;check(bytes<=4*1024*1024*1024,'The full original packet exceeds its native limit.');await handle.writeFile(chunk);}await handle.sync();}
   finally{await handle.close();}
   check(declared===null||declared===bytes,'The original packet ended before its declared complete byte count.');
   if(await exists(destination))await rename(destination,destination+'.retained-'+randomUUID());
   await rename(temporary,destination);await syncDirectory(dirname(destination));
   return{path:destination,...await identity(destination)};
  }
  async function pageAll(read,name){
   const items=[],pages=[];let offset=0,snapshot,total;
   for(;;){
    const value=await read({offset,limit:2,...(snapshot?{snapshot}:{})});
    check(value&&Array.isArray(value.items)&&value.offset===offset&&SHA.test(value.snapshot)&&Number.isSafeInteger(value.total)&&
     value.total>=0&&(!snapshot||value.snapshot===snapshot&&value.total===total),'The complete saved history page lost its selected snapshot.');
    snapshot=value.snapshot;total=value.total;items.push(...value.items);pages.push(value);
    if(value.nextOffset===null){check(items.length===total,'The full saved history is incomplete.');break;}
    check(value.nextOffset===offset+value.items.length&&value.nextOffset>offset&&value.nextOffset<total,'The original saved page continuation is invalid.');
    offset=value.nextOffset;
   }
   const value={snapshot,total,items,pages};await publish(join(outputDirectory,'reads',name+'.json'),value);
   return value;
  }
  const nativeValue=value=>{
   check(plain(value)&&value.format==='iati'&&Object.hasOwn(value,'native'),'Retain the original IATI MCP native response envelope.');
   return value.native;
  };
  async function readPlan(client,workspace,plan,label){
   const status=await client.refreshStatus(plan),nativeStatus=nativeValue(await mcp.call('merchant_source_iati_refresh_status',{workspace,plan}));
   check(same(status,nativeStatus)&&status.plan.id===plan,'The named client and MCP selected different original refresh work.');
   const history=await pageAll(value=>client.refreshHistory(plan,value),label+'-typed-plan-history');
   const runs=await pageAll(value=>client.refreshRuns(plan,value),label+'-typed-runs');
   const remoteHistory=await pageAll(value=>mcp.call('merchant_source_iati_refresh_history',{workspace,plan,offset:value.offset,limit:value.limit,
    ...(value.snapshot?{expectedSnapshot:value.snapshot}:{})}).then(nativeValue),label+'-mcp-plan-history');
   const remoteRuns=await pageAll(value=>mcp.call('merchant_source_iati_refresh_runs',{workspace,plan,offset:value.offset,limit:value.limit,
    ...(value.snapshot?{expectedSnapshot:value.snapshot}:{})}).then(nativeValue),label+'-mcp-runs');
   check(same(history,remoteHistory)&&same(runs,remoteRuns),'The full typed/MCP original history differs.');
   for(const original of history.items){
    check(same(await client.refreshPlan(plan,{revision:original.revision}),original),'The original historical plan changed.');
    check(same(nativeValue(await mcp.call('merchant_source_iati_refresh_plan',{workspace,plan,revision:original.revision})),original),'MCP selected a different historical plan.');
   }
   for(const run of runs.items){
    const versions=await pageAll(value=>client.refreshRunHistory(plan,run.id,value),label+'-run-'+run.id);
    for(const saved of versions.items){
     check(same(await client.refreshRun(plan,run.id,{revision:saved.revision}),saved),'The original historical run changed.');
     check(same(nativeValue(await mcp.call('merchant_source_iati_refresh_run',{workspace,plan,run:run.id,revision:saved.revision})),saved),'MCP changed a historical run.');
    }
   }
   await publish(join(outputDirectory,'reads',label+'-status.json'),status);
   return{status,history,runs};
  }
  async function inspectPacket(name,packet){
   const selected={path:packet.path,bytes:packet.bytes,sha256:packet.sha256};
   const input=join(outputDirectory,'packet',name+'-input.json');
   await publish(input,{mode:'inspect',packet:selected,outputDirectory:join(outputDirectory,'packet',name)},true);
   return runProcess('inspect-'+name,[pythonExecutable,'-B',join(installedRoot,SDK+'iati/receiving/refresh_archive.py'),'--input',input]);
  }
  async function verifyPacket(name,packet,plan,snapshot){
   const inspected=await inspectPacket(name,packet);
   check(inspected.plan===plan&&inspected.snapshot===snapshot,'The complete returned packet selected a different original plan/journal.');
   return inspected;
  }
  async function idle(page){
   await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false',{},{timeout:900000});
   const message=await page.locator('#status').textContent();
   check(!await page.locator('#status').evaluate(el=>el.classList.contains('error')),message);
  }
  async function openRefresh(page,plan){
   await page.locator('#rf-open-view').click();await idle(page);
   await page.locator('[data-panel="refresh"]').waitFor({state:'visible'});
   if(plan){await page.locator('#rf-plan-select').selectOption(plan);await page.locator('#rf-plan-open').click();await idle(page);}
  }
  async function tab(page,name){await page.locator('[data-rf-tab="'+name+'"]').click();await page.locator('[data-rf-panel="'+name+'"]').waitFor({state:'visible'});}
  async function viewReceipt(page,receipt,name,width){
   await page.setViewportSize({width,height:940});await idle(page);
   const path=join(outputDirectory,'views',name+'-'+width+'-'+randomUUID()+'.png');
   await page.screenshot({path,fullPage:true});
   const visible=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    panel:document.querySelector('[data-panel]:not([hidden])')?.dataset.panel,title:document.title}));
   check(visible.documentWidth<=width+1&&visible.bodyWidth<=width+1,'The complete refresh view overflows its selected viewport.');
   const item={path,...await identity(path),...visible};receipt.views.push(item);return item;
  }
  async function browserAction(page,client,name,route,prepare,checkInput){
   const requestPath=join(outputDirectory,'actions',name+'-request.json'),resultPath=join(outputDirectory,'actions',name+'-result.json');
   let selected=await json(requestPath),saved=await json(resultPath);
   const validate=value=>{
    check(value?.schema==='stellar-forge.iati-refresh-browser-request.v1'&&value.name===name&&value.route===route&&
     value.workspace===receivedDirectory&&value.workspaceSha256===progress.receivedContext&&plain(value.input)&&
     typeof value.input.requestId==='string','The retained browser action belongs to another original selection.');
    checkInput(value.input);return value;
   };
   if(selected){
    validate(selected);
    const record=await client.refreshRequest(selected.input.requestId);
    check(record.requestId===selected.input.requestId,'The native action lookup changed the original request.');
    if(record.state!=='NOT_RECORDED')check(record.kind===route&&same(record.input,selected.input),'The saved native action changed its complete selected input.');
    const value=record.state==='NOT_RECORDED'?await client.refreshSave(route,selected.input):
     record.state==='PREPARED'?await client.refreshResume(selected.input.requestId):
     record.state==='COMPLETE'?record.result:null;
    check(value?.state==='COMPLETE'&&value.requestId===selected.input.requestId,'The original browser action did not complete through its exact request.');
    if(saved)check(same(saved,value),'The saved browser action result changed.');else await publish(resultPath,value,true);
    return value;
   }
   check(!saved,'A result exists without its original complete browser request.');
   const url=new URL('/api/iati/refresh/'+route,client.origin).href;
   let captured=null,rejectIntercept;
   const failedIntercept=observed(new Promise((_,reject)=>{rejectIntercept=reject;}));
   const handler=async binding=>{
    try{
     const request=binding.request();check(request.method()==='POST','Retain the original browser POST.');
     const input=JSON.parse(request.postData()??'null');checkInput(input);
     const value={schema:'stellar-forge.iati-refresh-browser-request.v1',name,route,workspace:receivedDirectory,
      workspaceSha256:progress.receivedContext,input};
     validate(value);await publish(requestPath,value,true);captured=value;await binding.continue();
    }catch(error){await binding.abort().catch(()=>{});rejectIntercept(error);}
   };
   await page.route(url,handler);
   try{
    const returned=observed(page.waitForResponse(response=>response.url()===url&&response.request().method()==='POST',{timeout:900000}));
    await prepare();const response=await Promise.race([returned,failedIntercept]);
    check(response.ok(),'The original browser action was rejected; retain its exact request before correction.');
    const value=await response.json();selected=validate(await json(requestPath));
    check(captured&&same(selected,captured)&&value.state==='COMPLETE'&&value.requestId===selected.input.requestId&&value.action===route,
     'The browser returned a different original saved action.');
    await publish(resultPath,value,true);await idle(page);
    const record=await client.refreshRequest(selected.input.requestId);
    check(record.state==='COMPLETE'&&same(record.input,selected.input)&&same(record.result,value),'The original browser result was not durably recorded.');
    return value;
   }finally{await page.unroute(url,handler);}
  }
  async function browserDownload(page,name,plan,snapshot){
   const responsePromise=observed(page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iati/refresh/export'&&response.request().method()==='GET',{timeout:900000}));
   const downloadPromise=observed(page.waitForEvent('download',{timeout:900000}));
   await page.locator('#rf-export').click();const response=await responsePromise,download=await downloadPromise;
   check(response.ok(),'The original complete browser packet failed.');
   const path=join(outputDirectory,'downloads',name+'-'+randomUUID()+'.zip');await download.saveAs(path);await idle(page);
   const packet={path,...await identity(path)};await verifyPacket(name+'-'+packet.sha256.slice(0,12),packet,plan,snapshot);
   return packet;
  }
  async function verifySummary(summary){
   check(summary?.schema===SCHEMA&&summary.operationId===operationId&&same(summary.actor,actor)&&summary.selectionSha256===hash(encode(selection))&&
    summary.core.operationId===core.operationId&&summary.core.planId===planId&&same(summary.runtime,runtimeBinding(runtime))&&
    summary.source.directory===directory&&summary.received.directory===receivedDirectory&&summary.ui.plan.id!==planId&&
    summary.ui.run.state==='PROMOTED'&&summary.browser.errors.length===0&&summary.applications.length===2&&
    summary.applications.every(row=>row.phase==='STOPPED'),'The completed summary must bind the whole original refreshed source and stopped operators.');
   const rows=new Map();
   const walk=value=>{if(Array.isArray(value)){for(const item of value)walk(item);return;}if(!plain(value))return;
    if(typeof value.path==='string'&&Number.isSafeInteger(value.bytes)&&SHA.test(value.sha256))rows.set(value.path,value);
    for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);};
   walk(summary);
   for(const item of rows.values()){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A retained complete workflow artifact changed.');}
   return summary;
  }
  async function completeBundle(summary){
   const input=join(outputDirectory,'packet','complete-bundle-input.json'),summaryFile=join(outputDirectory,'packet','receiving-summary.json');
   let selected=await json(input);
   if(selected){check(selected.operationId===operationId&&selected.selectionSha256===hash(encode(selection)),'The original complete bundle selection changed.');
    summary=await verifySummary(selected.summary);}
   else{
    summary=await verifySummary(summary);const files=[],names=new Set();
    const add=async(name,path)=>{check(!names.has(name)&&!name.startsWith('/')&&!name.split('/').some(x=>!x||x==='.'||x==='..'),'Keep every complete member once.');
     names.add(name);const row=await identity(path);files.push({name,path,bytes:row.bytes,sha256:row.sha256});};
    await add('customer/IATI_Original_Model_Receiving.zip',corePacket.path);
    await add('publisher/before.xml',coreConfig.before.path);await add('publisher/after.xml',coreConfig.after.path);
    await add('inputs/core-input.json',coreInputFile);await add('inputs/operator-selection.json',join(outputDirectory,'selection.json'));
    await add('receiving/core/result.json',join(coreOutput,'result.json'));
    for(const row of core.files)await add('receiving/core/files/'+row.path,join(coreOutput,row.path));
    for(const folder of ['reads','actions'])for(const name of (await readdir(join(outputDirectory,folder))).sort())
     if(name.endsWith('.json'))await add('receiving/'+folder+'/'+name,join(outputDirectory,folder,name));
    for(const name of (await readdir(join(outputDirectory,'cli'))).sort()){
     const folder=join(outputDirectory,'cli',name),receipt=await json(join(folder,'result.json'));
     if(receipt){await add('receiving/cli/'+name+'/request.json',join(folder,'request.json'));await add('receiving/cli/'+name+'/stdout.json',receipt.stdout);}
    }
    for(const name of (await readdir(join(outputDirectory,'downloads'))).sort()){
     const path=join(outputDirectory,'downloads',name),info=await lstat(path);
     if(info.isFile()&&name.endsWith('.zip'))await add('receiving/downloads/'+name,path);
    }
    for(const name of ['REFRESH.md','OPERATIONS.md','DOMAIN.md','receiving/REFRESH.md','receiving/RUNTIME.md'])
     await add('guides/'+name,join(installedRoot,SDK+'iati',name));
    for(const name of ['receiving/refresh.py','receiving/refresh.mjs','receiving/refresh_archive.py'])
     await add('operator/'+name,join(installedRoot,SDK+'iati',name));
    const bytes=encode(summary);files.push({name:'receiving/summary.json',path:summaryFile,bytes:bytes.length,sha256:hash(bytes)});
    selected={mode:'bundle',output:join(outputDirectory,'IATI_Publisher_Refresh_Complete_Operator.zip'),
     operationId,selectionSha256:hash(encode(selection)),summary,files};
    await publish(input,selected,true);
   }
   await publish(summaryFile,selected.summary,true);
   for(const row of selected.files){const actual=await identity(row.path);check(actual.bytes===row.bytes&&actual.sha256===row.sha256,'The complete selected customer file changed.');}
   const bundle=await runProcess('complete-customer-bundle',[pythonExecutable,'-B',join(installedRoot,SDK+'iati/receiving/refresh_archive.py'),'--input',input]);
   const actual=await identity(bundle.path);check(actual.bytes===bundle.bytes&&actual.sha256===bundle.sha256,'The complete customer archive differs from its original result.');
   const fileMap=new Map();
   for(const row of [...selected.files,bundle,{path:input},{path:join(coreOutput,'result.json')}])
    fileMap.set(row.path,{path:row.path,...await identity(row.path)});
   const outcome={...selected.summary,state:'COMPLETE',customerHandover:bundle,files:[...fileMap.values()],completedAt:new Date().toISOString()};
   const prior=await json(join(outputDirectory,'completed-workflow.json'));
   if(prior){check(prior.selectionSha256===outcome.selectionSha256&&same(prior.customerHandover,bundle),'The retained complete customer result changed.');return prior;}
   await publish(join(outputDirectory,'completed-workflow.json'),outcome,true);return outcome;
  }

  const completed=await json(join(outputDirectory,'completed-workflow.json'));
  if(completed){
   check(completed.state==='COMPLETE'&&completed.selectionSha256===hash(encode(selection)),'The retained complete workflow belongs to another source.');
   for(const item of completed.files){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete customer file changed before final cleanup.');}
   result=completed;
  }else if(await exists(join(outputDirectory,'packet','complete-bundle-input.json'))){
   result=await completeBundle();
  }else{
   const applicationsDirectory=join(outputDirectory,'applications');
   if(!await json(join(applicationsDirectory,'workspace.json'))){
    if(await exists(applicationsDirectory))await rename(applicationsDirectory,join(outputDirectory,'attempts','unpublished-applications-'+randomUUID()));
    await createRuntimeWorkspace({directory:applicationsDirectory});
   }
   appsModel=await openRuntimeWorkspace({directory:applicationsDirectory});
   appsServer=await startRuntimeWorkspace({directory:applicationsDirectory,port:0});
   const appsUrl=new URL(appsServer.url),appsToken=appsUrl.hash.slice(1);
   appApi=async(path,value)=>{
    const response=await fetch(appsUrl.origin+path,{method:value===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(240000),
     headers:{'x-runtime-workspace-token':appsToken,...(value===undefined?{}:{origin:appsUrl.origin,'content-type':'application/json'})},
     ...(value===undefined?{}:{body:JSON.stringify(value)})});
    return boundedJson(response);
   };
   const unauthenticated=await fetch(appsUrl.origin+'/api/applications/state');
   check(unauthenticated.status===401,'The original Applications interface must remain authenticated.');await unauthenticated.body?.cancel();
   attached=await appApi('/api/attach',{directory:runtimeDirectory,label:'Selected saved publisher refresh runtime'});
   check(attached.status==='READY','The actual installed Applications runtime must remain READY.');
   for(const owned of Object.values(progress.applications)){
    if(owned.id){const current=await appState(owned.id);
     if(current?.current&&(current.current.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)))await stopApplication(owned);}
   }
   const originalInspection=await verifyPacket('core-original',originalPacket,planId,
    (await json(join(coreOutput,'observations','source-archive.json'))).snapshot);
   const receivedInspection=await verifyPacket('core-received',originalReceivedPacket,planId,
    (await json(join(coreOutput,'observations','received-archive.json'))).snapshot);
   const sourceOwned=await setupApplication('source',directory),sourceOpened=await startApplication(sourceOwned);
   sourceClient=sourceOpened.client;mcp=await startMcp();
   const source=await readPlan(sourceClient,'source',planId,'source');
   check(source.status.pendingRequest?.requestId===core.pendingRequestId&&same(source.status.plan.baseline,core.baseline),
    'The original source must retain its exact pending request and reviewed baseline.');
   const sourceRequest=await sourceClient.refreshRequest(core.pendingRequestId);
   check(same(sourceRequest,nativeValue(await mcp.call('merchant_source_iati_refresh_request',{workspace:'source',requestId:core.pendingRequestId})))&&
    sourceRequest.state==='PREPARED','The full source pending request changed across the named interfaces.');
   await publish(join(outputDirectory,'reads','source-pending-request.json'),sourceRequest);
   await retainedExport('source-original','source',planId,source.status.snapshot);
   const sourceDownload=await downloadMcp('source-original',{interrupt:true});
   await verifyPacket('source-remote',sourceDownload,planId,source.status.snapshot);
   const typedSource=await saveResponse('typed-source-original.zip',await sourceClient.refreshExport(planId,{snapshot:source.status.snapshot}));
   await verifyPacket('source-typed',typedSource,planId,source.status.snapshot);
   await sourceClient.dispose();sourceClient=null;await mcp.close();mcp=null;await stopApplication(sourceOwned);
   const cliSource=await runCli('source-original-status',directory,['refresh-status','--plan',planId]);
   check(same(cliSource,source.status),'The original CLI source reopened a different pending refresh state.');
   const cliSourcePath=join(outputDirectory,'downloads','cli-source-original.zip');
   const cliSourceExport=await runCli('source-original-export',directory,
    ['refresh-export','--plan',planId,'--snapshot',source.status.snapshot,'--out',cliSourcePath]);
   const cliSourceFile={path:cliSourcePath,...await identity(cliSourcePath)};
   check(cliSourceExport.sha256===cliSourceFile.sha256&&cliSourceExport.bytes===cliSourceFile.bytes,'The complete original CLI export changed.');
   await verifyPacket('source-cli',cliSourceFile,planId,source.status.snapshot);
   const receivedOwned=await setupApplication('received',receivedDirectory),receivedOpened=await startApplication(receivedOwned);
   receivedClient=receivedOpened.client;mcp=await startMcp();
   const receivedBefore=await readPlan(receivedClient,'received',planId,'received-before-ui');
   check(receivedBefore.status.pendingRequest===null&&same(receivedBefore.status.plan.baseline,core.baseline),
    'Independent receiving must preserve the reviewed original baseline and its completed next request.');
   const pendingReceived=await receivedClient.refreshRequest(core.pendingRequestId);
   check(pendingReceived.state==='COMPLETE'&&same(pendingReceived.input,sourceRequest.input),
    'Independent receiving must complete the same original pending request.');
   const context=await receivedClient.refreshContext();
   if(progress.receivedContext)check(progress.receivedContext===context.workspaceSha256,'The selected received workspace changed.');
   else{progress.receivedContext=context.workspaceSha256;await save();}
   const loaded=await import(pathToFileURL(playwrightModule).href),chromium=loaded.chromium??loaded.default?.chromium;
   check(chromium,'Use the actual existing Playwright Chromium module.');
   browser=await chromium.launch({executablePath:chromiumExecutable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
   const opened=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
    consoleUrl:receivedOpened.url,outputDirectory:join(outputDirectory,'views'),name:'refresh-received-'+randomUUID()});
   contexts.add(opened.context);const page=opened.page,receipt=opened.receipt;
   page.on('response',response=>{const url=new URL(response.url());if(url.origin===receivedClient.origin&&
    ['/refresh.js','/refresh.css'].includes(url.pathname)&&response.status()!==200)receipt.assetErrors.push({path:url.pathname,status:response.status()});});
   await openRefresh(page,planId);
   await viewReceipt(page,receipt,'received-original-plan',1360);
   await viewReceipt(page,receipt,'received-original-plan',390);
   const initialBaseline=await json(join(coreOutput,'actions','baseline-result.json'));
   check(initialBaseline.id===core.baseline.id&&initialBaseline.review.status==='reviewed','Retain the actual earlier reviewed publisher baseline for the browser plan.');
   const uiName='Publisher refresh receiving '+operationId;
   const created=await browserAction(page,receivedClient,'plan-create','plan-save',async()=>{
    await page.locator('#rf-plan-new').click();await idle(page);
    await page.locator('#rf-actor').fill(coreConfig.actor);
    await page.locator('#rf-create-portfolio').selectOption(initialBaseline.id);
    await page.locator('#rf-create-revision').fill(String(initialBaseline.revision));
    await page.locator('#rf-load-baseline').click();await idle(page);
    await page.locator('#rf-plan-name').fill(uiName);
    await page.locator('#rf-plan-note').fill('Complete original browser selection; retains the earlier reviewed publisher edition explicitly.');
    await page.locator('#rf-plan-save').click();
   },input=>check(input.name===uiName&&input.owner===coreConfig.actor&&input.portfolioId===initialBaseline.id&&
    input.baselineRevision===initialBaseline.revision&&input.state==='ACTIVE','The actual browser plan changed its original reviewed baseline.'));
   const uiPlanId=created.plan.id;
   check(uiPlanId!==planId,'Keep the original core plan separate from the browser-created plan.');
   await openRefresh(page,uiPlanId);
   const started=await browserAction(page,receivedClient,'candidate-start','start',async()=>{
    await tab(page,'prepare');await page.locator('#rf-actor').fill(coreConfig.actor);
    await page.locator('#rf-pairs select[data-before="'+coreConfig.before.sha256+'"]').selectOption(coreConfig.after.sha256);
    if(coreConfig.nextSelection!==undefined){
     await page.locator('#rf-change-selection').check();
     for(const [selector,key]of [['rf-activity-ids','activityIds'],['rf-currencies','currencies'],['rf-transaction-types','transactionTypes'],['rf-budget-types','budgetTypes']])
      await page.locator('#'+selector).fill((coreConfig.nextSelection[key]??[]).join('\n'));
     await page.locator('#rf-date-from').fill(coreConfig.nextSelection.dateFrom??'');
     await page.locator('#rf-date-to').fill(coreConfig.nextSelection.dateTo??'');
    }
    await page.locator('#rf-selection-note').fill(coreConfig.selectionNote??'');
    await page.locator('#rf-source-note').fill(coreConfig.sourceChangeNote??'');
    await page.locator('#rf-run-label').fill('Complete original browser publisher selection');
    await page.locator('#rf-run-note').fill('Explicit original publisher pairing; unchanged source bytes remain an unchanged observation.');
    const response=observed(page.waitForResponse(value=>new URL(value.url()).pathname==='/api/iati/refresh/preview'&&value.request().method()==='POST',{timeout:900000}));
    await page.locator('#rf-preview').click();const selected=await response;check(selected.ok(),'The original preview rejected its source selection.');
    const preview=await selected.json();await publish(join(outputDirectory,'reads','browser-preview.json'),preview);await idle(page);
    check(preview.planId===uiPlanId&&preview.sources.length===1&&preview.sources[0]===coreConfig.after.sha256,'The complete browser preview selected another publisher.');
    await viewReceipt(page,receipt,'publisher-pair-preview',1360);await page.locator('#rf-start').click();
   },input=>check(input.planId===uiPlanId&&input.actor===coreConfig.actor&&same(input.sources,[coreConfig.after.sha256])&&
    same(input.pairs,coreConfig.before.sha256===coreConfig.after.sha256?[]:[{before:coreConfig.before.sha256,after:coreConfig.after.sha256}])&&
    SHA.test(input.previewSha256),'The actual browser run lost its explicit original publisher pair.'));
   await openRefresh(page,uiPlanId);
   await page.locator('#rf-run-select').selectOption(started.run.id);await page.locator('#rf-run-revision').fill('');
   await page.locator('#rf-run-open').click();await idle(page);await tab(page,'review');
   const reviewed=await browserAction(page,receivedClient,'candidate-review','review',async()=>{
    await page.locator('#rf-actor').fill(coreConfig.reviewer);
    await page.locator('#rf-review-status').selectOption('reviewed');
    await page.locator('#rf-review-note').fill(coreConfig.reviewNote);
    await page.locator('#rf-review-save').click();
   },input=>check(input.planId===uiPlanId&&input.runId===started.run.id&&input.expectedRevision===started.run.revision&&
    same(input.review,{status:'reviewed',reviewer:coreConfig.reviewer,note:coreConfig.reviewNote}),
    'The actual browser review changed its original run or named decision.'));
   await openRefresh(page,uiPlanId);await page.locator('#rf-run-select').selectOption(started.run.id);
   await page.locator('#rf-run-revision').fill('');await page.locator('#rf-run-open').click();await idle(page);await tab(page,'review');
   const promoted=await browserAction(page,receivedClient,'baseline-promote','promote',async()=>{
    await page.locator('#rf-actor').fill(coreConfig.actor);await page.locator('#rf-promote-note').fill(coreConfig.promotionNote);
    await page.locator('#rf-promote').click();
   },input=>check(input.planId===uiPlanId&&input.runId===started.run.id&&input.expectedRevision===reviewed.run.revision&&
    input.expectedPlanRevision===created.plan.revision&&input.actor===coreConfig.actor&&input.note===coreConfig.promotionNote,
    'The actual browser promotion changed its explicit reviewed baseline decision.'));
   check(promoted.run.state==='PROMOTED'&&same(promoted.plan.baseline,reviewed.run.candidate),'The browser must promote only the exact reviewed candidate.');
   await openRefresh(page,uiPlanId);await page.locator('#rf-run-select').selectOption(promoted.run.id);
   await page.locator('#rf-run-revision').fill('');await page.locator('#rf-run-open').click();await idle(page);await tab(page,'review');
   await viewReceipt(page,receipt,'reviewed-promoted-run',1360);await viewReceipt(page,receipt,'reviewed-promoted-run',390);
   const beforeOld=await receivedClient.refreshStatus(planId),uiBeforeOld=await receivedClient.refreshStatus(uiPlanId);
   await openRefresh(page,planId);await tab(page,'handover');
   await page.locator('#rf-receive-file').setInputFiles(originalPacket.path);
   const receiveResponse=observed(page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iati/refresh/receive'&&response.request().method()==='POST',{timeout:900000}));
   await page.locator('#rf-receive-form button[type="submit"]').click();const actualReceive=await receiveResponse;
   check(actualReceive.ok(),'The original complete browser receive failed.');
   const oldReceive=await actualReceive.json();await idle(page);
   check(oldReceive.schema==='stellar-forge.iati-refresh-receiving.v1'&&oldReceive.plan.id===planId&&oldReceive.currentPlan.id===planId&&
    oldReceive.reused&&same(await receivedClient.refreshStatus(planId),beforeOld)&&same(await receivedClient.refreshStatus(uiPlanId),uiBeforeOld),
    'Receiving an older complete packet must preserve all later local plan and native history.');
   await publish(join(outputDirectory,'reads','browser-older-receive.json'),oldReceive);
   check((await page.locator('#rf-receive-result').textContent()).includes(oldReceive.currentSnapshot),'The actual receiving view omitted the preserved current journal identity.');
   await viewReceipt(page,receipt,'older-packet-preserves-current',1360);await viewReceipt(page,receipt,'older-packet-preserves-current',390);
   await openRefresh(page,uiPlanId);await tab(page,'handover');
   const uiStatus=await receivedClient.refreshStatus(uiPlanId);
   const browserPacket=await browserDownload(page,'browser-promoted-refresh',uiPlanId,uiStatus.snapshot);
   await opened.context.close();contexts.delete(opened.context);
   const ui=await readPlan(receivedClient,'received',uiPlanId,'browser-created');
   const receivedAfter=await readPlan(receivedClient,'received',planId,'received-final');
   await retainedExport('received-original','received',planId,receivedAfter.status.snapshot);
   const receivedDownload=await downloadMcp('received-original');await verifyPacket('received-remote',receivedDownload,planId,receivedAfter.status.snapshot);
   await retainedExport('received-promoted','received',uiPlanId,ui.status.snapshot);
   const uiDownload=await downloadMcp('received-promoted');await verifyPacket('ui-remote',uiDownload,uiPlanId,ui.status.snapshot);
   const typedReceived=await saveResponse('typed-received-promoted.zip',await receivedClient.refreshExport(uiPlanId,{snapshot:ui.status.snapshot}));
   await verifyPacket('ui-typed',typedReceived,uiPlanId,ui.status.snapshot);
   await receivedClient.dispose();receivedClient=null;await mcp.close();mcp=null;await stopApplication(receivedOwned);
   const cliReceivedStatus=await runCli('received-final-status',receivedDirectory,['refresh-status','--plan',planId]);
   const cliUiStatus=await runCli('ui-final-status',receivedDirectory,['refresh-status','--plan',uiPlanId]);
   check(same(cliReceivedStatus,receivedAfter.status)&&same(cliUiStatus,ui.status),'Original CLI reopen changed the later received work.');
   const cliUiPath=join(outputDirectory,'downloads','cli-ui-promoted.zip');
   const cliUiExport=await runCli('ui-complete-export',receivedDirectory,['refresh-export','--plan',uiPlanId,'--snapshot',ui.status.snapshot,'--out',cliUiPath]);
   const cliUiFile={path:cliUiPath,...await identity(cliUiPath)};
   check(cliUiFile.sha256===cliUiExport.sha256&&cliUiFile.bytes===cliUiExport.bytes,'The complete original CLI browser-plan export changed.');
   await verifyPacket('ui-cli',cliUiFile,uiPlanId,ui.status.snapshot);
   const reopened=await startApplication(receivedOwned);receivedClient=reopened.client;
   check(same(await receivedClient.refreshStatus(planId),receivedAfter.status)&&same(await receivedClient.refreshStatus(uiPlanId),ui.status),
    'The same saved Application did not reopen both complete original plan histories.');
   const reopenedPage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
    consoleUrl:reopened.url,outputDirectory:join(outputDirectory,'views'),name:'refresh-reopened-'+randomUUID()});
   contexts.add(reopenedPage.context);await openRefresh(reopenedPage.page,uiPlanId);await tab(reopenedPage.page,'handover');
   await reopenedPage.page.locator('#rf-history-load').click();await idle(reopenedPage.page);
   await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-complete-history',1360);
   await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-complete-history',390);
   await reopenedPage.context.close();contexts.delete(reopenedPage.context);
   await receivedClient.dispose();receivedClient=null;await stopApplication(receivedOwned);
   const apps=(await appApi('/api/applications/state?historyLimit=30')).applications.filter(row=>[sourceOwned.id,receivedOwned.id].includes(row.id));
   check(apps.length===2&&apps.every(row=>row.phase==='STOPPED'),'Both original Applications must finish Stop before delivery.');
   const receipts=[receipt,reopenedPage.receipt],errors=receipts.flatMap(value=>[...value.pageErrors,...value.consoleErrors,...value.assetErrors]);
   check(errors.length===0,'The complete refresh browser produced an actual error; retain the private QA evidence.');
   const summary={schema:SCHEMA,operationId,actor,selectionSha256:hash(encode(selection)),runtime:runtimeBinding(runtime),
    core:{operationId:core.operationId,planId,promotedRunId:core.promotedRunId,baseline:core.baseline,
     result:{path:join(coreOutput,'result.json'),...await identity(join(coreOutput,'result.json'))},customerHandover:corePacket},
    source:{directory,status:source.status,pendingRequest:sourceRequest,archive:originalPacket},
    received:{directory:receivedDirectory,status:receivedAfter.status,originalArchive:originalReceivedPacket,olderPacketReceive:oldReceive},
    ui:{plan:promoted.plan,run:promoted.run,review:reviewed.run.review,history:ui.history.items,status:ui.status},
    downloads:{source:sourceDownload,sourceTyped:typedSource,sourceCli:cliSourceFile,received:receivedDownload,
     promoted:uiDownload,promotedTyped:typedReceived,promotedCli:cliUiFile,browser:browserPacket,
     interruption:progress.downloads['source-original'].interrupted},
    browser:{errors,views:receipts.flatMap(row=>row.views)},
    applications:apps.map(row=>({id:row.id,label:row.label,phase:row.phase,revision:row.revision,totalRuns:row.totalRuns}))};
   result=await completeBundle(summary);
  }
 }catch(error){
  failure=error;
  if(progress)await publish(join(outputDirectory,'error-'+Date.now()+'.json'),
   {schema:SCHEMA,operationId,error:errorValue(error),stages:Object.keys(progress.stages),at:new Date().toISOString()}).catch(()=>{});
 }finally{
  const cleanup=[];
  for(const context of contexts)try{await context.close();}catch(error){cleanup.push(errorValue(error));}
  for(const client of[sourceClient,receivedClient])if(client)try{await client.dispose();}catch(error){cleanup.push(errorValue(error));}
  for(const owned of [...mcpOwners])try{await owned.close();}catch(error){cleanup.push(errorValue(error));}
  if(appApi)for(const owned of Object.values(progress?.applications??{})){
   if(!owned.id)continue;
   let selectedOperation=activeApplications.get(owned.id)??owned.runs.at(-1)?.operationId;
   try{
    const state=await appApi('/api/applications/state?historyLimit=1');
    const current=state.applications.find(item=>item.id===owned.id)?.current;
    if(!current||!current.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.phase))continue;
    selectedOperation=current.id;
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId:selectedOperation});
    await until(()=>appApi('/api/applications/state?historyLimit=1'),value=>{
     const app=value.applications.find(item=>item.id===owned.id);
     return app&&!app.current?.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(app.current?.phase);
    },'The original publisher refresh Application is still finishing its Stop.',{timeoutMs:90000});
   }catch(error){cleanup.push({applicationId:owned.id,operationId:selectedOperation,...errorValue(error)});}
  }
  if(browser)try{await browser.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsServer)try{await appsServer.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsModel)try{await appsModel.close();}catch(error){cleanup.push(errorValue(error));}
  if(cleanup.length){
   await publish(join(outputDirectory,'cleanup-'+Date.now()+'.json'),cleanup).catch(()=>{});
   failure??=Object.assign(new Error('The original publisher refresh receiving cleanup remains pending in its retained records.'),{code:'IATI_RECEIVING_CLEANUP'});
  }
  try{if(result&&!failure)await publish(join(outputDirectory,'result.json'),result,true);}
  finally{await lease.close();}
 }
 if(failure)throw failure;
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length===3&&['--help','-h','help'].includes(process.argv[2])){
   process.stdout.write('node refresh.mjs --input /absolute/operator-input.json --runtime-ready /absolute/original-runtime-ready.json\n');
  }else{
   const args=process.argv.slice(2),allowed=new Set(['--input','--runtime-ready']),selected={};
   check(args.length===4,'Pass the complete original operator configuration and actual runtime READY result.');
   for(let index=0;index<args.length;index+=2){
    check(allowed.has(args[index])&&!selected[args[index]]&&typeof args[index+1]==='string'&&
     isAbsolute(args[index+1])&&resolve(args[index+1])===args[index+1],'Pass each original input file once.');
    selected[args[index]]=args[index+1];
   }
   const configuration=await json(selected['--input']),runtime=await json(selected['--runtime-ready']);
   check(plain(configuration)&&Object.keys(configuration).every(key=>
    ['coreInputFile','outputDirectory','operationId','actor','pythonExecutable','chromiumExecutable','playwrightModule'].includes(key)),
    'Retain the complete caller-owned original operator configuration.');
   check(runtime?.state==='READY'&&typeof runtime.sourceRoot==='string'&&typeof runtime.runtimeDirectory==='string'&&
    /^[0-9a-f]{40}$/.test(runtime.sourceCommit),'Select the actual original complete runtime preparer result.');
   const {inspectMerchantRuntime}=await import(pathToFileURL(join(runtime.sourceRoot,ROOT+'sf46-release/runtime-package.mjs')).href);
   const observed=await inspectMerchantRuntime(runtime.runtimeDirectory,{load:false});
   check(observed.state==='READY'&&observed.sourceCommit===runtime.sourceCommit&&observed.sourceRoot===runtime.sourceRoot&&
    observed.dependencyCount===0&&(!runtime.sourceManifestSha256||observed.sourceManifestSha256===runtime.sourceManifestSha256),
    'The selected READY receipt must match the actual installed original source/profile before receiving.');
   const result=await runIatiPublisherRefreshReceiving({...configuration,sourceRoot:runtime.sourceRoot,runtimeDirectory:runtime.runtimeDirectory});
   process.stdout.write(JSON.stringify(result)+'\n');
  }
 }catch(error){
  process.stderr.write(JSON.stringify({schema:SCHEMA,state:'INTERRUPTED',error:errorValue(error)})+'\n');process.exitCode=1;
 }
}
