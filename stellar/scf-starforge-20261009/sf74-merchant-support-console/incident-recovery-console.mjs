// MIT. Complete SF93 recovery controls within an explicitly configured private Support root.
import {constants} from 'node:fs';
import {open,lstat,realpath,readdir,mkdir} from 'node:fs/promises';
import {join,resolve,dirname,basename,sep} from 'node:path';
import {acquireStateLease} from '../merchant-fleet-gateway/state-lease.mjs';
import {hash} from '../sf93-seller-support-bundle/incident-config.mjs';
import {openIncidentStore,readPrivateFile,incidentCaptureReferences} from '../sf93-seller-support-bundle/incident-store.mjs';
import {recoveryView} from '../sf93-seller-support-bundle/incident-recovery-model.mjs';
import {SNAPSHOT_SCHEMA,SNAPSHOT_LIMITS,exportIncidentSnapshot,inspectIncidentSnapshot,receiveIncidentSnapshot,
  inspectIncidentRecovery,reconcileIncidentRecovery,listIncidentSnapshotPins,abandonIncidentSnapshot} from '../sf93-seller-support-bundle/incident-recovery.mjs';

const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/,SHA=/^[a-f0-9]{64}$/;
const ensure=(ok,code)=>{if(!ok)throw new Error('SF93_RECOVERY_'+code);};
const decoder=new TextDecoder('utf-8',{fatal:true});
const cancelled=signal=>{if(signal?.aborted)throw new Error('SF93_RECOVERY_ABORTED');};
const childOf=(path,parent)=>path===parent||path.startsWith(parent+sep);
function fields(input,allowed) {
  ensure(input&&typeof input==='object'&&!Array.isArray(input)&&
    Object.keys(input).every(key=>allowed.includes(key)),'INPUT_INVALID');return input;
}
function name(value){ensure(typeof value==='string'&&ID.test(value),'OPERATION_ID_INVALID');return value;}
function digest(value){ensure(typeof value==='string'&&SHA.test(value),'DIGEST_REQUIRED');return value;}
async function root(path) {
  ensure(typeof path==='string'&&resolve(path)===path&&path!=='/','ABSOLUTE_PATH_REQUIRED');
  const stat=await lstat(path);
  ensure(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&!(stat.mode&0o077)&&
    await realpath(path)===path,'PRIVATE_DIRECTORY_REQUIRED');
  return {path,dev:stat.dev,ino:stat.ino};
}
async function unchanged(binding) {
  const now=await root(binding.path);
  ensure(now.dev===binding.dev&&now.ino===binding.ino,'DIRECTORY_CHANGED');
}
async function bytes(path,limit) {
  const before=await lstat(path);
  ensure(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&!(before.mode&0o077)&&
    before.nlink===1&&before.size<=limit,'PRIVATE_FILE_REQUIRED');
  const body=await readPrivateFile(path,limit),after=await lstat(path);
  ensure(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
    before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&body.length===after.size,'FILE_CHANGED');
  return body;
}
async function optional(path,limit) {
  try{return await bytes(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function parse(raw){try{return JSON.parse(decoder.decode(raw));}catch{throw new Error('SF93_RECOVERY_JSON_INVALID');}}
async function sync(path) {
  const file=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await file.sync();}finally{await file.close();}
}
function preparedRequest(kind,request,parent,sourceDirectory,entryName) {
  if(request?.schema!==SNAPSHOT_SCHEMA||request.operationId!==entryName)return null;
  if(kind==='snapshot'&&request.action==='snapshot'&&request.directory===sourceDirectory&&
    Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=1)
    return {action:'snapshot',input:{operationId:entryName,expectedRevision:request.expectedRevision}};
  if(kind==='received'&&request.action==='receive'&&SHA.test(request.expectedManifestSha256??'')&&
    dirname(request.snapshotDirectory??'')===join(parent,'snapshots')&&ID.test(basename(request.snapshotDirectory)))
    return {action:'receive',input:{operationId:entryName,snapshotName:basename(request.snapshotDirectory),
      expectedManifestSha256:request.expectedManifestSha256}};
  return null;
}

export async function inspectIncidentRecoveryRoot({directory,recoveryDirectory}) {
  const source=await root(directory),home=await root(recoveryDirectory);
  ensure(!childOf(recoveryDirectory,directory)&&!childOf(directory,recoveryDirectory),'SEPARATE_DIRECTORY_REQUIRED');
  return {directory:home.path,dev:home.dev,ino:home.ino};
}

/** No creation or worker startup occurs while reading a startup capability. */
export async function openIncidentRecoveryConsole({directory,recoveryDirectory,signal,allowContainedSource=false}) {
  const source=await root(directory),home=await root(recoveryDirectory);
  ensure(directory!==recoveryDirectory&&!childOf(recoveryDirectory,directory)&&
    (allowContainedSource||!childOf(directory,recoveryDirectory)),'SEPARATE_DIRECTORY_REQUIRED');
  const workspaceId=hash(JSON.stringify({schema:'stellar-forge.incident-recovery-console.v1',
    source,home})),bindings=new Map();
  async function check() {cancelled(signal);await unchanged(source);await unchanged(home);}
  async function folder(kind,{create=false}={}) {
    ensure(['snapshots','received'].includes(kind),'MEMBER_PATH_INVALID');await check();
    const path=join(home.path,kind);
    if(create) {
      const lease=await acquireStateLease(home.path);
      try {lease.assertHeld();await check();await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});await sync(home.path);}
      finally{await lease.close();}
    }
    let value;try{value=await root(path);}catch(error){if(!create&&error.code==='ENOENT')return null;throw error;}
    const prior=bindings.get(kind);
    if(prior)ensure(prior.dev===value.dev&&prior.ino===value.ino,'DIRECTORY_CHANGED');else bindings.set(kind,value);
    return value;
  }
  async function entry(kind,entryName) {
    name(entryName);const parent=await folder(kind);
    ensure(parent,'DIRECTORY_REQUIRED');const selected=await root(join(parent.path,entryName));
    await unchanged(parent);return selected;
  }
  async function describe(kind,entryName) {
    const selected=await entry(kind,entryName),requestBytes=await optional(join(selected.path,'request.json'),65_536);
    const request=requestBytes?parse(requestBytes):null;
    const row={kind:kind==='snapshots'?'snapshot':'received',name:entryName,directory:selected.path,status:'INCOMPLETE'};
    row.request=preparedRequest(row.kind,request,home.path,source.path,entryName);
    const abandoned=await optional(join(selected.path,'abandoned.json'),65_536);
    if(abandoned) {
      const value=parse(abandoned);
      ensure(kind==='snapshots'&&value?.schema==='stellar-forge.incident-snapshot-abandonment.v1'&&
        value.operationId===entryName&&value.directory===source.path&&value.outputDirectory===selected.path&&
        (value.expectedPinSha256===null||SHA.test(value.expectedPinSha256??''))&&
        typeof value.by==='string'&&typeof value.notes==='string','ABANDONMENT_BINDING_CHANGED');
      row.status='ABANDONED';row.abandonment={at:value.at??null,by:value.by,notes:value.notes};
      // A process can stop after the abandonment receipt but before pin release.
      // Reopen exposes that exact saved selection, including its operator reason.
      row.request={action:'abandon-snapshot',input:{operationId:entryName,
        expectedPinSha256:value.expectedPinSha256,by:value.by,notes:value.notes}};
      await unchanged(selected);return row;
    }
    if(kind==='snapshots') {
      const raw=await optional(join(selected.path,'manifest.json'),SNAPSHOT_LIMITS.metadataBytes);
      if(raw) {
        const value=parse(raw);
        ensure(value?.schema===SNAPSHOT_SCHEMA&&Array.isArray(value.files)&&SHA.test(value.stateSha256??''),'MANIFEST_INVALID');
        row.status='SAVED';row.manifestSha256=hash(raw);row.sourceRevision=value.stateRevision;
        row.stateSha256=value.stateSha256;row.files=value.files.length;
        row.totalBytes=value.files.reduce((sum,file)=>sum+(Number.isSafeInteger(file.bytes)?file.bytes:0),0);
        row.verified=false;
      } else row.sourceRevision=request?.expectedRevision??null;
    } else {
      const raw=await optional(join(selected.path,'received.json'),SNAPSHOT_LIMITS.metadataBytes);
      const operative=await optional(join(selected.path,'state.json'),SNAPSHOT_LIMITS.stateBytes);
      if(raw&&operative) {
        const receipt=parse(raw);
        ensure(receipt.operationId===entryName&&SHA.test(receipt.manifestSha256??''),'RECEIPT_BINDING_CHANGED');
        const state=await(await openIncidentStore(selected.path)).read();
        ensure(state.recovery?.id===entryName&&state.recovery.manifestSha256===receipt.manifestSha256,'RECEIVING_CHANGED');
        row.status='RECEIVED';row.manifestSha256=receipt.manifestSha256;row.sourceRevision=receipt.sourceRevision;
        row.receivedAt=receipt.receivedAt;row.currentRevision=state.revision;
        row.deliveryPaused=state.recovery.deliveryPaused;row.reconciledAt=state.recovery.reconciled?.at??null;
      }
    }
    await unchanged(selected);return row;
  }
  async function overview(input={}) {
    fields(input,['offset','limit']);
    const offset=input.offset??0,limit=input.limit??20;
    ensure(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=20,'PAGE_INVALID');
    await check();const names=[];
    for(const kind of ['snapshots','received']) {
      const parent=await folder(kind);if(!parent)continue;
      const rows=(await readdir(parent.path)).filter(value=>ID.test(value));
      ensure(rows.length<=256,'DIRECTORY_ENTRY_LIMIT');
      for(const entryName of rows)names.push({kind,name:entryName});
    }
    names.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.kind.localeCompare(b.kind));
    const items=[];
    for(const item of names.slice(offset,offset+limit)) {
      cancelled(signal);
      try{items.push(await describe(item.kind,item.name));}
      catch(error){items.push({kind:item.kind==='snapshots'?'snapshot':'received',name:item.name,status:'UNAVAILABLE',
        error:/^SF93_[A-Z0-9_]+/.exec(String(error.message))?.[0]??'SF93_RECOVERY_ENTRY_UNAVAILABLE'});}
    }
    const state=await(await openIncidentStore(source.path)).read();
    return {enabled:true,workspaceId,directory:home.path,sourceDirectory:source.path,sourceRevision:state.revision,
      recovery:recoveryView(state),pins:await listIncidentSnapshotPins({directory:source.path,signal}),
      items,page:{offset,limit,total:names.length,hasMore:offset+limit<names.length}};
  }
  async function run(action,input={}) {
    await check();
    if(action==='snapshot') {
      fields(input,['operationId','expectedRevision']);const parent=await folder('snapshots',{create:true});
      return exportIncidentSnapshot({directory:source.path,outputDirectory:join(parent.path,name(input.operationId)),
        operationId:input.operationId,expectedRevision:input.expectedRevision,signal});
    }
    if(action==='inspect-snapshot') {
      fields(input,['snapshotName','expectedManifestSha256']);
      const selected=await entry('snapshots',input.snapshotName);
      return inspectIncidentSnapshot({directory:selected.path,expectedManifestSha256:digest(input.expectedManifestSha256),signal});
    }
    if(action==='receive') {
      fields(input,['operationId','snapshotName','expectedManifestSha256']);
      const snapshot=await entry('snapshots',input.snapshotName),parent=await folder('received',{create:true});
      return receiveIncidentSnapshot({snapshotDirectory:snapshot.path,directory:join(parent.path,name(input.operationId)),
        operationId:input.operationId,expectedManifestSha256:digest(input.expectedManifestSha256),signal});
    }
    if(action==='abandon-snapshot') {
      fields(input,['operationId','expectedPinSha256','by','notes']);
      const selected=await entry('snapshots',input.operationId);
      return abandonIncidentSnapshot({directory:source.path,outputDirectory:selected.path,operationId:input.operationId,
        expectedPinSha256:input.expectedPinSha256===null?null:digest(input.expectedPinSha256),by:input.by,notes:input.notes,signal});
    }
    if(action==='reconcile') {
      fields(input,['operationId','expectedRecoveryId','expectedManifestSha256','expectedQueueSha256',
        'expectedConfigHash','originalWriterStopped','by','notes']);
      return reconcileIncidentRecovery({...input,directory:source.path,signal});
    }
    if(action==='open') {
      fields(input,['receiveName','expectedManifestSha256']);
      const selected=await entry('received',input.receiveName),row=await describe('received',input.receiveName);
      ensure(row.status==='RECEIVED'&&row.manifestSha256===digest(input.expectedManifestSha256),'RECEIVING_CHANGED');
      const store=await openIncidentStore(selected.path);
      const state=await store.transaction(async(state,io)=>{
        ensure(state.recovery?.id===input.receiveName&&state.recovery.manifestSha256===input.expectedManifestSha256,'RECEIVING_CHANGED');
        for(const id of incidentCaptureReferences(state)){cancelled(signal);await io.readCapture({id});}
        for(const item of state.recovery.history??[]) {
          await root(dirname(join(selected.path,item.path)));
          const raw=await bytes(join(selected.path,item.path),SNAPSHOT_LIMITS.metadataBytes);
          ensure(raw.length===item.bytes&&hash(raw)===item.sha256,'HISTORY_DIGEST_MISMATCH');
        }
        return structuredClone(state);
      },{readonly:true});
      await unchanged(selected);await check();
      return {directory:selected.path,state,receipt:row,identity:{dev:selected.dev,ino:selected.ino},workspaceId};
    }
    throw new Error('SF93_RECOVERY_ACTION_REQUIRED');
  }
  return {workspaceId,directory:home.path,overview,run};
}
