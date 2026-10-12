// MIT. Resumable original merchant-host registration for an existing merchant console.
import {mkdir,lstat,readdir,rename,unlink,open} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {initReleaseStore,readReleaseState} from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {writePrivate} from './host-files.mjs';
import {apiMerchantHostPath,readApiMerchantWorkspaceConfiguration} from './api-merchant-connection.mjs';
import {ownedDirectory as apiMerchantPrivateDirectory,ownedBytes as readApiMerchantPrivateFile,digest,canonical} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {apiMerchantNeed,apiMerchantError as apiMerchantFailure} from './api-merchant-protocol.mjs';
const apiMerchantFingerprint=value=>digest(canonical(value));
function apiMerchantText(value,maximum,label){
 apiMerchantNeed(typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=maximum&&!/[\x00-\x1f\x7f]/.test(value),'Use a short '+label+'.','API_MERCHANT_SETUP_CONFIGURATION');return value;
}
const SCHEMA='stellar-forge.sf101.api-merchant-mcp-setup.v1';
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function sync(path){const file=await open(path,constants.O_RDONLY);try{await file.sync();}finally{await file.close();}}
async function privateDirectory(path){try{await mkdir(path,{mode:0o700});await sync(dirname(path));}catch(error){if(error.code!=='EEXIST')throw error;}return apiMerchantPrivateDirectory(path);}
async function json(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readApiMerchantPrivateFile(path,1024*1024)));}
async function atomic(root,name,value){
 const temporary=join(root,'.'+name+'.next');await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
 await writePrivate(temporary,value);await rename(temporary,join(root,name));await sync(root);
}
async function originalStore(root,target){
 if(await exists(target)){await readReleaseState(target);return;}
 // Preserve incomplete original initializer attempts. A later invocation can
 // publish a complete original stage or complete a fresh original initializer.
 for(const item of await readdir(root,{withFileTypes:true})){
  if(!item.isDirectory()||!/^release-setup-[a-f0-9-]{36}$/.test(item.name))continue;
  const stage=join(root,item.name);let state;
  try{state=await readReleaseState(stage);}catch{continue;}
  apiMerchantNeed(state.generation===0&&state.active===null&&state.previous===null&&state.history.length===0&&(await readdir(join(stage,'releases'))).length===0,'An unpublished setup stage contains original release activity. Preserve it and select the intended merchant store.','API_MERCHANT_SETUP_STORE_CHANGED');
  await rename(stage,target);await sync(root);return;
 }
 const stage=join(root,'release-setup-'+randomUUID());
 await initReleaseStore(stage);await readReleaseState(stage);await rename(stage,target);await sync(root);
}
/** Existing exact configuration is reopened; interrupted own setup is completed. */
export async function initializeApiMerchantWorkspaceMerchant({directory,connection,name='API merchant console',releaseStore}={}){
 const root=apiMerchantHostPath(directory),apiMerchantWorkspaceConnection=apiMerchantHostPath(connection),selectedStore=releaseStore===undefined?join(root,'releases'):apiMerchantHostPath(releaseStore);
 name=apiMerchantText(name,160,'merchant name');
 const configured=await readApiMerchantWorkspaceConfiguration(apiMerchantWorkspaceConnection);
 await apiMerchantPrivateDirectory(dirname(root));await privateDirectory(root);let lease;
 try{lease=await acquireStateLease(root);}catch(error){
  if(error.message==='FLEET_STATE_ALREADY_OWNED')throw apiMerchantFailure('API_MERCHANT_SETUP_BUSY','Another process owns this exact merchant setup.');
  throw apiMerchantFailure('API_MERCHANT_SETUP_LEASE_UNAVAILABLE','The original setup requires its native Linux flock lease.');
 }
 try{
  const {CONFIG_SCHEMA,readMerchantConfig}=await import('./config.mjs'),configuration=join(root,'merchant-mcp.json'),marker=join(root,'api-merchant-setup.json');
  const intent={schema:SCHEMA,connection:apiMerchantWorkspaceConnection,releaseStore:selectedStore,name};
  if(await exists(marker))apiMerchantNeed(apiMerchantFingerprint(await json(marker))===apiMerchantFingerprint(intent),'This private setup directory belongs to another connection, merchant name or release store.','API_MERCHANT_SETUP_CHANGED');
  else{
   const allowed=new Set(['lease.lock','merchant-mcp.json','.api-merchant-setup.json.next']);
   const entries=await readdir(root);
   apiMerchantNeed(entries.every(entry=>allowed.has(entry)),'Select this initializer’s own existing directory or a new private merchant directory.','API_MERCHANT_SETUP_DIRECTORY_IN_USE');
   if(await exists(configuration)){
    const raw=await json(configuration);
    apiMerchantNeed(raw.schema===CONFIG_SCHEMA&&apiMerchantHostPath(raw.apiMerchantWorkspaceConnection,root)===apiMerchantWorkspaceConnection&&apiMerchantHostPath(raw.releaseStore,root)===selectedStore,'The existing merchant configuration belongs to another original connection or store.','API_MERCHANT_SETUP_CHANGED');
   }
   lease.assertHeld();await atomic(root,'api-merchant-setup.json',intent);
  }
  if(releaseStore===undefined)await originalStore(root,selectedStore);else await readReleaseState(selectedStore);
  await privateDirectory(join(root,'merchant-exports'));
  const reopening=Boolean(await exists(configuration));
  if(reopening){
   const raw=await json(configuration);
   apiMerchantNeed(raw.schema===CONFIG_SCHEMA&&apiMerchantHostPath(raw.apiMerchantWorkspaceConnection,root)===apiMerchantWorkspaceConnection&&apiMerchantHostPath(raw.releaseStore,root)===selectedStore,'The existing merchant configuration points to different original sources.','API_MERCHANT_SETUP_CHANGED');
  }else{
   lease.assertHeld();await atomic(root,'merchant-mcp.json',{schema:CONFIG_SCHEMA,name,releaseStore:selectedStore,exportsDirectory:'./merchant-exports',sources:{},apiMerchantWorkspaceConnection});
  }
  const current=await readMerchantConfig(configuration);
  apiMerchantNeed(current.apiMerchantWorkspaces?.workspaces,'The installed original merchant source must include the API merchant connection reader.','API_MERCHANT_HOST_SOURCE_REQUIRED');
  return {schema:CONFIG_SCHEMA,configuration,state:reopening?'REOPENED':'INITIALIZED',apiMerchantWorkspacesConfigured:true,
   workspaces:Object.entries(configured.workspaces).map(([workspace,entry])=>({workspace,label:entry.label,workspaceId:entry.workspaceId})),ownership:'ORIGINAL_API_MERCHANT_CONSOLE_AND_EXPORTS'};
 }finally{await lease.close();}
}
