// SPDX-License-Identifier: MIT
// Complete agent worksheet source, original native apply and independent receiving.
import {join,resolve} from 'node:path';
import {initializationDirectory as directory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationFile as retainFile}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {reopen,nativeColumns} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/workbook-columns.mjs';
import {nativeEventConnection,readNativeAnalysisEventRecord} from './native-analysis-events-client.mjs';
import {EVENT_ID,EVENT_HASH,EVENT_NAME,EVENT_MAX_RECORD,eventObject as object,eventNeed as need,
 eventHash as sha,eventCanonical} from './native-analysis-events-contract.mjs';
import {EVENT_WORKBOOK_REVIEW_LIMIT,EVENT_WORKBOOK_CHUNK_BYTES,EVENT_WORKBOOK_SOURCE_SCHEMA}
 from './native-analysis-events-workbook-source.mjs';
export const EVENT_WORKBOOK_APPLY_SCHEMA='stellar-forge.analysis-event-workbook-apply.v1';
const FILE='original-working-review.json',REQUEST='workbook-apply-request.json';
const ALIAS=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const encoded=value=>Buffer.from(eventCanonical(value)+'\n');
function decode(raw){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
function chosen(options){
 need(typeof options.directory==='string'&&resolve(options.directory)!=='/'&&
  ALIAS.test(options.analysisWorkspace??'')&&EVENT_ID.test(options.expectedWorkspaceId??'')&&
  EVENT_NAME.test(options.programme??'')&&EVENT_ID.test(options.actionId??''),'WORKBOOK_APPLY_IDENTITY_REQUIRED');
 return resolve(options.directory);
}
function original(raw,options){
 const working=decode(raw),checked=reopen(working),context=checked.original,columns=nativeColumns(checked);
 need(context.workspace_id===options.expectedWorkspaceId&&context.programme===options.programme,
  'ORIGINAL_WORKBOOK_REVIEW_CHANGED');
 need(Buffer.byteLength(eventCanonical(working))<=EVENT_WORKBOOK_REVIEW_LIMIT&&
  Buffer.byteLength(eventCanonical(columns))<=512*1024,'WORKBOOK_NATIVE_LIMIT');
 return {working,columns,context,columns_sha256:sha(Buffer.from(eventCanonical(columns)))};
}
function validateRequest(value,options,raw){
 const state=original(raw,options),selected=value?.request;
 need(object(value)&&value.schema===EVENT_WORKBOOK_APPLY_SCHEMA&&value.analysisWorkspace===options.analysisWorkspace&&
  value.workspace_id===options.expectedWorkspaceId&&object(selected)&&selected.programme===options.programme&&
  selected.id===options.actionId&&selected.operation_id===state.context.proposal.operation_id&&
  selected.review_sha256===state.context.proposal.review_sha256&&
  typeof selected.note==='string'&&selected.note.trim()&&Buffer.byteLength(selected.note)<=8000&&
  selected.columns_sha256===state.columns_sha256&&object(selected.column_review_source)&&
  EVENT_ID.test(selected.column_review_source.id??'')&&selected.column_review_source.bytes===raw.length&&
  selected.column_review_source.sha256===sha(raw),'RETAINED_WORKBOOK_REQUEST_CHANGED');
 need(eventCanonical(value)===eventCanonical({schema:EVENT_WORKBOOK_APPLY_SCHEMA,
  analysisWorkspace:options.analysisWorkspace,workspace_id:options.expectedWorkspaceId,
  request:{programme:options.programme,id:options.actionId,operation_id:state.context.proposal.operation_id,
   review_sha256:state.context.proposal.review_sha256,note:selected.note,columns_sha256:state.columns_sha256,
   column_review_source:{id:selected.column_review_source.id,bytes:raw.length,sha256:sha(raw)}}}),
  'RETAINED_WORKBOOK_REQUEST_CHANGED');
 if(options.note!==undefined)need(options.note===selected.note,'ORIGINAL_DECISION_NOTE_REQUIRED');
 if(options.reviewSourceId!==undefined)need(options.reviewSourceId===selected.column_review_source.id,'ORIGINAL_REVIEW_SOURCE_REQUIRED');
 return state;
}
/** Save complete original bytes and the stable small native request before network use. */
export async function prepareNativeAnalysisEventWorkbookReview(options={}){
 const root=chosen(options);await directory(root,{create:true});
 const prior=await optionalBytes(join(root,REQUEST),65536);
 let raw=await optionalBytes(join(root,FILE),EVENT_WORKBOOK_REVIEW_LIMIT),request;
 if(options.workingPath!==undefined){
  need(typeof options.workingPath==='string','ORIGINAL_WORKING_FILE_REQUIRED');
  const supplied=await bytes(resolve(options.workingPath),EVENT_WORKBOOK_REVIEW_LIMIT);
  need(raw===null||raw.equals(supplied),'ORIGINAL_WORKING_FILE_CHANGED');raw=supplied;
 }
 need(raw!==null&&raw.length>0,'ORIGINAL_WORKING_FILE_REQUIRED');
 if(prior!==null)request=decode(prior);
 else{
  const state=original(raw,options),id=options.reviewSourceId??options.actionId;
  need(EVENT_ID.test(id)&&typeof options.note==='string'&&options.note.trim()&&
   Buffer.byteLength(options.note)<=8000,'ORIGINAL_DECISION_REQUIRED');
  request={schema:EVENT_WORKBOOK_APPLY_SCHEMA,analysisWorkspace:options.analysisWorkspace,
   workspace_id:options.expectedWorkspaceId,request:{programme:options.programme,id:options.actionId,
    operation_id:state.context.proposal.operation_id,review_sha256:state.context.proposal.review_sha256,
    note:options.note,columns_sha256:state.columns_sha256,
    column_review_source:{id,bytes:raw.length,sha256:sha(raw)}}};
 }
 const state=validateRequest(request,options,raw);
 await retainFile(join(root,FILE),raw,{resume:true});
 await retainFile(join(root,REQUEST),encoded(request),{resume:true});
 return {schema:EVENT_WORKBOOK_APPLY_SCHEMA,state:'PREPARED',directory:root,...request,
  working:state.working,columns:state.columns};
}
function sourceStatus(status,selected,workspace){
 need(object(status)&&status.schema===EVENT_WORKBOOK_SOURCE_SCHEMA&&status.workspace_id===workspace&&
  status.id===selected.id&&status.bytes===selected.bytes&&status.sha256===selected.sha256&&
  status.chunk_bytes===EVENT_WORKBOOK_CHUNK_BYTES&&Number.isSafeInteger(status.received)&&
  status.received>=0&&status.received<=selected.bytes&&
  (status.received===selected.bytes||status.received%EVENT_WORKBOOK_CHUNK_BYTES===0)&&
  status.complete===(status.received===selected.bytes),'WORKBOOK_RECEIVING_CHANGED');
 return status;
}
function actionValue(value,prepared){
 const request=prepared.request;
 need(object(value)&&value.workspace_id===prepared.workspace_id&&value.programme===request.programme&&
  value.id===request.id&&['READY','RUNNING','COMPLETE','ERROR','INTERRUPTED'].includes(value.status)&&
  object(value.request),'WORKBOOK_ACTION_CHANGED');
 const expected={action:'apply',operation_id:request.operation_id,review_sha256:request.review_sha256,
  note:request.note,columns:prepared.columns,column_review:prepared.working};
 need(eventCanonical(value.request)===eventCanonical(expected),'ORIGINAL_WORKBOOK_ACTION_CHANGED');
 if(value.column_review_validation){
  const evidence=value.column_review_validation;
  need(evidence.schema==='stellar-forge.event-workbook-review-validation.v1'&&
   evidence.workspace_id===prepared.workspace_id&&evidence.programme===request.programme&&
   evidence.operation_id===request.operation_id&&evidence.review_sha256===request.review_sha256&&
   evidence.working_sha256===sha(Buffer.from(eventCanonical(prepared.working)))&&
   evidence.working_bytes===Buffer.byteLength(eventCanonical(prepared.working))&&
   evidence.columns_sha256===request.columns_sha256&&object(evidence.validator_sources),
   'WORKBOOK_VALIDATION_CHANGED');
 }
 if(value.status==='COMPLETE')need(object(value.column_review_validation),'COMPLETE_WORKBOOK_VALIDATION_REQUIRED');
 return value;
}
async function receiveAction(options,prepared,client,summary){
 const selected=summary?.complete_record;
 need(selected?.kind==='action'&&selected.record_id===prepared.request.id&&
  selected.workspace_id===prepared.workspace_id,'WORKBOOK_ACTION_RECORD_REQUIRED');
 const full=await readNativeAnalysisEventRecord({...options,url:undefined,client,record:selected});
 const value=actionValue(decode(full.bytes),prepared),root=join(prepared.directory,'action-records');
 await directory(root,{create:true});
 // One exact immutable action snapshot; a later status has its own descriptor.
 await retainFile(join(root,selected.sha256+'.json'),full.bytes,{resume:true});
 await retainFile(join(root,selected.sha256+'.record.json'),encoded(selected),{resume:true});
 return {schema:EVENT_WORKBOOK_APPLY_SCHEMA,directory:prepared.directory,
  analysisWorkspace:prepared.analysisWorkspace,workspace_id:prepared.workspace_id,
  action_id:prepared.request.id,state:value.status,record:selected,action:value};
}
/** Receive the full source in small messages, then dispatch/recover the same original action. */
export async function applyNativeAnalysisEventWorkbookReview(options={}){
 need(options.resume===undefined||typeof options.resume==='boolean','EXPLICIT_RESUME_REQUIRED');
 const prepared=await prepareNativeAnalysisEventWorkbookReview(options);
 options.signal?.throwIfAborted();
 const client=await nativeEventConnection(options),overview=await client.call('event-overview',
  {limit:1,programme_limit:1},{signal:options.signal});
 need(overview.workspace_id===prepared.workspace_id,'ORIGINAL_WORKSPACE_CHANGED');
 const selected=prepared.request.column_review_source;
 let status=sourceStatus(await client.call('event-workbook-review-create',selected,{signal:options.signal}),
  selected,prepared.workspace_id);
 const raw=await bytes(join(prepared.directory,FILE),EVENT_WORKBOOK_REVIEW_LIMIT);
 need(raw.length===selected.bytes&&sha(raw)===selected.sha256,'ORIGINAL_WORKING_FILE_CHANGED');
 while(!status.complete){
  options.signal?.throwIfAborted();
  const offset=status.received,part=raw.subarray(offset,offset+EVENT_WORKBOOK_CHUNK_BYTES);
  status=sourceStatus(await client.call('event-workbook-review-chunk',
   {id:selected.id,offset,base64:part.toString('base64'),sha256:sha(part)},{signal:options.signal}),
   selected,prepared.workspace_id);
  need(status.received>=offset+part.length,'WORKBOOK_CHUNK_ACKNOWLEDGEMENT_CHANGED');
  await options.onProgress?.({id:selected.id,received:status.received,bytes:selected.bytes});
 }
 const summary=await client.call('event-apply',{...prepared.request,...(options.resume===undefined?{}:{resume:options.resume})},
  {signal:options.signal});
 return receiveAction(options,prepared,client,summary);
}
/** Read a dispatched action after an uncertain reply without sending another mutation. */
export async function receiveNativeAnalysisEventWorkbookReview(options={}){
 const prepared=await reopenNativeAnalysisEventWorkbookReview(options);
 const client=await nativeEventConnection(options);
 const summary=await client.call('event-action',{id:prepared.request.id},{signal:options.signal});
 return receiveAction(options,prepared,client,summary);
}
/** Independently reopen complete prepared work and an explicitly selected immutable action snapshot. */
export async function reopenNativeAnalysisEventWorkbookReview(options={}){
 const root=chosen(options);await directory(root);
 const raw=await bytes(join(root,FILE),EVENT_WORKBOOK_REVIEW_LIMIT),request=decode(await bytes(join(root,REQUEST),65536));
 const state=validateRequest(request,options,raw);
 const prepared={schema:EVENT_WORKBOOK_APPLY_SCHEMA,state:'PREPARED',directory:root,...request,
  working:state.working,columns:state.columns};
 if(options.recordSha256!==undefined){
  need(EVENT_HASH.test(options.recordSha256),'ACTION_RECORD_DIGEST_REQUIRED');
  const folder=join(root,'action-records');await directory(folder);
  const descriptor=decode(await bytes(join(folder,options.recordSha256+'.record.json'),4096));
  need(descriptor.schema==='stellar-forge.analysis-event-record.v1'&&descriptor.kind==='action'&&
   descriptor.record_id===options.actionId&&descriptor.workspace_id===options.expectedWorkspaceId&&
   descriptor.sha256===options.recordSha256&&Number.isSafeInteger(descriptor.bytes)&&
   descriptor.bytes>0&&descriptor.bytes<=EVENT_MAX_RECORD,'WORKBOOK_ACTION_RECORD_CHANGED');
  const received=await bytes(join(folder,descriptor.sha256+'.json'),EVENT_MAX_RECORD);
  need(received.length===descriptor.bytes&&sha(received)===descriptor.sha256,'WORKBOOK_ACTION_RECORD_CHANGED');
  const value=actionValue(decode(received),prepared);
  return {...prepared,state:value.status,record:descriptor,action:value};
 }
 return prepared;
}
