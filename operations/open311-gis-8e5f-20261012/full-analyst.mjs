// MIT. Complete source-bound analyst and independent supervisor selection.
const check = (ok, message) => { if (!ok) throw new Error(message); };
const canonical = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (a, b, message) => check(canonical(a) === canonical(b), message);
const string = (value, label, maximum = 500) => {
  check(typeof value === 'string' && value.trim() && !value.includes('\0') && value.length <= maximum, label);
  return value;
};

export function validateAnalystPlan(plan) {
  check(plan?.schema === 'commons.open311.operator-plan.v1' &&
    plan.operationId === 'boston-geographic-8e5f-20261012-01' &&
    plan.expectedCaseCount === 104 && Array.isArray(plan.recommendations) &&
    plan.recommendations.length === 104, 'Select the complete original Boston 104-case analyst plan.');
  string(plan.id, 'Retain the original analyst plan identity.');
  const rows = new Map(), totals = { dispatch: 0, review: 0, dismiss: 0, defer: 0 };
  for (const row of plan.recommendations) {
    const id = string(row.serviceRequestId, 'Each recommendation needs its original request ID.');
    check(!rows.has(id) && row.originalItem?.service_request_id === id,
      'Keep each original source request exactly once.');
    check(row.edits && Object.keys(row.edits).sort().join(',') === 'action,assignedTeam,note,priority',
      'Only the four original analyst fields may be edited.');
    for (const key of ['assignedTeam', 'priority', 'action', 'note'])
      string(row.edits[key], 'Invalid analyst ' + key + ' for ' + id, key === 'note' ? 20000 : 500);
    check(Object.hasOwn(totals, row.edits.action), 'Unsupported original analyst action.');
    totals[row.edits.action]++;
    rows.set(id, row);
  }
  same(totals, { dispatch: 48, review: 16, dismiss: 40, defer: 0 },
    'Retain the reviewed full Boston routing plan.');
  return { rows, totals };
}

export function selectFullAnalyst(plan, sourceRows) {
  const { rows, totals } = validateAnalystPlan(plan);
  check(sourceRows.length === rows.size, 'The original handoff must contain the full analyst cohort.');
  const seen = new Set();
  const cases = sourceRows.map(source => {
    const recommendation = rows.get(source.serviceRequestId);
    check(recommendation && !seen.has(source.serviceRequestId), 'The handoff changed the original case cohort.');
    seen.add(source.serviceRequestId);
    same(source.source, recommendation.originalItem,
      'The handoff source differs from the reviewed original request: ' + source.serviceRequestId);
    const prior = source.operator?.note ?? '';
    const note = prior.includes(recommendation.edits.note) ? prior :
      (prior ? prior + '\n\n' : '') + recommendation.edits.note;
    check(note.length <= 20000, 'The combined original analyst note exceeds its field limit.');
    return { key: source.key, serviceRequestId: source.serviceRequestId,
      ...recommendation.edits, note };
  });
  return { cases, totals };
}

export function supervisorHandoff({ runId, inputSha256, plan, returned, workspace, handoffId, sourceRows }) {
  const { rows, totals } = validateAnalystPlan(plan);
  const byKey = new Map(sourceRows.map(row => [row.key, row]));
  check(returned.summary.counts.changes === 104 && returned.changes.length === 104 &&
    returned.summary.counts.conflicts === 0 && returned.summary.counts.missing === 0 &&
    returned.summary.counts.unchanged === 0, 'The full analyst return must contain all 104 source-bound proposals.');
  const ids = new Set();
  const proposals = returned.changes.map(change => {
    const source = byKey.get(change.key), recommendation = source && rows.get(source.serviceRequestId);
    check(recommendation && !ids.has(change.id), 'Every returned proposal needs one original case.');
    ids.add(change.id);
    return { proposalId: change.id, featureKey: change.key, serviceRequestId: source.serviceRequestId,
      originalItem: recommendation.originalItem, recommendation: recommendation.edits,
      nativeProposal: change };
  });
  return { schema: 'commons.open311.full-analyst-supervisor-handoff.v1',
    operationId: plan.operationId, runId, inputSha256, planId: plan.id,
    workspace: { workspaceId: workspace.workspaceId, revision: workspace.revision },
    handoffId, returnId: returned.summary.id, returnSha256: returned.summary.sha256,
    analyst: plan.authoredBy, totals, proposals };
}

export function validateSupervisorSelection(selection, handoff, handoffSha256) {
  check(selection?.schema === 'commons.open311.full-analyst-supervisor-selection.v1',
    'Use the independent supervisor selection for this original return.');
  same({ operationId: selection.operationId, runId: selection.runId, handoffId: selection.handoffId,
    returnId: selection.returnId, returnSha256: selection.returnSha256,
    handoffSha256: selection.handoffSha256, workspaceId: selection.workspaceId,
    expectedRevision: selection.expectedRevision },
    { operationId: handoff.operationId, runId: handoff.runId, handoffId: handoff.handoffId,
      returnId: handoff.returnId, returnSha256: handoff.returnSha256, handoffSha256,
      workspaceId: handoff.workspace.workspaceId, expectedRevision: handoff.workspace.revision },
    'The supervisor selected a different original workspace or analyst return.');
  string(selection.reviewer, 'Name the actual independent supervisor.', 200);
  string(selection.note, 'Retain the supervisor decision note.', 20000);
  check(Array.isArray(selection.decisions) && selection.decisions.length === handoff.proposals.length,
    'Review every original proposal in the complete return.');
  const original = new Map(handoff.proposals.map(row => [row.proposalId, row])), seen = new Set();
  const accepted = [], rejected = [], dispatchKeys = [];
  for (const decision of selection.decisions) {
    const proposal = original.get(decision.proposalId);
    check(proposal && !seen.has(decision.proposalId) && ['accept', 'reject'].includes(decision.choice),
      'Select each actual proposal exactly once with accept or reject.');
    seen.add(decision.proposalId);
    (decision.choice === 'accept' ? accepted : rejected).push(decision.proposalId);
    if (decision.choice === 'accept' && proposal.recommendation.action === 'dispatch')
      dispatchKeys.push(proposal.featureKey);
  }
  check(dispatchKeys.length === 48, 'Complete this original programme with the reviewed 48 individual dispatch cases.');
  return { accepted, rejected, dispatchKeys };
}
