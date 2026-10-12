// MIT. Complete next-edition review over retained weather decisions and sources.
import {need,keys,text,canonical,sha,clone} from './contract.mjs';
import {decisionInput,evaluate} from './analysis.mjs';

export const WEATHER_RENEWAL_SCHEMA='stellar-forge.weather-report-renewal.v1';
const HASH=/^[a-f0-9]{64}$/;
const identity=(value,prefix)=>need(typeof value==='string'&&new RegExp('^'+prefix+'-[a-f0-9-]{36}$').test(value),'RENEWAL_IDENTITY_INVALID');
const ref=value=>({id:value.id,revision:value.revision});
const key=value=>value.id+':'+value.revision;
const same=(a,b)=>canonical(a)===canonical(b);
const digest=value=>sha(Buffer.from(canonical(value)));
const note=value=>{need(typeof value==='string'&&value.length<=10000&&!value.includes('\0'),'RENEWAL_NOTES_INVALID');return value;};
function reference(value){
 keys(value,['id','revision']);identity(value.id,'decision');
 need(Number.isSafeInteger(value.revision)&&value.revision>=1,'RENEWAL_REVISION_INVALID');return ref(value);
}
export function normalizeWeatherRenewal(input){
 keys(input,['reportId','expectedReportSha256','title','owner','notes','entries']);
 identity(input.reportId,'report');need(HASH.test(input.expectedReportSha256??''),'RENEWAL_REPORT_HASH_REQUIRED');
 need(Array.isArray(input.entries)&&input.entries.length>=1&&input.entries.length<=32,'RENEWAL_COMPLETE_SELECTION_REQUIRED');
 const entries=input.entries.map(entry=>{
  keys(entry,['decisionId','expectedRevision','captureId','startUtc','endUtc','disposition','notes']);
  identity(entry.decisionId,'decision');identity(entry.captureId,'capture');
  need(Number.isSafeInteger(entry.expectedRevision)&&entry.expectedRevision>=1,'RENEWAL_REVISION_INVALID');
  need(typeof entry.startUtc==='string'&&typeof entry.endUtc==='string','RENEWAL_WINDOW_REQUIRED');
  need(['review','monitor','reschedule','proceed'].includes(entry.disposition),'DISPOSITION_INVALID');
  return {decisionId:entry.decisionId,expectedRevision:entry.expectedRevision,captureId:entry.captureId,
   startUtc:entry.startUtc,endUtc:entry.endUtc,disposition:entry.disposition,notes:note(entry.notes??'')};
 }).sort((a,b)=>a.decisionId.localeCompare(b.decisionId));
 need(new Set(entries.map(entry=>entry.decisionId)).size===entries.length,'RENEWAL_DUPLICATE_DECISION');
 return {reportId:input.reportId,expectedReportSha256:input.expectedReportSha256,
  title:text(input.title,'REPORT_TITLE'),owner:text(input.owner,'REPORT_OWNER',120),notes:note(input.notes??''),entries};
}
export function weatherRenewalSourceMatches(previous,next,variable){
 const a=previous.request.request,b=next.request.request;
 return a.family===b.family&&a.latitude===b.latitude&&a.longitude===b.longitude&&
  a.cellSelection===b.cellSelection&&a.elevation===b.elevation&&b.variables.includes(variable);
}
export function describeWeatherRenewal(baseline,current,updated,previousCapture,nextCapture){
 const a=baseline.rule,b=updated.rule;
 const ruleFields=['variable','unit','aggregation','operator','threshold','minimumCoverage'];
 return {previousOutcome:baseline.result.outcome,nextOutcome:updated.result.outcome,
  outcomeChanged:baseline.result.outcome!==updated.result.outcome,
  previousAggregate:baseline.result.aggregate.median,nextAggregate:updated.result.aggregate.median,
  previousUnit:a.unit,nextUnit:b.unit,previousEligibleMembers:baseline.result.eligibleMembers,
  nextEligibleMembers:updated.result.eligibleMembers,
  windowChanged:a.startUtc!==b.startUtc||a.endUtc!==b.endUtc,
  ruleChanges:ruleFields.filter(field=>a[field]!==b[field]),
  localRuleRevision:current.revision,sourceChanged:previousCapture.sha256!==nextCapture.sha256,
  modelChanged:previousCapture.metadata.model!==nextCapture.metadata.model,
  gridChanged:!same(previousCapture.metadata.grid,nextCapture.metadata.grid),
  previousModel:previousCapture.metadata.model,nextModel:nextCapture.metadata.model,
  previousGrid:clone(previousCapture.metadata.grid),nextGrid:clone(nextCapture.metadata.grid),
  previousRetrievedAt:previousCapture.provenance.retrievedAt??previousCapture.capturedAt,
  nextRetrievedAt:nextCapture.provenance.retrievedAt??nextCapture.capturedAt,
  sameUtcWindow:a.startUtc===b.startUtc&&a.endUtc===b.endUtc,
  meaning:'Compares these selected report editions and operating windows. It does not measure forecast skill or infer model initialization time.'};
}
export function reviewWeatherRenewal({originId,report,currentDecisions,captures,input}){
 text(originId,'RENEWAL_ORIGIN',200);const selection=normalizeWeatherRenewal(input);
 need(selection.reportId===report.id&&selection.expectedReportSha256===report.sha256,'RENEWAL_SOURCE_REPORT_CHANGED');
 const baseline=new Map(report.decisions.map(decision=>[decision.id,decision]));
 const current=new Map(currentDecisions.map(decision=>[decision.id,decision]));
 const sources=new Map(captures.map(capture=>[capture.id,capture]));
 need(selection.entries.length===baseline.size&&selection.entries.every(entry=>baseline.has(entry.decisionId)),'RENEWAL_COMPLETE_SELECTION_REQUIRED');
 const entries=selection.entries.map(entry=>{
  const original=baseline.get(entry.decisionId),working=current.get(entry.decisionId);
  need(working&&working.revision===entry.expectedRevision&&working.revision>=original.revision,'DECISION_REVISION_CHANGED');
  const originalCapture=sources.get(original.captureId),workingCapture=sources.get(working.captureId),nextCapture=sources.get(entry.captureId);
  need(originalCapture&&workingCapture&&nextCapture,'RENEWAL_SOURCE_MISSING');
  need(weatherRenewalSourceMatches(workingCapture,nextCapture,working.rule.variable),'RENEWAL_SOURCE_SELECTION_MISMATCH');
  const decision=decisionInput({title:working.title,owner:working.owner,disposition:entry.disposition,notes:entry.notes,
   rule:{...working.rule,startUtc:entry.startUtc,endUtc:entry.endUtc}});
  const result={...evaluate(nextCapture.view,decision.rule),captureSha256:nextCapture.sha256,specSha256:nextCapture.specSha256};
  const proposed={id:working.id,revision:working.revision+1,captureId:nextCapture.id,...decision,result};
  need(Number.isSafeInteger(proposed.revision),'RENEWAL_REVISION_INVALID');
  return {baseline:clone(original),ruleSource:clone(working),proposed,
   source:{id:nextCapture.id,sha256:nextCapture.sha256,specSha256:nextCapture.specSha256,bytes:nextCapture.bytes,
    capturedAt:nextCapture.capturedAt,request:clone(nextCapture.request),metadata:clone(nextCapture.metadata),provenance:clone(nextCapture.provenance)},
   comparison:describeWeatherRenewal(original,working,proposed,originalCapture,nextCapture)};
 });
 need(new Set(entries.map(entry=>entry.proposed.captureId)).size<=16,'REPORT_SOURCE_LIMIT');
 const sourceReport={originId,id:report.id,sha256:report.sha256,title:report.title,createdAt:report.createdAt};
 const value={schema:'stellar-forge.weather-report-renewal-review.v1',selection,sourceReport,entries};
 return {...value,selectionSha256:digest(selection),reviewSha256:digest(value),
  summary:{decisions:entries.length,sources:new Set(entries.map(entry=>entry.proposed.captureId)).size,
   changedOutcomes:entries.filter(entry=>entry.comparison.outcomeChanged).length,
   changedSources:entries.filter(entry=>entry.comparison.sourceChanged).length,
   insufficientCoverage:entries.filter(entry=>entry.proposed.result.outcome==='INSUFFICIENT_COVERAGE').length}};
}
export function weatherRenewalRecord(review,updated){
 const byId=new Map(updated.map(decision=>[decision.id,decision]));
 return {schema:WEATHER_RENEWAL_SCHEMA,sourceReport:clone(review.sourceReport),
  entries:review.entries.map(entry=>{
   const next=byId.get(entry.proposed.id);need(next&&next.revision===entry.proposed.revision,'RENEWAL_UPDATED_DECISION_CHANGED');
   return {baseline:clone(entry.baseline),ruleSource:clone(entry.ruleSource),updated:ref(next)};
  })};
}
export function validateWeatherRenewal(record,selected,history){
 if(record===undefined)return;
 keys(record,['schema','sourceReport','entries']);need(record.schema===WEATHER_RENEWAL_SCHEMA,'RENEWAL_SCHEMA_INVALID');
 keys(record.sourceReport,['originId','id','sha256','title','createdAt']);
 text(record.sourceReport.originId,'RENEWAL_ORIGIN',200);identity(record.sourceReport.id,'report');
 need(HASH.test(record.sourceReport.sha256??''),'RENEWAL_SOURCE_REPORT_CHANGED');
 text(record.sourceReport.title,'REPORT_TITLE');
 need(typeof record.sourceReport.createdAt==='string'&&Number.isFinite(Date.parse(record.sourceReport.createdAt)),'RENEWAL_TIMESTAMP_INVALID');
 need(Array.isArray(record.entries)&&record.entries.length===selected.length,'RENEWAL_COMPLETE_SELECTION_REQUIRED');
 const all=new Map(history.map(decision=>[key(decision),decision])),chosen=new Map(selected.map(decision=>[key(decision),decision])),seen=new Set();
 for(const entry of record.entries){
  keys(entry,['baseline','ruleSource','updated']);const next=reference(entry.updated);
  need(chosen.has(key(next))&&!seen.has(key(next)),'RENEWAL_UPDATED_DECISION_CHANGED');seen.add(key(next));
  for(const original of [entry.baseline,entry.ruleSource]){
   need(original&&all.has(key(original))&&same(all.get(key(original)),original),'RENEWAL_RETAINED_DECISION_CHANGED');
  }
 }
}
export function mapWeatherRenewal(record,mapDecision){
 if(record===undefined)return undefined;
 return {...clone(record),entries:record.entries.map(entry=>{
  const baseline=mapDecision(entry.baseline),ruleSource=mapDecision(entry.ruleSource),updated=mapDecision(entry.updated);
  need(baseline&&ruleSource&&updated,'RENEWAL_RECEIVING_DECISION_MISSING');
  return {baseline:clone(baseline),ruleSource:clone(ruleSource),updated:ref(updated)};
 })};
}
