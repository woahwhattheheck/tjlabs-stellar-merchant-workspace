#!/usr/bin/env node
// MIT. Apply the prepared source-specific review through the maintained review model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sha = body => createHash('sha256').update(body).digest('hex');
const git = body => createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const need = (value,message) => {if(!value)throw Error(message);};
const configPath=process.argv[2],verifyOnly=process.argv[3]==='--verify';
const cfg=JSON.parse(await fs.readFile(configPath,'utf8'));
const root=path.resolve(cfg.sourceRoot),caseRoot=path.dirname(root);
const output=path.resolve(cfg.outputDirectory),previous=path.resolve(cfg.previousOutputDirectory);
const dist=path.join(root,'stellar-forge/developer-site/dist');
const stages=[],exports=[];
let stageName='START';
async function write(name,body){
  const file=path.join(output,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.new';await fs.writeFile(temporary,body,{mode:0o600});await fs.rename(temporary,file);
  return {name,bytes:Buffer.byteLength(body),sha256:sha(body)};
}
async function stage(name,detail={}){
  stageName=name;const memory=process.memoryUsage();
  stages.push({name,at:new Date().toISOString(),rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,...detail});
  await write('prepared-native-progress.json',JSON.stringify({operationId:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',stages},null,2)+'\n');
  console.log('SCF_PREPARED_REVIEW_STAGE '+JSON.stringify(stages.at(-1)));
  if(global.gc)global.gc();
}
const review=await import(pathToFileURL(path.join(dist,'grant-review-round-core.mjs')));
const drafts=await import(pathToFileURL(path.join(dist,'grant-submission-core.mjs')));
const handover=await import(pathToFileURL(path.join(dist,'grant-handover-source.mjs')));

async function originalRound(){
  const file=cfg.retainedReviewPath?path.join(caseRoot,cfg.retainedReviewPath):path.join(root,cfg.originalReviewPath);
  const round=await review.importReviewRound(await fs.readFile(file,'utf8'));
  need(round.id==='SCF-TECHNICAL-BUYER-REVIEW-7108-20261012','Retain the original review identity');
  need(round.events.length===cfg.originalReviewActions,'Retain every selected original review action');
  return round;
}
async function verifyIndependent(){
  const prepared=JSON.parse(await fs.readFile(path.join(output,'RESULT.json'),'utf8'));
  need(prepared.state==='REVIEW_COMPLETE','Receive the actual completed prepared review');
  let baseline=await originalRound();
  const original={id:baseline.id,events:baseline.events};baseline=null;if(global.gc)global.gc();
  const roundText=await fs.readFile(path.join(output,'downloads/Current_Complete_Review.json'),'utf8');
  const round=await review.importReviewRound(roundText),view=await review.reviewRoundView(round);
  const draftText=await fs.readFile(path.join(previous,'downloads/Current_Complete_Submission.json'),'utf8');
  const draft=await handover.openDraftEnvelope(draftText);
  need(round.id===original.id&&same(round.events.slice(0,original.events.length),original.events),'Independent review lost prior history');
  need(view.status==='COMPLETE'&&view.completion.outcome==='ready-for-author-check'&&view.readiness.length===0,'Independent review is not complete');
  need(same(view.draft,draft),'Independent review and submission differ');
  const participant=view.participants.find(row=>row.label==='TJLabs AI application reviewer 81CF');
  need(participant,'Retain the selected reviewer');
  for(const judgment of cfg.reviewDecisions){
    const row=view.decisions.find(item=>item.actorId===participant.id&&same(item.target,judgment.target));
    need(row&&row.decision===judgment.decision&&row.note===judgment.note&&same(row.references,judgment.references||[]),'Independent recorded judgment differs');
  }
  for(const resolution of cfg.reviewResolutions){
    const row=view.changes.find(item=>item.id===resolution.changeId);
    need(row?.status==='resolved'&&row.resolutions.at(-1).note===resolution.note,'Independent request resolution differs');
  }
  const reopenedReview=await review.exportReviewRound(round);
  need(same(await review.importReviewRound(reopenedReview),round),'Complete review re-export changed content');
  exports.push(await write('downloads/Independently_Received_Review.json',reopenedReview));
  exports.push(await write('downloads/Independently_Received_Submission.json',draftText));
  await stage('independent-native-review-and-submission-receiving',{reviewActions:round.events.length,draftId:draft.id,reviewId:round.id});
  const result={...prepared,state:'COMPLETE',completedAt:new Date().toISOString(),independentNativeReceiving:{
    processId:process.pid,reviewId:round.id,draftId:draft.id,reviewActions:round.events.length,
    originalActionsRetained:original.events.length,reviewSHA256:sha(roundText),submissionSHA256:sha(draftText),
    exports,memory:process.memoryUsage(),maxResidentSetKiB:process.resourceUsage().maxRSS
  },stages:[...prepared.stages,...stages]};
  await write('RESULT.json',JSON.stringify(result,null,2)+'\n');
  console.log('SCF_CURRENT_REVIEW_COMPLETE '+JSON.stringify({output,engine:'prepared-native-model',originalDraftId:draft.id,originalReviewId:round.id,reviewActions:round.events.length,downloads:prepared.downloads.length+exports.length}));
}

async function completePreparedReview(){
  for(const selected of cfg.files){
    const body=await fs.readFile(path.join(root,selected.path));
    need(body.length===selected.bytes&&sha(body)===selected.sha256&&git(body)===selected.git_blob,'Selected source changed: '+selected.path);
  }
  const sourceIndex=JSON.parse(await fs.readFile(path.join(dist,'grant-data/source-index.json'),'utf8'));
  const application=await fs.readFile(path.join(dist,'grant-data/application.md'),'utf8');
  need(sha(application)===sourceIndex.application.sha256,'Retain the current complete application');
  const draftText=await fs.readFile(path.join(previous,'downloads/Current_Complete_Submission.json'),'utf8');
  const draft=await handover.openDraftEnvelope(draftText);
  let saved=JSON.parse(await fs.readFile(path.join(previous,'saved-submission-record.json'),'utf8'));
  need(same(saved.input,draft),'Continue the complete actual saved submission');saved=null;if(global.gc)global.gc();
  need(draft.id==='scf-technical-buyer-draft-7108-20261012'&&draft.currentSource===sourceIndex.application.sha256,'Select the current original draft');
  for(const answer of drafts.parseAnswers(application))need(draft.answers.find(row=>row.id===answer.id)?.text===answer.text,'Current answer differs: '+answer.id);
  const applicationReceiving=JSON.parse(await fs.readFile(path.join(previous,'application/RESULT.json'),'utf8'));
  const companionReceiving=JSON.parse(await fs.readFile(path.join(previous,'companion/companion-receiving.json'),'utf8'));
  need(applicationReceiving.status==='COMPLETE'&&companionReceiving.status==='complete','Retain the completed reader and companion');
  let baseline=await originalRound();
  const original={id:baseline.id,events:baseline.events};let round=baseline;baseline=null;
  try{
    const candidate=await review.importReviewRound(await fs.readFile(path.join(output,'Current_Review_Checkpoint.json'),'utf8'));
    need(candidate.id===original.id&&same(candidate.events.slice(0,original.events.length),original.events),'The saved checkpoint changed original history');
    round=candidate;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  let view=await review.reviewRoundView(round);
  await stage('retained-source-draft-and-review-selected',{sourceFiles:cfg.files.length,sourceCommit:cfg.sourceCommit,reviewActions:round.events.length,originalActions:original.events.length});
  async function checkpoint(name){
    need(round.id===original.id&&same(round.events.slice(0,original.events.length),original.events),'Preserve every original review action');
    await write('Current_Review_Checkpoint.json',await review.exportReviewRound(round));
    await stage(name,{reviewActions:round.events.length});
  }
  async function apply(kind,input,actorId,incoming=null){
    const key=sha(JSON.stringify({source:sourceIndex.application.sha256,revision:round.events.length,previousSha256:round.events.at(-1)?.sha256||null,kind,actorId,input}));
    const requestId='SCF-PREPARED-81CF-'+key;
    const prior=round.events.find(event=>event.id===requestId);
    round=await review.applyReviewAction(round,{requestId,expectedRevision:prior?.expectedRevision??round.events.length,actorId,kind,input},incoming);
    view=await review.reviewRoundView(round);if(global.gc)global.gc();
  }
  const label='TJLabs AI application reviewer 81CF';
  let participant=view.participants.find(row=>row.label===label);
  if(!participant){
    if(view.status==='COMPLETE')await apply('reopen',{note:'Continue the current prepared editorial review and retain the original completed history.'},round.creator.id);
    participant={id:'scf-application-reviewer-81cf',label};
    await apply('participant',{person:participant},round.creator.id);
  }
  const actorId=participant.id;
  const judgments=cfg.reviewDecisions,resolutions=cfg.reviewResolutions;
  need(Array.isArray(judgments)&&judgments.length===view.targets.length&&Array.isArray(resolutions)&&resolutions.length===5,'Retain the full substantive prepared review');
  if(!same(view.draft,draft)){
    if(view.status==='COMPLETE')await apply('reopen',{note:'Receive the current application and its complete source context while retaining the previous completed review.'},actorId);
    const capture=await review.readSubmissionExport(draftText,{fileName:'Current_Complete_Submission.json'});
    const comparison=await review.compareReviewDraft(round,capture);
    const decisions=comparison.decisions.map(row=>({decisionId:row.decision.id,choice:row.canCarry?'carry':'reopen',note:row.canCarry?'The complete selected content and source context are unchanged.':'The current full draft changes the selected text or source context; apply its prepared current-source review.'}));
    await apply('receive',{editionId:capture.id,fromEdition:view.selectedEdition,note:'Receive the actual saved current application, including all retained source editions, answers and authored notes.',decisions},actorId,capture);
    await checkpoint('current-complete-draft-received');
  }
  let decisionsAdded=0,resolutionsAdded=0;const seen=new Set();
  for(const judgment of judgments){
    const key=judgment.target.kind+':'+judgment.target.id;
    need(!seen.has(key),'A current target occurs twice');seen.add(key);
    const target=view.targets.find(row=>row.key===key);
    need(target&&judgment.applicationSha256===sourceIndex.application.sha256,'Prepared judgment selects a different application: '+key);
    need(['accepted','not-applicable'].includes(judgment.decision)&&judgment.note.trim().length>=50,'Retain the substantive prepared judgment: '+key);
    const existing=view.decisions.find(row=>row.actorId===actorId&&same(row.target,judgment.target));
    if(existing&&existing.decision===judgment.decision&&existing.note===judgment.note&&same(existing.references,judgment.references||[]))continue;
    if(view.status==='COMPLETE')await apply('reopen',{note:'Record the prepared current-source editorial decisions while retaining every earlier review action.'},actorId);
    await apply('review',{editionId:view.selectedEdition,target:judgment.target,bindingSha256:target.bindingSha256,decision:judgment.decision,note:judgment.note,references:judgment.references||[]},actorId);
    decisionsAdded++;if(decisionsAdded%3===0)await checkpoint('current-prepared-decisions-'+decisionsAdded);
  }
  await checkpoint('all-current-prepared-decisions-recorded');
  for(const resolution of resolutions){
    const change=view.changes.find(row=>row.id===resolution.changeId);
    need(change&&resolution.applicationSha256===sourceIndex.application.sha256,'Resolve the original request against the selected current source');
    if(change.status==='resolved'&&change.resolutions.at(-1)?.note===resolution.note)continue;
    if(view.status==='COMPLETE')await apply('reopen',{note:'Complete the prepared resolution of the original requested changes against this current draft.'},actorId);
    await apply('resolve',{changeId:resolution.changeId,editionId:view.selectedEdition,status:'resolved',note:resolution.note},actorId);
    resolutionsAdded++;await checkpoint('current-request-resolved-'+resolutionsAdded);
  }
  need(view.readiness.length===0,'Complete the remaining current review: '+JSON.stringify(view.readiness));
  if(view.status!=='COMPLETE')await apply('finish',{editionId:view.selectedEdition,outcome:'ready-for-author-check',note:'The complete current application, all nine answers and each original requirement have source-specific editorial decisions. The five original technical requests have current resolutions. The selected draft retains its source editions, authored history, working notes and full customer/finance companion.'},actorId);
  await checkpoint('complete-prepared-current-review');
  exports.push(await write('downloads/Current_Complete_Review.json',await review.exportReviewRound(round)));
  exports.push(await write('downloads/Current_Review_Report.md',await review.reviewReport(round)));
  await write('prepared-native-review-record.json',JSON.stringify({schema:'stellar-forge.prepared-native-review-record.v1',sourceCommit:cfg.sourceCommit,sourceApplicationSHA256:sourceIndex.application.sha256,input:round},null,2)+'\n');
  await write('RESULT.json',JSON.stringify({
    schema:'stellar-forge.current-application-receiving.v1',state:'REVIEW_COMPLETE',reviewEngine:'prepared-native-model',
    operationId:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',originalPublicationOperation:'SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012',
    sourceCommit:cfg.sourceCommit,overlayBlob:cfg.overlayBlob,sourceFiles:cfg.files.length,currentApplication:sourceIndex.application,
    originalDraftId:draft.id,originalReviewId:round.id,retainedOriginalActions:original.events.length,reviewActions:round.events.length,
    sourceEditions:draft.sources.length,authoredVersions:draft.versions.length,applicationReceiving,companionReceiving,
    reviewContinuation:{previousOutput:previous,decisionsAdded,resolutionsAdded},stages,downloads:exports,
    memory:process.memoryUsage(),maxResidentSetKiB:process.resourceUsage().maxRSS
  },null,2)+'\n');
}
try{if(verifyOnly)await verifyIndependent();else await completePreparedReview();}
catch(error){
  await write('PREPARED_REVIEW_INCOMPLETE.json',JSON.stringify({stage:stageName,error:error.message,stack:error.stack,stages},null,2)+'\n').catch(()=>{});
  console.error('SCF_PREPARED_REVIEW_FAILED '+JSON.stringify({stage:stageName,message:error.message}));process.exitCode=1;
}
