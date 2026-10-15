// MIT. Initialize the maintained Merchant host around declared Hardware revision workspaces.
import {dirname,join,resolve} from 'node:path';
import {lstat} from 'node:fs/promises';
import {acquirePrivateDirectoryWriter} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/operations/history.mjs';
import {initReleaseStore,readReleaseState} from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import {privateDirectory,readJSON,writeJSON,need} from './host/io.mjs';
import {readHardwareConfiguration} from './mcp.mjs';
export async function initializeMerchant(options){
 need(options&&typeof options.directory==='string'&&typeof options.connection==='string','HARDWARE_SETUP','Choose the original merchant and Hardware revision configuration paths.');
 const directory=resolve(options.directory),connection=resolve(options.connection),name=options.name||'Hardware revision operator',selected=await readHardwareConfiguration(connection);
 need(typeof name==='string'&&name.trim()===name&&name.length>0&&name.length<=240,'HARDWARE_NAME','Use a readable merchant name.');
 need(Object.values(selected.workspaces).every(s=>s.directory!==directory),'HARDWARE_SETUP_CONFLICT','Give the merchant host its own private directory.');
 await privateDirectory(dirname(directory));await privateDirectory(directory,{create:true});const lease=await acquirePrivateDirectoryWriter(directory);
 try{
 const config=join(directory,'merchant-mcp.json'),value={schema:'stellar-forge.merchant-mcp.v1',name,releaseStore:'./releases',exportsDirectory:'./customer-exports',sources:{},hardwareConnection:connection};
 let prior;try{prior=(await readJSON(config)).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 need(!prior||JSON.stringify(prior)===JSON.stringify(value),'HARDWARE_SETUP_CHANGED','This merchant directory has a different selected configuration.',409);
 const releases=join(directory,'releases');let releaseExists=true;
 try{await lstat(releases);}catch(e){if(e.code!=='ENOENT')throw e;releaseExists=false;}
 if(releaseExists){await privateDirectory(releases);await readReleaseState(releases);}else await initReleaseStore(releases);
 await privateDirectory(join(directory,'customer-exports'),{create:true});if(!prior)await writeJSON(config,value);
 await(await import('../../stellar-forge/mcp-merchant-operator/config.mjs')).readMerchantConfig(config);
 return {configuration:config,state:'INITIALIZED',reused:!!prior,workspaces:Object.keys(selected.workspaces),connectionSha256:selected.sha256};
 }finally{await lease.release();}
}
