// MIT. Saved live comparisons, reviewer histories and complete analytical receiving.
// The enclosing OData provider owns its original operation queue and close.
import { join } from 'node:path';
import { exact, failure, identifier, plain, privateSupportDirectory } from './config.mjs';
import { digest } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/state.mjs';
import { ANALYSIS_DOCUMENT_SCHEMA } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection.mjs';
import { readComparisonFile, comparisonAnalysisMapping } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection-comparison.mjs';

export const ODATA_COMPARISON_REVIEW_SCHEMA = 'stellar-forge.odata-comparison-review-request.v1';
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const MAX_SOURCE_BYTES = 1024 * 1024, MAX_REVIEW_BYTES = 16 * 1024 * 1024;
const REVIEW_FIELDS = ['requestId', 'expectedRevision', 'scope', 'entityKey', 'field', 'status', 'actor', 'note'];
const REVIEW_REQUIRED = ['requestId', 'expectedRevision', 'scope', 'status', 'actor', 'note'];
const operations = new Set([
  'merchant_odata_live_comparisons', 'merchant_odata_live_comparison',
  'merchant_odata_live_comparison_create', 'merchant_odata_live_comparison_rows',
  'merchant_odata_live_comparison_review', 'merchant_odata_live_comparison_publish',
  'merchant_odata_live_comparison_source', 'merchant_odata_live_comparison_restore',
]);
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const need = (value, code, message) => { if (!value) throw failure(code, message); };
function nativeId(value) {
  need(typeof value === 'string' && ID.test(value), 'INVALID_PARAMS', 'Choose an original service, collection or comparison identifier.');
  return value;
}
function sha(value) {
  need(typeof value === 'string' && HASH.test(value), 'INVALID_PARAMS', 'Use the exact selected SHA-256.');
  return value;
}
function count(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  need(Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    'INVALID_PARAMS', label + ' must be an integer from ' + minimum + ' to ' + maximum + '.');
  return value;
}
function only(args, fields, required = []) {
  exact(args, ['workspace', 'liveServiceId', ...fields], ['workspace', 'liveServiceId', ...required]);
}
function page(values, offset = 0, limit = 50) {
  count(offset, 'History offset'); count(limit, 'Page size', 1, 100);
  const items = values.slice(offset, offset + limit);
  return { items, page: { offset, limit, total: values.length,
    nextOffset: offset + items.length < values.length ? offset + items.length : null } };
}
function view(record, args = {}) {
  const { directory, files, retainedFiles, reviews, ...rest } = record;
  const result = { ...rest, pagination: {} };
  if (files !== undefined) {
    const selected = page(Object.entries(files).map(([path, value]) => ({ path, ...value })), args.offset, args.limit);
    result.files = selected.items; result.pagination.files = selected.page;
  }
  if (retainedFiles !== undefined) {
    const selected = page(retainedFiles, args.offset, args.limit);
    result.retainedFiles = selected.items; result.pagination.retainedFiles = selected.page;
  }
  if (reviews !== undefined) {
    const { current, history, ...identity } = reviews;
    result.reviews = { ...identity };
    for (const [name, values] of Object.entries({ current, history })) if (values !== undefined) {
      const selected = page(values, args.offset, args.limit);
      result.reviews[name] = selected.items; result.pagination['reviews.' + name] = selected.page;
    }
  }
  return result;
}
function inputAlias(entry, kind, name) {
  const selected = entry[kind]?.[identifier(name, 'Comparison input alias')];
  need(selected && HASH.test(selected.sha256 ?? ''), 'ODATA_COMPARISON_INPUT_NOT_CONFIGURED',
    'Choose a host-declared original comparison input with its complete SHA-256.');
  return selected;
}
function reference(base, comparisonId, filename, identity) {
  return { tool: 'merchant_odata_file', arguments: { workspace: base.workspace,
    kind: 'live-comparison', id: base.liveServiceId, recordId: comparisonId, filename,
    expectedSha256: identity.sha256 } };
}
function fileReference(base, comparisonId, path, identity) {
  const selected = reference(base, comparisonId, path, identity);
  return { path, bytes: identity.bytes, sha256: identity.sha256, ...selected };
}
function sourceDocument(file, expectedSha256) {
  need(file.bytes && file.bytes.length > 0 && file.bytes.length <= MAX_SOURCE_BYTES &&
    digest(file.bytes) === sha(expectedSha256), 'ODATA_COMPARISON_SOURCE_CHANGED',
    'The published analytical source differs from the selected complete bytes.');
  const document = parse(file.bytes);
  need(plain(document) && document.schema === ANALYSIS_DOCUMENT_SCHEMA && document.complete === true &&
    document.format === 'csv' && plain(document.document) && Array.isArray(document.originals) &&
    document.originals.length >= 4 && document.originals.length <= 32,
    'ODATA_COMPARISON_SOURCE_CHANGED', 'Choose the original complete comparison source document.');
  return document;
}
function sourceView(base, comparisonId, editionId, file, expectedSha256, args) {
  const document = sourceDocument(file, expectedSha256), prefix = 'editions/' + editionId + '/';
  const files = new Map([[prefix + 'source.json', { bytes: file.bytes.length, sha256: expectedSha256 }]]);
  for (const record of [document.document, ...document.originals]) {
    need(plain(record) && typeof record.path === 'string' &&
      /^files\/[a-f0-9]{64}\.(?:csv|json|bin)$/.test(record.path) &&
      HASH.test(record.sha256 ?? '') && Number.isSafeInteger(record.bytes) && record.bytes >= 0,
      'ODATA_COMPARISON_SOURCE_CHANGED', 'The source contains an unsupported original file identity.');
    const path = prefix + record.path, previous = files.get(path);
    need(!previous || previous.bytes === record.bytes && previous.sha256 === record.sha256,
      'ODATA_COMPARISON_SOURCE_CHANGED', 'The source repeats a file with different original bytes.');
    files.set(path, { bytes: record.bytes, sha256: record.sha256 });
  }
  return { ...base, comparisonId, editionId, comparisonSha256: file.comparisonSha256,
    manifest: fileReference(base, comparisonId, prefix + 'source.json', { bytes: file.bytes.length, sha256: expectedSha256 }),
    document, files: [...files].map(([path, identity]) => fileReference(base, comparisonId, path, identity)),
    ...(args.source === undefined ? {} : { analysisInput: comparisonAnalysisMapping(args.source, args.sourceRevision) }) };
}
function reviewInput(input) {
  exact(input, REVIEW_FIELDS, REVIEW_REQUIRED);
  need(typeof input.requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.requestId),
    'INVALID_PARAMS', 'Retain the original review request ID across an uncertain reply.');
  count(input.expectedRevision, 'Review revision');
  need(['comparison', 'entity', 'column', 'cell'].includes(input.scope) &&
    ['accepted', 'investigate', 'excluded', 'note'].includes(input.status),
    'INVALID_PARAMS', 'Choose an original review scope and decision.');
  const usesKey = ['entity', 'cell'].includes(input.scope), usesField = ['column', 'cell'].includes(input.scope);
  need(usesKey ? typeof input.entityKey === 'string' && Buffer.byteLength(input.entityKey) <= 2097152 :
    input.entityKey === undefined || input.entityKey === null,
    'INVALID_PARAMS', 'Use the exact retained entity key only for an entity or cell review.');
  need(usesField ? typeof input.field === 'string' && input.field.length > 0 :
    input.field === undefined || input.field === null,
    'INVALID_PARAMS', 'Use an original selected field only for a column or cell review.');
  for (const [key, maximum] of [['actor', 160], ['note', 8000]])
    need(typeof input[key] === 'string' && input[key].length > 0 && input[key].length <= maximum &&
      input[key].trim() === input[key] && input[key].isWellFormed() && !input[key].includes('\0'),
      'INVALID_PARAMS', 'Provide the complete original reviewer and note.');
  return { ...input };
}
function creationInput(args) {
  const fields = ['comparisonId', 'beforeCollectionId', 'afterCollectionId',
    'expectedBeforeSha256', 'expectedAfterSha256', 'title', 'fields', 'limits'];
  only(args, fields, fields.slice(0, 6));
  nativeId(args.beforeCollectionId); nativeId(args.afterCollectionId);
  sha(args.expectedBeforeSha256); sha(args.expectedAfterSha256);
  need(typeof args.title === 'string' && args.title.length > 0 && args.title.length <= 160 &&
    args.title.trim() === args.title && args.title.isWellFormed() && !/[\x00-\x1f]/.test(args.title),
    'INVALID_PARAMS', 'Choose a complete comparison title of at most 160 characters.');
  if (args.fields !== undefined)
    need(Array.isArray(args.fields) && args.fields.length > 0 && args.fields.length <= 64 &&
      new Set(args.fields).size === args.fields.length &&
      args.fields.every(field => typeof field === 'string' && field.length > 0 && field.length <= 240),
      'INVALID_PARAMS', 'Select up to 64 distinct original field paths, including the native key limit.');
  if (args.limits !== undefined) {
    const maxima = { maxInputBytes: 512 * 1024 * 1024, maxOutputBytes: 128 * 1024 * 1024, maxCells: 1000000 };
    exact(args.limits, Object.keys(maxima));
    for (const [name, value] of Object.entries(args.limits)) count(value, name, 1, maxima[name]);
  }
  return Object.fromEntries(fields.slice(1).filter(key => args[key] !== undefined).map(key => [key, args[key]]));
}
export const isODataComparisonOperation = name => operations.has(name);

/** Calls compose inside the original provider's handle.tail and live service sequence. */
export async function callODataComparison({ name, args, entry, live, declared, readInput }) {
  need(operations.has(name), 'TOOL_NOT_FOUND', 'Unknown original live comparison operation.');
  const service = nativeId(args.liveServiceId), base = { workspace: args.workspace, liveServiceId: service };
  if (name === 'merchant_odata_live_comparisons') {
    only(args, ['offset', 'limit']);
    const selected = page(await live.comparisons({ id: service }), args.offset, args.limit);
    return { ...base, comparisons: selected.items, page: selected.page };
  }
  const comparisonId = nativeId(args.comparisonId);
  if (name === 'merchant_odata_live_comparison') {
    only(args, ['comparisonId', 'offset', 'limit'], ['comparisonId']);
    return { ...base, ...view(await live.comparison({ id: service, comparisonId }), args) };
  }
  if (name === 'merchant_odata_live_comparison_create') {
    const input = creationInput(args);
    return { ...base, ...view(await live.compareCollections({ id: service, comparisonId, ...input })) };
  }
  if (name === 'merchant_odata_live_comparison_rows') {
    only(args, ['comparisonId', 'kind', 'status', 'offset', 'limit'], ['comparisonId']);
    const offset = count(args.offset ?? 0, 'Row offset'), limit = count(args.limit ?? 50, 'Row page size', 1, 100);
    need(args.kind === undefined || ['cells', 'entities'].includes(args.kind), 'INVALID_PARAMS', 'Choose comparison cells or entities.');
    need(args.status === undefined || ['changed', 'unchanged', 'before_only', 'after_only'].includes(args.status),
      'INVALID_PARAMS', 'Choose an original entity status.');
    return { ...base, comparisonId, ...await live.comparisonRows({ id: service, comparisonId, offset, limit,
      ...(args.kind === undefined ? {} : { kind: args.kind }), ...(args.status === undefined ? {} : { status: args.status }) }) };
  }
  if (name === 'merchant_odata_live_comparison_review') {
    only(args, ['comparisonId', 'reviewRequest', ...REVIEW_FIELDS], ['comparisonId']);
    let input, selectedInput = null;
    if (args.reviewRequest !== undefined) {
      need(REVIEW_FIELDS.every(key => args[key] === undefined), 'INVALID_PARAMS',
        'A declared review request supplies the exact request ID, revision, scope, key, field and note.');
      const selected = inputAlias(entry, 'comparisonReviews', args.reviewRequest);
      const raw = await readInput('comparisonReviews', args.reviewRequest, MAX_REVIEW_BYTES), document = parse(raw);
      exact(document, ['schema', 'liveServiceId', 'comparisonId', ...REVIEW_FIELDS],
        ['schema', 'liveServiceId', 'comparisonId', ...REVIEW_REQUIRED]);
      need(document.schema === ODATA_COMPARISON_REVIEW_SCHEMA && document.liveServiceId === service &&
        document.comparisonId === comparisonId, 'ODATA_COMPARISON_REVIEW_SELECTION',
        'The declared original review request belongs to another service or comparison.');
      input = reviewInput(Object.fromEntries(REVIEW_FIELDS.filter(key => document[key] !== undefined).map(key => [key, document[key]])));
      selectedInput = { alias: args.reviewRequest, bytes: raw.length, sha256: selected.sha256 };
    } else {
      input = reviewInput(Object.fromEntries(REVIEW_FIELDS.filter(key => args[key] !== undefined).map(key => [key, args[key]])));
    }
    const result = await live.reviewComparison({ id: service, comparisonId, ...input });
    return { ...base, comparisonId, review: result.review, reviewRevision: result.reviews.revision,
      comparisonSha256: result.reviews.comparisonSha256, reused: result.reused, selectedInput };
  }
  if (name === 'merchant_odata_live_comparison_publish') {
    only(args, ['comparisonId', 'expectedRevision'], ['comparisonId', 'expectedRevision']);
    const result = await live.publishComparison({ id: service, comparisonId,
      expectedRevision: count(args.expectedRevision, 'Review revision') });
    return { ...base, comparisonId, editionId: result.editionId, comparisonSha256: result.comparisonSha256,
      reviewRevision: result.reviewRevision, bytes: result.bytes, sha256: result.sha256,
      manifest: fileReference(base, comparisonId, result.sourceRelative, result),
      files: result.files.map(file => fileReference(base, comparisonId, file.path, file)) };
  }
  if (name === 'merchant_odata_live_comparison_source') {
    only(args, ['comparisonId', 'editionId', 'expectedSha256', 'source', 'sourceRevision'],
      ['comparisonId', 'editionId', 'expectedSha256']);
    const editionId = sha(args.editionId), expectedSha256 = sha(args.expectedSha256);
    need((args.source === undefined) === (args.sourceRevision === undefined), 'INVALID_PARAMS',
      'Supply both the actual registered Analysis source name and its saved revision for the native import mapping.');
    const file = await live.file({ id: service, kind: 'comparison', recordId: comparisonId,
      name: 'editions/' + editionId + '/source.json' });
    return sourceView(base, comparisonId, editionId, file, expectedSha256, args);
  }
  only(args, ['comparisonId', 'sourceDocument', 'sourceWorkspace', 'sourceLiveServiceId',
    'sourceComparisonId', 'sourceEditionId', 'expectedSha256'], ['comparisonId']);
  let sourceManifest, expectedSha256, selectedSource;
  if (args.sourceDocument !== undefined) {
    need(['sourceWorkspace', 'sourceLiveServiceId', 'sourceComparisonId', 'sourceEditionId'].every(key => args[key] === undefined),
      'INVALID_PARAMS', 'Choose one declared received source or one original published comparison edition.');
    const source = inputAlias(entry, 'comparisonSources', args.sourceDocument);
    await readInput('comparisonSources', args.sourceDocument, MAX_SOURCE_BYTES);
    sourceManifest = source.file; expectedSha256 = source.sha256;
    if (args.expectedSha256 !== undefined)
      need(sha(args.expectedSha256) === expectedSha256, 'ODATA_COMPARISON_SOURCE_CHANGED',
        'The received source differs from its selected digest.');
    selectedSource = { sourceDocument: args.sourceDocument, sha256: expectedSha256 };
  } else {
    const sourceWorkspace = args.sourceWorkspace ?? args.workspace,
      sourceService = nativeId(args.sourceLiveServiceId ?? service), sourceComparisonId = nativeId(args.sourceComparisonId),
      sourceEditionId = sha(args.sourceEditionId), configuration = declared(sourceWorkspace);
    const directory = join(configuration.directory, 'live', 'products', sourceService, 'comparisons', sourceComparisonId);
    await privateSupportDirectory(directory);
    const relative = 'editions/' + sourceEditionId + '/source.json';
    const file = await readComparisonFile(directory, relative);
    expectedSha256 = sha(args.expectedSha256); sourceDocument(file, expectedSha256);
    sourceManifest = join(directory, relative);
    selectedSource = { sourceWorkspace, sourceLiveServiceId: sourceService, sourceComparisonId,
      sourceEditionId, sha256: expectedSha256 };
  }
  const result = await live.restoreComparison({ id: service, comparisonId, sourceManifest, expectedSha256 });
  return { ...base, ...view(result), selectedSource };
}
