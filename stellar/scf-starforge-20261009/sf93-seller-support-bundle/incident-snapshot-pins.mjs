// MIT. Durable source capture pins for an interrupted SF93 snapshot.
// Every method runs inside the caller's original source-store transaction lease.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,rename,unlink} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash} from './incident-config.mjs';

export const SNAPSHOT_PIN_SCHEMA='stellar-forge.seller-incident-snapshot-pin.v1';
export const SNAPSHOT_PIN_RELEASE_SCHEMA='stellar-forge.seller-incident-snapshot-pin-release.v1';
export const SNAPSHOT_PIN_LIMITS=Object.freeze({active:8,pinBytes:32*1024*1024,receiptBytes:32_768,captures:22_000});
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const PIN=/^pin-([a-f0-9]{64})\.json$/;
const STAGE=/^stage-[a-f0-9-]{36}\.tmp$/;
const decoder=new TextDecoder('utf-8',{fatal:true});
const ensure=(value,code)=>{if(!value)throw new Error('SF93_SNAPSHOT_PIN_'+code);};
const encoded=value=>Buffer.from(JSON.stringify(value)+'\n');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const text=(value,max)=>typeof value==='string'&&Buffer.byteLength(value)<=max&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&Buffer.from(value).toString('utf8')===value;
function canonicalPath(value) {
  ensure(text(value,4096)&&!/\r|\n|\t/.test(value)&&resolve(value)===value&&value!=='/','ABSOLUTE_PATH_REQUIRED');
  return value;
}
function selection(operationId,outputDirectory,sourceDirectory) {
  ensure(typeof operationId==='string'&&ID.test(operationId),'OPERATION_ID_INVALID');
  outputDirectory=canonicalPath(outputDirectory);sourceDirectory=canonicalPath(sourceDirectory);
  ensure(outputDirectory!==sourceDirectory&&!outputDirectory.startsWith(sourceDirectory+sep)&&
    !sourceDirectory.startsWith(outputDirectory+sep),'SEPARATE_DIRECTORY_REQUIRED');
  return {operationId,outputDirectory,sourceDirectory};
}
const privateFile=stat=>stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&
  stat.uid===process.getuid()&&!(stat.mode&0o077);
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&
  a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.mode===b.mode&&a.uid===b.uid&&a.nlink===b.nlink;
function json(bytes) {
  try{return JSON.parse(decoder.decode(bytes));}catch{throw new Error('SF93_SNAPSHOT_PIN_JSON_INVALID');}
}
function metadata(pin,pinSha256) {
  const {stateBase64,...value}=pin;
  return {...value,pinSha256,released:false};
}

export function createSnapshotPins({directory,assertHeld,validateState,captureReferences,stateBytesLimit=16_777_216}) {
  directory=canonicalPath(directory);
  ensure(typeof assertHeld==='function'&&typeof validateState==='function'&&typeof captureReferences==='function'&&
    Number.isSafeInteger(stateBytesLimit)&&stateBytesLimit>0&&stateBytesLimit<=16_777_216,'CONFIGURATION_INVALID');
  const folder=join(directory,'snapshot-pins');
  let sourceIdentity=null,folderIdentity=null,busy=false;
  function guard(signal) {
    ensure(assertHeld()!==false,'SOURCE_LEASE_REQUIRED');
    if(signal?.aborted)throw new Error('SF93_RECOVERY_ABORTED');
  }
  async function privateDirectory(path) {
    const stat=await lstat(path);
    ensure(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&
      !(stat.mode&0o077)&&await realpath(path)===path,'PRIVATE_DIRECTORY_REQUIRED');
    return {dev:stat.dev,ino:stat.ino};
  }
  async function unchanged(path,identity) {
    const current=await privateDirectory(path);
    ensure(current.dev===identity.dev&&current.ino===identity.ino,'DIRECTORY_CHANGED');
  }
  async function syncDirectory(path) {
    const file=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await file.sync();}finally{await file.close();}
  }
  async function root(create,signal) {
    guard(signal);
    const actual=await privateDirectory(directory);
    if(sourceIdentity)ensure(same(actual,sourceIdentity),'SOURCE_DIRECTORY_CHANGED');
    else sourceIdentity=actual;
    let actualFolder;
    try{actualFolder=await privateDirectory(folder);}
    catch(error) {
      if(error.code!=='ENOENT')throw error;
      ensure(!folderIdentity,'DIRECTORY_CHANGED');
      if(!create)return null;
      guard(signal);await unchanged(directory,sourceIdentity);
      await mkdir(folder,{mode:0o700});
      await syncDirectory(directory);
      actualFolder=await privateDirectory(folder);
    }
    if(folderIdentity)ensure(same(actualFolder,folderIdentity),'DIRECTORY_CHANGED');
    else folderIdentity=actualFolder;
    guard(signal);return actualFolder;
  }
  async function checkRoot(identity,signal) {
    guard(signal);await unchanged(directory,sourceIdentity);
    if(identity)await unchanged(folder,identity);
    guard(signal);
  }
  async function run(create,signal,action) {
    ensure(!busy,'CONCURRENT_METHOD');
    busy=true;
    try {
      const identity=await root(create,signal);
      const result=await action(identity);
      await checkRoot(identity,signal);return result;
    } finally {busy=false;}
  }
  async function readFile(path,limit,signal) {
    guard(signal);
    const before=await lstat(path);
    ensure(privateFile(before)&&before.size>0&&before.size<=limit,'PRIVATE_BOUNDED_FILE_REQUIRED');
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      ensure(sameFile(before,await file.stat()),'FILE_CHANGED');
      const chunks=[];let size=0;
      for(;;) {
        guard(signal);
        const bytes=Buffer.alloc(Math.min(65_536,limit+1-size));
        const result=await file.read(bytes,0,bytes.length,null);
        if(!result.bytesRead)break;
        size+=result.bytesRead;ensure(size<=limit,'FILE_SIZE_LIMIT');
        chunks.push(bytes.subarray(0,result.bytesRead));
      }
      const after=await file.stat(),named=await lstat(path);
      ensure(privateFile(after)&&privateFile(named)&&sameFile(before,after)&&sameFile(after,named)&&
        size===after.size,'FILE_CHANGED');
      guard(signal);return Buffer.concat(chunks);
    } finally {await file.close();}
  }
  async function optionalFile(path,limit,signal) {
    try{return await readFile(path,limit,signal);}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  async function collectStaging(identity,signal) {
    let changed=false;
    for(const name of await readdir(folder))if(STAGE.test(name)) {
      guard(signal);const path=join(folder,name),stat=await lstat(path);
      ensure(privateFile(stat)&&stat.size<=SNAPSHOT_PIN_LIMITS.pinBytes,'STAGING_FILE_CHANGED');
      await checkRoot(identity,signal);await unlink(path);changed=true;
    }
    if(changed)await syncDirectory(folder);
  }
  async function publish(name,bytes,identity,signal) {
    ensure(bytes.length>0&&bytes.length<=SNAPSHOT_PIN_LIMITS.pinBytes,'FILE_SIZE_LIMIT');
    const target=join(folder,name),temporary=join(folder,'stage-'+randomUUID()+'.tmp');
    await checkRoot(identity,signal);
    const previous=await optionalFile(target,SNAPSHOT_PIN_LIMITS.pinBytes,signal);
    if(previous!==null) {
      ensure(previous.equals(bytes),'PUBLICATION_CONFLICT');
      await syncDirectory(folder);return;
    }
    let file,owned=false;
    try {
      file=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      owned=true;
      for(let offset=0;offset<bytes.length;offset+=65_536) {
        guard(signal);await file.writeFile(bytes.subarray(offset,offset+65_536));
      }
      await file.sync();await file.close();file=null;
      await checkRoot(identity,signal);
      // The original source transaction lease serializes this reserved namespace.
      // An interrupted write can expose either a complete pin or its private stage.
      ensure(await optionalFile(target,SNAPSHOT_PIN_LIMITS.pinBytes,signal)===null,'PUBLICATION_CONFLICT');
      await rename(temporary,target);
      await syncDirectory(folder);
      guard(signal);
    } finally {
      await file?.close().catch(()=>{});
      if(owned)await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  }
  const names=operationId=>({pin:'pin-'+hash(operationId)+'.json',receipt:'release-'+hash(operationId)+'.json'});
  function stateValue(bytes) {
    ensure(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=stateBytesLimit,'STATE_SIZE_LIMIT');
    const state=validateState(json(bytes));
    ensure(state&&Number.isSafeInteger(state.revision)&&state.revision>=1&&
      Number.isSafeInteger(state.configRevision)&&state.configRevision>=1&&SHA.test(state.configHash??''),'STATE_INVALID');
    const refs=[...captureReferences(state)];
    ensure(refs.length<=SNAPSHOT_PIN_LIMITS.captures&&refs.every(value=>typeof value==='string'&&SHA.test(value))&&
      new Set(refs).size===refs.length,'CAPTURE_REFERENCES_INVALID');
    return {state,captureIds:refs.sort()};
  }
  function decodePin(bytes,name) {
    const pin=json(bytes);
    ensure(pin&&pin.schema===SNAPSHOT_PIN_SCHEMA&&bytes.equals(encoded(pin))&&
      Object.keys(pin).sort().join(',')===['schema','operationId','sourceDirectory','outputDirectory','expectedRevision',
        'sourceRevision','configRevision','configHash','createdAt','stateSha256','stateBytesCount','captureIds','stateBase64'].sort().join(','),
      'RECORD_INVALID');
    selection(pin.operationId,pin.outputDirectory,pin.sourceDirectory);
    ensure(pin.sourceDirectory===directory&&name===names(pin.operationId).pin&&instant(pin.createdAt)&&
      Number.isSafeInteger(pin.expectedRevision)&&pin.expectedRevision>=1&&pin.sourceRevision===pin.expectedRevision&&
      SHA.test(pin.stateSha256??'')&&typeof pin.stateBase64==='string'&&Array.isArray(pin.captureIds)&&
      Number.isSafeInteger(pin.stateBytesCount)&&pin.stateBytesCount>0&&pin.stateBytesCount<=stateBytesLimit,'RECORD_INVALID');
    const raw=Buffer.from(pin.stateBase64,'base64');
    ensure(raw.length===pin.stateBytesCount&&raw.toString('base64')===pin.stateBase64&&hash(raw)===pin.stateSha256,
      'STATE_DIGEST_MISMATCH');
    const checked=stateValue(raw);
    ensure(checked.state.revision===pin.sourceRevision&&checked.state.configRevision===pin.configRevision&&
      checked.state.configHash===pin.configHash&&same(checked.captureIds,pin.captureIds),'STATE_BINDING_CHANGED');
    return {pin,pinSha256:hash(bytes),stateBytes:raw};
  }
  function decodeReceipt(bytes,name) {
    const receipt=json(bytes);
    ensure(receipt&&receipt.schema===SNAPSHOT_PIN_RELEASE_SCHEMA&&bytes.equals(encoded(receipt))&&
      Object.keys(receipt).sort().join(',')===['schema','operationId','sourceDirectory','outputDirectory','expectedRevision',
        'sourceRevision','configRevision','configHash','stateSha256','pinSha256','releasedAt','disposition',
        'manifestSha256','by','notes'].sort().join(','),'RELEASE_INVALID');
    selection(receipt.operationId,receipt.outputDirectory,receipt.sourceDirectory);
    ensure(receipt.sourceDirectory===directory&&name===names(receipt.operationId).receipt&&instant(receipt.releasedAt)&&
      Number.isSafeInteger(receipt.expectedRevision)&&receipt.expectedRevision>=1&&
      receipt.sourceRevision===receipt.expectedRevision&&Number.isSafeInteger(receipt.configRevision)&&receipt.configRevision>=1&&
      SHA.test(receipt.configHash??'')&&SHA.test(receipt.stateSha256??'')&&SHA.test(receipt.pinSha256??''),'RELEASE_INVALID');
    releaseRequest({...receipt,expectedPinSha256:receipt.pinSha256});
    return receipt;
  }
  function checkSelection(record,selected) {
    ensure(record.operationId===selected.operationId&&record.sourceDirectory===selected.sourceDirectory&&
      record.outputDirectory===selected.outputDirectory,'SELECTION_CONFLICT');
  }
  function checkRelease(receipt,record) {
    checkSelection(record.pin,receipt);
    ensure(record.pinSha256===receipt.pinSha256&&record.pin.sourceRevision===receipt.sourceRevision&&
      record.pin.configRevision===receipt.configRevision&&record.pin.configHash===receipt.configHash&&
      record.pin.stateSha256===receipt.stateSha256,'RELEASE_PIN_CHANGED');
  }
  async function record(operationId,signal) {
    const file=names(operationId),bytes=await optionalFile(join(folder,file.pin),SNAPSHOT_PIN_LIMITS.pinBytes,signal);
    return bytes===null?null:decodePin(bytes,file.pin);
  }
  async function receipt(operationId,signal) {
    const file=names(operationId),bytes=await optionalFile(join(folder,file.receipt),SNAPSHOT_PIN_LIMITS.receiptBytes,signal);
    return bytes===null?null:decodeReceipt(bytes,file.receipt);
  }
  async function active(identity,signal) {
    if(!identity)return [];
    const pins=[];
    for(const name of (await readdir(folder)).sort())if(PIN.test(name)) {
      const retained=decodePin(await readFile(join(folder,name),SNAPSHOT_PIN_LIMITS.pinBytes,signal),name);
      const released=await receipt(retained.pin.operationId,signal);
      if(released)checkRelease(released,retained);
      else pins.push(retained);
    }
    ensure(pins.length<=SNAPSHOT_PIN_LIMITS.active,'ACTIVE_LIMIT');
    return pins;
  }
  function releaseRequest(input) {
    const {expectedPinSha256,disposition,manifestSha256=null,by='',notes=''}=input;
    ensure(SHA.test(expectedPinSha256??'')&&['COMPLETED','ABANDONED'].includes(disposition)&&
      (manifestSha256===null||typeof manifestSha256==='string'&&SHA.test(manifestSha256))&&
      text(by,160)&&!/[\r\n\t]/.test(by)&&text(notes,2000),'RELEASE_SELECTION_INVALID');
    ensure(disposition!=='COMPLETED'||manifestSha256!==null,'MANIFEST_DIGEST_REQUIRED');
    ensure(disposition!=='ABANDONED'||Boolean(by.trim()&&notes.trim()),'ABANDONMENT_DETAILS_REQUIRED');
    return {pinSha256:expectedPinSha256,disposition,manifestSha256,by,notes};
  }
  async function removeReleased(released,identity,signal) {
    const retained=await record(released.operationId,signal);
    if(retained) {
      checkRelease(released,retained);await checkRoot(identity,signal);
      await unlink(join(folder,names(released.operationId).pin));
      await syncDirectory(folder);
    }
  }
  return {
    async register({operationId,outputDirectory,expectedRevision,stateBytes,signal}) {
      const selected=selection(operationId,outputDirectory,directory);
      ensure(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'REVISION_REQUIRED');
      return run(true,signal,async identity=>{
        await collectStaging(identity,signal);
        const released=await receipt(operationId,signal);
        if(released) {
          checkSelection(released,selected);
          const error=new Error('SF93_SNAPSHOT_PIN_RELEASED');
          error.receipt={...released,released:true};throw error;
        }
        const prior=await record(operationId,signal);
        if(prior) {
          checkSelection(prior.pin,selected);
          ensure(prior.pin.expectedRevision===expectedRevision,'SELECTION_CONFLICT');
          await syncDirectory(folder);
          return {...metadata(prior.pin,prior.pinSha256),stateBytes:prior.stateBytes,reused:true};
        }
        ensure((await active(identity,signal)).length<SNAPSHOT_PIN_LIMITS.active,'ACTIVE_LIMIT');
        const raw=Buffer.isBuffer(stateBytes)?Buffer.from(stateBytes):null;
        const checked=stateValue(raw);
        ensure(checked.state.revision===expectedRevision,'REVISION_CONFLICT');
        const pin={schema:SNAPSHOT_PIN_SCHEMA,...selected,expectedRevision,sourceRevision:checked.state.revision,
          configRevision:checked.state.configRevision,configHash:checked.state.configHash,createdAt:new Date().toISOString(),
          stateSha256:hash(raw),stateBytesCount:raw.length,captureIds:checked.captureIds,stateBase64:raw.toString('base64')};
        const bytes=encoded(pin);
        ensure(bytes.length<=SNAPSHOT_PIN_LIMITS.pinBytes,'FILE_SIZE_LIMIT');
        await publish(names(operationId).pin,bytes,identity,signal);
        return {...metadata(pin,hash(bytes)),stateBytes:raw,reused:false};
      });
    },
    async read({operationId,outputDirectory,signal}) {
      const selected=selection(operationId,outputDirectory,directory);
      return run(false,signal,async identity=>{
        if(!identity)return null;
        const released=await receipt(operationId,signal),retained=await record(operationId,signal);
        if(released) {
          checkSelection(released,selected);if(retained)checkRelease(released,retained);
          await syncDirectory(folder);return {...released,released:true};
        }
        if(!retained)return null;
        checkSelection(retained.pin,selected);await syncDirectory(folder);
        return {...metadata(retained.pin,retained.pinSha256),stateBytes:retained.stateBytes};
      });
    },
    async list() {
      return run(false,undefined,async identity=>(await active(identity)).map(row=>metadata(row.pin,row.pinSha256)));
    },
    async references() {
      return run(false,undefined,async identity=>new Set((await active(identity)).flatMap(row=>row.pin.captureIds)));
    },
    async release({operationId,outputDirectory,signal,...input}) {
      const selected=selection(operationId,outputDirectory,directory),request=releaseRequest(input);
      return run(false,signal,async identity=>{
        ensure(identity,'NOT_FOUND');await collectStaging(identity,signal);
        const prior=await receipt(operationId,signal);
        if(prior) {
          checkSelection(prior,selected);
          ensure(Object.entries(request).every(([key,value])=>prior[key]===value),'RELEASE_CONFLICT');
          await syncDirectory(folder);
          await removeReleased(prior,identity,signal);
          return {...prior,released:true,reused:true};
        }
        const retained=await record(operationId,signal);
        ensure(retained,'NOT_FOUND');checkSelection(retained.pin,selected);
        ensure(retained.pinSha256===request.pinSha256,'RELEASE_PIN_CHANGED');
        const pin=retained.pin;
        const released={schema:SNAPSHOT_PIN_RELEASE_SCHEMA,...selected,expectedRevision:pin.expectedRevision,
          sourceRevision:pin.sourceRevision,configRevision:pin.configRevision,configHash:pin.configHash,
          stateSha256:pin.stateSha256,...request,releasedAt:new Date().toISOString()};
        const bytes=encoded(released);
        ensure(bytes.length<=SNAPSHOT_PIN_LIMITS.receiptBytes,'FILE_SIZE_LIMIT');
        // The durable receipt makes release authoritative before a capture pin is removed.
        await publish(names(operationId).receipt,bytes,identity,signal);
        await removeReleased(released,identity,signal);
        return {...released,released:true,reused:false};
      });
    }
  };
}
