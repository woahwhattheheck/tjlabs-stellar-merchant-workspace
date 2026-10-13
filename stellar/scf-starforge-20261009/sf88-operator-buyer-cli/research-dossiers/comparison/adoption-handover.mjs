// MIT. Freeze one original author adoption generation and its complete returned source.
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {need,exists,jsonBytes} from '../../node/store.mjs';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {customerDirectory,retainCustomerJson,retainCustomerBytes} from '../customer-updates/files.mjs';
import {writePortableFile} from '../portable.mjs';
import {id,same} from './contracts.mjs';
import {fileIdentity,JSON_LIMIT} from './inspect-handover.mjs';
import {ADOPTION_HANDOVER_SCHEMA,ADOPTION_ENGINE_FILES,ADOPTION_DATA_FILES,ADOPTION_README,inspectAdoptionHandover} from './inspect-adoption-handover.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
async function retainTree(directory,name,body){
 const path=join(directory,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
 return retainCustomerBytes(dirname(path),name.split('/').at(-1),body);
}
async function child(command,args){
 const process=spawn(command,args,{stdio:['ignore','ignore','pipe']});let detail='',overflow=false;
 process.stderr.on('data',v=>{if(detail.length<1048576)detail+=v.toString('utf8');else overflow=true;});
 const signals=['SIGINT','SIGTERM'],forward=()=>process.kill('SIGTERM');
 for(const name of signals)globalThis.process.on(name,forward);
 try{
  await new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',(code,signal)=>code===0&&!signal?resolve():reject(Object.assign(new Error('ADOPTION_HANDOVER_ARCHIVE_FAILED'),{code:'ADOPTION_HANDOVER_ARCHIVE_FAILED',detail:overflow?'Diagnostic limit exceeded':detail})));});
 }finally{for(const name of signals)globalThis.process.off(name,forward);}
}

async function lookup(store,dossierId,planId,revision){
 const response=await store.comparisonAdoption(dossierId,{planId,revision});
 need(response.revision===revision&&response.dossierId===dossierId&&response.adoption?.planId===planId&&
  response.adoption.revision===revision,'ADOPTION_HANDOVER_PLAN_BINDING');return response.adoption;
}
async function lineage(store,dossierId,selected,revision){
 let first=selected;const seen=new Set();
 while(first.plan.request.continuationOf){
  need(!seen.has(first.planId),'ADOPTION_CONTINUATION_INVALID');seen.add(first.planId);
  first=await lookup(store,dossierId,first.plan.request.continuationOf,revision);
 }
 seen.clear();const results=[];let current=first;
 while(current){
  need(!seen.has(current.planId)&&results.length<1000,'ADOPTION_CONTINUATION_INVALID');seen.add(current.planId);results.push(current);
  if(!current.successorPlanId)break;
  const successor=await lookup(store,dossierId,current.successorPlanId,revision);
  need(successor.plan.request.continuationOf===current.planId,'ADOPTION_CONTINUATION_INVALID');current=successor;
 }
 need(seen.has(selected.planId),'ADOPTION_CONTINUATION_INVALID');return results;
}
export async function exportAdoptionHandover(store,dossierId,{directory,operationId,revision,planId,
 python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3'}={}){
 id(operationId);id(planId);
 need(Number.isSafeInteger(revision)&&revision>=1,'ADOPTION_HANDOVER_REVISION_REQUIRED');
 for(const method of ['listRevisions','comparisonAdoption','exportComparisonAdoption','exportStream'])
  need(typeof store?.[method]==='function','ADOPTION_ORIGINAL_STORE_REQUIRED');
 directory=await customerDirectory(directory);
 return withPrivateLock(directory,'adoption-handover.lock',async()=>{
  const report=await lookup(store,dossierId,planId,revision),history=await store.listRevisions(dossierId,{revision}),head=history.at(-1);
  need(head?.revision===revision,'ADOPTION_HANDOVER_GENERATION');
  const selection={schema:ADOPTION_HANDOVER_SCHEMA+'.selection',operationId,dossierId,revision,headSha256:head.sha256,
   planId,sourceId:report.plan.source.id,caseId:report.plan.case.id,caseVersionId:report.plan.case.versionId,questionId:report.plan.case.definition.questionId};
  await retainCustomerJson(directory,'intent.json',{schema:ADOPTION_HANDOVER_SCHEMA+'.intent',storeDirectory:resolve(store.directory),selection});
  const packageDirectory=join(directory,'members');await customerDirectory(packageDirectory);
  await retainCustomerJson(packageDirectory,'selection.json',selection);
  const author=join(packageDirectory,'author.research.json.gz');
  if(!await exists(author)){
   try{await writePortableFile(author,await store.exportStream(dossierId,{revision,compression:'gzip'}));}
   catch(error){if(error.code!=='EEXIST')throw error;}
  }
  const returned=join(packageDirectory,'returned.research.json'),source=report.plan.source;
  if(!await exists(returned)){
   const exported=await store.exportComparisonAdoption(dossierId,{planId,revision,format:'source'});
   need(exported.revision===revision&&exported.bytes===source.bytes&&exported.sha256===source.sha256&&
    exported.filename===source.filename&&exported.contentType===source.contentType,'ADOPTION_HANDOVER_RETURN_CHANGED');
   try{await writePortableFile(returned,{...exported,body:exported.stream});}
   catch(error){if(error.code!=='EEXIST')throw error;}
  }
  await fileIdentity(returned,{expected:source});
  for(const format of ['json','html']){
   const exported=await store.exportComparisonAdoption(dossierId,{planId,revision,format});
   need(exported.revision===revision&&exported.bytes<=JSON_LIMIT,'ADOPTION_HANDOVER_GENERATION');
   if(format==='json')need(jsonBytes(report).equals(exported.body),'ADOPTION_HANDOVER_REPORT_CHANGED');
   await retainCustomerBytes(packageDirectory,'adoption.'+format,Buffer.from(exported.body));
  }
  const family=await lineage(store,dossierId,report,revision);
  need(jsonBytes(family).length<=JSON_LIMIT&&same(family.find(r=>r.planId===planId),report),'ADOPTION_HANDOVER_LINEAGE_CHANGED');
  await retainCustomerJson(packageDirectory,'lineage.json',family);
  await retainCustomerBytes(packageDirectory,'README.md',ADOPTION_README);
  for(const path of ADOPTION_ENGINE_FILES)await retainTree(packageDirectory,'engine/'+path,await readFile(join(root,path)));
  const files=[];
  for(const path of [...ADOPTION_DATA_FILES,...ADOPTION_ENGINE_FILES.map(p=>'engine/'+p)])
   files.push({path,...await fileIdentity(join(packageDirectory,path))});
  const manifest={schema:ADOPTION_HANDOVER_SCHEMA,selection,files};
  const manifestSaved=await retainCustomerJson(packageDirectory,'manifest.json',manifest);
  const inspected=await inspectAdoptionHandover(packageDirectory,{manifestSha256:manifestSaved.sha256});
  const filename='Research_Comparison_Adoption_Handover.zip',archive=join(directory,filename);
  if(!await exists(archive))await child(python,[join(here,'adoption-handover-archive.py'),'--directory',packageDirectory,'--out',archive]);
  await child(python,[join(here,'adoption-handover-archive.py'),'--directory',packageDirectory,'--verify',archive]);
  const receipt={schema:ADOPTION_HANDOVER_SCHEMA+'.complete',selection,manifest:{bytes:manifestSaved.bytes,sha256:manifestSaved.sha256},
   archive:{filename,...await fileIdentity(archive)},files,inspectedRevision:inspected.selection.revision,
   source:{id:source.id,filename:source.filename,contentType:source.contentType,bytes:source.bytes,sha256:source.sha256},
   status:inspected.report.status,lineage:inspected.lineage.map(r=>({planId:r.planId,status:r.status,completed:r.progress.completed,total:r.progress.total,successorPlanId:r.successorPlanId})),
   authority:'Original Research adoption and returned portable source; LDA review retains separate attribution.'};
  await retainCustomerJson(directory,'handover-result.json',receipt);
  return{...receipt,directory,archivePath:archive};
 });
}
