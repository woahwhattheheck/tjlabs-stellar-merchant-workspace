// SPDX-License-Identifier: MIT
// Complete agent use of the original private Event programmes service.
import {reopen as reopenWorkbookReview,nativeColumns as workbookNativeColumns}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/workbook-columns.mjs';
import {join,resolve} from 'node:path';
import {initializationDirectory as directory,initializationBytes as bytes,optionalInitializationBytes as optionalBytes,
 retainInitializationFile as retainFile,retainInitializationRecord as retainRecord}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {createEventWorkbookReviewSource,eventWorkbookReviewSourceStatus,receiveEventWorkbookReviewChunk,
 readEventWorkbookReviewSource,EVENT_WORKBOOK_REVIEW_LIMIT,EVENT_WORKBOOK_REQUEST_LIMIT}
 from './native-analysis-events-workbook-source.mjs';
import {createEventMappingRequestSource,eventMappingRequestSourceStatus,receiveEventMappingRequestChunk,
 readEventMappingRequestSource} from './native-analysis-events-mapping-request-source.mjs';
import {mappingSourceSelection,mappingSourceSelectionHash,mappingSourceSummary}
 from './native-analysis-events-mapping-contract.mjs';
import {nativeEventOperations} from './native-analysis-events-schema.mjs';
import {EVENT_DOWNLOAD_SCHEMA,EVENT_MAX_RECORD,EVENT_MAPPING_SOURCE_LIMIT,eventRecordLimit,EVENT_MAX_FILE,EVENT_ID,EVENT_HASH,EVENT_NAME,
 EVENT_FILES,eventObject as object,eventNeed as need,eventHash as sha,eventCanonical,eventMime,
 validateEventDownloadIndex} from './native-analysis-events-contract.mjs';
const ROOT='/api/event-programmes',RECORD='stellar-forge.analysis-event-record.v1';
const INPUT_LIMITS={ndjson:32*1024*1024,manifest:4*1024*1024};
const check=(value,pattern,code)=>{need(typeof value==='string'&&pattern.test(value),code);return value;};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{need(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTEGER_INVALID');return value;};
const copy=value=>structuredClone(value);
const preview=value=>{let part=value.slice(0,160);return /[\uD800-\uDBFF]$/.test(part)?part.slice(0,-1):part;};
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value??{},key)).map(key=>[key,copy(value[key])]));
const query=value=>{const list=Object.entries(value).filter(([,v])=>v!==undefined);return list.length?'?'+new URLSearchParams(list.map(([k,v])=>[k,String(v)])):'';};
function fields(value,required,optional=[]){
 need(object(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),'FIELDS_INVALID');
}
function label(value,maximum){
 need(typeof value==='string'&&Array.from(value).length>=1&&Array.from(value).length<=maximum&&
 !/[\x00-\x1f\x7f]/.test(value),'LABEL_INVALID');return value;
}
function programme(value,record,name){
 need(object(value)&&value.schema==='stellar-forge.event-feed-analysis-programme.v1'&&value.workspace_id===record.workspaceId&&
 EVENT_NAME.test(value.name??'')&&(name===undefined||value.name===name),'PROGRAMME_CHANGED');
 integer(value.revision);need(Array.isArray(value.history),'PROGRAMME_CHANGED');
 return {...pick(value,['schema','name','workspace_id','revision','pending','report_name','workbook_name']),
 accepted:value.accepted?pick(value.accepted,['operation_id','edition_id','version_id','review_sha256']):null,history_count:value.history.length};
}
function action(value,record,id){
 need(object(value)&&value.workspace_id===record.workspaceId&&EVENT_ID.test(value.id??'')&&
 EVENT_NAME.test(value.programme??'')&&(id===undefined||value.id===id)&&object(value.request)&&
 ['review','apply','refresh-review','deliver'].includes(value.request.action),'ACTION_CHANGED');
 check(value.request.operation_id,EVENT_ID,'OPERATION_ID_REQUIRED');
 const result=pick(value,['id','programme','workspace_id','created_at','updated_at','status','attempts','error']);
 result.request=pick(value.request,['action','operation_id','input_id','review_sha256','mapping_working_source']);
 if(value.mapping_working_source)result.mapping_working_source=pick(value.mapping_working_source,['schema','source','html']);
 if(value.mapping_review){const s=value.mapping_review.selection;
 result.mapping_review={schema:value.mapping_review.schema,reviewed_at:value.mapping_review.reviewed_at,
  comparison_sha256:s.comparison_sha256,programme_revision:s.programme_revision,baseline_operation_id:s.baseline_operation_id,
  reviewer_preview:preview(s.reviewer),note_preview:preview(s.note),decision_count:s.decisions.length};}
 if(value.column_review_validation)result.column_review_validation=pick(value.column_review_validation,
 ['schema','workspace_id','programme','operation_id','review_sha256','working_sha256','working_bytes','columns_sha256','validator_sources']);
 if(value.progress)result.progress=pick(value.progress,['phase','id','kind','status','message']);
 if(object(value.result))result.result=pick(value.result,['schema','operation_id','accepted_operation_id','edition_id',
 'review_sha256','version_id','report_name','workbook_name','workbook_job_id','workspace_archive_job_id',
 'workspace_programme_revision','workspace_programme_edition_id']);
 return result;
}
function input(value,record,id,expected){
 need(object(value)&&value.workspace_id===record.workspaceId&&value.id===id&&object(value.files)&&object(value.received)&&
 typeof value.complete==='boolean','INPUT_CHANGED');
 fields(value.files,['ndjson','manifest']);
 for(const [kind,maximum]of Object.entries(INPUT_LIMITS)){
 const file=value.files[kind];fields(file,['name','bytes','sha256']);label(file.name,240);
 integer(file.bytes,0,maximum);check(file.sha256,EVENT_HASH,'FILE_DIGEST_REQUIRED');
 integer(value.received[kind],0,file.bytes);
 if(expected)need(eventCanonical(file)===eventCanonical(expected[kind]),'INPUT_SELECTION_CHANGED');
 }
 need(value.complete===Object.keys(INPUT_LIMITS).every(kind=>value.received[kind]===value.files[kind].bytes),'INPUT_CHANGED');
 return value;
}

function inspection(value,record,id,schema){
 need(object(value)&&value.schema===schema&&value.workspace_id===record.workspaceId&&value.input_id===id&&
 object(value.original_files)&&object(value.source)&&object(value.receiver),'INPUT_INSPECTION_CHANGED');
 check(value.edition_id,EVENT_HASH,'SOURCE_EDITION_REQUIRED');integer(value.events);
 check(value.receiver.cli_sha256,EVENT_HASH,'SOURCE_RECEIVER_REQUIRED');check(value.receiver.core_sha256,EVENT_HASH,'SOURCE_RECEIVER_REQUIRED');
 for(const [kind,maximum]of Object.entries(INPUT_LIMITS)){
 const file=value.original_files[kind];need(object(file),'INPUT_INSPECTION_CHANGED');
 integer(file.bytes,0,maximum);check(file.sha256,EVENT_HASH,'SOURCE_DIGEST_REQUIRED');
 }
 return pick(value,['schema','workspace_id','input_id','edition_id','source','original_files','events','through_sequence','pages','receiver']);
}

function selectedMapping(value){
 fields(value,['fields'],['schema']);
 need(value.schema===undefined||value.schema==='stellar-forge.event-feed-analysis-mapping.v1','MAPPING_SCHEMA_INVALID');
 need(Array.isArray(value.fields)&&value.fields.length<=100,'FIELD_MAPPING_REQUIRED');
 for(const field of value.fields){fields(field,['name','pointer']);check(field.name,/^[A-Za-z][A-Za-z0-9_]{0,47}$/,'FIELD_NAME_INVALID');
 need(typeof field.pointer==='string'&&field.pointer.length<=2000&&(field.pointer===''||field.pointer.startsWith('/'))&&
 !/~(?:[^01]|$)/.test(field.pointer),'FIELD_POINTER_INVALID');}
 return copy(value);
}

function recordIdentity(kind,id){
 need(['overview','programme','action','fields','values','mapping','mapping-source'].includes(kind),'RECORD_KIND_INVALID');
 if(kind==='overview')need(id==='overview','RECORD_ID_REQUIRED');
 else check(id,kind==='programme'?EVENT_NAME:EVENT_ID,'RECORD_ID_REQUIRED');
}
function page(array,offset=0,limit=25,transform=x=>x){
 need(Array.isArray(array),'COLLECTION_REQUIRED');integer(offset,0,array.length);integer(limit,1,100);
 return {items:array.slice(offset,offset+limit).map(transform),total:array.length,
 next_offset:offset+limit<array.length?offset+limit:null};
}
/** Parent service owns its capability, call cancellation and all native jobs. */
export function createNativeEventActions({reads,parse}={}){
 need(typeof reads==='function'&&typeof parse==='function','ORIGINAL_FILE_HELPERS_REQUIRED');
 const handles=operation=>Object.hasOwn(nativeEventOperations,operation);
 async function cache(record,kind,id){
 check(record?.workspaceId,EVENT_ID,'WORKSPACE_ID_REQUIRED');recordIdentity(kind,id);
 need(typeof record.nativeWorkspace==='string'&&resolve(record.nativeWorkspace)===record.nativeWorkspace,'ORIGINAL_HOST_REQUIRED');
 let path=record.nativeWorkspace;await directory(path);
 for(const part of ['analysis','event-records',record.workspaceId,kind,id]){path=join(path,part);await directory(path,{create:true});}
 return path;
 }
 async function retain(raw,record,kind,id){
 need(Buffer.isBuffer(raw)&&raw.length>=1&&raw.length<=eventRecordLimit(kind),'RECORD_SIZE_INVALID');
 const descriptor={schema:RECORD,workspace_id:record.workspaceId,kind,record_id:id,bytes:raw.length,sha256:sha(raw)};
 const path=await cache(record,kind,id);
 await retainFile(join(path,descriptor.sha256+'.json'),raw,{resume:true});
 await retainRecord(join(path,descriptor.sha256+'.record.json'),descriptor,{resume:true});
 return descriptor;
 }
 async function snapshot(record,kind,id,request,project){
 const raw=await request(),value=parse(raw),result=project(value);
 return {...result,complete_record:await retain(raw,record,kind,id)};
 }
 async function readRecord(body,record){
 recordIdentity(body.kind,body.record_id);check(body.sha256,EVENT_HASH,'RECORD_DIGEST_REQUIRED');
 integer(body.bytes,1,eventRecordLimit(body.kind));
 const path=await cache(record,body.kind,body.record_id);
 const meta=parse(await bytes(join(path,body.sha256+'.record.json'),4096));
 need(meta.schema===RECORD&&meta.workspace_id===record.workspaceId&&meta.kind===body.kind&&
 meta.record_id===body.record_id&&meta.bytes===body.bytes&&meta.sha256===body.sha256,'RECORD_CHANGED');
 return {...meta,file:await reads({destination:join(path,body.sha256+'.json'),bytes:body.bytes,sha256:body.sha256,
 contentType:'application/json'},body)};
 }
 async function delivery(record,get,body){
 check(body.programme,EVENT_NAME,'PROGRAMME_REQUIRED');check(body.delivery_id,EVENT_ID,'DELIVERY_ID_REQUIRED');
 const saved=await get(ROOT+'/actions/'+body.delivery_id,{maximum:EVENT_MAX_RECORD});
 action(saved,record,body.delivery_id);
 need(saved.programme===body.programme&&saved.status==='COMPLETE'&&saved.request.action==='deliver','COMPLETE_DELIVERY_REQUIRED');
 const value=saved.result;
 need(object(value)&&value.schema==='stellar-forge.event-feed-analysis-delivery.v1'&&value.programme===body.programme&&
 value.workspace_id===record.workspaceId&&value.operation_id===body.delivery_id,'DELIVERY_CHANGED');
 need(Array.isArray(value.files),'COMPLETE_DELIVERY_FILES_REQUIRED');
 const index={schema:EVENT_DOWNLOAD_SCHEMA,workspace_id:record.workspaceId,programme:body.programme,
 delivery_id:body.delivery_id,accepted_operation_id:value.accepted_operation_id,edition_id:value.edition_id,
 review_sha256:value.review_sha256,workspace_programme_edition_id:value.workspace_programme_edition_id,
 workspace_programme_revision:value.workspace_programme_revision,
 files:value.files.map(file=>({name:file.name,bytes:file.bytes,sha256:file.sha256,mime:eventMime(file.name)}))
 .sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)};
 index.index_sha256=sha(Buffer.from(eventCanonical(index)));
 return validateEventDownloadIndex(index,{workspaceId:record.workspaceId,programme:body.programme,deliveryId:body.delivery_id});
 }
 async function call({operation,body,record,get,post,getBytes,postBytes,signal}){
 need(handles(operation)&&object(body)&&object(record)&&typeof get==='function'&&typeof post==='function'&&
 typeof getBytes==='function'&&typeof postBytes==='function','ORIGINAL_TRANSPORT_REQUIRED');
 const spec=nativeEventOperations[operation];fields(body,spec.required,Object.keys(spec.properties).filter(k=>!spec.required.includes(k)));
 signal?.throwIfAborted();
 if(operation.startsWith('event-mapping-working-')){
  const id=check(body.id,EVENT_HASH,'MAPPING_WORKING_SOURCE_ID_REQUIRED');
  const projected=value=>{
   need(object(value)&&value.workspace_id===record.workspaceId&&value.id===id&&value.sha256===id&&
    Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=201326592&&
    Number.isSafeInteger(value.received)&&value.received>=0&&value.received<=value.bytes&&
    value.complete===(value.received===value.bytes)&&value.chunk_bytes===65536,'MAPPING_WORKING_SOURCE_CHANGED');
   return {...pick(value,['schema','id','workspace_id','programme','input_id','name','bytes','sha256','received','complete','chunk_bytes']),
    derived:value.derived?{html:copy(value.derived.html),evidence:pick(value.derived.evidence,['schema','working_schema','working_bytes','working_sha256','comparison_sha256','programme_revision','baseline_operation_id','original_sha256','local_assignment_ids','local_receipt_ids'])}:null};
  };
  if(operation==='event-mapping-working-create'){
   check(body.programme,EVENT_NAME,'PROGRAMME_REQUIRED');check(body.input_id,EVENT_ID,'INPUT_ID_REQUIRED');label(body.name,240);
   integer(body.bytes,1,201326592);need(body.sha256===id,'MAPPING_WORKING_SOURCE_DIGEST_REQUIRED');
   const value=projected(await post(ROOT+'/mapping-working',copy(body)));
   need(['programme','input_id','name','bytes','sha256'].every(key=>value[key]===body[key]),'MAPPING_WORKING_SOURCE_CHANGED');return value;
  }
  if(operation==='event-mapping-working-status')return projected(await get(ROOT+'/mapping-working/'+id));
  if(operation==='event-mapping-working-chunk'){
   integer(body.offset);check(body.sha256,EVENT_HASH,'CHUNK_DIGEST_REQUIRED');
   need(typeof body.base64==='string'&&body.base64.length<=87384,'CHUNK_ENCODING_INVALID');
   const raw=Buffer.from(body.base64,'base64');need(raw.length>0&&raw.length<=65536&&raw.toString('base64')===body.base64&&sha(raw)===body.sha256,'CHUNK_CHANGED');
   return projected(await post(ROOT+'/mapping-working/'+id+'/chunks',pick(body,['offset','base64','sha256'])));
  }
  need(operation==='event-mapping-working-file'&&['source','html'].includes(body.kind),'MAPPING_WORKING_FILE_KIND_REQUIRED');
  check(body.sha256,EVENT_HASH,'FILE_DIGEST_REQUIRED');integer(body.byteOffset??0);integer(body.maxBytes??65536,1,65536);
  const value=await get(ROOT+'/mapping-working/'+id+'/'+body.kind+query({offset:body.byteOffset??0,limit:body.maxBytes??65536}));
  need(object(value)&&value.source?.workspace_id===record.workspaceId&&value.source?.id===id&&value.sha256===body.sha256&&value.offset===(body.byteOffset??0),'MAPPING_WORKING_FILE_CHANGED');
  const part=Buffer.from(value.base64,'base64');need(part.toString('base64')===value.base64&&part.length===value.length&&part.length<=(body.maxBytes??65536)&&sha(part)===value.range_sha256,'MAPPING_WORKING_FILE_RANGE_CHANGED');
  return value;
 }
 if(operation==='event-mapping-request-create')return createEventMappingRequestSource(record,body);
 if(operation==='event-mapping-request-source')return eventMappingRequestSourceStatus(record,body.id);
 if(operation==='event-mapping-request-chunk')return receiveEventMappingRequestChunk(record,body);
 if((operation==='event-mapping-source'||operation==='event-review')&&body.mapping_request_source!==undefined){
  const request=await readEventMappingRequestSource(record,body.mapping_request_source);
  if(operation==='event-mapping-source'){
   fields(body,['mapping_request_source']);
   body=mappingSourceSelection(request);
  }else{
   fields(body,['programme','id','operation_id','mapping_request_source'],['resume']);
   fields(request,['programme','id','operation_id','input_id','mapping','mapping_review'],['mapping_working_source']);
   need(request.programme===body.programme&&request.id===body.id&&request.operation_id===body.operation_id,
    'ORIGINAL_MAPPING_REQUEST_CHANGED');
   body={...request,...(body.resume===undefined?{}:{resume:body.resume})};
  }
 }
 if(operation==='event-workbook-review-create')return createEventWorkbookReviewSource(record,body);
 if(operation==='event-workbook-review-source')return eventWorkbookReviewSourceStatus(record,body.id);
 if(operation==='event-workbook-review-chunk')return receiveEventWorkbookReviewChunk(record,body);
 if(operation==='event-record-file')return readRecord(body,record);
 if(operation==='event-overview'){
 for(const key of ['actions_before','inputs_before'])if(body[key]!==undefined)integer(body[key],1);
 const limit=body.limit??25;integer(limit,1,100);
 return snapshot(record,'overview','overview',()=>getBytes(ROOT+query({
 actions_before:body.actions_before,inputs_before:body.inputs_before,limit}),EVENT_MAX_RECORD),value=>{
 need(object(value)&&value.workspace_id===record.workspaceId&&Array.isArray(value.programmes)&&
 Array.isArray(value.actions)&&Array.isArray(value.inputs),'OVERVIEW_CHANGED');
 const programmes=page(value.programmes,body.programme_offset??0,body.programme_limit??25,x=>programme(x,record));
 const actions=value.actions.map(x=>action(x,record)),inputs=value.inputs.map(x=>{
 check(x.id,EVENT_ID,'INPUT_ID_REQUIRED');return pick(x,['id','files','created_at']);});
 return {workspace_id:record.workspaceId,active:value.active,source_receiver_available:value.source_receiver_available,
 programmes,actions,inputs,next_actions:value.next_actions,next_inputs:value.next_inputs};
 });
 }
 if(operation==='event-mapping-compare'){
 check(body.programme,EVENT_NAME,'PROGRAMME_REQUIRED');check(body.input_id,EVENT_ID,'INPUT_ID_REQUIRED');
 const mapping=selectedMapping(body.mapping);integer(body.field_limit??25,1,50);
 return snapshot(record,'mapping',body.input_id,()=>postBytes(ROOT+'/named/'+body.programme+'/mapping-comparison',
  {input_id:body.input_id,mapping},EVENT_MAX_RECORD),value=>{
 need(object(value)&&value.schema==='stellar-forge.event-feed-mapping-comparison.v1'&&value.workspace_id===record.workspaceId&&
  value.programme===body.programme&&value.input_id===body.input_id&&Array.isArray(value.fields)&&value.field_count===value.fields.length&&
  Array.isArray(value.mapped_fields)&&Array.isArray(value.required_decisions),'MAPPING_COMPARISON_CHANGED');
 check(value.comparison_sha256,EVENT_HASH,'MAPPING_COMPARISON_REQUIRED');check(value.baseline_operation_id,EVENT_ID,'MAPPING_BASELINE_REQUIRED');
 integer(value.programme_revision);need(eventCanonical(value.mapping.fields)===eventCanonical(mapping.fields),'FIELD_MAPPING_CHANGED');
 return {...pick(value,['schema','workspace_id','programme','input_id','programme_revision','baseline_operation_id',
  'comparison_sha256','mapping_sha256','previous_mapping_sha256','previous','current','receiver',
  'required_decisions','field_count']),window:pick(value.window,['schema','before','after','retained','added',
   'earlier_through_sequence','later_through_sequence','earlier_pages','later_pages']),
  mapped_fields:page(value.mapped_fields,body.mapping_offset??0,body.mapping_limit??25,row=>({...row,
   before_pointer:row.before_pointer===null?null:preview(row.before_pointer),
   after_pointer:row.after_pointer===null?null:preview(row.after_pointer),
   pointer_previews:{before:row.before_pointer!==null&&preview(row.before_pointer)!==row.before_pointer,
    after:row.after_pointer!==null&&preview(row.after_pointer)!==row.after_pointer}})),
  fields:page(value.fields,body.field_offset??0,body.field_limit??25,row=>({...row,
   pointer:preview(row.pointer),pointer_preview:preview(row.pointer)!==row.pointer}))};
 });
 }
 if(operation==='event-mapping-source'){
 const selected=mappingSourceSelection(body),key=mappingSourceSelectionHash(selected);
 const folder=await cache(record,'mapping-source',selected.input_id),path=join(folder,'selection-'+key+'.json');
 let raw=await optionalBytes(path,EVENT_MAPPING_SOURCE_LIMIT);
 if(raw===null){
  raw=await postBytes(ROOT+'/named/'+selected.programme+'/mapping-source',
   {input_id:selected.input_id,mapping:selected.mapping,expected:selected.expected},EVENT_MAPPING_SOURCE_LIMIT);
  mappingSourceSummary(raw,selected,record.workspaceId);
  signal?.throwIfAborted();
  // One exact source selection remains recoverable after a lost reply or later native baseline.
  await retainFile(path,raw,{resume:true});
 }
 const summary=mappingSourceSummary(raw,selected,record.workspaceId);
 signal?.throwIfAborted();
 return {...summary,complete_record:await retain(raw,record,'mapping-source',selected.input_id)};
 }
 if(operation==='event-input-create'){
 check(body.id,EVENT_ID,'INPUT_ID_REQUIRED');fields(body.files,['ndjson','manifest']);
 for(const [kind,max]of Object.entries(INPUT_LIMITS)){const file=body.files[kind];fields(file,['name','bytes','sha256']);
 label(file.name,240);integer(file.bytes,0,max);check(file.sha256,EVENT_HASH,'FILE_DIGEST_REQUIRED');}
 return input(await post(ROOT+'/inputs',copy(body)),record,body.id,body.files);
 }
 if(operation==='event-input')return input(await get(ROOT+'/inputs/'+check(body.id,EVENT_ID,'INPUT_ID_REQUIRED')),record,body.id);

 if(operation==='event-input-fields'){
 check(body.id,EVENT_ID,'INPUT_ID_REQUIRED');integer(body.field_limit??25,1,50);
 return snapshot(record,'fields',body.id,()=>getBytes(ROOT+'/inputs/'+body.id+'/fields',EVENT_MAX_RECORD),value=>{
 const selected=inspection(value,record,body.id,'stellar-forge.event-feed-payload-fields.v1');
 need(Array.isArray(value.fields)&&value.field_count===value.fields.length,'COMPLETE_FIELDS_REQUIRED');
 return {...selected,field_count:value.field_count,fields:page(value.fields,body.field_offset??0,body.field_limit??25,row=>{
 need(object(row)&&typeof row.pointer==='string'&&typeof row.selectable==='boolean'&&object(row.types)&&
 Array.isArray(row.examples),'FIELD_COVERAGE_CHANGED');
 integer(row.present,0,value.events);integer(row.missing,0,value.events);
 need(row.present+row.missing===value.events,'FIELD_COVERAGE_CHANGED');
 return {...pick(row,['present','missing','types','selectable','examples']),pointer:row.selectable?row.pointer:preview(row.pointer),
 pointer_preview:!row.selectable};
 })};
 });
 }
 if(operation==='event-input-values'){
 check(body.id,EVENT_ID,'INPUT_ID_REQUIRED');
 need(typeof body.pointer==='string'&&body.pointer.length<=2000&&
 (body.pointer===''||body.pointer.startsWith('/'))&&!/~(?:[^01]|$)/.test(body.pointer),'PAYLOAD_POINTER_REQUIRED');
 integer(body.offset??0);integer(body.limit??25,1,100);
 const selected={pointer:body.pointer,offset:body.offset??0,limit:body.limit??25};
 return snapshot(record,'values',body.id,()=>postBytes(ROOT+'/inputs/'+body.id+'/inspect',selected,EVENT_MAX_RECORD),value=>{
 const original=inspection(value,record,body.id,'stellar-forge.event-feed-payload-values.v1');
 need(value.pointer===selected.pointer&&value.offset===selected.offset&&value.limit===selected.limit&&
 value.total===value.events&&Array.isArray(value.rows)&&value.rows.length<=selected.limit,'FIELD_VALUES_CHANGED');
 return {...original,...pick(value,['pointer','offset','limit','total','next_offset']),rows:value.rows.map(row=>{
 need(object(row)&&object(row.event)&&['missing','null','string','number','boolean','object','array'].includes(row.state)&&
 (row.text===null||typeof row.text==='string'),'FIELD_VALUES_CHANGED');
 return {...pick(row,['index','event','state','value_bytes','value_sha256']),text_preview:row.text===null?null:preview(row.text),
 text_truncated:typeof row.text==='string'&&preview(row.text)!==row.text};
 })};
 });
 }

 if(operation==='event-input-chunk'){
 check(body.id,EVENT_ID,'INPUT_ID_REQUIRED');need(Object.hasOwn(INPUT_LIMITS,body.kind),'FILE_KIND_REQUIRED');
 integer(body.offset);check(body.sha256,EVENT_HASH,'CHUNK_DIGEST_REQUIRED');
 need(typeof body.base64==='string'&&body.base64.length<=87384,'CHUNK_ENCODING_INVALID');
 const raw=Buffer.from(body.base64,'base64');need(raw.length>0&&raw.length<=65536&&raw.toString('base64')===body.base64&&sha(raw)===body.sha256,'CHUNK_CHANGED');
 return input(await post(ROOT+'/inputs/'+body.id+'/'+body.kind,pick(body,['offset','base64','sha256'])),record,body.id);
 }
 if(operation==='event-programme'){
 check(body.programme,EVENT_NAME,'PROGRAMME_REQUIRED');
 return snapshot(record,'programme',body.programme,()=>getBytes(ROOT+'/named/'+body.programme,EVENT_MAX_RECORD),value=>{
 need(object(value)&&Array.isArray(value.operations),'PROGRAMME_CHANGED');
 return {programme:programme(value.programme,record,body.programme),
 operations:page(value.operations,body.offset??0,body.limit??25,x=>{
 check(x.id,EVENT_ID,'OPERATION_ID_REQUIRED');
 return {...pick(x,['id','kind']),review_sha256:x.review?.review_sha256??null,
 edition_id:x.applied?.accepted?.edition_id??null,has_delivery:object(x.delivery),
 prior_customer_attempts:x.prior_customer_attempts?.length??0};
 })};
 });
 }
 if(operation==='event-action'){
 check(body.id,EVENT_ID,'ACTION_ID_REQUIRED');
 return snapshot(record,'action',body.id,()=>getBytes(ROOT+'/actions/'+body.id,EVENT_MAX_RECORD),value=>action(value,record,body.id));
 }
 if(operation==='event-delivery-index')return delivery(record,get,body);
 if(operation==='event-delivery-file'){
 check(body.index_sha256,EVENT_HASH,'INDEX_DIGEST_REQUIRED');check(body.sha256,EVENT_HASH,'FILE_DIGEST_REQUIRED');
 need(EVENT_FILES.includes(body.filename),'DELIVERY_FILE_REQUIRED');
 const index=await delivery(record,get,body),file=index.files.find(x=>x.name===body.filename);
 need(index.index_sha256===body.index_sha256&&file.sha256===body.sha256,'DELIVERY_SELECTION_CHANGED');
 const root=join(record.database,'event-browser-deliveries'),folder=join(root,body.delivery_id);
 // Resolve only from the host-registered received database; retained sender paths are provenance.
 await directory(record.database);await directory(root);await directory(folder);
 const manifest=index.files.find(x=>x.name==='Event_Analysis_Delivery.json');
 await reads({destination:join(folder,manifest.name),bytes:manifest.bytes,sha256:manifest.sha256,
 contentType:manifest.mime},{maxBytes:1});
 return {workspace_id:record.workspaceId,programme:index.programme,delivery_id:index.delivery_id,
 index_sha256:index.index_sha256,filename:file.name,
 file:await reads({destination:join(folder,file.name),bytes:file.bytes,sha256:file.sha256,contentType:file.mime},body)};
 }
 check(body.programme,EVENT_NAME,'PROGRAMME_REQUIRED');check(body.id,EVENT_ID,'ACTION_ID_REQUIRED');
 check(body.operation_id,EVENT_ID,'OPERATION_ID_REQUIRED');need(body.resume===undefined||typeof body.resume==='boolean','RESUME_REQUIRED');
 const actionName=operation.slice('event-'.length),request={id:body.id,operation_id:body.operation_id,action:actionName};
 if(body.resume!==undefined)request.resume=body.resume;
 if(actionName==='review'){
 check(body.input_id,EVENT_ID,'INPUT_ID_REQUIRED');
 request.input_id=body.input_id;request.mapping=selectedMapping(body.mapping);
 if(body.mapping_review!==undefined){
  const value=body.mapping_review;fields(value,['comparison_sha256','programme_revision','baseline_operation_id','reviewer','note','decisions']);
  check(value.comparison_sha256,EVENT_HASH,'MAPPING_COMPARISON_REQUIRED');integer(value.programme_revision);
  check(value.baseline_operation_id,EVENT_ID,'MAPPING_BASELINE_REQUIRED');
  need(typeof value.reviewer==='string'&&value.reviewer.trim()&&Buffer.byteLength(value.reviewer)<=240&&
   !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.reviewer),'MAPPING_REVIEWER_REQUIRED');
  need(typeof value.note==='string'&&value.note.trim()&&Buffer.byteLength(value.note)<=8000&&
   !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.note),'DECISION_NOTE_REQUIRED');
  need(Array.isArray(value.decisions)&&value.decisions.length<=200,'MAPPING_DECISIONS_REQUIRED');
  for(const decision of value.decisions){fields(decision,['name','reason']);check(decision.name,/^[A-Za-z][A-Za-z0-9_]{0,47}$/,'FIELD_NAME_INVALID');
   need(typeof decision.reason==='string'&&decision.reason.trim()&&Buffer.byteLength(decision.reason)<=4000,'MAPPING_REASON_REQUIRED');}
  request.mapping_review=copy(value);
 }
 if(body.mapping_working_source!==undefined){
  const full=body.mapping_working_source;fields(full,['id','bytes','sha256']);check(full.id,EVENT_HASH,'MAPPING_WORKING_SOURCE_ID_REQUIRED');integer(full.bytes,1,201326592);need(full.sha256===full.id&&request.mapping_review,'MAPPING_WORKING_SOURCE_REQUIRED');request.mapping_working_source=copy(full);
 }
 }else if(actionName==='apply'||actionName==='refresh-review'){
 check(body.review_sha256,EVENT_HASH,'REVIEW_REQUIRED');
 need(typeof body.note==='string'&&body.note.trim()&&Buffer.byteLength(body.note)<=8000,'DECISION_NOTE_REQUIRED');
 request.review_sha256=body.review_sha256;request.note=body.note;
 if(actionName==='apply'){need(body.columns===undefined||object(body.columns),'WORKBOOK_COLUMNS_INVALID');
 request.columns=copy(body.columns??{});need(Buffer.byteLength(JSON.stringify(request.columns))<=512*1024,'WORKBOOK_COLUMNS_INVALID');
 need(body.columns_sha256===undefined||body.column_review!==undefined||body.column_review_source!==undefined,'WORKBOOK_REVIEW_REQUIRED');
 need(body.column_review===undefined||body.column_review_source===undefined,'ONE_WORKBOOK_REVIEW_SOURCE_REQUIRED');
 if(body.column_review!==undefined||body.column_review_source!==undefined){
  const full=body.column_review_source!==undefined?await readEventWorkbookReviewSource(record,body.column_review_source):copy(body.column_review);
  need(object(full)&&Buffer.byteLength(eventCanonical(full))<=EVENT_WORKBOOK_REVIEW_LIMIT&&
   full.original?.workspace_id===record.workspaceId&&full.original?.programme===body.programme&&
   full.original?.proposal?.operation_id===body.operation_id&&
   full.original?.proposal?.review_sha256===body.review_sha256,'ORIGINAL_WORKBOOK_REVIEW_CHANGED');
  const normalized=workbookNativeColumns(reopenWorkbookReview(full));
  need(Buffer.byteLength(eventCanonical(normalized))<=512*1024,'WORKBOOK_COLUMNS_INVALID');
  if(body.columns!==undefined)need(eventCanonical(normalized)===eventCanonical(body.columns),'SELECTED_WORKBOOK_COLUMNS_CHANGED');
  if(body.columns_sha256!==undefined)need(EVENT_HASH.test(body.columns_sha256)&&
   sha(Buffer.from(eventCanonical(normalized)))===body.columns_sha256,'SELECTED_WORKBOOK_COLUMNS_CHANGED');
  request.columns=normalized;request.column_review=full;
 }
}
 }else need(actionName==='deliver'&&body.id!==body.operation_id,'FRESH_DELIVERY_ID_REQUIRED');
 return snapshot(record,'action',body.id,()=>postBytes(ROOT+'/named/'+body.programme+'/actions',request,EVENT_MAX_RECORD,
  request.column_review===undefined?undefined:EVENT_WORKBOOK_REQUEST_LIMIT),value=>{
 const result=action(value,record,body.id);
 need(value.programme===body.programme&&value.request.action===actionName&&value.request.operation_id===body.operation_id,'ACTION_SELECTION_CHANGED');
 return result;
 });
 }
 return {handles,call};
}
