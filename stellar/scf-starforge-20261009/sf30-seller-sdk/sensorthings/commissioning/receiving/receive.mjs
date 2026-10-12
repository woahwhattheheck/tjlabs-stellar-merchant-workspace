// MIT. One complete retained-source FROST commissioning and receiving operation.
import {constants} from 'node:fs';
import {open,readFile,lstat,mkdir,rename,link,unlink,readdir,realpath} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {privateDirectory,readOwned,atomicJSON,acquireWorkspaceLease,syncDir} from '../../../stellar-expert/store.mjs';
import {openSensorThingsWorkspace} from '../../core.mjs';
import {receiveHamburg,HAMBURG_OPERATION} from '../../receive-hamburg.mjs';
import {snapshotProject} from '../history.mjs';
import {projectObjects} from '../portable.mjs';
import {exactParse,exact} from '../common.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
export const OPERATION='DATACOVE-SENSORTHINGS-COMMISSIONING-0C7A-20261012';
const RECORDING={bytes:2965230,sha256:'34fb0322092a51525e94beda0d6c3b21548b7261d65d80909b27eb6fa6a2d466',responses:28};
const SCHEMA='stellar-forge.datacove-complete-receiving.v1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const fail=(code,message,details=null)=>Object.assign(new Error(message),{code,details});
const exists=async path=>{try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const document=async(path,limit=32*1024*1024)=>JSON.parse((await readOwned(path,limit)).toString('utf8'));
const iso=()=>new Date().toISOString();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const safeName=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(value);
const safeRelative=value=>typeof value==='string'&&value&&!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').some(x=>!x||x==='.'||x==='..');
async function identityFile(path){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await fd.stat({bigint:true});if(!before.isFile())throw fail('FILE_TYPE','Select a retained regular file.');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
  while(true){const item=await fd.read(buffer,0,buffer.length,null);if(!item.bytesRead)break;bytes+=item.bytesRead;hash.update(buffer.subarray(0,item.bytesRead));}
  const after=await fd.stat({bigint:true});
  if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||BigInt(bytes)!==before.size)
   throw fail('FILE_CHANGED','The selected original file changed during its complete read.');
  return {bytes,sha256:hash.digest('hex')};
 }finally{await fd.close();}
}
async function keep(path,bytes){
 await privateDirectory(dirname(path),{create:true});
 if(await exists(path)){const prior=await readOwned(path,Math.max(bytes.length,1));if(!prior.equals(bytes))throw fail('OUTPUT_IDENTITY_CHANGED','The retained output already has other bytes.',{filename:relative(HERE,path)});return;}
 const temporary=path+'.'+randomUUID()+'.tmp',fd=await open(temporary,'wx',0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const prior=await readOwned(path,Math.max(bytes.length,1));if(!prior.equals(bytes))throw fail('OUTPUT_IDENTITY_CHANGED','The same original output differs.');}
 finally{await unlink(temporary).catch(()=>{});}await syncDir(dirname(path));
}
async function copyOriginal(source,destination,expected=null){
 if(await exists(destination)){
  const identity=await identityFile(destination);
  if(expected&&(identity.sha256!==expected.sha256||identity.bytes!==expected.bytes))throw fail('OUTPUT_IDENTITY_CHANGED','The received original file differs.');
  if(!expected){const original=await identityFile(source);if(identity.sha256!==original.sha256||identity.bytes!==original.bytes)throw fail('OUTPUT_IDENTITY_CHANGED','The selected original file differs.');}
  return {...identity,filename:destination.split('/').at(-1)};
 }
 await privateDirectory(dirname(destination),{create:true});
 const input=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW),temporary=destination+'.'+randomUUID()+'.tmp';
 let output=null;
 try{
  const before=await input.stat({bigint:true});if(!before.isFile())throw fail('FILE_TYPE','Select a retained regular source file.');
  output=await open(temporary,'wx',0o600);const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
  while(true){const item=await input.read(buffer,0,buffer.length,null);if(!item.bytesRead)break;let position=0;
   while(position<item.bytesRead){const part=await output.write(buffer,position,item.bytesRead-position,null);if(!part.bytesWritten)throw fail('WRITE','The private output stopped accepting bytes.');position+=part.bytesWritten;}
   bytes+=item.bytesRead;hash.update(buffer.subarray(0,item.bytesRead));
  }
  await output.sync();const after=await input.stat({bigint:true}),identity={bytes,sha256:hash.digest('hex')};
  if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||BigInt(bytes)!==before.size)
   throw fail('FILE_CHANGED','The retained original source changed during transfer.');
  if(expected&&(identity.sha256!==expected.sha256||identity.bytes!==expected.bytes))throw fail('SOURCE_IDENTITY_CHANGED','The original source differs from its selected complete identity.');
  await output.close();output=null;
  try{await link(temporary,destination);}catch(error){if(error.code!=='EEXIST')throw error;const other=await identityFile(destination);if(other.sha256!==identity.sha256||other.bytes!==identity.bytes)throw fail('OUTPUT_IDENTITY_CHANGED','Another received file occupies this identity.');}
  await syncDir(dirname(destination));return {...identity,filename:destination.split('/').at(-1)};
 }finally{await input.close();await output?.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
}
async function sourceSelection(sourceRoot,manifestFile,sourceRef){
 const bytes=await readOwned(manifestFile,32*1024*1024),manifest=JSON.parse(bytes.toString('utf8'));
 if((manifest.source_ref??manifest.sourceRef)!==sourceRef||!Array.isArray(manifest.files)||!manifest.files.length)throw fail('SOURCE_MANIFEST','Select the complete source manifest and its exact commit.');
 const selected=new Set(),files=[];let sourceBytes=0;
 for(const row of manifest.files){
  const path=row.path;if(!safeRelative(path)||selected.has(path))throw fail('SOURCE_MANIFEST','Every original source member needs one safe relative path.');
  selected.add(path);const absolute=join(sourceRoot,...path.split('/')),bytes=await readOwned(absolute,256*1024*1024);
  const sha256=digest(bytes),gitBlob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expectedGit=row.git_blob??row.gitBlob??row.sha;
  if(!row.sha256&&!expectedGit)throw fail('SOURCE_MANIFEST','Every selected source file needs its original digest.');
  if(row.sha256&&row.sha256!==sha256||expectedGit&&expectedGit!==gitBlob||row.bytes!==undefined&&row.bytes!==bytes.length)
   throw fail('SOURCE_MANIFEST_CHANGED','A selected source member differs.',{path});
  sourceBytes+=bytes.length;files.push({path,bytes:bytes.length,sha256,gitBlob});
 }
 return {sourceRef,manifestSha256:digest(bytes),sourceBytes,files};
}
function redact(value){
 if(typeof value==='string')return value.replace(/(https?:\/\/[^\s#"'<>]+)#[^\s"'<>]+/g,'$1#<private-session>').replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi,'Bearer <private>');
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/(?:^|_)(?:authorization|accessToken|token|password|secret|accessUrl)$/i.test(key)?'<private>':redact(item)]));
 return value;
}
function publicError(error){return redact({code:error.code??'RECEIVING',message:String(error.message??error).slice(0,2000),details:error.details??null});}
export async function receive(options){
 process.umask(0o077);
 for(const key of ['operation','sourceRoot','sourceManifest','recording','runtimeReady','targetReceipt'])
  if(!isAbsolute(options[key]??''))throw fail('PATH','Select each original source, runtime, target and private operation by absolute path.');
 if(typeof options.operator!=='string'||!options.operator.trim()||options.operator.length>240)throw fail('OPERATOR','Retain the responsible reference operator.');
 if(!/^[a-f0-9]{40}$/.test(options.sourceRef??''))throw fail('SOURCE_REF','Select the exact published source commit.');
 if(!options.browserModule||!isAbsolute(options.browserModule)||!isAbsolute(options.chromium??'')||!isAbsolute(options.playwright??''))throw fail('BROWSER_SELECTION','Select the complete original browser programme and its actual equipped runtime for this full receiving operation.');
 if(options.acknowledgeReferenceWrites!==true)throw fail('REFERENCE_WRITE_CONFIRMATION','Explicitly authorize this complete reference commissioning on its selected private FROST target.');
 const selectedRoot=await realpath(options.sourceRoot),selectedReceiver=join(selectedRoot,'stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/receiving/receive.mjs');
 if(selectedRoot!==resolve(options.sourceRoot)||await realpath(selectedReceiver)!==await realpath(fileURLToPath(import.meta.url)))
  throw fail('SOURCE_MODULE_TREE','Run the receiver from the same canonical repository tree selected by --source-root.');
 const root=await privateDirectory(options.operation,{create:true}),lease=await acquireWorkspaceLease(join(root,'receiving.lock'));
 let workspace=null,receiving=null,stopping=false;
 const stop=()=>{stopping=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 const check=()=>{lease.assert();if(stopping)throw fail('INTERRUPTED','The same original receiving operation was asked to drain. Resume its retained programme.');};
 try{
 const paths={primary:join(root,'primary-workspace'),inbox:join(root,'primary-inbox'),received:join(root,'receiving-workspace'),receivedInbox:join(root,'receiving-inbox'),
  journal:join(root,'operation.json'),inputs:join(root,'inputs'),requests:join(root,'requests'),phases:join(root,'phases'),delivery:join(root,'delivery')};
 for(const key of ['inbox','receivedInbox','inputs','requests','phases','delivery'])await privateDirectory(paths[key],{create:true});
 let state=await exists(paths.journal)?await document(paths.journal):{schema:SCHEMA,operationId:OPERATION,createdAt:iso(),state:'PREPARING',phases:{},decisions:[]};
 if(state.schema!==SCHEMA||state.operationId!==OPERATION)throw fail('OPERATION_IDENTITY','This directory contains a different original operation.');
 if(state.state!=='PREPARING'&&!options.resume)throw fail('RESUME','Reopen the original operation with --resume.');
 const save=async()=>{state.updatedAt=iso();await atomicJSON(paths.journal,state);};
 const phase=async(name,run)=>{
  check();if(!safeName(name))throw fail('PHASE','Use a stable original phase name.');
  const path=join(paths.phases,name+'.json');
  if(await exists(path)){const value=await document(path,128*1024*1024);state.phases[name]={state:'COMPLETE',file:'phases/'+name+'.json',sha256:digest(json(value))};return value;}
  state.currentPhase=name;state.state='RUNNING';await save();
  const value=await run();await keep(path,json(value));state.phases[name]={state:'COMPLETE',file:'phases/'+name+'.json',sha256:digest(json(value))};await save();return value;
 };
 const action=async(instance,label,suffix,payload)=>{
  check();if(!safeName(label))throw fail('REQUEST_LABEL','Use a stable original request label.');
  const actionName=suffix.startsWith('commissioning.')?suffix:'commissioning.'+suffix,requestPath=join(paths.requests,label+'.request.json'),
   resultPath=join(paths.requests,label+'.result.json'),operationId='DC0C7A_'+label.replace(/[^a-zA-Z0-9_-]/g,'_');
  const payloadHash=digest(json({action:actionName,payload}));let request;
  if(await exists(requestPath)){
   request=await document(requestPath);
   if(request.operationId!==operationId||digest(json({action:request.action,payload:request.payload}))!==payloadHash)throw fail('REQUEST_IDENTITY','This original programme step has another request.');
  }else{request={operationId,expectedRevision:(await instance.view()).revision,action:actionName,payload};await keep(requestPath,json(request));}
  if(await exists(resultPath))return (await document(resultPath,128*1024*1024)).result;
  let reply;
  // A revision-only rejection is before reservation/effect. Keep the exact
  // operation ID and body, retain the old preflight, and refresh only its view.
  for(let count=0;count<5;count++){
   try{reply=await instance.action(request);break;}catch(error){
    if(error.code!=='REVISION_CHANGED')throw error;
    const audit=join(paths.requests,label+'.revision-'+request.expectedRevision+'.json');if(!await exists(audit))await keep(audit,json({request,error:publicError(error),observedAt:iso()}));
    request={...request,expectedRevision:(await instance.view()).revision};await atomicJSON(requestPath,request);
   }
  }
  if(!reply)throw fail('REVISION_CHANGED','The original request remains pending against a changing workspace.');
  if(!Object.hasOwn(reply,'result'))throw fail('REQUEST_PENDING','The original request remains active; resume this same programme.',{operationId});
  await keep(resultPath,json(reply));return reply.result;
 };
 const pageAll=async(reader,field='rows')=>{
  let offset=0,rows=[],first=null;do{const page=await reader({offset,limit:500});first??=page;rows.push(...page[field]);offset=page.nextOffset;if(rows.length>1000000)throw fail('READ_CAPACITY','The complete native selection exceeds this programme capacity.');}while(offset!==null);
  return {...first,[field]:rows,offset:0,total:rows.length,nextOffset:null};
 };
 const waitJob=async(instance,id,{cancelAfter=null,label=null}={})=>{
  const started=Date.now(),deadline=(options.maxWaitSeconds??7200)*1000;
  for(;;){
   check();const job=await instance.commissioning.job(id,{offset:0,limit:1});
   if(job.latest?.closed===true){
    if(job.state==='COMPLETE'||job.state==='CANCELLED')return job;
    throw fail('NATIVE_ATTEMPT_REQUIRES_REVIEW','The actual original native attempt stopped. Retain its same job and inspect before continuation.',{jobId:id,state:job.state,error:job.error,notBefore:job.notBefore});
   }
   if(['RUNTIME_REQUIRED','START_FAILED'].includes(job.state))throw fail('NATIVE_RUNTIME','The original job needs its actual selected runtime.',{jobId:id,state:job.state,error:job.error});
   const priorCancel=state.decisions.find(x=>x.kind==='cancel'&&x.jobId===id);
   if(cancelAfter!==null&&job.progress.complete>=cancelAfter&&(!priorCancel||!priorCancel.applied)){
    const decision=priorCancel??{kind:'cancel',jobId:id,requestedAfterComplete:job.progress.complete,label,createdAt:iso()};
    if(!priorCancel)state.decisions.push(decision);await save();
    try{await action(instance,label,'run.cancel',{projectId:job.projectId,jobId:id});decision.applied=true;}catch(error){if(error.code!=='JOB_COMPLETE')throw error;decision.originalCompletedBeforeCancel=true;decision.applied=true;}await save();
   }
   if(Date.now()-started>deadline)throw fail('NATIVE_WAIT','The original native job remains in progress beyond this invocation deadline.',{jobId:id,state:job.state});
   await pause(500);
  }
 };
 const waitComplete=async(instance,id)=>{const job=await waitJob(instance,id);if(job.state!=='COMPLETE')throw fail('NATIVE_NOT_COMPLETE','The original job is closed without complete target work.',{jobId:id,state:job.state});return pageAll(options=>instance.commissioning.job(id,options),'steps');};
 const reviewPlan=async(instance,label,projectId,planId,note)=>{
  const plan=await pageAll(options=>instance.commissioning.plan(planId,options),'steps');
  if(plan.issues.some(x=>x.blocking))throw fail('PLAN_BLOCKED','The full original plan needs source/mapping correction before reference writes.',{planId,issues:plan.issues.filter(x=>x.blocking)});
  await keep(join(paths.phases,label+'-reviewed-plan.json'),json(plan));
  return action(instance,label,'plan.review',{projectId,planId,decision:'accept',actor:options.operator,note,acknowledgeIssues:plan.issues.map(x=>x.id)});
 };
 const prepareHandoff=async(instance,label,projectId)=>{
  const exported=await action(instance,label,'handoff.prepare',{projectId,label:options.operator+' — '+label}),file=await instance.commissioning.fileRecord(exported.file.id),
   name=label+'.ndjson.gz',path=join(paths.delivery,name);
  await copyOriginal(file.path,path,file);return {projectId,handoffId:exported.handoffId,receipt:exported.receipt,file:{id:file.id,name,originalFilename:file.filename??null,bytes:file.bytes,sha256:file.sha256}};
 };
 const verifyCustody=async(instance,projectId)=>{
  const snapshot=snapshotProject(instance.store.read(),projectId),closure=await projectObjects(instance.store,snapshot);
  let bytes=0;for(const object of closure.objects){check();const value=await instance.store.object(object.sha256);if(value.length!==object.bytes||digest(value)!==object.sha256)throw fail('RECEIVING_OBJECT','An original project object differs after receiving.');bytes+=value.length;}
  return {project:snapshot.project.id,sequence:snapshot.project.sequence,headHash:snapshot.project.headHash,objects:closure.objects.length,bytes,editions:closure.editionIds??null,
   sources:snapshot.tables.sources.length,mappings:snapshot.tables.mappings.length,plans:snapshot.tables.plans.length,jobs:snapshot.tables.jobs.length,reviews:snapshot.tables.reviews.length};
 };
 try{
  const selection=await phase('01-source-selection',async()=>{
   const source=await sourceSelection(options.sourceRoot,options.sourceManifest,options.sourceRef),runtime=await document(options.runtimeReady),target=await document(options.targetReceipt),
    browserModule=relative(options.sourceRoot,options.browserModule).split('\\').join('/');
   if(!safeRelative(browserModule)||!source.files.some(x=>x.path===browserModule))throw fail('BROWSER_SOURCE','The selected original browser programme must belong to the frozen full source manifest before this operation starts.');
   if(runtime.schema!=='stellar-forge.frost-client-runtime.v1'||runtime.native?.commit!=='9f41f7794725fced63fcb07e6b33dbc1f897f2bc'||runtime.native?.version!=='1.1.53'||!isAbsolute(runtime.python??''))
    throw fail('RUNTIME_IDENTITY','Use the completed original FROST client installation receipt.');
   if(target.schema!=='stellar-forge.frost-reference-target.v1'||target.realization?.loopbackOnly!==true||!target.project||!/^http:\/\/127\.0\.0\.1:\d+\/FROST-Server\/v1\.1\/$/.test(target.serviceUrl))
    throw fail('TARGET_IDENTITY','Use the exact private original reference target receipt. Production commissioning uses the explicit operator workflow.');
   const recordingIdentity=await copyOriginal(options.recording,join(paths.inputs,'hamburg-recording.json'),RECORDING);
   await keep(join(paths.inputs,'runtime-ready.json'),await readOwned(options.runtimeReady,32*1024*1024));
   await keep(join(paths.inputs,'target.json'),await readOwned(options.targetReceipt,32*1024*1024));
   await keep(join(paths.inputs,'source-manifest.json'),await readOwned(options.sourceManifest,32*1024*1024));
   return {source,operator:options.operator,browserModule,runtime:{python:runtime.python,receiptSha256:digest(await readOwned(options.runtimeReady,32*1024*1024)),sourceManifestSha256:runtime.sourceManifestSha256,native:runtime.native},
    target:{serviceUrl:target.serviceUrl,project:target.project,receiptSha256:digest(await readOwned(options.targetReceipt,32*1024*1024)),frostImage:target.frostImage,postgisImage:target.postgisImage},recording:recordingIdentity};
  });
  // A resumed programme verifies the original selected source/runtime/target
  // again; the committed phase never authorizes changed input bytes.
  const selectedAgain=await sourceSelection(options.sourceRoot,options.sourceManifest,options.sourceRef);
  if(options.operator!==selection.operator||relative(options.sourceRoot,options.browserModule).split('\\').join('/')!==selection.browserModule||selectedAgain.manifestSha256!==selection.source.manifestSha256||digest(await readOwned(options.runtimeReady,32*1024*1024))!==selection.runtime.receiptSha256||
   digest(await readOwned(options.targetReceipt,32*1024*1024))!==selection.target.receiptSha256)throw fail('SELECTION_CHANGED','Resume with the original complete selection.');
  const source=await phase('02-original-source',async()=>receiveHamburg({directory:paths.primary,recordingFile:join(paths.inputs,'hamburg-recording.json'),
   expectedSha256:RECORDING.sha256,expectedBytes:RECORDING.bytes,resume:true,sourceInboxDirectory:paths.inbox}));
  if(source.state!=='NATIVE_SOURCE_RECEIVED_REVIEW_PENDING')throw fail('SOURCE_NOT_COMPLETE','Both original Hamburg source editions must complete before review.');
  const reviewed=await phase('03-source-review',async()=>{
   const editions=[],reader=await openSensorThingsWorkspace({directory:paths.primary,sourceInboxDirectory:paths.inbox});
   try{
    for(const window of source.windows){
     const selected=await reader.edition(window.editionId),summary=await reader.summary(window.editionId),
      required=[...new Set([...(selected.issues??[]).filter(x=>x.severity!=='notice').map(x=>x.code),...Object.keys(summary.rowIssueCounts??{}),
       ...(summary.duplicateOccurrences?['DUPLICATE_OBSERVATION_IDS']:[]),...(summary.changedDuplicates?['CONFLICTING_DUPLICATE_OBSERVATIONS']:[]),...(summary.unkeyed?['UNKEYED_OBSERVATIONS']:[])])];
     const known=new Set(['PROVIDER_SNAPSHOT_NOT_ESTABLISHED','CONNECTOR_HTTP_METADATA_UNOBSERVED']);
     if(required.some(x=>!known.has(x)))throw fail('SOURCE_REVIEW_CHANGED','The actual retained source has a condition outside this frozen reference interpretation.',{editionId:window.editionId,required});
     editions.push({window:window.window,editionId:window.editionId,decision:'accept',
      note:'Accept this exact retained connector-text edition for isolated commissioning mechanics. The categorical charging-status results and original time text are unchanged. Provider HTTP metadata and snapshot authority were not observed; no duration, availability or scientific validation is inferred.',
      acknowledgeIssues:required});
    }
   }finally{await reader.close();}
   const review={schema:'stellar-forge.sensorthings-hamburg-review.v1',operationId:HAMBURG_OPERATION,actor:options.operator,editions};
   const file=join(paths.inputs,'source-review.json');await keep(file,json(review));
   return receiveHamburg({directory:paths.primary,recordingFile:join(paths.inputs,'hamburg-recording.json'),expectedSha256:RECORDING.sha256,
    expectedBytes:RECORDING.bytes,resume:true,reviewFile:file,sourceInboxDirectory:paths.inbox});
  });
  if(reviewed.state!=='NATIVE_SOURCE_REVIEW_DATASET_EXPORT_COMPLETE')throw fail('SOURCE_REVIEW','The original full source review/export did not complete.');
  const runtime={python:selection.runtime.python,ready:options.runtimeReady};
  const openPrimary=()=>openSensorThingsWorkspace({directory:paths.primary,sourceInboxDirectory:paths.inbox,commissioningRuntime:runtime});
  workspace=await openPrimary();
  const project=await phase('04-project-and-source',async()=>{
   const created=await action(workspace,'project_create','project.create',{label:'DataCove retained-source FROST commissioning',description:'Full original Hamburg point 18571 graph and 660 categorical observations; native import, documented correction, verification and compensation with complete receiving.'});
   const target=await action(workspace,'target_save','target.save',{projectId:created.projectId,label:'Original private FROST/PostGIS reference',serviceUrl:selection.target.serviceUrl,allowLoopback:true,requestTimeoutMs:30000,maxResponseBytes:16*1024*1024});
   const retained=await action(workspace,'source_edition','source.edition',{projectId:created.projectId,editionId:source.windows[0].editionId,label:'Original Hamburg window-1 complete source'});
   const rows=await pageAll(options=>workspace.commissioning.rows(retained.sourceId,options));
   if(rows.sourceRows!==660||rows.selectedRows!==660||rows.excludedRows!==0)throw fail('SOURCE_POPULATION','Commissioning must retain the complete original 660 observations.');
   return {projectId:created.projectId,targetId:target.targetId,sourceId:retained.sourceId,sourceRows:rows.sourceRows,entities:rows.total};
  });
  await phase('05-original-target-inspection',async()=>{
   const started=await action(workspace,'target_root','target.inspect',{projectId:project.projectId,targetId:project.targetId,entities:[]});
   const job=await waitComplete(workspace,started.jobId);return {jobId:job.id,state:job.state,steps:job.steps,files:job.files};
  });
  const planned=await phase('06-complete-plan-review',async()=>{
   const mapping=await action(workspace,'baseline_mapping','mapping.save',{projectId:project.projectId,sourceId:project.sourceId,targetId:project.targetId,
    label:'Every original entity and all660 observations',configuration:{version:1,namespace:'datacove-hamburg-'+project.projectId.slice(0,20),sourceSelection:{streamKeys:[],occurrenceIds:[]},entities:[],bindings:[],markerProperty:'tjlabsCommissioning',batchSize:100}});
   const prepared=await action(workspace,'baseline_plan','plan.prepare',{projectId:project.projectId,mappingId:mapping.mappingId});
   const plan=await pageAll(options=>workspace.commissioning.plan(prepared.planId,options),'steps');
   if(plan.counts.observations!==660||plan.counts.sourceRows!==660||plan.counts.excludedRows!==0||plan.steps.length!==project.entities)
    throw fail('PLAN_POPULATION','The complete native plan does not preserve the original population.');
   const review=await reviewPlan(workspace,'baseline_review',project.projectId,prepared.planId,
    'Approve the complete exact source graph for this isolated original FROST/PostGIS reference. Preserve categorical result strings, source timestamp text, units and relations. Reviewed metadata markers identify only this managed set. The retained connector source does not establish provider HTTP metadata, snapshot consistency or scientific validity.');
   return {mappingId:mapping.mappingId,planId:prepared.planId,reviewId:review.reviewId,counts:plan.counts,issues:plan.issues};
  });
  const imported=await phase('07-native-import-and-recovery',async()=>{
   const started=await action(workspace,'baseline_start','run.start',{projectId:project.projectId,planId:planned.planId,reviewId:planned.reviewId,confirmServiceUrl:selection.target.serviceUrl,acknowledgeWrite:true});
   let job=await waitJob(workspace,started.jobId,{cancelAfter:5,label:'baseline_cancel'});
   if(job.state==='CANCELLED'){
    await action(workspace,'baseline_resume','run.resume',{projectId:project.projectId,jobId:job.id});
    job=await waitComplete(workspace,job.id);
   }else job=await pageAll(options=>workspace.commissioning.job(job.id,options),'steps');
   if(job.state!=='COMPLETE'||job.steps.length!==project.entities||job.steps.some(x=>x.state!=='COMPLETE'||!x.targetIdJson))
    throw fail('NATIVE_POPULATION','The original complete commissioning did not retain every source-to-target binding.');
   const observations=job.steps.filter(x=>x.entityKind==='Observations');
   if(observations.length!==660)throw fail('NATIVE_POPULATION','The original native job has another observation count.');
   return {jobId:job.id,state:job.state,closed:job.latest.closed,steps:job.steps,files:job.files,progress:job.progress,
    cancellation:state.decisions.filter(x=>x.jobId===job.id),runtimeIdentity:job.runtimeIdentity};
  });
  const assertVerification=job=>{
   const mismatches=job.steps.filter(x=>x.state!=='COMPLETE'||x.verification?.matched!==true);
   if(mismatches.length)throw fail('TARGET_VERIFICATION','The exact native target comparison has unresolved differences.',{jobId:job.id,mismatches:mismatches.map(x=>({stepId:x.stepId,entityKind:x.entityKind,targetIdJson:x.targetIdJson,verification:x.verification}))});
  };
  await phase('08-original-target-verification',async()=>{
   const started=await action(workspace,'baseline_verify','run.verify',{projectId:project.projectId,jobId:imported.jobId}),job=await waitComplete(workspace,started.jobId);
   assertVerification(job);
   if(job.steps.length!==project.entities)throw fail('VERIFY_POPULATION','The original verification omitted a selected entity.');
   await action(workspace,'baseline_result_review','review.record',{projectId:project.projectId,jobId:job.id,decision:'accept',actor:options.operator,
    note:'Every selected entity was read through the original FROST client and its selected fields and resolved relationships matched. This is commissioning fidelity, not a scientific assessment of the Hamburg charging-status observations.'});
   return {jobId:job.id,state:job.state,steps:job.steps,files:job.files,progress:job.progress};
  });
  const corrected=await phase('09-explicit-correction-plan',async()=>{
   const entities=imported.steps.map(x=>({kind:x.entityKind,idJson:x.targetIdJson}));
   const inspected=await action(workspace,'correction_inspection','target.inspect',{projectId:project.projectId,targetId:project.targetId,entities});
   await waitComplete(workspace,inspected.jobId);
   const rows=await pageAll(options=>workspace.commissioning.rows(project.sourceId,options)),thing=rows.rows.find(x=>x.entityKind==='Things'&&typeof exactParse(x.bodyText).description==='string');
   if(!thing)throw fail('CORRECTION_SOURCE','The selected full source has no retained Thing description for the explicit reference correction.');
   const original=exactParse(thing.bodyText).description,description=original+' [DataCove reference correction]',bindings=imported.steps.map(x=>({
    sourceKey:x.sourceKey,mode:x.sourceKey===thing.sourceKey?'update':'bind',targetIdJson:x.targetIdJson,
    ...(x.sourceKey===thing.sourceKey?{overrides:{description}}:{})}));
   const derivation={schema:'stellar-forge.datacove-reference-derivation.v1',sourceId:project.sourceId,editionId:source.windows[0].editionId,sourceKey:thing.sourceKey,
    sourceRefs:thing.sourceRefs,originalSourceUnchanged:true,authoredChange:{field:'description',original,selected:description},
    purpose:'One explicitly authored commissioning correction, followed by native readback and separately reviewed compensation. This is not a new Hamburg provider observation.'};
   await keep(join(paths.delivery,'DERIVATION.json'),json(derivation));
   const mapping=await action(workspace,'correction_mapping','mapping.save',{projectId:project.projectId,sourceId:project.sourceId,targetId:project.targetId,
    label:'Explicit description correction; every other native entity is bound',configuration:{version:1,namespace:'datacove-hamburg-'+project.projectId.slice(0,20),
     sourceSelection:{streamKeys:[],occurrenceIds:[]},entities:[],bindings,markerProperty:'tjlabsCommissioning',batchSize:100}});
   const prepared=await action(workspace,'correction_plan','plan.prepare',{projectId:project.projectId,mappingId:mapping.mappingId}),plan=await pageAll(options=>workspace.commissioning.plan(prepared.planId,options),'steps');
   if(plan.counts.update!==1||plan.counts.bind!==project.entities-1||plan.counts.create!==0||plan.counts.observations!==660)
    throw fail('CORRECTION_PLAN','The exact correction must update one Thing and bind the complete remaining original graph.');
   const review=await reviewPlan(workspace,'correction_review',project.projectId,prepared.planId,
    'Approve the retained DERIVATION description change on one exact existing Thing after all original targets were inspected. Every other original entity is bind-only and keeps its actual target ID. All660 categorical observations remain unchanged.');
   return {mappingId:mapping.mappingId,planId:prepared.planId,reviewId:review.reviewId,counts:plan.counts,derivation};
  });
  const changed=await phase('10-native-correction-and-verification',async()=>{
   const started=await action(workspace,'correction_start','run.start',{projectId:project.projectId,planId:corrected.planId,reviewId:corrected.reviewId,confirmServiceUrl:selection.target.serviceUrl,acknowledgeWrite:true});
   const job=await waitComplete(workspace,started.jobId),verification=await action(workspace,'correction_verify','run.verify',{projectId:project.projectId,jobId:job.id}),verified=await waitComplete(workspace,verification.jobId);
   assertVerification(verified);
   if(job.steps.length!==project.entities||verified.steps.length!==project.entities)throw fail('CORRECTION_POPULATION','The full correction/binding verification did not preserve every entity.');
   return {jobId:job.id,verificationJobId:verified.id,state:job.state,closed:job.latest.closed,steps:job.steps,verification:verified};
  });
  const compensated=await phase('11-reviewed-compensation',async()=>{
   const prepared=await action(workspace,'compensation_plan','rollback.prepare',{projectId:project.projectId,jobId:changed.jobId}),plan=await pageAll(options=>workspace.commissioning.plan(prepared.planId,options),'steps');
   if(plan.counts.restore!==1||plan.counts.delete!==0||plan.steps.length!==1)throw fail('COMPENSATION_SCOPE','Only the one authored description correction may be restored. Bind-only source entities must remain untouched.');
   const review=await reviewPlan(workspace,'compensation_review',project.projectId,prepared.planId,
    'Approve restoring the exact original before-image of the one corrected Thing after current native verification. No bound entity or original observation is deleted. This is explicit managed-set compensation, not a database-wide rollback.');
   const started=await action(workspace,'compensation_start','run.start',{projectId:project.projectId,planId:prepared.planId,reviewId:review.reviewId,confirmServiceUrl:selection.target.serviceUrl,acknowledgeWrite:true}),job=await waitComplete(workspace,started.jobId),
    verification=await action(workspace,'compensation_verify','run.verify',{projectId:project.projectId,jobId:job.id}),verified=await waitComplete(workspace,verification.jobId);
   assertVerification(verified);return {planId:prepared.planId,jobId:job.id,verificationJobId:verified.id,steps:job.steps,verification:verified};
  });
  const finalVerification=await phase('12-final-complete-reference',async()=>{
   const started=await action(workspace,'final_verify','run.verify',{projectId:project.projectId,jobId:imported.jobId}),job=await waitComplete(workspace,started.jobId);
   assertVerification(job);
   if(job.steps.length!==project.entities||job.steps.filter(x=>x.entityKind==='Observations').length!==660)throw fail('FINAL_POPULATION','Final original-target verification is incomplete.');
   const review=await action(workspace,'final_result_review','review.record',{projectId:project.projectId,jobId:job.id,decision:'accept',actor:options.operator,
    note:'The full original graph and660 categorical observations match their selected native fields/relations after one documented correction and verified compensation. Retain exact requests, response bodies and review scope for the receiving engineer.'}),
    map=await workspace.commissioning.mapData(imported.jobId);
   await keep(join(paths.delivery,'FINAL-MAP.json'),json(map));
   return {jobId:job.id,reviewId:review.reviewId,state:job.state,closed:job.latest.closed,progress:job.progress,steps:job.steps,files:job.files,
    map:{entities:map.entities.length,unavailable:map.unavailable.length,coverage:map.coverage}};
  });
  const originalHandoff=await phase('14-complete-handoff',async()=>{
   const custody=await verifyCustody(workspace,project.projectId),handoff=await prepareHandoff(workspace,'original-complete-handoff',project.projectId);
   const request=await document(join(paths.requests,'original-complete-handoff.request.json')),replayed=await workspace.action(request);
   if(replayed.reused!==true||replayed.result?.file?.sha256!==handoff.file.sha256||replayed.result.file.bytes!==handoff.file.bytes)
    throw fail('HANDOFF_REPLAY','The original completed handoff did not reopen with identical bytes.');
   return {custody,handoff,replayed:true};
  });
  // The browser downloads the first complete package created above.
  let browser=null;
  if(options.browserModule){
   browser=await phase('13-original-operator-browser',async()=>{
    const modulePath=relative(options.sourceRoot,options.browserModule).split('\\').join('/');
    if(!selection.source.files.some(x=>x.path===modulePath))throw fail('BROWSER_SOURCE','The selected original browser programme must belong to the frozen full source manifest.');
    const {serveSensorThingsWorkspace}=await import('../../server.mjs'),server=await serveSensorThingsWorkspace({workspace,host:'127.0.0.1',port:0});
    try{
     const native=await import(pathToFileURL(options.browserModule).href);
     if(typeof native.receiveBrowser!=='function')throw fail('BROWSER_CONTRACT','Select the original receiveBrowser interface module.');
     const accessUrl=server.url.replace('/#','/commissioning/#');
     await atomicJSON(join(root,'browser-session.json'),{origin:server.origin,workspaceId:server.workspaceId,accessUrl});
     const result=await native.receiveBrowser({origin:server.origin,workspaceId:server.workspaceId,accessUrl,projectId:project.projectId,
      primaryJobId:imported.jobId,verificationJobId:finalVerification.jobId,operationDirectory:join(root,'browser'),browserExecutable:options.chromium,playwrightModule:options.playwright});
     if(result?.completed!==true)throw fail('BROWSER_INCOMPLETE','The original browser programme has no complete receiving result.');
     return result;
    }finally{await server.close();}
   });
  }else state.browser={state:'NOT_SELECTED',meaning:'Native/API receiving may complete independently; no browser or STAM build completion is asserted.'};
  const receivingResult=await phase('15-fresh-forward-older-receiving',async()=>{
   const originalPath=join(paths.delivery,originalHandoff.handoff.file.name),filename='original-commissioning-handoff.gz';
   await copyOriginal(originalPath,join(paths.receivedInbox,filename),originalHandoff.handoff.file);
   receiving=await openSensorThingsWorkspace({directory:paths.received,sourceInboxDirectory:paths.receivedInbox,commissioningRuntime:{}});
   const payload={filename,expectedSha256:originalHandoff.handoff.file.sha256,expectedBytes:originalHandoff.handoff.file.bytes};
   const fresh=await phase('15a-fresh-original-project',async()=>{
   const first=await action(receiving,'fresh_receive','handoff.receive',payload),custody=await verifyCustody(receiving,project.projectId);
   if(first.projectId!==project.projectId||first.disposition!=='received'||custody.headHash!==originalHandoff.custody.headHash||
    custody.objects!==originalHandoff.custody.objects||custody.bytes!==originalHandoff.custody.bytes)throw fail('FRESH_RECEIVING','The fresh receiving project does not preserve the full original history/object closure.');
   const repeated=await action(receiving,'fresh_repeat','handoff.receive',payload);
   if(repeated.disposition!=='repeated')throw fail('REPEATED_RECEIVING','The identical original project did not remain idempotent.');
   const retainedJob=await pageAll(options=>receiving.commissioning.job(imported.jobId,options),'steps');
   if(!retainedJob.received||retainedJob.localBinding||retainedJob.steps.length!==project.entities||retainedJob.state!=='COMPLETE')
    throw fail('RECEIVED_NATIVE_BINDING','Received native custody must remain readable without a target/runtime replay.');
   return {first,custody,repeated:repeated.disposition};
   });
   const next=await phase('15b-receiving-review-and-package',async()=>{
   await action(receiving,'receiving_review','review.record',{projectId:project.projectId,jobId:finalVerification.jobId,decision:'accept',actor:options.operator,
    note:'The receiving engineer reopened every retained source/plan/native object, all typed target bindings and the complete original verification without invoking the target. This acceptance records delivery custody and its original comparison scope.'});
   const forward=await prepareHandoff(receiving,'receiving-reviewed-handoff',project.projectId),forwardCustody=await verifyCustody(receiving,project.projectId);
   return {forward,forwardCustody};
   });
   const {forward,forwardCustody}=next;
   await copyOriginal(join(paths.delivery,forward.file.name),join(paths.inbox,'receiving-reviewed-handoff.gz'),forward.file);
   const advanced=await action(workspace,'original_advance','handoff.receive',{filename:'receiving-reviewed-handoff.gz',expectedSha256:forward.file.sha256,expectedBytes:forward.file.bytes});
   if(advanced.disposition!=='advanced'||(await verifyCustody(workspace,project.projectId)).headHash!==forwardCustody.headHash)
    throw fail('FORWARD_RECEIVING','The newer compatible project did not advance the original history.');
   await copyOriginal(originalPath,join(paths.inbox,'original-commissioning-handoff.gz'),originalHandoff.handoff.file);
   const older=await action(workspace,'original_older','handoff.receive',payload),afterOlder=await verifyCustody(workspace,project.projectId);
   if(older.disposition!=='preserved-later'||afterOlder.headHash!==forwardCustody.headHash)throw fail('OLDER_RECEIVING','An older package must preserve the later reviewed project.');
   const second=await action(workspace,'original_repeat_forward','handoff.receive',{filename:'receiving-reviewed-handoff.gz',expectedSha256:forward.file.sha256,expectedBytes:forward.file.bytes});
   if(second.disposition!=='repeated')throw fail('FORWARD_REPLAY','The accepted forward package did not reopen idempotently.');
   await receiving.close();receiving=null;
   return {first:fresh.first,repeated:fresh.repeated,receivedCustody:fresh.custody,forward,forwardCustody,advanced:advanced.disposition,older:older.disposition,repeatedForward:second.disposition,finalCustody:afterOlder};
  });
  await workspace.close();workspace=null;
  const reopened=await phase('16-closed-original-and-receiver-reopen',async()=>{
   workspace=await openPrimary();receiving=await openSensorThingsWorkspace({directory:paths.received,sourceInboxDirectory:paths.receivedInbox,commissioningRuntime:{}});
   const original=await verifyCustody(workspace,project.projectId),received=await verifyCustody(receiving,project.projectId);
   if(original.headHash!==receivingResult.forwardCustody.headHash||received.headHash!==original.headHash)throw fail('CLOSED_REOPEN','The closed original and receiving workspace did not preserve the same reviewed history.');
   const originalJob=await workspace.commissioning.job(imported.jobId,{offset:0,limit:1}),receivedJob=await receiving.commissioning.job(imported.jobId,{offset:0,limit:1});
   if(originalJob.state!=='COMPLETE'||receivedJob.state!=='COMPLETE'||originalJob.latest?.closed!==true||receivedJob.latest?.closed!==true)
    throw fail('CLOSED_REOPEN','The received original native outcome is no longer complete and closed.');
   await workspace.close();workspace=null;await receiving.close();receiving=null;
   return {original,received,nativeReplay:false,closed:true};
  });
  // Reopen each complete delivery file even when the original phase is replayed.
  // A retained phase receipt alone does not establish current artifact custody.
  for(const file of [originalHandoff.handoff.file,receivingResult.forward.file]){
   const actual=await identityFile(join(paths.delivery,file.name));
   if(actual.bytes!==file.bytes||actual.sha256!==file.sha256)
    throw fail('DELIVERY_IDENTITY','A complete named receiving archive differs from its retained original identity.',{filename:file.name});
  }
  if(browser?.completed===true){
   if(browser.browserClosed!==true||!Array.isArray(browser.artifacts)||browser.artifacts.length===0)
    throw fail('BROWSER_ARTIFACTS','The completed browser phase has no closed original artifact inventory.');
   for(const artifact of browser.artifacts){
    if(!safeRelative(artifact.path))throw fail('BROWSER_ARTIFACT_PATH','The retained browser artifact has another output path.');
    const actual=await identityFile(join(root,'browser',artifact.path));
    if(actual.bytes!==artifact.bytes||actual.sha256!==artifact.sha256)
     throw fail('BROWSER_ARTIFACT_IDENTITY','A complete browser download or viewport image differs from its original bytes.',{filename:artifact.path});
   }
  }
  // Commit the exact final timestamp before the immutable customer artifact.
  // Recovery after keep() reuses this same candidate without a second timestamp.
  if(!state.completedAt){state.completedAt=iso();await save();}
  const result={schema:'stellar-forge.datacove-customer-result.v1',operationId:OPERATION,state:'COMPLETE',completedAt:state.completedAt,
   source:{commit:selection.source.sourceRef,manifestSha256:selection.source.manifestSha256,files:selection.source.files.length,bytes:selection.source.sourceBytes},
   nativeClient:{repository:'FraunhoferIOSB/FROST-Python-Client',commit:'9f41f7794725fced63fcb07e6b33dbc1f897f2bc',version:'1.1.53',runtimeReceiptSha256:selection.runtime.receiptSha256},
   originalInput:{operationId:HAMBURG_OPERATION,recording:RECORDING,editions:source.windows.map(x=>({window:x.window,editionId:x.editionId,rows:x.summary.rows})),
    interpretation:'Original categorical source observations and source time text; connector HTTP metadata and provider snapshot authority remain unobserved.'},
   projectId:project.projectId,entities:project.entities,observations:660,jobIds:{commissioning:imported.jobId,correction:changed.jobId,compensation:compensated.jobId,finalVerification:finalVerification.jobId},
   native:{originalImport:'COMPLETE',correction:'COMPLETE',compensation:'COMPLETE',finalVerification:'MATCHED',allOriginalObservationsPreserved:true,
    cancellation:imported.cancellation.map(x=>({requestedAfterComplete:x.requestedAfterComplete,originalCompletedBeforeCancel:x.originalCompletedBeforeCancel===true}))},
   receiving:{fresh:'received',forward:receivingResult.advanced,older:receivingResult.older,repeated:receivingResult.repeatedForward,
    finalSequence:reopened.original.sequence,headHash:reopened.original.headHash,closed:true,nativeReplay:false,retainedObjects:reopened.original.objects,retainedObjectBytes:reopened.original.bytes},
   browser:{state:'COMPLETE',programme:selection.browserModule,resultSha256:state.phases['13-original-operator-browser'].sha256},
   artifacts:[{...originalHandoff.handoff.file,role:'complete original commissioning project'},{...receivingResult.forward.file,role:'receiving-reviewed compatible successor'},
    {...await identityFile(join(paths.delivery,'DERIVATION.json')),name:'DERIVATION.json',role:'explicit authored correction'},
    {...await identityFile(join(paths.delivery,'FINAL-MAP.json')),name:'FINAL-MAP.json',role:'original retained native result map'}],
   meaning:'The native client executed the complete private reference; comparisons report exact selected fields and resolved relationships. This is not an assertion of charging-point uptime, external production commissioning or scientific QA.'};
  await keep(join(paths.delivery,'CUSTOMER_RESULT.json'),json(result));state.completedAt=result.completedAt;state.state='COMPLETE';state.error=null;state.resultFile='delivery/CUSTOMER_RESULT.json';await save();return result;
 }catch(error){state.state=stopping?'INTERRUPTED':'REQUIRES_CONTINUATION';state.error=publicError(error);await save().catch(()=>{});throw error;}
 finally{await receiving?.close().catch(()=>{});await workspace?.close().catch(()=>{});}
 }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await lease.close();}
}
export const HELP='node receiving/receive.mjs --operation PRIVATE_DIRECTORY --source-root REPOSITORY_ROOT --source-manifest FILE --source-ref COMMIT --recording ORIGINAL_28_RESPONSE_JSON --runtime-ready ORIGINAL_CLIENT_RECEIPT --target-receipt PRIVATE_FROST_TARGET_JSON --operator NAME --acknowledge-reference-writes [--resume] [--max-wait-seconds 7200] --browser-module ORIGINAL_BROWSER_MJS --chromium EXECUTABLE --playwright MODULE';
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.includes('--help')){console.log(HELP);return;}
 const names={operation:'operation','source-root':'sourceRoot','source-manifest':'sourceManifest','source-ref':'sourceRef',recording:'recording','runtime-ready':'runtimeReady','target-receipt':'targetReceipt',operator:'operator',
  'max-wait-seconds':'maxWaitSeconds','browser-module':'browserModule',chromium:'chromium',playwright:'playwright'};
 const options={resume:false,acknowledgeReferenceWrites:false};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--resume'){if(options.resume)throw fail('CLI','Duplicate --resume.');options.resume=true;continue;}
  if(args[i]==='--acknowledge-reference-writes'){if(options.acknowledgeReferenceWrites)throw fail('CLI','Duplicate reference authorization.');options.acknowledgeReferenceWrites=true;continue;}
  const key=args[i].startsWith('--')?names[args[i].slice(2)]:null;
  if(!key||Object.hasOwn(options,key)||!args[i+1]||args[i+1].startsWith('--'))throw fail('CLI','Use each complete declared option once.');options[key]=args[++i];
 }
 if(typeof options.operator!=='string'||!options.operator.trim()||options.operator.length>240)throw fail('OPERATOR','Retain the responsible reference operator.');
 if(options.maxWaitSeconds!==undefined){if(!/^\d+$/.test(options.maxWaitSeconds)||Number(options.maxWaitSeconds)<60||Number(options.maxWaitSeconds)>86400)throw fail('WAIT','Use a finite original wait from60 to86400seconds.');options.maxWaitSeconds=Number(options.maxWaitSeconds);}
 if(!options.browserModule||!options.chromium||!options.playwright)throw fail('BROWSER','Supply the full original browser module, executable and Playwright selection together.');
 for(const key of ['browserModule','chromium','playwright'])if(options[key]!==undefined&&!isAbsolute(options[key]))throw fail('BROWSER_PATH','Select each original browser/runtime source by absolute path.');
 console.log(JSON.stringify(await receive(options),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
 console.error(JSON.stringify(publicError(error)));process.exitCode=2;
});
