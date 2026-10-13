// SPDX-License-Identifier: MIT
// Applications retains the selected runtime, command, process and stop/reopen operation.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectMerchantRuntime} from '../../sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../distribution/runtime-workspace/application-provider.mjs';
import {APP,SCHEMA,STARTUP,UUID,need,same,selection,inspectSelection,workspaceKey,hash} from './source.mjs';

export async function authenticatedApplicationState(url,{signal}={}){
 const parsed=new URL(url);
 need(parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&!parsed.username&&!parsed.password&&!parsed.search&&
  /^\/w\/[a-f0-9]{64}\/$/.test(parsed.pathname)&&/^#access=[a-f0-9]{64}$/.test(parsed.hash),
  'GROUNDWATER_APPLICATION_STARTUP_URL','Keep the actual private native application URL.');
 const response=await fetch(new URL('/api/application/state',parsed),{redirect:'error',
  headers:{Authorization:'Bearer '+parsed.hash.slice('#access='.length)},
  signal:signal??AbortSignal.timeout(10000)});
 need(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),
  'GROUNDWATER_APPLICATION_STARTUP_UNAVAILABLE','The actual listener did not return authenticated application state.');
 const pieces=[];let bytes=0;
 for await(const piece of response.body){bytes+=piece.length;need(bytes<=16*1024*1024,
  'GROUNDWATER_APPLICATION_STARTUP_BOUND','The actual startup state exceeds its declared bound.');pieces.push(piece);}
 return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}
export async function applicationStartup(request,line){
 if(request.command!=='groundwater-application'||typeof line!=='string'||line.length>65536||
  !line.startsWith('{"schema":"'+STARTUP+'",'))return null;
 let value;try{value=JSON.parse(line);}catch{return null;}
 if(value?.schema!==STARTUP||value.state!=='GROUNDWATER_APPLICATION_READY')return null;
 const selected=selection(request.args),executedRoot=join(request.releaseDirectory,'source');
 const original=await inspectSelection(selected,{executedRoot}),key=workspaceKey(original.workspace);
 need(value.operationId===selected.operationId&&value.workspaceId===original.workspace.workspace.id&&
  value.workspaceDirectory===selected.workspaceDirectory&&value.workspaceIdentity===selected.expectedWorkspace&&
  value.receivingDirectory===selected.receivingDirectory&&value.receivingIdentity===selected.expectedReceiving&&
  value.sourceRoot===selected.sourceRoot&&value.executedSourceRoot===executedRoot&&
  value.sourceSha256===selected.expectedSource&&value.pythonIdentity===selected.expectedPython&&
  value.workspaceKey===key&&value.apiBase==='/w/'+key+'/api'&&UUID.test(value.instanceId??'')&&
  Number.isSafeInteger(value.pid)&&value.pid>0,
  'GROUNDWATER_APPLICATION_STARTUP_IDENTITY','The original managed application differs from its reviewed request.');
 const url=new URL(value.url),port=Number(url.port);
 need(url.origin===value.origin&&url.pathname==='/w/'+key+'/'&&port>=1&&port<=65535&&
  (!selected.port||selected.port===port)&&value.handoverUrl===url.origin+'/handover/',
  'GROUNDWATER_APPLICATION_STARTUP_IDENTITY','The original application returned another context or local port.');
 const state=await authenticatedApplicationState(value.url);
 need(state.schema===SCHEMA&&state.state==='ready'&&state.operationId===selected.operationId&&
  state.instanceId===value.instanceId&&state.sourceSha256===selected.expectedSource&&
  state.pythonIdentity===selected.expectedPython&&state.original?.sha256===selected.expectedWorkspace&&
  state.original?.key===key&&same(state.original.workspace,original.workspace.workspace)&&
  state.receivingRoot?.sha256===selected.expectedReceiving&&
  state.opened.some(row=>row.key===key&&row.state==='open'&&row.directory===selected.workspaceDirectory),
  'GROUNDWATER_APPLICATION_STARTUP_IDENTITY','The authenticated listener serves another original workspace.');
 return {url:value.url,workspaceId:original.workspace.workspace.id,
  links:[{label:'Complete backup receiving',url:value.handoverUrl}],
  original:{schema:STARTUP,operationId:selected.operationId,instanceId:value.instanceId,pid:value.pid,
   workspaceDirectory:selected.workspaceDirectory,workspaceIdentity:selected.expectedWorkspace,
   workspaceId:original.workspace.workspace.id,workspaceKey:key,receivingDirectory:selected.receivingDirectory,
   receivingIdentity:selected.expectedReceiving,sourceRoot:selected.sourceRoot,executedSourceRoot:executedRoot,
   sourceSha256:selected.expectedSource,pythonIdentity:selected.expectedPython}};
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'groundwater-application',order:611,
 catalog({common,field}){
  return [{
   id:'groundwater-scientific-workspace',command:'groundwater-application',title:'Groundwater Scientific Workspace',
   terminal:false,requiredSource:APP+'/cli.mjs',
   description:'Open the original source, scenario, comparison and report workspace; review and receive complete backups, then reopen independent working copies with their original operation history.',
   fields:[
    field('workspaceDirectory','Existing scientific workspace','path',true,'Select the original private directory containing groundwater.sqlite. Startup opens that database.'),
    field('receivingDirectory','Private backup receiving directory','path',true,'Choose an existing private directory separate from the workspace and installed source. Each reviewed original backup receives its own retained destination here.'),
    field('python','Python interpreter','path',true,'Select the existing Python 3.11+ interpreter. Opening and receiving use the original standard-library core; scientific execution still requires its reviewed original runtime.'),
    field('actor','Operator name','text',false,'Initial named operator for the unchanged scientific and receiving forms.'),
    ...common
   ]
  }];
 },
 validateSettings(type,settings){
  if(settings.actor!==undefined)need(typeof settings.actor==='string'&&settings.actor.length<=200,
   'GROUNDWATER_APPLICATION_ACTOR','Use the named operator, at most 200 characters.',422);
 },
 async prepare(type,settings,context){
  const {inputPath,selectedExecutable,runtimeDirectory}=context;
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const native=await import(pathToFileURL(join(runtime.sourceRoot,APP,'source.mjs')).href);
  const selected={workspaceDirectory:settings.workspaceDirectory,receivingDirectory:settings.receivingDirectory,
   sourceRoot:runtime.sourceRoot,python:settings.python};
  const original=await native.inspectSelection(selected);
  const inputs=[
   await inputPath(original.workspace.directory,'directory',false,true),
   {path:original.workspace.database.path,kind:'native-scientific-database',
    dev:original.workspace.database.dev,ino:original.workspace.database.ino,workspace:original.workspace.workspace},
   await inputPath(original.receiving.directory,'directory',false,true),
   ...(await selectedExecutable(settings.python)).inputs
  ];
  for(const row of original.source.files){
   const item=await inputPath(join(runtime.sourceRoot,row.path),'file');
   need(item.bytes===row.bytes&&(!item.sha256||item.sha256===row.sha256),
    'GROUNDWATER_APPLICATION_SOURCE_CHANGED','The selected complete application changed during review.');
   inputs.push(item);
  }
  const args=['serve','--workspace',selected.workspaceDirectory,'--receiving-root',selected.receivingDirectory,
   '--source-root',selected.sourceRoot,'--python',selected.python,'--expected-workspace',original.workspace.sha256,
   '--expected-receiving',original.receiving.sha256,'--expected-source',original.source.sha256,
   '--expected-python',original.python.identitySha256];
  if(settings.actor)args.push('--actor',settings.actor);
  return {args,inputs,createDirectories:[],
   resourceKeys:[
    hash({family:'groundwater-scientific-workspace',directory:original.workspace.directory,id:original.workspace.workspace.id}),
    hash({family:'groundwater-application-receiving',directory:original.receiving.directory})
   ]};
 },
 runArguments({command,args,requestId}){
  need(command==='groundwater-application'&&!args.includes('--managed-operation'),
   'GROUNDWATER_APPLICATION_OPERATION','Keep the original managed launch request.');
  const result=[...args,'--managed-operation',requestId];selection(result);return result;
 },
 matchRequest(request){return !request.pythonCommand&&request.command==='groundwater-application';},
 async verifyLaunch(request){
  const selected=selection(request.args),native=await import(pathToFileURL(join(selected.sourceRoot,APP,'source.mjs')).href);
  await native.inspectSelection(selected,{executedRoot:join(request.releaseDirectory,'source')});
 },
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,line=>{
   if(!line.startsWith('{"schema":"'+STARTUP+'",'))return null;
   return ()=>applicationStartup(request,line);
  },{lineLimit:65536});
 }
};
