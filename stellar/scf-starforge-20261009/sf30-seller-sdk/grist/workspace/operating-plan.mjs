// MIT. Customer procedures composed from the original OperatingPlan model.
import {
 createOperatingPlan,createOperatingStep,snapshotRegistration,inspectOperatingPlan,
 operatingPlanDraft,saveOperatingPlanRevision,receiveOperatingPlan,
 renderOperatingPlanMarkdown,renderOperatingPlanHTML
} from '../../../distribution/discovery/operating-plan.mjs';
import {
 inspectOperatingPlanReturn,createOperatingPlanReturn,compareOperatingPlanReturn,decideOperatingPlanReturn,
 applyOperatingPlanReturn
} from '../../../distribution/discovery/operating-plan-return.mjs';

export const PROCEDURE_SCHEMA='stellar-forge.grist-operating-procedure.v1';
export const CAPTURE_SCHEMA='stellar-forge.grist-operating-capture.v1';
export const SOURCE_KINDS=Object.freeze(['documents','discoveries','captures','versions','operations']);
const clone=x=>structuredClone(x);
const need=(v,m)=>{if(!v){const e=new TypeError(m);e.code='GRIST_PROCEDURE_INVALID';e.status=422;throw e;}};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const only=(v,keys)=>need(plain(v)&&Object.keys(v).every(k=>keys.includes(k)),'Use the complete documented fields.');
const id=v=>need(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v),'Use the original nonempty ID.');
const unique=a=>new Set(a).size===a.length;
const sha=v=>need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'Retain the exact original SHA256.');
const at=v=>need(typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'Use a canonical UTC timestamp.');
const json=v=>JSON.stringify(v,null,2);
const stable=v=>Array.isArray(v)?v.map(stable):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function origin(value){
 only(value,['settingsSha256','createdAt']);sha(value.settingsSha256);at(value.createdAt);return clone(value);
}
export function inspectProcedure(value){
 only(value,['schema','id','origin','createdAt','updatedAt','version','plan','bindings','captures','returns']);
 need(value.schema===PROCEDURE_SCHEMA&&Number.isSafeInteger(value.version)&&value.version>=1,'Use a saved Grist procedure.');
 id(value.id);origin(value.origin);at(value.createdAt);at(value.updatedAt);
 const plan=inspectOperatingPlan(value.plan);need(plan.id===value.id,'The original plan ID differs.');
 need(Array.isArray(value.bindings)&&value.bindings.length<=1000,'Retain every original source binding.');
 for(const b of value.bindings){
  only(b,['kind','id','stepId','identitySha256','identity']);id(b.id);id(b.stepId);sha(b.identitySha256);
  need(SOURCE_KINDS.includes(b.kind)&&plain(b.identity),'Retain the original source identity.');
 }
 need(unique(value.bindings.map(b=>b.kind+':'+b.id))&&unique(value.bindings.map(b=>b.stepId)),'Repeated source or step binding.');
 need(Array.isArray(value.captures)&&Array.isArray(value.returns),'Retain complete observation and return histories.');
 for(const c of value.captures){
  only(c,['schema','id','origin','observedAt','authoringState','atomicSnapshot','nativeDispatch','rows']);
  need(c.schema===CAPTURE_SCHEMA&&equal(origin(c.origin),value.origin)&&c.atomicSnapshot===false&&c.nativeDispatch===false,
   'Retain the original local observation semantics.');
  id(c.id);at(c.observedAt);need(plain(c.authoringState)&&Array.isArray(c.rows)&&c.rows.length>0,'Retain the full selected observation.');
  need(unique(c.rows.map(r=>r.stepId)),'Repeated observed step.');
  for(const r of c.rows){
   only(r,['kind','id','stepId','identitySha256','observation']);
   const bound=value.bindings.find(b=>b.stepId===r.stepId);
   need(bound&&bound.kind===r.kind&&bound.id===r.id&&bound.identitySha256===r.identitySha256&&plain(r.observation),
    'An observation differs from its original source binding.');
  }
 }
 need(unique(value.captures.map(c=>c.id)),'Repeated capture ID.');
 for(const returned of value.returns){
  const r=inspectOperatingPlanReturn(returned);need(r.completion,'Keep completed return reviews.');
  const received=receiveOperatingPlan(r.completion.plan,plan);
  need(received.plan.revisions.length===plan.revisions.length,'The procedure must retain the complete result of every applied return.');
 }
 need(unique(value.returns.map(r=>r.id)),'Repeated return review.');
 return {...clone(value),plan};
}
export function createGristProcedure({id:planId,title,customer='',purpose='',period='',owner='',receiving='',notes='',snapshot,catalog,savedAt}){
 origin(snapshot.origin);need(Array.isArray(snapshot.rows)&&snapshot.rows.length<=1000,'Choose original saved Grist source items or an empty manual procedure.');
 const registration=snapshotRegistration(catalog,'command:grist-workspace');
 need(registration.item.entry==='stellar/scf-starforge-20261009/sf30-seller-sdk/grist/workspace/cli.mjs',
  'Use the original Grist authoring command registration.');
 const bindings=[],steps=[];
 for(const row of snapshot.rows){
  id(row.id);need(SOURCE_KINDS.includes(row.kind),'Choose an original Grist source kind.');
  const stepId=row.kind+'-'+(bindings.filter(b=>b.kind===row.kind).length+1);
  bindings.push({kind:row.kind,id:row.id,stepId,identitySha256:row.identitySha256,identity:clone(row.identity)});
  const labels={documents:'Review retained document catalog',discoveries:'Review table metadata',captures:'Review captured source',
   versions:'Review frozen source version',operations:'Reconcile original operation'};
  const instructions={documents:'Open this exact retained document catalog in the source workspace. Review the native document and table identities before selecting a table.',
   discoveries:'Open this saved table observation. Review its document, table reference, fields and source selection; refresh metadata only through a new explicit original operation.',
   captures:'Open this exact complete capture or its portable source packet. Review its typed records, selection and document-state checks before using the data.',
   versions:'Open this immutable source version and its original reviewer, note, projection and capture. Use the original publisher workflow for any separately authorized publication.',
   operations:'Inspect this original request and its retained input/result in the source workspace. Continue an interrupted request through its original Resume action; this procedure never dispatches it.'};
  steps.push(createOperatingStep({id:stepId,title:(labels[row.kind]+': '+row.title).slice(0,300),instruction:instructions[row.kind],
   inputs:json({kind:row.kind,id:row.id,identitySha256:row.identitySha256,identity:row.identity}),
   expectedResult:row.kind==='operations'?'Record the actual saved result and its limits. A failed, interrupted or merely present request is not evidence of successful delivery.':
    'Record the operator’s review separately. Retained source presence does not prove customer acceptance, publication or a fresh provider read.',
   owner,status:'planned',recordedResult:'',selection:registration,argv:[]}));
 }
 const plan=createOperatingPlan({id:planId,title,customer,purpose,period,owner,receiving,notes,steps,savedAt});
 return inspectProcedure({schema:PROCEDURE_SCHEMA,id:planId,origin:snapshot.origin,createdAt:savedAt,updatedAt:savedAt,
  version:1,plan,bindings,captures:[],returns:[]});
}
export function captureGristProcedure(value,{snapshot,captureId,observedAt,stepIds}){
 const saved=inspectProcedure(value);id(captureId);at(observedAt);
 need(equal(saved.origin,snapshot.origin),'Capture requires the original authoring settings identity; a received copy retains its original observations.');
 need(Array.isArray(stepIds)&&stepIds.length>0&&unique(stepIds),'Choose explicit original steps.');
 need(!saved.captures.some(c=>c.id===captureId),'Replay the original request for an existing capture.');
 const steps=operatingPlanDraft(saved.plan).content.steps,rows=[];
 for(const stepId of stepIds){
  const b=saved.bindings.find(b=>b.stepId===stepId),actual=b&&snapshot.rows.find(r=>r.kind===b.kind&&r.id===b.id);
  need(b&&steps.some(s=>s.id===stepId)&&actual,'The selected original source step is absent.');
  need(actual.identitySha256===b.identitySha256&&equal(actual.identity,b.identity),'The original source selection changed.');
  rows.push({kind:b.kind,id:b.id,stepId,identitySha256:b.identitySha256,observation:clone(actual.observation)});
 }
 const capture={schema:CAPTURE_SCHEMA,id:captureId,origin:saved.origin,observedAt,authoringState:clone(snapshot.authoringState),
  atomicSnapshot:false,nativeDispatch:false,rows};
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:observedAt,captures:[...saved.captures,capture]});
}
export function saveGristProcedure(value,{draft,savedAt}){
 const saved=inspectProcedure(value),plan=saveOperatingPlanRevision(saved.plan,draft,{savedAt});
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan});
}
export function receiveGristPlan(value,{incoming,savedAt}){
 const saved=inspectProcedure(value),whole=incoming?.schema===PROCEDURE_SCHEMA?inspectProcedure(incoming):null;
 if(whole)need(whole.id===saved.id&&equal(whole.origin,saved.origin)&&equal(whole.bindings,saved.bindings)&&whole.createdAt===saved.createdAt,
  'The returned procedure has another original source binding.');
 const result=receiveOperatingPlan(whole?.plan??incoming,saved.plan);
 const extend=(current,returned)=>{
  const n=Math.min(current.length,returned.length);
  need(current.slice(0,n).every((x,i)=>equal(x,returned[i])),'Observation or return histories diverged. Retain both complete files.');
  return clone(returned.length>current.length?returned:current);
 };
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan:result.plan,
  captures:whole?extend(saved.captures,whole.captures):saved.captures,returns:whole?extend(saved.returns,whole.returns):saved.returns});
}
export function reviewGristReturn(value,{incoming,reviewId,reviewer,notes='',decisions=[],savedAt}){
 const saved=inspectProcedure(value);
 // A complete returned procedure must preserve the native bindings. Its edited plan is reviewed field by field.
 const whole=incoming?.schema===PROCEDURE_SCHEMA?inspectProcedure(incoming):null;
 if(whole)need(whole.id===saved.id&&equal(whole.origin,saved.origin)&&equal(whole.bindings,saved.bindings),
  'The returned procedure selects different original source identities.');
 let review=createOperatingPlanReturn(saved.plan,whole?.plan??incoming,{id:reviewId,reviewer,notes,createdAt:savedAt});
 need(Array.isArray(decisions),'Supply explicit return decisions.');
 for(const row of decisions){only(row,['key','decision']);review=decideOperatingPlanReturn(review,row.key,row.decision);}
 return {review,comparison:compareOperatingPlanReturn(review)};
}
export function applyGristReturn(value,{review,savedAt}){
 const saved=inspectProcedure(value),result=applyOperatingPlanReturn(review,{current:saved.plan,savedAt});
 need(!saved.returns.some(r=>r.id===result.review.id),'Replay the original request for an applied return.');
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan:result.plan,returns:[...saved.returns,result.review]});
}
export function exportGristProcedure(value,format='json'){
 const saved=inspectProcedure(value);
 if(format==='plan')return {filename:saved.id+'-plan.json',contentType:'application/json',content:json(saved.plan)+'\n'};
 if(format==='json')return {filename:saved.id+'-procedure.json',contentType:'application/json',content:json(saved)+'\n'};
 if(format==='markdown')return {filename:saved.id+'.md',contentType:'text/markdown',content:renderOperatingPlanMarkdown(saved.plan)+
  '\n\n## Saved Grist source observations\n\n'+saved.captures.map(c=>'### '+c.observedAt+' · '+c.id+'\n\n'+json(c)+'\n').join('\n')};
 if(format==='html')return {filename:saved.id+'.html',contentType:'text/html',content:renderOperatingPlanHTML(saved.plan)};
 need(false,'Choose json, plan, markdown or html.');
}
