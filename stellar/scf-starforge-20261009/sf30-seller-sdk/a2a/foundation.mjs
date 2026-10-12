// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, linkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const SCHEMA = 'stellar-forge.a2a-workspace.v1';
export const SDK_VERSION = '1.3.0';
export const SDK_COMMIT = '29417a5bb4038f804f310ce4fffd267a9375aa90';
export const LIMITS = Object.freeze({requestBytes:1024*1024, cardBytes:2*1024*1024, responseBytes:32*1024*1024, artifactBytes:32*1024*1024, editionBytes:128*1024*1024, packetBytes:256*1024*1024, streamMs:120000, events:2000});
export class A2AWorkspaceError extends Error {
  constructor(code, message=code, status=400, details={}) { super(message); this.name='A2AWorkspaceError'; Object.assign(this,{code,status,details}); }
}
export const fail=(code,message=code,status=400,details={})=>{throw new A2AWorkspaceError(code,message,status,details);};
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export function canonical(value) {
  const visit=v=>{
    if(v===null||typeof v==='boolean'||typeof v==='string')return v;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(Array.isArray(v))return v.map(visit);
    if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k])]));
    fail('INVALID_JSON','Only complete finite JSON values are supported.');
  };
  return JSON.stringify(visit(value));
}
export const clone=value=>JSON.parse(canonical(value));
export function object(v,label='object') {if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_INPUT',label+' must be an object.');return v;}
export function text(v,label='text',max=10000,{empty=false}={}) {if(typeof v!=='string'||(!empty&&!v.trim())||v.length>max||v.includes('\0'))fail('INVALID_INPUT',label+' is invalid.');return v;}
export function identifier(v,label='id') {text(v,label,240);if(!/^[A-Za-z0-9_.:-]+$/.test(v))fail('INVALID_ID',label+' contains unsupported characters.');return v;}
export function digest(v) {if(!/^[a-f0-9]{64}$/.test(v??''))fail('INVALID_DIGEST');return v;}
export function integer(v,label,min,max) {if(!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_INPUT',label+' is outside its supported range.');return v;}
export function safeName(value,fallback='source.bin') {return String(value||fallback).replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,160)||fallback;}
export function mediaType(value,fallback='application/octet-stream') {return typeof value==='string'&&/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ -~]*)?$/.test(value)?value:fallback;}
export function publicError(error) {return error instanceof A2AWorkspaceError?{code:error.code,message:error.message,...(error.details===undefined?{}:{details:error.details})}:{code:'NATIVE_OPERATION_FAILED',message:'The original operation did not return a verified result. Inspect its retained HTTP evidence.',details:{name:String(error?.name??'Error').slice(0,80)}};}
export function decodeBase64(value,max=LIMITS.artifactBytes) {if(typeof value!=='string'||value.length>Math.ceil(max/3)*4+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('INVALID_BASE64');const b=Buffer.from(value,'base64');if(b.length>max||b.toString('base64')!==value)fail('INVALID_BASE64');return b;}
/** Original output positions shared by capture and portable verification. Artifact
 * outputs take precedence; a message/status body is the output when no artifact exists. */
export function nativeOutputParts(observation) {
  object(observation,'observation');const value=object(observation.value,'native observation');
  const partsOf=(parts,artifactId,name)=>{
    if(!Array.isArray(parts))fail('NATIVE_OUTPUT_PARTS');
    return parts.map((part,index)=>{
      object(part,'native output part');
      const fields=['text','raw','url','data'].filter(key=>Object.hasOwn(part,key));
      if(fields.length!==1)fail('NATIVE_OUTPUT_CONTENT','Each original output part must select one content field.');
      if(fields[0]==='text'&&typeof part.text!=='string')fail('NATIVE_OUTPUT_CONTENT');
      if(fields[0]==='url'&&(typeof part.url!=='string'||!part.url))fail('NATIVE_OUTPUT_CONTENT');
      return {artifactId,name,index,part};
    });
  };
  if(observation.kind==='message')return partsOf(value.parts??[],null,'Agent message');
  if(observation.kind!=='task')fail('COMPLETE_OBSERVATION_REQUIRED','Select an original completed Task or Message observation.',409);
  const artifacts=value.artifacts??[];if(!Array.isArray(artifacts))fail('NATIVE_OUTPUT_ARTIFACTS');
  const ids=new Set(),parts=[];
  for(const artifact of artifacts){
    object(artifact,'native artifact');text(artifact.artifactId,'native artifactId',1000);
    if(ids.has(artifact.artifactId))fail('NATIVE_OUTPUT_ARTIFACT_ID');ids.add(artifact.artifactId);
    parts.push(...partsOf(artifact.parts??[],artifact.artifactId,artifact.name??artifact.artifactId));
  }
  if(!parts.length&&value.status?.message?.parts)parts.push(...partsOf(value.status.message.parts,null,'Task status message'));
  return parts;
}

export function privateDirectory(path) {
  const p=resolve(path);mkdirSync(p,{recursive:true,mode:0o700});const s=lstatSync(p);
  if(!s.isDirectory()||s.isSymbolicLink())fail('UNSAFE_DIRECTORY');
  return realpathSync(p);
}
export function atomicFile(path,bytes,{replace=false}={}) {
  const dir=privateDirectory(dirname(path)),name=join(dir,'.a2a-'+id()+'.tmp');
  const fd=openSync(name,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  try{if(replace)renameSync(name,path);else{try{linkSync(name,path);}catch(e){if(e.code!=='EEXIST'||sha(readVerifiedFile(path))!==sha(bytes))throw e;}unlinkSync(name);}const d=openSync(dir,constants.O_RDONLY);try{fsyncSync(d);}finally{closeSync(d);}}
  finally{try{unlinkSync(name);}catch{}}
}
export function readVerifiedFile(path,max=LIMITS.packetBytes) {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const before=fstatSync(fd);if(!before.isFile()||before.size>max||before.nlink!==1)fail('UNSAFE_FILE');const bytes=readFileSync(fd);const after=fstatSync(fd);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.length!==before.size)fail('SOURCE_CHANGED');return bytes;}finally{closeSync(fd);}
}
export function objectStore(directory) {
  const root=privateDirectory(join(directory,'objects'));
  return {
    put(bytes){bytes=Buffer.from(bytes);if(bytes.length>LIMITS.packetBytes)fail('SOURCE_TOO_LARGE');const hash=sha(bytes),path=join(root,hash);if(existsSync(path)){if(sha(readVerifiedFile(path))!==hash)fail('CORRUPT_OBJECT');}else atomicFile(path,bytes);return{sha256:hash,bytes:bytes.length};},
    get(hash){digest(hash);const bytes=readVerifiedFile(join(root,hash));if(sha(bytes)!==hash)fail('CORRUPT_OBJECT');return bytes;}
  };
}
export function checkedURL(value,{trustedOrigins=[],origins=null}={}) {
  text(value,'URL',8192);let url;try{url=new URL(value);}catch{fail('INVALID_URL');}
  if(url.username||url.password||url.hash)fail('UNSAFE_URL','URLs cannot contain user credentials or fragments.');
  if(!['https:','http:'].includes(url.protocol))fail('UNSAFE_URL');
  if(url.protocol!=='https:'&&!trustedOrigins.includes(url.origin))fail('TRUSTED_ORIGIN_REQUIRED','HTTP requires an explicit host-selected trusted origin.');
  if(origins&&!origins.includes(url.origin))fail('ORIGIN_NOT_SELECTED','The URL origin is not selected by the host.');
  for(const key of url.searchParams.keys())if(/token|secret|password|credential|api[_-]?key|signature/i.test(key))fail('URL_CREDENTIAL','Select credentials through the private connection configuration.');
  return url;
}
export function normalizeConnections(input=[]) {
  if(!Array.isArray(input)||input.length>64)fail('INVALID_CONNECTIONS');const seen=new Set();
  return input.map(raw=>{
    object(raw);const v=clone(raw);identifier(v.id,'connection id');if(seen.has(v.id))fail('DUPLICATE_CONNECTION');seen.add(v.id);
    v.label=text(v.label??v.id,'connection label',200);
    v.trustedOrigins??=[];v.allowedOrigins??=[];v.artifactOrigins??=[];
    for(const list of [v.trustedOrigins,v.allowedOrigins,v.artifactOrigins]) {if(!Array.isArray(list)||list.length>64)fail('INVALID_ORIGINS');for(const origin of list){const u=new URL(origin);if(u.origin!==origin||u.username||u.password||!['http:','https:'].includes(u.protocol))fail('INVALID_ORIGIN');}}
    checkedURL(v.cardUrl,v);if(!v.allowedOrigins.includes(new URL(v.cardUrl).origin))fail('CARD_ORIGIN_NOT_SELECTED');
    if(v.credential){object(v.credential);if(!['Bearer','Basic','ApiKey'].includes(v.credential.scheme)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.credential.env??''))fail('INVALID_CREDENTIAL_REFERENCE');}
    v.timeoutMs=integer(v.timeoutMs??30000,'timeoutMs',1000,300000);
    v.streamMs=integer(v.streamMs??LIMITS.streamMs,'streamMs',1000,300000);
    return Object.freeze(v);
  });
}
export function connectionView(c) {return{id:c.id,label:c.label,cardUrl:c.cardUrl,allowedOrigins:[...c.allowedOrigins],artifactOrigins:[...c.artifactOrigins],trustedOrigins:[...c.trustedOrigins],authentication:c.credential?{scheme:c.credential.scheme,configured:true}:{scheme:'none',configured:false},timeoutMs:c.timeoutMs,streamMs:c.streamMs};}
export function sourceRefs(value,result=new Set()) {
  if(Array.isArray(value))for(const v of value)sourceRefs(v,result);
  else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value)){if((key==='sha256'||key==='bodySha256')&&typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))result.add(v);else sourceRefs(v,result);}
  return result;
}
