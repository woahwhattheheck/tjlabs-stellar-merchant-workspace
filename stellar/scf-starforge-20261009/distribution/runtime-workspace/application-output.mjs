// MIT. Complete retained Application output; original worker and terminal writers are unchanged.
import { constants } from 'node:fs';
import { open, lstat, realpath, link, unlink } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { applicationOperation } from './applications-core.mjs';
import { need, plain, digest, absolute } from './storage.mjs';

export const OUTPUT_PAGE_BYTES = 65536;
export const OUTPUT_MAX_PAGE_BYTES = 262144;
const SCHEMA = 'stellar-forge.application-output-selection.v1';
const hashPattern = /^[a-f0-9]{64}$/;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const changed = () => need(false, 'APPLICATION_OUTPUT_CHANGED',
  'The selected original output was replaced or shortened. Open its current output as a new selection.', 409);
function decodeSelection(value) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 2048 &&
    /^[A-Za-z0-9_-]+$/.test(value), 'APPLICATION_OUTPUT_SELECTION_INVALID');
  let selected;
  try { selected = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { need(false, 'APPLICATION_OUTPUT_SELECTION_INVALID'); }
  need(plain(selected) && selected.schema === SCHEMA &&
    Object.keys(selected).every(key => ['schema', 'applicationId', 'operationId', 'sourceId', 'endOffset', 'guardSha256'].includes(key)) &&
    typeof selected.applicationId === 'string' && typeof selected.operationId === 'string' &&
    hashPattern.test(selected.sourceId ?? '') && hashPattern.test(selected.guardSha256 ?? '') &&
    integer(selected.endOffset), 'APPLICATION_OUTPUT_SELECTION_INVALID');
  return selected;
}
async function readRange(handle, offset, bytes) {
  const value = Buffer.alloc(bytes); let count = 0;
  while (count < bytes) {
    const read = await handle.read(value, count, bytes - count, offset + count);
    if (!read.bytesRead) changed();
    count += read.bytesRead;
  }
  return value;
}
const sourceIdentity = (input, info) => digest(JSON.stringify({
  applicationId: input.applicationId, operationId: input.operationId,
  dev: String(info.dev), ino: String(info.ino), birthtimeNs: String(info.birthtimeNs),
}));
async function inspect(file) {
  const [info, named] = await Promise.all([file.handle.stat({ bigint: true }), lstat(file.path, { bigint: true })]);
  need(info.isFile() && named.isFile() && !named.isSymbolicLink(), 'APPLICATION_OUTPUT_FILE_INVALID');
  if (info.dev !== named.dev || info.ino !== named.ino ||
    sourceIdentity(file.input, info) !== file.sourceId || info.size < BigInt(file.selected.endOffset)) changed();
  need(info.size <= BigInt(Number.MAX_SAFE_INTEGER), 'APPLICATION_OUTPUT_SIZE_INVALID');
  return Number(info.size);
}
async function guard(handle, endOffset) {
  const size = Math.min(4096, endOffset), tail = Math.max(size, endOffset - 4096);
  const headBytes = await readRange(handle, 0, size);
  const tailBytes = await readRange(handle, tail, endOffset - tail);
  return createHash('sha256').update(String(endOffset) + '\n').update(headBytes).update(tailBytes).digest('hex');
}
async function validateFile(file) {
  const totalBytes = await inspect(file);
  if (await guard(file.handle, file.selected.endOffset) !== file.selected.guardSha256) changed();
  return totalBytes;
}
async function openSelected(root, input = {}) {
  need(plain(input) && Object.keys(input).every(key =>
    ['applicationId', 'operationId', 'selection', 'offset', 'limit'].includes(key)), 'APPLICATION_OUTPUT_FIELDS_INVALID');
  await applicationOperation(root, input);
  const path = join(root, 'operations', input.operationId, 'worker.log');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat({ bigint: true });
    need(info.isFile() && info.size <= BigInt(Number.MAX_SAFE_INTEGER), 'APPLICATION_OUTPUT_FILE_INVALID');
    const sourceId = sourceIdentity(input, info);
    const selected = input.selection === undefined ? {
      schema: SCHEMA, applicationId: input.applicationId, operationId: input.operationId,
      sourceId, endOffset: Number(info.size), guardSha256: await guard(handle, Number(info.size)),
    } : decodeSelection(input.selection);
    need(selected.applicationId === input.applicationId && selected.operationId === input.operationId,
      'APPLICATION_OUTPUT_SELECTION_MISMATCH', 'Open the selected original application and operation.', 409);
    if (selected.sourceId !== sourceId) changed();
    const file = { handle, path, input, sourceId, selected,
      selection: Buffer.from(JSON.stringify(selected)).toString('base64url') };
    file.totalBytes = await validateFile(file);
    return file;
  } catch (error) { await handle.close(); throw error; }
}
const continuation = byte => (byte & 0xc0) === 0x80;
// Page edges expand by at most three bytes to avoid cutting a complete UTF-8
// sequence. An arbitrary byte jump may overlap its previous codepoint. The
// returned nextOffset is always the correct beginning of the following page.
export function outputTextRange(bytes, base, offset, wantedEnd, selectedEnd) {
  let start = offset - base;
  for (let n = 0; start > 0 && start < bytes.length && continuation(bytes[start]) && n < 3; n++) start--;
  let end = wantedEnd - base;
  for (let n = 0; base + end < selectedEnd && end < bytes.length && continuation(bytes[end]) && n < 3; n++) end++;
  return { offset: base + start, nextOffset: base + end, text: bytes.subarray(start, end).toString('utf8') };
}
export async function readApplicationOutputPage(root, input = {}) {
  need(plain(input), 'APPLICATION_OUTPUT_FIELDS_INVALID');
  const limit = input.limit === undefined ? OUTPUT_PAGE_BYTES : input.limit;
  need(Number.isSafeInteger(limit) && limit >= 4 && limit <= OUTPUT_MAX_PAGE_BYTES, 'APPLICATION_OUTPUT_PAGE_INVALID');
  need(input.offset === undefined || integer(input.offset), 'APPLICATION_OUTPUT_OFFSET_INVALID');
  const file = await openSelected(root, input);
  try {
    const endOffset = file.selected.endOffset;
    const offset = input.offset === undefined ? Math.max(0, endOffset - limit) : input.offset;
    need(offset <= endOffset, 'APPLICATION_OUTPUT_OFFSET_INVALID');
    const wantedEnd = Math.min(endOffset, offset + limit), base = Math.max(0, offset - 3);
    const raw = await readRange(file.handle, base, Math.min(endOffset, wantedEnd + 3) - base);
    const page = outputTextRange(raw, base, offset, wantedEnd, endOffset);
    const totalBytes = await validateFile(file);
    return { schema: 'stellar-forge.application-output-page.v1',
      applicationId: input.applicationId, operationId: input.operationId, sourceId: file.sourceId,
      selection: file.selection, endOffset, totalBytes, appendedBytes: totalBytes - endOffset,
      requestedOffset: offset, limit, ...page, bytes: page.nextOffset - page.offset,
      hasPrevious: page.offset > 0, hasNext: page.nextOffset < endOffset,
      encoding: 'utf-8', filename: 'application-' + input.applicationId + '-' + input.operationId + '.log' };
  } finally { await file.handle.close(); }
}
export async function openApplicationOutputDownload(root, input = {}) {
  need(plain(input), 'APPLICATION_OUTPUT_FIELDS_INVALID');
  need(input.offset === undefined && input.limit === undefined, 'APPLICATION_OUTPUT_DOWNLOAD_RANGE_INVALID');
  const file = await openSelected(root, input);
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await file.handle.close(); } };
  async function* chunks() {
    try {
      let offset = 0;
      while (offset < file.selected.endOffset) {
        const size = Math.min(OUTPUT_PAGE_BYTES, file.selected.endOffset - offset);
        const bytes = await readRange(file.handle, offset, size);
        offset += bytes.length;
        // Check before the final advertised bytes can complete an HTTP download.
        if (offset === file.selected.endOffset) await validateFile(file);
        yield bytes;
      }
      await validateFile(file);
    } finally { await close(); }
  }
  const stream = Readable.from(chunks());
  // A prepared download may be inspected and closed before consumption.
  return { stream, close, bytes: file.selected.endOffset, sourceId: file.sourceId,
    selection: file.selection, applicationId: input.applicationId, operationId: input.operationId,
    filename: 'application-' + input.applicationId + '-' + input.operationId + '.log',
    type: 'application/octet-stream' };
}
export async function writeApplicationOutputDownload(download, output) {
  let temporary, targetHandle;
  const sha256 = createHash('sha256');
  try {
    const path = absolute(output);
    need(await realpath(dirname(path)) === dirname(path), 'APPLICATION_OUTPUT_REAL_PARENT_REQUIRED');
    temporary = join(dirname(path), '.' + basename(path) + '.' + randomUUID() + '.part');
    targetHandle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    async function* counted() {
      for await (const bytes of download.stream) { sha256.update(bytes); yield bytes; }
    }
    await pipeline(Readable.from(counted()), targetHandle.createWriteStream({ autoClose: false }));
    await targetHandle.sync(); await targetHandle.close(); targetHandle = null;
    await link(temporary, path); // Never overwrite an existing operator file.
    return { applicationId: download.applicationId, operationId: download.operationId,
      sourceId: download.sourceId, selection: download.selection, output: path,
      bytes: download.bytes, sha256: sha256.digest('hex') };
  } finally {
    download.stream.destroy(); await download.close();
    if (targetHandle) await targetHandle.close();
    if (temporary) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
