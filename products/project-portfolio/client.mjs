// SPDX-License-Identifier: MIT
// Customer client for the unchanged authenticated Project Portfolio operator.
import {constants} from 'node:fs';
import {open,lstat,link,rm} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {need,plain,identity,fullPath,privateDirectory,readProjectPortfolioConnection,
 readProjectPortfolioEntry} from './workspace.mjs';

export const PROJECT_PORTFOLIO_ACTIONS=Object.freeze([
 'intake','source_review','source_apply','mspdi_export','probe','prepare','prepare_adjustment',
 'review','continue','adopt_detail','capture_target','receive_target_file','accept','handover',
 'archive','abandon_set','archive_save','archive_review','archive_publish',
 'archive_query_export','archive_inspect','archive_receive'
]);
export const MAX_SOURCE_BYTES=256*1024*1024;
export const MAX_ARCHIVE_BYTES=8*1024*1024*1024;
export const MAX_JSON_BYTES=64*1024*1024;
const MAX_REQUEST_BYTES=8*1024*1024;
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
const count=(value,maximum=Number.MAX_SAFE_INTEGER)=>{
 need(Number.isSafeInteger(value)&&value>=0&&value<=maximum,'PROJECT_PORTFOLIO_BYTES');return value;
};
function filename(value){
 need(typeof value==='string'&&value.length>0&&value.length<=240&&value!=='.'&&value!=='..'&&
  !/[\/\\\0\r\n]/.test(value),'PROJECT_PORTFOLIO_FILENAME');return value;
}
export function newProjectPortfolioRequestId(){return createHash('sha256').update(randomUUID()).digest('hex');}
export async function readProjectPortfolioResponse(response,maximum=MAX_JSON_BYTES){
 const parts=[];let bytes=0;const reader=response.body?.getReader();
 if(!reader)return Buffer.alloc(0);
 try{
  while(true){const item=await reader.read();if(item.done)break;
   bytes+=item.value.byteLength;need(bytes<=maximum,'PROJECT_PORTFOLIO_RESPONSE_SIZE',
    'Save this complete original response to a file instead of reading it into memory.');
   parts.push(Buffer.from(item.value));
  }
  return Buffer.concat(parts,bytes);
 }finally{try{await reader.cancel();}finally{reader.releaseLock();}}
}
function awaitSignal(promise,signal){
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
function parseJson(raw){
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{need(false,'PROJECT_PORTFOLIO_RESPONSE_JSON','The original operator returned invalid UTF-8 JSON.');}
}
async function success(response){
 if(response.ok)return;
 let detail=null;
 try{detail=parseJson(await readProjectPortfolioResponse(response,65536));}catch{}
 const original=detail?.error??detail;
 throw Object.assign(new Error(typeof original?.message==='string'?original.message:
  'The original operator returned HTTP '+response.status+'.'),
  {code:original?.code??'PROJECT_PORTFOLIO_HTTP',status:response.status,original:detail});
}
async function writeAll(handle,bytes){
 let offset=0;
 while(offset<bytes.length){const result=await handle.write(bytes,offset,bytes.length-offset,null);
  need(result.bytesWritten>0,'PROJECT_PORTFOLIO_DOWNLOAD_WRITE');offset+=result.bytesWritten;}
}
export async function inspectProjectPortfolioFile(path,{maximum=MAX_ARCHIVE_BYTES,expectedSha256}={}){
 path=fullPath(path);if(expectedSha256)identity(expectedSha256);
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const first=await handle.stat({bigint:true});
  need(first.isFile()&&first.size>=0n&&first.size<=BigInt(maximum),'PROJECT_PORTFOLIO_FILE_SIZE');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let offset=0;
  while(offset<Number(first.size)){
   const result=await handle.read(buffer,0,Math.min(buffer.length,Number(first.size)-offset),offset);
   need(result.bytesRead>0,'PROJECT_PORTFOLIO_FILE_TRUNCATED');hash.update(buffer.subarray(0,result.bytesRead));
   offset+=result.bytesRead;
  }
  const sha256=hash.digest('hex'),last=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
  need(same(first,last)&&same(first,named)&&(!expectedSha256||sha256===expectedSha256),'PROJECT_PORTFOLIO_FILE_CHANGED');
  return {path,filename:basename(path),bytes:offset,sha256};
 }finally{await handle.close();}
}
async function retainResponse(response,path,{expectedSha256,expectedBytes,maximum=MAX_ARCHIVE_BYTES}={}){
 path=fullPath(path);if(expectedSha256)identity(expectedSha256);if(expectedBytes!==undefined)count(expectedBytes,maximum);
 await privateDirectory(dirname(path),{create:true});
 const temporary=join(dirname(path),'.'+randomUUID()+'.incoming');
 const output=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
 const hash=createHash('sha256');let bytes=0,closed=false;
 try{
  const reader=response.body?.getReader();
  if(reader)try{
   while(true){const part=await reader.read();if(part.done)break;
    const chunk=Buffer.from(part.value);bytes+=chunk.length;
    need(bytes<=maximum&&(expectedBytes===undefined||bytes<=expectedBytes),'PROJECT_PORTFOLIO_DOWNLOAD_SIZE');
    await writeAll(output,chunk);hash.update(chunk);
   }
  }finally{try{await reader.cancel();}finally{reader.releaseLock();}}
  const sha256=hash.digest('hex');
  need((expectedBytes===undefined||bytes===expectedBytes)&&(!expectedSha256||sha256===expectedSha256),
   'PROJECT_PORTFOLIO_DOWNLOAD_CHANGED','Receive every byte of the selected original file and its exact SHA-256.');
  await output.sync();await output.close();closed=true;
  try{await link(temporary,path);}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const original=await inspectProjectPortfolioFile(path,{maximum,expectedSha256:sha256});
   need(original.bytes===bytes,'PROJECT_PORTFOLIO_DOWNLOAD_CONFLICT');
  }
  const directory=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);
  try{await directory.sync();}finally{await directory.close();}
  return {path,filename:basename(path),bytes,sha256};
 }finally{if(!closed)await output.close();await rm(temporary,{force:true});}
}

/** A connection owns its HTTP reads. Saved native operations belong to the original workspace. */
export class ProjectPortfolioClient {
 #options;#entry=null;#connection=null;#ready=null;#closed=false;#active=new Map();#close=null;
 constructor({connectionFile,expectedWorkspaceId,fetchImpl=globalThis.fetch,signal}={}){
  fullPath(connectionFile);if(expectedWorkspaceId)identity(expectedWorkspaceId);
  need(typeof fetchImpl==='function','PROJECT_PORTFOLIO_HTTP_CLIENT');
  this.#options={connectionFile,expectedWorkspaceId,fetchImpl,signal};
 }
 #tracked(work,requestId,localSignal){
  need(!this.#closed,'PROJECT_PORTFOLIO_CLIENT_CLOSED');
  const controller=new AbortController(),parents=[...new Set([this.#options.signal,localSignal].filter(Boolean))];
  const subscriptions=parents.map(parent=>{
   const abort=()=>controller.abort(parent.reason??new Error('Project Portfolio connection cancelled.'));
   parent.addEventListener('abort',abort,{once:true});if(parent.aborted)abort();
   return ()=>parent.removeEventListener('abort',abort);
  });
  const task=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(controller.signal);});
  this.#active.set(task,{controller,requestId});
  void task.finally(()=>{for(const remove of subscriptions)remove();this.#active.delete(task);}).catch(()=>{});
  return task;
 }
 async #fetch(path,{method='GET',query,body,headers={},signal}={}){
  need(typeof path==='string'&&path.startsWith('/api/')&&!/[?#\r\n]/.test(path),'PROJECT_PORTFOLIO_ROUTE');
  const target=new URL(path,this.#entry.origin);
  for(const [name,value]of Object.entries(query??{})){
   if(value!==undefined&&value!==null)target.searchParams.set(name,Array.isArray(value)?value.join(','):String(value));
  }
  return this.#options.fetchImpl(target,{method,redirect:'error',signal,
   headers:{Authorization:'Bearer '+this.#entry.token,...(method==='POST'?{Origin:this.#entry.origin}:{}),...headers},
   ...(body!==undefined?{body,duplex:'half'}:{})});
 }
 ready(){
  if(!this.#ready)this.#ready=this.#tracked(async signal=>{
   this.#connection=await readProjectPortfolioConnection(this.#options.connectionFile);
   this.#entry=await readProjectPortfolioEntry(this.#connection);
   need(!this.#options.expectedWorkspaceId||this.#entry.workspaceId===this.#options.expectedWorkspaceId,
    'PROJECT_PORTFOLIO_WORKSPACE_CHANGED');
   const response=await this.#fetch('/api/hello',{signal});
   try{
    await success(response);const hello=parseJson(await readProjectPortfolioResponse(response,65536));
    need(hello.schema==='portfolio.operator-hello.v1'&&hello.workspace_id===this.#entry.workspaceId,
     'PROJECT_PORTFOLIO_WORKSPACE_CHANGED');
    return {...hello,connection:{label:this.#connection.label,workspaceId:this.#entry.workspaceId,
     instanceId:this.#entry.instanceId,sourceCommit:this.#entry.sourceCommit}};
   }finally{await response.body?.cancel().catch(()=>{});}
  });
  return this.#ready;
 }
 #response(path,options,consume){
  return this.#tracked(async signal=>{
   await awaitSignal(this.ready(),signal);signal.throwIfAborted();
   const response=await this.#fetch(path,{...options,signal});
   try{await success(response);return await consume(response);}
   finally{await response.body?.cancel().catch(()=>{});}
  },options?.requestId,options?.signal);
 }
 /** Complete operator JSON; use saveResponse for larger immutable results. */
 requestJson(path,{method='GET',query,body,requestId,signal,maximum=MAX_JSON_BYTES}={}){
  let raw;
  if(body!==undefined){raw=Buffer.from(JSON.stringify(body));need(raw.length<=MAX_REQUEST_BYTES,'PROJECT_PORTFOLIO_REQUEST_SIZE');}
  return this.#response(path,{method,query,body:raw,requestId,signal,
   headers:raw?{'Content-Type':'application/json','Content-Length':String(raw.length)}:{}},
   async response=>parseJson(await readProjectPortfolioResponse(response,maximum)));
 }
 /** Retain the original response bytes without a JSON projection or memory-sized cap. */
 saveResponse(path,destination,{method='GET',query,body,requestId,signal,maximum=MAX_ARCHIVE_BYTES}={}){
  let raw;
  if(body!==undefined){raw=Buffer.from(JSON.stringify(body));need(raw.length<=MAX_REQUEST_BYTES,'PROJECT_PORTFOLIO_REQUEST_SIZE');}
  return this.#response(path,{method,query,body:raw,requestId,signal,
   headers:raw?{'Content-Type':'application/json','Content-Length':String(raw.length)}:{}},
   response=>retainResponse(response,destination,{maximum}));
 }
 state(query={}){return this.requestJson('/api/state',{query});}
 requests(query={}){return this.requestJson('/api/requests',{query});}
 request(requestId,{signal}={}){return this.requestJson('/api/requests/'+identity(requestId),{requestId,signal});}
 editions(query={}){return this.requestJson('/api/editions',{query});}
 edition(editionId,query={}){return this.requestJson('/api/editions/'+identity(editionId),{query});}
 sourceReview(reviewId){return this.requestJson('/api/source-reviews/'+identity(reviewId));}
 deployment(deploymentId){return this.requestJson('/api/deployments/'+identity(deploymentId));}
 object(sha256){return this.requestJson('/api/objects/'+identity(sha256));}
 cohorts(query={}){return this.requestJson('/api/cohorts',{query});}
 cohort(cohortId){return this.requestJson('/api/cohorts/'+identity(cohortId));}
 archiveFields(editions){need(Array.isArray(editions)&&editions.length>0,'PROJECT_PORTFOLIO_EDITIONS');
  return this.requestJson('/api/archive-fields',{query:{editions:editions.map(value=>identity(value))}});}
 archiveTable(query){return this.requestJson('/api/archive-table',{query});}
 archiveQuery(body){return this.requestJson('/api/archive-query',{method:'POST',body});}
 companions(editionId){return this.requestJson('/api/companion-sources',{query:{edition_id:identity(editionId)}});}
 companionCapture(query){return this.requestJson('/api/companion-capture',{query});}
 sourceFieldCatalogue(editionId,family){return this.requestJson('/api/source-field-catalogue',{query:{edition_id:identity(editionId),family}});}
 action(requestId,kind,args={}){
  identity(requestId);need(PROJECT_PORTFOLIO_ACTIONS.includes(kind)&&plain(args),'PROJECT_PORTFOLIO_ACTION');
  return this.requestJson('/api/actions',{method:'POST',body:{request_id:requestId,kind,arguments:args},requestId});
 }
 resume(requestId,{retryFailed=false}={}){
  identity(requestId);need(typeof retryFailed==='boolean','PROJECT_PORTFOLIO_RETRY');
  return this.requestJson('/api/requests/'+requestId+'/resume',
   {method:'POST',body:{retry_failed:retryFailed},requestId});
 }
 pause(deploymentId,requestId){
  return this.requestJson('/api/deployments/'+identity(deploymentId)+'/pause',
   {method:'POST',body:{request_id:identity(requestId)},requestId});
 }
 async requestStatus(requestId,{signal}={}){
  identity(requestId);let cursor='';const cursors=new Set();
  while(true){
   const page=await this.requestJson('/api/requests',{query:{limit:1,cursor},requestId,signal});
   need(Array.isArray(page.items),'PROJECT_PORTFOLIO_REQUEST_PAGE');
   const result=page.items.find(item=>item.id===requestId);if(result)return result;
   if(page.complete||!page.next_cursor)throw Object.assign(new Error('The original request is absent from this workspace.'),
    {code:'PROJECT_PORTFOLIO_REQUEST_NOT_FOUND',requestId});
   need(!cursors.has(page.next_cursor),'PROJECT_PORTFOLIO_REQUEST_CURSOR');
   cursors.add(page.next_cursor);cursor=page.next_cursor;
  }
 }
 waitRequest(requestId,{intervalMs=750,timeoutMs=0,includeResult=true}={}){
  identity(requestId);need(Number.isSafeInteger(intervalMs)&&intervalMs>=50&&intervalMs<=60000&&
   Number.isSafeInteger(timeoutMs)&&timeoutMs>=0,'PROJECT_PORTFOLIO_WAIT');
  const deadline=new AbortController(),expires=Date.now()+timeoutMs;let timer=null,lastStatus;
  const expire=()=>{
   const remaining=expires-Date.now();
   if(remaining>0){timer=setTimeout(expire,Math.min(remaining,2147483647));timer.unref?.();return;}
   deadline.abort(Object.assign(new Error('The original request remains saved; continue reading the same request ID.'),
    {code:'PROJECT_PORTFOLIO_WAIT_TIMEOUT',requestId,...(lastStatus?{original:lastStatus}:{})}));
  };
  return (async()=>{
   if(timeoutMs)expire();
   try{return await this.#tracked(async signal=>{
    try{
     while(true){
      signal.throwIfAborted();const result=await this.requestStatus(requestId,{signal});lastStatus=result;
      if(['COMPLETE','FAILED'].includes(result.state))
       return includeResult?await this.request(requestId,{signal}):result;
      await delay(intervalMs,undefined,{signal});
     }
    }catch(error){if(signal.aborted)throw signal.reason;throw error;}
   },requestId,deadline.signal);}
   finally{if(timer!==null)clearTimeout(timer);}
  })();
 }
 uploadFile(path,{archive=false,expectedSha256,name}={}){
  path=fullPath(path);if(expectedSha256)identity(expectedSha256);
  const maximum=archive?MAX_ARCHIVE_BYTES:MAX_SOURCE_BYTES;name=filename(name??basename(path));
  return this.#tracked(async signal=>{
   await this.ready();signal.throwIfAborted();
   const selected=await inspectProjectPortfolioFile(path,{maximum,expectedSha256});
   const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   let response=null;
   try{
    const first=await handle.stat({bigint:true});
    need(first.isFile()&&Number(first.size)===selected.bytes,'PROJECT_PORTFOLIO_FILE_CHANGED');
    const hash=createHash('sha256');let read=0;
    async function* content(){
     const buffer=Buffer.alloc(1024*1024);
     while(read<selected.bytes){
      signal.throwIfAborted();
      const part=await handle.read(buffer,0,Math.min(buffer.length,selected.bytes-read),read);
      need(part.bytesRead>0,'PROJECT_PORTFOLIO_FILE_TRUNCATED');
      const chunk=Buffer.from(buffer.subarray(0,part.bytesRead));hash.update(chunk);read+=chunk.length;yield chunk;
     }
    }
    response=await this.#fetch(archive?'/api/archive-upload':'/api/upload',{method:'POST',signal,body:content(),
     headers:{'Content-Type':'application/octet-stream','Content-Length':String(selected.bytes),'X-Source-Name':encodeURIComponent(name)}});
    await success(response);const original=parseJson(await readProjectPortfolioResponse(response,65536));
    need(read===selected.bytes&&hash.digest('hex')===selected.sha256&&same(first,await handle.stat({bigint:true}))&&
     same(first,await lstat(path,{bigint:true}))&&original.sha256===selected.sha256&&original.bytes===selected.bytes,
     'PROJECT_PORTFOLIO_UPLOAD_CHANGED');
    return original;
   }finally{await response?.body?.cancel().catch(()=>{});await handle.close();}
  });
 }
 download({sha256,requestId,expectedSha256,expectedBytes,name='original.bin'},destination){
  need(Boolean(sha256)!==Boolean(requestId),'PROJECT_PORTFOLIO_DOWNLOAD_SELECTION');
  const path=sha256?'/api/download/'+identity(sha256):'/api/archives/'+identity(requestId);
  const expected=identity(expectedSha256??sha256,'file SHA-256');count(expectedBytes,MAX_ARCHIVE_BYTES);
  return this.#response(path,{query:sha256?{filename:filename(name)}:undefined,requestId},
   response=>retainResponse(response,destination,{expectedSha256:expected,expectedBytes}));
 }
 cancelWait(requestId){
  identity(requestId);let cancelled=0;
  for(const value of this.#active.values())if(value.requestId===requestId){
   value.controller.abort(Object.assign(new Error('The local wait was cancelled.'),{code:'PROJECT_PORTFOLIO_WAIT_CANCELLED'}));cancelled++;
  }
  return {requestId,cancelled};
 }
 close(){
  if(!this.#close){this.#closed=true;
   for(const value of this.#active.values())value.controller.abort(new Error('Project Portfolio client closed.'));
   this.#close=Promise.allSettled([...this.#active.keys()]).then(()=>undefined);
  }
  return this.#close;
 }
}
