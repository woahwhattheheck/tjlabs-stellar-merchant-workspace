// SPDX-License-Identifier: MIT
// Authenticated local routing to the unchanged scientific operator and complete backup receiver.
import {createServer,request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {
 APP,SCIENCE,SCHEMA,STARTUP,EXECUTED_ROOT,HASH,UUID,need,read,fields,text,same,
 inspectSelection,inspectScientificWorkspace,workspaceKey,fileIdentity,hash
} from './source.mjs';
import {inspectBackup,receiveBackup,continueReceiving,inspectReceiving,listReceiving,originalArchive} from './receiving.mjs';

const errorValue=error=>({error:{code:error.code??error.detail?.error?.code??'GROUNDWATER_APPLICATION_ERROR',
 message:String(error.message),...(error.detail?{detail:error.detail}:{})}});
const jsonBytes=value=>Buffer.from(JSON.stringify(value)+'\n');
const equalSecret=(left,right)=>{
 const a=Buffer.from(left??''),b=Buffer.from(right??'');return a.length===b.length&&timingSafeEqual(a,b);
};
const typeFor=name=>name.endsWith('.html')?'text/html; charset=utf-8':
 name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/markdown; charset=utf-8';
async function responseJSON(response,maximum=64*1024*1024){
 need(response.ok&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),
  'GROUNDWATER_APPLICATION_NATIVE_HTTP','The original scientific operator did not return JSON.');
 const pieces=[];let bytes=0;
 for await(const piece of response.body){bytes+=piece.length;need(bytes<=maximum,'GROUNDWATER_APPLICATION_RESPONSE_BOUND','The original response exceeds its retained bound.');pieces.push(piece);}
 return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}
async function scientificHost(selected,identity,{signal}={}){
 const program=join(EXECUTED_ROOT,APP,'operator_host.py');
 const child=spawn(selected.python,['-B',program,'--application',join(EXECUTED_ROOT,SCIENCE),
  '--workspace',identity.directory,'--workspace-id',identity.workspace.id,'--created',identity.workspace.created,
  '--db-dev',identity.database.dev,'--db-ino',identity.database.ino],
  {stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 let buffer='',stderr='',closed=false,exitResult,readyValue,resolveReady,rejectReady,closePromise;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const exited=new Promise(resolve=>{
  child.once('error',error=>{rejectReady(error);});
  child.once('close',(code,signalName)=>{closed=true;exitResult={code,signal:signalName,stderr};
   if(!readyValue)rejectReady(Object.assign(new Error(stderr||'The original scientific operator stopped during startup.'),{code:'GROUNDWATER_APPLICATION_NATIVE_STARTUP'}));
   resolve(exitResult);
  });
 });
 child.stdin.on('error',()=>{});child.stderr.on('data',chunk=>{if(stderr.length<1024*1024)stderr+=chunk.toString('utf8').slice(0,1024*1024-stderr.length);});
 child.stdout.on('data',chunk=>{
  buffer+=chunk.toString('utf8');
  if(buffer.length>65536&&!readyValue){rejectReady(new Error('The original scientific startup exceeds its bound.'));return;}
  let index;
  while((index=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
   if(readyValue)continue;
   let value;try{value=JSON.parse(line);}catch{continue;}
   if(value?.state!=='listening')continue;
   try{
    const url=new URL(value.url);
    need(value.workspace_id===identity.workspace.id&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&
     !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&Number(url.port)>0,
     'GROUNDWATER_APPLICATION_NATIVE_IDENTITY','The original scientific listener selected another workspace.');
    readyValue={url:url.origin,workspaceId:value.workspace_id};resolveReady(readyValue);
   }catch(error){rejectReady(error);}
  }
 });
 const close=()=>closePromise??=(async()=>{
  if(!closed){child.kill('SIGTERM');child.stdin.end();}
  return exited;
 })();
 const abort=()=>{close().catch(()=>{});};
 signal?.addEventListener('abort',abort);
 const timer=setTimeout(()=>rejectReady(Object.assign(new Error('The original scientific listener did not open within 30 seconds.'),{code:'GROUNDWATER_APPLICATION_NATIVE_TIMEOUT'})),30000);
 try{
  if(signal?.aborted)throw signal.reason??new Error('The original launch was stopped.');
  const launch=await ready;
  const current=await responseJSON(await fetch(launch.url+'/api/state',{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)}));
  need(current.workspace?.id===identity.workspace.id&&current.workspace?.created===identity.workspace.created,
   'GROUNDWATER_APPLICATION_NATIVE_IDENTITY','The opened scientific operator has another original identity.');
  await inspectScientificWorkspace(identity.directory,{expectedIdentity:identity.sha256});
  need(!closed,'GROUNDWATER_APPLICATION_NATIVE_CLOSED','The scientific operator closed during startup.');
  return {identity,key:workspaceKey(identity),url:launch.url,pid:child.pid,close,exited,isClosed:()=>closed};
 }catch(error){await close();throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function bodyJSON(request,maximum=16*1024*1024){
 need((request.headers['content-type']??'').split(';')[0].trim().toLowerCase()==='application/json',
  'GROUNDWATER_APPLICATION_CONTENT_TYPE','Use the original JSON request.',415);
 const length=Number(request.headers['content-length']);
 need(Number.isSafeInteger(length)&&length>0&&length<=maximum&&!request.headers['content-encoding']&&!request.headers['transfer-encoding'],
  'GROUNDWATER_APPLICATION_REQUEST_BOUND','Keep the original complete JSON envelope within its byte bound.',413);
 const pieces=[];let bytes=0;
 for await(const piece of request){bytes+=piece.length;need(bytes<=length,'GROUNDWATER_APPLICATION_REQUEST_BOUND','The request exceeds its declared bytes.',413);pieces.push(piece);}
 need(bytes===length,'GROUNDWATER_APPLICATION_REQUEST_INCOMPLETE','The original request was not completely received.',400);
 try{return JSON.parse(Buffer.concat(pieces).toString('utf8'));}catch{need(false,'GROUNDWATER_APPLICATION_JSON','Use complete JSON.',400);}
}
function send(response,status,value,headers={}){
 const raw=Buffer.isBuffer(value)?value:jsonBytes(value);
 response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':raw.length,
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});response.end(raw);
}
async function proxy(request,response,backend,path){
 await inspectScientificWorkspace(backend.identity.directory,{expectedIdentity:backend.identity.sha256});
 need(!backend.isClosed(),'GROUNDWATER_APPLICATION_NATIVE_CLOSED','Reopen the original application after its native operator has stopped.',503);
 const url=new URL(path,backend.url),headers={Host:url.host};
 if(request.method==='POST'){
  need(path==='/api/action','GROUNDWATER_APPLICATION_NATIVE_ROUTE','Use the original scientific action route.',404);
  const length=Number(request.headers['content-length']);
  need(Number.isSafeInteger(length)&&length>0&&length<=90*1024**2&&!request.headers['transfer-encoding']&&!request.headers['content-encoding'],
   'GROUNDWATER_APPLICATION_REQUEST_BOUND','The original scientific request must be at most 90 MiB.',413);
  need((request.headers['content-type']??'').split(';')[0].trim().toLowerCase()==='application/json',
   'GROUNDWATER_APPLICATION_CONTENT_TYPE','The original scientific action requires JSON.',415);
  headers['Content-Length']=String(length);headers['Content-Type']='application/json';headers.Origin=backend.url;
 }
 return new Promise((resolve,reject)=>{
  let settled=false;
  const done=error=>{if(settled)return;settled=true;request.off('aborted',aborted);error?reject(error):resolve();};
  const upstream=httpRequest(url,{method:request.method,headers},original=>{
   const copied={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
   for(const key of ['content-type','content-length','content-disposition','etag'])if(original.headers[key])copied[key]=original.headers[key];
   response.writeHead(original.statusCode,copied);
   original.on('error',done);response.once('finish',()=>done());response.once('close',()=>{original.destroy();done();});
   original.pipe(response);
  });
  const aborted=()=>{upstream.destroy();done();};
  upstream.on('error',done);request.once('aborted',aborted);
  if(request.method==='POST')request.pipe(upstream);else upstream.end();
 });
}
function bootstrap({apiBase,assetBase,guideUrl,actor,receiverDirectory,handoverUrl,cookieName,storageKey}){
 // This is the existing scientific UI's documented same-origin bootstrap.
 // The URL fragment is consumed before the original UI interprets its route.
 const config={apiBase,assetBase,guideUrl,actor,receiverDirectory};
 return Buffer.from('(()=>{"use strict";const key='+JSON.stringify('groundwater.application.access:'+cookieName)+
  ';let token=sessionStorage.getItem(key);const selected=/^#access=([a-f0-9]{64})$/.exec(location.hash);'+
  'if(selected){token=selected[1];sessionStorage.setItem(key,token);history.replaceState(null,"",location.pathname+location.search);}'+
  'if(token&&/^[a-f0-9]{64}$/.test(token))document.cookie='+JSON.stringify(cookieName+'=')+
  '+token+"; Path=/; SameSite=Strict";'+
  'window.GROUNDWATER_CONFIG={...'+JSON.stringify(config)+',csrfToken:token||""};'+
  'window.GROUNDWATER_APPLICATION_CONFIG={...'+JSON.stringify({apiBase:'/api/application',handoverUrl,cookieName,storageKey})+',csrfToken:token||""};'+
  'document.addEventListener("DOMContentLoaded",()=>{const nav=document.querySelector(".sidebar nav");if(nav&&!nav.querySelector("[data-complete-receiving]")){'+
  'const a=document.createElement("a");a.href='+JSON.stringify(handoverUrl)+
  ';a.textContent="Receive & reopen backup";a.dataset.completeReceiving="true";nav.append(a);}});})();\n');
}
export async function startApplication(selected,{handleSignals=true,onStartup}={}){
 const abort=new AbortController(),instanceId=randomUUID(),token=randomBytes(32).toString('hex');
 const cookieName='gw_application_'+instanceId.replaceAll('-','');
 const storageKey=hash({workspace:selected.expectedWorkspace,receiving:selected.expectedReceiving});
 const contexts=new Map(),opening=new Map(),pending=new Set();
 let server,closing=false,closePromise,initializedResolve,original,startup,origin;
 const initialized=new Promise(resolve=>{initializedResolve=resolve;});
 const close=()=>{
  closing=true;abort.abort(new Error('The original application is closing.'));
  return closePromise??=(async()=>{
   await initialized;
   if(server){
    const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    server.closeIdleConnections();await ended;
   }
   await Promise.allSettled([...pending]);
   const drained=await Promise.allSettled([...contexts.values()].map(context=>context.close()));
   const failed=drained.filter(row=>row.status==='rejected').map(row=>row.reason);
   if(failed.length)throw new AggregateError(failed,'The original scientific operators did not finish closing.');
  })().finally(()=>{if(handleSignals)for(const name of ['SIGINT','SIGTERM'])process.off(name,stop);});
 };
 const stop=()=>{close().catch(error=>{process.stderr.write(JSON.stringify(errorValue(error))+'\n');process.exitCode=1;});};
 if(handleSignals)for(const name of ['SIGINT','SIGTERM'])process.on(name,stop);
 function authorized(request){
  const bearer=(request.headers.authorization??'').replace(/^Bearer /,'');
  const cookie=(request.headers.cookie??'').split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  return equalSecret(bearer,token)||equalSecret(cookie,token);
 }
 function checkOrigin(request){
  need(request.headers.host===new URL(origin).host,'GROUNDWATER_APPLICATION_HOST','Use this application’s current local address.',400);
  need(!request.headers.origin||request.headers.origin===origin,'GROUNDWATER_APPLICATION_ORIGIN','Use the application on its selected origin.',403);
  need(!request.headers['sec-fetch-site']||['same-origin','none'].includes(request.headers['sec-fetch-site']),
   'GROUNDWATER_APPLICATION_ORIGIN','Open the original application URL directly.',403);
 }
 function writeAccess(request){
  need(authorized(request),'GROUNDWATER_APPLICATION_ACCESS','Open the original private application URL.',401);
  need(equalSecret(request.headers['x-csrftoken'],token),'GROUNDWATER_APPLICATION_CSRF','Reload the original authenticated page before sending this request.',403);
 }
 async function openWorkspace(identity){
  const key=workspaceKey(identity);
  if(contexts.has(key)){
   const existing=contexts.get(key);
   need(!existing.isClosed(),'GROUNDWATER_APPLICATION_NATIVE_CLOSED','The original operator has stopped. Stop and reopen its managed application.',503);
   await inspectScientificWorkspace(identity.directory,{expectedIdentity:identity.sha256});return existing;
  }
  need(!closing,'GROUNDWATER_APPLICATION_CLOSING','The original application is closing.',503);
  if(!opening.has(key)){
   const work=(async()=>{
    const context=await scientificHost(selected,identity,{signal:abort.signal});
    if(closing){await context.close();throw new Error('The original application closed during opening.');}
    contexts.set(key,context);return context;
   })();opening.set(key,work);
   work.finally(()=>opening.delete(key)).catch(()=>{});
  }
  return opening.get(key);
 }
 async function sendFile(response,item){
  await fileIdentity(item.path,{expected:item});
  const handle=await open(item.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const stat=await handle.stat({bigint:true});
   need(stat.isFile()&&stat.size===BigInt(item.bytes),'GROUNDWATER_APPLICATION_FILE_CHANGED','The original download changed.');
   const digest=createHash('sha256'),buffer=Buffer.alloc(256*1024);let position=0;
   while(position<item.bytes){
    const got=await handle.read(buffer,0,Math.min(buffer.length,item.bytes-position),position);
    need(got.bytesRead>0,'GROUNDWATER_APPLICATION_FILE_CHANGED','The original download ended during verification.');
    digest.update(buffer.subarray(0,got.bytesRead));position+=got.bytesRead;
   }
   const after=await handle.stat({bigint:true}),named=await lstat(item.path,{bigint:true});
   need(digest.digest('hex')===item.sha256&&
    ['dev','ino','size','mtimeNs','ctimeNs'].every(key=>stat[key]===after[key]&&after[key]===named[key])&&
    !named.isSymbolicLink()&&await realpath(item.path)===item.path,
    'GROUNDWATER_APPLICATION_FILE_CHANGED','The original download changed before publication.');
   response.writeHead(200,{'Content-Type':'application/zip','Content-Length':item.bytes,'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','ETag':'"'+item.sha256+'"',
    'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.filename||'Groundwater_Backup.zip')});
   await pipeline(handle.createReadStream({autoClose:false,start:0}),response);
  }finally{await handle.close();}
 }
 async function route(request,response){
  checkOrigin(request);
  need(!closing,'GROUNDWATER_APPLICATION_CLOSING','The original application is draining its selected requests.',503);
  const url=new URL(request.url,origin);
  need(!/%2f|%5c|%00/i.test(url.pathname),'GROUNDWATER_APPLICATION_PATH','Use the original contained application route.',400);
  const path=url.pathname;
  if(request.method==='GET'&&(path==='/'||path==='/index.html')){
   response.writeHead(302,{Location:'/w/'+workspaceKey(original.workspace)+'/'+url.hash,'Cache-Control':'no-store'});response.end();return;
  }
  if(request.method==='GET'&&path==='/handover'){response.writeHead(302,{Location:'/handover/'});response.end();return;}
  if(request.method==='GET'&&path==='/handover/bootstrap.js'){
   return send(response,200,bootstrap({apiBase:'/api/application',assetBase:'/handover/',guideUrl:'/guide',
    actor:selected.actor,receiverDirectory:selected.receivingDirectory,handoverUrl:'/handover/',cookieName,storageKey}),
    {'Content-Type':'text/javascript; charset=utf-8'});
  }
  if(request.method==='GET'&&['/handover/','/handover/index.html','/handover/app.js','/handover/style.css'].includes(path)){
   const name=path.endsWith('/')?'index.html':path.split('/').at(-1);
   return send(response,200,await read(join(EXECUTED_ROOT,APP,'ui',name)),{'Content-Type':typeFor(name)});
  }
  const match=/^\/w\/([a-f0-9]{64})\/(.*)$/.exec(path);
  if(match){
   const backend=contexts.get(match[1]);
   need(backend,'GROUNDWATER_APPLICATION_WORKSPACE_NOT_OPEN','Open this exact original or received workspace from the receiving desk.',404);
   const native='/'+match[2]+url.search;
   if(request.method==='GET'&&match[2]==='bootstrap.js')
    return send(response,200,bootstrap({apiBase:'/w/'+match[1]+'/api',assetBase:'/w/'+match[1]+'/',
     guideUrl:'/w/'+match[1]+'/guide',actor:selected.actor,receiverDirectory:selected.receivingDirectory,handoverUrl:'/handover/',cookieName,storageKey}),
     {'Content-Type':'text/javascript; charset=utf-8'});
   if(request.method==='GET'&&['','index.html','app.js','style.css'].includes(match[2]))
    return proxy(request,response,backend,native);
   need(authorized(request),'GROUNDWATER_APPLICATION_ACCESS','Open the original private application URL.',401);
   if(request.method==='POST')writeAccess(request);
   need(['GET','POST'].includes(request.method)&&
    (match[2].startsWith('api/')||match[2]==='guide'),'GROUNDWATER_APPLICATION_ROUTE','This scientific route does not exist.',404);
   return proxy(request,response,backend,native);
  }
  need(authorized(request),'GROUNDWATER_APPLICATION_ACCESS','Open the original private application URL.',401);
  if(request.method==='GET'&&path==='/guide')
   return send(response,200,await read(join(EXECUTED_ROOT,APP,'OPERATOR.md')),{'Content-Type':typeFor('OPERATOR.md')});
  if(request.method==='GET'&&path==='/api/application/state'){
   await inspectScientificWorkspace(selected.workspaceDirectory,{expectedIdentity:selected.expectedWorkspace});
   return send(response,200,{schema:SCHEMA,state:'ready',operationId:selected.operationId,instanceId,
    original:{...original.workspace,key:workspaceKey(original.workspace),url:'/w/'+workspaceKey(original.workspace)+'/'},
    receivingRoot:original.receiving,sourceSha256:selected.expectedSource,pythonIdentity:selected.expectedPython,
    opened:[...contexts.values()].map(row=>({key:row.key,workspace:row.identity.workspace,
     directory:row.identity.directory,url:'/w/'+row.key+'/',state:row.isClosed()?'closed':'open'})),
    receivings:await listReceiving(selected)});
  }
  const receiving=/^\/api\/application\/receivings\/([a-f0-9-]+)(?:\/(archive|receipt))?$/.exec(path);
  if(request.method==='GET'&&receiving){
   if(receiving[2]==='archive')return sendFile(response,await originalArchive(selected,receiving[1]));
   const row=await inspectReceiving(selected,receiving[1]);
   return send(response,200,row,receiving[2]==='receipt'?{'Content-Disposition':'attachment; filename="Groundwater_Receiving_'+receiving[1]+'.json"'}:{});
  }
  need(request.method==='POST','GROUNDWATER_APPLICATION_ROUTE','This receiving route does not exist.',404);writeAccess(request);
  const body=await bodyJSON(request);
  if(path==='/api/application/inspect-backup'){
   fields(body,['path'],'complete backup selection');return send(response,200,await inspectBackup(selected,body.path));
  }
  if(path==='/api/application/receive-backup')return send(response,200,await receiveBackup(selected,body));
  if(path==='/api/application/continue-receiving'){
   fields(body,['operationId'],'original receiving continuation');return send(response,200,await continueReceiving(selected,body.operationId));
  }
  if(path==='/api/application/open-received'){
   fields(body,['operationId'],'original received workspace');
   const row=await inspectReceiving(selected,body.operationId);
   need(row.result,'GROUNDWATER_RECEIVING_INCOMPLETE','Complete this original receiving before opening its working copy.');
   const context=await openWorkspace(row.current.identity);
   return send(response,200,{schema:SCHEMA+'.opened',operationId:body.operationId,workspace:context.identity,
    key:context.key,url:'/w/'+context.key+'/',originalUrl:'/w/'+workspaceKey(original.workspace)+'/',automaticRun:false});
  }
  need(false,'GROUNDWATER_APPLICATION_ROUTE','This receiving action does not exist.',404);
 }
 let failure;
 try{
  original=await inspectSelection(selected,{probe:true});
  await openWorkspace(original.workspace);
  need(!closing,'GROUNDWATER_APPLICATION_CLOSING','The original launch was stopped.');
  server=createServer((request,response)=>{
   const task=route(request,response).catch(error=>{
    if(!response.headersSent)send(response,error.status??error.detail?.error?.status??409,errorValue(error));
    else response.destroy(error);
   });
   pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});
  });
  server.requestTimeout=0;server.headersTimeout=30000;server.keepAliveTimeout=3000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(selected.port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  await inspectSelection(selected);
  need(!closing,'GROUNDWATER_APPLICATION_CLOSING','The original launch was stopped.');
  const key=workspaceKey(original.workspace);
  startup={schema:STARTUP,state:'GROUNDWATER_APPLICATION_READY',operationId:selected.operationId,
   instanceId,pid:process.pid,origin,url:origin+'/w/'+key+'/#access='+token,apiBase:'/w/'+key+'/api',
   handoverUrl:origin+'/handover/',workspaceKey:key,workspaceId:original.workspace.workspace.id,
   workspaceDirectory:selected.workspaceDirectory,workspaceIdentity:selected.expectedWorkspace,
   receivingDirectory:selected.receivingDirectory,receivingIdentity:selected.expectedReceiving,
   sourceRoot:selected.sourceRoot,executedSourceRoot:EXECUTED_ROOT,sourceSha256:selected.expectedSource,
   pythonIdentity:selected.expectedPython,python:original.native};
  if(onStartup)await onStartup(startup);
 }catch(error){failure=error;}
 finally{initializedResolve();}
 if(failure){try{await close();}catch(error){throw new AggregateError([failure,error],'The original launch and drain failed.');}throw failure;}
 if(closing){await close();throw new Error('The original application was stopped during startup.');}
 return {startup,close};
}
