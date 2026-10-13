// MIT. Private immutable objects and an atomic selected-state pointer under the original Linux lease.
import {open,mkdir,lstat,realpath,rename,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {acquireStateLease} from '../../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {failure,pretty} from './agent-operations.mjs';

export const MAX_PROJECT_BYTES=128*1024*1024;
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','uid','mode'].every(key=>a[key]===b[key]);
export async function privateDirectory(path,{create=false}={}){
 path=resolve(path);
 if(create)try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await lstat(path);
 if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path||
  typeof process.getuid!=='function'||stat.uid!==process.getuid()||(stat.mode&0o077))
  throw failure('PRIVATE_DIRECTORY','Select an owned canonical private directory (0700).');
 return path;
}
export async function readOriginalFile(path,maximum=MAX_PROJECT_BYTES){
 path=resolve(path);
 if(await realpath(path)!==path)throw failure('PRIVATE_FILE','Select the original canonical private file.');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat({bigint:true});
  if(!before.isFile()||typeof process.getuid!=='function'||before.uid!==BigInt(process.getuid())||
   (before.mode&0o077n)||before.size>BigInt(maximum))throw failure('PRIVATE_FILE','Use an owned private regular file within its original size bound.');
  // Bounded descriptor reads detect a file growing after stat before allocation.
  const bytes=Buffer.alloc(Number(before.size));let offset=0;
  while(offset<bytes.length){const result=await handle.read(bytes,offset,bytes.length-offset,offset);if(!result.bytesRead)throw failure('INPUT_CHANGED','The original file ended while receiving.');offset+=result.bytesRead;}
  const extra=Buffer.alloc(1);
  if((await handle.read(extra,0,1,offset)).bytesRead||!same(before,await handle.stat({bigint:true})))
   throw failure('INPUT_CHANGED','The original complete file changed during receiving.');
  return {bytes,sha256:digest(bytes)};
 }finally{await handle.close();}
}
async function syncDirectory(path){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}
export class ReportingStore{
 #directory;#lease;#poisoned=false;#stateSha256=null;
 constructor(directory,lease){this.#directory=directory;this.#lease=lease;}
 static async open(directory){
  directory=await privateDirectory(directory);
  const lease=await acquireStateLease(directory),store=new ReportingStore(directory,lease);
  try{await privateDirectory(join(directory,'objects'),{create:true});return store;}
  catch(error){await lease.close();throw error;}
 }
 get directory(){return this.#directory;}
 assert(){this.#lease.assertHeld();if(this.#poisoned)throw failure('STORE_REOPEN_REQUIRED','An interrupted state write needs the same store reopened before recovery.');}
 objectPath(sha256){if(!SHA.test(sha256))throw failure('OBJECT','Choose a complete retained object identity.');return join(this.#directory,'objects',sha256);}
 async put(bytes){
  this.assert();bytes=Buffer.from(bytes);const sha256=digest(bytes),path=this.objectPath(sha256);
  try{
   const existing=await readOriginalFile(path,Math.max(MAX_PROJECT_BYTES,bytes.length));
   if(existing.sha256!==sha256||existing.bytes.length!==bytes.length)throw failure('OBJECT_CHANGED','A retained immutable original changed.');
   return {sha256,bytes:bytes.length};
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=join(this.#directory,'objects','.new-'+randomUUID());let handle;
  try{
   handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
   this.assert();
   try{await link(temporary,path);}catch(error){
    if(error.code!=='EEXIST')throw error;
    const existing=await readOriginalFile(path,Math.max(MAX_PROJECT_BYTES,bytes.length));
    if(existing.sha256!==sha256||existing.bytes.length!==bytes.length)throw failure('OBJECT_CHANGED','The original immutable object differs.');
   }
   await unlink(temporary);await syncDirectory(dirname(path));
   return {sha256,bytes:bytes.length};
  }finally{if(handle)await handle.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 async get(ref){
  this.assert();if(!ref||!Number.isSafeInteger(ref.bytes)||ref.bytes<0)throw failure('OBJECT','Retain exact original object metadata.');
  const result=await readOriginalFile(this.objectPath(ref.sha256),Math.max(MAX_PROJECT_BYTES,ref.bytes));
  if(result.sha256!==ref.sha256||result.bytes.length!==ref.bytes)throw failure('OBJECT_CHANGED','The retained original bytes no longer match.');
  return result.bytes;
 }
 async load(){
  this.assert();
  try{
   const result=await readOriginalFile(join(this.#directory,'state.json'),16*1024*1024);
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.bytes));
   this.#stateSha256=result.sha256;return value;
  }catch(error){if(error.code==='ENOENT'){this.#stateSha256=null;return null;}throw error;}
 }
 async save(state){
  this.assert();const bytes=Buffer.from(pretty(state));if(bytes.length>16*1024*1024)throw failure('STORE_CAPACITY','Export and continue with an explicitly selected successor store before this retained host journal exceeds 16 MiB.');
  // The native lease is primary. Verify the exact selected pointer too, detecting
  // an out-of-band host edit rather than overwriting a newer complete selection.
  let prior=null;try{prior=(await readOriginalFile(join(this.#directory,'state.json'),16*1024*1024)).sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(prior!==this.#stateSha256)throw failure('STORE_CHANGED','The original selected state changed outside its lease.');
  const temporary=join(this.#directory,'.state-'+randomUUID());let handle,entered=false;
  try{
   handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
   this.assert();entered=true;
   if(this.#stateSha256===null){await link(temporary,join(this.#directory,'state.json'));await unlink(temporary);}
   else await rename(temporary,join(this.#directory,'state.json'));
   await syncDirectory(this.#directory);this.#stateSha256=digest(bytes);
  }catch(error){if(entered)this.#poisoned=true;throw error;}
  finally{if(handle)await handle.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 async close(){await this.#lease.close();}
}
