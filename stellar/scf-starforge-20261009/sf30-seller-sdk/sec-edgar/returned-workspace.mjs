// MIT. Complete returned SEC operator branches over the original source and revision writers.
import { open, lstat, readdir, mkdir, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openEdgarStore } from './source.mjs';
import { compileEdgarMerchant } from './config.mjs';
import {
  OPERATOR_ARCHIVE_SCHEMA, MAX_EXPANDED_BYTES, MAX_FILE_BYTES, MAX_MANIFEST_BYTES,
  MAX_MEMBERS, need, digest, encoded, same, revisionName, validateOperatorManifest,
} from './receiving/manifest.mjs';
import {
  realDirectory, exists, pinnedFile, exactFile, selectedPath, decodeJson, syncDirectory,
} from './receiving/storage.mjs';

export const RETURN_SCHEMA = 'stellar-forge.sec-edgar-returned-workspace.v1';
export const REVIEW_SCHEMA = 'stellar-forge.sec-edgar-return-review.v1';
export const APPLICATION_SCHEMA = 'stellar-forge.sec-edgar-return-application.v1';
const REQUEST_SCHEMA = 'stellar-forge.sec-edgar-return-request.v1';
const HASH = /^[a-f0-9]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PRODUCT_FIELDS = ['path', 'description', 'concepts', 'forms', 'maxPageSize', 'example', 'paymentOptions'];
const SOURCE_FIELDS = ['kind', 'cik', 'editionId', 'sourceSha256'];
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (ok, code, message = code) => need(ok, code, message);
const returnId = value => { invalid(typeof value === 'string' && HASH.test(value), 'EDGAR_RETURN_ID_INVALID'); return value; };
const requestId = value => { invalid(typeof value === 'string' && REQUEST.test(value), 'EDGAR_RETURN_REQUEST_ID_INVALID'); return value; };
const slot = (value, key) => value && Object.hasOwn(value, key) ? { present: true, value: clone(value[key]) } : { present: false };
const valueSlot = value => value === undefined ? { present: false } : { present: true, value: clone(value) };
const slotEqual = (a, b) => a.present === b.present && (!a.present || same(a.value, b.value));
const sourceSlot = value => value ? valueSlot(Object.fromEntries(SOURCE_FIELDS.map(key => [key, value[key]]))) : { present: false };
function row(key, label, issued, current, returned, target) {
  const local = !slotEqual(issued, current), incoming = !slotEqual(issued, returned);
  const equal = slotEqual(current, returned);
  return {
    key, label, issued, current, returned, target,
    status: equal ? (local || incoming ? 'converged' : 'same') : local && incoming ? 'conflict' : incoming ? 'returned-only' : 'current-only',
    requiresDecision: incoming && !equal,
  };
}
function productMap(config) {
  const result = new Map();
  for (const item of config?.products ?? []) {
    invalid(object(item) && typeof item.id === 'string' && !result.has(item.id), 'EDGAR_RETURN_PRODUCTS_INVALID');
    result.set(item.id, item);
  }
  return result;
}

/** Pure, missing-aware comparison. Arrays and exact native source selections stay atomic. */
export function compareReturnedEdgarStates({ issued, current, returned }) {
  invalid(issued && current && returned &&
    issued.workspaceId === current.workspaceId && issued.workspaceId === returned.workspaceId,
    'EDGAR_RETURN_WORKSPACE_CHANGED');
  const rows = [], a = issued.config, b = current.config, c = returned.config;
  invalid(b && c, 'EDGAR_RETURN_SAVED_CONFIG_REQUIRED', 'Save an original merchant configuration in both branches before reconciling.');
  for (const key of ['title', 'publicOrigin'])
    rows.push(row('merchant.' + key, key === 'title' ? 'Merchant title' : 'Public merchant origin',
      slot(a, key), slot(b, key), slot(c, key), { kind: 'merchant', field: key }));
  const before = productMap(a), local = productMap(b), incoming = productMap(c);
  const ids = [...new Set([...before.keys(), ...local.keys(), ...incoming.keys()])].sort();
  for (const id of ids) {
    const x = before.get(id), y = local.get(id), z = incoming.get(id);
    if (!x || !y || !z) {
      rows.push(row('product.' + id, 'Product ' + id, valueSlot(x), valueSlot(y), valueSlot(z),
        { kind: 'product-presence', id }));
      continue;
    }
    rows.push(row('product.' + id + '.source', id + ' — original source selection',
      sourceSlot(x), sourceSlot(y), sourceSlot(z), { kind: 'product', id, field: 'source' }));
    for (const field of PRODUCT_FIELDS)
      rows.push(row('product.' + id + '.' + field, id + ' — ' + field,
        slot(x, field), slot(y, field), slot(z, field), { kind: 'product', id, field }));
  }
  rows.push(row('products.order', 'Product order',
    valueSlot((a?.products ?? []).map(p => p.id)), valueSlot(b.products.map(p => p.id)),
    valueSlot(c.products.map(p => p.id)), { kind: 'order' }));
  return {
    rows,
    suggestedOrder: [...new Set([...b.products.map(p => p.id), ...c.products.map(p => p.id)])],
  };
}

/** Resolve only explicit incoming choices. No inferred source approval or payment action. */
export function resolveReturnedEdgarReview(review, decisions = {}) {
  invalid(object(decisions), 'EDGAR_RETURN_DECISIONS_INVALID');
  const byKey = new Map(review.rows.map(item => [item.key, item]));
  for (const key of Object.keys(decisions))
    invalid(byKey.has(key), 'EDGAR_RETURN_DECISION_UNKNOWN', 'A decision does not belong to this exact review: ' + key);
  const config = clone(review.current.config), products = productMap(config);
  let order = [...config.products.map(item => item.id)];
  for (const item of review.rows) {
    const choice = decisions[item.key];
    if (item.requiresDecision) invalid(choice !== undefined, 'EDGAR_RETURN_DECISION_REQUIRED', 'Choose current or returned for ' + item.label + '.');
    if (choice === undefined) continue;
    if (item.target.kind === 'order' && object(choice)) {
      invalid(Object.keys(choice).length === 1 && Array.isArray(choice.order) &&
        choice.order.every(id => typeof id === 'string') && new Set(choice.order).size === choice.order.length,
        'EDGAR_RETURN_ORDER_INVALID');
      order = [...choice.order];
      continue;
    }
    invalid(choice === 'current' || choice === 'returned', 'EDGAR_RETURN_DECISION_INVALID');
    const selected = item[choice];
    if (item.target.kind === 'order') {
      invalid(selected.present && Array.isArray(selected.value), 'EDGAR_RETURN_ORDER_INVALID');
      order = [...selected.value];
    } else if (item.target.kind === 'merchant') {
      if (selected.present) config[item.target.field] = clone(selected.value);
      else delete config[item.target.field];
    } else if (item.target.kind === 'product-presence') {
      if (selected.present) products.set(item.target.id, clone(selected.value));
      else products.delete(item.target.id);
    } else {
      const product = products.get(item.target.id);
      invalid(product, 'EDGAR_RETURN_PRODUCT_SELECTION_CHANGED');
      if (item.target.field === 'source') {
        invalid(selected.present, 'EDGAR_RETURN_SOURCE_REQUIRED');
        for (const field of SOURCE_FIELDS) product[field] = clone(selected.value[field]);
      } else if (selected.present) product[item.target.field] = clone(selected.value);
      else delete product[item.target.field];
    }
  }
  invalid(order.length === products.size && new Set(order).size === order.length &&
    order.every(id => products.has(id)), 'EDGAR_RETURN_ORDER_REQUIRED',
    'Choose an explicit order containing every selected product exactly once: ' + [...products.keys()].join(', '));
  config.products = order.map(id => products.get(id));
  return config;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].map(String).join(':');
}
/** Stream large original ZIPs; never decode or buffer a complete archive in memory. */
export async function verifyReturnedFile(path, expected = null, maximum = MAX_EXPANDED_BYTES) {
  path = resolve(path);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    invalid(before.isFile() && before.size > 0 && before.size <= maximum, 'EDGAR_RETURN_FILE_INVALID');
    const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
    let count = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, count);
      if (!bytesRead) break;
      count += bytesRead; invalid(count <= maximum, 'EDGAR_RETURN_SIZE_LIMIT');
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat(), now = await lstat(path);
    invalid(now.isFile() && !now.isSymbolicLink() && count === before.size &&
      fileIdentity(before) === fileIdentity(after) && fileIdentity(before) === fileIdentity(now),
      'EDGAR_RETURN_ORIGINAL_CHANGED');
    const descriptor = { bytes: String(count), sha256: hash.digest('hex') };
    invalid(!expected || descriptor.bytes === String(expected.bytes) && descriptor.sha256 === expected.sha256,
      'EDGAR_RETURN_ORIGINAL_CHANGED');
    return descriptor;
  } finally { await handle.close(); }
}
export async function copyReturnedFile(original, target, expected) {
  const wanted = expected ?? await verifyReturnedFile(original);
  await realDirectory(dirname(target), { create: true });
  if (await exists(target)) { await verifyReturnedFile(target, wanted); return; }
  const temporary = target + '.copy-' + wanted.sha256;
  const source = await open(resolve(original), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let output;
  try {
    const before = await source.stat();
    invalid(before.isFile() && before.size === Number(wanted.bytes), 'EDGAR_RETURN_ORIGINAL_CHANGED');
    try { output = await open(temporary, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      output = await open(temporary, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
    }
    const previous = await output.stat();
    invalid(previous.isFile() && previous.size <= Number(wanted.bytes) &&
      (previous.mode & 0o077) === 0, 'EDGAR_RETURN_COPY_INVALID');
    const buffer = Buffer.alloc(1024 * 1024), retained = Buffer.alloc(1024 * 1024), hash = createHash('sha256');
    let count = 0;
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, count);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      const prefix = Math.max(0, Math.min(bytesRead, previous.size - count));
      if (prefix) {
        let read = 0;
        while (read < prefix) {
          const result = await output.read(retained, read, prefix - read, count + read);
          invalid(result.bytesRead > 0, 'EDGAR_RETURN_COPY_INVALID'); read += result.bytesRead;
        }
        invalid(retained.subarray(0, prefix).equals(buffer.subarray(0, prefix)), 'EDGAR_RETURN_COPY_CHANGED');
      }
      let written = prefix;
      while (written < bytesRead) {
        const result = await output.write(buffer, written, bytesRead - written, count + written);
        invalid(result.bytesWritten > 0, 'EDGAR_RETURN_COPY_INTERRUPTED'); written += result.bytesWritten;
      }
      count += bytesRead; invalid(count <= Number(wanted.bytes), 'EDGAR_RETURN_ORIGINAL_CHANGED');
    }
    invalid(fileIdentity(before) === fileIdentity(await source.stat()) &&
      count === Number(wanted.bytes) && hash.digest('hex') === wanted.sha256, 'EDGAR_RETURN_ORIGINAL_CHANGED');
    await output.sync(); await output.close(); output = null;
    await verifyReturnedFile(temporary, wanted);
    const { link, unlink } = await import('node:fs/promises');
    try { await link(temporary, target); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await verifyReturnedFile(target, wanted);
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await syncDirectory(dirname(target));
  } finally { await output?.close(); await source.close(); }
}

function custodyRoot(directory, id) { return join(resolve(directory), 'returned-workspaces', returnId(id)); }
async function jsonFile(path, maximum = MAX_MANIFEST_BYTES) {
  return decodeJson((await pinnedFile(path, null, maximum)).bytes);
}
async function nativeState(root, revision, descriptor = null) {
  const path = join(root, 'versions', revisionName(revision));
  const file = await pinnedFile(path, descriptor, 8 * 1024 * 1024);
  const state = decodeJson(file.bytes);
  invalid(state.schema === 'stellar-forge.sec-edgar-workspace.v1' && state.revision === revision &&
    (state.config === null && state.configSha256 === null ||
      state.config && digest(JSON.stringify(state.config)) === state.configSha256),
    'EDGAR_RETURN_NATIVE_STATE_INVALID');
  return { state, descriptor: { bytes: String(file.bytes.length), sha256: file.sha256 } };
}
function manifestFile(manifest, path) {
  const file = manifest.files.find(item => item.path === path);
  invalid(file, 'EDGAR_RETURN_MANIFEST_FILE_MISSING');
  return file;
}
async function readCapturedReturn(directory, id, { verify = true } = {}) {
  const root = await realDirectory(custodyRoot(directory, id));
  const record = await jsonFile(join(root, 'return.json'));
  invalid(record.schema === RETURN_SCHEMA && record.id === id && record.archive?.sha256 === id &&
    HASH.test(record.archive.sha256) && /^[1-9][0-9]{0,15}$/.test(String(record.archive.bytes)) &&
    typeof record.label === 'string' && typeof record.receivedAt === 'string' && Number.isFinite(Date.parse(record.receivedAt)),
    'EDGAR_RETURN_RECORD_INVALID');
  validateOperatorManifest(record.manifest);
  invalid(record.workspaceId === record.manifest.workspace.workspaceId &&
    record.returnedRevision === record.manifest.workspace.revision &&
    record.manifestSha256 === digest(encoded(record.manifest)), 'EDGAR_RETURN_RECORD_CHANGED');
  if (verify) {
    await verifyReturnedFile(join(root, 'original.zip'), record.archive);
    const { reviewEdgarOperator } = await import('./receiving/operator.mjs');
    const source = await reviewEdgarOperator({
      directory: join(root, 'source', 'workspace'), storeDirectory: join(root, 'source', 'source-store'),
      expectedRevision: record.returnedRevision,
    });
    invalid(same(source.manifest, record.manifest), 'EDGAR_RETURN_SOURCE_CHANGED');
  }
  return { root, record };
}
function summary(record, root) {
  return {
    id: record.id, returnId: record.id, workspaceId: record.workspaceId, label: record.label,
    archive: clone(record.archive), archivePath: join(root, 'original.zip'),
    returnedRevision: record.returnedRevision, revisions: record.returnedRevision + 1,
    editions: record.manifest.editions.length, files: record.manifest.files.length,
    receivedAt: record.receivedAt, source: { manifest: clone(record.manifest) },
  };
}
function nativeFiles(manifest) {
  return manifest.files.filter(file => !file.path.startsWith('workspace/returned-workspaces/'));
}
async function buildReview(directory, storeDirectory, id, issuedRevision) {
  const capture = await readCapturedReturn(directory, id), { record, root } = capture;
  const { reviewEdgarOperator } = await import('./receiving/operator.mjs');
  const currentReview = await reviewEdgarOperator({ directory, storeDirectory });
  const manifest = currentReview.manifest;
  invalid(manifest.workspace.workspaceId === record.workspaceId &&
    manifest.workspace.createdAt === record.manifest.workspace.createdAt &&
    manifest.workspace.initialRevisionSha256 === record.manifest.workspace.initialRevisionSha256,
    'EDGAR_RETURN_WORKSPACE_CHANGED', 'The returned archive must retain this original workspace and its exact first revision.');
  const maximum = Math.min(manifest.workspace.revision, record.returnedRevision);
  let shared = -1;
  for (let revision = 0; revision <= maximum; revision++) {
    const path = 'workspace/versions/' + revisionName(revision);
    if (!same(manifestFile(manifest, path), manifestFile(record.manifest, path))) break;
    shared = revision;
  }
  invalid(shared >= 0, 'EDGAR_RETURN_NO_SHARED_HISTORY');
  if (issuedRevision === undefined || issuedRevision === null) issuedRevision = shared;
  invalid(Number.isSafeInteger(issuedRevision) && issuedRevision >= 0 && issuedRevision <= shared,
    'EDGAR_RETURN_ISSUED_REVISION_INVALID', 'Choose a byte-identical original revision shared by both branches.');
  const issued = await nativeState(directory, issuedRevision,
    manifestFile(manifest, 'workspace/versions/' + revisionName(issuedRevision)));
  const current = await nativeState(directory, manifest.workspace.revision,
    manifestFile(manifest, 'workspace/versions/' + revisionName(manifest.workspace.revision)));
  const returned = await nativeState(join(root, 'source', 'workspace'), record.returnedRevision,
    manifestFile(record.manifest, 'workspace/versions/' + revisionName(record.returnedRevision)));
  const comparison = compareReturnedEdgarStates({ issued: issued.state, current: current.state, returned: returned.state });
  const localEditions = new Map(manifest.editions.map(item => [item.id, item]));
  const sourceStatus = record.manifest.editions.map(edition => {
    const local = localEditions.get(edition.id);
    return { id: edition.id, kind: edition.kind, cik: edition.cik, sourceSha256: edition.sourceSha256,
      status: !local ? 'available-from-return' : same(local, edition) ? 'already-local' : 'conflicting-local-id',
      current: local ?? null, returned: clone(edition) };
  });
  const basis = {
    schema: REVIEW_SCHEMA, returnId: id, workspaceId: record.workspaceId,
    archive: record.archive, returnedManifestSha256: record.manifestSha256,
    issuedRevision, currentRevision: current.state.revision, returnedRevision: returned.state.revision,
    issued: issued.state, current: current.state, returned: returned.state,
    issuedDescriptor: issued.descriptor, currentDescriptor: current.descriptor, returnedDescriptor: returned.descriptor,
    currentFiles: nativeFiles(manifest), currentEditions: manifest.editions,
    rows: comparison.rows, suggestedOrder: comparison.suggestedOrder, sourceStatus,
  };
  return { ...basis, reviewSha256: digest(encoded(basis)) };
}
function reviewDigest(review) {
  const { reviewSha256, ...basis } = review;
  invalid(HASH.test(reviewSha256 ?? '') && digest(encoded(basis)) === reviewSha256, 'EDGAR_RETURN_REVIEW_CHANGED');
  return reviewSha256;
}
function authorText(value, name, maximum, optional = false) {
  if (optional && value === undefined) return '';
  invalid(typeof value === 'string' && value.length <= maximum && !/\u0000/.test(value) &&
    (optional || value.trim()), 'EDGAR_RETURN_AUTHOR_INVALID', 'Provide ' + name + ' within ' + maximum + ' characters.');
  return value;
}
function applicationToken(request) {
  return {
    schema: APPLICATION_SCHEMA, requestId: request.requestId, requestSha256: request.requestSha256,
    returnId: request.returnId, reviewSha256: request.review.reviewSha256,
    issuedRevision: request.review.issuedRevision, currentRevision: request.review.currentRevision,
    returnedRevision: request.review.returnedRevision, actor: request.actor, notes: request.notes,
  };
}
function applicationResult(state, request) {
  return {
    state: 'applied', returnId: request.returnId, requestId: request.requestId,
    requestSha256: request.requestSha256, reviewSha256: request.review.reviewSha256,
    workspaceId: state.workspaceId, revision: state.revision, configSha256: state.configSha256,
    issuedRevision: request.review.issuedRevision, returnedRevision: request.review.returnedRevision,
  };
}
function validateRequest(request, id, operationId) {
  invalid(request.schema === REQUEST_SCHEMA && request.returnId === id &&
    request.requestId === operationId && HASH.test(request.requestSha256 ?? '') &&
    object(request.inputs) && object(request.review) && object(request.config), 'EDGAR_RETURN_REQUEST_INVALID');
  reviewDigest(request.review);
  invalid(request.review.returnId === id && request.inputs.returnId === id &&
    request.inputs.reviewSha256 === request.review.reviewSha256 &&
    digest(encoded(request.inputs)) === request.requestSha256 &&
    request.actor === request.inputs.actor && request.notes === request.inputs.notes &&
    same(request.decisions, request.inputs.decisions), 'EDGAR_RETURN_REQUEST_CHANGED');
  const compiled = compileEdgarMerchant(resolveReturnedEdgarReview(request.review, request.decisions));
  invalid(same(compiled.config, request.config), 'EDGAR_RETURN_REQUEST_CHANGED');
  return request;
}
async function findApplied(directory, request) {
  const names = (await readdir(join(directory, 'versions'))).filter(name => /^\d{12}\.json$/.test(name)).sort();
  let selected = null;
  for (const name of names) {
    const revision = Number(name.slice(0, -5));
    if (revision <= request.review.currentRevision) continue;
    const { state } = await nativeState(directory, revision);
    const token = state.returnedWorkspace;
    if (token?.returnId !== request.returnId || token?.requestId !== request.requestId) continue;
    invalid(same(token, applicationToken(request)) && state.revision === request.review.currentRevision + 1 &&
      state.workspaceId === request.review.workspaceId &&
      same(state.config, request.config) && !selected, 'EDGAR_RETURN_APPLIED_BINDING_CHANGED');
    selected = state;
  }
  return selected;
}
async function preflightSources(storeDirectory, capture, config) {
  const store = await openEdgarStore(storeDirectory), incoming = await openEdgarStore(join(capture.root, 'source', 'source-store')), required = new Map();
  try {
    for (const product of config.products) {
      let local = null;
      try { local = (await store.getEdition(product.editionId)).record; }
      catch (error) { if (error.code !== 'EDGAR_EDITION_NOT_FOUND') throw error; }
      const matches = record => record && record.kind === product.kind && record.cik === product.cik &&
        record.sourceSha256 === product.sourceSha256;
      if (local) {
        invalid(matches(local), 'EDGAR_RETURN_SOURCE_ID_CONFLICT',
          'Selected source ' + product.editionId + ' conflicts with its existing immutable local edition; retain the local product or prepare a distinct source explicitly.');
        await store.query(product.editionId, product, product.example);
        continue;
      }
      const source = capture.record.manifest.editions.find(item => item.id === product.editionId);
      invalid(matches(source), 'EDGAR_RETURN_SOURCE_MISSING', 'The selected source is absent from both original branches.');
      const rawDescriptor = manifestFile(capture.record.manifest, 'source-store/blobs/' + source.sourceSha256 + '.json');
      await incoming.query(product.editionId, product, product.example);
      await pinnedFile(join(capture.root, 'source', rawDescriptor.path), rawDescriptor);
      required.set(source.id, { record: source, path: join(capture.root, 'source', rawDescriptor.path), descriptor: rawDescriptor });
    }
    return required;
  } finally { await incoming.close(); await store.close(); }
}
async function importRequiredSources(storeDirectory, required) {
  const store = await openEdgarStore(storeDirectory);
  try {
    for (const { record, path, descriptor } of required.values()) {
      const bytes = (await pinnedFile(path, descriptor)).bytes;
      const received = await store.importCapture({
        id: record.id, kind: record.kind, cik: record.cik, sourceUrl: record.sourceUrl,
        capturedAt: record.capturedAt, bytes,
      });
      invalid(same(received.record, record), 'EDGAR_RETURN_SOURCE_METADATA_CHANGED');
    }
  } finally { await store.close(); }
}

async function walkFiles(root, prefix = '') {
  const files = [];
  for (const name of (await readdir(await realDirectory(root))).sort()) {
    invalid(name && name !== '.' && name !== '..' && !/[\\\u0000]/.test(name), 'EDGAR_RETURN_PATH_INVALID');
    const path = join(root, name), stat = await lstat(path), member = prefix ? prefix + '/' + name : name;
    invalid(!stat.isSymbolicLink(), 'EDGAR_RETURN_SYMLINK');
    if (stat.isDirectory()) files.push(...await walkFiles(path, member));
    else {
      invalid(stat.isFile(), 'EDGAR_RETURN_FILE_INVALID');
      files.push({ path: member, ...await verifyReturnedFile(path) });
    }
    invalid(files.length <= MAX_MEMBERS, 'EDGAR_RETURN_MEMBER_LIMIT');
  }
  return files;
}
async function verifySourceFiles(root, record) {
  invalid(Array.isArray(record.sourceFiles) && record.sourceFiles.length <= MAX_MEMBERS &&
    new Set(record.sourceFiles.map(file => file.path)).size === record.sourceFiles.length,
    'EDGAR_RETURN_SOURCE_INVENTORY_INVALID');
  const actual = await walkFiles(join(root, 'source'));
  invalid(same(actual, record.sourceFiles), 'EDGAR_RETURN_SOURCE_INVENTORY_CHANGED');
}
async function operationState(directory, id, opId, { persist = false } = {}) {
  returnId(id); requestId(opId);
  const folder = join(custodyRoot(directory, id), 'operations', opId);
  if (!await exists(join(folder, 'request.json')))
    throw Object.assign(new Error('The original returned-workspace request does not exist.'), { code: 'EDGAR_RETURN_OPERATION_NOT_FOUND', status: 404 });
  const request = validateRequest(await jsonFile(join(folder, 'request.json')), id, opId);
  const applied = await findApplied(directory, request);
  if (applied) {
    const result = applicationResult(applied, request);
    if (await exists(join(folder, 'result.json')))
      invalid(same(await jsonFile(join(folder, 'result.json')), result), 'EDGAR_RETURN_RESULT_CHANGED');
    else if (persist) await exactFile(join(folder, 'result.json'), encoded(result));
    invalid(!await exists(join(folder, 'rejection.json')), 'EDGAR_RETURN_OPERATION_CONFLICT');
    return { state: 'applied', request: clone(request), result };
  }
  invalid(!await exists(join(folder, 'result.json')), 'EDGAR_RETURN_APPLIED_REVISION_MISSING');
  if (await exists(join(folder, 'rejection.json'))) {
    const rejection = await jsonFile(join(folder, 'rejection.json'));
    invalid(rejection.returnId === id && rejection.requestId === opId &&
      rejection.requestSha256 === request.requestSha256 && typeof rejection.code === 'string',
      'EDGAR_RETURN_REJECTION_CHANGED');
    return { state: 'rejected', request: clone(request), rejection };
  }
  return { state: 'pending', request: clone(request) };
}

/** Existing workspace facade supplies its original optimistic writer. */
export function openEdgarReturns({ directory, storeDirectory, workspace, python, signal } = {}) {
  directory = resolve(directory); storeDirectory = resolve(storeDirectory);
  invalid(workspace && typeof workspace.snapshot === 'function' && typeof workspace.saveDraft === 'function',
    'EDGAR_RETURN_WORKSPACE_REQUIRED');
  const options = { ...(python ? { python } : {}), ...(signal ? { signal } : {}) };
  return {
    async receive({ archivePath, expectedArchiveSha256, label = '' } = {}) {
      returnId(expectedArchiveSha256);
      label = authorText(label, 'a return label', 512, true);
      const id = expectedArchiveSha256, target = custodyRoot(directory, id);
      if (await exists(join(target, 'return.json'))) {
        const captured = await readCapturedReturn(directory, id);
        await verifySourceFiles(captured.root, captured.record);
        const current = await workspace.snapshot();
        invalid(current.workspaceId === captured.record.workspaceId, 'EDGAR_RETURN_WORKSPACE_CHANGED');
        return { ...summary(captured.record, captured.root), reused: true };
      }
      const snapshot = await workspace.snapshot();
      invalid(snapshot.workspaceId && Number.isSafeInteger(snapshot.revision), 'EDGAR_RETURN_WORKSPACE_REQUIRED');
      const { inspectEdgarOperatorArchive, receiveEdgarOperator } = await import('./receiving/operator.mjs');
      const selected = await inspectEdgarOperatorArchive({ archivePath, expectedArchiveSha256, ...options });
      invalid(selected.manifest.workspace.workspaceId === snapshot.workspaceId, 'EDGAR_RETURN_WORKSPACE_CHANGED',
        'Receive a returned copy of this original SEC workspace.');
      // Original shared revision zero is checked before retaining any source in the author.
      const initial = await nativeState(directory, 0);
      invalid(initial.descriptor.sha256 === selected.manifest.workspace.initialRevisionSha256 &&
        initial.state.createdAt === selected.manifest.workspace.createdAt, 'EDGAR_RETURN_NO_SHARED_HISTORY');
      const stage = join(dirname(directory), '.sec-edgar-return-' + digest(encoded({ directory, id })));
      await realDirectory(stage, { create: true });
      const requestPath = join(stage, 'request.json');
      let receiveRequest;
      if (await exists(requestPath)) {
        receiveRequest = await jsonFile(requestPath);
        invalid(receiveRequest.id === id && receiveRequest.workspaceId === snapshot.workspaceId &&
          same(receiveRequest.archive, selected.archive), 'EDGAR_RETURN_RECEIVE_CHANGED');
      } else {
        receiveRequest = { id, workspaceId: snapshot.workspaceId, archive: selected.archive,
          label, receivedAt: new Date().toISOString() };
        try { await exactFile(requestPath, encoded(receiveRequest)); }
        catch (error) {
          if (!await exists(requestPath)) throw error;
          receiveRequest = await jsonFile(requestPath);
          invalid(receiveRequest.id === id && receiveRequest.workspaceId === snapshot.workspaceId &&
            same(receiveRequest.archive, selected.archive), 'EDGAR_RETURN_RECEIVE_CHANGED');
        }
      }
      await copyReturnedFile(archivePath, join(stage, 'original.zip'), selected.archive);
      await receiveEdgarOperator({
        archivePath: join(stage, 'original.zip'), expectedArchiveSha256,
        directory: join(stage, 'source'), ...options,
      });
      const sourceFiles = await walkFiles(join(stage, 'source'));
      const record = {
        schema: RETURN_SCHEMA, id, workspaceId: snapshot.workspaceId,
        returnedRevision: selected.manifest.workspace.revision, archive: selected.archive,
        manifestSha256: digest(encoded(selected.manifest)), manifest: selected.manifest,
        label: receiveRequest.label, receivedAt: receiveRequest.receivedAt, sourceFiles,
      };
      await exactFile(join(stage, 'return.json'), encoded(record));
      await realDirectory(dirname(target), { create: true });
      try { await rename(stage, target); await syncDirectory(dirname(target)); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
      const captured = await readCapturedReturn(directory, id);
      invalid(same(captured.record, record), 'EDGAR_RETURN_RECEIVE_CHANGED');
      await verifySourceFiles(captured.root, captured.record);
      return { ...summary(captured.record, captured.root), reused: false };
    },
    async list() {
      const root = join(directory, 'returned-workspaces');
      if (!await exists(root)) return { returns: [] };
      const rows = [];
      for (const id of (await readdir(await realDirectory(root))).sort()) {
        if (!HASH.test(id)) continue;
        const { record, root: folder } = await readCapturedReturn(directory, id, { verify: false });
        rows.push(summary(record, folder));
      }
      return { returns: rows };
    },
    async inspect({ returnId: id } = {}) {
      const { record, root } = await readCapturedReturn(directory, returnId(id));
      await verifySourceFiles(root, record);
      return summary(record, root);
    },
    async preview({ returnId: id, issuedRevision } = {}) {
      return buildReview(directory, storeDirectory, returnId(id), issuedRevision);
    },
    async operation({ returnId: id, requestId: opId } = {}) {
      return operationState(directory, returnId(id), requestId(opId));
    },
    async apply({ returnId: id, reviewSha256, issuedRevision, requestId: opId, decisions = {}, actor, notes = '' } = {}) {
      returnId(id); requestId(opId);
      invalid(HASH.test(reviewSha256 ?? ''), 'EDGAR_RETURN_REVIEW_REQUIRED');
      actor = authorText(actor, 'the reviewing author', 256);
      notes = authorText(notes, 'review notes', 8192, true);
      invalid(object(decisions), 'EDGAR_RETURN_DECISIONS_INVALID');
      const inputs = { returnId: id, reviewSha256, issuedRevision: issuedRevision ?? null, decisions: clone(decisions), actor, notes };
      const requestSha256 = digest(encoded(inputs));
      const folder = join(custodyRoot(directory, id), 'operations', opId);
      let request;
      if (await exists(join(folder, 'request.json'))) {
        const retained = await operationState(directory, id, opId, { persist: true });
        invalid(retained.request.requestSha256 === requestSha256 && same(retained.request.inputs, inputs),
          'EDGAR_RETURN_REQUEST_CONFLICT', 'This request identity belongs to its exact original return and decisions.');
        if (retained.state === 'applied') return retained.result;
        if (retained.state === 'rejected')
          throw Object.assign(new Error(retained.rejection.message), { code: retained.rejection.code, status: 409, state: 'rejected' });
        request = retained.request;
      } else {
        const review = await buildReview(directory, storeDirectory, id, issuedRevision);
        invalid(review.reviewSha256 === reviewSha256, 'EDGAR_RETURN_REVIEW_CHANGED',
          'Saved work changed. Review the exact current and returned branches before applying.');
        const config = compileEdgarMerchant(resolveReturnedEdgarReview(review, decisions)).config;
        const captured = await readCapturedReturn(directory, id);
        await preflightSources(storeDirectory, captured, config);
        request = {
          schema: REQUEST_SCHEMA, returnId: id, requestId: opId, requestSha256, inputs,
          actor, notes, decisions: clone(decisions), review, config,
        };
        await exactFile(join(folder, 'request.json'), encoded(request));
      }
      const captured = await readCapturedReturn(directory, id);
      const current = await workspace.snapshot();
      const unchangedParent = current.revision === request.review.currentRevision &&
        current.workspaceId === request.review.workspaceId && same(current.config, request.review.current.config);
      const rejectStale = async () => {
        const applied = await findApplied(directory, request);
        if (applied) {
          const result = applicationResult(applied, request);
          await exactFile(join(folder, 'result.json'), encoded(result)); return result;
        }
        const rejection = {
          state: 'rejected', returnId: id, requestId: opId, requestSha256,
          code: 'EDGAR_REVISION_CHANGED', message: 'Another original revision was saved before this return was applied. Review again with a new request; the complete old request remains retained.',
        };
        await exactFile(join(folder, 'rejection.json'), encoded(rejection));
        throw Object.assign(new Error(rejection.message), { code: rejection.code, status: 409, state: 'rejected' });
      };
      if (!unchangedParent) return rejectStale();
      await nativeState(directory, request.review.currentRevision, request.review.currentDescriptor);
      const required = await preflightSources(storeDirectory, captured, request.config);
      await importRequiredSources(storeDirectory, required);
      let saved;
      try {
        saved = await workspace.saveDraft({
          expectedRevision: request.review.currentRevision, config: clone(request.config),
          returnedWorkspace: applicationToken(request),
        });
      } catch (error) {
        if (error.code === 'EDGAR_REVISION_CHANGED') return rejectStale();
        throw error;
      }
      invalid(saved.revision === request.review.currentRevision + 1 &&
        same(saved.returnedWorkspace, applicationToken(request)) && same(saved.config, request.config),
        'EDGAR_RETURN_WRITER_BINDING_MISSING', 'The original draft writer did not retain this exact return application.');
      const result = applicationResult(saved, request);
      await exactFile(join(folder, 'result.json'), encoded(result));
      return result;
    },
  };
}

/** Typed complete custody, called by the original portable review. No runtime paths are followed. */
export async function collectReturnedWorkspaceFiles({ directory, storeDirectory } = {}) {
  directory = resolve(directory);
  const top = join(directory, 'returned-workspaces');
  const nativeTokens = [];
  for (const name of (await readdir(join(directory, 'versions'))).filter(name => /^\d{12}\.json$/.test(name)).sort()) {
    const { state } = await nativeState(directory, Number(name.slice(0, -5)));
    if (state.returnedWorkspace) nativeTokens.push(state.returnedWorkspace);
  }
  if (!await exists(top)) {
    invalid(!nativeTokens.length, 'EDGAR_RETURN_CUSTODY_MISSING');
    return { returnedWorkspaces: [], entries: [] };
  }
  const entries = [], returnedWorkspaces = [];
  const add = async (id, path, expected = null) => {
    const original = selectedPath(custodyRoot(directory, id), path);
    const descriptor = await verifyReturnedFile(original, expected);
    entries.push({ path: 'workspace/returned-workspaces/' + id + '/' + path, original, ...descriptor });
    invalid(entries.length <= MAX_MEMBERS, 'EDGAR_RETURN_MEMBER_LIMIT');
    return descriptor;
  };
  for (const id of (await readdir(await realDirectory(top))).sort()) {
    invalid(HASH.test(id), 'EDGAR_RETURN_CUSTODY_DIRECTORY_INVALID');
    const { record, root } = await readCapturedReturn(directory, id);
    await verifySourceFiles(root, record);
    const pin = await add(id, 'return.json');
    returnedWorkspaces.push({ id, recordSha256: pin.sha256 });
    await add(id, 'original.zip', record.archive);
    // Preserve the receive request, including its original selected archive and label.
    const receiveRequest = await jsonFile(join(root, 'request.json'));
    invalid(receiveRequest.id === id && receiveRequest.workspaceId === record.workspaceId &&
      same(receiveRequest.archive, record.archive), 'EDGAR_RETURN_RECEIVE_CHANGED');
    await add(id, 'request.json');
    for (const file of record.sourceFiles) await add(id, 'source/' + file.path, file);
    const operations = join(root, 'operations');
    if (!await exists(operations)) continue;
    for (const opId of (await readdir(await realDirectory(operations))).sort()) {
      requestId(opId);
      const operation = await operationState(directory, id, opId);
      const request = operation.request;
      invalid(request.review.workspaceId === record.workspaceId &&
        request.review.returnedManifestSha256 === record.manifestSha256 &&
        request.review.returnedRevision === record.returnedRevision,
        'EDGAR_RETURN_REQUEST_SOURCE_CHANGED');
      for (const file of request.review.currentFiles) {
        const native = file.path.startsWith('workspace/') ?
          selectedPath(directory, file.path.slice('workspace/'.length)) :
          file.path.startsWith('source-store/') && storeDirectory ? selectedPath(storeDirectory, file.path.slice('source-store/'.length)) : null;
        invalid(native, 'EDGAR_RETURN_REQUEST_SOURCE_PATH_INVALID');
        await pinnedFile(native, file);
      }
      const original = await nativeState(join(root, 'source', 'workspace'), record.returnedRevision,
        request.review.returnedDescriptor);
      const issued = await nativeState(directory, request.review.issuedRevision, request.review.issuedDescriptor);
      const current = await nativeState(directory, request.review.currentRevision, request.review.currentDescriptor);
      invalid(same(original.state, request.review.returned) && same(issued.state, request.review.issued) &&
        same(current.state, request.review.current), 'EDGAR_RETURN_REQUEST_HISTORY_CHANGED');
      const rows = compareReturnedEdgarStates({ issued: issued.state, current: current.state, returned: original.state });
      invalid(same(rows.rows, request.review.rows) && same(rows.suggestedOrder, request.review.suggestedOrder),
        'EDGAR_RETURN_REQUEST_COMPARISON_CHANGED');
      await add(id, 'operations/' + opId + '/request.json');
      for (const file of ['result.json', 'rejection.json'])
        if (await exists(join(operations, opId, file))) await add(id, 'operations/' + opId + '/' + file);
    }
  }
  for (const token of nativeTokens) {
    invalid(token.schema === APPLICATION_SCHEMA, 'EDGAR_RETURN_APPLICATION_INVALID');
    const operation = await operationState(directory, returnId(token.returnId), requestId(token.requestId));
    invalid(operation.state === 'applied' && same(token, applicationToken(operation.request)),
      'EDGAR_RETURN_APPLICATION_CUSTODY_CHANGED');
  }
  return { returnedWorkspaces, entries };
}
