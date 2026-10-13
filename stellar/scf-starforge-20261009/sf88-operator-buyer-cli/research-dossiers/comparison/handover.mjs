// MIT. Full comparison handovers are frozen derivatives of the original dossier.
import {readFile,lstat,mkdir,link,unlink,open} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {need,digest,jsonBytes,exists,syncDirectory} from '../../node/store.mjs';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {customerDirectory,retainCustomerJson,retainCustomerBytes} from '../customer-updates/files.mjs';
import {writePortableFile} from '../portable.mjs';
import {id} from './contracts.mjs';
import {HANDOVER_SCHEMA,ENGINE_FILES,DATA_FILES,README,fileIdentity,inspectComparisonHandover} from './inspect-handover.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
async function retainTree(directory,name,body){
 const path=join(directory,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
 // Original publisher accepts flat names; preserve topology through its actual parent.
 return retainCustomerBytes(dirname(path),name.split('/').at(-1),body);
}
async function child(command,args){
 const process=spawn(command,args,{stdio:['ignore','ignore','pipe']});let detail='',overflow=false;
 process.stderr.on('data',v=>{if(detail.length<1048576)detail+=v.toString('utf8');else overflow=true;});
 const signals=['SIGINT','SIGTERM'],forward=()=>process.kill('SIGTERM');
 for(const name of signals)globalThis.process.on(name,forward);
 try{
  await new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',(code,signal)=>code===0&&!signal?resolve():reject(Object.assign(new Error('COMPARISON_HANDOVER_ARCHIVE_FAILED'),{code:'COMPARISON_HANDOVER_ARCHIVE_FAILED',detail:overflow?'Diagnostic limit exceeded':detail})));});
 }finally{for(const name of signals)globalThis.process.off(name,forward);}
}
export async function exportComparisonHandover(store,dossierId,{directory,operationId,revision,caseId,caseVersionId,python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3'}={}){
 id(operationId);id(caseId);id(caseVersionId);
 need(Number.isSafeInteger(revision)&&revision>=1,'COMPARISON_HANDOVER_REVISION_REQUIRED');
 for(const method of ['getMetadata','listRevisions','comparisonReport','exportComparison','exportStream'])need(typeof store?.[method]==='function','COMPARISON_ORIGINAL_STORE_REQUIRED');
 directory=await customerDirectory(directory);
 return withPrivateLock(directory,'comparison-handover.lock',async()=>{
  const report=await store.comparisonReport(dossierId,{revision,caseId,caseVersionId});
  const history=await store.listRevisions(dossierId,{revision}),head=history.at(-1);
  need(head?.revision===revision&&report.case.versionId===caseVersionId,'COMPARISON_HANDOVER_GENERATION');
  const selection={schema:HANDOVER_SCHEMA+'.selection',operationId,dossierId,revision,
   headSha256:head.sha256,caseId,caseVersionId,questionId:report.case.definition.questionId};
  // First publication precedes every byte-producing action and binds the whole generation.
  await retainCustomerJson(directory,'intent.json',{schema:HANDOVER_SCHEMA+'.intent',
   storeDirectory:resolve(store.directory),selection});
  const packageDirectory=join(directory,'members');await customerDirectory(packageDirectory);
  await retainCustomerJson(packageDirectory,'selection.json',selection);
  const portable=join(packageDirectory,'dossier.research.json.gz');
  if(!await exists(portable)){
   try{await writePortableFile(portable,await store.exportStream(dossierId,{revision,compression:'gzip'}));}
   catch(error){if(error.code!=='EEXIST')throw error;}
  }
  for(const format of ['json','html','csv']){
   const exported=await store.exportComparison(dossierId,{revision,caseId,caseVersionId,format});
   need(exported.revision===revision,'COMPARISON_HANDOVER_GENERATION');
   await retainCustomerBytes(packageDirectory,'comparison.'+format,Buffer.from(exported.body));
  }
  await retainCustomerBytes(packageDirectory,'README.md',README);
  for(const path of ENGINE_FILES)await retainTree(packageDirectory,'engine/'+path,await readFile(join(root,path)));
  const names=[...DATA_FILES,...ENGINE_FILES.map(p=>'engine/'+p)],files=[];
  for(const path of names)files.push({path,...await fileIdentity(join(packageDirectory,path))});
  const manifest={schema:HANDOVER_SCHEMA,selection,files};
  const manifestSaved=await retainCustomerJson(packageDirectory,'manifest.json',manifest);
  const inspection=await inspectComparisonHandover(packageDirectory,{manifestSha256:manifestSaved.sha256});
  const archive=join(directory,'Research_Comparison_Handover.zip');
  if(!await exists(archive)){
   await child(python,[join(here,'handover-archive.py'),'--directory',packageDirectory,'--out',archive]);
  }
  // A reused archive is always re-opened by the maintained ordinary-member verifier.
  await child(python,[join(here,'handover-archive.py'),'--directory',packageDirectory,'--verify',archive]);
  const original=await fileIdentity(archive);
  const receipt={schema:HANDOVER_SCHEMA+'.complete',selection,manifest:{bytes:manifestSaved.bytes,sha256:manifestSaved.sha256},
   archive:{filename:'Research_Comparison_Handover.zip',...original},files,
   inspectedRevision:inspection.selection.revision,
   authority:'Original Research comparison/portable source; LDA review does not alter source decisions.'};
  await retainCustomerJson(directory,'handover-result.json',receipt);
  return{...receipt,directory,archivePath:archive};
 });
}
