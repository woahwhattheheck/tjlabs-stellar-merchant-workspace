// MIT. Run the original merchant, gateway and native Jobs interfaces from one workspace.
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {fileURLToPath} from 'node:url';
import {openJobStore} from '../../../sf30-seller-sdk/jobs/store.mjs';
import {startApplication,executionExport,validateExecution,CONTROL_PATH} from '../worker.mjs';
import {readApplicationRuntime} from '../recovery.mjs';
import {KEY_HEADER,KEY_ENV,OPERATION} from '../configuration.mjs';
import {canonical,digest,need,parse,safeError} from './configuration.mjs';

const PYTHON=fileURLToPath(new URL('./native.py',import.meta.url));
const CLI=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const ENCRYPTOR=fileURLToPath(new URL('../../../sf101-merchant-recovery/recover.mjs',import.meta.url));
const BACKUP=fileURLToPath(new URL('./backup.mjs',import.meta.url));
const MAX_REPLY=20*1024*1024;
const failure=(code,status=503)=>Object.assign(new Error(code),{code,status});

export function originalProcess(executable,args,{input,environment=process.env,timeout=120000,signal}={}){
 return new Promise((accept,reject)=>{
  let child,problem=null,timer=null,killTimer=null,output=[],errors=[],outBytes=0,errorBytes=0,settled=false;
  const stop=error=>{
   problem??=error;
   if(child&&!child.killed){child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);killTimer.unref?.();}
  };
  const abort=()=>stop(failure('API_MERCHANT_OPERATION_INTERRUPTED',409));
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
   error?reject(error):accept(value);
  };
  try{
   need(!signal?.aborted,'API_MERCHANT_OPERATION_INTERRUPTED',409);
   child=spawn(executable,args,{env:{...environment,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
   child.once('error',()=>{problem??=failure('API_MERCHANT_NATIVE_UNAVAILABLE');});
   child.stdin.on('error',()=>{});
   child.stdout.on('data',part=>{outBytes+=part.length;if(outBytes>MAX_REPLY)stop(failure('API_MERCHANT_NATIVE_REPLY_TOO_LARGE'));else output.push(part);});
   child.stderr.on('data',part=>{errorBytes+=part.length;if(errorBytes>262144)stop(failure('API_MERCHANT_NATIVE_ERROR_TOO_LARGE'));else errors.push(part);});
   child.once('close',code=>{
    if(problem){finish(problem);return;}
    try{
     if(code!==0){
      let native;try{native=parse(Buffer.concat(errors));}catch{}
      const safe=safeError({code:native?.error,status:native?.status});
      finish(failure(safe.code,safe.status));return;
     }
     finish(null,parse(Buffer.concat(output)));
    }catch(error){finish(failure('API_MERCHANT_NATIVE_REPLY_INVALID'));}
   });
   timer=setTimeout(()=>stop(failure('API_MERCHANT_NATIVE_TIMED_OUT')),timeout);timer.unref?.();
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.stdin.end(input===undefined?undefined:Buffer.isBuffer(input)?input:Buffer.from(canonical(input)));
  }catch(error){if(child)stop(error);else finish(error);}
 });
}
export const native=(configuration,action,value,options={})=>originalProcess(configuration.python,[PYTHON,action],{
 ...options,input:value,environment:options.environment??process.env});
export const originalApplication=(configuration,args,options={})=>originalProcess(process.execPath,[CLI,...args],{
 ...options,environment:options.environment??process.env});
export const verifyEncryptedBundle=(configuration,bundle,passEnv,options={})=>originalProcess(process.execPath,
 [ENCRYPTOR,'verify','--bundle',bundle,'--pass-env',passEnv],{...options,timeout:3600000});

export const merchantBackup=(configuration,action,value,options={})=>originalProcess(process.execPath,[BACKUP,action],{
 ...options,input:{...value,python:configuration.python},timeout:3600000});

function openGateway(configuration,runtime,apiPort,environment,onExit){
 return new Promise((accept,reject)=>{
  let child,announced=false,stopping=false,problem=null,buffer=Buffer.alloc(0),errorBytes=0;
  let endedResolve;const ended=new Promise(resolve=>{endedResolve=resolve;});
  let timer=null,drainTimer=null,killTimer=null,stopPromise=null,closed=false;
  const terminate=()=>{
   if(closed)return;
   child?.kill('SIGTERM');
   if(!killTimer){killTimer=setTimeout(()=>{if(!closed)child?.kill('SIGKILL');},5000);killTimer.unref?.();}
  };
  const stop=()=>{
   if(stopPromise)return stopPromise;
   stopping=true;clearTimeout(timer);child?.stdin.end();
   // Preserve the original gateway drain before bounded retirement of a stuck process.
   drainTimer=setTimeout(terminate,135000);drainTimer.unref?.();
   stopPromise=ended.then(()=>{clearTimeout(drainTimer);clearTimeout(killTimer);});
   return stopPromise;
  };
  const bad=error=>{
   problem??=error;child?.stdin.end();terminate();
  };
  try{
   child=spawn(configuration.python,[PYTHON,'gateway'],{env:{...environment,[KEY_ENV]:runtime.capability,
    PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
   child.once('error',()=>bad(failure('API_MERCHANT_GATEWAY_UNAVAILABLE')));
   child.stdin.on('error',()=>{});
   child.stderr.on('data',part=>{errorBytes+=part.length;if(errorBytes>262144)bad(failure('API_MERCHANT_GATEWAY_REPLY_TOO_LARGE'));});
   child.stdout.on('data',part=>{
    if(announced){if(part.toString().trim())bad(failure('API_MERCHANT_GATEWAY_ANNOUNCEMENT_CHANGED'));return;}
    buffer=Buffer.concat([buffer,part]);
    if(buffer.length>65536){bad(failure('API_MERCHANT_GATEWAY_REPLY_TOO_LARGE'));return;}
    const end=buffer.indexOf(10);if(end<0)return;
    try{
     const view=parse(buffer.subarray(0,end));
     need(view.schema==='stellar-forge.sf101.api-merchant-gateway.v1'&&view.pid===child.pid,
      'API_MERCHANT_GATEWAY_ANNOUNCEMENT_INVALID');
     const api=new URL(view.apiUrl),console=new URL(view.consoleUrl);
     need(api.protocol==='http:'&&api.hostname==='127.0.0.1'&&!api.username&&!api.password&&
      (view.apiUrl===api.origin||view.apiUrl===api.origin+':80'&&api.port==='')&&(!apiPort||Number(api.port||80)===apiPort)&&
      console.protocol==='http:'&&console.hostname==='127.0.0.1'&&!console.username&&!console.password&&
      console.pathname==='/'&&console.hash.length>=32&&!console.search,
      'API_MERCHANT_GATEWAY_ANNOUNCEMENT_INVALID');
     need(!buffer.subarray(end+1).toString().trim(),'API_MERCHANT_GATEWAY_ANNOUNCEMENT_CHANGED');
     view.apiUrl=api.origin;announced=true;clearTimeout(timer);accept({view,stop,ended,pid:child.pid});
    }catch(error){bad(error);}
   });
   child.once('close',code=>{
    closed=true;clearTimeout(timer);clearTimeout(drainTimer);clearTimeout(killTimer);endedResolve({code});
    if(!announced)reject(problem??failure('API_MERCHANT_GATEWAY_START_FAILED'));
    else if(!stopping)onExit(problem??failure('API_MERCHANT_GATEWAY_ENDED'));
   });
   timer=setTimeout(()=>bad(failure('API_MERCHANT_GATEWAY_START_TIMED_OUT')),20000);timer.unref?.();
   child.stdin.write(canonical({gateway:runtime.profile.gateway,apiPort,consolePort:0})+'\n');
  }catch(error){bad(error);endedResolve({code:null});reject(error);}
 });
}

/** Stop admissions and drain the original gateway before retiring its worker and lease. */
export async function startServices(configuration,profilePath,apiPort,{environment=process.env,onFault=()=>{}}={}){
 const runtime=await readApplicationRuntime(profilePath);
 const worker=await startApplication(runtime,{env:environment,python:configuration.python});
 let gateway=null,stopping=null,ended=false;
 const stop=()=>{
  if(stopping)return stopping;
  stopping=(async()=>{
   try{await gateway?.stop();}finally{await worker.stop();ended=true;}
  })();
  return stopping;
 };
 try{
  gateway=await openGateway(configuration,runtime,apiPort,environment,error=>{
   onFault(safeError(error));stop().catch(error=>onFault(safeError(error)));
  });
  return {runtime,worker,gateway,
   view:()=>({status:ended?'STOPPED':stopping?'STOPPING':'RUNNING',workerOrigin:runtime.profile.origin,
    apiUrl:gateway.view.apiUrl,consoleUrl:gateway.view.consoleUrl,worker:worker.status()}),
   stop};
 }catch(error){await stop();throw error;}
}

function privateRequest(runtime,path){
 return new Promise((accept,reject)=>{
  const request=httpRequest(new URL(path,runtime.profile.origin),{method:'GET',headers:{
   [KEY_HEADER]:runtime.capability,Accept:'application/json',Connection:'close'},timeout:20000},response=>{
   let size=0;const chunks=[];
   response.on('data',part=>{size+=part.length;if(size>7*1024*1024)response.destroy(failure('APP_PRIVATE_REPLY_TOO_LARGE'));else chunks.push(part);});
   response.once('error',reject);
   response.once('end',()=>{
    try{
     const value=parse(Buffer.concat(chunks));
     if(response.statusCode!==200){const safe=safeError({code:value.error,status:response.statusCode});reject(failure(safe.code,safe.status));return;}
     accept(value);
    }catch(error){reject(failure('APP_PRIVATE_REPLY_INVALID'));}
   });
  });
  request.once('timeout',()=>request.destroy(failure('APP_PRIVATE_BACKEND_TIMED_OUT')));
  request.once('error',error=>reject(Object.assign(failure(error.code==='ECONNREFUSED'?'APP_PRIVATE_BACKEND_OFFLINE':'APP_PRIVATE_BACKEND_UNAVAILABLE'),
   {transportCode:error.code})));
  request.end();
 });
}
export async function originalExecution(configuration,profilePath,id,{body=false,offline=false}={}){
 need(OPERATION.test(id),'APP_OPERATION_REQUIRED');
 const runtime=await readApplicationRuntime(profilePath);
 if(!offline){
  try{return await privateRequest(runtime,CONTROL_PATH+'/executions/'+id+(body?'/recovery':''));}
  catch(error){if(error.transportCode!=='ECONNREFUSED')throw error;}
 }
 const store=await openJobStore(runtime.profile.store,runtime.source);
 try{
  for(const row of store.rows())validateExecution(runtime,row);
  return await executionExport(runtime,store,id,{body});
 }finally{await store.close();}
}
export const applicationOperation=(order,requestId)=>'sf101-'+digest(canonical([order,requestId]));
