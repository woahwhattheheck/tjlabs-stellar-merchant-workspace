// MIT. Stream the complete original captured handover through a retained private archive.
import { constants as C } from 'node:fs';
import { open, lstat, link, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { inspectCapturedHandover, CAPTURED_HANDOVER_SCHEMA } from './handover.mjs';
import {
  HASH, METADATA_LIMIT, absolute, inside, directory, parents,
  canonical, digest, decode, fileRows, bytes, present, readJSON,
  publishJSON, syncDirectory, operation, requireEmptyOperation, fail,
} from './handover-files.mjs';

export const CAPTURED_HANDOVER_ARCHIVE_SCHEMA = 'stellar-forge.captured-api-handover-archive.v1';
const OPERATION_SCHEMA = 'stellar-forge.captured-api-handover-archive-operation.v1';
const RESULT_SCHEMA = 'stellar-forge.captured-api-handover-archive-result.v1';
const MAGIC = Buffer.from('SF-CAPTURED-HANDOVER-1\n');
const ARCHIVE_NAME = 'handover.sfhandover';
const BLOCK = 64 * 1024;
const sha = value => {
  if (!HASH.test(value ?? '')) fail('CAPTURED_HANDOVER_INPUT', 'Use the complete original SHA-256.');
  return value;
};
const count = (value, label = 'byte count') => {
  if (!Number.isSafeInteger(value) || value < 0)
    fail('CAPTURED_HANDOVER_LIMIT', 'Use an exact nonnegative safe ' + label + '.');
  return value;
};
export function handoverFileIdentity(stat) {
  return { device:String(stat.dev), inode:String(stat.ino), bytes:Number(stat.size),
    mtimeNs:String(stat.mtimeNs), ctimeNs:String(stat.ctimeNs) };
}
function privateFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || (stat.mode & 0o077n))
    fail('CAPTURED_HANDOVER_FILE', 'Use one original private regular file without links.');
  count(Number(stat.size));
}
function sameInode(a, b) { return a.dev === b.dev && a.ino === b.ino; }

/** Shared bounded reader; callers retain this descriptor until their stream finishes. */
export async function openHandoverFile(path, { writable = false, expectedBytes } = {}) {
  path = absolute(path); await directory(dirname(path));
  const handle = await open(path, (writable ? C.O_RDWR : C.O_RDONLY) | C.O_NOFOLLOW);
  let closed = false, closing = null;
  try {
    const initial = await handle.stat({ bigint:true }), named = await lstat(path, { bigint:true });
    privateFile(initial); privateFile(named);
    if (!sameInode(initial,named)) fail('CAPTURED_HANDOVER_CHANGED', 'The original file name changed.');
    if (expectedBytes !== undefined && initial.size !== BigInt(count(expectedBytes)))
      fail('CAPTURED_HANDOVER_CHANGED', 'The original complete file length changed.');
    const identity = handoverFileIdentity(initial);
    const assertHeld = async ({ stable = !writable } = {}) => {
      if (closed) fail('CAPTURED_HANDOVER_CLOSED', 'The original file reader is closed.');
      await directory(dirname(path));
      const stat = await handle.stat({ bigint:true }), current = await lstat(path, { bigint:true });
      privateFile(stat); privateFile(current);
      if (!sameInode(initial,stat) || !sameInode(stat,current) ||
          stable && canonical(handoverFileIdentity(stat)) !== canonical(identity))
        fail('CAPTURED_HANDOVER_CHANGED', 'The original retained file changed while open.');
      return stat;
    };
    const close = () => {
      if (closed) return Promise.resolve();
      if (!closing) closing = handle.close().then(() => { closed = true; })
        .catch(error => { closing = null; throw error; });
      return closing;
    };
    return { path, handle, bytes:identity.bytes, identity, assertHeld, close };
  } catch (error) { await handle.close(); throw error; }
}
export async function writeHandoverBytes(handle, content, offset) {
  let written = 0;
  while (written < content.length) {
    const result = await handle.write(content,written,content.length-written,offset+written);
    if (!result.bytesWritten) fail('CAPTURED_HANDOVER_WRITE', 'The retained file write made no progress.');
    written += result.bytesWritten;
  }
}
/** Positional reads keep independent download/range consumers from moving a shared cursor. */
export async function readHandoverRange(held, offset, length) {
  count(offset); count(length);
  if (length > 1024 * 1024)
    fail('CAPTURED_HANDOVER_LIMIT', 'Read one bounded handover chunk at a time.');
  const result = Buffer.allocUnsafe(length); let read = 0;
  while (read < length) {
    const part = await held.handle.read(result,read,length-read,offset+read);
    if (!part.bytesRead) fail('CAPTURED_HANDOVER_INCOMPLETE', 'The retained file ended before this chunk.');
    read += part.bytesRead;
  }
  return result;
}
export async function* streamHandoverFile(held, { offset = 0, length = held.bytes, expectedSha256 } = {}) {
  count(offset); count(length);
  if (!Number.isSafeInteger(offset+length) || offset+length > held.bytes)
    fail('CAPTURED_HANDOVER_LIMIT', 'Use a range inside the original complete file.');
  if (expectedSha256 !== undefined) sha(expectedSha256);
  await held.assertHeld({ stable:true });
  const hash = createHash('sha256');
  for (let position = offset; position < offset+length;) {
    const chunk = await readHandoverRange(held,position,Math.min(BLOCK,offset+length-position));
    hash.update(chunk); position += chunk.length; yield chunk;
  }
  await held.assertHeld({ stable:true });
  if (expectedSha256 !== undefined && hash.digest('hex') !== expectedSha256)
    fail('CAPTURED_HANDOVER_CHANGED', 'The original file SHA-256 changed.');
}
export async function hashHandoverFile(held) {
  const hash = createHash('sha256');
  for await (const chunk of streamHandoverFile(held)) hash.update(chunk);
  return hash.digest('hex');
}
function stageName(name) {
  return '.sfhandover-' + digest(Buffer.from(name)).slice(0,32) + '.partial';
}
async function repairStage(root, name) {
  const parent = await parents(root,name), target = join(root,name);
  const stage = join(parent,stageName(name));
  if (await present(stage) && await present(target)) {
    const left = await lstat(stage,{bigint:true}), right = await lstat(target,{bigint:true});
    if (left.isFile() && right.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink() &&
        !(left.mode & 0o077n) && !(right.mode & 0o077n) &&
        left.nlink === 2n && right.nlink === 2n && sameInode(left,right)) {
      await unlink(stage); await syncDirectory(parent);
    }
  }
  return { parent,target,stage };
}
/** Retain a stopped prefix on its original inode; publish only its verified whole bytes. */
async function publishStream(root, name, source, { expectedBytes, expectedSha256, lease } = {}) {
  if (expectedBytes !== undefined) count(expectedBytes);
  if (expectedSha256 !== undefined) sha(expectedSha256);
  const paths = await repairStage(root,name);
  const exists = await present(paths.target);
  if (!exists && !await present(paths.stage)) {
    const created = await open(paths.stage,C.O_CREAT|C.O_EXCL|C.O_RDWR|C.O_NOFOLLOW,0o600);
    await created.sync(); await created.close(); await syncDirectory(paths.parent);
  }
  const held = await openHandoverFile(exists ? paths.target : paths.stage,{writable:!exists});
  const prefixBytes = held.bytes, hash = createHash('sha256'); let size = 0;
  try {
    for await (const value of source) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (!chunk.length) continue;
      if (!Number.isSafeInteger(size+chunk.length) ||
          expectedBytes !== undefined && size+chunk.length > expectedBytes)
        fail('CAPTURED_HANDOVER_LIMIT', 'The framed file exceeds its original byte count.');
      const overlap = Math.min(chunk.length,Math.max(0,prefixBytes-size));
      if (overlap && !(await readHandoverRange(held,size,overlap)).equals(chunk.subarray(0,overlap)))
        fail('CAPTURED_HANDOVER_CONFLICT', 'The retained file prefix differs from this original stream: ' + name);
      if (exists && overlap !== chunk.length)
        fail('CAPTURED_HANDOVER_CONFLICT', 'The existing complete file has different bytes: ' + name);
      if (!exists && overlap < chunk.length)
        await writeHandoverBytes(held.handle,chunk.subarray(overlap),size+overlap);
      hash.update(chunk); size += chunk.length; lease?.assertHeld();
    }
    const sha256 = hash.digest('hex');
    if (size < prefixBytes || expectedBytes !== undefined && size !== expectedBytes ||
        expectedSha256 !== undefined && sha256 !== expectedSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The complete framed file differs from its retained identity: ' + name);
    if (!exists) await held.handle.sync();
    const stat = await held.assertHeld({ stable:exists });
    if (Number(stat.size) !== size) fail('CAPTURED_HANDOVER_CHANGED', 'The completed file length changed.');
    await held.close();
    if (!exists) {
      try { await link(paths.stage,paths.target); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const winner = await openHandoverFile(paths.target,{expectedBytes:size});
        try {
          if (await hashHandoverFile(winner) !== sha256)
            fail('CAPTURED_HANDOVER_CONFLICT', 'An existing target has different original bytes.');
        } finally { await winner.close(); }
      }
      await unlink(paths.stage);
    }
    await syncDirectory(paths.parent);
    const published = await openHandoverFile(paths.target,{expectedBytes:size});
    try { return { name,bytes:size,sha256,identity:published.identity }; }
    finally { await published.close(); }
  } finally { await held.close(); }
}
function framing(manifest, original) {
  if (manifest?.schema !== CAPTURED_HANDOVER_SCHEMA || !HASH.test(manifest.handoverId ?? '') ||
      manifest.reviewFile?.name !== 'handover-review.json' ||
      !HASH.test(manifest.reviewSha256 ?? ''))
    fail('CAPTURED_HANDOVER_INVALID', 'Use the complete original captured handover manifest.');
  fileRows([manifest.reviewFile]); fileRows(manifest.files);
  if (manifest.reviewFile.bytes > METADATA_LIMIT ||
      manifest.reviewFile.sha256 !== manifest.reviewSha256)
    fail('CAPTURED_HANDOVER_INVALID', 'The original review byte identity is invalid.');
  const names = new Set(manifest.files.map(row => row.name));
  for (const row of manifest.files) {
    if (!(row.name === 'READ-ME.md' || row.name.startsWith('packages/') || row.name.startsWith('sources/')) ||
        row.name.split('/').some(part => part === 'writer.lease' || part.startsWith('.sfhandover-')))
      fail('CAPTURED_HANDOVER_FILE', 'Use only the original native member roster.');
    const parts = row.name.split('/');
    for (let index=1;index<parts.length;index++)
      if (names.has(parts.slice(0,index).join('/')))
        fail('CAPTURED_HANDOVER_FILE', 'A declared file also names a parent directory.');
  }
  const total = manifest.files.reduce((sum,row) => sum+row.bytes,0);
  if (!Number.isSafeInteger(total) || total !== manifest.totalBytes ||
      !Number.isSafeInteger(total+manifest.reviewFile.bytes+original.length+MAGIC.length+4))
    fail('CAPTURED_HANDOVER_LIMIT', 'The complete native handover byte count differs.');
  return [manifest.reviewFile,...manifest.files];
}
async function* nativeFrame(root, inspected, original, lease) {
  const length = Buffer.alloc(4); length.writeUInt32BE(original.length);
  yield MAGIC; yield length; yield original;
  for (const row of framing(inspected.manifest,original)) {
    lease.assertHeld();
    const held = await openHandoverFile(join(root,row.name),{expectedBytes:row.bytes});
    try { yield* streamHandoverFile(held,{expectedSha256:row.sha256}); }
    finally { await held.close(); }
  }
}
function frameReader(stream) {
  const iterator = stream[Symbol.asyncIterator](); let current = Buffer.alloc(0), position = 0, ended = false;
  const next = async () => {
    while (position === current.length && !ended) {
      const value = await iterator.next();
      if (value.done) { ended = true; break; }
      current = Buffer.from(value.value); position = 0;
    }
    return !ended;
  };
  const chunks = async function* (length) {
    count(length); let remaining = length;
    while (remaining) {
      if (!await next()) fail('CAPTURED_HANDOVER_INCOMPLETE', 'The archive ended inside an original framed file.');
      const size = Math.min(remaining,current.length-position);
      const chunk = current.subarray(position,position+size);
      position += size; remaining -= size; yield chunk;
    }
  };
  return {
    chunks,
    async take(length) {
      if (!Number.isSafeInteger(length) || length < 0 || length > METADATA_LIMIT)
        fail('CAPTURED_HANDOVER_LIMIT', 'The archive metadata exceeds the native 64 MiB limit.');
      const result = Buffer.allocUnsafe(length); let offset = 0;
      for await (const chunk of chunks(length)) { chunk.copy(result,offset); offset += chunk.length; }
      return result;
    },
    async end() {
      if (await next()) fail('CAPTURED_HANDOVER_INVALID', 'The archive contains bytes beyond its complete original roster.');
    },
  };
}
async function consumeArchive(held, { expectedSha256, expectedManifestSha256, onManifest, onFile } = {}) {
  const hash = createHash('sha256');
  const source = Readable.from((async function* () {
    for await (const chunk of streamHandoverFile(held)) { hash.update(chunk); yield chunk; }
  })());
  const gzip = createGunzip({ chunkSize:BLOCK });
  const pumped = pipeline(source,gzip); pumped.catch(() => {});
  const reader = frameReader(gzip);
  try {
    if (!(await reader.take(MAGIC.length)).equals(MAGIC))
      fail('CAPTURED_HANDOVER_INVALID', 'Choose an original .sfhandover archive.');
    const length = (await reader.take(4)).readUInt32BE(0);
    if (!length) fail('CAPTURED_HANDOVER_INVALID', 'The complete original handover manifest is absent.');
    const original = await reader.take(length), manifest = decode(original), manifestSha256 = digest(original);
    if (expectedManifestSha256 !== undefined && manifestSha256 !== sha(expectedManifestSha256))
      fail('CAPTURED_HANDOVER_CHANGED', 'This archive contains a different original handover.');
    const rows = framing(manifest,original);
    await onManifest?.({original,manifest,manifestSha256});
    for (const row of rows) {
      const hash = createHash('sha256');
      const chunks = (async function* () {
        for await (const chunk of reader.chunks(row.bytes)) { hash.update(chunk); yield chunk; }
      })();
      if (onFile) await onFile(row,chunks);
      else for await (const chunk of chunks) void chunk;
      if (hash.digest('hex') !== row.sha256)
        fail('CAPTURED_HANDOVER_CHANGED', 'An original native member SHA-256 changed: ' + row.name);
    }
    await reader.end(); await pumped;
    const sha256 = hash.digest('hex');
    if (expectedSha256 !== undefined && sha256 !== sha(expectedSha256))
      fail('CAPTURED_HANDOVER_CHANGED', 'The complete original archive SHA-256 changed.');
    await held.assertHeld({stable:true});
    return { manifest,manifestSha256,handoverId:manifest.handoverId,
      original,bytes:held.bytes,sha256 };
  } catch (error) {
    source.destroy(error); gzip.destroy(error); await pumped.catch(() => {}); throw error;
  }
}
async function originalOperation(root, value) {
  await requireEmptyOperation(root,'operation.json');
  const saved = await readJSON(root,'operation.json',true);
  if (saved && canonical(saved) !== canonical(value))
    fail('CAPTURED_HANDOVER_CONFLICT', 'Reopen this directory with its original archive operation.');
  await publishJSON(root,'operation.json',value);
  return value;
}
function archiveResult(record, path, reused) {
  return { path,bytes:record.file.bytes,sha256:record.file.sha256,
    handoverId:record.handoverId,manifestSha256:record.manifestSha256,reused };
}
async function verifiedExport(root, record, expectedManifestSha256) {
  if (record?.schema !== RESULT_SCHEMA || record.mode !== 'export' ||
      record.manifestSha256 !== expectedManifestSha256 || !HASH.test(record.handoverId ?? '') ||
      record.file?.name !== ARCHIVE_NAME || !HASH.test(record.file.sha256 ?? ''))
    fail('CAPTURED_HANDOVER_CHANGED', 'The retained archive completion differs.');
  await repairStage(root,ARCHIVE_NAME);
  const held = await openHandoverFile(join(root,ARCHIVE_NAME),{expectedBytes:record.file.bytes});
  try {
    if (canonical(held.identity) !== canonical(record.file.identity))
      fail('CAPTURED_HANDOVER_CHANGED', 'The original completed archive inode or contents changed.');
    return archiveResult(record,held.path,true);
  } finally { await held.close(); }
}
export async function exportCapturedHandoverArchive({ bundle,directory:output,expectedManifestSha256 }) {
  sha(expectedManifestSha256); output = absolute(output); bundle = absolute(bundle);
  if (inside(output,bundle) || inside(bundle,output))
    fail('CAPTURED_HANDOVER_DIRECTORY', 'Choose a separate private archive output directory.');
  return operation(output,async (root,lease) => {
    const binding = {schema:OPERATION_SCHEMA,mode:'export',manifestSha256:expectedManifestSha256};
    await originalOperation(root,binding);
    const retained = await readJSON(root,'received.json',true);
    if (retained) return verifiedExport(root,retained,expectedManifestSha256);
    return operation(bundle,async (selected,sourceLease) => {
      const inspected = await inspectCapturedHandover({bundle:selected,expectedManifestSha256});
      const original = await bytes(selected,'handover.json',METADATA_LIMIT);
      if (digest(original) !== expectedManifestSha256)
        fail('CAPTURED_HANDOVER_CHANGED', 'The original published manifest changed.');
      let file;
      await repairStage(root,ARCHIVE_NAME);
      if (await present(join(root,ARCHIVE_NAME))) {
        const held = await openHandoverFile(join(root,ARCHIVE_NAME));
        try {
          const recovered = await consumeArchive(held,{expectedManifestSha256});
          if (recovered.handoverId !== inspected.handoverId)
            fail('CAPTURED_HANDOVER_CHANGED', 'The interrupted publication belongs to another handover.');
          file = {name:ARCHIVE_NAME,bytes:held.bytes,sha256:recovered.sha256,identity:held.identity};
        } finally { await held.close(); }
      } else {
        const gzip = createGzip({level:6,chunkSize:BLOCK});
        const pumping = pipeline(Readable.from(nativeFrame(selected,inspected,original,sourceLease)),gzip);
        pumping.catch(() => {});
        try {
          file = await publishStream(root,ARCHIVE_NAME,gzip,{lease});
          await pumping;
        } catch (error) { gzip.destroy(error); await pumping.catch(() => {}); throw error; }
      }
      sourceLease.assertHeld(); lease.assertHeld();
      const result = {schema:RESULT_SCHEMA,mode:'export',handoverId:inspected.handoverId,
        manifestSha256:expectedManifestSha256,file};
      await publishJSON(root,'received.json',result);
      return archiveResult(result,join(root,ARCHIVE_NAME),false);
    });
  },{create:true});
}
export async function receiveCapturedHandoverArchive({ path,directory:output,expectedSha256,expectedBytes }) {
  path = absolute(path); output = absolute(output); sha(expectedSha256); count(expectedBytes);
  if (!expectedBytes || inside(output,path))
    fail('CAPTURED_HANDOVER_INPUT', 'Keep the complete original archive outside its receiving directory.');
  return operation(output,async (root,lease) => {
    const binding = {schema:OPERATION_SCHEMA,mode:'receive',sha256:expectedSha256,bytes:expectedBytes};
    await originalOperation(root,binding);
    const retained = await readJSON(root,'received.json',true), bundle = join(root,'bundle');
    if (retained) {
      if (retained.schema !== RESULT_SCHEMA || retained.mode !== 'receive' ||
          retained.archive?.sha256 !== expectedSha256 || retained.archive.bytes !== expectedBytes ||
          !HASH.test(retained.manifestSha256 ?? ''))
        fail('CAPTURED_HANDOVER_CHANGED', 'The original archive receiving record changed.');
      const inspected = await inspectCapturedHandover({bundle,expectedManifestSha256:retained.manifestSha256});
      if (inspected.handoverId !== retained.handoverId)
        fail('CAPTURED_HANDOVER_CHANGED', 'The retained receiving handover changed.');
      return {...inspected,archive:{...retained.archive},reused:true};
    }
    await directory(bundle,true);
    const held = await openHandoverFile(path,{expectedBytes});
    try {
      const received = await consumeArchive(held,{expectedSha256,
        onManifest:async value => {
          await publishJSON(root,'records/frame.json',{manifestSha256:value.manifestSha256,
            handoverId:value.manifest.handoverId});
        },
        onFile:(row,chunks) => publishStream(bundle,row.name,chunks,{
          expectedBytes:row.bytes,expectedSha256:row.sha256,lease}),
      });
      lease.assertHeld();
      await publishStream(bundle,'handover.json',(async function* () {
        for (let offset=0;offset<received.original.length;offset+=BLOCK)
          yield received.original.subarray(offset,offset+BLOCK);
      })(),{expectedBytes:received.original.length,expectedSha256:received.manifestSha256,lease});
      const inspected = await inspectCapturedHandover({bundle,expectedManifestSha256:received.manifestSha256});
      const archive = {bytes:expectedBytes,sha256:expectedSha256,originalPath:path};
      await publishJSON(root,'received.json',{schema:RESULT_SCHEMA,mode:'receive',
        handoverId:inspected.handoverId,manifestSha256:inspected.manifestSha256,archive});
      return {...inspected,archive,reused:false};
    } finally { await held.close(); }
  },{create:true});
}
/** Fast native download reopening uses the original completed publication's inode/stat identity. */
export async function openCapturedHandoverArchive({path,expectedBytes,expectedSha256}) {
  path = absolute(path); count(expectedBytes); sha(expectedSha256);
  const root = await directory(dirname(path));
  const record = await readJSON(root,'received.json',true);
  const held = await openHandoverFile(path,{expectedBytes});
  try {
    if (basename(path) === ARCHIVE_NAME && record?.schema === RESULT_SCHEMA && record.mode === 'export') {
      if (record.file?.name !== ARCHIVE_NAME || record.file.bytes !== expectedBytes ||
          record.file.sha256 !== expectedSha256 ||
          canonical(record.file.identity) !== canonical(held.identity))
        fail('CAPTURED_HANDOVER_CHANGED', 'The retained downloadable archive changed.');
    } else if (await hashHandoverFile(held) !== expectedSha256)
      fail('CAPTURED_HANDOVER_CHANGED', 'The complete selected archive SHA-256 changed.');
    return {...held,sha256:expectedSha256};
  } catch (error) { await held.close(); throw error; }
}
