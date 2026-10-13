// MIT License. Receive the completed merchant through the maintained installed application.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, readFile, lstat, realpath, rename, link, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDistribution } from '../../stellar/scf-starforge-20261009/distribution/build.mjs';
import { prepareRuntimeInstall, recoverRuntime, installRuntime, inspectRuntimeInstall, runtimeCommand } from '../../stellar/scf-starforge-20261009/distribution/runtime-install.mjs';
import { verifyRuntimeProfile } from '../../stellar/scf-starforge-20261009/distribution/runtime-profile.mjs';
import { operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

import { exportProjectFromBrowser, receivePortableProject, verifyPortableReceiving } from './portable-receiving.mjs';
const ORIGINAL_OPERATION = 'SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012';
const ORIGINAL_SHA = '8275abdb2768178cd10685d3631996ec90f9ec3f41227850921eea54dfea354d';
const { values } = parseArgs({ strict: true, options: {
  repo: { type: 'string' }, 'source-commit': { type: 'string' }, original: { type: 'string' },
  root: { type: 'string' }, playwright: { type: 'string' }, chromium: { type: 'string' },
  portable: { type: 'boolean', default: false },
} });
const OPERATION = values.portable ? 'SCF-X402API-MERCHANT-PORTABLE-PROJECT-7DE2-20261012' :
  'SCF-X402API-MERCHANT-INSTALLED-7DE2-20261012';
for (const name of ['repo', 'original', 'root', 'playwright', 'chromium'])
  assert(typeof values[name] === 'string' && isAbsolute(values[name]) && resolve(values[name]) === values[name], 'Use each original absolute ' + name + ' selection.');
assert(/^[0-9a-f]{40}$/.test(values['source-commit']), 'Select one immutable accepted source commit.');
assert.equal(process.platform, 'linux'); assert(Number(process.versions.node.split('.')[0]) >= 24);
process.umask(0o077);
const ROOT = values.root, ORIGINAL = values.original, RECEIVED = join(ORIGINAL, 'receiving');
const WORKSPACE = join(RECEIVED, 'workspace'), DATABASE = join(WORKSPACE, 'merchant.sqlite3');
let RUNTIME = join(ROOT, 'runtime');
let APPLICATIONS = join(ROOT, 'applications');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encoding = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? { integer: item.toString() } :
  item instanceof Uint8Array ? { base64: Buffer.from(item).toString('base64') } : item, 2) + '\n';
const errorView = error => ({ code: error?.code ?? error?.name ?? 'INSTALLED_RECEIVING_FAILED', message: String(error?.message ?? error).slice(0, 2000) });
const exists = async path => { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const readJSON = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const identity = label => {
  const hex = sha(OPERATION + '\n' + label);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
};
function emit(value) { try { process.stdout.write(JSON.stringify(value) + '\n'); } catch {} }
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
let stopping = null, model = null, activeRun = null, commandChild = null, browser = null, browserContext = null, sentinel = null;
const pause = ms => new Promise(accept => setTimeout(accept, ms));
function stopped() { if (stopping) throw Object.assign(new Error('The original installed receiving was stopped.'), { code: 'RECEIVING_STOPPED', signal: stopping }); }
function stop(signal) {
  stopping ??= signal;
  if (commandChild) commandChild.kill('SIGTERM');
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
async function runCommand(label, command, env = process.env) {
  stopped();
  const dir = join(ROOT, 'commands', label); await directory(dir);
  const selected = { executable: command.executable, args: command.args, cwd: command.cwd };
  await save(join(dir, 'selection.json'), selected, { original: true });
  const last = await readJSON(join(dir, 'attempt.json'));
  if (last) {
    const ended = await readJSON(join(last.directory, 'ended.json'));
    if (ended?.code === 0) {
      const stdout = await readFile(join(last.directory, 'stdout'), 'utf8'), stderr = await readFile(join(last.directory, 'stderr'), 'utf8');
      const record = { ...ended, directory: last.directory, stdout, stderr };
      await save(join(dir, 'result.json'), record);
      return record;
    }
  }
  // Each doctor or portable command retains one selected argv. Portable writes
  // additionally bind their original UUID and complete request in a private file.
  // Resume follows the original foreground's child drain and uses that same
  // request. Each attempt keeps separate complete stdout and stderr files.
  const attempt = { directory: join(dir, 'attempt-' + randomUUID()), previous: last?.directory ?? null,
    startedAt: new Date().toISOString() };
  await directory(attempt.directory);
  await save(join(dir, 'attempt.json'), attempt);
  const output = await open(join(attempt.directory, 'stdout'), 'wx', 0o600);
  let errors, outcome;
  try {
    errors = await open(join(attempt.directory, 'stderr'), 'wx', 0o600);
    const child = spawn(command.executable, command.args, { cwd: command.cwd, env, shell: false, stdio: ['ignore', output.fd, errors.fd] });
    commandChild = child;
    outcome = await new Promise(accept => {
      let launchError = null;
      child.once('error', error => { launchError = errorView(error); });
      child.once('close', (code, signal) => accept({ code, signal, ...(launchError ? { launchError } : {}) }));
    });
    await retainCompleted(label, async () => {
      await output.sync(); await errors.sync();
      await save(join(attempt.directory, 'ended.json'), outcome, { original: true });
    });
  } finally {
    commandChild = null;
    await output.close();
    if (errors) await errors.close();
  }
  const stdout = await readFile(join(attempt.directory, 'stdout'), 'utf8'), stderr = await readFile(join(attempt.directory, 'stderr'), 'utf8');
  const record = { ...outcome, directory: attempt.directory, stdout, stderr };
  await save(join(dir, 'result.json'), record);
  assert.equal(outcome.code, 0, label + ': ' + stderr.slice(-2000));
  stopped(); return record;
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
async function originalSnapshot(name) {
  const lease = await operationLease(join(WORKSPACE, 'merchant-owner.lock'));
  try {
    const path = join(ROOT, 'snapshots', name + '.private.json'), current = databaseSnapshot(), previous = await readJSON(path);
    if (previous) {
      assert.equal(current.businessSha256, previous.businessSha256, 'Keep all original customer records.');
      return current;
    }
    await save(path, current, { original: true }); return current;
  } finally { await lease.close(); }
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
async function providerSentinel() {
  const path = join(ROOT, 'provider-selection.json'), previous = await readJSON(path);
  const observationPath = join(ROOT, 'provider-observation.json'), prior = await readJSON(observationPath);
  assert(prior === null || Array.isArray(prior.requests), 'Keep the original provider observation.');
  const requests = [...(prior?.requests ?? [])];
  let retained = Promise.resolve();
  const server = createServer((request, response) => {
    const observed = { method: request.method, path: request.url };
    requests.push(observed); request.resume();
    // Commit each exact observation before sending a response. A local write
    // failure retains this same snapshot and its connection in this foreground.
    // Serial publication preserves every prior observation during concurrent reads.
    const snapshot = { requests: requests.map(value => ({ ...value })) };
    retained = retained.then(async () => {
      await retainCompleted('original-provider-request', () => save(observationPath, snapshot));
      try {
        if (!response.destroyed) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'COMPLETED_RECEIVING_HAS_NO_PROVIDER_OPERATION' }));
        }
      } catch { response.destroy(); }
      emit({ state: 'UNEXPECTED_PROVIDER_REQUEST', ...observed });
    });
  });
  await new Promise((accept, reject) => {
    server.once('error', reject); server.listen(previous?.port ?? 0, '127.0.0.1', () => { server.off('error', reject); accept(); });
  });
  const selected = { host: '127.0.0.1', port: server.address().port, origin: 'http://127.0.0.1:' + server.address().port };
  try { await save(path, selected, { original: true }); }
  catch (error) { await new Promise(accept => server.close(accept)); await retained; throw error; }
  return { server, selected, requests, drain: () => retained };
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
    const native = await import(pathToFileURL(join(RUNTIME, 'package/source/stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs')));
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
      assert.equal(current.announcement.original.directory, WORKSPACE);
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
async function get(url, token, route) {
  const response = await fetch(new URL(route, url), { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, 'Open the original authenticated read: ' + route);
  const raw = Buffer.from(await response.arrayBuffer());
  assert(raw.length <= 16 * 1024 * 1024);
  return { raw, contentType: response.headers.get('content-type'), json: () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) };
}
async function receiveReads(opening, scenario, completed, label) {
  const state = (await get(opening.url, scenario.operatorToken, '/api/state')).json();
  assert.equal(state.config.tenantId, scenario.config.tenantId); assert.equal(state.orders.length, 5);
  const invoices = [];
  for (const expected of completed.orders) {
    stopped();
    const inspected = (await get(opening.url, scenario.operatorToken, '/api/orders/' + expected.merchantOrderId)).json();
    assert.equal(inspected.order.state, 'COMPLETE'); assert.equal(inspected.order.paymentId, expected.paymentId);
    assert.equal(inspected.order.result.bytes, expected.bytes); assert.equal(inspected.order.result.sha256, expected.sha256);
    const downloaded = await get(opening.url, scenario.operatorToken, '/api/orders/' + expected.merchantOrderId + '/result');
    assert.equal(downloaded.raw.length, expected.bytes); assert.equal(sha(downloaded.raw), expected.sha256);
    const path = join(ROOT, 'downloads', label, expected.paymentId + '.txt');
    await save(path, downloaded.raw, { original: true });
    let envelope = null;
    if (values.portable) {
      const original = await get(opening.url, scenario.operatorToken, '/api/orders/' + expected.merchantOrderId + '/envelope');
      const envelopePath = join(ROOT, 'downloads', label, expected.paymentId + '-payment-request.json');
      await save(envelopePath, original.raw, { original: true });
      envelope = { path: envelopePath, bytes: original.raw.length, sha256: sha(original.raw) };
    }
    invoices.push({ ...expected, reference: inspected.order.reference, title: inspected.order.title,
      historySha256: sha(encoding(inspected.history)), download: { path, bytes: downloaded.raw.length, sha256: sha(downloaded.raw) },
      ...(envelope ? { envelope } : {}) });
  }
  return { invoices, mode: state.mode, apiStateSha256: sha(encoding(state)), nativeUrlRecord: opening.operationId };
}
async function receiveBrowser(opening, scenario, reads, { label = 'installed', review = false, exportProject = false } = {}) {
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
    const projectWrite = exportProject && request.method() === 'POST' &&
      (url.pathname === '/api/project/exports' || /^\/api\/project\/exports\/[0-9a-f-]{36}\/download$/.test(url.pathname));
    if (url.origin !== origin || request.method() !== 'GET' && !projectWrite) {
      failures.push({ kind: 'unexpected-browser-request', method: request.method(), origin: url.origin, path: url.pathname });
      return route.abort();
    }
    requests.push({ method: request.method(), path: url.pathname });
    try {
      const headers = {};
      for (const [name, value] of Object.entries(await request.allHeaders()))
        if (!['host','connection','accept-encoding','content-length'].includes(name)) headers[name] = value;
      const response = await fetch(request.url(), { method: request.method(), headers,
        ...(projectWrite ? { body: request.postDataBuffer() } : {}), redirect: 'error', signal: AbortSignal.timeout(15000) });
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
      if (values.portable) {
        const envelopeEvent = page.waitForEvent('download', { timeout: 15000 });
        await page.locator('#download-envelope').click();
        const envelopeDownload = await envelopeEvent;
        const envelopePath = join(ROOT, 'downloads', 'browser-' + label, invoice.paymentId + '-payment-request.json');
        await envelopeDownload.saveAs(envelopePath); assert.equal(await envelopeDownload.failure(), null);
        downloads.push(await originalFile(envelopePath, { bytes: invoice.envelope.bytes, sha256: invoice.envelope.sha256 }));
      }
    }
    const project = exportProject ? await exportProjectFromBrowser({ page, opening, scenario, root: ROOT,
      identity, get, save, directory, originalFile, capture, stopped, retainCompleted }) : null;
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
      mode: exportProject ? 'ORIGINAL_INSTALLED_PORTABLE_HTTP_BRIDGE' : 'ORIGINAL_INSTALLED_HTTP_GET_BRIDGE',
      dimensions: { phone }, images, downloads, requests, pageErrors: failures, consoleErrors,
      ...(project ? { project } : {}) };
  } finally {
    await browserContext.close(); browserContext = null; await browser.close(); browser = null;
  }
}
async function selectedRuntime(built) {
  const path = join(ROOT, 'runtime-selection.json');
  const frozen = { sourceCommit: values['source-commit'], archive: built.archive, archiveSha256: built.sha256,
    selection: { native: false, features: ['x402api-merchant'], operator: true, pins: {} } };
  let record = await readJSON(path);
  if (!record) {
    record = { ...frozen, attempts: [{ directory: RUNTIME, previousDirectory: null, createdAt: new Date().toISOString() }] };
    await save(path, record);
  }
  for (const key of Object.keys(frozen)) assert.deepEqual(record[key], frozen[key], 'Keep the original runtime selection.');
  let selected = record.attempts.at(-1); RUNTIME = selected.directory;
  if (await exists(join(RUNTIME, 'runtime-install.json')) && await exists(join(RUNTIME, 'install-state.json'))) return;
  if (await exists(RUNTIME)) {
    // Preparation is the maintained installer's operation. Its complete intent
    // recovers into one named successor; the previous directory stays retained.
    assert(!await exists(join(ROOT, 'application-review.json')), 'Recover the already-reviewed application through its original runtime selection.');
    const preparation = await readJSON(join(RUNTIME, 'preparation.json'));
    if (preparation) {
      assert.equal(preparation.archiveSha256, built.sha256); assert.deepEqual(preparation.selection, frozen.selection);
    }
    selected = { directory: join(ROOT, 'runtime-recovery-' + (record.attempts.length + 1)),
      previousDirectory: RUNTIME, originalPreparation: Boolean(preparation), createdAt: new Date().toISOString() };
    record.attempts.push(selected); await save(path, record); RUNTIME = selected.directory;
  }
  stopped();
  const prepared = selected.previousDirectory && selected.originalPreparation ?
    await recoverRuntime({ from: selected.previousDirectory, directory: RUNTIME, offline: true, install: false }) :
    await prepareRuntimeInstall({ directory: RUNTIME, archive: built.archive, sha256: built.sha256, ...frozen.selection,
      ...(selected.previousDirectory ? { from: selected.previousDirectory } : {}) });
  await save(join(ROOT, 'prepared-runtime.json'), prepared);
}
async function selectedApplications(runtimeModel) {
  const path = join(ROOT, 'applications-selection.json');
  const selected = await readJSON(path) ?? { operation: OPERATION, directories: [APPLICATIONS] };
  assert.equal(selected.operation, OPERATION);
  APPLICATIONS = selected.directories.at(-1);
  if (await exists(join(APPLICATIONS, 'workspace.json'))) return;
  if (await exists(APPLICATIONS)) {
    assert(!await exists(join(ROOT, 'application-review.json')), 'Keep the already-reviewed Applications workspace.');
    APPLICATIONS = join(ROOT, 'applications-recovery-' + (selected.directories.length + 1));
    selected.directories.push(APPLICATIONS);
  }
  await save(path, selected);
  await runtimeModel.createRuntimeWorkspace({ directory: APPLICATIONS });
}
async function receive() {
  await directory(ROOT);
  const selection = { schema: 'stellar-forge.merchant-installed-receiving-selection.v1', operation: OPERATION,
    originalOperation: ORIGINAL_OPERATION, originalArchiveSha256: ORIGINAL_SHA, root: ROOT, original: ORIGINAL,
    repository: values.repo, sourceCommit: values['source-commit'], playwright: values.playwright, chromium: values.chromium,
    ...(values.portable ? { portable: true } : {}) };
  await save(join(ROOT, 'selection.json'), selection, { original: true });
  const previous = await readJSON(join(ROOT, 'complete.json'));
  if (previous) {
    assert.equal(previous.state, 'COMPLETE'); assert.equal(previous.operation, OPERATION);
    assert.equal(previous.sourceCommit, selection.sourceCommit); assert.equal(previous.originalArchiveSha256, ORIGINAL_SHA);
    const lease = await operationLease(join(WORKSPACE, 'merchant-owner.lock'));
    try { const current = databaseSnapshot(); assert.equal(current.businessSha256, previous.afterBusinessSha256); }
    finally { await lease.close(); }
    for (const file of [...previous.browser.images, ...previous.browser.downloads]) await originalFile(file.path, file);
    if (values.portable) await verifyPortableReceiving(previous.portable, { originalFile });
    return { ...previous, reopened: true };
  }
  const scenario = await readJSON(join(RECEIVED, 'scenario.json')), completed = await readJSON(join(RECEIVED, 'complete.json'));
  assert.equal(scenario.operation, ORIGINAL_OPERATION); assert.equal(completed.operation, ORIGINAL_OPERATION);
  assert.equal(completed.state, 'COMPLETE'); assert.equal(completed.orders.length, 5);
  const before = await originalSnapshot('before');
  for (const original of completed.orders) await originalFile(original.resultPath, original);
  stopped();
  emit({ state: 'BUILDING_SELECTED_ORIGINAL_SOURCE', sourceCommit: selection.sourceCommit, selection: 'x402api-merchant' });
  const built = await buildDistribution({ repository: values.repo, ref: selection.sourceCommit, selection: 'x402api-merchant',
    output: join(ROOT, 'build'), offline: true, resume: await exists(join(ROOT, 'build')),
    onProgress: event => emit({ state: 'ORIGINAL_PACKAGE_PROGRESS', ...event }) });
  await save(join(ROOT, 'package-result.json'), built);
  assert.equal(built.sourceCommit, selection.sourceCommit); assert.equal(built.sourceSelection.id, 'x402api-merchant');
  stopped();
  await selectedRuntime(built);
  const installed = await installRuntime({ directory: RUNTIME, offline: true });
  const inspection = await inspectRuntimeInstall({ directory: RUNTIME, load: true, source: true });
  assert.equal(inspection.status, 'READY'); assert.equal(inspection.ready, true); assert.equal(inspection.sourceCommit, selection.sourceCommit);
  const profile = verifyRuntimeProfile(await readJSON(join(RUNTIME, 'runtime-profile.json')));
  assert.deepEqual(profile.selection, { native: false, features: ['x402api-merchant'], operator: true, pins: {} });
  assert.equal(profile.host.node, '>=24.0.0'); assert.deepEqual(profile.dependencies, []);
  await save(join(ROOT, 'runtime-inspection.json'), { installed, inspection, profile });
  const doctor = await runCommand('profile-doctor', await runtimeCommand({ directory: RUNTIME, args: ['doctor', '--feature', 'x402api-merchant'] }));
  const diagnostic = JSON.parse(doctor.stdout); const feature = diagnostic.optionalFeatures.find(value => value.name === 'x402api-merchant');
  assert.equal(feature.available, true); assert.equal(feature.node.ready, true);
  assert.equal(diagnostic.sourceSelection, 'x402api-merchant');
  stopped();
  const sourceRoot = inspection.sourceRoot;
  sentinel = await providerSentinel();
  const configuration = await readJSON(join(RECEIVED, 'customer/merchant.configuration.json'));
  assert.equal(configuration.fulfillmentBinding, scenario.config.fulfillmentBinding);
  configuration.fulfillmentModule = join(sourceRoot, 'products/x402api-merchant-workspace/fulfillment/file-delivery.mjs');
  configuration.providerOrigin = sentinel.selected.origin;
  const configPath = join(ROOT, 'inputs/merchant.json'), environmentPath = join(ROOT, 'inputs/environment.private.json');
  const environment = { MERCHANT_LOCAL_TENANT: scenario.credential, MERCHANT_LOCAL_OPERATOR: scenario.operatorToken,
    MERCHANT_LOCAL_WEBHOOK: scenario.webhookSecretsByVersion['1'] };
  await save(configPath, configuration, { original: true }); await save(environmentPath, environment, { original: true });
  const configuredDoctor = await runCommand('merchant-doctor', await runtimeCommand({ directory: RUNTIME,
    args: ['x402api-merchant', 'doctor', '--config', configPath, '--allow-loopback'] }), { ...process.env, ...environment });
  assert.equal(JSON.parse(configuredDoctor.stdout).configured, true);
  const runtimeModel = await import(pathToFileURL(join(sourceRoot, 'stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs')));
  await selectedApplications(runtimeModel);
  model = await runtimeModel.openRuntimeWorkspace({ directory: APPLICATIONS });
  const attached = await model.attach({ directory: RUNTIME, label: 'Installed x402api merchant' });
  await save(join(ROOT, 'runtime-attachment.json'), attached, { original: true });
  const catalog = await model.applicationsState();
  assert(catalog.catalog.some(value => value.id === 'x402api-merchant-workspace' && value.providerId === 'x402api-merchant'));
  await save(join(ROOT, 'application-catalog.json'), catalog);
  const reviewPath = join(ROOT, 'application-review.json');
  let review = await readJSON(reviewPath);
  if (!review) {
    review = await model.applicationsReview({ runtimeId: attached.runtimeId, kind: 'x402api-merchant-workspace',
      providerId: 'x402api-merchant', label: 'Original five completed merchant invoices',
      settings: { configurationFile: configPath, directory: WORKSPACE, port: 0, environmentFile: environmentPath, allowLoopback: true } });
    await save(reviewPath, review, { original: true });
  }
  const saved = await model.applicationsSave({ requestId: identity('application-save'), reviewId: review.id });
  await save(join(ROOT, 'application-save.json'), { applicationId: saved.applicationId, revision: saved.revision, saved: saved.saved }, { original: true });
  const applicationId = saved.applicationId;
  await model.applicationsConnect({ applicationId });
  const connectingAt = Date.now();
  for (;;) {
    stopped(); const current = await applicationView(applicationId);
    const failed = ['FAILED','INTERRUPTED'].includes(current.adoption?.phase);
    const timedOut = Date.now() - connectingAt >= 120000;
    if (current.release || failed || timedOut) {
      // Keep the exact original operation projection, including state.result
      // and state.error, before a guard or local receipt failure can unwind.
      // The ordinary command-result projection can be null for managed-adopt.
      const observation = { schema: 'stellar-forge.merchant-managed-adoption-observation.v1',
        operation: OPERATION, sourceCommit: values['source-commit'], observedAt: new Date().toISOString(),
        applicationId, runtimeDirectory: RUNTIME, applicationsDirectory: APPLICATIONS,
        adoption: current.adoption ?? null };
      const bytes = Buffer.from(encoding(observation)), digest = sha(bytes);
      const receiptPath = join(ROOT, 'managed-adoption', digest + '.json');
      await retainCompleted('original-managed-adoption-observation',
        () => save(receiptPath, bytes, { original: true }));
      const adoption = observation.adoption, nativeResult = adoption?.state?.result ?? adoption?.result ?? null;
      const error = adoption?.state?.error ?? adoption?.result?.error ?? null;
      const short = (value, maximum) => typeof value === 'string' ?
        value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maximum) : null;
      emit({ state: 'ORIGINAL_MANAGED_ADOPTION_OBSERVED', applicationId,
        adoptionId: adoption?.id ?? null, phase: short(adoption?.phase, 64), active: adoption?.active === true,
        workerPhase: short(adoption?.state?.phase, 64),
        nativeResultPresent: nativeResult !== null, nativeResultState: short(nativeResult?.state, 64),
        error: error ? { code: short(error.code, 120), message: short(error.message, 600) } : null,
        receiptPath, receiptSha256: digest });
      stopped();
    }
    if (current.release) break;
    assert(!failed, 'Use the original adoption Retry/Resume with its retained result.');
    assert(!timedOut, 'The original managed adoption has not returned.');
    await pause(200);
  }
  const firstPath = join(ROOT, 'browser-complete.json');
  let first = await readJSON(firstPath);
  if (!first) {
    const opening = await beginOpening('browser', applicationId);
    if (opening.completed) first = { ...opening.completed.result, operationId: opening.operationId, originalProcess: opening.completed.native };
    else {
      const reads = await receiveReads(opening, scenario, completed, 'first');
      const visual = await receiveBrowser(opening, scenario, reads, { exportProject: values.portable });
      const ended = await finishOpening(opening, { reads, browser: visual });
      first = { reads, browser: visual, operationId: opening.operationId, originalProcess: ended.result };
    }
    await retainCompleted('original-browser-completion', () => save(firstPath, first, { original: true }));
  }
  assert.equal(sentinel.requests.length, 0);
  const afterFirst = await originalSnapshot('after-first');
  assert.equal(afterFirst.businessSha256, before.businessSha256);
  stopped();
  const secondPath = join(ROOT, 'reopen-complete.json');
  let second = await readJSON(secondPath);
  if (!second) {
    const opening = await beginOpening('reopen', applicationId);
    if (opening.completed) second = { ...opening.completed.result, operationId: opening.operationId, originalProcess: opening.completed.native };
    else {
      const reads = await receiveReads(opening, scenario, completed, 'reopened');
      const ended = await finishOpening(opening, { reads });
      second = { reads, operationId: opening.operationId, originalProcess: ended.result };
    }
    await retainCompleted('original-reopen-completion', () => save(secondPath, second, { original: true }));
  }
  const after = await originalSnapshot('after-reopen');
  assert.equal(after.businessSha256, before.businessSha256); assert.equal(sentinel.requests.length, 0);
  assert.equal(first.reads.apiStateSha256, second.reads.apiStateSha256);
  const portable = values.portable ? await receivePortableProject({ root: ROOT, sourceRoot, scenario, completed,
    exported: first.browser.project, firstReads: first.reads, identity, get, save, directory, originalFile,
    databaseSnapshot, receiveReads, receiveBrowser, runCommand, stopped, retainCompleted }) : null;
  assert.equal(sentinel.requests.length, 0);
  const history = []; let cursor = null;
  do {
    const page = await model.applicationsHistory({ applicationId, limit: 100, cursor }); history.push(...page.runs); cursor = page.nextCursor;
  } while (cursor !== null);
  await save(join(ROOT, 'application-history.json'), history);
  const result = { schema: 'stellar-forge.merchant-installed-receiving-result.v1', operation: OPERATION, state: 'COMPLETE',
    originalOperation: ORIGINAL_OPERATION, originalArchiveSha256: ORIGINAL_SHA, sourceCommit: selection.sourceCommit,
    package: built, runtime: { directory: RUNTIME, sourceRoot, profileId: profile.profileId, node: process.version,
      host: profile.host, lockSha256: inspection.lockSha256, dependencies: profile.dependencies },
    applications: { directory: APPLICATIONS, applicationId, reviewId: review.id, revision: saved.revision,
      openingId: first.operationId, reopenedId: second.operationId, history: history.map(run => ({ id: run.id, phase: run.phase, result: run.result })) },
    beforeBusinessSha256: before.businessSha256, afterBusinessSha256: after.businessSha256,
    businessTables: after.business.tables.map(table => ({ name: table.name, rows: table.rows.length })),
    runtimeHistory: after.runtimes, invoices: second.reads.invoices, browser: first.browser,
    providerCalls: sentinel.requests, createdInvoices: 0, submittedPayments: 0, completedAt: new Date().toISOString(),
    ...(portable ? { portable } : {}) };
  await retainCompleted('original-installed-completion', () => save(join(ROOT, 'complete.json'), result, { original: true }));
  return result;
}
let result = null, failure = null;
try {
  result = await receive();
} catch (error) {
  failure = error;
  const observed = { schema: 'stellar-forge.merchant-installed-receiving-failure.v1', operation: OPERATION,
    state: 'INCOMPLETE', at: new Date().toISOString(), error: errorView(error),
    ...(Array.isArray(error.missingObjects) ? { missingGitObjects: error.missingObjects, sourceCommit: error.sourceCommit } : {}),
    activeRun, stop: stopping };
  try { await save(join(ROOT, 'failure.json'), observed); } catch {}
  emit(observed);
} finally {
  if (browserContext) { await browserContext.close().catch(() => {}); browserContext = null; }
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  if (activeRun && model) await stopApplication(activeRun);
  if (model) await model.close();
  if (sentinel) {
    await new Promise(accept => sentinel.server.close(accept));
    await sentinel.drain();
    await retainCompleted('original-provider-observation', () =>
      save(join(ROOT, 'provider-observation.json'), { requests: sentinel.requests }));
  }
  process.off('SIGTERM', terminated); process.off('SIGINT', interrupted);
}
if (failure) { process.exitCode = 1; }
else emit({ state: values.portable ? 'PORTABLE_MERCHANT_COMPLETE' : 'INSTALLED_MERCHANT_COMPLETE', operation: OPERATION, sourceCommit: result.sourceCommit,
  invoices: result.invoices.length, browser: result.browser.browser, screenshots: result.browser.images,
  beforeBusinessSha256: result.beforeBusinessSha256, afterBusinessSha256: result.afterBusinessSha256,
  providerCalls: result.providerCalls.length });
