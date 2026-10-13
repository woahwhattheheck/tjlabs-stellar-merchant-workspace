// MIT License.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, realpath, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';
import { MerchantStore } from './store.mjs';
import { createProvider } from './provider.mjs';
import { verifyWebhook, verifyReceipt, selectChargePrice, providerOrderRequestHash, canonicalJson, parseJSONBytes } from './protocol.mjs';
import { prepareBuyerResponseFile } from '../../stellar/scf-starforge-20261009/sf31-buyer-client/response-file.mjs';
import { VerifiedFile } from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/result.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATOMIC = /^[1-9][0-9]{0,77}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const TERMINAL = new Set(['COMPLETE', 'PAYMENT_FAILED', 'CHARGE_REJECTED']);
const ACTIVE = new Set(['CHARGE_UNCERTAIN', 'PAYMENT_PENDING', 'PAYMENT_UNCERTAIN', 'SETTLEMENT_CONFIRMED', 'FULFILLMENT_PENDING', 'FULFILLMENT_INTERRUPTED']);
export class MerchantError extends Error {
  constructor(code, status = 400, details) { super(code); this.name = 'MerchantError'; this.code = code; this.status = status; this.details = details; }
}
function need(test, code, status = 400) { if (!test) throw new MerchantError(code, status); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactText(value, name, maximum = 512) {
  need(typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value), name);
  return value;
}
function jsonBytes(value) { return Buffer.from(JSON.stringify(value), 'utf8'); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function equalBytes(a, b) { a = Buffer.from(a); b = Buffer.from(b); return a.length === b.length && timingSafeEqual(a, b); }
function code(error) { return String(error?.code ?? 'OPERATION_FAILED').replace(/[^A-Z0-9_.:-]/gi, '_').slice(0, 120); }
function fileName(name) { need(typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) && name !== '.' && name !== '..', 'RESULT_FILE_NAME_INVALID'); return name; }
function mime(value) { need(typeof value === 'string' && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value), 'RESULT_CONTENT_TYPE_INVALID'); return value.toLowerCase(); }
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
function safeClone(value) { return structuredClone(value); }
function dueDate(value, now, fallback = 10000) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/^[0-9]+$/.test(raw)) {
    const seconds = Number(raw);
    if (Number.isSafeInteger(seconds) && seconds <= 2147483) return new Date(now + Math.max(1000, seconds * 1000)).toISOString();
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed) && parsed > now) return new Date(parsed).toISOString();
  return new Date(now + fallback).toISOString();
}
export function decimalToAtomic(value, decimals) {
  need(Number.isInteger(decimals) && decimals >= 0 && decimals <= 30, 'DECIMALS_INVALID');
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value), 'DECIMAL_AMOUNT_INVALID');
  const [whole, fraction = ''] = value.split('.');
  need(fraction.length <= decimals, 'AMOUNT_PRECISION_EXCEEDED');
  const amount = (whole + fraction.padEnd(decimals, '0')).replace(/^0+(?=[0-9])/, '');
  need(ATOMIC.test(amount), 'AMOUNT_MUST_BE_POSITIVE');
  return amount;
}
export function formatAtomic(value, decimals) {
  need(typeof value === 'string' && /^[0-9]+$/.test(value) && Number.isInteger(decimals) && decimals >= 0 && decimals <= 30, 'ATOMIC_AMOUNT_INVALID');
  if (decimals === 0) return value;
  const padded = value.padStart(decimals + 1, '0');
  return padded.slice(0, -decimals) + '.' + padded.slice(-decimals);
}
export function validateConfig(input, { allowLoopback = false } = {}) {
  need(object(input), 'CONFIG_REQUIRED');
  const config = safeClone(input);
  need(UUID.test(config.tenantId), 'TENANT_ID_INVALID');
  const origin = new URL(config.publicOrigin);
  need(origin.origin === config.publicOrigin && !origin.username && !origin.password && !origin.search && !origin.hash, 'PUBLIC_ORIGIN_INVALID');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  need(origin.protocol === 'https:' || allowLoopback && loopback && origin.protocol === 'http:', 'PUBLIC_HTTPS_ORIGIN_REQUIRED');
  const template = config.template;
  need(object(template) && UUID.test(template.resourceId) && UUID.test(template.resourceVersionId), 'RESOURCE_TEMPLATE_ID_INVALID');
  need(Number.isSafeInteger(template.resourceVersion) && template.resourceVersion >= 1, 'RESOURCE_VERSION_INVALID');
  need(template.feeMode === 'buyer_pays', 'BUYER_PAYS_TEMPLATE_REQUIRED');
  need(template.fulfillmentMode === 'webhook', 'WEBHOOK_TEMPLATE_REQUIRED');
  need(Number.isInteger(template.expiresInSeconds) && template.expiresInSeconds >= 30 && template.expiresInSeconds <= 3600, 'CHARGE_EXPIRY_INVALID');
  need(Array.isArray(template.rails) && template.rails.length >= 1 && template.rails.length <= 16, 'CONFIGURED_RAILS_REQUIRED');
  const ids = new Set();
  for (const rail of template.rails) {
    need(object(rail) && typeof rail.assetId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(rail.assetId) && !ids.has(rail.assetId), 'ASSET_ID_INVALID');
    ids.add(rail.assetId);
    for (const key of ['network', 'asset', 'recipient', 'label']) exactText(rail[key], 'RAIL_' + key.toUpperCase() + '_INVALID', 256);
    need(Number.isSafeInteger(rail.assetVersion) && rail.assetVersion >= 1 && Number.isSafeInteger(rail.walletVersion) && rail.walletVersion >= 1, 'RAIL_VERSION_INVALID');
    need(Number.isInteger(rail.decimals) && rail.decimals >= 0 && rail.decimals <= 30, 'RAIL_DECIMALS_INVALID');
    need(Number.isSafeInteger(rail.maxTimeoutSeconds) && rail.maxTimeoutSeconds >= template.expiresInSeconds, 'RAIL_TIMEOUT_INVALID');
  }
  need(object(config.webhook) && UUID.test(config.webhook.endpointId), 'WEBHOOK_ENDPOINT_REQUIRED');
  need(object(config.receiptFingerprintsByVersion) && Object.keys(config.receiptFingerprintsByVersion).length > 0, 'RECEIPT_PINS_REQUIRED');
  for (const [version, fingerprint] of Object.entries(config.receiptFingerprintsByVersion))
    need(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version) && HASH.test(fingerprint), 'RECEIPT_PIN_INVALID');
  exactText(config.receiptPinSource, 'RECEIPT_PIN_SOURCE_REQUIRED', 2048);
  exactText(config.fulfillmentBinding, 'FULFILLMENT_BINDING_REQUIRED', 256);
  config.maxResultBytes ??= 64 * 1024 * 1024;
  need(Number.isSafeInteger(config.maxResultBytes) && config.maxResultBytes >= 1 && config.maxResultBytes <= 1024 * 1024 * 1024, 'RESULT_LIMIT_INVALID');
  return config;
}
export class MerchantResult extends VerifiedFile {
  constructor(metadata) { super(); this.metadata = Object.freeze(safeClone(metadata)); }
  _metadata() { return this.metadata; }
}
export async function openMerchantWorkspace({ directory, config: input, provider, credential, webhookSecretsByVersion, fulfillment, allowLoopback = false, clock = () => Date.now() }) {
  need(typeof directory === 'string' && isAbsolute(directory), 'ABSOLUTE_PRIVATE_DIRECTORY_REQUIRED');
  const config = validateConfig(input, { allowLoopback });
  need(object(webhookSecretsByVersion) && Object.keys(webhookSecretsByVersion).length > 0, 'WEBHOOK_SECRETS_REQUIRED');
  need(fulfillment && typeof fulfillment.fulfill === 'function' && typeof fulfillment.reconcile === 'function', 'FULFILLMENT_AND_RECONCILE_REQUIRED');
  const upstream = provider ?? createProvider({ origin: config.providerOrigin ?? 'https://api.x402api.com', credential, allowLoopback });
  const store = await MerchantStore.open(resolve(directory));
  try {
    await mkdir(join(store.directory, 'results'), { recursive: true, mode: 0o700 });
    return new MerchantWorkspace({ store, config, upstream, webhookSecretsByVersion, fulfillment, clock });
  } catch (error) { await store.close(); throw error; }
}
/** Open saved invoices with the same complete projection and file reader.
 * The facade has no payment or handler entry points; SQLite also enforces
 * read-only mode beneath every retained business record.
 */
export async function openMerchantReview({ directory, config: input, allowLoopback = false }) {
  need(typeof directory === 'string' && isAbsolute(directory), 'ABSOLUTE_PRIVATE_DIRECTORY_REQUIRED');
  const config = validateConfig(input, { allowLoopback });
  const store = await MerchantStore.open(resolve(directory), { readOnly: true });
  const view = new MerchantWorkspace({ store, config, upstream: null,
    webhookSecretsByVersion: {}, fulfillment: null, clock: () => Date.now() });
  return Object.freeze({ store, config: view.config, readOnly: true,
    publicConfig: view.publicConfig.bind(view), listOrders: view.listOrders.bind(view),
    inspect: view.inspect.bind(view), envelope: view.envelope.bind(view),
    result: view.result.bind(view), tick: async () => undefined, close: view.close.bind(view) });
}
export class MerchantWorkspace {
  constructor({ store, config, upstream, webhookSecretsByVersion, fulfillment, clock }) {
    this.store = store; this.config = config; this.upstream = upstream;
    this.webhookSecretsByVersion = webhookSecretsByVersion; this.fulfillment = fulfillment; this.clock = clock;
    this.locks = new Map(); this.returned = new Map(); this.providerReturns = new Map(); this.closing = false;
  }
  _now() { return new Date(this.clock()).toISOString(); }
  async _serial(id, work) {
    need(!this.closing, 'WORKSPACE_CLOSING', 503);
    const previous = this.locks.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    this.locks.set(id, current);
    try { return await current; }
    finally { if (this.locks.get(id) === current) this.locks.delete(id); }
  }
  _order(id) { need(UUID.test(id), 'ORDER_ID_INVALID'); const order = this.store.getOrder(id, { private: true }); need(order, 'ORDER_NOT_FOUND', 404); return order; }
  _update(id, set, kind, data = {}) { return this.store.updateOrder(id, { set, kind, data }); }
  publicConfig() {
    return { tenantId: this.config.tenantId, publicOrigin: this.config.publicOrigin,
      template: safeClone(this.config.template), maxResultBytes: this.config.maxResultBytes,
      receiptSigningKeyVersions: Object.keys(this.config.receiptFingerprintsByVersion) };
  }
  _view(id) {
    const privateOrder = this._order(id), order = this.store.getOrder(id, { private: false });
    return { ...order, chargeId: privateOrder.charge?.charge_id ?? null, providerOrderId: privateOrder.charge?.order_id ?? null,
      expiresAt: privateOrder.charge?.expires_at ?? null, nextActionAt: privateOrder.nextActionAt ?? null,
      lastError: privateOrder.lastError ?? null, receiptVerification: privateOrder.receiptVerification ?? null,
      result: privateOrder.result ? { bytes: privateOrder.result.bytes, sha256: privateOrder.result.sha256,
        contentType: privateOrder.result.contentType, fileName: privateOrder.result.fileName } : null };
  }
  listOrders() { return this.store.listOrders({}).map(order => this._view(order.id)); }
  inspect(id) {
    const order = this._view(id);
    const history = this.store.history(id).map(item => {
      const selected = {};
      for (const key of ['status','httpStatus','code','paymentId','chargeId','providerOrderId','deliveryId','bytes','sha256','state','responseComplete'])
        if (Object.hasOwn(item.data, key)) selected[key] = item.data[key];
      if (item.exchange) Object.assign(selected, { status: item.exchange.status, responseComplete: item.exchange.responseComplete,
        bytes: item.exchange.raw?.byteLength ?? 0, sha256: item.exchange.rawSha256, code: item.exchange.error?.code ?? null });
      return { sequence: item.sequence, kind: item.kind, createdAt: item.createdAt, details: selected };
    });
    return { order, history };
  }
  async createOrder({ id = randomUUID(), reference, title, prices }) {
    need(UUID.test(id), 'ORDER_ID_INVALID');
    exactText(reference, 'ORDER_REFERENCE_INVALID', 120); exactText(title, 'ORDER_TITLE_INVALID', 180);
    need(Array.isArray(prices) && prices.length >= 1 && prices.length <= 16, 'ORDER_PRICES_REQUIRED');
    const seen = new Set();
    const selectedPrices = prices.map(price => {
      need(object(price) && typeof price.assetId === 'string' && !seen.has(price.assetId), 'ORDER_ASSET_DUPLICATE');
      seen.add(price.assetId);
      need(typeof price.amountAtomic === 'string' && ATOMIC.test(price.amountAtomic), 'ORDER_PRICE_INVALID');
      return { assetId: price.assetId, amountAtomic: price.amountAtomic };
    });
    return this._serial(id, async () => {
      let existing;
      try { existing = this._order(id); } catch (error) { if (error.status !== 404) throw error; }
      if (existing) {
        const originalPrices = existing.frozen.rails.map(rail => ({ assetId: rail.assetId, amountAtomic: rail.amountAtomic }));
        need(existing.reference === reference && existing.title === title && JSON.stringify(selectedPrices) === JSON.stringify(originalPrices),
          'ORIGINAL_INVOICE_DETAILS_CHANGED', 409);
        return this._view(id);
      }
      const rails = selectedPrices.map(price => {
        const rail = this.config.template.rails.find(item => item.assetId === price.assetId);
        need(rail, 'ORDER_PRICE_INVALID');
        return { ...rail, amountAtomic: price.amountAtomic };
      });
      const requestBody = jsonBytes({ order_id: id, reference });
      const request = { method: 'POST', url: this.config.publicOrigin + '/orders/' + id + '/pay', contentType: 'application/json', bodyBase64: requestBody.toString('base64') };
      const frozen = { tenantId: this.config.tenantId, template: safeClone(this.config.template), fulfillmentBinding: this.config.fulfillmentBinding, rails, request };
      const body = { resource_version_id: frozen.template.resourceVersionId, method: request.method, resource_url: request.url,
        body_base64: request.bodyBase64, content_type: request.contentType, description: title,
        prices: rails.map(rail => ({ asset_id: rail.assetId, amount_atomic: rail.amountAtomic })),
        expires_in_seconds: frozen.template.expiresInSeconds, metadata: { merchant_order_id: id } };
      this.store.createOrder({ id, reference, title, frozen, chargeRequestBytes: jsonBytes(body), chargeIdempotencyKey: 'charge:' + id });
      return this._view(id);
    });
  }
  async _exchange(id, kind, invoke) {
    const key = id + '\n' + kind;
    let pending = this.providerReturns.get(key);
    if (!pending) {
      // Capture the original journal boundary before dispatch. A returned
      // response stays in this owner until its exact exchange is durable.
      const before = this.store.history(id);
      const beforeSequence = before.at(-1)?.sequence ?? 0;
      let response;
      try {
        response = await invoke();
        need(response && Number.isInteger(response.status), 'PROVIDER_RESPONSE_INVALID', 502);
      } catch (error) {
        this.store.appendExchange(id, { kind, status: null, headers: {}, raw: Buffer.alloc(0), responseComplete: false, error: { code: code(error) } });
        throw error;
      }
      pending = { id, kind, beforeSequence, response };
      this.providerReturns.set(key, pending);
    }
    const response = pending.response;
    pending.journal ??= { kind, status: response.status, headers: safeClone(response.headers ?? {}),
      raw: Buffer.from(response.raw ?? []), responseComplete: response.responseComplete === true,
      error: response.error ? safeClone(response.error) : null };
    const original = pending.journal;
    // appendExchange can commit and then report a filesystem sync error.
    // Reopen that exact return instead of appending it twice or calling HTTP.
    const saved = this.store.history(id).find(item => item.sequence > pending.beforeSequence &&
      item.exchange?.kind === kind && item.exchange.status === original.status &&
      item.exchange.responseComplete === original.responseComplete &&
      item.exchange.raw !== null && equalBytes(item.exchange.raw, original.raw) &&
      canonicalJson(item.exchange.headers) === canonicalJson(original.headers) &&
      canonicalJson(item.exchange.error) === canonicalJson(original.error));
    const exchange = saved?.exchange ?? this.store.appendExchange(id, original);
    this.providerReturns.delete(key);
    return { ...response, exchangeId: exchange.id };
  }
  _terminalPaymentResponse(id) {
    const pending = this.providerReturns.get(id + '\nsubmit_payment');
    const history = this.store.history(id);
    // An observed successful settlement takes precedence over a later
    // conflicting replay. None of these terminal responses permits another POST.
    for (const status of [200, 409, 400, 402]) {
      if (pending?.response.status === status) return { pending: true, response: pending.response };
      const retained = history.find(item => item.exchange?.kind === 'submit_payment' && item.exchange.status === status)?.exchange;
      if (!retained) continue;
      let json = null, parseError = null;
      if (retained.responseComplete && retained.raw?.length) {
        try { json = parseJSONBytes(retained.raw, { maximumBytes: 16 * 1024 * 1024 }); }
        catch { parseError = { code: 'X402API_RESPONSE_JSON_INVALID' }; }
      }
      return { pending: false, response: { status, raw: retained.raw ?? Buffer.alloc(0),
        json, parseError, headers: retained.headers, responseComplete: retained.responseComplete,
        error: retained.error, exchangeId: retained.id } };
    }
    return null;
  }
  _later(id, state, response, errorCode) {
    this._update(id, { state, nextActionAt: dueDate(response?.headers?.retryAfter, this.clock()),
      lastError: errorCode ? { code: errorCode, at: this._now(), httpStatus: response?.status ?? null } : null },
    'reconciliation_scheduled', { state, httpStatus: response?.status ?? null });
    return this._view(id);
  }
  _validateCharge(order, charge) {
    need(object(charge) && UUID.test(charge.charge_id) && UUID.test(charge.order_id) && HASH.test(charge.charge_digest), 'CHARGE_IDENTITY_INVALID', 502);
    need(charge.resource_version_id === order.frozen.template.resourceVersionId && typeof charge.payment_identifier === 'string' && charge.payment_identifier.length <= 1024, 'CHARGE_TEMPLATE_MISMATCH', 502);
    need(Number.isFinite(Date.parse(charge.expires_at)) && object(charge.payment_required) && typeof charge.payment_required_header === 'string', 'CHARGE_TERMS_INVALID', 502);
    need(charge.payment_required_header.length <= 65536 && !/[\r\n]/.test(charge.payment_required_header), 'CHARGE_HEADER_INVALID', 502);
    const required = charge.payment_required;
    need(required.x402Version === 2 && required.resource?.url === order.frozen.request.url && Array.isArray(required.accepts) && required.accepts.length > 0, 'CHARGE_REQUEST_MISMATCH', 502);
    need(Array.isArray(charge.prices) && charge.prices.length === order.frozen.rails.length, 'CHARGE_PRICES_MISMATCH', 502);
    for (const rail of order.frozen.rails) {
      const price = charge.prices.filter(item => item.asset_id === rail.assetId);
      need(price.length === 1 && price[0].amount_atomic === rail.amountAtomic, 'CHARGE_PRICE_CHANGED', 502);
    }
    for (const offer of required.accepts) {
      const matching = order.frozen.rails.filter(rail => rail.network === offer.network && rail.asset === offer.asset && rail.recipient === offer.payTo && rail.amountAtomic === offer.amount);
      need(offer.scheme === 'exact' && matching.length === 1 && Number.isSafeInteger(offer.maxTimeoutSeconds) && offer.maxTimeoutSeconds > 0 && offer.maxTimeoutSeconds <= matching[0].maxTimeoutSeconds, 'CHARGE_ALTERNATIVE_MISMATCH', 502);
      selectChargePrice({ charge, rail: matching[0], resourceVersionId: order.frozen.template.resourceVersionId, resourceUrl: order.frozen.request.url });
    }
    return charge;
  }
  async createCharge(id) { return this._serial(id, () => this._createCharge(id)); }
  async _createCharge(id) {
    const order = this._order(id);
    if (order.charge) return this._view(id);
    need(!TERMINAL.has(order.state), 'ORDER_TERMINAL', 409);
    this._update(id, { state: 'CHARGE_UNCERTAIN', lastError: null }, 'charge_started', {});
    let response;
    try { response = await this._exchange(id, 'create_charge', () => this.upstream.createCharge({ bodyBytes: order.chargeRequestBytes, idempotencyKey: order.chargeIdempotencyKey })); }
    catch (error) { return this._later(id, 'CHARGE_UNCERTAIN', null, code(error)); }
    if (!response.responseComplete) return this._later(id, 'CHARGE_UNCERTAIN', response, 'CHARGE_RESPONSE_INCOMPLETE');
    if (response.status === 200 || response.status === 201) {
      try {
        const charge = this._validateCharge(order, response.json);
        this._update(id, { state: 'AWAITING_PAYMENT', charge, nextActionAt: null, lastError: null }, 'charge_created', { chargeId: charge.charge_id, providerOrderId: charge.order_id });
        return this._view(id);
      } catch (error) { return this._later(id, 'CHARGE_UNCERTAIN', response, code(error)); }
    }
    if ([400, 401, 403, 404, 422].includes(response.status)) {
      this._update(id, { state: 'CHARGE_REJECTED', nextActionAt: null, lastError: { code: 'CHARGE_REJECTED', httpStatus: response.status, at: this._now() } }, 'charge_rejected', { status: response.status });
      return this._view(id);
    }
    return this._later(id, 'CHARGE_UNCERTAIN', response, response.status === 409 ? 'CHARGE_IDEMPOTENCY_CONFLICT' : 'CHARGE_RECONCILIATION_REQUIRED');
  }
  envelope(id) {
    const order = this._order(id); need(order.charge, 'CHARGE_NOT_READY', 409);
    return { version: 1, method: order.frozen.request.method, url: order.frozen.request.url,
      contentType: order.frozen.request.contentType, bodyBase64: order.frozen.request.bodyBase64,
      paymentRequired: order.charge.payment_required_header, challengeDigest: order.charge.charge_digest,
      merchantReference: order.reference };
  }
  challenge(id) {
    const order = this._order(id); need(order.charge, 'CHARGE_NOT_READY', 409);
    return { status: 402, headers: { 'PAYMENT-REQUIRED': order.charge.payment_required_header, 'X-X402API-Challenge-Handle': order.charge.payment_identifier },
      body: { x402Version: 2, error: 'Payment required', orderId: order.charge.order_id, challengeId: order.charge.charge_id,
        challengeDigest: order.charge.charge_digest, challengeHandle: order.charge.payment_identifier, expiresAt: order.charge.expires_at } };
  }
  async submitAuthorization(id, signature) {
    exactText(signature, 'PAYMENT_SIGNATURE_INVALID', 65536);
    need(/^[\x21-\x7e]+$/.test(signature), 'PAYMENT_SIGNATURE_INVALID');
    return this._serial(id, async () => {
      const order = this._order(id); need(order.charge, 'CHARGE_NOT_READY', 409);
      this.store.retainSignature(id, signature);
      if (order.state === 'COMPLETE') return this._view(id);
      need(order.state !== 'PAYMENT_FAILED', 'PAYMENT_FAILED_REVIEW_ORIGINAL', 409);
      if (['SETTLEMENT_CONFIRMED', 'FULFILLMENT_PENDING', 'FULFILLMENT_INTERRUPTED'].includes(order.state) ||
          order.nextActionAt && Date.parse(order.nextActionAt) > this.clock()) return this._view(id);
      return this._submitAuthorization(id);
    });
  }
  async _submitAuthorization(id) {
    const order = this._order(id);
    need(order.signature, 'PAYMENT_SIGNATURE_REQUIRED', 409);
    const terminal = this._terminalPaymentResponse(id);
    let response;
    try {
      if (terminal && !terminal.pending) response = terminal.response;
      else {
        if (!terminal) this._update(id, { state: 'PAYMENT_UNCERTAIN', lastError: null }, 'payment_submission_started', {});
        response = await this._exchange(id, 'submit_payment', () => this.upstream.submitPayment({
          chargeId: order.charge.charge_id, paymentSignature: order.signature }));
      }
    } catch (error) {
      const known = this._terminalPaymentResponse(id);
      const state = known?.response.status === 200 ? 'SETTLEMENT_CONFIRMED' :
        known?.response.status === 409 ? 'FULFILLMENT_PENDING' :
        [400, 402].includes(known?.response.status) ? 'PAYMENT_FAILED' : 'PAYMENT_UNCERTAIN';
      return this._later(id, state, null, known ? 'PAYMENT_RESPONSE_RETENTION_PENDING' : code(error));
    }
    const header = response.headers?.paymentResponse ?? null;
    if ([200, 409, 400, 402].includes(response.status)) {
      const paymentId = response.responseComplete && object(response.json) && UUID.test(response.json.payment_id) ?
        response.json.payment_id : null;
      const mismatch = paymentId && order.paymentId && order.paymentId !== paymentId;
      const errorCode = mismatch ? 'PAYMENT_ID_CHANGED' : response.status === 400 ? 'PAYMENT_AUTHORIZATION_MALFORMED' :
        response.status === 402 ? 'PAYMENT_DEFINITIVELY_FAILED' : response.status === 409 ? 'PAYMENT_CONFLICT_RECONCILIATION_REQUIRED' :
        !response.responseComplete ? 'PAYMENT_TERMINAL_BODY_INCOMPLETE' : !paymentId ? 'PAYMENT_TERMINAL_IDENTITY_PENDING' : null;
      const state = order.state === 'COMPLETE' ? 'COMPLETE' : [400, 402].includes(response.status) ? 'PAYMENT_FAILED' :
        ['FULFILLMENT_PENDING', 'FULFILLMENT_INTERRUPTED'].includes(order.state) ? order.state :
        response.status === 200 ? 'SETTLEMENT_CONFIRMED' : 'FULFILLMENT_PENDING';
      const set = { state, terminalPaymentResponse: { status: response.status,
        responseComplete: response.responseComplete === true, rawSha256: sha(response.raw ?? Buffer.alloc(0)),
        exchangeId: response.exchangeId ?? null }, nextActionAt: [400, 402].includes(response.status) ? null : dueDate(response.headers?.retryAfter, this.clock()),
        lastError: errorCode ? { code: errorCode, httpStatus: response.status, at: this._now() } : null };
      if (header !== null) set.paymentResponse = header;
      if (paymentId && !mismatch) set.paymentId = paymentId;
      this._update(id, set, 'terminal_payment_response_retained', {
        status: response.status, paymentId: paymentId && !mismatch ? paymentId : order.paymentId ?? null,
        responseComplete: response.responseComplete === true });
      return this._view(id);
    }
    if (header !== null) this._update(id, { paymentResponse: header }, 'payment_response_header_retained', {});
    if (!response.responseComplete) return this._later(id, 'PAYMENT_UNCERTAIN', response, 'PAYMENT_RESPONSE_INCOMPLETE');
    if (object(response.json) && UUID.test(response.json.payment_id)) {
      need(!order.paymentId || order.paymentId === response.json.payment_id, 'PAYMENT_ID_CHANGED', 409);
      this._update(id, { paymentId: response.json.payment_id }, 'payment_identity_retained', { paymentId: response.json.payment_id });
    }
    if (response.status === 202) return this._later(id, 'PAYMENT_PENDING', response, null);
    return this._later(id, 'PAYMENT_UNCERTAIN', response, 'PAYMENT_RECONCILIATION_REQUIRED');
  }
  async paidRequest({ id, method, url, contentType, rawBody, paymentSignature }) {
    const order = this._order(id), expected = order.frozen.request;
    need(method === expected.method && url === expected.url && contentType?.trim() === expected.contentType && equalBytes(rawBody, Buffer.from(expected.bodyBase64, 'base64')), 'PROTECTED_REQUEST_CHANGED', 409);
    if (!paymentSignature) return this.challenge(id);
    await this.submitAuthorization(id, paymentSignature);
    const current = this._order(id);
    const headers = current.paymentResponse ? { 'PAYMENT-RESPONSE': current.paymentResponse } : {};
    if (current.state === 'COMPLETE') return { status: 200, headers, result: this.result(id) };
    if (current.state === 'PAYMENT_FAILED') return { status: current.lastError?.httpStatus === 400 ? 400 : 402, headers, body: { orderId: id, paymentId: current.paymentId ?? null, state: current.state, error: current.lastError?.code } };
    return { status: 202, headers: { ...headers, 'Retry-After': '10' }, body: { orderId: id, paymentId: current.paymentId ?? null, state: current.state, fulfillmentPending: true } };
  }
  acceptWebhook(rawBody, headers) {
    need(!this.closing, 'WORKSPACE_CLOSING', 503);
    const verified = verifyWebhook({ rawBody, headers, secretsByVersion: this.webhookSecretsByVersion,
      endpointId: this.config.webhook.endpointId, tenantId: this.config.tenantId, nowSeconds: Math.floor(this.clock() / 1000) });
    if (verified.kind === 'ownership') return { status: 200, body: verified.responseBody, accepted: false };
    if (verified.kind === 'test') {
      this.store.acceptEvent({ deliveryId: verified.deliveryId, orderId: null, kind: 'test', event: verified.event, raw: rawBody });
      this.store.finishEvent(verified.deliveryId, { state: 'COMPLETE', details: { signedTest: true } });
      return { status: 200, body: { accepted: true }, accepted: true };
    }
    const matches = this.store.listOrders({ private: true }).filter(order => order.charge?.order_id === verified.event.payload.order_id);
    need(matches.length === 1, 'WEBHOOK_ORDER_NOT_FOUND', 409);
    const order = this._order(matches[0].id), payload = verified.event.payload;
    need(payload.resource_version_id === order.frozen.template.resourceVersionId, 'WEBHOOK_RESOURCE_MISMATCH', 409);
    need(!order.paymentId || order.paymentId === payload.payment_id, 'WEBHOOK_PAYMENT_MISMATCH', 409);
    this.store.acceptEvent({ deliveryId: verified.deliveryId, orderId: order.id, kind: 'payment', event: verified.event, raw: rawBody });
    return { status: 200, body: { accepted: true }, accepted: true, orderId: order.id, deliveryId: verified.deliveryId };
  }
  _rail(order, event) {
    const payload = event.payload;
    const offers = order.charge.payment_required.accepts.filter(offer => offer.network === payload.network && offer.asset === payload.asset && offer.amount === payload.amount_atomic);
    need(offers.length === 1, 'WEBHOOK_ADVERTISED_ALTERNATIVE_MISMATCH', 409);
    const offer = offers[0];
    const rails = order.frozen.rails.filter(rail => rail.network === offer.network && rail.asset === offer.asset && rail.recipient === offer.payTo && rail.amountAtomic === offer.amount);
    need(rails.length === 1, 'WEBHOOK_FROZEN_RAIL_MISMATCH', 409);
    return rails[0];
  }
  async _retainProjection(order, kind, method, argument, field) {
    const response = await this._exchange(order.id, kind, () => method.call(this.upstream, argument));
    if (response.responseComplete && response.status === 200 && object(response.json)) {
      this._update(order.id, { [field]: response.json }, kind + '_retained', {});
      return response.json;
    }
    this._later(order.id, order.state === 'COMPLETE' ? 'COMPLETE' : 'FULFILLMENT_PENDING', response, kind.toUpperCase() + '_PENDING');
    return null;
  }
  async _processEvent(record) {
    const id = record.orderId;
    return this._serial(id, async () => {
      const currentEvent = this.store.getEvent(record.deliveryId);
      if (currentEvent?.state === 'COMPLETE' || currentEvent?.state === 'REJECTED') return;
      let order = this._order(id);
      const event = currentEvent.event, payload = event.payload;
      try {
        need(event.tenant.id === order.frozen.tenantId && payload.order_id === order.charge.order_id && payload.resource_version_id === order.frozen.template.resourceVersionId, 'EVENT_ORDER_BINDING_MISMATCH', 409);
        need(!order.paymentId || order.paymentId === payload.payment_id, 'EVENT_PAYMENT_BINDING_MISMATCH', 409);
        const rail = this._rail(order, event);
        this._update(id, { paymentId: payload.payment_id, state: order.state === 'COMPLETE' ? 'COMPLETE' : 'FULFILLMENT_PENDING' }, 'finalized_event_received', { deliveryId: record.deliveryId, paymentId: payload.payment_id });
        order = this._order(id);
        const providerOrder = await this._retainProjection(order, 'get_order', this.upstream.getOrder, { orderId: order.charge.order_id }, 'providerOrder');
        if (!providerOrder) return;
        const requestHash = providerOrderRequestHash(providerOrder, { orderId: order.charge.order_id,
          resourceVersionId: order.frozen.template.resourceVersionId, paymentIdentifier: order.charge.payment_identifier });
        const envelope = await this._retainProjection(order, 'get_receipt', this.upstream.getReceipt, { paymentId: payload.payment_id }, 'receipt');
        if (!envelope) return;
        const verified = verifyReceipt({ envelope, fingerprintsByVersion: this.config.receiptFingerprintsByVersion,
          expected: { tenantId: order.frozen.tenantId, orderId: order.charge.order_id, chargeId: order.charge.charge_id, paymentId: payload.payment_id,
            resourceId: order.frozen.template.resourceId, resourceVersion: order.frozen.template.resourceVersion,
            requestHash, recipient: rail.recipient, walletVersion: rail.walletVersion,
            network: rail.network, assetId: rail.assetId, assetVersion: rail.assetVersion, asset: rail.asset, amountAtomic: rail.amountAtomic,
            payer: payload.payer, transaction: payload.transaction, blockNumber: payload.block_number, blockHash: payload.block_hash } });
        this._update(id, { receiptVerification: { receiptDigest: verified.receiptDigest, signingKeyVersion: verified.signingKeyVersion,
          pinSource: this.config.receiptPinSource, verifiedAt: this._now(), deliveryId: record.deliveryId }, lastError: null },
        'receipt_verified', { receiptId: envelope.id, paymentId: payload.payment_id });
        await this._fulfill(this._order(id), event, verified.receipt);
        if (this._order(id).state === 'COMPLETE') this.store.finishEvent(record.deliveryId, { state: 'COMPLETE', details: { paymentId: payload.payment_id } });
      } catch (error) {
        const permanent = ['EVENT_ORDER_BINDING_MISMATCH', 'EVENT_PAYMENT_BINDING_MISMATCH', 'WEBHOOK_ADVERTISED_ALTERNATIVE_MISMATCH', 'WEBHOOK_FROZEN_RAIL_MISMATCH'].includes(code(error));
        this.store.finishEvent(record.deliveryId, { state: permanent ? 'REJECTED' : 'PENDING', details: { code: code(error), at: this._now() } });
        const state = this._order(id).state;
        this._later(id, state === 'COMPLETE' ? state : state === 'FULFILLMENT_INTERRUPTED' ? state : 'FULFILLMENT_PENDING', null, code(error));
        if (permanent) this._update(id, { nextActionAt: null }, 'event_rejected', { deliveryId: record.deliveryId, code: code(error) });
      }
    });
  }
  async _saveReturnedResult(job) {
    // Called only inside this order's _serial scope while MerchantStore holds
    // its original kernel lease. The durable RETURNED row owns these bytes.
    need(job && UUID.test(job.paymentId) && job.state === 'RETURNED' &&
      job.bytes instanceof Uint8Array && job.bytes.byteLength === job.byteLength &&
      sha(job.bytes) === job.sha256, 'ORIGINAL_RETURN_REQUIRED', 500);
    const selectedFields = ['orderId', 'byteLength', 'sha256', 'contentType', 'fileName'];
    const checkOwner = () => {
      const selected = this.store.getFulfillment(job.paymentId);
      need(selected?.state === 'RETURNED' && selectedFields.every(key => selected[key] === job[key]),
        'ORIGINAL_RETURN_CHANGED', 500);
    };
    checkOwner();
    const base = join(this.store.directory, 'results');
    const folder = join(base, job.paymentId);
    const destination = join(folder, fileName(job.fileName));
    const metadata = { path: destination, bytes: job.byteLength, sha256: job.sha256,
      contentType: job.contentType, fileName: job.fileName };
    const uid = process.getuid?.();
    const same = (a, b) => ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs']
      .every(key => a[key] === b[key]);
    const privateFile = (info, singleLink = true) => info.isFile() && !(info.mode & 0o077n) &&
      (!singleLink || info.nlink === 1n) && (uid === undefined || info.uid === BigInt(uid));
    async function originalDirectory(path) {
      try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
        const held = await handle.stat({ bigint: true }), named = await lstat(path, { bigint: true });
        need(held.isDirectory() && named.isDirectory() && !named.isSymbolicLink() &&
          held.dev === named.dev && held.ino === named.ino && !(held.mode & 0o077n) &&
          (uid === undefined || held.uid === BigInt(uid)) && await realpath(path) === path,
          'RESULT_DIRECTORY_CHANGED', 500);
        await handle.sync();
        await syncDirectory(dirname(path));
        return { path, handle, held };
      } catch (error) { await handle.close(); throw error; }
    }
    const baseDirectory = await originalDirectory(base);
    let resultDirectory;
    try {
      resultDirectory = await originalDirectory(folder);
      const sameDirectory = async () => {
        const held = await resultDirectory.handle.stat({ bigint: true });
        const named = await lstat(folder, { bigint: true });
        need(held.isDirectory() && named.isDirectory() && !named.isSymbolicLink() &&
          held.dev === resultDirectory.held.dev && held.ino === resultDirectory.held.ino &&
          named.dev === held.dev && named.ino === held.ino &&
          !(held.mode & 0o077n) && (uid === undefined || held.uid === BigInt(uid)) &&
          await realpath(folder) === folder, 'RESULT_DIRECTORY_CHANGED', 500);
      };
      const unchanged = async (handle, path, before, singleLink = true) => {
        const held = await handle.stat({ bigint: true }), named = await lstat(path, { bigint: true });
        need(privateFile(held, singleLink) && privateFile(named, singleLink) && same(before, held) && same(before, named),
          'RESULT_RESERVATION_CHANGED', 500);
      };
      const readExactly = async (handle, size) => {
        const bytes = Buffer.alloc(size); let at = 0;
        while (at < bytes.length) {
          const { bytesRead } = await handle.read(bytes, at, bytes.length - at, at);
          need(bytesRead > 0, 'RESULT_RESERVATION_CHANGED', 500);
          at += bytesRead;
        }
        return bytes;
      };
      const adoptFinal = async () => {
        let handle;
        try { handle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW); }
        catch (error) { if (error.code === 'ENOENT') return false; throw error; }
        try {
          const before = await handle.stat({ bigint: true });
          // SF31 can be stopped after its final hard link but before removing
          // the matching partial. A fully verified final file may have two links.
          need(privateFile(before, false) && before.size === BigInt(job.byteLength),
            'RESULT_FILE_CHANGED', 500);
          const hash = createHash('sha256');
          const buffer = Buffer.allocUnsafe(Math.min(1048576, Math.max(1, job.byteLength)));
          let position = 0;
          while (position < job.byteLength) {
            const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, job.byteLength - position), position);
            need(bytesRead > 0, 'RESULT_FILE_CHANGED', 500);
            hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
          }
          need(hash.digest('hex') === job.sha256, 'RESULT_FILE_CHANGED', 500);
          await unchanged(handle, destination, before, false);
          await sameDirectory();
          checkOwner();
          await handle.sync();
          await resultDirectory.handle.sync();
          return true;
        } finally { await handle.close(); }
      };
      if (await adoptFinal()) return metadata;
      const lockPath = join(folder, '.' + basename(destination) + '.x402-download.lock');
      let reservation;
      try { reservation = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (reservation) {
        let partial;
        try {
          const before = await reservation.stat({ bigint: true });
          need(privateFile(before) && before.size >= 0n && before.size <= 8192n,
            'RESULT_RESERVATION_REQUIRES_RECONCILIATION', 409);
          if (before.size === 0n) {
            // SF31 creates this exact destination-derived empty lock before it
            // can record its tag. The private payment directory, held merchant
            // lease and durable RETURNED row establish this original owner.
            // No unbound partial or nonempty reservation is selected here.
            await unchanged(reservation, lockPath, before);
            await sameDirectory();
            checkOwner();
            await unlink(lockPath);
            await resultDirectory.handle.sync();
          } else {
            const raw = await readExactly(reservation, Number(before.size));
            let original;
            try { original = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
            catch { throw new MerchantError('RESULT_RESERVATION_REQUIRES_RECONCILIATION', 409); }
            need(object(original) &&
              Object.keys(original).length === 4 &&
              ['destination', 'partialPath', 'pid', 'reservationTag'].every(key => Object.hasOwn(original, key)) &&
              original.destination === destination && original.reservationTag === job.paymentId &&
              Number.isSafeInteger(original.pid) && original.pid > 0 &&
              typeof original.partialPath === 'string' && dirname(original.partialPath) === folder &&
              original.partialPath === join(folder, basename(original.partialPath)) &&
              /^\.x402-response-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.partial$/.test(basename(original.partialPath)) &&
              equalBytes(raw, Buffer.from(JSON.stringify(original) + '\n')),
              'RESULT_RESERVATION_REQUIRES_RECONCILIATION', 409);
            await unchanged(reservation, lockPath, before);
            try { partial = await open(original.partialPath, constants.O_RDONLY | constants.O_NOFOLLOW); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (partial) {
              const observed = await partial.stat({ bigint: true });
              need(privateFile(observed) && observed.size <= BigInt(job.byteLength),
                'RESULT_RESERVATION_PARTIAL_CHANGED', 409);
              let position = 0;
              const size = Number(observed.size);
              const buffer = Buffer.allocUnsafe(Math.min(1048576, Math.max(1, size)));
              while (position < size) {
                const { bytesRead } = await partial.read(buffer, 0, Math.min(buffer.length, size - position), position);
                need(bytesRead > 0 && equalBytes(buffer.subarray(0, bytesRead), job.bytes.subarray(position, position + bytesRead)),
                  'RESULT_RESERVATION_PARTIAL_CHANGED', 409);
                position += bytesRead;
              }
              await unchanged(partial, original.partialPath, observed);
              await unchanged(reservation, lockPath, before);
              await sameDirectory();
              checkOwner();
              await unlink(original.partialPath);
              await resultDirectory.handle.sync();
            }
            // A previous recovery may already have removed the matching partial.
            // The exact original reservation remains the authority for this unlink.
            await unchanged(reservation, lockPath, before);
            await sameDirectory();
            checkOwner();
            await unlink(lockPath);
            await resultDirectory.handle.sync();
          }
        } finally {
          try { if (partial) await partial.close(); }
          finally { await reservation.close(); }
        }
      }
      await sameDirectory();
      checkOwner();
      // A final file that survived the original publication always wins.
      if (await adoptFinal()) return metadata;
      const writer = await prepareBuyerResponseFile({ destination,
        maxBytes: Math.max(this.config.maxResultBytes, job.byteLength), expectedBytes: job.byteLength,
        expectedSha256: job.sha256, expectedContentType: job.contentType, reservationTag: job.paymentId });
      const saved = await writer.saveBytes(job.bytes, { contentType: job.contentType });
      need(saved.path === destination && saved.bytes === job.byteLength && saved.sha256 === job.sha256 &&
        saved.contentType === job.contentType, 'RESULT_FILE_METADATA_CHANGED', 500);
      need(await adoptFinal(), 'RESULT_FILE_MISSING', 500);
      return metadata;
    } finally {
      try { if (resultDirectory) await resultDirectory.handle.close(); }
      finally { await baseDirectory.handle.close(); }
    }
  }
  async _fulfill(order, event, receipt) {
    const paymentId = order.paymentId;
    this.store.claimFulfillment(order.id, paymentId);
    let job = this.store.getFulfillment(paymentId, { private: true });
    if (job.state === 'COMPLETE') {
      await new MerchantResult(job.resultFile).verify();
      this._update(order.id, { state: 'COMPLETE', result: job.resultFile, nextActionAt: null, lastError: null }, 'saved_result_reused', { paymentId });
      return;
    }
    if (job.state !== 'RETURNED') {
      let returned = this.returned.get(paymentId);
      if (!returned) {
        let started;
        const context = { order: this.store.getOrder(order.id, { private: false }), payment: { id: paymentId },
          receipt: safeClone(receipt), event: safeClone(event), idempotencyKey: paymentId };
        try {
          started = this.store.beginFulfillment(paymentId);
          need(started.claimed, 'FULFILLMENT_ALREADY_RUNNING', 409);
          if (started.reconcileRequired) {
            const outcome = await this.fulfillment.reconcile(context);
            need(outcome && ['complete', 'pending', 'absent'].includes(outcome.state), 'FULFILLMENT_RECONCILE_SHAPE_INVALID', 500);
            if (outcome.state === 'pending') {
              this.store.failFulfillment(paymentId, { code: 'FULFILLMENT_RECONCILIATION_PENDING' });
              this._later(order.id, 'FULFILLMENT_INTERRUPTED', null, 'FULFILLMENT_RECONCILIATION_PENDING');
              return;
            }
            returned = outcome.state === 'complete' ? outcome.result : await this.fulfillment.fulfill(context);
          } else {
            need(started.started, 'FULFILLMENT_ALREADY_RUNNING', 409);
            returned = await this.fulfillment.fulfill(context);
          }
          need(returned && returned.bytes instanceof Uint8Array && returned.bytes.byteLength <= this.config.maxResultBytes, 'FULFILLMENT_RESULT_BYTES_INVALID', 500);
          returned = { bytes: Buffer.from(returned.bytes), contentType: mime(returned.contentType ?? 'application/octet-stream'),
            fileName: fileName(returned.fileName ?? 'result.bin') };
          this.returned.set(paymentId, returned);
        } catch (error) {
          this.store.failFulfillment(paymentId, { code: code(error) });
          this._later(order.id, 'FULFILLMENT_INTERRUPTED', null, code(error));
          throw error;
        }
      }
      try { this.store.retainFulfillmentReturn(paymentId, returned); }
      catch (error) {
        // A post-COMMIT sync error can leave the original return already saved.
        // Keep the successful in-memory return until that exact record is read.
        const current = this.store.getFulfillment(paymentId, { private: true });
        if (!['RETURNED', 'COMPLETE'].includes(current.state)) {
          this._later(order.id, 'FULFILLMENT_PENDING', null, 'RETURN_STORAGE_PENDING');
          throw error;
        }
        need(current.sha256 === sha(returned.bytes) && current.byteLength === returned.bytes.length &&
          current.contentType === returned.contentType && current.fileName === returned.fileName,
          'RETURNED_RESULT_CHANGED', 500);
      }
      job = this.store.getFulfillment(paymentId, { private: true });
      this.returned.delete(paymentId);
    }
    const metadata = await this._saveReturnedResult(job);
    this.store.completeFulfillment(paymentId, metadata);
    this._update(order.id, { state: 'COMPLETE', result: metadata, nextActionAt: null, lastError: null }, 'fulfillment_completed', { paymentId, bytes: metadata.bytes, sha256: metadata.sha256 });
  }
  async reconcile(id) {
    await this._serial(id, async () => {
      let order = this._order(id);
      if (order.state === 'COMPLETE') { await this.result(id).verify(); return; }
      if (order.nextActionAt && Date.parse(order.nextActionAt) > this.clock()) return;
      if (!order.charge) { await this._createCharge(id); order = this._order(id); }
      const retainedTerminal = order.signature && !order.terminalPaymentResponse ? this._terminalPaymentResponse(id) : null;
      if (order.charge && order.signature && (retainedTerminal || ['PAYMENT_PENDING', 'PAYMENT_UNCERTAIN', 'AWAITING_PAYMENT'].includes(order.state))) await this._submitAuthorization(id);
      order = this._order(id);
      if (!order.paymentId && [200, 409].includes(order.terminalPaymentResponse?.status) && order.state !== 'COMPLETE') {
        const chargeProjection = await this._retainProjection(order, 'get_charge', this.upstream.getCharge, { chargeId: order.charge.charge_id }, 'providerCharge');
        if (!chargeProjection) return;
        await this._retainProjection(this._order(id), 'get_order', this.upstream.getOrder, { orderId: order.charge.order_id }, 'providerOrder');
      }
      if (order.paymentId && !['PAYMENT_FAILED', 'COMPLETE'].includes(order.state)) {
        await this._retainProjection(order, 'get_payment', this.upstream.getPayment, { paymentId: order.paymentId }, 'providerPayment');
      }
    });
    const current = this._order(id);
    if (!current.nextActionAt || Date.parse(current.nextActionAt) <= this.clock())
      for (const event of this.store.pendingEvents().filter(item => item.orderId === id)) await this._processEvent(event);
    return this.inspect(id);
  }
  async tick() {
    if (this.closing) return;
    const now = this.clock();
    const orders = this.store.listOrders({ private: true }).filter(order => ACTIVE.has(order.state) && (!order.nextActionAt || Date.parse(order.nextActionAt) <= now));
    for (const order of orders) {
      if (this.closing) break;
      try { await this.reconcile(order.id); }
      catch (error) { if (!this.closing) this._later(order.id, this._order(order.id).state, null, code(error)); }
    }
    for (const event of this.store.pendingEvents()) {
      if (this.closing) break;
      if (event.kind === 'payment' && !orders.some(order => order.id === event.orderId)) {
        const order = this._order(event.orderId);
        if (!order.nextActionAt || Date.parse(order.nextActionAt) <= now) await this._processEvent(event);
      }
    }
  }
  result(id) {
    const order = this._order(id); need(order.state === 'COMPLETE' && order.result, 'RESULT_NOT_READY', 409);
    return new MerchantResult(order.result);
  }
  async flushRetainedReturns() {
    // Keep the exclusive workspace lease while any actual provider return
    // still needs its original durable exchange record.
    for (const pending of [...this.providerReturns.values()]) {
      if (this.providerReturns.get(pending.id + '\n' + pending.kind) !== pending) continue;
      await this._exchange(pending.id, pending.kind, async () => {
        throw new MerchantError('ORIGINAL_PROVIDER_RETURN_REQUIRED', 503);
      });
    }
    for (const [paymentId, returned] of this.returned) {
      this.store.retainFulfillmentReturn(paymentId, returned);
      const saved = this.store.getFulfillment(paymentId, { private: true });
      need(['RETURNED', 'COMPLETE'].includes(saved.state) && saved.sha256 === sha(returned.bytes), 'RETURN_STORAGE_PENDING', 503);
      this.returned.delete(paymentId);
    }
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.locks.values()]);
    await this.flushRetainedReturns();
    await this.store.close();
  }
}
