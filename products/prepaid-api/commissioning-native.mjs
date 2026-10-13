// MIT. Installed commissioning through the original prepaid and Applications writers.
import {join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {requestTemplate,preparePrepaidApi,inspectPrepaidApi} from './setup.mjs';
import {initialRecord} from './records.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {absolute,ownedDirectory,ownedBytes,writeExact,encoded,parse,digest,canonical,need}
 from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import merchantApplication from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/application.mjs';
import {applicationField,applicationCommonFields} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import {createSetupDraft} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/public/application-setup.mjs';
import {readSetupFile,FAMILY_SCHEMA} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/public/application-setup-codec.mjs';
import {createCommission,openCommission,exportCommission,currentEdition,commissioningSummary,receiveOriginal,MAX_COMMISSION_BYTES}
 from './commissioning-core.mjs';
import {renderCommissioning} from './commissioning-render.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
export const COMMISSION_SOURCE_FILES=Object.freeze(['commissioning.mjs','commissioning-core.mjs','commissioning-hash.mjs',
 'commissioning-browser.mjs','commissioning-render.mjs','commissioning-native.mjs','commissioning-shell.html',
 'commissioning.css','commissioning.d.mts','COMMISSIONING.md','setup.mjs','records.mjs','workflow.mjs',
 'customer.mjs','numeric-series.mjs','cli.mjs','index.mjs','index.d.mts']);
const text=bytes=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
function outside(a,b){const rel=relative(a,b);return rel==='..'||rel.startsWith('../')||isAbsolute(rel);}
function disjoint(a,b){need(outside(a,b)&&outside(b,a),'PREPAID_COMMISSION_DIRECTORY_OVERLAP');}
async function sources(){
 const files={};for(const name of COMMISSION_SOURCE_FILES)files[name]=text(await ownedBytes(join(HERE,name),4*1024*1024,{privateMode:false}));
 return files;
}
const sourceIdentity=files=>Object.entries(files).map(([path,content])=>({path,bytes:Buffer.byteLength(content),sha256:digest(content)}));
async function inputDocument(file){return openCommission(text(await ownedBytes(absolute(file),MAX_COMMISSION_BYTES)));}
async function operation(out,input,perform){
 out=absolute(out);disjoint(HERE,out);await ownedDirectory(dirname(out));await ownedDirectory(out,{create:true});
 const lease=await acquireStateLease(out);
 try{
  const record=await initialRecord({directory:out,name:'commissioning-operation.json',lease,maxBytes:MAX_COMMISSION_BYTES+1024*1024,
   validate:value=>{need(value.schema==='stellar-forge.prepaid-commissioning-operation.v1'&&canonical(value.input)===canonical(input),
    'PREPAID_COMMISSION_RETAINED_OPERATION_CHANGED',409);return value;},
   create:async()=>({schema:'stellar-forge.prepaid-commissioning-operation.v1',id:randomUUID(),createdAt:new Date().toISOString(),input})});
  lease.assertHeld();return await perform({out,record,lease});
 }finally{await lease.close();}
}
async function publishDocument(out,state,files,lease){
 const outputs={'commissioning.json':exportCommission(state),'Prepaid_API_Commissioning.html':renderCommissioning({state,sources:files}),
  'prepaid-request.json':JSON.stringify(currentEdition(state).request,null,2)+'\n',
  'source.json':JSON.stringify({schema:'stellar-forge.prepaid-commissioning-source.v1',files:sourceIdentity(files).map(item=>({...item,content:files[item.path]}))},null,2)+'\n'};
 const manifest=[];
 for(const [name,content]of Object.entries(outputs)){lease.assertHeld();const bytes=Buffer.from(content);await writeExact(join(out,name),bytes);manifest.push({name,bytes:bytes.length,sha256:digest(bytes)});}
 return manifest;
}
/** Build one complete offline desk. Repeating the same selected output reopens exact files. */
export async function buildPrepaidCommissioning({out,document,directory,actor='merchant-operator'}={}){
 const files=await sources(),state=document?await inputDocument(document):null;
 need(state||typeof directory==='string','PREPAID_COMMISSION_DIRECTORY_REQUIRED');
 if(state&&directory!==undefined)need(absolute(directory)===currentEdition(state).directory,'PREPAID_COMMISSION_SELECTED_DIRECTORY_CHANGED');
 const selectedDirectory=state?currentEdition(state).directory:absolute(directory);
 disjoint(absolute(out),selectedDirectory);disjoint(HERE,selectedDirectory);
 const input={kind:'build',state,directory:selectedDirectory,actor,sources:sourceIdentity(files)};
 return operation(out,input,async({out,record,lease})=>{
  const actual=state??createCommission({id:record.id,request:requestTemplate(),directory:selectedDirectory,actor,
   note:'Original prepaid request template',at:record.createdAt});
  const members=await publishDocument(out,actual,files,lease);
  return {schema:'stellar-forge.prepaid-commissioning-built.v1',directory:out,summary:commissioningSummary(actual),files:members};
 });
}
function applicationsSetup(plan,result,{workspaceId,runtimeId}){
 need(typeof workspaceId==='string'&&workspaceId.length>0&&typeof runtimeId==='string'&&runtimeId.length>0,
  'PREPAID_COMMISSION_ACTUAL_RUNTIME_SELECTION_REQUIRED');
 const catalog=merchantApplication.catalog({common:applicationCommonFields,field:applicationField});
 const configuration={label:plan.request.title.slice(0,120),kind:'api-merchant-workspace',runtimeId,
  settings:{configurationFile:result.config,port:'0'}};
 const document=createSetupDraft({workspaceId,configuration,catalog,id:plan.id,now:plan.createdAt});
 const contextId='prepaid-'+plan.id,form={...configuration,settings:Object.fromEntries(Object.entries(configuration.settings).map(([k,v])=>[k,{value:String(v),checked:false}]))};
 const entry={id:contextId+'/'+configuration.kind,contextId,workspaceId,kind:configuration.kind,applicationId:null,baseRevision:null,
  updatedAt:plan.createdAt,form,baseline:form};
 document.title=plan.request.title;document.baselineComplete=true;
 document.originalDrafts={schema:FAMILY_SCHEMA,workspaceId,active:entry.id,entries:[entry]};
 return readSetupFile(JSON.stringify(document));
}
/** Read the complete selected desk, then call the unchanged original native compiler/preparer. */
export async function preparePrepaidCommissioning({document,out,workspaceId,runtimeId}={}){
 const state=await inputDocument(document),ed=currentEdition(state),files=await sources();
 need((workspaceId===undefined)===(runtimeId===undefined),'PREPAID_COMMISSION_BOTH_RUNTIME_IDENTIFIERS_REQUIRED');
 out=absolute(out);disjoint(out,ed.directory);disjoint(HERE,ed.directory);
 const input={kind:'prepare',state,workspaceId:workspaceId??null,runtimeId:runtimeId??null,sources:sourceIdentity(files)};
 return operation(out,input,async({out,record,lease})=>{
  // Publish the exact incoming document before the original preparer creates anything.
  lease.assertHeld();await writeExact(join(out,'original-commissioning.json'),encoded(state));
  const result=await preparePrepaidApi({directory:ed.directory,request:ed.request});
  const rawPlan=text(await ownedBytes(join(ed.directory,'setup.json'),4*1024*1024)),plan=JSON.parse(rawPlan);
  const inspected=await inspectPrepaidApi(ed.directory);
  need(canonical(result)===canonical(inspected),'PREPAID_COMMISSION_SETUP_CHANGED',409);
  let received=receiveOriginal(state,{kind:'setup-plan',raw:rawPlan,at:record.createdAt});
  const parent=received.captures.find(c=>c.kind==='setup-plan'&&c.editionId===ed.id&&c.sourceSha256===digest(rawPlan));
  received=receiveOriginal(received,{kind:'setup-result',raw:encoded(inspected).toString('utf8'),parentId:parent.id,at:record.createdAt});
  lease.assertHeld();await writeExact(join(out,'setup.json'),Buffer.from(rawPlan));await writeExact(join(out,'setup-complete.json'),encoded(inspected));
  let application=null;
  if(workspaceId!==undefined){application=applicationsSetup(plan,inspected,{workspaceId,runtimeId});await writeExact(join(out,'merchant-application-setup.json'),Buffer.from(JSON.stringify(application,null,2)+'\n'));}
  const members=await publishDocument(out,received,files,lease);
  const response={schema:'stellar-forge.prepaid-commissioning-prepared.v1',status:'PREPARED',directory:out,
   commissioningId:received.id,editionId:ed.id,requestSha256:digest(canonical(ed.request)),
   originalSetup:inspected,applicationSetupFile:application?join(out,'merchant-application-setup.json'):null,files:members};
  await writeExact(join(out,'prepared.json'),encoded(response));return response;
 });
}
export async function inspectPrepaidCommissioning(document){return commissioningSummary(await inputDocument(document));}
