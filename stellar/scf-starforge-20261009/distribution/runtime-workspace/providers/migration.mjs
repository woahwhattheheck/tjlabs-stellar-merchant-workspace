// SPDX-License-Identifier: MIT
import { resolve } from 'node:path';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../application-provider.mjs';
import { need } from '../storage.mjs';
import { readMigrationOperatorBinding, parseExactJSON } from '../../../sf30-seller-sdk/stac/migration/managed.mjs';

const SOURCE='stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/server.py';
const PREFIX='Migration operator: ';
const field=(name,label,type='path',required=false,description='')=>({name,label,type,required,description});

function options(request) {
  need(request.command==='migration-operator' && Array.isArray(request.args) && request.args[0]==='serve',
    'APPLICATION_MIGRATION_COMMAND_CHANGED');
  const value=new Map();
  need((request.args.length-1)%2===0,'APPLICATION_MIGRATION_COMMAND_CHANGED');
  for(let i=1;i<request.args.length;i+=2){
    const key=request.args[i],item=request.args[i+1];
    need(['--workspace','--expected-workspace-id','--python','--vector-python','--qgis-python',
      '--exports','--port'].includes(key) && !value.has(key) && typeof item==='string',
      'APPLICATION_MIGRATION_COMMAND_CHANGED');
    value.set(key,item);
  }
  need(value.size===7,'APPLICATION_MIGRATION_COMMAND_CHANGED');
  return value;
}

async function originalStartup(request,text) {
  const selected=options(request);
  let url;
  try{url=new URL(text.slice(PREFIX.length));}catch{need(false,'APPLICATION_MIGRATION_STARTUP_INVALID');}
  const port=Number(url.port||80),expectedPort=Number(selected.get('--port'));
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&port>=1&&port<=65535&&
    (!expectedPort||port===expectedPort)&&url.pathname==='/'&&!url.search&&!url.username&&!url.password&&
    /^#access=[A-Za-z0-9_-]{43}$/.test(url.hash),'APPLICATION_MIGRATION_STARTUP_INVALID');
  const response=await fetch(new URL('/api',url),{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json',Origin:url.origin,'X-Migration-Access':url.hash.slice(8)},
    body:JSON.stringify({command:'state',payload:{}}),
  });
  need(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')&&
    /^\d+$/.test(response.headers.get('content-length')??'')&&
    Number(response.headers.get('content-length'))<=64*1024*1024,
    'APPLICATION_MIGRATION_STARTUP_UNAVAILABLE','The original operator did not return its selected workspace.');
  const body=parseExactJSON(await response.text());
  need(body?.ok===true&&body.result?.id===selected.get('--expected-workspace-id'),
    'APPLICATION_MIGRATION_WORKSPACE_CHANGED','The running original workspace differs from the reviewed selection.');
  return {url:url.href,workspaceId:body.result.id,original:{
    schema:'starforge.migration-managed-launch.v1',workspaceId:body.result.id,
    workspaceDirectory:selected.get('--workspace'),exportsDirectory:selected.get('--exports'),
    python:selected.get('--python'),vectorPython:selected.get('--vector-python'),qgisPython:selected.get('--qgis-python'),
  }};
}

export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'migration-operator',order:265,appendPort:false,
  catalog({common}){
    return [{id:'migration-operator',command:'migration-operator',title:'GIS migration',terminal:false,
      requiredSource:SOURCE,
      description:'Open the original source mapping, corrected editions, QGIS projects, cartographic publications and complete receiving workspace.',
      fields:[
        field('workspaceDirectory','Original migration workspace','path',true,
          'Select the existing workspace created or received by the original migration engine.'),
        field('pythonExecutable','Operator Python','path',true,'Select the installed Python executable used for this workspace.'),
        field('vectorPython','Vector Python','path',false,'Existing Python with GDAL/OGR; defaults to Operator Python.'),
        field('qgisPython','QGIS Python','path',false,'Existing Python with native QGIS; defaults to Operator Python.'),
        field('exportsDirectory','Complete handover directory','path',false,
          'A private directory outside the workspace; defaults to the workspace path followed by -exports.'),
        ...common,
      ]}];
  },
  async prepare(type,settings,context){
    const workspace=await context.inputPath(settings.workspaceDirectory,'directory',false,true);
    const python=await context.selectedExecutable(settings.pythonExecutable);
    const vector=await context.selectedExecutable(settings.vectorPython||settings.pythonExecutable);
    const qgis=await context.selectedExecutable(settings.qgisPython||settings.pythonExecutable);
    const exports=await context.inputPath(settings.exportsDirectory||workspace.path+'-exports','directory',true,true);
    need(exports.path!==workspace.path&&!exports.path.startsWith(workspace.path+'/'),
      'APPLICATION_MIGRATION_EXPORT_DIRECTORY','Keep complete exported handovers outside the live workspace.');
    const {environment}=await context.applicationEnvironment(settings.environmentFile);
    const binding=await readMigrationOperatorBinding({
      workspaceDirectory:workspace.path,pythonExecutable:python.executable,environment,
    });
    const port=settings.port===undefined||settings.port===''?0:Number(settings.port);
    need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'APPLICATION_PORT_INVALID');
    return {args:['serve','--workspace',binding.directory,'--expected-workspace-id',binding.workspaceId,
      '--python',python.executable,'--vector-python',vector.executable,'--qgis-python',qgis.executable,
      '--exports',exports.path,'--port',String(port)],
      inputs:[workspace,exports,...python.inputs,...vector.inputs,...qgis.inputs],createDirectories:[]};
  },
  resourceKey(type,settings,{hash}){
    return hash({family:'migration-operator',directory:resolve(settings.workspaceDirectory)});
  },
  matchRequest(request){return !request.pythonCommand&&request.command==='migration-operator';},
  createObserver(request,directory){
    return observeApplicationStartup(request,directory,text=>
      text.startsWith(PREFIX)?()=>originalStartup(request,text):null);
  },
};
