// MIT. Tenant-only x402api transport; the workspace owns durable intent and retries.
// Contract: https://x402api.com/docs/payments/x402/programmatic-charges
import { createHash } from 'node:crypto';
import { parseJSONBytes } from './protocol.mjs';

export class ProviderError extends Error {
  constructor(code, { method = null, path = null, providerAttempted = false, uncertain = false } = {}) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
    this.method = method;
    this.path = path;
    this.providerAttempted = providerAttempted;
    this.uncertain = uncertain;
  }
}
const fail = (code, detail) => { throw new ProviderError(code, detail); };
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function headerValue(value, name, maximum) {
  if (typeof value !== 'string' || !value.length || value.length > maximum ||
      !/^[\x21-\x7e]+$/.test(value)) fail('X402API_' + name + '_INVALID');
  return value;
}
function endpointOrigin(value, allowLoopback) {
  let selected;
  try { selected = new URL(value); } catch { fail('X402API_ORIGIN_INVALID'); }
  if (typeof value !== 'string' || selected.username || selected.password ||
      selected.search || selected.hash || selected.pathname !== '/' ||
      !selected.hostname) fail('X402API_ORIGIN_INVALID');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(selected.hostname);
  if (selected.protocol !== 'https:' &&
      !(allowLoopback === true && loopback && selected.protocol === 'http:'))
    fail('X402API_HTTPS_ORIGIN_REQUIRED');
  return selected.origin;
}
function receiptHeaders(headers) {
  return {
    retryAfter: headers.get('retry-after'),
    paymentResponse: headers.get('payment-response'),
    contentType: headers.get('content-type'),
  };
}
function incomplete(code, raw, detail) {
  return { ...detail, raw, json: null, responseComplete: false, error: { code },
    uncertain: detail.method !== 'GET' };
}
async function readResponse(response, maximum, method, path) {
  const detail = { status: response.status, headers: receiptHeaders(response.headers), method, path };
  let reader;
  const chunks = [];
  let length = 0;
  try {
    if (response.body !== null) {
      if (typeof response.body?.getReader !== 'function')
        return incomplete('X402API_RESPONSE_STREAM_UNAVAILABLE', Buffer.alloc(0), detail);
      reader = response.body.getReader();
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        if (!(item.value instanceof Uint8Array))
          return incomplete('X402API_RESPONSE_CHUNK_INVALID', Buffer.concat(chunks, length), detail);
        const remaining = maximum - length;
        if (item.value.byteLength > remaining) {
          if (remaining) {
            chunks.push(Buffer.from(item.value.subarray(0, remaining)));
            length += remaining;
          }
          return incomplete('X402API_RESPONSE_TOO_LARGE', Buffer.concat(chunks, length), detail);
        }
        chunks.push(Buffer.from(item.value));
        length += item.value.byteLength;
      }
    }
  } catch {
    return incomplete('X402API_RESPONSE_READ_FAILED', Buffer.concat(chunks, length), detail);
  } finally {
    if (reader) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
    }
  }
  const raw = Buffer.concat(chunks, length);
  let json = null, parseError = null;
  if (raw.length) {
    try {
      json = parseJSONBytes(raw, { maximumBytes: maximum });
    } catch {
      parseError = { code: 'X402API_RESPONSE_JSON_INVALID' };
    }
  }
  return { ...detail, raw, json, responseComplete: true, parseError, uncertain: false };
}

/**
 * Each invocation performs exactly one HTTP request. Before calling either POST,
 * persist its complete request and original identity in the merchant workspace.
 * The returned raw Buffer is authoritative, including for HTTP failures. An
 * incomplete body can never serve as a successful provider result.
 */
export function createProvider({
  origin = 'https://api.x402api.com',
  credential,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
  maxResponseBytes = 1048576,
  allowLoopback = false,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('X402API_FETCH_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647)
    fail('X402API_TIMEOUT_INVALID');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 ||
      maxResponseBytes > 16 * 1024 * 1024) fail('X402API_RESPONSE_LIMIT_INVALID');
  if (typeof allowLoopback !== 'boolean') fail('X402API_LOOPBACK_SELECTION_INVALID');
  const base = endpointOrigin(origin, allowLoopback);
  const tenantCredential = headerValue(credential, 'TENANT_CREDENTIAL', 8192);

  async function request(method, path, { body, headers = {}, signal } = {}) {
    if (signal !== undefined &&
        (!signal || typeof signal.aborted !== 'boolean' ||
         typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))
      fail('X402API_ABORT_SIGNAL_INVALID');
    if (signal?.aborted) fail('X402API_REQUEST_ABORTED_BEFORE_DISPATCH', { method, path });
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    timer.unref?.();
    let attempted = false;
    try {
      if (signal?.aborted || controller.signal.aborted)
        fail('X402API_REQUEST_ABORTED_BEFORE_DISPATCH', { method, path });
      attempted = true;
      const response = await fetchImpl(base + path, {
        method,
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Authorization: 'Bearer ' + tenantCredential, ...headers },
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      });
      if (!response || !Number.isInteger(response.status) ||
          response.status < 100 || response.status > 599 ||
          typeof response.headers?.get !== 'function')
        fail('X402API_RESPONSE_INVALID', { method, path, providerAttempted: 'unknown',
          uncertain: method !== 'GET' });
      return await readResponse(response, maxResponseBytes, method, path);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      // Do not put URLs, credentials, authorizations or native error text into a
      // reusable error. A thrown network error cannot establish POST absence.
      fail(controller.signal.aborted ? 'X402API_REQUEST_INTERRUPTED' : 'X402API_TRANSPORT_FAILED', {
        method, path, providerAttempted: attempted ? 'unknown' : false,
        uncertain: attempted && method !== 'GET',
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({
    async createCharge({ bodyBytes, idempotencyKey, signal } = {}) {
      if (!Buffer.isBuffer(bodyBytes) || !bodyBytes.length ||
          bodyBytes.length > 2 * 1024 * 1024) fail('X402API_CHARGE_BODY_INVALID');
      const body = Buffer.from(bodyBytes);
      let value;
      try {
        value = parseJSONBytes(body, { maximumBytes: 2 * 1024 * 1024, integerNumbers: true });
      } catch { fail('X402API_CHARGE_JSON_INVALID'); }
      if (!value || typeof value !== 'object' || Array.isArray(value))
        fail('X402API_CHARGE_OBJECT_REQUIRED');
      const key = headerValue(idempotencyKey, 'IDEMPOTENCY_KEY', 160);
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) fail('X402API_IDEMPOTENCY_KEY_INVALID');
      const bodySha256 = createHash('sha256').update(body).digest('hex');
      const result = await request('POST', '/v1/charges', {
        body,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        signal,
      });
      return { ...result, requestBodyBytes: body.length,
        requestBodySha256: bodySha256 };
    },
    async submitPayment({ chargeId, paymentSignature, signal } = {}) {
      if (!uuid(chargeId)) fail('X402API_CHARGE_ID_INVALID');
      const signature = headerValue(paymentSignature, 'PAYMENT_SIGNATURE', 1024 * 1024);
      // No body or Content-Type is added. The provider already owns the frozen
      // protected merchant request; this header is its exact buyer authorization.
      return request('POST', '/v1/charges/' + chargeId + '/payments', {
        headers: { 'PAYMENT-SIGNATURE': signature }, signal,
      });
    },
    async getCharge({ chargeId, signal } = {}) {
      if (!uuid(chargeId)) fail('X402API_CHARGE_ID_INVALID');
      return request('GET', '/v1/charges/' + chargeId, { signal });
    },
    async getOrder({ orderId, signal } = {}) {
      if (!uuid(orderId)) fail('X402API_ORDER_ID_INVALID');
      return request('GET', '/v1/orders/' + orderId, { signal });
    },
    async getPayment({ paymentId, signal } = {}) {
      if (!uuid(paymentId)) fail('X402API_PAYMENT_ID_INVALID');
      return request('GET', '/v1/payments/' + paymentId, { signal });
    },
    async getReceipt({ paymentId, signal } = {}) {
      if (!uuid(paymentId)) fail('X402API_PAYMENT_ID_INVALID');
      return request('GET', '/v1/payments/' + paymentId + '/receipt', { signal });
    },
  });
}
