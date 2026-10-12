// SPDX-License-Identifier: MIT
import {join,resolve} from 'node:path';
import {inspectMerchantRuntime} from '../../../sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../../distribution/runtime-workspace/application-provider.mjs';
import {readConsoleConfiguration,SOURCE_ROOT,STARTUP_SCHEMA} from './config.mjs';
import {inspectConsoleSource,readCustomerConnection,verifyCustomerConnection} from './managed.mjs';
import {need} from '../files.mjs';
function option(request,name,fallback){
 const indices=request.args.flatMap((value,index)=>value===name?[index]:[]);
 if(!indices.length&&fallback!==undefined)return fallback;
 need(indices.length===1&&typeof request.args[indices[0]+1]==='string','OPENAQ_CUSTOMER_LAUNCH_CHANGED');
 return request.args[indices[0]+1];
}
export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:'openaq-customer',order:1431,
 catalog({common,field}){return [{id:'openaq-customer',command:'openaq-buyer-console',title:'OpenAQ customer studies',terminal:false,
  requiredSource:SOURCE_ROOT+'/cli.mjs',
  description:'Review a retained study, approve original Buyer pages, reconcile native accounting and receive complete customer deliveries.',
  fields:[field('workspaceDirectory','Initialized customer console','path',true,
   'Create the host selection once with openaq-buyer-console init. Select an existing original operator or a complete delivery directory.'),...common]}];},
 async prepare(_type,settings,{inputPath,runtimeDirectory}){
  const selected=await readConsoleConfiguration(settings.workspaceDirectory),runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const source=await inspectConsoleSource(join(runtime.sourceRoot,SOURCE_ROOT));
  const inputs=[await inputPath(selected.directory,'directory',false,true),
   await inputPath(join(selected.directory,'console.json'),'file')];
  for(const file of source.files){
   const value=await inputPath(resolve(source.directory,file.path),'file');
   need(value.bytes===file.bytes&&value.sha256===file.sha256,'OPENAQ_CUSTOMER_SOURCE_CHANGED');inputs.push(value);
  }
  return {args:['serve','--dir',selected.directory,'--expected-configuration',selected.configurationSha256,
   '--expected-source',source.sha256,'--startup-json'],inputs,createDirectories:[]};
 },
 resourceKey(_type,settings,{hash}){return hash({family:'openaq-customer',directory:settings.workspaceDirectory});},
 matchRequest:request=>!request.pythonCommand&&request.command==='openaq-buyer-console',
 async verifyLaunch(request){
  const selected=await readConsoleConfiguration(option(request,'--dir'),option(request,'--expected-configuration'));
  await inspectConsoleSource(join(request.releaseDirectory,'source',SOURCE_ROOT),option(request,'--expected-source'));return selected;
 },
 createObserver(request,directory){return observeApplicationStartup(request,directory,line=>{
  if(!line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",'))return null;
  return async()=>{
   const value=JSON.parse(line),selected=await readConsoleConfiguration(option(request,'--dir'),option(request,'--expected-configuration'));
   need(value.state==='READY'&&value.consoleId===selected.id&&value.configurationSha256===selected.configurationSha256&&
    value.sourceIdentity?.sha256===option(request,'--expected-source'),'OPENAQ_CUSTOMER_STARTUP_CHANGED');
   const binding=await readCustomerConnection(value.connectionFile);await verifyCustomerConnection(binding);
   need(binding.instanceId===value.instanceId&&binding.consoleId===selected.id&&
    binding.sourceIdentity.sha256===value.sourceIdentity.sha256&&value.url===binding.origin+'/#token='+binding.token,
   'OPENAQ_CUSTOMER_STARTUP_CHANGED');
   const port=Number(option(request,'--port','0'));need(!port||Number(new URL(value.url).port)===port,'OPENAQ_CUSTOMER_STARTUP_PORT_CHANGED');
   return {url:value.url,workspaceId:selected.id,connectionFile:value.connectionFile,original:{schema:STARTUP_SCHEMA,
    consoleId:selected.id,configurationSha256:selected.configurationSha256,instanceId:value.instanceId,sourceSha256:value.sourceIdentity.sha256}};
  };
 });}
};
