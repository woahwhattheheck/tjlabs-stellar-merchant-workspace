// MIT. One original Research dossier course; all observations are explicitly training fixtures.
import {parseArgs} from 'node:util';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {privateDirectory,writeBytes,readBytes,parseJson,jsonBytes,digest,need} from '../../node/store.mjs';
import {openDossierStore} from '../dossier.mjs';
import {openPortableFile,writePortableFile} from '../portable.mjs';
import {hash,same} from './contracts.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SCHEMA='sf88-research-comparison-receiving/v1';
const FIXTURE='TRAINING FIXTURE — no actual actuarial model evaluation or recommendation';
async function optional(file,limit=128*1024*1024){try{return await readBytes(file,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function retain(file,bytes){
 try{await writeBytes(file,bytes,{exclusive:true});}
 catch(e){if(e.code!=='EEXIST')throw e;need((await readBytes(file,256*1024*1024)).equals(bytes),'COMPARISON_COURSE_FILE_CHANGED');}
 return{file,bytes:bytes.length,sha256:digest(bytes)};
}
async function retainedJson(file,value){await retain(file,jsonBytes(value));return value;}
async function readJson(file){const b=await optional(file);return b?parseJson(b):null;}
export async function receiveComparison({directory,operationId,reviewer}){
 directory=await privateDirectory(resolve(directory));
 need(typeof reviewer==='string'&&reviewer.trim().length>0&&reviewer.length<=200,'COMPARISON_COURSE_REVIEWER_REQUIRED');
 const actor={id:'comparison-course-reviewer',name:reviewer};
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(operationId),'COMPARISON_COURSE_OPERATION_REQUIRED');
 const outputs=await privateDirectory(join(directory,'outputs')),requests=await privateDirectory(join(directory,'requests'));
 const selected=['dossier.mjs','comparison/contracts.mjs','comparison/model.mjs','comparison/store.mjs','comparison/render.mjs','comparison/receive.mjs'];
 const source=[];
 for(const name of selected){const body=await readBytes(join(ROOT,name),4*1024*1024);source.push({name,bytes:body.length,sha256:digest(body)});}
 const intent={schema:SCHEMA,operationId,directory,reviewer,fixture:FIXTURE,source};
 await retainedJson(join(directory,'intent.json'),intent);
 const storeDirectory=join(directory,'store'),store=await openDossierStore(storeDirectory);
 const title='Comparison receiving '+operationId,description=FIXTURE+'; original operation '+operationId;
 let binding=await readJson(join(directory,'dossier-binding.json'));
 if(!binding){
  const inventory=await store.list(),matches=inventory.filter(d=>d.title===title&&d.description===description);
  need(matches.length<=1&&inventory.length===matches.length,'COMPARISON_COURSE_STORE_NOT_OWNED');
  const dossier=matches[0]??await store.create({title,description,projection:'metadata'});
  binding={schema:SCHEMA,operationId,storeDirectory,dossierId:dossier.id};
  await retainedJson(join(directory,'dossier-binding.json'),binding);
 }
 need(binding.operationId===operationId&&binding.storeDirectory===storeDirectory,'COMPARISON_COURSE_BINDING_CHANGED');
 const dossierId=binding.dossierId;
 let metadata=await store.getMetadata(dossierId);
 const originalMetadata=await store.getMetadata(dossierId,{revision:1});
 need(originalMetadata.title===title&&originalMetadata.description===description,'COMPARISON_COURSE_DOSSIER_CHANGED');
 const questionText='Training receiving: retain exact model, platform and architecture evidence without recomputing scientific results.';
 let questionBinding=await readJson(join(directory,'question-binding.json'));
 if(!questionBinding){
  const accepted=await readJson(join(requests,'case-v1.accepted.json'));
  let questions=accepted?[metadata.questions.find(q=>q.id===accepted.record.definition.questionId)].filter(Boolean):metadata.questions.filter(q=>q.text===questionText);
  need(questions.length<=1,'COMPARISON_COURSE_QUESTION_DUPLICATE');
  if(!questions.length){need(!accepted,'COMPARISON_COURSE_QUESTION_MISSING');await store.addQuestion(dossierId,{text:questionText,expectedRevision:metadata.revision,projection:'metadata'});metadata=await store.getMetadata(dossierId);questions=metadata.questions.filter(q=>q.text===questionText);}
  need(questions.length===1,'COMPARISON_COURSE_QUESTION_MISSING');
  questionBinding={schema:SCHEMA,operationId,dossierId,questionId:questions[0].id};
  await retainedJson(join(directory,'question-binding.json'),questionBinding);
 }
 need(questionBinding.operationId===operationId&&questionBinding.dossierId===dossierId&&metadata.questions.some(q=>q.id===questionBinding.questionId),'COMPARISON_COURSE_QUESTION_CHANGED');
 const questionId=questionBinding.questionId;
 const sourceValue={schema:'sf88-research-results-v1',provider:'training-fixture',sourceTerms:'Original software training fixture. No patient, proprietary or actual model evaluation data.',results:[{id:'comparison-training-protocol',title:'Explicit comparison receiving fixture',content:FIXTURE+'. A declared numeric measurement, undefined metric and separate human judgment exercise the software. They are not a scientific result.',metadata:{operationId}}]};
 const sourceBytes=jsonBytes(sourceValue),sourceReceipt=await retain(join(outputs,'original-training-source.json'),sourceBytes);
 let edition=metadata.editions.find(e=>e.questionId===questionId&&e.raw?.sha256===sourceReceipt.sha256);
 if(!edition){
  await store.receive(dossierId,{questionId,label:'Original training protocol source',provider:'research',rawBytes:sourceBytes,sourceReference:'Original bundled software fixture '+operationId,expectedRevision:metadata.revision,projection:'metadata'});
  metadata=await store.getMetadata(dossierId);edition=metadata.editions.find(e=>e.questionId===questionId&&e.raw?.sha256===sourceReceipt.sha256);
 }
 need(edition,'COMPARISON_COURSE_SOURCE_MISSING');
 const sourceRefs=[{editionId:edition.id,locator:'results[0]',note:FIXTURE}];
 const receipts=[];
 async function review(name,action,payload){
  const file=join(requests,name+'.json');let request=await readJson(file);
  if(request){need(request.action===action&&same(request.payload,payload)&&same(request.actor,actor),'COMPARISON_COURSE_REQUEST_CHANGED');}
  else{
   const selected=await store.getMetadata(dossierId);
   request={requestId:'comparison-course-'+hash({operationId,name}),expectedRevision:selected.revision,actor,action,payload};
   await retainedJson(file,request);
  }
  const result=await store.reviewComparison(dossierId,{...request,projection:'metadata'});
  await retainedJson(join(requests,name+'.accepted.json'),result.operation);
  receipts.push({name,requestId:request.requestId,recordId:result.operation.record.id,versionId:result.operation.record.versionId,dossierRevision:result.operation.dossierRevision});
  return result.operation.record;
 }
 const c=await review('case-v1','case.save',{caseId:null,previousVersionId:null,definition:{questionId,title:'Training comparison workspace',purpose:'Exercise the complete original dossier workflow',scope:FIXTURE,criteria:[
  {id:'error',label:'Declared training error',kind:'MEASURED',unit:'USD/person',direction:'LOWER',description:'Literal supplied training metric, not a new evaluator'},
  {id:'ratio',label:'Undefined training ratio',kind:'MEASURED',unit:'ratio',direction:'DESCRIPTIVE',description:'An undefined result remains null with its original explanation'},
  {id:'fit',label:'Implementation judgment',kind:'JUDGMENT',unit:'',direction:'DESCRIPTIVE',description:'Explicit named manual review'}
 ],sourceRefs}});
 const scope={caseId:c.id,caseVersionId:c.versionId};
 const candidate=await review('candidate-v1','candidate.save',{...scope,candidateId:null,previousVersionId:null,definition:{name:'Original training candidate',kind:'MODEL',version:'fixture-1',description:FIXTURE,configuration:{cohort:'training',priceYear:'not applicable',market:'none'},sourceRefs}});
 const observations=Buffer.from('id,observed,predicted\ntraining-1,10.00,11.25\n');
 const artifact={id:'original-observations',path:'source/training-observations.csv',role:'explicit software fixture',mediaType:'text/csv',bytes:observations.length,sha256:digest(observations),bodyBase64:observations.toString('base64')};
 const rawValue={schema:'sf88-research-comparison-run/v1',externalRunId:'original-training-'+operationId,kind:'TRAINING_FIXTURE',status:'SUCCEEDED',startedAt:'2026-10-13T00:00:00.000Z',finishedAt:'2026-10-13T00:00:01.000Z',elapsedMs:1000,
  engine:{name:'Bundled software fixture',version:'1',command:['declared-fixture'],runtime:{actualExecution:false},configuration:{meaning:FIXTURE}},
  input:{cohortId:'training-one',protocolId:'training-fixture-v1',definition:{meaning:FIXTURE,records:1,coverage:'complete fixture'},sourceRefs,artifactIds:[artifact.id]},
  metrics:[{id:'declared-error',criterionId:'error',label:'Declared training error',value:'1.2500',unit:'USD/person',undefinedReason:'',definition:FIXTURE,denominator:{records:1},cohortRef:'training-one',artifactIds:[artifact.id]},
   {id:'undefined-ratio',criterionId:'ratio',label:'Declared undefined ratio',value:null,unit:'ratio',undefinedReason:'Training denominator deliberately zero; no replacement value is inferred',definition:FIXTURE,denominator:{declaredValue:0},cohortRef:'training-one',artifactIds:[artifact.id]}],
  artifacts:[artifact],result:{fixture:true,meaning:FIXTURE,originalValue:'1.2500',ratio:null},limitations:[FIXTURE]};
 const rawText=JSON.stringify(rawValue,null,3)+'\n',rawReceipt=await retain(join(outputs,'original-run.json'),Buffer.from(rawText));
 const run=await review('run-v1','run.import',{...scope,candidateVersionId:candidate.versionId,rawText});
 const judgment=await review('judgment-v1','judgment.save',{...scope,judgmentId:null,previousVersionId:null,definition:{candidateVersionId:candidate.versionId,criterionId:'fit',value:'Training-only review',reviewer:actor.name,reviewedAt:'2026-10-13T00:02:00.000Z',rationale:'Software receiving checks exact retained provenance; this is not an actuarial conclusion.',sourceRefs,runIds:[run.id]}});
 const decision=await review('decision-v1','decision.save',{...scope,decisionId:null,previousVersionId:null,definition:{title:'Training receiving decision',candidateVersionIds:[candidate.versionId],runIds:[run.id],judgmentVersionIds:[judgment.versionId],reviewer:actor.name,reviewedAt:'2026-10-13T00:03:00.000Z',recommendation:'Retain for software review only',rationale:'The original source, decimal value, undefined reason and manual judgment are independently accessible.',limitations:FIXTURE,sourceRefs}});
 const c2=await review('case-v2','case.save',{caseId:c.id,previousVersionId:c.versionId,definition:{...c.definition,title:'Training comparison — revised protocol',scope:FIXTURE+'; second protocol does not inherit original candidate/run measurements.'}});
 const candidate2=await review('candidate-v2','candidate.save',{caseId:c.id,caseVersionId:c2.versionId,candidateId:candidate.id,previousVersionId:candidate.versionId,definition:{...candidate.definition,version:'fixture-2',configuration:{...candidate.definition.configuration,revision:'explicit successor'}}});
 // The first accepted final operation fixes this course generation permanently.
 // Later legitimate native/browser work is preserved and is not a new export selection.
 const revision=receipts.at(-1).dossierRevision;
 const finalMeta=await store.getMetadata(dossierId,{revision});
 need(finalMeta.revision===revision,'COMPARISON_COURSE_GENERATION_CHANGED');
 const currentRevision=(await store.getMetadata(dossierId)).revision;
 // Original UUID replay after later state changes must not create a new revision.
 const originalRunRequest=await readJson(join(requests,'run-v1.json'));
 const repeated=await store.reviewComparison(dossierId,{...originalRunRequest,projection:'metadata'});
 need(repeated.duplicate&&repeated.operation.record.id===run.id&&(await store.getMetadata(dossierId)).revision===currentRevision,'COMPARISON_COURSE_REPLAY_CHANGED');
 const report=await store.comparisonReport(dossierId,{revision,...scope}),newReport=await store.comparisonReport(dossierId,{revision,caseId:c.id});
 need(report.measurementRows[0].value==='1.2500'&&report.measurementRows[1].value===null&&report.decisions.some(d=>d.versionId===decision.versionId),'COMPARISON_COURSE_REPORT_CHANGED');
 need(newReport.case.versionId===c2.versionId&&newReport.runs.length===0&&newReport.candidates[0].versionId===candidate2.versionId,'COMPARISON_COURSE_PROTOCOL_LEAK');
 let offset=0,paged=[];do{
  const page=await store.comparison(dossierId,{revision,caseId:c.id,section:'operations',offset,limit:2});paged.push(...page.items);offset=page.nextOffset;
 }while(offset!==null);
 need(paged.length===receipts.length,'COMPARISON_COURSE_PAGE_INCOMPLETE');
 const files=[sourceReceipt,rawReceipt];
 for(const format of ['json','html','csv']){
  const value=await store.exportComparison(dossierId,{revision,...scope,format});
  files.push(await retain(join(outputs,'comparison-report.'+format),value.body));
 }
 const raw=await store.comparisonFile(dossierId,{revision,runId:run.id});
 need(raw.body.equals(Buffer.from(rawText)),'COMPARISON_COURSE_RAW_CHANGED');
 const member=await store.comparisonFile(dossierId,{revision,runId:run.id,artifactId:artifact.id});
 need(member.body.equals(observations),'COMPARISON_COURSE_MEMBER_CHANGED');
 files.push(await retain(join(outputs,'training-observations.csv'),member.body));
 // Save one complete original portable generation. Repeated exports have a fresh exportedAt,
 // so resume reopens the retained first file instead of comparing regenerated wire bytes.
 const portableFile=join(outputs,'original-dossier.research.json.gz');
 let portableReceipt=await readJson(join(outputs,'portable-receipt.json'));
 if(!portableReceipt){
  const existing=await optional(portableFile,256*1024*1024);
  if(existing)portableReceipt={file:portableFile,bytes:existing.length,sha256:digest(existing)};
  else portableReceipt=await writePortableFile(portableFile,await store.exportStream(dossierId,{compression:'gzip',revision}));
  await retainedJson(join(outputs,'portable-receipt.json'),portableReceipt);
 }
 const portableBytes=await readBytes(portableFile,256*1024*1024);
 need(portableBytes.length===portableReceipt.bytes&&digest(portableBytes)===portableReceipt.sha256,'COMPARISON_COURSE_PORTABLE_CHANGED');
 files.push(portableReceipt);
 const coldDirectory=join(directory,'cold-store'),cold=await openDossierStore(coldDirectory);
 const receive=async()=>{const stream=await openPortableFile(portableFile);try{return await cold.reopenStream(stream,{projection:'metadata'});}finally{stream.destroy();}};
 let previousColdRevision=null;
 try{previousColdRevision=(await cold.getMetadata(dossierId)).revision;}catch(error){if(error.code!=='DOSSIER_NOT_FOUND')throw error;}
 const opened=await receive(),reopened=await receive();
 const expectedColdHead=Math.max(previousColdRevision??0,revision),coldSelected=await cold.getMetadata(dossierId,{revision});
 need(opened.id===dossierId&&opened.revision===expectedColdHead&&reopened.revision===expectedColdHead&&coldSelected.revision===revision,'COMPARISON_COURSE_COLD_IDENTITY_CHANGED');
 const coldReport=await cold.comparisonReport(dossierId,{revision,...scope});
 need(same(coldReport,report),'COMPARISON_COURSE_COLD_REPORT_CHANGED');
 const coldRaw=await cold.comparisonFile(dossierId,{revision,runId:run.id}),coldMember=await cold.comparisonFile(dossierId,{revision,runId:run.id,artifactId:artifact.id});
 need(coldRaw.body.equals(raw.body)&&coldMember.body.equals(member.body),'COMPARISON_COURSE_COLD_BYTES_CHANGED');
 const coldReplay=await cold.reviewComparison(dossierId,{...originalRunRequest,projection:'metadata'});
 need(coldReplay.duplicate&&coldReplay.operation.requestId===originalRunRequest.requestId&&(await cold.getMetadata(dossierId)).revision===expectedColdHead,'COMPARISON_COURSE_COLD_REPLAY_CHANGED');
 for(const member of source){const body=await readBytes(join(ROOT,member.name),4*1024*1024);need(body.length===member.bytes&&digest(body)===member.sha256,'COMPARISON_COURSE_SOURCE_CHANGED');}
 const outcome={schema:SCHEMA,status:'BACKEND_RECEIVING_COMPLETE',fixture:FIXTURE,operationId,directory,storeDirectory,coldDirectory,dossierId,questionId,sourceEditionId:edition.id,revision,caseId:c.id,caseVersionId:c.versionId,currentCaseVersionId:c2.versionId,candidateVersionId:candidate.versionId,currentCandidateVersionId:candidate2.versionId,runId:run.id,judgmentVersionId:judgment.versionId,decisionVersionId:decision.versionId,source,operations:receipts,pagesReceived:paged.length,originalRequestReplay:true,coldRequestReplay:true,fullPortableReopen:true,files,literalInspection:{status:'PENDING',files:['comparison-report.html','comparison-report.csv','original-dossier.research.json.gz'],instruction:'Open and inspect the actual report, original raw run/member files and editable received dossier. A backend receipt alone is not a browser or visual review.'}};
 await retainedJson(join(directory,'receiving-result.json'),outcome);return outcome;
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:{directory:{type:'string'},operation:{type:'string'},reviewer:{type:'string'},'lock-held':{type:'boolean',default:false}},strict:true});
 need(v.directory&&v.operation&&v.reviewer,'COMPARISON_COURSE_ARGUMENTS_REQUIRED');
 const directory=await privateDirectory(resolve(v.directory));
 if(!v['lock-held']){
  const command=['--no-fork','--nonblock',join(directory,'course.lock'),process.execPath,fileURLToPath(import.meta.url),...argv,'--lock-held'];
  const child=spawn('flock',command,{stdio:'inherit'}),stop=()=>child.kill('SIGTERM');
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});need(result.code===0&&!result.signal,'COMPARISON_COURSE_CHILD_FAILED');}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  return;
 }
 const result=await receiveComparison({directory,operationId:v.operation,reviewer:v.reviewer});process.stdout.write(jsonBytes(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'COMPARISON_COURSE_FAILED'})+'\n');process.exitCode=1;});
