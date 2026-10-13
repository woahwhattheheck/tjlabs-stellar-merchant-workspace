// SPDX-License-Identifier: MIT
import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute} from 'node:path';
import {inspectWorkspaceIdentity,readOwned} from '../stellar-expert/store.mjs';
import {WORKSPACE_SCHEMA,SOURCE_ROOT,configuration,identity,hash,need,UUID,SHA} from './contract.mjs';
export const STARTUP_SCHEMA='stellar-forge.pirate-weather-startup.v1';
export const CONNECTION_SCHEMA='stellar-forge.pirate-weather-connection.v1';
export const SOURCE_FILES=Object.freeze(['contract.mjs','provider.mjs','reports.mjs','dataset.mjs','core.mjs','package.mjs','portable.py',
 'source-files.json','managed.mjs','server.mjs','cli.mjs','client.mjs','client.d.mts','operator.mjs','operator-tools.mjs','operator-provider.mjs','application-provider.mjs',
 'browser-assets.json','public/index.html','public/app.mjs','public/style.css','README.md','OPERATING.md','SOURCE_CONTRACT.md']);
export function absolute(value){
 need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','PIRATE_ABSOLUTE_PATH','Use an explicit canonical absolute host path.');return value;
}
export async function inspectPirateSource(directory=fileURLToPath(new URL('.',import.meta.url)),expected){
 directory=await realpath(resolve(directory));const files=[];
 for(const path of SOURCE_FILES){
  const name=join(directory,path),before=await lstat(name);
  need(before.isFile()&&!before.isSymbolicLink()&&before.size<=2*1024*1024&&await realpath(name)===name,'PIRATE_SOURCE_FILE_INVALID','The selected application source is incomplete or changed.',409);
  const data=await readFile(name),after=await lstat(name);
  need(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&data.length===before.size,'PIRATE_SOURCE_CHANGED','The application changed during reading.',409);
  files.push({path,bytes:data.length,sha256:hash(data)});
 }
 const sha256=identity(files);if(expected!==undefined)need(sha256===expected,'PIRATE_APPLICATION_CHANGED','Open the exact selected application edition.',409);
 return {directory,sourceRoot:SOURCE_ROOT,sha256,files};
}
export async function inspectPirateIdentity(directory,expected){
 const selected=await inspectWorkspaceIdentity(absolute(directory),{schema:WORKSPACE_SCHEMA}),state=JSON.parse(await readOwned(join(directory,'workspace.json'),64*1024*1024));
 const configurationSha256=identity(configuration(state.providerReference));
 if(expected!==undefined)need(configurationSha256===expected,'PIRATE_CONFIGURATION_CHANGED','The original provider reference changed.',409);
 return {...selected,configurationSha256};
}
export function privateOrigin(value){
 let url;try{url=new URL(value);}catch{}
 need(url&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)>0&&Number(url.port)<=65535&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/',
 'PIRATE_PRIVATE_ORIGIN','Use the original loopback workspace connection.');return url.origin;
}
export async function readPirateConnection(path){
 const binding=JSON.parse(await readOwned(absolute(path),262144));
 need(binding.schema===CONNECTION_SCHEMA&&UUID.test(binding.workspaceId??'')&&UUID.test(binding.instanceId??'')&&SHA.test(binding.configurationSha256??'')&&
   SHA.test(binding.sourceIdentity?.sha256??'')&&/^[A-Za-z0-9_-]{43}$/.test(binding.token??''),'PIRATE_CONNECTION_CHANGED','Open the original current workspace connection.',409);
 privateOrigin(binding.origin);return binding;
}
export async function operatorJSON(binding,path,{method='GET',body,signal,timeoutMs=330000}={}){
 const origin=privateOrigin(binding.origin);need(path.startsWith('/api/')&&!path.startsWith('//'),'PIRATE_OPERATOR_PATH','Choose an original workspace route.');
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,timeoutMs);
 try{
  const response=await fetch(origin+path,{method,headers:{authorization:'Bearer '+binding.token,...(body===undefined?{}:{'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal,redirect:'manual'});
  need(response.headers.get('x-pirate-instance')===binding.instanceId,'PIRATE_INSTANCE_CHANGED','The workspace listener changed. Reconnect to its saved identity.',409);
  const pieces=[];let length=0;for await(const part of response.body){length+=part.length;need(length<=32*1024*1024,'PIRATE_REPLY_CAPACITY','Read the paged original view.');pieces.push(Buffer.from(part));}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(pieces)));
  if(!response.ok)throw Object.assign(new Error(value.message??value.error??'The original workspace request failed.'),{code:value.error??'PIRATE_OPERATOR_FAILED',status:response.status,operationId:value.operationId,currentRevision:value.currentRevision});
  return value;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function verifyPirateConnection(binding){
 const actual=await operatorJSON(binding,'/api/identity',{timeoutMs:15000});
 need(actual.workspaceId===binding.workspaceId&&actual.configurationSha256===binding.configurationSha256&&actual.instanceId===binding.instanceId&&actual.sourceIdentity?.sha256===binding.sourceIdentity.sha256,
 'PIRATE_CONNECTION_IDENTITY','The observed original workspace identity differs.',409);return actual;
}
