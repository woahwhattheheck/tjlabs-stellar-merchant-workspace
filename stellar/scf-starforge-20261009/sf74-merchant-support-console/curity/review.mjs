/** Reviewed Curity evidence and complete expected/returned comparisons. */
import {SCHEMA,hash,stable} from './source.mjs';
import {compareInstants} from './lossless-json.mjs';
const need=(value,message)=>{if(!value)throw new Error(message);};
const SHA=/^[a-f0-9]{64}$/;
const same=(a,b)=>stable(a)===stable(b);
const occurrence=ref=>ref.sourceId+':'+ref.fileSha256+':'+ref.recordOrdinal;
export function validateReviewedEdition(manifest) {
  need(manifest?.schema===SCHEMA&&typeof manifest.id==='string','Select a Curity source edition');
  const {id,...body}=manifest;need(id==='curity-'+hash(stable(body)),'Source manifest identity changed');
  need(SHA.test(manifest.mappingRevision??'')&&SHA.test(manifest.configurationHash??''),'Freeze mapping and configuration identities');
  const review=manifest.review;
  need(review?.confirmed===true&&typeof review.operator==='string'&&review.operator.trim()&&typeof review.reason==='string'&&review.reason.trim(),'Complete the named mapping and coverage review');
  need(typeof review.id==='string'&&SHA.test(review.sha256??'')&&Array.isArray(review.selectedReferences)&&review.selectedReferences.length>0&&review.selectedReferences.length<=1000,'Select 1–1000 reviewed evidence occurrences');
  const seen=new Set();
  for(const ref of review.selectedReferences){
    need(ref.mappingRevision===manifest.mappingRevision&&SHA.test(ref.eventKey??'')&&SHA.test(ref.contentSha256??''),'Selected evidence must classify against the frozen mapping');
    need(['accepted','repeat','collision-accepted'].includes(ref.disposition),'Resolve or exclude each selected collision and unclassifiable occurrence');
    need(manifest.sourceFiles.some(f=>f.sourceId===ref.sourceId&&f.sha256===ref.fileSha256)&&Number.isSafeInteger(ref.recordOrdinal)&&ref.recordOrdinal>0,'Selected evidence lost its original source binding');
    need(!seen.has(occurrence(ref)),'Selected occurrence repeated');seen.add(occurrence(ref));
  }
  need(manifest.binding?.configurationHash===manifest.configurationHash&&manifest.binding.installationId===manifest.installationId,'Reviewed installation/configuration binding differs');
  need(compareInstants(manifest.binding.window.start,manifest.binding.window.end)<0,'Review the selected event-time window');
  // Incomplete sources can supply explicit reviewed evidence, but retain that state.
  return manifest;
}
export function selectedEventReferences(manifest) {
  validateReviewedEdition(manifest);return manifest.review.selectedReferences.map(ref=>({...structuredClone(ref),editionId:manifest.id}));
}
export function reviewedSelection(manifest,{editionId,reviewId,eventKeys}={}) {
  validateReviewedEdition(manifest);
  if(editionId!==undefined)need(editionId===manifest.id,'Edition selection changed');
  if(reviewId!==undefined)need(reviewId===manifest.review.id,'Review selection changed');
  const refs=selectedEventReferences(manifest);
  if(eventKeys!==undefined){need(Array.isArray(eventKeys)&&eventKeys.length>0&&eventKeys.every(k=>typeof k==='string'),'Select original event keys');const keys=new Set(eventKeys);need(keys.size===eventKeys.length&&eventKeys.every(k=>refs.some(r=>r.eventKey===k)),'Select only reviewed original event identities');return {...selection(manifest),events:refs.filter(r=>keys.has(r.eventKey))};}
  return {...selection(manifest),events:refs};
}
function selection(manifest) {
  return {schema:'curity.reviewed-selection/v1',editionId:manifest.id,reviewId:manifest.review.id,sourceContext:manifest.sourceContext,
    sourceState:manifest.state,installationId:manifest.installationId,resourceId:manifest.binding.resourceId,
    configurationHash:manifest.configurationHash,mappingRevision:manifest.mappingRevision,
    binding:structuredClone(manifest.binding),sourceFiles:manifest.sourceFiles.map(f=>({sourceId:f.sourceId,sha256:f.sha256,bytes:f.bytes,name:f.name}))};
}
/**
 * Actual return envelope:
 * {kind:'per-event'|'bulk-acknowledgment', sourceReturn:{sha256,bytes},
 *  editionId,reviewId,case:{id,revision}, events:[{sourceRef,targetId?,
 *  disposition?,caseId?,caseRevision?,files?:[{sha256,bytes}]}],...}
 * A bulk acknowledgment never verifies individual source evidence.
 */
export function compareReturn(manifest,actual) {
  const expected=selectedEventReferences(manifest);need(actual&&typeof actual==='object','Retain the actual returned package');
  need(SHA.test(actual.sourceReturn?.sha256??'')&&Number.isSafeInteger(actual.sourceReturn?.bytes)&&actual.sourceReturn.bytes>=0,'Retain exact original return bytes and SHA256');
  const differences=[],unverified=[];
  if(actual.editionId!==manifest.id)differences.push({code:'EDITION_ID',expected:manifest.id,actual:actual.editionId??null});
  if(actual.reviewId!==manifest.review.id)differences.push({code:'REVIEW_ID',expected:manifest.review.id,actual:actual.reviewId??null});
  if(!actual.case?.id||actual.case.revision===undefined)unverified.push({code:'CASE_ID_OR_REVISION_MISSING'});
  const detail=actual.kind==='per-event'&&Array.isArray(actual.events);
  if(!detail){
    unverified.push(...expected.map(ref=>({code:'PER_EVENT_RETURN_ABSENT',expected:ref})));
    return {schema:'curity.return-comparison/v1',editionId:manifest.id,reviewId:manifest.review.id,sourceReturn:structuredClone(actual.sourceReturn),
      state:'UNVERIFIED_DETAIL',expectedCount:expected.length,returnedCount:Array.isArray(actual.events)?actual.events.length:null,differences,unverified,
      acknowledgment:structuredClone(actual.acknowledgment??null)};
  }
  const byOccurrence=new Map();
  for(const row of actual.events){
    if(!row?.sourceRef){differences.push({code:'RETURN_SOURCE_REF_MISSING',actual:structuredClone(row)});continue;}
    const key=occurrence(row.sourceRef);if(!byOccurrence.has(key))byOccurrence.set(key,[]);byOccurrence.get(key).push(row);
  }
  const expectedKeys=new Set(expected.map(occurrence));
  for(const ref of expected){
    const rows=byOccurrence.get(occurrence(ref))??[];
    if(rows.length===0){differences.push({code:'EXPECTED_EVENT_OMITTED',expected:ref});continue;}
    if(rows.length!==1){differences.push({code:'RETURN_EVENT_DUPLICATED',expected:ref,actualCount:rows.length});continue;}
    const row=rows[0];
    for(const key of ['editionId','sourceId','fileSha256','recordOrdinal','byteStart','byteEnd','eventId','eventKey','contentSha256','mappingRevision'])
      if(!same(row.sourceRef[key]??null,ref[key]??null))differences.push({code:'SOURCE_BINDING_CHANGED',field:key,expected:ref[key]??null,actual:row.sourceRef[key]??null,sourceRef:ref});
    if(row.disposition===undefined)unverified.push({code:'DISPOSITION_ABSENT',sourceRef:ref});
    else if(row.disposition!==ref.disposition)differences.push({code:'DISPOSITION_CHANGED',expected:ref.disposition,actual:row.disposition,sourceRef:ref});
    if(row.targetId===undefined)unverified.push({code:'TARGET_EVENT_ID_ABSENT',sourceRef:ref});
    if(row.caseId===undefined||row.caseRevision===undefined)unverified.push({code:'EVENT_CASE_BINDING_ABSENT',sourceRef:ref});
    else if(row.caseId!==actual.case?.id||row.caseRevision!==actual.case?.revision)differences.push({code:'EVENT_CASE_BINDING_CHANGED',sourceRef:ref,actual:{id:row.caseId,revision:row.caseRevision}});
    const original=manifest.sourceFiles.find(f=>f.sourceId===ref.sourceId);
    if(!Array.isArray(row.files))unverified.push({code:'SOURCE_FILE_RETURN_ABSENT',sourceRef:ref});
    else if(!row.files.some(f=>f.sha256===original.sha256&&f.bytes===original.bytes))differences.push({code:'SOURCE_FILE_CHANGED_OR_OMITTED',sourceRef:ref,expected:{sha256:original.sha256,bytes:original.bytes},actual:row.files});
  }
  for(const [key,rows]of byOccurrence)if(!expectedKeys.has(key))for(const row of rows)differences.push({code:'UNEXPECTED_RETURN_EVENT',actual:structuredClone(row)});
  return {schema:'curity.return-comparison/v1',editionId:manifest.id,reviewId:manifest.review.id,sourceReturn:structuredClone(actual.sourceReturn),
    state:differences.length?'DIFFERENCES':unverified.length?'UNVERIFIED_DETAIL':'MATCHED',expectedCount:expected.length,returnedCount:actual.events.length,differences,unverified};
}
/** Compare reviewed edition selections; full record changes remain in source indexes. */
export function compareEditions(before,after) {
  const old=selectedEventReferences(before),current=selectedEventReferences(after),changes=[];
  need(before.installationId===after.installationId,'Do not merge event identities from different installations');
  const group=rows=>{const m=new Map();for(const r of rows){if(!m.has(r.eventKey))m.set(r.eventKey,[]);m.get(r.eventKey).push(r);}return m;},a=group(old),b=group(current);
  for(const key of new Set([...a.keys(),...b.keys()])){
    const left=a.get(key)??[],right=b.get(key)??[];
    if(!left.length)changes.push({kind:'added',eventKey:key,after:right});
    else if(!right.length)changes.push({kind:'removed-from-reviewed-selection',eventKey:key,before:left});
    else{
      const content=rows=>[...new Set(rows.map(r=>r.contentSha256))].sort();
      if(!same(content(left),content(right)))changes.push({kind:'identity-content-changed',eventKey:key,before:left,after:right});
      else if(!same(left.map(occurrence).sort(),right.map(occurrence).sort()))changes.push({kind:'source-occurrences-changed',eventKey:key,before:left,after:right});
    }
  }
  return {schema:'curity.edition-comparison/v1',before:before.id,after:after.id,scope:'REVIEWED_SELECTION',changes,
    mappingChanged:before.mappingRevision!==after.mappingRevision,configurationChanged:before.configurationHash!==after.configurationHash,
    sourceState:{before:before.state,after:after.state},coverageChanged:!same(before.coverage,after.coverage)};
}
