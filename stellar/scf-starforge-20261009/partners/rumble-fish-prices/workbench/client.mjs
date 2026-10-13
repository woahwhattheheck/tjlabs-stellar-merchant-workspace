import { WorkbenchError, validateBaseUrl } from './contract.mjs';

const KEPT_HEADERS = ['content-type', 'cache-control', 'date', 'etag', 'retry-after', 'x-amzn-requestid', 'x-amz-apigw-id', 'x-amzn-errortype'];
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export function nextQuotaPeriod(now = Date.now()) { const date = new Date(now); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString(); }
export function classifyResponse(status, body, headers = {}, now = Date.now()) {
  const message = typeof body?.message === 'string' ? body.message : '';
  const code = typeof body?.code === 'string' ? body.code : null;
  if (status >= 200 && status < 300) return { kind: 'success', retryable: false };
  if (status === 401 || status === 403) return { kind: 'key', code: 'KEY_REJECTED', message: 'The provider rejected this process API key. Check the existing key and owning process configuration.', retryable: false };
  if (status === 429) {
    if (/limit exceeded/iu.test(message) || /quotaexceeded/iu.test(headers['x-amzn-errortype'] ?? '')) return { kind: 'quota', code: 'MONTHLY_QUOTA', message: 'The provider reports that this key has used its monthly quota.', retryable: false, retryAt: nextQuotaPeriod(now) };
    let delay = 1000; const retry = headers['retry-after'];
    if (retry) { const seconds = Number(retry); delay = Number.isFinite(seconds) ? Math.max(1000, seconds * 1000) : Math.max(1000, Date.parse(retry) - now || 1000); }
    return { kind: 'rate', code: 'RATE_LIMITED', message: message || 'The provider rate limit was reached.', retryable: true, retryAfterMs: Math.min(delay, 86400000) };
  }
  if (status === 503 && code === 'quote_unavailable') return { kind: 'unavailable', code, message, retryable: false };
  if ([500, 502, 503, 504].includes(status)) return { kind: 'upstream', code: code ?? 'PROVIDER_UNAVAILABLE', message: message || 'The provider is temporarily unavailable.', retryable: true, retryAfterMs: 1000 };
  if (status === 404) return { kind: 'not_found', code: code ?? 'not_found', message: message || 'The provider has no result for this request.', retryable: false };
  return { kind: 'rejected', code: code ?? `HTTP_${status}`, message: message || `The provider returned HTTP ${status}.`, retryable: false };
}

export function createPricesClient({ baseUrl, apiKey, requestTimeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  const origin = validateBaseUrl(baseUrl);
  const key = apiKey === undefined || apiKey === null || apiKey === '' ? null : apiKey;
  if (key !== null && (typeof key !== 'string' || key.length > 8192 || /[\r\n\u0000]/u.test(key))) throw new WorkbenchError('KEY_INVALID', 'The API key must be one header value.');
  if (typeof fetchImpl !== 'function') throw new WorkbenchError('FETCH_UNAVAILABLE', 'A server-side HTTP client is required.');
  const access = Object.freeze({ baseUrl: origin, keyConfigured: Boolean(key) });

  async function request(task, { signal } = {}) {
    const descriptor = task.request;
    if (!descriptor || !['GET', 'POST'].includes(descriptor.method) || typeof descriptor.path !== 'string' || !descriptor.path.startsWith('/') || descriptor.path.startsWith('//') || descriptor.path.includes('?') || descriptor.path.includes('#')) throw new WorkbenchError('REQUEST_INVALID', 'The saved provider request is invalid.');
    const url = new URL(descriptor.path, origin);
    if (url.origin !== origin || (descriptor.method === 'POST' ? url.pathname !== '/v1/prices/batch' : !/^\/(?:health|api-docs-json|v1\/(?:assets(?:\/[^/]+(?:\/(?:price|ohlcv))?)?|oracles\/[^/]+|backfill\/status))$/u.test(url.pathname))) throw new WorkbenchError('REQUEST_INVALID', 'The saved request is outside the original read-only Prices API.');
    for (const [name, value] of Object.entries(descriptor.query ?? {})) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    const needsKey = url.pathname.startsWith('/v1/');
    if (needsKey && !key) throw new WorkbenchError('KEY_REQUIRED', 'Start the workbench with STELLAR_PRICES_API_KEY to run provider data requests.', 409);
    const headers = { accept: 'application/json', 'user-agent': 'tokenjunkielabs-prices-workbench/0.1' };
    if (needsKey) headers['x-api-key'] = key;
    let body;
    if (descriptor.method === 'POST') { body = JSON.stringify(descriptor.body); if (Buffer.byteLength(body) > 16384) throw new WorkbenchError('REQUEST_INVALID', 'The native batch body exceeds 16 KiB.'); headers['content-type'] = 'application/json'; }
    const timeout = AbortSignal.timeout(requestTimeoutMs); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const startedAt = new Date().toISOString(); const started = performance.now();
    let response;
    try { response = await fetchImpl(url, { method: descriptor.method, headers, body, redirect: 'manual', signal: combined }); }
    catch (error) { if (error instanceof WorkbenchError) throw error; throw new WorkbenchError(timeout.aborted ? 'PROVIDER_TIMEOUT' : combined.aborted ? 'REQUEST_ABORTED' : 'PROVIDER_NETWORK', timeout.aborted ? 'The provider request timed out.' : combined.aborted ? 'The request was stopped.' : 'The provider could not be reached.', 502); }
    if (response.redirected || (response.status >= 300 && response.status < 400)) { await response.body?.cancel?.().catch(() => {}); throw new WorkbenchError('PROVIDER_REDIRECT', 'The provider returned a redirect. The bound API key was kept on its original origin.', 502); }
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_RESPONSE_BYTES) { await response.body?.cancel?.().catch(() => {}); throw new WorkbenchError('RESPONSE_TOO_LARGE', 'This response exceeds 16 MiB. Choose a smaller provider request.', 502); }
    const chunks = []; let size = 0;
    try {
      if (response.body) for await (const chunk of response.body) { size += chunk.length; if (size > MAX_RESPONSE_BYTES) throw new WorkbenchError('RESPONSE_TOO_LARGE', 'This response exceeds 16 MiB. Choose a smaller provider request.', 502); chunks.push(Buffer.from(chunk)); }
    } catch (error) { if (error instanceof WorkbenchError) throw error; throw new WorkbenchError('RESPONSE_INCOMPLETE', 'The provider response ended before it was fully received.', 502); }
    const raw = Buffer.concat(chunks); const rawText = raw.toString('utf8');
    if (key && rawText.includes(key)) throw new WorkbenchError('RESPONSE_CONTAINS_KEY', 'The provider response contains the process API key and cannot be retained.', 502);
    let data = null, parseError = null; try { data = JSON.parse(rawText); } catch { parseError = 'The provider response was not valid JSON.'; }
    const keptHeaders = Object.fromEntries(KEPT_HEADERS.flatMap(name => { const value = response.headers.get(name); return value === null || (key && value.includes(key)) ? [] : [[name, value]]; }));
    const receivedAt = new Date().toISOString();
    return { status: response.status, headers: keptHeaders, raw, data, parseError, startedAt, receivedAt, durationMs: Math.round(performance.now() - started), classification: classifyResponse(response.status, data, keptHeaders, Date.parse(receivedAt)) };
  }
  return Object.freeze({ access, request });
}
