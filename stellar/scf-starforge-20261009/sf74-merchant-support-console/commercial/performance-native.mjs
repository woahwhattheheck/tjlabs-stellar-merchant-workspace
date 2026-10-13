#!/usr/bin/env node
// MIT. One complete original Pricing performance → revised Commercial quotation → recipient operation.
import assert from 'node:assert/strict';
import {readFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {openWorkspace} from '../../sf97-merchant-revenue-ops/workspace/model.mjs';
import {openTariffWorkspace} from '../../sf97-merchant-revenue-ops/tariffs/workspace.mjs';
import {openPerformanceWorkspace} from '../../sf97-merchant-revenue-ops/performance/workspace.mjs';
import {runTariffCommercialReceiving} from './tariff-receiving-native.mjs';
import {openCaseStore,retainCaseArtifact} from '../case-store.mjs';
import {openCaseCommercial,commercialWorkspaceId} from '../case-commercial.mjs';
import {commercialCli} from '../commercial-cli.mjs';
import {commercialPerformanceCli} from './performance-cli.mjs';
import {openCommercialTariffController} from './tariff-controller.mjs';
import {createCommercialPerformanceClient} from './performance-client.mjs';
import {start as startSupport} from '../server.mjs';
import {merchantCommercial} from '../../../../stellar-forge/mcp-merchant-operator/support-commercial.mjs';
import {RetainedFileReads} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {runPerformanceInterfaces} from '../../sf97-merchant-revenue-ops/performance/interfaces-native.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const PRICING=resolve(ROOT,'../sf97-merchant-revenue-ops');
const SCHEMA='stellar-forge.merchant-performance-customer-operation.v1';
const ACTOR='Repository fixture performance operator';
const json=value=>JSON.stringify(value,null,2)+'\n';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=value=>structuredClone(value);
const amount=value=>value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value;
async function readJSON(path){return JSON.parse(await readFile(path,'utf8'));}
async function optional(path){try{return await readJSON(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function retain(path,value){
  const body=Buffer.isBuffer(value)?value:Buffer.from(json(value));
  await retainCaseArtifact(path,body);
  return value;
}
async function keep(path,create){return await optional(path)??retain(path,await create());}
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});}
function absolute(value){assert.ok(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/');return value;}
async function file(path,result){
  const bytes=Buffer.from(result.body??result.bytes);assert.equal(bytes.length,result.descriptor.bytes);
  assert.equal(hash(bytes),result.descriptor.sha256);await retain(path,bytes);
  return {...result.descriptor,path};
}

const COMMERCIAL_PHASE_SCHEMA='stellar-forge.merchant-performance-commercial-phase.v1';
const COMMERCIAL_PHASE_NAME='commercial-phase.json';
const COMMERCIAL_REQUEST_NAMES=[
  'performance-save','customer-receive-performance','publish-original-rate-revision',
  'save-native-monthly-proposal','commit-native-monthly-proposal','receive-revised-native-tariff',
  'publish-revised-native-rate','recipient-owned-draft',
];
function phaseFilePaths({nativeRun,customerRun,output,settings}){
  return [
    join(output,'operation.json'),join(nativeRun,'operation.json'),join(nativeRun,'flow-result.json'),
    join(customerRun,'flow-result.json'),settings.config,settings.snapshot,
    ...COMMERCIAL_REQUEST_NAMES.map(name=>join(output,'requests',name+'.json')),
    ...['native-performance-source.json','case-native-performance-source.json','revised-customer-draft.json',
      'quote-comparison.json','customer-quote.md','usage-report.md'].map(name=>join(output,'downloads',name)),
  ];
}
function phaseTreePaths({output}){
  return ['revised-pricing-source','complete-customer-package','received-package','recipient-sources']
    .map(name=>join(output,name));
}
// Hash completed files incrementally. Retained material bytes do not remain in
// the process after their identity has been recorded or checked.
async function pinnedFile(path){
  absolute(path);
  const before=await lstat(path);
  assert.ok(before.isFile()&&!before.isSymbolicLink(),'Completed material must be a regular file: '+path);
  const digest=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(path,{highWaterMark:65536})){digest.update(chunk);bytes+=chunk.length;}
  const after=await lstat(path);
  assert.ok(after.isFile()&&!after.isSymbolicLink(),'Completed material changed type: '+path);
  assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);
  assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);
  assert.equal(bytes,before.size);
  return {path,bytes,sha256:digest.digest('hex')};
}
async function pinnedTree(root,{restoreEmpty=false}={}){
  absolute(root);
  let rootInfo;
  try{rootInfo=await lstat(root);}
  catch(error){
    if(error.code!=='ENOENT'||!restoreEmpty)throw error;
    // Full-work archives may omit an original empty service directory. Recreate
    // only the exact empty recipient-source root declared by the saved phase.
    try{await mkdir(root,{mode:0o700});}catch(createError){if(createError.code!=='EEXIST')throw createError;}
    rootInfo=await lstat(root);
  }
  assert.ok(rootInfo.isDirectory()&&!rootInfo.isSymbolicLink(),'Completed material directory changed: '+root);
  const files=[];
  async function visit(directory){
    const children=await readdir(directory,{withFileTypes:true});
    children.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const entry of children){
      const path=join(directory,entry.name);
      assert.ok(!entry.isSymbolicLink(),'Completed material contains a link: '+path);
      if(entry.isDirectory())await visit(path);
      else{
        assert.ok(entry.isFile(),'Completed material contains a non-file: '+path);
        files.push(await pinnedFile(path));
      }
    }
  }
  await visit(root);
  return {root,files};
}
async function pinnedCase({directory,id,revision}){
  const store=await openCaseStore(directory);
  // The original store checks the content-addressed version, workspace and
  // runtime source. Read that saved revision even if the current head advances.
  const saved=await store.read(id,revision);
  assert.equal(saved.id,id);assert.equal(saved.revision,revision);
  const textIdentity=text=>({bytes:Buffer.byteLength(text,'utf8'),sha256:hash(text)});
  return {directory,id,revision,workspace:textIdentity(saved.workspaceText),
    runtime:saved.supportText===null?null:textIdentity(saved.supportText)};
}
async function modelMaterialPins(model,usageVersion,pricingVersion){
  const files=[
    {version:usageVersion,name:'manifest.json'},
    {version:usageVersion,name:'report/report.json'},
    {version:pricingVersion,name:'manifest.json'},
  ],result=[];
  for(const entry of files){
    const bytes=Buffer.from(await model.download(entry.version,entry.name));
    result.push({...entry,bytes:bytes.length,sha256:hash(bytes)});
  }
  return result;
}
function assertPhaseIdentity(phase,{nativeRun,customerRun,output,id,operation,settings}){
  assert.equal(phase.schema,COMMERCIAL_PHASE_SCHEMA);assert.equal(phase.state,'COMMERCIAL_COMPLETE');
  assert.equal(phase.nativeRun,nativeRun);assert.equal(phase.customerRun,customerRun);
  assert.equal(phase.operationDirectory,output);assert.equal(phase.caseId,id);
  assert.equal(phase.settings.directory,settings.directory);
  absolute(phase.settings.config);absolute(phase.settings.snapshot);
  const result=phase.result;
  assert.equal(result.schema,'stellar-forge.merchant-performance-customer-result.v1');
  assert.equal(result.state,'COMMERCIAL_COMPLETE');
  assert.equal(result.operationDirectory,output);assert.equal(result.originalNative,nativeRun);
  assert.equal(result.originalCustomer,customerRun);assert.equal(result.originalCaseId,id);
  assert.equal(result.recorded.performanceId,operation.performanceRequestId);
  assert.equal(result.quotes.measured.id,operation.measuredQuoteId);
  assert.equal(result.quotes.oldRateRevision.id,operation.sameRateQuoteRequestId);
  assert.equal(result.quotes.revisedNativeRate.id,operation.revisedQuoteRequestId);
  assert.equal(result.nativeProposal.requestId,operation.proposalRequestId);
  assert.equal(result.nativeProposal.pricingRequestId,operation.proposalPricingRequestId);
  assert.equal(result.completeSource.path,join(output,'downloads','case-native-performance-source.json'));
  assert.equal(result.completeSource.sha256,result.recorded.sourceSha256);
  assert.equal(result.customerDocument.path,join(output,'downloads','customer-quote.md'));
  assert.equal(result.report.path,join(output,'downloads','usage-report.md'));
  assert.equal(result.package.directory,join(output,'complete-customer-package'));
  assert.deepEqual(result.receiving,{completeOriginalSource:true,originalQuoteHistory:true,recipientDraftPreserved:true});
  assert.equal(result.http.state,'COMPLETE');assert.equal(result.mcp.state,'COMPLETE');
  assert.equal(result.mcp.sha256,result.recorded.sourceSha256);
  assert.ok(!Object.hasOwn(result,'pricingInterfaces'));
}
async function retainCommercialPhase(context,{result,modelMaterials,caseRevisions}){
  const files=[];
  for(const path of phaseFilePaths(context))files.push(await pinnedFile(path));
  const trees=[];
  for(const root of phaseTreePaths(context))trees.push(await pinnedTree(root));
  const cases=[];
  for(const selected of caseRevisions)cases.push(await pinnedCase(selected));
  const operationFile=files.find(file=>file.path===join(context.output,'operation.json'));
  const phase={
    schema:COMMERCIAL_PHASE_SCHEMA,state:'COMMERCIAL_COMPLETE',
    createdAt:new Date().toISOString(),operationDirectory:context.output,nativeRun:context.nativeRun,
    customerRun:context.customerRun,caseId:context.id,operationSha256:operationFile.sha256,
    settings:context.settings,result:{...result,state:'COMMERCIAL_COMPLETE'},
    files,trees,cases,modelMaterials,
  };
  assertPhaseIdentity(phase,context);
  await retain(join(context.output,COMMERCIAL_PHASE_NAME),phase);
  return phase;
}
async function verifyCommercialPhase(context,phase){
  assertPhaseIdentity(phase,context);
  const paths=phaseFilePaths(context),originalPaths=phaseFilePaths({...context,settings:phase.settings});
  assert.deepEqual(phase.files.map(file=>file.path),originalPaths);
  assert.deepEqual(phase.trees.map(tree=>tree.root),phaseTreePaths(context));
  for(let index=0;index<paths.length;index++){
    const descriptor=phase.files[index],actual=await pinnedFile(paths[index]);
    // A receiver may restore the byte-identical configuration in a new code
    // checkout. Case/native paths remain fixed; source identity is its bytes.
    assert.deepEqual(actual,{...descriptor,path:paths[index]});
  }
  for(const descriptor of phase.trees){
    const restoreEmpty=descriptor.root===join(context.output,'recipient-sources')&&
      Array.isArray(descriptor.files)&&descriptor.files.length===0;
    assert.deepEqual(await pinnedTree(descriptor.root,{restoreEmpty}),descriptor);
  }
  const operationFile=phase.files.find(file=>file.path===join(context.output,'operation.json'));
  assert.equal(operationFile.sha256,phase.operationSha256);
  const nativeFile=phase.files.find(file=>file.path===join(context.nativeRun,'operation.json'));
  assert.equal(nativeFile.sha256,context.operation.nativeOperationSha256);
  const sourceFile=phase.files.find(file=>file.path===join(context.output,'downloads','native-performance-source.json'));
  assert.equal(sourceFile.sha256,phase.result.recorded.sourceSha256);
  const retainedSourceFile=phase.files.find(file=>file.path===phase.result.completeSource.path);
  assert.equal(retainedSourceFile.sha256,phase.result.completeSource.sha256);
  assert.equal(retainedSourceFile.bytes,phase.result.completeSource.bytes);
  const quoteFile=phase.files.find(file=>file.path===phase.result.customerDocument.path);
  assert.equal(quoteFile.sha256,phase.result.customerDocument.sha256);
  assert.equal(quoteFile.bytes,phase.result.customerDocument.bytes);
  const reportFile=phase.files.find(file=>file.path===phase.result.report.path);
  assert.equal(reportFile.sha256,phase.result.report.sha256);
  assert.equal(reportFile.bytes,phase.result.report.bytes);
  assert.deepEqual(phase.cases.map(({directory,id})=>({directory,id})),[
    {directory:context.casesDirectory,id:context.id},
    {directory:join(context.output,'recipient-cases'),id:phase.result.recipientCaseId},
  ]);
  for(const selected of phase.cases)assert.deepEqual(await pinnedCase(selected),selected);
  const receiving=await readJSON(join(context.output,'requests','recipient-owned-draft.json'));
  assert.equal(receiving.id,phase.result.recipientCaseId);
  assert.equal(receiving.requestId,context.operation.receiverDraftRequestId);
  const model=await openWorkspace(context.settings);
  assert.deepEqual(await modelMaterialPins(model,context.native.pricingVersion,phase.result.nativeProposal.pricingVersion),
    phase.modelMaterials);
}
async function finishPricingInterfaces(context,phase,{verify=true}={}){
  if(verify)await verifyCommercialPhase(context,phase);
  const requests=join(context.output,'requests');
  const envelope=await readJSON(join(context.output,'downloads','native-performance-source.json'));
  const saveInput=await readJSON(join(requests,'performance-save.json'));
  const proposalSave=await readJSON(join(requests,'save-native-monthly-proposal.json'));
  const proposalCommit=await readJSON(join(requests,'commit-native-monthly-proposal.json'));
  assert.equal(envelope.id,phase.result.recorded.sourceId);
  assert.equal(envelope.record.performanceId,context.operation.performanceRequestId);
  assert.equal(saveInput.requestId,context.operation.performanceRequestId);
  assert.equal(proposalSave.performanceId,context.operation.performanceRequestId);
  assert.equal(proposalSave.requestId,context.operation.proposalRequestId);
  assert.equal(proposalCommit.performanceId,context.operation.performanceRequestId);
  assert.equal(proposalCommit.proposalRequestId,context.operation.proposalRequestId);
  assert.equal(proposalCommit.planRequestId,context.operation.proposalPlanRequestId);
  assert.equal(proposalCommit.pricingRequestId,context.operation.proposalPricingRequestId);
  // The commercial phase has returned and closed its owners. Its model, case
  // views, report buffers, previews and source text are now eligible for release.
  const pricingInterfaces=await runPerformanceInterfaces({settings:context.settings,nativeRun:context.nativeRun,
    output:join(context.output,'pricing-interfaces'),performanceId:context.operation.performanceRequestId,
    envelope,saveInput,proposalSave,proposalCommit});
  assert.equal(pricingInterfaces.state,'COMPLETE');
  assert.equal(pricingInterfaces.sourceSha256,phase.result.recorded.sourceSha256);
  const result={...phase.result,state:'COMPLETE',completedAt:new Date().toISOString(),pricingInterfaces};
  return await keep(join(context.output,'flow-result.json'),async()=>result);
}

export async function runPerformanceCommercial({nativeRun,output,customerRun,python='python3'}={}){
  process.umask(0o077);nativeRun=absolute(nativeRun);output=absolute(output);await privateDirectory(output);
  const native=await readJSON(join(nativeRun,'flow-result.json'));
  assert.equal(native.status,'COMPLETE');
  customerRun=customerRun?absolute(customerRun):join(output,'original-customer');
  const customer=await optional(join(customerRun,'flow-result.json'))??
    await runTariffCommercialReceiving({nativeRun,output:customerRun,python});
  assert.equal(customer.state,'COMPLETE');
  const origin=await readJSON(join(nativeRun,'operation.json'));
  const casesDirectory=join(customerRun,'cases'),store=await openCaseStore(casesDirectory),id=customer.case.id;
  const scope={caseId:id,workspaceId:commercialWorkspaceId(casesDirectory)};
  const commercial=openCaseCommercial({store,workspaceId:scope.workspaceId});
  const operation=await keep(join(output,'operation.json'),async()=>({
    schema:SCHEMA,createdAt:new Date().toISOString(),nativeRun,customerRun,caseId:id,
    nativeOperationSha256:hash(await readFile(join(nativeRun,'operation.json'))),
    measuredQuoteId:customer.quote.originalQuoteId,performanceRequestId:randomUUID(),
    receivePerformanceRequestId:randomUUID(),sameRateQuoteRequestId:randomUUID(),
    proposalRequestId:randomUUID(),proposalPlanRequestId:randomUUID(),proposalPricingRequestId:randomUUID(),
    proposalBackupRequestId:randomUUID(),proposalPricingAttachmentId:randomUUID(),
    proposalBackupAttachmentId:randomUUID(),proposalTariffAttachmentId:randomUUID(),
    revisedQuoteRequestId:randomUUID(),receiverRequestId:randomUUID(),receiverDraftRequestId:randomUUID(),
  }));
  assert.equal(operation.schema,SCHEMA);assert.equal(operation.caseId,id);
  assert.equal(operation.nativeOperationSha256,hash(await readFile(join(nativeRun,'operation.json'))));
  assert.equal(operation.nativeRun,nativeRun);assert.equal(operation.customerRun,customerRun);
  const completed=await optional(join(output,'flow-result.json'));
  if(completed){
    assert.equal(completed.schema,'stellar-forge.merchant-performance-customer-result.v1');
    assert.equal(completed.state,'COMPLETE');assert.equal(completed.operationDirectory,output);
    assert.equal(completed.originalNative,nativeRun);assert.equal(completed.originalCustomer,customerRun);
    assert.equal(completed.originalCaseId,id);assert.equal(completed.recorded.performanceId,operation.performanceRequestId);
    assert.equal(completed.quotes.measured.id,operation.measuredQuoteId);
    assert.equal(completed.quotes.revisedNativeRate.id,operation.revisedQuoteRequestId);
    assert.equal(completed.nativeProposal.pricingRequestId,operation.proposalPricingRequestId);
    assert.equal(completed.pricingInterfaces.state,'COMPLETE');
    assert.equal(completed.pricingInterfaces.sourceSha256,completed.recorded.sourceSha256);
    return completed;
  }
  const settings={config:join(PRICING,'illustrative-service.json'),
    snapshot:join(PRICING,'illustrative-native-shape-snapshot.json'),directory:join(nativeRun,'pricing')};
  const context={nativeRun,output,customerRun,python,native,customer,origin,casesDirectory,store,id,scope,commercial,operation,settings};
  let phase=await optional(join(output,COMMERCIAL_PHASE_NAME));
  const resumed=Boolean(phase);
  if(!phase){
    const completedCommercial=await runCommercialPhase(context);
    phase=await retainCommercialPhase(context,completedCommercial);
  }
  return await finishPricingInterfaces(context,phase,{verify:resumed});
}
async function runCommercialPhase({nativeRun,output,customerRun,python,native,customer,origin,casesDirectory,
  store,id,scope,commercial,operation,settings}){
  const requests=join(output,'requests'),downloads=join(output,'downloads');
  await privateDirectory(requests);await privateDirectory(downloads);
  const request=(name,create)=>keep(join(requests,name+'.json'),create);
  const model=await openWorkspace(settings),tariffs=await openTariffWorkspace({model,directory:settings.directory});
  let performance=await openPerformanceWorkspace({model,tariffs,directory:settings.directory});
  const inputs={selectionRequestId:origin.pricingRequestId,usageVersion:native.pricingVersion,basis:'HTTP_2XX'};
  const nativeReview=await performance.preview(inputs);
  assert.equal(nativeReview.review.source.selectionRequestId,origin.pricingRequestId);
  assert.equal(nativeReview.review.quoted.savedUnitUsd,'0.0114');
  const report=JSON.parse(Buffer.from(await model.download(inputs.usageVersion,'report/report.json')).toString('utf8'));
  assert.equal(nativeReview.review.basis.quantity,String(report.routes.find(row=>row.routeId==='dataset').actual2xx));
  const saveInput=await request('performance-save',async()=>({
    requestId:operation.performanceRequestId,label:'Recorded repository route usage and original saved tariff',
    performanceSha256:nativeReview.review.performanceSha256,inputs:nativeReview.inputs,
  }));
  const saved=await performance.save(saveInput);assert.equal(saved.performanceId,operation.performanceRequestId);
  assert.equal((await performance.save(saveInput)).recovered,true);
  const envelope=await performance.capture(saved.performanceId);
  const sourceBytes=Buffer.from(await performance.download(saved.performanceId,'source.json'));
  assert.deepEqual(JSON.parse(sourceBytes),envelope);
  const sourcePath=join(downloads,'native-performance-source.json');await retain(sourcePath,sourceBytes);
  const sourceSha256=hash(sourceBytes);
  const sourceText=new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes);
  const view=await commercial.read({id}),measured=view.quotes.find(row=>row.id===operation.measuredQuoteId);
  assert.ok(measured);assert.equal(measured.sourceBindings.tariff.id,customer.capture.tariffSourceId);
  const inspectInput={id,scope,expectedRevision:view.revision,quoteId:measured.id,quoteSha256:measured.sha256,sourceText,sourceSha256};
  const preview=await commercial.previewPerformance(inspectInput);
  const cliPreview=await commercialPerformanceCli(['preview','--cases-dir',casesDirectory,'--case',id,
    '--revision',view.revision,'--source',sourcePath,'--quote',measured.id,'--quote-sha',measured.sha256]);
  assert.equal(cliPreview.reviewSha256,preview.reviewSha256);
  const receiveInput=await request('customer-receive-performance',async()=>({
    ...inspectInput,requestId:operation.receivePerformanceRequestId,actor:ACTOR,reviewSha256:preview.reviewSha256,
  }));
  const attached=await commercial.receivePerformance(receiveInput);
  assert.equal((await commercial.receivePerformance(receiveInput)).replayed,true);
  const performanceSourceId=attached.performanceSourceId;
  const sourceFile=await file(join(downloads,'case-native-performance-source.json'),await commercial.downloadPerformance({
    id,sourceId:performanceSourceId,kind:'SOURCE',
  }));assert.equal(sourceFile.sha256,sourceSha256);

  // A new monthly quantity on the old saved rate is a separate explicit proposal.
  let current=await commercial.read({id});
  const sameRate=await commercial.preparePerformanceRevision({id,scope,expectedRevision:current.revision,
    sourceId:performanceSourceId,quoteId:measured.id,quoteSha256:measured.sha256,proposedMonthlyRequests:'1500'});
  assert.equal(sameRate.draft.parentId,measured.id);assert.equal(sameRate.draft.performanceSourceId,performanceSourceId);
  assert.deepEqual(sameRate.draft.terms,measured.draft.terms);
  const sameReview=await commercial.preview({id,scope,expectedRevision:current.revision,draft:sameRate.draft});
  assert.equal(amount(sameReview.review.totals.routeUsageUsd),'17.1');
  const samePublish=await request('publish-original-rate-revision',async()=>({
    id,scope,expectedRevision:current.revision,requestId:operation.sameRateQuoteRequestId,actor:ACTOR,
    draft:sameRate.draft,reviewSha256:sameReview.review.reviewSha256,parentId:measured.id,
  }));
  const sameQuote=(await commercial.publish(samePublish)).quote;
  assert.equal((await commercial.publish(samePublish)).replayed,true);

  // The original native tariff writer derives and saves the rate at the explicit new volume.
  const proposal=await performance.proposal({performanceId:saved.performanceId,proposedMonthlyRequests:'1500'});
  assert.equal(proposal.observedQuantity,nativeReview.review.basis.quantity);
  assert.equal(proposal.comparison.quote.totalUsd,'16.5');
  assert.equal(proposal.comparison.quote.chosenUniformQuoteUsd,'0.011');
  const proposalSave=await request('save-native-monthly-proposal',async()=>({
    performanceId:saved.performanceId,proposedMonthlyRequests:'1500',proposalSha256:proposal.proposalSha256,
    requestId:operation.proposalRequestId,label:'Explicit 1500 monthly requests from recorded usage review',
  }));
  const savedProposal=await performance.saveProposal(proposalSave);assert.ok(savedProposal.selection);
  assert.equal((await performance.saveProposal(proposalSave)).recovered,true);
  const proposalCommit=await request('commit-native-monthly-proposal',async()=>({
    performanceId:saved.performanceId,proposalRequestId:operation.proposalRequestId,
    selection:savedProposal.selection,planRequestId:operation.proposalPlanRequestId,
    pricingRequestId:operation.proposalPricingRequestId,
  }));
  const committed=await performance.commitProposal(proposalCommit);
  assert.equal(committed.status,'PERFORMANCE_PRICING_SAVED');
  assert.equal((await performance.commitProposal(proposalCommit)).recovered,true);

  const tariffController=openCommercialTariffController({store,casesDirectory});
  let support,reads,mcp,recipientSupport;
  try{
    const captureDirectory=join(output,'revised-pricing-source');
    const capture=await tariffController.call('capture',{
      id,scope,pricingDirectory:settings.directory,pricingConfig:settings.config,pricingSnapshot:settings.snapshot,
      selectionRequestId:operation.proposalPricingRequestId,backupRequestId:operation.proposalBackupRequestId,directory:captureDirectory,
    });
    const captured=capture.result;
    const tariffAttach=await request('receive-revised-native-tariff',async()=>({
      id,scope,expectedRevision:(await store.read(id)).revision,directory:captureDirectory,
      expectedSourceSha256:captured.sourceSha256,pricingRequestId:operation.proposalPricingAttachmentId,
      backupAttachmentRequestId:operation.proposalBackupAttachmentId,tariffAttachmentRequestId:operation.proposalTariffAttachmentId,
      actor:ACTOR,bindingReason:'Original saved monthly proposal derived from the recorded usage review.',
    }));
    const received=await tariffController.call('attach',tariffAttach);
    const targetTariffSourceId=received.result.tariffSourceId;
    current=await commercial.read({id});
    const prepared=await commercial.preparePerformanceRevision({id,scope,expectedRevision:current.revision,
      sourceId:performanceSourceId,quoteId:sameQuote.id,quoteSha256:sameQuote.sha256,
      proposedMonthlyRequests:'1500',targetTariffSourceId});
    assert.equal(prepared.proposal.rateChanged,true);assert.equal(prepared.draft.parentId,sameQuote.id);
    assert.deepEqual(prepared.draft.terms,measured.draft.terms);
    const draftPath=join(downloads,'revised-customer-draft.json');await retain(draftPath,prepared.draft);
    const quoteReview=await commercial.preview({id,scope,expectedRevision:current.revision,draft:prepared.draft});
    assert.equal(amount(quoteReview.review.totals.routeUsageUsd),'16.5');
    assert.equal(quoteReview.review.sourceBindings.performance.measuredQuote.sha256,measured.sha256);
    assert.equal(quoteReview.review.sourceBindings.performance.proposed.monthlyRequests,'1500');
    assert.equal(quoteReview.review.sourceBindings.performance.proposed.unitUsd,'0.011');
    assert.match(quoteReview.review.customerDocument,/Recorded usage and this revision/);
    const publish=await request('publish-revised-native-rate',async()=>({
      id,scope,expectedRevision:current.revision,requestId:operation.revisedQuoteRequestId,actor:ACTOR,
      draft:prepared.draft,reviewSha256:quoteReview.review.reviewSha256,parentId:sameQuote.id,
    }));
    const revised=(await commercial.publish(publish)).quote;
    assert.equal((await commercial.publish(publish)).replayed,true);
    assert.equal((await commercial.receivePerformance(receiveInput)).replayed,true);
    const comparison=await commercial.compare({id,beforeId:sameQuote.id,afterId:revised.id});
    await retain(join(downloads,'quote-comparison.json'),comparison);
    const customerQuote=await file(join(downloads,'customer-quote.md'),await commercial.download({
      id,quoteId:revised.id,quoteSha256:revised.sha256,kind:'QUOTE',
    }));
    const reportFile=await file(join(downloads,'usage-report.md'),await commercial.downloadPerformance({
      id,sourceId:performanceSourceId,kind:'REPORT',
    }));

    // Native reopen retains the original performance source after later Pricing commits.
    const reopenedModel=await openWorkspace(settings);
    const reopenedTariffs=await openTariffWorkspace({model:reopenedModel,directory:settings.directory});
    performance=await openPerformanceWorkspace({model:reopenedModel,tariffs:reopenedTariffs,directory:settings.directory});
    assert.deepEqual(await performance.capture(saved.performanceId),envelope);
    assert.equal((await performance.save(saveInput)).recovered,true);

    support=await startSupport({casesDir:casesDirectory,environment:{...process.env,SCF_PYTHON:python}});
    const http=createCommercialPerformanceClient({url:support.url,caseId:id,workspaceId:scope.workspaceId});
    const exact=await http.download({revision:(await store.read(id)).revision,sourceId:performanceSourceId,kind:'SOURCE'});
    assert.deepEqual(Buffer.from(exact.bytes),sourceBytes);
    const httpRevision=await http.prepareRevision({expectedRevision:(await store.read(id)).revision,sourceId:performanceSourceId,
      quoteId:revised.id,quoteSha256:revised.sha256,proposedMonthlyRequests:'1750',targetTariffSourceId});
    assert.equal(httpRevision.draft.pricing.routes.find(row=>row.routeId==='dataset').monthlyRequests,'1750');
    const assets=[];
    for(const route of ['/commercial','/commercial/performance-desk.mjs','/commercial/performance-client.mjs','/commercial/performance.css']){
      const response=await fetch(new URL(route,support.url),{redirect:'error',signal:AbortSignal.timeout(20000)});
      assert.equal(response.status,200);const body=Buffer.from(await response.arrayBuffer());
      assert.deepEqual(body,await readFile(route==='/commercial'?join(ROOT,'commercial.html'):join(ROOT,route.slice(1))));
      assets.push({route,bytes:body.length,sha256:hash(body)});
    }
    await support.close();support=null;

    const exportRevision=(await store.read(id)).revision,packageDirectory=join(output,'complete-customer-package');
    const packageResult=await commercialCli(['export','--cases-dir',casesDirectory,'--case',id,'--revision',exportRevision,
      '--out',packageDirectory,'--export-id','performance-'+operation.performanceRequestId,
      '--generated-at',operation.createdAt,'--python',python]);
    const receivedCases=join(output,'recipient-cases'),receivedSources=join(output,'recipient-sources');
    const receiveArgs=['receive-package','--from',packageDirectory,'--sha256',packageResult.caseSource.manifestSha256,
      '--out',join(output,'received-package'),'--cases-dir',receivedCases,'--source-dir',receivedSources,
      '--request-id',operation.receiverRequestId,'--actor',ACTOR,'--python',python];
    const delivered=await commercialCli(receiveArgs);assert.equal(delivered.state,'COMPLETE');
    const recipientStore=await openCaseStore(receivedCases),recipientId=delivered.case.id;
    const recipientScope={caseId:recipientId,workspaceId:commercialWorkspaceId(receivedCases)};
    const recipient=openCaseCommercial({store:recipientStore,workspaceId:recipientScope.workspaceId});
    let receiver=await recipient.read({id:recipientId});
    assert.equal(receiver.quotes.find(row=>row.id===revised.id).sha256,revised.sha256);
    assert.equal(receiver.performanceSources.find(row=>row.id===performanceSourceId).measuredQuote.sha256,measured.sha256);
    const receivedSource=await recipient.downloadPerformance({id:recipientId,revision:receiver.revision,sourceId:performanceSourceId,kind:'SOURCE'});
    assert.deepEqual(receivedSource.body,sourceBytes);
    const receiverDraft=await request('recipient-owned-draft',async()=>{
      const draft=copy(revised.draft);draft.parentId=revised.id;draft.notes='Recipient-owned continuation of the complete recorded usage review.';
      return {id:recipientId,scope:recipientScope,expectedRevision:receiver.revision,
        requestId:operation.receiverDraftRequestId,actor:ACTOR,draft};
    });
    await recipient.saveDraft(receiverDraft);
    await commercialCli(receiveArgs);
    receiver=await recipient.read({id:recipientId});assert.equal(receiver.draft.notes,receiverDraft.draft.notes);

    const retainedDirectory=join(output,'mcp-files');await privateDirectory(retainedDirectory);
    reads=new RetainedFileReads({errorPrefix:'SUPPORT'});
    mcp=merchantCommercial({cases:async()=>recipientStore,casesDirectory:()=>receivedCases,
      exportsDirectory:()=>retainedDirectory,reads,environment:{...process.env,SCF_PYTHON:python}});
    const choice={id:recipientId,revision:receiver.revision,sourceId:performanceSourceId,kind:'SOURCE',expectedSha256:sourceSha256};
    let page=await mcp.call('merchant_case_commercial_performance_file',{...choice,limit:127});
    const prefix=page.nextOffset;assert.ok(prefix!==null);
    let sourceOffset=0;const sourceDigest=createHash('sha256');
    const compareChunk=part=>{
      const bytes=Buffer.from(part.data,'base64');
      assert.ok(bytes.length>0);assert.ok(sourceOffset+bytes.length<=sourceBytes.length);
      assert.deepEqual(bytes,sourceBytes.subarray(sourceOffset,sourceOffset+bytes.length));
      sourceOffset+=bytes.length;sourceDigest.update(bytes);
    };
    compareChunk(page);assert.equal(sourceOffset,prefix);
    await mcp.call('merchant_case_commercial_file_release',{id:recipientId,readId:page.readId});
    page=await mcp.call('merchant_case_commercial_performance_file',{...choice,offset:prefix,limit:16381});
    let pages=2;
    for(;;){compareChunk(page);if(page.nextOffset===null)break;
      page=await mcp.call('merchant_case_commercial_performance_file',{...choice,readId:page.readId,offset:page.nextOffset,limit:16381});pages++;}
    assert.equal(sourceOffset,sourceBytes.length);assert.equal(sourceDigest.digest('hex'),sourceSha256);
    const result={
      schema:'stellar-forge.merchant-performance-customer-result.v1',state:'COMPLETE',completedAt:new Date().toISOString(),
      operationDirectory:output,originalNative:nativeRun,originalCustomer:customerRun,
      originalCaseId:id,recipientCaseId:recipientId,
      recorded:{performanceId:saved.performanceId,sourceId:envelope.id,caseSourceId:performanceSourceId,
        basis:nativeReview.review.basis.kind,quantity:nativeReview.review.basis.quantity,period:nativeReview.review.period,sourceSha256},
      quotes:{measured:{id:measured.id,sha256:measured.sha256},oldRateRevision:{id:sameQuote.id,sha256:sameQuote.sha256,monthlyUsd:'17.1'},
        revisedNativeRate:{id:revised.id,sha256:revised.sha256,monthlyUsd:'16.5',monthlyRequests:'1500',uniformUnitUsd:'0.011'}},
      nativeProposal:{requestId:operation.proposalRequestId,pricingRequestId:operation.proposalPricingRequestId,
        pricingVersion:committed.result.pricing.version,tariffSourceId:targetTariffSourceId},
      customerDocument:customerQuote,report:reportFile,completeSource:sourceFile,
      package:{directory:packageDirectory,manifestSha256:packageResult.caseSource.manifestSha256,files:packageResult.caseSource.files},
      receiving:{completeOriginalSource:true,originalQuoteHistory:true,recipientDraftPreserved:true},
      http:{state:'COMPLETE',explicitLaterMonthlyVolume:'1750',assets},
      mcp:{state:'COMPLETE',prefixBytes:prefix,pages,sha256:sourceSha256},
    };
    const modelMaterials=await modelMaterialPins(model,inputs.usageVersion,committed.result.pricing.version);
    return {result,modelMaterials,caseRevisions:[
      {directory:casesDirectory,id,revision:exportRevision},
      {directory:receivedCases,id:recipientId,revision:receiver.revision},
    ]};
  }finally{await Promise.allSettled([mcp?.close(),reads?.close(),recipientSupport?.close(),support?.close(),tariffController.close()]);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values}=parseArgs({allowPositionals:false,strict:true,options:{
      'native-run':{type:'string'},output:{type:'string'},'customer-run':{type:'string'},python:{type:'string'}}});
    process.stdout.write(json(await runPerformanceCommercial({nativeRun:values['native-run'],output:values.output,
      customerRun:values['customer-run'],python:values.python||'python3'})));
  }catch(error){process.stderr.write(json({error:error.code||'PERFORMANCE_CUSTOMER_OPERATION_FAILED',detail:error.message,stack:error.stack}));process.exitCode=1;}
}
