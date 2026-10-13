// MIT. Receive the original completed five-invoice project through managed Applications.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, readFile, lstat, realpath, rename, link, unlink } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { applicationEnvironment } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs';
import { inspectReceivedMerchant, reviewEnvironmentName, reviewEnvironmentValue } from './received-project-review.mjs';
import { inspectMerchantIntake } from './project-intake.mjs';

const OPERATION = 'SCF-RECEIVED-MERCHANT-APPLICATION-CEDAR-8047-20261013';
const { values } = parseArgs({ strict: true, options: {
  archive: { type: 'string' }, 'archive-sha256': { type: 'string' },
  project: { type: 'string' }, runtime: { type: 'string' }, applications: { type: 'string' },
  output: { type: 'string' }, 'environment-file': { type: 'string' }, 'operator-token-env': { type: 'string' },
  python: { type: 'string' }, playwright: { type: 'string' }, chromium: { type: 'string' },
  'allow-loopback': { type: 'boolean', default: false },
} });
for (const name of ['project','runtime','applications','output','environment-file','python','playwright','chromium'])
  assert(typeof values[name] === 'string' && isAbsolute(values[name]) && resolve(values[name]) === values[name],
    'Use the original absolute ' + name + ' selection.');
assert(Boolean(values.archive) === Boolean(values['archive-sha256']), 'Keep the original archive path and SHA-256 together.');
if (values.archive) assert(isAbsolute(values.archive) && resolve(values.archive) === values.archive && /^[a-f0-9]{64}$/.test(values['archive-sha256']));
assert.equal(process.platform, 'linux'); assert(Number(process.versions.node.split('.')[0]) >= 24);
process.umask(0o077);
const ROOT = values.output, RUNTIME = values.runtime, APPLICATIONS = values.applications;
let WORKSPACE, DATABASE, SOURCE, selectedProject;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encoding = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? { integer: item.toString() } :
  item instanceof Uint8Array ? { base64: Buffer.from(item).toString('base64') } : item, 2) + '\n';
const errorView = error => ({ code: error?.code ?? error?.name ?? 'RECEIVED_REVIEW_FAILED', message: String(error?.message ?? error).slice(0, 2000) });
const exists = async path => { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const readJSON = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const identity = label => {
  const hex = sha(OPERATION + '\n' + ROOT + '\n' + label);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
};
function emit(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function directory(path) {
  if (!await exists(path)) { await directory(dirname(path)); await mkdir(path, { mode: 0o700 }); }
  const info = await lstat(path);
  assert(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path);
  if (path === ROOT || path.startsWith(ROOT + '/')) assert.equal(info.mode & 0o077, 0, 'Keep the original private receiving directory.');
  await syncDirectory(path); await syncDirectory(dirname(path));
}
async function save(path, value, { original = false } = {}) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(encoding(value));
  await directory(dirname(path));
  if (original && await exists(path)) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { assert((await handle.stat()).isFile()); assert.deepEqual(await handle.readFile(), body); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(dirname(path)); return value;
  }
  const temporary = path + '.' + randomUUID() + '.partial';
  let handle = null, created = false;
  try {
    handle = await open(temporary, 'wx', 0o600); created = true;
    await handle.writeFile(body); await handle.sync();
    await handle.close(); handle = null;
    if (original) {
      try { await link(temporary, path); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const target = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { assert((await target.stat()).isFile()); assert.deepEqual(await target.readFile(), body); await target.sync(); }
        finally { await target.close(); }
      }
      await unlink(temporary);
    } else await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    try { if (handle) await handle.close(); }
    finally {
      if (created) {
        try { await unlink(temporary); await syncDirectory(dirname(path)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  return value;
}
let stopping = null, model = null, activeRun = null, browser = null, browserContext = null;
const pause = ms => new Promise(accept => setTimeout(accept, ms));
function stopped() { if (stopping) throw Object.assign(new Error('The original installed receiving was stopped.'), { code: 'RECEIVING_STOPPED', signal: stopping }); }
function stop(signal) {
  stopping ??= signal;
  if (browserContext) void browserContext.close().catch(() => {});
}
const terminated = () => stop('SIGTERM'), interrupted = () => stop('SIGINT');
process.on('SIGTERM', terminated); process.on('SIGINT', interrupted);
async function retainCompleted(label, action) {
  let announced = null;
  for (;;) {
    try { return await action(); }
    catch (error) {
      const notice = JSON.stringify(errorView(error));
      if (notice !== announced) { emit({ state: 'AWAITING_LOCAL_RECEIPT', label, error: errorView(error) }); announced = notice; }
      await pause(1000);
    }
  }
}
function sqlName(name) { return '"' + name.replaceAll('"', '""') + '"'; }
function databaseSnapshot(databasePath = DATABASE) {
  const db = new DatabaseSync(databasePath, { readOnly: true, enableDoubleQuotedStringLiterals: false });
  try {
    db.exec('BEGIN');
    const definitions = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = [];
    for (const definition of definitions) {
      const statement = db.prepare('SELECT * FROM ' + sqlName(definition.name)); statement.setReadBigInts(true);
      const rows = statement.all().map(row => encoding(row)).sort();
      tables.push({ name: definition.name, sql: definition.sql, rows });
    }
    const business = { applicationId: db.prepare('PRAGMA application_id').get().application_id,
      userVersion: db.prepare('PRAGMA user_version').get().user_version,
      tables: tables.filter(table => table.name !== 'merchant_runtimes') };
    const runtimes = tables.find(table => table.name === 'merchant_runtimes');
    assert.equal(business.applicationId, 0x58344d31); assert.equal(business.userVersion, 1);
    const orders = db.prepare('SELECT id,state FROM merchant_orders ORDER BY id').all();
    assert.equal(orders.length, 5); assert(orders.every(order => order.state === 'COMPLETE'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM merchant_events WHERE state='PENDING'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM merchant_fulfillments WHERE state!='COMPLETE'").get().count, 0);
    db.exec('ROLLBACK');
    return { businessSha256: sha(encoding(business)),
      allUserRowsSha256: sha(encoding({ ...business, tables })), business, runtimes, orders };
  } finally { db.close(); }
}
async function originalFile(path, expected) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const first = await handle.stat(); assert(first.isFile()); assert.equal(first.size, expected.bytes);
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(65536); let position = 0;
    while (position < first.size) {
      const result = await handle.read(buffer, 0, Math.min(buffer.length, first.size - position), position);
      assert(result.bytesRead > 0); hash.update(buffer.subarray(0, result.bytesRead)); position += result.bytesRead;
    }
    const last = await handle.stat();
    assert.equal(last.size, first.size); assert.equal(last.mtimeMs, first.mtimeMs); assert.equal(last.ctimeMs, first.ctimeMs);
    assert.equal(hash.digest('hex'), expected.sha256);
    return { path, ...expected };
  } finally { await handle.close(); }
}
async function applicationView(id) {
  const state = await model.applicationsState({ historyLimit: 100 });
  const application = state.applications.find(value => value.id === id); assert(application, 'Keep the original saved application.');
  return application;
}
async function originalRun(id, applicationId = null) {
  const directory = join(APPLICATIONS, 'operations', id);
  const [state, result, announcement] = await Promise.all(['state.json', 'command-result.json', 'application-url.json'].map(name => readJSON(join(directory, name))));
  let held = false;
  const operation = await readJSON(join(directory, 'request.json'));
  if (operation) {
    const native = await import(pathToFileURL(join(SOURCE, 'stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs')));
    held = await native.operationRunning(join(directory, 'worker.lock'));
  }
  const cancellation = applicationId ? await readJSON(join(APPLICATIONS, 'applications', applicationId, 'runs', id + '.cancel.json')) : null;
  return { directory, state, result, announcement, held, operation, cancellation };
}
async function stopApplication(selection) {
  let announced = null;
  for (;;) {
    try {
      const runFile = join(APPLICATIONS, 'applications', selection.applicationId, 'runs', selection.operationId + '.json');
      if (!await exists(runFile)) { activeRun = null; return { launched: false, reason: 'NO_RETAINED_RUN' }; }
      let current = await originalRun(selection.operationId, selection.applicationId);
      if (!current.held && current.cancellation) { activeRun = null; return { ...current, launched: false }; }
      if (!current.held && current.result) {
        const output = await model.applicationsOutput(selection);
        await save(join(ROOT, 'applications-output', selection.operationId + '.json'), output, { original: true });
        activeRun = null; return { ...current, output };
      }
      if (!current.held && ['FAILED','SUCCEEDED','CANCELLED','RUNNING'].includes(current.state?.phase) && !current.result) {
        const output = await model.applicationsOutput(selection);
        await save(join(ROOT, 'applications-output', selection.operationId + '.json'), output, { original: true });
        activeRun = null; return { ...current, output, outcomeUnavailable: true };
      }
      await model.applicationsStop(selection);
      current = await originalRun(selection.operationId, selection.applicationId);
      if (!current.held && current.result) continue;
    } catch (error) {
      const notice = JSON.stringify(errorView(error));
      if (notice !== announced) { emit({ state: 'AWAITING_ORIGINAL_APPLICATION_STOP', operationId: selection.operationId, error: errorView(error) }); announced = notice; }
    }
    await pause(250);
  }
}
async function beginOpening(label, applicationId) {
  stopped();
  const path = join(ROOT, 'opening-' + label + '.json');
  const selection = await readJSON(path) ?? { label, applicationId, attempts: [] };
  assert.equal(selection.applicationId, applicationId);
  let attempt = selection.attempts.at(-1);
  if (attempt) {
    const observed = await originalRun(attempt.operationId, applicationId);
    if (!observed.held && (observed.result || observed.cancellation)) {
      if (attempt.completed) {
        assert.deepEqual(attempt.completed.native, observed.result, 'Keep the original completed process result.');
        return { ...attempt, applicationId, completed: attempt.completed };
      }
      attempt.ended = { state: observed.state, result: observed.result, cancellation: observed.cancellation };
      await save(path, selection);
      attempt = null;
    } else if (!observed.held && ['FAILED', 'SUCCEEDED', 'CANCELLED', 'RUNNING'].includes(observed.state?.phase)) {
      throw Object.assign(new Error('The original managed outcome is unavailable; inspect its retained output.'), { code: 'ORIGINAL_APPLICATION_OUTCOME_UNAVAILABLE' });
    }
  }
  if (!attempt) {
    const review = await model.applicationsStartReview({ applicationId });
    const operationId = identity('application-' + label + '-' + (selection.attempts.length + 1));
    attempt = { operationId, reviewId: review.id, review, acceptedAt: new Date().toISOString() };
    selection.attempts.push(attempt);
    await save(path, selection);
  }
  activeRun = { applicationId, operationId: attempt.operationId };
  const retained = await readJSON(join(APPLICATIONS, 'applications', applicationId, 'runs', attempt.operationId + '.json'));
  if (retained) {
    const observed = await originalRun(attempt.operationId, applicationId);
    if (!observed.held && (!observed.state || observed.state.phase === 'QUEUED'))
      await model.applicationsRecover(activeRun);
  } else await model.applicationsStart({ applicationId, requestId: attempt.operationId, reviewId: attempt.reviewId });
  const started = Date.now();
  for (;;) {
    stopped();
    const current = await originalRun(attempt.operationId, applicationId);
    if (current.held && current.announcement) {
      assert.equal(current.announcement.operationId, attempt.operationId);
      assert.equal(current.announcement.applicationId, applicationId);
      assert.equal(current.announcement.original.selection.workspaceDirectory, WORKSPACE);
      assert.equal(current.announcement.original.selectionSha256, selectedProject.selectionSha256);
      await save(join(ROOT, 'launches', attempt.operationId + '.json'), current.announcement, { original: true });
      return { ...attempt, applicationId, url: current.announcement.url, selectionPath: path, selection };
    }
    if (!current.held && (current.result || ['FAILED', 'SUCCEEDED', 'CANCELLED'].includes(current.state?.phase)))
      throw Object.assign(new Error('The original application ended before returning its verified URL.'), { code: 'ORIGINAL_APPLICATION_LAUNCH_FAILED', native: current });
    assert(Date.now() - started < 120000, 'Wait for the original Applications listener; no replacement command is allowed.');
    await pause(200);
  }
}
async function finishOpening(opening, result) {
  const stoppedRun = await stopApplication({ applicationId: opening.applicationId, operationId: opening.operationId });
  assert(!stoppedRun.outcomeUnavailable, 'Retain the actual original managed process outcome.');
  assert.equal(stoppedRun.result?.state, 'STOPPED'); assert.equal(stoppedRun.result?.stopped, true);
  const attempt = opening.selection.attempts.find(value => value.operationId === opening.operationId);
  attempt.completed = { at: new Date().toISOString(), result, native: stoppedRun.result };
  await retainCompleted('original-completed-opening', () => save(opening.selectionPath, opening.selection));
  return stoppedRun;
}
async function get(url, credential, route) {
  const response = await fetch(new URL(route, url), { headers: { Authorization: 'Bearer ' + credential },
    redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, 'Open the original authenticated read: ' + route);
  const raw = Buffer.from(await response.arrayBuffer()); assert(raw.length <= 16 * 1024 * 1024);
  return { raw, json: () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) };
}
async function receiveReads(opening, credential, label) {
  const state = (await get(opening.url, credential, '/api/state')).json();
  assert.equal(state.mode, 'review'); assert.equal(state.orders.length, 5);
  const listener = (await get(opening.url, credential, '/api/project')).json();
  assert.deepEqual(listener, { available: false, mode: 'review', storeId: selectedProject.selection.storeId, exports: [] });
  const invoices = [];
  for (const row of state.orders) {
    stopped();
    const inspected = (await get(opening.url, credential, '/api/orders/' + row.id)).json();
    assert.equal(inspected.order.id, row.id); assert.equal(inspected.order.state, 'COMPLETE');
    const order = inspected.order, downloaded = await get(opening.url, credential, '/api/orders/' + row.id + '/result');
    assert.equal(downloaded.raw.length, order.result.bytes); assert.equal(sha(downloaded.raw), order.result.sha256);
    const path = join(ROOT, 'downloads', label, row.id + '-result');
    await save(path, downloaded.raw, { original: true });
    const envelope = await get(opening.url, credential, '/api/orders/' + row.id + '/envelope');
    const envelopePath = join(ROOT, 'downloads', label, row.id + '-payment-request.json');
    await save(envelopePath, envelope.raw, { original: true });
    await save(join(ROOT, 'invoices', label, row.id + '.json'), inspected, { original: true });
    invoices.push({ merchantOrderId: row.id, paymentId: order.paymentId, reference: order.reference, title: order.title,
      bytes: order.result.bytes, sha256: order.result.sha256,
      historySha256: sha(encoding(inspected.history)),
      download: { path, bytes: downloaded.raw.length, sha256: sha(downloaded.raw) },
      envelope: { path: envelopePath, bytes: envelope.raw.length, sha256: sha(envelope.raw) } });
  }
  return { invoices, mode: state.mode, apiStateSha256: sha(encoding(state)), nativeUrlRecord: opening.operationId };
}
async function closeBrowser() {
  const errors = [];
  if (browserContext) {
    try { await browserContext.close(); browserContext = null; }
    catch (error) { errors.push(errorView(error)); }
  }
  if (browser) {
    try {
      await browser.close(); browser = null;
      // A closed browser also owns and closes its remaining contexts.
      browserContext = null;
    } catch (error) { errors.push(errorView(error)); }
  }
  if (errors.length) throw Object.assign(new Error('The original browser close returned an error.'), {
    code: 'RECEIVED_REVIEW_BROWSER_CLOSE_FAILED', errors
  });
}
async function drainBrowser() {
  let announced = null;
  while (browser || browserContext) {
    try { await closeBrowser(); }
    catch (error) {
      const detail = { operation: OPERATION, state: 'AWAITING_BROWSER_CLOSE',
        error: errorView(error), errors: error.errors ?? [], at: new Date().toISOString() };
      await retainCompleted('original-browser-close', () => save(join(ROOT, 'browser-close.json'), detail));
      const notice = JSON.stringify(detail.errors);
      if (notice !== announced) { emit(detail); announced = notice; }
      if (browser || browserContext) await pause(1000);
    }
  }
}
async function verifyOpening(completed, label) {
  assert.equal(completed.native?.state, 'STOPPED'); assert.equal(completed.native?.stopped, true);
  assert.equal(completed.reads?.mode, 'review'); assert.equal(completed.reads.invoices.length, 5);
  const record = await readJSON(join(ROOT, 'opening-' + label + '.json'));
  const retained = record?.attempts?.find(value => value.operationId === completed.operationId);
  assert(retained?.completed, 'Keep the complete original opening record.');
  assert.deepEqual(retained.completed.result, { reads: completed.reads, browser: completed.browser });
  assert.deepEqual(retained.completed.native, completed.native);
  const native = await originalRun(completed.operationId, record.applicationId);
  assert.equal(native.held, false); assert.deepEqual(native.result, completed.native);
  const originalOrders = new Set(databaseSnapshot().orders.map(value => value.id));
  assert.equal(new Set(completed.reads.invoices.map(value => value.merchantOrderId)).size, originalOrders.size);
  for (const invoice of completed.reads.invoices) {
    assert(originalOrders.has(invoice.merchantOrderId));
    await originalFile(invoice.download.path, invoice.download);
    await originalFile(invoice.envelope.path, invoice.envelope);
  }
  assert(completed.browser && Array.isArray(completed.browser.downloads) && completed.browser.downloads.length === 5);
  for (const file of [...completed.browser.downloads, ...completed.browser.images])
    await originalFile(file.path, file);
  assert.deepEqual(completed.browser.pageErrors, []); assert.deepEqual(completed.browser.consoleErrors, []);
}
async function receiveBrowser(opening, scenario, reads, { label, review = true } = {}) {
  const require = createRequire(import.meta.url), loaded = require(values.playwright);
  const chromium = loaded.chromium ?? loaded.default?.chromium; assert(chromium?.launch);
  browser = await chromium.launch({ executablePath: values.chromium, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  browserContext = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await browserContext.newPage(), origin = new URL(opening.url).origin;
  const failures = [], consoleErrors = [], requests = [], images = [], downloads = [];
  page.on('pageerror', error => failures.push({ kind: 'pageerror', message: String(error.message) }));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await browserContext.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') {
      failures.push({ kind: 'unexpected-browser-request', method: request.method(), origin: url.origin, path: url.pathname });
      return route.abort();
    }
    requests.push({ method: request.method(), path: url.pathname });
    try {
      const headers = {};
      for (const [name, value] of Object.entries(await request.allHeaders()))
        if (!['host','connection','accept-encoding','content-length'].includes(name)) headers[name] = value;
      const response = await fetch(request.url(), { method: request.method(), headers,
        redirect: 'error', signal: AbortSignal.timeout(15000) });
      const body = Buffer.from(await response.arrayBuffer()); assert(body.length <= 64 * 1024 * 1024);
      const selected = {};
      for (const name of ['content-type','cache-control','content-security-policy','x-content-type-options','content-disposition','referrer-policy'])
        if (response.headers.has(name)) selected[name] = response.headers.get(name);
      await route.fulfill({ status: response.status, headers: selected, body });
    } catch (error) { failures.push({ kind: 'original-http-read', path: url.pathname, error: errorView(error) }); await route.abort(); }
  });
  const dimensions = () => page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  async function capture(name, fullPage = false) {
    const path = join(ROOT, 'screenshots', name); await directory(dirname(path));
    await page.screenshot({ path, fullPage, animations: 'disabled' });
    const body = await readFile(path); images.push({ path, bytes: body.length, sha256: sha(body), viewport: page.viewportSize(), fullPage });
  }
  try {
    await page.goto(opening.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('#operator-token').fill(scenario.operatorToken); await page.locator('#connect-form button').click();
    await page.locator('#workspace').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('#count-total').innerText(), '5');
    assert.equal(await page.locator('#count-complete').innerText(), '5');
    assert.equal(await page.locator('#count-awaiting').innerText(), '0');
    assert.equal(await page.locator('#count-progress').innerText(), '0');
    assert.equal(await page.locator('#order-rows tr').count(), 5);
    if (review) {
      assert.equal(await page.locator('#review-banner').isVisible(), true);
      assert.equal(await page.locator('#show-create').isVisible(), false);
      assert.equal(await page.locator('#export-project').isVisible(), false);
      assert.equal(await page.locator('#connection-state').innerText(), 'Project review');
    }
    for (const [index, invoice] of reads.invoices.entries()) {
      stopped();
      await page.getByRole('row', { name: invoice.reference + ', Delivered', exact: true }).click();
      await page.locator('#detail-content[data-order-id="' + invoice.merchantOrderId + '"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#detail-reference').innerText(), invoice.reference);
      assert.equal(await page.locator('#detail-state').innerText(), 'Delivered');
      assert.equal(await page.locator('#signature-form').isVisible(), false);
      assert.equal(await page.locator('#create-charge').isVisible(), false);
      assert.equal(await page.locator('#download-result').isVisible(), true);
      const desktop = await dimensions(); assert(desktop.document <= desktop.viewport + 1, 'The original desktop layout overflows.');
      if (index === 0) await capture('merchant-' + label + '-desktop.png');
      const pending = page.waitForEvent('download', { timeout: 15000 }); await page.locator('#download-result').click();
      const download = await pending, path = join(ROOT, 'downloads', 'browser-' + label, invoice.paymentId + '.txt');
      await directory(dirname(path)); await download.saveAs(path); assert.equal(await download.failure(), null);
      assert.equal(download.suggestedFilename(), 'Merchant_Commissioned_Delivery.txt');
      downloads.push(await originalFile(path, { bytes: invoice.bytes, sha256: invoice.sha256 }));
    }
    
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
    await capture('merchant-' + label + '-phone-invoices.png');
    const first = reads.invoices[0];
    await page.getByRole('row', { name: first.reference + ', Delivered', exact: true }).click();
    await page.locator('#detail-content[data-order-id="' + first.merchantOrderId + '"]').waitFor({ state: 'visible' });
    await page.locator('#detail-panel').evaluate(element => element.scrollIntoView({ block: 'start' }));
    const phone = await dimensions(); assert(phone.document <= phone.viewport + 1, 'The original phone layout overflows.');
    await capture('merchant-' + label + '-phone-detail.png'); await capture('merchant-' + label + '-phone-complete.png', true);
    await page.locator('#search').fill(reads.invoices.at(-1).reference); assert.equal(await page.locator('#order-rows tr').count(), 1);
    await page.locator('#search').fill(''); assert.equal(await page.locator('#order-rows tr').count(), 5);
    await page.locator('#disconnect').click(); await page.locator('#connect-panel').waitFor({ state: 'visible' });
    await page.locator('#operator-token').fill(scenario.operatorToken); await page.locator('#connect-form button').click();
    await page.locator('#workspace').waitFor({ state: 'visible' }); assert.equal(await page.locator('#count-complete').innerText(), '5');
    assert.deepEqual(failures, []); assert.deepEqual(consoleErrors, []);
    return { browser: await browser.version(), chromium: values.chromium,
      mode: 'ORIGINAL_RECEIVED_REVIEW_HTTP_GET_BRIDGE',
      dimensions: { phone }, images, downloads, requests, pageErrors: failures, consoleErrors };
  } finally {
    await closeBrowser();
  }
}

async function verifyIntakeOpening(value, inspected, label) {
  assert.equal(value.selectionSha256, inspected.selectionSha256);
  assert.equal(value.operationId, value.opening.operationId);
  const opening = await readJSON(join(ROOT, 'opening-' + label + '.json'));
  const attempt = opening?.attempts?.find(row => row.operationId === value.operationId);
  assert(attempt?.completed, 'Keep the original completed intake opening.');
  const run = await originalRun(value.operationId, opening.applicationId);
  assert.equal(run.held, false); assert.deepEqual(run.result, value.native);
  assert.equal(run.result?.state, 'STOPPED'); assert.equal(run.result?.stopped, true);
  assert.deepEqual(attempt.completed.result, value.opening.result);
  for (const file of [...value.opening.result.files, ...value.opening.result.images])
    await originalFile(file.path, { bytes: file.bytes, sha256: file.sha256 });
  assert.deepEqual(value.opening.result.pageErrors, []);
  assert.deepEqual(value.opening.result.consoleErrors, []);
  assert.deepEqual(value.opening.result.inventory, inspected.manifest.files.map(row =>
    ({ path: row.path, bytes: row.bytes, sha256: row.sha256 })));
}
async function receiveIntakeBrowser(opening, inspected, credential) {
  const root = join(ROOT, 'archive-intake-browser', opening.operationId);
  await directory(root);
  const require = createRequire(import.meta.url);
  const playwright = require(values.playwright);
  browser = await playwright.chromium.launch({ executablePath: values.chromium, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const originalOrigin = new URL(opening.url).origin, requests = [], pageErrors = [], consoleErrors = [];
  let lostAcknowledgment = false, lostInventoryRead = false;
  const expectedLostResponses = new Set();
  try {
    // Browser network reaches the actual original listener through this same
    // host's fetch, including the single explicit original receiving POST.
    await browserContext.route('**/*', async route => {
      const request = route.request(), selected = new URL(request.url());
      if (selected.origin !== originalOrigin ||
          !(request.method() === 'GET' || request.method() === 'POST' && selected.pathname === '/api/receive')) {
        await route.abort(); throw new Error('The original intake browser attempted an unrelated request.');
      }
      if (selected.pathname === '/favicon.ico') { await route.fulfill({ status: 204, body: '' }); return; }
      const headers = { ...await request.allHeaders() };
      delete headers.host; delete headers.connection; delete headers['content-length'];
      const response = await fetch(selected, { method: request.method(), headers, redirect: 'error',
        ...(request.method() === 'POST' ? { body: request.postDataBuffer() ?? Buffer.alloc(0) } : {}),
        signal: AbortSignal.timeout(30000) });
      const body = Buffer.from(await response.arrayBuffer());
      requests.push({ method: request.method(), path: selected.pathname + selected.search,
        status: response.status, bytes: body.length, sha256: sha(body) });
      if (request.method() === 'GET' && selected.pathname === '/api/files' && !lostInventoryRead) {
        assert.equal(response.status, 200); lostInventoryRead = true;
        expectedLostResponses.add(selected.href); await route.abort('failed'); return;
      }
      if (request.method() === 'POST' && selected.pathname === '/api/receive' && !lostAcknowledgment) {
        assert([200,202].includes(response.status));
        lostAcknowledgment = true; expectedLostResponses.add(selected.href);
        await route.abort('failed'); return;
      }
      const returnedHeaders = Object.fromEntries([...response.headers].filter(([name]) =>
        !['connection','transfer-encoding','content-encoding','content-length'].includes(name.toLowerCase())));
      await route.fulfill({ status: response.status, headers: returnedHeaders, body });
    });
    const page = await browserContext.newPage();
    page.on('pageerror', error => pageErrors.push(String(error.message)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const expected = expectedLostResponses.has(message.location().url) &&
        message.text() === 'Failed to load resource: net::ERR_FAILED';
      if (!expected) consoleErrors.push(message.text());
    });
    await page.goto(opening.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#credential').fill(credential);
    await page.locator('#connect button').click();
    await page.locator('#desk').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Use Find files to retry.'));
    assert(lostInventoryRead);
    assert.equal(await page.locator('#desk').isVisible(), true);
    assert.equal(await page.locator('#connection').isVisible(), false);
    await page.locator('#search button').click();
    await page.waitForFunction(() => document.getElementById('file-count').textContent.length > 0);
    assert((await page.locator('#identity').innerText()).includes(inspected.selection.storeId));
    const inventory = [];
    for (;;) {
      const rows = await page.locator('#files tr').evaluateAll(items => items.map(row =>
        [...row.querySelectorAll('td')].map(cell => cell.textContent)));
      inventory.push(...rows.map(row => ({ path: row[0], bytes: row[1], sha256: row[2] })));
      if (await page.locator('#next').isDisabled()) break;
      const prior = await page.locator('#page-position').innerText();
      await page.locator('#next').click();
      await page.waitForFunction(previous => document.getElementById('page-position').textContent !== previous, prior);
    }
    assert.deepEqual(inventory, inspected.manifest.files.map(row =>
      ({ path: row.path, bytes: row.bytes, sha256: row.sha256 })));
    const files = [];
    async function download(button, filename) {
      const pending = page.waitForEvent('download');
      await page.locator(button).click();
      const selected = await pending, path = join(root, filename);
      await selected.saveAs(path);
      const raw = await readFile(path), item = { path, bytes: raw.length, sha256: sha(raw) };
      files.push(item); return JSON.parse(raw);
    }
    const manifest = await download('#manifest', 'original-project-manifest.json');
    assert.deepEqual(manifest, inspected.manifest);
    const images = [];
    async function image(name) {
      const path = join(root, name); await page.screenshot({ path, fullPage: true });
      const raw = await readFile(path); images.push({ path, bytes: raw.length, sha256: sha(raw) });
    }
    await image('desktop-intake.png');
    if (!(await page.locator('#receive').isDisabled())) {
      await page.locator('#receive').click();
      await page.waitForFunction(() => document.getElementById('notice').textContent.length > 0);
      assert(lostAcknowledgment, 'The original receiving POST must reach its real listener before its response is lost.');
      await page.locator('#refresh').click();
    }
    const started = Date.now();
    for (;;) {
      stopped();
      const phase = await page.locator('#phase').innerText();
      if (phase === 'Project received') break;
      if (phase === 'Resume original receiving') {
        const failure = await page.locator('#receiving-error').innerText();
        throw new Error('Continue the actual original receiving condition: ' + failure);
      }
      assert(Date.now() - started < 600000, 'Continue the same original receiving operation.');
      await pause(250);
    }
    const receipt = await download('#receipt', 'original-receiving-record.json');
    assert.equal(receipt.state, 'COMPLETE'); assert.equal(receipt.action, 'receive');
    assert.equal(receipt.operation, inspected.selection.request.operation);
    assert.equal(receipt.archive.sha256, inspected.selection.archive.sha256);
    assert.equal(receipt.manifestSha256, inspected.selection.manifestSha256);
    assert.deepEqual(receipt.manifest, inspected.manifest);
    assert.equal(receipt.received.storeId, inspected.selection.storeId);
    assert.equal(receipt.received.workspaceDirectory, inspected.selection.workspaceDirectory);
    assert.equal(await page.locator('#open-review').isVisible(), true);
    const reviewUrl = await page.locator('#open-review').getAttribute('href');
    const reviewAddress = new URL(reviewUrl);
    assert.equal(reviewAddress.hostname, '127.0.0.1'); assert.equal(reviewAddress.protocol, 'http:');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await image('phone-received.png');
    await page.locator('#disconnect').click();
    assert.equal(await page.locator('#desk').isVisible(), false);
    await page.locator('#credential').fill(credential); await page.locator('#connect button').click();
    await page.locator('#desk').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('phase').textContent === 'Project received');
    assert((await page.locator('#identity').innerText()).includes(inspected.selection.request.operation));
    await page.goto('about:blank'); await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#connection').isVisible(), true);
    assert.equal(await page.locator('#desk').isVisible(), false);
    assert.equal(await page.locator('#credential').inputValue(), '');
    await page.locator('#credential').fill(credential); await page.locator('#connect button').click();
    await page.waitForFunction(() => document.getElementById('phase').textContent === 'Project received');
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []);
    return { browser: await browser.version(), mode: 'ORIGINAL_MANAGED_INTAKE_HTTP_BRIDGE',
      originalOperation: inspected.selection.request.operation, lostAcknowledgment, lostInventoryRead,
      browserBackReconnected: true, inventory, files, images,
      reviewUrl, requests, pageErrors, consoleErrors };
  } finally { await closeBrowser(); }
}
async function receiveArchiveThroughApplications(inspection, credentialName, credential) {
  const inspected = await inspectMerchantIntake({ archive: values.archive, archiveSha256: values['archive-sha256'],
    destination: values.project, python: values.python });
  selectedProject = inspected; WORKSPACE = inspected.selection.workspaceDirectory;
  const selection = { selection: inspected.selection, selectionSha256: inspected.selectionSha256,
    runtime: RUNTIME, sourceCommit: inspection.sourceCommit, applications: APPLICATIONS, output: ROOT,
    environmentFile: values['environment-file'], credentialName, python: values.python };
  await save(join(ROOT, 'archive-intake-selection.json'), selection, { original: true });
  const complete = await readJSON(join(ROOT, 'archive-intake.json'));
  if (complete) {
    assert.equal(complete.openings.length, 2);
    for (const [index, opening] of complete.openings.entries())
      await verifyIntakeOpening(opening, inspected, ['archive-intake', 'archive-intake-cold'][index]);
    return complete;
  }
  const runtimeModel = await import(pathToFileURL(join(SOURCE,
    'stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs')));
  model = await runtimeModel.openRuntimeWorkspace({ directory: APPLICATIONS });
  let attached = await readJSON(join(ROOT, 'runtime-attachment.json'));
  if (!attached) {
    attached = await model.attach({ directory: RUNTIME, label: 'Received merchant review runtime' });
    await save(join(ROOT, 'runtime-attachment.json'), attached, { original: true });
  }
  const catalog = await model.applicationsState();
  assert(catalog.catalog.some(row => row.id === 'x402api-merchant-project-intake' && row.providerId === 'x402api-merchant'));
  let review = await readJSON(join(ROOT, 'archive-application-review.json'));
  if (!review) {
    review = await model.applicationsReview({ runtimeId: attached.runtimeId, kind: 'x402api-merchant-project-intake',
      providerId: 'x402api-merchant', label: 'Receive the original merchant project',
      settings: { archiveFile: values.archive, archiveSha256: values['archive-sha256'], receivedDirectory: values.project,
        port: 0, environmentFile: values['environment-file'], operatorTokenEnv: credentialName,
        pythonExecutable: values.python, allowLoopback: values['allow-loopback'] } });
    await save(join(ROOT, 'archive-application-review.json'), review, { original: true });
  }
  const saved = await model.applicationsSave({ requestId: identity('archive-save'), reviewId: review.id });
  await save(join(ROOT, 'archive-application-save.json'), {
    applicationId: saved.applicationId, revision: saved.revision, saved: saved.saved }, { original: true });
  const applicationId = saved.applicationId;
  if (!(await applicationView(applicationId)).release) await model.applicationsConnect({ applicationId });
  const connectedAt = Date.now();
  for (;;) {
    stopped(); const current = await applicationView(applicationId);
    if (current.release) break;
    assert(!['FAILED','INTERRUPTED'].includes(current.adoption?.phase), 'Receive the original intake adoption outcome.');
    assert(Date.now() - connectedAt < 120000, 'Continue the original intake runtime adoption.');
    await pause(200);
  }
  const openings = [];
  for (const label of ['archive-intake', 'archive-intake-cold']) {
    const phasePath = join(ROOT, label + '-received.json');
    let phase = await readJSON(phasePath);
    if (!phase) {
      const opening = await beginOpening(label, applicationId);
      let result, ended;
      if (opening.completed) { result = opening.completed.result; ended = { result: opening.completed.native }; }
      else {
        result = await receiveIntakeBrowser(opening, inspected, credential);
        ended = await finishOpening(opening, result);
      }
      phase = { selectionSha256: inspected.selectionSha256, operationId: opening.operationId,
        applicationId, revision: saved.revision, opening: { operationId: opening.operationId, result }, native: ended.result };
      await save(phasePath, phase, { original: true });
    }
    await verifyIntakeOpening(phase, inspected, label);
    if (label === 'archive-intake-cold') assert.equal(phase.opening.result.lostAcknowledgment, false);
    openings.push(phase);
    if (label === 'archive-intake') {
      await model.close(); model = await runtimeModel.openRuntimeWorkspace({ directory: APPLICATIONS });
    }
  }
  const final = { selectionSha256: inspected.selectionSha256, applicationId, revision: saved.revision, openings };
  await save(join(ROOT, 'archive-intake.json'), final, { original: true });
  await model.close(); model = null;
  return final;
}

async function verifyAgentOpening(value,inspected,label,expectedInvoices,consumer) {
  assert.equal(value.selectionSha256,inspected.selectionSha256);
  const saved=await readJSON(join(ROOT,'opening-'+label+'.json'));
  const attempt=saved?.attempts?.find(row=>row.operationId===value.operationId);
  assert(attempt?.completed,'Keep the original completed agent opening.');
  const run=await originalRun(value.operationId,saved.applicationId);
  assert.equal(run.held,false);assert.deepEqual(run.result,value.native);
  assert.equal(run.result?.state,'STOPPED');assert.equal(run.result?.stopped,true);
  assert.deepEqual(attempt.completed.result,value.receiving);
  await consumer.verifyMerchantProjectAgent(value.receiving,{selectionSha256:inspected.selectionSha256,expectedInvoices});
}
async function receiveArchiveAgent(inspection,archiveIntake,credentialName,credential) {
  const inspected=await inspectMerchantIntake({archive:values.archive,archiveSha256:values['archive-sha256'],
    destination:values.project,python:values.python});
  assert.equal(inspected.selectionSha256,archiveIntake.selectionSha256);
  selectedProject=inspected;WORKSPACE=inspected.selection.workspaceDirectory;DATABASE=join(WORKSPACE,'merchant.sqlite3');
  const before=databaseSnapshot(),expectedInvoices=before.orders.map(row=>row.id);
  const consumer=await import(pathToFileURL(join(SOURCE,'products/x402api-merchant-workspace/project-agent-receiving.mjs')));
  const old=await readJSON(join(ROOT,'archive-agent.json'));
  if(old) {
    assert.equal(old.applicationId,archiveIntake.applicationId);
    assert.equal(old.selectionSha256,inspected.selectionSha256);
    assert.equal(old.openings.length,2);
    for(const [index,phase] of old.openings.entries())
      await verifyAgentOpening(phase,inspected,['archive-agent','archive-agent-cold'][index],expectedInvoices,consumer);
    assert.equal(databaseSnapshot().allUserRowsSha256,before.allUserRowsSha256);
    return old;
  }
  const runtimeModel=await import(pathToFileURL(join(SOURCE,
    'stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs')));
  model=await runtimeModel.openRuntimeWorkspace({directory:APPLICATIONS});
  const openings=[];
  for(const label of ['archive-agent','archive-agent-cold']) {
    const path=join(ROOT,label+'.json');
    let completed=await readJSON(path);
    if(!completed) {
      const opening=await beginOpening(label,archiveIntake.applicationId);
      let received,ended;
      if(opening.completed) {
        received=opening.completed.result;ended={result:opening.completed.native};
      } else {
        received=await consumer.receiveMerchantProjectAgent({url:opening.url,
          selectionSha256:inspected.selectionSha256,operatorToken:credential,tokenEnvironment:credentialName,
          directory:join(ROOT,'agent',label),expectedInvoices});
        ended=await finishOpening(opening,received);
      }
      completed={selectionSha256:inspected.selectionSha256,operationId:opening.operationId,
        receiving:received,native:ended.result};
      await save(path,completed,{original:true});
    }
    await verifyAgentOpening(completed,inspected,label,expectedInvoices,consumer);
    assert.equal(databaseSnapshot().allUserRowsSha256,before.allUserRowsSha256);
    openings.push(completed);
    if(label==='archive-agent') {
      await model.close();model=await runtimeModel.openRuntimeWorkspace({directory:APPLICATIONS});
    }
  }
  const result={selectionSha256:inspected.selectionSha256,applicationId:archiveIntake.applicationId,
    sourceCommit:inspection.sourceCommit,beforeAllRowsSha256:before.allUserRowsSha256,
    afterAllRowsSha256:databaseSnapshot().allUserRowsSha256,openings};
  await save(join(ROOT,'archive-agent.json'),result,{original:true});
  await model.close();model=null;
  return result;
}

async function receive() {
  const installedRuntime = await import(pathToFileURL(join(RUNTIME,
    'package/source/stellar/scf-starforge-20261009/distribution/runtime-install.mjs')));
  const inspection = await installedRuntime.inspectRuntimeInstall({ directory: RUNTIME, load: true, source: true });
  assert.equal(inspection.status, 'READY'); assert.equal(inspection.ready, true); SOURCE = inspection.sourceRoot;
  let archiveIntake = null, archiveAgent = null;
  if (values.archive) {
    const { environment } = await applicationEnvironment(values['environment-file']);
    const name = reviewEnvironmentName(values['operator-token-env'] ?? 'MERCHANT_REVIEW_OPERATOR_TOKEN');
    archiveIntake = await receiveArchiveThroughApplications(inspection, name, reviewEnvironmentValue(environment, name));
    archiveAgent = await receiveArchiveAgent(inspection, archiveIntake, name, reviewEnvironmentValue(environment, name));
  }
  selectedProject = await inspectReceivedMerchant(values.project, { python: values.python, allowLoopback: values['allow-loopback'] });
  WORKSPACE = selectedProject.selection.workspaceDirectory; DATABASE = join(WORKSPACE, 'merchant.sqlite3');
  const { environment, sha256: environmentSha256 } = await applicationEnvironment(values['environment-file']);
  const credentialName = reviewEnvironmentName(values['operator-token-env'] ?? selectedProject.selection.operatorTokenEnv);
  const credential = reviewEnvironmentValue(environment, credentialName);
  const selection = { schema: 'stellar-forge.received-merchant-application-receiving.v1', operation: OPERATION,
    project: selectedProject.selection, projectSha256: selectedProject.selectionSha256,
    runtime: RUNTIME, runtimeSource: SOURCE, runtimeSourceCommit: inspection.sourceCommit, applications: APPLICATIONS,
    ...(values.archive ? { archive: values.archive, archiveSha256: values['archive-sha256'] } : {}),
    output: ROOT, environmentFile: values['environment-file'], environmentSha256, operatorTokenEnv: credentialName,
    python: values.python, playwright: values.playwright, chromium: values.chromium, allowLoopback: values['allow-loopback'] };
  await save(join(ROOT, 'selection.json'), selection, { original: true });
  const beforePath = join(ROOT, 'before.json');
  const before = await readJSON(beforePath) ?? databaseSnapshot();
  await save(beforePath, before, { original: true });
  assert.equal(databaseSnapshot().allUserRowsSha256, before.allUserRowsSha256);
  const prior = await readJSON(join(ROOT, 'complete.json'));
  if (prior) {
    assert.equal(prior.projectSha256, selectedProject.selectionSha256); assert.equal(prior.state, 'COMPLETE');
    assert.equal(prior.afterAllRowsSha256, before.allUserRowsSha256);
    assert.equal(prior.openings.length, 2);
    for (const [index, phase] of prior.openings.entries())
      await verifyOpening(phase, ['desktop-phone', 'cold-reopen'][index]);
    return { ...prior, ...(archiveAgent ? {archiveAgent} : {}), reopened: true };
  }
  const runtimeModel = await import(pathToFileURL(join(SOURCE, 'stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs')));
  // The operator selects the existing Applications workspace. It is never replaced on resume.
  model = await runtimeModel.openRuntimeWorkspace({ directory: APPLICATIONS });
  let attached = await readJSON(join(ROOT, 'runtime-attachment.json'));
  if (!attached) {
    attached = await model.attach({ directory: RUNTIME, label: 'Received merchant review runtime' });
    await save(join(ROOT, 'runtime-attachment.json'), attached, { original: true });
  }
  const catalog = await model.applicationsState();
  assert(catalog.catalog.some(value => value.id === 'x402api-merchant-received-review' && value.providerId === 'x402api-merchant'));
  await save(join(ROOT, 'application-catalog.json'), catalog);
  const reviewPath = join(ROOT, 'application-review.json');
  let review = await readJSON(reviewPath);
  if (!review) {
    review = await model.applicationsReview({ runtimeId: attached.runtimeId, kind: 'x402api-merchant-received-review',
      providerId: 'x402api-merchant', label: 'Original received merchant invoices',
      settings: { receivedDirectory: values.project, port: 0, environmentFile: values['environment-file'],
        operatorTokenEnv: credentialName, pythonExecutable: values.python, allowLoopback: values['allow-loopback'] } });
    await save(reviewPath, review, { original: true });
  }
  const saved = await model.applicationsSave({ requestId: identity('save'), reviewId: review.id });
  await save(join(ROOT, 'application-save.json'), { applicationId: saved.applicationId, revision: saved.revision, saved: saved.saved }, { original: true });
  const applicationId = saved.applicationId;
  if (!(await applicationView(applicationId)).release) await model.applicationsConnect({ applicationId });
  const connectedAt = Date.now();
  for (;;) {
    stopped(); const current = await applicationView(applicationId);
    await save(join(ROOT, 'application-adoption.json'), { applicationId, adoption: current.adoption ?? null, release: current.release ?? null });
    if (current.release) break;
    assert(!['FAILED','INTERRUPTED'].includes(current.adoption?.phase), 'Receive the existing runtime adoption outcome.');
    assert(Date.now() - connectedAt < 120000, 'Continue the existing runtime adoption.');
    await pause(200);
  }
  const openings = [];
  for (const label of ['desktop-phone', 'cold-reopen']) {
    const completePath = join(ROOT, label + '.json');
    let completed = await readJSON(completePath);
    if (!completed) {
      const opening = await beginOpening(label, applicationId);
      if (opening.completed) completed = { ...opening.completed.result, operationId: opening.operationId, native: opening.completed.native };
      else {
        const reads = await receiveReads(opening, credential, label);
        const visual = await receiveBrowser(opening, { operatorToken: credential }, reads, { label, review: true });
        const ended = await finishOpening(opening, { reads, browser: visual });
        completed = { reads, browser: visual, operationId: opening.operationId, native: ended.result };
      }
      await save(completePath, completed, { original: true });
    }
    await verifyOpening(completed, label);
    assert.equal(databaseSnapshot().allUserRowsSha256, before.allUserRowsSha256);
    openings.push(completed);
    // End the first operator model and reopen the same persisted Applications workspace.
    if (label === 'desktop-phone') {
      await model.close(); model = await runtimeModel.openRuntimeWorkspace({ directory: APPLICATIONS });
    }
  }
  assert.equal(openings[0].reads.apiStateSha256, openings[1].reads.apiStateSha256);
  const history = []; let cursor = null;
  do {
    const page = await model.applicationsHistory({ applicationId, limit: 100, cursor });
    history.push(...page.runs); cursor = page.nextCursor;
  } while (cursor !== null);
  await save(join(ROOT, 'application-history.json'), history);
  const after = databaseSnapshot(); assert.equal(after.allUserRowsSha256, before.allUserRowsSha256);
  const result = { schema: 'stellar-forge.received-merchant-application-complete.v1', operation: OPERATION, state: 'COMPLETE',
    project: selectedProject.selection, projectSha256: selectedProject.selectionSha256, runtimeSourceCommit: inspection.sourceCommit,
    application: { directory: APPLICATIONS, applicationId, reviewId: review.id, revision: saved.revision },
    beforeAllRowsSha256: before.allUserRowsSha256, afterAllRowsSha256: after.allUserRowsSha256,
    ...(archiveIntake ? { archiveIntake } : {}), ...(archiveAgent ? { archiveAgent } : {}),
    openings, history, completedAt: new Date().toISOString() };
  await save(join(ROOT, 'complete.json'), result, { original: true });
  return result;
}
await directory(ROOT);
const receivingLease = await operationLease(join(ROOT, 'receiver.lock'));
let result, failure;
try { result = await receive(); }
catch (error) {
  failure = error;
  await save(join(ROOT, 'continuation.json'), { operation: OPERATION, state: 'INCOMPLETE',
    error: errorView(error), ...(error.errors ? { closeErrors: error.errors } : {}), activeRun, at: new Date().toISOString() });
  emit({ state: 'INCOMPLETE', operation: OPERATION, error: errorView(error), output: ROOT });
} finally {
  try {
    await drainBrowser();
    if (activeRun && model) await stopApplication(activeRun);
    if (model) await model.close();
  } finally {
    await receivingLease.close();
    process.off('SIGTERM', terminated); process.off('SIGINT', interrupted);
  }
}
if (failure) process.exitCode = 1;
else emit({ state: 'RECEIVED_MERCHANT_APPLICATION_COMPLETE', operation: OPERATION, output: ROOT,
  applicationId: result.application.applicationId, projectSha256: result.projectSha256, invoices: result.openings[0].reads.invoices.length });
