// MIT. Private companion files for the original SF74 Curity extension.
import {constants} from 'node:fs';
import {mkdir,lstat,open,readdir} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {retainCaseArtifact} from '../case-store.mjs';
import {withPrivateLock} from '../../sf30-seller-sdk/routescan/quota.mjs';
export const SHA=/^[a-f0-9]{64}$/;
export const ID=/^[a-z0-9][a-z0-9_-]{0,63}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const fail=(code,message,status=422)=>Object.assign(new Error(message),{code:'CURITY_'+code,status});
export function ensure(value,code,message,status=422){if(!value)throw fail(code,message,status);}
export function fields(value,allowed,label='input'){
  ensure(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key)),
    'INPUT','Unexpected '+label+' fields.');
  return value;
}
export function text(value,maximum,label,{empty=false}={}){
  ensure(typeof value==='string'&&(empty||value.trim())&&Buffer.byteLength(value)<=maximum&&
    Buffer.from(value).toString('utf8')===value&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    'INPUT','Invalid '+label+'.');
  return value;
}
export function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function same(a,b,code='SELECTION_CHANGED'){
  ensure(canonical(a)===canonical(b),code,'The retained original selection differs.',409);
}
export async function privateDirectory(path,{create=true}={}){
  ensure(typeof path==='string'&&isAbsolute(path),'DIRECTORY','Select an absolute private directory.');
  const full=resolve(path);
  if(create)await mkdir(full,{recursive:true,mode:0o700});
  const st=await lstat(full);
  ensure(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&
    (typeof process.getuid!=='function'||st.uid===process.getuid()),
    'DIRECTORY','Use an operator-owned private directory.');
  return full;
}
export async function read(path,maximum=32*1024*1024){
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await fd.stat({bigint:true});
    ensure(before.isFile()&&before.size<=BigInt(maximum)&&(before.mode&0o077n)===0n,
      'FILE','The selected companion must be a complete private regular file.');
    const value=await fd.readFile(),after=await fd.stat({bigint:true});
    ensure(BigInt(value.length)===before.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),
      'FILE_CHANGED','The selected file changed while reading.',409);
    return value;
  }finally{await fd.close();}
}
export async function readJson(path,maximum){
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await read(path,maximum)));
}
export async function optional(path,maximum){try{return await readJson(path,maximum);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function retain(path,value){
  await privateDirectory(dirname(path));
  const content=value instanceof Uint8Array?value:bytes(value);
  return retainCaseArtifact(path,content);
}
export function relativeName(value){
  ensure(typeof value==='string'&&value.length<=1000&&value!==''&&!value.includes('\\')&&!value.includes('\0')&&
    !value.startsWith('/')&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'FILE_PATH','Select a relative member name.');
  return value;
}
export async function member(root,name,{parents=false}={}){
  relativeName(name);
  let directory=root;
  for(const part of name.split('/').slice(0,-1)){
    directory=join(directory,part);await privateDirectory(directory,{create:parents});
  }
  return join(directory,name.split('/').at(-1));
}
export function disjoint(a,b){
  const x=resolve(a),y=resolve(b);
  ensure(x!==y&&!x.startsWith(y+sep)&&!y.startsWith(x+sep),'DIRECTORY','Keep input, output and native stores in separate directories.');
}
export async function locked(directory,work){
  await privateDirectory(directory);
  return withPrivateLock(directory,'.curity.lock',work);
}
export async function listFolders(root){
  await privateDirectory(root);
  return (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&!x.isSymbolicLink()&&ID.test(x.name)).map(x=>x.name).sort();
}
