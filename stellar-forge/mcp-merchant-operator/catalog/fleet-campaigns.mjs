// MIT. Saved fleet rollout tools over the original retained release operator.
const id = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' };
const requestId = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$' };
const revision = { type: 'integer', minimum: 1 };
const reviewId = { type: 'string', minLength: 1, maxLength: 128 };
const tenant = { type: 'string', pattern: '^[a-z][a-z0-9-]{1,39}$' };
const slot = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$' };
const releaseId = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const approved = { id, expectedRevision: revision, requestId, reviewId };
const target = { type: 'object', additionalProperties: false,
  properties: { tenant, slot, releaseId }, required: ['tenant', 'slot', 'releaseId'] };
const wave = { type: 'object', additionalProperties: false, properties: {
  id, label: { type: 'string', minLength: 1, maxLength: 120 },
  targets: { type: 'array', minItems: 1, maxItems: 256, items: target },
}, required: ['id', 'targets'] };

export function fleetCampaignTools(tool) {
  return [
    tool('merchant_fleet_campaign_list',
      'List saved ordered rollout plans in this original fleet workspace. Returns their exact plan revision, native identity, next wave and independent pause control revision. Requires the same MCP-owned fleet to be running.',
      {}, [], { readOnly: true, idempotent: true }),
    tool('merchant_fleet_campaign_inspect',
      'Read one saved rollout, its complete original requests and history, current native relationship, approved pending request, rollback targets and exact old instances eligible for retirement. This read never advances a wave or rewrites its saved decision.',
      { id }, ['id'], { readOnly: true, idempotent: true }),
    tool('merchant_fleet_campaign_save',
      'Save or revise an unstarted ordered rollout against the original retained fleet and exact release catalog. Supply every wave and selected tenant/slot/release ID. Keep the complete requestId and body for retry; an existing saved rollout also requires its current expectedRevision. This saves a plan without launching or activating its targets.',
      { id, title: { type: 'string', minLength: 1, maxLength: 160 },
        waves: { type: 'array', minItems: 1, maxItems: 32, items: wave },
        requestId, expectedRevision: { anyOf: [revision, { type: 'null' }] } },
      ['id', 'title', 'waves', 'requestId'], { idempotent: true }),
    tool('merchant_fleet_campaign_review',
      'Review the next exact saved wave at the observed plan revision. Inspect its full before/after mapping, source and payment comparisons, native identity and expiration before approving. The short-lived review belongs to this original manager; another review is needed only before a request has been accepted.',
      { id, expectedRevision: revision }, ['id', 'expectedRevision']),
    tool('merchant_fleet_campaign_advance',
      'Apply one explicitly reviewed saved wave through the original native prepare/activation path. Supply the exact reviewId, plan revision and retained requestId. After an interrupted or lost response, repeat this identical body so the original journal reconciles or continues that approved request. A paused request may return CONTINUE_APPROVED_REQUEST; unpausing alone does not advance it.',
      approved, ['id', 'expectedRevision', 'requestId', 'reviewId'], { idempotent: true, openWorld: true }),
    tool('merchant_fleet_campaign_pause',
      'Set this saved rollout pause control with its separate expectedControlRevision and exact requestId. This control remains available while its original wave is running. It pauses at native continuation boundaries, preserving already accepted work; setting paused:false permits an explicit replay of the same approved request.',
      { id, requestId, expectedControlRevision: revision, paused: { type: 'boolean' },
        reason: { type: 'string', maxLength: 500 } },
      ['id', 'requestId', 'expectedControlRevision', 'paused'], { idempotent: true }),
    tool('merchant_fleet_campaign_rollback_review',
      'Review a retained rollback target for this saved rollout at its current plan revision. Read rollbackTargets and their slot-use blockers first. The review compares the whole current native mapping, including intervening changes; restoreMode identifies native history or retained-release restoration. The default target is the saved baseline.',
      { id, expectedRevision: revision, targetRevision: revision }, ['id', 'expectedRevision']),
    tool('merchant_fleet_campaign_rollback',
      'Apply the exact saved rollback review through the original native manager. Retain and replay this same requestId, expectedRevision and reviewId after an interrupted response. Original source identities, current mapping and draining sessions remain guarded; restoration is recorded as a new native revision.',
      approved, ['id', 'expectedRevision', 'requestId', 'reviewId'], { idempotent: true, openWorld: true }),
    tool('merchant_fleet_campaign_retire',
      'Retire one exact old child instance from this saved rollout only after campaign inspection reports canRetire. Use that tenant, slot, instanceId, current plan revision and observed native revision. The original routing guard spans the close; exact request replay reconciles an already retired instance.',
      { id, expectedRevision: revision, requestId, tenant, slot, instanceId: reviewId,
        expectedNativeRevision: revision },
      ['id', 'expectedRevision', 'requestId', 'tenant', 'slot', 'instanceId', 'expectedNativeRevision'],
      { destructive: true, idempotent: true }),
    tool('merchant_fleet_campaign_export',
      'Return the complete original saved rollout plan, request/history records and separate pause control with their canonical document SHA-256. This portable decision record retains full release identities and native outcomes. Reopen the original fleet directory to continue operations.',
      { id }, ['id'], { readOnly: true, idempotent: true }),
  ];
}
