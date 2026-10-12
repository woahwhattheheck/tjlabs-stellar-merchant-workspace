// SPDX-License-Identifier: MIT
// Complete source, native attempts/accounting and typed Dataset output receiving.
import {join} from 'node:path';
import {canonical} from '../dataset-page.mjs';
import {inspectDatasetSession,deliverDatasetSession} from '../dataset-session.mjs';
import {exportDatasetSessionArchive,receiveDatasetSessionArchive} from '../dataset-session-portable.mjs';
import {DatasetDelivery} from '../node/dataset.mjs';
import {receiveOpenAQProject} from '../../sf30-seller-sdk/openaq/package.mjs';
import {CUSTOMER_SCHEMA,withOpenAQBuyer,accountOriginalOpenAQContext} from './customer.mjs';
import {validateOpenAQHandoff} from './handoff.mjs';
import {object,need,path,id,hash,member,digest,bytes,parse,read,json,retained,retainJson,
 directory,disjoint,exists,emptyIntake,withOwner,filePin,copyPinned,parents,signal as checkSignal} from './files.mjs';

export const DELIVERY_SCHEMA='stellar-forge.openaq-buyer-delivery.v1';
const equal=(a,b)=>canonical(a)===canonical(b);
const identity=value=>digest(Buffer.from(canonical(value)));
const OUTPUTS=new Set(['dataset.jsonl','dataset.csv','review.html','manifest.json','semantics.json']);
const fixed=['handoff.json','study.tgz','session.zip','session-export.json','native-session.json',
 'dataset-delivery.json','accounting.json','customer-selection.json','OPERATING.md'];
const sourceSelection=native=>({
 schema:native.schema,sessionId:native.sessionId,configurationSha256:native.configurationSha256,
 expectedSnapshot:native.expectedSnapshot,status:native.status,limits:native.limits,
 capAllocatedAtomic:native.capAllocatedAtomic,completedPages:native.completedPages,
 acquiredRows:native.acquiredRows,totalRows:native.totalRows,snapshot:native.snapshot,
 pages:(native.pages??[]).map(page=>Object.fromEntries(['index','intentId','sha256','bytes','evidenceSha256',
  'snapshot','querySha256','offset','nextOffset','nextCursor','returned','total','semantics'].map(key=>[key,page[key]??null]))),
});
function maximum(value=2*1024**3){
 need(Number.isSafeInteger(value)&&value>0&&value<=16*1024**3,'OPENAQ_BUYER_ARCHIVE_LIMIT');return value;
}
async function mappedDataset(report,target,{verify=true}={}){
 need(object(report)&&object(report.outputs),'OPENAQ_BUYER_ORIGINAL_DELIVERY_REQUIRED');
 await directory(target);
 const selected={...structuredClone(report),directory:target,outputs:{}};
 for(const [name,item] of Object.entries(report.outputs)){
  need(OUTPUTS.has(name)&&object(item)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0,'OPENAQ_BUYER_DATASET_FILE_INVALID');hash(item.sha256);
  selected.outputs[name]={...item,path:join(target,name)};
  if(verify)await filePin(join(target,name),{expected:item});
 }
 const delivery=await DatasetDelivery.open(selected);
 return delivery;
}
function checkedManifest(value){
 need(object(value)&&value.schema===DELIVERY_SCHEMA,'OPENAQ_BUYER_DELIVERY_REQUIRED');
 const {sha256,...body}=value;need(hash(sha256)===identity(body),'OPENAQ_BUYER_DELIVERY_MANIFEST_CHANGED');
 id(value.id);hash(value.requestSha256);hash(value.handoffSha256);
 need(Array.isArray(value.files)&&value.files.length>=fixed.length&&value.files.length<=100,
  'OPENAQ_BUYER_DELIVERY_FILES_REQUIRED');
 const seen=new Set();
 for(const item of value.files){
  member(item.name);hash(item.sha256);
  need(!seen.has(item.name)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=16*1024**3&&
   (fixed.includes(item.name)||item.name.startsWith('dataset/')&&OUTPUTS.has(item.name.slice(8))),
  'OPENAQ_BUYER_DELIVERY_MEMBER_INVALID');seen.add(item.name);
 }
 need(fixed.every(name=>seen.has(name))&&['dataset.jsonl','dataset.csv','review.html','manifest.json']
  .every(name=>seen.has('dataset/'+name)),'OPENAQ_BUYER_DELIVERY_MEMBER_MISSING');
 need(object(value.nativeSession)&&value.nativeSession.status==='COMPLETE'&&object(value.scientificStudy)&&
  object(value.dataset),'OPENAQ_BUYER_DELIVERY_INCOMPLETE');
 return value;
}
async function readDelivery(root,expected,{verify=true,signal}={}){
 root=await directory(path(root));if(expected!==undefined)hash(expected);checkSignal(signal);
 const raw=await read(join(root,'delivery.json'),8*1024*1024);
 if(expected!==undefined)need(digest(raw)===expected,'OPENAQ_BUYER_DELIVERY_FILE_CHANGED');
 const manifest=checkedManifest(parse(raw));
 for(const item of manifest.files){
  checkSignal(signal);
  if(verify)await filePin(join(root,item.name),{expected:item});
 }
 const handoffRaw=await read(join(root,'handoff.json'),4*1024*1024),handoff=validateOpenAQHandoff(parse(handoffRaw));
 const originalSession=await json(join(root,'native-session.json'),16*1024*1024);
 const sessionExport=await json(join(root,'session-export.json'),32*1024*1024);
 const report=await json(join(root,'dataset-delivery.json'),8*1024*1024);
 const accounting=await json(join(root,'accounting.json'),32*1024*1024);
 const selection=await json(join(root,'customer-selection.json'),262144);
 const byName=new Map(manifest.files.map(x=>[x.name,x]));
 need(digest(handoffRaw)===manifest.handoffSha256&&byName.get('handoff.json').sha256===manifest.handoffSha256&&
  byName.get('study.tgz').sha256===handoff.study.sha256&&byName.get('study.tgz').bytes===handoff.study.bytes&&
  equal(manifest.scientificStudy,{capture:handoff.capture,sourceReview:handoff.sourceReview,archive:handoff.study}),
 'OPENAQ_BUYER_DELIVERY_STUDY_CHANGED');
 need(originalSession.status==='COMPLETE'&&originalSession.expectedSnapshot===handoff.dataset.baselineSnapshot&&
  equal(sourceSelection(originalSession),manifest.nativeSession)&&
  sessionExport.schema==='stellar-forge.sf88.dataset-session-archive.v1'&&
  sessionExport.configurationSha256===originalSession.configurationSha256&&
  equal(sourceSelection(sessionExport.inspection),manifest.nativeSession)&&
  sessionExport.archiveSha256===byName.get('session.zip').sha256&&
  sessionExport.archiveBytes===byName.get('session.zip').bytes,
 'OPENAQ_BUYER_DELIVERY_SESSION_CHANGED');
 need(report.nativeStatus?.finalized===true&&report.nativeStatus.snapshot===originalSession.snapshot&&
  report.nativeStatus.rows===originalSession.acquiredRows&&
  equal(manifest.dataset,{snapshot:originalSession.snapshot,rows:originalSession.acquiredRows,outputs:report.outputs}),
 'OPENAQ_BUYER_DELIVERY_OUTPUT_CHANGED');
 for(const [name,item] of Object.entries(report.outputs)){
  need(byName.get('dataset/'+name)?.sha256===item.sha256&&byName.get('dataset/'+name)?.bytes===item.bytes,
  'OPENAQ_BUYER_DELIVERY_OUTPUT_CHANGED');
 }
 need(accounting.schema===CUSTOMER_SCHEMA+'.accounting'&&accounting.requestSha256===manifest.requestSha256&&
  accounting.configurationSha256===originalSession.configurationSha256&&accounting.interrupted===false&&
  selection.requestSha256===manifest.requestSha256&&selection.handoffSha256===manifest.handoffSha256&&
  selection.sessionId===originalSession.sessionId&&selection.configurationSha256===originalSession.configurationSha256,
 'OPENAQ_BUYER_DELIVERY_ACCOUNTING_CHANGED');
 const dataset=await mappedDataset(report,join(root,'dataset'),{verify:false});
 const sourcePages=dataset.manifest.sourcePages;
 need(report.sourceDirectory===originalSession.directory&&Array.isArray(sourcePages)&&
  sourcePages.length===originalSession.pages.length&&sourcePages.every((page,index)=>{
   const original=originalSession.pages[index],previous=originalSession.pages[index-1];
   return page.index===index&&page.intent===original.intentId&&page.sourceSha256===original.sha256&&
    page.evidenceSha256===original.evidenceSha256&&page.rows===original.returned&&
    page.requestedCursor===(previous?.nextCursor??null);
  }),'OPENAQ_BUYER_DELIVERY_PAGE_LINEAGE_CHANGED');
 return {directory:root,manifest,raw,manifestSha256:digest(raw),handoff,originalSession,sessionExport,
  originalDatasetReport:report,dataset,accounting,selection};
}
export async function inspectOpenAQBuyerDelivery({directory,manifestSha256,signal}={}){
 const value=await readDelivery(directory,manifestSha256,{signal});
 return {schema:DELIVERY_SCHEMA,directory:value.directory,manifestSha256:value.manifestSha256,
  manifest:value.manifest,native:value.originalSession,dataset:value.dataset.report,
  accounting:value.accounting,scientificStudy:value.manifest.scientificStudy};
}
function operatingGuide(context,exportId){
 return [
  '# OpenAQ study and original Buyer output','',
  'This complete private delivery contains the original scientific study, its capture/source review and report files, '+
   'the acquired Dataset output, and the original native session with its page attempts and accounting views.','',
  '## Open the delivered work','',
  'Open dataset/review.html for the acquired query and typed output. dataset/dataset.jsonl preserves original scalar types; '+
   'dataset/dataset.csv is the corresponding tabular export. The scientific report is in the original study archive and is '+
   'reopened by the installed receiver. Query filters can make the purchased output a subset of that full source study.','',
  'Use the installed OpenAQ Buyer command with this directory and the exact SHA256 of delivery.json:',
  '',
  '    openaq-buyer receive --source /ABS/DELIVERY --sha256 MANIFEST_FILE_SHA256 --dir /ABS/RECEIVED --id RECEIVING_ID',
  '    openaq-buyer reopen --dir /ABS/RECEIVED','',
  'The receiver verifies every declared member and calls the original SF88 Dataset archive receiver and OpenAQ project receiver. '+
   'It does not start a page, contact OpenAQ, sign or purchase. It retains source bytes under files/, the native session under session/, '+
   'and the original editable scientific source under study/selected/. Import that original study.tgz with the maintained OpenAQ '+
   'workspace import action to continue the scientific project; capture/review/report identities remain original.','',
  '## Original selection','',
  '- Export: '+exportId,
  '- Buyer request: '+context.request.intentId,
  '- Configuration: '+context.configuration.configurationSha256,
  '- Capture: '+context.handoff.capture.id,
  '- Source review: '+context.handoff.sourceReview.id,
  '- Release: '+context.handoff.release.id+' / '+context.handoff.release.digest,
  '- Snapshot: '+context.handoff.dataset.baselineSnapshot,
  '- Concrete request: '+context.config.operation.url,'',
  'accounting.json retains all original accounting pages. A page cap is an allocation, not a charge. Native SF36 ledger/finality '+
   'remains authoritative; the saved view labels unresolved outcomes. Offline receiving validates retained native records and output, '+
   'and does not assert a new live-chain observation. The original account owner can explicitly finalize on its existing workspace.','',
  '## Source interpretation','',
  'Keep the source review, attribution, license context and original measurement units with the data. Capture time, measurement period, '+
   'source timezone and unknown quality/coverage fields are separate. Receiving or buying this historical study does not turn it into '+
   'another location, a fresh sensor capture, regulatory acceptance or a NAPS certification.','',
  'The session archive contains private operational evidence and local source paths. Share this complete private handover with its intended '+
   'recipient; keep the existing operator keys, approval environment and signing custody on their original host.','',
 ].join('\n');
}
/** Export the existing COMPLETE acquisition. Every native engine retains its own
 * output/recovery protocol; this wrapper binds the two original archives and all
 * output files into one checked directory. */
export async function exportOpenAQBuyerDelivery({directory:root,destination,exportId,
 python='python3',maxBytes,environment=process.env,signal}={}){
 root=path(root);destination=path(destination);id(exportId);disjoint(root,destination);
 const archiveLimit=maximum(maxBytes);checkSignal(signal);
 return withOpenAQBuyer(root,context=>withOwner(destination,async()=>{
  const selection={schema:DELIVERY_SCHEMA+'.export',directory:root,requestSha256:context.requestSha256,
   destination,exportId,archiveLimit};
  if(!await exists(join(destination,'export-request.json')))await emptyIntake(destination,['lease.lock']);
  await retainJson(join(destination,'export-request.json'),selection);
  if(await exists(join(destination,'delivery.json'))){
   const saved=await readDelivery(destination,undefined,{signal});
   need(saved.manifest.id===exportId&&saved.manifest.requestSha256===context.requestSha256,'OPENAQ_BUYER_EXPORT_SELECTION_CHANGED');
   return {schema:DELIVERY_SCHEMA,state:'EXPORTED',reopened:true,directory:destination,
    manifestSha256:saved.manifestSha256,manifest:saved.manifest};
  }
  const native=await inspectDatasetSession(context.sessionDirectory);
  need(native.status==='COMPLETE'&&native.expectedSnapshot===context.handoff.dataset.baselineSnapshot,
   'OPENAQ_BUYER_COMPLETE_ACQUISITION_REQUIRED');
  await retained(join(destination,'handoff.json'),context.handoffRaw);
  await copyPinned(join(context.handoffDirectory,'study.tgz'),join(destination,'study.tgz'),context.handoff.study,{signal,maxBytes:256*1024*1024});
  await retainJson(join(destination,'native-session.json'),native);
  await retainJson(join(destination,'customer-selection.json'),{
   schema:CUSTOMER_SCHEMA+'.delivery-selection',requestSha256:context.requestSha256,
   handoffSha256:context.request.handoffSha256,sessionId:context.request.intentId,
   configurationSha256:context.configuration.configurationSha256,
   query:context.config.operation.url,terms:context.config.operation.expect,limits:context.request.limits,
   operatorDirectory:context.request.operatorDirectory,sessionDirectory:context.sessionDirectory});
  const accountingPath=join(destination,'accounting.json');
  let accounting;
  if(await exists(accountingPath))accounting=await json(accountingPath,32*1024*1024);
  else{
   accounting=await accountOriginalOpenAQContext(context,{signal});
   need(!accounting.interrupted,'OPENAQ_BUYER_EXPORT_INTERRUPTED');
   await retainJson(accountingPath,accounting);
  }
  need(accounting.requestSha256===context.requestSha256&&accounting.configurationSha256===native.configurationSha256,
   'OPENAQ_BUYER_ACCOUNTING_CHANGED');
  const reportPath=join(destination,'dataset-delivery.json'),datasetDirectory=join(destination,'dataset');
  let report;
  if(await exists(reportPath))report=await json(reportPath,8*1024*1024);
  else{
   report=await deliverDatasetSession(context.sessionDirectory,datasetDirectory);
   await retainJson(reportPath,report);
  }
  await mappedDataset(report,datasetDirectory);
  need(report.nativeStatus.snapshot===native.snapshot&&report.nativeStatus.rows===native.acquiredRows,
   'OPENAQ_BUYER_NATIVE_OUTPUT_CHANGED');
  const archivePath=join(destination,'session.zip'),archiveResultPath=join(destination,'session-export.json');
  let archiveResult;
  if(await exists(archiveResultPath))archiveResult=await json(archiveResultPath,32*1024*1024);
  else{
   archiveResult=await exportDatasetSessionArchive({directory:context.sessionDirectory,archive:archivePath,
    operation:'openaq-'+identity({request:context.requestSha256,exportId}),python,maxBytes:archiveLimit,signal});
   await retainJson(archiveResultPath,archiveResult);
  }
  need(archiveResult.configurationSha256===native.configurationSha256&&
   equal(sourceSelection(archiveResult.inspection),sourceSelection(native)),'OPENAQ_BUYER_ARCHIVE_SOURCE_CHANGED');
  await filePin(archivePath,{maxBytes:archiveLimit,expected:{bytes:archiveResult.archiveBytes,sha256:archiveResult.archiveSha256}});
  await retained(join(destination,'OPERATING.md'),Buffer.from(operatingGuide(context,exportId)));
  const names=[...fixed,...Object.keys(report.outputs).map(name=>'dataset/'+name)].sort(),members=[];
  for(const name of names){checkSignal(signal);members.push({name,...await filePin(join(destination,name))});}
  need(equal(sourceSelection(await inspectDatasetSession(context.sessionDirectory)),sourceSelection(native)),
   'OPENAQ_BUYER_SESSION_CHANGED_DURING_EXPORT');
  const body={schema:DELIVERY_SCHEMA,id:exportId,requestSha256:context.requestSha256,
   handoffSha256:context.request.handoffSha256,nativeSession:sourceSelection(native),
   scientificStudy:{capture:context.handoff.capture,sourceReview:context.handoff.sourceReview,archive:context.handoff.study},
   dataset:{snapshot:native.snapshot,rows:native.acquiredRows,outputs:report.outputs},
   files:members};
  const manifest=checkedManifest({...body,sha256:identity(body)}),raw=bytes(manifest);
  await retained(join(destination,'delivery.json'),raw);
  return {schema:DELIVERY_SCHEMA,state:'EXPORTED',directory:destination,
   manifestSha256:digest(raw),manifest};
 },{create:true}));
}
function studyMatches(value,manifest,handoff){
 need(value.bundleSha256===handoff.study.sha256&&value.manifest.sourceWorkspaceId===handoff.workspaceId&&
  digest(bytes(value.manifest))===handoff.study.manifestSha256&&
  equal(value.manifest.files,handoff.study.files)&&equal(value.manifest.captures,[{id:handoff.capture.id,captureSha256:handoff.capture.sha256}])&&
  equal(value.manifest.reviews,[handoff.sourceReview.id]),'OPENAQ_BUYER_RECEIVED_STUDY_CHANGED');
}
/** Whole receiving is offline. It uses the original archive engines and leaves
 * every operation/payment/source identity unchanged. */
export async function receiveOpenAQBuyerDelivery({sourceDirectory,manifestSha256,directory:target,receivingId,
 python='python3',maxBytes,environment=process.env,signal}={}){
 sourceDirectory=path(sourceDirectory);target=path(target);disjoint(sourceDirectory,target);
 hash(manifestSha256);id(receivingId);const archiveLimit=maximum(maxBytes);checkSignal(signal);
 return withOwner(target,async()=>{
  const request={schema:DELIVERY_SCHEMA+'.receive',sourceDirectory,directory:target,manifestSha256,receivingId,archiveLimit};
  if(!await exists(join(target,'receiving.json')))await emptyIntake(target,['lease.lock']);
  await retainJson(join(target,'receiving.json'),request);
  const files=join(target,'files');await directory(files,{create:true});
  let source;
  if(await exists(join(files,'delivery.json')))source=await readDelivery(files,manifestSha256,{signal});
  else{
   source=await readDelivery(sourceDirectory,manifestSha256,{signal});
   for(const item of source.manifest.files){
    const to=await parents(files,item.name);
    await copyPinned(join(source.directory,item.name),to,item,{signal});
   }
   await retained(join(files,'delivery.json'),source.raw);
   // Each member was just verified during its exact copy. The native receivers
   // below verify complete archive membership and original semantic identities.
   source=await readDelivery(files,manifestSha256,{verify:false,signal});
  }
  const original=source.originalSession;
  need(source.sessionExport.archiveBytes<=archiveLimit,'OPENAQ_BUYER_ARCHIVE_LIMIT');
  const session=await receiveDatasetSessionArchive({archive:join(files,'session.zip'),directory:join(target,'session'),
   expectedSha256:source.sessionExport.archiveSha256,operation:'openaq-'+identity({receivingId,manifestSha256}),
   python,maxBytes:archiveLimit,signal});
  need(equal(sourceSelection(session.session),sourceSelection(original)),'OPENAQ_BUYER_RECEIVED_SESSION_CHANGED');
  const study=await receiveOpenAQProject({archive:join(files,'study.tgz'),sha256:source.handoff.study.sha256,
   directory:join(target,'study'),environment,signal});
  studyMatches(study,source.manifest,source.handoff);
  const dataset=await mappedDataset(source.originalDatasetReport,join(files,'dataset'));
  const result={schema:DELIVERY_SCHEMA,state:'RECEIVED',directory:target,receivingId,manifestSha256,
   requestSha256:source.manifest.requestSha256,files:source.manifest.files,
   session,study,dataset:dataset.report,accounting:source.accounting,
   originalDatasetReport:join(files,'dataset-delivery.json'),manifestFile:join(files,'delivery.json')};
  // Keep the first complete receiving record. Later native reopen may contain
  // its own harmless reopened flags; those do not rewrite the original receipt.
  if(!await exists(join(target,'received.json')))await retainJson(join(target,'received.json'),result);
  else{
   const previous=await json(join(target,'received.json'),32*1024*1024);
   need(previous.schema===DELIVERY_SCHEMA&&previous.manifestSha256===manifestSha256&&previous.receivingId===receivingId&&
    previous.requestSha256===result.requestSha256,'OPENAQ_BUYER_RECEIVING_CHANGED');
  }
  return result;
 },{create:true});
}
export async function reopenOpenAQBuyerDelivery({directory:target,python='python3',environment=process.env,signal}={}){
 target=await directory(path(target));
 const request=await json(join(target,'receiving.json'),262144);
 need(request.schema===DELIVERY_SCHEMA+'.receive'&&request.directory===target,'OPENAQ_BUYER_RECEIVING_CHANGED');
 return receiveOpenAQBuyerDelivery({...request,receivingId:request.receivingId,maxBytes:request.archiveLimit,python,environment,signal});
}
/** Typed offline output access after complete received-byte verification. */
export async function openOpenAQBuyerDataset({directory:target,manifestSha256,signal}={}){
 const source=await readDelivery(target,manifestSha256,{signal});
 return source.dataset;
}
