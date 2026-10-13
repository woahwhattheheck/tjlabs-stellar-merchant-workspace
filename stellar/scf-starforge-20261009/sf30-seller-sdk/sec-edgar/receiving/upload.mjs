// MIT. Stream a complete original return ZIP into the operator's private intake.
import { constants } from 'node:fs';
import { open, lstat, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { realDirectory, syncDirectory } from './storage.mjs';
import { need, MAX_EXPANDED_BYTES, MAX_MANIFEST_BYTES } from './manifest.mjs';

const LIMIT = MAX_EXPANDED_BYTES + MAX_MANIFEST_BYTES;
async function verify(path, expected) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat(), digest = createHash('sha256');
    need(before.isFile() && before.size > 0 && before.size <= LIMIT, 'EDGAR_RETURN_UPLOAD_INVALID');
    const buffer = Buffer.alloc(1024 * 1024); let total = 0;
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead; digest.update(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat(), current = await lstat(path);
    need(current.isFile() && !current.isSymbolicLink() && current.dev === before.dev && current.ino === before.ino &&
      total === before.size && ['size', 'mtimeMs', 'ctimeMs'].every(key => before[key] === after[key]) &&
      digest.digest('hex') === expected, 'EDGAR_RETURN_UPLOAD_CHANGED', 'The original return ZIP differs from its selected SHA-256.');
    return { archivePath: path, archive: { bytes: String(total), sha256: expected } };
  } finally { await file.close(); }
}
export async function receiveEdgarReturnUpload(request, { directory, uploadId, expectedArchiveSha256 } = {}) {
  need(typeof uploadId === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(uploadId), 'EDGAR_RETURN_UPLOAD_ID_INVALID');
  need(/^[a-f0-9]{64}$/.test(expectedArchiveSha256 ?? ''), 'EDGAR_RETURN_ARCHIVE_SHA_REQUIRED',
    'Select the SHA-256 from the original returned workspace export.');
  need(/^application\/(zip|octet-stream)(?:;|$)/i.test(request.headers['content-type'] ?? ''),
    'EDGAR_RETURN_ZIP_REQUIRED', 'Upload the complete original workspace ZIP.');
  const declared = request.headers['content-length'];
  need(declared === undefined || /^\d+$/.test(declared) && Number(declared) > 0 && Number(declared) <= LIMIT,
    'EDGAR_RETURN_UPLOAD_LIMIT');
  const root = await realDirectory(join(directory, 'return-uploads', uploadId), { create: true });
  const temporary = join(root, '.incoming-' + randomUUID()), target = join(root, 'original.zip');
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  let closed = false, total = 0;
  const digest = createHash('sha256');
  try {
    for await (const part of request) {
      total += part.length;
      need(total <= LIMIT, 'EDGAR_RETURN_UPLOAD_LIMIT', 'The return ZIP exceeds the complete workspace limit.');
      digest.update(part);
      let offset = 0;
      while (offset < part.length) {
        const { bytesWritten } = await file.write(part, offset, part.length - offset, null);
        need(bytesWritten > 0, 'EDGAR_RETURN_UPLOAD_WRITE_FAILED'); offset += bytesWritten;
      }
    }
    need(total > 0 && (declared === undefined || Number(declared) === total), 'EDGAR_RETURN_UPLOAD_INCOMPLETE');
    need(digest.digest('hex') === expectedArchiveSha256, 'EDGAR_RETURN_UPLOAD_CHANGED',
      'The uploaded ZIP does not match the SHA-256 from the original export.');
    await file.sync(); await file.close(); closed = true;
    try { await link(temporary, target); }
    catch (cause) { if (cause.code !== 'EEXIST') throw cause; await verify(target, expectedArchiveSha256); }
    await syncDirectory(root);
    return { archivePath: target, archive: { bytes: String(total), sha256: expectedArchiveSha256 } };
  } finally {
    if (!closed) await file.close().catch(() => {});
    await unlink(temporary).catch(cause => { if (cause.code !== 'ENOENT') throw cause; });
  }
}
