// MIT. Saved fleet rollouts through an already initialized merchant MCP connection.
import { createHash } from 'node:crypto';

export const FLEET_CAMPAIGN_TOOL_PREFIX = 'merchant_fleet_campaign_';
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const EXPORT_SCHEMA = 'stellar-forge.fleet-campaign-export.v1';
const PLAN_SCHEMA = 'stellar-forge.fleet-campaign.v1';
const CONTROL_SCHEMA = 'stellar-forge.fleet-campaign-control.v1';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_EXPORT_BYTES = 32 * 1024 * 1024;
const copy = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => Object.assign(new Error(message), { code: 'FLEET_CAMPAIGN_CLIENT_' + code });
function need(condition, message, code = 'ARGUMENTS') { if (!condition) throw fail(code, message); }
const positive = value => Number.isSafeInteger(value) && value > 0;
const matches = (expression, value) => typeof value === 'string' && expression.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Refuse values that JSON transport would silently omit or replace. */
function json(value, maximum, code = 'ARGUMENTS') {
  const visiting = new Set();
  function walk(item, depth) {
    need(depth <= 128, 'The selected JSON document is too deeply nested.', code);
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { need(Number.isFinite(item), 'Use finite JSON numbers.', code); return; }
    need(typeof item === 'object', 'Use JSON data without undefined, functions or binary objects.', code);
    need(!visiting.has(item), 'Use JSON data without circular references.', code);
    visiting.add(item);
    need(Object.getOwnPropertySymbols(item).length === 0, 'Use JSON string property names.', code);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Array.isArray(item)) {
      need(Object.keys(descriptors).length === item.length + 1, 'Use dense JSON arrays without extra properties.', code);
      for (let index = 0; index < item.length; index++) {
        const property = descriptors[index];
        need(property && Object.hasOwn(property, 'value') && property.enumerable,
          'Use JSON arrays without holes or property accessors.', code);
        walk(property.value, depth + 1);
      }
    } else {
      need(Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null,
        'Use plain JSON objects.', code);
      for (const property of Object.values(descriptors)) {
        need(Object.hasOwn(property, 'value') && property.enumerable,
          'Use JSON objects without hidden properties or property accessors.', code);
        walk(property.value, depth + 1);
      }
    }
    visiting.delete(item);
  }
  walk(value, 0);
  need(Buffer.byteLength(JSON.stringify(value)) <= maximum, 'The selected JSON document exceeds its byte limit.', code);
  return value;
}

/** Same canonical request hash used by the original campaign journal. */
export function fleetCampaignRequestSha256(input) {
  need(object(input), 'Supply the complete original request object.');
  return hash(json(input, MAX_REQUEST_BYTES));
}

/**
 * Check the original canonical document checksum and its plan/control binding.
 * This is an integrity check, not a signature or permission to apply the plan.
 * The MCP managerId is transport metadata and is outside the native checksum.
 */
export function verifyFleetCampaignExport(document) {
  need(object(document), 'Supply an original campaign export.', 'EXPORT');
  json(document, MAX_EXPORT_BYTES, 'EXPORT');
  const { schema, planDigest, plan, control, sha256 } = document;
  need(schema === EXPORT_SCHEMA && SHA.test(planDigest ?? '') && SHA.test(sha256 ?? '') &&
    object(plan) && plan.schema === PLAN_SCHEMA && matches(ID, plan.id) && positive(plan.revision) &&
    plan.planDigest === planDigest && Array.isArray(plan.waves) && Array.isArray(plan.requests) &&
    Array.isArray(plan.history) && object(control) && control.schema === CONTROL_SCHEMA &&
    control.id === plan.id && control.planDigest === planDigest && positive(control.revision) &&
    typeof control.paused === 'boolean' && Array.isArray(control.requests),
    'The original exported plan and pause control do not have one complete identity.', 'EXPORT');
  need(hash({ schema, planDigest, plan, control }) === sha256,
    'The exported campaign differs from its original canonical SHA-256.', 'EXPORT');
  return copy(document);
}

const FIELDS = Object.freeze({
  list: [], inspect: ['id'], export: ['id'],
  save: ['id', 'title', 'waves', 'requestId', 'expectedRevision'],
  review: ['id', 'expectedRevision'],
  advance: ['id', 'expectedRevision', 'requestId', 'reviewId'],
  pause: ['id', 'expectedControlRevision', 'requestId', 'paused', 'reason'],
  rollback_review: ['id', 'expectedRevision', 'targetRevision'],
  rollback: ['id', 'expectedRevision', 'requestId', 'reviewId'],
  retire: ['id', 'expectedRevision', 'requestId', 'tenant', 'slot', 'instanceId', 'expectedNativeRevision'],
});
const MUTATIONS = new Set(['save', 'advance', 'pause', 'rollback', 'retire']);
const REQUEST_KINDS = Object.freeze({ save: 'save', advance: 'wave', pause: 'pause', rollback: 'rollback', retire: 'retire' });
function argumentsFor(action, input) {
  need(Object.hasOwn(FIELDS, action) && object(input), 'Supply the selected operation and a JSON object.');
  json(input, MAX_REQUEST_BYTES);
  need(Object.keys(input).every(key => FIELDS[action].includes(key)), 'Use only this original tool’s declared fields.');
  if (action !== 'list') need(matches(ID, input.id), 'Supply the exact saved campaign ID.');
  if (MUTATIONS.has(action)) need(matches(REQUEST, input.requestId), 'Supply and retain the original requestId.');
  if (['review', 'advance', 'rollback_review', 'rollback', 'retire'].includes(action))
    need(positive(input.expectedRevision), 'Supply the observed campaign revision.');
  if (action === 'save' && input.expectedRevision !== undefined && input.expectedRevision !== null)
    need(positive(input.expectedRevision), 'Use the current revision to edit an unstarted campaign.');
  if (action === 'pause') need(positive(input.expectedControlRevision) && typeof input.paused === 'boolean',
    'Supply the observed control revision and explicit paused boolean.');
  return copy(input);
}

/**
 * call(name, args, options) is the existing connection's structured-result call.
 * Calls are independent: pause can reach the original provider while advance waits.
 * This client never generates request IDs, applies a review automatically, creates
 * a provider, or closes the caller's fleet/connection.
 */
export function createFleetCampaignClient({ call, expectedPlanDigest, expectedManagerId } = {}) {
  need(typeof call === 'function', 'Supply the already initialized structured MCP call.');
  if (expectedPlanDigest !== undefined) need(SHA.test(expectedPlanDigest), 'Use the original merchant_fleet_plan digest.');
  if (expectedManagerId !== undefined) need(typeof expectedManagerId === 'string' && expectedManagerId.length > 0,
    'Use the original running managerId.');
  const pending = new Set();
  let closed = false, closePromise;
  function tracked(work) {
    need(!closed, 'This campaign caller is draining or closed.', 'CLOSED');
    const promise = Promise.resolve().then(work);
    pending.add(promise);
    void promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  }
  function resultObject(value) {
    need(object(value), 'The original merchant call returned no structured result.', 'REPLY');
    return value;
  }
  function digestBinding(value) {
    if (expectedPlanDigest !== undefined && value !== undefined && value !== null)
      need(value === expectedPlanDigest, 'The original fleet plan differs from the selected plan digest.', 'SCOPE_CHANGED');
  }
  function managerBinding(value, required = true) {
    if (required) need(typeof value === 'string' && value.length > 0,
      'The original campaign reply has no running manager identity.', 'REPLY');
    if (expectedManagerId !== undefined)
      need(value === expectedManagerId, 'The original fleet manager changed. Reopen the current owner explicitly.', 'SCOPE_CHANGED');
  }
  async function statusRead(options, requireRunning = false) {
    const value = resultObject(await call('merchant_fleet_status', {}, options));
    need(value.schema === 'stellar-forge.merchant-fleet-mcp.v1' && typeof value.running === 'boolean',
      'The original fleet status is incomplete.', 'REPLY');
    digestBinding(value.planDigest);
    if (expectedManagerId !== undefined || requireRunning) managerBinding(value.managerId, requireRunning);
    if (requireRunning) need(value.running === true && SHA.test(value.planDigest ?? ''),
      'Start or recover the original configured fleet before using campaigns.', 'SCOPE_CHANGED');
    return value;
  }
  function summary(value, selectedId) {
    need(matches(ID, value.id) && (selectedId === undefined || value.id === selectedId) &&
      SHA.test(value.planDigest ?? '') && positive(value.revision) && positive(value.controlRevision) &&
      ['READY', 'PENDING', 'COMPLETE', 'ROLLED_BACK'].includes(value.state) &&
      Number.isSafeInteger(value.nextWave) && Number.isSafeInteger(value.totalWaves) &&
      value.nextWave >= 0 && value.nextWave <= value.totalWaves && typeof value.paused === 'boolean' &&
      object(value.native), 'The original campaign summary is incomplete or belongs to another plan.', 'REPLY');
    digestBinding(value.planDigest);
    return value;
  }
  function checked(action, value, args) {
    resultObject(value); managerBinding(value.managerId); digestBinding(value.planDigest);
    if (action === 'list') {
      need(value.schema === 'stellar-forge.fleet-campaign-list.v1' && SHA.test(value.planDigest ?? '') &&
        Array.isArray(value.campaigns), 'The original campaign list is incomplete.', 'REPLY');
      for (const row of value.campaigns) summary(row);
    } else if (action === 'export') {
      verifyFleetCampaignExport(value);
      need(value.plan.id === args.id, 'The original export belongs to another campaign.', 'REPLY');
    } else if (action === 'pause') {
      need(value.id === args.id && value.paused === args.paused &&
        value.controlRevision === args.expectedControlRevision + 1 && typeof value.reason === 'string',
        'The pause result differs from its exact retained request.', 'REQUEST_BINDING');
    } else if (action === 'review' || action === 'rollback_review') {
      need(value.id === args.id && value.revision === args.expectedRevision &&
        value.kind === (action === 'review' ? 'wave' : 'rollback') &&
        typeof value.reviewId === 'string' && value.reviewId.length > 0 &&
        typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt)) &&
        object(value.before) && Array.isArray(value.after) && Array.isArray(value.comparisons),
        'The original approval review is incomplete or belongs to another revision.', 'REPLY');
      if (action === 'rollback_review')
        need(positive(value.targetRevision) && ['NATIVE_HISTORY', 'RETAINED_RELEASES'].includes(value.restoreMode) &&
          (args.targetRevision === undefined || args.targetRevision === value.targetRevision),
          'The rollback review does not identify its actual restoration path.', 'REPLY');
    } else {
      summary(value, args.id);
      if (action === 'inspect') {
        need(object(value.plan) && value.plan.schema === PLAN_SCHEMA && value.plan.id === args.id &&
          value.plan.planDigest === value.planDigest && value.plan.revision === value.revision &&
          Array.isArray(value.plan.requests) && object(value.control) && value.control.schema === CONTROL_SCHEMA &&
          value.control.id === args.id && value.control.planDigest === value.planDigest &&
          value.control.revision === value.controlRevision && Array.isArray(value.control.requests) &&
          Array.isArray(value.retirements) && Array.isArray(value.rollbackTargets) &&
          (value.pendingRequest === null || object(value.pendingRequest)),
          'The original inspection is missing its retained request or control records.', 'REPLY');
      } else need(value.requestId === args.requestId,
        'The committed campaign result belongs to another request.', 'REQUEST_BINDING');
    }
    return value;
  }
  async function dispatch(action, args, options) {
    // Optional caller bindings are checked against the original owner before
    // dispatch, then against its returned identity. The provider retains the
    // actual operation lock; this read does not create another lease.
    if (expectedPlanDigest !== undefined || expectedManagerId !== undefined)
      await statusRead(options, true);
    return checked(action, await call(FLEET_CAMPAIGN_TOOL_PREFIX + action, args, options), args);
  }
  function invoke(action, input = {}, options) {
    const args = argumentsFor(action, input), callOptions = options === undefined ? undefined : { ...options };
    return tracked(() => dispatch(action, args, callOptions));
  }
  async function reconciliation(action, input, options) {
    need(Object.hasOwn(REQUEST_KINDS, action), 'Reconcile save, advance, pause, rollback or retire.');
    const original = argumentsFor(action, input), requestSha256 = fleetCampaignRequestSha256(original);
    // An uncertain first save may precede the plan's creation. The original
    // complete list supplies an observed absence without catching unrelated errors.
    if (action === 'save') {
      const listing = await dispatch('list', {}, options);
      if (!listing.campaigns.some(row => row.id === original.id))
        return { status: 'NOT_FOUND', id: original.id, action, requestId: original.requestId, requestSha256,
          managerId: listing.managerId, planDigest: listing.planDigest, request: original };
    }
    const observed = await dispatch('inspect', { id: original.id }, options);
    const rows = action === 'pause' ? observed.control.requests : observed.plan.requests;
    const matches = rows.filter(row => row.id === original.requestId);
    need(matches.length <= 1, 'The original journal contains duplicate request identities.', 'REPLY');
    const row = matches[0];
    const common = { id: original.id, action, requestId: original.requestId, requestSha256,
      managerId: observed.managerId, planDigest: observed.planDigest, request: original,
      observed: { revision: observed.revision, controlRevision: observed.controlRevision,
        native: observed.observed, relationship: observed.relationship, paused: observed.paused } };
    if (!row) return { ...common, status: 'NOT_FOUND' };
    need(row.requestSha256 === requestSha256 &&
      (action === 'pause' || row.kind === REQUEST_KINDS[action] &&
        fleetCampaignRequestSha256(row.request) === requestSha256),
      'That requestId belongs to different original input. Keep both inputs and inspect the original journal.',
      'REQUEST_ID_REUSED');
    const committed = action === 'pause' || row.phase === 'COMPLETE';
    need(committed || row.phase === 'PENDING', 'The original request phase is unrecognized.', 'REPLY');
    if (committed) {
      need(object(row.result) && row.result.id === original.id,
        'The original committed request has no complete result.', 'REPLY');
      if (action !== 'pause') need(row.result.requestId === original.requestId,
        'The original committed result differs from its request ID.', 'REQUEST_BINDING');
    }
    return { ...common, status: committed ? 'COMMITTED' : 'PENDING', operation: copy(row),
      ...(committed ? { result: copy(row.result) } : {}),
      ...(action === 'pause' ? {} : { pendingRequest: copy(observed.pendingRequest) }) };
  }
  const client = {
    expectedPlanDigest, expectedManagerId,
    plan(options) {
      return tracked(async () => {
        const value = resultObject(await call('merchant_fleet_plan', {}, options));
        need(SHA.test(value.digest ?? '') && Array.isArray(value.tenants),
          'The original configured fleet plan is incomplete.', 'REPLY');
        digestBinding(value.digest); return value;
      });
    },
    status: options => tracked(() => statusRead(options)),
    list: options => invoke('list', {}, options),
    inspect: (input, options) => invoke('inspect', input, options),
    save: (input, options) => invoke('save', input, options),
    review: (input, options) => invoke('review', input, options),
    advance: (input, options) => invoke('advance', input, options),
    pause: (input, options) => invoke('pause', input, options),
    rollbackReview: (input, options) => invoke('rollback_review', input, options),
    rollback: (input, options) => invoke('rollback', input, options),
    retire: (input, options) => invoke('retire', input, options),
    export: (input, options) => invoke('export', input, options),
    reconcile(action, input, options) {
      need(Object.hasOwn(REQUEST_KINDS, action), 'Reconcile save, advance, pause, rollback or retire.');
      const args = argumentsFor(action, input), callOptions = options === undefined ? undefined : { ...options };
      return tracked(() => reconciliation(action, args, callOptions));
    },
    disconnect() {
      if (!closePromise) {
        closed = true;
        closePromise = Promise.allSettled([...pending]).then(() => ({ disconnected: true }));
      }
      return closePromise;
    },
  };
  return Object.freeze(client);
}
