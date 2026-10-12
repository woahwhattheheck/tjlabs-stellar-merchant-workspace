/**
 * HTTP access to the original merchant performance workspace.
 * Monetary values, saved source identities and operation UUIDs pass through intact.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TOKEN = /^[a-fA-F0-9]{64}$/;
export const PERFORMANCE_FILES = Object.freeze(['source.json', 'review.json', 'review.html', 'usage.csv']);

function nonempty(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(name + ' must be a nonempty string');
  return value;
}
function connection(input, suppliedToken) {
  if (typeof input !== 'string' && !(input instanceof URL)) {
    throw new TypeError('url must be a performance launch URL or URL object');
  }
  const url = new URL(String(input));
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('The performance client requires an HTTP(S) loopback URL');
  }
  if (url.username || url.password) throw new TypeError('Use the original workspace token for authentication');
  if (!['/', '/performance', '/performance/'].includes(url.pathname) || url.search) {
    throw new TypeError('Use the standalone launch URL or the original /performance/ launch URL');
  }
  const tokens = new URLSearchParams(url.hash.slice(1)).getAll('token');
  if (tokens.length > 1) throw new TypeError('The launch URL contains multiple tokens');
  const fragmentToken = tokens[0];
  if (suppliedToken !== undefined && fragmentToken !== undefined && suppliedToken !== fragmentToken) {
    throw new TypeError('The supplied token differs from the launch URL token');
  }
  const token = suppliedToken === undefined ? fragmentToken : suppliedToken;
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    throw new TypeError('A 64-character hexadecimal workspace token is required');
  }
  return Object.freeze({
    origin: url.origin,
    apiPrefix: url.pathname === '/' ? '/api' : '/api/performance',
    token
  });
}
function responseHeaders(headers) {
  const values = Object.create(null);
  headers.forEach((value, key) => { values[key] = value; });
  return Object.freeze(values);
}
function decodedBody(rawBody) {
  if (rawBody === '') return null;
  try { return JSON.parse(rawBody); } catch { return rawBody; }
}
function messageFrom(status, body) {
  if (body && typeof body === 'object') {
    if (body.error && typeof body.error.message === 'string') return body.error.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
  }
  return 'Performance request failed with HTTP ' + status;
}
function codeFrom(body) {
  if (body && typeof body === 'object') {
    if (body.error && typeof body.error.code === 'string') return body.error.code;
    if (typeof body.code === 'string') return body.code;
  }
  return 'PERFORMANCE_HTTP_ERROR';
}
function filenameFrom(disposition, fallback) {
  if (disposition) {
    const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
    if (encoded) {
      try { return decodeURIComponent(encoded[1].trim()); } catch { /* Retain the ordinary filename. */ }
    }
    const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]+))/i.exec(disposition);
    if (plain) return plain[1] === undefined ? plain[2].trim() : plain[1].replace(/\\(.)/g, '$1');
  }
  return fallback;
}
function pageQuery(page = {}) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) throw new TypeError('Pagination must be an object');
  const query = new URLSearchParams();
  if (page.after !== undefined) query.set('after', nonempty(page.after, 'after'));
  if (page.limit !== undefined) {
    if (!Number.isSafeInteger(page.limit) || page.limit < 1) throw new TypeError('limit must be a positive safe integer');
    query.set('limit', String(page.limit));
  }
  const value = query.toString();
  return value ? '?' + value : '';
}

/** A complete HTTP response is retained, including an original nested or top-level code. */
export class PerformanceHttpError extends Error {
  constructor({status, method, url, headers, rawBody, body}) {
    super(messageFrom(status, body));
    this.name = 'PerformanceHttpError';
    this.code = codeFrom(body);
    this.status = status;
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.rawBody = rawBody;
    this.body = body;
    this.requestId = headers['x-request-id'] || null;
  }
}
/** Reopen an interrupted write using the same original request IDs. */
export class PerformanceTransportError extends Error {
  constructor({method, url, cause, status = null, outcome = method === 'GET' ? 'READ_FAILED' : 'UNKNOWN'}) {
    super('The performance server response could not be completed', {cause});
    this.name = 'PerformanceTransportError';
    this.code = 'PERFORMANCE_TRANSPORT_ERROR';
    this.method = method;
    this.url = url;
    this.status = status;
    this.outcome = outcome;
  }
}
export class PerformanceProtocolError extends Error {
  constructor({method, url, status, headers, rawBody, outcome = method === 'GET' ? 'READ_FAILED' : 'UNKNOWN'}) {
    super('The performance server returned an invalid JSON response');
    this.name = 'PerformanceProtocolError';
    this.code = 'PERFORMANCE_PROTOCOL_ERROR';
    this.method = method;
    this.url = url;
    this.status = status;
    this.headers = headers;
    this.rawBody = rawBody;
    this.outcome = outcome;
  }
}

/** Captures the launch origin, API prefix, token and optional default signal once. */
export class PerformanceClient {
  #origin;
  #apiPrefix;
  #token;
  #fetch;
  #signal;

  constructor({url, token, fetch: fetchImplementation, signal} = {}) {
    const captured = connection(url, token);
    const selectedFetch = fetchImplementation === undefined ? globalThis.fetch : fetchImplementation;
    if (typeof selectedFetch !== 'function') throw new TypeError('A fetch implementation is required');
    this.#origin = captured.origin;
    this.#apiPrefix = captured.apiPrefix;
    this.#token = captured.token;
    this.#fetch = selectedFetch.bind(globalThis);
    this.#signal = signal;
  }
  get origin() { return this.#origin; }
  get apiPrefix() { return this.#apiPrefix; }

  async #request(method, path, input, options = {}, {binaryName = null, write = false} = {}) {
    const url = new URL(this.#apiPrefix + path, this.#origin);
    if (!path.startsWith('/') || url.origin !== this.#origin ||
        !url.pathname.startsWith(this.#apiPrefix + '/')) {
      throw new TypeError('Performance requests must stay within the captured API origin');
    }
    const headers = {
      ...(this.#apiPrefix === '/api/performance'
        ? {'x-sf97-workspace': this.#token}
        : {Authorization: 'Bearer ' + this.#token}),
      Accept: binaryName === null ? 'application/json' : '*/*'
    };
    const init = {
      method, headers, signal: options.signal === undefined ? this.#signal : options.signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error'
    };
    if (input !== undefined) {
      init.body = JSON.stringify(input);
      if (init.body === undefined) throw new TypeError('The request body must be JSON');
      headers['Content-Type'] = 'application/json';
    }
    const outcome = write ? 'UNKNOWN' : 'READ_FAILED';
    let response;
    try { response = await this.#fetch(url.href, init); }
    catch (cause) { throw new PerformanceTransportError({method, url: url.href, cause, outcome}); }
    const capturedHeaders = responseHeaders(response.headers);
    if (binaryName !== null && response.ok) {
      let bytes;
      try { bytes = new Uint8Array(await response.arrayBuffer()); }
      catch (cause) {
        throw new PerformanceTransportError({method, url: url.href, status: response.status, cause, outcome});
      }
      return Object.freeze({
        filename: filenameFrom(response.headers.get('content-disposition'), binaryName),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        bytes, headers: capturedHeaders
      });
    }
    let rawBody;
    try { rawBody = await response.text(); }
    catch (cause) {
      throw new PerformanceTransportError({method, url: url.href, status: response.status, cause, outcome});
    }
    if (!response.ok) {
      throw new PerformanceHttpError({
        status: response.status, method, url: url.href, headers: capturedHeaders,
        rawBody, body: decodedBody(rawBody)
      });
    }
    try { return JSON.parse(rawBody); }
    catch {
      throw new PerformanceProtocolError({
        method, url: url.href, status: response.status, headers: capturedHeaders, rawBody, outcome
      });
    }
  }

  state(options) { return this.#request('GET', '/state', undefined, options); }
  sources(page, options) { return this.#request('GET', '/sources' + pageQuery(page), undefined, options); }
  source(version, options) {
    return this.#request('GET', '/source?' + new URLSearchParams({version: nonempty(version, 'version')}),
      undefined, options);
  }
  servicePeriods(page, options) {
    return this.#request('GET', '/service-periods' + pageQuery(page), undefined, options);
  }
  captureServicePeriod(input, options) {
    return this.#request('POST', '/service-periods', input, options, {write: true});
  }
  preview(inputs, options) { return this.#request('POST', '/preview', inputs, options); }
  save(input, options) { return this.#request('POST', '/save', input, options, {write: true}); }
  list(page, options) { return this.#request('GET', '/reviews' + pageQuery(page), undefined, options); }
  load(performanceId, options) {
    return this.#request('GET', '/review?' + new URLSearchParams({performanceId: nonempty(performanceId, 'performanceId')}),
      undefined, options);
  }
  capture(performanceId, options) {
    return this.#request('GET', '/capture?' + new URLSearchParams({performanceId: nonempty(performanceId, 'performanceId')}),
      undefined, options);
  }
  download(performanceId, name, options) {
    if (!PERFORMANCE_FILES.includes(name)) throw new TypeError('Choose source.json, review.json, review.html or usage.csv');
    return this.#request('GET', '/files/' + encodeURIComponent(nonempty(performanceId, 'performanceId')) +
      '/' + encodeURIComponent(name), undefined, options, {binaryName: name});
  }
  inspect(source, options) { return this.#request('POST', '/inspect', source, options); }
  receive(source, options) { return this.#request('POST', '/receive', source, options, {write: true}); }
  proposal(input, options) { return this.#request('POST', '/proposal', input, options); }
  saveProposal(input, options) {
    return this.#request('POST', '/proposal/save', input, options, {write: true});
  }
  commitProposal(input, options) {
    return this.#request('POST', '/proposal/commit', input, options, {write: true});
  }
}
export function createPerformanceClient(options) { return new PerformanceClient(options); }
