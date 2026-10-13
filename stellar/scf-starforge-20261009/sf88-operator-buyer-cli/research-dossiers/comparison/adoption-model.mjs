// MIT. Source-bound graph plans; all authored effects are ordinary comparison commands.
import {need,object,digest,jsonBytes} from '../../node/store.mjs';
import {clone,hash,same,comparisonInput,retainedRequest,parseRun} from './contracts.mjs';
import {comparisonModel,recordComparison} from './model.mjs';
import {validateReturnSourceDescriptor} from '../dossier-returns/source.mjs';
import {ADOPTION_SCHEMA,ADOPTION_PLAN_LIMIT,adoptionEvents,findPlan,planId,normalizePlan,envelope} from './adoption-contracts.mjs';
const kinds=['cases','candidates','runs','judgments','decisions'];
const rowKey=(kind,version)=>kind+':'+version;
const headRows=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
const metaKeys=new Set(['revision','previous','updatedAt','change','comparisonAdoptionEvents']);
const unchanged=state=>Object.fromEntries(Object.entries(state).filter(([k])=>!metaKeys.has(k)));
const pin=state=>({revision:state.revision,sha256:digest(jsonBytes(state))});
const failure=(code,detail,extra={})=>({code,detail,...extra});
export function adoptionGraph(state,caseVersionId,selection){
 const model=comparisonModel(state),c=model.cases.find(r=>r.versionId===caseVersionId);
 need(c,'ADOPTION_CASE_NOT_FOUND');
 const selected={candidates:new Map(),runs:new Map(),judgments:new Map(),decisions:new Map()};
 const add=(kind,key)=>{
  const r=model[kind].find(r=>r.versionId===key||kind==='runs'&&r.id===key);
  need(r&&r.caseId===c.id&&r.caseVersionId===c.versionId,'ADOPTION_RECORD_PROTOCOL_MISMATCH');
  if(selected[kind].has(r.versionId))return;
  selected[kind].set(r.versionId,r);
  if(kind==='runs')add('candidates',r.candidateVersionId);
  if(kind==='judgments'){add('candidates',r.definition.candidateVersionId);for(const v of r.definition.runIds)add('runs',v);}
  if(kind==='decisions'){
   for(const v of r.definition.candidateVersionIds)add('candidates',v);
   for(const v of r.definition.runIds)add('runs',v);
   for(const v of r.definition.judgmentVersionIds)add('judgments',v);
  }
 };
 for(const [kind,field]of [['candidates','candidateVersionIds'],['runs','runIds'],['judgments','judgmentVersionIds'],['decisions','decisionVersionIds']])
  for(const key of selection[field])add(kind,key);
 const result={cases:[c]};
 for(const kind of Object.keys(selected))result[kind]=[...selected[kind].values()].sort((a,b)=>a.versionId.localeCompare(b.versionId));
 need(Object.values(result).reduce((n,rows)=>n+rows.length,0)<=1001,'ADOPTION_GRAPH_TOO_LARGE');
 const refs=Object.values(result).flat().flatMap(r=>r.definition.sourceRefs??r.definition.input?.sourceRefs??[]);
 result.editionIds=[...new Set(refs.map(r=>r.editionId))].sort();
 return result;
}
export function sourceBindings(current,incoming,graph){
 return graph.editionIds.map(editionId=>{
  const original=incoming.editions.find(e=>e.id===editionId),selected=current.editions.find(e=>e.id===editionId);
  need(original,'ADOPTION_SOURCE_EDITION_NOT_FOUND');
  return{editionId,status:!selected?'MISSING':same(original,selected)?'EXACT':'DIFFERENT',original:clone(original),current:clone(selected??null)};
 });
}
export function adoptionProgress(state,plan){
 normalizePlan(plan);
 const all=state.comparisonEvents??[],operations=[];let absent=false;
 for(const step of plan.steps){
  const event=all.find(e=>e.requestId===step.requestId);
  if(!event){absent=true;continue;}
  need(!absent&&event.requestSha256===step.requestSha256&&event.action===step.action&&
   event.dossierRevision===step.expectedRevision+1&&event.record.id===step.targetId&&
   event.record.versionId===step.targetVersionId,'ADOPTION_NATIVE_REQUEST_CHANGED');
  operations.push(clone(event));
 }
 const completed=new Set(operations.map(e=>e.requestId));
 const mappings=plan.mappings.filter(m=>!m.requestId||completed.has(m.requestId)).map(clone);
 const successor=adoptionEvents(state).find(p=>p.request.continuationOf===plan.id);
 const next=plan.steps[operations.length]??null;
 return{completed:operations.length,total:plan.steps.length,nextIndex:next?operations.length:null,operations,mappings,
  status:successor?'SUPERSEDED':!next?'COMPLETE':state.revision===next.expectedRevision?'READY':'NEEDS_REVIEW',
  successorPlanId:successor?.id??null,conflict:next&&state.revision!==next.expectedRevision?
   {expectedRevision:next.expectedRevision,currentRevision:state.revision}:null};
}
export function adoptionResult(state,plan,{duplicate=false}={}){
 const progress=adoptionProgress(state,plan),{status,successorPlanId,conflict,...publicProgress}=progress;
 return envelope(state,{planId:plan.id,requestId:plan.request.requestId,status:status==='READY'?'NEEDS_REVIEW':status,
  duplicate,plan:clone(plan),progress:publicProgress,successorPlanId,conflict});
}
async function preparedRun(run,readContent){
 const bytes=await readContent(run.raw);
 need(Buffer.isBuffer(bytes)&&bytes.length===run.raw.bytes&&digest(bytes)===run.raw.sha256,'ADOPTION_RAW_RUN_CHANGED');
 const rawText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);need(Buffer.from(rawText).equals(bytes),'ADOPTION_RAW_UTF8_CHANGED');
 const parsed=parseRun(rawText);
 need(same(parsed.artifacts.map(f=>f.metadata),run.artifacts),'ADOPTION_ARTIFACT_CHANGED');
 for(const f of parsed.artifacts){const b=await readContent(f.metadata);need(Buffer.isBuffer(b)&&b.equals(f.body),'ADOPTION_ARTIFACT_CHANGED');}
 return{rawText,value:parsed.value,raw:clone(run.raw),artifacts:clone(run.artifacts)};
}
function rootSpec(current,request){
 if(!request.continuationOf)return{spec:request,parent:null,inherited:[]};
 const parent=findPlan(current,request.continuationOf);need(parent,'ADOPTION_PLAN_NOT_FOUND');
 need(!adoptionEvents(current).some(p=>p.request.continuationOf===parent.id),'ADOPTION_ALREADY_SUPERSEDED');
 const progress=adoptionProgress(current,parent);need(progress.status!=='COMPLETE','ADOPTION_ALREADY_COMPLETE');
 return{spec:parent.spec,parent,inherited:progress.mappings};
}
export async function buildAdoptionPlan({current,incoming,source,ancestor,request,readContent}){
 need(current.id===incoming.id&&source.dossierId===current.id,'ADOPTION_DOSSIER_MISMATCH');
 need(request.expectedRevision===current.revision,'REVISION_CONFLICT');
 validateReturnSourceDescriptor(source);
 need(source.incomingHead.revision===incoming.revision&&source.incomingHead.sha256===digest(jsonBytes(incoming)),'ADOPTION_SOURCE_CHANGED');
 const {spec,parent,inherited}=rootSpec(current,request);
 need(spec.sourceId===source.id,'ADOPTION_SOURCE_CHANGED');
 const graph=adoptionGraph(incoming,spec.caseVersionId,spec.selection),c=graph.cases[0];
 const issues=[],bindings=sourceBindings(current,incoming,graph);
 for(const row of bindings)if(row.status!=='EXACT')issues.push(failure('ADOPTION_SOURCE_'+row.status,'Receive and explicitly review this exact ordinary source edition through Returned work before adoption.',{editionId:row.editionId}));
 const question=incoming.questions.find(q=>q.id===c.definition.questionId),localQuestion=current.questions.find(q=>q.id===c.definition.questionId);
 if(!localQuestion)issues.push(failure('ADOPTION_QUESTION_MISSING','Receive and review the original question through Returned work first.',{recordId:c.definition.questionId}));
 else if(!same(question,localQuestion))issues.push(failure('ADOPTION_QUESTION_DIFFERENT','Review the changed question against the exact returned question through the original Returned work workflow before adoption.',{recordId:c.definition.questionId}));
 const model=comparisonModel(current),targetSpecs=new Map(spec.candidateTargets.map(t=>[t.sourceVersionId,t]));
 const candidateIds=new Set(graph.candidates.map(r=>r.versionId));
 for(const candidate of graph.candidates)if(!targetSpecs.has(candidate.versionId))issues.push(failure('ADOPTION_CANDIDATE_TARGET_REQUIRED','Select NEW or an exactly equivalent existing candidate for this dependency.',{recordId:candidate.versionId}));
 for(const key of targetSpecs.keys())if(!candidateIds.has(key))issues.push(failure('ADOPTION_CANDIDATE_TARGET_UNUSED','Remove a mapping outside the selected dependency closure.',{recordId:key}));
 const resultBase={schema:ADOPTION_SCHEMA,dossierId:current.id,id:planId(current.id,request.requestId),
 request:clone(request),spec:clone(spec),source:clone(source),base:pin(current),ancestor:clone(ancestor),
 committedRevision:current.revision+1,case:clone(c),sourceQuestion:clone(question),currentQuestion:clone(localQuestion??null),
 selection:Object.fromEntries([['candidateVersionIds',graph.candidates],['runIds',graph.runs],['judgmentVersionIds',graph.judgments],['decisionVersionIds',graph.decisions]].map(([k,v])=>[k,v.map(r=>r.versionId)])),
 sourceBindings:bindings,mappings:[],steps:[]};
 if(issues.length)return{eligible:false,issues,plan:resultBase,previewSha256:null};
 const scratch=clone(current);scratch.revision=current.revision+1;
 const inheritedMap=new Map(inherited.map(m=>[rowKey(m.sourceKind,m.sourceVersionId),m]));
 const mappings=resultBase.mappings,steps=resultBase.steps,map=new Map();
 const saveMap=(kind,original,target,mode,requestId=null)=>{
  const row={sourceKind:kind,sourceId:original.id,sourceVersionId:original.versionId,targetId:target.id,
   targetVersionId:target.versionId,mode,requestId};
  mappings.push(row);map.set(rowKey(kind,original.versionId),row);return row;
 };
 const mapped=(kind,key)=>{const m=map.get(rowKey(kind,key));need(m,'ADOPTION_DEPENDENCY_MAPPING_MISSING');return m;};
 const preserve=(kind,r)=>{
  const m=inheritedMap.get(rowKey(kind,r.versionId));if(!m)return false;
  const target=model[kind].find(v=>v.id===m.targetId&&v.versionId===m.targetVersionId);
  need(target,'ADOPTION_ACCEPTED_TARGET_CHANGED');
  saveMap(kind,r,target,'ACCEPTED');return true;
 };
 const addStep=async(kind,original,action,payload,prepared=null)=>{
  const requestId='cmpadopt-step_'+hash({adoptionId:resultBase.id,kind,sourceVersionId:original.versionId});
  const native=comparisonInput({requestId,expectedRevision:scratch.revision,actor:request.actor,action,payload});
  const operation=recordComparison(scratch,native,request.reviewedAt,prepared),r=operation.record;
  steps.push({index:steps.length,sourceKind:kind,sourceVersionId:original.versionId,requestId,action,
   expectedRevision:native.expectedRevision,targetId:r.id,targetVersionId:r.versionId,
   request:retainedRequest(native,prepared?.raw),requestSha256:hash(native)});
  saveMap(kind,original,r,'NEW',requestId);scratch.revision++;
 };
 try{
  if(!preserve('cases',c)){
   const t=spec.caseTarget;
   if(t.mode==='EXISTING'){
    const selected=model.cases.find(r=>r.id===t.caseId&&r.versionId===t.caseVersionId);
    need(selected&&same(selected.definition,c.definition),'ADOPTION_CASE_DEFINITION_MISMATCH');
    saveMap('cases',c,selected,'EXISTING');
   }else{
    let previous=null;
    if(t.mode==='NEW_PROTOCOL'){
     const latest=model.cases.findLast(r=>r.id===t.caseId);
     need(latest&&latest.definition.questionId===c.definition.questionId,'ADOPTION_CASE_TARGET_MISMATCH');
     need(parent||latest.versionId===t.caseVersionId,'ADOPTION_CASE_TARGET_STALE');
     previous=latest;
    }
    await addStep('cases',c,'case.save',{caseId:previous?.id??null,previousVersionId:previous?.versionId??null,definition:clone(c.definition)});
   }
  }
  const targetCase=mapped('cases',c.versionId);
  for(const candidate of graph.candidates){
   if(preserve('candidates',candidate))continue;
   const t=targetSpecs.get(candidate.versionId);
   if(t.mode==='EXISTING'){
    const selected=model.candidates.find(r=>r.versionId===t.targetVersionId);
    need(selected&&selected.caseId===targetCase.targetId&&selected.caseVersionId===targetCase.targetVersionId&&
     same(selected.definition,candidate.definition),'ADOPTION_CANDIDATE_DEFINITION_MISMATCH');
    saveMap('candidates',candidate,selected,'EXISTING');
   }else await addStep('candidates',candidate,'candidate.save',{caseId:targetCase.targetId,caseVersionId:targetCase.targetVersionId,
    candidateId:null,previousVersionId:null,definition:clone(candidate.definition)});
  }
  for(const run of graph.runs){
   if(preserve('runs',run))continue;
   const prepared=await preparedRun(run,readContent);
   await addStep('runs',run,'run.import',{caseId:targetCase.targetId,caseVersionId:targetCase.targetVersionId,
    candidateVersionId:mapped('candidates',run.candidateVersionId).targetVersionId,rawText:prepared.rawText},prepared);
  }
  for(const judgment of graph.judgments){
   if(preserve('judgments',judgment))continue;
   const definition=clone(judgment.definition);
   definition.candidateVersionId=mapped('candidates',definition.candidateVersionId).targetVersionId;
   definition.runIds=definition.runIds.map(v=>mapped('runs',v).targetId);
   await addStep('judgments',judgment,'judgment.save',{caseId:targetCase.targetId,caseVersionId:targetCase.targetVersionId,
    judgmentId:null,previousVersionId:null,definition});
  }
  for(const decision of graph.decisions){
   if(preserve('decisions',decision))continue;
   const definition=clone(decision.definition);
   definition.candidateVersionIds=definition.candidateVersionIds.map(v=>mapped('candidates',v).targetVersionId);
   definition.runIds=definition.runIds.map(v=>mapped('runs',v).targetId);
   definition.judgmentVersionIds=definition.judgmentVersionIds.map(v=>mapped('judgments',v).targetVersionId);
   await addStep('decisions',decision,'decision.save',{caseId:targetCase.targetId,caseVersionId:targetCase.targetVersionId,
    decisionId:null,previousVersionId:null,definition});
  }
 }catch(error){
  if(typeof error.code==='string'&&(error.code.startsWith('ADOPTION_')||error.code.startsWith('COMPARISON_')))
   return{eligible:false,issues:[failure(error.code,'Review the selected target, source or dependency binding before accepting.',{details:error.details??null})],plan:resultBase,previewSha256:null};
  throw error;
 }
 need(jsonBytes(resultBase).length<=ADOPTION_PLAN_LIMIT,'ADOPTION_PLAN_TOO_LARGE');
 return{eligible:true,issues:[],plan:resultBase,previewSha256:hash(resultBase)};
}
export function finalizePlan(preview){
 need(preview.eligible&&preview.previewSha256===hash(preview.plan),'ADOPTION_PREVIEW_INVALID');
 return normalizePlan({...clone(preview.plan),previewSha256:preview.previewSha256,
  requestSha256:hash({...preview.plan.request,previewSha256:preview.previewSha256})});
}
export function adoptionBlobMetadata(state){
 const unique=new Map();
 for(const p of adoptionEvents(state)){
  normalizePlan(p);validateReturnSourceDescriptor(p.source);
  for(const row of p.source.chunks){const old=unique.get(row.sha256);need(!old||old.bytes===row.bytes,'ADOPTION_SOURCE_CHANGED');unique.set(row.sha256,clone(row));}
 }
 return[...unique.values()];
}
export async function validateAdoptionState(state,readContent,cache=new Map()){
 const plans=adoptionEvents(state);need(Array.isArray(plans)&&plans.length<=1000,'ADOPTION_HISTORY_INVALID');
 const ids=new Set(),requests=new Set(),parents=new Set();let revision=1;
 for(const plan of plans){
  normalizePlan(plan);
  need(plan.dossierId===state.id&&!ids.has(plan.id)&&!requests.has(plan.request.requestId)&&
   plan.committedRevision>revision&&plan.committedRevision<=state.revision,'ADOPTION_HISTORY_INVALID');
  if(plan.request.continuationOf){
   need(ids.has(plan.request.continuationOf)&&!parents.has(plan.request.continuationOf),'ADOPTION_CONTINUATION_INVALID');
   parents.add(plan.request.continuationOf);
  }
  ids.add(plan.id);requests.add(plan.request.requestId);revision=plan.committedRevision;
  adoptionProgress(state,plan);
 }
 for(const row of adoptionBlobMetadata(state)){
  const key='comparison-adoption-blob:'+row.sha256+':'+row.bytes;
  if(cache.has(key))continue;
  const bytes=await readContent(row);need(Buffer.isBuffer(bytes)&&bytes.length===row.bytes&&digest(bytes)===row.sha256,'ADOPTION_SOURCE_CHANGED');cache.set(key,true);
 }
}
export async function validateAdoptionTransition(previous,state,{readSourceBranch,historyPin}){
 const before=previous?adoptionEvents(previous):[],after=adoptionEvents(state);
 need(after.length>=before.length&&after.length<=before.length+1&&before.every((v,i)=>same(v,after[i])),'ADOPTION_HISTORY_CHANGED');
 if(after.length===before.length)return false;
 need(previous&&same(unchanged(previous),unchanged(state)),'ADOPTION_UNRELATED_STATE_CHANGED');
 const plan=after.at(-1);normalizePlan(plan);
 need(plan.base.revision===previous.revision&&plan.base.sha256===digest(jsonBytes(previous))&&
  plan.committedRevision===state.revision,'ADOPTION_PLAN_REVISION_INVALID');
 await readSourceBranch(plan.source,async branch=>{
  need(branch.id===state.id&&branch.head.sha256===plan.source.incomingHead.sha256,'ADOPTION_SOURCE_CHANGED');
  const shared=branch.pins.filter(p=>p.revision<=previous.revision&&historyPin(p.revision)===p.sha256).at(-1);
  need(shared&&same(plan.ancestor,{revision:shared.revision,sha256:shared.sha256}),'ADOPTION_ANCESTOR_CHANGED');
  const preview=await buildAdoptionPlan({current:previous,incoming:branch.head.state,source:plan.source,
   ancestor:plan.ancestor,request:plan.request,readContent:branch.readContent});
  need(preview.eligible&&same(finalizePlan(preview),plan),'ADOPTION_PLAN_CHANGED');
 });
 return true;
}
export const adoptionTargets=state=>{const model=comparisonModel(state);return{cases:clone(headRows(model.cases)),protocols:clone(model.cases),candidates:clone(model.candidates)};};
