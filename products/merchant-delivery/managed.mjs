// MIT. Applications owns the original single-merchant release console.
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseState } from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import { need, plain, canonical, digest, privateDirectory, operationLease }
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

export const DELIVERY_STARTUP_SCHEMA = 'tjlabs.merchant-delivery-startup.v1';
export const DELIVERY_BINDING_SCHEMA = 'tjlabs.merchant-delivery-binding.v1';
export const DELIVERY_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHA = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SF82 = 'stellar/scf-starforge-20261009/sf82-seller-pilot/';
export const DELIVERY_LAUNCH_FILES = Object.freeze([
  'products/merchant-delivery/managed.mjs', 'products/merchant-delivery/application-provider.mjs',
  ...['releases.mjs', 'release-child.mjs', 'release-console.mjs', 'release-delivery.mjs',
    'release-delivery-console.mjs', 'release-client.mjs', 'release-receiving.mjs',
    'release-ui/browser-assets.json', 'release-ui/index.html', 'release-ui/app.mjs',
    'release-ui/delivery.mjs', 'release-ui/style.css'].map(name => SF82 + name),
  'stellar/scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs',
  'stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/model.mjs',
  'stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/server.mjs',
  'stellar-forge/mcp-merchant-operator/retained-file-reads.mjs',
  'stellar/scf-starforge-20261009/distribution/browser-assets.mjs',
]);
const hash = value => digest(JSON.stringify(canonical(value)) + '\n');
const equal = (left, right) => hash(left) === hash(right);
const inode = value => ({ dev: String(value.dev), ino: String(value.ino) });
const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;
function path(value) {
  need(typeof value === 'string' && value !== '/' && value === resolve(value) &&
    !/[\u0000-\u001f\u007f]/.test(value), 'DELIVERY_APPLICATION_PATH_REQUIRED',
  'Use an absolute canonical path on the selected runtime host.');
  return value;
}
async function file(name, maximum = 8 * 1024 * 1024) {
  path(name);
  need(await realpath(dirname(name)) === dirname(name), 'DELIVERY_APPLICATION_SOURCE_PARENT');
  const handle = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const first = await handle.stat({ bigint: true });
    need(first.isFile() && first.size <= BigInt(maximum), 'DELIVERY_APPLICATION_FILE_INVALID');
    const bytes = await handle.readFile(), last = await handle.stat({ bigint: true });
    const current = await lstat(name, { bigint: true });
    need(sameInode(first, last) && sameInode(last, current) && !current.isSymbolicLink() &&
      first.size === last.size && BigInt(bytes.length) === last.size &&
      first.mtimeNs === last.mtimeNs && first.ctimeNs === last.ctimeNs,
    'DELIVERY_APPLICATION_FILE_CHANGED');
    return { bytes, sha256: digest(bytes) };
  } finally { await handle.close(); }
}
async function privateIdentity(directory) {
  await privateDirectory(path(directory));
  return inode(await lstat(directory, { bigint: true }));
}

/** Mutable release selection, delivery rows and customer edits are original state.
 * Binding the original store excludes their changing generation and file hashes. */
export async function inspectDeliveryWorkspace({ releaseStore, expectedSha256 } = {}) {
  releaseStore = path(releaseStore);
  need(expectedSha256 === undefined || SHA.test(expectedSha256), 'DELIVERY_APPLICATION_HASH_REQUIRED');
  const root = await privateIdentity(releaseStore), releases = await privateIdentity(join(releaseStore, 'releases'));
  const state = await readReleaseState(releaseStore);
  need(typeof state.createdAt === 'string' && Number.isFinite(Date.parse(state.createdAt)),
    'DELIVERY_APPLICATION_ORIGINAL_STORE_REQUIRED', 'Select an initialized original SF82 release store.');
  need(equal(root, await privateIdentity(releaseStore)) &&
    equal(releases, await privateIdentity(join(releaseStore, 'releases'))), 'DELIVERY_APPLICATION_STORE_CHANGED');
  const identity = { schema: 'tjlabs.merchant-delivery-store.v1', releaseStore,
    root, releases, createdAt: state.createdAt };
  const sha256 = hash(identity);
  need(expectedSha256 === undefined || expectedSha256 === sha256, 'DELIVERY_APPLICATION_STORE_CHANGED',
    'The selected original store changed. Review the saved application again.');
  return { ...identity, sha256, current: { generation: state.generation,
    active: state.active, previous: state.previous } };
}
export async function inspectDeliveryLaunchSource(sourceRoot = DELIVERY_SOURCE_ROOT, { expectedSha256 } = {}) {
  sourceRoot = path(sourceRoot);
  need(expectedSha256 === undefined || SHA.test(expectedSha256), 'DELIVERY_APPLICATION_HASH_REQUIRED');
  need(await realpath(sourceRoot) === sourceRoot, 'DELIVERY_APPLICATION_SOURCE_ROOT');
  const files = [];
  for (const name of DELIVERY_LAUNCH_FILES) {
    const original = await file(join(sourceRoot, name));
    files.push({ name, bytes: original.bytes.length, sha256: original.sha256 });
  }
  const sha256 = hash(files);
  need(expectedSha256 === undefined || expectedSha256 === sha256, 'DELIVERY_APPLICATION_SOURCE_CHANGED',
    'The installed delivery source changed. Select the completed original release and review again.');
  return { sourceRoot, files, sha256 };
}
function selection(value) {
  need(plain(value) && SHA.test(value.expectedStoreSha256 ?? '') &&
    SHA.test(value.expectedSourceSha256 ?? '') && UUID.test(value.operationId ?? '') &&
    Number.isInteger(value.port ?? 0) && (value.port ?? 0) >= 0 && (value.port ?? 0) <= 65535,
  'DELIVERY_APPLICATION_REVIEW_REQUIRED', 'Use the complete original Applications start selection.');
  return { releaseStore: path(value.releaseStore), sourceRoot: path(value.sourceRoot),
    expectedStoreSha256: value.expectedStoreSha256, expectedSourceSha256: value.expectedSourceSha256,
    operationId: value.operationId, port: value.port ?? 0 };
}
export async function prepareDeliveryLaunch(value) {
  const selected = selection(value);
  const workspace = await inspectDeliveryWorkspace({ releaseStore: selected.releaseStore,
    expectedSha256: selected.expectedStoreSha256 });
  const source = await inspectDeliveryLaunchSource(selected.sourceRoot,
    { expectedSha256: selected.expectedSourceSha256 });
  await inspectDeliveryLaunchSource(DELIVERY_SOURCE_ROOT, { expectedSha256: selected.expectedSourceSha256 });
  return { selected, workspace, source };
}
async function readListener(url, pathname, token, limit = 8 * 1024 * 1024) {
  let response;
  try {
    response = await fetch(new URL(pathname, url.origin), {
      ...(token ? { headers: { 'x-release-token': token } } : {}),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { need(false, 'DELIVERY_APPLICATION_LISTENER_UNAVAILABLE'); }
  need(response.ok && response.body, 'DELIVERY_APPLICATION_LISTENER_CHANGED',
    'The original release console returned HTTP ' + response.status + '.');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; need(bytes <= limit, 'DELIVERY_APPLICATION_RESPONSE_LIMIT');
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks, bytes);
}

/** Verify the exact original authenticated listener before Applications offers Open. */
export async function verifyDeliveryStartup(startup, value, { pid } = {}) {
  const selected = selection(value), binding = startup?.binding;
  need(plain(startup) && startup.schema === DELIVERY_STARTUP_SCHEMA && plain(binding) &&
    binding.schema === DELIVERY_BINDING_SCHEMA && UUID.test(binding.instanceId ?? '') &&
    Number.isSafeInteger(binding.pid) && binding.pid > 0 && (!pid || binding.pid === pid) &&
    Number.isSafeInteger(binding.ppid) && binding.ppid > 0 &&
    Number.isFinite(Date.parse(binding.startedAt)) &&
    binding.operationId === selected.operationId && binding.releaseStore === selected.releaseStore &&
    binding.storeSha256 === selected.expectedStoreSha256 &&
    binding.sourceSha256 === selected.expectedSourceSha256 &&
    binding.selectedSourceRoot === selected.sourceRoot,
  'DELIVERY_APPLICATION_STARTUP_CHANGED');
  path(binding.executedSourceRoot);
  const launch = await prepareDeliveryLaunch(selected);
  await inspectDeliveryLaunchSource(binding.executedSourceRoot, { expectedSha256: selected.expectedSourceSha256 });
  let url;
  try { url = new URL(startup.operatorUrl); } catch { need(false, 'DELIVERY_APPLICATION_URL_INVALID'); }
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' &&
    !url.username && !url.password && !url.search && /^[a-f0-9]{64}$/.test(url.hash.slice(1)) &&
    Number(url.port) >= 1 && Number(url.port) <= 65535 && (!selected.port || Number(url.port) === selected.port),
  'DELIVERY_APPLICATION_URL_INVALID');
  const page = await readListener(url, '/', null);
  need(page.equals((await file(join(launch.source.sourceRoot, SF82 + 'release-ui/index.html'))).bytes),
    'DELIVERY_APPLICATION_BROWSER_SOURCE_CHANGED');
  const status = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    await readListener(url, '/api/status', url.hash.slice(1))));
  need(equal(status.console?.binding, binding) && status.console.closing === false,
    'DELIVERY_APPLICATION_LIVE_BINDING_CHANGED');
  return { url: url.href, original: startup,
    links: [{ id: 'merchant-delivery', label: 'Merchant delivery and releases', url: url.href }] };
}

/** The controller exists before startup so a failed/interrupting open always has
 * one reachable close owner. A failed native close retains the lease for retry. */
export function createManagedDelivery(value, { environment = process.env } = {}) {
  const selected = selection(value);
  need(plain(environment), 'DELIVERY_APPLICATION_ENVIRONMENT_REQUIRED');
  let lease, service, opening, closing, stopped = false, complete = false;
  let finishClosed; const closed = new Promise(done => { finishClosed = done; });
  async function start() {
    need(!stopped, 'DELIVERY_APPLICATION_CLOSING');
    if (opening) return opening;
    opening = (async () => {
      await privateDirectory(selected.releaseStore);
      lease = await operationLease(join(selected.releaseStore, '.merchant-delivery-owner.lock'));
      const launch = await prepareDeliveryLaunch(selected);
      need(!stopped, 'DELIVERY_APPLICATION_CLOSING');
      const binding = Object.freeze({ schema: DELIVERY_BINDING_SCHEMA, instanceId: randomUUID(),
        pid: process.pid, ppid: process.ppid, startedAt: new Date().toISOString(),
        operationId: selected.operationId, releaseStore: selected.releaseStore,
        storeSha256: launch.workspace.sha256, selectedSourceRoot: selected.sourceRoot,
        executedSourceRoot: DELIVERY_SOURCE_ROOT, sourceSha256: launch.source.sha256 });
      const { startReleaseConsole } = await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/release-console.mjs');
      service = await startReleaseConsole(selected.releaseStore,
        { port: selected.port, env: environment, managedBinding: binding });
      need(!stopped, 'DELIVERY_APPLICATION_CLOSING');
      const startup = { schema: DELIVERY_STARTUP_SCHEMA, operatorUrl: service.operatorUrl, binding };
      await verifyDeliveryStartup(startup, selected, { pid: process.pid });
      need(!stopped, 'DELIVERY_APPLICATION_CLOSING');
      service.server.once('close', () => { if (!closing) close().catch(() => {}); });
      return startup;
    })();
    opening.catch(() => {});
    return opening;
  }
  function close() {
    stopped = true;
    if (complete) return Promise.resolve();
    if (closing) return closing;
    const attempt = (async () => {
      await opening?.catch(() => {});
      if (service) { await service.close(); service = undefined; }
      if (lease) { await lease.close(); lease = undefined; }
      complete = true; finishClosed();
    })();
    closing = attempt;
    attempt.catch(() => { if (closing === attempt) closing = undefined; });
    return attempt;
  }
  return { start, close, closed, get complete() { return complete; } };
}
export function parseDeliveryArguments(argv) {
  const flags = new Set(['--store', '--source-root', '--expected-store', '--expected-source', '--operation-id', '--port']);
  const values = new Map();
  need(Array.isArray(argv) && argv.length % 2 === 0, 'DELIVERY_APPLICATION_ARGUMENTS_INVALID');
  for (let i = 0; i < argv.length; i += 2) {
    need(flags.has(argv[i]) && !values.has(argv[i]) && typeof argv[i + 1] === 'string' &&
      argv[i + 1].length > 0, 'DELIVERY_APPLICATION_ARGUMENTS_INVALID');
    values.set(argv[i], argv[i + 1]);
  }
  const port = values.get('--port') ?? '0';
  need(/^(0|[1-9]\d{0,4})$/.test(port), 'DELIVERY_APPLICATION_PORT_INVALID');
  return selection({ releaseStore: values.get('--store'), sourceRoot: values.get('--source-root'),
    expectedStoreSha256: values.get('--expected-store'), expectedSourceSha256: values.get('--expected-source'),
    operationId: values.get('--operation-id'), port: Number(port) });
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write('Merchant delivery Applications command\n\nUse the original Applications Review, Save and Start flow.\nFor direct host operation use: starforge releases console --store ORIGINAL_STORE --port 0\n');
    return;
  }
  const owner = createManagedDelivery(parseDeliveryArguments(argv));
  const stop = () => { owner.close().catch(error => {
    process.stderr.write(String(error.message) + '\n'); process.exitCode = 1;
  }); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const startup = await owner.start();
    process.stdout.write(JSON.stringify(startup) + '\n');
    await owner.closed;
  } catch (error) {
    await owner.close();
    throw error;
  } finally {
    if (owner.complete) { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write(JSON.stringify({ error: error.code ?? 'DELIVERY_APPLICATION_ERROR',
    message: error.message }) + '\n'); process.exitCode = 1; });
