// MIT. Stream one original programme archive into the existing destination uploader.
import {createHash} from 'node:crypto';
import {need} from '../../node/store.mjs';
import {openResearchQuoteProgrammeArchive,RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,_programmeAbsolute}
 from './programme-archive.mjs';
import {RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK} from './programme-upload.mjs';
import {id,hash} from './contracts.mjs';

export const RESEARCH_QUOTE_PROGRAMME_TRANSFER_SCHEMA='sf88-research-quotation-programme-transfer/v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function length(value){
 need(Number.isSafeInteger(value)&&value>0&&value<=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,
  'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LENGTH_INVALID');return value;
}
function cancellation(signal){
 need(signal===undefined||signal&&typeof signal.throwIfAborted==='function',
  'RESEARCH_QUOTE_PROGRAMME_SIGNAL_INVALID');return signal;
}
function capture(value,remote){
 need(value&&typeof value==='object'&&!Array.isArray(value),'RESEARCH_QUOTE_PROGRAMME_TRANSFER_REQUIRED');
 const input={uploadId:id(value.uploadId),bytes:length(value.bytes),sha256:hash(value.sha256),signal:cancellation(value.signal)};
 if(remote){input.archiveId=id(value.archiveId);input.manifestSha256=hash(value.manifestSha256);}
 else input.path=_programmeAbsolute(value.path);
 return input;
}
function workspace(info){
 need(/^research_[a-f0-9]{64}$/.test(info?.workspaceId??''),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
 return info.workspaceId;
}
function api(value){
 need(value&&typeof value.withWork==='function','RESEARCH_QUOTE_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');return value;
}
/** Admit every borrowed host synchronously before any transfer work or await.
 * Each admission holds its original owner's pending set until the shared work settles.
 */
function admitted(apis,work){
 const views=new Array(apis.length);let remaining=apis.length,readyAccept,readyReject,finishAccept,finishReject;
 const ready=new Promise((accept,reject)=>{readyAccept=accept;readyReject=reject;});
 const finished=new Promise((accept,reject)=>{finishAccept=accept;finishReject=reject;});
 ready.catch(()=>{});finished.catch(()=>{});
 const fail=error=>{readyReject(error);finishReject(error);};
 const owners=[];
 for(let index=0;index<apis.length;index++){
  try{
   const owner=Promise.resolve(apis[index].withWork(view=>{
    need(!views[index],'RESEARCH_QUOTE_PROGRAMME_ADMISSION_CHANGED');
    views[index]=view;if(--remaining===0)readyAccept(views);
    return finished;
   }));
   owner.then(()=>{if(!views[index])fail(new Error('RESEARCH_QUOTE_PROGRAMME_ADMISSION_MISSING'));},fail);
   owners.push(owner);
  }catch(error){fail(error);break;}
 }
 const action=ready.then(selected=>work(...selected));
 action.then(finishAccept,finishReject);
 return Promise.allSettled([...owners,action]).then(results=>{
  const actual=results.at(-1);
  if(actual.status==='rejected')throw actual.reason;
  const rejected=results.find(result=>result.status==='rejected');
  if(rejected){
   if(actual.value&&rejected.reason&&typeof rejected.reason==='object')rejected.reason.transfer=actual.value;
   throw rejected.reason;
  }
  return actual.value;
 });
}
function progress(value,input){
 need(value?.id===input.uploadId&&value.name==='research-programme-'+input.sha256+'.sf88q.gz'&&
  value.totalBytes===input.bytes&&Number.isSafeInteger(value.receivedBytes)&&value.receivedBytes>=0&&
  value.receivedBytes<=input.bytes&&value.chunkBytes===RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK&&
  ['UPLOADING','READY_TO_FINISH','COMPLETE'].includes(value.state),'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
 if(value.pendingChunk){
  const row=value.pendingChunk;
  need(Number.isSafeInteger(row.offset)&&row.offset>=0&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&
   row.bytes<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK&&row.offset+row.bytes<=input.bytes&&
   row.offset<=value.receivedBytes&&value.receivedBytes<=row.offset+row.bytes,
   'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');hash(row.sha256);
 }
 if(value.state==='COMPLETE')need(value.bytes===input.bytes&&value.sha256===input.sha256&&
  value.receivedBytes===input.bytes&&value.pendingChunk===null&&typeof value.path==='string',
  'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
 return value;
}
async function upload(destination,input,read){
 input.signal?.throwIfAborted();
 let state=progress(await destination.startUpload({id:input.uploadId,name:'research-programme-'+input.sha256+'.sf88q.gz',
  bytes:input.bytes,sha256:input.sha256},{signal:input.signal}),input);
 const reused=state.state==='COMPLETE';
 while(state.state!=='COMPLETE'&&(state.receivedBytes<input.bytes||state.pendingChunk)){
  input.signal?.throwIfAborted();
  const pending=state.pendingChunk,offset=pending?.offset??state.receivedBytes,
   amount=pending?.bytes??Math.min(RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,input.bytes-offset);
  const body=await read(offset,amount);
  need(body instanceof Uint8Array&&body.length===amount,'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');
  const digest=sha(body);
  need(!pending||digest===pending.sha256,'RESEARCH_QUOTE_PROGRAMME_PENDING_SOURCE_CHANGED');
  const next=progress(await destination.appendUpload(input.uploadId,{offset,data:body,sha256:digest,signal:input.signal}),input);
  need(next.receivedBytes>=offset+amount&&next.receivedBytes>=state.receivedBytes&&!next.pendingChunk,
   'RESEARCH_QUOTE_PROGRAMME_UPLOAD_STALLED');state=next;
 }
 if(state.state!=='COMPLETE')state=progress(await destination.finishUpload(input.uploadId,{signal:input.signal}),input);
 need(state.state==='COMPLETE','RESEARCH_QUOTE_PROGRAMME_UPLOAD_INCOMPLETE');return {upload:state,reused};
}
async function readHeld(held,offset,length){
 await held.assertHeld();
 const bytes=Buffer.allocUnsafe(length);let at=0;
 while(at<length){
  const item=await held.handle.read(bytes,at,length-at,offset+at);
  need(item.bytesRead>0,'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');at+=item.bytesRead;
 }
 await held.assertHeld();return bytes;
}
function closeFailure(primary,error,closer){
 const failure=primary??error,previous=typeof failure.close==='function'?failure.close.bind(failure):null;
 failure.close=async()=>{
  let first;
  if(previous)try{await previous();}catch(error){first=error;}
  try{await closer();}catch(error){first??=error;}
  if(first)throw first;
 };
 if(primary)failure.researchQuoteProgrammeCloseError=error;
 return failure;
}
export class ResearchQuoteProgrammeTransfers {
 constructor(){
  this.pending=new Set();this.owners=new Set();this.retainedClosers=new WeakSet();
  this.stopping=false;this.closed=false;this.closing=null;
 }
 run(work){
  need(!this.stopping,'RESEARCH_QUOTE_PROGRAMME_TRANSFER_CLOSING');
  // work enters both original client admissions synchronously, before returning a promise.
  let task;try{task=Promise.resolve(work());}catch(error){task=Promise.reject(error);}
  task=task.catch(error=>{
   if(error&&typeof error==='object'&&typeof error.close==='function'&&!this.retainedClosers.has(error)){
    this.retainedClosers.add(error);this.owners.add({close:error.close.bind(error)});
   }
   throw error;
  });
  this.pending.add(task);task.then(()=>this.pending.delete(task),()=>this.pending.delete(task));return task;
 }
 uploadFile(destinationApi,value){
  const input=capture(value,false);api(destinationApi);
  return this.run(()=>admitted([destinationApi],async destination=>{
   const destinationId=workspace(await destination.info({signal:input.signal}));
   let held,result,failure;
   try{
    const received=await upload(destination,input,async(offset,amount)=>{
     if(!held){
      held=await openResearchQuoteProgrammeArchive({path:input.path,bytes:input.bytes,sha256:input.sha256});
      this.owners.add(held);
     }
     return readHeld(held,offset,amount);
    });
    if(held)await held.assertHeld();
    result={schema:RESEARCH_QUOTE_PROGRAMME_TRANSFER_SCHEMA,
     source:{kind:'FILE',path:input.path,bytes:input.bytes,sha256:input.sha256},
     destination:{workspaceId:destinationId,uploadId:input.uploadId,upload:received.upload},reused:received.reused};
   }catch(error){failure=error;}
   if(held)try{await held.close();this.owners.delete(held);}
   catch(error){failure=closeFailure(failure,error,()=>held.close());}
   if(failure){if(result)failure.transfer=result;throw failure;}
   return result;
  }));
 }
 transferTo(sourceApi,destinationApi,value){
  const input=capture(value,true);api(sourceApi);api(destinationApi);
  return this.run(()=>admitted([sourceApi,destinationApi],async(source,destination)=>{
   input.signal?.throwIfAborted();
   const [sourceInfo,destinationInfo]=await Promise.all([
    source.info({signal:input.signal}),destination.info({signal:input.signal})]);
   const sourceId=workspace(sourceInfo),destinationId=workspace(destinationInfo),
    archive=await source.archive(input.archiveId,{signal:input.signal});
   need(archive.workspaceId===sourceId&&archive.id===input.archiveId&&archive.bytes===input.bytes&&
    archive.sha256===input.sha256&&archive.manifestSha256===input.manifestSha256,
    'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');
   const received=await upload(destination,input,(offset,limit)=>source.readArchiveRange(input.archiveId,
    {offset,limit,bytes:input.bytes,sha256:input.sha256,signal:input.signal}));
   return {schema:RESEARCH_QUOTE_PROGRAMME_TRANSFER_SCHEMA,
    source:{kind:'ARCHIVE',workspaceId:sourceId,archiveId:input.archiveId,archive},
    destination:{workspaceId:destinationId,uploadId:input.uploadId,upload:received.upload},reused:received.reused};
  }));
 }
 close(){
  this.stopping=true;
  if(this.closed)return Promise.resolve();if(this.closing)return this.closing;
  this.closing=(async()=>{
   while(this.pending.size)await Promise.allSettled([...this.pending]);
   const failures=[];
   for(const owner of [...this.owners])try{await owner.close();this.owners.delete(owner);}catch(error){failures.push(error);}
   if(failures.length){
    const error=failures[0];error.researchQuoteProgrammeCloseErrors=failures.slice(1);
    error.close=()=>this.close();throw error;
   }
   this.closed=true;
  })().catch(error=>{this.closing=null;throw error;});
  return this.closing;
 }
}
