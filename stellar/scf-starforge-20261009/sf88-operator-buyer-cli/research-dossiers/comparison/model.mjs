// MIT. Immutable comparison records projected from the original dossier operation history.
import {need,object,digest,jsonBytes} from '../../node/store.mjs';
import {COMPARISON_SCHEMA,SECTIONS,clone,hash,same,id,time,comparisonInput,retainedRequest,parseRun} from './contracts.mjs';
const kinds=['cases','candidates','runs','judgments','decisions'];
const kindFor=action=>({'case.save':'cases','candidate.save':'candidates','run.import':'runs','judgment.save':'judgments','decision.save':'decisions'})[action];
export function comparisonModel(state){
 const model={};for(const k of kinds)model[k]=[];
 model.operations=state.comparisonEvents??[];
 const versions=new Map();
 for(const operation of model.operations){
  const record=operation.record,kind=kindFor(operation.action);
  need(kind&&object(record)&&typeof record.versionId==='string','COMPARISON_EVENT_INVALID');
  const old=versions.get(record.versionId);
  need(!old||same(old,record),'COMPARISON_VERSION_CHANGED');
  if(!old){versions.set(record.versionId,record);model[kind].push(record);}
 }
 model.versions=versions;return model;
}
const latest=(records,recordId)=>records.findLast(r=>r.id===recordId);
const heads=records=>[...new Map(records.map(r=>[r.id,r])).values()];
function sourceBindings(state,questionId,refs){
 const editions=new Map(state.editions.map(e=>[e.id,e]));
 for(const ref of refs)need(editions.get(ref.editionId)?.questionId===questionId,'COMPARISON_SOURCE_QUESTION_MISMATCH');
}
function selectedCase(model,caseId,caseVersionId){
 const value=model.cases.find(r=>r.id===caseId&&r.versionId===caseVersionId);
 need(value,'COMPARISON_CASE_VERSION_NOT_FOUND');return value;
}
function refs(model,kind,versions,caseId,caseVersionId){
 return versions.map(version=>{
  const record=model[kind].find(r=>r.versionId===version);
  need(record&&record.caseId===caseId&&record.caseVersionId===caseVersionId,'COMPARISON_REFERENCE_VERSION_MISMATCH');
  return record;
 });
}
function previous(model,kind,recordId,versionId,caseId){
 if(!recordId){need(versionId===null,'COMPARISON_PREVIOUS_REQUIRED');return null;}
 const found=latest(model[kind],recordId);
 need(found&&found.versionId===versionId&&found.caseId===caseId,'COMPARISON_ENTITY_VERSION_CONFLICT');return found;
}
export function createComparisonRecord(state,request,createdAt,prepared=null){
 time(createdAt);
 const model=comparisonModel(state),p=request.payload,kind=kindFor(request.action);
 const token=hash({dossierId:state.id,requestId:request.requestId});
 const common={previousVersionId:p.previousVersionId??null,createdAt,actor:clone(request.actor)};
 if(kind==='cases'){
  const recordId=p.caseId??'cmpcase_'+token.slice(0,32),old=previous(model,kind,p.caseId,p.previousVersionId,recordId);
  need(state.questions.some(q=>q.id===p.definition.questionId),'COMPARISON_QUESTION_NOT_FOUND');
  need(!old||old.definition.questionId===p.definition.questionId,'COMPARISON_CASE_QUESTION_CHANGED');
  sourceBindings(state,p.definition.questionId,p.definition.sourceRefs);
  const versionId='cmpv_'+token;
  return{...common,id:recordId,versionId,caseId:recordId,caseVersionId:versionId,definition:clone(p.definition)};
 }
 const c=selectedCase(model,p.caseId,p.caseVersionId),questionId=c.definition.questionId;
 if(kind==='runs'){
  need(prepared&&object(prepared.value)&&prepared.raw,'COMPARISON_PREPARED_RUN_REQUIRED');
  const candidate=refs(model,'candidates',[p.candidateVersionId],p.caseId,p.caseVersionId)[0],v=prepared.value;
  sourceBindings(state,questionId,v.input.sourceRefs);
  const criteria=new Map(c.definition.criteria.map(x=>[x.id,x]));
  for(const metric of v.metrics){
   const criterion=criteria.get(metric.criterionId);
   need(criterion?.kind==='MEASURED','COMPARISON_MEASURED_CRITERION_REQUIRED');
   need(!criterion.unit||metric.unit===criterion.unit,'COMPARISON_METRIC_UNIT_MISMATCH');
  }
  const runId='cmprun_'+hash({caseId:p.caseId,caseVersionId:p.caseVersionId,candidateVersionId:p.candidateVersionId,externalRunId:v.externalRunId});
  const old=model.runs.find(r=>r.id===runId);
  if(old){need(same(old.raw,prepared.raw),'COMPARISON_EXTERNAL_RUN_CHANGED');return clone(old);}
  const {artifacts,result,...definition}=v;
  return{...common,id:runId,versionId:runId,caseId:p.caseId,caseVersionId:p.caseVersionId,
   candidateId:candidate.id,candidateVersionId:candidate.versionId,definition:clone(definition),
   raw:clone(prepared.raw),artifacts:clone(prepared.artifacts),resultSha256:hash(result)};
 }
 const single=kind.slice(0,-1),recordId=p[single+'Id']??('cmp'+single+'_'+token.slice(0,32));
 previous(model,kind,p[single+'Id'],p.previousVersionId,p.caseId);
 sourceBindings(state,questionId,p.definition.sourceRefs);
 if(kind==='judgments'){
  const candidate=refs(model,'candidates',[p.definition.candidateVersionId],p.caseId,p.caseVersionId)[0];
  need(c.definition.criteria.find(x=>x.id===p.definition.criterionId)?.kind==='JUDGMENT','COMPARISON_JUDGMENT_CRITERION_REQUIRED');
  for(const run of refs(model,'runs',p.definition.runIds,p.caseId,p.caseVersionId))
   need(run.candidateVersionId===candidate.versionId,'COMPARISON_JUDGMENT_RUN_MISMATCH');
 }
 if(kind==='decisions'){
  refs(model,'candidates',p.definition.candidateVersionIds,p.caseId,p.caseVersionId);
  const selected=new Set(p.definition.candidateVersionIds);
  for(const run of refs(model,'runs',p.definition.runIds,p.caseId,p.caseVersionId))
   need(selected.has(run.candidateVersionId),'COMPARISON_DECISION_CANDIDATE_MISSING');
  for(const judgment of refs(model,'judgments',p.definition.judgmentVersionIds,p.caseId,p.caseVersionId)){
   need(selected.has(judgment.definition.candidateVersionId),'COMPARISON_DECISION_CANDIDATE_MISSING');
   need(judgment.definition.runIds.every(runId=>p.definition.runIds.includes(runId)),'COMPARISON_DECISION_JUDGMENT_RUN_MISSING');
  }
 }
 return{...common,id:recordId,versionId:'cmpv_'+token,caseId:p.caseId,caseVersionId:p.caseVersionId,definition:clone(p.definition)};
}
export function recordComparison(state,request,createdAt,prepared=null){
 const events=state.comparisonEvents??=[];
 need(!events.some(e=>e.requestId===request.requestId),'COMPARISON_REQUEST_ALREADY_RETAINED');
 const record=createComparisonRecord(state,request,createdAt,prepared);
 const event={schema:COMPARISON_SCHEMA,requestId:request.requestId,requestSha256:hash(request),
  request:retainedRequest(request,prepared?.raw),action:request.action,record,createdAt,
  actor:clone(request.actor),dossierRevision:request.expectedRevision+1};
 state.comparisonEvents=[...events,event];return event;
}
export function comparisonBlobMetadata(state){
 const metadata=new Map();
 for(const event of state.comparisonEvents??[])if(event.action==='run.import'){
  const r=event.record;
  for(const value of [r.raw,...r.artifacts]){
   need(object(value)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=64*1024*1024&&/^[a-f0-9]{64}$/.test(value.sha256),'COMPARISON_BLOB_INVALID');
   const old=metadata.get(value.sha256);need(!old||old.bytes===value.bytes,'COMPARISON_BLOB_CHANGED');
   metadata.set(value.sha256,{sha256:value.sha256,bytes:value.bytes});
  }
 }
 return[...metadata.values()];
}
async function originalRun(meta,readContent,cache){
 const key='comparison-run:'+meta.sha256+':'+meta.bytes;
 if(cache.has(key))return cache.get(key);
 const raw=await readContent(meta);
 need(Buffer.isBuffer(raw)&&raw.length===meta.bytes&&digest(raw)===meta.sha256,'COMPARISON_RAW_RUN_CHANGED');
 const rawText=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 need(Buffer.from(rawText).equals(raw),'COMPARISON_RUN_UTF8_INVALID');
 const parsed=parseRun(rawText),artifacts=[];
 for(const entry of parsed.artifacts){
  const retained=await readContent(entry.metadata);
  need(Buffer.isBuffer(retained)&&retained.equals(entry.body),'COMPARISON_ARTIFACT_CHANGED');
  artifacts.push(entry.metadata);
 }
 const result={rawText,value:parsed.value,raw:{sha256:meta.sha256,bytes:meta.bytes},artifacts};
 cache.set(key,result);return result;
}
export async function validateComparisonState(state,readContent,cache=new Map()){
 need(state.comparisonEvents===undefined||Array.isArray(state.comparisonEvents),'COMPARISON_EVENTS_INVALID');
 const events=state.comparisonEvents??[];
 need(events.length<=10000,'COMPARISON_HISTORY_LIMIT');
 const scratch={...state,comparisonEvents:[]},seen=new Set();let revision=1;
 for(const event of events){
  need(object(event)&&Object.keys(event).sort().join(',')===['schema','requestId','requestSha256','request','action','record','createdAt','actor','dossierRevision'].sort().join(','),'COMPARISON_EVENT_INVALID');
  need(event.schema===COMPARISON_SCHEMA&&Number.isSafeInteger(event.dossierRevision)&&event.dossierRevision>revision&&event.dossierRevision<=state.revision,'COMPARISON_EVENT_REVISION_INVALID');
  revision=event.dossierRevision;
  let input=clone(event.request),prepared=null;
  if(event.action==='run.import'){
   need(input.action==='run.import'&&input.payload.raw&&same(input.payload.raw,event.record.raw),'COMPARISON_RAW_REQUEST_CHANGED');
   prepared=await originalRun(input.payload.raw,readContent,cache);
   const {raw,...payload}=input.payload;input.payload={...payload,rawText:prepared.rawText};
  }
  const request=comparisonInput(input);
  need(!seen.has(request.requestId)&&request.requestId===event.requestId&&request.action===event.action&&request.expectedRevision+1===event.dossierRevision,'COMPARISON_EVENT_REQUEST_INVALID');
  seen.add(request.requestId);
  const expected=recordComparison(scratch,request,event.createdAt,prepared);
  need(same(expected,event),'COMPARISON_EVENT_CHANGED');
 }
 comparisonBlobMetadata(state);
}
export function validateComparisonTransition(previous,state,{allowImported=false}={}){
 const before=previous?.comparisonEvents??[],after=state.comparisonEvents??[];
 need(after.length>=before.length&&before.every((event,index)=>same(event,after[index])),'COMPARISON_HISTORY_CHANGED');
 if(!previous){need(after.length===0,'COMPARISON_INITIAL_HISTORY_INVALID');return;}
 if(allowImported)return;
 need(after.length<=before.length+1,'COMPARISON_TRANSITION_INVALID');
 if(after.length>before.length){
  const event=after.at(-1);
  need(event.request.expectedRevision===previous.revision&&event.dossierRevision===state.revision,'COMPARISON_TRANSITION_REVISION_INVALID');
  const unchanged=value=>Object.fromEntries(Object.entries(value).filter(([k])=>!['comparisonEvents','revision','previous','updatedAt','change'].includes(k)));
  need(same(unchanged(previous),unchanged(state)),'COMPARISON_UNRELATED_STATE_CHANGED');
 }
}
function select(model,{caseId,caseVersionId}={}){
 if(caseVersionId)need(caseId,'COMPARISON_CASE_REQUIRED');
 if(!caseId)return null;
 id(caseId);return caseVersionId?selectedCase(model,caseId,id(caseVersionId)):(need(latest(model.cases,caseId),'COMPARISON_CASE_NOT_FOUND'),latest(model.cases,caseId));
}
export function comparisonPage(state,{section='overview',caseId,caseVersionId,offset=0,limit=50}={}){
 need(SECTIONS.includes(section),'COMPARISON_SECTION_INVALID');
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'COMPARISON_PAGE_INVALID');
 const model=comparisonModel(state),c=select(model,{caseId,caseVersionId}),scoped=kind=>model[kind].filter(r=>!c||r.caseId===c.id);
 let selected;
 if(section==='overview'||section==='cases')selected=heads(model.cases);
 else if(section==='case-editions')selected=scoped('cases');
 else if(section==='candidates')selected=heads(scoped('candidates').filter(r=>!c||r.caseVersionId===c.versionId));
 else if(section==='candidate-editions')selected=scoped('candidates');
 else if(section==='operations')selected=model.operations.filter(e=>!c||e.record.caseId===c.id);
 else selected=scoped(section).filter(r=>!c||r.caseVersionId===c.versionId);
 const end=Math.min(selected.length,offset+limit);
 const out={schema:COMPARISON_SCHEMA,dossierId:state.id,revision:state.revision,caseId:c?.id??null,caseVersionId:c?.versionId??null,section,
  items:clone(selected.slice(offset,end)),total:selected.length,offset,limit,nextOffset:end<selected.length?end:null,complete:end>=selected.length};
 if(section==='overview')Object.assign(out,{cases:clone(heads(model.cases)),case:clone(c),
  candidates:clone(c?heads(scoped('candidates').filter(r=>r.caseVersionId===c.versionId)):[]),
  counts:Object.fromEntries(kinds.map(k=>[k,scoped(k).length]))});
 return out;
}
export function comparisonReport(state,options={}){
 const model=comparisonModel(state),c=select(model,options);need(c,'COMPARISON_CASE_REQUIRED');
 const all=kind=>model[kind].filter(r=>r.caseId===c.id),selected=kind=>all(kind).filter(r=>r.caseVersionId===c.versionId);
 const candidates=heads(selected('candidates')),runs=selected('runs'),judgments=selected('judgments'),decisions=selected('decisions');
 const operations=model.operations.filter(e=>e.record.caseId===c.id);
 const editionIds=new Set();
 for(const e of operations)for(const ref of e.record.definition.sourceRefs??e.record.definition.input?.sourceRefs??[])editionIds.add(ref.editionId);
 return{schema:COMPARISON_SCHEMA,dossierId:state.id,revision:state.revision,case:clone(c),caseEditions:clone(all('cases')),
  candidates:clone(candidates),candidateEditions:clone(all('candidates')),runs:clone(runs),judgments:clone(judgments),decisions:clone(decisions),operations:clone(operations),
  measurementRows:runs.flatMap(run=>run.definition.metrics.map(metric=>({...clone(metric),caseId:c.id,caseVersionId:c.versionId,candidateId:run.candidateId,candidateVersionId:run.candidateVersionId,runId:run.id,externalRunId:run.definition.externalRunId,status:run.definition.status,kind:run.definition.kind}))),
  judgmentRows:judgments.map(j=>({...clone(j.definition),id:j.id,versionId:j.versionId,caseId:j.caseId,caseVersionId:j.caseVersionId})),
  sourceEditions:clone(state.editions.filter(e=>editionIds.has(e.id))),
  limitations:['Measurements are retained producer output; this workspace does not recompute or rank them.','A shared criterion label does not establish a shared cohort, denominator, protocol or price year. Compare each retained run definition and original files.','Manual judgments are separate from measurements. Earlier case, candidate and judgment versions remain retained; explicit decisions identify exact versions.','Reference-only source editions retain their original reference and terms; their remote contents are not added by this report.']};
}
