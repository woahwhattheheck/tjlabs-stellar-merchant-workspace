// Following source phase for the existing SCF current application and review.
// Runs inside the original receiving controller with its selected current modules.
export async function receiveCurrentSource({
  operationId, draftId, reviewId, previousReviewEvents, originalDraftText,
  originalReviewText, sourcePackageText, sourcePackageSha256, sourceRecords,
  at, submission, handover, exporter, sha256
}) {
  const need=(condition,message)=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const clone=value=>JSON.parse(JSON.stringify(value));
  need(operationId==='SCF-GRANT-CURRENT-REVIEW-81CF-20261012','Continue the original SCF receiving operation.');
  need(typeof at==='string'&&Number.isFinite(Date.parse(at)),'Retain this receiving phase time.');
  need(await sha256(sourcePackageText)===sourcePackageSha256,'The selected complete source package has changed.');
  const originalExport=JSON.parse(originalDraftText.replace(/^\uFEFF/,''));
  const before=originalExport.schema===submission.ENVELOPE?
    await handover.openDraftEnvelope(originalDraftText):await handover.verifyHandover(originalExport);
  need(before.id===draftId,'The selected saved submission belongs to another draft.');
  const originalReview=JSON.parse(originalReviewText.replace(/^\uFEFF/,''));
  need(originalReview.schema==='stellar-forge.grant-review-round-export.v1'&&
    originalReview.round?.id===reviewId,'Retain the original complete review export.');
  const originalRound=originalReview.round;
  need(originalRound.events.length===previousReviewEvents,'Retain the selected completed review revision.');
  need(await sha256(JSON.stringify(originalRound))===originalReview.sha256,'The original review envelope differs from its complete body.');
  const incoming=await handover.openReviewerSourcePackage(sourcePackageText);
  const sourceIndexFile=incoming.bundle.body.files.find(row=>row.role==='source-index');
  need(sourceIndexFile,'Retain the complete source index.');
  const indexObject=incoming.objects.find(row=>row.sha256===sourceIndexFile.sha256);
  need(indexObject,'Retain the source index object.');
  const indexBytes=Buffer.from(indexObject.base64,'base64');
  const sourceIndex=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(indexBytes));
  need(sourceIndex.sources.length===sourceRecords,'The complete reviewer source count differs from the selected edition.');
  need(incoming.bundle.body.files.length===4,'Receive all four original reviewer files.');
  const compared=submission.compareSource(before,incoming.source);
  const received=await handover.receiveReviewerSource(before,incoming,{at});
  need(received.id===before.id,'Retain the original draft identity.');
  need(received.currentSource===incoming.source.sha256,'Select the complete new application source.');
  const oldVersionCount=before.versions.length;
  need(same(received.versions.slice(0,oldVersionCount),before.versions),'Retain every original saved version.');
  for(const key of ['form','fields','reviews','planSources','planningReview','planningTargets','planningUpdate'])
    need(same(received[key],before[key]),'Source receiving changed the original '+key+'.');
  for(const source of before.sources)
    need(received.sources.some(value=>same(value,source)),'Retain every preceding application source.');
  const afterAnswers=new Map(received.answers.map(answer=>[answer.id,answer]));
  const comparisons=compared.map(change=>{
    const prior=before.answers.find(answer=>answer.id===change.id);
    const after=afterAnswers.get(change.id);
    need(after,'Retain every original answer identity.');
    if(change.edited)need(same(after,prior),'Preserve the complete edited answer and original source baseline: '+change.id);
    else {
      need(after.text===change.text&&after.baseText===change.text&&after.sourceSha===incoming.source.sha256,
        'Receive the complete unchanged answer from the selected source: '+change.id);
      need(after.note===prior.note,'Preserve the original answer note: '+change.id);
    }
    return {id:change.id,title:change.title,edited:change.edited,sourceChanged:change.sourceChanged,
      choice:change.edited?'retained-edited-answer':'received-current-source',
      prior:clone(prior),incomingText:change.text,received:clone(after)};
  });
  const oldHandover=before.handover;
  const newHandover=received.handover;
  if(oldHandover)for(const collection of ['objects','bundles','evidence','editions','returns'])
    for(const row of oldHandover[collection]||[])
      need((newHandover?.[collection]||[]).some(value=>same(value,row)),'Retain original handover '+collection+'.');
  need(newHandover?.selection.bundleId===incoming.bundle.id,'Select the received complete reviewer bundle.');
  const full=await exporter.prepareGrantExport(received,{selection:'auto',format:'plain',generatedAt:at});
  need(full.draft.id===draftId,'Keep the original draft in the prepared export.');
  need(same(full.draft.versions.slice(0,oldVersionCount),before.versions),'Retain all original versions in the prepared export.');
  const outputDraftText=full.files.get('draft.json');
  need(typeof outputDraftText==='string','Retain the complete prepared submission export.');
  const comparison={
    schema:'commons.scf-current-review-source-comparison.v1',operationId,at,draftId,reviewId,
    previousReviewEvents,originalReviewSha256:await sha256(originalReviewText),
    beforeSource:before.currentSource,currentSource:incoming.source.sha256,
    sourcePackageSha256,bundleId:incoming.bundle.id,sourceRecords,
    answers:comparisons,form:clone(received.form),fields:clone(received.fields),
    preserved:{savedVersions:oldVersionCount,originalSources:before.sources.length,
      editedAnswers:comparisons.filter(row=>row.edited).map(row=>row.id),
      priorReviewEvents:previousReviewEvents}
  };
  full.files.set('source-comparison.json',JSON.stringify(comparison,null,2)+'\n');
  const files=[];
  for(const [path,text] of full.files)files.push({path,bytes:Buffer.byteLength(text),sha256:await sha256(text)});
  const manifest={
    schema:'commons.scf-current-review-source-receiving.v1',operationId,at,
    draftId,reviewId,previousReviewEvents,sourcePackageSha256,
    selectedBundle:incoming.bundle.id,currentSource:incoming.source.sha256,
    sourceRecords,preparedEdition:full.edition.id,
    sourceFiles:incoming.bundle.body.files.map(row=>({...row})),
    input:{draftBytes:Buffer.byteLength(originalDraftText),draftSha256:await sha256(originalDraftText),
      reviewBytes:Buffer.byteLength(originalReviewText),reviewSha256:await sha256(originalReviewText)},
    files
  };
  full.files.set('source-receiving-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return {files:full.files,manifest,comparison,draft:full.draft,originalRound};
}

export async function reopenCurrentSource({
  manifest, readOutput, originalReviewText, originalDraftText,
  handover, submission, sha256
}) {
  const need=(condition,message)=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  need(await sha256(originalReviewText)===manifest.input.reviewSha256,'Retain the same completed original review input.');
  need(await sha256(originalDraftText)===manifest.input.draftSha256,'Retain the same completed original submission input.');
  for(const file of manifest.files) {
    const text=await readOutput(file.path);
    need(Buffer.byteLength(text)===file.bytes&&await sha256(text)===file.sha256,
      'The received complete output changed: '+file.path);
  }
  const exported=await readOutput('draft.json');
  const draft=await handover.openDraftEnvelope(exported);
  need(draft.id===manifest.draftId&&draft.currentSource===manifest.currentSource,
    'Reopen the selected current source in the original saved draft.');
  const original=JSON.parse(originalDraftText.replace(/^\uFEFF/,''));
  const before=original.schema===submission.ENVELOPE?
    await handover.openDraftEnvelope(originalDraftText):await handover.verifyHandover(original);
  need(same(draft.versions.slice(0,before.versions.length),before.versions),'Retain the original full version prefix.');
  const selected=await handover.reviewerSourceFromDraft(draft,manifest.selectedBundle);
  const source=await handover.openReviewerSourcePackage(await readOutput('source-package.json'));
  need(same(source,selected),'Independently reopened source files differ from the selected saved bundle.');
  for(const key of ['form','fields','reviews','planSources','planningReview','planningTargets','planningUpdate'])
    need(same(draft[key],before[key]),'Independent receiving changed the original '+key+'.');
  const nativeEdition=draft.handover.editions.find(row=>row.id===manifest.preparedEdition);
  need(nativeEdition,'Retain the selected native prepared output.');
  const text=await readOutput('prepared.txt');
  need(text===nativeEdition.body.output.text,'The complete output differs from its original prepared edition.');
  return {draft,exported,source,preparedEdition:nativeEdition.id};
}


// Use the original review lifecycle to select this complete current draft.
export async function receiveCurrentReview({
  operationId, originalReviewText, originalDraft, currentReviewText, draftText,
  sourcePackageSha256, previousReviewEvents, at, actorId, review, sha256,
  onCheckpoint=async()=>{}
}) {
  const need=(condition,message)=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  need(operationId==='SCF-GRANT-CURRENT-REVIEW-81CF-20261012','Continue the original SCF review operation.');
  const baseline=await review.importReviewRound(originalReviewText);
  need(baseline.events.length===previousReviewEvents,'Retain the selected finished review revision.');
  const initial=await review.reviewRoundView(baseline);
  need(same(initial.draft,originalDraft),'The completed review and original saved submission differ.');
  need(initial.participants.some(row=>row.id===actorId),'Use the original receiving participant selected for this continuation.');
  let round=currentReviewText?await review.importReviewRound(currentReviewText):baseline;
  const preserve=()=>{
    need(round.id===baseline.id&&same(round.events.slice(0,baseline.events.length),baseline.events),
      'Retain every completed original review action.');
    need(same(round.editions.slice(0,baseline.editions.length),baseline.editions),
      'Retain every original complete reviewed draft.');
  };
  preserve();
  let view=await review.reviewRoundView(round);
  const capture=await review.readSubmissionExport(draftText,{
    fileName:'Current_Complete_Submission.json',receivedAt:at});
  const originalReviewSha256=await sha256(originalReviewText);
  const requestId=async kind=>'SCF-SOURCE-A8CE-'+await sha256(JSON.stringify({
    operationId,sourcePackageSha256,originalReviewSha256,captureId:capture.id,kind}));
  const selectedBefore=initial.selectedEdition;
  const comparison=await review.compareReviewDraft(baseline,capture);
  const decisions=comparison.decisions.map(row=>({
    decisionId:row.decision.id,choice:row.canCarry?'carry':'reopen',
    note:row.canCarry?
      'The exact target text, source context, issuer prompt and limits remain unchanged in the complete received edition.':
      'The complete source receiving changes this target or its source context. The prior source-specific judgment remains in the original history; review the selected current target.'
  }));
  if(view.selectedEdition!==capture.id) {
    const allowed=new Set([await requestId('reopen'),await requestId('receive')]);
    need(round.events.slice(baseline.events.length).every(event=>allowed.has(event.id)),
      'The saved review advanced beyond this receiving phase. Continue its latest selected draft before changing this source selection.');
    if(view.status==='COMPLETE') {
      const id=await requestId('reopen');
      round=await review.applyReviewAction(round,{
        requestId:id,expectedRevision:round.events.length,actorId,kind:'reopen',at,
        input:{note:'Receive the complete current source package and prepared original submission. Retain the finished '+previousReviewEvents+'-action review and its previous source-specific judgments.'}
      });
      preserve();await onCheckpoint(await review.exportReviewRound(round,{now:at}));
      view=await review.reviewRoundView(round);
    }
    const id=await requestId('receive');
    round=await review.applyReviewAction(round,{
      requestId:id,expectedRevision:round.events.length,actorId,kind:'receive',at,
      input:{editionId:capture.id,fromEdition:view.selectedEdition,
        note:'Receive the complete source package, original authored answers and notes, saved field and plan bindings, and the native prepared submission. Source receiving was composed by A8CE for the original equipped reviewer.',
        decisions}
    },capture);
    preserve();await onCheckpoint(await review.exportReviewRound(round,{now:at}));
    view=await review.reviewRoundView(round);
  }
  need(view.selectedEdition===capture.id&&same(view.draft,JSON.parse(draftText).draft),
    'The current review must select the same complete prepared submission.');
  const exported=await review.exportReviewRound(round,{now:at});
  const report=await review.reviewReport(round);
  return {round,exported,report,view,comparison,
    receiving:{originalReviewSha256,originalReviewEvents:baseline.events.length,
      currentReviewEvents:round.events.length,originalEditions:baseline.editions.length,
      selectedBefore,selectedEdition:capture.id,status:view.status,
      carriedDecisions:decisions.filter(row=>row.choice==='carry').length,
      reopenedDecisions:decisions.filter(row=>row.choice==='reopen').length,
      actionsAdded:round.events.length-baseline.events.length,
      readiness:view.readiness,choices:decisions}};
}

export async function reopenCurrentReview({
  originalReviewText, currentReviewText, originalDraftText, currentDraftText,
  previousReviewEvents, review, handover
}) {
  const need=(condition,message)=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  let baseline=await review.importReviewRound(originalReviewText);
  need(baseline.events.length===previousReviewEvents,'Retain the complete original review input.');
  const history={id:baseline.id,events:baseline.events,editions:baseline.editions};
  baseline=null;if(global.gc)global.gc();
  const round=await review.importReviewRound(currentReviewText);
  need(round.id===history.id&&same(round.events.slice(0,history.events.length),history.events)&&
    same(round.editions.slice(0,history.editions.length),history.editions),
    'Independent receiving changed the original review or its complete draft history.');
  const view=await review.reviewRoundView(round);
  const currentDraft=await handover.openDraftEnvelope(currentDraftText);
  const originalDraft=await handover.openDraftEnvelope(originalDraftText);
  need(currentDraft.id===originalDraft.id&&same(view.draft,currentDraft),
    'Independently open the same original prepared submission and selected review edition.');
  return {round,view,draft:currentDraft,originalEvents:history.events.length};
}


// Receive the original authors' following complete review against its exact source.
export async function applyPreparedCurrentReview({
  round, preparedText, preparedSha256, sourcePackageText, actorId, at,
  submission, handover, review, sha256, onCheckpoint=async()=>{}
}) {
  const need=(condition,message)=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  need(await sha256(preparedText)===preparedSha256,'Retain the complete selected prepared review.');
  const prepared=JSON.parse(preparedText);
  need(prepared.schema==='scf.current-application-review.v1'&&prepared.review_id===round.id&&
    prepared.operation==='SCF-GRANT-CURRENT-REVIEW-81CF-20261012',
    'Select the original authors’ current complete review.');
  const source=await handover.openReviewerSourcePackage(sourcePackageText);
  const roles={application:'application',companion:'product-and-finance',index:'source-index'};
  for(const [name,role] of Object.entries(roles)){
    const selected=prepared.selection[name],file=source.bundle.body.files.find(row=>row.role===role);
    need(file&&selected.bytes===file.bytes&&selected.sha256===file.sha256,
      'The prepared review selects a different complete '+name+'.');
  }
  const originalApplication=prepared.files.find(row=>row.sha256===prepared.selection.application.sha256);
  need(originalApplication&&await sha256(originalApplication.content)===originalApplication.sha256,
    'Retain the complete application read by the original reviewer.');
  const expected=new Map(submission.parseAnswers(originalApplication.content).map(row=>[row.id,row.text]));
  let view=await review.reviewRoundView(round);
  need(view.draft.currentSource===prepared.selection.application.sha256,
    'Review the actual selected current application source.');
  need(view.participants.some(row=>row.id===actorId),'Retain the existing receiving reviewer.');
  const initialEvents=round.events.length,selectedEdition=view.selectedEdition;
  const result={preparedSha256,applicationSha256:prepared.selection.application.sha256,
    selectedEdition,decisions:[],resolutions:[],pending:[],actions:[]};
  const unchanged=id=>view.draft.answers.find(row=>row.id===id)?.text===expected.get(id);
  const changedIds=ids=>ids.filter(id=>!unchanged(id));
  const identify=async(kind,key)=>'SCF-PREPARED-A8CE-'+await sha256(JSON.stringify({
    preparedSha256,selectedEdition,actorId,kind,key
  }));
  async function apply(kind,input,key){
    const requestId=await identify(kind,key);
    const original=round.events.find(event=>event.id===requestId);
    round=await review.applyReviewAction(round,{
      requestId,expectedRevision:original?.expectedRevision??round.events.length,
      actorId,kind,input,at
    });
    await onCheckpoint(await review.exportReviewRound(round,{now:at}));
    view=await review.reviewRoundView(round);result.actions.push(requestId);
  }
  async function open(){
    if(view.status==='COMPLETE')await apply('reopen',{
      note:'Record the original authors’ complete source-specific review for the selected current application, preserving its prior review and all original history.'
    },'current-authored-review');
  }
  for(const item of prepared.decision_notes){
    need(item.applicationSha256===prepared.selection.application.sha256,'Keep each authored decision with its original application.');
    const target=view.targets.find(row=>same(row.target,item.target));
    const ids=item.target.kind==='answer'?[item.target.id]:
      item.target.kind==='requirement'?(view.draft.reviews.find(row=>row.id===item.target.id)?.answers||[]):
      [...expected.keys()];
    const changed=changedIds(ids);
    if(!target||changed.length){result.pending.push({kind:'decision',target:item.target,
      reason:target?'retained-authored-answer-differs':'target-absent',answerIds:changed});continue;}
    const requestId=await identify('review',item.target);
    const current=view.decisions.find(row=>row.actorId===actorId&&same(row.target,item.target));
    const matches=current&&current.bindingSha256===target.bindingSha256&&current.decision===item.decision&&
      current.note===item.note&&same(current.references,item.references||[]);
    if(!matches){
      if(round.events.some(event=>event.id===requestId)){
        result.pending.push({kind:'decision',target:item.target,reason:'a-later-original-review-decision-is-current'});continue;
      }
      await open();
      await apply('review',{editionId:view.selectedEdition,target:item.target,
        bindingSha256:target.bindingSha256,decision:item.decision,note:item.note,
        references:item.references||[]},item.target);
    }
    const actual=view.decisions.find(row=>row.actorId===actorId&&same(row.target,item.target));
    need(actual&&actual.note===item.note&&actual.bindingSha256===target.bindingSha256,
      'Retain the complete authored decision on its exact current target.');
    result.decisions.push({target:item.target,id:actual.id,decision:actual.decision,
      bindingSha256:actual.bindingSha256,noteSha256:await sha256(actual.note),
      referencesSha256:await sha256(JSON.stringify(actual.references)),reused:!!matches});
  }
  for(const item of prepared.request_resolutions){
    need(item.applicationSha256===prepared.selection.application.sha256,'Keep each prepared resolution with its original source.');
    const matches=view.changes.filter(row=>row.id.endsWith(':'+item.request_suffix));
    const changed=changedIds(item.answer_ids);
    const selectedText=item.answer_ids.map(id=>view.draft.answers.find(row=>row.id===id)?.text||'').join('\n\n');
    const missing=item.excerpts.filter(text=>!selectedText.includes(text));
    if(matches.length!==1||changed.length||missing.length){
      result.pending.push({kind:'resolution',requestSuffix:item.request_suffix,
        reason:matches.length!==1?'original-request-not-unique':changed.length?'retained-authored-answer-differs':'current-excerpt-differs',
        answerIds:changed,missingExcerpts:missing});continue;
    }
    const change=matches[0],note=item.resolution;
    const current=change.resolutions.at(-1);
    const reused=change.status==='resolved'&&current?.note===note&&current.editionId===selectedEdition;
    if(!reused){
      const key=await identify('resolve',change.id);
      if(round.events.some(event=>event.id===key)){
        result.pending.push({kind:'resolution',changeId:change.id,reason:'a-later-original-resolution-is-current'});continue;
      }
      await open();await apply('resolve',{changeId:change.id,editionId:view.selectedEdition,
        status:'resolved',note},change.id);
    }
    const actual=view.changes.find(row=>row.id===change.id);
    need(actual.status==='resolved'&&actual.resolutions.at(-1)?.note===note,
      'Retain the current authored resolution in the original request.');
    result.resolutions.push({changeId:change.id,id:actual.resolutions.at(-1).id,
      noteSha256:await sha256(note),reused});
  }
  if(!view.readiness.length&&!result.pending.length&&view.status!=='COMPLETE'){
    await apply('finish',{editionId:view.selectedEdition,outcome:'ready-for-author-check',
      note:'The selected complete source package, all current original targets and the five original technical requests have the original authors’ source-specific review. Complete source, authored history, field and planning bindings, original review events and prepared outputs remain in the same customer case.'
    },'current-authored-review');
  }
  result.actionsAdded=round.events.length-initialEvents;result.reviewActions=round.events.length;
  result.reviewStatus=view.status;result.readiness=view.readiness;
  return {round,view,exported:await review.exportReviewRound(round,{now:at}),
    report:await review.reviewReport(round),preparedReview:result};
}
