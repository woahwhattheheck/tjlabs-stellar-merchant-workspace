// MIT. Following chapter of the original supplied-client Grant receiving course.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {readJson,retainedJson,ordinary} from '../../awards-import-session-cli.mjs';
import {prepareAwardCsvRowReview,encodeAwardCsvRowReview} from '../../awards-import-row-review.mjs';
import {encodeAwardCsvContinuation} from '../../awards-import-continuation.mjs';
import {prepareAwardCsvImportSession,proposeAwardCsvImportBatches,reviewAwardCsvSessionBatch,
 submitAwardCsvSessionBatch,inspectAwardCsvImportSession,readAwardCsvImportContinuation} from '../../awards-import-session.mjs';
import {saveGrantPortfolioFile} from '../../client.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>assert.deepEqual(a,b);
const optional=async p=>{try{return await readJson(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const created=(collection,id,fields)=>({collection,id,expectedRevision:0,fields});
export async function runAwardRowContinuationReceiving({source,recipient,out,actor,run,action,downloadExport,compareHistory,file,fileIdentity,launch}){
 await readJson(join(out,'row-review-complete.json'));
 const prefix='row-continuation-',path=name=>join(out,prefix+name);
 let ids=await optional(path('selection.json'));
 if(!ids){
  ids={schema:'stellar-forge.awards-row-continuation-selection.v1',run,actor,programme:randomUUID(),partner:randomUUID(),round:randomUUID(),
   applications:Array.from({length:3},()=>randomUUID()),reviews:Array.from({length:3},()=>randomUUID()),reviewDocuments:Array.from({length:3},()=>randomUUID()),
   sessions:Array.from({length:3},()=>randomUUID()),documents:Array.from({length:3},()=>randomUUID()),continuationDocuments:Array.from({length:2},()=>randomUUID())};
  await retainedJson(path('selection.json'),ids);
 }
 assert.equal(ids.run,run);assert.equal(ids.actor,actor);
 const sourceState=await source.state(),recipientState=await recipient.state();assert.notEqual(sourceState.workspaceId,recipientState.workspaceId);
 const completed=await optional(path('complete.json'));
 if(completed){same(await source.portfolio(completed.portfolio.id),completed.portfolio);same(await recipient.portfolio(completed.portfolio.id),completed.portfolio);return completed;}
 const initial=await action(source,prefix+'programme','portfolio.save',async()=>({
  name:'Internal completed-row continuation',notes:'Authored software example; no customer application, payment or funding decision.',
  sources:[],review:{status:'draft',reviewer:actor,note:'Complete original accepted outcomes and subsequent exception resolution.'},
  programme:{schema:'stellar-forge.grant-programme.v1',actor,expectedProgrammeRevision:0,settings:{asOf:'2026-10-14',riskScaleMaximum:5,highRiskScore:15},
   changes:[created('nodes',ids.programme,{kind:'portfolio',code:'ROW-CONTINUE',title:'Original continuation programme',owner:actor}),
    created('partners',ids.partner,{code:'INTERNAL',name:'Fictional original applicant',roles:['internal-acceptance-fixture']})]}}));
 const published=await action(source,prefix+'round','portfolio.save',async()=>{
  const current=await source.portfolio(initial.result.id),{name,notes,sources,review}=current.definition;
  return {id:current.id,expectedPortfolioRevision:current.revision,name,notes,sources,review,
   awards:{schema:'stellar-forge.grant-awards.v1',actor,expectedAwardsRevision:0,changes:[
    created('rounds',ids.round,{code:'CONTINUE',title:'Original accepted rows and exceptions',programmeNodeId:ids.programme,owner:actor,
     opensDate:'2026-10-14',closesDate:'2026-10-14',status:'published',scoringMethod:'none',process:'Internal software receiving.',
     criteria:[{id:'evidence',title:'Original explanation',kind:'eligibility',required:true}]})]}};
 });
 const headers=['Reference','Title','Legal name','Partner','Amount','Currency','Date','Answer','Unmapped'],rows=[
 ['A','First application','Fictional original applicant','INTERNAL','9007199254740993.0100','GBP','2026-10-14','Original café\r\nsecond line','007'],
 ['B','Amount exception','Fictional original applicant','INTERNAL','bad amount','GBP','2026-10-14','Confirmed later','=literal'],
 ['TOTAL','Supplier footer','','','','','','Unchanged non-application'],
 ['C','Eligibility exception','Fictional original applicant','INTERNAL','31.50','GBP','2026-10-14','Confirmed later','003']];
 const cell=v=>'"'+v.replace(/"/g,'""')+'"',csv=Buffer.from('\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n');
 const original=await file(path('original.csv'),csv);
 const mapping={reference:'Reference',title:'Title',legalName:'Legal name',partnerKey:'Partner',amount:'Amount',currency:'Currency',
  submittedDate:'Date',answers:{evidence:'Answer'}},identities={applications:{A:ids.applications[0],B:ids.applications[1],C:ids.applications[2]},partners:{INTERNAL:ids.partner}};
 const decisions=[
 {rowIndex:0,disposition:'accepted',reason:'Original reviewed application.',applicationId:ids.applications[0],corrections:{}},
 {rowIndex:1,disposition:'exception',reason:'Await original amount confirmation.',corrections:{}},
 {rowIndex:2,disposition:'non_application',reason:'Agreed supplier footer.',corrections:{}},
 {rowIndex:3,disposition:'exception',reason:'Await eligibility confirmation.',corrections:{}}];
 const evidence=[],sessions=[],returns=[];
 let prior=null,withdrawn=null;
 for(let generation=0;generation<3;generation++){
  let session=await optional(path('session-'+generation+'.json')),continuation=null;
  if(generation){
   const retained=await optional(path('continuation-'+generation+'.json'));
   continuation=(await readAwardCsvImportContinuation(source,prior,csv)).continuation;
   if(retained)same(continuation,retained);else await retainedJson(path('continuation-'+generation+'.json'),continuation);
  }
  if(!session){
   const basis=generation?await source.portfolio(initial.result.id):published.result;
   const reviewed=JSON.parse(JSON.stringify(decisions));
   if(generation>=1)reviewed[1]={rowIndex:1,disposition:'accepted',reason:'Supplier explicitly confirmed 120.01.',applicationId:ids.applications[1],corrections:{Amount:'120.01'}};
   if(generation>=2)reviewed[3]={rowIndex:3,disposition:'accepted',reason:'Eligibility explicitly confirmed.',applicationId:ids.applications[2],corrections:{}};
   const review=prepareAwardCsvRowReview(basis,{reviewId:ids.reviews[generation],filename:'original-continuation.csv',roundId:ids.round,actor,status:'submitted',
    csv,mapping,identities,decisions:reviewed,...(prior?{previousReviewSha256:prior.input.rowReview.sha256}:{})});
   const common={csv,filename:review.source.filename,roundId:ids.round,actor,status:'submitted',mapping,identities,rowReview:review,reviewDocumentId:ids.reviewDocuments[generation],
    ...(continuation?{continuation,continuationDocumentId:ids.continuationDocuments[generation-1]}:{})};
   const batches=proposeAwardCsvImportBatches(basis,common,{operationPrefix:'csv-continuation-'+run+'-'+generation,documentIds:[ids.documents[generation]],maxRows:1000});
   same(batches.map(b=>b.rowIndexes),[[[0],[1],[3]][generation]]);
   session=prepareAwardCsvImportSession(basis,{...common,sessionId:ids.sessions[generation],workspaceId:sourceState.workspaceId,batches});
   await retainedJson(path('session-'+generation+'.json'),session);
  }
  let batch=await optional(path('batch-'+generation+'.json'));
  if(!batch){({batch}=await reviewAwardCsvSessionBatch(source,session,csv,0));await retainedJson(path('batch-'+generation+'.json'),batch);}
  same(batch.plan.rowIndexes,[[0],[1],[3]][generation]);assert.equal(batch.plan.rows,1);
  let result=await submitAwardCsvSessionBatch(source,session,batch,csv);
  if(result.state==='RUNNING')result=await source.wait(result.id,{timeoutMs:900000,pollMs:500});
  assert.equal(result.state,'COMPLETED',JSON.stringify(result.error));
  const revision=(await source.state()).revision;same(await submitAwardCsvSessionBatch(source,session,batch,csv),result);assert.equal((await source.state()).revision,revision);
  await retainedJson(path('result-'+generation+'.json'),result);
  evidence.push([session.input.reviewDocumentId,encodeAwardCsvRowReview(session.input.rowReview),'review-'+generation],
   [session.batches[0].documentId,csv,'source-'+generation]);
  if(continuation)evidence.push([session.input.continuationDocumentId,encodeAwardCsvContinuation(continuation),'continuation-'+generation]);
  sessions.push(session);returns.push(result);prior=session;
  if(generation===0){
   const changed=await action(source,prefix+'withdraw-original','portfolio.save',async()=>{
    const current=await source.portfolio(initial.result.id),application=current.definition.awards.records.applications.find(a=>a.id===ids.applications[0]),
     {name,notes,sources,review}=current.definition;
    return {id:current.id,expectedPortfolioRevision:current.revision,name,notes,sources,review,
     awards:{schema:'stellar-forge.grant-awards.v1',actor,expectedAwardsRevision:current.definition.awards.revision,
      changes:[{collection:'applications',id:application.id,expectedRevision:application.revision,fields:{status:'withdrawn'}}]}};
   });
   withdrawn=changed.result.definition.awards.records.applications.find(a=>a.id===ids.applications[0]);
   await retainedJson(path('original-withdrawn.json'),withdrawn);
  }else same((await source.portfolio(initial.result.id)).definition.awards.records.applications.find(a=>a.id===ids.applications[0]),withdrawn);
 }
 const final=await source.portfolio(initial.result.id),observation=await inspectAwardCsvImportSession(source,prior,csv);
 assert.equal(observation.state,'COMPLETE');assert.equal(observation.carriedRows,2);assert.equal(observation.completedRows,1);assert.equal(observation.recordedRows,3);
 assert.equal(final.definition.awards.records.applications.length,3);
 assert.equal(final.definition.awards.records.applications.find(a=>a.id===ids.applications[1]).requestedAmount.value,'120.01');
 const archive=await downloadExport(source,prefix+'export',final),upload=await recipient.uploadFile(archive.path,{sha256:archive.sha256});
 await action(recipient,prefix+'receive','portfolio.receive',async()=>({object:upload.sha256}));
 const revisions=await compareHistory(source,recipient,final);
 for(const [client,label]of [[source,'source'],[recipient,'recipient']])for(const [id,bytes,name]of evidence){
  const opened=await client.openProgrammeDocument({portfolioId:final.id,revision:final.revision,id}),destination=path(label+'-'+name+'.native');
  await saveGrantPortfolioFile(opened,destination);assert.equal((await fileIdentity(destination,64*1024*1024)).sha256,hash(bytes));
 }
 const beforeCold=await optional(path('before-cold.json'));
 if(!beforeCold){await retainedJson(path('before-cold.json'),{source:await launch(source),recipient:await launch(recipient),snapshot:final.snapshot});
  return {phase:'row-continuation',state:'AWAITING_COLD_REOPEN',instructions:'Cold reopen both original Consoles, then repeat this same row-continuation phase and retained directory.'};}
 const sourceLaunch=await launch(source),recipientLaunch=await launch(recipient);
 assert.notEqual(sourceLaunch.pid,beforeCold.source.pid);assert.notEqual(recipientLaunch.pid,beforeCold.recipient.pid);
 assert.equal(sourceLaunch.workspaceId,beforeCold.source.workspaceId);assert.equal(recipientLaunch.workspaceId,beforeCold.recipient.workspaceId);
 same(await source.portfolio(final.id),final);same(await recipient.portfolio(final.id),final);
 const complete={schema:'stellar-forge.awards-row-continuation-receiving.v1',phase:'row-continuation',state:'COMPLETE',run,portfolio:final,
  original,archive,revisions,observation,sourceLaunch,recipientLaunch,sessions:sessions.map(s=>({id:s.sessionId,sha256:s.sha256})),
  requests:returns.map(r=>({id:r.id,inputSha256:r.inputSha256})),preservedWithdrawal:withdrawn};
 await retainedJson(path('complete.json'),complete);return complete;
}

/** Operate the existing authenticated Awards page; this function starts no browser or Console.
 * The supplied immutable download callback retains each complete file before further use.
 * By default this prepares only; saveReviewed explicitly operates the original Save button.
 */
export async function runAwardCsvContinuationBrowser({page,csvPath,sessionPath,rowIndex,header,value,reason,
 retainDownload,captureViews,reopenPage,readOriginal,saveReviewed=false}){
 const files=[],images=[],dialog=page.locator('#detail-dialog');
 const ready=async()=>{await page.waitForFunction(()=>{const d=document.querySelector('#detail-dialog'),b=d?.querySelector('#intake-working-save');return Boolean(d?.open&&b&&!b.disabled);});
  const errors=await dialog.locator('[role=alert]').allTextContents();assert(!errors.some(s=>s.trim()),errors.join(' / '));};
 const keep=async(label,trigger)=>{
  const result=await retainDownload(trigger,label),file=result.file??result,bytes=await ordinary(file.path,512*1024*1024);
  assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);files.push(file);return {file,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
 };
 await page.getByRole('button',{name:'Import application CSV',exact:true}).click();
 await dialog.getByLabel('Original application CSV',{exact:true}).setInputFiles(csvPath);await ready();
 await dialog.getByLabel('Saved import plan',{exact:true}).setInputFiles(sessionPath);
 await dialog.getByRole('button',{name:'Review original saved import',exact:true}).click();await ready();
 await dialog.getByRole('button',{name:'Resolve remaining original rows',exact:true}).click();await ready();
 await dialog.getByLabel('Row disposition',{exact:true}).selectOption('all');
 await dialog.getByRole('button',{name:'Inspect original row '+(rowIndex+1),exact:true}).click();
 await dialog.getByLabel('Correct '+header+' in row '+(rowIndex+1),{exact:true}).check();
 await dialog.getByLabel('Working '+header+' in row '+(rowIndex+1),{exact:true}).fill(value);
 await dialog.getByLabel('Reason / agreement for row '+(rowIndex+1),{exact:true}).fill(reason);
 await dialog.getByLabel('Disposition for row '+(rowIndex+1),{exact:true}).selectOption('accepted');
 const unfinished=await keep('continuation-unfinished-working',()=>dialog.locator('#intake-working-download').click());
 assert.equal(unfinished.value.record.work.rowDecisions[rowIndex].corrections[header],value);
 if(reopenPage){
  await reopenPage();await page.getByRole('button',{name:'Import application CSV',exact:true}).click();await ready();
  await dialog.locator('#intake-working-open').setInputFiles(unfinished.file.path);await ready();
  await dialog.locator('#intake-library-restore').click();await ready();
  assert.equal(await dialog.getByLabel('Working '+header+' in row '+(rowIndex+1),{exact:true}).inputValue(),value);
  assert.equal(await dialog.getByLabel('Reason / agreement for row '+(rowIndex+1),{exact:true}).inputValue(),reason);
 }
 await dialog.getByRole('button',{name:'Match accepted programme records',exact:true}).click();await ready();
 await dialog.getByRole('button',{name:'Prepare reviewed batches',exact:true}).click();await ready();
 await dialog.getByRole('button',{name:'Review batch 1',exact:true}).click();await ready();
 const retained=await keep('continuation-reviewed-session',()=>dialog.getByRole('button',{name:'Download complete session and reviewed batch',exact:true}).click());
 assert(retained.value?.session,'Keep the complete retained session.');
 const session=retained.value.session,batch=retained.value.reviewedBatch;
 assert.equal(session.schema,'stellar-forge.awards-csv-import-session.v3');same(batch.plan.rowIndexes,[rowIndex]);
 assert.equal(batch.plan.rows,1);assert(session.input.continuation);
 images.push(...await captureViews('continuation-reviewed-desktop-narrow'));
 let request=null;
 if(saveReviewed){
  assert.equal(typeof readOriginal,'function','Use the original native request reader for saved outcomes.');
  await dialog.getByRole('button',{name:'Save reviewed batch',exact:true}).click();await ready();
  request=await readOriginal(batch.plan.action.operationId);assert.equal(request.state,'COMPLETED');same(request.input,batch.plan.action);
 }
 await keep('continuation-current-working',()=>dialog.locator('#intake-working-download').click());
 if(reopenPage){
  await reopenPage();await page.getByRole('button',{name:'Import application CSV',exact:true}).click();
  await dialog.getByLabel('Original application CSV',{exact:true}).setInputFiles(csvPath);await ready();
  await dialog.getByLabel('Saved import plan',{exact:true}).setInputFiles((retained.file??retained).path);
  await dialog.getByRole('button',{name:'Review original saved import',exact:true}).click();await ready();
  await dialog.getByRole('button',{name:'Inspect original operations',exact:true}).click();await ready();
  images.push(...await captureViews('continuation-cold-reopen-desktop-narrow'));
 }
 return {schema:'stellar-forge.awards-row-continuation-browser.v1',sessionId:session.sessionId,sessionSha256:session.sha256,
  originalRowIndex:rowIndex,operationId:batch.plan.action.operationId,request,files,images};
}
