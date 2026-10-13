// SPDX-License-Identifier: MIT
import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as F from '../files.mjs';
import {CONNECTION_SCHEMA,SOURCE_FILES,readConsoleConfiguration} from './config.mjs';
export const ORIGINAL_SOURCE_FILES=Object.freeze(['../handoff.mjs','../customer.mjs','../delivery.mjs','../files.mjs',
 '../../dataset-session.mjs','../../dataset-page.mjs','../../queue.mjs',
 '../../../sf81-buyer-operator-bridge/browser-approval.mjs']);
export async function inspectConsoleSource(directory=fileURLToPath(new URL('.',import.meta.url)),expected){
 directory=await realpath(resolve(directory));const files=[];
 for(const path of [...SOURCE_FILES,...ORIGINAL_SOURCE_FILES]){
  const absolute=resolve(directory,path),before=await lstat(absolute);
  F.need(before.isFile()&&!before.isSymbolicLink()&&before.size<=2*1024*1024&&
   await realpath(absolute)===absolute,'OPENAQ_CUSTOMER_SOURCE_INVALID');
  const raw=await readFile(absolute),after=await lstat(absolute);
  F.need(before.size===raw.length&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,
   'OPENAQ_CUSTOMER_SOURCE_CHANGED');
  files.push({path,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});
 }
 const sha256=F.digest(F.bytes(files));
 if(expected!==undefined)F.need(sha256===F.hash(expected),'OPENAQ_CUSTOMER_SOURCE_CHANGED');
 return {directory,sha256,files};
}
export function privateOrigin(value){
 let url;try{url=new URL(value);}catch{}
 F.need(url&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)>0&&Number(url.port)<=65535&&
  !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','OPENAQ_CUSTOMER_PRIVATE_ORIGIN_REQUIRED');
 return url.origin;
}
export async function readCustomerConnection(path){
 const value=await F.json(F.path(path),262144);
 F.need(value.schema===CONNECTION_SCHEMA&&F.UUID.test(value.consoleId??'')&&F.UUID.test(value.instanceId??'')&&
  F.HASH.test(value.configurationSha256??'')&&F.HASH.test(value.sourceIdentity?.sha256??'')&&
  typeof value.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value.token),'OPENAQ_CUSTOMER_CONNECTION_CHANGED');
 privateOrigin(value.origin);const settings=await readConsoleConfiguration(value.directory,value.configurationSha256);
 F.need(settings.id===value.consoleId,'OPENAQ_CUSTOMER_CONNECTION_CHANGED');return value;
}
export async function customerJSON(binding,path,{method='GET',body,signal,maxBytes=32*1024*1024}={}){
 const origin=privateOrigin(binding.origin);
 F.need(typeof path==='string'&&path.startsWith('/api/')&&!path.includes('#')&&
  Number.isSafeInteger(maxBytes)&&maxBytes>=1&&maxBytes<=64*1024*1024,'OPENAQ_CUSTOMER_PATH_INVALID');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
 F.signal(signal);signal?.addEventListener('abort',abort,{once:true});
 try{
  const response=await fetch(origin+path,{method,headers:{authorization:'Bearer '+binding.token,
   ...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),
   signal:controller.signal,redirect:'manual'});
  F.need(response.headers.get('x-openaq-customer-instance')===binding.instanceId,'OPENAQ_CUSTOMER_INSTANCE_CHANGED');
  const chunks=[];let count=0;
  for await(const raw of response.body){count+=raw.length;F.need(count<=maxBytes,'OPENAQ_CUSTOMER_RESPONSE_LIMIT');chunks.push(Buffer.from(raw));}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{}
  F.need(F.object(value),'OPENAQ_CUSTOMER_RESPONSE_INVALID');
  if(!response.ok)throw Object.assign(new Error(value.error??'OPENAQ_CUSTOMER_REQUEST_FAILED'),{
   code:value.error??'OPENAQ_CUSTOMER_REQUEST_FAILED',status:response.status});
  return value;
 }finally{controller.abort();signal?.removeEventListener('abort',abort);}
}
export async function verifyCustomerConnection(binding){
 const value=await customerJSON(binding,'/api/identity');
 F.need(value.consoleId===binding.consoleId&&value.instanceId===binding.instanceId&&
  value.configurationSha256===binding.configurationSha256&&value.sourceIdentity.sha256===binding.sourceIdentity.sha256,
 'OPENAQ_CUSTOMER_CONNECTION_CHANGED');return value;
}
