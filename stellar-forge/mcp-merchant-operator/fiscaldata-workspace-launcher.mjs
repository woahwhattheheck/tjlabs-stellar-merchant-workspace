#!/usr/bin/env node
// MIT. One named Fiscal owner, original MCP transport and its borrowed browser.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MerchantFiscalDataWorkspaces, fiscalDataWorkspaceTools } from './fiscaldata-workspace.mjs';
import { createMcpToolHandler } from '../mcp-paid-agent/http-tools.mjs';
import { inspectFiscalManagedSelection, inspectFiscalManagedSource } from
  '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fiscaldata/managed.mjs';

export const FISCAL_AGENT_BINDING_SCHEMA='stellar-forge.fiscaldata-agent-binding.v1';
export const FISCAL_AGENT_STARTUP_SCHEMA='stellar-forge.fiscaldata-agent-startup.v1';
const SOURCE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function need(value,code,message){if(!value)throw Object.assign(new Error(message??code),{code});}
function port(value,name){
  need(Number.isSafeInteger(value)&&value>=0&&value<=65535,'FISCAL_AGENT_PORT_INVALID',name+' must be from 0 through 65535.');
  return value;
}
async function originalBinding({connectionFile,workspace,exportsDirectory,sourceRoot=SOURCE_ROOT}={}){
  const selection=await inspectFiscalManagedSelection({connectionFile,workspaceAlias:workspace,exportsDirectory});
  const selected=await inspectFiscalManagedSource(sourceRoot);
  await inspectFiscalManagedSource(SOURCE_ROOT,{expectedSha256:selected.sha256});
  const binding={
    schema:FISCAL_AGENT_BINDING_SCHEMA,
    connectionFile:selection.connectionFile,connectionSha256:selection.connectionSha256,
    workspace,workspaceId:selection.workspace.id,workspaceIdentity:selection.workspace.sha256,
    directory:selection.workspace.directory,exportsDirectory:selection.exportsDirectory,
    operator:selection.operator,sourceRoot:selected.sourceRoot,
    sourceSha256:selected.sha256,sourceFiles:selected.files,
  };
  return{selection,binding:{...binding,bindingSha256:sha(binding)}};
}
/** Inspect exact declarations and source. No model, worker or listener is opened. */
export async function inspectFiscalAgentBinding(options={}){
  return(await originalBinding(options)).binding;
}
/**
 * The original Fiscal adapter is the only model owner. The HTTP client and
 * optional browser use that same adapter; additional aliases must be declared.
 */
export async function startFiscalAgent({
  connectionFile,workspace,exportsDirectory,sourceRoot=SOURCE_ROOT,
  expectedBindingSha256,mcpPort=0,browserPort=0,browser=true,
  tokenEnv='MCP_ACCESS_TOKEN',environment=process.env,signal,
}={}){
  port(mcpPort,'MCP port');port(browserPort,'Browser port');
  need(typeof browser==='boolean','FISCAL_AGENT_BROWSER_INVALID');
  need(HASH.test(expectedBindingSha256??''),'FISCAL_AGENT_REVIEW_REQUIRED',
    'Inspect the original binding and supply its exact SHA-256 before starting.');
  need(typeof tokenEnv==='string'&&/^[A-Z_][A-Z0-9_]{0,127}$/.test(tokenEnv),'FISCAL_AGENT_TOKEN_ENV_INVALID');
  const token=environment[tokenEnv];
  need(typeof token==='string'&&token.length>=24,'FISCAL_AGENT_AUTH_REQUIRED',
    'Set the selected original MCP access-token environment variable.');
  let adapter,server,handler,ready=false,stopping=false,closing,resolveClosed;
  const requests=new Set(),sockets=new Set(),closed=new Promise(done=>{resolveClosed=done;});
  const check=()=>need(!stopping&&!signal?.aborted,'FISCAL_AGENT_START_CANCELLED','The selected host was stopped before readiness.');
  const close=()=>{
    stopping=true;ready=false;
    if(closing)return closing;
    closing=(async()=>{
      const failures=[];
      let listenerClosed=Promise.resolve();
      if(server){
        listenerClosed=new Promise(done=>{
          try{server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')failures.push(error);done();});}
          catch(error){if(error.code!=='ERR_SERVER_NOT_RUNNING')failures.push(error);done();}
        });
        try{server.closeIdleConnections?.();}catch(error){failures.push(error);}
      }
      // Admission closes before draining. Accepted original actions complete.
      await Promise.allSettled([...requests]);
      for(const socket of sockets)try{socket.destroy();}catch(error){failures.push(error);}
      await listenerClosed;
      try{await adapter?.close();}catch(error){failures.push(error);}
      signal?.removeEventListener('abort',onAbort);
      if(failures.length){
        const error=new AggregateError(failures,'The original Fiscal host could not finish closing.');
        error.code='FISCAL_AGENT_CLOSE_FAILED';resolveClosed({status:'CLOSE_FAILED',code:error.code});throw error;
      }
      resolveClosed({status:'CLOSED'});
    })().catch(error=>{closing=null;throw error;});
    return closing;
  };
  // During startup, the current awaited original operation owns its cleanup.
  // Once ready, an abort starts the same host's complete drain.
  const onAbort=()=>{stopping=true;if(ready)void close().catch(()=>{});};
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
    check();
    const{selection,binding}=await originalBinding({connectionFile,workspace,exportsDirectory,sourceRoot});check();
    need(binding.bindingSha256===expectedBindingSha256,'FISCAL_AGENT_BINDING_CHANGED',
      'The selected connection, workspace or source changed; inspect the current binding.');
    const configured=selection.config;
    const selectedEntry={...configured.workspaces[workspace],expectedWorkspace:selection.workspace.binding};
    const workspaces={...configured.workspaces,[workspace]:selectedEntry};
    adapter=new MerchantFiscalDataWorkspaces({
      fiscalDataWorkspaces:{operator:selection.operator,workspaces},
      exportsDirectory:selection.exportsDirectory,
    });
    const opened=await adapter.call('merchant_fiscaldata_open',{workspace});check();
    need(opened.workspaceId===binding.workspaceId&&UUID.test(opened.instanceId??''),
      'FISCAL_AGENT_WORKSPACE_CHANGED','The opened original workspace differs from its selected identity.');
    const tools=fiscalDataWorkspaceTools((name,description,properties,required,flags={})=>({
      name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},
      annotations:{readOnlyHint:flags.readOnly===true,idempotentHint:flags.idempotent===true,
        destructiveHint:flags.destructive===true,openWorldHint:flags.openWorld===true},
    }));
    handler=createMcpToolHandler({tools,call:(name,args)=>adapter.call(name,args)},{
      bearerToken:token,maxRequestBytes:1024*1024,serverName:'Fiscal Data analyst',serverVersion:'1.0.0',
      instructions:'Operate only host-declared Fiscal workspaces. Keep original request IDs, field and unit reviews, source hashes and named operator identity. Financial observations remain exact strings. Opening a workspace does not run a capture. Purchases require the existing separately configured native buyer and approval.',
    });
    server=createServer((req,res)=>{
      const task=(async()=>{
        if(stopping||!ready){res.writeHead(503,{'cache-control':'no-store'});res.end('Fiscal host is starting or draining.');return;}
        if(req.headers.host!=='127.0.0.1:'+server.address().port||req.url!=='/mcp'){
          res.writeHead(404,{'cache-control':'no-store'});res.end();return;
        }
        await handler(req,res);
      })().catch(error=>{
        if(!res.headersSent&&!res.destroyed)res.writeHead(500,{'cache-control':'no-store'});
        if(!res.destroyed)res.end('Fiscal request failed.');
      });
      requests.add(task);task.finally(()=>requests.delete(task));
    });
    server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=2000;
    server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    await new Promise((done,reject)=>{
      const failed=error=>{server.removeListener('listening',listening);reject(error);};
      const listening=()=>{server.removeListener('error',failed);done();};
      server.once('error',failed);server.once('listening',listening);
      server.listen(mcpPort,'127.0.0.1');
    });check();
    let browserUrl=null;
    if(browser){
      const view=await adapter.call('merchant_fiscaldata_browser',{workspace,action:'open',port:browserPort});check();
      need(view.browser==='OPEN'&&typeof view.url==='string','FISCAL_AGENT_BROWSER_UNAVAILABLE');
      browserUrl=view.url;
    }
    const after=await inspectFiscalAgentBinding({connectionFile,workspace,exportsDirectory,sourceRoot});check();
    need(after.bindingSha256===binding.bindingSha256,'FISCAL_AGENT_BINDING_CHANGED',
      'The original binding changed during startup; review it again.');
    const startup=Object.freeze({
      schema:FISCAL_AGENT_STARTUP_SCHEMA,status:'FISCALDATA_AGENT_READY',
      bindingSha256:binding.bindingSha256,connectionFile:binding.connectionFile,
      sourceRoot:binding.sourceRoot,sourceSha256:binding.sourceSha256,
      workspace,workspaceId:opened.workspaceId,instanceId:opened.instanceId,
      operator:binding.operator,pid:process.pid,
      mcpUrl:'http://127.0.0.1:'+server.address().port+'/mcp',browserUrl,
    });
    ready=true;
    return{startup,binding,operator:adapter,closed,close};
  }catch(error){
    try{await close();}catch(shutdown){throw new AggregateError([error,shutdown],'Fiscal startup and cleanup failed.');}
    throw error;
  }
}

export const HELP='Fiscal Data named analyst host\n\n'+
 'starforge fiscaldata-agent inspect --connection FILE --workspace ALIAS --exports DIRECTORY [--source ROOT]\n'+
 'starforge fiscaldata-agent serve --connection FILE --workspace ALIAS --exports DIRECTORY --expected-binding-sha256 SHA256\n'+
 '  [--source ROOT] [--mcp-port 0] [--browser-port 0] [--token-env MCP_ACCESS_TOKEN] [--no-browser]\n\n'+
 'Use the existing owned 0600 Fiscal connection. Serve opens one original named model;\n'+
 'its authenticated MCP endpoint and borrowed browser operate that same workspace.\n'+
 'Retain the selected token in the host environment. The startup record contains no token.\n'+
 'Stop drains original HTTP actions, file reads, browser and model before releasing ownership.\n';
function parse(argv){
  if(!argv.length||argv.includes('--help'))return{help:true};
  const[action,...rest]=argv,values={};
  need(['inspect','serve'].includes(action),'FISCAL_AGENT_ARGUMENT_INVALID','Choose inspect or serve.');
  const allowed=new Set(['--connection','--workspace','--exports','--source','--expected-binding-sha256','--mcp-port','--browser-port','--token-env','--no-browser']);
  for(let i=0;i<rest.length;i++){
    const name=rest[i];need(allowed.has(name)&&!Object.hasOwn(values,name),'FISCAL_AGENT_ARGUMENT_INVALID','Unknown or repeated option.');
    if(name==='--no-browser'){values[name]=true;continue;}
    need(typeof rest[i+1]==='string'&&rest[i+1]&&!rest[i+1].startsWith('--'),'FISCAL_AGENT_ARGUMENT_INVALID','Each option needs its value.');
    values[name]=rest[++i];
  }
  need(['--connection','--workspace','--exports'].every(name=>values[name]),'FISCAL_AGENT_SELECTION_REQUIRED');
  if(action==='inspect')need(Object.keys(values).every(name=>['--connection','--workspace','--exports','--source'].includes(name)),'FISCAL_AGENT_ARGUMENT_INVALID');
  const number=name=>{
    const value=values[name]??'0';need(/^(0|[1-9]\d*)$/.test(value),'FISCAL_AGENT_PORT_INVALID');
    return port(Number(value),name);
  };
  return{action,connectionFile:resolve(values['--connection']),workspace:values['--workspace'],
    exportsDirectory:resolve(values['--exports']),sourceRoot:values['--source']?resolve(values['--source']):SOURCE_ROOT,
    expectedBindingSha256:values['--expected-binding-sha256'],mcpPort:number('--mcp-port'),
    browserPort:number('--browser-port'),browser:!values['--no-browser'],tokenEnv:values['--token-env']??'MCP_ACCESS_TOKEN'};
}
export async function main(argv=process.argv.slice(2)){
  const options=parse(argv);
  if(options.help){process.stdout.write(HELP);return;}
  if(options.action==='inspect'){
    const result=await inspectFiscalAgentBinding(options);process.stdout.write(JSON.stringify(result)+'\n');return result;
  }
  const controller=new AbortController(),stop=()=>controller.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);let service;
  try{
    service=await startFiscalAgent({...options,signal:controller.signal});
    if(!controller.signal.aborted)process.stdout.write(JSON.stringify(service.startup)+'\n');
    const result=await service.closed;
    need(result.status==='CLOSED','FISCAL_AGENT_CLOSE_FAILED');
    return result;
  }finally{
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    await service?.close();
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'FISCAL_AGENT_FAILED',message:error.message})+'\n');process.exitCode=1;});
}
