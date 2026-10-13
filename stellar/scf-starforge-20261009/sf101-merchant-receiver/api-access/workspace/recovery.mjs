// MIT. Complete API-customer handover through the existing SF88/SF101 engine.
import {join,relative} from 'node:path';
import {acquireStateLease} from '../../../merchant-fleet-gateway/state-lease.mjs';
import {inspectWorkspaceRecovery,snapshotWorkspaceRecovery,verifyWorkspaceRecovery,restoreWorkspaceRecovery} from '../../../sf88-operator-buyer-cli/workspace-recovery.mjs';
import {collectionBundleFiles} from '../../../sf88-operator-buyer-cli/collections/recovery.mjs';
import {compileConfig} from './configuration.mjs';
import {validateState as validateOriginalState} from './model.mjs';
import {inspectApiPassAgentSetup} from './agent-setup.mjs';
import {absolute,inside,need,HASH,UUID,same,sha,canonical,directory,file,jsonFile,present,exactTree} from './recovery-files.mjs';

export const API_PASS_RECOVERY_SCHEMA='stellar-forge.sf101.api-customer-recovery.v1';
const MEMBER_NAMES=['setup.json','connection.json','merchant/merchant-mcp.json','client-settings.json'];
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
 need(config.buyerWorkspace!==null,'API_RECOVERY_MANAGED_BUYER_REQUIRED');
 for(const p of [config.directory,config.buyerWorkspace,config.buyerStateDirectory,config.inboxDirectory])within(p);
 const raw=await jsonFile(map(join(config.directory,'workspace.json')));
 const state=validateOriginalState(raw.value,config);
 const launchPath=map(join(config.directory,'api-pass-workspace-launch.json'));
 if(await present(launchPath)){
  const launch=(await jsonFile(launchPath,1048576)).value;
  if(launch.agent?.directory)need(agentDirectory===launch.agent.directory,'API_RECOVERY_ORIGINAL_AGENT_SELECTION_REQUIRED');
 }
 await include(configFile);await include(config.directory);
 await include(config.buyerStateDirectory,{missing:true});
 await include(config.inboxDirectory);await include(config.buyerWorkspace);
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
 let agent=null;
 if(agentDirectory){
  within(agentDirectory);await include(agentDirectory);const members=[];
  for(const name of MEMBER_NAMES){const item=await include(join(agentDirectory,name));need(item,'API_RECOVERY_COMPLETE_AGENT_REQUIRED');members.push({name,...identity(item),path:join(agentDirectory,name)});}
  const setup=(await jsonFile(map(join(agentDirectory,'setup.json')),1048576)).value;
  const connection=(await jsonFile(map(join(agentDirectory,'connection.json')),1048576)).value;
  const customer=connection?.workspaces?.customer;
  need(setup.schema==='stellar-forge.sf101.api-pass-agent-setup.v1'&&setup.directory===agentDirectory&&setup.workspaceDirectory===config.directory&&setup.workspaceId===state.id
   &&connection.schema==='stellar-forge.sf101.api-pass-mcp-connection.v1'&&customer?.workspaceId===state.id
   &&customer.launchFile===join(config.directory,'api-pass-workspace-launch.json'),'API_RECOVERY_AGENT_BINDING_INVALID');
  for(const [key,name]of [['operationDirectory','operations'],['exportDirectory','exports'],['snapshotDirectory','reads']]){
   need(customer[key]===join(agentDirectory,name),'API_RECOVERY_AGENT_BINDING_INVALID');await include(customer[key],{missing:true});
  }
  for(const input of Object.values(customer.files??{})){
   need(input&&typeof input.path==='string'&&HASH.test(input.sha256??''),'API_RECOVERY_AGENT_INPUT_INVALID');await include(input.path,{expected:input});
  }
  for(const purchase of Object.values(customer.purchases??{})){
   need(purchase&&typeof purchase.directory==='string','API_RECOVERY_AGENT_PURCHASE_INVALID');await include(purchase.directory);
  }
  const merchant=(await jsonFile(map(join(agentDirectory,'merchant','merchant-mcp.json')),1048576)).value;
  const client=(await jsonFile(map(join(agentDirectory,'client-settings.json')),1048576)).value;
  need(merchant.apiPassWorkspaceConnection===join(agentDirectory,'connection.json')&&client.mcpServers?.['starforge-api-customer']?.env?.MCP_MERCHANT_CONFIG===join(agentDirectory,'merchant','merchant-mcp.json'),'API_RECOVERY_AGENT_BINDING_INVALID');
  agent={directory:agentDirectory,members,sha256:sha(JSON.stringify((await import('./configuration.mjs')).canonical({directory:agentDirectory,workspaceDirectory:config.directory,files:members})))};
 }
 const profile={schema:API_PASS_RECOVERY_SCHEMA,source,stateRoot,configFile,configSha256:cfgRaw.sha256,
  directory:config.directory,workspaceId:state.id,revision:state.revision,workspaceSha256:raw.sha256,
  authority:state.authority,claimEnvs:config.claimEnvs,profiles,callCount:state.calls.length,taskCount:state.tasks.length,
  unresolvedTasks:state.tasks.filter(t=>['QUEUED','RUNNING','CANCELLING','INTERRUPTED'].includes(t.status)).map(t=>({id:t.id,kind:t.kind,status:t.status,profileId:t.profileId,callId:t.callId??null})),
  retainedInputs:[...originals.values()].sort((a,b)=>a.path.localeCompare(b.path)),selectedPaths:[...required].sort(),missingPaths:[...optional].sort(),agent};
 profile.reviewSha256=profileHash(profile);
 need(Buffer.byteLength(JSON.stringify(profile))<=1024*1024,'API_RECOVERY_APPLICATION_TOO_LARGE');
 return {profile,config,nativeOptions:{directory:config.buyerWorkspace,stateRoot,inboxes:[config.inboxDirectory],include:profile.selectedPaths.filter(path=>!profile.selectedPaths.some(parent=>parent!==path&&inside(parent,path))),optionalInclude:profile.missingPaths,operators:[]}};
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
  if(source.agentDirectory)need((await inspectApiPassAgentSetup(source.agentDirectory,{workspaceDirectory:inspected.config.directory,workspaceId:inspected.profile.workspaceId})).initialized,'API_RECOVERY_COMPLETE_AGENT_REQUIRED');
  const native=await inspectWorkspaceRecovery(inspected.nativeOptions);
  return {schema:API_PASS_RECOVERY_SCHEMA,profile:inspected.profile,native,executionStarted:false,
   prerequisites:{customerStopped:true,otherWritersMustBeQuiesced:true,environmentNames:inspected.config.claimEnvs,runtime:native.runtime}};
 });
}
async function inspectSnapshot({record,map},context={}){
 const app=record.application,p=app?.profile;
 need(app?.schema===API_PASS_RECOVERY_SCHEMA&&UUID.test(app.operationId??'')&&p?.schema===API_PASS_RECOVERY_SCHEMA&&p.reviewSha256===profileHash(p)
  &&record.plan.schema==='stellar-forge.sf88.workspace-recovery.v2'&&record.plan.stateRoot===p.stateRoot
  &&record.plan.directory===p.authority.buyerWorkspace&&record.plan.operators.length===0,'API_RECOVERY_APPLICATION_INVALID');
 const observed=await inspectApplication(p.source,{map,signal:context.signal});
 need(same(observed.profile,p),'API_RECOVERY_CAPTURE_BINDING_CHANGED');
 need(same(record.plan.inboxes.map(v=>v.root).sort(),[observed.config.inboxDirectory]),'API_RECOVERY_INBOX_BINDING_CHANGED');
 return app;
}
export async function snapshotApiPassRecovery({source,output,expectedReviewSha256,operationId,passEnv='SF88_BACKUP_PASSPHRASE',quiesced},context={}){
 source=recoverySource(source);absolute(output);
 need(quiesced===true&&HASH.test(expectedReviewSha256??'')&&UUID.test(operationId??''),'API_RECOVERY_REVIEW_REQUIRED');
 return withStoppedCustomer(source,async()=>{
  const inspected=await inspectApplication(source,context);
  need(inspected.profile.reviewSha256===expectedReviewSha256,'API_RECOVERY_REVIEW_CHANGED');
  const application={schema:API_PASS_RECOVERY_SCHEMA,operationId,profile:inspected.profile};
  const result=await snapshotWorkspaceRecovery({...inspected.nativeOptions,output,passEnv,quiesced:true},{...context,prepareSnapshot:async({staged,stateRoot,plan})=>{
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
 let agent;
 if(p.agent){agent=await inspectApiPassAgentSetup(p.agent.directory,{workspaceDirectory:config.directory,workspaceId:state.id});need(agent.initialized,'API_RECOVERY_COMPLETE_AGENT_REQUIRED');}
 return {schema:API_PASS_RECOVERY_SCHEMA,configFile:p.configFile,expectedConfigSha256:p.configSha256,expectedWorkspaceSha256:current.sha256,
  workspaceId:state.id,revision:state.revision,approvalMode:'terminal',...(agent?{agentDirectory:agent.directory,expectedAgentSetupSha256:agent.sha256}:{}),
  recordSha256:result.recordSha256,existingOnly:true,executionStarted:false};
}
export {collectionBundleFiles as apiPassEncryptedFiles};
