// MIT. Exact, resumable SeaTable reads and complete immutable capture portability.
import { dirname, join, resolve } from 'node:path';
import { mkdir, readdir, rename, lstat, unlink, rmdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { object, bytes, digest, identity, readPrivate, privateDirectory, syncDirectory, acquireWorkspace, fault, stamp } from '../postgres/publisher/files.mjs';
import { MAX_CAPTURE_BYTES, MAX_PAGE_BYTES, HASH, SCALAR_TYPES, binding, sourceSelection, compileQueries, integer, only, identifier, restOptions } from './declaration.mjs';
import { createSeaTableReader, metadataRequest, serverInfoRequest, sqlRequest, rowsRequest, checkedHeaders,
  inspectTableBytes, inspectServerInfoBytes, modeOf, responseKind } from './http.mjs';
import { parseSeaTableRecords, parseSeaTableCount, recordIdentity, identityDigest, projectedSeaTableValue } from './values.mjs';

const MANIFEST_LIMIT = 16777216;
const PAGE_NAME = number => 'page-' + String(number).padStart(6, '0');
const FILE = name => 'resources/' + name + '/body.json';
const json = content => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
  catch { throw fault('SEATABLE_CAPTURE_JSON_INVALID'); }
};
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
async function exists(path) { try { await lstat(path); return true; } catch (issue) { if (issue.code === 'ENOENT') return false; throw issue; } }
async function completeFile(path, content) {
  if (await exists(path)) {
    const old = await readPrivate(path, Math.max(content.length, MANIFEST_LIMIT));
    if (!old.equals(content)) throw fault('SEATABLE_RETAINED_MEMBER_CHANGED', 'An existing private member belongs to different bytes; it was preserved.');
    return;
  }
  const temp = join(dirname(path), '.write-' + randomUUID());
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  // All callers hold the directory's original kernel lease. A complete temporary
  // file becomes visible in one rename; incomplete writes never occupy the member.
  if (await exists(path)) {
    const old = await readPrivate(path, Math.max(content.length, MANIFEST_LIMIT));
    if (!old.equals(content)) throw fault('SEATABLE_RETAINED_MEMBER_CHANGED');
    await unlink(temp); return;
  }
  await rename(temp, path); await syncDirectory(dirname(path));
}
async function discardUnpublished(dir) {
  // Only this writer's unpublished names are eligible, under its exclusive lease.
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (/^\.write-[a-f0-9-]{36}$/.test(entry.name) && entry.isFile()) await unlink(join(dir, entry.name));
    if (/^\.step-[a-z0-9-]+-[a-f0-9-]{36}$/.test(entry.name) && entry.isDirectory()) {
      const stage = join(dir, entry.name), leaves = await readdir(stage, { withFileTypes: true });
      if (leaves.some(item => !item.isFile() || !['body.json', 'receipt.json'].includes(item.name))) throw fault('SEATABLE_UNPUBLISHED_STAGE_CHANGED');
      // A complete receipt is the durable result of this original request. Leave
      // it for that exact step's request/size/hash reconciliation before reading.
      // A crash during the receipt write has no complete binding and can resume.
      if (leaves.length === 2) {
        let completeReceipt = true;
        try { json(await readPrivate(join(stage, 'receipt.json'), MANIFEST_LIMIT)); }
        catch (issue) {
          if (issue.code !== 'SEATABLE_CAPTURE_JSON_INVALID') throw issue;
          completeReceipt = false;
        }
        if (completeReceipt) continue;
      }
      for (const item of leaves) await unlink(join(stage, item.name));
      await rmdir(stage);
    }
  }
}
async function reconcileStagedStep(root, name, request) {
  const prefix = '.step-' + name + '-', target = join(root, name);
  const candidates = (await readdir(root, { withFileTypes: true })).filter(entry =>
    entry.name.startsWith(prefix) && /^[a-f0-9-]{36}$/.test(entry.name.slice(prefix.length)));
  let accepted = null;
  if (await exists(target)) {
    await privateDirectory(target);
    const receipt = json(await readPrivate(join(target, 'receipt.json'), MANIFEST_LIMIT));
    checkedDescriptor(receipt, name, request);
    const content = await readPrivate(join(target, 'body.json'), MAX_PAGE_BYTES);
    if (content.length !== receipt.bytes || digest(content) !== receipt.sha256) throw fault('SEATABLE_RETAINED_STEP_CHANGED');
    accepted = { receipt, content };
  }
  for (const entry of candidates) {
    if (!entry.isDirectory()) throw fault('SEATABLE_UNPUBLISHED_STAGE_CHANGED');
    const stage = join(root, entry.name); await privateDirectory(stage);
    const leaves = await readdir(stage, { withFileTypes: true });
    if (leaves.length !== 2 || leaves.some(item => !item.isFile() || !['body.json', 'receipt.json'].includes(item.name)))
      throw fault('SEATABLE_UNPUBLISHED_STAGE_CHANGED');
    const receipt = json(await readPrivate(join(stage, 'receipt.json'), MANIFEST_LIMIT));
    checkedDescriptor(receipt, name, request);
    const content = await readPrivate(join(stage, 'body.json'), MAX_PAGE_BYTES);
    if (content.length !== receipt.bytes || digest(content) !== receipt.sha256) throw fault('SEATABLE_RETAINED_STEP_CHANGED');
    if (accepted) {
      if (identity(receipt) !== identity(accepted.receipt) || !content.equals(accepted.content))
        throw fault('SEATABLE_STAGED_STEP_CONFLICT', 'Different retained observations occupy this step. All bytes were preserved; no new provider request was made.');
      await unlink(join(stage, 'body.json')); await unlink(join(stage, 'receipt.json')); await rmdir(stage);
    } else {
      // The original kernel lease excludes another capture writer. Publish only
      // this exact already-received step; a later resume reads the same target.
      await rename(stage, target);
      accepted = { receipt, content };
    }
    await syncDirectory(root);
  }
}
function selectionShape(value) {
  only(value, ['server', 'apiVersion', 'baseId', 'tableId', 'viewId', 'where', 'sourceOrder', 'fields'], 'SEATABLE_CAPTURE_SELECTION_INVALID');
  if (!Array.isArray(value.fields) || !value.fields.length || value.fields.length > 2048) throw fault('SEATABLE_CAPTURE_FIELDS_INVALID');
  const ids = new Set();
  for (const field of value.fields) {
    only(field, ['id', 'type'], 'SEATABLE_CAPTURE_FIELDS_INVALID'); identifier(field.id, 'FIELD_ID');
    if (!SCALAR_TYPES.has(field.type) || ids.has(field.id) || field.id === '_id') throw fault('SEATABLE_CAPTURE_FIELDS_INVALID');
    ids.add(field.id);
  }
  const normalized = { ...binding(value), fields: value.fields };
  if (identity(normalized) !== identity(value)) throw fault('SEATABLE_CAPTURE_SELECTION_INVALID');
  return value;
}
function descriptor(name, observed) {
  return { file: FILE(name), bytes: observed.content.length, sha256: digest(observed.content),
    receivedAt: observed.receivedAt, request: observed.request, headers: observed.headers };
}
function checkedDescriptor(value, name, expectedRequest) {
  only(value, ['file', 'bytes', 'sha256', 'receivedAt', 'request', 'headers'], 'SEATABLE_CAPTURE_RESOURCE_INVALID');
  if (value.file !== FILE(name) || !HASH.test(value.sha256 ?? '') || !validTime(value.receivedAt) ||
      identity(value.request) !== identity(expectedRequest)) throw fault('SEATABLE_CAPTURE_REQUEST_CHANGED');
  integer(value.bytes, 1, MAX_PAGE_BYTES, 'SEATABLE_CAPTURE_RESOURCE_SIZE_INVALID'); checkedHeaders(value.headers);
}
function pageRecords(response, selection, table, seen, accumulated, maximum, requestedLimit) {
  if (response.records.length > requestedLimit) throw fault('SEATABLE_PROVIDER_PAGE_LIMIT_CHANGED');
  const selected = new Map(selection.fields.map(field => [field.id, field.type]));
  if (modeOf(selection) === 'sql') {
    if (!Array.isArray(response.metadata)) throw fault('SEATABLE_SQL_METADATA_REQUIRED');
    const meta = new Map();
    for (const field of response.metadata) {
      if (!object(field) || typeof field.key !== 'string' || meta.has(field.key)) throw fault('SEATABLE_SQL_METADATA_INVALID');
      meta.set(field.key, field);
    }
    for (const [key, type] of selected) if (!meta.has(key) || meta.get(key).type !== type) throw fault('SEATABLE_SQL_FIELD_TYPE_CHANGED');
  }
  const visible = new Set(table.fields.filter(field => !(table.view?.hidden_columns ?? []).includes(field.id)).map(field => field.id));
  const native = new Set(['_id', '_mtime', '_ctime', '_creator', '_last_modifier', '_locked', '_locked_by', '_archived']);
  for (const row of response.records) {
    const id = recordIdentity(row);
    if (seen.has(id)) throw fault('SEATABLE_DUPLICATE_RECORD_ID', 'The native paged read repeated a row. Retain this incomplete capture and choose a fresh read after the source settles.');
    seen.add(id);
    for (const key of selected.keys()) if (!Object.hasOwn(row.fields, key)) throw fault('SEATABLE_SELECTED_FIELD_MISSING', 'The current protocol returns an explicit null for an empty cell. A missing selected key must be reviewed.');
    const allowed = modeOf(selection) === 'sql' ? selected : visible;
    if (Object.keys(row.fields).some(key => !native.has(key) && !allowed.has(key))) throw fault('SEATABLE_PROVIDER_PROJECTION_CHANGED');
    accumulated.push(row);
    if (accumulated.length > maximum) throw fault('SEATABLE_CAPTURE_TOO_MANY_ROWS');
  }
}
function checkSameSource(before, after, firstServer, lastServer) {
  if (before.schemaSha256 !== after.schemaSha256) throw fault('SEATABLE_SCHEMA_CHANGED_DURING_CAPTURE');
  if (before.metadataVersion !== after.metadataVersion) throw fault('SEATABLE_BASE_VERSION_CHANGED_DURING_CAPTURE', 'The original base version changed across the read. Its received bytes remain intact; select a fresh capture after concurrent edits settle.');
  if (identity(firstServer) !== identity(lastServer)) throw fault('SEATABLE_SERVER_CHANGED_DURING_CAPTURE');
}
function manifestDescriptors(manifest) {
  return [manifest.serverBefore, manifest.tableBefore, ...(manifest.countBefore ? [manifest.countBefore] : []),
    ...manifest.pages, ...(manifest.countAfter ? [manifest.countAfter] : []), manifest.tableAfter, manifest.serverAfter];
}
async function validateCapture(manifestBytes, readResource, manifestFile = null, expectedHash) {
  if (!Buffer.isBuffer(manifestBytes) || manifestBytes.length > MANIFEST_LIMIT) throw fault('SEATABLE_CAPTURE_MANIFEST_TOO_LARGE');
  if (expectedHash !== undefined && digest(manifestBytes) !== expectedHash) throw fault('SEATABLE_CAPTURE_MANIFEST_CHANGED');
  const manifest = json(manifestBytes);
  only(manifest, ['schema', 'provider', 'apiVersion', 'transport', 'method', 'readOnly', 'complete', 'responseKind', 'atomicSourceSnapshot',
    'selection', 'selectionSha256', 'startedAt', 'completedAt', 'requestedPageSize', 'serverBefore', 'tableBefore', 'countBefore',
    'pages', 'countAfter', 'tableAfter', 'serverAfter', 'countVerified', 'schemaSha256', 'metadataVersion', 'server',
    'rowCount', 'pageCount', 'sourceBytes', 'recordIdentitiesSha256', 'terminalEmptyPage'], 'SEATABLE_CAPTURE_MANIFEST_INVALID');
  if (manifest.schema !== 'stellar-forge.seatable-capture.v1' || manifest.provider !== 'seatable' || manifest.apiVersion !== 'v2' ||
      manifest.transport !== 'seatable-rest' || manifest.readOnly !== true || manifest.complete !== true ||
      manifest.atomicSourceSnapshot !== false || manifest.terminalEmptyPage !== true ||
      !HASH.test(manifest.schemaSha256 ?? '') || !HASH.test(manifest.recordIdentitiesSha256 ?? '') ||
      !validTime(manifest.startedAt) || !validTime(manifest.completedAt) || Date.parse(manifest.startedAt) > Date.parse(manifest.completedAt))
    throw fault('SEATABLE_CAPTURE_MANIFEST_INVALID');
  const selection = selectionShape(manifest.selection), sql = modeOf(selection) === 'sql';
  if (identity(selection) !== manifest.selectionSha256 || manifest.responseKind !== responseKind(selection) ||
      manifest.method !== (sql ? 'POST' : 'GET') || manifest.countVerified !== sql ||
      !sql && (manifest.countBefore !== null || manifest.countAfter !== null)) throw fault('SEATABLE_CAPTURE_MODE_CHANGED');
  integer(manifest.requestedPageSize, 1, sql ? 10000 : 1000, 'SEATABLE_CAPTURE_PAGE_SIZE_INVALID');
  integer(manifest.pageCount, 1, 10000, 'SEATABLE_CAPTURE_PAGE_COUNT_INVALID');
  integer(manifest.rowCount, 0, 1000000, 'SEATABLE_CAPTURE_ROW_COUNT_INVALID');
  integer(manifest.sourceBytes, 1, MAX_CAPTURE_BYTES, 'SEATABLE_CAPTURE_BYTES_INVALID');
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== manifest.pageCount) throw fault('SEATABLE_CAPTURE_PAGES_INVALID');
  const resources = new Map(); let total = 0, lastTime = Date.parse(manifest.startedAt);
  const read = async (item, name, request) => {
    checkedDescriptor(item, name, request);
    const time = Date.parse(item.receivedAt);
    if (time < lastTime || time > Date.parse(manifest.completedAt)) throw fault('SEATABLE_CAPTURE_TIME_ORDER_INVALID');
    lastTime = time;
    const content = await readResource(item.file);
    if (!Buffer.isBuffer(content) || content.length !== item.bytes || digest(content) !== item.sha256) throw fault('SEATABLE_CAPTURE_RESOURCE_CHANGED');
    total += content.length;
    if (total > manifest.sourceBytes) throw fault('SEATABLE_CAPTURE_BYTES_CHANGED');
    resources.set(item.file, content); return content;
  };
  const firstServer = inspectServerInfoBytes(await read(manifest.serverBefore, 'server-before', serverInfoRequest(selection)));
  const before = inspectTableBytes(await read(manifest.tableBefore, 'table-before', metadataRequest(selection)), selection, selection.fields);
  const expectedRows = sql ? parseSeaTableCount(await read(manifest.countBefore, 'count-before', sqlRequest(selection, before.table, { count: true }))) : null;
  if (sql && expectedRows !== manifest.rowCount) throw fault('SEATABLE_CAPTURE_COUNT_CHANGED');
  const records = [], seen = new Set(); let offset = 0;
  for (let index = 0; index < manifest.pages.length; index++) {
    const request = sql ? sqlRequest(selection, before.table, { offset, limit: manifest.requestedPageSize }) :
      rowsRequest(selection, { offset, limit: manifest.requestedPageSize });
    const response = parseSeaTableRecords(await read(manifest.pages[index], PAGE_NAME(index + 1), request), sql ? 'sql' : 'view');
    pageRecords(response, selection, before.table, seen, records, manifest.rowCount, manifest.requestedPageSize);
    if (index === manifest.pages.length - 1 ? response.records.length !== 0 : response.records.length === 0) throw fault('SEATABLE_CAPTURE_INCOMPLETE');
    offset += response.records.length;
  }
  if (sql && parseSeaTableCount(await read(manifest.countAfter, 'count-after', sqlRequest(selection, before.table, { count: true }))) !== expectedRows)
    throw fault('SEATABLE_CAPTURE_COUNT_CHANGED');
  const after = inspectTableBytes(await read(manifest.tableAfter, 'table-after', metadataRequest(selection)), selection, selection.fields);
  const lastServer = inspectServerInfoBytes(await read(manifest.serverAfter, 'server-after', serverInfoRequest(selection)));
  checkSameSource(before, after, firstServer, lastServer);
  if (before.schemaSha256 !== manifest.schemaSha256 || before.metadataVersion !== manifest.metadataVersion ||
      identity(firstServer) !== identity(manifest.server) || records.length !== manifest.rowCount ||
      total !== manifest.sourceBytes || identityDigest(records) !== manifest.recordIdentitiesSha256)
    throw fault('SEATABLE_CAPTURE_CONTENT_CHANGED');
  return { manifest, manifestBytes, manifestFile, manifestSha256: digest(manifestBytes), resources, records, table: before.table };
}
export async function readSeaTableCapture(filename, expectedHash) {
  const manifestBytes = await readPrivate(filename, MANIFEST_LIMIT);
  return validateCapture(manifestBytes, file => readPrivate(join(dirname(filename), file), MAX_PAGE_BYTES), filename, expectedHash);
}
export function bindSeaTableCapture(capture, config) {
  if (identity(sourceSelection(config)) !== capture.manifest.selectionSha256)
    throw fault('SEATABLE_CAPTURE_SELECTION_MISMATCH', 'Retain the exact server/base/table/native-view-or-SQL/filter/order and complete field-key/type union. Reviewed aliases and scalar/null policies may change without rereading the provider.');
  return capture.records;
}
export async function captureSeaTableSource(config, directory, { resume = false, ...options } = {}) {
  const queries = compileQueries(config.queries), selection = sourceSelection(config, queries), limits = restOptions(config);
  await privateDirectory(dirname(directory));
  const present = await exists(directory);
  if (present && !resume) throw fault('SEATABLE_CAPTURE_EXISTS', 'Reopen this original capture with explicit resume; a different read needs a new directory.');
  if (!present) await mkdir(directory, { mode: 0o700 });
  await privateDirectory(directory);
  const release = await acquireWorkspace(directory);
  const intentFile = join(directory, 'intent.json');
  let startedAt = stamp(), pages = [], sourceBytes = 0;
  try {
    const intent = { schema: 'stellar-forge.seatable-capture-intent.v1', selection, limits: { ...limits, tokenEnv: undefined, tokenKind: undefined } };
    // Credentials can rotate on resume, while source selection and all read bounds stay pinned.
    if (await exists(intentFile)) {
      const saved = json(await readPrivate(intentFile));
      if (identity(saved.intent) !== identity(intent) || !validTime(saved.startedAt)) throw fault('SEATABLE_CAPTURE_INTENT_CHANGED');
      startedAt = saved.startedAt;
    } else {
      if (present && (await readdir(directory)).some(name => name !== 'publisher.lock' && !/^\.write-[a-f0-9-]{36}$/.test(name))) throw fault('SEATABLE_CAPTURE_DIRECTORY_NOT_OWNED');
      await discardUnpublished(directory);
      await completeFile(intentFile, bytes({ intent, startedAt }));
    }
    await discardUnpublished(directory);
    if (await exists(join(directory, 'capture.json'))) {
      const retained = await readSeaTableCapture(join(directory, 'capture.json')); bindSeaTableCapture(retained, config);
      for (const row of retained.records) for (const query of Object.values(queries)) for (const spec of Object.values(query.projection)) projectedSeaTableValue(row, spec);
      return retained;
    }
    const resourcesRoot = join(directory, 'resources'); await privateDirectory(resourcesRoot, true); await discardUnpublished(resourcesRoot);
    const reader = createSeaTableReader(config, options), resources = new Map(), seen = new Set(), records = [];
    const step = async (name, request) => {
      await reconcileStagedStep(resourcesRoot, name, request);
      const target = join(resourcesRoot, name); let receipt, content;
      if (await exists(target)) {
        await privateDirectory(target);
        receipt = json(await readPrivate(join(target, 'receipt.json'), MANIFEST_LIMIT));
        checkedDescriptor(receipt, name, request);
        content = await readPrivate(join(target, 'body.json'), MAX_PAGE_BYTES);
        if (content.length !== receipt.bytes || digest(content) !== receipt.sha256) throw fault('SEATABLE_RETAINED_STEP_CHANGED');
      } else {
        const observed = await reader.read(request);
        if (sourceBytes + observed.content.length > limits.maxCaptureBytes) throw fault('SEATABLE_CAPTURE_TOO_LARGE');
        content = observed.content; receipt = descriptor(name, observed);
        const stage = join(resourcesRoot, '.step-' + name + '-' + randomUUID()); await mkdir(stage, { mode: 0o700 });
        for (const [filename, body] of [['body.json', content], ['receipt.json', bytes(receipt)]]) {
          const file = await open(join(stage, filename), 'wx', 0o600);
          try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
        }
        await syncDirectory(stage);
        if (await exists(target)) throw fault('SEATABLE_STEP_ALREADY_PRESENT');
        await rename(stage, target); await syncDirectory(resourcesRoot);
      }
      sourceBytes += content.length;
      if (sourceBytes > limits.maxCaptureBytes) throw fault('SEATABLE_CAPTURE_TOO_LARGE');
      resources.set(receipt.file, content); return { receipt, content };
    };
    const firstServerStep = await step('server-before', serverInfoRequest(selection));
    const firstServer = inspectServerInfoBytes(firstServerStep.content);
    const beforeStep = await step('table-before', metadataRequest(selection));
    const before = inspectTableBytes(beforeStep.content, selection, selection.fields), sql = modeOf(selection) === 'sql';
    const beforeCountStep = sql ? await step('count-before', sqlRequest(selection, before.table, { count: true })) : null;
    const expectedRows = sql ? parseSeaTableCount(beforeCountStep.content) : null;
    if (expectedRows !== null && expectedRows > limits.maxRows) throw fault('SEATABLE_CAPTURE_TOO_MANY_ROWS');
    let offset = 0;
    for (let number = 1; ; number++) {
      if (number > limits.maxPages) throw fault('SEATABLE_CAPTURE_TOO_MANY_PAGES');
      const request = sql ? sqlRequest(selection, before.table, { offset, limit: limits.pageSize }) :
        rowsRequest(selection, { offset, limit: limits.pageSize });
      const observed = await step(PAGE_NAME(number), request), response = parseSeaTableRecords(observed.content, sql ? 'sql' : 'view');
      pageRecords(response, selection, before.table, seen, records, expectedRows ?? limits.maxRows, limits.pageSize);
      for (const row of response.records) for (const query of Object.values(queries)) for (const spec of Object.values(query.projection)) projectedSeaTableValue(row, spec);
      pages.push(observed.receipt); offset += response.records.length;
      if (!response.records.length) break; // Retain the actual empty terminal page even after a short page.
    }
    const afterCountStep = sql ? await step('count-after', sqlRequest(selection, before.table, { count: true })) : null;
    if (sql && (records.length !== expectedRows || parseSeaTableCount(afterCountStep.content) !== expectedRows))
      throw fault('SEATABLE_COUNT_CHANGED_DURING_CAPTURE', 'Opening count, complete unique rows and closing count differ. This retained read remains incomplete.');
    const afterStep = await step('table-after', metadataRequest(selection)), after = inspectTableBytes(afterStep.content, selection, selection.fields);
    const lastServerStep = await step('server-after', serverInfoRequest(selection)), lastServer = inspectServerInfoBytes(lastServerStep.content);
    checkSameSource(before, after, firstServer, lastServer);
    const manifest = { schema: 'stellar-forge.seatable-capture.v1', provider: 'seatable', apiVersion: 'v2', transport: 'seatable-rest',
      method: sql ? 'POST' : 'GET', readOnly: true, complete: true, responseKind: responseKind(selection), atomicSourceSnapshot: false,
      selection, selectionSha256: identity(selection), startedAt, completedAt: stamp(), requestedPageSize: limits.pageSize,
      serverBefore: firstServerStep.receipt, tableBefore: beforeStep.receipt, countBefore: beforeCountStep?.receipt ?? null, pages,
      countAfter: afterCountStep?.receipt ?? null, tableAfter: afterStep.receipt, serverAfter: lastServerStep.receipt,
      countVerified: sql, schemaSha256: before.schemaSha256, metadataVersion: before.metadataVersion, server: firstServer,
      rowCount: records.length, pageCount: pages.length, sourceBytes, recordIdentitiesSha256: identityDigest(records), terminalEmptyPage: true };
    const manifestBytes = bytes(manifest);
    const completed = await validateCapture(manifestBytes, file => Promise.resolve(resources.get(file)), join(directory, 'capture.json'));
    await completeFile(join(directory, 'capture.json'), manifestBytes); await syncDirectory(dirname(directory));
    return completed;
  } catch (issue) {
    try {
      if (!await exists(intentFile)) throw issue;
      const failure = { schema: 'stellar-forge.seatable-incomplete-capture.v1', complete: false, startedAt, stoppedAt: stamp(),
        completedPages: pages.length, retainedBytes: sourceBytes, code: issue.code ?? 'SEATABLE_CAPTURE_FAILED',
        providerStatus: issue.providerStatus ?? null, requestId: issue.requestId ?? null, retryAfter: issue.retryAfter ?? null };
      await completeFile(join(directory, 'failure-' + randomUUID() + '.json'), bytes(failure));
    } catch {}
    throw issue;
  } finally { await release(); }
}
export async function copySeaTableCapture(capture, directory, { resume = false } = {}) {
  // Validate the supplied object through exactly the same full original capture reader.
  const verified = await validateCapture(capture.manifestBytes, file => Promise.resolve(capture.resources.get(file)), null, capture.manifestSha256);
  await privateDirectory(dirname(directory));
  const present = await exists(directory);
  if (present && !resume) throw fault('SEATABLE_CAPTURE_COPY_EXISTS');
  if (!present) await mkdir(directory, { mode: 0o700 });
  await privateDirectory(directory); const release = await acquireWorkspace(directory);
  try {
    const intent = bytes({ schema: 'stellar-forge.seatable-capture-copy.v1', manifestSha256: verified.manifestSha256 });
    const intentFile = join(directory, 'copy-intent.json');
    if (!await exists(intentFile) && (await readdir(directory)).some(name => name !== 'publisher.lock' && !/^\.write-[a-f0-9-]{36}$/.test(name)))
      throw fault('SEATABLE_CAPTURE_COPY_DIRECTORY_NOT_OWNED');
    await discardUnpublished(directory); await completeFile(intentFile, intent);
    for (const item of manifestDescriptors(verified.manifest)) {
      const target = join(directory, item.file); await privateDirectory(dirname(target), true);
      await discardUnpublished(dirname(target));
      await completeFile(target, verified.resources.get(item.file));
    }
    await completeFile(join(directory, 'capture.json'), verified.manifestBytes); await syncDirectory(dirname(directory));
    return await readSeaTableCapture(join(directory, 'capture.json'), verified.manifestSha256);
  } finally { await release(); }
}
export async function importSeaTableCapture(filename, directory, config, options = {}) {
  const capture = await readSeaTableCapture(filename); bindSeaTableCapture(capture, config);
  return copySeaTableCapture(capture, directory, options);
}
export async function exportSeaTableCapturePacket(capture) {
  const verified = await validateCapture(capture.manifestBytes, file => Promise.resolve(capture.resources.get(file)), null, capture.manifestSha256);
  return bytes({ schema: 'stellar-forge.seatable-capture-packet.v1',
    manifest: { bytes: verified.manifestBytes.length, sha256: verified.manifestSha256, base64: verified.manifestBytes.toString('base64') },
    resources: manifestDescriptors(verified.manifest).map(item => ({ path: item.file, bytes: item.bytes, sha256: item.sha256,
      base64: verified.resources.get(item.file).toString('base64') })) });
}
export async function readSeaTableCapturePacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > Math.ceil(MAX_CAPTURE_BYTES * 4 / 3) + MANIFEST_LIMIT * 2)
    throw fault('SEATABLE_CAPTURE_PACKET_TOO_LARGE');
  const packet = json(buffer); only(packet, ['schema', 'manifest', 'resources'], 'SEATABLE_CAPTURE_PACKET_INVALID');
  if (packet.schema !== 'stellar-forge.seatable-capture-packet.v1' || !Array.isArray(packet.resources) || packet.resources.length > 10006)
    throw fault('SEATABLE_CAPTURE_PACKET_INVALID');
  const decode = (value, maximum) => {
    if (!object(value) || !HASH.test(value.sha256 ?? '') || typeof value.base64 !== 'string' ||
        !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > maximum ||
        value.base64.length !== 4 * Math.ceil(value.bytes / 3)) throw fault('SEATABLE_PACKET_MEMBER_INVALID');
    const content = Buffer.from(value.base64, 'base64');
    if (content.toString('base64') !== value.base64 || content.length !== value.bytes || digest(content) !== value.sha256)
      throw fault('SEATABLE_PACKET_MEMBER_CHANGED');
    return content;
  };
  only(packet.manifest, ['bytes', 'sha256', 'base64'], 'SEATABLE_CAPTURE_PACKET_INVALID');
  const manifestBytes = decode(packet.manifest, MANIFEST_LIMIT), resources = new Map(); let size = 0;
  for (const item of packet.resources) {
    only(item, ['path', 'bytes', 'sha256', 'base64'], 'SEATABLE_PACKET_RESOURCE_INVALID');
    if (typeof item.path !== 'string' || !/^resources\/(?:server-before|server-after|table-before|table-after|count-before|count-after|page-[0-9]{6})\/body\.json$/.test(item.path) ||
        resources.has(item.path)) throw fault('SEATABLE_PACKET_RESOURCE_INVALID');
    const content = decode(item, MAX_PAGE_BYTES); size += content.length;
    if (size > MAX_CAPTURE_BYTES) throw fault('SEATABLE_CAPTURE_PACKET_TOO_LARGE');
    resources.set(item.path, content);
  }
  const capture = await validateCapture(manifestBytes, file => Promise.resolve(resources.get(file)), null, packet.manifest.sha256);
  if (capture.resources.size !== resources.size) throw fault('SEATABLE_PACKET_EXTRA_RESOURCE');
  return capture;
}
export async function importSeaTableCapturePacket(buffer, directory, config, options = {}) {
  const capture = await readSeaTableCapturePacket(buffer); bindSeaTableCapture(capture, config);
  return copySeaTableCapture(capture, directory, options);
}

/** Read-only progress from committed original step receipts; never exposes tokens or row bodies. */
export async function inspectSeaTableCaptureAttempt(directory) {
  if (!await exists(directory)) return { schema: 'stellar-forge.seatable-capture-attempt.v1', state: 'NOT_STARTED', complete: false };
  await privateDirectory(directory);
  if (await exists(join(directory, 'capture.json'))) {
    const capture = await readSeaTableCapture(join(directory, 'capture.json'));
    return { schema: 'stellar-forge.seatable-capture-attempt.v1', state: 'COMPLETE', complete: true,
      manifestFile: capture.manifestFile, manifestSha256: capture.manifestSha256, responseKind: capture.manifest.responseKind,
      countVerified: capture.manifest.countVerified, rowCount: capture.manifest.rowCount, pageCount: capture.manifest.pageCount,
      sourceBytes: capture.manifest.sourceBytes, startedAt: capture.manifest.startedAt, completedAt: capture.manifest.completedAt };
  }
  const intentFile = join(directory, 'intent.json');
  const saved = await exists(intentFile) ? json(await readPrivate(intentFile)) : null;
  if (saved && (saved.intent?.schema !== 'stellar-forge.seatable-capture-intent.v1' || !validTime(saved.startedAt)))
    throw fault('SEATABLE_CAPTURE_INTENT_INVALID');
  let steps = 0, pages = 0, sourceBytes = 0, lastReceivedAt = null;
  const resourcesRoot = join(directory, 'resources');
  if (await exists(resourcesRoot)) {
    await privateDirectory(resourcesRoot);
    for (const entry of await readdir(resourcesRoot, { withFileTypes: true })) {
      if (entry.name.startsWith('.step-')) continue;
      if (!entry.isDirectory() || !/^(?:server-before|server-after|table-before|table-after|count-before|count-after|page-[0-9]{6})$/.test(entry.name))
        throw fault('SEATABLE_CAPTURE_STEP_INVENTORY_CHANGED');
      const receipt = json(await readPrivate(join(resourcesRoot, entry.name, 'receipt.json'), MANIFEST_LIMIT));
      if (receipt.file !== FILE(entry.name) || !HASH.test(receipt.sha256 ?? '') || !Number.isSafeInteger(receipt.bytes) ||
          receipt.bytes < 1 || receipt.bytes > MAX_PAGE_BYTES || !validTime(receipt.receivedAt)) throw fault('SEATABLE_CAPTURE_STEP_RECEIPT_INVALID');
      steps++; if (entry.name.startsWith('page-')) pages++; sourceBytes += receipt.bytes;
      if (lastReceivedAt === null || receipt.receivedAt > lastReceivedAt) lastReceivedAt = receipt.receivedAt;
    }
  }
  let failure = null;
  for (const name of await readdir(directory)) {
    if (!/^failure-[a-f0-9-]{36}\.json$/.test(name)) continue;
    const value = json(await readPrivate(join(directory, name)));
    if (value.schema !== 'stellar-forge.seatable-incomplete-capture.v1' || !validTime(value.stoppedAt)) throw fault('SEATABLE_CAPTURE_FAILURE_INVALID');
    if (!failure || value.stoppedAt > failure.stoppedAt) failure = value;
  }
  const code = failure?.code ?? null;
  const freshReadRequired = ['SEATABLE_COUNT_CHANGED_DURING_CAPTURE', 'SEATABLE_BASE_VERSION_CHANGED_DURING_CAPTURE',
    'SEATABLE_SCHEMA_CHANGED_DURING_CAPTURE', 'SEATABLE_SERVER_CHANGED_DURING_CAPTURE', 'SEATABLE_DUPLICATE_RECORD_ID'].includes(code);
  return { schema: 'stellar-forge.seatable-capture-attempt.v1', state: 'INCOMPLETE', complete: false,
    responseKind: saved ? responseKind(saved.intent.selection) : null, startedAt: saved?.startedAt ?? null,
    completedSteps: steps, completedPages: pages, retainedBytes: sourceBytes, lastReceivedAt, failure,
    freshReadRequired, resume: freshReadRequired ? 'Retain this original read and select a new capture after source changes settle.' :
      'Explicitly resume the same request and directory; completed original response receipts are reused without new reads.' };
}
