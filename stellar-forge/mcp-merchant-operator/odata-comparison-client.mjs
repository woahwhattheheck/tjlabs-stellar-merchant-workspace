// MIT. Remote original comparison review, publication, full download and receiving.
import { join, resolve, relative, isAbsolute, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createRetainedDownload, openMerchantFileClient } from './retained-download.mjs';

export const ODATA_COMPARISON_DOWNLOAD_SCHEMA = 'stellar-forge.odata-comparison-download.v1';
export const ODATA_COMPARISON_RECEIVING_SCHEMA = 'stellar-forge.odata-comparison-receiving.v1';
export const ODATA_COMPARISON_REVIEW_REQUEST_SCHEMA = 'stellar-forge.odata-comparison-review-request.v1';
const STATE_SCHEMA = 'stellar-forge.odata-comparison-download-state.v1';
const SCOPE_SCHEMA = 'stellar-forge.odata-comparison-download-scope.v1';
const DOCUMENT_SCHEMA = 'stellar-forge.analysis-source-document.v1';
const MANIFEST = 'source.json', TOOL = 'odata_comparison_original';
const MAX_MANIFEST = 1024 * 1024, MAX_SOURCE = 256 * 1024 * 1024, MAX_ORIGINAL = 32 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FILE = /^files\/([a-f0-9]{64})\.(json|csv|bin)$/;
const REVIEW_KEYS = ['requestId', 'expectedRevision', 'scope', 'entityKey', 'field', 'status', 'actor', 'note'];
const ROW_STATUSES = ['changed', 'unchanged', 'before_only', 'after_only'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), { code: 'ODATA_COMPARISON_CLIENT_' + code });
const need = (condition, code, message) => { if (!condition) throw fail(code, message); };
function exact(value, allowed, required = []) {
  need(plain(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)), 'ARGUMENTS', 'Use the complete original request fields without unknown members.');
}
function checksum(value) {
  need(typeof value === 'string' && HASH.test(value), 'IDENTITY', 'Select the exact original SHA-256.');
  return value;
}
function nativeId(value, label) {
  need(typeof value === 'string' && ID.test(value), 'SELECTION', 'Select the original ' + label + ' identifier.');
  return value;
}
function serviceSelection(input) {
  need(typeof input.workspace === 'string' && ALIAS.test(input.workspace), 'SELECTION',
    'Select the original host workspace alias.');
  return { workspace: input.workspace, liveServiceId: nativeId(input.liveServiceId, 'live service') };
}
function selection(input) {
  return { ...serviceSelection(input), comparisonId: nativeId(input.comparisonId, 'comparison') };
}
function editionSelection(input) {
  return { ...selection(input), editionId: checksum(input.editionId) };
}
function integer(value, low, high, label) {
  need(Number.isSafeInteger(value) && value >= low && value <= high, 'ARGUMENTS',
    label + ' is outside its original limit.');
  return value;
}
function text(value, maximum, label) {
  need(typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && value.isWellFormed() && !value.includes('\0'), 'ARGUMENTS',
    'Provide the complete original ' + label + ' within its declared length.');
  return value;
}
function identity(record, maximum) {
  const match = typeof record?.path === 'string' && record.path.match(FILE);
  need(plain(record) && match && match[1] === record.sha256 && HASH.test(record.sha256) &&
    Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes <= maximum &&
    typeof record.contentType === 'string' && record.contentType.length > 0 && record.contentType.length <= 160,
    'DOCUMENT', 'Retain each content-addressed original with its complete size and digest.');
  return { name: record.path, bytes: record.bytes, sha256: record.sha256, contentType: record.contentType };
}
function parseSource(bytes, expectedSha256) {
  checksum(expectedSha256);
  need(bytes.length > 0 && bytes.length <= MAX_MANIFEST && sha(bytes) === expectedSha256,
    'DOCUMENT_CHANGED', 'The original source document differs from its selected digest.');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw fail('DOCUMENT', 'Use the original UTF-8 JSON source document.'); }
  need(plain(value) && value.schema === DOCUMENT_SCHEMA && value.complete === true && value.format === 'csv' &&
    typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 160 &&
    Array.isArray(value.originals) && value.originals.length >= 4 && value.originals.length <= 32 &&
    plain(value.provenance) && plain(value.provenance.transform), 'DOCUMENT',
    'Select a complete original comparison analytical source document.');
  const document = identity(value.document, 128 * 1024 * 1024);
  need(value.document.path === 'files/' + value.document.sha256 + '.csv' &&
    value.document.contentType === 'text/csv; charset=utf-8', 'DOCUMENT',
    'Retain the original comparison CSV and its declared content type.');
  const roles = new Map(), files = new Map([[document.name, document]]);
  for (const record of value.originals) {
    const file = identity(record, MAX_ORIGINAL);
    need(typeof record.role === 'string' && !roles.has(record.role) &&
      (['comparison-manifest', 'comparison-reviews', 'comparison-transform'].includes(record.role) ||
        /^source-packet-[0-9]{4}$/.test(record.role)), 'DOCUMENT',
      'Retain the comparison manifest, complete reviews, original transformation and ordered source packets once.');
    roles.set(record.role, record);
    const prior = files.get(file.name);
    need(!prior || prior.bytes === file.bytes && prior.sha256 === file.sha256 && prior.contentType === file.contentType,
      'DOCUMENT', 'The source repeats a retained file with different original bytes.');
    files.set(file.name, file);
  }
  const original = roles.get('comparison-manifest'), reviews = roles.get('comparison-reviews'),
    transform = roles.get('comparison-transform');
  need(original?.contentType === 'application/json' && original.bytes > 0 &&
    reviews?.contentType === 'application/json' && reviews.bytes > 0 &&
    transform?.contentType === 'text/javascript; charset=utf-8' && transform.bytes > 0 &&
    value.provenance.transform.sha256 === transform.sha256, 'DOCUMENT',
    'The complete native manifest, review history and exact transformation must accompany this source.');
  const packets = [...roles.keys()].filter(role => role.startsWith('source-packet-')).sort();
  need(packets.length + 3 === roles.size && packets.length > 0 &&
    packets.every((role, index) => role === 'source-packet-' + String(index + 1).padStart(4, '0') &&
      roles.get(role).contentType === 'application/gzip'), 'DOCUMENT',
    'Retain the complete ordered compressed comparison source packets.');
  need([...files.values()].reduce((total, file) => total + file.bytes, 0) <= MAX_SOURCE,
    'DOCUMENT_LIMIT', 'The complete original comparison source exceeds 256 MiB.');
  // This is the original publisher's formatted two-field edition identity.
  const editionId = sha(Buffer.from(JSON.stringify({
    comparisonSha256: original.sha256, reviewSha256: reviews.sha256
  }, null, 2) + '\n'));
  return { ...value, exportId: expectedSha256, files: [...files.values()],
    comparisonSha256: original.sha256, reviewSha256: reviews.sha256, editionId };
}
function describe(source) {
  return { title: source.title, format: source.format, comparisonSha256: source.comparisonSha256,
    reviewSha256: source.reviewSha256, editionId: source.editionId };
}
function sourceSummary(source, sourceSha256) {
  return { schema: source.schema, title: source.title, format: source.format, sourceSha256,
    comparisonSha256: source.comparisonSha256, reviewSha256: source.reviewSha256, editionId: source.editionId,
    files: source.files.length, bytes: source.files.reduce((total, file) => total + file.bytes, 0),
    originalPackets: source.originals.length - 3 };
}
function scopedEndpoint(endpoint, selected) {
  const value = JSON.stringify({ schema: SCOPE_SCHEMA, endpoint, ...selected });
  need(value.length <= 4096, 'ENDPOINT', 'Keep the endpoint and original edition selection within the retained identity limit.');
  return value;
}
function restoredScope(endpoint) {
  let value;
  try { value = JSON.parse(endpoint); } catch { throw fail('DOWNLOAD_CHANGED', 'The original download scope is unavailable.'); }
  need(value?.schema === SCOPE_SCHEMA && typeof value.endpoint === 'string' && value.endpoint.length > 0,
    'DOWNLOAD_CHANGED', 'The saved download has no original merchant endpoint.');
  return { endpoint: value.endpoint, ...editionSelection(value) };
}
async function originalClient(options) {
  const { client, url, tokenEnv, environment, signal } = options;
  if (client !== undefined) {
    need(url === undefined && plain(client) && typeof client.call === 'function' &&
      typeof client.endpoint === 'string' && client.endpoint.length > 0 && client.endpoint.length <= 3072 &&
      !/[\0\r\n]/.test(client.endpoint), 'ENDPOINT', 'Select one original MCP client or its authenticated HTTP endpoint.');
    return { endpoint: client.endpoint, call: client.call.bind(client) };
  }
  return openMerchantFileClient({ url, tokenEnv, environment, signal, errorPrefix: 'ODATA',
    clientName: 'starforge-odata-comparison-customer' });
}
async function originalSelection(options, choose = selection) {
  const selected = choose(options), client = await originalClient(options);
  await client.call('merchant_odata_open', { workspace: selected.workspace });
  return { client, selected };
}
function sameService(value, selected) {
  need(plain(value) && value.workspace === selected.workspace && value.liveServiceId === selected.liveServiceId,
    'SELECTION_CHANGED', 'The merchant returned another original workspace or live service.');
}
function sameComparison(value, selected, record = false) {
  sameService(value, selected);
  need((record ? value.id : value.comparisonId) === selected.comparisonId &&
    (value.comparisonId === undefined || value.comparisonId === selected.comparisonId),
    'SELECTION_CHANGED', 'The merchant returned another original comparison.');
}
function originalPage(values, page, offset, limit) {
  need(Array.isArray(values) && values.length <= limit && plain(page) && page.offset === offset && page.limit === limit &&
    Number.isSafeInteger(page.total) && page.total >= 0 &&
    page.nextOffset === (offset + values.length < page.total ? offset + values.length : null) &&
    (offset >= page.total ? values.length === 0 : values.length === Math.min(limit, page.total - offset)),
    'PAGE_CHANGED', 'The original history page has a different offset, count or continuation.');
}
function historyPage(options) {
  return { offset: integer(options.offset ?? 0, 0, Number.MAX_SAFE_INTEGER, 'History offset'),
    limit: integer(options.limit ?? 50, 1, 100, 'History page size') };
}
function checkedView(result, selected, offset = 0, limit = 50) {
  sameComparison(result, selected, true);
  checksum(result.manifestSha256);
  need(result.schema === 'stellar-forge.odata-live-comparison.v1' && result.status === 'COMPLETE' &&
    plain(result.selection) && plain(result.counts) && plain(result.reviews) && plain(result.pagination),
    'COMPARISON_CHANGED', 'The merchant did not return the original complete comparison.');
  integer(result.reviews.revision, 0, Number.MAX_SAFE_INTEGER, 'Review revision');
  for (const [name, values] of [['files', result.files], ['retainedFiles', result.retainedFiles],
    ['reviews.current', result.reviews.current], ['reviews.history', result.reviews.history]]) {
    if (values !== undefined) originalPage(values, result.pagination[name], offset, limit);
  }
  return result;
}

/** Page the original saved comparisons, including interrupted selections. */
export async function listMerchantODataComparisons(options = {}) {
  const { offset, limit } = historyPage(options), { client, selected } = await originalSelection(options, serviceSelection);
  const result = await client.call('merchant_odata_live_comparisons', { ...selected, offset, limit });
  sameService(result, selected); originalPage(result.comparisons, result.page, offset, limit);
  return result;
}
/** Inspect each original history/file page using its own returned continuation. */
export async function inspectMerchantODataComparison(options = {}) {
  const { offset, limit } = historyPage(options), { client, selected } = await originalSelection(options);
  const result = await client.call('merchant_odata_live_comparison', { ...selected, offset, limit });
  return checkedView(result, selected, offset, limit);
}
/** Page actual frozen source editions using the retained-file inventory's continuation. */
export async function listMerchantODataComparisonEditions(options = {}) {
  const result = await inspectMerchantODataComparison(options), selected = selection(options);
  const files = result.retainedFiles;
  need(Array.isArray(files) && plain(result.pagination.retainedFiles), 'EDITION_FILES',
    'Inspect the original retained-file inventory before selecting a published edition.');
  const editions = [];
  for (const file of files) {
    const match = typeof file.path === 'string' && file.path.match(/^editions\/([a-f0-9]{64})\/source\.json$/);
    if (!match) continue;
    checksum(file.sha256); integer(file.bytes, 1, MAX_MANIFEST, 'Published source bytes');
    editions.push({ editionId: match[1], bytes: file.bytes, sha256: file.sha256, manifest: {
      path: file.path, bytes: file.bytes, sha256: file.sha256, tool: 'merchant_odata_file',
      arguments: { workspace: selected.workspace, kind: 'live-comparison', id: selected.liveServiceId,
        recordId: selected.comparisonId, filename: file.path, expectedSha256: file.sha256 }
    } });
  }
  return { ...selected, comparisonSha256: result.manifestSha256, reviewRevision: result.reviews.revision,
    editions, page: result.pagination.retainedFiles, pageKind: 'retainedFiles' };
}
function creationInput(options) {
  const input = {};
  for (const key of ['beforeCollectionId', 'afterCollectionId']) input[key] = nativeId(options[key], key);
  for (const key of ['expectedBeforeSha256', 'expectedAfterSha256']) input[key] = checksum(options[key]);
  input.title = text(options.title, 160, 'comparison title');
  need(!/[\x00-\x1f]/.test(input.title), 'ARGUMENTS', 'Keep control characters out of the comparison title.');
  if (options.fields !== undefined) {
    need(Array.isArray(options.fields) && options.fields.length > 0 && options.fields.length <= 64 &&
      new Set(options.fields).size === options.fields.length &&
      options.fields.every(field => typeof field === 'string' && field.length > 0 && field.length <= 240),
      'ARGUMENTS', 'Choose up to 64 distinct original selected field paths.');
    input.fields = [...options.fields];
  }
  if (options.limits !== undefined) {
    const maxima = { maxInputBytes: 512 * 1024 * 1024, maxOutputBytes: 128 * 1024 * 1024, maxCells: 1000000 };
    exact(options.limits, Object.keys(maxima));
    input.limits = Object.fromEntries(Object.entries(options.limits).map(([key, value]) =>
      [key, integer(value, 1, maxima[key], key)]));
  }
  return input;
}
/** The caller keeps this comparison ID and exact inspected pair across an uncertain reply. */
export async function createMerchantODataComparison(options = {}) {
  const input = creationInput(options), { client, selected } = await originalSelection(options);
  const result = checkedView(await client.call('merchant_odata_live_comparison_create', { ...selected, ...input }), selected);
  need(result.selection.before?.collectionSha256 === input.expectedBeforeSha256 &&
    result.selection.after?.collectionSha256 === input.expectedAfterSha256 && result.selection.title === input.title,
    'PAIR_CHANGED', 'The created comparison returned another original source pair or title.');
  return result;
}
/** Page original changed cells or joined entities, preserving raw source and entity keys. */
export async function readMerchantODataComparisonRows(options = {}) {
  const { offset, limit } = historyPage(options), kind = options.kind ?? 'cells', status = options.status;
  need(['cells', 'entities'].includes(kind) && (status === undefined || ROW_STATUSES.includes(status)), 'ARGUMENTS',
    'Choose original cells or entities and an optional native entity status.');
  const { client, selected } = await originalSelection(options);
  const result = await client.call('merchant_odata_live_comparison_rows', { ...selected, offset, limit, kind,
    ...(status === undefined ? {} : { status }) });
  sameComparison(result, selected); checksum(result.comparisonSha256);
  need(result.kind === kind && result.offset === offset && Array.isArray(result.rows), 'ROWS_CHANGED',
    'The original row page differs from the selected comparison and kind.');
  originalPage(result.rows, { offset: result.offset, limit, total: result.total, nextOffset: result.nextOffset }, offset, limit);
  return result;
}
function reviewInput(value) {
  exact(value, REVIEW_KEYS, ['requestId', 'expectedRevision', 'scope', 'status', 'actor', 'note']);
  need(typeof value.requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value.requestId),
    'ARGUMENTS', 'Retain the original review request ID.');
  integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER, 'Review revision');
  need(['comparison', 'entity', 'column', 'cell'].includes(value.scope) &&
    ['accepted', 'investigate', 'excluded', 'note'].includes(value.status), 'ARGUMENTS',
    'Choose a complete original review scope and decision.');
  const usesKey = ['entity', 'cell'].includes(value.scope), usesField = ['column', 'cell'].includes(value.scope);
  need(usesKey ? typeof value.entityKey === 'string' && Buffer.byteLength(value.entityKey) <= 2097152 :
    value.entityKey === undefined || value.entityKey === null, 'ARGUMENTS',
    'Use the exact original entity key only for an entity or cell review.');
  need(usesField ? typeof value.field === 'string' && value.field.length > 0 :
    value.field === undefined || value.field === null, 'ARGUMENTS',
    'Use the original selected field only for a column or cell review.');
  text(value.actor, 160, 'reviewer'); text(value.note, 8000, 'review note');
  return { ...value };
}
/** Sends one retained request. There is no automatic new request ID or write retry. */
export async function reviewMerchantODataComparison(options = {}) {
  need((options.request === undefined) !== (options.reviewRequest === undefined), 'ARGUMENTS',
    'Select one complete review request or one host-declared pinned review alias.');
  let input;
  if (options.reviewRequest !== undefined) {
    need(typeof options.reviewRequest === 'string' && ALIAS.test(options.reviewRequest), 'ARGUMENTS',
      'Choose the host-declared review request alias.');
    input = { reviewRequest: options.reviewRequest };
  } else input = reviewInput(options.request);
  const { client, selected } = await originalSelection(options);
  const result = await client.call('merchant_odata_live_comparison_review', { ...selected, ...input });
  sameComparison(result, selected); checksum(result.comparisonSha256);
  need(plain(result.review) && typeof result.reused === 'boolean', 'REVIEW_CHANGED', 'The merchant returned no saved original review.');
  integer(result.review.version, 1, Number.MAX_SAFE_INTEGER, 'Saved review version');
  integer(result.reviewRevision, result.review.version, Number.MAX_SAFE_INTEGER, 'Current review revision');
  if (input.reviewRequest !== undefined) {
    need(result.selectedInput?.alias === input.reviewRequest && HASH.test(result.selectedInput.sha256 ?? '') &&
      Number.isSafeInteger(result.selectedInput.bytes) && result.selectedInput.bytes > 0 && result.selectedInput.bytes <= 16 * 1024 * 1024,
      'REVIEW_CHANGED', 'The saved review did not retain its selected host input.');
  } else {
    for (const key of ['requestId', 'scope', 'status', 'actor', 'note'])
      need(result.review[key] === input[key], 'REVIEW_CHANGED', 'The saved reviewer request changed its original ' + key + '.');
    for (const key of ['entityKey', 'field'])
      need(result.review[key] === (input[key] ?? null), 'REVIEW_CHANGED', 'The saved review selected another original ' + key + '.');
  }
  return result;
}
/** Freeze exactly the inspected review revision and retain the returned edition and source SHA. */
export async function publishMerchantODataComparison(options = {}) {
  const expectedRevision = integer(options.expectedRevision, 0, Number.MAX_SAFE_INTEGER, 'Review revision');
  const { client, selected } = await originalSelection(options);
  const result = await client.call('merchant_odata_live_comparison_publish', { ...selected, expectedRevision });
  sameComparison(result, selected); checksum(result.editionId); checksum(result.sha256); checksum(result.comparisonSha256);
  integer(result.bytes, 1, MAX_MANIFEST, 'Published source bytes');
  need(result.reviewRevision === expectedRevision && result.manifest?.path === 'editions/' + result.editionId + '/source.json' &&
    result.manifest.sha256 === result.sha256 && result.manifest.bytes === result.bytes && Array.isArray(result.files),
    'PUBLICATION_CHANGED', 'The publication differs from the original selected review revision.');
  return result;
}
/** Receive a pinned complete source through the original destination merchant service. */
export async function restoreMerchantODataComparison(options = {}) {
  const expectedSha256 = checksum(options.expectedSha256), input = { expectedSha256 };
  if (options.sourceDocument !== undefined) {
    need(typeof options.sourceDocument === 'string' && ALIAS.test(options.sourceDocument) &&
      ['sourceWorkspace', 'sourceLiveServiceId', 'sourceComparisonId', 'sourceEditionId'].every(key => options[key] === undefined),
      'ARGUMENTS', 'Select one host-declared complete comparison source alias.');
    input.sourceDocument = options.sourceDocument;
  } else {
    if (options.sourceWorkspace !== undefined) {
      need(typeof options.sourceWorkspace === 'string' && ALIAS.test(options.sourceWorkspace), 'ARGUMENTS',
        'Select an original source workspace alias.');
      input.sourceWorkspace = options.sourceWorkspace;
    }
    if (options.sourceLiveServiceId !== undefined) input.sourceLiveServiceId = nativeId(options.sourceLiveServiceId, 'source service');
    input.sourceComparisonId = nativeId(options.sourceComparisonId, 'source comparison');
    input.sourceEditionId = checksum(options.sourceEditionId);
  }
  const { client, selected } = await originalSelection(options);
  const result = checkedView(await client.call('merchant_odata_live_comparison_restore', { ...selected, ...input }), selected);
  need(result.restoredFrom?.sha256 === expectedSha256 && result.selectedSource?.sha256 === expectedSha256,
    'RESTORE_CHANGED', 'The destination received another original source edition.');
  if (input.sourceDocument !== undefined) need(result.selectedSource.sourceDocument === input.sourceDocument,
    'RESTORE_CHANGED', 'The destination received another declared source alias.');
  else need(result.selectedSource.sourceWorkspace === (input.sourceWorkspace ?? selected.workspace) &&
    result.selectedSource.sourceLiveServiceId === (input.sourceLiveServiceId ?? selected.liveServiceId) &&
    result.selectedSource.sourceComparisonId === input.sourceComparisonId && result.selectedSource.sourceEditionId === input.sourceEditionId,
    'RESTORE_CHANGED', 'The destination received another original published source selection.');
  return result;
}

async function sourceClient(options) {
  const expectedSha256 = checksum(options.expectedSha256);
  need((options.source === undefined) === (options.sourceRevision === undefined), 'ARGUMENTS',
    'Supply the actual Analysis source name and revision together.');
  if (options.source !== undefined) {
    need(typeof options.source === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(options.source), 'ARGUMENTS',
      'Use the actual registered Analysis source name.');
    integer(options.sourceRevision, 1, Number.MAX_SAFE_INTEGER, 'Analysis source revision');
  }
  const { client, selected } = await originalSelection(options, editionSelection);
  const result = await client.call('merchant_odata_live_comparison_source', { ...selected, expectedSha256,
    ...(options.source === undefined ? {} : { source: options.source, sourceRevision: options.sourceRevision }) });
  sameComparison(result, selected); checksum(result.comparisonSha256);
  need(result.editionId === selected.editionId && result.manifest?.sha256 === expectedSha256,
    'SOURCE_CHANGED', 'The merchant returned another explicitly published original edition.');
  integer(result.manifest.bytes, 1, MAX_MANIFEST, 'Source document bytes');
  need(Array.isArray(result.files) && result.files.length >= 5 && result.files.length <= 34,
    'SOURCE_FILES', 'The merchant must declare every original comparison source file.');
  const prefix = 'editions/' + selected.editionId + '/', remoteFiles = new Map();
  for (const file of result.files) {
    const name = typeof file?.path === 'string' && file.path.startsWith(prefix) ? file.path.slice(prefix.length) : '';
    const match = name.match(FILE);
    need((name === MANIFEST || match && match[1] === file.sha256) &&
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= MAX_SOURCE && HASH.test(file.sha256 ?? '') &&
      !remoteFiles.has(name), 'SOURCE_FILES', 'The merchant returned a conflicting or foreign original edition file.');
    const args = file.arguments;
    need(file.tool === 'merchant_odata_file' && plain(args) && args.workspace === selected.workspace &&
      args.kind === 'live-comparison' && args.id === selected.liveServiceId && args.recordId === selected.comparisonId &&
      args.filename === file.path && args.expectedSha256 === file.sha256, 'SOURCE_FILES',
      'A retained file reference belongs to another comparison or published edition.');
    remoteFiles.set(name, { name, bytes: file.bytes, sha256: file.sha256, remote: file.path });
  }
  const manifest = remoteFiles.get(MANIFEST);
  need(manifest && result.manifest.path === prefix + MANIFEST && manifest.bytes === result.manifest.bytes &&
    manifest.sha256 === expectedSha256, 'SOURCE_FILES', 'The original source manifest reference is missing.');
  const parseManifest = (bytes, exportId) => {
    const source = parseSource(bytes, exportId);
    need(source.comparisonSha256 === result.comparisonSha256 && source.editionId === selected.editionId &&
      source.files.length + 1 === remoteFiles.size && source.files.every(file => {
        const original = remoteFiles.get(file.name);
        return original && original.bytes === file.bytes && original.sha256 === file.sha256;
      }), 'SOURCE_FILES_CHANGED', 'The exact source document differs from the selected edition or complete file inventory.');
    return source;
  };
  const adapter = {
    endpoint: scopedEndpoint(client.endpoint, selected),
    async call(name, args, requestOptions) {
      need(args.exportId === expectedSha256, 'SOURCE_CHANGED', 'Retain the same source digest for every original file request.');
      if (name === TOOL + '_manifest') return { state: 'MANIFEST_RETAINED', exportId: expectedSha256,
        manifestFile: { name: MANIFEST, bytes: manifest.bytes, sha256: expectedSha256 } };
      if (name === TOOL + '_file_release') {
        const result = await client.call('merchant_odata_file_release', { workspace: selected.workspace, readId: args.readId }, requestOptions);
        need(result?.workspace === selected.workspace && result.readId === args.readId && result.released === true,
          'READ_RELEASE', 'The original reader did not return its selected release.');
        return result;
      }
      need(name === TOOL + '_file' && args.expectedManifestSha256 === expectedSha256,
        'SOURCE_CHANGED', 'Select the original complete source operation and reviewed digest.');
      const file = remoteFiles.get(args.file);
      need(file && args.expectedSha256 === file.sha256, 'FILE_CHANGED', 'Choose a file declared by the original published source.');
      const result = await client.call('merchant_odata_file', { workspace: selected.workspace, kind: 'live-comparison',
        id: selected.liveServiceId, recordId: selected.comparisonId, filename: file.remote, expectedSha256: file.sha256,
        offset: args.offset, limit: args.limit, ...(args.readId ? { readId: args.readId } : {}) }, requestOptions);
      need(result?.file?.name === basename(file.remote) && result.file.bytes === file.bytes && result.file.sha256 === file.sha256,
        'FILE_CHANGED', 'The retained reader returned another original file.');
      return { ...result, exportId: expectedSha256, manifestSha256: expectedSha256, file: { ...result.file, name: file.name } };
    }
  };
  if (options.source !== undefined) need(result.analysisInput?.source === options.source &&
    result.analysisInput.source_revision === options.sourceRevision, 'MAPPING_CHANGED',
    'The mapping selected another registered Analysis source revision.');
  return { adapter, parseManifest, sourceSha256: expectedSha256, selected, endpoint: client.endpoint,
    original: { comparisonSha256: result.comparisonSha256 },
    ...(result.analysisInput === undefined ? {} : { analysisInput: result.analysisInput }) };
}
function downloader(parseManifest = parseSource) {
  return createRetainedDownload({ manifestName: MANIFEST, parseManifest, maximumBytes: MAX_SOURCE,
    maximumManifestBytes: MAX_MANIFEST, maximumCheckpointBytes: MAX_MANIFEST,
    stateSchema: STATE_SCHEMA, resultSchema: ODATA_COMPARISON_DOWNLOAD_SCHEMA, toolPrefix: TOOL, errorPrefix: 'ODATA',
    clientName: 'starforge-odata-comparison-customer', validateExportId: checksum, nestedFiles: true, describe });
}
/** Inspect actual ranged source bytes, not a reconstruction of the tool's JSON display. */
export async function inspectMerchantODataComparisonSource(options = {}) {
  const source = await sourceClient(options);
  const inspected = await downloader(source.parseManifest).inspect({ client: source.adapter, exportId: source.sourceSha256 });
  return { schema: ODATA_COMPARISON_DOWNLOAD_SCHEMA, state: 'INSPECTED', endpoint: source.endpoint,
    ...source.selected, ...source.original, source: sourceSummary(inspected.manifest, inspected.manifestSha256),
    document: { schema: inspected.manifest.schema, title: inspected.manifest.title, format: inspected.manifest.format,
      document: inspected.manifest.document, originals: inspected.manifest.originals,
      provenance: inspected.manifest.provenance, complete: inspected.manifest.complete },
    ...(source.analysisInput === undefined ? {} : { analysisInput: source.analysisInput }) };
}
/** The original durable downloader publishes source.json after syncing every declared file. */
export async function downloadMerchantODataComparison(options = {}) {
  const source = await sourceClient(options);
  const result = await downloader(source.parseManifest).download({ client: source.adapter, exportId: source.sourceSha256,
    expectedManifestSha256: source.sourceSha256, directory: options.directory, signal: options.signal,
    chunkSize: options.chunkSize, onProgress: options.onProgress });
  return { ...result, endpoint: source.endpoint, ...source.selected, ...source.original,
    sourceSha256: source.sourceSha256, sourceManifest: join(result.directory, MANIFEST) };
}
async function withDownload(options, operation) {
  need(typeof options.directory === 'string' && options.directory.length > 0, 'DIRECTORY',
    'Select the original completed download directory.');
  const native = downloader();
  return native.lockedDownload(options.directory, async context => {
    const raw = await native.bytesAt(join(context.root, MANIFEST), MAX_MANIFEST);
    const expectedSha256 = checksum(options.expectedSha256 ?? sha(raw)), source = parseSource(raw, expectedSha256);
    let saved;
    try { saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      await native.bytesAt(join(context.stateDirectory, 'checkpoint.json'), MAX_MANIFEST))); }
    catch (error) { throw fail('DOWNLOAD_CHANGED', 'The original download checkpoint cannot be read: ' + error.message); }
    need(saved?.schema === STATE_SCHEMA && saved.exportId === expectedSha256 && saved.manifestSha256 === expectedSha256,
      'DOWNLOAD_CHANGED', 'The retained download and selected source differ.');
    const selected = restoredScope(saved.endpoint);
    need(selected.editionId === source.editionId, 'DOWNLOAD_CHANGED', 'The retained download selected another original review edition.');
    if (options.editionId !== undefined) need(checksum(options.editionId) === selected.editionId, 'DOWNLOAD_CHANGED',
      'The retained edition differs from the reviewed selection.');
    await native.loadContext(context, raw, expectedSha256, saved.endpoint);
    for (const file of source.files) {
      const retained = context.state.files[file.name];
      need(retained?.complete === true && retained.bytes === file.bytes && retained.sha256 === file.sha256,
        'DOWNLOAD_INCOMPLETE', 'Resume the original download before receiving its incomplete file: ' + file.name + '.');
      await native.verifiedFile(join(context.root, file.name), file, options.signal);
    }
    return operation({ context, source, selected, expectedSha256 });
  });
}
/** Offline byte-complete reopen, with the original endpoint and edition scope retained. */
export async function inspectODataComparisonDownload(options = {}) {
  return withDownload(options, async ({ context, source, selected, expectedSha256 }) => ({
    schema: ODATA_COMPARISON_DOWNLOAD_SCHEMA, state: 'COMPLETE', directory: context.root, ...selected,
    sourceManifest: join(context.root, MANIFEST), source: sourceSummary(source, expectedSha256)
  }));
}
function disjoint(first, second) {
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path === '' || !path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path);
  };
  need(!inside(first, second) && !inside(second, first), 'DIRECTORY',
    'Use separate download and receiving directories so both original file sets remain complete.');
}
function receivedSummary(comparison) {
  return { schema: comparison.schema, directory: comparison.directory, status: comparison.status,
    engine: comparison.engine, selectionSha256: comparison.selectionSha256, selection: comparison.selection,
    manifestSha256: comparison.manifestSha256, counts: comparison.counts, analysisProjection: comparison.analysisProjection,
    reviews: comparison.reviews, analysis: comparison.analysis,
    ...(comparison.restoredFrom === undefined ? {} : { restoredFrom: comparison.restoredFrom }),
    ...(comparison.reused === undefined ? {} : { reused: comparison.reused }) };
}
const comparisonEngine = () => import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection-comparison.mjs');

/** Original receiving validates all packet bodies, replays native source and preserves longer compatible reviews. */
export async function receiveODataComparisonDownload(options = {}) {
  checksum(options.expectedSha256);
  need(typeof options.directory === 'string' && options.directory.length > 0 &&
    typeof options.comparisonDirectory === 'string' && options.comparisonDirectory.length > 0,
    'DIRECTORY', 'Select both the completed download and private comparison receiving directory.');
  const target = resolve(options.comparisonDirectory); disjoint(resolve(options.directory), target);
  return withDownload(options, async ({ context, source, selected, expectedSha256 }) => {
    const { restoreCollectionComparison } = await comparisonEngine();
    const comparison = await restoreCollectionComparison({ sourceManifest: join(context.root, MANIFEST), directory: target, expectedSha256 });
    need(comparison.manifestSha256 === source.comparisonSha256 && comparison.restoredFrom?.sha256 === expectedSha256 &&
      Number.isSafeInteger(comparison.restoredFrom.reviewRevision) &&
      comparison.reviews.revision >= comparison.restoredFrom.reviewRevision,
      'RECEIVING_CHANGED', 'The native comparison receiver returned another source or lost compatible saved reviews.');
    return { schema: ODATA_COMPARISON_RECEIVING_SCHEMA, state: 'COMPLETE', ...selected,
      downloadDirectory: context.root, sourceSha256: expectedSha256, comparison: receivedSummary(comparison) };
  });
}
/** Continue the same durable download, then restore that exact original edition locally. */
export async function fetchODataComparison(options = {}) {
  checksum(options.expectedSha256);
  need(typeof options.directory === 'string' && options.directory.length > 0 &&
    typeof options.comparisonDirectory === 'string' && options.comparisonDirectory.length > 0, 'DIRECTORY',
    'Select separate download and original comparison receiving directories.');
  disjoint(resolve(options.directory), resolve(options.comparisonDirectory));
  const download = await downloadMerchantODataComparison(options);
  const receiving = await receiveODataComparisonDownload({ directory: options.directory, comparisonDirectory: options.comparisonDirectory,
    expectedSha256: options.expectedSha256, editionId: options.editionId, signal: options.signal });
  return { schema: ODATA_COMPARISON_RECEIVING_SCHEMA, state: 'COMPLETE', download, receiving };
}
export async function inspectReceivedODataComparison({ directory, replay = false } = {}) {
  const { openCollectionComparison } = await comparisonEngine();
  return receivedSummary(await openCollectionComparison(directory, { replay }));
}
export async function readReceivedODataComparisonRows({ directory, kind = 'cells', offset = 0, limit = 100, status } = {}) {
  const { readComparisonRows } = await comparisonEngine();
  return readComparisonRows(directory, { kind, offset, limit, ...(status === undefined ? {} : { status }) });
}
/** Bind the actual Analysis registration name and revision after opening the selected original comparison. */
export async function receivedODataComparisonAnalysisMapping({ directory, source, sourceRevision } = {}) {
  const { openCollectionComparison, comparisonAnalysisMapping } = await comparisonEngine();
  const comparison = await openCollectionComparison(directory);
  return { comparisonSha256: comparison.manifestSha256, analysis: comparison.analysis,
    input: comparisonAnalysisMapping(source, sourceRevision) };
}
