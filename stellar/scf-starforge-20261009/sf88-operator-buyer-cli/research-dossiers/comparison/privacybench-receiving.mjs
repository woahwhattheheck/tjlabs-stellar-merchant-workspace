// SPDX-License-Identifier: MIT
// Original Research receiving joins. No evaluator, metric computation or listener.
import {readFile,mkdir,open,link,unlink,rename,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDossierStore} from '../dossier.mjs';
import {openPortableFile,writePortableFile} from '../portable.mjs';
import {receiveHandoverCourse} from './adoption-receiving.mjs';
const SCHEMA='sf88-privacybench-receiving/v1';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const FIXTURE='AUTHORED SOFTWARE FIXTURE — no evaluator, customer data or privacy-effectiveness claim';
export const REVIEW_CRITERION={id:'privacybench.receiving-review',label:'Original source receiving review',kind:'JUDGMENT',unit:'',direction:'DESCRIPTIVE',description:'Named reviewer checks source custody and comparability; this is not a calculated quality or privacy score.'};
export const json=v=>JSON.stringify(v,null,2)+'\n';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const need=(v,m)=>{if(!v)throw Error(m);};
export async function maybe(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function sync(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
export async function identity(file){
 const h=await open(file,'r');try{
  const before=await h.stat({bigint:true}),named=await lstat(file,{bigint:true});
  const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode].map(String);
  need(before.isFile()&&!named.isSymbolicLink()&&same(stamp(before),stamp(named))&&before.size<=256n*1024n*1024n,'Bounded ordinary retained file required');
  let bytes=0;const hash=createHash('sha256');
  for await(const b of h.createReadStream({autoClose:false})){bytes+=b.length;need(BigInt(bytes)<=before.size,'Retained file grew');hash.update(b);}
  need(BigInt(bytes)===before.size&&same(stamp(before),stamp(await h.stat({bigint:true})))&&same(stamp(before),stamp(await lstat(file,{bigint:true}))),'Retained file changed');
  return{file,bytes,sha256:hash.digest('hex')};
 }finally{await h.close();}
}
export async function retain(file,body){
 const bytes=Buffer.from(body),temp=file+'.'+randomUUID()+'.tmp';await mkdir(dirname(file),{recursive:true,mode:0o700});
 const h=await open(temp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
 try{await link(temp,file);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(file)).equals(bytes),'Original retained body changed: '+file);}
 await sync(dirname(file));await unlink(temp);return identity(file);
}
export async function save(file,value){
 const temp=file+'.'+randomUUID()+'.tmp',h=await open(temp,'wx',0o600);
 try{await h.writeFile(json(value));await h.sync();}finally{await h.close();}
 await rename(temp,file);await sync(dirname(file));
}
export async function verifyFiles(files){for(const d of files){const a=await identity(d.file);need(a.bytes===d.bytes&&a.sha256===d.sha256,'Original output changed: '+d.file);}}
async function portable(file,store,id,revision){
 let receipt=await maybe(file+'.receipt.json');
 if(!receipt){
  let present;try{present=await identity(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  receipt=present??await writePortableFile(file,await store.exportStream(id,{compression:'gzip',revision}));
  receipt={file,bytes:receipt.bytes,sha256:receipt.sha256};await retain(file+'.receipt.json',json(receipt));
 }
 await verifyFiles([receipt]);return receipt;
}
async function reopen(store,file,id){
 const before=await store.getMetadata(id).catch(e=>{if(e.code==='DOSSIER_NOT_FOUND')return null;throw e;});
 const input=await openPortableFile(file);let result;try{result=await store.reopenStream(input,{projection:'metadata'});}finally{input.destroy();}
 need(result.id===id&&(!before||result.revision>=before.revision),'Received original dossier lost its current head');return result;
}
export async function preparePrivacyBenchReceiving({directory,receipt,reviewer}){
 need(receipt.status==='BACKEND_RECEIVING_COMPLETE'&&receipt.operationId&&receipt.dossierId&&reviewer,'Original receiving case and actual operator required');
 directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});
 const sourceNames=['comparison/privacybench-receiving-fixture.json','comparison/privacybench-receiving.mjs','comparison/privacybench-browser-receiving.mjs',
  'comparison/original-output/privacybench.mjs','comparison/original-output/privacybench-routes.mjs','comparison/original-output/prepare.mjs',
  'public/privacybench-output.js','public/original-output.js','public/comparison.js'];
 const source=[];for(const name of sourceNames){const d=await identity(join(ROOT,name));source.push({name,bytes:d.bytes,sha256:d.sha256});}
 const fixture=JSON.parse(await readFile(new URL('./privacybench-receiving-fixture.json',import.meta.url),'utf8'));
 const body=Buffer.from(fixture.source);need(body.length===fixture.selection.results.bytes&&sha(body)===fixture.selection.results.sha256,'Exact authored fixture changed');
 const intent={schema:SCHEMA,operationId:receipt.operationId,dossierId:receipt.dossierId,questionId:receipt.questionId,storeDirectory:receipt.storeDirectory,
  directory,reviewer,source,fixture:{meaning:FIXTURE,bytes:body.length,sha256:sha(body)}};
 await retain(join(directory,'intent.json'),json(intent));
 const files=[
  {name:'native-results.fixture.json',mimeType:'application/json',...await retain(join(directory,'inputs','native-results.fixture.json'),body)},
  {name:'viewer.fixture.html',mimeType:'text/html',...await retain(join(directory,'inputs','viewer.fixture.html'),
   '<!doctype html><html lang="en"><meta charset="utf-8"><title>Authored PrivacyBench receiving fixture</title><body><h1>AUTHORED SOFTWARE FIXTURE</h1><p>No evaluator or customer data was used.</p><p>The original 34 metric groups remain in native-results.fixture.json. The lexical value 0.5000 is retained exactly.</p></body></html>\n')},
  {name:'summary.fixture.md',mimeType:'text/markdown',...await retain(join(directory,'inputs','summary.fixture.md'),
   '# AUTHORED SOFTWARE FIXTURE\n\nNo evaluator, model service or customer data was used. This file exercises complete original supporting-file custody. It is not evidence of privacy effectiveness.\n')}
 ];
 return{...intent,files,fixture,reviewCriterion:REVIEW_CRITERION};
}
export async function retainPrivacyBenchReturn({prepared,accepted}){
 const directory=join(prepared.directory,'returned-review');await mkdir(directory,{recursive:true,mode:0o700});
 const {dossierId,storeDirectory,operationId,reviewer}=prepared;
 const selection={dossierId,caseId:accepted.caseId,caseVersionId:accepted.caseVersionId,candidateVersionId:accepted.candidateVersionId,
  runId:accepted.runId,revision:accepted.revision,raw:accepted.raw,operationId,reviewer};
 await retain(join(directory,'intent.json'),json(selection));
 const completed=await maybe(join(directory,'returned-result.json'));
 if(completed){need(same(completed.selection,selection),'Returned receiving selection changed');await verifyFiles(completed.files);return completed;}
 const store=await openDossierStore(storeDirectory),report=await store.comparisonReport(dossierId,{revision:accepted.revision,caseId:accepted.caseId,caseVersionId:accepted.caseVersionId});
 const originalRun=report.runs.find(r=>r.id===accepted.runId);need(originalRun&&originalRun.candidateVersionId===accepted.candidateVersionId,'Accepted source run missing');
 const raw=await store.comparisonFile(dossierId,{revision:accepted.revision,runId:accepted.runId});
 need(raw.bytes===accepted.raw.bytes&&raw.sha256===accepted.raw.sha256,'Accepted original run changed');
 const run=JSON.parse(raw.body);need(run.kind==='TRAINING_FIXTURE'&&run.metrics.length===34&&run.metrics.some(m=>m.value==='0.5000'),'Original literal metric groups changed');
 for(const input of prepared.files)need(run.artifacts.some(a=>a.bytes===input.bytes&&a.sha256===input.sha256),'Original supporting file omitted');
 const base=await portable(join(directory,'original-accepted.research.json.gz'),store,dossierId,accepted.revision);
 const contributorDirectory=join(directory,'contributor'),contributor=await openDossierStore(contributorDirectory);
 await reopen(contributor,base.file,dossierId);
 let request=await maybe(join(directory,'review-request.json'));
 const payload={caseId:accepted.caseId,caseVersionId:accepted.caseVersionId,judgmentId:null,previousVersionId:null,definition:{
  candidateVersionId:accepted.candidateVersionId,criterionId:REVIEW_CRITERION.id,value:'Original files retained — software receiving only',
  reviewer:reviewer+' — receiving contributor',reviewedAt:'2026-10-13T18:30:00.000Z',
  rationale:FIXTURE+'. Explicit fixture review of exact source custody; no scientific result is recomputed or endorsed.',
  sourceRefs:[],runIds:[accepted.runId]}};
 if(!request){
  request={requestId:'privacybench-return-'+sha(Buffer.from(operationId)),expectedRevision:accepted.revision,
   actor:{id:'privacybench-receiving-contributor',name:reviewer+' — receiving contributor'},action:'judgment.save',payload};
  await retain(join(directory,'review-request.json'),json(request));
 }
 need(request.action==='judgment.save'&&same(request.payload,payload),'Original contributor review changed');
 const reviewed=await contributor.reviewComparison(dossierId,{...request,projection:'metadata'});
 await retain(join(directory,'review-operation.json'),json(reviewed.operation));
 const before=(await contributor.getMetadata(dossierId)).revision;
 const replay=await contributor.reviewComparison(dossierId,{...request,projection:'metadata'});
 need(same(replay.operation,reviewed.operation)&&(await contributor.getMetadata(dossierId)).revision===before,'Contributor original request replay changed');
 const returned=await portable(join(directory,'returned-complete.research.json.gz'),contributor,dossierId,reviewed.operation.dossierRevision);
 const received=await store.receiveDossierReturnSource(dossierId,{input:createReadStream(returned.file),filename:'privacybench-returned-complete.research.json.gz',
  contentType:'application/gzip',expectedSha256:returned.sha256});
 const result={schema:SCHEMA+'.returned',selection,source:received.source,returned,contributorDirectory,judgment:reviewed.operation.record,
  originalRun:{runId:originalRun.id,raw:originalRun.raw,artifacts:originalRun.artifacts},files:[base,returned,await identity(join(directory,'review-request.json')),await identity(join(directory,'review-operation.json'))]};
 await retain(join(directory,'returned-result.json'),json(result));return result;
}
export async function finishPrivacyBenchHandover({prepared,returned,adoption,python}){
 const directory=join(prepared.directory,'handover');await mkdir(directory,{recursive:true,mode:0o700});
 const resultFile=join(directory,'privacybench-native-result.json');
 const selection={operationId:prepared.operationId,dossierId:prepared.dossierId,sourceId:returned.source.id,request:adoption.request,planId:adoption.result.planId};
 await retain(join(directory,'intent.json'),json(selection));
 const prior=await maybe(resultFile);if(prior){need(same(prior.selection,selection),'Original final receiving changed');await verifyFiles(prior.files);return prior;}
 const store=await openDossierStore(prepared.storeDirectory);
 const result=await store.reviewComparisonAdoption(prepared.dossierId,adoption.request);
 need(result.status==='COMPLETE'&&result.planId===adoption.result.planId,'Original accepted adoption missing');
 const revision=Math.max(result.plan.committedRevision,...result.progress.operations.map(x=>x.dossierRevision));
 const first=(await store.comparisonAdoption(prepared.dossierId,{planId:result.planId,revision})).adoption;
 need(first.status==='COMPLETE'&&first.progress.completed===4,'Expected case/candidate/run/review closure missing');
 const handover=await receiveHandoverCourse({store,dossierId:prepared.dossierId,directory,label:'privacybench-complete',
  revision,planId:result.planId,input:adoption.request,operationId:prepared.operationId,python,expectedCompleted:4,expectedStatus:'COMPLETE',originalRun:returned.originalRun});
 const outcome={schema:SCHEMA+'.complete',status:'PRIVACYBENCH_NATIVE_RECEIVING_COMPLETE',selection,revision,report:first,handover,
  files:[...returned.files,...handover.files,await identity(join(handover.directory,'receiving-result.json'))],
  meaning:FIXTURE,literalInspection:'Open all actual extracted reports, source files and both native projects in the existing browser course.'};
 await retain(resultFile,json(outcome));return outcome;
}
