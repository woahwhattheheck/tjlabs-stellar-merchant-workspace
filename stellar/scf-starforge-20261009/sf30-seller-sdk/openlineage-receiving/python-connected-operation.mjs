/** Original BBBD Python SDK receiving journey with durable same-operation continuation. */
import { promises as fs } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import { OperationState, stableToken, atomicJson, exists, readJson, hash } from './operation-state.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--root', '--source', '--python-sdk'].includes(process.argv[i]) || !process.argv[i + 1])
    throw new Error('Usage: python-connected-operation.mjs --root DIR [--source DIR] [--python-sdk DIR]');
  if (options[process.argv[i]]) throw new Error('Duplicate option');
  options[process.argv[i]] = process.argv[i + 1];
}
const ROOT = resolve(options['--root'] || dirname(fileURLToPath(import.meta.url)));
if (process.env.OPENLINEAGE_RECEIVING_LOCK_ROOT !== ROOT)
  throw new Error('Run with receiving-run.py so the same original operation has one kernel lease.');
const SOURCE = resolve(options['--source'] || join(ROOT, 'source'));
const SDK = resolve(options['--python-sdk'] || join(ROOT, 'python-sdk'));
const DIRECTORY = join(ROOT, 'python-operation');
const PRODUCER = join(DIRECTORY, 'producer');
const OPERATION = 'SCF-OPENLINEAGE-NATIVE-PRODUCERS-BBBD-20261012/python';
const ORIGINALS = [
  { file: 'fixture-event-simple.json', git: '3b6936894172b4fc78f9b385771695fb6e2a8720' },
  { file: 'fixture-event-full.json', git: 'd0f19663859955c95afde83bd7bd3fcdffc641e8' }
];
const load = name => import(pathToFileURL(join(SOURCE, name)).href);
const [{ startServer }, { LineageClient }, { producerConfiguration }, { parseSource },
  { APPLICATION_FILES, APPLICATION_VERSION, verifyBundle, receiveBundle }] = await Promise.all([
  load('server.mjs'), load('client.mjs'), load('producer.mjs'), load('model.mjs'), load('store.mjs')
]);
const members = [];
for (const path of [...APPLICATION_FILES].sort()) {
  const bytes = await fs.readFile(join(SOURCE, path));
  members.push({ path, bytes: bytes.length, sha256: hash(bytes) });
}
const originals = [];
for (const original of ORIGINALS) {
  const bytes = await fs.readFile(join(SOURCE, original.file));
  const git = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(git, original.git);
  originals.push({ ...original, bytes: bytes.length, sha256: hash(bytes) });
}
const journal = await OperationState.open(DIRECTORY, {
  operationId: OPERATION, sourceMembers: members, originals, sdkVersion: '1.53.0'
});
const operatorToken = await stableToken(join(DIRECTORY, 'operator-token'));
const producerToken = await stableToken(join(DIRECTORY, 'producer-token'));
const configPath = join(DIRECTORY, 'private-config.json');
const receivedPath = join(DIRECTORY, 'received');
const identityDirectory = join(DIRECTORY, 'received-producer');
let host;
const operator = () => new LineageClient(host.url, {
  token: operatorToken, expectedWorkspaceId: journal.state.values.workspaceId
});
async function configure(compression = 'gzip') {
  const config = producerConfiguration(host.identity, { token: producerToken, compression });
  if (compression === 'gzip') config.transport.retry = {
    total: 0, connect: 0, read: 0, status: 0, redirect: 0, raise_on_status: false
  };
  await atomicJson(configPath, config);
}
async function start(directory = join(DIRECTORY, 'workspace'), application = SOURCE) {
  if (host) { const old = host; host = null; await old.close(); }
  const module = application === SOURCE ? { startServer } : await import(pathToFileURL(join(application, 'server.mjs')).href);
  // The original download journal binds baseUrl as well as export identity. Keep
  // each receiving endpoint stable across a process restart instead of changing
  // its port underneath a retained partial download.
  const endpointKey = directory === receivedPath ? 'received-server-port' : 'original-server-port';
  const port = journal.state.values[endpointKey] ?? 0;
  host = await module.startServer({ directory, port, token: operatorToken, producerToken });
  const actualPort = Number(new URL(host.url).port);
  const selectedPort = await journal.value(endpointKey, async () => actualPort);
  assert.equal(actualPort, selectedPort, 'Continue the original receiving endpoint');
  const id = await journal.value('workspaceId', async () => host.identity.workspaceId);
  assert.equal(host.identity.workspaceId, id, 'Continue the selected original workspace');
  await configure();
}
async function command(label, args, expected = 0, application = SOURCE) {
  return journal.command(label, process.execPath, [join(application, 'cli.mjs'), 'native-python', ...args], {
    cwd: ROOT, expected,
    env: { ...process.env, PYTHONPATH: SDK, PYTHONUNBUFFERED: '1' }
  });
}
const plan = (directory, operation, application = SOURCE) => [
  'emit', '--directory', directory, '--config', configPath, '--operation-id', operation,
  ...ORIGINALS.flatMap(x => ['--input', join(application, x.file)])
];
const resume = directory => ['resume', '--directory', directory, '--config', configPath];
async function prepared(directory) {
  // The native writer publishes originals before plan.json. A process killed
  // in that interval must finish emit/prepare_inputs, not resume a missing plan.
  const path = join(directory, 'plan.json');
  if (!await exists(path)) return false;
  const plan = await readJson(path);
  assert.equal(plan.schema, 'commons.openlineage.python-producer.v1.plan');
  assert.ok(Array.isArray(plan.files) && plan.files.length);
  return true;
}
async function requests(directory) {
  const base = join(directory, 'requests');
  if (!await exists(base)) return [];
  const result = [];
  for (const name of (await fs.readdir(base)).sort()) {
    const request = await readJson(join(base, name));
    result.push({ name, request });
  }
  return result;
}
async function verifyRequests(directory, encoding) {
  const rows = await requests(directory), result = [], eventIds = [];
  assert.equal(rows.length, 2);
  for (const { name, request } of rows) {
    const receipt = await readJson(join(directory, 'receipts', name));
    assert.equal(request.contentEncoding, encoding);
    const wire = Buffer.from(request.wireBase64, 'base64');
    const decoded = encoding === 'gzip' ? gunzipSync(wire) : wire;
    assert.equal(hash(wire), request.wireSha256);
    assert.equal(hash(decoded), request.serializedSha256);
    assert.equal(receipt.sdkVersion, '1.53.0');
    assert.equal(receipt.acknowledgement.workspaceId, journal.state.values.workspaceId);
    const original = await operator().action('source.read', { id: request.wireSha256, decode: true });
    assert.deepEqual(Buffer.from(original.base64, 'base64'), wire);
    if (encoding === 'gzip') assert.deepEqual(Buffer.from(original.decodedBase64, 'base64'), decoded);
    eventIds.push(...parseSource(decoded).events.map(x => x.id));
    result.push({ request, receipt });
  }
  assert.equal(new Set(eventIds).size, 2);
  return result;
}
async function exportWorkspace(key, filename, expectedSources) {
  // The returned original export id is pinned before downloading; repeat reads resume that same export.
  const descriptor = await journal.value(`${key}-descriptor`, () => operator().exportWorkspace());
  const path = join(DIRECTORY, filename);
  const check = async candidate => {
    const bytes = await fs.readFile(candidate), verified = verifyBundle(bytes);
    assert.equal(verified.packageSha256, descriptor.id);
    assert.equal(verified.application.size, APPLICATION_FILES.length);
    assert.equal(JSON.parse(bytes).applicationVersion, APPLICATION_VERSION);
    assert.equal(verified.state.sources.length, expectedSources);
    for (const entry of members) {
      const source = verified.application.get(entry.path);
      assert.ok(source, `Complete original application file ${entry.path}`);
      assert.equal(source.length, entry.bytes); assert.equal(hash(source), entry.sha256);
    }
    return { verified, bytes };
  };
  if (!await exists(path)) {
    const temporary = path + '.download';
    await operator().downloadExport(descriptor.id, temporary);
    await check(temporary);
    await fs.rename(temporary, path);
  }
  const { bytes } = await check(path);
  return { ...descriptor, path, bytes: bytes.length, sha256: hash(bytes), applicationFiles: APPLICATION_FILES.length };
}
async function receiveOriginal(exported) {
  const bytes = await fs.readFile(exported.path), verified = verifyBundle(bytes);
  assert.equal(verified.packageSha256, exported.id);
  if (!await exists(receivedPath)) {
    const attempts = journal.state.values.receivingAttempts ??= [];
    let attempt = attempts.length + 1;
    let staging = `${receivedPath}.stage-${exported.id}-${attempt}`;
    while (await exists(staging)) { attempt++; staging = `${receivedPath}.stage-${exported.id}-${attempt}`; }
    // Extraction is local and create-only. Retain an interrupted extraction; never overwrite it.
    attempts.push({ path: staging, exportId: exported.id }); await journal.save();
    await receiveBundle(bytes, staging);
    await fs.rename(staging, receivedPath);
  }
  for (const [path, expected] of verified.application) {
    const actual = await fs.readFile(join(receivedPath, 'application', path));
    assert.deepEqual(actual, expected, `Received original application file ${path}`);
  }
  return { directory: receivedPath, exportId: exported.id, applicationFiles: verified.application.size };
}
async function checkpoint() {
  const output = {
    schema: 'commons.openlineage.python-native-operation.v2',
    operationId: OPERATION, parentOperation: 'SCF-OPENLINEAGE-OPERATIONS-6804-20261012',
    workspaceId: journal.state.values.workspaceId, sdkVersion: '1.53.0',
    identity: journal.state.identity, values: journal.state.values, phases: journal.state.phases,
    commands: journal.state.commands, savedAt: new Date().toISOString()
  };
  // Contains token-file paths, not token values; complete raw logs remain private.
  await atomicJson(join(DIRECTORY, 'python-connected-operation.json'), output);
}
try {
  // Check the exact installed SDK before creating any business operation.
  await journal.phase('sdk', async () => {
    const result = await journal.command('sdk-version', 'python', ['-c',
      'import importlib.metadata as m; import openlineage.client; assert m.version("openlineage-python")=="1.53.0"; print(m.version("openlineage-python"))'],
      { env: { ...process.env, PYTHONPATH: SDK } });
    return { version: '1.53.0', output: result.output };
  });
  if (journal.state.phases.complete?.state === 'complete') {
    const final = journal.state.phases.complete.value;
    const bytes = await fs.readFile(final.path);
    assert.equal(hash(bytes), final.sha256); verifyBundle(bytes);
    console.log('PYTHON_NATIVE_RESULT ' + JSON.stringify({ ...final, replayedCompletion: true }));
  } else {
    await start();
    const backpressure = await journal.phase('backpressure', async () => {
      const rows = await requests(PRODUCER);
      if (rows.length === 0) {
        const args = await prepared(PRODUCER) ? resume(PRODUCER) : plan(PRODUCER, OPERATION);
        await host.workspace.lock(() => command('locked-original-emit', args, 1));
      }
      const status = await command('status-pending', ['status', '--directory', PRODUCER]);
      assert.equal(status.value.preparedRequests, 1);
      assert.equal(status.value.acknowledgedEvents, 0);
      assert.equal(status.value.pendingRequests.length, 1);
      const first = (await requests(PRODUCER))[0];
      const failure = await readJson(join(PRODUCER, 'failures', first.name));
      assert.equal(failure.status, 503); assert.equal(failure.retryAfter, '1');
      assert.equal((await operator().read()).sources.length, 0);
      return { name: first.name, request: first.request, httpStatus: 503, retryAfter: '1' };
    });
    await journal.phase('pending-restart-and-resume', async () => {
      const prior = host.identity.instanceId; await start();
      assert.notEqual(host.identity.instanceId, prior);
      const result = await command('resume-pending-original', resume(PRODUCER));
      assert.equal(result.value.preparedRequests, 2); assert.equal(result.value.acknowledgedEvents, 2);
      assert.equal(result.value.pendingRequests.length, 0);
      const after = await readJson(join(PRODUCER, 'requests', backpressure.name));
      assert.equal(after.wireSha256, backpressure.request.wireSha256);
      assert.equal(after.wireBase64, backpressure.request.wireBase64);
      return { prior, current: host.identity.instanceId, retainedWire: after.wireSha256 };
    });
    await journal.phase('native-requests', async () => {
      const rows = await verifyRequests(PRODUCER, 'gzip');
      const view = await operator().read();
      assert.equal(view.sources.length, 2); assert.equal(view.eventCount, 2);
      return rows;
    });
    await journal.phase('completed-restart', async () => {
      const baseline = await journal.value('completed-restart-baseline', () => operator().metadata());
      const prior = host.identity.instanceId; await start();
      const result = await command('resume-completed-original', resume(PRODUCER));
      assert.equal(result.value.acknowledgedEvents, 2);
      assert.equal((await operator().metadata()).revision, baseline.revision);
      const state = await host.workspace.read();
      assert.equal(state.operations.filter(x => x.id.startsWith(OPERATION + '/')).length, 2);
      return { prior, current: host.identity.instanceId, revision: baseline.revision };
    });
    await journal.phase('edition', async () => {
      const payload = await journal.value('edition-payload', async () => ({
        title: 'Native Python producer intake',
        description: 'Released OpenLineage Python 1.53.0 emitted unchanged upstream source events through its HTTP transport.',
        operationId: OPERATION + '/edition', expectedRevision: (await operator().metadata()).revision
      }));
      const result = await operator().saveEdition(payload);
      return result.edition;
    });
    const exported = await journal.phase('original-export', () => exportWorkspace('original', 'workspace-native.json', 2));
    await journal.phase('receive-application', () => receiveOriginal(exported));
    await start(receivedPath, join(receivedPath, 'application'));
    const edition = journal.state.phases.edition.value;
    assert.equal((await operator().read()).editions[0].id, edition.id);
    await journal.phase('packaged-cli-resume', async () => {
      const result = await command('packaged-cli-resume', resume(PRODUCER), 0, join(receivedPath, 'application'));
      assert.equal(result.value.acknowledgedEvents, 2);
      assert.equal((await operator().metadata()).revision, exported.revision);
      return { revision: exported.revision, acknowledgedEvents: 2 };
    });
    await configure('identity');
    await journal.phase('packaged-identity-emit', async () => {
      const wasPrepared = await prepared(identityDirectory);
      const args = wasPrepared ? resume(identityDirectory) :
        plan(identityDirectory, OPERATION + '/received-identity', join(receivedPath, 'application'));
      const result = await command(wasPrepared ? 'packaged-identity-resume' : 'packaged-identity-emit', args, 0, join(receivedPath, 'application'));
      assert.equal(result.value.acknowledgedEvents, 2);
      return { acknowledgedEvents: 2 };
    });
    await journal.phase('packaged-native-requests', () => verifyRequests(identityDirectory, 'identity'));
    await journal.phase('saved-gzip-replay', async () => {
      const baseline = await journal.value('gzip-replay-baseline', () => operator().metadata());
      const first = backpressure.request;
      const replay = await new LineageClient(host.url, { token: producerToken, expectedWorkspaceId: journal.state.values.workspaceId })
        .emitSource(Buffer.from(first.wireBase64, 'base64'), { contentEncoding: first.contentEncoding, operationId: first.operationId });
      assert.equal(replay.replayed, true);
      assert.equal((await operator().metadata()).revision, baseline.revision);
      const view = await operator().read(); assert.equal(view.eventCount, 2); assert.equal(view.sources.length, 4);
      return { revision: baseline.revision, replay };
    });
    const final = await journal.phase('complete', async () => ({
      ...await exportWorkspace('complete', 'received-native-complete.json', 4),
      operationId: OPERATION, workspaceId: journal.state.values.workspaceId,
      state: 'NATIVE_EXPORTED_AND_REOPENED', sdkVersion: '1.53.0',
      originalEvents: 2, receivedSources: 4, unchangedPendingWire: backpressure.request.wireSha256
    }));
    console.log('PYTHON_NATIVE_RESULT ' + JSON.stringify(final));
  }
} catch (error) {
  await journal.save();
  await atomicJson(join(DIRECTORY, 'last-error.private.json'), { message: error.message, stack: error.stack });
  console.error('Original receiving interrupted; full details retained in python-operation/last-error.private.json');
  process.exitCode = 1;
} finally {
  try { if (host) await host.close(); } finally { await checkpoint(); }
}
