// MIT. Original reporting engine operations and complete returned-project custody.
import {openProgramme,applyProgramme,programmeIdentity,exportProgramme} from './programme.mjs';
import {receiveDeskHandover} from './desk-receive.mjs';

export const copy=value=>JSON.parse(JSON.stringify(value));
export function failure(code,message){return Object.assign(new Error(message),{code:'REPORTING_'+code});}
export function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 throw failure('JSON','Use complete finite JSON values.');
}
export const pretty=value=>JSON.stringify(value,null,2)+'\n';
export function parseOriginal(text){
 if(typeof text!=='string')throw failure('INPUT','Retain the complete original UTF-8 JSON text.');
 try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw failure('INPUT_JSON','The selected original is not complete JSON.');}
}
function preserved(before,after,label,key){
 const selected=new Map(after.map(value=>[key(value),value]));
 if(after.length<before.length||before.some((value,index)=>key(after[index])!==key(value)))throw failure('PROJECT_HISTORY','Retain the original order of '+label+' before appending later observations.');
 if(selected.size!==after.length)throw failure('PROJECT_HISTORY','Duplicate '+label+' in the returned project.');
 for(const original of before)if(canonical(selected.get(key(original))??null)!==canonical(original))
  throw failure('PROJECT_HISTORY','Retain every original '+label+' unchanged in the returned project.');
}
export async function receiveReturnedProject(current,text){
 const next=await openProgramme(text);
 if(!current)return next;
 if(current.id!==next.id||current.schema!==next.schema||current.createdAt!==next.createdAt||
  current.reportingProgramme.id!==next.reportingProgramme.id||current.reportingProgramme.createdAt!==next.reportingProgramme.createdAt)
  throw failure('PROJECT_IDENTITY','Return the same original project and reporting programme.');
 const before=current.reportingProgramme,after=next.reportingProgramme;
 for(const name of ['definitions','runs','deliveries','operations'])
  preserved(before[name],after[name],name,value=>name==='definitions'?value.sha256:value.id);
 preserved(before.files,after.files,'reporting files',value=>value.sha256+'\n'+value.filename);
 for(const original of current.documents){
  const returned=next.documents.find(doc=>doc.id===original.id);
  if(!returned||returned.resourceId!==original.resourceId)throw failure('PROJECT_HISTORY','Retain every original source table and resource identity.');
  preserved(original.editions,returned.editions,'source editions',value=>value.id);
  preserved(original.reviews,returned.reviews,'source reviews',value=>value.id);
 }
 preserved(current.documentTableSources??[],next.documentTableSources??[],'document sources',value=>value.id);
 return next;
}
export async function executeReportingOperation(current,envelope,originals){
 const {kind,args}=envelope,source=originals.input;
 if(kind==='apply'){
  const request=parseOriginal(source);
  if(request.operationId!==args.operationId)throw failure('OPERATION_ID','Use the exact original request operationId.');
  const result=await applyProgramme(current,request),{request:retainedRequest,...operation}=result.operation;
  return {project:result.project,domain:{replayed:result.replayed,operation}};
 }
 if(kind==='receive_desk'){
  const context=parseOriginal(originals.context);
  if(context.operationId!==args.operationId)throw failure('OPERATION_ID','Use the exact original desk recording-context operationId.');
  const result=await receiveDeskHandover(current,source,context),{request:retainedRequest,...operation}=result.operation;
  return {project:result.project,domain:{replayed:result.replayed,operation,sourceSha256:result.sourceSha256??null,receivedRuns:result.receivedRuns??null}};
 }
 if(kind==='receive_project')return {project:await receiveReturnedProject(current,source),domain:{received:true}};
 if(kind==='export'){
  if(!current)throw failure('PROJECT_REQUIRED','Create or receive the original reporting project first.');
  if(args.format==='native'){
   const exported=await exportProgramme(current);
   return {project:current,output:{bytes:exported.bytes,name:'reporting-programme.zip',type:'application/zip'},domain:{files:exported.files.length}};
  }
  return {project:current,output:{bytes:new TextEncoder().encode(pretty(current)),name:'reporting-project.json',type:'application/json'},domain:{exported:true}};
 }
 throw failure('OPERATION','Choose a declared reporting operation.');
}
export async function projectView(project){
 return project?programmeIdentity(project):{projectSha256:null,summary:null};
}
