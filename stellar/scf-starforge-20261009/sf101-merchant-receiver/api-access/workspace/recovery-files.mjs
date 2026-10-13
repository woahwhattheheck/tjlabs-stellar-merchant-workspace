// MIT. Strict private file identities for the original customer recovery adapter.
import {constants} from 'node:fs';
import {open,lstat,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve,sep,join} from 'node:path';
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const need=(v,code,status=409)=>{if(!v)throw Object.assign(new Error(code),{code,status});};
export const codeOf=e=>/^[A-Z0-9_]{1,140}$/.test(e?.code??'')?e.code:'API_CUSTOMER_RECOVERY_FAILED';
export const inside=(root,path)=>root===path||path.startsWith(root+sep);
export function absolute(path){need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!==sep&&!path.includes('\0'),'API_RECOVERY_ABSOLUTE_PATH_REQUIRED');return path;}
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const same=(a,b)=>canonical(a)===canonical(b);
export const sha=v=>createHash('sha256').update(v).digest('hex');
export async function present(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function directory(path){
 absolute(path);const st=await lstat(path);
 need(st.isDirectory()&&!st.isSymbolicLink()&&!(st.mode&0o077)&&st.uid===process.getuid()&&await realpath(path)===path,'API_RECOVERY_PRIVATE_DIRECTORY_REQUIRED');
 return st;
}
export async function file(path,{maximum=2*1024**3,contents=false,signal,withStamp=false}={}){
 absolute(path);need(await realpath(path)===path,'API_RECOVERY_FILE_PATH_CHANGED');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const a=await f.stat({bigint:true}),st=await f.stat();
  need(st.isFile()&&st.nlink===1&&st.uid===process.getuid()&&!(st.mode&0o077)&&st.size<=maximum,'API_RECOVERY_PRIVATE_FILE_REQUIRED');
  const h=createHash('sha256'),chunks=[];let bytes=0;
  for await(const chunk of f.createReadStream({autoClose:false})){need(!signal?.aborted,'API_RECOVERY_CANCELLED');bytes+=chunk.length;need(bytes<=maximum,'API_RECOVERY_FILE_TOO_LARGE');h.update(chunk);if(contents)chunks.push(chunk);}
  const b=await f.stat({bigint:true});
  need(bytes===st.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]),'API_RECOVERY_SOURCE_CHANGED');
  return {path,bytes,sha256:h.digest('hex'),...(withStamp?{stamp:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,b[k].toString()]))}:{}),...(contents?{raw:Buffer.concat(chunks)}:{})};
 }finally{await f.close();}
}
export async function jsonFile(path,maximum=32*1024*1024){
 const result=await file(path,{maximum,contents:true});
 return {...result,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.raw))};
}
export async function optionalJson(path,maximum){if(!(await present(path)))return null;return (await jsonFile(path,maximum)).value;}
export async function exactTree(root,files,{signal}={}){
 await directory(root);const known=new Map(files.map(f=>[f.path,f]));need(known.size===files.length&&known.get('')?.kind==='directory','API_RECOVERY_FILE_LIST_CHANGED');known.delete('');
 async function walk(path,rel=''){
  for(const e of await readdir(path,{withFileTypes:true})){
   const name=rel?rel+'/'+e.name:e.name,expected=known.get(name);
   need(expected&&!e.isSymbolicLink(),'API_RECOVERY_RESTORED_CONTENT_CHANGED');
   if(e.isDirectory()){need(expected.kind==='directory','API_RECOVERY_RESTORED_CONTENT_CHANGED');await directory(join(root,name));await walk(join(root,name),name);}
   else{need(expected.kind==='file'||expected.kind==='ledger','API_RECOVERY_RESTORED_CONTENT_CHANGED');const got=await file(join(root,name),{signal});need(got.bytes===expected.size&&got.sha256===expected.sha256,'API_RECOVERY_RESTORED_CONTENT_CHANGED');}
   known.delete(name);
  }
 }
 await walk(root);need(known.size===0,'API_RECOVERY_RESTORED_CONTENT_MISSING');return true;
}
