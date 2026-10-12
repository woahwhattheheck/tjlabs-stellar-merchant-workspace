// MIT. Captured API product setup using the original SF61 and merchant MCP owners.
import { constants as C } from 'node:fs';
import { mkdir, lstat, realpath, open, rename, link, unlink, readdir } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquireDatasetLease } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { Sf61WorkspaceClient, readSf61HostFile, readSf61Response, sf61Hash } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';

export const CAPTURED_API_PRODUCT_SCHEMA = 'stellar-forge.captured-api-product.v1';
const SETUP = 'product.setup.json', PROFILE = 'product.json', SESSION = 'session.json';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => Object.assign(new Error(message), { code });
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = /^[a-f0-9]{64}$/;
function text(value, label, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value))
    throw fail('CAPTURED_API_INPUT', label + ' must be a nonempty printable line of up to ' + maximum + ' characters.');
  return value.trim();
}
function absolute(value) {
  if (typeof value !== 'string' || !value || value.includes('\0'))
    throw fail('CAPTURED_API_INPUT', 'Choose an absolute private workspace or host file.');
  return resolve(value);
}
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function privateDirectory(path, create = false) {
  path = absolute(path);
  if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const value = await lstat(path);
  if (!value.isDirectory() || value.isSymbolicLink() || value.mode & 0o077 || await realpath(path) !== path)
    throw fail('CAPTURED_API_PRIVATE_DIRECTORY', 'Use a canonical private directory with mode 0700: ' + path);
  return path;
}
async function syncDirectory(path) {
  const handle = await open(path, C.O_RDONLY); try { await handle.sync(); } finally { await handle.close(); }
}
async function file(path, optional = false, maximum = 1024 * 1024) {
  try { return await readSf61HostFile(path, maximum, { privateFile: true }); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
/** Publish whole files. Existing immutable setup is compared before any continuation. */
async function write(path, value, replace = false) {
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value) : encode(value);
  const previous = await file(path, true, 4 * 1024 * 1024);
  if (previous?.equals(bytes)) return;
  if (previous && !replace) throw fail('CAPTURED_API_SETUP_CONFLICT', 'This product already retains different setup: ' + path);
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, C.O_CREAT | C.O_EXCL | C.O_WRONLY | C.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    if (replace) await rename(temporary, path);
    else {
      try { await link(temporary, path); }
      catch (error) { if (error.code !== 'EEXIST' || !(await file(path)).equals(bytes)) throw error; }
      await unlink(temporary);
    }
    await syncDirectory(dirname(path));
  } finally { await handle.close().catch(() => {}); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
function paths(directory) {
  return { directory, configuration: join(directory, 'operator', 'merchant-mcp.json'),
    operatorDirectory: join(directory, 'operator'), harConnection: join(directory, 'har-connections.json'),
    openapiConnection: join(directory, 'openapi-connections.json'), inputsDirectory: join(directory, 'inputs'),
    receivingDirectory: join(directory, 'receiving') };
}
function normalizedSetup(directory, input, retained) {
  const external = input.consoleUrlFile !== undefined ? true : retained?.console.ownership === 'EXTERNAL';
  if (external && input.projects === undefined && !retained)
    throw fail('CAPTURED_API_INPUT', 'Attach an existing console with its exact --projects directory.');
  const projectsDirectory = absolute(input.projects ?? retained?.projectsDirectory ?? join(directory, 'projects'));
  const console = { ownership: external ? 'EXTERNAL' : 'PRODUCT',
    urlFile: absolute(input.consoleUrlFile ?? retained?.console.urlFile ?? join(directory, 'console-url.txt')) };
  const name = text(input.name ?? retained?.name ?? 'Captured API merchant', 'Merchant name');
  const oauthConnectionsFile = input.oauthConnectionsFile === undefined
    ? retained?.oauthConnectionsFile ?? null : absolute(input.oauthConnectionsFile);
  if (external && oauthConnectionsFile)
    throw fail('CAPTURED_API_INPUT', 'Provider connections belong to the already running original console.');
  return { schema: CAPTURED_API_PRODUCT_SCHEMA, name, ...paths(directory), projectsDirectory, console,
    oauthConnectionsFile };
}
async function lease(directory) {
  try { return acquireDatasetLease(directory); }
  catch (error) {
    if (error.code === 'DATASET_WRITER_RUNNING')
      throw fail('CAPTURED_API_ALREADY_OPEN', 'This captured API product already has a live owner. Use its private browser or existing MCP URL.');
    throw error;
  }
}
function connections(profile) {
  const shared = { label: profile.name, consoleUrlFile: profile.console.urlFile };
  const input = name => join(profile.inputsDirectory, name);
  return {
    har: { schema: 'stellar-forge.har-workspace-connection.v1', workspaces: { merchant: {
      ...shared, projectsDirectory: profile.projectsDirectory,
      files: { current: { kind: 'capture', path: input('current.har') },
        later: { kind: 'capture', path: input('later.har') },
        decisions: { kind: 'decisions', path: input('decisions.json') },
        terms: { kind: 'merchant-plan', path: input('merchant-plan.json') } },
      imports: { capture: { kind: 'capture', directory: join(profile.receivingDirectory, 'capture') },
        refresh: { kind: 'refresh', directory: join(profile.receivingDirectory, 'refresh') } },
      destinations: { handover: { directory: join(profile.receivingDirectory, 'source-handover') } }
    } } },
    openapi: { schema: 'stellar-forge.sf61-workspace-connection.v1', workspaces: { merchant: {
      ...shared, files: { source: { kind: 'source', path: input('openapi.json') },
        terms: { kind: 'plan', path: input('merchant-plan.json') },
        worksheet: { kind: 'packet', path: input('worksheet.json') },
        'base-worksheet': { kind: 'packet', path: input('base-worksheet.json') },
        operations: { kind: 'plan', path: input('operation-plans.json') } },
      deliveries: { handover: { directory: join(profile.receivingDirectory, 'merchant-package') } }
    } } }
  };
}
/** Preserve and repair only the exact original, unfinished default connection definition. */
async function writeOpenapiConnection(profile, definition) {
  const retained = await file(profile.openapiConnection, true);
  if (retained) {
    const original = structuredClone(definition);
    const files = original.workspaces.merchant.files;
    files.baseWorksheet = files['base-worksheet']; delete files['base-worksheet'];
    if (canonical(json(retained)) === canonical(original)) {
      await write(join(profile.directory, 'openapi-connections.initialization-v0.json'), retained);
      await write(profile.openapiConnection, definition, true);
      return;
    }
  }
  await write(profile.openapiConnection, definition);
}
/** A retry completes the retained setup. Native operator preparation is staged before publication. */
export async function initializeCapturedApi(input) {
  const directory = absolute(input.directory);
  await privateDirectory(dirname(directory));
  const alreadyExists = await exists(directory);
  await privateDirectory(directory, true);
  const ownership = await lease(directory);
  try {
    const retainedBytes = await file(join(directory, SETUP), true), retained = retainedBytes ? json(retainedBytes) : null;
    if (!retained && alreadyExists && (await readdir(directory)).some(name => name !== 'writer.lease'))
      throw fail('CAPTURED_API_SETUP_CONFLICT', 'Select an empty private directory or reopen a retained captured API product.');
    if (retained && retained.schema !== CAPTURED_API_PRODUCT_SCHEMA)
      throw fail('CAPTURED_API_SETUP_CONFLICT', 'The retained setup belongs to another product schema.');
    const profile = normalizedSetup(directory, input, retained);
    if (retained && canonical(profile) !== canonical(retained))
      throw fail('CAPTURED_API_SETUP_CONFLICT', 'Reopen this retained setup with its original name, project and console references.');
    if (await exists(join(directory, PROFILE))) {
      const original = await readCapturedApi(directory);
      return { ...original, state: 'INITIALIZED', reused: true, workspace: 'merchant', sourceIntake: 'ORIGINAL_SF61_CONSOLE' };
    }
    const createsProjects = profile.projectsDirectory === join(directory, 'projects');
    if (!createsProjects) await privateDirectory(profile.projectsDirectory);
    if (profile.console.ownership === 'EXTERNAL') {
      await privateDirectory(dirname(profile.console.urlFile));
      if (await exists(profile.console.urlFile)) await file(profile.console.urlFile, false, 16384);
    }
    if (profile.oauthConnectionsFile) await file(profile.oauthConnectionsFile);
    await write(join(directory, SETUP), profile);
    for (const folder of [profile.inputsDirectory, profile.receivingDirectory])
      await privateDirectory(folder, true);
    await privateDirectory(profile.projectsDirectory, createsProjects);
    const definitions = connections(profile);
    await write(profile.harConnection, definitions.har);
    await writeOpenapiConnection(profile, definitions.openapi);
    const { initializeHarWorkspaceMerchant, readMerchantConfig } =
      await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
    if (!await exists(profile.operatorDirectory)) {
      const stage = join(directory, '.operator-initialization-' + randomUUID());
      await initializeHarWorkspaceMerchant({ directory: stage, connection: profile.harConnection,
        openapiWorkspaces: profile.openapiConnection, name: profile.name });
      const prepared = await readMerchantConfig(join(stage, 'merchant-mcp.json'));
      if (!prepared.harWorkspaces?.workspaces.merchant || !prepared.openapiWorkspaces?.workspaces.merchant)
        throw fail('CAPTURED_API_SOURCE_INCOMPLETE', 'Use the complete product source containing both original HAR and OpenAPI initialization.');
      ownership.assertHeld();
      if (await exists(profile.operatorDirectory))
        throw fail('CAPTURED_API_SETUP_CONFLICT', 'The native operator directory changed during initialization.');
      await rename(stage, profile.operatorDirectory); await syncDirectory(directory);
    }
    await validateOperator(profile);
    await write(join(directory, PROFILE), profile);
    return { ...profile, state: 'INITIALIZED', reused: Boolean(retained),
      workspace: 'merchant', sourceIntake: 'ORIGINAL_SF61_CONSOLE' };
  } finally { await ownership.close(); }
}
async function validateOperator(profile) {
  const raw = json(await file(profile.configuration));
  if (absolute(raw.harWorkspaceConnection) !== profile.harConnection ||
      absolute(raw.openapiWorkspaceConnection) !== profile.openapiConnection)
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', 'Use this product’s retained HAR and OpenAPI connection files.');
  const { readMerchantConfig } = await import('../../stellar-forge/mcp-merchant-operator/config.mjs');
  const configured = await readMerchantConfig(profile.configuration);
  const har = configured.harWorkspaces?.workspaces.merchant, api = configured.openapiWorkspaces?.workspaces.merchant;
  if (har?.projectsDirectory !== profile.projectsDirectory || har?.consoleUrlFile !== profile.console.urlFile ||
      api?.consoleUrlFile !== profile.console.urlFile)
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', 'Both original providers must use the retained project and selected console.');
  return configured;
}
export async function readCapturedApi(directory) {
  directory = await privateDirectory(directory);
  const profile = json(await file(join(directory, PROFILE)));
  if (profile.schema !== CAPTURED_API_PRODUCT_SCHEMA || profile.directory !== directory ||
      canonical(paths(directory)) !== canonical(Object.fromEntries(Object.keys(paths(directory)).map(key => [key, profile[key]]))) ||
      !['PRODUCT','EXTERNAL'].includes(profile.console?.ownership) ||
      profile.console.ownership === 'PRODUCT' && profile.console.urlFile !== join(directory, 'console-url.txt'))
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', 'Open the original captured API product directory.');
  await privateDirectory(profile.projectsDirectory);
  await validateOperator(profile);
  return profile;
}
async function consoleConnection(profile) {
  const reference = new Sf61WorkspaceClient({ consoleUrlFile: profile.console.urlFile });
  const selected = await reference.connection();
  const client = new Sf61WorkspaceClient({ consoleUrlEnv: 'CAPTURED_API_SELECTED_CONSOLE' },
    { environment: { CAPTURED_API_SELECTED_CONSOLE: selected.origin + '/#' + selected.token } });
  const library = await client.json('/api/har/library?limit=1');
  if (library.root !== join(profile.projectsDirectory, '.har-captures'))
    throw fail('CAPTURED_API_CONSOLE_CHANGED', 'The selected original console belongs to another project directory.');
  return { client, library, url: selected.origin + '/#' + selected.token };
}
function selection(value, saved = false) {
  const input = value?.selection ?? value;
  if (!plain(input) || !['capture','refresh'].includes(input.kind) || !hash.test(input.id ?? '') ||
      Object.keys(input).some(key => !['kind','id','revision'].includes(key)) ||
      (saved || input.revision !== undefined) && !hash.test(input.revision ?? ''))
    throw fail('CAPTURED_API_SELECTION', 'Select the exact original capture/refresh identity and saved review revision.');
  return { kind: input.kind, id: input.id, ...(input.revision ? { revision: input.revision } : {}) };
}
/** Native upload retains its bytes and deterministic capture/refresh identity before any review. */
export async function ingestCapturedApi({ directory, path, label, previous, expectedSha256 }) {
  const profile = await readCapturedApi(directory);
  const bytes = await readSf61HostFile(absolute(path), 128 * 1024 * 1024,
    { privateFile: true, ...(expectedSha256 === undefined ? {} : { sha256: expectedSha256 }) });
  if (!bytes.length) throw fail('CAPTURED_API_INPUT', 'Select a nonempty original HAR file.');
  const before = previous === undefined ? null : selection(previous, true);
  const query = new URLSearchParams({ label: text(label ?? basename(path), 'Source label') });
  if (before) for (const [key, value] of Object.entries(before))
    query.set('previous' + key[0].toUpperCase() + key.slice(1), value);
  const { client } = await consoleConnection(profile);
  const result = json(await client.request('/api/har/upload?' + query, {
    body: bytes, headers: { 'Content-Type': 'application/octet-stream' }
  }, response => readSf61Response(response)));
  if (result.sourceSha256 !== sf61Hash(bytes))
    throw fail('CAPTURED_API_SOURCE_CHANGED', 'The original console returned another captured source identity.');
  return result;
}
export async function adoptCapturedApi({ directory, kind, sourceDirectory, label }) {
  if (!['capture','refresh'].includes(kind)) throw fail('CAPTURED_API_INPUT', 'Choose capture or refresh.');
  const profile = await readCapturedApi(directory), { client } = await consoleConnection(profile);
  return client.json('/api/har/adopt', { kind, directory: absolute(sourceDirectory),
    label: text(label ?? 'Received API source', 'Source label') });
}
/** Opens the original browser and MCP together; externally managed consoles keep their own lifetime. */
export async function openCapturedApi({ directory, port = 0, mcpPort = 0, browserOnly = false,
  tokenEnv = 'MCP_ACCESS_TOKEN', environment = process.env, managedBindingSha256 } = {}) {
  let profile = await readCapturedApi(directory);
  const ownership = await lease(profile.directory);
  let consoleSession, productWorkspace, mcp, started, closing, initial, launchBinding;
  let closeState = 'CLOSED', openingFailure, closed = false, keepAlive, closeStartedAt;
  let mcpClosed = false, consoleClosed = false;
  const inspectBinding = async () => {
    const { inspectCapturedApiLaunch } = await import('./managed.mjs');
    const inspected = await inspectCapturedApiLaunch({ directory: profile.directory, port, mcpPort, browserOnly, tokenEnv },
      { environment });
    if (inspected.bindingSha256 !== managedBindingSha256)
      throw fail('CAPTURED_API_CONFIGURATION_CHANGED',
        'The retained captured API configuration changed. Review this original product again before starting it.');
    return inspected;
  };
  const finish = async () => {
    if (closed) return;
    // Retain this original process and its kernel lease until native owners and
    // the final retained session record have all completed. A failed attempt is
    // retryable through the same close handle; it does not surrender ownership.
    keepAlive ??= setInterval(() => {}, 1000);
    closeStartedAt ??= new Date().toISOString();
    const errors = [];
    const attempt = async action => { try { await action(); } catch (error) { errors.push(error); } };
    const record = (state, extra = {}) => ({ ...initial, ...started, state, closeStartedAt,
      owners: { merchantAgent: !mcp ? 'NOT_OPENED' : mcpClosed ? 'CLOSED' : 'DRAINING',
        browser: profile.console.ownership === 'EXTERNAL' ? 'EXTERNAL' :
          !consoleSession ? 'NOT_OPENED' : consoleClosed ? 'CLOSED' : 'DRAINING' },
      ...(openingFailure ? { error: { code: openingFailure.code ?? 'OPEN_FAILED', message: openingFailure.message } } : {}),
      ...extra });
    ownership.assertHeld();
    if (initial) await attempt(() => write(join(profile.directory, SESSION), record('DRAINING'), true));
    if (mcp && !mcpClosed) await attempt(async () => { await mcp.close(); mcpClosed = true; });
    // The original agent may still need its original browser while it drains.
    if ((!mcp || mcpClosed) && consoleSession && !consoleClosed)
      await attempt(async () => { await consoleSession.close(); consoleClosed = true; });
    // Opening can fail before the native listener returns its close handle.
    if ((!mcp || mcpClosed) && !consoleSession && productWorkspace)
      await attempt(() => productWorkspace.close());
    if (!errors.length) await attempt(async () => {
      if (initial) await write(join(profile.directory, SESSION),
        record(closeState, { stoppedAt: new Date().toISOString() }), true);
      await ownership.close();
      closed = true;
      clearInterval(keepAlive); keepAlive = undefined;
    });
    if (errors.length) {
      if (initial) await attempt(() => write(join(profile.directory, SESSION), record('CLOSE_FAILED', {
        closeErrors: errors.map(error => ({ code: error.code ?? 'CLOSE_FAILED', message: error.message })),
      }), true));
      throw Object.assign(new AggregateError(errors,
        'Captured API close is incomplete. Retry Stop or close() on this same original owner.'), {
        code: 'CAPTURED_API_CLOSE_PENDING',
      });
    }
  };
  const close = () => {
    if (closing) return closing;
    const attempt = finish();
    closing = attempt;
    void attempt.catch(() => { if (closing === attempt) closing = undefined; });
    return attempt;
  };
  try {
    if (managedBindingSha256 !== undefined) {
      if (typeof managedBindingSha256 !== 'string' || !hash.test(managedBindingSha256))
        throw fail('CAPTURED_API_BINDING_REQUIRED', 'Use the exact inspected captured API launch SHA-256.');
      launchBinding = await inspectBinding();
      profile = launchBinding.profile;
    }
    initial = { schema: 'stellar-forge.captured-api-session.v1', startedAt: new Date().toISOString(),
      consoleOwnership: profile.console.ownership, configuration: profile.configuration, pid: process.pid,
      ...(launchBinding ? { bindingSha256: launchBinding.bindingSha256, resourceId: launchBinding.resourceId } : {}) };
    await write(join(profile.directory, SESSION), { ...initial, state: 'STARTING' }, true);
    if (profile.console.ownership === 'PRODUCT') {
      const { createCapturedHandoverWeb } = await import('./handover-web.mjs');
      productWorkspace = await createCapturedHandoverWeb({directory:profile.directory});
      const { startWorkspace } = await import('../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/server.mjs');
      if (launchBinding?.browserOAuth) {
        const { startManagedOpenApiWorkspace } =
          await import('../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/managed-launch.mjs');
        consoleSession = await startManagedOpenApiWorkspace([
          '--out-parent', profile.projectsDirectory, '--port', String(port),
          '--oauth-connections', profile.oauthConnectionsFile,
          '--managed-launch-sha256', launchBinding.browserOAuth.bindingSha256,
        ], { startWorkspace: async options => {
          // Keep the original session if native post-start validation needs cleanup.
          consoleSession = await startWorkspace({ ...options, noSignals: true, productWorkspace });
          return consoleSession;
        }, env: environment, announce: () => {} });
      } else {
        const oauthConnections = profile.oauthConnectionsFile
          ? await (await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/oauth-connections/host.mjs'))
            .readOAuthHostConnections(profile.oauthConnectionsFile) : [];
        consoleSession = await startWorkspace({ parent: profile.projectsDirectory, port,
          noSignals: true, oauthConnections, env: environment, productWorkspace });
      }
      ownership.assertHeld();
      await write(profile.console.urlFile, consoleSession.url + '\n', true);
    } else if (port !== 0) throw fail('CAPTURED_API_INPUT', 'The existing console owns its listener port.');
    const selected = await consoleConnection(profile);
    if (!browserOnly) {
      const { startMerchantMcp } = await import('../../stellar-forge/mcp-merchant-operator/serve.mjs');
      mcp = await startMerchantMcp({ configPath: profile.configuration, port: mcpPort, tokenEnv, environment,
        consoleDirectory: join(profile.directory, 'operator-console') });
    }
    if (launchBinding) await inspectBinding();
    started = { browserUrl: selected.url, mcpUrl: mcp?.url ?? null,
      operatorUrl: mcp?.consoleUrl ?? null,
      operatorConsoleDirectory: mcp ? join(profile.directory, 'operator-console') : null,
      workspace: 'merchant', sourceCount: selected.library.total, state: 'OPEN' };
    ownership.assertHeld();
    await write(join(profile.directory, SESSION), { ...initial, ...started }, true);
    return { ...profile, ...started, ...(launchBinding ? { launchBinding } : {}),
      close };
  } catch (error) {
    closeState = 'FAILED'; openingFailure = error;
    try { await close(); }
    catch (cleanup) {
      // Embedded callers and the original CLI retain the same cleanup handle
      // even when opening failed before an OPEN result could be returned.
      throw Object.assign(new AggregateError([error, cleanup], error.message), {
        code: 'CAPTURED_API_CLOSE_PENDING', close,
      });
    }
    throw error;
  }
}
export async function inspectCapturedApi(directory) {
  const profile = await readCapturedApi(directory);
  const retained = await file(join(profile.directory, SESSION), true);
  let consoleStatus;
  try {
    const current = await consoleConnection(profile);
    consoleStatus = { reachable: true, url: current.url, sourceCount: current.library.total,
      ...(await current.client.json('/api/status')) };
  } catch (error) { consoleStatus = { reachable: false, code: error.code ?? 'UNAVAILABLE', message: error.message }; }
  return { ...profile, session: retained ? json(retained) : null, console: { ...profile.console, ...consoleStatus } };
}
