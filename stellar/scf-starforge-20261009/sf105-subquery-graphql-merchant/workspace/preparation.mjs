// MIT. Saved native merchant preparation in the original SF105 workspace.
import { readdir } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { digest, plain, projectName, validateVersion } from './store.mjs';
import { requestJson, requestUuid, readRequestFile, readRequestBytes, writeRequestFile } from './request-sets.mjs';
import { pathContext, readProjectPaths, attachPathContext } from './paths.mjs';
import { reviewDraft, compareDraft, exportDraft, reviseDraft, readExport, verifyExport,
  recoverPreparedMerchant, snapshotPreparationFiles } from './merchant.mjs';

export const MERCHANT_PREPARATION_SCHEMA = 'stellar-forge.graphql-merchant-preparation.v1';
export const MERCHANT_PREPARATION_LIMIT = 32;
const SHA = /^[a-f0-9]{64}$/;
const MAX_GENERATIONS = 256;
const active = new WeakMap();
const activity = new WeakMap();
export const preparationsVersion = store => activity.get(store) ?? 0;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const same = (a, b) => requestJson(a).equals(requestJson(b));
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const integer = (value, min = 1) => {
  if (!Number.isSafeInteger(value) || value < min) fail('Select the original saved revision or generation.');
  return value;
};
const hash = value => { if (!SHA.test(value ?? '')) fail('Select the original SHA-256 identity.'); return value; };
function shape(value, fields) {
  if (!plain(value) || Object.keys(value).some(key => !fields.includes(key))) fail('Use the saved merchant preparation fields.');
}
export function preparationFile(id, generation) {
  requestUuid(id); integer(generation);
  if (generation > MAX_GENERATIONS) fail('This preparation has reached its retained history limit.', 409);
  return 'merchant-preparations/' + id + '/' + generation + '.json';
}
export const preparationTask = (project, revision, id) =>
  'packages/' + projectName(project) + '-r' + integer(revision) + '-preparation-' + requestUuid(id);
export function normalizeMerchantPreparation(value) {
  shape(value, ['id', 'project', 'expectedRevision', 'inputDigest', 'kind', 'baselineExportId', 'comparisonDigest']);
  const result = { id: requestUuid(value.id), project: projectName(value.project),
    expectedRevision: integer(value.expectedRevision), kind: value.kind ?? 'merchant' };
  if (value.inputDigest !== undefined) result.inputDigest = hash(value.inputDigest);
  if (!['merchant', 'revision'].includes(result.kind)) fail('Choose merchant or revision preparation.');
  if (result.kind === 'revision') {
    result.baselineExportId = requestUuid(value.baselineExportId, 'baseline export UUID');
    result.comparisonDigest = hash(value.comparisonDigest);
  } else if (value.baselineExportId !== undefined || value.comparisonDigest !== undefined)
    fail('A merchant preparation does not select a revision baseline.');
  return result;
}
export function normalizePreparationContinuation(value) {
  shape(value, ['id', 'project', 'preparationId', 'expectedGeneration', 'expectedRecordSha256']);
  return { id: requestUuid(value.id), project: projectName(value.project),
    preparationId: requestUuid(value.preparationId), expectedGeneration: integer(value.expectedGeneration),
    expectedRecordSha256: hash(value.expectedRecordSha256) };
}
export function preparationReference(record, sha256) {
  return { id: record.id, project: record.project, generation: record.generation,
    previousRecordSha256: record.previousRecordSha256, recordSha256: sha256,
    definitionSha256: record.definitionSha256, draftRevision: record.draftRevision,
    inputDigest: record.inputDigest, kind: record.kind, state: record.state,
    attempts: record.attempts.length, updatedAt: record.updatedAt,
    ...(record.output ? { exportId: record.output.id } : {}) };
}
const definition = record => ({ request: record.request, draftSha256: record.draftSha256,
  inputDigest: record.inputDigest, baseline: record.baseline });
export function validatePreparationRecord(record, id, previous = null) {
  if (!plain(record) || record.schema !== MERCHANT_PREPARATION_SCHEMA || record.id !== requestUuid(id)
      || record.project !== projectName(record.project) || !time(record.createdAt) || !time(record.updatedAt)
      || record.generation !== integer(record.generation) || record.generation > MAX_GENERATIONS
      || record.draftRevision !== integer(record.draftRevision) || !SHA.test(record.draftSha256 ?? '')
      || !SHA.test(record.inputDigest ?? '') || !SHA.test(record.definitionSha256 ?? '')
      || !plain(record.request) || !same(record.request, normalizeMerchantPreparation(record.request))
      || record.request.id !== id || record.request.project !== record.project
      || record.request.expectedRevision !== record.draftRevision || record.request.kind !== record.kind
      || record.request.inputDigest !== undefined && record.request.inputDigest !== record.inputDigest
      || digest(requestJson(definition(record))) !== record.definitionSha256
      || !['READY', 'PREPARING', 'PARTIAL', 'COMPLETED'].includes(record.state)
      || !Array.isArray(record.attempts) || record.attempts.length > MERCHANT_PREPARATION_LIMIT)
    fail('The saved merchant preparation changed its original identity.', 409);
  if (record.kind === 'revision') {
    if (!plain(record.baseline) || record.baseline.id !== record.request.baselineExportId
        || !SHA.test(record.baseline.recordSha256 ?? '')) fail('The preparation lost its exact baseline.', 409);
  } else if (record.baseline !== null) fail('A merchant preparation acquired a different baseline.', 409);
  const seen = new Set();
  for (const [index, attempt] of record.attempts.entries()) {
    requestUuid(attempt?.id);
    if (!plain(attempt) || seen.has(attempt.id) || attempt.ordinal !== index + 1
        || attempt.task !== preparationTask(record.project, record.draftRevision, attempt.id)
        || typeof attempt.workspaceRoot !== 'string' || !isAbsolute(attempt.workspaceRoot)
        || attempt.workspaceRoot === '/' || resolve(attempt.workspaceRoot) !== attempt.workspaceRoot
        || attempt.workspaceRoot.length > 4096 || /[\u0000-\u001f\u007f]/.test(attempt.workspaceRoot)
        || !time(attempt.startedAt) || !['STARTED', 'INCOMPLETE', 'COMPLETED'].includes(attempt.state)
        || !Array.isArray(attempt.files) || !plain(attempt.request) || !SHA.test(attempt.requestSha256 ?? '')
        || digest(requestJson(attempt.request)) !== attempt.requestSha256
        || attempt.request.id !== attempt.id || attempt.request.project !== record.project
        || index === 0 && (attempt.id !== record.id || !same(attempt.request, record.request))
        || index > 0 && (!same(attempt.request, normalizePreparationContinuation(attempt.request))
          || attempt.request.preparationId !== record.id)
        || attempt.state === 'STARTED' && (attempt.finishedAt !== null || attempt.output !== null || attempt.files.length)
        || attempt.state !== 'STARTED' && !time(attempt.finishedAt)
        || !Array.isArray(attempt.files) || attempt.files.length > 512)
      fail('A native preparation attempt changed its original request.', 409);
    seen.add(attempt.id);
    const names = new Set(); let total = 0;
    for (const file of attempt.files) {
      if (!plain(file) || typeof file.name !== 'string' || !file.name.startsWith(attempt.task + '/')
          || file.name.split('/').some(part => !part || part === '.' || part === '..')
          || /[\\:\u0000-\u001f\u007f]/.test(file.name) || names.has(file.name)
          || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 8 * 1024 * 1024
          || !SHA.test(file.sha256 ?? '')) fail('A retained native attempt has an invalid file identity.', 409);
      names.add(file.name); total += file.bytes;
    }
    if (total > 256_000_000) fail('This retained attempt exceeds the original transfer bound.', 409);
    if (attempt.state === 'COMPLETED') {
      if (!plain(attempt.output) || attempt.output.id !== attempt.id
          || attempt.output.draftRevision !== record.draftRevision || attempt.output.inputDigest !== record.inputDigest
          || !SHA.test(attempt.output.recordSha256 ?? '') || !time(attempt.output.createdAt)
          || attempt.output.directory !== join(attempt.workspaceRoot, attempt.task,
            ...(record.kind === 'revision' ? ['revised', 'merchant'] : ['merchant'])))
        fail('The completed native package differs from its original attempt.', 409);
    } else if (attempt.output !== null) fail('An unfinished attempt cannot claim a merchant export.', 409);
    if (index < record.attempts.length - 1 && attempt.state !== 'INCOMPLETE')
      fail('Only an explicitly unfinished attempt can precede another attempt.', 409);
  }
  const last = record.attempts.at(-1), expectedState = !last ? 'READY'
    : { STARTED: 'PREPARING', INCOMPLETE: 'PARTIAL', COMPLETED: 'COMPLETED' }[last.state];
  if (record.state !== expectedState || !same(record.output, last?.output ?? null))
    fail('The preparation summary differs from its original attempt.', 409);
  if (previous) {
    if (record.generation !== previous.record.generation + 1 || record.previousRecordSha256 !== previous.sha256
        || !same(definition(record), definition(previous.record)) || record.createdAt !== previous.record.createdAt)
      fail('The preparation history no longer continues its original source.', 409);
    const before = previous.record.attempts;
    if (record.attempts.length < before.length || record.attempts.length > before.length + 1)
      fail('The native attempt history changed.', 409);
    for (let index = 0; index < before.length; index++) {
      const old = before[index], next = record.attempts[index];
      if (old.state === 'STARTED') {
        if (index !== before.length - 1 || record.attempts.length !== before.length
            || !['INCOMPLETE', 'COMPLETED'].includes(next.state)
            || !same({ ...next, state: old.state, finishedAt: old.finishedAt, output: old.output,
              files: old.files, error: old.error }, old))
          fail('A native attempt may only retain its original completion or interruption.', 409);
      } else if (!same(old, next)) fail('A completed native attempt was modified.', 409);
    }
    if (record.attempts.length > before.length) {
      const next = record.attempts.at(-1);
      if (before.at(-1)?.state !== 'INCOMPLETE' && before.length || next.state !== 'STARTED'
          || before.length && (next.request.expectedGeneration !== previous.record.generation
            || next.request.expectedRecordSha256 !== previous.sha256))
        fail('A new attempt must continue the exact unfinished original generation.', 409);
    } else if (!before.length) fail('An empty preparation cannot add an empty generation.', 409);
  } else if (record.generation !== 1 || record.previousRecordSha256 !== null
      || record.attempts.length || record.state !== 'READY') fail('The initial preparation history is incomplete.', 409);
  return record;
}
export async function preparationGenerations(store, id) {
  requestUuid(id);
  let names;
  try { names = await readdir(join(store.root, 'merchant-preparations', id)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return names.filter(name => /^[1-9]\d*\.json$/.test(name)).map(name => Number(name.slice(0, -5))).sort((a, b) => a - b);
}
export async function readMerchantPreparation(store, { project, preparationId, generation, recordSha256 } = {}) {
  projectName(project); requestUuid(preparationId);
  const available = await preparationGenerations(store, preparationId);
  const selected = generation ?? available.at(-1);
  if (!selected || !available.includes(selected)) fail('The original preparation is not retained here.', 404);
  integer(selected); if (selected > MAX_GENERATIONS) fail('The preparation history exceeds its original bound.');
  const records = []; let previous = null;
  for (let number = 1; number <= selected; number++) {
    const value = await readRequestFile(store, preparationFile(preparationId, number));
    validatePreparationRecord(value.record, preparationId, previous);
    if (value.record.project !== project) fail('The preparation belongs to another project.', 409);
    records.push(value); previous = value;
  }
  if (recordSha256 !== undefined && previous.sha256 !== hash(recordSha256))
    fail('The selected preparation generation changed.', 409);
  return { ...previous, records, reference: preparationReference(previous.record, previous.sha256),
    latestGeneration: available.at(-1) };
}
export async function verifyPreparationSource(record, { loadDraft }) {
  const raw = await loadDraft(record.draftRevision, record.draftSha256);
  const saved = validateVersion(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), record.project);
  if (digest(raw) !== record.draftSha256 || saved.revision !== record.draftRevision || saved.inputDigest !== record.inputDigest
      || record.baseline && !saved.exports.some(reference => same(reference, record.baseline)))
    fail('The preparation no longer identifies its original committed draft and baseline.', 409);
  return saved;
}
async function source(store, record) {
  await verifyPreparationSource(record, { loadDraft: async (revision, sha256) =>
    (await readRequestBytes(store, 'projects/' + record.project + '/' + revision + '.json', sha256)).raw });
  return store.read(record.project, record.draftRevision);
}
async function boundExport(store, project, reference) {
  return attachPathContext({ ...reference }, await readProjectPaths(store.root, project));
}
async function attach(store, retained) {
  let saved = await store.read(retained.record.project);
  for (const item of retained.records) {
    const reference = preparationReference(item.record, item.sha256);
    const prior = (saved.merchantPreparations ?? []).find(value => value.id === reference.id);
    if (prior && prior.generation >= reference.generation) {
      const original = retained.records[prior.generation - 1];
      if (!original || !same(prior, preparationReference(original.record, original.sha256)))
        fail('The project retains another preparation generation.', 409);
      continue;
    }
    let exportRecord;
    if (item.record.output) {
      exportRecord = item.record.output;
      const output = await readExport(await boundExport(store, saved.id, exportRecord)); await verifyExport(output);
      const existing = saved.exports.find(value => value.id === exportRecord.id);
      if (existing && !same(existing, exportRecord)) fail('The project retains another native export under this UUID.', 409);
      if (existing) exportRecord = undefined;
    }
    saved = await store.save({ id: saved.id, input: saved.input, expectedRevision: saved.revision,
      merchantPreparationRecord: reference, ...(exportRecord ? { exportRecord } : {}) });
  }
  return { project: saved, record: retained.record, recordSha256: retained.sha256,
    reference: retained.reference, active: Boolean(active.get(store)?.has(retained.record.id)) };
}
async function append(store, retained, changes) {
  const record = { ...retained.record, ...changes, generation: retained.record.generation + 1,
    previousRecordSha256: retained.sha256, updatedAt: new Date().toISOString() };
  validatePreparationRecord(record, record.id, retained);
  await writeRequestFile(store, preparationFile(record.id, record.generation), record);
  return readMerchantPreparation(store, { project: record.project, preparationId: record.id, generation: record.generation });
}
const errorView = error => error ? { code: String(error.code ?? 'NATIVE_PREPARATION_INTERRUPTED').slice(0, 160),
  message: String(error.message ?? error).slice(0, 4096) } : null;
async function settle(store, retained, output, error) {
  const record = retained.record, last = record.attempts.at(-1);
  const files = await snapshotPreparationFiles(store, last.task);
  const attempt = { ...last, state: output ? 'COMPLETED' : 'INCOMPLETE',
    finishedAt: new Date().toISOString(), output: output?.reference ?? null, files, error: errorView(error) };
  const next = await append(store, retained, { state: output ? 'COMPLETED' : 'PARTIAL',
    output: attempt.output, attempts: [...record.attempts.slice(0, -1), attempt] });
  return attach(store, next);
}
async function reconcile(store, retained) {
  await source(store, retained.record);
  if (retained.record.state !== 'PREPARING') return attach(store, retained);
  const attempt = retained.record.attempts.at(-1);
  let output = null, error = null;
  try { output = await recoverPreparedMerchant(store, await source(store, retained.record), retained.record, attempt); }
  catch (cause) { error = cause; }
  return settle(store, retained, output, error ?? (!output ? new Error(
    'The original native attempt ended without a complete verified package. Its files are retained; continue explicitly into a new attempt.') : null));
}
function own(store, id, operation) {
  let jobs = active.get(store); if (!jobs) { jobs = new Set(); active.set(store, jobs); }
  if (jobs.size) fail('Finish the current native preparation before another preparation action.', 409);
  jobs.add(id); activity.set(store, preparationsVersion(store) + 1);
  return (async () => { try { return await operation(); } finally {
    jobs.delete(id); activity.set(store, preparationsVersion(store) + 1);
  } })();
}
export function preparationsActive(store, ids) { return ids.some(id => active.get(store)?.has(id)); }
async function execute(store, retained, request) {
  const saved = await source(store, retained.record), attempt = { id: request.id,
    ordinal: retained.record.attempts.length + 1, task: preparationTask(saved.id, saved.revision, request.id),
    workspaceRoot: store.root, request, requestSha256: digest(requestJson(request)),
    startedAt: new Date().toISOString(), finishedAt: null, state: 'STARTED', output: null, files: [], error: null };
  if (attempt.ordinal > MERCHANT_PREPARATION_LIMIT) fail('This preparation has reached its explicit attempt limit.', 409);
  retained = await append(store, retained, { state: 'PREPARING', attempts: [...retained.record.attempts, attempt] });
  await attach(store, retained);
  let output = null, error = null;
  try {
    const options = { exportId: attempt.id, task: join(store.root, attempt.task) };
    output = retained.record.kind === 'revision'
      ? await reviseDraft(store, saved, saved.exports.find(item => item.id === retained.record.baseline.id),
        retained.record.request.comparisonDigest, options)
      : await exportDraft(store, saved, options);
  } catch (cause) {
    error = cause;
    try { output = await recoverPreparedMerchant(store, saved, retained.record, attempt); }
    catch (recoveryError) { error = recoveryError; }
  }
  return settle(store, retained, output, error);
}
/** New work captures its original request before the native exporter is invoked. */
export async function prepareSavedMerchant(store, value) {
  const request = normalizeMerchantPreparation(value);
  return own(store, request.id, async () => {
    let retained;
    try { retained = await readMerchantPreparation(store, { project: request.project, preparationId: request.id }); }
    catch (error) { if (error.status !== 404 && error.code !== 'ENOENT') throw error; }
    if (retained) {
      if (!same(retained.record.request, request)) fail('The preparation UUID already belongs to another original request.', 409);
      if (retained.record.state !== 'READY') return { ...await reconcile(store, retained), replayed: true };
    } else {
      const saved = await store.read(request.project);
      if (saved.revision !== request.expectedRevision || request.inputDigest !== undefined && saved.inputDigest !== request.inputDigest)
        fail('The saved project changed before preparation. Reopen its selected revision.', 409);
      let baseline = null;
      if (request.kind === 'revision') {
        baseline = saved.exports.find(item => item.id === request.baselineExportId);
        if (!baseline) fail('Choose a native baseline retained in this project.', 404);
        const compared = await compareDraft(saved.input, baseline);
        if (compared.comparisonDigest !== request.comparisonDigest || !compared.review.ready)
          fail('Compare the exact saved draft and baseline before revision preparation.', 409);
      } else await reviewDraft(saved.input);
      const draftSha256 = (await readRequestBytes(store, 'projects/' + saved.id + '/' + saved.revision + '.json')).sha256;
      const record = { schema: MERCHANT_PREPARATION_SCHEMA, id: request.id, project: saved.id,
        generation: 1, previousRecordSha256: null, kind: request.kind, request,
        draftRevision: saved.revision, draftSha256, inputDigest: saved.inputDigest, baseline: baseline ? { ...baseline } : null,
        createdAt: new Date().toISOString(), updatedAt: null, state: 'READY', attempts: [], output: null };
      record.updatedAt = record.createdAt; record.definitionSha256 = digest(requestJson(definition(record)));
      validatePreparationRecord(record, record.id);
      await writeRequestFile(store, preparationFile(record.id, 1), record);
      retained = await readMerchantPreparation(store, { project: saved.id, preparationId: record.id });
    }
    await attach(store, retained);
    return execute(store, retained, request);
  });
}
/** Reconcile original bytes and project references; this never reruns the exporter. */
export async function recoverSavedMerchant(store, value) {
  shape(value, ['project', 'preparationId']);
  projectName(value.project); requestUuid(value.preparationId);
  return own(store, value.preparationId, async () => reconcile(store, await readMerchantPreparation(store, value)));
}
/** Deliberate new attempt for the SAME frozen source, leaving every old file intact. */
export async function continueSavedMerchant(store, value) {
  const request = normalizePreparationContinuation(value);
  return own(store, request.preparationId, async () => {
    let retained = await readMerchantPreparation(store, { project: request.project, preparationId: request.preparationId });
    const existing = retained.record.attempts.find(item => item.id === request.id);
    if (existing) {
      if (!same(existing.request, request)) fail('The attempt UUID belongs to another continuation.', 409);
      return { ...await reconcile(store, retained), replayed: true };
    }
    if (retained.record.generation !== request.expectedGeneration || retained.sha256 !== request.expectedRecordSha256)
      fail('The original preparation advanced. Read its current generation before continuing.', 409);
    if (retained.record.state !== 'PARTIAL') fail('Recover the original preparation before selecting an explicit new attempt.', 409);
    await source(store, retained.record);
    for (const attempt of retained.record.attempts) for (const file of attempt.files)
      await readRequestBytes(store, file.name, file.sha256);
    await attach(store, retained);
    return execute(store, retained, request);
  });
}
export async function inspectSavedMerchant(store, value) {
  shape(value, ['project', 'preparationId', 'generation', 'recordSha256']);
  const retained = await readMerchantPreparation(store, value);
  await source(store, retained.record);
  const saved = await store.read(retained.record.project), attached = (saved.merchantPreparations ?? []).find(item => item.id === retained.record.id);
  return { project: saved, record: retained.record, recordSha256: retained.sha256, reference: retained.reference,
    latestGeneration: retained.latestGeneration, attachedGeneration: attached?.generation ?? 0,
    active: Boolean(active.get(store)?.has(retained.record.id)),
    history: retained.records.map(item => preparationReference(item.record, item.sha256)) };
}
export async function listSavedMerchants(store, value = {}) {
  shape(value, ['project', 'offset', 'limit', 'expectedSnapshotSha256']);
  projectName(value.project); const offset = integer(value.offset ?? 0, 0), limit = integer(value.limit ?? 20);
  if (limit > 50) fail('Read at most 50 saved preparations per page.');
  let entries;
  try { entries = await readdir(join(store.root, 'merchant-preparations'), { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
  const selected = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      requestUuid(entry.name);
      const first = await readRequestFile(store, preparationFile(entry.name, 1));
      if (first.record.project !== value.project) continue;
      const retained = await readMerchantPreparation(store, { project: value.project, preparationId: entry.name });
      selected.push({ ...retained.reference, active: Boolean(active.get(store)?.has(entry.name)) });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      if (/^[a-f0-9-]{36}$/.test(entry.name)) selected.push({ id: entry.name, state: 'UNAVAILABLE', error: error.message });
    }
  }
  const snapshotSha256 = digest(requestJson(selected));
  if (value.expectedSnapshotSha256 !== undefined && value.expectedSnapshotSha256 !== snapshotSha256)
    fail('Preparation history changed. Refresh its original first page.', 409);
  return { project: value.project, items: selected.slice(offset, offset + limit), total: selected.length,
    offset, limit, nextOffset: offset + limit < selected.length ? offset + limit : null, snapshotSha256 };
}
