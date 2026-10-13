// SPDX-License-Identifier: MIT
// Complete worksheet-review receiving under the original registered native host.
import {join} from 'node:path';
import {lstat} from 'node:fs/promises';
import {initializationDirectory as directory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationFile as retainFile}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {EVENT_ID,EVENT_HASH,eventObject as object,eventNeed as need,eventHash as sha,eventCanonical}
 from './native-analysis-events-contract.mjs';
export const EVENT_WORKBOOK_REVIEW_LIMIT=16*1024*1024;
export const EVENT_WORKBOOK_CHUNK_BYTES=65536;
export const EVENT_WORKBOOK_REQUEST_LIMIT=17*1024*1024;
export const EVENT_WORKBOOK_SOURCE_SCHEMA='stellar-forge.analysis-event-workbook-source.v1';
const encoded=value=>Buffer.from(eventCanonical(value)+'\n');
function selection(value){
 need(object(value)&&Object.keys(value).length===3&&EVENT_ID.test(value.id??'')&&
  EVENT_HASH.test(value.sha256??'')&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&
  value.bytes<=EVENT_WORKBOOK_REVIEW_LIMIT,'WORKBOOK_SOURCE_REQUIRED');
 return {id:value.id,bytes:value.bytes,sha256:value.sha256};
}
async function root(record,id,create=false){
 need(EVENT_ID.test(record.workspaceId??'')&&EVENT_ID.test(id??''),'WORKBOOK_SOURCE_ID_REQUIRED');
 let path=record.nativeWorkspace;await directory(path);
 for(const part of ['analysis','event-workbook-reviews',record.workspaceId,id]){
  path=join(path,part);await directory(path,{create});
 }
 return path;
}
async function metadata(record,id){
 const path=await root(record,id),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(join(path,'source.json'),4096)));
 need(object(value)&&value.schema===EVENT_WORKBOOK_SOURCE_SCHEMA&&value.workspace_id===record.workspaceId&&
  Object.keys(value).length===5&&value.id===id,'WORKBOOK_SOURCE_CHANGED');
 selection({id:value.id,bytes:value.bytes,sha256:value.sha256});
 return {path,value};
}
const partName=offset=>'chunk-'+String(offset).padStart(8,'0')+'.bin';
function whole(value,raw){
 need(raw.length===value.bytes&&sha(raw)===value.sha256,'WORKBOOK_SOURCE_CHANGED');return raw;
}
async function statusAt(path,value){
 const complete=await optionalBytes(join(path,'working-review.json'),EVENT_WORKBOOK_REVIEW_LIMIT);
 if(complete!==null){whole(value,complete);return {...value,received:value.bytes,complete:true,chunk_bytes:EVENT_WORKBOOK_CHUNK_BYTES};}
 let received=0;
 while(received<value.bytes){
  const expected=Math.min(EVENT_WORKBOOK_CHUNK_BYTES,value.bytes-received),name=join(path,partName(received));
  let info;try{info=await lstat(name);}catch(error){if(error.code==='ENOENT')break;throw error;}
  need(info.isFile()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
   (typeof process.getuid!=='function'||info.uid===process.getuid())&&info.size===expected,'WORKBOOK_CHUNK_CHANGED');
  received+=expected;
 }
 if(received===value.bytes){
  const parts=[];
  for(let offset=0;offset<value.bytes;offset+=EVENT_WORKBOOK_CHUNK_BYTES){
   const part=await bytes(join(path,partName(offset)),EVENT_WORKBOOK_CHUNK_BYTES);
   need(part.length===Math.min(EVENT_WORKBOOK_CHUNK_BYTES,value.bytes-offset),'WORKBOOK_CHUNK_CHANGED');
   parts.push(part);
  }
  const raw=whole(value,Buffer.concat(parts));
  await retainFile(join(path,'working-review.json'),raw,{resume:true});
 }
 return {...value,received,complete:received===value.bytes,chunk_bytes:EVENT_WORKBOOK_CHUNK_BYTES};
}
export async function createEventWorkbookReviewSource(record,body){
 const selected=selection(body),path=await root(record,selected.id,true);
 const value={schema:EVENT_WORKBOOK_SOURCE_SCHEMA,workspace_id:record.workspaceId,...selected};
 await retainFile(join(path,'source.json'),encoded(value),{resume:true});
 return statusAt(path,value);
}
export async function eventWorkbookReviewSourceStatus(record,id){
 const {path,value}=await metadata(record,id);return statusAt(path,value);
}
export async function receiveEventWorkbookReviewChunk(record,body){
 need(object(body)&&EVENT_ID.test(body.id??'')&&Number.isSafeInteger(body.offset)&&body.offset>=0&&
  body.offset%EVENT_WORKBOOK_CHUNK_BYTES===0&&EVENT_HASH.test(body.sha256??'')&&
  typeof body.base64==='string'&&body.base64.length<=87384,'WORKBOOK_CHUNK_REQUIRED');
 const {path,value}=await metadata(record,body.id),raw=Buffer.from(body.base64,'base64');
 need(body.offset<value.bytes&&raw.length===Math.min(EVENT_WORKBOOK_CHUNK_BYTES,value.bytes-body.offset)&&
  raw.toString('base64')===body.base64&&sha(raw)===body.sha256,'WORKBOOK_CHUNK_CHANGED');
 await retainFile(join(path,partName(body.offset)),raw,{resume:true});
 return statusAt(path,value);
}
export async function readEventWorkbookReviewSource(record,body){
 const selected=selection(body),{path,value}=await metadata(record,selected.id);
 need(value.bytes===selected.bytes&&value.sha256===selected.sha256,'WORKBOOK_SOURCE_SELECTION_CHANGED');
 const status=await statusAt(path,value);need(status.complete,'COMPLETE_WORKBOOK_SOURCE_REQUIRED');
 const raw=whole(value,await bytes(join(path,'working-review.json'),EVENT_WORKBOOK_REVIEW_LIMIT));
 let working;try{working=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{need(false,'WORKBOOK_SOURCE_JSON_REQUIRED');}
 need(object(working)&&Buffer.byteLength(eventCanonical(working))<=EVENT_WORKBOOK_REVIEW_LIMIT,'WORKBOOK_REVIEW_TOO_LARGE');
 return working;
}
