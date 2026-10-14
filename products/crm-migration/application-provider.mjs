// MIT. Native source-owned CRM Applications registration.
import {join} from 'node:path';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {managedOptions} from './managed.mjs';
import {readJSON,need} from './host/io.mjs';
import {readConnection,CrmClient} from './host/client.mjs';
import runtime from './runtime/crm-runtime.cjs';
export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:'crm-migration',order:1120,
 catalog({common,field}){return [{id:'crm-migration',command:'crm-managed',title:'CRM migration review',terminal:false,
 requiredSource:'products/crm-migration/managed.mjs',
 description:'Retain original CRM exports, explicit ID and field maps, exact currency and directed association comparisons, reviews and complete editable receiving.',
 fields:[field('workspaceDirectory','CRM workspace','path',true,'Original private directory created or received with crm-migration.'),...common]}];},
 validateSettings(_type,settings){managedOptions(['--workspace',settings.workspaceDirectory]);},
 async prepare(_type,settings,{inputPath}){
 const p=applicationPreparation(settings,inputPath),dir=await p.path('workspaceDirectory','directory',false,true);
 const archive=(await readJSON(join(dir.path,'workspace.json'))).value,ws=runtime.workspace.restore(archive);
 p.option('--workspace',dir.path);p.option('--workspace-id',ws.id);return {args:p.args,inputs:p.inputs,createDirectories:p.createDirectories};},
 matchRequest(request){return !request.pythonCommand&&request.command==='crm-managed';},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>{
 if(!text.startsWith('{"schema":"stellar-forge.crm-startup.v1",'))return null;
 return ()=>inspectStartup(request,text);});}
};
export async function inspectStartup(request,text){
 const v=JSON.parse(text),selected=managedOptions(request.args);
 need(v.schema==='stellar-forge.crm-startup.v1'&&v.status==='CRM_WORKSPACE_READY'&&v.directory===selected.directory&&v.workspaceId===selected.workspaceId&&v.connectionFile===join(selected.directory,'crm.connection.json'),'CRM_STARTUP_CHANGED','Startup differs from the reviewed original workspace.',409);
 const c=await readConnection(selected.directory,{workspaceId:selected.workspaceId,instanceId:v.instanceId});
 need(c.sha256===v.connectionSha256&&['workspaceId','instanceId','pid','origin','url'].every(k=>c.value[k]===v[k])&&(!selected.port||Number(new URL(v.origin).port)===selected.port),'CRM_STARTUP_CHANGED','The private listener differs from its startup record.',409);
 const input=request.inputs?.find(i=>i.path===selected.directory&&i.kind==='directory');
 if(input?.exists)need(c.value.directoryIdentity.dev===String(input.dev)&&c.value.directoryIdentity.ino===String(input.ino),'CRM_DIRECTORY_CHANGED','The selected directory changed after review.',409);
 const client=await CrmClient.connect(selected.directory,{workspaceId:selected.workspaceId,instanceId:v.instanceId});try{await client.status();}finally{await client.close();}
 return {url:c.value.url,workspaceId:v.workspaceId,connectionFile:c.path,original:{schema:v.schema,instanceId:v.instanceId,workspaceId:v.workspaceId,connectionSha256:c.sha256}};
}
