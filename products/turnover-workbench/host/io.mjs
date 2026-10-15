// MIT. Owner-private, complete original file storage.
import {open,lstat,realpath,mkdir,rename,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
export const MAX_BYTES=256*1024*1024;
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const json=v=>JSON.stringify(v,null,2)+'\n';
export function need(value,code,message,status=400){if(!value)throw Object.assign(new Error(message),{code,status});}
export function absolute(p){need(typeof p==='string'&&isAbsolute(p)&&!p.includes('\0'),'TURNOVER_PATH','Select an absolute host-owned path.');return resolve(p);}
export async function privateDirectory(p,{create=false}={}){
 p=absolute(p);if(create)try{await mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&s.uid===process.getuid(),'TURNOVER_DIRECTORY','Use an owner-private directory.');
 need(await realpath(p)===p,'TURNOVER_DIRECTORY','Select the physical directory path.');
 return {path:p,dev:String(s.dev),ino:String(s.ino)};
}
export async function readBytes(p,max=MAX_BYTES){
 p=absolute(p);const f=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();need(s.isFile()&&s.size<=max&&s.uid===process.getuid()&&!(s.mode&0o077),'TURNOVER_FILE','Use a complete owner-private regular file within the size limit.');
 const b=await f.readFile();const end=await f.stat();need(b.length===s.size&&s.size===end.size&&s.mtimeMs===end.mtimeMs&&s.ctimeMs===end.ctimeMs,'TURNOVER_FILE_CHANGED','The original file changed while reading.',409);
 return {path:p,bytes:b,sha256:sha(b)};}finally{await f.close();}
}
export function decode(b){return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);}
export async function readJSON(p,max){const r=await readBytes(p,max);return {...r,value:JSON.parse(decode(r.bytes))};}
async function syncDir(dir){const f=await open(dir,'r');try{await f.sync();}finally{await f.close();}}
export async function writeBytes(p,bytes,{replace=false}={}){
 p=absolute(p);bytes=Buffer.from(bytes);need(bytes.length<=MAX_BYTES,'TURNOVER_FILE_SIZE','Complete file exceeds the 256 MiB storage limit.');
 const dir=dirname(p);await privateDirectory(dir);const temp=join(dir,'.turnover-pending-'+randomUUID());let fd;
 try{fd=await open(temp,'wx',0o600);await fd.writeFile(bytes);await fd.sync();await fd.close();fd=null;
 if(replace){try{await readBytes(p);}catch(e){if(e.code!=='ENOENT')throw e;}await rename(temp,p);}
 else{try{await link(temp,p);}catch(e){if(e.code!=='EEXIST')throw e;const prior=await readBytes(p);need(prior.bytes.equals(bytes),'TURNOVER_OUTPUT_CONFLICT','A different complete output already exists.',409);}await unlink(temp);}
 await syncDir(dir);return {path:p,sha256:sha(bytes),bytes:bytes.length};
 }finally{await fd?.close();try{await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
export async function writeJSON(p,v,options){return writeBytes(p,Buffer.from(json(v),'utf8'),options);}
