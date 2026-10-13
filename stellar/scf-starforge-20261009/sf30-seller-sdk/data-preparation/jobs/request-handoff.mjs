// MIT. Seed the original private Request host with one complete prepared pipeline order.
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readJobWorkspaceLaunch} from '../../../sf88-operator-buyer-cli/job-workspace/launch.mjs';
import {canonical,sha256,originOf,validateCatalog,JOB_ID} from '../../jobs/intake/protocol.mjs';
import {planFromHandle} from '../../jobs/inputs/source.mjs';
import {CHUNK_BYTES,uploadIdentity,validateUploadStatus,chunkLength} from '../../jobs/inputs/protocol.mjs';
import {readChunk,sameFile} from '../../jobs/inputs/files.mjs';
import {PREPARATION_HASH,preparationNeed,preparationPlain,preparationExact,preparationOpenFile} from '../connection.mjs';
import {inspectPreparedPipelineOrder} from './order.mjs';

const SCHEMA='stellar-forge.preparation-pipeline-request-handoff.v1';
const PREFIX='/api/job-intake',MAX_RESPONSE=4*1024*1024;
const INPUTS=[{slot:'project',filename:'project.zip',contentType:'application/zip'},
 {slot:'selection',filename:'selection.json',contentType:'application/json'}];
const check=signal=>signal?.throwIfAborted();
function need(value,code,message,status=409){preparationNeed(value,code,message,status);}
function target(value){
 preparationExact(value,['directory','runtimeDirectory','operatorWorkspace','operatorProfile','expectedInstanceId'],
  ['directory','runtimeDirectory']);
 need(!(value.operatorWorkspace!==undefined&&value.operatorProfile!==undefined),
  'PREPARATION_REQUEST_OPERATOR_CONFLICT','Select the original customer operator workspace or profile.');
 if(value.expectedInstanceId!==undefined)need(/^[a-f0-9-]{36}$/.test(value.expectedInstanceId),
  'PREPARATION_REQUEST_INSTANCE_INVALID','Use the current original Request instance identity.');
 return value;
}
async function connection(customer,signal){
 check(signal);customer=target(customer);
 const {expectedInstanceId,...selected}=customer;
 const launch=await readJobWorkspaceLaunch(selected);
 need(expectedInstanceId===undefined||launch.instanceId===expectedInstanceId,'PREPARATION_REQUEST_INSTANCE_CHANGED',
  'Reopen the currently selected original Request instance.');
 need(typeof launch.intakeUrl==='string','PREPARATION_REQUEST_INTERFACE_REQUIRED','Use the original Request-enabled customer.');
 const entry=new URL(launch.intakeUrl),token=entry.hash.slice(1),origin=entry.origin;
 const verify=async()=>{
  check(signal);
  const current=await readJobWorkspaceLaunch({...selected,pid:launch.pid});
  need(current.instanceId===launch.instanceId&&current.intakeUrl===launch.intakeUrl,
   'PREPARATION_REQUEST_INSTANCE_CHANGED','The original Request host changed during this handoff.');
 };
 async function request(path,{method='GET',body}={}){
  await verify();
  need(typeof path==='string'&&path.startsWith(PREFIX+'/'),'PREPARATION_REQUEST_ROUTE_INVALID','Use the existing Request API.');
  const url=origin+path,headers={authorization:'Bearer '+token,accept:'application/json'};
  if(body!==undefined)headers['content-type']=body instanceof Uint8Array?'application/octet-stream':'application/json';
  const response=await fetch(url,{method,headers,redirect:'error',credentials:'omit',
   ...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)}),
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
  try{
   need(response.url===url&&response.status>=200&&response.status<600,'PREPARATION_REQUEST_RESPONSE_CHANGED',
    'The original private Request response changed.',502);
   need(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),
    'PREPARATION_REQUEST_RESPONSE_INVALID','The original Request returned a non-JSON response.',502);
   const declared=response.headers.get('content-length');
   need(declared===null||/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=MAX_RESPONSE,
    'PREPARATION_REQUEST_RESPONSE_TOO_LARGE','The Request response exceeds its retained allowance.',502);
   need(response.body,'PREPARATION_REQUEST_RESPONSE_INVALID','The original Request response is empty.',502);
   const reader=response.body.getReader(),parts=[];let length=0;
   try{for(;;){check(signal);const next=await reader.read();if(next.done)break;length+=next.value.length;
    need(length<=MAX_RESPONSE,'PREPARATION_REQUEST_RESPONSE_TOO_LARGE','The Request response exceeds its retained allowance.',502);
    parts.push(Buffer.from(next.value));}}
   catch(error){await reader.cancel().catch(()=>{});throw error;}
   finally{reader.releaseLock();}
   need(declared===null||Number(declared)===length,'PREPARATION_REQUEST_RESPONSE_CHANGED','The complete response length changed.',502);
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,length)));
   need(preparationPlain(value),'PREPARATION_REQUEST_RESPONSE_INVALID','The original Request response must be an object.',502);
   if(!response.ok){
    const code=/^[A-Z][A-Z0-9_]{0,119}$/.test(value.error??'')?value.error:'PREPARATION_REQUEST_HTTP_ERROR';
    throw Object.assign(new Error(code),{code,status:response.status});
   }
   return value;
  }finally{if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});}
 }
 return {launch,request,verify,requestUrl:id=>origin+'/jobs/request/?request='+id+'#'+token};
}
function checkDefinition(definition){
 need(definition?.id==='executePipeline'&&preparationPlain(definition.inputFiles)&&
  preparationPlain(definition.inputFiles.slots)&&
  isDeepStrictEqual(Object.keys(definition.inputFiles.slots).sort(),['project','selection']),
  'PREPARATION_REQUEST_FUNCTION_CHANGED','Choose the original executePipeline function with project and selection inputs.');
 for(const slot of INPUTS)need(definition.inputFiles.slots[slot.slot]?.required===true,
  'PREPARATION_REQUEST_FUNCTION_CHANGED','The complete original project and selection must remain required.');
}
export async function discoverPipelineRequest({customer,merchantOrigin,signal}={}){
 const connected=await connection(customer,signal),origin=originOf(merchantOrigin);
 const catalog=validateCatalog(await connected.request(PREFIX+'/catalog',{method:'POST',body:{origin}}),origin);
 checkDefinition(catalog.functions.find(value=>value.id==='executePipeline'));
 await connected.verify();return catalog;
}
function boundRequest(row,{id,origin,reference,label,catalogSha256,prepared}){
 need(preparationPlain(row)&&row.id===id&&row.reference===reference&&row.label===label&&
  row.merchant?.origin===origin&&row.merchant.functionId==='executePipeline'&&
  row.merchant.catalogSha256===catalogSha256&&Number.isSafeInteger(row.revision)&&row.revision>=0&&
  Number.isSafeInteger(row.requestAttempts)&&row.requestAttempts>=0&&
  preparationPlain(row.input)&&preparationPlain(row.input.$files)&&preparationPlain(row.function)&&
  row.function.id==='executePipeline'&&row.function.functionSha256===row.merchant.functionSha256,
  'PREPARATION_REQUEST_BINDING_CHANGED','This reference identifies another original order or merchant selection.');
 const {$files,...ordinary}=row.input;
 need(isDeepStrictEqual(ordinary,prepared.input)&&Object.keys($files).every(slot=>INPUTS.some(x=>x.slot===slot)),
  'PREPARATION_REQUEST_INPUT_CHANGED','Keep this reference bound to its complete original prepared input.');
 checkDefinition(row.function);
 need(row.phase!=='WITHDRAWN','PREPARATION_REQUEST_WITHDRAWN','This original request was withdrawn. Select a new reviewed reference.');
 return row;
}
function completeResult(connected,row,orderSha256,reused,plans){
 const slots=INPUTS.map(({slot})=>{
  const descriptor=row.input.$files[slot],plan=plans.get(slot);
  need(isDeepStrictEqual(descriptor,plan.file),'PREPARATION_REQUEST_FILE_CHANGED','The selected complete Request file changed.');
  const selected=row.inputFiles?.slots?.find(value=>value.slot===slot);
  need(selected&&isDeepStrictEqual(selected.file,descriptor),'PREPARATION_REQUEST_FILE_CHANGED','The retained Request slot changed.');
  if(row.requestAttempts===0){
   need(selected.upload?.state==='SEALED','PREPARATION_REQUEST_FILES_INCOMPLETE','Finish both original Request file uploads.');
   validateUploadStatus({...selected.upload,missing:[]},plan);
  }else need(row.inputFiles?.merchantReceived===true,'PREPARATION_REQUEST_RECEIVING_CHANGED',
   'The original Request must retain its merchant receiving state.');
  return {slot,uploadId:uploadIdentity(plan),file:descriptor,state:selected.upload?.state??'MERCHANT_RECEIVED'};
 });
 need(row.inputFiles?.ready===true,'PREPARATION_REQUEST_FILES_INCOMPLETE','The original Request is not ready for review.');
 return {schema:SCHEMA,orderSha256,requestId:row.id,reference:row.reference,requestRevision:row.revision,
  catalogSha256:row.merchant.catalogSha256,functionSha256:row.merchant.functionSha256,
  customer:{directory:connected.launch.directory,runtimeDirectory:connected.launch.runtimeDirectory,
   instanceId:connected.launch.instanceId},requestUrl:connected.requestUrl(row.id),
  request:row,files:slots,reused};
}
/** Retain the original draft and both sealed inputs. Checkout and payment remain explicit original actions. */
export async function seedPreparedPipelineRequest({orderDirectory,expectedOrderSha256,customer,merchantOrigin,
 expectedCatalogSha256,reference,label,signal}={}){
 need(PREPARATION_HASH.test(expectedOrderSha256??'')&&PREPARATION_HASH.test(expectedCatalogSha256??''),
  'PREPARATION_REQUEST_SOURCE_REQUIRED','Select the complete reviewed order and catalog SHA-256.');
 need(JOB_ID.test(reference??'')&&typeof label==='string'&&label.length>0&&label.length<=300&&
  !/[\x00-\x1f\x7f]/.test(label),'PREPARATION_REQUEST_REFERENCE_REQUIRED','Retain one original reference and readable label.');
 const selected=await inspectPreparedPipelineOrder(orderDirectory,{verifyFiles:true});
 need(selected.sha256===expectedOrderSha256,'PREPARATION_REQUEST_ORDER_CHANGED','The reviewed complete order changed.');
 const prepared=selected.prepared,connected=await connection(customer,signal),origin=originOf(merchantOrigin);
 const id=sha256(canonical(['job-intake',origin,reference])),endpoint=PREFIX+'/requests/'+id;
 const binding={id,origin,reference,label,catalogSha256:expectedCatalogSha256,prepared};
 const opened=[],plans=new Map();let row,reused=true,failure,result;
 try{
  try{row=await connected.request(endpoint);}
  catch(error){if(error.code!=='JOB_INTAKE_REQUEST_NOT_FOUND'||error.status!==404)throw error;}
  if(!row){
   const catalog=validateCatalog(await connected.request(PREFIX+'/catalog',{method:'POST',body:{origin}}),origin);
   need(catalog.catalogSha256===expectedCatalogSha256,'PREPARATION_REQUEST_CATALOG_CHANGED',
    'Review the current merchant catalog before preparing a different request.');
   checkDefinition(catalog.functions.find(value=>value.id==='executePipeline'));
   const drafted=await connected.request(PREFIX+'/draft',{method:'POST',body:{catalog,functionId:'executePipeline',
    input:prepared.input,reference,label,accessToken:null}});
   need(drafted.request?.id===id,'PREPARATION_REQUEST_BINDING_CHANGED','The original Request identity changed.');
   reused=drafted.reused===true;row=await connected.request(endpoint);
  }
  row=boundRequest(row,binding);
  for(const item of INPUTS){
   const expected=prepared.files[item.filename],held=await preparationOpenFile(join(orderDirectory,item.filename),
    {privateOnly:true,maximum:item.slot==='project'?28*1024*1024:1024*1024});
   opened.push(held);
   const selection=await planFromHandle({file:held.handle,origin,reference,functionId:'executePipeline',slot:item.slot,
    policy:row.function.inputFiles,filename:item.filename,contentType:item.contentType,signal});
   need(selection.plan.file.bytes===expected.bytes&&selection.plan.file.sha256===expected.sha256,
    'PREPARATION_REQUEST_FILE_CHANGED','The complete prepared input changed before transfer.');
   plans.set(item.slot,selection.plan);held.plan=selection.plan;held.originalInfo=selection.info;
   const existing=row.input.$files[item.slot];
   need(existing===undefined||isDeepStrictEqual(existing,selection.plan.file),'PREPARATION_REQUEST_FILE_CHANGED',
    'The original request already selects a different complete file.');
  }
  if(row.requestAttempts>0||row.hasTicket||row.phase==='IMPORTED'){
   result=completeResult(connected,row,selected.sha256,true,plans);
  }else{
   for(const held of opened){
    check(signal);row=boundRequest(await connected.request(endpoint),binding);
    const plan=held.plan,existing=row.input.$files[plan.slot];
    need(existing===undefined||isDeepStrictEqual(existing,plan.file),'PREPARATION_REQUEST_FILE_CHANGED',
     'A concurrent Request edit selected a different complete file.');
    const slot=row.inputFiles?.slots?.find(value=>value.slot===plan.slot);
    if(slot?.upload?.state==='SEALED'){
     validateUploadStatus({...slot.upload,missing:[]},plan);continue;
    }
    need(row.requestAttempts===0&&!row.hasTicket&&!row.inputFiles?.task,
     'PREPARATION_REQUEST_BUSY','Let the original Request finish its current action before continuing.',409);
    const begin=await connected.request(endpoint+'/files/begin',{method:'POST',body:{plan,expectedRevision:row.revision}});
    need(begin.request===id,'PREPARATION_REQUEST_BINDING_CHANGED','The file upload changed its original Request.');
    let upload=validateUploadStatus(begin.upload,plan);
    for(const index of upload.missing){
     check(signal);
     const bytes=await readChunk(held.handle,chunkLength(plan,index),index*CHUNK_BYTES,signal);
     need(sha256(bytes)===plan.chunks[index],'PREPARATION_REQUEST_FILE_CHANGED','The prepared file changed during transfer.');
     const received=await connected.request(endpoint+'/files/'+upload.id+'/chunks/'+index,{method:'PUT',body:bytes});
     need(received.request===id,'PREPARATION_REQUEST_BINDING_CHANGED','The original upload Request changed.');
     upload=validateUploadStatus(received.upload,plan);
    }
    need(sameFile(held.originalInfo,await held.handle.stat()),'PREPARATION_REQUEST_FILE_CHANGED',
     'The complete original file changed during transfer.');
    const sealed=await connected.request(endpoint+'/files/'+upload.id+'/seal',{method:'POST',body:{}});
    need(sealed.request===id,'PREPARATION_REQUEST_BINDING_CHANGED','The original sealed Request changed.');
    upload=validateUploadStatus(sealed.upload,plan);
    need(upload.state==='SEALED','PREPARATION_REQUEST_FILES_INCOMPLETE','The original file sealing has not completed.');
   }
   row=boundRequest(await connected.request(endpoint),binding);
   result=completeResult(connected,row,selected.sha256,reused,plans);
  }
  await connected.verify();check(signal);
  for(const held of opened)need(sameFile(held.originalInfo,await held.handle.stat()),
   'PREPARATION_REQUEST_FILE_CHANGED','The complete prepared input changed before handoff completion.');
 }catch(error){failure=error;failure.requestId??=id;}
 const closed=await Promise.allSettled(opened.map(held=>held.handle.close()));
 const failures=closed.filter(value=>value.status==='rejected').map(value=>value.reason);
 if(failures.length)throw Object.assign(new AggregateError([...(failure?[failure]:[]),...failures],
  'PREPARATION_REQUEST_FILES_CLOSE_FAILED'),{code:'PREPARATION_REQUEST_FILES_CLOSE_FAILED',requestId:id});
 if(failure)throw failure;
 return result;
}
