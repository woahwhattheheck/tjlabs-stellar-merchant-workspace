/** Source-owned original Applications preparation and checked startup. */
import {join,resolve,isAbsolute} from 'node:path';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {applicationPreparation} from '../../../distribution/runtime-workspace/application-provider.mjs';
import {ZARR_ROOT,HASH,UUID,CONNECTION_FILENAME,need,sha,encoded,exact,fileIdentity,readZarrConnection,ZarrWorkspaceClient} from './bridge.mjs';
import {ZARR_STARTUP_SCHEMA,ZARR_APPLICATION_ID,ZARR_COMMAND,prepareZarrManagedLaunch,inspectZarrLaunchSource,inspectZarrAuthoring,zarrServeOptions} from './launch.mjs';
export function zarrApplication(common){
 return {id:ZARR_APPLICATION_ID,command:ZARR_COMMAND,title:'Zarr workspace',terminal:false,
  requiredSource:'stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/workspace/cli.mjs',
  description:'Inspect retained Zarr arrays, review complete typed results and operate their original dataset publishers.',
  fields:[
   {name:'workspaceDirectory',label:'Original private Zarr workspace',type:'path',required:true,description:'An existing native workspace created or received through zarr-workspace.'},
   {name:'connectionsFile',label:'Host input and receiving declaration',type:'path',required:true,description:'Named complete source inputs and separate receiving roots.'},
   {name:'pythonExecutable',label:'Installed Python executable',type:'path',required:true,description:'The selected Python environment containing the pinned original Zarr dependencies.'},
   ...common]};
}
export async function prepareZarrApplication(settings,{inputPath}){
 need(isAbsolute(settings.pythonExecutable??''),'ZARR_PYTHON','Select the absolute installed Python executable');
 const helper=applicationPreparation(settings,inputPath),{args,inputs,createDirectories,path,option}=helper;
 const directory=await path('workspaceDirectory','directory',false,true),connections=await path('connectionsFile','file');
 // Preserve the selected venv path: resolving its symlink would change sys.prefix.
 const python=resolve(settings.pythonExecutable);await fs.access(python,constants.X_OK);
 inputs.push(await inputPath(python,'file'));
 const selected=await prepareZarrManagedLaunch({directory:directory.path,connectionsFile:connections.path,python,sourceDirectory:ZARR_ROOT});
 args.push('serve');option('--directory',selected.directory);option('--connections',selected.connectionsFile);
 option('--python',python);option('--source-directory',selected.sourceDirectory);option('--source-sha256',selected.sourceSha256);
 option('--workspace-identity',selected.workspaceIdentity.sha256);option('--connections-sha256',selected.connectionsSha256);args.push('--startup-json');
 for(const file of selected.sourceFiles)inputs.push(await inputPath(join(selected.sourceDirectory,file.path),'file'));
 const resourceKey=sha(encoded({family:'zarr-source-workspace',workspaceId:selected.workspaceIdentity.workspaceId,
  storage:selected.workspaceIdentity.storage}));
 return {args,inputs,createDirectories,resourceKey,resourceKeys:[resourceKey]};
}
export async function zarrApplicationStartup(request,line){
 if(request.command!==ZARR_COMMAND||typeof line!=='string'||!line.startsWith('{"schema":"'+ZARR_STARTUP_SCHEMA+'",'))return null;
 let value;try{value=JSON.parse(line);}catch{return null;}
 if(value.schema!==ZARR_STARTUP_SCHEMA||value.status!=='ZARR_WORKSPACE_READY')return null;
 const selected=zarrServeOptions(request.args);
 need(selected.startupJson&&HASH.test(selected.expectedSourceSha256??'')&&HASH.test(selected.expectedWorkspaceSha256??'')&&
  HASH.test(selected.expectedConnectionsSha256??''),'ZARR_STARTUP_REVIEW','Use the complete original reviewed launch arguments',409);
 const source=await inspectZarrLaunchSource(selected.sourceDirectory,{expectedSha256:selected.expectedSourceSha256});
 const launchedRoot=join(resolve(request.releaseDirectory),'source','stellar/scf-starforge-20261009/sf30-seller-sdk/zarr');
 const launched=await inspectZarrLaunchSource(launchedRoot,{expectedSha256:source.sourceSha256});
 const original=await inspectZarrAuthoring(selected.directory,{python:selected.python,sourceDirectory:launchedRoot,expectedSha256:selected.expectedWorkspaceSha256});
 need(value.directory===selected.directory&&value.workspaceId===original.workspaceId&&value.workspaceSha256===original.sha256&&
  value.sourceDirectory===source.directory&&value.launchSourceDirectory===launched.directory&&value.sourceSha256===source.sourceSha256&&
  value.connectionsFile===selected.connectionsFile&&value.connectionsSha256===selected.expectedConnectionsSha256&&
  value.connectionFile===join(selected.directory,CONNECTION_FILENAME)&&UUID.test(value.instanceId??'')&&Number.isSafeInteger(value.pid)&&value.pid>0,
  'ZARR_STARTUP_CHANGED','The announced original workspace, source or private listener changed',409);
 exact(value.sourceFiles,source.files,'The original complete launch source manifest changed');
 exact(value.workspaceIdentity,original,'The original native workspace identity changed');
 const declaration=await fileIdentity(selected.connectionsFile);
 need(declaration.sha256===selected.expectedConnectionsSha256,'ZARR_CONNECTIONS_CHANGED','The reviewed host connections changed',409);
 const record=await readZarrConnection(value.connectionFile,{workspaceId:original.workspaceId,workspaceSha256:original.sha256});
 need(record.identity.sha256===value.connectionSha256&&record.value.instanceId===value.instanceId&&record.value.pid===value.pid&&
  record.value.sourceSha256===source.sourceSha256&&record.value.connectionsSha256===selected.expectedConnectionsSha256,
  'ZARR_STARTUP_CONNECTION','The retained private operator connection changed',409);
 const input=request.inputs?.find(x=>x.path===selected.directory&&x.kind==='directory');
 if(input?.exists)need(String(input.dev)===original.storage.directory.device&&String(input.ino)===original.storage.directory.inode,
  'ZARR_STARTUP_DIRECTORY','The original reviewed directory was replaced',409);
 const client=new ZarrWorkspaceClient(record.value);
 try{
  await client.connect();const expected=record.value.origin+'/#token='+record.value.token;
  need(value.zarrWorkspace===expected&&(!selected.port||Number(new URL(record.value.origin).port)===selected.port),
   'ZARR_STARTUP_URL','The actual private listener differs from its original startup',409);
  return {url:expected,workspaceId:original.workspaceId,connectionFile:value.connectionFile,
   original:{schema:ZARR_STARTUP_SCHEMA,workspaceId:original.workspaceId,workspaceSha256:original.sha256,
    instanceId:value.instanceId,pid:value.pid,sourceSha256:source.sourceSha256,
    connectionsSha256:selected.expectedConnectionsSha256,connectionSha256:value.connectionSha256}};
 }finally{await client.close();}
}
