// SPDX-License-Identifier: MIT
// Registration and original-child observation in the maintained Applications host.
import { join } from 'node:path';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, applicationPreparation, observeApplicationStartup } from '../../distribution/runtime-workspace/application-provider.mjs';
import { absolute, plain, need, processIdentity } from '../../distribution/runtime-workspace/storage.mjs';
import { namespaceProcessIdentity } from '../../distribution/runtime-workspace/process-identity.mjs';
import { reviewA2AInputs } from './managed-launch.mjs';
import { A2A_STARTUP_SCHEMA, A2A_PROBE_SCHEMA, A2A_LAUNCH_FILE } from './server.mjs';
import { readVerifiedFile, canonical, sha } from './foundation.mjs';

const SOURCE='stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/';
const same=(a,b)=>canonical(a)===canonical(b);
const originalIdentity=async pid=>await processIdentity(pid)??await namespaceProcessIdentity(pid);
export function a2aApplication(common=[]){
  return{id:'a2a',command:'a2a',title:'A2A agent task workspace',terminal:false,requiredSource:SOURCE+'managed-launch.mjs',description:'Review an original agent, retain native messages, tasks and artifacts, and publish a complete source-bound result edition through the existing seller.',fields:[
    {name:'workspaceDirectory',label:'Private task workspace',type:'path',required:true,description:'Reopen the original SQLite history or select an existing private parent for a new workspace.'},
    {name:'connectionFile',label:'Host connection JSON',type:'path',required:true,description:'Explicit agent origins and environment credential references. Credentials stay on the selected host.'},...common]};
}
export async function prepareA2AApplication(settings,{inputPath,runtimeDirectory}){
  const directory=absolute(settings.workspaceDirectory),connectionFile=absolute(settings.connectionFile);
  const folder=await inputPath(directory,'directory',true,true),connection=await inputPath(connectionFile,'file',false,true);
  const selected=reviewA2AInputs({directory,connectionFile,optional:true}),runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false}),inputs=[folder,connection];
  for(const name of ['cli.mjs','server.mjs','workspace.mjs','managed-launch.mjs','transport.mjs','schema.sql'])inputs.push(await inputPath(join(runtime.sourceRoot,SOURCE,name),'file'));
  if(selected.identity)inputs.push(await inputPath(selected.identity.path,'file',false,true));
  return{args:['workspace','--workspace',directory,'--connections',connectionFile,'--expected-workspace-identity',selected.identity?.sha256??'new','--expected-connections-sha256',selected.connectionSha256],inputs,createDirectories:folder.exists?[]:[directory]};
}
function option(request,name,optional=false){const positions=request.args.flatMap((x,i)=>x===name?[i]:[]);if(optional&&!positions.length)return null;need(positions.length===1&&typeof request.args[positions[0]+1]==='string','APPLICATION_A2A_ARGS');return request.args[positions[0]+1];}
async function probe(origin,token){
  const response=await fetch(new URL('/api/application',origin),{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(5000)});
  need(response.ok&&response.headers.get('content-type')?.startsWith('application/json'),'APPLICATION_A2A_LISTENER');
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;need(bytes<=16384,'APPLICATION_A2A_PROBE_LIMIT');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function a2aStartup(request,directory,text,context={}){
  if(request.command!=='a2a'||request.args?.[0]!=='workspace'||!request.applicationId||text.length>16384)return null;
  let value;try{value=JSON.parse(text);}catch{return null;}
  if(!plain(value)||value.schema!==A2A_STARTUP_SCHEMA||value.status!=='A2A_WORKSPACE_READY')return null;
  absolute(directory);
  const workspace=absolute(option(request,'--workspace')),connectionFile=absolute(option(request,'--connections')),selected=reviewA2AInputs({directory:workspace,connectionFile});
  need(option(request,'--expected-connections-sha256')===selected.connectionSha256&&value.connectionFileSha256===selected.connectionSha256&&value.workspaceId===selected.identity.workspaceId,'APPLICATION_A2A_INPUT_CHANGED');
  const expected=option(request,'--expected-workspace-identity');need(expected==='new'||expected===selected.identity.sha256,'APPLICATION_A2A_WORKSPACE_CHANGED');
  const saved=JSON.parse(readVerifiedFile(join(workspace,A2A_LAUNCH_FILE),16384)),{token,...publicSaved}=saved;
  need(typeof token==='string'&&/^[A-Za-z0-9_-]{40,64}$/.test(token)&&same(publicSaved,value),'APPLICATION_A2A_RECEIPT_CHANGED');
  need(Number.isSafeInteger(context.pid)&&context.pid>0&&plain(value.process)&&(value.process.pid===context.pid||value.process.ppid===context.pid)&&value.process.start===await originalIdentity(value.process.pid)&&await originalIdentity(context.pid),'APPLICATION_A2A_CHILD_CHANGED');
  const port=Number(option(request,'--port',true)??0),url=new URL(value.url);
  need(Number.isInteger(port)&&port>=0&&port<=65535&&url.origin===value.url&&value.origin===value.url&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&(!port||Number(url.port)===port),'APPLICATION_A2A_ORIGIN_CHANGED');
  const observed=await probe(value.origin,token);
  need(observed.schema===A2A_PROBE_SCHEMA&&observed.workspaceId===value.workspaceId&&observed.launchId===value.launchId&&observed.connectionFileSha256===value.connectionFileSha256&&observed.origin===value.origin&&same(observed.process,value.process),'APPLICATION_A2A_PROBE_CHANGED');
  return{url:value.url,original:{schema:A2A_STARTUP_SCHEMA,launchId:value.launchId,workspaceId:value.workspaceId,connectionFileSha256:value.connectionFileSha256,process:value.process}};
}
export default{
  schema:APPLICATION_PROVIDER_SCHEMA,id:'a2a',order:191,
  catalog({common}){return[a2aApplication(common)];},
  async prepare(type,settings,context){const prepared=applicationPreparation(settings,context.inputPath),original=await prepareA2AApplication(settings,context);prepared.args.push(...original.args);prepared.inputs.push(...original.inputs);prepared.createDirectories.push(...original.createDirectories);return{args:prepared.args,inputs:prepared.inputs,createDirectories:prepared.createDirectories};},
  matchRequest(request){return!request.pythonCommand&&request.command==='a2a'&&request.args?.[0]==='workspace';},
  createObserver(request,directory,context){return observeApplicationStartup(request,directory,text=>{let v;try{v=JSON.parse(text);}catch{return null;}return v?.schema===A2A_STARTUP_SCHEMA?()=>a2aStartup(request,directory,text,context):null;});}
};
