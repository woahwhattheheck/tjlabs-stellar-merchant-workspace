// MIT. Continue a committed native activation through its original Console recovery records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectRelease, readReleaseState } from '../../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const finished = step => ['COMPLETE', 'RECOVERED'].includes(step.state);
const sleep = ms => new Promise(done => setTimeout(done, ms));
export function nativeCallRecord(call) {
  return Object.fromEntries(['id', 'tool', 'state', 'argumentsSha256', 'requestSha256',
    'resultSha256', 'error'].map(key => [key, call[key] ?? null]));
}
export function verifyRetainedNativeCall(expected, actual) {
  for (const key of ['id', 'tool', 'argumentsSha256', 'resultSha256'])
    assert.equal(actual[key], expected[key], 'Retain the original native ' + key);
  if (expected.requestSha256) assert.equal(actual.requestSha256, expected.requestSha256);
  assert.equal(actual.state, expected.state ?? 'COMPLETE');
  if (actual.state === 'COMPLETE') {
    assert.equal(sha(actual.resultJson), actual.resultSha256);
    assert.equal(actual.error, null);
  } else {
    assert.equal(actual.state, 'FAILED');
    assert.equal(actual.resultJson, null); assert.equal(actual.resultSha256, null);
    assert.deepEqual(actual.error, expected.error);
  }
}
export async function readCompletedWorkflowCalls(run, api) {
  const original = [], effective = [], recoveries = [];
  for (const step of run.steps) {
    assert.ok(finished(step), 'Complete or recover each original workflow step');
    const call = await api('call/' + step.callId);
    original.push(call);
    let selected = call;
    if (step.state === 'RECOVERED') {
      assert.ok(step.resolvedCallId && step.resolvedCallId !== call.id);
      selected = await api('call/' + step.resolvedCallId);
      const { draft } = await api('draft/' + selected.draftId + '?revision=' + selected.draftRevision);
      assert.equal(draft.recoveryOf, call.id); assert.equal(selected.profileId, call.profileId);
      recoveries.push(selected);
    }
    assert.equal(selected.state, 'COMPLETE'); assert.equal(sha(selected.resultJson), selected.resultSha256);
    assert.notEqual(JSON.parse(selected.resultJson)?.isError, true);
    effective.push(selected);
  }
  return { original, effective, recoveries };
}
export async function recoverCommittedActivation({ api, report, save, releaseStore }) {
  const selectedRun = (await api('workflow-run/' + report.requests.start.id)).run;
  const priorPlan = report.activationRecovery;
  if (priorPlan) {
    assert.equal(priorPlan.runId, selectedRun.id);
    const resolved = selectedRun.steps.find(step => step.id === priorPlan.stepId);
    if (resolved?.state === 'RECOVERED') {
      assert.equal(resolved.callId, priorPlan.originalCallId);
      assert.equal(resolved.resolvedCallId, priorPlan.call.id);
      return priorPlan;
    }
  }
  if (selectedRun.state !== 'WAITING') return null;
  assert.equal(selectedRun.active, false, 'Wait for the original native dispatcher');
  const step = selectedRun.steps.find(value => !finished(value));
  assert.ok(step?.callId, 'Open the original saved native call');
  const original = await api('call/' + step.callId);
  assert.equal(original.tool, 'merchant_activate', JSON.stringify(original.error));
  assert.equal(original.state, 'FAILED', JSON.stringify(original.error));
  assert.equal(original.error?.code, 'ERR_MODULE_NOT_FOUND', JSON.stringify(original.error));
  const argumentsValue = JSON.parse(original.argumentsJson);
  const state = await readReleaseState(releaseStore);
  const release = await inspectRelease(releaseStore, argumentsValue.id);
  assert.equal(state.active, argumentsValue.id, 'Recover the already selected original release');
  assert.equal(state.generation, argumentsValue.expectedGeneration + 1);
  assert.equal(release.digest, argumentsValue.expectedDigest);
  const transition = state.history.at(-1);
  assert.equal(transition.operation, 'activate'); assert.equal(transition.to, argumentsValue.id);
  assert.equal(transition.generation, state.generation); assert.equal(transition.reason, argumentsValue.reason);
  assert.ok(Date.parse(transition.at) >= Date.parse(original.startedAt));
  assert.ok(Date.parse(transition.at) <= Date.parse(original.completedAt));
  if (!priorPlan) {
    const identity = sha(original.id).slice(0,36), host = await api('host');
    report.activationRecovery = {
      runId: selectedRun.id, stepId: step.id, originalCallId: original.id,
      original: nativeCallRecord(original), selectedState: state,
      draft: { id: 'native-activation-recovery-' + identity, profileId: original.profileId,
        name: 'Recover the selected release status', tool: original.tool, recoveryOf: original.id,
        arguments: { ...argumentsValue, expectedGeneration: state.generation } },
      call: { id: 'native-activation-return-' + identity, profileId: original.profileId,
        draftId: 'native-activation-recovery-' + identity, draftRevision: 1,
        expectedHostFingerprint: host.configurationFingerprint },
      note: 'The original activation selected this exact release and generation before its delivery status module was missing. The complete original delivery source is restored; this linked native call confirmed the unchanged selection and returned its status.'
    };
    await save();
  }
  const plan = report.activationRecovery;
  assert.equal(plan.originalCallId, original.id); verifyRetainedNativeCall(plan.original, original);
  assert.deepEqual(plan.selectedState, state, 'Continue the reviewed original release generation');
  let draft;
  try { draft = (await api('draft/' + plan.draft.id + '?revision=1')).draft; }
  catch (error) { if (error.status !== 404) throw error; }
  if (!draft) draft = (await api('drafts', { method: 'POST', body: plan.draft })).draft;
  assert.equal(draft.revision, 1); assert.equal(draft.recoveryOf, original.id);
  assert.equal(draft.profileId, original.profileId); assert.equal(draft.tool, original.tool);
  assert.deepEqual(JSON.parse(draft.argumentsJson), plan.draft.arguments);
  await api('calls', { method: 'POST', body: plan.call, expected: 202 });
  let returned;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const call = await api('call/' + plan.call.id);
    if (call.state !== 'RUNNING') { returned = call; break; }
    await sleep(80);
  }
  assert.ok(returned, 'The linked original activation call is still active');
  assert.equal(returned.state, 'COMPLETE', JSON.stringify(returned.error));
  assert.equal(sha(returned.resultJson), returned.resultSha256);
  const result = JSON.parse(returned.resultJson);
  assert.equal(result.changed, false, 'Recovery must keep the original release selection');
  assert.deepEqual(result.state, plan.selectedState);
  assert.equal(result.status.state.active, argumentsValue.id);
  assert.equal(result.status.state.generation, state.generation);
  verifyRetainedNativeCall(plan.original, await api('call/' + original.id));
  const current = (await api('workflow-run/' + selectedRun.id)).run;
  const selectedStep = current.steps.find(value => value.id === step.id);
  if (selectedStep.state !== 'RECOVERED') {
    if (!plan.resolve) {
      plan.resolve = { id: current.id, expectedRevision: current.revision, stepId: step.id,
        callId: returned.id, note: plan.note };
      await save();
    }
    await api('workflow-resolve', { method: 'POST', body: plan.resolve });
  } else assert.equal(selectedStep.resolvedCallId, returned.id);
  plan.recovered = nativeCallRecord(returned); plan.completedAt ??= new Date().toISOString();
  await save();
  return plan;
}
