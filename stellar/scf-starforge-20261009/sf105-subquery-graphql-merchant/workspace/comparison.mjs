// MIT. Retained response cohorts and reviewer history on the original SF105 writer.
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, link, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { digest, projectName, plain, validateVersion } from './store.mjs';
import { readPreview } from './authoring.mjs';
import { RESPONSE_COMPARISON_ALGORITHM, parseResponse, summarizeResponses, responseChangePage } from './comparison-values.mjs';

export const RESPONSE_COMPARISON_SCHEMA = 'stellar-forge.graphql-response-comparison.v1';
export const RESPONSE_REVIEW_DECISIONS = ['UNREVIEWED', 'ACCEPTED', 'CHANGES_REQUESTED', 'NOT_APPLICABLE'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const CASE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_GENERATION = 256, MAX_PAIRS = 16, MAX_RECORD = 2 * 1024 * 1024;
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function shape(value, keys, label) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Invalid ' + label + '.');
}
function uuid(value, label = 'comparison ID') {
  if (typeof value !== 'string' || !UUID.test(value)) fail('Use the original UUID for ' + label + '.');
  return value;
}
function positive(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail('Select the current ' + label + '.');
  return value;
}
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
      || required && !value.trim()) fail(label + ' must contain ' + (required ? '1–' : '0–') + max + ' characters.');
  return value.trim();
}
function prepareRequest(input) {
  shape(input, ['id', 'project', 'expectedRevision', 'title', 'pairs'], 'comparison request');
  const ids = new Set();
  if (!Array.isArray(input.pairs) || !input.pairs.length || input.pairs.length > MAX_PAIRS)
    fail('Select 1–16 retained baseline/candidate cases.');
  return { kind: 'prepare', id: uuid(input.id), project: projectName(input.project),
    expectedRevision: positive(input.expectedRevision, 'project revision'), title: text(input.title, 'Comparison title', 160, true),
    pairs: input.pairs.map(pair => {
      shape(pair, ['id', 'title', 'objective', 'baselineId', 'candidateId'], 'comparison case');
      if (!CASE.test(pair.id ?? '') || ids.has(pair.id)) fail('Give every comparison case a unique short ID.');
      ids.add(pair.id);
      return { id: pair.id, title: text(pair.title, 'Case title', 160, true),
        objective: text(pair.objective ?? '', 'Case objective', 2000),
        baselineId: uuid(pair.baselineId, 'baseline preview'), candidateId: uuid(pair.candidateId, 'candidate preview') };
    }) };
}
function reviewRequest(input, pairIds) {
  shape(input, ['id', 'project', 'comparisonId', 'expectedRevision', 'expectedGeneration', 'expectedRecordSha256',
    'reviewer', 'notes', 'decisions'], 'review request');
  if (!SHA.test(input.expectedRecordSha256 ?? '')) fail('Use the inspected comparison record hash.');
  if (!Array.isArray(input.decisions) || input.decisions.length !== pairIds.length) fail('Retain a decision for every selected case.');
  const byId = new Map();
  for (const row of input.decisions) {
    shape(row, ['pairId', 'decision', 'notes'], 'case decision');
    if (!pairIds.includes(row.pairId) || byId.has(row.pairId) || !RESPONSE_REVIEW_DECISIONS.includes(row.decision))
      fail('Choose one explicit review decision for every original case.');
    byId.set(row.pairId, { pairId: row.pairId, decision: row.decision, notes: text(row.notes ?? '', 'Case notes', 4000) });
  }
  return { kind: 'review', id: uuid(input.id, 'review request'), comparisonId: uuid(input.comparisonId),
    project: projectName(input.project), expectedRevision: positive(input.expectedRevision, 'project revision'),
    expectedGeneration: positive(input.expectedGeneration, 'comparison generation', MAX_GENERATION - 1),
    expectedRecordSha256: input.expectedRecordSha256, reviewer: text(input.reviewer, 'Reviewer label', 160, true),
    notes: text(input.notes ?? '', 'Review notes', 8000), decisions: pairIds.map(id => byId.get(id)) };
}
function reviewOf(request, pairIds) {
  return request.kind === 'prepare' ? { reviewer: '', notes: '', decisions: pairIds.map(pairId =>
    ({ pairId, decision: 'UNREVIEWED', notes: '' })) }
    : { reviewer: request.reviewer, notes: request.notes, decisions: request.decisions };
}
export function responseReviewSummary(review) {
  const counts = Object.fromEntries(RESPONSE_REVIEW_DECISIONS.map(key => [key, 0]));
  for (const row of review.decisions) counts[row.decision]++;
  return { counts, state: counts.CHANGES_REQUESTED ? 'CHANGES_REQUESTED' : counts.UNREVIEWED ? 'UNREVIEWED'
    : counts.ACCEPTED ? 'ACCEPTED' : 'NOT_APPLICABLE' };
}
export function comparisonReference(record, recordSha256) {
  return { id: record.id, project: record.project, generation: record.generation, definitionSha256: record.definitionSha256,
    recordSha256, previousRecordSha256: record.previousRecordSha256, title: record.definition.title,
    cases: record.definition.pairs.length, createdAt: record.createdAt, updatedAt: record.updatedAt,
    review: responseReviewSummary(record.review) };
}
export function comparisonRelativeFile(id, generation) {
  return 'comparisons/' + uuid(id) + '/' + positive(generation, 'comparison generation', MAX_GENERATION) + '.json';
}
async function privateDirectory(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.mode & 0o077 || await realpath(path) !== resolve(path))
    fail('Response comparisons require original private regular directories.');
}
async function rawRecord(store, id, generation) {
  const path = join(store.root, comparisonRelativeFile(id, generation));
  await privateDirectory(dirname(path));
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.mode & 0o077 || info.size > MAX_RECORD) fail('The comparison record must remain a bounded private file.');
    const raw = await file.readFile();
    if (raw.length !== info.size || raw.length > MAX_RECORD) fail('The retained comparison changed while reading.', 409);
    return { raw, sha256: digest(raw), record: decode(raw) };
  } finally { await file.close(); }
}
async function publish(store, record) {
  const path = join(store.root, comparisonRelativeFile(record.id, record.generation)), parent = dirname(path);
  await privateDirectory(parent, true);
  const raw = Buffer.from(json(record));
  if (raw.length > MAX_RECORD) fail('The complete comparison exceeds its retained record limit.');
  const temp = join(parent, '.' + randomUUID() + '.next');
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
    try { await link(temp, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await rawRecord(store, record.id, record.generation);
      if (existing.sha256 !== digest(raw)) fail('An original comparison generation already has different bytes.', 409);
    }
    const directory = await open(parent, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temp, { force: true }); }
  return { raw, sha256: digest(raw), record };
}
async function originalDraft(store, project, revision, expectedSha256) {
  const committed = await store.read(project, revision);
  const path = join(store.root, 'projects', projectName(project), positive(revision, 'draft revision') + '.json');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.mode & 0o077 || info.size > 8 * 1024 * 1024) fail('The original draft must remain a private regular file.');
    const raw = await file.readFile(), sha256 = digest(raw);
    if (raw.length !== info.size || expectedSha256 && expectedSha256 !== sha256) fail('The original comparison draft bytes changed.', 409);
    const record = validateVersion(decode(raw), project);
    if (record.revision !== revision || record.inputDigest !== committed.inputDigest) fail('The original committed draft changed.', 409);
    return { record, raw, sha256 };
  } finally { await file.close(); }
}
function previewReference(value, reference, draftSha256) {
  return { id: value.id, project: value.project, draftRevision: value.draftRevision, draftSha256,
    inputDigest: value.inputDigest, recordSha256: reference.recordSha256 };
}
export function validateComparisonPreview(value, reference) {
  if (!plain(value) || value.schema !== 'stellar-forge.graphql-workspace-preview.v1' || value.state !== 'COMPLETED'
      || value.id !== reference.id || value.project !== reference.project || value.inputDigest !== reference.inputDigest
      || value.draftRevision !== reference.draftRevision || !plain(value.request) || typeof value.request.query !== 'string'
      || !plain(value.request.variables) || typeof value.responseBase64 !== 'string' || !Number.isInteger(value.status)
      || value.status < 100 || value.status > 599 || !plain(value.source))
    fail('A comparison side differs from its original completed preview.');
  const bytes = Buffer.from(value.responseBase64, 'base64');
  if (bytes.length !== value.responseBytes || bytes.length > 2 * 1024 * 1024 || digest(bytes) !== value.responseSha256
      || digest(JSON.stringify(value.request)) !== value.requestSha256) fail('The original request or response bytes changed.', 409);
  return value;
}
function response(value) {
  try { return parseResponse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value.responseBase64, 'base64'))); }
  catch { return parseResponse(null); }
}
function interval(value) {
  const start = Date.parse(value.createdAt), finish = Date.parse(value.completedAt);
  return Number.isFinite(start) && Number.isFinite(finish) && finish >= start ? finish - start : null;
}
function previewContext(value, reference) {
  return { ...reference, operation: value.operation, source: value.source, requestSha256: value.requestSha256,
    responseSha256: value.responseSha256, responseBytes: value.responseBytes, responseType: value.responseType, status: value.status,
    createdAt: value.createdAt, completedAt: value.completedAt, observedRecordIntervalMs: interval(value) };
}
function analyze(pair, baseline, candidate) {
  return { pairId: pair.id, baseline: previewContext(baseline, pair.baseline), candidate: previewContext(candidate, pair.candidate),
    context: { samePreview: baseline.id === candidate.id, sameOperationName: baseline.operation === candidate.operation,
      sameQueryText: baseline.request.query === candidate.request.query,
      sameVariables: summarizeResponses(parseResponse(JSON.stringify(baseline.request.variables)),
        parseResponse(JSON.stringify(candidate.request.variables))).jsonEquivalent,
      sameRequestBytes: baseline.requestSha256 === candidate.requestSha256,
      sameSchema: SHA.test(baseline.source.schemaSha256 ?? '') && SHA.test(candidate.source.schemaSha256 ?? '')
        ? baseline.source.schemaSha256 === candidate.source.schemaSha256 : null,
      sameSourceSnapshot: SHA.test(baseline.source.sourceSha256 ?? '') && SHA.test(candidate.source.sourceSha256 ?? '')
        ? baseline.source.sourceSha256 === candidate.source.sourceSha256 : null,
      sameEndpoint: typeof baseline.source.origin === 'string' && typeof candidate.source.origin === 'string'
        && typeof baseline.source.path === 'string' && typeof candidate.source.path === 'string'
        ? baseline.source.origin === candidate.source.origin && baseline.source.path === candidate.source.path : null },
    sameStatus: baseline.status === candidate.status, sameResponseBytes: baseline.responseSha256 === candidate.responseSha256,
    response: summarizeResponses(response(baseline), response(candidate)),
    timing: { basis: 'Original preview createdAt to completedAt; includes preparation, transport and retention work.',
      causalPerformanceClaim: false, baselineMs: interval(baseline), candidateMs: interval(candidate),
      observedDifferenceMs: interval(baseline) === null || interval(candidate) === null ? null : interval(candidate) - interval(baseline) } };
}
/** Pure original-record validation is also used by the existing project receiver. */
export function validateComparisonRecord(value, reference) {
  if (!plain(value) || value.schema !== RESPONSE_COMPARISON_SCHEMA || value.algorithm !== RESPONSE_COMPARISON_ALGORITHM
      || !UUID.test(value.id ?? '') || !Number.isSafeInteger(value.generation) || value.generation < 1 || value.generation > MAX_GENERATION
      || !plain(value.definition) || value.definition.project !== value.project
      || !Array.isArray(value.definition.pairs) || !value.definition.pairs.length || value.definition.pairs.length > MAX_PAIRS
      || !Array.isArray(value.analysis) || !plain(value.review) || !plain(value.request) || !SHA.test(value.admissionSha256 ?? '')
      || value.definitionSha256 !== digest(json(value.definition)) || value.requestSha256 !== digest(json(value.request))
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
    fail('The original response comparison is inconsistent.');
  projectName(value.project); positive(value.definition.selectedRevision, 'selected source revision');
  text(value.definition.title, 'Comparison title', 160, true);
  const ids = value.definition.pairs.map(pair => pair.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !CASE.test(id ?? ''))
      || value.analysis.length !== ids.length || value.analysis.some((row, i) => row.pairId !== ids[i]))
    fail('The original comparison cohort changed.');
  for (const pair of value.definition.pairs) for (const side of [pair.baseline, pair.candidate]) {
    if (!plain(side) || !UUID.test(side.id ?? '') || side.project !== value.project || !SHA.test(side.recordSha256 ?? '')
        || !SHA.test(side.inputDigest ?? '') || !SHA.test(side.draftSha256 ?? '') || !Number.isSafeInteger(side.draftRevision) || side.draftRevision < 1
        || side.draftRevision > value.definition.selectedRevision) fail('A comparison references a different original preview or draft.');
  }
  const { kind, ...input } = value.request;
  const normalized = kind === 'prepare' ? prepareRequest(input) : kind === 'review' ? reviewRequest(input, ids) : null;
  if (!normalized || json(normalized) !== json(value.request) || value.request.project !== value.project
      || json(value.review) !== json(reviewOf(value.request, ids))) fail('The original review request or decision history changed.');
  if (value.generation === 1) {
    if (kind !== 'prepare' || value.request.id !== value.id || value.previousRecordSha256 !== null
        || value.definition.selectedRevision !== value.request.expectedRevision || value.definition.title !== value.request.title)
      fail('The baseline comparison no longer matches its original request.');
    const selected = value.definition.pairs.map(pair => ({ id: pair.id, title: pair.title, objective: pair.objective,
      baselineId: pair.baseline.id, candidateId: pair.candidate.id }));
    if (json(selected) !== json(value.request.pairs)) fail('The saved comparison cohort differs from the selected previews.');
  } else if (kind !== 'review' || value.request.comparisonId !== value.id
      || value.request.expectedGeneration !== value.generation - 1 || !SHA.test(value.previousRecordSha256 ?? '')
      || value.request.expectedRecordSha256 !== value.previousRecordSha256)
    fail('The reviewer generation does not continue its original comparison.');
  if (reference && (value.id !== reference.id || value.project !== reference.project || value.generation !== reference.generation
      || value.definitionSha256 !== reference.definitionSha256)) fail('The comparison differs from its committed project reference.', 409);
  return value;
}
/** Callbacks must return original files after checking the supplied native SHA. */
export async function verifyComparisonSources(record, { loadPreview, loadDraft, loadPrior }) {
  validateComparisonRecord(record);
  const admission = validateVersion(await loadDraft(record.request.expectedRevision, record.admissionSha256), record.project);
  if (admission.revision !== record.request.expectedRevision) fail('The comparison admission revision changed.');
  if (record.generation > 1) {
    const prior = validateComparisonRecord(await loadPrior(record.id, record.generation - 1, record.previousRecordSha256));
    const reference = (admission.comparisons ?? []).find(item => item.id === record.id);
    if (!reference || reference.generation !== prior.generation || reference.recordSha256 !== record.previousRecordSha256
        || prior.id !== record.id || prior.project !== record.project || prior.definitionSha256 !== record.definitionSha256
        || json(prior.definition) !== json(record.definition) || json(prior.analysis) !== json(record.analysis)
        || prior.createdAt !== record.createdAt) fail('The retained reviewer generation changed its source cohort.', 409);
    return;
  }
  for (let i = 0; i < record.definition.pairs.length; i++) {
    const pair = record.definition.pairs[i], values = [];
    for (const reference of [pair.baseline, pair.candidate]) {
      const retained = (admission.previews ?? []).find(item => item.id === reference.id);
      if (!retained || retained.recordSha256 !== reference.recordSha256 || retained.inputDigest !== reference.inputDigest)
        fail('The selected preview was not retained in the original comparison admission revision.');
      const value = validateComparisonPreview(await loadPreview(reference), reference);
      const draft = validateVersion(await loadDraft(reference.draftRevision, reference.draftSha256), record.project);
      if (draft.revision !== reference.draftRevision || draft.inputDigest !== reference.inputDigest)
        fail('The original preview schema/query draft differs from this comparison.', 409);
      values.push(value);
    }
    if (json(analyze(pair, ...values)) !== json(record.analysis[i]))
      fail('The saved response comparison differs from its original request/response values.', 409);
  }
}
export async function readComparison(store, reference) {
  uuid(reference.id); projectName(reference.project); positive(reference.generation, 'comparison generation', MAX_GENERATION);
  const records = [];
  for (let generation = 1; generation <= reference.generation; generation++) {
    const item = await rawRecord(store, reference.id, generation);
    validateComparisonRecord(item.record, { id: reference.id, project: reference.project, generation,
      definitionSha256: reference.definitionSha256 ?? item.record.definitionSha256 });
    if (generation === reference.generation && reference.recordSha256 && item.sha256 !== reference.recordSha256
        || generation > 1 && item.record.previousRecordSha256 !== records.at(-1).sha256)
      fail('A retained comparison generation changed its original bytes.', 409);
    await verifyComparisonSources(item.record, {
      loadPreview: ref => readPreview(store, ref),
      loadDraft: async (revision, sha256) => (await originalDraft(store, reference.project, revision, sha256)).record,
      loadPrior: async (id, prior, sha) => {
        const value = records[prior - 1];
        if (!value || value.sha256 !== sha) fail('The comparison predecessor changed.', 409);
        return value.record;
      },
    });
    records.push(item);
  }
  const selected = records.at(-1);
  return { ...selected, reference: comparisonReference(selected.record, selected.sha256), records };
}
function retained(saved, id) {
  const reference = (saved.comparisons ?? []).find(item => item.id === id);
  if (!reference) fail('Choose a comparison retained in this project revision.', 404);
  return reference;
}
async function selected(store, { project, revision, comparisonId, generation, expectedRecordSha256 }) {
  const saved = await store.read(projectName(project), revision);
  const reference = retained(saved, uuid(comparisonId));
  const chosen = generation ?? reference.generation;
  if (!Number.isSafeInteger(chosen) || chosen < 1 || chosen > reference.generation)
    fail('Choose a comparison generation retained by this selected project revision.', 404);
  const value = await readComparison(store, chosen === reference.generation ? reference : {
    id: reference.id, project: reference.project, generation: chosen, definitionSha256: reference.definitionSha256 });
  if (expectedRecordSha256 !== undefined && value.sha256 !== expectedRecordSha256)
    fail('The selected comparison differs from the inspected record.', 409);
  return { saved, ...value };
}
export async function inspectResponseComparison(store, input) {
  const value = await selected(store, input);
  return { project: value.saved.id, projectRevision: value.saved.revision, currentProjectRevision: value.saved.currentRevision,
    record: value.record, reference: value.reference,
    history: value.records.map(item => comparisonReference(item.record, item.sha256)) };
}
export async function comparisonChanges(store, input) {
  const value = await selected(store, input);
  const pair = value.record.definition.pairs.find(item => item.id === input.pairId);
  if (!pair) fail('Choose a case from this exact comparison.');
  const baseline = validateComparisonPreview(await readPreview(store, pair.baseline), pair.baseline);
  const candidate = validateComparisonPreview(await readPreview(store, pair.candidate), pair.candidate);
  const page = responseChangePage(response(baseline), response(candidate), { offset: input.offset ?? 0, limit: input.limit ?? 50 });
  const summary = value.record.analysis.find(item => item.pairId === pair.id);
  return { reference: value.reference, pair, summary, baselineRequest: baseline.request, candidateRequest: candidate.request, ...page };
}
async function attach(store, item, expectedRevision) {
  const saved = await store.read(item.record.project), current = (saved.comparisons ?? []).find(row => row.id === item.record.id);
  if (current && current.generation >= item.record.generation) {
    const chain = await readComparison(store, current), original = chain.records[item.record.generation - 1];
    if (!original || original.sha256 !== item.sha256) fail('The saved comparison history diverged.', 409);
    return { project: saved, record: item.record, reference: comparisonReference(item.record, item.sha256), reused: true };
  }
  if (saved.revision !== expectedRevision) fail('The comparison is retained, but the project advanced. Inspect it and recover this generation into the latest project revision.', 409);
  if ((current?.generation ?? 0) !== item.record.generation - 1
      || current && (current.recordSha256 !== item.record.previousRecordSha256 || current.definitionSha256 !== item.record.definitionSha256))
    fail('Recover the original preceding comparison generation before attaching this review.', 409);
  const reference = comparisonReference(item.record, item.sha256);
  const project = await store.save({ id: saved.id, input: saved.input, expectedRevision: saved.revision, comparisonRecord: reference });
  return { project, record: item.record, reference, reused: false };
}
async function existing(store, id, generation, request) {
  let item;
  try { item = await rawRecord(store, id, generation); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (item.record.requestSha256 !== digest(json(request)) || json(item.record.request) !== json(request))
    fail('That comparison generation already belongs to a different retained request.', 409);
  return readComparison(store, { id, project: request.project, generation, recordSha256: item.sha256 });
}
export async function prepareResponseComparison(store, input) {
  const request = prepareRequest(input);
  let item = await existing(store, request.id, 1, request);
  if (!item) {
    const saved = await store.read(request.project);
    if (saved.revision !== request.expectedRevision) fail('The saved project changed. Select its current retained previews.', 409);
    const pairs = [], analysis = [];
    for (const pair of request.pairs) {
      const values = [], references = [];
      for (const id of [pair.baselineId, pair.candidateId]) {
        const reference = (saved.previews ?? []).find(row => row.id === id);
        if (!reference) fail('Recover the original completed preview into this project before comparing it.', 409);
        const value = await readPreview(store, reference), draft = await originalDraft(store, saved.id, value.draftRevision);
        const bound = previewReference(value, reference, draft.sha256);
        validateComparisonPreview(value, bound);
        if (draft.record.inputDigest !== value.inputDigest) fail('The original preview draft no longer matches.', 409);
        references.push(bound); values.push(value);
      }
      const definition = { id: pair.id, title: pair.title, objective: pair.objective, baseline: references[0], candidate: references[1] };
      pairs.push(definition); analysis.push(analyze(definition, ...values));
    }
    const definition = { project: saved.id, selectedRevision: saved.revision, title: request.title, pairs };
    const now = new Date().toISOString();
    const record = { schema: RESPONSE_COMPARISON_SCHEMA, algorithm: RESPONSE_COMPARISON_ALGORITHM, id: request.id,
      project: saved.id, generation: 1, previousRecordSha256: null, createdAt: now, updatedAt: now,
      request, requestSha256: digest(json(request)), admissionSha256: (await originalDraft(store, saved.id, saved.revision)).sha256,
      definition, definitionSha256: digest(json(definition)),
      analysis, review: reviewOf(request, pairs.map(pair => pair.id)) };
    validateComparisonRecord(record); item = await publish(store, record);
  }
  return attach(store, item, request.expectedRevision);
}
export async function reviewResponseComparison(store, input) {
  uuid(input.comparisonId); positive(input.expectedGeneration, 'comparison generation', MAX_GENERATION - 1);
  const prior = await rawRecord(store, input.comparisonId, input.expectedGeneration);
  validateComparisonRecord(prior.record);
  const request = reviewRequest(input, prior.record.definition.pairs.map(pair => pair.id));
  let item = await existing(store, request.comparisonId, request.expectedGeneration + 1, request);
  if (!item) {
    const saved = await store.read(request.project), reference = retained(saved, request.comparisonId);
    if (saved.revision !== request.expectedRevision || reference.generation !== request.expectedGeneration
        || reference.recordSha256 !== request.expectedRecordSha256 || prior.sha256 !== request.expectedRecordSha256)
      fail('The project or reviewed comparison advanced. Open its current generation while preserving your notes.', 409);
    const selected = await readComparison(store, reference);
    const record = { ...selected.record, generation: request.expectedGeneration + 1, previousRecordSha256: selected.sha256,
      updatedAt: new Date().toISOString(), request, requestSha256: digest(json(request)),
      admissionSha256: (await originalDraft(store, saved.id, saved.revision)).sha256,
      review: reviewOf(request, request.decisions.map(row => row.pairId)) };
    validateComparisonRecord(record); item = await publish(store, record);
  }
  return attach(store, item, request.expectedRevision);
}
export async function recoverResponseComparison(store, input) {
  shape(input, ['project', 'comparisonId', 'generation', 'expectedRecordSha256', 'expectedRevision'], 'comparison recovery');
  if (!SHA.test(input.expectedRecordSha256 ?? '')) fail('Inspect the retained comparison before recovery.');
  const value = await readComparison(store, { id: uuid(input.comparisonId), project: projectName(input.project),
    generation: positive(input.generation, 'comparison generation', MAX_GENERATION), recordSha256: input.expectedRecordSha256 });
  return attach(store, value, positive(input.expectedRevision, 'project revision'));
}
/** A lost prepare/review reply remains discoverable without changing the original project. */
export async function inspectPendingResponseComparison(store, { project, comparisonId, generation } = {}) {
  const value = await readComparison(store, { id: uuid(comparisonId), project: projectName(project),
    generation: positive(generation, 'comparison generation', MAX_GENERATION) });
  const saved = await store.read(project), reference = (saved.comparisons ?? []).find(row => row.id === comparisonId);
  return { project, projectRevision: saved.revision, record: value.record, reference: value.reference,
    retained: Boolean(reference && reference.generation >= generation),
    history: value.records.map(item => comparisonReference(item.record, item.sha256)) };
}
