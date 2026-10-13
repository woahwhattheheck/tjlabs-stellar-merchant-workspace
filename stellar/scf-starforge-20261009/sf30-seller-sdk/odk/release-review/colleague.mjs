// MIT. Complete colleague feedback stays with the original Central review and Store.
import {randomUUID} from 'node:crypto';
import {digest,fault,stable,now,identifier} from '../../odata/state.mjs';
import {renderColleagueReview} from './colleague-render.mjs';

export const FORM_COLLEAGUE_PACKAGE_SCHEMA='stellar-forge.odk-form-colleague-package.v1';
export const FORM_COLLEAGUE_RETURN_SCHEMA='stellar-forge.odk-form-colleague-return.v1';
const PACKAGE='form-release-colleague-package',RETURN='form-release-colleague-return';
const clone=value=>structuredClone(value);
const equal=(a,b)=>stable(a)===stable(b);
const need=(value,code,message,status=400)=>{if(!value)throw fault(code,message,status);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>digest(stable(value));
const safeId=(value,label)=>identifier(value??randomUUID(),label);
const disposition=value=>value?{changeId:value.changeId,decision:value.decision,note:value.note}:null;
const withoutDerived=record=>{const {readiness,reporting,colleague,...saved}=record;return saved;};
const boundReview=record=>({
 reviewId:record.id,baselineId:record.baselineId,candidateId:record.candidateId,
 assessmentHash:record.assessment.contentHash,dependencyHash:record.assessment.dependencyHash
});

function validateDraft(value,changeIds,complete){
 need(object(value)&&typeof value.reviewer==='string'&&typeof value.note==='string'&&Array.isArray(value.decisions),
  'FORM_COLLEAGUE_DRAFT','Keep the complete named colleague draft.');
 need(value.reviewer.length<=200&&value.note.length<=30000,'FORM_COLLEAGUE_TEXT','The reviewer or review note is too long.');
 if(complete)need(value.reviewer.trim()&&value.note.trim(),'FORM_COLLEAGUE_EDITION','Save a reviewer and overall note for each edition.');
 const seen=new Set();
 for(const row of value.decisions){
  need(object(row)&&changeIds.has(row.changeId)&&!seen.has(row.changeId)&&
   ['accept','remap','revise'].includes(row.decision)&&typeof row.note==='string'&&row.note.length<=20000,
   'FORM_COLLEAGUE_DISPOSITION','Keep each original change and one complete disposition.');
  if(complete)need(row.note.trim(),'FORM_COLLEAGUE_EDITION','Save a note for every selected disposition.');
  seen.add(row.changeId);
 }
}
function validateWork(work,published){
 need(object(work)&&work.schema===FORM_COLLEAGUE_RETURN_SCHEMA&&object(work.package)&&
  equal(work.package,published),'FORM_COLLEAGUE_SOURCE','Return the unchanged complete package originally exported from this workspace.',409);
 const changes=new Set(published.review.assessment.changes.map(value=>value.id));
 validateDraft(work.draft,changes,false);
 need(Array.isArray(work.editions),'FORM_COLLEAGUE_HISTORY','Retain all colleague saved editions.');
 const ids=new Set();
 for(const edition of work.editions){
  need(object(edition)&&typeof edition.id==='string'&&edition.id.length<=200&&!ids.has(edition.id)&&
   typeof edition.createdAt==='string'&&Number.isFinite(Date.parse(edition.createdAt)),
   'FORM_COLLEAGUE_HISTORY','Retain distinct original edition identities and dates.');
  validateDraft(edition,changes,true);ids.add(edition.id);
 }
 return work;
}

export function createColleagueReview({store,getReview,getSource,decide}){
 const exportsRunning=new Map();
 const workspaceId=()=>store.identity().workspaceId;
 const summary=record=>({id:record.id,reviewId:record.reviewId,packageId:record.packageId??record.id,
  createdAt:record.createdAt,status:record.status??'EXPORTED',source:record.source,html:record.html,
  reviewer:record.reviewer??null,editionCount:record.editionCount??0,applied:record.applied??null});
 function list(reviewId){
  return {packages:store.list(PACKAGE).filter(value=>value.reviewId===reviewId).map(summary),
   returns:store.list(RETURN).filter(value=>value.reviewId===reviewId).map(summary)};
 }
 async function readPackage(record){
  const raw=await store.raw(record.source.sha256);
  need(raw.length===record.source.bytes,'FORM_COLLEAGUE_SOURCE','The original package length changed.',409);
  return JSON.parse(raw.toString('utf8'));
 }
 function sameRequest(record,request){
  need(equal(record.request,request),'FORM_COLLEAGUE_REQUEST','Continue the same original request ID and selection.',409);
 }
 async function exportPackage(input){
  const packageId=safeId(input.packageId,'colleague package ID');
  const request={id:input.id,expectedRevision:input.expectedRevision};
  const prior=store.get(PACKAGE,packageId,false);
  if(prior){sameRequest(prior,request);return summary(prior);}
  const active=exportsRunning.get(packageId);
  if(active){need(equal(active.request,request),'FORM_COLLEAGUE_REQUEST','This package ID is already preparing another selection.',409);return active.promise;}
  const promise=(async()=>{
   const review=getReview({id:input.id});
   need(review.revision===input.expectedRevision,'CENTRAL_REVISION_CHANGED','Reopen the saved release review before exporting.',409);
   const {colleague,...originalReview}=review;
   const sources={baseline:clone(getSource({id:review.baselineId})),candidate:clone(getSource({id:review.candidateId}))};
   const originals=new Map(),nativeOnly=[];
   function add(receipt,name,side,sourceId,label){
    if(!receipt?.sha256)return;
    need(Number.isSafeInteger(receipt.bytes)&&receipt.bytes>=0,'FORM_COLLEAGUE_FILE','Keep the retained original file length.',409);
    let file=originals.get(receipt.sha256);
    if(!file){file={sha256:receipt.sha256,bytes:receipt.bytes,names:[]};originals.set(file.sha256,file);}
    need(file.bytes===receipt.bytes,'FORM_COLLEAGUE_FILE','Original file identities disagree.',409);
    file.names.push({name,side,sourceId,label});
   }
   function collect(source,side,sourceId){
    const form=source.form.formId;
    add(source.xml,form+'.xml',side,sourceId,'XForm definition');
    add(source.fields,form+'-fields.json',side,sourceId,'Native field schema');
    add(source.modelSource,form+'-model.json',side,sourceId,'Authoring model');
    for(const item of source.media?.items??[])add(item,item.name,side,sourceId,'Form attachment');
    add(source.reporting?.service,form+'-odata-service.json',side,sourceId,'Original OData service catalog');
    add(source.reporting?.metadata,form+'-odata-metadata.xml',side,sourceId,'Original OData field metadata');
    const receipts=source.origin?.originals??{};
    for(const key of ['attachmentInventoryBefore','attachmentInventoryAfter','fieldsAfter'])
     add(receipts[key],form+'-'+key+'.json',side,sourceId,'Original draft '+key);
    for(const key of ['metadataBefore','metadataAfter'])if(receipts[key]?.sha256)
     nativeOnly.push({side,sourceId,label:'Original draft '+key,receipt:clone(receipts[key]),
      reason:'The original native metadata may contain private draft credentials. It remains in the original workspace; this colleague package carries the retained sanitized source metadata.'});
    for(const historical of source.history??[])collect(historical,side+' history',sourceId+' · '+historical.form.version);
   }
   collect(sources.baseline,'baseline',sources.baseline.id);
   collect(sources.candidate,'candidate',sources.candidate.id);
   const files=[];
   for(const original of originals.values()){
    const raw=await store.raw(original.sha256);
    need(raw.length===original.bytes,'FORM_COLLEAGUE_FILE','An original file length differs.',409);
    files.push({...original,base64:raw.toString('base64')});
   }
   const payload={schema:FORM_COLLEAGUE_PACKAGE_SCHEMA,id:packageId,workspaceId:workspaceId(),
    reviewId:review.id,reviewRevision:review.revision,createdAt:now(),review:clone(originalReview),sources,files,fileCoverage:{nativeOnly}};
   const complete={...payload,contentHash:hash(payload)};
   const staff=review.history.filter(value=>value.kind==='staff-decision').at(-1);
   const work={schema:FORM_COLLEAGUE_RETURN_SCHEMA,package:complete,
    draft:{reviewer:staff?.reviewer??review.approval?.reviewer??'',note:staff?.note??review.approval?.note??'',
     decisions:review.decisions.map(disposition)},editions:[]};
   const source=await store.retain(Buffer.from(stable(complete)+'\n'));
   const html=await store.retain(Buffer.from(await renderColleagueReview(work)));
   const saved={request,reviewId:review.id,reviewRevision:review.revision,packageHash:complete.contentHash,
    binding:boundReview(review),reviewRecordHash:hash(withoutDerived(review)),originalDecisions:review.decisions.map(disposition),source,html,createdAt:complete.createdAt};
   // Original saved source remains usable even if another staff member edited
   // during its byte receiving. Its exact revision is visible on every return.
   const accepted=store.transaction(()=>{
    const existing=store.get(PACKAGE,packageId,false);
    if(existing){sameRequest(existing,request);return existing;}
    return store.writeRecord(PACKAGE,packageId,saved,0);
   });
   return summary(accepted);
  })();
  exportsRunning.set(packageId,{request,promise});
  try{return await promise;}
  finally{if(exportsRunning.get(packageId)?.promise===promise)exportsRunning.delete(packageId);}
 }
 async function receiveFile(input){
  const returnId=safeId(input.id,'colleague receiving ID');
  const request={reviewId:input.reviewId,sourceSha256:input.sourceSha256};
  const prior=store.get(RETURN,returnId,false);
  if(prior){sameRequest(prior,request);return preview({id:returnId});}
  const raw=await store.raw(input.sourceSha256);
  let work;try{work=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{throw fault('FORM_COLLEAGUE_JSON','Choose the complete UTF-8 colleague return JSON.');}
  need(work?.package?.workspaceId===workspaceId()&&work.package.reviewId===input.reviewId,
   'FORM_COLLEAGUE_WORKSPACE','This return belongs to a different original workspace or release review.',409);
  const exported=store.get(PACKAGE,work.package.id);
  need(exported.reviewId===input.reviewId,'FORM_COLLEAGUE_REVIEW','Select the original review for this package.',409);
  const published=await readPackage(exported);validateWork(work,published);
  const saved={request,reviewId:input.reviewId,packageId:exported.id,packageHash:published.contentHash,
   source:{sha256:input.sourceSha256,bytes:raw.length},reviewer:work.draft.reviewer,editionCount:work.editions.length,
   createdAt:now(),status:'RECEIVED',applied:null,feedback:{draft:clone(work.draft),editions:clone(work.editions)}};
  store.transaction(()=>{
   const existing=store.get(RETURN,returnId,false);
   if(existing){sameRequest(existing,request);return;}
   store.writeRecord(RETURN,returnId,saved,0);
  });
  return preview({id:returnId});
 }
 async function receiveText(input){
  need(typeof input.originalText==='string','FORM_COLLEAGUE_JSON','Supply the complete original return text.');
  const source=await store.retain(Buffer.from(input.originalText));
  return receiveFile({id:input.id,reviewId:input.reviewId,sourceSha256:source.sha256});
 }
 async function preview(input){
  const record=store.get(RETURN,input.id),exported=store.get(PACKAGE,record.packageId);
  // The complete file and package were verified before this immutable receiving
  // record was accepted. Routine previews read compact retained feedback, not
  // another copy of every original binary attachment.
  const work=record.feedback;
  const current=getReview({id:record.reviewId});
  const sourceMatches=equal(boundReview(current),exported.binding);
  const dependenciesMatch=current.readiness.currentDependencyHash===exported.binding.dependencyHash;
  const before=new Map(exported.originalDecisions.map(value=>[value.changeId,disposition(value)]));
  const native=new Map(current.decisions.map(value=>[value.changeId,disposition(value)]));
  const incoming=new Map(work.draft.decisions.map(value=>[value.changeId,disposition(value)]));
  const rows=current.assessment.changes.map(change=>{
   const original=before.get(change.id)??null,currentValue=native.get(change.id)??null,colleague=incoming.get(change.id)??null;
   return {change:clone(change),original,current:currentValue,colleague,different:!equal(currentValue,colleague),
    proposed:colleague!==null&&!equal(original,colleague),nativeChanged:!equal(original,currentValue),
    incomplete:colleague!==null&&!colleague.note.trim()};
  });
  const reviewRecordHash=hash(withoutDerived(current));
  const binding={returnId:record.id,sourceHash:record.source.sha256,reviewId:current.id,
   revision:current.revision,reviewRecordHash,dependencyHash:current.readiness.currentDependencyHash};
  return {schema:'stellar-forge.odk-form-colleague-preview.v1',...summary(record),currentRevision:current.revision,
   originalRevision:exported.reviewRevision,sourceMatches,dependenciesMatch,
   canApply:sourceMatches&&dependenciesMatch&&!record.applied,previewHash:hash(binding),
   draft:clone(work.draft),editions:clone(work.editions),rows,
   currentApproval:clone(current.approval),currentStatus:current.status,
   message:record.applied?'This original return was already applied.':!sourceMatches?
    'The source comparison changed. Review this complete feedback beside a new package for the current comparison.':
    !dependenciesMatch?'Saved reporting definitions changed. Refresh the reporting comparison before applying feedback.':
    'Choose the current or colleague disposition for each changed row, then save an attributed native review.'};
 }
 async function apply(input){
  const record=store.get(RETURN,input.id);
  const request={expectedRevision:input.expectedRevision,previewHash:input.previewHash,choices:clone(input.choices),
   reviewer:input.reviewer,note:input.note,overall:input.overall??'review'};
  if(record.applied){
   need(equal(record.applied.request,request),'FORM_COLLEAGUE_APPLIED','This original return was already applied with another reviewed selection.',409);
   return {receiving:summary(record),review:getReview({id:record.reviewId}),applied:clone(record.applied),replayed:true};
  }
  const selected=await preview({id:record.id});
  need(selected.canApply&&selected.currentRevision===input.expectedRevision&&selected.previewHash===input.previewHash,
   'FORM_COLLEAGUE_PREVIEW_CHANGED','Reopen the current comparison and review the returned feedback again.',409);
  need(Array.isArray(input.choices)&&['review','revise'].includes(input.overall??'review'),
   'FORM_COLLEAGUE_SELECTION','Select current or colleague feedback and save a staff review or revision request.');
  const choices=new Map();
  for(const choice of input.choices){
   need(object(choice)&&!choices.has(choice.changeId)&&['current','colleague'].includes(choice.source)&&
    selected.rows.some(row=>row.change.id===choice.changeId&&row.different&&row.colleague!==null),
    'FORM_COLLEAGUE_SELECTION','Choose each returned difference once.');
   choices.set(choice.changeId,choice.source);
  }
  const changed=selected.rows.filter(row=>row.different&&row.colleague!==null),decisions=[];
  need(changed.every(row=>choices.has(row.change.id)),'FORM_COLLEAGUE_SELECTION','Review every changed colleague disposition.');
  for(const row of changed)if(choices.get(row.change.id)==='colleague'){
   need(!row.incomplete,'FORM_COLLEAGUE_NOTE','Complete the colleague disposition note before selecting it.');
   decisions.push(clone(row.colleague));
  }
  const at=now();
  const history={kind:'colleague-feedback',returnId:record.id,packageId:record.packageId,source:clone(record.source),
   originalReviewRevision:selected.originalRevision,colleagueReviewer:selected.draft.reviewer,
   colleagueNote:selected.draft.note,colleagueEditions:clone(selected.editions),choices:clone(input.choices),at};
  let accepted;
  const review=decide({id:record.reviewId,expectedRevision:input.expectedRevision,reviewer:input.reviewer,note:input.note,
   decisions,overall:input.overall??'review'},{history:[history],commit:saved=>{
    const fresh=store.get(RETURN,record.id);
    need(!fresh.applied&&fresh.revision===record.revision,'FORM_COLLEAGUE_APPLIED','This return changed during selection.',409);
    accepted=store.writeRecord(RETURN,record.id,{...record,status:'APPLIED',
     applied:{request,at,reviewRevision:saved.revision,reviewer:input.reviewer}},record.revision);
   }});
  return {receiving:summary(accepted),review,applied:clone(accepted.applied),replayed:false};
 }
 async function receiveStream(input,stream){
  let bytes=0;
  async function* bounded(){
   for await(const chunk of stream){bytes+=chunk.length;need(bytes<=256*1024*1024,'FORM_COLLEAGUE_SIZE','This complete colleague return exceeds the 256 MiB receiving limit.',413);yield chunk;}
  }
  const source=await store.retainStream(bounded());
  return receiveFile({id:input.id,reviewId:input.reviewId,sourceSha256:source.sha256});
 }
 return {list,exportPackage,receiveFile,receiveText,receiveStream,preview,apply};
}
