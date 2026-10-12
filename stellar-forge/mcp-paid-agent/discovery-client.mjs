// SPDX-License-Identifier: MIT
import { openMerchantFileClient } from '../mcp-merchant-operator/retained-download.mjs';
import { normalizeDiscoveryArguments } from './discovery.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const toolFor = mode => mode === 'search' ? 'bazaar_search' : 'bazaar_resources';
const keyOf = value => JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]));
const text = value => typeof value === 'string' && value.length > 0;
function failure(code, message, details) {
  return Object.assign(new Error(message), { code, ...(details === undefined ? {} : { details }) });
}
function requireValue(value, code, message) {
  if (!value) throw failure(code, message);
}
function identifier(value, label) {
  requireValue(text(value) && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value),
    'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply the original ' + label + '.');
  return value;
}
function pathInput(value) {
  requireValue(plain(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.values(value).every(item => typeof item === 'string'),
  'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply explicit HTTP path parameter values as a string map.');
  return value;
}
function continuationRequest(mode, current, continuation) {
  if (continuation === null) return null;
  requireValue(plain(continuation) && continuation.tool === toolFor(mode) && plain(continuation.arguments),
    'BAZAAR_DISCOVERY_CONTINUATION_INVALID', 'The catalog continuation uses a different discovery operation.');
  const next = normalizeDiscoveryArguments(mode, continuation.arguments);
  const position = mode === 'search' ? 'cursor' : 'offset';
  const originalFilters = { ...current }, nextFilters = { ...next };
  delete originalFilters[position]; delete nextFilters[position];
  requireValue(keyOf(originalFilters) === keyOf(nextFilters),
    'BAZAAR_DISCOVERY_CONTINUATION_CHANGED', 'The catalog continuation changed the original search or filters.');
  requireValue(mode === 'search'
    ? text(next.cursor) && next.cursor !== current.cursor
    : Number.isSafeInteger(next.offset) && next.offset > current.offset,
  'BAZAAR_DISCOVERY_CONTINUATION_STALLED', 'The catalog continuation did not advance.');
  return next;
}
function validatePage(mode, request, value) {
  requireValue(plain(value) && Array.isArray(value.resources) && typeof value.partialResults === 'boolean' &&
    (value.pagination === null || plain(value.pagination)) &&
    plain(value.source) && value.source.mode === mode && text(value.source.url) &&
    text(value.source.observedAt) && plain(value.source.request) && plain(value.page),
  'BAZAAR_DISCOVERY_PAGE_INVALID', 'The running buyer did not return a complete discovery page.');
  const observed = normalizeDiscoveryArguments(mode, value.source.request);
  requireValue(keyOf(observed) === keyOf(request),
    'BAZAAR_DISCOVERY_PAGE_CHANGED', 'The discovery response belongs to different search arguments.');
  for (const name of ['received', 'returned', 'filtered', 'invalid'])
    requireValue(Number.isSafeInteger(value.page[name]) && value.page[name] >= 0,
      'BAZAAR_DISCOVERY_PAGE_INVALID', 'The discovery page has invalid row coverage.');
  requireValue(value.page.returned === value.resources.length &&
    value.page.received === value.page.returned + value.page.filtered + value.page.invalid,
  'BAZAAR_DISCOVERY_PAGE_INVALID', 'The discovery row coverage does not account for the source page.');
  requireValue(value.page.continuationError === null ||
    plain(value.page.continuationError) && text(value.page.continuationError.code) &&
    text(value.page.continuationError.message),
  'BAZAAR_DISCOVERY_PAGE_INVALID', 'The discovery continuation outcome is missing.');
  requireValue(value.page.continuationError === null || value.continuation === null,
    'BAZAAR_DISCOVERY_PAGE_INVALID', 'A failed continuation cannot also request another page.');
  continuationRequest(mode, request, value.continuation);
  return value;
}

/**
 * Connect the maintained buyer transport, or borrow one existing authenticated
 * client. Closing this discovery client cancels its own calls; the owner keeps
 * its supplied transport and the original quote workspace.
 */
export async function openBazaarDiscoveryClient({
  url, client: supplied, tokenEnv = 'MCP_ACCESS_TOKEN', environment = process.env, signal,
} = {}) {
  requireValue(!(url !== undefined && supplied !== undefined),
    'BAZAAR_DISCOVERY_CONFIGURATION', 'Choose the original MCP endpoint or one connected client.');
  if (supplied !== undefined)
    requireValue(supplied !== null && typeof supplied === 'object' &&
      typeof supplied.call === 'function' && text(supplied.endpoint) &&
      supplied.endpoint.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(supplied.endpoint),
    'BAZAAR_DISCOVERY_CONFIGURATION', 'The connected client needs its stable endpoint and call method.');
  const controller = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  lifetime.throwIfAborted();
  const transport = supplied !== undefined
    ? Object.freeze({ endpoint: supplied.endpoint, call: supplied.call.bind(supplied) })
    : await openMerchantFileClient({
    url, tokenEnv, environment, signal: lifetime, errorPrefix: 'BAZAAR_DISCOVERY',
    clientName: 'starforge-bazaar-discovery', maximumResponseBytes: 16 * 1024 * 1024,
  });
  const pending = new Set();
  let closed = false, closing;
  function invoke(tool, arguments_, options = {}) {
    requireValue(!closed, 'BAZAAR_DISCOVERY_CLOSED', 'This discovery client is closed.');
    const request = copy(arguments_);
    const requestSignal = options.signal ? AbortSignal.any([lifetime, options.signal]) : lifetime;
    const timeoutMs = options.timeoutMs ?? 120000;
    requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 300000,
      'BAZAAR_DISCOVERY_CONFIGURATION', 'Use a request timeout from 1 through 300000 milliseconds.');
    const operation = Promise.resolve().then(async () => {
      requestSignal.throwIfAborted();
      const value = await transport.call(tool, request, { requestSignal, timeoutMs });
      requestSignal.throwIfAborted();
      requireValue(plain(value), 'BAZAAR_DISCOVERY_REPLY_INVALID',
        'The buyer tool did not return its original structured result.');
      return copy(value);
    });
    pending.add(operation);
    operation.finally(() => pending.delete(operation)).catch(() => {});
    return operation;
  }
  async function readPage(mode, arguments_, options) {
    const request = normalizeDiscoveryArguments(mode, arguments_);
    return validatePage(mode, request, await invoke(toolFor(mode), request, options));
  }
  async function* pages(mode, arguments_, options) {
    let request = normalizeDiscoveryArguments(mode, arguments_);
    const seen = new Set();
    for (;;) {
      const identity = keyOf(request);
      requireValue(!seen.has(identity), 'BAZAAR_DISCOVERY_CONTINUATION_CYCLE',
        'The catalog returned an already visited page. Retain the current observations and restart discovery.');
      seen.add(identity);
      const page = await readPage(mode, request, options);
      // Capture the next step before giving mutable response data to the caller.
      const next = continuationRequest(mode, request, page.continuation);
      const continuationError = copy(page.page.continuationError);
      const errorPage = continuationError ? copy(page) : null;
      yield page;
      if (continuationError) {
        const error = failure(continuationError.code, continuationError.message);
        error.page = errorPage;
        throw error;
      }
      if (next === null) return;
      request = next;
    }
  }
  async function describe(handle, options) {
    identifier(handle, 'resource handle');
    const value = await invoke('bazaar_describe', { handle }, options);
    requireValue(value.handle === handle, 'BAZAAR_DISCOVERY_RESOURCE_CHANGED',
      'The description belongs to a different resource handle.');
    return value;
  }
  async function preview(request, options) {
    requireValue(plain(request), 'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply an original handle and explicit input.');
    identifier(request.handle, 'resource handle');
    if (plain(request.input) && request.input.path !== undefined) pathInput(request.input.path);
    const value = await invoke('bazaar_preview', request, options);
    requireValue(text(value.quoteId) && value.status === 'PREVIEWED' && text(value.requestUrl),
      'BAZAAR_DISCOVERY_QUOTE_INVALID', 'The buyer did not return the prepared original quote.');
    return value;
  }
  return Object.freeze({
    endpoint: transport.endpoint,
    browse: (request = {}, options) => readPage('resources', request, options),
    search: (request, options) => readPage('search', request, options),
    browsePages: (request = {}, options) => pages('resources', request, options),
    searchPages: (request, options) => pages('search', request, options),
    describe,
    preview,
    previewHttp({ handle, path, query = {}, acceptIndex = 0 } = {}, options) {
      requireValue(plain(query), 'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply the actual HTTP query object.');
      if (path !== undefined) pathInput(path);
      return preview({ handle, acceptIndex, input: { query, ...(path === undefined ? {} : { path }) } }, options);
    },
    previewHttpQuery({ handle, query, acceptIndex = 0 } = {}, options) {
      requireValue(plain(query), 'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply the actual HTTP query object.');
      return preview({ handle, acceptIndex, input: { query } }, options);
    },
    previewMcpArguments({ handle, arguments: arguments_, acceptIndex = 0 } = {}, options) {
      requireValue(plain(arguments_), 'BAZAAR_DISCOVERY_INPUT_INVALID', 'Supply the actual MCP arguments object.');
      return preview({ handle, acceptIndex, input: { arguments: arguments_ } }, options);
    },
    close() {
      if (closing) return closing;
      closed = true;
      controller.abort();
      closing = Promise.allSettled([...pending]).then(() => {});
      return closing;
    },
  });
}
