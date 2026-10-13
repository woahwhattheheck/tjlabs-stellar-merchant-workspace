// MIT. Typed SDK borrower of the same authenticated original MPC store.
import {createHash} from 'node:crypto';
import {readConnection} from './binding.mjs';
import {absolute,branch,plain,need,HASH,UUID,SOURCE_SHA256,MAX_BLOB,localUrl,canonical,sha,bytes} from './contract.mjs';
export class MpcRecoveryError extends Error{
 constructor(code,message,{status=null,result=null,uncertain=false,requestId=null}={}){super(message);this.name='MpcRecoveryError';Object.assign(this,{code,status,result,uncertain,requestId});}
}
const clone=x=>JSON.parse(canonical(x)),integer=(x,max=Number.MAX_SAFE_INTEGER)=>{need(Number.isSafeInteger(x)&&x>=0&&x<=max,'INTEGER');return x;};
function expected(value){need(plain(value)&&typeof value.workspaceId==='string'&&Number.isSafeInteger(value.revision)&&value.revision>=0&&HASH.test(value.snapshotSha256??''),'EXPECTED');return{workspaceId:value.workspaceId,revision:value.revision,snapshotSha256:value.snapshotSha256};}
async function responseBytes(response,maximum,onChunk){
 const declared=response.headers.get('content-length');need(declared===null||/^\d+$/.test(declared)&&Number(declared)<=maximum,'RESPONSE_CAPACITY');
 const hash=createHash('sha256'),chunks=[];let count=0;
 try{for await(const chunk of response.body??[]){const b=Buffer.from(chunk);count+=b.length;need(count<=maximum,'RESPONSE_CAPACITY');hash.update(b);if(onChunk)await onChunk(b);else chunks.push(b);}}
 catch(e){try{await response.body?.cancel();}catch{}throw e;}
 need(declared===null||count===Number(declared),'RESPONSE_INCOMPLETE');return{bytes:count,sha256:hash.digest('hex'),...(onChunk?{}:{data:Buffer.concat(chunks,count)})};
}
export class MpcRecoveryClient{
 #file;#owner;#timeout;#pending=new Set();#closing=false;
 constructor({connectionFile,storeId,storeDirectory,timeoutMs=300000}){
  need(UUID.test(storeId??''),'STORE');this.#file=absolute(connectionFile);this.#owner={storeId,workspaceDirectory:absolute(storeDirectory)};
  need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=3600000,'TIMEOUT');this.#timeout=timeoutMs;
 }
 get selectedStore(){return{storeId:this.#owner.storeId,storeDirectory:this.#owner.workspaceDirectory};}
 #track(job){need(!this.#closing,'CLIENT_CLOSED');need(this.#pending.size===0,'CLIENT_BUSY','Await the original call before another managed operation.');const p=Promise.resolve().then(job);this.#pending.add(p);p.then(()=>this.#pending.delete(p),()=>this.#pending.delete(p));return p;}
 async #call(path,{body,query={},mutation=false,onChunk,maximum=112*1024*1024}={}){
  const connection=await readConnection(this.#file,this.#owner),base=localUrl(connection.url),url=new URL(path,base);
  for(const[k,v]of Object.entries(query))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
  const headers={Authorization:'Bearer '+base.hash.slice(1),'X-MPC-Store-Id':this.#owner.storeId,'X-MPC-Store-Directory':this.#owner.workspaceDirectory};
  let content;if(body!==undefined){content=canonical(body);need(Buffer.byteLength(content)<=112*1024*1024,'REQUEST_CAPACITY');headers['Content-Type']='application/json';headers['Content-Length']=String(Buffer.byteLength(content));}
  let response;try{response=await fetch(url,{method:body===undefined?'GET':'POST',body:content,headers,redirect:'error',signal:AbortSignal.timeout(this.#timeout)});}
  catch(e){throw new MpcRecoveryError('MPC_RECOVERY_TRANSPORT','The original local request has no returned outcome. Inspect its original request before repeating a mutation.',{uncertain:mutation,requestId:body?.requestId??null});}
  if(!response.ok){let result;try{result=JSON.parse((await responseBytes(response,1024*1024)).data.toString('utf8'));}catch{result={error:{code:'HTTP_'+response.status,message:'The original error body is unavailable.'}};}
   throw new MpcRecoveryError(result.error?.code??'HTTP_'+response.status,result.error?.message??'Original managed request failed.',{status:response.status,result,uncertain:mutation&&result.notCommitted!==true,requestId:body?.requestId??result.requestId??null});}
  try{
   const received=await responseBytes(response,maximum,onChunk);
   if(onChunk)return{...received,mediaType:response.headers.get('content-type')??'application/octet-stream',headers:response.headers};
   const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(received.data));need(envelope.ok===true&&Object.hasOwn(envelope,'result'),'RESPONSE');return envelope.result;
  }catch(e){throw new MpcRecoveryError(e.code??'MPC_RECOVERY_RESPONSE',e.message,{status:response.status,uncertain:mutation,requestId:body?.requestId??null});}
 }
 state(){return this.#track(async()=>{const s=await this.#call('/api/state');need(s.id===this.#owner.storeId&&s.directory===this.#owner.workspaceDirectory&&s.sourceSha256===SOURCE_SHA256,'STORE_CHANGED');return s;});}
 branches(){return this.#track(()=>this.#call('/api/branches'));}
 branch(id){need(typeof id==='string'&&id.length>0&&id.length<180,'BRANCH');return this.#track(()=>this.#call('/api/branches/'+encodeURIComponent(id)));}
 request(requestId){need(typeof requestId==='string'&&requestId.length>0&&requestId.length<=200,'REQUEST');return this.#track(()=>this.#call('/api/requests/'+encodeURIComponent(requestId)));}
 #mutation(path,input){const body=clone(input);need(UUID.test(body.requestId??''),'REQUEST','Supply one original request UUID before dispatch.');return this.#track(()=>this.#call(path,{body,mutation:true}));}
 createBranch(input){return this.#mutation('/api/branches/create',input);}
 saveSnapshot(input){const value=clone(input);value.expected=expected(value.expected);return this.#mutation('/api/branches/save',value);}
 command(input){const value=clone(input);value.expected=expected(value.expected);return this.#mutation('/api/branches/command',value);}
 importProposal(input){const value=clone(input);value.expected=expected(value.expected);return this.#mutation('/api/branches/proposal',value);}
 report(input){const body=clone(input);if(body.expected)body.expected=expected(body.expected);return this.#track(()=>this.#call('/api/report',{body}));}
 historyPage(input){const body=clone(input);body.expected=expected(body.expected);body.offset=integer(body.offset??0);body.limit=integer(body.limit??100,100);need(body.limit>0,'LIMIT');return this.#track(()=>this.#call('/api/history',{body}));}
 history(input){return this.#history(clone(input));}
 async *#history(input){let offset=0;do{const page=await this.historyPage({...input,offset});need(page.offset===offset&&page.workspaceId===input.expected.workspaceId&&page.revision===input.expected.revision&&page.snapshotSha256===input.expected.snapshotSha256&&Number.isSafeInteger(page.total),'PAGE_CHANGED');yield page;
  const next=page.nextOffset;need(next===null||Number.isSafeInteger(next)&&next>offset&&next<page.total,'PAGE_CHANGED');offset=next;}while(offset!==null);}
 exportBranch(input){const body=clone(input);body.expected=expected(body.expected);return this.#track(()=>this.#call('/api/branches/export',{body}));}
 downloadSource(input,onChunk){
  const selected=clone(input);selected.expected=expected(selected.expected);need(typeof onChunk==='function'&&typeof selected.id==='string'&&typeof selected.sourceId==='string'&&HASH.test(selected.sha256??''),'SOURCE');integer(selected.bytes,8*1024*1024);
  return this.#track(async()=>{const r=await this.#call('/api/branches/'+encodeURIComponent(selected.id)+'/sources/'+encodeURIComponent(selected.sourceId),{query:selected.expected,onChunk,maximum:8*1024*1024});
   need(r.bytes===selected.bytes&&r.sha256===selected.sha256&&r.headers.get('x-mpc-source-sha256')===selected.sha256&&r.headers.get('x-mpc-snapshot-sha256')===selected.expected.snapshotSha256&&r.headers.get('x-mpc-branch-id')===selected.id,'SOURCE_CHANGED');return{bytes:r.bytes,sha256:r.sha256,mediaType:r.mediaType};});
 }
 receiveFile(input,file,descriptor){
  const frozen=clone(input),want={bytes:descriptor.bytes,sha256:descriptor.sha256};absolute(file);integer(want.bytes,104*1024*1024);need(HASH.test(want.sha256??'')&&UUID.test(frozen.requestId??''),'FILE');
  return this.#track(async()=>{const raw=await bytes(file,104*1024*1024);need(raw.length===want.bytes&&sha(raw)===want.sha256,'FILE_CHANGED');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   const snapshot=value.format==='mpc-recovery-portable.v1'?value.snapshot:value;
   if(value.format==='mpc-recovery-portable.v1')need(value.sha256===sha(canonical(snapshot)),'SNAPSHOT_HASH');
   const body={...frozen,snapshot,origin:{...(frozen.origin??{}),kind:'PORTABLE_RECEIVE',receivedFileSha256:want.sha256,receivedFileBytes:want.bytes}};
   return this.#call('/api/branches/create',{body,mutation:true});});
 }
 importSourceFile(input,file,descriptor){
  const frozen=clone(input),want={bytes:descriptor.bytes,sha256:descriptor.sha256};frozen.expected=expected(frozen.expected);absolute(file);integer(want.bytes,8*1024*1024);need(HASH.test(want.sha256??'')&&UUID.test(frozen.requestId??''),'FILE');
  return this.#track(async()=>{const raw=await bytes(file,8*1024*1024);need(raw.length===want.bytes&&sha(raw)===want.sha256,'FILE_CHANGED');
   const command=frozen.command;need(command?.type==='source.import'&&plain(command.payload)&&['utf8','base64'].includes(command.payload.encoding),'SOURCE_COMMAND');
   const content=command.payload.encoding==='base64'?raw.toString('base64'):new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
   const body={...frozen,command:{...command,payload:{...command.payload,content,bytes:raw.length,sha256:want.sha256}}};return this.#call('/api/branches/command',{body,mutation:true});});
 }
 async close(){this.#closing=true;await Promise.allSettled([...this.#pending]);}
}
export const createMpcRecoveryClient=options=>new MpcRecoveryClient(options);
