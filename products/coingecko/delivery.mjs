// SPDX-License-Identifier: MIT
// Complete customer files over the original CoinGecko archive and restore engine.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, mkdir, realpath, rename, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute, relative, sep } from 'node:path';
import { readProjectArchive } from '../../stellar/scf-starforge-20261009/partners/coingecko-stellar-market/workspace/recovery.mjs';
import { lockPrivateDirectory } from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';

const SCHEMA = 'stellar-forge.coingecko-customer-delivery.v1';
const RECEIVING = 'stellar-forge.coingecko-customer-receiving.v1';
const ARCHIVE = 'market-handover.json.gz';
const MANIFEST = 'delivery.json';
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_FILE = 320 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function need(value, code, message = code) {
  if (!value) throw Object.assign(new Error(message), { code });
}
function text(value, label, maximum = 240) {
  need(typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  'DELIVERY_INPUT_INVALID', label + ' is required.');
  return value;
}
function member(value) {
  need(typeof value === 'string' && value.length <= 1024 &&
    !isAbsolute(value) && !/[\\\u0000-\u001f\u007f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..'),
  'DELIVERY_PATH_INVALID');
  return value;
}
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(path, { create = false } = {}) {
  const root = resolve(text(path, 'Directory', 4096));
  if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(root) === root,
    'DELIVERY_DIRECTORY_INVALID', 'Use an original directory with no symbolic-link parents.');
  if (create && process.platform !== 'win32') need((info.mode & 0o077) === 0 &&
    typeof process.getuid === 'function' && info.uid === process.getuid(),
  'DELIVERY_DIRECTORY_PRIVATE', 'The delivery or receiving directory must be owned by this operator and mode 0700.');
  return root;
}
async function readRegular(path, maximum = MAX_FILE) {
  const named = await lstat(path);
  need(named.isFile() && !named.isSymbolicLink() && named.size <= maximum,
    'DELIVERY_FILE_INVALID', 'Expected a complete regular file: ' + path);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    need(before.isFile() && before.dev === named.dev && before.ino === named.ino && before.size <= maximum,
      'DELIVERY_FILE_CHANGED', path);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    need(bytes.length <= maximum && before.size === after.size && before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs && bytes.length === after.size, 'DELIVERY_FILE_CHANGED', path);
    return bytes;
  } finally { await handle.close(); }
}
async function safeParent(root, path) {
  const pieces = member(path).split('/');
  let parent = root;
  for (const part of pieces.slice(0, -1)) {
    parent = join(parent, part);
    try { await mkdir(parent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(parent);
    need(info.isDirectory() && !info.isSymbolicLink() && await realpath(parent) === parent,
      'DELIVERY_DIRECTORY_INVALID');
  }
  return join(root, ...pieces);
}
async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function publishImmutable(temporary, destination, path, bytes, sha256) {
  try {
    // link creates the final name atomically and never replaces an existing customer file.
    await link(temporary, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = await readRegular(destination);
    need(current.length === bytes && hash(current) === sha256,
      'DELIVERY_OUTPUT_CHANGED', 'Keep the existing customer file; choose a new delivery directory for a different edition: ' + path);
  }
  await syncDirectory(dirname(destination));
}
async function saveImmutable(root, path, bytes) {
  need(bytes instanceof Uint8Array && bytes.length <= MAX_FILE, 'DELIVERY_FILE_TOO_LARGE');
  const destination = await safeParent(root, path), expected = hash(bytes);
  if (await exists(destination)) {
    const current = await readRegular(destination);
    need(current.length === bytes.length && hash(current) === expected,
      'DELIVERY_OUTPUT_CHANGED', 'Keep the existing customer file; choose a new delivery directory for a different edition: ' + path);
    return { path, bytes: bytes.length, sha256: expected };
  }
  const temporary = destination + '.' + randomUUID() + '.partial';
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await publishImmutable(temporary, destination, path, bytes.length, expected);
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return { path, bytes: bytes.length, sha256: expected };
}
async function saveGenerated(root, path, chunks) {
  const destination = await safeParent(root, path), temporary = destination + '.' + randomUUID() + '.partial';
  let handle, bytes = 0;
  const digest = createHash('sha256');
  try {
    handle = await open(temporary, 'wx', 0o600);
    for await (const chunk of chunks) {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      need(data instanceof Uint8Array, 'DELIVERY_GENERATOR_INVALID');
      bytes += data.length; need(bytes <= MAX_FILE, 'DELIVERY_FILE_TOO_LARGE');
      digest.update(data); await handle.writeFile(data);
    }
    await handle.sync(); await handle.close(); handle = null;
    const sha256 = digest.digest('hex');
    await publishImmutable(temporary, destination, path, bytes, sha256);
    return { path, bytes, sha256 };
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function saveCheckpoint(root, name, value) {
  const destination = await safeParent(root, name);
  if (await exists(destination)) await readRegular(destination, 16 * 1024 * 1024);
  const temporary = destination + '.' + randomUUID() + '.next';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(json(value)); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, destination); await syncDirectory(dirname(destination)); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
function lease(root) {
  return lockPrivateDirectory({ directory: root, filename: 'coingecko-product.lock',
    namespace: 'coingecko-product', busyCode: 'DELIVERY_ALREADY_RUNNING', unavailableCode: 'DELIVERY_LOCK_UNAVAILABLE' });
}
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const csvCell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
function* csv(headers, rows) { yield headers.map(csvCell).join(',') + '\r\n'; for (const row of rows) yield row.map(csvCell).join(',') + '\r\n'; }
const cellState = (value, present = true) => !present ? 'missing' : value === null ? 'null' :
  typeof value === 'string' ? 'text' : typeof value;
const cellValue = value => value === null || value === undefined ? '' :
  typeof value === 'object' ? JSON.stringify(value) : String(value);

export function describeCoinGeckoArchive(archive, archiveBytes) {
  const p = archive.payload, counts = {}, basis = {}, families = new Set();
  for (const record of p.records) counts[record.kind] = (counts[record.kind] ?? 0) + 1;
  for (const record of p.records) {
    const v = record.value;
    if (record.kind === 'requests' && typeof v.endpoint === 'string') families.add(v.endpoint);
    if (record.kind === 'captures') basis[v.basis ?? 'unspecified'] = (basis[v.basis ?? 'unspecified'] ?? 0) + 1;
  }
  return { project: { id: p.project.id, name: p.project.name, revision: p.project.revision },
    originalCreatedAt: archive.createdAt, archiveSha256: hash(archiveBytes), archiveBytes: archiveBytes.length,
    payloadSha256: archive.payloadSha256, runtimeSha256: archive.runtimeSha256,
    counts: { ...counts, rows: p.rows.length, files: p.files.length, versions: p.versions.length,
      events: p.events.length, runtimeFiles: archive.runtime.files.length },
    families: [...families].sort(), sourceBases: basis };
}
function report(archive, description) {
  const records = kind => archive.payload.records.filter(record => record.kind === kind).map(record => record.value);
  const table = (head, rows) => rows.length ? '<div class="scroll"><table><thead><tr>' +
    head.map(value => '<th>' + escape(value) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + row.map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>' : '<p class="muted">No retained records in this edition.</p>';
  const full = value => JSON.stringify(value ?? null);
  const links = [['requests.json', 'Requests and exact query definitions'], ['collections.json', 'Ordered collections'],
    ['captures.json', 'Original capture descriptions'], ['snapshots.json', 'Saved research snapshots'],
    ['comparisons.json', 'Saved comparisons'], ['notes.json', 'Research notes'], ['provider-plans.json', 'Provider plans'],
    ['jobs.json', 'Original job history'], ['market-rows.jsonl', 'Every retained source and comparison row'],
    ['market-fields.csv', 'Source fields as exact text'], ['comparison-fields.csv', 'Compared fields and exact deltas'],
    ['source-files.json', 'Original source file index'], ['versions.json', 'All retained record versions'],
    ['events.json', 'Complete operator history'], [ARCHIVE, 'Complete editable project and original source']];
  return Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'self\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>' + escape(description.project.name) + ' — CoinGecko research delivery</title><style>' +
    ':root{font:15px/1.55 system-ui,sans-serif;color:#202020;background:#f3f3f3}body{margin:0}main{max-width:1120px;margin:auto;background:#fff;padding:32px 38px}' +
    'h1{font-size:28px;line-height:1.2;margin:.4em 0}h2{font-size:19px;border-top:1px solid #bbb;padding-top:24px;margin-top:32px}' +
    '.muted{color:#555}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}dl{padding:12px;border:1px solid #bbb;margin:0}dt{font-size:12px;text-transform:uppercase;color:#555}dd{margin:4px 0 0;overflow-wrap:anywhere}' +
    'a{color:#202020;text-decoration:underline;text-underline-offset:3px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccc;padding:10px;overflow-wrap:anywhere;max-width:380px;white-space:pre-wrap}th{background:#eee}' +
    'code{overflow-wrap:anywhere}ul.files{columns:2;padding-left:20px}li{break-inside:avoid;margin-bottom:8px}@media(max-width:650px){main{padding:20px 16px}ul.files{columns:1}h1{font-size:24px}}' +
    '@media print{main{padding:0}.scroll{overflow:visible}a{color:#000}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body><main>' +
    '<p class="muted">CoinGecko market workspace · retained customer edition</p><h1>' + escape(description.project.name) + '</h1>' +
    '<p>This delivery contains the original saved research project. Source observations and provider examples retain their own basis, request and observation time.</p>' +
    '<div class="meta">' + [['Project revision', description.project.revision], ['Archive created', description.originalCreatedAt],
      ['Request families', description.families.join(', ') || 'None'], ['Retained rows', description.counts.rows],
      ['Original source files', description.counts.files], ['Source basis', full(description.sourceBases)]]
      .map(([label, value]) => '<dl><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></dl>').join('') + '</div>' +
    '<h2>Customer files</h2><ul class="files">' + links.map(([path, label]) => '<li><a href="' + path + '">' + escape(label) + '</a></li>').join('') +
    '</ul><p>Use the complete JSON and JSONL files for typed values. CSV preserves source spelling; import its value columns as text so spreadsheet software keeps long numbers and timestamps unchanged.</p>' +
    '<h2>Requests</h2>' + table(['Name', 'Family', 'Path', 'Query'], records('requests').map(v => [v.name, v.endpoint, full(v.path), full(v.query)])) +
    '<h2>Source captures</h2>' + table(['Name', 'Source basis', 'Observed', 'Status', 'Exact request', 'Advertised resource'],
      records('captures').map(v => [v.name, v.basis, v.observedAt, v.httpStatus, v.requestUrl, v.advertisedResourceUrl])) +
    '<h2>Snapshots</h2>' + table(['Name', 'Capture IDs', 'Retained summary'],
      records('snapshots').map(v => [v.name, full(v.captureIds), full(v.summary)])) +
    '<h2>Comparisons</h2>' + table(['Name', 'Baseline', 'Current', 'Retained summary'],
      records('comparisons').map(v => [v.name, v.baselineId, v.currentId, full(v.summary)])) +
    '<h2>Research notes</h2>' + table(['Title', 'Status', 'Assignee', 'Target', 'Note'],
      records('notes').map(v => [v.title ?? v.name, v.status, v.assignee, [v.targetType, v.targetId].filter(Boolean).join(': '), v.text ?? v.body])) +
    '<h2>Open the working project</h2><p>Follow <a href="START_HERE.md">START_HERE.md</a> to receive the full original archive into your private market workspace, then open its original browser interface. Repeating the same receiving operation preserves later recipient work.</p>' +
    '<p class="muted">Original project ' + escape(description.project.id) + '<br>Archive SHA-256 <code>' + escape(description.archiveSha256) +
    '</code><br>All current records, earlier versions, rows, source files and packaged application source remain in the complete archive.</p></main></body></html>\n');
}
function instructions(archive, description) {
  return Buffer.from('# ' + description.project.name + ' — customer delivery\n\n' +
    'Open research.html for the source, request, snapshot, comparison and note overview. ' +
    'The linked JSON/JSONL files contain every retained record and row. sources/ holds each original source blob by SHA-256; source-files.json preserves its original filename, type and file ID.\n\n' +
    '## Receive and continue work\n\nUse your installed CoinGecko selected product and Node 24 or newer:\n\n' +
    '    starforge coingecko-product delivery inspect --directory /absolute/this-delivery\n' +
    '    starforge coingecko-product delivery receive --directory /absolute/this-delivery \\\n' +
    '      --state /absolute/private/recipient-market --actor "Recipient operator" \\\n' +
    '      --operation original-customer-delivery\n' +
    '    starforge coingecko-product workspace --state /absolute/private/recipient-market --port 0\n\n' +
    'The receiving result names the new recipient project. Choose that project in the browser. ' +
    'Keep the same directory, operation, actor and received name when resuming. The original transactional restore creates one project and retains its complete ID mapping; completed retries read its current state and preserve subsequent edits.\n\n' +
    'A customer directory already containing other projects remains usable. The operation adds a separate project. ' +
    'A different archive edition has its own delivery and receiving identity. Existing completed files are never replaced with another edition.\n\n' +
    '## Original source and runtime\n\nThe exact market-handover.json.gz archive contains the original runnable source closure. ' +
    'The source/ directory is that same verified source, with each original path retained. Its source entry is:\n\n' +
    "    node 'source/" + archive.runtime.entry.replaceAll("'", "'\\''") + "' serve --state /absolute/private/recipient-market --port 0\n\n" +
    'For direct source operation, install the declared original dependencies in an ancestor of every source module; ' +
    'the original source guide and runtime-dependencies.json identify the manifests. Prefer the maintained selected runtime, ' +
    'which retains the complete dependency profile and lock. SOURCE_RUNTIME.json records the exact original archive source inventory.\n\n' +
    'The market browser binds to loopback. Existing signer configuration and active native payment ledgers stay with their current operator. ' +
    'The original restore engine keeps previous jobs as historical records. Configure a current buyer profile through the normal workspace only when preparing new work.\n\n' +
    '## Read the delivered research\n\nmarket-fields.csv contains one row per original source field. value_state distinguishes a missing value, null, text, boolean and number. ' +
    'comparison-fields.csv preserves before_present, after_present, original before/after spellings, exact decimal deltas and formatting changes. ' +
    'Every row retains its source pointer and request/capture identity. The complete market-rows.jsonl preserves nested identities, relations and notices without flattening them.\n\n' +
    'Provider examples retain provider_bazaar_example; a delivery date does not change the observation time. ' +
    'Token data network, payment network, original address, market capitalization, FDV and reserve meanings remain separate. ' +
    'The report does not calculate a fresh market price or start a provider request.\n\n' +
    'Original project: ' + description.project.id + '\n\nArchive SHA-256: ' + description.archiveSha256 + '\n');
}

export async function createCoinGeckoDelivery({ archive: archivePath, output } = {}) {
  need(archivePath && output, 'DELIVERY_OPTIONS_REQUIRED', '--archive and --out are required.');
  const archiveBytes = await readRegular(resolve(archivePath), MAX_ARCHIVE);
  const archive = readProjectArchive(archiveBytes), description = describeCoinGeckoArchive(archive, archiveBytes);
  member(archive.runtime.entry);
  need(archive.runtime.files.some(file => file.path === archive.runtime.entry), 'DELIVERY_RUNTIME_ENTRY_MISSING');
  const root = await directory(output, { create: true }), release = await lease(root);
  try {
    if (await exists(join(root, MANIFEST))) {
      const current = await inspectCoinGeckoDelivery({ directory: root });
      need(current.manifest.archive.sha256 === description.archiveSha256, 'DELIVERY_EDITION_CHANGED');
      return { ...current, replayed: true };
    }
    const originalInput = { schema: SCHEMA, archiveSha256: description.archiveSha256, projectId: description.project.id };
    await saveImmutable(root, 'delivery-input.json', json(originalInput));
    const files = [];
    const put = async (path, bytes) => files.push(await saveImmutable(root, path, bytes));
    await put(ARCHIVE, archiveBytes);
    await put('project.json', json(archive.payload.project));
    const names = { requests: 'requests', collections: 'collections', captures: 'captures', snapshots: 'snapshots',
      comparisons: 'comparisons', notes: 'notes', providerPlans: 'provider-plans', jobs: 'jobs', exports: 'earlier-exports' };
    for (const [kind, name] of Object.entries(names))
      await put(name + '.json', json(archive.payload.records.filter(record => record.kind === kind).map(record => record.value)));
    await put('records.json', json(archive.payload.records));
    await put('versions.json', json(archive.payload.versions));
    await put('events.json', json(archive.payload.events));
    files.push(await saveGenerated(root, 'market-rows.jsonl', (function* () {
      for (const row of archive.payload.rows) yield JSON.stringify(row) + '\n';
    })()));
    const captures = new Map(archive.payload.records.filter(record => record.kind === 'captures').map(record => [record.value.id, record.value]));
    function* fields(comparison) {
      for (const { ownerId, value: row } of archive.payload.rows) {
        const compared = Object.hasOwn(row, 'baselineRow') || Object.hasOwn(row, 'currentRow');
        if (comparison !== compared) continue;
        if (compared) {
          for (const field of row.fields ?? []) yield [ownerId, row.id, row.status,
            JSON.stringify(row.identity ?? {}), field.key, field.label, field.beforePresent, field.afterPresent,
            cellState(field.before, field.beforePresent === true), cellValue(field.before),
            cellState(field.after, field.afterPresent === true), cellValue(field.after),
            field.change, field.wireChanged, field.decimalDelta ?? '', field.beforeSourcePointer, field.afterSourcePointer];
        } else {
          const capture = captures.get(row.sourceCaptureId ?? ownerId);
          for (const field of row.fields ?? []) yield [ownerId, row.id, row.kind,
            JSON.stringify(row.identity ?? {}), row.sourceCaptureId, capture?.requestId, capture?.basis, capture?.observedAt,
            field.key, field.label, field.type, cellState(field.value, Object.hasOwn(field, 'value')),
            cellValue(field.value), field.sourcePointer];
        }
      }
    }
    files.push(await saveGenerated(root, 'market-fields.csv', csv(['owner_id','row_id','kind','identity_json','source_capture_id','request_id',
      'source_basis','observed_at','field','label','source_type','value_state','value_text','source_pointer'], fields(false))));
    files.push(await saveGenerated(root, 'comparison-fields.csv', csv(['comparison_id','row_id','row_status','identity_json','field','label',
      'before_present','after_present','before_state','before_text','after_state','after_text','change','wire_changed',
      'decimal_delta','before_source_pointer','after_source_pointer'], fields(true))));
    const originalFiles = archive.payload.files.map(file => ({ ...file, path: 'sources/' + file.sha256 }));
    await put('source-files.json', json(originalFiles));
    const written = new Set();
    for (const file of originalFiles) if (!written.has(file.sha256)) {
      written.add(file.sha256); await put(file.path, Buffer.from(archive.payload.blobs[file.sha256], 'base64'));
    }
    const sourcePaths = new Set();
    for (const file of archive.runtime.files) {
      member(file.path); need(!sourcePaths.has(file.path), 'DELIVERY_DUPLICATE_SOURCE_PATH'); sourcePaths.add(file.path);
      await put('source/' + file.path, Buffer.from(file.contentBase64, 'base64'));
    }
    await put('SOURCE_RUNTIME.json', json({ ...archive.runtime,
      files: archive.runtime.files.map(({ contentBase64, ...file }) => file) }));
    await put('research.html', report(archive, description));
    await put('START_HERE.md', instructions(archive, description));
    files.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = { schema: SCHEMA, originalCreatedAt: archive.createdAt, project: description.project,
      archive: { path: ARCHIVE, bytes: archiveBytes.length, sha256: description.archiveSha256,
        payloadSha256: archive.payloadSha256, runtimeSha256: archive.runtimeSha256 },
      counts: description.counts, families: description.families, sourceBases: description.sourceBases,
      files, report: 'research.html', customerGuide: 'START_HERE.md' };
    await saveImmutable(root, MANIFEST, json(manifest));
    return await inspectCoinGeckoDelivery({ directory: root });
  } finally { await release(); }
}

export async function inspectCoinGeckoDelivery({ directory: selectedDirectory } = {}) {
  const root = await directory(selectedDirectory), manifestBytes = await readRegular(join(root, MANIFEST), 8 * 1024 * 1024);
  const manifest = JSON.parse(manifestBytes);
  need(manifest?.schema === SCHEMA && plain(manifest.archive) && manifest.archive.path === ARCHIVE &&
    hex(manifest.archive.sha256) && Array.isArray(manifest.files) && manifest.files.length <= 106000,
  'DELIVERY_MANIFEST_INVALID');
  const seen = new Set();
  for (const file of manifest.files) {
    member(file.path); need(!seen.has(file.path) && hex(file.sha256) && Number.isSafeInteger(file.bytes) &&
      file.bytes >= 0 && file.bytes <= MAX_FILE, 'DELIVERY_MANIFEST_INVALID'); seen.add(file.path);
    const path = join(root, file.path);
    need(await realpath(path) === path, 'DELIVERY_FILE_SYMLINK');
    const bytes = await readRegular(path);
    need(bytes.length === file.bytes && hash(bytes) === file.sha256, 'DELIVERY_FILE_HASH_MISMATCH', file.path);
  }
  need(seen.has(ARCHIVE) && seen.has('source-files.json') && seen.has('research.html'), 'DELIVERY_INCOMPLETE');
  const archiveBytes = await readRegular(join(root, ARCHIVE), MAX_ARCHIVE);
  need(archiveBytes.length === manifest.archive.bytes && hash(archiveBytes) === manifest.archive.sha256,
    'DELIVERY_ARCHIVE_HASH_MISMATCH');
  const archive = readProjectArchive(archiveBytes), actual = describeCoinGeckoArchive(archive, archiveBytes);
  need(manifest.archive.payloadSha256 === archive.payloadSha256 && manifest.archive.runtimeSha256 === archive.runtimeSha256 &&
    JSON.stringify(manifest.project) === JSON.stringify(actual.project) &&
    JSON.stringify(manifest.counts) === JSON.stringify(actual.counts) &&
    JSON.stringify(manifest.families) === JSON.stringify(actual.families) &&
    JSON.stringify(manifest.sourceBases) === JSON.stringify(actual.sourceBases), 'DELIVERY_ARCHIVE_IDENTITY_MISMATCH');
  const byPath = new Map(manifest.files.map(file => [file.path, file]));
  for (const file of archive.payload.files) {
    const item = byPath.get('sources/' + file.sha256);
    need(item?.sha256 === file.sha256 && item.bytes === file.bytes, 'DELIVERY_ORIGINAL_SOURCE_MISSING');
  }
  for (const file of archive.runtime.files) {
    const item = byPath.get('source/' + member(file.path));
    need(item?.sha256 === file.sha256 && item.bytes === file.bytes, 'DELIVERY_RUNTIME_SOURCE_MISSING');
  }
  return { status: 'VERIFIED', directory: root, manifest, manifestSha256: hash(manifestBytes),
    deliveredFiles: manifest.files.length, deliveredBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) };
}

export async function receiveCoinGeckoDelivery({ directory: selectedDirectory, state, actor, operation,
  name } = {}) {
  text(actor, 'Receiving operator'); text(operation, 'Original operation', 200);
  const delivered = await inspectCoinGeckoDelivery({ directory: selectedDirectory });
  const archiveBytes = await readRegular(join(delivered.directory, ARCHIVE), MAX_ARCHIVE);
  need(hash(archiveBytes) === delivered.manifest.archive.sha256, 'DELIVERY_ARCHIVE_HASH_MISMATCH');
  const root = await directory(state, { create: true });
  const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)); };
  need(!inside(root, delivered.directory) && !inside(delivered.directory, root),
    'DELIVERY_RECEIVING_DIRECTORY_OVERLAP', 'Use a separate private receiving directory.');
  // Use the same original operator lease as the browser and CLI.
  const { acquireWorkspaceLease } = await import('../../stellar/scf-starforge-20261009/partners/coingecko-stellar-market/workspace/server.mjs');
  const release = await acquireWorkspaceLease(root);
  let model;
  try {
    const opId = 'coingecko-delivery-' + hash(Buffer.from(operation)).slice(0,40);
    const checkpointName = 'product-receiving/' + opId + '.json';
    const receivedName = name ?? delivered.manifest.project.name.slice(0,220) + ' — received';
    text(receivedName, 'Received project name');
    const input = { operation, opId, actor, name: receivedName, archiveSha256: delivered.manifest.archive.sha256,
      manifestSha256: delivered.manifestSha256, originalProjectId: delivered.manifest.project.id, stateDirectory: root };
    const checkpointFile = join(root, checkpointName);
    let checkpoint = await exists(checkpointFile) ? JSON.parse((await readRegular(checkpointFile, 16 * 1024 * 1024)).toString('utf8')) : null;
    need(!checkpoint || checkpoint.schema === RECEIVING && JSON.stringify(checkpoint.input) === JSON.stringify(input),
      'DELIVERY_RECEIVING_SELECTION_CHANGED', 'Continue the original archive, operation, actor and received name.');
    const database = join(root, 'market.sqlite');
    if (checkpoint?.database) {
      const info = await lstat(database);
      need(info.isFile() && !info.isSymbolicLink() && info.dev === checkpoint.database.dev && info.ino === checkpoint.database.ino,
        'DELIVERY_RECEIVING_DATABASE_CHANGED');
    }
    const { MarketModel } = await import('../../stellar/scf-starforge-20261009/partners/coingecko-stellar-market/workspace/model.mjs');
    model = new MarketModel(root);
    const info = await lstat(database);
    checkpoint ??= { schema: RECEIVING, input, database: { dev: info.dev, ino: info.ino },
      startedAt: new Date().toISOString(), state: 'RECEIVING' };
    await saveCheckpoint(root, checkpointName, checkpoint);
    const originalRequest = { opId, actor, name: receivedName, contentBase64: archiveBytes.toString('base64') };
    const result = model.restore(originalRequest);
    need(result?.value?.sourceArchiveSha256 === input.archiveSha256 && result.value?.project?.id,
      'DELIVERY_RESTORE_IDENTITY_MISMATCH');
    const recipientProjectId = result.value.project.id;
    const archive = readProjectArchive(archiveBytes), mapping = result.value.mapping;
    const sourceChecks = [];
    for (const file of archive.payload.files) {
      const recipientFileId = mapping.files[file.id], bytes = model.store.fileBytes(recipientFileId);
      need(bytes.length === file.bytes && hash(bytes) === file.sha256, 'DELIVERY_RECEIVED_SOURCE_MISMATCH');
      sourceChecks.push({ sourceFileId: file.id, recipientFileId, bytes: bytes.length, sha256: file.sha256 });
    }
    const current = model.project(recipientProjectId);
    checkpoint = { ...checkpoint, state: 'RECEIVED', completedAt: checkpoint.completedAt ?? new Date().toISOString(),
      originalProjectId: input.originalProjectId, recipientProjectId, originalRestoreRevision: result.revision,
      sourceChecks, mapping, restoredJobMode: 'historical' };
    await saveCheckpoint(root, checkpointName, checkpoint);
    return { status: 'RECEIVED', replayed: result.replayed === true, stateDirectory: root,
      originalProjectId: input.originalProjectId, recipientProjectId, originalRestoreRevision: result.revision,
      currentProject: current.project, currentCounts: current.counts, originalSourcesVerified: sourceChecks.length,
      archiveSha256: input.archiveSha256, checkpoint: checkpointFile, laterRecipientWorkPreserved: true };
  } finally { model?.close(); await release(); }
}
