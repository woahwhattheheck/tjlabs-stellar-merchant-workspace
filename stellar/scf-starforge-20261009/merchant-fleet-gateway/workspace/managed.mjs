// MIT. Reviewed Applications startup over the original managed fleet.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFleetReleasePlan } from '../release-operator.mjs';
import { readReleaseState } from '../../sf82-seller-pilot/releases.mjs';

export const FLEET_STARTUP_SCHEMA = 'stellar-forge.fleet-workspace-startup.v1';
export const FLEET_IDENTITY_SCHEMA = 'stellar-forge.fleet-workspace-identity.v1';
export const FLEET_SOURCE = 'stellar/scf-starforge-20261009/merchant-fleet-gateway';
const EXECUTED_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const FLEET_LAUNCH_FILES = Object.freeze([
  ...['managed.mjs', 'server.mjs', 'browser-assets.json', 'index.html',
    'browser.mjs', 'clients.mjs', 'discovery.mjs', 'delivery.mjs', 'style.css']
    .map(name => FLEET_SOURCE + '/workspace/' + name),
  ...['release-operator.mjs', 'release-operations.mjs', 'release-clients.mjs',
    'release-discovery.mjs', 'release-delivery.mjs', 'gateway.mjs', 'control.mjs',
    'control-server.mjs', 'rollout.mjs', 'rollout-state.mjs', 'state-lease.mjs']
    .map(name => FLEET_SOURCE + '/' + name),
  'stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs',
  'stellar/scf-starforge-20261009/sf82-seller-pilot/release-ui/client.mjs',
  'stellar/scf-starforge-20261009/distribution/browser-assets.mjs',
]);
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const fleetIdentity = value => hash(JSON.stringify(canonical(value)) + '\n');
const inode = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const sameInode = (a, b) => String(a.dev) === String(b.dev) && String(a.ino) === String(b.ino);
function fail(code, message) { return Object.assign(new Error(message), { code }); }
function need(value, code, message) { if (!value) throw fail(code, message); }
function selectedPath(value, label) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value &&
    !/[\u0000-\u001f]/.test(value), 'FLEET_MANAGED_PATH_REQUIRED',
  'Choose an absolute canonical original ' + label + '.');
  return value;
}
function expected(value) {
  need(value === undefined || HASH.test(value), 'FLEET_MANAGED_HASH_REQUIRED',
    'Keep the complete identity returned by the original Applications review.');
}
const changed = () => fail('FLEET_MANAGED_INPUT_CHANGED',
  'The original fleet plan, state directory or runtime source changed. Review that same application again.');

async function directory(path, { privateOnly = true } = {}) {
  selectedPath(path, 'directory');
  const stat = await lstat(path, { bigint: true });
  need(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(path) === path &&
    (!privateOnly || !(stat.mode & 0o077n)), 'FLEET_MANAGED_DIRECTORY_REQUIRED',
  'Choose a real ' + (privateOnly ? 'private ' : '') + 'original directory: ' + path);
  return stat;
}
async function originalFile(path, limit) {
  selectedPath(path, 'file');
  need(await realpath(dirname(path)) === dirname(path), 'FLEET_MANAGED_DIRECTORY_REQUIRED',
    'The selected source file must have its original canonical parent.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(limit), 'FLEET_MANAGED_FILE_INVALID',
      'The original file exceeds its supported size or is not a regular file: ' + path);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true }), current = await lstat(path, { bigint: true });
    if (BigInt(bytes.length) !== before.size || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        !sameInode(before, after) || !sameInode(after, current) || current.isSymbolicLink()) throw changed();
    return { bytes, sha256: hash(bytes), ...inode(after) };
  } finally { await handle.close(); }
}

/** Read-only preparation. Native generation/history, selected release IDs and
 * delivery/client/discovery work remain mutable original operating state. */
export async function inspectFleetWorkspace({ planFile, directory: root, gatewayStateDirectory,
  expectedIdentity } = {}) {
  expected(expectedIdentity);
  root = selectedPath(root, 'fleet manager directory');
  planFile = selectedPath(planFile, 'fleet release plan');
  const gateway = selectedPath(gatewayStateDirectory ?? join(root, 'gateway'), 'gateway state directory');
  need(gateway !== root, 'FLEET_RELEASE_SEPARATE_STATE_REQUIRED',
    'The fleet manager and gateway keep their separate original state directories.');
  const rootBefore = await directory(root);
  const parentBefore = await directory(dirname(gateway));
  try { await directory(gateway); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const planBefore = await originalFile(planFile, 1024 * 1024);
  const plan = await readFleetReleasePlan(planFile);
  const stores = [], summaries = [];
  for (const tenant of plan.tenants) {
    const slots = [];
    for (const [slotName, slot] of Object.entries(tenant.slots)) {
      const before = await directory(slot.store), releases = join(slot.store, 'releases');
      const releasesBefore = await directory(releases), state = await readReleaseState(slot.store);
      need(typeof state.createdAt === 'string' && Number.isFinite(Date.parse(state.createdAt)),
        'FLEET_MANAGED_STORE_IDENTITY_REQUIRED', 'Select an initialized original SF82 release store.');
      const after = await directory(slot.store), releasesAfter = await directory(releases);
      if (!sameInode(before, after) || !sameInode(releasesBefore, releasesAfter)) throw changed();
      stores.push({ tenant: tenant.id, slot: slotName, path: slot.store,
        ...inode(after), releases: inode(releasesAfter), createdAt: state.createdAt });
      slots.push({ name: slotName, store: slot.store, port: slot.port,
        selectedReleaseId: state.active, previousReleaseId: state.previous, generation: state.generation });
    }
    summaries.push({ id: tenant.id, host: tenant.host, startupSlot: tenant.startupSlot,
      packages: Object.keys(tenant.packages), slots });
  }
  const rootAfter = await directory(root), parentAfter = await directory(dirname(gateway));
  const planAfter = await originalFile(planFile, 1024 * 1024);
  if (!sameInode(rootBefore, rootAfter) || !sameInode(parentBefore, parentAfter) ||
      planBefore.sha256 !== planAfter.sha256 || !sameInode(planBefore, planAfter)) throw changed();
  const identity = { schema: 'stellar-forge.fleet-workspace-selection.v1',
    directory: root, manager: inode(rootAfter),
    plan: { path: planFile, bytes: planAfter.bytes.length, sha256: planAfter.sha256,
      dev: planAfter.dev, ino: planAfter.ino }, planDigest: plan.digest,
    gatewayStateDirectory: gateway, gatewayParent: { path: dirname(gateway), ...inode(parentAfter) },
    stores };
  const sha256 = fleetIdentity(identity);
  if (expectedIdentity !== undefined && sha256 !== expectedIdentity) throw changed();
  return { ...identity, sha256, gateway: plan.gateway, tenants: summaries };
}

/** Direct fleet/browser launch leaves supplement the full installed release
 * identity already retained by the original Applications host. */
export async function inspectFleetLaunchSource(sourceRoot, { expectedSha256 } = {}) {
  expected(expectedSha256);
  sourceRoot = selectedPath(sourceRoot, 'installed source root');
  await directory(sourceRoot, { privateOnly: false });
  const files = [];
  for (const name of FLEET_LAUNCH_FILES) {
    const file = await originalFile(join(sourceRoot, name), 4 * 1024 * 1024);
    files.push({ name, bytes: file.bytes.length, sha256: file.sha256 });
  }
  const identity = { schema: 'stellar-forge.fleet-launch-source.v1', files };
  const sha256 = fleetIdentity(identity);
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) throw changed();
  return { ...identity, sourceRoot, sha256 };
}

export function parseFleetManagedArguments(args) {
  const allowed = new Set(['--plan', '--directory', '--state', '--source-root',
    '--expected-workspace-identity', '--expected-source-sha256', '--operation-id', '--port']);
  const values = new Map();
  need(Array.isArray(args) && args.length % 2 === 0, 'FLEET_MANAGED_ARGUMENTS_INVALID',
    'Use the original managed command prepared in Applications.');
  for (let i = 0; i < args.length; i += 2) {
    need(allowed.has(args[i]) && !values.has(args[i]) && typeof args[i + 1] === 'string' &&
      args[i + 1].length > 0, 'FLEET_MANAGED_ARGUMENTS_INVALID',
    'Use each retained managed argument once.');
    values.set(args[i], args[i + 1]);
  }
  const required = [...allowed].filter(key => key !== '--state');
  need(required.every(key => values.has(key)) &&
    HASH.test(values.get('--expected-workspace-identity') ?? '') &&
    HASH.test(values.get('--expected-source-sha256') ?? '') &&
    UUID.test(values.get('--operation-id') ?? '') &&
    /^(?:0|[1-9]\d{0,4})$/.test(values.get('--port') ?? '') &&
    Number(values.get('--port')) <= 65535, 'FLEET_MANAGED_ARGUMENTS_INVALID',
  'Use the complete original plan, source, operation and port selection.');
  return {
    planFile: selectedPath(values.get('--plan'), 'fleet release plan'),
    directory: selectedPath(values.get('--directory'), 'fleet manager directory'),
    ...(values.has('--state') ? { gatewayStateDirectory: selectedPath(values.get('--state'), 'gateway state directory') } : {}),
    sourceRoot: selectedPath(values.get('--source-root'), 'installed source root'),
    expectedWorkspaceIdentity: values.get('--expected-workspace-identity'),
    expectedSourceSha256: values.get('--expected-source-sha256'),
    operationId: values.get('--operation-id'), port: Number(values.get('--port')),
  };
}

export async function prepareFleetManagedLaunch(selection) {
  need(object(selection) && HASH.test(selection.expectedWorkspaceIdentity ?? '') &&
    HASH.test(selection.expectedSourceSha256 ?? '') && UUID.test(selection.operationId ?? ''),
  'FLEET_MANAGED_REVIEW_REQUIRED', 'Start this fleet through its retained Applications review.');
  const workspace = await inspectFleetWorkspace({ ...selection, expectedIdentity: selection.expectedWorkspaceIdentity });
  const source = await inspectFleetLaunchSource(selection.sourceRoot, { expectedSha256: selection.expectedSourceSha256 });
  const executed = await inspectFleetLaunchSource(EXECUTED_SOURCE_ROOT, { expectedSha256: selection.expectedSourceSha256 });
  const ports = [workspace.gateway.port, workspace.gateway.adminPort,
    ...workspace.tenants.flatMap(tenant => tenant.slots.map(slot => slot.port))];
  need(selection.port === 0 || !ports.includes(selection.port), 'FLEET_WORKSPACE_PORT_CONFLICT',
    'Choose an operator console port separate from the gateway, admin and merchant slot ports.');
  return { selection, workspace, source, executed,
    binding: { operationId: selection.operationId, workspaceIdentity: workspace.sha256, sourceSha256: source.sha256 } };
}

/** The original listener and SF82 sessions have already opened. Its identity
 * endpoint and startup line describe that same live instance. */
export async function fleetManagedStartup({ launch, service } = {}) {
  need(launch && service && object(service.identity) && typeof service.sessionKey === 'string',
    'FLEET_MANAGED_LISTENER_REQUIRED', 'Wait for the original managed fleet listener.');
  const workspace = await inspectFleetWorkspace({ ...launch.selection, expectedIdentity: launch.workspace.sha256 });
  const source = await inspectFleetLaunchSource(launch.source.sourceRoot, { expectedSha256: launch.source.sha256 });
  await inspectFleetLaunchSource(launch.executed.sourceRoot, { expectedSha256: launch.source.sha256 });
  const identity = service.identity;
  need(identity.schema === FLEET_IDENTITY_SCHEMA && identity.managed === true &&
    identity.planFile === workspace.plan.path && identity.directory === workspace.directory &&
    identity.gatewayStateDirectory === workspace.gatewayStateDirectory &&
    identity.planDigest === workspace.planDigest && identity.operationId === launch.selection.operationId &&
    identity.workspaceIdentity === workspace.sha256 && identity.sourceSha256 === source.sha256 &&
    UUID.test(identity.instanceId ?? '') && identity.pid === process.pid && identity.ppid === process.ppid,
  'FLEET_MANAGED_LISTENER_CHANGED', 'The native listener differs from its reviewed fleet.');
  const url = new URL(service.url);
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/' &&
    !url.username && !url.password && !url.search && !url.hash &&
    identity.origin === url.origin && /^[A-Za-z0-9_-]{43}$/.test(service.sessionKey),
  'FLEET_MANAGED_LISTENER_CHANGED', 'Use the original private fleet workspace URL.');
  return { schema: FLEET_STARTUP_SCHEMA, status: 'FLEET_WORKSPACE_READY',
    operationId: launch.selection.operationId, instanceId: identity.instanceId,
    pid: identity.pid, ppid: identity.ppid,
    directory: workspace.directory, planFile: workspace.plan.path,
    gatewayStateDirectory: workspace.gatewayStateDirectory, planDigest: workspace.planDigest,
    workspaceIdentity: workspace.sha256, sourceRoot: source.sourceRoot,
    executedSourceRoot: launch.executed.sourceRoot, sourceSha256: source.sha256, sourceFiles: source.files,
    operatorUrl: url.href, sessionKey: service.sessionKey,
    ...(service.publicURL ? { merchantIngress: service.publicURL } : {}) };
}
