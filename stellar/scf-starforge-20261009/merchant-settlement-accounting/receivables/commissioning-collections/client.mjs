// MIT. Commissioning source and capture requests use the original workspace HTTP transport.
import {XeroReceivablesClient, XeroReceivablesApiError} from '../xero/client.mjs';

export class CommissioningCollectionsApiError extends XeroReceivablesApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'CommissioningCollectionsApiError';
  }
}
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function segment(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..') {
    throw new TypeError('Keep the original source, capture or request identifier.');
  }
  return encodeURIComponent(value);
}
function queryString(value = {}) {
  const query = new URLSearchParams();
  for (const [name, item] of Object.entries(value)) {
    if (item !== undefined && item !== null && item !== '') query.set(name, String(item));
  }
  return query.size ? '?' + query : '';
}
function context(value) {
  if (!object(value) || typeof value.actor !== 'string' || !value.actor.trim() ||
      typeof value.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.requestId)) {
    throw new TypeError('Keep an operator name and one stable original request identifier.');
  }
  return {actor: value.actor, requestId: value.requestId};
}
function reviewRevision(value) {
  if (!object(value) || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new TypeError('Keep the revision from the complete native inspection or preview.');
  }
  return value.revision;
}

/** Uses the original transport and preserves native commit-uncertainty information. */
export class CommissioningCollectionsClient {
  constructor({baseUrl = '/api/receivables/commissioning', fetch: fetcher = globalThis.fetch} = {}) {
    this.transport = new XeroReceivablesClient({baseUrl, fetch: fetcher});
  }
  get baseUrl() { return this.transport.baseUrl; }
  async send(path, options = {}) {
    try { return await this.transport.request(path, options); }
    catch (error) {
      if (!(error instanceof XeroReceivablesApiError)) throw error;
      const retained = new CommissioningCollectionsApiError(error.message, {
        status: error.status, code: error.code, details: error.details, requestId: error.requestId,
        response: error.response, outcomeUnknown: error.outcomeUnknown,
        reopenRequired: error.reopenRequired, commitUncertainty: error.commitUncertainty,
      });
      retained.cause = error;
      throw retained;
    }
  }
  inspectSource(value, options = {}) {
    return this.send('/sources/inspect', {...options, method: 'POST', body: value});
  }
  importSource(value, options = {}) {
    return this.send('/sources', {...options, method: 'POST', body: value});
  }
  sources(query = {}, options = {}) {
    return this.send('/sources' + queryString(query), options);
  }
  source(sourceId, query = {}, options = {}) {
    return this.send('/sources/' + segment(sourceId) + queryString(query), options);
  }
  sourceFile(sourceId, name, options = {}) {
    return this.send('/sources/' + segment(sourceId) + '/files/' + segment(name), {...options, binary: true});
  }
  candidates(query = {}, options = {}) {
    return this.send('/candidates' + queryString(query), options);
  }
  preview(sourceId, value, options = {}) {
    return this.send('/sources/' + segment(sourceId) + '/preview', {...options, method: 'POST', body: value});
  }
  capture(sourceId, value, options = {}) {
    return this.send('/sources/' + segment(sourceId) + '/captures', {...options, method: 'POST', body: value});
  }
  captures(query = {}, options = {}) {
    return this.send('/captures' + queryString(query), options);
  }
  detail(captureId, options = {}) {
    return this.send('/captures/' + segment(captureId), options);
  }
  file(captureId, name, options = {}) {
    return this.send('/captures/' + segment(captureId) + '/files/' + segment(name), {...options, binary: true});
  }
  export(captureId, options = {}) {
    return this.send('/captures/' + segment(captureId) + '/export', options);
  }
  exportFile(captureId, name = 'handover.tar', options = {}) {
    return this.send('/captures/' + segment(captureId) + '/export' + queryString({name}), {...options, binary: true});
  }
  request(requestId, options = {}) {
    return this.send('/requests/' + segment(requestId), options);
  }
}
export function createCommissioningCollectionsClient(options) {
  return new CommissioningCollectionsClient(options);
}

/**
 * Bind the complete original source input to its native inspection.
 * Original file bytes stay in the returned request so it can be saved before import.
 */
export function commissioningImportArguments(input, inspection, operation) {
  if (!object(input) || !object(input.file) || typeof input.file.name !== 'string' ||
      typeof input.file.dataBase64 !== 'string' || !input.file.dataBase64) {
    throw new TypeError('Keep the original complete source file used for inspection.');
  }
  const revision = reviewRevision(inspection);
  if (!object(inspection.file) || !/^[a-f0-9]{64}$/.test(inspection.file.sha256 || '') ||
      inspection.file.name !== input.file.name ||
      (input.expectedSha256 !== undefined && input.expectedSha256 !== inspection.file.sha256)) {
    throw new TypeError('Use the inspection of this exact original source filename and SHA-256.');
  }
  const value = clone(input);
  delete value.actor; delete value.requestId; delete value.revision;
  value.expectedSha256 = inspection.file.sha256;
  if (value.currencyScales === undefined && inspection.currencyScales !== undefined) {
    value.currencyScales = clone(inspection.currencyScales);
  }
  return {...value, revision, ...context(operation)};
}

/**
 * Keep every normalized cohort binding from the reviewed source.
 * The original native workspace recomputes the review and its SHA before capture.
 */
export function commissioningCaptureArguments(preview, operation) {
  const revision = reviewRevision(preview);
  if (!object(preview.selection) || !object(preview.source) || typeof preview.source.id !== 'string' ||
      !object(preview.review) || !/^[a-f0-9]{64}$/.test(preview.previewSha256 || '') ||
      preview.review.previewSha256 !== preview.previewSha256 ||
      preview.review.revision !== revision || preview.review.source?.sha256 !== preview.source.sha256) {
    throw new TypeError('Keep the complete successful source preview and its original selection, revision and SHA.');
  }
  return {...clone(preview.selection), revision, ...context(operation), previewSha256: preview.previewSha256};
}
