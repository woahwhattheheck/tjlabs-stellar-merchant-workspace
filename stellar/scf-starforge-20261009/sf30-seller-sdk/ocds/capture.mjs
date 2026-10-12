// MIT. Original Find a Tender OCDS acquisition with durable page checkpoints.
import { randomUUID } from 'node:crypto';
import { failure, sha256 } from './workspace.mjs';
export const FIND_TENDER_ORIGIN = 'https://www.find-tender.service.gov.uk';
const API_ROOT = '/api/1.0/';
function apiTime(value, name) {
  if (!value) return undefined;
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) text += ':00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    const parsed = new Date(text + 'Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== text) throw failure('INVALID_SOURCE_DATE', name + ' is not a valid UTC date and time');
    return text;
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 19);
  }
  throw failure('INVALID_SOURCE_DATE', name + ' must be a UTC date and time, for example 2026-10-12T00:00:00');
}
export function buildFindTenderURL(spec = {}) {
  const kind = spec.kind || 'releases';
  if (!['releases', 'record'].includes(kind)) throw failure('INVALID_CAPTURE_KIND', 'Choose releases or record');
  const ocid = String(spec.ocid || '').trim(), noticeId = String(spec.noticeId || '').trim();
  if (ocid && !/^ocds-h6vhtk-[a-fA-F0-9]{6}$/.test(ocid)) throw failure('INVALID_OCID', 'Find a Tender OCID must have the form ocds-h6vhtk-000000');
  if (noticeId && !/^\d{6}-\d{4}$/.test(noticeId)) throw failure('INVALID_NOTICE', 'Notice ID must have the form 000000-2026');
  if (noticeId && ocid) throw failure('ONE_SOURCE_FILTER', 'Choose either a notice ID or an OCID');
  if (kind === 'record') {
    if (!ocid || noticeId) throw failure('RECORD_OCID_REQUIRED', 'A record capture needs one Find a Tender OCID');
    return new URL(API_ROOT + 'ocdsRecordPackages/' + encodeURIComponent(ocid), FIND_TENDER_ORIGIN).href;
  }
  const from = apiTime(spec.updatedFrom, 'updatedFrom'), to = apiTime(spec.updatedTo, 'updatedTo');
  if (!ocid && !noticeId && !(from && to)) throw failure('SOURCE_SELECTION_REQUIRED', 'Choose an OCID, a notice ID, or both ends of an update window');
  if (from && to && from > to) throw failure('INVALID_SOURCE_WINDOW', 'updatedFrom must be at or before updatedTo');
  const url = new URL(API_ROOT + 'ocdsReleasePackages' + (ocid || noticeId ? '/' + encodeURIComponent(ocid || noticeId) : ''), FIND_TENDER_ORIGIN);
  const limit = spec.limit === undefined || spec.limit === '' ? 100 : Number(spec.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw failure('INVALID_PAGE_SIZE', 'Find a Tender page size must be between 1 and 100');
  url.searchParams.set('limit', String(limit));
  if (from) url.searchParams.set('updatedFrom', from);
  if (to) url.searchParams.set('updatedTo', to);
  if (spec.stages) {
    const stages = String(spec.stages).split(',').map(value => value.trim()).filter(Boolean);
    if (!stages.length || stages.some(value => !['planning', 'tender', 'award'].includes(value))) throw failure('INVALID_STAGES', 'Find a Tender stages are planning, tender and award');
    url.searchParams.set('stages', [...new Set(stages)].join(','));
  }
  return url.href;
}
function allowedNext(value, current) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw failure('INVALID_SOURCE_CONTINUATION', 'Find a Tender returned an invalid continuation URL');
  const next = new URL(value, current);
  const currentURL = new URL(current);
  if (next.origin !== FIND_TENDER_ORIGIN || !next.pathname.startsWith(API_ROOT + 'ocds')
    || next.username || next.password || next.hash || !['ocdsReleasePackages', 'ocdsRecordPackages'].some(name => next.pathname.startsWith(API_ROOT + name)))
    throw failure('UNEXPECTED_SOURCE_CONTINUATION', 'Find a Tender returned a continuation outside its OCDS API');
  if (next.pathname !== currentURL.pathname) throw failure('SOURCE_SELECTION_CHANGED', 'The continuation changed the selected Find a Tender endpoint');
  const allowedParameters = new Set(['limit', 'cursor', 'updatedFrom', 'updatedTo', 'stages']);
  for (const key of next.searchParams.keys()) if (!allowedParameters.has(key)) throw failure('UNEXPECTED_SOURCE_PARAMETER', 'The continuation contains an unknown API parameter');
  for (const key of ['updatedFrom', 'updatedTo', 'stages']) if (currentURL.searchParams.has(key)
    && next.searchParams.has(key) && currentURL.searchParams.get(key) !== next.searchParams.get(key))
    throw failure('SOURCE_SELECTION_CHANGED', 'The continuation changed ' + key);
  return next.href;
}
function nextPage(document, response, current) {
  let candidate = document?.links?.next;
  if (candidate && typeof candidate === 'object') candidate = candidate.href || candidate.url;
  if (!candidate && Array.isArray(document?.links)) candidate = document.links.find(link => link?.rel === 'next')?.href;
  if (!candidate) {
    const header = response.headers.get('link') || '';
    for (const part of header.split(/,(?=\s*<)/)) {
      const match = /^\s*<([^>]+)>.*;\s*rel=["']?next["']?/i.exec(part);
      if (match) { candidate = match[1]; break; }
    }
  }
  return candidate ? allowedNext(candidate, current) : null;
}
function retryAt(response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const millis = /^\d+$/.test(value.trim()) ? Date.now() + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}
async function readOriginal(response, maximum) {
  const length = response.headers.get('content-length');
  if (length && Number(length) > maximum) throw failure('SOURCE_PAGE_CAPACITY', 'The source page exceeds the configured byte capacity', 413, { maximumBytes: maximum });
  if (!response.body) return Buffer.alloc(0);
  const chunks = []; let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      total += item.value.length;
      if (total > maximum) { await reader.cancel(); throw failure('SOURCE_PAGE_CAPACITY', 'The source page exceeds the configured byte capacity', 413, { maximumBytes: maximum }); }
      chunks.push(Buffer.from(item.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}
export async function captureFindTender(workspace, spec = {}, { fetchImpl = globalThis.fetch, signal, onProgress, maxResponseBytes = 256 * 1024 * 1024 } = {}) {
  if (typeof fetchImpl !== 'function') throw failure('FETCH_UNAVAILABLE', 'This Node runtime does not provide fetch');
  let capture;
  if (spec.captureId) {
    capture = workspace.getCapture(String(spec.captureId));
    if (capture.provider !== 'find-tender') throw failure('CAPTURE_PROVIDER', 'This capture belongs to another source');
    if (capture.status === 'complete') return { ...workspace.view(), capture };
    if (capture.retryAt && Date.parse(capture.retryAt) > Date.now()) throw failure('SOURCE_COOLDOWN', 'Resume this capture after ' + capture.retryAt, 429, { captureId: capture.id, retryAt: capture.retryAt });
  } else {
    const firstURL = buildFindTenderURL(spec);
    capture = workspace.saveCapture({ id: randomUUID(), revision: 0, provider: 'find-tender', createdAt: new Date().toISOString(),
      selection: { ...spec }, firstURL, nextURL: firstURL, status: 'running', pages: [], retryAt: null, lastError: null });
  }
  const visited = new Set(capture.pages.map(page => page.url));
  try {
    while (capture.nextURL) {
      if (signal?.aborted) throw signal.reason || failure('CAPTURE_CANCELLED', 'Capture was interrupted; its saved pages remain available', 499);
      const url = allowedNext(capture.nextURL, capture.firstURL);
      if (visited.has(url)) throw failure('SOURCE_CURSOR_LOOP', 'Find a Tender repeated a completed page URL', 409);
      const pageSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
      const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Starforge-OCDS-Workspace/1.0' }, redirect: 'error', credentials: 'omit', signal: pageSignal });
      if (!response.ok) {
        const retry = retryAt(response);
        const error = failure('SOURCE_HTTP_' + response.status, 'Find a Tender returned HTTP ' + response.status + (retry ? '; retry after ' + retry : ''), response.status === 429 ? 429 : 502,
          { captureId: capture.id, sourceStatus: response.status, url, retryAt: retry });
        error.retryAt = retry; throw error;
      }
      const bytes = await readOriginal(response, maxResponseBytes);
      let body, document;
      try { body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); document = JSON.parse(body.replace(/^\uFEFF/, '')); }
      catch { throw failure('SOURCE_NOT_JSON', 'Find a Tender returned a body that is not complete UTF-8 JSON', 502, { url, bytes: bytes.length }); }
      const nextURL = nextPage(document, response, url);
      const retrievedAt = new Date().toISOString();
      const result = workspace.importDocument(document, { rawBytes: bytes, label: 'Find a Tender ' + (spec.ocid || spec.noticeId || capture.selection.ocid || capture.selection.noticeId || 'update window'), url, retrievedAt });
      const headers = Object.fromEntries(['content-type', 'etag', 'last-modified', 'date', 'link'].map(name => [name, response.headers.get(name)]).filter(([, value]) => value !== null));
      capture = workspace.saveCapture({ ...capture, status: nextURL ? 'running' : 'complete', nextURL,
        pages: [...capture.pages, { index: capture.pages.length, url, retrievedAt, status: response.status, headers,
          sourceId: result.ingestion.sourceId, sha256: sha256(bytes), bytes: bytes.length, nextURL }],
        retryAt: null, lastError: null });
      visited.add(url);
      if (onProgress) await onProgress({ captureId: capture.id, page: capture.pages.at(-1), status: capture.status });
    }
    return { ...workspace.view(), capture };
  } catch (error) {
    try { capture = workspace.saveCapture({ ...capture, status: 'interrupted', retryAt: error.retryAt || null,
      lastError: { code: error.code || error.name || 'SOURCE_ERROR', message: String(error.message), at: new Date().toISOString() } }); }
    catch (checkpointError) { error.checkpointError = { code: checkpointError.code, message: checkpointError.message }; }
    if (!error.details) error.details = { captureId: capture.id, pagesRetained: capture.pages.length };
    throw error;
  }
}
