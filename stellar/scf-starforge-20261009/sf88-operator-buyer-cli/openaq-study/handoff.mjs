// SPDX-License-Identifier: MIT
// Original OpenAQ stage/export -> one source-bound public Dataset handoff.
import {join} from 'node:path';
import {canonical,validateDatasetQuery} from '../dataset-page.mjs';
import {prepareReview} from '../prepare.mjs';
import {configuration,SCHEMA as PROJECT_SCHEMA} from '../../sf30-seller-sdk/openaq/contract.mjs';
import {object,need,path,uuid,hash,member,digest,bytes,parse,read,json,retained,retainJson,
 directory,disjoint,exists,emptyIntake,withOwner,filePin,copyPinned} from './files.mjs';

export const HANDOFF_SCHEMA='stellar-forge.openaq-buyer-handoff.v1';
const same=(a,b)=>canonical(a)===canonical(b);
const sha=value=>digest(Buffer.from(canonical(value)));
const datasetKeys=['schema','baselineSnapshot','contractSha256','rowCount','sourceConfigSha256',
 'csvSha256','sourceSha256','bindingSha256','executionSha256','sourceClosure','description'];
function publicDataset(value){
 return Object.fromEntries(datasetKeys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,structuredClone(value[key])]));
}
export function validateOpenAQHandoff(value){
 need(object(value)&&value.schema===HANDOFF_SCHEMA,'OPENAQ_BUYER_HANDOFF_REQUIRED');
 const {sha256,...body}=value;need(hash(sha256)===sha(body),'OPENAQ_BUYER_HANDOFF_CHANGED');
 hash(value.projectConfigurationSha256);uuid(value.workspaceId);uuid(value.stageRequestId);uuid(value.preparationRequestId);uuid(value.exportRequestId);
 uuid(value.capture?.id);uuid(value.sourceReview?.id);hash(value.capture?.sha256);hash(value.sourceReview?.sha256);
 need(Number.isSafeInteger(value.capture.rows)&&value.capture.rows>=0&&value.sourceReview.decision==='accepted'&&
  value.sourceReview.allowDerivedDelivery===true,'OPENAQ_BUYER_SOURCE_REVIEW_REQUIRED');
 need(object(value.release)&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.release.id??'')&&
  ['NATIVE_X402','CHALLENGE_ONLY'].includes(value.release.mode),'OPENAQ_BUYER_RELEASE_REQUIRED');
 hash(value.release.digest);hash(value.dataset?.baselineSnapshot);hash(value.dataset?.contractSha256);
 need(value.dataset.rowCount===value.capture.rows&&object(value.dataset.description)&&
  value.dataset.description.snapshot===value.dataset.baselineSnapshot&&value.dataset.description.rowCount===value.dataset.rowCount,
 'OPENAQ_BUYER_DATASET_BINDING_CHANGED');
 need(object(value.offer)&&value.offer.resource?.url===value.resource&&Array.isArray(value.offer.accepts)&&value.offer.accepts.length>0&&
  value.offer.extensions?.bazaar?.info?.input?.method==='GET','OPENAQ_BUYER_ORIGINAL_OFFER_REQUIRED');
 const resource=new URL(value.resource);need(resource.protocol==='https:'&&!resource.username&&!resource.password&&!resource.search&&!resource.hash&&
  resource.href===value.resource&&resource.origin===value.release.publicOrigin,'OPENAQ_BUYER_RESOURCE_CHANGED');
 need(object(value.study)&&value.study.file==='study.tgz'&&Number.isSafeInteger(value.study.bytes)&&value.study.bytes>0&&value.study.bytes<=256*1024*1024,
 'OPENAQ_BUYER_STUDY_ARCHIVE_REQUIRED');hash(value.study.sha256);hash(value.study.manifestSha256);
 need(Array.isArray(value.study.files)&&value.study.files.length>0&&value.study.files.length<=9000,'OPENAQ_BUYER_STUDY_FILES_REQUIRED');
 const names=new Set();for(const item of value.study.files){member(item.path);hash(item.sha256);need(!names.has(item.path)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0,'OPENAQ_BUYER_STUDY_FILE_INVALID');names.add(item.path);}
 need(object(value.provenance)&&Array.isArray(value.provenance.sourceFiles)&&value.provenance.sourceFiles.length>0,'OPENAQ_BUYER_PROVENANCE_REQUIRED');
 uuid(value.provenance.publicationRunId);hash(value.provenance.candidateDigest);
 return value;
}
export async function readOpenAQHandoff({directory:root,sha256}){
 root=await directory(path(root));hash(sha256);
 const raw=await read(join(root,'handoff.json'),4*1024*1024);need(digest(raw)===sha256,'OPENAQ_BUYER_HANDOFF_FILE_CHANGED');
 const handoff=validateOpenAQHandoff(parse(raw));await filePin(join(root,'study.tgz'),{maxBytes:256*1024*1024,expected:handoff.study});
 return {directory:root,sha256,bytes:raw.length,handoff,raw};
}
async function originalOperation(project,workspaceId,id,action){
 const value=await json(join(project,'operations',uuid(id)+'.json'),16*1024*1024);
 need(value.schema===PROJECT_SCHEMA+'.operation'&&value.id===id&&value.workspaceId===workspaceId&&
  value.action===action&&value.state==='COMPLETE','OPENAQ_BUYER_ORIGINAL_OPERATION_REQUIRED');
 return value;
}
/** Read-only against the original project/store. The destination owns only this
 * retained handoff and a verification of its already completed study export. */
export async function prepareOpenAQBuyerHandoff({
 projectDirectory,stageRequestId,exportRequestId,expectedReleaseDigest,directory:output,connectionFile,
 environment=process.env,signal,
}={}){
 projectDirectory=await directory(path(projectDirectory));output=path(output);disjoint(projectDirectory,output);
 uuid(stageRequestId);uuid(exportRequestId);hash(expectedReleaseDigest);
 if(connectionFile!==undefined)path(connectionFile);
 return withOwner(output,async()=>{
  const request={schema:HANDOFF_SCHEMA+'.request',projectDirectory,stageRequestId,exportRequestId,expectedReleaseDigest,...(connectionFile?{connectionFile}:{})};
  if(!await exists(join(output,'request.json')))await emptyIntake(output,['lease.lock']);
  await retainJson(join(output,'request.json'),request);
  const settings=await json(join(projectDirectory,'workspace.json'),262144);
  need(settings.schema===PROJECT_SCHEMA&&sha(configuration(settings.configuration))===settings.configurationSha256,'OPENAQ_BUYER_PROJECT_CHANGED');uuid(settings.id);
  if(connectionFile){
   const {readOpenAQConnection,verifyOpenAQConnection}=await import('../../sf30-seller-sdk/openaq/managed.mjs');
   const binding=await readOpenAQConnection(connectionFile);await verifyOpenAQConnection(binding);
   need(binding.workspaceId===settings.id&&binding.configurationSha256===settings.configurationSha256,
    'OPENAQ_BUYER_ORIGINAL_CONNECTION_CHANGED');
  }
  const staged=await originalOperation(projectDirectory,settings.id,stageRequestId,'release.stage');
  const prepared=await originalOperation(projectDirectory,settings.id,staged.input.preparationId,'release.prepare');
  const exported=await originalOperation(projectDirectory,settings.id,exportRequestId,'export');
  const captureId=uuid(prepared.input.captureId),reviewId=uuid(prepared.input.sourceReviewId);
  const capture=await json(join(projectDirectory,'captures',captureId,'capture.json'),16*1024*1024);
  const {captureSha256,...captureBody}=capture;
  need(capture.id===captureId&&capture.schema===PROJECT_SCHEMA+'.capture'&&capture.state==='COMPLETE'&&
   sha(captureBody)===hash(captureSha256),'OPENAQ_BUYER_CAPTURE_CHANGED');
  const review=await json(join(projectDirectory,'reviews',reviewId+'.json'),16*1024*1024);
  need(review.schema===PROJECT_SCHEMA+'.review'&&review.id===reviewId&&review.captureId===captureId&&
   review.captureSha256===captureSha256&&review.decision==='accepted'&&review.allowDerivedDelivery===true,
 'OPENAQ_BUYER_SOURCE_REVIEW_REQUIRED');
  need(exported.input.captureIds?.length===1&&exported.input.captureIds[0]===captureId&&
   exported.input.reviewIds?.length===1&&exported.input.reviewIds[0]===reviewId&&
   exported.result.captureIds?.length===1&&exported.result.captureIds[0]===captureId&&
   exported.result.sourceWorkspaceId===settings.id,'OPENAQ_BUYER_STUDY_FROM_ANOTHER_EDITION');
  const releaseId=staged.result?.id;
  need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(releaseId??'')&&staged.result.digest===expectedReleaseDigest,'OPENAQ_BUYER_SELECTED_RELEASE_CHANGED');
  const releaseRoot=join(projectDirectory,'release-store'),releaseDirectory=join(releaseRoot,'releases',releaseId);
  const [{inspectRelease},{prepareDatasetRelease}]=await Promise.all([
   import('../../sf82-seller-pilot/releases.mjs'),import('../../sf82-seller-pilot/release-dataset.mjs')]);
  const release=await inspectRelease(releaseRoot,releaseId);
  need(release.digest===expectedReleaseDigest&&same(release.dataset,staged.result.dataset)&&
   same(release.dataset,prepared.result.dataset),'OPENAQ_BUYER_SELECTED_RELEASE_CHANGED');
  const original=await prepareDatasetRelease(join(releaseDirectory,'dataset'));
  need(same(original.dataset,release.dataset)&&original.offers.offers.length===1,'OPENAQ_BUYER_DATASET_BINDING_CHANGED');
  const source=parse(original.retained['source.json']);
  need(source.schema==='stellar-forge.frictionless-dataset-source.v1'&&source.candidate?.run===prepared.input.runId&&
   source.candidate.snapshot===release.dataset.baselineSnapshot&&source.candidate.csvSha256===release.dataset.csvSha256&&
   source.publication&&source.review?.candidateDigest===source.candidate.digest,
 'OPENAQ_BUYER_ORIGINAL_PUBLICATION_REQUIRED');
  const captureFilePin={bytes:bytes(capture).length,sha256:digest(bytes(capture))},reviewFilePin={bytes:bytes(review).length,sha256:digest(bytes(review))};
  need(original.sourceFiles.some(x=>x.bytes===captureFilePin.bytes&&x.sha256===captureFilePin.sha256)&&
   original.sourceFiles.some(x=>x.bytes===reviewFilePin.bytes&&x.sha256===reviewFilePin.sha256),'OPENAQ_BUYER_RELEASE_SOURCE_CONTEXT_CHANGED');
  const archiveName='OpenAQ_Project_'+exportRequestId+'.tgz';
  need(exported.result.file===archiveName&&exported.result.schema==='stellar-forge.openaq-project-delivery.v1',
 'OPENAQ_BUYER_COMPLETE_STUDY_EXPORT_REQUIRED');
  let archive=join(projectDirectory,'exports',exportRequestId,archiveName);
  if(connectionFile){
   const {downloadOpenAQProject}=await import('../../sf30-seller-sdk/openaq/download.mjs');
   const receiving=join(output,'.original-download');
   const download=await downloadOpenAQProject({connectionFile,exportId:exportRequestId,directory:receiving,signal});
   need(download.state==='COMPLETE'&&download.workspaceId===settings.id&&download.sourceWorkspaceId===settings.id&&
    download.projectManifestSha256===exported.result.manifestSha256,
   'OPENAQ_BUYER_ORIGINAL_DOWNLOAD_CHANGED');
   archive=join(receiving,archiveName);
  }
  const studyPin=await filePin(archive,{maxBytes:256*1024*1024,expected:exported.result});
  await copyPinned(archive,join(output,'study.tgz'),studyPin,{signal,maxBytes:256*1024*1024});
  const {receiveOpenAQProject}=await import('../../sf30-seller-sdk/openaq/package.mjs');
  const study=await receiveOpenAQProject({archive:join(output,'study.tgz'),sha256:studyPin.sha256,directory:join(output,'.study-validation'),environment,signal});
  need(study.manifest.sourceWorkspaceId===settings.id&&study.manifest.captures.length===1&&
   study.manifest.captures[0].id===captureId&&study.manifest.captures[0].captureSha256===captureSha256&&
   same(study.manifest.reviews,[reviewId])&&
   digest(bytes(study.manifest))===exported.result.manifestSha256,'OPENAQ_BUYER_STUDY_MANIFEST_CHANGED');
  const nativeCapture=await read(join(study.selectedDirectory,'captures',captureId,'capture.json'),16*1024*1024);
  const nativeReview=await read(join(study.selectedDirectory,'reviews',reviewId+'.json'),16*1024*1024);
  need(nativeCapture.equals(bytes(capture))&&nativeReview.equals(bytes(review)),'OPENAQ_BUYER_STUDY_SOURCE_CONTEXT_CHANGED');
  const offer=structuredClone(original.offers.offers[0].seller),resource=offer.resource.url;
  const body={schema:HANDOFF_SCHEMA,workspaceId:settings.id,projectConfigurationSha256:settings.configurationSha256,stageRequestId,preparationRequestId:prepared.id,exportRequestId,
   release:{id:release.id,label:release.label,digest:release.digest,publicOrigin:release.publicOrigin,mode:release.mode,
    facilitator:release.runtime.facilitator??null},resource,offer,dataset:publicDataset(release.dataset),
   capture:{id:captureId,sha256:captureSha256,rows:capture.projection.rows},
   sourceReview:{id:reviewId,sha256:sha(review),decision:review.decision,allowDerivedDelivery:review.allowDerivedDelivery},
   study:{file:'study.tgz',...studyPin,manifestSha256:exported.result.manifestSha256,
    sourceWorkspaceId:study.manifest.sourceWorkspaceId,reports:study.manifest.reports,files:study.manifest.files},
   provenance:{publicationRunId:prepared.input.runId,planId:source.plan.id,candidateDigest:source.candidate.digest,
    captureManifestSha256:source.capture.sha256,sourceFiles:original.sourceFiles,
    publication:source.publication,publisherReview:source.review},
  };
  const handoff=validateOpenAQHandoff({...body,sha256:sha(body)}),raw=bytes(handoff);
  need(raw.length<=4*1024*1024,'OPENAQ_BUYER_HANDOFF_LIMIT');
  // Reread the completed source operations; a concurrent replacement cannot
  // make the published handoff describe a different original stage/export.
  need(same(await originalOperation(projectDirectory,settings.id,stageRequestId,'release.stage'),staged)&&
   same(await originalOperation(projectDirectory,settings.id,exportRequestId,'export'),exported),'OPENAQ_BUYER_ORIGINAL_OPERATION_CHANGED');
  await retained(join(output,'handoff.json'),raw);
  return {schema:HANDOFF_SCHEMA,directory:output,handoffSha256:digest(raw),handoffBytes:raw.length,
   handoff,files:[{name:'handoff.json',bytes:raw.length,sha256:digest(raw)},{name:'study.tgz',...studyPin}]};
 },{create:true});
}
/** Native preparation validates the original advertised requirement and exact
 * concrete GET. It does not load a signer or approve that acquisition. */
export function prepareOpenAQDatasetRequest(handoff,{intentId,acceptIndex,query=''}={}){
 validateOpenAQHandoff(handoff);
 need(typeof query==='string'&&query.length<=8192&&Number.isSafeInteger(acceptIndex)&&acceptIndex>=0,'OPENAQ_BUYER_SELECTION_REQUIRED');
 const url=new URL(handoff.resource);url.search=query;
 const parameters=validateDatasetQuery(url.href,{initial:true});need(!parameters.has('snapshot'),'OPENAQ_BUYER_SNAPSHOT_IS_RETAINED');
 const properties=handoff.offer.extensions?.bazaar?.schema?.properties?.input?.properties?.queryParams?.properties;
 need(object(properties)&&properties.snapshot?.type==='string','OPENAQ_BUYER_SNAPSHOT_NOT_ADVERTISED');
 for(const key of parameters.keys())need(Object.hasOwn(properties,key),'OPENAQ_BUYER_QUERY_NOT_ADVERTISED');
 parameters.set('snapshot',handoff.dataset.baselineSnapshot);url.search=parameters.toString();
 return prepareReview(bytes({resources:[handoff.offer]}),{rowIndex:0,acceptIndex,intentId,method:'GET',url:url.href});
}
