// MIT. One installed NocoDB project around the original authoring/MCP lifetime.
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lstat, readFile, readdir, rename, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { absolute, privateDirectory, readPrivate, readJson, hashPrivate, bytes, digest, identity,
  acquireWorkspace, atomicJson, syncDirectory, fault, object } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { createOrVerify, MAX_PACKET_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/workspace/packet.mjs';

export const PROJECT_SCHEMA = 'stellar-forge.nocodb-merchant-project.v1';
export const REQUEST_SCHEMA = 'stellar-forge.nocodb-merchant-project-request.v1';
export const AUTHORING_PATH = 'stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/workspace';
export const MCP_PATH = 'stellar-forge/mcp-merchant-operator';
export const PROJECT_ALIAS = 'merchant';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TOKEN_ENV = 'NOCODB_PROJECT_MCP_TOKEN';
const OWN_PATH = 'products/nocodb-merchant/project.mjs';
const exists = async path => { try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const exact = (value, keys, required = []) => {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw fault('NOCODB_PROJECT_FIELDS_INVALID', 'Use the documented project fields.');
};
const text = (value, label, maximum = 128) => {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > maximum || /[\u0000-\u001f]/.test(value))
    throw fault('NOCODB_PROJECT_TEXT_INVALID', 'Use a nonempty ' + label + '.');
  return value;
};
const sha = value => { if (!HASH.test(value ?? '')) throw fault('NOCODB_PROJECT_SHA256_REQUIRED'); return value; };
const uuid = value => { if (!UUID.test(value ?? '')) throw fault('NOCODB_PROJECT_REQUEST_ID_REQUIRED', 'Retain the original UUID before dispatch.'); return value; };
const integer = value => { if (!Number.isSafeInteger(value) || value < 0) throw fault('NOCODB_PROJECT_REVISION_REQUIRED'); return value; };
const decode = content => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
  catch { throw fault('NOCODB_PROJECT_JSON_INVALID'); } };
function url(value) {
  const parsed = new URL(text(value, 'buyer URL', 4096));
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash)
    throw fault('NOCODB_PROJECT_BUYER_URL_INVALID');
  return parsed.href;
}
function outside(left, right) {
  const a = relative(left, right), b = relative(right, left);
  return a !== '' && (a === '..' || a.startsWith('..' + sep)) && (b === '..' || b.startsWith('..' + sep));
}
async function publicFile(file, maximum = 32 * 1024 * 1024) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw fault('NOCODB_PROJECT_SOURCE_FILE_INVALID');
  const content = await readFile(file), after = await lstat(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== content.length ||
      before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw fault('NOCODB_PROJECT_SOURCE_CHANGED');
  return content;
}
async function original(installation, path) {
  return import(pathToFileURL(join(installation.sourceRoot, path)).href);
}

export async function installedSource(runtimeDirectory) {
  absolute(runtimeDirectory, 'installed runtime');
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const manifestFile = join(runtimeDirectory, 'package', 'manifest.json'), content = await publicFile(manifestFile);
  const manifest = decode(content), files = new Map((manifest.files ?? []).map(row => [row.path, row]));
  const required = [
    ...['model.mjs','server.mjs','cli.mjs','launch.mjs','packet.mjs','provider.mjs','browser.mjs','index.html','style.css']
      .map(name => AUTHORING_PATH + '/' + name),
    ...['config.mjs','operator.mjs','serve.mjs','nocodb-workspace.mjs','catalog/nocodb-workspace.mjs',
      'providers/nocodb-workspaces.mjs','providers/publishers.mjs','retained-download.mjs'].map(name => MCP_PATH + '/' + name),
    'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-nocodb.mjs',
    'stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/deployment.mjs',
    'stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/publisher/model.mjs',
    OWN_PATH, 'products/nocodb-merchant/cli.mjs', 'products/nocodb-merchant/receive.mjs', 'products/nocodb-merchant/mcp-client.mjs',
  ];
  for (const path of required) if (!HASH.test(files.get(path)?.sha256 ?? ''))
    throw fault('NOCODB_PROJECT_INSTALLATION_INCOMPLETE', 'Select the complete nocodb-merchant product and its original providers.');
  // A caller from a checkout is allowed only when its exact product code matches the selected installation.
  if (digest(await publicFile(fileURLToPath(import.meta.url))) !== files.get(OWN_PATH).sha256)
    throw fault('NOCODB_PROJECT_EXECUTED_SOURCE_CHANGED', 'Run the project entry from the selected installed source.');
  return { runtimeDirectory, sourceRoot: runtime.sourceRoot, sourceCommit: runtime.sourceCommit,
    manifestFile, manifestSha256: digest(content), authoringDirectory: join(runtime.sourceRoot, AUTHORING_PATH),
    merchantDirectory: join(runtime.sourceRoot, MCP_PATH),
    entrypoint: join(runtime.sourceRoot, 'stellar/scf-starforge-20261009/distribution/cli.mjs'),
    requiredFiles: required.map(path => files.get(path)) };
}

function normalizeRequest(raw) {
  exact(raw, ['schema','runtimeDirectory','directory','title','workspaceDirectory','connectionsFile','inputs','seller','resource'],
    ['schema','runtimeDirectory','directory']);
  if (raw.schema !== REQUEST_SCHEMA) throw fault('NOCODB_PROJECT_REQUEST_SCHEMA');
  const directory = absolute(raw.directory, 'project directory'), runtimeDirectory = absolute(raw.runtimeDirectory, 'installed runtime');
  const title = text(raw.title ?? 'NocoDB merchant', 'project title');
  const workspaceDirectory = raw.workspaceDirectory === undefined ? join(directory, 'workspace') :
    absolute(raw.workspaceDirectory, 'existing original workspace');
  const adopt = raw.workspaceDirectory !== undefined;
  if (!outside(directory, runtimeDirectory) || !outside(workspaceDirectory, runtimeDirectory))
    throw fault('NOCODB_PROJECT_RUNTIME_OVERLAP', 'Keep runtime source and writable project/workspace directories separate.');
  if (adopt && !outside(directory, workspaceDirectory))
    throw fault('NOCODB_PROJECT_WORKSPACE_OVERLAP', 'An adopted workspace must be separate from the new project directory.');
  const connectionsFile = raw.connectionsFile === undefined ? null : absolute(raw.connectionsFile, 'private connection file');
  const inputs = {};
  if (raw.inputs !== undefined) {
    if (!object(raw.inputs) || Object.keys(raw.inputs).length > 64) throw fault('NOCODB_PROJECT_INPUTS_INVALID');
    for (const [alias, entry] of Object.entries(raw.inputs)) {
      if (!ALIAS.test(alias) || ['constructor','prototype','__proto__'].includes(alias)) throw fault('NOCODB_PROJECT_INPUT_ALIAS_INVALID');
      exact(entry, ['kind','file','sha256','label'], ['kind','file','sha256']);
      if (!['source','packet'].includes(entry.kind)) throw fault('NOCODB_PROJECT_INPUT_KIND_INVALID');
      inputs[alias] = { kind: entry.kind, file: absolute(entry.file, 'host input file'), sha256: sha(entry.sha256),
        label: text(entry.label ?? alias, 'input label') };
    }
  }
  if ((raw.seller === undefined) !== (raw.resource === undefined)) throw fault('NOCODB_PROJECT_BUYER_PAIR_REQUIRED');
  return { schema: REQUEST_SCHEMA, directory, runtimeDirectory, title, workspaceDirectory, adopt,
    connectionsFile, inputs, seller: raw.seller === undefined ? null : url(raw.seller),
    resource: raw.resource === undefined ? null : url(raw.resource) };
}

async function verifyConnectionFile(installation, file) {
  if (!file) return { content: null, sha256: null, connections: {} };
  const launch = await original(installation, AUTHORING_PATH + '/launch.mjs');
  const selected = await launch.readNocoDBLaunchConnections(file);
  const content = await readPrivate(file, 1024 * 1024);
  if (digest(content) !== selected.sha256) throw fault('NOCODB_PROJECT_CONNECTION_CHANGED');
  return { content, sha256: selected.sha256, connections: selected.connections };
}
async function validateMerchant(installation, root, connectionFile, title, expectedHash = null) {
  await privateDirectory(root);
  const configFile = join(root, 'merchant-mcp.json'), content = await readPrivate(configFile, 1024 * 1024);
  const expected = { schema: 'stellar-forge.merchant-mcp.v1', name: title, releaseStore: './releases',
    exportsDirectory: './customer-exports', sources: {}, nocodbWorkspaceConnection: connectionFile };
  if (identity(decode(content)) !== identity(expected) || expectedHash && digest(content) !== expectedHash)
    throw fault('NOCODB_PROJECT_MERCHANT_CONFIG_CHANGED');
  const native = await original(installation, MCP_PATH + '/config.mjs');
  await native.readMerchantConfig(configFile);
  return { file: configFile, sha256: digest(content) };
}

async function prepareMerchant(directory, installation, intent, connectionFile) {
  const target = join(directory, 'merchant'), journalFile = join(directory, 'merchant-preparation.json');
  let journal = await exists(journalFile) ? await readJson(journalFile) : null;
  if (journal && (journal.schema !== PROJECT_SCHEMA || journal.preparationId !== intent.id ||
      !UUID.test(journal.attemptId ?? '') || !Array.isArray(journal.retained)))
    throw fault('NOCODB_PROJECT_MERCHANT_PREPARATION_CHANGED');
  if (await exists(target)) {
    if (!journal || !['READY','PUBLISHED'].includes(journal.phase) || !HASH.test(journal.configurationSha256 ?? ''))
      throw fault('NOCODB_PROJECT_UNOWNED_MERCHANT');
    const result = await validateMerchant(installation, target, connectionFile, intent.input.title, journal.configurationSha256);
    if (journal.phase !== 'PUBLISHED') await atomicJson(directory, 'merchant-preparation.json', { ...journal, phase: 'PUBLISHED' });
    return result;
  }
  if (journal?.phase === 'PUBLISHED') throw fault('NOCODB_PROJECT_PUBLISHED_MERCHANT_MISSING');
  const retainedRoot = join(directory, 'interrupted');
  await privateDirectory(retainedRoot, true);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!journal) {
      journal = { schema: PROJECT_SCHEMA, preparationId: intent.id, attemptId: randomUUID(), phase: 'PREPARING', retained: [] };
      await atomicJson(directory, 'merchant-preparation.json', journal);
    }
    const staging = join(directory, 'merchant-preparing-' + journal.attemptId);
    const retained = join(retainedRoot, 'merchant-' + journal.attemptId);
    if (await exists(retained)) {
      if (await exists(staging)) throw fault('NOCODB_PROJECT_MERCHANT_PREPARATION_AMBIGUOUS');
      journal = { schema: PROJECT_SCHEMA, preparationId: intent.id, attemptId: randomUUID(), phase: 'PREPARING',
        retained: [...new Set([...journal.retained, retained])] };
      await atomicJson(directory, 'merchant-preparation.json', journal);
      continue;
    }
    if (!await exists(staging)) {
      if (journal.phase !== 'PREPARING') throw fault('NOCODB_PROJECT_READY_MERCHANT_MISSING');
      const native = await original(installation, MCP_PATH + '/config.mjs');
      // Native initializer owns the SF82 and export-store formats. It never starts a seller.
      await native.initializeNocoDBWorkspaceMerchant({ directory: staging, connection: connectionFile, name: intent.input.title });
    }
    let ready;
    try { ready = await validateMerchant(installation, staging, connectionFile, intent.input.title,
      journal.configurationSha256 ?? null); }
    catch (error) {
      // Only a positively incomplete, never-published initializer is retained and retried.
      // Corruption, permissions, or an uncertain read are not grounds for another store.
      if (error.code !== 'ENOENT' || journal.phase !== 'PREPARING') throw error;
      await privateDirectory(staging); await rename(staging, retained);
      await syncDirectory(directory); await syncDirectory(retainedRoot);
      journal = { schema: PROJECT_SCHEMA, preparationId: intent.id, attemptId: randomUUID(), phase: 'PREPARING',
        retained: [...journal.retained, retained] };
      await atomicJson(directory, 'merchant-preparation.json', journal);
      continue;
    }
    journal = { ...journal, phase: 'READY', configurationSha256: ready.sha256 };
    await atomicJson(directory, 'merchant-preparation.json', journal);
    if (await exists(target)) throw fault('NOCODB_PROJECT_MERCHANT_TARGET_APPEARED');
    await rename(staging, target); await syncDirectory(directory);
    journal = { ...journal, phase: 'PUBLISHED' };
    await atomicJson(directory, 'merchant-preparation.json', journal);
    return validateMerchant(installation, target, connectionFile, intent.input.title, ready.sha256);
  }
  throw fault('NOCODB_PROJECT_PREPARATION_RETRY', 'Retained incomplete initialization; run the same preparation again.');
}

export async function prepareProject(raw) {
  const input = normalizeRequest(raw), installation = await installedSource(input.runtimeDirectory);
  const connection = await verifyConnectionFile(installation, input.connectionsFile);
  await privateDirectory(input.directory, true);
  const release = await acquireWorkspace(input.directory);
  let workspace;
  try {
    const preparationFile = join(input.directory, 'PREPARATION.json');
    let intent;
    if (await exists(preparationFile)) {
      intent = await readJson(preparationFile, 1024 * 1024);
      if (intent.schema !== PROJECT_SCHEMA || identity(intent.input) !== identity(input) ||
          intent.manifestSha256 !== installation.manifestSha256 || intent.connectionSha256 !== connection.sha256 ||
          !UUID.test(intent.id ?? '')) throw fault('NOCODB_PROJECT_PREPARATION_CHANGED', 'Resume with the exact original setup and connection references.');
      if (await exists(join(input.directory, 'project.json'))) return await readProject(input.directory);
    } else {
      const names = await readdir(input.directory);
      if (names.some(name => name !== 'publisher.lock')) throw fault('NOCODB_PROJECT_DIRECTORY_NOT_EMPTY');
      // Hash declared inputs without allocating or decoding the whole capture in setup.
      for (const entry of Object.values(input.inputs)) {
        const checked = await hashPrivate(entry.file, entry.kind === 'packet' ? MAX_PACKET_BYTES : 1024 * 1024);
        if (checked.hash !== entry.sha256) throw fault('NOCODB_PROJECT_INPUT_CHANGED');
      }
      intent = { schema: PROJECT_SCHEMA, id: randomUUID(), createdAt: new Date().toISOString(), input,
        manifestSha256: installation.manifestSha256, connectionSha256: connection.sha256 };
      await createOrVerify(preparationFile, bytes(intent), 1024 * 1024);
    }
    const native = await original(installation, AUTHORING_PATH + '/model.mjs');
    if (input.adopt) await privateDirectory(input.workspaceDirectory);
    workspace = await native.openNocoDBAuthoring({ directory: input.workspaceDirectory, create: !input.adopt,
      connections: connection.connections, seller: input.seller, resource: input.resource });
    // This is the original workspace; setup neither imports nor selects a source.
    await workspace.close(); workspace = null;
    const launch = await original(installation, AUTHORING_PATH + '/launch.mjs');
    const workspaceIdentity = await launch.inspectNocoDBAuthoring(input.workspaceDirectory);
    const providerFile = connection.content ? join(input.directory, 'provider-connections.json') : null;
    if (providerFile) await createOrVerify(providerFile, connection.content, 1024 * 1024);
    const workspacesFile = join(input.directory, 'nocodb-workspaces.json');
    const entry = { label: input.title, directory: input.workspaceDirectory,
      ...(providerFile ? { connections: providerFile } : {}),
      inputs: Object.fromEntries(Object.entries(input.inputs).map(([alias, value]) =>
        [alias, { kind: value.kind, file: value.file, label: value.label }])),
      ...(input.seller ? { seller: input.seller, resource: input.resource } : {}) };
    const workspacesContent = bytes({ schema: 'stellar-forge.nocodb-authoring-connection.v1', workspaces: { [PROJECT_ALIAS]: entry } });
    await createOrVerify(workspacesFile, workspacesContent, 1024 * 1024);
    const merchant = await prepareMerchant(input.directory, installation, intent, workspacesFile);
    const tokenFile = join(input.directory, 'mcp-access-token');
    if (!await exists(tokenFile)) await createOrVerify(tokenFile, Buffer.from(randomBytes(32).toString('base64url') + '\n'), 256);
    const token = (await readPrivate(tokenFile, 256)).toString('utf8').trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw fault('NOCODB_PROJECT_TOKEN_FILE_INVALID');
    const applicationSettingsFile = join(input.directory, 'application-settings.json');
    const settings = { workspaceDirectory: input.workspaceDirectory, ...(providerFile ? { connectionsFile: providerFile } : {}) };
    await createOrVerify(applicationSettingsFile, bytes(settings));
    const state = { schema: PROJECT_SCHEMA, directory: input.directory, title: input.title, preparationId: intent.id,
      createdAt: intent.createdAt, installation, workspaceDirectory: input.workspaceDirectory,
      workspaceIdentity: workspaceIdentity.sha256, immutableSettingsSha256: workspaceIdentity.settingsSha256,
      workspacesFile, workspacesSha256: digest(workspacesContent), providerFile, providerSha256: connection.sha256,
      merchantConfigFile: merchant.file, merchantConfigSha256: merchant.sha256, tokenFile, tokenSha256: digest(Buffer.from(token)),
      applicationSettingsFile, applicationSettingsSha256: digest(bytes(settings)), inputs: input.inputs,
      buyer: input.seller ? { seller: input.seller, resource: input.resource } : null };
    await privateDirectory(join(input.directory, 'requests'), true);
    await createOrVerify(join(input.directory, 'PREPARED.json'), bytes({
      schema: PROJECT_SCHEMA, preparationId: intent.id, workspaceIdentity: state.workspaceIdentity,
      sourceCommit: installation.sourceCommit, manifestSha256: installation.manifestSha256,
      providerRead: false, importedSource: false, publisherStarted: false, merchantStarted: false,
    }));
    await createOrVerify(join(input.directory, 'project.json'), bytes(state), 2 * 1024 * 1024);
    return state;
  } finally { try { await workspace?.close(); } finally { await release(); } }
}

export async function readProject(directory) {
  absolute(directory, 'project directory'); await privateDirectory(directory);
  const state = await readJson(join(directory, 'project.json'), 2 * 1024 * 1024);
  if (state.schema !== PROJECT_SCHEMA || state.directory !== directory || !UUID.test(state.preparationId ?? '') ||
      state.workspacesFile !== join(directory, 'nocodb-workspaces.json') ||
      state.merchantConfigFile !== join(directory, 'merchant', 'merchant-mcp.json') ||
      state.tokenFile !== join(directory, 'mcp-access-token') ||
      state.applicationSettingsFile !== join(directory, 'application-settings.json') ||
      state.providerFile !== null && state.providerFile !== join(directory, 'provider-connections.json'))
    throw fault('NOCODB_PROJECT_CHANGED');
  const intent = await readJson(join(directory, 'PREPARATION.json'), 1024 * 1024);
  const prepared = await readJson(join(directory, 'PREPARED.json'));
  if (intent.schema !== PROJECT_SCHEMA || intent.id !== state.preparationId || intent.input.directory !== directory ||
      intent.input.title !== state.title || intent.input.workspaceDirectory !== state.workspaceDirectory ||
      intent.input.runtimeDirectory !== state.installation.runtimeDirectory ||
      intent.manifestSha256 !== state.installation.manifestSha256 || intent.connectionSha256 !== state.providerSha256 ||
      identity(intent.input.inputs) !== identity(state.inputs) ||
      (intent.input.seller ?? null) !== (state.buyer?.seller ?? null) ||
      (intent.input.resource ?? null) !== (state.buyer?.resource ?? null) ||
      prepared.preparationId !== state.preparationId || prepared.workspaceIdentity !== state.workspaceIdentity)
    throw fault('NOCODB_PROJECT_PREPARATION_CHANGED');
  const installation = await installedSource(state.installation.runtimeDirectory);
  if (installation.sourceRoot !== state.installation.sourceRoot ||
      installation.manifestSha256 !== state.installation.manifestSha256)
    throw fault('NOCODB_PROJECT_RUNTIME_CHANGED', 'Use the originally selected runtime or prepare a separate reviewed project binding.');
  for (const [file, expected] of [[state.workspacesFile, state.workspacesSha256],
    [state.applicationSettingsFile, state.applicationSettingsSha256], ...(state.providerFile ? [[state.providerFile, state.providerSha256]] : [])])
    if (digest(await readPrivate(file, 1024 * 1024)) !== expected) throw fault('NOCODB_PROJECT_CONFIG_CHANGED');
  await validateMerchant(installation, dirname(state.merchantConfigFile), state.workspacesFile, state.title, state.merchantConfigSha256);
  const launch = await original(installation, AUTHORING_PATH + '/launch.mjs');
  await launch.inspectNocoDBAuthoring(state.workspaceDirectory, { expectedIdentity: state.workspaceIdentity });
  return state;
}

async function withStoppedProject(directory, work) {
  const state = await readProject(directory), release = await acquireWorkspace(directory);
  let workspace;
  try {
    const current = await readProject(directory);
    if (identity(current) !== identity(state)) throw fault('NOCODB_PROJECT_CHANGED');
    const connections = await verifyConnectionFile(state.installation, state.providerFile);
    const native = await original(state.installation, AUTHORING_PATH + '/model.mjs');
    workspace = await native.openNocoDBAuthoring({ directory: state.workspaceDirectory,
      connections: connections.connections, seller: state.buyer?.seller ?? null, resource: state.buyer?.resource ?? null,
      expectedIdentity: state.workspaceIdentity });
    return await work(workspace, state);
  } finally { try { await workspace?.close(); } finally { await release(); } }
}

export async function inspectProject(directory) {
  const state = await readProject(directory), launch = await original(state.installation, AUTHORING_PATH + '/launch.mjs');
  return { schema: PROJECT_SCHEMA, directory, title: state.title, sourceCommit: state.installation.sourceCommit,
    manifestSha256: state.installation.manifestSha256, workspace: await launch.inspectNocoDBAuthoring(state.workspaceDirectory),
    inputAliases: Object.keys(state.inputs), providerConnectionsConfigured: state.providerFile !== null,
    merchantConfigFile: state.merchantConfigFile, applicationSettingsFile: state.applicationSettingsFile,
    session: await exists(join(directory, 'session.json')) ? await readJson(join(directory, 'session.json')) : null,
    sessionIsHistorical: true };
}
export async function nativeStatus(directory) {
  return withStoppedProject(directory, workspace => workspace.status());
}

export async function importDeclaredInput(directory, { input: alias, title, expectedDraftRevision, requestId }) {
  if (!ALIAS.test(alias ?? '')) throw fault('NOCODB_PROJECT_INPUT_ALIAS_INVALID');
  text(title, 'capture title'); integer(expectedDraftRevision); uuid(requestId);
  return withStoppedProject(directory, async (workspace, state) => {
    const input = state.inputs[alias];
    if (!input) throw fault('NOCODB_PROJECT_INPUT_NOT_DECLARED');
    const request = { schema: PROJECT_SCHEMA, kind: 'IMPORT', requestId, workspaceIdentity: state.workspaceIdentity,
      input: alias, inputSha256: input.sha256, title, expectedDraftRevision };
    const requestFile = join(directory, 'requests', requestId + '.json');
    const retained = await exists(requestFile), existing = workspace.operation(requestId);
    if (existing && !retained) throw fault('NOCODB_PROJECT_REQUEST_ALREADY_USED',
      'That UUID already belongs to a native request outside this product import. Inspect it without adopting its result.');
    await createOrVerify(requestFile, bytes(request));
    if (existing) {
      if (existing.kind !== 'IMPORT') throw fault('NOCODB_PROJECT_REQUEST_REUSED');
      if (existing.status === 'complete') return { requestId, originalReceipt: existing, replayed: true };
      return { requestId, originalReceipt: existing, resumeRequired: true };
    }
    const packetModule = await original(state.installation, AUTHORING_PATH + '/packet.mjs');
    let packet;
    if (input.kind === 'source') {
      packet = await packetModule.makeNocoDBSourcePacket(input.file);
      if (packet.origin?.sourceSha256 !== input.sha256) throw fault('NOCODB_PROJECT_INPUT_CHANGED');
    } else {
      const content = await readPrivate(input.file, packetModule.MAX_PACKET_BYTES);
      if (digest(content) !== input.sha256) throw fault('NOCODB_PROJECT_INPUT_CHANGED');
      packet = decode(content);
    }
    const result = await workspace.importPacket({ packet, title, expectedDraftRevision, requestId });
    return { requestId, result, originalReceipt: workspace.operation(requestId) };
  });
}
export async function inspectOperation(directory, requestId) {
  uuid(requestId);
  return withStoppedProject(directory, workspace => ({ requestId, originalReceipt: workspace.operation(requestId) }));
}
export async function resumeOperation(directory, requestId) {
  uuid(requestId);
  return withStoppedProject(directory, async workspace => ({ requestId,
    result: await workspace.resume(requestId), originalReceipt: workspace.operation(requestId) }));
}
export async function exportPrivateVersion(directory, { versionId, expectedSourceSha256, file }) {
  if (!Number.isSafeInteger(versionId) || versionId < 1) throw fault('NOCODB_PROJECT_VERSION_REQUIRED');
  sha(expectedSourceSha256); absolute(file, 'private packet destination');
  await privateDirectory(dirname(file));
  return withStoppedProject(directory, async workspace => {
    const version = workspace.version(versionId);
    if (version.sourceSha256 !== expectedSourceSha256) throw fault('NOCODB_PROJECT_VERSION_CHANGED');
    const packet = await workspace.exportVersion(versionId);
    await createOrVerify(file, packet.bytes, MAX_PACKET_BYTES);
    return { file, versionId, sourceSha256: version.sourceSha256,
      bytes: packet.bytes.length, sha256: digest(packet.bytes), scope: 'PRIVATE_FULL_CAPTURE_PACKET' };
  });
}

export async function openProject(directory, { port = 0, signal } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw fault('NOCODB_PROJECT_PORT_INVALID');
  const state = await readProject(directory), release = await acquireWorkspace(directory);
  let host = null, released = false, closing = null, admissionClosed = false, startup, closedResult = null, closeError = null;
  const ownCalls = new Set(), instanceId = randomUUID();
  const close = () => {
    if (released) return Promise.resolve(closedResult);
    admissionClosed = true;
    if (!closing) closing = (async () => {
      if (startup) await startup.catch(() => {});
      // Original close stops HTTP admission, drains providers, the NocoDB browser,
      // publisher/scheduler, retained readers and its SF82 merchant before releasing their leases.
      const nativeClose = host ? host.close() : Promise.resolve();
      await Promise.all([nativeClose, Promise.allSettled([...ownCalls])]);
      let journalError;
      try { await atomicJson(directory, 'session.json', { schema: PROJECT_SCHEMA, instanceId, phase: 'CLOSED',
        endedAt: new Date().toISOString(), sourceCommit: state.installation.sourceCommit,
        workspaceIdentity: state.workspaceIdentity }); } catch (error) { journalError = error; }
      if (!released) { await release(); released = true; }
      closedResult = { schema: PROJECT_SCHEMA, instanceId, phase: 'CLOSED',
        ...(journalError ? { journalError: journalError.code ?? 'SESSION_WRITE_FAILED' } : {}) };
      if (journalError) throw Object.assign(journalError, { originalHostClosed: true });
      return closedResult;
    })().catch(error => { closeError = error; if (!released) closing = null; throw error; });
    return closing;
  };
  const abort = () => { admissionClosed = true; close().catch(error => { closeError = error; }); };
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) admissionClosed = true;
  const call = async (name, args = {}) => {
    if (admissionClosed) throw fault('NOCODB_PROJECT_CLOSING');
    if (!host) throw fault('NOCODB_PROJECT_NOT_OPEN');
    const promise = Promise.resolve().then(() => host.operator.call(name, args));
    ownCalls.add(promise);
    try { return await promise; } finally { ownCalls.delete(promise); }
  };
  startup = (async () => {
    const current = await readProject(directory);
    if (identity(current) !== identity(state)) throw fault('NOCODB_PROJECT_CHANGED');
    const token = (await readPrivate(state.tokenFile, 256)).toString('utf8').trim();
    if (digest(Buffer.from(token)) !== state.tokenSha256) throw fault('NOCODB_PROJECT_TOKEN_CHANGED');
    if (admissionClosed) throw fault('NOCODB_PROJECT_START_CANCELLED');
    const originalServer = await original(state.installation, MCP_PATH + '/serve.mjs');
    const environment = { ...process.env, [TOKEN_ENV]: token };
    // This project declares its own local bearer. Unrelated process-wide OAuth/client origins are not its host policy.
    delete environment.MCP_OAUTH_CONFIG; delete environment.MCP_CLIENT_ORIGINS;
    host = await originalServer.startMerchantMcp({ configPath: state.merchantConfigFile, port, tokenEnv: TOKEN_ENV, environment });
    if (admissionClosed) throw fault('NOCODB_PROJECT_START_CANCELLED');
    const opened = await call('merchant_nocodb_open', { workspace: PROJECT_ALIAS });
    if (admissionClosed) throw fault('NOCODB_PROJECT_START_CANCELLED');
    const result = { schema: PROJECT_SCHEMA, instanceId, phase: 'OPEN', startedAt: new Date().toISOString(),
      directory, title: state.title, sourceCommit: state.installation.sourceCommit,
      manifestSha256: state.installation.manifestSha256, workspaceIdentity: state.workspaceIdentity,
      authoringInstanceId: opened.instanceId, browserUrl: opened.browserUrl, mcpUrl: host.url,
      mcpTokenFile: state.tokenFile, workspaceAlias: PROJECT_ALIAS,
      tools: host.operator.tools.map(tool => tool.name) };
    await atomicJson(directory, 'session.json', result);
    return result;
  })();
  try {
    const session = await startup;
    if (admissionClosed) throw fault('NOCODB_PROJECT_START_CANCELLED');
    return { state, session, operator: host.operator, call, get closeError() { return closeError; },
      close: async () => { try { await close(); } finally { signal?.removeEventListener('abort', abort); } } };
  } catch (error) {
    signal?.removeEventListener('abort', abort);
    try { await close(); } catch (cleanupError) {
      error.cleanupError = cleanupError; error.close = close;
      // The project lease stays held while the original host has an unresolved drain.
    }
    throw error;
  }
}
