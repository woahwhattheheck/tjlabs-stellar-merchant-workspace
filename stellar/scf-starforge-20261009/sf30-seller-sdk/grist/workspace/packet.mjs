// MIT. Authoring projection around the original complete Grist capture packet.
import { join, dirname } from 'node:path';
import { rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { bytes, digest, readPrivate, createFile, syncDirectory, fault } from '../../postgres/publisher/files.mjs';
import { MAX_CAPTURE_BYTES, only, readGristSourceFile } from '../declaration.mjs';
import { readGristCapture, bindGristCapture, exportGristCapturePacket,
  readGristCapturePacket, importGristCapturePacket } from '../capture.mjs';

export const PACKET_SCHEMA = 'stellar-forge.grist-source-packet.v1';
export const MAX_PACKET_BYTES = MAX_CAPTURE_BYTES * 2 + 16777216;
const HASH = /^[a-f0-9]{64}$/;
const parse = content => { try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content)); }
  catch { throw fault('GRIST_PACKET_JSON_INVALID'); } };
function origin(value) {
  if (value === null || value === undefined) return null;
  only(value,['sourceSha256','sourceBytes','captureSha256'],'GRIST_PACKET_ORIGIN_INVALID');
  if (!HASH.test(value.sourceSha256 ?? '') || !HASH.test(value.captureSha256 ?? '') ||
      !Number.isSafeInteger(value.sourceBytes) || value.sourceBytes < 1)
    throw fault('GRIST_PACKET_ORIGIN_INVALID');
  return {...value};
}
function version(value) {
  if (value === null || value === undefined) return null;
  only(value,['id','title','reviewer','note','sourceSha256','createdAt','rowCount','queries','originalMode'],
    'GRIST_PACKET_VERSION_INVALID');
  if (!Number.isSafeInteger(value.id) || value.id < 1 || !HASH.test(value.sourceSha256 ?? '') ||
      !Number.isSafeInteger(value.rowCount) || value.rowCount < 0 || value.originalMode !== 'capture' ||
      typeof value.title !== 'string' || !value.title || value.title.length > 128 ||
      typeof value.reviewer !== 'string' || !value.reviewer || value.reviewer.length > 128 ||
      typeof value.note !== 'string' || !value.note || value.note.length > 2000 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)))
    throw fault('GRIST_PACKET_VERSION_INVALID');
  return structuredClone(value);
}
export async function validatePacket(packet) {
  only(packet,['schema','createdAt','source','origin','version','capture'],'GRIST_PACKET_INVALID');
  if (packet.schema !== PACKET_SCHEMA || typeof packet.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(packet.createdAt))) throw fault('GRIST_PACKET_INVALID');
  only(packet.source,['schema','server','apiVersion','docId','tableId','filter','sourceOrder','connection','queries'],
    'GRIST_PACKET_SOURCE_INVALID');
  if (packet.source.schema !== 'stellar-forge.grist-source.v1') throw fault('GRIST_PACKET_SOURCE_INVALID');
  only(packet.source.connection,['kind','file','sha256'],'GRIST_PACKET_SOURCE_INVALID');
  if (packet.source.connection.kind !== 'capture' || packet.source.connection.file !== 'capture/capture.json')
    throw fault('GRIST_PACKET_SOURCE_INVALID');
  origin(packet.origin); version(packet.version);
  const captureBytes = bytes(packet.capture);
  if (captureBytes.length > MAX_PACKET_BYTES) throw fault('GRIST_PACKET_SIZE_LIMIT');
  // The provider owns every manifest, page, metadata, count and completeness
  // rule. The facade neither reconstructs nor independently validates those files.
  const capture = await readGristCapturePacket(captureBytes);
  bindGristCapture(capture,packet.source);
  if (packet.source.connection.sha256 !== capture.manifestSha256 ||
      packet.origin && packet.origin.captureSha256 !== capture.manifestSha256)
    throw fault('GRIST_PACKET_SELECTION_CHANGED');
  return {capture,captureBytes,manifest:capture.manifest,manifestBytes:capture.manifestBytes,
    manifestSha256:capture.manifestSha256,source:structuredClone(packet.source)};
}
export async function createOrVerify(path,content,maximum=MAX_PACKET_BYTES) {
  try {
    const existing = await readPrivate(path,maximum);
    if (existing.length !== content.length || digest(existing) !== digest(content))
      throw fault('GRIST_RETAINED_FILE_CHANGED');
    return;
  } catch (issue) { if (issue.code !== 'ENOENT') throw issue; }
  const temporary = join(dirname(path),'.write-'+randomUUID());
  await createFile(temporary,content);
  // The original workspace lease or a newly owned package directory excludes
  // another writer. The final name receives only a complete durable file.
  try { await rename(temporary,path); }
  catch (issue) { await unlink(temporary).catch(()=>{}); throw issue; }
  await syncDirectory(dirname(path));
}
export async function retainPacket(packet,directory) {
  const checked = await validatePacket(packet);
  return importGristCapturePacket(checked.captureBytes,directory,checked.source,{resume:true});
}
export async function packetFromCapture(capture,config,{origin:originalOrigin=null,version:originalVersion=null}={}) {
  bindGristCapture(capture,config);
  const {fields,...selected} = capture.manifest.selection;
  const source = {schema:'stellar-forge.grist-source.v1',...structuredClone(selected),
    queries:structuredClone(config.queries),
    connection:{kind:'capture',file:'capture/capture.json',sha256:capture.manifestSha256}};
  const captureBytes = await exportGristCapturePacket(capture);
  if (captureBytes.length > MAX_PACKET_BYTES) throw fault('GRIST_PACKET_SIZE_LIMIT');
  return {schema:PACKET_SCHEMA,createdAt:capture.manifest.completedAt,source,
    origin:origin(originalOrigin),version:version(originalVersion),capture:parse(captureBytes)};
}
export async function makeGristSourcePacket(sourceFile) {
  const original = await readGristSourceFile(sourceFile);
  if (!original.captureFile) throw fault('GRIST_FROZEN_SOURCE_REQUIRED',
    'Capture and freeze the original source before importing it; this action performs no provider read.');
  const capture = await readGristCapture(original.captureFile,original.config.connection.sha256);
  return packetFromCapture(capture,original.config,{origin:{sourceSha256:original.hash,
    sourceBytes:original.original.length,captureSha256:capture.manifestSha256}});
}
