#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// One full original public-source study, publication, transfer and portable-receiving operation.
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile,mkdir,chmod,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openOpenAQWorkspace } from '../workspace.mjs';
import { startOpenAQServer } from '../server.mjs';
import { inspectOpenAQSource } from '../managed.mjs';
import { downloadOpenAQProject } from '../download.mjs';
import { bytes,digest,identity,privateDirectory,readJson,atomicJson,hashPrivate } from '../../postgres/publisher/files.mjs';
const IDS=Object.freeze({
 capture:'142e4ed4-b38c-4013-8718-d3050765ee66',review:'d12ca7d5-edec-4496-9b41-c3c588167ceb',
 report:'b674c1dc-dacc-407f-92a3-7f4c851baebc',prepare:'04be46cf-f8c0-44ec-bcbb-ae11652ab5a0',
 publicationReview:'fa5de342-ff7c-4fe9-a73d-15e2e606414e',publish:'1472c035-2856-4478-85e0-17b40b799355',
 export:'8d162fe9-5a70-449e-9b28-752cd0f67c6f',receive:'74ea837b-087d-4571-86b9-4f9e38f08c16'
});
const need=(v,m)=>{if(!v)throw new Error(m);};
const configuration={schema:'stellar-forge.openaq-study.v1',project:{name:'Del Norte source and receiving study',customer:'Stellar Forge integration operations',purpose:'Retain and review the official public local-day archive, publish its exact observations and reopen a complete portable project.'}};
async function openProject(directory,config,fetchImpl){
 try{return await openOpenAQWorkspace({directory,environment:process.env,fetchImpl});}
 catch(e){if(e.code!=='ENOENT')throw e;return openOpenAQWorkspace({directory,create:true,config,environment:process.env,fetchImpl});}
}
export async function runArchiveStudy({directory}){
 directory=resolve(directory);await privateDirectory(directory,true);
 const sourceIdentity=await inspectOpenAQSource();
 let httpCalls=0,project=null,receiver=null,server=null;const phases=[],cleanup=[],startedAt=new Date().toISOString();
 const network=async(...args)=>{httpCalls++;return fetch(...args);};
 const outcome={schema:'stellar-forge.openaq-original-study-operation.v1',directory,sourceIdentity,ids:IDS,startedAt,
  source:'Official OpenAQ public AWS object; actual source GET with original observed headers. No API account, provider write or payment.',
  phases,state:'RUNNING'};
 const retain=()=>atomicJson(directory,'result.json',{...outcome,providerHTTPCallsThisInvocation:httpCalls,cleanup,finishedAt:new Date().toISOString()});
 async function action(workspace,action,id,input){
  let op;try{op=await workspace.read('operation',{id});}catch(e){if(e.status!==404)throw e;}
  if(!op)op=await workspace.start(action,{...input,workspaceId:workspace.id,requestId:id});
  else{
   const request=await workspace.read('request',{id});
   need(request.action===action&&identity(request.input)===identity(input),'Original retained request input differs; do not redispatch');
   if(['PREPARED','FAILED','INTERRUPTED'].includes(op.state))op=await workspace.resume({workspaceId:workspace.id,requestId:id});
  }
  const result=await workspace.wait(id);need(result.state==='COMPLETE',action+' did not complete: '+JSON.stringify(result.error));return result.result;
 }
 try{
  project=await openProject(join(directory,'project'),configuration,network);
  const plan=JSON.parse(await readFile(new URL('../examples/archive-plan.json',import.meta.url),'utf8'));
  const context=JSON.parse(await readFile(new URL('../examples/archive-context.json',import.meta.url),'utf8'));
  const captured=await action(project,'capture',IDS.capture,{plan,context});
  const raw=captured.receipts.find(x=>x.archiveLocalDay==='2022-05-03');
  need(raw&&captured.projection.rows>0,'The original source capture has no selected observations');
  const preview=await project.read('preview',{id:IDS.capture,offset:0,limit:250});
  need(preview.rows.length===preview.total,'The actual reference needs another original preview page');
  need(preview.rows.some(x=>x.datetime_local==='2022-05-04T00:00:00-06:00'&&x.archive_local_day==='2022-05-03'),'The exclusive-end/local-file-day relationship was lost');
  phases.push({name:'original-source',captureId:captured.id,captureSha256:captured.captureSha256,
   sourceSha256:raw.sha256,sourceBytes:raw.bytes,headers:raw.headers,rows:captured.projection.rows,sensors:[...new Set(preview.rows.map(r=>r.sensor_id))],
   allValueTokensAreStrings:preview.rows.every(r=>typeof r.value_token==='string')});await retain();
  const review=await action(project,'review',IDS.review,{captureId:captured.id,captureSha256:captured.captureSha256,
   reviewer:'Codex — source integration review',decision:'accepted',
   note:'The complete official public archive object is retained. Its six sensor series keep their original units and decimal text, including exclusive-end midnight rows in the original local-day file. The bundled station/rights context remains explicitly a documentation example, not a fresh API response.',
   attribution:'OpenAQ; original provider AirNow; station attribution Unknown Governmental Organization, as named in the original location documentation.',
   rightsBasis:'The original location 2178 documentation identifies US Public Domain (license 33), beginning 2016-01-30 with no stated end, covering this selected 2022 local-day example. Retain that source basis and OpenAQ attribution for this internal engineering source/report delivery.',
   rightsSources:['https://docs.openaq.org/resources/locations','https://docs.openaq.org/aws/quick-start','https://docs.openaq.org/about/terms'],
   allowDerivedDelivery:true});
  const report=await action(project,'report',IDS.report,{title:'Del Norte — original May 3, 2022 station observations',
   purpose:configuration.project.purpose,captureIds:[captured.id],reviewIds:[review.id],reviewer:'Codex — source integration review',
   note:'Separate each sensor, parameter and original unit. Archive intervals, source flags and per-observation coverage are absent and remain unknown. Counts describe retained observations rather than certifying complete monitoring. The mean, where selected, is an exact unweighted source-value expression.',
   includeMean:true,excludeFlagged:false});
  phases.push({name:'named-review-and-report',reviewId:review.id,reportId:report.id,reportSha256:report.reportSha256,series:report.series.length,rows:report.series.reduce((n,s)=>n+s.rows,0)});await retain();
  const pair={captureId:captured.id,sourceReviewId:review.id};
  const candidate=await action(project,'publication.prepare',IDS.prepare,pair);
  need(candidate.publication?.state==='READY'||candidate.publication?.state==='REVIEWED'||candidate.publication?.state==='PUBLISHED','Inspect the actual original extraction state: '+candidate.publication?.state);
  const inspected=await project.read('publication.inspect',{...pair,runId:IDS.prepare,query:'limit=250'});
  need(inspected.preview,'Original candidate inspection returned no dataset page');
  const originalReview=await action(project,'publication.review',IDS.publicationReview,{...pair,runId:IDS.prepare,
   reviewer:'Codex — original dataset publication',note:'Publish all retained source-string columns from the complete original local-day capture.',initialize:true});
  const nativeReviewId=originalReview.data.review.id;
  const published=await action(project,'publication.publish',IDS.publish,{...pair,runId:IDS.prepare,publicationReviewId:nativeReviewId});
  need(published.state==='PUBLISHED','Original dataset publication is not PUBLISHED');
  phases.push({name:'original-frictionless-dataset',runId:IDS.prepare,reviewId:nativeReviewId,state:published.state,
   candidateDigest:inspected.run.data.candidate?.candidateDigest??originalReview.data.review.candidateDigest,
   snapshot:published.data.publication.snapshot});await retain();
  const exported=await action(project,'export',IDS.export,{captureIds:[captured.id],reviewIds:[review.id],reportIds:[report.id]});
  const connectionFile=join(directory,'project','connection.json');
  server=await startOpenAQServer({workspace:project,port:0,sourceIdentity,connectionFile,ownsWorkspace:false});
  const transferred=await downloadOpenAQProject({connectionFile,exportId:IDS.export,directory:join(directory,'transfer')});
  const transferredAgain=await downloadOpenAQProject({connectionFile,exportId:IDS.export,directory:join(directory,'transfer')});
  const archive=join(directory,'transfer',exported.file);
  const actual=await hashPrivate(archive,256*1024*1024);need(actual.hash===exported.sha256&&actual.bytes===exported.bytes,'Native transferred archive differs');
  phases.push({name:'original-retained-transfer',exportId:IDS.export,file:exported.file,bytes:exported.bytes,sha256:exported.sha256,
   sourceFiles:exported.files,first:transferred,second:transferredAgain});await retain();
  receiver=await openProject(join(directory,'received'),{...configuration,project:{...configuration.project,name:'Received Del Norte source study'}},network);
  const received=await action(receiver,'receive',IDS.receive,{archivePath:archive,sha256:exported.sha256});
  const restoredCapture=await receiver.read('capture',{id:captured.id}),restoredReport=await receiver.read('report',{id:report.id}),restoredReview=await receiver.read('review',{id:review.id});
  need(identity(restoredCapture)===identity(captured)&&identity(restoredReport)===identity(report)&&identity(restoredReview)===identity(review),'The original received scientific records differ');
  const callsBefore=httpCalls;const repeated=await action(project,'capture',IDS.capture,{plan,context});
  need(identity(repeated)===identity(captured)&&httpCalls===callsBefore,'Reopening the same original capture dispatched another source read');
  await receiver.close();receiver=null;
  receiver=await openProject(join(directory,'received'),{...configuration,project:{...configuration.project,name:'Received Del Norte source study'}},network);
  const reopened=await receiver.read('capture',{id:captured.id});need(identity(reopened)===identity(captured)&&httpCalls===callsBefore,'Portable reopen changed original data or dispatched source acquisition');
  phases.push({name:'portable-receiving-reopen',sourceWorkspaceId:received.sourceWorkspaceId,receivingWorkspaceId:receiver.id,captures:received.captures,receivedFiles:received.receivedFiles,
   sameCapture:true,sameReview:true,sameReport:true,sourceCallsDuringReopen:0});
  outcome.state='COMPLETE';
 }catch(e){outcome.state='ERROR';outcome.error={code:e.code??'OPENAQ_ORIGINAL_STUDY_FAILED',message:e.message,stack:e.stack};}
 finally{
  for(const[name,handle]of[['server',server],['receiver',receiver],['project',project]]){
   if(!handle)continue;try{await handle.close();cleanup.push({name,closed:true});}catch(e){cleanup.push({name,closed:false,error:e.code??e.message});outcome.state='ERROR';}
  }
  await retain();
 }
 return {...outcome,providerHTTPCallsThisInvocation:httpCalls,cleanup,finishedAt:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await runArchiveStudy({directory:process.argv[2]});process.stdout.write(JSON.stringify(result)+'\n');if(result.state!=='COMPLETE')process.exitCode=1;
}
