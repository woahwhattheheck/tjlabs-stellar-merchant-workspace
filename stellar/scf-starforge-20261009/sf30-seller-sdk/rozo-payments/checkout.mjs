import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assert, canonical, jsonDigest, digest, id, text, safeUrl, newId } from './model.mjs';
import { inspectPublisher } from './source.mjs';

export function nativeBindingIdentity(value){const {sourceRoot,modulePath,runtimeRoot,...identity}=value;return identity;}
export function nativeBinding(connection,publisherFiles){
  const sourceRoot=realpathSync(connection.sourceRoot);
  let runtime={};
  if(connection.type==='intent-common-0.1.43'){
    assert(connection.runtimeRoot&&Array.isArray(connection.runtimeFiles)&&connection.runtimeFiles.length,'SDK_RUNTIME','Select the complete original compiled SDK and dependency runtime.',409);
    const selected=inspectPublisher(connection.runtimeRoot,connection.runtimeFiles);
    const modulePath=realpathSync(connection.modulePath),moduleRow=connection.runtimeFiles.find(row=>resolve(selected.sourceRoot,row.path)===modulePath);
    assert(moduleRow&&moduleRow.sha256===connection.moduleSha256,'SDK_RUNTIME','The original SDK entry must belong to the complete runtime selection.',409);
    runtime={runtimeRoot:selected.sourceRoot,runtimeFiles:connection.runtimeFiles,runtimeSelectionSha256:selected.sourceSelectionSha256};
  }
  return {publisher:connection.publisher,sourceRoot,sourceSelectionSha256:jsonDigest(publisherFiles),...runtime,
    ...(connection.type==='checkout-mpp-0.1.21'?{
      mppBase:safeUrl(connection.mppBase??'https://apiserver.mpprouter.dev/v1/services/rozo-agent-api','native MPP base',{loopback:connection.allowLocal===true}),
      intentsBase:safeUrl(connection.intentsBase??'https://intentapiv4.rozo.ai/functions/v1/payment-api','native Intents base',{loopback:connection.allowLocal===true})
    }:{modulePath:realpathSync(connection.modulePath),moduleSha256:connection.moduleSha256,baseUrl:connection.baseUrl,apiTokenEnv:connection.apiTokenEnv??null,usePublishedToken:connection.usePublishedToken===true})};
}
function writeOriginal(file,value){
  const bytes=Buffer.from(canonical(value));
  if(existsSync(file)){assert(readFileSync(file).equals(bytes),'NATIVE_INPUT_CONFLICT','The retained native input already contains another request.',409);return;}
  const temp=file+'.'+newId('write');const fd=openSync(temp,'wx',0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  renameSync(temp,file);
}
export async function runNative(workspace,request,{profile,connection,publisherFiles,mode,argv=[],selection={},method,args=[],sdkVersion,environment=process.env,signal,maxRuntimeMs=300000}){
  const binding=nativeBinding(connection,publisherFiles);
  const frozen=request.intent.nativeBinding;
  assert(canonical(nativeBindingIdentity(binding))===canonical(nativeBindingIdentity(frozen)),'NATIVE_BINDING_CHANGED','Restore the original native source/connection binding for this retained request.',409);
  const attempt=workspace.beginAttempt(request.id,'native_'+mode,{sourceSelectionSha256:binding.sourceSelectionSha256});
  const directory=join(workspace.directory,'native','requests',request.id,String(attempt));mkdirSync(directory,{recursive:true,mode:0o700});
  const input={workspace:workspace.directory,requestId:request.id,fingerprint:request.fingerprint,attempt,profile,connection:binding,publisherFiles,mode,argv,selection,method:method??null,args,sdkVersion:sdkVersion??null};
  const inputFile=join(directory,'input.json');writeOriginal(inputFile,input);
  const env={PATH:environment.PATH??'',TMPDIR:environment.TMPDIR??directory};
  if(binding.apiTokenEnv && environment[binding.apiTokenEnv])env[binding.apiTokenEnv]=environment[binding.apiTokenEnv];
  const child=spawn(process.execPath,[fileURLToPath(new URL('./checkout-worker.mjs',import.meta.url)),inputFile],{env,stdio:['ignore','pipe','pipe','ipc']});
  let stdout='',stderr='',timedOut=false,killTimer;
  child.stdout.on('data',chunk=>{if(stdout.length<1024*1024)stdout+=chunk.toString();});
  child.stderr.on('data',chunk=>{if(stderr.length<1024*1024)stderr+=chunk.toString();});
  const terminate=()=>{if(child.exitCode===null&&!child.killed){child.kill('SIGTERM');killTimer=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},5000);}};
  const timer=setTimeout(()=>{timedOut=true;terminate();},maxRuntimeMs);signal?.addEventListener('abort',terminate,{once:true});
  let result;
  try{result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});}
  finally{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',terminate);}
  writeOriginal(join(directory,'process.json'),{...result,timedOut,stdout,stderr});
  const current=workspace.request(request.id);
  if(current.state==='accepted')return current.result;
  return {schema:'stellar-forge.rozo-pending-result.v1',state:'pending',workspaceId:workspace.meta().workspaceId,requestId:request.id,process:result,timedOut,attempt,capturePending:true};
}

export async function selectCheckoutLink(connection,publisherFiles,url){
  const row=publisherFiles.find(r=>r.path==='scripts/src/lib/ids.mjs');
  assert(row,'PUBLISHER_SELECTION','Retain the original Checkout identity module.');
  const path=join(realpathSync(connection.sourceRoot),row.path),bytes=readFileSync(path);
  assert(bytes.length===row.bytes&&digest(bytes)===row.sha256,'PUBLISHER_SOURCE','The original Checkout identity module differs.',409);
  const module=await import(pathToFileURL(path));return module.extractLinkId(url);
}
