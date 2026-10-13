// SPDX-License-Identifier: MIT
// Saved Start/Open/Stop stays with the installed original Applications manager.
import { join, dirname } from 'node:path';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../distribution/runtime-workspace/application-provider.mjs';
import { STARTUP_SCHEMA, inspectPirateSource, inspectPirateIdentity, readPirateConnection, verifyPirateConnection } from './managed.mjs';
import { SOURCE_ROOT } from './contract.mjs';
import { need } from './contract.mjs';
function option(request,name,fallback){
 const found=request.args.flatMap((v,i)=>v===name?[i]:[]);if(!found.length&&fallback!==undefined)return fallback;
 need(found.length===1&&typeof request.args[found[0]+1]==='string','PIRATE_APPLICATION_ARGUMENT_CHANGED');return request.args[found[0]+1];
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'pirate-weather',order:1460,
 catalog({common,field}){return[{id:'pirate-weather',command:'pirate-weather',title:'Pirate Weather forecast reports',terminal:false,
  requiredSource:SOURCE_ROOT+'/cli.mjs',description:'Retain exact original forecasts, review 48-hour customer reports, publish the original dataset and receive complete projects.',
  fields:[field('workspaceDirectory','Initialized Pirate Weather project','path',true,'Create the private project once with pirate-weather init. The API key remains an environment reference.'),...common]}];},
 async prepare(_type,settings,{inputPath,runtimeDirectory}){
  const workspace=await inspectPirateIdentity(settings.workspaceDirectory),runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const source=await inspectPirateSource(join(runtime.sourceRoot,SOURCE_ROOT));
  const inputs=[await inputPath(workspace.directory,'directory',false,true),await inputPath(join(workspace.directory,'workspace.json'),'file')];
  for(const file of source.files){const v=await inputPath(join(source.directory,file.path),'file');need(v.sha256===file.sha256&&v.bytes===file.bytes,'PIRATE_APPLICATION_SOURCE_CHANGED');inputs.push(v);}
  return{args:['serve','--workspace',workspace.directory,'--expected-configuration',workspace.configurationSha256,'--expected-source',source.sha256,'--application-source',dirname(runtime.sourceRoot)],inputs,createDirectories:[]};
 },
 resourceKey(_type,settings,{hash}){return hash({family:'pirate-weather',directory:settings.workspaceDirectory});},
 matchRequest:request=>!request.pythonCommand&&request.command==='pirate-weather',
 async verifyLaunch(request){
  const selected=await inspectPirateIdentity(option(request,'--workspace'),option(request,'--expected-configuration'));
  await inspectPirateSource(join(request.releaseDirectory,'source',SOURCE_ROOT),option(request,'--expected-source'));return selected;
 },
 createObserver(request,directory){return observeApplicationStartup(request,directory,line=>{
  if(!line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",'))return null;
  return async()=>{
   const value=JSON.parse(line),selected=await inspectPirateIdentity(option(request,'--workspace'),option(request,'--expected-configuration'));
   need(value.state==='READY'&&value.workspaceId===selected.workspaceId&&value.configurationSha256===selected.configurationSha256&&value.sourceIdentity?.sha256===option(request,'--expected-source'),'PIRATE_STARTUP_CHANGED');
   const binding=await readPirateConnection(value.connectionFile);await verifyPirateConnection(binding);
   need(binding.instanceId===value.instanceId&&binding.workspaceId===selected.workspaceId&&binding.sourceIdentity.sha256===value.sourceIdentity.sha256,'PIRATE_STARTUP_CHANGED');
   const port=Number(option(request,'--port','0'));need(!port||Number(new URL(value.url).port)===port,'PIRATE_STARTUP_PORT_CHANGED');
   need(value.url===binding.origin+'/#token='+binding.token,'PIRATE_STARTUP_URL_CHANGED');
   return{url:value.url,workspaceId:selected.workspaceId,connectionFile:value.connectionFile,original:{schema:STARTUP_SCHEMA,
    workspaceId:selected.workspaceId,configurationSha256:selected.configurationSha256,instanceId:value.instanceId,sourceSha256:value.sourceIdentity.sha256}};
  };
 });}
};
