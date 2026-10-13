// MIT. Shared contracts for reviewed returns to the original Research dossier.
import {digest, jsonBytes} from '../../node/store.mjs';

export const RETURN_SCHEMAS = Object.freeze({
  source: 'sf88-research-dossier-return-source-v1',
  comparison: 'sf88-research-dossier-return-comparison-v1',
  event: 'sf88-research-dossier-return-event-v1',
  request: 'sf88-research-dossier-return-request-v1',
  draft: 'sf88-research-dossier-return-draft-v1',
  report: 'sf88-research-dossier-return-report-v1',
});
export const RETURN_LIMITS = Object.freeze({
  controlBytes: 1024 * 1024,
  reviewBytes: 16 * 1024 * 1024,
  draftBytes: 16 * 1024 * 1024,
  wireBytes: 256 * 1024 * 1024,
  decodedBytes: 256 * 1024 * 1024,
  stateBytes: 8 * 1024 * 1024,
  chunkBytes: 64 * 1024 * 1024,
  pageDefault: 25,
  pageMax: 100,
  requestIdChars: 200,
  reviewedByChars: 512,
  noteChars: 16000,
  // Stable names used by the original source/store, client and CLI adapters.
  sourceBytes: 256 * 1024 * 1024,
  defaultPage: 25,
  maxPage: 100,
  requestId: 200,
  reviewedBy: 512,
  reviewNote: 16000,
});
export const RETURN_TREATMENTS = Object.freeze({
  authored: 'AUTHORED_VALUE',
  typed: 'RETAINED_TYPED_PROPOSAL',
  extension: 'RETAINED_EXTENSION',
});
const PREFIX = Object.freeze({
  source: 'drs_', comparison: 'drv_', review: 'drv_', item: 'dri_',
  event: 'drr_', receipt: 'drr_', return: 'drr_',
});

export class ReturnError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ReturnError';
    this.code = code;
    this.details = details;
  }
}
export function returnNeed(condition, code, details = {}) {
  if (!condition) throw new ReturnError(code, details);
}
export const returnPlain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
export const returnClone = value => structuredClone(value);

/** Canonical request/item hashing; native revision hashing uses jsonBytes below. */
export function returnCanonical(value) {
  const seen = new Set();
  const encode = current => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean')
      return JSON.stringify(current);
    if (typeof current === 'number') {
      returnNeed(Number.isFinite(current), 'RETURN_JSON_INVALID');
      return JSON.stringify(current);
    }
    returnNeed(current !== undefined && typeof current === 'object' &&
      (Array.isArray(current) || returnPlain(current)), 'RETURN_JSON_INVALID');
    returnNeed(!seen.has(current), 'RETURN_JSON_INVALID');
    seen.add(current);
    let result;
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++)
        returnNeed(Object.hasOwn(current, index), 'RETURN_JSON_INVALID');
      result = '[' + current.map(encode).join(',') + ']';
    } else {
      result = '{' + Object.keys(current).sort().map(key =>
        JSON.stringify(key) + ':' + encode(current[key])).join(',') + '}';
    }
    seen.delete(current);
    return result;
  };
  try { return encode(value); }
  catch (error) {
    if (error instanceof ReturnError) throw error;
    throw new ReturnError('RETURN_JSON_INVALID');
  }
}
export const returnDigest = value => digest(returnCanonical(value));
export const returnEqual = (left, right) => returnCanonical(left) === returnCanonical(right);
export const returnNativeDigest = state => digest(jsonBytes(state));
export const returnBytes = value => jsonBytes(value).length;
export const returnSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const returnDossierId = value => typeof value === 'string' && /^d_[a-f0-9-]{36}$/.test(value);
export const returnRevision = value => Number.isSafeInteger(value) && value > 0 && value < 100000000;
export const returnTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const returnText = (value, maximum, empty = false) => typeof value === 'string' &&
  value.length <= maximum && (empty || value.trim().length > 0);

export function validateReturnId(value, kind) {
  const prefix = PREFIX[kind] ?? (Object.values(PREFIX).includes(kind) ? kind : null);
  returnNeed(prefix && typeof value === 'string' && value.startsWith(prefix) &&
    returnSha(value.slice(prefix.length)), 'RETURN_ID_INVALID', {kind});
  return value;
}
export function validateReturnEnvelope(envelope, {dossierId} = {}) {
  returnNeed(returnPlain(envelope) && returnPlain(envelope.state) &&
    returnSha(envelope.sha256), 'RETURN_REVISION_INVALID');
  const state = envelope.state;
  returnNeed(state.schema === 'sf88-research-dossier-v1' && returnDossierId(state.id) &&
    (dossierId === undefined || state.id === dossierId) && returnRevision(state.revision),
    'RETURN_REVISION_INVALID');
  returnCanonical(state);
  returnNeed(returnNativeDigest(state) === envelope.sha256, 'RETURN_REVISION_CHANGED');
  returnNeed(returnBytes(envelope) <= RETURN_LIMITS.stateBytes, 'RETURN_STATE_TOO_LARGE');
  returnNeed(['questions', 'editions', 'selections', 'findings'].every(key => Array.isArray(state[key])),
    'RETURN_STATE_INVALID');
  return envelope;
}
export function validateReturnSource(source) {
  returnNeed(returnPlain(source), 'RETURN_SOURCE_INVALID');
  returnCanonical(source);
  validateReturnId(source.id, 'source');
  returnNeed(returnSha(source.sha256) && source.id === 'drs_' + source.sha256 &&
    Number.isSafeInteger(source.bytes) && source.bytes > 0 &&
    source.bytes <= RETURN_LIMITS.wireBytes, 'RETURN_SOURCE_INVALID');
  returnNeed(returnText(source.filename, 512) && returnText(source.contentType, 200) &&
    returnDossierId(source.dossierId) && returnTime(source.receivedAt), 'RETURN_SOURCE_INVALID');
  returnNeed(returnPlain(source.incomingHead) && returnRevision(source.incomingHead.revision) &&
    returnSha(source.incomingHead.sha256), 'RETURN_SOURCE_INVALID');
  returnNeed(Array.isArray(source.chunks) && source.chunks.length > 0, 'RETURN_SOURCE_INVALID');
  let total = 0;
  for (const chunk of source.chunks) {
    returnNeed(returnPlain(chunk) && returnSha(chunk.sha256) &&
      Number.isSafeInteger(chunk.bytes) && chunk.bytes > 0 &&
      chunk.bytes <= RETURN_LIMITS.chunkBytes, 'RETURN_SOURCE_CHUNK_INVALID');
    total += chunk.bytes;
    returnNeed(Number.isSafeInteger(total) && total <= RETURN_LIMITS.wireBytes,
      'RETURN_SOURCE_TOO_LARGE');
  }
  returnNeed(total === source.bytes, 'RETURN_SOURCE_CHANGED');
  return source;
}
export function validateReturnReviewMetadata(value) {
  returnNeed(returnPlain(value) && returnText(value.requestId, RETURN_LIMITS.requestIdChars) &&
    returnText(value.reviewedBy, RETURN_LIMITS.reviewedByChars) &&
    returnText(value.reviewNote ?? '', RETURN_LIMITS.reviewNote, true), 'RETURN_REVIEW_INVALID');
  return {requestId: value.requestId, reviewedBy: value.reviewedBy, reviewNote: value.reviewNote ?? ''};
}
export function returnPage(input = {}) {
  returnNeed(returnPlain(input), 'RETURN_PAGE_INVALID');
  const offset = input.offset ?? 0, limit = input.limit ?? RETURN_LIMITS.pageDefault;
  returnNeed(Number.isSafeInteger(offset) && offset >= 0 &&
    Number.isSafeInteger(limit) && limit >= 1 && limit <= RETURN_LIMITS.pageMax,
    'RETURN_PAGE_INVALID');
  return {offset, limit};
}
