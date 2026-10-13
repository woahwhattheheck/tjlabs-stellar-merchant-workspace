// SPDX-License-Identifier: MIT
// Trusted installation of an unchanged dataset release against a received original version store.
// The original SF82 mutation lease owns writes; neither source bindings nor release digests change.
import {join,resolve,isAbsolute,dirname,relative} from 'node:path';
import {lstat,realpath,readdir} from 'node:fs/promises';
import {absolute,object,readJson,readPrivate,hashPrivate,digest,bytes,identity,atomicJson,createFile,privateDirectory,syncDirectory,fault} from '../sf30-seller-sdk/postgres/publisher/files.mjs';
const SCHEMA='stellar-forge.dataset-release-installation.v1',POINTER='stellar-forge.dataset-release-installation-pointer.v1',SHA=/^[a-f0-9]{64}$/;
const pointerName='dataset-installation.json',historyName='dataset-installations';
function member(value){
 if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..')||/[\u0000-\u001f\u007f]/.test(value))throw fault('DATASET_INSTALLATION_PATH');
 return value;
}
async function optional(path,max=1048576){try{return await readJson(path,max);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function originalManifest(source){
 if(!object(source)||!SHA.test(source.manifestSha256??'')||!SHA.test(source.planSha256??'')||typeof source.schema!=='string')throw fault('DATASET_INSTALLATION_SOURCE');
 absolute(source.manifestFile);member(source.datasetPrefix);
 const raw=await readPrivate(source.manifestFile,32*1024*1024);
 if(digest(raw)!==source.manifestSha256)throw fault('DATASET_INSTALLATION_SOURCE_CHANGED');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(manifest.schema!==source.schema||!Array.isArray(manifest.files))throw fault('DATASET_INSTALLATION_SOURCE_CHANGED');
 return manifest;
}
function check(body,directory,snapshot){
 const {id,...content}=body??{};
 if(body?.schema!==SCHEMA||!SHA.test(id??'')||identity(content)!==id||body.releaseDirectory!==directory||
    body.executionSha256!==snapshot.dataset.executionSha256||body.originalDatasetDirectory!==snapshot.dataset.datasetDirectory||
    body.contractSha256!==snapshot.dataset.contractSha256||!SHA.test(body.operationId??'')||
    !SHA.test(body.snapshot??'')||!Number.isSafeInteger(body.datasetRevision)||body.datasetRevision<1)
  throw fault('DATASET_INSTALLATION_CHANGED');
 absolute(body.datasetDirectory);return body;
}
export async function resolveDatasetInstallation(directory,snapshot){
 directory=absolute(resolve(directory));const pointer=await optional(join(directory,pointerName),32768);if(!pointer)return null;
 if(pointer.schema!==POINTER||!SHA.test(pointer.id??'')||Object.keys(pointer).some(k=>!['schema','id'].includes(k)))throw fault('DATASET_INSTALLATION_POINTER');
 const installed=check(await readJson(join(directory,historyName,pointer.id+'.json'),1048576),directory,snapshot);
 await privateDirectory(installed.datasetDirectory);await originalManifest(installed.source);
 return installed;
}
async function verifyReceivedDataset(target,source,{expectedSnapshot,expectedRevision}){
 target=absolute(target);await privateDirectory(target);const manifest=await originalManifest(source);
 const prefix=member(source.datasetPrefix).replace(/\/$/,'')+'/',selected=manifest.files.filter(f=>typeof f.path==='string'&&f.path.startsWith(prefix));
 if(!selected.length)throw fault('DATASET_INSTALLATION_SOURCE_MISSING');
 const seen=new Set();for(const item of selected){
  const path=member(item.path.slice(prefix.length));if(seen.has(path)||!SHA.test(item.sha256??'')||!/^\d+$/.test(String(item.bytes))||BigInt(item.bytes)>536870912n)throw fault('DATASET_INSTALLATION_SOURCE');
  seen.add(path);const file=join(target,path);if(await realpath(file)!==file)throw fault('DATASET_INSTALLATION_PATH');
  const observed=await hashPrivate(file,Number(item.bytes)+1);if(String(observed.bytes)!==String(item.bytes)||observed.hash!==item.sha256)throw fault('DATASET_INSTALLATION_DATA_CHANGED');
 }
 const state=await readJson(join(target,'state.json'),1048576);
 if(!['stellar-forge.dataset-versions.v1','stellar-forge.dataset-versions.v2'].includes(state.schema)||state.current!==expectedSnapshot||state.revision!==expectedRevision)
  throw fault('DATASET_INSTALLATION_VERSION_CHANGED');
 return {state,selected};
}
/** Called after the complete source-specific receiving inspector and under SF82 mutate(). */
export async function writeDatasetInstallation(directory,snapshot,input){
 directory=absolute(resolve(directory));await privateDirectory(directory);
 if(!object(input)||input.expectedExecutionSha256!==snapshot.dataset.executionSha256||
    input.expectedDatasetDirectory!==snapshot.dataset.datasetDirectory||
    !SHA.test(input.operationId??'')||!SHA.test(input.expectedSnapshot??'')||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||
    !(input.previousInstallationSha256===null||SHA.test(input.previousInstallationSha256??'')))
  throw fault('DATASET_INSTALLATION_REVIEW_CHANGED');
 const target=absolute(input.datasetDirectory),prior=await optional(join(directory,pointerName),32768);
 const oldSha=prior===null?null:identity(prior);
 const root=join(directory,historyName);await privateDirectory(root,true);
 const content={schema:SCHEMA,operationId:input.operationId,releaseDirectory:directory,
  executionSha256:snapshot.dataset.executionSha256,originalDatasetDirectory:snapshot.dataset.datasetDirectory,
  datasetDirectory:target,contractSha256:snapshot.dataset.contractSha256,snapshot:input.expectedSnapshot,
  datasetRevision:input.expectedRevision,source:input.source,previousInstallationSha256:input.previousInstallationSha256};
 const value={...content,id:identity(content)},next={schema:POINTER,id:value.id};
 if(prior?.id===value.id){const existing=check(await readJson(join(root,value.id+'.json')),directory,snapshot);
  if(identity(existing)!==identity(value))throw fault('DATASET_INSTALLATION_CHANGED');
  await originalManifest(value.source);await privateDirectory(target);await syncDirectory(directory);
  return {reused:true,installation:value};
 }
 if(oldSha!==input.previousInstallationSha256)throw fault('DATASET_INSTALLATION_REVIEW_CHANGED');
 await verifyReceivedDataset(target,input.source,{expectedSnapshot:input.expectedSnapshot,expectedRevision:input.expectedRevision});
 const file=join(root,value.id+'.json');const saved=await optional(file);
 if(saved){if(identity(saved)!==identity(value))throw fault('DATASET_INSTALLATION_CHANGED');}
 else await createFile(file,bytes(value));
 await syncDirectory(root);await atomicJson(directory,pointerName,next);await syncDirectory(directory);
 return {reused:false,installation:await resolveDatasetInstallation(directory,snapshot)};
}
/** Native facilitator/source variants retain the same installed dataset mapping.
 * The derived release's immutable dataset source is unchanged. */
export async function copyDatasetInstallation(sourceDirectory,targetDirectory,finalDirectory,snapshot){
 const prior=await resolveDatasetInstallation(sourceDirectory,snapshot);if(!prior)return null;
 const {id:_id,...old}=prior,content={...old,operationId:identity({from:prior.id,to:finalDirectory}),
  releaseDirectory:absolute(finalDirectory),previousInstallationSha256:null,derivedFrom:prior.id};
 const value={...content,id:identity(content)},root=join(targetDirectory,historyName);await privateDirectory(root,true);
 await createFile(join(root,value.id+'.json'),bytes(value));await syncDirectory(root);
 await createFile(join(targetDirectory,pointerName),bytes({schema:POINTER,id:value.id}));await syncDirectory(targetDirectory);
 return value;
}
