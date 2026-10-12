// MIT. Original selected-product installation inside the retained delivery receiving operation.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, readdir, rename, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const PRODUCT = '8b08a9333af070df0e96b6f09f6612eb07eab1ad';
const OPERATION = 'SCF-MANAGED-SF98-DELIVERY-E49D-20261012';
const SCHEMA = 'scratch.merchant-delivery-installation-receiving.v1';
const DIST = 'stellar/scf-starforge-20261009/distribution/';
const PROFILE = { native: true, features: ['mcp', 'openapi', 'schema'], operator: true, pins: {} };
const BOOTSTRAP = [
  {
    "path": "stellar/scf-starforge-20261009/distribution/build.mjs",
    "blob": "4eed9f08057ff8e28f41c39609cc6926c7d346bb"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/git-source.mjs",
    "blob": "3d2a0c9f34d27cce9b6ef64e39cf130dc620f8d7"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-profile.mjs",
    "blob": "dd2ecfa155a5806dec9feed4f4d9a5bd15005d95"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-install.mjs",
    "blob": "6d9374932166d7c597fb55148912be193116fa7b"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs",
    "blob": "9ba69b5e83693a5bbad8aff6677673991f5fe70b"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/source-build-workspace.mjs",
    "blob": "98ebf3dd01d30a9f671184ef6d1c3bf803ee3c8f"
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
    "blob": "ad324ba35f477871856a8fab8f18a7c873004201"
  }
];
const PRODUCT_FILES = [
  {
    "path": "products/merchant-delivery/receiving/receive.mjs",
    "blob": "ce62472d561f19195724e53e053edd9256668ea6",
    "bytes": 7789
  },
  {
    "path": "products/merchant-delivery/receiving/managed.mjs",
    "blob": "19b09076f5150343caf2f1ea92ddf999b589fd98",
    "bytes": 21136
  },
  {
    "path": "products/merchant-delivery/receiving/application-provider.mjs",
    "blob": "fafcf15c308019d57b03674a1b218d135828b411",
    "bytes": 5488
  },
  {
    "path": "products/merchant-delivery/receiving/configure.mjs",
    "blob": "c374a6cab302c48dc90be2b0be6d6111283a0570",
    "bytes": 15424
  },
  {
    "path": "products/merchant-delivery/receiving/CUSTOMER_RECEIVING.md",
    "blob": "30d7aa82ab5ece88d3efb455da79f0906cb6d9dc",
    "bytes": 14091
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/contributions/merchant-delivery-receiving.json",
    "blob": "3271e646cbdb5bb4e400520e69a5f96e6df585d6",
    "bytes": 1567
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/server.mjs",
    "blob": "56c75c04d7efc8436536ba0e482556603b4a6c3a",
    "bytes": 10391
  },
  {
    "path": "products/merchant-delivery/managed.mjs",
    "blob": "d0f7677c8c189add2cfadd9656c7944a18287128",
    "bytes": 14842
  },
  {
    "path": "products/merchant-delivery/application-provider.mjs",
    "blob": "2408f133a739b5fc6ae9a786641de902f66d4a68",
    "bytes": 4830
  },
  {
    "path": "products/merchant-delivery/configure.mjs",
    "blob": "17d8117b2e1cecd7b2846c66683728fef6c100bc",
    "bytes": 15353
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/model.mjs",
    "blob": "f22c85176d365510093f22f699fb5bbd34ffcba0",
    "bytes": 22632
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/public/app.mjs",
    "blob": "3c10d5270136189a587d4b8b60149a75553f0ae1",
    "bytes": 10503
  },
  {
    "path": "stellar/scf-starforge-20261009/sf82-seller-pilot/release-console.mjs",
    "blob": "7c6f3d83bdcbabd435787356a6bad90c1f296574",
    "bytes": 23515
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs",
    "blob": "9ba69b5e83693a5bbad8aff6677673991f5fe70b",
    "bytes": 38822
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/applications.mjs",
    "blob": "f4088b6affa905349054b52e91305d39ae4abf89",
    "bytes": 27026
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/server.mjs",
    "blob": "2680e7bc1d54be90c941669a6296028e15d9bb01",
    "bytes": 24008
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/public/applications.mjs",
    "blob": "86e37ee0fd367641384bf1961745888e22824e82",
    "bytes": 38920
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/public/app.mjs",
    "blob": "3b21966948a8056fecabc5e5b24cbba768185e32",
    "bytes": 33226
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs",
    "blob": "8ee253de89866a761ed415412e654e6c79235ff1",
    "bytes": 7132
  }
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const now = () => new Date().toISOString();
const fail = (code, message, fields = {}) => Object.assign(new Error(message), { code, ...fields });
const errorView = error => ({ code: error.code ?? error.name ?? 'INSTALLATION_RECEIVING_ERROR',
  message: String(error.message ?? error).slice(0, 3000), ...(error.requestId ? { requestId: error.requestId } : {}) });
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const within = (parent, child) => { const path = relative(parent, child); return path === '' || !path.startsWith('..' + '/') && path !== '..' && !isAbsolute(path); };
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function realDirectory(path, privateOnly = false) {
  assert.equal(typeof path, 'string'); assert.equal(path, resolve(path), 'Use the selected absolute path');
  const info = await lstat(path);
  assert(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path, 'Use a real directory: ' + path);
  if (privateOnly) {
    assert.equal(info.mode & 0o077, 0, 'Keep the original private directory: ' + path);
    if (process.getuid) assert.equal(info.uid, process.getuid(), 'Keep the original directory owner');
  }
  return path;
}
async function privateDirectory(path, create = false) {
  if (create) { assert.equal(await realpath(dirname(path)), dirname(path)); await mkdir(path, { mode: 0o700 }); }
  return realDirectory(path, true);
}
async function bytesAt(path, maximum = 16 * 1024 * 1024) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    assert(before.isFile() && before.size <= BigInt(maximum), 'Read a bounded original file: ' + path);
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(before[key], after[key], 'Original file changed while reading');
    assert.equal(BigInt(bytes.length), after.size); return bytes;
  } finally { await handle.close(); }
}
async function readJSON(path, optional = false) {
  try {
    const bytes = await bytesAt(path);
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), sha256: sha(bytes), bytes };
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function atomicJSON(path, value) {
  const temporary = path + '.pending-' + randomUUID();
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(json(value)); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, path); await syncDirectory(dirname(path)); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function verifyFiles(root, expected) {
  const records = [];
  for (const item of expected) {
    const bytes = await bytesAt(join(root, item.path), 4 * 1024 * 1024);
    assert.equal(gitBlob(bytes), item.blob, 'Use the selected original source: ' + item.path);
    if (item.bytes !== undefined) assert.equal(bytes.length, item.bytes);
    records.push({ ...item, bytes: bytes.length, sha256: sha(bytes) });
  }
  return records;
}
function requireCompletions(managed, direct, managedSha, operation, managedOutput) {
  assert.equal(operation, OPERATION); assert.equal(managed.operation, operation); assert.equal(managed.state, 'PASS');
  for (const key of ['nativeComplete', 'browserComplete', 'mcpComplete', 'ownedProcessesClosed']) assert.equal(managed[key], true, 'Wait for the original managed completion: ' + key);
  assert.equal(direct.schema, 'scratch.single-release-delivery-receiving.v1');
  assert.equal(direct.operation, operation); assert.equal(direct.state, 'PASS');
  for (const key of ['browserComplete', 'localComplete', 'mcpComplete', 'ownedProcessesClosed']) assert.equal(direct[key], true, 'Wait for the original direct completion: ' + key);
  assert.equal(direct.managedReceiptSha256, managedSha); assert.equal(direct.managedDirectory, managedOutput);
  assert.equal(direct.releaseStore, managed.stores.blue);
  assert(/^[a-f0-9]{64}$/.test(direct.manifest?.fingerprint ?? ''));
}
function commandJSON(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    shell: false, env: { ...process.env, npm_config_update_notifier: 'false', PYTHONDONTWRITEBYTECODE: '1' } });
  if (result.error || result.status !== 0) throw fail('INSTALLATION_HOST_DEPENDENCY_UNAVAILABLE',
    'The selected host cannot run the original command: ' + command);
  return JSON.parse(result.stdout);
}

/**
 * Returns an actual selected READY installation for the existing Applications phase.
 * It runs only after the original managed and direct receiving receipts are complete.
 * sourceRoot is the exact bootstrap source; repository is the original private Git cache.
 * offlineSource controls original Git acquisition. npm always uses the existing offline cache.
 */
export async function runDeliveryInstallationPhase({
  sourceRoot, repository = null, managedOutput, directOutput, output, operation = OPERATION,
  sourcePin = PRODUCT, installedRoot = null, node = process.execPath, python,
  npmCache = null, nodeHeaders = null, offlineSource = true, signal,
  operationTimeoutMs = 30 * 60 * 1000, drainTimeoutMs = 120000,
} = {}) {
  assert.equal(sourcePin, PRODUCT); assert.equal(operation, OPERATION);
  assert.equal(typeof offlineSource, 'boolean');
  assert(Number.isSafeInteger(operationTimeoutMs) && operationTimeoutMs >= 1000);
  assert(Number.isSafeInteger(drainTimeoutMs) && drainTimeoutMs >= 1000);
  assert.equal(process.platform, 'linux', 'The original runtime uses Linux kernel leases');
  assert.equal(await realpath(node), await realpath(process.execPath), 'Use the selected Node executable');
  const major = Number(process.versions.node.split('.')[0]), minor = Number(process.versions.node.split('.')[1]);
  assert(major > 22 || major === 22 && minor >= 16, 'The original distribution requires Node 22.16 or later');
  assert.equal(typeof python, 'string'); python = await realpath(python);
  sourceRoot = await realDirectory(resolve(sourceRoot));
  managedOutput = await privateDirectory(resolve(managedOutput)); directOutput = await privateDirectory(resolve(directOutput));
  const managedRecord = await readJSON(join(managedOutput, 'receipt.json'));
  const directRecord = await readJSON(join(directOutput, 'receipt.json'));
  requireCompletions(managedRecord.value, directRecord.value, managedRecord.sha256, operation, managedOutput);
  output = resolve(output);
  assert(!within(sourceRoot, output) && !within(output, sourceRoot), 'Keep installation outputs separate from immutable bootstrap source');
  assert(![managedOutput, directOutput].includes(output));
  if (repository !== null) {
    repository = await realDirectory(resolve(repository));
    assert(!within(repository, output) && !within(output, repository), 'Keep the Git source and runtime output separate');
  }
  if (installedRoot !== null) {
    installedRoot = await privateDirectory(resolve(installedRoot));
    assert(!within(installedRoot, output) && !within(output, installedRoot), 'Keep a supplied installation separate from phase output');
  }
  if (installedRoot === null) {
    assert(repository, 'Supply the original private Git repository when no READY selected installation exists');
    assert.equal(typeof npmCache, 'string', 'Supply the populated original offline npm cache');
    npmCache = await realDirectory(resolve(npmCache)); await realDirectory(join(npmCache, '_cacache'));
    if (nodeHeaders !== null) {
      nodeHeaders = await realDirectory(resolve(nodeHeaders));
      await bytesAt(join(nodeHeaders, 'include', 'node', 'node.h'), 4 * 1024 * 1024);
    }
  }
  if (!await exists(output)) await privateDirectory(output, true); else await privateDirectory(output);
  const sourceFiles = await verifyFiles(sourceRoot, BOOTSTRAP);
  const moduleAt = path => import(pathToFileURL(join(sourceRoot, DIST, path)).href);
  const { operationLease, operationRunning } = await moduleAt('runtime-workspace/storage.mjs');
  const { inspectRuntimeInstall } = await moduleAt('runtime-install.mjs');
  const { resolveRuntimeProfile } = await moduleAt('runtime-profile.mjs');
  const lease = await operationLease(join(output, 'installation-phase.lock'));
  const receiptFile = join(output, 'receipt.json');
  let model = null, receipt, saving = Promise.resolve(), failed = null, selectedReceipt = false, activeAttempt = null;
  const selected = { schema: SCHEMA, operation, product: sourcePin, bootstrap: sourceRoot, repository,
    managedOutput, directOutput, managedReceiptSha256: managedRecord.sha256, directReceiptSha256: directRecord.sha256,
    suppliedInstallation: installedRoot, node: await realpath(node), python, npmCache, nodeHeaders, offlineSource };
  const interrupted = () => { if (signal?.aborted) throw signal.reason ?? fail('INSTALLATION_RECEIVING_INTERRUPTED', 'The original installation remains retained.'); };
  function save() {
    const snapshot = structuredClone(receipt), next = saving.then(() => atomicJSON(receiptFile, snapshot));
    saving = next; return next;
  }
  async function milestone(key, value = {}) {
    if (!receipt.milestones.some(item => item.key === key)) receipt.milestones.push({ key, at: now(), ...value });
    await save(); process.stdout.write(JSON.stringify({ phase: 'DELIVERY_INSTALLATION', milestone: key }) + '\n');
  }
  async function inspectReady(directory) {
    directory = await privateDirectory(directory);
    const actual = await inspectRuntimeInstall({ directory, load: true, source: true, python });
    assert.equal(actual.status, 'READY'); assert.equal(actual.ready, true); assert.equal(actual.sourceVerified, true);
    assert.equal(actual.sourceCommit, PRODUCT); assert.equal(actual.sourceRoot, join(directory, 'package', 'source'));
    const planRecord = await readJSON(join(directory, 'runtime-install.json')), plan = planRecord.value;
    const profileRecord = await readJSON(join(directory, 'runtime-profile.json')), profile = profileRecord.value;
    const manifestRecord = await readJSON(join(directory, 'package', 'manifest.json')), manifest = manifestRecord.value;
    assert.equal(manifest.sourceCommit, PRODUCT); assert.equal(manifest.sourceSelection?.id, 'merchant-delivery');
    assert.equal(manifest.sourceSelection?.gitBlob, '9bf767d075458bd9fa61d8ab3b4133dfdfcbcac7');
    assert.deepEqual(profile.selection, PROFILE);
    const selectedProfile = await resolveRuntimeProfile({ sourceRoot: actual.sourceRoot, ...PROFILE });
    assert.equal(selectedProfile.profileId, actual.profileId); assert.equal(profile.profileId, actual.profileId);
    assert.equal(plan.profileId, actual.profileId); assert.equal(plan.source.manifestSha256, manifestRecord.sha256);
    assert.equal(plan.sourceRoot, actual.sourceRoot);
    const productFiles = await verifyFiles(actual.sourceRoot, PRODUCT_FILES);
    const archiveBytes = await bytesAt(plan.archivePath, 64 * 1024 * 1024);
    assert.equal(sha(archiveBytes), plan.archiveSha256);
    const binding = { installedRoot: directory, sourceRoot: actual.sourceRoot, sourceCommit: actual.sourceCommit,
      installationId: actual.installationId, profileId: actual.profileId, lockSha256: actual.lockSha256,
      packageName: manifest.packageName, packageVersion: actual.packageVersion,
      sourceSelection: manifest.sourceSelection, sourceManifestSha256: manifestRecord.sha256,
      archivePath: plan.archivePath, archiveSha256: plan.archiveSha256, archiveBytes: archiveBytes.length,
      runtimeInstallSha256: planRecord.sha256, runtimeProfileSha256: profileRecord.sha256,
      profileSelection: profile.selection, dependencies: profile.dependencies, productFiles };
    return { binding, inspection: actual };
  }
  async function owners() {
    if (!receipt?.requests?.length || !await exists(receipt.runtimeWorkspace)) return [];
    const state = model ? await model.state() : null, result = [];
    for (const input of receipt.requests) {
      const directory = join(receipt.runtimeWorkspace, 'operations', input.requestId);
      if (!await exists(directory)) continue;
      const current = state?.operations.find(item => item.id === input.requestId);
      const retainedState = (await readJSON(join(directory, 'state.json'), true))?.value;
      const workerLock = join(directory, 'worker.lock');
      const worker = await exists(workerLock) ? await operationRunning(workerLock) : false;
      const nativeLocks = [];
      const original = (await readJSON(join(directory, 'request.json'), true))?.value;
      for (const [kind, path] of [
        ['build', original?.sourceBuildOutput && join(original.sourceBuildOutput, 'build.lock')],
        ['install', original?.runtimeDirectory && join(original.runtimeDirectory, 'install.lock')],
      ]) if (path && await exists(path) && await operationRunning(path)) nativeLocks.push({ kind, path });
      if (worker || current?.workerActive || current?.commandActive || nativeLocks.length || (current?.phase ?? retainedState?.phase) === 'QUEUED')
        result.push({ requestId: input.requestId, operation: input.operation, phase: current?.displayPhase ?? retainedState?.phase ?? 'UNKNOWN',
          workerActive: worker || current?.workerActive === true, nativeLocks });
    }
    return result;
  }
  async function drain() {
    const deadline = Date.now() + drainTimeoutMs; let pending;
    do {
      pending = await owners();
      receipt.pendingOwners = pending; receipt.ownedProcessesClosed = pending.length === 0; await save();
      if (!pending.length) return;
      if (Date.now() >= deadline) throw fail('ORIGINAL_INSTALLATION_OWNER_ACTIVE',
        'The retained native request still owns work; continue this same phase after it finishes.', { pendingOwners: pending });
      await delay(1000);
    } while (true);
  }
  try {
    receipt = (await readJSON(receiptFile, true))?.value ?? { ...selected, state: 'PREPARING', attempts: [],
      requests: [], preparations: [], installs: [], milestones: [], initializationRecoveries: [],
      runtimeWorkspace: join(output, 'runtime-workspace'), runtimeHome: join(output, 'runtime-home') };
    for (const [key, value] of Object.entries(selected)) assert.deepEqual(receipt[key], value, 'Resume the exact installation selection: ' + key);
    selectedReceipt = true; receipt.sourceFiles = sourceFiles;
    if (receipt.state === 'PASS' && receipt.ownedProcessesClosed) {
      const checked = await inspectReady(receipt.binding.installedRoot);
      assert.deepEqual(checked.binding, receipt.binding, 'The completed selected installation changed');
      return { installedRoot: checked.binding.installedRoot, sourceRoot: checked.binding.sourceRoot, receiptFile, receipt, binding: checked.binding };
    }
    activeAttempt = { id: randomUUID(), startedAt: now() }; receipt.attempts.push(activeAttempt);
    receipt.state = 'RUNNING'; receipt.ownedProcessesClosed = false;
    await save(); interrupted();
    if (installedRoot !== null) {
      const checked = await inspectReady(installedRoot);
      receipt.binding = checked.binding; receipt.inspection = checked.inspection; receipt.usedExistingInstallation = true;
      await milestone('existing-selected-installation-verified', { installedRoot, sourceCommit: PRODUCT, profileId: checked.binding.profileId });
    } else {
      assert(repository, 'Supply the original private Git repository when no READY selected installation exists');
      assert.equal(typeof npmCache, 'string', 'Supply the populated original offline npm cache');
      npmCache = await realDirectory(resolve(npmCache));
      assert.equal(npmCache, receipt.npmCache, 'Supply the cache using its resolved original absolute path');
      await realDirectory(join(npmCache, '_cacache'));
      if (nodeHeaders !== null) {
        nodeHeaders = await realDirectory(resolve(nodeHeaders)); assert.equal(nodeHeaders, receipt.nodeHeaders);
        await bytesAt(join(nodeHeaders, 'include', 'node', 'node.h'), 4 * 1024 * 1024);
      }
      // Workspace prepare/install use their existing python3/npm/Node command names.
      // Verify the inherited path instead of replacing the installer's environment.
      const observedPython = commandJSON('python3', ['-c', 'import json,os,sys; print(json.dumps({"executable":os.path.realpath(sys.executable),"version":list(sys.version_info[:3])}))']);
      assert.equal(observedPython.executable, python, 'Put the selected Python on PATH before running this phase');
      assert(observedPython.version[0] > 3 || observedPython.version[0] === 3 && observedPython.version[1] >= 11);
      const observedNode = commandJSON('node', ['-p', 'JSON.stringify({executable:require("node:fs").realpathSync(process.execPath),version:process.versions.node,modules:process.versions.modules})']);
      assert.equal(observedNode.executable, selected.node, 'Put the selected Node on PATH for the original npm process');
      receipt.host = { node: observedNode, python: observedPython, npmCache, nodeHeaders, npmOffline: true, sourceOffline: offlineSource };
      await save();
      const { createRuntimeWorkspace, openRuntimeWorkspace } = await moduleAt('runtime-workspace/model.mjs');
  async function inspectIncompleteControl(path) {
    await privateDirectory(path);
    const directories = new Set(['archives', 'entries', 'operations', 'observations', 'sources', 'incoming']);
    const identity = info => ({ device: String(info.dev), inode: String(info.ino), mode: String(info.mode),
      uid: String(info.uid), gid: String(info.gid) });
    const rootInfo = await lstat(path, { bigint: true }), entries = [];
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name), info = await lstat(file, { bigint: true });
      assert(!info.isSymbolicLink() && !(info.mode & 0o077n), 'Retain only the original private initialization');
      assert.equal(info.uid, rootInfo.uid, 'Original initialization owner must match');
      if (directories.has(name)) {
        assert(info.isDirectory(), 'The original initialization child must be a directory');
        assert.deepEqual(await readdir(file), [], 'Initialized control state must reopen through the original model');
        entries.push({ name, kind: 'directory', ...identity(info) });
      } else {
        assert(/^workspace\.json\.pending-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(name),
          'Preserve an unexpected original control entry for inspection: ' + name);
        assert(info.isFile() && info.nlink === 1n && info.size <= 4n * 1024n * 1024n,
          'The original initialization temporary must be a bounded private file');
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const before = await handle.stat({ bigint: true }), bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
          for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(before[key], after[key]);
          assert.equal(BigInt(bytes.length), after.size);
          entries.push({ name, kind: 'file', ...identity(after), bytes: bytes.length, sha256: sha(bytes) });
        } finally { await handle.close(); }
      }
    }
    return { root: identity(rootInfo), entries };
  }
  async function syncControlParent() {
    const handle = await open(output, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  async function initializeControl() {
    const path = receipt.runtimeWorkspace;
    assert.equal(path, join(output, 'runtime-workspace'));
    assert.equal(receipt.runtimeHome, join(output, 'runtime-home'));
    const finalRecord = join(path, 'workspace.json');
    // A completed native record always remains at its original path for normal reopen.
    if (await exists(finalRecord)) return;
    assert(!receipt.workspaceId && !receipt.runtimeId && receipt.requests.length === 0,
      'Initialized installation state must reopen through its original identity');
    receipt.initializationRecoveries ??= [];
    let reserved = receipt.initializationRecoveries.find(row => row.phase === 'RESERVED');
    if (reserved) {
      assert.equal(reserved.directory, path);
      assert.equal(reserved.retainedDirectory, join(output, 'runtime-workspace-incomplete-' + reserved.id));
      if (await exists(reserved.retainedDirectory)) {
        assert.deepEqual(await inspectIncompleteControl(reserved.retainedDirectory), reserved.inventory,
          'Retained interrupted initialization must preserve its exact files and directory identities');
        assert(!await exists(path), 'Reconcile both initialization paths before recreating the original control workspace');
      } else {
        assert.deepEqual(await inspectIncompleteControl(path), reserved.inventory,
          'The original incomplete initialization changed after its retained inspection');
        await rename(path, reserved.retainedDirectory);
        await syncControlParent();
      }
      reserved.phase = 'RETAINED'; reserved.retainedAt = new Date().toISOString(); await save();
    }
    if (await exists(path)) {
      const inventory = await inspectIncompleteControl(path), id = randomUUID();
      reserved = { id, directory: path, retainedDirectory: join(output, 'runtime-workspace-incomplete-' + id),
        inventory, phase: 'RESERVED', inspectedAt: new Date().toISOString() };
      receipt.initializationRecoveries.push(reserved); await save();
      assert.deepEqual(await inspectIncompleteControl(path), inventory, 'Keep the inspected original initialization');
      assert(!await exists(reserved.retainedDirectory));
      await rename(path, reserved.retainedDirectory); await syncControlParent();
      reserved.phase = 'RETAINED'; reserved.retainedAt = new Date().toISOString(); await save();
    }
    receipt.initializationRequest ??= { directory: path, runtimeHome: receipt.runtimeHome };
    assert.deepEqual(receipt.initializationRequest, { directory: path, runtimeHome: receipt.runtimeHome });
    if (await exists(receipt.runtimeHome)) {
      await privateDirectory(receipt.runtimeHome);
      assert.deepEqual(await readdir(receipt.runtimeHome), [], 'Keep any unexpected initialized runtime home for its original recovery');
    }
    await save();
    await createRuntimeWorkspace(receipt.initializationRequest);
  }

      await initializeControl();
      model = await openRuntimeWorkspace({ directory: receipt.runtimeWorkspace });
      const workspace = await model.state();
      if (receipt.workspaceId) assert.equal(workspace.workspaceId, receipt.workspaceId);
      else { receipt.workspaceId = workspace.workspaceId; await save(); }
      async function remember(input) {
        const previous = receipt.requests.find(value => value.requestId === input.requestId);
        if (previous) assert.deepEqual(previous, input, 'Keep the exact original native request');
        else { receipt.requests.push(structuredClone(input)); await save(); }
        return input;
      }
      async function job(input) {
        const value = (await model.state()).operations.find(item => item.id === input.requestId);
        const saved = await readJSON(join(receipt.runtimeWorkspace, 'operations', input.requestId, 'request.json'), true);
        if (saved) {
          const { requestHash, createdAt, ...definition } = saved.value;
          assert.equal(sha(json(canonical(definition))), requestHash, 'The original native request changed');
          assert.equal(saved.value.clientRequestHash, sha(json(canonical(input))), 'The native request belongs to another exact input');
        }
        return value;
      }
      async function released(input) {
        const deadline = Date.now() + 5000;
        while ((await owners()).some(value => value.requestId === input.requestId)) {
          const current = await job(input);
          if (current?.phase === 'QUEUED') throw fail('ORIGINAL_QUEUED_REQUEST',
            'Resume the original queued request; do not replace it.', { requestId: input.requestId });
          if (Date.now() >= deadline) throw fail('ORIGINAL_INSTALLATION_OWNER_ACTIVE',
            'Wait for the original kernel lease before continuing this request.', { requestId: input.requestId });
          await delay(100);
        }
      }
      async function waitJob(input) {
        const deadline = Date.now() + operationTimeoutMs; let signature = '';
        while (Date.now() < deadline) {
          interrupted();
          const current = await job(input);
          assert(current, 'The original selected native operation disappeared');
          const next = JSON.stringify([current.phase, current.displayPhase, current.sourceBuildStage, current.updatedAt]);
          if (signature !== next) {
            signature = next;
            receipt.progress = { requestId: input.requestId, operation: input.operation, phase: current.phase,
              displayPhase: current.displayPhase, stage: current.sourceBuildStage ?? null, observedAt: now() };
            await save(); process.stdout.write(JSON.stringify({ phase: 'DELIVERY_INSTALLATION', ...receipt.progress }) + '\n');
          }
          if (current.phase === 'SUCCEEDED') { await released(input); return current; }
          if (current.phase === 'FAILED' || current.displayPhase === 'INTERRUPTED')
            throw fail('ORIGINAL_INSTALLATION_REQUIRES_CONTINUATION',
              'The original native request needs its retained recovery: ' + JSON.stringify(current.error ?? { phase: current.displayPhase }),
              { requestId: input.requestId });
          if (current.phase === 'QUEUED' && !await exists(join(receipt.runtimeWorkspace, 'operations', input.requestId, 'state.json')))
            throw fail('ORIGINAL_REQUEST_PUBLICATION_INCOMPLETE',
              'Keep the original request and incomplete publication; do not fabricate its native state.', { requestId: input.requestId });
          await delay(1000);
        }
        throw fail('ORIGINAL_INSTALLATION_STILL_RUNNING', 'The original operation remains selected after the receiving wait.',
          { requestId: input.requestId });
      }
      async function beginOrResume(input) {
        const current = await job(input);
        if (!current) return model.begin(input);
        if (current.phase === 'SUCCEEDED' || current.workerActive || current.commandActive) return current;
        const pending = (await owners()).find(item => item.requestId === input.requestId);
        if (pending?.workerActive || pending?.nativeLocks.length) return current;
        if (current.phase === 'QUEUED') {
          assert(await exists(join(receipt.runtimeWorkspace, 'operations', input.requestId, 'state.json')),
            'The original request publication is incomplete; preserve it for source-owned recovery');
          return model.resumeQueued(input.requestId);
        }
        throw fail('ORIGINAL_INSTALLATION_REQUIRES_CONTINUATION', 'Use the retained original preparation or install recovery.',
          { requestId: input.requestId });
      }
      if (!receipt.sourceReview) {
        const review = await model.sourceBuildsReview({ repository, ref: PRODUCT, selection: 'merchant-delivery',
          offline: offlineSource, python });
        assert.equal(review.sourceCommit, PRODUCT); assert.equal(review.selection, 'merchant-delivery');
        for (const provider of ['merchant-console', 'merchant-delivery', 'delivery-receiving'])
          assert(review.applications.includes(provider), 'The selected product must include ' + provider);
        receipt.sourceReview = review;
        receipt.sourceRequest = { requestId: review.requestId, operation: 'source-build', reviewId: review.reviewId,
          selectionSha256: review.selectionSha256 };
        await remember(receipt.sourceRequest);
        await milestone('original-product-source-reviewed', { reviewId: review.reviewId, requestId: review.requestId,
          sourceCommit: PRODUCT, selectionSha256: review.selectionSha256, commands: Object.keys(review.commands).length,
          exports: Object.keys(review.exports).length, sourceOffline: offlineSource });
      } else {
        const review = await model.sourceBuildsReadReview(receipt.sourceReview.reviewId);
        assert.deepEqual(review, receipt.sourceReview, 'Continue the original saved product review');
        await remember(receipt.sourceRequest);
      }
      const sourceInput = receipt.sourceRequest;
      let originalBuild = await job(sourceInput);
      if (!originalBuild || originalBuild.displayPhase === 'INITIALIZING' ||
          !await exists(join(receipt.runtimeWorkspace, 'operations', sourceInput.requestId, 'state.json'))) {
        await model.begin(sourceInput);
      } else if (originalBuild.phase !== 'SUCCEEDED' && !originalBuild.workerActive && !originalBuild.commandActive) {
        const pending = (await owners()).find(item => item.requestId === sourceInput.requestId);
        if (!pending?.workerActive && !pending?.nativeLocks.length) await model.recoverSourceBuildOperation(sourceInput.requestId);
      }
      originalBuild = await waitJob(sourceInput);
      assert.equal(originalBuild.result.status, 'SOURCE_READY');
      assert.equal(originalBuild.result.build.sourceCommit, PRODUCT);
      assert.equal(originalBuild.result.build.sourceSelection.id, 'merchant-delivery');
      receipt.build = originalBuild.result.build; receipt.archiveId = originalBuild.result.archive.id;
      assert.equal(originalBuild.result.archive.sha256, receipt.build.sha256);
      await save();
      const download = await model.sourceBuildsDownload(receipt.sourceReview.reviewId);
      try {
        assert.equal(download.sha256, receipt.build.sha256); assert.equal(download.bytes, receipt.build.archiveBytes);
      } finally { await download.handle.close(); }
      await milestone('original-product-built', { requestId: sourceInput.requestId, archiveId: receipt.archiveId,
        archive: receipt.build.archive, archiveSha256: receipt.build.sha256, archiveBytes: receipt.build.archiveBytes });
      const profile = await model.review({ archiveId: receipt.archiveId, selection: PROFILE });
      assert.deepEqual(profile.selection, PROFILE); assert.equal(profile.source.sourceCommit, PRODUCT);
      if (receipt.profile) assert.deepEqual(profile, receipt.profile, 'Keep the original reviewed profile');
      else { receipt.profile = profile; await save(); }
      await milestone('native-profile-reviewed', { profileId: profile.profileId, host: profile.host,
        selection: profile.selection, dependencies: profile.dependencies });
      async function newPreparation(previous = null) {
        let input;
        const name = 'merchant-delivery-' + (receipt.preparations.length + 1);
        if (previous) {
          await released(previous);
          const current = await job(previous);
          const saved = (await readJSON(join(receipt.runtimeWorkspace, 'operations', previous.requestId, 'request.json'), true))?.value;
          const directory = saved?.targetDirectory ?? null, runtimeId = saved?.targetId ?? null;
          const entry = runtimeId ? (await readJSON(join(receipt.runtimeWorkspace, 'entries', runtimeId + '.json'), true))?.value : null;
          const preparation = directory ? (await readJSON(join(directory, 'preparation.json'), true))?.value : null;
          const plan = directory ? (await readJSON(join(directory, 'runtime-install.json'), true))?.value : null;
          if (preparation) {
            assert.equal(preparation.directory, directory); assert.equal(preparation.archiveSha256, receipt.build.sha256);
            assert.deepEqual(preparation.selection, PROFILE);
          }
          if (plan) {
            assert.equal(plan.directory, directory); assert.equal(plan.archiveSha256, receipt.build.sha256);
            assert.equal(plan.profileId, profile.profileId);
          }
          const recoverable = Boolean(directory && await exists(directory) && entry?.directory === directory && (preparation || plan));
          input = recoverable
            ? { requestId: randomUUID(), operation: 'recover', runtimeId, name, install: false, offline: true,
                cache: npmCache, ...(nodeHeaders ? { nodeHeaders } : {}) }
            : { requestId: randomUUID(), operation: 'prepare', archiveId: receipt.archiveId, name,
                selection: PROFILE, profileId: profile.profileId };
          receipt.recoveries ??= [];
          receipt.recoveries.push({ at: now(), kind: 'PREPARATION', originalRequestId: previous.requestId,
            originalPhase: current?.displayPhase ?? 'INITIALIZING', originalDirectory: directory, originalRuntimeId: runtimeId,
            requestId: input.requestId, method: input.operation, result: current?.error ?? current?.result ?? null });
        } else input = { requestId: randomUUID(), operation: 'prepare', archiveId: receipt.archiveId, name,
          selection: PROFILE, profileId: profile.profileId };
        receipt.preparations.push(input); await remember(input); return input;
      }
      let preparation = receipt.preparations.at(-1);
      if (!preparation) preparation = await newPreparation();
      else {
        const current = await job(preparation);
        if (current && (current.phase === 'FAILED' || current.displayPhase === 'INTERRUPTED' || current.displayPhase === 'INITIALIZING'))
          preparation = await newPreparation(preparation);
      }
      await beginOrResume(preparation);
      const prepared = await waitJob(preparation);
      assert.equal(prepared.result.status, 'PREPARED'); assert.equal(prepared.result.profileId, profile.profileId);
      receipt.runtimeId = prepared.targetId;
      receipt.installedRoot = prepared.targetDirectory;
      assert.equal(prepared.result.directory, receipt.installedRoot);
      await milestone('original-runtime-prepared', { requestId: preparation.requestId, runtimeId: receipt.runtimeId,
        directory: receipt.installedRoot, profileId: profile.profileId });
      let install = receipt.installs.at(-1);
      if (!install) {
        install = { requestId: randomUUID(), operation: 'install', runtimeId: receipt.runtimeId, offline: true, cache: npmCache,
          ...(nodeHeaders ? { nodeHeaders } : {}) };
        receipt.installs.push(install); await remember(install);
      } else {
        assert.equal(install.runtimeId, receipt.runtimeId);
        const current = await job(install);
        if (current && (current.phase === 'FAILED' || current.displayPhase === 'INTERRUPTED' || current.displayPhase === 'INITIALIZING')) {
          await released(install);
          const state = await model.state({ runtimeId: receipt.runtimeId });
          assert.equal(state.selected.directory, receipt.installedRoot); assert.equal(state.selected.profileId, profile.profileId);
          assert.equal(state.selected.archiveSha256, receipt.build.sha256);
          const previous = install;
          install = { ...previous, requestId: randomUUID() };
          receipt.installs.push(install); receipt.recoveries ??= [];
          receipt.recoveries.push({ at: now(), kind: 'INSTALL', originalRequestId: previous.requestId, requestId: install.requestId,
            originalPhase: current.displayPhase, runtimeId: receipt.runtimeId, directory: receipt.installedRoot,
            installationState: state.selected.state, originalResult: current.error ?? current.result ?? null,
            originalWorkerReleased: true });
          await remember(install);
        }
      }
      await beginOrResume(install);
      const installed = await waitJob(install); assert.equal(installed.result.status, 'READY');
      await milestone('original-runtime-installed', { requestId: install.requestId, runtimeId: receipt.runtimeId, directory: receipt.installedRoot });
      const checked = await inspectReady(receipt.installedRoot);
      assert.equal(checked.binding.profileId, profile.profileId); assert.equal(checked.binding.archiveSha256, receipt.build.sha256);
      const handoff = await model.handoff(receipt.runtimeId);
      assert.equal(handoff.directory, checked.binding.installedRoot); assert.equal(handoff.sourceCommit, PRODUCT);
      assert.equal(handoff.profileId, checked.binding.profileId); assert.equal(handoff.lockSha256, checked.binding.lockSha256);
      receipt.binding = checked.binding; receipt.inspection = checked.inspection; receipt.handoff = handoff;
      await milestone('selected-installation-ready', { installedRoot: checked.binding.installedRoot,
        installationId: checked.binding.installationId, profileId: checked.binding.profileId,
        sourceManifestSha256: checked.binding.sourceManifestSha256, lockSha256: checked.binding.lockSha256 });
    }
    await drain();
    receipt.state = 'PASS'; receipt.completedAt = now();
    if (receipt.error || receipt.cleanupError) {
      receipt.recoveredFailures ??= [];
      receipt.recoveredFailures.push({ ...(receipt.error ? { error: receipt.error } : {}),
        ...(receipt.cleanupError ? { cleanupError: receipt.cleanupError } : {}), resolvedAt: receipt.completedAt });
      delete receipt.error; delete receipt.cleanupError;
    }
    await save();
  } catch (error) {
    failed = error;
    if (selectedReceipt) { receipt.state = 'INCOMPLETE'; receipt.error = errorView(error); await save().catch(() => {}); }
  } finally {
    if (selectedReceipt) {
      try { await drain(); }
      catch (error) {
        receipt.state = 'INCOMPLETE'; receipt.ownedProcessesClosed = false;
        receipt.cleanupError = errorView(error); failed ??= error; await save().catch(() => {});
      }
      if (activeAttempt) {
        activeAttempt.completedAt = now(); activeAttempt.state = receipt.state;
        activeAttempt.ownedProcessesClosed = receipt.ownedProcessesClosed;
        if (failed) activeAttempt.error = errorView(failed);
      }
      await save().catch(error => { failed ??= error; });
    }
    try { await model?.close(); } finally { await lease.close(); }
  }
  if (failed) throw failed;
  return { installedRoot: receipt.binding.installedRoot, sourceRoot: receipt.binding.sourceRoot, receiptFile, receipt, binding: receipt.binding };
}

async function main(args) {
  assert.equal(args.length, 2, 'Use --context FILE'); assert.equal(args[0], '--context');
  const context = (await readJSON(resolve(args[1]))).value;
  const controller = new AbortController();
  const stop = () => controller.abort(fail('INSTALLATION_RECEIVING_INTERRUPTED', 'Stop requested; the original native owner remains retained until closure.'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await runDeliveryInstallationPhase({ ...context, signal: controller.signal });
    process.stdout.write(JSON.stringify({ phase: 'DELIVERY_INSTALLATION', state: result.receipt.state,
      ownedProcessesClosed: result.receipt.ownedProcessesClosed, installedRoot: result.installedRoot,
      sourceRoot: result.sourceRoot, receiptFile: result.receiptFile, binding: result.binding }) + '\n');
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(JSON.stringify(errorView(error)) + '\n'); process.exitCode = 1;
  });
