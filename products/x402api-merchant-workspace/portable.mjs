// MIT License. Carry the complete original merchant project between operators.
import { spawn } from 'node:child_process';
import { mkdir, readdir, realpath, lstat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MerchantResult, MerchantError, validateConfig } from './workspace.mjs';
import { canonicalJson } from './protocol.mjs';
import { reviewMerchantInputs, merchantInputFiles, readMerchantInput } from './application-inputs.mjs';
import { readJSON, saveJSON, operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = 'stellar-forge.merchant-portable-request.v1';
const RECORD = 'stellar-forge.merchant-project-export.v1';
const RESULT = 'stellar-forge.merchant-portable-result.v1';
const stamp = () => new Date().toISOString();
function need(value, code, status = 400) { if (!value) throw new MerchantError(code, status); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MERCHANT_PROJECT_ABSOLUTE_PATH_REQUIRED');
  return value;
}
function operation(value) { need(typeof value === 'string' && UUID.test(value), 'MERCHANT_PROJECT_OPERATION_REQUIRED'); return value; }
function childPath(path, parent) {
  return path !== parent && path.startsWith(parent.endsWith('/') ? parent : parent + '/');
}
async function privateDirectory(path) {
  absolute(path);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path &&
    !(info.mode & 0o077) && (process.getuid === undefined || info.uid === process.getuid()),
    'MERCHANT_PROJECT_PRIVATE_DIRECTORY_REQUIRED');
  return path;
}
function nativeError(result, stderr, exitCode, signal) {
  const code = result?.error?.code ?? result?.error;
  const value = new MerchantError(typeof code === 'string' ? code : 'MERCHANT_PROJECT_NATIVE_FAILED', 503);
  value.details = { exitCode, signal, native: result ?? null, stderr: stderr.slice(-65536) };
  return value;
}

/** One native invocation, drained through its actual close. HTTP cancellation
 * never starts another export or abandons this process's original return.
 */
export async function runPortable(request, { python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON ?? 'python3',
  lease = null, signal = null } = {}) {
  need(request && request.schema === REQUEST && ['export', 'inspect', 'receive'].includes(request.action),
    'MERCHANT_PROJECT_REQUEST_INVALID');
  operation(request.operation);
  need(typeof python === 'string' && python.length > 0 && !python.includes('\0'), 'MERCHANT_PROJECT_PYTHON_REQUIRED');
  const selected = { ...request };
  if (lease) {
    need(request.action === 'export' && Number.isInteger(lease.fd) && lease.fd >= 0, 'MERCHANT_PROJECT_ORIGINAL_LEASE_REQUIRED');
    selected.leaseFd = 3;
  } else {
    need(selected.leaseFd === undefined, 'MERCHANT_PROJECT_ORIGINAL_LEASE_REQUIRED');
  }
  need(signal === null || (typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'),
    'MERCHANT_PROJECT_SIGNAL_INVALID');
  need(!signal?.aborted, 'MERCHANT_PROJECT_INTERRUPTED', 503);
  const bytes = Buffer.from(JSON.stringify(selected) + '\n');
  need(bytes.length <= 4 * 1024 * 1024, 'MERCHANT_PROJECT_REQUEST_TOO_LARGE');
  const child = spawn(python, ['-B', join(ROOT, 'portable_native.py'), '--request', '-'],
    { stdio: ['pipe', 'pipe', 'pipe', ...(lease ? [lease.fd] : [])], windowsHide: true,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  let output = [], length = 0, stderr = '', inputError = null, processError = null, overflow = false;
  child.stdout.on('data', part => {
    length += part.length;
    if (length <= 64 * 1024 * 1024) output.push(part);
    else if (!overflow) { overflow = true; output = []; child.kill('SIGTERM'); }
  });
  child.stderr.on('data', part => { stderr = (stderr + part.toString('utf8')).slice(-262144); });
  child.stdin.on('error', error => { inputError = error; });
  child.on('error', error => { processError = error; });
  const stopped = () => {
    const name = signal?.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
    if (child.exitCode === null && child.signalCode === null) child.kill(name);
  };
  signal?.addEventListener('abort', stopped, { once: true });
  let ended;
  try {
    const closed = new Promise(resolveClose => child.once('close', (code, childSignal) => resolveClose({ code, signal: childSignal })));
    child.stdin.end(bytes);
    if (signal?.aborted) stopped();
    ended = await closed;
  } finally { signal?.removeEventListener('abort', stopped); }
  if (overflow) throw new MerchantError('MERCHANT_PROJECT_NATIVE_RESULT_TOO_LARGE', 503);
  let result = null;
  try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(output))); }
  catch { /* Native failures publish their typed JSON result to stderr. */ }
  if (result === null) {
    try {
      const failure = JSON.parse(stderr.trim());
      if (failure?.schema === RESULT && failure?.state === 'ERROR') result = failure;
    } catch { /* Keep the exact stderr tail and native close identity below. */ }
  }
  if (processError || inputError || ended.code !== 0 || result?.schema !== RESULT ||
    result?.action !== request.action || result?.operation !== request.operation || result?.state !== 'COMPLETE') {
    const failure = nativeError(result, stderr, ended.code, ended.signal);
    failure.cause = processError ?? inputError ?? null; throw failure;
  }
  return result;
}

function summarize(record, active = false) {
  const selected = { schema: RECORD, operation: record.operation, storeId: record.storeId,
    state: record.state === 'PREPARING' && !active ? 'INTERRUPTED' : record.state,
    createdAt: record.createdAt, updatedAt: record.updatedAt };
  if (record.archive) selected.archive = { bytes: record.archive.bytes, sha256: record.archive.sha256,
    members: record.archive.members, fileName: 'merchant-project-' + record.operation + '.zip' };
  if (record.snapshot) selected.snapshot = record.snapshot;
  if (record.source) selected.source = record.source;
  if (record.error) selected.error = record.error;
  if (record.configuration) selected.configuration = record.configuration;
  return selected;
}

export class MerchantProject {
  constructor({ workspace, configurationFile, sourceArchive, sourceSha256, outputDirectory,
    reviewedInputs, inputFiles, python, allowLoopback }) {
    this.workspace = workspace; this.configurationFile = configurationFile;
    this.sourceArchive = sourceArchive; this.sourceSha256 = sourceSha256;
    this.directory = outputDirectory; this.records = join(outputDirectory, 'exports');
    this.reviewedInputs = reviewedInputs; this.inputFiles = inputFiles;
    this.python = python; this.allowLoopback = allowLoopback;
    this.pending = new Map(); this.downloads = new Map(); this.closing = false;
  }
  _path(id, suffix = '.json') { return join(this.records, operation(id) + suffix); }
  async _record(id) {
    const value = await readJSON(this._path(id), true);
    if (value) need(value.schema === RECORD && value.operation === id &&
      value.storeId === this.workspace.store.storeId, 'MERCHANT_PROJECT_EXPORT_CHANGED', 409);
    return value;
  }
  async _save(record) {
    record.updatedAt = stamp();
    await saveJSON(this._path(record.operation), record, true);
    return record;
  }
  async list() {
    const files = await readdir(this.records), rows = [];
    for (const name of files) {
      if (!UUID.test(name.slice(0, -5)) || !name.endsWith('.json')) continue;
      const row = await this._record(name.slice(0, -5));
      if (row) rows.push(summarize(row, this.pending.has(row.operation)));
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.operation.localeCompare(b.operation));
  }
  async describe() {
    return { available: true, mode: this.workspace.readOnly ? 'review' : 'live',
      storeId: this.workspace.store.storeId, sourceSha256: this.sourceSha256,
      exports: await this.list() };
  }
  async status(id) {
    const row = await this._record(operation(id));
    need(row, 'MERCHANT_PROJECT_EXPORT_NOT_FOUND', 404);
    return summarize(row, this.pending.has(id));
  }
  async begin(id) {
    operation(id);
    need(!this.closing, 'MERCHANT_PROJECT_CLOSING', 503);
    this.workspace.store._assertOpen();
    const current = this.pending.get(id);
    if (current) return this.status(id);
    let record = await this._record(id);
    if (record?.state === 'COMPLETE') return summarize(record);
    // The request record is immutable. A changed configuration, file edition
    // or source archive cannot silently retarget an interrupted export.
    const requestPath = this._path(id, '.request.json');
    let request = await readJSON(requestPath, true);
    if (!request) {
      const reviewed = this.reviewedInputs ?? await reviewMerchantInputs(this.configurationFile,
        { inputFiles: this.inputFiles, allowLoopback: this.allowLoopback, validateConfig });
      request = { schema: REQUEST, action: 'export', operation: id,
        directory: this.workspace.store.directory, expectedStoreId: this.workspace.store.storeId,
        config: this.configurationFile, sourceArchive: this.sourceArchive,
        sourceSha256: this.sourceSha256, outputDirectory: this.directory,
        inputFiles: reviewed.inputs.files.map(file => ({ path: file.path, bytes: String(file.bytes),
          sha256: file.sha256, role: file.path === this.configurationFile ? 'configuration' :
            file.path === reviewed.inputs.modulePath ? 'fulfillment-module' : 'declared-input' })) };
      try { await saveJSON(requestPath, request); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const original = await readJSON(requestPath);
        need(canonicalJson(original) === canonicalJson(request), 'MERCHANT_PROJECT_REQUEST_CHANGED', 409);
        request = original;
      }
    }
    const requestSha256 = hash(canonicalJson(request));
    need(request.schema === REQUEST && request.action === 'export' && request.operation === id &&
      request.directory === this.workspace.store.directory && request.expectedStoreId === this.workspace.store.storeId &&
      (!record || record.requestSha256 === requestSha256), 'MERCHANT_PROJECT_REQUEST_CHANGED', 409);
    const createdAt = record?.createdAt ?? stamp();
    record = { schema: RECORD, operation: id, storeId: this.workspace.store.storeId,
      requestSha256, state: 'PREPARING', createdAt, updatedAt: stamp() };
    await this._save(record);
    // Publish the promise synchronously before the first native operation.
    // A simultaneous retry receives this same application-owned operation.
    if (this.pending.has(id)) return this.status(id);
    const work = Promise.resolve().then(async () => {
      let lease = null;
      try {
        lease = await operationLease(this._path(id, '.owner.lock'));
        this.workspace.store._assertOpen();
        await this.workspace.flushRetainedReturns();
        const result = await runPortable(request, { python: this.python, lease: this.workspace.store._lease });
        const count = Number(result.archive?.bytes);
        need(typeof result.archive?.path === 'string' && childPath(absolute(result.archive.path), this.directory) &&
          Number.isSafeInteger(count) && count > 0 && SHA.test(result.archive.sha256),
          'MERCHANT_PROJECT_ARCHIVE_INVALID', 503);
        await saveJSON(this._path(id, '.native-result.json'), result, true);
        await this._save({ ...record, state: 'COMPLETE',
          archive: result.archive, manifestSha256: result.manifestSha256,
          snapshot: { tableCounts: Object.fromEntries(result.manifest.snapshot.tables.map(table => [table.name, table.rows])),
            businessSha256: result.manifest.snapshot.businessSha256 },
          configuration: { environmentReferences: result.manifest.configuration.environmentReferences,
            fulfillment: { kind: result.manifest.configuration.fulfillment.kind,
              manifests: result.manifest.configuration.fulfillment.manifests.length,
              bindings: result.manifest.configuration.fulfillment.bindings.length } },
          source: { bytes: result.manifest.source.bytes, sha256: result.manifest.source.sha256 } });
      } catch (error) {
        await this._save({ ...record, state: 'RETRY_REQUIRED', error:
          String(error?.code ?? 'MERCHANT_PROJECT_EXPORT_FAILED').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160) });
      } finally {
        if (lease) await lease.close();
      }
    }).finally(() => this.pending.delete(id));
    // Retain a handled rejection until close(); consumers read the durable
    // original status and resume the same UUID if local publication was cut.
    this.pending.set(id, work);
    work.catch(error => {
      try { process.stderr.write(JSON.stringify({ event: 'merchant_project_export_error', operation: id,
        error: error?.code ?? 'MERCHANT_PROJECT_EXPORT_FAILED' }) + '\n'); } catch {}
    });
    return this.status(id);
  }
  async manifest(id) {
    await this.status(id);
    let value = null;
    try {
      const selected = await readMerchantInput(this._path(id, '.native-result.json'),
        { maximum: 64 * 1024 * 1024, collect: true, privateOnly: true });
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(selected.raw));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    need(value?.state === 'COMPLETE', 'MERCHANT_PROJECT_EXPORT_NOT_READY', 409);
    return value.manifest;
  }
  async archive(id) {
    const row = await this._record(operation(id));
    need(row?.state === 'COMPLETE', 'MERCHANT_PROJECT_EXPORT_NOT_READY', 409);
    need(childPath(absolute(row.archive.path), this.directory), 'MERCHANT_PROJECT_ARCHIVE_INVALID', 409);
    const count = Number(row.archive.bytes);
    need(Number.isSafeInteger(count) && count > 0 && SHA.test(row.archive.sha256),
      'MERCHANT_PROJECT_ARCHIVE_INVALID', 409);
    return new MerchantResult({ path: row.archive.path, bytes: count, sha256: row.archive.sha256,
      contentType: 'application/zip', fileName: 'merchant-project-' + id + '.zip' });
  }
  async downloadTicket(id) {
    need(!this.closing, 'MERCHANT_PROJECT_CLOSING', 503);
    const file = await this.archive(id), current = Date.now();
    for (const [key, value] of this.downloads) if (value.expiresAt <= current) this.downloads.delete(key);
    need(this.downloads.size < 1024, 'MERCHANT_PROJECT_DOWNLOAD_BUSY', 429);
    const ticket = randomUUID(), expiresAt = current + 60000;
    this.downloads.set(ticket, { file, expiresAt });
    return { url: '/downloads/project/' + ticket, expiresAt: new Date(expiresAt).toISOString() };
  }
  consumeDownload(ticket) {
    operation(ticket);
    const selected = this.downloads.get(ticket);
    this.downloads.delete(ticket);
    need(selected && selected.expiresAt > Date.now(), 'MERCHANT_PROJECT_DOWNLOAD_EXPIRED', 404);
    return selected.file;
  }
  async close() {
    this.closing = true; this.downloads.clear();
    await Promise.allSettled([...this.pending.values()]);
  }
}

export async function createMerchantProject({ workspace, configurationFile, sourceArchive,
  sourceSha256, outputDirectory, reviewedInputs = null, inputFiles = [], python,
  allowLoopback = false }) {
  need(workspace?.store && !workspace.readOnly, 'MERCHANT_PROJECT_LIVE_WORKSPACE_REQUIRED');
  absolute(configurationFile); absolute(sourceArchive); absolute(outputDirectory);
  need(SHA.test(sourceSha256), 'MERCHANT_PROJECT_SOURCE_SHA256_REQUIRED');
  need(outputDirectory !== workspace.store.directory && !childPath(outputDirectory, workspace.store.directory) &&
    !childPath(workspace.store.directory, outputDirectory), 'MERCHANT_PROJECT_SEPARATE_EXPORT_DIRECTORY_REQUIRED');
  await privateDirectory(outputDirectory);
  await privateDirectory(join(outputDirectory, 'exports'));
  return new MerchantProject({ workspace, configurationFile, sourceArchive, sourceSha256,
    outputDirectory, reviewedInputs, inputFiles: merchantInputFiles(inputFiles), python, allowLoopback });
}

/** Explicit installed source, verified before enabling the export button. */
export async function resolveMerchantProjectSource({ sourceArchive, sourceSha256 } = {}) {
  if (!sourceArchive && !sourceSha256) {
    // The maintained installer uses runtime/package/source; a received
    // project materializes its retained edition at runtime/source.
    for (const installed of [resolve(ROOT, '../../..', 'source.tgz'), resolve(ROOT, '../../../..', 'source.tgz')]) {
      try {
        const actual = await readMerchantInput(installed, { maximum: 64 * 1024 * 1024 });
        return { sourceArchive: installed, sourceSha256: actual.descriptor.sha256 };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return null;
  }
  need(sourceArchive && sourceSha256 && SHA.test(sourceSha256), 'MERCHANT_PROJECT_SOURCE_PAIR_REQUIRED');
  const path = absolute(resolve(sourceArchive));
  const actual = await readMerchantInput(path, { maximum: 64 * 1024 * 1024 });
  need(actual.descriptor.sha256 === sourceSha256, 'MERCHANT_PROJECT_SOURCE_CHANGED', 409);
  return { sourceArchive: path, sourceSha256 };
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    request: { type: 'string' }, operation: { type: 'string' }, directory: { type: 'string' },
    config: { type: 'string' }, 'source-archive': { type: 'string' }, 'source-sha256': { type: 'string' },
    'output-directory': { type: 'string' }, archive: { type: 'string' }, 'archive-sha256': { type: 'string' },
    destination: { type: 'string' }, python: { type: 'string' },
    'input-files': { type: 'string' }, 'allow-loopback': { type: 'boolean', default: false }
  } });
  const action = positionals[0];
  need(positionals.length === 1 && ['export', 'inspect', 'receive'].includes(action),
    'USE_EXPORT_INSPECT_OR_RECEIVE');
  let request;
  if (values.request) {
    request = await readJSON(absolute(resolve(values.request)));
    need(request.action === action, 'MERCHANT_PROJECT_REQUEST_ACTION_CHANGED');
  } else {
    request = { schema: REQUEST, action, operation: operation(values.operation) };
    if (action === 'export') {
      const directory = absolute(resolve(values.directory ?? '')), config = absolute(resolve(values.config ?? ''));
      need(values.directory && values.config && values['output-directory'], 'MERCHANT_PROJECT_EXPORT_PATHS_REQUIRED');
      const selected = await resolveMerchantProjectSource({ sourceArchive: values['source-archive'], sourceSha256: values['source-sha256'] });
      need(selected, 'MERCHANT_PROJECT_SOURCE_PAIR_REQUIRED');
      const reviewed = await reviewMerchantInputs(config, {
        inputFiles: merchantInputFiles(values['input-files']), allowLoopback: values['allow-loopback'], validateConfig });
      Object.assign(request, { directory, config, ...selected, outputDirectory: resolve(values['output-directory']),
        inputFiles: reviewed.inputs.files.map(file => ({ path: file.path, bytes: String(file.bytes),
          sha256: file.sha256, role: file.path === config ? 'configuration' :
            file.path === reviewed.inputs.modulePath ? 'fulfillment-module' : 'declared-input' })) });
    } else {
      need(values.archive && values['archive-sha256'] && SHA.test(values['archive-sha256']),
        'MERCHANT_PROJECT_ORIGINAL_ARCHIVE_REQUIRED');
      Object.assign(request, { archive: resolve(values.archive), archiveSha256: values['archive-sha256'] });
      if (action === 'receive') {
        need(values.destination, 'MERCHANT_PROJECT_DESTINATION_REQUIRED');
        request.destination = resolve(values.destination);
      }
    }
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort('SIGINT'), terminate = () => controller.abort('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    const result = await runPortable(request, { python: values.python, signal: controller.signal });
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { process.stderr.write(JSON.stringify({ error: error?.code ?? 'MERCHANT_PROJECT_FAILED',
    ...(error?.details ? { details: error.details } : {}) }) + '\n'); process.exitCode = 1; });

// Preserve the original offline-directory handover API alongside project ZIP receiving.
export { databaseIdentity, exportMerchant, inspectMerchantArchive, restoreMerchant,
  startMerchantArchiveServer, portableCommand } from './portable-directory.mjs';
