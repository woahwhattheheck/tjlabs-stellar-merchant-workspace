// MIT. One explicitly started request-set run over the original preview engine.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, plain, projectName } from './store.mjs';
import { previewAuthoredOperation } from './authoring.mjs';
import { REQUEST_ATTEMPT_SCHEMA, requestFailure as fail, requestUuid, requestJson,
  normalizeRunStart, normalizeRunContinuation, requestAttemptFile, requestRunFile,
  readRequestFile, writeRequestFile, readRequestSet, verifyRequestSetSources,
  attachedRun, prepareRequestRun, recoverRunCheckpoints, appendRunCheckpoint,
  inspectRunCase, requestRunReference, readRequestRun } from './request-sets.mjs';

const CONTROL = 'stellar-forge.graphql-request-run-control.v1';
const MAX_ACTIONS = 128;
const UUID_FILE = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?:\.done)?\.json$/;
const same = (a, b) => requestJson(a).equals(requestJson(b));
async function optional(operation) {
  try { return await operation(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function runJobView(job) {
  return job ? { attemptId: job.id, runId: job.runId, project: job.project, state: job.state,
    currentCaseId: job.currentCaseId ?? null, currentPreviewId: job.currentPreviewId ?? null,
    pauseRequested: Boolean(job.pauseRequested), cancellationRequested: Boolean(job.controller.signal.aborted),
    startedAt: job.startedAt, finishedAt: job.finishedAt ?? null, settled: Boolean(job.settled), error: job.error ?? null } : null;
}
function controlsDirectory(runId) { return 'request-runs/' + requestUuid(runId) + '/controls'; }
async function actionNames(store, directory) {
  const entries = await optional(() => readdir(join(store.root, directory), { withFileTypes: true })) ?? [];
  const names = entries.filter(item => UUID_FILE.test(item.name));
  if (names.length > MAX_ACTIONS * 2 || names.some(item => !item.isFile())) fail('The original run action directory is inconsistent.', 409);
  return names.map(item => directory + '/' + item.name).sort();
}
export async function runAuxiliaryFiles(store, run) {
  const names = [...await actionNames(store, 'request-runs/' + requestUuid(run.id) + '/attempts'),
    ...await actionNames(store, controlsDirectory(run.id))];
  const result = [];
  for (const name of names) {
    const entry = await readRequestFile(store, name), value = entry.record;
    validateRunAuxiliaryRecord(value, run, name);
    result.push({ name, ...entry });
  }
  return result;
}
export function validateRunAuxiliaryRecord(value, run, name) {
  if (name !== undefined) {
    const expected = value.schema === REQUEST_ATTEMPT_SCHEMA
      ? requestAttemptFile(run.id, value.id, name.endsWith('.done.json'))
      : controlsDirectory(run.id) + '/' + requestUuid(value.id) + '.json';
    if (name !== expected) fail('The original run action filename changed its request identity.', 409);
  }
  if (value.runId !== run.id || value.project !== run.project || !plain(value.request) ||
      digest(requestJson(value.request)) !== value.requestSha256)
    fail('An original run action belongs to different retained inputs.', 409);
  if (value.schema === REQUEST_ATTEMPT_SCHEMA) {
    const normalized = value.kind === 'start' ? normalizeRunStart(value.request)
      : value.kind === 'continue' ? normalizeRunContinuation(value.request) : null;
    if (!normalized || !same(normalized, value.request) || normalized.id !== value.id ||
        (value.kind === 'start' ? normalized.id !== run.id || !same(normalized, run.startRequest) : normalized.runId !== run.id))
      fail('The retained run attempt changed its exact original request.', 409);
  } else if (value.schema === CONTROL) {
    if (!same(normalizeRunControl(value.request), value.request) || value.id !== value.request.id)
      fail('The original run control changed its selected attempt.', 409);
  } else fail('Unknown original run action record.', 409);
  return value;
}
async function stoppedByOriginalControl(store, run, attemptId) {
  const entries = await runAuxiliaryFiles(store, run);
  return entries.some(entry => entry.record.schema === CONTROL && entry.record.request.attemptId === attemptId);
}
async function retainAttempt(store, kind, request, run) {
  const requestSha256 = digest(requestJson(request)), path = requestAttemptFile(run.id, request.id);
  let retained = await optional(() => readRequestFile(store, path));
  if (retained) {
    if (retained.record.schema !== REQUEST_ATTEMPT_SCHEMA || retained.record.requestSha256 !== requestSha256 ||
        retained.record.kind !== kind || retained.record.runId !== run.id || retained.record.project !== run.project ||
        !same(retained.record.request, request))
      fail('This run-attempt UUID already retains a different original request.', 409);
  } else {
    const names = await actionNames(store, 'request-runs/' + run.id + '/attempts');
    if (names.filter(name => !name.endsWith('.done.json')).length >= MAX_ACTIONS)
      fail('This run has reached its retained continuation limit. Start a separately identified run.', 409);
    retained = await writeRequestFile(store, path, { schema: REQUEST_ATTEMPT_SCHEMA, id: request.id,
      runId: run.id, project: run.project, kind, createdAt: new Date().toISOString(), request, requestSha256 });
  }
  const completed = await optional(() => readRequestFile(store, requestAttemptFile(run.id, request.id, true)));
  if (completed && (completed.record.schema !== REQUEST_ATTEMPT_SCHEMA || !same(completed.record.request, request) ||
      completed.record.requestSha256 !== requestSha256 || completed.record.runId !== run.id || completed.record.project !== run.project))
    fail('The original run-attempt completion differs from its retained request.', 409);
  return { record: retained.record, completed: completed?.record ?? null,
    stopped: await stoppedByOriginalControl(store, run, request.id) };
}
/** The server calls this through its original writer before starting one worker. */
export async function admitRunAttempt(store, kind, value) {
  if (!['start', 'continue'].includes(kind)) fail('Choose a start or original continuation.');
  const request = kind === 'start' ? normalizeRunStart(value) : normalizeRunContinuation(value);
  let state;
  if (kind === 'start') state = await prepareRequestRun(store, request);
  else {
    const oldAttempt = await optional(() => readRequestFile(store, requestAttemptFile(request.runId, request.id)));
    if (oldAttempt && (oldAttempt.record.kind !== kind || !same(oldAttempt.record.request, request)))
      fail('The original continuation UUID has different input.', 409);
    state = await attachedRun(store, request.project, request.runId);
    if (!oldAttempt && (state.saved.revision !== request.expectedRevision ||
        state.retained.record.generation !== request.expectedGeneration || state.retained.sha256 !== request.expectedRecordSha256))
      fail('Select the current original run checkpoint and project revision before continuing.', 409);
    state = await recoverRunCheckpoints(store, request.project, request.runId);
  }
  const selected = await readRequestSet(store, { id: state.retained.record.requestSetId, project: request.project,
    recordSha256: state.retained.record.requestSetSha256 });
  const draft = await verifyRequestSetSources(store, selected.record);
  if (draft.inputDigest !== state.retained.record.inputDigest || draft.revision !== state.retained.record.draftRevision)
    fail('The run no longer matches its saved request-set source.', 409);
  const attempt = await retainAttempt(store, kind, request, state.retained.record);
  return { ...state, selected, draft, attempt, request, dispatch: !attempt.completed && !attempt.stopped };
}
const finalState = cases => cases.some(item => item.state === 'PENDING') ? 'PAUSED'
  : cases.some(item => item.state === 'UNRESOLVED') ? 'PARTIAL' : 'COMPLETED';
async function completeAttempt(store, admitted, result) {
  return writeRequestFile(store, requestAttemptFile(admitted.retained.record.id, admitted.request.id, true),
    { ...admitted.attempt.record, completedAt: new Date().toISOString(), result });
}

/**
 * Each selected case uses its original preview UUID. A retained pending request
 * is recorded as unresolved; only never-started cases issue a source request.
 * withWriter is the original server's single-writer admission, not another store.
 */
export async function runRequestSet(store, admitted, { withWriter, job, isClosing = () => false } = {}) {
  if (typeof withWriter !== 'function' || !job?.controller) fail('Use the original workspace run owner.');
  const { request, selected, draft } = admitted, visited = new Set();
  const runId = admitted.retained.record.id;
  let last = admitted.retained, result, caught;
  try {
    job.state = 'RUNNING';
    while (!job.pauseRequested && !job.controller.signal.aborted && !isClosing()) {
      const step = await withWriter(async () => {
        const state = await recoverRunCheckpoints(store, request.project, runId);
        last = state.retained;
        const item = last.record.cases.find(row => row.state !== 'COMPLETED' && !visited.has(row.id));
        if (!item) return false;
        if (job.pauseRequested || job.controller.signal.aborted || isClosing()) return false;
        visited.add(item.id);
        const sourceCase = selected.record.cases.find(row => row.id === item.id);
        if (!sourceCase) fail('The original run case left its saved request set.', 409);
        job.currentCaseId = item.id; job.currentPreviewId = item.previewId;
        let observed = await inspectRunCase(store, last.record, sourceCase, item);
        if (observed.state === 'PENDING') {
          // Native admission persists the preview request before any network
          // dispatch and retains the exact returned error/data/HTTP body.
          await previewAuthoredOperation(store, draft, { id: item.previewId, operation: sourceCase.operation,
            variables: sourceCase.variables, allowLoopback: last.record.allowLoopback, signal: job.controller.signal });
          observed = await inspectRunCase(store, last.record, sourceCase, item);
        }
        const nextCase = observed.state === 'COMPLETED'
          ? { id: item.id, previewId: item.previewId, state: 'COMPLETED', reference: observed.reference }
          : { id: item.id, previewId: item.previewId, state: 'UNRESOLVED',
              error: { code: 'ORIGINAL_RESPONSE_UNAVAILABLE',
                message: 'The original request started without a retained complete response. Its UUID is preserved and this run does not repeat it.' } };
        if (!same(item, nextCase)) {
          const cases = last.record.cases.map(row => row.id === item.id ? nextCase : row);
          const phase = job.pauseRequested || job.controller.signal.aborted || isClosing() ? 'PAUSED'
            : cases.some(row => row.state === 'PENDING') ? 'RUNNING' : finalState(cases);
          const written = await appendRunCheckpoint(store, last, { cases, state: phase,
            event: { kind: observed.state === 'COMPLETED' ? 'case-completed' : 'original-response-unavailable', attemptId: request.id,
              caseId: item.id, previewId: item.previewId } }, observed.state === 'COMPLETED' ? observed.reference : undefined);
          last = { record: written.record, raw: written.raw, sha256: written.sha256, reference: written.reference };
        }
        return true;
      });
      if (!step) break;
      // Give normal operator requests a turn between original source calls.
      await new Promise(resolve => setImmediate(resolve));
    }
    if (!isClosing()) await withWriter(async () => {
      const state = await recoverRunCheckpoints(store, request.project, runId);
      last = state.retained;
      const phase = finalState(last.record.cases);
      if (last.record.state !== phase) {
        const written = await appendRunCheckpoint(store, last, { state: phase,
          event: { kind: job.controller.signal.aborted ? 'cancelled' : job.pauseRequested ? 'paused' : 'attempt-completed', attemptId: request.id } });
        last = { record: written.record, raw: written.raw, sha256: written.sha256, reference: written.reference };
      }
    });
    result = { state: isClosing() ? 'WORKSPACE_CLOSED' : last.record.state,
      runId, recordSha256: last.sha256, generation: last.record.generation,
      cancellationRequested: job.controller.signal.aborted, pauseRequested: Boolean(job.pauseRequested),
      next: last.record.cases.some(item => item.state === 'PENDING')
        ? 'Continue the original run explicitly to request only its unstarted cases.'
        : last.record.cases.some(item => item.state === 'UNRESOLVED')
          ? 'Inspect the retained original requests. A separately selected new run uses new preview UUIDs if another source request is wanted.'
          : 'Inspect original responses or select these cases for a retained comparison.' };
    job.state = 'FINISHED';
  } catch (error) {
    caught = error;
    job.state = 'INTERRUPTED';
    job.error = { code: error.code ?? 'RUN_CONTINUATION_INTERRUPTED', message: error.message };
    result = { state: 'INTERRUPTED', runId, generation: last.record.generation, recordSha256: last.sha256,
      error: job.error, next: 'Inspect this original run, recover any retained checkpoint, then continue its unstarted cases explicitly.' };
  } finally {
    job.currentCaseId = null; job.currentPreviewId = null; job.finishedAt = new Date().toISOString();
    try { await completeAttempt(store, admitted, result); }
    catch (error) { job.state = 'INTERRUPTED'; job.error = { code: error.code ?? 'RUN_COMPLETION_NOT_RETAINED', message: error.message }; if (!caught) caught = error; }
  }
  return { result, ...(caught ? { error: { code: caught.code ?? 'RUN_CONTINUATION_INTERRUPTED', message: caught.message } } : {}) };
}
export function normalizeRunControl(value) {
  if (!plain(value) || Object.keys(value).some(key => !['id', 'project', 'runId', 'attemptId', 'action'].includes(key)) ||
      !['pause', 'cancel'].includes(value.action)) fail('Select pause or cancellation for the original active run attempt.');
  return { id: requestUuid(value.id), project: projectName(value.project), runId: requestUuid(value.runId),
    attemptId: requestUuid(value.attemptId), action: value.action };
}
/** Bind control to one original attempt so a delayed retry cannot cancel its successor. */
export async function controlRequestRun(store, value, selectJob) {
  const request = normalizeRunControl(value), state = await attachedRun(store, request.project, request.runId);
  const attempt = await readRequestFile(store, requestAttemptFile(request.runId, request.attemptId));
  if (attempt.record.runId !== request.runId || attempt.record.project !== request.project)
    fail('The selected attempt belongs to another original run.', 409);
  const name = controlsDirectory(request.runId) + '/' + request.id + '.json';
  const old = await optional(() => readRequestFile(store, name));
  if (old && (!same(old.record.request, request) || old.record.schema !== CONTROL))
    fail('This run-control UUID already belongs to another request.', 409);
  if (!old) {
    const names = await actionNames(store, controlsDirectory(request.runId));
    if (names.length >= MAX_ACTIONS) fail('This run has reached its retained control limit.', 409);
    await writeRequestFile(store, name, { schema: CONTROL, id: request.id, runId: request.runId, project: request.project,
      createdAt: new Date().toISOString(), request, requestSha256: digest(requestJson(request)) });
  }
  // Re-select after durable control publication; never address a successor
  // that replaced the original job while the filesystem operation awaited.
  const job = selectJob(request.runId);
  const active = job && job.id === request.attemptId && !['FINISHED', 'INTERRUPTED'].includes(job.state);
  if (active) {
    job.pauseRequested = true;
    if (request.action === 'cancel') { job.state = 'CANCELLATION_REQUESTED'; job.controller.abort(); }
    else job.state = 'PAUSE_REQUESTED';
  }
  return { id: request.id, runId: request.runId, attemptId: request.attemptId, action: request.action,
    active: Boolean(active), replayed: Boolean(old), job: runJobView(job),
    reference: state.retained.reference };
}
