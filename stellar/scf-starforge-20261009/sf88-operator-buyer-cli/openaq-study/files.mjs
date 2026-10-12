// SPDX-License-Identifier: MIT
// Private, exact-byte storage around the original Dataset and OpenAQ engines.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,link,unlink} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {acquireStateLease} from '../../merchant-fleet-gateway/state-lease.mjs';
import {writeBytes,writeJson,jsonBytes,parseJson} from '../node/store.mjs';

export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const bytes=jsonBytes;
export const parse=parseJson;
export const fail=code=>{throw Object.assign(new Error(code),{code});};
export const need=(value,code)=>{if(!value)fail(code);};
export function path(value){
 need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/'&&!value.includes('\0'),'OPENAQ_BUYER_ABSOLUTE_PATH_REQUIRED');
 return value;
}
export function id(value){need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value),'OPENAQ_BUYER_STABLE_ID_REQUIRED');return value;}
export function uuid(value){need(typeof value==='string'&&UUID.test(value),'OPENAQ_BUYER_UUID_REQUIRED');return value;}
export function hash(value){need(typeof value==='string'&&HASH.test(value),'OPENAQ_BUYER_DIGEST_REQUIRED');return value;}
export function member(value){
 need(typeof value==='string'&&value.length<=1024&&!/[\x00-\x1f\x7f\\]/.test(value)&&!isAbsolute(value)&&
  value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'OPENAQ_BUYER_MEMBER_INVALID');return value;
}
export function disjoint(a,b){
 a=path(a);b=path(b);
 for(const [from,to] of [[a,b],[b,a]]){const r=relative(from,to);need(r&&!(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)),'OPENAQ_BUYER_STORAGE_OVERLAP');}
}
const owned=s=>s.isFile()&&(!process.getuid||s.uid===process.getuid())&&(s.mode&0o077)===0;
export async function directory(value,{create=false}={}){
 value=path(value);
 if(create){
  await directory(dirname(value));
  try{await mkdir(value,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 const s=await lstat(value);
 need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&(!process.getuid||s.uid===process.getuid())&&await realpath(value)===value,
  'OPENAQ_BUYER_PRIVATE_DIRECTORY_REQUIRED');
 return value;
}
export async function parents(root,name){
 root=await directory(root);const parts=member(name).split('/');parts.pop();
 let selected=root;
 for(const part of parts){selected=join(selected,part);await directory(selected,{create:true});}
 return join(root,name);
}
export async function exists(value){try{await lstat(value);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function sync(value){const h=await open(value,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await h.sync();}finally{await h.close();}}
export async function read(value,limit=2*1024*1024){
 path(value);need(Number.isSafeInteger(limit)&&limit>=0,'OPENAQ_BUYER_READ_LIMIT');
 need(await realpath(dirname(value))===dirname(value),'OPENAQ_BUYER_SOURCE_PARENT_CHANGED');
 const h=await open(value,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await h.stat();need(owned(before)&&before.size<=limit,'OPENAQ_BUYER_PRIVATE_FILE_REQUIRED');
  const raw=await h.readFile(),after=await h.stat(),named=await lstat(value);
  need(raw.length===before.size&&raw.length<=limit&&owned(named)&&before.dev===named.dev&&before.ino===named.ino&&
   before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'OPENAQ_BUYER_FILE_CHANGED');
  return raw;
 }finally{await h.close();}
}
export async function json(value,limit){const v=parse(await read(value,limit));need(object(v),'OPENAQ_BUYER_JSON_OBJECT_REQUIRED');return v;}
export async function retained(value,data){
 const raw=Buffer.from(data);
 if(await exists(value)){need((await read(value,raw.length)).equals(raw),'OPENAQ_BUYER_RETAINED_INPUT_CHANGED');return;}
 try{await writeBytes(value,raw,{exclusive:true});}
 catch(e){if(e.code!=='EEXIST')throw e;}
 need((await read(value,raw.length)).equals(raw),'OPENAQ_BUYER_RETAINED_INPUT_CHANGED');
}
export const retainJson=(value,data)=>retained(value,bytes(data));
export const replaceJson=writeJson;
export function signal(value){need(value===undefined||value instanceof AbortSignal,'INVALID_ABORT_SIGNAL');need(!value?.aborted,'OPERATOR_ABORTED');return value;}
export async function withOwner(root,work,{create=false}={}){
 root=await directory(root,{create});const lease=await acquireStateLease(root);
 let result,error;
 try{lease.assertHeld();result=await work(lease);lease.assertHeld();}catch(e){error=e;}
 // The original flock uses a one-shot descriptor close. Never manufacture a
 // retryable lease out of an ambiguous terminal close.
 try{await lease.close();}catch(e){if(error)Object.defineProperty(error,'leaseCloseError',{value:e});else error=e;}
 if(error)throw error;return result;
}
export async function emptyIntake(root,allowed){
 for(const name of await readdir(root)){
  if(allowed.includes(name))continue;
  // Interrupted original writeBytes temporaries are preserved. Only an exact
  // deterministic final record can be admitted by retained(), above.
  need(/^\.write-[a-f0-9-]{36}$/.test(name),'OPENAQ_BUYER_DIRECTORY_HAS_OTHER_CONTENT');
  const s=await lstat(join(root,name));need(owned(s)&&!s.isSymbolicLink(),'OPENAQ_BUYER_PRIVATE_FILE_REQUIRED');
 }
}
export async function filePin(value,{maxBytes=16*1024**3,expected}={}){
 path(value);need(await realpath(dirname(value))===dirname(value),'OPENAQ_BUYER_SOURCE_PARENT_CHANGED');
 const h=await open(value,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await h.stat();need(owned(before)&&before.size<=maxBytes,'OPENAQ_BUYER_PRIVATE_FILE_REQUIRED');
  const sha=createHash('sha256');let count=0;
  for await(const part of h.createReadStream({autoClose:false,start:0,highWaterMark:65536})){count+=part.length;need(count<=maxBytes,'OPENAQ_BUYER_FILE_LIMIT');sha.update(part);}
  const after=await h.stat(),named=await lstat(value),result={bytes:count,sha256:sha.digest('hex')};
  need(owned(named)&&before.dev===named.dev&&before.ino===named.ino&&count===before.size&&
   before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'OPENAQ_BUYER_FILE_CHANGED');
  if(expected)need(result.bytes===expected.bytes&&result.sha256===expected.sha256,'OPENAQ_BUYER_MEMBER_CHANGED');
  return result;
 }finally{await h.close();}
}
/** Complete/prefix reconciliation uses this selected file, expected digest and
 * destination. No source file or unrelated temporary is replaced. */
export async function copyPinned(source,target,expected,{signal:abort,maxBytes=16*1024**3}={}){
 signal(abort);path(source);path(target);hash(expected.sha256);
 need(Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&expected.bytes<=maxBytes,'OPENAQ_BUYER_FILE_LIMIT');
 await directory(dirname(target));
 const temporary=join(dirname(target),'.copy-'+digest(Buffer.from(target+'\0'+expected.sha256)).slice(0,40));
 if(await exists(target)){
  await filePin(target,{maxBytes,expected});
  if(await exists(temporary)){
   const a=await lstat(target),b=await lstat(temporary);
   if(owned(b)&&a.dev===b.dev&&a.ino===b.ino){await unlink(temporary);await sync(dirname(target));}
  }
  return {path:target,...expected};
 }
 need(await realpath(dirname(source))===dirname(source),'OPENAQ_BUYER_SOURCE_PARENT_CHANGED');
 const input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let output,primary;
 try{
  const original=await input.stat();need(owned(original)&&original.size===expected.bytes,'OPENAQ_BUYER_SOURCE_CHANGED');
  try{output=await open(temporary,'wx+',0o600);}catch(e){if(e.code!=='EEXIST')throw e;output=await open(temporary,constants.O_RDWR|(constants.O_NOFOLLOW??0));}
  const held=await output.stat();need(owned(held)&&held.nlink===1&&held.size<=expected.bytes,'OPENAQ_BUYER_COPY_PREFIX_CHANGED');
  const sha=createHash('sha256'),buffer=Buffer.allocUnsafe(65536),prefix=Buffer.allocUnsafe(65536);let offset=0;
  while(offset<expected.bytes){
   signal(abort);
   const {bytesRead:n}=await input.read(buffer,0,Math.min(buffer.length,expected.bytes-offset),offset);need(n>0,'OPENAQ_BUYER_SOURCE_TRUNCATED');
   const retainedCount=Math.min(n,Math.max(0,held.size-offset));
   if(retainedCount){
    let read=0;while(read<retainedCount){const step=await output.read(prefix,read,retainedCount-read,offset+read);need(step.bytesRead>0,'OPENAQ_BUYER_COPY_PREFIX_CHANGED');read+=step.bytesRead;}
    need(prefix.subarray(0,retainedCount).equals(buffer.subarray(0,retainedCount)),'OPENAQ_BUYER_COPY_PREFIX_CHANGED');
   }
   let written=retainedCount;
   while(written<n){const step=await output.write(buffer,written,n-written,offset+written);need(step.bytesWritten>0,'OPENAQ_BUYER_COPY_NO_PROGRESS');written+=step.bytesWritten;}
   sha.update(buffer.subarray(0,n));offset+=n;
  }
  const after=await input.stat(),named=await lstat(source),current=await lstat(temporary),heldAfter=await output.stat();
  need(sha.digest('hex')===expected.sha256&&owned(named)&&named.dev===original.dev&&named.ino===original.ino&&
   after.size===original.size&&after.mtimeMs===original.mtimeMs&&after.ctimeMs===original.ctimeMs&&
   owned(current)&&current.dev===held.dev&&current.ino===held.ino&&heldAfter.size===expected.bytes,'OPENAQ_BUYER_COPY_CHANGED');
  await output.sync();const finished=output;output=null;await finished.close();
  try{await link(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;await filePin(target,{maxBytes,expected});}
  const targetInfo=await lstat(target),tempInfo=await lstat(temporary);
  if(targetInfo.dev===tempInfo.dev&&targetInfo.ino===tempInfo.ino)await unlink(temporary);
  await sync(dirname(target));return{path:target,...expected};
 }catch(error){primary=error;throw error;}
 finally{
  const errors=[];for(const handle of [output,input])if(handle)try{await handle.close();}catch(error){errors.push(error);}
  if(errors.length){const error=new AggregateError(errors,'OpenAQ copy handles did not all close.');
   if(primary)Object.defineProperty(primary,'closeError',{value:error});else throw error;}
 }
}
export async function inventory(root,{exclude=[]}={}){
 root=await directory(root);const result=[];
 async function walk(current,prefix){
  for(const name of(await readdir(current)).sort()){
   if(name.startsWith('.')||exclude.includes(prefix+name))continue;
   const value=join(current,name),s=await lstat(value);need(!s.isSymbolicLink(),'OPENAQ_BUYER_SYMLINK_REFUSED');
   if(s.isDirectory()){await directory(value);await walk(value,prefix+name+'/');}
   else{const pin=await filePin(value);result.push({name:prefix+name,...pin});}
  }
 }
 await walk(root,'');return result;
}
