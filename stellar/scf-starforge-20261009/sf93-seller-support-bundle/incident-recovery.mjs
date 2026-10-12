// MIT. Complete private SF93 snapshots and receiving through the original store and kernel leases.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,link,unlink} from 'node:fs/promises';
import {resolve,dirname,join,basename,relative,sep} from 'node:path';
import {acquireStateLease} from '../merchant-fleet-gateway/state-lease.mjs';
import {hash} from './incident-config.mjs';
import {openIncidentStore,readPrivateFile,validateIncidentState,validateIncidentCapture,
  incidentCaptureReferences,INCIDENT_STORE_LIMITS,statusView} from './incident-store.mjs';
import {restoredIncidentState,reconcileRecoveryState,recoveryView} from './incident-recovery-model.mjs';

export const SNAPSHOT_SCHEMA='stellar-forge.seller-incident-snapshot.v1';
export const SNAPSHOT_LIMITS=Object.freeze({
  stateBytes:INCIDENT_STORE_LIMITS.stateBytes,captureBytes:INCIDENT_STORE_LIMITS.captureBytes,
  metadataBytes:32*1024*1024,totalBytes:768*1024*1024,files:22_000,historyFiles:256
});
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const CAPTURE=/^captures\/capture-([a-f0-9]{64})\.json$/;
const HISTORY=/^recovery\/(?:state|manifest|receipt)-([a-f0-9]{64})\.json$/;
const decoder=new TextDecoder('utf-8',{fatal:true});
const ensure=(value,code)=>{if(!value)throw new Error('SF93_'+code);};
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const cancelled=signal=>{if(signal?.aborted)throw new Error('SF93_RECOVERY_ABORTED');};
function json(bytes) {try{return JSON.parse(decoder.decode(bytes));}catch{throw new Error('SF93_RECOVERY_JSON_INVALID');}}
function id(value) {ensure(typeof value==='string'&&ID.test(value),'RECOVERY_OPERATION_ID_INVALID');return value;}
function expectedHash(value) {ensure(typeof value==='string'&&SHA.test(value),'RECOVERY_DIGEST_REQUIRED');return value;}
function canonicalPath(value) {
  ensure(typeof value==='string'&&value.length<=4096&&!value.includes('\0')&&
    resolve(value)===value&&value!=='/','RECOVERY_ABSOLUTE_PATH_REQUIRED');
  return value;
}
function inside(child,parent) {return child===parent||child.startsWith(parent+sep);}
async function privateRoot(value) {
  const path=canonicalPath(value),info=await lstat(path);
  ensure(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
    info.uid===process.getuid()&&await realpath(path)===path,'RECOVERY_PRIVATE_DIRECTORY_REQUIRED');
  return {path,dev:info.dev,ino:info.ino};
}
async function stillRoot(root) {
  const actual=await privateRoot(root.path);
  ensure(actual.dev===root.dev&&actual.ino===root.ino,'RECOVERY_DIRECTORY_CHANGED');
}
async function privateFolder(path) {
  await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  return privateRoot(path);
}
async function syncDirectory(path) {
  const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await f.sync();}finally{await f.close();}
}
async function readFile(path,limit,signal) {
  cancelled(signal);
  const before=await lstat(path);
  ensure(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&
    before.uid===process.getuid()&&!(before.mode&0o077)&&before.size<=limit,
    'RECOVERY_PRIVATE_FILE_REQUIRED');
  const bytes=await readPrivateFile(path,limit),after=await lstat(path);
  ensure(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
    before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&bytes.length===after.size,
    'RECOVERY_FILE_CHANGED');
  cancelled(signal);return bytes;
}
async function optionalFile(path,limit,signal) {
  try{return await readFile(path,limit,signal);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function immutable(path,bytes,signal) {
  cancelled(signal);
  const parent=await privateRoot(dirname(path));
  // Recover a publication that died between link() and removal of its owned temporary name.
  const temporary=join(parent.path,'.sf93-copy-'+hash(basename(path))+'.tmp');
  let named=null,staged=null;
  try{named=await lstat(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  try{staged=await lstat(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(named&&staged&&named.dev===staged.dev&&named.ino===staged.ino) {
    ensure(named.isFile()&&!named.isSymbolicLink()&&named.nlink===2&&
      named.uid===process.getuid()&&!(named.mode&0o077)&&named.size===bytes.length,
      'RECOVERY_PUBLICATION_CHANGED');
    const raw=await readPrivateFile(path,Math.max(bytes.length,1));
    ensure(raw.equals(bytes),'RECOVERY_RETAINED_BYTES_CHANGED');
    await unlink(temporary);await syncDirectory(parent.path);
  }
  const prior=await optionalFile(path,Math.max(bytes.length,1),signal);
  if(prior){ensure(prior.equals(bytes),'RECOVERY_RETAINED_BYTES_CHANGED');return;}
  // This exact destination is protected by its original operation's kernel lease.
  const residue=await optionalFile(temporary,Math.max(bytes.length,1),signal);
  if(residue!==null)await unlink(temporary);
  let file;
  try {
    file=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    for(let offset=0;offset<bytes.length;offset+=65536) {
      cancelled(signal);await file.writeFile(bytes.subarray(offset,offset+65536));
    }
    await file.sync();await file.close();file=null;
    await stillRoot(parent);cancelled(signal);
    try {await link(temporary,path);}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      ensure((await readFile(path,Math.max(bytes.length,1),signal)).equals(bytes),'RECOVERY_RETAINED_BYTES_CHANGED');
    }
    await syncDirectory(parent.path);
  } finally {
    await file?.close().catch(()=>{});
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
function descriptor(path,bytes) {return {path,bytes:bytes.length,sha256:hash(bytes)};}
function fileLimit(path) {
  if(path==='state.json')return SNAPSHOT_LIMITS.stateBytes;
  if(CAPTURE.test(path))return SNAPSHOT_LIMITS.captureBytes;
  if(HISTORY.test(path))return SNAPSHOT_LIMITS.metadataBytes;
  throw new Error('SF93_RECOVERY_MEMBER_PATH_INVALID');
}
function inventory(files) {
  ensure(Array.isArray(files)&&files.length>=1&&files.length<=SNAPSHOT_LIMITS.files,
    'RECOVERY_INVENTORY_INVALID');
  const names=new Set();let total=0,history=0,previous='';
  for(const row of files) {
    ensure(row&&Object.keys(row).sort().join(',')==='bytes,path,sha256'&&
      typeof row.path==='string'&&row.path>previous&&!names.has(row.path)&&
      Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=fileLimit(row.path)&&
      SHA.test(row.sha256??''),'RECOVERY_MEMBER_INVALID');
    total+=row.bytes;previous=row.path;names.add(row.path);if(HISTORY.test(row.path))history++;
  }
  ensure(names.has('state.json')&&total<=SNAPSHOT_LIMITS.totalBytes&&history<=SNAPSHOT_LIMITS.historyFiles,
    'RECOVERY_TOTAL_LIMIT');
  return {names,total,history};
}
function manifestValue(bytes) {
  const value=json(bytes);
  ensure(bytes.equals(encoded(value))&&value?.schema===SNAPSHOT_SCHEMA&&ID.test(value.operationId??'')&&
    typeof value.stateUpdatedAt==='string'&&Number.isFinite(Date.parse(value.stateUpdatedAt))&&
    new Date(value.stateUpdatedAt).toISOString()===value.stateUpdatedAt&&
    Number.isSafeInteger(value.stateRevision)&&value.stateRevision>=1&&SHA.test(value.stateSha256??'')&&
    SHA.test(value.configHash??''),'RECOVERY_MANIFEST_INVALID');
  inventory(value.files);
  ensure(value.files.find(row=>row.path==='state.json').sha256===value.stateSha256,
    'RECOVERY_STATE_BINDING_CHANGED');
  return value;
}
function historyFor(state) {
  const files=state.recovery?.history??[];
  ensure(Array.isArray(files)&&files.length<=SNAPSHOT_LIMITS.historyFiles,'RECOVERY_HISTORY_LIMIT');
  const names=new Set();
  for(const row of files)ensure(row&&HISTORY.test(row.path??'')&&SHA.test(row.sha256??'')&&
    HISTORY.exec(row.path)[1]===row.sha256&&Number.isSafeInteger(row.bytes)&&
    row.bytes>0&&row.bytes<=SNAPSHOT_LIMITS.metadataBytes&&!names.has(row.path)&&names.add(row.path),
    'RECOVERY_HISTORY_INVALID');
  return files;
}
function stateAndMembers(raw,manifest) {
  const state=validateIncidentState(json(raw)),refs=[...incidentCaptureReferences(state)].sort();
  ensure(hash(raw)===manifest.stateSha256&&state.revision===manifest.stateRevision&&
    state.configHash===manifest.configHash,'RECOVERY_STATE_BINDING_CHANGED');
  const selected=new Set(['state.json',...refs.map(sha=>'captures/capture-'+sha+'.json'),
    ...historyFor(state).map(row=>row.path)]);
  ensure(selected.size===manifest.files.length&&manifest.files.every(row=>selected.has(row.path)),
    'RECOVERY_COMPLETE_INVENTORY_REQUIRED');
  for(const row of historyFor(state))ensure(manifest.files.some(file=>same(file,row)),
    'RECOVERY_HISTORY_BINDING_CHANGED');
  return state;
}
async function member(root,row,signal) {
  await stillRoot(root);await privateRoot(dirname(join(root.path,row.path)));
  const bytes=await readFile(join(root.path,row.path),fileLimit(row.path),signal);
  ensure(bytes.length===row.bytes&&hash(bytes)===row.sha256,'RECOVERY_MEMBER_DIGEST_MISMATCH');
  const capture=CAPTURE.exec(row.path),history=HISTORY.exec(row.path);
  if(capture)validateIncidentCapture(bytes,capture[1]);
  if(history)ensure(history[1]===row.sha256,'RECOVERY_HISTORY_DIGEST_MISMATCH');
  return bytes;
}
async function operationDirectory(value,request,signal) {
  const path=canonicalPath(value),parent=await privateRoot(dirname(path));
  // The parent's existing original flock owns creation and same-operation continuation.
  const lease=await acquireStateLease(parent.path);
  try {
    await stillRoot(parent);
    let exists=false;
    try{await lstat(path);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(exists) {
      const prior=await readFile(join(path,'request.json'),SNAPSHOT_LIMITS.metadataBytes,signal);
      ensure(prior.equals(encoded(request)),'RECOVERY_DESTINATION_ALREADY_EXISTS');
    }
    const root=await privateFolder(path);
    await immutable(join(path,'request.json'),encoded(request),signal);
    const own=await acquireStateLease(path);
    lease.assertHeld();await stillRoot(parent);await lease.close();
    return {root,lease:own};
  } catch(error){await lease.close();throw error;}
}

export async function exportIncidentSnapshot({directory,outputDirectory,operationId,expectedRevision,signal}) {
  operationId=id(operationId);directory=canonicalPath(directory);outputDirectory=canonicalPath(outputDirectory);
  ensure(!inside(outputDirectory,directory)&&!inside(directory,outputDirectory),'RECOVERY_SEPARATE_DIRECTORY_REQUIRED');
  ensure(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'RECOVERY_REVISION_REQUIRED');
  const request={schema:SNAPSHOT_SCHEMA,action:'snapshot',operationId,directory,expectedRevision};
  const {root,lease}=await operationDirectory(outputDirectory,request,signal);
  try {
    const complete=await optionalFile(join(root.path,'manifest.json'),SNAPSHOT_LIMITS.metadataBytes,signal);
    if(complete)return {...await inspectIncidentSnapshot({directory:root.path,expectedManifestSha256:hash(complete),signal}),reused:true};
    await privateFolder(join(root.path,'captures'));
    await privateFolder(join(root.path,'recovery'));
    await privateRoot(directory);
    const store=await openIncidentStore(directory);
    let retained;
    await store.transaction(async(state,io)=>{
      let raw=await optionalFile(join(root.path,'state.json'),SNAPSHOT_LIMITS.stateBytes,signal);
      if(raw===null) {
        ensure(state.revision===expectedRevision,'RECOVERY_REVISION_CONFLICT');
        raw=await io.readStateBytes();
        await immutable(join(root.path,'state.json'),raw,signal);
      }
      const frozen=validateIncidentState(json(raw));
      ensure(frozen.revision===expectedRevision,'RECOVERY_REVISION_CONFLICT');
      const files=[descriptor('state.json',raw)];
      for(const captureId of [...incidentCaptureReferences(frozen)].sort()) {
        cancelled(signal);
        const path='captures/capture-'+captureId+'.json';
        let bytes=await optionalFile(join(root.path,path),SNAPSHOT_LIMITS.captureBytes,signal);
        if(bytes===null) {
          bytes=await io.readCaptureBytes({id:captureId});
          await immutable(join(root.path,path),bytes,signal);
        }
        validateIncidentCapture(bytes,captureId);files.push(descriptor(path,bytes));
      }
      for(const row of historyFor(frozen)) {
        let bytes=await optionalFile(join(root.path,row.path),SNAPSHOT_LIMITS.metadataBytes,signal);
        if(bytes===null) {
          bytes=await readFile(join(store.root,row.path),SNAPSHOT_LIMITS.metadataBytes,signal);
          ensure(bytes.length===row.bytes&&hash(bytes)===row.sha256,'RECOVERY_HISTORY_DIGEST_MISMATCH');
          await immutable(join(root.path,row.path),bytes,signal);
        }
        ensure(bytes.length===row.bytes&&hash(bytes)===row.sha256,'RECOVERY_HISTORY_DIGEST_MISMATCH');
        files.push(row);
      }
      // ASCII inventory order is independent of the caller locale.
      files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
      inventory(files);
      retained={schema:SNAPSHOT_SCHEMA,operationId,stateUpdatedAt:frozen.updatedAt,
        stateRevision:frozen.revision,stateSha256:hash(raw),configHash:frozen.configHash,files};
      lease.assertHeld();await stillRoot(root);
      await immutable(join(root.path,'manifest.json'),encoded(retained),signal);
    },{readonly:true});
    return {...await inspectIncidentSnapshot({directory:root.path,
      expectedManifestSha256:hash(encoded(retained)),signal}),reused:false};
  } finally {await lease.close();}
}

export async function inspectIncidentSnapshot({directory,expectedManifestSha256,signal}) {
  expectedHash(expectedManifestSha256);
  const root=await privateRoot(directory),bytes=await readFile(join(root.path,'manifest.json'),
    SNAPSHOT_LIMITS.metadataBytes,signal);
  ensure(hash(bytes)===expectedManifestSha256,'RECOVERY_MANIFEST_DIGEST_MISMATCH');
  const manifest=manifestValue(bytes);
  const raw=await member(root,manifest.files.find(row=>row.path==='state.json'),signal);
  const state=stateAndMembers(raw,manifest);
  for(const row of manifest.files)if(row.path!=='state.json')await member(root,row,signal);
  await stillRoot(root);
  return {directory:root.path,manifestSha256:expectedManifestSha256,manifestBytes:bytes.length,manifest,
    totalBytes:inventory(manifest.files).total,files:manifest.files.length,
    source:{revision:state.revision,configRevision:state.configRevision,configHash:state.configHash,
      merchants:state.config.merchants.length,incidents:state.incidents.length,
      notifications:state.notifications.length,captures:incidentCaptureReferences(state).size},
    notificationDeliveryOnReceive:'HELD_UNTIL_EXPLICIT_RECONCILIATION'};
}

export async function receiveIncidentSnapshot({snapshotDirectory,directory,operationId,expectedManifestSha256,signal}) {
  operationId=id(operationId);expectedHash(expectedManifestSha256);
  snapshotDirectory=canonicalPath(snapshotDirectory);directory=canonicalPath(directory);
  ensure(!inside(directory,snapshotDirectory)&&!inside(snapshotDirectory,directory),'RECOVERY_SEPARATE_DIRECTORY_REQUIRED');
  const request={schema:SNAPSHOT_SCHEMA,action:'receive',operationId,snapshotDirectory,expectedManifestSha256};
  const {root,lease}=await operationDirectory(directory,request,signal);
  try {
    const complete=await optionalFile(join(root.path,'received.json'),SNAPSHOT_LIMITS.metadataBytes,signal);
    const published=await optionalFile(join(root.path,'state.json'),SNAPSHOT_LIMITS.stateBytes,signal);
    if(complete&&published) {
      const receipt=json(complete);
      ensure(receipt.operationId===operationId&&receipt.manifestSha256===expectedManifestSha256,
        'RECOVERY_RECEIPT_BINDING_CHANGED');
      const state=await(await openIncidentStore(root.path)).read();
      ensure(state.recovery?.id===operationId&&state.recovery.manifestSha256===expectedManifestSha256,
        'RECOVERY_RECEIVING_CHANGED');
      return {directory:root.path,receipt,current:statusView(state),reused:true};
    }
    const inspected=await inspectIncidentSnapshot({directory:snapshotDirectory,expectedManifestSha256,signal});
    const source=await privateRoot(snapshotDirectory),manifest=inspected.manifest;
    const stateFile=manifest.files.find(row=>row.path==='state.json'),raw=await member(source,stateFile,signal);
    const original=stateAndMembers(raw,manifest);
    for(const folder of ['captures','transactions','worker','recovery'])await privateFolder(join(root.path,folder));
    let clock=await optionalFile(join(root.path,'receiving.json'),4096,signal);
    if(clock===null) {
      clock=encoded({operationId,manifestSha256:expectedManifestSha256,receivedAt:new Date().toISOString()});
      await immutable(join(root.path,'receiving.json'),clock,signal);
    }
    const begun=json(clock);
    ensure(begun.operationId===operationId&&begun.manifestSha256===expectedManifestSha256,
      'RECOVERY_RECEIVING_CHANGED');
    const history=[];
    for(const row of manifest.files)if(row.path!=='state.json') {
      const bytes=await member(source,row,signal);
      await immutable(join(root.path,row.path),bytes,signal);
      if(HISTORY.test(row.path))history.push(row);
    }
    const manifestBytes=await readFile(join(source.path,'manifest.json'),SNAPSHOT_LIMITS.metadataBytes,signal);
    ensure(hash(manifestBytes)===expectedManifestSha256,'RECOVERY_MANIFEST_DIGEST_MISMATCH');
    const provenance={schema:SNAPSHOT_SCHEMA,operationId,manifestSha256:expectedManifestSha256,
      sourceStateSha256:stateFile.sha256,sourceRevision:original.revision,receivedAt:begun.receivedAt,
      sourceFiles:manifest.files.length,sourceBytes:inspected.totalBytes,deliveryPaused:true};
    for(const [kind,bytes] of [['state',raw],['manifest',manifestBytes],['receipt',encoded(provenance)]]) {
      const row=descriptor('recovery/'+kind+'-'+hash(bytes)+'.json',bytes);
      await immutable(join(root.path,row.path),bytes,signal);
      if(!history.some(old=>old.path===row.path))history.push(row);
    }
    history.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    ensure(history.length<=SNAPSHOT_LIMITS.historyFiles,'RECOVERY_HISTORY_LIMIT');
    const state=restoredIncidentState(original,{id:operationId,manifestSha256:expectedManifestSha256,
      sourceStateSha256:stateFile.sha256,receivedAt:begun.receivedAt});
    state.recovery.history=history;
    validateIncidentState(state);
    const restored=Buffer.from(JSON.stringify(state)+'\n');
    ensure(restored.length<=SNAPSHOT_LIMITS.stateBytes,'RECOVERY_STATE_SIZE_LIMIT');
    lease.assertHeld();await stillRoot(root);
    const workerLease=await acquireStateLease(join(root.path,'worker'));
    let transactionLease;
    try {
      transactionLease=await acquireStateLease(join(root.path,'transactions'));
      for(const captureId of incidentCaptureReferences(state)) {
        const bytes=await readFile(join(root.path,'captures','capture-'+captureId+'.json'),
          SNAPSHOT_LIMITS.captureBytes,signal);
        validateIncidentCapture(bytes,captureId);
      }
      const receipt={...provenance,directory:root.path,stateSha256:hash(restored),revision:state.revision,
        originalNotificationIds:state.notifications.map(event=>event.id),notificationDeliveryStarted:false};
      // A completed receipt is prepared first; state.json is the single final publication
      // that makes this directory openable by the original store.
      await immutable(join(root.path,'received.json'),encoded(receipt),signal);
      await immutable(join(root.path,'state.json'),restored,signal);
      const readback=await(await openIncidentStore(root.path)).read();
      ensure(hash(await readFile(join(root.path,'state.json'),SNAPSHOT_LIMITS.stateBytes,signal))===hash(restored),
        'RECOVERY_RECEIVED_STATE_CHANGED');
      return {directory:root.path,receipt,current:statusView(readback),reused:false};
    } finally {await transactionLease?.close();await workerLease.close();}
  } finally {await lease.close();}
}

export async function inspectIncidentRecovery({directory}) {
  return recoveryView(await(await openIncidentStore(directory)).read());
}

export async function reconcileIncidentRecovery({directory,...input}) {
  const store=await openIncidentStore(directory);
  return store.transaction(state=>reconcileRecoveryState(state,input));
}
