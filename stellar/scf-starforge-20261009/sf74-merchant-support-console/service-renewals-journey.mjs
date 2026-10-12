// One source-native renewal journey. Run only against a fresh isolated CaseStore.
import assert from 'node:assert/strict';
import {randomUUID,createHash,webcrypto} from 'node:crypto';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openCaseStore} from './case-store.mjs';
import {openCaseServiceRenewals} from './case-service-renewals.mjs';
import {openCaseCommercial,commercialWorkspaceId} from './case-commercial.mjs';
import {emptyCommercialDraft,commercialContext} from './commercial-quote.mjs';
import {parseWorkspace,serializeWorkspace} from './workspace-file.mjs';
import {changeServiceCase} from './service-cases.mjs';
import {validateServiceRenewalHandover} from './service-renewals.mjs';
import {serviceSha256} from './service-commitments.mjs';
import {createConsoleServer} from './server.mjs';
globalThis.crypto??=webcrypto;
const digest=value=>createHash('sha256').update(value).digest('hex');
const termsFields=['title','customer','owner','reference','status','incidentSourceId','merchantId',
  'merchantBinding','effectiveFrom','effectiveUntil','calendar','targets','reviewedBy','note'];
const termsForm=terms=>({id:terms.id,expectedRevision:terms.revision,
  ...Object.fromEntries(termsFields.map(key=>[key,structuredClone(terms[key])]))});

export async function runServiceRenewalsExercise({caseStore,caseId,workspaceId}){
  const actor='Renewal native exercise',commercialDesk=openCaseCommercial({store:caseStore,workspaceId});
  const desk=()=>openCaseServiceRenewals({caseStore,commercialDesk,workspaceId});
  let renewals=desk();
  const head=()=>caseStore.read(caseId);
  const revision=async()=>(await head()).revision;
  const unchangedAfter=async(fn,code)=>{
    const before=await revision();
    await assert.rejects(fn,error=>error.code===code);
    assert.equal(await revision(),before,'Rejected operation must preserve the saved case head');
  };
  const changeTerms=async input=>changeServiceCase({store:caseStore,args:{
    id:caseId,expectedRevision:await revision(),requestId:randomUUID(),action:'terms',input}});
  const propose=async(source,title)=>{
    const requestId=randomUUID(),input={
      id:randomUUID(),requestId,expectedRevision:null,termsId:source.id,
      expectedTermsRevision:source.revision,expectedTermsSha256:source.sha256,
      continuation:{title,effectiveUntil:'2027-02-01T00:00:00.000Z'},
      noticeDays:30,actor,note:'Retain original operational service for renewal review.'
    };
    const expectedRevision=await revision();
    const preview=await renewals.preview({id:caseId,expectedRevision,input});
    assert.equal(preview.continuity,'continuous');
    const args={id:caseId,expectedRevision,requestId,input:{...input,expectedPreviewSha256:preview.previewSha256}};
    return {args,preview};
  };
  const quoteAndAttach=async renewal=>{
    const draft=emptyCommercialDraft();
    Object.assign(draft,{title:'Quarterly operational service continuation',
      customer:{name:'Native Journey Merchant',contact:'fixture@example.invalid'},
      serviceSourceId:renewal.continuationTerms.id+':'+renewal.continuationTerms.revision,
      validThrough:'2026-10-31'});
    draft.service.lines=[{id:'operational-service',commitmentId:renewal.continuationTerms.id,
      title:'Operational service continuation',quantity:'1',unitUsd:'125'}];
    draft.terms={scope:'Continue the selected original merchant service agreement.',
      deliverables:'Retain incident response ownership and the quoted service targets.',
      exclusions:'Changes to the merchant registration require a separate agreement.',
      payment:'USD 125 each month for the quoted continuation period.',
      acceptance:'Record the customer response against this exact quotation.'};
    const expectedRevision=await revision();
    const preview=await commercialDesk.preview({id:caseId,expectedRevision,draft});
    const published=await commercialDesk.publish({id:caseId,expectedRevision,requestId:randomUUID(),
      actor,draft,reviewSha256:preview.review.reviewSha256,parentId:null});
    const args={id:caseId,expectedRevision:await revision(),requestId:randomUUID(),input:{
      id:renewal.id,expectedRevision:renewal.revision,termsId:renewal.sourceTerms.id,
      expectedTermsRevision:renewal.continuationTerms.revision,
      expectedTermsSha256:renewal.continuationTerms.sha256,
      quoteId:published.quote.id,quoteSha256:published.quote.sha256,actor,
      note:'Attach the retained quotation without changing its proposed source edition.'
    }};
    const attached=await renewals.propose(args);
    assert.deepEqual(attached.renewal.continuationTerms,renewal.continuationTerms);
    assert.equal(attached.renewal.quote.sha256,published.quote.sha256);
    return {quote:published.quote,renewal:attached.renewal,args};
  };
  const receive=async(quote,status,observedAt)=>{
    const requestId=randomUUID();
    await commercialDesk.receive({id:caseId,expectedRevision:await revision(),requestId,actor,
      quoteId:quote.id,quoteSha256:quote.sha256,status,observedAt,
      source:'urn:stellar-forge:native-renewal-exercise:'+requestId,
      note:'Native fixture response retained through the original commercial writer.'});
    return {id:requestId,observedAt};
  };
  const decideArgs=async(renewal,state,response,note)=>({
    id:caseId,expectedRevision:await revision(),requestId:randomUUID(),input:{
      id:renewal.id,expectedRevision:renewal.revision,state,actor,
      observedAt:response?.observedAt??'2026-10-11T12:00:00.000Z',
      ...(response?{acceptanceId:response.id}:{}),note
    }
  });

  const initialTerms={
    id:randomUUID(),expectedRevision:null,title:'Original operational service',
    customer:'Native Journey Merchant',owner:'Service owner',reference:'fixture:original-agreement',
    status:'active',incidentSourceId:'native_source',merchantId:'native_merchant',
    merchantBinding:digest('native-renewal-merchant-binding'),
    effectiveFrom:'2026-08-01T00:00:00.000Z',effectiveUntil:'2026-11-01T00:00:00.000Z',
    calendar:{mode:'always',timeZone:'UTC',week:[],exceptions:[]},
    targets:[{kind:'ENDPOINT_UNAVAILABLE',responseMinutes:30,recoveryMinutes:240}],
    reviewedBy:actor,note:'Isolated original service agreement for the native journey.'
  };
  const savedTerms=await changeTerms(initialTerms),source=savedTerms.result,oldWorkspace=(await head()).workspaceText;
  const queueArgs={asOf:'2026-10-02T00:00:00.000Z',through:'2027-03-01T00:00:00.000Z',noticeDays:30,limit:100};
  const unplanned=await renewals.queue(queueArgs),beforeRow=unplanned.rows.find(row=>row.termsId===source.id);
  assert.equal(beforeRow.state,'unplanned');
  assert.equal(beforeRow.urgency,'notice_due');
  assert.equal(beforeRow.noticeAt,queueArgs.asOf);
  assert.deepEqual(await renewals.queue(queueArgs),unplanned,'The same saved portfolio must produce the same dated queue');

  const proposed=await propose(source,'Renewed operational service');
  const [first,concurrent]=await Promise.all([renewals.propose(proposed.args),desk().propose(proposed.args)]);
  assert.equal(first.renewal.sha256,concurrent.renewal.sha256,'Concurrent identical requests retain one immutable result');
  assert.equal(first.renewal.state,'proposed');
  assert.equal(first.renewal.continuationTerms.revision,source.revision+1);
  assert.equal(first.renewal.request.input.expectedCaseRevision,proposed.args.expectedRevision);
  const linked=await quoteAndAttach(first.renewal);
  const acceptedEarlier=await receive(linked.quote,'ACCEPTED','2026-10-10T09:00:00.000Z');
  await receive(linked.quote,'DECLINED','2026-10-10T10:00:00.000Z');
  const superseded=await decideArgs(linked.renewal,'accepted',acceptedEarlier,'Older recorded acceptance.');
  await unchangedAfter(()=>renewals.decide(superseded),'SERVICE_RENEWAL_RESPONSE_CHANGED');
  const latestAcceptance=await receive(linked.quote,'ACCEPTED','2026-10-10T11:00:00.000Z');
  const acceptedArgs=await decideArgs(linked.renewal,'accepted',latestAcceptance,'Activate the currently accepted continuation.');
  const accepted=await renewals.decide(acceptedArgs);
  assert.equal(accepted.renewal.state,'accepted');
  assert.deepEqual(accepted.renewal.continuationTerms,first.renewal.continuationTerms);
  assert.equal(accepted.renewal.activatedTerms.revision,first.renewal.continuationTerms.revision+1);
  assert.notEqual(accepted.renewal.activatedTerms.sha256,accepted.renewal.continuationTerms.sha256);
  const active=accepted.terms.find(row=>row.sha256===accepted.renewal.activatedTerms.sha256);
  assert.equal(active.status,'active');
  assert.equal(active.effectiveFrom,source.effectiveUntil);
  assert.equal(active.merchantBinding,source.merchantBinding);
  assert.equal(active.incidentSourceId,source.incidentSourceId);

  renewals=desk();
  const stableHead=await revision(),replayedProposal=await renewals.propose(proposed.args);
  assert.equal(replayedProposal.reused,true);
  assert.equal(replayedProposal.renewal.sha256,first.renewal.sha256);
  assert.equal(replayedProposal.case.revision,stableHead);
  const replayedAcceptance=await renewals.decide(acceptedArgs);
  assert.equal(replayedAcceptance.reused,true);
  assert.equal(replayedAcceptance.renewal.sha256,accepted.renewal.sha256);
  assert.equal(await revision(),stableHead,'Exact recovery must not add another case revision');
  await unchangedAfter(()=>renewals.decide({...acceptedArgs,input:{...acceptedArgs.input,note:'Changed request body.'}}),
    'SERVICE_RENEWAL_OPERATION_CONFLICT');
  const staleRequest={...acceptedArgs,requestId:randomUUID(),input:{...acceptedArgs.input,state:'closed',note:'Stale case change.'}};
  delete staleRequest.input.acceptanceId;
  await unchangedAfter(()=>renewals.decide(staleRequest),'CASE_CONFLICT');

  const settled=await renewals.queue(queueArgs);
  assert(settled.rows.some(row=>row.sourceTerms.sha256===source.sha256&&row.state==='accepted'));
  assert(settled.rows.some(row=>row.sourceTerms.sha256===active.sha256&&row.state==='unplanned'));
  const handover=await renewals.handover({id:caseId,renewalId:accepted.renewal.id});
  assert.deepEqual(await validateServiceRenewalHandover(handover),handover);
  assert.deepEqual(handover.acceptedHead,{id:accepted.renewal.id,revision:accepted.renewal.revision,sha256:accepted.renewal.sha256});
  assert(handover.termsHistory.some(row=>row.sha256===accepted.renewal.continuationTerms.sha256));
  assert.deepEqual(handover.sourceTerms,source);
  assert.equal(handover.proposedContinuation.sha256,accepted.renewal.continuationTerms.sha256);
  assert.equal(handover.activeTerms.sha256,accepted.renewal.activatedTerms.sha256);
  assert.equal(handover.financialJoin.agreementId,source.id);
  assert.equal(handover.financialJoin.quoteSha256,linked.quote.sha256);
  assert.equal(handover.financialJoin.acceptanceId,latestAcceptance.id);
  const payloads={};
  for(const key of ['quote','acceptance']){
    const material=handover.materials[key],bytes=Buffer.from(material.data,'base64');
    assert.equal(material.encoding,'base64');
    assert.equal(bytes.length,material.bytes);
    assert.equal(digest(bytes),material.sha256);
    payloads[key]=JSON.parse(bytes.toString('utf8'));
  }
  assert.equal(payloads.quote.payload.id,linked.quote.id);
  assert.equal(payloads.quote.payload.sha256,linked.quote.sha256);
  assert.equal(payloads.acceptance.id,latestAcceptance.id);
  assert.equal(payloads.acceptance.payload.quoteSha256,linked.quote.sha256);
  const rehashedWrongActive=structuredClone(handover);
  rehashedWrongActive.activeTerms.sha256=handover.proposedContinuation.sha256;
  const {sha256:discardedHandoverSha,...wrongBody}=rehashedWrongActive;
  rehashedWrongActive.sha256=await serviceSha256(wrongBody);
  await assert.rejects(()=>validateServiceRenewalHandover(rehashedWrongActive),
    error=>error.code==='SERVICE_RENEWAL_TERMS_CHANGED');
  const portable=await commercialDesk.download({id:caseId,quoteId:linked.quote.id,
    quoteSha256:linked.quote.sha256,kind:'HANDOFF'});
  const portableWorkspace=await parseWorkspace(portable.body.toString('utf8'));
  assert(portableWorkspace.service.renewals.some(row=>row.sha256===accepted.renewal.sha256));
  const portableContext=await commercialContext(portableWorkspace,{caseId,workspaceId,revision:await revision()});
  assert(portableContext.documents.some(row=>row.id===latestAcceptance.id));

  const closedAccepted=await renewals.decide(await decideArgs(accepted.renewal,'closed',null,
    'Operational continuation is active; close this completed renewal review.'));
  const closedHandover=await renewals.handover({id:caseId,renewalId:accepted.renewal.id});
  assert.equal(closedHandover.renewal.state,'closed');
  assert.deepEqual(closedHandover.acceptedHead,handover.acceptedHead);
  assert.equal(closedHandover.activeTerms.sha256,active.sha256);

  const second=(await changeTerms({...initialTerms,id:randomUUID(),title:'Agreement with an intervening amendment'})).result;
  const secondPrepared=await propose(second,'Continuation awaiting final operational review');
  const secondProposed=await renewals.propose(secondPrepared.args);
  const secondLinked=await quoteAndAttach(secondProposed.renewal);
  const secondResponse=await receive(secondLinked.quote,'ACCEPTED','2026-10-11T09:00:00.000Z');
  const currentView=await renewals.read({id:caseId});
  const proposedTerms=currentView.terms.find(row=>row.sha256===secondLinked.renewal.continuationTerms.sha256);
  const amended=(await changeTerms({...termsForm(proposedTerms),owner:'Intervening operational owner'})).result;
  const changedTermsDecision=await decideArgs(secondLinked.renewal,'accepted',secondResponse,'Attempt before reviewing intervening terms.');
  await unchangedAfter(()=>renewals.decide(changedTermsDecision),'SERVICE_RENEWAL_TERMS_CONFLICT');
  const closeArgs=await decideArgs(secondLinked.renewal,'closed',null,'The operational amendment superseded this pending proposal.');
  const closed=await renewals.decide(closeArgs);
  assert.equal(closed.renewal.state,'closed');
  assert.equal(closed.renewal.activatedTerms,null);
  assert(closed.terms.some(row=>row.sha256===amended.sha256));

  const beforeMerge=await head(),beforeMergeView=await renewals.read({id:caseId});
  await caseStore.save({id:caseId,expectedRevision:beforeMerge.revision,workspaceText:oldWorkspace,
    supportText:beforeMerge.supportText,metadata:beforeMerge.metadata});
  const afterMergeView=await renewals.read({id:caseId});
  assert.deepEqual(afterMergeView.renewalHistory.map(row=>row.sha256).sort(),
    beforeMergeView.renewalHistory.map(row=>row.sha256).sort());
  assert(afterMergeView.quotes.some(row=>row.id===linked.quote.id));
  assert(afterMergeView.responses.some(row=>row.id===latestAcceptance.id));
  assert.equal(afterMergeView.renewalHistory.filter(row=>row.requestId===proposed.args.requestId).length,1);
  const closedQueue=await renewals.queue({...queueArgs,includeClosed:true});
  assert(closedQueue.rows.some(row=>row.renewal?.id===closed.renewal.id&&row.state==='closed'));

  const server=createConsoleServer({caseStore,commercialDesk,renewalDesk:renewals});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/renewals','/renewals.mjs','/service-renewals.mjs']){
      const response=await fetch(origin+path,{headers:{Origin:origin}});
      assert.equal(response.status,200,'The original console must serve '+path);
      assert((await response.text()).length>0);
    }
    const params=new URLSearchParams({asOf:queueArgs.asOf,through:queueArgs.through,
      noticeDays:'30',limit:'100',includeClosed:'true'});
    const portfolioResponse=await fetch(origin+'/api/services/renewals?'+params,{headers:{Origin:origin}});
    assert.equal(portfolioResponse.status,200);
    const portfolio=await portfolioResponse.json();
    assert(portfolio.rows.some(row=>row.caseId===caseId&&row.termsId===source.id));
    const caseUrl=origin+'/api/cases/'+caseId+'/renewals';
    const readResponse=await fetch(caseUrl,{headers:{Origin:origin}});
    assert.equal(readResponse.status,200);
    assert.equal((await readResponse.json()).case.id,caseId);
    const beforeHttpReplay=await revision();
    const body=JSON.stringify({expectedRevision:acceptedArgs.expectedRevision,
      requestId:acceptedArgs.requestId,input:acceptedArgs.input});
    const replayResponse=await fetch(caseUrl+'/decide',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},body});
    assert.equal(replayResponse.status,200);
    const replayed=await replayResponse.json();
    assert.equal(replayed.reused,true);
    assert.equal(replayed.renewal.sha256,accepted.renewal.sha256);
    const handoverResponse=await fetch(caseUrl+'/handover?renewalId='+accepted.renewal.id,
      {headers:{Origin:origin}});
    assert.equal(handoverResponse.status,200);
    const httpHandover=await validateServiceRenewalHandover(await handoverResponse.json());
    assert.deepEqual(httpHandover.acceptedHead,handover.acceptedHead);
    const crossOrigin=await fetch(caseUrl+'/decide',{method:'POST',
      headers:{Origin:'https://cross-origin.invalid','Content-Type':'application/json'},body});
    assert.equal(crossOrigin.status,403);
    await crossOrigin.text();
    assert.equal(await revision(),beforeHttpReplay,'HTTP retry and rejected origin must preserve the case head');
  }finally{
    for(const close of ['closeCasePackages','closeCommercialReceiving','closeSourceDelivery'])
      if(typeof server[close]==='function')await server[close]();
    server.closeIdleConnections?.();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
  return {caseId,caseRevision:await revision(),agreementId:source.id,
    proposalTerms:accepted.renewal.continuationTerms,activatedTerms:accepted.renewal.activatedTerms,
    quoteId:linked.quote.id,acceptanceId:latestAcceptance.id,
    renewalHistory:afterMergeView.renewalHistory.length,acceptedHandover:handover,
    checks:['native concurrent request recovery','finite unplanned portfolio and exact notice boundary',
      'quote-bound proposed edition','latest original customer response','accepted activation',
      'saved-case replay and conflicts','exact financial handover materials','portable workspace',
      'intervening terms and closure','accepted head after closure','rehashed wrong active edition rejection','original older-workspace merge',
      'native HTTP portfolio/read/handover','HTTP request recovery and origin guard','served renewal page and modules']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const directory=await mkdtemp(join(process.env.SF74_RENEWAL_TMPDIR??tmpdir(),'sf74-renewal-native-'));
  try{
    const caseStore=await openCaseStore(directory),caseId=randomUUID();
    await caseStore.save({id:caseId,expectedRevision:null,metadata:{},
      workspaceText:await serializeWorkspace({name:'Isolated renewal native journey'})});
    const {acceptedHandover,...result}=await runServiceRenewalsExercise({caseStore,caseId,workspaceId:commercialWorkspaceId(directory)});
    const sampleFile=resolve(process.argv[2]??'service-renewal-accepted-handover.json');
    const sampleText=JSON.stringify(acceptedHandover,null,2)+'\n';
    await mkdir(dirname(sampleFile),{recursive:true,mode:0o700});
    await writeFile(sampleFile,sampleText,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({ok:true,...result,acceptedHandover:{file:sampleFile,
      bytes:Buffer.byteLength(sampleText),sha256:digest(sampleText),envelopeSha256:acceptedHandover.sha256}},null,2));
  }finally{await rm(directory,{recursive:true,force:true});}
}
