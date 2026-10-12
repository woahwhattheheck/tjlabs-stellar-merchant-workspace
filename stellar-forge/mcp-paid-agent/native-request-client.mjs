// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import { open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { openMerchantFileClient } from '../mcp-merchant-operator/retained-download.mjs';
import { openBazaarDiscoveryClient } from './discovery-client.mjs';

const TOOL = 'sf43_discover_review_and_pay';
const RESULT = 'stellar-forge.mcp-native-buyer.v1';
const WORKSPACE = 'stellar-forge.mcp-native-request-workspace.v1';
const WORKSPACES = 'stellar-forge.mcp-native-request-workspaces.v1';
const ALL_HISTORY = 'stellar-forge.mcp-native-request-history.v1';
const states = new Set(['QUEUED', 'RUNNING_OR_INTERRUPTED', 'ATTEMPT_RECORDED', 'RECOVERED', 'CANCELLED']);
const actions = new Set(['request-workspace', 'request-workspaces', 'request-history', 'request-prepare', 'request-review',
  'execute', 'status', 'history', 'recover', 'cancel', 'read']);
const mutations = new Set(['request-prepare', 'execute', 'recover', 'cancel']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const text = value => typeof value === 'string' && value.length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function need(value, code, message) { if (!value) fail(code, message); }
function workspaceId(value) {
  need(typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value),
    'NATIVE_REQUEST_WORKSPACE_INVALID', 'Select an exact configured workspace ID.');
  return value;
}
function workspaceView(value) {
  need(plain(value) && value.schema === WORKSPACE && value.available === true && plain(value.route) &&
    text(value.route.origin) && text(value.route.pathname) && text(value.route.method) &&
    plain(value.payment) && plain(value.limits) &&
    ['bodyBytes', 'toolRequestBytes', 'sourcePageBytes', 'preparedConfigBytes', 'responseBytes']
      .every(key => Number.isSafeInteger(value.limits[key]) && value.limits[key] > 0) &&
    actionList(value.actions),
  'NATIVE_REQUEST_WORKSPACE_INVALID', 'The running endpoint lacks its native request workspace description.');
  if (value.workspaceId !== undefined) workspaceId(value.workspaceId);
  if (value.workspaceLabel !== undefined)
    need(text(value.workspaceLabel), 'NATIVE_REQUEST_WORKSPACE_INVALID', 'The configured service label is missing.');
  return value;
}
function intent(value) {
  need(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value),
    'NATIVE_REQUEST_INPUT_INVALID', 'Supply the same stable intent ID for preparation, execution and recovery.');
  return value;
}
function view(value, intentId) {
  need(plain(value) && value.schema === RESULT && states.has(value.state) &&
    (intentId === undefined || value.intentId === intentId) &&
    typeof value.intentId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value.intentId) &&
    text(value.createdAt) && plain(value.request) && text(value.request.url) &&
    text(value.request.method) && plain(value.request.expected) &&
    (value.attempt === null || plain(value.attempt)),
  'NATIVE_REQUEST_REPLY_INVALID', 'The native inbox response does not identify the original request.');
  return value;
}
function actionList(value) {
  return Array.isArray(value) && value.every(action => actions.has(action));
}
function prepared(value, intentId) {
  view(value, intentId);
  const selected = value.preparation;
  need(plain(selected) && (text(selected.source) || plain(selected.source)) &&
    digest(selected.pageSha256) && Number.isSafeInteger(selected.rowIndex) && selected.rowIndex >= 0 &&
    Number.isSafeInteger(selected.acceptIndex) && selected.acceptIndex >= 0 &&
    plain(selected.originalListing) && plain(selected.accepted) &&
    (selected.body === null || plain(selected.body) && typeof selected.body.text === 'string' &&
      Number.isSafeInteger(selected.body.bytes) && selected.body.bytes >= 0 && digest(selected.body.sha256)) &&
    actionList(value.availableActions),
  'NATIVE_REQUEST_PREPARATION_INVALID', 'The native review lacks its original page, selected offer or retained body.');
  return value;
}
function rangeRequest(request = {}) {
  need(plain(request), 'NATIVE_REQUEST_INPUT_INVALID', 'Supply the original intent and byte range.');
  intent(request.intentId);
  const byteOffset = request.byteOffset ?? 0, maxBytes = request.maxBytes ?? 32768;
  need(Number.isSafeInteger(byteOffset) && byteOffset >= 0 &&
    Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= 65536,
  'NATIVE_REQUEST_RANGE_INVALID', 'Use a nonnegative byte offset and a range of 1 through 65536 bytes.');
  return { intentId: request.intentId, byteOffset, maxBytes };
}
function range(value, request) {
  const result = value.result;
  need(value.schema === RESULT && value.intentId === request.intentId && states.has(value.state) &&
    plain(result) && Number.isSafeInteger(result.bytes) && result.bytes >= request.byteOffset &&
    digest(result.sha256) && result.byteOffset === request.byteOffset &&
    result.returnedBytes === Math.min(request.maxBytes, result.bytes - request.byteOffset) &&
    result.encoding === 'base64' && typeof result.data === 'string' &&
    result.verifiedSavedFile === true &&
    (result.contentType === null || typeof result.contentType === 'string') &&
    result.nextByteOffset === (request.byteOffset + result.returnedBytes < result.bytes
      ? request.byteOffset + result.returnedBytes : null),
  'NATIVE_REQUEST_RESULT_CHANGED', 'The saved result does not match the requested intent and byte range.');
  const bytes = Buffer.from(result.data, 'base64');
  need(bytes.length === result.returnedBytes && bytes.toString('base64') === result.data,
    'NATIVE_REQUEST_RESULT_INVALID', 'The saved result range has invalid base64 or a different byte count.');
  return bytes;
}

/** One authenticated transport connects catalog selection to the original durable inbox. */
export async function openNativeRequestClient({
  url, client: supplied, tokenEnv = 'MCP_ACCESS_TOKEN', environment = process.env, signal,
  workspaceId: initialWorkspace,
} = {}) {
  need(!(url !== undefined && supplied !== undefined),
    'NATIVE_REQUEST_CONFIGURATION', 'Choose the original endpoint or one connected client.');
  if (supplied !== undefined)
    need(plain(supplied) && typeof supplied.call === 'function' && text(supplied.endpoint) &&
      supplied.endpoint.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(supplied.endpoint),
    'NATIVE_REQUEST_CONFIGURATION', 'A connected client needs its stable endpoint and call method.');
  if (initialWorkspace !== undefined) workspaceId(initialWorkspace);
  const controller = new AbortController();
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  lifetime.throwIfAborted();
  const transport = supplied === undefined
    ? await openMerchantFileClient({ url, tokenEnv, environment, signal: lifetime,
      errorPrefix: 'NATIVE_REQUEST', clientName: 'starforge-native-request',
      maximumResponseBytes: 16 * 1024 * 1024 })
    : Object.freeze({ endpoint: supplied.endpoint, call: supplied.call.bind(supplied) });
  const discovery = await openBazaarDiscoveryClient({ client: transport, signal: lifetime });
  const pending = new Set();
  let closed = false, closing;
  function tracked(operation) {
    pending.add(operation);
    operation.finally(() => pending.delete(operation)).catch(() => {});
    return operation;
  }
  function invoke(action, arguments_ = {}, options = {}) {
    need(!closed, 'NATIVE_REQUEST_CLOSED', 'This native request client is closed.');
    need(plain(options), 'NATIVE_REQUEST_CONFIGURATION', 'Supply call options as an object.');
    const global = action === 'request-workspaces' || action === 'request-history';
    const selectedWorkspace = global ? undefined : options.workspaceId ?? initialWorkspace;
    if (selectedWorkspace !== undefined) workspaceId(selectedWorkspace);
    need(arguments_.workspaceId === undefined, 'NATIVE_REQUEST_INPUT_INVALID',
      'Select the service through forWorkspace() or call options, then keep the original intent.');
    const request = copy({ ...arguments_,
      ...(selectedWorkspace === undefined ? {} : {workspaceId:selectedWorkspace}), action });
    const requestSignal = options.signal ? AbortSignal.any([lifetime, options.signal]) : lifetime;
    const timeoutMs = options.timeoutMs ?? 120000;
    need(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 300000,
      'NATIVE_REQUEST_CONFIGURATION', 'Use a request timeout from 1 through 300000 milliseconds.');
    return tracked(Promise.resolve().then(async () => {
      requestSignal.throwIfAborted();
      try {
        const result = await transport.call(TOOL, request, { requestSignal, timeoutMs });
        requestSignal.throwIfAborted();
        need(plain(result), 'NATIVE_REQUEST_REPLY_INVALID', 'The native tool returned no structured result.');
        if (selectedWorkspace !== undefined)
          need(result.workspaceId === selectedWorkspace, 'NATIVE_REQUEST_WORKSPACE_CHANGED',
            'The native result belongs to a different configured service.');
        return copy(result);
      } catch (error) {
        // Preserve provider details and recovery. Callers reopen this same intent;
        // an uncertain reply must never become an automatic second purchase.
        if (mutations.has(action) && text(request.intentId) && error !== null &&
            (typeof error === 'object' || typeof error === 'function') && Object.isExtensible(error))
          error.nativeRequest = { action, intentId: request.intentId,
            ...(request.workspaceId === undefined ? {} : {workspaceId:request.workspaceId}),
            inspect: { tool: TOOL, arguments: { action: 'status', intentId: request.intentId,
              ...(request.workspaceId === undefined ? {} : {workspaceId:request.workspaceId}) } } };
        throw error;
      }
    }));
  }
  async function workspace(options) {
    return workspaceView(await invoke('request-workspace', {}, options));
  }
  async function workspaces(options) {
    const value = await invoke('request-workspaces', {}, options);
    need(value.schema === WORKSPACES && Array.isArray(value.workspaces) &&
      value.workspaces.length >= 1 && value.workspaces.length <= 16 &&
      value.total === value.workspaces.length,
    'NATIVE_REQUEST_WORKSPACES_INVALID', 'The host did not return its complete configured service list.');
    const ids = new Set();
    for (const selected of value.workspaces) {
      workspaceView(selected); workspaceId(selected.workspaceId);
      need(text(selected.workspaceLabel) && !ids.has(selected.workspaceId),
        'NATIVE_REQUEST_WORKSPACES_INVALID', 'Configured service identities must be distinct.');
      ids.add(selected.workspaceId);
    }
    need(ids.has(value.defaultWorkspaceId), 'NATIVE_REQUEST_WORKSPACES_INVALID',
      'The host default does not identify a configured service.');
    return value;
  }
  async function prepare(request, options) {
    need(plain(request), 'NATIVE_REQUEST_INPUT_INVALID', 'Supply a selected catalog handle and explicit request input.');
    intent(request.intentId);
    need(text(request.handle) && plain(request.input),
      'NATIVE_REQUEST_INPUT_INVALID', 'Select a catalog resource and supply its query or exact UTF-8 body.');
    const selected = copy(request), intentId = selected.intentId;
    return prepared(await invoke('request-prepare', selected, options), intentId);
  }
  async function review(intentId, options) {
    return prepared(await invoke('request-review', { intentId: intent(intentId) }, options), intentId);
  }
  async function lifecycle(action, intentId, options) {
    return view(await invoke(action, { intentId: intent(intentId) }, options), intentId);
  }
  async function history(request = {}, options) {
    need(plain(request), 'NATIVE_REQUEST_INPUT_INVALID', 'Supply an original history cursor and page size.');
    const limit = request.limit ?? 25, cursor = request.cursor;
    need(Number.isInteger(limit) && limit >= 1 && limit <= 100 &&
      (cursor === undefined || digest(cursor)) &&
      Object.keys(request).every(key => key === 'limit' || key === 'cursor'),
    'NATIVE_REQUEST_INPUT_INVALID', 'Use a history page size from 1 through 100 and its original cursor.');
    const value = await invoke('history', { limit, ...(cursor === undefined ? {} : { cursor }) }, options);
    need(value.schema === RESULT && Number.isSafeInteger(value.total) && value.total >= 0 &&
      Array.isArray(value.records) && value.records.length <= limit && value.records.length <= value.total &&
      (value.nextCursor === null || digest(value.nextCursor) && value.nextCursor !== cursor),
    'NATIVE_REQUEST_HISTORY_INVALID', 'The native history page has invalid coverage or continuation.');
    value.records.forEach(record => {
      view(record);
      if (value.workspaceId !== undefined)
        need(record.workspaceId === value.workspaceId, 'NATIVE_REQUEST_WORKSPACE_CHANGED',
          'An inbox record belongs to a different configured service.');
    });
    return value;
  }
  async function* historyPages(request = {}, options) {
    let current = copy(request);
    const boundOptions = {...options}, originalWorkspace = await workspace({...options});
    if (originalWorkspace.workspaceId !== undefined) boundOptions.workspaceId = originalWorkspace.workspaceId;
    const seen = new Set();
    for (;;) {
      const key = current.cursor ?? null;
      need(!seen.has(key), 'NATIVE_REQUEST_HISTORY_CYCLE', 'The native inbox returned an already visited page.');
      seen.add(key);
      const page = await history(current, boundOptions), next = page.nextCursor;
      yield page;
      if (next === null) return;
      current = { ...current, cursor: next };
    }
  }
  async function allHistory(request = {}, options) {
    need(plain(request), 'NATIVE_REQUEST_INPUT_INVALID', 'Supply an original combined history cursor and page size.');
    const limit = request.limit ?? 25, cursor = request.cursor;
    need(Number.isInteger(limit) && limit >= 1 && limit <= 100 &&
      (cursor === undefined || typeof cursor === 'string' && cursor.length >= 1 &&
        cursor.length <= 8192 && /^[A-Za-z0-9_-]+$/.test(cursor)) &&
      Object.keys(request).every(key => key === 'limit' || key === 'cursor'),
    'NATIVE_REQUEST_INPUT_INVALID', 'Use the original service history cursor and a page size from 1 through 100.');
    const value = await invoke('request-history', {limit, ...(cursor === undefined ? {} : {cursor})}, options);
    need(value.schema === ALL_HISTORY && Number.isSafeInteger(value.total) && value.total >= 0 &&
      Number.isInteger(value.workspaceCount) && value.workspaceCount >= 1 && value.workspaceCount <= 16 &&
      Array.isArray(value.records) && value.records.length <= limit && value.records.length <= value.total &&
      (value.nextCursor === null || typeof value.nextCursor === 'string' && value.nextCursor.length >= 1 &&
        value.nextCursor.length <= 8192 && /^[A-Za-z0-9_-]+$/.test(value.nextCursor) && value.nextCursor !== cursor),
    'NATIVE_REQUEST_HISTORY_INVALID', 'The combined service history has invalid coverage or continuation.');
    const seen = new Set();
    for (const record of value.records) {
      view(record); workspaceId(record.workspaceId);
      const key = JSON.stringify([record.workspaceId,record.intentId]);
      need(text(record.workspaceLabel) && !seen.has(key), 'NATIVE_REQUEST_HISTORY_INVALID',
        'The combined history repeated or lost a service identity.');
      seen.add(key);
    }
    return value;
  }
  async function* allHistoryPages(request = {}, options) {
    let current = copy(request);
    const seen = new Set();
    for (;;) {
      const key = current.cursor ?? null;
      need(!seen.has(key), 'NATIVE_REQUEST_HISTORY_CYCLE', 'The host returned an already visited combined history page.');
      seen.add(key);
      const page = await allHistory(current,options), next = page.nextCursor;
      yield page;
      if (next === null) return;
      current = {...current,cursor:next};
    }
  }
  async function read(request, options) {
    const wanted = rangeRequest(request), value = await invoke('read', wanted, options);
    range(value, wanted);
    return value;
  }
  async function* resultChunks(request = {}, options) {
    need(plain(request), 'NATIVE_REQUEST_INPUT_INVALID', 'Supply the retained intent ID.');
    const selected = copy(request);
    const intentId = intent(selected.intentId);
    const chunkSize = selected.chunkSize ?? 65536;
    need(Number.isSafeInteger(chunkSize) && chunkSize >= 1 && chunkSize <= 65536,
      'NATIVE_REQUEST_RANGE_INVALID', 'Use a result chunk size from 1 through 65536 bytes.');
    const boundOptions = {...options};
    const originalWorkspace = await workspace(boundOptions);
    if (originalWorkspace.workspaceId !== undefined) boundOptions.workspaceId = originalWorkspace.workspaceId;
    const maximum = selected.maxResultBytes ?? originalWorkspace.limits.responseBytes;
    need(Number.isSafeInteger(maximum) && maximum >= 0,
      'NATIVE_REQUEST_CONFIGURATION', 'Use a nonnegative maximum result byte count.');
    const hash = createHash('sha256');
    let byteOffset = 0, identity;
    for (;;) {
      const wanted = { intentId, byteOffset, maxBytes: chunkSize };
      const value = await read(wanted, boundOptions), bytes = range(value, wanted), result = value.result;
      const observed = JSON.stringify([result.bytes, result.sha256, result.contentType]);
      need(identity === undefined || identity === observed,
        'NATIVE_REQUEST_RESULT_CHANGED', 'The native result identity changed between byte ranges.');
      identity ??= observed;
      need(result.bytes <= maximum, 'NATIVE_REQUEST_RESULT_TOO_LARGE',
        'The saved result exceeds the selected download byte limit.');
      const next = result.nextByteOffset;
      hash.update(bytes);
      // Validate the complete digest before exposing the final chunk.
      if (next === null)
        need(hash.digest('hex') === result.sha256, 'NATIVE_REQUEST_RESULT_CHANGED',
          'The complete downloaded bytes differ from the native result digest.');
      yield { ...value, bytes };
      if (next === null) return;
      byteOffset = next;
    }
  }
  function downloadResult(request, options) {
    need(!closed, 'NATIVE_REQUEST_CLOSED', 'This native request client is closed.');
    need(plain(request) && text(request.destination) && isAbsolute(request.destination) &&
      !request.destination.includes('\0') && resolve(request.destination) === request.destination,
    'NATIVE_REQUEST_DESTINATION_INVALID', 'Supply a new absolute destination filename.');
    intent(request.intentId);
    const selected = copy(request), boundOptions = {...options};
    return tracked((async () => {
      const temporary = join(dirname(selected.destination), '.native-request-' + randomUUID() + '.part');
      let handle, complete;
      try {
        handle = await open(temporary, 'wx', 0o600);
        for await (const chunk of resultChunks(selected, boundOptions)) {
          let written = 0;
          while (written < chunk.bytes.length) {
            const { bytesWritten } = await handle.write(chunk.bytes, written, chunk.bytes.length - written);
            need(bytesWritten > 0, 'NATIVE_REQUEST_WRITE_FAILED', 'The selected destination could not advance.');
            written += bytesWritten;
          }
          complete = { intentId: selected.intentId, destination: selected.destination,
            ...(chunk.workspaceId === undefined ? {} : {workspaceId:chunk.workspaceId,workspaceLabel:chunk.workspaceLabel}),
            bytes: chunk.result.bytes, sha256: chunk.result.sha256,
            contentType: chunk.result.contentType, state: chunk.state };
        }
        lifetime.throwIfAborted();
        boundOptions.signal?.throwIfAborted();
        await handle.sync(); await handle.close(); handle = undefined;
        // Exclusive publication preserves an existing customer file.
        lifetime.throwIfAborted();
        boundOptions.signal?.throwIfAborted();
        await link(temporary, selected.destination);
        const directory = await open(dirname(selected.destination), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
        return { ...complete, status: 'SAVED', verifiedSavedFile: true };
      } finally {
        if (handle) await handle.close();
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    })());
  }
  function forWorkspace(id) {
    workspaceId(id);
    const bound = (options = {}) => {
      need(plain(options) && (options.workspaceId === undefined || options.workspaceId === id),
        'NATIVE_REQUEST_WORKSPACE_CHANGED', 'A scoped client keeps its original configured service.');
      return {...options,workspaceId:id};
    };
    return Object.freeze({
      endpoint:transport.endpoint, workspaceId:id, discovery,
      workspace:options => workspace(bound(options)),
      prepare:(request,options) => prepare(request,bound(options)),
      review:(intentId,options) => review(intentId,bound(options)),
      execute:(intentId,options) => lifecycle('execute',intentId,bound(options)),
      status:(intentId,options) => lifecycle('status',intentId,bound(options)),
      recover:(intentId,options) => lifecycle('recover',intentId,bound(options)),
      cancel:(intentId,options) => lifecycle('cancel',intentId,bound(options)),
      history:(request,options) => history(request,bound(options)),
      historyPages:(request,options) => historyPages(request,bound(options)),
      read:(request,options) => read(request,bound(options)),
      resultChunks:(request,options) => resultChunks(request,bound(options)),
      downloadResult:(request,options) => downloadResult(request,bound(options)),
    });
  }
  return Object.freeze({
    endpoint: transport.endpoint, discovery, workspace, workspaces, forWorkspace,
    allHistory, allHistoryPages, prepare, review, history, historyPages,
    execute: (intentId, options) => lifecycle('execute', intentId, options),
    status: (intentId, options) => lifecycle('status', intentId, options),
    recover: (intentId, options) => lifecycle('recover', intentId, options),
    cancel: (intentId, options) => lifecycle('cancel', intentId, options),
    read, resultChunks, downloadResult,
    close() {
      if (closing) return closing;
      closed = true; controller.abort();
      closing = Promise.allSettled([discovery.close(), ...pending]).then(() => {});
      return closing;
    },
  });
}
