// MIT. Source authoring over the original SeaTable capture and publication engines.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { lstat, chmod, rename } from 'node:fs/promises';
import { object, bytes, digest, identity, fault, stamp, absolute, privateDirectory, readPrivate,
  readJson, createFile, atomicJson, syncDirectory, acquireWorkspace } from '../../postgres/publisher/files.mjs';
import { MAX_CAPTURE_BYTES, only, compileQueries, sourceSelection, SCALAR_TYPES, binding } from '../declaration.mjs';
import { readSeaTableCapture, bindSeaTableCapture, captureSeaTableSource, inspectSeaTableCaptureAttempt } from '../capture.mjs';
import { discoverSeaTableTable } from '../http.mjs';
import { SeaTableNumber } from '../values.mjs';
import { openSeaTableSourceFile, inspectSeaTableSource } from '../source.mjs';
import { openSeaTablePublisher } from '../publisher/model.mjs';
import { startPostgresPublisherServer } from '../../postgres/publisher/server.mjs';
import { reviewSeaTableDeployment, prepareSeaTableDeployment, inspectSeaTableDeployment, stageSeaTableDeployment, readSeaTableDeploymentFile } from '../deployment.mjs';
import { inspectSeaTableAuthoring } from './launch.mjs';
import { normalizeConnections, selectConnection, connectionViews, discoveryConfig } from './provider.mjs';
import { MAX_PACKET_BYTES, makeSeaTableSourcePacket, validatePacket, retainPacket, packetFromCapture, createOrVerify } from './packet.mjs';

import {readSeaTablePlacement,seaTablePlacedPath} from './placement.mjs';
import {createSeaTableWorkspaceHandover,seaTableWorkspaceHandoverFile,receiveSeaTableWorkspaceFile,receivedSeaTableWorkspaces,
  workspaceTransferStatus,workspaceTransferList,workspaceName,installSeaTableReceivedRelease} from './handover.mjs';
import {startWorkspaceUpload,appendWorkspaceUpload,finishWorkspaceUpload,workspaceUploadStatus,completedWorkspaceUpload} from './uploads.mjs';
import {acquireDatasetLease} from '../../dataset-refresh/writer-lease.mjs';
import {withStoppedReleaseCopy} from '../../../sf82-seller-pilot/releases.mjs';
const SCHEMA = 'stellar-forge.seatable-authoring.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const decode = value => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value)); }
  catch { throw fault('SEATABLE_RESOURCE_JSON_INVALID'); } };
const absent = async path => { try { await lstat(path); return false; } catch (issue) { if (issue.code === 'ENOENT') return true; throw issue; } };
const id = value => { if (typeof value !== 'string' || !UUID.test(value)) throw fault('REQUEST_ID_REQUIRED', 'Use one UUID for this operation and its recovery.'); return value; };
const text = (value, label, maximum = 128) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw fault('SEATABLE_TEXT_REQUIRED', 'Enter a valid ' + label + '.');
  return value.trim();
};
const integer = (value, label) => { if (!Number.isSafeInteger(value) || value < 0) throw fault('SEATABLE_REVISION_REQUIRED', label); return value; };
const privateFault = issue => ({ code: typeof issue.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(issue.code) ? issue.code : 'SEATABLE_AUTHORING_FAILED',
  message: issue.code && typeof issue.message === 'string' ? issue.message : 'Inspect the retained operation and selected input.',
  status: [400,403,404,409,413,422,502].includes(issue.status) ? issue.status : 422,
  ...(issue.providerStatus ? { providerStatus: issue.providerStatus } : {}),
  ...(issue.retryAfter ? { retryAfter: issue.retryAfter } : {}),
  ...(issue.requestId ? { providerRequestId: issue.requestId } : {}) });

function sourceConfig(capture, draft) {
  const { fields, ...selected } = capture.manifest.selection;
  const config = { schema: 'stellar-forge.seatable-source.v1', ...selected,
    connection: { kind: 'capture', file: capture.manifestFile, sha256: capture.manifestSha256 },
    queries: structuredClone(draft.queries) };
  compileQueries(config.queries); bindSeaTableCapture(capture, config);
  return config;
}
function suggestedColumn(field) {
  if (field.id === '$recordId') return { source: '$recordId', type: 'string', encoding: 'identity-text', nullable: false, empty: 'preserve' };
  const numeric = ['number','percent','dollar','euro','duration'].includes(field.type);
  return { source: field.id, providerType: field.type, type: field.type === 'checkbox' ? 'boolean' : field.type === 'rate' ? 'integer' : 'string',
    encoding: numeric ? 'number-text' : 'native', nullable: true, empty: 'preserve' };
}
function displayNative(value) {
  if (value instanceof SeaTableNumber) return { kind: 'number-token', value: value.text };
  if (value === undefined) return { kind: 'missing', value: null };
  if (value === null) return { kind: 'null', value: null };
  if (typeof value === 'string') return { kind: 'string', value: value.slice(0, 240), truncated: value.length > 240 };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  return { kind: 'structured', value: '[structured provider value]' };
}
export async function openSeaTableAuthoring({ directory, create = false, connections = {}, environment = process.env,
  targetDirectory, seller = null, resource = null, expectedIdentity } = {}) {
  absolute(directory); connections = normalizeConnections(connections);
  const directoryExisted = !await absent(directory);
  if (create && directoryExisted && await absent(join(directory, 'INIT.json')))
    throw fault('SEATABLE_AUTHORING_EXISTS', 'Reopen the existing source workspace; this directory has no matching initialization receipt.');
  await privateDirectory(directory, create);
  const release = await acquireWorkspace(directory);
  let db, publisherService = null, deploymentService = null, pending = null, closed = false, closing;
  const receivedChildren=new Map(),cleanupOwners=new Set();let dbClosed=false,leaseClosed=false;
  const deploymentDirectory = join(directory, 'deployments'), releaseDirectory = join(deploymentDirectory, 'releases');
  const lifetime = new AbortController();
  let publisherAccess = Promise.resolve();
  try {
    if (expectedIdentity !== undefined) {
      if (create) throw fault('SEATABLE_MANAGED_EXISTING_WORKSPACE_REQUIRED');
      await inspectSeaTableAuthoring(directory, { expectedIdentity });
    }
    let initialization = null;
    if (create) {
      targetDirectory ??= join(directory, 'dataset'); absolute(targetDirectory, 'dataset directory');
      if (targetDirectory !== join(directory, 'dataset') && (targetDirectory === directory ||
          targetDirectory.startsWith(directory + '/') || directory.startsWith(targetDirectory + '/')))
        throw fault('SEATABLE_TARGET_DIRECTORY_INVALID');
      const file = join(directory, 'INIT.json'), intent = { schema: SCHEMA, directory, targetDirectory };
      if (await absent(file)) await createOrVerify(file, bytes({ ...intent, createdAt: stamp() }));
      initialization = await readJson(file);
      if (initialization.schema !== intent.schema || initialization.directory !== directory ||
          initialization.targetDirectory !== targetDirectory || typeof initialization.createdAt !== 'string')
        throw fault('SEATABLE_INITIALIZATION_CHANGED', 'Resume initialization with its original directory and dataset binding.', 409);
    }
    const database = join(directory, 'sources.sqlite');
    if (!create && await absent(database)) throw fault('SEATABLE_AUTHORING_MISSING');
    if (!await absent(database)) {
      const stat = await lstat(database);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.nlink !== 1) throw fault('PRIVATE_DATABASE_REQUIRED');
    }
    db = new DatabaseSync(database); await chmod(database, 0o600);
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS discoveries(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload_hash TEXT NOT NULL,
        input TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,result TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,created TEXT NOT NULL,kind TEXT NOT NULL,operation TEXT,data TEXT NOT NULL);`);
    const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; }
      catch (issue) { try { db.exec('ROLLBACK'); } catch {} throw issue; } };
    if (create && !db.prepare('SELECT id FROM settings WHERE id=1').get()) {
      transaction(() => {
        db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({ schema: SCHEMA, createdAt: initialization.createdAt,
          targetDirectory, publisherDirectory: join(directory, 'publisher'), sourceFile: join(directory, 'current-source.json') }));
        db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify({ draft: null, draftRevision: 0, selectedVersion: null, selectionRevision: 0 }));
      });
      for (const name of ['inputs', 'captures', 'previews', 'versions', 'interrupted']) await privateDirectory(join(directory, name), true);
      await syncDirectory(directory);
    }
    const settings = JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data ?? 'null');
    if (settings?.schema !== SCHEMA || settings.sourceFile !== join(directory, 'current-source.json') ||
        settings.publisherDirectory !== join(directory, 'publisher') || targetDirectory && targetDirectory !== settings.targetDirectory)
      throw fault('SEATABLE_AUTHORING_BINDING_CHANGED');
    for (const name of ['inputs', 'captures', 'previews', 'versions', 'interrupted']) await privateDirectory(join(directory, name), true);
    const placement=await readSeaTablePlacement(directory),resolveCaptureFile=path=>seaTablePlacedPath(placement,path);
    const current = () => JSON.parse(db.prepare('SELECT data FROM state WHERE id=1').get().data);
    const setState = value => db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(value));
    const event = (kind, request, data = {}) => db.prepare('INSERT INTO events(created,kind,operation,data) VALUES(?,?,?,?)')
      .run(stamp(), kind, request, JSON.stringify(data));
    const operation = request => {
      const row = db.prepare('SELECT * FROM operations WHERE id=?').get(id(request));
      if (!row) return null;
      return { id: row.id, kind: row.kind, status: row.status, createdAt: row.created, updatedAt: row.updated,
        result: row.result ? JSON.parse(row.result) : null, error: row.error ? JSON.parse(row.error) : null };
    };
    const captureRecord = request => {
      const row = db.prepare('SELECT data FROM captures WHERE id=?').get(id(request));
      if (!row) throw fault('SEATABLE_CAPTURE_NOT_FOUND', 'Choose a retained observation.', 404);
      return JSON.parse(row.data);
    };
    const capture = async request => {
      const row = captureRecord(request);
      const result = await readSeaTableCapture(join(directory, 'captures', row.id, 'capture.json'), row.manifestSha256);
      if (result.manifest.selectionSha256 !== row.selectionSha256 || result.manifest.rowCount !== row.rowCount)
        throw fault('SEATABLE_CAPTURE_RESOURCE_CHANGED');
      return result;
    };
    const version = number => {
      integer(number, 'Choose a saved source version.');
      const row = db.prepare('SELECT * FROM versions WHERE id=?').get(number);
      if (!row) throw fault('SEATABLE_VERSION_NOT_FOUND', 'Choose a saved source version.', 404);
      return { id: row.id, requestId: row.request_id, ...JSON.parse(row.data) };
    };
    const versionConfig = async row => {
      const content = await readPrivate(join(directory, 'versions', row.requestId, 'source.json'));
      if (digest(content) !== row.sourceSha256) throw fault('SEATABLE_SAVED_SOURCE_CHANGED');
      return decode(content);
    };
    const assertOpen = () => { if (closed || closing) throw fault('SEATABLE_AUTHORING_CLOSED'); };
    const start = (kind, input, request) => {
      assertOpen(); id(request); const hash = identity(input);
      const old = db.prepare('SELECT * FROM operations WHERE id=?').get(request);
      if (old) {
        if (old.kind !== kind || old.payload_hash !== hash) throw fault('SEATABLE_REQUEST_REUSED', 'This request ID belongs to different input.', 409);
        if (old.status === 'complete') return { done: true, value: JSON.parse(old.result) };
        if (old.status === 'failed') { const issue = JSON.parse(old.error); throw fault(issue.code, issue.message, issue.status); }
        throw fault('SEATABLE_OPERATION_RETAINED', 'Inspect or resume the original retained operation.', 409);
      }
      if (pending) throw fault('SEATABLE_AUTHORING_BUSY', 'The current source operation is still running.', 409);
      const time = stamp();
      transaction(() => {
        db.prepare('INSERT INTO operations(id,kind,payload_hash,input,status,created,updated) VALUES(?,?,?,?,?,?,?)')
          .run(request, kind, hash, JSON.stringify(input), 'pending', time, time);
        event('STARTED', request, { kind });
      });
      return { done: false };
    };
    const complete = (request, result) => {
      db.prepare('UPDATE operations SET status=?,updated=?,result=?,error=NULL WHERE id=?')
        .run('complete', stamp(), JSON.stringify(result), request);
      event('COMPLETED', request);
      return result;
    };
    const run = async (kind, input, request, fn, resume = false) => {
      if (!resume) { const opened = start(kind, input, request); if (opened.done) return opened.value; }
      else { assertOpen(); if (pending) throw fault('SEATABLE_AUTHORING_BUSY', 'Wait for the active operation.', 409); }
      const active = { id: request, kind, completion: null }; pending = active;
      active.completion = Promise.resolve().then(fn).then(result => transaction(() => complete(request, result))).catch(async issue => {
        const error = privateFault(issue);
        let interrupted = !/^(SEATABLE_|DATASET_|PRIVATE_|SOURCE_|QUERY_|INVALID_|ABSOLUTE_)/.test(issue.code ?? '') ||
          ['SEATABLE_CAPTURE_CANCELLED','SEATABLE_PROVIDER_UNREACHABLE','SEATABLE_RESPONSE_INTERRUPTED','SEATABLE_CAPTURE_TIMEOUT'].includes(issue.code) ||
          kind === 'CAPTURE' && ['SEATABLE_RATE_LIMITED','SEATABLE_PROVIDER_FAILED','SEATABLE_TOKEN_MISSING',
            'SEATABLE_TOKEN_INVALID','SEATABLE_READ_SCOPE_REQUIRED','SEATABLE_PROVIDER_PLAN_REQUIRED'].includes(issue.code);
        if (kind === 'CAPTURE') {
          try {
            const attempt = await inspectSeaTableCaptureAttempt(join(directory,'captures','.pending-'+request));
            if (attempt.state === 'INCOMPLETE' && attempt.freshReadRequired === true) interrupted = false;
          } catch { /* Retain the unresolved I/O failure; the original request remains inspectable. */ }
        }
        try { transaction(() => {
          db.prepare('UPDATE operations SET status=?,updated=?,error=? WHERE id=?')
            .run(interrupted ? 'interrupted' : 'failed', stamp(), JSON.stringify(error), request);
          event(interrupted ? 'INTERRUPTED' : 'FAILED', request, { code: error.code });
        }); } catch { /* The pending durable operation is reconciled on reopen. */ }
        throw fault(error.code, error.message, error.status);
      }).finally(() => { if (pending === active) pending = null; });
      return active.completion;
    };

    async function installSelection(row, expectedVersion) {
      const state = current();
      if (state.selectedVersion !== expectedVersion && state.selectedVersion !== row.id)
        throw fault('SEATABLE_SELECTION_CHANGED', 'Refresh the selected source before changing it.', 409);
      const config = await versionConfig(row);
      if (!await absent(settings.sourceFile)) {
        const existing = digest(await readPrivate(settings.sourceFile));
        const prior = state.selectedVersion === null ? null : version(state.selectedVersion).sourceSha256;
        if (existing !== prior && existing !== row.sourceSha256) throw fault('SEATABLE_SELECTED_SOURCE_CHANGED',
          'The managed source file changed outside this workspace. Preserve it and restore the selected original source before continuing.', 409);
      } else if (state.selectedVersion !== null) throw fault('SEATABLE_SELECTED_SOURCE_MISSING');
      if (await absent(settings.sourceFile) || digest(await readPrivate(settings.sourceFile)) !== row.sourceSha256)
        await atomicJson(directory, 'current-source.json', config);
      transaction(() => { const next = current(); if (next.selectedVersion !== row.id) {
        next.selectedVersion = row.id; next.selectionRevision++; setState(next); }
      });
      return { version: row, selectedVersion: row.id, sourceFile: settings.sourceFile, sourceSha256: row.sourceSha256 };
    }



    const discoveryRecord = request => {
      const row = db.prepare('SELECT data FROM discoveries WHERE id=?').get(id(request));
      if (!row) throw fault('SEATABLE_DISCOVERY_NOT_FOUND', 'Inspect the actual table metadata first.', 404);
      return JSON.parse(row.data);
    };
    async function retainInput(request, content) {
      const file = join(directory, 'inputs', request + '.json');
      await createOrVerify(file, content); return file;
    }
    async function performDiscover(input, request, allowProvider) {
      const file = join(directory, 'inputs', request + '.discovery.json');
      let result;
      if (!await absent(file)) result = await readJson(file, 16777216);
      else {
        if (!allowProvider) throw fault('SEATABLE_DISCOVERY_NOT_RETAINED',
          'This metadata response was not retained. Request a new explicit metadata observation; recovery never repeats a provider read.', 409);
        result = await discoverSeaTableTable(input.config, { env: environment, signal: lifetime.signal });
        await createOrVerify(file, bytes(result), 16777216);
      }
      const expectedBinding = binding(input.config);
      if (identity(result.source) !== identity(expectedBinding)) throw fault('SEATABLE_DISCOVERY_CHANGED');
      const record = { ...result, id: request, connectionAlias: input.connectionAlias };
      transaction(() => {
        const prior = db.prepare('SELECT data FROM discoveries WHERE id=?').get(request);
        if (prior && identity(JSON.parse(prior.data)) !== identity(record)) throw fault('SEATABLE_DISCOVERY_CHANGED');
        if (!prior) db.prepare('INSERT INTO discoveries VALUES(?,?)').run(request, JSON.stringify(record));
      });
      return record;
    }
    async function discover({ connectionAlias, baseId, tableId, viewId = null, where = null, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DISCOVERY_INPUT_INVALID');
      const config = discoveryConfig(connections, { connectionAlias, baseId, tableId, viewId, where });
      return run('DISCOVER', { connectionAlias, config }, requestId, () => performDiscover({ connectionAlias, config }, requestId, true));
    }
    function acquisitionConfig(input) {
      only(input, ['discoveryId','connectionAlias','sourceOrder','queries'], 'SEATABLE_ACQUISITION_INVALID');
      const observed = discoveryRecord(input.discoveryId), host = selectConnection(connections, input.connectionAlias);
      if (observed.connectionAlias !== input.connectionAlias || host.server !== observed.source.server)
        throw fault('SEATABLE_DISCOVERY_CONNECTION_CHANGED', 'Use the same declared host as the inspected table.');
      const config = { schema: 'stellar-forge.seatable-source.v1', ...observed.source, ...host,
        sourceOrder: structuredClone(input.sourceOrder), queries: structuredClone(input.queries) };
      const compiled = compileQueries(config.queries), selection = sourceSelection(config, compiled);
      const actual = new Map(observed.fields.map(field => [field.id, field]));
      for (const field of selection.fields) if (actual.get(field.id)?.type !== field.type ||
          actual.get(field.id)?.scalarProjectionSupported !== true)
        throw fault('SEATABLE_METADATA_FIELD_CHANGED', 'Choose a scalar field and its actual provider type from the observed metadata.');
      for (const order of selection.sourceOrder) if (!actual.has(order.field) ||
          !(SCALAR_TYPES.has(actual.get(order.field).type) || actual.get(order.field).generatedRecordIdentity))
        throw fault('SEATABLE_METADATA_ORDER_CHANGED', 'Select actual scalar or native identity fields for stable provider order.');
      for (const field of observed.fields) if (!selection.viewId && field.generatedRecordIdentity &&
          !selection.sourceOrder.some(order => order.field === field.id))
        throw fault('SEATABLE_IDENTITY_ORDER_REQUIRED', 'Include the native _id field in the constructed SQL order. A native view retains its own SeaTable order.');
      return { config, discoverySha256: identity(observed) };
    }
    async function finishCapture(request, input, retained) {
      bindSeaTableCapture(retained, input.config);
      const target = join(directory, 'captures', request);
      if (retained.manifestFile !== join(target, 'capture.json')) {
        if (!await absent(target)) {
          const original = await readSeaTableCapture(join(target, 'capture.json'), retained.manifestSha256);
          bindSeaTableCapture(original, input.config); retained = original;
        } else {
          await rename(dirname(retained.manifestFile), target); await syncDirectory(dirname(target));
          retained = await readSeaTableCapture(join(target, 'capture.json'), retained.manifestSha256);
        }
      }
      const draft = { captureId: request, title: input.title, queries: structuredClone(input.config.queries) };
      sourceConfig(retained, draft);
      return transaction(() => {
        const prior = db.prepare('SELECT data FROM captures WHERE id=?').get(request);
        if (prior) {
          const record = JSON.parse(prior.data);
          if (record.manifestSha256 !== retained.manifestSha256 || identity(record.draft) !== identity(draft))
            throw fault('SEATABLE_CAPTURE_RECORD_CHANGED');
          return { capture: record, ...record.adoption };
        }
        const state = current(), draftSaved = state.draftRevision === input.expectedDraftRevision;
        if (draftSaved) { state.draft = draft; state.draftRevision++; setState(state); }
        const record = { id: request, title: input.title, tableTitle: retained.table.title,
          createdAt: retained.manifest.completedAt, selection: retained.manifest.selection,
          selectionSha256: retained.manifest.selectionSha256, schemaSha256: retained.manifest.schemaSha256,
          manifestSha256: retained.manifestSha256, sourceBytes: retained.manifest.sourceBytes,
          rowCount: retained.manifest.rowCount, pageCount: retained.manifest.pageCount,
          startedAt: retained.manifest.startedAt, completedAt: retained.manifest.completedAt,
          countVerified: retained.manifest.countVerified === true, atomicSourceSnapshot: false,
          responseKind: retained.manifest.responseKind, completeness: retained.manifest.viewCompleteness ?? null,
          transport: retained.manifest.transport,
          imported: input.packetSha256 !== undefined, origin: input.origin ?? null,
          draft, adoption: { draftSaved, draftRevision: state.draftRevision } };
        db.prepare('INSERT INTO captures VALUES(?,?)').run(request, JSON.stringify(record));
        event('CAPTURE_RETAINED', request, { manifestSha256: record.manifestSha256, draftSaved });
        return { capture: record, ...record.adoption };
      });
    }
    async function performImport(input, request, packet) {
      if (packet === undefined || packet === null) {
        try { packet = decode(await readPrivate(join(directory,'inputs',request+'.json'),MAX_PACKET_BYTES)); }
        catch (issue) {
          if (issue.code === 'ENOENT') throw fault('SEATABLE_IMPORT_INPUT_NOT_RETAINED',
            'The original packet did not reach durable input storage. Keep this receipt and explicitly import the same complete packet with a new request; recovery performs no provider read.',409);
          throw issue;
        }
      }
      if (digest(bytes(packet)) !== input.packetSha256) throw fault('SEATABLE_RETAINED_INPUT_CHANGED');
      const checked = await validatePacket(packet);
      if (identity(checked.source) !== identity(input.config)) throw fault('SEATABLE_RETAINED_INPUT_CHANGED');
      await retainInput(request, bytes(packet));
      const target = join(directory, 'captures', request);
      const retained = !await absent(target) ? await readSeaTableCapture(join(target, 'capture.json'), checked.manifestSha256) :
        await retainPacket(packet, join(directory, 'captures', '.pending-' + request));
      return finishCapture(request, input, retained);
    }
    async function importPacket({ packet, title, expectedDraftRevision, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_PACKET_INPUT_INVALID');
      const checked = await validatePacket(packet);
      const input = { title: text(title, 'capture title'), expectedDraftRevision: integer(expectedDraftRevision, 'Use the current draft revision.'),
        packetSha256: digest(bytes(packet)), config: checked.source, origin: packet.origin ?? null };
      return run('IMPORT', input, requestId, () => performImport(input, requestId, packet));
    }
    async function importSource({ sourceFile, title, expectedDraftRevision, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_SOURCE_IMPORT_INVALID');
      absolute(sourceFile, 'original frozen source file');
      // Host/CLI-only input. The browser can import a complete portable packet,
      // but cannot name an arbitrary local file or token environment.
      const packet = await makeSeaTableSourcePacket(sourceFile);
      return importPacket({ packet, title, expectedDraftRevision, requestId });
    }
    async function performCapture(input, request, allowProvider) {
      const target = join(directory,'captures',request), staging = join(directory,'captures','.pending-'+request);
      let retained;
      if (!await absent(join(target,'capture.json'))) retained = await readSeaTableCapture(join(target,'capture.json'));
      else if (!await absent(join(staging,'capture.json'))) retained = await readSeaTableCapture(join(staging,'capture.json'));
      else {
        if (allowProvider && !await absent(staging))
          throw fault('SEATABLE_CAPTURE_ALREADY_RETAINED','Inspect or resume this original capture request instead of starting it again.',409);
        await retainInput(request,bytes(input.config));
        // Only a new explicit capture or explicit Resume enters the provider.
        // The original step journal owns same-input resume, read bounds and any
        // fresh-observation requirement; opening a workspace never enters here.
        retained = await captureSeaTableSource(input.config,staging,{
          env:environment,signal:lifetime.signal,resume:!allowProvider,
        });
      }
      return finishCapture(request,input,retained);
    }
    async function readLive({ discoveryId, connectionAlias, sourceOrder, queries, title, expectedDraftRevision, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_CAPTURE_INPUT_INVALID');
      const acquired = acquisitionConfig({ discoveryId, connectionAlias, sourceOrder, queries });
      const input = { ...acquired, title: text(title, 'capture title'),
        expectedDraftRevision: integer(expectedDraftRevision, 'Use the current draft revision.') };
      return run('CAPTURE', input, requestId, () => performCapture(input, requestId, true));
    }
    async function inspectCapture(request) {
      const retained = await capture(request), rows = retained.records;
      const fields = [{ id: '$recordId', title: 'Native record identity', type: 'RecordIdentity' },
        ...retained.manifest.selection.fields.map(field => ({ ...field,
          title: retained.table.fields.find(item => item.id === field.id)?.title ?? field.id }))].map(field => {
        const counts = { number: 0, string: 0, boolean: 0, null: 0, missing: 0, structured: 0, emptyString: 0,
          unsafeInteger: 0, nonInteger: 0 };
        const samples = [];
        for (const row of rows) {
          const value = field.id === '$recordId' ? row.id : row.fields[field.id], shown = displayNative(value);
          if (value instanceof SeaTableNumber) {
            counts.number++; const number = Number(value.text);
            if (Number.isInteger(number) && !Number.isSafeInteger(number)) counts.unsafeInteger++;
            if (!Number.isInteger(number)) counts.nonInteger++;
          } else if (value === null) counts.null++;
          else if (value === undefined) counts.missing++;
          else if (typeof value === 'string') { counts.string++; if (!value) counts.emptyString++; }
          else if (typeof value === 'boolean') counts.boolean++; else counts.structured++;
          if (samples.length < 5) samples.push(shown);
        }
        return { ...field, counts, samples, suggested: suggestedColumn(field) };
      });
      const primaryKeys = ['_id'];
      return { capture: captureRecord(request), fields, primaryKeys,
        projectionRule: 'All captured field IDs/types and source selection remain exact. Public aliases, native encoding and null policy are editable; the publisher can expose a subset.',
        valueRule: 'Numeric samples show original JSON number tokens; string samples stay strings.',
        manifest: retained.manifest };
    }
    async function normalizeDraft(input) {
      only(input, ['captureId','title','queries'], 'SEATABLE_DRAFT_INVALID');
      const retained = await capture(input.captureId);
      const draft = { captureId: input.captureId, title: text(input.title, 'source title'), queries: structuredClone(input.queries) };
      sourceConfig(retained, draft); return draft;
    }
    async function saveDraft({ draft, expectedRevision, requestId }) {
      integer(expectedRevision, 'Use the current draft revision.');
      const normalized = await normalizeDraft(draft);
      return run('DRAFT', { draft: normalized, expectedRevision }, requestId, () => transaction(() => {
        const state = current();
        if (state.draftRevision !== expectedRevision)
          throw fault('SEATABLE_DRAFT_CHANGED', 'Another window saved this draft. Reload before saving your edit.', 409);
        state.draft = normalized; state.draftRevision++; setState(state);
        return { draft: state.draft, draftRevision: state.draftRevision };
      }));
    }
    async function performPreview(input, request) {
      const existing = db.prepare('SELECT data FROM previews WHERE id=?').get(request);
      if (existing) return JSON.parse(existing.data);
      const state = current();
      if (!state.draft || state.draftRevision !== input.draftRevision)
        throw fault('SEATABLE_DRAFT_CHANGED', 'Save and preview the current draft before retaining a version.', 409);
      const original = await capture(state.draft.captureId), config = sourceConfig(original, state.draft);
      const folder = join(directory, 'previews', request); await privateDirectory(folder, true);
      const file = join(folder, 'source.json'); await createOrVerify(file, bytes(config));
      const reader = await openSeaTableSourceFile(file,{resolveCaptureFile}), reports = {};
      try {
        for (const [name, query] of Object.entries(config.queries)) {
          const sample = [];
          const report = await reader.source.exportDataset(name, {}, {
            order: [{ column: Object.keys(query.columns)[0], direction: 'asc' }],
            maxRows: 1000000, maxBytes: MAX_CAPTURE_BYTES, maxRowBytes: 1048576, timeoutMs: 300000,
            signal: lifetime.signal, onRow(row) { if (sample.length < 25) sample.push(row); },
          });
          reports[name] = { report, sample, sampleLimit: 25,
            previewOrder: [{column:Object.keys(query.columns)[0],direction:'asc'}] };
        }
      } finally { await reader.source.close(); }
      const result = { id: request, draftRevision: input.draftRevision, draftSha256: identity(state.draft),
        captureId: state.draft.captureId, sourceSha256: digest(bytes(config)), createdAt: stamp(),
        reports, complete: true, allRowsChecked: true, providerRead: false, mode: 'capture',
        publicationSummary: {
          captureId:state.draft.captureId,captureCompletedAt:original.manifest.completedAt,
          captureSha256:original.manifestSha256,sourceRows:original.manifest.rowCount,
          responseKind:original.manifest.responseKind,countVerified:original.manifest.countVerified === true,
          atomicSourceSnapshot:false,selection:structuredClone(original.manifest.selection),
          queries:Object.fromEntries(Object.entries(config.queries).map(([name,query])=>[name,{
            emittedRows:reports[name].report.rowCount,columns:structuredClone(query.columns),
            previewOrder:reports[name].previewOrder,
          }])),
          rowRule:'All retained rows for the selected SQL filter or native view are validated. Authoring adds no row filter; choose any public column subset and extraction order in the original publisher.',
        } };
      transaction(() => db.prepare('INSERT INTO previews VALUES(?,?)').run(request, JSON.stringify(result)));
      return result;
    }
    async function preview({ draftRevision, requestId }) {
      integer(draftRevision, 'Use the saved draft revision.');
      return run('PREVIEW', { draftRevision }, requestId, () => performPreview({ draftRevision }, requestId));
    }
    async function performVersion(input, request) {
      const prior = db.prepare('SELECT id FROM versions WHERE request_id=?').get(request);
      if (prior) return installSelection(version(prior.id), input.expectedSelectedVersion);
      const state = current(), reviewed = JSON.parse(db.prepare('SELECT data FROM previews WHERE id=?').get(input.previewId)?.data ?? 'null');
      if (!state.draft || state.draftRevision !== input.draftRevision || !reviewed ||
          reviewed.draftRevision !== input.draftRevision || reviewed.draftSha256 !== identity(state.draft))
        throw fault('SEATABLE_PREVIEW_CHANGED', 'Preview the exact current saved draft before retaining a source version.', 409);
      if (state.selectedVersion !== input.expectedSelectedVersion)
        throw fault('SEATABLE_SELECTION_CHANGED', 'Reload the currently selected source.', 409);
      const original = await capture(state.draft.captureId), config = sourceConfig(original, state.draft);
      const folder = join(directory, 'versions', request); await privateDirectory(folder, true);
      const file = join(folder, 'source.json'), content = bytes(config); await createOrVerify(file, content);
      await inspectSeaTableSource(file,{resolveCaptureFile}); await syncDirectory(folder);
      const record = { title: state.draft.title, createdAt: stamp(), reviewer: input.reviewer, note: input.note,
        draft: state.draft, draftRevision: input.draftRevision, previewId: input.previewId,
        sourceSha256: digest(content), sourceBytes: content.length, sourceFile: file,
        captureId: state.draft.captureId, observationSha256: original.manifestSha256,
        selectionSha256: original.manifest.selectionSha256, schemaSha256: original.manifest.schemaSha256,
        mode: 'capture', rowCount: original.manifest.rowCount,
        publicationSummary: reviewed.publicationSummary,
        queries: Object.fromEntries(Object.entries(config.queries).map(([name, query]) => [name, Object.keys(query.columns)])),
        columns: [...new Set(Object.values(config.queries).flatMap(query => Object.keys(query.columns)))] };
      const number = transaction(() => Number(db.prepare('INSERT INTO versions(request_id,data) VALUES(?,?)').run(request, JSON.stringify(record)).lastInsertRowid));
      return installSelection(version(number), input.expectedSelectedVersion);
    }
    async function saveVersion({ draftRevision, previewId, reviewer, note, expectedSelectedVersion, requestId }) {
      const input = { draftRevision: integer(draftRevision, 'Use the reviewed draft revision.'), previewId: id(previewId),
        reviewer: text(reviewer, 'reviewer'), note: text(note, 'source change note', 2000), expectedSelectedVersion };
      return run('VERSION', input, requestId, () => performVersion(input, requestId));
    }
    async function selectVersion({ versionId, expectedSelectedVersion, requestId }) {
      version(versionId);
      return run('SELECT', { versionId, expectedSelectedVersion }, requestId, () => installSelection(version(versionId), expectedSelectedVersion));
    }
    async function exportVersion(versionId) {
      const row = version(versionId), retained = await capture(row.captureId), config = await versionConfig(row);
      const packet = await packetFromCapture(retained, config, { origin: captureRecord(row.captureId).origin,
        version: { id: row.id, title: row.title, reviewer: row.reviewer, note: row.note,
          sourceSha256: row.sourceSha256, createdAt: row.createdAt, rowCount: row.rowCount,
          queries: row.queries, originalMode: 'capture' } });
      return { filename: 'seatable-source-v' + row.id + '.json', mime: 'application/json', bytes: bytes(packet) };
    }
    async function exportCapture(captureId) {
      const row = captureRecord(captureId), original = await capture(captureId);
      return { filename: 'seatable-observation-' + captureId + '.json', mime: 'application/json',
        bytes: bytes(await packetFromCapture(original, sourceConfig(original, row.draft), { origin: row.origin })) };
    }
    async function captureAttempt(request) {
      const row = db.prepare('SELECT kind,status FROM operations WHERE id=?').get(id(request));
      if (!row || row.kind !== 'CAPTURE')
        throw fault('SEATABLE_CAPTURE_REQUEST_NOT_FOUND','Choose an original capture request.',404);
      const target = join(directory,'captures',request), staging = join(directory,'captures','.pending-'+request);
      const folder = !await absent(target) ? target : staging;
      const native = await inspectSeaTableCaptureAttempt(folder);
      return {requestId:request,status:row.status,...native,
        recovery:native.freshReadRequired || row.status === 'failed' ?
          'This observation is terminal. Keep its original request, correct the reported source/projection/bounds and explicitly create a new capture UUID.' :
          'Explicit Resume uses this same capture UUID, original selection/read bounds and provider step journal. Reopening alone performs no read.'};
    }
    async function compareVersions(leftId, rightId) {
      const left = version(leftId), right = version(rightId), queries = [];
      for (const name of new Set([...Object.keys(left.draft.queries), ...Object.keys(right.draft.queries)])) {
        const before = left.draft.queries[name]?.columns ?? {}, after = right.draft.queries[name]?.columns ?? {};
        queries.push({ name, columns: [...new Set([...Object.keys(before), ...Object.keys(after)])].map(alias => ({
          alias, before: before[alias] ?? null, after: after[alias] ?? null,
          status: !(alias in before) ? 'added' : !(alias in after) ? 'removed' : identity(before[alias]) === identity(after[alias]) ? 'same' : 'changed',
        })) });
      }
      return { left, right, queries, sameObservation: left.observationSha256 === right.observationSha256,
        sameSelection: left.selectionSha256 === right.selectionSha256,
        sameProjection: identity(left.draft.queries) === identity(right.draft.queries) };
    }

    async function openPublisher({ expectedSelectedVersion, requestId }) {
      return run('PUBLISHER', { expectedSelectedVersion }, requestId, () => serializePublisherAccess(async () => {
        const state = current();
        if (state.selectedVersion === null || state.selectedVersion !== expectedSelectedVersion)
          throw fault('SEATABLE_SELECTION_CHANGED', 'Select the reviewed source before opening its publisher.', 409);
        const selected = version(state.selectedVersion);
        if (digest(await readPrivate(settings.sourceFile)) !== selected.sourceSha256) throw fault('SEATABLE_SELECTED_SOURCE_CHANGED');
        if (!publisherService) {
          const publisher = await openSeaTablePublisher({ directory: settings.publisherDirectory,
            create: await absent(settings.publisherDirectory), sourceFile: settings.sourceFile,
            targetDirectory: settings.targetDirectory, environment, seller, resource, resolveCaptureFile });
          try { publisherService = await startPostgresPublisherServer({ publisher, port: 0 }); }
          catch (issue) { await publisher.close(); throw issue; }
        }
        return { url: publisherService.url, sourceVersion: selected.id, sourceSha256: selected.sourceSha256,
          publisherDirectory: settings.publisherDirectory, targetDirectory: settings.targetDirectory };
      }));
    }


    const deploymentPackagePath = request => join(deploymentDirectory, 'packages', id(request));
    const hashValue = value => {
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
        throw fault('SEATABLE_DEPLOYMENT_HASH_REQUIRED', 'Use the inspected original SHA256.', 400);
      return value;
    };
    function serializePublisherAccess(action) {
      const result = publisherAccess.then(action);
      publisherAccess = result.catch(() => {});
      return result;
    }
    async function withPublisher(action) {
      assertOpen();if(pending?.kind?.startsWith('WORKSPACE_'))throw fault('SEATABLE_AUTHORING_BUSY',undefined,409);
      return serializePublisherAccess(async () => {
        assertOpen();
        if (publisherService) return action(publisherService.publisher);
        if (await absent(settings.publisherDirectory))
          throw fault('SEATABLE_DEPLOYMENT_PUBLISHER_MISSING', 'Publish the reviewed source through its original publisher first.', 409);
        const original = await openSeaTablePublisher({ directory: settings.publisherDirectory, environment, seller, resource, resolveCaptureFile });
        try { return await action(original); } finally { await original.close(); }
      });
    }
    /** Host-only access to the SAME browser-owned publisher and scheduler.
     * The caller supplies code, never an agent-selected module or native handle.
     * This serialized lifetime drains before closePublisher/deployment/close. */
    async function withOpenPublisher(action) {
      assertOpen();if(pending?.kind?.startsWith('WORKSPACE_'))throw fault('SEATABLE_AUTHORING_BUSY',undefined,409);
      if (typeof action !== 'function') throw fault('SEATABLE_PUBLISHER_CALLBACK_REQUIRED');
      return serializePublisherAccess(async () => {
        assertOpen();
        if (!publisherService)
          throw fault('SEATABLE_PUBLISHER_NOT_OPEN', 'Explicitly open the selected source publisher first.', 409);
        return action({ publisher: publisherService.publisher, schedule: publisherService.schedule });
      });
    }

    function savedDeploymentOperation(request, kind) {
      const row = db.prepare('SELECT * FROM operations WHERE id=?').get(id(request));
      if (!row || row.kind !== kind || row.status !== 'complete')
        throw fault('SEATABLE_DEPLOYMENT_RECEIPT_REQUIRED', 'Select the completed original review or package request.', 409);
      return { input: JSON.parse(row.input), result: JSON.parse(row.result) };
    }
    async function consoleRequest(method, path, input) {
      const service = deploymentService;
      if (!service) throw fault('SEATABLE_DEPLOYMENT_CONSOLE_REQUIRED', 'Open the original deployment controls first.', 409);
      let response;
      try {
        response = await fetch(service.native.url + path, { method, redirect: 'error',
          headers: { 'x-release-token': service.native.token, origin: service.native.url,
            ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
          ...(method === 'POST' ? { body: JSON.stringify(input) } : {}),
          signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(175000)]) });
        const blocks = []; let size = 0;
        for await (const block of response.body) {
          size += block.length;
          if (size > 16 * 1024 * 1024) throw new Error('Original console reply exceeds 16 MiB.');
          blocks.push(block);
        }
        const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocks)));
        if (!response.ok) {
          const issue = fault('SEATABLE_DEPLOYMENT_COMMAND_REJECTED',
            (result.error ?? 'OPERATOR_ERROR') + ': ' + (result.message ?? 'Inspect the original release state.'),
            [400, 403, 404, 409, 413, 422, 502].includes(response.status) ? response.status : 422);
          issue.nativeReply = true; throw issue;
        }
        return result;
      } catch (issue) {
        if (issue.nativeReply) throw issue;
        // No second POST after an uncertain local response. The source request
        // remains recoverable and resume reads only the original current state.
        throw fault('DEPLOYMENT_CONSOLE_RESPONSE_UNCERTAIN',
          'Read or resume this original request. Its deployment command is not automatically replayed.', 502);
      }
    }
    function deploymentOwnership() {
      return { running: Boolean(deploymentService), instanceId: deploymentService?.id ?? null,
        url: deploymentService?.native.operatorUrl ?? null, releaseDirectory };
    }
    async function nativeDeploymentState() {
      if (deploymentService) return consoleRequest('GET', '/api/status');
      if (await absent(releaseDirectory)) return null;
      const { releaseStatus } = await import('../../../sf82-seller-pilot/releases.mjs');
      return releaseStatus(releaseDirectory);
    }
    async function deploymentStatus({ runsOffset = 0, operationsOffset = 0, limit = 25 } = {}) {
      assertOpen();
      for (const offset of [runsOffset, operationsOffset]) integer(offset, 'Use a nonnegative result offset.');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw fault('SEATABLE_PAGE_LIMIT_INVALID');
      const sourceVersions = db.prepare('SELECT * FROM versions ORDER BY id DESC').all().map(row => {
        const data = JSON.parse(row.data);
        return { id: row.id, title: data.title, sourceSha256: data.sourceSha256, mode: data.mode };
      });
      let publisher = null;
      if (!await absent(settings.publisherDirectory)) publisher = await withPublisher(original => {
        const saved = original.status({ limit, runsOffset });
        return { pages: saved.pages.runs, active: saved.active, runs: saved.runs.map(row => {
          const plan = original.plan(row.plan), sourceSha256 = plan.data.sourceHash;
          return { id: row.id, planId: row.plan, state: row.state, createdAt: row.created, sourceSha256,
            sourceVersions: sourceVersions.filter(version => version.sourceSha256 === sourceSha256),
            candidateDigest: row.data.candidate?.candidateDigest ?? null,
            dataset: row.data.candidate?.dataset ?? null, publication: row.data.publication
              ? { snapshot: row.data.publication.snapshot, revision: row.data.publication.revision,
                  mode: row.data.publication.mode } : null };
        }) };
      });
      const total = db.prepare("SELECT count(*) AS count FROM operations WHERE kind LIKE 'DEPLOYMENT_%'").get().count;
      const operations = db.prepare("SELECT * FROM operations WHERE kind LIKE 'DEPLOYMENT_%' ORDER BY rowid DESC LIMIT ? OFFSET ?")
        .all(limit, operationsOffset).map(row => ({ ...operation(row.id), input: JSON.parse(row.input) }));
      return { schema: 'stellar-forge.seatable-deployment-status.v1', directory: deploymentDirectory,
        releaseDirectory, sourceVersions, publisher, operations,
        pages: { limit, runsOffset, operationsOffset, operationsTotal: total },
        console: deploymentOwnership(), native: await nativeDeploymentState() };
    }
    function versionForPublication(publisher, runId, versionId) {
      const selected = version(versionId), run = publisher.run(runId), plan = publisher.plan(run.plan);
      if (plan.data.sourceHash !== selected.sourceSha256 ||
          run.data?.candidate?.extraction?.observation?.capture?.manifestSha256 !== selected.observationSha256)
        throw fault('SEATABLE_DEPLOYMENT_SOURCE_VERSION_CHANGED', 'Choose the source version that produced this original publication.', 409);
      return selected;
    }
    async function performDeploymentReview(input, request) {
      const result = await withPublisher(async publisher => {
        versionForPublication(publisher, input.runId, input.versionId);
        return reviewSeaTableDeployment({ publisher, runId: input.runId, terms: input.terms });
      });
      return { ...result, authoringVersion: input.versionId, reviewRequestId: request };
    }
    async function reviewDeployment({ versionId, runId, terms, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      version(versionId); id(runId);
      const input = { versionId, runId, terms };
      return run('DEPLOYMENT_REVIEW', input, requestId, () => performDeploymentReview(input, requestId));
    }
    async function performDeploymentPrepare(input, request) {
      const reviewed = savedDeploymentOperation(input.reviewRequestId, 'DEPLOYMENT_REVIEW');
      if (reviewed.result.reviewSha256 !== input.expectedReviewSha256)
        throw fault('SEATABLE_DEPLOYMENT_REVIEW_CHANGED', 'Select the exact reviewed merchant configuration.', 409);
      await privateDirectory(deploymentDirectory, true);
      await privateDirectory(join(deploymentDirectory, 'packages'), true);
      const result = await withPublisher(async publisher => {
        versionForPublication(publisher, reviewed.input.runId, reviewed.input.versionId);
        return prepareSeaTableDeployment({ publisher,
          runId: reviewed.input.runId, terms: reviewed.input.terms,
          expectedReviewSha256: input.expectedReviewSha256, directory: deploymentPackagePath(request) });
      });
      return { ...result, packageRequestId: request, reviewRequestId: input.reviewRequestId };
    }
    async function prepareDeployment({ reviewRequestId, expectedReviewSha256, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      const input = { reviewRequestId: id(reviewRequestId), expectedReviewSha256: hashValue(expectedReviewSha256) };
      return run('DEPLOYMENT_PREPARE', input, requestId, () => performDeploymentPrepare(input, requestId));
    }
    async function inspectDeploymentPackage(packageRequestId) {
      const saved = savedDeploymentOperation(packageRequestId, 'DEPLOYMENT_PREPARE');
      const inspected = await inspectSeaTableDeployment(deploymentPackagePath(packageRequestId));
      if (inspected.sourceSha256 !== saved.result.sourceSha256 || inspected.candidateDigest !== saved.result.candidateDigest)
        throw fault('SEATABLE_DEPLOYMENT_PACKAGE_CHANGED');
      return { ...inspected, packageRequestId };
    }
    async function performDeploymentStage(input,requestId) {
      const prepared = await inspectDeploymentPackage(input.packageRequestId);
      if (prepared.sourceSha256 !== input.expectedSourceSha256) throw fault('SEATABLE_DEPLOYMENT_PACKAGE_CHANGED');
      const staged=await stageSeaTableDeployment({ packageDirectory: deploymentPackagePath(input.packageRequestId),
        releaseDirectory, id: input.id, label: input.label, runtime: input.runtime,
        expectedSourceSha256: input.expectedSourceSha256 });
      const installation=await installSeaTableReceivedRelease(directory,input.id,requestId);
      return{...staged,packageRequestId:input.packageRequestId,...(installation?{installation}: {})};
    }
    async function stageDeployment({ packageRequestId, expectedSourceSha256, id: releaseId, label, runtime = { port: 0 }, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      const input = { packageRequestId: id(packageRequestId), expectedSourceSha256: hashValue(expectedSourceSha256),
        id: releaseId, label: label ?? releaseId, runtime };
      return run('DEPLOYMENT_STAGE', input, requestId, () => performDeploymentStage(input,requestId));
    }
    async function openDeploymentConsole({ requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      return run('DEPLOYMENT_CONSOLE_OPEN', {}, requestId, async () => {
        if (!deploymentService) {
          await privateDirectory(deploymentDirectory, true);
          const { initReleaseStore, readReleaseState } = await import('../../../sf82-seller-pilot/releases.mjs');
          const { startReleaseConsole } = await import('../../../sf82-seller-pilot/release-console.mjs');
          // Reopen the same original store. A partial or invalid retained store is not a new store.
          if (await absent(releaseDirectory)) await initReleaseStore(releaseDirectory);
          else await readReleaseState(releaseDirectory);
          deploymentService = { id: randomUUID(), native: await startReleaseConsole(releaseDirectory, { port: 0, env: environment }) };
        }
        return deploymentOwnership();
      });
    }
    async function closeDeploymentConsole({ instanceId, requestId, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      const input = { instanceId: id(instanceId) };
      return run('DEPLOYMENT_CONSOLE_CLOSE', input, requestId, async () => {
        if (deploymentService && deploymentService.id !== input.instanceId)
          throw fault('SEATABLE_DEPLOYMENT_CONSOLE_CHANGED', 'Close only the current deployment console instance.', 409);
        if (deploymentService) {
          const selected = deploymentService; await selected.native.close();
          if (deploymentService === selected) deploymentService = null;
        }
        return { running: false, instanceId: input.instanceId };
      });
    }
    async function compareDeployment({ from = null, to, ...extra }) {
      if (Object.keys(extra).length) throw fault('SEATABLE_DEPLOYMENT_INPUT_INVALID');
      assertOpen();
      const { compareReleases, readReleaseState } = await import('../../../sf82-seller-pilot/releases.mjs');
      const state = await readReleaseState(releaseDirectory);
      return { generation: state.generation, ...await compareReleases(releaseDirectory, from ?? state.active, to) };
    }
    async function commandDeployment({ action, consoleInstanceId, expectedGeneration, expectedDigest, instanceId,
      id: releaseId, to, reason, receiving, requestId, ...extra }) {
      if (Object.keys(extra).length || !['activate', 'rollback', 'run', 'stop', 'restart'].includes(action))
        throw fault('SEATABLE_DEPLOYMENT_ACTION_INVALID');
      id(consoleInstanceId); integer(expectedGeneration, 'Use the current original selection generation.');
      if (['stop', 'restart'].includes(action)) id(instanceId);
      if (action !== 'stop') hashValue(expectedDigest);
      const input = { action, consoleInstanceId, expectedGeneration,
        ...(expectedDigest === undefined ? {} : { expectedDigest }),
        ...(instanceId === undefined ? {} : { instanceId }), ...(releaseId === undefined ? {} : { id: releaseId }),
        ...(to === undefined ? {} : { to }), ...(reason === undefined ? {} : { reason }),
        ...(receiving === undefined ? {} : { receiving }) };
      return run('DEPLOYMENT_COMMAND', input, requestId, async () => {
        if (!deploymentService || deploymentService.id !== input.consoleInstanceId)
          throw fault('SEATABLE_DEPLOYMENT_CONSOLE_CHANGED', 'Use the current original deployment console instance.', 409);
        const current = await consoleRequest('GET', '/api/status');
        if (current.console.busy) throw fault('SEATABLE_DEPLOYMENT_BUSY', 'The original deployment action is still running.', 409);
        if (current.state.generation !== expectedGeneration) throw fault('SEATABLE_DEPLOYMENT_SELECTION_CHANGED', 'Refresh and compare the current release selection.', 409);
        if (action !== 'stop') {
          const selectedId = action === 'activate' ? releaseId : action === 'rollback' ? to ?? current.state.previous : current.state.active;
          const { inspectRelease } = await import('../../../sf82-seller-pilot/releases.mjs');
          const selected = await inspectRelease(releaseDirectory, selectedId);
          if (selected.digest !== expectedDigest) throw fault('SEATABLE_DEPLOYMENT_RELEASE_CHANGED', 'Use the exact inspected release digest.', 409);
        }
        const { action: _, consoleInstanceId: __, expectedDigest: ___, ...native } = input;
        const result = await consoleRequest('POST', '/api/' + action, native);
        return { mode: 'ORIGINAL_CONSOLE_REPLY', action, requestId, consoleInstanceId, native: result };
      });
    }
    async function recoverDeploymentCommand(row, input) {
      const native = await nativeDeploymentState();
      if (native?.console?.busy) throw fault('DEPLOYMENT_COMMAND_STILL_RUNNING', 'The original console is still completing its action. Check this same request again.', 409);
      return { mode: 'OBSERVED_ORIGINAL_STATE', action: input.action, requestId: row.id,
        originalConsoleInstanceId: input.consoleInstanceId, currentConsole: deploymentOwnership(),
        commandReplayed: false, native,
        observation: 'The current original release state is retained here. This recovery did not repeat the uncertain command or infer a historical result.' };
    }
    async function deploymentFile(packageRequestId, filename) {
      await inspectDeploymentPackage(packageRequestId);
      return readSeaTableDeploymentFile(deploymentPackagePath(packageRequestId), filename);
    }



    async function resume(request) {
      id(request);
      const row = db.prepare('SELECT * FROM operations WHERE id=?').get(request);
      if (!row) throw fault('SEATABLE_OPERATION_NOT_FOUND', 'No retained request has this identifier.', 404);
      if (row.status === 'complete') return JSON.parse(row.result);
      if (row.status === 'failed') { const issue = JSON.parse(row.error); throw fault(issue.code, issue.message, issue.status); }
      if (pending) throw fault('SEATABLE_AUTHORING_BUSY', 'Wait for the active original operation.', 409);
      const input = JSON.parse(row.input);
      return run(row.kind, input, request, async () => {
        if (row.kind === 'DISCOVER') return performDiscover(input, request, false);
        if (row.kind === 'IMPORT') return performImport(input, request);
        if (row.kind === 'CAPTURE') return performCapture(input, request, false);
        if (row.kind === 'VERSION') return performVersion(input, request);
        if (row.kind === 'SELECT') return installSelection(version(input.versionId), input.expectedSelectedVersion);
        if (row.kind === 'DRAFT') return transaction(() => {
          const state = current();
          if (state.draftRevision === input.expectedRevision + 1 && identity(state.draft) === identity(input.draft))
            return { draft: state.draft, draftRevision: state.draftRevision };
          if (state.draftRevision !== input.expectedRevision) throw fault('SEATABLE_DRAFT_CHANGED', 'Reload the current draft.', 409);
          state.draft = input.draft; state.draftRevision++; setState(state);
          return { draft: state.draft, draftRevision: state.draftRevision };
        });
        if (row.kind === 'PREVIEW') return performPreview(input, request);
        if (row.kind === 'DEPLOYMENT_REVIEW') return performDeploymentReview(input, request);
        if (row.kind === 'DEPLOYMENT_PREPARE') return performDeploymentPrepare(input, request);
        if (row.kind === 'DEPLOYMENT_STAGE') return performDeploymentStage(input,request);
        if (row.kind === 'DEPLOYMENT_COMMAND') return recoverDeploymentCommand(row, input);
        if (row.kind === 'DEPLOYMENT_CONSOLE_OPEN') return { ...deploymentOwnership(), observedOwnership: true };
        if (row.kind === 'DEPLOYMENT_CONSOLE_CLOSE') {
          if (deploymentService?.id === input.instanceId) {
            const selected = deploymentService; await selected.native.close();
            if (deploymentService === selected) deploymentService = null;
          }
          return { ...deploymentOwnership(), originalInstanceId: input.instanceId, observedOwnership: true };
        }
        if (row.kind === 'PUBLISHER') return { running: Boolean(publisherService), url: publisherService?.url ?? null,
          observedOwnership: true, sourceVersion: current().selectedVersion,
          publisherDirectory: settings.publisherDirectory };
        if (row.kind === 'STOP_PUBLISHER') {
          if (publisherService) { const service = publisherService; await service.close(); if (publisherService === service) publisherService = null; }
          return { running: false };
        }
        throw fault('SEATABLE_OPERATION_INTERRUPTED', 'Inspect the original saved operation.', 409);
      }, true);
    }


    function ownCleanup(issue){if(issue?.seaTableCleanup)cleanupOwners.add(issue.seaTableCleanup);return issue;}
    async function drainCleanup(){for(const owner of [...cleanupOwners]){await owner.close();cleanupOwners.delete(owner);}}
    function transfer(kind,requestId,action){
      assertOpen();if(pending)throw fault('SEATABLE_AUTHORING_BUSY','The current original workspace operation is still running.',409);
      const active={id:requestId,kind,completion:null};pending=active;
      active.completion=Promise.resolve().then(drainCleanup).then(action).catch(e=>{throw ownCleanup(e);}).finally(()=>{if(pending===active)pending=null;});
      return active.completion;
    }
    async function frozen(action){
      return serializePublisherAccess(async()=>{
        // This explicit handover action stops only services owned by this workspace.
        if(publisherService){const service=publisherService;await service.close();if(publisherService===service)publisherService=null;}
        if(deploymentService){const service=deploymentService;await service.native.close();if(deploymentService===service)deploymentService=null;}
        let publisherLease,datasetLease;let primary;
        try{
          if(!await absent(settings.publisherDirectory))publisherLease=await acquireWorkspace(settings.publisherDirectory);
          if(!await absent(settings.targetDirectory))datasetLease=acquireDatasetLease(settings.targetDirectory);
          return !await absent(releaseDirectory)?await withStoppedReleaseCopy(releaseDirectory,action):await action();
        }catch(e){primary=e;throw e;}
        finally{
          const retained={async close(){if(datasetLease){await datasetLease.close();datasetLease=null;}if(publisherLease){await publisherLease();publisherLease=null;}}};
          try{await retained.close();}catch(e){cleanupOwners.add(retained);if(primary){Object.defineProperty(primary,'seaTableCleanup',{value:retained,configurable:true});}else throw e;}
        }
      });
    }
    function handoverSource(){const state=current();return {directory,draftRevision:state.draftRevision,selectedVersion:state.selectedVersion,
      selectionRevision:state.selectionRevision,historyRevision:Number(db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM events').get().n),createdAt:settings.createdAt};}
    function handoverCounts(){return Object.fromEntries(['captures','discoveries','previews','versions','operations','events'].map(name=>[name,
      Number(db.prepare('SELECT count(*) AS n FROM '+name).get().n)]));}
    function exportWorkspace(input){input=structuredClone(input);if(!object(input)||Object.keys(input).some(k=>!['requestId','expectedDraftRevision','expectedSelectedVersion'].includes(k)))throw fault('SEATABLE_WORKSPACE_EXPORT_INPUT');return transfer('WORKSPACE_EXPORT',input.requestId,async()=>{
      const invoke=()=>createSeaTableWorkspaceHandover({directory,settings:structuredClone(settings),source:handoverSource(),counts:handoverCounts(),...input});
      const original=await workspaceTransferStatus(directory,'exports',input.requestId);
      if(!original){const selected=handoverSource();if(selected.draftRevision!==input.expectedDraftRevision||selected.selectedVersion!==input.expectedSelectedVersion)
        throw fault('SEATABLE_WORKSPACE_REVIEW_CHANGED','Review the current draft and selected version.',409);}
      // Exact accepted replay verifies and returns its immutable file before any service stop.
      return original?.status==='complete'?invoke():frozen(invoke);
    });}
    function receiveWorkspaceFile(input){input=structuredClone(input);if(!object(input)||Object.keys(input).some(k=>!['requestId','archiveFile','expectedSha256','name'].includes(k)))throw fault('SEATABLE_WORKSPACE_RECEIVE_INPUT');return transfer('WORKSPACE_RECEIVE',input.requestId,()=>receiveSeaTableWorkspaceFile({directory,...input}));}
    async function receiveWorkspace(input){input=structuredClone(input);const {requestId,uploadId,expectedSha256,name,...extra}=input;
      if(Object.keys(extra).length)throw fault('SEATABLE_WORKSPACE_RECEIVE_INPUT');
      return transfer('WORKSPACE_RECEIVE',requestId,async()=>{const selected=await completedWorkspaceUpload(directory,uploadId,expectedSha256);
        return receiveSeaTableWorkspaceFile({directory,requestId,name,archiveFile:selected.path,expectedSha256});});}
    async function closeReceivedWorkspace(name){workspaceName(name);const child=receivedChildren.get(name);if(!child)return{closed:true,name};
      await child.service.close();if(receivedChildren.get(name)===child)receivedChildren.delete(name);return{closed:true,name};}
    function openReceivedWorkspace(name){
      workspaceName(name);assertOpen();
      const existing=receivedChildren.get(name);
      if(existing)return Promise.resolve({name,url:existing.service.url,workspaceIdentity:existing.record.workspaceIdentity,directory:existing.record.directory});
      return transfer('WORKSPACE_OPEN',name,async()=>{
        let model,service;
        try{
          const record=(await receivedSeaTableWorkspaces(directory)).find(r=>r.name===name);
          if(!record)throw fault('SEATABLE_WORKSPACE_RECEIVED_MISSING',undefined,404);
          const receipt=await workspaceTransferStatus(directory,'receives',record.requestId);
          if(receipt?.status!=='complete')throw fault('SEATABLE_WORKSPACE_RECEIVE_NOT_COMPLETE',undefined,409);
          model=await openSeaTableAuthoring({directory:record.directory,connections,environment,seller,resource});
          if(lifetime.signal.aborted||closing)throw fault('SEATABLE_AUTHORING_CLOSED');
          const {serveSeaTableAuthoring}=await import('./server.mjs');
          service=await serveSeaTableAuthoring({workspace:model,port:0});
          if(lifetime.signal.aborted||closing)throw fault('SEATABLE_AUTHORING_CLOSED');
          receivedChildren.set(name,{model,service,record});
          return{name,url:service.url,workspaceIdentity:record.workspaceIdentity,directory:record.directory};
        }catch(e){
          const owner=service??model??e.seaTableCleanup;
          if(owner){const retained={close:()=>owner.close()};cleanupOwners.add(retained);try{await retained.close();cleanupOwners.delete(retained);}catch(cleanup){e.cleanupCode=cleanup.code??'SEATABLE_CLOSE_FAILED';}}
          throw e;
        }
      });
    }
    async function withReceivedWorkspace(name,action){
      await openReceivedWorkspace(name);
      return transfer('WORKSPACE_USE',name,async()=>{
        const child=receivedChildren.get(name);
        if(!child)throw fault('SEATABLE_WORKSPACE_RECEIVED_MISSING',undefined,404);
        return action(child);
      });
    }

    // Reopening never repeats a provider call or starts a publication/service.
    db.prepare("UPDATE operations SET status='interrupted',updated=? WHERE status='pending'").run(stamp());
    for (const row of db.prepare("SELECT id FROM operations WHERE status='interrupted' AND kind IN ('VERSION','SELECT')").all())
      await resume(row.id).catch(() => {});
    return {
      directory, settings, exportWorkspace,receiveWorkspace,receiveWorkspaceFile,openReceivedWorkspace,closeReceivedWorkspace,withReceivedWorkspace,
      workspaceExports:async()=> (await workspaceTransferList(directory,'exports')).filter(r=>r.status==='complete').map(r=>r.result),
      exportWorkspaceFile:id=>seaTableWorkspaceHandoverFile(directory,id),
      workspaceExportStatus:id=>workspaceTransferStatus(directory,'exports',id),
      workspaceReceiveStatus:id=>workspaceTransferStatus(directory,'receives',id),
      receivedWorkspaces:()=>receivedSeaTableWorkspaces(directory),
      workspaceUploadStatus:id=>workspaceUploadStatus(directory,id),
      startWorkspaceUpload:input=>{input=structuredClone(input);return transfer('WORKSPACE_UPLOAD',input.requestId,()=>startWorkspaceUpload(directory,input));},
      appendWorkspaceUpload:(id,offset,chunk)=>{chunk=Buffer.from(chunk);return transfer('WORKSPACE_UPLOAD',id,()=>appendWorkspaceUpload(directory,id,offset,chunk));},
      finishWorkspaceUpload:id=>transfer('WORKSPACE_UPLOAD',id,()=>finishWorkspaceUpload(directory,id)),
      discover, discovery: discoveryRecord, importSource, importPacket, readLive,
      inspectCapture, saveDraft, preview, saveVersion, selectVersion, exportVersion, exportCapture, captureAttempt, compareVersions,
      openPublisher, withOpenPublisher, resume, operation, version, deploymentStatus, reviewDeployment, prepareDeployment,
      inspectDeploymentPackage, stageDeployment, openDeploymentConsole, closeDeploymentConsole,
      compareDeployment, commandDeployment, deploymentFile,
      async status({ capturesOffset = 0, versionsOffset = 0, discoveriesOffset = 0, limit = 25 } = {}) {
        for (const value of [capturesOffset, versionsOffset, discoveriesOffset]) integer(value, 'Use a nonnegative result offset.');
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw fault('SEATABLE_PAGE_LIMIT_INVALID');
        assertOpen(); const state = current();
        const previewRow = db.prepare('SELECT data FROM previews ORDER BY rowid DESC LIMIT 1').get();
        const preview = previewRow ? JSON.parse(previewRow.data) : null;
        return { schema: SCHEMA, directory, ...state, connections: connectionViews(connections, environment),
          discoveries: db.prepare('SELECT data FROM discoveries ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit, discoveriesOffset).map(row => JSON.parse(row.data)),
          captures: db.prepare('SELECT data FROM captures ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit, capturesOffset).map(row => JSON.parse(row.data)),
          versions: db.prepare('SELECT * FROM versions ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, versionsOffset).map(row => ({ id: row.id, requestId: row.request_id, ...JSON.parse(row.data) })),
          pages: { limit, capturesOffset, versionsOffset, discoveriesOffset,
            capturesTotal: db.prepare('SELECT count(*) AS count FROM captures').get().count,
            versionsTotal: db.prepare('SELECT count(*) AS count FROM versions').get().count,
            discoveriesTotal: db.prepare('SELECT count(*) AS count FROM discoveries').get().count },
          preview: preview?.draftRevision === state.draftRevision ? preview : null,
          active: pending ? { id: pending.id, kind: pending.kind } : null,
          operations: db.prepare('SELECT id FROM operations ORDER BY rowid DESC LIMIT 25').all().map(row => {
            const { result, ...summary } = operation(row.id); return summary;
          }),
          deployment: deploymentOwnership(),
          publisher: { running: Boolean(publisherService), url: publisherService?.url ?? null,
            directory: settings.publisherDirectory, sourceFile: settings.sourceFile, targetDirectory: settings.targetDirectory },
        };
      },
      closePublisher({ requestId }) { return run('STOP_PUBLISHER', {}, requestId, () => serializePublisherAccess(async () => {
        if (publisherService) { const service = publisherService; await service.close(); if (publisherService === service) publisherService = null; }
        return { running: false };
      })); },
      close() {
        if(closed)return Promise.resolve();
        if(closing)return closing;
        const attempt=(async()=>{
          lifetime.abort();
          if(pending)await pending.completion.catch(()=>{});
          await publisherAccess;
          for(const name of [...receivedChildren.keys()])await closeReceivedWorkspace(name);
          await drainCleanup();
          if(publisherService){await publisherService.close();publisherService=null;}
          if(deploymentService){await deploymentService.native.close();deploymentService=null;}
          if(!dbClosed){db.close();dbClosed=true;}
          if(!leaseClosed){await release();leaseClosed=true;}
          closed=true;
        })();
        closing=attempt;attempt.catch(()=>{if(closing===attempt)closing=null;});return attempt;
      },
    };
   } catch (issue) {
    const retained={async close(){if(db&&!dbClosed){db.close();dbClosed=true;}if(!leaseClosed){await release();leaseClosed=true;}}};
    try{await retained.close();}catch(cleanup){Object.defineProperty(issue,'seaTableCleanup',{value:retained,enumerable:false,configurable:true});issue.cleanupCode=cleanup.code??'SEATABLE_CLOSE_FAILED';}
    throw issue;
  }
}

