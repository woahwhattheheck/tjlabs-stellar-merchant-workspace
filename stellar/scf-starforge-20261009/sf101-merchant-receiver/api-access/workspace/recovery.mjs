// MIT. Complete API-customer handover through the existing SF88/SF101 engine.
import {join,relative} from 'node:path';
import {readdir} from 'node:fs/promises';
import {acquireStateLease} from '../../../merchant-fleet-gateway/state-lease.mjs';
import {inspectWorkspaceRecovery,snapshotWorkspaceRecovery,verifyWorkspaceRecovery,restoreWorkspaceRecovery,inspectUnmanagedStateRecovery,snapshotUnmanagedStateRecovery} from '../../../sf88-operator-buyer-cli/workspace-recovery.mjs';
import {collectionBundleFiles} from '../../../sf88-operator-buyer-cli/collections/recovery.mjs';
import {compileConfig} from './configuration.mjs';
import {validateState as validateOriginalState} from './model.mjs';
import {inspectApiPassRecoveryAgent,reopenApiPassRecoveryAgent} from './recovery-agent.mjs';
import {absolute,inside,need,HASH,UUID,same,sha,canonical,directory,file,jsonFile,present,exactTree} from './recovery-files.mjs';

export const API_PASS_RECOVERY_SCHEMA='stellar-forge.sf101.api-customer-recovery.v1';
export function recoverySource(value){
 need(value&&Object.keys(value).every(k=>['configFile','stateRoot','agentDirectory'].includes(k)),'API_RECOVERY_SOURCE_REQUIRED');
 return {configFile:absolute(value.configFile),stateRoot:absolute(value.stateRoot),...(value.agentDirectory?{agentDirectory:absolute(value.agentDirectory)}:{})};
}
const identity=info=>({path:info.path,bytes:info.bytes,sha256:info.sha256});
const profileHash=profile=>{const {reviewSha256,...content}=profile;return sha(canonical(content));};

/** All paths in the captured configuration remain their original logical paths. */
async function inspectApplication(source,{map=p=>p,signal}={}){
 source=recoverySource(source);const {stateRoot,configFile,agentDirectory}=source;
 const within=p=>{absolute(p);need(inside(stateRoot,p),'API_RECOVERY_DEPENDENCY_OUTSIDE_ROOT');return p;};
 const originals=new Map(),required=new Set(),optional=new Set();
 async function include(path,{missing=false,expected}={}){
  within(path);const actual=map(path),st=await present(actual);
  if(!st){need(missing,'API_RECOVERY_ORIGINAL_FILE_MISSING');optional.add(path);return null;}
  if(st.isDirectory()){await directory(actual);required.add(path);return null;}
  const observed=await file(actual,{signal});
  if(expected)need((expected.bytes===undefined||observed.bytes===expected.bytes)&&observed.sha256===expected.sha256,'API_RECOVERY_ORIGINAL_FILE_CHANGED');
  originals.set(path,{...identity(observed),path});required.add(path);return observed;
 }
 await directory(map(stateRoot));within(configFile);
 const cfgRaw=await jsonFile(map(configFile),65536),config=compileConfig(cfgRaw.value);
 for(const p of [config.directory,config.buyerWorkspace,config.buyerStateDirectory,config.inboxDirectory].filter(Boolean))within(p);
 let buyerState=null;
 if(config.buyerWorkspace===null)buyerState={kind:'UNMANAGED',directory:null,originalPresence:'NOT_CONFIGURED'};
 else {
  const selected=await present(map(config.buyerWorkspace));
  if(!selected)buyerState={kind:'UNMANAGED',directory:config.buyerWorkspace,originalPresence:'ABSENT'};
  else {
   await directory(map(config.buyerWorkspace));
   const names=await readdir(map(config.buyerWorkspace));
   if(names.length===0)buyerState={kind:'UNMANAGED',directory:config.buyerWorkspace,originalPresence:'EMPTY_DIRECTORY'};
   else need(['workspace.json','reservations.sqlite','reservations.sqlite-wal','reservations.sqlite-shm','operator.json','operator-keys.json'].some(name=>names.includes(name)),
    'API_RECOVERY_BUYER_STATE_REQUIRES_MANAGED_REVIEW');
  }
 }
 const raw=await jsonFile(map(join(config.directory,'workspace.json')));
 const state=validateOriginalState(raw.value,config);
 const launchPath=map(join(config.directory,'api-pass-workspace-launch.json'));
 if(await present(launchPath)){
  const launch=(await jsonFile(launchPath,1048576)).value;
  if(launch.agent?.directory)need(agentDirectory===launch.agent.directory,'API_RECOVERY_ORIGINAL_AGENT_SELECTION_REQUIRED');
 }
 await include(configFile);await include(config.directory);
 await include(config.buyerStateDirectory,{missing:true});
 await include(config.inboxDirectory,{missing:Boolean(buyerState)});if(config.buyerWorkspace)await include(config.buyerWorkspace,{missing:Boolean(buyerState)});
 const profiles=[];
 for(const p of state.profiles){
  need(p.binding&&typeof p.binding.orderReference==='string'&&HASH.test(p.binding.manifestSha256??''),'API_RECOVERY_PASS_BINDING_INVALID');
  if(p.mode==='purchase'){
   within(p.binding.purchaseDirectory);
   await include(p.binding.purchaseDirectory,{missing:!p.purchaseBinding});
   await include(p.binding.handoffFile,{expected:{sha256:p.binding.handoffSha256}});
  }
  if(p.review){need(UUID.test(p.review.id??''),'API_RECOVERY_REVIEW_BINDING_INVALID');await include(join(config.directory,'reviews',p.review.id+'.json'),{expected:{sha256:p.review.sha256}});}
  profiles.push({id:p.id,orderReference:p.binding.orderReference,manifestSha256:p.binding.manifestSha256,mode:p.mode,archived:p.archived,replacesProfileId:p.replacesProfileId??null});
 }
 for(const c of state.calls){
  if(c.body){need(HASH.test(c.body.sha256??''),'API_RECOVERY_BODY_BINDING_INVALID');await include(join(config.directory,'bodies',c.body.sha256+'.bin'),{expected:c.body});}
  if(c.result){need(UUID.test(c.result.taskId??'')&&c.result.file===join(config.directory,'results',c.result.taskId+'.bin'),'API_RECOVERY_RESULT_BINDING_INVALID');await include(c.result.file,{expected:c.result});}
 }
 for(const t of state.tasks)for(const [key,suffix]of [['proof','.proof.json'],['report','.html']])if(t[key]){
  need(t[key].file===join(config.directory,'reports',t.id+suffix),'API_RECOVERY_REPORT_BINDING_INVALID');
  await include(t[key].file,{expected:t[key]});
 }
 const agent=agentDirectory?await inspectApiPassRecoveryAgent({directory:agentDirectory,
  workspaceDirectory:config.directory,workspaceId:state.id,stateRoot,map,include,signal}):null;
 const profile={schema:API_PASS_RECOVERY_SCHEMA,source,stateRoot,configFile,configSha256:cfgRaw.sha256,
  directory:config.directory,workspaceId:state.id,revision:state.revision,workspaceSha256:raw.sha256,
  authority:state.authority,claimEnvs:config.claimEnvs,profiles,callCount:state.calls.length,taskCount:state.tasks.length,
  unresolvedTasks:state.tasks.filter(t=>['QUEUED','RUNNING','CANCELLING','INTERRUPTED'].includes(t.status)).map(t=>({id:t.id,kind:t.kind,status:t.status,profileId:t.profileId,callId:t.callId??null})),
  ...(buyerState?{buyerState}:{}),retainedInputs:[...originals.values()].sort((a,b)=>a.path.localeCompare(b.path)),selectedPaths:[...required].sort(),missingPaths:[...optional].sort(),agent};
 profile.reviewSha256=profileHash(profile);
 need(Buffer.byteLength(JSON.stringify(profile))<=1024*1024,'API_RECOVERY_APPLICATION_TOO_LARGE');
 const includeRoots=profile.selectedPaths.filter(path=>!profile.selectedPaths.some(parent=>parent!==path&&inside(parent,path)));
 const nativeOptions=buyerState?{directory:config.directory,stateRoot,include:includeRoots,optionalInclude:profile.missingPaths,
  absentLedgers:config.buyerWorkspace?[join(config.buyerWorkspace,'reservations.sqlite')]:[],runtime:[config.python,config.runtimeDirectory]}:
  {directory:config.buyerWorkspace,stateRoot,inboxes:[config.inboxDirectory],include:includeRoots,optionalInclude:profile.missingPaths,operators:[]};
 return {profile,config,nativeOptions};
}
async function withStoppedCustomer(source,operation){
 const cfg=compileConfig((await jsonFile(source.configFile,65536)).value);await directory(cfg.directory);
 const lease=await acquireStateLease(cfg.directory);
 try{return await operation();}finally{await lease.close();}
}
export async function inspectApiPassRecovery(source,context={}){
 source=recoverySource(source);
 return withStoppedCustomer(source,async()=>{
  const inspected=await inspectApplication(source,context);
  const native=await (inspected.profile.buyerState?inspectUnmanagedStateRecovery:inspectWorkspaceRecovery)(inspected.nativeOptions);
  return {schema:API_PASS_RECOVERY_SCHEMA,profile:inspected.profile,native,executionStarted:false,
   prerequisites:{customerStopped:true,otherWritersMustBeQuiesced:true,environmentNames:inspected.config.claimEnvs,runtime:native.runtime}};
 });
}
async function inspectSnapshot({record,map},context={}){
 const app=record.application,p=app?.profile;
 need(app?.schema===API_PASS_RECOVERY_SCHEMA&&UUID.test(app.operationId??'')&&p?.schema===API_PASS_RECOVERY_SCHEMA&&p.reviewSha256===profileHash(p)
  &&record.plan.stateRoot===p.stateRoot
  &&(p.buyerState?.kind==='UNMANAGED'?
   record.plan.schema==='stellar-forge.sf88.unmanaged-state-recovery.v1'&&record.plan.directory===p.directory&&record.plan.operators===undefined:
   record.plan.schema==='stellar-forge.sf88.workspace-recovery.v2'&&record.plan.directory===p.authority.buyerWorkspace&&record.plan.operators.length===0),'API_RECOVERY_APPLICATION_INVALID');
 const observed=await inspectApplication(p.source,{map,signal:context.signal});
 need(same(observed.profile,p),'API_RECOVERY_CAPTURE_BINDING_CHANGED');
 need(same(record.plan.inboxes.map(v=>v.root).sort(),p.buyerState?[]:[observed.config.inboxDirectory]),'API_RECOVERY_INBOX_BINDING_CHANGED');
 if(p.buyerState)need(same(record.plan.absentLedgers,observed.nativeOptions.absentLedgers)&&
  same(record.plan.include,observed.nativeOptions.include.slice().sort())&&same(record.plan.optionalInclude,observed.nativeOptions.optionalInclude.slice().sort()),'API_RECOVERY_UNMANAGED_BINDING_CHANGED');
 return app;
}
export async function snapshotApiPassRecovery({source,output,expectedReviewSha256,operationId,passEnv='SF88_BACKUP_PASSPHRASE',quiesced},context={}){
 source=recoverySource(source);absolute(output);
 need(quiesced===true&&HASH.test(expectedReviewSha256??'')&&UUID.test(operationId??''),'API_RECOVERY_REVIEW_REQUIRED');
 return withStoppedCustomer(source,async()=>{
  const inspected=await inspectApplication(source,context);
  need(inspected.profile.reviewSha256===expectedReviewSha256,'API_RECOVERY_REVIEW_CHANGED');
  const application={schema:API_PASS_RECOVERY_SCHEMA,operationId,profile:inspected.profile};
  const result=await (inspected.profile.buyerState?snapshotUnmanagedStateRecovery:snapshotWorkspaceRecovery)({...inspected.nativeOptions,output,passEnv,quiesced:true},{...context,prepareSnapshot:async({staged,stateRoot,plan})=>{
   need((await inspectApplication(source,context)).profile.reviewSha256===expectedReviewSha256,'API_RECOVERY_REVIEW_CHANGED');
   await inspectSnapshot({record:{plan,application},map:p=>join(staged,relative(stateRoot,p))},context);return application;
  }});
  return {...result,bundle:output,encryptedFiles:await collectionBundleFiles(output,{expectedRecordSha256:result.recordSha256}),executionStarted:false};
 });
}
export async function verifyApiPassRecovery(options,context={}){
 const encryptedFiles=await collectionBundleFiles(options.bundle,{expectedRecordSha256:options.expected});
 const result=await verifyWorkspaceRecovery(options,{...context,inspectSnapshot:input=>inspectSnapshot(input,context)});
 await collectionBundleFiles(options.bundle,{expectedRecordSha256:result.recordSha256,expectedFiles:encryptedFiles});
 return {...result,bundle:absolute(options.bundle),encryptedFiles,executionStarted:false};
}
function checkDestination(profile,options){
 need(options.expectedStateRoot===profile.stateRoot,'API_RECOVERY_TARGET_CHANGED');
 need(!inside(profile.stateRoot,absolute(options.receivingDirectory))&&!inside(options.receivingDirectory,profile.stateRoot),'API_RECOVERY_JOURNAL_OVERLAPS_TARGET');
}
export async function restoreApiPassRecovery(options,context={}){
 need(HASH.test(options.expected??''),'API_RECOVERY_VERIFIED_BACKUP_REQUIRED');
 const encryptedFiles=await collectionBundleFiles(options.bundle,{expectedRecordSha256:options.expected});
 const result=await restoreWorkspaceRecovery(options,{...context,inspectSnapshot:async input=>{
  const app=await inspectSnapshot(input,context);checkDestination(app.profile,options);
 }});
 return {...result,bundle:absolute(options.bundle),encryptedFiles,executionStarted:false};
}
/** Only an uncertain original publication may adopt a populated exact baseline. */
export async function reconcileApiPassRestore(options,context={}){
 let profile;
 const encryptedFiles=await collectionBundleFiles(options.bundle,{expectedRecordSha256:options.expected});
 const result=await verifyWorkspaceRecovery(options,{...context,inspectSnapshot:async input=>{
  const app=await inspectSnapshot(input,context);profile=app.profile;checkDestination(profile,options);
  await exactTree(profile.stateRoot,input.record.files,context);
 }});
 return {...result,bundle:absolute(options.bundle),encryptedFiles,status:'API_CUSTOMER_RESTORE_PUBLICATION_RECOVERED',publicationRecovered:true,originalStateRetained:true,executionStarted:false};
}
/** Explicit launch preparation only: current edits remain; nothing is enqueued. */
export async function restoredApiPassLaunch(result){
 const p=result?.application?.profile;need(p?.schema===API_PASS_RECOVERY_SCHEMA,'API_RECOVERY_APPLICATION_INVALID');
 const raw=await jsonFile(p.configFile,65536);need(raw.sha256===p.configSha256,'API_RECOVERY_CONFIGURATION_CHANGED');
 const config=compileConfig(raw.value),current=await jsonFile(join(config.directory,'workspace.json'));
 const state=validateOriginalState(current.value,config);
 need(state.id===p.workspaceId&&state.revision>=p.revision,'API_RECOVERY_ORIGINAL_WORKSPACE_CHANGED');
 const agent=p.agent?await reopenApiPassRecoveryAgent(p.agent,{stateRoot:p.stateRoot,workspaceDirectory:config.directory,workspaceId:state.id}):{};
 return {schema:API_PASS_RECOVERY_SCHEMA,configFile:p.configFile,expectedConfigSha256:p.configSha256,expectedWorkspaceSha256:current.sha256,
  workspaceId:state.id,revision:state.revision,approvalMode:'terminal',...agent,
  recordSha256:result.recordSha256,existingOnly:true,executionStarted:false};
}
export {collectionBundleFiles as apiPassEncryptedFiles};
