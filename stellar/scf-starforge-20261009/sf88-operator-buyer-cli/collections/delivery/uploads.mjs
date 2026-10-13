// MIT. Exact chunk replay for a closed customer package; no executable upload.
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initializationDirectory, initializationBytes, retainInitializationFile } from '../../initialization.mjs';
import { acquireCollectionLease } from '../model.mjs';
import { bytes, need, hash, identity, digest, publish, measure, MAX_PACKAGE, CHUNK } from './format.mjs';
const id=value=>{need(hash(value),'CUSTOMER_DELIVERY_UPLOAD_SHA');return value;};
export async function openUploads(directory){
 await initializationDirectory(directory,{create:true});
 async function selected(sha256){const base=join(directory,id(sha256));await initializationDirectory(base);const value=JSON.parse(await initializationBytes(join(base,'upload.json')));need(value.sha256===sha256,'CUSTOMER_DELIVERY_UPLOAD_CHANGED');return{base,value};}
 async function inspect(sha256){
  const {base,value}=await selected(sha256);let offset=0;const parts=[];
  const names=(await readdir(base)).filter(x=>/^[0-9]+\.part$/.test(x)).sort((a,b)=>Number(a.split('.')[0])-Number(b.split('.')[0]));
  for(const name of names){need(Number(name.split('.')[0])===offset,'CUSTOMER_DELIVERY_UPLOAD_GAP');const row=await measure(join(base,name));need(row.bytes>0&&row.bytes<=CHUNK&&offset+row.bytes<=value.bytes,'CUSTOMER_DELIVERY_UPLOAD_SIZE');parts.push({offset,...row});offset+=row.bytes;}
  let complete=false;try{await measure(join(base,'complete.ndjson'),value,MAX_PACKAGE);complete=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  return{...value,offset,complete,parts};
 }
 async function lock(sha256,fn){const {base}=await selected(sha256);const release=await acquireCollectionLease(base);try{return await fn(base);}finally{await release();}}
 async function start(input){
  need(input&&hash(input.sha256)&&Number.isSafeInteger(input.bytes)&&input.bytes>0&&input.bytes<=MAX_PACKAGE&&typeof input.filename==='string'&&input.filename.length>0&&input.filename.length<=200&&!/[\x00-\x1f]/.test(input.filename),'CUSTOMER_DELIVERY_UPLOAD_INPUT');
  const value={sha256:input.sha256,bytes:input.bytes,filename:input.filename};const base=join(directory,input.sha256);await initializationDirectory(base,{create:true});await retainInitializationFile(join(base,'upload.json'),bytes(value),{resume:true});return inspect(input.sha256);
 }
 async function chunk(sha256,{offset,base64,sha256:partSha}){
  need(Number.isSafeInteger(offset)&&offset>=0&&typeof base64==='string'&&base64.length<=Math.ceil(CHUNK/3)*4&&hash(partSha),'CUSTOMER_DELIVERY_UPLOAD_CHUNK');
  const body=Buffer.from(base64,'base64');need(body.length>0&&body.length<=CHUNK&&body.toString('base64')===base64&&digest(body)===partSha,'CUSTOMER_DELIVERY_UPLOAD_CHUNK');
  return lock(sha256,async base=>{
   const state=await inspect(sha256),prior=state.parts.find(x=>x.offset===offset);
   if(prior){need(prior.bytes===body.length&&prior.sha256===partSha,'CUSTOMER_DELIVERY_UPLOAD_REPLAY_CHANGED');return state;}
   need(!state.complete&&offset===state.offset&&offset+body.length<=state.bytes,'CUSTOMER_DELIVERY_UPLOAD_OFFSET');
   await retainInitializationFile(join(base,offset+'.part'),body,{resume:true});return inspect(sha256);
  });
 }
 async function finish(sha256){
  return lock(sha256,async base=>{
   const state=await inspect(sha256);need(state.offset===state.bytes,'CUSTOMER_DELIVERY_UPLOAD_INCOMPLETE');
   await publish(join(base,'complete.ndjson'),async file=>{for(const part of state.parts){const body=await initializationBytes(join(base,part.offset+'.part'),CHUNK);need(body.length===part.bytes&&digest(body)===part.sha256,'CUSTOMER_DELIVERY_UPLOAD_CHANGED');await file.writeFile(body);}},{maximum:MAX_PACKAGE});
   await measure(join(base,'complete.ndjson'),state,MAX_PACKAGE);return{...(await inspect(sha256)),file:join(base,'complete.ndjson')};
  });
 }
 return{start,inspect,chunk,finish};
}
