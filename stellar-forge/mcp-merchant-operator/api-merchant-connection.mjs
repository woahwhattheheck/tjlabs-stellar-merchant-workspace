// MIT. Host-declared connections to the existing API merchant console and native files.
import {dirname,join,resolve} from 'node:path';
import {
 absolute,ownedDirectory,ownedBytes,parse,digest,canonical,STATE_SCHEMA,MAX_STATE,
} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {
 readMerchantWorkspaceLaunch,requestMerchantWorkspaceJson,LAUNCH_NAME,
} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/cli.mjs';
import {
 API_MERCHANT_CONNECTION_SCHEMA,API_MERCHANT_ALIAS,API_MERCHANT_UUID,API_MERCHANT_HASH,
 apiMerchantPlain,apiMerchantNeed,apiMerchantExact,
} from './api-merchant-protocol.mjs';

export function apiMerchantHostPath(value,base=process.cwd()){
 apiMerchantNeed(typeof value==='string'&&value.length>0&&!/[\x00-\x1f\x7f]/.test(value),'Select a host path.','API_MERCHANT_AGENT_CONFIGURATION');
 return absolute(resolve(base,value));
}
function label(value,fallback){
 const text=value??fallback;
 apiMerchantNeed(typeof text==='string'&&text.trim()===text&&text.length>0&&text.length<=240&&!/[\x00-\x1f\x7f]/.test(text),
  'Use a short host selection label.','API_MERCHANT_AGENT_CONFIGURATION');return text;
}
function hash(value){apiMerchantNeed(API_MERCHANT_HASH.test(value??''),'Pin the complete selected source SHA256.','API_MERCHANT_AGENT_CONFIGURATION');return value;}
function aliases(value,maximum=32){
 apiMerchantNeed(value===undefined||apiMerchantPlain(value)&&Object.keys(value).length<=maximum,
  'Declare a named selection object within its source limit.','API_MERCHANT_AGENT_CONFIGURATION');
 for(const name of Object.keys(value??{}))apiMerchantNeed(API_MERCHANT_ALIAS.test(name),'Use a valid host selection alias.','API_MERCHANT_AGENT_CONFIGURATION');
 return Object.entries(value??{});
}
export async function inspectApiMerchantState(definition){
 await ownedDirectory(definition.directory);
 const state=parse(await ownedBytes(join(definition.directory,'workspace.json'),MAX_STATE));
 apiMerchantNeed(state?.schema===STATE_SCHEMA&&state.id===definition.workspaceId&&
  state.configurationSha256===definition.configSha256&&Number.isSafeInteger(state.revision)&&state.revision>=1,
  'The selected original workspace or configuration changed.','API_MERCHANT_AGENT_WORKSPACE_CHANGED');
 return state;
}
async function applicationSource(value){
 const profile=await ownedBytes(value.profilePath,12*1024*1024),plan=await ownedBytes(value.planFile,1024*1024);
 apiMerchantNeed(digest(profile)===value.profileFileSha256&&digest(plan)===value.planFileSha256,
  'The host-declared original application or plan changed.','API_MERCHANT_AGENT_APPLICATION_CHANGED');
 return {label:value.label,profileFileSha256:value.profileFileSha256,profileBytes:profile.length,
  planFileSha256:value.planFileSha256,planBytes:plan.length};
}
async function receivingSource(value){
 await ownedDirectory(value.bundle);await ownedDirectory(dirname(value.out));
 const bytes=await ownedBytes(value.metadataFile,32*1024*1024),saved=parse(bytes);
 apiMerchantNeed(digest(bytes)===value.metadataSha256&&saved?.schema==='stellar-forge.sf101.api-merchant-backup.v1'&&
  API_MERCHANT_UUID.test(saved.id??'')&&API_MERCHANT_UUID.test(saved.offerId??'')&&
  API_MERCHANT_HASH.test(saved.encryptedManifestSha256??'')&&API_MERCHANT_HASH.test(saved.snapshotManifestSha256??'')&&
  API_MERCHANT_HASH.test(saved.sidecarSha256??''),'The declared receiving metadata changed.','API_MERCHANT_AGENT_RECEIVING_CHANGED');
 return {label:value.label,metadataSha256:value.metadataSha256,metadataBytes:bytes.length,backupId:saved.id,
  originalOfferId:saved.offerId,snapshotManifestSha256:saved.snapshotManifestSha256,
  encryptedManifestSha256:saved.encryptedManifestSha256,sidecarSha256:saved.sidecarSha256};
}
/** Reading configuration inspects the original source; it never starts or leases the console. */
export async function readApiMerchantWorkspaceConfiguration(file){
 file=apiMerchantHostPath(file);
 const raw=parse(await ownedBytes(file,1024*1024)),base=dirname(file);
 apiMerchantExact(raw,['schema','workspaces'],['schema','workspaces']);
 apiMerchantNeed(raw.schema===API_MERCHANT_CONNECTION_SCHEMA&&apiMerchantPlain(raw.workspaces)&&
  Object.keys(raw.workspaces).length>0&&Object.keys(raw.workspaces).length<=32,
  'Declare one to 32 original API merchant workspaces.','API_MERCHANT_AGENT_CONFIGURATION');
 const workspaces=Object.create(null),directories=new Set(),identities=new Set(),receivingTargets=new Set();
 for(const [name,value] of aliases(raw.workspaces)){
  apiMerchantExact(value,['label','launchFile','workspaceId','configSha256','applications','receiving'],
   ['launchFile','workspaceId','configSha256']);
  const launchFile=apiMerchantHostPath(value.launchFile,base),directory=dirname(launchFile);
  apiMerchantNeed(launchFile===join(directory,LAUNCH_NAME)&&API_MERCHANT_UUID.test(value.workspaceId??'')&&
   !directories.has(directory)&&!identities.has(value.workspaceId),
   'Use one named binding for each original console workspace.','API_MERCHANT_AGENT_CONFIGURATION');
  directories.add(directory);identities.add(value.workspaceId);
  const definition={label:label(value.label,name),directory,launchFile,workspaceId:value.workspaceId,
   configSha256:hash(value.configSha256),applications:Object.create(null),receiving:Object.create(null)};
  await inspectApiMerchantState(definition);
  for(const [handle,input] of aliases(value.applications)){
   apiMerchantExact(input,['label','profilePath','planFile','profileFileSha256','planFileSha256'],
    ['profilePath','planFile','profileFileSha256','planFileSha256']);
   const selection={label:label(input.label,handle),profilePath:apiMerchantHostPath(input.profilePath,base),
    planFile:apiMerchantHostPath(input.planFile,base),profileFileSha256:hash(input.profileFileSha256),planFileSha256:hash(input.planFileSha256)};
   await applicationSource(selection);definition.applications[handle]=selection;
  }
  for(const [handle,input] of aliases(value.receiving)){
   apiMerchantExact(input,['label','bundle','metadataFile','out','passEnv','python','metadataSha256'],
    ['bundle','metadataFile','out','passEnv','metadataSha256']);
   const selection={label:label(input.label,handle),bundle:apiMerchantHostPath(input.bundle,base),
    metadataFile:apiMerchantHostPath(input.metadataFile,base),out:apiMerchantHostPath(input.out,base),
    passEnv:input.passEnv,python:input.python,metadataSha256:hash(input.metadataSha256)};
   apiMerchantNeed(/^[A-Z][A-Z0-9_]{4,63}$/.test(selection.passEnv??'')&&
    (selection.python===undefined||typeof selection.python==='string'&&selection.python.length>0&&selection.python.length<=4096&&!/[\x00-\x1f\x7f]/.test(selection.python))&&
    !receivingTargets.has(selection.out),'Declare the original passphrase environment name, Python executable and a unique receiving destination.','API_MERCHANT_AGENT_CONFIGURATION');
   receivingTargets.add(selection.out);
   await receivingSource(selection);definition.receiving[handle]=selection;
  }
  workspaces[name]=definition;
 }
 return {file,workspaces};
}
export class ApiMerchantWorkspaceConnection{
 #verifiedInstance=null;
 constructor(definition){this.definition=definition;}
 async retainedState(){return inspectApiMerchantState(this.definition);}
 async #launch(){
  const launch=await readMerchantWorkspaceLaunch(this.definition.launchFile);
  apiMerchantNeed(launch.workspaceId===this.definition.workspaceId&&launch.configSha256===this.definition.configSha256&&
   launch.directory===this.definition.directory,'The original console launch changed workspace or configuration.','API_MERCHANT_AGENT_LAUNCH_CHANGED');
  return launch;
 }
 #identity(launch){return digest(canonical({instanceId:launch.instanceId,pid:launch.pid,url:launch.url,
  codeSha256:launch.codeSha256,sourceSha256:launch.sourceSha256}));}
 #view(value,launch){
  apiMerchantNeed(value?.workspace?.id===this.definition.workspaceId&&Number.isSafeInteger(value.workspace.revision)&&value.workspace.revision>=1,
   'The running console returned another original workspace.','API_MERCHANT_AGENT_WORKSPACE_CHANGED');
  this.#verifiedInstance=this.#identity(launch);return value;
 }
 async connect(){
  const launch=await this.#launch(),view=this.#view(await requestMerchantWorkspaceJson(launch,'/api/state'),launch);
  return {launch,view};
 }
 async view(){return (await this.connect()).view;}
 async json(path,options){
  const launch=await this.#launch();
  if(this.#verifiedInstance!==this.#identity(launch))
   this.#view(await requestMerchantWorkspaceJson(launch,'/api/state'),launch);
  return requestMerchantWorkspaceJson(launch,path,options);
 }
 async selections(){
  const applications=[],receiving=[];
  for(const [handle,value] of Object.entries(this.definition.applications))applications.push({handle,...await applicationSource(value)});
  for(const [handle,value] of Object.entries(this.definition.receiving))receiving.push({handle,...await receivingSource(value)});
  return {applications,receiving};
 }
 async application(handle){
  const value=this.definition.applications[handle];
  apiMerchantNeed(value,'Choose a host-declared existing application.','API_MERCHANT_AGENT_APPLICATION_REQUIRED');
  await applicationSource(value);return {profilePath:value.profilePath,planFile:value.planFile,
   profileFileSha256:value.profileFileSha256,planFileSha256:value.planFileSha256};
 }
 async receiving(handle,expectedMetadataSha256){
  const value=this.definition.receiving[handle];
  apiMerchantNeed(value&&value.metadataSha256===expectedMetadataSha256,
   'Select the declared receiving handle and its reviewed metadata SHA.','API_MERCHANT_AGENT_RECEIVING_REQUIRED');
  await receivingSource(value);
  return {bundle:value.bundle,metadataFile:value.metadataFile,out:value.out,passEnv:value.passEnv,
   python:value.python,expectedMetadataSha256:value.metadataSha256};
 }
}
