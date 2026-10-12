#!/usr/bin/env node
// MIT. Original Boston source through a resumable geographic customer operation.
import { readFile, mkdir, copyFile, open, lstat, readdir, readlink, link, unlink, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname, basename, relative, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const timestamp = () => new Date().toISOString();
const copy = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b, message) => check(stable(a) === stable(b), message);
const missing = error => error?.code === 'ENOENT';
const CONTINUATION_SCHEMA = 'commons.open311.gis-customer-continuation.v1';
const ACTION_KINDS = { '/api/import': 'source-import', '/api/handoff': 'handoff-create',
  '/api/return': 'return-import', '/api/decision': 'decision-save',
  '/api/dispatch': 'dispatch-create', '/api/receive': 'workspace-receive' };

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (missing(error)) return false; throw error; }
}
async function regularBytes(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    check(before.isFile(), 'Select a regular retained file: ' + path);
    const body = await handle.readFile();
    const after = await handle.stat({ bigint: true }), current = await lstat(path, { bigint: true });
    check(!current.isSymbolicLink() && current.dev === before.dev && current.ino === before.ino &&
      after.dev === before.dev && after.ino === before.ino && after.size === before.size &&
      after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs &&
      BigInt(body.length) === before.size, 'The retained file changed while it was read: ' + path);
    return body;
  } finally { await handle.close(); }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function readJSON(path) { return JSON.parse((await regularBytes(path)).toString('utf8')); }
async function optionalJSON(path) { try { return await readJSON(path); } catch (error) { if (missing(error)) return null; throw error; } }
async function publish(path, value) {
  // Only deterministic bytes use an exact-prefix temporary. The output lease
  // serializes publishers; an existing winner is received before any copy.
  const body = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : json(value));
  if (await exists(path)) {
    check((await regularBytes(path)).equals(body), 'Preserve the different completed file: ' + path);
    return body;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), '.' + basename(path) + '.' + sha(body) + '.pending');
  const handle = await open(temp, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await handle.stat();
    check(info.isFile() && info.size <= body.length, 'Preserve the different publication prefix: ' + temp);
    const prefix = Buffer.alloc(info.size);
    let read = 0;
    while (read < prefix.length) {
      const result = await handle.read(prefix, read, prefix.length - read, read);
      check(result.bytesRead > 0, 'The retained publication prefix became unreadable.');
      read += result.bytesRead;
    }
    check(prefix.equals(body.subarray(0, prefix.length)), 'Preserve the different publication prefix: ' + temp);
    let position = prefix.length;
    while (position < body.length) {
      const result = await handle.write(body, position, Math.min(1048576, body.length - position), position);
      check(result.bytesWritten > 0, 'The complete publication did not finish.');
      position += result.bytesWritten;
    }
    await handle.sync();
    const current = await lstat(temp);
    check(!current.isSymbolicLink() && current.dev === info.dev && current.ino === info.ino,
      'The publication temporary changed identity.');
    try { await link(temp, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      check((await regularBytes(path)).equals(body), 'Another writer published different completed bytes.');
    }
    await syncDirectory(dirname(path));
    await unlink(temp);
    await syncDirectory(dirname(path));
  } finally { await handle.close(); }
  return body;
}
async function envelope(path, value) {
  // UUIDs, measured times and browser encodings need a complete envelope first.
  // An interrupted unpublished temporary is retained under its unique name.
  if (await exists(path)) return readJSON(path);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), '.' + basename(path) + '.' + randomUUID() + '.pending');
  const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(json(value)); await handle.sync();
    try { await link(temp, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await syncDirectory(dirname(path));
  } finally { await handle.close(); }
  await unlink(temp); await syncDirectory(dirname(path));
  return readJSON(path);
}
async function execute(command, args, { lease, maxBuffer = 2 * 1024 * 1024, ...options } = {}) {
  return new Promise((resolveResult, reject) => {
    // The actual CLI writer inherits the same held open-file description.
    // A parent loss therefore cannot let another programme overlap that child.
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe', ...(lease ? [lease.fd] : [])] });
    const output = [[], []], sizes = [0, 0];
    let failure = null;
    for (const [index, stream] of [child.stdout, child.stderr].entries()) stream.on('data', body => {
      sizes[index] += body.length;
      if (sizes[index] > maxBuffer) { failure ??= new Error('The original command exceeded its retained output limit.'); child.kill('SIGTERM'); }
      else output[index].push(body);
    });
    child.once('error', error => { failure = error; });
    child.once('close', (code, signal) => {
      const result = { stdout: Buffer.concat(output[0]).toString('utf8'), stderr: Buffer.concat(output[1]).toString('utf8'), code, signal };
      if (failure || code !== 0) {
        const error = failure ?? new Error('The original command ended with ' + (signal ?? code) + ': ' + result.stderr);
        Object.assign(error, { command, args, ...result }); reject(error);
      } else resolveResult(result);
    });
  });
}
async function acquireLease(output, executable = 'flock') {
  const path = join(output, '.operation.lock');
  const handle = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const before = await handle.stat(), current = await lstat(path);
    check(before.isFile() && !current.isSymbolicLink() && before.dev === current.dev && before.ino === current.ino,
      'The geographic operation lock changed identity.');
    await execute(executable, ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3'], { lease: handle });
    const after = await lstat(path);
    check(after.dev === before.dev && after.ino === before.ino, 'The geographic operation lock was replaced.');
    return handle;
  } catch (error) {
    await handle.close();
    if (error.code === 75) error.message = 'The original geographic programme or its CLI child still owns this output.';
    throw error;
  }
}
function member(root, name) {
  check(typeof name === 'string' && name && !name.includes('\\') && !name.startsWith('/') &&
    name.split('/').every(part => part && part !== '.' && part !== '..'), 'Select a portable output member.');
  return join(root, name);
}
async function directoryIdentity(path) {
  const actual = await realpath(path), info = await lstat(actual);
  check(info.isDirectory() && !info.isSymbolicLink(), 'Select a physical private directory.');
  return { directory: actual, device: String(info.dev), inode: String(info.ino) };
}
async function sourceInventory(root) {
  const files = [], excluded = new Set(['.git', 'node_modules', '__pycache__']);
  async function walk(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(item.name) || item.name.endsWith('.pyc')) continue;
      const path = join(directory, item.name), name = relative(root, path).split(sep).join('/');
      if (item.isSymbolicLink()) {
        const target = await readlink(path), actual = await realpath(path), selected = relative(root, actual).split(sep).join('/');
        check(selected && !selected.startsWith('../') && selected !== '..' && !excluded.has(selected.split('/')[0]),
          'The selected source link leaves its complete physical source inventory: ' + name);
        files.push({ path: name, kind: 'symlink', target, resolved: selected,
          bytes: Buffer.byteLength(target), sha256: sha(target) });
      } else if (item.isDirectory()) await walk(path);
      else {
        check(item.isFile(), 'The selected source contains a non-file member: ' + name);
        const body = await regularBytes(path); files.push({ path: name, bytes: body.length, sha256: sha(body) });
      }
    }
  }
  await walk(root);
  return { files, sha256: sha(stable(files)), bytes: files.reduce((total, file) => total + file.bytes, 0) };
}
function errorValue(error) {
  return { message: error.message, code: error.code, status: error.status, details: error.details,
    stack: error.stack, ...(error.command ? { command: error.command, args: error.args, stdout: error.stdout,
      stderr: error.stderr, signal: error.signal } : {}) };
}
function containsPackage(current, baseline, message) {
  check(current.workspaceId === baseline.workspaceId && current.revision >= baseline.revision, message + ': workspace identity or revision changed.');
  const records = new Map(current.records.map(item => [item.kind + '\0' + item.id, item]));
  const operations = new Map(current.operations.map(item => [item.requestId, item]));
  for (const original of baseline.records) equal(records.get(original.kind + '\0' + original.id), original, message + ': original record changed.');
  for (const original of baseline.operations) equal(operations.get(original.requestId), original, message + ': original operation changed.');
}
async function verifyDescriptor(output, descriptor) {
  const bytes = await regularBytes(member(output, descriptor.name));
  check(bytes.length === descriptor.bytes && sha(bytes) === descriptor.sha256, 'The frozen delivery member changed: ' + descriptor.name);
  return bytes;
}

class Programme {
  constructor(output, input, run, api, config, lease) {
    Object.assign(this, { output, input, run, api, config, lease });
    this.inputSha256 = sha(stable(input)); this.files = new Map(); this.phases = new Map();
    this.attempt = randomUUID(); this.attemptRoot = join(output, 'attempts', this.attempt);
    this.browserErrors = [];
  }
  bound(value) { return { schema: CONTINUATION_SCHEMA, runId: this.run.runId, inputSha256: this.inputSha256, ...value }; }
  checkBound(value) {
    check(value?.schema === CONTINUATION_SCHEMA && value.runId === this.run.runId && value.inputSha256 === this.inputSha256,
      'This retained result belongs to another source or geographic operation.');
    return value;
  }
  async saved(name) {
    const value = await optionalJSON(member(this.output, name));
    return value === null ? null : this.checkBound(value);
  }
  async retain(name, value) {
    const result = await envelope(member(this.output, name), this.bound(value));
    return this.checkBound(result);
  }
  async recordFile(name, contentType = 'application/octet-stream') {
    const bytes = await regularBytes(member(this.output, name));
    const descriptor = { name, bytes: bytes.length, sha256: sha(bytes), contentType };
    if (this.files.has(name)) equal(this.files.get(name), descriptor, 'A frozen programme artifact changed.');
    this.files.set(name, descriptor); return bytes;
  }
  async save(name, value, contentType = 'application/json') {
    await publish(member(this.output, name), value); return this.recordFile(name, contentType);
  }
  async once(name, work) {
    const path = 'steps/' + name + '.json', prior = await this.saved(path);
    if (prior) return copy(prior.value);
    const errorsBefore = this.browserErrors.length;
    const value = await work();
    check(this.browserErrors.length === errorsBefore, 'The actual browser reported an error during this unfinished step.');
    return copy((await this.retain(path, { value: value ?? null, completedAt: timestamp() })).value);
  }
  async phase(name, value) {
    const result = await this.retain('phases/' + name + '.json', { value: { name, completedAt: timestamp(), ...value } });
    this.phases.set(name, result.value);
    console.log('OPEN311_GIS_PHASE ' + JSON.stringify(result.value));
    return result.value;
  }
  async workspace(role) {
    const directory = member(this.output, role + '-workspace'), saved = await this.saved('workspaces/' + role + '.json');
    if (saved) {
      const file = await lstat(join(directory, 'open311-gis.sqlite'));
      check(file.isFile() && !file.isSymbolicLink() && String(file.dev) === saved.database.device &&
        String(file.ino) === saved.database.inode, 'Preserve the original ' + role + ' database for continuation.');
      return saved;
    }
    const workspace = this.api.openWorkspace(directory);
    try {
      const state = workspace.state();
      check(state.revision === 0 && workspace.workspaceExport().records.length === 0,
        'The existing workspace has work but no original programme binding: ' + role);
      const file = await lstat(join(directory, 'open311-gis.sqlite'));
      return this.retain('workspaces/' + role + '.json', { role, directory: role + '-workspace',
        initialWorkspaceId: state.workspaceId, database: { device: String(file.dev), inode: String(file.ino) } });
    } finally { workspace.close(); }
  }
  actionInput(pathname, input) {
    if (pathname !== '/api/receive') return input;
    const bundle = this.api.validateWorkspacePackage(input.originalText, { directory: this.output });
    return { requestId: input.requestId, expectedRevision: input.expectedRevision,
      originalFile: { bytes: Buffer.byteLength(input.originalText), sha256: sha(input.originalText) },
      incomingPackageSha256: bundle.sha256, ...(Object.hasOwn(input, 'hostInput') ? { hostInput: input.hostInput } : {}) };
  }
  inputHash(kind, input) { const { expectedRevision, ...intent } = input; return sha(this.nativeCanonical({ kind, intent })); }
  verifyOperation(action, workspace) {
    const operation = workspace.operation(action.input.requestId);
    if (!operation) return null;
    const expected = this.actionInput(action.pathname, action.input), kind = ACTION_KINDS[action.pathname];
    check(operation.kind === kind && operation.state === 'SUCCEEDED' &&
      operation.inputSha256 === this.inputHash(kind, expected), 'The original request ID selects different saved work.');
    equal(operation.input, expected, 'The saved original operation input changed.');
    return operation;
  }
  async action(name, page, server, pathname, work, { loseResponse = false } = {}) {
    check(ACTION_KINDS[pathname], 'Select an original GIS mutation API.');
    const base = 'actions/' + name, prior = await this.saved(base + '/input.json');
    const receiveResult = async (action, received) => {
      const actual = this.verifyOperation(action, server.workspace);
      check(actual, 'The original HTTP result has no committed native operation.');
      if (received) equal(actual.result, received, 'The HTTP result differs from the saved original operation.');
      const stored = await this.retain(base + '/result.json', { operation: actual, observedAt: timestamp(),
        receivedThrough: received ? 'original-http-response' : 'original-native-operation' });
      equal(stored.operation, actual, 'The original saved operation changed after receiving.');
      return copy(actual.result);
    };
    if (prior) {
      check(prior.pathname === pathname && prior.directory === relative(this.output, server.workspace.directory),
        'Preserve the selected original action and workspace.');
      const actual = this.verifyOperation(prior, server.workspace);
      if (actual) return receiveResult(prior);
      check(!await this.saved(base + '/result.json'), 'A completed action is missing from its original workspace.');
      // A captured request may not have reached the server. Reuse its exact
      // body and original revision; native CAS remains the authority.
      const response = await page.request.post(new URL(pathname, server.url).href,
        { data: prior.input, timeout: this.config.timeoutMs ?? 45000 });
      const body = await response.json();
      check(response.ok() && body.ok !== false, 'Original request replay: ' + json(body.error ?? body));
      const result = await receiveResult(prior, body.value ?? body);
      await this.retain(base + '/replay.json', { receivedAt: timestamp(), requestId: prior.input.requestId });
      await page.reload({ waitUntil: 'domcontentloaded' });
      return result;
    }
    let settle, rejectOutcome, entered = false, retained = null;
    const outcome = new Promise((yes, no) => { settle = yes; rejectOutcome = no; });
    outcome.catch(() => {});
    const url = new URL(pathname, server.url).href;
    const receiveRoute = async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      if (entered) { await route.abort('failed'); rejectOutcome(new Error('The browser attempted a second action before the first result.')); return; }
      entered = true;
      try {
        const input = route.request().postDataJSON();
        check(typeof input.requestId === 'string' && input.requestId && Number.isSafeInteger(input.expectedRevision),
          'The browser did not select its original request controls.');
        // Complete publication precedes the first possible native mutation.
        retained = await this.retain(base + '/input.json', { pathname, input,
          directory: relative(this.output, server.workspace.directory), capturedAt: timestamp() });
        equal(retained.input, input, 'The original browser action changed before submission.');
        const response = await route.fetch({ timeout: this.config.timeoutMs ?? 45000 }), body = await response.json();
        if (!response.ok() || body.ok === false) {
          await route.fulfill({ response }); throw new Error(pathname + ': ' + json(body.error ?? body));
        }
        const result = await receiveResult(retained, body.value ?? body);
        if (loseResponse) {
          await route.abort('failed');
          await this.retain(base + '/response-loss.json', { requestId: input.requestId,
            observedAt: timestamp(), outcome: 'response-aborted-after-original-commit' });
        } else await route.fulfill({ response });
        settle(result);
      } catch (error) {
        await route.abort('failed').catch(() => {}); rejectOutcome(error);
      }
    };
    const activeHandlers = new Set();
    const handler = route => {
      const pending = receiveRoute(route); activeHandlers.add(pending);
      pending.finally(() => activeHandlers.delete(pending)).catch(() => {});
      return pending;
    };
    await page.route(url, handler);
    let timer;
    try {
      await work();
      const result = await Promise.race([outcome, new Promise((_, no) => {
        timer = setTimeout(() => no(new Error('The original browser request remains retained after its response timeout.')),
          this.config.timeoutMs ?? 45000);
      })]);
      if (!loseResponse && Number.isSafeInteger(result.revision))
        await waitRevision(page, result.revision);
      return result;
    } finally {
      clearTimeout(timer); await page.unroute(url, handler);
      // Retain the operation lease until every dispatched handler has finished
      // its native-result/file publication, including a timed-out caller.
      await Promise.allSettled([...activeHandlers]);
    }
  }
  async validateActions(api = this.api) {
    const root = join(this.output, 'actions');
    if (!await exists(root)) return;
    for (const item of await readdir(root, { withFileTypes: true })) {
      check(item.isDirectory() && !item.isSymbolicLink(), 'The action journal changed shape.');
      const action = await this.saved('actions/' + item.name + '/input.json');
      if (!action) continue;
      const workspace = api.openWorkspace(member(this.output, action.directory), { create: false });
      try {
        const actual = this.verifyOperation(action, workspace);
        const result = await this.saved('actions/' + item.name + '/result.json');
        if (result) { check(actual, 'An original completed operation is absent.'); equal(result.operation, actual, 'An original completed operation changed.'); }
      } finally { workspace.close(); }
    }
  }
}
async function waitRevision(page, revision) {
  await page.waitForFunction(expected => {
    const value = document.getElementById('workspace-revision')?.textContent ?? '';
    const match = /Edition\s+(\d+)\b/.exec(value);
    return match && Number(match[1]) >= expected;
  }, revision);
  await page.locator('.pending-status').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.getElementById('main')?.getAttribute('aria-busy') === 'false');
}

export async function runGISCommissioning(config) {
  check(config && typeof config === 'object' && !Array.isArray(config), 'Supply the original geographic configuration.');
  check(Number(process.versions.node.split('.')[0]) >= 24, 'Use the selected Node 24 or later runtime.');
  const product = await realpath(resolve(config.gisProduct ?? config.product));
  const sourceRoot = await realpath(resolve(config.sourceRoot ?? join(product, '../../../../..')));
  let output = resolve(config.output);
  const mode = config.mode ?? 'run';
  check(['run', 'inspect'].includes(mode), 'Choose run or inspect for this same customer operation.');
  check(output !== sourceRoot && !output.startsWith(sourceRoot + sep), 'Keep the mutable customer output outside its selected source tree.');
  if (mode === 'inspect') check(await exists(output), 'Select the original completed output for inspection.');
  else await mkdir(output, { recursive: true, mode: 0o700 });
  output = await realpath(output);
  check(output !== sourceRoot && !output.startsWith(sourceRoot + sep), 'Keep customer output outside the actual selected source tree.');
  const lease = await acquireLease(output, config.flockExecutable ?? 'flock');
  let programme, browser, sender, receiver, provider, reopened, attemptStarted;
  try {
    const savedInput = await optionalJSON(join(output, 'INPUT.json'));
    if (!savedInput) {
      const entries = await readdir(output);
      check(entries.every(name => name === '.operation.lock' || /^\.(INPUT|RUN)\.json\.[a-f0-9-]+\.pending$/.test(name)),
        'This output has prior work without the new continuation binding. Preserve it and select its original source/operation.');
    }
    const source = await sourceInventory(sourceRoot);
    const driver = await regularBytes(fileURLToPath(import.meta.url));
    const api = await import(pathToFileURL(join(product, 'index.mjs')));
    const { canonical } = await import(pathToFileURL(join(product, 'shared.mjs')));
    equal(JSON.parse(stable({ nested: { z: 1, a: 2 }, rows: [1, null, true] })),
      JSON.parse(canonical({ nested: { z: 1, a: 2 }, rows: [1, null, true] })), 'The native canonical JSON contract changed.');
    const inputDefinitions = [
      { name: 'Boston original created-case collection', filename: 'created-collection.json', expectedRows: 84 },
      { name: 'Boston original updated-case collection', filename: 'updated-collection.json', expectedRows: 21 },
      { name: 'Boston original empty updated period', filename: 'empty-updated-collection.json', expectedRows: 0 },
      { name: 'Boston combined source service report', filename: 'combined-observed-report-package.json', expectedRows: 104 }
    ];
    const originals = [];
    for (const [index, definition] of inputDefinitions.entries()) {
      const frozen = join(output, 'inputs', definition.filename), selected = savedInput?.inputs?.[index];
      const externalRoot = index === 3 ? config.reportingOutput ?? (config.collectionOutput ? join(config.collectionOutput, 'reporting') : null) : config.collectionOutput;
      const external = externalRoot ? resolve(externalRoot, definition.filename) : null;
      const bytes = await exists(frozen) ? await regularBytes(frozen) :
        external ? await regularBytes(external) : null;
      check(bytes, 'The complete original input is required: ' + definition.filename);
      if (external && await exists(external)) check((await regularBytes(external)).equals(bytes),
        'The selected input differs from the retained original: ' + definition.filename);
      const item = { ...definition, path: frozen, originalText: bytes.toString('utf8'), bytes: bytes.length, sha256: sha(bytes), body: bytes };
      if (selected) check(selected.filename === item.filename && selected.bytes === item.bytes && selected.sha256 === item.sha256,
        'The retained input differs from its original selection.');
      if (index === 3) {
        const bundle = JSON.parse(item.originalText), candidate = config.reportId ?? selected?.reportId ?? bundle.selectedReportId;
        const reports = bundle.records.filter(record => record.kind === 'report' && record.value.rows.length === 104);
        check(candidate || reports.length === 1, 'Choose the exact combined Boston report from this complete package.');
        item.reportId = candidate ?? reports[0].id;
      }
      const inspected = api.inspectSource(item.originalText, item.reportId ? { reportId: item.reportId } : {});
      check(inspected.summary?.rows === item.expectedRows, 'The original source population differs: ' + item.name);
      item.inspection = inspected; originals.push(item);
    }
    const input = {
      schema: CONTINUATION_SCHEMA, product: relative(sourceRoot, product).split(sep).join('/'),
      source, driver: { bytes: driver.length, sha256: sha(driver) },
      edition: config.edition ?? savedInput?.edition ?? null,
      sourceFiles: config.sourceFiles ?? savedInput?.sourceFiles ?? [],
      inputs: originals.map(({ name, filename, bytes, sha256, reportId, expectedRows }) =>
        ({ name, filename, bytes, sha256, ...(reportId ? { reportId } : {}), expectedRows }))
    };
    if (savedInput) equal(savedInput, input, 'Preserve the exact original source, inputs and selected report for this programme.');
    else await publish(join(output, 'INPUT.json'), input);
    for (const item of originals) await publish(item.path, item.body);
    const run = await envelope(join(output, 'RUN.json'), { schema: CONTINUATION_SCHEMA, runId: randomUUID(),
      inputSha256: sha(stable(input)), startedAt: timestamp(), node: process.version,
      origin: await directoryIdentity(output), selectedSourceDirectory: sourceRoot });
    check(run.schema === CONTINUATION_SCHEMA && run.inputSha256 === sha(stable(input)),
      'The original operation identity belongs to another selected source.');
    programme = new Programme(output, input, run, api, config, lease);
    programme.nativeCanonical = canonical;
    const prior = await optionalJSON(join(output, 'journey.json'));
    if (prior) {
      check(prior.state === 'passed' && prior.runId === run.runId && prior.inputSha256 === run.inputSha256,
        'Preserve the original geographic result.');
      for (const file of prior.files) await verifyDescriptor(output, file);
      for (const item of prior.workspaces) {
        const baselineBytes = await verifyDescriptor(output, prior.files.find(file => file.name === item.baseline));
        const baseline = api.validateWorkspacePackage(baselineBytes.toString('utf8'), { directory: output });
        const workspace = api.openWorkspace(member(output, item.directory), { create: false });
        try {
          const current = workspace.workspaceExport();
          api.validateWorkspacePackage(json(current), { directory: output });
          containsPackage(current, baseline, 'The received ' + item.role + ' workspace');
        }
        finally { workspace.close(); }
      }
      await programme.validateActions(api);
      console.log('OPEN311_GIS_COMPLETE ' + JSON.stringify({ state: prior.state, output, runId: prior.runId, reused: true,
        phases: prior.phases.length, files: prior.files.length, laterRecipientWork: 'preserved' }));
      return prior;
    }
    check(mode !== 'inspect', 'This original programme is incomplete; use run to continue its retained actions.');
    equal(await directoryIdentity(output), run.origin, 'An incomplete operation must continue in its original physical output directory.');
    for (const name of ['inputs', 'downloads', 'screenshots', 'merchant-exports', 'workspaces'])
      await mkdir(join(output, name), { recursive: true, mode: 0o700 });
    attemptStarted = timestamp();
    await envelope(join(programme.attemptRoot, 'started.json'), programme.bound({ attemptId: programme.attempt,
      startedAt: attemptStarted, node: process.version, origin: run.origin }));
    await programme.validateActions(api);
    const save = (...args) => programme.save(...args);
    const recordFile = (...args) => programme.recordFile(...args);
    const phase = (...args) => programme.phase(...args);
    const once = (...args) => programme.once(...args);
    for (const item of originals) await recordFile('inputs/' + item.filename, 'application/json');
    const originalCreated = JSON.parse(originals[0].originalText), originalUpdated = JSON.parse(originals[1].originalText);
    const originalRecords = new Map([...originalCreated.requests, ...originalUpdated.requests].map(row => [row.serviceRequestId, row]));
    check(originalRecords.size === 104, 'The original collections do not contain 104 distinct request identities.');

    async function screenshot(page, name) {
      const outputName = 'screenshots/' + name;
      await once('screenshot-' + name, async () => {
        if (!await exists(join(output, outputName))) {
          const bytes = await page.screenshot({ fullPage: true });
          await save(outputName, bytes, 'image/png');
        }
        const bytes = await recordFile(outputName, 'image/png');
        return { name: outputName, bytes: bytes.length, sha256: sha(bytes) };
      });
      await recordFile(outputName, 'image/png');
    }
    async function submitRead(page, pathname, work) {
      check(pathname === '/api/inspect-source', 'Only original source inspection uses this read helper.');
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === 'POST');
      responsePromise.catch(() => {});
      await work();
      const response = await responsePromise, body = await response.json();
      check(response.ok() && body.ok !== false, pathname + ': ' + json(body.error ?? body));
      return body.value ?? body;
    }
    async function navigate(page, view, selector) {
      await page.locator('.sidebar a[data-view="' + view + '"]').click();
      await page.waitForFunction(expected => document.querySelector('.sidebar [aria-current="page"]')?.getAttribute('data-view') === expected, view);
      await page.locator(selector).waitFor({ state: 'visible' });
    }
    async function download(page, locator, name, validate = null) {
      const result = await once('download-' + name.replaceAll('/', '--'), async () => {
        let bytes;
        if (await exists(join(output, name))) bytes = await regularBytes(join(output, name));
        else {
          const pending = page.waitForEvent('download');
          pending.catch(() => {});
          await locator.click();
          const file = await pending, problem = await file.failure();
          check(!problem, 'The browser could not download ' + name + ': ' + problem);
          const path = await file.path();
          check(path, 'The complete browser download has no retained local body.');
          bytes = await regularBytes(path);
          if (validate) await validate(bytes);
          await save(name, bytes);
        }
        if (validate) await validate(bytes);
        return { name, bytes: bytes.length, sha256: sha(bytes) };
      });
      await verifyDescriptor(output, result);
      return recordFile(name);
    }
    async function importBrowserSource(page, item, index) {
      const result = await programme.action('source-' + index, page, sender, '/api/import', async () => {
        await navigate(page, 'sources', '#source-form');
        const inspected = await submitRead(page, '/api/inspect-source',
          () => page.locator('#source-file').setInputFiles(item.path));
        if (item.reportId && inspected.selectedReportId !== item.reportId)
          await submitRead(page, '/api/inspect-source', () => page.locator('#source-report').selectOption(item.reportId));
        await page.locator('#source-form input[name="name"]').fill(item.name);
        await page.locator('#source-form button[type="submit"]').click();
      });
      return result.source;
    }
    async function makeHandoff(page, server, key, name, sourceIds, predecessorId = '') {
      const result = await programme.action(key, page, server, '/api/handoff', async () => {
        await navigate(page, 'packages', '#handoff-form');
        await page.locator('#handoff-form input[name="name"]').fill(name);
        await page.locator('#handoff-form select[name="predecessorId"]').selectOption(predecessorId);
        const values = await page.locator('#handoff-form input[name="sourceIds"]').evaluateAll(nodes => nodes.map(node => node.value));
        for (const id of values)
          await page.locator('#handoff-form input[name="sourceIds"][value="' + id + '"]').setChecked(sourceIds.includes(id));
        await page.locator('#handoff-form button[type="submit"]').click();
      });
      return result.handoff;
    }
  async function selectCases(page, handoffId, keys) {
    await navigate(page, 'cases', '#case-handoff');
    await page.locator('#case-handoff').selectOption(handoffId);
    await page.waitForFunction(id => {
      const rows = document.querySelectorAll('#main [data-action="case-detail"]');
      return rows.length > 0 && [...rows].every(row => row.dataset.handoffId === id);
    }, handoffId);
    await page.locator('[data-action="clear-selection"]').click();
    const requested = new Set(keys), selected = new Set();
    for (;;) {
      const visible = await page.locator('#main [data-select-key]').evaluateAll(nodes => nodes.map(node => node.dataset.selectKey));
      for (const key of visible) if (requested.has(key)) {
        await page.locator('[data-select-key="' + key + '"]').setChecked(true); selected.add(key);
      }
      const next = page.locator('[data-action="page-next"]');
      if (await next.isDisabled()) break;
      const before = await page.locator('.table-footer > span').innerText();
      await next.click();
      await page.waitForFunction(previous => document.querySelector('.table-footer > span')?.textContent !== previous, before);
    }
    equal([...selected].sort(), [...requested].sort(), 'The browser selection omitted a case on another page.');
    const count = await page.locator('.table-toolbar > span').innerText();
    check(count.startsWith(String(keys.length) + ' selected'), 'The browser did not retain the full selection across pages.');
  }

    const senderDirectory = join(output, 'sender-workspace'), receiverDirectory = join(output, 'receiver-workspace');
    const browserResult = await once('browser-complete', async () => {
      await programme.workspace('sender');
      const receiverBinding = await programme.workspace('receiver');
      sender = await api.serveGIS({ directory: senderDirectory });
      receiver = await api.serveGIS({ directory: receiverDirectory });
      const originalReceiverId = receiverBinding.initialWorkspaceId;
      await programme.retain('attempts/' + programme.attempt + '/native-desks.json',
        { sender: sender.startup, receiver: receiver.startup, openedAt: timestamp() });
      const playwright = await import(pathToFileURL(config.playwrightModule));
      const { chromium } = playwright.default ?? playwright;
      browser = await chromium.launch({ executablePath: config.chromiumExecutablePath, headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(config.timeoutMs ?? 45000);
      page.on('pageerror', error => programme.browserErrors.push({ page: 'sender', message: error.message, stack: error.stack }));
      await page.goto(sender.url, { waitUntil: 'domcontentloaded' });
      await page.locator('#main h1').filter({ hasText: 'Geographic handoff' }).waitFor();
      const imported = [];
      for (const [index, item] of originals.entries()) imported.push(await importBrowserSource(page, item, index));
      equal(imported.map(source => source.counts.rows), [84, 21, 0, 104], 'The browser imported a different source population.');
      for (const source of imported) {
        const original = originals.find(item => item.sha256 === source.sha256);
        check(original && sender.workspace.source(source.id).originalText === original.originalText,
          'A saved geographic source changed its original bytes.');
      }
      await once('original-source-reading', async () => {
        await navigate(page, 'sources', '#source-form');
        await screenshot(page, '01-original-sources.png');
      });
      await phase('original-city-and-report-import', { sources: imported.map(source =>
        ({ id: source.id, name: source.name, rows: source.counts.rows, sha256: source.sha256 })) });

      const selectedSourceIds = imported.slice(0, 3).map(source => source.id);
      const originalHandoff = await makeHandoff(page, sender, 'collection-handoff', 'Boston geographic service review', selectedSourceIds);
      check(originalHandoff.counts.rows === 104 && originalHandoff.counts.located === 104,
        'The original combined handoff lost real case identities or locations.');
      const reportHandoff = await makeHandoff(page, sender, 'report-handoff', 'Boston report-derived geographic handoff', [imported[3].id]);
      const reportRows = sender.workspace.handoff({ id: reportHandoff.id, limit: 1000 }).items;
      check(reportRows.length === 104 && reportRows.every(row => row.reportContext?.reportId === originals[3].reportId),
        'The report-derived handoff lost its selected report context.');
      const sourceRows = sender.workspace.handoff({ id: originalHandoff.id, limit: 1000 }).items;
      for (const row of sourceRows) {
        check(originalRecords.has(row.serviceRequestId), 'A geographic row has no original municipal case.');
        check(row.geometry?.type === 'Point' && row.geometry.coordinates[0] === Number(row.source.long) &&
          row.geometry.coordinates[1] === Number(row.source.lat), 'The geographic point differs from the original longitude/latitude.');
      }
      const editRows = [sourceRows[0], sourceRows.at(-1), sourceRows[1]], keys = editRows.map(row => row.key);
      check(new Set(keys).size === 3, 'Choose three distinct original cases for the internal analyst work.');
      await once('original-map-and-case-reading', async () => {
        await navigate(page, 'cases', '#case-handoff');
        await page.locator('#case-handoff').selectOption(originalHandoff.id);
        await page.waitForFunction(id => document.querySelector('#main [data-action="case-detail"]')?.dataset.handoffId === id, originalHandoff.id);
        check(await page.locator('#main table tbody tr').count() === 100, 'The first source page does not contain 100 of 104 cases.');
        const withNotes = sourceRows.find(row => row.sourceStatusNotes);
        check(withNotes, 'The original Boston selection has no retained source status note.');
        const searched = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === '/api/handoff' && url.searchParams.get('q') === withNotes.serviceRequestId;
        });
        searched.catch(() => {});
        await page.locator('#case-query').fill(withNotes.serviceRequestId);
        const searchValue = await (await searched).json();
        check(searchValue.value.items.some(row => row.key === withNotes.key), 'The actual source search did not return its original case.');
        await page.locator('[data-action="case-detail"][data-key="' + withNotes.key + '"]').click();
        await page.locator('#detail-dialog').waitFor({ state: 'visible' });
        check((await page.locator('#detail-content').innerText()).includes(withNotes.sourceStatusNotes), 'The case panel lost the source closure note.');
        await screenshot(page, '02-original-case-detail.png');
        await page.locator('#close-detail').click();
        await page.locator('#case-query').fill('');
        await page.waitForFunction(() => document.querySelectorAll('#main table tbody tr').length === 100);
        await screenshot(page, '03-map-and-cases.png');
        return { caseId: withNotes.serviceRequestId, rowsOnFirstPage: 100, completeRows: sourceRows.length };
      });
      await navigate(page, 'packages', '#handoff-form');
      const gpkgBytes = await download(page,
        page.locator('[data-action="export"][data-kind="gpkg"][data-handoff-id="' + originalHandoff.id + '"]'),
        'downloads/boston-analyst-original.gpkg', bytes => {
          const decoded = api.readGeoPackage(bytes, { directory: output });
          check(decoded.rows.length === 104 && decoded.metadata.handoffId === originalHandoff.id,
            'The original geographic download has a different handoff or population.');
        });
      const returnedPath = join(output, 'inputs', 'boston-analyst-return.gpkg');
      const analystSelection = { source: { bytes: gpkgBytes.length, sha256: sha(gpkgBytes) }, handoffId: originalHandoff.id,
        cases: editRows.map((row, index) => ({ key: row.key, serviceRequestId: row.serviceRequestId,
          assignedTeam: 'TJLabs internal commissioning desk', workOrderId: 'TJL-GIS-' + row.serviceRequestId,
          priority: index === 2 ? 'review' : 'normal', action: index === 2 ? 'defer' : 'dispatch',
          note: 'Internal commissioning assignment for the retained original case. Source geography and source disposition remain attached.' })) };
      await save('analyst-selection.json', analystSelection);
      const analystFile = await once('native-analyst-file', async () => {
        if (!await exists(returnedPath)) {
          const temporary = join(output, 'inputs', '.analyst-' + randomUUID() + '.pending');
          await copyFile(join(output, 'downloads', 'boston-analyst-original.gpkg'), temporary, constants.COPYFILE_EXCL);
          const edited = new DatabaseSync(temporary);
          try {
            const statement = edited.prepare('UPDATE open311_features SET assigned_team=?,work_order_id=?,priority=?,action=?,analyst_note=? WHERE feature_key=?');
            edited.exec('BEGIN IMMEDIATE');
            for (const row of analystSelection.cases) {
              const result = statement.run(row.assignedTeam, row.workOrderId, row.priority, row.action, row.note, row.key);
              check(Number(result.changes) === 1, 'The native geographic edit did not select exactly one original feature.');
            }
            edited.exec('COMMIT');
          } catch (error) { try { edited.exec('ROLLBACK'); } catch {} throw error; }
          finally { edited.close(); }
          await save('inputs/boston-analyst-return.gpkg', await regularBytes(temporary), 'application/geopackage+sqlite3');
          await unlink(temporary);
        }
        const bytes = await regularBytes(returnedPath), decoded = api.readGeoPackage(bytes, { directory: output });
        check(decoded.rows.length === 104 && decoded.metadata.handoffId === originalHandoff.id, 'The saved analyst file changed its original source scope.');
        const edited = new DatabaseSync(returnedPath, { readOnly: true });
        try {
          for (const row of analystSelection.cases) {
            const actual = edited.prepare('SELECT assigned_team,work_order_id,priority,action,analyst_note FROM open311_features WHERE feature_key=?').get(row.key);
            equal(actual && { ...actual }, { assigned_team: row.assignedTeam, work_order_id: row.workOrderId,
              priority: row.priority, action: row.action, analyst_note: row.note }, 'The saved analyst assignment changed.');
          }
        } finally { edited.close(); }
        return { name: 'inputs/boston-analyst-return.gpkg', bytes: bytes.length, sha256: sha(bytes) };
      });
      await verifyDescriptor(output, analystFile);
      await recordFile('inputs/boston-analyst-return.gpkg', 'application/geopackage+sqlite3');
      await phase('complete-gis-handoff-and-native-analyst-file', { originalHandoff, reportHandoff,
        originalCaseCount: sourceRows.length, selectedOriginalCases: editRows.map(row => row.serviceRequestId) });

      const receivedReturn = await programme.action('analyst-return', page, sender, '/api/return', async () => {
        await navigate(page, 'review', '#return-form');
        await page.locator('#return-form select[name="handoffId"]').selectOption(originalHandoff.id);
        await page.locator('#return-form input[name="analyst"]').fill('TJLabs GIS commissioning operator');
        await page.locator('#return-form input[name="name"]').fill('Boston retained-source dispatch review');
        await page.locator('#return-file').setInputFiles(returnedPath);
        await page.locator('#return-form button[type="submit"]').click();
      });
      const returned = sender.workspace.returned(receivedReturn.returned.id);
      equal(returned.summary.counts, { changes: 3, conflicts: 0, missing: 0, unchanged: 101 }, 'The analyst return did not isolate the three actual edits.');
      const changes = editRows.map(row => returned.changes.find(change => change.key === row.key));
      check(changes.every(Boolean), 'A returned native edit has no source-linked proposal.');
      async function openReview() {
        await navigate(page, 'review', '#return-form');
        await page.locator('#return-selection').selectOption(returned.summary.id);
        await page.locator('[data-action="export"][data-kind="returned"][data-return-id="' + returned.summary.id + '"]').waitFor({ state: 'visible' });
        await page.locator('#decision-form').waitFor({ state: 'visible' });
      }
      const firstDecision = await programme.action('review-first', page, sender, '/api/decision', async () => {
        await openReview();
        await page.locator('[data-review-choice="' + changes[0].id + '"]').selectOption('accept');
        await page.locator('[data-review-choice="' + changes[2].id + '"]').selectOption('reject');
        await page.locator('#decision-form input[name="reviewer"]').fill('TJLabs commissioning reviewer');
        await page.locator('#decision-form textarea[name="note"]').fill('Accept the first internal dispatch assignment; retain the deferred proposal as rejected.');
        await page.locator('#decision-form button[type="submit"]').click();
      });
      check(firstDecision.decision.accepted === 1 && firstDecision.decision.rejected === 1, 'The first partial review selected different proposals.');
      await once('pending-review-choice-reopen', async () => {
        await openReview();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-review-choice="' + changes[1].id + '"]').waitFor();
        check(await page.locator('[data-review-choice]').count() === 1, 'Saved proposals remained selectable after a partial review.');
        await screenshot(page, '04-partial-review-history.png');
        await page.locator('[data-review-choice="' + changes[1].id + '"]').selectOption('accept');
        await page.waitForFunction(async ({ directory, returnId, changeId }) => {
          const db = await new Promise((resolveResult, reject) => {
            const opening = indexedDB.open('open311-geographic-handoff', 1);
            opening.onsuccess = () => resolveResult(opening.result); opening.onerror = () => reject(opening.error);
          });
          try {
            const draft = await new Promise((resolveResult, reject) => {
              const reading = db.transaction('saved').objectStore('saved').get('drafts:directory:' + directory);
              reading.onsuccess = () => resolveResult(reading.result); reading.onerror = () => reject(reading.error);
            });
            return draft?.decision?.reviewChoices?.returnId === returnId && draft.decision.reviewChoices.values?.[changeId] === 'accept';
          } finally { db.close(); }
        }, { directory: senderDirectory, returnId: returned.summary.id, changeId: changes[1].id });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-review-choice="' + changes[1].id + '"]').waitFor();
        check(await page.locator('[data-review-choice="' + changes[1].id + '"]').inputValue() === 'accept',
          'The original pending reviewer choice did not survive reload.');
        return { returnId: returned.summary.id, acceptedChoiceId: changes[1].id, savedInOriginalBrowserStore: true };
      });
      const secondDecision = await programme.action('review-second', page, sender, '/api/decision', async () => {
        await openReview();
        // A new browser after a parent loss has its own storage. Re-select the
        // same explicit remaining choice; the first original reload is retained.
        await page.locator('[data-review-choice="' + changes[1].id + '"]').selectOption('accept');
        await page.locator('#decision-form input[name="reviewer"]').fill('TJLabs commissioning reviewer');
        await page.locator('#decision-form textarea[name="note"]').fill('Accept the remaining original dispatch assignment after the retained partial review.');
        await page.locator('#decision-form button[type="submit"]').click();
      });
      const reviewedHandoff = secondDecision.handoff;
      check(reviewedHandoff.counts.dispatchReady === 2, 'The final review did not retain exactly two dispatch-ready cases.');
      const finalReturn = sender.workspace.returned(returned.summary.id);
      check([firstDecision, secondDecision].every(result => finalReturn.decisions.some(decision => decision.id === result.decision.id)),
        'The complete original analyst review history was not retained.');
      await phase('partial-review-and-persistent-operator-choice', { returnId: returned.summary.id,
        originalFileSha256: returned.summary.sha256, decisions: [firstDecision.decision, secondDecision.decision], reviewedHandoff });

      const mapping = [
        { name: 'request', field: 'serviceRequestId' }, { name: 'assigned_team', field: 'assignedTeam' },
        { name: 'work_order', field: 'workOrderId' }, { name: 'longitude', field: 'longitude' },
        { name: 'latitude', field: 'latitude' }, { name: 'source_status', field: 'sourceStatus' },
        { name: 'source_notes', field: 'sourceStatusNotes' }, { name: 'operator_note', field: 'note' }
      ];
      const madeDispatch = await programme.action('reviewed-dispatch', page, sender, '/api/dispatch', async () => {
        await selectCases(page, reviewedHandoff.id, keys.slice(0, 2));
        await navigate(page, 'dispatch', '#dispatch-form');
        await page.locator('#dispatch-form input[name="name"]').fill('Boston internal commissioning dispatch');
        await page.locator('#dispatch-form select[name="handoffId"]').selectOption(reviewedHandoff.id);
        await page.locator('#dispatch-form input[name="destination"]').fill('TJLabs receiving desk');
        await page.locator('#dispatch-form select[name="scope"]').selectOption('selected');
        await page.locator('#dispatch-form textarea[name="note"]').fill('Complete internal operating handover from two accepted original-case assignments.');
        await page.locator('#dispatch-form details').evaluate(node => { node.open = true; });
        await page.locator('#dispatch-form textarea[name="columns"]').fill(json(mapping));
        await page.locator('#dispatch-form button[type="submit"]').click();
      });
      const dispatch = sender.workspace.dispatch(madeDispatch.dispatch.id);
      equal(dispatch.rows.map(row => row.key).sort(), keys.slice(0, 2).sort(), 'The dispatch lost its cross-page selected cases.');
      equal(dispatch.definition.columns, mapping, 'The saved destination mapping differs from the operator selection.');
      await navigate(page, 'dispatch', '#dispatch-form');
      await page.locator('#dispatch-selection').selectOption(dispatch.summary.id);
      await page.locator('[data-action="export"][data-kind="csv"][data-dispatch-id="' + dispatch.summary.id + '"]').waitFor({ state: 'visible' });
      const dispatchFiles = {};
      for (const kind of ['gpkg', 'geojson', 'csv', 'json', 'html']) {
        const body = await download(page,
          page.locator('[data-action="export"][data-kind="' + kind + '"][data-dispatch-id="' + dispatch.summary.id + '"]'),
          'downloads/boston-dispatch.' + kind, bytes => {
            if (kind === 'gpkg') {
              const decoded = api.readGeoPackage(bytes, { directory: output });
              check(decoded.rows.length === 2, 'The dispatch GeoPackage lost a selected row.');
              equal(decoded.rows.map(row => row.properties.feature_key).sort(),
                [...keys.slice(0, 2)].sort(), 'The dispatch GeoPackage changed its selected feature identities.');
            } else {
              const expected = sender.workspace.exportFile({ kind, dispatchId: dispatch.summary.id }).body;
              check(bytes.equals(Buffer.from(expected)), 'The complete browser dispatch differs from its saved native edition: ' + kind);
            }
          });
        dispatchFiles[kind] = { bytes: body.length, sha256: sha(body) };
      }
      const csvRows = api.csvDecode((await regularBytes(join(output, 'downloads', 'boston-dispatch.csv'))).toString('utf8'));
      check(csvRows.length === 2 && csvRows.every(row => row.feature_key && row.source_sha256 && row.handoff_id && row.handoff_sha256),
        'The mapped dispatch CSV lost its original case identities.');
      await screenshot(page, '05-reviewed-dispatch.png');
      const senderPackageBytes = await download(page, page.locator('#download-workspace'), 'downloads/boston-complete-gis-workspace.json', bytes => {
        const bundle = api.validateWorkspacePackage(bytes.toString('utf8'), { directory: output });
        const recordedSources = new Set(bundle.records.filter(record => record.kind === 'source').map(record => record.value.sha256));
        check(originals.every(item => recordedSources.has(item.sha256)), 'The complete workspace lost an original municipal or reporting file.');
        containsPackage(sender.workspace.workspaceExport(), bundle, 'The sender export');
        check(bundle.records.some(record => record.kind === 'dispatch' && record.id === dispatch.summary.id),
          'The sender workspace export omitted the original dispatch.');
      });
      const senderPackage = JSON.parse(senderPackageBytes.toString('utf8'));
      await phase('mapped-reviewed-dispatch-and-complete-exports', { dispatch: dispatch.summary, mapping,
        files: dispatchFiles, workspaceBytes: senderPackageBytes.length, workspaceSha256: sha(senderPackageBytes) });

      const receivingPage = await context.newPage();
      receivingPage.setDefaultTimeout(config.timeoutMs ?? 45000);
      receivingPage.on('pageerror', error => programme.browserErrors.push({ page: 'receiver', message: error.message, stack: error.stack }));
      await receivingPage.goto(receiver.url, { waitUntil: 'domcontentloaded' });
      const wasRetained = Boolean(await programme.saved('actions/browser-receiving/input.json'));
      const committedReceiving = await programme.action('browser-receiving', receivingPage, receiver, '/api/receive', async () => {
        await navigate(receivingPage, 'receiving', '#receiving-form');
        await receivingPage.locator('#receiving-file').setInputFiles(join(output, 'downloads', 'boston-complete-gis-workspace.json'));
        await receivingPage.locator('#receiving-form button[type="submit"]').click();
      }, { loseResponse: true });
      const receivingAction = await programme.saved('actions/browser-receiving/input.json');
      const receivingRequest = { requestId: receivingAction.input.requestId, expectedRevision: receivingAction.input.expectedRevision };
      const recovery = await once('browser-receiving-recovery', async () => {
        const observedLoss = await programme.saved('actions/browser-receiving/response-loss.json');
        if (!wasRetained && observedLoss) await receivingPage.locator('.pending-status').waitFor({ state: 'visible' });
        check(committedReceiving.workspaceId === senderPackage.workspaceId,
          'The actual receiving action did not adopt its original incoming workspace.');
        check(receiver.workspace.state().workspaceId !== originalReceiverId,
          'The receiving directory did not adopt the incoming original workspace identity.');
        await receivingPage.reload({ waitUntil: 'domcontentloaded' });
        await waitRevision(receivingPage, committedReceiving.revision);
        const recovered = programme.verifyOperation(receivingAction, receiver.workspace);
        equal(recovered.result, committedReceiving, 'Reload recovery returned a different receiving action.');
        check(!Object.hasOwn(recovered.input, 'originalText') && recovered.input.originalFile?.sha256 === sha(senderPackageBytes),
          'The received operation did not retain its compact complete-file identity.');
        containsPackage(receiver.workspace.workspaceExport(), senderPackage, 'The independently received workspace');
        await navigate(receivingPage, 'overview', '#main h1');
        await screenshot(receivingPage, '06-received-workspace.png');
        return { request: receivingRequest, operation: recovered,
          responseExercise: observedLoss?.outcome ?? 'parent-interruption-received-through-original-operation',
          browserRecovery: !wasRetained && observedLoss ? 'original-browser-outbox-reload' : 'fresh-browser-original-operation-read' };
      });
      const continued = await makeHandoff(receivingPage, receiver, 'recipient-continued-handoff',
        'Receiving desk continued Boston review', selectedSourceIds, reviewedHandoff.id);
      check(continued.counts.rows === 104 && continued.counts.dispatchReady === 2,
        'The receiving operator could not continue the complete reviewed handoff.');
      const receivedBytes = await download(receivingPage, receivingPage.locator('#download-workspace'),
        'downloads/boston-received-editable-workspace.json', bytes => {
          const bundle = api.validateWorkspacePackage(bytes.toString('utf8'), { directory: output });
          containsPackage(bundle, senderPackage, 'The continued recipient export');
          containsPackage(receiver.workspace.workspaceExport(), bundle, 'The current recipient workspace');
          check(bundle.records.some(record => record.kind === 'handoff' && record.id === continued.id),
            'The recipient export omitted its actual continued handoff.');
        });
      await phase('browser-receive-response-recovery-and-continued-work', { originalInitializationId: originalReceiverId,
        workspaceId: receiver.workspace.state().workspaceId, receivingRequest, receivingOperation: recovery.operation.result,
        compactInput: recovery.operation.input, responseExercise: recovery.responseExercise,
        browserRecovery: recovery.browserRecovery, continuedHandoff: continued, receivedBytes: receivedBytes.length });
      check(programme.browserErrors.length === 0, 'The actual browser reported an application error.');
      await browser.close(); browser = null;
      await receiver.close(); receiver = null;
      await sender.close(); sender = null;
      return { imported, originalHandoff, reportHandoff, selectedSourceIds, editRows, reviewedHandoff,
        dispatch, mapping, continued, receivingRequest, recovery, originalReceiverId,
        senderPackageFile: 'downloads/boston-complete-gis-workspace.json',
        receivedPackageFile: 'downloads/boston-received-editable-workspace.json',
        browserErrors: [] };
    });
    const { dispatch, continued } = browserResult;
    const senderPackageBytes = await regularBytes(join(output, browserResult.senderPackageFile));
    const senderPackage = JSON.parse(senderPackageBytes.toString('utf8'));
    const receivedBytes = await regularBytes(join(output, browserResult.receivedPackageFile));
    const preceding = api.validateWorkspacePackage(receivedBytes.toString('utf8'), { directory: output });
    await once('independent-recipient-reopen', async () => {
      reopened = api.openWorkspace(receiverDirectory, { create: false });
      try {
        equal(reopened.dispatch(dispatch.summary.id).rows, dispatch.rows, 'Independent native reopen changed the accepted dispatch rows.');
        check(reopened.handoff({ id: continued.id, limit: 1000 }).items.length === 104, 'Independent reopen lost the continued case population.');
        containsPackage(reopened.workspaceExport(), preceding, 'The independently reopened recipient');
        const name = 'downloads/boston-reopened-workspace.json';
        const bytes = await exists(join(output, name)) ? await regularBytes(join(output, name)) :
          Buffer.from(reopened.exportFile({ kind: 'workspace' }).body);
        const bundle = api.validateWorkspacePackage(bytes.toString('utf8'), { directory: output });
        containsPackage(bundle, preceding, 'The retained reopen export');
        containsPackage(reopened.workspaceExport(), bundle, 'The current reopened recipient');
        await save(name, bytes);
        return { name, workspaceId: bundle.workspaceId, revision: bundle.revision, bytes: bytes.length, sha256: sha(bytes) };
      } finally { reopened.close(); reopened = null; }
    });

    await programme.workspace('cli-received');
    const cliDirectory = join(output, 'cli-received-workspace');
    const cliIntent = await programme.retain('cli/receiving-input.json', { requestId: randomUUID(), expectedRevision: 0,
      directory: 'cli-received-workspace', originalFile: { name: browserResult.receivedPackageFile,
        bytes: receivedBytes.length, sha256: sha(receivedBytes) }, createdAt: timestamp() });
    equal({ directory: cliIntent.directory, expectedRevision: cliIntent.expectedRevision, originalFile: cliIntent.originalFile },
      { directory: 'cli-received-workspace', expectedRevision: 0, originalFile: {
        name: browserResult.receivedPackageFile, bytes: receivedBytes.length, sha256: sha(receivedBytes) } },
      'The original CLI receiving selection changed.');
    const cliResult = await once('original-cli-receiving', async () => {
      const input = { requestId: cliIntent.requestId, expectedRevision: cliIntent.expectedRevision, originalText: receivedBytes.toString('utf8') };
      const action = { input, pathname: '/api/receive' };
      let workspace = api.openWorkspace(cliDirectory, { create: false }), actual;
      try { actual = programme.verifyOperation(action, workspace); } finally { workspace.close(); }
      if (!actual) {
        const command = [join(product, 'cli.mjs'), 'receive', '--workspace', cliDirectory,
          '--file', join(output, browserResult.receivedPackageFile), '--request-id', cliIntent.requestId, '--expected-revision', '0'];
        const execution = await execute(process.execPath, command, { lease, maxBuffer: 2 * 1024 * 1024 });
        const value = JSON.parse(execution.stdout);
        await programme.retain('cli/receiving-command.json', { command: [process.execPath, ...command],
          stdout: execution.stdout, stderr: execution.stderr, code: execution.code, observedAt: timestamp() });
        workspace = api.openWorkspace(cliDirectory, { create: false });
        try { actual = programme.verifyOperation(action, workspace); } finally { workspace.close(); }
        check(actual, 'The completed CLI has no original native receiving operation.');
        equal(actual.result, value, 'The actual CLI reply differs from its saved original operation.');
      }
      const result = await programme.retain('cli/receiving-result.json', { operation: actual, observedAt: timestamp(),
        receivedThrough: await exists(join(output, 'cli/receiving-command.json')) ? 'original-cli-return' : 'original-native-operation-after-parent-interruption' });
      equal(result.operation, actual, 'The original CLI receiving operation changed.');
      await save('cli-receiving-result.json', actual.result);
      return actual.result;
    });
    const cliSnapshot = await once('cli-recipient-reopen', async () => {
      reopened = api.openWorkspace(cliDirectory, { create: false });
      try {
        const current = reopened.workspaceExport();
        containsPackage(current, preceding, 'The command-line received workspace');
        check(current.workspaceId === senderPackage.workspaceId && current.revision >= preceding.revision + 1,
          'The command-line receiving hop did not preserve the original workspace and next edition.');
        const original = reopened.operation(cliIntent.requestId);
        check(original && original.result.revision === preceding.revision + 1, 'The original CLI receiving revision changed.');
        const name = 'downloads/boston-cli-received-workspace.json';
        const bytes = await exists(join(output, name)) ? await regularBytes(join(output, name)) : Buffer.from(reopened.exportFile({ kind: 'workspace' }).body);
        const bundle = api.validateWorkspacePackage(bytes.toString('utf8'), { directory: output });
        containsPackage(bundle, preceding, 'The retained CLI recipient export');
        containsPackage(current, bundle, 'The current CLI recipient');
        check(bundle.operations.some(operation => operation.requestId === cliIntent.requestId), 'The CLI export omitted its original receiving operation.');
        await save(name, bytes);
        return { name, workspaceId: bundle.workspaceId, revision: bundle.revision, bytes: bytes.length, sha256: sha(bytes) };
      } finally { reopened.close(); reopened = null; }
    });
    const thirdBytes = await verifyDescriptor(output, cliSnapshot);
    await phase('independent-reopen-and-installed-cli-receiving', { cliResult, senderBytes: senderPackageBytes.length,
      continuedReceivingBytes: receivedBytes.length, secondReceivingBytes: thirdBytes.length,
      secondReceivingGrowthBytes: thirdBytes.length - receivedBytes.length });

    const hostPath = join(output, 'merchant-gis-host.json');
    const { MerchantOpen311GISWorkspaces, readGISWorkspaceConfiguration } = await import(pathToFileURL(join(product, 'mcp.mjs')));
    const { Open311GISMerchantClient, GIS_HOST_SCHEMA } = await import(pathToFileURL(join(product, 'mcp-client.mjs')));
    await save('merchant-gis-host.json', { schema: GIS_HOST_SCHEMA, workspaces: {
      sender: { label: 'Boston original GIS operating desk', directory: senderDirectory, inputs: {} },
      recipient: { label: 'Boston received GIS operating desk', directory: cliDirectory, inputs: {
        original: { label: 'Complete original geographic handover', path: join(output, 'downloads', 'boston-complete-gis-workspace.json'),
          sha256: sha(senderPackageBytes), kind: 'workspace', format: 'json' }
      } }
    } });
    const merchantResult = await once('installed-merchant-receiving', async () => {
      const host = await readGISWorkspaceConfiguration(hostPath);
      provider = new MerchantOpen311GISWorkspaces({ open311GISWorkspaces: host, exportsDirectory: join(output, 'merchant-exports') });
      try {
        const client = new Open311GISMerchantClient((name, args) => provider.call(name, args), 'recipient');
        const status = await client.status(), completeRows = [];
        let offset = 0;
        for (;;) {
          const page = await client.handoff({ id: continued.id, expectedRevision: status.revision, offset, limit: 17 });
          completeRows.push(...page.items);
          if (page.nextOffset === null) break;
          check(page.nextOffset > offset, 'The original merchant cursor did not advance.');
          offset = page.nextOffset;
        }
        check(completeRows.length === 104 && new Set(completeRows.map(row => row.key)).size === 104,
          'The installed merchant client omitted an original source row across pages.');
        const file = await client.downloadFile({ kind: 'workspace', expectedRevision: status.revision }, { limit: 196608 });
        const bundle = api.validateWorkspacePackage(file.bytes.toString('utf8'), { directory: output });
        check(bundle.workspaceId === status.workspaceId && bundle.revision === status.revision,
          'The merchant download selected another native workspace revision.');
        containsPackage(bundle, JSON.parse(thirdBytes.toString('utf8')), 'The complete merchant recipient export');
        const mapped = await client.downloadFile({ kind: 'csv', dispatchId: dispatch.summary.id, expectedRevision: status.revision }, { limit: 4096 });
        check(mapped.bytes.equals(await regularBytes(join(output, 'downloads', 'boston-dispatch.csv'))),
          'The installed merchant export changed the reviewed destination file.');
        const recovered = await client.operation(cliIntent.requestId);
        check(recovered?.state === 'SUCCEEDED' && recovered.result.workspaceId === senderPackage.workspaceId,
          'The installed merchant client could not recover the existing CLI receiving operation.');
        equal(recovered.result, cliResult, 'The merchant result changed the original CLI receiving operation.');
        let name = 'downloads/boston-merchant-workspace.json';
        if (await exists(join(output, name)) && !(await regularBytes(join(output, name))).equals(file.bytes))
          name = 'downloads/boston-merchant-workspace-' + sha(file.bytes) + '.json';
        // Retain a later real recipient edition separately if an earlier export
        // was already published before a parent loss. Both remain reviewable.
        await save(name, file.bytes);
        const receipt = await programme.retain('merchant/observations/' + sha(file.bytes) + '.json', {
          status, file: { ...file.file, name, bytes: file.bytes.length, sha256: sha(file.bytes) },
          bytesRead: file.bytesRead, mapped: { bytesRead: mapped.bytesRead, sha256: sha(mapped.bytes) },
          recoveredOperation: recovered, observedAt: timestamp() });
        return { workspaceId: status.workspaceId, revision: status.revision, uniqueCases: completeRows.length,
          downloadedBytes: file.bytesRead, downloadedSha256: sha(file.bytes), name,
          dispatchCsvBytes: mapped.bytesRead, recoveredRequestId: cliIntent.requestId,
          originalObservation: 'merchant/observations/' + sha(file.bytes) + '.json',
          originalOperationCreatedAt: receipt.recoveredOperation.createdAt };
      } finally { await provider.close(); provider = null; }
    });
    const merchantBytes = await regularBytes(join(output, merchantResult.name));
    check(sha(merchantBytes) === merchantResult.downloadedSha256 && merchantBytes.length === merchantResult.downloadedBytes,
      'The completed original merchant export changed.');
    await phase('installed-merchant-paging-and-complete-file-receiving', merchantResult);

    const workspaceSelections = [
      { role: 'sender', directory: 'sender-workspace', baseline: browserResult.senderPackageFile },
      { role: 'receiver', directory: 'receiver-workspace', baseline: 'downloads/boston-reopened-workspace.json' },
      { role: 'cli-recipient', directory: 'cli-received-workspace', baseline: merchantResult.name }
    ];
    const workspaces = [];
    for (const selection of workspaceSelections) {
      const baseline = api.validateWorkspacePackage((await regularBytes(join(output, selection.baseline))).toString('utf8'), { directory: output });
      const workspace = api.openWorkspace(join(output, selection.directory), { create: false });
      try {
        const current = workspace.workspaceExport();
        api.validateWorkspacePackage(json(current), { directory: output });
        containsPackage(current, baseline, 'The final ' + selection.role + ' workspace');
        workspaces.push({ ...selection, workspaceId: current.workspaceId, baselineRevision: baseline.revision,
          revisionObservedAtCompletion: current.revision, mutable: true });
      } finally { workspace.close(); }
    }
    await programme.validateActions(api);
    equal(await sourceInventory(sourceRoot), input.source, 'The selected source changed during the geographic operation.');
    check(sha(await regularBytes(fileURLToPath(import.meta.url))) === input.driver.sha256,
      'The programme source changed while the original operation was running.');
    await save('PORTABLE.md', [
      '# Boston geographic operating handover', '',
      'Original operation: ' + run.runId + '. Original source edition: ' + (input.edition ?? 'the complete INPUT.json inventory') + '.', '',
      'This directory contains the complete original municipal inputs, analyst file, reviewed dispatch, native receiving history and editable workspaces.',
      'The three analyst assignments are labelled internal commissioning work. Two accepted original cases form the destination dispatch.', '',
      '## Open the delivered work', '',
      '- Open index.html for the complete handover file links.',
      '- Open downloads/boston-dispatch.html for the reviewed destination handover.',
      '- Import downloads/boston-dispatch.gpkg in a GeoPackage reader; CSV, GeoJSON and JSON versions are beside it.',
      '- Use downloads/boston-received-editable-workspace.json to receive the first continued desk, or ' + merchantResult.name + ' for the last observed complete recipient edition.',
      '- The mutable sender-workspace, receiver-workspace and cli-received-workspace directories retain their original SQLite records. Later recipient additions are allowed; original records and request results remain fixed.', '',
      '## Receive with the original installed product', '',
      'Using the selected original Node runtime, run the GIS CLI with these arguments, replacing the three absolute paths:', '',
      '    node /absolute/selected-source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/gis/cli.mjs receive --workspace /absolute/new-recipient --file /absolute/this-delivery/' + merchantResult.name + ' --request-id <a-new-recipient-request-id> --expected-revision 0', '',
      'Reuse that same recipient request ID after a lost reply. The original CLI operation command reads its saved result. Open the received directory with the original GIS serve command.',
      'The retained merchant-gis-host.json records the producing host paths. On another machine, create a current host configuration using the original GIS configuration API and the actual new workspace/input paths; keep this historical configuration unchanged.', '',
      '## Continue or inspect this programme', '',
      'Rerun the original private configuration with output pointing to this same physical directory. The programme receives committed actions by their original request IDs and only replays an uncommitted exact captured body. Its original native revision check remains active.',
      'For a copied completed handover, use mode: "inspect" with the exact selected source and copied output. Completed verification accepts later valid native records while checking that every original record, operation and frozen file is still present.',
      'A copied incomplete operation cannot become a second writer. Its original physical directory and held kernel lock remain the continuation path.', '',
      '## Original history', '',
      'INPUT.json and RUN.json bind all source bytes, four original inputs and the operation. actions contains the actual pre-submission requests and original saved native results. steps and phases contain completed receiving work. attempts preserves real failures and process entries.',
      'journey.json is published only when the complete programme has finished. Reopening it returns the same completion; it does not rewrite completion times or recipient records.', ''
    ].join('\n'), 'text/markdown');
    const htmlEscape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const links = [
      ['Complete operating report', 'journey.json'], ['Portable operating guide', 'PORTABLE.md'],
      ['Reviewed dispatch', 'downloads/boston-dispatch.html'], ['GeoPackage dispatch', 'downloads/boston-dispatch.gpkg'],
      ['Mapped dispatch CSV', 'downloads/boston-dispatch.csv'], ['Dispatch GeoJSON', 'downloads/boston-dispatch.geojson'],
      ['Dispatch JSON', 'downloads/boston-dispatch.json'], ['Original analyst GeoPackage', 'downloads/boston-analyst-original.gpkg'],
      ['Edited analyst GeoPackage', 'inputs/boston-analyst-return.gpkg'],
      ['Complete sender workspace', browserResult.senderPackageFile], ['Continued recipient workspace', browserResult.receivedPackageFile],
      ['Independently reopened recipient', 'downloads/boston-reopened-workspace.json'],
      ['CLI received workspace', 'downloads/boston-cli-received-workspace.json'], ['Latest observed merchant recipient workspace', merchantResult.name],
      ['Source and input selection', 'INPUT.json'], ['Original operation', 'RUN.json']
    ];
    await save('index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Boston geographic operating handover</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;background:#f5f6f8;color:#152538}h1{line-height:1.15}li{margin:.75em 0}a{color:#17478b}section{background:white;padding:24px;border:1px solid #d8dee8;border-radius:12px}code{overflow-wrap:anywhere}</style>' +
      '<main><h1>Boston geographic operating handover</h1><p>104 original case identities · two reviewed internal dispatch assignments · continued recipient workspaces.</p>' +
      '<p>Operation <code>' + htmlEscape(run.runId) + '</code>. The original source status and coordinates remain attached to each internal assignment.</p>' +
      '<section><h2>Delivered work</h2><ul>' + links.map(([label, name]) => '<li><a href="' + htmlEscape(name) + '">' + htmlEscape(label) + '</a></li>').join('') +
      '</ul></section><h2>Receiving and continued work</h2><p>The guide explains native CLI receiving and reopening the editable SQLite desks. Later recipient editions remain valid alongside the frozen original exports. Complete request and attempt history is retained in the same directory.</p></main></html>\n', 'text/html');
    const phaseNames = ['original-city-and-report-import', 'complete-gis-handoff-and-native-analyst-file',
      'partial-review-and-persistent-operator-choice', 'mapped-reviewed-dispatch-and-complete-exports',
      'browser-receive-response-recovery-and-continued-work', 'independent-reopen-and-installed-cli-receiving',
      'installed-merchant-paging-and-complete-file-receiving'];
    const phases = [];
    for (const name of phaseNames) {
      const saved = await programme.saved('phases/' + name + '.json');
      check(saved, 'The original complete operating phase is absent: ' + name);
      phases.push(saved.value);
    }
    await programme.retain('attempts/' + programme.attempt + '/result.json', { attemptId: programme.attempt,
      state: 'passed', startedAt: attemptStarted, completedAt: timestamp(), browserErrors: programme.browserErrors });
    const frozenRoots = ['inputs', 'downloads', 'screenshots', 'merchant-exports', 'merchant', 'actions', 'steps', 'phases',
      'workspaces', 'cli', 'attempts'];
    const files = [];
    async function inventory(directory) {
      if (!await exists(directory)) return;
      for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (item.name.startsWith('.') && item.name.endsWith('.pending')) continue;
        const path = join(directory, item.name);
        check(!item.isSymbolicLink(), 'The frozen handover contains a symbolic link.');
        if (item.isDirectory()) await inventory(path);
        else {
          check(item.isFile(), 'The frozen handover contains a non-file member.');
          const body = await regularBytes(path), name = relative(output, path).split(sep).join('/');
          const contentType = name.endsWith('.json') ? 'application/json' : name.endsWith('.png') ? 'image/png' :
            name.endsWith('.gpkg') ? 'application/geopackage+sqlite3' : name.endsWith('.html') ? 'text/html' :
              name.endsWith('.csv') ? 'text/csv' : name.endsWith('.md') ? 'text/markdown' : 'application/octet-stream';
          files.push({ name, bytes: body.length, sha256: sha(body), contentType });
        }
      }
    }
    for (const root of frozenRoots) await inventory(join(output, root));
    for (const name of ['INPUT.json', 'RUN.json', 'analyst-selection.json', 'merchant-gis-host.json',
      'cli-receiving-result.json', 'PORTABLE.md', 'index.html']) {
      const body = await regularBytes(join(output, name));
      files.push({ name, bytes: body.length, sha256: sha(body),
        contentType: name.endsWith('.html') ? 'text/html' : name.endsWith('.md') ? 'text/markdown' : 'application/json' });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    const journey = await envelope(join(output, 'journey.json'), {
      schema: 'commons.open311.gis-customer-commissioning.v1', continuationSchema: CONTINUATION_SCHEMA,
      runId: run.runId, inputSha256: run.inputSha256, startedAt: run.startedAt, completedAt: timestamp(),
      state: 'passed', node: process.version, edition: input.edition, sourceFiles: input.sourceFiles,
      originalInputs: input.inputs.map(item => ({ ...item, path: 'inputs/' + item.filename })),
      phases, files, workspaces, browserErrors: browserResult.browserErrors,
      currentAttemptId: programme.attempt, historyDirectory: 'attempts',
      receivingPolicy: 'Original records and operations remain exact; later valid recipient additions are preserved.',
      index: 'index.html', guide: 'PORTABLE.md'
    });
    check(journey.runId === run.runId && journey.inputSha256 === run.inputSha256 && journey.state === 'passed',
      'The original completion belongs to another programme.');
    console.log('OPEN311_GIS_COMPLETE ' + JSON.stringify({ state: journey.state, output, runId: journey.runId,
      phases: journey.phases.length, files: journey.files.length, reused: false }));
    return journey;
  } catch (error) {
    const closed = [];
    if (provider) { try { await provider.close(); } catch (problem) { closed.push(errorValue(problem)); } provider = null; }
    if (reopened) { try { reopened.close(); } catch (problem) { closed.push(errorValue(problem)); } reopened = null; }
    if (browser) {
      if (programme) {
        for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
          try {
            const body = await page.screenshot({ fullPage: true, timeout: 10000 });
            await publish(join(programme.attemptRoot, 'failure-' + index + '.png'), body);
          } catch (problem) { closed.push({ phase: 'failure-screenshot', ...errorValue(problem) }); }
        }
      }
      try { await browser.close(); } catch (problem) { closed.push(errorValue(problem)); } browser = null;
    }
    if (receiver) { try { await receiver.close(); } catch (problem) { closed.push(errorValue(problem)); } receiver = null; }
    if (sender) { try { await sender.close(); } catch (problem) { closed.push(errorValue(problem)); } sender = null; }
    if (!programme) throw error;
    const result = programme.bound({ state: 'failed', output, attemptId: programme.attempt, startedAt: attemptStarted,
      completedAt: timestamp(), error: errorValue(error), browserErrors: programme.browserErrors, closeErrors: closed,
      continuation: 'Use this same original output and configuration; retained requests are reconciled before replay.' });
    try { await envelope(join(programme.attemptRoot, 'failure.json'), result); }
    catch (retentionError) { result.retentionError = errorValue(retentionError); }
    console.log('OPEN311_GIS_COMPLETE ' + JSON.stringify({ state: result.state, output, runId: result.runId,
      attemptId: result.attemptId, error: result.error, retentionError: result.retentionError }));
    return result;
  } finally {
    // Release only our copy. An actual inherited CLI writer retains its own
    // copy until it has ended; no explicit LOCK_UN can revoke its ownership.
    await lease.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runGISCommissioning(JSON.parse(await readFile(process.argv[2], 'utf8')));
    if (result.state !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error('OPEN311_GIS_ERROR ' + JSON.stringify(errorValue(error))); process.exitCode = 1;
  }
}
