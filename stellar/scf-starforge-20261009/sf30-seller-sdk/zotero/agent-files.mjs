// MIT. Private canonical host files and immutable customer export receiving.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {privateDirectory as nativeDirectory,readBytes,writeBytes} from '../../sf88-operator-buyer-cli/node/store.mjs';
import {LIMIT,need,json,parse,sha256} from './contracts.mjs';
export const fileIdentity=info=>({device:String(info.dev),inode:String(info.ino),bytes:String(info.size),modified:String(info.mtimeNs),changed:String(info.ctimeNs)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function privateDirectory(path,{create=false}={}){path=resolve(path);await nativeDirectory(path,{create});need(await realpath(path)===path,'ZOTERO_CANONICAL_DIRECTORY_REQUIRED');return path;}
export async function readPrivate(path,maximum=LIMIT.control){
 path=resolve(path);const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await handle.stat({bigint:true});need(before.isFile()&&before.nlink===1n&&before.size<=BigInt(maximum)&&(before.mode&0o077n)===0n&&(!process.getuid||before.uid===BigInt(process.getuid())),'ZOTERO_PRIVATE_FILE_REQUIRED');
  const bytes=await handle.readFile(),after=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
  need(BigInt(bytes.length)===before.size&&same(fileIdentity(before),fileIdentity(after))&&named.dev===before.dev&&named.ino===before.ino&&!named.isSymbolicLink(),'ZOTERO_SOURCE_FILE_CHANGED');return bytes;
 }finally{await handle.close();}
}
export async function optionalJson(path,maximum=LIMIT.control){try{return parse(await readPrivate(path,maximum));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function saveExact(path,value){
 const bytes=json(value);try{await writeBytes(path,bytes,{exclusive:true});}
 catch(error){if(error.code!=='EEXIST')throw error;need(sha256(await readPrivate(path,Math.max(LIMIT.control,bytes.length)))===sha256(bytes),'ZOTERO_REQUEST_INPUT_CHANGED');}
 return value;
}
export async function originalFile(path,maximum=LIMIT.transfer){
 path=resolve(path);need(await realpath(path)===path,'ZOTERO_CANONICAL_FILE_REQUIRED');
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{
  const before=await handle.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(maximum),'ZOTERO_SOURCE_FILE_LIMIT');
  const digest=createHash('sha256');let size=0;const buffer=Buffer.alloc(196608);
  while(size<Number(before.size)){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,Number(before.size)-size),size);need(bytesRead>0,'ZOTERO_SOURCE_FILE_CHANGED');digest.update(buffer.subarray(0,bytesRead));size+=bytesRead;}
  const after=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});need(same(fileIdentity(before),fileIdentity(after))&&same(fileIdentity(named),fileIdentity(before))&&!named.isSymbolicLink(),'ZOTERO_SOURCE_FILE_CHANGED');
  return{path,bytes:size,sha256:digest.digest('hex'),identity:fileIdentity(after)};
 }finally{await handle.close();}
}
export async function sourceBytes(pin,maximum=LIMIT.transfer){
 const current=await originalFile(pin.path,maximum);need(same(current,pin),'ZOTERO_SOURCE_FILE_CHANGED');
 const bytes=await readBytes(pin.path,maximum);need(bytes.length===pin.bytes&&sha256(bytes)===pin.sha256,'ZOTERO_SOURCE_FILE_CHANGED');return bytes;
}
