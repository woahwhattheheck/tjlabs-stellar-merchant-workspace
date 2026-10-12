// MIT. The installed commissioning project through original Applications ownership.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {APP,PRODUCT,SESSION_SCHEMA,UUID,SHA,absolute,plain,need,readBytes,json,digest,objectDigest,
 installedSource,productFiles,fileIdentity,workspaceIdentity,fixedWorkspace} from './common.mjs';
import {readProject} from './project.mjs';
export const STARTUP_SCHEMA='stellar-forge.lightdash-project-startup.v1';

export function lightdashApplication(common){
 return {id:'lightdash-commissioning',command:'lightdash-project',title:'Lightdash commissioning',terminal:false,
  requiredSource:PRODUCT+'/project.mjs',
  description:'Open the prepared original dbt/Lightdash source workspace and authenticated MCP together. Review source, retain native operation IDs, receive the complete handover and reopen the same project.',
  fields:[{name:'projectDirectory',label:'Prepared private Lightdash project',type:'path',required:true,
   description:'Select the original project created by lightdash-project prepare. Opening does not run dbt, change a Lightdash project or buy anything.'},...common]};
}
export async function prepareLightdashApplication(settings,{inputPath,runtimeDirectory}={}){
 need(typeof inputPath==='function','LIGHTDASH_APPLICATION_INPUT_READER','Use the original Applications input reader.');
 const directory=absolute(settings.projectDirectory),state=await readProject(directory);
 need(absolute(runtimeDirectory)===state.installation.runtimeDirectory,'LIGHTDASH_APPLICATION_RUNTIME','Select this project’s prepared installed runtime.');
 const installed=await installedSource(runtimeDirectory),inputs=[await inputPath(directory,'directory',false,true),
  await inputPath(state.workspaceDirectory,'directory',false,true)];
 for(const filename of [path.join(directory,'project.json'),state.connectionFile,state.merchantConfigFile,state.tokenFile])
  inputs.push(await inputPath(filename,'file',false,true));
 for(const relative of [...productFiles.map(p=>PRODUCT+'/'+p),...installed.application.files.map(p=>APP+'/'+p.path),APP+'/source-manifest.json'])
  inputs.push(await inputPath(path.join(installed.sourceRoot,relative),'file'));
 const projectSha256=(await fileIdentity(path.join(directory,'project.json'))).sha256;
 return {args:['serve','--project',directory,'--expected-project-sha256',projectSha256,
  '--expected-workspace-id',state.workspace.workspaceId,'--expected-workspace-identity',state.workspaceIdentity,
  '--expected-manifest-sha256',installed.manifestSha256,'--startup-json'],inputs,createDirectories:[],
  resourceKey:objectDigest({family:'lightdash-project',directory}),
  resourceKeys:[objectDigest({family:'lightdash-project',directory}),objectDigest({family:'lightdash-workspace',directory:state.workspaceDirectory})].sort()};
}
function option(request,name){
 const indices=request.args?.flatMap((v,i)=>v===name?[i]:[])??[];
 need(indices.length===1&&typeof request.args[indices[0]+1]==='string'&&!request.args[indices[0]+1].startsWith('--'),
  'LIGHTDASH_APPLICATION_STARTUP','The original reviewed startup arguments changed.');return request.args[indices[0]+1];
}
function localURL(value){
 const url=new URL(value);need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.search&&!url.hash&&
  Number(url.port)>=1&&Number(url.port)<=65535,'LIGHTDASH_APPLICATION_URL','Use the actual original loopback listener.');return url;
}
export async function lightdashStartup(request,line){
 if(request.command!=='lightdash-project'||typeof line!=='string'||line.length>32768||
  !line.startsWith('{"schema":"'+STARTUP_SCHEMA+'",'))return null;
 let value;try{value=JSON.parse(line);}catch{return null;}
 if(!plain(value)||value.schema!==STARTUP_SCHEMA||value.status!=='LIGHTDASH_PROJECT_READY')return null;
 need(request.args?.[0]==='serve'&&request.args.filter(x=>x==='--startup-json').length===1,'LIGHTDASH_APPLICATION_STARTUP','Use the original prepared project launch.');
 const directory=absolute(option(request,'--project')),projectSha256=option(request,'--expected-project-sha256'),
  workspaceId=option(request,'--expected-workspace-id'),workspaceHash=option(request,'--expected-workspace-identity'),
  manifestSha256=option(request,'--expected-manifest-sha256');
 need(SHA.test(projectSha256)&&SHA.test(workspaceHash)&&SHA.test(manifestSha256)&&UUID.test(workspaceId),
  'LIGHTDASH_APPLICATION_STARTUP','The original reviewed identities are incomplete.');
 need((await fileIdentity(path.join(directory,'project.json'))).sha256===projectSha256,'LIGHTDASH_APPLICATION_PROJECT_CHANGED','The prepared original project changed.');
 const state=await readProject(directory),installed=await installedSource(state.installation.runtimeDirectory),
  launchedRoot=path.join(absolute(request.releaseDirectory),'source');
 need(state.workspace.workspaceId===workspaceId&&state.workspaceIdentity===workspaceHash&&
  state.installation.manifestSha256===manifestSha256&&value.directory===directory&&value.projectId===state.id&&
  value.projectSha256===projectSha256&&value.workspaceId===workspaceId&&value.workspaceIdentity===workspaceHash&&
  value.manifestSha256===manifestSha256&&value.sourceRoot===installed.sourceRoot&&value.executingSourceRoot===launchedRoot&&
  value.applicationManifestSha256===installed.application.manifestSha256&&UUID.test(value.instanceId??'')&&
  UUID.test(value.authoringInstanceId??'')&&Number.isSafeInteger(value.pid)&&value.pid>0,
  'LIGHTDASH_APPLICATION_STARTUP','The announced project, workspace or selected source differs.');
 for(const relative of [...productFiles.map(p=>PRODUCT+'/'+p),...installed.application.files.map(p=>APP+'/'+p.path),APP+'/source-manifest.json']){
  const selected=await fileIdentity(path.join(installed.sourceRoot,relative)),executed=await fileIdentity(path.join(launchedRoot,relative));
  need(objectDigest(selected)===objectDigest(executed),'LIGHTDASH_APPLICATION_EXECUTED_SOURCE','The launched complete source differs from the reviewed selection.');
 }
 const observed=await workspaceIdentity(state.workspaceDirectory);
 need(objectDigest(fixedWorkspace(observed))===workspaceHash,'LIGHTDASH_APPLICATION_WORKSPACE','The original database was replaced.');
 const session=await json(path.join(directory,'session.json'));
 need(session.schema===SESSION_SCHEMA&&session.phase==='OPEN'&&session.instanceId===value.instanceId&&session.authoringInstanceId===value.authoringInstanceId&&
  session.browserUrl===value.browserUrl&&session.mcpUrl===value.mcpUrl,'LIGHTDASH_APPLICATION_SESSION','The actual original host did not retain this announcement.');
 const browser=localURL(value.browserUrl),mcp=localURL(value.mcpUrl),port=request.args.includes('--port')?Number(option(request,'--port')):0;
 need(browser.pathname==='/'&&mcp.pathname==='/mcp'&&Number.isInteger(port)&&port>=0&&port<=65535&&
  (port===0||Number(mcp.port)===port),'LIGHTDASH_APPLICATION_URL','The original listeners differ from the reviewed port.');
 return {url:browser.href,workspaceId,links:[{label:'Authenticated MCP endpoint',url:mcp.href}],
  original:{schema:STARTUP_SCHEMA,projectId:state.id,directory,projectSha256,workspaceId,workspaceIdentity:workspaceHash,
   sourceRoot:installed.sourceRoot,executingSourceRoot:launchedRoot,manifestSha256,applicationManifestSha256:installed.application.manifestSha256,
   instanceId:value.instanceId,authoringInstanceId:value.authoringInstanceId,pid:value.pid}};
}
