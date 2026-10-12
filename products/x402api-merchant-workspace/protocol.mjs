// MIT. Merchant verification against the original published x402api contracts.
// https://x402api.com/docs/payments/x402/webhooks
// https://x402api.com/docs/payments/x402/receipts
// Canonical JSON is the JavaScript form of the original public wallet algorithm:
// x402api-com/x402api-agent-wallet@efcfda52a7f40df2732d713b50b501915af0f59e,
// packages/agent-wallet-core/src/protocol/http.ts (Git 479f3580691a0a45774e23b3f3a85a48d9948bdf).
// The hosted receipt/request-fingerprint implementation is not in that wallet.
// HMAC, SHA-256 and Ed25519 below use Node's original crypto implementation.
import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export class ProtocolError extends Error {
  constructor(code, field = null) {
    super(code);
    this.name = 'ProtocolError';
    this.code = code;
    this.field = field;
  }
}
const fail = (code, field) => { throw new ProtocolError(code, field); };
const need = (value, code, field) => { if (!value) fail(code, field); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const POSITIVE = /^[1-9][0-9]*$/;
const NONNEGATIVE = /^(?:0|[1-9][0-9]*)$/;
const MAXIMUM_DOCUMENT = 1024 * 1024;

function uuid(value, field) {
  need(typeof value === 'string' && UUID.test(value), 'X402API_UUID_INVALID', field);
  return value;
}
function text(value, field) {
  need(typeof value === 'string' && value.length > 0, 'X402API_TEXT_INVALID', field);
  return value;
}
function integer(value, field, minimum = 0) {
  need(Number.isSafeInteger(value) && value >= minimum, 'X402API_INTEGER_INVALID', field);
  return value;
}
function atomic(value, field, positive = true) {
  need(typeof value === 'string' && (positive ? POSITIVE : NONNEGATIVE).test(value),
    'X402API_ATOMIC_AMOUNT_INVALID', field);
  return value;
}
function hash(value, field) {
  need(typeof value === 'string' && HASH.test(value), 'X402API_SHA256_INVALID', field);
  return value;
}
function exact(value, required, optional, field) {
  need(object(value) && required.every(key => own(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)),
    'X402API_DOCUMENT_FIELDS_INVALID', field);
  return value;
}
function equal(left, right, field) {
  need(left === right, 'X402API_BINDING_MISMATCH', field);
}
function sameHash(left, right, field) {
  hash(left, field); hash(right, field);
  need(timingSafeEqual(Buffer.from(left.slice(7), 'hex'), Buffer.from(right.slice(7), 'hex')),
    'X402API_DIGEST_MISMATCH', field);
}
function timestamp(value, field) {
  const match = typeof value === 'string' &&
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(value);
  need(match, 'X402API_TIMESTAMP_INVALID', field);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  need(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59 &&
    (match[7] === 'Z' || Number(match[7].slice(1, 3)) <= 23 && Number(match[7].slice(4)) <= 59) &&
    Number.isFinite(Date.parse(value)), 'X402API_TIMESTAMP_INVALID', field);
  return value;
}
function base64(value, length, field) {
  need(typeof value === 'string' && value.length === 4 * Math.ceil(length / 3),
    'X402API_BASE64_INVALID', field);
  const bytes = Buffer.from(value, 'base64');
  need(bytes.length === length && bytes.toString('base64') === value, 'X402API_BASE64_INVALID', field);
  return bytes;
}

/** Decode UTF-8 JSON without silently accepting repeated object keys.
 * The original bytes remain with the caller. Parsed amounts are never coerced.
 * Cryptographic documents select integerNumbers; ordinary provider projections
 * may contain finite fractional JSON numbers outside those signed documents.
 */
export function parseJSONBytes(bytes, {
  maximumBytes = MAXIMUM_DOCUMENT, integerNumbers = false,
} = {}) {
  need(Buffer.isBuffer(bytes) && Number.isSafeInteger(maximumBytes) && maximumBytes > 0 &&
    bytes.length > 0 && bytes.length <= maximumBytes, 'X402API_JSON_BYTES_INVALID');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('X402API_JSON_UTF8_INVALID'); }
  let offset = 0, values = 0;
  const numeric = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const whitespace = () => { while (offset < source.length && /[\x20\t\r\n]/.test(source[offset])) offset++; };
  function string() {
    need(source[offset] === '"', 'X402API_JSON_STRING_REQUIRED');
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === '"') {
        let result;
        try { result = JSON.parse(source.slice(start, offset)); } catch { fail('X402API_JSON_STRING_INVALID'); }
        return result;
      }
      if (character === '\\') offset++;
      else need(character.charCodeAt(0) >= 32, 'X402API_JSON_STRING_INVALID');
    }
    fail('X402API_JSON_STRING_INVALID');
  }
  function value(depth) {
    need(depth <= 64 && ++values <= 100000, 'X402API_JSON_COMPLEXITY_LIMIT');
    whitespace();
    const character = source[offset];
    if (character === '"') return string();
    if (character === '{') {
      offset++; whitespace();
      const result = {}, keys = new Set();
      if (source[offset] === '}') { offset++; return result; }
      while (true) {
        whitespace();
        const key = string();
        need(!keys.has(key), 'X402API_JSON_DUPLICATE_KEY');
        keys.add(key); whitespace();
        need(source[offset++] === ':', 'X402API_JSON_COLON_REQUIRED');
        const child = value(depth + 1);
        Object.defineProperty(result, key, { value: child, enumerable: true, configurable: true, writable: true });
        whitespace();
        const delimiter = source[offset++];
        if (delimiter === '}') return result;
        need(delimiter === ',', 'X402API_JSON_OBJECT_INVALID');
      }
    }
    if (character === '[') {
      offset++; whitespace();
      const result = [];
      if (source[offset] === ']') { offset++; return result; }
      while (true) {
        result.push(value(depth + 1)); whitespace();
        const delimiter = source[offset++];
        if (delimiter === ']') return result;
        need(delimiter === ',', 'X402API_JSON_ARRAY_INVALID');
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return result; }
    }
    numeric.lastIndex = offset;
    const match = numeric.exec(source);
    need(match, 'X402API_JSON_VALUE_INVALID');
    offset = numeric.lastIndex;
    const result = Number(match[0]);
    need(Number.isFinite(result) && (!Number.isInteger(result) || Number.isSafeInteger(result)) &&
      (!integerNumbers || Number.isSafeInteger(result)), 'X402API_JSON_NUMBER_INVALID');
    return result;
  }
  const result = value(0);
  whitespace();
  need(offset === source.length, 'X402API_JSON_TRAILING_DATA');
  return result;
}

// Original wallet canonical rules, with TypeScript annotations removed.
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('cryptographic JSON numbers must be safe integers');
    return;
  }
  if (Array.isArray(value)) { value.forEach(assertJsonValue); return; }
  if (isObject(value)) { Object.values(value).forEach(assertJsonValue); return; }
  throw new Error('value is not JSON');
}
export function canonicalJson(value) {
  assertJsonValue(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(item => canonicalJson(item)).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}
export function digestBytes(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}
export function digestJson(value) {
  return digestBytes(canonicalJson(value));
}

function safeTree(value, active = new Set(), depth = 0, budget = { remaining: 100000 }) {
  need(depth <= 64 && --budget.remaining >= 0, 'X402API_DOCUMENT_COMPLEXITY_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    need(Number.isSafeInteger(value), 'X402API_DOCUMENT_NUMBER_INVALID');
    return;
  }
  need((object(value) || Array.isArray(value)) && !active.has(value), 'X402API_DOCUMENT_VALUE_INVALID');
  need(Object.getOwnPropertySymbols(value).length === 0, 'X402API_DOCUMENT_VALUE_INVALID');
  active.add(value);
  if (Array.isArray(value)) {
    need(Object.keys(value).length === value.length, 'X402API_DOCUMENT_ARRAY_INVALID');
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      need(descriptor && own(descriptor, 'value'), 'X402API_DOCUMENT_ARRAY_INVALID');
      safeTree(descriptor.value, active, depth + 1, budget);
    }
  } else {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      need(descriptor.enumerable && own(descriptor, 'value'), 'X402API_DOCUMENT_VALUE_INVALID');
      safeTree(descriptor.value, active, depth + 1, budget);
    }
  }
  active.delete(value);
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function configuredVersion(values, version, { numeric = false } = {}) {
  if (values instanceof Map) {
    const candidates = [version];
    if (numeric) candidates.push(Number(version));
    const matches = candidates.filter(key => values.has(key));
    need(matches.length === 1, 'X402API_KEY_VERSION_NOT_CONFIGURED');
    return values.get(matches[0]);
  }
  need(object(values) && own(values, version), 'X402API_KEY_VERSION_NOT_CONFIGURED');
  return values[version];
}
function requestHeaders(headers) {
  need(object(headers), 'X402API_WEBHOOK_HEADERS_INVALID');
  const result = new Map();
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    need(!result.has(key) && !Array.isArray(value) &&
      (typeof value === 'string' || value === undefined), 'X402API_WEBHOOK_DUPLICATE_HEADER', key);
    result.set(key, value);
  }
  const contentType = result.get('content-type');
  need(typeof contentType === 'string' && contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json',
    'X402API_WEBHOOK_CONTENT_TYPE_INVALID');
  return result;
}
function requiredHeader(headers, key) {
  const value = headers.get(key);
  need(typeof value === 'string' && value.length > 0, 'X402API_WEBHOOK_HEADER_REQUIRED', key);
  return value;
}

/** Authenticate exactly one original raw delivery. The caller must atomically
 * retain deliveryId + bodySha256 and its result before returning HTTP success.
 * Ownership and synthetic tests have no payment/fulfillment meaning.
 */
export function verifyWebhook({
  rawBody, headers, secretsByVersion, endpointId, tenantId,
  maximumAgeSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  need(Buffer.isBuffer(rawBody) && rawBody.length > 0 && rawBody.length <= MAXIMUM_DOCUMENT,
    'X402API_WEBHOOK_BODY_INVALID');
  uuid(endpointId, 'endpointId'); uuid(tenantId, 'tenantId');
  const selected = requestHeaders(headers);
  const signed = ['x-x402api-webhook-id', 'x-x402api-webhook-timestamp',
    'x-x402api-webhook-key-version', 'x-x402api-webhook-signature'];
  const verificationId = selected.get('x-x402api-webhook-verification-id');
  const bodySha256 = createHash('sha256').update(rawBody).digest('hex');
  if (verificationId !== undefined) {
    need(!signed.some(name => selected.get(name) !== undefined), 'X402API_WEBHOOK_MIXED_PROTOCOLS');
    uuid(verificationId, 'verificationId');
    const event = parseJSONBytes(rawBody, { integerNumbers: true });
    exact(event, ['challenge', 'challenge_id', 'endpoint_id', 'type', 'version'], [], 'ownership');
    equal(event.type, 'k1hub.webhook.endpoint_verification', 'ownership.type');
    equal(event.version, 1, 'ownership.version');
    text(event.challenge, 'ownership.challenge');
    uuid(event.challenge_id, 'ownership.challenge_id');
    uuid(event.endpoint_id, 'ownership.endpoint_id');
    equal(event.challenge_id, verificationId, 'ownership.challenge_id');
    equal(event.endpoint_id, endpointId, 'ownership.endpoint_id');
    return { kind: 'ownership', deliveryId: verificationId, event: frozen(event),
      bodySha256, responseBody: Object.freeze({ challenge: event.challenge }) };
  }
  const deliveryId = requiredHeader(selected, signed[0]);
  const seconds = requiredHeader(selected, signed[1]);
  const keyVersion = requiredHeader(selected, signed[2]);
  const signature = requiredHeader(selected, signed[3]);
  need(NONNEGATIVE.test(seconds) && Number.isSafeInteger(Number(seconds)),
    'X402API_WEBHOOK_TIMESTAMP_INVALID');
  need(POSITIVE.test(keyVersion) && Number.isSafeInteger(Number(keyVersion)),
    'X402API_WEBHOOK_KEY_VERSION_INVALID');
  need(/^v1=[0-9a-f]{64}$/.test(signature), 'X402API_WEBHOOK_SIGNATURE_INVALID');
  integer(nowSeconds, 'nowSeconds'); integer(maximumAgeSeconds, 'maximumAgeSeconds');
  need(Math.abs(nowSeconds - Number(seconds)) <= maximumAgeSeconds, 'X402API_WEBHOOK_AGE_EXCEEDED');
  const secret = configuredVersion(secretsByVersion, keyVersion, { numeric: true });
  need(typeof secret === 'string' && Array.from(secret).length >= 32 && Array.from(secret).length <= 256,
    'X402API_WEBHOOK_SECRET_INVALID');
  const expected = 'v1=' + createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.from(seconds + '.', 'ascii')).update(rawBody).digest('hex');
  need(timingSafeEqual(Buffer.from(signature, 'ascii'), Buffer.from(expected, 'ascii')),
    'X402API_WEBHOOK_AUTHENTICATION_FAILED');
  // Parsing begins only after the raw timestamp/body HMAC succeeds.
  const event = parseJSONBytes(rawBody, { integerNumbers: true });
  if (event?.eventType === 'webhook.test_delivery') {
    exact(event, ['deliveryId', 'deliveryKey', 'eventId', 'eventType',
      'requestedAt', 'schemaVersion', 'tenantId', 'testMode'], [], 'test');
    uuid(event.deliveryId, 'test.deliveryId'); uuid(event.eventId, 'test.eventId');
    uuid(event.tenantId, 'test.tenantId'); timestamp(event.requestedAt, 'test.requestedAt');
    equal(event.schemaVersion, 1, 'test.schemaVersion'); equal(event.testMode, true, 'test.testMode');
    equal(event.tenantId, tenantId, 'test.tenantId');
    equal(event.deliveryId, event.eventId, 'test.eventId');
    equal(event.deliveryKey, 'webhook-test:' + event.deliveryId, 'test.deliveryKey');
    equal(deliveryId, event.deliveryKey, 'test.deliveryKey');
    return { kind: 'test', deliveryId, event: frozen(event), bodySha256 };
  }
  exact(event, ['event_id', 'payload', 'payload_digest', 'schema_version',
    'tenant', 'timestamp', 'type'], [], 'paymentEvent');
  equal(event.type, 'payment.finalized', 'paymentEvent.type');
  equal(event.schema_version, 1, 'paymentEvent.schema_version');
  uuid(event.event_id, 'paymentEvent.event_id'); timestamp(event.timestamp, 'paymentEvent.timestamp');
  exact(event.tenant, ['id'], [], 'paymentEvent.tenant'); uuid(event.tenant.id, 'paymentEvent.tenant.id');
  equal(event.tenant.id, tenantId, 'paymentEvent.tenant.id');
  const payload = exact(event.payload, ['amount_atomic', 'asset', 'block_hash', 'block_number',
    'fulfillment_status', 'network', 'order_id', 'payment_id', 'payer', 'payment_status',
    'resource_version_id', 'transaction'], [], 'paymentEvent.payload');
  atomic(payload.amount_atomic, 'payload.amount_atomic');
  atomic(payload.block_number, 'payload.block_number', false);
  for (const field of ['asset', 'block_hash', 'network', 'payer', 'transaction']) text(payload[field], 'payload.' + field);
  for (const field of ['order_id', 'payment_id', 'resource_version_id']) uuid(payload[field], 'payload.' + field);
  equal(payload.fulfillment_status, 'delivering', 'payload.fulfillment_status');
  equal(payload.payment_status, 'finalized', 'payload.payment_status');
  equal(deliveryId, 'fulfillment:' + tenantId + ':' + payload.order_id, 'paymentEvent.deliveryId');
  sameHash(event.payload_digest, digestJson(payload), 'paymentEvent.payload_digest');
  return { kind: 'payment', deliveryId, event: frozen(event), bodySha256 };
}

const expectedFields = ['tenantId', 'paymentId', 'orderId', 'chargeId', 'resourceId', 'resourceVersion',
  'requestHash', 'recipient', 'walletVersion', 'network', 'assetId', 'assetVersion', 'asset',
  'amountAtomic', 'payer', 'transaction', 'blockNumber', 'blockHash'];
function expectedReceipt(value) {
  exact(value, expectedFields, ['logIndex'], 'expected');
  for (const name of ['tenantId', 'paymentId', 'orderId', 'chargeId', 'resourceId']) uuid(value[name], 'expected.' + name);
  for (const name of ['resourceVersion', 'walletVersion', 'assetVersion']) integer(value[name], 'expected.' + name, 1);
  for (const name of ['recipient', 'network', 'assetId', 'asset', 'payer', 'transaction', 'blockHash'])
    text(value[name], 'expected.' + name);
  hash(value.requestHash, 'expected.requestHash');
  atomic(value.amountAtomic, 'expected.amountAtomic'); atomic(value.blockNumber, 'expected.blockNumber', false);
  if (own(value, 'logIndex') && value.logIndex !== null) integer(value.logIndex, 'expected.logIndex');
  return value;
}
function pricing(value, amount) {
  exact(value, ['policy', 'network_fee_alternatives', 'eligible_alternatives',
    'network_fee_alternatives_digest', 'selected_fee_evidence', 'selected_fee_evidence_digest',
    'listed_amount_atomic', 'fee_allowance_atomic', 'settlement_amount_atomic', 'quote_expires_at'],
    [], 'receipt.pricing');
  need(object(value.policy), 'X402API_PRICING_POLICY_INVALID');
  for (const name of ['network_fee_alternatives', 'eligible_alternatives'])
    need(Array.isArray(value[name]) && value[name].every(object), 'X402API_PRICING_ALTERNATIVES_INVALID', name);
  // The complete original fee documents and their digests are signed claims.
  // Their hosted preimage construction is not a published verifier export.
  hash(value.network_fee_alternatives_digest, 'receipt.pricing.network_fee_alternatives_digest');
  if (value.selected_fee_evidence === null) equal(value.selected_fee_evidence_digest, null, 'receipt.pricing.selected_fee_evidence_digest');
  else {
    need(object(value.selected_fee_evidence), 'X402API_PRICING_EVIDENCE_INVALID');
    hash(value.selected_fee_evidence_digest, 'receipt.pricing.selected_fee_evidence_digest');
  }
  atomic(value.listed_amount_atomic, 'receipt.pricing.listed_amount_atomic');
  atomic(value.fee_allowance_atomic, 'receipt.pricing.fee_allowance_atomic', false);
  atomic(value.settlement_amount_atomic, 'receipt.pricing.settlement_amount_atomic');
  equal(value.settlement_amount_atomic, amount, 'receipt.pricing.settlement_amount_atomic');
  if (value.quote_expires_at !== null) timestamp(value.quote_expires_at, 'receipt.pricing.quote_expires_at');
}

/** Verify a complete signed v2 receipt and every independently selected business
 * binding. Pins are supplied from private reviewed configuration; embedded keys
 * and the public discovery endpoint never become trust anchors automatically.
 */
export function verifyReceipt({ envelope, fingerprintsByVersion, expected } = {}) {
  safeTree(envelope); safeTree(expected);
  expectedReceipt(expected);
  // Snapshot the plain JSON input so returned verification cannot subsequently
  // refer to a different caller-owned receipt object.
  const envelopeBytes = Buffer.from(canonicalJson(envelope), 'utf8');
  need(envelopeBytes.length <= MAXIMUM_DOCUMENT, 'X402API_RECEIPT_TOO_LARGE');
  const saved = parseJSONBytes(envelopeBytes, { integerNumbers: true });
  exact(saved, ['id', 'order_id', 'settlement_job_id', 'receipt', 'receipt_digest',
    'signature', 'signing_key_version', 'settlement_amount_atomic', 'created_at'], [], 'envelope');
  for (const name of ['id', 'order_id', 'settlement_job_id']) uuid(saved[name], 'envelope.' + name);
  timestamp(saved.created_at, 'envelope.created_at');
  atomic(saved.settlement_amount_atomic, 'envelope.settlement_amount_atomic');
  text(saved.signing_key_version, 'envelope.signing_key_version');
  const receipt = exact(saved.receipt, ['receipt_version', 'receipt_id', 'issuer', 'tenant',
    'settlement', 'order', 'resource', 'merchant', 'payment', 'confirmed_block', 'settled_at',
    'signing_authority'], ['pricing'], 'receipt');
  equal(receipt.receipt_version, 2, 'receipt.receipt_version');
  equal(receipt.issuer, 'x402api.com', 'receipt.issuer');
  uuid(receipt.receipt_id, 'receipt.receipt_id'); timestamp(receipt.settled_at, 'receipt.settled_at');
  exact(receipt.tenant, ['id'], [], 'receipt.tenant'); uuid(receipt.tenant.id, 'receipt.tenant.id');
  exact(receipt.settlement, ['job_id'], [], 'receipt.settlement');
  uuid(receipt.settlement.job_id, 'receipt.settlement.job_id');
  exact(receipt.order, ['id', 'challenge_id'], [], 'receipt.order');
  uuid(receipt.order.id, 'receipt.order.id'); uuid(receipt.order.challenge_id, 'receipt.order.challenge_id');
  exact(receipt.resource, ['id', 'version', 'request_hash'], [], 'receipt.resource');
  uuid(receipt.resource.id, 'receipt.resource.id'); integer(receipt.resource.version, 'receipt.resource.version', 1);
  hash(receipt.resource.request_hash, 'receipt.resource.request_hash');
  exact(receipt.merchant, ['wallet', 'wallet_version'], [], 'receipt.merchant');
  text(receipt.merchant.wallet, 'receipt.merchant.wallet');
  integer(receipt.merchant.wallet_version, 'receipt.merchant.wallet_version', 1);
  const payment = exact(receipt.payment, ['network', 'asset_id', 'asset_version', 'display_name',
    'contract_address', 'amount_atomic', 'payer', 'transaction', 'log_index'], [], 'receipt.payment');
  for (const name of ['network', 'asset_id', 'display_name', 'contract_address', 'payer', 'transaction'])
    text(payment[name], 'receipt.payment.' + name);
  integer(payment.asset_version, 'receipt.payment.asset_version', 1);
  atomic(payment.amount_atomic, 'receipt.payment.amount_atomic');
  // Retain an explicit null event index as signed data; never manufacture an
  // index for a rail. If the original observation selects one, compare it below.
  if (payment.log_index !== null) integer(payment.log_index, 'receipt.payment.log_index');
  exact(receipt.confirmed_block, ['number', 'hash'], [], 'receipt.confirmed_block');
  atomic(receipt.confirmed_block.number, 'receipt.confirmed_block.number', false);
  text(receipt.confirmed_block.hash, 'receipt.confirmed_block.hash');
  const authority = exact(receipt.signing_authority, ['algorithm', 'key_version',
    'public_key_base64', 'key_fingerprint'], [], 'receipt.signing_authority');
  equal(authority.algorithm, 'Ed25519', 'receipt.signing_authority.algorithm');
  text(authority.key_version, 'receipt.signing_authority.key_version');
  equal(saved.signing_key_version, authority.key_version, 'envelope.signing_key_version');
  const publicBytes = base64(authority.public_key_base64, 32, 'receipt.signing_authority.public_key_base64');
  const signature = base64(saved.signature, 64, 'envelope.signature');
  const pinned = configuredVersion(fingerprintsByVersion, authority.key_version);
  const fingerprint = digestBytes(publicBytes);
  sameHash(authority.key_fingerprint, fingerprint, 'receipt.signing_authority.key_fingerprint');
  sameHash(pinned, fingerprint, 'independentFingerprint');
  const canonicalBytes = Buffer.from(canonicalJson(receipt), 'utf8');
  const receiptDigest = digestBytes(canonicalBytes);
  sameHash(saved.receipt_digest, receiptDigest, 'envelope.receipt_digest');
  let verified = false;
  try {
    const key = createPublicKey({ format: 'jwk', key: {
      kty: 'OKP', crv: 'Ed25519', x: publicBytes.toString('base64url'),
    } });
    verified = verify(null, canonicalBytes, key, signature);
  } catch { fail('X402API_RECEIPT_SIGNATURE_INVALID'); }
  need(verified, 'X402API_RECEIPT_SIGNATURE_INVALID');
  equal(saved.id, receipt.receipt_id, 'envelope.id');
  equal(saved.order_id, receipt.order.id, 'envelope.order_id');
  equal(saved.settlement_job_id, receipt.settlement.job_id, 'envelope.settlement_job_id');
  equal(saved.settlement_amount_atomic, payment.amount_atomic, 'envelope.settlement_amount_atomic');
  if (own(receipt, 'pricing')) pricing(receipt.pricing, payment.amount_atomic);
  const bindings = {
    tenantId: receipt.tenant.id, paymentId: receipt.settlement.job_id, orderId: receipt.order.id,
    chargeId: receipt.order.challenge_id, resourceId: receipt.resource.id, resourceVersion: receipt.resource.version,
    requestHash: receipt.resource.request_hash, recipient: receipt.merchant.wallet,
    walletVersion: receipt.merchant.wallet_version, network: payment.network, assetId: payment.asset_id,
    assetVersion: payment.asset_version, asset: payment.contract_address, amountAtomic: payment.amount_atomic,
    payer: payment.payer, transaction: payment.transaction, blockNumber: receipt.confirmed_block.number,
    blockHash: receipt.confirmed_block.hash,
  };
  for (const name of expectedFields) equal(bindings[name], expected[name], 'expected.' + name);
  if (own(expected, 'logIndex')) equal(payment.log_index, expected.logIndex, 'expected.logIndex');
  return { receipt: frozen(receipt), canonicalBytes, receiptDigest, signingKeyVersion: authority.key_version };
}

/** Use the authoritative GET Order projection. This labels a returned SHA-256
 * digest; it does not derive the hosted protected-request tuple, and it does not
 * substitute the wallet's separate RequestEnvelope.requestDigest.
 */
export function providerOrderRequestHash(order, { orderId, resourceVersionId, paymentIdentifier } = {}) {
  need(object(order), 'X402API_ORDER_REQUIRED');
  uuid(orderId, 'orderId'); uuid(resourceVersionId, 'resourceVersionId');
  text(paymentIdentifier, 'paymentIdentifier');
  equal(order.id, orderId, 'order.id');
  equal(order.resource_version_id, resourceVersionId, 'order.resource_version_id');
  equal(order.payment_identifier, paymentIdentifier, 'order.payment_identifier');
  const fingerprint = order.request_fingerprint;
  need(typeof fingerprint === 'string', 'X402API_ORDER_FINGERPRINT_REQUIRED');
  if (HASH.test(fingerprint)) return fingerprint;
  need(/^[0-9a-f]{64}$/.test(fingerprint), 'X402API_ORDER_FINGERPRINT_ENCODING_UNSUPPORTED');
  return 'sha256:' + fingerprint;
}

/** Select one full, immutable x402 v2 alternative for this application's
 * explicitly configured buyer_pays policy. Keep the returned header/object and
 * its extensions unchanged. A response's object-key order is not a binding.
 */
export function selectChargePrice({ charge, rail, resourceVersionId, resourceUrl } = {}) {
  safeTree(charge); safeTree(rail);
  need(object(charge) && object(rail), 'X402API_CHARGE_SELECTION_REQUIRED');
  uuid(resourceVersionId, 'resourceVersionId'); text(resourceUrl, 'resourceUrl');
  equal(charge.resource_version_id, resourceVersionId, 'charge.resource_version_id');
  for (const name of ['assetId', 'network', 'asset', 'recipient']) text(rail[name], 'rail.' + name);
  for (const name of ['assetVersion', 'walletVersion']) integer(rail[name], 'rail.' + name, 1);
  atomic(rail.amountAtomic, 'rail.amountAtomic');
  need(Array.isArray(charge.prices) && charge.prices.every(object), 'X402API_CHARGE_PRICES_INVALID');
  const prices = charge.prices.filter(value => value.asset_id === rail.assetId);
  need(prices.length === 1, 'X402API_CHARGE_ASSET_SELECTION_INVALID');
  atomic(prices[0].amount_atomic, 'charge.prices.amount_atomic');
  equal(prices[0].amount_atomic, rail.amountAtomic, 'charge.prices.amount_atomic');
  const required = charge.payment_required;
  need(object(required) && required.x402Version === 2 && object(required.resource) &&
    Array.isArray(required.accepts) && required.accepts.length > 0,
    'X402API_PAYMENT_REQUIRED_INVALID');
  equal(required.resource.url, resourceUrl, 'payment_required.resource.url');
  const header = charge.payment_required_header;
  need(typeof header === 'string' && header.length > 0 && header.length <= 2 * 1024 * 1024,
    'X402API_PAYMENT_REQUIRED_HEADER_INVALID');
  const decoded = Buffer.from(header, 'base64');
  need(decoded.toString('base64') === header, 'X402API_PAYMENT_REQUIRED_HEADER_INVALID');
  const original = parseJSONBytes(decoded, { maximumBytes: MAXIMUM_DOCUMENT, integerNumbers: true });
  equal(canonicalJson(original), canonicalJson(required), 'payment_required_header');
  const matches = [];
  for (let index = 0; index < required.accepts.length; index++) {
    const value = required.accepts[index];
    need(object(value), 'X402API_PAYMENT_ALTERNATIVE_INVALID');
    if (value.scheme === 'exact' && value.network === rail.network && value.asset === rail.asset &&
        value.payTo === rail.recipient && value.amount === rail.amountAtomic) {
      integer(value.maxTimeoutSeconds, 'payment_required.accepts.maxTimeoutSeconds', 1);
      matches.push({ index, value });
    }
  }
  need(matches.length === 1, 'X402API_PAYMENT_ALTERNATIVE_SELECTION_INVALID');
  const selected = matches[0];
  const requirement = parseJSONBytes(Buffer.from(canonicalJson(selected.value)), { integerNumbers: true });
  const selectedRail = parseJSONBytes(Buffer.from(canonicalJson(rail)), { integerNumbers: true });
  return Object.freeze({
    acceptsIndex: selected.index, requirement: frozen(requirement), requirementDigest: digestJson(requirement),
    rail: frozen(selectedRail), amountAtomic: requirement.amount, paymentRequiredHeader: header,
  });
}
