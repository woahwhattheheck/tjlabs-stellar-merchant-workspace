// MIT. Customer setup over the original GraphQL workspace and merchant owner.
import { constants as C } from 'node:fs';
import { mkdir, lstat, realpath, open, rename, link, unlink, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { acquireDatasetLease } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';

export const GRAPHQL_PRODUCT_SCHEMA = 'stellar-forge.graphql-product.v1';
export const GRAPHQL_PRODUCT_SESSION_SCHEMA = 'stellar-forge.graphql-product-session.v1';
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const failure = (code, message) => Object.assign(new Error(message), { code });
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function need(value, message) { if (!value) throw failure('GRAPHQL_PRODUCT_INPUT', message); }
export function absolute(value) {
  need(typeof value === 'string' && value && !value.includes('\0'), 'Select the original private directory or file.');
  return resolve(value);
}
export async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function privateDirectory(path, create = false) {
  path = absolute(path);
  if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) && await realpath(path) === path,
    'Use a canonical private directory with mode 0700: ' + path);
  return path;
}
export async function privateBytes(path, optional = false, maximum = 1024 * 1024) {
  try { return await readSf61HostFile(path, maximum, { privateFile: true }); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
export async function syncDirectory(path) {
  const handle = await open(path, C.O_RDONLY); try { await handle.sync(); } finally { await handle.close(); }
}
export async function publish(path, value, replace = false) {
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value) : encode(value);
  const old = await privateBytes(path, true, Math.max(bytes.length, 8 * 1024 * 1024));
  if (old?.equals(bytes)) return;
  if (old && !replace) throw failure('GRAPHQL_PRODUCT_CONFLICT', 'This original setup already has different bytes: ' + path);
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, C.O_CREAT | C.O_EXCL | C.O_WRONLY | C.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    if (replace) await rename(temporary, path);
    else {
      try { await link(temporary, path); }
      catch (error) { if (error.code !== 'EEXIST' || !(await privateBytes(path)).equals(bytes)) throw error; }
    }
    await syncDirectory(dirname(path));
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export function productLease(directory) {
  try { return acquireDatasetLease(directory); }
  catch (error) {
    if (error.code === 'DATASET_WRITER_RUNNING')
      throw failure('GRAPHQL_PRODUCT_ALREADY_OPEN', 'This product already has an owner. Use its existing browser or agent connection.');
    throw error;
  }
}
function label(value) {
  need(typeof value === 'string' && value.trim() && value.length <= 160 && !/[\x00-\x1f\x7f]/.test(value),
    'Give this product a printable name of at most 160 characters.');
  return value.trim();
}
function originalPaths(directory) {
  return { directory, configuration: join(directory, 'operator', 'merchant-mcp.json'),
    connection: join(directory, 'graphql-connections.json'), receivingDirectory: join(directory, 'receiving'),
    connectionFile: join(directory, 'connection.json') };
}
function selectedSetup(directory, input, retained, captured) {
  const specified = ['sourcesFile', 'connection', 'configuration'].filter(key => input[key] !== undefined);
  need(specified.length <= 1, 'Select one source definition, original GraphQL connection, or existing merchant configuration.');
  const mode = specified[0] ?? retained?.mode;
  need(mode, 'Supply sourcesFile, connection, or configuration for the original GraphQL setup.');
  const source = absolute(input[mode] ?? retained.source);
  const workspace = input.workspace ?? retained?.workspace ?? 'indexer';
  need(ALIAS.test(workspace), 'Use the original GraphQL workspace alias.');
  return { schema: GRAPHQL_PRODUCT_SCHEMA, directory, productId: retained?.productId ?? randomUUID(),
    createdAt: retained?.createdAt ?? new Date().toISOString(), name: label(input.name ?? retained?.name ?? 'GraphQL merchant'),
    workspace, mode, source, sourceSha256: sha256(captured), sourceBytes: captured.length };
}
function sourceDefinition(bytes) {
  const value = decode(bytes);
  need(plain(value) && value.schema === 'stellar-forge.graphql-product-sources.v1'
    && Object.keys(value).every(key => ['schema', 'sources', 'runtime', 'hosts'].includes(key))
    && plain(value.sources), 'Select a GraphQL product sources definition with its native source aliases.');
  return value;
}
/** A new setup stages only native initialization; original unfinished stages remain intact. */
export async function initializeGraphqlProduct(input = {}) {
  const directory = absolute(input.directory);
  await privateDirectory(dirname(directory));
  const existed = await exists(directory);
  await privateDirectory(directory, true);
  const lease = productLease(directory);
  try {
    const oldBytes = await privateBytes(join(directory, 'product.setup.json'), true);
    const old = oldBytes ? decode(oldBytes) : null;
    if (!old && existed && (await readdir(directory)).some(name => name !== 'writer.lease'))
      throw failure('GRAPHQL_PRODUCT_CONFLICT', 'Select an empty private product directory or its retained original setup.');
    if (old) need(old.schema === GRAPHQL_PRODUCT_SCHEMA, 'This directory retains a different product setup.');
    const mode = ['sourcesFile', 'connection', 'configuration'].find(key => input[key] !== undefined) ?? old?.mode;
    need(mode, 'Select the original GraphQL source or merchant connection.');
    const source = absolute(input[mode] ?? old?.source), captured = await privateBytes(source);
    const setup = selectedSetup(directory, input, old, captured);
    if (old && canonical(old) !== canonical(setup))
      throw failure('GRAPHQL_PRODUCT_CONFLICT', 'Continue this setup with its original source, workspace alias and name.');
    await publish(join(directory, 'product.setup.json'), setup);
    const paths = originalPaths(directory);
    await privateDirectory(paths.receivingDirectory, true);
    let configuration = setup.mode === 'configuration' ? setup.source : paths.configuration;
    let connection = setup.mode === 'connection' ? setup.source : paths.connection;
    if (setup.mode === 'sourcesFile') {
      const definition = sourceDefinition(captured);
      const workspaceDirectory = join(directory, 'workspace');
      const { openWorkspaceStore } = await import('../../stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/store.mjs');
      const original = await openWorkspaceStore(workspaceDirectory);
      await original.close();
      await publish(connection, { schema: 'stellar-forge.graphql-workspace-connection.v1',
        workspaces: { [setup.workspace]: { directory: './workspace', label: setup.name, sources: definition.sources,
          ...(definition.runtime === undefined ? {} : { runtime: definition.runtime }),
          ...(definition.hosts === undefined ? {} : { hosts: definition.hosts }) } } });
      await publish(join(directory, 'source-definition.json'), captured);
    }
    const { readMerchantConfig, initializeGraphqlWorkspaceMerchant } = await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
    if (setup.mode !== 'configuration' && !await exists(configuration)) {
      await privateDirectory(join(directory, 'initialization'), true);
      const stage = join(directory, 'initialization', randomUUID());
      await initializeGraphqlWorkspaceMerchant({ directory: stage, connection, name: setup.name });
      lease.assertHeld();
      // An interrupted initializer stays under initialization/. Publication names only a complete native operator.
      try { await rename(stage, join(directory, 'operator')); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
      await syncDirectory(directory);
    }
    const native = await readMerchantConfig(configuration), selected = native.graphqlWorkspaces?.workspaces[setup.workspace];
    need(selected, 'The original merchant configuration does not declare this GraphQL workspace alias.');
    if (setup.mode !== 'configuration') {
      const raw = decode(await privateBytes(configuration));
      need(resolve(dirname(configuration), raw.graphqlWorkspaceConnection) === connection && raw.name === setup.name,
        'The retained native operator was initialized with a different original connection.');
    }
    const profile = { ...setup, ...paths, configuration, workspaceDirectory: selected.directory };
    if (setup.mode === 'configuration') {
      const raw = decode(await privateBytes(configuration));
      profile.connection = resolve(dirname(configuration), raw.graphqlWorkspaceConnection);
    } else profile.connection = connection;
    lease.assertHeld();
    await publish(join(directory, 'product.json'), profile);
    return { state: 'INITIALIZED', profile, sources: Object.keys(selected.sources),
      authoring: 'ORIGINAL_SF105', owner: 'ORIGINAL_MERCHANT_GRAPHQL_WORKSPACES' };
  } finally { await lease.close(); }
}
export async function readGraphqlProduct(directory) {
  directory = await privateDirectory(directory);
  const profile = decode(await privateBytes(join(directory, 'product.json')));
  need(plain(profile) && profile.schema === GRAPHQL_PRODUCT_SCHEMA && profile.directory === directory
    && typeof profile.productId === 'string' && /^[a-f0-9-]{36}$/.test(profile.productId) && ALIAS.test(profile.workspace),
    'Open the original initialized GraphQL product.');
  const { readMerchantConfig } = await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
  const native = await readMerchantConfig(profile.configuration);
  const selected = native.graphqlWorkspaces?.workspaces[profile.workspace];
  need(selected && selected.directory === profile.workspaceDirectory,
    'The selected GraphQL workspace changed. Retain its original directory and alias.');
  const raw = decode(await privateBytes(profile.configuration));
  need(resolve(dirname(profile.configuration), raw.graphqlWorkspaceConnection) === profile.connection,
    'The product no longer selects its original GraphQL connection.');
  return { profile, native, selected };
}
export async function inspectGraphqlProduct(directory) {
  const { profile, selected } = await readGraphqlProduct(directory);
  const saved = await privateBytes(profile.connectionFile, true);
  return { schema: GRAPHQL_PRODUCT_SCHEMA, state: 'INITIALIZED', productId: profile.productId,
    name: profile.name, directory: profile.directory, workspace: profile.workspace,
    workspaceDirectory: profile.workspaceDirectory, configuration: profile.configuration,
    sourceAliases: Object.entries(selected.sources).map(([alias, source]) => ({ alias, label: source.label,
      origin: source.endpoint.origin, path: source.endpoint.path, authorizationEnv: source.endpoint.authorizationEnv ?? null })),
    hostAliases: Object.keys(selected.hosts), connectionFile: profile.connectionFile,
    lastSession: saved ? decode(saved) : null };
}
/** One original MCP provider creates and owns the same SF105 browser, previews and release consoles. */
export async function openGraphqlProduct(options = {}, { environment = process.env } = {}) {
  const { inspectGraphqlLaunch } = await import('./managed.mjs');
  const first = await inspectGraphqlLaunch(options, { environment });
  const lease = productLease(first.directory);
  let owned, started, closing;
  const initial = { schema: GRAPHQL_PRODUCT_SESSION_SCHEMA, productId: first.profile.productId,
    workspace: first.profile.workspace, instanceId: randomUUID(), startedAt: new Date().toISOString(),
    bindingSha256: first.bindingSha256, resourceId: first.resourceId,
    directory: first.directory, workspaceDirectory: first.profile.workspaceDirectory,
    configuration: first.profile.configuration, connectionFile: first.profile.connectionFile,
    tokenEnv: first.options.tokenEnv, browserOnly: first.options.browserOnly, port: first.options.port };
  const save = value => publish(first.profile.connectionFile, value, true);
  async function finish() {
    await owned?.close();
    lease.assertHeld();
    await save({ ...initial, ...started, state: 'CLOSED', stoppedAt: new Date().toISOString() });
    await lease.close();
  }
  try {
    const admitted = await inspectGraphqlLaunch(options, { environment });
    if (admitted.bindingSha256 !== first.bindingSha256 ||
        options.expectedBindingSha256 !== undefined && options.expectedBindingSha256 !== admitted.bindingSha256)
      throw failure('GRAPHQL_PRODUCT_BINDING_CHANGED', 'Review the current original configuration before starting this product.');
    await save({ ...initial, state: 'STARTING', browserUrl: null, mcpUrl: null });
    let operator, mcpUrl = null;
    if (first.options.browserOnly) {
      const { openMerchantOperator } = await import('../../stellar-forge/mcp-merchant-operator/operator.mjs');
      operator = await openMerchantOperator(first.profile.configuration);
      owned = operator;
    } else {
      const { startMerchantMcp } = await import('../../stellar-forge/mcp-merchant-operator/serve.mjs');
      owned = await startMerchantMcp({ configPath: first.profile.configuration, port: first.options.port,
        tokenEnv: first.options.tokenEnv, environment });
      operator = owned.operator; mcpUrl = new URL('/mcp', owned.url).href;
    }
    const original = await operator.call('merchant_graphql_open', { workspace: first.profile.workspace });
    need(original.open === true && typeof original.browserUrl === 'string' && original.instanceId,
      'The original GraphQL workspace did not return its open browser.');
    const confirmed = await inspectGraphqlLaunch(options, { environment });
    if (confirmed.bindingSha256 !== admitted.bindingSha256)
      throw failure('GRAPHQL_PRODUCT_BINDING_CHANGED', 'The selected source configuration changed during native startup.');
    lease.assertHeld();
    started = { state: 'OPEN', browserUrl: original.browserUrl, mcpUrl, nativeInstanceId: original.instanceId };
    await save({ ...initial, ...started });
    return { ...initial, ...started, name: first.profile.name, operator,
      close() {
        if (!closing) closing = finish().catch(error => { closing = null; throw error; });
        return closing;
      } };
  } catch (error) {
    let closed = false, cleanup;
    try {
      await owned?.close(); closed = true;
      await save({ ...initial, ...started, state: 'FAILED', endedAt: new Date().toISOString(),
        error: { code: error.code ?? 'GRAPHQL_PRODUCT_OPEN_FAILED', message: error.message } });
    } catch (cause) { cleanup = cause; }
    finally { if (closed) await lease.close(); }
    if (cleanup) throw new AggregateError([error, cleanup], 'Original GraphQL startup cleanup is incomplete.');
    throw error;
  }
}
