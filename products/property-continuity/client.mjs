// MIT. Authenticated borrower of the original Python HTTP application.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {readConnection} from './binding.mjs';
import {absolute,branch,plain,need,HASH,UUID,SOURCE_SHA256,MAX_BLOB,MAX_ARCHIVE,localUrl,canonical,sha} from './contract.mjs';
export class PropertyContinuityError extends Error{
 constructor(code,message,{status=null,result=null,uncertain=false,operation=null}={}){
  super(message);this.name='PropertyContinuityError';Object.assign(this,{code,status,result,uncertain,operation});
 }
}
const integer=(n,max=Number.MAX_SAFE_INTEGER)=>{need(Number.isSafeInteger(n)&&n>=0&&n<=max,'INTEGER');return n;};
const id=value=>{need(UUID.test(value??''),'ID');return value;};
const hash=value=>{need(HASH.test(value??''),'HASH');return value;};
const signature=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
async function readResponse(response,maximum,onChunk){
 const declared=response.headers.get('content-length');if(declared!==null)need(/^\d+$/.test(declared)&&Number(declared)<=maximum,'RESPONSE_CAPACITY');
 const parts=[],h=createHash('sha256');let size=0;
 try{for await(const value of response.body??[]){
  const part=Buffer.from(value);size+=part.length;need(size<=maximum,'RESPONSE_CAPACITY');h.update(part);
  if(onChunk)await onChunk(part);else parts.push(part);
 }}catch(error){try{await response.body?.cancel();}catch{}throw error;}
 need(declared===null||size===Number(declared),'RESPONSE_INCOMPLETE');
 return {bytes:size,sha256:h.digest('hex'),...(onChunk?{}:{data:Buffer.concat(parts,size)})};
}
export class PropertyContinuityClient{
 #file;#owner;#branch;#timeout;#closed=false;#pending=new Set();
 constructor({connectionFile,workspaceId,workspaceDirectory,selectedBranch,timeoutMs=300000}){
  this.#file=absolute(connectionFile);this.#owner={workspaceId:id(workspaceId),workspaceDirectory:absolute(workspaceDirectory)};
  this.#branch=branch(selectedBranch??{id:workspaceId,directory:workspaceDirectory});
  need(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=3600000,'TIMEOUT');this.#timeout=timeoutMs;
 }
 get selectedBranch(){return {...this.#branch};}
 get connectionFile(){return this.#file;}
 async #perform(path,{method='GET',query={},body,raw,onChunk,maximum=MAX_ARCHIVE,operation=null,selected=true}={}){
  need(!this.#closed,'CLIENT_CLOSED');
  const saved=await readConnection(this.#file,this.#owner),url=localUrl(saved.url);
  const target=new URL(path,url);for(const [key,value]of Object.entries(query))if(value!==undefined&&value!==null)target.searchParams.set(key,String(value));
  const headers={'X-Workspace-Token':url.searchParams.get('token')};
  if(selected){headers['X-Workspace-Id']=this.#branch.id;headers['X-Workspace-Directory']=this.#branch.directory;}
  let payload;if(body!==undefined){payload=canonical(body);headers['Content-Type']='application/json';headers['Content-Length']=String(Buffer.byteLength(payload));need(Buffer.byteLength(payload)<=24*1024*1024,'REQUEST_CAPACITY');}
  if(raw){payload=raw.body;headers['Content-Type']='application/octet-stream';headers['Content-Length']=String(raw.bytes);}
  let response;
  try{
   response=await fetch(target,{method,headers,body:payload,...(raw?.stream?{duplex:'half'}:{}),redirect:'error',signal:AbortSignal.timeout(this.#timeout)});
  }catch(error){throw new PropertyContinuityError('PROPERTY_CONTINUITY_TRANSPORT','The original local request did not return. Reconcile its retained identity before repeating effects.',{uncertain:method!=='GET',operation});}
  if(!response.ok){
   let result;try{const received=await readResponse(response,1024*1024);result=JSON.parse(received.data.toString('utf8'));}catch{result={error:{code:'HTTP_'+response.status,message:'The original error body was unavailable.'}};}
   throw new PropertyContinuityError(result?.error?.code??'HTTP_'+response.status,result?.error?.message??'Original request failed.',
    {status:response.status,result,operation,uncertain:method!=='GET'&&result?.notCommitted!==true});
  }
  try{
   const received=await readResponse(response,maximum,onChunk);
   if(onChunk)return {...received,mediaType:response.headers.get('content-type')??'application/octet-stream'};
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(received.data));
  }catch(error){
   throw new PropertyContinuityError(error.code??'PROPERTY_CONTINUITY_RESPONSE',error.message,{status:response.status,operation,uncertain:method!=='GET'});
  }
 }
 #track(job){need(!this.#closed,'CLIENT_CLOSED');need(this.#pending.size===0,'CLIENT_BUSY','Await the original call before another branch operation.');const pending=Promise.resolve().then(job);this.#pending.add(pending);pending.then(()=>this.#pending.delete(pending),()=>this.#pending.delete(pending));return pending;}
 #selectedBody(value){return {...value,workspaceId:this.#branch.id,workspaceDirectory:this.#branch.directory};}
 async #state(){
  const value=await this.#perform('/api/state',{selected:false});
  need(value.sourceSha256===SOURCE_SHA256&&value.state?.id===this.#branch.id&&value.directory===this.#branch.directory,'BRANCH_CHANGED','Explicitly open the intended physical branch; no request is rerouted automatically.');
  return value;
 }
 state(){return this.#track(()=>this.#state());}
 branches(){return this.#track(async()=>{const value=await this.#perform('/api/state',{selected:false});need(value.sourceSha256===SOURCE_SHA256,'SOURCE_CHANGED');return {current:{id:value.state.id,directory:value.directory},workspaces:value.openWorkspaces};});}
 openBranch(value){const target=branch(value);return this.#track(async()=>{
  const before=await this.#perform('/api/state',{selected:false});need(before.sourceSha256===SOURCE_SHA256&&before.openWorkspaces.some(x=>x.id===target.id&&x.directory===target.directory),'BRANCH_UNKNOWN');
  await this.#perform('/api/open',{method:'POST',body:{directory:target.directory},selected:false,operation:{kind:'open',branch:target}});
  this.#branch=target;return this.#state();
 });}
 history({offset=0,limit=100}={}){return this.#track(()=>this.#perform('/api/history',{query:{offset:integer(offset),limit:integer(limit,100)}}));}
 request(requestId){return this.#track(()=>this.#perform('/api/request/'+id(requestId)));}
 sourceRows(sourceId,{offset=0,limit=100}={}){return this.#track(()=>this.#perform('/api/source/'+id(sourceId),{query:{offset:integer(offset),limit:integer(limit,100)}}));}
 reportRows(reconciliationId,{offset=0,limit=100,status}={}){return this.#track(()=>this.#perform('/api/report/'+id(reconciliationId),{query:{format:'page',offset:integer(offset),limit:integer(limit,100),status}}));}
 findings(reconciliationId,{offset=0,limit=100,severity}={}){return this.#track(()=>this.#perform('/api/findings/'+id(reconciliationId),{query:{offset:integer(offset),limit:integer(limit,100),severity}}));}
 /** Pages remain original complete envelopes. A changing source/total stops traversal. */
 pages(kind,recordId,options={}){return this.#pages(kind,recordId,JSON.parse(canonical(options)),canonical(this.#branch));}
 async *#pages(kind,recordId,options,selected){
  need(['history','sourceRows','reportRows','findings'].includes(kind),'PAGE_KIND');
  let offset=0,basis=null;do{
   need(canonical(this.#branch)===selected,'BRANCH_CHANGED');
   const page=kind==='history'?await this.history({...options,offset}):await this[kind](recordId,{...options,offset});
   need(page.offset===offset&&Number.isSafeInteger(page.total),'PAGE_CHANGED');
   const identity=canonical({total:page.total,source:page.source??null,reportSha256:page.reportSha256??null,reconciliationId:page.reconciliationId??null});
   if(basis!==null)need(identity===basis,'PAGE_CHANGED','Retain earlier returned pages and select a stable original report.');else basis=identity;
   yield page;const next=page.nextOffset;need(next===null||Number.isSafeInteger(next)&&next>offset&&next<page.total,'PAGE_CHANGED');offset=next;
  }while(offset!==null);
 }
 command(command,expectedRevision){
  need(plain(command)&&UUID.test(command.requestId??''),'COMMAND');integer(expectedRevision);
  // Freeze the complete original envelope before dispatch; the server remains its memoization authority.
  const body=JSON.parse(canonical(this.#selectedBody({command,expectedRevision})));
  return this.#track(()=>this.#perform('/api/command',{method:'POST',body,operation:{kind:'command',requestId:body.command.requestId,expectedRevision}}));
 }
 exportWorkspace(publicationId,revision){
  id(publicationId);integer(revision);const body=this.#selectedBody({publicationId,revision});
  return this.#track(()=>this.#perform('/api/export',{method:'POST',body,operation:{kind:'export',publicationId,revision}}));
 }
 receive({operationId,sha256,bytes,name}){
  id(operationId);hash(sha256);integer(bytes,MAX_ARCHIVE);need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name??''),'RECEIVE_NAME');
  const body=this.#selectedBody({operationId,sha256,bytes,name});
  return this.#track(()=>this.#perform('/api/receive',{method:'POST',body,operation:{kind:'receive',operationId,sha256,bytes,name}}));
 }
 uploadBytes(kind,data,expected){
  expected={bytes:expected.bytes,sha256:expected.sha256};
  need(['blob','archive'].includes(kind)&&Buffer.isBuffer(data),'UPLOAD');hash(expected.sha256);integer(expected.bytes,kind==='blob'?MAX_BLOB:MAX_ARCHIVE);
  need(data.length===expected.bytes&&sha(data)===expected.sha256,'FILE_CHANGED');const frozen=Buffer.from(data);
  return this.#track(()=>this.#perform('/api/'+kind+'/'+expected.sha256,{method:'PUT',raw:{body:frozen,bytes:frozen.length},operation:{kind:'upload-'+kind,...expected}}));
 }
 uploadFile(kind,file,expected){expected={bytes:expected.bytes,sha256:expected.sha256};return this.#track(async()=>{
  need(['blob','archive'].includes(kind),'UPLOAD');absolute(file);hash(expected.sha256);integer(expected.bytes,kind==='blob'?MAX_BLOB:MAX_ARCHIVE);
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const before=await handle.stat({bigint:true});need(before.isFile()&&before.size===BigInt(expected.bytes),'FILE_CHANGED');
   const h=createHash('sha256'),buffer=Buffer.alloc(262144);let position=0;
   while(position<expected.bytes){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,expected.bytes-position),position);need(bytesRead>0,'FILE_CHANGED');h.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
   need(h.digest('hex')===expected.sha256&&signature(before)===signature(await handle.stat({bigint:true})),'FILE_CHANGED');
   async function* content(){
    let at=0;while(at<expected.bytes){const b=Buffer.alloc(Math.min(262144,expected.bytes-at)),r=await handle.read(b,0,b.length,at);need(r.bytesRead===b.length,'FILE_CHANGED');at+=b.length;yield b;}
   }
   const result=await this.#perform('/api/'+kind+'/'+expected.sha256,{method:'PUT',raw:{body:content(),stream:true,bytes:expected.bytes},operation:{kind:'upload-'+kind,...expected}});
   need(result.sha256===expected.sha256&&result.bytes===expected.bytes,'UPLOAD_CHANGED');return result;
  }finally{await handle.close();}
 });}
 download({kind,id:recordId,format='json',expectedSha256,expectedBytes},onChunk){
  need(typeof onChunk==='function','DOWNLOAD','Consume and retain the complete streamed file.');
  let path,query={};if(kind==='blob'){hash(recordId);path='/api/blob/'+recordId;expectedSha256=recordId;}
  else if(kind==='archive'){path='/api/export/'+id(recordId);hash(expectedSha256);integer(expectedBytes,MAX_ARCHIVE);}
  else{need(kind==='report'&&['json','html','csv'].includes(format),'DOWNLOAD_KIND');path='/api/report/'+id(recordId);query={format};}
  return this.#track(async()=>{
   const result=await this.#perform(path,{query,onChunk,maximum:kind==='blob'?MAX_BLOB:MAX_ARCHIVE});
   need(expectedSha256===undefined||result.sha256===expectedSha256,'DOWNLOAD_CHANGED');
   need(expectedBytes===undefined||result.bytes===expectedBytes,'DOWNLOAD_CHANGED');return result;
  });
 }
 async close(){this.#closed=true;await Promise.allSettled([...this.#pending]);}
}
export const createPropertyContinuityClient=options=>new PropertyContinuityClient(options);
