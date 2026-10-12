// MIT. Complete paid creation and receiving through the caller's existing x402engine payment fetch.
import { readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { absolute, privateDirectory, readBytes, readJson, writeBytes, writeJson, jsonBytes, digest, exists } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { prepareBuyerResponseFile } from '../response-file.mjs';
import { withDeliveryLease } from '../../sf98-merchant-delivery/delivery-lock.mjs';
import { retainX402VideoJob, openX402VideoJob, openX402VideoExport } from './x402engine.mjs';

const SCHEMA = 'tjlabs.x402engine-video-mcp-operation.v1';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const MODELS = ['seedance-2.5', 'minimax-h3'];
const MAX_DOCUMENT = 1048576;
const DEFAULT_ORIGINS = ['https://x402engine.app', 'https://x402-gateway-production.up.railway.app'];
const now = () => new Date().toISOString();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class VideoMcpError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'VideoMcpError'; this.code = code; this.details = details; }
  toJSON() { return { error: this.code, ...this.details }; }
}
const need = (value, code) => { if (!value) throw new VideoMcpError(code); };
const errorCode = value => /^[A-Z][A-Z0-9_]{0,119}$/.test(value?.code ?? '') ? value.code : 'VIDEO_CREATION_REQUEST_FAILED';
const keyOf = value => { need(typeof value === 'string' && KEY.test(value), 'VIDEO_OPERATION_KEY_INVALID'); return value; };
const idOf = value => digest(Buffer.from(keyOf(value), 'utf8'));
function originOf(value) {
  let url;
  try { url = new URL(value); } catch { throw new VideoMcpError('VIDEO_GATEWAY_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
    (url.pathname === '/' || url.pathname === ''), 'VIDEO_GATEWAY_INVALID');
  return url.origin;
}
function bodyOf(model, prompt) {
  need(MODELS.includes(model), 'VIDEO_MODEL_INVALID');
  need(typeof prompt === 'string' && Buffer.byteLength(prompt, 'utf8') > 0 &&
    Buffer.byteLength(prompt, 'utf8') <= 2000, 'VIDEO_PROMPT_BYTE_LIMIT');
  return Buffer.from(JSON.stringify({ prompt }), 'utf8');
}
async function immutable(path, value) {
  const bytes = value instanceof Uint8Array ? value : jsonBytes(value);
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need(Buffer.from(await readBytes(path, MAX_DOCUMENT)).equals(Buffer.from(bytes)), 'VIDEO_OPERATION_SOURCE_CONFLICT');
  }
}
async function optional(path) {
  try { return await readJson(path, MAX_DOCUMENT); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function privateError(error) {
  const seen = new Map();
  const encode = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : { type: 'number', value: String(value) };
    if (['undefined', 'bigint', 'symbol', 'function'].includes(typeof value))
      return { type: typeof value, value: typeof value === 'function' ? value.name || '' : String(value) };
    if (seen.has(value)) return { reference: seen.get(value) };
    const id = seen.size + 1; seen.set(value, id);
    if (value instanceof Uint8Array) return { id, type: 'bytes',
      bytes: value.byteLength, base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
    const record = { id, type: Array.isArray(value) ? 'array' : value instanceof Error ? 'error' : 'object',
      properties: [] };
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      record.properties.push({ key: { type: typeof key, value: String(key) },
        enumerable: descriptor.enumerable,
        ...('value' in descriptor ? { value: encode(descriptor.value) } :
          { accessor: { get: Boolean(descriptor.get), set: Boolean(descriptor.set) } }) });
    }
    return record;
  };
  return encode(error);
}
async function smallResponseBody(response, signal, partialPath) {
  const chunks = []; let bytes = 0, complete = false;
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const read = () => new Promise((resolvePromise, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason ?? new VideoMcpError('VIDEO_CREATION_ABORTED')); };
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    if (signal?.aborted) return aborted();
    signal?.addEventListener('abort', aborted, { once: true });
    reader.read().then(value => { cleanup(); resolvePromise(value); }, error => { cleanup(); reject(error); });
  });
  try {
    for (;;) {
      const { done, value } = await read();
      if (done) break;
      need(value instanceof Uint8Array, 'VIDEO_CREATION_BODY_INVALID');
      if (value.byteLength > MAX_DOCUMENT - bytes) {
        const remaining = MAX_DOCUMENT - bytes;
        if (remaining) chunks.push(Buffer.from(value.subarray(0, remaining)));
        bytes = MAX_DOCUMENT;
        throw new VideoMcpError('VIDEO_CREATION_DOCUMENT_TOO_LARGE');
      }
      chunks.push(Buffer.from(value)); bytes += value.byteLength;
    }
    complete = true;
    return Buffer.concat(chunks);
  } catch (error) {
    if (bytes) await immutable(partialPath, Buffer.concat(chunks));
    throw error;
  } finally {
    if (!complete) { try { void reader.cancel().catch(() => {}); } catch {} }
    try { reader.releaseLock(); } catch {}
  }
}

/** getRequestFetch is the original package singleton; receivingFetch performs unpaid GETs only. */
export async function openX402VideoMcpWorkspace({
  directory = process.env.X402_VIDEO_DIRECTORY || resolve(homedir(), '.x402engine', 'video'),
  getRequestFetch, baseUrl = 'https://x402-gateway-production.up.railway.app',
  paymentHeader = '', devBypass = '', paymentContext = {}, receivingFetch,
  transport, requestTimeoutMs = 60000, maxVideoBytes = 268435456,
} = {}) {
  directory = absolute(directory);
  need(directory !== '/', 'VIDEO_WORKSPACE_ROOT_INVALID');
  await privateDirectory(directory);
  need(await realpath(directory) === directory, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  const operations = join(directory, 'operations');
  await privateDirectory(operations);
  need(await realpath(operations) === operations, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  need(getRequestFetch === undefined || typeof getRequestFetch === 'function', 'VIDEO_ORIGINAL_PAYMENT_FETCH_REQUIRED');
  need(receivingFetch === undefined || typeof receivingFetch === 'function', 'VIDEO_FETCH_INVALID');
  need(Number.isSafeInteger(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 2147483647,
    'VIDEO_REQUEST_TIMEOUT_INVALID');
  need(Number.isSafeInteger(maxVideoBytes) && maxVideoBytes > 0, 'VIDEO_SIZE_LIMIT_INVALID');
  need(typeof paymentHeader === 'string' && typeof devBypass === 'string' &&
    !/[\r\n]/.test(paymentHeader + devBypass), 'VIDEO_REQUEST_HEADER_INVALID');
  need(object(paymentContext) && Object.keys(paymentContext).every(key => ['network', 'maxPaymentUsd'].includes(key)) &&
    Object.values(paymentContext).every(value => typeof value === 'string'), 'VIDEO_PAYMENT_CONTEXT_INVALID');
  return new VideoMcpWorkspace({ directory, operations, getRequestFetch, baseUrl: originOf(baseUrl),
    paymentHeader, devBypass, paymentContext: { ...paymentContext }, receivingFetch, transport,
    requestTimeoutMs, maxVideoBytes });
}

class VideoMcpWorkspace {
  #config;
  constructor(config) { this.#config = config; this.directory = config.directory; }
  #paths(operationKey) {
    const id = idOf(operationKey), operation = join(this.#config.operations, id);
    const workspace = join(operation, 'workspace'), creation = join(workspace, 'mcp-creation');
    return { id, operation, workspace, creation };
  }
  async #directory(operationKey, create = false) {
    const paths = this.#paths(operationKey);
    for (const path of [paths.operation, paths.workspace, paths.creation]) {
      await privateDirectory(path, { create });
      need(await realpath(path) === path, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
    }
    return paths;
  }
  async #request(paths) {
    const request = await readJson(join(paths.creation, 'request.json'), MAX_DOCUMENT);
    need(request.schema === SCHEMA && request.id === paths.id && idOf(request.operationKey) === paths.id &&
      request.method === 'POST' && MODELS.includes(request.model) && typeof request.createdAt === 'string' &&
      request.bodyFile === 'request-body.json' && HASH.test(request.bodySha256) &&
      Number.isSafeInteger(request.maxVideoBytes) && request.maxVideoBytes > 0,
      'VIDEO_OPERATION_RECORD_INVALID');
    const body = await readBytes(join(paths.creation, 'request-body.json'), MAX_DOCUMENT);
    need(request.bodyBytes === body.length && request.bodySha256 === digest(body), 'VIDEO_OPERATION_SOURCE_CHANGED');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
    catch { throw new VideoMcpError('VIDEO_OPERATION_BODY_INVALID'); }
    need(object(value) && Object.keys(value).length === 1 && body.equals(bodyOf(request.model, value.prompt)),
      'VIDEO_OPERATION_BODY_INVALID');
    need(request.url === originOf(request.gateway) + '/api/video/' + request.model, 'VIDEO_OPERATION_SOURCE_CHANGED');
    return request;
  }
  async #job(paths) {
    return openX402VideoJob({ directory: paths.workspace, fetchImpl: this.#config.receivingFetch,
      transport: this.#config.transport, requestTimeoutMs: this.#config.requestTimeoutMs });
  }
  async #view(paths, request) {
    const dispatch = await optional(join(paths.creation, 'dispatch.json'));
    if (dispatch) need(dispatch.schema === SCHEMA && dispatch.operationId === paths.id &&
      dispatch.requestSha256 === request.bodySha256 && dispatch.method === 'POST', 'VIDEO_CREATION_DISPATCH_CHANGED');
    const response = await optional(join(paths.creation, 'response.json'));
    const saved = await optional(join(paths.creation, 'saved.json'));
    const failure = await optional(join(paths.creation, 'error.json'));
    const recovery = await optional(join(paths.creation, 'recovered-acceptance.json'));
    const hasJob = await exists(join(paths.workspace, 'origin.json')) && await exists(join(paths.workspace, 'state.json'));
    const receiving = hasJob ? await (await this.#job(paths)).inspect() : null;
    let state = 'PREPARED';
    if (dispatch) state = 'CREATION_UNCERTAIN';
    if (response && saved) state = response.httpStatus === 202 ? 'ACCEPTANCE_RETAINED' :
      response.httpStatus === 402 ? 'PAYMENT_REQUIRED' : 'CREATION_HTTP_ERROR';
    if (receiving) state = receiving.state === 'RECEIVED' ? 'RECEIVED' : 'ACCEPTED';
    return { schema: SCHEMA, id: paths.id, operationKey: request.operationKey, model: request.model,
      createdAt: request.createdAt, state, request: { bytes: request.bodyBytes, sha256: request.bodySha256 },
      creation: { dispatchedAt: dispatch?.dispatchedAt ?? null, httpStatus: response?.httpStatus ?? null,
        completeResponse: Boolean(saved), responseBytes: saved?.bytes ?? null,
        responseSha256: saved?.sha256 ?? null, lastError: failure?.code ?? null,
        recoveredAcceptance: Boolean(recovery) },
      receiving };
  }
  async #reconcile(paths, request) {
    const response = await optional(join(paths.creation, 'response.json'));
    const dispatch = await optional(join(paths.creation, 'dispatch.json'));
    if (dispatch) need(dispatch.schema === SCHEMA && dispatch.operationId === paths.id &&
      dispatch.requestSha256 === request.bodySha256 && /^[a-f0-9-]{36}$/.test(dispatch.preparationId) &&
      dispatch.bodyFile === 'preparations/' + dispatch.preparationId + '/response-body.bin',
      'VIDEO_CREATION_DISPATCH_CHANGED');
    const bodyPath = dispatch ? join(paths.creation, dispatch.bodyFile) : null;
    let saved = await optional(join(paths.creation, 'saved.json'));
    const recoveredMarker = await optional(join(paths.creation, 'recovered-acceptance.json'));
    if (response) need(response.schema === SCHEMA && response.operationId === paths.id &&
      response.requestSha256 === request.bodySha256 && Number.isInteger(response.httpStatus) &&
      response.httpStatus >= 100 && response.httpStatus <= 599 && object(response.headers) &&
      dispatch && response.preparationId === dispatch.preparationId && response.bodyFile === dispatch.bodyFile,
      'VIDEO_CREATION_RESPONSE_CHANGED');
    // SF31 publishes this destination only after full stream capture, fsync and close.
    if (response && bodyPath && await exists(bodyPath)) {
      const body = await readBytes(bodyPath, MAX_DOCUMENT);
      const actual = { file: dispatch.bodyFile, bytes: body.length, sha256: digest(body),
        contentType: response.headers?.['content-type'] ?? null };
      if (saved) need(saved.bytes === actual.bytes && saved.sha256 === actual.sha256 &&
        saved.file === actual.file && saved.contentType === actual.contentType, 'VIDEO_CREATION_RESPONSE_CHANGED');
      else { await immutable(join(paths.creation, 'saved.json'), actual); saved = actual; }
      if (response.httpStatus === 202 && !recoveredMarker) {
        await retainX402VideoJob({ directory: paths.workspace, acceptanceFile: bodyPath,
          statusOrigins: [...new Set([...DEFAULT_ORIGINS, request.gateway])],
          maxVideoBytes: request.maxVideoBytes, fetchImpl: this.#config.receivingFetch,
          transport: this.#config.transport, requestTimeoutMs: this.#config.requestTimeoutMs });
      }
    }
    if (recoveredMarker) {
      const recovered = recoveredMarker;
      const acceptanceFile = join(paths.creation, 'recovered-acceptance-body.json');
      const bytes = await readBytes(acceptanceFile, MAX_DOCUMENT);
      need(recovered.operationId === paths.id && recovered.requestSha256 === request.bodySha256 &&
        recovered.bytes === bytes.length && recovered.sha256 === digest(bytes), 'VIDEO_RECOVERED_ACCEPTANCE_CHANGED');
      await retainX402VideoJob({ directory: paths.workspace, acceptanceFile,
        statusOrigins: [...new Set([...DEFAULT_ORIGINS, request.gateway])],
        maxVideoBytes: request.maxVideoBytes, fetchImpl: this.#config.receivingFetch,
        transport: this.#config.transport, requestTimeoutMs: this.#config.requestTimeoutMs });
    }
    return this.#view(paths, request);
  }
  async create({ operationKey, model, prompt, signal } = {}) {
    keyOf(operationKey);
    const body = bodyOf(model, prompt), paths = await this.#directory(operationKey, true);
    need(signal === undefined || signal instanceof AbortSignal, 'VIDEO_ABORT_SIGNAL_INVALID');
    return withDeliveryLease(paths.operation, async () => {
      const bodyPath = join(paths.creation, 'request-body.json'), requestPath = join(paths.creation, 'request.json');
      await immutable(bodyPath, body);
      let request = await optional(requestPath);
      if (!request) {
        request = { schema: SCHEMA, id: paths.id, operationKey, model, method: 'POST',
          gateway: this.#config.baseUrl, url: this.#config.baseUrl + '/api/video/' + model,
          bodyFile: 'request-body.json', bodyBytes: body.length, bodySha256: digest(body), createdAt: now(),
          maxVideoBytes: this.#config.maxVideoBytes,
          payment: { authority: 'ORIGINAL_X402ENGINE_GET_REQUEST_FETCH', context: this.#config.paymentContext,
            hasPaymentHeader: Boolean(this.#config.paymentHeader), hasDevBypass: Boolean(this.#config.devBypass) } };
        await immutable(requestPath, request);
      }
      request = await this.#request(paths);
      need(request.model === model && request.gateway === this.#config.baseUrl &&
        request.bodySha256 === digest(body), 'VIDEO_OPERATION_KEY_REUSED_WITH_DIFFERENT_INPUT');
      if (await exists(join(paths.creation, 'dispatch.json')) ||
          await exists(join(paths.creation, 'recovered-acceptance.json'))) return this.#reconcile(paths, request);
      // A lost local reservation never occupies the next undispatched preparation.
      // Every abandoned generation stays in the same original workspace and export.
      const preparationId = randomUUID();
      const preparation = join(paths.creation, 'preparations', preparationId);
      await privateDirectory(preparation);
      need(await realpath(preparation) === preparation, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
      const responseBodyFile = 'preparations/' + preparationId + '/response-body.bin';
      await immutable(join(preparation, 'preparation.json'), {
        schema: SCHEMA, operationId: paths.id, requestSha256: request.bodySha256, preparationId,
        bodyFile: responseBodyFile, preparedAt: now(), paymentContext: this.#config.paymentContext });
      let writer, response, phase = 'PREPARATION', cleanupError = null;
      try {
        need(!signal?.aborted, 'VIDEO_CREATION_ABORTED_BEFORE_DISPATCH');
        need(this.#config.getRequestFetch, 'VIDEO_ORIGINAL_PAYMENT_FETCH_REQUIRED');
        let requestFetch;
        try { requestFetch = await this.#config.getRequestFetch(); }
        catch (error) {
          throw Object.assign(new Error('Original x402engine payment configuration could not be opened', { cause: error }),
            { code: 'VIDEO_PAYMENT_CONFIGURATION_FAILED' });
        }
        need(typeof requestFetch === 'function', 'VIDEO_ORIGINAL_PAYMENT_FETCH_REQUIRED');
        const signalForRequest = AbortSignal.any([AbortSignal.timeout(this.#config.requestTimeoutMs),
          ...(signal ? [signal] : [])]);
        writer = await prepareBuyerResponseFile({ destination: join(paths.creation, responseBodyFile),
          maxBytes: MAX_DOCUMENT, timeoutMs: this.#config.requestTimeoutMs,
          reservationTag: 'video-create-' + preparationId, signal: signalForRequest });
        need(!signalForRequest.aborted, 'VIDEO_CREATION_ABORTED_BEFORE_DISPATCH');
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (this.#config.paymentHeader) headers['X-PAYMENT'] = this.#config.paymentHeader;
        if (this.#config.devBypass) headers['X-DEV-BYPASS'] = this.#config.devBypass;
        await immutable(join(paths.creation, 'dispatch.json'), { schema: SCHEMA, operationId: paths.id,
          requestSha256: request.bodySha256, dispatchedAt: now(), method: 'POST', preparationId,
          bodyFile: responseBodyFile, providerIdempotency: 'NOT_DOCUMENTED',
          paymentAuthority: 'ORIGINAL_X402ENGINE_GET_REQUEST_FETCH', paymentContext: this.#config.paymentContext });
        phase = 'DISPATCH';
        response = await requestFetch(request.url, {
          method: 'POST', headers, body: body.toString('utf8'), redirect: 'manual', signal: signalForRequest });
        need(response instanceof Response && (!response.url || response.url === request.url),
          'VIDEO_CREATION_RESPONSE_ORIGIN_CHANGED');
        const responseRecord = { schema: SCHEMA, operationId: paths.id, requestSha256: request.bodySha256,
          preparationId, bodyFile: responseBodyFile, observedAt: now(), httpStatus: response.status,
          headers: Object.fromEntries(response.headers.entries()) };
        await immutable(join(paths.creation, 'response.json'), responseRecord);
        if (response.ok) await writer.save({ response }, { signal: signalForRequest });
        else {
          const bytes = await smallResponseBody(response, signalForRequest, join(preparation, 'error-body.partial'));
          await writer.saveBytes(bytes, { contentType: response.headers.get('content-type') ?? 'application/octet-stream',
            signal: signalForRequest });
        }
        return await this.#reconcile(paths, request);
      } catch (error) {
        try { await writer?.abort(); } catch (failure) { cleanupError = privateError(failure); }
        const failure = { schema: SCHEMA, operationId: paths.id, requestSha256: request.bodySha256,
          preparationId, phase, code: errorCode(error), recordedAt: now(),
          dispatchPublished: await exists(join(paths.creation, 'dispatch.json')),
          responsePublished: await exists(join(paths.creation, responseBodyFile)),
          receivedBytes: Number.isSafeInteger(error.bytes) ? error.bytes : null,
          detail: privateError(error), cleanupError };
        await writeJson(join(preparation, 'error.json'), failure);
        await writeJson(join(paths.creation, failure.dispatchPublished ? 'error.json' : 'preparation-error.json'), failure);
        throw new VideoMcpError(errorCode(error), { operationKey, operationId: paths.id,
          action: failure.dispatchPublished ?
            'Inspect this operation and recover its original acceptance before another creation request.' :
            'Correct the recorded preparation failure and reopen this same operation.' });
      } finally {
        if (response?.body && !response.bodyUsed && !response.body.locked) {
          try { void response.body.cancel().catch(() => {}); } catch {}
        }
      }
    }, { purpose: 'drain' });
  }
  async inspect(operationKey) {
    const paths = await this.#directory(operationKey);
    return this.#view(paths, await this.#request(paths));
  }
  async status(operationKey, { signal } = {}) {
    const paths = await this.#directory(operationKey);
    return withDeliveryLease(paths.operation, async () => {
      const request = await this.#request(paths);
      const view = await this.#reconcile(paths, request);
      if (view.receiving) await (await this.#job(paths)).poll({ signal });
      return this.#view(paths, request);
    }, { purpose: 'drain' });
  }
  async receive(operationKey, { signal, deadlineMs = 1800000, output } = {}) {
    const paths = await this.#directory(operationKey);
    return withDeliveryLease(paths.operation, async () => {
      const request = await this.#request(paths);
      const view = await this.#reconcile(paths, request);
      need(view.receiving, 'VIDEO_ORIGINAL_ACCEPTANCE_REQUIRED');
      const video = await (await this.#job(paths)).receive({ signal, deadlineMs });
      if (output) await video.saveAs(absolute(output));
      return { operation: await this.#view(paths, request), result: { ...video._metadata() },
        output: output ? { path: absolute(output), bytes: video._metadata().bytes, sha256: video._metadata().sha256 } : null };
    }, { purpose: 'drain' });
  }
  async result(operationKey) {
    const paths = await this.#directory(operationKey);
    await this.#request(paths);
    return (await this.#job(paths)).result();
  }
  async recoverAcceptance({ operationKey, acceptanceFile, sourceReference } = {}) {
    need(typeof sourceReference === 'string' && sourceReference.trim().length > 0 &&
      Buffer.byteLength(sourceReference, 'utf8') <= 4096, 'VIDEO_RECOVERY_SOURCE_REFERENCE_REQUIRED');
    acceptanceFile = absolute(acceptanceFile);
    const paths = await this.#directory(operationKey);
    return withDeliveryLease(paths.operation, async () => {
      const request = await this.#request(paths);
      const view = await this.#view(paths, request);
      if (view.receiving) return view;
      need(await exists(join(paths.creation, 'dispatch.json')), 'VIDEO_ORIGINAL_DISPATCH_REQUIRED');
      const bytes = await readBytes(acceptanceFile, MAX_DOCUMENT);
      // Validate the complete recovered document before publishing it to the original operation.
      let document;
      try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new VideoMcpError('VIDEO_DOCUMENT_JSON_INVALID'); }
      let status;
      try { status = new URL(document?.status_url); } catch { throw new VideoMcpError('VIDEO_ACCEPTANCE_INVALID'); }
      need(object(document) && typeof document.status_url === 'string' && document.status_url.length <= 16384 && status.protocol === 'https:' && !status.username && !status.password && !status.hash &&
        [...DEFAULT_ORIGINS, request.gateway].includes(status.origin), 'VIDEO_ACCEPTANCE_INVALID');
      const retained = join(paths.creation, 'recovered-acceptance-body.json');
      await immutable(retained, bytes);
      const existing = await optional(join(paths.creation, 'recovered-acceptance.json'));
      if (!existing) await immutable(join(paths.creation, 'recovered-acceptance.json'), {
        schema: SCHEMA, kind: 'RECOVERED_ACCEPTANCE_DOCUMENT', operationId: paths.id,
        requestSha256: request.bodySha256, originalPath: acceptanceFile, sourceReference,
        bytes: bytes.length, sha256: digest(bytes), recoveredAt: now() });
      return this.#reconcile(paths, request);
    }, { purpose: 'drain' });
  }
  async exportWorkspace(operationKey, destination) {
    const paths = await this.#directory(operationKey);
    return withDeliveryLease(paths.operation, async () => {
      const request = await this.#request(paths);
      const view = await this.#reconcile(paths, request);
      need(view.receiving, 'VIDEO_ORIGINAL_ACCEPTANCE_REQUIRED');
      return (await this.#job(paths)).exportWorkspace(absolute(destination));
    }, { purpose: 'drain' });
  }
  async openExport(directory) {
    const job = await openX402VideoExport({ directory: absolute(directory),
      fetchImpl: this.#config.receivingFetch, transport: this.#config.transport,
      requestTimeoutMs: this.#config.requestTimeoutMs });
    const receiving = await job.inspect();
    const original = await optional(join(job.directory, 'mcp-creation', 'request.json'));
    const result = receiving.state === 'RECEIVED' ? { ...(await job.result())._metadata() } : null;
    return { directory: absolute(directory), workspaceDirectory: job.directory,
      operationKey: original?.operationKey ?? null, receiving, result };
  }
  async workspacePath(operationKey) {
    const paths = await this.#directory(operationKey);
    await this.#request(paths);
    await this.#job(paths);
    return paths.workspace;
  }
  async list({ cursor, limit = 50 } = {}) {
    need(Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'VIDEO_LIST_LIMIT_INVALID');
    need(cursor === undefined || typeof cursor === 'string' && HASH.test(cursor), 'VIDEO_LIST_CURSOR_INVALID');
    const names = (await readdir(this.#config.operations, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && HASH.test(entry.name)).map(entry => entry.name).sort()
      .filter(name => !cursor || name > cursor);
    const selected = names.slice(0, limit), entries = [];
    for (const id of selected) {
      const requestPath = join(this.#config.operations, id, 'workspace', 'mcp-creation', 'request.json');
      try {
        const request = await readJson(requestPath, MAX_DOCUMENT);
        need(idOf(request.operationKey) === id, 'VIDEO_OPERATION_RECORD_INVALID');
        entries.push(await this.inspect(request.operationKey));
      } catch (error) { entries.push({ id, state: 'READ_ERROR', error: errorCode(error) }); }
    }
    return { schema: SCHEMA, entries, nextCursor: names.length > limit ? selected.at(-1) : null,
      complete: names.length <= limit };
  }
}
