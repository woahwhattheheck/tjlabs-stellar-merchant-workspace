// MIT. Native source-owned construction Applications registration.
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {model} from './host/store.mjs';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {managedOptions} from './managed.mjs';
import {readJSON,need} from './host/io.mjs';
import {readConnection,ConstructionProgressStudyClient} from './host/client.mjs';

export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:'construction-progress-study',order:1330,
 catalog({common,field}){return [{id:'construction-progress-study',command:'construction-managed',title:'Construction Progress Study Desk',terminal:false,
 requiredSource:'products/construction-progress-study/managed.mjs',
 description:"Complete thirty-family construction progress study with contract editions, measurements, variations, claims, certifications, retention, invoices, reconciled cash, supplier commitments, historical reports and complete recurring effort.",
 fields:[field('workspaceDirectory','Local construction study workspace','path',true,'Physical private directory; enter a new label below to create an unused workspace.'),field('newWorkspaceLabel','New workspace label','text',false,'Create a new workspace when this directory has no saved session. Existing sessions are resumed.'),...common]}];},
 validateSettings(_type,settings){managedOptions(['--workspace',settings.workspaceDirectory,...(settings.newWorkspaceLabel?['--new-label',settings.newWorkspaceLabel]:[])]);},
 async prepare(_type,settings,{inputPath}){
 const p=applicationPreparation(settings,inputPath),dir=await p.path('workspaceDirectory','directory',!!settings.newWorkspaceLabel,true);
 let ws;try{ws=model.validate((await readJSON(join(dir.path,'state.json'))).value);}catch(e){if(e.code!=='ENOENT'||!settings.newWorkspaceLabel)throw e;}
 p.option('--workspace',dir.path);p.option('--installation-id',ws?.installationId||randomUUID());if(!ws)p.option('--new-label',settings.newWorkspaceLabel);return {args:p.args,inputs:p.inputs,createDirectories:p.createDirectories};},
 matchRequest(request){return !request.pythonCommand&&request.command==='construction-managed';},
 createObserver(request,directory){return observeApplicationStartup(request,directory,text=>{
 if(!text.startsWith('{"schema":"stellar-forge.construction-startup.v1",'))return null;
 return ()=>inspectStartup(request,text);});}
};
export async function inspectStartup(request,text){
 const v=JSON.parse(text),selected=managedOptions(request.args);
 need(v.schema==='stellar-forge.construction-startup.v1'&&v.status==='CONSTRUCTION_READY'&&v.directory===selected.directory&&v.installationId===selected.installationId&&v.connectionFile===join(selected.directory,'construction.connection.json'),'CONSTRUCTION_STARTUP_CHANGED','Startup differs from the reviewed original workspace.',409);
 const c=await readConnection(selected.directory,{installationId:selected.installationId,instanceId:v.instanceId});
 need(c.sha256===v.connectionSha256&&['installationId','instanceId','pid','origin','url'].every(k=>c.value[k]===v[k])&&(!selected.port||Number(new URL(v.origin).port)===selected.port),'CONSTRUCTION_STARTUP_CHANGED','The private listener differs from its startup record.',409);
 const input=request.inputs?.find(i=>i.path===selected.directory&&i.kind==='directory');
 if(input?.exists)need(c.value.directoryIdentity.dev===String(input.dev)&&c.value.directoryIdentity.ino===String(input.ino),'CONSTRUCTION_DIRECTORY_CHANGED','The selected directory changed after review.',409);
 const client=await ConstructionProgressStudyClient.connect(selected.directory,{installationId:selected.installationId,instanceId:v.instanceId});try{await client.status();}finally{await client.close();}
 return {url:c.value.url,installationId:v.installationId,connectionFile:c.path,original:{schema:v.schema,instanceId:v.instanceId,installationId:v.installationId,connectionSha256:c.sha256}};
}
