// MIT. Complete Invoice publication bytes through the original MCP file reader.
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs, constants } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createRetainedDownload } from './retained-download.mjs';
import { InvoiceMerchantClient, invoiceClientError, MAX_RETAINED_CHUNK_BYTES } from './invoice-settlement-client.mjs';

export const INVOICE_PUBLICATION_MANIFEST = 'invoice-settlement-publication.json';
export const INVOICE_PUBLICATION_SCHEMA = 'stellar-forge.invoice-settlement-publication-receiving.v1';
export const INVOICE_PUBLICATION_LIMITS = Object.freeze({
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
const need = (value, message, code = 'PUBLICATION') => { if (!value) throw invoiceClientError(code, message); };
function publicationId(value) {
  need(typeof value === 'string' && UUID.test(value), 'Select the original publication UUID.');
  return value;
}
function nativePath(name) {
  need(typeof name === 'string' && name.length >= 1 && name.length <= 1024 && !name.startsWith('/')
    && !/[\\:\u0000-\u001f\u007f]/.test(name) && name.split('/').length <= 32
    && name.split('/').every(part => part && part !== '.' && part !== '..')
    && name !== INVOICE_PUBLICATION_MANIFEST && name !== 'download-state' && !name.startsWith('download-state/'),
    'A published file must retain its canonical original relative path.');
  return name;
}
function descriptor(item) {
  need(plain(item), 'The original publication returned an invalid file descriptor.');
  const name = nativePath(item.file);
  need(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= INVOICE_PUBLICATION_LIMITS.fileBytes
    && typeof item.sha256 === 'string' && SHA.test(item.sha256)
    && typeof item.mime === 'string' && item.mime.length <= 512 && !/[\r\n\0]/.test(item.mime),
    'The original file must retain its exact byte count, SHA256 and media type.');
  return { name, bytes: item.bytes, sha256: item.sha256, mime: item.mime,
    originalReadName: basename(name), original: structuredClone(item) };
}
function validateManifest(value, selectedId) {
  need(plain(value) && value.schema === INVOICE_PUBLICATION_SCHEMA
    && value.publicationId === selectedId && plain(value.workspace)
    && typeof value.workspace.alias === 'string' && ALIAS.test(value.workspace.alias)
    && typeof value.workspace.id === 'string' && UUID.test(value.workspace.id)
    && plain(value.originalResponse) && value.originalResponse.workspace === value.workspace.alias
    && plain(value.originalResponse.publication) && value.originalResponse.publication.id === selectedId
    && ['invoice-settlement-export'].includes(value.originalResponse.publication.kind)
    && Array.isArray(value.originalResponse.files) && Array.isArray(value.files)
    && value.files.length > 0 && value.files.length <= INVOICE_PUBLICATION_LIMITS.files,
    'This is not a complete original Invoice publication manifest.');
  const expected = value.originalResponse.files.map(descriptor).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  need(encoded(expected).equals(encoded(value.files)), 'The manifest differs from the original complete file response.');
  const names = new Set(); let bytes = 0;
  for (const file of value.files) {
    need(!names.has(file.name), 'The original publication repeats a file path.'); names.add(file.name);
    bytes += file.bytes;
    need(Number.isSafeInteger(bytes) && bytes <= INVOICE_PUBLICATION_LIMITS.totalBytes,
      'The complete publication exceeds the declared 8 GiB transfer bound.');
  }
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++)
      need(!names.has(parts.slice(0, i).join('/')), 'A publication file conflicts with an original directory.');
  }
  return value;
}
export function parseInvoicePublication(bytes, selectedId) {
  publicationId(selectedId);
  need(bytes instanceof Uint8Array && bytes.length <= INVOICE_PUBLICATION_LIMITS.manifestBytes,
    'Use the complete original manifest within its 64 MiB bound.');
  let value;
  try { value = JSON.parse(decode(bytes)); }
  catch { throw invoiceClientError('PUBLICATION', 'The original publication manifest is not complete UTF-8 JSON.'); }
  return validateManifest(value, selectedId);
}
const receiving = createRetainedDownload({
  manifestName: INVOICE_PUBLICATION_MANIFEST, parseManifest: parseInvoicePublication,
  maximumBytes: INVOICE_PUBLICATION_LIMITS.fileBytes,
  maximumManifestBytes: INVOICE_PUBLICATION_LIMITS.manifestBytes,
  maximumCheckpointBytes: INVOICE_PUBLICATION_LIMITS.checkpointBytes,
  stateSchema: INVOICE_PUBLICATION_SCHEMA + '.download-state',
  resultSchema: INVOICE_PUBLICATION_SCHEMA + '.download-result',
  toolPrefix: 'invoice-settlement_original_publication', errorPrefix: 'INVOICE_FILE',
  clientName: 'starforge-invoice-settlement-customer', nestedFiles: true, validateExportId: publicationId,
  describe: value => ({ publicationId: value.publicationId, workspace: value.workspace.alias,
    workspaceId: value.workspace.id, publication: value.originalResponse.publication }),
});

async function originalManifest(client, selectedId, signal) {
  need(client instanceof InvoiceMerchantClient && !client.closed,
    'Use the original open Invoice MCP customer connection.');
  publicationId(selectedId); signal?.throwIfAborted();
  const before = await client.status({}, { signal });
  const response = await client.files({ publicationId: selectedId }, { signal });
  const after = await client.status({}, { signal });
  need(before.native.id === after.native.id && before.native.id === client.workspaceId,
    'The configured alias changed native workspace during publication inspection.', 'WORKSPACE_CONFLICT');
  // A publication is immutable. Later workspace revisions do not change its bytes.
  const value = { schema: INVOICE_PUBLICATION_SCHEMA, publicationId: selectedId,
    workspace: { alias: client.workspace, id: client.workspaceId },
    originalResponse: structuredClone(response),
    files: response.files?.map(descriptor).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) };
  validateManifest(value, selectedId);
  const bytes = encoded(value);
  need(bytes.length <= INVOICE_PUBLICATION_LIMITS.manifestBytes, 'The complete publication manifest exceeds its declared bound.');
  return { value, bytes, sha256: sha(bytes) };
}
/**
 * This is a local adapter for the unchanged durable file writer. Its manifest/file
 * dispatch names are never sent to MCP: only original files/file_read/file_release
 * are called remotely. Original nested paths, native read IDs and all bytes survive.
 */
function originalFileAdapter(client, selected, signal) {
  const selectedId = selected.value.publicationId, memoryReads = new Set(), nativeReads = new Set();
  const manifestFile = { name: INVOICE_PUBLICATION_MANIFEST, bytes: selected.bytes.length, sha256: selected.sha256 };
  const files = new Map(selected.value.files.map(file => [file.name, file]));
  return {
    endpoint: client.endpoint,
    async call(name, args, options = {}) {
      const activeSignal = options.requestSignal === null ? undefined : options.requestSignal ?? signal;
      activeSignal?.throwIfAborted();
      need(args.exportId === selectedId, 'The download changed its original publication UUID.');
      if (name === 'invoice-settlement_original_publication_manifest')
        return { state: 'MANIFEST_RETAINED', exportId: selectedId, manifestFile };
      if (name === 'invoice-settlement_original_publication_file_release') {
        if (memoryReads.delete(args.readId)) return { released: true, readId: args.readId };
        await client.fileRelease({ readId: args.readId }, { signal: activeSignal, timeoutMs: options.timeoutMs ?? 5000 });
        nativeReads.delete(args.readId);
        return { released: true, readId: args.readId };
      }
      need(name === 'invoice-settlement_original_publication_file', 'The local publication adapter received an unknown operation.');
      need(args.expectedManifestSha256 === selected.sha256, 'The download changed its inspected manifest.');
      const offset = args.offset ?? 0, limit = args.limit ?? MAX_RETAINED_CHUNK_BYTES;
      need(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit)
        && limit >= 1 && limit <= MAX_RETAINED_CHUNK_BYTES, 'Use the original chunk offset and byte bounds.');
      if (args.file === INVOICE_PUBLICATION_MANIFEST) {
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
      need(plain(value.file) && value.file.name === file.originalReadName && value.file.contentType === file.mime
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
export async function inspectInvoicePublication({ client, publicationId: selectedId, signal } = {}) {
  const selected = await originalManifest(client, selectedId, signal);
  return { manifest: selected.value, manifestSha256: selected.sha256 };
}
export async function downloadInvoicePublication({ client, publicationId: selectedId, directory,
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
export async function verifyInvoiceDownload({ directory, publicationId: selectedId, expectedManifestSha256, signal } = {}) {
  publicationId(selectedId);
  return receiving.lockedDownload(directory, async context => {
    const bytes = await receiving.bytesAt(join(context.root, INVOICE_PUBLICATION_MANIFEST), INVOICE_PUBLICATION_LIMITS.manifestBytes);
    if (expectedManifestSha256 !== undefined)
      need(typeof expectedManifestSha256 === 'string' && SHA.test(expectedManifestSha256)
        && sha(bytes) === expectedManifestSha256, 'The retained manifest differs from the reviewed original.');
    // Both original checkpoint members are required; verification does not invent a completed download.
    const prior = JSON.parse(decode(await receiving.bytesAt(join(context.stateDirectory, 'checkpoint.json'), INVOICE_PUBLICATION_LIMITS.checkpointBytes)));
    const retained = await receiving.bytesAt(join(context.stateDirectory, INVOICE_PUBLICATION_MANIFEST), INVOICE_PUBLICATION_LIMITS.manifestBytes);
    need(retained.equals(bytes) && prior.manifestSha256 === sha(bytes), 'The original download checkpoint differs from its manifest.');
    await receiving.loadContext(context, bytes, selectedId);
    need(context.manifest.files.every(file => context.state.files[file.name]?.complete === true
      && context.state.files[file.name].bytes === file.bytes && context.state.files[file.name].sha256 === file.sha256),
      'The publication has not completed all original files.');
    for (const file of context.manifest.files) await receiving.verifiedFile(join(context.root, file.name), file, signal);
    return { schema: INVOICE_PUBLICATION_SCHEMA + '.verification', state: 'VERIFIED',
      directory: context.root, publicationId: selectedId, manifest: context.manifest,
      manifestSha256: sha(bytes), files: context.manifest.files.length,
      bytes: context.manifest.files.reduce((sum, file) => sum + file.bytes, 0), networkRequests: 0 };
  });
}
/** Restore original modes in a separately owned source; downloaded custody stays private. */
async function nativeReceivingSource(verified,destination,requestId,signal){
 const moduleRoot='../../stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/';
 const {files,privateDirectory,withLock,copyDescriptor,jsonBytes}=await import(moduleRoot+'common.mjs');
 const {readInvoiceDeliveryManifest,inspectInvoiceDelivery}=await import(moduleRoot+'receiving.mjs');
 const native=verified.manifest.originalResponse.publication;
 const root=destination+'.invoice-source-'+requestId,sourceDirectory=join(root,'source');
 const overlaps=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
 need(!overlaps(verified.directory,destination)&&!overlaps(verified.directory,root)&&!overlaps(destination,root),
  'Keep the download, original-mode source and received workspace in independent directories.');
 const original=await readInvoiceDeliveryManifest({sourceDirectory:verified.directory,expectedManifestSha256:native.manifestSha256});
 const selected=new Map(verified.manifest.files.map(file=>[file.name,file]));
 need(selected.size===original.manifest.files.length+1&&selected.has('manifest.json'),
  'The complete publication must contain exactly the original native manifest and every native member.');
 for(const item of original.manifest.files){
  const file=selected.get(item.path);
  need(file&&file.bytes===item.bytes&&file.sha256===item.sha256,
   'The original native member differs from its complete downloaded selection.');
 }
 const binding={schema:INVOICE_PUBLICATION_SCHEMA+'.native-source',requestId,destination,
  directory:verified.directory,publicationId:verified.publicationId,workspaceId:verified.manifest.workspace.id,
  manifestSha256:verified.manifestSha256,nativeManifestSha256:native.manifestSha256};
 await privateDirectory(root);
 return withLock(root,'source.lock',async()=>{
  signal?.throwIfAborted();
  const bindingBytes=jsonBytes(binding);
  try{
   const previous=await files.readFile(root,'selection.json');
   need(previous.equals(bindingBytes),'The native staging root belongs to another original receiving request.');
  }catch(error){
   if(error.code!=='ENOENT')throw error;
   need((await fs.readdir(root)).every(name=>name==='source.lock'),
    'An unbound native source directory already contains files.');
   await files.writeNew(root,'selection.json',bindingBytes);
  }
  let complete;
  try{complete=await files.readJSON(root,'complete.json');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(complete)need(complete.selectionSha256===sha(bindingBytes)
   &&complete.nativeManifestSha256===native.manifestSha256&&complete.files===original.manifest.files.length,
   'The original native staging completion differs from its selection.');
  await privateDirectory(sourceDirectory);
  if(!complete){
   for(const item of original.manifest.files){
    signal?.throwIfAborted();
    await copyDescriptor(verified.directory,item,sourceDirectory);
    // Only this separately owned copy takes original executable/data modes.
    const path=await files.filePath(sourceDirectory,item.path);
    const handle=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
     need((await handle.stat()).isFile(),'The native receiving member is no longer a regular file.');
     await handle.chmod(item.mode??0o600);await handle.sync();
    }finally{await handle.close();}
   }
   await files.writeNew(sourceDirectory,'manifest.json',original.bytes);
  }
  const checked=await inspectInvoiceDelivery({sourceDirectory,expectedManifestSha256:native.manifestSha256});
  need(checked.manifest.workspaceId===verified.manifest.workspace.id,
   'The original native package changed workspace identity.');
  await files.writeNew(root,'complete.json',jsonBytes({schema:INVOICE_PUBLICATION_SCHEMA+'.native-source-complete',
   selectionSha256:sha(bindingBytes),nativeManifestSha256:native.manifestSha256,files:original.manifest.files.length}));
  return {sourceDirectory,selection:binding,selectionSha256:sha(bindingBytes)};
 });
}
/** Receive the complete original native package, retaining source/history/runtime coverage. */
export async function receiveInvoicePackage({directory,publicationId:selectedId,destination,requestId,expectedManifestSha256,signal}={}){
 need(typeof destination==='string'&&destination&&resolve(destination)!==resolve(directory)&&UUID.test(requestId??''),
  'Select an independent receiving destination and retain its original request UUID.');
 const verified=await verifyInvoiceDownload({directory,publicationId:selectedId,expectedManifestSha256,signal});
 const native=verified.manifest.originalResponse.publication;
 need(native.kind==='invoice-settlement-export'&&SHA.test(native.manifestSha256??''),'Select a native original delivery manifest.');
 signal?.throwIfAborted();
 const source=await nativeReceivingSource(verified,resolve(destination),requestId,signal);
 const {receiveInvoiceDelivery}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/receiving.mjs');
 const result=await receiveInvoiceDelivery({sourceDirectory:source.sourceDirectory,destination:resolve(destination),requestId,expectedManifestSha256:native.manifestSha256});
 return {schema:INVOICE_PUBLICATION_SCHEMA+'.native-receiving',state:'RECEIVED',source:{publicationId:selectedId,
  workspaceId:verified.manifest.workspace.id,manifestSha256:native.manifestSha256,
  directory:source.sourceDirectory,selectionSha256:source.selectionSha256},result,networkRequests:0};
}
