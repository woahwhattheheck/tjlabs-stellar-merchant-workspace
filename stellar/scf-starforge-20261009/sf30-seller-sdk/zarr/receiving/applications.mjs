// MIT. Installed Applications receiving over the original Zarr workspace and managed worker.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, readdir, realpath, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCF = 'stellar/scf-starforge-20261009';
const SDK = SCF + '/sf30-seller-sdk';
const RUNTIME = SCF + '/distribution/runtime-workspace';
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const now = () => new Date().toISOString();
const failure = (code, message = code) => Object.assign(new Error(message), { code });
const need = (value, code, message) => { if (!value) throw failure(code, message); };
const absolute = path => {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path && !/[\0\r\n]/.test(path),
    'APPLICATION_RECEIVING_ABSOLUTE_PATH_REQUIRED');
  return path;
};
const inside = (root, path) => {
  const part = relative(root, path);
  return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep);
};
async function privateDirectory(path, create = false) {
  if (create) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const value = await lstat(path);
  need(value.isDirectory() && !value.isSymbolicLink() && !(value.mode & 0o077) &&
    await realpath(path) === path, 'APPLICATION_RECEIVING_PRIVATE_DIRECTORY_REQUIRED', path);
}
async function privateBytes(path, optional = false, maximum = 16 * 1024 * 1024) {
  let file;
  try { file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const info = await file.stat();
    need(info.isFile() && info.nlink === 1 && !(info.mode & 0o077) && info.size <= maximum,
      'APPLICATION_RECEIVING_PRIVATE_FILE_REQUIRED', path);
    const bytes = await file.readFile();
    need(bytes.length === info.size, 'APPLICATION_RECEIVING_PRIVATE_FILE_CHANGED', path);
    return bytes;
  } finally { await file.close(); }
}
async function readJson(path, optional = false) {
  const bytes = await privateBytes(path, optional);
  return bytes === null ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function save(path, value) {
  await privateDirectory(dirname(path));
  const target = await privateBytes(path, true);
  if (target !== null) need(!(await lstat(path)).isSymbolicLink(), 'APPLICATION_RECEIVING_TARGET_CHANGED');
  const temporary = path + '.' + randomUUID() + '.partial';
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
    (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(Buffer.isBuffer(value) ? value : bytesOf(value)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  const parent = await open(dirname(path), 'r');
  try { await parent.sync(); } finally { await parent.close(); }
}
async function waitFor(read, code, maximum = 180000) {
  const deadline = Date.now() + maximum;
  do {
    const value = await read();
    if (value) return value;
    await new Promise(done => setTimeout(done, 300));
  } while (Date.now() < deadline);
  throw failure(code);
}
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, label);
function nativeSelection(state) {
  need(state?.schema === 'stellar-forge.zarr-workspace.v1' &&
    typeof state.workspaceId === 'string' && Number.isSafeInteger(state.revision),
    'APPLICATION_RECEIVING_NATIVE_IDENTITY_REQUIRED');
  const value = { schema: state.schema, workspaceId: state.workspaceId, revision: state.revision };
  for (const name of ['sources', 'selections', 'results', 'reviews', 'frozen', 'operations']) {
    need(Array.isArray(state[name]), 'APPLICATION_RECEIVING_NATIVE_COLLECTION_REQUIRED', name);
    value[name] = state[name];
  }
  return value;
}
function sourceView(state, expected) {
  const selected = nativeSelection(state);
  exact(selected, expected.native, 'The same complete original Zarr workspace edition.');
  return {
    workspaceId: selected.workspaceId, revision: selected.revision,
    sourceCount: selected.sources.length, selectionCount: selected.selections.length,
    resultCount: selected.results.length, reviewCount: selected.reviews.length,
    frozenCount: selected.frozen.length, operationCount: selected.operations.length,
    nativeSha256: digest(bytesOf(selected)),
  };
}
async function publishedFiles(directory) {
  const files = [], roots = {};
  async function walk(at, prefix) {
    for (const entry of (await readdir(at, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name,'en'))) {
      const path = join(at, entry.name), relativePath = prefix + '/' + entry.name;
      need(!entry.isSymbolicLink(), 'APPLICATION_RECEIVING_PUBLISHER_LINK', relativePath);
      if (entry.isDirectory()) { files.push({ path: relativePath, type: 'directory' }); await walk(path, relativePath); continue; }
      need(entry.isFile(), 'APPLICATION_RECEIVING_PUBLISHER_FILE', relativePath);
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = await file.stat({ bigint: true }), hash = createHash('sha256');
        need(before.isFile(), 'APPLICATION_RECEIVING_PUBLISHER_FILE', relativePath);
        for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
        const after = await file.stat({ bigint: true });
        for (const name of ['dev', 'ino', 'size', 'mtimeNs'])
          exact(after[name], before[name], 'The retained publisher file changed during its complete read.');
        need(before.size <= BigInt(Number.MAX_SAFE_INTEGER), 'APPLICATION_RECEIVING_FILE_SIZE_REQUIRED');
        files.push({ path: relativePath, type: 'file', bytes: Number(before.size), sha256: hash.digest('hex') });
      } finally { await file.close(); }
    }
  }
  for (const name of ['publishers', 'datasets']) {
    const path = join(directory, name);
    let info;
    try { info = await lstat(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; roots[name] = false; continue; }
    need(info.isDirectory() && !info.isSymbolicLink(), 'APPLICATION_RECEIVING_PUBLISHER_DIRECTORY', name);
    roots[name] = true; await walk(path, name);
  }
  return { roots, files };
}
function closedRun(run, applicationId, operationId) {
  if (!run || run.id !== operationId || run.active !== false) return null;
  const result = run.result;
  if (run.phase === 'CANCELLED' && result?.schema === 'stellar-forge.application-run-cancellation.v1' &&
      result.applicationId === applicationId && result.operationId === operationId &&
      result.state === 'CANCELLED' && result.launched === false && result.completedAt) {
    return { kind: 'CANCELLED_BEFORE_DISPATCH', phase: run.phase, result };
  }
  if (['SUCCEEDED', 'FAILED'].includes(run.phase) && result?.operation === 'original-command' &&
      ['STOPPED', 'COMPLETED', 'EXITED', 'LAUNCH_FAILED'].includes(result.state) && result.completedAt) {
    return { kind: 'ORIGINAL_COMMAND_TERMINAL', phase: run.phase, result };
  }
  const state = run.state, reconciled = state?.result, process = state?.commandProcess;
  if (run.phase === 'SUCCEEDED' && reconciled?.operation === 'original-command' &&
      reconciled.state === 'RECONCILED' && state.completedAt &&
      Number.isSafeInteger(process?.pid) && process.pid > 0 &&
      typeof process.processStart === 'string' && process.processStart.length > 0) {
    return { kind: 'ORIGINAL_PROCESS_RECONCILED', phase: run.phase,
      result: reconciled, commandProcess: process, completedAt: state.completedAt };
  }
  // Inactive workers and OUTCOME_UNAVAILABLE do not establish command closure.
  return null;
}
async function nativeStatus(url) {
  const parsed = new URL(url);
  need(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' &&
    /^#token=[a-f0-9]{64}$/.test(parsed.hash), 'APPLICATION_RECEIVING_NATIVE_URL_INVALID');
  const response = await fetch(parsed.origin + '/api/status', {
    headers: { authorization: 'Bearer ' + parsed.hash.slice('#token='.length) },
    signal: AbortSignal.timeout(10000),
  });
  need(response.ok, 'APPLICATION_RECEIVING_NATIVE_STATUS_FAILED', String(response.status));
  return response.json();
}

/**
 * Sequential leg of the one receiving operation. The caller holds its native
 * operation lease and has closed the original source/publisher owners. This uses
 * the existing READY runtime, original Applications UI and managed workers.
 * No provider capture, dependency installation, publisher extraction or payment
 * is started here. All local URL/token and raw worker records stay private.
 */
export async function receiveZarrApplications({
  operationId, inputSha256, sourceRoot, sourceManifestSha256, runtimeDirectory,
  workspaceDirectory, connectionsFile, python, outputDirectory, browser: browserSelection,
} = {}) {
  need(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(operationId ?? '') &&
    HASH.test(inputSha256 ?? '') && HASH.test(sourceManifestSha256 ?? ''),
    'APPLICATION_RECEIVING_ORIGINAL_INTENT_REQUIRED');
  for (const value of [sourceRoot, runtimeDirectory, workspaceDirectory, connectionsFile, python, outputDirectory,
    browserSelection?.module, browserSelection?.executable]) absolute(value);
  need(!inside(sourceRoot, outputDirectory) && !inside(outputDirectory, sourceRoot),
    'APPLICATION_RECEIVING_PRIVATE_OUTPUT_REQUIRED');
  await privateDirectory(workspaceDirectory);
  await privateDirectory(outputDirectory, true);
  const resultFile = join(outputDirectory, 'result.json'), intentFile = join(outputDirectory, 'intent.json');
  const importAt = path => import(pathToFileURL(join(sourceRoot, path)).href);
  const [{ inspectMerchantRuntime }, runtimeModel, { startRuntimeWorkspace }, launch,
    authoring, { applicationRunState }, { chromium }] = await Promise.all([
    importAt(SCF + '/sf46-release/runtime-package.mjs'), importAt(RUNTIME + '/model.mjs'),
    importAt(RUNTIME + '/server.mjs'), importAt(SDK + '/zarr/workspace/launch.mjs'),
    importAt(SDK + '/zarr/workspace/bridge.mjs'), importAt(RUNTIME + '/applications-core.mjs'),
    import(pathToFileURL(browserSelection.module).href),
  ]);
  const runtime = await inspectMerchantRuntime(runtimeDirectory, {
    expectedManifest: sourceManifestSha256, load: false,
  });
  need(runtime.sourceRoot === sourceRoot && runtime.directory === runtimeDirectory &&
    runtime.sourceManifestSha256 === sourceManifestSha256,
    'APPLICATION_RECEIVING_READY_SOURCE_CHANGED');
  const selectedDirectory = join(sourceRoot, SDK, 'zarr');
  const selectedSource = await launch.inspectZarrLaunchSource(selectedDirectory);
  const connections = await authoring.readZarrConnections(connectionsFile);
  const basis = {
    schema: 'stellar-forge.zarr-applications-receiving-intent.v1',
    operationId, inputSha256, sourceManifestSha256,
    runtimeDirectory, sourceRoot, sourceCommit: runtime.sourceCommit,
    workspaceDirectory, connectionsFile, connectionsSha256: connections.sha256, python,
    sourceDirectory: selectedDirectory, sourceSha256: selectedSource.sourceSha256,
  };
  let intent = await readJson(intentFile, true);
  if (intent) exact(intent.basis, basis, 'Same retained Applications receiving intent.');
  else { intent = { basis, createdAt: now(), requests: {}, launches: {}, stages: {} }; await save(intentFile, intent); }
  intent.attempts ??= {};
  intent.interruptedRuns ??= [];
  intent.cleanups ??= {};
  const completed = await readJson(resultFile, true);
  // A baseline is retained before any managed Start. On continuation, a saved
  // baseline is never replaced by a new observation of a later workspace.
  if (!intent.baseline) {
    need(!intent.applicationId && !Object.keys(intent.requests).length,
      'APPLICATION_RECEIVING_ORIGINAL_BASELINE_MISSING');
    const original = await authoring.openZarrWorkspace({
      directory: workspaceDirectory, python, sourceDirectory: selectedDirectory,
      connections, owner: true,
    });
    try {
      const native = nativeSelection(await original.status());
      need(native.operations.every(value => ['COMPLETE', 'ABANDONED'].includes(value.state)),
        'APPLICATION_RECEIVING_SOURCE_OPERATION_UNFINISHED');
      intent.baseline = {
        directory: workspaceDirectory, identity: original.identity, native,
        publishers: await publishedFiles(workspaceDirectory),
      };
      await save(intentFile, intent);
    } finally { await original.close(); }
  }
  const expected = intent.baseline, nativeIdentity = expected.identity;
  exact(expected.directory, workspaceDirectory);
  need(nativeIdentity?.workspaceId === expected.native.workspaceId &&
    HASH.test(nativeIdentity.sha256 ?? ''), 'APPLICATION_RECEIVING_BASELINE_IDENTITY_CHANGED');
  const directory = join(outputDirectory, 'runtime-workspace');
  let initialized = true;
  try { await lstat(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; initialized = false; }
  if (!initialized) await runtimeModel.createRuntimeWorkspace({ directory });
  const model = await runtimeModel.openRuntimeWorkspace({ directory });
  const report = { schema: 'stellar-forge.zarr-applications-receiving-result.v1',
    operationId, inputSha256, sourceManifestSha256, runtimeDirectory,
    sourceCommit: runtime.sourceCommit, state: 'RUNNING', startedAt: completed?.startedAt ?? now(),
    source: sourceView(expected.native, expected),
    browserErrors: [], stages: intent.stages };
  let browser, context, page, service, nativePage, currentOwnedRun = null;
  const checkpoint = async (name, value) => {
    intent.stages[name] = value; await save(intentFile, intent);
    report.stages = intent.stages; await save(resultFile, report);
    console.log(JSON.stringify({ phase: 'ZARR_APPLICATIONS', operationId, stage: name }));
  };
  const application = async () => {
    const state = await model.applicationsState();
    need(state.catalog.some(item => item.id === 'zarr-workspace' &&
      item.command === 'zarr-workspace'), 'APPLICATION_RECEIVING_CATALOG_ENTRY_MISSING');
    return intent.applicationId ? state.applications.find(item => item.id === intent.applicationId) : null;
  };
  const attemptKey = name => name + (intent.attempts[name] ? '-recovery-' + intent.attempts[name] : '');
  const startRequest = name => intent.requests[attemptKey(name) + '-start'];
  const stopRequest = name => intent.requests[attemptKey(name) + '-stop'];
  const expectedRuns = () => intent.interruptedRuns.length +
    ['first', 'second'].filter(name => startRequest(name)).length;
  const ownRun = run => applicationRunState(directory, { applicationId: intent.applicationId, operationId: run });
  const terminalRun = app => Boolean(closedRun(app?.current, intent.applicationId, app?.current?.id));
  const reopenOriginal = async () => {
    const original = await authoring.openZarrWorkspace({
      directory: expected.directory, python, sourceDirectory: selectedDirectory, connections, owner: true,
    });
    try {
      exact(original.identity, nativeIdentity, 'The original native storage identity reopens after managed Stop.');
      const view = sourceView(await original.status(), expected);
      exact(await publishedFiles(expected.directory), expected.publishers,
        'Applications preserved every retained original publisher and dataset file.');
      return view;
    } finally { await original.close(); }
  };
  const drainOwnedRun = async run => {
    let entry = intent.cleanups[run];
    if (!entry) {
      entry = { applicationId: intent.applicationId, operationId: run,
        request: { applicationId: intent.applicationId, operationId: run }, requestedAt: now() };
      intent.cleanups[run] = entry;
      await save(intentFile, intent); // retained before original Stop, including a lost Stop receipt
    }
    exact(entry.request, { applicationId: intent.applicationId, operationId: run });
    let observed = await ownRun(run);
    need(observed, 'APPLICATION_RECEIVING_CLEANUP_RUN_MISSING');
    let proof = closedRun(observed, intent.applicationId, run);
    if (!proof) {
      await model.applicationsStop(entry.request);
      observed = await waitFor(async () => {
        let current = await ownRun(run);
        need(current, 'APPLICATION_RECEIVING_CLEANUP_RUN_MISSING');
        if (closedRun(current, intent.applicationId, run)) return current;
        // Recovery is permitted only for an already acquired original command.
        // Never turn cleanup of a pending/unknown launch into a new dispatch.
        if (current.active === false &&
            (current.result?.operation === 'original-command' ||
             Number.isSafeInteger(current.state?.commandProcess?.pid) &&
             typeof current.state.commandProcess.processStart === 'string' &&
             current.state.commandProcess.processStart.length > 0)) {
          await model.applicationsRecover(entry.request);
          current = await ownRun(run);
          if (closedRun(current, intent.applicationId, run)) return current;
        }
        return false;
      }, 'APPLICATION_RECEIVING_CLEANUP_NOT_DRAINED', 180000);
      proof = closedRun(observed, intent.applicationId, run);
    }
    const app = await application();
    entry.terminal ??= { observedAt: now(), applicationId: intent.applicationId, operationId: run,
      phase: app?.current?.id === run ? app.phase : observed.phase,
      nativePhase: observed.phase, active: false,
      instanceId: observed.url?.original?.instanceId ?? null, proof };
    exact(entry.terminal.operationId, observed.id);
    exact(entry.terminal.proof, proof, 'The original terminal command proof is unchanged.');
    await save(intentFile, intent);
    report.cleanupTransitions = Object.values(intent.cleanups).map(value => ({
      applicationId: value.applicationId, operationId: value.operationId,
      requestedAt: value.requestedAt, terminal: value.terminal ?? null,
    }));
    await save(resultFile, report);
    return app;
  };
  const resumeStage = async name => {
    const request = startRequest(name);
    if (!request) return;
    const run = request.body.requestId, observed = await ownRun(run);
    if (intent.stages[name + '-stopped']) {
      need(closedRun(observed, intent.applicationId, run),
        'APPLICATION_RECEIVING_RETAINED_STOP_NOT_TERMINAL');
      return;
    }
    // Keep an accepted live run and its exact Start UUID. A positive terminal
    // result or a retained cleanup joins that original run before another review.
    if (!intent.cleanups[run] && !closedRun(observed, intent.applicationId, run)) return;
    currentOwnedRun = run;
    const stopped = await drainOwnedRun(run);
    if (stopped?.current?.id === run && stopped.phase === 'STOPPED' &&
        stopRequest(name) && intent.stages[name + '-source-open']?.operationId === run) return;
    const key = attemptKey(name), archivedStages = {};
    for (const stage of [name + '-source-open', name + '-stopped',
      ...(name === 'first' ? ['console-reopened'] : [])]) {
      if (intent.stages[stage]) archivedStages[stage] = intent.stages[stage];
    }
    need(!intent.interruptedRuns.some(value => value.operationId === currentOwnedRun),
      'APPLICATION_RECEIVING_CLEANUP_ALREADY_ADOPTED');
    intent.interruptedRuns.push({ stage: name, attempt: key, operationId: currentOwnedRun,
      requestKey: key + '-start', stopRequestKey: stopRequest(name) ? key + '-stop' : null,
      launch: intent.launches[name] ?? null, stages: archivedStages,
      cleanup: intent.cleanups[currentOwnedRun], continuedAt: now() });
    intent.attempts[name] = (intent.attempts[name] ?? 0) + 1;
    for (const stage of Object.keys(archivedStages)) delete intent.stages[stage];
    delete intent.launches[name];
    await save(intentFile, intent);
    currentOwnedRun = null;
  };
  const refreshPage = async () => {
    await page.goto(service.url); await page.locator('[data-view="applications"]').click();
    await page.locator('#application-kind').waitFor();
    if (intent.applicationId) {
      const selected = page.locator('[data-application-id="' + intent.applicationId + '"]');
      await selected.waitFor(); await selected.click();
    }
  };
  const receivedPost = async (path, trigger, key, { loseReply = false } = {}) => {
    need(!intent.requests[key], 'APPLICATION_RECEIVING_REQUEST_ALREADY_RETAINED', key);
    const routeName = '**' + path;
    let outcome, dispatched = false, routeError;
    await page.route(routeName, async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      try {
        const request = route.request().postDataJSON();
        intent.requests[key] = { path, body: request, retainedAt: now() };
        await save(intentFile, intent); // exact UI UUID retained before native dispatch
        if (path === '/api/applications/start') currentOwnedRun = request.requestId;
        const response = await route.fetch();
        const text = await response.text();
        let body; try { body = JSON.parse(text); } catch { body = null; }
        outcome = { status: response.status(), body };
        intent.requests[key].response = outcome;
        if (loseReply && response.ok()) intent.requests[key].replyWithheld = true;
        await save(intentFile, intent);
        dispatched = true;
        if (loseReply && response.ok()) await route.abort('failed');
        else await route.fulfill({ response });
      } catch (error) {
        routeError = error; dispatched = true;
        await route.abort('failed').catch(() => {});
      }
    }, { times: 1 });
    try {
      await trigger();
      await waitFor(() => dispatched, 'APPLICATION_RECEIVING_UI_REQUEST_NOT_DISPATCHED');
      if (routeError) throw routeError;
      need(outcome?.status >= 200 && outcome.status < 300,
        'APPLICATION_RECEIVING_NATIVE_REQUEST_FAILED', JSON.stringify(outcome));
      return outcome.body;
    } finally { await page.unroute(routeName).catch(() => {}); }
  };
  const waitRunning = async name => waitFor(async () => {
    const app = await application(), request = startRequest(name)?.body;
    if (!app?.current || app.current.id !== request?.requestId) return false;
    if (app.current.active && app.current.privateUrl && app.phase === 'RUNNING') return app;
    if (['FAILED', 'UNAVAILABLE', 'STOPPED', 'CANCELLED'].includes(app.phase))
      throw failure('APPLICATION_RECEIVING_ORIGINAL_LAUNCH_ENDED', JSON.stringify({
        applicationId: app.id, operationId: app.current.id, phase: app.phase, result: app.current.result,
      }));
    return false;
  }, 'APPLICATION_RECEIVING_NATIVE_READY_NOT_OBSERVED', 300000);
  const ensureStart = async (name, loseReply = false) => {
    const key = attemptKey(name) + '-start';
    if (!intent.requests[key]) {
      await refreshPage();
      const button = page.getByRole('button', { name: 'Review start', exact: true });
      await waitFor(() => button.isEnabled(), 'APPLICATION_RECEIVING_START_REVIEW_UNAVAILABLE', 300000);
      const reviewResponse = page.waitForResponse(value =>
        new URL(value.url()).pathname === '/api/applications/start-review' &&
        value.request().method() === 'POST');
      await button.click(); const response = await reviewResponse;
      need(response.ok(), 'APPLICATION_RECEIVING_START_REVIEW_FAILED', await response.text());
      const reviewed = await response.json();
      exact(reviewed.applicationId, intent.applicationId);
      const startButton = page.getByRole('button', { name: 'Start reviewed application', exact: true });
      await startButton.waitFor();
      await receivedPost('/api/applications/start', () => startButton.click(), key, { loseReply });
    } else {
      // The original UI's saved UUID is authoritative after a process/browser
      // interruption. This reopens that same retained managed request.
      const request = intent.requests[key].body;
      exact(request.applicationId, intent.applicationId);
      currentOwnedRun = request.requestId;
      await model.applicationsStart(request);
      const current = await application();
      if (current?.current?.id === request.requestId && !current.current.active &&
          ['QUEUED', 'PENDING', 'INTERRUPTED'].includes(current.current.phase))
        await model.applicationsRecover({ applicationId: intent.applicationId, operationId: request.requestId });
    }
    currentOwnedRun = intent.requests[key].body.requestId;
    if (loseReply && intent.requests[key].replyWithheld && !intent.requests[key].replyRecovered) {
      // Reload retains the original browser request and exercises its normal
      // Recover control. A different-origin restart uses the model replay above.
      await page.reload(); await page.locator('[data-view="applications"]').click();
      await page.locator('[data-application-id="' + intent.applicationId + '"]').waitFor();
      const recover = page.getByRole('button', { name: 'Recover last application request', exact: true });
      if (await recover.isVisible()) {
        let replayBody;
        const replay = page.waitForResponse(value =>
          new URL(value.url()).pathname === '/api/applications/start' &&
          value.request().method() === 'POST' &&
          (replayBody = value.request().postDataJSON()).requestId === currentOwnedRun);
        await recover.click(); const response = await replay;
        need(response.ok(), 'APPLICATION_RECEIVING_SAME_START_RECOVERY_FAILED');
        exact(replayBody, intent.requests[key].body, 'Original lost-response request UUID and review.');
        intent.requests[key].replyRecoveryMode = 'ORIGINAL_BROWSER_RECOVER';
      } else {
        await model.applicationsStart(intent.requests[key].body);
        intent.requests[key].replyRecoveryMode = 'ORIGINAL_MODEL_REPLAY_AFTER_BROWSER_REOPEN';
      }
      intent.requests[key].replyRecovered = true; await save(intentFile, intent);
    }
    const app = await waitRunning(name);
    exact(app.kind, 'zarr-workspace');
    exact(app.settings.workspaceDirectory, expected.directory);
    exact(app.settings.port, 0);
    exact(app.settings.connectionsFile, connectionsFile);
    exact(app.settings.pythonExecutable, python);
    exact(app.runtime.sourceManifestSha256, sourceManifestSha256);
    const launchRecord = app.current.url;
    need(launchRecord?.source === 'original-command-stdout' &&
      launchRecord.operationId === currentOwnedRun && launchRecord.applicationId === app.id,
      'APPLICATION_RECEIVING_ORIGINAL_STARTUP_REQUIRED');
    const native = launchRecord.original;
    exact(native.schema, launch.ZARR_STARTUP_SCHEMA);
    exact(native.workspaceId, nativeIdentity.workspaceId);
    exact(native.workspaceSha256, nativeIdentity.sha256);
    exact(native.sourceSha256, selectedSource.sourceSha256);
    exact(native.connectionsSha256, connections.sha256);
    need(typeof native.instanceId === 'string' && Number.isSafeInteger(native.pid) && native.pid > 0 &&
      HASH.test(native.connectionSha256 ?? ''), 'APPLICATION_RECEIVING_MANAGED_EXECUTION_REQUIRED');
    const actualArguments = launch.zarrServeOptions(app.current.args);
    exact(actualArguments.directory, expected.directory);
    exact(actualArguments.connectionsFile, connectionsFile);
    exact(actualArguments.python, python);
    exact(actualArguments.sourceDirectory, selectedDirectory);
    exact(actualArguments.expectedWorkspaceSha256, nativeIdentity.sha256);
    exact(actualArguments.expectedSourceSha256, selectedSource.sourceSha256);
    exact(actualArguments.expectedConnectionsSha256, connections.sha256);
    need(actualArguments.startupJson, 'APPLICATION_RECEIVING_ORIGINAL_STARTUP_REQUIRED');
    intent.launches[name] = { applicationId: app.id, operationId: currentOwnedRun,
      instanceId: native.instanceId, pid: native.pid, workspaceIdentity: native.workspaceSha256,
      sourceSha256: native.sourceSha256, connectionsSha256: native.connectionsSha256,
      connectionSha256: native.connectionSha256, privateUrl: app.current.privateUrl };
    await save(intentFile, intent);
    await refreshPage();
    const link = page.getByRole('link', { name: 'Open application', exact: true });
    await link.waitFor();
    exact(await link.getAttribute('href'), app.current.privateUrl, 'Open uses this original managed run.');
    const opened = context.waitForEvent('page');
    await link.click(); nativePage = await opened;
    nativePage.on('pageerror', error => report.browserErrors.push({ surface: name, message: error.message }));
    await nativePage.locator('#revision').filter({ hasText: 'Revision ' + expected.native.revision }).waitFor();
    await nativePage.locator('[data-tab="results"]').click();
    await nativePage.locator('#result-select').waitFor();
    if (expected.native.results.length) {
      await nativePage.locator('#result-select').selectOption(expected.native.results.at(-1).id);
      await nativePage.locator('#result-page table').waitFor();
    }
    const state = await nativeStatus(app.current.privateUrl), view = sourceView(state, expected);
    await save(join(outputDirectory, name + '-source-desktop.png'), await nativePage.screenshot({ fullPage: true }));
    await checkpoint(name + '-source-open', {
      applicationId: app.id, revision: app.revision, operationId: currentOwnedRun,
      instanceId: native.instanceId, workspaceIdentity: native.workspaceSha256,
      sourceSha256: native.sourceSha256, source: view,
    });
    return { app, view };
  };
  const ensureStop = async name => {
    const run = startRequest(name)?.body.requestId;
    need(run, 'APPLICATION_RECEIVING_ORIGINAL_RUN_REQUIRED');
    currentOwnedRun = run;
    if (intent.stages[name + '-stopped']) { currentOwnedRun = null; return; }
    let app = await application();
    need(app?.current?.id === run, 'APPLICATION_RECEIVING_STOP_RUN_CHANGED');
    if (!stopRequest(name)) {
      await refreshPage();
      const button = page.getByRole('button', { name: 'Stop application', exact: true });
      await waitFor(() => button.isEnabled(), 'APPLICATION_RECEIVING_STOP_UNAVAILABLE');
      await receivedPost('/api/applications/stop', () => button.click(), attemptKey(name) + '-stop');
    } else {
      exact(stopRequest(name).body, { applicationId: intent.applicationId, operationId: run });
      await model.applicationsStop(stopRequest(name).body);
    }
    app = await waitFor(async () => {
      const value = await application();
      need(value?.current?.id === run, 'APPLICATION_RECEIVING_STOP_RUN_CHANGED');
      return terminalRun(value) && value.phase === 'STOPPED' ? value : false;
    }, 'APPLICATION_RECEIVING_ORIGINAL_DRAIN_NOT_COMPLETE', 180000);
    const saved = await reopenOriginal();
    exact(saved, intent.stages[name + '-source-open'].source,
      'Original source state and workspace lease reopen after Stop.');
    await checkpoint(name + '-stopped', {
      applicationId: app.id, operationId: run, phase: app.phase,
      active: app.current.active, originalOutcome: app.current.result?.state, source: saved,
    });
    currentOwnedRun = null;
    await nativePage?.close(); nativePage = null;
  };
  try {
    // Inspect every previously owned run, including retired attempts. Saved
    // STOPPED flags alone never authorize another original workspace owner.
    for (const archived of intent.interruptedRuns) {
      need(closedRun(await ownRun(archived.operationId), intent.applicationId, archived.operationId),
        'APPLICATION_RECEIVING_RETIRED_RUN_NOT_TERMINAL');
    }
    if (completed?.state === 'PASS') {
      exact(completed.operationId, operationId);
      exact(completed.inputSha256, inputSha256);
      exact(completed.sourceManifestSha256, sourceManifestSha256);
      for (const run of completed.allOriginalRunIds ?? []) {
        need(closedRun(await ownRun(run), intent.applicationId, run),
          'APPLICATION_RECEIVING_COMPLETED_RUN_NOT_TERMINAL');
      }
      need(completed.completedReceivingRuns === 2 && completed.originalRunIds?.length === 2 &&
        completed.allOriginalRunIds?.length === intent.interruptedRuns.length + 2,
        'APPLICATION_RECEIVING_COMPLETED_HISTORY_CHANGED');
      for (const file of completed.completedFiles) {
        const bytes = await privateBytes(file.file);
        exact(bytes.length, file.bytes); exact(digest(bytes), file.sha256);
      }
      exact(await reopenOriginal(), completed.source);
      return { file: resultFile, sha256: digest(await privateBytes(resultFile)), value: completed };
    }
    const attached = await model.attach({ directory: runtimeDirectory, label: 'Zarr receiving runtime' });
    need(attached.status === 'READY', 'APPLICATION_RECEIVING_READY_RUNTIME_REQUIRED');
    intent.runtimeId ??= attached.runtimeId;
    exact(intent.runtimeId, attached.runtimeId);
    await save(intentFile, intent);
    browser = await chromium.launch({ executablePath: browserSelection.executable, headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.on('pageerror', error => report.browserErrors.push({ surface: 'applications', message: error.message }));
    service = await startRuntimeWorkspace({ directory, port: 0 });
    await refreshPage();
    if (!intent.applicationId) {
      if (intent.requests.save) {
        const value = await model.applicationsSave(intent.requests.save.body);
        intent.applicationId = value.applicationId;
      } else {
        await page.getByRole('button', { name: 'New application', exact: true }).click();
        await page.locator('#application-label').fill('Zarr retained array workspace');
        await page.locator('#application-runtime').selectOption(attached.runtimeId);
        await page.locator('#application-kind').selectOption('zarr-workspace');
        await page.locator('#application-setting-workspaceDirectory').fill(expected.directory);
        await page.locator('#application-setting-port').fill('0');
        await page.locator('#application-setting-connectionsFile').fill(connectionsFile);
        await page.locator('#application-setting-pythonExecutable').fill(python);
        const reviewResponse = page.waitForResponse(value =>
          new URL(value.url()).pathname === '/api/applications/review' &&
          value.request().method() === 'POST');
        await page.getByRole('button', { name: 'Review application', exact: true }).click();
        const response = await reviewResponse;
        need(response.ok(), 'APPLICATION_RECEIVING_CONFIGURATION_REVIEW_FAILED', await response.text());
        const reviewed = await response.json();
        exact(reviewed.kind, 'zarr-workspace');
        exact(reviewed.settings.workspaceDirectory, expected.directory);
        exact(reviewed.settings.connectionsFile, connectionsFile);
        exact(reviewed.settings.pythonExecutable, python);
        exact(reviewed.runtime.sourceManifestSha256, sourceManifestSha256);
        const saved = await receivedPost('/api/applications/save',
          () => page.getByRole('button', { name: 'Save application', exact: true }).click(), 'save');
        intent.applicationId = saved.applicationId;
      }
      await save(intentFile, intent);
    }
    const connected = await waitFor(async () => {
      const app = await application();
      if (app?.release) return app;
      if (app?.adoption && !app.adoption.active &&
          ['FAILED', 'INTERRUPTED'].includes(app.adoption.phase))
        throw failure('APPLICATION_RECEIVING_ADOPTION_NOT_COMPLETE', JSON.stringify({
          applicationId: app.id, operationId: app.adoption.id, phase: app.adoption.phase,
        }));
      return false;
    }, 'APPLICATION_RECEIVING_ORIGINAL_ADOPTION_NOT_COMPLETE', 300000);
    await checkpoint('original-application-saved', {
      applicationId: connected.id, revision: connected.revision, runtimeId: connected.runtimeId,
      sourceCommit: connected.runtime.sourceCommit, sourceManifestSha256: connected.runtime.sourceManifestSha256,
      release: connected.release, workspaceIdentity: nativeIdentity.sha256,
    });
    await resumeStage('first');
    if (!intent.stages['first-stopped']) {
      if (!stopRequest('first')) {
        const first = await ensureStart('first', true);
        exact(first.app.totalRuns, expectedRuns(), 'No additional run for the same lost Start reply.');
        if (!intent.stages['console-reopened']) {
          const before = intent.launches.first;
          await service.close(); service = null;
          exact(sourceView(await nativeStatus(before.privateUrl), expected), first.view);
          service = await startRuntimeWorkspace({ directory, port: 0 });
          await refreshPage();
          const retained = await application();
          exact(retained.current.id, before.operationId);
          exact(retained.current.privateUrl, before.privateUrl);
          exact(retained.current.url.original.instanceId, before.instanceId);
          exact(retained.totalRuns, first.app.totalRuns);
          const link = page.getByRole('link', { name: 'Open application', exact: true });
          await link.waitFor();
          exact(await link.getAttribute('href'), before.privateUrl);
          await save(join(outputDirectory, 'applications-desktop.png'), await page.screenshot({ fullPage: true }));
          await page.setViewportSize({ width: 412, height: 915 });
          await save(join(outputDirectory, 'applications-mobile.png'), await page.screenshot({ fullPage: true }));
          need(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            'APPLICATION_RECEIVING_MOBILE_OVERFLOW');
          await page.setViewportSize({ width: 1440, height: 1000 });
          await checkpoint('console-reopened', {
            applicationId: retained.id, operationId: before.operationId,
            instanceId: before.instanceId, samePrivateUrl: true, originalRuns: retained.totalRuns,
          });
        }
      }
      await ensureStop('first');
    }
    await resumeStage('second');
    if (!intent.stages['second-stopped']) {
      if (!stopRequest('second')) {
        const second = await ensureStart('second');
        need(second.app.current.id !== intent.launches.first.operationId &&
          second.app.current.url.original.instanceId !== intent.launches.first.instanceId,
          'APPLICATION_RECEIVING_NEW_REVIEWED_INSTANCE_REQUIRED');
        exact(second.app.revision, intent.stages['original-application-saved'].revision);
        exact(second.app.totalRuns, expectedRuns());
        exact(second.view, intent.stages['first-source-open'].source,
          'Same original arrays, results, reviews, frozen sources and publishers after a reviewed restart.');
      }
      await ensureStop('second');
    }
    const finalApplication = await application();
    exact(finalApplication.totalRuns, expectedRuns());
    exact(finalApplication.totalRuns, intent.interruptedRuns.length + 2);
    exact(finalApplication.phase, 'STOPPED');
    exact(finalApplication.current.active, false);
    need(terminalRun(finalApplication), 'APPLICATION_RECEIVING_FINAL_COMMAND_NOT_TERMINAL');
    const finalView = await reopenOriginal();
    const finalIdentity = nativeIdentity;
    exact(finalView, sourceView(expected.native, expected));
    const files = [];
    for (const name of ['first-source-desktop.png', 'second-source-desktop.png',
      'applications-desktop.png', 'applications-mobile.png']) {
      const file = join(outputDirectory, name), bytes = await privateBytes(file);
      files.push({ file, sha256: digest(bytes), bytes: bytes.length });
    }
    need(report.browserErrors.length === 0, 'APPLICATION_RECEIVING_BROWSER_ERROR',
      JSON.stringify(report.browserErrors));
    Object.assign(report, {
      state: 'PASS', completedAt: now(), applicationId: finalApplication.id,
      applicationRevision: finalApplication.revision, runtimeId: finalApplication.runtimeId,
      originalRunIds: ['first', 'second'].map(name => intent.launches[name].operationId),
      originalInstanceIds: ['first', 'second'].map(name => intent.launches[name].instanceId),
      originalRuns: finalApplication.totalRuns, completedReceivingRuns: 2,
      interruptedRuns: intent.interruptedRuns.map(value => ({
        stage: value.stage, operationId: value.operationId,
        instanceId: value.launch?.instanceId ?? value.cleanup.terminal.instanceId,
        terminalPhase: value.cleanup.terminal.phase,
        nativeTerminalPhase: value.cleanup.terminal.nativePhase,
      })),
      allOriginalRunIds: [...intent.interruptedRuns.map(value => value.operationId),
        ...['first', 'second'].map(name => intent.launches[name].operationId)],
      finalPhase: finalApplication.phase,
      lostStartReplyRecovered: startRequest('first').replyWithheld === true &&
        startRequest('first').replyRecovered === true,
      startReplyRecoveryMode: startRequest('first').replyRecoveryMode,
      consoleReopenedWithoutNewRun: true, sameWorkspaceIdentity: finalIdentity.sha256,
      sameWorkspaceId: expected.native.workspaceId, sameNativeRevision: expected.native.revision,
      sameResults: expected.native.results.map(value => value.id),
      sameFrozenSources: expected.native.frozen.map(value => value.id),
      samePublisherFilesSha256: digest(bytesOf(expected.publishers)), completedFiles: files,
      scope: 'Original installed Applications review/save/start/Open/Stop/reopen over the same complete retained Zarr workspace, original results and publishers; no source import, array extraction, publication or payment.',
    });
    await save(resultFile, report);
    return { file: resultFile, sha256: digest(await privateBytes(resultFile)), value: report };
  } catch (error) {
    report.state = 'FAIL'; report.failedAt = now();
    report.error = { code: /^[A-Z0-9_]{1,120}$/.test(error.code ?? '') ? error.code : 'ZARR_APPLICATIONS_RECEIVING_FAILED',
      message: String(error.message).replace(/S[A-Z2-7]{55}/g, '[private signing key]') };
    await save(resultFile, report);
    throw error;
  } finally {
    const cleanup = [];
    try {
      if (currentOwnedRun && intent.applicationId) {
        await drainOwnedRun(currentOwnedRun);
      }
    } catch (error) { cleanup.push({ scope: 'original-managed-run', code: error.code ?? 'CLOSE_FAILED' }); }
    for (const [scope, close] of [
      ['source-browser', () => nativePage?.close()], ['runtime-browser', () => page?.close()],
      ['browser-context', () => context?.close()], ['browser', () => browser?.close()],
      ['runtime-console', () => service?.close()], ['runtime-model', () => model.close()],
    ]) try { await close(); } catch (error) { cleanup.push({ scope, code: error.code ?? 'CLOSE_FAILED' }); }
    if (cleanup.length) {
      report.state = 'FAIL'; report.cleanupErrors = cleanup;
      await save(resultFile, report);
      throw failure('APPLICATION_RECEIVING_CLEANUP_FAILED', JSON.stringify(cleanup));
    }
  }
}

