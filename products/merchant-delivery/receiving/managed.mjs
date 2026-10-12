#!/usr/bin/env node
// MIT. Applications owns the original received SF98 destination workspace.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectReceivedDelivery } from './receive.mjs';
import { openDestinationWorkspace } from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/model.mjs';
import { createDestinationsHandler } from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/server.mjs';
import { ROOT_SCHEMA, privateDirectory, hash, fault, codeOf }
  from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/storage.mjs';
import { canonical, json, operationLease }
  from '../../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

export const DELIVERY_RECEIVING_LAUNCH_SCHEMA = 'stellar-forge.delivery-receiving-launch.v1';
export const DELIVERY_RECEIVING_SESSION_SCHEMA = 'stellar-forge.delivery-receiving-session.v1';
export const DELIVERY_RECEIVING_STARTUP_SCHEMA = 'tjlabs.delivery-receiving-startup.v1';
export const DELIVERY_RECEIVING_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHA = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SF98 = 'stellar/scf-starforge-20261009/sf98-merchant-delivery/';
export const DELIVERY_RECEIVING_LAUNCH_FILES = Object.freeze([
  'products/merchant-delivery/receiving/managed.mjs',
  'products/merchant-delivery/receiving/receive.mjs',
  'products/merchant-delivery/receiving/application-provider.mjs',
  ...['outbox.mjs', 'deliver.mjs', 'delivery-lock.mjs', 'delivery-recovery.mjs',
    'destinations/model.mjs', 'destinations/server.mjs', 'destinations/storage.mjs',
    'destinations/exchange.mjs', 'destinations/public/index.html',
    'destinations/public/app.mjs', 'destinations/public/style.css'].map(name => SF98 + name),
  'stellar/scf-starforge-20261009/sf101-merchant-outbox-continuity/continuity.mjs',
  'stellar-forge/mcp-merchant-operator/delivery-download.mjs',
  'stellar-forge/mcp-merchant-operator/retained-download.mjs',
  'stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs',
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs',
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (left, right) => hash(json(canonical(left))) === hash(json(canonical(right)));
const inode = value => ({ dev: String(value.dev), ino: String(value.ino) });
const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;
function need(value, code, status = 400) { if (!value) throw fault(code, status); }
function path(value) {
  need(typeof value === 'string' && value !== '/' && value === resolve(value) &&
    !/[\u0000-\u001f\u007f]/.test(value), 'DELIVERY_RECEIVING_CANONICAL_PATH_REQUIRED');
  return value;
}
function options(input) {
  need(object(input), 'DELIVERY_RECEIVING_SELECTION_REQUIRED');
  const port = input.port ?? 0;
  need(Number.isInteger(port) && port >= 0 && port <= 65535, 'DELIVERY_RECEIVING_PORT_INVALID');
  return { receivedDirectory: path(input.receivedDirectory), port };
}
async function originalFile(name, { privateOnly = false, maximum = 8 * 1024 * 1024 } = {}) {
  path(name);
  need(await realpath(dirname(name)) === dirname(name), 'DELIVERY_RECEIVING_FILE_PARENT_CHANGED', 409);
  const handle = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(maximum), 'DELIVERY_RECEIVING_FILE_INVALID');
    if (privateOnly) need(before.nlink === 1n && !(before.mode & 0o077n) &&
      (!process.getuid || before.uid === BigInt(process.getuid())), 'PRIVATE_OPERATOR_FILE_REQUIRED');
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
    const current = await lstat(name, { bigint: true });
    need(sameInode(before, after) && sameInode(after, current) && !current.isSymbolicLink() &&
      before.size === after.size && BigInt(bytes.length) === after.size &&
      before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs,
    'DELIVERY_RECEIVING_FILE_CHANGED', 409);
    return { bytes, sha256: hash(bytes), ...inode(after) };
  } finally { await handle.close(); }
}
async function directory(role, name) {
  await privateDirectory(path(name));
  const info = await lstat(name, { bigint: true });
  return { role, path: name, ...inode(info) };
}
async function bindingFile(role, name) {
  const original = await originalFile(name, { privateOnly: true, maximum: 1024 * 1024 });
  return { role, path: name, dev: original.dev, ino: original.ino,
    bytes: original.bytes.length, sha256: original.sha256 };
}
async function bindingFiles(received) {
  const directories = await Promise.all([
    directory('received', received.receivedDirectory),
    directory('source', received.receipt.sourceDirectory),
    directory('workspace', received.receipt.workspaceDirectory),
    directory('destinations', join(received.receipt.workspaceDirectory, 'destinations')),
  ]);
  const files = await Promise.all([
    bindingFile('receipt', join(received.receivedDirectory, 'received.json')),
    bindingFile('workspace', join(received.receipt.workspaceDirectory, 'workspace.json')),
  ]);
  need(files[0].sha256 === received.receiptSha256, 'DELIVERY_RECEIVING_BINDING_CHANGED', 409);
  return { directories, files };
}
export const receivingResource = receivedDirectory =>
  ({ family: 'sf98-destinations-workspace', directory: join(path(receivedDirectory), 'workspace') });

/** Immutable receipt and path identities exclude the changing destination
 * descriptors, cursors, delivery attempts and worker observations. */
export async function inspectReceivingLaunch(input = {}, { environment = process.env } = {}) {
  const selected = options(input);
  const received = await inspectReceivedDelivery({ receivedDirectory: selected.receivedDirectory, environment });
  const observed = await bindingFiles(received), confirmed = await bindingFiles(received);
  need(equal(observed, confirmed), 'DELIVERY_RECEIVING_BINDING_CHANGED', 409);
  const resourceId = hash(json(canonical(receivingResource(selected.receivedDirectory))));
  const binding = { schema: DELIVERY_RECEIVING_LAUNCH_SCHEMA, options: selected,
    resourceId, fingerprint: received.fingerprint, receiptSha256: received.receiptSha256,
    sourceDirectory: received.receipt.sourceDirectory,
    workspaceDirectory: received.receipt.workspaceDirectory, ...observed };
  return { schema: DELIVERY_RECEIVING_LAUNCH_SCHEMA, ...selected,
    sourceDirectory: binding.sourceDirectory, workspaceDirectory: binding.workspaceDirectory,
    resourceId, fingerprint: received.fingerprint, receiptSha256: received.receiptSha256,
    binding, bindingSha256: hash(json(canonical(binding))), ...observed,
    review: { receivedAt: received.receipt.receivedAt,
      sourceEvents: received.current.source.events, sourceFingerprint: received.current.source.fingerprint,
      destinations: received.current.destinations.map(value => ({
        id: value.id, label: value.label, url: value.url, secretEnv: value.secretEnv,
        paused: value.paused, revision: value.revision, continuity: value.continuity,
        secretAvailable: value.secretAvailable, error: value.error,
      })), worker: received.current.worker,
      instructions: 'Open the original received workspace, then use its explicit Sync, Drain, Start and Stop controls.' } };
}
export async function inspectReceivingLaunchSource(sourceRoot = DELIVERY_RECEIVING_SOURCE_ROOT, { expectedSha256 } = {}) {
  sourceRoot = path(sourceRoot);
  need(expectedSha256 === undefined || SHA.test(expectedSha256), 'DELIVERY_RECEIVING_SOURCE_HASH_REQUIRED');
  need(await realpath(sourceRoot) === sourceRoot, 'DELIVERY_RECEIVING_SOURCE_ROOT_CHANGED', 409);
  const files = [];
  for (const name of DELIVERY_RECEIVING_LAUNCH_FILES) {
    const original = await originalFile(join(sourceRoot, name));
    files.push({ name, bytes: original.bytes.length, sha256: original.sha256 });
  }
  const sha256 = hash(json(canonical(files)));
  need(expectedSha256 === undefined || sha256 === expectedSha256,
    'DELIVERY_RECEIVING_SOURCE_CHANGED', 409);
  return { sourceRoot, files, sha256 };
}
function selection(input) {
  const selected = options(input);
  need(SHA.test(input.expectedBindingSha256 ?? '') && SHA.test(input.expectedSourceSha256 ?? '') &&
    UUID.test(input.operationId ?? ''), 'DELIVERY_RECEIVING_REVIEW_REQUIRED');
  return { ...selected, sourceRoot: path(input.sourceRoot), expectedBindingSha256: input.expectedBindingSha256,
    expectedSourceSha256: input.expectedSourceSha256, operationId: input.operationId };
}
export async function prepareReceivingLaunch(input, { environment = process.env } = {}) {
  const selected = selection(input), launch = await inspectReceivingLaunch(selected, { environment });
  need(launch.bindingSha256 === selected.expectedBindingSha256, 'DELIVERY_RECEIVING_BINDING_CHANGED', 409);
  const source = await inspectReceivingLaunchSource(selected.sourceRoot,
    { expectedSha256: selected.expectedSourceSha256 });
  await inspectReceivingLaunchSource(DELIVERY_RECEIVING_SOURCE_ROOT,
    { expectedSha256: selected.expectedSourceSha256 });
  return { selected, launch, source };
}
async function readListener(url, pathname, maximum = 8 * 1024 * 1024) {
  let response;
  try { response = await fetch(new URL(pathname, url.origin),
    { redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { throw fault('DELIVERY_RECEIVING_LISTENER_UNAVAILABLE', 503); }
  need(response.ok && response.body, 'DELIVERY_RECEIVING_LISTENER_CHANGED', 409);
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      need(bytes <= maximum, 'DELIVERY_RECEIVING_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks, bytes);
}

/** The existing loopback handler supplies both its original session and the
 * owned process binding. Applications verifies the actual child and listener. */
export async function verifyReceivingStartup(startup, input, { pid } = {}) {
  const selected = selection(input), session = startup?.receiving;
  need(object(startup) && startup.schema === DELIVERY_RECEIVING_STARTUP_SCHEMA && object(session) &&
    session.schema === DELIVERY_RECEIVING_SESSION_SCHEMA && session.state === 'OPEN' &&
    UUID.test(session.instanceId ?? '') && session.operationId === selected.operationId &&
    Number.isSafeInteger(session.pid) && session.pid > 0 && (pid === undefined || session.pid === pid) &&
    Number.isSafeInteger(session.ppid) && session.ppid > 0 && Number.isFinite(Date.parse(session.startedAt)) &&
    session.receivedDirectory === selected.receivedDirectory &&
    session.bindingSha256 === selected.expectedBindingSha256 &&
    session.sourceSha256 === selected.expectedSourceSha256 &&
    session.selectedSourceRoot === selected.sourceRoot,
  'DELIVERY_RECEIVING_STARTUP_CHANGED', 409);
  const { launch, source } = await prepareReceivingLaunch(selected);
  need(session.sourceDirectory === launch.sourceDirectory && session.workspaceDirectory === launch.workspaceDirectory &&
    session.receiptSha256 === launch.receiptSha256 && session.fingerprint === launch.fingerprint &&
    session.resourceId === launch.resourceId, 'DELIVERY_RECEIVING_STARTUP_CHANGED', 409);
  await inspectReceivingLaunchSource(path(session.executedSourceRoot), { expectedSha256: selected.expectedSourceSha256 });
  let url;
  try { url = new URL(startup.operatorUrl); } catch { throw fault('DELIVERY_RECEIVING_URL_INVALID'); }
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' &&
    !url.username && !url.password && !url.search && !url.hash &&
    Number(url.port) >= 1 && Number(url.port) <= 65535 &&
    (!selected.port || Number(url.port) === selected.port), 'DELIVERY_RECEIVING_URL_INVALID');
  const page = await readListener(url, '/');
  need(page.equals((await originalFile(join(source.sourceRoot, SF98 + 'destinations/public/index.html'))).bytes),
    'DELIVERY_RECEIVING_BROWSER_SOURCE_CHANGED', 409);
  const status = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readListener(url, '/api/state')));
  need(status.schema === ROOT_SCHEMA && SHA.test(status.session ?? '') &&
    status.sourceDirectory === session.sourceDirectory && equal(status.receiving, session),
  'DELIVERY_RECEIVING_LIVE_BINDING_CHANGED', 409);
  return { url: url.href, original: startup,
    links: [{ id: 'delivery-receiving', label: 'Received merchant delivery', url: url.href }] };
}

/** Reachable before any asynchronous open. Close aborts only this model's work,
 * drains its original handler, then releases the original kernel lease. */
export function createManagedReceiving(input, { environment = process.env } = {}) {
  const selected = selection(input);
  need(object(environment), 'DELIVERY_RECEIVING_ENVIRONMENT_REQUIRED');
  let lease, native, handler, server, opening, closing, stopped = false, complete = false;
  let finishClosed; const closed = new Promise(done => { finishClosed = done; });
  async function start() {
    need(!stopped, 'DELIVERY_RECEIVING_CLOSING', 503);
    if (opening) return opening;
    opening = (async () => {
      await privateDirectory(selected.receivedDirectory);
      lease = await operationLease(join(selected.receivedDirectory, '.delivery-receiving-owner.lock'));
      const { launch, source } = await prepareReceivingLaunch(selected, { environment });
      need(!stopped, 'DELIVERY_RECEIVING_CLOSING', 503);
      native = await openDestinationWorkspace({
        directory: launch.workspaceDirectory, sourceDirectory: launch.sourceDirectory, environment,
      });
      const session = Object.freeze({ schema: DELIVERY_RECEIVING_SESSION_SCHEMA, state: 'OPEN',
        instanceId: randomUUID(), pid: process.pid, ppid: process.ppid, startedAt: new Date().toISOString(),
        operationId: selected.operationId, receivedDirectory: selected.receivedDirectory,
        sourceDirectory: launch.sourceDirectory, workspaceDirectory: launch.workspaceDirectory,
        fingerprint: launch.fingerprint, receiptSha256: launch.receiptSha256,
        bindingSha256: launch.bindingSha256, resourceId: launch.resourceId,
        selectedSourceRoot: source.sourceRoot, executedSourceRoot: DELIVERY_RECEIVING_SOURCE_ROOT,
        sourceSha256: source.sha256 });
      const exposed = Object.create(native);
      exposed.state = async () => ({ ...await native.state(),
        receiving: stopped ? { ...session, state: 'CLOSING' } : session });
      server = createServer((request, response) => {
        if (!handler) { response.writeHead(503); response.end(); return; }
        handler(request, response).then(handled => {
          if (!handled && !response.writableEnded) { response.writeHead(404); response.end(); }
        }).catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
      });
      server.requestTimeout = 30000; server.headersTimeout = 10000; server.keepAliveTimeout = 2000;
      await new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(selected.port, '127.0.0.1', () => { server.off('error', reject); done(); });
      });
      const actualPort = server.address().port, operatorUrl = 'http://127.0.0.1:' + actualPort + '/';
      handler = await createDestinationsHandler({ model: exposed, allowUserNavigation: true,
        origins: [new URL(operatorUrl).origin, 'http://localhost:' + actualPort] });
      need(!stopped, 'DELIVERY_RECEIVING_CLOSING', 503);
      const startup = { schema: DELIVERY_RECEIVING_STARTUP_SCHEMA, operatorUrl, receiving: session };
      await verifyReceivingStartup(startup, selected, { pid: process.pid });
      need(!stopped, 'DELIVERY_RECEIVING_CLOSING', 503);
      server.once('close', () => { if (!closing) close().catch(() => {}); });
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
      handler?.close();
      const serverStopped = server?.listening
        ? new Promise((done, reject) => server.close(error => error ? reject(error) : done()))
        : Promise.resolve();
      server?.closeIdleConnections?.();
      let modelError;
      try { if (native) await native.close(); } catch (error) { modelError = error; }
      await handler?.done();
      server?.closeAllConnections?.(); await serverStopped;
      if (modelError) throw modelError;
      native = undefined; handler = undefined; server = undefined;
      if (lease) { await lease.close(); lease = undefined; }
      complete = true; finishClosed();
    })();
    closing = attempt;
    attempt.catch(() => { if (closing === attempt) closing = undefined; });
    return attempt;
  }
  return { start, close, closed, get complete() { return complete; } };
}
export async function openReceivingManaged(input, options) {
  const owner = createManagedReceiving(input, options);
  try { return { ...await owner.start(), close: owner.close, closed: owner.closed }; }
  catch (error) { await owner.close(); throw error; }
}
export function parseReceivingArguments(args) {
  need(Array.isArray(args) && args[0] === 'managed' && args.length % 2 === 1,
    'INVALID_DELIVERY_RECEIVING_MANAGED_USAGE');
  const allowed = ['--received', '--port', '--binding', '--source-root', '--expected-source', '--operation-id'];
  const values = new Map();
  for (let index = 1; index < args.length; index += 2) {
    need(allowed.includes(args[index]) && !values.has(args[index]) &&
      typeof args[index + 1] === 'string' && args[index + 1].length > 0,
    'INVALID_DELIVERY_RECEIVING_MANAGED_OPTION');
    values.set(args[index], args[index + 1]);
  }
  const port = values.get('--port') ?? '0';
  need(/^(0|[1-9]\d{0,4})$/.test(port), 'DELIVERY_RECEIVING_PORT_INVALID');
  return selection({ receivedDirectory: values.get('--received'), port: Number(port),
    expectedBindingSha256: values.get('--binding'), sourceRoot: values.get('--source-root'),
    expectedSourceSha256: values.get('--expected-source'), operationId: values.get('--operation-id') });
}
const HELP = 'Received merchant delivery Applications command\n\n' +
  '  delivery-receiving-workspace inspect --received PRIVATE_RECEIVED_DIRECTORY [--port 0]\n\n' +
  'Use the original Applications Review, Save and Start flow to retain the exact\n' +
  'receipt, installed source, process and private workspace selection. The browser\n' +
  'provides the original SF98 destination and signed worker controls.\n';
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  if (args[0] === 'inspect') {
    need(args.length % 2 === 1, 'INVALID_DELIVERY_RECEIVING_MANAGED_USAGE');
    const values = new Map();
    for (let index = 1; index < args.length; index += 2) {
      need(['--received', '--port'].includes(args[index]) && !values.has(args[index]) &&
        typeof args[index + 1] === 'string' && args[index + 1], 'INVALID_DELIVERY_RECEIVING_MANAGED_OPTION');
      values.set(args[index], args[index + 1]);
    }
    const port = values.get('--port') ?? '0';
    need(/^(0|[1-9]\d{0,4})$/.test(port), 'DELIVERY_RECEIVING_PORT_INVALID');
    const result = await inspectReceivingLaunch({ receivedDirectory: values.get('--received'), port: Number(port) });
    process.stdout.write(JSON.stringify({ ...result, source: await inspectReceivingLaunchSource() }, null, 2) + '\n');
    return result;
  }
  const owner = createManagedReceiving(parseReceivingArguments(args));
  const stop = () => { owner.close().catch(error => {
    process.stderr.write(codeOf(error) + '\n'); process.exitCode = 1;
  }); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const startup = await owner.start();
    process.stdout.write(JSON.stringify(startup) + '\n');
    await owner.closed;
  } catch (error) { await owner.close(); throw error; }
  finally {
    if (owner.complete) { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write(codeOf(error) + '\n'); process.exitCode = 1; });
