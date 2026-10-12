// MIT. Saved request sets and immutable run checkpoints in the original SF105 store.
import { constants } from 'node:fs';
import { open, mkdir, realpath, lstat, link, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, plain, projectName } from './store.mjs';
import { describePreviewRequests, readPreview, previewView } from './authoring.mjs';
import { prepareResponseComparison, validateComparisonPreview } from './comparison.mjs';

export const REQUEST_SET_SCHEMA = 'stellar-forge.graphql-request-set.v1';
export const REQUEST_RUN_SCHEMA = 'stellar-forge.graphql-request-run.v1';
export const REQUEST_ATTEMPT_SCHEMA = 'stellar-forge.graphql-request-run-attempt.v1';
export const REQUEST_CASE_LIMIT = 32;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const CASE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_RECORD = 2 * 1024 * 1024, MAX_GENERATIONS = 256;
export const requestJson = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const requestFailure = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function requestUuid(value, label = 'request UUID') {
  if (typeof value !== 'string' || !UUID.test(value)) requestFailure('Supply an original ' + label + '.');
  return value;
}
function hash(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) requestFailure('Supply the retained ' + label + '.');
  return value;
}
function integer(value, min = 1) {
  if (!Number.isSafeInteger(value) || value < min) requestFailure('Select the original saved revision or generation.');
  return value;
}
function shape(value, names, label) {
  if (!plain(value) || Object.keys(value).some(key => !names.includes(key))) requestFailure('Invalid ' + label + '.');
}
function text(value, label, max, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    requestFailure('Use valid ' + label + ' within ' + max + ' characters.');
  const normalized = value.trim();
  if (!optional && !normalized) requestFailure('Supply ' + label + '.');
  return normalized;
}
const equal = (a, b) => requestJson(a).equals(requestJson(b));
const timestamp = value => typeof value === 'string' && new Date(value).toISOString() === value;

export const requestSetFile = id => 'request-sets/' + requestUuid(id) + '.json';
export const requestRunFile = (id, generation) => {
  requestUuid(id); integer(generation);
  if (generation > MAX_GENERATIONS) requestFailure('This original run has reached its retained checkpoint limit.', 409);
  return 'request-runs/' + id + '/' + generation + '.json';
};
export const requestAttemptFile = (runId, id, completed = false) =>
  'request-runs/' + requestUuid(runId) + '/attempts/' + requestUuid(id) + (completed ? '.done.json' : '.json');

function relativeName(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.startsWith('/') ||
      /[\\\u0000-\u001f\u007f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..'))
    requestFailure('Use an original relative request file.');
  return value;
}
async function folder(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.mode & 0o077 || await realpath(path) !== resolve(path))
    requestFailure('Retain request files in a canonical private directory.');
}
export async function readRequestFile(store, name, expectedSha256, limit = MAX_RECORD) {
  const value = await readRequestBytes(store, name, expectedSha256, limit);
  return { ...value, record: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value.raw)) };
}
export async function readRequestBytes(store, name, expectedSha256, limit = 8 * 1024 * 1024) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8 * 1024 * 1024) requestFailure('Keep the original native file bound.');

  relativeName(name);
  const path = join(store.root, name);
  if (await realpath(path) !== resolve(path)) requestFailure('A retained request file moved outside its original path.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > limit)
      requestFailure('Request records must be bounded private regular files.');
    const raw = await handle.readFile(), sha256 = digest(raw);
    if (raw.length !== stat.size || raw.length > limit || expectedSha256 && sha256 !== expectedSha256)
      requestFailure('The retained request file changed.', 409);
    return { raw, sha256 };
  } finally { await handle.close(); }
}
export async function writeRequestFile(store, name, value) {
  return { ...await writeRequestBytes(store, name, requestJson(value), MAX_RECORD), record: value };
}
export async function writeRequestBytes(store, name, raw, limit = 8 * 1024 * 1024) {
  relativeName(name);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8 * 1024 * 1024 || !Buffer.isBuffer(raw) || raw.length > limit)
    requestFailure('The complete original request file exceeds its native bound.', 413);
  let path = store.root;
  for (const part of name.split('/').slice(0, -1)) { path = join(path, part); await folder(path, true); }
  const target = join(store.root, name), temporary = join(path, '.' + randomUUID() + '.tmp');
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(raw); await file.sync(); await file.close();
    try { await link(temporary, target); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = await readRequestBytes(store, name, undefined, limit);
      if (!old.raw.equals(raw)) requestFailure('This original request file already retains different bytes.', 409);
    }
    const directory = await open(dirname(target), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await file.close().catch(() => {}); await rm(temporary, { force: true }); }
  return { raw, sha256: digest(raw) };
}
async function missing(operation) {
  try { return await operation(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function requestCases(cases) {
  if (!Array.isArray(cases) || !cases.length || cases.length > REQUEST_CASE_LIMIT)
    requestFailure('Choose 1–32 named operation and variable cases.');
  const seen = new Set();
  return cases.map(item => {
    shape(item, ['id', 'title', 'operation', 'variables', 'notes'], 'request case');
    if (typeof item.id !== 'string' || !CASE.test(item.id) || seen.has(item.id))
      requestFailure('Each request case needs a unique stable ID.');
    seen.add(item.id);
    if (typeof item.operation !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(item.operation) || !plain(item.variables))
      requestFailure('Select an original operation and its variable object.');
    if (requestJson(item.variables).length > 65536) requestFailure('A case variable object exceeds 64 KiB.');
    return { id: item.id, title: text(item.title, 'case title', 160), operation: item.operation,
      variables: structuredClone(item.variables), notes: text(item.notes, 'case notes', 2000, true) };
  });
}
export function normalizeRequestSet(value) {
  shape(value, ['id', 'project', 'expectedRevision', 'title', 'notes', 'cases', 'basedOn'], 'saved request set');
  const basedOn = value.basedOn ?? null;
  if (basedOn !== null) {
    shape(basedOn, ['id', 'recordSha256'], 'original request set');
    requestUuid(basedOn.id); hash(basedOn.recordSha256, 'original set hash');
  }
  return { id: requestUuid(value.id), project: projectName(value.project), expectedRevision: integer(value.expectedRevision),
    title: text(value.title, 'request-set title', 160), notes: text(value.notes, 'request-set notes', 6000, true),
    cases: requestCases(value.cases), basedOn: basedOn && { id: basedOn.id, recordSha256: basedOn.recordSha256 } };
}
export function requestSetReference(record, sha256) {
  return { id: record.id, project: record.project, title: record.title, draftRevision: record.draftRevision,
    inputDigest: record.inputDigest, caseCount: record.cases.length,
    operations: [...new Set(record.cases.map(item => item.operation))], createdAt: record.createdAt, recordSha256: sha256 };
}
export function validateRequestSetRecord(record, id) {
  if (!plain(record) || record.schema !== REQUEST_SET_SCHEMA || record.id !== requestUuid(id) ||
      record.project !== record.request?.project || record.id !== record.request?.id ||
      record.draftRevision !== record.request?.expectedRevision || !timestamp(record.createdAt) ||
      !SHA.test(record.inputDigest ?? '') || !equal(normalizeRequestSet(record.request), record.request) ||
      digest(requestJson(record.request)) !== record.requestSha256 || record.title !== record.request.title ||
      record.notes !== record.request.notes || !Array.isArray(record.cases) || record.cases.length !== record.request.cases.length)
    requestFailure('The original saved request-set record is inconsistent.', 409);
  for (let i = 0; i < record.cases.length; i++) {
    const item = record.cases[i], selected = record.request.cases[i];
    if (!equal({ id: item.id, title: item.title, operation: item.operation, variables: item.variables, notes: item.notes }, selected) ||
        !plain(item.request) || !plain(item.source) || !plain(item.connection) ||
        digest(Buffer.from(JSON.stringify(item.request))) !== item.requestSha256)
      requestFailure('The request case no longer matches its retained admission.', 409);
  }
  return record;
}
export async function readRequestSet(store, reference) {
  const entry = await readRequestFile(store, requestSetFile(reference.id), reference.recordSha256);
  const record = validateRequestSetRecord(entry.record, reference.id);
  if (reference.project && reference.project !== record.project || reference.inputDigest && reference.inputDigest !== record.inputDigest)
    requestFailure('The original request set belongs to another project or source.', 409);
  return { ...entry, reference: requestSetReference(record, entry.sha256) };
}
export async function verifyRequestSetSourcesFrom(record, { loadDraft, loadSet }) {
  validateRequestSetRecord(record, record.id);
  const draft = await loadDraft(record.draftRevision);
  if (draft.inputDigest !== record.inputDigest) requestFailure('The request set changed its original saved draft.', 409);
  const admitted = describePreviewRequests(draft, record.request.cases);
  for (let i = 0; i < admitted.length; i++) {
    const expected = { ...record.request.cases[i], ...admitted[i] };
    if (!equal(expected, record.cases[i])) requestFailure('The original request case admission changed.', 409);
  }
  if (record.request.basedOn) {
    const origin = await loadSet(record.request.basedOn);
    if (origin.record.id === record.id || origin.record.draftRevision >= record.draftRevision ||
        !(draft.requestSets ?? []).some(item => item.id === origin.record.id && item.recordSha256 === origin.sha256))
      requestFailure('The copied request set is not in the original saved source history.', 409);
  }
  return draft;
}
export async function verifyRequestSetSources(store, record) {
  return verifyRequestSetSourcesFrom(record, {
    loadDraft: revision => store.read(record.project, revision),
    loadSet: reference => readRequestSet(store, { ...reference, project: record.project }),
  });
}
export async function prepareRequestSet(store, value) {
  const request = normalizeRequestSet(value), requestSha256 = digest(requestJson(request));
  let retained = await missing(() => readRequestSet(store, { id: request.id, project: request.project }));
  let current = await store.read(request.project);
  if (retained) {
    if (retained.record.requestSha256 !== requestSha256) requestFailure('This request-set UUID already has different original input.', 409);
    const attached = (current.requestSets ?? []).find(item => item.id === request.id);
    if (attached) {
      if (!equal(attached, retained.reference)) requestFailure('The saved request-set reference changed.', 409);
      return { project: current, ...retained, replayed: true };
    }
  }
  if (current.revision !== request.expectedRevision) requestFailure('The project changed. Recover the retained set or save against the current revision.', 409);
  if (!retained) {
    if (request.basedOn && !(current.requestSets ?? []).some(item => item.id === request.basedOn.id && item.recordSha256 === request.basedOn.recordSha256))
      requestFailure('Select a request set already retained in this project.', 409);
    const admitted = describePreviewRequests(current, request.cases);
    const record = { schema: REQUEST_SET_SCHEMA, id: request.id, project: request.project,
      createdAt: new Date().toISOString(), draftRevision: current.revision, inputDigest: current.inputDigest,
      title: request.title, notes: request.notes, request, requestSha256,
      cases: request.cases.map((item, i) => ({ ...item, ...admitted[i] })) };
    retained = await writeRequestFile(store, requestSetFile(record.id), record);
    retained.reference = requestSetReference(record, retained.sha256);
  }
  await verifyRequestSetSources(store, retained.record);
  current = await store.save({ id: current.id, expectedRevision: current.revision, input: current.input, requestSetRecord: retained.reference });
  return { project: current, ...retained, replayed: false };
}
export async function recoverRequestSet(store, value) {
  shape(value, ['project', 'requestSetId', 'expectedRevision', 'recordSha256'], 'request-set recovery');
  const project = projectName(value.project), retained = await readRequestSet(store,
    { id: requestUuid(value.requestSetId), project, recordSha256: hash(value.recordSha256, 'request-set hash') });
  let current = await store.read(project);
  const prior = (current.requestSets ?? []).find(item => item.id === retained.record.id);
  if (prior) {
    if (!equal(prior, retained.reference)) requestFailure('The original request set changed.', 409);
    return { project: current, ...retained, replayed: true };
  }
  if (current.revision !== integer(value.expectedRevision)) requestFailure('Reopen the current project before recovering the saved set.', 409);
  await verifyRequestSetSources(store, retained.record);
  current = await store.save({ id: project, expectedRevision: current.revision, input: current.input, requestSetRecord: retained.reference });
  return { project: current, ...retained, replayed: false };
}
export function normalizeRunStart(value) {
  shape(value, ['id', 'project', 'expectedRevision', 'requestSetId', 'requestSetSha256', 'title', 'caseIds', 'allowLoopback'], 'request run');
  if (!Array.isArray(value.caseIds) || !value.caseIds.length || value.caseIds.length > REQUEST_CASE_LIMIT ||
      new Set(value.caseIds).size !== value.caseIds.length || value.caseIds.some(id => typeof id !== 'string' || !CASE.test(id)))
    requestFailure('Select 1–32 unique cases from the retained request set.');
  if (typeof value.allowLoopback !== 'boolean') requestFailure('Choose the original local-development source option.');
  return { id: requestUuid(value.id), project: projectName(value.project), expectedRevision: integer(value.expectedRevision),
    requestSetId: requestUuid(value.requestSetId), requestSetSha256: hash(value.requestSetSha256, 'request-set hash'),
    title: text(value.title, 'run title', 160), caseIds: [...value.caseIds], allowLoopback: value.allowLoopback };
}
export function normalizeRunContinuation(value) {
  shape(value, ['id', 'project', 'runId', 'expectedRevision', 'expectedGeneration', 'expectedRecordSha256'], 'original run continuation');
  return { id: requestUuid(value.id), project: projectName(value.project), runId: requestUuid(value.runId),
    expectedRevision: integer(value.expectedRevision), expectedGeneration: integer(value.expectedGeneration),
    expectedRecordSha256: hash(value.expectedRecordSha256, 'run checkpoint hash') };
}
export function requestRunReference(record, sha256) {
  return { id: record.id, project: record.project, requestSetId: record.requestSetId,
    requestSetSha256: record.requestSetSha256, draftRevision: record.draftRevision, inputDigest: record.inputDigest,
    title: record.title, generation: record.generation, previousRecordSha256: record.previousRecordSha256,
    state: record.state, caseCount: record.cases.length, completedCases: record.cases.filter(item => item.state === 'COMPLETED').length,
    unresolvedCases: record.cases.filter(item => item.state === 'UNRESOLVED').length,
    updatedAt: record.updatedAt, recordSha256: sha256 };
}
export function validateRequestRunRecord(record, id, previous = null) {
  if (!plain(record) || record.schema !== REQUEST_RUN_SCHEMA || record.id !== requestUuid(id) ||
      record.id !== record.startRequest?.id || record.project !== record.startRequest?.project ||
      !equal(normalizeRunStart(record.startRequest), record.startRequest) ||
      digest(requestJson(record.startRequest)) !== record.startRequestSha256 ||
      record.requestSetId !== record.startRequest.requestSetId || record.requestSetSha256 !== record.startRequest.requestSetSha256 ||
      record.title !== record.startRequest.title || record.allowLoopback !== record.startRequest.allowLoopback ||
      !SHA.test(record.inputDigest ?? '') || !Number.isSafeInteger(record.draftRevision) || record.draftRevision < 1 ||
      !timestamp(record.createdAt) || !timestamp(record.updatedAt) ||
      !Array.isArray(record.cases) || !equal(record.cases.map(item => item.id), record.startRequest.caseIds) ||
      !['READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'PARTIAL'].includes(record.state) ||
      !plain(record.event) || !UUID.test(record.event.attemptId ?? ''))
    requestFailure('The original run checkpoint is inconsistent.', 409);
  integer(record.generation);
  if (record.generation > MAX_GENERATIONS || record.generation !== (previous?.record.generation ?? 0) + 1 ||
      record.previousRecordSha256 !== (previous?.sha256 ?? null))
    requestFailure('The run checkpoint does not continue its original history.', 409);
  if (previous) {
    for (const key of ['id', 'project', 'title', 'createdAt', 'draftRevision', 'inputDigest', 'requestSetId', 'requestSetSha256',
      'allowLoopback', 'startRequestSha256', 'startRequest'])
      if (!equal(record[key], previous.record[key])) requestFailure('A later run checkpoint changed the selected original inputs.', 409);
  }
  const previews = new Set();
  for (let i = 0; i < record.cases.length; i++) {
    const item = record.cases[i], prior = previous?.record.cases[i];
    shape(item, ['id', 'previewId', 'state', 'reference', 'error'], 'run case');
    if (!UUID.test(item.previewId ?? '') || previews.has(item.previewId) || !['PENDING', 'COMPLETED', 'UNRESOLVED'].includes(item.state))
      requestFailure('The run case identity is inconsistent.', 409);
    previews.add(item.previewId);
    if (prior && (prior.id !== item.id || prior.previewId !== item.previewId ||
        prior.state === 'COMPLETED' && !equal(prior, item) ||
        prior.state === 'UNRESOLVED' && item.state === 'PENDING'))
      requestFailure('A run checkpoint replaced an earlier case result or original request UUID.', 409);
    if (!previous && item.state !== 'PENDING') requestFailure('A run must begin with its original unrequested cases.', 409);
    if (item.state === 'COMPLETED') {
      if (!plain(item.reference) || item.reference.id !== item.previewId || item.reference.project !== record.project ||
          item.reference.inputDigest !== record.inputDigest || item.reference.state !== 'COMPLETED' ||
          !SHA.test(item.reference.recordSha256 ?? '') || item.error !== undefined)
        requestFailure('The completed run case changed its original preview reference.', 409);
    } else if (item.reference !== undefined || item.state === 'UNRESOLVED' &&
        (!plain(item.error) || item.error.code !== 'ORIGINAL_RESPONSE_UNAVAILABLE'))
      requestFailure('The unresolved run case has an inconsistent original outcome.', 409);
  }
  if (record.state === 'COMPLETED' && record.cases.some(item => item.state !== 'COMPLETED') ||
      record.state === 'PARTIAL' && (record.cases.some(item => item.state === 'PENDING') || !record.cases.some(item => item.state === 'UNRESOLVED')) ||
      record.generation === 1 && record.state !== 'READY' || record.generation > 1 && record.state === 'READY')
    requestFailure('The saved run state differs from its retained case outcomes.', 409);
  return record;
}
export async function readRequestRun(store, reference) {
  const generation = integer(reference.generation);
  if (generation > MAX_GENERATIONS) requestFailure('Choose an existing run checkpoint.');
  const records = [];
  for (let number = 1; number <= generation; number++) {
    const entry = await readRequestFile(store, requestRunFile(reference.id, number), number === generation ? reference.recordSha256 : undefined);
    validateRequestRunRecord(entry.record, reference.id, records.at(-1) ?? null);
    if (reference.project && entry.record.project !== reference.project) requestFailure('This run belongs to another project.', 409);
    records.push(entry);
  }
  const last = records.at(-1);
  return { ...last, records, reference: requestRunReference(last.record, last.sha256) };
}
export async function verifyRunSources(store, retained) {
  const run = retained.record, selected = await readRequestSet(store,
    { id: run.requestSetId, project: run.project, recordSha256: run.requestSetSha256 });
  const draft = await verifyRequestSetSources(store, selected.record);
  if (run.draftRevision !== draft.revision || run.inputDigest !== draft.inputDigest)
    requestFailure('The run changed its original source draft.', 409);
  for (const item of run.cases) {
    const source = selected.record.cases.find(candidate => candidate.id === item.id);
    if (!source) requestFailure('A run case is absent from its original set.', 409);
    if (item.state === 'COMPLETED') await verifyRunPreview(store, run, source, item.previewId, item.reference);
  }
  return { selected, draft };
}
export function verifyRunPreviewRecord(run, selectedCase, record, sha256, reference) {
  validateComparisonPreview(record, { id: record.id, project: run.project, inputDigest: run.inputDigest, draftRevision: run.draftRevision });
  if (record.operation !== selectedCase.operation || record.requestSha256 !== selectedCase.requestSha256 ||
      !equal(record.request, selectedCase.request) || !equal(record.source, selectedCase.source) ||
      record.draftRevision !== run.draftRevision || !SHA.test(sha256 ?? ''))
    requestFailure('The original preview does not belong to this selected run case.', 409);
  const actual = { ...previewView(record), recordSha256: sha256 };
  if (reference && !equal(reference, actual)) requestFailure('The run reference differs from its exact native preview.', 409);
  return { record, reference: actual };
}
export async function verifyRunPreview(store, run, selectedCase, id, reference) {
  const record = await readPreview(store, { id, project: run.project, inputDigest: run.inputDigest,
    ...(reference?.recordSha256 ? { recordSha256: reference.recordSha256 } : {}) });
  const file = await readRequestFile(store, 'previews/' + id + '.json', reference?.recordSha256, 3 * 1024 * 1024);
  return verifyRunPreviewRecord(run, selectedCase, record, file.sha256, reference);
}
export function verifyRunPendingRecord(run, selectedCase, id, value) {
  if (value.schema !== 'stellar-forge.graphql-workspace-preview.v1' || value.state !== 'STARTED' ||
      value.id !== id || value.project !== run.project || value.draftRevision !== run.draftRevision ||
      value.inputDigest !== run.inputDigest || value.operation !== selectedCase.operation ||
      value.requestSha256 !== selectedCase.requestSha256 || !equal(value.request, selectedCase.request) || !equal(value.source, selectedCase.source))
    requestFailure('The pending original request belongs to another case.', 409);
  return value;
}
export async function inspectRunCase(store, run, selectedCase, item) {
  const complete = await missing(() => verifyRunPreview(store, run, selectedCase, item.previewId, item.reference));
  if (complete) return { state: 'COMPLETED', ...complete };
  const pending = await missing(() => readRequestFile(store, 'previews/' + item.previewId + '.pending.json'));
  if (!pending) {
    if (item.state === 'COMPLETED' || item.state === 'UNRESOLVED')
      requestFailure('The run lost the retained original request or response.', 409);
    return { state: 'PENDING' };
  }
  verifyRunPendingRecord(run, selectedCase, item.previewId, pending.record);
  return { state: 'UNRESOLVED', pending };
}
export async function attachedRun(store, project, id) {
  const saved = await store.read(projectName(project)), reference = (saved.requestRuns ?? []).find(item => item.id === requestUuid(id));
  if (!reference) requestFailure('The run is not attached to this saved project. Recover its first checkpoint.', 409);
  const retained = await readRequestRun(store, reference);
  if (!equal(reference, retained.reference)) requestFailure('The project run reference changed.', 409);
  return { saved, retained };
}
export async function attachRunCheckpoint(store, retained, previewRecord) {
  const current = await store.read(retained.record.project), prior = (current.requestRuns ?? []).find(item => item.id === retained.record.id);
  if (prior?.generation >= retained.record.generation) {
    const original = await readRequestRun(store, { id: prior.id, project: current.id, generation: retained.record.generation });
    if (original.sha256 !== retained.sha256) requestFailure('A different original run checkpoint is already attached.', 409);
    return { project: current, ...retained, replayed: true };
  }
  if ((prior?.generation ?? 0) + 1 !== retained.record.generation || (prior?.recordSha256 ?? null) !== retained.record.previousRecordSha256)
    requestFailure('Recover the preceding original run checkpoint first.', 409);
  const project = await store.save({ id: current.id, expectedRevision: current.revision, input: current.input,
    requestRunRecord: retained.reference ?? requestRunReference(retained.record, retained.sha256), ...(previewRecord ? { previewRecord } : {}) });
  return { project, ...retained, replayed: false };
}
export async function recoverRunCheckpoints(store, project, runId) {
  let state = await attachedRun(store, project, runId);
  while (state.retained.record.generation < MAX_GENERATIONS) {
    const number = state.retained.record.generation + 1;
    const next = await missing(() => readRequestFile(store, requestRunFile(runId, number)));
    if (!next) break;
    validateRequestRunRecord(next.record, runId, state.retained);
    next.reference = requestRunReference(next.record, next.sha256);
    await verifyRunSources(store, next);
    // Every finished case is attached with its checkpoint. More than one can
    // exist only during receiving/recovery; reconcile them through original save.
    for (const item of next.record.cases.filter(item => item.state === 'COMPLETED')) {
      const current = await store.read(project), old = (current.previews ?? []).find(value => value.id === item.previewId);
      if (old && !equal(old, item.reference)) requestFailure('The original completed preview changed during recovery.', 409);
      if (!old) await store.save({ id: current.id, expectedRevision: current.revision, input: current.input, previewRecord: item.reference });
    }
    await attachRunCheckpoint(store, next);
    state = await attachedRun(store, project, runId);
  }
  return state;
}
export async function prepareRequestRun(store, value) {
  const request = normalizeRunStart(value), startRequestSha256 = digest(requestJson(request));
  let retained = await missing(() => readRequestRun(store, { id: request.id, project: request.project, generation: 1 }));
  let current = await store.read(request.project);
  if (retained) {
    if (retained.record.startRequestSha256 !== startRequestSha256) requestFailure('This run UUID already retains another selection.', 409);
    const prior = (current.requestRuns ?? []).find(item => item.id === request.id);
    if (prior) return { ...await recoverRunCheckpoints(store, current.id, request.id), replayed: true };
  }
  if (current.revision !== request.expectedRevision) requestFailure('The project changed. Reopen or recover the retained run before continuing.', 409);
  const selected = await readRequestSet(store, { id: request.requestSetId, project: current.id, recordSha256: request.requestSetSha256 });
  if (!(current.requestSets ?? []).some(item => item.id === selected.record.id && item.recordSha256 === selected.sha256) ||
      current.inputDigest !== selected.record.inputDigest)
    requestFailure('Save a request set for the current source draft before starting a new run.', 409);
  await verifyRequestSetSources(store, selected.record);
  if (request.caseIds.some(id => !selected.record.cases.some(item => item.id === id))) requestFailure('A selected case is absent from the saved request set.');
  if (!retained) {
    const now = new Date().toISOString();
    const record = { schema: REQUEST_RUN_SCHEMA, id: request.id, project: request.project, title: request.title,
      createdAt: now, updatedAt: now, draftRevision: selected.record.draftRevision, inputDigest: selected.record.inputDigest,
      requestSetId: selected.record.id, requestSetSha256: selected.sha256, allowLoopback: request.allowLoopback,
      startRequest: request, startRequestSha256, generation: 1, previousRecordSha256: null, state: 'READY',
      event: { kind: 'admitted', attemptId: request.id },
      cases: request.caseIds.map(id => ({ id, previewId: randomUUID(), state: 'PENDING' })) };
    retained = await writeRequestFile(store, requestRunFile(request.id, 1), record);
    retained.reference = requestRunReference(record, retained.sha256);
  }
  const attached = await attachRunCheckpoint(store, retained);
  return { saved: attached.project, retained, replayed: false };
}
export async function appendRunCheckpoint(store, retained, { cases = retained.record.cases, state, event }, previewRecord) {
  const old = retained.record;
  const record = { ...old, generation: old.generation + 1, previousRecordSha256: retained.sha256,
    updatedAt: new Date().toISOString(), cases, state, event };
  validateRequestRunRecord(record, old.id, retained);
  const next = await writeRequestFile(store, requestRunFile(record.id, record.generation), record);
  next.reference = requestRunReference(record, next.sha256);
  return attachRunCheckpoint(store, next, previewRecord);
}
export async function recoverRequestRun(store, value) {
  shape(value, ['project', 'runId', 'expectedRevision', 'generation', 'expectedRecordSha256'], 'run recovery');
  const project = projectName(value.project), id = requestUuid(value.runId);
  let current = await store.read(project);
  const selected = await readRequestRun(store, { id, project, generation: integer(value.generation),
    recordSha256: hash(value.expectedRecordSha256, 'run checkpoint hash') });
  const prior = (current.requestRuns ?? []).find(item => item.id === id);
  if (prior?.generation >= selected.record.generation) return { ...await attachedRun(store, project, id), replayed: true };
  if (current.revision !== integer(value.expectedRevision)) requestFailure('Reopen the current project before recovering the run.', 409);
  await verifyRunSources(store, selected);
  if (!prior) {
    const first = selected.records[0]; first.reference = requestRunReference(first.record, first.sha256);
    await attachRunCheckpoint(store, first);
  }
  return { ...await recoverRunCheckpoints(store, project, id), replayed: false };
}
export async function inspectRequestRun(store, { project, runId, generation, expectedRecordSha256 } = {}) {
  const current = await store.read(projectName(project)), id = requestUuid(runId), reference = (current.requestRuns ?? []).find(item => item.id === id);
  const selected = await readRequestRun(store, { id, project, generation: generation ?? reference?.generation ?? 1,
    ...(expectedRecordSha256 ? { recordSha256: hash(expectedRecordSha256, 'run checkpoint hash') } : {}) });
  const requestSet = await readRequestSet(store, { id: selected.record.requestSetId, project, recordSha256: selected.record.requestSetSha256 });
  const next = selected.record.generation < MAX_GENERATIONS
    ? await missing(() => readRequestFile(store, requestRunFile(id, selected.record.generation + 1))) : null;
  if (next) validateRequestRunRecord(next.record, id, selected);
  return { project: current, record: selected.record, recordSha256: selected.sha256,
    reference: selected.reference, requestSet: requestSet.record, requestSetSha256: requestSet.sha256,
    attachedGeneration: reference?.generation ?? 0, pending: next ? { generation: next.record.generation,
      recordSha256: next.sha256, state: next.record.state } : null,
    history: selected.records.map(item => requestRunReference(item.record, item.sha256)) };
}
export async function prepareRunComparison(store, value) {
  shape(value, ['id', 'project', 'expectedRevision', 'title', 'baseline', 'candidate', 'caseIds'], 'selected run comparison');
  projectName(value.project); requestUuid(value.id); integer(value.expectedRevision);
  for (const selection of [value.baseline, value.candidate]) {
    shape(selection, ['runId', 'generation', 'recordSha256'], 'original run checkpoint');
    requestUuid(selection.runId); integer(selection.generation); hash(selection.recordSha256, 'selected run hash');
  }
  if (!Array.isArray(value.caseIds) || !value.caseIds.length || value.caseIds.length > REQUEST_CASE_LIMIT ||
      new Set(value.caseIds).size !== value.caseIds.length) requestFailure('Select 1–32 case IDs present in both retained runs.');
  const load = selection => readRequestRun(store, { id: selection.runId, project: value.project,
    generation: selection.generation, recordSha256: selection.recordSha256 });
  const baseline = await load(value.baseline), candidate = await load(value.candidate);
  const bSet = await verifyRunSources(store, baseline), cSet = await verifyRunSources(store, candidate);
  const pairs = value.caseIds.map(id => {
    const before = baseline.record.cases.find(item => item.id === id), after = candidate.record.cases.find(item => item.id === id);
    if (!before || !after || before.state !== 'COMPLETED' || after.state !== 'COMPLETED')
      requestFailure('Each compared case must have its original completed preview on both sides.');
    const selected = cSet.selected.record.cases.find(item => item.id === id) ?? bSet.selected.record.cases.find(item => item.id === id);
    return { id, title: selected.title, objective: selected.notes,
      baselineId: before.previewId, candidateId: after.previewId };
  });
  return prepareResponseComparison(store, { id: value.id, project: value.project, expectedRevision: value.expectedRevision,
    title: text(value.title, 'comparison title', 160), pairs });
}
