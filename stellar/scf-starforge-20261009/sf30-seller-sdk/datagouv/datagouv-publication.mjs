/**
 * Durable draft/review/publication through the native data.gouv.fr API.
 * Node 24 standard library only. Importing this module performs no I/O.
 *
 * Official contracts inspected 2026-10-12:
 * https://guides.data.gouv.fr/api-de-data.gouv.fr/prise-en-main/gerer-un-jeu-de-donnees-par-lapi
 * https://www.data.gouv.fr/api/1/swagger.json
 * opendatateam/udata dataset/api.py 053881d74c5cf3d3cd90f529568e95a32db647ef
 * dataset/forms.py 130de75a414545f38135b47ec9cd2a0d1652f27f
 * dataset/permissions.py 595c8138ada870d585dd934a7d5500f331c9f311
 * organization/api.py 5159ff13db58422391c7eef3843361ca6276139f
 * storages/api.py 60d0b960413021b5d9976f093cf9010034ff45fd
 * storages/utils.py 4302d6b54e53e4cad88eee424a5f9b773ec7b316
 */
import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';

export const PUBLICATION_SCHEMA = 'commons.datagouv.publication.v1';
const EXTRA_KEY = 'commons_publication';
const DATASET_FIELDS = [
  'title', 'description', 'description_short', 'acronym', 'license', 'frequency',
  'frequency_date', 'temporal_coverage', 'spatial', 'tags', 'extras',
  'contact_points', 'access_type', 'access_audiences', 'authorization_request_url',
  'access_type_reason_category', 'access_type_reason',
];
const RESOURCE_FIELDS = ['title', 'description', 'type', 'format', 'mime', 'schema', 'extras'];
const RESOURCE_TYPES = ['main', 'documentation', 'update', 'api', 'code', 'other'];
const SAFE_HEADERS = [
  'date', 'etag', 'last-modified', 'retry-after', 'x-request-id', 'request-id',
  'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
  'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'content-type',
];
const OMIT_REMOTE = new Set([
  'metrics', 'quality', 'permissions', 'internal', 'last_modified',
  'last_update', 'created_at', 'last_modified_internal', 'last_update_internal',
  'created_at_internal', 'views', 'downloads', 'followers', 'preview_url',
]);
const ISO = () => new Date().toISOString();

export class PublicationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PublicationError';
    this.code = code;
    this.details = details;
  }
}
function fail(code, message, details) { throw new PublicationError(code, message, details); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  fail('invalid_json', 'Publication values must be ordinary finite JSON values.');
}
function clone(value) { return JSON.parse(canonical(value)); }
function sha(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex'); }
function text(value, label, max = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid_input', label + ' must be a nonempty string.');
  return value;
}
function object(value, label) {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_input', label + ' must be a JSON object.');
  canonical(value);
  return value;
}
function only(value, keys, label) {
  object(value, label);
  const extra = Object.keys(value).filter(k => !keys.includes(k));
  if (extra.length) fail('unknown_fields', label + ' has unsupported fields.', { fields: extra });
}
function id(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) fail('invalid_id', label + ' must be the exact 24-character native ID, not a slug.');
  return value.toLowerCase();
}
function resourceId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) fail('invalid_resource_id', 'Resource ID must be its original UUID.');
  return value.toLowerCase();
}
function publicURL(value, label) {
  const u = new URL(text(value, label));
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash) fail('invalid_url', label + ' must be an HTTP(S) URL without user information or a fragment.');
  return u.href;
}
function selected(value, keys) {
  const out = Object.create(null);
  for (const key of keys) if (Object.hasOwn(value, key)) out[key] = clone(value[key]);
  return out;
}
function nativeID(value) { return typeof value === 'string' ? value : value?.id; }
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (!value || typeof value !== 'object') return value;
  const out = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (OMIT_REMOTE.has(key)) continue;
    out[key] = semantic(value[key]);
  }
  return out;
}
function datasetProjection(dataset) {
  const body = selected(dataset, DATASET_FIELDS);
  return {
    id: dataset.id, organization: nativeID(dataset.organization) ?? null,
    private: dataset.private, deleted: dataset.deleted ?? null, archived: dataset.archived ?? null,
    metadata: semantic(body),
    resources: (dataset.resources ?? []).map(r => resourceProjection(r)),
  };
}
function resourceProjection(resource) {
  const body = selected(resource, [...RESOURCE_FIELDS, 'id', 'url', 'filetype', 'filesize', 'checksum', 'latest']);
  return semantic(body);
}
function subset(actual, expected) {
  if (expected === null || typeof expected !== 'object') return canonical(actual ?? null) === canonical(expected);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => subset(actual[i], v));
  return actual && typeof actual === 'object' && Object.keys(expected).every(key => Object.hasOwn(actual, key) && subset(actual[key], expected[key]));
}
function wantedSubset(actual, wanted) {
  const normalized = clone(wanted);
  if (Object.hasOwn(normalized, 'organization')) {
    if (nativeID(actual.organization) !== nativeID(normalized.organization)) return false;
    delete normalized.organization;
  }
  return subset(actual, normalized);
}
function checksumMatches(resource, file) {
  const algorithm = String(resource.checksum?.type ?? '').toLowerCase().replaceAll('-', '');
  const expected = algorithm === 'sha1' ? file.sha1 : algorithm === 'sha256' ? file.sha256 : null;
  return resource.filetype === 'file' && resource.filesize === file.bytes && expected !== null
    && String(resource.checksum?.value ?? '').toLowerCase() === expected;
}
function sourceSignature(stat) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(k => String(stat[k])).join(':');
}
async function inspectFile(path, expected = {}) {
  if (!isAbsolute(path)) fail('invalid_file', 'Selected upload path must be absolute.');
  const handle = await open(path, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail('invalid_file', 'Selected upload must be an ordinary file.');
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid_file', 'Selected upload is too large to represent exactly.');
    const hashes = { sha256: createHash('sha256'), sha1: createHash('sha1') };
    const buf = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, position);
      if (!bytesRead) break;
      for (const h of Object.values(hashes)) h.update(buf.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (sourceSignature(before) !== sourceSignature(after) || position !== Number(before.size)) fail('source_changed', 'Selected upload changed while its bytes were read.');
    const out = { path, bytes: position, sha256: hashes.sha256.digest('hex'), sha1: hashes.sha1.digest('hex') };
    for (const key of ['bytes', 'sha256', 'sha1']) if (expected[key] !== undefined && out[key] !== expected[key]) fail('source_changed', 'Selected upload differs from its retained identity.', { field: key });
    return out;
  } finally { await handle.close(); }
}
function uploadName(filename, opID, key) {
  const name = basename(text(filename, 'Upload filename', 200));
  const extension = extname(name).toLowerCase();
  if (extension && !/^\.[a-z0-9]{1,15}$/.test(extension)) fail('invalid_upload_extension', 'Choose a transport filename with an ordinary alphanumeric extension.');
  // This ASCII basename is already canonical under the native lowercasing
  // slugifier. The human filename remains in the selected file journal.
  return 'resource-' + sha([opID, key]).slice(0, 32) + extension;
}
function retryDeadline(headers, observedAt) {
  const observed = Date.parse(observedAt);
  const raw = headers['retry-after'];
  let deadline = null;
  if (raw && /^\d+(?:\.\d+)?$/.test(raw)) deadline = observed + Number(raw) * 1000;
  else if (raw && Number.isFinite(Date.parse(raw))) deadline = Date.parse(raw);
  const reset = headers['x-ratelimit-reset'];
  if (reset && /^\d+$/.test(reset)) deadline = Math.max(deadline ?? 0, Number(reset) * 1000);
  return deadline !== null && Number.isFinite(deadline) ? new Date(deadline).toISOString() : null;
}
function redact(value, credential) {
  if (typeof value === 'string') return credential ? value.split(credential).join('[REDACTED]') : value;
  if (Array.isArray(value)) return value.map(v => redact(v, credential));
  if (value && typeof value === 'object') {
    const out = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (/^(api[_-]?key|apikey|authorization|password|secret|access_token|refresh_token|token|cookie|set-cookie)$/i.test(k)) continue;
      out[k] = redact(v, credential);
    }
    return out;
  }
  return value;
}

export function publicationInputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Selected data.gouv.fr draft publication',
    type: 'object', additionalProperties: false,
    required: ['operationId', 'organizationId', 'dataset', 'resources'],
    properties: {
      operationId: { type: 'string', minLength: 1, maxLength: 200 },
      organizationId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
      datasetId: { type: ['string', 'null'], pattern: '^[a-fA-F0-9]{24}$' },
      dataset: {
        type: 'object', required: ['title', 'description', 'license'], additionalProperties: false,
        properties: Object.fromEntries(DATASET_FIELDS.map(k => [k, { description: 'Native data.gouv.fr dataset ' + k + ' value.' }])),
      },
      resources: {
        type: 'array', minItems: 1,
        items: {
          type: 'object', additionalProperties: false, required: ['key', 'mode', 'metadata'],
          properties: {
            key: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' },
            resourceId: { type: ['string', 'null'], format: 'uuid' },
            mode: { enum: ['file', 'remote'] },
            metadata: {
              type: 'object', required: ['title', 'type', 'format'], additionalProperties: false,
              properties: Object.fromEntries(RESOURCE_FIELDS.map(k => [k, { description: 'Native resource ' + k + ' value.' }])),
            },
            file: {
              type: 'object', additionalProperties: false, required: ['path'],
              properties: {
                path: { type: 'string', description: 'Absolute selected original file path.' },
                filename: { type: 'string' }, bytes: { type: 'integer', minimum: 0 },
                sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              },
            },
            url: { type: 'string', format: 'uri' },
            checksum: { type: ['object', 'null'] },
            filesize: { type: ['integer', 'null'], minimum: 0 },
          },
          allOf: [
            { if: { properties: { mode: { const: 'file' } } }, then: { required: ['file'], not: { required: ['url'] } } },
            { if: { properties: { mode: { const: 'remote' } } }, then: { required: ['url'], not: { required: ['file'] } } },
          ],
        },
      },
    },
  };
}

export function createDataGouvPublisher(options) { return new DataGouvPublisher(options); }

export class DataGouvPublisher {
  constructor({ loadOperation, saveOperation, apiBase = 'https://www.data.gouv.fr/api/1/',
    tokenEnv = 'DATAGOUV_API_KEY', timeoutMs = 60000, maxUploadBytes = 250 * 1024 * 1024,
    maxResponseBytes = 8 * 1024 * 1024 } = {}) {
    if (typeof loadOperation !== 'function' || typeof saveOperation !== 'function') fail('persistence_required', 'Provide loadOperation and atomic compare-and-save saveOperation callbacks.');
    const base = new URL(apiBase);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/api/1/')) fail('invalid_api_base', 'Select the exact HTTPS /api/1/ API base.');
    text(tokenEnv, 'Environment variable name', 100);
    for (const [key, value] of Object.entries({ timeoutMs, maxUploadBytes, maxResponseBytes })) if (!Number.isSafeInteger(value) || value <= 0) fail('invalid_configuration', key + ' must be a positive integer.');
    this.apiBase = base.href;
    this.tokenEnv = tokenEnv;
    this.timeoutMs = timeoutMs;
    this.maxUploadBytes = maxUploadBytes;
    this.maxResponseBytes = maxResponseBytes;
    this.loadOperation = loadOperation;
    this.saveOperation = saveOperation;
    this.running = new Map();
  }

  async _serial(operationId, fn) {
    text(operationId, 'operationId', 200);
    const previous = this.running.get(operationId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(fn);
    this.running.set(operationId, run);
    try { return await run; }
    finally { if (this.running.get(operationId) === run) this.running.delete(operationId); }
  }
  async _load(operationId) {
    const record = await this.loadOperation(operationId);
    if (!record) fail('operation_not_found', 'No retained publication operation exists.', { operationId });
    if (record.schema !== PUBLICATION_SCHEMA || record.operation_id !== operationId || record.api_base !== this.apiBase
        || !Number.isSafeInteger(record.revision)) fail('operation_conflict', 'The retained operation belongs to different source or API coordinates.');
    return clone(record);
  }
  async _save(record, { create = false } = {}) {
    const expectedRevision = create ? null : record.revision;
    const next = { ...clone(record), revision: create ? 0 : record.revision + 1, updated_at: ISO() };
    const credential = process.env[this.tokenEnv];
    if (credential && canonical(next).includes(credential)) fail('credential_in_state', 'A credential was found in publication state; it has not been saved.');
    const saved = await this.saveOperation(record.operation_id, clone(next), expectedRevision);
    if (saved !== true) fail('operation_revision_conflict', 'Another writer changed the original operation; reload its retained state before continuing.');
    Object.keys(record).forEach(k => delete record[k]);
    Object.assign(record, next);
    return record;
  }
  _url(path) {
    if (typeof path !== 'string' || path.startsWith('/') || path.includes('://') || path.includes('#')) fail('invalid_api_path', 'Use an API-relative path.');
    const u = new URL(path, this.apiBase);
    if (!u.href.startsWith(this.apiBase)) fail('invalid_api_path', 'The selected operation cannot change API origin or prefix.');
    return u.href;
  }
  async _http(method, path, { body, file, authenticated = true } = {}) {
    const credential = authenticated ? process.env[this.tokenEnv] : undefined;
    if (authenticated && (!credential || /[\r\n]/.test(credential))) fail('credential_unavailable', 'The selected API credential is unavailable in its environment variable.');
    const headers = { Accept: 'application/json' };
    if (authenticated) headers['X-API-KEY'] = credential;
    let payload;
    if (file) {
      await inspectFile(file.path, file);
      if (file.bytes > this.maxUploadBytes) fail('upload_limit', 'The selected file exceeds this operation configuration.');
      const blob = await openAsBlob(file.path, { type: file.mime || 'application/octet-stream' });
      const blobHash = createHash('sha256');
      let blobBytes = 0;
      for await (const part of blob.stream()) { blobHash.update(part); blobBytes += part.byteLength; }
      if (blobBytes !== file.bytes || blobHash.digest('hex') !== file.sha256) fail('source_changed', 'The exact immutable upload Blob differs from the retained source.');
      payload = new FormData();
      payload.set('file', blob, file.upload_name);
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = canonical(body);
    }
    const started = ISO();
    try {
      const response = await fetch(this._url(path), {
        method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs),
      });
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body ?? []) {
        length += chunk.byteLength;
        if (length > this.maxResponseBytes) fail('response_limit', 'The API response exceeded the configured retained-response limit.');
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch { data = { response_text: raw }; } }
      const safeHeaders = {};
      for (const key of SAFE_HEADERS) if (response.headers.has(key)) safeHeaders[key] = response.headers.get(key);
      const ended = ISO();
      return {
        method, path, started_at: started, observed_at: ended,
        status: response.status, ok: response.ok, headers: safeHeaders,
        retry_at: retryDeadline(safeHeaders, ended), data: redact(data, credential),
        response_sha256: createHash('sha256').update(raw).digest('hex'),
        response_bytes: length, authenticated,
      };
    } catch (error) {
      // Never persist request headers or an error object containing the credential.
      return {
        method, path, started_at: started, observed_at: ISO(), status: null, ok: false,
        uncertain: method !== 'GET', error: error.code ?? error.name ?? 'transport_error',
        message: redact(String(error.message ?? error), credential), authenticated,
      };
    }
  }
  async _read(record, path, authenticated = true) {
    if (record) this._respectRetainedBackoff(record);
    const response = await this._http('GET', path, { authenticated });
    if (record && !response.ok) {
      // Retain the native read's own observation/deadline before its caller
      // throws or continues reconciliation. Never move it to a later retry.
      record.read_responses ??= [];
      record.read_responses.push(clone(response));
      await this._save(record);
    }
    return response;
  }
  async _get(path, authenticated = true, record = null) {
    const response = await this._read(record, path, authenticated);
    if (!response.ok) throw new PublicationError('api_read_failed', 'The selected native API read did not succeed.', { response });
    return response;
  }
  _datasetPath(datasetId) { return 'datasets/' + id(datasetId, 'Dataset ID') + '/'; }
  _resourcePath(datasetId, rid) { return this._datasetPath(datasetId) + 'resources/' + resourceId(rid) + '/'; }

  async prepareDraft(input) {
    only(input, ['operationId', 'organizationId', 'datasetId', 'dataset', 'resources'], 'Draft input');
    text(input.operationId, 'operationId', 200);
    const organization = id(input.organizationId, 'Organization ID');
    const datasetID = input.datasetId == null ? null : id(input.datasetId, 'Dataset ID');
    only(input.dataset, DATASET_FIELDS, 'Dataset metadata');
    text(input.dataset.title, 'Dataset title', 1000);
    text(input.dataset.description, 'Dataset description', 1000000);
    text(input.dataset.license, 'Dataset license', 100);
    if (input.dataset.extras && Object.hasOwn(input.dataset.extras, EXTRA_KEY)) fail('reserved_provenance', 'The publication provenance key is owned by this operation.');
    if (!Array.isArray(input.resources) || input.resources.length === 0) fail('invalid_resources', 'Select at least one file or remote resource.');
    const resources = [], keys = new Set(), existingIDs = new Set();
    for (const row of input.resources) {
      only(row, ['key', 'mode', 'resourceId', 'metadata', 'file', 'url', 'checksum', 'filesize'], 'Resource selection');
      text(row.key, 'Resource key', 120);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(row.key) || ['__proto__', 'constructor', 'prototype'].includes(row.key)) fail('invalid_resource_key', 'Use a stable resource key containing letters, digits, dot, underscore or hyphen.');
      if (keys.has(row.key)) fail('duplicate_resource', 'Each selected resource key must be unique.');
      keys.add(row.key);
      only(row.metadata, RESOURCE_FIELDS, 'Resource metadata');
      text(row.metadata.title, 'Resource title', 1000);
      text(row.metadata.format, 'Resource format', 100);
      if (row.metadata.format !== row.metadata.format.trim().toLowerCase()) fail('invalid_format', 'Use the normalized lowercase native resource format.');
      if (!RESOURCE_TYPES.includes(row.metadata.type)) fail('invalid_resource_type', 'Select a native resource type.', { allowed: RESOURCE_TYPES });
      if (row.metadata.extras && Object.hasOwn(row.metadata.extras, EXTRA_KEY)) fail('reserved_provenance', 'The resource publication provenance key is owned by this operation.');
      const rid = row.resourceId == null ? null : resourceId(row.resourceId);
      if (rid && (!datasetID || existingIDs.has(rid))) fail('duplicate_resource', 'Existing resource IDs require a selected dataset and must be unique.');
      if (rid) existingIDs.add(rid);
      const normalized = { key: row.key, mode: row.mode, resource_id: rid, metadata: clone(row.metadata) };
      if (row.mode === 'file') {
        if (row.url !== undefined || row.checksum !== undefined || row.filesize !== undefined) fail('invalid_file_route', 'Hosted bytes use the file route; the server computes its URL, checksum and size.');
        only(row.file, ['path', 'filename', 'bytes', 'sha256'], 'Selected file');
        const file = await inspectFile(text(row.file.path, 'File path'), row.file);
        if (file.bytes > this.maxUploadBytes) fail('upload_limit', 'The selected file exceeds this publisher configuration.', { key: row.key, bytes: file.bytes });
        const filename = row.file.filename ?? basename(file.path);
        normalized.file = {
          ...file, original_name: text(filename, 'Original filename', 200),
          upload_name: uploadName(filename, input.operationId, row.key),
          mime: row.metadata.mime || 'application/octet-stream',
        };
      } else if (row.mode === 'remote') {
        if (row.file !== undefined) fail('invalid_remote_route', 'Remote resources take a public URL rather than an upload file.');
        normalized.url = publicURL(row.url, 'Remote resource URL');
        if (row.filesize !== undefined) {
          if (row.filesize !== null && (!Number.isSafeInteger(row.filesize) || row.filesize < 0)) fail('invalid_filesize', 'Resource filesize must be an exact nonnegative integer or null.');
          normalized.filesize = row.filesize;
        }
        if (row.checksum !== undefined) {
          if (row.checksum !== null) {
            only(row.checksum, ['type', 'value'], 'Remote checksum');
            if (!['sha1', 'sha256', 'md5'].includes(row.checksum.type)) fail('invalid_checksum', 'Use the exact declared native checksum algorithm.');
            const lengths = { sha1: 40, sha256: 64, md5: 32 };
            if (!new RegExp('^[a-f0-9]{' + lengths[row.checksum.type] + '}$').test(row.checksum.value)) fail('invalid_checksum', 'The declared checksum does not match its algorithm.');
          }
          normalized.checksum = clone(row.checksum);
        }
      } else fail('invalid_resource_mode', 'Resource mode must be file or remote.');
      resources.push(normalized);
    }
    const plan = { organization_id: organization, dataset_id: datasetID, dataset: clone(input.dataset), resources };
    const portable = clone(plan);
    for (const row of portable.resources) if (row.file) delete row.file.path;
    const selectionSha = sha(portable);
    return this._serial(input.operationId, async () => {
      const old = await this.loadOperation(input.operationId);
      if (old) {
        const record = await this._load(input.operationId);
        if (record.selection_sha256 !== selectionSha) fail('operation_body_conflict', 'The original operation ID already names another draft selection.');
        return { operation: record, inputSchema: publicationInputSchema(), reused: true };
      }
      const record = {
        schema: PUBLICATION_SCHEMA, operation_id: input.operationId, api_base: this.apiBase,
        revision: -1, created_at: ISO(), updated_at: ISO(), state: 'prepared',
        selection_sha256: selectionSha, plan, steps: {}, dataset_id: datasetID,
        resource_ids: {}, reviews: [], draft: null, publication: null, observations: [], read_responses: [],
        credential: { source: 'environment', variable: this.tokenEnv, stored: false },
      };
      await this._save(record, { create: true });
      return { operation: clone(record), inputSchema: publicationInputSchema(), reused: false };
    });
  }

  async inspectAccess(input) {
    only(input, ['organizationId'], 'Access input');
    const organization = id(input.organizationId, 'Organization ID');
    return this._inspectAccess(organization);
  }
  async _inspectAccess(organization, record = null) {
    const me = await this._get('me/', true, record);
    const org = await this._get('organizations/' + organization + '/', true, record);
    if (org.data?.id !== organization) fail('organization_mismatch', 'The native organization read returned a different ID.');
    // Do not retain the native /me payload: it can include account/API fields.
    return {
      observed_at: ISO(), api_base: this.apiBase, organization_id: organization,
      user: { id: me.data?.id ?? null, active: me.data?.active ?? null },
      organization: { id: org.data.id, name: org.data.name ?? null, deleted: org.data.deleted ?? null },
      permissions: clone(org.data.permissions ?? {}),
      membership: (org.data.members ?? []).filter(m => nativeID(m.user) === me.data?.id)
        .map(m => ({ user_id: nativeID(m.user), role: m.role ?? null })),
      credential: { source: 'environment', variable: this.tokenEnv, stored: false },
      note: 'These are native observations. Dataset edit/edit_resources and the write endpoint remain authoritative.',
    };
  }
  _marker(record, key = null) {
    return { schema: 'commons.datagouv.publication-reference.v1', operation_id: record.operation_id,
      selection_sha256: record.selection_sha256, resource_key: key };
  }
  _metadata(record, row = null, baseline = {}) {
    const wanted = row ? row.metadata : record.plan.dataset;
    const out = { ...selected(baseline, row ? RESOURCE_FIELDS : DATASET_FIELDS), ...clone(wanted) };
    out.extras = { ...(baseline.extras ?? {}), ...(wanted.extras ?? {}), [EXTRA_KEY]: this._marker(record, row?.key ?? null) };
    if (row) {
      out.filetype = row.mode === 'file' ? 'file' : 'remote';
      if (row.mode === 'remote') {
        out.url = row.url;
        if (Object.hasOwn(row, 'checksum')) out.checksum = clone(row.checksum);
        if (Object.hasOwn(row, 'filesize')) out.filesize = row.filesize;
      } else {
        // Hosted-file metadata updates must keep its native URL. The API
        // protects URL/checksum/size; this module never invents those values.
        out.url = baseline.url;
      }
    } else {
      out.organization = record.plan.organization_id;
      out.private = true;
    }
    return out;
  }
  _validateDataset(record, dataset, { draft = false, permissions = false } = {}) {
    if (!dataset || dataset.id !== record.dataset_id || nativeID(dataset.organization) !== record.plan.organization_id) fail('dataset_mismatch', 'The returned dataset is not the selected original organization/dataset.');
    if (dataset.deleted || dataset.archived) fail('dataset_unavailable', 'The selected dataset is deleted or archived; no implicit restoration was attempted.');
    if (draft && dataset.private !== true) fail('draft_visibility_changed', 'The selected remote dataset is no longer private.');
    if (permissions && (dataset.permissions?.edit === false || dataset.permissions?.edit_resources === false)) fail('native_permission_denied', 'The native dataset denies editing or resource editing.', { permissions: dataset.permissions });
  }
  _mutationIntent(method, path, body, file) {
    const intent = { api_base: this.apiBase, method, path };
    if (body !== undefined) intent.body = clone(body);
    if (file) intent.file = selected(file, ['bytes', 'sha256', 'sha1', 'upload_name', 'mime']);
    return intent;
  }
  async _observe(record, label, data) {
    const observation = { label, observed_at: ISO(), data: clone(data) };
    record.observations.push(observation);
    await this._save(record);
    return observation;
  }
  async _mutation(record, key, { method, path, body, file, baseline, verify, checkPrecondition }, retryRejected = []) {
    const intent = this._mutationIntent(method, path, body, file);
    const intentSha = sha(intent);
    let step = record.steps[key];
    if (step && step.intent_sha256 !== intentSha) fail('operation_body_conflict', 'A retained native step has a different exact body or file identity.', { step: key });
    if (!step) {
      step = record.steps[key] = { key, intent, intent_sha256: intentSha, baseline: clone(baseline ?? null),
        state: 'prepared', attempts: [], verification: null, created_at: ISO() };
      await this._save(record);
      step = record.steps[key];
    }
    if (step.state === 'verified') return clone(step.verification.data);
    // A persisted dispatch is an uncertainty barrier even if this process died
    // before fetch started. A GET may establish the desired state; no POST repeats.
    if (['dispatching', 'uncertain', 'response_received'].includes(step.state)) {
      const check = await verify(step);
      if (check?.matched) {
        step = record.steps[key];
        step.state = 'verified';
        step.verification = { observed_at: ISO(), via: 'native_readback', data: clone(check.data), evidence: clone(check.evidence ?? {}) };
        await this._save(record);
        return clone(check.data);
      }
      step = record.steps[key];
      step.state = 'uncertain';
      step.last_reconciliation = { observed_at: ISO(), ...clone(check ?? { matched: false }) };
      record.state = 'reconciliation_required';
      await this._save(record);
      fail('reconciliation_required', 'The original mutation has no conclusive matching native readback; its exact request has not been repeated.', { step: key, reconciliation: step.last_reconciliation });
    }
    if (step.state === 'rejected') {
      const prior = step.attempts.at(-1);
      const retryAt = prior?.response?.retry_at;
      if (retryAt && Date.now() < Date.parse(retryAt)) fail('provider_backoff', 'The original provider retry deadline has not passed.', { step: key, retry_at: retryAt });
      if (!retryRejected.includes(key)) fail('native_request_rejected', 'The original API rejected this exact step. An explicit same-intent retry is required after correcting the external condition.', { step: key, response: prior?.response });
      // An explicit rejected retry still reads current native state first.
      const check = await verify(step);
      if (check?.matched) {
        step = record.steps[key]; step.state = 'verified';
        step.verification = { observed_at: ISO(), via: 'native_readback_after_rejection', data: clone(check.data), evidence: clone(check.evidence ?? {}) };
        await this._save(record);
        return clone(check.data);
      }
      if (prior?.response?.status === null || prior?.response?.status >= 500 || [408, 409].includes(prior?.response?.status)) fail('reconciliation_required', 'An uncertain result cannot be converted into a rejected retry.');
    }
    if (checkPrecondition) {
      const precondition = await checkPrecondition(record.steps[key]);
      if (!precondition?.matched) fail('remote_preimage_changed', 'The selected remote object changed before this write; no mutation was dispatched.', { step: key, precondition });
    }
    this._respectRetainedBackoff(record);
    step = record.steps[key];
    if (file) await inspectFile(file.path, file);
    const attempt = { number: step.attempts.length + 1, dispatch_at: ISO(), state: 'dispatching' };
    step.attempts.push(attempt);
    step.state = 'dispatching';
    record.state = key === 'dataset.publish' ? 'publishing' : 'saving_draft';
    await this._save(record); // CAS dispatch claim before the first network byte.
    let response;
    try { response = await this._http(method, path, { body, file }); }
    catch (error) {
      response = { method, path, status: null, ok: false, uncertain: true, observed_at: ISO(),
        error: error.code ?? error.name, message: String(error.message ?? error) };
    }
    step = record.steps[key];
    const retainedAttempt = step.attempts.at(-1);
    retainedAttempt.response = response;
    retainedAttempt.state = response.ok ? 'response_received' : (response.status !== null && response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status) ? 'rejected' : 'uncertain');
    step.state = retainedAttempt.state;
    await this._save(record); // Native result before dependent work or local IDs.
    if (step.state === 'rejected') fail('native_request_rejected', 'The original API rejected this step.', { step: key, response });
    const check = await verify(step);
    if (check?.matched) {
      step = record.steps[key]; step.state = 'verified';
      step.verification = { observed_at: ISO(), via: response.ok ? 'native_response_and_readback' : 'native_readback_after_uncertain_response',
        data: clone(check.data), evidence: clone(check.evidence ?? {}) };
      await this._save(record);
      return clone(check.data);
    }
    step = record.steps[key]; step.state = 'uncertain';
    step.last_reconciliation = { observed_at: ISO(), ...clone(check ?? { matched: false }) };
    record.state = 'reconciliation_required';
    await this._save(record);
    fail('reconciliation_required', 'The sent native mutation is retained without a matching readback. Continue its original reconciliation.', { step: key, reconciliation: step.last_reconciliation });
  }

  async _datasetCheck(record, step, wanted, candidateId = null) {
    const ids = new Set([candidateId, record.dataset_id, step.attempts.at(-1)?.response?.data?.id].filter(Boolean));
    if (ids.size > 1) return { matched: false, reason: 'conflicting_dataset_ids', ids: [...ids] };
    if (!ids.size) return { matched: false, reason: 'dataset_id_not_returned', next: 'reconcile with the original dataset ID or locateDrafts page' };
    const datasetID = [...ids][0];
    const result = await this._read(record, this._datasetPath(datasetID));
    if (!result.ok) return { matched: false, reason: 'dataset_read_failed', response: result };
    if (result.data.id !== datasetID || nativeID(result.data.organization) !== record.plan.organization_id
        || !wantedSubset(result.data, wanted)) return { matched: false, reason: 'dataset_body_differs', dataset_id: datasetID, actual_sha256: sha(datasetProjection(result.data)) };
    return { matched: true, data: result.data, evidence: { dataset_id: datasetID, response_sha256: result.response_sha256 } };
  }
  async _fileCheck(record, row, step, candidateId = null) {
    const did = record.dataset_id;
    const datasetResponse = await this._read(record, this._datasetPath(did));
    if (!datasetResponse.ok) return { matched: false, reason: 'dataset_read_failed', response: datasetResponse };
    this._validateDataset(record, datasetResponse.data, { draft: true });
    const returnedID = step.attempts.at(-1)?.response?.data?.id;
    const known = [...new Set([row.resource_id, record.resource_ids[row.key], candidateId, returnedID].filter(Boolean))];
    if (known.length > 1) return { matched: false, reason: 'conflicting_resource_ids', resource_ids: known };
    let candidates;
    if (known.length) candidates = (datasetResponse.data.resources ?? []).filter(r => r.id === known[0]);
    else {
      const priorIDs = new Set(step.baseline?.resource_ids ?? []);
      candidates = (datasetResponse.data.resources ?? []).filter(r => !priorIDs.has(r.id)
        && r.title === row.file.upload_name && checksumMatches(r, row.file));
    }
    candidates = candidates.filter(r => checksumMatches(r, row.file));
    if (candidates.length !== 1) return { matched: false, reason: candidates.length ? 'ambiguous_upload' : 'upload_not_identified', candidate_ids: candidates.map(r => r.id) };
    const resource = candidates[0];
    return { matched: true, data: resource, evidence: {
      dataset_id: did, resource_id: resource.id, bytes: row.file.bytes,
      source_sha256: row.file.sha256, native_checksum: resource.checksum,
      identified_by: known.length ? 'exact_original_resource_id' : 'new_id_unique_operation_filename_and_native_checksum',
    } };
  }
  async _resourceCheck(record, row, step, wanted, candidateId = null) {
    const returnedID = step.attempts.at(-1)?.response?.data?.id;
    const ids = [...new Set([row.resource_id, record.resource_ids[row.key], candidateId, returnedID].filter(Boolean))];
    if (ids.length > 1) return { matched: false, reason: 'conflicting_resource_ids', resource_ids: ids };
    const datasetResponse = await this._read(record, this._datasetPath(record.dataset_id));
    if (!datasetResponse.ok) return { matched: false, reason: 'dataset_read_failed', response: datasetResponse };
    this._validateDataset(record, datasetResponse.data, { draft: true });
    const resources = datasetResponse.data.resources ?? [];
    const candidates = ids.length ? resources.filter(r => r.id === ids[0])
      : resources.filter(r => subset(r.extras?.[EXTRA_KEY], this._marker(record, row.key)));
    const matching = candidates.filter(r => wantedSubset(r, wanted));
    if (matching.length !== 1) return { matched: false, reason: matching.length ? 'ambiguous_resource' : 'resource_body_differs_or_missing', candidate_ids: candidates.map(r => r.id) };
    return { matched: true, data: matching[0], evidence: { dataset_id: record.dataset_id, resource_id: matching[0].id, response_sha256: datasetResponse.response_sha256 } };
  }

  async _preimage(record, expected, resourceID = null, requirePrivate = true) {
    const response = await this._read(record, this._datasetPath(record.dataset_id));
    if (!response.ok) return { matched: false, reason: 'preimage_read_failed', response };
    this._validateDataset(record, response.data, { draft: requirePrivate, permissions: true });
    const current = resourceID
      ? (response.data.resources ?? []).find(r => r.id === resourceID)
      : response.data;
    if (!current) return { matched: false, reason: 'selected_resource_missing', resource_id: resourceID };
    const projection = resourceID ? resourceProjection(current) : datasetProjection(current);
    const actual = sha(projection);
    return { matched: actual === expected, expected_sha256: expected, actual_sha256: actual };
  }

  _assertPlanSatisfied(record, dataset, privateExpected = true) {
    this._validateDataset(record, dataset, { draft: privateExpected === true });
    if (dataset.private !== privateExpected) fail('visibility_mismatch', 'The native visibility differs from the selected stage.');
    const datasetStep = record.steps['dataset.save'];
    if (datasetStep?.state !== 'verified') fail('draft_incomplete', 'The original dataset save has not been verified.');
    const wanted = clone(datasetStep.intent.body);
    wanted.private = privateExpected;
    if (!wantedSubset(dataset, wanted)) fail('draft_body_changed', 'The native dataset metadata no longer matches the retained save.');
    for (const row of record.plan.resources) {
      const rid = record.resource_ids[row.key];
      const resource = (dataset.resources ?? []).find(r => r.id === rid);
      const metadataStep = record.steps['resource.' + row.key + '.metadata'];
      if (!rid || !resource || metadataStep?.state !== 'verified') fail('draft_incomplete', 'A selected resource has no completed exact native metadata save.', { key: row.key, resource_id: rid ?? null });
      if (!wantedSubset(resource, metadataStep.intent.body)) fail('resource_body_changed', 'Selected resource metadata changed after its retained save.', { key: row.key, resource_id: rid });
      if (row.mode === 'file' && !checksumMatches(resource, row.file)) fail('resource_bytes_changed', 'The native hosted resource no longer has the selected original bytes.', { key: row.key, resource_id: rid });
    }
  }

  _respectRetainedBackoff(record) {
    const steps = Object.values(record.steps);
    const responses = [
      ...steps.flatMap(step => step.attempts.map(attempt => attempt.response)),
      ...(record.read_responses ?? []),
      // These fields also cover operations retained by the earlier edition.
      ...steps.map(step => step.last_reconciliation?.response),
      record.publication?.public_readback?.response,
      ...(record.observations ?? []).flatMap(item => [item.response, item.data?.response]),
    ];
    const deadlines = responses
      .filter(response => response && !response.ok && response.retry_at
        && Date.parse(response.retry_at) > Date.now())
      .sort((a, b) => Date.parse(b.retry_at) - Date.parse(a.retry_at));
    if (deadlines.length) fail('provider_backoff', 'The original provider retry deadline has not passed.', {
      retry_at: deadlines[0].retry_at, response: deadlines[0],
    });
  }

  async _snapshotDraft(record) {
    const response = await this._get(this._datasetPath(record.dataset_id), true, record);
    this._assertPlanSatisfied(record, response.data, true);
    const projection = datasetProjection(response.data);
    const digest = sha(projection);
    record.draft = {
      sha256: digest, projection, data: response.data, observed_at: response.observed_at,
      response_sha256: response.response_sha256,
      dataset_id: record.dataset_id, resource_ids: clone(record.resource_ids),
      visibility: 'private', selection_sha256: record.selection_sha256,
    };
    const latestReview = record.reviews.at(-1);
    record.state = latestReview?.draft_sha256 === digest
      ? (latestReview.decision === 'approved' ? 'reviewed' : 'needs_changes') : 'draft_saved';
    await this._save(record);
    return clone(record.draft);
  }

  async saveDraft(input) {
    only(input, ['operationId', 'filePaths', 'retryRejected'], 'Save input');
    text(input.operationId, 'operationId', 200);
    const paths = input.filePaths ?? {};
    object(paths, 'filePaths');
    const retries = input.retryRejected ?? [];
    if (!Array.isArray(retries) || retries.some(v => typeof v !== 'string')) fail('invalid_retry_selection', 'retryRejected must list the exact retained rejected step keys.');
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      this._respectRetainedBackoff(record);
      if (record.publication || record.steps['dataset.publish']) fail('publication_already_selected', 'This operation already selected publication. Inspect or reconcile it; use a new operation for another edit.');
      const allowedKeys = record.plan.resources.filter(r => r.mode === 'file').map(r => r.key);
      for (const key of Object.keys(paths)) if (!allowedKeys.includes(key)) fail('invalid_file_selection', 'filePaths names an unselected hosted resource.', { key });
      for (const key of retries) {
        if (!record.steps[key] || record.steps[key].state !== 'rejected') fail('invalid_retry_selection', 'An explicit retry must name a retained definitively rejected step.', { key });
      }
      record.access = await this._inspectAccess(record.plan.organization_id, record);
      await this._save(record);

      let datasetStep = record.steps['dataset.save'];
      let baseline, body;
      if (datasetStep) {
        baseline = datasetStep.baseline;
        body = clone(datasetStep.intent.body);
      } else if (record.dataset_id) {
        const current = await this._get(this._datasetPath(record.dataset_id), true, record);
        this._validateDataset(record, current.data, { permissions: true });
        baseline = {
          dataset_id: record.dataset_id, projection_sha256: sha(datasetProjection(current.data)),
          resource_ids: (current.data.resources ?? []).map(r => r.id),
          observed_at: current.observed_at,
        };
        body = this._metadata(record, null, current.data);
      } else {
        baseline = { dataset_id: null, organization_id: record.plan.organization_id };
        body = this._metadata(record);
      }
      const datasetMethod = record.plan.dataset_id ? 'PUT' : 'POST';
      const datasetPath = record.plan.dataset_id ? this._datasetPath(record.plan.dataset_id) : 'datasets/';
      const dataset = await this._mutation(record, 'dataset.save', {
        method: datasetMethod, path: datasetPath, body, baseline,
        verify: step => this._datasetCheck(record, step, step.intent.body),
        checkPrecondition: record.plan.dataset_id
          ? step => this._preimage(record, step.baseline.projection_sha256, null, false) : null,
      }, retries);
      const returnedID = id(dataset.id, 'Returned dataset ID');
      if (record.dataset_id && record.dataset_id !== returnedID) fail('dataset_mismatch', 'The original dataset ID changed.');
      record.dataset_id = returnedID;
      await this._save(record);

      for (const row of record.plan.resources) {
        const uploadKey = 'resource.' + row.key + '.upload';
        const metadataKey = 'resource.' + row.key + '.metadata';
        // An already-verified upload is recovered without needing a local file.
        // The final draft read still checks its native bytes and all metadata.
        if (row.mode === 'file') {
          const retained = record.steps[uploadKey];
          let uploadBaseline;
          if (retained) uploadBaseline = retained.baseline;
          else {
            const current = await this._get(this._datasetPath(record.dataset_id), true, record);
            this._validateDataset(record, current.data, { draft: true, permissions: true });
            const prior = row.resource_id ? (current.data.resources ?? []).find(r => r.id === row.resource_id) : null;
            if (row.resource_id && !prior) fail('resource_not_in_dataset', 'The selected original resource does not belong to this dataset.', { key: row.key });
            if (prior && prior.filetype !== 'file') fail('resource_route_changed', 'A remote resource cannot be replaced through the hosted-file route.', { key: row.key });
            uploadBaseline = {
              resource_ids: (current.data.resources ?? []).map(r => r.id),
              resource_id: row.resource_id,
              resource_sha256: prior ? sha(resourceProjection(prior)) : null,
              dataset_sha256: sha(datasetProjection(current.data)),
              observed_at: current.observed_at,
            };
          }
          const file = { ...row.file, path: paths[row.key] ?? row.file.path };
          const path = row.resource_id
            ? this._resourcePath(record.dataset_id, row.resource_id) + 'upload/'
            : this._datasetPath(record.dataset_id) + 'upload/';
          const uploaded = await this._mutation(record, uploadKey, {
            method: 'POST', path, file, baseline: uploadBaseline,
            verify: step => this._fileCheck(record, row, step),
            checkPrecondition: step => row.resource_id
              ? this._preimage(record, step.baseline.resource_sha256, row.resource_id)
              : this._preimage(record, step.baseline.dataset_sha256),
          }, retries);
          const rid = resourceId(uploaded.id);
          if (record.resource_ids[row.key] && record.resource_ids[row.key] !== rid) fail('resource_mismatch', 'The uploaded resource ID changed.');
          record.resource_ids[row.key] = rid;
          await this._save(record);
        }

        const knownID = record.resource_ids[row.key] ?? row.resource_id;
        const retained = record.steps[metadataKey];
        let resourceBaseline, metadata;
        if (retained) {
          resourceBaseline = retained.baseline;
          metadata = clone(retained.intent.body);
        } else {
          const current = await this._get(this._datasetPath(record.dataset_id), true, record);
          this._validateDataset(record, current.data, { draft: true, permissions: true });
          const prior = knownID ? (current.data.resources ?? []).find(r => r.id === knownID) : null;
          if (knownID && !prior) fail('resource_not_in_dataset', 'The selected resource does not belong to this dataset.', { key: row.key });
          if (prior && prior.filetype !== row.mode) fail('resource_route_changed', 'The API does not change a resource between hosted-file and remote-URL modes.', { key: row.key });
          resourceBaseline = {
            resource_id: knownID ?? null, resource_ids: (current.data.resources ?? []).map(r => r.id),
            resource_sha256: prior ? sha(resourceProjection(prior)) : null,
            dataset_sha256: sha(datasetProjection(current.data)), observed_at: current.observed_at,
          };
          metadata = this._metadata(record, row, prior ?? {});
        }
        const method = retained?.intent.method ?? (knownID ? 'PUT' : 'POST');
        const path = retained?.intent.path ?? (knownID ? this._resourcePath(record.dataset_id, knownID)
          : this._datasetPath(record.dataset_id) + 'resources/');
        const savedResource = await this._mutation(record, metadataKey, {
          method, path, body: metadata, baseline: resourceBaseline,
          verify: step => this._resourceCheck(record, row, step, step.intent.body),
          checkPrecondition: step => step.baseline.resource_id
            ? this._preimage(record, step.baseline.resource_sha256, step.baseline.resource_id)
            : this._preimage(record, step.baseline.dataset_sha256),
        }, retries);
        const rid = resourceId(savedResource.id);
        if (record.resource_ids[row.key] && record.resource_ids[row.key] !== rid) fail('resource_mismatch', 'The original resource ID changed.');
        record.resource_ids[row.key] = rid;
        await this._save(record);
      }
      const draft = await this._snapshotDraft(record);
      return { operation: clone(record), draft };
    });
  }

  async reviewDraft(input) {
    only(input, ['operationId', 'reviewer', 'note', 'decision', 'expectedDraftSha256'], 'Review input');
    text(input.operationId, 'operationId', 200);
    text(input.reviewer, 'Reviewer', 200);
    text(input.note, 'Review note', 20000);
    if (!['approved', 'needs_changes'].includes(input.decision)) fail('invalid_review', 'Review decision must be approved or needs_changes.');
    if (!/^[a-f0-9]{64}$/.test(input.expectedDraftSha256 ?? '')) fail('invalid_review', 'Pass the exact reviewed draft SHA-256.');
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      this._respectRetainedBackoff(record);
      if (record.publication || record.steps['dataset.publish']) fail('publication_already_selected', 'Publication has already been selected; inspect or reconcile that original action.');
      if (!record.draft || record.draft.sha256 !== input.expectedDraftSha256) fail('draft_review_stale', 'The review does not name the currently retained draft.');
      const current = await this._get(this._datasetPath(record.dataset_id), true, record);
      this._assertPlanSatisfied(record, current.data, true);
      const currentSha = sha(datasetProjection(current.data));
      if (currentSha !== input.expectedDraftSha256) fail('draft_review_stale', 'The native draft changed before the review. Refresh and review its actual current content.', { expected_sha256: input.expectedDraftSha256, current_sha256: currentSha });
      const reviewBodySha = sha([record.operation_id, input.expectedDraftSha256, input.reviewer, input.note, input.decision]);
      const old = record.reviews.at(-1);
      if (old?.body_sha256 === reviewBodySha) return { operation: record, review: clone(old), reused: true };
      const reviewID = sha([reviewBodySha, old?.id ?? null]);
      const review = {
        id: reviewID, body_sha256: reviewBodySha, reviewer: input.reviewer, note: input.note, decision: input.decision,
        reviewed_at: ISO(), draft_sha256: input.expectedDraftSha256,
        selection_sha256: record.selection_sha256, dataset_id: record.dataset_id,
        provenance: 'explicit_operator_review',
      };
      record.reviews.push(review);
      record.state = input.decision === 'approved' ? 'reviewed' : 'needs_changes';
      await this._save(record);
      return { operation: clone(record), review: clone(review), reused: false };
    });
  }

  async _publicationCheck(record, step, authenticated = true) {
    const response = await this._read(record, this._datasetPath(record.dataset_id), authenticated);
    if (!response.ok) return { matched: false, reason: authenticated ? 'published_read_failed' : 'anonymous_read_failed', response };
    this._validateDataset(record, response.data);
    const actual = datasetProjection(response.data);
    const digest = sha(actual);
    return {
      matched: response.data.private === false && digest === step.baseline.public_sha256,
      reason: response.data.private === false ? 'published_projection_comparison' : 'dataset_is_still_private',
      data: response.data,
      evidence: {
        dataset_id: record.dataset_id, authenticated,
        expected_sha256: step.baseline.public_sha256, actual_sha256: digest,
        response_sha256: response.response_sha256, observed_at: response.observed_at,
      },
    };
  }
  async _finishPublication(record, { refresh = false } = {}) {
    const step = record.steps['dataset.publish'];
    if (!step || step.state !== 'verified') fail('publication_not_verified', 'The selected publication has no conclusive native readback.');
    const completed = record.publication?.visibility === 'public_verified'
      && record.publication.public_readback?.matched === true;
    if (completed && !refresh) return {
      operation: clone(record), publication: clone(record.publication), complete: true, reused: true,
    };
    const check = await this._publicationCheck(record, step, false);
    const observation = { label: 'publication_readback', observed_at: ISO(), ...clone(check) };
    record.observations.push(observation);
    // The first successful public readback is the completed original receipt.
    // A later changed edition or failed GET is a separate current observation.
    if (!completed) record.publication = {
      dataset_id: record.dataset_id, resource_ids: clone(record.resource_ids),
      review_id: step.baseline.review_id, draft_sha256: step.baseline.draft_sha256,
      public_sha256: step.baseline.public_sha256,
      native_write_verified_at: step.verification.observed_at,
      public_readback: { observed_at: observation.observed_at, ...clone(check) },
      visibility: check.matched ? 'public_verified' : 'publication_readback_pending',
      url: check.data?.page ?? step.verification.data?.page ?? null,
    };
    record.state = completed || check.matched ? 'published' : 'published_readback_pending';
    await this._save(record);
    return {
      operation: clone(record), publication: clone(record.publication),
      observation: clone(observation), current_matches_reviewed: Boolean(check.matched),
      complete: Boolean(completed || check.matched), reused: completed,
    };
  }

  async publish(input) {
    only(input, ['operationId', 'reviewId', 'retryRejected'], 'Publish input');
    text(input.operationId, 'operationId', 200);
    text(input.reviewId, 'Review ID', 64);
    if (input.retryRejected !== undefined && typeof input.retryRejected !== 'boolean') fail('invalid_retry_selection', 'retryRejected must be an explicit boolean.');
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      const review = record.reviews.find(r => r.id === input.reviewId);
      if (!review || review.decision !== 'approved') fail('approved_review_required', 'Select a retained approved review.');
      const retained = record.steps['dataset.publish'];
      if (retained && retained.baseline.review_id !== input.reviewId) fail('publication_review_conflict', 'The original publication already names another review.');
      if (!retained && record.reviews.at(-1)?.id !== input.reviewId) fail('review_superseded', 'A later explicit review supersedes this review.');
      if (!record.draft || record.draft.sha256 !== review.draft_sha256) fail('draft_review_stale', 'The selected review does not match the retained draft.');
      if (retained?.state === 'verified' && record.publication?.visibility === 'public_verified'
          && record.publication.public_readback?.matched === true) return this._finishPublication(record);
      this._respectRetainedBackoff(record);
      let baseline, body;
      if (retained) {
        baseline = retained.baseline;
        body = clone(retained.intent.body);
      } else {
        const current = await this._get(this._datasetPath(record.dataset_id), true, record);
        this._assertPlanSatisfied(record, current.data, true);
        const draftProjection = datasetProjection(current.data);
        const actualSha = sha(draftProjection);
        if (actualSha !== review.draft_sha256) fail('draft_review_stale', 'The native draft changed after review; refresh and review it before publication.', { reviewed_sha256: review.draft_sha256, actual_sha256: actualSha });
        const publicProjection = clone(draftProjection);
        publicProjection.private = false;
        baseline = {
          review_id: review.id, draft_sha256: review.draft_sha256,
          public_projection: publicProjection, public_sha256: sha(publicProjection),
          dataset_id: record.dataset_id, observed_at: current.observed_at,
        };
        // This is the sole deliberately public API mutation in this module.
        // The exact currently reviewed metadata accompanies the visibility flip.
        // Resource updates continue through their own original API routes.
        body = selected(current.data, DATASET_FIELDS);
        body.organization = record.plan.organization_id;
        body.private = false;
      }
      await this._mutation(record, 'dataset.publish', {
        method: 'PUT', path: this._datasetPath(record.dataset_id), body, baseline,
        verify: step => this._publicationCheck(record, step),
        checkPrecondition: step => this._preimage(record, step.baseline.draft_sha256),
      }, input.retryRejected ? ['dataset.publish'] : []);
      return this._finishPublication(record);
    });
  }

  async inspect(input) {
    only(input, ['operationId', 'refresh'], 'Inspect input');
    text(input.operationId, 'operationId', 200);
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') fail('invalid_refresh', 'refresh must be a boolean.');
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      if (!input.refresh || !record.dataset_id) return { operation: record };
      this._respectRetainedBackoff(record);
      const publishStep = record.steps['dataset.publish'];
      if (publishStep?.state === 'verified') return this._finishPublication(record, { refresh: true });
      if (publishStep) {
        const check = await this._publicationCheck(record, publishStep);
        record.observations.push({ label: 'publication_inspection', observed_at: ISO(), ...clone(check) });
        await this._save(record);
        return { operation: clone(record), observation: check };
      }
      const complete = record.steps['dataset.save']?.state === 'verified'
        && record.plan.resources.every(row => record.steps['resource.' + row.key + '.metadata']?.state === 'verified');
      if (complete) {
        const draft = await this._snapshotDraft(record);
        return { operation: clone(record), draft };
      }
      const response = await this._get(this._datasetPath(record.dataset_id), true, record);
      this._validateDataset(record, response.data);
      const observation = {
        label: 'incomplete_draft_inspection', observed_at: response.observed_at,
        dataset_id: record.dataset_id, private: response.data.private,
        projection: datasetProjection(response.data), response_sha256: response.response_sha256,
      };
      record.observations.push(observation);
      await this._save(record);
      return { operation: clone(record), observation };
    });
  }

  async locateDrafts(input) {
    only(input, ['operationId', 'page', 'pageSize'], 'Locate input');
    text(input.operationId, 'operationId', 200);
    const page = input.page ?? 1, size = input.pageSize ?? 100;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 100) fail('invalid_page', 'Select one native page and pageSize between 1 and 100.');
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      this._respectRetainedBackoff(record);
      const path = 'organizations/' + record.plan.organization_id + '/datasets/?page=' + page + '&page_size=' + size;
      const response = await this._get(path, true, record);
      if (!Array.isArray(response.data?.data)) fail('unexpected_native_page', 'The organization datasets response has no native data array.');
      const originalBody = record.steps['dataset.save']?.intent.body ?? this._metadata(record);
      const candidates = response.data.data
        .filter(dataset => nativeID(dataset.organization) === record.plan.organization_id
          && subset(dataset.extras?.[EXTRA_KEY], this._marker(record)))
        .map(dataset => ({
          dataset_id: dataset.id, private: dataset.private,
          matches_original_body: wantedSubset(dataset, originalBody),
          projection_sha256: sha(datasetProjection(dataset)),
        }));
      return {
        operation: record, candidates, page: response.data.page ?? page,
        pageSize: response.data.page_size ?? size, total: response.data.total ?? null,
        nextPage: response.data.next_page ?? null,
        previousPage: response.data.previous_page ?? null,
        observed_at: response.observed_at, response_sha256: response.response_sha256,
        note: 'One original native page was read. Absence or an incomplete private listing is not evidence that an uncertain create did not happen. Pass an exact candidate ID to reconcile; no create is retried here.',
      };
    });
  }

  async reconcile(input) {
    only(input, ['operationId', 'datasetId', 'resourceIds'], 'Reconcile input');
    text(input.operationId, 'operationId', 200);
    const suppliedDataset = input.datasetId == null ? null : id(input.datasetId, 'Original dataset ID');
    const suppliedResources = input.resourceIds ?? {};
    object(suppliedResources, 'resourceIds');
    for (const value of Object.values(suppliedResources)) resourceId(value);
    return this._serial(input.operationId, async () => {
      const record = await this._load(input.operationId);
      for (const key of Object.keys(suppliedResources)) {
        if (!record.plan.resources.some(r => r.key === key)) fail('resource_not_selected', 'The supplied original resource ID has no selected key.', { key });
        const selected = record.resource_ids[key] ?? record.plan.resources.find(r => r.key === key).resource_id;
        if (selected && selected !== suppliedResources[key]) fail('resource_mismatch', 'The supplied ID differs from the retained original resource.', { key });
      }
      if (suppliedDataset && record.dataset_id && suppliedDataset !== record.dataset_id) fail('dataset_mismatch', 'The supplied dataset ID differs from the original retained ID.');
      if (record.steps['dataset.publish']?.state === 'verified'
          && record.publication?.visibility === 'public_verified'
          && record.publication.public_readback?.matched === true) return this._finishPublication(record);
      this._respectRetainedBackoff(record);
      const unresolved = [], reconciled = [];
      let saveStep = record.steps['dataset.save'];
      if (!saveStep) return { operation: record, unresolved: [{ step: 'dataset.save', reason: 'not_prepared_or_dispatched' }], reconciled };
      if (saveStep.state !== 'verified') {
        if (!saveStep.attempts.length) return { operation: record, unresolved: [{ step: 'dataset.save', reason: 'not_dispatched' }], reconciled };
        const check = await this._datasetCheck(record, saveStep, saveStep.intent.body, suppliedDataset);
        saveStep = record.steps['dataset.save'];
        saveStep.last_reconciliation = { observed_at: ISO(), ...clone(check) };
        if (check.matched) {
          record.dataset_id = id(check.data.id, 'Original dataset ID');
          saveStep.state = 'verified';
          saveStep.verification = { observed_at: ISO(), via: 'explicit_original_id_readback', data: clone(check.data), evidence: clone(check.evidence ?? {}) };
          reconciled.push('dataset.save');
        } else unresolved.push({ step: 'dataset.save', ...clone(check) });
        await this._save(record);
      } else if (!record.dataset_id) {
        record.dataset_id = id(saveStep.verification.data.id, 'Retained original dataset ID');
        await this._save(record);
      }
      if (!record.dataset_id || record.steps['dataset.save'].state !== 'verified') return { operation: clone(record), unresolved, reconciled };
      let publishStep = record.steps['dataset.publish'];
      if (publishStep) {
        if (publishStep.state === 'verified') return this._finishPublication(record);
        if (!publishStep.attempts.length) {
          unresolved.push({ step: 'dataset.publish', reason: 'not_dispatched' });
        } else {
          const check = await this._publicationCheck(record, publishStep);
          publishStep = record.steps['dataset.publish'];
          publishStep.last_reconciliation = { observed_at: ISO(), ...clone(check) };
          if (check.matched) {
            publishStep.state = 'verified';
            publishStep.verification = { observed_at: ISO(), via: 'explicit_native_readback', data: clone(check.data), evidence: clone(check.evidence ?? {}) };
            await this._save(record);
            return this._finishPublication(record);
          }
          unresolved.push({ step: 'dataset.publish', ...clone(check) });
          await this._save(record);
        }
        return { operation: clone(record), unresolved, reconciled };
      }
      for (const row of record.plan.resources) {
        const candidate = suppliedResources[row.key] ?? null;
        for (const kind of row.mode === 'file' ? ['upload', 'metadata'] : ['metadata']) {
          const key = 'resource.' + row.key + '.' + kind;
          let step = record.steps[key];
          if (!step) { unresolved.push({ step: key, reason: 'not_prepared_or_dispatched' }); continue; }
          if (step.state === 'verified') {
            const rid = resourceId(step.verification.data.id);
            if (candidate && candidate !== rid) fail('resource_mismatch', 'The candidate differs from the verified original native ID.', { key });
            if (!record.resource_ids[row.key]) { record.resource_ids[row.key] = rid; await this._save(record); }
            continue;
          }
          if (!step.attempts.length) { unresolved.push({ step: key, reason: 'not_dispatched' }); continue; }
          const check = kind === 'upload'
            ? await this._fileCheck(record, row, step, candidate)
            : await this._resourceCheck(record, row, step, step.intent.body, candidate);
          step = record.steps[key];
          step.last_reconciliation = { observed_at: ISO(), ...clone(check) };
          if (check.matched) {
            const rid = resourceId(check.data.id);
            if (record.resource_ids[row.key] && record.resource_ids[row.key] !== rid) fail('resource_mismatch', 'Reconciliation returned another native resource.');
            record.resource_ids[row.key] = rid;
            step.state = 'verified';
            step.verification = { observed_at: ISO(), via: 'explicit_original_id_readback', data: clone(check.data), evidence: clone(check.evidence ?? {}) };
            reconciled.push(key);
          } else unresolved.push({ step: key, ...clone(check) });
          await this._save(record);
        }
      }
      const complete = record.plan.resources.every(row => record.steps['resource.' + row.key + '.metadata']?.state === 'verified');
      if (complete && !unresolved.length) await this._snapshotDraft(record);
      else {
        record.state = unresolved.some(x => !['not_dispatched', 'not_prepared_or_dispatched'].includes(x.reason))
          ? 'reconciliation_required' : 'draft_incomplete';
        await this._save(record);
      }
      return { operation: clone(record), unresolved, reconciled };
    });
  }
}
