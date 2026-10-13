#!/usr/bin/env node
// MIT. Original commerce export analysis received through the existing SF74 case writer.
import {readFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {createCommerceReconciliation,REVIEW_SCHEMA} from './commerce-reconciliation.mjs';
import {openCaseStore,retainCaseArtifact} from './case-store.mjs';
import {operateCaseCommissioning} from './case-commissioning.mjs';
import {parseWorkspace} from './workspace-file.mjs';
import {MAX_MATERIAL_BYTES,encodeCommissioningBytes,newCommissioning} from './commissioning.mjs';
const json=v=>JSON.stringify(v,null,2)+'\n';
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=s=>({bytes:Buffer.byteLength(s),sha256:sha(s)});
const engine=createCommerceReconciliation({sha256Utf8:hash});
const need=(value,message)=>{if(!value)throw new Error(message);};
function absolute(value,label){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value,'Select an absolute normalized '+label);return value;}
async function readOriginal(path,max=40*1024*1024) {
  absolute(path,'input path');const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'Select a regular bounded original file');
  const bytes=await readFile(path);need(bytes.length<=max,'Original file grew beyond the selected limit');
  return {bytes,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),sha256:sha(bytes)};
}
async function privateOutput(path) {
  absolute(path,'output directory');need(await realpath(dirname(path))===dirname(path),'Select an existing canonical output parent');
  try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'Use a private output directory');
  need(await realpath(path)===path,'Keep the canonical output directory');return path;
}
export async function prepareCommerceReceiving({inputPath,reviewPath=null,directory}) {
  const inputRaw=await readOriginal(inputPath),input=JSON.parse(inputRaw.text);
  const reviewRaw=reviewPath?await readOriginal(reviewPath):null,review=reviewRaw?JSON.parse(reviewRaw.text):null;
  const report=review?engine.review(input,review):engine.analyze(input);
  const root=await privateOutput(directory);
  const request={schema:'stellar-forge.commerce-export-package-request.v1',
    input:{bytes:inputRaw.bytes.length,sha256:inputRaw.sha256},
    review:reviewRaw?{bytes:reviewRaw.bytes.length,sha256:reviewRaw.sha256}:null};
  await retainCaseArtifact(join(root,'request.json'),Buffer.from(json(request)));
  const files=[
    ['input.json',inputRaw.bytes],['source.csv',Buffer.from(input.source.content)],['destination.csv',Buffer.from(input.destination.content)],
    ['reconciliation.json',Buffer.from(json(report))],['reconciliation.html',Buffer.from(engine.reportHtml(report))],
    ['exceptions.csv',Buffer.from(engine.issuesCsv(report))],
    ['review-template.json',Buffer.from(json({schema:REVIEW_SCHEMA,input_sha256:report.input_sha256,
      actor:'',observed_at:'',reference:'',decisions:report.issues.map(i=>({issue_id:i.id,outcome:'requires_repair',note:'',reference:''}))}))]
  ];
  if(reviewRaw)files.push(['original-review.json',reviewRaw.bytes]);
  for(const [name,bytes] of files)await retainCaseArtifact(join(root,name),bytes);
  const manifest={schema:'stellar-forge.commerce-export-package.v1',request,input_sha256:report.input_sha256,
    state:report.state,files:files.map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)}))};
  await retainCaseArtifact(join(root,'manifest.json'),Buffer.from(json(manifest)));
  return {directory:root,manifest,manifestSha256:sha(json(manifest))};
}
export async function inspectCommerceReceiving(directory) {
  absolute(directory,'source package');const raw=await readOriginal(join(directory,'manifest.json'),1024*1024),manifest=JSON.parse(raw.text);
  need(manifest.schema==='stellar-forge.commerce-export-package.v1'&&Array.isArray(manifest.files),'Select the complete original commerce package');
  const allowed=new Set(['input.json','source.csv','destination.csv','reconciliation.json','reconciliation.html','exceptions.csv','review-template.json','original-review.json']);
  const names=manifest.files.map(f=>f.name);
  need(names.length>=7&&new Set(names).size===names.length&&names.every(n=>allowed.has(n)),'Original package inventory changed');
  for(const name of ['input.json','source.csv','destination.csv','reconciliation.json','reconciliation.html','exceptions.csv','review-template.json'])need(names.includes(name),'Missing original package member '+name);
  const retained={};
  for(const file of manifest.files){const r=await readOriginal(join(directory,file.name));need(r.bytes.length===file.bytes&&r.sha256===file.sha256,'Original package member changed: '+file.name);retained[file.name]=r;}
  const input=JSON.parse(retained['input.json'].text),review=retained['original-review.json']?JSON.parse(retained['original-review.json'].text):null;
  const actual=review?engine.review(input,review):engine.analyze(input);
  need(json(actual)===retained['reconciliation.json'].text&&engine.reportHtml(actual)===retained['reconciliation.html'].text&&engine.issuesCsv(actual)===retained['exceptions.csv'].text,'Recompute the exact original analyzed/reviewed result');
  need(input.source.content===retained['source.csv'].text&&input.destination.content===retained['destination.csv'].text,'Original source export differs from input');
  need(manifest.input_sha256===actual.input_sha256&&manifest.state===actual.state,'Original package source or state changed');
  need(manifest.request?.input?.sha256===retained['input.json'].sha256&&manifest.request.input.bytes===retained['input.json'].bytes.length,'Original input request changed');
  if(review)need(manifest.request.review?.sha256===retained['original-review.json'].sha256&&manifest.request.review.bytes===retained['original-review.json'].bytes.length,'Original review request changed');
  else need(manifest.request.review===null,'Original review request differs');
  return {directory,manifest,manifestSha256:raw.sha256,report:actual,retained};
}
/** No second state engine: one source-bound material is saved by the original case/CAS/event mechanism. */
export async function attachCommerceReceiving({directory,casesDirectory,caseId,caseRevision,requestId,actor,recordedAt,taskIds=[]}) {
  const original=await inspectCommerceReceiving(directory);
  need(/^[a-z0-9][a-z0-9._:-]{0,119}$/.test(requestId??''),'Select a stable original attachment request ID');
  need(typeof actor==='string'&&actor.trim(),'Record the actual operator');
  need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt??'')&&Number.isFinite(Date.parse(recordedAt))&&new Date(recordedAt).toISOString()===recordedAt,'Freeze the actual first operation UTC time');
  need(/^[a-f0-9]{64}$/.test(caseRevision??''),'Select the original saved case revision');
  need(Array.isArray(taskIds)&&taskIds.every(x=>typeof x==='string')&&new Set(taskIds).size===taskIds.length,'Select distinct original task IDs');
  absolute(casesDirectory,'case directory');
  const request={schema:'stellar-forge.commerce-export-attachment.v1',casesDirectory,caseId,caseRevision,
    requestId,actor,recordedAt,taskIds,manifestSha256:original.manifestSha256};
  await retainCaseArtifact(join(directory,'attachment-request.json'),Buffer.from(json(request)));
  const store=await openCaseStore(casesDirectory),record=await store.read(caseId),workspace=await parseWorkspace(record.workspaceText);
  const state=workspace.commissioning??newCommissioning();
  const materialId='commerce-'+sha(requestId).slice(0,32);
  const packet={schema:'stellar-forge.commerce-export-originals.v1',manifest:original.manifest,
    files:Object.fromEntries(Object.entries(original.retained).map(([name,value])=>[name,value.text]))};
  const bytes=Buffer.from(json(packet));need(bytes.length<=MAX_MATERIAL_BYTES,'Use the original complete native source-bundle route for a packet above the inline material limit');
  const command={type:'add_material',requestId,actor,recordedAt,expectedRevision:state.revision,
    payload:{id:materialId,name:'Commerce_Integration_Receiving.json',mediaType:'application/json',kind:'deliverable',
      description:'Complete original export comparison and explicit reviewer decisions; no remote writes or automatic case acceptance.',
      reference:'urn:sha256:'+original.manifestSha256,taskIds,data:encodeCommissioningBytes(bytes)}};
  const result=await operateCaseCommissioning(store,{id:caseId,expectedRevision:caseRevision,command});
  await retainCaseArtifact(join(directory,'case-receipt.json'),Buffer.from(json({
    schema:'stellar-forge.commerce-export-case-receipt.v1',requestId,caseId,
    materialId,manifestSha256:original.manifestSha256,materialSha256:sha(bytes),
    // A replay may return a later current case revision; the immutable event result is the authority.
    result:result.result
  })));
  return {...result,manifestSha256:original.manifestSha256,materialId};
}
export async function commerceReceivingCli(argv=process.argv.slice(2)){
  const {values:v,positionals:p}=parseArgs({args:argv,strict:true,allowPositionals:true,options:{
    input:{type:'string'},review:{type:'string'},out:{type:'string'},from:{type:'string'},
    'cases-dir':{type:'string'},case:{type:'string'},revision:{type:'string'},'request-id':{type:'string'},actor:{type:'string'},'recorded-at':{type:'string'},tasks:{type:'string'},help:{type:'boolean'}}});
  if(v.help){need(p.length===0&&Object.keys(v).length===1,'Use --help alone');return {analyze:'analyze --input ABS_JSON --out ABS_DIRECTORY',review:'review --input ABS_JSON --review ABS_REVIEW --out NEW_ABS_DIRECTORY',inspect:'inspect --from ABS_DIRECTORY',attach:'attach --from ABS_DIRECTORY --cases-dir ABS_CASES --case UUID --revision SHA256 --request-id ID --actor NAME --recorded-at UTC [--tasks TASK1,TASK2]',receiving:'Use the existing merchant-implementation export/receive-package commands for full original case history and all source bundles.'};}
  need(p.length===1&&['analyze','review','inspect','attach'].includes(p[0]),'Choose analyze, review, inspect or attach');
  const allowed={analyze:['input','out'],review:['input','review','out'],inspect:['from'],attach:['from','cases-dir','case','revision','request-id','actor','recorded-at','tasks']}[p[0]];
  need(Object.keys(v).every(k=>allowed.includes(k)),'Use only selected command options');
  if(p[0]==='analyze'||p[0]==='review'){if(p[0]==='review')need(v.review,'Select the complete reviewer return');return prepareCommerceReceiving({inputPath:v.input,reviewPath:v.review??null,directory:v.out});}
  if(p[0]==='inspect'){const {retained,...result}=await inspectCommerceReceiving(v.from);return result;}
  return attachCommerceReceiving({directory:v.from,casesDirectory:v['cases-dir'],caseId:v.case,caseRevision:v.revision,requestId:v['request-id'],actor:v.actor,recordedAt:v['recorded-at'],taskIds:v.tasks?v.tasks.split(','):[]});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(json(await commerceReceivingCli()));}catch(error){process.stderr.write(json({error:error.code??'COMMERCE_RECEIVING_FAILED',message:error.message}));process.exitCode=1;}
}
