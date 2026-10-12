#!/usr/bin/env node
// MIT. Sequential installed adoption of the SAME completed original Lightdash operation.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {prepareProject,openProject,readProject} from './project.mjs';
import {connectProject,downloadFile,downloadHandover} from './client.mjs';
import {receiveHandover} from './receive.mjs';
import {APP,PRODUCT,REQUEST_SCHEMA,exact,absolute,identifier,uuid,sha,need,json,exists,outside,privateDirectory,
 acquireWorkspace,objectDigest,fileIdentity,saveJson,verifyManifest,publicValue} from './common.mjs';
const SCHEMA='stellar-forge.lightdash-installed-receiving.v1';
const same=(a,b)=>objectDigest(a)===objectDigest(b);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verified(item){
 exact(item,['file','sha256','bytes'],['file','sha256']);absolute(item.file);sha(item.sha256);
 const actual=await fileIdentity(item.file);
 need(actual.sha256===item.sha256&&(item.bytes===undefined||item.bytes===actual.bytes),'LIGHTDASH_INSTALLED_INPUT_CHANGED','A complete original receiving input changed.');
 return {file:item.file,...actual};
}
function nativeBasis(state){return {workspaceId:state.metadata.id,baselineEditionId:state.metadata.baselineEditionId,
 selectedEditionId:state.metadata.selectedEditionId,draft:state.metadata.draft,
 editions:state.editions.map(x=>({id:x.id,sourceSha256:x.sourceSha256})).sort((a,b)=>a.id.localeCompare(b.id)),
 reviews:state.reviews.map(x=>x.id).sort(),operations:state.operations.map(x=>({id:x.id,status:x.status,requestSha256:x.requestSha256})).sort((a,b)=>a.id.localeCompare(b.id))};}
export async function receiveInstalled(input){
 exact(input,['schema','operationId','outputDirectory','project','originalResult','applicationsDirectory','browser'],
  ['schema','operationId','outputDirectory','project','originalResult','applicationsDirectory','browser']);
 need(input.schema===SCHEMA&&input.project?.schema===REQUEST_SCHEMA&&input.project.workspaceDirectory,
  'LIGHTDASH_INSTALLED_SELECTION','Adopt the closed workspace from the original completed operation.');
 identifier(input.operationId);const output=absolute(input.outputDirectory),applicationsDirectory=absolute(input.applicationsDirectory);
 for(const directory of [input.project.directory,input.project.workspaceDirectory,input.project.runtimeDirectory,applicationsDirectory])
  need(outside(output,absolute(directory)),'LIGHTDASH_INSTALLED_OUTPUT','Keep receiving output separate from original workspaces and runtime.');
 const originalFile=await verified(input.originalResult),core=await json(originalFile.file,{maximum:32*1024*1024,privateFile:true});
 need(core.schema==='lightdash-commissioning.receiving-result.v1'&&core.state==='SUCCEEDED'&&core.operationId===input.operationId&&
  core.workspaceDirectory===input.project.workspaceDirectory&&core.workspaceId===input.project.expectedWorkspaceId&&
  core.native?.previewsStopped===true&&core.native.allStates==='SUCCEEDED'&&core.handover?.state==='SUCCEEDED'&&
  core.detachedHandover?.state==='COMPLETE','LIGHTDASH_INSTALLED_ORIGINAL_PENDING','Complete the same original provider/native/whole handover operation before this installed continuation.');
 exact(input.browser,['module','executable'],['module','executable']);
 const browserModule=await verified(input.browser.module),browserExecutable=await verified(input.browser.executable);
 const selected={...input,originalResult:originalFile,browser:{module:browserModule,executable:browserExecutable}},inputSha256=objectDigest(selected);
 await privateDirectory(output,true);const release=await acquireWorkspace(output);
 let host,client,browser,page,apps,ownedRun=null,closing=false,state;
 const stateFile=path.join(output,'receiving-state.json');
 const persist=()=>saveJson(stateFile,state);
 async function readApplication(){
  const value=await apps.applicationsState({historyLimit:100});
  const app=value.applications.find(x=>x.id===state.applications?.applicationId);
  need(app,'LIGHTDASH_INSTALLED_APPLICATION','The saved original managed application is absent.');return app;
 }
 async function retainedRun(id){
  let cursor;
  do{const history=await apps.applicationsHistory({applicationId:state.applications.applicationId,limit:100,...(cursor?{cursor}:{})});
   const run=history.runs.find(x=>x.id===id);if(run)return run;cursor=history.nextCursor;
  }while(cursor);
  return null;
 }
 // Worker inactivity alone does not prove that its original command ended.
 function runClosure(run){
  if(!run||run.active)return null;
  if(run.phase==='CANCELLED'&&run.result?.state==='CANCELLED'&&run.result.launched===false&&
   run.result.operationId===run.id&&run.result.applicationId===state.applications.applicationId)
   return {kind:'CANCELLED_BEFORE_DISPATCH',result:run.result};
  const result=run.result??run.state?.result;
  if(['SUCCEEDED','FAILED'].includes(run.phase)&&result?.operation==='original-command'&&
   ['STOPPED','COMPLETED','EXITED','LAUNCH_FAILED'].includes(result.state)&&typeof result.completedAt==='string')
   return {kind:'ORIGINAL_COMMAND_TERMINAL',result};
  if(run.phase==='SUCCEEDED'&&result?.operation==='original-command'&&result.state==='RECONCILED'&&
   run.state?.commandProcess?.pid&&run.state.commandProcess.processStart&&run.state.completedAt)
   return {kind:'ORIGINAL_PROCESS_RECONCILED',result,process:run.state.commandProcess,completedAt:run.state.completedAt};
  return null;
 }
 async function stopRun(id,reason){
  let original=await retainedRun(id);
  if(!original){
   state.applications.cleanups[id]={reason,phase:'NOT_DISPATCHED',runId:id,observedAt:new Date().toISOString()};
   await persist();return null;
  }
  state.applications.cleanups[id]={reason,phase:original.phase,state:'DRAINING',runId:id,requestedAt:new Date().toISOString()};
  await persist();
  if(!runClosure(original))await apps.applicationsStop({applicationId:state.applications.applicationId,operationId:id});
  const end=Date.now()+120000;let recovery=null;
  for(;;){
   const current=await retainedRun(id);
   need(current,'LIGHTDASH_INSTALLED_RUN','The original managed run disappeared.');
   const closure=runClosure(current);
   if(closure){
    state.applications.cleanups[id]={reason,phase:current.phase,state:'CLOSED',runId:id,closure,
     ...(recovery?{recovery}:{}),completedAt:new Date().toISOString()};
    await persist();return current;
   }
   // Reconcile only a retained launched process or complete command receipt.
   // Recovering an undispatched failed request here could start its command.
   if(!current.active&&(current.state?.commandProcess||current.result)){
    try{recovery=await apps.applicationsRecover({applicationId:state.applications.applicationId,operationId:id});}
    catch(error){if(error.code!=='RUNTIME_WORKSPACE_OPERATION_RUNNING')throw error;}
   }
   need(Date.now()<end,'LIGHTDASH_INSTALLED_STOP_PENDING',
    recovery?.commandActive?'The same original command is still alive; retain this run until its original Stop and reconciliation complete.':
    'The same original run has no positive terminal or cancellation outcome; preserve it for original command reconciliation.');
   await pause(1000);
  }
 }
 async function finalizeComplete(){
  need(state.state==='COMPLETE'&&state.result?.state==='COMPLETE','LIGHTDASH_INSTALLED_RESULT','No complete retained receiving result is available.');
  const file=path.join(output,'result.json');
  if(await exists(file))need(same(await json(file,{maximum:32*1024*1024,privateFile:true}),state.result),
   'LIGHTDASH_INSTALLED_RESULT_CHANGED','The completed receiving result differs from its retained original state.');
  else await saveJson(file,state.result);
  need(same(await json(file,{maximum:32*1024*1024,privateFile:true}),state.result),
   'LIGHTDASH_INSTALLED_RESULT_CHANGED','The completed receiving result did not read back exactly.');
  return state.result;
 }
 async function closeLocal(){
  if(page){await page.close();page=null;}if(browser){await browser.close();browser=null;}
  if(client){await client.close();client=null;}if(host){await host.close();host=null;}
 }
 async function browserRead(url,label,expected){
  const module=await import(pathToFileURL(browserModule.file).href),chromium=module.chromium??module.default?.chromium;
  need(chromium,'LIGHTDASH_INSTALLED_BROWSER','Use the original selected Chromium provider.');
  browser=await chromium.launch({headless:true,executablePath:browserExecutable.file,args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#workspace-revision')?.textContent.startsWith('Revision '));
  const observed=await page.evaluate(async()=>{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error('Original workspace HTTP failed');return r.json();});
  need(same(nativeBasis(observed),expected),'LIGHTDASH_INSTALLED_BROWSER','The actual browser opened another original source/native workspace.');
  const desktop=path.join(output,label+'-desktop.png');await page.screenshot({path:desktop,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const mobile=path.join(output,label+'-mobile.png');await page.screenshot({path:mobile,fullPage:true});
  await page.close();page=null;await browser.close();browser=null;
  return {workspaceId:observed.metadata.id,desktop:{file:desktop,...await fileIdentity(desktop)},mobile:{file:mobile,...await fileIdentity(mobile)}};
 }
 async function verifyNative(client){
  const actual=await client.status(),basis=nativeBasis(actual.native);
  need(actual.native.metadata.id===core.workspaceId&&actual.native.metadata.baselineEditionId===core.source.baseline.id&&
   actual.native.metadata.selectedEditionId===core.source.candidate.id&&same(basis.operations.map(x=>x.id),[...core.native.operationIds].sort())&&
   basis.operations.every(x=>x.status==='SUCCEEDED'),'LIGHTDASH_INSTALLED_NATIVE','The original completed source/native workspace changed.');
  if(state.originalBasis)need(same(basis,state.originalBasis),'LIGHTDASH_INSTALLED_NATIVE','Preserve the selected complete original workspace while this continuation runs.');
  else{state.originalBasis=basis;await persist();}
  let query=null;const operations=[];
  for(const id of core.native.operationIds){
   const value=await client.operation({operationId:id}),op=value.operation;
   need(op.status==='SUCCEEDED'&&!value.pending,'LIGHTDASH_INSTALLED_NATIVE','The original native operation is no longer terminal.');
   const values=op.nativeResult?.native?.queryOutputs??[];
   if(values.some(x=>x.queryUuid===core.native.targetValues.queryUuid))query=op;
   operations.push({id,requestSha256:op.requestSha256,nativeResultSha256:objectDigest(op.nativeResult)});
  }
  need(query,'LIGHTDASH_INSTALLED_QUERY','The original accepted target query UUID is absent.');
  if(state.originalOperations)need(same(operations,state.originalOperations),'LIGHTDASH_INSTALLED_NATIVE','A complete original native result changed.');
  else{state.originalOperations=operations;await persist();}
  return {actual,basis,query};
 }
 try{
  state=await exists(stateFile)?await json(stateFile):{schema:SCHEMA,operationId:input.operationId,inputSha256,selection:selected,
   startedAt:new Date().toISOString(),applications:{cycles:[],cleanups:{}},stages:{}};
  need(state.inputSha256===inputSha256,'LIGHTDASH_INSTALLED_INPUT_CHANGED','Resume the exact installed continuation input.');
  await persist();
  if(state.state==='COMPLETE'){
   const checked=await fileIdentity(state.receiving.archive.file);
   need(checked.sha256===state.receiving.archive.sha256&&checked.bytes===state.receiving.archive.bytes,'LIGHTDASH_INSTALLED_HANDOVER_CHANGED','The completed original handover changed.');
   return {...await finalizeComplete(),replayed:true};
  }
  const project=await prepareProject(input.project);
  need(project.installation.application.manifestSha256===core.applicationSource.manifestSha256,'LIGHTDASH_INSTALLED_SOURCE','The installed wrapper must retain the complete original application.');
  const runtimeModel=await import(pathToFileURL(path.join(project.installation.sourceRoot,'stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs')).href);
  need(await exists(path.join(applicationsDirectory,'workspace.json')),'LIGHTDASH_INSTALLED_APPLICATIONS','Create or select the original runtime-workspace before this continuation.');
  // Drain any exact managed owner retained by an interrupted earlier invocation
  // before the direct project attempts to acquire the same workspace lease.
  if(state.applications.applicationId){
   apps=await runtimeModel.openRuntimeWorkspace({directory:applicationsDirectory});
   for(const cycle of state.applications.cycles){
    const prior=await retainedRun(cycle.request.requestId);
    if(prior&&!runClosure(prior))
     await stopRun(cycle.request.requestId,'Reconcile the exact previous receiving owner before reopening the original workspace.');
   }
   await apps.close();apps=null;
  }
  host=await openProject(project.directory);client=await connectProject(project.directory);
  const original=await verifyNative(client);
  for(const name of ['merchant_lightdash_intake','merchant_lightdash_draft_edit','merchant_lightdash_review','merchant_lightdash_plan','merchant_lightdash_execute',
   'merchant_lightdash_handover_create','merchant_lightdash_file_read'])need(host.session.tools.includes(name),'LIGHTDASH_INSTALLED_CATALOG','The selected source-owned tool catalog is incomplete.');
  const manifest=(await client.manifest({editionId:core.source.candidate.id})).native;
  need(manifest.files.length===189,'LIGHTDASH_INSTALLED_SOURCE','The complete original example source is not retained.');
  const sourceFiles=[];
  for(const relative of ['dbt/models/regional_sales.yml','dbt/charts/regional-sales-total-row-total-demo.yml']){
   const expected=manifest.files.find(x=>x.path===relative);need(expected,'LIGHTDASH_INSTALLED_SOURCE','The reviewed native metric or consuming chart is absent.');
   const file=await downloadFile(client,{selection:{kind:'source',editionId:core.source.candidate.id,path:relative},
    outputDirectory:path.join(output,'selected-source'),filename:path.basename(relative),expectedSha256:expected.sha256});
   need(file.bytes===expected.bytes,'LIGHTDASH_INSTALLED_SOURCE','The complete original source bytes differ.');sourceFiles.push(file);
  }
  const comparison=await client.compare({baselineId:core.source.baseline.id,candidateId:core.source.candidate.id});
  need(comparison.native,'LIGHTDASH_INSTALLED_COMPARE','The original source comparison did not reopen.');
  const replayed=await client.execute({operationId:original.query.id,expectedRequestSha256:original.query.requestSha256});
  need(replayed.accepted,'LIGHTDASH_INSTALLED_REPLAY','The original completed query did not enter its retained replay path.');
  const recovered=await client.waitOperation(original.query.id,{timeoutMs:30000});
  need(recovered.operation.status==='SUCCEEDED'&&same(recovered.operation.nativeResult,original.query.nativeResult),
   'LIGHTDASH_INSTALLED_REPLAY','The original cached native query changed.');
  const nativeFiles=[];
  for(const artifact of original.query.nativeResult.artifacts.filter(x=>x.scope==='native-content'))
   nativeFiles.push(await downloadFile(client,{selection:{kind:'artifact',operationId:original.query.id,artifactId:artifact.id},
    outputDirectory:path.join(output,'native-target-query'),filename:artifact.id+'-'+path.basename(artifact.relativePath??artifact.name??artifact.id),expectedSha256:artifact.sha256}));
  need(nativeFiles.length>0,'LIGHTDASH_INSTALLED_QUERY','No complete original target-query output was delivered.');
  const downloaded=await downloadHandover(client,{handoverId:core.handover.id,outputDirectory:path.join(output,'downloads')});
  need(downloaded.archive.sha256===core.handover.archive.sha256&&downloaded.archive.bytes===core.handover.archive.bytes,
   'LIGHTDASH_INSTALLED_HANDOVER','The installed file reader did not deliver the original complete handover.');
  state.receiving={archive:downloaded.archive,requestFile:downloaded.requestFile};
  state.stages.browserMcp={instanceId:host.session.instanceId,authoringInstanceId:host.session.authoringInstanceId,
   browser:await browserRead(host.session.browserUrl,'shared-project',original.basis),sourceFiles,nativeFiles,
   queryUuid:core.native.targetValues.queryUuid,nativeOperationsUnchanged:true,comparison:comparison.native};
  await persist();await closeLocal();

  // The existing Applications model remains the sole managed command/Stop owner.
  apps=await runtimeModel.openRuntimeWorkspace({directory:applicationsDirectory});
  const attached=await apps.attach({directory:project.installation.runtimeDirectory,label:'Lightdash commissioning runtime'});
  const catalog=await apps.applicationsState();
  need(catalog.catalog.some(x=>x.id==='lightdash-commissioning'&&x.command==='lightdash-project'),'LIGHTDASH_INSTALLED_APPLICATIONS','The original installed Applications catalog has no commissioning entry.');
  if(!state.applications.review){
   state.applications.review=await apps.applicationsReview({runtimeId:attached.runtimeId,kind:'lightdash-commissioning',
    settings:{projectDirectory:project.directory,port:0},label:'Lightdash commissioning '+core.workspaceId.slice(0,12)});
   state.applications.saveRequest={requestId:randomUUID(),reviewId:state.applications.review.id};await persist();
  }
  if(!state.applications.applicationId){
   const saved=await apps.applicationsSave(state.applications.saveRequest);
   state.applications.applicationId=saved.applicationId;state.applications.saveReceipt=saved;await persist();
  }
  let current=await readApplication();
  if(current.phase==='CONNECTING')await apps.applicationsConnect({applicationId:current.id});
  const connectionDeadline=Date.now()+600000;
  while((current=await readApplication()).phase==='CONNECTING'){
   need(Date.now()<connectionDeadline,'LIGHTDASH_INSTALLED_CONNECTION_PENDING','The original managed runtime adoption remains pending.');await pause(1000);
  }
  for(let index=0;index<2;index++){
   if(state.applications.cycles.filter(x=>x.state==='COMPLETE').length>index)continue;
   let cycle=state.applications.cycles.findLast(x=>x.index===index&&x.state!=='COMPLETE'&&!x.retired);
   if(cycle){
    const prior=await retainedRun(cycle.request.requestId);
    const closure=runClosure(prior);
    if(closure){
     cycle.retired={phase:prior.phase,closure,reason:'The exact preceding receiving launch is positively stopped; the next review is a deliberate reopen.'};
     await persist();cycle=null;
    }
   }
   if(!cycle){
    current=await readApplication();need(!current.current||runClosure(current.current),'LIGHTDASH_INSTALLED_EXISTING_RUN','Reconcile the existing original command to a positive terminal or cancellation outcome before a new reviewed launch.');
    const review=await apps.applicationsStartReview({applicationId:current.id});
    cycle={index,review,request:{applicationId:current.id,reviewId:review.id,requestId:randomUUID()},state:'REQUESTED'};
    state.applications.cycles.push(cycle);await persist();
   }
   ownedRun=cycle.request.requestId;
   let run=await retainedRun(ownedRun);
   if(!run)await apps.applicationsStart(cycle.request);
   else if(!run.active&&['QUEUED','RUNNING','INTERRUPTED','FAILED'].includes(run.phase))
    await apps.applicationsRecover({applicationId:state.applications.applicationId,operationId:ownedRun});
   const deadline=Date.now()+180000;
   for(;;){
    run=await retainedRun(ownedRun);
    if(run?.active&&run.privateUrl)break;
    need(!run||run.active||run.phase==='QUEUED','LIGHTDASH_INSTALLED_LAUNCH_FAILED','The original managed run ended before its verified startup.');
    need(Date.now()<deadline,'LIGHTDASH_INSTALLED_LAUNCH_PENDING','Reopen the same original launch while its startup remains pending.');await pause(1000);
   }
   const observation=run.url?.original;
   need(observation?.workspaceId===core.workspaceId&&observation.manifestSha256===project.installation.manifestSha256,
    'LIGHTDASH_INSTALLED_STARTUP','The native startup observer did not bind this original workspace and complete installed source.');
   client=await connectProject(project.directory);const opened=await verifyNative(client);
   cycle.browser=await browserRead(run.privateUrl,'managed-'+index,opened.basis);
   cycle.observation=observation;cycle.runId=ownedRun;await persist();
   await client.close();client=null;
   cycle.stop=await stopRun(ownedRun,'Completed this original managed receiving lifetime');ownedRun=null;
   cycle.state='COMPLETE';await persist();
   await apps.close();apps=await runtimeModel.openRuntimeWorkspace({directory:applicationsDirectory});
  }
  await apps.close();apps=null;
  // The returned private directory opens the included original app, not the donor.
  const received=await receiveHandover({schema:'stellar-forge.lightdash-handover-receiving.v1',operationId:input.operationId,
   directory:path.join(output,'customer-receiving'),runtimeDirectory:project.installation.runtimeDirectory,
   archive:{file:downloaded.archive.file,bytes:downloaded.archive.bytes,sha256:downloaded.archive.sha256},
   requestFile:{file:downloaded.requestFile.file,bytes:downloaded.requestFile.bytes,sha256:downloaded.requestFile.sha256},
   allowOperatorPrivate:false,python:project.python??'/usr/bin/python3'});
  need(received.result?.state==='COMPLETE'&&received.result.workspaceId===core.workspaceId&&received.result.providerDispatch===false,
   'LIGHTDASH_INSTALLED_RECIPIENT','The actual included customer application did not reopen completely.');
  host=await openProject(project.directory);client=await connectProject(project.directory);await verifyNative(client);await closeLocal();
  const result={schema:SCHEMA,state:'COMPLETE',operationId:input.operationId,inputSha256,originalResult:originalFile,
   originalWorkspaceId:core.workspaceId,originalApplicationSource:core.applicationSource,
   installedSource:{sourceCommit:project.installation.sourceCommit,manifestSha256:project.installation.manifestSha256},
   projectDirectory:project.directory,originalBasis:state.originalBasis,originalOperations:state.originalOperations,
   browserMcp:state.stages.browserMcp,applications:state.applications,customerReceiving:received.result,
   providerDispatch:false,newQuery:false,newPayment:false,completedAt:new Date().toISOString()};
  state.result=result;state.state='COMPLETE';await persist();
  return await finalizeComplete();
 }catch(error){
  if(state&&state.state!=='COMPLETE'){state.state='INCOMPLETE';state.error={code:error.code??'LIGHTDASH_INSTALLED_FAILED',message:error.message};
   try{await persist();}catch{}}
  throw error;
 }finally{
  let failure;try{await closeLocal();}catch(error){failure=error;}
  if(ownedRun&&apps){try{await stopRun(ownedRun,'Receiving stopped after an incomplete stage; retain this exact terminal run before any deliberate reopen.');}
   catch(error){failure??=error;}}
  if(apps)try{await apps.close();}catch(error){failure??=error;}
  await release();if(failure)throw failure;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
 (async()=>{need(process.argv.length===4&&process.argv[2]==='--input','LIGHTDASH_INSTALLED_ARGUMENTS','Use --input ORIGINAL_COMPLETED_OPERATION_SELECTION.json.');
  console.log(JSON.stringify(await receiveInstalled(await json(absolute(process.argv[3]),{maximum:16*1024*1024,privateFile:true})),null,2));
 })().catch(error=>{console.error(JSON.stringify({state:'INCOMPLETE',error:{code:error.code??'LIGHTDASH_INSTALLED_FAILED',message:error.message}}));process.exitCode=3;});
