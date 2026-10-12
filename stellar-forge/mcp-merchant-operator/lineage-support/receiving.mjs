#!/usr/bin/env node
// MIT. One original Service Levels incident, its saved Support case, and complete receiving.
import {constants} from 'node:fs';
import {promises as fs} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {MerchantReleaseOperator} from '../operator.mjs';
import {readMerchantConfig} from '../config.mjs';
import {openCaseStore,retainCaseArtifact,caseMetadata} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-store.mjs';
import {parseWorkspace} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/workspace-file.mjs';
import {importRuntimeHandoff} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/runtime-support.mjs';
import {receiveBundle,verifyBundle} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/store.mjs';
import {deliverSupportCase,downloadMaterialFile,downloadLineageWorkspace} from './cli.mjs';
import {bytesHash,valueHash,requireValue,object,uuid,hash,alias,text,readMaterials,materialSummary,MAX_RETAINED_MATERIAL_BYTES} from './model.mjs';

const SCHEMA='stellar-forge.lineage-support-receiving.v1';
const PREFIX='merchant_lineage_support_';
const json=value=>JSON.stringify(value,null,2)+'\n';
const clone=value=>structuredClone(value);
const equal=(a,b)=>valueHash(a)===valueHash(b);
const withoutReplay=value=>{const result=clone(value);delete result.replayed;return result;};
async function privateDirectory(path){
 requireValue(isAbsolute(path),'LINEAGE_SUPPORT_RECEIVING','Select an absolute private receiving directory.');
 await fs.mkdir(path,{recursive:true,mode:0o700});
 const stat=await fs.lstat(path);
 requireValue(stat.isDirectory()&&!stat.isSymbolicLink()&&(process.platform==='win32'||!(stat.mode&0o077)),
  'LINEAGE_SUPPORT_RECEIVING','Use a real private receiving directory (0700).');return path;
}
async function readBytes(path,maximum=256*1024*1024){
 const file=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await file.stat();
  requireValue(before.isFile()&&before.size<=maximum&&(process.platform==='win32'||!(before.mode&0o077)),
   'LINEAGE_SUPPORT_RECEIVING','Use a complete private original file within its declared limit.');
  const bytes=await file.readFile(),after=await file.stat();
  requireValue(bytes.length===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs,
   'LINEAGE_SUPPORT_RECEIVING','An original file changed while being received.',409);return bytes;
 }finally{await file.close();}
}
async function readJson(path,maximum){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(path,maximum)));}
async function optionalJson(path,maximum){try{return await readJson(path,maximum);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function retainJson(path,value){await retainCaseArtifact(path,Buffer.from(json(value)));return value;}
async function fileDigest(path){
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await handle.stat();requireValue(before.isFile()&&(process.platform==='win32'||!(before.mode&0o077)),
   'LINEAGE_SUPPORT_RECEIVING','An original artifact is not a private regular file.',409);
  const hash=createHash('sha256'),buffer=Buffer.alloc(262144);let bytes=0;
  for(;;){const part=await handle.read(buffer,0,buffer.length,null);if(!part.bytesRead)break;bytes+=part.bytesRead;hash.update(buffer.subarray(0,part.bytesRead));}
  const after=await handle.stat();requireValue(bytes===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs,
   'LINEAGE_SUPPORT_RECEIVING','An original artifact changed during verification.',409);
  return {path,bytes,sha256:hash.digest('hex')};
 }finally{await handle.close();}
}
function normalizeSelection(value){
 object(value,['workspace','incidentId','actor','sourceCommit','caseId','caseName','metadata','assignmentOwner','assignmentReason','resolutionReason','reference']);
 requireValue(typeof value.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(value.sourceCommit),
  'LINEAGE_SUPPORT_RECEIVING','Select the full installed source commit.');
 return {workspace:alias(value.workspace),incidentId:hash(value.incidentId),actor:text(value.actor,'operator',200),
  sourceCommit:value.sourceCommit,caseId:value.caseId===undefined?null:uuid(value.caseId,'original case'),
  caseName:value.caseName===undefined?null:text(value.caseName,'case name',480),metadata:value.metadata===undefined?null:caseMetadata(value.metadata),
  assignmentOwner:text(value.assignmentOwner??value.actor,'incident owner',400),
  assignmentReason:text(value.assignmentReason??'Assign the retained original service incident for its reviewed Support case receiving.','assignment reason',6000),
  resolutionReason:text(value.resolutionReason??'The original saved assessment is clear. The complete source and reviewed Support case have been received.','resolution reason',6000),
  reference:text(value.reference??'','original receiving reference',4096,{empty:true})};
}
/** The complete original request is retained before each native mutation. */
class Journal{
 constructor(directory,operation){this.directory=directory;this.operation=operation;}
 path(name,kind){requireValue(/^[a-z0-9][a-z0-9-]{0,79}$/.test(name),'LINEAGE_SUPPORT_RECEIVING','Invalid original phase name.');return join(this.directory,name+'.'+kind+'.json');}
 async prepare(name,build){
  const path=this.path(name,'request'),saved=await optionalJson(path);
  if(saved){requireValue(saved.schema===SCHEMA&&saved.operationId===this.operation.id&&saved.name===name&&saved.requestSha256===valueHash(saved.request),
   'LINEAGE_SUPPORT_RECEIVING','A retained phase belongs to different original request bytes.',409);return saved;}
  const request=await build(),prepared={schema:SCHEMA,operationId:this.operation.id,name,request,requestSha256:valueHash(request)};
  await retainJson(path,prepared);return prepared;
 }
 async perform(name,build,execute){
  const prepared=await this.prepare(name,build),path=this.path(name,'result'),saved=await optionalJson(path);
  if(saved){requireValue(saved.schema===SCHEMA&&saved.operationId===this.operation.id&&saved.name===name&&saved.requestSha256===prepared.requestSha256&&
   saved.resultSha256===valueHash(saved.result),'LINEAGE_SUPPORT_RECEIVING','A retained native phase result changed.',409);return saved.result;}
  const result=await execute(clone(prepared.request)),receipt={schema:SCHEMA,operationId:this.operation.id,name,
   requestSha256:prepared.requestSha256,result,resultSha256:valueHash(result)};
  await retainJson(path,receipt);return result;
 }
 async call(name,build,operator){return this.perform(name,build,request=>operator.call(request.tool,request.arguments));}
}
async function completeMaterials(operator,id,revision){
 let offset=0;const rows=[];let total=null;
 for(;;){
  const page=await operator.call(PREFIX+'read',{id,revision,offset,limit:50});
  requireValue(page.case?.id===id&&page.case.revision===revision&&page.offset===offset&&Array.isArray(page.materials)&&
   Number.isSafeInteger(page.total)&&(total===null||total===page.total),'LINEAGE_SUPPORT_RECEIVING','The selected original case material page changed.',409);
  total=page.total;rows.push(...page.materials);
  if(page.nextOffset===null)break;
  requireValue(page.nextOffset===offset+page.materials.length&&page.nextOffset>offset,'LINEAGE_SUPPORT_RECEIVING','An original material page did not advance.',409);offset=page.nextOffset;
 }
 requireValue(rows.length===total&&new Set(rows.map(row=>row.id)).size===rows.length,'LINEAGE_SUPPORT_RECEIVING','The complete original case material set is inconsistent.',409);
 return rows;
}
async function originalOperations(operator,workspace,revision,workspaceId){
 let offset=0;const rows=[];let total=null;
 for(;;){
  const page=await operator.call('merchant_lineage_records_read',{workspace,collection:'operations',expectedRevision:revision,offset,limit:50});
  requireValue(page.workspaceId===workspaceId&&page.revision===revision&&page.collection==='operations'&&page.offset===offset&&
   Array.isArray(page.items)&&page.returned===page.items.length&&(total===null||page.total===total),
   'LINEAGE_SUPPORT_RECEIVING','The original operation journal changed during reading.',409);total=page.total;rows.push(...page.items);
  if(page.nextOffset===null)break;
  requireValue(page.nextOffset===offset+page.items.length&&page.nextOffset>offset,'LINEAGE_SUPPORT_RECEIVING','The original journal continuation did not advance.',409);offset=page.nextOffset;
 }
 requireValue(rows.length===total,'LINEAGE_SUPPORT_RECEIVING','The original operation journal is incomplete.',409);return rows;
}
async function retainedMaterial({operator,directory,result}){
 const destination=join(await privateDirectory(join(directory,'materials')),result.material.id+'.json');
 await downloadMaterialFile({operator,request:{id:result.case.id,revision:result.case.revision,
  materialId:result.material.id,expectedMaterialSha256:result.material.sha256,name:'material.json'},destination});
 const material=await readJson(destination,MAX_RETAINED_MATERIAL_BYTES);
 requireValue(material.id===result.material.id&&material.sha256===result.material.sha256,'LINEAGE_SUPPORT_RECEIVING','The received material identity differs.',409);
 return material;
}
function originalDecision(intent,returned){
 requireValue(returned?.workspaceId===intent.context.workspace.workspaceId&&returned.operationId===intent.native.args.operationId&&
  returned.incident?.id===intent.context.incidentId&&returned.revision>intent.native.args.expectedRevision,
  'LINEAGE_SUPPORT_RECEIVING','The actual native return differs from the saved original intent.',409);
}
async function verifyArtifacts(artifacts){
 for(const item of artifacts){const actual=await fileDigest(item.path);
  requireValue(actual.bytes===item.bytes&&actual.sha256===item.sha256,'LINEAGE_SUPPORT_RECEIVING','A complete receiving artifact changed: '+item.name,409);}
}
async function receiveSupportDelivery(delivery,target){
 const manifest=await readJson(join(delivery,'support-export.json'),65536),summary=await readJson(join(delivery,'case.json'));
 const workspaceText=new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(join(delivery,'merchant-workspace.json')));
 requireValue(summary.id===manifest.case.id&&summary.revision===manifest.case.revision&&bytesHash(workspaceText)===manifest.case.workspaceSha256,
  'LINEAGE_SUPPORT_RECEIVING','The original case export identity or full workspace differs.',409);
 let supportText=null;
 if(manifest.case.supportSha256!==null){
  const handoff=await importRuntimeHandoff(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(join(delivery,'merchant-support.json'))));
  supportText=handoff.supportText;
  requireValue(bytesHash(supportText)===manifest.case.supportSha256&&bytesHash(handoff.workspaceText)===manifest.case.workspaceSha256,
   'LINEAGE_SUPPORT_RECEIVING','The complete original Support handoff differs from the selected case.',409);
 }
 const store=await openCaseStore(target);let existing;
 try{existing=await store.read(summary.id);}catch(error){if(error.code!=='CASE_NOT_FOUND')throw error;}
 if(existing)requireValue(existing.workspaceText===workspaceText&&existing.supportText===supportText&&equal(existing.metadata,summary.metadata),
  'LINEAGE_SUPPORT_RECEIVING','The named receiving case already contains different original bytes.',409);
 else await store.save({id:summary.id,expectedRevision:null,workspaceText,supportText,metadata:summary.metadata});
 const received=await (await openCaseStore(target)).read(summary.id),workspace=await parseWorkspace(received.workspaceText);
 requireValue(received.workspaceText===workspaceText&&received.supportText===supportText&&equal(received.metadata,summary.metadata),
  'LINEAGE_SUPPORT_RECEIVING','The freshly opened original receiving case differs.',409);
 const materials=readMaterials(workspace,summary.id);
 return {id:received.id,revision:received.revision,sourceRevision:summary.revision,workspaceSha256:bytesHash(received.workspaceText),
  supportSha256:received.supportText===null?null:bytesHash(received.supportText),metadata:received.metadata,
  materials:materials.map(materialSummary),directory:target};
}
async function receiveLineageDelivery(path,target,intents){
 const bytes=await readBytes(path),verified=verifyBundle(bytes);
 requireValue(verified.application.size>0,'LINEAGE_SUPPORT_RECEIVING','The complete original Lineage export must include its application.');
 let received=await optionalJson(join(target,'received.json'));
 if(received)requireValue(received.packageSha256===verified.packageSha256&&received.payloadSha256===verified.payloadSha256,
  'LINEAGE_SUPPORT_RECEIVING','The named receiving directory belongs to another original workspace export.',409);
 else await receiveBundle(bytes,target);
 const native=await import(pathToFileURL(join(target,'application','store.mjs')).href);
 const store=new native.LineageWorkspace(target),before=await store.read();
 for(const [id,original] of verified.objects){const actual=await store.readObject(id);
  requireValue(actual.length===original.length&&bytesHash(actual)===id,'LINEAGE_SUPPORT_RECEIVING','A complete received original source object differs.',409);}
 for(const [name,original] of verified.application){const actual=await readBytes(join(target,'application',name));
  requireValue(actual.length===original.length&&bytesHash(actual)===bytesHash(original),'LINEAGE_SUPPORT_RECEIVING','A complete received native application source differs: '+name,409);}
 requireValue(equal(before,verified.state),'LINEAGE_SUPPORT_RECEIVING','The freshly reopened original Lineage state differs from its export.',409);
 const replayed=[];
 for(const intent of intents){
  const original=before.operations.find(row=>row.id===intent.native.args.operationId);
  requireValue(original,'LINEAGE_SUPPORT_RECEIVING','The complete received journal lacks the saved Support return.',409);
  const result=await store.dispatch(intent.native.action,clone(intent.native.args));originalDecision(intent,result);
  requireValue(result.replayed===true&&equal(withoutReplay(result),original.result),
   'LINEAGE_SUPPORT_RECEIVING','The received original native operation did not replay its exact saved result.',409);
  replayed.push({operationId:intent.native.args.operationId,resultSha256:valueHash(original.result)});
 }
 const after=await store.read();
 requireValue(equal(after,before),'LINEAGE_SUPPORT_RECEIVING','Replaying the complete original received operation wrote new native history.',409);
 return {directory:target,workspaceId:after.workspaceId,revision:after.revision,stateSha256:valueHash(after),packageSha256:verified.packageSha256,
  payloadSha256:verified.payloadSha256,applicationFiles:verified.application.size,replayed};
}
/**
 * Operate the selected original incident through one existing Merchant operator.
 * Call after the original Service Levels owner has completed its clear assessment.
 * The caller owns that original runtime; this helper never closes the supplied operator.
 */
export async function receiveLineageSupport({operator,configuration,directory,selection}){
 requireValue(typeof operator?.call==='function'&&configuration?.support?.casesDirectory&&configuration?.openlineageWorkspaces,
  'LINEAGE_SUPPORT_RECEIVING','Select the existing configured Support and Lineage owners.');
 const selected=normalizeSelection(selection),root=await privateDirectory(resolve(directory));
 let operation=await optionalJson(join(root,'operation.json'));
 if(operation)requireValue(operation.schema===SCHEMA&&equal(operation.selection,selected)&&operation.selectionSha256===valueHash(selected),
  'LINEAGE_SUPPORT_RECEIVING','Continue the same original receiving directory and selection.',409);
 else{operation={schema:SCHEMA,id:randomUUID(),selection:clone(selected),selectionSha256:valueHash(selected),
  caseId:selected.caseId??randomUUID(),createdAt:new Date().toISOString()};await retainJson(join(root,'operation.json'),operation);}
 const final=await optionalJson(join(root,'result.json'));
 if(final){requireValue(final.schema===SCHEMA&&final.operationId===operation.id&&final.selectionSha256===operation.selectionSha256,
  'LINEAGE_SUPPORT_RECEIVING','The saved complete result belongs to another original operation.',409);
  await verifyArtifacts(final.artifacts);
  const received=await receiveSupportDelivery(join(root,'customer-case'),final.receivedCase.directory);
  requireValue(equal(received,final.receivedCase),'LINEAGE_SUPPORT_RECEIVING','The retained received case changed after completion.',409);
  const intents=await Promise.all([final.assignment.intentId,final.resolution.intentId].map(id=>readJson(join(root,'materials',id+'.json'),MAX_RETAINED_MATERIAL_BYTES)));
  const original=final.artifacts.find(row=>row.name.startsWith('customer-lineage/'));
  const lineage=await receiveLineageDelivery(original.path,final.receivedLineage.directory,intents);
  requireValue(equal(lineage,final.receivedLineage),'LINEAGE_SUPPORT_RECEIVING','The retained original Lineage receiving changed after completion.',409);
  return {...final,replayed:true};
 }
 const journal=new Journal(await privateDirectory(join(root,'phases')),operation);
 const first=await journal.call('original-source',()=>({tool:'merchant_lineage_workspace_metadata',arguments:{workspace:selected.workspace}}),operator);
 const now=await operator.call('merchant_lineage_workspace_metadata',{workspace:selected.workspace});
 requireValue(now.workspaceId===first.workspaceId&&now.createdAt===first.createdAt,'LINEAGE_SUPPORT_RECEIVING','The selected original native workspace changed identity.',409);
 const levels=await journal.call('original-service-levels',()=>({tool:'merchant_lineage_service_levels_read',arguments:{workspace:selected.workspace}}),operator);
 const originalIncident=levels.incidents?.find(row=>row.id===selected.incidentId);
 requireValue(levels.workspaceId===first.workspaceId&&originalIncident,'LINEAGE_SUPPORT_RECEIVING','Choose an actual saved Service Levels incident.',409);
 requireValue(!originalIncident.active,'LINEAGE_SUPPORT_CONDITION_ACTIVE','Complete the original Service Levels clear assessment before this full resolution receiving journey. The live bridge can retain and assign an active incident separately.',409);
 const preview=await journal.call('capture-preview',async()=>{
  let current=null;try{current=await operator.call('merchant_case_read',{id:operation.caseId});}catch(error){if(error.code!=='CASE_NOT_FOUND')throw error;}
  return {tool:PREFIX+'preview',arguments:{id:operation.caseId,expectedRevision:current?.revision??null,workspace:selected.workspace,
   incidentId:selected.incidentId,name:selected.caseName??current?.name??'Lineage service incident',metadata:selected.metadata??current?.metadata??caseMetadata({}),actor:selected.actor,reference:selected.reference}};
 },operator);
 const capture=await journal.call('capture-save',async()=>{
  const input=(await journal.prepare('capture-preview',()=>{throw Error('The original capture preview is required');})).request.arguments;
  return {tool:PREFIX+'save',arguments:{...input,requestId:randomUUID(),expectedPreviewSha256:preview.previewSha256}};
 },operator);
 const captureSource=await retainedMaterial({operator,directory:root,result:capture});
 requireValue(captureSource.context.workspace.workspaceId===first.workspaceId,'LINEAGE_SUPPORT_RECEIVING','The case capture is not this original source.',409);
 const assignPreview=await journal.call('assignment-preview',async()=>{
  const current=await operator.call('merchant_case_read',{id:operation.caseId});
  return {tool:PREFIX+'return_preview',arguments:{id:operation.caseId,expectedRevision:current.revision,captureId:capture.material.id,
   workspace:selected.workspace,decision:'assign',owner:selected.assignmentOwner,reason:selected.assignmentReason,actor:selected.actor,reference:selected.reference}};
 },operator);
 const assignedIntent=await journal.call('assignment-prepare',async()=>{
  const input=(await journal.prepare('assignment-preview',()=>{throw Error('The original assignment preview is required');})).request.arguments;
  return {tool:PREFIX+'return_prepare',arguments:{...input,requestId:randomUUID(),expectedPreviewSha256:assignPreview.previewSha256}};
 },operator);
 const assignment=await retainedMaterial({operator,directory:root,result:assignedIntent});
 const unrelated=await journal.call('concurrent-case-note',async()=>{
  const current=await operator.call('merchant_case_read',{id:operation.caseId});
  return {tool:'merchant_case_update',arguments:{id:operation.caseId,expectedRevision:current.revision,
   metadata:{nextAction:'Receive the original Lineage source and customer case; operation '+operation.id}}};
 },operator);
 const acceptedNative=await journal.call('original-native-accepted',()=>({
  tool:'merchant_lineage_service_levels_incident_review',arguments:{workspace:selected.workspace,...clone(assignment.native.args)}
 }),operator);
 originalDecision(assignment,acceptedNative);
 // The native operation has actually committed; its return has deliberately not
 // been given to the case bridge. The next original intent execution recovers it.
 const assigned=await journal.call('assignment-recover',()=>({tool:PREFIX+'return_execute',
  arguments:{id:operation.caseId,intentId:assignment.id,expectedIntentSha256:assignment.sha256,workspace:selected.workspace}}),operator);
 requireValue(assigned.state==='CONFIRMED'&&equal(withoutReplay(acceptedNative),assigned.result),
  'LINEAGE_SUPPORT_RECEIVING','The bridge did not recover the original accepted native result.',409);
 const assignmentReplay=await operator.call(PREFIX+'return_execute',{id:operation.caseId,intentId:assignment.id,
  expectedIntentSha256:assignment.sha256,workspace:selected.workspace});
 requireValue(assignmentReplay.replayed===true&&equal(assignmentReplay.result,assigned.result)&&assignmentReplay.material.sha256===assigned.material.sha256,
  'LINEAGE_SUPPORT_RECEIVING','Retrying the exact saved intent produced a different original outcome.',409);
 const afterAssignment=await operator.call('merchant_case_read',{id:operation.caseId});
 const note=(await journal.prepare('concurrent-case-note',()=>{throw Error('The original note is required');})).request.arguments.metadata.nextAction;
 requireValue(afterAssignment.metadata.nextAction===note&&afterAssignment.revision!==assignedIntent.case.revision,
  'LINEAGE_SUPPORT_RECEIVING','The original return lost the concurrent unrelated case note.',409);
 const resolutionPreview=await journal.call('resolution-preview',async()=>{
  const current=await operator.call('merchant_case_read',{id:operation.caseId});
  return {tool:PREFIX+'return_preview',arguments:{id:operation.caseId,expectedRevision:current.revision,captureId:capture.material.id,
   workspace:selected.workspace,decision:'resolve',owner:selected.assignmentOwner,reason:selected.resolutionReason,actor:selected.actor,reference:selected.reference}};
 },operator);
 const resolutionIntent=await journal.call('resolution-prepare',async()=>{
  const input=(await journal.prepare('resolution-preview',()=>{throw Error('The original resolution preview is required');})).request.arguments;
  return {tool:PREFIX+'return_prepare',arguments:{...input,requestId:randomUUID(),expectedPreviewSha256:resolutionPreview.previewSha256}};
 },operator);
 const resolution=await retainedMaterial({operator,directory:root,result:resolutionIntent});
 const resolved=await journal.call('resolution-execute',()=>({tool:PREFIX+'return_execute',arguments:{id:operation.caseId,
  intentId:resolution.id,expectedIntentSha256:resolution.sha256,workspace:selected.workspace}}),operator);
 requireValue(resolved.state==='CONFIRMED'&&resolved.result.incident.status==='resolved',
  'LINEAGE_SUPPORT_RECEIVING','The original reviewed resolution was not confirmed.',409);
 const finalSelection=await journal.perform('final-selection',()=>({caseId:operation.caseId,workspace:selected.workspace}),async()=>{
  const current=await operator.call('merchant_case_read',{id:operation.caseId});
  const metadata=await operator.call('merchant_lineage_workspace_metadata',{workspace:selected.workspace});
  const operations=await originalOperations(operator,selected.workspace,metadata.revision,metadata.workspaceId);
  for(const intent of [assignment,resolution])requireValue(operations.filter(row=>row.id===intent.native.args.operationId).length===1,
   'LINEAGE_SUPPORT_RECEIVING','The original journal must retain exactly one of each reviewed native return.',409);
  return {case:{id:current.id,revision:current.revision,workspaceSha256:current.workspaceSha256,supportSha256:current.supportSha256},
   workspace:metadata,materials:await completeMaterials(operator,current.id,current.revision),
   returns:[assignment,resolution].map(intent=>({intentId:intent.id,operationId:intent.native.args.operationId,
    resultSha256:valueHash(operations.find(row=>row.id===intent.native.args.operationId).result)}))};
 });
 const caseDelivery=await journal.perform('complete-case-delivery',()=>({id:operation.caseId,
  expectedRevision:finalSelection.case.revision,exportId:'lineage-support-'+operation.id}),request=>
  deliverSupportCase({operator,configuration,request,directory:join(root,'customer-case')}));
 const nativeExport=await journal.call('complete-lineage-export',()=>({tool:'merchant_lineage_workspace_export',
  arguments:{workspace:selected.workspace,includeApplication:true}}),operator);
 requireValue(nativeExport.workspaceId===finalSelection.workspace.workspaceId&&nativeExport.revision===finalSelection.workspace.revision,
  'LINEAGE_SUPPORT_RECEIVING','The original workspace changed before its complete export; retain this selected operation for review.',409);
 const lineageDelivery=await downloadLineageWorkspace({operator,workspace:selected.workspace,selection:nativeExport,
  destination:join(await privateDirectory(join(root,'customer-lineage')),nativeExport.name)});
 const sourceFiles=[];
 for(const material of finalSelection.materials){
  const names=['material.json',...(material.files??[]).map(row=>row.name)];
  for(const name of names){
   const folder=await privateDirectory(join(root,'original-material-files',material.id,dirname(name)));
   const destination=join(folder,name.split('/').at(-1));
   const actual=await downloadMaterialFile({operator,request:{id:operation.caseId,revision:finalSelection.case.revision,
    materialId:material.id,expectedMaterialSha256:material.sha256,name},destination});
   sourceFiles.push({name:'original-material-files/'+material.id+'/'+name,path:actual.path,bytes:actual.bytes,sha256:actual.sha256});
  }
 }
 const receivedCase=await journal.perform('receive-case',()=>({source:join(root,'customer-case'),target:join(root,'received-support'),
  manifestSha256:caseDelivery.manifestSha256}),request=>receiveSupportDelivery(request.source,request.target));
 requireValue(equal(receivedCase.materials,finalSelection.materials)&&receivedCase.metadata.nextAction===note,
  'LINEAGE_SUPPORT_RECEIVING','The complete received case lost original materials or the saved unrelated note.',409);
 const receivedLineage=await journal.perform('receive-lineage',()=>({source:lineageDelivery.path,target:join(root,'received-lineage'),
  packageSha256:nativeExport.id}),request=>receiveLineageDelivery(request.source,request.target,[assignment,resolution]));
 const artifacts=[...caseDelivery.files.map(row=>({...row,name:'customer-case/'+row.name})),
  {name:'customer-lineage/'+nativeExport.name,path:lineageDelivery.path,bytes:lineageDelivery.bytes,sha256:lineageDelivery.sha256},...sourceFiles];
 for(const name of ['operation.json',...await fs.readdir(journal.directory).then(names=>names.filter(name=>name.endsWith('.json')).map(name=>'phases/'+name))]){
  const actual=await fileDigest(join(root,name));artifacts.push({name,...actual});
 }
 await verifyArtifacts(artifacts);
 const result={schema:SCHEMA,operationId:operation.id,selectionSha256:operation.selectionSha256,sourceCommit:selected.sourceCommit,
  original:{workspace:first.workspaceId,initialRevision:first.revision,incidentId:selected.incidentId,case:finalSelection.case},
  capture:{id:capture.material.id,sha256:capture.material.sha256},
  assignment:{intentId:assignment.id,outcomeId:assigned.material.id,operationId:assignment.native.args.operationId,
   nativeAcceptedBeforeCaseRecovery:true,exactRetry:true,concurrentCaseNotePreserved:true},
  resolution:{intentId:resolution.id,outcomeId:resolved.material.id,operationId:resolution.native.args.operationId,state:resolved.state},
  finalNativeRevision:finalSelection.workspace.revision,receivedCase,receivedLineage,artifacts,replayed:false};
 await retainJson(join(root,'result.json'),result);return result;
}
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||['--help','-h'].includes(argv[0])){
  console.log('node receiving.mjs --config /private/merchant.json --selection /private/original-incident.json --directory /private/original-lineage-support-receiving\n\nSelection fields: workspace, incidentId, actor, sourceCommit; optional original caseId, caseName, metadata, assignmentOwner, assignmentReason, resolutionReason, reference. Continue the same directory and exact selection. The selected original Service Levels owner must have recorded a clear assessment before resolution.');return 0;
 }
 const options={};
 while(argv.length){const key=argv.shift();requireValue(['--config','--selection','--directory'].includes(key)&&!Object.hasOwn(options,key),
  'LINEAGE_SUPPORT_RECEIVING','Use the declared receiving options.');
  const value=argv.shift();requireValue(value&&isAbsolute(value),'LINEAGE_SUPPORT_RECEIVING','Use absolute original configuration, selection and receiving paths.');options[key]=value;}
 requireValue(Object.keys(options).length===3,'LINEAGE_SUPPORT_RECEIVING','Supply the complete original receiving selection.');
 const configuration=await readMerchantConfig(options['--config']),selection=await readJson(options['--selection'],128*1024);
 const operator=new MerchantReleaseOperator(configuration);
 try{const result=await receiveLineageSupport({operator,configuration,selection,directory:options['--directory']});console.log(json(result));return 0;}
 finally{await operator.close();}
}
if(process.argv[1]&&await fs.realpath(resolve(process.argv[1])).then(path=>path===fileURLToPath(import.meta.url),()=>false))
 main().then(code=>{process.exitCode=code;}).catch(error=>{
  console.error(json({code:error.code??'LINEAGE_SUPPORT_RECEIVING_FAILED',message:error.message,status:error.status??500,
   ...(error.details?{details:error.details}:{})}));process.exitCode=1;
 });
