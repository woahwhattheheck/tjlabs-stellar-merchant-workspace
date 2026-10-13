// MIT. Coupled software release receiving in the original Central Store.
import {randomUUID} from 'node:crypto';
import {digest,fault,stable,now,identifier} from '../../odata/state.mjs';
import {createGitLabReleaseSource} from './gitlab-source.mjs';
export const RELEASE_OPERATIONS_SCHEMA='stellar-forge.odk-release-operations.v1';
export const SOURCE_KINDS=['central-handover','central-release','central-snapshot','central-restore','operator-evidence','upgrade-instructions','form-publication','gitlab-artifact'];
export const STEP_KINDS=['app-deploy','central-upgrade','restore','form-publish','verify'];
export const EVIDENCE_KINDS=['deployment','host','restore','form-publication','operator'];
const K={source:'release-operation-source',operation:'release-operation',plan:'release-operation-plan',request:'release-operation-request'};
const clone=value=>structuredClone(value),equal=(a,b)=>stable(a)===stable(b),hash=value=>digest(stable(value));
const need=(ok,message,status=400)=>{if(!ok)throw fault('RELEASE_OPERATION',message,status);};
const text=(value,label)=>{need(typeof value==='string'&&value.trim(),'Record '+label+'.');return value.trim();};
const ident=(value,label)=>identifier(value,label);
const list=value=>Array.isArray(value)?value:[];
const iso=value=>{need(typeof value==='string'&&Number.isFinite(Date.parse(value)),'Use an actual source timestamp.');return value;};
const numeric=value=>value===null||value===undefined?'':String(value);
const origin=value=>{const u=new URL(value);need(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Use the original service origin without credentials or query.');return u.href.replace(/\/$/,'');};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function selectedSourceFacts(kind,value){
 const source=value?.source,hostPrefix='stellar-forge.odk-central-host.v1.';
 if(kind==='central-handover'){
  need(value?.schema===hostPrefix+'handover'&&source?.commit&&source?.backend_commit&&typeof value.version==='string','Receive the complete original host handover.');
  need(value.version.includes(source.commit)&&value.version.includes(source.backend_commit),'The handover version does not contain its original source and backend commits.');
  return {origin:origin(value.url),release:source.release,commit:source.commit,backendCommit:source.backend_commit,
   repository:source.repository,composeProject:value.compose_project,operationId:value.operation_id,observedAt:iso(value.observed_at),
   version:value.version,mode:value.mode,backupCount:value.backup_count,restore:value.restore??null};
 }
 if(kind==='central-release'){
  need(value?.schema==='stellar-forge.odk-central-host-source.v1'&&value.central?.commit&&value.backend?.commit,'Receive the complete upstream Central release descriptor.');
  return {release:value.central.release,commit:value.central.commit,backendCommit:value.backend.commit,repository:value.central.repository};
 }
 if(kind==='central-snapshot'){
  need(value?.schema===hostPrefix+'snapshot'&&source?.commit&&value.service_at_backup?.url&&Array.isArray(value.files)&&value.files.length,'Receive the original completed snapshot manifest.');
  for(const f of value.files)need(typeof f.filename==='string'&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'The original snapshot file inventory is incomplete.');
  const s=value.service_at_backup;
  need(typeof s.version==='string'&&s.version.includes(source.commit)&&s.version.includes(source.backend_commit),'The snapshot service version differs from its original software source.');
  return {origin:origin(s.url),release:source.release,commit:source.commit,backendCommit:source.backend_commit,
   operationId:value.operation_id,createdAt:iso(value.created_at),configurationSha256:value.configuration_sha256,
   projectIds:list(s.project_ids),files:value.files.map(f=>({filename:f.filename,bytes:f.bytes,sha256:f.sha256})),
   dataStorage:value.data_storage,webFormState:value.web_form_state,
   databaseBackup:value.database_backup_receipt?{sha256:value.database_backup_receipt.sha256,bytes:value.database_backup_receipt.bytes,status:value.database_backup_receipt.status}:null,
   manifestOnly:true,privateCustody:true};
 }
 if(kind==='central-restore'){
  need(value?.schema===hostPrefix+'restore'&&/^[a-f0-9]{64}$/.test(source?.sha256??'')&&value.received?.url&&value.destination,'Receive the actual isolated restore-result.json.');
  const s=value.received;need(typeof s.version==='string'&&Array.isArray(s.project_ids),'Receive the authenticated original restore readiness result.');
  return {snapshotSha256:source.sha256,snapshotBytes:source.bytes,destination:value.destination,origin:origin(s.url),version:s.version,
   projectIds:s.project_ids,checkedAt:iso(s.checked_at),at:iso(value.at),authenticated:true};
 }
 if(kind==='form-publication'){
  need(value?.schema==='stellar-forge.odk-form-publication-receiving.v1'&&value.planId&&value.source?.contentHash&&['MATCHED','RECEIVED_DIFFERENT'].includes(value.outcome),'Receive the existing original form-publication result.');
  return {planId:value.planId,reviewId:value.reviewId,outcome:value.outcome,differences:list(value.differences),
   contentHash:value.source.contentHash,form:value.source.form,receivedAt:value.receivedAt};
 }
 return {description:'Operator supplied original; its bytes are retained without claiming provider execution.'};
}
function normalizeDefinition(value){
 need(plain(value),'Supply the complete operation definition.');const d=clone(value);
 d.application=plain(d.application)?d.application:{};d.central=plain(d.central)?d.central:{};
 d.recovery=plain(d.recovery)?d.recovery:{};d.recovery.coverage=list(d.recovery.coverage);
 d.application.artifactKeys=list(d.application.artifactKeys);
 for(const key of ['dependencies','steps','checks'])d[key]=list(d[key]);
 for(const key of ['dependencies','steps','checks']){
  const seen=new Set();for(const row of d[key]){ident(row.id,key+' ID');need(!seen.has(row.id),'Use distinct '+key+' IDs.');seen.add(row.id);}
 }
 for(const row of d.steps){
  need(STEP_KINDS.includes(row.kind)&&['release','recovery'].includes(row.phase)&&EVIDENCE_KINDS.includes(row.evidenceKind),'Select an actual step kind, phase and evidence kind.');
  row.dependsOn=list(row.dependsOn);need(new Set(row.dependsOn).size===row.dependsOn.length,'Do not repeat a dependency.');
 }
 for(const row of d.checks)need(['release','recovery'].includes(row.phase)&&['application','central','joint'].includes(row.component),'Select the check phase and component.');
 return d;
}
export function createCentralReleaseOperations({workspace,store,formReleases,fetchImpl,gitlabConnections=[]}={}){
 need(workspace&&store?.transaction&&store?.retainStream,'Compose through the original Central workspace and Store.');
 const gitlab=createGitLabReleaseSource({connections:gitlabConnections,fetchImpl});
 const running=new Map(),uploads=new Set();let closing=false,closePromise;
 const originalClose=workspace.close.bind(workspace);
 for(const s of store.list(K.source))if(s.status==='CAPTURING')store.put(K.source,s.id,{...s,status:'PAUSED',error:{code:'PROCESS_REOPENED',message:'Resume this original receiving selection.'}},s.revision);
 const getSource=input=>store.get(K.source,ident(typeof input==='string'?input:input.id,'source ID'));
 const resource=(source,key)=>{const s=getSource(source),r=s.resources.find(v=>v.key===key);need(r&&r.status==='COMPLETE','Select a complete retained original resource.',409);return {source:s,resource:r};};
 function sourceSeal(s){return hash({kind:s.kind,request:s.request,connection:s.connection??null,resources:s.resources.filter(r=>r.status==='COMPLETE').map(({attempt,...r})=>r)});}
 function sourceFacts(s){
  if(s.kind!=='gitlab')return s.resources.find(r=>r.status==='COMPLETE')?.facts??{};
  const f=key=>s.resources.find(r=>r.key===key&&r.status==='COMPLETE')?.facts??null;
  return {project:f('project'),pipeline:f('pipeline'),jobs:s.resources.filter(r=>r.kind==='job'&&r.status==='COMPLETE').map(r=>r.facts),
   deployments:s.resources.filter(r=>r.kind==='deployment'&&r.status==='COMPLETE').map(r=>r.facts),
   artifacts:s.resources.filter(r=>r.kind==='artifact'&&r.status==='COMPLETE').map(r=>({key:r.key,sha256:r.sha256,bytes:r.bytes,...r.facts})),
   pipelineJobs:s.resources.filter(r=>r.kind==='pipeline-jobs'&&r.status==='COMPLETE').flatMap(r=>r.facts.jobs)};
 }
 function indexSource(s){
  const capture='release-operation-source:'+s.id;
  for(const [index,attempt] of (s.attempts??[]).entries())store.saveResource(capture,'attempt:'+index,'release-original-http',attempt);
  for(const r of s.resources)store.saveResource(capture,'resource:'+r.key,'release-original-file',r);
 }
 function updateSource(id,fn){return store.transaction(()=>{
  const s=getSource(id),next=fn(s);next.facts=sourceFacts(next);next.contentHash=sourceSeal(next);indexSource(next);
  return store.writeRecord(K.source,id,next,s.revision);
 });}
 function receiveGitLab(input){
  need(!closing,'The original workspace is closing.',503);
  const request=gitlab.normalize(input);ident(request.id,'source ID');request.name=text(request.name,'source name');
  const connection=gitlab.connections().find(p=>p.id===request.connectionId),prior=store.get(K.source,request.id,false);
  if(prior){need(equal(prior.request,request)&&equal(prior.connection,connection),'This source ID is already bound to another original selection or configured provider.',409);return getSource(request.id);}
  const record={schema:RELEASE_OPERATIONS_SCHEMA+'.source',name:request.name,kind:'gitlab',status:'PAUSED',request,connection,
   resources:[],attempts:[],queue:gitlab.descriptors(request),cursor:0,error:null,createdAt:now(),facts:{},contentHash:null};
  store.put(K.source,request.id,record,0);startSource(request.id);return getSource(request.id);
 }
 function startSource(id){
  if(running.has(id))return;need(!closing,'The original workspace is closing.',503);
  const s=getSource(id);if(s.status==='COMPLETE')return;
  need(equal(s.connection,gitlab.connections().find(p=>p.id===s.request.connectionId)),'The configured provider changed; preserve this source and use a new source selection.',409);
  need(!s.retryAt||Date.parse(s.retryAt)<=Date.now(),'The provider Retry-After deadline has not arrived.',429);
  const controller=new AbortController();
  const promise=runSource(id,controller.signal).finally(()=>running.delete(id));
  running.set(id,{promise,controller});
 }
 async function runSource(id,signal){
  updateSource(id,s=>({...s,status:'CAPTURING',error:null,retryAt:null}));
  try{
   for(;;){
    const s=getSource(id);if(s.cursor>=s.queue.length){
     const allJobs=s.resources.filter(r=>r.kind==='pipeline-jobs').flatMap(r=>r.facts.jobs),jobIds=allJobs.map(j=>j.jobId);
     need(new Set(jobIds).size===jobIds.length,'The paginated original job listing repeated an identity; preserve this capture and receive a fresh complete source.',502);
     for(const selected of s.resources.filter(r=>r.kind==='job'))need(jobIds.includes(selected.facts.jobId),'A selected job is absent from the complete original pipeline listing.',502);
     updateSource(id,s=>({...s,status:'COMPLETE',completedAt:now()}));return;
    }
    const descriptor=s.queue[s.cursor],{response,receipt}=await gitlab.read(s.request,descriptor,{signal});
    const retained=await store.retainStream(response.body),attempt={...descriptor,...receipt,...retained,at:now()};
    // Retain every complete original HTTP response before interpreting success.
    updateSource(id,s=>({...s,attempts:[...s.attempts,attempt]}));
    if(!response.ok){
     updateSource(id,s=>({...s,status:response.status===429?'PAUSED':'FAILED',retryAt:receipt.retryAt,
      error:{code:'GITLAB_HTTP_'+response.status,message:'The original GET returned HTTP '+response.status+'. Its complete body remains retained.',resourceKey:descriptor.key}}));return;
    }
    let value=null;
    if(descriptor.kind!=='artifact'){
     const bytes=await store.raw(retained.sha256);try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}
     catch{throw fault('RELEASE_GITLAB_JSON','The retained original is not complete UTF-8 JSON.',502);}
    }
    const facts=gitlab.decode(s.request,descriptor,value),pipeline=getSource(id).resources.find(r=>r.key==='pipeline')?.facts;
    if(['job','deployment'].includes(descriptor.kind)&&pipeline){
     need(facts.commit===pipeline.commit,'The selected original job/deployment commit differs from the selected pipeline.',502);
     need(facts.pipelineId===s.request.pipelineId,'The selected deployment does not identify the selected original pipeline.',502);
    }
    if(descriptor.kind==='pipeline-jobs')for(const job of facts.jobs)need(!pipeline||job.commit===pipeline.commit,'A listed job has another original commit.',502);
    updateSource(id,current=>{
     need(current.cursor===s.cursor,'The original source cursor changed.',409);
     const resources=[...current.resources,{key:descriptor.key,name:descriptor.kind==='artifact'?'job-'+descriptor.id+'-artifacts.zip':descriptor.key.replaceAll(':','-')+'.json',
      kind:descriptor.kind,status:'COMPLETE',...retained,receipt,facts}];
     const queue=[...current.queue];
     if(receipt.nextPage){const next={key:'pipeline-jobs:'+receipt.nextPage,kind:'pipeline-jobs',id:s.request.pipelineId,page:receipt.nextPage};
      need(!queue.some(q=>q.key===next.key),'The provider repeated an original page.',502);queue.splice(current.cursor+1,0,next);}
     return {...current,resources,queue,cursor:current.cursor+1};
    });
   }
  }catch(error){
   updateSource(id,s=>({...s,status:signal.aborted?'PAUSED':'FAILED',error:{code:error.code??'SOURCE_RECEIVING',message:error.message}}));
  }
 }
 function resumeSource(input){const s=getSource(input.id);need(s.kind==='gitlab','Only an original GitLab read has a resumable cursor.');startSource(s.id);return getSource(s.id);}
 async function receiveOriginal(input,stream){
  need(!closing,'The workspace is closing.',503);ident(input.id,'source ID');need(SOURCE_KINDS.includes(input.kind),'Select the original source kind.');
  const name=text(input.name,'original filename'),retained=await store.retainStream(stream);
  const request={id:input.id,kind:input.kind,name,...retained};
  if(input.kind==='gitlab-artifact'){request.gitlabSourceId=ident(input.gitlabSourceId,'GitLab source ID');request.jobId=String(input.jobId);}
  const prior=store.get(K.source,input.id,false);
  if(prior){need(equal(prior.request,request),'This original source ID is already bound to another file.',409);return prior;}
  let facts;
  if(input.kind==='gitlab-artifact'){
   const s=getSource(request.gitlabSourceId),job=s.resources.find(r=>r.kind==='job'&&r.facts.jobId===request.jobId&&r.status==='COMPLETE');
   need(s.kind==='gitlab'&&job,'Choose an already retained exact original GitLab job.');
   facts={...job.facts,gitlabSourceId:s.id,jobSourceSha256:job.sha256,origin:'operator-upload',archiveSha256:retained.sha256};
  }else if(['operator-evidence','upgrade-instructions'].includes(input.kind))facts=selectedSourceFacts(input.kind,null);
  else{
   let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await store.raw(retained.sha256)));}
   catch{throw fault('RELEASE_ORIGINAL_JSON','Keep the complete original UTF-8 JSON source.');}
   facts=selectedSourceFacts(input.kind,value);
  }
  const record={schema:RELEASE_OPERATIONS_SCHEMA+'.source',name,kind:input.kind,status:'COMPLETE',request,createdAt:now(),
   resources:[{key:'original',name,kind:input.kind,status:'COMPLETE',...retained,facts}],facts};
  record.contentHash=sourceSeal(record);
  return store.transaction(()=>{const existing=store.get(K.source,input.id,false);if(existing){need(equal(existing.request,request),'This source ID changed.',409);return existing;}indexSource({...record,id:input.id});return store.writeRecord(K.source,input.id,record,0);});
 }

 function assess(record){
  const d=record.definition,issues=[],bindings=[],formBindings=[],seen=new Set();
  const add=(code,label,detail='',blocking=false)=>{const item={code,label,detail,severity:blocking?'blocking':'review',allowed:blocking?[]:['accept','revise','not-applicable']};item.id=hash(item);if(!issues.some(x=>x.id===item.id))issues.push(item);};
  function bind(id,label,kinds){
   if(!id){add('SOURCE_REQUIRED',label+' requires an original source.','',true);return null;}
   const s=store.get(K.source,id,false);
   if(!s||s.status!=='COMPLETE'){add('SOURCE_INCOMPLETE',label+' is not completely received.',id,true);return null;}
   if(kinds&&!kinds.includes(s.kind)){add('SOURCE_KIND',label+' uses another kind of original.',s.kind,true);return null;}
   if(!seen.has(id)){seen.add(id);bindings.push({sourceId:id,contentHash:s.contentHash,kind:s.kind,resources:s.resources.map(r=>({key:r.key,sha256:r.sha256,bytes:r.bytes}))});}
   return s;
  }
  const appBefore=bind(d.application.baselineSourceId,'Application baseline',['gitlab']);
  const appAfter=bind(d.application.candidateSourceId,'Application candidate',['gitlab']);
  const centralBefore=bind(d.central.baselineSourceId,'Current Central handover',['central-handover']);
  const centralAfter=bind(d.central.candidateSourceId,'Selected Central release',['central-handover','central-release']);
  if(appBefore&&appAfter&&(appBefore.request.connectionId!==appAfter.request.connectionId||appBefore.connection.url!==appAfter.connection.url))
   add('APPLICATION_PROVIDER','The baseline and candidate belong to different configured GitLab providers.','',true);
  const appChanged=appBefore?.facts.pipeline?.commit!==appAfter?.facts.pipeline?.commit;
  const centralChanged=centralBefore?.facts.commit!==centralAfter?.facts.commit||centralBefore?.facts.backendCommit!==centralAfter?.facts.backendCommit;
  const selectedOrigin=d.central.origin?origin(d.central.origin):null;
  if(!selectedOrigin||!d.central.connectionId)add('CENTRAL_SELECTION','Choose the existing Central connection and original origin.','',true);
  const centralConnection=d.central.connectionId?store.get('connection',d.central.connectionId,false):null;
  if(!centralConnection||origin(centralConnection.url)!==selectedOrigin)add('CENTRAL_CONNECTION','The selected original Central connection is absent or belongs to another origin.','',true);
  if(centralBefore&&centralBefore.facts.origin!==selectedOrigin)add('CENTRAL_ORIGIN','The baseline handover belongs to another Central origin.','',true);
  for(const [label,s] of [['baseline',appBefore],['candidate',appAfter]]){
   if(s&&s.request.projectId!==numeric(d.application.projectId))add('APPLICATION_PROJECT','The '+label+' project differs from the selected application.','',true);
  }
  if(!d.application.environmentId)add('APPLICATION_ENVIRONMENT','Choose the exact existing deployment environment ID.','',true);
  if(appBefore&&!appBefore.facts.deployments.some(x=>x.environmentId===numeric(d.application.environmentId)&&x.status==='success'))
   add('BASELINE_DEPLOYMENT','The baseline lacks a successful original deployment in the selected environment.','A pipeline alone is not a deployed baseline.',true);
  const artifacts=[];
  for(const key of d.application.artifactKeys){
   let source=appAfter,resourceKey=key;
   if(key.includes('/')){const split=key.lastIndexOf('/');source=bind(key.slice(0,split),'Selected uploaded artifact',['gitlab-artifact']);resourceKey=key.slice(split+1);}
   const r=source?.resources.find(r=>r.key===resourceKey&&r.status==='COMPLETE'&&['artifact','gitlab-artifact'].includes(r.kind));
   if(!r){add('ARTIFACT_REQUIRED','A selected original artifact is absent.',key,true);continue;}
   if(r.facts.projectId!==numeric(d.application.projectId)||r.facts.pipelineId!==appAfter?.request.pipelineId||
      (r.facts.commit&&r.facts.commit!==appAfter?.facts.pipeline?.commit))
    add('ARTIFACT_LINEAGE','The original artifact belongs to another application candidate.',key,true);
   if(source.kind==='gitlab-artifact'){
    const bound=store.get(K.source,r.facts.gitlabSourceId,false),originalJob=bound?.resources.find(x=>x.kind==='job'&&x.status==='COMPLETE'&&x.facts.jobId===r.facts.jobId);
    if(!bound||bound.kind!=='gitlab'||bound.request.connectionId!==appAfter?.request.connectionId||bound.connection.url!==appAfter?.connection.url||
       !originalJob||originalJob.sha256!==r.facts.jobSourceSha256)
     add('ARTIFACT_PROVIDER','The uploaded artifact is bound to another provider or original job source.',key,true);
    if(!appAfter?.facts.jobs.some(j=>j.jobId===r.facts.jobId&&j.commit===r.facts.commit&&j.status==='success'))
     add('ARTIFACT_CANDIDATE_JOB','Receive the same exact artifact-producing job in the complete application candidate.',key,true);
   }
   const job=source.kind==='gitlab'?source.facts.jobs.find(j=>j.jobId===r.facts.jobId):r.facts;
   if(!job||job.status!=='success')add('ARTIFACT_JOB','The original artifact-producing job is not successfully received.',key,true);
   add('ARTIFACT_REVIEW','Review the exact deployment artifact.',key+' SHA256 '+r.sha256+'; verify the original native deployment procedure consumes this artifact. A deployment commit alone does not attest archive bytes.');
   artifacts.push({sourceId:source.id,key:r.key,sha256:r.sha256,bytes:r.bytes,jobId:r.facts.jobId,origin:r.facts.origin});
  }
  if(!artifacts.length)add('ARTIFACT_REQUIRED','Select the exact original application deployment artifact.','',true);
  for(const dep of d.dependencies){
   bind(dep.sourceId,'Dependency '+(dep.label||dep.id));
   if(!dep.label?.trim()||!dep.requirement?.trim()||!dep.owner?.trim())add('DEPENDENCY_CONTRACT','Record the dependency, requirement and responsible owner.',dep.id,true);
   else add('DEPENDENCY_REVIEW','Review dependency: '+dep.label,dep.requirement+' — '+dep.owner);
  }
  const recovery=d.recovery,snapshot=bind(recovery.snapshotSourceId,'Recovery snapshot',['central-snapshot']);
  const restore=bind(recovery.restoreSourceId,'Rehearsed isolated restore',['central-restore']);
  if(!recovery.custodian?.trim()||!recovery.procedure?.trim()||!recovery.quiescence?.trim()||!recovery.acceptedLossWindow?.trim())
   add('RECOVERY_CONTRACT','Record original backup custody, procedure, quiescence and accepted data-loss window.','',true);
  if(snapshot&&centralBefore&&(snapshot.facts.origin!==centralBefore.facts.origin||snapshot.facts.commit!==centralBefore.facts.commit||snapshot.facts.backendCommit!==centralBefore.facts.backendCommit))
   add('SNAPSHOT_BASELINE','The selected snapshot does not match the current Central baseline.','',true);
  if(snapshot&&restore){
   if(restore.facts.snapshotSha256!==snapshot.resources[0].sha256||restore.facts.snapshotBytes!==snapshot.resources[0].bytes)
    add('RESTORE_SNAPSHOT','The actual rehearsal restored another original snapshot.','',true);
   if(restore.facts.origin===centralBefore?.facts.origin||restore.facts.destination===centralBefore?.facts.composeProject)
    add('RESTORE_ISOLATION','The restore target must remain distinct from the production origin and compose project.','',true);
   if(!restore.facts.version.includes(snapshot.facts.commit)||!restore.facts.version.includes(snapshot.facts.backendCommit)||
      !equal([...restore.facts.projectIds].sort(),[...snapshot.facts.projectIds].sort()))
    add('RESTORE_CONTENT','The actual restored version or project roster differs from the selected snapshot.','',true);
  }
  if(!recovery.coverage.length)add('RECOVERY_COVERAGE','Describe database, attachments, web-form state, secrets/runtime and external storage coverage.','',true);
  for(const item of recovery.coverage){
   if(!item.label?.trim()||!item.note?.trim()||!['covered','not-applicable','missing'].includes(item.status))
    add('COVERAGE_DETAIL','Complete each recovery coverage decision.',item.id??'',true);
   if(item.status==='missing')add('COVERAGE_MISSING','Recovery coverage is missing: '+item.label,item.note,true);
   else{if(item.status==='covered')bind(item.sourceId,'Recovery coverage '+item.label);
    add('COVERAGE_REVIEW','Review recovery coverage: '+item.label,item.status+' — '+item.note);}
  }
  add('RECOVERY_AUTHORITY','Confirm recovery custody and execution authority.',
   'Snapshot metadata is not the backup payload. Preserve original private host backup files; the existing owner performs isolated restore. '+(recovery.procedure??''));
  const order=[],visiting=new Set(),visited=new Set(),steps=new Map(d.steps.map(s=>[s.id,s]));
  function visit(step){
   if(visited.has(step.id))return;if(visiting.has(step.id)){add('STEP_CYCLE','The ordered plan contains a dependency cycle.',step.id,true);return;}
   visiting.add(step.id);
   for(const dep of step.dependsOn){const prev=steps.get(dep);if(!prev)add('STEP_DEPENDENCY','A planned predecessor is absent.',dep,true);
    else{if(step.phase==='release'&&prev.phase==='recovery')add('STEP_PHASE','A release step cannot require a recovery-only step.',step.id,true);visit(prev);}}
   visiting.delete(step.id);visited.add(step.id);order.push(step.id);
  }
  for(const step of d.steps){
   visit(step);
   if(!step.title?.trim()||!step.owner?.trim()||!step.procedure?.trim())add('STEP_OWNER','Record each step title, owner and exact native procedure.',step.id,true);
   bind(step.expectedSourceId,'Expected source for '+(step.title||step.id));
   if(step.kind==='app-deploy'&&step.expectedSourceId!==(step.phase==='release'?d.application.candidateSourceId:d.application.baselineSourceId))
    add('STEP_TARGET','The application step must use the selected '+(step.phase==='release'?'candidate':'baseline')+' source.',step.id,true);
   if(step.kind==='central-upgrade'&&(step.phase!=='release'||step.expectedSourceId!==d.central.candidateSourceId))
    add('STEP_TARGET','Central upgrade must target the selected release candidate; recovery is a separate isolated restore.',step.id,true);
   if(step.kind==='app-deploy'&&step.evidenceKind!=='deployment'||step.kind==='central-upgrade'&&step.evidenceKind!=='host'||
      step.kind==='restore'&&step.evidenceKind!=='restore'||step.kind==='form-publish'&&step.evidenceKind!=='form-publication')
    add('STEP_EVIDENCE','Use native result evidence for the selected step kind.',step.id,true);
   if(step.kind==='form-publish'){
    const p=step.formPlanId?store.get('form-release-plan',step.formPlanId,false):null;
    if(!p)add('FORM_PLAN','Select the existing original form publication plan.',step.id,true);
    else{
     formBindings.push({planId:p.id,contentHash:hash(p)});
     if(p.target?.connectionId!==d.central.connectionId)add('FORM_CONNECTION','The original form plan belongs to another Central connection.',step.id,true);
     try{need(formReleases?.validatePublicationPlan,'The existing form publisher is not composed.');formReleases.validatePublicationPlan({planId:p.id,candidateContentHash:p.candidate?.contentHash,target:p.target});}
     catch(error){add('FORM_PLAN_CURRENT','The existing form publication plan is not currently approved.',error.message,true);}
     add('FORM_DEPENDENCY','Confirm this exact form plan follows the coupled software dependencies.',p.id);
    }
   }
   add('STEP_REVIEW','Review native procedure: '+(step.title||step.id),(step.owner??'')+' — '+(step.procedure??''));
  }
  if(!d.steps.some(s=>s.phase==='release'))add('RELEASE_STEPS','Add the actual release steps.','',true);
  if(!d.steps.some(s=>s.phase==='recovery'&&s.kind==='restore'))add('RECOVERY_STEPS','Add the actual isolated Central recovery step.','',true);
  if(appChanged&&!d.steps.some(s=>s.phase==='release'&&s.kind==='app-deploy'))add('APPLICATION_STEP','The changed application needs a native deployment receiving step.','',true);
  if(centralChanged){
   if(!d.steps.some(s=>s.phase==='release'&&s.kind==='central-upgrade'))add('CENTRAL_STEP','The changed Central source needs its original owner upgrade step.','',true);
   if(!d.dependencies.some(dep=>store.get(K.source,dep.sourceId,false)?.kind==='upgrade-instructions'))
    add('UPGRADE_INSTRUCTIONS','Retain all applicable original Central upgrade instructions as a dependency.','',true);
   add('CENTRAL_NO_DOWNGRADE','Confirm the selected Central upgrade and separate recovery route.',
    'No in-place Central downgrade is promised. Restore uses the original snapshot in a distinct isolated runtime; migration compatibility remains the native owner’s decision.');
  }
  for(const check of d.checks){
   if(!check.label?.trim()||!check.expected?.trim()||!check.procedure?.trim())add('CHECK_CONTRACT','Record the acceptance expectation and verification procedure.',check.id,true);
   bind(check.sourceId,'Acceptance basis '+(check.label||check.id));
  }
  for(const phase of ['release','recovery'])if(!d.checks.some(c=>c.phase===phase&&c.required&&c.component==='joint'))
   add('JOINT_CHECK','Add a required joint application/Central '+phase+' acceptance check.','',true);
  const inventory={application:{baseline:appBefore?.facts??null,candidate:appAfter?.facts??null,projectId:numeric(d.application.projectId),environmentId:numeric(d.application.environmentId),artifacts},
   central:{baseline:centralBefore?.facts??null,candidate:centralAfter?.facts??null,origin:selectedOrigin,connectionId:d.central.connectionId},
   recovery:{snapshot:snapshot?.facts??null,restore:restore?.facts??null}};
  const result={inventory,changes:{application:appChanged,central:centralChanged},issues,sourceBindings:bindings,formBindings,stepOrder:order};
  result.hash=hash(result);return result;
 }
 function assessmentReady(record,a){
  const decisions=new Map(record.decisions.map(d=>[d.issueId,d])),remaining=a.issues.filter(issue=>{
   const d=decisions.get(issue.id);return issue.severity==='blocking'||!d||!issue.allowed.includes(d.decision)||d.decision==='revise'||!d.note?.trim();
  });
  const stale=record.decisions.filter(d=>!a.issues.some(i=>i.id===d.issueId));
  return {canFreeze:!remaining.length&&!stale.length,issues:[...remaining,...stale.map(x=>({id:x.issueId,label:'A saved decision belongs to a previous assessment.',severity:'blocking'}))]};
 }
 function phaseReady(record){
  const phase=record.activePhase,steps=record.definition.steps.filter(s=>s.phase===phase);
  const latest=(values,key,id)=>[...values].reverse().find(x=>x[key]===id);
  const issues=[];
  const resultBindings=()=>steps.map(step=>({stepId:step.id,resultId:latest(record.results,'stepId',step.id)?.id??null}));
  for(const step of steps){const result=latest(record.results,'stepId',step.id);if(!result?.accepted||step.dependsOn.some(id=>result.predecessors?.find(x=>x.stepId===id)?.resultId!==latest(record.results,'stepId',id)?.id))issues.push({code:'STEP_NOT_ACCEPTED',label:'Receive successful original result: '+step.title,stepId:step.id});}
  for(const check of record.definition.checks.filter(c=>c.phase===phase&&c.required)){
   const result=latest(record.checkResults,'checkId',check.id);
   if(result?.decision!=='accept'||!equal(result.stepResults,resultBindings()))issues.push({code:'CHECK_NOT_ACCEPTED',label:'Complete actual acceptance check: '+check.label,checkId:check.id});
  }
  return {canAccept:!!record.planId&&steps.length>0&&!issues.length,issues};
 }
 function getOperation(input){
  const record=store.get(K.operation,ident(typeof input==='string'?input:input.id,'operation ID'));
  const assessment=record.planId?store.get(K.plan,record.planId).assessment:assess(record);
  const draft=assessmentReady(record,assessment),phase=phaseReady(record);
  return {...record,assessment,readiness:{canFreeze:record.status==='DRAFT'&&draft.canFreeze,canAccept:!['DRAFT','ACCEPTED','RECOVERED'].includes(record.status)&&phase.canAccept,
   issues:record.status==='DRAFT'?draft.issues:phase.issues}};
 }
 function commit(action,input,fn){
  ident(input.requestId,'request ID');const request=clone(input),old=store.get(K.request,input.requestId,false);
  if(old){need(old.action===action&&equal(old.input,request),'This request ID already retains another original action.',409);return clone(old.result);}
  return store.transaction(()=>{
   const prior=store.get(K.request,input.requestId,false);if(prior){need(prior.action===action&&equal(prior.input,request),'The original request changed.',409);return prior.result;}
   const result=fn();
   store.writeRecord(K.request,input.requestId,{schema:RELEASE_OPERATIONS_SCHEMA+'.request',requestId:input.requestId,action,input:request,result:clone(result),at:now()},0);
   return result;
  });
 }
 function editable(input,allowFrozen=false){
  const r=store.get(K.operation,ident(input.id,'operation ID'));
  need(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision===r.revision,'Reopen the current operation revision.',409);
  need(allowFrozen||r.status==='DRAFT','Preserve the frozen plan; create a successor to change its definition.',409);
  if(allowFrozen)need(!['ACCEPTED','RECOVERED'].includes(r.status),'This outcome is accepted; use a successor operation.',409);
  text(input.reviewer,'reviewer');text(input.note,'review note');return r;
 }
 function saveRecord(record,input,event){
  record.history.push({at:now(),requestId:input.requestId,reviewer:input.reviewer??null,note:input.note??null,...event});
  store.writeRecord(K.operation,record.id,record,record.revision);return getOperation(record.id);
 }
 function newRecord(input,fromId=null){
  ident(input.id,'operation ID');need(!store.get(K.operation,input.id,false),'This operation ID already exists.',409);
  const definition=normalizeDefinition(input.definition),record={schema:RELEASE_OPERATIONS_SCHEMA,id:input.id,name:text(input.name,'operation name'),
   status:'DRAFT',definition,decisions:[],decisionEvents:[],planId:null,results:[],checkResults:[],history:[],activePhase:'release',createdAt:now(),fromId};
  record.history.push({action:'created',requestId:input.requestId,at:now(),fromId,reviewer:input.reviewer??null,note:input.note??null});
  store.writeRecord(K.operation,input.id,record,0);return getOperation(input.id);
 }
 const createOperation=input=>commit('createOperation',input,()=>newRecord(input));
 const successorOperation=input=>commit('successorOperation',input,()=>{
  const from=store.get(K.operation,ident(input.fromId,'predecessor ID'));need(from.planId,'Choose an actual frozen predecessor.');text(input.reviewer,'reviewer');text(input.note,'successor reason');return newRecord(input,from.id);
 });
 const reviseOperation=input=>commit('reviseOperation',input,()=>{const r=editable(input);const before=clone(r.definition);
  r.definition=normalizeDefinition(input.definition);if(input.name!==undefined)r.name=text(input.name,'operation name');r.decisions=[];return saveRecord(r,input,{action:'definition-revised',before,after:clone(r.definition)});
 });
 const decide=input=>commit('decide',input,()=>{
  const r=editable(input),a=assess(r),seen=new Set();need(Array.isArray(input.decisions),'Supply the complete reviewed disposition selection.');
  for(const d of input.decisions){need(!seen.has(d.issueId),'Use one disposition per issue.');seen.add(d.issueId);const issue=a.issues.find(x=>x.id===d.issueId);
   need(issue&&issue.allowed.includes(d.decision),'Reopen this assessment and choose an allowed disposition.');text(d.note,'each disposition note');}
  r.decisions=clone(input.decisions);r.decisionEvents.push({requestId:input.requestId,at:now(),reviewer:input.reviewer,note:input.note,assessmentHash:a.hash,decisions:clone(r.decisions)});
  return saveRecord(r,input,{action:'decisions-saved',assessmentHash:a.hash});
 });
 const freeze=input=>commit('freeze',input,()=>{
  const r=editable(input),a=assess(r),ready=assessmentReady(r,a);need(ready.canFreeze,'Resolve all source and review issues before freezing.',409);
  const planId='release-plan-'+randomUUID(),plan={schema:RELEASE_OPERATIONS_SCHEMA+'.plan',operationId:r.id,operationRevision:r.revision,workspaceId:store.identity().workspaceId,
   definition:clone(r.definition),assessment:a,decisions:clone(r.decisions),reviewer:input.reviewer,note:input.note,createdAt:now()};
  plan.contentHash=hash(plan);store.writeRecord(K.plan,planId,plan,0);r.planId=planId;r.status='FROZEN';
  return saveRecord(r,input,{action:'plan-frozen',planId,contentHash:plan.contentHash});
 });

 function frozen(input){
  const r=editable(input,true);need(r.planId&&r.status!=='DRAFT','Freeze the reviewed original plan first.',409);
  const p=store.get(K.plan,r.planId);
  for(const b of p.assessment.sourceBindings){const s=getSource(b.sourceId);need(s.status==='COMPLETE'&&s.contentHash===b.contentHash,'A frozen original source binding changed.',409);}
  for(const b of p.assessment.formBindings??[])need(hash(store.get('form-release-plan',b.planId))===b.contentHash,'A frozen form plan binding changed.',409);
  return {record:r,plan:p};
 }
 function deriveStep(record,plan,step,s,r){
  const d=plan.definition,differences=[],expect=getSource(step.expectedSourceId),f=r.facts;
  let outcome='unknown';const mismatch=message=>differences.push(message);
  const phaseStartedAt=step.phase==='recovery'?record.recoveryStartedAt:plan.createdAt;
  const afterStart=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>=Date.parse(phaseStartedAt);
  if(step.evidenceKind==='deployment'){
   if(s.kind!=='gitlab'||r.kind!=='deployment'){mismatch('Receive the original GitLab deployment resource.');return {outcome,differences};}
   if(expect.kind!=='gitlab')mismatch('Expected application source is not a retained GitLab candidate.');
   if(s.request.connectionId!==expect.request.connectionId||s.connection.url!==expect.connection.url)mismatch('GitLab connection differs.');
   if(f.projectId!==numeric(d.application.projectId))mismatch('Application project differs.');
   if(f.environmentId!==numeric(d.application.environmentId))mismatch('Deployment environment differs.');
   if(f.commit!==expect.facts.pipeline?.commit)mismatch('Deployment commit differs from the frozen step source.');
   if(f.pipelineId!==s.request.pipelineId)mismatch('Deployment pipeline differs from the received original pipeline.');
   const job=s.facts.jobs.find(j=>j.jobId===f.jobId);
   if(!job)mismatch('Receive the exact original deployable job as part of this GitLab source.');
   else if(job.projectId!==f.projectId||job.pipelineId!==f.pipelineId||job.commit!==f.commit||job.status!=='success')mismatch('Deployable job lineage or successful status differs.');
   if(!afterStart(job?.finishedAt??f.updatedAt??f.createdAt))mismatch('The deployment result predates the frozen phase; receive the actual later native operation.');
   outcome=f.status==='success'?'success':['failed','canceled','blocked'].includes(f.status)?'failure':'unknown';
  }else if(step.evidenceKind==='host'){
   if(s.kind!=='central-handover'){mismatch('Receive the actual original Central host handover.');return {outcome,differences};}
   if(f.origin!==d.central.origin.replace(/\/$/,''))mismatch('Central origin differs.');
   if(!afterStart(f.observedAt))mismatch('The host readiness result predates the frozen phase.');
   if(f.commit!==expect.facts.commit||f.backendCommit!==expect.facts.backendCommit)mismatch('Central release/source commits differ.');
   if(!['central-release','central-handover'].includes(expect.kind))mismatch('Expected source is not a Central software release.');
   outcome='success';
  }else if(step.evidenceKind==='restore'){
   if(s.kind!=='central-restore'){mismatch('Receive the actual original isolated restore result.');return {outcome,differences};}
   const snapshot=getSource(d.recovery.snapshotSourceId),base=getSource(d.central.baselineSourceId);
   if(!afterStart(f.at)||s.id===d.recovery.restoreSourceId)mismatch('Receive the actual recovery result after recovery began; the earlier rehearsal remains separate.');
   if(f.snapshotSha256!==snapshot.resources[0].sha256||f.snapshotBytes!==snapshot.resources[0].bytes)mismatch('Restored snapshot original bytes differ.');
   if(f.origin===base.facts.origin||f.destination===base.facts.composeProject)mismatch('Restore destination is not isolated from the retained production service.');
   if(!f.version.includes(snapshot.facts.commit)||!f.version.includes(snapshot.facts.backendCommit))mismatch('Restored runtime source differs.');
   if(!equal([...f.projectIds].sort(),[...snapshot.facts.projectIds].sort()))mismatch('Restored project roster differs.');
   outcome='success';
  }else if(step.evidenceKind==='form-publication'){
   if(s.kind!=='form-publication'){mismatch('Receive the original form publication receiving result.');return {outcome,differences};}
   if(f.planId!==step.formPlanId)mismatch('Original form publication plan differs.');
   if(!afterStart(f.receivedAt))mismatch('The native publication receiving result predates the frozen phase.');
   const native=store.list('form-release-publication').find(p=>p.planId===f.planId&&p.source?.contentHash===f.contentHash&&p.outcome===f.outcome);
   if(!native)mismatch('This original publication receiving result is not present in the same workspace.');
   outcome=f.outcome==='MATCHED'?'success':'failure';if(list(f.differences).length)mismatch('The original publisher recorded changed output.');
  }else{
   if(!['operator-evidence','upgrade-instructions'].includes(s.kind))mismatch('Select the actual operator evidence document.');
   if(!afterStart(s.createdAt))mismatch('Receive the actual later operator evidence for this frozen phase.');
   outcome='operator-review';
  }
  return {outcome,differences};
 }
 const receiveStep=input=>commit('receiveStep',input,()=>{
  const {record:r,plan}=frozen(input),step=r.definition.steps.find(s=>s.id===input.stepId);
  need(step&&step.phase===r.activePhase,'Select a step in the current release or recovery phase.');
  need(['success','failure','unknown'].includes(input.reportedOutcome),'Select the observed result.');
  const {source:s,resource:original}=resource(input.sourceId,input.resourceKey);need(s.status==='COMPLETE','Complete this source receiving before reviewing its result.');
  for(const dependency of step.dependsOn){const previous=[...r.results].reverse().find(x=>x.stepId===dependency);need(previous?.accepted,'Receive the actual successful predecessor result before this step.',409);}
  const derived=deriveStep(r,plan,step,s,original);
  const accepted=!derived.differences.length&&input.reportedOutcome==='success'&&['success','operator-review'].includes(derived.outcome);
  const result={id:randomUUID(),stepId:step.id,phase:step.phase,sourceId:s.id,resourceKey:original.key,sourceContentHash:s.contentHash,
   resourceSha256:original.sha256,predecessors:step.dependsOn.map(id=>({stepId:id,resultId:[...r.results].reverse().find(x=>x.stepId===id)?.id??null})),reportedOutcome:input.reportedOutcome,derivedOutcome:derived.outcome,differences:derived.differences,
   accepted,at:now(),reviewer:input.reviewer,note:input.note,requestId:input.requestId};
  r.results.push(result);r.status=r.activePhase==='release'?'RECEIVING':'RECOVERING';
  return saveRecord(r,input,{action:'step-result-received',resultId:result.id});
 });
 const recordCheck=input=>commit('recordCheck',input,()=>{
  const {record:r,plan}=frozen(input),check=r.definition.checks.find(c=>c.id===input.checkId);
  need(check&&check.phase===r.activePhase,'Select an acceptance check in the current phase.');
  need(['accept','reject','pending'].includes(input.decision),'Select the staff acceptance disposition.');
  const {source:s,resource:original}=resource(input.sourceId,input.resourceKey);need(s.status==='COMPLETE','Complete the original acceptance source.');
  if(input.decision==='accept')need(Date.parse(s.createdAt)>=Date.parse(r.activePhase==='recovery'?r.recoveryStartedAt:plan.createdAt),'Receive the actual post-phase acceptance evidence; preserve the earlier expected source separately.',409);
  const stepResults=r.definition.steps.filter(s=>s.phase===r.activePhase).map(s=>({stepId:s.id,resultId:[...r.results].reverse().find(x=>x.stepId===s.id)?.id??null}));
  if(input.decision==='accept')need(stepResults.every(x=>r.results.find(v=>v.id===x.resultId)?.accepted),'Receive all successful original step outcomes before accepting the final check.',409);
  const result={id:randomUUID(),checkId:check.id,phase:check.phase,stepResults,expected:check.expected,actual:text(input.actual,'actual observed result'),decision:input.decision,
   sourceId:s.id,resourceKey:original.key,sourceContentHash:s.contentHash,resourceSha256:original.sha256,
   reviewer:input.reviewer,note:input.note,at:now(),requestId:input.requestId};
  r.checkResults.push(result);return saveRecord(r,input,{action:'acceptance-check-recorded',resultId:result.id});
 });
 const beginRecovery=input=>commit('beginRecovery',input,()=>{
  const {record:r}=frozen(input);need(r.activePhase==='release','Recovery is already active.',409);
  need(r.definition.steps.some(s=>s.phase==='recovery'&&s.kind==='restore'),'This frozen plan has no original isolated restore step.');
  r.activePhase='recovery';r.recoveryStartedAt=now();r.status='RECOVERING';return saveRecord(r,input,{action:'recovery-started'});
 });
 const acceptOperation=input=>commit('acceptOperation',input,()=>{
  const {record:r}=frozen(input),ready=phaseReady(r);need(ready.canAccept,'Receive every current-phase result and required original acceptance check.',409);
  r.status=r.activePhase==='release'?'ACCEPTED':'RECOVERED';r.acceptance={phase:r.activePhase,at:now(),reviewer:input.reviewer,note:input.note,
   planId:r.planId,results:r.results.filter(x=>x.phase===r.activePhase).map(x=>x.id),checks:r.checkResults.filter(x=>x.phase===r.activePhase).map(x=>x.id)};
  return saveRecord(r,input,{action:'outcome-accepted',acceptance:clone(r.acceptance)});
 });
 function state(){
  const operations=store.list(K.operation).map(r=>{const p=getOperation(r.id);return {id:p.id,revision:p.revision,name:p.name,status:p.status,activePhase:p.activePhase,planId:p.planId,readiness:p.readiness,updatedAt:p.updatedAt};});
  return {schema:RELEASE_OPERATIONS_SCHEMA,workspaceId:store.identity().workspaceId,capabilities:{gitlabReadOnly:true,softwareMutation:false},
   sources:store.list(K.source),operations,activeOperations:[...running.keys()],sourceKinds:SOURCE_KINDS,stepKinds:STEP_KINDS,evidenceKinds:EVIDENCE_KINDS,
   connections:gitlab.connections(),centralConnections:store.list('connection').map(c=>({id:c.id,name:c.name,url:c.url,verifiedAt:c.verifiedAt})),formPlans:store.list('form-release-plan').map(p=>({id:p.id,reviewId:p.reviewId,target:p.target,candidateContentHash:p.candidate?.contentHash,createdAt:p.createdAt}))};
 }
 async function file(input){const {source:s,resource:r}=resource(input.sourceId,input.resourceKey);return {...await store.sourceFile(r.sha256),name:r.name,kind:r.kind,sourceId:s.id};}
 function exportHandover(input){
  const operation=getOperation(input),ids=new Set(operation.assessment.sourceBindings.map(x=>x.sourceId));
  for(const result of [...operation.results,...operation.checkResults])ids.add(result.sourceId);
  const result={schema:RELEASE_OPERATIONS_SCHEMA+'.handover',workspaceId:store.identity().workspaceId,exportedAt:now(),operation,
   plan:operation.planId?store.get(K.plan,operation.planId):null,sources:[...ids].map(id=>getSource(id)),
   requests:store.list(K.request).filter(r=>r.input.id===operation.id),
   custody:'Original bodies remain in this workspace source store and its complete native workspace archive. Private Central backup payloads remain with the original host custodian.',
   execution:'This desk records original sources, reviewed plans and received outcomes. It performs no deployment, Central upgrade, publication or restore.'};
  result.contentHash=hash(result);return result;
 }
 function tracked(fn){need(!closing,'The original workspace is closing.',503);const p=Promise.resolve().then(fn);uploads.add(p);p.finally(()=>uploads.delete(p)).catch(()=>{});return p;}
 const api={state,getSource,getOperation,getPlan:input=>store.get(K.plan,ident(typeof input==='string'?input:input.id,'plan ID')),
  getRequest:input=>store.get(K.request,ident(typeof input==='string'?input:input.requestId,'request ID')),
  receiveGitLab,resumeSource,receiveOriginal:(input,stream)=>tracked(()=>receiveOriginal(input,stream)),file:input=>tracked(()=>file(input)),
  createOperation,reviseOperation,successorOperation,decide,freeze,receiveStep,recordCheck,beginRecovery,acceptOperation,exportHandover};
 workspace.releaseOperations=api;
 workspace.close=()=>{if(closePromise)return closePromise;closing=true;for(const item of running.values())item.controller.abort();
  closePromise=(async()=>{await Promise.allSettled([...running.values()].map(x=>x.promise));await Promise.allSettled([...uploads]);return originalClose();})();return closePromise;};
 return api;
}
