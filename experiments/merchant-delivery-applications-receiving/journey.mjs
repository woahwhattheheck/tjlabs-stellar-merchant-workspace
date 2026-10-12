// MIT. One Applications continuation after the original managed and direct receiving journeys.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, mkdir, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const PRODUCT = '8b08a9333af070df0e96b6f09f6612eb07eab1ad';
const OPERATION = 'SCF-MANAGED-SF98-DELIVERY-E49D-20261012';
const SCHEMA = 'scratch.merchant-delivery-applications-receiving.v1';
const SDK = 'stellar/scf-starforge-20261009/';
const RUNTIME = SDK + 'distribution/runtime-workspace/';
const EXPECTED = [
  {
    "path": "products/merchant-delivery/receiving/receive.mjs",
    "blob": "ce62472d561f19195724e53e053edd9256668ea6",
    "bytes": 7789
  },
  {
    "path": "products/merchant-delivery/receiving/managed.mjs",
    "blob": "19b09076f5150343caf2f1ea92ddf999b589fd98",
    "bytes": 21136
  },
  {
    "path": "products/merchant-delivery/receiving/application-provider.mjs",
    "blob": "fafcf15c308019d57b03674a1b218d135828b411",
    "bytes": 5488
  },
  {
    "path": "products/merchant-delivery/receiving/configure.mjs",
    "blob": "c374a6cab302c48dc90be2b0be6d6111283a0570",
    "bytes": 15424
  },
  {
    "path": "products/merchant-delivery/receiving/CUSTOMER_RECEIVING.md",
    "blob": "30d7aa82ab5ece88d3efb455da79f0906cb6d9dc",
    "bytes": 14091
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/contributions/merchant-delivery-receiving.json",
    "blob": "3271e646cbdb5bb4e400520e69a5f96e6df585d6",
    "bytes": 1567
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/server.mjs",
    "blob": "56c75c04d7efc8436536ba0e482556603b4a6c3a",
    "bytes": 10391
  },
  {
    "path": "products/merchant-delivery/managed.mjs",
    "blob": "d0f7677c8c189add2cfadd9656c7944a18287128",
    "bytes": 14842
  },
  {
    "path": "products/merchant-delivery/application-provider.mjs",
    "blob": "2408f133a739b5fc6ae9a786641de902f66d4a68",
    "bytes": 4830
  },
  {
    "path": "products/merchant-delivery/configure.mjs",
    "blob": "17d8117b2e1cecd7b2846c66683728fef6c100bc",
    "bytes": 15353
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/model.mjs",
    "blob": "f22c85176d365510093f22f699fb5bbd34ffcba0",
    "bytes": 22632
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/public/app.mjs",
    "blob": "3c10d5270136189a587d4b8b60149a75553f0ae1",
    "bytes": 10503
  },
  {
    "path": "stellar/scf-starforge-20261009/sf82-seller-pilot/release-console.mjs",
    "blob": "7c6f3d83bdcbabd435787356a6bad90c1f296574",
    "bytes": 23515
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs",
    "blob": "9ba69b5e83693a5bbad8aff6677673991f5fe70b",
    "bytes": 38822
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/applications.mjs",
    "blob": "f4088b6affa905349054b52e91305d39ae4abf89",
    "bytes": 27026
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/server.mjs",
    "blob": "2680e7bc1d54be90c941669a6296028e15d9bb01",
    "bytes": 24008
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/public/applications.mjs",
    "blob": "86e37ee0fd367641384bf1961745888e22824e82",
    "bytes": 38920
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/public/app.mjs",
    "blob": "3b21966948a8056fecabc5e5b24cbba768185e32",
    "bytes": 33226
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs",
    "blob": "8ee253de89866a761ed415412e654e6c79235ff1",
    "bytes": 7132
  }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const diagnostic = value => String(value).replace(/(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?[^#\s"'<>]*)#[a-f0-9]{32,}/g, '$1#[private-capability]');
async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function privateDirectory(path, create = false) {
  assert.equal(path, resolve(path), 'Use the original absolute directory');
  if (create) await mkdir(path, { mode: 0o700 });
  const info = await lstat(path);
  assert(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077), 'Private original directory required: ' + path);
  assert.equal(await realpath(path), path);
  return path;
}
async function originalJSON(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    assert(before.isFile() && before.size <= 16n * 1024n * 1024n, 'Bounded original JSON required');
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
    assert.equal(after.dev, before.dev); assert.equal(after.ino, before.ino);
    assert.equal(after.size, before.size); assert.equal(after.mtimeNs, before.mtimeNs);
    assert.equal(after.ctimeNs, before.ctimeNs); assert.equal(BigInt(bytes.length), after.size);
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), bytes, sha256: hash(bytes) };
  } finally { await handle.close(); }
}
async function atomicJSON(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(json(value)); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function fixedJSON(path, value) {
  const expected = Buffer.from(json(value));
  if (await exists(path)) { assert.deepEqual(await readFile(path), expected, 'Retain the original selection: ' + path); return; }
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
}
const compactDestination = value => JSON.parse(JSON.stringify({
  id: value.id, label: value.label, revision: value.revision, paused: value.paused,
  continuity: value.continuity, sourceEventsRemaining: value.sourceEventsRemaining,
  cursor: value.cursor, enrollment: value.enrollment,
  outbox: { delivered: value.outbox?.delivered, pending: value.outbox?.pending, exhausted: value.outbox?.exhausted },
}));
const compactDestinations = state => JSON.parse(JSON.stringify({
  sourceDirectory: state.sourceDirectory, source: state.source,
  destinations: state.destinations.map(compactDestination),
}));
function requireOriginalReceipts(managed, direct, managedSha, operation, managedOutput) {
  assert.equal(operation, OPERATION); assert.equal(managed.operation, operation);
  assert.equal(managed.state, 'PASS');
  for (const key of ['nativeComplete', 'browserComplete', 'mcpComplete', 'ownedProcessesClosed'])
    assert.equal(managed[key], true, 'The original managed journey must actually finish: ' + key);
  assert.equal(direct.schema, 'scratch.single-release-delivery-receiving.v1');
  assert.equal(direct.operation, operation); assert.equal(direct.state, 'PASS');
  for (const key of ['browserComplete', 'localComplete', 'mcpComplete', 'ownedProcessesClosed'])
    assert.equal(direct[key], true, 'The original direct journey must actually finish: ' + key);
  assert.equal(direct.managedReceiptSha256, managedSha);
  assert.equal(direct.managedDirectory, managedOutput);
  assert.equal(direct.releaseStore, managed.stores.blue);
  assert(/^[a-f0-9]{64}$/.test(direct.manifest?.fingerprint ?? ''));
}

/**
 * installedRoot is an actual READY runtime-install directory, not a source checkout.
 * This function follows the original two drivers after both have closed all handles.
 * Its own RuntimeWorkspace is the original Applications control plane only; seller
 * state and the customer's original SF98 receiving workspace are never recreated.
 */
export async function runDeliveryApplicationsPhase({
  installedRoot, managedOutput, directOutput, output, operation = OPERATION,
  sourcePin = PRODUCT, node = process.execPath, python, playwrightModules, chromium,
  signal,
} = {}) {
  for (const value of [installedRoot, managedOutput, directOutput, output, node, playwrightModules, chromium])
    assert.equal(typeof value, 'string', 'Supply the original receiving context paths');
  assert.equal(sourcePin, PRODUCT, 'Select the complete merged Applications product');
  assert.equal(await realpath(node), await realpath(process.execPath), 'Run through the selected original Node executable');
  installedRoot = await privateDirectory(resolve(installedRoot));
  managedOutput = await privateDirectory(resolve(managedOutput));
  directOutput = await privateDirectory(resolve(directOutput));
  output = resolve(output);
  if (!await exists(output)) await privateDirectory(output, true); else await privateDirectory(output);
  assert(![installedRoot, managedOutput, directOutput].includes(output));
  const sourceRoot = join(installedRoot, 'package', 'source');
  const sourceFiles = [];
  for (const expected of EXPECTED) {
    const bytes = await readFile(join(sourceRoot, expected.path));
    assert.equal(bytes.length, expected.bytes, 'Selected Applications source size: ' + expected.path);
    assert.equal(gitBlob(bytes), expected.blob, 'Selected Applications source identity: ' + expected.path);
    sourceFiles.push({ ...expected, sha256: hash(bytes) });
  }
  const moduleAt = path => import(pathToFileURL(join(sourceRoot, path)).href);
  const { inspectMerchantRuntime } = await moduleAt(SDK + 'sf46-release/runtime-package.mjs');
  const installed = await inspectMerchantRuntime(installedRoot, { load: false });
  assert.equal(installed.state, 'READY'); assert.equal(installed.sourceRoot, sourceRoot);
  assert.equal(installed.sourceCommit, sourcePin);
  const managedFile = join(managedOutput, 'receipt.json'), directFile = join(directOutput, 'receipt.json');
  const originalManaged = await originalJSON(managedFile), originalDirect = await originalJSON(directFile);
  const managed = originalManaged.value, direct = originalDirect.value;
  requireOriginalReceipts(managed, direct, originalManaged.sha256, operation, managedOutput);
  const receivedDirectory = join(directOutput, 'received-customer');
  assert.equal(direct.receivedDirectory, join(receivedDirectory, 'workspace'));
  await privateDirectory(receivedDirectory);
  const environmentFile = join(managedOutput, 'private-environment.json');
  const { applicationEnvironment } = await moduleAt(RUNTIME + 'application-environment.mjs');
  // Values remain in this process and original child environment; receipts keep no values.
  const privateEnvironment = await applicationEnvironment(environmentFile);
  const { operationLease, operationRunning } = await moduleAt(RUNTIME + 'storage.mjs');
  const phaseLease = await operationLease(join(output, 'applications-phase.lock'));
  try {
  const receiptFile = join(output, 'receipt.json');
  let receipt = await exists(receiptFile) ? (await originalJSON(receiptFile)).value : {
    schema: SCHEMA, operation, product: sourcePin, installedRoot,
    sourceManifestSha256: installed.sourceManifestSha256,
    managedOutput, directOutput, managedReceiptSha256: originalManaged.sha256,
    directReceiptSha256: originalDirect.sha256, releaseStore: managed.stores.blue, receivedDirectory,
    runtimeWorkspace: join(output, 'runtime-workspace'), runtimeHome: join(output, 'runtime-home'),
    state: 'RUNNING', attempts: [], requests: [], applications: {}, milestones: [], screenshots: [],
  };
  for (const [key, expected] of Object.entries({
    schema: SCHEMA, operation, product: sourcePin, installedRoot, sourceManifestSha256: installed.sourceManifestSha256,
    managedOutput, directOutput, managedReceiptSha256: originalManaged.sha256,
    directReceiptSha256: originalDirect.sha256, releaseStore: managed.stores.blue, receivedDirectory,
  })) assert.equal(receipt[key], expected, 'Resume the exact original Applications selection: ' + key);
  if (receipt.state === 'PASS' && receipt.ownedProcessesClosed && receipt.browserComplete && receipt.customerReopenComplete)
    return receipt;
  let saving = Promise.resolve();
  function save() {
    const snapshot = structuredClone(receipt);
    const next = saving.then(() => atomicJSON(receiptFile, snapshot));
    saving = next; return next;
  }
  const completed = key => receipt.milestones.some(row => row.key === key);
  async function mark(key, details = {}) {
    if (!completed(key)) receipt.milestones.push({ key, at: new Date().toISOString(), ...details });
    await save();
    process.stdout.write(JSON.stringify({ phase: 'DELIVERY_APPLICATIONS', milestone: key }) + '\n');
  }
  const interrupted = () => { if (signal?.aborted) throw signal.reason ?? new Error('Original Applications continuation interrupted'); };
  async function until(read, accept, label, timeout = 90000) {
    const deadline = Date.now() + timeout; let value;
    while (Date.now() < deadline) {
      interrupted(); value = await read(); if (accept(value)) return value; await delay(300);
    }
    throw new Error(label + ' did not complete; the original records remain selected.');
  }
  const { createRuntimeWorkspace, openRuntimeWorkspace } = await moduleAt(RUNTIME + 'model.mjs');
  const { startRuntimeWorkspace } = await moduleAt(RUNTIME + 'server.mjs');
  const { inspectReceivedDelivery, receiveDeliveryWorkspace } = await moduleAt('products/merchant-delivery/receiving/receive.mjs');
  let model, server, browser, browserContext, page, popup, currentAction = null, failure;
  const responseWork = new Set();
  const attempt = { id: randomUUID(), startedAt: new Date().toISOString(), browserErrors: [], cleanupErrors: [] };
  receipt.attempts.push(attempt); receipt.state = 'RUNNING'; receipt.ownedProcessesClosed = false;
  receipt.sourceFiles = sourceFiles; await save();

  const applications = async () => (await model.applicationsState({ historyLimit: 10 })).applications;
  const currentApp = async kind => {
    const rows = await applications(), known = receipt.applications[kind]?.id;
    if (known) return rows.find(row => row.id === known) ?? null;
    const saveIds = receipt.requests.filter(row => row.route === '/api/applications/save' && row.kind === kind).map(row => row.body.requestId);
    const found = rows.filter(row => saveIds.includes(row.saveRequestId));
    assert(found.length <= 1, 'Keep the original application save identity');
    if (found[0]) { receipt.applications[kind] = { id: found[0].id, kind, label: found[0].label }; await save(); }
    return found[0] ?? null;
  };
  function uniqueAction(label) { return label + '-' + (receipt.requests.filter(row => row.key.startsWith(label + '-')).length + 1); }
  function selectedKind(kind) { return kind === 'merchant-delivery' ? 'seller' : 'customer'; }
  async function intercepted(route) {
    const request = route.request(), url = new URL(request.url());
    const relevant = request.method() === 'POST' &&
      (url.pathname.startsWith('/api/applications/') || url.pathname === '/api/pause' || url.pathname === '/api/attach');
    if (!relevant) return route.continue();
    assert(currentAction, 'Every native mutation belongs to the selected original UI action');
    const selected = currentAction, raw = request.postData();
    assert(raw && Buffer.byteLength(raw) <= 65536);
    const body = JSON.parse(raw);
    let entry = receipt.requests.find(row => row.key === selected.key);
    if (entry) { assert.equal(entry.route, url.pathname); assert.deepEqual(entry.body, body, 'Replay the original exact request'); }
    else {
      entry = { key: selected.key, kind: selected.kind, route: url.pathname, raw, body,
        sha256: hash(raw), createdAt: new Date().toISOString(), attempts: 0 };
      receipt.requests.push(entry);
    }
    entry.attempts++; delete entry.transportError;
    await save(); // This durable request precedes its actual original provider dispatch.
    try {
      const response = await route.fetch({ timeout: 90000, maxRedirects: 0 });
      const bytes = await response.body(), result = JSON.parse(bytes.toString('utf8'));
      entry.response = { status: response.status(), body: result, sha256: hash(bytes), bytes: bytes.length,
        at: new Date().toISOString() };
      if (response.ok() && url.pathname === '/api/applications/save') {
        receipt.applications[selected.kind] = { id: result.applicationId, kind: selected.kind,
          label: selected.kind === 'merchant-delivery' ? 'Original seller delivery' : 'Original customer delivery' };
      }
      await save();
      await route.fulfill({ response, body: bytes });
    } catch (error) {
      entry.transportError = { message: diagnostic(error.message), at: new Date().toISOString() };
      await save(); await route.abort('failed').catch(() => {}); throw error;
    }
  }
  async function submit(kind, label, pathname, click, reuse) {
    interrupted();
    assert.equal(currentAction, null, 'One original browser mutation at a time');
    currentAction = { key: reuse ?? uniqueAction(label), kind };
    const responsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === pathname && response.request().method() === 'POST', { timeout: 100000 });
    responsePromise.catch(() => {});
    try {
      await click();
      const response = await responsePromise, value = await response.json();
      assert(response.ok(), pathname + ': ' + JSON.stringify(value));
      return value;
    } finally { currentAction = null; }
  }
  async function refreshUI() {
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/state' && response.request().method() === 'GET');
    refreshed.catch(() => {});
    await page.locator('#refresh').click();
    assert((await refreshed).ok(), 'The original runtime workspace refresh must succeed');
    await page.locator('[data-view="applications"]').click();
  }
  async function choose(kind) {
    const app = await currentApp(kind); assert(app, 'The original saved application is required');
    await refreshUI();
    await page.locator('#application-library [data-application-id="' + app.id + '"]').click();
    return app;
  }
  async function recoverRequests() {
    const pending = receipt.requests.filter(row => !row.response &&
      ['/api/applications/save', '/api/applications/start'].includes(row.route));
    for (const entry of pending) {
      await page.evaluate(({ workspaceId, route, body }) => {
        sessionStorage.setItem('starforge-applications-' + workspaceId + '-pending', JSON.stringify({ route, body }));
      }, { workspaceId: receipt.workspaceId, route: entry.route, body: entry.body });
      await refreshUI();
      await submit(entry.kind, 'recover-retained', entry.route,
        () => page.getByRole('button', { name: 'Recover last application request', exact: true }).click(), entry.key);
      await mark('recovered-' + entry.key, { route: entry.route, requestId: entry.body.requestId });
    }
  }
  async function openControl() {
    server = await startRuntimeWorkspace({ directory: receipt.runtimeWorkspace, port: receipt.controlPort ?? 0 });
    const port = Number(new URL(server.origin).port);
    if (receipt.controlPort) assert.equal(port, receipt.controlPort); else { receipt.controlPort = port; await save(); }
    page = await browserContext.newPage();
    page.on('pageerror', error => attempt.browserErrors.push(diagnostic(error.message)));
    page.setDefaultTimeout(30000);
    await page.goto(server.url);
    await page.waitForFunction(() => ['Connected', 'Operation in progress'].includes(document.getElementById('connection')?.textContent));
    await page.locator('[data-view="applications"]').click();
    await page.locator('#application-kind option[value="delivery-receiving"]').waitFor({ state: 'attached' });
    await recoverRequests();
  }
  async function prepareConfiguration(kind) {
    const id = selectedKind(kind), directory = join(output, id + '-configuration');
    const selectionFile = join(output, id + '-selection.json');
    const selection = {
      schema: 'tjlabs.' + kind + '.application-selection.v1',
      runtimeWorkspace: receipt.runtimeWorkspace, runtimeId: receipt.runtimeId, runtimeDirectory: installedRoot,
      label: kind === 'merchant-delivery' ? 'Original seller delivery' : 'Original customer delivery',
      ...(kind === 'merchant-delivery' ? { releaseStore: receipt.releaseStore } : { receivedDirectory }),
      port: 0, environmentFile,
    };
    await fixedJSON(selectionFile, selection);
    const module = await moduleAt('products/merchant-delivery/' + (kind === 'delivery-receiving' ? 'receiving/' : '') + 'configure.mjs');
    const prepared = await module.configure({ selectionFile, outputDirectory: directory });
    const reviewed = (await originalJSON(join(directory, 'application-review.json'))).value;
    assert.equal(reviewed.kind, kind); assert.equal(reviewed.runtimeId, receipt.runtimeId);
    receipt.configurations ??= {};
    const manifestFile = join(directory, 'configuration-manifest.json'), observed = await originalJSON(manifestFile);
    if (receipt.configurations[kind]) assert.equal(observed.sha256, receipt.configurations[kind].sha256);
    else receipt.configurations[kind] = { directory, manifestFile, sha256: observed.sha256 };
    await save();
    return { prepared, reviewed };
  }
  async function ensureSaved(kind) {
    let app = await currentApp(kind);
    const { reviewed } = await prepareConfiguration(kind);
    if (!app) {
      await page.getByRole('button', { name: 'New application', exact: true }).click();
      await page.locator('#application-label').fill(reviewed.label);
      await page.locator('#application-runtime').selectOption(receipt.runtimeId);
      await page.locator('#application-kind').selectOption(kind);
      for (const [name, value] of Object.entries(reviewed.settings))
        await page.locator('#application-setting-' + name).fill(String(value));
      const nativeReview = await submit(kind, selectedKind(kind) + '-review', '/api/applications/review',
        () => page.getByRole('button', { name: 'Review application', exact: true }).click());
      assert.equal(nativeReview.kind, kind); assert.deepEqual(nativeReview.settings, reviewed.settings);
      await atomicJSON(join(output, selectedKind(kind) + '-native-save-review.json'), nativeReview);
      await submit(kind, selectedKind(kind) + '-save', '/api/applications/save',
        () => page.getByRole('button', { name: 'Save application', exact: true }).click());
      app = await currentApp(kind);
    }
    assert(app); assert.equal(app.kind, kind); assert.deepEqual(app.settings, reviewed.settings);
    assert.equal(app.runtime.directory, installedRoot);
    for (let attempt = 0; attempt < 3; attempt++) {
      app = await currentApp(kind);
      if (app.release) break;
      if (app.adoption?.active) {
        await until(() => currentApp(kind), value => value.release || !value.adoption?.active, 'Original runtime adoption');
      } else {
        await choose(kind);
        await submit(kind, selectedKind(kind) + '-connect', '/api/applications/connect',
          () => page.getByRole('button', { name: /^(Continue runtime connection|Resume runtime connection|Retry runtime connection)$/ }).click());
      }
    }
    app = await until(() => currentApp(kind), value => Boolean(value.release), 'Original runtime connection');
    receipt.applications[kind].revision = app.revision;
    receipt.applications[kind].releaseId = app.release.id;
    await save(); return app;
  }
  async function startApplication(kind, label) {
    let app = await choose(kind);
    if (app.current?.active) {
      const ownedIds = receipt.requests.filter(row => row.route === '/api/applications/start').map(row => row.body.requestId);
      assert(ownedIds.includes(app.current.id), 'Preserve another original running application');
    } else if (['PENDING', 'QUEUED', 'RUNNING', 'INTERRUPTED'].includes(app.current?.phase)) {
      const ownedIds = receipt.requests.filter(row => row.route === '/api/applications/start').map(row => row.body.requestId);
      assert(ownedIds.includes(app.current.id), 'Reconcile only this phase’s original start');
      await submit(kind, label + '-recover', '/api/applications/recover',
        () => page.getByRole('button', { name: /^(Continue original start|Reconcile original operation)$/ }).click());
    } else {
      const reviewed = await submit(kind, label + '-start-review', '/api/applications/start-review',
        () => page.getByRole('button', { name: 'Review start', exact: true }).click());
      assert.equal(reviewed.applicationId, app.id);
      await atomicJSON(join(output, label + '-native-start-review.json'), reviewed);
      await submit(kind, label + '-start', '/api/applications/start',
        () => page.getByRole('button', { name: 'Start reviewed application', exact: true }).click());
    }
    app = await until(() => currentApp(kind), value => Boolean(value.current?.active && value.current.privateUrl),
      'Original application startup and authenticated listener verification');
    await choose(kind);
    const link = page.getByRole('link', { name: 'Open application', exact: true });
    await link.waitFor({ state: 'visible' });
    assert.equal(await link.getAttribute('href'), app.current.privateUrl);
    return app;
  }
  async function openApplication(kind, label) {
    const app = await startApplication(kind, label), origin = new URL(app.current.privateUrl).origin;
    assert.notEqual(origin, server.origin, 'Exercise Applications’ actual cross-port Open link');
    const navigation = browserContext.waitForEvent('response', { predicate: response =>
      response.request().isNavigationRequest() && new URL(response.url()).origin === origin &&
      new URL(response.url()).pathname === '/', timeout: 30000 });
    const opened = page.waitForEvent('popup', { timeout: 30000 });
    await page.getByRole('link', { name: 'Open application', exact: true }).click();
    popup = await opened;
    popup.on('pageerror', error => attempt.browserErrors.push(diagnostic(error.message)));
    popup.setDefaultTimeout(30000);
    const response = await navigation, headers = await response.request().allHeaders();
    assert.equal(response.status(), 200, 'The original Applications Open navigation must be accepted');
    assert.equal(headers['sec-fetch-mode'], 'navigate'); assert.equal(headers['sec-fetch-dest'], 'document');
    assert.equal(headers['sec-fetch-user'], '?1');
    const html = await response.body();
    const original = kind === 'merchant-delivery'
      ? SDK + 'sf82-seller-pilot/release-ui/index.html' : SDK + 'sf98-merchant-delivery/destinations/public/index.html';
    assert.deepEqual(html, await readFile(join(sourceRoot, original)), 'Open serves the actual original application');
    receipt.navigations ??= [];
    receipt.navigations.push({ kind, applicationId: app.id, operationId: app.current.id, status: response.status(),
      sameSite: headers['sec-fetch-site'], mode: headers['sec-fetch-mode'], destination: headers['sec-fetch-dest'],
      user: headers['sec-fetch-user'], originalHtmlSha256: hash(html), at: new Date().toISOString() });
    await save(); return app;
  }
  async function customerState() {
    const response = await popup.request.get(new URL('/api/state', popup.url()).href);
    assert.equal(response.status(), 200); return response.json();
  }
  async function shot(name, target = page) {
    const file = join(output, name + '-' + attempt.id + '.png');
    await target.screenshot({ path: file, fullPage: true });
    const bytes = await readFile(file); receipt.screenshots.push({ name, file, bytes: bytes.length, sha256: hash(bytes) }); await save();
  }
  async function stopApplication(kind) {
    let app = await choose(kind);
    if (app.current?.active || ['PENDING', 'QUEUED', 'RUNNING', 'INTERRUPTED'].includes(app.current?.phase)) {
      await submit(kind, selectedKind(kind) + '-stop', '/api/applications/stop',
        () => page.getByRole('button', { name: /^(Stop application|Cancel pending start)$/ }).click());
      app = await until(() => currentApp(kind), value => !value.current?.active &&
        !['PENDING', 'QUEUED', 'RUNNING', 'INTERRUPTED'].includes(value.current?.phase), 'Original application close');
    }
    assert(!app.current?.privateUrl, 'Closed original applications must not retain an Open link');
    await refreshUI(); return app;
  }
  async function pauseCustomer() {
    await popup.getByRole('heading', { name: 'Delivery destinations', exact: true }).waitFor();
    await popup.waitForFunction(() => document.getElementById('source-count')?.textContent === '2');
    let state = await customerState();
    const binding = state.receiving, app = await currentApp('delivery-receiving');
    assert.equal(binding.receivedDirectory, receivedDirectory);
    assert.equal(binding.operationId, app.current.id); assert.equal(binding.workspaceDirectory, direct.receivedDirectory);
    assert.equal(binding.fingerprint, direct.manifest.fingerprint);
    assert.deepEqual(binding, app.current.url.original.receiving);
    const audit = state.destinations.find(row => row.id === 'audit'); assert(audit);
    if (!receipt.customerBefore) {
      assert.equal(audit.paused, false, 'The direct receiving phase’s prior customer edit must remain');
      receipt.customerBefore = compactDestinations(state); await save();
    }
    await popup.getByRole('button', { name: audit.label, exact: true }).click();
    if (!audit.paused) {
      const main = page; page = popup;
      try {
        await submit('delivery-receiving', 'customer-pause', '/api/pause', () => popup.locator('#toggle-pause').click());
      } finally { page = main; }
      state = await customerState();
    } else {
      assert(receipt.requests.some(row => row.route === '/api/pause' && row.body.id === 'audit' && row.body.paused === true),
        'Only reconcile this phase’s retained customer edit');
    }
    const updated = state.destinations.find(row => row.id === 'audit');
    assert.equal(updated.paused, true);
    assert.notEqual(updated.revision, receipt.customerBefore.destinations.find(row => row.id === 'audit').revision);
    for (const name of ['accounting', 'fulfillment'])
      assert.deepEqual(compactDestination(state.destinations.find(row => row.id === name)),
        receipt.customerBefore.destinations.find(row => row.id === name));
    receipt.customerAfter = compactDestinations(state); receipt.receivingReceiptSha256 = binding.receiptSha256;
    await save(); await shot('customer-edited', popup);
  }

  try {
    if (!await exists(receipt.runtimeWorkspace)) {
      await createRuntimeWorkspace({ directory: receipt.runtimeWorkspace, runtimeHome: receipt.runtimeHome });
    }
    model = await openRuntimeWorkspace({ directory: receipt.runtimeWorkspace });
    const runtimeState = await model.state();
    receipt.workspaceId ??= runtimeState.workspaceId;
    assert.equal(runtimeState.workspaceId, receipt.workspaceId);
    const attached = await model.attach({ directory: installedRoot, label: 'Completed merchant delivery installation' });
    if (receipt.runtimeId) assert.equal(attached.runtimeId, receipt.runtimeId); else receipt.runtimeId = attached.runtimeId;
    const observed = await model.state({ runtimeId: receipt.runtimeId });
    assert.equal(observed.selected.phase, 'READY');
    const received = await inspectReceivedDelivery({ receivedDirectory, expectedFingerprint: direct.manifest.fingerprint,
      environment: privateEnvironment.environment });
    assert.equal(received.current.source.events, 2); assert.equal(received.current.destinations.length, 3);
    await mark('original-installed-and-received-identities', { runtimeId: receipt.runtimeId, sourceCommit: installed.sourceCommit,
      installationId: installed.installationId, sourceManifestSha256: installed.sourceManifestSha256,
      customerFingerprint: received.fingerprint, customerReceiptSha256: received.receiptSha256 });
    const loaded = createRequire(join(resolve(playwrightModules), 'runtime-loader.cjs'))('playwright');
    browser = await loaded.chromium.launch({ executablePath: chromium, headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking', '--renderer-process-limit=1'] });
    browserContext = await browser.newContext({ viewport: { width: 1380, height: 1000 }, acceptDownloads: true });
    await browserContext.route('**/api/**', route => {
      const work = intercepted(route); responseWork.add(work);
      work.finally(() => responseWork.delete(work)).catch(() => {});
      return work;
    });
    await openControl();
    if (!completed('seller-applications-open-and-close')) {
      await ensureSaved('merchant-delivery');
      const app = await openApplication('merchant-delivery', 'seller');
      await popup.getByRole('heading', { name: 'Seller releases', exact: true }).waitFor();
      await popup.waitForFunction(() => !document.getElementById('delivery-refresh')?.disabled);
      const token = new URL(app.current.privateUrl).hash.slice(1);
      const native = await popup.evaluate(async value => {
        const responses = await Promise.all(['/api/status', '/api/delivery/status'].map(path =>
          fetch(path, { headers: { 'x-release-token': value } })));
        if (responses.some(response => !response.ok)) throw new Error('Original seller readback failed');
        return Promise.all(responses.map(response => response.json()));
      }, token);
      assert.equal(native[0].console.binding.releaseStore, receipt.releaseStore);
      assert.equal(native[0].console.binding.operationId, app.current.id);
      assert.deepEqual(native[0].console.binding, app.current.url.original.binding);
      assert.equal(native[1].destinations.source.events, 2);
      assert.equal(native[1].destinations.destinations.length, 3);
      await shot('seller-applications'); await shot('seller-original-console', popup);
      await popup.close(); popup = null;
      const stopped = await stopApplication('merchant-delivery');
      await mark('seller-applications-open-and-close', { applicationId: app.id, operationId: app.current.id,
        nativeInstanceId: native[0].console.binding.instanceId, nativePid: native[0].console.binding.pid,
        phaseAfterClose: stopped.phase, sourceEvents: 2, destinations: 3 });
    }
    if (!completed('customer-applications-edit-and-close')) {
      await ensureSaved('delivery-receiving');
      const app = await openApplication('delivery-receiving', 'customer');
      await pauseCustomer(); await shot('customer-applications');
      await popup.close(); popup = null;
      const stopped = await stopApplication('delivery-receiving');
      await mark('customer-applications-edit-and-close', { applicationId: app.id, operationId: app.current.id,
        customerWorkspace: direct.receivedDirectory, phaseAfterClose: stopped.phase,
        auditRevision: receipt.customerAfter.destinations.find(row => row.id === 'audit').revision });
    }
    if (!completed('same-applications-customer-reopen')) {
      await page.close(); page = null; await server.close(); server = null;
      await openControl(); // New original server capability; same runtime workspace, applications and records.
      const prepared = await prepareConfiguration('delivery-receiving');
      assert.equal(prepared.prepared.status, 'REOPENED_CONFIGURATION');
      const app = await openApplication('delivery-receiving', 'customer-reopen');
      await popup.getByRole('heading', { name: 'Delivery destinations', exact: true }).waitFor();
      await popup.waitForFunction(() => document.getElementById('source-count')?.textContent === '2');
      const state = await customerState();
      assert.deepEqual(compactDestinations(state), receipt.customerAfter);
      assert.equal(state.receiving.receiptSha256, receipt.receivingReceiptSha256);
      assert.equal(state.receiving.operationId, app.current.id);
      await popup.getByRole('button', { name: state.destinations.find(row => row.id === 'audit').label, exact: true }).click();
      assert.equal(await popup.locator('#toggle-pause').textContent(), 'Resume receiver');
      await popup.setViewportSize({ width: 390, height: 844 });
      await shot('customer-reopened-mobile', popup);
      assert(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        'The original received workspace must remain usable at 390px');
      await popup.close(); popup = null; await stopApplication('delivery-receiving');
      await mark('same-applications-customer-reopen', { applicationId: app.id, operationId: app.current.id,
        configurationSha256: receipt.configurations['delivery-receiving'].sha256,
        retainedCustomerRevision: state.destinations.find(row => row.id === 'audit').revision });
    }
    if (!completed('original-receive-retry-preserves-applications-edit')) {
      const replay = await receiveDeliveryWorkspace({ downloadDirectory: join(directOutput, 'remote-download'),
        id: direct.manifest.id, expectedFingerprint: direct.manifest.fingerprint, receivedDirectory, signal });
      assert.equal(replay.retained, true); assert.equal(replay.receiptSha256, receipt.receivingReceiptSha256);
      assert.deepEqual(compactDestinations(replay.current), receipt.customerAfter);
      await mark('original-receive-retry-preserves-applications-edit', { fingerprint: replay.fingerprint,
        receiptSha256: replay.receiptSha256, sourceEvents: replay.current.source.events,
        destinationCount: replay.current.destinations.length });
    }
    assert.deepEqual(attempt.browserErrors, []);
    receipt.browserComplete = true; receipt.customerReopenComplete = true;
  } catch (error) {
    failure = error; receipt.state = 'FAILED';
    attempt.error = { message: diagnostic(error.message), code: error.code ?? null, stack: diagnostic(error.stack ?? '') };
  } finally {
    const closed = attempt.cleanupErrors;
    async function closeOwned(kind) {
      if (!model) return;
      const app = await currentApp(kind); if (!app) return;
      const current = app.current;
      if (current && (current.active || ['PENDING', 'QUEUED', 'RUNNING', 'INTERRUPTED'].includes(current.phase))) {
        assert(receipt.requests.some(row => row.route === '/api/applications/start' && row.body.requestId === current.id),
          'Leave an unrelated original application operation untouched');
        await model.applicationsStop({ applicationId: app.id, operationId: current.id });
      }
      const deadline = Date.now() + 60000; let value;
      do {
        value = await currentApp(kind);
        if (!value.current?.active && !value.adoption?.active &&
          !['PENDING', 'QUEUED', 'RUNNING', 'INTERRUPTED'].includes(value.current?.phase)) return;
        await delay(250);
      } while (Date.now() < deadline);
      throw new Error('The original ' + kind + ' still owns a live or interrupted operation; retain this receipt.');
    }
    for (const kind of ['delivery-receiving', 'merchant-delivery'])
      try { await closeOwned(kind); } catch (error) { closed.push(diagnostic(error.message)); }
    for (const target of [popup, page, browserContext, browser, server, model])
      try { await target?.close(); } catch (error) { closed.push(diagnostic(error.message)); }
    await Promise.allSettled([...responseWork]);
    try {
      for (const lock of [join(receipt.releaseStore, '.merchant-delivery-owner.lock'),
        join(receivedDirectory, '.delivery-receiving-owner.lock')])
        assert.equal(await operationRunning(lock), false, 'The original application lease must be released');
      assert.equal(hash(await readFile(managedFile)), originalManaged.sha256, 'Preserve the original managed receipt');
      assert.equal(hash(await readFile(directFile)), originalDirect.sha256, 'Preserve the original direct receipt');
    } catch (error) { closed.push(diagnostic(error.message)); }
    receipt.ownedProcessesClosed = closed.length === 0;
    attempt.finishedAt = new Date().toISOString(); attempt.ownedProcessesClosed = receipt.ownedProcessesClosed;
    if (!failure && closed.length) failure = new Error(closed.join('; '));
    receipt.state = !failure && receipt.browserComplete && receipt.customerReopenComplete ? 'PASS' : 'FAILED';
    await save();
  }
  if (failure) throw failure;
  return receipt;
  } finally { await phaseLease.close(); }
}

async function main(argv) {
  assert(argv.length === 2 && argv[0] === '--context', 'Use --context ORIGINAL_CONTEXT_JSON');
  const controller = new AbortController(), stop = () => controller.abort(new Error('Original Applications phase stopped'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const input = (await originalJSON(resolve(argv[1]))).value;
    const result = await runDeliveryApplicationsPhase({ ...input, signal: controller.signal });
    process.stdout.write(JSON.stringify({ schema: result.schema, operation: result.operation, state: result.state,
      receipt: join(resolve(input.output), 'receipt.json'), ownedProcessesClosed: result.ownedProcessesClosed }) + '\n');
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(error => { process.stderr.write(String(error.stack ?? error) + '\n'); process.exitCode = 1; });
