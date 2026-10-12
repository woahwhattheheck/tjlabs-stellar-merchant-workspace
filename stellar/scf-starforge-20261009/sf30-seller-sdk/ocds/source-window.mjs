// MIT. Saved publisher selections, original document acquisition and assigned source reviews.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { failure, sha256, canonical } from './workspace.mjs';
import { buildFindTenderURL, captureFindTender } from './capture.mjs';
import { normalizeOcds } from './domain.mjs';

export const SOURCE_OPERATIONS_SCHEMA = 'stellar-forge.ocds.source-operations.v1';
const now = () => new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const encoded = value => canonical(value);
const need = (test, code, message, status = 400, details) => { if (!test) throw failure(code, message, status, details); };
const text = (value, name, maximum = 8192) => {
  need(typeof value === 'string' && value.length <= maximum, 'SOURCE_TEXT_INVALID', name + ' must be text of at most ' + maximum + ' characters');
  return value;
};
const identifier = value => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value || '');
const pointer = (document, path) => {
  if (path === '') return document;
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined;
  let value = document;
  for (const token of path.slice(1).split('/').map(v => v.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    value = value[token];
  }
  return value;
};
function problem(error) {
  return { code: error.code || error.name || 'SOURCE_OPERATION_ERROR', message: String(error.message || error),
    ...(error.details ? { details: clone(error.details) } : {}), at: now() };
}
function cooldown(response) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const time = /^\d+$/.test(value.trim()) ? Date.now() + Number(value.trim()) * 1000 : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function publicAddress(address) {
  let value = address.toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
      && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
  }
  return isIP(value) === 6 && value !== '::' && value !== '::1'
    && !/^f[cd]/.test(value) && !/^fe[89ab]/.test(value) && !/^ff/.test(value);
}
async function documentURL(raw, allowedHosts, resolveHost) {
  let url;
  try { url = new URL(raw); } catch { throw failure('DOCUMENT_URL_INVALID', 'The original document URL is not absolute HTTP or HTTPS'); }
  need(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
    'DOCUMENT_URL_INVALID', 'Original document retrieval requires an HTTP or HTTPS URL without embedded credentials');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  need(!allowedHosts?.length || allowedHosts.some(host => host.toLowerCase() === hostname),
    'DOCUMENT_HOST_CHANGED', 'The document redirect selected a host outside this saved source selection', 400, { hostname });
  need(hostname !== 'localhost' && !hostname.endsWith('.localhost') && !hostname.endsWith('.local'),
    'DOCUMENT_HOST_INVALID', 'Document URLs must identify a public publisher host');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolveHost(hostname, { all: true });
  need(addresses.length > 0 && addresses.every(row => publicAddress(row.address)),
    'DOCUMENT_HOST_INVALID', 'The document publisher resolves to a non-public address');
  url.hash = '';
  return url;
}
async function responseBytes(response, maximum) {
  const declared = Number(response.headers.get('content-length'));
  need(!Number.isFinite(declared) || declared <= maximum, 'DOCUMENT_CAPACITY',
    'The original document exceeds the configured per-document byte capacity', 413, { maximumBytes: maximum });
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.length;
      if (bytes > maximum) { await reader.cancel(); throw failure('DOCUMENT_CAPACITY',
        'The original document exceeds the configured per-document byte capacity', 413, { maximumBytes: maximum }); }
      chunks.push(Buffer.from(item.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, bytes);
}
function responseHeaders(response) {
  return Object.fromEntries(['content-type', 'content-disposition', 'content-language', 'content-length',
    'etag', 'last-modified', 'date', 'location', 'retry-after'].map(name => [name, response.headers.get(name)])
    .filter(([, value]) => value !== null));
}
function originalFilename(headers, url) {
  const content = headers['content-disposition'] || '';
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(content);
  if (utf8) { try { return decodeURIComponent(utf8[1].trim()); } catch {} }
  const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(content);
  if (plain) return (plain[1] || plain[2]).trim();
  try { return decodeURIComponent(new URL(url).pathname.split('/').at(-1) || 'document'); }
  catch { return 'document'; }
}
function documentBlockIdentity(document, path) {
  const tokens = path.slice(1).split('/').map(value => value.replaceAll('~1', '/').replaceAll('~0', '~'));
  let node = document; const identity = [];
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(node) && /^\d+$/.test(token)) {
      const item = node[Number(token)];
      identity.push(item && typeof item === 'object' && Object.hasOwn(item, 'id') ? { id: item.id } : { index: Number(token) });
      node = item;
    } else { identity.push(token); node = node?.[token]; }
  }
  return identity;
}
function httpReference(raw) {
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function bodyIdentity(value, maximum) {
  need(value && /^[0-9a-f]{64}$/.test(value.sha256) && value.path === 'documents/' + value.sha256 + '.bin'
    && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= maximum,
    'SOURCE_DOCUMENT_IDENTITY', 'The packet contains an invalid original document identity');
}

function scopedContext(input, selected) {
  const documents = (input.documents || []).filter(value => selected.has(value.ocid));
  const documentIds = new Set(documents.map(value => value.id));
  const work = (input.work || []).filter(value => selected.has(value.ocid)), workIds = new Set(work.map(value => value.id));
  const selections = (input.selections || []).filter(value => value.ocids.some(ocid => selected.has(ocid)))
    .map(value => ({ ...value, ocids: value.ocids.filter(ocid => selected.has(ocid)),
      attachments: (value.attachments || []).filter(item => selected.has(item.ocid)) }));
  const selectionIds = new Set(selections.map(value => value.id));
  const windows = (input.windows || []).filter(value => value.selectedOcids.some(ocid => selected.has(ocid))).map(value => ({
    ...value, selectedOcids: value.selectedOcids.filter(ocid => selected.has(ocid)),
    selections: value.selections.filter(item => selectionIds.has(item.id)).map(item => ({
      ...item, ocids: item.ocids.filter(ocid => selected.has(ocid)),
      attachments: (item.attachments || []).filter(attachment => selected.has(attachment.ocid)) })),
    baseline: value.baseline.filter(item => selected.has(item.ocid)), current: (value.current || []).filter(item => selected.has(item.ocid)),
    sources: value.sources.filter(item => selectionIds.has(item.selectionId)),
    references: value.references.filter(item => selected.has(item.ocid)),
    documents: value.documents.filter(item => item.referenceIds.some(id => documentIds.has(id))).map(item => ({
      ...item, referenceIds: item.referenceIds.filter(id => documentIds.has(id)),
      ...(item.result ? { result: { ...item.result, changed: (item.result.changed || []).filter(change => selected.has(change.ocid)) } } : {}) })),
    workIds: value.workIds.filter(id => workIds.has(id)), issues: value.issues.filter(item => !item.ocid || selected.has(item.ocid))
  }));
  return { selectedOcids: (input.selectedOcids || [...selected]).filter(ocid => selected.has(ocid)),
    selections, windows, documents, work, comparisons: (input.comparisons || []).filter(item => workIds.has(item.workId)) };
}

const findTenderAdapter = {
  validate(selection) { buildFindTenderURL(selection.request); },
  async capture(workspace, selection, context) {
    const existing = workspace.view().captures.filter(capture => capture.provider === 'find-tender'
      && capture.selection?.sourceWindowId === context.windowId
      && capture.selection?.sourceSelectionId === selection.id);
    need(existing.length <= 1, 'SOURCE_CAPTURE_AMBIGUOUS', 'More than one native capture is bound to this window selection', 409);
    const captureId = context.previous?.captureId || existing[0]?.id;
    const spec = captureId ? { captureId } : { ...selection.request,
      sourceWindowId: context.windowId, sourceSelectionId: selection.id };
    const result = await captureFindTender(workspace, spec, {
      fetchImpl: context.fetchImpl, signal: context.signal, onProgress: progress => context.onProgress({
        captureId: progress.captureId, pages: progress.page.index + 1, lastPage: progress.page, status: progress.status
      })
    });
    return { captureId: result.capture.id, status: result.capture.status,
      sourceIds: [...new Set(result.capture.pages.map(page => page.sourceId))],
      observations: result.capture.pages.map(page => ({ ...page, captureId: result.capture.id })) };
  }
};

export class SourceOperations {
  constructor(workspace, { adapters = {}, fetchImpl = globalThis.fetch, resolveHost = lookup,
    maxDocumentBytes = 128 * 1024 * 1024, maxRetainedDocumentBytes = 2 * 1024 * 1024 * 1024 } = {}) {
    need(workspace?.db && typeof workspace._change === 'function', 'SOURCE_WORKSPACE_REQUIRED', 'Use the original open OCDS workspace');
    need(typeof fetchImpl === 'function', 'FETCH_UNAVAILABLE', 'This runtime does not provide original-source HTTP retrieval');
    need(Number.isSafeInteger(maxDocumentBytes) && maxDocumentBytes > 0
      && Number.isSafeInteger(maxRetainedDocumentBytes) && maxRetainedDocumentBytes >= maxDocumentBytes,
      'DOCUMENT_CAPACITY_INVALID', 'Document capacities must be positive whole bytes');
    this.workspace = workspace; this.fetchImpl = fetchImpl; this.resolveHost = resolveHost;
    this.maxDocumentBytes = maxDocumentBytes; this.maxRetainedDocumentBytes = maxRetainedDocumentBytes;
    this.adapters = Object.assign(Object.create(null), { 'find-tender': findTenderAdapter }, adapters);
    workspace.db.exec('CREATE TABLE IF NOT EXISTS source_operation_rows (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));'
      + 'CREATE TABLE IF NOT EXISTS source_document_bodies (sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL, body BLOB NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS source_operation_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, window_id TEXT, expires INTEGER NOT NULL);'
      + 'INSERT OR IGNORE INTO source_operation_lease(id,owner,window_id,expires) VALUES(1,NULL,NULL,0);');
  }
  _get(kind, id) {
    const row = this.workspace.db.prepare('SELECT data FROM source_operation_rows WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(row.data) : null;
  }
  _rows(kind) { return this.workspace.db.prepare('SELECT data FROM source_operation_rows WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(row.data)); }
  _put(kind, value) {
    this.workspace.db.prepare('INSERT INTO source_operation_rows(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data')
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  _lease(owner, windowId) {
    const row = this.workspace.db.prepare('SELECT owner,window_id,expires FROM source_operation_lease WHERE id=1').get();
    need(row.owner === owner && row.window_id === windowId && row.expires > Date.now(),
      'SOURCE_WINDOW_LEASE_CHANGED', 'This window is being continued by another operator process', 409, { windowId });
    this.workspace.db.prepare('UPDATE source_operation_lease SET expires=? WHERE id=1 AND owner=?').run(Date.now() + 120000, owner);
  }
  _checkpoint(run, owner) {
    this._lease(owner, run.id);
    return this.workspace._change('source_window.checkpoint', () => {
      const previous = this._get('window', run.id);
      need(previous && previous.revision === run.revision, 'SOURCE_WINDOW_CHANGED', 'The saved source window changed; read its current state', 409);
      const next = { ...clone(run), revision: run.revision + 1, updatedAt: now() };
      this._put('window', next);
      return { value: next, audit: { sourceWindowId: run.id, status: next.status,
        completedSources: next.sources.filter(source => source.status === 'complete').length } };
    });
  }
  saveSelection(input, { expectedRevision } = {}) {
    need(input && typeof input === 'object' && !Array.isArray(input), 'SOURCE_SELECTION_INVALID', 'A saved selection must be an object');
    const selection = clone(input);
    need(identifier(selection.id), 'SOURCE_SELECTION_ID', 'Use a stable source-selection identifier');
    text(selection.label || selection.id, 'selection label', 1024);
    need(Array.isArray(selection.ocids) && selection.ocids.length > 0
      && selection.ocids.every(ocid => typeof ocid === 'string' && ocid.length > 0)
      && new Set(selection.ocids).size === selection.ocids.length,
      'SOURCE_SELECTION_OCIDS', 'List the original OCIDs covered by this client selection');
    need(typeof selection.provider === 'string' && typeof this.adapters[selection.provider]?.capture === 'function',
      'SOURCE_PROVIDER_UNAVAILABLE', 'The selected publisher adapter is not installed', 400, { provider: selection.provider });
    need(selection.request && typeof selection.request === 'object' && !Array.isArray(selection.request),
      'SOURCE_REQUEST_INVALID', 'Keep the publisher request as an object');
    if (selection.provider === 'find-tender' && selection.request.ocid)
      need(selection.ocids.length === 1 && selection.ocids[0] === selection.request.ocid,
        'SOURCE_SELECTION_SCOPE', 'A Find a Tender OCID request must match its one selected client OCID');
    selection.label = selection.label || selection.id;
    selection.owner = text(selection.owner || this.workspace.operator, 'review owner', 256);
    selection.enabled = selection.enabled !== false;
    selection.acquireDocuments = selection.acquireDocuments !== false;
    selection.documentEditionScope = selection.documentEditionScope || 'current';
    need(['current', 'all-retained'].includes(selection.documentEditionScope),
      'DOCUMENT_EDITION_SCOPE', 'Choose current or all-retained document editions');
    need(selection.documentHosts === undefined || (Array.isArray(selection.documentHosts)
      && selection.documentHosts.every(host => typeof host === 'string' && /^[A-Za-z0-9.-]+$/.test(host))),
      'DOCUMENT_HOSTS_INVALID', 'Document hosts must be exact public hostnames');
    need(selection.attachments === undefined || Array.isArray(selection.attachments),
      'SOURCE_ATTACHMENTS_INVALID', 'Explicit original attachment references must be an array');
    for (const attachment of selection.attachments || []) {
      need(attachment && selection.ocids.includes(attachment.ocid), 'SOURCE_ATTACHMENT_SCOPE', 'An explicit attachment must belong to a selected OCID');
      need(typeof attachment.referenceUrl === 'string' && httpReference(attachment.referenceUrl),
        'SOURCE_ATTACHMENT_REFERENCE', 'Retain the official notice URL which identifies an explicit attachment');
      need(attachment.document && typeof attachment.document === 'object' && !Array.isArray(attachment.document),
        'SOURCE_ATTACHMENT_DOCUMENT', 'Retain the original attachment fields');
    }
    need(!Object.prototype.hasOwnProperty.call(selection.request, 'captureId'), 'SAVED_CAPTURE_ID_INVALID',
      'Save a publisher request; resume a prior capture through its source-window ID');
    need(selection.reviewPolicy === undefined || (selection.reviewPolicy && typeof selection.reviewPolicy === 'object' && !Array.isArray(selection.reviewPolicy)),
      'SOURCE_REVIEW_POLICY_INVALID', 'Review policy must contain explicit administrative field rules');
    if (selection.reviewPolicy?.administrativePointers !== undefined)
      need(Array.isArray(selection.reviewPolicy.administrativePointers)
        && selection.reviewPolicy.administrativePointers.every(value => typeof value === 'string' && (value === '' || value.startsWith('/'))),
        'SOURCE_REVIEW_POLICY_INVALID', 'Administrative field rules must be exact JSON pointers');
    this.adapters[selection.provider].validate?.(selection);
    return this.workspace._change('source_selection.saved', () => {
      const previous = this._get('selection', selection.id), revision = previous?.revision || 0;
      need(Number.isSafeInteger(expectedRevision) && expectedRevision === revision,
        'SOURCE_SELECTION_CHANGED', 'Read the saved selection and supply its current revision', 409, { revision });
      const value = { ...selection, schema: 'stellar-forge.ocds.source-selection.v1',
        revision: revision + 1, createdAt: previous?.createdAt || now(), updatedAt: now() };
      this._put('selection', value);
      return { value, audit: { sourceSelectionId: value.id, ocids: value.ocids, selectionRevision: value.revision } };
    });
  }
  state() {
    return this.workspace._snapshot(() => ({
      schema: SOURCE_OPERATIONS_SCHEMA, workspace: this.workspace.metadata(),
      providers: Object.keys(this.adapters), selections: this._rows('selection'), windows: this._rows('window'), work: this._rows('work'),
      documents: this._rows('document'),
      receivings: this._rows('receiving').map(({ original, ...value }) => value),
      documentBodies: this.workspace.db.prepare('SELECT sha256,bytes FROM source_document_bodies ORDER BY sha256').all(),
      documentBytes: this.workspace.db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM source_document_bodies').get().bytes
    }));
  }
  receiving(id) { const value = this._get('receiving', id); need(value, 'SOURCE_RECEIVING_NOT_FOUND', 'Source-operations receiving does not exist', 404); return value; }
  window(id) { const value = this._get('window', id); need(value, 'SOURCE_WINDOW_NOT_FOUND', 'Source window does not exist', 404); return value; }
  document(id, { sha256: bodySha } = {}) {
    const value = this._get('document', id); need(value, 'SOURCE_DOCUMENT_NOT_FOUND', 'Original document reference does not exist', 404);
    const sha = bodySha || value.latest?.sha256;
    need(sha && value.versions.some(version => version.sha256 === sha), 'SOURCE_DOCUMENT_BODY_NOT_FOUND', 'Choose a retained original document edition', 404);
    const row = this.workspace.db.prepare('SELECT body,bytes FROM source_document_bodies WHERE sha256=?').get(sha);
    need(row, 'SOURCE_DOCUMENT_BODY_NOT_FOUND', 'The selected original document bytes are absent', 404);
    return { metadata: value, sha256: sha, bytes: row.bytes, body: Buffer.from(row.body) };
  }
  _references(run) { return this.workspace._snapshot(()=>this._referenceSelection(run,this.workspace.view())); }
  _referenceSelection(run, view) {
    const results = new Map();
    for (const selection of run.selections.filter(value => value.acquireDocuments)) {
      for (const project of view.projects.filter(value => selection.ocids.includes(value.ocid))) {
        for (const entry of project.entries.filter(value => value.kind !== 'versionedRelease' && (selection.documentEditionScope === 'all-retained' || value.id === project.currentEntryId))) {
          const full = this.workspace.getEntry(entry.id);
          for (const item of entry.summary?.documents || []) {
            const document = pointer(full.document, item.path);
            if (!document || typeof document !== 'object') continue;
            const association = { ocid: project.ocid, entryId: entry.id, sourceId: entry.sourceId,
              sourcePointer: item.path, documentId: document.id ?? null, releaseId: entry.releaseId,
              releaseDate: entry.date, selectionId: selection.id, origin: 'original-ocds-document',
              document: clone(document),
              logicalId: sha256(encoded({ ocid: project.ocid, block: documentBlockIdentity(full.document, item.path),
                documentId: document.id ?? null, fallback: Object.hasOwn(document, 'id') ? null : { url: document.url ?? null, path: item.path } })) };
            const id = sha256(encoded({ workspaceId: run.workspaceId, ocid: association.ocid,
              entryId: association.entryId, sourcePointer: association.sourcePointer, documentId: association.documentId }));
            if (!results.has(id)) results.set(id, { id, ...association });
          }
        }
      }
      for (const original of selection.attachments || []) {
        const project = view.projects.find(value => value.ocid === original.ocid);
        const entry = project?.entries.find(value => value.id === (original.entryId || project.currentEntryId));
        if (original.entryId && !entry) throw failure('SOURCE_ATTACHMENT_ENTRY', 'The explicitly bound original attachment edition is absent', 400, { entryId: original.entryId, ocid: original.ocid });
        const association = { ocid: original.ocid, entryId: entry?.id || null, sourceId: entry?.sourceId || null,
          sourcePointer: null, documentId: original.document.id ?? null, releaseId: entry?.releaseId ?? null,
          releaseDate: entry?.date ?? null, selectionId: selection.id, origin: 'official-attachment-reference',
          referenceUrl: original.referenceUrl, document: clone(original.document),
          logicalId: sha256(encoded({ ocid: original.ocid, origin: 'official-attachment-reference',
            referenceUrl: original.referenceUrl, documentId: original.document.id ?? null,
            fallback: Object.hasOwn(original.document, 'id') ? null : original.document.url ?? null })) };
        const id = sha256(encoded({ workspaceId: run.workspaceId, ocid: association.ocid, entryId: entry?.id || null,
          referenceUrl: original.referenceUrl, document: original.document }));
        if (!results.has(id)) results.set(id, { id, ...association });
      }
    }
    return [...results.values()];
  }
  async _acquireDocument(group, run, signal, renewLease = () => {}) {
    const requestedUrl = group.url;
    const previous = group.referenceIds.map(id => this._get('document', id)).find(value => value?.latest?.sha256);
    const saved = previous?.latest;
    let raw = requestedUrl;
    const redirects = [], headers = { Accept: '*/*', 'User-Agent': 'Starforge-OCDS-Workspace/1.0' };
    if (saved?.etag) headers['If-None-Match'] = saved.etag;
    else if (saved?.lastModified) headers['If-Modified-Since'] = saved.lastModified;
    for (let index = 0; index <= 5; index++) {
      renewLease();
      for (const hosts of group.hostRules || []) {
        const hostname = new URL(raw).hostname.toLowerCase();
        need(hosts.includes(hostname), 'DOCUMENT_HOST_CHANGED', 'The original document host is outside one selected publisher host list', 400, { hostname });
      }
      const url = await documentURL(raw, group.allowedHosts, this.resolveHost);
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
      const response = await this.fetchImpl(url.href, { method: 'GET', headers, redirect: 'manual', credentials: 'omit', signal: requestSignal });
      const retainedHeaders = responseHeaders(response);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        need(location && index < 5, 'DOCUMENT_REDIRECT_LIMIT', 'The original document redirect did not finish within five locations');
        const next = new URL(location, url);
        need(!(url.protocol === 'https:' && next.protocol === 'http:'), 'DOCUMENT_REDIRECT_DOWNGRADE', 'The publisher document redirected from HTTPS to HTTP');
        redirects.push({ url: url.href, status: response.status, location: next.href });
        raw = next.href; continue;
      }
      const observation = { id: sha256(run.id + '\n' + requestedUrl), windowId: run.id, requestedUrl,
        finalUrl: url.href, retrievedAt: now(), status: response.status, headers: retainedHeaders, redirects,
        contentType: retainedHeaders['content-type'] || null,
        originalFilename: originalFilename(retainedHeaders, url.href),
        etag: retainedHeaders.etag || null, lastModified: retainedHeaders['last-modified'] || null };
      if (response.status === 304) {
        await response.body?.cancel();
        need(saved?.sha256 && this.workspace.db.prepare('SELECT sha256 FROM source_document_bodies WHERE sha256=?').get(saved.sha256),
          'DOCUMENT_304_WITHOUT_BODY', 'The publisher returned 304 before original bytes were retained');
        return { ...observation, sha256: saved.sha256, bytes: saved.bytes,
          contentType: observation.contentType || saved.contentType, originalFilename: saved.originalFilename,
          etag: observation.etag || saved.etag, lastModified: observation.lastModified || saved.lastModified,
          reusedOriginal: true, body: null };
      }
      if (!response.ok) {
        await response.body?.cancel();
        const retryAt = cooldown(response);
        throw failure('DOCUMENT_HTTP_' + response.status, 'Original document returned HTTP ' + response.status,
          response.status === 429 ? 429 : 502, { observation, retryAt });
      }
      const body = await responseBytes(response, this.maxDocumentBytes);
      const actualType = (observation.contentType || '').split(';')[0].trim().toLowerCase();
      const declaredTypes = group.formats.map(value => value.toLowerCase());
      need(!(actualType === 'text/html' && !declaredTypes.includes('text/html')
        && declaredTypes.some(value => /pdf|msword|wordprocessingml|spreadsheetml|presentationml/.test(value))),
        'DOCUMENT_MEDIA_CHANGED', 'The publisher returned HTML for a document declared in another format', 502,
        { observation, responseBytes: body.length, responseSha256: sha256(body), declaredTypes });
      return { ...observation, sha256: sha256(body), bytes: body.length, reusedOriginal: false, body };
    }
    throw failure('DOCUMENT_REDIRECT_LIMIT', 'The original document redirect limit was reached');
  }
  _retainDocument(group, references, acquisition) {
    const { body, changed: priorChanges, ...observation } = acquisition;
    need(/^[0-9a-f]{64}$/.test(observation.sha256) && Number.isSafeInteger(observation.bytes)
      && observation.bytes >= 0 && observation.bytes <= this.maxDocumentBytes,
      'SOURCE_DOCUMENT_IDENTITY', 'Retain the exact original document byte identity');
    if (body) need(body.length === observation.bytes && sha256(body) === observation.sha256,
      'SOURCE_DOCUMENT_IDENTITY', 'Original document bytes do not match the acquisition identity');
    return this.workspace._change('source_document.observed', () => {
      const retained = this.workspace.db.prepare('SELECT bytes FROM source_document_bodies WHERE sha256=?').get(observation.sha256);
      if (!retained) {
        need(body, 'SOURCE_DOCUMENT_BODY_NOT_FOUND', 'Original document bytes must be retained before a reused observation');
        const total = this.workspace.db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM source_document_bodies').get().bytes;
        need(total + body.length <= this.maxRetainedDocumentBytes, 'DOCUMENT_WORKSPACE_CAPACITY',
          'Retained original document bytes exceed this workspace capacity', 413,
          { currentBytes: total, incomingBytes: body.length, maximumBytes: this.maxRetainedDocumentBytes });
        this.workspace.db.prepare('INSERT INTO source_document_bodies(sha256,bytes,body) VALUES(?,?,?)')
          .run(observation.sha256, body.length, body);
      } else need(retained.bytes === observation.bytes, 'DOCUMENT_BODY_IDENTITY', 'The retained document hash has a different byte count');
      const changed = [], existingDocuments = this._rows('document');
      for (const id of group.referenceIds) {
        const reference = references.find(value => value.id === id);
        need(reference, 'SOURCE_DOCUMENT_REFERENCE', 'Every original byte association needs its retained source reference');
        const previous = this._get('document', id);
        const earlier = previous?.latest || existingDocuments.filter(value => value.logicalId === reference.logicalId && value.latest)
          .map(value => value.latest).sort((a,b) => Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt))[0] || null;
        const versions = clone(previous?.versions || []), observations = clone(previous?.observations || (previous?.latest ? [previous.latest] : []));
        const same = observations.find(value => value.id === observation.id);
        if (same) need(same.sha256 === observation.sha256 && same.bytes === observation.bytes,
          'DOCUMENT_OBSERVATION_CHANGED', 'The same acquisition operation has different original bytes', 409);
        const affectsCurrent = !earlier || Date.parse(observation.retrievedAt) >= Date.parse(earlier.retrievedAt);
        const associated = same || { ...observation, previousSha256: earlier?.sha256 || null, affectsCurrent };
        if (!same) observations.push(associated);
        if (!versions.some(value => value.sha256 === observation.sha256)) versions.push({ ...associated });
        const latest = !previous?.latest || Date.parse(observation.retrievedAt) >= Date.parse(previous.latest.retrievedAt)
          ? associated : previous.latest;
        const value = { ...(previous || reference), versions, observations, latest, updatedAt: now(), available: true,
          acquisition: {status:'complete',windowId:observation.windowId,observationId:observation.id} };
        this._put('document', value);
        if (associated.affectsCurrent && associated.previousSha256 !== observation.sha256)
          changed.push({ documentId: id, logicalId: reference.logicalId, ocid: reference.ocid, entryId: reference.entryId,
            title: reference.document.title || String(reference.document.id ?? ''), kind: associated.previousSha256 ? 'changed' : 'added',
            beforeSha256: associated.previousSha256, afterSha256: observation.sha256 });
      }
      return { value: { ...observation, changed }, audit: { sourceWindowId: observation.windowId,
        documentReferenceIds: group.referenceIds, documentSha256: observation.sha256, bytes: observation.bytes } };
    });
  }
  importOriginalDocument({ selectionId, referenceId, ocid, documentId, body, observation } = {}) {
    const selection = this._get('selection',selectionId);
    need(selection, 'SOURCE_SELECTION_NOT_FOUND', 'Save the selected publisher and its original document reference first', 404);
    need(observation && typeof observation.operationId === 'string' && observation.operationId.length > 0
      && typeof observation.retrievedAt === 'string' && Number.isFinite(Date.parse(observation.retrievedAt))
      && httpReference(observation.requestedUrl) && httpReference(observation.finalUrl)
      && Number.isInteger(observation.status) && observation.status >= 200 && observation.status < 300,
      'DOCUMENT_ACQUISITION_REQUIRED', 'Keep the original successful acquisition operation, URL, HTTP status and retrieval time');
    const bytes = Buffer.from(body || []);
    need(bytes.length <= this.maxDocumentBytes && observation.bytes === bytes.length && observation.sha256 === sha256(bytes),
      'SOURCE_DOCUMENT_IDENTITY', 'The imported original document must match its recorded SHA-256 and byte count');
    const workspace = this.workspace.metadata(), id = sha256(encoded({ workspaceId:workspace.id, operationId:observation.operationId }));
    const existing = this._get('window',id);
    const references = this._references({ id, workspaceId:workspace.id, selections:[selection] }).filter(value =>
      (!referenceId || value.id === referenceId) && (!ocid || value.ocid === ocid)
      && (documentId === undefined || encoded(value.documentId) === encoded(documentId))
      && value.document.url === observation.requestedUrl);
    need(references.length > 0 && new Set(references.map(value=>value.ocid)).size === 1,
      'SOURCE_DOCUMENT_REFERENCE', 'Choose one selected OCID and its exact original attachment reference');
    if (existing) {
      need(existing.documents[0]?.result?.sha256 === observation.sha256, 'DOCUMENT_OBSERVATION_CHANGED',
        'The same imported acquisition operation already has different original bytes',409);
      const missing=references.filter(reference=>!this._get('document',reference.id)?.observations?.some(value=>value.operationId===observation.operationId));
      if(missing.length)this._retainDocument({referenceIds:missing.map(value=>value.id)},missing,{
        ...clone(observation),id:sha256(observation.operationId),windowId:id,importedAt:now(),
        acquisitionOrigin:'imported-original',body:bytes});
      return {...this.state(),window:existing,repeated:true,bindingsAdded:missing.length};
    }
    const selectedOcids = [...new Set(references.map(value=>value.ocid))], view = this.workspace.view();
    let run = { schema:'stellar-forge.ocds.source-window.v1',id,revision:1,workspaceId:workspace.id,
      name:'Imported original document',createdAt:now(),updatedAt:now(),status:'original-document-import',
      selections:[clone(selection)],selectedOcids,
      baseline:selectedOcids.map(value=>({ocid:value,entryId:view.projects.find(project=>project.ocid===value)?.currentEntryId || null})),
      sources:[],references,documents:[],workIds:[],issues:[] };
    const acquired = { ...clone(observation), id:sha256(observation.operationId),windowId:id,
      importedAt:now(),acquisitionOrigin:'imported-original',body:bytes };
    const result = this._retainDocument({referenceIds:references.map(value=>value.id)},references,acquired);
    run.documents = [{id:sha256(observation.requestedUrl),url:observation.requestedUrl,
      referenceIds:references.map(value=>value.id),status:'complete',attempts:[],result}];
    run.workIds = this._materialWork(run).map(value=>value.id);
    this.workspace._change('source_document.imported',()=>{
      this._put('window',run);
      return {audit:{sourceWindowId:id,operationId:observation.operationId,documentSha256:observation.sha256}};
    });
    return { ...this.state(), window:run };
  }
  adoptSourceObservation({ selectionId, selectionIds, windowId, name, baseline, context, expectedWindowRevision, rawBytes, rawText, observation } = {}) {
    need(observation && typeof observation.operationId === 'string' && observation.operationId.length > 0
      && observation.operationId.length <= 4096 && typeof observation.transport === 'string' && observation.transport.trim()
      && ((typeof observation.retrievedAt === 'string' && Number.isFinite(Date.parse(observation.retrievedAt)))
        || ((observation.retrievedAt === undefined || observation.retrievedAt === null) && typeof observation.completedBy === 'string' && Number.isFinite(Date.parse(observation.completedBy))))
      && httpReference(observation.requestedUrl) && (observation.finalUrl === undefined || observation.finalUrl === null || httpReference(observation.finalUrl)),
      'SOURCE_OBSERVATION_REQUIRED', 'Keep the original source acquisition operation, transport, requested URL and its exact time or observed completion bound');
    if (observation.status !== undefined && observation.status !== null) need(Number.isInteger(observation.status)
      && observation.status >= 200 && observation.status < 300, 'SOURCE_OBSERVATION_STATUS',
      'A supplied HTTP status must be the original successful source response status');
    need(rawBytes !== undefined || typeof rawText === 'string', 'SOURCE_ORIGINAL_REQUIRED', 'Receive the complete original publisher response bytes or UTF-8 text');
    const bytes = rawBytes !== undefined ? Buffer.from(rawBytes) : Buffer.from(rawText,'utf8');
    need(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024 && observation.bytes === bytes.length && observation.sha256 === sha256(bytes),
      'SOURCE_ORIGINAL_IDENTITY', 'The original publisher body must match its acquisition SHA-256 and byte count');
    let originalText, document;
    try { originalText = new TextDecoder('utf-8',{fatal:true}).decode(bytes); document = JSON.parse(originalText.replace(/^\uFEFF/,'')); }
    catch { throw failure('SOURCE_ORIGINAL_JSON','The original acquisition must contain one complete UTF-8 OCDS JSON response'); }
    if (rawText !== undefined) need(Buffer.from(rawText,'utf8').equals(bytes), 'SOURCE_ORIGINAL_IDENTITY', 'The supplied original text and bytes differ');
    const observationId = sha256(encoded({workspaceId:this.workspace.metadata().id,selectionId,operationId:observation.operationId,transport:observation.transport}));
    if (!windowId) {
      const pending = this._rows('window').find(saved=>saved.sources.some(source=>source.pendingObservation?.id===observationId));
      if (pending) return this.adoptSourceObservation({selectionId,selectionIds,windowId:pending.id,name,baseline,context,
        expectedWindowRevision:pending.revision,rawBytes:bytes,observation});
    }
    const before = windowId ? this.window(windowId) : null;
    const selection = before ? before.selections.find(value=>value.id===selectionId) : this._get('selection',selectionId);
    need(selection && selection.enabled, 'SOURCE_SELECTION_NOT_ENABLED', 'Choose one enabled saved publisher selection');
    need(selection.provider === 'find-tender' && selection.request.kind === 'record'
      && selection.ocids.length === 1 && selection.ocids[0] === selection.request.ocid,
      'SOURCE_OBSERVATION_SCOPE', 'Original-source adoption completes one explicitly selected Find a Tender record family');
    const requested = buildFindTenderURL(selection.request);
    need(new URL(observation.requestedUrl).href === requested && document && typeof document === 'object'
      && Array.isArray(document.records) && document.records.length === 1 && document.records[0]?.ocid === selection.request.ocid,
      'SOURCE_OBSERVATION_SCOPE', 'The acquisition URL and original record family must match the saved source selection');
    const next = Array.isArray(document.links) ? document.links.find(value=>value?.rel==='next') : document.links?.next;
    need(!next, 'SOURCE_OBSERVATION_INCOMPLETE', 'Receive a complete original record-family response without an outstanding next page');
    const normalized = normalizeOcds(document,{sourceId:observation.sha256,label:selection.label,url:requested,retrievedAt:observation.retrievedAt});
    need(normalized.entries.length > 0 && normalized.entries.every(entry=>entry.ocid===selection.request.ocid),
      'SOURCE_OBSERVATION_SCOPE', 'Every original edition must belong to the one selected record family');
    const id = observationId;
    for (const saved of this._rows('window')) {
      const retained = saved.sources.flatMap(source=>source.observations || []).find(value=>value.id===id);
      if (!retained) continue;
      need(retained.sha256===observation.sha256 && retained.requestedUrl===observation.requestedUrl,
        'SOURCE_OBSERVATION_CHANGED','This acquisition operation already identifies different original publisher content',409);
      need(!windowId || saved.id===windowId, 'SOURCE_OBSERVATION_WINDOW', 'This original acquisition is already retained in another window',409,{windowId:saved.id});
      return {...this.state(),window:saved,observation:retained,repeated:true};
    }
    if (before) {
      need(Number.isSafeInteger(expectedWindowRevision) && expectedWindowRevision===before.revision,
        'SOURCE_WINDOW_CHANGED','Read the saved window revision before adopting its source acquisition',409,{revision:before.revision});
      need(before.status!=='complete' && !before.receivedFromPackageId
        && before.sources.find(value=>value.selectionId===selectionId)?.status!=='complete',
        'SOURCE_OBSERVATION_WINDOW','Create a fresh window for a new acquisition after this selection has completed',409);
    }
    const owner=randomUUID();
    let run=this._start(windowId?{windowId,expectedWindowRevision}:{name:name || 'Received publisher acquisition',selectionIds:selectionIds || [selectionId],baseline,context},owner);
    try {
      this._lease(owner,run.id);
      const index=run.sources.findIndex(value=>value.selectionId===selectionId);
      need(index>=0,'SOURCE_SELECTION_SCOPE','This saved window does not contain the selected publisher request');
      const original = {...clone(observation),id,sourceId:observation.sha256,windowId:run.id,selectionId,
        retrievedAt:observation.retrievedAt || null,timePrecision:observation.retrievedAt?'exact':'completed-by',
        importedAt:now(),acquisitionOrigin:'external-original',request:clone(selection.request)};
      run.sources[index]={...run.sources[index],status:'receiving-original',pendingObservation:original};
      run=this._checkpoint(run,owner);
      const imported=this.workspace.importDocument(document,{rawBytes:bytes,label:selection.label,url:requested,retrievedAt:original.retrievedAt,acquisition:original});
      need(imported.ingestion.sourceId===observation.sha256,'SOURCE_ORIGINAL_IDENTITY','The native retained publisher source differs from the original acquisition');
      this._lease(owner,run.id);
      const previous=run.sources[index], {pendingObservation,...retained}=previous;
      run.sources[index]={...retained,status:'complete',completionMethod:'external-original',completedAt:now(),
        sourceIds:[...new Set([...(previous.sourceIds||[]),imported.ingestion.sourceId])],
        observations:[...(previous.observations||[]),original],
        priorIssues:[...(previous.priorIssues||[]),...(previous.error?[{error:previous.error,retryAt:previous.retryAt,captureId:previous.captureId}]:[])],
        error:null,retryAt:null};
      run.current=this.workspace._snapshot(()=>{const view=this.workspace.view();return run.selectedOcids.map(ocid=>({ocid,entryId:view.projects.find(value=>value.ocid===ocid)?.currentEntryId||null}));});
      run.status='partial';
      run=this._checkpoint(run,owner);
      return {...this.state(),window:run,observation:original,repeated:false};
    } catch(error) {
      try {run.status='interrupted';run.issues.push(problem(error));run=this._checkpoint(run,owner);} catch {}
      error.details={...error.details,windowId:run.id};throw error;
    } finally {
      this.workspace.db.prepare('UPDATE source_operation_lease SET owner=NULL,window_id=NULL,expires=0 WHERE id=1 AND owner=?').run(owner);
    }
  }
  _start(input, owner) {
    return this.workspace._change('source_window.started', () => {
      const lease = this.workspace.db.prepare('SELECT owner,window_id,expires FROM source_operation_lease WHERE id=1').get();
      need(!lease.owner || lease.expires <= Date.now(), 'SOURCE_WINDOW_RUNNING',
        'A source window is already running in this workspace', 409, { windowId: lease.window_id });
      let run = input.windowId ? this._get('window', input.windowId) : null;
      if (input.windowId) {
        need(run, 'SOURCE_WINDOW_NOT_FOUND', 'Resume requires an existing source-window ID', 404);
        need(input.expectedWindowRevision === undefined || input.expectedWindowRevision === run.revision,
          'SOURCE_WINDOW_CHANGED','The saved source window revision changed before continuation',409,{revision:run.revision});
        need(['running','partial','interrupted','complete'].includes(run.status) && !run.receivedFromPackageId,
          'SOURCE_WINDOW_ORIGINAL', 'Create a fresh window from received selections; received and imported observations retain their original identities', 409);
      }
      if (!run) {
        const selectionIds = input.selectionIds || this._rows('selection').filter(value => value.enabled).map(value => value.id);
        need(Array.isArray(selectionIds) && selectionIds.length > 0 && new Set(selectionIds).size === selectionIds.length,
          'SOURCE_SELECTION_REQUIRED', 'Select at least one saved publisher selection');
        const selections = selectionIds.map(id => {
          const value = this._get('selection', id);
          need(value?.enabled, 'SOURCE_SELECTION_NOT_ENABLED', 'A selected publisher selection is absent or disabled', 400, { selectionId: id });
          need(typeof this.adapters[value.provider]?.capture === 'function', 'SOURCE_PROVIDER_UNAVAILABLE', 'The selected publisher adapter is not installed', 400, { provider: value.provider });
          return clone(value);
        });
        const selectedOcids = [...new Set(selections.flatMap(selection => selection.ocids))];
        const view = this.workspace.view();
        need(input.baseline === undefined || (Array.isArray(input.baseline) && input.baseline.every(value=>value && typeof value.ocid==='string' && (value.entryId===null || typeof value.entryId==='string'))
          && new Set(input.baseline.map(value=>value.ocid)).size===input.baseline.length), 'SOURCE_BASELINE_INVALID', 'Use unique original OCIDs and their exact retained prior entry IDs');
        const baseline = selectedOcids.map(ocid => {
          const supplied = input.baseline?.find(value => value.ocid === ocid);
          const project = view.projects.find(value => value.ocid === ocid);
          if (supplied?.entryId) need(project?.entries.some(entry => entry.id === supplied.entryId),
            'SOURCE_BASELINE_ENTRY', 'The prior client edition is not retained in this workspace', 400, { ocid, entryId: supplied.entryId });
          return { ocid, entryId: supplied ? supplied.entryId || null : project?.currentEntryId || null,
            reviewRevision: project?.review.revision ?? null };
        });
        run = { schema: 'stellar-forge.ocds.source-window.v1', id: randomUUID(), revision: 1,
          workspaceId: view.workspace.id, name: text(input.name || 'Publication window', 'window name', 1024),
          createdAt: now(), updatedAt: now(), status: 'running', selections, selectedOcids, baseline,
          context: input.context ? clone(input.context) : null,
          sources: selections.map(selection => ({ selectionId: selection.id, provider: selection.provider,
            status: 'pending', captureId: null, sourceIds: [], observations: [] })),
          references: [], documents: [], workIds: [], issues: [] };
      } else {
        need(run.workspaceId === this.workspace.metadata().id, 'SOURCE_WINDOW_WORKSPACE', 'The source window belongs to another workspace');
        run = { ...run, status: 'running', updatedAt: now(), revision: run.revision + 1 };
      }
      this.workspace.db.prepare('UPDATE source_operation_lease SET owner=?,window_id=?,expires=? WHERE id=1')
        .run(owner, run.id, Date.now() + 120000);
      this._put('window', run);
      return { value: run, audit: { sourceWindowId: run.id, selectionIds: run.selections.map(selection => selection.id), ocids: run.selectedOcids } };
    });
  }
  _planMaterialWork(run, view) {
    const results = [];
    for (const ocid of run.selectedOcids) {
      const project = view.projects.find(value => value.ocid === ocid);
      const current = project?.entries.find(entry => entry.id === project.currentEntryId) || null;
      const baseline = run.baseline.find(value => value.ocid === ocid);
      const selection = run.selections.find(value => value.ocids.includes(ocid));
      const documentChanges = run.documents.flatMap(document => document.result?.changed || []).filter(value => value.ocid === ocid);
      const priorWindow = this._rows('window').filter(value => value.id !== run.id && value.createdAt < run.createdAt
        && value.selectedOcids.includes(ocid) && !value.receivedFromPackageId && value.status !== 'original-document-import').sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
      const oldReferences = new Map((priorWindow?.references || []).filter(value => value.ocid === ocid).map(value => [value.logicalId || value.id,value]));
      const newReferences = new Map(run.references.filter(value => value.ocid === ocid).map(value => [value.logicalId || value.id,value]));
      const documentReferenceChanges = [];
      for (const key of new Set([...oldReferences.keys(),...newReferences.keys()])) {
        const before = oldReferences.get(key), after = newReferences.get(key);
        if (before && after && encoded(before.document) === encoded(after.document)) continue;
        documentReferenceChanges.push({ type: !before ? 'added' : !after ? 'removed' : 'changed',
          logicalId: key, before: before || null, after: after || null });
      }
      const documentIssues = run.documents.filter(value=>value.status!=='complete'
        && value.referenceIds.some(id=>run.references.some(reference=>reference.id===id && reference.ocid===ocid)))
        .map(value=>({documentId:value.id,url:value.url,status:value.status,error:value.error,retryAt:value.retryAt}));
      const sourceIssues = run.sources.filter(value => selection.id === value.selectionId && value.status !== 'complete')
        .map(value => ({ selectionId: value.selectionId, captureId: value.captureId, status: value.status, error: value.error, retryAt: value.retryAt }));
      if (!current && !sourceIssues.length) sourceIssues.push({selectionId:selection.id,status:'selection-unresolved',
        error:{code:'SELECTED_OCID_NOT_RETAINED',message:'The selected original OCID has no retained native edition after this acquisition.'}});
      let comparison = null, materialPaths = [], administrativePaths = [], kind = 'publication-change';
      if (!current) {
        if (documentChanges.length || documentReferenceChanges.length) kind = 'initial-documents';
        else if (sourceIssues.length) kind = 'source-acquisition';
        else continue;
      } else if (!baseline?.entryId) kind = 'initial-selection';
      else if (baseline.entryId !== current.id) {
        const before = project.entries.find(entry => entry.id === baseline.entryId);
        need(before, 'SOURCE_BASELINE_ENTRY', 'The exact source-window baseline edition is absent', 409);
        if (before.kind !== current.kind) {
          kind = 'representation-change'; materialPaths = [''];
        } else {
          comparison = this.workspace.compare(before.id, current.id);
          const ignored = new Set(selection.reviewPolicy?.administrativePointers || ['/id', '/date']);
          materialPaths = comparison.changes.filter(change => !ignored.has(change.path)).map(change => change.path);
          administrativePaths = comparison.changes.filter(change => ignored.has(change.path)).map(change => change.path);
        }
      } else if (project.review.disposition === 'unreviewed' && run.name.toLowerCase().includes('baseline')) kind = 'initial-selection';
      if (kind === 'publication-change' && !materialPaths.length && !documentChanges.length && !documentReferenceChanges.length) {
        if(sourceIssues.length || documentIssues.length)kind='source-acquisition';else continue;
      }
      const id = sha256(encoded({ workspaceId: run.workspaceId, ocid, kind, before: baseline?.entryId || null,
        after: current?.id || null, documents: documentChanges.map(value => ({ documentId: value.documentId,
          beforeSha256: value.beforeSha256, afterSha256: value.afterSha256 })),
        references: documentReferenceChanges.map(value => ({ logicalId: value.logicalId, type: value.type,
          before: value.before?.document || null, after: value.after?.document || null })),
        sourceIssues: kind === 'source-acquisition' ? sourceIssues.map(value => ({ selectionId: value.selectionId, code: value.error?.code })) : [],
        documentIssues: documentIssues.map(value=>({documentId:value.documentId,code:value.error?.code})) }));
      const previous = this._get('work', id);
      if (previous) { results.push({value:previous,existing:true}); continue; }
      const owner = project?.review.owner || selection.owner || this.workspace.operator;
      const nextAction = kind === 'initial-selection' ? 'Review this selected contracting process and record the client next action.'
        : kind === 'source-acquisition' ? 'Continue the saved publisher and document acquisitions from their retained progress, then review the original editions.'
        : kind === 'initial-documents' ? 'Review the acquired original documents against their official notice reference and record the client next action.'
        : 'Review ' + materialPaths.length + ' material field change' + (materialPaths.length === 1 ? '' : 's')
          + ', ' + documentChanges.length + ' acquired or changed original document' + (documentChanges.length === 1 ? '' : 's')
          + ', and ' + documentReferenceChanges.length + ' document reference change' + (documentReferenceChanges.length === 1 ? '' : 's') + '.';
      const value = { schema: 'stellar-forge.ocds.source-review.v1', id, revision: 1, ocid, windowId: run.id,
        kind, status: 'pending', owner, nextAction, resolution: '', createdAt: now(), updatedAt: now(),
        beforeEntryId: baseline?.entryId || null, afterEntryId: current?.id || null,
        materialPaths: [...new Set(materialPaths)], administrativePaths: [...new Set(administrativePaths)],
        comparisonCounts: comparison?.counts || null, documentChanges, documentReferenceChanges, sourceIssues, documentIssues,
        selectionId: selection.id, projectReviewRevision: project?.review.revision ?? null };
      results.push({value,project:project?{ocid:project.ocid,review:clone(project.review)}:null});
    }
    return results;
  }
  _materialWork(run) {
    const planned=this.workspace._snapshot(()=>{
      const view=this.workspace.view();
      return {current:run.selectedOcids.map(ocid=>({ocid,entryId:view.projects.find(project=>project.ocid===ocid)?.currentEntryId||null})),
        work:this._planMaterialWork(run,view)};
    });
    run.current=planned.current;
    const results=[];
    for (const item of planned.work) {
      const {value,project}=item, ocid=value.ocid, id=value.id;
      const saved=this._get('work',id);
      if(saved){results.push(saved);continue;}
      const retained=this.workspace._change('source_review.assigned',()=>{
        const existing=this._get('work',id);
        if(existing)return {value:existing};
        this._put('work',value);
        return {value,audit:{sourceWindowId:run.id,sourceReviewId:id,ocid,owner:value.owner,
          beforeEntryId:value.beforeEntryId,afterEntryId:value.afterEntryId}};
      });
      if(project){
        const patch={expectedRevision:project.review.revision};
        if(!project.review.owner)patch.owner=value.owner;
        if(!project.review.nextAction)patch.nextAction=value.nextAction;
        if(project.review.disposition==='unreviewed')patch.disposition='reviewing';
        if(Object.keys(patch).length>1){
          try{this.workspace.updateReview(ocid,patch);}
          catch(error){run.issues.push({kind:'review-assignment',ocid,workId:id,...problem(error)});}
        }
      }
      results.push(retained);
    }
    return results;
  }
  async run(input = {}, { signal, onProgress } = {}) {
    if (input.windowId) {
      const existing = this.window(input.windowId);
      if (existing.status === 'complete') return { ...this.state(), window: existing };
    }
    const owner = randomUUID();
    let run = this._start(input, owner);
    const announce = async stage => { if (onProgress) await onProgress({ windowId: run.id, revision: run.revision, stage, status: run.status }); };
    try {
      await announce('started');
      for (let index = 0; index < run.sources.length; index++) {
        if (signal?.aborted) break;
        const current = run.sources[index];
        if (current.status === 'complete') continue;
        if (current.retryAt && Date.parse(current.retryAt) > Date.now()) continue;
        const selection = run.selections.find(value => value.id === current.selectionId);
        this._lease(owner, run.id);
        run.sources[index] = { ...current, status: 'running', error: null };
        run = this._checkpoint(run, owner);
        try {
          const result = await this.adapters[selection.provider].capture(this.workspace, selection, {
            windowId: run.id, selectionId: selection.id, previous: current,
            fetchImpl: this.fetchImpl, signal,
            onProgress: async progress => {
              run.sources[index] = { ...run.sources[index], ...clone(progress) };
              run = this._checkpoint(run, owner); await announce('source-page');
            }
          });
          need(result && result.status === 'complete' && Array.isArray(result.sourceIds),
            'SOURCE_ADAPTER_RESULT', 'The publisher adapter must return complete capture status and retained native source IDs');
          for (const id of result.sourceIds) this.workspace.getSource(id, { includeBody: false });
          run.sources[index] = { ...run.sources[index], ...clone(result), status: 'complete', completedAt: now(), error: null, retryAt: null };
        } catch (error) {
          const captureId = error.details?.captureId || run.sources[index].captureId
            || this.workspace.view().captures.find(capture => capture.selection?.sourceWindowId === run.id
              && capture.selection?.sourceSelectionId === selection.id)?.id || null;
          const capture = captureId ? this.workspace.getCapture(captureId) : null;
          run.sources[index] = { ...run.sources[index], captureId, status: 'interrupted',
            retryAt: error.details?.retryAt || capture?.retryAt || null, error: problem(error),
            sourceIds: capture?.pages ? [...new Set(capture.pages.map(page => page.sourceId))] : run.sources[index].sourceIds,
            observations: capture?.pages || run.sources[index].observations };
        }
        run = this._checkpoint(run, owner); await announce('source');
      }
      this._lease(owner, run.id);
      run.references = this._references(run);
      this.workspace._change('source_documents.selected', () => {
        let added = 0;
        for (const reference of run.references) if (!this._get('document',reference.id)) {
          this._put('document',{...reference,versions:[],observations:[],latest:null,available:false,
            acquisition:{status:'pending'},updatedAt:now()}); added++;
        }
        return {audit:{sourceWindowId:run.id,documentReferences:run.references.length,added}};
      });
      const groups = new Map();
      for (const reference of run.references) {
        const original = reference.document;
        const url = typeof original.url === 'string' ? original.url.trim() : '';
        if (!url || original.format === 'offline/print') {
          this.workspace._change('source_document.reference', () => {
            const previous = this._get('document', reference.id);
            this._put('document', { ...(previous || reference), versions: previous?.versions || [], observations: previous?.observations || [],
              latest: previous?.latest || null, available: previous?.available || false,
              acquisition: { status: 'offline', description: original.description || original.title || '',
                message: url ? 'The publisher marks this original document offline/print.' : 'The original document has no download URL.' }, updatedAt: now() });
            return { audit: { sourceWindowId: run.id, documentReferenceId: reference.id, ocid: reference.ocid } };
          });
          continue;
        }
        let group = groups.get(url);
        if (!group) { group = { id: sha256(url), url, referenceIds: [], allowedHosts: [], hostRules: [], formats: [], sourceObservedAt: run.createdAt }; groups.set(url, group); }
        group.referenceIds.push(reference.id);
        if (typeof original.format === 'string') group.formats.push(original.format);
        const selection = run.selections.find(value => value.id === reference.selectionId);
        if (selection.documentHosts?.length) group.hostRules.push(selection.documentHosts.map(host=>host.toLowerCase()));
        const observations = run.sources.flatMap(source => source.observations || [])
          .filter(observation => observation.sourceId === reference.sourceId);
        for (const observation of observations) if (observation.retrievedAt > group.sourceObservedAt) group.sourceObservedAt = observation.retrievedAt;
      }
      for (const group of groups.values()) {
        if (signal?.aborted) break;
        let index = run.documents.findIndex(document => document.id === group.id);
        if (index < 0) { index = run.documents.length; run.documents.push({ ...group, status: 'pending', attempts: [] }); }
        else run.documents[index] = { ...run.documents[index], ...group };
        const existing = run.documents[index];
        if (existing.status === 'complete' && existing.result?.retrievedAt >= group.sourceObservedAt) {
          const absent = group.referenceIds.filter(id => !this._get('document', id)?.versions.some(value => value.sha256 === existing.result.sha256));
          if (absent.length) this._retainDocument({ ...group, referenceIds: absent }, run.references, { ...existing.result, body: null });
          continue;
        }
        if (existing.retryAt && Date.parse(existing.retryAt) > Date.now()) continue;
        const recovered = group.referenceIds.map(id => this._get('document', id)?.latest)
          .find(value => value?.windowId === run.id && value.requestedUrl === group.url && value.retrievedAt >= group.sourceObservedAt);
        if (recovered) {
          const result = this._retainDocument(group, run.references, { ...recovered, body: null });
          run.documents[index] = { ...existing, status: 'complete', result, error: null, retryAt: null };
          run = this._checkpoint(run, owner); continue;
        }
        this._lease(owner, run.id);
        const attempt = { id: run.id + ':document:' + group.id + ':' + (existing.attempts.length + 1), startedAt: now() };
        run.documents[index] = { ...existing, status: 'running', attempts: [...existing.attempts, attempt] };
        run = this._checkpoint(run, owner);
        try {
          const acquisition = await this._acquireDocument(group, run, signal, () => this._lease(owner, run.id));
          this._lease(owner, run.id);
          acquisition.operationId = attempt.id;
          acquisition.id = sha256(attempt.id);
          const result = this._retainDocument(group, run.references, acquisition);
          run.documents[index] = { ...run.documents[index], status: 'complete', result,
            completedAt: now(), error: null, retryAt: null };
        } catch (error) {
          run.documents[index] = { ...run.documents[index], status: 'interrupted', error: problem(error),
            retryAt: error.details?.retryAt || null };
          this.workspace._change('source_document.interrupted', () => {
            for (const id of group.referenceIds) {
              const previous = this._get('document',id);
              if (previous) this._put('document',{...previous,acquisition:{status:'interrupted',windowId:run.id,
                error:problem(error),retryAt:error.details?.retryAt || null},updatedAt:now()});
            }
            return {audit:{sourceWindowId:run.id,documentReferenceIds:group.referenceIds,errorCode:error.code || error.name}};
          });
        }
        run = this._checkpoint(run, owner); await announce('document');
      }
      this._lease(owner, run.id);
      run.workIds = [...new Set([...run.workIds, ...this._materialWork(run).map(work => work.id)])];
      run.unresolvedOcids = run.current.filter(value=>!value.entryId).map(value=>value.ocid);
      const sourceIncomplete = run.sources.some(source => source.status !== 'complete') || run.unresolvedOcids.length > 0;
      const documentIncomplete = run.documents.some(document => document.status !== 'complete');
      const offline = run.references.filter(reference => !reference.document.url || reference.document.format === 'offline/print').length;
      run.status = signal?.aborted ? 'interrupted' : sourceIncomplete || documentIncomplete ? 'partial' : 'complete';
      run.completedAt = now(); run.offlineDocumentReferences = offline;
      run = this._checkpoint(run, owner); await announce('review');
      return { ...this.state(), window: run };
    } catch (error) {
      try { run.status = 'interrupted'; run.issues.push(problem(error)); run = this._checkpoint(run, owner); } catch {}
      error.details = { ...error.details, windowId: run.id };
      throw error;
    } finally {
      this.workspace.db.prepare('UPDATE source_operation_lease SET owner=NULL,window_id=NULL,expires=0 WHERE id=1 AND owner=?').run(owner);
    }
  }
  review(id) {
    return this.workspace._snapshot(()=>{
      const review=this._get('work',id);need(review,'SOURCE_REVIEW_NOT_FOUND','Assigned source review does not exist',404);
      const comparison=review.beforeEntryId&&review.afterEntryId&&review.kind!=='representation-change'
        ?this.workspace.compare(review.beforeEntryId,review.afterEntryId):null;
      const selected=new Set((review.documentChanges||[]).map(value=>value.documentId));
      for(const item of review.documentReferenceChanges||[])for(const value of [item.before,item.after])if(value?.id)selected.add(value.id);
      return {review,comparison,documents:this._rows('document').filter(value=>selected.has(value.id))};
    });
  }
  reviewWork(id, patch) {
    need(patch && ['pending', 'reviewing', 'resolved'].includes(patch.status), 'SOURCE_REVIEW_STATUS', 'Choose pending, reviewing or resolved');
    return this.workspace._change('source_review.saved', () => {
      const previous = this._get('work', id);
      need(previous, 'SOURCE_REVIEW_NOT_FOUND', 'Assigned source review does not exist', 404);
      need(Number.isSafeInteger(patch.expectedRevision) && patch.expectedRevision === previous.revision,
        'SOURCE_REVIEW_CHANGED', 'Read the assigned source review and use its current revision', 409, { revision: previous.revision });
      const value = { ...previous, status: patch.status, revision: previous.revision + 1, updatedAt: now(), operator: this.workspace.operator };
      if (patch.owner !== undefined) value.owner = text(patch.owner, 'review owner', 256);
      if (patch.nextAction !== undefined) value.nextAction = text(patch.nextAction, 'next action');
      if (patch.resolution !== undefined) value.resolution = text(patch.resolution, 'resolution', 65536);
      need(value.owner.trim(), 'SOURCE_REVIEW_OWNER', 'An assigned source review needs an owner');
      if (value.status === 'resolved') need(value.resolution.trim(), 'SOURCE_REVIEW_RESOLUTION', 'Record the decision made from these exact original changes');
      this._put('work', value);
      return { value, audit: { sourceReviewId: id, ocid: value.ocid, status: value.status, owner: value.owner, sourceReviewRevision: value.revision } };
    });
  }

  exportState({ ocids } = {}) {
    need(Array.isArray(ocids) && ocids.length > 0 && ocids.every(value => typeof value === 'string'),
      'SOURCE_EXPORT_SELECTION', 'Select explicit original OCIDs for the source-operations handover');
    return this.workspace._snapshot(() => {
      const selected = new Set(ocids);
      const documents = this._rows('document').filter(value => selected.has(value.ocid));
      const documentIds = new Set(documents.map(value => value.id));
      const work = this._rows('work').filter(value => selected.has(value.ocid));
      const workIds = new Set(work.map(value => value.id));
      const selections = this._rows('selection').filter(value => value.ocids.some(ocid => selected.has(ocid)))
        .map(value => ({ ...value, ocids: value.ocids.filter(ocid => selected.has(ocid)),
          attachments: (value.attachments || []).filter(attachment => selected.has(attachment.ocid)) }));
      const selectionIds = new Set(selections.map(value => value.id));
      const windows = this._rows('window').filter(value => value.selectedOcids.some(ocid => selected.has(ocid))).map(value => ({
        ...value, selectedOcids: value.selectedOcids.filter(ocid => selected.has(ocid)),
        selections: value.selections.filter(selection => selectionIds.has(selection.id)).map(selection => ({
          ...selection, ocids: selection.ocids.filter(ocid => selected.has(ocid)),
          attachments: (selection.attachments || []).filter(attachment => selected.has(attachment.ocid))
        })),
        baseline: value.baseline.filter(item => selected.has(item.ocid)), current: (value.current || []).filter(item => selected.has(item.ocid)),
        sources: value.sources.filter(item => selectionIds.has(item.selectionId)),
        references: value.references.filter(item => selected.has(item.ocid)),
        documents: value.documents.filter(item => item.referenceIds.some(id => documentIds.has(id))).map(item => ({
          ...item, referenceIds: item.referenceIds.filter(id => documentIds.has(id)),
          ...(item.result ? { result: { ...item.result, changed: (item.result.changed || []).filter(change => selected.has(change.ocid)) } } : {})
        })),
        workIds: value.workIds.filter(id => workIds.has(id)),
        issues: value.issues.filter(item => !item.ocid || selected.has(item.ocid))
      }));
      const contexts = [];
      for (const receipt of [...this._rows('receiving'), ...this._rows('receiving-context')]) {
        if (!receipt.original?.selectedOcids.some(ocid => selected.has(ocid))) continue;
        const original = scopedContext(receipt.original, selected);
        const originalPackageId = receipt.originalPackageId || receipt.packageId;
        contexts.push({ id: sha256(encoded({ originalPackageId, selectedOcids: original.selectedOcids.slice().sort() })),
          originalPackageId, receivedAt: receipt.receivedAt, sourceWorkspace: receipt.sourceWorkspace,
          original, conflicts: (receipt.conflicts || []).filter(item => !item.ocid || selected.has(item.ocid)) });
      }
      const receivings = [...new Map(contexts.map(value => [value.id,value])).values()];
      const identities = new Map();
      for (const document of [...documents, ...receivings.flatMap(value => value.original.documents)])
        for (const version of document.versions) identities.set(version.sha256, {
          sha256: version.sha256, bytes: version.bytes, path: 'documents/' + version.sha256 + '.bin'
        });
      const comparisons = [];
      for (const item of work) if (item.beforeEntryId && item.afterEntryId && item.kind !== 'representation-change') {
        comparisons.push({ workId: item.id, ...this.workspace.compare(item.beforeEntryId, item.afterEntryId) });
      }
      const body = { schema: SOURCE_OPERATIONS_SCHEMA, sourceWorkspace: this.workspace.metadata(),
        selectedOcids: [...selected], exportedAt: now(), selections, windows, documents, work,
        comparisons, receivings, bodies: [...identities.values()] };
      return { ...body, packageId: sha256(encoded(body)) };
    });
  }
  async writeExport(directory, packet) {
    need(packet?.schema === SOURCE_OPERATIONS_SCHEMA && packet.sourceWorkspace?.id === this.workspace.metadata().id,
      'SOURCE_EXPORT_WORKSPACE', 'Export original document bodies from their owning workspace');
    const { packageId, ...content } = packet;
    need(packageId === sha256(encoded(content)), 'SOURCE_PACKAGE_IDENTITY', 'The source-operations packet changed before writing');
    const out = resolve(directory);
    await mkdir(dirname(out), { recursive: true, mode: 0o700 });
    await mkdir(out, { mode: 0o700 });
    await mkdir(join(out, 'documents'), { mode: 0o700 });
    for (const identity of packet.bodies) {
      bodyIdentity(identity, this.maxDocumentBytes);
      const row = this.workspace.db.prepare('SELECT body,bytes FROM source_document_bodies WHERE sha256=?').get(identity.sha256);
      need(row && row.bytes === identity.bytes, 'SOURCE_DOCUMENT_BODY_NOT_FOUND', 'A selected original document body is absent', 404);
      const body = Buffer.from(row.body);
      need(sha256(body) === identity.sha256, 'SOURCE_DOCUMENT_IDENTITY', 'The retained original document bytes changed');
      await writeFile(join(out, identity.path), body, { flag: 'wx', mode: 0o600 });
    }
    await writeFile(join(out, 'source-operations.json'), JSON.stringify(packet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(join(out, 'assigned-review.html'), renderSourceReview(packet), { flag: 'wx', mode: 0o600 });
    return { directory: out, packageId, documents: packet.documents.length, bodies: packet.bodies.length,
      bytes: packet.bodies.reduce((total, value) => total + value.bytes, 0), assignedReviews: packet.work.length };
  }
  prepareHandoff({ ocids } = {}) {
    need(Array.isArray(ocids) && ocids.length > 0, 'SOURCE_EXPORT_SELECTION', 'Select the exact client OCIDs to hand over');
    return this.workspace._snapshot(() => {
      const view = this.workspace.view(), retained = ocids.filter(ocid => view.projects.some(project=>project.ocid===ocid));
      return { source: this.exportState({ocids}), workspace: retained.length ? this.workspace.exportPackage({scope:'all',ocids:retained}) : null,
        report: retained.length ? this.workspace.report({format:'html',scope:'all',ocids:retained}) : null };
    });
  }
  async exportDirectory(directory, { ocids, prepared } = {}) {
    const snapshot = prepared || this.prepareHandoff({ocids});
    need(snapshot?.source?.sourceWorkspace?.id===this.workspace.metadata().id
      && (!snapshot.workspace || (snapshot.workspace.workspace.id===snapshot.source.sourceWorkspace.id
        && snapshot.workspace.workspace.revision===snapshot.source.sourceWorkspace.revision)),
      'SOURCE_HANDOFF_SNAPSHOT','The handoff requires the same retained native workspace and source-operation snapshot');
    ocids = snapshot.source.selectedOcids;
    const out = resolve(directory); await mkdir(dirname(out),{recursive:true,mode:0o700}); await mkdir(out,{mode:0o700});
    const source = await this.writeExport(join(out,'source-operations'),snapshot.source);
    const files = [];
    if (snapshot.workspace) {
      const body = JSON.stringify(snapshot.workspace,null,2)+'\n';
      await writeFile(join(out,'workspace.json'),body,{flag:'wx',mode:0o600});
      files.push({path:'workspace.json',bytes:Buffer.byteLength(body),sha256:sha256(body),packageId:snapshot.workspace.packageId});
      await writeFile(join(out,'process-report.html'),snapshot.report.body,{flag:'wx',mode:0o600});
      files.push({path:'process-report.html',bytes:Buffer.byteLength(snapshot.report.body),sha256:sha256(snapshot.report.body)});
    }
    const body = JSON.stringify(snapshot.source,null,2)+'\n';
    files.push({path:'source-operations/source-operations.json',bytes:Buffer.byteLength(body),sha256:sha256(body),packageId:snapshot.source.packageId});
    const manifest = {schema:'starforge.ocds.source-handoff.v1',exportedAt:snapshot.source.exportedAt,
      workspace:snapshot.source.sourceWorkspace,selectedOcids:[...new Set(ocids)],files,
      originalDocuments:source.bodies,originalDocumentBytes:source.bytes,assignedReviews:source.assignedReviews,
      nativePackageId:snapshot.workspace?.packageId || null,sourceOperationsPackageId:snapshot.source.packageId};
    manifest.handoffId = sha256(encoded(manifest));
    await writeFile(join(out,'handoff.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    await writeFile(join(out,'RECEIVE.md'),[
      '# Editable procurement source handoff','',
      'Selected OCIDs: '+manifest.selectedOcids.join(', '),'',
      'Open the destination Procurement desk and choose Source windows. In Receive source handoff, enter this complete folder path and receive it.',
      'The operator can also run: ocds source-receive --workspace DESTINATION --directory HANDOFF_FOLDER --expected-revision CURRENT_REVISION.',
      '',
      'workspace.json, when present, contains the exact original OCDS source bodies, retained editions and saved process reviews.',
      'source-operations/ contains saved publisher selections, original document bytes, acquisition observations, assigned change reviews and complete receiving context.',
      'Open source-operations/assigned-review.html to read the assigned changes and download the retained originals.',
      '',
      'A fresh source window observes the selected publishers and document URLs again. Received historical window IDs retain their original operation and acquisition identity.',
      'The installed source adapters remain responsible for their original publisher requests. Keep this folder with its client portfolio.'
    ].join('\n')+'\n',{flag:'wx',mode:0o600});
    return {directory:out,...manifest};
  }
  async receiveHandoff(directory, { expectedRevision, expectedHandoffId } = {}) {
    const base = resolve(directory), manifest = JSON.parse(await readFile(join(base,'handoff.json'),'utf8'));
    need(expectedHandoffId === undefined || expectedHandoffId === manifest?.handoffId,
      'SOURCE_HANDOFF_CHANGED','The selected source handoff differs from its expected identity',409,
      {expectedHandoffId,actualHandoffId:manifest?.handoffId || null});
    const {handoffId,...content} = manifest;
    need(manifest.schema==='starforge.ocds.source-handoff.v1' && handoffId===sha256(encoded(content))
      && Array.isArray(manifest.files) && Array.isArray(manifest.selectedOcids),
      'SOURCE_HANDOFF_IDENTITY','The complete source handoff manifest has a different identity');
    const allowed = new Set(['workspace.json','process-report.html','source-operations/source-operations.json']);
    const read = new Map();
    for (const file of manifest.files) {
      need(allowed.has(file.path) && !read.has(file.path),'SOURCE_HANDOFF_FILE','The handoff contains an unexpected or repeated file');
      const body = await readFile(join(base,file.path));
      need(body.length===file.bytes && sha256(body)===file.sha256,'SOURCE_HANDOFF_IDENTITY','A handoff file differs from its original manifest');
      read.set(file.path,body);
    }
    need(read.has('source-operations/source-operations.json'),'SOURCE_HANDOFF_FILE','The source-operations packet is absent');
    const sourcePacket=JSON.parse(read.get('source-operations/source-operations.json').toString('utf8'));
    const {packageId:sourcePackageId,...sourceContent}=sourcePacket;
    need(sourcePacket.schema===SOURCE_OPERATIONS_SCHEMA && sourcePackageId===sha256(encoded(sourceContent)),
      'SOURCE_PACKAGE_IDENTITY','The complete source-operations packet identity does not match');
    const selected=new Set(manifest.selectedOcids);
    need(sourcePacket.packageId===manifest.sourceOperationsPackageId && Array.isArray(sourcePacket.selectedOcids)
      && sourcePacket.selectedOcids.length===selected.size && sourcePacket.selectedOcids.every(ocid=>selected.has(ocid)),
      'SOURCE_HANDOFF_IDENTITY','The manifest and source packet select different original processes');
    const existing = this._get('receiving',manifest.sourceOperationsPackageId);
    if (existing) return {handoffId,sourceOperations:existing,workspace:this.workspace.metadata(),repeated:true};
    need(Number.isSafeInteger(expectedRevision) && expectedRevision===this.workspace.metadata().revision,
      'REVISION_CONFLICT','Read the current destination workspace revision before receiving',409,
      {currentRevision:this.workspace.metadata().revision});
    let native = null;
    if (read.has('workspace.json')) {
      const packet = JSON.parse(read.get('workspace.json').toString('utf8'));
      need(packet.packageId===manifest.nativePackageId && Array.isArray(packet.selection?.ocids)
        && packet.selection.ocids.every(ocid=>selected.has(ocid)), 'SOURCE_HANDOFF_IDENTITY','The native workspace package identity or selected processes changed');
      native = this.workspace.receivePackage(packet,{expectedRevision});
    }
    try {
      const sourceOperations = await this.receiveDirectory(join(base,'source-operations'),{expectedRevision:this.workspace.metadata().revision,expectedPackageId:manifest.sourceOperationsPackageId});
      need(sourceOperations.packageId===manifest.sourceOperationsPackageId,'SOURCE_HANDOFF_IDENTITY','The source operations package ID changed');
      return {handoffId,nativeReceiving:native?.receiving || null,sourceOperations,workspace:this.workspace.metadata(),repeated:false};
    } catch (error) {
      error.details = {...error.details,handoffId,nativePackageId:manifest.nativePackageId,
        nativeReceived:!!native,currentRevision:this.workspace.metadata().revision};
      throw error;
    }
  }
  async receiveDirectory(directory, { expectedRevision, expectedPackageId } = {}) {
    const base = resolve(directory);
    const packet = JSON.parse(await readFile(join(base, 'source-operations.json'), 'utf8'));
    const { packageId, ...content } = packet;
    need(expectedPackageId === undefined || packageId === expectedPackageId,
      'SOURCE_HANDOFF_IDENTITY', 'The selected source-operations package changed before receiving');
    need(packet.schema === SOURCE_OPERATIONS_SCHEMA && packageId === sha256(encoded(content)),
      'SOURCE_PACKAGE_IDENTITY', 'The complete source-operations packet identity does not match');
    need(Array.isArray(packet.selectedOcids) && packet.selectedOcids.length > 0
      && packet.selectedOcids.every(value => typeof value === 'string' && value.length > 0)
      && new Set(packet.selectedOcids).size === packet.selectedOcids.length
      && ['selections', 'windows', 'documents', 'work', 'bodies'].every(key => Array.isArray(packet[key]))
      && (!packet.receivings || Array.isArray(packet.receivings)),
      'SOURCE_PACKAGE_INVALID', 'The source-operations packet is incomplete');
    const existing = this._get('receiving', packageId);
    if (existing) return existing;
    need(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
      'REVISION_REQUIRED', 'Read the current workspace revision before receiving source operations', 428);
    const selected = new Set(packet.selectedOcids), bodies = [], seenBodies = new Set(), bodyMap = new Map();
    for (const identity of packet.bodies) {
      bodyIdentity(identity, this.maxDocumentBytes);
      need(!seenBodies.has(identity.sha256), 'SOURCE_DOCUMENT_IDENTITY', 'Original body identities must be unique');
      seenBodies.add(identity.sha256);
      const file = join(base, identity.path), info = await stat(file);
      need(info.isFile() && info.size === identity.bytes, 'SOURCE_DOCUMENT_IDENTITY', 'The received original file has a different size');
      const retained = this.workspace.db.prepare('SELECT bytes FROM source_document_bodies WHERE sha256=?').get(identity.sha256);
      need(!retained || retained.bytes === identity.bytes, 'SOURCE_DOCUMENT_IDENTITY', 'An original body identity has a different retained byte count');
      bodies.push({ ...identity, file });
      bodyMap.set(identity.sha256, identity);
    }
    const associatedBodies = new Set();
    const validateContext = context => {
      need(context && Array.isArray(context.selectedOcids) && context.selectedOcids.every(ocid=>selected.has(ocid))
        && ['selections','windows','documents','work'].every(key => Array.isArray(context[key])),
        'SOURCE_PACKAGE_INVALID', 'Retained receiving context must include every original source-operation collection');
      for (const selection of context.selections) {
        need(identifier(selection.id) && Number.isSafeInteger(selection.revision) && selection.revision > 0
          && Array.isArray(selection.ocids) && selection.ocids.length > 0 && selection.ocids.every(ocid => selected.has(ocid))
          && typeof selection.provider === 'string' && selection.request && typeof selection.request === 'object'
          && !Array.isArray(selection.request) && typeof selection.owner === 'string',
          'SOURCE_SELECTION_SCOPE', 'A received publisher selection is invalid or outside this client scope');
        for (const attachment of selection.attachments || []) need(selected.has(attachment.ocid)
          && httpReference(attachment.referenceUrl) && attachment.document && typeof attachment.document === 'object',
          'SOURCE_ATTACHMENT_SCOPE', 'An incoming original attachment must retain its selected OCID and official source reference');
      }
      for (const document of context.documents) {
        need(selected.has(document.ocid) && typeof document.id === 'string' && Array.isArray(document.versions)
          && document.document && typeof document.document === 'object', 'SOURCE_DOCUMENT_SCOPE',
          'A received document is outside the selected client portfolio');
        if (document.entryId) need(this.workspace.getEntry(document.entryId).ocid === document.ocid,
          'SOURCE_DOCUMENT_ENTRY', 'Receive the corresponding original workspace edition before its source-operations packet');
        for (const version of [...document.versions,...(document.observations || [])]) {
          need(bodyMap.get(version.sha256)?.bytes === version.bytes,
            'SOURCE_DOCUMENT_BODY_NOT_FOUND', 'A received document observation has no complete original body');
          associatedBodies.add(version.sha256);
        }
        if (document.latest) need(document.versions.some(version => version.sha256 === document.latest.sha256),
          'SOURCE_DOCUMENT_IDENTITY', 'The current document observation must identify a retained original edition');
      }
      for (const item of context.work) {
        need(selected.has(item.ocid) && typeof item.id === 'string' && Number.isSafeInteger(item.revision) && item.revision > 0
          && ['pending','reviewing','resolved'].includes(item.status) && typeof item.owner === 'string',
          'SOURCE_REVIEW_SCOPE', 'A received assigned review is invalid or outside the selected client');
        for (const id of [item.beforeEntryId, item.afterEntryId].filter(Boolean))
          need(this.workspace.getEntry(id).ocid === item.ocid, 'SOURCE_REVIEW_ENTRY', 'Receive each original comparison edition before its assigned review');
      }
      for (const window of context.windows) need(identifier(window.id) && Array.isArray(window.selectedOcids)
        && window.selectedOcids.every(ocid => selected.has(ocid))
        && ['selections','sources','documents','references','baseline','workIds','issues'].every(key => Array.isArray(window[key]))
        && window.selections.every(selection=>Array.isArray(selection.ocids) && selection.ocids.every(ocid=>selected.has(ocid)))
        && window.references.every(reference => selected.has(reference.ocid))
        && window.baseline.every(reference => selected.has(reference.ocid)),
        'SOURCE_WINDOW_SCOPE', 'A retained window has invalid source or client-scope metadata');
    };
    validateContext(packet);
    for (const receipt of packet.receivings || []) {
      need(receipt && typeof receipt.id === 'string' && typeof receipt.originalPackageId === 'string',
        'SOURCE_RECEIVING_IDENTITY', 'An onward receiving context needs its original package identity');
      validateContext(receipt.original);
    }
    need(bodies.every(body=>associatedBodies.has(body.sha256)), 'SOURCE_DOCUMENT_SCOPE', 'Every transferred original body needs a selected source association');
    return this.workspace._change('source_operations.received', () => {
      const already = this._get('receiving', packageId);
      if (already) return { value: already };
      const retainedBytes = this.workspace.db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM source_document_bodies').get().bytes;
      const incomingBytes = bodies.filter(body => !this.workspace.db.prepare('SELECT sha256 FROM source_document_bodies WHERE sha256=?').get(body.sha256))
        .reduce((total,body) => total + body.bytes,0);
      need(retainedBytes + incomingBytes <= this.maxRetainedDocumentBytes, 'DOCUMENT_WORKSPACE_CAPACITY',
        'Received original documents exceed this workspace document capacity', 413);
      const insertBody = this.workspace.db.prepare('INSERT OR IGNORE INTO source_document_bodies(sha256,bytes,body) VALUES(?,?,?)');
      for (const identity of bodies) {
        const info = statSync(identity.file);
        need(info.isFile() && info.size === identity.bytes, 'SOURCE_DOCUMENT_IDENTITY', 'A received original file changed before it was retained');
        const body = readFileSync(identity.file);
        need(body.length === identity.bytes && sha256(body) === identity.sha256,
          'SOURCE_DOCUMENT_IDENTITY', 'A received original document does not match its retained identity');
        insertBody.run(identity.sha256, identity.bytes, body);
      }
      const conflicts = [], imported = { selections: 0, documents: 0, work: 0, windows: 0, receivingContexts: 0 };
      for (const [kind, values, count] of [['selection', packet.selections, 'selections'],
        ['document', packet.documents, 'documents'], ['work', packet.work, 'work'], ['window', packet.windows, 'windows']]) {
        for (const value of values) {
          const previous = this._get(kind, value.id);
          if (!previous) {
            const received = kind === 'window' ? { ...value, originalWorkspaceId: value.originalWorkspaceId || value.workspaceId,
              workspaceId: this.workspace.metadata().id, receivedFromPackageId: packageId, status: 'received' }
              : { ...value, receivedFromPackageId: packageId };
            this._put(kind, received); imported[count]++;
          } else {
            const comparable = value => { const result = clone(value); delete result.receivedFromPackageId; return result; };
            if (encoded(comparable(previous)) !== encoded(comparable(value))) {
              conflicts.push({ kind, id: value.id, ocid: value.ocid || null, localRevision: previous.revision ?? null,
                receivedRevision: value.revision ?? null, retainedContext: packageId });
              if (kind === 'document') {
                const versions = new Map(previous.versions.map(version => [version.sha256,version]));
                const observations = new Map((previous.observations || (previous.latest ? [previous.latest] : [])).map(item => [item.id,item]));
                for (const version of value.versions) if (!versions.has(version.sha256)) versions.set(version.sha256,version);
                for (const item of value.observations || (value.latest ? [value.latest] : [])) if (!observations.has(item.id)) observations.set(item.id,item);
                this._put(kind,{...previous,versions:[...versions.values()],observations:[...observations.values()]});
              }
            }
          }
        }
      }
      for (const receipt of packet.receivings || []) if (!this._get('receiving-context',receipt.id)) {
        this._put('receiving-context',receipt); imported.receivingContexts++;
      }
      const receipt = { id: packageId, packageId, receivedAt: now(), sourceWorkspace: packet.sourceWorkspace,
        destinationWorkspaceId: this.workspace.metadata().id, selectedOcids: packet.selectedOcids, imported, conflicts,
        original: scopedContext(packet,selected) };
      this._put('receiving', receipt);
      return { value: receipt, audit: { sourceOperationsPackageId: packageId, imported, conflicts: conflicts.length } };
    }, expectedRevision);
  }

}

function html(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function renderSourceReview(packet) {
  const cell = value => '<td>' + html(typeof value === 'object' ? JSON.stringify(value) : value) + '</td>';
  const work = packet.work.map(item => {
    const comparison = packet.comparisons?.find(value => value.workId === item.id);
    const changes = comparison ? '<details><summary>Complete field changes (' + comparison.changes.length + ')</summary><table><thead><tr><th>Original path</th><th>Change</th><th>Before</th><th>After</th></tr></thead><tbody>'
      + comparison.changes.map(change => '<tr>' + cell(change.path) + cell(change.type)
        + cell(change.beforePresent ? change.before : '[absent]') + cell(change.afterPresent ? change.after : '[absent]') + '</tr>').join('') + '</tbody></table></details>' : '';
    return '<section><h2>' + html(item.ocid) + '</h2><dl><dt>Assigned owner</dt><dd>' + html(item.owner)
      + '</dd><dt>Status</dt><dd>' + html(item.status) + '</dd><dt>Next action</dt><dd>' + html(item.nextAction)
      + '</dd><dt>Resolution</dt><dd>' + html(item.resolution) + '</dd><dt>Review ID / revision</dt><dd><code>'
      + html(item.id) + '</code> / ' + html(item.revision) + '</dd></dl>' + changes
      + '<details><summary>Original edition and document identities</summary><pre>' + html(JSON.stringify(item, null, 2)) + '</pre></details></section>';
  }).join('');
  const documents = packet.documents.map(document => {
    const versions = document.versions.map(version => '<li><a href="documents/' + html(version.sha256)
      + '.bin" download>' + html(version.originalFilename || document.document.title || 'Original document') + '</a> — '
      + html(version.bytes) + ' bytes · <code>' + html(version.sha256) + '</code><br>Retrieved '
      + html(version.retrievedAt) + ' · HTTP ' + html(version.status) + '</li>').join('');
    return '<section><h2>' + html(document.document.title || document.document.id || 'Original document') + '</h2><p>'
      + html(document.ocid) + ' · ' + html(document.sourcePointer || document.referenceUrl) + '</p><ul>' + versions
      + '</ul><details><summary>Complete original metadata and acquisition</summary><pre>'
      + html(JSON.stringify(document, null, 2)) + '</pre></details></section>';
  }).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Assigned procurement source review</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#161616;background:#fff;max-width:1100px;margin:24px auto;padding:0 16px}section{border-top:1px solid #aaa;padding:18px 0}h1{font-size:26px}h2{font-size:18px}a{color:#222;text-underline-offset:3px}a:focus{outline:2px solid #111;outline-offset:3px}dl{display:grid;grid-template-columns:180px 1fr;gap:6px}dd{margin:0}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;margin:12px 0}@media(max-width:500px){dl{display:block}dt{font-weight:600;margin-top:8px}table{display:block;overflow:auto}}</style>'
    + '<h1>Assigned procurement source review</h1><p>Exported ' + html(packet.exportedAt) + ' · '
    + packet.selectedOcids.length + ' selected processes · ' + packet.work.length + ' retained review items.</p>'
    + work + '<h1>Original documents</h1>' + documents
    + '<details><summary>Retained receiving context</summary><pre>' + html(JSON.stringify(packet.receivings || [],null,2)) + '</pre></details>'
    + '<details><summary>Publisher selections and complete window history</summary><pre>'
    + html(JSON.stringify({ selections: packet.selections, windows: packet.windows }, null, 2)) + '</pre></details></html>\n';
}
