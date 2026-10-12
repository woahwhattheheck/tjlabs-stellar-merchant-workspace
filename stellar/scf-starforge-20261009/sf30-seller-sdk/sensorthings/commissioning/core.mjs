// MIT. Complete commissioning workflow in the original SensorThings writer.
import {join} from 'node:path';
import {lstat,readdir} from 'node:fs/promises';
import {LIMITS,COMMISSIONING_SCHEMA as SCHEMA,COMMISSIONING_MEANING as MEANING} from './schema.mjs';
import {identity,sha,json,plain,hash,text,paragraph,integer,choice,clone,stable,fail,find,statePart,ensureState,operationId,
 objectValue,saveValue,retainedInput,publicTarget,targetProfile,rowPage,typedId,KINDS,RELATIONS,exactParse,exact} from './common.mjs';
import {normalizeMapping,normalizeSource,sourceFormat} from './sources.mjs';
import {preparePlan,reviewPlan,verificationPlan,rollbackPlan} from './plans.mjs';
import {createNativeRuntime} from './runtime.mjs';
import {appendEvent,snapshotProject,projectHead,receivingDisposition,adoptProject} from './history.mjs';
import {exportProject,importProject,projectObjects} from './portable.mjs';
import {inspectRetainedFile} from '../portable.mjs';
const ACTIVE=new Set(['QUEUED','STARTING','RUNNING','DRAINING','CANCELLING']);
const now=()=>new Date().toISOString();
const selected=(state,table,id,projectId)=>clone(find(state,table,hash(id,table),projectId));
function latestReview(state,editionId){return [...state.reviews].reverse().find(x=>x.editionId===editionId)??null;}
function sourceReview(state,id,expected){
 const current=latestReview(state,id);
 if(!expected||expected.decision!=='accept'||identity(expected)!==identity(current))throw fail('SOURCE_REVIEW','Accept the exact original source edition before selecting it for commissioning.',409);
}
function note(input,key='note'){const value=paragraph(input[key],key);if(!value.trim())throw fail('REVIEW','Retain a substantive '+key+'.');return value;}
function actor(input){return text(input.actor,'operator',240);}
export function commissioningContext(state,op,{inboxDirectory=null}={}){
 const p=op.payload,c={workspaceId:state.workspaceId};
 if(op.action==='commissioning.project.create')return c;
 if(op.action==='commissioning.handoff.receive'){
  if(!inboxDirectory)throw fail('INBOX','Bind the original private source inbox before receiving.');
  c.inboxDirectory=inboxDirectory;return c;
 }
 c.project=selected(state,'projects',p.projectId);const id=c.project.id;
 if(op.action==='commissioning.source.edition'){
  if(!state.editionIds.includes(hash(p.editionId,'source edition')))throw fail('SOURCE','Select an existing immutable source edition.',404);
  c.review=clone(latestReview(state,p.editionId));sourceReview(state,p.editionId,c.review);
 }
 if(op.action==='commissioning.source.file'){
  if(!inboxDirectory)throw fail('INBOX','Bind the original private source inbox before source intake.');
  c.inboxDirectory=inboxDirectory;
 }
 if(op.action==='commissioning.mapping.save'){
  c.source=selected(state,'sources',p.sourceId,id);c.target=selected(state,'targets',p.targetId,id);
 }
 if(op.action==='commissioning.target.inspect')c.target=selected(state,'targets',p.targetId,id);
 if(op.action==='commissioning.plan.prepare'){
  c.mapping=selected(state,'mappings',p.mappingId,id);c.source=selected(state,'sources',c.mapping.sourceId,id);c.target=selected(state,'targets',c.mapping.targetId,id);
  c.inspection=clone([...statePart(state).jobs].reverse().find(j=>j.projectId===id&&j.targetId===c.target.id&&j.kind==='inspect'&&j.state==='COMPLETE'&&j.latest?.closed)??null);
 }
 if(['commissioning.plan.review','commissioning.run.start'].includes(op.action)){
  c.plan=selected(state,'plans',p.planId,id);
  if(op.action==='commissioning.run.start')c.review=selected(state,'reviews',p.reviewId,id);
 }
 if(op.action.startsWith('commissioning.run.')&&op.action!=='commissioning.run.start'||['commissioning.rollback.prepare','commissioning.review.record'].includes(op.action)){
  c.job=selected(state,'jobs',p.jobId,id);
  if(op.action==='commissioning.rollback.prepare')c.verification=clone([...statePart(state).jobs].reverse().find(j=>j.kind==='verify'&&j.sourceJobId===c.job.id&&j.state==='COMPLETE'&&j.latest?.closed)??null);
 }
 if(op.action==='commissioning.handoff.prepare')c.snapshot=snapshotProject(state,id);
 return c;
}
export function createCommissioningManager({store,edition,inboxDirectory=null,environment=process.env,runtime={}}){
 let closing=false,reconciling=null;const controlWork=new Map();let objectCache=null;
 const part=()=>statePart(store.read()),active=()=>{if(closing)throw fail('CLOSED','The commissioning workspace is closed.',503);};
 const readDocument=record=>objectValue(store,record.document??record);
 const jobRecord=id=>find(store.read(),'jobs',hash(id,'native job'));
 function localJob(job){
  const local=part().local??{};return {...clone(job),received:local.receivedJobs?.[job.id]===true,localBinding:local.bindings?.[job.id]??null};
 }
 async function recordNative(jobId,snapshot){
  if(closing&&snapshot.closed!==true)return;
  await store.mutate(state=>{
   const prior=find(state,'jobs',jobId);if(prior.latest?.document.sha256===snapshot.document.sha256)return;
   const cancelling=prior.controls?.at(-1)?.kind==='cancel'&&snapshot.closed!==true;
   const updated={...prior,state:cancelling?'CANCELLING':snapshot.state,latest:clone(snapshot),updatedAt:snapshot.updatedAt??now()};
   const eventId='native-'+identity({jobId,snapshot:snapshot.document.sha256});
   appendEvent(state,prior.projectId,{operationId:eventId,action:'commissioning.native.observed',createdAt:updated.updatedAt,
    changes:[{table:'jobs',record:updated}],details:{jobId,snapshot:snapshot.document,nativeState:snapshot.nativeState,closed:snapshot.closed}});
  });
 }
 const native=createNativeRuntime({store,environment,runtime,onSnapshot:recordNative});
 async function fullJournal(job){
  const latest=job.latest;if(!latest?.journal)return {jobId:job.id,state:job.state,steps:[],counts:{total:job.stepCount,complete:0}};
  const journal=await objectValue(store,latest.journal),steps=[];
  for(const entry of journal.steps??[])steps.push(entry.record?await objectValue(store,entry.record):entry);
  return {...journal,steps};
 }
 async function nativeOutcome(id,result,error=null){
  await store.mutate(state=>{
   const prior=find(state,'jobs',id);
   if(prior.latest?.closed===false||native.hasOwner(id))return;
   const stateName=error?'START_FAILED':result.state;
   if(prior.state===stateName&&stable(prior.launchError??null)===stable(error))return;
   const updated={...prior,state:stateName,updatedAt:now(),launchError:error};
   appendEvent(state,prior.projectId,{operationId:'launch-'+identity({jobId:id,state:stateName,error,previous:prior.updatedAt,observedAt:updated.updatedAt}),action:'commissioning.native.launch',createdAt:updated.updatedAt,
    changes:[{table:'jobs',record:updated}],details:{jobId:id,state:stateName}});
  });
 }
 async function launch(job){
  try{const result=await native.launch(localJob(job));if(result.state==='RUNTIME_REQUIRED')await nativeOutcome(job.id,result);return result;}
  catch(error){await nativeOutcome(job.id,{state:'START_FAILED'},{code:error.code??'NATIVE_START',message:String(error.message).slice(0,2000)});return {jobId:job.id,state:'START_FAILED'};}
 }
 async function runControl(job){
  if(controlWork.has(job.id))return controlWork.get(job.id);
  const operation=(async()=>{
   const local=localJob(job);if(local.received&&!local.localBinding)return;
   if(local.received&&local.localBinding&&!local.localBinding.restored){
    const members=job.latest?.files?(await objectValue(store,job.latest.files)).members:[];
    await native.restore(local,members);
    await store.mutate(state=>{const s=ensureState(state);s.local??={receivedJobs:{},bindings:{}};const b=s.local.bindings[job.id];if(b)b.restored=true;});
   }
   // Reconcile the latest committed control. Its ID is also persisted by the
   // native marker, so a lost controller reply never creates another decision.
   const current=jobRecord(job.id),last=current.controls?.at(-1);
   if(last?.kind==='cancel'){await native.cancel(localJob(current),last);await native.inspect(localJob(current));return;}
   if(last?.kind==='resume'){
    if(current.controlAppliedId===last.id)return;
    const result=await native.resume(localJob(current),last);
    if(result.state!=='RUNTIME_REQUIRED')await store.mutate(state=>{const found=find(state,'jobs',job.id);if(found.controls?.at(-1)?.id===last.id){
     appendEvent(state,found.projectId,{operationId:'control-'+last.id,action:'commissioning.native.control-applied',createdAt:now(),
      changes:[{table:'jobs',record:{...found,controlAppliedId:last.id}}],details:{jobId:job.id,controlId:last.id}});
    }});if(result.state==='RUNTIME_REQUIRED')await nativeOutcome(job.id,result);return;
   }
   if(last?.kind==='resolution'){
    if(current.controlAppliedId===last.id)return;
    const result=await native.resolution(localJob(current),last);
    if(result.state!=='RUNTIME_REQUIRED')await store.mutate(state=>{const found=find(state,'jobs',job.id);if(found.controls?.at(-1)?.id===last.id){
     appendEvent(state,found.projectId,{operationId:'control-'+last.id,action:'commissioning.native.control-applied',createdAt:now(),
      changes:[{table:'jobs',record:{...found,controlAppliedId:last.id}}],details:{jobId:job.id,controlId:last.id}});
    }});if(result.state==='RUNTIME_REQUIRED')await nativeOutcome(job.id,result);
   }
  })();controlWork.set(job.id,operation);try{await operation;}finally{controlWork.delete(job.id);}
 }
 async function reconcile(){
  if(closing)return;if(reconciling)return reconciling;
  reconciling=(async()=>{
   for(const selected of [...part().jobs]){
    const local=localJob(selected);if(local.received&&!local.localBinding)continue;
    try{await runControl(selected);}catch(error){await nativeOutcome(selected.id,{state:'START_FAILED'},{code:error.code??'CONTROL_RECONCILIATION',message:String(error.message).slice(0,2000)});continue;}
    const observed=await native.inspect(localJob(jobRecord(selected.id)));
    const current=jobRecord(selected.id);
    // The request and job were committed before launch. Finish that original
    // queued launch after controller loss, only when no attempt ever started.
    if(!observed&&current.state==='QUEUED'&&!current.controls?.length&&!native.hasOwner(current.id))await launch(current);
   }
  })();try{await reconciling;}finally{reconciling=null;}
 }
 function overview(){
  active();const state=store.read(),s=statePart(state);
  return {schema:SCHEMA,workspaceId:state.workspaceId,revision:state.revision,
   projects:s.projects.map(p=>({...projectHead(p),sources:s.sources.filter(x=>x.projectId===p.id).length,plans:s.plans.filter(x=>x.projectId===p.id).length,jobs:s.jobs.filter(x=>x.projectId===p.id).length})),
   targets:s.targets.map(x=>({...x,profile:publicTarget(x.profile)})),plans:s.plans,jobs:s.jobs.map(job=>({...localJob(job),latest:job.latest?{...job.latest}:null})),
   handoffs:s.handoffs,runtime:{selected:Boolean(native.selection()),originalClient:'FROST-Python-Client 1.1.53'},limits:LIMITS,meaning:MEANING};
 }
 async function project(id){
  active();const s=store.read(),p=find(s,'projects',hash(id)),snap=snapshotProject(s,id);
  return {project:projectHead(p),...snap.tables,targets:snap.tables.targets.map(x=>({...x,profile:publicTarget(x.profile)})),
   jobs:snap.tables.jobs.map(localJob),handoffs:statePart(s).handoffs.filter(x=>x.projectId===id),
   history:{total:p.history.length,headHash:p.headHash,rows:p.history.slice(-100)}};
 }
 function fileDescriptor(reference,name,type='application/json'){return {id:reference.sha256,name,type,bytes:reference.bytes,sha256:reference.sha256};}
 async function source(id){
  active();const record=find(store.read(),'sources',hash(id)),normalized=record.normalized?await objectValue(store,record.normalized):null;
  return {...record,rawFile:record.raw?fileDescriptor(record.raw,record.filename??'source.json',record.format?.kind==='csv'?'text/csv':'application/json'):null,
   sourceEditions:record.kind==='edition'?[record.editionId]:[],
   counts:normalized?Object.fromEntries(Object.entries(normalized).filter(([k])=>!['records','issues'].includes(k))):null,
   issues:normalized?.issues??[],mappingRequired:!normalized,hints:{mappingVersion:1,format:record.format??{kind:'edition'},exactSourceRetained:true}};
 }
 async function rows(id,{offset=0,limit=100,mappingId=null}={}){
  active();const record=find(store.read(),'sources',hash(id));let selected=record.normalized;
  if(mappingId){const mapping=find(store.read(),'mappings',hash(mappingId),record.projectId);if(mapping.sourceId!==record.id)throw fail('MAPPING_SOURCE','Choose a mapping of this original source.',409);selected=mapping.normalized;}
  if(!selected)return {sourceId:id,offset:0,limit,total:0,nextOffset:null,columns:[],rows:[],issues:[],mappingRequired:true};
  const doc=await objectValue(store,selected),page=rowPage(doc.records,{offset,limit});
  return {sourceId:id,mappingId,normalized:selected,...page,columns:['sourceKey','entityKind','bodyText','sourceRefs','occurrenceIds','sourceRowCount','relations','omittedFields'],
   issues:doc.issues??[],sourceRows:doc.sourceRows,selectedRows:doc.selectedRows,excludedRows:doc.excludedRows};
 }
 async function plan(id,options={}){
  active();const record=find(store.read(),'plans',hash(id)),value=await readDocument(record),{steps,...head}=value,page=rowPage(steps,options);
  return {...head,document:record.document,...page,steps:page.rows};
 }
 async function job(id,options={}){
  active();let selected=jobRecord(id);
  if(!localJob(selected).received||localJob(selected).localBinding){await native.inspect(localJob(selected));selected=jobRecord(id);}
  const journal=await fullJournal(selected),page=rowPage(journal.steps,options),files=selected.latest?.files?await objectValue(store,selected.latest.files):{members:[]};
  return {...localJob(selected),progress:journal.counts??{total:selected.stepCount,complete:0},journal: selected.latest?.journal??null,
   runtimeIdentity:journal.runtimeIdentity??null,error:journal.error??selected.launchError??null,notBefore:journal.notBefore??null,
   ...page,steps:page.rows.map(row=>({...row,attempts:(row.attempts??[]).map(a=>({...a,
    ...(a.request?.body?{request:{...a.request,body:{...a.request.body,fileId:a.request.body.sha256}}}:{}),
    ...(a.response?.body?{response:{...a.response,body:{...a.response.body,fileId:a.response.body.sha256}}}:{} )}))})),
   files:files.members.map(x=>({path:x.path,...fileDescriptor(x,x.path.split('/').at(-1))})),
   verifications:part().jobs.filter(x=>x.sourceJobId===id&&x.kind==='verify'),
   reviews:part().reviews.filter(x=>x.jobId===id)};
 }
 async function mapData(id){
  active();const selected=jobRecord(id),candidates=[selected,...part().jobs.filter(x=>x.sourceJobId===selected.id&&x.kind==='verify'&&x.state==='COMPLETE')];
  const index=new Map();let verificationId=null;
  for(const current of candidates){
   const journal=await fullJournal(current);
   for(const step of journal.steps){
    if(step.state!=='COMPLETE'||!step.targetIdJson||!KINDS.includes(step.entityKind))continue;
    const attempt=[...(step.attempts??[])].reverse().find(x=>x.request?.method==='GET'&&x.response?.status>=200&&x.response.status<300);
    if(!attempt)continue;const bytes=await store.object(attempt.response.body.sha256);
    index.set(step.entityKind+'/'+step.targetIdJson,{kind:step.entityKind,idJson:step.targetIdJson,bodyText:bytes.toString('utf8'),responseSha256:attempt.response.body.sha256,stepId:step.stepId});
   }
   if(current.kind==='verify')verificationId=current.id;
  }
  const input=await objectValue(store,selected.input);
  return {jobId:id,planId:selected.planId,targetServiceUrl:input.plan.target.serviceUrl,verificationId,entities:[...index.values()],
   sourceIdentity:input.plan.sourceIdentity??{sourcePlanId:input.plan.sourcePlanId??null}};
 }
 async function allObjects(){
  const revision=store.read().revision;if(objectCache?.revision===revision)return objectCache.objects;
  const objects=new Map();for(const p of part().projects){const closure=await projectObjects(store,snapshotProject(store.read(),p.id));
   for(const x of closure.objects)objects.set(x.sha256,x);}
  objectCache={revision,objects};return objects;
 }
 async function fileRecord(id){
  active();hash(id,'file');const file=part().files.find(x=>x.id===id);
  if(file){const path=join(store.root,...file.storagePath.split('/'));await inspectRetainedFile(path,{expectedBytes:file.bytes,expectedSha256:file.sha256,maximum:LIMITS.portableBytes});return {...file,path};}
  const object=(await allObjects()).get(id);if(!object)throw fail('FILE','Select an actual retained commissioning source/result file.',404);
  return {...fileDescriptor(object,id+'.json'),path:join(store.root,'objects',id)};
 }
 function commit(op,finish,result,changes=[],details={},create=null){
  const projectId=create?.id??op.context.commissioning.project.id;
  return finish(result,state=>appendEvent(state,projectId,{operationId:op.operationId,action:op.action,createdAt:op.createdAt,changes,details},create));
 }
 async function createJob(op,finish,{kind,plan,planRecord=null,sourceJobId=null}){
  const id=operationId('native-job',op),inputValue={schema:'stellar-forge.sensorthings-commissioning-job.v1',id,createdAt:op.createdAt,plan:clone(plan)},
   input=await saveValue(store,inputValue),record={id,projectId:op.context.commissioning.project.id,kind,planId:planRecord?.id??null,targetId:plan.targetId,
    sourceJobId,input,createdAt:op.createdAt,updatedAt:op.createdAt,state:'QUEUED',stepCount:plan.steps.length,targetTimeoutMs:plan.target.requestTimeoutMs,latest:null,controls:[]};
  const result=await commit(op,finish,{jobId:id,job:record,state:'QUEUED'},[{table:'jobs',record}],{planIdentity:identity(plan),sourceJobId});
  await launch(record);return result;
 }
 async function execute(op,finish){
  active();const p=op.payload,c=op.context.commissioning,s=store.read();
  if(op.action==='commissioning.project.create'){
   const id=operationId('project',op),record={id,originWorkspaceId:c.workspaceId,label:text(p.label,'project label',240),description:paragraph(p.description??'','project description'),createdAt:op.createdAt};
   return commit(op,finish,{projectId:id,project:record},[],{project:record},record);
  }
  if(op.action==='commissioning.source.edition'){
   sourceReview(store.read(),p.editionId,c.review);const e=await edition(p.editionId),configuration=normalizeMapping({version:1,namespace:'project-'+c.project.id.slice(0,24)}),
    id=operationId('source',op),record={id,projectId:c.project.id,kind:'edition',editionId:e.id,label:text(p.label??e.plan.label,'source label',240),
     review:clone(c.review),createdAt:op.createdAt,sourceIdentity:e.id},normalized=await normalizeSource(store,record,edition,configuration);
   record.normalized=await saveValue(store,normalized);
   return commit(op,finish,{sourceId:id,source:record,counts:{records:normalized.records.length,sourceRows:normalized.sourceRows}},[{table:'sources',record}],{editionId:e.id,reviewId:c.review.id});
  }
  if(op.action==='commissioning.source.file'){
   const raw=await retainedInput(store,c.inboxDirectory,p),format=sourceFormat(p.format),id=operationId('source',op),
    record={id,projectId:c.project.id,kind:'file',label:text(p.label??p.filename,'source label',240),filename:p.filename,raw:{sha256:raw.sha256,bytes:raw.bytes},format,
     sourceUrl:paragraph(p.sourceUrl??'','source URL',4096),license:p.license??null,createdAt:op.createdAt};
   if(record.sourceUrl){const u=new URL(record.sourceUrl);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hash)throw fail('SOURCE_URL','Retain a public provenance URL without credentials or fragment.');}
   if(record.license!==null&&(!plain(record.license)||json(record.license).length>32000))throw fail('SOURCE_LICENSE','Retain the actual source licence fields or null when unobserved.');
   if(format.kind!=='csv'){const normalized=await normalizeSource(store,record,edition,normalizeMapping({version:1,namespace:'project-'+c.project.id.slice(0,24)}));record.normalized=await saveValue(store,normalized);}
   return commit(op,finish,{sourceId:id,source:record},[{table:'sources',record}],{raw:record.raw});
  }
  if(op.action==='commissioning.target.save'){
   const profile=targetProfile(p),id=operationId('target',op),record={id,projectId:c.project.id,profile,createdAt:op.createdAt};
   return commit(op,finish,{targetId:id,target:{...record,profile:publicTarget(profile)}},[{table:'targets',record}],{targetIdentity:identity(profile)});
  }
  if(op.action==='commissioning.target.inspect'){
   const entities=p.entities??[];if(!Array.isArray(entities)||entities.length>LIMITS.entities)throw fail('INSPECTION','Choose a bounded complete list of original typed target entities.');
   const id=operationId('inspection-plan',op),steps=[{stepId:identity({id,root:true}),mode:'inspect-root',entityKind:null,sourceKey:null,bodyText:'{}',relations:{}}],
    seen=new Set();
   for(const entity of entities){
    if(!plain(entity)||!KINDS.includes(entity.kind))throw fail('INSPECTION','Select an original SensorThings entity kind.');
    const targetIdJson=typedId(entity.idJson),key=entity.kind+'/'+targetIdJson;if(seen.has(key))throw fail('INSPECTION','Inspect each selected typed target identity once.');seen.add(key);
    steps.push({stepId:identity({id,key}),mode:'inspect',entityKind:entity.kind,sourceKey:'target:'+key,targetIdJson,bodyText:'{}',relations:{}});
   }
   const plan={schema:'stellar-forge.sensorthings-commissioning-native-plan.v1',id,kind:'inspect',projectId:c.project.id,targetId:c.target.id,target:clone(c.target.profile),createdAt:op.createdAt,steps};
   return createJob(op,finish,{kind:'inspect',plan});
  }
  if(op.action==='commissioning.mapping.save'){
   const configuration=normalizeMapping(p.configuration),normalized=await normalizeSource(store,c.source,edition,configuration),id=operationId('mapping',op),
    body={schema:'stellar-forge.sensorthings-commissioning-mapping.v1',id,projectId:c.project.id,sourceId:c.source.id,targetId:c.target.id,
     label:text(p.label,'mapping label',240),configuration,createdAt:op.createdAt},
    record={...body,document:await saveValue(store,body),normalized:await saveValue(store,normalized)};
   return commit(op,finish,{mappingId:id,mapping:record,counts:{entities:normalized.records.length,sourceRows:normalized.sourceRows,selectedRows:normalized.selectedRows,excludedRows:normalized.excludedRows},issues:normalized.issues},[{table:'mappings',record}],{sourceId:c.source.id,targetId:c.target.id});
  }
  if(op.action==='commissioning.plan.prepare'){
   const inspection=c.inspection?{...c.inspection,journal:c.inspection.latest.journal}:null,
    value=await preparePlan({store,projectId:c.project.id,source:c.source,mapping:c.mapping,target:c.target,
     normalized:await objectValue(store,c.mapping.normalized),inspection,createdAt:op.createdAt}),
    record={id:value.id,projectId:c.project.id,kind:value.kind,sourceId:c.source.id,mappingId:c.mapping.id,targetId:c.target.id,
     createdAt:op.createdAt,counts:value.counts,issues:value.issues,document:await saveValue(store,value)};
   return commit(op,finish,{planId:value.id,plan:record},[{table:'plans',record}],{mappingId:c.mapping.id,inspectionId:inspection?.id??null});
  }
  if(op.action==='commissioning.plan.review'){
   const value=await readDocument(c.plan),review=reviewPlan(value,p),id=operationId('review',op),
    record={id,projectId:c.project.id,kind:'plan',...review,createdAt:op.createdAt};
   return commit(op,finish,{reviewId:id,review:record},[{table:'reviews',record}],{planId:value.id,decision:review.decision});
  }
  if(op.action==='commissioning.run.start'){
   const plan=await readDocument(c.plan),review=c.review;
   if(review.kind!=='plan'||review.planId!==plan.id||review.planSha256!==identity(plan)||review.decision!=='accept')throw fail('PLAN_REVIEW','Select the accepted review of this exact retained plan.',409);
   const currentReview=[...part().reviews].reverse().find(x=>x.kind==='plan'&&x.planId===plan.id);
   if(currentReview?.id!==review.id)throw fail('PLAN_REVIEW','A later review supersedes this accepted plan decision.',409);
   if(p.acknowledgeWrite!==true||p.confirmServiceUrl!==plan.target.serviceUrl)throw fail('WRITE_CONFIRMATION','Confirm the complete displayed target root and selected native writes.');
   if(part().jobs.some(x=>x.planId===plan.id&&x.kind===plan.kind))throw fail('PLAN_ALREADY_STARTED','This plan already has a native job. Reopen and resume that original job.',409);
   return createJob(op,finish,{kind:plan.kind,plan,planRecord:c.plan});
  }
  if(op.action==='commissioning.run.reconcile'){
   await runControl(c.job);if(!localJob(c.job).received||localJob(c.job).localBinding)await native.inspect(localJob(c.job));
   const current=jobRecord(c.job.id);return commit(op,finish,{jobId:current.id,state:current.state,snapshot:current.latest?.document??null},[],{jobId:current.id});
  }
  if(['commissioning.run.cancel','commissioning.run.resume','commissioning.run.resolve'].includes(op.action)){
   const current=jobRecord(c.job.id),local=localJob(current);
   if(current.state==='COMPLETE')throw fail('JOB_COMPLETE','The original job is complete. Select verification or a separately reviewed compensation plan.',409);
   const kind=op.action.endsWith('.cancel')?'cancel':op.action.endsWith('.resume')?'resume':'resolution',
    event={id:operationId('control',op),kind,createdAt:op.createdAt,operationId:op.operationId};
   let binding=null;
   if(local.received&&!local.localBinding&&kind!=='cancel'){
    if(p.acknowledgeWrite!==true||p.confirmServiceUrl!==(await objectValue(store,current.input)).plan.target.serviceUrl)throw fail('RECEIVING_BINDING','Confirm this received pending job and exact target root before binding it to the selected local runtime.',409);
    binding={jobId:current.id,operationId:op.operationId,createdAt:op.createdAt,serviceUrl:p.confirmServiceUrl,restored:false};
   }
   if(kind==='resolution'){
    const journal=await fullJournal(current),step=journal.steps.find(x=>x.stepId===hash(p.stepId,'native step'));
    if(step?.state!=='AWAITING_RECONCILIATION')throw fail('RECONCILIATION','Choose an actual ambiguous native write.',409);
    Object.assign(event,{stepId:step.stepId,decision:choice(p.decision,['adopt','retry'],'the explicit write reconciliation'),actor:actor(p),note:note(p)});
    if(p.decision==='adopt')event.targetIdJson=typedId(p.targetIdJson);
   }
   const updated={...current,state:kind==='cancel'?(local.received&&!local.localBinding?'CANCELLED':'CANCELLING'):current.state,controls:[...(current.controls??[]),event],updatedAt:op.createdAt};
   const result=await finish({jobId:current.id,state:updated.state,control:event},state=>{
    const live=find(state,'jobs',current.id);if(live.state==='COMPLETE')throw fail('JOB_COMPLETE','The original job completed before the control was committed.',409);
    appendEvent(state,current.projectId,{operationId:op.operationId,action:op.action,createdAt:op.createdAt,
     changes:[{table:'jobs',record:{...live,state:updated.state,controls:[...(live.controls??[]),event],updatedAt:op.createdAt}}],details:{jobId:current.id,control:event.id}});
    if(binding){const s=ensureState(state);s.local??={receivedJobs:{},bindings:{}};s.local.bindings[current.id]=binding;}
   });
   try{await runControl(jobRecord(current.id));}catch(error){await nativeOutcome(current.id,{state:'START_FAILED'},{code:error.code??'CONTROL_RECONCILIATION',message:String(error.message).slice(0,2000)});}return result;
  }
  if(op.action==='commissioning.run.verify'){
   const current=jobRecord(c.job.id);if(current.latest?.closed!==true||!current.latest.journal)throw fail('VERIFICATION','Close the original native attempt before selecting its actual target results.',409);
   const input=await objectValue(store,current.input),journal=await fullJournal(current),
    plan=verificationPlan(input.plan,journal,{id:operationId('verification-plan',op),createdAt:op.createdAt});
   if(!plan.steps.length)throw fail('VERIFICATION','The original job has no completed native target entity to verify.',409);
   return createJob(op,finish,{kind:'verify',plan,sourceJobId:current.id});
  }
  if(op.action==='commissioning.rollback.prepare'){
   const current=jobRecord(c.job.id);if(current.latest?.closed!==true||!['commission'].includes(current.kind))throw fail('ROLLBACK','Select the closed original commissioning job.',409);
   const input=await objectValue(store,current.input),journal=await fullJournal(current),
    verification=c.verification?{...c.verification,journal:c.verification.latest.journal}:null,
    value=await rollbackPlan({store,original:input.plan,journal,verification,createdAt:op.createdAt}),
    record={id:value.id,projectId:c.project.id,kind:'rollback',sourceId:value.sourceId,mappingId:value.mappingId,targetId:value.targetId,
     sourceJobId:current.id,createdAt:op.createdAt,counts:value.counts,issues:value.issues,document:await saveValue(store,value)};
   return commit(op,finish,{planId:value.id,plan:record},[{table:'plans',record}],{sourceJobId:current.id,verificationId:verification?.id??null});
  }
  if(op.action==='commissioning.review.record'){
   const current=jobRecord(c.job.id),record={id:operationId('review',op),projectId:c.project.id,kind:'job',jobId:current.id,
    snapshot:current.latest?.document??null,decision:choice(p.decision,['accept','revise','reject'],'the operating decision'),actor:actor(p),note:note(p),createdAt:op.createdAt};
   if(record.decision==='accept'&&(current.state!=='COMPLETE'||current.latest?.closed!==true))throw fail('RESULT_REVIEW','Accept an actual completed, closed native result.',409);
   return commit(op,finish,{reviewId:record.id,review:record},[{table:'reviews',record}],{jobId:current.id,snapshot:record.snapshot});
  }
  if(op.action==='commissioning.handoff.prepare'){
   for(const job of c.snapshot.tables.jobs)if(job.latest?.closed===false||native.hasOwner(job.id))throw fail('NATIVE_CUSTODY_BUSY','Drain the original native owner before exporting its complete custody.',409);
   const output=await exportProject(store,{snapshot:c.snapshot,edition,id:op.operationId,createdAt:op.createdAt,label:text(p.label??c.project.label,'handoff label',240)}),
    file={id:output.file.sha256,projectId:c.project.id,...output.file,storagePath:'exports/'+output.file.storage.operationId+'/'+output.file.storage.filename},
    record={id:operationId('handoff',op),projectId:c.project.id,direction:'export',sequence:c.snapshot.project.sequence,headHash:c.snapshot.project.headHash,
     label:p.label??c.project.label,fileId:file.id,createdAt:op.createdAt,manifest:output.manifest};
   return finish({handoffId:record.id,projectId:c.project.id,file,receipt:record},state=>{
    const s=ensureState(state);if(!s.files.some(x=>x.id===file.id))s.files.push(file);if(!s.handoffs.some(x=>x.id===record.id))s.handoffs.push(record);
   });
  }
  if(op.action==='commissioning.handoff.receive'){
   const output=await importProject(store,{inboxDirectory:c.inboxDirectory,...p,id:op.operationId,createdAt:op.createdAt}),
    disposition=receivingDisposition(store.read(),output.snapshot),projectId=output.snapshot.project.id,
    record={id:operationId('handoff',op),projectId,direction:'receive',disposition,sequence:output.snapshot.project.sequence,headHash:output.snapshot.project.headHash,
     createdAt:op.createdAt,archive:output.archive,manifest:output.manifest,sourceReceipts:output.sourceReceipts};
   return finish({handoffId:record.id,projectId,disposition,receipt:record},state=>{
    adoptProject(state,output.snapshot);for(const id of output.editionIds)if(!state.editionIds.includes(id))state.editionIds.push(id);
    state.sourceReceipts??=[];for(const receipt of output.sourceReceipts)if(!state.sourceReceipts.some(x=>x.id===receipt.id))state.sourceReceipts.push(receipt);
    const s=ensureState(state);if(!s.handoffs.some(x=>x.id===record.id))s.handoffs.push(record);
    const file={id:output.archive.sha256,projectId,...output.archive,storagePath:'exports/'+output.archive.storage.operationId+'/'+output.archive.storage.filename};if(!s.files.some(x=>x.id===file.id))s.files.push(file);
   });
  }
  throw fail('ACTION','The commissioning action is not implemented.');
 }
 async function close(){
  if(closing)return;closing=true;
  await Promise.allSettled([reconciling,...controlWork.values()].filter(Boolean));await native.close();objectCache=null;
 }
 return {overview,project,source,rows,plan,job,mapData,fileRecord,execute,reconcile,close,
  history:(id,options={})=>rowPage(find(store.read(),'projects',hash(id)).history,options),native};
}
