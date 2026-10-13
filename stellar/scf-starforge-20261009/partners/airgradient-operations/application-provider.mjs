// SPDX-License-Identifier: MIT
import {join,dirname} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../distribution/runtime-workspace/application-provider.mjs';
import {inspectWorkspace} from './workspace.mjs';
import {STARTUP_SCHEMA,readConnection,verifyConnectionFile} from './server.mjs';
import {need,SOURCE} from './contract.mjs';
function option(request,name,fallback){
 const indices=request.args.flatMap((v,i)=>v===name?[i]:[]);if(!indices.length&&fallback!==undefined)return fallback;
 need(indices.length===1&&typeof request.args[indices[0]+1]==='string','APPLICATION_ARGUMENT_CHANGED');return request.args[indices[0]+1];
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'airgradient-operations',order:1530,
 catalog({common,field}){return [{id:'airgradient-operations',command:'airgradient-operations',title:'AirGradient customer operations',terminal:false,requiredSource:SOURCE+'/cli.mjs',
  description:'Acquire a complete customer location study, compare later report editions, deliver the usable package and receive it into an independent editable workspace.',
  fields:[field('workspaceDirectory','Customer workspace','path',true,'Initialise the private customer workspace once with airgradient-operations init. Continue this same workspace for later editions.'),...common]}];},
 async prepare(_type,settings,{inputPath}){
  const selected=await inspectWorkspace(settings.workspaceDirectory);
  return {args:['serve','--workspace',selected.directory,'--expected-configuration',selected.configurationSha256],
   inputs:[await inputPath(selected.directory,'directory',false,true),await inputPath(join(selected.directory,'workspace.json'),'file',false,true)],createDirectories:[]};
 },
 resourceKey(_type,settings,{hash}){return hash({family:'airgradient-customer-operations',directory:settings.workspaceDirectory});},
 matchRequest:request=>!request.pythonCommand&&request.command==='airgradient-operations',
 async verifyLaunch(request){const selected=await inspectWorkspace(option(request,'--workspace'));need(selected.configurationSha256===option(request,'--expected-configuration'),'APPLICATION_WORKSPACE_CHANGED');return selected;},
 createObserver(request,directory){return observeApplicationStartup(request,directory,line=>{
  if(!line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",'))return null;
  return async()=>{
   const value=JSON.parse(line),selected=await inspectWorkspace(option(request,'--workspace'));need(selected.configurationSha256===option(request,'--expected-configuration'),'APPLICATION_WORKSPACE_CHANGED');
   need(value.state==='READY'&&value.workspaceId===selected.workspaceId&&value.configurationSha256===selected.configurationSha256&&dirname(value.connectionFile)===selected.directory,'APPLICATION_STARTUP_CHANGED');
   const connection=await readConnection(value.connectionFile);await verifyConnectionFile(connection);
   need(connection.workspaceId===selected.workspaceId&&connection.configurationSha256===selected.configurationSha256&&connection.instanceId===value.instanceId&&value.url===connection.origin+'/connect/'+connection.token,'APPLICATION_STARTUP_CHANGED');
   const port=Number(option(request,'--port','0'));need(!port||Number(new URL(value.url).port)===port,'APPLICATION_PORT_CHANGED');
   return {url:value.url,workspaceId:selected.workspaceId,connectionFile:value.connectionFile,original:{schema:STARTUP_SCHEMA,workspaceId:selected.workspaceId,configurationSha256:selected.configurationSha256,instanceId:value.instanceId}};
  };
 });}
};
