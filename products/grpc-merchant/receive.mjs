#!/usr/bin/env node
// MIT. Installed receiving continues the original service-health operation and its saved customer files.
import { readFile, realpath, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { readDistributionSpecification } from '../../stellar/scf-starforge-20261009/distribution/specification.mjs';
import { GRPC_EXPORT_MANIFEST, parseGrpcExportManifest } from '../../stellar-forge/mcp-merchant-operator/grpc-workspace-export.mjs';
import { absolute, canonical, decode, exists, HASH, UUID, need, privateBytes, privateDirectory,
  publish, leaseProduct, sha256 } from './common.mjs';

const OPERATION = 'SCF-GRPC-SERVICE-HEALTH-20261012-9B23';
const SCHEMA = 'stellar-forge.grpc-product-original-receiving.v1';
const PREFIX = 'stellar/scf-starforge-20261009/';
const GRPC = PREFIX + 'sf30-seller-sdk/grpc/';
const PRODUCT = 'products/grpc-merchant/';
const REQUIRED_PRODUCT = ['common.mjs','workspace.mjs','managed.mjs','client.mjs','client.d.mts',
  'cli.mjs','application-provider.mjs','receive.mjs','README.md','OPERATING.md','RECEIVING.md','INSTALL_RECEIVING.md'];
const merchantPhase = 'original-merchant-call-customer-client-and-release';
const healthPhase = 'frozen-receiving-live-growth-and-original-resume';
const json = async (path, optional = false, maximum = 16 * 1024 * 1024) => {
  const bytes = await privateBytes(path, optional, maximum);
  return bytes === null ? null : decode(bytes);
};
const equal = (left, right, message) => need(canonical(left) === canonical(right), message, 'ORIGINAL_RECEIVING_CHANGED');
const digestJSON = value => sha256(canonical(value));
const now = () => new Date().toISOString();

/** The maintained READY/profile/lock verifier selects the actual installed source. */
export async function installedGrpcSource(runtimeDirectory) {
  runtimeDirectory = absolute(runtimeDirectory);
  need(await realpath(runtimeDirectory) === runtimeDirectory, 'Use the original canonical installed runtime.', 'RUNTIME_CHANGED');
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const manifestPath = join(runtimeDirectory, 'package', 'manifest.json');
  const manifestBytes = await readFile(manifestPath);
  need(manifestBytes.length <= 64 * 1024 * 1024, 'The selected source manifest exceeds its native limit.', 'RUNTIME_CHANGED');
  const manifest = decode(manifestBytes);
  need(Array.isArray(manifest.files), 'Use the complete original installation manifest.', 'RUNTIME_CHANGED');
  const inventory = new Map(manifest.files.map(item => [item.path, item]));
  need(inventory.size === manifest.files.length, 'The installed source has repeated paths.', 'RUNTIME_CHANGED');
  const files = [];
  for (const path of REQUIRED_PRODUCT.map(name => PRODUCT + name)) {
    const entry = inventory.get(path);
    need(entry && HASH.test(entry.sha256 ?? '') && Number.isSafeInteger(entry.bytes),
      'The selected installation must contain the full gRPC product: ' + path, 'RUNTIME_INCOMPLETE');
    const bytes = await readFile(join(runtime.sourceRoot, path));
    need(bytes.length === entry.bytes && sha256(bytes) === entry.sha256,
      'An installed original product file changed: ' + path, 'RUNTIME_CHANGED');
    files.push({ path, bytes: entry.bytes, sha256: entry.sha256 });
  }
  const { spec } = await readDistributionSpecification({ sourceRoot: runtime.sourceRoot });
  need(spec.commands['grpc-product'] === PRODUCT + 'cli.mjs' &&
    spec.commands['grpc-product-receive'] === PRODUCT + 'receive.mjs' &&
    spec.applicationProviders?.['grpc-product'] === PRODUCT + 'application-provider.mjs' &&
    spec.merchantProviders?.['grpc-workspaces'] === 'stellar-forge/mcp-merchant-operator/providers/grpc-workspaces.mjs',
  'The selected installation must retain the original gRPC product and provider declarations.', 'RUNTIME_INCOMPLETE');
  return { runtimeDirectory, sourceRoot: runtime.sourceRoot, sourceCommit: runtime.sourceCommit,
    installationId: runtime.installationId, profileId: runtime.profileId, profileSha256: runtime.profileSha256,
    lockSha256: runtime.lockSha256, manifestSha256: sha256(manifestBytes), files };
}

async function originalManifest(directory) {
  const bytes = await privateBytes(join(directory, GRPC_EXPORT_MANIFEST), false, 65000);
  const manifest = parseGrpcExportManifest(bytes);
  return { manifest, manifestSha256: sha256(bytes) };
}
async function originalInputs(nativeWorkDirectory) {
  const directory = await privateDirectory(nativeWorkDirectory);
  const original = await json(join(directory, 'result.json'));
  need(original?.schema === 'stellar-forge.grpc-service-health-native-journey.v1' &&
    original.operation === OPERATION && UUID.test(original.runId ?? '') && original.coreComplete === true &&
    ['COMPLETE','CORE_COMPLETE_BROWSER_PENDING'].includes(original.state) &&
    original.phases?.[merchantPhase]?.state === 'COMPLETE' && original.phases?.[healthPhase]?.state === 'COMPLETE',
  'Continue the original completed health core and retained merchant/customer phases.', 'ORIGINAL_OPERATION_REQUIRED');
  const closed = original.sessions?.at(-1)?.closed;
  need(closed?.workspace === true && closed?.merchant === true && closed?.upstream === true &&
    Object.values(closed).every(value => value === true),
  'Finish closing the original native session before its installed receiving continuation.', 'ORIGINAL_OWNER_ACTIVE');
  const base = original.refs.base, preparation = original.refs['preparation-base'];
  const operationId = original.refs['merchant-summary'], intentId = original.refs['sdk-intent'];
  need(HASH.test(base ?? '') && [preparation, operationId, intentId].every(value => UUID.test(value ?? '')),
    'Retain the original source, preparation, call and generated-client intent identities.', 'ORIGINAL_OPERATION_REQUIRED');
  const customer = await originalManifest(join(directory, 'downloads', 'customer-base'));
  const health = await originalManifest(join(directory, 'downloads', 'health-first'));
  need(customer.manifest.kind === 'customer' && customer.manifest.files.length === 7 &&
    customer.manifest.original.preparation === preparation && customer.manifest.original.revision === base &&
    health.manifest.kind === 'health' && health.manifest.original.revision === base &&
    customer.manifest.workspace === health.manifest.workspace,
  'The received files must belong to the original preparation and native health source.', 'ORIGINAL_RECEIVING_CHANGED');
  const progress = original.refs.healthReceiving;
  need(progress?.exportDescriptor?.exportId === health.manifest.exportId &&
    progress.exportDescriptor.manifestFile?.sha256 === health.manifestSha256 &&
    Number.isSafeInteger(progress.exportIntent?.throughSequence) && progress.exportIntent.throughSequence > 0 &&
    HASH.test(progress.exportIntent.expectedSnapshot ?? ''),
  'Retain the first frozen health export and its original prefix selection.', 'ORIGINAL_RECEIVING_CHANGED');
  const merchant = original.phases[merchantPhase].value;
  need(merchant.operationId === operationId && merchant.preparation === preparation &&
    HASH.test(merchant.responseSha256 ?? ''), 'The original completed native call changed.', 'ORIGINAL_RECEIVING_CHANGED');
  const identity = { operation: OPERATION, runId: original.runId, nativeWorkDirectory: directory,
    workspaceDirectory: join(directory, 'workspace'), workspace: customer.manifest.workspace,
    source: original.source, baseRevision: base, preparation, operationId, intentId,
    responseSha256: merchant.responseSha256, customer, health, healthSelection: progress.exportIntent,
    release: { active: merchant.active, generation: merchant.releaseGeneration } };
  return { original, identity };
}
async function nativeEnvironment(nativeWorkDirectory, environment) {
  const directory = join(nativeWorkDirectory, 'operator', 'credentials');
  const saved = await json(join(directory, 'local-values.json'), false, 65536);
  need(typeof saved?.authorization === 'string' && saved.authorization.length >= 16 &&
    typeof saved.mcpToken === 'string' && saved.mcpToken.length >= 32,
  'Use the original native operation’s private credential references.', 'ORIGINAL_ENVIRONMENT_REQUIRED');
  const decodeText = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { ...environment, GRPC_HEALTH_DEMO_AUTHORIZATION: saved.authorization,
    GRPC_HEALTH_MCP_TOKEN: saved.mcpToken,
    GRPC_HEALTH_CA: decodeText(await privateBytes(join(directory, 'ca.pem'))),
    GRPC_HEALTH_CERTIFICATE: decodeText(await privateBytes(join(directory, 'client.pem'))),
    GRPC_HEALTH_PRIVATE_KEY: decodeText(await privateBytes(join(directory, 'client.key'))) };
}
async function callObservation(identity) {
  const bytes = await privateBytes(join(identity.nativeWorkDirectory, 'operator', 'native-calls.json'), false, 40 * 1024 * 1024);
  const value = decode(bytes);
  need(value.schema === 'stellar-forge.grpc-health-native-calls.v1' && value.operation === OPERATION &&
    value.runId === identity.runId && Array.isArray(value.calls) &&
    value.calls.filter(call => call.method === 'Summary').length === 1,
  'Retain the original endpoint observation and completed application call.', 'ORIGINAL_CALL_CHANGED');
  return { sha256: sha256(bytes), calls: value.calls.length, merchantCalls: 1 };
}

/**
 * This continuation reopens the original workspace. It reads the saved call,
 * publishes the same immutable exports through the installed agent and receives
 * them with the maintained downloader. The upstream endpoint stays stopped.
 */
export async function receiveOriginalGrpcProduct({ runtimeDirectory, nativeWorkDirectory, directory,
  environment = process.env, onProgress = () => {} } = {}) {
  nativeWorkDirectory = absolute(nativeWorkDirectory);
  directory = absolute(directory ?? join(nativeWorkDirectory, 'operator', 'installed-product-receiving'));
  await privateDirectory(resolve(directory, '..'));
  await privateDirectory(directory, true);
  const lease = leaseProduct(directory);
  let active, failed;
  try {
    const installation = await installedGrpcSource(runtimeDirectory);
    const { original, identity } = await originalInputs(nativeWorkDirectory);
    const input = { schema: SCHEMA, directory, installation, original: identity };
    const resultPath = join(directory, 'receiving.json');
    let result = await json(resultPath, true);
    if (result) equal(result.input, input, 'Continue the same installation, original native run and frozen receiving files.');
    else {
      need((await readdir(directory)).every(name => name === 'writer.lease'),
        'Choose a new private receiving directory or its original journal.', 'RECEIVING_DIRECTORY_IN_USE');
      result = { schema: SCHEMA, state: 'STARTED', operation: OPERATION, originalRunId: identity.runId,
        input, startedAt: now(), phases: {}, sessions: [] };
      await publish(resultPath, result);
      await publish(join(directory, 'original-native-result.json'), original);
    }
    // The original snapshot is retained separately from a later browser continuation.
    if (!await exists(join(directory, 'original-native-result.json')))
      await publish(join(directory, 'original-native-result.json'), original);
    const load = path => import(pathToFileURL(join(installation.sourceRoot, path)).href);
    const product = await load(PRODUCT + 'workspace.mjs');
    const { GrpcProductClient, inspectReceivedGrpcProduct } = await load(PRODUCT + 'client.mjs');
    const productDirectory = join(directory, 'product');
    const customerDirectory = join(directory, 'customer');
    const healthDirectory = join(directory, 'health');
    const save = async () => { lease.assertHeld(); await publish(resultPath, result, true); };
    const originalExport = kind => identity[kind];
    const checkReceived = async kind => {
      const expected = originalExport(kind), selected = kind === 'customer' ? customerDirectory : healthDirectory;
      const received = await inspectReceivedGrpcProduct(selected, {
        expectedExportId: expected.manifest.exportId, expectedManifestSha256: expected.manifestSha256 });
      equal(received.files.map(({ path, ...file }) => ({ ...file, path: expected.manifest.files.find(item => item.name === file.name)?.path })),
        expected.manifest.files, 'The receiving directory must keep all original file identities.');
      return received;
    };
    if (result.state === 'COMPLETE') {
      await checkReceived('customer'); await checkReceived('health');
      return result;
    }
    const session = { startedAt: now(), state: 'STARTED', closed: false };
    result.sessions.push(session); result.state = 'STARTED'; delete result.error;
    await save();
    const step = async (name, action) => {
      if (result.phases[name]?.state === 'COMPLETE') return result.phases[name].value;
      result.phases[name] = { state: 'STARTED', startedAt: now() }; await save();
      const value = await action();
      result.phases[name] = { ...result.phases[name], state: 'COMPLETE', finishedAt: now(), value };
      await save(); await onProgress({ operation: OPERATION, originalRunId: identity.runId, phase: name, state: 'COMPLETE' });
      return value;
    };
    const before = await callObservation(identity); session.before = before; await save();
    const env = await nativeEnvironment(nativeWorkDirectory, environment);
    try {
      await step('installed-product-on-original-workspace', async () => {
        const initialized = await product.initializeGrpcProduct({ directory: productDirectory,
          workspaceDirectory: identity.workspaceDirectory, workspace: identity.workspace,
          name: 'Original gRPC health merchant' });
        return { productId: initialized.profile.productId, workspaceDirectory: initialized.profile.workspaceDirectory,
          workspace: initialized.profile.workspace, installationId: installation.installationId,
          sourceCommit: installation.sourceCommit, manifestSha256: installation.manifestSha256 };
      });
      active = await product.openGrpcProduct({ directory: productDirectory, tokenEnv: 'GRPC_HEALTH_MCP_TOKEN' }, { environment: env });
      session.productId = active.productId; session.instanceId = active.instanceId;
      session.nativeInstanceId = active.nativeInstanceId; await save();
      const client = new GrpcProductClient({ directory: productDirectory, productId: active.productId,
        workspace: identity.workspace, environment: env });
      const full = async (value, label) => {
        if (value.state !== 'COMPLETE_RESULT_RETAINED') return value;
        const delivery = value.delivery;
        const target = join(directory, label + '-' + delivery.exportId);
        await client.receive({ exportId: delivery.exportId, expectedManifestSha256: delivery.manifestFile.sha256, directory: target });
        return json(join(target, 'grpc-result.json'), false, 40 * 1024 * 1024);
      };
      await step('original-call-contract-and-release', async () => {
        const status = await client.status(), revision = await client.revision(identity.baseRevision);
        need(status.workspace === identity.workspace && revision.revision === identity.baseRevision,
          'The installed product must open the same native source.', 'ORIGINAL_WORKSPACE_CHANGED');
        const attempt = await full(await client.attempt(identity.operationId), 'attempt');
        need(attempt.id === identity.operationId && attempt.revision === identity.baseRevision &&
          attempt.phase === 'COMPLETED' && attempt.responseSha256 === identity.responseSha256,
        'Recover the exact original completed native output.', 'ORIGINAL_CALL_CHANGED');
        const routes = []; let offset = 0, snapshot;
        for (;;) {
          const page = await client.revision(identity.baseRevision, 'routes', {
            offset, limit: 25, ...(snapshot ? { expectedSnapshot: snapshot } : {}) });
          need(page.offset === offset && Array.isArray(page.items) && HASH.test(page.snapshot ?? ''),
            'Continue the original complete route page.', 'ORIGINAL_PAGE_CHANGED');
          snapshot ??= page.snapshot; need(snapshot === page.snapshot, 'The original route snapshot changed.', 'ORIGINAL_PAGE_CHANGED');
          routes.push(...page.items);
          if (page.nextOffset === null) { need(routes.length === page.total, 'Receive every original route.'); break; }
          need(Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset, 'Continue the returned route cursor.'); offset = page.nextOffset;
        }
        need(routes.length > 0, 'The original preparation has no retained route.', 'ORIGINAL_RECEIVING_CHANGED');
        await publish(join(directory, 'original-routes.json'), { revision: identity.baseRevision, snapshot, routes });
        const { readReleaseState } = await load(PREFIX + 'sf82-seller-pilot/releases.mjs');
        const release = await readReleaseState(join(identity.workspaceDirectory, 'merchant-releases'));
        need(release.active === identity.release.active && release.generation === identity.release.generation,
          'Retain the original selected release and rollback generation.', 'ORIGINAL_RELEASE_CHANGED');
        return { revision, operationId: attempt.id, responseSha256: attempt.responseSha256,
          routes: routes.length, routeSnapshot: snapshot, release: identity.release };
      });
      await step('same-customer-and-frozen-health-exports', async () => {
        const customer = await client.call('merchant_grpc_export', { kind: 'customer', preparation: identity.preparation });
        const health = await client.exportHealth({ operationId: identity.health.manifest.original.operationId, ...identity.healthSelection });
        for (const [kind, exported] of [['customer',customer],['health',health]]) {
          const expected = originalExport(kind);
          need(exported.exportId === expected.manifest.exportId && exported.manifestFile.sha256 === expected.manifestSha256,
            'The installed agent must retain the exact original ' + kind + ' export.', 'ORIGINAL_EXPORT_CHANGED');
          equal(exported.original, expected.manifest.original, 'The export changed its original native operation.');
        }
        // Save both descriptors before the first receiving effect.
        await publish(join(directory, 'exports.json'), { customer, health });
        return { customer, health };
      });
      // A resumed installed process uses the same retained descriptor and byte directory.
      const exports = await json(join(directory, 'exports.json'));
      for (const kind of ['customer','health']) await step('receive-and-repeat-' + kind, async () => {
        const descriptor = exports[kind], target = kind === 'customer' ? customerDirectory : healthDirectory;
        const options = { exportId: descriptor.exportId, expectedManifestSha256: descriptor.manifestFile.sha256,
          directory: target, chunkSize: 65536 };
        await client.receive(options); await client.receive(options);
        const received = await checkReceived(kind);
        return { exportId: received.exportId, manifestSha256: received.manifestSha256,
          bytes: received.bytes, files: received.files.map(file => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
          ...(received.native ? { native: received.native } : {}) };
      });
      await step('generated-customer-request', async () => {
        const saved = await json(join(directory, 'original-routes.json'));
        const route = saved.routes[0];
        const sdk = await import(pathToFileURL(join(customerDirectory, 'client', 'seller-client.mjs')).href);
        const request = sdk.buildRequest(route.id, { body: route.example }, { intentId: identity.intentId, maxAtomic: '25000' });
        need(typeof request.url === 'string' && typeof request.method === 'string',
          'Use the original complete generated client request.', 'ORIGINAL_CUSTOMER_CHANGED');
        await publish(join(directory, 'customer-request.json'), request);
        return { route: route.id, intentId: identity.intentId, method: request.method,
          requestSha256: digestJSON(request), clientFiles: identity.customer.manifest.files.length };
      });
    } finally {
      // The aggregate owner closes both its merchant agent and native console.
      // Keep the reference when close fails so the outer cleanup can continue it.
      if (active) { await active.close(); active = null; }
      session.closed = true; await save();
    }
    await step('closed-native-files-and-original-call-count', async () => {
      const customer = await checkReceived('customer'), health = await checkReceived('health');
      const after = await callObservation(identity);
      equal(after, before, 'The installed receiving must preserve the original endpoint call journal.');
      return { customerExportId: customer.exportId, healthExportId: health.exportId,
        nativeCallJournalSha256: after.sha256, originalMerchantCalls: after.merchantCalls, originalCalls: after.calls };
    });
    await checkReceived('customer'); await checkReceived('health');
    session.after = await callObservation(identity);
    equal(session.after, before, 'The original native calls changed during receiving.');
    session.state = 'COMPLETE'; session.finishedAt = now();
    result.state = 'COMPLETE'; result.finishedAt = now(); await save();
    return result;
  } catch (error) {
    failed = error;
    const resultPath = join(directory, 'receiving.json');
    const result = await json(resultPath, true).catch(() => null);
    if (result) {
      result.state = 'INTERRUPTED';
      result.error = { code: String(error.code ?? error.name ?? 'GRPC_PRODUCT_RECEIVING_ERROR') };
      const session = result.sessions?.at(-1);
      if (session) { session.state = 'INTERRUPTED'; session.finishedAt = now(); }
      await publish(resultPath, result, true);
    }
    throw error;
  } finally {
    const errors = [];
    if (active) try { await active.close(); active = null; } catch (error) { errors.push(error); }
    if (!active) try { await lease.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError([failed, ...errors].filter(Boolean),
      'Continue the original installed receiving cleanup.');
  }
}

export async function main(args = process.argv.slice(2)) {
  const help = 'grpc-product-receive --runtime READY_GRPC_RUNTIME --native-work ORIGINAL_HEALTH_WORK_ROOT [--directory PRIVATE_RECEIVING]\n' +
    'Continues SCF-GRPC-SERVICE-HEALTH-20261012-9B23 with its original workspace, call, preparation and frozen files.\n';
  if (!args.length || args.length === 1 && args[0] === '--help') { process.stdout.write(help); return; }
  const options = new Map();
  need(args.length % 2 === 0, help, 'ARGUMENTS');
  for (let index = 0; index < args.length; index += 2) {
    need(['--runtime','--native-work','--directory'].includes(args[index]) && !options.has(args[index]) &&
      typeof args[index + 1] === 'string' && args[index + 1].length && !args[index + 1].startsWith('--'), help, 'ARGUMENTS');
    options.set(args[index], args[index + 1]);
  }
  need(options.has('--runtime') && options.has('--native-work'), help, 'ARGUMENTS');
  const result = await receiveOriginalGrpcProduct({ runtimeDirectory: absolute(options.get('--runtime')),
    nativeWorkDirectory: absolute(options.get('--native-work')),
    ...(options.has('--directory') ? { directory: absolute(options.get('--directory')) } : {}),
    onProgress: value => process.stdout.write(JSON.stringify(value) + '\n') });
  process.stdout.write(JSON.stringify({ schema: result.schema, state: result.state, operation: result.operation,
    originalRunId: result.originalRunId, directory: result.input.directory,
    sourceCommit: result.input.installation.sourceCommit, installationId: result.input.installation.installationId,
    phases: Object.fromEntries(Object.entries(result.phases).map(([name, phase]) => [name, phase.state])) }) + '\n');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write(String(error.code ?? 'GRPC_PRODUCT_RECEIVING_ERROR') + '\n'); process.exitCode = 1; });
