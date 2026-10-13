// SPDX-License-Identifier: MIT
// Adoption working copies use the maintained transactional browser store.
import {openProtocolDraftStore} from './study-protocol-storage.js';

export const ADOPTION_DRAFT='sf88-comparison-adoption-browser/v1';
export const ADOPTION_RECORD='sf88-comparison-adoption-browser-record/v1';
export const ADOPTION_WORKING_COPY='sf88-comparison-adoption-working-copy/v1';
const copy=value=>structuredClone(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const adoptionSame=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const bytes=value=>new TextEncoder().encode(JSON.stringify(canonical(value))+'\n');
const need=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{code});};
const digest=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(value=>value.toString(16).padStart(2,'0')).join('');
export function adoptionPrefix({workspaceId,dossierId}){
  need(typeof workspaceId==='string'&&workspaceId&&typeof dossierId==='string'&&dossierId,'ADOPTION_BROWSER_CONTEXT_REQUIRED');
  return 'comparison-adoption:'+encodeURIComponent(workspaceId)+':'+encodeURIComponent(dossierId)+':';
}
export function adoptionProposal(draft,{requestId,reviewedAt}){
  const f=draft.form,common={requestId,expectedRevision:draft.basis.revision,actor:copy(f.actor),reviewedAt,reviewNote:f.reviewNote};
  if(f.continuationOf)return {...common,continuationOf:f.continuationOf};
  return {...common,sourceId:draft.basis.sourceId,caseVersionId:draft.basis.caseVersionId,
    selection:Object.fromEntries(Object.entries(f.selection).map(([key,items])=>[key,[...items].sort()])),
    caseTarget:copy(f.caseTarget),candidateTargets:f.candidateTargets.filter(x=>f.selection.candidateVersionIds.includes(x.sourceVersionId)).map(copy).sort((a,b)=>a.sourceVersionId.localeCompare(b.sourceVersionId))};
}
function validateRelations(draft,records){
  const byId=new Map(records.map(row=>[row.id,row]));
  const get=(key,kind,required=false)=>{const id=draft[key];if(!id){need(!required,'ADOPTION_BROWSER_WORKING_COPY_INCOMPLETE');return null;}need(draft.refs.includes(id)&&byId.get(id)?.kind===kind,'ADOPTION_BROWSER_RECORD_BINDING');return byId.get(id).value;};
  const inspection=get('inspection','inspection',true),basis=draft.basis;
  need(plain(basis)&&inspection?.schema==='sf88-comparison-adoption-browser-inspection/v1'&&inspection.dossierId===draft.dossierId&&
    inspection.revision===basis.revision&&inspection.source?.id===basis.sourceId&&inspection.source.sha256===basis.sourceSha256&&
    inspection.case?.versionId===basis.caseVersionId&&adoptionSame(inspection.incomingHead,basis.incomingHead),'ADOPTION_BROWSER_INSPECTION_CHANGED');
  const f=draft.form,keys=['candidateVersionIds','runIds','judgmentVersionIds','decisionVersionIds'];
  need(plain(f.actor)&&typeof f.actor.id==='string'&&typeof f.actor.name==='string'&&typeof f.reviewNote==='string'&&
    plain(f.selection)&&Object.keys(f.selection).length===4&&keys.every(key=>Array.isArray(f.selection[key])&&f.selection[key].every(id=>typeof id==='string')&&new Set(f.selection[key]).size===f.selection[key].length)&&
    plain(f.caseTarget)&&Array.isArray(f.candidateTargets),'ADOPTION_BROWSER_FORM_INVALID');
  const proposal=get('proposal','proposal'),preview=get('preview','preview'),request=get('request','request');
  if(proposal)need(adoptionSame(proposal,adoptionProposal(draft,proposal)),'ADOPTION_BROWSER_PROPOSAL_CHANGED');
  if(preview)need(proposal&&preview.dossierId===draft.dossierId&&preview.revision===basis.revision&&
    typeof preview.eligible==='boolean'&&Array.isArray(preview.issues)&&adoptionSame(preview.plan?.request,proposal)&&
    (preview.eligible?/^[a-f0-9]{64}$/.test(preview.previewSha256??''):preview.previewSha256===null),'ADOPTION_BROWSER_PREVIEW_CHANGED');
  if(request)need(preview?.eligible&&adoptionSame(request,{...proposal,previewSha256:preview.previewSha256}),'ADOPTION_BROWSER_REQUEST_CHANGED');
  for(const key of ['result','receipt']){
    const result=get(key,'result');if(!result)continue;
    need(request&&result.dossierId===draft.dossierId&&result.requestId===request.requestId&&
      result.plan?.id===result.planId&&adoptionSame(result.plan.request,proposal)&&result.plan.previewSha256===request.previewSha256&&
      ['COMPLETE','NEEDS_REVIEW','SUPERSEDED'].includes(result.status)&&(key!=='receipt'||result.status==='COMPLETE'),'ADOPTION_BROWSER_RESULT_CHANGED');
  }
  for(const entry of draft.attempts)need(plain(entry)&&typeof entry.id==='string'&&typeof entry.kind==='string'&&(!entry.requestId||entry.requestId===request?.requestId),'ADOPTION_BROWSER_ATTEMPT_CHANGED');
}
export async function openAdoptionWorkingStore(context){
  const prefix=adoptionPrefix(context),database=await openProtocolDraftStore(),verifiedRecords=new Map();
  function validateDraft(value){
    need(plain(value)&&value.schema===ADOPTION_DRAFT&&typeof value.id==='string'&&value.id.startsWith(prefix+'draft:')&&
      value.workspaceId===context.workspaceId&&value.dossierId===context.dossierId&&typeof value.commitId==='string'&&
      Array.isArray(value.refs)&&Array.isArray(value.attempts)&&plain(value.form),'ADOPTION_BROWSER_DRAFT_INVALID');
    need(new Set(value.refs).size===value.refs.length&&value.refs.every(id=>typeof id==='string'&&id.startsWith(prefix+'record:')),'ADOPTION_BROWSER_RECORD_CONTEXT');
    return value;
  }
  async function validateRecord(value){
    need(plain(value)&&value.schema===ADOPTION_RECORD&&value.workspaceId===context.workspaceId&&value.dossierId===context.dossierId&&
      typeof value.kind==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value.kind)&&/^[a-f0-9]{64}$/.test(value.sha256),'ADOPTION_BROWSER_RECORD_INVALID');
    const body=bytes(value.value),sha256=await digest(body);
    need(value.bytes===body.length&&value.sha256===sha256&&value.commitId===sha256&&value.id===prefix+'record:'+value.kind+':'+sha256,'ADOPTION_BROWSER_RECORD_CHANGED');
    return value;
  }
  async function retain(kind,value){
    need(/^[a-z][a-z0-9-]{0,63}$/.test(kind),'ADOPTION_BROWSER_RECORD_KIND');
    const body=bytes(value),sha256=await digest(body);
    const record={schema:ADOPTION_RECORD,id:prefix+'record:'+kind+':'+sha256,commitId:sha256,workspaceId:context.workspaceId,dossierId:context.dossierId,kind,bytes:body.length,sha256,value:copy(value)};
    const old=await database.read(record.id);
    if(old){await validateRecord(old.snapshot);need(adoptionSame(old.snapshot,record),'ADOPTION_BROWSER_RECORD_CHANGED');verifiedRecords.set(record.id,copy(record));return copy(old.snapshot);}
    try{await database.write(record,0);}catch(error){
      const actual=await database.read(record.id);
      if(!actual||!adoptionSame(actual.snapshot,record))throw error;
    }
    verifiedRecords.set(record.id,copy(record));return record;
  }
  async function record(id){
    need(typeof id==='string'&&id.startsWith(prefix+'record:'),'ADOPTION_BROWSER_RECORD_CONTEXT');
    if(verifiedRecords.has(id))return copy(verifiedRecords.get(id));
    const saved=await database.read(id);need(saved,'ADOPTION_BROWSER_RECORD_MISSING');
    const verified=await validateRecord(saved.snapshot);verifiedRecords.set(id,copy(verified));return copy(verified);
  }
  async function read(id){
    need(typeof id==='string'&&id.startsWith(prefix+'draft:'),'ADOPTION_BROWSER_DRAFT_CONTEXT');
    const saved=await database.read(id);if(!saved)return null;validateDraft(saved.snapshot);return copy(saved);
  }
  async function write(value,expectedRevision){
    const snapshot=copy(validateDraft(value)),old=await read(snapshot.id);
    if(old){
      const prior=old.snapshot;
      if(prior.request)need(adoptionSame(snapshot.request,prior.request),'ADOPTION_BROWSER_ORIGINAL_REQUEST_CHANGED');
      if(prior.receipt)need(adoptionSame(snapshot.receipt,prior.receipt),'ADOPTION_BROWSER_ORIGINAL_RECEIPT_CHANGED');
      need(prior.refs.every(id=>snapshot.refs.includes(id)),'ADOPTION_BROWSER_RETAINED_RECORD_REMOVED');
      need(snapshot.attempts.length>=prior.attempts.length&&prior.attempts.every((attempt,index)=>adoptionSame(attempt,snapshot.attempts[index])),'ADOPTION_BROWSER_ATTEMPT_HISTORY_CHANGED');
    }
    const retained=[];for(const id of snapshot.refs)retained.push(await record(id));
    validateRelations(snapshot,retained);
    return database.write(snapshot,expectedRevision);
  }
  async function list(){
    const rows=await database.listPrefix(prefix+'draft:');
    return rows.map(row=>{validateDraft(row.snapshot);return copy(row);});
  }
  async function workingCopy(value){
    const draft=copy(validateDraft(value)),records=[];
    for(const id of draft.refs)records.push(await record(id));
    validateRelations(draft,records);
    return {schema:ADOPTION_WORKING_COPY,workspaceId:context.workspaceId,dossierId:context.dossierId,draft,records};
  }
  async function inspectWorkingCopy(value){
    need(plain(value)&&value.schema===ADOPTION_WORKING_COPY&&value.workspaceId===context.workspaceId&&value.dossierId===context.dossierId&&Array.isArray(value.records),'ADOPTION_BROWSER_WORKING_COPY_CONTEXT');
    const draft=copy(validateDraft(value.draft)),ids=new Set();
    for(const item of value.records){await validateRecord(item);need(!ids.has(item.id),'ADOPTION_BROWSER_DUPLICATE_RECORD');ids.add(item.id);}
    need(ids.size===draft.refs.length&&draft.refs.every(id=>ids.has(id)),'ADOPTION_BROWSER_WORKING_COPY_INCOMPLETE');
    validateRelations(draft,value.records);
    return copy(value);
  }
  async function importWorkingCopy(value){
    const selected=await inspectWorkingCopy(value);
    for(const item of selected.records){const retained=await retain(item.kind,item.value);need(adoptionSame(retained,item),'ADOPTION_BROWSER_RECORD_CHANGED');}
    const old=await read(selected.draft.id);
    if(old&&adoptionSame(old.snapshot,selected.draft))return {record:old,separate:false,reused:true};
    const draft=copy(selected.draft);
    if(old){draft.importedFrom={id:draft.id,commitId:draft.commitId};draft.id=prefix+'draft:'+crypto.randomUUID();}
    draft.commitId=crypto.randomUUID();draft.updatedAt=new Date().toISOString();
    return {record:await write(draft,0),separate:Boolean(old),reused:false};
  }
  return Object.freeze({prefix,read,write,list,retain,record,workingCopy,inspectWorkingCopy,importWorkingCopy,close:()=>database.close()});
}
