/**
 * Bridge provider observations for the existing Bloccpay integration.
 * Pure data handling: the original application owns HTTP, durable transactions,
 * account/customer bindings, journal, settlement, scheduling and export.
 * Current primary sources are recorded in BRIDGE_PROVIDER_CONTRACT.json.
 */
export const BRIDGE_CONTRACT_VERSION = 'bloccpay.bridge-provider-observations.v1';

export class BridgeContractError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'BridgeContractError'; this.code = code;
    this.details = details;
  }
}
function need(ok, code, message, details) {
  if (!ok) throw new BridgeContractError(code, message, details);
}
function object(value, label) {
  need(value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_OBJECT', label + ' must be an object.');
  return value;
}
function string(value, label, max = 1024) {
  need(typeof value === 'string' && value.length > 0 && value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value), 'INVALID_STRING',
    label + ' must be nonempty text without control characters.');
  return value;
}
function optional(value, label, max) {
  return value === undefined || value === null ? null : string(value, label, max);
}
function jsonCopy(value) {
  const seen = new Set();
  function copy(x, depth) {
    need(depth <= 64, 'JSON_DEPTH', 'Provider object exceeds the declared nesting bound.');
    if (x === null || typeof x === 'boolean' || typeof x === 'string') return x;
    if (typeof x === 'number') {
      need(Number.isFinite(x) && (!Number.isInteger(x) || Number.isSafeInteger(x)),
        'UNSAFE_NUMBER', 'Retain and parse the original provider numeric token before interpreting it.');
      return x;
    }
    need(typeof x === 'object' && x !== null && !seen.has(x), 'INVALID_JSON', 'Expected an acyclic JSON value.');
    seen.add(x);
    let y;
    if (Array.isArray(x)) y = x.map(z => copy(z, depth + 1));
    else {
      need(Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null,
        'INVALID_JSON', 'Expected an ordinary JSON object.');
      y = Object.create(null);
      for (const key of Object.keys(x)) Object.defineProperty(y, key, {
        value: copy(x[key], depth + 1), enumerable: true, writable: true, configurable: true
      });
    }
    seen.delete(x); return y;
  }
  return copy(value, 0);
}
export function exactDecimal(text) {
  need(typeof text === 'string' && text.length <= 512 && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text),
    'INVALID_DECIMAL', 'Bridge monetary values must retain their nonnegative decimal strings.');
  const [whole, fraction = ''] = text.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return { text, normalized: whole + (trimmed ? '.' + trimmed : ''),
    coefficient: BigInt(whole + fraction), scale: fraction.length };
}
export function compareDecimalText(a, b) {
  const x = exactDecimal(a), y = exactDecimal(b);
  const scale = Math.max(x.scale, y.scale);
  const left = x.coefficient * 10n ** BigInt(scale - x.scale);
  const right = y.coefficient * 10n ** BigInt(scale - y.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
function decimalFields(obj, names, findings, prefix) {
  const out = {};
  for (const name of names) {
    const value = obj[name];
    if (value !== undefined && value !== null) {
      try { out[name] = exactDecimal(value).text; }
      catch (error) {
        if (!(error instanceof BridgeContractError)) throw error;
        findings.push({ code: 'INVALID_PROVIDER_DECIMAL', field: prefix + name, value: jsonCopy(value) });
      }
    }
  }
  return out;
}
function finding(code, detail) { return { code, ...detail }; }
const TRANSFER_PENDING = new Set(['awaiting_funds', 'funds_received', 'payment_submitted',
  'in_review', 'kyc_required', 'kyc_in_review', 'developer_kyb_required', 'payment_validated']);
const TRANSFER_EXCEPTIONS = new Set(['undeliverable', 'returned', 'refund_in_flight',
  'refunded', 'refund_failed', 'canceled', 'error', 'underfunded', 'missing_return_policy', 'deactivated']);
export function describeTransfer(input) {
  const original = jsonCopy(object(input, 'Transfer'));
  const id = string(original.id, 'Transfer id');
  const state = string(original.state, 'Transfer state');
  const findings = [];
  const amounts = decimalFields(original, ['amount', 'developer_fee', 'developer_fee_percent'], findings, '');
  const receipt = original.receipt === undefined || original.receipt === null ? null :
    object(original.receipt, 'Transfer receipt');
  const receiptAmounts = receipt ? decimalFields(receipt,
    ['initial_amount', 'subtotal_amount', 'final_amount', 'developer_fee', 'exchange_fee', 'gas_fee'],
    findings, 'receipt.') : {};
  const currency = optional(original.currency, 'Transfer amount currency', 32);
  if (!currency) findings.push(finding('AMOUNT_CURRENCY_NOT_ESTABLISHED', {
    message: 'Do not infer the transfer amount currency from the source token or its peg.'
  }));
  const source = original.source ? object(original.source, 'Transfer source') : null;
  const destination = original.destination ? object(original.destination, 'Transfer destination') : null;
  const rawHash = optional(receipt?.destination_tx_hash, 'Receipt destination transaction hash', 512);
  const status = state === 'payment_processed' ? 'PROVIDER_DELIVERED' :
    TRANSFER_PENDING.has(state) ? 'PENDING' :
    TRANSFER_EXCEPTIONS.has(state) ? 'EXCEPTION' : 'UNRECOGNIZED_STATE';
  if (status === 'UNRECOGNIZED_STATE') findings.push(finding('UNRECOGNIZED_TRANSFER_STATE', { state }));
  if (status === 'PROVIDER_DELIVERED' && destination?.payment_rail === 'stellar' && !rawHash)
    findings.push(finding('FINAL_STELLAR_HASH_MISSING', { id }));
  return {
    schema: BRIDGE_CONTRACT_VERSION, kind: 'transfer', id,
    customerId: optional(original.on_behalf_of, 'Transfer customer'),
    clientReferenceId: optional(original.client_reference_id, 'Client reference', 256),
    state, status, amountCurrency: currency, amounts, receiptAmounts,
    source: source && jsonCopy(source), destination: destination && jsonCopy(destination),
    provisionalDestinationTxHash: state === 'payment_submitted' ? rawHash : null,
    finalizedDestinationTxHash: state === 'payment_processed' ? rawHash : null,
    createdAt: optional(original.created_at, 'Transfer created_at'),
    updatedAt: optional(original.updated_at, 'Transfer updated_at'),
    original, findings,
    ledgerAction: 'NONE'
  };
}
const ACTIVITY_PENDING = new Set(['funds_received', 'payment_submitted', 'funds_scheduled', 'in_review']);
const ACTIVITY_EXCEPTIONS = new Set(['refund', 'refunded', 'refund_in_flight', 'refund_failed']);
const ACTIVITY_NONPAYMENT = new Set(['microdeposit', 'account_update', 'deactivation', 'activation', 'close']);
export function describeVirtualAccountActivity(input) {
  const original = jsonCopy(object(input, 'Virtual account activity'));
  const id = string(original.id, 'Activity id'), type = string(original.type, 'Activity type');
  const customerId = string(original.customer_id, 'Activity customer');
  const virtualAccountId = string(original.virtual_account_id, 'Activity virtual account');
  const depositId = optional(original.deposit_id, 'Original deposit id');
  const findings = [];
  const amounts = decimalFields(original,
    ['amount', 'developer_fee_amount', 'exchange_fee_amount', 'subtotal_amount', 'gas_fee'], findings, '');
  const currency = optional(original.currency, 'Activity currency', 32);
  const destinationBasis = type === 'payment_submitted' || type === 'payment_processed';
  const status = type === 'payment_processed' ? 'PROVIDER_DELIVERED' :
    ACTIVITY_PENDING.has(type) ? 'PENDING' : ACTIVITY_EXCEPTIONS.has(type) ? 'EXCEPTION' :
    ACTIVITY_NONPAYMENT.has(type) ? 'NONPAYMENT_ACTIVITY' : 'UNRECOGNIZED_ACTIVITY';
  if (status === 'UNRECOGNIZED_ACTIVITY')
    findings.push(finding('UNRECOGNIZED_ACTIVITY_TYPE', {
      type, message: 'Retain original type; older examples are not settlement authority.'
    }));
  if (status !== 'NONPAYMENT_ACTIVITY' && !depositId)
    findings.push(finding('DEPOSIT_LINK_MISSING', { id, type }));
  if (amounts.amount !== undefined && !currency)
    findings.push(finding('AMOUNT_CURRENCY_NOT_ESTABLISHED', { id }));
  const rawHash = optional(original.destination_tx_hash, 'Activity destination transaction hash', 512);
  if (type === 'payment_processed' && !rawHash)
    findings.push(finding('FINAL_TRANSACTION_HASH_MISSING', { id }));
  return {
    schema: BRIDGE_CONTRACT_VERSION, kind: 'virtual_account.activity',
    id, type, status, customerId, virtualAccountId, depositId,
    amountCurrency: currency, amountBasis: destinationBasis ? 'DESTINATION' : 'SOURCE',
    // Source-currency subtotal/fiat fees remain distinct from destination amount/gas.
    amounts, subtotalCurrencyBasis: 'SOURCE', fiatFeesCurrencyBasis: 'SOURCE',
    gasFeeCurrencyBasis: 'DESTINATION',
    provisionalDestinationTxHash: type === 'payment_submitted' ? rawHash : null,
    finalizedDestinationTxHash: type === 'payment_processed' ? rawHash : null,
    createdAt: optional(original.created_at, 'Activity created_at'),
    original, findings, ledgerAction: 'NONE'
  };
}
/**
 * Validate the event envelope after signature verification of the original bytes.
 * Caller must supply its endpoint/developer/customer binding from original setup.
 * This does not mark the event committed or authorize a customer ledger mutation.
 */
export function describeWebhookEvent(input, binding) {
  const original = jsonCopy(object(input, 'Webhook event'));
  object(binding, 'Original webhook binding');
  const eventId = string(original.event_id, 'Webhook event id');
  const category = string(original.event_category, 'Webhook event category');
  const eventType = string(original.event_type, 'Webhook event type');
  const objectId = string(original.event_object_id, 'Webhook object id');
  const eventObject = object(original.event_object, 'Webhook event object');
  need(eventObject.id === objectId, 'EVENT_OBJECT_MISMATCH', 'Envelope and full original object disagree.');
  need(eventType.startsWith(category + '.'), 'EVENT_TYPE_MISMATCH', 'Event type must belong to its original category.');
  need(original.api_version === 'v0', 'UNSUPPORTED_API_VERSION', 'Keep unsupported provider versions for explicit review.');
  const developerId = string(original.event_developer_id, 'Event developer id');
  need(developerId === string(binding.developerId, 'Selected developer id'),
    'DEVELOPER_MISMATCH', 'Signed event belongs to another selected Bridge developer.');
  const allowed = binding.categories || ['transfer', 'virtual_account.activity'];
  need(Array.isArray(allowed) && allowed.includes(category), 'UNSELECTED_CATEGORY', 'Event category was not selected for this integration.');
  let observation;
  if (category === 'transfer') observation = describeTransfer(eventObject);
  else if (category === 'virtual_account.activity') observation = describeVirtualAccountActivity(eventObject);
  else throw new BridgeContractError('UNSUPPORTED_CATEGORY', 'This module handles transfer and virtual-account activity only.');
  need(Array.isArray(binding.customerIds) && binding.customerIds.includes(observation.customerId),
    'CUSTOMER_MISMATCH', 'Provider customer is not in the selected original binding.');
  if (category === 'virtual_account.activity') {
    need(Array.isArray(binding.virtualAccounts) && binding.virtualAccounts.some(x =>
      x.customerId === observation.customerId && x.virtualAccountId === observation.virtualAccountId),
      'VIRTUAL_ACCOUNT_MISMATCH', 'Virtual account is not bound to this original customer.');
  }
  return { schema: BRIDGE_CONTRACT_VERSION, kind: 'webhook',
    eventId, category, eventType, objectId, developerId,
    eventCreatedAt: string(original.event_created_at, 'Event creation time'),
    sequence: original.event_sequence ?? null, original, observation,
    ledgerAction: 'NONE', acquisition: 'VERIFIED_NOT_COMMITTED' };
}
export function inspectListPage(input, { limit = 100, previousCursor = null } = {}) {
  const original = jsonCopy(object(input, 'Provider list page'));
  need(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_LIMIT', 'Provider page limit must be1..100.');
  need(Array.isArray(original.data) && original.data.length <= limit, 'INVALID_PAGE', 'Expected a bounded full data array.');
  if (original.count !== undefined)
    need(Number.isInteger(original.count) && original.count === original.data.length,
      'PAGE_COUNT_MISMATCH', 'Provider count must describe this complete page.');
  const ids = original.data.map(x => string(object(x, 'Provider row').id, 'Provider row id'));
  need(new Set(ids).size === ids.length, 'DUPLICATE_PAGE_ID', 'A provider page repeats an object id.');
  if (ids.length && previousCursor !== null)
    need(!ids.includes(previousCursor), 'CURSOR_NOT_ADVANCED', 'Provider repeated the excluded cursor.');
  return { original, terminal: ids.length === 0, count: ids.length,
    firstId: ids[0] ?? null, lastId: ids.at(-1) ?? null };
}
function checkSignal(signal) { if (signal?.aborted) throw signal.reason || new BridgeContractError('ABORTED', 'The original operation was interrupted.'); }
/**
 * Complete older-direction source acquisition. Each full page must be retained by
 * the existing owner before advancing. This routine never moves a saved boundary.
 * readPage owns/drains its original HTTP body before resolving.
 */
export async function acquireHistory({ readPage, retainPage, initialCursor = null, limit = 100,
  maxPages = 10000, signal, onPage }) {
  need(typeof readPage === 'function' && typeof retainPage === 'function',
    'ORIGINAL_OWNERS_REQUIRED', 'Supply the original HTTP reader and durable source owner.');
  need(Number.isInteger(maxPages) && maxPages > 0, 'INVALID_PAGE_BOUND', 'Declare a finite page bound.');
  let cursor = initialCursor, pages = 0, rows = 0;
  const seenCursors = new Set(cursor === null ? [] : [cursor]);
  const seenIds = new Set(), receipts = [];
  while (pages < maxPages) {
    checkSignal(signal);
    const response = await readPage({ limit, starting_after: cursor, signal });
    checkSignal(signal);
    const page = inspectListPage(response.document, { limit, previousCursor: cursor });
    for (const row of page.original.data) {
      need(!seenIds.has(row.id), 'REPEATED_HISTORY_ID', 'Historical cursor walk repeated an object; preserve the source for review.', { id: row.id });
      seenIds.add(row.id);
    }
    // Response carries original URL/status/headers/body identity from native transport.
    // Retention failure leaves the previously committed cursor authoritative.
    const retained = await retainPage({ page: pages, requestedCursor: cursor, response,
      terminal: page.terminal, nextCursor: page.lastId, signal });
    need(retained && typeof retained === 'object', 'SOURCE_NOT_RETAINED', 'Original source owner must return its durable receipt.');
    checkSignal(signal);
    receipts.push(retained); pages++; rows += page.count;
    if (typeof onPage === 'function') await onPage({ pages, rows, terminal: page.terminal, retained });
    if (page.terminal) return { schema: BRIDGE_CONTRACT_VERSION, status: 'COMPLETE_SOURCE',
      pages, rows, terminalEmptyPage: retained, receipts, lastCursor: cursor };
    need(!seenCursors.has(page.lastId), 'CURSOR_CYCLE', 'Historical cursor walk cycles.');
    seenCursors.add(page.lastId); cursor = page.lastId;
  }
  throw new BridgeContractError('PAGE_BOUND_REACHED', 'Source acquisition is incomplete; keep all retained pages and resume the same selection.', {
    pages, rows, nextCursor: cursor, receipts
  });
}
