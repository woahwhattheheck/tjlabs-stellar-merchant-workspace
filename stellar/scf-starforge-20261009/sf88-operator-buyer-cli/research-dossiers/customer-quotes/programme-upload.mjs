// MIT. Resume the original programme archive upload on one private retained inode.
import {constants as C} from 'node:fs';
import {open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {need,digest,jsonBytes,exists,syncDirectory} from '../../node/store.mjs';
import {withCustomerOperation,retainCustomerJson} from '../customer-updates/files.mjs';
import {RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,_programmeHash,_programmeCount,_programmeSame,
 _programmeAbsolute,_programmeIdentity,_programmeUsing,_programmeSyncClose,_programmeOpen,
 _programmeRead,_programmeWrite,_programmeFileHash,_programmeReadJson,_programmeInitial} from './programme-archive.mjs';

export const RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK=4*1024*1024;
export const RESEARCH_QUOTE_PROGRAMME_UPLOAD_SCHEMA='sf88-research-quotation-programme-upload/v1';
const PAYLOAD='sf88-research-quotation-programme-upload-payload/v1';
const CHUNK='sf88-research-quotation-programme-upload-chunk/v1';
const COMPLETE='sf88-research-quotation-programme-upload-complete/v1';
const FILE='upload.sfhandover',PENDING='upload-pending.json';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function input(value){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')==='bytes,id,name,sha256','RESEARCH_QUOTE_UPLOAD_INPUT_REQUIRED');
 need(typeof value.id==='string'&&UUID.test(value.id),'RESEARCH_QUOTE_UPLOAD_ID_REQUIRED');
 need(typeof value.name==='string'&&value.name===value.name.trim()&&value.name.length>0&&
  Buffer.byteLength(value.name)<=255&&!/[\\/\x00-\x1f\x7f]/.test(value.name)&&!value.name.startsWith('.'),
  'RESEARCH_QUOTE_UPLOAD_NAME_REQUIRED');
 return {schema:RESEARCH_QUOTE_PROGRAMME_UPLOAD_SCHEMA,id:value.id,name:value.name,
  totalBytes:_programmeCount(value.bytes,RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,1),sha256:_programmeHash(value.sha256)};
}
function original(value){
 const captured=input({id:value?.id,name:value?.name,bytes:value?.totalBytes,sha256:value?.sha256});
 need(_programmeSame(captured,value),'RESEARCH_QUOTE_UPLOAD_CHANGED');return captured;
}
function pendingRecord(value,metadata){
 need(value?.schema===CHUNK&&Object.keys(value).sort().join(',')==='bytes,offset,schema,sha256',
  'RESEARCH_QUOTE_UPLOAD_CHANGED');
 _programmeCount(value.offset);_programmeCount(value.bytes,RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,1);
 _programmeHash(value.sha256);
 need(value.offset+value.bytes<=metadata.totalBytes,'RESEARCH_QUOTE_UPLOAD_CHANGED');return value;
}
const chunkView=value=>value?{offset:value.offset,bytes:value.bytes,sha256:value.sha256}:null;
function reject(code,metadata,receivedBytes,pending){
 const error=new Error(code);error.code=code;error.status=409;
 Object.assign(error,{id:metadata.id,totalBytes:metadata.totalBytes,receivedBytes,pendingChunk:chunkView(pending)});
 throw error;
}
async function payload(root,metadata,{initialize=false,writable=false}={}){
 const retained=await _programmeReadJson(root,'upload-payload.json',true),path=join(root,FILE);
 if(!await exists(path)){
  need(initialize&&!retained&&!await exists(join(root,PENDING))&&!await exists(join(root,'upload-complete.json')),
   'RESEARCH_QUOTE_UPLOAD_PAYLOAD_MISSING');
  const handle=await open(path,C.O_CREAT|C.O_EXCL|C.O_RDWR|(C.O_NOFOLLOW??0),0o600);
  await _programmeSyncClose(handle);await syncDirectory(root);
 }
 const held=await _programmeOpen(path,{writable});
 try{
  need(held.bytes<=metadata.totalBytes,'RESEARCH_QUOTE_UPLOAD_CHANGED');
  const selected={schema:PAYLOAD,device:held.identity.device,inode:held.identity.inode};
  if(retained)need(_programmeSame(retained,selected),'RESEARCH_QUOTE_UPLOAD_CHANGED');
  else{
   need(initialize&&held.bytes===0&&!await exists(join(root,PENDING))&&!await exists(join(root,'upload-complete.json')),
    'RESEARCH_QUOTE_UPLOAD_CHANGED');
   await retainCustomerJson(root,'upload-payload.json',selected);
  }
  return held;
 }catch(error){
  // The common owner helper preserves any failed original closer on this primary error.
  return _programmeUsing(held,async()=>{throw error;});
 }
}
async function pending(root,metadata,held){
 const value=await _programmeReadJson(root,PENDING,true);
 if(!value)return null;
 pendingRecord(value,metadata);
 const size=Number((await held.assertHeld({stable:false})).size),end=value.offset+value.bytes;
 if(size<value.offset||size>end)reject('RESEARCH_QUOTE_UPLOAD_OFFSET',metadata,size,value);
 if(size<end)return value;
 need(digest(await _programmeRead(held,value.offset,value.bytes))===value.sha256,'RESEARCH_QUOTE_UPLOAD_CHUNK_CHANGED');
 await held.handle.sync();
 need(_programmeSame(await _programmeReadJson(root,PENDING),value),'RESEARCH_QUOTE_UPLOAD_CHANGED');
 await unlink(join(root,PENDING));await syncDirectory(root);return null;
}
function completion(value,metadata,stat){
 need(value?.schema===COMPLETE&&value.id===metadata.id&&value.inputSha256===digest(jsonBytes(metadata))&&
  value.bytes===metadata.totalBytes&&value.sha256===metadata.sha256&&
  _programmeSame(value.identity,_programmeIdentity(stat)),'RESEARCH_QUOTE_UPLOAD_CHANGED');
 return value;
}
async function view(root,metadata,held,{pendingChunk=null}={}){
 const stat=await held.assertHeld({stable:false}),size=Number(stat.size);
 const complete=await _programmeReadJson(root,'upload-complete.json',true);
 const result={id:metadata.id,name:metadata.name,totalBytes:metadata.totalBytes,receivedBytes:size,
  chunkBytes:RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,pendingChunk:chunkView(pendingChunk)};
 if(complete){
  completion(complete,metadata,stat);
  return {...result,pendingChunk:null,state:'COMPLETE',path:held.path,bytes:complete.bytes,sha256:complete.sha256};
 }
 return {...result,state:size===metadata.totalBytes&&!pendingChunk?'READY_TO_FINISH':'UPLOADING'};
}
export async function startResearchQuoteProgrammeUpload(raw){
 const directory=_programmeAbsolute(raw?.directory),metadata=input(raw?.input);
 return withCustomerOperation(directory,async root=>{
  const previous=await _programmeReadJson(root,'upload-operation.json',true);
  need(!previous||_programmeSame(original(previous),metadata),'RESEARCH_QUOTE_UPLOAD_INPUT_CHANGED');
  await _programmeInitial(root,'upload-operation.json',metadata);
  await retainCustomerJson(root,'upload-operation.json',metadata);
  const held=await payload(root,metadata,{initialize:true});
  return _programmeUsing(held,async file=>{
   const complete=await _programmeReadJson(root,'upload-complete.json',true);
   const pendingChunk=complete?null:await pending(root,metadata,file);
   return view(root,metadata,file,{pendingChunk});
  });
 });
}
export async function inspectResearchQuoteProgrammeUpload(directory){
 _programmeAbsolute(directory);
 return withCustomerOperation(directory,async root=>{
  const metadata=original(await _programmeReadJson(root,'upload-operation.json'));
  // Complete only the already-accepted empty initialization; retained payload loss still rejects.
  const held=await payload(root,metadata,{initialize:true});
  return _programmeUsing(held,async file=>{
   const complete=await _programmeReadJson(root,'upload-complete.json',true);
   const pendingChunk=complete?null:await pending(root,metadata,file);
   return view(root,metadata,file,{pendingChunk});
  });
 });
}
export async function appendResearchQuoteProgrammeUpload(raw){
 const directory=_programmeAbsolute(raw?.directory),offset=_programmeCount(raw?.offset),sha256=_programmeHash(raw?.sha256);
 need(raw.data instanceof Uint8Array&&raw.data.length>0&&raw.data.length<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,
  'RESEARCH_QUOTE_UPLOAD_CHUNK_REQUIRED');
 const data=Buffer.from(raw.data);
 need(digest(data)===sha256,'RESEARCH_QUOTE_UPLOAD_CHUNK_CHANGED');
 return withCustomerOperation(directory,async root=>{
  const metadata=original(await _programmeReadJson(root,'upload-operation.json'));
  need(offset+data.length<=metadata.totalBytes,'RESEARCH_QUOTE_UPLOAD_OFFSET');
  const complete=await _programmeReadJson(root,'upload-complete.json',true);
  const held=await payload(root,metadata,{writable:!complete});
  return _programmeUsing(held,async file=>{
   if(complete){
    const result=await view(root,metadata,file);
    need((await _programmeRead(file,offset,data.length)).equals(data),'RESEARCH_QUOTE_UPLOAD_CHUNK_CHANGED');
    await file.assertHeld({stable:true});return result;
   }
   const outstanding=await pending(root,metadata,file),size=Number((await file.assertHeld({stable:false})).size);
   const requested={schema:CHUNK,offset,bytes:data.length,sha256};
   if(outstanding&&!_programmeSame(outstanding,requested))reject('RESEARCH_QUOTE_UPLOAD_PENDING',metadata,size,outstanding);
   if(offset>size)reject('RESEARCH_QUOTE_UPLOAD_OFFSET',metadata,size,outstanding);
   const overlap=Math.min(data.length,size-offset);
   if(overlap)need((await _programmeRead(file,offset,overlap)).equals(data.subarray(0,overlap)),
    'RESEARCH_QUOTE_UPLOAD_CHUNK_CHANGED');
   if(offset+data.length<=size){await file.handle.sync();return view(root,metadata,file);}
   await retainCustomerJson(root,PENDING,requested);
   await _programmeWrite(file.handle,data.subarray(overlap),offset+overlap);
   await file.handle.sync();
   need(Number((await file.assertHeld({stable:false})).size)===offset+data.length,'RESEARCH_QUOTE_UPLOAD_CHANGED');
   need(!await pending(root,metadata,file),'RESEARCH_QUOTE_UPLOAD_INCOMPLETE');
   return view(root,metadata,file);
  });
 });
}
export async function finishResearchQuoteProgrammeUpload(raw){
 const directory=_programmeAbsolute(raw?.directory);
 return withCustomerOperation(directory,async root=>{
  const metadata=original(await _programmeReadJson(root,'upload-operation.json'));
  const held=await payload(root,metadata);
  return _programmeUsing(held,async file=>{
   const complete=await _programmeReadJson(root,'upload-complete.json',true);
   if(complete)return view(root,metadata,file);
   const pendingChunk=await pending(root,metadata,file),stat=await file.assertHeld({stable:true});
   if(pendingChunk||Number(stat.size)!==metadata.totalBytes)
    reject('RESEARCH_QUOTE_UPLOAD_INCOMPLETE',metadata,Number(stat.size),pendingChunk);
   const sha256=await _programmeFileHash(file);
   need(sha256===metadata.sha256,'RESEARCH_QUOTE_UPLOAD_HASH_CHANGED');
   await file.handle.sync();
   const identity=_programmeIdentity(await file.assertHeld({stable:true}));
   await retainCustomerJson(root,'upload-complete.json',{schema:COMPLETE,id:metadata.id,
    inputSha256:digest(jsonBytes(metadata)),bytes:metadata.totalBytes,sha256,identity});
   return view(root,metadata,file);
  });
 });
}
