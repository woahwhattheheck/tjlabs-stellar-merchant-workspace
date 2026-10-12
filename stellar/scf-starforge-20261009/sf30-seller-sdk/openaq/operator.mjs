// SPDX-License-Identifier: MIT
// Typed merchant tools borrow an existing Applications/CLI listener. They never own the original project process.
import { dirname, resolve } from 'node:path';
import { readJson, absolute, object } from '../postgres/publisher/files.mjs';
import { readOpenAQConnection, verifyOpenAQConnection, operatorJSON } from './managed.mjs';
import { need, UUID, HASH } from './contract.mjs';
import { TOOL_ACTIONS, TOOL_READS } from './operator-tools.mjs';
export { openaqMerchantTools } from './operator-tools.mjs';
export const OPERATOR_SCHEMA='stellar-forge.openaq-operator.v1';
const alias=v=>need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'OPENAQ_ALIAS_INVALID');
export async function readOpenAQOperatorConfiguration(path){
 path=absolute(path);const raw=await readJson(path,262144);
 need(raw.schema===OPERATOR_SCHEMA&&object(raw.workspaces)&&Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=32&&Object.keys(raw).every(k=>['schema','workspaces'].includes(k)),'OPENAQ_OPERATOR_CONFIGURATION_INVALID');
 const workspaces=Object.create(null);
 for(const[name,v]of Object.entries(raw.workspaces)){
  alias(name);need(object(v)&&Object.keys(v).every(k=>['connectionFile','workspaceId','configurationSha256','label'].includes(k))&&UUID.test(v.workspaceId??'')&&HASH.test(v.configurationSha256??''),'OPENAQ_OPERATOR_BINDING_REQUIRED');
  workspaces[name]={label:v.label??name,connectionFile:absolute(resolve(dirname(path),v.connectionFile)),workspaceId:v.workspaceId,configurationSha256:v.configurationSha256};
 }
 return {schema:OPERATOR_SCHEMA,workspaces};
}
export class MerchantOpenAQ{
 #config;#entries=new Map();#opening=new Map();#closed=false;#closing=null;
 constructor(config){need(config?.schema===OPERATOR_SCHEMA,'OPENAQ_OPERATOR_CONFIGURATION_REQUIRED');this.#config=config;}
 get summary(){return{schema:OPERATOR_SCHEMA,workspaces:Object.entries(this.#config.workspaces).map(([workspace,v])=>({workspace,label:v.label,workspaceId:v.workspaceId,configurationSha256:v.configurationSha256,connected:this.#entries.has(workspace),instanceId:this.#entries.get(workspace)?.binding.instanceId??null}))};}
 async #connect(name){
  need(!this.#closed,'OPENAQ_OPERATOR_CLOSED');alias(name);
  if(this.#entries.has(name)){const e=this.#entries.get(name);need(!e.closing,'OPENAQ_DISCONNECT_PENDING');await verifyOpenAQConnection(e.binding);return this.#binding(e);}
  if(this.#opening.has(name))return this.#opening.get(name);
  const run=(async()=>{const selected=this.#config.workspaces[name];need(selected,'OPENAQ_ALIAS_NOT_FOUND');const binding=await readOpenAQConnection(selected.connectionFile);
   need(binding.workspaceId===selected.workspaceId&&binding.configurationSha256===selected.configurationSha256,'OPENAQ_OPERATOR_BINDING_CHANGED',undefined,409);
   await verifyOpenAQConnection(binding);need(!this.#closed,'OPENAQ_OPERATOR_CLOSED');
   const e={name,binding,pending:new Set(),controllers:new Set(),reads:new Set(),closing:false};this.#entries.set(name,e);return this.#binding(e);
  })();this.#opening.set(name,run);try{return await run;}finally{this.#opening.delete(name);}
 }
 #binding(e){return{workspace:e.name,workspaceId:e.binding.workspaceId,instanceId:e.binding.instanceId,configurationSha256:e.binding.configurationSha256,sourceSha256:e.binding.sourceIdentity.sha256};}
 #entry(args){const e=this.#entries.get(args.workspace);need(e&&!e.closing&&e.binding.instanceId===args.instanceId,'OPENAQ_CURRENT_CONNECTION_REQUIRED',undefined,409);return e;}
 async #work(e,fn){
  need(!this.#closed&&!e.closing,'OPENAQ_OPERATOR_CLOSED');
  const controller=new AbortController();e.controllers.add(controller);const p=Promise.resolve().then(()=>fn(controller.signal));e.pending.add(p);
  try{return await p;}finally{e.pending.delete(p);e.controllers.delete(controller);}
 }
 async #disconnect(e){
  e.closing=true;for(const c of e.controllers)c.abort();await Promise.allSettled([...e.pending]);
  const errors=[];for(const id of [...e.reads])try{await operatorJSON(e.binding,'/api/file-release',{method:'POST',body:{readId:id}});e.reads.delete(id);}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Original OpenAQ file handles remain owned; retry disconnect.');
  this.#entries.delete(e.name);return {workspace:e.name,disconnected:true,processOwner:'original Applications or CLI host'};
 }
 async call(name,args={}){
  need(object(args),'OPENAQ_PARAMETERS_REQUIRED');
  if(name==='merchant_openaq_workspaces')return this.summary;
  if(name==='merchant_openaq_connect')return this.#connect(args.workspace);
  if(name==='merchant_openaq_disconnect'){const selected=this.#entries.get(args.workspace);need(selected&&selected.binding.instanceId===args.instanceId,'OPENAQ_CURRENT_CONNECTION_REQUIRED',undefined,409);return this.#disconnect(selected);}
  const e=this.#entry(args);
  return this.#work(e,async signal=>{
   const{workspace,instanceId,...input}=args,post=(path,body)=>operatorJSON(e.binding,path,{method:'POST',body,signal});
   if(TOOL_READS[name])return post('/api/read',{action:TOOL_READS[name],input});
   if(TOOL_ACTIONS[name])return post('/api/action',{action:TOOL_ACTIONS[name],input:{...input,workspaceId:e.binding.workspaceId}});
   if(name==='merchant_openaq_resume'||name==='merchant_openaq_pause')return post(name==='merchant_openaq_resume'?'/api/resume':'/api/cancel',{...input,workspaceId:e.binding.workspaceId});
   if(name==='merchant_openaq_file_read'){
    if(input.readId)need(e.reads.has(input.readId),'OPENAQ_READER_NOT_OWNED');
    const result=await post('/api/file-read',input);if(result.readId)e.reads.add(result.readId);return result;
   }
   if(name==='merchant_openaq_file_release'){need(e.reads.has(input.readId),'OPENAQ_READER_NOT_OWNED');const result=await post('/api/file-release',input);e.reads.delete(input.readId);return result;}
   throw new Error('OPENAQ_TOOL_NOT_FOUND');
  });
 }
 close(){if(this.#closing)return this.#closing;this.#closed=true;this.#closing=(async()=>{await Promise.allSettled([...this.#opening.values()]);const results=await Promise.allSettled([...this.#entries.values()].map(e=>this.#disconnect(e)));const errors=results.filter(x=>x.status==='rejected');if(errors.length){this.#closing=null;throw new AggregateError(errors.map(x=>x.reason),'OpenAQ agent cleanup remains incomplete.');}})();return this.#closing;}
}
