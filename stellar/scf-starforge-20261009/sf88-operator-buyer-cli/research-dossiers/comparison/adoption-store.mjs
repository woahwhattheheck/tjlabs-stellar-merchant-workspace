// MIT. Durable adoption intents followed by the original comparison writer, one native event per revision.
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {need,object,digest,jsonBytes,BuyerError} from '../../node/store.mjs';
import {clone,hash,same,id} from './contracts.mjs';
import {comparisonModel} from './model.mjs';
import {returnSourceChunks} from '../dossier-returns/source.mjs';
import {ADOPTION_SCHEMA,ADOPTION_SECTIONS,adoptionRequest,adoptionEvents,findPlan,page,envelope,normalizePlan} from './adoption-contracts.mjs';
import {buildAdoptionPlan,finalizePlan,adoptionProgress,adoptionResult,adoptionTargets} from './adoption-model.mjs';
const kinds=['cases','candidates','runs','judgments','decisions'];
const sourceId=value=>{need(typeof value==='string'&&/^drs_[a-f0-9]{64}$/.test(value),'ADOPTION_SOURCE_ID_INVALID');return value;};
const resultDownload=(state,filename,contentType,body,extra={})=>{
 const bytes=Buffer.isBuffer(body)?body:Buffer.from(body,'utf8');
 return{revision:state.revision,filename,contentType,bytes:bytes.length,sha256:digest(bytes),body:bytes,...extra};
};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createComparisonAdoptionStore({dossierDirectory,head,history,commit,metadata,blob,sourceAdapter,comparisonStore,validateCapacity,validateCandidate}){
 for(const f of [dossierDirectory,head,history,commit,metadata,blob,validateCapacity,validateCandidate])need(typeof f==='function','ADOPTION_ORIGINAL_STORE_REQUIRED');
 need(sourceAdapter?.inspectSource&&sourceAdapter?.readSource&&comparisonStore?.reviewComparison,'ADOPTION_ORIGINAL_STORE_REQUIRED');
 const stateAt=async(id,{revision}={})=>(await head(id,revision)).state;
 async function sourceFor(dossierId,state,selected){
  sourceId(selected);
  const saved=adoptionEvents(state).find(p=>p.source.id===selected)?.source;
  return saved?clone(saved):sourceAdapter.readSource(dossierId,selected);
 }
 async function withSource(dossierId,state,source,work){
  const local=await history(dossierId);
  need(local.some(e=>e.state.revision===state.revision&&e.sha256===digest(jsonBytes(state))),'ADOPTION_AUTHOR_HISTORY_CHANGED');
  return sourceAdapter.inspectSource(dossierId,source,async branch=>{
   const shared=branch.pins.filter(p=>p.revision<=state.revision&&local[p.revision-1]?.sha256===p.sha256).at(-1);
   need(shared,'RETURN_NO_COMMON_ANCESTOR');
   return work(branch,{revision:shared.revision,sha256:shared.sha256});
  });
 }
 async function sources(dossierId,state){
  const result=new Map();
  for(const event of state.dossierReturnEvents??[])result.set(event.source.id,event.source);
  for(const p of adoptionEvents(state))result.set(p.source.id,p.source);
  let names=[];try{names=await readdir(join(dossierDirectory(dossierId),'returns','sources'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const name of names)if(/^drs_[a-f0-9]{64}\.json$/.test(name)){
   const key=name.slice(0,-5);
   if(!result.has(key))result.set(key,await sourceAdapter.readSource(dossierId,key));
  }
  return[...result.values()].sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.id.localeCompare(b.id)).map(clone);
 }
 async function comparisonAdoptions(dossierId,options={}){
  if((options.offset??0)>0)need(options.revision!==undefined,'RESEARCH_PAGE_REVISION_REQUIRED');
  const state=await stateAt(dossierId,options);
  const items=adoptionEvents(state).map(p=>{
   const progress=adoptionProgress(state,p);
   return{id:p.id,requestId:p.request.requestId,sourceId:p.source.id,caseId:p.case.id,caseVersionId:p.case.versionId,
    title:p.case.definition.title,committedRevision:p.committedRevision,actor:clone(p.request.actor),
    reviewedAt:p.request.reviewedAt,continuationOf:p.request.continuationOf??null,status:progress.status,
    completed:progress.completed,total:progress.total,successorPlanId:progress.successorPlanId};
  }).reverse();
  return envelope(state,{...page(items,options),sources:await sources(dossierId,state)});
 }
 async function comparisonAdoptionSource(dossierId,{sourceId:selected,caseVersionId,section='cases',revision,offset=0,limit=50}={}){
  need(ADOPTION_SECTIONS.includes(section),'ADOPTION_SECTION_INVALID');
  if(offset>0)need(revision!==undefined,'RESEARCH_PAGE_REVISION_REQUIRED');
  const state=await stateAt(dossierId,{revision}),source=await sourceFor(dossierId,state,selected);
  return withSource(dossierId,state,source,async(branch,ancestor)=>{
   const incoming=branch.head.state,model=comparisonModel(incoming);
   const c=caseVersionId?model.cases.find(r=>r.versionId===id(caseVersionId)):null;
   need(section==='cases'||c,'ADOPTION_CASE_NOT_FOUND');
   const scoped=kind=>model[kind].filter(r=>!c||r.caseId===c.id&&r.caseVersionId===c.versionId);
   const records=c?kinds.flatMap(scoped):[];
   const wanted=new Set(records.flatMap(r=>r.definition.sourceRefs??r.definition.input?.sourceRefs??[]).map(r=>r.editionId));
   const bindings=[...wanted].sort().map(editionId=>{
    const original=incoming.editions.find(e=>e.id===editionId),current=state.editions.find(e=>e.id===editionId);
    need(original,'ADOPTION_SOURCE_EDITION_NOT_FOUND');
    return{editionId,status:!current?'MISSING':same(original,current)?'EXACT':'DIFFERENT',original:clone(original),current:clone(current??null)};
   });
   const items=section==='sources'?bindings:section==='cases'?model.cases:scoped(section);
   return envelope(state,{source:clone(source),ancestor,incomingHead:clone(source.incomingHead),case:clone(c),
    ...page(items,{offset,limit}),targets:adoptionTargets(state),sourceBindings:bindings});
  });
 }
 async function previewFrom(state,request){
  const parent=request.continuationOf?findPlan(state,request.continuationOf):null;
  if(request.continuationOf)need(parent,'ADOPTION_PLAN_NOT_FOUND');
  const selected=parent?.source.id??request.sourceId;
  const source=await sourceFor(state.id,state,selected);
  return withSource(state.id,state,source,async(branch,ancestor)=>buildAdoptionPlan({
   current:state,incoming:branch.head.state,source,ancestor,request,readContent:branch.readContent}));
 }
 async function previewComparisonAdoption(dossierId,input){
  const request=adoptionRequest(input),state=await stateAt(dossierId);
  need(state.revision===request.expectedRevision,'REVISION_CONFLICT');
  return envelope(state,await previewFrom(state,request));
 }
 async function comparisonAdoption(dossierId,{planId:selected,requestId,revision}={}){
  need(Boolean(selected)!==Boolean(requestId),'ADOPTION_SELECTOR_INVALID');
  if(selected)id(selected);else id(requestId);
  const state=await stateAt(dossierId,{revision});
  const plan=selected?findPlan(state,selected):adoptionEvents(state).find(p=>p.request.requestId===requestId);
  return envelope(state,{adoption:plan?adoptionResult(state,plan):null});
 }
 async function reviewComparisonAdoption(dossierId,input){
  const {request,previewSha256}=adoptionRequest(input,{review:true});
  const requestSha256=hash({...request,previewSha256});
  let state=await stateAt(dossierId),plan=adoptionEvents(state).find(p=>p.request.requestId===request.requestId),duplicate=Boolean(plan);
  const verify=found=>{
   normalizePlan(found);need(found.requestSha256===requestSha256&&same(found.request,request)&&found.previewSha256===previewSha256,'ADOPTION_REQUEST_CHANGED');
   return found;
  };
  if(plan)verify(plan);
  else{
   need(state.revision===request.expectedRevision,'REVISION_CONFLICT');
   const preview=await previewFrom(state,request);
   if(!preview.eligible){const error=new BuyerError('ADOPTION_NOT_READY');Object.defineProperty(error,'details',{value:{issues:clone(preview.issues)},writable:true});throw error;}
   need(preview.previewSha256===previewSha256,'ADOPTION_PREVIEW_CHANGED');
   const proposed=finalizePlan(preview);
   try{
    await commit(dossierId,request.expectedRevision,'Review returned comparison adoption',async(next,before)=>{
     next.comparisonAdoptionEvents=[...adoptionEvents(next),clone(proposed)];
     const candidate={...next,revision:before.revision+1,previous:digest(jsonBytes(before)),
      updatedAt:new Date().toISOString(),change:'Review returned comparison adoption'};
     await validateCapacity(dossierId,candidate);
     await validateCandidate(dossierId,candidate,{withTransition:true});
    },{projection:'metadata'});
    plan=proposed;
   }catch(error){
    if(error.code!=='REVISION_CONFLICT')throw error;
    state=await stateAt(dossierId);
    const recovered=adoptionEvents(state).find(p=>p.request.requestId===request.requestId);
    if(!recovered)throw error;
    plan=verify(recovered);duplicate=true;
   }
  }
  // Each next command is already fixed in the durable plan. Recover its native
  // receipt before testing a later head; no lost reply creates another identity.
  while(true){
   state=await stateAt(dossierId);const progress=adoptionProgress(state,plan);
   if(progress.status!=='READY')return adoptionResult(state,plan,{duplicate});
   const step=plan.steps[progress.nextIndex];
   let native=clone(step.request);
   if(native.action==='run.import'){
    const raw=native.payload.raw;let body;
    try{body=await blob(raw);}catch(error){
     if(error.code!=='ENOENT')throw error;
     // Cold portable plans retain the complete incoming stream, even before the
     // first native run has installed its individual raw/artifact blobs.
     body=await withSource(dossierId,state,plan.source,branch=>branch.readContent(raw));
    }
    const rawText=new TextDecoder('utf-8',{fatal:true}).decode(body);
    need(Buffer.from(rawText).equals(body),'ADOPTION_RAW_UTF8_CHANGED');
    const {raw:discard,...payload}=native.payload;native.payload={...payload,rawText};
   }
   need(hash(native)===step.requestSha256,'ADOPTION_NATIVE_REQUEST_CHANGED');
   try{await comparisonStore.reviewComparison(dossierId,{...native,projection:'metadata'});}
   catch(error){
    const latest=await stateAt(dossierId),received=adoptionProgress(latest,plan);
    if(received.operations.some(e=>e.requestId===step.requestId))continue;
    if(error.code==='REVISION_CONFLICT')return adoptionResult(latest,plan,{duplicate});
    if(error instanceof BuyerError)error.details={...(error.details??{}),adoption:adoptionResult(latest,plan,{duplicate})};
    throw error;
   }
  }
 }
 async function comparisonAdoptionFile(dossierId,{sourceId:selected,runId,artifactId,revision}={}){
  id(runId);if(artifactId!==undefined)id(artifactId);
  const state=await stateAt(dossierId,{revision}),source=await sourceFor(dossierId,state,selected);
  return withSource(dossierId,state,source,async branch=>{
   const run=comparisonModel(branch.head.state).runs.find(r=>r.id===runId);
   need(run,'ADOPTION_RUN_NOT_FOUND');
   const selected=artifactId===undefined?run.raw:run.artifacts.find(f=>f.id===artifactId);
   need(selected,'ADOPTION_ARTIFACT_NOT_FOUND');
   return resultDownload(state,artifactId===undefined?run.id+'.run.json':selected.path.split('/').at(-1),
    artifactId===undefined?'application/json; charset=utf-8':selected.mediaType,await branch.readContent(selected),
    {sourceId:source.id,runId,artifactId:artifactId??null,originalPath:selected.path??null});
  });
 }
 async function exportComparisonAdoption(dossierId,{planId:selected,revision,format='json'}={}){
  id(selected);need(['json','html','source'].includes(format),'ADOPTION_EXPORT_FORMAT_INVALID');
  const state=await stateAt(dossierId,{revision}),plan=findPlan(state,selected);need(plan,'ADOPTION_PLAN_NOT_FOUND');
  const report=adoptionResult(state,plan);
  if(format==='source')return{revision:state.revision,filename:plan.source.filename,contentType:plan.source.contentType,
   bytes:plan.source.bytes,sha256:plan.source.sha256,stream:Readable.from(returnSourceChunks(plan.source,blob))};
  if(format==='json')return resultDownload(state,plan.id+'.json','application/json; charset=utf-8',jsonBytes(report));
  const rows=report.progress.mappings.map(m=>'<tr><td>'+escape(m.sourceKind)+'</td><td>'+escape(m.sourceVersionId)+
   '</td><td>'+escape(m.targetVersionId)+'</td><td>'+escape(m.mode)+'</td></tr>').join('');
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>Reviewed comparison adoption</title><style>body{font:16px/1.5 system-ui;margin:2rem auto;max-width:1000px;padding:0 1rem;color:#171717;background:#fff}'+
   'table{width:100%;border-collapse:collapse}td,th{padding:.5rem;text-align:left;border:1px solid #ccc;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><body>'+
   '<h1>'+escape(plan.case.definition.title)+'</h1><h2>Reviewed returned comparison</h2><p>Status: '+escape(report.status)+
   '. Native author revision '+state.revision+'. Accepted '+report.progress.completed+' of '+report.progress.total+' planned operations.</p>'+
   '<p>Accepting operator: '+escape(plan.request.actor.name)+' ('+escape(plan.request.actor.id)+'), '+escape(plan.request.reviewedAt)+
   '.</p><p>'+escape(plan.request.reviewNote)+'</p><p>The returned history, original measurements, reviewers and files remain their original source. This author-side adoption records new native operations; it does not rerun measurements or attribute the original work to the accepting operator.</p>'+
   '<p>Source '+escape(plan.source.id)+' / '+escape(plan.source.sha256)+' / '+plan.source.bytes+' bytes. Original protocol '+escape(plan.case.versionId)+
   '.</p><table><thead><tr><th>Record</th><th>Original version</th><th>Author version</th><th>Disposition</th></tr></thead><tbody>'+rows+
   '</tbody></table><h2>Complete source, plan, mappings and native receipts</h2><pre>'+escape(JSON.stringify(report,null,2))+'</pre></body></html>\n';
  return resultDownload(state,plan.id+'.html','text/html; charset=utf-8',html);
 }
 return Object.freeze({comparisonAdoptions,comparisonAdoptionSource,previewComparisonAdoption,reviewComparisonAdoption,
  comparisonAdoption,comparisonAdoptionFile,exportComparisonAdoption});
}
