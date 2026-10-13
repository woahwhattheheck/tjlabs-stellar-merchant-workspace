// SPDX-License-Identifier: MIT
// The original Applications/CLI host owns the workspace; this provider borrows it.
import {resolve,dirname,join} from 'node:path';
import {realpath,lstat} from 'node:fs/promises';
import {readOwned} from '../stellar-expert/store.mjs';
import {connectPirateWeather} from './client.mjs';
import {absolute} from './managed.mjs';
import {need,exact,uuid,sha,object} from './contract.mjs';
export const OPERATOR_SCHEMA='stellar-forge.pirate-weather-operator.v1';
const alias=v=>need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'PIRATE_ALIAS','Choose a host-selected workspace alias.');
export async function readPirateOperatorConfiguration(path){
 absolute(path);const value=JSON.parse(await readOwned(path,262144));exact(value,['schema','workspaces'],['schema','workspaces']);
 need(value.schema===OPERATOR_SCHEMA&&object(value.workspaces)&&Object.keys(value.workspaces).length>0&&Object.keys(value.workspaces).length<=32,
  'PIRATE_OPERATOR_CONFIGURATION','Use a private host-selected workspace configuration.');
 const workspaces=Object.create(null);
 for(const [name,v]of Object.entries(value.workspaces)){
  alias(name);exact(v,['connectionFile','workspaceId','configurationSha256','sourceSha256','projectInputsDirectory','label'],['connectionFile','workspaceId','configurationSha256','sourceSha256']);
  workspaces[name]={connectionFile:absolute(resolve(dirname(path),v.connectionFile)),workspaceId:uuid(v.workspaceId),
   configurationSha256:sha(v.configurationSha256),sourceSha256:sha(v.sourceSha256),label:v.label??name,
   projectInputsDirectory:v.projectInputsDirectory?absolute(resolve(dirname(path),v.projectInputsDirectory)):null};
  const selected=workspaces[name].projectInputsDirectory;if(selected)need(await realpath(selected)===selected&&(await lstat(selected)).isDirectory(),'PIRATE_PROJECT_INPUT_DIRECTORY','Use the canonical host-selected project input directory.');
 }return {schema:OPERATOR_SCHEMA,workspaces};
}
export class MerchantPirateWeather{
 #config;#entries=new Map();#opening=new Map();#closed=false;#closing=null;
 constructor(config){need(config?.schema===OPERATOR_SCHEMA,'PIRATE_OPERATOR_CONFIGURATION','Supply the original host-selected configuration.');this.#config=config;}
 get summary(){return {schema:OPERATOR_SCHEMA,workspaces:Object.entries(this.#config.workspaces).map(([workspace,v])=>({workspace,label:v.label,workspaceId:v.workspaceId,configurationSha256:v.configurationSha256,sourceSha256:v.sourceSha256,
  connected:this.#entries.has(workspace),instanceId:this.#entries.get(workspace)?.client.identity.instanceId??null}))};}
 async #connect(name){
  need(!this.#closed,'PIRATE_OPERATOR_CLOSED','This operator connection is closing.');alias(name);
  if(this.#entries.has(name))return {workspace:name,...this.#entries.get(name).client.identity};
  if(this.#opening.has(name))return this.#opening.get(name);
  const run=(async()=>{const selected=this.#config.workspaces[name];need(selected,'PIRATE_ALIAS','Choose a configured original workspace.');
   const client=await connectPirateWeather({connectionFile:selected.connectionFile,expectedWorkspaceId:selected.workspaceId,expectedSourceSha256:selected.sourceSha256});
   try{need(!this.#closed&&client.identity.configurationSha256===selected.configurationSha256,'PIRATE_OPERATOR_BINDING_CHANGED','The original provider configuration changed.',409);
    const entry={name,client,closing:false,pending:new Set()};this.#entries.set(name,entry);return {workspace:name,...client.identity};}
   catch(e){await client.close();throw e;}})();
  this.#opening.set(name,run);try{return await run;}finally{this.#opening.delete(name);}
 }
 async #disconnect(entry){
  if(!entry)return {disconnected:true};entry.closing=true;
  await entry.client.close();await Promise.allSettled([...entry.pending]);this.#entries.delete(entry.name);
  return {workspace:entry.name,disconnected:true,processOwner:'original Applications or CLI host'};
 }
 async call(name,args={}){
  need(object(args),'PIRATE_PARAMETERS','Supply the named original tool arguments.');
  if(name==='merchant_pirate_workspaces')return this.summary;
  if(name==='merchant_pirate_connect')return this.#connect(args.workspace);
  const entry=this.#entries.get(args.workspace);
  need(entry&&!entry.closing&&entry.client.identity.instanceId===args.instanceId,'PIRATE_CONNECTION_REQUIRED','Connect to the original current workspace instance.',409);
  if(name==='merchant_pirate_disconnect')return this.#disconnect(entry);
  need(!this.#closed,'PIRATE_OPERATOR_CLOSED','This operator is closing.');
  const {workspace,instanceId,...input}=args;
  const work=(async()=>{
   if(name==='merchant_pirate_state')return entry.client.state();
   if(name==='merchant_pirate_read')return entry.client.read(input.method,input.input??{});
   if(name==='merchant_pirate_action')return entry.client.act(input);
   if(name==='merchant_pirate_recover')return entry.client.recover(input.operationId);
   if(name==='merchant_pirate_resume')return entry.client.resume(input.operationId);
   if(name==='merchant_pirate_file_read')return entry.client.readFile(input);
   if(name==='merchant_pirate_file_release')return entry.client.releaseFile(input.readId);
   if(name==='merchant_pirate_project_open')return entry.client.openReceived(input.operationId);
   if(name==='merchant_pirate_project_upload'){
    const root=this.#config.workspaces[workspace].projectInputsDirectory;
    need(root&&typeof input.filename==='string'&&/^[A-Za-z0-9][A-Za-z0-9._ -]{0,239}\.zip$/.test(input.filename),
     'PIRATE_PROJECT_INPUT','Select a ZIP basename within the host-configured project input directory.');
    need(await realpath(root)===root,'PIRATE_PROJECT_INPUT_DIRECTORY','The host-selected input directory changed.',409);
    return entry.client.uploadProject({path:join(root,input.filename),id:input.id,expectedSha256:input.expectedSha256});
   }
   throw Object.assign(Error('Unknown original Pirate Weather tool.'),{code:'PIRATE_TOOL_NOT_FOUND'});
  })();entry.pending.add(work);try{return await work;}finally{entry.pending.delete(work);}
 }
 close(){if(this.#closing)return this.#closing;this.#closed=true;return this.#closing=(async()=>{await Promise.allSettled([...this.#opening.values()]);
  const results=await Promise.allSettled([...this.#entries.values()].map(x=>this.#disconnect(x))),errors=results.filter(x=>x.status==='rejected');
  if(errors.length){this.#closing=null;throw new AggregateError(errors.map(x=>x.reason),'The original retained readers are still closing.');}})();}
}
