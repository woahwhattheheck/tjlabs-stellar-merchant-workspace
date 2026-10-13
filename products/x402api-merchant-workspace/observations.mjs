// MIT License. Read the original merchant's committed operational state.
import { createHash } from 'node:crypto';

export const MERCHANT_OBSERVATIONS_SCHEMA = 'merchant-workspace.observations.v1';
export const MERCHANT_OBSERVATION_LIMIT = 1024;
const STATES = ['CREATED', 'CHARGE_UNCERTAIN', 'CHARGE_REJECTED', 'AWAITING_PAYMENT',
  'PAYMENT_PENDING', 'PAYMENT_UNCERTAIN', 'PAYMENT_FAILED', 'SETTLEMENT_CONFIRMED',
  'FULFILLMENT_PENDING', 'FULFILLMENT_INTERRUPTED', 'COMPLETE'];
const TERMINAL = ['COMPLETE', 'PAYMENT_FAILED', 'CHARGE_REJECTED'];
const PAYMENT = ['PAYMENT_PENDING', 'PAYMENT_UNCERTAIN'];
const CHARGE = ['CHARGE_UNCERTAIN'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const marks = values => values.map(() => '?').join(',');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function need(value, code) {
  if (!value) throw Object.assign(new Error(code), { code, status: 409 });
}
function count(value) {
  const result = typeof value === 'bigint' ? Number(value) : value;
  need(Number.isSafeInteger(result) && result >= 0, 'MERCHANT_OBSERVATION_INTEGER_RANGE');
  return result;
}
function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
}
function anchor(row, generatedAt) {
  if (!row) return { firstRelevantAt: null, historySequence: null };
  const time = timestamp(row.created_at);
  return { firstRelevantAt: time && time <= generatedAt ? time : null,
    historySequence: count(row.sequence) };
}
// Look for the first state transition after the last departure from the whole
// condition family. Same-family retries and status refreshes retain its age.
function episode(store, orderId, states, generatedAt) {
  const row = store._get(
    "SELECT sequence,created_at FROM merchant_history WHERE order_id=? " +
    "AND json_extract(data_json,'$.set.state') IN (" + marks(states) + ") " +
    "AND sequence>COALESCE((SELECT MAX(sequence) FROM merchant_history WHERE order_id=? " +
    "AND json_type(data_json,'$.set.state')='text' " +
    "AND json_extract(data_json,'$.set.state') NOT IN (" + marks(states) + ")),0) " +
    "ORDER BY sequence LIMIT 1", orderId, ...states, orderId, ...states);
  return anchor(row, generatedAt);
}
function settlement(store, orderId, generatedAt) {
  // FULFILLMENT_PENDING also follows HTTP409 and rejected-event recovery.
  // A terminal 200 also needs its complete body and original validated payment
  // identity. Headers alone or an incomplete return remain unconfirmed.
  const row = store._get(
    "SELECT sequence,created_at,kind FROM merchant_history WHERE order_id=? AND (" +
    "(kind='terminal_payment_response_retained' " +
    "AND json_extract(data_json,'$.set.terminalPaymentResponse.status')=200 " +
    "AND json_extract(data_json,'$.set.terminalPaymentResponse.responseComplete')=1 " +
    "AND json_type(data_json,'$.set.paymentId')='text') OR " +
    "kind IN ('finalized_event_received','receipt_verified','FULFILLMENT_CLAIMED')) " +
    "ORDER BY sequence LIMIT 1", orderId);
  const basis = row ? ({
    terminal_payment_response_retained: 'payment-response-200',
    finalized_event_received: 'bound-finalized-webhook',
    receipt_verified: 'verified-receipt',
    FULFILLMENT_CLAIMED: 'verified-fulfillment-claim',
  })[row.kind] : null;
  return { observed: Boolean(row), ...anchor(row, generatedAt), basis };
}
function selectedBinding(store, value) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'MERCHANT_OBSERVATION_BINDING_REQUIRED');
  for (const name of ['tenantId', 'resourceVersionId'])
    need(typeof value[name] === 'string' && /^[0-9a-f-]{36}$/i.test(value[name]), 'MERCHANT_OBSERVATION_BINDING_INVALID');
  for (const name of ['configSha256', 'inputsSha256'])
    need(value[name] === null || typeof value[name] === 'string' && /^[0-9a-f]{64}$/.test(value[name]),
      'MERCHANT_OBSERVATION_BINDING_INVALID');
  need(['reviewed-file-inputs', 'configuration-file', 'programmatic-config'].includes(value.kind),
    'MERCHANT_OBSERVATION_BINDING_INVALID');
  need(value.kind !== 'reviewed-file-inputs' || value.configSha256 && value.inputsSha256,
    'MERCHANT_OBSERVATION_BINDING_INVALID');
  const selection = { storeId: store.storeId, tenantId: value.tenantId,
    resourceVersionId: value.resourceVersionId, configSha256: value.configSha256,
    inputsSha256: value.inputsSha256, kind: value.kind };
  return { ...selection, bindingSha256: hash(selection) };
}

/** One synchronous deferred read transaction; no provider or handler is called. */
export function merchantObservationSnapshot(store, { generatedAt, binding, limit = MERCHANT_OBSERVATION_LIMIT }) {
  need(timestamp(generatedAt), 'MERCHANT_OBSERVATION_TIME_INVALID');
  need(Number.isSafeInteger(limit) && limit >= 1 && limit <= MERCHANT_OBSERVATION_LIMIT,
    'MERCHANT_OBSERVATION_LIMIT_INVALID');
  const source = selectedBinding(store, binding);
  store._assertOpen();
  need(!store._db.isTransaction, 'MERCHANT_NESTED_TRANSACTION');
  store._db.exec('BEGIN');
  try {
    const sequence = count(store._get('SELECT COALESCE(MAX(sequence),0) AS value FROM merchant_history').value);
    const totals = store._get('SELECT COUNT(*) AS total, ' +
      'COALESCE(SUM(CASE WHEN state NOT IN (' + marks(TERMINAL) + ') THEN 1 ELSE 0 END),0) AS active, ' +
      'COALESCE(SUM(CASE WHEN state NOT IN (' + marks(STATES) + ') THEN 1 ELSE 0 END),0) AS unknown ' +
      'FROM merchant_orders', ...TERMINAL, ...STATES);
    const states = Object.fromEntries(STATES.map(state => [state, 0]));
    for (const row of store._all('SELECT state,COUNT(*) AS count FROM merchant_orders WHERE state IN (' +
      marks(STATES) + ') GROUP BY state', ...STATES)) states[row.state] = count(row.count);
    const rows = store._all(
      'SELECT o.id,o.state,o.created_at,o.updated_at,' +
      "json_extract(o.frozen_json,'$.tenantId') AS tenant_id," +
      "json_extract(o.frozen_json,'$.template.resourceVersionId') AS resource_version_id," +
      'f.state AS fulfillment_state,f.attempt AS fulfillment_attempt,' +
      'f.created_at AS fulfillment_created_at,' +
      '(SELECT MAX(h.sequence) FROM merchant_history h WHERE h.order_id=o.id) AS history_sequence ' +
      'FROM merchant_orders o LEFT JOIN merchant_fulfillments f ON f.order_id=o.id ' +
      'WHERE o.state NOT IN (' + marks(TERMINAL) + ') ORDER BY o.created_at,o.id LIMIT ?',
      ...TERMINAL, limit);
    let missingTransitions = 0;
    const orders = rows.map(row => {
      const knownState = STATES.includes(row.state);
      const originalSource = {
        tenantId: typeof row.tenant_id === 'string' && UUID.test(row.tenant_id) ? row.tenant_id : null,
        resourceVersionId: typeof row.resource_version_id === 'string' && UUID.test(row.resource_version_id) ?
          row.resource_version_id : null,
      };
      const chargeActive = CHARGE.includes(row.state), paymentActive = PAYMENT.includes(row.state);
      const charge = { active: chargeActive, ...(chargeActive ? episode(store, row.id, CHARGE, generatedAt) :
        { firstRelevantAt: null, historySequence: null }) };
      const payment = { active: paymentActive, ...(paymentActive ? episode(store, row.id, PAYMENT, generatedAt) :
        { firstRelevantAt: null, historySequence: null }) };
      const settled = settlement(store, row.id, generatedAt);
      const fulfillment = row.fulfillment_state === null ? null : {
        state: row.fulfillment_state, attempt: count(row.fulfillment_attempt),
        firstRelevantAt: timestamp(row.fulfillment_created_at) && row.fulfillment_created_at <= generatedAt ?
          row.fulfillment_created_at : null,
      };
      const delivery = { active: settled.observed, status: settled.observed ? 'pending' :
        ['SETTLEMENT_CONFIRMED', 'FULFILLMENT_PENDING', 'FULFILLMENT_INTERRUPTED'].includes(row.state) ||
          fulfillment !== null ? 'unconfirmed' : 'not_applicable',
        firstRelevantAt: settled.firstRelevantAt, historySequence: settled.historySequence };
      const missing = !knownState || !originalSource.tenantId || !originalSource.resourceVersionId || (charge.active && !charge.firstRelevantAt) ||
        (payment.active && !payment.firstRelevantAt) || (settled.observed && !settled.firstRelevantAt) ||
        delivery.status === 'unconfirmed';
      if (missing) missingTransitions++;
      return { orderId: row.id, state: row.state, source: originalSource,
        createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
        historySequence: row.history_sequence === null ? null : count(row.history_sequence),
        charge, payment, settlement: settled, fulfillment, delivery,
        coverage: missing ? 'unknown' : 'complete' };
    });
    const active = count(totals.active), unknown = count(totals.unknown);
    const reasons = [];
    if (active > orders.length) reasons.push('active-orders-truncated');
    if (unknown) reasons.push('unknown-order-state');
    if (missingTransitions) reasons.push('required-transition-unavailable');
    if (source.kind !== 'reviewed-file-inputs') reasons.push('inputs-not-reviewed');
    const result = {
      schema: MERCHANT_OBSERVATIONS_SCHEMA, capturedAt: generatedAt, source,
      snapshot: { historySequence: sequence, revision: store.storeId + ':' + sequence },
      scope: { kind: 'original-merchant-store', orderSelection: 'all-nonterminal-orders',
        terminalStates: [...TERMINAL], orderLimit: limit, paymentAuthority: 'x402api',
        timestampBasis: 'first-original-local-observation', protectedReferences: true },
      coverage: { status: reasons.length ? 'partial' : 'complete', reasons,
        stateCounts: 'complete', activeOrders: active === orders.length ? 'complete' : 'truncated',
        transitionTimes: missingTransitions ? 'incomplete' : 'complete',
        inputBinding: source.kind === 'reviewed-file-inputs' ? 'reviewed' : 'unreviewed' },
      counts: { totalOrders: count(totals.total), activeOrders: active, returnedOrders: orders.length,
        omittedOrders: active - orders.length, unknownStateOrders: unknown, states },
      orders,
    };
    store._db.exec('COMMIT');
    return result;
  } catch (error) {
    try { store._db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
