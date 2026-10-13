// MIT. Stream the complete original quotation programme without a second receiving engine.
import {constants as C} from 'node:fs';
import {open,lstat,link,unlink,readdir} from 'node:fs/promises';
import {resolve,isAbsolute,join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip,createGunzip} from 'node:zlib';
import {need,digest,jsonBytes,exists,syncDirectory,matchingWriteTemporaries} from '../../node/store.mjs';
import {customerDirectory,withCustomerOperation,readCustomerJson,retainCustomerBytes,retainCustomerJson}
 from '../customer-updates/files.mjs';
import {QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT} from './contracts.mjs';
import {inspectResearchQuoteHandover,researchQuoteHandoverPath,researchQuoteDistinctDirectories,
 RESEARCH_QUOTE_HANDOVER_SCHEMA} from './programme-files.mjs';

export const RESEARCH_QUOTE_PROGRAMME_ARCHIVE_SCHEMA='sf88-research-quotation-programme-archive/v1';
const OP='sf88-research-quotation-programme-archive-operation/v1';
const STREAM='sf88-research-quotation-programme-stream/v1';
const COMPLETE='sf88-research-quotation-programme-stream-complete/v1';
const NAME='quotation-programme.sfhandover',INPUT='input.sfhandover',MANIFEST='quotation-programme.json';
const MAGIC=Buffer.from('SF-RESEARCH-QUOTE-PROGRAMME-1\n'),BLOCK=65536;
const MEMBER_LIMIT=Math.max(QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT+65536),MEMBERS=40000;
const RAW_LIMIT=MEMBERS*MEMBER_LIMIT+QUOTE_FILE_LIMIT+MAGIC.length+4;
// Includes a conservative stored-block DEFLATE overhead and the complete gzip envelope.
// This is a stream bound; no buffer proportional to this bound is allocated.
export const RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT=RAW_LIMIT+Math.ceil(RAW_LIMIT/16383)*5+1048576;
export const _programmeHash=value=>{
 need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'RESEARCH_QUOTE_ARCHIVE_HASH_REQUIRED');return value;
};
export const _programmeCount=(value,maximum=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,minimum=0)=>{
 need(Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,'RESEARCH_QUOTE_ARCHIVE_LENGTH_INVALID');return value;
};
export const _programmeSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function _programmeAbsolute(value){
 need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!='/',
  'RESEARCH_QUOTE_ARCHIVE_ABSOLUTE_PATH_REQUIRED');return value;
}
export function _programmeIdentity(stat){
 return {device:String(stat.dev),inode:String(stat.ino),bytes:Number(stat.size),
  mtimeNs:String(stat.mtimeNs),ctimeNs:String(stat.ctimeNs)};
}
const inode=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const bound=(a,b)=>a.device===b.device&&a.inode===b.inode;
function privateFile(stat,links=1n){
 need(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===links&&
  (process.platform==='win32'||(stat.mode&0o077n)===0n)&&
  (!process.getuid||stat.uid===BigInt(process.getuid())),'RESEARCH_QUOTE_ARCHIVE_PRIVATE_FILE_REQUIRED');
 _programmeCount(Number(stat.size));
}
function failedCloser(error,closer,cause){
 const previous=typeof error.close==='function'?error.close.bind(error):null;
 error.close=async()=>{
  const results=await Promise.allSettled([...(previous?[previous()]:[]),closer()]);
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
 };
 if(!error.closeError)error.closeError=cause;
 return error;
}
/** Preserve a primary failure and every failed original descriptor closer. */
export async function _programmeUsing(held,work){
 let result,failure;
 try{result=await work(held);}catch(error){failure=error;}
 try{await held.close();}catch(error){failure=failure?failedCloser(failure,()=>held.close(),error):
  failedCloser(error,()=>held.close(),error);}
 if(failure)throw failure;return result;
}
export async function _programmeSyncClose(handle){
 let failure;
 try{await handle.sync();}catch(error){failure=error;}
 try{await handle.close();}catch(error){failure=failedCloser(failure??error,()=>handle.close(),error);}
 if(failure)throw failure;
}
export async function _programmeOpen(path,{writable=false,expectedBytes}={}){
 _programmeAbsolute(path);await customerDirectory(dirname(path),{create:false});
 const handle=await open(path,(writable?C.O_RDWR:C.O_RDONLY)|(C.O_NOFOLLOW??0)|(C.O_NONBLOCK??0));
 let closed=false,closing;
 const close=()=>{
  if(closed)return Promise.resolve();
  return closing??=(handle.close().then(()=>{closed=true;}).catch(error=>{closing=undefined;throw error;}));
 };
 try{
  const initial=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
  privateFile(initial);privateFile(named);need(inode(initial,named),'RESEARCH_QUOTE_ARCHIVE_FILE_CHANGED');
  if(expectedBytes!==undefined)need(initial.size===BigInt(_programmeCount(expectedBytes)),'RESEARCH_QUOTE_ARCHIVE_FILE_CHANGED');
  const identity=_programmeIdentity(initial);
  const assertHeld=async({stable=!writable}={})=>{
   need(!closed,'RESEARCH_QUOTE_ARCHIVE_CLOSED');
   await customerDirectory(dirname(path),{create:false});
   const stat=await handle.stat({bigint:true}),current=await lstat(path,{bigint:true});
   privateFile(stat);privateFile(current);
   need(inode(initial,stat)&&inode(stat,current)&&(!stable||_programmeSame(identity,_programmeIdentity(stat))),
    'RESEARCH_QUOTE_ARCHIVE_FILE_CHANGED');return stat;
  };
  return {path,handle,bytes:identity.bytes,identity,assertHeld,close};
 }catch(error){
  try{await close();}catch(closeError){failedCloser(error,close,closeError);}throw error;
 }
}
export async function _programmeRead(held,offset,length){
 _programmeCount(offset);_programmeCount(length,4*1024*1024);
 const buffer=Buffer.allocUnsafe(length);let at=0;
 while(at<length){
  const next=await held.handle.read(buffer,at,length-at,offset+at);
  need(next.bytesRead>0,'RESEARCH_QUOTE_ARCHIVE_TRUNCATED');at+=next.bytesRead;
 }
 return buffer;
}
export async function _programmeWrite(handle,buffer,offset){
 let at=0;
 while(at<buffer.length){
  const next=await handle.write(buffer,at,buffer.length-at,offset+at);
  need(next.bytesWritten>0,'RESEARCH_QUOTE_ARCHIVE_WRITE_FAILED');at+=next.bytesWritten;
 }
}
export async function* _programmeStream(held,{sha256}={}){
 if(sha256!==undefined)_programmeHash(sha256);
 const hash=createHash('sha256');await held.assertHeld({stable:true});
 for(let offset=0;offset<held.bytes;){
  const chunk=await _programmeRead(held,offset,Math.min(BLOCK,held.bytes-offset));
  hash.update(chunk);offset+=chunk.length;yield chunk;
 }
 await held.assertHeld({stable:true});
 if(sha256!==undefined)need(hash.digest('hex')===sha256,'RESEARCH_QUOTE_ARCHIVE_FILE_CHANGED');
}
export async function _programmeFileHash(held){
 const hash=createHash('sha256');
 for await(const chunk of _programmeStream(held))hash.update(chunk);
 return hash.digest('hex');
}
export async function _programmeReadJson(root,name,optional=false,limit=QUOTE_FILE_LIMIT){
 const path=join(root,name);
 if(optional&&!await exists(path))return null;
 return (await readCustomerJson(path,limit)).value;
}
export async function _programmeInitial(root,marker,value){
 if(await exists(join(root,marker)))return;
 const temporaries=new Set(await matchingWriteTemporaries(root,[jsonBytes(value)]));
 for(const name of await readdir(root))need(name==='customer-update.lock'||temporaries.has(name),
  'RESEARCH_QUOTE_DISTINCT_RUN_DIRECTORY_REQUIRED');
}
async function parent(root,name,{create=true}={}){
 researchQuoteHandoverPath(name.startsWith('package/')?name.slice(8):name);let current=root;
 for(const part of name.split('/').slice(0,-1)){
  const previous=current;current=await customerDirectory(join(current,part),{create});
  if(create){await syncDirectory(current);await syncDirectory(previous);}
 }
 return current;
}
async function streamPaths(root,name){
 const directory=await parent(root,name),key=digest(Buffer.from(name));
 const records=await customerDirectory(join(root,'transport-records'));
 await syncDirectory(root);
 return {directory,path:join(root,name),stage:join(directory,'.programme-'+key+'.partial'),
  records,binding:key+'.json',complete:key+'-complete.json'};
}
function checkStreamRecord(value,name){
 need(value?.schema===COMPLETE&&value.name===name,'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
 _programmeCount(value.bytes);_programmeHash(value.sha256);
 need(typeof value.device==='string'&&typeof value.inode==='string','RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');return value;
}
async function repairLink(paths,record){
 if(await exists(paths.stage)&&await exists(paths.path)){
  const a=await lstat(paths.stage,{bigint:true}),b=await lstat(paths.path,{bigint:true});
  privateFile(a,2n);privateFile(b,2n);
  need(inode(a,b)&&bound(record,_programmeIdentity(a))&&Number(a.size)===record.bytes,
   'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  await unlink(paths.stage);await syncDirectory(paths.directory);
 }
}
async function finishStream(root,name,record){
 const paths=await streamPaths(root,name);checkStreamRecord(record,name);
 await repairLink(paths,record);
 let published=await exists(paths.path);
 const held=await _programmeOpen(published?paths.path:paths.stage,{expectedBytes:record.bytes});
 await _programmeUsing(held,async file=>{
  need(bound(record,file.identity)&&await _programmeFileHash(file)===record.sha256,
   'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  await file.handle.sync();
 });
 if(!published){
  try{await link(paths.stage,paths.path);}
  catch(error){if(error.code!=='EEXIST')throw error;}
  await repairLink(paths,record);
 }
 await syncDirectory(paths.directory);
 const result=await _programmeOpen(paths.path,{expectedBytes:record.bytes});
 return _programmeUsing(result,async file=>{
  need(bound(record,file.identity),'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  return {name,path:file.path,bytes:record.bytes,sha256:record.sha256,identity:file.identity};
 });
}
async function retainedStream(root,name){
 const paths=await streamPaths(root,name),record=await _programmeReadJson(paths.records,paths.complete,true);
 return record?finishStream(root,name,record):null;
}
/** Each partial stream retains its original inode; complete identity precedes hard-link publication. */
async function publishStream(root,name,source,{bytes,sha256,maximum=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT}={}){
 if(bytes!==undefined)_programmeCount(bytes,maximum);if(sha256!==undefined)_programmeHash(sha256);
 const paths=await streamPaths(root,name);
 let completion=await _programmeReadJson(paths.records,paths.complete,true);
 if(completion){checkStreamRecord(completion,name);await repairLink(paths,completion);}
 const published=await exists(paths.path);
 let binding=await _programmeReadJson(paths.records,paths.binding,true);
 if(!published&&!await exists(paths.stage)){
  need(!binding&&!completion,'RESEARCH_QUOTE_ARCHIVE_STREAM_MISSING');
  const handle=await open(paths.stage,C.O_CREAT|C.O_EXCL|C.O_RDWR|(C.O_NOFOLLOW??0),0o600);
  await _programmeSyncClose(handle);await syncDirectory(paths.directory);
 }
 const held=await _programmeOpen(published?paths.path:paths.stage,{writable:!published});
 const record=await _programmeUsing(held,async file=>{
  const selected={schema:STREAM,name,device:file.identity.device,inode:file.identity.inode};
  if(binding)need(_programmeSame(binding,selected),'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  else{
   need(!published&&!completion&&file.bytes===0,'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
   await retainCustomerJson(paths.records,paths.binding,selected);binding=selected;
  }
  const initial=file.bytes,hash=createHash('sha256');let size=0;
  for await(const raw of source){
   need(raw instanceof Uint8Array,'RESEARCH_QUOTE_ARCHIVE_STREAM_REQUIRED');
   // Bound every comparison/write even when an upstream iterable yields a large chunk.
   for(let at=0;at<raw.length;at+=BLOCK){
    const chunk=Buffer.from(raw.buffer,raw.byteOffset+at,Math.min(BLOCK,raw.length-at));
    need(size+chunk.length<=maximum&&(bytes===undefined||size+chunk.length<=bytes),
     'RESEARCH_QUOTE_ARCHIVE_LENGTH_INVALID');
    const overlap=Math.min(chunk.length,Math.max(0,initial-size));
    if(overlap)need((await _programmeRead(file,size,overlap)).equals(chunk.subarray(0,overlap)),
     'RESEARCH_QUOTE_ARCHIVE_PREFIX_CHANGED');
    need(!published||overlap===chunk.length,'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
    if(!published&&overlap<chunk.length)await _programmeWrite(file.handle,chunk.subarray(overlap),size+overlap);
    hash.update(chunk);size+=chunk.length;
   }
  }
  const actual=hash.digest('hex');
  need(size>=initial&&(bytes===undefined||size===bytes)&&(sha256===undefined||actual===sha256),
   'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  await file.handle.sync();const stat=await file.assertHeld({stable:published});
  need(Number(stat.size)===size,'RESEARCH_QUOTE_ARCHIVE_STREAM_CHANGED');
  const complete={schema:COMPLETE,name,device:file.identity.device,inode:file.identity.inode,bytes:size,sha256:actual};
  await retainCustomerJson(paths.records,paths.complete,complete);return complete;
 });
 return finishStream(root,name,record);
}
function frameManifest(manifest,body){
 need(manifest?.schema===RESEARCH_QUOTE_HANDOVER_SCHEMA&&Array.isArray(manifest.files)&&
  manifest.files.length>0&&manifest.files.length<=MEMBERS&&body.length>0&&body.length<=QUOTE_FILE_LIMIT,
  'RESEARCH_QUOTE_ARCHIVE_MANIFEST_INVALID');
 const names=new Set(),files=manifest.files;
 let total=MAGIC.length+4+body.length;
 for(const row of files){
  need(row&&Object.keys(row).sort().join(',')==='bytes,name,sha256','RESEARCH_QUOTE_ARCHIVE_MEMBER_INVALID');
  researchQuoteHandoverPath(row.name);_programmeCount(row.bytes,MEMBER_LIMIT);_programmeHash(row.sha256);
  need(row.name!==MANIFEST&&!names.has(row.name),'RESEARCH_QUOTE_ARCHIVE_MEMBER_INVALID');
  names.add(row.name);total+=row.bytes;
 }
 for(const name of names){
  const parts=name.split('/');
  for(let n=1;n<parts.length;n++)need(!names.has(parts.slice(0,n).join('/')),
   'RESEARCH_QUOTE_ARCHIVE_MEMBER_INVALID');
 }
 need(Number.isSafeInteger(total)&&total<=RAW_LIMIT,'RESEARCH_QUOTE_ARCHIVE_LENGTH_INVALID');return files;
}
async function* frame(root,manifest,body){
 const length=Buffer.alloc(4);length.writeUInt32BE(body.length);
 yield MAGIC;yield length;yield body;
 for(const row of frameManifest(manifest,body)){
  await parent(root,row.name,{create:false});
  const held=await _programmeOpen(join(root,row.name),{expectedBytes:row.bytes});
  let failure;
  try{yield* _programmeStream(held,{sha256:row.sha256});}catch(error){failure=error;throw error;}
  finally{
   try{await held.close();}catch(error){
    if(failure)failedCloser(failure,()=>held.close(),error);
    else throw failedCloser(error,()=>held.close(),error);
   }
  }
 }
}
function reader(stream){
 const iterator=stream[Symbol.asyncIterator]();let current=Buffer.alloc(0),at=0,ended=false;
 const next=async()=>{
  while(at===current.length&&!ended){
   const item=await iterator.next();ended=!!item.done;
   if(!ended){current=Buffer.from(item.value);at=0;}
  }
  return !ended;
 };
 const chunks=async function*(length){
  let left=length;
  while(left){
   need(await next(),'RESEARCH_QUOTE_ARCHIVE_TRUNCATED');
   const amount=Math.min(left,current.length-at),part=current.subarray(at,at+amount);
   at+=amount;left-=amount;yield part;
  }
 };
 return {chunks,async take(length){
  _programmeCount(length,QUOTE_FILE_LIMIT);
  const result=Buffer.allocUnsafe(length);let offset=0;
  for await(const part of chunks(length)){part.copy(result,offset);offset+=part.length;}return result;
 },async end(){need(!await next(),'RESEARCH_QUOTE_ARCHIVE_TRAILING_BYTES');}};
}
async function consume(held,{manifestSha256,archiveSha256,onManifest,onFile}={}){
 const source=Readable.from(_programmeStream(held,{sha256:archiveSha256})),gunzip=createGunzip({chunkSize:BLOCK});
 const pump=pipeline(source,gunzip);pump.catch(()=>{});
 const input=reader(gunzip);
 try{
  need((await input.take(MAGIC.length)).equals(MAGIC),'RESEARCH_QUOTE_ARCHIVE_FORMAT_INVALID');
  const size=(await input.take(4)).readUInt32BE(0);_programmeCount(size,QUOTE_FILE_LIMIT,1);
  const body=await input.take(size),actual=digest(body);
  need(manifestSha256===undefined||actual===manifestSha256,'RESEARCH_QUOTE_ARCHIVE_MANIFEST_CHANGED');
  let manifest;try{manifest=JSON.parse(body.toString('utf8'));}catch{need(false,'RESEARCH_QUOTE_ARCHIVE_MANIFEST_INVALID');}
  // Reject noncanonical UTF-8 before any retained frame publication.
  need(Buffer.from(body.toString('utf8')).equals(body),'RESEARCH_QUOTE_ARCHIVE_MANIFEST_INVALID');
  const files=frameManifest(manifest,body);
  if(onManifest)await onManifest({body,manifest,manifestSha256:actual});
  for(const row of files){
   const hash=createHash('sha256');let count=0;
   const chunks=(async function*(){
    for await(const part of input.chunks(row.bytes)){count+=part.length;hash.update(part);yield part;}
   })();
   if(onFile)await onFile(row,chunks);else for await(const _part of chunks){}
   need(count===row.bytes&&hash.digest('hex')===row.sha256,'RESEARCH_QUOTE_ARCHIVE_MEMBER_CHANGED');
  }
  await input.end();await pump;
  return {manifest,manifestBytes:body.length,manifestSha256:actual,selection:manifest.selection};
 }catch(error){source.destroy(error);gunzip.destroy(error);try{await pump;}catch(pumpError){if(pumpError!==error&&typeof pumpError.close==='function')
   failedCloser(error,()=>pumpError.close(),pumpError);}throw error;}
}
function request(raw,mode){
 need(raw&&typeof raw==='object'&&!Array.isArray(raw),'RESEARCH_QUOTE_ARCHIVE_INPUT_REQUIRED');
 const value={directory:_programmeAbsolute(raw.directory)};
 if(mode==='CREATE'){
  if(raw.sourceDirectory!==undefined)value.sourceDirectory=_programmeAbsolute(raw.sourceDirectory);
  if(raw.manifestSha256!==undefined)value.manifestSha256=_programmeHash(raw.manifestSha256);
 }else{
  if(raw.path!==undefined)value.path=_programmeAbsolute(raw.path);
  if(raw.bytes!==undefined)value.bytes=_programmeCount(raw.bytes,RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,1);
  if(raw.sha256!==undefined)value.sha256=_programmeHash(raw.sha256);
 }
 return value;
}
function operation(value,mode){
 need(value?.schema===OP&&value.mode===mode,'RESEARCH_QUOTE_DISTINCT_RUN_DIRECTORY_REQUIRED');
 if(mode==='CREATE'){_programmeHash(value.manifestSha256);_programmeCount(value.manifestBytes,QUOTE_FILE_LIMIT,1);}
 else{_programmeHash(value.sha256);_programmeCount(value.bytes,RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,1);}
 return value;
}
async function completed(root,op){
 const saved=await _programmeReadJson(root,'archive-result.json',true);
 if(!saved)return null;
 need(saved.schema===RESEARCH_QUOTE_PROGRAMME_ARCHIVE_SCHEMA&&saved.mode===op.mode&&
  saved.operationSha256===digest(jsonBytes(op)),'RESEARCH_QUOTE_ARCHIVE_RESULT_CHANGED');
 if(op.mode==='CREATE')need(saved.manifestSha256===op.manifestSha256&&saved.manifestBytes===op.manifestBytes,
  'RESEARCH_QUOTE_ARCHIVE_RESULT_CHANGED');
 const name=op.mode==='CREATE'?NAME:INPUT;
 const held=await _programmeOpen(join(root,name),{expectedBytes:saved.archive.bytes});
 await _programmeUsing(held,async file=>{
  need(saved.archive.name===name&&_programmeSame(saved.archive.identity,file.identity),
   'RESEARCH_QUOTE_ARCHIVE_RESULT_CHANGED');_programmeHash(saved.archive.sha256);
  if(op.mode==='RECEIVE')need(saved.archive.sha256===op.sha256&&saved.archive.bytes===op.bytes,
   'RESEARCH_QUOTE_ARCHIVE_RESULT_CHANGED');
 });
 return saved;
}
function createdResult(root,saved,reused){
 return {directory:root,path:join(root,saved.archive.name),bytes:saved.archive.bytes,sha256:saved.archive.sha256,
  manifestSha256:saved.manifestSha256,manifestBytes:saved.manifestBytes,selection:saved.selection,reused};
}
async function saveResult(root,op,archive,inspected){
 const saved={schema:RESEARCH_QUOTE_PROGRAMME_ARCHIVE_SCHEMA,mode:op.mode,operationSha256:digest(jsonBytes(op)),
  archive:{name:archive.name,bytes:archive.bytes,sha256:archive.sha256,identity:archive.identity},
  manifestSha256:inspected.manifestSha256,manifestBytes:inspected.manifestBytes,selection:inspected.selection};
 await retainCustomerJson(root,'archive-result.json',saved);return saved;
}
export async function createResearchQuoteProgrammeArchive(raw){
 const input=request(raw,'CREATE');
 return withCustomerOperation(input.directory,async root=>{
  let op=await _programmeReadJson(root,'archive-operation.json',true);
  if(op){
   operation(op,'CREATE');
   need(input.manifestSha256===undefined||input.manifestSha256===op.manifestSha256,
    'RESEARCH_QUOTE_ARCHIVE_SELECTION_CHANGED');
   const saved=await completed(root,op);if(saved)return createdResult(root,saved,true);
   const ready=await retainedStream(root,NAME);
   if(ready){
    const held=await _programmeOpen(ready.path,{expectedBytes:ready.bytes});
    const inspected=await _programmeUsing(held,file=>consume(file,{manifestSha256:op.manifestSha256,archiveSha256:ready.sha256}));
    need(inspected.manifestBytes===op.manifestBytes,'RESEARCH_QUOTE_ARCHIVE_MANIFEST_CHANGED');
    return createdResult(root,await saveResult(root,op,ready,inspected),true);
   }
  }
  need(input.sourceDirectory,'RESEARCH_QUOTE_ARCHIVE_SOURCE_REQUIRED');
  researchQuoteDistinctDirectories(root,input.sourceDirectory);
  return withCustomerOperation(input.sourceDirectory,async sourceRoot=>{
   const inspected=await inspectResearchQuoteHandover(sourceRoot,{manifestSha256:op?.manifestSha256??input.manifestSha256});
   const original=await readCustomerJson(join(sourceRoot,MANIFEST),QUOTE_FILE_LIMIT);
   need(original.sha256===inspected.manifestSha256,'RESEARCH_QUOTE_ARCHIVE_MANIFEST_CHANGED');
   frameManifest(original.value,original.body);
   const selected={schema:OP,mode:'CREATE',manifestSha256:original.sha256,manifestBytes:original.bytes};
   need(!op||_programmeSame(op,selected),'RESEARCH_QUOTE_ARCHIVE_SELECTION_CHANGED');
   await _programmeInitial(root,'archive-operation.json',selected);
   await retainCustomerJson(root,'archive-operation.json',selected);op=selected;
   await retainCustomerBytes(root,'source-manifest.json',original.body);
   const source=Readable.from(frame(sourceRoot,original.value,original.body)),gzip=createGzip({chunkSize:BLOCK,level:6});
   const pump=pipeline(source,gzip);pump.catch(()=>{});
   let archive;
   try{archive=await publishStream(root,NAME,gzip);await pump;}
   catch(error){source.destroy(error);gzip.destroy(error);try{await pump;}catch(pumpError){if(pumpError!==error&&typeof pumpError.close==='function')
   failedCloser(error,()=>pumpError.close(),pumpError);}throw error;}
   return createdResult(root,await saveResult(root,op,archive,inspected),false);
  });
 });
}
export async function receiveResearchQuoteProgrammeArchive(raw){
 const input=request(raw,'RECEIVE');
 return withCustomerOperation(input.directory,async root=>{
  let op=await _programmeReadJson(root,'archive-operation.json',true),archive;
  if(op){
   operation(op,'RECEIVE');
   need((input.bytes===undefined||input.bytes===op.bytes)&&(input.sha256===undefined||input.sha256===op.sha256),
    'RESEARCH_QUOTE_ARCHIVE_SELECTION_CHANGED');
   const saved=await completed(root,op);
   if(saved){
    const inspected=await inspectResearchQuoteHandover(join(root,'package'),{manifestSha256:saved.manifestSha256});
    need(inspected.manifestBytes===saved.manifestBytes&&_programmeSame(inspected.selection,saved.selection),
     'RESEARCH_QUOTE_ARCHIVE_RESULT_CHANGED');
    return {...inspected,archive:{path:join(root,INPUT),bytes:op.bytes,sha256:op.sha256},operationDirectory:root,reused:true};
   }
   archive=await retainedStream(root,INPUT);
  }
  if(!archive){
   need(input.path,'RESEARCH_QUOTE_ARCHIVE_SOURCE_REQUIRED');
   need(input.path!==join(root,INPUT),'RESEARCH_QUOTE_DISTINCT_RUN_DIRECTORY_REQUIRED');
   const held=await openResearchQuoteProgrammeArchive({path:input.path,bytes:op?.bytes??input.bytes,
    sha256:op?.sha256??input.sha256});
   archive=await _programmeUsing(held,async file=>{
    const selected={schema:OP,mode:'RECEIVE',bytes:file.bytes,sha256:file.sha256};
    need(!op||_programmeSame(op,selected),'RESEARCH_QUOTE_ARCHIVE_SELECTION_CHANGED');
    await _programmeInitial(root,'archive-operation.json',selected);
    await retainCustomerJson(root,'archive-operation.json',selected);op=selected;
    return publishStream(root,INPUT,_programmeStream(file,{sha256:op.sha256}),{bytes:op.bytes,sha256:op.sha256});
   });
  }
  need(archive.bytes===op.bytes&&archive.sha256===op.sha256,'RESEARCH_QUOTE_ARCHIVE_SELECTION_CHANGED');
  const held=await _programmeOpen(archive.path,{expectedBytes:op.bytes});
  const packageRoot=await customerDirectory(join(root,'package'));await syncDirectory(root);
  const decoded=await _programmeUsing(held,file=>consume(file,{
   archiveSha256:op.sha256,
   onManifest:async({body})=>retainCustomerBytes(root,'source-manifest.json',body),
   onFile:async(row,chunks)=>publishStream(root,'package/'+row.name,chunks,{bytes:row.bytes,sha256:row.sha256,maximum:MEMBER_LIMIT}),
  }));
  const original=(await readCustomerJson(join(root,'source-manifest.json'),QUOTE_FILE_LIMIT)).body;
  await retainCustomerBytes(packageRoot,MANIFEST,original);
  const inspected=await inspectResearchQuoteHandover(packageRoot,{manifestSha256:decoded.manifestSha256});
  await saveResult(root,op,archive,inspected);
  return {...inspected,archive:{path:archive.path,bytes:archive.bytes,sha256:archive.sha256},operationDirectory:root,reused:false};
 });
}
/** The complete original SHA is checked once, or inherited from an unchanged private completion inode. */
export async function openResearchQuoteProgrammeArchive(raw){
 const path=_programmeAbsolute(raw?.path);
 const bytes=raw.bytes===undefined?undefined:_programmeCount(raw.bytes,RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,1);
 const sha256=raw.sha256===undefined?undefined:_programmeHash(raw.sha256);
 const held=await _programmeOpen(path,{expectedBytes:bytes});
 try{
  need(held.bytes>0,'RESEARCH_QUOTE_ARCHIVE_LENGTH_INVALID');
  let verified;
  if(basename(path)===NAME||basename(path)===INPUT){
   const saved=await _programmeReadJson(dirname(path),'archive-result.json',true);
   if(saved?.schema===RESEARCH_QUOTE_PROGRAMME_ARCHIVE_SCHEMA&&saved.archive?.name===basename(path)&&
    saved.archive.bytes===held.bytes&&_programmeSame(saved.archive.identity,held.identity))
    verified=_programmeHash(saved.archive.sha256);
  }else if(basename(path)==='upload.sfhandover'){
   const saved=await _programmeReadJson(dirname(path),'upload-complete.json',true);
   if(saved?.schema==='sf88-research-quotation-programme-upload-complete/v1'&&saved.bytes===held.bytes&&
    _programmeSame(saved.identity,held.identity))verified=_programmeHash(saved.sha256);
  }
  verified??=await _programmeFileHash(held);
  need(sha256===undefined||sha256===verified,'RESEARCH_QUOTE_ARCHIVE_HASH_CHANGED');
  return {...held,sha256:verified};
 }catch(error){try{await held.close();}catch(closeError){failedCloser(error,()=>held.close(),closeError);}throw error;}
}
