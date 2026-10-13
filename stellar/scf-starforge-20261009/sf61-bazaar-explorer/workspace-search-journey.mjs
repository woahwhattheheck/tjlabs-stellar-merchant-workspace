#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Operate the original retained Atlas search, preparation and receiving workflow.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir } from 'node:fs/promises';
import { isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAtlasWorkspace } from './workspace.mjs';
import { writeWorkspaceTransfer, receiveWorkspaceTransfer } from './workspace-transfer.mjs';
import { CAPTURE_FILTERS, normalizeCaptureSearch } from './capture-search.mjs';
import { inspectCatalogReview, CATALOG_REVIEW_LIMITS } from './catalog-review.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function need(ok, code) { if (!ok) { const error = new Error(code); error.code = code; throw error; } }
async function bytesAt(filename, maximum) {
  need(typeof filename === 'string' && isAbsolute(filename) && !filename.includes('\0'), 'ATLAS_JOURNEY_ABSOLUTE_FILE_REQUIRED');
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    need(stat.isFile() && stat.size <= maximum, 'ATLAS_JOURNEY_INPUT_TOO_LARGE');
    const bytes = await file.readFile();
    need(bytes.length <= maximum, 'ATLAS_JOURNEY_INPUT_TOO_LARGE');
    return bytes;
  } finally { await file.close(); }
}
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
async function save(filename, text) {
  const file = await open(filename, 'wx', 0o600);
  try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
}
const reference = offer => ({ pageFile: offer.pageFile, pageSha256: offer.pageSha256, row: offer.row,
  catalogKey: offer.catalogKey, rank: offer.rank, matchingAcceptIndexes: offer.matchingAcceptIndexes });
function queriesFrom(value) {
  const rows = Array.isArray(value) ? value : value?.comparisons ?? value?.queries;
  need(Array.isArray(rows) && rows.length > 0, 'ATLAS_JOURNEY_ORIGINAL_QUERIES_REQUIRED');
  return rows.map((row, index) => {
    need(plain(row) && typeof row.query === 'string', 'ATLAS_JOURNEY_QUERY_INVALID');
    const filters = row.filters ?? Object.fromEntries(CAPTURE_FILTERS.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
    normalizeCaptureSearch({ query: row.query, filters });
    return { id: typeof row.id === 'string' ? row.id : String(index), query: row.query, filters: clone(filters),
      expected: Array.isArray(row.candidate) ? row.candidate.map(item => item.key) : null };
  });
}
function queryMetrics(start, cpu) {
  const usage = process.cpuUsage(cpu), memory = process.memoryUsage();
  return { elapsedMs: performance.now() - start, cpuUserMicroseconds: usage.user, cpuSystemMicroseconds: usage.system,
    rssBytesAfter: memory.rss, heapUsedBytesAfter: memory.heapUsed };
}
async function collect(workspace, input, append) {
  let first = null, pages = 0;
  const offers = [];
  for await (const page of workspace.capturePages(input)) {
    if (first === null) first = page;
    else need(page.snapshotId === first.snapshotId && same(page.search, first.search) &&
      same(page.coverage, first.coverage), 'ATLAS_JOURNEY_SEARCH_CONTINUATION_CHANGED');
    const rows = page.offers.map(reference);
    offers.push(...rows); pages++;
    if (append) await append({ page: page.pagination.page, snapshotId: page.snapshotId, offers: rows, coverage: page.coverage });
  }
  need(first && offers.length === first.pagination.total, 'ATLAS_JOURNEY_SEARCH_INCOMPLETE');
  return { snapshotId: first.snapshotId, sourcePages: first.sourcePages, coverage: first.coverage,
    search: first.search, pages, offers };
}

/** Uses an existing original workspace and explicit original row/request.
 * It makes a new saved selection, then receives the complete resulting store. */
export async function runAtlasSearchJourney(configuration) {
  const config = clone(configuration);
  need(plain(config) && Object.keys(config).every(key => ['workspace', 'captureId', 'queriesFile', 'query', 'filters',
    'pageSize', 'selected', 'selectionId', 'label', 'request', 'bodyFile', 'ticketFile', 'handoff', 'outputDirectory', 'reviewFile'].includes(key)),
  'ATLAS_JOURNEY_CONFIGURATION_INVALID');
  for (const field of ['workspace', 'queriesFile', 'outputDirectory'])
    need(typeof config[field] === 'string' && isAbsolute(config[field]) && resolve(config[field]) === config[field],
      'ATLAS_JOURNEY_ABSOLUTE_PATH_REQUIRED');
  let originalReview = null, reviewText = null;
  if (config.reviewFile !== undefined) {
    reviewText = decode(await bytesAt(config.reviewFile, CATALOG_REVIEW_LIMITS.packetBytes));
    originalReview = await inspectCatalogReview(reviewText);
    const packet = originalReview.packet, selected = { pageFile: packet.source.pageFile,
      row: packet.selection.row, accept: packet.selection.acceptIndex };
    need(config.selected === undefined || same(config.selected, selected), 'ATLAS_JOURNEY_REVIEW_SELECTION_CHANGED');
    need(config.label === undefined || config.label === packet.label, 'ATLAS_JOURNEY_REVIEW_LABEL_CHANGED');
    const requested = normalizeCaptureSearch({ query: config.query ?? packet.search.query,
      filters: config.filters ?? packet.search.filters });
    need(requested.query === packet.search.query && same(requested.filters, packet.search.filters),
      'ATLAS_JOURNEY_REVIEW_SEARCH_CHANGED');
    need(config.captureId === undefined || config.captureId === 'page-' + packet.source.pageSha256.slice(0, 40),
      'ATLAS_JOURNEY_REVIEW_CAPTURE_CHANGED');
    config.selected = selected; config.label = packet.label;
    config.query = packet.search.query; config.filters = clone(packet.search.filters);
  }
  need(plain(config.selected) && Object.keys(config.selected).every(key => ['pageFile', 'row', 'accept'].includes(key)) &&
    typeof config.selectionId === 'string' && typeof config.label === 'string' && plain(config.request) &&
    (config.handoff === undefined || typeof config.handoff === 'boolean'), 'ATLAS_JOURNEY_EXPLICIT_SELECTION_REQUIRED');
  const selectedQuery = normalizeCaptureSearch({ captureId: config.captureId, query: config.query ?? '',
    filters: config.filters ?? {}, pageSize: config.pageSize ?? 25 });
  const queryBytes = await bytesAt(config.queriesFile, 8 * 1048576), querySource = JSON.parse(decode(queryBytes));
  const queries = queriesFrom(querySource);
  await mkdir(config.outputDirectory, { mode: 0o700 });
  const report = { schema: 'stellar-forge.sf61.search-journey.v1', startedAt: new Date().toISOString(),
    state: 'RUNNING', workspace: config.workspace, captureId: config.captureId,
    queries: { file: config.queriesFile, sha256: hash(queryBytes), bytes: queryBytes.length, count: queries.length },
    queryRuns: [], selected: clone(config.selected), selectionId: config.selectionId, artifacts: {}, error: null };
  let workspace, received, queryOutput;
  try {
    workspace = await openAtlasWorkspace({ directory: config.workspace, create: false });
    const summary = await workspace.summary();
    need(!summary.selections.some(item => item.id === config.selectionId), 'ATLAS_JOURNEY_SELECTION_ID_ALREADY_EXISTS');
    report.workspaceId = summary.id;
    let receivedReview = null;
    if (originalReview) {
      receivedReview = await workspace.receiveCatalogReview({ reviewText, selectionId: config.selectionId });
      const captureId = receivedReview.capture.captureId;
      need(config.captureId === undefined || config.captureId === captureId, 'ATLAS_JOURNEY_REVIEW_CAPTURE_CHANGED');
      config.captureId = captureId; selectedQuery.captureId = captureId; report.captureId = captureId;
      need(receivedReview.selection.catalogReview?.packetId === originalReview.packet.packetId &&
        receivedReview.retained.sha256 === originalReview.sha256, 'ATLAS_JOURNEY_REVIEW_RECEIPT_CHANGED');
      report.catalogReview = { file: config.reviewFile, packetId: originalReview.packet.packetId,
        bytes: originalReview.bytes, sha256: originalReview.sha256, sourcePageSha256: originalReview.packet.source.pageSha256,
        row: originalReview.packet.selection.row, acceptIndex: originalReview.packet.selection.acceptIndex,
        search: clone(originalReview.packet.search) };
    }
    queryOutput = await open(join(config.outputDirectory, 'search-pages.ndjson'), 'wx', 0o600);
    let snapshotId = null;
    for (const query of queries) {
      const started = performance.now(), cpu = process.cpuUsage();
      const result = await collect(workspace, { captureId: config.captureId, query: query.query,
        filters: query.filters, pageSize: config.pageSize ?? 25, snapshotId },
      page => queryOutput.writeFile(JSON.stringify({ queryId: query.id, query: query.query, filters: query.filters, ...page }) + '\n'));
      snapshotId ??= result.snapshotId;
      need(snapshotId === result.snapshotId, 'ATLAS_JOURNEY_CAPTURE_CHANGED');
      const exactBaselineSource = querySource.sourceCapture?.sha256 &&
        result.sourcePages.length === 1 && result.sourcePages[0].sha256 === querySource.sourceCapture.sha256;
      const expectedMatch = exactBaselineSource && query.expected !== null
        ? same(result.offers.map(offer => offer.catalogKey), query.expected) : null;
      report.queryRuns.push({ id: query.id, query: query.query, filters: query.filters,
        pages: result.pages, matchingRows: result.offers.length, expectedSourceOrderMatched: expectedMatch,
        ...queryMetrics(started, cpu) });
      need(expectedMatch !== false, 'ATLAS_JOURNEY_ORIGINAL_QUERY_ORDER_CHANGED');
      report.coverage = result.coverage; report.sourcePages = result.sourcePages;
    }
    await queryOutput.sync(); await queryOutput.close(); queryOutput = null;
    report.snapshotId = snapshotId;
    report.artifacts.queryPages = join(config.outputDirectory, 'search-pages.ndjson');
    const selected = await collect(workspace, { ...selectedQuery, snapshotId });
    const offer = selected.offers.find(row => row.pageFile === config.selected.pageFile && row.row === config.selected.row);
    need(offer && offer.matchingAcceptIndexes.includes(config.selected.accept), 'ATLAS_JOURNEY_SELECTED_ROW_NOT_IN_QUERY');
    report.selectedSearch = { query: selectedQuery.query, filters: selectedQuery.filters, pages: selected.pages,
      total: selected.offers.length, offer };
    let selection = receivedReview?.selection ?? await workspace.saveSelection({ captureId: config.captureId, ...config.selected,
      label: config.label, selectionId: config.selectionId });
    const inputs = { selectionId: selection.id, revision: selection.revision, request: clone(config.request) };
    if (config.bodyFile !== undefined) inputs.bodyText = decode(await bytesAt(config.bodyFile, 1048576));
    if (config.ticketFile !== undefined) inputs.ticketText = decode(await bytesAt(config.ticketFile, 16384));
    selection = await workspace.prepareSelection(inputs);
    if (config.handoff !== false)
      selection = await workspace.createHandoff({ selectionId: selection.id, revision: selection.revision });
    need(selection.prepared?.sourceFileSha256 === offer.pageSha256 &&
      selection.request.url === config.request.url && selection.pageFile === offer.pageFile && selection.row === offer.row &&
      selection.accept === config.selected.accept, 'ATLAS_JOURNEY_PREPARED_SOURCE_CHANGED');
    report.preparation = { selectionId: selection.id, revision: selection.revision, stage: selection.stage,
      pageFile: selection.pageFile, row: selection.row, accept: selection.accept,
      request: selection.request, inputs: selection.inputs, originalConfigSha256: selection.prepared.originalConfigSha256,
      sourceFileSha256: selection.prepared.sourceFileSha256, handoffSha256: selection.handoff?.sha256 ?? null };
    const latest = await workspace.summary();
    need(summary.selections.every(prior => latest.selections.some(current => same(current, prior))),
      'ATLAS_JOURNEY_EXISTING_SELECTION_CHANGED');
    const transferPath = join(config.outputDirectory, 'workspace.ndjson');
    report.transfer = await writeWorkspaceTransfer(workspace, transferPath);
    report.artifacts.workspaceTransfer = transferPath;
    await workspace.close(); workspace = null;
    const receivedDirectory = join(config.outputDirectory, 'received-workspace');
    const transferFile = await open(transferPath, 'r');
    try {
      report.receiving = await receiveWorkspaceTransfer(transferFile.createReadStream({ autoClose: false }), receivedDirectory);
    } finally { await transferFile.close(); }
    received = await openAtlasWorkspace({ directory: receivedDirectory, create: false });
    const reopened = await received.selection({ selectionId: config.selectionId });
    need(reopened.id === selection.id && reopened.revision === selection.revision &&
      same(reopened.listing, selection.listing) && same(reopened.acceptedTerms, selection.acceptedTerms) &&
      same(reopened.request, selection.request) && same(reopened.inputs, selection.inputs) &&
      reopened.prepared?.sourceFileSha256 === selection.prepared.sourceFileSha256 &&
      reopened.prepared?.originalConfigSha256 === selection.prepared.originalConfigSha256 &&
      reopened.handoff?.sha256 === selection.handoff?.sha256, 'ATLAS_JOURNEY_RECEIVED_SELECTION_CHANGED');
    if (originalReview) {
      const review = await received.catalogReview({ selectionId: config.selectionId, sha256: originalReview.sha256 });
      need(review.text === reviewText && review.packetId === originalReview.packet.packetId &&
        review.sha256 === originalReview.sha256 && review.source.pageSha256 === originalReview.packet.source.pageSha256,
      'ATLAS_JOURNEY_RECEIVED_REVIEW_CHANGED');
      report.receivedCatalogReview = { packetId: review.packetId, sha256: review.sha256, bytes: review.bytes };
    }
    const cold = await collect(received, { ...selectedQuery, snapshotId });
    need(same(cold.offers, selected.offers) && same(cold.coverage, selected.coverage), 'ATLAS_JOURNEY_RECEIVED_SEARCH_CHANGED');
    const coldSummary = await received.summary();
    need(coldSummary.id === report.workspaceId && coldSummary.relocated, 'ATLAS_JOURNEY_RECEIVED_WORKSPACE_CHANGED');
    report.coldReceiving = { directory: receivedDirectory, workspaceId: coldSummary.id,
      selectionId: reopened.id, revision: reopened.revision, originalConfigSha256: reopened.prepared.originalConfigSha256,
      searchSnapshotId: cold.snapshotId, matchingRows: cold.offers.length };
    const second = await writeWorkspaceTransfer(received, join(config.outputDirectory, 'received-workspace.ndjson'));
    need(second.transferId === report.transfer.transferId, 'ATLAS_JOURNEY_RECEIVED_EXPORT_CHANGED');
    report.artifacts.receivedTransfer = second.file;
    report.state = 'COMPLETED';
  } catch (error) {
    report.state = 'FAILED'; report.error = { code: error.code ?? 'ATLAS_SEARCH_JOURNEY_FAILED', message: error.message };
    throw Object.assign(error, { report });
  } finally {
    await queryOutput?.close().catch(() => {});
    await received?.close().catch(() => {});
    await workspace?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    await save(join(config.outputDirectory, 'journey.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
const HELP = `Run the original Atlas search, preparation and complete receiving workflow

  starforge atlas-search-journey --config /private/atlas-journey.json

The configuration selects an existing workspace/capture, original query file,
exact pageFile/row/accept, a new selectionId and explicit native buyer request.
An optional reviewFile receives the complete original catalog selection first;
its saved page, row, option, query, filters and label become the selected source.
The same original review is checked again after complete workspace receiving.
The complete output directory must be new. See CAPTURE_SEARCH.md for the full
configuration and the original-source measurement/receiving contract.
`;
export async function runAtlasSearchJourneyCli(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) { console.log(HELP); return; }
  need(argv.length === 2 && argv[0] === '--config', 'ATLAS_JOURNEY_CONFIG_REQUIRED');
  const config = JSON.parse(decode(await bytesAt(argv[1], 65536)));
  const report = await runAtlasSearchJourney(config);
  console.log(JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runAtlasSearchJourneyCli().catch(error => { console.error(error.code ?? error.message); process.exitCode = 1; });
