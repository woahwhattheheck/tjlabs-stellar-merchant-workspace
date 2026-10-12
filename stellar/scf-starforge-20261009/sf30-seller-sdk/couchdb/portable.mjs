// MIT. Complete CouchDB source and original publisher receiving.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, isAbsolute } from 'node:path';
import { readdir } from 'node:fs/promises';
import { openDatasetVersions } from '../dataset-refresh/versions.mjs';
import { acquireDatasetLease } from '../dataset-refresh/writer-lease.mjs';
import { acquireReleaseLease } from '../../sf82-seller-pilot/release-process.mjs';
import { readCouchdbCapture } from './capture.mjs';
import { need, only, object, HASH, UUID, MAX_BODY, bytes, digest, identity, readPrivate, readJson, privateDirectory, acquireWorkspace, retainJSON, exists } from './common.mjs';
const SCHEMA='stellar-forge.couchdb-workspace-handover.v1';
const SCRIPT=fileURLToPath(new URL('./archive.py',import.meta.url));
export function couchdbArchive(input,{environment=process.env,signal}={}){
  const payload=bytes(input);need(payload.length<=32*1048576,'COUCHDB_ARCHIVE_REQUEST_TOO_LARGE');
  return new Promise((done,fail)=>{
    const child=spawn(environment.COUCHDB_PYTHON??'python3',[SCRIPT],{env:environment,stdio:['pipe','pipe','pipe'],shell:false});
    const output=[],errors=[];let size=0,errorSize=0,issue;
    const stop=()=>{issue=Object.assign(new Error('The original archive operation was interrupted.'),{code:'COUCHDB_ARCHIVE_INTERRUPTED',status:409});child.kill('SIGTERM');};
    signal?.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',part=>{size+=part.length;if(size>32*1048576){issue=Object.assign(new Error('Archive result exceeds the declared capacity.'),{code:'COUCHDB_ARCHIVE_RESULT_TOO_LARGE'});child.kill('SIGTERM');}else output.push(part);});
    child.stderr.on('data',part=>{errorSize+=part.length;if(errorSize<=262144)errors.push(part);});
    child.once('error',error=>{issue=error;});
    child.stdin.on('error',error=>{issue??=error;});
    child.once('close',code=>{
      signal?.removeEventListener('abort',stop);
      if(issue)return fail(issue);
      if(code!==0){
        let native;try{native=JSON.parse(Buffer.concat(errors).toString('utf8').trim().split('\n').at(-1));}catch{}
        return fail(Object.assign(new Error(native?.message??'The original archive receiver exited with code '+code+'.'),{code:native?.error??'COUCHDB_ARCHIVE_FAILED',status:409}));
      }
      try{return done(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(output,size))));}catch(error){return fail(error);}
    });
    child.stdin.end(payload);if(signal?.aborted)stop();
  });
}
async function folders(directory){
  if(!await exists(directory))return [];
  return (await readdir(directory,{withFileTypes:true})).filter(v=>v.isDirectory()&&!v.isSymbolicLink()&&UUID.test(v.name)).map(v=>v.name).sort();
}
async function completeSource(root){
  const captures=[];
  for(const id of await folders(join(root,'captures')))if(await exists(join(root,'captures',id,'capture.json'))){
    const capture=await readCouchdbCapture(join(root,'captures',id,'capture.json'));
    need(capture.manifest.id===id,'COUCHDB_RECEIVED_CAPTURE_CHANGED');
    captures.push({id,sha256:capture.manifestSha256,sourceId:capture.manifest.sourceId});
  }
  return captures;
}
export async function exportCouchdbProject({workspaceRoot,workspace,operationId,directory,environment=process.env,signal}={}){
  need(UUID.test(operationId??'')&&workspace?.schema==='stellar-forge.couchdb-workspace.v1','COUCHDB_EXPORT_IDENTITY_REQUIRED');
  const root=resolve(workspaceRoot),target=resolve(directory);
  need(target===join(root,'exports',operationId),'COUCHDB_EXPORT_DIRECTORY_INVALID');
  await privateDirectory(target,true);
  const unlocks=[];
  try{
    for(const id of await folders(join(root,'publishers'))){const release=await acquireWorkspace(join(root,'publishers',id));unlocks.push(release);}
    for(const id of await folders(join(root,'datasets'))){const lease=acquireDatasetLease(join(root,'datasets',id));unlocks.push(()=>lease.close());}
    if(await exists(join(root,'releases'))){
      for(const name of ['run.lock','state.lock']){const lease=await acquireReleaseLease(join(root,'releases'),name);need(lease,'COUCHDB_LINUX_REQUIRED');unlocks.push(()=>lease.close());}
    }
    const snapshot=await couchdbArchive({command:'snapshot',source:root,destination:target,operationId,workspace:{schema:workspace.schema,id:workspace.id}},{environment,signal});
    const sourceIdentity=await readPrivate(join(snapshot.directory,'workspace.json'),4096);
    need(digest(sourceIdentity)===workspace.sha256,'COUCHDB_EXPORT_WORKSPACE_CHANGED');
    const result=await couchdbArchive({command:'archive',manifest:snapshot.manifest,inventory:snapshot.manifest.files,source:snapshot.directory,destination:join(target,'workspace.zip')},{environment,signal});
    const record={schema:SCHEMA,operationId,workspaceId:workspace.id,manifestSha256:identity(snapshot.manifest),archive:result.archive,
      files:snapshot.manifest.files.length,originalDirectory:root,archiveFile:join(target,'workspace.zip')};
    await retainJSON(join(target,'export.json'),record);return record;
  }finally{for(const release of unlocks.reverse())await release();}
}
export async function inspectCouchdbProject({file,expectedSha256,environment=process.env}={}){
  need(isAbsolute(file)&&HASH.test(expectedSha256??''),'COUCHDB_RECEIVING_INPUT_INVALID');
  const result=await couchdbArchive({command:'inspect',archive:resolve(file)},{environment});
  need(result.archive.sha256===expectedSha256&&result.manifest.schema===SCHEMA&&
    result.manifest.workspace?.schema==='stellar-forge.couchdb-workspace.v1'&&UUID.test(result.manifest.workspace.id??'')&&
    isAbsolute(result.manifest.originalDirectory)&&resolve(result.manifest.originalDirectory)===result.manifest.originalDirectory&&
    UUID.test(result.manifest.operationId??''),'COUCHDB_RECEIVING_SOURCE_CHANGED');
  need(result.manifest.files.some(v=>v.path==='workspace.json'),'COUCHDB_RECEIVING_WORKSPACE_MISSING');
  const allowed=new Set(['workspace.json','connections','captures','mappings','products','publishers','datasets','operations','deployments','customers','releases','original-releases','original-receipts','receive-intent.json','received-project.json']);
  need(result.manifest.files.every(v=>allowed.has(v.path.split('/')[0])),'COUCHDB_RECEIVING_MEMBER_INVALID');
  return result;
}
export async function receiveCouchdbProject({file,expectedSha256,directory,environment=process.env,signal}={}){
  const root=resolve(directory);need(isAbsolute(directory)&&root===directory&&root!=='/','COUCHDB_RECEIVING_DIRECTORY_INVALID');
  need(HASH.test(expectedSha256??''),'COUCHDB_RECEIVING_INPUT_INVALID');
  if(await exists(join(root,'received-project.json'))){
    await privateDirectory(root);const prior=await readJson(join(root,'received-project.json'),32*1048576);
    need(prior.schema==='stellar-forge.couchdb-project-receiving.v1'&&prior.archiveSha256===expectedSha256&&prior.directory===root,'COUCHDB_RECEIVING_REQUEST_CHANGED');
    need(digest(await readPrivate(join(root,'workspace.json'),4096))===prior.workspaceIdentitySha256,'COUCHDB_RECEIVING_WORKSPACE_CHANGED');
    return {...prior,reused:true};
  }
  const selected=await inspectCouchdbProject({file,expectedSha256,environment});
  need(root!==selected.manifest.originalDirectory&&!root.startsWith(selected.manifest.originalDirectory+'/')&&!selected.manifest.originalDirectory.startsWith(root+'/'),'COUCHDB_RECEIVING_DIRECTORY_OVERLAP');
  await privateDirectory(root,true);const unlock=await acquireWorkspace(root);
  try{
    const intent={schema:'stellar-forge.couchdb-project-receiving.v1',archiveSha256:expectedSha256,workspaceId:selected.manifest.workspace.id,
      originalDirectory:selected.manifest.originalDirectory,directory:root};
    if(!await exists(join(root,'receive-intent.json'))){
      const occupied=(await readdir(root)).filter(name=>name!=='publisher.lock'&&name!=='.receive-intent.json.couchdb-pending');
      need(!occupied.length,'COUCHDB_RECEIVING_DIRECTORY_OCCUPIED','Choose a new private directory or resume this exact receiving request.',409);
    }
    await retainJSON(join(root,'receive-intent.json'),intent);
    const source=join(root,'receiving',expectedSha256,'original');
    await privateDirectory(source,true);
    const extracted=await couchdbArchive({command:'extract',archive:resolve(file),destination:source},{environment,signal});
    need(extracted.archive.sha256===expectedSha256&&identity(extracted.manifest)===identity(selected.manifest),'COUCHDB_RECEIVING_SOURCE_CHANGED');
    const received=await couchdbArchive({command:'restore-live',source,destination:root,manifest:selected.manifest,archiveSha256:expectedSha256},{environment,signal});
    const identityBytes=await readPrivate(join(root,'workspace.json'),4096),native=JSON.parse(identityBytes);
    need(identity(native)===identity(selected.manifest.workspace),'COUCHDB_RECEIVING_WORKSPACE_CHANGED');
    const captures=await completeSource(root),datasets=[];
    for(const id of await folders(join(root,'datasets')))if(await exists(join(root,'datasets',id,'state.json'))){
      const store=await openDatasetVersions({directory:join(root,'datasets',id),collectOnOpen:false});
      try{datasets.push({productId:id,...store.status()});}finally{await store.close();}
    }
    const result={...intent,files:received.files,captures,datasets,originalSourceDirectory:source,originalReleases:received.originalReleases,
      publisherTargets:await folders(join(root,'publishers')),workspaceIdentitySha256:digest(identityBytes),
      releaseReceiving:{action:'deployment.rebind',description:'Retained publication records reopen against the received dataset store. Prepare a local release binding from the preserved deployment before starting its seller.'}};
    await retainJSON(join(root,'received-project.json'),result);return result;
  }finally{await unlock();}
}
