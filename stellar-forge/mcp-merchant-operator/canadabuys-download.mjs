// MIT. Complete CanadaBuys publication bytes through the original MCP file reader.
import { createHash, randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { createRetainedDownload } from './retained-download.mjs';
import { CanadaBuysMerchantClient, canadaBuysClientError, MAX_RETAINED_CHUNK_BYTES } from './canadabuys-client.mjs';

export const CANADABUYS_PUBLICATION_MANIFEST = 'canadabuys-publication.json';
export const CANADABUYS_PUBLICATION_SCHEMA = 'stellar-forge.canadabuys-publication-receiving.v1';
export const CANADABUYS_PUBLICATION_LIMITS = Object.freeze({
  files: 100000, fileBytes: 1024 ** 3, totalBytes: 8 * 1024 ** 3,
  manifestBytes: 64 * 1024 ** 2, checkpointBytes: 128 * 1024 ** 2,
});
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const READ = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const need = (value, message, code = 'PUBLICATION') => { if (!value) throw canadaBuysClientError(code, message); };
function publicationId(value) {
  need(typeof value === 'string' && UUID.test(value), 'Select the original publication UUID.');
  return value;
}
function nativePath(name) {
  need(typeof name === 'string' && name.length >= 1 && name.length <= 256 && !name.startsWith('/')
    && !/[\\:\u0000-\u001f\u007f]/.test(name) && name.split('/').length <= 32
    && name.split('/').every(part => part && part !== '.' && part !== '..')
    && name !== CANADABUYS_PUBLICATION_MANIFEST && name !== 'download-state' && !name.startsWith('download-state/'),
    'A published file must retain its canonical original relative path.');
  return name;
}
function descriptor(item) {
  need(plain(item), 'The original publication returned an invalid file descriptor.');
  const name = nativePath(item.file);
  need(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= CANADABUYS_PUBLICATION_LIMITS.fileBytes
    && typeof item.sha256 === 'string' && SHA.test(item.sha256)
    && typeof item.mime === 'string' && item.mime.length <= 512 && !/[\r\n\0]/.test(item.mime),
    'The original file must retain its exact byte count, SHA256 and media type.');
  return { name, bytes: item.bytes, sha256: item.sha256, mime: item.mime,
    originalReadName: basename(name), original: structuredClone(item) };
}
function validateManifest(value, selectedId) {
  need(plain(value) && value.schema === CANADABUYS_PUBLICATION_SCHEMA
    && value.publicationId === selectedId && plain(value.workspace)
    && typeof value.workspace.alias === 'string' && ALIAS.test(value.workspace.alias)
    && typeof value.workspace.id === 'string' && UUID.test(value.workspace.id)
    && plain(value.originalResponse) && value.originalResponse.workspace === value.workspace.alias
    && plain(value.originalResponse.publication) && value.originalResponse.publication.id === selectedId
    && ['canadabuys-export', 'canadabuys-merchant'].includes(value.originalResponse.publication.kind)
    && Array.isArray(value.originalResponse.files) && Array.isArray(value.files)
    && value.files.length > 0 && value.files.length <= CANADABUYS_PUBLICATION_LIMITS.files,
    'This is not a complete original CanadaBuys publication manifest.');
  const expected = value.originalResponse.files.map(descriptor).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  need(encoded(expected).equals(encoded(value.files)), 'The manifest differs from the original complete file response.');
  const names = new Set(); let bytes = 0;
  for (const file of value.files) {
    need(!names.has(file.name), 'The original publication repeats a file path.'); names.add(file.name);
    bytes += file.bytes;
    need(Number.isSafeInteger(bytes) && bytes <= CANADABUYS_PUBLICATION_LIMITS.totalBytes,
      'The complete publication exceeds the declared 8 GiB transfer bound.');
  }
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++)
      need(!names.has(parts.slice(0, i).join('/')), 'A publication file conflicts with an original directory.');
  }
  return value;
}
export function parseCanadaBuysPublication(bytes, selectedId) {
  publicationId(selectedId);
  need(bytes instanceof Uint8Array && bytes.length <= CANADABUYS_PUBLICATION_LIMITS.manifestBytes,
    'Use the complete original manifest within its 64 MiB bound.');
  let value;
  try { value = JSON.parse(decode(bytes)); }
  catch { throw canadaBuysClientError('PUBLICATION', 'The original publication manifest is not complete UTF-8 JSON.'); }
  return validateManifest(value, selectedId);
}
const receiving = createRetainedDownload({
  manifestName: CANADABUYS_PUBLICATION_MANIFEST, parseManifest: parseCanadaBuysPublication,
  maximumBytes: CANADABUYS_PUBLICATION_LIMITS.fileBytes,
  maximumManifestBytes: CANADABUYS_PUBLICATION_LIMITS.manifestBytes,
  maximumCheckpointBytes: CANADABUYS_PUBLICATION_LIMITS.checkpointBytes,
  stateSchema: CANADABUYS_PUBLICATION_SCHEMA + '.download-state',
  resultSchema: CANADABUYS_PUBLICATION_SCHEMA + '.download-result',
  toolPrefix: 'canadabuys_original_publication', errorPrefix: 'CANADABUYS_FILE',
  clientName: 'starforge-canadabuys-customer', nestedFiles: true, validateExportId: publicationId,
  describe: value => ({ publicationId: value.publicationId, workspace: value.workspace.alias,
    workspaceId: value.workspace.id, publication: value.originalResponse.publication }),
});

async function originalManifest(client, selectedId, signal) {
  need(client instanceof CanadaBuysMerchantClient && !client.closed,
    'Use the original open CanadaBuys MCP customer connection.');
  publicationId(selectedId); signal?.throwIfAborted();
  const before = await client.status({ limit: 1 }, { signal });
  const response = await client.files({ publicationId: selectedId }, { signal });
  const after = await client.status({ limit: 1 }, { signal });
  need(before.native.id === after.native.id && before.native.id === client.workspaceId,
    'The configured alias changed native workspace during publication inspection.', 'WORKSPACE_CONFLICT');
  // A publication is immutable. Later workspace revisions do not change its bytes.
  const value = { schema: CANADABUYS_PUBLICATION_SCHEMA, publicationId: selectedId,
    workspace: { alias: client.workspace, id: client.workspaceId },
    originalResponse: structuredClone(response),
    files: response.files?.map(descriptor).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) };
  validateManifest(value, selectedId);
  const bytes = encoded(value);
  need(bytes.length <= CANADABUYS_PUBLICATION_LIMITS.manifestBytes, 'The complete publication manifest exceeds its declared bound.');
  return { value, bytes, sha256: sha(bytes) };
}
/**
 * This is a local adapter for the unchanged durable file writer. Its manifest/file
 * dispatch names are never sent to MCP: only original files/file_read/file_release
 * are called remotely. Original nested paths, native read IDs and all bytes survive.
 */
function originalFileAdapter(client, selected, signal) {
  const selectedId = selected.value.publicationId, memoryReads = new Set(), nativeReads = new Set();
  const manifestFile = { name: CANADABUYS_PUBLICATION_MANIFEST, bytes: selected.bytes.length, sha256: selected.sha256 };
  const files = new Map(selected.value.files.map(file => [file.name, file]));
  return {
    endpoint: client.endpoint,
    async call(name, args, options = {}) {
      const activeSignal = options.requestSignal === null ? undefined : options.requestSignal ?? signal;
      activeSignal?.throwIfAborted();
      need(args.exportId === selectedId, 'The download changed its original publication UUID.');
      if (name === 'canadabuys_original_publication_manifest')
        return { state: 'MANIFEST_RETAINED', exportId: selectedId, manifestFile };
      if (name === 'canadabuys_original_publication_file_release') {
        if (memoryReads.delete(args.readId)) return { released: true, readId: args.readId };
        await client.fileRelease({ readId: args.readId }, { signal: activeSignal, timeoutMs: options.timeoutMs ?? 5000 });
        nativeReads.delete(args.readId);
        return { released: true, readId: args.readId };
      }
      need(name === 'canadabuys_original_publication_file', 'The local publication adapter received an unknown operation.');
      need(args.expectedManifestSha256 === selected.sha256, 'The download changed its inspected manifest.');
      const offset = args.offset ?? 0, limit = args.limit ?? MAX_RETAINED_CHUNK_BYTES;
      need(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit)
        && limit >= 1 && limit <= MAX_RETAINED_CHUNK_BYTES, 'Use the original chunk offset and byte bounds.');
      if (args.file === CANADABUYS_PUBLICATION_MANIFEST) {
        need(args.expectedSha256 === selected.sha256 && offset <= selected.bytes.length,
          'The selected manifest chunk changed its exact file.');
        const readId = args.readId ?? randomUUID();
        need(READ.test(readId) && (!args.readId || memoryReads.has(readId)), 'The original manifest reader is no longer selected.');
        memoryReads.add(readId);
        const bytes = selected.bytes.subarray(offset, offset + limit), nextOffset = offset + bytes.length < selected.bytes.length ? offset + bytes.length : null;
        if (nextOffset === null) memoryReads.delete(readId);
        return { exportId: selectedId, manifestSha256: selected.sha256, file: manifestFile,
          readId, offset, bytesRead: bytes.length, nextOffset, encoding: 'base64', data: bytes.toString('base64') };
      }
      const file = files.get(args.file);
      need(file && file.sha256 === args.expectedSha256 && offset <= file.bytes,
        'The selected chunk is not an original listed publication file.');
      const value = await client.fileRead({ publicationId: selectedId, file: file.name,
        expectedSha256: file.sha256, offset, limit, ...(args.readId ? { readId: args.readId } : {}) },
        { signal: activeSignal, timeoutMs: options.timeoutMs ?? 120000 });
      need(plain(value.file) && value.file.name === file.originalReadName && value.file.type === file.mime
        && value.file.bytes === file.bytes && value.file.sha256 === file.sha256
        && READ.test(value.readId ?? ''), 'The native reader changed the original publication descriptor.');
      if (value.nextOffset === null) nativeReads.delete(value.readId); else nativeReads.add(value.readId);
      return { ...value, exportId: selectedId, manifestSha256: selected.sha256,
        file: { ...value.file, name: file.name } };
    },
    async close() {
      const outcomes = await Promise.allSettled([...nativeReads].map(async readId => {
        await client.fileRelease({ readId }, { timeoutMs: 5000 }); nativeReads.delete(readId);
      }));
      memoryReads.clear();
      need(outcomes.every(value => value.status === 'fulfilled'),
        'An original native file lease did not finish closing; retain this client and retry disconnect.', 'CLOSE_INCOMPLETE');
    },
  };
}
export async function inspectCanadaBuysPublication({ client, publicationId: selectedId, signal } = {}) {
  const selected = await originalManifest(client, selectedId, signal);
  return { manifest: selected.value, manifestSha256: selected.sha256 };
}
export async function downloadCanadaBuysPublication({ client, publicationId: selectedId, directory,
  expectedManifestSha256, signal, chunkSize, onProgress } = {}) {
  const selected = await originalManifest(client, selectedId, signal);
  if (expectedManifestSha256 !== undefined)
    need(typeof expectedManifestSha256 === 'string' && SHA.test(expectedManifestSha256)
      && selected.sha256 === expectedManifestSha256, 'The publication differs from the original reviewed manifest.');
  const adapter = originalFileAdapter(client, selected, signal);
  let failure;
  try {
    return await receiving.download({ client: adapter, exportId: selectedId, directory, signal,
      expectedManifestSha256: selected.sha256, chunkSize, onProgress });
  } catch (error) { failure = error; throw error; }
  finally {
    try { await adapter.close(); }
    catch (error) { if (failure) failure.closeError = error; else throw error; }
  }
}
/** Verify every completed original byte locally. No endpoint, credentials or network is used. */
export async function verifyCanadaBuysDownload({ directory, publicationId: selectedId, expectedManifestSha256, signal } = {}) {
  publicationId(selectedId);
  return receiving.lockedDownload(directory, async context => {
    const bytes = await receiving.bytesAt(join(context.root, CANADABUYS_PUBLICATION_MANIFEST), CANADABUYS_PUBLICATION_LIMITS.manifestBytes);
    if (expectedManifestSha256 !== undefined)
      need(typeof expectedManifestSha256 === 'string' && SHA.test(expectedManifestSha256)
        && sha(bytes) === expectedManifestSha256, 'The retained manifest differs from the reviewed original.');
    // Both original checkpoint members are required; verification does not invent a completed download.
    const prior = JSON.parse(decode(await receiving.bytesAt(join(context.stateDirectory, 'checkpoint.json'), CANADABUYS_PUBLICATION_LIMITS.checkpointBytes)));
    const retained = await receiving.bytesAt(join(context.stateDirectory, CANADABUYS_PUBLICATION_MANIFEST), CANADABUYS_PUBLICATION_LIMITS.manifestBytes);
    need(retained.equals(bytes) && prior.manifestSha256 === sha(bytes), 'The original download checkpoint differs from its manifest.');
    await receiving.loadContext(context, bytes, selectedId);
    need(context.manifest.files.every(file => context.state.files[file.name]?.complete === true
      && context.state.files[file.name].bytes === file.bytes && context.state.files[file.name].sha256 === file.sha256),
      'The publication has not completed all original files.');
    for (const file of context.manifest.files) await receiving.verifiedFile(join(context.root, file.name), file, signal);
    return { schema: CANADABUYS_PUBLICATION_SCHEMA + '.verification', state: 'VERIFIED',
      directory: context.root, publicationId: selectedId, manifest: context.manifest,
      manifestSha256: sha(bytes), files: context.manifest.files.length,
      bytes: context.manifest.files.reduce((sum, file) => sum + file.bytes, 0), networkRequests: 0 };
  });
}
/** Receive a downloaded full package with the unchanged native SQLite workspace transaction. */
export async function receiveCanadaBuysPackage({ directory, publicationId: selectedId, workspaceDirectory,
  expectedRevision, expectedManifestSha256, operator = 'customer', title = 'CanadaBuys procurement desk', signal } = {}) {
  need(typeof workspaceDirectory === 'string' && workspaceDirectory && resolve(workspaceDirectory) !== resolve(directory)
    && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 'Select the receiving workspace and its actual revision.');
  const verified = await verifyCanadaBuysDownload({ directory, publicationId: selectedId, expectedManifestSha256, signal });
  need(verified.manifest.originalResponse.publication.kind === 'canadabuys-export'
    && verified.manifest.originalResponse.publication.format === 'package' && verified.manifest.files.length === 1,
    'Offline workspace receiving needs the original complete package publication.');
  const file = verified.manifest.files[0];
  const bytes = await receiving.bytesAt(join(verified.directory, file.name), file.bytes);
  need(bytes.length === file.bytes && sha(bytes) === file.sha256, 'The complete original package changed after verification.');
  let packet;
  try { packet = JSON.parse(decode(bytes)); }
  catch { throw canadaBuysClientError('PACKAGE', 'The original complete package is not UTF-8 JSON.'); }
  signal?.throwIfAborted();
  const { CanadaBuysWorkspace } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/workspace.mjs');
  const workspace = new CanadaBuysWorkspace(workspaceDirectory, { operator, title });
  try {
    const result = workspace.receivePackage(packet, { expectedRevision });
    return { schema: CANADABUYS_PUBLICATION_SCHEMA + '.workspace-receiving', state: 'RECEIVED',
      source: { publicationId: selectedId, workspaceId: verified.manifest.workspace.id,
        manifestSha256: verified.manifestSha256, file: { name: file.name, bytes: file.bytes, sha256: file.sha256 } },
      workspace: workspace.metadata(), result, networkRequests: 0 };
  } finally { workspace.close(); }
}
