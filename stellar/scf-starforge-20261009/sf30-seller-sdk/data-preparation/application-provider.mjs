// MIT. Applications owns the original saved SQL workspace and its live jobs.
import {join} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup}
  from '../../distribution/runtime-workspace/application-provider.mjs';
import {preparationManagedOptions} from './managed.mjs';
import {PREPARATION_STARTUP_SCHEMA,PREPARATION_CONNECTION_FILENAME,preparationNeed,preparationWorkspaceIdentity,
  readPreparationConnection,PreparationWorkspaceClient} from './connection.mjs';
export const PREPARATION_APPLICATION_ID='data-preparation-workspace';
export default{
  schema:APPLICATION_PROVIDER_SCHEMA,id:'data-preparation',order:1050,
  catalog({common,field}){return [{
    id:PREPARATION_APPLICATION_ID,command:'data-preparation-managed',title:'Data preparation',terminal:false,
    requiredSource:'stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/managed.mjs',
    description:'Join original CSV and JSONL editions, run saved SQL, review complete results and deliver editable customer projects.',
    fields:[field('workspaceDirectory','Saved preparation workspace','path',true,
      'Private original directory created with data-preparation init or received from a complete project archive.'),...common],
  }];},
  validateSettings(_type,settings){preparationManagedOptions(['--workspace',settings.workspaceDirectory]);},
  async prepare(_type,settings,{inputPath}){
    const {args,inputs,createDirectories,path,option}=applicationPreparation(settings,inputPath);
    const workspace=await path('workspaceDirectory','directory',false,true);
    const original=await preparationWorkspaceIdentity(workspace.path);
    option('--workspace',workspace.path);option('--workspace-sha256',original.workspaceSha256);
    return {args,inputs,createDirectories};
  },
  matchRequest(request){return !request.pythonCommand&&request.command==='data-preparation-managed';},
  createObserver(request,directory){
    return observeApplicationStartup(request,directory,text=>{
      if(!text.startsWith('{"schema":"'+PREPARATION_STARTUP_SCHEMA+'",'))return null;
      return ()=>preparationApplicationStartup(request,text);
    });
  },
};
export async function preparationApplicationStartup(request,text){
  if(request.command!=='data-preparation-managed')return null;
  let announced;try{announced=JSON.parse(text);}catch{return null;}
  if(announced?.schema!==PREPARATION_STARTUP_SCHEMA||announced.status!=='DATA_PREPARATION_READY')return null;
  const selected=preparationManagedOptions(request.args);
  preparationNeed(announced.directory===selected.directory&&
    announced.connectionFile===join(selected.directory,PREPARATION_CONNECTION_FILENAME),
  'PREPARATION_APPLICATION_CHANGED','The listener differs from the reviewed original application.',409);
  const record=await readPreparationConnection(announced.connectionFile,{directory:selected.directory,workspaceSha256:selected.workspaceSha256});
  preparationNeed(record.sha256===announced.connectionSha256&&
    ['instanceId','pid','workspaceSha256','origin','url'].every(key=>record.value[key]===announced[key])&&
    (!selected.port||Number(new URL(record.value.origin).port)===selected.port),
  'PREPARATION_APPLICATION_CHANGED','The original listener startup record changed.',409);
  const input=request.inputs?.find(value=>value.path===selected.directory&&value.kind==='directory');
  if(input?.exists)preparationNeed(record.value.directoryIdentity.dev===String(input.dev)&&
    record.value.directoryIdentity.ino===String(input.ino),'PREPARATION_APPLICATION_CHANGED',
    'The workspace directory changed after application review.',409);
  const client=await PreparationWorkspaceClient.connect(record.path,{directory:selected.directory,workspaceSha256:record.value.workspaceSha256});
  try{
    return {url:record.value.url,connectionFile:record.path,workspaceId:record.value.workspaceSha256,
      original:{schema:PREPARATION_STARTUP_SCHEMA,directory:selected.directory,workspaceSha256:record.value.workspaceSha256,
        instanceId:record.value.instanceId,pid:record.value.pid,connectionSha256:record.sha256}};
  }finally{await client.close();}
}
