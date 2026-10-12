// MIT. Resume one original handover upload on its retained payload inode.
import { constants as C } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HASH, canonical, digest, exact, directory, present, readJSON, publishJSON,
  syncDirectory, operation, requireEmptyOperation, fail,
} from './handover-files.mjs';
import {
  openHandoverFile, handoverFileIdentity, readHandoverRange,
  writeHandoverBytes, hashHandoverFile, syncAndCloseHandoverFile,
} from './handover-archive.mjs';
import { matchCapturedHandoverRecovery } from './handover-recovery-files.mjs';

export const CAPTURED_HANDOVER_UPLOAD_SCHEMA = 'stellar-forge.captured-api-handover-upload.v1';
export const CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES = 1024 * 1024;
const PAYLOAD_SCHEMA = 'stellar-forge.captured-api-handover-upload-payload.v1';
const CHUNK_SCHEMA = 'stellar-forge.captured-api-handover-upload-chunk.v1';
const COMPLETE_SCHEMA = 'stellar-forge.captured-api-handover-upload-complete.v1';
const PAYLOAD = 'payload.sfhandover';
const PENDING = 'records/pending-chunk.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function identity(id) {
  if (!UUID.test(id ?? '')) fail('CAPTURED_HANDOVER_INPUT', 'Use the original upload UUID.');
  return id;
}
function length(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum)
    fail('CAPTURED_HANDOVER_INPUT', 'Use the original exact upload byte count.');
  return value;
}
function selectedName(name) {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() ||
      Buffer.byteLength(name) > 255 || /[\\/\x00-\x1f\x7f]/.test(name) ||
      !name.toLowerCase().endsWith('.sfhandover') || name.startsWith('.'))
    fail('CAPTURED_HANDOVER_INPUT', 'Choose the original .sfhandover filename.');
  return name;
}
function uploadInput({id,name,bytes,expectedSha256}) {
  identity(id); selectedName(name); length(bytes,1);
  if (expectedSha256 !== undefined && !HASH.test(expectedSha256))
    fail('CAPTURED_HANDOVER_INPUT', 'Use the complete original archive SHA-256.');
  return {schema:CAPTURED_HANDOVER_UPLOAD_SCHEMA,id,name,totalBytes:bytes,
    ...(expectedSha256 === undefined ? {} : {expectedSha256})};
}
function inputFromRecord(value,id) {
  exact(value,['schema','id','name','totalBytes','expectedSha256'],
    ['schema','id','name','totalBytes']);
  const normalized = uploadInput({id:value.id,name:value.name,bytes:value.totalBytes,
    expectedSha256:value.expectedSha256});
  if (value.schema !== CAPTURED_HANDOVER_UPLOAD_SCHEMA || value.id !== id ||
      canonical(normalized) !== canonical(value))
    fail('CAPTURED_HANDOVER_CHANGED', 'This directory belongs to a different original upload.');
  return value;
}
function rejected(code,message,metadata,receivedBytes,pendingChunk) {
  throw Object.assign(new Error(message),{code,status:409,id:metadata.id,
    totalBytes:metadata.totalBytes,receivedBytes,...(pendingChunk ? {pendingChunk} : {})});
}
async function inUpload(root,id,work,{create=false}={}) {
  identity(id); root = await directory(root);
  return operation(join(root,id),work,{create});
}
async function payload(root,metadata,{create=false,writable=false}={}) {
  const retained = await readJSON(root,'records/payload.json',true), path = join(root,PAYLOAD);
  if (!await present(path)) {
    if (retained || !create)
      fail('CAPTURED_HANDOVER_CHANGED', 'The original retained upload payload is absent.');
    const created = await open(path,C.O_CREAT|C.O_EXCL|C.O_RDWR|C.O_NOFOLLOW,0o600);
    await syncAndCloseHandoverFile(created); await syncDirectory(root);
  }
  const held = await openHandoverFile(path,{writable});
  try {
    if (held.bytes > metadata.totalBytes)
      fail('CAPTURED_HANDOVER_CHANGED', 'The retained upload exceeds its original complete length.');
    const binding = {schema:PAYLOAD_SCHEMA,device:held.identity.device,inode:held.identity.inode};
    if (retained) {
      if (canonical(retained) !== canonical(binding) &&
          !await matchCapturedHandoverRecovery(root,{kind:'upload',file:PAYLOAD,
            identity:held.identity,records:{'operation.json':metadata,'records/payload.json':retained},mode:'payload'}))
        fail('CAPTURED_HANDOVER_CHANGED', 'The original upload payload inode changed.');
    } else {
      if (!create || held.bytes !== 0)
        fail('CAPTURED_HANDOVER_CHANGED', 'Resume original upload initialization before adding bytes.');
      await publishJSON(root,'records/payload.json',binding);
    }
    return held;
  } catch (error) { await held.close(); throw error; }
}
function validatePending(value,metadata) {
  exact(value,['schema','offset','bytes','sha256'],['schema','offset','bytes','sha256']);
  length(value.offset); length(value.bytes,1);
  if (value.schema !== CHUNK_SCHEMA || value.bytes > CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES ||
      !Number.isSafeInteger(value.offset+value.bytes) ||
      value.offset+value.bytes > metadata.totalBytes || !HASH.test(value.sha256 ?? ''))
    fail('CAPTURED_HANDOVER_CHANGED', 'The retained original upload chunk changed.');
  return value;
}
const chunkView = value => value
  ? {offset:value.offset,bytes:value.bytes,sha256:value.sha256} : null;
async function pendingChunk(root,metadata,held) {
  const saved = await readJSON(root,PENDING,true);
  if (!saved) return null;
  const pending = validatePending(saved,metadata);
  const stat = await held.assertHeld({stable:false}), size = Number(stat.size), end = pending.offset+pending.bytes;
  if (size < pending.offset || size > end)
    rejected('CAPTURED_HANDOVER_UPLOAD_OFFSET','The retained payload differs from its original pending chunk.',
      metadata,size,chunkView(pending));
  if (size < end) return pending;
  const original = await readHandoverRange(held,pending.offset,pending.bytes);
  if (digest(original) !== pending.sha256)
    rejected('CAPTURED_HANDOVER_UPLOAD_CONFLICT','The completed original chunk has different bytes.',
      metadata,size,chunkView(pending));
  await held.handle.sync();
  if (canonical(await readJSON(root,PENDING)) !== canonical(pending))
    fail('CAPTURED_HANDOVER_CHANGED', 'The pending original chunk record changed.');
  await unlink(join(root,PENDING)); await syncDirectory(join(root,'records'));
  return null;
}
async function completeRecord(root,value,metadata,held,stat) {
  if (value?.schema !== COMPLETE_SCHEMA || value.id !== metadata.id ||
      value.inputSha256 !== digest(Buffer.from(canonical(metadata))) ||
      value.bytes !== metadata.totalBytes || !HASH.test(value.sha256 ?? '') ||
      metadata.expectedSha256 !== undefined && metadata.expectedSha256 !== value.sha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'The original finished upload or completion record changed.');
  if ((canonical(value.identity) !== canonical(handoverFileIdentity(stat)) ||
       held.identity.device !== value.identity?.device || held.identity.inode !== value.identity?.inode) &&
      !await matchCapturedHandoverRecovery(root,{kind:'upload',file:PAYLOAD,
        identity:handoverFileIdentity(stat),records:{'operation.json':metadata,
          'records/payload.json':await readJSON(root,'records/payload.json'),'received.json':value},mode:'complete'}))
    fail('CAPTURED_HANDOVER_CHANGED', 'The original finished upload or completion record changed.');
  return value;
}
async function view(root,metadata,held,{pending}={}) {
  const stat = await held.assertHeld({stable:false}), receivedBytes = Number(stat.size);
  const complete = await readJSON(root,'received.json',true);
  const common = {id:metadata.id,name:metadata.name,totalBytes:metadata.totalBytes,
    receivedBytes,chunkBytes:CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES};
  if (complete) {
    await completeRecord(root,complete,metadata,held,stat);
    return {...common,state:'COMPLETE',path:held.path,sha256:complete.sha256};
  }
  return {...common,state:receivedBytes === metadata.totalBytes ? 'READY_TO_FINISH' : 'UPLOADING',
    ...(pending ? {pendingChunk:chunkView(pending)} : {})};
}
export async function initializeCapturedHandoverUpload({root,id,name,bytes,expectedSha256}) {
  const metadata = uploadInput({id,name,bytes,expectedSha256});
  return inUpload(root,id,async selected => {
    await requireEmptyOperation(selected,'operation.json');
    const previous = await readJSON(selected,'operation.json',true);
    if (previous && canonical(previous) !== canonical(metadata))
      fail('CAPTURED_HANDOVER_CONFLICT', 'This upload UUID already names a different original file.');
    await publishJSON(selected,'operation.json',metadata);
    const held = await payload(selected,metadata,{create:true});
    try {
      const complete = await readJSON(selected,'received.json',true);
      const pending = complete ? null : await pendingChunk(selected,metadata,held);
      return await view(selected,metadata,held,{pending});
    } finally { await held.close(); }
  },{create:true});
}
export async function inspectCapturedHandoverUpload({root,id}) {
  return inUpload(root,id,async selected => {
    const metadata = inputFromRecord(await readJSON(selected,'operation.json'),id);
    const held = await payload(selected,metadata,{create:true});
    try {
      const complete = await readJSON(selected,'received.json',true);
      const pending = complete ? null : await pendingChunk(selected,metadata,held);
      return await view(selected,metadata,held,{pending});
    } finally { await held.close(); }
  });
}
export async function appendCapturedHandoverUpload({root,id,offset,bytes:chunk,sha256}) {
  identity(id); length(offset);
  if (!Buffer.isBuffer(chunk) || !chunk.length || chunk.length > CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES ||
      !HASH.test(sha256 ?? '') || digest(chunk) !== sha256)
    fail('CAPTURED_HANDOVER_INPUT', 'Send the exact original chunk bytes and SHA-256, up to 1 MiB.');
  return inUpload(root,id,async (selected,lease) => {
    const metadata = inputFromRecord(await readJSON(selected,'operation.json'),id);
    if (!Number.isSafeInteger(offset+chunk.length) || offset+chunk.length > metadata.totalBytes)
      fail('CAPTURED_HANDOVER_INPUT', 'Keep this original chunk inside the selected complete upload.');
    const complete = await readJSON(selected,'received.json',true);
    const held = await payload(selected,metadata,{writable:!complete});
    try {
      if (complete) {
        const result = await view(selected,metadata,held);
        if (!(await readHandoverRange(held,offset,chunk.length)).equals(chunk))
          rejected('CAPTURED_HANDOVER_UPLOAD_CONFLICT','This completed upload contains different original bytes.',
            metadata,result.receivedBytes);
        await held.assertHeld({stable:true}); return result;
      }
      const pending = await pendingChunk(selected,metadata,held);
      const requested = {schema:CHUNK_SCHEMA,offset,bytes:chunk.length,sha256};
      const size = Number((await held.assertHeld({stable:false})).size);
      if (pending && canonical(pending) !== canonical(requested))
        rejected('CAPTURED_HANDOVER_UPLOAD_PENDING','Resume the exact original pending chunk before advancing.',
          metadata,size,chunkView(pending));
      if (offset > size)
        rejected('CAPTURED_HANDOVER_UPLOAD_OFFSET','Resume at the received prefix; an upload cannot contain gaps.',
          metadata,size,chunkView(pending));
      const overlap = Math.min(chunk.length,size-offset);
      if (overlap && !(await readHandoverRange(held,offset,overlap)).equals(chunk.subarray(0,overlap)))
        rejected('CAPTURED_HANDOVER_UPLOAD_CONFLICT','The retained upload prefix differs from this original chunk.',
          metadata,size,chunkView(pending));
      if (offset+chunk.length <= size) {
        await held.handle.sync(); return await view(selected,metadata,held);
      }
      await publishJSON(selected,PENDING,requested); lease.assertHeld();
      await writeHandoverBytes(held.handle,chunk.subarray(overlap),offset+overlap);
      await held.handle.sync(); lease.assertHeld();
      const after = await held.assertHeld({stable:false});
      if (Number(after.size) !== offset+chunk.length)
        fail('CAPTURED_HANDOVER_CHANGED', 'The original upload grew beyond this retained chunk.');
      const stillPending = await pendingChunk(selected,metadata,held);
      if (stillPending) fail('CAPTURED_HANDOVER_INCOMPLETE', 'The original chunk is still incomplete.');
      return await view(selected,metadata,held);
    } finally { await held.close(); }
  });
}
export async function finishCapturedHandoverUpload({root,id}) {
  return inUpload(root,id,async (selected,lease) => {
    const metadata = inputFromRecord(await readJSON(selected,'operation.json'),id);
    const held = await payload(selected,metadata);
    try {
      const complete = await readJSON(selected,'received.json',true);
      if (complete) return await view(selected,metadata,held);
      const pending = await pendingChunk(selected,metadata,held);
      const stat = await held.assertHeld({stable:true});
      if (pending || Number(stat.size) !== metadata.totalBytes)
        rejected('CAPTURED_HANDOVER_UPLOAD_INCOMPLETE','Continue the original upload before finishing.',
          metadata,Number(stat.size),chunkView(pending));
      const sha256 = await hashHandoverFile(held);
      if (metadata.expectedSha256 !== undefined && sha256 !== metadata.expectedSha256)
        fail('CAPTURED_HANDOVER_UPLOAD_HASH','The completed payload differs from the selected original archive SHA-256.');
      await held.handle.sync(); lease.assertHeld();
      const finalStat = await held.assertHeld({stable:true});
      await publishJSON(selected,'received.json',{schema:COMPLETE_SCHEMA,id:metadata.id,
        inputSha256:digest(Buffer.from(canonical(metadata))),bytes:metadata.totalBytes,
        sha256,identity:handoverFileIdentity(finalStat)});
      return await view(selected,metadata,held);
    } finally { await held.close(); }
  });
}
