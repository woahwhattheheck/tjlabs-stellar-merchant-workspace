// MIT. The original Central Store owns review state, originals and publication receiving.
import {randomUUID} from 'node:crypto';
import {receiveCentralDraft} from './draft-source.mjs';
import {digest, fault, stable, now, identifier} from '../../odata/state.mjs';
import {normalizeFormSource, normalizeReportingBindings, normalizeReportingTableBindings, reportingInventory, compareFormSources, formIdentity} from './impact.mjs';

export const FORM_REVIEW_SCHEMA='stellar-forge.odk-form-release-review.v1';
export const FORM_PLAN_SCHEMA='stellar-forge.odk-form-publication-plan.v1';
const clone=value=>structuredClone(value);
const kinds={snapshot:'form-release-source',review:'form-release-review',plan:'form-release-plan',publication:'form-release-publication'};
const equal=(a,b)=>stable(a)===stable(b);
const need=(value,code,message,status=400)=>{if(!value)throw fault(code,message,status);};
const id=(value,label)=>identifier(value??randomUUID(),label);
const note=(value,label)=>{need(typeof value==='string'&&value.trim(),'FORM_REVIEW_NOTE','Record '+label+'.');return value.trim();};
const sameForm=(value,form)=>String(value?.projectId)===String(form.projectId)&&value?.formId===form.formId;
const sourceValue=value=>{const {id,revision,createdAt,updatedAt,title,request,...source}=value;return source;};
const requireRevision=(record,value)=>need(Number.isSafeInteger(value)&&record.revision===value,'CENTRAL_REVISION_CHANGED','Reopen the current release review before saving changes.',409);

function dependenciesFor(store,source){
 const form=source.form,rows=[];const tableRows=source.reporting?.tables??[];
 function originalTable(table){return tableRows.find(value=>value.name===table);}
 function tables(table){
  const original=originalTable(table);
  return [{table,scope:table==='Submissions'?'form':'repeat',relation:clone(original?.relation??null),nativePath:table==='Submissions'?null:source.reporting?.tableBindings?.find(value=>value.table===table)?.path??null}];
 }
 function selectors(table,fields){
  const original=originalTable(table);
  const keys=new Set([...(original?.query?.keyFields??[]),...(original?.relation?.parentField?[original.relation.parentField]:[])]);
  return [...new Set(fields)].map(field=>({table,field,system:keys.has(field),nativePath:source.reporting?.bindings?.find(value=>value.table===table&&value.field===field)?.path??null}));
 }
 for(const record of store.list('commissioning')){
  const definition=record.definition;
  if(!definition||definition.connectionId&&form.connectionId&&definition.connectionId!==form.connectionId)continue;
  if(!definition.forms?.some(value=>sameForm(value,form)))continue;
  const definitionHash=record.definitionSha256??digest(stable(definition));
  const sourceRef={kind:'commissioning',id:record.id,definitionHash,periods:clone(definition.periods??[]),agreementSha256:definition.agreementSha256??null};
  for(const [index,output]of(definition.outputs??[]).entries()){
   if(!sameForm(output,form))continue;
   rows.push({id:'commissioning:'+record.id+':output:'+index,kind:'commissioned-output',label:output.name||'Commissioned output '+(index+1),definitionHash,tables:tables(output.table),selectors:selectors(output.table,output.fields??[]),source:sourceRef});
  }
  for(const [index,indicator]of(definition.indicators??[]).entries()){
   if(!sameForm(indicator,form))continue;
   rows.push({id:'commissioning:'+record.id+':indicator:'+index,kind:'indicator',label:indicator.name,definitionHash,tables:tables(indicator.table),selectors:selectors(indicator.table,indicator.field?[indicator.field]:[]),source:{...sourceRef,operation:indicator.operation,equals:indicator.equals??null}});
  }
 }
 for(const record of store.list('warehouse-approval')){
  const approval=record.approval;
  if(!approval?.table||!sameForm(approval.table,form))continue;
  if(approval.capture?.connectionId&&form.connectionId&&approval.capture.connectionId!==form.connectionId)continue;
  const fields=(approval.projection?.approvedFields??[]).map(value=>typeof value==='string'?value:value.path).filter(Boolean);
  rows.push({id:'warehouse:'+record.id,kind:'warehouse-projection',label:'Warehouse · '+(approval.period?.label??'Period')+' · '+approval.table.name,definitionHash:digest(stable(approval)),tables:tables(approval.table.name),selectors:selectors(approval.table.name,fields),source:{kind:'warehouse-approval',id:record.id,approval:clone(approval),intent:clone(record.intent??null)}});
 }
 return rows.sort((a,b)=>a.id.localeCompare(b.id));
}
const dependencyHash=rows=>digest(stable(rows.map(value=>({id:value.id,kind:value.kind,label:value.label,definitionHash:value.definitionHash,tables:value.tables??[],selectors:value.selectors??[],source:value.source??{}}))));

export function createCentralFormReleaseReview({workspace,store,authoring,fetchImpl=globalThis.fetch}={}){
  need(workspace&&store?.transaction&&store?.raw,'FORM_REVIEW_STORE','Use the existing original Central workspace and Store.');
  need(!authoring||typeof authoring.resolveCandidate==='function','FORM_REVIEW_AUTHORING','Compose the original authoring candidate resolver.');
  let active=0,closing=false,closePromise=null;
  const originalClose=workspace.close.bind(workspace),running=new Set(),draftReceiving=new Map();
  function operation(work){
    need(!closing,'CENTRAL_CLOSED','Reopen the Central workspace.');
    const promise=Promise.resolve().then(work);running.add(promise);active++;
    return promise.finally(()=>{running.delete(promise);active--;});
  }
  const snapshot=sourceId=>store.get(kinds.snapshot,sourceId);
  async function verifyReceipt(receipt,label){
    need(receipt?.sha256&&Number.isSafeInteger(receipt.bytes),'FORM_REVIEW_ORIGINAL','Retain the complete original '+label+' first.',409);
    const bytes=await store.raw(receipt.sha256);
    need(bytes.length===receipt.bytes,'FORM_REVIEW_ORIGINAL','The retained '+label+' byte count differs.',409);
    return bytes;
  }
  async function verifySource(source){
    await verifyReceipt(source.xml,'XForm');
    if(source.fields.sha256){
      const raw=await verifyReceipt(source.fields,'native fields');
      const original=JSON.parse(raw.toString('utf8'));
      need(equal(original,source.fields.values),'FORM_REVIEW_FIELDS','The field facts differ from their retained original source.',409);
    }else{
      const retained=await store.retain(Buffer.from(stable(source.fields.values)+'\n'));
      source.fields={...source.fields,...retained,origin:'retained-authoring-field-model'};
    }
    if(source.model){
      const retained=await store.retain(Buffer.from(stable(source.model)+'\n'));
      source.modelSource={...retained};
    }
    for(const item of source.media?.items??[])if(item.sha256)await verifyReceipt(item,'attachment '+item.name);
    return source;
  }
  function saveSource(sourceId,request,source,title){
    const normalized=normalizeFormSource(source),old=store.get(kinds.snapshot,sourceId,false);
    if(old){
      need(equal(old.request,request)&&old.contentHash===normalized.contentHash,'FORM_REVIEW_SOURCE_CHANGED','This source ID already retains a different original generation.',409);
      return old;
    }
    return store.put(kinds.snapshot,sourceId,{...normalized,request:clone(request),title:title||source.form.title||source.form.formId,createdAt:now()},0);
  }
  async function captureGeneration(capture,form,generation){
    need(generation.xml?.outcome==='retained'&&generation.fields?.outcome==='retained','FORM_REVIEW_GENERATION','Receive this generation’s original XForm and field schema in the existing capture.',409);
    const fields=JSON.parse((await verifyReceipt(generation.fields,'native fields')).toString('utf8'));
    await verifyReceipt(generation.xml,'XForm');
    return normalizeFormSource({form:{connectionId:capture.connectionId,projectId:String(form.projectId),formId:form.formId,
      version:generation.version,title:form.name,providerHash:generation.metadata?.hash??null},
      origin:{kind:'central-capture',captureId:capture.id,captureContentHash:capture.contentHash,formKey:form.key,
        metadata:clone(generation.metadata),sourceVersion:generation.version},
      xml:generation.xml,fields:{...generation.fields,values:fields},
      media:{...clone(generation.media),complete:generation.media?.expected!==null&&generation.media?.expected!==undefined&&
        generation.media?.present===generation.media?.expected&&!(generation.media?.missing?.length)},
      model:null,reporting:{catalogHash:form.catalogHash,service:form.catalog?.receipts?.service??null,
        metadata:form.catalog?.receipts?.metadata??null,
        tables:clone(capture.tables.filter(value=>value.formKey===form.key)),bindings:[]},
      history:[],coverage:{publishedVersionsComplete:form.versionsComplete===true}});
  }
  async function retainCapture(input){
    const sourceId=id(input.id,'form source ID'),request={captureId:input.captureId,formKey:input.formKey,version:input.version};
    const prior=store.get(kinds.snapshot,sourceId,false);
    if(prior){need(equal(prior.request,request),'FORM_REVIEW_REQUEST','Keep the original capture selection for this source ID.',409);return prior;}
    const capture=store.get('capture',input.captureId),form=capture.forms.find(value=>value.key===input.formKey);
    need(form,'FORM_REVIEW_FORM','Select an original form from this capture.',404);
    need(typeof input.version==='string','FORM_REVIEW_VERSION','Keep the original version string, including an explicit empty string.');
    const generation=form.generations?.find(value=>value.version===input.version);
    need(generation,'FORM_REVIEW_GENERATION','Select a retained published form generation.',404);
    const selected=await captureGeneration(capture,form,generation),history=[],missing=[];
    for(const value of form.generations??[]){
      if(value.version===input.version)continue;
      if(value.xml?.outcome==='retained'&&value.fields?.outcome==='retained')history.push(await captureGeneration(capture,form,value));
      else missing.push({version:value.version,xml:value.xml?.outcome??'absent',fields:value.fields?.outcome??'absent'});
    }
    selected.history=history;selected.coverage.historyMissing=missing;
    return saveSource(sourceId,request,selected,form.name);
  }
  async function retainDraft(input){
    const sourceId=id(input.id,'form source ID'),request={baselineId:input.baselineId,source:'current-central-draft'};
    const prior=store.get(kinds.snapshot,sourceId,false);
    if(prior){need(equal(prior.request,request),'FORM_REVIEW_REQUEST','Keep the original baseline for this draft receiving request.',409);return prior;}
    const current=draftReceiving.get(sourceId);
    if(current){need(equal(current.request,request),'FORM_REVIEW_REQUEST','This source ID is already receiving another selected draft.',409);return current.promise;}
    const baseline=snapshot(input.baselineId);
    need(['central-capture','central-published'].includes(baseline.origin?.kind),'FORM_REVIEW_BASELINE','Select a retained published form generation as the release baseline.');
    const promise=(async()=>{
      const source=await receiveCentralDraft({store,baseline,fetchImpl});
      return saveSource(sourceId,request,source,source.form.title??baseline.title);
    })();
    draftReceiving.set(sourceId,{request,promise});
    try{return await promise;}
    finally{if(draftReceiving.get(sourceId)?.promise===promise)draftReceiving.delete(sourceId);}
  }
  async function retainAuthoring(input){
    need(authoring,'FORM_REVIEW_AUTHORING','Open the composed authoring workspace to retain its compiled candidate.',409);
    const sourceId=id(input.id,'form source ID'),request={authoringId:input.authoringId,expectedRevision:input.expectedRevision};
    const prior=store.get(kinds.snapshot,sourceId,false);
    if(prior){need(equal(prior.request,request),'FORM_REVIEW_REQUEST','Keep the original authoring selection for this source ID.',409);return prior;}
    const result=await authoring.resolveCandidate({id:input.authoringId,expectedRevision:input.expectedRevision});
    need(result?.origin?.kind==='authoring','FORM_REVIEW_AUTHORING_SOURCE','Return the original compiled authoring source.');
    const source=await verifySource(clone(result));
    return saveSource(sourceId,request,source,result.title);
  }
  async function retainSource(input){
    const sourceId=id(input.id,'form source ID'),request=clone(input.request??{sourceIdentity:input.source?.origin});
    const source=await verifySource(clone(input.source));
    return saveSource(sourceId,request,source,input.title);
  }
  function assess(baselineId,candidateId,bindings,tableBindings){
   const baseline=snapshot(baselineId),candidate=snapshot(candidateId),dependencies=dependenciesFor(store,baseline);
   return compareFormSources({baseline:sourceValue(baseline),candidate:sourceValue(candidate),historical:baseline.history??[],dependencies,bindings,tableBindings});
  }
  function readiness(record){
   const baseline=snapshot(record.baselineId),current=dependenciesFor(store,baseline);
   const currentDependencyHash=dependencyHash(current),stale=currentDependencyHash!==record.assessment.dependencyHash;
   const latest=new Map(record.decisions.map(value=>[value.changeId,value]));
   const unresolved=record.assessment.changes.filter(value=>latest.get(value.id)?.decision==='revise'||value.severity==='review'&&!['accept','remap'].includes(latest.get(value.id)?.decision)).map(value=>value.id);
   const incompatible=record.assessment.changes.filter(value=>value.severity==='incompatible').map(value=>value.id);
   return {canApprove:!stale&&!unresolved.length&&!incompatible.length,unresolvedChangeIds:unresolved,incompatibleChangeIds:incompatible,staleDependencies:stale?current.map(value=>({id:value.id,label:value.label,definitionHash:value.definitionHash})):[],dependenciesChanged:stale,currentDependencyHash};
  }
  function getReview(input){
   const record=store.get(kinds.review,input.id);
   const baseline=snapshot(record.baselineId),candidate=snapshot(record.candidateId);
   const reporting=reportingInventory({baseline:sourceValue(baseline),candidate:sourceValue(candidate),dependencies:dependenciesFor(store,baseline),bindings:record.assessment.bindings??record.assessment.reporting?.bindings??[],tableBindings:record.assessment.tableBindings??record.assessment.reporting?.tableBindings??[]});
   return {...record,readiness:readiness(record),reporting};
  }
  function createReview(input){
   const reviewId=id(input.id,'release review ID'),request={baselineId:input.baselineId,candidateId:input.candidateId,name:input.name??'Form release review',
    ...(input.bindings===undefined?{}:{bindings:normalizeReportingBindings(input.bindings)}),
    ...(input.tableBindings===undefined?{}:{tableBindings:normalizeReportingTableBindings(input.tableBindings)})};
   const prior=store.get(kinds.review,reviewId,false);
   if(prior){need(equal(prior.request,request),'FORM_REVIEW_REQUEST','Keep the original comparison under this review ID.',409);return getReview({id:reviewId});}
   need(input.baselineId!==input.candidateId,'FORM_REVIEW_COMPARISON','Select the original baseline and a different candidate source.');
   const baseline=snapshot(input.baselineId),candidate=snapshot(input.candidateId);
   need(['central-capture','central-published'].includes(baseline.origin?.kind),'FORM_REVIEW_BASELINE','Select a retained published form generation as the release baseline.');
   need(formIdentity(baseline.form)===formIdentity(candidate.form),'FORM_REVIEW_TARGET','Select two sources for the same connection, project and form.');
   const assessment=assess(input.baselineId,input.candidateId,request.bindings??baseline.reporting?.bindings??[],request.tableBindings??baseline.reporting?.tableBindings??[]);
   store.put(kinds.review,reviewId,{schema:FORM_REVIEW_SCHEMA,request,name:request.name,baselineId:input.baselineId,candidateId:input.candidateId,status:'REVIEWING',assessment,decisions:[],approval:null,history:[],createdAt:now()},0);
   return getReview({id:reviewId});
  }
  function mapReports(input){
   const record=store.get(kinds.review,input.id);requireRevision(record,input.expectedRevision);
   const reviewer=note(input.reviewer,'the reviewer name'),reason=note(input.note,'the mapping decision');
   const bindings=normalizeReportingBindings(input.bindings);
   const tableBindings=normalizeReportingTableBindings(input.tableBindings??record.assessment.tableBindings??record.assessment.reporting?.tableBindings??[]);
   const baseline=snapshot(record.baselineId),candidate=snapshot(record.candidateId),dependencies=dependenciesFor(store,baseline);
   const inventory=reportingInventory({baseline:sourceValue(baseline),candidate:sourceValue(candidate),dependencies,bindings,tableBindings});
   need(!inventory.omittedBindings.length,'FORM_REVIEW_MAPPING','Map current original report selectors and repeat tables to explicitly retained fields and repeats.');
   const assessment=compareFormSources({baseline:sourceValue(baseline),candidate:sourceValue(candidate),historical:baseline.history??[],dependencies,bindings:inventory.bindings,tableBindings:inventory.tableBindings});
   const history=[...record.history,{kind:'mapping-review',reviewer,note:reason,at:now(),assessment:clone(record.assessment),decisions:clone(record.decisions),approval:clone(record.approval)}];
   store.put(kinds.review,record.id,{...record,assessment,history,decisions:[],approval:null,status:'REVIEWING'},record.revision);
   return getReview({id:record.id});
  }
  function decide(input){
    const record=store.get(kinds.review,input.id);requireRevision(record,input.expectedRevision);
    const reviewer=note(input.reviewer,'the reviewer name'),reason=note(input.note,'the release decision');
    need(['review','approve','revise'].includes(input.overall??'review'),'FORM_REVIEW_DECISION','Choose review, approve or revise.');
    need(Array.isArray(input.decisions),'FORM_REVIEW_DECISIONS','Supply the selected change decisions.');
    const at=now(),next=new Map(record.decisions.map(value=>[value.changeId,value]));
    for(const choice of input.decisions){
      const change=record.assessment.changes.find(value=>value.id===choice.changeId);
      need(change,'FORM_REVIEW_CHANGE','Choose a change from this exact assessment.',409);
      need(['accept','remap','revise'].includes(choice.decision),'FORM_REVIEW_DISPOSITION','Choose accept, remap or revise for this change.');
      next.set(change.id,{changeId:change.id,decision:choice.decision,note:note(choice.note,'the change disposition'),
        reviewer,at,assessmentHash:record.assessment.contentHash});
    }
    const updated={...record,decisions:[...next.values()],approval:null,
      status:input.overall==='revise'?'REVISION_REQUESTED':'REVIEWING',
      history:[...record.history,{kind:'staff-decision',reviewer,note:reason,at,overall:input.overall??'review',decisions:clone(input.decisions)}]};
    let plan=null;
    if(input.overall==='approve'){
      const ready=readiness(updated);
      need(ready.canApprove,'FORM_REVIEW_REMAINING','Resolve the listed changes and refresh any changed report definitions before approving this release.',409);
      const baseline=snapshot(record.baselineId),candidate=snapshot(record.candidateId);
      const base={schema:FORM_PLAN_SCHEMA,reviewId:record.id,assessmentHash:record.assessment.contentHash,
        baseline:{id:baseline.id,contentHash:baseline.contentHash,version:baseline.form.version,xml:baseline.xml},
        candidate:{id:candidate.id,contentHash:candidate.contentHash,form:clone(candidate.form),origin:clone(candidate.origin),
          xml:clone(candidate.xml),fields:clone(candidate.fields),model:clone(candidate.model),media:clone(candidate.media)},
        target:{connectionId:baseline.form.connectionId??null,projectId:baseline.form.projectId,formId:baseline.form.formId,
          expectedPublishedVersion:baseline.form.version,expectedPublishedXml:baseline.xml.sha256,
          candidateVersion:candidate.form.version,publishVersionParameter:null},
        dependencyHash:record.assessment.dependencyHash,reporting:clone(record.assessment.reporting),
        historical:clone(record.assessment.historical),decisions:clone(updated.decisions),approvedBy:reviewer,approvedAt:at,note:reason};
      const contentHash=digest(stable(base)),planId='form-plan-'+contentHash.slice(0,40);
      plan={...base,id:planId,contentHash};
      updated.approval={planId,planHash:contentHash,assessmentHash:record.assessment.contentHash,reviewer,at,note:reason};
      updated.status='APPROVED';
    }
    store.transaction(()=>{
      const current=store.get(kinds.review,record.id);requireRevision(current,record.revision);
      if(plan)store.writeRecord(kinds.plan,plan.id,plan,0);
      store.writeRecord(kinds.review,record.id,updated,record.revision);
    });
    return getReview({id:record.id});
  }
  function publicationPlan(input){
    const record=store.get(kinds.review,input.id);
    if(input.expectedRevision!==undefined)requireRevision(record,input.expectedRevision);
    need(record.approval,'FORM_REVIEW_APPROVAL','Approve this exact comparison to freeze its publication plan.',409);
    return store.get(kinds.plan,record.approval.planId);
  }
  function validatePublicationPlan(input){
    const plan=store.get(kinds.plan,input.planId),record=store.get(kinds.review,plan.reviewId),ready=readiness(record);
    need(record.status==='APPROVED'&&record.approval?.planId===plan.id&&ready.canApprove,'FORM_REVIEW_PLAN_CHANGED','Reopen the current approved source selection and reporting definitions.',409);
    need(input.candidateContentHash===plan.candidate.contentHash,'FORM_REVIEW_CANDIDATE_CHANGED','The native authoring candidate differs from the approved source.',409);
    need(equal(input.target,plan.target),'FORM_REVIEW_NATIVE_TARGET','Use the exact approved native destination and final version.',409);
    return plan;
  }
  async function receivePublication(input){
    const publicationId=id(input.id,'publication receiving ID'),plan=store.get(kinds.plan,input.planId);
    const source=normalizeFormSource(await verifySource(clone(input.source)));
    const request={planId:plan.id,sourceHash:source.contentHash},prior=store.get(kinds.publication,publicationId,false);
    if(prior){need(equal(prior.request,request),'FORM_REVIEW_RECEIVING_CHANGED','Keep this original receiving operation and published source.',409);return prior;}
    need(source.origin.kind==='central-published','FORM_REVIEW_PUBLISHED_ORIGINAL','Receive the original published-version response and files.');
    const differences=[];
    if(formIdentity(source.form)!==formIdentity(plan.candidate.form))differences.push('target');
    if(source.form.version!==plan.target.candidateVersion)differences.push('version');
    if(source.xml.sha256!==plan.candidate.xml.sha256)differences.push('XForm');
    const media=value=>value.items.map(item=>({name:item.name,sha256:item.sha256??null,datasetExists:item.datasetExists??false})).sort((a,b)=>a.name.localeCompare(b.name));
    if(!equal(media(source.media),media(plan.candidate.media)))differences.push('attachments');
    if(!equal(source.fields.values,plan.candidate.fields.values))differences.push('fields');
    const result={schema:'stellar-forge.odk-form-publication-receiving.v1',request,planId:plan.id,reviewId:plan.reviewId,
      outcome:differences.length?'RECEIVED_DIFFERENT':'MATCHED',differences,source,receivedAt:now()};
    return store.put(kinds.publication,publicationId,result,0);
  }
  async function state(){
    const captures=store.list('capture').map(capture=>({id:capture.id,name:capture.name??capture.id,status:capture.status,
      forms:capture.forms.map(form=>({key:form.key,projectId:form.projectId,formId:form.formId,name:form.name,
        generations:(form.generations??[]).map(value=>({version:value.version,received:value.xml?.outcome==='retained'&&value.fields?.outcome==='retained'}))}))}));
    const snapshots=store.list(kinds.snapshot).map(({id,revision,title,form,origin,contentHash,createdAt})=>({id,revision,title,form,origin,contentHash,createdAt}));
    const reviews=store.list(kinds.review).map(record=>({id:record.id,revision:record.revision,name:record.name,status:record.status,
      baselineId:record.baselineId,candidateId:record.candidateId,assessment:{summary:record.assessment.summary},updatedAt:record.updatedAt,readiness:readiness(record)}));
    return {schema:FORM_REVIEW_SCHEMA,workspaceId:store.identity().workspaceId,capabilities:{authoring:!!authoring,draft:true},
      captures,snapshots,reviews,publications:store.list(kinds.publication).map(({source,...value})=>({...value,form:source.form,xml:source.xml})),
      authoringCandidates:authoring?.listCandidates?await authoring.listCandidates():[],activeOperations:active};
  }
  const api={state,getReview,createReview,mapReports,decide,publicationPlan,validatePublicationPlan,
    getSource:input=>snapshot(input.id),retainCapture:input=>operation(()=>retainCapture(input)),
    retainDraft:input=>operation(()=>retainDraft(input)),
    retainAuthoring:input=>operation(()=>retainAuthoring(input)),retainSource:input=>operation(()=>retainSource(input)),
    receivePublication:input=>operation(()=>receivePublication(input))};
  workspace.formReleases=api;
  workspace.close=()=>{if(closePromise)return closePromise;closing=true;closePromise=(async()=>{await Promise.allSettled([...running]);return originalClose();})();return closePromise;};
  return api;
}
