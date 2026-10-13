// MIT. Source-owned Applications lifecycle over the original receiving desk.
import { join } from 'node:path';
import { need, plain, canonical, absolute } from '../../../distribution/runtime-workspace/storage.mjs';
import { readPrivate, digest } from '../../postgres/publisher/files.mjs';

export const CIIM_DESK_STARTUP = 'tjl.ciim.desk-startup.v1';
const PREFIX = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk';
const field = (name,label,type='path',required=false,description='') => ({name,label,type,required,description});
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function ciimDeskApplication(common=[]) {
  return {
    id:'ciim-receiving-desk',command:'ciim-desk',title:'CIIM metadata receiving',terminal:false,
    requiredSource:PREFIX+'/model.mjs',
    description:'Receive original native editions, inspect complete metadata and source XML, record named reviews, compare withdrawals/restorations, and reopen portable handbacks.',
    fields:[
      field('workspaceDirectory','Original CIIM receiving desk','path',true,'Choose a desk initialized or restored with the original ciim-desk command.'),
      field('pythonExecutable','Existing Python executable','path',true,'Absolute executable used by this desk’s existing SQLite and archive operations.'),
      ...common,
    ],
  };
}
export async function prepareCiimDeskApplication(settings,{inputPath,selectedExecutable}={}) {
  need(typeof inputPath==='function' && typeof selectedExecutable==='function','APPLICATION_CIIM_CONTEXT_REQUIRED');
  const workspace=await inputPath(settings.workspaceDirectory,'directory',false,true);
  const python=await selectedExecutable(settings.pythonExecutable);
  const markerPath=join(workspace.path,'desk.json'),markerInput=await inputPath(markerPath,'file');
  const raw=await readPrivate(markerPath,65536);
  let marker;
  try{marker=JSON.parse(raw.toString('utf8'));}catch{need(false,'APPLICATION_CIIM_MARKER_INVALID','Open the original initialized or restored receiving desk.');}
  need(plain(marker) && marker.schema==='tjl.ciim.receiving-desk.v1' && typeof marker.workspaceId==='string' && marker.workspaceId &&
    digest(raw)===markerInput.sha256,'APPLICATION_CIIM_MARKER_CHANGED','The receiving desk identity changed during review.');
  return {
    args:['serve','--workspace',workspace.path,'--python',python.executable,'--expected-workspace-id',marker.workspaceId,'--expected-marker-sha256',markerInput.sha256],
    inputs:[workspace,markerInput,...python.inputs],createDirectories:[],
  };
}
function selected(request) {
  if(request.command!=='ciim-desk' || !Array.isArray(request.args) || request.args[0]!=='serve')return null;
  const pairs=request.args.slice(1),options=new Map();
  need(pairs.length%2===0,'APPLICATION_CIIM_STARTUP_CHANGED');
  for(let index=0;index<pairs.length;index+=2) {
    const name=pairs[index],value=pairs[index+1];
    need(['--workspace','--python','--expected-workspace-id','--expected-marker-sha256','--port'].includes(name) &&
      !options.has(name) && typeof value==='string','APPLICATION_CIIM_STARTUP_CHANGED');
    options.set(name,value);
  }
  need(options.has('--workspace') && options.has('--python') && options.get('--expected-workspace-id') &&
    hex(options.get('--expected-marker-sha256')),'APPLICATION_CIIM_STARTUP_CHANGED');
  const port=options.get('--port') || '0';
  need(/^(0|[1-9]\d*)$/.test(port) && Number(port)<=65535,'APPLICATION_CIIM_STARTUP_CHANGED');
  return {directory:absolute(options.get('--workspace')),python:absolute(options.get('--python')),
    workspaceId:options.get('--expected-workspace-id'),markerSha256:options.get('--expected-marker-sha256'),port:Number(port)};
}
export async function ciimDeskStartup(request,text) {
  if(typeof text!=='string' || text.length>16384 || !text.startsWith('{'))return null;
  let value;try{value=JSON.parse(text);}catch{return null;}
  if(!plain(value) || value.schema!==CIIM_DESK_STARTUP || value.status!=='CIIM_DESK_READY')return null;
  const original=selected(request);
  need(original && value.workspace===original.directory && value.workspaceId===original.workspaceId &&
    value.markerSha256===original.markerSha256 && Number.isSafeInteger(value.pid) && value.pid>0 &&
    value.connectionFile===join(original.directory,'desk-connection.json'),'APPLICATION_CIIM_STARTUP_CHANGED');
  const marker=await readPrivate(join(original.directory,'desk.json'),65536);
  need(digest(marker)===original.markerSha256,'APPLICATION_CIIM_MARKER_CHANGED');
  let url;try{url=new URL(value.url);}catch{need(false,'APPLICATION_CIIM_STARTUP_CHANGED');}
  need(url.protocol==='http:' && url.hostname==='127.0.0.1' && !url.username && !url.password &&
    url.pathname==='/' && !url.search && hex(url.hash.slice(1)) &&
    Number(url.port)>=1 && Number(url.port)<=65535 && (!original.port || Number(url.port)===original.port),
    'APPLICATION_CIIM_STARTUP_CHANGED');
  const response=await fetch(new URL('/api/launch',url),{redirect:'error',headers:{'X-CIIM-Session':url.hash.slice(1)},signal:AbortSignal.timeout(5000)});
  need(response.status===200 && /^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'') &&
    /^\d+$/.test(response.headers.get('content-length')||'') && Number(response.headers.get('content-length'))<=16384,
    'APPLICATION_CIIM_STARTUP_UNAVAILABLE');
  const active=await response.json();
  need(JSON.stringify(canonical(active))===JSON.stringify(canonical(value)),
    'APPLICATION_CIIM_STARTUP_CHANGED','The live desk differs from its original launch announcement.');
  return {url:url.href,workspaceId:value.workspaceId,connectionFile:value.connectionFile,
    links:[{id:'ciim-receiving',label:'Open CIIM receiving desk',url:url.href}],
    original:{schema:CIIM_DESK_STARTUP,workspace:original.directory,workspaceId:value.workspaceId,markerSha256:value.markerSha256,pid:value.pid}};
}
