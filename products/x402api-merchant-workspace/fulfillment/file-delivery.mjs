// MIT License. Fulfill a paid order with its originally selected file edition.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, isAbsolute, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { canonicalJson } from '../protocol.mjs';

function need(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
const digest = value => createHash('sha256').update(value).digest('hex');
function selection(entry) {
  need(entry && typeof entry === 'object' && !Array.isArray(entry), 'DELIVERY_FILE_SELECTION_REQUIRED');
  need(typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/.test(entry.sha256) &&
    Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= 1024 * 1024 * 1024, 'DELIVERY_FILE_IDENTITY_INVALID');
  need(typeof entry.contentType === 'string' && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(entry.contentType), 'DELIVERY_CONTENT_TYPE_INVALID');
  need(typeof entry.fileName === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(entry.fileName), 'DELIVERY_FILE_NAME_INVALID');
  return { bytes: entry.bytes, sha256: entry.sha256, contentType: entry.contentType.toLowerCase(), fileName: entry.fileName };
}
export function fileBinding(entry) { return 'sha256:' + digest(Buffer.from(canonicalJson(selection(entry)), 'utf8')); }
async function originalBytes(path, expected) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size === expected.bytes, 'DELIVERY_FILE_CHANGED');
    const parts = [], hash = createHash('sha256'); let position = 0;
    while (position < before.size) {
      const buffer = Buffer.allocUnsafe(Math.min(65536, before.size - position));
      const result = await handle.read(buffer, 0, buffer.length, position);
      need(result.bytesRead > 0, 'DELIVERY_FILE_CHANGED');
      const chunk = buffer.subarray(0, result.bytesRead); parts.push(chunk); hash.update(chunk); position += chunk.length;
    }
    const after = await handle.stat(), extra = Buffer.alloc(1), tail = await handle.read(extra, 0, 1, position);
    need(tail.bytesRead === 0 && after.size === before.size && after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs && hash.digest('hex') === expected.sha256, 'DELIVERY_FILE_CHANGED');
    return Buffer.concat(parts);
  } finally { await handle.close(); }
}
export async function createFulfillment({ configuration, baseDirectory }) {
  need(configuration && typeof configuration.manifest === 'string', 'DELIVERY_MANIFEST_REQUIRED');
  const path = resolve(baseDirectory, configuration.manifest);
  const raw = await readFile(path); need(raw.length <= 1048576, 'DELIVERY_MANIFEST_TOO_LARGE');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  need(manifest.schema === 'stellar-forge.merchant-file-delivery.v1' && manifest.files && typeof manifest.files === 'object' &&
    !Array.isArray(manifest.files), 'DELIVERY_MANIFEST_INVALID');
  const files = new Map();
  for (const [binding, source] of Object.entries(manifest.files)) {
    const expected = selection(source);
    need(binding === fileBinding(expected) && typeof source.path === 'string', 'DELIVERY_BINDING_CHANGED');
    const selectedPath = resolve(dirname(path), source.path);
    need(await realpath(dirname(selectedPath)) === dirname(selectedPath), 'DELIVERY_DIRECTORY_CHANGED');
    files.set(binding, { expected, path: selectedPath });
  }
  need(files.size > 0, 'DELIVERY_FILE_REQUIRED');
  async function resolveOrder(context) {
    const binding = context?.order?.frozen?.fulfillmentBinding, original = files.get(binding);
    need(original, 'ORIGINAL_DELIVERY_EDITION_REQUIRED');
    need(context.idempotencyKey === context.payment.id && context.receipt.settlement.job_id === context.payment.id, 'DELIVERY_PAYMENT_BINDING_CHANGED');
    return { bytes: await originalBytes(original.path, original.expected), contentType: original.expected.contentType, fileName: original.expected.fileName };
  }
  return {
    async fulfill(context) { return resolveOrder(context); },
    async reconcile(context) {
      // This adapter's only operation is reading one pinned immutable edition.
      // The same original bytes are authoritative after a runtime interruption.
      return { state: 'complete', result: await resolveOrder(context) };
    },
    async doctor({ binding }) {
      const original = files.get(binding); need(original, 'ORIGINAL_DELIVERY_EDITION_REQUIRED');
      await originalBytes(original.path, original.expected);
      return { binding, bytes: original.expected.bytes, sha256: original.expected.sha256, fileName: original.expected.fileName };
    }
  };
}
export async function describeFile({ path, contentType = 'application/octet-stream', fileName = basename(path) }) {
  need(isAbsolute(path), 'ABSOLUTE_DELIVERY_FILE_REQUIRED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes = 0, sha256;
  try {
    const before = await handle.stat(); need(before.isFile(), 'DELIVERY_REGULAR_FILE_REQUIRED');
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(65536); let position = 0;
    while (true) {
      const result = await handle.read(buffer, 0, buffer.length, position);
      if (!result.bytesRead) break;
      hash.update(buffer.subarray(0, result.bytesRead)); position += result.bytesRead;
    }
    const after = await handle.stat();
    need(position === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'DELIVERY_FILE_CHANGED');
    bytes = position; sha256 = hash.digest('hex');
  } finally { await handle.close(); }
  const metadata = selection({ bytes, sha256, contentType, fileName }), binding = fileBinding(metadata);
  return { binding, manifest: { schema: 'stellar-forge.merchant-file-delivery.v1', files: { [binding]: { path, ...metadata } } } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { source: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' } } });
  describeFile({ path: resolve(values.source), ...(values.type ? { contentType: values.type } : {}), ...(values.name ? { fileName: values.name } : {}) })
    .then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { process.stderr.write(JSON.stringify({ error: error.code ?? 'DELIVERY_DESCRIPTION_FAILED' }) + '\n'); process.exitCode = 1; });
}
