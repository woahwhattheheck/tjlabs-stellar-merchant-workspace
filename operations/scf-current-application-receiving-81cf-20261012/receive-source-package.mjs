#!/usr/bin/env node
// MIT. Continue the saved SCF review with its complete current source package.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {receiveCurrentSource,reopenCurrentSource,receiveCurrentReview,reopenCurrentReview,applyPreparedCurrentReview} from './source-phase.mjs';

const sha=body=>createHash('sha256').update(body).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(value,message)=>{if(!value)throw Error(message);};
const json=value=>JSON.stringify(value,null,2)+'\n';
const configPath=process.argv[2],verifyOnly=process.argv[3]==='--verify';
need(configPath&&process.argv.slice(3).every(value=>value==='--verify'),'Select the original source-phase configuration.');
const cfg=JSON.parse(await fs.readFile(configPath,'utf8'));
need(cfg.operationId==='SCF-GRANT-CURRENT-REVIEW-81CF-20261012','Continue the original receiving operation.');
need(cfg.phaseId==='SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012','Select the following complete source phase.');
const output=path.resolve(cfg.outputDirectory),sourceRoot=path.resolve(cfg.sourceRoot);
const site=path.join(sourceRoot,'stellar-forge/developer-site'),dist=path.join(site,'dist');
const stages=[];let stageName='START';
async function read(name){return fs.readFile(path.join(output,name),'utf8');}
async function optional(name){try{return await read(name);}catch(error){if(error.code!=='ENOENT')throw error;return null;}}
async function write(name,body){
  need(typeof name==='string'&&!path.isAbsolute(name)&&!name.split('/').includes('..'),'Retain an original output path.');
  const file=path.join(output,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.new';await fs.writeFile(temporary,body,{mode:0o600});await fs.rename(temporary,file);
  return {name,bytes:Buffer.byteLength(body),sha256:sha(body)};
}
async function stage(name,detail={}){
  stageName=name;const memory=process.memoryUsage();
  stages.push({name,at:new Date().toISOString(),rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,...detail});
  await write('prepared-native-progress.json',json({operationId:cfg.operationId,phaseId:cfg.phaseId,stages}));
  console.log('SCF_SOURCE_RECEIVING_STAGE '+JSON.stringify(stages.at(-1)));
  if(global.gc)global.gc();
}
const submission=await import(pathToFileURL(path.join(dist,'grant-submission-core.mjs')));
const handover=await import(pathToFileURL(path.join(dist,'grant-handover-source.mjs')));
const review=await import(pathToFileURL(path.join(dist,'grant-review-round-core.mjs')));
const exporter=await import(pathToFileURL(path.join(site,'grant-export.mjs')));

async function inputs(){
  const [draftText,reviewText,recordText,sourcePackageText,browserRecordText]=await Promise.all([
    fs.readFile(cfg.originalDraftPath,'utf8'),fs.readFile(cfg.originalReviewPath,'utf8'),
    fs.readFile(cfg.originalRecordPath,'utf8'),fs.readFile(cfg.sourcePackagePath,'utf8'),
    fs.readFile(cfg.originalBrowserRecordPath||cfg.originalRecordPath,'utf8')
  ]);
  need(sha(sourcePackageText)===cfg.sourcePackageSha256,'Receive the exact selected complete source package.');
  const savedRecord=JSON.parse(recordText);
  const originalDraft=await handover.openDraftEnvelope(draftText);
  const originalBrowserRecord=JSON.parse(browserRecordText);
  need(originalBrowserRecord.id&&Number.isSafeInteger(originalBrowserRecord.revision)&&
    originalBrowserRecord.input?.id===originalDraft.id,
    'Retain the actual original browser binding separately from the native edition.');
  const {input,...originalBrowserBinding}=originalBrowserRecord;
  if(savedRecord.schema==='stellar-forge.source-package-native-submission-record.v1'){
    need(savedRecord.operationId===cfg.operationId&&same(savedRecord.input,originalDraft)&&
      same(savedRecord.originalBrowserBinding,originalBrowserBinding),
      'Continue the preceding full native draft and its original browser lineage.');
  }else{
    need(same(savedRecord,originalBrowserRecord)&&same(savedRecord.input,originalDraft),
      'Retain the actual original saved submission and browser binding.');
  }
  need(originalDraft.id===cfg.draftId,'Continue the original saved draft.');
  return {draftText,reviewText,savedRecord,originalDraft,sourcePackageText,originalBrowserRecord,originalBrowserBinding};
}

async function receive(){
  const selected=await inputs();
  const oldResult=JSON.parse(await fs.readFile(cfg.originalResultPath,'utf8'));
  need(oldResult.state==='COMPLETE'&&oldResult.reviewActions===cfg.previousReviewEvents&&
    oldResult.originalDraftId===cfg.draftId&&oldResult.originalReviewId===cfg.reviewId,
    'Continue the exact completed original native review.');
  const complete=await receiveCurrentSource({
    operationId:cfg.operationId,draftId:cfg.draftId,reviewId:cfg.reviewId,
    previousReviewEvents:cfg.previousReviewEvents,originalDraftText:selected.draftText,
    originalReviewText:selected.reviewText,sourcePackageText:selected.sourcePackageText,
    sourcePackageSha256:cfg.sourcePackageSha256,sourceRecords:cfg.sourceRecords,at:cfg.at,
    submission,handover,exporter,sha256:sha
  });
  const deliveries=[];
  const manifestText=complete.files.get('source-receiving-manifest.json');
  // Publish the phase manifest after every full prepared file is present.
  for(const [name,body] of complete.files)if(name!=='source-receiving-manifest.json')
    deliveries.push(await write(name,body));
  deliveries.push(await write('source-receiving-manifest.json',manifestText));
  await stage('complete-source-and-prepared-submission',{
    originalDraftId:cfg.draftId,sourceRecords:cfg.sourceRecords,
    currentSource:complete.manifest.currentSource,preparedEdition:complete.manifest.preparedEdition,
    preservedVersions:complete.comparison.preserved.savedVersions,
    retainedEditedAnswers:complete.comparison.preserved.editedAnswers
  });
  const draftText=complete.files.get('draft.json');
  complete.originalRound=null;complete.files.clear();if(global.gc)global.gc();
  const joined=await receiveCurrentReview({
    operationId:cfg.operationId,originalReviewText:selected.reviewText,
    originalDraft:selected.originalDraft,originalDraftText:selected.draftText,currentReviewText:await optional('Current_Review_Checkpoint.json'),
    draftText,sourcePackageSha256:cfg.sourcePackageSha256,
    previousReviewEvents:cfg.previousReviewEvents,at:cfg.at,actorId:cfg.actorId,
    review,sha256:sha,onCheckpoint:body=>write('Current_Review_Checkpoint.json',body)
  });
  if(cfg.preparedReviewPath){
    const preparedText=await fs.readFile(cfg.preparedReviewPath,'utf8');
    const authored=await applyPreparedCurrentReview({
      round:joined.round,preparedText,preparedSha256:cfg.preparedReviewSha256,
      sourcePackageText:selected.sourcePackageText,actorId:cfg.actorId,at:cfg.at,
      submission,handover,review,sha256:sha,
      onCheckpoint:body=>write('Current_Review_Checkpoint.json',body)
    });
    Object.assign(joined,authored);
    joined.receiving.currentReviewEvents=joined.round.events.length;
    joined.receiving.actionsAdded=joined.round.events.length-cfg.previousReviewEvents;
    joined.receiving.status=joined.view.status;joined.receiving.readiness=joined.view.readiness;
    joined.receiving.preparedReview=authored.preparedReview;
    deliveries.push(await write('current-authored-review-receiving.json',json(authored.preparedReview)));
    await stage('original-authored-current-review-received',{
      recordedDecisions:authored.preparedReview.decisions.length,
      recordedResolutions:authored.preparedReview.resolutions.length,
      pending:authored.preparedReview.pending.length,reviewStatus:joined.view.status
    });
  }
  deliveries.push(await write('downloads/Current_Complete_Submission.json',draftText));
  deliveries.push(await write('downloads/Current_Complete_Review.json',joined.exported));
  deliveries.push(await write('downloads/Current_Review_Report.md',joined.report));
  const reviewComparison={schema:'stellar-forge.source-package-review-comparison.v1',
    operationId:cfg.operationId,phaseId:cfg.phaseId,at:cfg.at,draftId:cfg.draftId,reviewId:cfg.reviewId,
    sourcePackageSha256:cfg.sourcePackageSha256,sourceRecords:cfg.sourceRecords,
    ...joined.receiving,targets:joined.comparison.rows};
  deliveries.push(await write('source-review-comparison.json',json(reviewComparison)));
  const originalBinding=selected.originalBrowserBinding;
  const record={schema:'stellar-forge.source-package-native-submission-record.v1',
    operationId:cfg.operationId,phaseId:cfg.phaseId,at:cfg.at,originalBrowserBinding:originalBinding,
    originalDraftSha256:sha(selected.draftText),input:complete.draft,
    currentSourcePackageSha256:cfg.sourcePackageSha256,selectedReviewEdition:joined.view.selectedEdition};
  deliveries.push(await write('native-submission-record.json',json(record)));
  const browserInput={schema:'stellar-forge.source-package-browser-receiving-input.v1',
    operationId:cfg.operationId,phaseId:cfg.phaseId,sourceRoot,
    caseRelativeInput:(cfg.receivingDirectory||'receiving/source-package-continuation')+'/browser-receiving-input.json',
    originalRecordPath:cfg.originalBrowserRecordPath||cfg.originalRecordPath,originalDraftPath:cfg.originalDraftPath,
    originalReviewPath:cfg.originalReviewPath,currentDraftPath:path.join(output,'draft.json'),
    currentReviewPath:path.join(output,'downloads/Current_Complete_Review.json'),
    sourcePackagePath:cfg.sourcePackagePath,sourcePackageSha256:cfg.sourcePackageSha256,
    sourceRecords:cfg.sourceRecords,originalBrowserBinding:originalBinding,
    ...(Object.hasOwn(cfg.sourceSelection,'reviewerPaths')?{reviewerPaths:cfg.sourceSelection.reviewerPaths}:{}),
    routes:{application:'/grant.html',companion:'/grant-companion.html',
      editor:'/grant-submission.html',review:'/grant-review-round.html'},
    sourceRead:'Open the original saved draft while the initial source read is pending, receive the complete package through Source editions, save the same local record, and reopen the full current native draft and original review in another browser store.'};
  deliveries.push(await write('browser-receiving-input.json',json(browserInput)));
  await stage('original-review-current-edition-selected',{
    originalReviewId:cfg.reviewId,retainedOriginalActions:cfg.previousReviewEvents,
    reviewActions:joined.round.events.length,reviewStatus:joined.view.status,
    carriedDecisions:joined.receiving.carriedDecisions,reopenedDecisions:joined.receiving.reopenedDecisions
  });
  await write('RESULT.json',json({
    schema:'stellar-forge.current-source-package-receiving.v1',state:'SOURCE_RECEIVED',
    operationId:cfg.operationId,phaseId:cfg.phaseId,sourcePackageSha256:cfg.sourcePackageSha256,
    sourceRecords:cfg.sourceRecords,sourceSelection:cfg.sourceSelection,
    receivingDirectory:cfg.receivingDirectory||'receiving/source-package-continuation',
    precedingSourceDirectory:cfg.precedingSourceDirectory||null,
    originalDraftId:cfg.draftId,originalReviewId:cfg.reviewId,
    originalBrowserBinding:originalBinding,retainedOriginalActions:cfg.previousReviewEvents,
    reviewActions:joined.round.events.length,reviewStatus:joined.view.status,
    reviewReceiving:joined.receiving,currentApplication:complete.manifest.currentSource,
    selectedBundle:complete.manifest.selectedBundle,preparedEdition:complete.manifest.preparedEdition,
    nativeSourceManifest:'source-receiving-manifest.json',deliveries,stages,
    memory:process.memoryUsage(),maxResidentSetKiB:process.resourceUsage().maxRSS
  }));
}

async function verify(){
  const prepared=JSON.parse(await read('RESULT.json'));
  need(['SOURCE_RECEIVED','COMPLETE'].includes(prepared.state)&&prepared.operationId===cfg.operationId&&
    prepared.phaseId===cfg.phaseId&&prepared.sourcePackageSha256===cfg.sourcePackageSha256,
    'Open the complete output of this original source phase.');
  const selected=await inputs();
  const manifest=JSON.parse(await read('source-receiving-manifest.json'));
  const reopened=await reopenCurrentSource({
    manifest,readOutput:read,originalReviewText:selected.reviewText,
    originalDraftText:selected.draftText,handover,submission,sha256:sha
  });
  const nativeFiles=new Set(manifest.files.map(row=>row.path));
  for(const file of prepared.deliveries)if(!nativeFiles.has(file.name)){
    const body=await read(file.name);
    need(Buffer.byteLength(body)===file.bytes&&sha(body)===file.sha256,
      'Retain the complete source-phase delivery: '+file.name);
  }
  const currentReviewText=await read('downloads/Current_Complete_Review.json');
  const joined=await reopenCurrentReview({
    originalReviewText:selected.reviewText,currentReviewText,originalDraftText:selected.draftText,
    currentDraftText:reopened.exported,previousReviewEvents:cfg.previousReviewEvents,review,handover
  });
  const record=JSON.parse(await read('native-submission-record.json'));
  const originalBinding=selected.originalBrowserBinding;
  need(same(record.originalBrowserBinding,originalBinding)&&same(record.input,joined.draft),
    'Retain the original browser binding and the exact independently reopened current draft.');
  need(joined.round.events.length===prepared.reviewActions&&joined.view.status===prepared.reviewStatus,
    'The current review state changed between the original receiving phases.');
  const authored=prepared.reviewReceiving?.preparedReview;
  if(authored){
    const body=await fs.readFile(cfg.preparedReviewPath,'utf8');
    need(sha(body)===authored.preparedSha256&&authored.preparedSha256===cfg.preparedReviewSha256,
      'Retain the same full authored review input in the independent receiving phase.');
    for(const row of authored.decisions){
      const actual=joined.view.decisions.find(item=>item.id===row.id);
      need(actual&&same(actual.target,row.target)&&actual.bindingSha256===row.bindingSha256&&
        actual.decision===row.decision&&sha(actual.note)===row.noteSha256&&
        sha(JSON.stringify(actual.references))===row.referencesSha256,
        'Independently retain each complete current authored decision.');
    }
    for(const row of authored.resolutions){
      const change=joined.view.changes.find(item=>item.id===row.changeId);
      const actual=change?.resolutions.find(item=>item.id===row.id);
      need(change?.status==='resolved'&&actual&&sha(actual.note)===row.noteSha256,
        'Independently retain each original current request resolution.');
    }
  }
  const independentlyExported=await review.exportReviewRound(joined.round,{now:cfg.at});
  const independentlyPrepared=await handover.createDraftEnvelope(joined.draft,{exportedAt:cfg.at});
  need(same(JSON.parse(independentlyExported).round,joined.round)&&
    same(JSON.parse(independentlyPrepared).draft,joined.draft),
    'Retain every complete body through independent native re-export.');
  const exports=[
    await write('downloads/Independently_Received_Review.json',independentlyExported),
    await write('downloads/Independently_Received_Submission.json',independentlyPrepared)
  ];
  await stage('independent-current-source-submission-and-review',{
    sourceRecords:cfg.sourceRecords,originalDraftId:cfg.draftId,originalReviewId:cfg.reviewId,
    reviewActions:joined.round.events.length,originalActionsRetained:joined.originalEvents,
    currentApplication:joined.draft.currentSource,reviewStatus:joined.view.status
  });
  const complete={...prepared,state:'COMPLETE',completedAt:new Date().toISOString(),
    independentNativeReceiving:{processId:process.pid,originalActionsRetained:joined.originalEvents,
      originalDraftId:joined.draft.id,originalReviewId:joined.round.id,
      reviewActions:joined.round.events.length,reviewStatus:joined.view.status,
      submissionSHA256:sha(independentlyPrepared),reviewSHA256:sha(independentlyExported),
      selectedSource:joined.draft.currentSource,sourceRecords:cfg.sourceRecords,exports,
      maxResidentSetKiB:process.resourceUsage().maxRSS},
    stages:[...prepared.stages,...stages],maxResidentSetKiB:Math.max(
      prepared.maxResidentSetKiB||0,process.resourceUsage().maxRSS)};
  await write('RESULT.json',json(complete));
  console.log('SCF_CURRENT_SOURCE_COMPLETE '+JSON.stringify({
    output,originalDraftId:cfg.draftId,originalReviewId:cfg.reviewId,
    sourceRecords:cfg.sourceRecords,reviewActions:joined.round.events.length,
    reviewStatus:joined.view.status,downloads:prepared.deliveries.length+exports.length
  }));
}
try{if(verifyOnly)await verify();else await receive();}
catch(error){
  await write('SOURCE_RECEIVING_INCOMPLETE.json',json({
    operationId:cfg.operationId,phaseId:cfg.phaseId,stage:stageName,
    error:error.message,stack:error.stack,stages
  })).catch(()=>{});
  console.error('SCF_CURRENT_SOURCE_FAILED '+JSON.stringify({stage:stageName,message:error.message}));
  process.exitCode=1;
}
