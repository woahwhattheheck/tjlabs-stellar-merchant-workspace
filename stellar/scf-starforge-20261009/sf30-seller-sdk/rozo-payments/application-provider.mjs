// MIT. ROZO's original workspace in the maintained Applications lifecycle.
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import {
  APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup,
} from '../../distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, plain } from '../../distribution/runtime-workspace/storage.mjs';

const SOURCE = 'stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
const COMMAND = 'rozo-payments';
const STARTUP = 'stellar-forge.rozo-payments-server.v1';
const STATE = 'stellar-forge.rozo-payments-state.v1';
const MANIFEST = 'INSTALLED_SOURCE.json';
const HASH = /^[a-f0-9]{64}$/;

function identity(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

export function rozoPaymentsApplication(common = [], field = (name, label, type, required, description) =>
  ({ name, label, type, required, description })) {
  return {
    id: 'rozo-payments', command: COMMAND, title: 'ROZO payments', terminal: false,
    requiredSource: SOURCE + '/cli.mjs',
    description: 'Open the original merchant workspace for orders, payment observations, callbacks, reconciliation, corrections and receiving.',
    fields: [
      field('workspaceDirectory', 'Initialized ROZO workspace', 'path', true,
        'Choose the workspace created or received by rozo-payments init.'),
      field('connectionsFile', 'Private connection configuration', 'path', true,
        'Choose the original ROZO connection JSON. API keys and callback secrets use private environment references.'),
      ...common,
    ],
  };
}

async function nativeSource(sourceRoot) {
  const store = await import(pathToFileURL(join(sourceRoot, SOURCE, 'store.mjs')).href);
  const source = await import(pathToFileURL(join(sourceRoot, SOURCE, 'source.mjs')).href);
  need(typeof store.inspectRozoWorkspace === 'function' &&
    typeof source.inspectRozoSource === 'function',
  'APPLICATION_ROZO_NATIVE_READER_REQUIRED', 'The selected ROZO runtime must include its original workspace and source readers.');
  return { ...store, ...source };
}

export async function prepareRozoPaymentsApplication(settings, { inputPath, runtimeDirectory } = {}) {
  need(typeof inputPath === 'function', 'APPLICATION_ROZO_INPUT_READER_REQUIRED');
  const directory = absolute(settings.workspaceDirectory);
  const configuration = absolute(settings.connectionsFile);
  const inputs = [
    await inputPath(directory, 'directory', false, true),
    await inputPath(configuration, 'file', false, true),
  ];
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const sourceRoot = absolute(runtime.sourceRoot);
  const native = await nativeSource(sourceRoot);
  const workspace = await native.inspectRozoWorkspace(directory);
  need(workspace?.schema === 'stellar-forge.rozo-workspace.v1' &&
    identifier(workspace.workspaceId) && identifier(workspace.originId),
  'APPLICATION_ROZO_WORKSPACE_CHANGED', 'Choose the original initialized ROZO workspace.');
  // The marker is immutable; current orders, observations and revisions remain editable work.
  inputs.push(await inputPath(join(directory, 'workspace.json'), 'file'));
  const manifestPath = join(sourceRoot, SOURCE, MANIFEST);
  const manifestInput = await inputPath(manifestPath, 'file');
  inputs.push(manifestInput);
  const source = await native.inspectRozoSource(sourceRoot, manifestPath, manifestInput.sha256);
  need(source?.manifestSha256 === manifestInput.sha256 && HASH.test(source.selectionSha256 ?? '') &&
    Array.isArray(source.files) && source.files.length > 0,
  'APPLICATION_ROZO_SOURCE_CHANGED', 'The original ROZO source selection differs from its installed manifest.');
  for (const row of source.files) {
    const input = await inputPath(join(sourceRoot, row.path), 'file');
    need(input.sha256 === row.sha256,
      'APPLICATION_ROZO_SOURCE_CHANGED', 'A selected ROZO source file changed: ' + row.path);
    inputs.push(input);
  }
  return {
    args: ['serve', '--workspace', directory, '--config', configuration, '--host', '127.0.0.1',
      '--expected-workspace-id', workspace.workspaceId, '--expected-origin-id', workspace.originId,
      '--source-root', sourceRoot, '--source-manifest', manifestPath,
      '--source-sha256', source.manifestSha256],
    inputs, createDirectories: [],
    resourceKey: identity({ family: 'rozo-payments', directory,
      workspaceId: workspace.workspaceId, originId: workspace.originId }),
  };
}

function selection(request) {
  need(request.command === COMMAND && Array.isArray(request.args) && request.args[0] === 'serve',
    'APPLICATION_ROZO_STARTUP_CHANGED');
  const args = request.args.slice(1), options = new Map();
  const required = ['--workspace', '--config', '--host', '--expected-workspace-id',
    '--expected-origin-id', '--source-root', '--source-manifest', '--source-sha256'];
  const allowed = new Set([...required, '--port']);
  need(args.length % 2 === 0, 'APPLICATION_ROZO_STARTUP_CHANGED');
  for (let at = 0; at < args.length; at += 2) {
    need(allowed.has(args[at]) && !options.has(args[at]) && typeof args[at + 1] === 'string',
      'APPLICATION_ROZO_STARTUP_CHANGED');
    options.set(args[at], args[at + 1]);
  }
  need(required.every(name => options.has(name)) && options.get('--host') === '127.0.0.1' &&
    identifier(options.get('--expected-workspace-id')) && identifier(options.get('--expected-origin-id')) &&
    HASH.test(options.get('--source-sha256') ?? ''),
  'APPLICATION_ROZO_STARTUP_CHANGED');
  const rawPort = options.get('--port') ?? '0';
  need(/^(0|[1-9]\d*)$/.test(rawPort) && Number(rawPort) <= 65535,
    'APPLICATION_ROZO_STARTUP_CHANGED');
  const sourceRoot = absolute(options.get('--source-root'));
  const sourceManifest = absolute(options.get('--source-manifest'));
  need(sourceManifest === join(sourceRoot, SOURCE, MANIFEST),
    'APPLICATION_ROZO_STARTUP_CHANGED', 'The managed ROZO launch must retain its installed original source manifest.');
  return {
    directory: absolute(options.get('--workspace')), configuration: absolute(options.get('--config')),
    workspaceId: options.get('--expected-workspace-id'), originId: options.get('--expected-origin-id'),
    sourceRoot, sourceManifest, sourceSha256: options.get('--source-sha256'), port: Number(rawPort),
  };
}

async function liveState(origin, token) {
  const response = await fetch(new URL('/api/state', origin), {
    redirect: 'error', headers: { 'X-Rozo-Session': token }, signal: AbortSignal.timeout(10000),
  });
  need(response.status === 200 &&
    /^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''),
  'APPLICATION_ROZO_STARTUP_UNAVAILABLE', 'The original ROZO listener did not return its authenticated workspace state.');
  const maximum = 8 * 1024 * 1024;
  const declared = response.headers.get('content-length');
  need(declared === null || /^\d+$/.test(declared) && Number(declared) <= maximum,
    'APPLICATION_ROZO_STARTUP_UNAVAILABLE');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    need(size <= maximum, 'APPLICATION_ROZO_STARTUP_UNAVAILABLE');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

export async function rozoPaymentsStartup(request, text) {
  if (request.command !== COMMAND || typeof text !== 'string' ||
    !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== STARTUP) return null;
  const selected = selection(request);
  need(value.workspaceId === selected.workspaceId && value.originId === selected.originId &&
    Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.sessionToken === 'string' && value.sessionToken.length > 0 && value.sessionToken.length <= 512,
  'APPLICATION_ROZO_STARTUP_CHANGED', 'The started ROZO workspace differs from the reviewed application.');
  let url, origin, endpoint;
  try { url = new URL(value.url); origin = new URL(value.origin); endpoint = new URL(value.stateEndpoint); }
  catch { need(false, 'APPLICATION_ROZO_STARTUP_CHANGED'); }
  const port = Number(url.port || 80);
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password &&
    url.pathname === '/' && !url.search && url.hash === '#session=' + encodeURIComponent(value.sessionToken) &&
    port >= 1 && port <= 65535 && (!selected.port || selected.port === port) &&
    origin.origin === url.origin && origin.pathname === '/' && !origin.search && !origin.hash &&
    !origin.username && !origin.password &&
    endpoint.href === new URL('/api/state', url.origin).href,
  'APPLICATION_ROZO_STARTUP_CHANGED', 'The original ROZO startup must name its private loopback listener.');

  const native = await nativeSource(selected.sourceRoot);
  const workspace = await native.inspectRozoWorkspace(selected.directory);
  need(workspace.workspaceId === selected.workspaceId && workspace.originId === selected.originId,
    'APPLICATION_ROZO_WORKSPACE_CHANGED');
  const source = await native.inspectRozoSource(selected.sourceRoot, selected.sourceManifest, selected.sourceSha256);
  const executedSourceRoot = join(absolute(request.releaseDirectory), 'source');
  const executedManifest = join(executedSourceRoot, relative(selected.sourceRoot, selected.sourceManifest));
  await native.inspectRozoSource(executedSourceRoot, executedManifest, selected.sourceSha256);
  need(value.sourceIdentity?.manifestSha256 === source.manifestSha256 &&
    value.sourceIdentity?.selectionSha256 === source.selectionSha256 &&
    JSON.stringify(value.sourceIdentity?.files) === JSON.stringify(source.files),
  'APPLICATION_ROZO_SOURCE_CHANGED');
  const state = await liveState(url.origin, value.sessionToken);
  need(state?.schema === STATE && state.workspace?.workspaceId === selected.workspaceId &&
    state.workspace?.originId === selected.originId &&
    state.sourceIdentity?.manifestSha256 === source.manifestSha256 &&
    state.sourceIdentity?.selectionSha256 === source.selectionSha256,
  'APPLICATION_ROZO_STARTUP_CHANGED', 'The live ROZO workspace differs from the original selected workspace.');
  return {
    url: url.href, workspaceId: selected.workspaceId,
    original: {
      schema: STARTUP, directory: selected.directory, configuration: selected.configuration,
      workspaceId: selected.workspaceId, originId: selected.originId, workspaceCreatedAt: workspace.createdAt,
      sourceRoot: selected.sourceRoot, executedSourceRoot, sourceManifest: selected.sourceManifest,
      sourceSha256: source.manifestSha256, sourceSelectionSha256: source.selectionSha256,
      sourceFiles: source.files, pid: value.pid, stateEndpoint: endpoint.href,
    },
  };
}

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'rozo-payments', order: 1000,
  catalog({ common, field }) { return [rozoPaymentsApplication(common, field)]; },
  prepare(type, settings, context) { return prepareRozoPaymentsApplication(settings, context); },
  matchRequest(request) { return !request.pythonCommand && request.command === COMMAND; },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{"schema":"' + STARTUP + '",')) return null;
      return () => rozoPaymentsStartup(request, text);
    }, { lineLimit: 1024 * 1024 });
  },
};
