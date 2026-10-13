// SPDX-License-Identifier: MIT
/** Retained following editions inside the original Econdb Source Desk lease. */
import {join,resolve} from 'node:path';
import {operationLease} from '../../../../scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {reopenEcondbInstallation} from './prepare.mjs';
import {openEcondbTransfer,inspectEcondbInstallationSource} from './source.mjs';
import {compareEcondbFollowing as comparePure,econdbFollowingTemplate as templatePure,prepareEcondbFollowing as preparePure,nativeEcondbFollowingInput as nativePure} from '../econdb-installation-following.mjs';
import {ECONDB_INSTALLATION_SCHEMA as SCHEMA} from '../econdb-installation-core.mjs';
import {need,ordinary,same,canonical,json,parse,hash,directory,parent,identity,read,optional,retain,copy} from './io.mjs';
const model=fn=>{try{return fn();}catch(error){throw Object.assign(new Error(String(error.message)),{code:'ECONDB_SOURCE_DESK_INPUT',status:422,cause:error});}};
const compareEcondbFollowing=input=>model(()=>comparePure(input));
const econdbFollowingTemplate=input=>model(()=>templatePure(input));
const prepareEcondbFollowing=input=>model(()=>preparePure(input));
const nativeEcondbFollowingInput=(value,input)=>model(()=>nativePure(value,input));
const MAX=64*1024*1024,HASH=/^[a-f0-9]{64}$/;
const outputNames=['ECONDB_FOLLOWING_COMPARISON.json','ECONDB_FOLLOWING_REVIEW.json','ECONDB_FOLLOWING.json',
 'ECONDB_FOLLOWING_NATIVE_INPUT.json','ECONDB_CUSTOMER_SOURCE.json','ECONDB_SOURCE_SELECTION.json',
 'installation-input.json','installation-preview-input.json','WORKORDER.md','ECONDB_FOLLOWING.html'];
const commercialNames=['commercial.json','COMMERCIAL.md','commercial.html'];
const entry=(name,raw)=>({name,bytes:raw.length,sha256:hash(raw)});
async function put(root,name,raw){need(raw.length<=MAX,'Retain the complete following JSON/text within 64 MiB.');
 await retain(await parent(root,name),raw);return entry(name,raw);}
async function copied(root,name,source,expected,signal){await copy(source,await parent(root,name),expected,{signal});return{name,...expected};}
async function verified(root,item,signal){need(ordinary(item.name)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0&&HASH.test(item.sha256??''),
 'Keep every complete original following member.');need(same(await identity(join(root,item.name),{signal}),{bytes:item.bytes,sha256:item.sha256}),
 'A retained following member changed: '+item.name,409);}
function outputs(value,input,comparison,reviewRaw){
 const native=nativeEcondbFollowingInput(value,{...input,reviewRaw:Buffer.from(reviewRaw)});
 return [json(comparison),Buffer.from(reviewRaw),json(value.following),json(native),json(value.source),json(value.scope),
  json(value.prepared.document),json(value.prepared.preview),Buffer.from(value.workorder),Buffer.from(value.html)];
}
async function sourceAt(root,request,signal,leaseFds){
 return inspectEcondbInstallationSource({archivePath:join(root,'source/econdb-workspace.zip'),
 expectedArchiveSha256:request.archiveSha256,expectedArchiveBytes:request.archiveBytes,
 directory:join(root,'retained-transfer'),projectId:request.projectId,projectRevision:request.projectRevision,
 expectedInputSha256:request.inputSha256,observedAt:request.observedAt,signal,leaseFds});
}
async function actualLineage(transferDirectory,before,after,signal,leaseFds,archivePath){
 const current=await openEcondbTransfer({archivePath,expectedArchiveSha256:after.archive.sha256,expectedArchiveBytes:after.archive.bytes,
 directory:transferDirectory,signal,leaseFds});
 const previousRecord=current.status.records.find(r=>same(r,before.project.record));
 need(previousRecord,'The later original workspace does not retain the actual prior project record.',409);
 return{workspaceId:current.manifest.workspaceId,previousRecord};
}
async function restoredInput(root,request,signal,leaseFds){
 const raw=await read(join(root,'source/following-input.json'),MAX),saved=parse(raw);
 const prior=await reopenEcondbAnyPreparation({directory:join(root,'prior'),signal,leaseFds});
 need(prior.preparationSha256===saved.priorPreparation.preparationSha256&&same(prior.source,saved.before)&&
 same(prior.document,saved.priorPreparation.document)&&same(prior.installationSource,saved.priorPreparation.installationSource)&&
 same({...prior,directory:saved.priorPreparation.directory},saved.priorPreparation),
 'The complete prior preparation differs from the retained comparison baseline.',409);
 need(same(parse(await read(join(root,'prior','commercial.json'),MAX)),saved.commercial),'Retain the complete original commercial source.',409);
 const inspected=await sourceAt(root,request,signal,leaseFds);
 need(same(inspected.source,saved.after),'The complete later source differs from the retained comparison.',409);
 const lineage=await actualLineage(inspected.transferDirectory,saved.before,saved.after,signal,leaseFds,join(root,'source/econdb-workspace.zip'));
 need(same(lineage,saved.lineage),'The actual original project ancestry changed.',409);
 return{input:saved,inspected};
}
async function reopenFollowing(root,done,signal,leaseFds){
 const requestRaw=await read(join(root,'prepare-request.json'),MAX),request=parse(requestRaw);
 need(request.schema===SCHEMA+'.following-request'&&done.schema===SCHEMA&&done.state==='PREPARED'&&done.following&&
 done.requestSha256===hash(requestRaw)&&same(done.inputs,request.inputs),'Keep the original complete following preparation.',409);
 for(const f of [...done.inputs,...done.outputs])await verified(root,f,signal);
 const {input,inspected}=await restoredInput(root,request,signal,leaseFds);
 const comparison=compareEcondbFollowing(input),reviewRaw=await read(join(root,'source/following-review.json'),MAX);
 const composed=prepareEcondbFollowing({...input,reviewRaw:Buffer.from(reviewRaw)});
 const bodies=outputs(composed,input,comparison,reviewRaw),names=['source/operator-transfer.json',
  ...inspected.source.files.map(f=>'delivery/files/'+f.name),...outputNames,...commercialNames];
 need(same(done.outputs.map(f=>f.name),names)&&same(done.following,composed.following)&&
 same(done.installationSource,composed.prepared.source)&&same(done.selections,composed.prepared.selections)&&
 done.workshareCaseId===composed.prepared.workshareCaseId,'The complete following output differs from its original decision.',409);
 for(let i=0;i<outputNames.length;i++)need((await read(join(root,outputNames[i]),MAX)).equals(bodies[i]),
  'The retained following output differs: '+outputNames[i],409);
 for(const name of commercialNames)need((await read(join(root,name),MAX)).equals(await read(join(root,'prior',name),MAX)),
  'The complete original commercial source changed: '+name,409);
 const completeRaw=await read(join(root,'preparation.json'),MAX);
 return{...done,directory:root,preparationSha256:hash(completeRaw),preparationBytes:completeRaw.length,
  source:composed.source,completeSource:composed.source,document:composed.prepared.document,preview:composed.prepared.preview};
}
export async function reopenEcondbAnyPreparation(options={}){
 const root=resolve(options.directory),raw=await read(join(root,'preparation.json'),MAX),done=parse(raw);
 if(!done.following)return reopenEcondbInstallation(options);
 const lease=await operationLease(join(root,'econdb-preparation.lock'));
 try{return await reopenFollowing(root,done,options.signal,[...(options.leaseFds??[]),lease.fd]);}finally{await lease.close();}
}
async function prepareFollowing(options){
 const {signal,input,reviewRaw,comparison,prior,inspected,archive,nativeSnapshotRaw}=options;
 const root=await directory(resolve(options.directory)),lease=await operationLease(join(root,'econdb-preparation.lock'));
 const leaseFds=[...(options.leaseFds??[]),lease.fd];
 try{
  const completed=await optional(join(root,'preparation.json'),MAX);
  if(completed)return reopenFollowing(root,parse(completed),signal,leaseFds);
  const inputs=[],seen=new Set();
  // Every previous source and output, including all previous large sidecars, remains complete.
  for(const member of [...prior.inputs,...prior.outputs,{name:'prepare-request.json'},{name:'preparation.json'}]){
   if(seen.has(member.name))continue;seen.add(member.name);need(ordinary(member.name),'Retain complete prior preparation paths.');
   const path=join(prior.directory,member.name),expected=await identity(path,{signal});
   if(member.sha256)need(member.sha256===expected.sha256&&member.bytes===expected.bytes,'The prior source changed.',409);
   inputs.push(await copied(root,'prior/'+member.name,path,expected,signal));
  }
  inputs.push(await copied(root,'source/econdb-workspace.zip',archive.path,{bytes:archive.descriptor.bytes,sha256:archive.descriptor.sha256},signal));
  inputs.push(await put(root,'source/following-input.json',json(input)));
  inputs.push(await put(root,'source/following-review.json',reviewRaw));
  inputs.push(await put(root,'source/native-snapshot.json',nativeSnapshotRaw));
  const request={schema:SCHEMA+'.following-request',inputs,archiveSha256:input.after.archive.sha256,archiveBytes:input.after.archive.bytes,
   projectId:input.after.project.record.id,projectRevision:input.after.project.record.revision,
   inputSha256:input.after.project.inputSha256,observedAt:input.after.observedAt};
  const requestRaw=json(request);await put(root,'prepare-request.json',requestRaw);
  const composed=prepareEcondbFollowing({...input,reviewRaw:Buffer.from(reviewRaw)});
  const output=[await copied(root,'source/operator-transfer.json',inspected.transferManifestPath,
   {bytes:input.after.transferManifest.bytes,sha256:input.after.transferManifest.sha256},signal)];
  for(const f of inspected.files)output.push(await copied(root,'delivery/files/'+f.name,f.path,{bytes:f.bytes,sha256:f.sha256},signal));
  const bodies=outputs(composed,input,comparison,reviewRaw);
  need(bodies[6].length<=128*1024,'The complete following Installation exceeds its original native 128 KiB capacity.');
  for(let i=0;i<outputNames.length;i++)output.push(await put(root,outputNames[i],bodies[i]));
  for(const name of commercialNames){const from=join(prior.directory,name),expected=await identity(from,{signal});
   output.push(await copied(root,name,from,expected,signal));}
  const done={schema:SCHEMA,state:'PREPARED',requestSha256:hash(requestRaw),workspaceId:input.after.workspace.id,
   archiveSha256:request.archiveSha256,projectId:request.projectId,projectRevision:request.projectRevision,inputSha256:request.inputSha256,
   inputs,outputs:output,workshareCaseId:composed.prepared.workshareCaseId,installationSource:composed.prepared.source,
   selections:composed.prepared.selections,following:composed.following};
  await put(root,'preparation.json',json(done));return reopenFollowing(root,done,signal,leaseFds);
 }finally{await lease.close();}
}
export function createEcondbFollowingService(p){
 const {root,signal,transaction,get,inspection,selected,jsonInput,retainFile,retainPath,result,uuid,id}=p;
 async function preparation({requestId},leaseFds=[]){
  const prior=await get(uuid(requestId));need(prior.status==='COMPLETE'&&['prepare','following-prepare'].includes(prior.type),
   'Select an actual completed original or following preparation.');
  const expected=join(root,'requests',requestId,'preparation');
  need(prior.readyReceiving?.preparationDirectory===expected,'Keep the original service-owned preparation directory.',409);
  const value=await reopenEcondbAnyPreparation({directory:expected,signal,leaseFds});
  need(value.preparationSha256===prior.preparationSha256,'The prior complete preparation changed.',409);return value;
 }
 async function native(input){
  need(typeof input.nativeSnapshotPath==='string'&&input.nativeSnapshotPath===resolve(input.nativeSnapshotPath)&&HASH.test(input.nativeSnapshotSha256??''),
   'Use the complete native-owned Installation snapshot.');
  const raw=await read(input.nativeSnapshotPath,MAX);need(hash(raw)===input.nativeSnapshotSha256,'The native captured source differs.',409);
  const value=parse(raw);need(value.schema==='stellar-forge.econdb-following-native-snapshot.v1'&&value.nativeCaseId===input.nativeCaseId,
   'Keep the exact actual native customer case.');return{raw,value};
 }
 async function inputs(request,leaseFds){
  const prior=await preparation({requestId:request.priorPreparationId},leaseFds),after=await inspection(request.inspectionId);
  const captured=await native(request),archive=await selected(after.archiveId,'archive');
  const inspected=await inspectEcondbInstallationSource({archivePath:archive.path,expectedArchiveSha256:archive.descriptor.sha256,
   expectedArchiveBytes:archive.descriptor.bytes,directory:join(root,'transfers',archive.descriptor.sha256),
   projectId:after.source.project.record.id,projectRevision:after.source.project.record.revision,
   expectedInputSha256:after.source.project.inputSha256,observedAt:after.source.observedAt,signal,leaseFds});
  need(same(inspected.source,after.source),'The full new inspection changed.',409);
  const lineage=await actualLineage(inspected.transferDirectory,prior.source,after.source,signal,leaseFds,archive.path);
  const commercialRaw=await read(join(prior.directory,'commercial.json'),MAX),commercial=parse(commercialRaw);
  const input={commercial,before:prior.source,after:after.source,priorPreparation:prior,priorInstallation:captured.value.priorInstallation,
   installation:captured.value.installation,caseValue:captured.value.caseValue,lineage};
  return{input,prior,after,inspected,archive,nativeSnapshotRaw:captured.raw};
 }
 const requestBase=(type,v)=>({schema:p.schema+'.request',type,requestId:uuid(v.requestId),nativeCaseId:v.nativeCaseId,
  nativeSnapshotPath:v.nativeSnapshotPath,nativeSnapshotSha256:v.nativeSnapshotSha256});
 async function compare(v){
  const request={...requestBase('following-compare',v),priorPreparationId:uuid(v.priorPreparationId),inspectionId:uuid(v.inspectionId)};
  return transaction(request,async(folder,leaseFds)=>{
   const captured=await inputs(request,leaseFds),comparison=compareEcondbFollowing(captured.input),{review}=econdbFollowingTemplate(captured.input);
   await retain(join(folder,'native-snapshot.json'),captured.nativeSnapshotRaw);
   const files=[await retainFile('preparation','ECONDB_FOLLOWING_NATIVE_SNAPSHOT.json',captured.nativeSnapshotRaw),
    await retainFile('report','ECONDB_FOLLOWING_COMPARISON.json',json(comparison)),
    await retainFile('review','ECONDB_FOLLOWING_REVIEW.json',json(review)),
    await retainFile('preparation','ECONDB_FOLLOWING_INPUT.json',json(captured.input))];
   return result('following-compare',request.requestId,files,{comparisonId:request.requestId,
    priorPreparationId:request.priorPreparationId,inspectionId:request.inspectionId,nativeCaseId:request.nativeCaseId,
    nativeSnapshotSha256:request.nativeSnapshotSha256,comparison,review});
  });
 }
 async function prepare(v){
  const request={...requestBase('following-prepare',v),comparisonId:uuid(v.comparisonId),reviewId:id(v.reviewId)};
  return transaction(request,async(folder,leaseFds)=>{
   const original=await get(request.comparisonId);need(original.status==='COMPLETE'&&original.type==='following-compare'&&
    original.nativeCaseId===request.nativeCaseId,'Select the original complete following comparison.');
   const captured=await inputs({...request,priorPreparationId:original.priorPreparationId,inspectionId:original.inspectionId},leaseFds);
   const comparison=compareEcondbFollowing(captured.input);need(same(comparison,original.comparison),
    'The case, saved Installation or source changed. Keep this review and create a new explicit comparison.',409);
   const review=await jsonInput(request.reviewId,'review');await retain(join(folder,'native-snapshot.json'),captured.nativeSnapshotRaw);
   const prepared=await prepareFollowing({...captured,directory:join(folder,'preparation'),comparison,reviewRaw:review.raw,signal,leaseFds});
   const files=[],seen=new Set();
   for(const item of [...prepared.inputs,...prepared.outputs,{name:'prepare-request.json'},{name:'preparation.json'}]){
    if(seen.has(item.name))continue;seen.add(item.name);
    const path=join(prepared.directory,item.name),expected=await identity(path,{signal});
    const kind=item.name.endsWith('.zip')?'archive':item.name==='installation-input.json'?'installation':
     item.name==='installation-preview-input.json'?'preview':item.name==='WORKORDER.md'?'workorder':
     item.name.startsWith('delivery/files/')||item.name.startsWith('prior/')?'source':'preparation';
    files.push(await retainPath(kind,item.name,path,expected));
   }
   return result('following-prepare',request.requestId,files,{comparisonId:request.comparisonId,reviewId:request.reviewId,
    priorPreparationId:original.priorPreparationId,inspectionId:original.inspectionId,nativeCaseId:request.nativeCaseId,
    nativeSnapshotSha256:request.nativeSnapshotSha256,archiveId:captured.after.archiveId,archive:prepared.source.archive,
    source:prepared.source,following:prepared.following,workshareCaseId:prepared.workshareCaseId,
    preparationSha256:prepared.preparationSha256,readyReceiving:{preparationDirectory:prepared.directory,expectedPreparationSha256:prepared.preparationSha256},
    installation:{source:prepared.installationSource,workshareCaseId:prepared.workshareCaseId,document:prepared.document,
     preview:prepared.preview,selections:prepared.selections},selections:prepared.selections});
  });
 }
 return{preparation,followingCompare:compare,followingPrepare:prepare};
}
