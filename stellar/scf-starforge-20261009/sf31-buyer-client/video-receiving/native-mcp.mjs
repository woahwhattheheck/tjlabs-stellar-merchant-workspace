// MIT. Complete receiving through the exact installed x402engine MCP host and real MCP protocol.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, rename, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const [sourceRoot, upstream, delivery, fixturePath] = process.argv.slice(2);
const prefix = 'stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving';
const report = { schema: 'tjlabs.x402engine-video-mcp-native.v1',
  operation: 'X402ENGINE-MCP-COMPLETE-INTEGRATION-48DB-20261012',
  startedAt: new Date().toISOString(), node: process.version, sourceRoot, upstream,
  providerContract: 'https://x402engine.app/docs/',
  fixtureKind: 'DOCUMENTED_VIDEO_PROTOCOL', complete: false, stages: [] };
const originalFetch = globalThis.fetch, closers = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const record = (stage, detail = {}) => {
  report.stages.push({ stage, at: new Date().toISOString(), ...detail });
  process.stdout.write(JSON.stringify({ event: 'mcp_receiving_stage', stage, ...detail }) + '\n');
};
const command = async (name, args, label) => {
  const result = spawnSync(name, args, { cwd: upstream, encoding: 'utf8', maxBuffer: 32 * 1048576,
    timeout: 180000, env: { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH } });
  await writeFile(join(delivery, label + '.stdout'), result.stdout ?? '', { mode: 0o600 });
  await writeFile(join(delivery, label + '.stderr'), result.stderr ?? '', { mode: 0o600 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, label + ' failed; inspect complete stdout/stderr');
  return result.stdout;
};
const paths = async (root, base = '') => {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = join(base, entry.name);
    if (entry.isDirectory()) result.push(...await paths(join(root, entry.name), file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
};
try {
  assert(sourceRoot && upstream && delivery && fixturePath);
  await mkdir(delivery, { recursive: true, mode: 0o700 });
  const { installX402VideoMcp } = await import(pathToFileURL(join(sourceRoot, prefix, 'install-mcp.mjs')));
  const installation = await installX402VideoMcp({ directory: upstream, sourceRoot });
  const vendor = join(upstream, 'vendor/tjlabs-video');
  const interruptedWrite = join(vendor, '.write-' + randomUUID());
  await writeFile(interruptedWrite, await readFile(join(vendor, 'index.mjs')), { mode: 0o600 });
  const reinstalled = await installX402VideoMcp({ directory: upstream, sourceRoot });
  assert.deepEqual(reinstalled.postimages, installation.postimages);
  assert((await stat(interruptedWrite)).isFile());
  await command('npm', ['run', 'build', '--', '--pretty', 'false'], 'original-npm-build');
  const packed = JSON.parse(await command('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], 'npm-package'));
  const packagePaths = new Set(packed[0].files.map(file => file.path));
  for (const file of ['dist/cli.js', 'dist/index.js', 'dist/index.d.ts',
    'vendor/tjlabs-video/index.mjs', 'vendor/tjlabs-video/index.d.mts',
    'vendor/tjlabs-video/installation.json']) assert(packagePaths.has(file), file);
  const manifest = JSON.parse(await readFile(installation.manifest));
  for (const file of manifest.source) assert(packagePaths.has('vendor/tjlabs-video/' + file.file), file.file);
  assert(![...packagePaths].some(file => /(^|\/)\.write-/.test(file) || file.endsWith('/.sf98-delivery.lock')));
  const paymentBefore = await readFile(join(upstream, 'src/payment.ts'));
  assert.equal(hash(paymentBefore), manifest.original['src/payment.ts']);
  report.installation = { ...installation, packagedFiles: packed[0].files.length,
    packagedBytes: packed[0].unpackedSize, manifest };
  record('exact_upstream_installed_reinstalled_built_and_packaged', {
    runtimeFiles: installation.runtimeFiles, packagedFiles: packed[0].files.length });
  const request = createRequire(join(upstream, 'package.json'));
  const load = name => import(pathToFileURL(request.resolve(name)));
  const [{ Client }, { McpServer }, { InMemoryTransport }, { z }] = await Promise.all([
    load('@modelcontextprotocol/sdk/client/index.js'), load('@modelcontextprotocol/sdk/server/mcp.js'),
    load('@modelcontextprotocol/sdk/inMemory.js'), load('zod') ]);
  const connect = async server => {
    const client = new Client({ name: 'complete-video-receiver', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    closers.push(() => client.close(), () => server.close());
    return client;
  };
  const call = async (client, name, args = {}, expectError = false) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(Boolean(result.isError), expectError, name + ': ' + JSON.stringify(result));
    const bodies = result.content.filter(item => item.type === 'text');
    assert.equal(bodies.length, 1);
    return JSON.parse(bodies[0].text);
  };
  for (const key of ['X402_EVM_PRIVATE_KEY', 'X402_SOLANA_PRIVATE_KEY', 'X402_PAYMENT_HEADER', 'X402_DEV_BYPASS'])
    delete process.env[key];
  process.env.X402_PAYMENT_NETWORK = 'auto';
  process.env.X402_MAX_PAYMENT_USD = '1.00';
  process.env.X402_BASE_URL = 'https://x402engine.app';
  const workspaceDirectory = join(delivery, 'original-workspace');
  process.env.X402_VIDEO_DIRECTORY = workspaceDirectory;
  const fixture = await readFile(fixturePath);
  assert(fixture.length > 65536);
  report.fixture = { bytes: fixture.length, sha256: hash(fixture), durationSeconds: 5, dimensions: [1280,720] };
  const status = key => 'https://x402engine.app/api/video/status/mcp-original-' + key;
  const media = key => 'https://media.example.com/mcp-original-' + key + '.mp4';
  const accepted = key => Buffer.from(JSON.stringify({ accepted: true, status_url: status(key) }) + '\n');
  const paidCalls = []; let healthCalls = 0;
  const paidFixture = async (url, options) => {
    if (url.endsWith('/api/health/services')) {
      healthCalls++;
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ services: { video: { status: 'healthy' } } }),
        { headers: { 'content-type': 'application/json' } });
    }
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual');
    assert(['https://x402engine.app/api/video/minimax-h3',
      'https://x402engine.app/api/video/seedance-2.5'].includes(url));
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert(!Object.keys(options.headers).some(key => /payment|authorization|cookie/i.test(key)));
    const prompt = JSON.parse(options.body).prompt;
    paidCalls.push({ url, method: options.method, prompt, bytes: Buffer.byteLength(options.body), at: Date.now() });
    if (prompt === 'Original uncertain seedance creation') {
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(accepted('uncertain').subarray(0, 37));
        setTimeout(() => controller.error(Object.assign(new Error('Original acceptance body interrupted'),
          { code: 'FIXTURE_ACCEPTANCE_INTERRUPTED', bytes: 37, providerDetail: { request: 'original-uncertain' } })), 20);
      } }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    const key = prompt === 'Original minimax creation' ? 'minimax' : 'preparation';
    return new Response(accepted(key), { status: 202, headers: { 'content-type': 'application/json' } });
  };
  globalThis.fetch = paidFixture;
  const { createServer } = await import(pathToFileURL(join(upstream, 'dist/index.js')));
  const originalServer = createServer(), client = await connect(originalServer);
  const tools = await client.listTools();
  const expectedTools = ['generate_video', 'list_video_jobs', 'video_status', 'receive_video', 'video_result',
    'recover_video_acceptance', 'export_video_workspace', 'open_video_workspace', 'open_video_operator'];
  for (const name of expectedTools) assert(tools.tools.some(tool => tool.name === name));
  assert.equal(new Set(tools.tools.map(tool => tool.name)).size, tools.tools.length);
  const health = await call(client, 'service_health');
  assert.equal(health.services.video.status, 'healthy'); assert.equal(healthCalls, 1);
  // The original module has already cached its original payment fetch. A new payer
  // or a direct global fetch would fail this complete protocol journey.
  globalThis.fetch = async () => { throw new Error('ORIGINAL_PAYMENT_SINGLETON_WAS_NOT_REUSED'); };
  const firstInput = { operation_key: 'original-minimax', model: 'minimax-h3', prompt: 'Original minimax creation' };
  const first = await call(client, 'generate_video', firstInput);
  assert.equal(first.state, 'ACCEPTED'); assert.equal(first.receiving.sourceKind, 'SAVED_DOCUMENT');
  assert.equal(paidCalls.length, 1);
  assert.equal((await call(client, 'generate_video', firstInput)).id, first.id);
  assert.equal(paidCalls.length, 1);
  await call(client, 'generate_video', { ...firstInput, prompt: 'Changed prompt' }, true);
  assert.equal(paidCalls.length, 1);
  const uncertainInput = { operation_key: 'original-uncertain', model: 'seedance-2.5',
    prompt: 'Original uncertain seedance creation' };
  await call(client, 'generate_video', uncertainInput, true);
  assert.equal(paidCalls.length, 2);
  const uncertain = await call(client, 'generate_video', uncertainInput);
  assert.equal(uncertain.state, 'CREATION_UNCERTAIN'); assert.equal(paidCalls.length, 2);
  const uncertainDirectory = join(workspaceDirectory, 'operations', uncertain.id, 'workspace', 'mcp-creation');
  const failure = JSON.parse(await readFile(join(uncertainDirectory, 'error.json')));
  const privateFailure = JSON.stringify(failure);
  assert(privateFailure.includes('Original acceptance body interrupted'));
  assert(privateFailure.includes('providerDetail'));
  assert(privateFailure.includes('partialPath'));
  let interruptedBytes = 0;
  for (const file of await paths(uncertainDirectory)) if (file.endsWith('.partial'))
    interruptedBytes += (await stat(join(uncertainDirectory, file))).size;
  assert.equal(interruptedBytes, 37);
  const recoveredAcceptance = join(delivery, 'original-uncertain-acceptance.json');
  await writeFile(recoveredAcceptance, accepted('uncertain'), { mode: 0o600 });
  const recovered = await call(client, 'recover_video_acceptance', {
    operation_key: uncertainInput.operation_key, acceptance_file: recoveredAcceptance,
    source_reference: 'Retained original fixture creation response for original-uncertain' });
  assert.equal(recovered.state, 'ACCEPTED'); assert.equal(recovered.creation.recoveredAcceptance, true);
  assert.equal(paidCalls.length, 2);
  record('original_host_payment_singleton_and_both_creation_models', {
    tools: tools.tools.length, originalCreationCalls: paidCalls.length, interruptedAcceptanceBytes: interruptedBytes });
  await client.close(); await originalServer.close();
  globalThis.fetch = originalFetch;
  const installed = join(vendor, prefix);
  const { openX402VideoMcpWorkspace } = await import(pathToFileURL(join(installed, 'mcp-workspace.mjs')));
  const { prepareBuyerResponseFile } = await import(pathToFileURL(join(vendor,
    'stellar/scf-starforge-20261009/sf31-buyer-client/response-file.mjs')));
  const { registerX402VideoTools } = await import(pathToFileURL(join(installed, 'mcp.mjs')));
  const preInput = { operationKey: 'preparation-recovery', model: 'minimax-h3', prompt: 'Original preparation creation' };
  const configurationFailure = Object.assign(new Error('Original local wallet configuration failure'),
    { code: 'ORIGINAL_CONFIG_ERROR', localContext: { preserved: true } });
  Object.defineProperty(configurationFailure, 'privateOriginalField', { value: { bytes: Buffer.from('original detail') } });
  configurationFailure.cause = configurationFailure;
  const failedWorkspace = await openX402VideoMcpWorkspace({ directory: workspaceDirectory,
    baseUrl: process.env.X402_BASE_URL, getRequestFetch: async () => { throw configurationFailure; } });
  await assert.rejects(failedWorkspace.create(preInput));
  const prepared = await failedWorkspace.inspect(preInput.operationKey);
  assert.equal(prepared.state, 'PREPARED'); assert.equal(paidCalls.length, 2);
  const preCreation = join(workspaceDirectory, 'operations', prepared.id, 'workspace', 'mcp-creation');
  const preError = JSON.parse(await readFile(join(preCreation, 'preparation-error.json')));
  assert.equal(preError.phase, 'PREPARATION');
  assert(JSON.stringify(preError).includes('privateOriginalField'));
  assert(JSON.stringify(preError).includes('reference'));
  const abandonedId = randomUUID(), abandoned = join(preCreation, 'preparations', abandonedId);
  await mkdir(abandoned, { recursive: true, mode: 0o700 });
  const abandonedWriter = await prepareBuyerResponseFile({ destination: join(abandoned, 'response-body.bin'),
    maxBytes: 1048576, timeoutMs: 60000, reservationTag: 'original-local-abandoned' });
  closers.push(() => abandonedWriter.abort());
  const recoveryWorkspace = await openX402VideoMcpWorkspace({ directory: workspaceDirectory,
    baseUrl: process.env.X402_BASE_URL, getRequestFetch: async () => paidFixture });
  const preparedCreated = await recoveryWorkspace.create(preInput);
  assert.equal(preparedCreated.state, 'ACCEPTED'); assert.equal(paidCalls.length, 3);
  const dispatch = JSON.parse(await readFile(join(preCreation, 'dispatch.json')));
  assert.notEqual(dispatch.preparationId, abandonedId);
  assert((await readdir(join(preCreation, 'preparations'))).includes(abandonedId));
  await abandonedWriter.abort();
  record('original_local_preparation_reservation_recovers_with_full_error_history', {
    originalCreationCalls: paidCalls.length, generations: (await readdir(join(preCreation, 'preparations'))).length });
  const receivingCalls = [];
  const receivingFixture = async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    assert(!Object.keys(options.headers).some(key => /payment|authorization|cookie/i.test(key)));
    receivingCalls.push({ url, method: options.method, at: Date.now() });
    for (const key of ['minimax', 'uncertain', 'preparation']) {
      if (url === status(key)) return new Response(JSON.stringify({ status: 'completed',
        video: { url: media(key), file_size: fixture.length, content_type: 'video/mp4' } }),
        { headers: { 'content-type': 'application/json' } });
      if (url === media(key)) return new Response(fixture,
        { headers: { 'content-type': 'video/mp4', 'content-length': String(fixture.length) } });
    }
    throw new Error('UNEXPECTED_RECEIVING_URL');
  };
  const receivingServer = new McpServer({ name: 'x402engine-reopened', version: '1.1.1' });
  const registration = registerX402VideoTools(receivingServer, { z, directory: workspaceDirectory,
    baseUrl: process.env.X402_BASE_URL, getRequestFetch: async () => { throw new Error('EXTRA_PAID_CREATION'); },
    receivingFetch: receivingFixture });
  closers.push(() => registration.close());
  const receiver = await connect(receivingServer);
  for (const operation_key of ['original-minimax', 'original-uncertain', 'preparation-recovery']) {
    const received = await call(receiver, 'receive_video', { operation_key, deadline_ms: 20000 });
    assert.equal(received.operation.state, 'RECEIVED');
    assert.equal(received.result.bytes, fixture.length); assert.equal(received.result.sha256, hash(fixture));
    const result = await call(receiver, 'video_result', { operation_key });
    assert.equal(result.result.sha256, hash(fixture));
    assert((await readFile(result.result.path)).equals(fixture));
  }
  assert.equal(paidCalls.length, 3); assert.equal(receivingCalls.length, 6);
  const firstPage = await call(receiver, 'list_video_jobs', { limit: 1 });
  assert.equal(firstPage.entries.length, 1); assert.equal(firstPage.complete, false);
  const all = [...firstPage.entries]; let cursor = firstPage.nextCursor;
  while (cursor) {
    const page = await call(receiver, 'list_video_jobs', { limit: 1, cursor });
    all.push(...page.entries); cursor = page.nextCursor;
  }
  assert.equal(all.length, 3); assert.equal(new Set(all.map(item => item.id)).size, 3);
  const resource = await receiver.readResource({ uri: 'x402engine://video-jobs' });
  assert.equal(JSON.parse(resource.contents[0].text).entries.length, 3);
  const exportPath = join(delivery, 'complete-original-export');
  const exported = await call(receiver, 'export_video_workspace', {
    operation_key: 'original-uncertain', destination: exportPath });
  const transferred = join(delivery, 'transferred-original-export');
  await rename(exportPath, transferred);
  const reopened = await call(receiver, 'open_video_workspace', { directory: transferred });
  assert.equal(reopened.operationKey, 'original-uncertain');
  assert.equal(reopened.result.sha256, hash(fixture));
  const exportFiles = await paths(transferred);
  assert(exportFiles.some(file => file.endsWith('mcp-creation/request-body.json')));
  assert(exportFiles.some(file => file.endsWith('mcp-creation/recovered-acceptance-body.json')));
  assert(exportFiles.some(file => file.endsWith('mcp-creation/error.json')));
  assert(exportFiles.some(file => file.endsWith('.partial')));
  record('real_mcp_full_receiving_pagination_resource_and_transferred_handover', {
    originalCreationCalls: paidCalls.length, unpaidReceivingCalls: receivingCalls.length,
    videoBytes: fixture.length, videoSha256: hash(fixture), export: exported.export });
  const operator = await call(receiver, 'open_video_operator', { export_directory: transferred });
  const pageResponse = await originalFetch(operator.origin + '/');
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert(html.includes('video')); assert(html.includes('app.mjs'));
  const sameOperator = await call(receiver, 'open_video_operator', { export_directory: transferred });
  assert.equal(sameOperator.origin, operator.origin);
  await receiver.close(); await receivingServer.close();
  await Promise.all([registration.close(), registration.close()]);
  await assert.rejects(originalFetch(operator.origin + '/', { signal: AbortSignal.timeout(2000) }));
  record('transferred_operator_reuse_and_original_mcp_transport_shutdown');
  const payment = await import(pathToFileURL(join(upstream, 'dist/payment.js')));
  const requirement = { scheme: 'exact', network: payment.BASE_NETWORK, asset: payment.BASE_USDC,
    amount: '1220000', payTo: '0x0000000000000000000000000000000000000001', maxTimeoutSeconds: 60 };
  assert.throws(() => payment.selectPaymentRequirement([requirement],
    { network: 'auto', maxPaymentUsd: '1.00' }), /exceeds/);
  assert.equal(payment.selectPaymentRequirement([requirement], { network: 'base', maxPaymentUsd: '1.22' }), requirement);
  assert.throws(() => payment.selectPaymentRequirement([requirement],
    { network: 'solana', maxPaymentUsd: '5.00' }), /No supported/);
  assert.equal(await payment.createPaymentFetch({ network: 'auto', maxPaymentUsd: '1.00' }, paidFixture), paidFixture);
  assert.equal(hash(await readFile(join(upstream, 'src/payment.ts'))), hash(paymentBefore));
  record('unchanged_original_network_selector_and_payment_cap');
  report.calls = { health: healthCalls, creation: paidCalls, receiving: receivingCalls };
  report.sourceFiles = [];
  for (const file of await paths(join(sourceRoot, prefix))) {
    const bytes = await readFile(join(sourceRoot, prefix, file));
    report.sourceFiles.push({ file, bytes: bytes.length, sha256: hash(bytes) });
  }
  report.complete = true;
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack, code: error.code ?? null };
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await Promise.allSettled(closers.reverse().map(close => close()));
  report.finishedAt = new Date().toISOString();
  await put(join(delivery, 'native-result.json'), report);
  process.stdout.write(JSON.stringify({ event: 'mcp_receiving_complete', complete: report.complete,
    stages: report.stages.length, result: join(delivery, 'native-result.json'), error: report.error ?? null }) + '\n');
}
