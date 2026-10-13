// MIT. Adopt an already-received native Bloccpay installation into Applications.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  need, hash, canonical, jsonBytes, directory, confined, fileDescriptor,
  verifyFile, writeExact, lease, syncDirectory,
} from './source/lib/files.mjs';
import { inspectBloccpayDelivery } from './source/lib/receiving.mjs';
import { verifyBloccpayRuntime } from './source/lib/runtime.mjs';
import { inspectManagedSource } from './host-connection.mjs';

export const RECEIVED_APPLICATION_SCHEMA = 'stellar-forge.bloccpay-received-application.v1';
const SHA = /^[a-f0-9]{64}$/;
const MAX_CONFIGURATION_BYTES = 4 * 1024 * 1024;
const check = signal => signal?.throwIfAborted();
const absolute = value => typeof value === 'string' && path.isAbsolute(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => canonical(a) === canonical(b);

async function captureJSON(filename, maximumBytes = 16 * 1024 * 1024) {
  need(absolute(filename), 'ABSOLUTE_FILE_REQUIRED');
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let failure = null, result;
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(maximumBytes), 'JSON_FILE_REQUIRED');
    const body = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(filename, { bigint: true });
    need(before.dev === after.dev && before.ino === after.ino &&
      before.size === after.size && before.mtimeNs === after.mtimeNs &&
      before.ctimeNs === after.ctimeNs && current.dev === before.dev &&
      current.ino === before.ino && !current.isSymbolicLink() &&
      body.length === Number(before.size), 'SOURCE_CHANGED');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { need(false, 'INVALID_JSON_UTF8'); }
    result = { value: JSON.parse(text), body, descriptor: {
      path: path.resolve(filename), bytes: body.length, sha256: hash(body),
      mode: Number(before.mode & 0o777n),
    } };
  } catch (error) { failure = error; }
  finally {
    try { await handle.close(); } catch (error) {
      failure ??= error;
      failure.close = () => handle.close();
      failure.receivedApplicationOwner = { close: failure.close, file: filename };
    }
  }
  if (failure) throw failure;
  return result;
}

async function realDirectory(value) {
  need(absolute(value), 'ABSOLUTE_DIRECTORY_REQUIRED');
  const root = await fs.realpath(value);
  const stat = await fs.lstat(root);
  need(stat.isDirectory() && !stat.isSymbolicLink(), 'DIRECTORY_REQUIRED');
  return root;
}

function bindRecordedPaths(receipt) {
  need(object(receipt) && receipt.kind === 'workspace' &&
    absolute(receipt.directory) && typeof receipt.requestId === 'string' &&
    receipt.requestId && typeof receipt.exportId === 'string' && receipt.exportId &&
    SHA.test(receipt.manifestSha256), 'NATIVE_RECEIVING_RESULT_REQUIRED');
  need(object(receipt.workspace) && object(receipt.application) && object(receipt.runtime),
    'INCOMPLETE_NATIVE_RECEIVING_RESULT');
  const root = path.resolve(receipt.directory);
  const expected = [
    [receipt.originalPackageDirectory, path.join(root, 'original-package')],
    [receipt.workspace.directory, path.join(root, 'workspace')],
    [receipt.application.directory, path.join(root, 'application/source')],
    [receipt.application.cli, path.join(root, 'application/source/cli.mjs')],
    [receipt.application.server, path.join(root, 'application/source/server.mjs')],
    [receipt.application.worker, path.join(root, 'application/source/worker.mjs')],
    [receipt.runtime.directory, path.join(root, 'runtime/installed')],
    [receipt.runtime.nodeExecutable, path.join(root, 'runtime/installed/bin/node')],
  ];
  for (const [recorded, required] of expected)
    need(absolute(recorded) && path.resolve(recorded) === required, 'NATIVE_RECEIVING_PATH_MISMATCH');
  need(SHA.test(receipt.application.sourceManifestSha256) &&
    SHA.test(receipt.runtime.manifestSha256) &&
    typeof receipt.workspace.id === 'string' && receipt.workspace.id,
    'NATIVE_RECEIVING_IDENTITIES_REQUIRED');
  return root;
}

async function inspectLiveWorkspace(root, receipt, manifest, signal) {
  check(signal);
  const filename = await confined(root, 'workspace/workspace.sqlite');
  const before = await fs.lstat(filename, { bigint: true });
  need(before.isFile() && !before.isSymbolicLink(), 'ORIGINAL_RECEIVED_DATABASE_REQUIRED');
  let db = null, failure = null, result;
  const close = () => {
    if (!db) return;
    db.close();
    db = null;
  };
  try {
    // Read the existing authority without creating tables, changing its identity,
    // migrating it, preparing another receiving, or opening a provider connection.
    db = new DatabaseSync(filename, { readOnly: true, timeout: 10000 });
    db.exec('BEGIN');
    const meta = key => {
      const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
      need(row, 'WORKSPACE_METADATA_REQUIRED', { key });
      return JSON.parse(row.value);
    };
    const identity = meta('identity');
    const receivedFrom = meta('receivedFrom');
    const revision = meta('revision'), head = meta('head');
    const expectedOrigin = {
      exportId: receipt.exportId, manifestSha256: receipt.manifestSha256,
      workspaceId: manifest.workspaceId, revision: manifest.sourceRevision,
      head: manifest.sourceHead,
    };
    need(identity.schema === 'bloccpay.operations-workspace.v1' &&
      identity.id === receipt.workspace.id && identity.id !== manifest.workspaceId,
      'RECEIVED_WORKSPACE_IDENTITY_MISMATCH');
    need(same(receivedFrom, expectedOrigin) &&
      same(receipt.workspace.receivedFrom, expectedOrigin), 'RECEIVED_WORKSPACE_ORIGIN_MISMATCH');
    need(Number.isSafeInteger(revision) && revision >= receipt.workspace.revision &&
      (head === null || SHA.test(head)), 'RECEIVED_WORKSPACE_HISTORY_MISMATCH');
    const dispatchEnabled = meta('dispatchEnabled');
    need(typeof dispatchEnabled === 'boolean', 'WORKSPACE_DISPATCH_STATE_REQUIRED');
    result = { id: identity.id, revision, head, name: meta('profile').name,
      createdAt: identity.createdAt, dispatchEnabled, receivedFrom,
      directory: path.join(root, 'workspace') };
    db.exec('COMMIT');
    check(signal);
    const after = await fs.lstat(filename, { bigint: true });
    need(after.isFile() && !after.isSymbolicLink() &&
      before.dev === after.dev && before.ino === after.ino, 'RECEIVED_DATABASE_REPLACED');
  } catch (error) { failure = error; }
  finally {
    if (db) {
      try { close(); } catch (error) {
        failure ??= error;
        failure.close = close;
        failure.receivedApplicationOwner = { close, file: filename, readOnly: true };
      }
    }
  }
  if (failure) throw failure;
  return result;
}

/** Inspect the original receiver's complete output. This starts no host or provider. */
export async function inspectReceivedBloccpayWorkspace({
  receivedDirectory, expectedManifestSha256, expectedWorkspaceId, signal,
} = {}) {
  check(signal);
  const root = await realDirectory(receivedDirectory);
  const saved = await captureJSON(await confined(root, 'receiving.json'));
  const receipt = saved.value;
  const recordedRoot = bindRecordedPaths(receipt);
  if (expectedManifestSha256 !== undefined)
    need(SHA.test(expectedManifestSha256) && expectedManifestSha256 === receipt.manifestSha256,
      'DELIVERY_MANIFEST_MISMATCH');
  if (expectedWorkspaceId !== undefined)
    need(expectedWorkspaceId === receipt.workspace.id, 'RECEIVED_WORKSPACE_IDENTITY_MISMATCH');
  const retained = await inspectBloccpayDelivery({
    sourceDirectory: path.join(root, 'original-package'),
    expectedManifestSha256: receipt.manifestSha256,
  });
  check(signal);
  const manifest = retained.manifest;
  need(manifest.kind === 'workspace' && manifest.id === receipt.exportId &&
    manifest.application.manifestSha256 === receipt.application.sourceManifestSha256 &&
    manifest.runtime.manifestSha256 === receipt.runtime.manifestSha256 &&
    manifest.runtime.id === receipt.runtime.id, 'NATIVE_RECEIVING_SELECTION_MISMATCH');
  const applicationDirectory = path.join(root, 'application/source');
  const source = await captureJSON(await confined(root, 'application/source/source-files.json'));
  need(source.descriptor.sha256 === receipt.application.sourceManifestSha256 &&
    source.value.schema === 'bloccpay.application-source.v1' &&
    Array.isArray(source.value.files), 'APPLICATION_SOURCE_MANIFEST_REQUIRED');
  // Compare the complete executable edition to the receiver's retained package.
  for (const member of manifest.files.filter(item => item.path.startsWith('application/source/'))) {
    check(signal);
    await verifyFile(root, member, { mode: true });
  }
  const native = await verifyBloccpayRuntime({
    directory: path.join(root, 'runtime/installed'),
    expectedManifestSha256: receipt.runtime.manifestSha256,
  });
  need(native.id === receipt.runtime.id, 'RUNTIME_ID_MISMATCH');
  const workspace = await inspectLiveWorkspace(root, receipt, manifest, signal);
  const currentReceipt = await fileDescriptor(saved.descriptor.path);
  need(currentReceipt.bytes === saved.descriptor.bytes &&
    currentReceipt.sha256 === saved.descriptor.sha256 &&
    currentReceipt.mode === saved.descriptor.mode, 'NATIVE_RECEIVING_RESULT_CHANGED');
  const application = {
    directory: applicationDirectory, sourceManifestSha256: source.descriptor.sha256,
    cli: path.join(applicationDirectory, 'cli.mjs'),
    server: path.join(applicationDirectory, 'server.mjs'),
    worker: path.join(applicationDirectory, 'worker.mjs'),
  };
  const runtime = { directory: native.directory, nodeExecutable: native.nodeExecutable,
    id: native.id, manifestSha256: native.manifestSha256,
    version: native.version, platform: native.platform };
  const selection = {
    schema: RECEIVED_APPLICATION_SCHEMA + '.selection',
    receiving: saved.descriptor,
    original: { exportId: manifest.id, workspaceId: manifest.workspaceId,
      revision: manifest.sourceRevision, head: manifest.sourceHead,
      manifestSha256: receipt.manifestSha256 },
    received: { requestId: receipt.requestId, workspaceId: receipt.workspace.id,
      receivedAt: receipt.receivedAt, recordedDirectory: recordedRoot, directory: root },
    application, runtime,
  };
  let managedSource;
  try {
    await inspectManagedSource(application.directory, application.sourceManifestSha256);
    managedSource = { status: 'COMPATIBLE', sourceManifestSha256: application.sourceManifestSha256 };
  } catch (error) {
    if (error.code !== 'BLOCCPAY_SOURCE_INCOMPATIBLE') throw error;
    managedSource = { status: 'EXPLICIT_SOURCE_ADOPTION_REQUIRED',
      code: error.code, sourceManifestSha256: application.sourceManifestSha256 };
  }
  return {
    schema: RECEIVED_APPLICATION_SCHEMA + '.inspection', managedSource,
    selection, selectionSha256: hash(Buffer.from(canonical(selection))),
    workspace, originalPackage: { directory: retained.directory,
      manifestSha256: retained.manifestSha256, files: retained.fileCount, bytes: retained.bytes },
    relocated: recordedRoot !== root,
    settings: { workspaceDirectory: workspace.directory, expectedWorkspaceId: workspace.id,
      runtimeDirectory: runtime.directory, runtimeSha256: runtime.manifestSha256,
      sourceDirectory: application.directory, sourceManifestSha256: application.sourceManifestSha256 },
  };
}

async function privateOutputDirectory(value, receivedRoot) {
  need(absolute(value), 'ABSOLUTE_PREPARATION_DIRECTORY_REQUIRED');
  const outsideMembers = target => {
    for (const forbidden of ['workspace', 'application', 'runtime', 'original-package']) {
      const relative = path.relative(path.join(receivedRoot, forbidden), target);
      need(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
        'PREPARATION_MUST_NOT_CHANGE_RECEIVED_MEMBERS');
    }
  };
  // Resolve existing ancestry before creating any directory, including aliases.
  let parent = path.resolve(value);
  const tail = [];
  for (;;) {
    try { parent = await fs.realpath(parent); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const next = path.dirname(parent);
      need(next !== parent, 'PREPARATION_PARENT_REQUIRED');
      tail.unshift(path.basename(parent)); parent = next;
    }
  }
  const selected = path.join(parent, ...tail);
  outsideMembers(selected);
  await directory(selected);
  const target = await realDirectory(selected);
  outsideMembers(target);
  const stat = await fs.stat(target);
  need((stat.mode & 0o077) === 0, 'PRIVATE_PREPARATION_DIRECTORY_REQUIRED');
  return target;
}

/**
 * Freeze the existing native identities and a complete private configuration
 * for Applications. This does not call receive, start a host, or change SQLite.
 */
export async function prepareReceivedBloccpayApplication({
  receivedDirectory, configurationFile, destination, expectedSelectionSha256,
  expectedManifestSha256, expectedWorkspaceId, sourceDirectory, sourceManifestSha256, signal,
} = {}) {
  const inspected = await inspectReceivedBloccpayWorkspace({
    receivedDirectory, expectedManifestSha256, expectedWorkspaceId, signal,
  });
  if (expectedSelectionSha256 !== undefined)
    need(SHA.test(expectedSelectionSha256) &&
      expectedSelectionSha256 === inspected.selectionSha256, 'RECEIVED_APPLICATION_SELECTION_CHANGED');
  const explicitSource = sourceDirectory !== undefined || sourceManifestSha256 !== undefined;
  need(!explicitSource || absolute(sourceDirectory) && SHA.test(sourceManifestSha256),
    'EXPLICIT_SOURCE_DIRECTORY_AND_MANIFEST_REQUIRED');
  const selectedSource = await inspectManagedSource(
    explicitSource ? sourceDirectory : inspected.selection.application.directory,
    explicitSource ? sourceManifestSha256 : inspected.selection.application.sourceManifestSha256);
  const application = {
    directory: selectedSource.directory, sourceManifestSha256: selectedSource.sha256,
    cli: path.join(selectedSource.directory, 'cli.mjs'),
    server: path.join(selectedSource.directory, 'server.mjs'),
    worker: path.join(selectedSource.directory, 'worker.mjs'),
  };
  const sourceAdoption = {
    schema: RECEIVED_APPLICATION_SCHEMA + '.source-adoption',
    mode: explicitSource ? 'EXPLICIT' : 'ORIGINAL',
    original: inspected.selection.application, selected: application,
  };
  const configuration = await captureJSON(configurationFile, MAX_CONFIGURATION_BYTES);
  need(object(configuration.value), 'PRIVATE_CONFIGURATION_OBJECT_REQUIRED');
  need((configuration.descriptor.mode & 0o077) === 0, 'PRIVATE_CONFIGURATION_PERMISSIONS_REQUIRED');
  for (const key of ['collections', 'webhookProjection'])
    need(configuration.value[key] === undefined || object(configuration.value[key]),
      'CONFIGURATION_OBJECT_REQUIRED', { key });
  const effective = {
    ...configuration.value,
    collections: { ...configuration.value.collections, enabled: false },
    webhookProjection: { ...configuration.value.webhookProjection, enabled: false },
  };
  const output = await privateOutputDirectory(destination, inspected.selection.received.directory);
  const effectiveBody = jsonBytes(effective);
  need(effectiveBody.length <= MAX_CONFIGURATION_BYTES, 'PRIVATE_CONFIGURATION_TOO_LARGE');
  const configurationPath = path.join(output, 'configuration.private.json');
  const settings = { ...inspected.settings, configurationFile: configurationPath,
    sourceDirectory: application.directory, sourceManifestSha256: application.sourceManifestSha256 };
  const selection = {
    schema: RECEIVED_APPLICATION_SCHEMA + '.preparation',
    receivedSelectionSha256: inspected.selectionSha256,
    receivedSelection: inspected.selection,
    sourceAdoption,
    configuration: configuration.descriptor,
    effectiveConfiguration: { path: configurationPath, bytes: effectiveBody.length,
      sha256: hash(effectiveBody), mode: 0o600 },
    settings,
    automaticWork: { collections: false, webhookProjection: false },
  };
  const identity = hash(Buffer.from(canonical(selection)));
  const guard = await lease(output, 'received-application');
  let failure = null, result;
  try {
    check(signal);
    await writeExact(path.join(output, 'selection.private.json'), jsonBytes(selection));
    // Keep the entire supplied original as private custody. Connection fields
    // are never projected into public registration or command-line arguments.
    await writeExact(path.join(output, 'configuration.original.private.json'), configuration.body);
    await writeExact(configurationPath, effectiveBody);
    await writeExact(path.join(output, 'application-settings.private.json'), jsonBytes(settings));
    const current = await fileDescriptor(configuration.descriptor.path);
    need(current.bytes === configuration.descriptor.bytes &&
      current.sha256 === configuration.descriptor.sha256 &&
      current.mode === configuration.descriptor.mode, 'PRIVATE_CONFIGURATION_CHANGED');
    for (const filename of ['configuration.original.private.json','configuration.private.json',
      'application-settings.private.json','selection.private.json']) {
      const actual = await fileDescriptor(path.join(output, filename));
      need((actual.mode & 0o077) === 0, 'PRIVATE_PREPARATION_PERMISSIONS_REQUIRED');
    }
    check(signal);
    const receipt = {
      schema: RECEIVED_APPLICATION_SCHEMA + '.prepared', status: 'PREPARED',
      selectionSha256: identity, receivedSelectionSha256: inspected.selectionSha256,
      settings, original: inspected.selection.original,
      received: inspected.selection.received,
      runtime: inspected.selection.runtime,
      originalApplication: inspected.selection.application, application, sourceAdoption,
      originalConfiguration: configuration.descriptor,
      effectiveConfiguration: selection.effectiveConfiguration,
      automaticWork: selection.automaticWork,
    };
    await writeExact(path.join(output, 'prepared.private.json'), jsonBytes(receipt));
    need(((await fileDescriptor(path.join(output, 'prepared.private.json'))).mode & 0o077) === 0,
      'PRIVATE_PREPARATION_PERMISSIONS_REQUIRED');
    // Finish directory publication even on verified-file reentry after a prior
    // interrupted mkdir/write. This changes no received source or database.
    for (let current = output;; current = path.dirname(current)) {
      await syncDirectory(current);
      if (path.dirname(current) === current) break;
    }
    result = receipt;
  } catch (error) { failure = error; }
  finally {
    try { await guard.release(); }
    catch (error) {
      failure ??= error;
      // Preserve the original lease owner if its final release needs retry.
      failure.close = () => guard.release();
      failure.receivedApplicationOwner = { close: failure.close, directory: output };
    }
  }
  if (failure) throw failure;
  return result;
}

/** Reopen the completed private preparation without requiring a still-present input config. */
export async function openPreparedReceivedBloccpayApplication({
  destination, expectedSelectionSha256, signal,
} = {}) {
  check(signal);
  const root = await realDirectory(destination);
  need(((await fs.stat(root)).mode & 0o077) === 0, 'PRIVATE_PREPARATION_DIRECTORY_REQUIRED');
  const saved = await captureJSON(await confined(root, 'prepared.private.json'));
  const receipt = saved.value;
  const selected = await captureJSON(await confined(root, 'selection.private.json'));
  need(receipt.schema === RECEIVED_APPLICATION_SCHEMA + '.prepared' &&
    receipt.status === 'PREPARED' &&
    selected.value.schema === RECEIVED_APPLICATION_SCHEMA + '.preparation',
    'RECEIVED_APPLICATION_PREPARATION_REQUIRED');
  const identity = hash(Buffer.from(canonical(selected.value)));
  need(identity === receipt.selectionSha256 &&
    (expectedSelectionSha256 === undefined || expectedSelectionSha256 === identity),
    'RECEIVED_APPLICATION_SELECTION_CHANGED');
  const original = await captureJSON(await confined(root, 'configuration.original.private.json'), MAX_CONFIGURATION_BYTES);
  need(original.descriptor.bytes === selected.value.configuration.bytes &&
    original.descriptor.sha256 === selected.value.configuration.sha256 &&
    object(original.value), 'PRIVATE_CONFIGURATION_CHANGED');
  const effective = await captureJSON(await confined(root, 'configuration.private.json'), MAX_CONFIGURATION_BYTES);
  const expectedConfiguration = {
    ...original.value,
    collections: { ...original.value.collections, enabled: false },
    webhookProjection: { ...original.value.webhookProjection, enabled: false },
  };
  need(same(effective.value, expectedConfiguration) &&
    effective.descriptor.bytes === selected.value.effectiveConfiguration.bytes &&
    effective.descriptor.sha256 === selected.value.effectiveConfiguration.sha256,
    'PRIVATE_CONFIGURATION_CHANGED');
  const inspected = await inspectReceivedBloccpayWorkspace({
    receivedDirectory: selected.value.receivedSelection.received.directory,
    expectedManifestSha256: selected.value.receivedSelection.original.manifestSha256,
    expectedWorkspaceId: selected.value.receivedSelection.received.workspaceId,
    signal,
  });
  need(inspected.selectionSha256 === selected.value.receivedSelectionSha256 &&
    same(inspected.selection, selected.value.receivedSelection) &&
    receipt.receivedSelectionSha256 === inspected.selectionSha256,
    'RECEIVED_APPLICATION_SELECTION_CHANGED');
  const adoption = selected.value.sourceAdoption;
  need(object(adoption) && adoption.schema === RECEIVED_APPLICATION_SCHEMA + '.source-adoption' &&
    ['ORIGINAL', 'EXPLICIT'].includes(adoption.mode) &&
    same(adoption.original, inspected.selection.application) &&
    object(adoption.selected) && absolute(adoption.selected.directory) &&
    SHA.test(adoption.selected.sourceManifestSha256), 'RECEIVED_SOURCE_ADOPTION_REQUIRED');
  if (adoption.mode === 'ORIGINAL')
    need(same(adoption.selected, adoption.original), 'RECEIVED_SOURCE_ADOPTION_CHANGED');
  const selectedSource = await inspectManagedSource(
    adoption.selected.directory, adoption.selected.sourceManifestSha256);
  const application = {
    directory: selectedSource.directory, sourceManifestSha256: selectedSource.sha256,
    cli: path.join(selectedSource.directory, 'cli.mjs'),
    server: path.join(selectedSource.directory, 'server.mjs'),
    worker: path.join(selectedSource.directory, 'worker.mjs'),
  };
  need(same(application, adoption.selected), 'RECEIVED_SOURCE_ADOPTION_CHANGED');
  const settings = { ...inspected.settings, configurationFile: effective.descriptor.path,
    sourceDirectory: application.directory, sourceManifestSha256: application.sourceManifestSha256 };
  const savedSettings = await captureJSON(await confined(root, 'application-settings.private.json'));
  need(same(savedSettings.value, settings) && same(selected.value.settings, settings) &&
    same(receipt.settings, settings) &&
    same(receipt.original, inspected.selection.original) &&
    same(receipt.received, inspected.selection.received) &&
    same(receipt.runtime, inspected.selection.runtime) &&
    same(receipt.originalApplication, inspected.selection.application) &&
    same(receipt.application, application) &&
    same(receipt.sourceAdoption, adoption) &&
    same(receipt.originalConfiguration, selected.value.configuration) &&
    same(receipt.effectiveConfiguration, selected.value.effectiveConfiguration) &&
    same(receipt.automaticWork, { collections: false, webhookProjection: false }),
    'RECEIVED_APPLICATION_RECEIPT_MISMATCH');
  for (const item of [saved, selected, original, effective, savedSettings])
    need((item.descriptor.mode & 0o077) === 0, 'PRIVATE_PREPARATION_PERMISSIONS_REQUIRED');
  check(signal);
  return receipt;
}
