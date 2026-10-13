// MIT. Explicit author adoption over retained, fully validated Research return sources.
import {need,object,jsonBytes} from '../../node/store.mjs';
import {fields,id,ids,actor,time,text,clone,hash} from './contracts.mjs';
export const ADOPTION_SCHEMA='sf88-research-comparison-adoption/v1';
export const ADOPTION_REQUEST_LIMIT=2*1024*1024;
export const ADOPTION_PLAN_LIMIT=4*1024*1024;
export const ADOPTION_SECTIONS=Object.freeze(['cases','candidates','runs','judgments','decisions','sources']);
export const adoptionEvents=state=>state.comparisonAdoptionEvents??[];
export function sha(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'ADOPTION_SHA_INVALID');return value;}
export function adoptionRequest(input,{review=false}={}){
 fields(input,['requestId','expectedRevision','actor','reviewedAt','reviewNote','sourceId','caseVersionId','selection','caseTarget','candidateTargets','continuationOf',...(review?['previewSha256']:[])],'ADOPTION_FIELDS_INVALID');
 need(jsonBytes(input).length<=ADOPTION_REQUEST_LIMIT,'ADOPTION_REQUEST_TOO_LARGE');
 need(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>0,'REVISION_INVALID');
 const common={requestId:id(input.requestId),expectedRevision:input.expectedRevision,actor:actor(input.actor),
 reviewedAt:time(input.reviewedAt),reviewNote:text(input.reviewNote,'ADOPTION_REVIEW_NOTE_REQUIRED',40000)};
 let request;
 if(input.continuationOf!==undefined){
  need(['sourceId','caseVersionId','selection','caseTarget','candidateTargets'].every(k=>!Object.hasOwn(input,k)),'ADOPTION_CONTINUATION_FIELDS_INVALID');
  request={...common,continuationOf:id(input.continuationOf)};
 }else{
  fields(input.selection,['candidateVersionIds','runIds','judgmentVersionIds','decisionVersionIds'],'ADOPTION_SELECTION_INVALID');
  const selection=Object.fromEntries(['candidateVersionIds','runIds','judgmentVersionIds','decisionVersionIds'].map(k=>[k,ids(input.selection[k]??[]).sort()]));
  need(Object.values(selection).reduce((n,v)=>n+v.length,0)<=1000,'ADOPTION_SELECTION_TOO_LARGE');
  fields(input.caseTarget,['mode','caseId','caseVersionId'],'ADOPTION_CASE_TARGET_INVALID');
  const t=input.caseTarget;need(['NEW_CASE','NEW_PROTOCOL','EXISTING'].includes(t.mode),'ADOPTION_CASE_TARGET_INVALID');
  let caseTarget={mode:t.mode};
  if(t.mode==='NEW_CASE')need(!Object.hasOwn(t,'caseId')&&!Object.hasOwn(t,'caseVersionId'),'ADOPTION_CASE_TARGET_INVALID');
  else caseTarget={...caseTarget,caseId:id(t.caseId),caseVersionId:id(t.caseVersionId)};
  need(Array.isArray(input.candidateTargets)&&input.candidateTargets.length<=1000,'ADOPTION_CANDIDATE_TARGETS_INVALID');
  const candidateTargets=input.candidateTargets.map(t=>{
   fields(t,['sourceVersionId','mode','targetVersionId'],'ADOPTION_CANDIDATE_TARGET_INVALID');
   need(['NEW','EXISTING'].includes(t.mode),'ADOPTION_CANDIDATE_TARGET_INVALID');
   const row={sourceVersionId:id(t.sourceVersionId),mode:t.mode};
   if(t.mode==='EXISTING')row.targetVersionId=id(t.targetVersionId);
   else need(!Object.hasOwn(t,'targetVersionId'),'ADOPTION_CANDIDATE_TARGET_INVALID');
   return row;
  }).sort((a,b)=>a.sourceVersionId.localeCompare(b.sourceVersionId));
  need(new Set(candidateTargets.map(t=>t.sourceVersionId)).size===candidateTargets.length,'ADOPTION_CANDIDATE_TARGET_DUPLICATE');
  need(typeof input.sourceId==='string'&&/^drs_[a-f0-9]{64}$/.test(input.sourceId),'ADOPTION_SOURCE_ID_INVALID');
  request={...common,sourceId:input.sourceId,caseVersionId:id(input.caseVersionId),selection,caseTarget,candidateTargets};
 }
 if(review)return{request,previewSha256:sha(input.previewSha256)};
 return request;
}
export function planId(dossierId,requestId){return'cmpadopt_'+hash({dossierId,requestId});}
export function pageOptions({offset=0,limit=50}={}){
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=200,'ADOPTION_PAGE_INVALID');
 return{offset,limit};
}
export function page(items,options={}){
 const {offset,limit}=pageOptions(options),end=Math.min(items.length,offset+limit);
 return{items:clone(items.slice(offset,end)),total:items.length,offset,limit,nextOffset:end<items.length?end:null,complete:end>=items.length};
}
export const envelope=(state,value)=>({schema:ADOPTION_SCHEMA,dossierId:state.id,revision:state.revision,...value});
export const findPlan=(state,selected)=>adoptionEvents(state).find(p=>p.id===selected)??null;
export function normalizePlan(value){
 need(object(value)&&value.schema===ADOPTION_SCHEMA&&typeof value.id==='string'&&object(value.request),'ADOPTION_PLAN_INVALID');
 const request=adoptionRequest(value.request);
 need(hash(request)===hash(value.request)&&value.id===planId(value.dossierId,request.requestId),'ADOPTION_PLAN_CHANGED');
 need(value.committedRevision===request.expectedRevision+1&&value.base.revision===request.expectedRevision,'ADOPTION_PLAN_REVISION_INVALID');
 const {previewSha256,requestSha256,...core}=value;
 need(sha(previewSha256)===hash(core)&&sha(requestSha256)===hash({...request,previewSha256}),'ADOPTION_PLAN_CHANGED');
 need(jsonBytes(value).length<=ADOPTION_PLAN_LIMIT,'ADOPTION_PLAN_TOO_LARGE');
 return value;
}
