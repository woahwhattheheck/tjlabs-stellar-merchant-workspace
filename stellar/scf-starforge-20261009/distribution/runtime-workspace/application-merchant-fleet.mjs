// MIT. The original managed merchant fleet in Applications.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { absolute, plain, need } from './storage.mjs';

const SOURCE = 'stellar/scf-starforge-20261009/merchant-fleet-gateway';
const STARTUP = 'stellar-forge.fleet-workspace-startup.v1';
const IDENTITY = 'stellar-forge.fleet-workspace-identity.v1';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const field = (name, label, type = 'path', required = false, description = '') =>
  ({ name, label, type, required, description });

export function merchantFleetApplication(common = []) {
  return {
    id: 'merchant-fleet', command: 'merchant-fleet-workspace', title: 'Merchant fleet', terminal: false,
    requiredSource: SOURCE + '/workspace/managed.mjs',
    description: 'Open the original saved fleet plan, managed seller releases, customer handover, discovery and settlement delivery. Review changes, drain and stop through the same native owner.',
    fields: [
      field('planFile', 'Original fleet release plan', 'path', true,
        'Select the published fleet-plan.json from original fleet-release setup or completed fleet receiving.'),
      field('directory', 'Original fleet manager directory', 'path', true,
        'Select its initialized private directory. Existing SF82 stores and release history remain there.'),
      field('gatewayStateDirectory', 'Original gateway state directory', 'path', false,
        'Leave blank for the gateway directory inside the manager. If the original host used another path, select that same path.'),
      ...common,
    ],
  };
}

export async function prepareMerchantFleetApplication(settings, { inputPath, runtimeDirectory } = {}) {
  need(typeof inputPath === 'function', 'APPLICATION_FLEET_INPUT_READER_REQUIRED');
  const selection = { planFile: absolute(settings.planFile), directory: absolute(settings.directory),
    ...(settings.gatewayStateDirectory ? { gatewayStateDirectory: absolute(settings.gatewayStateDirectory) } : {}) };
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const native = await import(pathToFileURL(join(runtime.sourceRoot, SOURCE, 'workspace/managed.mjs')).href);
  need(typeof native.inspectFleetWorkspace === 'function' && typeof native.inspectFleetLaunchSource === 'function' &&
    typeof native.fleetIdentity === 'function' && Array.isArray(native.FLEET_LAUNCH_FILES),
  'APPLICATION_FLEET_NATIVE_READER_REQUIRED');
  const workspace = await native.inspectFleetWorkspace(selection);
  const inputs = [await inputPath(workspace.directory, 'directory', false, true)];
  const plan = await inputPath(workspace.plan.path, 'file');
  need(plan.sha256 === workspace.plan.sha256 && String(plan.dev) === workspace.plan.dev &&
    String(plan.ino) === workspace.plan.ino, 'APPLICATION_FLEET_WORKSPACE_CHANGED');
  inputs.push(plan);
  inputs.push(await inputPath(workspace.gatewayStateDirectory, 'directory', true, true));
  for (const store of workspace.stores) {
    const directory = await inputPath(store.path, 'directory', false, true);
    need(String(directory.dev) === store.dev && String(directory.ino) === store.ino,
      'APPLICATION_FLEET_WORKSPACE_CHANGED');
    inputs.push(directory, await inputPath(join(store.path, 'releases'), 'directory', false, true));
  }
  const source = await native.inspectFleetLaunchSource(runtime.sourceRoot);
  need(source.files.length === native.FLEET_LAUNCH_FILES.length, 'APPLICATION_FLEET_SOURCE_CHANGED');
  for (const [index, name] of native.FLEET_LAUNCH_FILES.entries()) {
    const file = await inputPath(join(runtime.sourceRoot, name), 'file');
    need(source.files[index].name === name && source.files[index].sha256 === file.sha256,
      'APPLICATION_FLEET_SOURCE_CHANGED');
    inputs.push(file);
  }
  const ports = [workspace.gateway.port, workspace.gateway.adminPort,
    ...workspace.tenants.flatMap(tenant => tenant.slots.map(slot => slot.port))];
  need(!settings.port || !ports.includes(settings.port), 'APPLICATION_FLEET_PORT_CONFLICT',
    'Choose a console port separate from the original gateway, admin and merchant slot ports.');
  return {
    args: ['managed', '--plan', workspace.plan.path, '--directory', workspace.directory,
      '--state', workspace.gatewayStateDirectory, '--source-root', runtime.sourceRoot,
      '--expected-workspace-identity', workspace.sha256, '--expected-source-sha256', source.sha256],
    inputs, createDirectories: [],
    resourceKey: native.fleetIdentity({ family: 'merchant-fleet', directory: workspace.directory }),
  };
}

async function nativeIdentity(url, sessionKey) {
  const response = await fetch(new URL('/api/identity', url), {
    redirect: 'error', headers: { 'X-Fleet-Workspace': sessionKey }, signal: AbortSignal.timeout(5000),
  });
  need(response.status === 200 && /^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''),
    'APPLICATION_FLEET_STARTUP_UNAVAILABLE', 'The original fleet listener did not return its authenticated identity.');
  const length = response.headers.get('content-length');
  need(length === null || /^\d+$/.test(length) && Number(length) <= 32768,
    'APPLICATION_FLEET_STARTUP_UNAVAILABLE');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    need(bytes <= 32768, 'APPLICATION_FLEET_STARTUP_UNAVAILABLE');
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { need(false, 'APPLICATION_FLEET_STARTUP_UNAVAILABLE', 'The original listener returned an unreadable identity.'); }
}

export async function merchantFleetStartup(request, text, directory) {
  if (request.command !== 'merchant-fleet-workspace' || typeof text !== 'string' || text.length > 32768 ||
      !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== STARTUP || value.status !== 'FLEET_WORKSPACE_READY') return null;
  need(Array.isArray(request.args) && request.args[0] === 'managed', 'APPLICATION_FLEET_STARTUP_CHANGED');
  const args = request.args.slice(1), sourceIndex = args.indexOf('--source-root');
  need(sourceIndex >= 0 && typeof args[sourceIndex + 1] === 'string', 'APPLICATION_FLEET_STARTUP_CHANGED');
  const sourceRoot = absolute(args[sourceIndex + 1]);
  const native = await import(pathToFileURL(join(sourceRoot, SOURCE, 'workspace/managed.mjs')).href);
  const selected = native.parseFleetManagedArguments(args);
  const executedSourceRoot = join(absolute(request.releaseDirectory), 'source');
  need(UUID.test(selected.operationId) && selected.operationId === directory.split('/').at(-1) &&
    value.operationId === selected.operationId && value.directory === selected.directory &&
    value.planFile === selected.planFile && value.gatewayStateDirectory === selected.gatewayStateDirectory &&
    value.workspaceIdentity === selected.expectedWorkspaceIdentity && HASH.test(value.planDigest ?? '') &&
    value.sourceRoot === sourceRoot && value.executedSourceRoot === executedSourceRoot &&
    value.sourceSha256 === selected.expectedSourceSha256 && UUID.test(value.instanceId ?? '') &&
    Number.isSafeInteger(value.pid) && value.pid > 0 && Number.isSafeInteger(value.ppid) && value.ppid > 0 &&
    /^[A-Za-z0-9_-]{43}$/.test(value.sessionKey ?? ''), 'APPLICATION_FLEET_STARTUP_CHANGED');
  const workspace = await native.inspectFleetWorkspace({ ...selected, expectedIdentity: selected.expectedWorkspaceIdentity });
  const source = await native.inspectFleetLaunchSource(sourceRoot, { expectedSha256: selected.expectedSourceSha256 });
  await native.inspectFleetLaunchSource(executedSourceRoot, { expectedSha256: selected.expectedSourceSha256 });
  need(value.planDigest === workspace.planDigest && JSON.stringify(value.sourceFiles) === JSON.stringify(source.files),
    'APPLICATION_FLEET_STARTUP_CHANGED');
  let url;
  try { url = new URL(value.operatorUrl); }
  catch { need(false, 'APPLICATION_FLEET_STARTUP_CHANGED'); }
  const port = Number(url.port || 80);
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' &&
    !url.username && !url.password && !url.search && !url.hash &&
    port >= 1 && port <= 65535 && (!selected.port || selected.port === port),
  'APPLICATION_FLEET_STARTUP_CHANGED');
  const live = await nativeIdentity(url, value.sessionKey);
  need(live?.schema === IDENTITY && live.managed === true &&
    live.instanceId === value.instanceId && live.pid === value.pid && live.ppid === value.ppid &&
    live.origin === url.origin && live.directory === workspace.directory &&
    live.planFile === workspace.plan.path && live.gatewayStateDirectory === workspace.gatewayStateDirectory &&
    live.planDigest === workspace.planDigest && live.operationId === selected.operationId &&
    live.workspaceIdentity === workspace.sha256 && live.sourceSha256 === source.sha256,
  'APPLICATION_FLEET_STARTUP_CHANGED', 'The live original fleet differs from this saved start operation.');
  return { url: url.href, original: {
    schema: STARTUP, operationId: selected.operationId, instanceId: value.instanceId,
    pid: value.pid, ppid: value.ppid, directory: workspace.directory,
    planFile: workspace.plan.path, gatewayStateDirectory: workspace.gatewayStateDirectory,
    planDigest: workspace.planDigest, workspaceIdentity: workspace.sha256,
    sourceRoot, executedSourceRoot, sourceSha256: source.sha256, sourceFiles: source.files,
  } };
}
