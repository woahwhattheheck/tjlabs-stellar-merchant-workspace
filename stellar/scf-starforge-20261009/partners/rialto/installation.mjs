// MIT — Original Rialto request into the maintained Customer installations workflow.
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {need,canonical} from './core.mjs';
import {sha,json,read,readJson,exists,privateDir,writeNew,lock,copyOriginal,inventory,pack} from './io.mjs';
import {prepareInstallation,renderWorkorder} from '../../../scf_2026/sf49_data_commissioning/installation-workorders/prepare-core.mjs';
import {readProfile} from '../../../scf_2026/sf49_data_commissioning/installation-workorders/profiles.mjs';

const SCHEMA='stellar-forge.rialto-installation-preparation.v1';
const PROFILE='rialto-customer';
const copy=value=>JSON.parse(JSON.stringify(value));
const missing=value=>value===undefined||value===null||value==='';
const required=(options,key)=>{need(typeof options[key]==='string'&&options[key].length,'--'+key+' is required');return options[key];};
function safeMember(value){need(typeof value==='string'&&!value.includes('\\')&&!value.includes('\0')&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Invalid retained preparation member');return value;}
async function sourceJson(file){
 file=path.resolve(file);const info=await fs.lstat(file);
 need(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024,'Use a complete regular JSON input up to 2 MiB');
 const raw=await read(file);need(raw.length<=2*1024*1024,'Original JSON exceeds 2 MiB');
 return{value:JSON.parse(raw.toString('utf8')),raw,source:{file,bytes:raw.length,sha256:sha(raw)}};
}
function descriptor(file){return{path:file.path,bytes:file.bytes,sha256:file.sha256};}
function requestSummary(selected,selectionSha256){
 const original=selected.value;
 return{
  schema:'stellar-forge.rialto-installation-request.v1',
  selectionSha256,catalogueSha256:original.catalogueSha256,intentId:original.intentId,
  originalResource:original.originalListing.resource,resourceKey:original.resourceKey,
  rowIndex:original.rowIndex,acceptIndex:original.acceptIndex,
  method:original.method,url:original.url,pathBinding:original.pathBinding??null,
  advertisedTerms:copy(original.selectedTerms),maxAtomic:original.maxAtomic,
  task:original.task,usefulOutput:original.usefulOutput,
  body:original.body??null,headersSha256:sha(json(selected.headers)),
  originalSelection:'request/selection.json',originalCatalogue:'request/source/catalogue.json'
 };
}
/** Source fields augment actual selected bindings; original commercial and native records stay intact. */
export function requestBindings(bindings,request){
 const result=copy(bindings);
 need(result.profile===PROFILE,'Select the original rialto-customer profile');
 result.task??={};result.source??={};
 const terms=request.advertisedTerms;
 for(const [key,original] of [['network',terms.network],['asset',terms.asset],['recipient',terms.payTo]])
  if(!missing(result.payment?.[key]))need(result.payment[key]===original,'Installation payment '+key+' differs from the selected original Rialto request');
 if(result.payment?.priceAtomic!==undefined&&result.payment.priceAtomic!==null)
  need(/^[1-9][0-9]*$/.test(result.payment.priceAtomic)&&BigInt(result.payment.priceAtomic)<=BigInt(request.maxAtomic),'Installation unit price exceeds the selected original request cap');
 if(missing(result.task.name)&&request.task?.trim())result.task.name=request.task.length<=4000?request.task:'Complete the original Rialto customer task retained in RIALTO_REQUEST.md';
 if(missing(result.task.completeOutput)&&request.usefulOutput?.trim())result.task.completeOutput=request.usefulOutput.length<=4000?request.usefulOutput:'Receive the complete useful-output requirement retained in RIALTO_REQUEST.md';
 if(missing(result.task.request)){
  const detail=request.method+' '+request.url+'\nOriginal intent: '+request.intentId+'\nRetained request selection: '+request.selectionSha256+'\nUse the original request body and headers, actual merchant challenge and native SF88 review/receiving. Full source: request/selection.json and RIALTO_REQUEST.md.';
  result.task.request=detail.length<=8000?detail:'Execute the exact original '+request.method+' request from request/selection.json, intent '+request.intentId+'. The complete URL, body/header identities, source and customer task are retained in RIALTO_REQUEST.md. Continue the original actual challenge and native SF88 approval/receiving.';
 }
 if(missing(result.source.reference))result.source.reference='Complete retained Rialto request selection '+request.selectionSha256+'; catalogue '+request.catalogueSha256+'; original intent '+request.intentId+'. Full request, all original catalogue pages and available native history are retained under request/.';
 return result;
}
function requestMarkdown(request){
 return '# Original Rialto customer request\n\n'+
  'The complete selected request and original catalogue stay in request/. Native payment and actual result records remain with their original operation.\n\n'+
  '## Customer task\n\n'+request.task+'\n\n## Complete useful output\n\n'+request.usefulOutput+
  '\n\n## Original request and source\n\n~~~json\n'+JSON.stringify(request,null,2)+'\n~~~\n\n'+
  '## Continue the original operation\n\nReceive a complete private packet with the installed Rialto receive command. Before executing a received native buyer operation, use the original SF88 --import-operation to reconstruct machine-local paths and review it with the new response output. Use the current original customer intent to recover an interrupted request. The Customer installations preview/save and full-case export/import stay in the existing native SF47 case.\n';
}
export async function inspectInstallation(root,{verifyRequest}){
 root=await privateDir(root);
 return lock(root,async()=>{
  const receipt=await sourceJson(path.join(root,'preparation.json')),r=receipt.value;
  need(r.schema===SCHEMA&&Array.isArray(r.files)&&r.files.length>0,'Complete original Rialto installation preparation required');
  const actual=await inventory(root),byPath=new Map(actual.map(f=>[f.path,f])),seen=new Set();
  for(const file of r.files){safeMember(file.path);need(!seen.has(file.path),'Duplicate retained preparation member');seen.add(file.path);const found=byPath.get(file.path);need(found&&found.bytes===file.bytes&&found.sha256===file.sha256,'Original installation member changed: '+file.path);}
  need(['source/seed.json','source/bindings.json','source/profile.json','derived-bindings.json','request/selection.json','request/source/catalogue.json','RIALTO_REQUEST.json','RIALTO_REQUEST.md','installation-input.json','installation-preview-input.json','WORKORDER.md'].every(p=>seen.has(p)),'Preparation omits a complete original input or output');
  const selected=await verifyRequest(path.join(root,'request'));
  const selectionSha256=sha(await read(path.join(root,'request','selection.json')));
  need(selectionSha256===r.inputs.requestSelectionSha256&&selected.value.catalogueSha256===r.request.catalogueSha256,'Original request selection identity changed');
  need(canonical(requestSummary(selected,selectionSha256))===canonical(r.request),'Retained request summary differs from the original request');
  for(const key of ['seed','bindings','profile'])need(byPath.get('source/'+key+'.json').sha256===r.inputs[key].sha256&&byPath.get('source/'+key+'.json').bytes===r.inputs[key].bytes,'Original '+key+' input identity changed');
  const retainedSeed=await readJson(path.join(root,'source','seed.json'));
  need(canonical(retainedSeed.source)===canonical(r.source),'Original native case source changed');
  const document=await readJson(path.join(root,'installation-input.json'));
  need(document.stage==='PLANNED','Original preparation stage changed');
  return{directory:root,schema:SCHEMA,profile:PROFILE,request:copy(r.request),source:copy(r.source),workshareCaseId:r.workshareCaseId,selections:copy(r.selections),files:r.files.length,additionalFiles:actual.filter(f=>!seen.has(f.path)&&f.path!=='preparation.json').map(f=>f.path),preparationSha256:receipt.source.sha256,inputs:copy(r.inputs),document:path.join(root,'installation-input.json'),workorder:path.join(root,'WORKORDER.md')};
 });
}
export async function prepareFromRequest(options,{verifyRequest}){
 need(typeof verifyRequest==='function','Use the original request verifier');
 const seed=await sourceJson(required(options,'seed')),bindings=await sourceJson(required(options,'bindings'));
 const source=await privateDir(required(options,'directory')),out=path.resolve(required(options,'out'));
 need(out!==source&&!out.startsWith(source+path.sep),'Installation output must be outside its original request');
 const sourceSelectionSha256=sha(await read(path.join(source,'selection.json')));
 if(await exists(out)){
  const retained=await inspectInstallation(out,{verifyRequest});
  need(retained.inputs.seed.sha256===seed.source.sha256&&retained.inputs.bindings.sha256===bindings.source.sha256&&retained.inputs.requestSelectionSha256===sourceSelectionSha256,'Different preparation inputs require a new output edition; the existing edition is preserved');
  return{...retained,reused:true};
 }
 const profile=readProfile(PROFILE),profileRaw=await read(profile.source.path),stage=path.join(path.dirname(out),'.rialto-installation-'+randomUUID());
 need(profileRaw.length===profile.source.bytes&&sha(profileRaw)===profile.source.sha256,'Original installed profile changed during receiving');
 await privateDir(stage,{create:true});
 try{
  await copyOriginal(source,path.join(stage,'request'));
  const selected=await verifyRequest(path.join(stage,'request')),request=requestSummary(selected,sha(await read(path.join(stage,'request','selection.json'))));
  need(request.selectionSha256===sourceSelectionSha256,'Original request changed while receiving; retry against its current retained selection');
  const derived=requestBindings(bindings.value,request),prepared=prepareInstallation(seed.value,profile.value,derived);
  const input=json(prepared.document);need(input.length<=128*1024,'Complete native Installation document exceeds 128 KiB');
  await fs.mkdir(path.join(stage,'source'),{mode:0o700});
  for(const [name,raw] of [['seed.json',seed.raw],['bindings.json',bindings.raw],['profile.json',profileRaw]])await writeNew(path.join(stage,'source',name),raw);
  for(const [name,raw] of [['derived-bindings.json',json(derived)],['RIALTO_REQUEST.json',json(request)],['RIALTO_REQUEST.md',Buffer.from(requestMarkdown(request))],['installation-input.json',input],['installation-preview-input.json',json(prepared.preview)],['WORKORDER.md',Buffer.from(renderWorkorder(prepared))]])await writeNew(path.join(stage,name),raw);
  const files=(await inventory(stage)).map(descriptor),receipt={schema:SCHEMA,profile:PROFILE,inputs:{seed:seed.source,bindings:bindings.source,profile:profile.source,requestSelectionSha256:request.selectionSha256},request,source:prepared.source,workshareCaseId:prepared.workshareCaseId,selections:prepared.selections,implementation:prepared.implementation,sourceFiles:prepared.sourceFiles,files};
  await writeNew(path.join(stage,'preparation.json'),json(receipt));
  await fs.rename(stage,out);const parent=await fs.open(path.dirname(out),'r');try{await parent.sync();}finally{await parent.close();}
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
 return{...(await inspectInstallation(out,{verifyRequest})),reused:false};
}

/** Fence the retained request's native writer while exporting the entire prepared edition. */
export async function packInstallation(root,out,{verifyRequest}){
 root=await privateDir(root);
 return lock(path.join(root,'request'),async()=>{
  const original=await inspectInstallation(root,{verifyRequest});
  const archive=await pack(root,out);
  return{...archive,profile:PROFILE,originalPreparationSha256:original.preparationSha256,requestSelectionSha256:original.inputs.requestSelectionSha256};
 });
}
