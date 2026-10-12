// SPDX-License-Identifier: MIT
import { MAX_RETAINED_CHUNK_BYTES } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const string=(maxLength=4000)=>({type:'string',minLength:1,maxLength});
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},obj={type:'object'};
const ids={type:'array',items:uuid,minItems:1,maxItems:40,uniqueItems:true};
const bound={workspace:alias,instanceId:uuid},required=['workspace','instanceId'],saved={idempotent:true},read={idempotent:true,readOnly:true};
export const TOOL_ACTIONS=Object.freeze({
 merchant_openaq_save_study:'study.save',merchant_openaq_capture:'capture',merchant_openaq_review:'review',merchant_openaq_report:'report',
 merchant_openaq_prepare_dataset:'publication.prepare',merchant_openaq_review_dataset:'publication.review',merchant_openaq_publish_dataset:'publication.publish',merchant_openaq_recover_dataset:'publication.recover',
 merchant_openaq_prepare_release:'release.prepare',merchant_openaq_stage_release:'release.stage',merchant_openaq_customer_action:'customer.start',merchant_openaq_resume_customer:'customer.resume',merchant_openaq_export:'export'
});
export const TOOL_READS=Object.freeze({
 merchant_openaq_status:'status',merchant_openaq_operation:'operation',merchant_openaq_request:'request',merchant_openaq_capture_read:'capture',
 merchant_openaq_preview:'preview',merchant_openaq_review_read:'review',merchant_openaq_report_read:'report',merchant_openaq_study_read:'study',
 merchant_openaq_publication:'publication',merchant_openaq_dataset_preview:'publication.inspect',merchant_openaq_customer_status:'customer.status',
 merchant_openaq_customer_read:'customer.read',merchant_openaq_customer_operation:'customer.operation',merchant_openaq_customer_browser:'customer.browser',merchant_openaq_account:'account'
});
const join={captureId:uuid,sourceReviewId:uuid},joinRequired=['captureId','sourceReviewId'];
export function openaqMerchantTools(tool){
 const result=[
 tool('merchant_openaq_workspaces','List the host-selected OpenAQ projects without exposing private credentials.',{},[],read),
 tool('merchant_openaq_connect','Connect to the existing source-bound project listener and retain its actual instance ID.',{workspace:alias},['workspace'],saved),
 tool('merchant_openaq_disconnect','Close only this agent connection and its original retained file handles; Applications owns the project process.',bound,required,saved)
 ];
 const reads={
  merchant_openaq_status:[{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},[],'Read project studies, editions, reviews, reports and retained operations.'],
  merchant_openaq_operation:[{id:uuid},['id'],'Read one original operation after a lost response; no provider dispatch.'],
  merchant_openaq_request:[{id:uuid},['id'],'Read the unchanged retained input and outcome for one original operation.'],
  merchant_openaq_capture_read:[{id:uuid},['id'],'Read a complete original capture and its source attribution.'],
  merchant_openaq_preview:[{id:uuid,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:250}},['id'],'Read original projected observation text with stable capture identity.'],
  merchant_openaq_review_read:[{id:uuid},['id'],'Reopen the named source and applicable-rights review.'],
  merchant_openaq_report_read:[{id:uuid},['id'],'Read the original complete report and exact series summaries.'],
  merchant_openaq_study_read:[{id:uuid},['id'],'Read the current saved future-capture plan and original revision.'],
  merchant_openaq_publication:[join,joinRequired,'Read the original Frictionless publisher and dataset versions.'],
  merchant_openaq_dataset_preview:[{...join,runId:uuid,query:string(8192)},[...joinRequired,'runId'],'Inspect the original dataset candidate with its unchanged native query.'],
  merchant_openaq_customer_status:[{...join,options:obj},joinRequired,'Read the original local SF100/DuckDB customer delivery.'],
  merchant_openaq_customer_read:[{...join,deliveryId:uuid,operation:string(80),arguments:obj},[...joinRequired,'deliveryId','operation'],'Read original customer editions, mapping reviews, queries, exports or operations.'],
  merchant_openaq_customer_operation:[{...join,id:uuid},[...joinRequired,'id'],'Read the original native customer request by UUID.'],
  merchant_openaq_customer_browser:[join,joinRequired,'Open the existing original publisher/customer operator using the same owned publisher.'],
  merchant_openaq_account:[{},[],'Inspect the original local account controller. This reads no provider data and is not a provider credit-balance assertion.']
 };
 for(const[name,[properties,needed,description]]of Object.entries(reads))result.push(tool(name,description,{...bound,...properties},[...required,...needed],read));
 const actions={
  merchant_openaq_save_study:[{id:uuid,name:string(160),purpose:string(),plan:obj,expectedRevision:{anyOf:[hash,{type:'null'}]}},['id','name','purpose','plan','expectedRevision'],'Save one named monitoring plan against its exact prior revision. Existing captures retain their original plans.'],
  merchant_openaq_capture:[{plan:obj,context:obj,study:obj},['plan'],'Acquire the selected official original API pages or public AWS location/day editions under one retained UUID. Completed requests reopen; only explicit resume retries an unfinished GET.'],
  merchant_openaq_review:[{captureId:uuid,captureSha256:hash,reviewer:string(240),decision:{enum:['accepted','revise','context_only']},note:string(6000),attribution:string(),rightsBasis:string(6000),rightsSources:{type:'array',items:string(2048)},allowDerivedDelivery:{type:'boolean'}},['captureId','captureSha256','reviewer','decision','note','attribution','rightsBasis','rightsSources','allowDerivedDelivery'],'Review the exact capture, source attribution and applicable delivery rights.'],
  merchant_openaq_report:[{title:string(160),purpose:string(),captureIds:ids,reviewIds:ids,reviewer:string(240),note:string(8000),includeMean:{type:'boolean'},excludeFlagged:{type:'boolean'}},['title','purpose','captureIds','reviewIds','reviewer','note','includeMean','excludeFlagged'],'Create a complete named station-period report without changing original values, units, intervals or source flags.'],
  merchant_openaq_prepare_dataset:[join,joinRequired,'Capture the complete original Frictionless source package and extract through its original dataset publisher.'],
  merchant_openaq_review_dataset:[{...join,runId:uuid,reviewer:string(128),note:string(2000),initialize:{type:'boolean'},expectedSnapshot:hash,expectedRevision:{type:'integer'}},[...joinRequired,'runId','reviewer','note','initialize'],'Record the native candidate review against its original target.'],
  merchant_openaq_publish_dataset:[{...join,runId:uuid,publicationReviewId:uuid},[...joinRequired,'runId','publicationReviewId'],'Publish the reviewed candidate through the existing dataset version engine.'],
  merchant_openaq_recover_dataset:[{...join,runId:uuid},[...joinRequired,'runId'],'Reconcile the existing original publication without creating another extraction.'],
  merchant_openaq_prepare_release:[{...join,runId:uuid,payment:obj,origin:string(2048),path:string(2048)},[...joinRequired,'runId','payment','origin'],'Prepare the original SF82 merchant package with its complete native payment terms; no payment or listener is started.'],
  merchant_openaq_stage_release:[{preparationId:uuid,id:string(100),label:string(200),runtime:obj},['preparationId','id','label'],'Stage that exact prepared package in this project’s original SF82 release store.'],
  merchant_openaq_customer_action:[{...join,kind:{enum:['prepare','continue','customer','package']},arguments:obj},[...joinRequired,'kind','arguments'],'Use the original local SF100/DuckDB customer workflow; its native operation and every page remain authoritative.'],
  merchant_openaq_resume_customer:[{...join,operationId:uuid},[...joinRequired,'operationId'],'Continue the same original customer request and retained native input.'],
  merchant_openaq_export:[{captureIds:ids,reviewIds:ids,reportIds:{type:'array',items:uuid,maxItems:20,uniqueItems:true}},['captureIds','reviewIds','reportIds'],'Export the complete selected observations, raw source responses, attribution, reviews and reports through the original Frictionless source bundle.']
 };
 for(const[name,[properties,needed,description]]of Object.entries(actions))result.push(tool(name,description,{...bound,requestId:uuid,...properties},[...required,'requestId',...needed],{idempotent:true,...(name==='merchant_openaq_capture'?{openWorld:true}:{})}));
 result.push(tool('merchant_openaq_resume','Explicitly resume one unchanged interrupted operation. Completed operations reopen.',{...bound,requestId:uuid},[...required,'requestId'],saved));
 result.push(tool('merchant_openaq_pause','Pause the active capture or export; retain its original request and completed responses.',{...bound,requestId:uuid},[...required,'requestId'],{idempotent:true,destructive:true}));
 result.push(tool('merchant_openaq_file_read','Read an original verified immutable file with the maintained native file reader. Keep expected hash, read ID and byte offset.',{...bound,kind:{enum:['capture','report','export']},id:uuid,name:string(1024),readId:uuid,expectedSha256:hash,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},[...required,'kind','id','name'],read));
 result.push(tool('merchant_openaq_file_release','Release this connection’s original retained file handle.',{...bound,readId:uuid},[...required,'readId'],saved));
 return result;
}
