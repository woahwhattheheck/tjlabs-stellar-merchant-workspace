// SPDX-License-Identifier: MIT
// Read-only preparation on the original authenticated Research listener.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareOutput,csvRecords} from './prepare.mjs';
import {isPrivacyBenchPlan,privacyBenchImplementation} from './privacybench.mjs';
import {caseDefinition,safePath,comparisonInput,hash} from '../contracts.mjs';
const LIMIT=64*1024*1024;
export const ORIGINAL_OUTPUT_REQUEST_LIMIT=128*1024*1024+65536;
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fields=(x,keys)=>need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),'OUTPUT_DESK_FIELDS');
function file(value){
 fields(value,['path','name','bytes','sha256','bodyBase64']);safePath(value.path);
 need(typeof value.name==='string'&&value.name.length>0&&value.name.length<=500,'OUTPUT_DESK_FILENAME');
 need(Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=LIMIT&&/^[a-f0-9]{64}$/.test(value.sha256)&&typeof value.bodyBase64==='string','OUTPUT_DESK_FILE_IDENTITY');
 need(value.bodyBase64.length<=Math.ceil(LIMIT/3)*4,'OUTPUT_DESK_FILE_SIZE');
 const body=Buffer.from(value.bodyBase64,'base64');
 need(body.toString('base64')===value.bodyBase64&&body.length===value.bytes&&digest(body)===value.sha256,'OUTPUT_DESK_FILE_CHANGED');
 return{path:value.path,name:value.name,bytes:body.length,sha256:value.sha256,body};
}
async function implementation(plan){
 const files=[];
 for(const name of ['prepare.mjs','desk-routes.mjs','review.mjs','../contracts.mjs']){
  const body=await readFile(fileURLToPath(new URL(name,import.meta.url)));files.push({path:name,bytes:body.length,sha256:digest(body)});
 }
 return{schema:'sf88-original-output-desk-source/v1',files,...(isPrivacyBenchPlan(plan)?{provider:await privacyBenchImplementation()}:{})};
}
export async function handleOriginalOutputRoute({store,dossierId,action,req,url,readBody,send,setHeader}){
 if(!['comparison/output/table','comparison/output/prepare','comparison/output/verify','comparison/output/request'].includes(action))return false;
 if(req.method!=='POST'){send(405,{error:'OUTPUT_DESK_METHOD_NOT_ALLOWED'});return true;}
 for(const [key]of url.searchParams)need(['projection','sourceProjection'].includes(key),'OUTPUT_DESK_QUERY_INVALID');
 const body=await readBody(req,ORIGINAL_OUTPUT_REQUEST_LIMIT);
 try{
 // Resolve the original dossier before accepting or exposing any selected data.
 const current=await store.getMetadata(dossierId);
 if(action==='comparison/output/request'){
  fields(body,['request']);const request=comparisonInput(body.request),requestSha256=hash(request),caseId=request.payload.caseId;
  let offset=0,operation=null;
  do{
   const page=await store.comparison(dossierId,{revision:current.revision,caseId,section:'operations',offset,limit:200});
   operation=page.items.find(x=>x.requestId===request.requestId)??null;if(operation)break;offset=page.nextOffset;
  }while(offset!==null);
  if(operation)need(operation.requestSha256===requestSha256,'COMPARISON_REQUEST_CHANGED');
  send(200,{schema:'sf88-original-output-request-receiving/v1',dossierId,revision:current.revision,
   requestId:request.requestId,requestSha256,state:operation?'COMPLETE':'NOT_FOUND',operation});return true;
 }
 if(action==='comparison/output/table'){
  fields(body,['file','delimiter']);const source=file(body.file);
  let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(source.body);}catch{need(false,'OUTPUT_UTF8_INVALID');}
  need(Buffer.from(text).equals(source.body),'OUTPUT_UTF8_INVALID');
  const table=csvRecords(text,{delimiter:body.delimiter??','});
  setHeader('X-Research-Dossier-Revision',String(current.revision));
  send(200,{schema:'sf88-original-output-table/v1',dossierId,revision:current.revision,source:{path:source.path,name:source.name,bytes:source.bytes,sha256:source.sha256},...table});return true;
 }
 fields(body,['requestId','expectedRevision','caseId','caseVersionId','plan','files']);
 need(typeof body.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(body.requestId),'OUTPUT_DESK_REQUEST_ID');
 need(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=1,'OUTPUT_DESK_REVISION');
 const verification=action==='comparison/output/verify';
 need(!verification||body.expectedRevision<=current.revision,'OUTPUT_DESK_REVISION');
 const page=await store.comparison(dossierId,{revision:verification?current.revision:body.expectedRevision,caseId:body.caseId,caseVersionId:body.caseVersionId,section:'overview',offset:0,limit:1});
 need(page.case?.id===body.caseId&&page.case.versionId===body.caseVersionId,'OUTPUT_DESK_PROTOCOL_CHANGED');
 need(same(caseDefinition(body.plan?.protocol),page.case.definition),'OUTPUT_DESK_PROTOCOL_CHANGED');
 need(Array.isArray(body.files)&&body.files.length>=1&&body.files.length<=201,'OUTPUT_DESK_FILES_REQUIRED');
 const files=body.files.map(file),byPath=new Map();let total=0;
 for(const f of files){need(!byPath.has(f.path),'OUTPUT_DESK_DUPLICATE_FILE');byPath.set(f.path,f);total+=f.bytes;}
 need(total<=LIMIT-1024*1024,'OUTPUT_ATTACHMENTS_TOO_LARGE');
 const specs=[body.plan.source,...(body.plan.originals??[])],used=new Set();
 for(const spec of specs){
  need(plain(spec)&&typeof spec.file==='string','OUTPUT_DESK_FILE_REQUIRED');safePath(spec.file);
  const selected=byPath.get(spec.file);need(selected&&selected.bytes===spec.bytes&&selected.sha256===spec.sha256,'OUTPUT_DESK_FILE_CHANGED',{file:spec.file});
  used.add(spec.file);
 }
 need(used.size===byPath.size,'OUTPUT_DESK_UNSELECTED_FILE');
 const base='/original-output-selected-inputs',resolved=new Map(files.map(f=>[resolve(base,f.path),f]));
 const prepared=await prepareOutput(body.plan,{baseDirectory:base,readOriginal:async(path,expected)=>{
  const f=resolved.get(path);need(f&&f.bytes===expected.bytes&&f.sha256===expected.sha256,'OUTPUT_DESK_FILE_CHANGED');return f.body;
 }});
 const rawText=prepared.envelope?JSON.stringify(prepared.envelope,null,2)+'\n':null;
 const result={schema:'sf88-original-output-desk-preparation/v1',requestId:body.requestId,
  basis:{dossierId,revision:body.expectedRevision,caseId:page.case.id,caseVersionId:page.case.versionId},
  planSha256:prepared.review.planSha256,sourceImplementation:await implementation(body.plan),
  review:prepared.review,rawText,rawIdentity:rawText?{bytes:Buffer.byteLength(rawText),sha256:digest(Buffer.from(rawText))}:null};
 setHeader('X-Research-Dossier-Revision',String(page.revision));send(200,result);return true;
 }catch(error){if(typeof error.code!=='string'||!/^OUTPUT_|^COMPARISON_|^REVISION_|^DOSSIER_/.test(error.code))throw error;
  send(error.code==='REVISION_CONFLICT'?409:400,{error:error.code,message:error.message.replaceAll('_',' ')+(Object.keys(error.details??{}).length?': '+JSON.stringify(error.details):''),details:error.details??{}});return true;}
}
