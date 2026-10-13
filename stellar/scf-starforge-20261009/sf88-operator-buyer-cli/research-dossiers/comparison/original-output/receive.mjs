// MIT. Receive prepared original output editions through the maintained Research dossier.
import {parseArgs} from 'node:util';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,lstat,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openDossierStore} from '../../dossier.mjs';
import {openPortableFile,writePortableFile} from '../../portable.mjs';
import {comparisonInput,caseDefinition,candidateDefinition,parseRun,hash,same,actor,id} from '../contracts.mjs';
import {original,retain} from './prepare.mjs';
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const descriptor=b=>({bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
async function maybe(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function saved(file,value){await retain(file,json(value));return value;}
async function privateDir(path){await mkdir(path,{recursive:true,mode:0o700});const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'OUTPUT_PRIVATE_DIRECTORY_REQUIRED',{path});return path;}
async function packageInput(base,spec){
 need(spec&&typeof spec.directory==='string','OUTPUT_PACKAGE_REQUIRED');const directory=resolve(base,spec.directory);
 const manifestRaw=await original(join(directory,'manifest.json'),spec.manifest,2*1024*1024),manifest=JSON.parse(manifestRaw);
 need(manifest.schema==='sf88-original-output-package/v1'&&manifest.status==='READY','OUTPUT_PACKAGE_NOT_READY');
 need(Array.isArray(manifest.files)&&manifest.files.length===4&&new Set(manifest.files.map(f=>f.path)).size===4&&['plan.json','review.json','review.html','run.json'].every(p=>manifest.files.some(f=>f.path===p)),'OUTPUT_PACKAGE_INVENTORY_INVALID');
 const content={};for(const f of manifest.files)content[f.path]=await original(join(directory,f.path),f);
 const plan=JSON.parse(content['plan.json']),review=JSON.parse(content['review.json']),rawText=new TextDecoder('utf8',{fatal:true}).decode(content['run.json']),run=parseRun(rawText).value;
 need(manifest.planSha256===descriptor(content['plan.json']).sha256&&review.planSha256===manifest.planSha256&&review.status==='READY','OUTPUT_PLAN_CHANGED');
 const retainedPlan=run.artifacts.find(a=>a.id==='preparation-plan');need(retainedPlan&&retainedPlan.sha256===manifest.planSha256&&retainedPlan.bytes===content['plan.json'].length,'OUTPUT_PACKAGE_PLAN_MEMBER_CHANGED');
 need(run.result?.planSha256===manifest.planSha256&&same(run.result?.coverage,review.coverage),'OUTPUT_RUN_REVIEW_CHANGED');
 caseDefinition(plan.protocol);candidateDefinition(plan.candidate);
 need(same(caseDefinition(plan.protocol),review.protocol)&&same(candidateDefinition(plan.candidate),review.candidate),'OUTPUT_PACKAGE_DEFINITION_CHANGED');
 // A package is an explicit immutable input. The run and review keep every original row/member.
 need(same(run.result.rows,review.rows)&&same(run.result.headers,review.headers)&&same(run.metrics,review.metrics),'OUTPUT_PACKAGE_ROWS_CHANGED');
 need(run.result.source?.sha256===plan.source.sha256&&run.result.source?.bytes===plan.source.bytes,'OUTPUT_PACKAGE_SOURCE_CHANGED');
 const table=run.artifacts.find(f=>f.id==='original-table');need(table&&table.sha256===plan.source.sha256&&table.bytes===plan.source.bytes,'OUTPUT_PACKAGE_TABLE_CHANGED');
 return{selection:{name:spec.name,manifest:descriptor(manifestRaw),manifestValue:manifest},plan,review,reviewHtml:content['review.html'],rawText,run};
}
function selectedRoot(){return resolve(dirname(fileURLToPath(import.meta.url)),'../..');}
async function sourceIdentity(){
 const root=selectedRoot(),paths=['comparison/original-output/prepare.mjs','comparison/original-output/receive.mjs','comparison/original-output/review.mjs','comparison/contracts.mjs','comparison/model.mjs','comparison/store.mjs','dossier.mjs','portable.mjs'];
 return Promise.all(paths.map(async path=>({path,...descriptor(await readFile(join(root,path)))})));
}
export async function receiveOutputs({directory,storeDirectory,selection,selectionDirectory='.'}){
 directory=await privateDir(resolve(directory));storeDirectory=resolve(storeDirectory);
 need(selection?.schema==='sf88-original-output-receiving/v1','OUTPUT_RECEIVING_SCHEMA');
 id(selection.operationId);actor(selection.actor);id(selection.dossierId);
 need(Array.isArray(selection.packages)&&selection.packages.length>=1&&selection.packages.length<=16,'OUTPUT_PACKAGE_SELECTION_REQUIRED');
 const names=new Set();for(const p of selection.packages){id(p.name);need(!names.has(p.name),'OUTPUT_PACKAGE_NAME_DUPLICATE');names.add(p.name);}
 const packages=[];for(const p of selection.packages)packages.push(await packageInput(selectionDirectory,p));
 const protocol=packages[0].review.protocol;
 need(packages.every(p=>same(p.review.protocol,protocol)),'OUTPUT_PROTOCOL_MISMATCH');
 const existing=selection.existingCase??null;
 if(existing)need(typeof existing.caseId==='string'&&typeof existing.caseVersionId==='string','OUTPUT_EXISTING_CASE_REQUIRED');
 const source=await sourceIdentity(),intent={schema:selection.schema,operationId:selection.operationId,actor:selection.actor,dossierId:selection.dossierId,existingCase:existing,protocol,packages:packages.map(p=>p.selection),source};
 // Physical private directories may change on receiving; identities and original requests do not.
 await saved(join(directory,'intent.json'),intent);
 const requests=await privateDir(join(directory,'requests')),outputs=await privateDir(join(directory,'outputs'));
 const store=await openDossierStore(storeDirectory);let meta=await store.getMetadata(selection.dossierId);
 need(meta.questions.some(q=>q.id===protocol.questionId),'OUTPUT_QUESTION_NOT_FOUND');
 const operations=[];
 async function apply(name,action,payload){
  const file=join(requests,name+'.json');let request=await maybe(file);
  if(request)need(request.action===action&&same(request.payload,payload)&&same(request.actor,selection.actor),'OUTPUT_ORIGINAL_REQUEST_CHANGED');
  else{
   const current=await store.getMetadata(selection.dossierId);
   request=comparisonInput({requestId:'output-'+hash({operationId:selection.operationId,name}),expectedRevision:current.revision,actor:selection.actor,action,payload});
   await saved(file,request);
  }
  const receipt=await store.reviewComparison(selection.dossierId,{...request,projection:'metadata'});
  need(receipt.operation?.requestId===request.requestId,'OUTPUT_RECEIPT_MISMATCH');
  await saved(join(requests,name+'.accepted.json'),receipt.operation);operations.push(receipt.operation);return receipt.operation.record;
 }
 let caseRecord;
 if(existing){
  const page=await store.comparison(selection.dossierId,{caseId:existing.caseId,caseVersionId:existing.caseVersionId});
  need(page.case&&same(page.case.definition,protocol),'OUTPUT_EXISTING_PROTOCOL_CHANGED');caseRecord=page.case;
 }else caseRecord=await apply('case','case.save',{caseId:null,previousVersionId:null,definition:protocol});
 const scope={caseId:caseRecord.id,caseVersionId:caseRecord.versionId},runs=[],files=[];
 for(const p of packages){
  const name=p.selection.name,candidate=await apply(name+'-candidate','candidate.save',{...scope,candidateId:null,previousVersionId:null,definition:p.review.candidate});
  const run=await apply(name+'-run','run.import',{...scope,candidateVersionId:candidate.versionId,rawText:p.rawText});
  runs.push({name,candidateVersionId:candidate.versionId,runId:run.id,externalRunId:run.definition.externalRunId,coverage:p.review.coverage});
  files.push(await retain(join(outputs,name+'-mapping-review.json'),json(p.review)));
  files.push(await retain(join(outputs,name+'-mapping-review.html'),p.reviewHtml));
 }
 const revision=operations.at(-1).dossierRevision,report=await store.comparisonReport(selection.dossierId,{revision,...scope});
 for(const format of ['json','html','csv']){
  const value=await store.exportComparison(selection.dossierId,{revision,...scope,format});
  files.push(await retain(join(outputs,'comparison.'+format),value.body));
 }
 for(const run of runs){
  const raw=await store.comparisonFile(selection.dossierId,{revision,runId:run.runId}),prepared=packages.find(p=>p.selection.name===run.name);
  need(raw.body.equals(Buffer.from(prepared.rawText)),'OUTPUT_RETAINED_RAW_CHANGED');
  files.push(await retain(join(outputs,run.name+'-original-run.json'),raw.body));
  for(const a of prepared.run.artifacts){
   const member=await store.comparisonFile(selection.dossierId,{revision,runId:run.runId,artifactId:a.id});
   need(member.body.length===a.bytes&&descriptor(member.body).sha256===a.sha256,'OUTPUT_RETAINED_MEMBER_CHANGED');
   files.push(await retain(join(outputs,'originals',run.name,a.path),member.body));
  }
 }
 const portablePath=join(outputs,'complete-dossier.research.json.gz'),portableReceiptPath=join(outputs,'portable-receipt.json');
 let portable=await maybe(portableReceiptPath);
 if(!portable){
  try{const st=await lstat(portablePath);need(st.isFile()&&!st.isSymbolicLink()&&st.size<=256*1024*1024,'OUTPUT_PORTABLE_INVALID');const b=await readFile(portablePath);portable={...descriptor(b),file:portablePath};}
  catch(e){if(e.code!=='ENOENT')throw e;portable=await writePortableFile(portablePath,await store.exportStream(selection.dossierId,{compression:'gzip',revision}));}
  // Exact native portable parsing and selected revision comparison below precede completion.
  await saved(portableReceiptPath,{bytes:portable.bytes,sha256:portable.sha256});
 }
 await original(portablePath,portable,256*1024*1024);
 const coldDirectory=await privateDir(join(directory,'cold-store')),cold=await openDossierStore(coldDirectory);
 const reopen=async()=>{const stream=await openPortableFile(portablePath);try{return await cold.reopenStream(stream,{projection:'metadata'});}finally{stream.destroy();}};
 let coldHead=null;try{coldHead=(await cold.getMetadata(selection.dossierId)).revision;}catch(e){if(e.code!=='DOSSIER_NOT_FOUND')throw e;}
 const expectedHead=Math.max(coldHead??0,revision),received=await reopen(),second=await reopen();
 need(received.id===selection.dossierId&&second.id===selection.dossierId&&received.revision===expectedHead&&second.revision===expectedHead,'OUTPUT_COLD_IDENTITY_CHANGED');
 need(same(await cold.comparisonReport(selection.dossierId,{revision,...scope}),report),'OUTPUT_COLD_REPORT_CHANGED');
 for(const run of runs){
  const p=packages.find(p=>p.selection.name===run.name),raw=await cold.comparisonFile(selection.dossierId,{revision,runId:run.runId});
  need(raw.body.equals(Buffer.from(p.rawText)),'OUTPUT_COLD_RAW_CHANGED');
  for(const a of p.run.artifacts){const f=await cold.comparisonFile(selection.dossierId,{revision,runId:run.runId,artifactId:a.id});need(descriptor(f.body).sha256===a.sha256&&f.body.length===a.bytes,'OUTPUT_COLD_MEMBER_CHANGED');}
 }
 // Replay original requests through the actual cold engine after all later accepted operations.
 for(const op of operations){
  const file=op.action==='case.save'?'case':runs.find(r=>r.runId===op.record.id)?.name+'-run';
  let request;
  if(op.action==='case.save')request=await maybe(join(requests,'case.json'));
  else if(op.action==='candidate.save'){const r=runs.find(r=>r.candidateVersionId===op.record.versionId);request=await maybe(join(requests,r.name+'-candidate.json'));}
  else request=await maybe(join(requests,file+'.json'));
  const receipt=await cold.reviewComparison(selection.dossierId,{...request,projection:'metadata'});
  need(receipt.duplicate&&same(receipt.operation,op)&&(await cold.getMetadata(selection.dossierId)).revision===expectedHead,'OUTPUT_COLD_REQUEST_REPLAY_CHANGED');
 }
 need(same(await sourceIdentity(),source),'OUTPUT_IMPLEMENTATION_CHANGED');
 const result={schema:'sf88-original-output-receiving-result/v1',state:'ORIGINAL_OUTPUTS_RECEIVED',operationId:selection.operationId,dossierId:selection.dossierId,...scope,revision,runs,source,operations:operations.map(o=>({requestId:o.requestId,action:o.action,recordId:o.record.id,versionId:o.record.versionId,dossierRevision:o.dossierRevision})),files:files.map(f=>({path:f.file.slice(outputs.length+1),bytes:f.bytes,sha256:f.sha256})),portable:{path:'complete-dossier.research.json.gz',bytes:portable.bytes,sha256:portable.sha256},receiving:{sameDossier:true,originalBytes:true,originalRequestReplay:true,retainedRevision:revision},humanReview:{state:'READY_FOR_NAMED_REVIEW',instruction:'Open the actual populated comparison at desktop and narrow widths. Inspect every original, HTML/CSV report and full editable received dossier; record scientific judgments and decisions in the existing UI.'}};
 await saved(join(directory,'receiving-result.json'),result);return result;
}
export async function main(argv=process.argv.slice(2)){
 const{values:v}=parseArgs({args:argv,options:{selection:{type:'string'},directory:{type:'string'},store:{type:'string'},'lock-held':{type:'boolean',default:false}},strict:true});
 need(v.selection&&v.directory&&v.store,'OUTPUT_RECEIVING_ARGUMENTS_REQUIRED');
 const directory=await privateDir(resolve(v.directory));
 if(!v['lock-held']){
  const child=spawn('flock',['--no-fork','--nonblock',join(directory,'original-output.lock'),process.execPath,fileURLToPath(import.meta.url),...argv,'--lock-held'],{stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{const code=await new Promise((yes,no)=>{child.once('error',no);child.once('close',(code,signal)=>yes({code,signal}));});need(code.code===0&&!code.signal,'OUTPUT_RECEIVING_CHILD_FAILED');}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}return;
 }
 const file=resolve(v.selection),body=await readFile(file);need(body.length<=4*1024*1024,'OUTPUT_SELECTION_TOO_LARGE');
 const result=await receiveOutputs({directory,storeDirectory:resolve(v.store),selection:JSON.parse(body),selectionDirectory:dirname(file)});process.stdout.write(json(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.code??'OUTPUT_RECEIVING_FAILED',details:e.details??{}})+'\n');process.exitCode=1;});
