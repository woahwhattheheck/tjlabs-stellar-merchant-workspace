// MIT. One product session owns the original gRPC browser and its merchant MCP connection.
import { mkdir, readdir, rename, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PRODUCT_SCHEMA, SESSION_SCHEMA, ALIAS, UUID, plain, canonical, sha256, need,
  absolute, exists, privateDirectory, privateBytes, publish, syncDirectory, decode,
  leaseProduct, originalPaths, launchOptions, failure } from './common.mjs';

function title(value) {
  need(typeof value === 'string' && value.trim() && value.length <= 160 && !/[\x00-\x1f\x7f]/.test(value),
    'Give this product a printable name of at most 160 characters.');
  return value.trim();
}
function sourceHandles(bytes, base) {
  if (!bytes) return { captures: {}, files: {}, reflections: {}, destinations: {} };
  const raw = decode(bytes);
  need(plain(raw) && raw.schema === 'stellar-forge.grpc-product-handles.v1' &&
    Object.keys(raw).every(key => ['schema', 'captures', 'files', 'reflections', 'destinations'].includes(key)),
  'Select original capture, reflection and receiving file handles.');
  const result = {};
  for (const [kind, paths] of Object.entries({
    captures: ['directory', 'sourceFile', 'planFile'], files: ['path'], reflections: ['sourceFile'], destinations: ['directory'],
  })) {
    need(raw[kind] === undefined || plain(raw[kind]), 'Supply a native handle map.');
    result[kind] = Object.fromEntries(Object.entries(raw[kind] ?? {}).map(([alias, value]) => {
      need(ALIAS.test(alias) && plain(value), 'Use original native handle aliases and declarations.');
      const entry = { ...value };
      for (const name of paths) if (entry[name] !== undefined) {
        need(typeof entry[name] === 'string' && entry[name].length && !entry[name].includes('\0'),
          'A native handle must reference an original host path.');
        entry[name] = resolve(base, entry[name]);
      }
      return [alias, entry];
    }));
  }
  return result;
}

/** Continue a partial setup with its same directory, UUID, original workspace and handles. */
export async function initializeGrpcProduct(input = {}) {
  const directory = absolute(input.directory);
  await privateDirectory(dirname(directory));
  const existed = await exists(directory);
  await privateDirectory(directory, true);
  const lease = leaseProduct(directory);
  try {
    const saved = await privateBytes(join(directory, 'product.setup.json'), true);
    const old = saved ? decode(saved) : null;
    if (!old && existed && (await readdir(directory)).some(name => name !== 'writer.lease'))
      throw failure('CONFLICT', 'Use an empty private product directory or this product’s retained setup.');
    if (old) need(old.schema === PRODUCT_SCHEMA && old.directory === directory && UUID.test(old.productId), 'Open the original product setup.');
    const workspaceDirectory = absolute(input.workspaceDirectory ?? old?.workspaceDirectory ?? join(directory, 'workspace'));
    need(workspaceDirectory !== directory && !directory.startsWith(workspaceDirectory + '/'),
      'The native workspace must have its own directory; it cannot contain the product directory.');
    const workspace = input.workspace ?? old?.workspace ?? 'grpc';
    need(ALIAS.test(workspace), 'Use a native gRPC workspace alias.');
    const handlesFile = input.handlesFile === undefined ? old?.handlesFile ?? null : absolute(input.handlesFile);
    const handleBytes = handlesFile ? await privateBytes(handlesFile) : null;
    const setup = { schema: PRODUCT_SCHEMA, productId: old?.productId ?? randomUUID(),
      createdAt: old?.createdAt ?? new Date().toISOString(), directory, workspaceDirectory, workspace,
      name: title(input.name ?? old?.name ?? 'gRPC merchant'),
      handlesFile, handlesSha256: handleBytes ? sha256(handleBytes) : null };
    if (old && canonical(old) !== canonical(setup))
      throw failure('CONFLICT', 'Continue setup with the original workspace, alias, handles and name.');
    await publish(join(directory, 'product.setup.json'), setup);
    await privateDirectory(dirname(workspaceDirectory));
    await privateDirectory(workspaceDirectory, true);
    const paths = originalPaths(directory);
    await privateDirectory(paths.receivingDirectory, true);
    const nativeConnection = { schema: 'stellar-forge.grpc-workspace-connection.v1',
      workspaces: { [workspace]: { label: setup.name, consoleUrlFile: paths.consoleUrlFile,
        ...sourceHandles(handleBytes, handlesFile ? dirname(handlesFile) : directory) } } };
    if (!await exists(paths.connection)) await publish(paths.connection, nativeConnection);
    const { readGrpcWorkspaceConfiguration } = await import('../../stellar-forge/mcp-merchant-operator/grpc-workspace.mjs');
    const configured = await readGrpcWorkspaceConfiguration(paths.connection);
    need(configured.workspaces[workspace]?.consoleUrlFile === paths.consoleUrlFile &&
      Object.keys(configured.workspaces).length === 1, 'This product retains its original native console and workspace alias.');
    const { initializeGrpcWorkspaceMerchant, readMerchantConfig } = await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
    if (!await exists(paths.configuration)) {
      const staging = join(directory, 'initialization');
      await privateDirectory(staging, true);
      const stage = join(staging, randomUUID());
      await initializeGrpcWorkspaceMerchant({ directory: stage, connection: paths.connection, name: setup.name });
      lease.assertHeld();
      try { await rename(stage, join(directory, 'operator')); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
      await syncDirectory(directory);
    }
    const native = await readMerchantConfig(paths.configuration);
    const raw = decode(await privateBytes(paths.configuration));
    need(native.grpcWorkspaces?.workspaces[workspace] &&
      resolve(dirname(paths.configuration), raw.grpcWorkspaceConnection) === paths.connection && raw.name === setup.name,
    'The original native merchant configuration belongs to this product.');
    const profile = { ...setup, ...paths };
    lease.assertHeld();
    await publish(join(directory, 'product.json'), profile);
    return { state: 'INITIALIZED', profile, owner: 'ORIGINAL_GRPC_WORKSPACE',
      handles: { captures: Object.keys(configured.workspaces[workspace].captures),
        reflections: Object.keys(configured.workspaces[workspace].reflections),
        files: Object.keys(configured.workspaces[workspace].files), destinations: Object.keys(configured.workspaces[workspace].destinations ?? {}) } };
  } finally { await lease.close(); }
}

export async function readGrpcProduct(directory) {
  directory = await privateDirectory(directory);
  const profile = decode(await privateBytes(join(directory, 'product.json')));
  need(plain(profile) && profile.schema === PRODUCT_SCHEMA && profile.directory === directory &&
    UUID.test(profile.productId ?? '') && ALIAS.test(profile.workspace ?? '') &&
    Object.entries(originalPaths(directory)).every(([key, value]) => profile[key] === value),
  'Select an initialized original gRPC product.');
  await privateDirectory(profile.workspaceDirectory);
  const { readMerchantConfig } = await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
  const native = await readMerchantConfig(profile.configuration);
  const raw = decode(await privateBytes(profile.configuration));
  need(typeof raw.grpcWorkspaceConnection === 'string' &&
    resolve(dirname(profile.configuration), raw.grpcWorkspaceConnection) === profile.connection,
  'The product must retain its original native gRPC connection.');
  const selected = native.grpcWorkspaces?.workspaces[profile.workspace];
  need(selected?.consoleUrlFile === profile.consoleUrlFile && selected.consoleUrlEnv === undefined &&
    Object.keys(native.grpcWorkspaces.workspaces).length === 1,
  'The product connection must select its original native workspace and private URL file.');
  return { profile, native, selected };
}
export async function inspectGrpcProduct(directory) {
  const { profile, selected } = await readGrpcProduct(directory);
  const { inspectGrpcWorkspaceBinding } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/workspace/binding.mjs');
  const binding = await inspectGrpcWorkspaceBinding(profile.workspaceDirectory);
  const saved = await privateBytes(profile.connectionFile, true, 65536);
  const session = saved ? decode(saved) : null;
  return { schema: 'stellar-forge.grpc-product-inspection.v1', profile, workspace: binding,
    handles: { captures: Object.keys(selected.captures), reflections: Object.keys(selected.reflections), files: Object.keys(selected.files), destinations: Object.keys(selected.destinations ?? {}) },
    session: session ? { state: session.state, instanceId: session.instanceId, startedAt: session.startedAt,
      endedAt: session.endedAt, nativeInstanceId: session.nativeInstanceId,
      operatorUrl: session.operatorUrl ?? null, operatorDirectory: session.operatorDirectory ?? null,
      operatorWorkspaceId: session.operatorWorkspaceId ?? null, operatorSourceSha256: session.operatorSourceSha256 ?? null,
      note: 'Retained session status; use the live original console or agent for current operation status.' } : null };
}

/** Open both listeners around one native writer; the merchant provider calls that same console. */
export async function openGrpcProduct(input = {}, { environment = process.env } = {}) {
  const { inspectGrpcProductLaunch } = await import('./managed.mjs');
  const options = launchOptions(input), first = await inspectGrpcProductLaunch(options, { environment });
  const lease = leaseProduct(first.directory);
  let native, agent, started, closing;
  const initial = { schema: SESSION_SCHEMA, state: 'STARTING', productId: first.profile.productId,
    workspace: first.profile.workspace, directory: first.directory, workspaceDirectory: first.profile.workspaceDirectory,
    instanceId: randomUUID(), startedAt: new Date().toISOString(), bindingSha256: first.bindingSha256,
    resourceId: first.resourceId, connectionFile: first.profile.connectionFile,
    consoleUrlFile: first.profile.consoleUrlFile, port: options.port, workspacePort: options.workspacePort,
    tokenEnv: options.tokenEnv, browserOnly: options.browserOnly, browserUrl: null, mcpUrl: null,
    operatorUrl: null, operatorDirectory: first.operatorConsole?.directory ?? null,
    operatorWorkspaceId: first.operatorConsole?.workspaceId ?? null,
    operatorSourceSha256: first.operatorConsole?.source.sha256 ?? null };
  const save = value => publish(first.profile.connectionFile, value, true);
  async function finish(finalState = 'CLOSED', sourceError) {
    const errors = [];
    try { lease.assertHeld(); await save({ ...initial, ...started, state: 'CLOSING' }); } catch (error) { errors.push(error); }
    let agentClosed = !agent, nativeClosed = !native;
    try { await agent?.close(); agentClosed = true; } catch (error) { errors.push(error); }
    // Always reach the native owner, including when the agent's own close failed.
    try { await native?.close(); nativeClosed = true; } catch (error) { errors.push(error); }
    try {
      lease.assertHeld();
      await save({ ...initial, ...started, state: agentClosed && nativeClosed ? finalState : 'STOP_UNCONFIRMED',
        endedAt: new Date().toISOString(),
        ...(sourceError || errors.length ? { errors: [sourceError, ...errors].filter(Boolean).map(error => String(error.code ?? 'GRPC_PRODUCT_CLOSE_FAILED')) } : {}) });
    } catch (error) { errors.push(error); }
    if (agentClosed && nativeClosed) await lease.close();
    if (errors.length) throw Object.assign(new AggregateError(errors, 'The original product close needs continuation.'), { code: 'GRPC_PRODUCT_CLOSE_INCOMPLETE' });
  }
  try {
    const selected = await inspectGrpcProductLaunch(options, { environment });
    need(selected.bindingSha256 === first.bindingSha256 &&
      (input.expectedBindingSha256 === undefined || input.expectedBindingSha256 === selected.bindingSha256),
    'The saved native workspace or launch configuration changed. Review it again.', 'BINDING_CHANGED');
    await save(initial);
    const [{ startGrpcWorkspace }, { nativeFactoryFor }] = await Promise.all([
      import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/workspace/server.mjs'),
      import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/start.mjs'),
    ]);
    const nativeFactory = await nativeFactoryFor(options.facilitator, options.allowLocalFacilitator);
    native = await startGrpcWorkspace({ stateDirectory: first.profile.workspaceDirectory, port: options.workspacePort,
      managedSelection: selected.nativeSelection, nativeFactory, env: environment,
      sellerPort: options.sellerPort, operationsPort: options.operationsPort,
      releaseRuntime: { port: options.sellerPort,
        ...(options.facilitator ? { facilitator: options.facilitator } : {}),
        ...(options.allowLocalFacilitator ? { allowLocalFacilitator: true } : {}) } });
    const nativeLaunch = native.managedLaunch();
    need(nativeLaunch?.state === 'LISTENING' && nativeLaunch.sourceSha256 === selected.nativeSelection.sourceSha256,
      'The original gRPC owner must return its reviewed source and live instance.', 'NATIVE_STARTUP');
    await publish(first.profile.consoleUrlFile, native.url + '\n', true);
    if (!options.browserOnly) {
      const { startMerchantMcp } = await import('../../stellar-forge/mcp-merchant-operator/serve.mjs');
      agent = await startMerchantMcp({ configPath: first.profile.configuration, port: options.port,
        tokenEnv: options.tokenEnv, environment, consoleDirectory: selected.operatorConsole.directory });
    }
    // Opening the native store can create internal directories; current contract selection remains bound by the native owner.
    const confirmed = await readGrpcProduct(first.directory);
    need(canonical(confirmed.profile) === canonical(first.profile), 'The product changed during startup.', 'BINDING_CHANGED');
    for (const file of selected.files) need(sha256(await privateBytes(file.path, false, file.maximum ?? 1024 * 1024)) === file.sha256,
      'A reviewed product configuration changed during startup.', 'BINDING_CHANGED');
    let operatorWorkspaceId = null;
    if (agent) {
      const { merchantConsoleSource, inspectMerchantConsoleDirectory } = await import('../../stellar-forge/mcp-merchant-operator/console/managed.mjs');
      const expected = selected.operatorConsole;
      const current = await inspectMerchantConsoleDirectory(expected.directory);
      need(canonical(await merchantConsoleSource()) === canonical(expected.source),
        'The installed merchant Console source changed during startup.', 'BINDING_CHANGED');
      need(agent.operatorConsole && UUID.test(agent.operatorConsole.store?.id ?? '') &&
        current.directory === expected.directory && current.workspaceId === agent.operatorConsole.store.id &&
        (expected.workspaceId === null || current.workspaceId === expected.workspaceId),
      'The original merchant Console must retain its selected private workspace.', 'CONSOLE_STARTUP');
      let endpoint, operatorUrl;
      try { endpoint = new URL(agent.url); operatorUrl = new URL(agent.consoleUrl); } catch {}
      need(endpoint && operatorUrl && operatorUrl.protocol === 'http:' && operatorUrl.hostname === '127.0.0.1' &&
        operatorUrl.origin === endpoint.origin && operatorUrl.pathname === '/operator/' &&
        !operatorUrl.username && !operatorUrl.password && !operatorUrl.search && !operatorUrl.hash,
      'The merchant owner must return its original local Console URL.', 'CONSOLE_STARTUP');
      operatorWorkspaceId = current.workspaceId;
    }
    lease.assertHeld();
    started = { state: 'OPEN', browserUrl: native.url, mcpUrl: agent ? new URL('/mcp', agent.url).href : null,
      operatorUrl: agent?.consoleUrl ?? null, operatorWorkspaceId,
      nativeInstanceId: nativeLaunch.instanceId, nativeLaunch };
    await save({ ...initial, ...started });
    return { ...initial, ...started, native, operator: agent?.operator,
      close() { return closing ??= finish().catch(error => { closing = null; throw error; }); } };
  } catch (error) {
    try { await finish('FAILED', error); } catch (closeError) { throw new AggregateError([error, closeError], 'Original gRPC startup and close require continuation.'); }
    throw error;
  }
}
