// MIT. Versioned comparison contracts over the original Research dossier.
import {digest,jsonBytes,need,object} from '../../node/store.mjs';
export const COMPARISON_SCHEMA='sf88-research-comparison/v1';
export const RUN_SCHEMA='sf88-research-comparison-run/v1';
export const MAX_RUN=64*1024*1024;
export const ACTIONS=Object.freeze(['case.save','candidate.save','run.import','judgment.save','decision.save']);
export const SECTIONS=Object.freeze(['overview','cases','case-editions','candidates','candidate-editions','runs','judgments','decisions','operations']);
export const clone=value=>structuredClone(value);
export const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const hash=value=>digest(jsonBytes(canonical(value)));
export const same=(a,b)=>hash(a)===hash(b);
export function fields(value,allowed,code='COMPARISON_FIELDS_INVALID'){
 need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),code);return value;
}
export function text(value,name,max=20000,empty=false){
 need(typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0),name);return value;
}
export function id(value,name='COMPARISON_ID_INVALID'){
 need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value),name);return value;
}
export function ids(value=[]){
 need(Array.isArray(value)&&value.length<=1000&&new Set(value).size===value.length,'COMPARISON_IDS_INVALID');
 return value.map(v=>id(v));
}
export function time(value){
 need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'COMPARISON_TIME_INVALID');return value;
}
export function actor(value){
 fields(value,['id','name'],'COMPARISON_ACTOR_INVALID');
 return{id:id(value.id),name:text(value.name,'COMPARISON_ACTOR_NAME_REQUIRED',200)};
}
export function sourceRefs(value=[]){
 need(Array.isArray(value)&&value.length<=500,'COMPARISON_SOURCES_INVALID');
 const result=value.map(v=>{fields(v,['editionId','locator','note']);
 return{editionId:id(v.editionId),locator:text(v.locator,'COMPARISON_SOURCE_LOCATOR_REQUIRED',4000),note:text(v.note??'','COMPARISON_SOURCE_NOTE_INVALID',12000,true)};});
 need(new Set(result.map(v=>v.editionId+'\n'+v.locator)).size===result.length,'COMPARISON_SOURCE_DUPLICATE');return result;
}
function json(value,max=1024*1024){
 need(object(value)&&jsonBytes(value).length<=max,'COMPARISON_JSON_INVALID');return clone(value);
}
export function caseDefinition(value){
 fields(value,['questionId','title','purpose','scope','criteria','sourceRefs']);
 need(Array.isArray(value.criteria)&&value.criteria.length<=100,'COMPARISON_CRITERIA_INVALID');
 const criteria=value.criteria.map(v=>{fields(v,['id','label','kind','unit','direction','description']);
 need(['MEASURED','JUDGMENT'].includes(v.kind)&&['HIGHER','LOWER','DESCRIPTIVE'].includes(v.direction),'COMPARISON_CRITERION_INVALID');
 return{id:id(v.id),label:text(v.label,'COMPARISON_CRITERION_LABEL_REQUIRED',240),kind:v.kind,
 unit:text(v.unit??'','COMPARISON_UNIT_INVALID',160,true),direction:v.direction,description:text(v.description??'','COMPARISON_CRITERION_DESCRIPTION_INVALID',12000,true)};});
 need(new Set(criteria.map(v=>v.id)).size===criteria.length,'COMPARISON_CRITERION_DUPLICATE');
 return{questionId:id(value.questionId),title:text(value.title,'COMPARISON_TITLE_REQUIRED',240),
 purpose:text(value.purpose,'COMPARISON_PURPOSE_REQUIRED'),scope:text(value.scope??'','COMPARISON_SCOPE_INVALID',40000,true),
 criteria,sourceRefs:sourceRefs(value.sourceRefs)};
}
export function candidateDefinition(value){
 fields(value,['name','kind','version','description','configuration','sourceRefs']);
 need(['MODEL','PLATFORM','ARCHITECTURE'].includes(value.kind),'COMPARISON_CANDIDATE_KIND_INVALID');
 return{name:text(value.name,'COMPARISON_CANDIDATE_NAME_REQUIRED',240),kind:value.kind,
 version:text(value.version,'COMPARISON_CANDIDATE_VERSION_REQUIRED',500),description:text(value.description??'','COMPARISON_DESCRIPTION_INVALID',40000,true),
 configuration:json(value.configuration??{}),sourceRefs:sourceRefs(value.sourceRefs)};
}
export function judgmentDefinition(value){
 fields(value,['candidateVersionId','criterionId','value','reviewer','reviewedAt','rationale','sourceRefs','runIds']);
 return{candidateVersionId:id(value.candidateVersionId),criterionId:id(value.criterionId),
 value:text(value.value,'COMPARISON_JUDGMENT_REQUIRED',20000),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),
 sourceRefs:sourceRefs(value.sourceRefs),runIds:ids(value.runIds)};
}
export function decisionDefinition(value){
 fields(value,['title','candidateVersionIds','runIds','judgmentVersionIds','reviewer','reviewedAt','recommendation','rationale','limitations','sourceRefs']);
 return{title:text(value.title,'COMPARISON_DECISION_TITLE_REQUIRED',240),candidateVersionIds:ids(value.candidateVersionIds),
 runIds:ids(value.runIds),judgmentVersionIds:ids(value.judgmentVersionIds),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),recommendation:text(value.recommendation,'COMPARISON_RECOMMENDATION_REQUIRED',20000),
 rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),limitations:text(value.limitations??'','COMPARISON_LIMITATIONS_INVALID',40000,true),
 sourceRefs:sourceRefs(value.sourceRefs)};
}
export function comparisonInput(value){
 fields(value,['requestId','expectedRevision','actor','action','payload']);
 need(ACTIONS.includes(value.action),'COMPARISON_ACTION_INVALID');
 need(Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=1,'REVISION_INVALID');
 const p=value.payload;let payload;
 if(value.action==='case.save'){
 fields(p,['caseId','previousVersionId','definition']);
 payload={caseId:p.caseId==null?null:id(p.caseId),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition:caseDefinition(p.definition)};
 need(Boolean(payload.caseId)===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }else if(value.action==='run.import'){
 fields(p,['caseId','caseVersionId','candidateVersionId','rawText']);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),candidateVersionId:id(p.candidateVersionId),
 rawText:text(p.rawText,'COMPARISON_RUN_JSON_REQUIRED',MAX_RUN)};
 need(Buffer.byteLength(payload.rawText)<=MAX_RUN,'COMPARISON_RUN_TOO_LARGE');
 }else{
 const kind=value.action.split('.')[0],key=kind+'Id';
 fields(p,['caseId','caseVersionId',key,'previousVersionId','definition']);
 const definition=kind==='candidate'?candidateDefinition(p.definition):kind==='judgment'?judgmentDefinition(p.definition):decisionDefinition(p.definition);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),[key]:p[key]==null?null:id(p[key]),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition};
 need(Boolean(payload[key])===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }
 return{requestId:id(value.requestId),expectedRevision:value.expectedRevision,actor:actor(value.actor),action:value.action,payload};
}
export function retainedRequest(request,raw){
 if(request.action!=='run.import')return clone(request);
 const {rawText,...payload}=request.payload;return{...clone(request),payload:{...clone(payload),raw}};
}
export function safePath(value){
 text(value,'COMPARISON_ARTIFACT_PATH_INVALID',1024);
 need(!value.startsWith('/')&&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(v=>v&&!['.','..'].includes(v)),
 'COMPARISON_ARTIFACT_PATH_INVALID');return value;
}
export function parseRun(rawText){
 let v;try{v=JSON.parse(rawText);}catch{need(false,'COMPARISON_RUN_JSON_INVALID');}
 fields(v,['schema','externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','metrics','artifacts','result','limitations']);
 need(v.schema===RUN_SCHEMA,'COMPARISON_RUN_SCHEMA_INVALID');
 id(v.externalRunId);need(['SOURCE_NATIVE','IMPORTED_MEASUREMENT','TRAINING_FIXTURE'].includes(v.kind),'COMPARISON_RUN_KIND_INVALID');
 need(['SUCCEEDED','FAILED','CANCELLED'].includes(v.status),'COMPARISON_RUN_STATUS_INVALID');
 time(v.startedAt);time(v.finishedAt);need(Date.parse(v.finishedAt)>=Date.parse(v.startedAt),'COMPARISON_RUN_TIME_ORDER');
 need(v.elapsedMs===null||Number.isFinite(v.elapsedMs)&&v.elapsedMs>=0,'COMPARISON_RUN_DURATION_INVALID');
 fields(v.engine,['name','version','command','runtime','configuration']);
 text(v.engine.name,'COMPARISON_ENGINE_REQUIRED',500);text(v.engine.version,'COMPARISON_ENGINE_VERSION_REQUIRED',500);
 need(Array.isArray(v.engine.command)&&v.engine.command.length<=1000&&v.engine.command.every(x=>typeof x==='string'&&x.length<=20000),'COMPARISON_COMMAND_INVALID');
 json(v.engine.runtime);json(v.engine.configuration);
 fields(v.input,['cohortId','protocolId','definition','sourceRefs','artifactIds']);
 id(v.input.cohortId);id(v.input.protocolId);json(v.input.definition);need(Array.isArray(v.input.sourceRefs)&&Array.isArray(v.input.artifactIds),'COMPARISON_INPUT_REFERENCES_REQUIRED');sourceRefs(v.input.sourceRefs);ids(v.input.artifactIds);
 need(Array.isArray(v.metrics)&&v.metrics.length<=10000,'COMPARISON_METRICS_INVALID');
 for(const m of v.metrics){
 fields(m,['id','criterionId','label','value','unit','undefinedReason','definition','denominator','cohortRef','artifactIds']);
 id(m.id);id(m.criterionId);text(m.label,'COMPARISON_METRIC_LABEL_REQUIRED',500);
 need(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value)||typeof m.value==='string'&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(m.value),'COMPARISON_METRIC_VALUE_INVALID');
 text(m.unit,'COMPARISON_METRIC_UNIT_REQUIRED',160);text(m.definition,'COMPARISON_METRIC_DEFINITION_REQUIRED',12000);
 text(m.undefinedReason??'','COMPARISON_UNDEFINED_REASON_REQUIRED',12000,m.value!==null);
 json(m.denominator);text(m.cohortRef,'COMPARISON_METRIC_COHORT_REQUIRED',1000);need(Array.isArray(m.artifactIds),'COMPARISON_METRIC_ARTIFACTS_REQUIRED');ids(m.artifactIds);
 }
 need(new Set(v.metrics.map(m=>m.id)).size===v.metrics.length,'COMPARISON_METRIC_DUPLICATE');
 need(Array.isArray(v.artifacts)&&v.artifacts.length<=2000,'COMPARISON_ARTIFACTS_INVALID');
 const artifacts=[],names=new Set(),identifiers=new Set();let total=0;
 for(const f of v.artifacts){
 fields(f,['id','path','role','mediaType','bytes','sha256','bodyBase64']);
 id(f.id);safePath(f.path);text(f.role,'COMPARISON_ARTIFACT_ROLE_REQUIRED',160);text(f.mediaType,'COMPARISON_ARTIFACT_TYPE_REQUIRED',240);
 need(!names.has(f.path)&&!identifiers.has(f.id),'COMPARISON_ARTIFACT_DUPLICATE');names.add(f.path);identifiers.add(f.id);
 need(Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_RUN&&typeof f.bodyBase64==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'COMPARISON_ARTIFACT_INVALID');
 const body=Buffer.from(f.bodyBase64,'base64');need(body.toString('base64')===f.bodyBase64&&body.length===f.bytes&&digest(body)===f.sha256,'COMPARISON_ARTIFACT_CHANGED');
 total+=body.length;need(total<=MAX_RUN,'COMPARISON_ARTIFACTS_TOO_LARGE');
 const {bodyBase64,...metadata}=f;artifacts.push({metadata,body});
 }
 need([...v.input.artifactIds,...v.metrics.flatMap(m=>m.artifactIds)].every(x=>identifiers.has(x)),'COMPARISON_ARTIFACT_REFERENCE_INVALID');
 json(v.result,MAX_RUN);
 need(Array.isArray(v.limitations)&&v.limitations.length<=1000&&v.limitations.every(x=>typeof x==='string'&&x.length<=12000),'COMPARISON_LIMITATIONS_INVALID');
 return{value:v,artifacts};
}
