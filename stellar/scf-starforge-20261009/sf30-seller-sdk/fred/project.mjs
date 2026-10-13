// MIT. A private FRED project owns source editions, reviews and recovery.
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJSONInfo, canonicalJSONDigest } from './canonical-stream.mjs';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../routescan/quota.mjs';
import { canonical, clone, need, plain, date, operationId, normalizeSelection, projectionPolicy, compareCaptures, MAX_CAPTURE_BYTES, PUBLIC_CAPTURE, PUBLIC_SET_CAPTURE, FRED_NOTICE, FRED_TERMS } from './model.mjs';
import { hash, digest, jsonBytes, optionalJson, validateCapture, captureFred, storeFredCapture, sealFredPublicTable, sealFredPublicTables } from './source.mjs';

import { fredReviewIdentity, validateFredReview } from './review.mjs';
import { normalizeFredBriefing, buildFredBriefingModel, pageFredBriefing } from './briefing/model.mjs';
import { prepareFredBriefingFiles, readFredBriefingFiles, readFredBriefingMember, exportFredBriefingFiles, receiveFredBriefingFiles } from './briefing/files.mjs';

import { createFredBriefingTemplate, validateFredBriefingTemplate, materializeFredBriefingTemplate,
  FRED_BRIEFING_MATERIALIZATION, FRED_BRIEFING_MATERIALIZATION_V1,
  compareFredBriefingSuccessor, pageFredBriefingChanges, createFredBriefingSuccessorRecord,
  validateFredBriefingSuccessorRecord } from './briefing/templates.mjs';
import { renderFredBriefingSuccessor, fredBriefingSuccessorCsv } from './briefing/template-report.mjs';
import { normalizeFredReleaseSelection, inspectFredReleaseCapture } from './releases/model.mjs';
import { captureFredReleases, readFredReleaseCapture, storeFredReleaseCapture, inspectFredReleaseAcquisition } from './releases/source.mjs';
import { createFredReleaseWatch, validateFredReleaseWatch } from './releases/watch.mjs';
import { planFredReleaseCatchUp, validateFredReleasePlan, pageFredReleasePlan } from './releases/planner.mjs';
import { createFredDdpProjectExtension } from './ddp/project-state.mjs';
import { FRED_DDP_PROJECT_BUNDLE, FRED_DDP_PROJECT_KEYS, FRED_DDP_PROJECT_BUNDLE_MAX_BYTES,
  fredDdpStatePresent, validateFredDdpProjectState, validateFredDdpProjectBundle } from './ddp/project-validation.mjs';
import { validateQcewState, qcewStatePresent } from './qcew/state.mjs';
import { exportQcewExtension, validateQcewExtension, receiveQcewExtension } from './qcew/bundle.mjs';

const QCEW_BUNDLE = 'stellar-forge.fred-project-bundle.v6';
const SCHEMA = 'stellar-forge.fred-project.v1';
const BUNDLE = 'stellar-forge.fred-project-bundle.v1';
const BRIEFING_BUNDLE = 'stellar-forge.fred-project-bundle.v2';
const RECURRING_BUNDLE = 'stellar-forge.fred-project-bundle.v3';
const STATE_LIMIT = 8 * 1024 * 1024;
function projectState(state) {
  need(state?.schema === SCHEMA && typeof state.id === 'string' && /^[a-f0-9-]{36}$/.test(state.id) &&
    Number.isSafeInteger(state.revision) && state.revision >= 1 && Array.isArray(state.captures) &&
    Array.isArray(state.reviews) && Array.isArray(state.publications) && Array.isArray(state.operations),
    'Retained FRED project is invalid.');
  normalizeSelection(state.selection);
  for (const [key, validate] of [['briefingTemplates', validateFredBriefingTemplate],
    ['briefingSuccessors', validateFredBriefingSuccessorRecord]]) {
    if (state[key] !== undefined) {
      need(Array.isArray(state[key]) && new Set(state[key].map(item => item?.id)).size === state[key].length,
        'The retained recurring briefing inventory changed.');
      for (const item of state[key]) validate(item);
    }
  }
  validateReleaseState(state);
  validateFredDdpProjectState(state);
  validateQcewState(state);
  return state;
}
export async function readFredProject(directory) {
  return projectState(await readPrivateJson(join(resolve(directory), 'project.json'), STATE_LIMIT));
}
export async function initializeFredProject({ directory, title, selection, apiKeyEnv = 'FRED_API_KEY' } = {}) {
  directory = await privateDirectory(resolve(directory));
  need(typeof title === 'string' && title.trim().length > 0 && title.length <= 160, 'Give the economic project a title.');
  need(typeof apiKeyEnv === 'string' && /^[A-Z_][A-Z0-9_]{0,127}$/.test(apiKeyEnv), 'Supply the key’s environment-variable name.');
  selection = normalizeSelection(selection);
  return withPrivateLock(directory, 'project.lock', async () => {
    const existing = await optionalJson(join(directory, 'project.json'), STATE_LIMIT);
    if (existing) {
      projectState(existing);
      need(existing.title === title && existing.apiKeyEnv === apiKeyEnv && canonical(existing.selection) === canonical(selection),
        'This directory already belongs to another project configuration.', 'FRED_PROJECT_EXISTS', 409);
      return existing;
    }
    const state = { schema: SCHEMA, id: randomUUID(), title, apiKeyEnv, selection, revision: 1,
      createdAt: new Date().toISOString(), selectedCapture: null, captures: [], reviews: [], publications: [], operations: [], pending: null };
    await atomicJson(directory, 'project.json', state, { exclusive: true });
    return state;
  });
}
async function transact(directory, request, apply) {
  directory = await privateDirectory(resolve(directory));
  operationId(request.id);
  need(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 1, 'Use the project revision being reviewed.');
  const fingerprint = digest({ kind: request.kind, payload: request.payload });
  return withPrivateLock(directory, 'project.lock', async () => {
    const state = await readFredProject(directory);
    const previous = state.operations.find(item => item.id === request.id);
    if (previous) {
      need(previous.fingerprint === fingerprint, 'This operation ID retains another action.', 'FRED_OPERATION_CONFLICT', 409);
      return { ...clone(previous.result), replayed: true, revision: state.revision };
    }
    need(state.revision === request.expectedRevision, 'The project changed; read its current revision.', 'FRED_REVISION_CONFLICT', 409);
    if (state.pending) need(state.pending.id === request.id && state.pending.fingerprint === fingerprint,
      'Continue or abandon the retained operation before changing this project.', 'FRED_OPERATION_PENDING', 409);
    else {
      need(state.operations.length < 10000, 'This project has reached its retained operation capacity; export and archive it.');
      state.pending = { id: request.id, kind: request.kind, fingerprint, payload: clone(request.payload),
        expectedRevision: request.expectedRevision, startedAt: new Date().toISOString(), lastError: null };
      await atomicJson(directory, 'project.json', state);
    }
    try {
      const result = await apply(state, directory);
      state.revision++; state.pending = null;
      const retained = { ...result, revision: state.revision };
      state.operations.push({ id: request.id, kind: request.kind, fingerprint, completedAt: new Date().toISOString(), result: retained });
      need(jsonBytes(state).length <= STATE_LIMIT, 'Project index exceeds its retained capacity; export and archive it.');
      await atomicJson(directory, 'project.json', state);
      return retained;
    } catch (error) {
      // Side effects have deterministic identities; an unchanged operation resumes them.
      const current = await readFredProject(directory);
      if (current.pending?.id === request.id) {
        current.pending.lastError = { code: typeof error.code === 'string' ? error.code : 'FRED_OPERATION_INTERRUPTED',
          at: new Date().toISOString(), retryAt: typeof error.retryAt === 'string' ? error.retryAt : null };
        await atomicJson(directory, 'project.json', current);
      }
      throw error;
    }
  });
}
export async function abandonFredOperation({ directory, id, expectedRevision, pendingId } = {}) {
  directory = await privateDirectory(resolve(directory)); operationId(id); operationId(pendingId);
  return withPrivateLock(directory, 'project.lock', async () => {
    const state = await readFredProject(directory);
    const prior = state.operations.find(item => item.id === id);
    if (prior) {
      need(prior.kind === 'abandon' && prior.result.pendingId === pendingId, 'Operation ID belongs to another action.');
      return { ...prior.result, replayed: true };
    }
    need(state.revision === expectedRevision && state.pending?.id === pendingId,
      'Read the exact currently pending operation.', 'FRED_REVISION_CONFLICT', 409);
    const original = state.pending;
    // Source reads and immutable preparations stay available; no financial operation runs here.
    state.pending = null; state.revision++;
    const result = { pendingId, revision: state.revision, state: 'ABANDONED' };
    state.operations.push({ id, kind: 'abandon', fingerprint: digest({ pendingId }), abandoned: original,
      completedAt: new Date().toISOString(), result });
    await atomicJson(directory, 'project.json', state); return result;
  });
}
export const fredCaptureDirectory = (directory, captureId) => {
  need(/^[a-f0-9]{64}$/.test(captureId ?? ''), 'Select an original capture ID.');
  return join(resolve(directory), 'sources', captureId);
};
export async function getFredCapture(directory, captureId) {
  const state = await readFredProject(directory);
  need(state.captures.some(item => item.id === captureId), 'Capture does not belong to this project.');
  const capture = await readPrivateJson(join(fredCaptureDirectory(directory, captureId), 'capture.json'), MAX_CAPTURE_BYTES * 2);
  validateCapture(capture);
  need(capture.captureSha256 === captureId, 'Capture identity changed.');
  return capture;
}
async function adoptCapture(state, directory, capture) {
  const model = validateCapture(capture), captureId = capture.captureSha256;
  await storeFredCapture(fredCaptureDirectory(directory, captureId), capture);
  if (!state.captures.some(item => item.id === captureId))
    state.captures.push({ id: captureId, selection: model.selection, sourceMode: model.sourceMode, timeBasis: model.timeBasis, rowCount: model.rowCount, missing: model.missing,
      series: model.series, responses: model.sourceResponses, ...(model.retrievalWindow ? { retrievalWindow: model.retrievalWindow } : {}), importedAt: new Date().toISOString() });
  state.selectedCapture = captureId;
  return { captureId, rowCount: model.rowCount, missing: model.missing };
}
export async function configureFredProject({ directory, id, expectedRevision, selection } = {}) {
  selection = normalizeSelection(selection);
  return transact(directory, { id, expectedRevision, kind: 'configure', payload: { selection } }, async state => {
    state.selection = selection; return { selection };
  });
}
export async function importFredCapture({ directory, id, expectedRevision, capture } = {}) {
  if (capture?.version === 'commons.retained-public-table.v1') capture = sealFredPublicTable(capture);
  else if (capture?.version === 'commons.retained-public-table-set.v1') capture = sealFredPublicTables(capture);
  validateCapture(capture);
  return transact(directory, { id, expectedRevision, kind: 'import', payload: { captureId: capture.captureSha256 } },
    (state, root) => adoptCapture(state, root, capture));
}

export async function combineFredTables({ directory, id, expectedRevision, captureIds } = {}) {
  need(Array.isArray(captureIds) && captureIds.length >= 1 && captureIds.length <= 50 &&
    captureIds.every(item => /^[a-f0-9]{64}$/.test(item)) && new Set(captureIds).size === captureIds.length,
    'Select one to fifty distinct retained public-table captures.');
  captureIds = [...captureIds].sort();
  return transact(directory, { id, expectedRevision, kind: 'combine', payload: { captureIds } }, async (state, root) => {
    const tables = [];
    for (const captureId of captureIds) {
      const capture = await getFredCapture(root, captureId);
      need([PUBLIC_CAPTURE, PUBLIC_SET_CAPTURE].includes(capture.schema), 'Combine complete public-table captures from this project.');
      tables.push(...(capture.schema === PUBLIC_SET_CAPTURE ? capture.source.tables : [capture.source]));
    }
    const capture = sealFredPublicTables({ version: 'commons.retained-public-table-set.v1', tables });
    return { ...(await adoptCapture(state, root, capture)), originalCaptures: captureIds };
  });
}
export async function acquireFredCapture({ directory, id, expectedRevision, signal, environment, fetchImpl } = {}) {
  const original = await readFredProject(directory);
  const selection = original.pending?.id === id && original.pending.kind === 'capture'
    ? original.pending.payload.selection : original.selection;
  return transact(directory, { id, expectedRevision, kind: 'capture', payload: { selection } }, async (state, root) => {
    const acquired = await captureFred({ directory: join(root, 'acquisitions', id), selection,
      apiKeyEnv: state.apiKeyEnv, signal, environment, fetchImpl });
    return { ...(await adoptCapture(state, root, acquired.capture)), acquisitionId: id };
  });
}
export async function selectFredCapture({ directory, id, expectedRevision, captureId } = {}) {
  return transact(directory, { id, expectedRevision, kind: 'select', payload: { captureId } }, async state => {
    need(state.captures.some(item => item.id === captureId), 'Select an existing capture.');
    state.selectedCapture = captureId; return { captureId };
  });
}
async function retainFredReview(state, root, identity) {
  const { captureId } = identity;
  need(state.captures.some(item => item.id === captureId), 'Review an original retained capture.');
  const reviewId = digest(identity);
  let review = state.reviews.find(item => item.id === reviewId);
  if (!review) {
    await privateDirectory(join(root, 'reviews'));
    const retained = await optionalJson(join(root, 'reviews', reviewId + '.json'));
    review = retained ?? { id: reviewId, ...identity, reviewedAt: new Date().toISOString() };
    need(review.id === reviewId && canonical(fredReviewIdentity(review)) === canonical(identity),
      'The retained review belongs to different source or settings.');
    if (!retained) await atomicJson(join(root, 'reviews'), reviewId + '.json', review, { exclusive: true });
  }
  let report = null;
  if (review.briefing) {
    const retained = await prepareFredBriefingFiles({ directory: fredBriefingDirectory(root, reviewId),
      capture: await getFredCapture(root, captureId), review });
    report = { reportId: retained.manifest.reportId, manifestSha256: retained.manifest.manifestSha256,
      files: retained.manifest.files };
  }
  if (!state.reviews.some(item => item.id === reviewId)) state.reviews.push(review);
  return { reviewId, captureId, ...(report ? { briefing: report } : {}) };
}
export async function reviewFredCapture({ directory, id, expectedRevision, captureId, policy = {}, note = '', briefing = null } = {}) {
  policy = projectionPolicy(policy);
  need(typeof note === 'string' && note.length <= 8000, 'Review note exceeds 8000 characters.');
  if (briefing !== null) briefing = normalizeFredBriefing(briefing, validateCapture(await getFredCapture(directory, captureId)));
  // Ordinary reviews preserve their original identity and operation fingerprint.
  const identity = fredReviewIdentity({ captureId, policy, note, briefing });
  return transact(directory, { id, expectedRevision, kind: 'review', payload: identity },
    (state, root) => retainFredReview(state, root, identity));
}
export function fredBriefingDirectory(directory, reviewId) {
  need(/^[a-f0-9]{64}$/.test(reviewId ?? ''), 'Select an original briefing review.');
  return join(resolve(directory), 'briefings', reviewId);
}
export async function previewFredBriefing({ directory, captureId, briefing, offset = 0, limit = 100 } = {}) {
  const capture = await getFredCapture(directory, captureId), model = validateCapture(capture);
  const report = buildFredBriefingModel({ model, captureId, selection: normalizeFredBriefing(briefing, model) });
  return { previewId: digest(report), ...pageFredBriefing(report, { offset, limit }) };
}
async function savedBriefingReview(directory, reviewId) {
  const state = await readFredProject(directory), review = state.reviews.find(item => item.id === reviewId);
  need(review?.briefing, 'Select a saved analyst briefing from this project.');
  validateFredReview(review, validateCapture(await getFredCapture(directory, review.captureId)));
  return review;
}
export async function getFredBriefing(directory, reviewId, { includeFiles = false } = {}) {
  const review = await savedBriefingReview(directory, reviewId);
  return readFredBriefingFiles(fredBriefingDirectory(directory, reviewId), { captureId: review.captureId, reviewId, includeFiles });
}
export async function downloadFredBriefing({ directory, reviewId, format } = {}) {
  const review = await savedBriefingReview(directory, reviewId);
  return readFredBriefingMember(fredBriefingDirectory(directory, reviewId), { captureId: review.captureId, reviewId, format });
}

/** Templates and report successors live inside the original project transaction. */
function templateFromState(state, templateId) {
  const value = (state.briefingTemplates ?? []).find(item => item.id === templateId);
  need(value, 'Choose a recurring briefing template from this project.', 'FRED_TEMPLATE_NOT_FOUND', 404);
  return validateFredBriefingTemplate(value);
}
function successorFromState(state, successorId) {
  const value = (state.briefingSuccessors ?? []).find(item => item.id === successorId);
  need(value, 'Choose a saved briefing successor from this project.', 'FRED_SUCCESSOR_NOT_FOUND', 404);
  return validateFredBriefingSuccessorRecord(value);
}
function originalReport(review, model) {
  validateFredReview(review, model);
  need(review.briefing, 'Choose an original analyst review.');
  const body = { ...buildFredBriefingModel({ model, captureId: review.captureId, reviewId: review.id,
    selection: review.briefing }), sourceNotice: FRED_NOTICE, sourceTerms: FRED_TERMS };
  return { ...body, reportId: 'fred-briefing-' + digest(body) };
}
function successorInput({ templateId, captureId, anchorDate = null, baselineReviewId = null,
  previousSuccessorId = null, note = '' } = {}) {
  need(typeof note === 'string' && note.length <= 8000, 'Review note exceeds 8000 characters.');
  return { templateId, captureId, anchorDate, baselineReviewId, previousSuccessorId, note };
}
async function successorContext(state, input, modelFor, reportFor, schema = FRED_BRIEFING_MATERIALIZATION) {
  const template = templateFromState(state, input.templateId);
  const origin = state.reviews.find(item => item.id === template.origin.reviewId);
  need(origin?.briefing && origin.captureId === template.origin.captureId,
    'The template lost its original reviewed source.');
  let baselineReviewId = input.baselineReviewId;
  if (input.previousSuccessorId !== null) {
    const previous = successorFromState(state, input.previousSuccessorId);
    need(previous.templateId === template.id &&
      (baselineReviewId === null || baselineReviewId === previous.reviewId),
      'The selected predecessor and baseline belong to the same recurring briefing.', 'FRED_SUCCESSOR_LINEAGE_CONFLICT', 409);
    baselineReviewId = previous.reviewId;
  }
  baselineReviewId ??= template.origin.reviewId;
  need(baselineReviewId === template.origin.reviewId ||
    (state.briefingSuccessors ?? []).some(item => item.templateId === template.id && item.reviewId === baselineReviewId),
    'Choose the original template review or one of its saved successors as baseline.');
  const model = await modelFor(input.captureId);
  const materialization = materializeFredBriefingTemplate({ template, model, captureId: input.captureId,
    anchorDate: input.anchorDate, schema });
  const identity = fredReviewIdentity({ captureId: input.captureId, policy: origin.policy,
    note: input.note, briefing: materialization.selection });
  const reviewId = digest(identity), after = originalReport({ id: reviewId, ...identity }, model);
  const before = await reportFor(baselineReviewId);
  const comparison = compareFredBriefingSuccessor({ before, after });
  const previewId = digest({ schema: 'stellar-forge.fred-successor-preview.v1', projectId: state.id,
    templateId: template.id, materializationId: materialization.previewId, baselineReviewId,
    previousSuccessorId: input.previousSuccessorId, reviewId, reportId: after.reportId,
    comparisonId: comparison.comparisonId });
  return { previewId, template, materialization, baselineReviewId, previousSuccessorId: input.previousSuccessorId,
    reviewId, identity, after, comparison };
}
function liveContext(directory, state, input, schema = FRED_BRIEFING_MATERIALIZATION) {
  return successorContext(state, input,
    async captureId => validateCapture(await getFredCapture(directory, captureId)),
    async reviewId => (await getFredBriefing(directory, reviewId)).report, schema);
}
export async function listFredBriefingTemplates({ directory } = {}) {
  const state = await readFredProject(directory);
  return { projectId: state.id, revision: state.revision,
    templates: clone(state.briefingTemplates ?? []), successors: clone(state.briefingSuccessors ?? []) };
}
export async function saveFredBriefingTemplate({ directory, id, expectedRevision, reviewId, name,
  window = {}, previousTemplateId = null } = {}) {
  const original = await readFredProject(directory);
  const review = original.reviews.find(item => item.id === reviewId);
  need(review?.briefing, 'Choose a saved analyst briefing from this project.');
  if (previousTemplateId !== null) templateFromState(original, previousTemplateId);
  const template = createFredBriefingTemplate({ name, review,
    model: validateCapture(await getFredCapture(directory, review.captureId)), window, previousTemplateId });
  return transact(directory, { id, expectedRevision, kind: 'template-save',
    payload: { reviewId, name: template.name, window: template.window, previousTemplateId, templateId: template.id } }, async state => {
    state.briefingTemplates ??= [];
    if (!state.briefingTemplates.some(item => item.id === template.id)) state.briefingTemplates.push(template);
    return { templateId: template.id, template };
  });
}
export async function previewFredBriefingSuccessor({ directory, offset = 0, limit = 100, changesOnly = true, ...request } = {}) {
  const state = await readFredProject(directory), input = successorInput(request);
  const value = await liveContext(directory, state, input);
  return { projectId: state.id, revision: state.revision, previewId: value.previewId, template: value.template,
    materialization: value.materialization, baselineReviewId: value.baselineReviewId,
    previousSuccessorId: value.previousSuccessorId, reviewId: value.reviewId,
    briefing: pageFredBriefing(value.after, { offset: 0, limit }),
    comparison: pageFredBriefingChanges(value.comparison, { offset, limit, changesOnly }) };
}
export async function saveFredBriefingSuccessor({ directory, id, expectedRevision, previewId, ...request } = {}) {
  const input = successorInput(request);
  need(/^[a-f0-9]{64}$/.test(previewId ?? ''), 'Preview the complete recurring briefing selection before saving it.');
  // Reject an obsolete preview before recording a pending mutation.
  const original = await readFredProject(directory);
  const prior = original.operations.find(item => item.id === id);
  let schema = FRED_BRIEFING_MATERIALIZATION;
  if (!prior) {
    let checked = await liveContext(directory, original, input, schema);
    if (checked.previewId !== previewId) {
      // A pre-upgrade preview or interrupted save retains its original title and identity.
      checked = await liveContext(directory, original, input, FRED_BRIEFING_MATERIALIZATION_V1);
      schema = FRED_BRIEFING_MATERIALIZATION_V1;
    }
    need(checked.previewId === previewId, 'The recurring briefing selection changed; preview its current values.',
      'FRED_SUCCESSOR_PREVIEW_CHANGED', 409);
  }
  return transact(directory, { id, expectedRevision, kind: 'successor-save',
    payload: { ...input, previewId } }, async (state, root) => {
    const value = await liveContext(root, state, input, schema);
    need(value.previewId === previewId, 'The recurring briefing selection changed; preview its current values.',
      'FRED_SUCCESSOR_PREVIEW_CHANGED', 409);
    const saved = await retainFredReview(state, root, value.identity);
    need(saved.briefing?.reportId === value.after.reportId,
      'The saved successor report differs from its original preview.');
    const successor = createFredBriefingSuccessorRecord({ template: value.template, materialization: value.materialization,
      reviewId: saved.reviewId, reportId: saved.briefing.reportId, comparison: value.comparison,
      previousSuccessorId: value.previousSuccessorId });
    state.briefingSuccessors ??= [];
    if (!state.briefingSuccessors.some(item => item.id === successor.id)) state.briefingSuccessors.push(successor);
    return { ...saved, successorId: successor.id, templateId: successor.templateId, summary: successor.comparison };
  });
}
async function retainedSuccessor(directory, successorId) {
  const state = await readFredProject(directory), successor = successorFromState(state, successorId);
  const review = state.reviews.find(item => item.id === successor.reviewId);
  need(review?.briefing, 'The successor lost its saved analyst review.');
  const value = await liveContext(directory, state, successorInput({ templateId: successor.templateId,
    captureId: successor.captureId, anchorDate: successor.materialization.window.anchorBasis === 'explicit'
      ? successor.materialization.window.anchorDate : null,
    baselineReviewId: successor.beforeReviewId, previousSuccessorId: successor.previousSuccessorId, note: review.note }),
    successor.materialization.schema);
  const saved = await getFredBriefing(directory, review.id);
  need(value.reviewId === review.id && value.after.reportId === saved.manifest.reportId,
    'The retained successor review differs from its original template and selection.');
  const rebuilt = createFredBriefingSuccessorRecord({ template: value.template, materialization: value.materialization,
    reviewId: review.id, reportId: saved.manifest.reportId, comparison: value.comparison,
    previousSuccessorId: successor.previousSuccessorId });
  need(canonical(rebuilt) === canonical(successor), 'The original recurring briefing lineage changed.');
  return { successor, template: value.template, materialization: value.materialization, comparison: value.comparison,
    briefing: { reviewId: review.id, reportId: saved.manifest.reportId, manifest: saved.manifest } };
}
export async function getFredBriefingSuccessor({ directory, successorId, offset = 0, limit = 100, changesOnly = true } = {}) {
  const value = await retainedSuccessor(directory, successorId);
  return { ...value, comparison: pageFredBriefingChanges(value.comparison, { offset, limit, changesOnly }) };
}
export async function downloadFredBriefingSuccessor({ directory, successorId, format } = {}) {
  need(['json', 'csv', 'html'].includes(format), 'Choose JSON, CSV or offline HTML for the full successor comparison.');
  const value = await retainedSuccessor(directory, successorId);
  const bytes = format === 'json' ? jsonBytes(value) : Buffer.from(format === 'csv'
    ? fredBriefingSuccessorCsv(value.comparison) : renderFredBriefingSuccessor(value));
  need(bytes.length <= 128 * 1024 * 1024, 'The complete comparison file exceeds the 128 MiB download capacity.',
    'FRED_SUCCESSOR_FILE_CAPACITY', 413);
  return { body: bytes, contentType: format === 'json' ? 'application/json' : format === 'csv'
    ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8',
    path: 'fred-briefing-successor.' + format, bytes: bytes.length, sha256: hash(bytes),
    successorId, reviewId: value.successor.reviewId, reportId: value.successor.reportId };
}
async function validateRecurringBundle(state, captures) {
  const templates = state.briefingTemplates ?? [], successors = state.briefingSuccessors ?? [];
  if (!templates.length && !successors.length) return;
  need(templates.length > 0, 'Retain every original recurring briefing template.');
  const models = new Map(captures.map(capture => [capture.captureSha256, validateCapture(capture)]));
  const modelFor = async id => {
    const model = models.get(id); need(model, 'A recurring briefing lost its original capture.'); return model;
  };
  const reports = new Map();
  const reportFor = async id => {
    if (!reports.has(id)) {
      const review = state.reviews.find(item => item.id === id);
      need(review?.briefing, 'A recurring briefing lost an original saved report.');
      reports.set(id, originalReport(review, await modelFor(review.captureId)));
    }
    return reports.get(id);
  };
  for (const template of templates) {
    const review = state.reviews.find(item => item.id === template.origin.reviewId);
    need(review?.captureId === template.origin.captureId, 'The original template source review changed.');
    if (template.previousTemplateId !== null) templateFromState(state, template.previousTemplateId);
    const expected = createFredBriefingTemplate({ name: template.name, review, model: await modelFor(review.captureId),
      window: template.window, previousTemplateId: template.previousTemplateId });
    need(canonical(expected) === canonical(template), 'The template differs from its complete original source review.');
  }
  for (const successor of successors) {
    const review = state.reviews.find(item => item.id === successor.reviewId);
    need(review?.briefing, 'The successor lost its original reviewed edition.');
    const value = await successorContext(state, successorInput({ templateId: successor.templateId,
      captureId: successor.captureId, anchorDate: successor.materialization.window.anchorBasis === 'explicit'
      ? successor.materialization.window.anchorDate : null,
      baselineReviewId: successor.beforeReviewId, previousSuccessorId: successor.previousSuccessorId, note: review.note }),
      modelFor, reportFor, successor.materialization.schema);
    need(value.reviewId === review.id, 'The successor review differs from its original materialized selection.');
    const report = await reportFor(review.id);
    const expected = createFredBriefingSuccessorRecord({ template: value.template, materialization: value.materialization,
      reviewId: review.id, reportId: report.reportId, comparison: value.comparison,
      previousSuccessorId: successor.previousSuccessorId });
    need(canonical(expected) === canonical(successor), 'The complete original successor lineage changed.');
  }
  // Portable lineage must stay acyclic even when its descriptor inventory is reordered.
  for (const [items, parent] of [[templates, 'previousTemplateId'], [successors, 'previousSuccessorId']]) {
    const byId = new Map(items.map(item => [item.id, item]));
    for (const item of items) {
      const visited = new Set(); let next = item;
      while (next) {
        need(!visited.has(next.id), 'The recurring briefing lineage contains a cycle.');
        visited.add(next.id); next = next[parent] === null ? null : byId.get(next[parent]);
      }
    }
  }
}


/** Release calendars, immutable watches and explicit original-vintage acquisitions. */
const RELEASE_BUNDLE = 'stellar-forge.fred-project-bundle.v4';
const releaseSourceId = value => {
  need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Select an original release capture ID.');
  return value;
};
const releasePlanId = value => {
  need(typeof value === 'string' && /^fred-release-plan-[a-f0-9]{64}$/.test(value), 'Select an original release plan ID.');
  return value;
};
function releaseStatePresent(state) {
  return ['releaseCaptures', 'releaseWatches', 'releasePlans', 'releaseCatchUps'].some(key => (state[key]?.length ?? 0) > 0);
}
function validateReleaseState(state) {
  for (const key of ['releaseCaptures', 'releaseWatches', 'releasePlans', 'releaseCatchUps'])
    if (state[key] !== undefined) need(Array.isArray(state[key]), 'Retain the complete ' + key + ' inventory.');
  for (const key of ['releaseCaptures', 'releaseWatches', 'releasePlans'])
    need(new Set((state[key] ?? []).map(item => item?.id)).size === (state[key]?.length ?? 0),
      'Release inventory identities must be distinct.');
  const sources = new Map((state.releaseCaptures ?? []).map(item => [item.id, item]));
  const watches = new Map((state.releaseWatches ?? []).map(item => [item.id, item]));
  const plans = new Map((state.releasePlans ?? []).map(item => [item.id, item]));
  for (const item of sources.values()) {
    releaseSourceId(item.id);
    need(canonical(normalizeFredReleaseSelection(item.selection)) === canonical(item.selection) &&
      Array.isArray(item.series) && item.series.length === item.selection.series.length &&
      canonical(item.series.map(row => row.id).sort()) === canonical(item.selection.series),
      'The release capture index differs from its selected series.');
    for (const field of ['rowCount', 'releaseCount', 'calendarRows', 'vintageRows', 'recordCount'])
      need(Number.isSafeInteger(item[field]) && item[field] >= 0, 'Retain valid release capture source counts.');
    need(item.rowCount === item.calendarRows + item.vintageRows, 'The release source row counts changed.');
  }
  for (const watch of watches.values()) {
    validateFredReleaseWatch(watch);
    if (watch.template !== null) {
      const original = (state.briefingTemplates ?? []).find(item => item.id === watch.template.id);
      need(original && canonical(original) === canonical(watch.template),
        'The release watch lost its original recurring briefing template.');
    }
  }
  for (const plan of plans.values()) {
    releasePlanId(plan.id); releaseSourceId(plan.afterCaptureSha256);
    if (plan.beforeCaptureSha256 !== null) releaseSourceId(plan.beforeCaptureSha256);
    need(watches.has(plan.watchId) && sources.has(plan.afterCaptureSha256) &&
      (plan.beforeCaptureSha256 === null || sources.has(plan.beforeCaptureSha256)),
      'The release plan lost its original watch or source snapshot.');
    date(plan.metadataAsOf, 'Release plan metadata date');
    need(Array.isArray(plan.completedAsOf) && new Set(plan.completedAsOf).size === plan.completedAsOf.length &&
      canonical([...plan.completedAsOf].sort()) === canonical(plan.completedAsOf) &&
      plain(plan.summary) && plain(plan.coverage), 'Retain the original plan completion snapshot and summary.');
    for (const asOf of plan.completedAsOf)
      need(date(asOf, 'Completed source date') <= plan.metadataAsOf, 'Completed source dates exceed this plan snapshot.');
  }
  const caught = new Set();
  for (const item of state.releaseCatchUps ?? []) {
    need(plain(item) && Object.keys(item).every(key => ['watchId', 'planId', 'asOf', 'captureId', 'selection'].includes(key)),
      'Retain an original release acquisition record.');
    const plan = plans.get(item.planId), key = item.planId + '|' + item.asOf;
    need(plan && plan.watchId === item.watchId && !caught.has(key) &&
      state.captures.some(capture => capture.id === item.captureId),
      'A release acquisition lost its original plan, watch or economic source.');
    caught.add(key); releaseSourceId(item.captureId); date(item.asOf, 'Acquired source date');
    need(canonical(normalizeSelection(item.selection)) === canonical(item.selection) &&
      item.asOf === item.selection.asOf, 'The acquired vintage selection changed.');
  }
}
export function fredReleaseCaptureDirectory(directory, releaseCaptureId) {
  return join(resolve(directory), 'release-sources', releaseSourceId(releaseCaptureId));
}
function fredReleasePlanPath(directory, planId) {
  return join(resolve(directory), 'release-plans', releasePlanId(planId) + '.json');
}
function releaseCaptureSummary(capture, model = inspectFredReleaseCapture(capture)) {
  return { id: capture.captureSha256, selection: clone(model.selection), rowCount: model.rowCount,
    series: model.series.map(({ vintageDates, originalMetadata, ...item }) => ({
      ...clone(item), vintageCount: vintageDates.length, latestVintageDate: vintageDates.at(-1) ?? null })),
    releaseCount: model.releases.length, calendarRows: model.calendar.length,
    vintageRows: model.vintages.length, recordCount: capture.records.length };
}
function releasePlanSummary(plan) {
  return { id: plan.id, watchId: plan.watchId, beforeCaptureSha256: plan.beforeCaptureSha256,
    afterCaptureSha256: plan.afterCaptureSha256, metadataAsOf: plan.metadataAsOf,
    completedAsOf: clone(plan.completedAsOf), summary: clone(plan.summary), coverage: clone(plan.coverage) };
}
function releaseWatchFromState(state, watchId) {
  const watch = (state.releaseWatches ?? []).find(item => item.id === watchId);
  need(watch, 'Choose a saved release watch from this project.', 'FRED_RELEASE_WATCH_NOT_FOUND', 404);
  return validateFredReleaseWatch(watch);
}
function releasePlanFromState(state, planId) {
  releasePlanId(planId);
  const plan = (state.releasePlans ?? []).find(item => item.id === planId);
  need(plan, 'Choose a saved release plan from this project.', 'FRED_RELEASE_PLAN_NOT_FOUND', 404);
  return plan;
}
async function projectReleaseCapture(directory, state, releaseCaptureId) {
  releaseSourceId(releaseCaptureId);
  const summary = (state.releaseCaptures ?? []).find(item => item.id === releaseCaptureId);
  need(summary, 'Choose a retained release source from this project.', 'FRED_RELEASE_CAPTURE_NOT_FOUND', 404);
  const { capture, model } = await readFredReleaseCapture(join(fredReleaseCaptureDirectory(directory, releaseCaptureId), 'capture.json'));
  need(capture.captureSha256 === releaseCaptureId && canonical(summary) === canonical(releaseCaptureSummary(capture, model)),
    'The retained release source differs from its project index.');
  return capture;
}
export async function listFredReleaseCaptures({ directory } = {}) {
  const state = await readFredProject(directory);
  return { projectId: state.id, revision: state.revision, captures: clone(state.releaseCaptures ?? []) };
}
export async function getFredReleaseCapture({ directory, releaseCaptureId } = {}) {
  return projectReleaseCapture(directory, await readFredProject(directory), releaseCaptureId);
}
function adoptFredReleaseSummary(state, capture, model) {
  const summary = releaseCaptureSummary(capture, model);
  state.releaseCaptures ??= [];
  const previous = state.releaseCaptures.find(item => item.id === summary.id);
  need(!previous || canonical(previous) === canonical(summary), 'The original release source summary changed.');
  if (!previous) state.releaseCaptures.push(summary);
  return { releaseCaptureId: summary.id, capture: clone(summary) };
}
export async function importFredReleaseCapture({ directory, id, expectedRevision, capture, releaseCaptureId } = {}) {
  operationId(id);
  const state = await readFredProject(directory);
  let staged;
  if (capture !== undefined && capture !== null) {
    capture = clone(capture);
    inspectFredReleaseCapture(capture);
    if (releaseCaptureId !== undefined && releaseCaptureId !== null)
      need(releaseSourceId(releaseCaptureId) === capture.captureSha256, 'The supplied release capture and ID differ.');
    releaseCaptureId = capture.captureSha256;
    // Retain the complete source before beginning the small, resumable project mutation.
    staged = await storeFredReleaseCapture(fredReleaseCaptureDirectory(directory, releaseCaptureId), capture);
  } else {
    releaseSourceId(releaseCaptureId);
    const previous = state.operations.find(item => item.id === id);
    const pending = state.pending;
    need((previous?.kind === 'release-import' && previous.result.releaseCaptureId === releaseCaptureId) ||
      (pending?.id === id && pending.kind === 'release-import' && pending.payload.releaseCaptureId === releaseCaptureId),
      'Continue the original release import operation or supply its complete source.',
      'FRED_RELEASE_IMPORT_CONTINUATION_REQUIRED', 409);
    staged = await readFredReleaseCapture(join(fredReleaseCaptureDirectory(directory, releaseCaptureId), 'capture.json'));
    need(staged.capture.captureSha256 === releaseCaptureId, 'The staged original release source changed.');
  }
  return transact(directory, { id, expectedRevision, kind: 'release-import', payload: { releaseCaptureId } },
    state => adoptFredReleaseSummary(state, staged.capture, staged.model));
}
export async function acquireFredReleaseCapture({ directory, id, expectedRevision, selection,
  signal, environment, fetchImpl } = {}) {
  const original = await readFredProject(directory);
  if (selection === undefined && original.pending?.id === id && original.pending.kind === 'release-capture')
    selection = original.pending.payload.selection;
  selection = normalizeFredReleaseSelection(selection);
  return transact(directory, { id, expectedRevision, kind: 'release-capture', payload: { selection } }, async (state, root) => {
    const acquired = await captureFredReleases({ directory: join(root, 'release-acquisitions', id), selection,
      apiKeyEnv: state.apiKeyEnv, signal, environment, fetchImpl });
    const retained = await storeFredReleaseCapture(fredReleaseCaptureDirectory(root, acquired.capture.captureSha256), acquired.capture);
    return { ...adoptFredReleaseSummary(state, retained.capture, retained.model), acquisitionId: id };
  });
}
export async function listFredReleaseWatches({ directory } = {}) {
  const state = await readFredProject(directory);
  return { projectId: state.id, revision: state.revision, watches: clone(state.releaseWatches ?? []),
    plans: clone(state.releasePlans ?? []), catchUps: clone(state.releaseCatchUps ?? []) };
}
async function releaseWatchTemplate(directory, state, templateId) {
  if (templateId === null) return null;
  const template = templateFromState(state, templateId);
  const review = state.reviews.find(item => item.id === template.origin.reviewId);
  need(review?.briefing && review.captureId === template.origin.captureId,
    'The release watch template lost its original analyst review.');
  const rebuilt = createFredBriefingTemplate({ name: template.name, review,
    model: validateCapture(await getFredCapture(directory, review.captureId)),
    window: template.window, previousTemplateId: template.previousTemplateId });
  need(canonical(rebuilt) === canonical(template), 'The watched template differs from its original analyst source.');
  return template;
}
export async function saveFredReleaseWatch({ directory, id, expectedRevision, name, series, templateId = null,
  observationStart, observationEnd = 'as_of', baselineAsOf, catchUp = 'all_vintages',
  pageSize = 1000, maxRows = 1000000 } = {}) {
  const original = await readFredProject(directory);
  const template = await releaseWatchTemplate(directory, original, templateId);
  const watch = createFredReleaseWatch({ name, ...(series === undefined ? {} : { series }), template,
    observationStart, observationEnd, baselineAsOf, catchUp, pageSize, maxRows });
  const payload = { name: watch.name, series: watch.series, templateId, observationStart: watch.observationStart,
    observationEnd: watch.observationEnd, baselineAsOf: watch.baselineAsOf, catchUp: watch.catchUp,
    pageSize: watch.pageSize, maxRows: watch.maxRows, watchId: watch.id };
  return transact(directory, { id, expectedRevision, kind: 'release-watch-save', payload }, async (state, root) => {
    const retainedTemplate = await releaseWatchTemplate(root, state, templateId);
    need(canonical(retainedTemplate) === canonical(watch.template), 'The original watched template changed.');
    state.releaseWatches ??= [];
    if (!state.releaseWatches.some(item => item.id === watch.id)) state.releaseWatches.push(watch);
    return { watchId: watch.id, watch };
  });
}
function releaseHistory(state) {
  const plans = new Map((state.releasePlans ?? []).map(plan => [plan.id, plan]));
  const saved = new Map(), completed = new Map();
  state.operations.forEach((operation, index) => {
    if (operation.kind === 'release-plan-save' && !saved.has(operation.result?.planId))
      saved.set(operation.result?.planId, { index, operation });
    if (operation.kind === 'release-vintage-capture' && operation.result?.catchUp) {
      const item = operation.result.catchUp, key = item.planId + '|' + item.asOf;
      if (!completed.has(key)) completed.set(key, { index, operation });
    }
  });
  return { plans, saved, completed };
}
function releaseCompletedDates(state, watchId, afterCaptureSha256, beforeIndex = Infinity, history = releaseHistory(state)) {
  const values = new Set();
  for (const item of state.releaseCatchUps ?? []) {
    const plan = history.plans.get(item.planId), operation = history.completed.get(item.planId + '|' + item.asOf);
    if (item.watchId === watchId && plan?.afterCaptureSha256 === afterCaptureSha256 &&
      operation && operation.index < beforeIndex) values.add(item.asOf);
  }
  return [...values].sort();
}
function validateReleasePlanHistory(state, plan, history = releaseHistory(state)) {
  const saved = history.saved.get(plan.id);
  need(saved && canonical(saved.operation.result.plan) === canonical(releasePlanSummary(plan)),
    'The release plan lost its original completed project operation.');
  const completed = releaseCompletedDates(state, plan.watchId, plan.afterCaptureSha256, saved.index, history);
  need(canonical(completed) === canonical(plan.completedAsOf),
    'The saved plan completion snapshot differs from the original same-watch, same-source acquisition history.');
}
function releasePlanInput({ watchId, beforeCaptureId = null, afterCaptureId } = {}) {
  need(typeof watchId === 'string' && /^fred-release-watch-[a-f0-9]{64}$/.test(watchId),
    'Choose the original saved release watch.');
  if (beforeCaptureId !== null) releaseSourceId(beforeCaptureId);
  releaseSourceId(afterCaptureId);
  return { watchId, beforeCaptureId, afterCaptureId };
}
async function releasePlanContext(directory, state, input) {
  const watch = releaseWatchFromState(state, input.watchId);
  const before = input.beforeCaptureId === null ? null : await projectReleaseCapture(directory, state, input.beforeCaptureId);
  const after = await projectReleaseCapture(directory, state, input.afterCaptureId);
  const plan = planFredReleaseCatchUp({ watch, before, after,
    completedAsOf: releaseCompletedDates(state, watch.id, after.captureSha256) });
  const previewId = digest({ schema: 'stellar-forge.fred-release-preview.v1', projectId: state.id, planId: plan.id });
  return { plan, previewId };
}
export async function previewFredReleasePlan({ directory, section = 'acquisitions', offset = 0, limit = 100, ...request } = {}) {
  const state = await readFredProject(directory), input = releasePlanInput(request);
  const { plan, previewId } = await releasePlanContext(directory, state, input);
  return { projectId: state.id, revision: state.revision, previewId, plan: pageFredReleasePlan(plan, { section, offset, limit }) };
}
async function storeProjectReleasePlan(directory, plan) {
  validateFredReleasePlan(plan);
  const parent = await privateDirectory(join(resolve(directory), 'release-plans'));
  const path = fredReleasePlanPath(directory, plan.id);
  const previous = await optionalJson(path, MAX_CAPTURE_BYTES);
  if (previous) need(canonical(previous) === canonical(plan), 'This release plan ID retains another original descriptor.');
  else await atomicJson(parent, plan.id + '.json', plan, { exclusive: true });
  return plan;
}
export async function saveFredReleasePlan({ directory, id, expectedRevision, previewId, ...request } = {}) {
  const input = releasePlanInput(request);
  need(typeof previewId === 'string' && /^[a-f0-9]{64}$/.test(previewId),
    'Preview the complete release selection before saving the plan.');
  const original = await readFredProject(directory);
  if (!original.operations.some(item => item.id === id)) {
    const value = await releasePlanContext(directory, original, input);
    need(value.previewId === previewId, 'The release plan changed; review its current source and completion history.',
      'FRED_RELEASE_PREVIEW_CHANGED', 409);
  }
  return transact(directory, { id, expectedRevision, kind: 'release-plan-save', payload: { ...input, previewId } },
    async (state, root) => {
      const value = await releasePlanContext(root, state, input);
      need(value.previewId === previewId, 'The release plan changed; review its current source and completion history.',
        'FRED_RELEASE_PREVIEW_CHANGED', 409);
      await storeProjectReleasePlan(root, value.plan);
      const summary = releasePlanSummary(value.plan);
      state.releasePlans ??= [];
      const existing = state.releasePlans.find(item => item.id === summary.id);
      need(!existing || canonical(existing) === canonical(summary), 'The original saved release plan summary changed.');
      if (!existing) state.releasePlans.push(summary);
      return { planId: summary.id, plan: summary };
    });
}
async function retainedFredReleasePlan(directory, state, planId) {
  const summary = releasePlanFromState(state, planId);
  const plan = await readPrivateJson(fredReleasePlanPath(directory, planId), MAX_CAPTURE_BYTES);
  const before = plan.beforeCaptureSha256 === null ? null : await projectReleaseCapture(directory, state, plan.beforeCaptureSha256);
  const after = await projectReleaseCapture(directory, state, plan.afterCaptureSha256);
  validateFredReleasePlan(plan, { before, after });
  need(canonical(releasePlanSummary(plan)) === canonical(summary) &&
    canonical(releaseWatchFromState(state, plan.watchId)) === canonical(plan.watch),
    'The original saved release plan source or watch changed.');
  validateReleasePlanHistory(state, plan);
  return plan;
}
export async function getFredReleasePlan({ directory, planId, section = 'acquisitions', offset = 0, limit = 100 } = {}) {
  const state = await readFredProject(directory), plan = await retainedFredReleasePlan(directory, state, planId);
  return { projectId: state.id, revision: state.revision, plan: pageFredReleasePlan(plan, { section, offset, limit }),
    catchUps: clone((state.releaseCatchUps ?? []).filter(item => item.planId === planId)) };
}
export async function downloadFredReleasePlan({ directory, planId } = {}) {
  const state = await readFredProject(directory), plan = await retainedFredReleasePlan(directory, state, planId);
  const body = jsonBytes(plan);
  need(body.length <= MAX_CAPTURE_BYTES, 'The complete release plan exceeds 64 MiB.', 'FRED_CAPTURE_TOO_LARGE', 413);
  return { body, bytes: body.length, sha256: hash(body), contentType: 'application/json',
    path: 'fred-release-plan.json', planId: plan.id, watchId: plan.watchId };
}
export async function acquireFredPlannedVintage({ directory, id, expectedRevision, planId, asOf,
  signal, environment, fetchImpl } = {}) {
  const original = await readFredProject(directory), plan = await retainedFredReleasePlan(directory, original, planId);
  date(asOf, 'Planned source date');
  const acquisition = plan.acquisitions.find(item => item.asOf === asOf);
  need(acquisition, 'Choose an explicit observation acquisition from the saved release plan.');
  const payload = { planId: plan.id, asOf, watchId: plan.watchId,
    afterCaptureSha256: plan.afterCaptureSha256, selection: clone(acquisition.selection) };
  return transact(directory, { id, expectedRevision, kind: 'release-vintage-capture', payload }, async (state, root) => {
    const savedPlan = await retainedFredReleasePlan(root, state, plan.id);
    const selected = savedPlan.acquisitions.find(item => item.asOf === asOf);
    need(selected && canonical(selected.selection) === canonical(payload.selection),
      'The selected planned observation acquisition changed.');
    const previous = (state.releaseCatchUps ?? []).find(item => item.planId === plan.id && item.asOf === asOf);
    let captured;
    if (previous) {
      need(canonical(previous.selection) === canonical(selected.selection), 'The original completed vintage selection changed.');
      captured = await getFredCapture(root, previous.captureId);
    } else {
      const acquired = await captureFred({ directory: join(root, 'release-vintage-acquisitions', id),
        selection: selected.selection, apiKeyEnv: state.apiKeyEnv, signal, environment, fetchImpl });
      captured = acquired.capture;
    }
    const model = validateCapture(captured);
    need(canonical(model.selection) === canonical(selected.selection),
      'The acquired observation edition differs from its original planned selection.');
    const adopted = await adoptCapture(state, root, captured);
    const catchUp = { watchId: plan.watchId, planId: plan.id, asOf, captureId: adopted.captureId,
      selection: clone(selected.selection) };
    state.releaseCatchUps ??= [];
    if (!previous) state.releaseCatchUps.push(catchUp);
    else need(canonical(previous) === canonical(catchUp), 'The original completed vintage record changed.');
    return { ...adopted, watchId: plan.watchId, planId: plan.id, asOf, selection: clone(selected.selection),
      catchUp, acquisitionId: id, reusedCapture: Boolean(previous) };
  });
}
async function validateReleaseBundle(state, releaseCaptures, releasePlans, captures) {
  validateReleaseState(state);
  need(Array.isArray(releaseCaptures) && Array.isArray(releasePlans) &&
    releaseCaptures.length === (state.releaseCaptures?.length ?? 0) &&
    new Set(releaseCaptures.map(item => item?.captureSha256)).size === releaseCaptures.length &&
    releasePlans.length === (state.releasePlans?.length ?? 0) &&
    new Set(releasePlans.map(item => item?.id)).size === releasePlans.length,
    'The complete release bundle must retain every original source snapshot and saved plan.');
  const sourceMap = new Map(), planMap = new Map(), captureMap = new Map(), history = releaseHistory(state);
  for (const capture of releaseCaptures) {
    const summary = releaseCaptureSummary(capture);
    const original = (state.releaseCaptures ?? []).find(item => item.id === summary.id);
    need(original && canonical(original) === canonical(summary), 'A portable release source differs from its original project index.');
    sourceMap.set(summary.id, capture);
  }
  for (const capture of captures) captureMap.set(capture.captureSha256, capture);
  for (const plan of releasePlans) {
    const summary = releasePlanFromState(state, plan.id);
    const before = plan.beforeCaptureSha256 === null ? null : sourceMap.get(plan.beforeCaptureSha256);
    const after = sourceMap.get(plan.afterCaptureSha256);
    need(after && (plan.beforeCaptureSha256 === null || before), 'The portable release plan lost an original source snapshot.');
    validateFredReleasePlan(plan, { before, after });
    need(canonical(releasePlanSummary(plan)) === canonical(summary) &&
      canonical(releaseWatchFromState(state, plan.watchId)) === canonical(plan.watch),
      'The portable release plan differs from its saved watch or completion snapshot.');
    validateReleasePlanHistory(state, plan, history);
    planMap.set(plan.id, plan);
  }
  for (const item of state.releaseCatchUps ?? []) {
    const plan = planMap.get(item.planId), capture = captureMap.get(item.captureId);
    const planned = plan?.acquisitions.find(value => value.asOf === item.asOf);
    const completed = history.completed.get(item.planId + '|' + item.asOf), saved = history.saved.get(item.planId);
    need(plan?.watchId === item.watchId && planned && capture && completed && saved &&
      completed.index > saved.index && canonical(completed.operation.result.catchUp) === canonical(item) &&
      canonical(planned.selection) === canonical(item.selection) &&
      canonical(validateCapture(capture).selection) === canonical(item.selection),
      'A portable catch-up lost its exact original plan, acquired source or completed operation.');
  }
}

export async function compareFredCaptures({ directory, before, after } = {}) {
  const [first, second] = await Promise.all([getFredCapture(directory, before), getFredCapture(directory, after)]);
  return { ...compareCaptures(first, second), beforeCapture: before, afterCapture: after };
}
export async function publishFredReview({ directory, id, expectedRevision, reviewId, origin, path = '/economic-data', payment } = {}) {
  const parsedOrigin = new URL(origin);
  need(parsedOrigin.protocol === 'https:' && !parsedOrigin.username && !parsedOrigin.password && !parsedOrigin.search &&
    !parsedOrigin.hash && parsedOrigin.pathname === '/' && origin.replace(/\/$/, '') === parsedOrigin.origin,
    'Choose the merchant’s canonical public HTTPS origin.');
  origin = parsedOrigin.origin;
  return transact(directory, { id, expectedRevision, kind: 'publish', payload: { reviewId, origin, path, payment } },
    async (state, root) => {
      const review = state.reviews.find(item => item.id === reviewId);
      need(review, 'Select a retained reviewed edition.');
      const publicationId = digest({ reviewId, origin, path, payment });
      const { prepareFredEdition, stageFredMerchant } = await import('./merchant.mjs');
      const publicationDirectory = join(root, 'publications', publicationId);
      const edition = await prepareFredEdition({ directory: publicationDirectory,
        capture: await getFredCapture(root, review.captureId), review,
        ...(review.briefing ? { briefing: await getFredBriefing(root, review.id, { includeFiles: true }) } : {}) });
      const merchant = await stageFredMerchant({ directory: publicationDirectory, origin, path, payment });
      const result = { publicationId, reviewId, captureId: review.captureId, snapshot: edition.snapshot,
        editionId: edition.editionId, resource: merchant.resource, publicOrigin: merchant.origin,
        ...(edition.briefing ? { briefing: edition.briefing } : {}) };
      if (!state.publications.some(item => item.id === publicationId)) state.publications.push({ id: publicationId, ...result });
      return result;
    });
}
export function fredPublicationDirectory(directory, publicationId) {
  need(/^[a-f0-9]{64}$/.test(publicationId ?? ''), 'Select a retained publication ID.');
  return join(resolve(directory), 'publications', publicationId);
}
export async function selectFredPublication(directory, publicationId) {
  const state = await readFredProject(directory);
  need(state.publications.some(item => item.id === publicationId), 'Publication does not belong to this project.');
  return fredPublicationDirectory(directory, publicationId);
}
export async function exportFredProject({ directory, qcewSourceContexts = null } = {}) {
  directory = resolve(directory);
  return withPrivateLock(directory, 'project.lock', async () => {
    const state = await readFredProject(directory);
    need(!state.pending, 'Complete or abandon the active operation before exporting the project.', 'FRED_OPERATION_PENDING', 409);
    const captures = [];
    for (const item of state.captures) captures.push(await getFredCapture(directory, item.id));
    const publicationPlans = [];
    for (const publication of state.publications) {
      const plan = await readPrivateJson(join(fredPublicationDirectory(directory, publication.id), 'merchant-plan.json'));
      publicationPlans.push({ id: publication.id, origin: plan.origin, path: plan.path, payment: plan.payment });
    }
    const analystReviews = state.reviews.filter(review => review.briefing), briefings = [];
    for (const review of analystReviews) briefings.push(exportFredBriefingFiles(await getFredBriefing(directory, review.id, { includeFiles: true })));
    const recurring = (state.briefingTemplates?.length ?? 0) > 0;
    await validateRecurringBundle(state, captures);
    const release = releaseStatePresent(state), releaseCaptures = [], releasePlans = [];
    if (release) {
      for (const summary of state.releaseCaptures ?? [])
        releaseCaptures.push(await projectReleaseCapture(directory, state, summary.id));
      for (const summary of state.releasePlans ?? [])
        releasePlans.push(await retainedFredReleasePlan(directory, state, summary.id));
      await validateReleaseBundle(state, releaseCaptures, releasePlans, captures);
    }
    const ddp = fredDdpStatePresent(state), ddpValues = ddp ? await ddpProject.exportDdp(directory, state, captures) : null;
    const qcew = await exportQcewExtension(directory, state, captures, { sourceContexts: qcewSourceContexts });
    const extended = ddp || qcew !== null;
    const bundle = { schema: qcew ? QCEW_BUNDLE : ddp ? FRED_DDP_PROJECT_BUNDLE : release ? RELEASE_BUNDLE : recurring ? RECURRING_BUNDLE : briefings.length ? BRIEFING_BUNDLE : BUNDLE,
      state, captures, publicationPlans, ...(extended || release || briefings.length ? { briefings } : {}),
      ...(extended || release ? { releaseCaptures, releasePlans } : {}),
      ...(extended ? ddpValues ?? Object.fromEntries(FRED_DDP_PROJECT_KEYS.map(key => [key, []])) : {}),
      ...(qcew ? { qcew } : {}) };
    bundle.bundleSha256 = canonicalJSONDigest(bundle);
    need(canonicalJSONInfo(bundle).prettyBytes + 1 <= (extended ? FRED_DDP_PROJECT_BUNDLE_MAX_BYTES : 256 * 1024 * 1024),
      extended ? 'The complete project bundle exceeds the 480 MiB receiving capacity; export original sources separately.' :
        'Project bundle exceeds 256 MiB; export captures separately.');
    return bundle;
  });
}
export async function receiveFredProject({ directory, bundle, qcewSourceContexts = null } = {}) {
  const qcewContextOptions = { sourceContexts: qcewSourceContexts ?? new Map() };
  directory = await privateDirectory(resolve(directory));
  const county = bundle?.schema === QCEW_BUNDLE, extended = county || bundle?.schema === FRED_DDP_PROJECT_BUNDLE;
  const ddpFields = FRED_DDP_PROJECT_KEYS.some(key => bundle?.[key] !== undefined), qcew = bundle?.qcew !== undefined;
  need([BUNDLE, BRIEFING_BUNDLE, RECURRING_BUNDLE, RELEASE_BUNDLE, FRED_DDP_PROJECT_BUNDLE, QCEW_BUNDLE].includes(bundle?.schema) && Array.isArray(bundle.captures) &&
    Array.isArray(bundle.publicationPlans) &&
    (bundle.schema === BUNDLE ? bundle.briefings === undefined : Array.isArray(bundle.briefings) &&
      (extended || bundle.schema === RELEASE_BUNDLE || bundle.briefings.length > 0)) &&
    (extended || bundle.schema === RELEASE_BUNDLE ? Array.isArray(bundle.releaseCaptures) && Array.isArray(bundle.releasePlans) :
      bundle.releaseCaptures === undefined && bundle.releasePlans === undefined) &&
    (county ? qcew && ddpFields : extended ? ddpFields || qcew : !ddpFields && !qcew) &&
    FRED_DDP_PROJECT_KEYS.every(key => ddpFields ? Array.isArray(bundle[key]) : bundle[key] === undefined) &&
    (qcew ? plain(bundle.qcew) : bundle.qcew === undefined),
    'Receive the complete original versioned project bundle.');
  need(canonicalJSONInfo(bundle).prettyBytes + 1 <= (extended ? FRED_DDP_PROJECT_BUNDLE_MAX_BYTES : 256 * 1024 * 1024),
    'The complete project bundle exceeds this version’s receiving capacity.');
  const identity = { schema: bundle.schema, state: bundle.state, captures: bundle.captures, publicationPlans: bundle.publicationPlans,
    ...(bundle.schema !== BUNDLE ? { briefings: bundle.briefings } : {}),
    ...(extended || bundle.schema === RELEASE_BUNDLE ? { releaseCaptures: bundle.releaseCaptures, releasePlans: bundle.releasePlans } : {}),
    ...(ddpFields ? Object.fromEntries(FRED_DDP_PROJECT_KEYS.map(key => [key, bundle[key]])) : {}),
    ...(qcew ? { qcew: bundle.qcew } : {}) };
  need(bundle.bundleSha256 === canonicalJSONDigest(identity), 'Project bundle identity changed.');
  const original = projectState(clone(bundle.state));
  need(!original.pending, 'A receiving bundle must contain a completed project state.');
  const recurring = (original.briefingTemplates?.length ?? 0) > 0 ||
    (original.briefingSuccessors?.length ?? 0) > 0;
  const release = releaseStatePresent(original), ddp = fredDdpStatePresent(original);
  need((county ? qcew && (ddp || FRED_DDP_PROJECT_KEYS.every(key => bundle[key].length === 0)) : ddpFields === ddp) &&
    qcew === qcewStatePresent(original) && (extended ||
    (bundle.schema === RELEASE_BUNDLE) === release &&
    (release || (bundle.schema === RECURRING_BUNDLE) === recurring)),
    'Use the complete versioned bundle for this DDP, county, release and recurring briefing project.');
  const analystReviews = original.reviews.filter(review => review.briefing);
  need((bundle.briefings ?? []).length === analystReviews.length &&
    new Set((bundle.briefings ?? []).map(item => item.manifest?.reviewId)).size === analystReviews.length &&
    (bundle.briefings ?? []).every(item => analystReviews.some(review => review.id === item.manifest?.reviewId)),
    'The complete project bundle must retain every original analyst briefing.');
  need(bundle.publicationPlans.length === original.publications.length &&
    new Set(bundle.publicationPlans.map(item => item.id)).size === original.publications.length,
    'The complete original publication plan inventory differs.');
  need(bundle.captures.length === original.captures.length &&
    new Set(bundle.captures.map(item => item.captureSha256)).size === bundle.captures.length, 'Bundle source inventory differs.');
  await validateRecurringBundle(original, bundle.captures);
  if (release || extended) await validateReleaseBundle(original, bundle.releaseCaptures, bundle.releasePlans, bundle.captures);
  if (ddp) validateFredDdpProjectBundle({ state: original, captures: bundle.captures,
    ...Object.fromEntries(FRED_DDP_PROJECT_KEYS.map(key => [key, bundle[key]])) });
  validateQcewExtension(bundle.qcew, original, bundle.captures, qcewContextOptions);
  return withPrivateLock(directory, 'project.lock', async () => {
    const received = await optionalJson(join(directory, 'received.json'));
    if (received) {
      need(received.bundleSha256 === bundle.bundleSha256, 'This directory received another project.', 'FRED_RECEIVING_CONFLICT', 409);
      const state = await readFredProject(directory);
      return { ...received, revision: state.revision, reused: true };
    }
    const current = await optionalJson(join(directory, 'project.json'), STATE_LIMIT);
    need(current === null || canonical(current) === canonical(original),
      'Receive into an empty private project directory.', 'FRED_RECEIVING_CONFLICT', 409);
    for (const capture of bundle.captures) {
      validateCapture(capture);
      need(original.captures.some(item => item.id === capture.captureSha256), 'Unexpected source in receiving bundle.');
      await storeFredCapture(fredCaptureDirectory(directory, capture.captureSha256), capture);
    }
    await privateDirectory(join(directory, 'reviews'));
    for (const review of original.reviews) {
      const capture = bundle.captures.find(item => item.captureSha256 === review.captureId);
      need(capture, 'The saved review lost its original source.');
      validateFredReview(review, validateCapture(capture));
      const existing = await optionalJson(join(directory, 'reviews', review.id + '.json'));
      if (existing) need(canonical(existing) === canonical(review), 'Receiving review conflicts.');
      else await atomicJson(join(directory, 'reviews'), review.id + '.json', review, { exclusive: true });
    }
    for (const review of analystReviews) {
      const capture = bundle.captures.find(item => item.captureSha256 === review.captureId);
      const transfer = bundle.briefings.find(item => item.manifest.reviewId === review.id);
      await receiveFredBriefingFiles({ directory: fredBriefingDirectory(directory, review.id), transfer, capture, review });
    }
    if (release) {
      for (const capture of bundle.releaseCaptures)
        await storeFredReleaseCapture(fredReleaseCaptureDirectory(directory, capture.captureSha256), capture);
      for (const plan of bundle.releasePlans) await storeProjectReleasePlan(directory, plan);
    }
    if (ddp) await ddpProject.receiveDdp(directory, original, bundle);
    // Reconstruct native merchant files with the original retained analyst bytes, source and payment inputs.
    for (const publication of original.publications) {
      const { prepareFredEdition, stageFredMerchant } = await import('./merchant.mjs');
      const operation = original.operations.find(item => item.kind === 'publish' && item.result.publicationId === publication.id);
      need(operation, 'Publication has no original completed operation.');
      // Payment terms are retained separately in its portable descriptor below.
      const plan = bundle.publicationPlans?.find(item => item.id === publication.id);
      need(plan && plan.id === digest({ reviewId: publication.reviewId, origin: plan.origin, path: plan.path, payment: plan.payment }),
        'Publication needs its original portable payment plan.');
      const review = original.reviews.find(item => item.id === publication.reviewId);
      const capture = bundle.captures.find(item => item.captureSha256 === publication.captureId);
      const root = fredPublicationDirectory(directory, publication.id);
      const briefing = review?.briefing ? await readFredBriefingFiles(fredBriefingDirectory(directory, review.id),
        { captureId: review.captureId, reviewId: review.id, includeFiles: true }) : null;
      const edition = await prepareFredEdition({ directory: root, capture, review, ...(briefing ? { briefing } : {}) });
      need(edition.snapshot === publication.snapshot && edition.editionId === publication.editionId, 'Receiving edition identity changed.');
      await stageFredMerchant({ directory: root, origin: plan.origin, path: plan.path, payment: plan.payment });
    }
    await receiveQcewExtension(directory, bundle.qcew, original, bundle.captures, qcewContextOptions);
    await atomicJson(directory, 'project.json', original);
    const receipt = { schema: 'stellar-forge.fred-receiving.v1', bundleSha256: bundle.bundleSha256,
      projectId: original.id, revision: original.revision, receivedAt: new Date().toISOString() };
    await atomicJson(directory, 'received.json', receipt, { exclusive: true }); return receipt;
  });
}
export async function fredProjectView(directory) {
  const state = await readFredProject(directory);
  let acquisition = null;
  if (['capture', 'release-vintage-capture'].includes(state.pending?.kind)) {
    const path = state.pending.kind === 'capture' ? 'acquisitions' : 'release-vintage-acquisitions';
    const value = await optionalJson(join(resolve(directory), path, state.pending.id, 'progress.json'));
    if (value) acquisition = { state: value.state, responses: value.records.length, lastError: value.lastError,
      startedAt: value.startedAt, selection: value.selection,
      ...(state.pending.kind === 'release-vintage-capture' ? { kind: state.pending.kind } : {}) };
  } else if (state.pending?.kind === 'release-capture') {
    const { directory: privatePath, ...progress } = await inspectFredReleaseAcquisition({
      directory: join(resolve(directory), 'release-acquisitions', state.pending.id) });
    acquisition = { ...progress, kind: state.pending.kind };
  } else if (state.pending?.kind === 'ddp-migration-acquire') {
    acquisition = await ddpProject.acquisitionView(directory, state);
  }
  return { ...state, briefingTemplates: clone(state.briefingTemplates ?? []),
    briefingSuccessors: clone(state.briefingSuccessors ?? []),
    releaseCaptures: clone(state.releaseCaptures ?? []), releaseWatches: clone(state.releaseWatches ?? []),
    releasePlans: clone(state.releasePlans ?? []), releaseCatchUps: clone(state.releaseCatchUps ?? []),
    ...Object.fromEntries(FRED_DDP_PROJECT_KEYS.map(key => [key, clone(state[key] ?? [])])),
    operations: state.operations.map(({ id, kind, completedAt, result }) => ({ id, kind, completedAt, result })), acquisition };
}

// Additive DDP persistence shares the original transaction, source adoption and project history.
const ddpProject = createFredDdpProjectExtension({ readProject: readFredProject, transact,
  readCapture: getFredCapture, adoptCapture });
export const { listFredDdpSources, getFredDdpCrosswalk, importFredDdpCrosswalk, acquireFredDdpCrosswalk,
  getFredDdpPackage, importFredDdpPackage, previewFredDdpMigration, saveFredDdpMigration,
  getFredDdpMigration, downloadFredDdpMigration, acquireFredDdpMigration, getFredDdpReceiving,
  downloadFredDdpReceiving } = ddpProject;

// County reports use the same original operation IDs, revisions and pending journal.
export { transact as transactFredProject };
