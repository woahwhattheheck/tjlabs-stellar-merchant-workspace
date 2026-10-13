// MIT. Returned comparison adoption uses the original Research connection and request history.
import {need,object} from '../../node/store.mjs';
import {hash,same} from './contracts.mjs';
import {ADOPTION_SCHEMA,adoptionRequest,normalizePlan} from './adoption-contracts.mjs';
const path=id=>{need(typeof id==='string'&&/^d_[a-f0-9-]{36}$/.test(id),'DOSSIER_ID_INVALID');return'/api/dossiers/'+encodeURIComponent(id)+'/comparison';};
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
const query=value=>{const p=new URLSearchParams();for(const [k,v]of Object.entries(value))if(v!==undefined&&v!==null)p.set(k,String(v));return p.size?'?'+p:'';};
function result(value,id,revision){
 need(object(value)&&value.schema===ADOPTION_SCHEMA&&value.dossierId===id&&Number.isSafeInteger(value.revision)&&value.revision>=1,'ADOPTION_RESPONSE_IDENTITY_CHANGED');
 need(revision===undefined||value.revision===revision,'ADOPTION_RESPONSE_REVISION_CHANGED');return value;
}
function page(value,options){
 need(Array.isArray(value.items)&&Number.isSafeInteger(value.total)&&value.total>=0&&Number.isSafeInteger(value.offset)&&value.offset>=0&&Number.isSafeInteger(value.limit)&&value.limit>=1&&typeof value.complete==='boolean','ADOPTION_PAGE_CHANGED');
 need(value.offset===(options.offset??0)&&value.items.length<=value.limit&&(value.offset>=value.total?value.items.length===0:value.offset+value.items.length<=value.total),'ADOPTION_PAGE_CHANGED');
 need(value.complete?(value.nextOffset===null&&value.offset+value.items.length>=value.total):(value.nextOffset===value.offset+value.items.length&&value.nextOffset>value.offset),'ADOPTION_PAGE_CHANGED');return value;
}
function acceptance(value,id,request){
 result(value,id);normalizePlan(value.plan);
 need(value.requestId===request.requestId&&typeof value.planId==='string'&&['COMPLETE','NEEDS_REVIEW','SUPERSEDED'].includes(value.status)&&typeof value.duplicate==='boolean'&&object(value.plan)&&object(value.progress)&&Array.isArray(value.progress.operations),'ADOPTION_ACCEPTANCE_CHANGED');
 need(same(value.plan.request,request)&&value.plan.id===value.planId,'ADOPTION_ORIGINAL_REQUEST_CHANGED');
 need(Number.isSafeInteger(value.progress.completed)&&Number.isSafeInteger(value.progress.total)&&value.progress.completed>=0&&value.progress.total>=value.progress.completed&&value.progress.operations.length===value.progress.completed&&value.progress.total===value.plan.steps.length,'ADOPTION_PROGRESS_CHANGED');
 return value;
}
export function createComparisonAdoptionClient({request,download}){
 need(typeof request==='function'&&typeof download==='function','ADOPTION_TRANSPORT_REQUIRED');
 return Object.freeze({
 async comparisonAdoptions(id,options={}){
  return page(result(await request(path(id)+'/adoptions'+query(pick(options,['revision','offset','limit'])),undefined,pick(options,['signal'])),id,options.revision),options);
 },
 async comparisonAdoptionSource(id,options={}){
  need(typeof options.sourceId==='string','ADOPTION_SOURCE_REQUIRED');
  const value=page(result(await request(path(id)+'/adoption/source'+query(pick(options,['sourceId','revision','caseVersionId','section','offset','limit'])),undefined,pick(options,['signal'])),id,options.revision),options);
  need(value.source?.id===options.sourceId&&(options.caseVersionId===undefined||value.case?.versionId===options.caseVersionId),'ADOPTION_SOURCE_RESPONSE_CHANGED');return value;
 },
 async previewComparisonAdoption(id,input,options={}){
  const normalized=adoptionRequest(input);
  const value=result(await request(path(id)+'/adoption/preview',normalized,{...pick(options,['signal']),readOnly:true}),id,normalized.expectedRevision);
  need(typeof value.eligible==='boolean'&&Array.isArray(value.issues)&&(value.eligible?/^[a-f0-9]{64}$/.test(value.previewSha256??''):value.previewSha256===null)&&object(value.plan)&&same(value.plan.request,normalized),'ADOPTION_PREVIEW_CHANGED');
  if(value.eligible)need(hash(value.plan)===value.previewSha256,'ADOPTION_PREVIEW_CHANGED');return value;
 },
 async reviewComparisonAdoption(id,input,options={}){
  const {request:original,previewSha256}=adoptionRequest(input,{review:true}),body={...original,previewSha256};
  try{
   const value=acceptance(await request(path(id)+'/adoption/reviews',body,pick(options,['signal'])),id,original);
   need(value.plan.previewSha256===previewSha256&&value.plan.requestSha256===hash(body),'ADOPTION_ORIGINAL_REQUEST_CHANGED');return value;
  }
  catch(error){
   // Response-shape failures occur after a potentially accepted native course.
   // Keep the exact original request for readback, never mint a replacement.
   if(!Number.isInteger(error.status)&&(error.code?.startsWith('ADOPTION_')||error.outcomeUnknown))Object.assign(error,{outcomeUnknown:true});
   Object.assign(error,{requestId:original.requestId,requestSha256:hash(body),dossierId:id,recovery:'Read this same adoption by requestId; receive its accepted native prefix before any reviewed continuation.'});throw error;
  }
 },
 async comparisonAdoption(id,options={}){
  need(Boolean(options.planId)!==Boolean(options.requestId),'ADOPTION_LOOKUP_REQUIRED');
  const value=result(await request(path(id)+'/adoption'+query(pick(options,['planId','requestId','revision'])),undefined,pick(options,['signal'])),id,options.revision);
  need(value.adoption===null||object(value.adoption),'ADOPTION_LOOKUP_CHANGED');
  if(value.adoption!==null){
   need(options.planId===undefined||value.adoption.planId===options.planId,'ADOPTION_LOOKUP_CHANGED');
   need(options.requestId===undefined||value.adoption.requestId===options.requestId,'ADOPTION_LOOKUP_CHANGED');
   acceptance(value.adoption,id,value.adoption.plan.request);
  }return value;
 },
 async comparisonAdoptionFile(id,{file,...options}={}){
  need(typeof options.sourceId==='string'&&typeof options.runId==='string','ADOPTION_FILE_SELECTION_REQUIRED');
  const value=await download(path(id)+'/adoption/file'+query(pick(options,['sourceId','runId','artifactId','revision'])),file,{...pick(options,['signal','expectedSha256']),verifySha256Header:true});
  try{need(options.revision===undefined||value.revision===options.revision,'ADOPTION_RESPONSE_REVISION_CHANGED');}
  catch(error){Object.assign(error,{file:value,destinationPublished:true});throw error;}return value;
 },
 async exportComparisonAdoption(id,{file,...options}={}){
  need(typeof options.planId==='string','ADOPTION_LOOKUP_REQUIRED');
  const format=options.format??'json';need(['json','html','source'].includes(format),'ADOPTION_EXPORT_FORMAT_INVALID');
  const value=await download(path(id)+'/adoption/export'+query({...pick(options,['planId','revision']),format}),file,{...pick(options,['signal','expectedSha256']),verifySha256Header:true});
  try{need(options.revision===undefined||value.revision===options.revision,'ADOPTION_RESPONSE_REVISION_CHANGED');}
  catch(error){Object.assign(error,{file:value,destinationPublished:true});throw error;}
  return value;
 }
 });
}
