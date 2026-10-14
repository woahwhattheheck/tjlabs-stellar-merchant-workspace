// MIT. Original supplied-client receiving chapter for complete row accounting.
// The caller retains Console/process ownership and immutable action/result files.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {readJson,retainedJson,ordinary} from '../../awards-import-session-cli.mjs';
import {prepareAwardCsvRowReview,verifyAwardCsvRowReview,encodeAwardCsvRowReview} from '../../awards-import-row-review.mjs';
import {prepareAwardCsvImportSession,proposeAwardCsvImportBatches,reviewAwardCsvSessionBatch,
  submitAwardCsvSessionBatch,inspectAwardCsvImportSession} from '../../awards-import-session.mjs';
import {saveGrantPortfolioFile} from '../../client.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>assert.deepEqual(a,b);
const optional=async path=>{try{return await readJson(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const row=(collection,id,fields)=>({collection,id,expectedRevision:0,fields});
export async function runAwardRowReviewReceiving({source,recipient,out,actor,run,action,downloadExport,compareHistory,file,fileIdentity,launch}){
  await readJson(join(out,'complete.json')); // The same original capacity course has completed.
  const prefix='row-review-',path=name=>join(out,prefix+name);
  let ids=await optional(path('selection.json'));
  if(!ids){
    ids={schema:'stellar-forge.awards-row-review-receiving-selection.v1',run,actor,
      programme:randomUUID(),partner:randomUUID(),round:randomUUID(),review:randomUUID(),reviewDocument:randomUUID(),
      session:randomUUID(),documents:[randomUUID(),randomUUID()],applications:Array.from({length:6},()=>randomUUID()),
      excludedReview:randomUUID(),excludedReviewDocument:randomUUID(),excludedSession:randomUUID(),excludedDocument:randomUUID()};
    await retainedJson(path('selection.json'),ids);
  }
  assert.equal(ids.run,run);assert.equal(ids.actor,actor);
  const sourceState=await source.state(),recipientState=await recipient.state();
  assert.notEqual(sourceState.workspaceId,recipientState.workspaceId);
  let completed=await optional(path('complete.json'));
  if(completed){
    same(await source.portfolio(completed.portfolio.id),completed.portfolio);
    same(await recipient.portfolio(completed.portfolio.id),completed.portfolio);
    return completed;
  }
  const initial=await action(source,prefix+'programme','portfolio.save',async()=>({
    name:'Internal original-row review receiving',notes:'Authored software receiving example; no customer application or funding decision.',
    sources:[],review:{status:'draft',reviewer:actor,note:'Complete source-row disposition exercise.'},
    programme:{schema:'stellar-forge.grant-programme.v1',actor,expectedProgrammeRevision:0,
      settings:{asOf:'2026-10-14',riskScaleMaximum:5,highRiskScore:15},changes:[
        row('nodes',ids.programme,{kind:'portfolio',code:'ROW-REVIEW',title:'Original-row review programme',owner:actor}),
        row('partners',ids.partner,{code:'INTERNAL',name:'Fictional original applicant',roles:['internal-acceptance-fixture']})]}}));
  const round=await action(source,prefix+'round','portfolio.save',async()=>{
    const current=await source.portfolio(initial.result.id),{name,notes,sources,review}=current.definition;
    return {id:current.id,expectedPortfolioRevision:current.revision,name,notes,sources,review,
      awards:{schema:'stellar-forge.grant-awards.v1',actor,expectedAwardsRevision:0,changes:[
        row('rounds',ids.round,{code:'ROW-REVIEW',title:'Explicit source-row receiving',programmeNodeId:ids.programme,owner:actor,
          opensDate:'2026-10-14',closesDate:'2026-10-14',status:'published',scoringMethod:'none',process:'Internal receiving only.',
          criteria:[{id:'evidence',title:'Original explanation',kind:'eligibility',required:true}]})]}};
  });
  const basis=round.result,headers=['Reference','Title','Legal name','Partner','Amount','Currency','Answer','Unmapped'],
    sourceRows=[
      ['REF-A','Application A','Fictional original applicant','INTERNAL','9007199254740993.0100','GBP','Original café\r\nsecond line','007'],
      ['','Application B','Fictional original applicant','INTERNAL','2.00','GBP','Original missing-reference answer','=literal'],
      ['DUP','Application C','Fictional original applicant','UNMATCHED','3.50','GBP','Original duplicate answer','unchanged'],
      ['DUP','Duplicate supplier row','Fictional original applicant','INTERNAL','3.50','GBP','Duplicate retained in full','duplicate'],
      ['BAD','Invalid amount row','Fictional original applicant','INTERNAL','not-a-decimal','GBP','Needs supplied correction','bad amount'],
      ['TOTAL','Summary row','','','','','Supplier footer is not an application','retain footer']];
  const cell=value=>'"'+value.replace(/"/g,'""')+'"',csv=Buffer.from('\ufeff'+[headers,...sourceRows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n','utf8');
  const original=await file(path('original.csv'),csv);
  const mapping={reference:'Reference',title:'Title',legalName:'Legal name',partnerKey:'Partner',amount:'Amount',currency:'Currency',answers:{evidence:'Answer'}},
    identities={applications:{},partners:{INTERNAL:ids.partner}},decisions=[
      {rowIndex:0,disposition:'accepted',reason:'Reviewed complete original application.',applicationId:ids.applications[0],corrections:{}},
      {rowIndex:1,disposition:'accepted',reason:'Explicit supplied reference correction.',applicationId:ids.applications[1],corrections:{Reference:'REF-B'}},
      {rowIndex:2,disposition:'accepted',reason:'Retain this duplicate occurrence with explicit partner correction.',applicationId:ids.applications[2],corrections:{Partner:'INTERNAL'}},
      {rowIndex:3,disposition:'exception',reason:'Duplicate occurrence retained for supplier review.',corrections:{}},
      {rowIndex:4,disposition:'exception',reason:'Original amount is not a decimal; no invented replacement.',corrections:{}},
      {rowIndex:5,disposition:'non_application',reason:'Reviewed supplier summary/footer, agreed outside the application set.',corrections:{}}];
  let review=await optional(path('review.json'));
  if(!review){review=prepareAwardCsvRowReview(basis,{reviewId:ids.review,filename:'original-row-review.csv',roundId:ids.round,actor,status:'draft',
    csv,mapping,identities,decisions});await retainedJson(path('review.json'),review);}
  verifyAwardCsvRowReview(basis,review,csv);same(review.counts,{total:6,accepted:3,exception:2,non_application:1});
  const reviewBytes=encodeAwardCsvRowReview(review),reviewFile=await file(path('sealed-review.json'),reviewBytes);
  const common={csv,filename:review.source.filename,roundId:ids.round,actor,status:'draft',mapping,identities,rowReview:review,reviewDocumentId:ids.reviewDocument};
  let session=await optional(path('session.json'));
  if(!session){
    const batches=proposeAwardCsvImportBatches(basis,common,{operationPrefix:'csv-row-review-'+run,documentIds:ids.documents,maxRows:2});
    same(batches.map(r=>r.rowIndexes),[[0,1],[2]]);
    session=prepareAwardCsvImportSession(basis,{...common,sessionId:ids.session,workspaceId:sourceState.workspaceId,batches});
    await retainedJson(path('session.json'),session);
  }
  for(let index=0;index<session.batches.length;index++){
    if(index===1){
      const checkpoint=await optional(path('before-last.json'));
      if(!checkpoint){
        await retainedJson(path('before-last.json'),{launch:await launch(source),sessionSha256:session.sha256,state:await source.state()});
        return {phase:'row-review',state:'AWAITING_COLD_REOPEN',instructions:'Cold reopen the same source Console and repeat the original row-review phase.'};
      }
      if(!await optional(path('before-last-reopened.json'))){
        const now=await launch(source);assert.notEqual(now.pid,checkpoint.launch.pid);
        assert.equal(now.workspaceId,checkpoint.launch.workspaceId);assert.equal(checkpoint.sessionSha256,session.sha256);
        assert.equal((await source.state()).revision,checkpoint.state.revision);
        await retainedJson(path('before-last-reopened.json'),{before:checkpoint.launch,after:now});
      }
    }
    let batch=await optional(path('batch-'+index+'.json'));
    if(!batch){({batch}=await reviewAwardCsvSessionBatch(source,session,csv,index));await retainedJson(path('batch-'+index+'.json'),batch);}
    let result=await submitAwardCsvSessionBatch(source,session,batch,csv);
    if(result.state==='RUNNING')result=await source.wait(result.id,{timeoutMs:900000,pollMs:500});
    assert.equal(result.state,'COMPLETED',JSON.stringify(result.error));
    const revision=(await source.state()).revision;
    same(await submitAwardCsvSessionBatch(source,session,batch,csv),result);
    assert.equal((await source.state()).revision,revision);
    await retainedJson(path('batch-'+index+'.complete.json'),result);
  }
  const observation=await inspectAwardCsvImportSession(source,session,csv);
  assert.equal(observation.state,'COMPLETE');assert.equal(observation.completedRows,3);same(observation.rowReview.counts,review.counts);
  const accepted=await source.portfolio(basis.id),applications=accepted.definition.awards.records.applications;
  assert.equal(applications.length,3);same(applications.map(r=>r.id).sort(),ids.applications.slice(0,3).sort());
  assert.equal(applications.find(r=>r.id===ids.applications[1]).reference,'REF-B');
  assert.equal(applications.find(r=>r.id===ids.applications[2]).partnerId,ids.partner);
  assert.equal(applications.find(r=>r.id===ids.applications[0]).requestedAmount.value,'9007199254740993.0100');
  for(const application of applications)assert(application.evidenceIds.includes(ids.reviewDocument));
  // A complete all-excluded successor is a native evidence-only action.
  let excludedSession=await optional(path('excluded-session.json'));
  if(!excludedSession){
    const excluded=prepareAwardCsvRowReview(accepted,{reviewId:ids.excludedReview,filename:review.source.filename,roundId:ids.round,actor,
      status:'draft',csv,mapping,identities,previousReviewSha256:review.sha256,
      decisions:decisions.map(r=>({rowIndex:r.rowIndex,disposition:r.disposition==='non_application'?'non_application':'exception',
        reason:r.disposition==='non_application'?r.reason:'Retained source-only disposition after the original accepted edition.',corrections:r.corrections}))});
    await retainedJson(path('excluded-review.json'),excluded);
    const input={...common,rowReview:excluded,reviewDocumentId:ids.excludedReviewDocument};
    const batches=proposeAwardCsvImportBatches(accepted,input,{operationPrefix:'csv-row-excluded-'+run,documentIds:[ids.excludedDocument]});
    same(batches.map(r=>r.rowIndexes),[[]]);
    excludedSession=prepareAwardCsvImportSession(accepted,{...input,sessionId:ids.excludedSession,workspaceId:sourceState.workspaceId,batches});
    await retainedJson(path('excluded-session.json'),excludedSession);
  }
  let excludedBatch=await optional(path('excluded-batch.json'));
  if(!excludedBatch){({batch:excludedBatch}=await reviewAwardCsvSessionBatch(source,excludedSession,csv,0));await retainedJson(path('excluded-batch.json'),excludedBatch);}
  assert(!Object.hasOwn(excludedBatch.plan.action.payload,'awards'));
  let excludedResult=await submitAwardCsvSessionBatch(source,excludedSession,excludedBatch,csv);
  if(excludedResult.state==='RUNNING')excludedResult=await source.wait(excludedResult.id,{timeoutMs:900000,pollMs:500});
  assert.equal(excludedResult.state,'COMPLETED');await retainedJson(path('excluded-complete.json'),excludedResult);
  const final=await source.portfolio(basis.id);same(final.definition.awards,accepted.definition.awards);
  const allEvidence=[[ids.reviewDocument,reviewBytes,'review'],...session.batches.map(b=>[b.documentId,csv,'source-'+b.index]),
    [ids.excludedReviewDocument,encodeAwardCsvRowReview(excludedSession.input.rowReview),'excluded-review'],[ids.excludedDocument,csv,'excluded-source']];
  for(const client of [source]){
    for(const [id,expected,name]of allEvidence){
      const opened=await client.openProgrammeDocument({portfolioId:final.id,revision:final.revision,id}),destination=path(name+'.native');
      await saveGrantPortfolioFile(opened,destination);assert.equal((await fileIdentity(destination,64*1024*1024)).sha256,hash(expected));
    }
  }
  const archive=await downloadExport(source,prefix+'export',final),upload=await recipient.uploadFile(archive.path,{sha256:archive.sha256});
  await action(recipient,prefix+'receive','portfolio.receive',async()=>({object:upload.sha256}));
  const revisions=await compareHistory(source,recipient,final);
  for(const [id,expected,name]of allEvidence){
    const opened=await recipient.openProgrammeDocument({portfolioId:final.id,revision:final.revision,id}),destination=path('received-'+name+'.native');
    await saveGrantPortfolioFile(opened,destination);assert.equal((await fileIdentity(destination,64*1024*1024)).sha256,hash(expected));
  }
  const cold=await optional(path('before-final-cold.json'));
  if(!cold){
    await retainedJson(path('before-final-cold.json'),{source:await launch(source),recipient:await launch(recipient),snapshot:final.snapshot});
    return {phase:'row-review',state:'AWAITING_FINAL_COLD_REOPEN',instructions:'Cold reopen both original Consoles and repeat this same row-review phase.'};
  }
  const sourceLaunch=await launch(source),recipientLaunch=await launch(recipient);
  assert.notEqual(sourceLaunch.pid,cold.source.pid);assert.notEqual(recipientLaunch.pid,cold.recipient.pid);
  assert.equal(sourceLaunch.workspaceId,cold.source.workspaceId);assert.equal(recipientLaunch.workspaceId,cold.recipient.workspaceId);
  same(await source.portfolio(final.id),final);same(await recipient.portfolio(final.id),final);
  completed={schema:'stellar-forge.awards-row-review-receiving.v1',phase:'row-review',state:'COMPLETE',run,portfolio:final,
    original,reviewFile,sessionSha256:session.sha256,counts:review.counts,observation,archive,revisions,sourceLaunch,recipientLaunch};
  await retainedJson(path('complete.json'),completed);return completed;
}
