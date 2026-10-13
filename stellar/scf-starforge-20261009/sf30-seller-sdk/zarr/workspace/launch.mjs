/** Managed launch pins the selected complete source and the original native workspace. */
import fs from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {ZARR_ROOT,need,sha,encoded,fileIdentity,directoryIdentity,openZarrWorkspace,readZarrConnections,inside} from './bridge.mjs';
export const ZARR_STARTUP_SCHEMA='stellar-forge.zarr-workspace-startup.v1';
export const ZARR_APPLICATION_ID='zarr-workspace';
export const ZARR_COMMAND='zarr-workspace';
const REQUIRED=[
 'CLI_CONTRACT.json','python/cli.py','python/files.py','python/native.py','python/workspace.py','python/packet.py',
 'source.mjs','publisher/driver.mjs','publisher/model.mjs',
 'workspace/bridge.mjs','workspace/server.mjs','workspace/cli.mjs','workspace/launch.mjs',
 'workspace/browser.mjs','workspace/index.html','workspace/style.css','workspace/mcp.mjs',
 'workspace/merchant-provider.mjs','workspace/application-provider.mjs','workspace/application.mjs',
 'workspace/catalog.mjs','workspace/client.d.mts','WORKSPACE.md'
];
export async function inspectZarrLaunchSource(directory=ZARR_ROOT,{expectedSha256}={}){
 const root=resolve(directory);await directoryIdentity(root);const files=[];
 async function walk(at){
  for(const entry of (await fs.readdir(at,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   if(entry.name==='__pycache__'||entry.name.endsWith('.pyc'))continue;
   need(!entry.isSymbolicLink(),'ZARR_SOURCE_LINK','The complete selected source cannot contain links');
   const path=join(at,entry.name);
   if(entry.isDirectory())await walk(path);
   else{
    need(entry.isFile(),'ZARR_SOURCE_FILE','The complete source must contain original regular files');
    const actual=await fileIdentity(path,{maximum:128*1024*1024});
    files.push({path:relative(root,path).split('\\').join('/'),bytes:actual.bytes,sha256:actual.sha256});
    need(files.length<=10000,'ZARR_SOURCE_LIMIT','The source component exceeds its complete file limit');
   }
  }
 }
 await walk(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const present=new Set(files.map(x=>x.path));
 for(const path of REQUIRED)need(present.has(path),'ZARR_SOURCE_INCOMPLETE','The selected Zarr source is missing '+path);
 const value={schema:'stellar-forge.zarr-launch-source.v1',files},fingerprint=sha(encoded(value));
 if(expectedSha256)need(fingerprint===expectedSha256,'ZARR_SOURCE_CHANGED','The reviewed complete Zarr source changed',409);
 return {directory:root,sourceSha256:fingerprint,files};
}
export async function inspectZarrAuthoring(directory,{python='python3',sourceDirectory=ZARR_ROOT,expectedSha256}={}){
 const workspace=await openZarrWorkspace({directory:resolve(directory),python,sourceDirectory,connections:{inputs:[],destinations:[],sha256:sha(encoded(null))}});
 try{
  const identity=workspace.identity;
  if(expectedSha256)need(identity.sha256===expectedSha256,'ZARR_WORKSPACE_CHANGED','The reviewed original Zarr workspace changed',409);
  return identity;
 }finally{await workspace.close();}
}
export async function prepareZarrManagedLaunch({
 directory,python,sourceDirectory=ZARR_ROOT,expectedSourceSha256,expectedWorkspaceSha256,
 connectionsFile,expectedConnectionsSha256
}){
 need(!inside(resolve(sourceDirectory),resolve(directory)),'ZARR_WORKSPACE_LOCATION','Keep operated data outside the selected source');
 const source=await inspectZarrLaunchSource(sourceDirectory,{expectedSha256:expectedSourceSha256});
 const launchSource=await inspectZarrLaunchSource(ZARR_ROOT,{expectedSha256:source.sourceSha256});
 const connections=await readZarrConnections(connectionsFile,{expectedSha256:expectedConnectionsSha256});
 const identity=await inspectZarrAuthoring(directory,{python,sourceDirectory:ZARR_ROOT,expectedSha256:expectedWorkspaceSha256});
 return {directory:resolve(directory),python,sourceDirectory:source.directory,launchSourceDirectory:launchSource.directory,
  sourceSha256:source.sourceSha256,sourceFiles:source.files,workspaceIdentity:identity,
  connectionsFile:connections.path,connectionsSha256:connections.sha256,connections};
}
export function zarrManagedStartup({launch,service}){
 need(service.workspace.identity.sha256===launch.workspaceIdentity.sha256,'ZARR_STARTUP_WORKSPACE','The opened original workspace changed after review',409);
 return {schema:ZARR_STARTUP_SCHEMA,status:'ZARR_WORKSPACE_READY',instanceId:service.instanceId,pid:process.pid,
  directory:launch.directory,workspaceId:launch.workspaceIdentity.workspaceId,
  workspaceIdentity:launch.workspaceIdentity,workspaceSha256:launch.workspaceIdentity.sha256,
  sourceDirectory:launch.sourceDirectory,launchSourceDirectory:launch.launchSourceDirectory,
  sourceSha256:launch.sourceSha256,sourceFiles:launch.sourceFiles,
  connectionsFile:launch.connectionsFile,connectionsSha256:launch.connectionsSha256,
  connectionFile:service.connectionFile,connectionSha256:service.connectionSha256,
  zarrWorkspace:service.url};
}

export function zarrServeOptions(argv){
 need(Array.isArray(argv)&&argv[0]==='serve','ZARR_COMMAND','Use the original serve command');
 const allowed=new Set(['--directory','--connections','--python','--port','--source-directory','--source-sha256','--workspace-identity','--connections-sha256','--startup-json']),v={};
 for(let i=1;i<argv.length;i++){
  const key=argv[i];need(allowed.has(key)&&!Object.hasOwn(v,key),'ZARR_OPTION','Unknown or repeated serve option '+key);
  if(key==='--startup-json'){v[key]=true;continue;}
  const value=argv[++i];need(typeof value==='string'&&value&&!value.startsWith('--'),'ZARR_OPTION','Retain the value for '+key);v[key]=value;
 }
 need(v['--directory']&&v['--connections'],'ZARR_OPTION','Select the original workspace and host connections file');
 const port=v['--port']===undefined?8471:Number(v['--port']);
 need(Number.isInteger(port)&&port>=0&&port<=65535,'ZARR_PORT','Select a port from 0 to 65535');
 for(const key of ['--source-sha256','--workspace-identity','--connections-sha256'])if(v[key]!==undefined)need(/^[a-f0-9]{64}$/.test(v[key]),'ZARR_OPTION','Retain the exact reviewed hash for '+key);
 return {directory:resolve(v['--directory']),connectionsFile:resolve(v['--connections']),
  python:v['--python']??process.env.ZARR_PYTHON??'python3',port,sourceDirectory:resolve(v['--source-directory']??ZARR_ROOT),
  expectedSourceSha256:v['--source-sha256'],expectedWorkspaceSha256:v['--workspace-identity'],
  expectedConnectionsSha256:v['--connections-sha256'],startupJson:Boolean(v['--startup-json'])};
}
