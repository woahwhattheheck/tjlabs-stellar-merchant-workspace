// SPDX-License-Identifier: MIT
/** Streaming, create-or-identical publication for complete Econdb source. */
import {open,mkdir,lstat,realpath,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const need=(ok,message,status=422)=>{if(!ok)throw Object.assign(new Error(message),{code:'ECONDB_SOURCE_DESK_INPUT',status});};
export const ordinary=name=>typeof name==='string'&&name.length>0&&name.length<=4096&&!/^[\\/]|[\\:\x00-\x1f\x7f]/.test(name)&&name.split('/').every(x=>x&&x!=='.'&&x!=='..');
export const canonical=v=>JSON.stringify(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const same=(a,b)=>canonical(a)===canonical(b);
export const hash=raw=>createHash('sha256').update(raw).digest('hex');
export const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
export const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const fields=['dev','ino','size','mtimeMs','ctimeMs'];
const stable=(a,b)=>fields.every(k=>a[k]===b[k]);
export async function sync(path){const h=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
export async function directory(path){
 need(typeof path==='string'&&path===resolve(path),'Use a canonical absolute private directory.');
 await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);
 need(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&s.uid===process.getuid()&&await realpath(path)===path,'Keep the owned 0700 source directory without symbolic links.');
 await sync(dirname(path));return path;
}
export async function parent(root,name){
 need(ordinary(name),'Keep an ordinary complete relative filename.');let p=root;
 for(const part of name.split('/').slice(0,-1))p=await directory(join(p,part));
 return join(root,name);
}
export async function identity(path,{limit=Number.MAX_SAFE_INTEGER,signal}={}){
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await h.stat();need(before.isFile()&&Number.isSafeInteger(before.size)&&before.size<=limit,'Keep a complete regular source file within its capacity.');
 const digest=createHash('sha256');let bytes=0;
 for await(const part of h.createReadStream({autoClose:false})){signal?.throwIfAborted();bytes+=part.length;need(bytes<=limit,'Source exceeds its declared capacity.');digest.update(part);}
 const after=await h.stat(),named=await lstat(path);
 need(stable(before,after)&&named.dev===before.dev&&named.ino===before.ino&&bytes===before.size,'The original source changed while reading.',409);
 return {bytes,sha256:digest.digest('hex')};
 }finally{await h.close();}
}
export async function read(path,limit=64*1024*1024){
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await h.stat();need(before.isFile()&&before.size<=limit,'Keep the complete JSON/text file within its native capacity.');
 const raw=await h.readFile(),after=await h.stat(),named=await lstat(path);
 need(raw.length===before.size&&stable(before,after)&&before.dev===named.dev&&before.ino===named.ino,'The original file changed while reading.',409);return raw;
 }finally{await h.close();}
}
export async function optional(path,limit){try{return await read(path,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function commit(temp,path,expected,options){
 try{await link(temp,path);}catch(e){if(e.code!=='EEXIST')throw e;need(same(await identity(path,options),expected),'A different original file is already retained.',409);}
 await sync(dirname(path));
}
export async function retain(path,raw){
 need(Buffer.isBuffer(raw),'Retain exact UTF-8 or binary bytes.');
 const expected={bytes:raw.length,sha256:hash(raw)},old=await optional(path,raw.length);
 if(old!==null){need(old.equals(raw),'A different original file is already retained.',409);await sync(dirname(path));return expected;}
 const temp=join(dirname(path),'.receiving-'+randomUUID());let h;
 try{h=await open(temp,'wx',0o600);await h.writeFile(raw);await h.sync();await h.close();h=null;await commit(temp,path,expected,{});return expected;}
 finally{await h?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function retainStream(path,stream,expected,{signal}={}){
 need(Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&/^[a-f0-9]{64}$/.test(expected.sha256),'Keep the exact complete file identity.');
 const temp=join(dirname(path),'.stream-'+randomUUID());let h,bytes=0;const digest=createHash('sha256');
 try{h=await open(temp,'wx',0o600);
 for await(const part of stream){signal?.throwIfAborted();bytes+=part.length;need(bytes<=expected.bytes,'The original stream exceeds its selected length.');digest.update(part);await h.writeFile(part);}
 need(bytes===expected.bytes&&digest.digest('hex')===expected.sha256,'The full original stream differs from its selected identity.',409);
 await h.sync();await h.close();h=null;await commit(temp,path,expected,{signal});return expected;
 }finally{await h?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function copy(source,target,expected,options={}){
 const h=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await h.stat();need(before.isFile()&&before.size===expected.bytes,'The selected original source length differs.',409);
 // Hash and stage first; the stream checks the original open inode before its last yield.
 async function* original(){let count=0;for await(const raw of h.createReadStream({autoClose:false})){count+=raw.length;yield raw;}
 const after=await h.stat(),named=await lstat(source);need(stable(before,after)&&named.dev===before.dev&&named.ino===before.ino&&count===before.size,'The source changed during full transfer.',409);}
 await retainStream(target,original(),expected,options);return expected;
 }finally{await h.close();}
}
