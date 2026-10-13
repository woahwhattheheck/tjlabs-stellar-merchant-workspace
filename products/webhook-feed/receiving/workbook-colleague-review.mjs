// SPDX-License-Identifier: MIT
// Callable following chapter owned by the original Event Analysis receiving parent.
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {initializationDirectory as directory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationFile as retain}
 from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {context,initial,reopen,replaceColumns,eventWorkbookReturns as reviews,canonical,nativeColumns}
 from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/workbook-columns.mjs';
import {renderEditableWorkbookColumns}
 from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/workbook-editor.mjs';
import {nativeEventConnection,readNativeAnalysisEventRecord}
 from '../../../stellar-forge/mcp-paid-agent/native-analysis-events-client.mjs';
import {prepareNativeAnalysisEventWorkbookReview,applyNativeAnalysisEventWorkbookReview,
 receiveNativeAnalysisEventWorkbookReview,reopenNativeAnalysisEventWorkbookReview}
 from '../../../stellar-forge/mcp-paid-agent/native-analysis-events-workbook.mjs';
import {inspectNativeAnalysisEventDelivery,downloadNativeAnalysisEventDelivery,reopenNativeAnalysisEventDelivery}
 from '../../../stellar-forge/mcp-paid-agent/native-analysis-events-download.mjs';
import {EVENT_ID,EVENT_HASH,EVENT_NAME,EVENT_MAX_RECORD,eventHash as sha,eventNeed as need,
 eventObject as object} from '../../../stellar-forge/mcp-paid-agent/native-analysis-events-contract.mjs';

export const EVENT_COLLEAGUE_COURSE='stellar-forge.event-workbook-colleague-course.v1';
const LIMIT=128*1024*1024,ALIAS=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const encode=value=>Buffer.from(canonical(value)+'\n');
const decode=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const same=(a,b)=>canonical(a)===canonical(b);
const keys=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));
const identity=raw=>({bytes:raw.length,sha256:sha(raw)});
const flag=options=>{need(options.resume===undefined||typeof options.resume==='boolean','EXPLICIT_RESUME_REQUIRED');return options.resume===undefined?{}:{resume:options.resume};};
const stamped=value=>need(typeof value==='string'&&value.length<=80&&Number.isFinite(Date.parse(value)),'ORIGINAL_TIMESTAMP_REQUIRED');
function root(options){
 need(typeof options.directory==='string'&&resolve(options.directory)!=='/','COURSE_DIRECTORY_REQUIRED');
 return resolve(options.directory);
}
function base(options){
 need(ALIAS.test(options.analysisWorkspace??'')&&EVENT_ID.test(options.expectedWorkspaceId??'')&&
 EVENT_NAME.test(options.programme??'')&&EVENT_ID.test(options.proposalActionId??''),'ORIGINAL_COURSE_IDENTITY_REQUIRED');
 return {schema:EVENT_COLLEAGUE_COURSE,analysisWorkspace:options.analysisWorkspace,
 workspace_id:options.expectedWorkspaceId,programme:options.programme,proposal_action_id:options.proposalActionId};
}
async function json(path,limit=LIMIT){return decode(await bytes(path,limit));}
async function save(path,value){return retain(path,encode(value),{resume:true});}
async function child(parent,name){const path=join(parent,name);await directory(path,{create:true});return path;}
async function localRoot(options){const path=root(options);await directory(path);return path;}
async function copiedInput(folder,name,supplied,expected){
 let raw=await optionalBytes(join(folder,name),LIMIT);
 if(supplied!==undefined){
  need(typeof supplied==='string','SOURCE_FILE_REQUIRED');const next=await bytes(resolve(supplied),LIMIT);
  need(raw===null||raw.equals(next),'ORIGINAL_COURSE_SOURCE_CHANGED');raw=next;
 }
 need(raw!==null&&same(identity(raw),expected),'ORIGINAL_COURSE_SOURCE_CHANGED');return raw;
}
function proposal(action,selected){
 need(action?.workspace_id===selected.workspace_id&&action.programme===selected.programme&&
 action.id===selected.proposal_action_id&&action.status==='COMPLETE'&&
 action.request?.action==='apply'&&action.result?.state==='WORKBOOK_COLUMN_CHOICES_REQUIRED',
 'ORIGINAL_NATIVE_COLUMN_PROPOSAL_REQUIRED');
 const value=context({workspace_id:selected.workspace_id,programme:selected.programme,proposal:action.result});
 need(action.request.operation_id===value.proposal.operation_id&&
 action.request.review_sha256===value.proposal.review_sha256,'ORIGINAL_NATIVE_COLUMN_PROPOSAL_CHANGED');
 return value;
}
async function fullAction(client,id,workspace,signal){
 const summary=await client.call('event-action',{id},{signal}),selected=summary?.complete_record;
 need(selected?.kind==='action'&&selected.record_id===id&&selected.workspace_id===workspace,
 'COMPLETE_NATIVE_ACTION_REQUIRED');
 return readNativeAnalysisEventRecord({client,record:selected,signal});
}
async function source(folder,options){
 const selected=await json(join(folder,'course.json'),65536);
 need(same(selected,base(options)),'ORIGINAL_COURSE_IDENTITY_CHANGED');
 const descriptor=await json(join(folder,'proposal-action.record.json'),4096);
 need(descriptor.kind==='action'&&descriptor.record_id===selected.proposal_action_id&&
 descriptor.workspace_id===selected.workspace_id&&EVENT_HASH.test(descriptor.sha256??''),
 'ORIGINAL_PROPOSAL_RECORD_CHANGED');
 const raw=await bytes(join(folder,'proposal-action.json'),EVENT_MAX_RECORD);
 need(raw.length===descriptor.bytes&&sha(raw)===descriptor.sha256,'ORIGINAL_PROPOSAL_BYTES_CHANGED');
 const action=decode(raw),original=proposal(action,selected);
 return {selected,action,original,descriptor};
}
const rendererFiles={coreSource:'workbook-columns.mjs',controllerSource:'workbook-editor.js',
 returnSource:'workbook-returns.mjs'};
async function renderer(folder){
 const parent=await child(folder,'source'),selected={};
 for(const [key,name] of Object.entries(rendererFiles)){
  const path=join(parent,name);let raw=await optionalBytes(path,8*1024*1024);
  if(raw===null){
   raw=await readFile(new URL('../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/'+name,import.meta.url));
   need(raw.length>0&&raw.length<=8*1024*1024,'INSTALLED_WORKBOOK_SOURCE_REQUIRED');
   await retain(path,raw,{resume:true});
  }
  selected[key]=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 }
 await save(join(parent,'render-source.json'),Object.fromEntries(Object.entries(selected).map(([key,value])=>[key,identity(Buffer.from(value))])));
 return selected;
}
async function checkHTML(folder,name){
 const record=await json(join(folder,name+'.file.json'),4096),raw=await bytes(join(folder,name),LIMIT);
 need(same(identity(raw),record),'COMPLETE_REVIEW_HTML_CHANGED');
 const sourceFolder=join(folder,'source'),manifest=await json(join(sourceFolder,'render-source.json'),65536);
 for(const [key,filename] of Object.entries(rendererFiles)){
  const source=await bytes(join(sourceFolder,filename),8*1024*1024);
  need(same(identity(source),manifest[key]),'RETAINED_RENDER_SOURCE_CHANGED');
 }
 return join(folder,name);
}
async function html(folder,name,working){
 const prior=await optionalBytes(join(folder,name+'.file.json'),4096);
 if(prior!==null)return checkHTML(folder,name);
 const sources=await renderer(folder),body=Buffer.from(renderEditableWorkbookColumns(working,sources));
 await retain(join(folder,name),body,{resume:true});
 await save(join(folder,name+'.file.json'),identity(body));
 return checkHTML(folder,name);
}
/** Pin the actual saved native proposal and issue a complete independent reviewer copy. */
export async function prepareEventWorkbookColleagueCourse(options={}){
 const folder=root(options);await directory(folder,{create:true});const selected=base(options);
 await save(join(folder,'course.json'),selected);
 // Pin the descriptor before fetching bytes; an interrupted receive follows that exact record.
 let descriptor=await optionalBytes(join(folder,'proposal-action.record.json'),4096);
 if(descriptor===null){
  const client=await nativeEventConnection(options),summary=await client.call('event-action',
   {id:selected.proposal_action_id},{signal:options.signal});
  const record=summary?.complete_record;
  need(record?.kind==='action'&&record.record_id===selected.proposal_action_id&&
   record.workspace_id===selected.workspace_id,'COMPLETE_NATIVE_ACTION_REQUIRED');
  const full=await readNativeAnalysisEventRecord({client,record,signal:options.signal});
  proposal(decode(full.bytes),selected);
  await save(join(folder,'proposal-action.record.json'),record);
  await retain(join(folder,'proposal-action.json'),full.bytes,{resume:true});descriptor=encode(record);
 }
 const record=decode(descriptor);
 let raw=await optionalBytes(join(folder,'proposal-action.json'),EVENT_MAX_RECORD);
 if(raw===null){
  const client=await nativeEventConnection(options),full=await readNativeAnalysisEventRecord({client,record,signal:options.signal});
  raw=full.bytes;await retain(join(folder,'proposal-action.json'),raw,{resume:true});
 }
 const originalSource=await source(folder,options),original=originalSource.original;
 let working=await optionalBytes(join(folder,'original-working.json'),LIMIT);
 if(options.workingPath!==undefined){
  const supplied=await bytes(resolve(options.workingPath),LIMIT);reopen(decode(supplied),original);
  need(working===null||working.equals(supplied),'ORIGINAL_COURSE_SOURCE_CHANGED');
  working=supplied;await retain(join(folder,'original-working.json'),working,{resume:true});
 }
 if(working===null){
  let value=initial(original);
  if(object(originalSource.action.request.columns))value=replaceColumns(value,
   {...value.columns,...originalSource.action.request.columns});
  working=encode(value);await retain(join(folder,'original-working.json'),working,{resume:true});
 }
 const value=reopen(decode(working),original);
 let assignment=await optionalBytes(join(folder,'assignment-request.json'),65536);
 if(assignment===null){
  need(keys(options.assignment,['actor','reviewer','note','at']),'ORIGINAL_ASSIGNMENT_REQUIRED');
  reviews.createAssignment(value,options.assignment);
  assignment=encode(options.assignment);await retain(join(folder,'assignment-request.json'),assignment,{resume:true});
 }else if(options.assignment!==undefined)need(same(decode(assignment),options.assignment),'ORIGINAL_ASSIGNMENT_CHANGED');
 need(keys(decode(assignment),['actor','reviewer','note','at']),'ORIGINAL_ASSIGNMENT_REQUIRED');
 const issued=reviews.createAssignment(value,decode(assignment)),reviewer=reviews.openAssignment(issued.envelope);
 await save(join(folder,'producer-issued.json'),issued.value);await save(join(folder,'assignment.json'),issued.envelope);
 await save(join(folder,'reviewer-start.json'),reviewer);
 await html(folder,'producer-issued.html',issued.value);await html(folder,'reviewer-start.html',reviewer);
 const result={...selected,state:'ASSIGNED',assignment_id:issued.envelope.assignment.id,
  operation_id:original.proposal.operation_id,review_sha256:original.proposal.review_sha256,
  files:{proposal:'proposal-action.json',producer:'producer-issued.json',assignment:'assignment.json',
   reviewer:'reviewer-start.json',producer_html:'producer-issued.html',reviewer_html:'reviewer-start.html'}};
 await save(join(folder,'assignment-result.json'),result);return {...result,directory:folder};
}
async function assigned(folder,options){
 const native=await source(folder,options),issued=reopen(await json(join(folder,'producer-issued.json')),native.original),
 envelope=await json(join(folder,'assignment.json'));
 need(same(reviews.assignmentEnvelope(issued,envelope.assignment.id),envelope),'ORIGINAL_ASSIGNMENT_CHANGED');
 await checkHTML(folder,'producer-issued.html');await checkHTML(folder,'reviewer-start.html');
 return {...native,issued,envelope};
}
/** Freeze the actual returned file and current producer file; preserve every byte before comparison. */
export async function stageEventWorkbookColleagueReturn(options={}){
 const folder=await localRoot(options),a=await assigned(folder,options);
 let currentBytes,returnBytes;
 if(options.stageId!==undefined){
  need(EVENT_HASH.test(options.stageId),'ORIGINAL_STAGE_REQUIRED');
  const previous=join(folder,'stages',options.stageId);await directory(previous);
  const saved=await json(join(previous,'stage.json'),65536);
  need(sha(encode(saved))===options.stageId&&saved.assignment_id===a.envelope.assignment.id,'ORIGINAL_STAGE_CHANGED');
  currentBytes=await copiedInput(previous,'producer-current.json',options.currentPath,saved.current);
  returnBytes=await copiedInput(previous,'reviewer-return.json',options.returnPath,saved.returned);
 }else{
  need(typeof options.currentPath==='string'&&typeof options.returnPath==='string','COMPLETE_REVIEW_FILES_REQUIRED');
  currentBytes=await bytes(resolve(options.currentPath),LIMIT);returnBytes=await bytes(resolve(options.returnPath),LIMIT);
 }
 const current=reopen(decode(currentBytes),a.original),returned=decode(returnBytes);
 need(returned?.return?.assignment_id===a.envelope.assignment.id&&
 same(reviews.assignmentEnvelope(current,a.envelope.assignment.id),a.envelope),'ORIGINAL_ASSIGNMENT_CHANGED');
 const staged=reviews.stageReturn(current,returned),preview=reviews.previewReturn(staged,returned),
 selection={schema:EVENT_COLLEAGUE_COURSE,assignment_id:a.envelope.assignment.id,
  current:identity(currentBytes),returned:identity(returnBytes)};
 const id=sha(encode(selection));if(options.stageId!==undefined)need(options.stageId===id,'ORIGINAL_STAGE_CHANGED');
 const stages=await child(folder,'stages'),stage=await child(stages,id);
 await save(join(stage,'stage.json'),selection);
 await retain(join(stage,'producer-current.json'),currentBytes,{resume:true});
 await retain(join(stage,'reviewer-return.json'),returnBytes,{resume:true});
 await save(join(stage,'staged-working.json'),staged);await save(join(stage,'preview.json'),preview);
 await html(stage,'staged-working.html',staged);
 return {schema:EVENT_COLLEAGUE_COURSE,state:'REVIEW',directory:folder,stage_id:id,
  stage_directory:stage,preview,files:{current:'producer-current.json',returned:'reviewer-return.json',
   staged:'staged-working.json',preview:'preview.json',html:'staged-working.html'}};
}
async function savedStage(folder,options){
 need(EVENT_HASH.test(options.stageId??''),'ORIGINAL_STAGE_REQUIRED');
 const a=await assigned(folder,options),stage=join(folder,'stages',options.stageId);await directory(stage);
 const selected=await json(join(stage,'stage.json'),65536);
 need(sha(encode(selected))===options.stageId&&selected.assignment_id===a.envelope.assignment.id,'ORIGINAL_STAGE_CHANGED');
 const currentRaw=await bytes(join(stage,'producer-current.json'),LIMIT),returnedRaw=await bytes(join(stage,'reviewer-return.json'),LIMIT);
 need(same(identity(currentRaw),selected.current)&&same(identity(returnedRaw),selected.returned),'ORIGINAL_REVIEW_FILES_CHANGED');
 const current=reopen(decode(currentRaw),a.original),returned=decode(returnedRaw);
 need(returned.return.assignment_id===a.envelope.assignment.id&&
 same(reviews.assignmentEnvelope(current,a.envelope.assignment.id),a.envelope),'ORIGINAL_ASSIGNMENT_CHANGED');
 const staged=reviews.stageReturn(current,returned),saved=reopen(await json(join(stage,'staged-working.json')),a.original),
 preview=await json(join(stage,'preview.json'));
 need(same(saved,staged)&&same(preview,reviews.previewReturn(staged,returned)),'SAVED_REVIEW_PREVIEW_CHANGED');
 await checkHTML(stage,'staged-working.html');
 return {...a,stage,staged,returned,preview};
}
/** Consume the reviewed frozen preview, explicit whole-array decisions and original native action ID. */
export async function prepareEventWorkbookColleagueApply(options={}){
 const folder=await localRoot(options);
 need(EVENT_ID.test(options.actionId??'')&&options.actionId!==options.proposalActionId,
 'FOLLOWING_APPLY_ACTION_REQUIRED');
 const parent=await child(folder,'applications'),application=await child(parent,options.actionId),
 prior=await optionalBytes(join(application,'selection.json'),65536);
 let selection=prior===null?null:decode(prior);
 if(selection!==null){
  need(selection.schema===EVENT_COLLEAGUE_COURSE&&selection.action_id===options.actionId,'ORIGINAL_APPLY_SELECTION_CHANGED');
  for(const [key,field] of [['stageId','stage_id'],['decision','decision'],['note','native_note'],['reviewSourceId','review_source_id']])
   if(options[key]!==undefined)need(same(options[key],selection[field]),'ORIGINAL_APPLY_SELECTION_CHANGED');
 }else{
  need(object(options.decision),'SAVED_PREVIEW_DECISION_REQUIRED');
  selection={schema:EVENT_COLLEAGUE_COURSE,stage_id:options.stageId,action_id:options.actionId,
   review_source_id:options.reviewSourceId??options.actionId,decision:{...options.decision},native_note:options.note};
 }
 const s=await savedStage(folder,{...options,stageId:selection.stage_id}),decision=selection.decision;
 need(keys(decision,['resolutions','actor','note','at','expected_current_digest'])&&
  decision.expected_current_digest===s.preview.current_digest,'SAVED_PREVIEW_DECISION_REQUIRED');
 need(EVENT_ID.test(selection.review_source_id??'')&&typeof selection.native_note==='string'&&
  selection.native_note.trim()&&Buffer.byteLength(selection.native_note)<=8000,'ORIGINAL_NATIVE_DECISION_REQUIRED');
 stamped(decision.at);const result=reviews.applyReturn(s.staged,s.returned,decision);nativeColumns(result);
 // Stable selection is saved before any later source file or native preparation.
 await save(join(application,'selection.json'),selection);
 await save(join(application,'received-working.json'),result);
 await html(application,'received-working.html',result);
 const prepared=await prepareNativeAnalysisEventWorkbookReview({...options,directory:application,
  workingPath:join(application,'received-working.json'),reviewSourceId:selection.review_source_id,note:selection.native_note});
 return {schema:EVENT_COLLEAGUE_COURSE,state:'PREPARED',directory:folder,application_directory:application,
  action_id:options.actionId,stage_id:selection.stage_id,prepared,
  files:{working:'received-working.json',html:'received-working.html',request:'workbook-apply-request.json'}};
}
async function applicationFor(folder,options){
 need(EVENT_ID.test(options.actionId??''),'ORIGINAL_APPLY_ACTION_REQUIRED');
 const application=join(folder,'applications',options.actionId);await directory(application);
 const selection=await json(join(application,'selection.json'),65536);
 need(selection.schema===EVENT_COLLEAGUE_COURSE&&selection.action_id===options.actionId,'ORIGINAL_APPLY_SELECTION_CHANGED');
 if(options.stageId!==undefined)need(options.stageId===selection.stage_id,'ORIGINAL_STAGE_CHANGED');
 const s=await savedStage(folder,{...options,stageId:selection.stage_id});
 const result=reviews.applyReturn(s.staged,s.returned,selection.decision),
 saved=reopen(await json(join(application,'received-working.json')),s.original);
 need(same(saved,result),'RECEIVED_WORKBOOK_CHANGED');await checkHTML(application,'received-working.html');
 const helper={...options,directory:application,workingPath:join(application,'received-working.json'),
  note:selection.native_note,reviewSourceId:selection.review_source_id};
 const prepared=await reopenNativeAnalysisEventWorkbookReview(helper);
 need(same(prepared.working,result),'ORIGINAL_NATIVE_WORKING_CHANGED');
 return {application,selection,result,helper,prepared,...s};
}
/** Dispatch only on explicit parent action; repeat uses the same retained native request. */
export async function applyEventWorkbookColleagueCourse(options={}){
 flag(options);const folder=await localRoot(options),a=await applicationFor(folder,options);
 return {...await applyNativeAnalysisEventWorkbookReview(a.helper),course_directory:folder};
}
/** After a lost reply, observe the original saved action without another mutation. */
export async function receiveEventWorkbookColleagueApply(options={}){
 const folder=await localRoot(options),a=await applicationFor(folder,options);
 return {...await receiveNativeAnalysisEventWorkbookReview(a.helper),course_directory:folder};
}
async function accepted(folder,options){
 const a=await applicationFor(folder,options);
 need(EVENT_HASH.test(options.applyRecordSha256??''),'ACCEPTED_APPLY_RECORD_REQUIRED');
 const result=await reopenNativeAnalysisEventWorkbookReview({...a.helper,recordSha256:options.applyRecordSha256});
 need(result.state==='COMPLETE'&&result.action.result?.state==='APPLIED'&&
 result.action.result.workspace_id===options.expectedWorkspaceId&&result.action.result.programme===options.programme&&
 result.action.result.accepted?.operation_id===a.original.proposal.operation_id&&
 result.action.result.accepted?.review_sha256===a.original.proposal.review_sha256,
 'ACCEPTED_ORIGINAL_APPLY_REQUIRED');
 return {...a,accepted:result};
}
async function deliverySelection(folder,options,create=false){
 const a=await accepted(folder,options);
 need(EVENT_ID.test(options.deliveryId??'')&&options.deliveryId!==options.actionId&&options.deliveryId!==options.proposalActionId&&
 options.deliveryId!==a.original.proposal.operation_id,'SEPARATE_DELIVERY_ACTION_REQUIRED');
 const parent=create?await child(folder,'deliveries'):join(folder,'deliveries');
 const delivery=create?await child(parent,options.deliveryId):join(parent,options.deliveryId);
 await directory(delivery);
 const selected={schema:EVENT_COLLEAGUE_COURSE,action_id:options.actionId,
  apply_record_sha256:options.applyRecordSha256,delivery_id:options.deliveryId,
  analysisWorkspace:options.analysisWorkspace,workspace_id:options.expectedWorkspaceId,
  programme:options.programme,operation_id:a.original.proposal.operation_id,
  review_sha256:a.original.proposal.review_sha256};
 if(create)await save(join(delivery,'selection.json'),selected);
 else need(same(await json(join(delivery,'selection.json'),65536),selected),'ORIGINAL_DELIVERY_SELECTION_CHANGED');
 return {...a,delivery,selected};
}
/** Start/resume the original engine's fresh archive operation after a complete accepted Apply. */
export async function startEventWorkbookColleagueDelivery(options={}){
 const continuation=flag(options),folder=await localRoot(options),d=await deliverySelection(folder,options,true),
 client=await nativeEventConnection(options);
 const overview=await client.call('event-overview',{limit:1,programme_limit:1},{signal:options.signal});
 need(overview.workspace_id===options.expectedWorkspaceId,'ORIGINAL_WORKSPACE_CHANGED');
 const summary=await client.call('event-deliver',{programme:options.programme,id:options.deliveryId,
  operation_id:d.selected.operation_id,...continuation},{signal:options.signal});
 return saveDeliveryAction(folder,d,options,client,summary);
}
async function saveDeliveryAction(folder,d,options,client,summary){
 const record=summary?.complete_record;
 need(record?.kind==='action'&&record.record_id===options.deliveryId&&
 record.workspace_id===options.expectedWorkspaceId,'COMPLETE_DELIVERY_ACTION_REQUIRED');
 const full=await readNativeAnalysisEventRecord({client,record,signal:options.signal}),action=decode(full.bytes);
 need(action.id===options.deliveryId&&action.workspace_id===options.expectedWorkspaceId&&
 action.programme===options.programme&&same(action.request,{action:'deliver',operation_id:d.selected.operation_id}),
 'ORIGINAL_DELIVERY_ACTION_CHANGED');
 const records=await child(d.delivery,'action-records');
 await retain(join(records,record.sha256+'.json'),full.bytes,{resume:true});
 await save(join(records,record.sha256+'.record.json'),record);
 return {schema:EVENT_COLLEAGUE_COURSE,state:action.status,directory:folder,delivery_id:options.deliveryId,
  action,record,delivery_directory:d.delivery};
}
/** Observe asynchronous delivery, then receive every indexed file through the maintained writer. */
export async function receiveEventWorkbookColleagueDelivery(options={}){
 const folder=await localRoot(options),d=await deliverySelection(folder,options),
 client=await nativeEventConnection(options),summary=await client.call('event-action',{id:options.deliveryId},{signal:options.signal}),
 result=await saveDeliveryAction(folder,d,options,client,summary);
 if(result.state!=='COMPLETE')return result;
 const review=await inspectNativeAnalysisEventDelivery({...options,client});
 need(review.index.workspace_id===options.expectedWorkspaceId&&
 review.index.accepted_operation_id===d.selected.operation_id&&review.index.review_sha256===d.selected.review_sha256,
 'ACCEPTED_DELIVERY_LINEAGE_CHANGED');
 await save(join(d.delivery,'index-review.json'),review);
 const target=join(d.delivery,'complete'),download=await downloadNativeAnalysisEventDelivery({...options,client,
  directory:target,expectedIndexSha256:review.index.index_sha256});
 const reopened=await reopenNativeAnalysisEventDelivery({...options,directory:target,
  expectedIndexSha256:review.index.index_sha256});
 await save(join(d.delivery,'complete-result.json'),{
  schema:EVENT_COLLEAGUE_COURSE,selection:d.selected,record:result.record,index:review.index,
  files:reopened.files,bytes:reopened.bytes,archive_sha256:reopened.workspaceArchiveSha256});
 return {...result,state:'COMPLETE',download,reopened};
}
/** Cold receiving from only this retained directory, without original producer files or host. */
export async function reopenEventWorkbookColleagueCourse(options={}){
 const folder=await localRoot(options),a=await applicationFor(folder,options);
 let result={schema:EVENT_COLLEAGUE_COURSE,state:'PREPARED',directory:folder,
  assignment_id:a.envelope.assignment.id,stage_id:a.selection.stage_id,
  action_id:options.actionId,working:a.result,preview:a.preview,prepared:a.prepared};
 if(options.applyRecordSha256!==undefined){
  const original=await accepted(folder,options);result={...result,state:'APPLIED',accepted:original.accepted};
 }
 if(options.deliveryId!==undefined){
  const d=await deliverySelection(folder,options),completed=await json(join(d.delivery,'complete-result.json')),
  review=await json(join(d.delivery,'index-review.json'));
  need(same(completed.selection,d.selected)&&same(completed.index,review.index),'COMPLETE_DELIVERY_CHANGED');
  const record=completed.record;
  need(record?.kind==='action'&&record.record_id===options.deliveryId&&record.workspace_id===options.expectedWorkspaceId&&
   EVENT_HASH.test(record.sha256??''),'ORIGINAL_DELIVERY_RECORD_CHANGED');
  const recorded=await json(join(d.delivery,'action-records',record.sha256+'.record.json'),4096),
   raw=await bytes(join(d.delivery,'action-records',record.sha256+'.json'),EVENT_MAX_RECORD);
  need(same(recorded,record)&&raw.length===record.bytes&&sha(raw)===record.sha256,'ORIGINAL_DELIVERY_RECORD_CHANGED');
  const action=decode(raw);
  need(action.status==='COMPLETE'&&action.id===options.deliveryId&&action.workspace_id===options.expectedWorkspaceId&&
   action.programme===options.programme&&same(action.request,{action:'deliver',operation_id:d.selected.operation_id}),
   'ORIGINAL_DELIVERY_ACTION_CHANGED');
  need(review.index.workspace_id===options.expectedWorkspaceId&&review.index.accepted_operation_id===d.selected.operation_id&&
   review.index.review_sha256===d.selected.review_sha256,'ACCEPTED_DELIVERY_LINEAGE_CHANGED');
  const reopened=await reopenNativeAnalysisEventDelivery({...options,directory:join(d.delivery,'complete'),
   expectedIndexSha256:review.index.index_sha256});
  need(completed.files===reopened.files&&completed.bytes===reopened.bytes&&
   completed.archive_sha256===reopened.workspaceArchiveSha256,'COMPLETE_DELIVERY_CHANGED');
  result={...result,state:'COMPLETE',delivery:reopened,delivery_action:action};
 }
 return result;
}
