// MIT. Reviewed CouchDB provenance joins the original SF82 dataset lifecycle.
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { DATASET_BINDING_SCHEMA, DATASET_SOURCE_FILE_LIMITS, datasetContractSha256, prepareDatasetRelease } from '../../sf82-seller-pilot/release-dataset.mjs';
import { buildDatasetSellerConfig } from '../dataset-cli.mjs';
import { DATASET_SNAPSHOT_PARAMETER } from '../dataset-refresh/versions.mjs';
import { readCouchdbCapture, cloneCouchdbCapture } from './capture.mjs';
import { readCouchdbSourceFile } from './declaration.mjs';
import { reviewedCouchdbDocuments } from './source.mjs';
import { object, only, need, HASH, UUID, bytes, digest, identity, readPrivate, readJson, privateDirectory, acquireWorkspace, retain, retainJSON, syncDirectory } from './common.mjs';
export const COUCHDB_DEPLOYMENT_SCHEMA='stellar-forge.couchdb-dataset-deployment.v1';
const MIB=1048576;
const same=(a,b)=>identity(a)===identity(b);
const decode=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
function overlaps(a,b){
  const within=(root,path)=>{const rest=relative(root,path);return !rest||!isAbsolute(rest)&&rest!=='..'&&!rest.startsWith('..'+sep);};
  return within(a,b)||within(b,a);
}
function publication(publisher,runId){
  need(publisher?.settings?.schema==='stellar-forge.couchdb-publisher-workspace.v1','COUCHDB_DEPLOYMENT_PUBLISHER_REQUIRED');
  const run=publisher.run(runId),plan=publisher.plan(run.plan),candidate=run.data.candidate,review=run.data.review,published=run.data.publication;
  need(run.state==='PUBLISHED'&&candidate?.schema==='stellar-forge.couchdb-dataset-candidate.v1'&&review&&published,'COUCHDB_PUBLISHED_CANDIDATE_REQUIRED');
  need(review.candidateDigest===candidate.candidateDigest&&published.snapshot===candidate.dataset.snapshot&&candidate.planDigest===plan.data.digest&&candidate.sourceHash===plan.data.sourceHash,'COUCHDB_PUBLICATION_CHANGED');
  return {run,plan,candidate,review,published};
}
function selectedTerms(input){
  only(input,['origin','path','payment'],'COUCHDB_DEPLOYMENT_TERMS_REQUIRED');
  need(typeof input.origin==='string'&&typeof input.path==='string'&&object(input.payment),'COUCHDB_DEPLOYMENT_TERMS_REQUIRED');
  return structuredClone(input);
}
async function reviewedInput({publisher,runId,terms}){
  const selected=publication(publisher,runId),checked=await publisher.candidate(runId);
  need(checked.manifest.candidateDigest===selected.candidate.candidateDigest,'COUCHDB_PUBLICATION_CHANGED');
  const planRoot=join(publisher.directory,'plans',selected.plan.folder),runtime=await readCouchdbSourceFile(join(planRoot,'source.json'));
  const capture=await readCouchdbCapture(runtime.captureFile,runtime.config.capture.sha256);
  need(capture.manifestSha256===selected.plan.data.retainedCapture?.manifestSha256&&runtime.hash===selected.plan.data.runtimeSourceHash,'COUCHDB_PUBLICATION_CAPTURE_CHANGED');
  const query=runtime.queries[selected.plan.data.query],selection=reviewedCouchdbDocuments(capture,query);
  need(identity(query)===selected.plan.data.runtimeQueryHash&&checked.manifest.extraction.publicSelection?.querySha256===identity(query)&&
    checked.manifest.extraction.observation?.manifestSha256===capture.manifestSha256&&checked.manifest.dataset.rowCount===selection.counts.activeDocuments,'COUCHDB_PUBLICATION_SELECTION_CHANGED');
  const originalConfig=await readPrivate(checked.configPath,MIB);
  need(digest(originalConfig)===checked.manifest.configHash,'COUCHDB_PUBLICATION_CONFIG_CHANGED');
  const configBytes=bytes({...decode(originalConfig),file:'dataset.csv'});
  const merchant=await buildDatasetSellerConfig({describe:()=>structuredClone(checked.manifest.dataset)},selectedTerms(terms));
  merchant.routes[0].definition.queryParameters.push({...DATASET_SNAPSHOT_PARAMETER});
  const merchantBytes=bytes(merchant);
  const originalSource=await readPrivate(join(planRoot,'original-source.json'),262144),planBytes=await readPrivate(join(planRoot,'plan.json'),262144);
  need(digest(originalSource)===selected.plan.data.sourceHash&&same(decode(planBytes),selected.plan.data),'COUCHDB_PUBLICATION_SOURCE_CHANGED');
  const extras=[
    {path:'couchdb-source.json',raw:runtime.original},
    {path:'couchdb-original-source.json',raw:originalSource},
    {path:'couchdb-plan.json',raw:planBytes},
  ];
  const sourceFiles=[...capture.manifest.files.map(file=>({...file,path:'capture/'+file.path})),
    {path:'capture/capture.json',bytes:capture.manifestBytes.length,sha256:capture.manifestSha256},
    ...extras.map(({path,raw})=>({path,bytes:raw.length,sha256:digest(raw)}))].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  need(sourceFiles.length<=DATASET_SOURCE_FILE_LIMITS.files&&sourceFiles.reduce((n,f)=>n+f.bytes,0)<=DATASET_SOURCE_FILE_LIMITS.totalBytes&&
    bytes(sourceFiles.map(f=>({file:'dataset/'+f.path,bytes:f.bytes,sha256:f.sha256}))).length<=DATASET_SOURCE_FILE_LIMITS.descriptorBytes,
    'COUCHDB_RELEASE_SOURCE_CAPACITY','Select a capture that fits the original retained dataset release provenance limits.');
  const review={
    reviewer:query.review.reviewer,note:query.review.note,acknowledgements:query.review,
    rowScope:query.documentIds?'SELECTED_DOCUMENT_IDS':'ALL_RETURNED_WINNING_DOCUMENTS',
    documentIds:query.documentIds??null,counts:selection.counts,query:selected.plan.data.query,
    querySha256:identity(query),columns:query.projection,order:selected.plan.data.extraction.order,
  };
  const source={
    schema:COUCHDB_DEPLOYMENT_SCHEMA,
    capture:{id:capture.manifest.id,sourceId:capture.manifest.sourceId,manifestSha256:capture.manifestSha256,
      engine:capture.manifest.engine,startedAt:capture.manifest.startedAt,completedAt:capture.manifest.completedAt,
      before:capture.manifest.before.updateSequence,after:capture.manifest.after.updateSequence,endSequence:capture.manifest.endSequence},
    sourcePlan:{id:selected.plan.id,sourceSha256:selected.plan.data.sourceHash,runtimeSourceSha256:runtime.hash,planDigest:selected.plan.data.digest},
    candidate:{runId,planId:selected.plan.id,candidateDigest:checked.manifest.candidateDigest,originalConfigSha256:checked.manifest.configHash,
      releaseConfigSha256:digest(configBytes),csvSha256:checked.manifest.csvHash,csvBytes:checked.manifest.csvBytes,dataset:checked.manifest.dataset},
    publication:{reviewId:selected.review.id,...selected.published},publicationReview:review,
    merchant:{configurationSha256:digest(merchantBytes)},sourceFiles,
  };
  const sourceBytes=bytes(source);
  need(sourceBytes.length<=DATASET_SOURCE_FILE_LIMITS.sourceBytes,'COUCHDB_RELEASE_SOURCE_CAPACITY');
  const binding={schema:DATASET_BINDING_SCHEMA,datasetDirectory:publisher.settings.targetDirectory,
    contractSha256:datasetContractSha256(checked.manifest.dataset),baselineSnapshot:checked.manifest.dataset.snapshot,sourceSha256:digest(sourceBytes)};
  const publicReview={
    schema:'stellar-forge.couchdb-deployment-review.v1',runId,planId:selected.plan.id,candidateDigest:checked.manifest.candidateDigest,
    captureSha256:capture.manifestSha256,sourceId:capture.manifest.sourceId,snapshot:checked.manifest.dataset.snapshot,
    rows:checked.manifest.dataset.rowCount,dataset:checked.manifest.dataset,terms:selectedTerms(terms),publicationReview:review,
    sourceClosure:{files:sourceFiles.length,bytes:sourceFiles.reduce((n,f)=>n+f.bytes,0)},
    packageSourceSha256:digest(sourceBytes),sellerSha256:digest(merchantBytes),
    reviewSha256:identity({source,config:decode(configBytes),merchant,binding}),audience:'PRIVATE_MERCHANT_STAGING',
  };
  need(same(publication(publisher,runId),selected),'COUCHDB_PUBLICATION_CHANGED');
  return {selected,checked,capture,extras,configBytes,merchantBytes,source,sourceBytes,binding,review:publicReview};
}
export async function reviewCouchdbDeployment(options){return (await reviewedInput(options)).review;}
function sourceBinding(prepared){
  const source=decode(prepared.retained['source.json']),candidate=source?.candidate;
  need(source?.schema===COUCHDB_DEPLOYMENT_SCHEMA&&HASH.test(source.capture?.manifestSha256??'')&&UUID.test(source.capture?.id??'')&&
    HASH.test(source.sourcePlan?.sourceSha256??'')&&HASH.test(source.sourcePlan?.runtimeSourceSha256??'')&&
    HASH.test(candidate?.candidateDigest??'')&&candidate.csvSha256===prepared.dataset.csvSha256&&candidate.releaseConfigSha256===prepared.dataset.sourceConfigSha256&&
    same(candidate.dataset,prepared.description)&&source.publication?.snapshot===prepared.dataset.baselineSnapshot&&
    source.merchant?.configurationSha256===digest(prepared.retained['seller.json']),'COUCHDB_DEPLOYMENT_BINDING_CHANGED');
  return source;
}
function summary(directory,prepared,source){
  return {schema:COUCHDB_DEPLOYMENT_SCHEMA,packageDirectory:directory,sourceSha256:prepared.dataset.sourceSha256,
    captureSha256:source.capture.manifestSha256,sourceId:source.capture.sourceId,runId:source.candidate.runId,candidateDigest:source.candidate.candidateDigest,
    sellerSha256:source.merchant.configurationSha256,dataset:prepared.dataset,publicationReview:source.publicationReview,
    files:prepared.files.map(f=>({...f,file:f.file.slice('dataset/'.length)}))};
}
export async function prepareCouchdbDeployment({publisher,runId,terms,expectedReviewSha256,directory}={}){
  need(HASH.test(expectedReviewSha256??''),'COUCHDB_DEPLOYMENT_REVIEW_REQUIRED');
  const selected=await reviewedInput({publisher,runId,terms});
  need(selected.review.reviewSha256===expectedReviewSha256,'COUCHDB_DEPLOYMENT_REVIEW_CHANGED');
  const root=resolve(directory);need(isAbsolute(directory)&&root===directory&&!overlaps(root,publisher.directory)&&!overlaps(root,publisher.settings.targetDirectory),'COUCHDB_DEPLOYMENT_DIRECTORY_INVALID');
  await privateDirectory(publisher.settings.targetDirectory);await privateDirectory(root,true);
  const unlock=await acquireWorkspace(root);
  try{
    await retainJSON(join(root,'deployment-request.json'),{schema:'stellar-forge.couchdb-deployment-request.v1',expectedReviewSha256,runId,terms:selectedTerms(terms)});
    await cloneCouchdbCapture(selected.capture,join(root,'capture'));
    for(const item of selected.extras)await retain(join(root,item.path),item.raw);
    const csv=await readPrivate(join(dirname(selected.checked.configPath),'data.csv'),256*MIB);
    need(csv.length===selected.checked.manifest.csvBytes&&digest(csv)===selected.checked.manifest.csvHash,'COUCHDB_DEPLOYMENT_CSV_CHANGED');
    for(const [name,raw] of [['dataset.csv',csv],['dataset.json',selected.configBytes],['seller.json',selected.merchantBytes],['source.json',selected.sourceBytes],['binding.json',bytes(selected.binding)]]){
      await retain(join(root,name),raw);
    }
    const prepared=await prepareDatasetRelease(root);sourceBinding(prepared);
    need(same(publication(publisher,runId),selected.selected),'COUCHDB_PUBLICATION_CHANGED');
    const result={...summary(root,prepared,selected.source),reviewSha256:expectedReviewSha256};
    await retainJSON(join(root,'deployment.json'),result);return result;
  }finally{await unlock();}
}
export async function inspectCouchdbDeployment(directory){
  const root=resolve(directory),prepared=await prepareDatasetRelease(root),source=sourceBinding(prepared);
  const capture=await readCouchdbCapture(join(root,'capture','capture.json'),source.capture.manifestSha256);
  const runtime=await readCouchdbSourceFile(join(root,'couchdb-source.json'));
  need(runtime.captureFile===join(root,'capture','capture.json')&&runtime.hash===source.sourcePlan.runtimeSourceSha256&&
    capture.manifest.sourceId===source.capture.sourceId&&capture.manifest.id===source.capture.id,'COUCHDB_DEPLOYMENT_CAPTURE_CHANGED');
  const planBytes=await readPrivate(join(root,'couchdb-plan.json'),262144),plan=decode(planBytes);
  const {digest:planDigest,...planBody}=plan;
  need(planDigest===identity(planBody)&&planDigest===source.sourcePlan.planDigest&&
    digest(await readPrivate(join(root,'couchdb-original-source.json'),262144))===source.sourcePlan.sourceSha256&&
    identity(runtime.queries[plan.query])===source.publicationReview.querySha256,'COUCHDB_DEPLOYMENT_PLAN_CHANGED');
  const selection=reviewedCouchdbDocuments(capture,runtime.queries[plan.query]);
  need(selection.counts.activeDocuments===prepared.description.rowCount&&same(selection.counts,source.publicationReview.counts),'COUCHDB_DEPLOYMENT_ROWS_CHANGED');
  return summary(root,prepared,source);
}
export async function stageCouchdbDeployment({packageDirectory,releaseDirectory,id,label=id,runtime={port:0},expectedSourceSha256}={}){
  need(HASH.test(expectedSourceSha256??''),'COUCHDB_DEPLOYMENT_PACKAGE_REVIEW_REQUIRED');
  need(typeof id==='string'&&typeof label==='string'&&label.trim(),'COUCHDB_DEPLOYMENT_RELEASE_ID_REQUIRED');
  only(runtime,['port','facilitator','allowLocalFacilitator'],'COUCHDB_DEPLOYMENT_RUNTIME_INVALID');
  const selected=await inspectCouchdbDeployment(packageDirectory);
  need(selected.sourceSha256===expectedSourceSha256,'COUCHDB_DEPLOYMENT_PACKAGE_CHANGED');
  const root=resolve(releaseDirectory);
  need(!overlaps(root,selected.packageDirectory)&&!overlaps(root,selected.dataset.datasetDirectory),'COUCHDB_RELEASE_DIRECTORY_OVERLAP');
  const {initReleaseStore,inspectRelease,stageRelease,normalizeReleaseRuntime}=await import('../../sf82-seller-pilot/releases.mjs');
  const normalized=normalizeReleaseRuntime(runtime);await initReleaseStore(root);
  let prior;try{prior=await inspectRelease(root,id);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(prior){
    need(prior.source?.kind==='VERSIONED_DATASET_PACKAGE'&&same(prior.dataset,selected.dataset)&&prior.label===label.trim()&&same(prior.runtime,normalized),'COUCHDB_RELEASE_ID_CHANGED');
    return {reused:true,release:prior};
  }
  return {reused:false,release:await stageRelease(root,{id,label,datasetPackage:selected.packageDirectory,runtime:normalized})};
}
export async function readCouchdbDeploymentFile(directory,filename){
  const selected=await inspectCouchdbDeployment(directory),expected=selected.files.find(file=>file.file===filename);
  need(expected,'COUCHDB_DEPLOYMENT_FILE_NOT_FOUND','Choose a retained file from this private package.',404);
  const raw=await readPrivate(join(selected.packageDirectory,filename),Math.max(expected.bytes,1));
  need(raw.length===expected.bytes&&digest(raw)===expected.sha256,'COUCHDB_DEPLOYMENT_FILE_CHANGED');
  return {filename,bytes:raw,sha256:expected.sha256,mime:filename.endsWith('.csv')?'text/csv; charset=utf-8':'application/octet-stream'};
}

/** A receiving host reviews a new local binding; every original source byte
 * remains in the package and the original SF82 execution hash changes. */
export async function rebindCouchdbDeployment({packageDirectory,datasetDirectory,workspaceId,expectedSourceSha256,expectedExecutionSha256,directory}={}){
  need(UUID.test(workspaceId??'')&&HASH.test(expectedSourceSha256??'')&&HASH.test(expectedExecutionSha256??''),'COUCHDB_REBIND_REVIEW_REQUIRED');
  const original=await inspectCouchdbDeployment(packageDirectory);
  need(original.sourceSha256===expectedSourceSha256&&original.dataset.executionSha256===expectedExecutionSha256,'COUCHDB_REBIND_SOURCE_CHANGED');
  const target=resolve(datasetDirectory),root=resolve(directory);
  need(isAbsolute(datasetDirectory)&&target===datasetDirectory&&isAbsolute(directory)&&root===directory&&!overlaps(root,original.packageDirectory)&&!overlaps(root,target),'COUCHDB_REBIND_DIRECTORY_INVALID');
  const {openDatasetVersions}=await import('../dataset-refresh/versions.mjs');
  const versions=await openDatasetVersions({directory:target,collectOnOpen:false});
  try{
    const state=versions.status();
    need(datasetContractSha256(versions.describe())===original.dataset.contractSha256&&state.versions.some(v=>v.snapshot===original.dataset.baselineSnapshot),'COUCHDB_REBIND_DATASET_CHANGED');
  }finally{await versions.close();}
  await privateDirectory(root,true);const unlock=await acquireWorkspace(root);
  try{
    const request={schema:'stellar-forge.couchdb-deployment-receiving.v1',workspaceId,datasetDirectory:target,expectedSourceSha256,expectedExecutionSha256};
    await retainJSON(join(root,'deployment-request.json'),request);
    const prepared=await prepareDatasetRelease(original.packageDirectory),originalSource=prepared.retained['source.json'],originalBinding=prepared.retained['binding.json'];
    const source=decode(originalSource),prefix='receiving/'+expectedExecutionSha256;
    const additions=[{path:prefix+'/source.json',raw:originalSource},{path:prefix+'/binding.json',raw:originalBinding}];
    for(const file of prepared.files){
      const path=file.file.slice('dataset/'.length);if(['source.json','binding.json'].includes(path))continue;
      const raw=await readPrivate(join(original.packageDirectory,path),Math.max(file.bytes,1));need(raw.length===file.bytes&&digest(raw)===file.sha256,'COUCHDB_REBIND_SOURCE_CHANGED');
      await privateDirectory(dirname(join(root,path)),true);await retain(join(root,path),raw);
    }
    for(const item of additions){await privateDirectory(dirname(join(root,item.path)),true);await retain(join(root,item.path),item.raw);}
    const files=new Map(source.sourceFiles.map(file=>[file.path,file]));
    for(const {path,raw} of additions){
      const descriptor={path,bytes:raw.length,sha256:digest(raw)},old=files.get(path);
      need(!old||same(old,descriptor),'COUCHDB_REBIND_ORIGIN_CHANGED');files.set(path,descriptor);
    }
    source.sourceFiles=[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    source.receiving={...request,originalDatasetDirectory:original.dataset.datasetDirectory,originalSourceSha256:expectedSourceSha256,originalExecutionSha256:expectedExecutionSha256};
    const sourceRaw=bytes(source);need(sourceRaw.length<=DATASET_SOURCE_FILE_LIMITS.sourceBytes,'COUCHDB_RELEASE_SOURCE_CAPACITY');
    const binding={...decode(originalBinding),datasetDirectory:target,sourceSha256:digest(sourceRaw)};
    await retain(join(root,'source.json'),sourceRaw);await retainJSON(join(root,'binding.json'),binding);
    const selected=await inspectCouchdbDeployment(root);
    const result={...selected,receiving:request};await retainJSON(join(root,'deployment.json'),result);return result;
  }finally{await unlock();}
}
