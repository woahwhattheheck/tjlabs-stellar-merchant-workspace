// MIT. Recoverable configuration for the original merchant host.
import { resolve, join, dirname } from 'node:path';
import { readdir, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initReleaseStore, readReleaseState } from '../../../sf82-seller-pilot/releases.mjs';
import { readCouchdbWorkspaceConfiguration } from './client.mjs';
import { only, need, text, digest, identity, readPrivate, readJson, privateDirectory, acquireWorkspace, retainJSON, exists, syncDirectory } from '../common.mjs';
async function originalStore(root,target){
  if(await exists(target)){await readReleaseState(target);return;}
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^release-setup-[a-f0-9-]{36}$/.test(entry.name))continue;
    const stage=join(root,entry.name);let state;try{state=await readReleaseState(stage);}catch{continue;}
    need(state.generation===0&&state.active===null&&state.previous===null&&state.history.length===0&&(await readdir(join(stage,'releases'))).length===0,'COUCHDB_SETUP_STORE_CHANGED');
    await rename(stage,target);await syncDirectory(root);return;
  }
  const stage=join(root,'release-setup-'+randomUUID());
  await initReleaseStore(stage);await readReleaseState(stage);await rename(stage,target);await syncDirectory(root);
}
export async function initializeCouchdbWorkspaceMerchant(options={}){
  only(options,['directory','connection','name','releaseStore'],'COUCHDB_SETUP_INPUT_INVALID');
  const root=resolve(text(options.directory)),connection=resolve(text(options.connection)),name=text(options.name??'CouchDB merchant',160);
  const configured=await readCouchdbWorkspaceConfiguration(connection),connectionSha256=digest(await readPrivate(connection,1048576));
  const releaseStore=options.releaseStore===undefined?join(root,'releases'):resolve(text(options.releaseStore));
  await privateDirectory(dirname(root));await privateDirectory(root,true);const unlock=await acquireWorkspace(root);
  try{
    const marker=join(root,'couchdb-setup.json'),configuration=join(root,'merchant-mcp.json');
    const intent={schema:'stellar-forge.couchdb-agent-setup.v1',connection,connectionSha256,name,releaseStore};
    if(await exists(marker))need(identity(await readJson(marker))===identity(intent),'COUCHDB_SETUP_CHANGED');
    else{
      need((await readdir(root)).every(name=>name==='publisher.lock'||name==='.couchdb-setup.json.couchdb-pending'),'COUCHDB_SETUP_DIRECTORY_IN_USE');
      await retainJSON(marker,intent);
    }
    if(options.releaseStore===undefined)await originalStore(root,releaseStore);else await readReleaseState(releaseStore);
    await privateDirectory(join(root,'customer-exports'),true);
    const record={schema:'stellar-forge.merchant-mcp.v1',name,releaseStore,exportsDirectory:'./customer-exports',sources:{},couchdbWorkspaceConnection:connection};
    const reopened=Boolean(await exists(configuration));await retainJSON(configuration,record);
    const {readMerchantConfig}=await import('../../../../../stellar-forge/mcp-merchant-operator/config.mjs');
    const current=await readMerchantConfig(configuration);need(current.couchdbWorkspaces?.workspaces,'COUCHDB_PROVIDER_SOURCE_REQUIRED');
    return {schema:record.schema,configuration,releaseStore,state:reopened?'REOPENED':'INITIALIZED',ownership:'ORIGINAL_COUCHDB_WORKSPACE',
      workspaces:Object.entries(configured.workspaces).map(([workspace,value])=>({workspace,workspaceId:value.workspaceId,label:value.label}))};
  }finally{await unlock();}
}
