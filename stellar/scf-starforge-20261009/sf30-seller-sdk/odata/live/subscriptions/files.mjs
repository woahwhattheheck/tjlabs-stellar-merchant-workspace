// MIT. Private immutable files and the original release lease for OData subscriptions.
import {constants} from 'node:fs';
import {mkdir,open,lstat,realpath,rename,unlink,readdir,link} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {acquireReleaseLease} from '../../../../sf82-seller-pilot/release-process.mjs';
import {canonical} from '../../source.mjs';
export {canonical};
export const HASH=/^[a-f0-9]{64}$/;
export const LIMITS=Object.freeze({rows:1000000,rowBytes:16777216,fileBytes:256*1024*1024,totalBytes:512*1024*1024,fields:32,editions:10000,transferEditions:100,files:2048});
export const need=(ok,code,message,status=409)=>{if(!ok)throw Object.assign(new Error(message),{code:'ODATA_SUBSCRIPTION_'+code,status});};
export const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const sha=raw=>createHash('sha256').update(raw).digest('hex');
export const same=(a,b)=>canonical(a)===canonical(b);
export const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
export const identity=raw=>({bytes:raw.length,sha256:sha(raw)});
export const integer=(v,min,max,label)=>{need(Number.isSafeInteger(v)&&v>=min&&v<=max,'LIMIT','Choose a valid '+label+'.',400);return v;};
export const text=(v,label,max=160)=>{need(typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max&&v.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(v),'TEXT','Choose a valid '+label+'.',400);return v;};
export function relative(path){need(typeof path==='string'&&path.length<=1024&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p)),'PATH','Select a declared relative file.',400);return path;}
export function shape(value,allowed,label){need(plain(value)&&Object.keys(value).every(k=>allowed.includes(k)),'FIELDS','Use the supported '+label+' fields.',400);}
export async function privateDirectory(path,{create=false}={}){
  path=resolve(path);if(create)await mkdir(path,{recursive:true,mode:0o700});
  const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
    (typeof process.getuid!=='function'||s.uid===process.getuid())&&await realpath(path)===path,'DIRECTORY','Use an owned private directory.');
  return path;
}
export async function pathAt(root,name,{create=false}={}){
  relative(name);root=await privateDirectory(root);let parent=root;
  for(const part of name.split('/').slice(0,-1)){parent=join(parent,part);await privateDirectory(parent,{create});}
  return join(root,name);
}
async function opened(path){
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),s=await handle.stat();
  try{need(s.isFile()&&(s.mode&0o077)===0&&(typeof process.getuid!=='function'||s.uid===process.getuid()),'FILE','Use an owned private regular file.');return {handle,s};}
  catch(error){await handle.close();throw error;}
}
export async function* chunks(path,expected,max=LIMITS.fileBytes){
  await privateDirectory(dirname(resolve(path)));const {handle,s}=await opened(path),hash=createHash('sha256');let count=0;
  try{need(s.size<=max,'FILE_LIMIT','The selected file exceeds the receiving limit.');
    if(expected)need(HASH.test(expected.sha256)&&Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&s.size===expected.bytes,'FILE_IDENTITY','The selected file length changed.');
    const buffer=Buffer.alloc(65536);let offset=0;
    while(true){const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);if(!bytesRead)break;
      const raw=Buffer.from(buffer.subarray(0,bytesRead));offset+=bytesRead;count+=bytesRead;hash.update(raw);yield raw;}
    const end=await handle.stat(),name=await lstat(path);need(end.dev===s.dev&&end.ino===s.ino&&end.size===s.size&&end.mtimeMs===s.mtimeMs&&end.ctimeMs===s.ctimeMs&&
      name.isFile()&&!name.isSymbolicLink()&&name.dev===s.dev&&name.ino===s.ino&&count===s.size,'FILE_CHANGED','A selected file changed while reading.');
    const digest=hash.digest('hex');if(expected)need(count===expected.bytes&&digest===expected.sha256,'FILE_CHANGED','The selected file bytes changed.');
  }finally{await handle.close();}
}
export async function read(path,max=16777216,expected){const parts=[];for await(const raw of chunks(resolve(path),expected,max))parts.push(raw);return Buffer.concat(parts);}
export async function measure(path,max=LIMITS.fileBytes){const hash=createHash('sha256');let count=0;for await(const raw of chunks(path,null,max)){count+=raw.length;hash.update(raw);}return {bytes:count,sha256:hash.digest('hex')};}
export async function readJSON(root,name,max=16777216,expected){return parse(await read(await pathAt(root,name),max,expected));}
export async function maybeJSON(root,name,max=16777216){try{return await readJSON(root,name,max);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function syncDir(path){const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await f.sync();}finally{await f.close();}}
export async function atomic(root,name,value){
  const target=await pathAt(root,name,{create:true}),temp=join(dirname(target),'.subscription-state-'+randomUUID()+'.partial'),f=await open(temp,'wx',0o600);
  try{await f.writeFile(bytes(value));await f.sync();}finally{await f.close();}
  await rename(temp,target);await syncDir(dirname(target));
}
async function settle(target,expected){
  const s=await lstat(target);const prefix='.subscription-'+basename(target)+'-'+expected.sha256+'-';let changed=false;
  for(const name of await readdir(dirname(target))){if(!name.startsWith(prefix)||!/^[a-f0-9-]{36}\.partial$/.test(name.slice(prefix.length)))continue;
    const path=join(dirname(target),name);let candidate;try{candidate=await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(candidate.isFile()&&!candidate.isSymbolicLink()&&candidate.dev===s.dev&&candidate.ino===s.ino&&candidate.uid===s.uid){
      const current=await lstat(target);need(current.dev===s.dev&&current.ino===s.ino,'FILE_CHANGED','Publication changed during receiving.');await unlink(path);changed=true;}}
  if(changed)await syncDir(dirname(target));
}
export async function copy(root,name,source,expected){
  need(plain(expected)&&HASH.test(expected.sha256)&&Number.isSafeInteger(expected.bytes)&&expected.bytes<=LIMITS.fileBytes,'FILE_IDENTITY','Choose a complete original file identity.');
  const target=await pathAt(root,name,{create:true});try{await measureChecked(target,expected);await settle(target,expected);return target;}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=join(dirname(target),'.subscription-'+basename(target)+'-'+expected.sha256+'-'+randomUUID()+'.partial'),f=await open(temp,'wx',0o600);
  try{for await(const raw of chunks(source,expected))await f.writeFile(raw);await f.sync();}finally{await f.close();}
  try{await link(temp,target);}catch(e){if(e.code!=='EEXIST')throw e;await measureChecked(target,expected);}
  await unlink(temp);await syncDir(dirname(target));return target;
}
export async function immutable(root,name,raw){
  const expected=identity(raw),target=await pathAt(root,name,{create:true});
  try{await measureChecked(target,expected);await settle(target,expected);return expected;}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=join(dirname(target),'.subscription-'+basename(target)+'-'+expected.sha256+'-'+randomUUID()+'.partial'),f=await open(temp,'wx',0o600);
  try{await f.writeFile(raw);await f.sync();}finally{await f.close();}
  try{await link(temp,target);}catch(e){if(e.code!=='EEXIST')throw e;await measureChecked(target,expected);}
  await unlink(temp);await syncDir(dirname(target));return expected;
}
export async function measureChecked(path,expected){const actual=await measure(path);need(same(actual,expected),'FILE_CHANGED','A retained file differs from its selected identity.');return actual;}
export async function* lines(path,expected,maxRow=LIMITS.rowBytes){
  const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
  for await(const raw of chunks(path,expected)){pending+=decoder.decode(raw,{stream:true});let end;
    while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);need(line&&Buffer.byteLength(line)<=maxRow,'ROW','The retained row framing or size changed.');yield parse(Buffer.from(line));}
    need(Buffer.byteLength(pending)<=maxRow,'ROW','One retained row exceeds its supported size.');}
  pending+=decoder.decode();need(!pending,'ROW','The retained rows must end with a complete newline.');
}
export async function inventory(root,names){const rows=[];let total=0;for(const name of [...new Set(names)].sort()){const file=await measure(await pathAt(root,name));total+=file.bytes;need(rows.length<LIMITS.files&&total<=LIMITS.totalBytes,'TRANSFER_LIMIT','Choose a smaller complete transfer.');rows.push({path:name,...file});}return rows;}
const tails=new Map();
export async function leased(directory,operation){
  const root=await privateDirectory(directory,{create:true}),prior=tails.get(root)??Promise.resolve();let release;
  const tail=new Promise(resolve=>{release=resolve;});tails.set(root,tail);await prior;
  let lease;try{lease=await acquireReleaseLease(root,'state.lock');return await operation(root);}
  finally{try{await lease?.close();}finally{release();if(tails.get(root)===tail)tails.delete(root);}}
}
