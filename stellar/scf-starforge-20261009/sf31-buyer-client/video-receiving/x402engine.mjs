// MIT. Receive x402engine's existing asynchronous video job through native SF31 files.
import { constants } from 'node:fs';
import { open, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createPublicHttpsFetch } from '../public-transport.mjs';
import { prepareBuyerResponseFile } from '../response-file.mjs';
import { VerifiedFile } from '../../sf88-operator-buyer-cli/node/result.mjs';
import { absolute, privateDirectory, readBytes, readJson, writeBytes, writeJson,
  jsonBytes, digest, exists } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { withDeliveryLease } from '../../sf98-merchant-delivery/delivery-lock.mjs';

const SCHEMA = 'tjlabs.x402engine-video-receiving.v1';
const ORIGINS = ['https://x402engine.app', 'https://x402-gateway-production.up.railway.app'];
const HASH = /^[a-f0-9]{64}$/;
const MAX_DOCUMENT = 1048576;
const MIN_POLL_MS = 5000;
const now = () => new Date().toISOString();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class VideoReceivingError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
  toJSON() { return { error: this.code, ...this.details }; }
}
const need = (condition, code) => { if (!condition) throw new VideoReceivingError(code); };
const codeOf = error => /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code ?? '') ? error.code : 'VIDEO_RECEIVING_FAILED';
const json = bytes => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new VideoReceivingError('VIDEO_DOCUMENT_JSON_INVALID'); }
};
function https(value) {
  need(typeof value === 'string' && value.length <= 16384, 'VIDEO_URL_INVALID');
  let url; try { url = new URL(value); } catch { throw new VideoReceivingError('VIDEO_URL_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'VIDEO_URL_INVALID');
  return url;
}
function accepted(value, origins) {
  need(object(value), 'VIDEO_ACCEPTANCE_INVALID');
  const url = https(value.status_url);
  need(origins.includes(url.origin), 'VIDEO_STATUS_ORIGIN_NOT_SELECTED');
  return { statusUrl: url.href };
}
function media(value, maxBytes) {
  need(object(value) && value.status === 'completed' && object(value.video), 'VIDEO_RESULT_NOT_COMPLETE');
  const url = https(value.video.url);
  const size = value.video.file_size, type = value.video.content_type;
  need(size === undefined || Number.isSafeInteger(size) && size >= 0 && size <= maxBytes,
    'VIDEO_DECLARED_SIZE_INVALID');
  need(type === undefined || typeof type === 'string' && /^video\/[A-Za-z0-9!#$&^_.+-]+$/.test(type),
    'VIDEO_DECLARED_TYPE_INVALID');
  return { url: url.href, ...(size === undefined ? {} : { expectedBytes: size }),
    ...(type === undefined ? {} : { expectedContentType: type }) };
}
function safeRelative(value) {
  need(typeof value === 'string' && value !== '' && !value.includes('\\') && !value.includes('\0') &&
    !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'),
    'VIDEO_LOCAL_PATH_INVALID');
  return value;
}
class ReceivedFile extends VerifiedFile {
  constructor(metadata) { super(); this.saved = Object.freeze({ ...metadata }); }
  _metadata() { return this.saved; }
}
async function metadata(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile(), 'VIDEO_RESULT_FILE_REQUIRED');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536); let bytes = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      bytes += bytesRead; hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    need(after.size === before.size && after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs && bytes === before.size, 'VIDEO_LOCAL_FILE_CHANGED');
    return { path, bytes, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
async function immutable(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readBytes(path, Math.max(bytes.length, MAX_DOCUMENT))).equals(bytes), 'VIDEO_ORIGINAL_SOURCE_CHANGED');
  }
}
async function optional(path) { return await exists(path) ? readJson(path, MAX_DOCUMENT) : null; }
async function delay(ms, signal) {
  need(!signal?.aborted, 'VIDEO_RECEIVING_ABORTED');
  await new Promise((done, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new VideoReceivingError('VIDEO_RECEIVING_ABORTED')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); done(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** A saved document retains document provenance; an SF88 result retains its original native record. */
export async function retainX402VideoJob({ directory, result, acceptanceFile, statusOrigins = ORIGINS,
  maxVideoBytes = 268435456, transport, fetchImpl, requestTimeoutMs } = {}) {
  directory = absolute(directory);
  need((result !== undefined) !== (acceptanceFile !== undefined), 'VIDEO_ONE_ACCEPTANCE_SOURCE_REQUIRED');
  need(Array.isArray(statusOrigins) && statusOrigins.length > 0 &&
    statusOrigins.every(origin => https(origin).origin === origin), 'VIDEO_STATUS_ORIGINS_INVALID');
  need(Number.isSafeInteger(maxVideoBytes) && maxVideoBytes > 0, 'VIDEO_SIZE_LIMIT_INVALID');
  let bytes, source;
  if (result !== undefined) {
    need(typeof result?.bytes === 'function' && object(result.record) && result.native?.httpStatus === 202,
      'VIDEO_ORIGINAL_202_REQUIRED');
    bytes = Buffer.from(await result.bytes({ limit: MAX_DOCUMENT }));
    source = { kind: 'SF88_SAVED_HTTP_RESPONSE', nativeRecord: result.record };
  } else {
    acceptanceFile = absolute(acceptanceFile);
    bytes = await readBytes(acceptanceFile, MAX_DOCUMENT);
    source = { kind: 'SAVED_DOCUMENT', originalPath: acceptanceFile };
  }
  accepted(json(bytes), statusOrigins);
  const origin = { schema: SCHEMA, acceptanceSha256: digest(bytes), source,
    statusOrigins: [...new Set(statusOrigins)], maxVideoBytes };
  need(jsonBytes(origin).length <= MAX_DOCUMENT, 'VIDEO_SOURCE_RECORD_TOO_LARGE');
  await privateDirectory(directory);
  need(await realpath(directory) === directory, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  await withDeliveryLease(directory, async () => {
    await immutable(join(directory, 'acceptance.json'), bytes);
    await immutable(join(directory, 'origin.json'), origin);
    if (!await exists(join(directory, 'state.json'))) await writeJson(join(directory, 'state.json'), {
      schema: SCHEMA, acceptanceSha256: origin.acceptanceSha256, retainedAt: now(),
      revision: 0, nextPollAt: 0, latest: null, pending: null, delivery: null,
    }, { exclusive: true });
  }, { purpose: 'drain' });
  return openX402VideoJob({ directory, transport, fetchImpl, requestTimeoutMs });
}

export async function openX402VideoJob({ directory, transport, fetchImpl, requestTimeoutMs = 60000 } = {}) {
  directory = absolute(directory);
  await privateDirectory(directory, { create: false });
  need(await realpath(directory) === directory, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  const origin = await readJson(join(directory, 'origin.json'), MAX_DOCUMENT);
  const bytes = await readBytes(join(directory, 'acceptance.json'), MAX_DOCUMENT);
  need(origin.schema === SCHEMA && HASH.test(origin.acceptanceSha256) && digest(bytes) === origin.acceptanceSha256,
    'VIDEO_ORIGINAL_SOURCE_CHANGED');
  need(Number.isSafeInteger(origin.maxVideoBytes) && origin.maxVideoBytes > 0 &&
    Array.isArray(origin.statusOrigins), 'VIDEO_ORIGIN_INVALID');
  const acceptance = accepted(json(bytes), origin.statusOrigins);
  need(fetchImpl === undefined || typeof fetchImpl === 'function', 'VIDEO_FETCH_INVALID');
  const fetch = fetchImpl ?? createPublicHttpsFetch({ timeoutMs: requestTimeoutMs, trustedProxy: transport ?? null });
  const receiver = new X402VideoJob(directory, origin, acceptance, fetch, requestTimeoutMs);
  await receiver.inspect();
  return receiver;
}

class X402VideoJob {
  #origin; #acceptance; #fetch; #timeout;
  constructor(directory, origin, acceptance, fetch, timeout) {
    this.directory = directory; this.#origin = origin; this.#acceptance = acceptance;
    this.#fetch = fetch; this.#timeout = timeout;
  }
  async #state() {
    const state = await readJson(join(this.directory, 'state.json'), MAX_DOCUMENT);
    need(state.schema === SCHEMA && state.acceptanceSha256 === this.#origin.acceptanceSha256 &&
      Number.isSafeInteger(state.revision) && state.revision >= 0 &&
      Number.isFinite(state.nextPollAt), 'VIDEO_STATE_INVALID');
    return state;
  }
  async #save(state) { state.revision++; await writeJson(join(this.directory, 'state.json'), state); }
  #path(path) { return join(this.directory, safeRelative(path)); }
  #view(state) {
    return { schema: SCHEMA, id: state.acceptanceSha256, retainedAt: state.retainedAt,
      revision: state.revision, sourceKind: this.#origin.source.kind,
      state: state.delivery ? 'RECEIVED' : state.latest?.media ? 'READY' :
        state.latest?.error ? 'RECEIVING_ERROR' : state.latest?.providerStatus ?? 'WAITING',
      nextPollAt: state.nextPollAt ? new Date(state.nextPollAt).toISOString() : null,
      lastReceivingError: state.lastReceivingError ?? null,
      latestObservation: state.latest ? { id: state.latest.id, httpStatus: state.latest.httpStatus,
        providerStatus: state.latest.providerStatus, observedAt: state.latest.observedAt,
        error: state.latest.error ?? null } : null,
      delivery: state.delivery ? { file: state.delivery.file, bytes: state.delivery.bytes,
        sha256: state.delivery.sha256, contentType: state.delivery.contentType,
        receivedAt: state.delivery.receivedAt } : null,
      pending: state.pending ? { id: state.pending.id, kind: state.pending.kind } : null };
  }
  async inspect() { return this.#view(await this.#state()); }
  async #apply(state, attempt, response, saved) {
    const stored = { bytes: saved.bytes, sha256: saved.sha256, file: relative(this.directory, saved.path),
      contentType: response.headers['content-type'] ?? null };
    await immutable(this.#path(attempt.directory + '/saved.json'), stored);
    if (attempt.kind === 'status') {
      const raw = await readBytes(saved.path, MAX_DOCUMENT);
      let value, parseError;
      try { value = json(raw); } catch (error) { parseError = codeOf(error); }
      const providerStatus = object(value) && typeof value.status === 'string' &&
        /^[A-Za-z][A-Za-z0-9 _-]{0,79}$/.test(value.status) ? value.status : null;
      const latest = { id: attempt.id, httpStatus: response.httpStatus, observedAt: response.observedAt,
        bodyFile: stored.file, bodySha256: saved.sha256, providerStatus,
        error: response.httpStatus < 200 || response.httpStatus >= 300 ? 'VIDEO_STATUS_HTTP_ERROR' :
          parseError ?? (providerStatus ? null : 'VIDEO_STATUS_VALUE_MISSING') };
      if (!latest.error && providerStatus === 'completed') {
        try { latest.media = media(value, this.#origin.maxVideoBytes); }
        catch (error) { latest.error = codeOf(error); }
      }
      state.latest = latest;
    } else {
      try {
      need(response.httpStatus === 200, 'VIDEO_MEDIA_HTTP_ERROR');
      const type = response.headers['content-type']?.split(';', 1)[0]?.trim()?.toLowerCase() ?? '';
      need(/^video\//.test(type), 'VIDEO_MEDIA_TYPE_REQUIRED');
      need(saved.bytes > 0 && saved.bytes <= this.#origin.maxVideoBytes, 'VIDEO_MEDIA_SIZE_INVALID');
      if (attempt.expectedBytes !== undefined) need(saved.bytes === attempt.expectedBytes, 'VIDEO_MEDIA_SIZE_MISMATCH');
      if (attempt.expectedContentType !== undefined) need(type === attempt.expectedContentType, 'VIDEO_MEDIA_TYPE_MISMATCH');
      state.delivery = { file: stored.file, bytes: saved.bytes, sha256: saved.sha256,
        contentType: type, receivedAt: now(), statusObservation: attempt.statusObservation,
        sourceUrl: attempt.url, acceptanceSha256: state.acceptanceSha256 };
      state.lastReceivingError = null;
      } catch (error) {
        state.lastReceivingError = { id: attempt.id, code: codeOf(error), observedAt: response.observedAt };
        state.pending = null; await this.#save(state); throw error;
      }
    }
    state.pending = null;
    await this.#save(state);
  }
  async #recover(state) {
    const attempt = state.pending;
    if (!attempt) return;
    safeRelative(attempt.directory);
    const response = await optional(this.#path(attempt.directory + '/response.json'));
    const path = this.#path(attempt.directory + '/body.bin');
    if (response && await exists(path)) {
      // SF31 publishes body.bin only after complete capture, sync and close.
      const saved = await metadata(path);
      await this.#apply(state, attempt, response, saved);
      return;
    }
    await immutable(this.#path(attempt.directory + '/interruption.json'), {
      schema: SCHEMA, attemptId: attempt.id, kind: attempt.kind, originalRequest: attempt.url,
      outcome: 'RECEIVING_INTERRUPTED', attemptStartedAt: attempt.startedAt,
    });
    state.pending = null;
    await this.#save(state);
  }
  async #begin(state, kind, url, extra = {}) {
    const id = randomUUID(), directory = 'attempts/' + id;
    await mkdir(join(this.directory, 'attempts'), { mode: 0o700, recursive: true });
    await mkdir(this.#path(directory), { mode: 0o700 });
    const attempt = { id, directory, kind, url, startedAt: now(), ...extra };
    await immutable(this.#path(directory + '/request.json'), {
      ...attempt, method: 'GET', paymentBehavior: 'UNPAID_FOLLOW_UP',
      acceptanceSha256: state.acceptanceSha256,
    });
    state.pending = attempt;
    if (kind === 'status') state.nextPollAt = Date.now() + MIN_POLL_MS;
    await this.#save(state);
    return attempt;
  }
  async #capture(state, attempt, signal) {
    const destination = this.#path(attempt.directory + '/body.bin');
    const maxBytes = attempt.kind === 'status' ? MAX_DOCUMENT : this.#origin.maxVideoBytes;
    const writer = await prepareBuyerResponseFile({ destination, maxBytes, timeoutMs: this.#timeout,
      reservationTag: 'x402engine-' + attempt.id, signal });
    let response, responseRecord;
    try {
      let url = attempt.url; const hops = [];
      for (;;) {
        need(!signal?.aborted, 'VIDEO_RECEIVING_ABORTED');
        response = await this.#fetch(url, { method: 'GET',
          headers: { accept: attempt.kind === 'status' ? 'application/json' : 'video/*' },
          redirect: 'manual', signal });
        need(response instanceof Response && (!response.url || response.url === url), 'VIDEO_RESPONSE_ORIGIN_CHANGED');
        const headers = Object.fromEntries(response.headers.entries());
        hops.push({ url, httpStatus: response.status, headers });
        if (attempt.kind !== 'media' || ![301, 302, 303, 307, 308].includes(response.status)) break;
        need(hops.length <= 5 && headers.location, 'VIDEO_REDIRECT_INVALID');
        const next = https(new URL(headers.location, url).href).href;
        await response.body?.cancel();
        url = next;
      }
      responseRecord = { schema: SCHEMA, attemptId: attempt.id, requestedUrl: attempt.url,
        finalUrl: url, observedAt: now(), httpStatus: response.status,
        headers: Object.fromEntries(response.headers.entries()), hops };
      await immutable(this.#path(attempt.directory + '/response.json'), responseRecord);
      if (!response.ok) {
        const chunks = []; let total = 0;
        if (response.body) for await (const chunk of response.body) {
          total += chunk.length; need(total <= MAX_DOCUMENT, 'VIDEO_ERROR_BODY_TOO_LARGE'); chunks.push(Buffer.from(chunk));
        }
        const saved = await writer.saveBytes(Buffer.concat(chunks), {
          contentType: response.headers.get('content-type') ?? 'application/octet-stream', signal });
        if (attempt.kind === 'status') await this.#apply(state, attempt, responseRecord, saved);
        else { state.lastReceivingError = { id: attempt.id, code: 'VIDEO_MEDIA_HTTP_ERROR',
          httpStatus: response.status, observedAt: responseRecord.observedAt };
          state.pending = null; await this.#save(state); }
        throw new VideoReceivingError(response.status === 402 ? 'VIDEO_FOLLOW_UP_PAYMENT_REQUESTED' :
          [401, 403, 410].includes(response.status) ? 'VIDEO_STATUS_ACCESS_EXPIRED_OR_DENIED' : 'VIDEO_FOLLOW_UP_HTTP_ERROR',
          { httpStatus: response.status });
      }
      need(!response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity',
        'VIDEO_ENCODING_UNSUPPORTED');
      if (attempt.kind === 'media') need(response.status === 200, 'VIDEO_COMPLETE_MEDIA_RESPONSE_REQUIRED');
      const saved = await writer.save({ response }, { signal });
      await this.#apply(state, attempt, responseRecord, saved);
      return state;
    } catch (error) {
      await writer.abort().catch(() => {});
      await immutable(this.#path(attempt.directory + '/error.json'), {
        schema: SCHEMA, code: codeOf(error), at: now(),
        ...(Number.isSafeInteger(error.bytes) ? { receivedBytes: error.bytes } : {}),
        ...(typeof error.partialPath === 'string' ? { partialFile: relative(this.directory, error.partialPath) } : {}),
      });
      // Retain published bytes for recovery if writing the final state failed.
      if (!await exists(destination)) { state.pending = null; await this.#save(state); }
      throw error;
    } finally {
      if (response?.body && !response.body.locked && !response.bodyUsed) await response.body.cancel().catch(() => {});
    }
  }
  async poll({ signal } = {}) {
    return withDeliveryLease(this.directory, async () => {
      const state = await this.#state(); await this.#recover(state);
      if (state.delivery || state.latest?.media || Date.now() < state.nextPollAt) return this.#view(state);
      const attempt = await this.#begin(state, 'status', this.#acceptance.statusUrl);
      await this.#capture(state, attempt, signal);
      return this.#view(state);
    }, { purpose: 'drain' });
  }
  async wait({ signal, deadlineMs = 1800000 } = {}) {
    need(Number.isSafeInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 86400000, 'VIDEO_WAIT_DEADLINE_INVALID');
    const end = Date.now() + deadlineMs;
    for (;;) {
      const current = await this.poll({ signal });
      if (current.state === 'READY' || current.state === 'RECEIVED') return current;
      if (['failed', 'error', 'cancelled', 'canceled'].includes(current.state))
        throw new VideoReceivingError('VIDEO_PROVIDER_JOB_FAILED', { providerStatus: current.state });
      const remaining = end - Date.now();
      need(remaining > 0, 'VIDEO_WAIT_DEADLINE_REACHED');
      await delay(Math.min(remaining, Math.max(1, Date.parse(current.nextPollAt) - Date.now())), signal);
    }
  }
  async receive(options = {}) {
    await this.wait(options);
    return withDeliveryLease(this.directory, async () => {
      const state = await this.#state(); await this.#recover(state);
      if (!state.delivery) {
        need(state.latest?.media, 'VIDEO_RESULT_NOT_COMPLETE');
        const attempt = await this.#begin(state, 'media', state.latest.media.url,
          { ...state.latest.media, statusObservation: state.latest.id });
        await this.#capture(state, attempt, options.signal);
      }
      return this.result();
    }, { purpose: 'drain' });
  }
  async result() {
    const state = await this.#state(), delivery = state.delivery;
    need(delivery && HASH.test(delivery.sha256) && delivery.acceptanceSha256 === state.acceptanceSha256,
      'VIDEO_RESULT_NOT_RECEIVED');
    const result = new ReceivedFile({ path: this.#path(delivery.file), bytes: delivery.bytes,
      sha256: delivery.sha256, contentType: delivery.contentType });
    await result.verify();
    return result;
  }
  async exportWorkspace(destination) {
    destination = absolute(destination);
    need(await realpath(dirname(destination)) === dirname(destination), 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
    if (await exists(destination)) need(await realpath(destination) === destination, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
    need(destination !== this.directory && !destination.startsWith(this.directory + '/') &&
      !this.directory.startsWith(destination + '/'), 'VIDEO_EXPORT_DIRECTORY_OVERLAP');
    return withDeliveryLease(this.directory, async () => {
      const state = await this.#state(); await this.#recover(state);
      const files = [];
      const walk = async directory => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (directory === this.directory && entry.name === '.sf98-delivery.lock') continue;
          const path = join(directory, entry.name);
          need(!entry.isSymbolicLink(), 'VIDEO_EXPORT_LINK_UNSUPPORTED');
          if (entry.isDirectory()) await walk(path);
          else {
            need(entry.isFile(), 'VIDEO_EXPORT_FILE_REQUIRED');
            const saved = await metadata(path);
            files.push({ file: relative(this.directory, path), bytes: saved.bytes, sha256: saved.sha256 });
          }
        }
      };
      await walk(this.directory);
      files.sort((a, b) => a.file.localeCompare(b.file));
      const manifest = { schema: 'tjlabs.x402engine-video-workspace.v1',
        acceptanceSha256: state.acceptanceSha256, sourceRevision: state.revision, files };
      await mkdir(destination, { mode: 0o700 }).catch(async error => {
        if (error.code !== 'EEXIST') throw error;
        await privateDirectory(destination, { create: false });
        const original = await optional(join(destination, 'export-plan.json'));
        need(original && JSON.stringify(original) === JSON.stringify(manifest), 'VIDEO_EXPORT_DESTINATION_CONFLICT');
      });
      await immutable(join(destination, 'export-plan.json'), manifest);
      for (const saved of files) {
        const target = join(destination, 'workspace', saved.file);
        await mkdir(dirname(target), { mode: 0o700, recursive: true });
        const source = new ReceivedFile({ ...saved, path: this.#path(saved.file) });
        if (await exists(target)) await new ReceivedFile({ ...saved, path: target }).verify();
        else await source.saveAs(target);
      }
      await immutable(join(destination, 'complete.json'), {
        schema: manifest.schema, state: 'COMPLETE', manifestSha256: digest(jsonBytes(manifest)),
        acceptanceSha256: state.acceptanceSha256, files: files.length,
        bytes: files.reduce((sum, item) => sum + item.bytes, 0),
      });
      return { directory: destination, workspace: join(destination, 'workspace'), files: files.length,
        bytes: files.reduce((sum, item) => sum + item.bytes, 0), state: 'COMPLETE' };
    }, { purpose: 'drain' });
  }
}

export async function openX402VideoExport({ directory, ...options } = {}) {
  directory = absolute(directory);
  need(await realpath(directory) === directory, 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  const manifest = await readJson(join(directory, 'export-plan.json'), 16777216);
  const complete = await readJson(join(directory, 'complete.json'));
  need(manifest.schema === 'tjlabs.x402engine-video-workspace.v1' &&
    complete.state === 'COMPLETE' && complete.manifestSha256 === digest(jsonBytes(manifest)) &&
    complete.acceptanceSha256 === manifest.acceptanceSha256, 'VIDEO_EXPORT_INCOMPLETE');
  need(Array.isArray(manifest.files), 'VIDEO_EXPORT_MANIFEST_INVALID');
  const seen = new Set();
  for (const item of manifest.files) {
    safeRelative(item.file);
    need(!seen.has(item.file) && HASH.test(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes >= 0,
      'VIDEO_EXPORT_MANIFEST_INVALID');
    seen.add(item.file);
    const filePath = join(directory, 'workspace', item.file);
    need(await realpath(filePath) === filePath, 'VIDEO_EXPORT_LINK_UNSUPPORTED');
    await new ReceivedFile({ ...item, path: join(directory, 'workspace', item.file) }).verify();
  }
  const job = await openX402VideoJob({ ...options, directory: join(directory, 'workspace') });
  need((await job.inspect()).id === manifest.acceptanceSha256, 'VIDEO_EXPORT_SOURCE_MISMATCH');
  return job;
}
