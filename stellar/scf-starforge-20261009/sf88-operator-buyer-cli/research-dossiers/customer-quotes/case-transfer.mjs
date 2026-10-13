// MIT. Complete native case editions travel with their original case and commercial history.
import {digest} from '../../node/store.mjs';
import {parseWorkspace,serializeWorkspace,workspaceDraft,MAX_WORKSPACE_BYTES} from '../../../sf74-merchant-support-console/workspace-file.mjs';
import {parseRuntime,MAX_RUNTIME_BYTES} from '../../../sf74-merchant-support-console/runtime-support.mjs';
import {caseMetadata} from '../../../sf74-merchant-support-console/case-store.mjs';
import {mergeCommissioningHistory} from '../../../sf74-merchant-support-console/commissioning.mjs';
import {mergeServiceHistory} from '../../../sf74-merchant-support-console/service-commitments.mjs';
import {QUOTE_CASE_TRANSFER_LIMIT,fields,id,hash,need,copy,same,fingerprint} from './contracts.mjs';

export const RESEARCH_CASE_TRANSFER_SCHEMA='sf88-research-case-transfer/v1';
const stableKeys=['id','revision','previousRevision','name','createdAt','updatedAt','metadata','inputs','sources',
 'workspaceBytes','runtimeSupport','workspaceText','supportText','workspaceSha256','supportSha256'];
const sourceKeys=['workspaceId','casesWorkspaceId','caseId','revision'];
const missing=error=>error?.code==='CASE_NOT_FOUND'||error?.code==='ENOENT';
const bytes=text=>Buffer.byteLength(text,'utf8');
function time(value){
 need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,
  'RESEARCH_CASE_TRANSFER_TIME_INVALID');return value;
}
function sourceIdentity(value){
 fields(value,sourceKeys);need(/^research_[a-f0-9]{64}$/.test(value.workspaceId??''),'RESEARCH_CASE_TRANSFER_WORKSPACE_INVALID');
 hash(value.casesWorkspaceId);id(value.caseId);hash(value.revision);return copy(value);
}
function jsonSnapshot(value){
 // Serialize immediately: no caller-owned nested object survives the first await.
 let text;
 try{text=JSON.stringify(value);}catch{need(false,'RESEARCH_CASE_TRANSFER_JSON_INVALID');}
 need(typeof text==='string'&&bytes(text)<=QUOTE_CASE_TRANSFER_LIMIT,'RESEARCH_CASE_TRANSFER_TOO_LARGE',413);
 return JSON.parse(text);
}
function packetShape(value){
 fields(value,['schema','source','case','sha256']);
 need(value.schema===RESEARCH_CASE_TRANSFER_SCHEMA,'RESEARCH_CASE_TRANSFER_REQUIRED');
 sourceIdentity(value.source);hash(value.sha256);fields(value.case,stableKeys);
 id(value.case.id);hash(value.case.revision);
 need(value.case.id===value.source.caseId&&value.case.revision===value.source.revision,'RESEARCH_CASE_TRANSFER_SOURCE_CHANGED',409);
 if(value.case.previousRevision!==null)hash(value.case.previousRevision);
 need(value.case.previousRevision!==value.case.revision,'RESEARCH_CASE_TRANSFER_REVISION_INVALID');
 time(value.case.createdAt);time(value.case.updatedAt);
 need(Date.parse(value.case.createdAt)<=Date.parse(value.case.updatedAt),'RESEARCH_CASE_TRANSFER_TIME_INVALID');
 need(typeof value.case.workspaceText==='string'&&bytes(value.case.workspaceText)>0&&
  bytes(value.case.workspaceText)<=MAX_WORKSPACE_BYTES,'RESEARCH_CASE_TRANSFER_WORKSPACE_TOO_LARGE',413);
 need(value.case.supportText===null||typeof value.case.supportText==='string'&&bytes(value.case.supportText)>0&&
  bytes(value.case.supportText)<=MAX_RUNTIME_BYTES,'RESEARCH_CASE_TRANSFER_SUPPORT_TOO_LARGE',413);
 hash(value.case.workspaceSha256);if(value.case.supportSha256!==null)hash(value.case.supportSha256);
 return value;
}
/** Capture the full original request synchronously; native validation happens before review. */
export function caseTransferInput(value){
 const selected=jsonSnapshot(value);
 fields(selected,['requestId','caseId','expectedRevision','source']);
 id(selected.requestId);id(selected.caseId);if(selected.expectedRevision!==null)hash(selected.expectedRevision);
 packetShape(selected.source);
 need(selected.caseId===selected.source.source.caseId,'RESEARCH_CASE_TRANSFER_CASE_CHANGED',409);
 return selected;
}
/** Small retained operation identity; complete input remains in its original private files. */
export function caseTransferSelection(value){
 fields(value,['requestId','caseId','expectedRevision','source']);
 const selected=value;id(selected.requestId);id(selected.caseId);if(selected.expectedRevision!==null)hash(selected.expectedRevision);
 const {sha256,...content}=packetShape(selected.source);
 need(selected.caseId===selected.source.source.caseId&&fingerprint(content)===sha256,'RESEARCH_CASE_TRANSFER_SOURCE_CHANGED',409);
 return {requestId:selected.requestId,caseId:selected.caseId,expectedRevision:selected.expectedRevision,
  source:sourceIdentity(selected.source.source),sourceSha256:selected.source.sha256};
}
export function validateCaseTransferSelection(value){
 fields(value,['requestId','caseId','expectedRevision','source','sourceSha256']);
 id(value.requestId);id(value.caseId);if(value.expectedRevision!==null)hash(value.expectedRevision);
 const source=sourceIdentity(value.source);hash(value.sourceSha256);
 need(value.caseId===source.caseId,'RESEARCH_CASE_TRANSFER_CASE_CHANGED',409);
 return {...copy(value),source};
}
/** Pure inspection uses the original workspace/runtime validators and unchanged source text. */
export async function inspectResearchCaseTransfer(value){
 const packet=packetShape(jsonSnapshot(value)),record=packet.case,{sha256,...content}=packet;
 need(fingerprint(content)===sha256,'RESEARCH_CASE_TRANSFER_SOURCE_CHANGED',409);
 const metadata=caseMetadata(record.metadata);
 need(same(metadata,record.metadata),'RESEARCH_CASE_TRANSFER_METADATA_CHANGED');
 const workspace=await parseWorkspace(record.workspaceText);
 need(record.workspaceBytes===bytes(record.workspaceText)&&record.workspaceSha256===digest(Buffer.from(record.workspaceText))&&
  record.name===workspace.name&&same(record.inputs,workspace.inputs)&&same(record.sources,workspace.summary),
  'RESEARCH_CASE_TRANSFER_WORKSPACE_CHANGED',409);
 if(record.supportText===null){
  need(record.supportSha256===null&&record.runtimeSupport===null,'RESEARCH_CASE_TRANSFER_SUPPORT_CHANGED',409);
 }else{
  const runtime=parseRuntime(record.supportText);
  need(record.supportSha256===digest(Buffer.from(record.supportText))&&same(record.runtimeSupport,runtime.summary),
   'RESEARCH_CASE_TRANSFER_SUPPORT_CHANGED',409);
 }
 return packet;
}
export async function exportResearchCaseTransfer(record,{workspaceId,casesWorkspaceId}={}){
 // Selecting a historical revision must not embed its mutable current head.
 const snapshot=copy(record),selected=Object.fromEntries(stableKeys.filter(key=>!['workspaceSha256','supportSha256'].includes(key))
  .map(key=>[key,snapshot[key]]));
 selected.workspaceSha256=digest(Buffer.from(selected.workspaceText));
 selected.supportSha256=selected.supportText===null?null:digest(Buffer.from(selected.supportText));
 const content={schema:RESEARCH_CASE_TRANSFER_SCHEMA,
  source:{workspaceId,casesWorkspaceId,caseId:selected.id,revision:selected.revision},case:selected};
 return inspectResearchCaseTransfer({...content,sha256:fingerprint(content)});
}
/** Build the exact candidate using the same two native history mergers as CaseStore.save. */
export async function previewResearchCaseTransfer(packet,current=null){
 const incoming=copy(packet.case),before=current===null?null:copy(current);
 let workspace=await parseWorkspace(incoming.workspaceText),workspaceText=incoming.workspaceText;
 let commissioningChanged=false,serviceChanged=false;
 if(before&&(before.sources?.commissioning||workspace.commissioning||before.sources?.service||workspace.service)){
  const retained=await parseWorkspace(before.workspaceText);
  const commissioning=await mergeCommissioningHistory(workspace.commissioning,retained.commissioning);
  const service=await mergeServiceHistory(workspace.service,retained.service);
  commissioningChanged=JSON.stringify(commissioning)!==JSON.stringify(workspace.commissioning??null);
  serviceChanged=JSON.stringify(service)!==JSON.stringify(workspace.service);
  if(commissioningChanged||serviceChanged){
   workspaceText=await serializeWorkspace(workspaceDraft(workspace,{commissioning,service}),{now:workspace.savedAt});
   workspace=await parseWorkspace(workspaceText);
  }
 }
 return {workspaceText,supportText:incoming.supportText,metadata:caseMetadata(incoming.metadata),
  workspaceSha256:digest(Buffer.from(workspaceText)),supportSha256:incoming.supportSha256,
  name:workspace.name,sources:copy(workspace.summary),commissioningChanged,serviceChanged};
}
export function researchCaseIdentity(record){
 return {id:record.id,revision:record.revision,currentRevision:record.currentRevision,name:record.name,
  metadata:copy(record.metadata),workspaceSha256:digest(Buffer.from(record.workspaceText)),
  supportSha256:record.supportText===null?null:digest(Buffer.from(record.supportText))};
}
export async function readResearchTransferTarget(store,caseId){
 try{return await store.read(caseId);}catch(error){if(missing(error))return null;throw error;}
}
export function assertResearchTransferRevision(record,expectedRevision){
 const currentRevision=record?.revision??null;
 need(currentRevision===expectedRevision,'RESEARCH_CASE_TRANSFER_TARGET_CHANGED',409);
}
/** Recover the exact native child (or unchanged selected head), including after later edits. */
export async function findResearchCaseTransfer(store,{caseId,expectedRevision,workspaceSha256,supportSha256,metadata}){
 let page;
 try{page=await store.history(caseId,{limit:100});}catch(error){if(missing(error))return null;throw error;}
 const visited=new Set();
 for(;;){
  need(Array.isArray(page.revisions)&&page.revisions.length<=100,'RESEARCH_CASE_TRANSFER_HISTORY_CHANGED',409);
  for(const entry of page.revisions){
   hash(entry.revision);need(!visited.has(entry.revision),'RESEARCH_CASE_TRANSFER_HISTORY_CHANGED',409);
   visited.add(entry.revision);need(visited.size<=100000,'RESEARCH_CASE_TRANSFER_HISTORY_LIMIT',413);
   // A matching ancestor from before the selected target is not this receive.
   if(entry.revision!==expectedRevision&&entry.previousRevision!==expectedRevision)continue;
   const record=await store.read(caseId,entry.revision),identity=researchCaseIdentity(record);
   if(identity.workspaceSha256===workspaceSha256&&identity.supportSha256===supportSha256&&same(record.metadata,metadata))
    return identity;
  }
  if(page.nextBefore===null)return null;
  hash(page.nextBefore);need(!visited.has(page.nextBefore),'RESEARCH_CASE_TRANSFER_HISTORY_CHANGED',409);
  page=await store.history(caseId,{before:page.nextBefore,limit:100});
 }
}
