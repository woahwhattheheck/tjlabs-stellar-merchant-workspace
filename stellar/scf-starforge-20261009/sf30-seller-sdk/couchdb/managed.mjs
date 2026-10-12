// MIT. Bind the maintained Applications owner to the original CouchDB workspace.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
const SOURCE='stellar/scf-starforge-20261009/sf30-seller-sdk/couchdb';
const STARTUP='stellar-forge.couchdb-workspace-startup.v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const need=(ok,code,message=code)=>{if(!ok)throw Object.assign(new Error(message),{code,status:409});};
const field=(name,label,type='path',required=false,description='')=>({name,label,type,required,description});
export function couchdbApplication(common=[]){
  return {id:'couchdb',command:'couchdb-workspace',title:'CouchDB data products',terminal:false,requiredSource:SOURCE+'/operator.mjs',
    description:'Capture original document revisions and attachments, review typed fields, publish datasets, operate seller releases, and receive the full retained workspace.',
    fields:[field('stateDirectory','Initialized CouchDB workspace','path',true,'Choose the private original directory created by couchdb-workspace init.'),...common]};
}
export async function prepareCouchdbApplication(settings,{inputPath,applicationEnvironment,runtimeDirectory}={}){
  need(process.platform==='linux','APPLICATION_COUCHDB_LINUX_REQUIRED','The retained workspace uses Linux util-linux flock and the original dataset writer.');
  need(typeof inputPath==='function'&&typeof applicationEnvironment==='function','APPLICATION_COUCHDB_CONTEXT_REQUIRED');
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const native=await import(pathToFileURL(join(runtime.sourceRoot,SOURCE,'operator.mjs')).href);
  const selected=await native.readCouchdbWorkspaceIdentity(settings.stateDirectory),inputs=[await inputPath(selected.directory,'directory',false,true)];
  const marker=await inputPath(selected.path,'file');need(marker.sha256===selected.sha256,'APPLICATION_COUCHDB_WORKSPACE_CHANGED');inputs.push(marker);
  // The original Applications environment loader retains its exact file descriptor.
  await applicationEnvironment(settings.environmentFile);
  return {args:['serve','--directory',selected.directory,'--expected-workspace-id',selected.id,
    '--connection-file',join(selected.directory,'connection.json'),'--port',String(settings.port??0)],inputs,createDirectories:[],
    resourceKey:createHash('sha256').update(JSON.stringify({family:'couchdb',directory:selected.directory,workspaceId:selected.id})).digest('hex')};
}
function selectedArguments(request){
  need(Array.isArray(request.args)&&request.args[0]==='serve','APPLICATION_COUCHDB_STARTUP_CHANGED');
  const options=new Map(),allowed=new Set(['--directory','--expected-workspace-id','--connection-file','--port']);
  for(let i=1;i<request.args.length;i+=2){
    need(allowed.has(request.args[i])&&!options.has(request.args[i])&&typeof request.args[i+1]==='string'&&
      request.args[i+1]&&!request.args[i+1].startsWith('--'),'APPLICATION_COUCHDB_STARTUP_CHANGED');
    options.set(request.args[i],request.args[i+1]);
  }
  need(['--directory','--expected-workspace-id','--connection-file'].every(key=>options.has(key))&&UUID.test(options.get('--expected-workspace-id'))&&
    /^(0|[1-9]\d{0,4})$/.test(options.get('--port')??'0')&&Number(options.get('--port')??0)<=65535,'APPLICATION_COUCHDB_STARTUP_CHANGED');
  return options;
}
export async function couchdbStartup(request,line){
  if(request.command!=='couchdb-workspace'||request.pythonCommand||typeof line!=='string'||line.length>32768||!line.startsWith('{"schema":"'+STARTUP+'",'))return null;
  let value;try{value=JSON.parse(line);}catch{return null;}if(value?.schema!==STARTUP)return null;
  const selected=selectedArguments(request);
  const native=await import(pathToFileURL(join(request.releaseDirectory,'source',SOURCE,'client.mjs')).href);
  const live=await native.connectCouchdbWorkspace({connectionFile:selected.get('--connection-file'),expectedWorkspaceId:selected.get('--expected-workspace-id')});
  need(value.workspaceId===live.info.workspaceId&&value.workspaceIdentitySha256===live.info.workspaceIdentitySha256&&
    value.instanceId===live.info.instanceId&&value.pid===live.info.pid&&value.connectionFile===selected.get('--connection-file')&&
    value.stateDirectory===selected.get('--directory')&&value.stateDirectory===live.info.directory&&value.workspace===live.connection.workspace&&
    (!Number(selected.get('--port')??0)||new URL(value.workspace).port===selected.get('--port')),'APPLICATION_COUCHDB_STARTUP_CHANGED',
    'The live original CouchDB workspace differs from the reviewed application.');
  return {url:value.workspace,original:value,workspaceId:value.workspaceId,connectionFile:value.connectionFile};
}
