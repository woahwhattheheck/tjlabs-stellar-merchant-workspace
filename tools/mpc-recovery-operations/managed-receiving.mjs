#!/usr/bin/env node
// MIT. Full original MPC receiving through the maintained Runtime, SDK, agent and browser.
import {readFile,writeFile,open,mkdir,rename,stat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openRuntimeWorkspace} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import {createMpcRecoveryClient} from '../../products/mpc-recovery-operations/client.mjs';
import {MerchantMpcRecovery,readMpcRecoveryConfiguration} from '../../products/mpc-recovery-operations/merchant.mjs';
import {createStore} from '../../products/mpc-recovery-operations/store.mjs';
import * as Model from '../../products/mpc-recovery-operations/app/domain.mjs';
import {inspectSource,readConnection} from '../../products/mpc-recovery-operations/binding.mjs';
import {canonical,sha,need,absolute,UUID,SOURCE_SHA256,bytes,jsonFile} from '../../products/mpc-recovery-operations/contract.mjs';
let interruption=null,cleanupDepth=0;const children=new Set();
const interrupted=signal=>{interruption??=new Error('Managed MPC receiving interrupted by '+signal);for(const child of children)try{child.kill(signal);}catch{}};
const onTerm=()=>interrupted('SIGTERM'),onInt=()=>interrupted('SIGINT');
process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../..'),PRODUCT=join(ROOT,'products','mpc-recovery-operations');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const digest=v=>sha(canonical(v));
const uuid=(operation,label)=>{const h=createHash('sha256').update(operation+'\0'+label).digest('hex').slice(0,32).split('');h[12]='5';h[16]=((parseInt(h[16],16)&3)|8).toString(16);const s=h.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');};
async function syncDir(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function privateDir(path){await mkdir(path,{recursive:true,mode:0o700});const s=await stat(path);need(s.isDirectory()&&(s.mode&0o077)===0&&await realpath(path)===path,'RECEIVING_DIRECTORY');}
async function retain(path,value){
 const raw=Buffer.from(canonical(value));await privateDir(dirname(path));
 try{const old=await bytes(path,512*1024*1024,{privateOnly:true});need(old.equals(raw),'RECEIVING_INPUT_CHANGED',path);return value;}catch(e){if(e.code!=='ENOENT')throw e;}
 const partial=path+'.partial',fd=await open(partial,'w',0o600);
 try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
 await rename(partial,path);await syncDir(dirname(path));return value;
}
async function optional(path){try{return await jsonFile(path,512*1024*1024,{privateOnly:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
class Course{
 constructor(directory,input){this.directory=directory;this.input=input;this.operation=input.operationId;}
 id(label){return uuid(this.operation,'managed/'+label);}
 async effect(label,make,run){
  if(interruption&&!cleanupDepth)throw interruption;
  need(/^[a-z0-9_-]+$/.test(label),'RECEIVING_LABEL');
  const path=join(this.directory,'control',label);await privateDir(path);
  const frozen=await optional(join(path,'input.json'))??await retain(join(path,'input.json'),await make());
  const result=await optional(join(path,'result.json'));if(result!==null)return result;
  const returned=await run(frozen);need(returned!==undefined,'RECEIVING_RESULT');
  return retain(join(path,'result.json'),returned);
 }
}
async function currentApplication(model,id){const value=await model.applicationsState({historyLimit:5});const row=value.applications.find(x=>x.id===id);need(row,'APPLICATION_MISSING');return row;}
async function poll(label,deadline,read,accept){
 let latest;while(Date.now()<deadline){latest=await read();if(accept(latest))return latest;await wait(750);}
 const error=new Error(label+' is still pending; resume this same operation.');error.code='MPC_RECOVERY_MANAGED_PENDING';error.observation=latest;throw error;
}
async function outputFile(path,producer,expected){
 await privateDir(dirname(path));try{const raw=await bytes(path,512*1024*1024,{privateOnly:true});if(expected)need(raw.length===expected.bytes&&sha(raw)===expected.sha256,'DELIVERY_CHANGED');return {path,bytes:raw.length,sha256:sha(raw)};}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=path+'.partial',fd=await open(temporary,'w',0o600);let n=0;
 let result;try{result=await producer(async b=>{let at=0;while(at<b.length){const r=await fd.write(b,at,b.length-at,n+at);need(r.bytesWritten>0,'FILE_WRITE');at+=r.bytesWritten;}n+=b.length;});await fd.sync();}finally{await fd.close();}
 const raw=await bytes(temporary,512*1024*1024,{privateOnly:true});need(result.bytes===n&&raw.length===n&&sha(raw)===result.sha256,'DELIVERY_CHANGED');if(expected)need(n===expected.bytes&&sha(raw)===expected.sha256,'DELIVERY_CHANGED');
 await rename(temporary,path);await syncDir(dirname(path));return {path,bytes:n,sha256:result.sha256};
}
async function start(model,course,applicationId,settings,label,timeout){
 const startId=course.id(label);
 const reviewed=await course.effect(label+'-review',()=>({applicationId}),x=>model.applicationsStartReview(x));
 await course.effect(label+'-dispatch',()=>({applicationId,reviewId:reviewed.id,requestId:startId}),x=>model.applicationsStart(x));
 const prior=await currentApplication(model,applicationId);
 if(prior.current?.id===startId&&prior.current.active===false&&['INTERRUPTED','FAILED'].includes(prior.current.phase)){
  await course.effect(label+'-recover',()=>({applicationId,operationId:startId}),x=>model.applicationsRecover(x));
 }
 const row=await poll('Original managed application '+startId,Date.now()+timeout,()=>currentApplication(model,applicationId),
  value=>value.current?.id===startId&&value.phase==='RUNNING'&&value.current.active===true);
 const selectedStore=await jsonFile(join(settings.workspaceDirectory,'creation.json'));
 const connection=await readConnection(settings.connectionFile,{storeId:selectedStore.id,workspaceDirectory:settings.workspaceDirectory,applicationRequestId:startId});
 need(connection.applicationRequestId===startId,'APPLICATION_RUN_CHANGED');
 return {applicationId,operationId:startId,phase:row.phase,instanceId:connection.instanceId,process:connection.process};
}
async function stop(model,course,applicationId,label,timeout){
 const operationId=course.id(label);
 await course.effect(label+'-stop-request',()=>({applicationId,operationId}),x=>model.applicationsStop(x));
 const row=await poll('Original managed stop '+operationId,Date.now()+timeout,()=>currentApplication(model,applicationId),
  value=>value.current?.id===operationId&&value.current.active===false&&['STOPPED','FAILED','CANCELLED','SUCCEEDED'].includes(value.phase));
 need(row.phase==='STOPPED','MANAGED_CLOSE_FAILED','Inspect the retained original command result.');
 return course.effect(label+'-closed',()=>({applicationId,operationId}),async()=>({applicationId,operationId,phase:row.phase,closed:true}));
}
async function saveApplication(model,course,label,settings){
 const reviewed=await course.effect(label+'-application-review',()=>({runtimeId:course.input.runtimeId,kind:'mpc-recovery-operations',label:course.input.label+' — '+label,settings}),x=>model.applicationsReview(x));
 const saved=await course.effect(label+'-application-save',()=>({requestId:course.id(label+'-application-save'),reviewId:reviewed.id}),x=>model.applicationsSave(x));
 need(!saved.superseded,'APPLICATION_SUPERSEDED');
 await course.effect(label+'-application-connect',()=>({applicationId:saved.applicationId}),x=>model.applicationsConnect(x));
 await poll('Original application connection',Date.now()+course.input.timeoutMs,()=>currentApplication(model,saved.applicationId),x=>Boolean(x.release));
 return saved.applicationId;
}
async function withRun(model,course,applicationId,settings,label,job){
 // Each definitively closed interrupted start is retained. Business phase IDs remain unchanged.
 const completedPath=join(course.directory,'control',label+'-job-complete','result.json');
 const attempts=join(course.directory,'control',label+'-runs');await privateDir(attempts);
 let index=0,attempt,runLabel,done;
 for(;;index++){
  attempt=join(attempts,String(index).padStart(5,'0'));await privateDir(attempt);
  runLabel=label+'-attempt-'+String(index).padStart(5,'0');
  done=await optional(completedPath);
  const closed=await optional(join(attempt,'outcome.json'));
  if(closed){
   need(closed.closed===true&&closed.applicationId===applicationId&&closed.runLabel===runLabel,'MANAGED_RUN_CHANGED');
   if(done&&done.runLabel===runLabel)return;continue;
  }
  // A previous finally may have dispatched stop before its closure receipt was saved.
  // Complete that original stop before considering a fresh application start.
  const pendingStop=await optional(join(course.directory,'control',runLabel+'-stop-request','input.json'));
  if(pendingStop){
   cleanupDepth++;
   try{
    await stop(model,course,applicationId,runLabel,course.input.timeoutMs);
    await retain(join(attempt,'outcome.json'),{applicationId,runLabel,closed:true,dispatched:true,
     workCompleted:Boolean(done),state:done?'CLOSED':'INTERRUPTED'});
   }finally{cleanupDepth--;}
   if(done&&done.runLabel===runLabel)return;continue;
  }
  await retain(join(attempt,'input.json'),{applicationId,runLabel,settingsSha256:digest(settings)});
  break;
 }
 let client=null,failure=null;
 const errors=[];
 try{
  if(!done){
   await start(model,course,applicationId,settings,runLabel,course.input.timeoutMs);
   const selectedStore=await jsonFile(join(settings.workspaceDirectory,'creation.json'));
   client=createMpcRecoveryClient({connectionFile:settings.connectionFile,storeId:selectedStore.id,storeDirectory:settings.workspaceDirectory});
   await job(client);
   await retain(completedPath,{applicationId,runLabel,completed:true});
  }
 }catch(error){failure=error;}
 finally{
  cleanupDepth++;
  try{
  try{await client?.close();}catch(error){errors.push(error);}
  const dispatched=await optional(join(course.directory,'control',runLabel+'-dispatch','input.json'));
  let closed=false;
  try{
   if(dispatched)await stop(model,course,applicationId,runLabel,course.input.timeoutMs);
   closed=true;
  }catch(error){errors.push(error);}
  if(closed)await retain(join(attempt,'outcome.json'),{applicationId,runLabel,closed:true,dispatched:Boolean(dispatched),
   workCompleted:Boolean(await optional(completedPath)),state:failure?'INTERRUPTED':'CLOSED'});
  }finally{cleanupDepth--;}
 }
 if(failure||errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],
  'Original managed stage interrupted; retain this run outcome and every business request before resuming.');
}

const ACCEPTED={bytes:654095,sha256:'c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7'};
const expected=row=>({workspaceId:row.workspaceId,revision:row.revision,snapshotSha256:row.snapshotSha256});
function portable(value){need(value?.format==='mpc-recovery-portable.v1'&&value.sha256===sha(canonical(value.snapshot)),'PORTABLE');Model.receiveSnapshot(value.snapshot);return value;}
async function artifact(course,name,value){
 const path=join(course.directory,'artifacts',name);await retain(path,value);const raw=await bytes(path,512*1024*1024,{privateOnly:true});return{path,bytes:raw.length,sha256:sha(raw)};
}
async function originalReports(client,course,label,id,want=null){
 const observation=await course.effect(label,()=>({id,want}),async input=>{
  const row=await client.branch(input.id);if(input.want)need(canonical(expected(row))===canonical(input.want),'BRANCH_CHANGED');
  const w=Model.receiveSnapshot(row.snapshot),selection={id:row.id,expected:expected(row)},history=[];
  for await(const page of client.history(selection)){need(page.total===w.revision,'HISTORY_TOTAL');history.push(...page.items);}
  need(canonical(history)===canonical(w.operations),'HISTORY_COVERAGE');
  const reports={};for(const kind of ['overview','acceptance','recoveryOrder','restoreDue','proposals','serviceReview']){
   const options=kind==='serviceReview'?{from:w.createdAt,to:w.updatedAt,asOf:w.updatedAt}:{asOf:w.updatedAt};
   reports[kind]=await client.report({...selection,kind,options});
  }
  const sources=[];for(let i=0;i<w.sources.length;i++){
   const source=w.sources[i],path=join(course.directory,'sources',label,String(i).padStart(4,'0')+'.bin');
   sources.push({...source,content:undefined,...await outputFile(path,consume=>client.downloadSource({...selection,sourceId:source.id,bytes:source.bytes,sha256:source.sha256},consume),source)});
   delete sources.at(-1).content;
  }
  const after=await client.branch(id);need(canonical(expected(after))===canonical(expected(row)),'BRANCH_CHANGED');
  return{schema:'stellar-forge.mpc-managed-observation.v1',branch:row,history,reports,sources};
 });
 await restoreObservationSources(course,label,observation);return observation;
}
async function restoreObservationSources(course,label,observation){
 const originals=Model.receiveSnapshot(observation.branch.snapshot).sources;
 need(observation.sources.length===originals.length,'SOURCE_COVERAGE');
 for(let i=0;i<originals.length;i++){
  const source=originals[i],saved=observation.sources[i],path=join(course.directory,'sources',label,String(i).padStart(4,'0')+'.bin');
  need(saved.path===path&&saved.id===source.id&&saved.bytes===source.bytes&&saved.sha256===source.sha256,'SOURCE_COVERAGE');
  const raw=Buffer.from(source.content,source.encoding==='base64'?'base64':'utf8');
  await outputFile(path,async consume=>{await consume(raw);return{bytes:raw.length,sha256:sha(raw)};},source);
 }
 return observation.sources.map(({path,bytes,sha256})=>({path,bytes,sha256}));
}
async function agentProgramme(client,course,settings,label,branch){
 const creation=await jsonFile(join(settings.workspaceDirectory,'creation.json')),storage=join(course.directory,'control','agent-files');await privateDir(storage);
 const configPath=join(course.directory,'control','agent-'+label+'.json');
 await retain(configPath,{schema:'stellar-forge.mpc-recovery-workspaces.v1',storageDirectory:storage,stores:{selected:{connectionFile:settings.connectionFile,storeId:creation.id,storeDirectory:settings.workspaceDirectory}},files:{}});
 const owner=new MerchantMpcRecovery({mpcRecovery:await readMpcRecoveryConfiguration(configPath)}),scope={store:'selected',storeId:creation.id,storeDirectory:settings.workspaceDirectory},selected={...scope,branchId:branch.id,expected:expected(branch)};
 try{
  const report=await course.effect(label+'-agent-records',()=>selected,async s=>{
   const state=await owner.call('merchant_mpc_recovery_state',scope),summary=await owner.call('merchant_mpc_recovery_branch',s),collections={};
   for(const kind of ['sources','plans','approvals','backups','recoveries','hurricanes','incidents','acceptanceRecords','acceptanceChecks','restoreSchedules','incidentReports','communications']){
    let offset=0,total=null;const rows=[];do{const page=await owner.call('merchant_mpc_recovery_records',{...s,collection:kind,offset,limit:100});need(page.offset===offset&&(total===null||page.total===total),'AGENT_PAGE');total=page.total;rows.push(...page.items);need(page.nextOffset===null||page.nextOffset>offset,'AGENT_PAGE');offset=page.nextOffset;}while(offset!==null);
    need(rows.length===total&&canonical(rows)===canonical(branch.snapshot.workspace[kind]),'AGENT_COMPLETE_COLLECTION');collections[kind]=rows;
   }
   return{state,summary,collections};
  });
  const exported=await client.exportBranch({id:branch.id,expected:expected(branch)}),wanted={bytes:Buffer.byteLength(canonical(exported)),sha256:sha(canonical(exported))};
  const path=join(course.directory,'artifacts',label+'-agent-workspace.json');let readId=null;
  await outputFile(path,async consume=>{
   let offset=0,file=null;try{
    do{const page=await owner.call('merchant_mpc_recovery_file_read',{...selected,selection:{kind:'portable'},offset,limit:196608,expectedSha256:wanted.sha256,...(readId?{readId}:{})});
     need(page.offset===offset,'AGENT_FILE_PAGE');file??=page.file;need(canonical(page.file)===canonical(file),'AGENT_FILE_CHANGED');readId=page.readId;
     const chunk=Buffer.from(page.data,'base64');need(chunk.length===page.bytesRead,'AGENT_FILE_PAGE');await consume(chunk);need(page.nextOffset===null||page.nextOffset>offset,'AGENT_FILE_PAGE');offset=page.nextOffset;
    }while(offset!==null);
   }finally{if(readId)await owner.call('merchant_mpc_recovery_file_release',{...scope,branchId:branch.id,readId});}
   return wanted;
  },wanted);
  const raw=await bytes(path,512*1024*1024,{privateOnly:true});need(canonical(portable(JSON.parse(raw)))===canonical(exported),'AGENT_PORTABLE');
  return{report,artifact:{path,bytes:raw.length,sha256:sha(raw)}};
 }finally{await owner.close();}
}
async function browserProgramme(client,course,settings,branch,guard){
 const directory=join(course.directory,'browser');await privateDir(directory);
 const packet=await course.effect('browser-selected-workspace',()=>({id:branch.id,expected:expected(branch)}),x=>client.exportBranch(x));
 const basis=await artifact(course,'Browser_Selected_Workspace.json',packet);
 const connection=await readConnection(settings.connectionFile,{storeId:client.selectedStore.storeId,workspaceDirectory:settings.workspaceDirectory});
 const stable={schema:'stellar-forge.mpc-managed-browser.v1',operationId:course.id('browser'),directory,
  storeId:client.selectedStore.storeId,storeDirectory:settings.workspaceDirectory,branchId:branch.id,sourceSha256:SOURCE_SHA256,
  acceptedWorkspaceFile:basis.path,acceptedArchive:ACCEPTED,offlinePort:course.input.offlinePort};
 await retain(join(directory,'input-binding.json'),stable);
 const live=join(directory,'connection.json'),temporary=live+'.partial',fd=await open(temporary,'w',0o600);
 try{await fd.writeFile(canonical({...stable,url:connection.url}));await fd.sync();}finally{await fd.close();}await rename(temporary,live);await syncDir(directory);
 let result=await optional(join(directory,'result.json'));
 if(result?.status!=='COMPLETE'){
  const stdout=await open(join(directory,'stdout.log'),'a',0o600),stderr=await open(join(directory,'stderr.log'),'a',0o600);
  try{
   const code=await new Promise((done,reject)=>{
    const child=spawn(course.input.nodeExecutable,[join(HERE,'managed-browser-receiving.mjs'),live],{cwd:join(PRODUCT,'app'),
     env:{...process.env,MPC_RECEIVING_GUARD_FD:'3',MPC_RECEIVING_PYTHON:course.input.pythonExecutable,MPC_CHROMIUM_EXECUTABLE:course.input.chromiumExecutable,NODE_OPTIONS:'--max-old-space-size=1024'},
     stdio:['ignore',stdout.fd,stderr.fd,guard]});
    children.add(child);child.once('error',error=>{children.delete(child);reject(error);});child.once('exit',(code,signal)=>{children.delete(child);signal?reject(new Error('Original browser ended by '+signal)):done(code);});
   });need(code===0,'BROWSER_INTERRUPTED');
  }finally{await stdout.close();await stderr.close();}
  result=await optional(join(directory,'result.json'));
 }
 need(result?.status==='COMPLETE'&&result.operation===stable.operationId&&result.browserClosed&&result.serverClosed,'BROWSER_INCOMPLETE');
 for(const item of result.artifacts){const path=join(directory,item.path),raw=await bytes(path,512*1024*1024);need(raw.length===item.bytes&&sha(raw)===item.sha256,'BROWSER_ARTIFACT_CHANGED');}
 return result;
}
async function restoreCompleteInventory(course){
  // Assemble from the completed phase inventory. Directory discovery could silently
  // omit a missing file after a completed phase; every member is restored/verified.
  const directory=course.directory,files=[],artifactPhases={
   'Original_Observation.json':'original-observation','Original_Workspace.json':'original-export',
   'Following_Observation.json':'following-observation','Following_Workspace.json':'following-export',
   'Agent_Observation.json':'following-agent-records','following-agent-workspace.json':'following-export',
   'Received_Before_Browser.json':'received-before-browser','Browser_Selected_Workspace.json':'browser-selected-workspace',
   'Received_After_Browser.json':'received-after-browser','Received_Workspace.json':'received-export',
   'Reopened_Received_Branch.json':'received-reopened-observation','Original_Reopened_Copy.json':'original-reopened-observation',
   'Cold_Observation.json':'cold-observation','Cold_Workspace.json':'received-export'
  };
  for(const [name,phase]of Object.entries(artifactPhases)){
   const value=await optional(join(directory,'control',phase,'result.json'));need(value!==null,'PHASE_INCOMPLETE');
   files.push(await artifact(course,name,value));
  }
  for(const label of ['original-observation','following-observation','received-before-browser','received-after-browser','cold-observation']){
   const observation=await optional(join(directory,'control',label,'result.json'));need(observation,'PHASE_INCOMPLETE');
   files.push(...await restoreObservationSources(course,label,observation));
  }
  const browser=await optional(join(directory,'control','browser-complete','result.json'));need(browser?.status==='COMPLETE'&&browser.browserClosed&&browser.serverClosed,'BROWSER_INCOMPLETE');for(const item of browser.artifacts)files.push({...item,path:join(directory,'browser',item.path)});
  return files;
}
export async function runManagedReceiving(input){
 need(input.schema==='stellar-forge.mpc-recovery-managed-receiving.v1'&&UUID.test(input.operationId)&&input.sourceSha256===SOURCE_SHA256,'RECEIVING_INPUT');
 const directory=absolute(input.directory),operation=absolute(input.operationDirectory);await privateDir(directory);await retain(join(directory,'input.json'),input);
 const guard=Number(process.env.MPC_MANAGED_GUARD_FD);need(Number.isSafeInteger(guard)&&guard>=3,'RECEIVING_GUARD');
 const actual=await stat('/proc/self/fd/'+guard),selected=await stat(join(operation,'complete-receiving.lock'));need(actual.dev===selected.dev&&actual.ino===selected.ino,'RECEIVING_GUARD');
 const acceptedRaw=await bytes(input.acceptedWorkspace,64*1024*1024,{privateOnly:true}),accepted=portable(JSON.parse(acceptedRaw));
 const archive=await bytes(input.acceptedArchive.path,ACCEPTED.bytes,{privateOnly:true});need(archive.length===ACCEPTED.bytes&&sha(archive)===ACCEPTED.sha256,'ACCEPTED_ARCHIVE');
 const course=new Course(directory,input),done=await optional(join(directory,'result.json'));
 if(done){
  need(done.state==='COMPLETE'&&done.inputSha256===digest(input)&&done.allOwnedResourcesClosed,'RESULT_CHANGED');
  const restored=await restoreCompleteInventory(course);need(canonical(restored)===canonical(done.files),'RESULT_INVENTORY_CHANGED');
  for(const f of done.files){const raw=await bytes(f.path,512*1024*1024);need(raw.length===f.bytes&&sha(raw)===f.sha256,'RESULT_FILE_CHANGED');}
  return done;
 }
 await inspectSource(join(PRODUCT,'app'));
 const model=await openRuntimeWorkspace({directory:absolute(input.runtimeWorkspace)});let modelClosed=false;
 try{
  const modelState=await model.state({runtimeId:input.runtimeId}),runtime=modelState.runtimes.find(x=>x.id===input.runtimeId);need(runtime?.phase==='READY','RUNTIME_NOT_READY');
  const installed=await inspectMerchantRuntime(runtime.directory,{load:false,source:false});need(await realpath(installed.sourceRoot)===await realpath(ROOT),'INSTALLED_SOURCE_CHANGED');
  const originalSettings={workspaceDirectory:join(directory,'stores','original'),connectionFile:join(directory,'stores','original','connection.json'),port:0};
  await privateDir(dirname(originalSettings.workspaceDirectory));
  const originalStore=await course.effect('create-original',()=>({directory:originalSettings.workspaceDirectory,id:course.id('original-store'),title:input.label,createdAt:input.startedAt,initialSnapshot:accepted.snapshot}),x=>createStore(x));
  const originalId=await saveApplication(model,course,'original',originalSettings);
  await withRun(model,course,originalId,originalSettings,'original',async client=>{
   const baseline=await originalReports(client,course,'original-observation',originalStore.defaultBranchId,{workspaceId:accepted.snapshot.workspace.id,revision:accepted.snapshot.workspace.revision,snapshotSha256:accepted.sha256});
   await artifact(course,'Original_Observation.json',baseline);
   if(accepted.snapshot.workspace.operations.length){const command=accepted.snapshot.workspace.operations[0].command;
    await course.effect('original-domain-replay',()=>({id:originalStore.defaultBranchId,expected:expected(baseline.branch),command,requestId:course.id('original-domain-replay')}),async x=>{const r=await client.command(x);need(r.replayed===true,'MODEL_REPLAY');return r;});
   }
   const seed=await course.effect('original-export',()=>({id:baseline.branch.id,expected:expected(baseline.branch)}),x=>client.exportBranch(x));
   const exported=await artifact(course,'Original_Workspace.json',seed);
   const copy=await course.effect('receive-original-copy',()=>({id:'branch-'+course.id('original-copy'),label:'Independent managed receiving branch',origin:{purpose:'Complete managed receiving'},requestId:course.id('receive-original-copy')}),x=>client.receiveFile(x,exported.path,exported));
   await course.effect('following-plan',async()=>{
    const row=await client.branch(copy.id),w=Model.receiveSnapshot(row.snapshot),prior=w.plans.find(x=>x.id===w.activePlanId);need(prior,'ORIGINAL_PLAN_MISSING');
    const command={id:'command-'+course.id('following-plan'),actor:input.actor,at:new Date().toISOString(),expectedRevision:w.revision,type:'plan.save',payload:{id:'plan-'+course.id('following-plan'),title:'Managed receiving planning review',previousPlanId:w.activePlanId,note:'Independent receiving review of the original complete proposal and installation plan.',sourceRefs:prior.sourceRefs,repositories:prior.repositories,workloads:prior.workloads}};
    return{id:row.id,expected:expected(row),command,requestId:course.id('following-plan')};
   },x=>client.command(x));
   const following=await originalReports(client,course,'following-observation',copy.id);need(canonical(following.branch.snapshot.workspace.sources)===canonical(accepted.snapshot.workspace.sources),'ORIGINAL_SOURCES_CHANGED');
   await artifact(course,'Following_Observation.json',following);
   const repeatedInput=await optional(join(directory,'control','receive-original-copy','input.json'));
   await course.effect('repeat-receive-first-result',()=>repeatedInput,x=>client.receiveFile(x,exported.path,exported));
   const retained=await client.branch(copy.id);need(canonical(expected(retained))===canonical(expected(following.branch)),'FOLLOWING_EDIT_LOST');
   const portableFollowing=await course.effect('following-export',()=>({id:copy.id,expected:expected(following.branch)}),x=>client.exportBranch(x));
   await artifact(course,'Following_Workspace.json',portableFollowing);
   const agent=await agentProgramme(client,course,originalSettings,'following',following.branch);await artifact(course,'Agent_Observation.json',agent.report);
  });
  const following=await optional(join(directory,'control','following-export','result.json'));
  const receivedSettings={workspaceDirectory:join(directory,'stores','received'),connectionFile:join(directory,'stores','received','connection.json'),port:0};
  const receivedStore=await course.effect('create-received',()=>({directory:receivedSettings.workspaceDirectory,id:course.id('received-store'),title:input.label+' — independent receiving',createdAt:input.startedAt,initialSnapshot:following.snapshot}),x=>createStore(x));
  const receivedId=await saveApplication(model,course,'received',receivedSettings);
  await withRun(model,course,receivedId,receivedSettings,'received',async client=>{
   const basis=await originalReports(client,course,'received-before-browser',receivedStore.defaultBranchId,{workspaceId:following.snapshot.workspace.id,revision:following.snapshot.workspace.revision,snapshotSha256:following.sha256});
   await artifact(course,'Received_Before_Browser.json',basis);
   const browser=await browserProgramme(client,course,receivedSettings,basis.branch,guard);
   await course.effect('browser-complete',()=>({operation:browser.operation}),async()=>browser);
   const current=await originalReports(client,course,'received-after-browser',receivedStore.defaultBranchId);
   need(canonical(current.branch.snapshot)===canonical(browser.steps.finalOriginal.snapshot),'BROWSER_BRANCH_CHANGED');await artifact(course,'Received_After_Browser.json',current);
   const whole=await course.effect('received-export',()=>({id:current.branch.id,expected:expected(current.branch)}),x=>client.exportBranch(x));await artifact(course,'Received_Workspace.json',whole);
  });
  const received=await optional(join(directory,'control','received-export','result.json'));
  await withRun(model,course,receivedId,receivedSettings,'received-reopen',async client=>{
   const row=await course.effect('received-reopened-observation',()=>({id:receivedStore.defaultBranchId}),x=>client.branch(x.id));need(canonical(row.snapshot)===canonical(received.snapshot),'REOPEN_CHANGED');await artifact(course,'Reopened_Received_Branch.json',row);
  });
  await withRun(model,course,originalId,originalSettings,'original-reopen',async client=>{
   const row=await client.branch(originalStore.defaultBranchId);need(canonical(row.snapshot)===canonical(accepted.snapshot),'ORIGINAL_BRANCH_CHANGED');
   const copy=await optional(join(directory,'control','receive-original-copy','input.json')),file=await artifact(course,'Original_Workspace.json',await optional(join(directory,'control','original-export','result.json')));
   await course.effect('reopened-original-receive',()=>copy,x=>client.receiveFile(x,file.path,file));
   const current=await course.effect('original-reopened-observation',()=>({id:copy.id}),x=>client.branch(x.id));need(canonical(current.snapshot)===canonical(following.snapshot),'FOLLOWING_EDIT_LOST');await artifact(course,'Original_Reopened_Copy.json',current);
  });
  const coldSettings={workspaceDirectory:join(directory,'stores','cold'),connectionFile:join(directory,'stores','cold','connection.json'),port:0};
  const coldStore=await course.effect('create-cold',()=>({directory:coldSettings.workspaceDirectory,id:course.id('cold-store'),title:input.label+' — final receiving',createdAt:input.startedAt,initialSnapshot:received.snapshot}),x=>createStore(x));
  const coldId=await saveApplication(model,course,'cold',coldSettings);
  await withRun(model,course,coldId,coldSettings,'cold',async client=>{
   const observation=await originalReports(client,course,'cold-observation',coldStore.defaultBranchId,{workspaceId:received.snapshot.workspace.id,revision:received.snapshot.workspace.revision,snapshotSha256:received.sha256});await artifact(course,'Cold_Observation.json',observation);
   const out=await client.exportBranch({id:coldStore.defaultBranchId,expected:expected(observation.branch)});need(canonical(out)===canonical(received),'COLD_RECEIVING_CHANGED');await artifact(course,'Cold_Workspace.json',out);
  });
  const files=await restoreCompleteInventory(course);
  const browser=await optional(join(directory,'control','browser-complete','result.json'));
  await model.close();modelClosed=true;need(!interruption,'RECEIVING_INTERRUPTED');
  const result={schema:'stellar-forge.mpc-recovery-managed-result.v1',state:'COMPLETE',operationId:input.operationId,inputSha256:digest(input),sourceSha256:SOURCE_SHA256,
   originalAcceptedArchive:ACCEPTED,runtimeId:input.runtimeId,runtimeDirectory:runtime.directory,applications:{original:originalId,received:receivedId,cold:coldId},
   stores:{original:originalStore,received:receivedStore,cold:coldStore},browser,files,allOwnedResourcesClosed:true};
  await retain(join(directory,'result.json'),result);return result;
 }finally{if(!modelClosed)await model.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const input=await jsonFile(absolute(process.argv[2]),512*1024*1024,{privateOnly:true});console.log(JSON.stringify(await runManagedReceiving(input)));}
 finally{process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);}
}
