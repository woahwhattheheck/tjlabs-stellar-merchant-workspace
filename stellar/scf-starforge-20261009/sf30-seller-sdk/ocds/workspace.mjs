// MIT. Durable OCDS operator projects with original source bytes and transactional receiving.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeOcds, compareDocuments } from './domain.mjs';
import { renderReport } from './reports.mjs';

export const WORKSPACE_SCHEMA = 'starforge.ocds.workspace.v1';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
};
export function failure(code, message, status = 400, details) {
  const error = new Error(message); error.code = code; error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}
const now = () => new Date().toISOString();
const own = (object, key) => Object.hasOwn(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const decoded = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const parseBody = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const cleanText = (value, name, limit = 32768) => {
  if (typeof value !== 'string' || value.length > limit) throw failure('INVALID_FIELD', name + ' must be text of at most ' + limit + ' characters');
  return value;
};
const emptyReview = () => ({ revision: 0, disposition: 'unreviewed', owner: '', nextAction: '', note: '', shortlisted: false, updatedAt: null, operator: null });
function checkRevision(expected, current, name = 'workspace') {
  if (!Number.isSafeInteger(expected) || expected < 0) throw failure('REVISION_REQUIRED', 'Read the current ' + name + ' and pass its revision', 428);
  if (expected !== current) throw failure('REVISION_CONFLICT', 'The ' + name + ' changed; reload it before saving', 409, { expectedRevision: expected, currentRevision: current });
}
function preparedSource(document, meta = {}) {
  let body;
  if (meta.rawBytes !== undefined) body = Buffer.from(meta.rawBytes);
  else if (meta.rawText !== undefined) body = Buffer.from(cleanText(meta.rawText, 'rawText', 256 * 1024 * 1024), 'utf8');
  else body = Buffer.from(JSON.stringify(document), 'utf8');
  let text, parsed;
  try { text = decoded(body); parsed = parseBody(text); } catch { throw failure('INVALID_JSON', 'Source must be complete UTF-8 JSON'); }
  if (document !== undefined && canonical(parsed) !== canonical(document)) throw failure('SOURCE_BODY_MISMATCH', 'Parsed document differs from the retained original source body');
  const id = sha256(body);
  // An import clock is separate from an upstream acquisition clock. Unknown
  // publisher retrieval time survives original adoption and portable receiving.
  const importedAt = meta.importedAt === undefined ? now() : meta.importedAt;
  const retrievedAt = own(meta, 'retrievedAt') && meta.retrievedAt !== undefined ? meta.retrievedAt : importedAt;
  for (const [name, value] of [['importedAt', importedAt], ['retrievedAt', retrievedAt]]) {
    if (name === 'retrievedAt' && value === null) continue;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      throw failure('SOURCE_TIME_INVALID', name + ' must be an original timestamp, or null for unknown retrieval time');
  }
  let acquisition;
  if (meta.acquisition !== undefined) {
    if (!plain(meta.acquisition)) throw failure('SOURCE_ACQUISITION_INVALID', 'Original acquisition metadata must be a JSON object');
    try { acquisition = JSON.parse(JSON.stringify(meta.acquisition)); }
    catch { throw failure('SOURCE_ACQUISITION_INVALID', 'Original acquisition metadata must contain complete JSON values'); }
  }
  const normalized = normalizeOcds(parsed, { sourceId: id, label: String(meta.label || 'OCDS source'), url: String(meta.url || ''), retrievedAt });
  const emptyEnvelope = value => plain(value) && (
    (Array.isArray(value.releases) && value.releases.length === 0 && !own(value, 'ocid'))
    || (Array.isArray(value.records) && value.records.length === 0));
  const recognizedEmpty = emptyEnvelope(parsed)
    || (Array.isArray(parsed) && parsed.length > 0 && parsed.every(emptyEnvelope));
  if (!normalized.entries?.length && !normalized.links?.length && !recognizedEmpty)
    throw failure('NO_OCDS_ENTRIES', 'Source contains no OCDS release package, record package or linked releases', 422, normalized.diagnostics);
  const metadata = {
    ...normalized.source, id, sha256: id, bytes: body.length,
    label: String(meta.label || normalized.source?.label || 'OCDS source'),
    url: String(meta.url || normalized.source?.url || ''),
    retrievedAt, importedAt, ...(acquisition === undefined ? {} : { acquisition }),
    diagnostics: normalized.diagnostics || [], links: normalized.links || [],
    sourceEntryCount: normalized.entries.length,
    bodyKind: meta.rawText !== undefined || meta.rawBytes !== undefined ? 'original-utf8' : 'serialized-json'
  };
  const entries = normalized.entries.filter(entry => typeof entry.ocid === 'string' && entry.ocid.length > 0).map(entry => ({
    ...entry, id: sha256(id + '\n' + entry.sourcePointer), sourceId: id,
    sourcePointer: entry.sourcePointer, importedAt: metadata.importedAt,
    documentSha256: sha256(canonical(entry.document))
  }));
  return { id, body, text, metadata, entries };
}
function entryOrder(a, b) {
  const ad = Date.parse(a.date || a.importedAt || '') || 0;
  const bd = Date.parse(b.date || b.importedAt || '') || 0;
  return bd - ad || Number(b.kind === 'compiledRelease') - Number(a.kind === 'compiledRelease')
    || String(b.importedAt).localeCompare(String(a.importedAt)) || a.id.localeCompare(b.id);
}
const withoutDocument = entry => { const { document, source, ...metadata } = entry; return metadata; };

export class OcdsWorkspace {
  constructor(directory, { operator = 'operator', title = 'Open Contracting workspace' } = {}) {
    this.directory = resolve(cleanText(directory, 'workspace directory', 8192));
    this.operator = cleanText(operator, 'operator', 256);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.databasePath = join(this.directory, 'workspace.sqlite');
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, body BLOB NOT NULL, metadata TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), ocid TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);'
      + 'CREATE INDEX IF NOT EXISTS entries_ocid ON entries(ocid);'
      + 'CREATE TABLE IF NOT EXISTS reviews (ocid TEXT PRIMARY KEY, data TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS received (id TEXT PRIMARY KEY, data TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY, data TEXT NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
    const time = now();
    this.db.prepare('INSERT OR IGNORE INTO metadata(id,value) VALUES(1,?)').run(JSON.stringify({
      schema: WORKSPACE_SCHEMA, id: randomUUID(), title: cleanText(title, 'title', 1024), revision: 0, createdAt: time, updatedAt: time
    }));
    const metadata = this.metadata();
    if (metadata.schema !== WORKSPACE_SCHEMA) { this.db.close(); throw failure('WORKSPACE_VERSION', 'This workspace uses an unsupported schema'); }
    chmodSync(this.databasePath, 0o600);
    this.closed = false;
    this._transactionDepth = 0;
  }
  metadata() { return JSON.parse(this.db.prepare('SELECT value FROM metadata WHERE id=1').get().value); }
  _snapshot(callback) {
    if (this._transactionDepth) return callback();
    this.db.exec('BEGIN');
    this._transactionDepth++;
    try {
      const value = callback();
      this.db.exec('COMMIT');
      return value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this._transactionDepth--; }
  }
  _change(type, callback, expectedRevision) {
    if (this._transactionDepth) throw failure('TRANSACTION_IN_PROGRESS', 'Finish the current workspace operation before changing it', 409);
    this.db.exec('BEGIN IMMEDIATE');
    this._transactionDepth++;
    try {
      const workspace = this.metadata();
      if (expectedRevision !== undefined) checkRevision(expectedRevision, workspace.revision);
      const result = callback(workspace);
      const time = now();
      const updated = { ...workspace, revision: workspace.revision + 1, updatedAt: time };
      this.db.prepare('UPDATE metadata SET value=? WHERE id=1').run(JSON.stringify(updated));
      this.db.prepare('INSERT INTO audit(data) VALUES(?)').run(JSON.stringify({
        id: randomUUID(), at: time, operator: this.operator, type, revision: updated.revision, ...result?.audit
      }));
      this.db.exec('COMMIT');
      return result?.value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this._transactionDepth--; }
  }
  _ingest(prepared, allowedEntryIds = null) {
    const existing = this.db.prepare('SELECT id FROM sources WHERE id=?').get(prepared.id);
    if (!existing) this.db.prepare('INSERT INTO sources(id,body,metadata) VALUES(?,?,?)').run(prepared.id, prepared.body, JSON.stringify(prepared.metadata));
    let addedEntries = 0;
    const insert = this.db.prepare('INSERT OR IGNORE INTO entries(id,source_id,ocid,kind,data) VALUES(?,?,?,?,?)');
    for (const entry of prepared.entries) {
      if (allowedEntryIds && !allowedEntryIds.has(entry.id)) continue;
      addedEntries += Number(insert.run(entry.id, prepared.id, String(entry.ocid), entry.kind, JSON.stringify(entry)).changes);
    }
    return { sourceId: prepared.id, sourceAdded: !existing, entriesAdded: addedEntries };
  }
  importDocument(document, meta = {}, expectedRevision) {
    const prepared = preparedSource(document, meta);
    const ingestion = this._change('source.imported', () => {
      const value = this._ingest(prepared); return { value, audit: value };
    }, expectedRevision);
    return { ...this.view(), ingestion };
  }
  getSource(id, options = {}) { return this._snapshot(() => this._getSource(id, options)); }
  _getSource(id, { includeBody = true } = {}) {
    const row = this.db.prepare('SELECT body,metadata FROM sources WHERE id=?').get(id);
    if (!row) throw failure('SOURCE_NOT_FOUND', 'Source does not exist in this workspace', 404);
    const metadata = JSON.parse(row.metadata);
    const entryCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM entries WHERE source_id=?').get(id).count);
    if (!includeBody) return { ...metadata, entryCount };
    const bytes = Buffer.from(row.body);
    if (sha256(bytes) !== id || bytes.length !== metadata.bytes) throw failure('SOURCE_CHANGED', 'Retained source bytes do not match their identity', 409);
    const body = decoded(bytes);
    return { ...metadata, entryCount, body, document: parseBody(body) };
  }
  getEntry(id) { return this._snapshot(() => this._getEntry(id)); }
  _getEntry(id) {
    const row = this.db.prepare('SELECT data FROM entries WHERE id=?').get(id);
    if (!row) throw failure('ENTRY_NOT_FOUND', 'Edition does not exist in this workspace', 404);
    const entry = JSON.parse(row.data);
    return { ...entry, source: this.getSource(entry.sourceId) };
  }
  _entries() { return this.db.prepare('SELECT data FROM entries ORDER BY rowid').all().map(row => JSON.parse(row.data)); }
  _review(ocid) { const row = this.db.prepare('SELECT data FROM reviews WHERE ocid=?').get(ocid); return row ? JSON.parse(row.data) : emptyReview(); }
  view() { return this._snapshot(() => this._view()); }
  _view() {
    const groups = new Map(), identities = new Map(), diagnostics = [];
    for (const entry of this._entries()) {
      if (!groups.has(entry.ocid)) groups.set(entry.ocid, []);
      groups.get(entry.ocid).push(entry);
      if (entry.releaseId !== null && entry.releaseId !== undefined) {
        const key = canonical([entry.ocid, entry.releaseId, entry.kind]);
        const old = identities.get(key);
        if (old && old.documentSha256 !== entry.documentSha256) diagnostics.push({
          code: 'RELEASE_IDENTITY_CONFLICT', severity: 'warning', ocid: entry.ocid,
          message: 'Different retained bodies use the same original release identity',
          entryIds: [old.id, entry.id], releaseId: entry.releaseId
        });
        else identities.set(key, entry);
      }
    }
    const projects = [...groups].map(([ocid, entries]) => {
      entries.sort(entryOrder);
      const current = entries.find(entry => entry.kind !== 'versionedRelease') || entries[0];
      return { ocid, summary: current.summary, currentEntryId: current.id, entries: entries.map(withoutDocument), review: this._review(ocid) };
    }).sort((a, b) => String(a.summary?.title || a.ocid).localeCompare(String(b.summary?.title || b.ocid)));
    const sources = this.db.prepare('SELECT id FROM sources ORDER BY rowid').all().map(row => this.getSource(row.id, { includeBody: false }));
    for (const source of sources) for (const diagnostic of source.diagnostics || []) diagnostics.push({ ...diagnostic, sourceId: source.id });
    const receivings = this.receivingHistory().map(record => ({
      packageId: record.packageId, receivedAt: record.receivedAt, operator: record.operator,
      sourceWorkspace: record.sourceWorkspace, imports: record.imports,
      conflicts: record.conflicts.map(({ receivedReview, ...conflict }) => conflict)
    }));
    for (const receipt of receivings) for (const conflict of receipt.conflicts) diagnostics.push({ ...conflict, packageId: receipt.packageId, severity: 'info' });
    return {
      workspace: this.metadata(), sources, projects, diagnostics, receivings,
      publications: this.db.prepare('SELECT data FROM publications ORDER BY rowid').all().map(row => JSON.parse(row.data)),
      captures: this.db.prepare('SELECT data FROM captures ORDER BY rowid').all().map(row => JSON.parse(row.data))
    };
  }
  updateReview(ocid, patch) {
    if (!plain(patch)) throw failure('INVALID_REVIEW', 'Review must be an object');
    if (!this.db.prepare('SELECT id FROM entries WHERE ocid=? LIMIT 1').get(ocid)) throw failure('PROJECT_NOT_FOUND', 'Contracting process does not exist', 404);
    const allowed = new Set(['expectedRevision', 'disposition', 'owner', 'nextAction', 'note', 'shortlisted']);
    for (const key of Object.keys(patch)) if (!allowed.has(key)) throw failure('INVALID_REVIEW_FIELD', 'Unknown review field: ' + key);
    this._change('review.saved', () => {
      const previous = this._review(ocid); checkRevision(patch.expectedRevision, previous.revision, 'review');
      const next = { ...previous };
      for (const field of ['disposition', 'owner', 'nextAction', 'note']) if (own(patch, field)) next[field] = cleanText(patch[field], field);
      if (!['unreviewed', 'reviewing', 'pursue', 'passed'].includes(next.disposition)) throw failure('INVALID_DISPOSITION', 'Choose unreviewed, reviewing, pursue or passed');
      if (own(patch, 'shortlisted')) {
        if (typeof patch.shortlisted !== 'boolean') throw failure('INVALID_SHORTLIST', 'Shortlisted must be a boolean');
        next.shortlisted = patch.shortlisted;
      }
      next.revision = previous.revision + 1; next.updatedAt = now(); next.operator = this.operator;
      this.db.prepare('INSERT INTO reviews(ocid,data) VALUES(?,?) ON CONFLICT(ocid) DO UPDATE SET data=excluded.data').run(ocid, JSON.stringify(next));
      return { audit: { ocid, previousReviewRevision: previous.revision, reviewRevision: next.revision } };
    });
    return this.view();
  }
  compare(beforeId, afterId) { return this._snapshot(() => this._compare(beforeId, afterId)); }
  _compare(beforeId, afterId) {
    const before = this.getEntry(beforeId), after = this.getEntry(afterId);
    if (before.ocid !== after.ocid) throw failure('COMPARISON_OCID_MISMATCH', 'Choose editions of the same contracting process');
    if (before.kind === 'versionedRelease' || after.kind === 'versionedRelease') {
      if (before.kind !== after.kind) throw failure('COMPARISON_REPRESENTATION_MISMATCH', 'Compare history with history, or release documents with release documents');
    }
    return { before: withoutDocument(before), after: withoutDocument(after), ...compareDocuments(before.document, after.document) };
  }
  _selection({ scope = 'all', ocids } = {}) {
    if (!['all', 'shortlist'].includes(scope)) throw failure('INVALID_SELECTION', 'Scope must be all or shortlist');
    if (ocids !== undefined && (!Array.isArray(ocids) || ocids.some(id => typeof id !== 'string'))) throw failure('INVALID_SELECTION', 'OCIDs must be an array of strings');
    const all = this.view().projects, wanted = ocids?.length ? new Set(ocids) : null;
    if (wanted) for (const id of wanted) if (!all.some(project => project.ocid === id)) throw failure('PROJECT_NOT_FOUND', 'Selected contracting process does not exist: ' + id, 404);
    return all.filter(project => (!wanted || wanted.has(project.ocid)) && (scope !== 'shortlist' || project.review.shortlisted));
  }
  selectedDocuments(options = {}) { return this._snapshot(() => this._selectedDocuments(options)); }
  _selectedDocuments(options = {}) {
    return this._selection(options).map(project => {
      const id = project.entries.find(entry => entry.kind !== 'versionedRelease')?.id;
      if (!id) return null;
      const entry = this.getEntry(id), { source, ...documentEntry } = entry;
      return { entry: documentEntry, source, review: project.review };
    }).filter(Boolean);
  }
  _sourceIds(selection, entries) {
    if ((selection.scope || 'all') === 'all' && !selection.ocids?.length)
      return this.db.prepare('SELECT id FROM sources ORDER BY rowid').all().map(row => row.id);
    const ids = new Set(entries.map(entry => entry.sourceId)), wanted = new Set(entries.map(entry => entry.ocid));
    for (const row of this.db.prepare('SELECT id,metadata FROM sources ORDER BY rowid').all())
      if ((JSON.parse(row.metadata).links || []).some(link => wanted.has(link.ocid))) ids.add(row.id);
    return [...ids];
  }
  report(options = {}) { return this._snapshot(() => this._report(options)); }
  _report({ format = 'json', ...selection } = {}) {
    const projects = this._selection(selection);
    const documents = projects.flatMap(project => project.entries.map(metadata => {
      const { source, ...entry } = this.getEntry(metadata.id); return { source, entry };
    }));
    const sourceIds = this._sourceIds(selection, documents.map(value => value.entry));
    return renderReport({
      schema: 'starforge.ocds.report.v1', workspace: this.metadata(), exportedAt: now(), projects,
      entries: documents.map(value => value.entry), sources: sourceIds.map(id => this.getSource(id))
    }, { format });
  }
  exportPackage(options = {}) { return this._snapshot(() => this._exportPackage(options)); }
  _exportPackage({ includeReviews = true, ...selection } = {}) {
    const projects = this._selection(selection), wanted = new Set(projects.map(project => project.ocid));
    const entries = this._entries().filter(entry => wanted.has(entry.ocid));
    const ids = this._sourceIds(selection, entries);
    const sources = ids.map(id => {
      const source = this.getSource(id), { body, document, ...metadata } = source;
      return { id, sha256: id, bytes: Buffer.byteLength(body, 'utf8'), body, metadata };
    });
    const payload = {
      schema: WORKSPACE_SCHEMA, exportedAt: now(), workspace: this.metadata(), sources,
      receivings: includeReviews ? this.receivingHistory() : [],
      captures: includeReviews ? this.db.prepare('SELECT data FROM captures ORDER BY rowid').all().map(row => JSON.parse(row.data)).filter(capture => ((selection.scope || 'all') === 'all' && !selection.ocids?.length || capture.pages.length > 0) && capture.pages.every(page => ids.includes(page.sourceId))) : [],
      selection: { ocids: [...wanted], entryIds: entries.map(entry => entry.id) },
      reviews: includeReviews ? projects.map(project => ({ ocid: project.ocid, ...project.review })) : [],
      audit: includeReviews ? this.db.prepare('SELECT data FROM audit ORDER BY sequence').all().map(row => JSON.parse(row.data)) : [],
      publications: includeReviews ? this.db.prepare('SELECT data FROM publications ORDER BY rowid').all().map(row => JSON.parse(row.data)) : []
    };
    return { ...payload, packageId: sha256(canonical(payload)) };
  }
  receivePackage(packet, { expectedRevision } = {}) {
    if (!plain(packet) || packet.schema !== WORKSPACE_SCHEMA || !Array.isArray(packet.sources)
      || !plain(packet.selection) || !Array.isArray(packet.selection.entryIds) || !Array.isArray(packet.selection.ocids)
      || !Array.isArray(packet.reviews) || !Array.isArray(packet.audit) || !Array.isArray(packet.publications)
      || (packet.receivings !== undefined && !Array.isArray(packet.receivings))
      || (packet.captures !== undefined && !Array.isArray(packet.captures)))
      throw failure('INVALID_PACKAGE', 'Choose a complete Open Contracting workspace package');
    const { packageId, ...payload } = packet;
    if (typeof packageId !== 'string' || sha256(canonical(payload)) !== packageId) throw failure('PACKAGE_CHANGED', 'Workspace package does not match its content identity', 422);
    const previous = this.db.prepare('SELECT data FROM received WHERE id=?').get(packageId);
    if (previous) return { ...this.view(), receiving: { ...JSON.parse(previous.data), repeated: true } };
    checkRevision(expectedRevision, this.metadata().revision);
    const wanted = new Set(packet.selection.entryIds), ocids = new Set(packet.selection.ocids);
    if (wanted.size !== packet.selection.entryIds.length || ocids.size !== packet.selection.ocids.length
      || [...wanted].some(id => !/^[a-f0-9]{64}$/.test(id)) || [...ocids].some(id => typeof id !== 'string'))
      throw failure('INVALID_PACKAGE_SELECTION', 'Package selection contains invalid or duplicate identities');
    const prepared = packet.sources.map(source => {
      if (!plain(source) || typeof source.body !== 'string' || !plain(source.metadata)) throw failure('INVALID_PACKAGE_SOURCE', 'Package is missing an original source body');
      const parsed = preparedSource(undefined, { ...source.metadata, rawText: source.body });
      if (parsed.id !== source.id || parsed.id !== source.sha256 || parsed.body.length !== source.bytes) throw failure('SOURCE_CHANGED', 'An original source body no longer matches its hash or byte length', 422);
      return parsed;
    });
    const found = new Set();
    for (const source of prepared) for (const entry of source.entries) if (wanted.has(entry.id)) {
      if (!ocids.has(entry.ocid)) throw failure('INVALID_PACKAGE_SELECTION', 'Selected edition and process identities disagree');
      found.add(entry.id);
    }
    if (found.size !== wanted.size) throw failure('MISSING_PACKAGE_EDITION', 'Package does not contain every selected original edition', 422);
    const receiving = this._change('workspace.received', () => {
      const already = this.db.prepare('SELECT data FROM received WHERE id=?').get(packageId);
      if (already) return { value: { ...JSON.parse(already.data), repeated: true } };
      const imports = prepared.map(source => this._ingest(source, wanted)), conflicts = [];
      for (const imported of packet.reviews) {
        if (!plain(imported) || !ocids.has(imported.ocid)) throw failure('INVALID_PACKAGE_REVIEW', 'Package review has no selected contracting process');
        if (!Number.isSafeInteger(imported.revision) || imported.revision < 0
          || !['unreviewed', 'reviewing', 'pursue', 'passed'].includes(imported.disposition)
          || typeof imported.shortlisted !== 'boolean') throw failure('INVALID_PACKAGE_REVIEW', 'Package review state is invalid');
        for (const field of ['owner', 'nextAction', 'note']) cleanText(imported[field], field);
        const { ocid, ...review } = imported;
        const existing = this.db.prepare('SELECT data FROM reviews WHERE ocid=?').get(ocid);
        if (!existing || JSON.parse(existing.data).revision === 0)
          this.db.prepare('INSERT INTO reviews(ocid,data) VALUES(?,?) ON CONFLICT(ocid) DO UPDATE SET data=excluded.data').run(ocid, JSON.stringify(review));
        else if (canonical(JSON.parse(existing.data)) !== canonical(review))
          conflicts.push({ code: 'REVIEW_PRESERVED', ocid, message: 'The local review was preserved; the received review remains in this receiving record', receivedReview: review });
      }
      const value = { packageId, receivedAt: now(), operator: this.operator, sourceWorkspace: packet.workspace,
        imports, conflicts, sourceAudit: packet.audit, sourcePublications: packet.publications, sourceSelection: packet.selection,
        sourceReviews: packet.reviews, sourceCaptures: packet.captures || [], sourceExportedAt: packet.exportedAt, repeated: false };
      for (const receipt of packet.receivings || []) {
        if (!plain(receipt) || typeof receipt.packageId !== 'string' || !Array.isArray(receipt.conflicts))
          throw failure('INVALID_RECEIVING_HISTORY', 'Package receiving history is invalid');
        const saved = this.db.prepare('SELECT data FROM received WHERE id=?').get(receipt.packageId);
        if (saved && canonical(JSON.parse(saved.data)) !== canonical(receipt)) {
          conflicts.push({ code: 'RECEIVING_HISTORY_PRESERVED', packageId: receipt.packageId,
            message: 'Existing receiving history was preserved', receivedReceipt: receipt });
        } else if (!saved && receipt.packageId !== packageId)
          this.db.prepare('INSERT INTO received(id,data) VALUES(?,?)').run(receipt.packageId, JSON.stringify(receipt));
      }
      for (const capture of packet.captures || []) {
        if (!plain(capture) || typeof capture.id !== 'string' || !Number.isSafeInteger(capture.revision)
          || capture.revision < 1 || capture.provider !== 'find-tender' || !Array.isArray(capture.pages)
          || !['running', 'complete', 'interrupted'].includes(capture.status)
          || capture.pages.some(page => !plain(page) || !prepared.some(source => source.id === page.sourceId)))
          throw failure('INVALID_CAPTURE_HISTORY', 'Package capture history is invalid');
        const saved = this.db.prepare('SELECT data FROM captures WHERE id=?').get(capture.id);
        if (saved && canonical(JSON.parse(saved.data)) !== canonical(capture))
          conflicts.push({ code: 'CAPTURE_HISTORY_PRESERVED', captureId: capture.id,
            message: 'Existing capture history was preserved', receivedCapture: capture });
        else if (!saved) this.db.prepare('INSERT INTO captures(id,data) VALUES(?,?)').run(capture.id, JSON.stringify(capture));
      }
      this.db.prepare('INSERT INTO received(id,data) VALUES(?,?)').run(packageId, JSON.stringify(value));
      return { value, audit: { packageId, sourceWorkspaceId: packet.workspace?.id, sources: imports.length, reviewConflicts: conflicts.length } };
    }, expectedRevision);
    return { ...this.view(), receiving };
  }
  getReceiving(id) {
    const row = this.db.prepare('SELECT data FROM received WHERE id=?').get(id);
    if (!row) throw failure('RECEIVING_NOT_FOUND', 'Receiving record does not exist', 404);
    return JSON.parse(row.data);
  }
  receivingHistory() { return this.db.prepare('SELECT data FROM received ORDER BY rowid').all().map(row => JSON.parse(row.data)); }
  recordPublication(data) {
    if (!plain(data)) throw failure('INVALID_PUBLICATION', 'Publication metadata must be an object');
    return this._change('merchant.prepared', () => {
      const value = { ...data, id: data.id || randomUUID(), createdAt: now(), operator: this.operator };
      this.db.prepare('INSERT INTO publications(id,data) VALUES(?,?)').run(value.id, JSON.stringify(value));
      return { value, audit: { publicationId: value.id, snapshot: value.snapshot || null } };
    });
  }
  getCapture(id) {
    const row = this.db.prepare('SELECT data FROM captures WHERE id=?').get(id);
    if (!row) throw failure('CAPTURE_NOT_FOUND', 'Source capture does not exist', 404);
    return JSON.parse(row.data);
  }
  saveCapture(capture) {
    if (!plain(capture) || typeof capture.id !== 'string') throw failure('INVALID_CAPTURE', 'Capture requires an identity');
    return this._change('capture.checkpoint', () => {
      const existing = this.db.prepare('SELECT data FROM captures WHERE id=?').get(capture.id);
      const currentRevision = existing ? JSON.parse(existing.data).revision : 0;
      checkRevision(capture.revision, currentRevision, 'capture');
      const value = { ...capture, revision: currentRevision + 1, updatedAt: now() };
      this.db.prepare('INSERT INTO captures(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, JSON.stringify(value));
      return { value, audit: { captureId: value.id, status: value.status, pages: value.pages?.length || 0 } };
    });
  }
  close() { if (!this.closed) { this.closed = true; this.db.close(); } }
}
