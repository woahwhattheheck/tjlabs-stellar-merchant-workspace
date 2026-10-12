// SPDX-License-Identifier: MIT
// Saved Start/Open/Stop stays with the installed original Applications manager.
import { join } from 'node:path';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../../distribution/runtime-workspace/application-provider.mjs';
import { OPENAQ_SOURCE, STARTUP_SCHEMA, inspectOpenAQSource, inspectOpenAQWorkspace, readOpenAQConnection, verifyOpenAQConnection } from './managed.mjs';
import { need } from './contract.mjs';
function option(request,name,fallback){
 const found=request.args.flatMap((v,i)=>v===name?[i]:[]);if(!found.length&&fallback!==undefined)return fallback;
 need(found.length===1&&typeof request.args[found[0]+1]==='string','OPENAQ_APPLICATION_ARGUMENT_CHANGED');return request.args[found[0]+1];
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'openaq-studies',order:1430,
 catalog({common,field}){return[{id:'openaq-studies',command:'openaq',title:'OpenAQ station studies',terminal:false,
  requiredSource:OPENAQ_SOURCE+'/cli.mjs',description:'Capture attributed source editions, review station-period reports, publish the original dataset and receive complete customer studies.',
  fields:[field('workspaceDirectory','Initialized OpenAQ project','path',true,'Create the private project once with openaq init. Its key remains a host environment reference.'),...common]}];},
 async prepare(_type,settings,{inputPath,runtimeDirectory}){
  const workspace=await inspectOpenAQWorkspace(settings.workspaceDirectory),runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const source=await inspectOpenAQSource(join(runtime.sourceRoot,OPENAQ_SOURCE));
  const inputs=[await inputPath(workspace.directory,'directory',false,true),await inputPath(join(workspace.directory,'workspace.json'),'file')];
  for(const file of source.files){const v=await inputPath(join(source.directory,file.path),'file');need(v.sha256===file.sha256&&v.bytes===file.bytes,'OPENAQ_APPLICATION_SOURCE_CHANGED');inputs.push(v);}
  return{args:['serve','--workspace',workspace.directory,'--expected-configuration',workspace.configurationSha256,'--expected-source',source.sha256,'--startup-json'],inputs,createDirectories:[]};
 },
 resourceKey(_type,settings,{hash}){return hash({family:'openaq-studies',directory:settings.workspaceDirectory});},
 matchRequest:request=>!request.pythonCommand&&request.command==='openaq',
 async verifyLaunch(request){
  const selected=await inspectOpenAQWorkspace(option(request,'--workspace'),option(request,'--expected-configuration'));
  await inspectOpenAQSource(join(request.releaseDirectory,'source',OPENAQ_SOURCE),option(request,'--expected-source'));return selected;
 },
 createObserver(request,directory){return observeApplicationStartup(request,directory,line=>{
  if(!line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",'))return null;
  return async()=>{
   const value=JSON.parse(line),selected=await inspectOpenAQWorkspace(option(request,'--workspace'),option(request,'--expected-configuration'));
   need(value.state==='READY'&&value.workspaceId===selected.workspaceId&&value.configurationSha256===selected.configurationSha256&&value.sourceIdentity?.sha256===option(request,'--expected-source'),'OPENAQ_STARTUP_CHANGED');
   const binding=await readOpenAQConnection(value.connectionFile);await verifyOpenAQConnection(binding);
   need(binding.instanceId===value.instanceId&&binding.workspaceId===selected.workspaceId&&binding.sourceIdentity.sha256===value.sourceIdentity.sha256,'OPENAQ_STARTUP_CHANGED');
   const port=Number(option(request,'--port','0'));need(!port||Number(new URL(value.url).port)===port,'OPENAQ_STARTUP_PORT_CHANGED');
   need(value.url===binding.origin+'/#token='+binding.token,'OPENAQ_STARTUP_URL_CHANGED');
   return{url:value.url,workspaceId:selected.workspaceId,connectionFile:value.connectionFile,original:{schema:STARTUP_SCHEMA,
    workspaceId:selected.workspaceId,configurationSha256:selected.configurationSha256,instanceId:value.instanceId,sourceSha256:value.sourceIdentity.sha256}};
  };
 });}
};
