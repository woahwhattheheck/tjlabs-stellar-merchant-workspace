#!/usr/bin/env node
// MIT. Managed entry into the unchanged original Bloccpay command and writer.
import { join, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { need, directory, writeExact, jsonBytes, fileDescriptor, processIdentity } from './source/lib/files.mjs';
import { CONNECTION_SCHEMA, STARTUP_SCHEMA, OWN_SOURCE, inspectSource, inspectLaunch,
 launchOptions, verifyHost, canonicalPath } from './host-connection.mjs';

export async function runBloccpayApplication(args,{signal}={}){
 const selection=launchOptions(args);
 need(Number(process.versions.node.split('.')[0])===24,'NODE_24_REQUIRED');
 const selected=await inspectLaunch(selection);
 const nodeBinding=selected.runtime.manifest.bindings.find(row=>row.path===selected.runtime.manifest.nodePath);
 const nodeFile=selected.runtime.manifest.files.find(row=>row.path===nodeBinding.object);
 const executing=await fileDescriptor(await realpath(process.execPath));
 need(executing.bytes===nodeFile.bytes&&executing.sha256===nodeFile.sha256&&process.version===selected.runtime.version,'BLOCCPAY_EXECUTING_RUNTIME_CHANGED');
 const runId=selection.runId??randomUUID(),instanceId=randomUUID();
 let owner=null,first=null,stopping=false,closePromise=null,nativeListeners=null;
 let resolveStop;const stopped=new Promise(resolve=>{resolveStop=resolve;});
 const stop=reason=>{stopping=true;if(reason instanceof Error)first??=reason;resolveStop();};
 const onSignal=()=>stop();
 const onAbort=()=>stop(signal.reason);
 const onOutput=error=>stop(error);
 process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
 process.stdout.on('error',onOutput);process.stderr.on('error',onOutput);
 signal?.addEventListener('abort',onAbort);
 if(signal?.aborted)onAbort();
 const nativeSignals=new Map(['SIGINT','SIGTERM'].map(name=>[name,new Set(process.listeners(name))]));
 const close=()=>{
  if(closePromise)return closePromise;
  const task=(async()=>{if(owner){await owner.close();owner=null;}})();
  closePromise=task;task.catch(()=>{if(closePromise===task)closePromise=null;});return task;
 };
 try{
  signal?.throwIfAborted();
  if(selection.expectedWorkspaceId){
   const databasePath=join(selected.workspaceDirectory,'workspace.sqlite');
   await canonicalPath(databasePath,'file',true);
   const {DatabaseSync}=await import('node:sqlite');
   const database=new DatabaseSync(databasePath,{readOnly:true});
   let identityError=null;
   try{
    const value=database.prepare('SELECT value FROM meta WHERE key=?').get('identity');
    const identity=value?JSON.parse(value.value):null;
    need(identity?.schema==='bloccpay.operations-workspace.v1'&&identity.id===selection.expectedWorkspaceId,'BLOCCPAY_WORKSPACE_ID_CHANGED');
   }catch(error){identityError=error;}
   try{database.close();}catch(error){
    identityError??=error;
    owner={close:async()=>database.close()};
   }
   if(identityError)throw identityError;
  }
  const native=await import(pathToFileURL(join(selected.source.directory,'cli.mjs')).href);
  const argv=['serve','--directory',selected.workspaceDirectory,'--configuration',selected.configurationFile,
   '--runtime',selected.runtime.directory,'--runtime-sha256',selected.runtime.manifestSha256,'--host','127.0.0.1','--port',String(selection.port)];
  try{owner=await native.runBloccpayCLI(argv);}
  catch(error){owner=error.application??(typeof error.close==='function'?{close:error.close}:null);throw error;}
  // The original CLI's signal callback is replaced by this one awaited owner.
  for(const [name,before] of nativeSignals)for(const listener of process.listeners(name))if(!before.has(listener))process.removeListener(name,listener);
  need(owner&&typeof owner.close==='function'&&owner.startup?.schema==='bloccpay.operations-startup.v1','BLOCCPAY_NATIVE_OWNER_REQUIRED');
  const originalOwner=owner;
  const nativeFailure=()=>{
   const state=originalOwner.inspect?.(),problem=state?.error;
   if(problem)return Object.assign(new Error(problem.message??'Original Bloccpay host stopped.'),{code:problem.code??'BLOCCPAY_NATIVE_STOPPED'});
   return stopping?null:Object.assign(new Error('Original Bloccpay listener closed.'),{code:'BLOCCPAY_NATIVE_CLOSED'});
  };
  const nativeError=error=>stop(error);
  const nativeClosed=()=>stop(nativeFailure());
  owner.server?.on('error',nativeError);owner.server?.on('close',nativeClosed);
  nativeListeners={server:owner.server,nativeError,nativeClosed};
  const state=owner.inspect?.();
  if(state?.closing||state?.closed||state?.serverClosed)stop(nativeFailure());
  if(stopping)throw first??Object.assign(new Error('Application stop requested during startup.'),{code:'ABORT_ERR'});
  if(selection.expectedWorkspaceId)need(owner.startup.workspaceId===selection.expectedWorkspaceId,'BLOCCPAY_WORKSPACE_ID_CHANGED');
  need(owner.startup.directory===selected.workspaceDirectory&&owner.startup.sourceDirectory===selected.source.directory&&
   owner.startup.runtimeDirectory===selected.runtime.directory&&owner.startup.expectedManifestSha256===selected.runtime.manifestSha256,'BLOCCPAY_NATIVE_STARTUP_CHANGED');
  const retained=join(selected.workspaceDirectory,'application-connections',runId);
  await directory(retained);await canonicalPath(retained,'directory',true);
  const tokenFile=join(retained,'operator-token.json');
  await writeExact(tokenFile,jsonBytes({schema:'bloccpay.operator-token.v1',token:owner.token}));
  const connection={schema:CONNECTION_SCHEMA,origin:owner.startup.origin,workspaceId:owner.startup.workspaceId,
   directory:selected.workspaceDirectory,sourceDirectory:selected.source.directory,sourceManifestSha256:selected.source.sha256,
   runtimeDirectory:selected.runtime.directory,runtimeSha256:selected.runtime.manifestSha256,
   instanceId,tokenFile,process:await processIdentity()};
  const bootstrap=await verifyHost(connection,{signal:AbortSignal.timeout(15000)});
  const connectionFile=join(retained,'connection.json');
  await writeExact(connectionFile,jsonBytes(connection));
  if(stopping)throw first??Object.assign(new Error('Application stop requested during startup.'),{code:'ABORT_ERR'});
  const ready={schema:STARTUP_SCHEMA,status:'BLOCCPAY_APPLICATION_READY',runId,instanceId,
   workspaceId:connection.workspaceId,receivedFrom:bootstrap.workspace.receivedFrom??null,
   directory:connection.directory,sourceDirectory:connection.sourceDirectory,sourceManifestSha256:connection.sourceManifestSha256,
   runtimeDirectory:connection.runtimeDirectory,runtimeSha256:connection.runtimeSha256,
   origin:connection.origin,connectionFile,connection:await fileDescriptor(connectionFile,connectionFile),pid:process.pid};
  await new Promise((resolve,reject)=>process.stdout.write('BLOCCPAY_APPLICATION_READY '+JSON.stringify(ready)+'\n',error=>error?reject(error):resolve()));
  await stopped;
 }catch(error){first??=error;stop();}
 finally{
  // The native handle and inherited managed lease remain alive until this exact
  // close succeeds. A diagnostic failure never permits a replacement writer.
  for(;;){try{await close();break;}catch(error){first??=error;try{process.stderr.write((error.code??'BLOCCPAY_CLOSE_PENDING')+': original Bloccpay owner still closing.\n');}catch{}await pause(200);}}
  nativeListeners?.server?.removeListener('error',nativeListeners.nativeError);
  nativeListeners?.server?.removeListener('close',nativeListeners.nativeClosed);
  for(const [name,before] of nativeSignals)for(const listener of process.listeners(name))if(!before.has(listener))process.removeListener(name,listener);
  signal?.removeEventListener('abort',onAbort);
  process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);
  await new Promise(resolve=>setImmediate(resolve));
  process.stdout.off('error',onOutput);process.stderr.off('error',onOutput);
 }
 if(first)throw first;
 return {schema:'stellar-forge.bloccpay-application-closed.v1',runId,instanceId,closed:true};
}
export async function runBloccpayIntegrationCLI(argv=process.argv.slice(2)){
 if(argv[0]==='serve')return runBloccpayApplication(argv);
 if(['received-inspect','received-prepare','received-open'].includes(argv[0])){
  const flags={};need((argv.length-1)%2===0,'BLOCCPAY_ARGUMENTS_INVALID');
  const definitions={
   'received-inspect':{required:['--received-directory'],optional:['--manifest-sha256','--workspace-id']},
   'received-prepare':{required:['--received-directory','--configuration','--destination'],optional:['--selection-sha256','--manifest-sha256','--workspace-id','--source-directory','--source-manifest-sha256']},
   'received-open':{required:['--destination'],optional:['--selection-sha256']},
  };
  const definition=definitions[argv[0]],allowed=[...definition.required,...definition.optional];
  for(let i=1;i<argv.length;i+=2){need(allowed.includes(argv[i])&&!Object.hasOwn(flags,argv[i]),'BLOCCPAY_ARGUMENTS_INVALID');flags[argv[i]]=argv[i+1];}
  need(definition.required.every(name=>typeof flags[name]==='string'&&flags[name].length>0),'BLOCCPAY_ARGUMENTS_REQUIRED');
  need(Boolean(flags['--source-directory'])===Boolean(flags['--source-manifest-sha256']),'BLOCCPAY_SOURCE_SELECTION_PAIR_REQUIRED');
  const received=await import('./received-workspace.mjs');
  const controller=new AbortController();let first=null,failedOwner=null,result;
  const stop=()=>controller.abort(Object.assign(new Error('Receiving selection interrupted.'),{code:'ABORT_ERR'}));
  const outputError=error=>{first??=error;controller.abort(error);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  process.stdout.on('error',outputError);process.stderr.on('error',outputError);
  try{
   const options={...(flags['--received-directory']?{receivedDirectory:resolve(flags['--received-directory'])}:{}),
    ...(flags['--selection-sha256']?{expectedSelectionSha256:flags['--selection-sha256']}:{}),
    ...(flags['--manifest-sha256']?{expectedManifestSha256:flags['--manifest-sha256']}:{}),
    ...(flags['--workspace-id']?{expectedWorkspaceId:flags['--workspace-id']}:{}),
    ...(flags['--source-directory']?{sourceDirectory:resolve(flags['--source-directory']),sourceManifestSha256:flags['--source-manifest-sha256']}:{}),signal:controller.signal};
   if(argv[0]==='received-inspect')result=await received.inspectReceivedBloccpayWorkspace(options);
   else if(argv[0]==='received-open')result=await received.openPreparedReceivedBloccpayApplication({...options,destination:resolve(flags['--destination'])});
   else result=await received.prepareReceivedBloccpayApplication({...options,configurationFile:resolve(flags['--configuration']),destination:resolve(flags['--destination'])});
   await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(result,null,2)+'\n',error=>error?reject(error):resolve()));
  }catch(error){first??=error;failedOwner=error.receivedApplicationOwner??(typeof error.close==='function'?{close:error.close}:null);}
  finally{
   while(failedOwner){try{await failedOwner.close();failedOwner=null;}catch(error){first??=error;await pause(200);}}
   process.off('SIGINT',stop);process.off('SIGTERM',stop);
   await new Promise(resolve=>setImmediate(resolve));
   process.stdout.off('error',outputError);process.stderr.off('error',outputError);
  }
  if(first)throw first;return result;
 }
 // Every ordinary native command retains its original spelling and semantics.
 const native=await import('./source/cli.mjs');return native.runBloccpayCLI(argv);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runBloccpayIntegrationCLI().catch(error=>{try{process.stderr.write(JSON.stringify({code:error.code??error.name,message:error.message})+'\n');}catch{}process.exitCode=1;});
}
