// MIT. Customer procedures composed from the original OperatingPlan model.
import {
 createOperatingPlan,createOperatingStep,snapshotRegistration,inspectOperatingPlan,
 operatingPlanDraft,saveOperatingPlanRevision,receiveOperatingPlan,
 renderOperatingPlanMarkdown,renderOperatingPlanHTML
} from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
import {
 inspectOperatingPlanReturn,createOperatingPlanReturn,compareOperatingPlanReturn,decideOperatingPlanReturn,
 applyOperatingPlanReturn
} from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan-return.mjs';

export const PROCEDURE_SCHEMA='stellar-forge.lightdash-operating-procedure.v1';
export const CAPTURE_SCHEMA='stellar-forge.lightdash-operating-capture.v1';
const clone=x=>structuredClone(x);
const need=(v,m)=>{if(!v){const e=new Error(m);e.code='LIGHTDASH_PROCEDURE_INVALID';throw e;}};
const only=(v,keys)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),'Use the complete documented fields.');
const id=v=>need(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v),'Use the original nonempty ID.');
const unique=values=>new Set(values).size===values.length;
const sha=v=>need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'Retain the complete original SHA256.');
const text=(v,max=32000)=>need(typeof v==='string'&&v.length<=max&&!v.includes('\0'),'Use bounded text without NUL.');
const at=v=>need(typeof v==='string'&&new Date(v).toISOString()===v,'Use a canonical UTC timestamp.');
const json=v=>JSON.stringify(v,null,2);
export function inspectBindings(value){
 only(value,['workspaceId','sourceCommit','applicationManifestSha256','editions','reviews','operations','handovers']);
 id(value.workspaceId);need(/^[a-f0-9]{40}$/.test(value.sourceCommit),'Retain the installed source commit.');
 sha(value.applicationManifestSha256);
 for(const kind of ['editions','reviews','operations','handovers']){
  need(Array.isArray(value[kind])&&value[kind].length<=200,'Select at most 200 '+kind+'.');
  for(const row of value[kind]){id(row.id);id(row.stepId);}
  need(unique(value[kind].map(x=>x.id)),'Duplicate native '+kind+' selection.');
 }
 const all=['editions','reviews','operations','handovers'].flatMap(k=>value[k]);
 need(unique(all.map(x=>x.stepId)),'Each native selection needs its own original step.');
 for(const r of value.editions){only(r,['id','stepId','sourceSha256']);sha(r.sourceSha256);}
 for(const r of value.reviews){only(r,['id','stepId','baselineId','candidateId','baselineSha256','candidateSha256','connectionSha256']);id(r.baselineId);id(r.candidateId);sha(r.baselineSha256);sha(r.candidateSha256);sha(r.connectionSha256);}
 for(const r of value.operations){only(r,['id','stepId','action','editionId','requestSha256']);id(r.editionId);text(r.action,100);sha(r.requestSha256);}
 for(const r of value.handovers){only(r,['id','stepId']);}
 return clone(value);
}
export function inspectProcedure(value){
 only(value,['schema','id','workspaceId','createdAt','updatedAt','version','plan','bindings','captures','returns']);
 need(value.schema===PROCEDURE_SCHEMA&&Number.isSafeInteger(value.version)&&value.version>=1,'Use a saved commissioning procedure.');
 const plan=inspectOperatingPlan(value.plan),bindings=inspectBindings(value.bindings);
 need(value.id===plan.id&&value.workspaceId===bindings.workspaceId,'Procedure and source identities differ.');
 at(value.createdAt);at(value.updatedAt);
 need(Array.isArray(value.captures)&&Array.isArray(value.returns),'Retain complete observation and return history.');
 // A recipient may intentionally remove a bound step. A later capture then requires an explicit replacement plan.
 for(const c of value.captures){
  need(c.schema===CAPTURE_SCHEMA&&c.workspaceId===value.workspaceId,'An observation belongs to another workspace.');
  id(c.id);at(c.observedAt);need(Number.isSafeInteger(c.workspaceRevision)&&c.workspaceRevision>=0&&Array.isArray(c.rows),'Invalid original capture.');
 }
 need(unique(value.captures.map(x=>x.id)),'Repeated capture identity.');
 const selections=['editions','reviews','operations','handovers'].flatMap(kind=>bindings[kind].map(b=>({...b,kind})));
 for(const capture of value.captures){
  need(capture.atomicSnapshot===false&&unique(capture.rows.map(x=>x.stepId)),'Keep the original local observation semantics.');
  for(const row of capture.rows)need(selections.some(b=>b.stepId===row.stepId&&b.id===row.id&&b.kind===row.kind),'An observation lost its original source binding.');
 }
 for(const returned of value.returns){const r=inspectOperatingPlanReturn(returned);need(r.completion,'Retain completed return reviews only.');receiveOperatingPlan(plan,r.completion.plan);}
 need(unique(value.returns.map(x=>x.id)),'Repeated return review identity.');
 return {...clone(value),plan,bindings};
}
function selectedRows(snapshot,selection){
 need(snapshot&&snapshot.metadata&&Array.isArray(snapshot.editions)&&Array.isArray(snapshot.reviews)&&Array.isArray(snapshot.operations)&&Array.isArray(snapshot.handovers),'Read the complete original local workspace.');
 const pick=(kind,ids)=>ids.map(wanted=>{id(wanted);const row=snapshot[kind].find(x=>x.id===wanted);need(row,'Selected '+kind+' item is absent: '+wanted);return row;});
 only(selection,['editions','reviews','operations','handovers']);
 for(const key of ['editions','reviews','operations','handovers'])need(Array.isArray(selection[key])&&unique(selection[key])&&selection[key].length<=200,'Supply unique selected '+key+'.');
 return Object.fromEntries(Object.keys(selection).map(k=>[k,pick(k,selection[k])]));
}
export function createCommissioningProcedure({id:planId,title,customer='',purpose='',period='',owner='',receiving='',notes='',snapshot,selection,catalog,sourceCommit,applicationManifestSha256,savedAt}){
 const rows=selectedRows(snapshot,selection),registration=snapshotRegistration(catalog,'command:lightdash-project');
 need(registration.item.entry==='products/lightdash-commissioning/cli.mjs','Use the actual installed Lightdash command registration.');
 const bindings={workspaceId:snapshot.metadata.id,sourceCommit,applicationManifestSha256,editions:[],reviews:[],operations:[],handovers:[]},steps=[];
 const add=(kind,row,title,instruction,expectedResult,identity)=>{
  const stepId=kind+'-'+(bindings[kind].length+1);id(stepId);
  bindings[kind].push({id:row.id,stepId,...identity});
  steps.push(createOperatingStep({id:stepId,title,instruction,inputs:json({workspaceId:bindings.workspaceId,...identity,id:row.id}),
   expectedResult,owner,status:'planned',recordedResult:'',selection:registration,argv:[]}));
 };
 for(const row of rows.editions)add('editions',row,'Review source: '+(row.label??row.id),
  'Open this complete saved source edition in the commissioning workspace. Review the SQL/YAML and its full manifest before selecting it for work.',
  'The operator has reviewed the named source edition. Its presence alone does not approve a deployment.',{sourceSha256:row.sourceSha256});
 for(const row of rows.reviews)add('reviews',row,'Read source review: '+row.id,
  'Read the original review, decisions, baseline and candidate. Confirm that its connection and source selection apply to the intended work.',
  'Retain the original reviewer and source decisions; determine separately whether the proposed customer work is approved.',
  Object.fromEntries(['baselineId','candidateId','baselineSha256','candidateSha256','connectionSha256'].map(k=>[k,row[k]])));
 for(const row of rows.operations)add('operations',row,row.action+': '+row.id,
  'Review this exact original operation and its source/target selection in the commissioning workspace. Execute or reconcile it only through that existing product when authorized. This procedure does not dispatch it.',
  'Capture the saved terminal outcome, original request identity and artifact identities. Failed or interrupted work needs its original recovery.',
  {action:row.action,editionId:row.editionId,requestSha256:row.requestSha256});
 for(const row of rows.handovers)add('handovers',row,'Receive handover: '+row.id,
  'Download the complete original handover through the commissioning product. Verify its selected source/revision and open the included workspace before recording recipient acceptance.',
  'The original package is complete and the recipient separately records its actual reopen and acceptance.',{});
 need(steps.length>0,'Select at least one actual source, review, operation or handover.');
 const plan=createOperatingPlan({id:planId,title,customer,purpose,period,owner,receiving,notes,steps,savedAt});
 return inspectProcedure({schema:PROCEDURE_SCHEMA,id:planId,workspaceId:bindings.workspaceId,createdAt:savedAt,updatedAt:savedAt,version:1,plan,bindings,captures:[],returns:[]});
}
export function captureCommissioningProcedure(value,{snapshot,captureId,observedAt,stepIds}){
 const saved=inspectProcedure(value);id(captureId);at(observedAt);
 need(snapshot.metadata.id===saved.workspaceId,'Capture only this original workspace.');
 need(Array.isArray(stepIds)&&stepIds.length&&unique(stepIds),'Select explicit original steps to observe.');
 const prior=saved.captures.find(x=>x.id===captureId);
 need(!prior,'This capture ID already exists; replay its retained original request.');
 const draft=operatingPlanDraft(saved.plan),rows=[],selected=new Set(stepIds);
 const all=['editions','reviews','operations','handovers'].flatMap(kind=>saved.bindings[kind].map(binding=>({kind,binding})));
 need(stepIds.every(s=>all.some(x=>x.binding.stepId===s)),'Only native-bound steps can be captured.');
 for(const {kind,binding:b} of all.filter(x=>selected.has(x.binding.stepId))){
  const step=draft.content.steps.find(s=>s.id===b.stepId);need(step,'The selected step was removed. Keep history and prepare a new source selection.');
  const actual=snapshot[kind].find(x=>x.id===b.id);need(actual,'Original selected item no longer exists.');
  let evidence;
  if(kind==='editions'){
   need(actual.sourceSha256===b.sourceSha256,'The selected source edition changed.');
   evidence={kind,id:b.id,sourceSha256:actual.sourceSha256,fileCount:actual.fileCount??null,label:actual.label??'',observation:'SOURCE_PRESENT_REVIEW_NOT_INFERRED'};
  }else if(kind==='reviews'){
   for(const k of ['baselineId','candidateId','baselineSha256','candidateSha256','connectionSha256'])need(actual[k]===b[k],'The saved review selection changed.');
   evidence={kind,id:b.id,...Object.fromEntries(['baselineId','candidateId','baselineSha256','candidateSha256','connectionSha256','reviewedBy','note','decisions','createdAt'].map(k=>[k,actual[k]??null])),observation:'REVIEW_RECORDED_ACCEPTANCE_NOT_INFERRED'};
  }else if(kind==='operations'){
   for(const k of ['action','editionId','requestSha256'])need(actual[k]===b[k],'The original operation request changed.');
   const native=actual.nativeResult??null;
   evidence={kind,id:b.id,action:b.action,editionId:b.editionId,requestSha256:b.requestSha256,state:actual.status,
    dispatched:native?.dispatched??null,resultSha256:actual.resultSha256??null,
    artifacts:(native?.artifacts??[]).map(x=>({id:x.id,bytes:x.bytes,sha256:x.sha256,scope:x.scope})),
    artifactManifest:native?.artifactManifest?{bytes:native.artifactManifest.bytes,sha256:native.artifactManifest.sha256}:null,
    observation:'SAVED_LOCAL_RESULT'};
  }else{
   evidence={kind,id:b.id,state:actual.state,workspaceRevision:actual.workspaceRevision,includeOperatorPrivate:actual.includeOperatorPrivate,
    archive:actual.result?.archive?{bytes:actual.result.archive.bytes,sha256:actual.result.archive.sha256}:null,
    observation:'PACKAGE_STATE_RECIPIENT_ACCEPTANCE_NOT_INFERRED'};
  }
  const entry={stepId:b.stepId,...evidence};
  rows.push(entry);
  // Preserve all operator-authored prose and status. Actual native outcome is an immutable capture;
  // the operator decides how that observation affects the customer procedure.
 }
 const capture={schema:CAPTURE_SCHEMA,id:captureId,workspaceId:saved.workspaceId,workspaceRevision:snapshot.metadata.revision,observedAt,atomicSnapshot:false,rows};
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:observedAt,captures:[...saved.captures,capture]});
}
export function saveCommissioningProcedure(value,{draft,savedAt}){
 const saved=inspectProcedure(value),plan=saveOperatingPlanRevision(saved.plan,draft,{savedAt});
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan});
}
export function receiveCommissioningPlan(value,{incoming,savedAt}){
 const saved=inspectProcedure(value),whole=incoming?.schema===PROCEDURE_SCHEMA?inspectProcedure(incoming):null;
 if(whole)need(whole.id===saved.id&&whole.workspaceId===saved.workspaceId&&JSON.stringify(whole.bindings)===JSON.stringify(saved.bindings)&&whole.createdAt===saved.createdAt,'The returned complete procedure has another original source binding.');
 const result=receiveOperatingPlan(whole?.plan??incoming,saved.plan);
 const extend=(current,returned)=>{
  const count=Math.min(current.length,returned.length);
  need(current.slice(0,count).every((x,i)=>JSON.stringify(x)===JSON.stringify(returned[i])),'Native observation or return-review histories diverged. Keep both complete files and review their original source.');
  return clone(returned.length>current.length?returned:current);
 };
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan:result.plan,
  captures:whole?extend(saved.captures,whole.captures):saved.captures,returns:whole?extend(saved.returns,whole.returns):saved.returns});
}
export function reviewCommissioningReturn(value,{incoming,reviewId,reviewer,notes='',decisions=[],savedAt}){
 const saved=inspectProcedure(value);
 let review=createOperatingPlanReturn(saved.plan,incoming,{id:reviewId,reviewer,notes,createdAt:savedAt});
 need(Array.isArray(decisions),'Supply original return decisions.');
 for(const row of decisions){only(row,['key','decision']);review=decideOperatingPlanReturn(review,row.key,row.decision);}
 return {review,comparison:compareOperatingPlanReturn(review)};
}
export function applyCommissioningReturn(value,{review,savedAt}){
 const saved=inspectProcedure(value),result=applyOperatingPlanReturn(review,{current:saved.plan,savedAt});
 need(!saved.returns.some(x=>x.id===result.review.id),'This return review has already been applied; replay its retained request.');
 return inspectProcedure({...saved,version:saved.version+1,updatedAt:savedAt,plan:result.plan,returns:[...saved.returns,result.review]});
}
export function exportCommissioningProcedure(value,format='json'){
 const saved=inspectProcedure(value);
 if(format==='plan')return {filename:saved.id+'-plan.json',contentType:'application/json',content:json(saved.plan)+'\n'};
 if(format==='json')return {filename:saved.id+'-procedure.json',contentType:'application/json',content:json(saved)+'\n'};
 if(format==='markdown')return {filename:saved.id+'.md',contentType:'text/markdown',content:renderOperatingPlanMarkdown(saved.plan)+'\n\n## Recorded commissioning observations\n\n'+saved.captures.map(c=>'### '+c.observedAt+' · '+c.id+'\n\n'+json(c)+'\n').join('\n')};
 if(format==='html')return {filename:saved.id+'.html',contentType:'text/html',content:renderOperatingPlanHTML(saved.plan)};
 need(false,'Choose json, plan, markdown or html.');
}
