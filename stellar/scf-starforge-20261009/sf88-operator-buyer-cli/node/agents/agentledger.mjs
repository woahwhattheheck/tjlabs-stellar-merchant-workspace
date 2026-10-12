// MIT — AgentLedger decision windows joined to original buyer tasks and complete files.
import { join, relative, isAbsolute, sep } from 'node:path';
import { readdir, realpath } from 'node:fs/promises';
import { Inbox } from '../inbox.mjs';
import { VerifiedFile } from '../result.mjs';
import { BuyerError, need, object, absolute, intent, digest, jsonBytes, now,
  parseJson, privateDirectory, readBytes, readJson, writeBytes, exists } from '../store.mjs';
import { previewInboxTask, createInboxTask, openInboxTask, openInboxTaskPacket,
  compareInboxTasks } from './inbox-task.mjs';

const SNAPSHOT = 'stellar-forge.agentledger-snapshot.v1';
const TASK = 'stellar-forge.agentledger-task.v1';
const RECORD = 'stellar-forge.agentledger-task-record.v1';
const DELIVERY = 'stellar-forge.agentledger-delivery.v1';
const MAXIMUM = 32 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
export const AGENTLEDGER_CHAIN_FIELDS = Object.freeze([
  'seq', 'ts', 'agentId', 'resource', 'method', 'amount',
  'asset', 'network', 'payTo', 'verdict', 'rule', 'txHash',
]);
export const AGENTLEDGER_PUBLIC_LEDGER = 'https://useagentledger.xyz/api/x402/ledger?limit=50';
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const sha = value => digest(jsonBytes(canonical(value)));
function frozen(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function fields(value, allowed, code) {
  need(object(value) && Object.keys(value).every(key => allowed.includes(key)), code);
}
function text(value, field, maximum = 512, nullable = false) {
  if (nullable && (value === undefined || value === null)) return null;
  need(typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'AGENTLEDGER_' + field + '_INVALID');
  return value;
}
function timestamp(value) {
  need(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'AGENTLEDGER_TIMESTAMP_INVALID');
  return value;
}
function sourceUrl(value) {
  let url; try { url = new URL(value); } catch { throw new BuyerError('AGENTLEDGER_SOURCE_URL_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
    [...url.searchParams.keys()].every(key => key === 'limit') &&
    url.searchParams.getAll('limit').length <= 1, 'AGENTLEDGER_SOURCE_URL_INVALID');
  if (url.searchParams.has('limit')) need(/^[1-9][0-9]{0,4}$/.test(url.searchParams.get('limit')),
    'AGENTLEDGER_SOURCE_LIMIT_INVALID');
  return url.href;
}
function sourceIdentity(value) {
  const url = new URL(sourceUrl(value)); url.search = ''; return url.href;
}
function serviceOrigin(value) {
  let url; try { url = new URL(value); } catch { throw new BuyerError('AGENTLEDGER_SERVICE_ORIGIN_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search &&
    url.pathname === '/', 'AGENTLEDGER_SERVICE_ORIGIN_INVALID');
  return url.origin;
}
/** Expand the decimal representation exactly; never round an asset amount. */
export function agentLedgerAtomicAmount(value, decimals) {
  need(Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 38, 'AGENTLEDGER_ASSET_DECIMALS_INVALID');
  need(typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) && value >= 0,
    'AGENTLEDGER_AMOUNT_INVALID');
  const raw = String(value), match = /^([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(raw);
  need(match && raw.length <= 128, 'AGENTLEDGER_AMOUNT_INVALID');
  const exponent = Number(match[3] ?? 0);
  need(Number.isSafeInteger(exponent) && Math.abs(exponent) <= 128, 'AGENTLEDGER_AMOUNT_INVALID');
  let digits = (match[1] + (match[2] ?? '')).replace(/^0+(?=\d)/, '');
  if (BigInt(digits) === 0n) return '0';
  const scale = decimals + exponent - (match[2]?.length ?? 0);
  if (scale >= 0) digits += '0'.repeat(scale);
  else {
    const remove = -scale;
    need(remove <= digits.length && /^0*$/.test(digits.slice(digits.length - remove)),
      'AGENTLEDGER_AMOUNT_NOT_EXACT_AT_ASSET_DECIMALS');
    digits = digits.slice(0, digits.length - remove) || '0';
  }
  const amount = BigInt(digits);
  need(amount <= (1n << 128n) - 1n, 'AGENTLEDGER_AMOUNT_EXCEEDS_U128');
  return amount.toString();
}
/** The official ledger chain covers these twelve fields in this exact order. */
export function inspectAgentLedgerBytes(raw) {
  need(raw instanceof Uint8Array && raw.byteLength > 0 && raw.byteLength <= MAXIMUM,
    'AGENTLEDGER_CAPTURE_SIZE_INVALID');
  const body = parseJson(raw);
  need(object(body) && Array.isArray(body.entries) && body.entries.length <= 100000,
    'AGENTLEDGER_ENTRIES_INVALID');
  const entries = [...body.entries].sort((a, b) => a.seq - b.seq), sequence = new Set();
  let previous = entries[0]?.prevHash ?? null, priorSequence = null;
  const gaps = [];
  for (const entry of entries) {
    need(object(entry) && Number.isSafeInteger(entry.seq) && entry.seq >= 1 && !sequence.has(entry.seq) &&
      HEX.test(entry.hash ?? '') && HEX.test(entry.prevHash ?? ''), 'AGENTLEDGER_ENTRY_IDENTITY_INVALID');
    sequence.add(entry.seq);
    timestamp(entry.ts);
    for (const key of ['agentId', 'resource', 'method', 'verdict', 'rule'])
      text(entry[key], 'ENTRY_' + key.toUpperCase(), key === 'resource' ? 8192 : 512);
    for (const key of AGENTLEDGER_CHAIN_FIELDS) need(entry[key] === null || entry[key] === undefined ||
      ['string', 'number', 'boolean'].includes(typeof entry[key]), 'AGENTLEDGER_CHAIN_VALUE_INVALID');
    const payload = AGENTLEDGER_CHAIN_FIELDS.map(key => key + '=' + (entry[key] ?? '')).join('|');
    need(entry.prevHash === previous && digest(Buffer.from(previous + '|' + payload)) === entry.hash,
      'AGENTLEDGER_CHAIN_MISMATCH');
    if (priorSequence !== null && entry.seq !== priorSequence + 1) gaps.push({ after: priorSequence, before: entry.seq });
    previous = entry.hash; priorSequence = entry.seq;
  }
  return frozen({ body, entries, capture: { bytes: raw.byteLength, sha256: digest(raw) },
    window: { entries: entries.length, firstSequence: entries[0]?.seq ?? null,
      lastSequence: entries.at(-1)?.seq ?? null, previousHash: entries[0]?.prevHash ?? null,
      lastHash: entries.at(-1)?.hash ?? null, sequenceGaps: gaps, chainFields: [...AGENTLEDGER_CHAIN_FIELDS] } });
}
async function exact(path, raw) {
  try { await writeBytes(path, raw, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need(digest(await readBytes(path, raw.length)) === digest(raw), 'AGENTLEDGER_EXISTING_FILE_CHANGED');
  }
}
async function eligibleDirectory(directory, allowed) {
  directory = await privateDirectory(directory);
  need(await realpath(directory) === directory, 'AGENTLEDGER_SYMLINK_DIRECTORY');
  need((await readdir(directory)).every(name => allowed.includes(name) || /^\.write-[a-f0-9-]{36}$/.test(name)),
    'AGENTLEDGER_DIRECTORY_HAS_OTHER_WORK');
  return directory;
}
function snapshotRecord(value, inspection) {
  fields(value, ['schema', 'source', 'capture', 'window'], 'AGENTLEDGER_SNAPSHOT_INVALID');
  need(value.schema === SNAPSHOT && object(value.source) &&
    sourceUrl(value.source.url) === value.source.url && ['HTTPS_GET', 'IMPORTED_BYTES'].includes(value.source.method) &&
    timestamp(value.source.observedAt) && sha(value.capture) === sha(inspection.capture) &&
    sha(value.window) === sha(inspection.window), 'AGENTLEDGER_SNAPSHOT_INVALID');
  return value;
}
export class AgentLedgerSnapshot {
  constructor(directory, manifest, inspection) {
    this.directory = absolute(directory);
    this.manifest = frozen(structuredClone(snapshotRecord(manifest, inspection)));
    this.inspection = inspection;
  }
  get sha256() { return this.manifest.capture.sha256; }
  get entries() { return this.inspection.entries; }
  get window() { return this.manifest.window; }
  entry(sequence) {
    need(Number.isSafeInteger(sequence), 'AGENTLEDGER_SEQUENCE_INVALID');
    const entry = this.entries.find(item => item.seq === sequence);
    need(entry, 'AGENTLEDGER_SEQUENCE_OUTSIDE_CAPTURE'); return entry;
  }
  settlements(decision) {
    return this.entries.filter(row => row.kind === 'settlement' && row.settles === decision.seq &&
      row.agentId === decision.agentId && (row.tenantId ?? null) === (decision.tenantId ?? null));
  }
  toJSON() { return { directory: this.directory, ...this.manifest,
    agents: [...new Set(this.entries.map(row => row.agentId))],
    report: join(this.directory, 'index.html') }; }
}
export async function openAgentLedgerSnapshot({ directory, expectedSha256 } = {}) {
  directory = await privateDirectory(directory, { create: false });
  const inspection = inspectAgentLedgerBytes(await readBytes(join(directory, 'ledger.json'), MAXIMUM));
  const manifest = snapshotRecord(await readJson(join(directory, 'snapshot.json'), MAXIMUM), inspection);
  if (expectedSha256 !== undefined) need(inspection.capture.sha256 === expectedSha256,
    'AGENTLEDGER_CAPTURE_CHANGED');
  return new AgentLedgerSnapshot(directory, manifest, inspection);
}
async function saveSnapshot({ directory, raw, source }) {
  const inspection = inspectAgentLedgerBytes(raw);
  directory = await eligibleDirectory(absolute(directory), ['ledger.json', 'snapshot.json', 'capture-intent.json', 'index.html']);
  const proposed = { schema: SNAPSHOT, source, capture: inspection.capture, window: inspection.window };
  const intentPath = join(directory, 'capture-intent.json');
  let selected = proposed;
  if (await exists(intentPath)) selected = snapshotRecord(await readJson(intentPath, MAXIMUM), inspection);
  else {
    try { await exact(intentPath, jsonBytes(proposed)); }
    catch (error) {
      if (error.code !== 'AGENTLEDGER_EXISTING_FILE_CHANGED') throw error;
      selected = snapshotRecord(await readJson(intentPath, MAXIMUM), inspection);
    }
  }
  need(sourceIdentity(selected.source.url) === sourceIdentity(source.url) &&
    selected.capture.sha256 === proposed.capture.sha256, 'AGENTLEDGER_CAPTURE_OTHER_SOURCE');
  await exact(join(directory, 'ledger.json'), raw);
  await exact(join(directory, 'snapshot.json'), jsonBytes(selected));
  const saved = new AgentLedgerSnapshot(directory, selected, inspection);
  await exact(join(directory, 'index.html'), Buffer.from(renderWorkbench(saved)));
  return saved;
}
export async function importAgentLedgerSnapshot({ directory, inputFile, source = AGENTLEDGER_PUBLIC_LEDGER,
  observedAt, signal } = {}) {
  need(!signal?.aborted, 'AGENTLEDGER_IMPORT_ABORTED');
  const raw = await readBytes(absolute(inputFile), MAXIMUM);
  return saveSnapshot({ directory, raw, source: { url: sourceUrl(source), method: 'IMPORTED_BYTES',
    observedAt: timestamp(observedAt ?? now()) } });
}
export async function captureAgentLedgerSnapshot({ directory, source = AGENTLEDGER_PUBLIC_LEDGER,
  headers, signal } = {}) {
  source = sourceUrl(source); directory = absolute(directory);
  // The retained intent owns the original bytes even when the previous process
  // ended before its public manifest or workbench appeared.
  if (await exists(join(directory, 'capture-intent.json')) && await exists(join(directory, 'ledger.json'))) {
    const retained = await readJson(join(directory, 'capture-intent.json'), MAXIMUM);
    need(sourceIdentity(retained.source?.url) === sourceIdentity(source), 'AGENTLEDGER_CAPTURE_OTHER_SOURCE');
    return saveSnapshot({ directory, raw: await readBytes(join(directory, 'ledger.json'), MAXIMUM), source: retained.source });
  }
  need(!await exists(join(directory, 'capture-intent.json')), 'AGENTLEDGER_ORIGINAL_CAPTURE_BYTES_REQUIRED');
  need(!signal?.aborted, 'AGENTLEDGER_CAPTURE_ABORTED');
  const startedAt = now(), response = await fetch(source, { method: 'GET', headers, redirect: 'error', signal });
  need(response.status === 200 && response.body, 'AGENTLEDGER_LEDGER_HTTP_FAILURE');
  const parts = []; let size = 0;
  for await (const part of response.body) {
    size += part.length; need(size <= MAXIMUM, 'AGENTLEDGER_CAPTURE_SIZE_INVALID'); parts.push(part);
  }
  return saveSnapshot({ directory, raw: Buffer.concat(parts), source: { url: source, method: 'HTTPS_GET',
    requestStartedAt: startedAt, observedAt: now(), httpStatus: response.status,
    responseHeaders: Object.fromEntries(['content-type', 'date', 'etag', 'last-modified'].map(key =>
      [key, response.headers.get(key)]).filter(([, value]) => value !== null)) } });
}
export function compareAgentLedgerSnapshots(previous, next) {
  need(previous instanceof AgentLedgerSnapshot && next instanceof AgentLedgerSnapshot &&
    sourceIdentity(previous.manifest.source.url) === sourceIdentity(next.manifest.source.url),
    'AGENTLEDGER_SAME_SOURCE_REQUIRED');
  const old = new Map(previous.entries.map(row => [row.seq, row])), current = new Map(next.entries.map(row => [row.seq, row]));
  const overlap = next.entries.filter(row => old.has(row.seq));
  const chainChanges = overlap.filter(row => old.get(row.seq).hash !== row.hash).map(row => row.seq);
  const annotationChanges = overlap.filter(row => old.get(row.seq).hash === row.hash &&
    sha(old.get(row.seq)) !== sha(row)).map(row => row.seq);
  const extendsDirectly = previous.window.lastSequence !== null && next.window.firstSequence === previous.window.lastSequence + 1 &&
    next.window.previousHash === previous.window.lastHash;
  return { previousSha256: previous.sha256, nextSha256: next.sha256,
    sameBytes: previous.sha256 === next.sha256, previousWindow: previous.window, nextWindow: next.window,
    overlap: overlap.length, chainChanges, annotationChanges, extendsDirectly,
    newSequences: next.entries.filter(row => !old.has(row.seq)).map(row => row.seq),
    outsideNextWindow: previous.entries.filter(row => !current.has(row.seq)).map(row => row.seq) };
}
function agentInput(value) {
  fields(value, ['id', 'tenantId'], 'AGENTLEDGER_AGENT_INVALID');
  return { id: text(value.id, 'AGENT', 512), tenantId: text(value.tenantId, 'TENANT', 512, true) };
}
function facilitatorInput(value) {
  if (value === undefined || value === null) return null;
  text(value, 'FACILITATOR', 2048);
  let url; try { url = new URL(value); } catch { throw new BuyerError('AGENTLEDGER_FACILITATOR_INVALID'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search,
    'AGENTLEDGER_FACILITATOR_INVALID');
  return url.href.replace(/\/$/, '');
}
function selectInput(value) {
  fields(value, ['intentId', 'decisionSequence', 'decisionHash', 'serviceOrigin', 'assetDecimals',
    'role', 'sourceEdition', 'facilitator'], 'AGENTLEDGER_SELECTION_INVALID');
  need(Number.isSafeInteger(value.decisionSequence) && value.decisionSequence >= 1 &&
    HEX.test(value.decisionHash ?? '') && Number.isSafeInteger(value.assetDecimals) &&
    value.assetDecimals >= 0 && value.assetDecimals <= 38, 'AGENTLEDGER_SELECTION_INVALID');
  return { intentId: intent(value.intentId), decisionSequence: value.decisionSequence,
    decisionHash: value.decisionHash, serviceOrigin: serviceOrigin(value.serviceOrigin), assetDecimals: value.assetDecimals,
    role: text(value.role, 'ROLE', 256), sourceEdition: text(value.sourceEdition, 'SOURCE_EDITION', 1024, true),
    facilitator: facilitatorInput(value.facilitator) };
}
function decisionJoin(snapshot, selection, agent, request) {
  const decision = snapshot.entry(selection.decisionSequence);
  need(decision.hash === selection.decisionHash && decision.kind === 'decision' &&
    ['ALLOW', 'HOLD', 'BLOCK'].includes(decision.verdict) && decision.agentId === agent.id &&
    (decision.tenantId ?? null) === agent.tenantId, 'AGENTLEDGER_DECISION_BINDING_MISMATCH');
  need(typeof decision.resource === 'string' && decision.resource.startsWith('/') && !decision.resource.startsWith('//'),
    'AGENTLEDGER_DECISION_RESOURCE_REQUIRED');
  const url = new URL(decision.resource, selection.serviceOrigin);
  need(url.origin === selection.serviceOrigin && !url.hash && request.url === url.href &&
    request.method === decision.method, 'AGENTLEDGER_REQUEST_RESOURCE_MISMATCH');
  need(request.expect?.scheme === 'exact' &&
    ['stellar:testnet', 'stellar:pubnet'].includes(request.expect.network) &&
    ['network', 'asset', 'payTo'].every(key => request.expect[key] === decision[key]),
    'AGENTLEDGER_ORIGINAL_STELLAR_TERMS_MISMATCH');
  const amount = decision.amount ?? decision.quoted;
  need(amount !== undefined, 'AGENTLEDGER_RECORDED_QUOTE_REQUIRED');
  const atomic = agentLedgerAtomicAmount(amount, selection.assetDecimals);
  need(/^(0|[1-9][0-9]*)$/.test(request.expect.maxAtomic) &&
    BigInt(atomic) <= BigInt(request.expect.maxAtomic), 'AGENTLEDGER_QUOTE_EXCEEDS_ORIGINAL_CEILING');
  return { selection, decision: structuredClone(decision),
    settlementRecords: structuredClone(snapshot.settlements(decision)),
    recordedAmount: amount, recordedAmountAtomic: atomic, configuredMaxAtomic: request.expect.maxAtomic,
    requestSha256: sha(request), decisionRef: 'agentledger:' + snapshot.sha256 + ':' + decision.seq + ':' + decision.hash };
}
async function taskPreview({ inbox, snapshot, agent, task, selections, predecessor, signal }) {
  need(inbox instanceof Inbox && snapshot instanceof AgentLedgerSnapshot, 'AGENTLEDGER_ORIGINAL_INPUTS_REQUIRED');
  agent = agentInput(agent);
  need(task?.system === 'agentledger' && Array.isArray(selections) && selections.length >= 1,
    'AGENTLEDGER_TASK_INVALID');
  selections = selections.map(selectInput);
  need(new Set(selections.map(row => row.decisionSequence)).size === selections.length,
    'AGENTLEDGER_DECISION_SELECTED_TWICE');
  const chosen = selections.map(selection => {
    const decision = snapshot.entry(selection.decisionSequence);
    return { intentId: selection.intentId, role: selection.role, sourceEdition: selection.sourceEdition,
      facilitator: selection.facilitator,
      decisionRef: 'agentledger:' + snapshot.sha256 + ':' + decision.seq + ':' + decision.hash, reservationRef: null };
  });
  const original = await previewInboxTask({ inbox, task, selections: chosen, predecessor, signal });
  const joins = selections.map((selection, index) =>
    decisionJoin(snapshot, selection, agent, original.manifest.entries[index].request));
  const manifest = { schema: TASK, agent, snapshotSha256: snapshot.sha256,
    snapshotManifestSha256: sha(snapshot.manifest), originalTaskSha256: original.previewSha256,
    originalManifest: original.manifest, joins };
  need(jsonBytes(manifest).length <= MAXIMUM, 'AGENTLEDGER_TASK_SIZE_LIMIT');
  return frozen({ previewSha256: sha(manifest), manifest, original });
}
export const previewAgentLedgerTask = taskPreview;
function validateTaskRecord(record, snapshot) {
  fields(record, ['schema', 'createdAt', 'sha256', 'manifest'], 'AGENTLEDGER_TASK_RECORD_INVALID');
  need(record.schema === RECORD && timestamp(record.createdAt) && record.sha256 === sha(record.manifest),
    'AGENTLEDGER_TASK_RECORD_CHANGED');
  const value = record.manifest;
  fields(value, ['schema', 'agent', 'snapshotSha256', 'snapshotManifestSha256', 'originalTaskSha256',
    'originalManifest', 'joins'], 'AGENTLEDGER_TASK_MANIFEST_INVALID');
  need(value.schema === TASK && value.snapshotSha256 === snapshot.sha256 &&
    value.snapshotManifestSha256 === sha(snapshot.manifest) &&
    value.originalTaskSha256 === sha(value.originalManifest) && Array.isArray(value.joins) &&
    value.joins.length === value.originalManifest.entries?.length && value.joins.length > 0 &&
    value.originalManifest.task?.system === 'agentledger', 'AGENTLEDGER_TASK_MANIFEST_INVALID');
  const agent = agentInput(value.agent);
  need(sha(agent) === sha(value.agent) && new Set(value.joins.map(row => row.selection?.decisionSequence)).size === value.joins.length,
    'AGENTLEDGER_TASK_AGENT_INVALID');
  value.joins.forEach((item, index) => {
    const selection = selectInput(item.selection), original = value.originalManifest.entries[index];
    const expected = decisionJoin(snapshot, selection, agent, original.request);
    const expectedSelection = { intentId: selection.intentId, role: selection.role, sourceEdition: selection.sourceEdition,
      facilitator: selection.facilitator, decisionRef: expected.decisionRef, reservationRef: null };
    need(sha(expected) === sha(item) && sha(original.selection) === sha(expectedSelection),
      'AGENTLEDGER_TASK_JOIN_CHANGED');
  });
  return record;
}
async function copySnapshot(snapshot, directory) {
  const raw = await readBytes(join(snapshot.directory, 'ledger.json'), MAXIMUM);
  need(digest(raw) === snapshot.sha256, 'AGENTLEDGER_CAPTURE_CHANGED');
  return saveSnapshot({ directory, raw, source: snapshot.manifest.source });
}
export async function createAgentLedgerTask({ directory, expectedPreviewSha256, ...input } = {}) {
  need(HEX.test(expectedPreviewSha256 ?? ''), 'AGENTLEDGER_REVIEW_REQUIRED');
  const preview = await taskPreview(input);
  need(preview.previewSha256 === expectedPreviewSha256, 'AGENTLEDGER_SOURCE_CHANGED_SINCE_REVIEW');
  directory = await eligibleDirectory(absolute(directory), ['intent.json', 'ledger', 'original', 'task.json']);
  const recordPath = join(directory, 'intent.json');
  let record = { schema: RECORD, createdAt: now(), sha256: preview.previewSha256, manifest: preview.manifest };
  if (await exists(recordPath)) {
    record = validateTaskRecord(await readJson(recordPath, MAXIMUM), input.snapshot);
    need(record.sha256 === preview.previewSha256, 'AGENTLEDGER_TASK_OTHER_SELECTION');
  } else {
    try { await exact(recordPath, jsonBytes(record)); }
    catch (error) {
      if (error.code !== 'AGENTLEDGER_EXISTING_FILE_CHANGED') throw error;
      record = validateTaskRecord(await readJson(recordPath, MAXIMUM), input.snapshot);
      need(record.sha256 === preview.previewSha256, 'AGENTLEDGER_TASK_OTHER_SELECTION');
    }
  }
  const snapshot = await copySnapshot(input.snapshot, join(directory, 'ledger'));
  const original = await createInboxTask({ inbox: input.inbox, directory: join(directory, 'original'),
    task: preview.original.manifest.task, selections: preview.original.manifest.entries.map(row => row.selection),
    predecessor: preview.original.manifest.predecessor, expectedPreviewSha256: preview.original.previewSha256, signal: input.signal });
  await exact(join(directory, 'task.json'), jsonBytes(record));
  return new AgentLedgerTask(directory, snapshot, original, record);
}
export async function openAgentLedgerTask({ inbox, directory, expectedSha256 } = {}) {
  directory = await privateDirectory(directory, { create: false });
  const snapshot = await openAgentLedgerSnapshot({ directory: join(directory, 'ledger') });
  const record = validateTaskRecord(await readJson(join(directory, 'task.json'), MAXIMUM), snapshot);
  if (expectedSha256 !== undefined) need(record.sha256 === expectedSha256, 'AGENTLEDGER_TASK_CHANGED');
  const original = await openInboxTask({ inbox, directory: join(directory, 'original'),
    expectedTaskSha256: record.manifest.originalTaskSha256 });
  need(sha(original.manifest) === sha(record.manifest.originalManifest), 'AGENTLEDGER_ORIGINAL_TASK_CHANGED');
  return new AgentLedgerTask(directory, snapshot, original, record);
}
function contains(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}
export class AgentLedgerTask {
  constructor(directory, snapshot, originalTask, record) {
    this.directory = absolute(directory); this.snapshot = snapshot; this.originalTask = originalTask;
    this.record = frozen(structuredClone(validateTaskRecord(record, snapshot)));
    need(originalTask.taskSha256 === record.manifest.originalTaskSha256, 'AGENTLEDGER_ORIGINAL_TASK_CHANGED');
  }
  get sha256() { return this.record.sha256; }
  async inspect({ signal } = {}) {
    const original = await this.originalTask.inspect({ signal });
    return { schema: TASK, sha256: this.sha256, agent: this.record.manifest.agent,
      snapshot: this.snapshot.manifest, original,
      joins: this.record.manifest.joins.map((row, index) => ({ ...row, original: original.entries[index] })) };
  }
  async receive({ directory, signal } = {}) {
    directory = absolute(directory);
    need(!contains(this.directory, directory) && !contains(this.originalTask.inbox.directory, directory),
      'AGENTLEDGER_RECEIVING_DIRECTORY_INVALID');
    if (await exists(join(directory, 'manifest.json')))
      return openAgentLedgerDelivery({ directory, expectedTaskSha256: this.sha256, signal });
    directory = await eligibleDirectory(directory, ['receiving-intent.json', 'results', 'ledger', 'task.json', 'index.html']);
    const receiving = { schema: 'stellar-forge.agentledger-receiving-intent.v1', taskSha256: this.sha256 };
    await exact(join(directory, 'receiving-intent.json'), jsonBytes(receiving));
    const received = await this.originalTask.receive({ directory: join(directory, 'results'), signal });
    const snapshot = await copySnapshot(this.snapshot, join(directory, 'ledger'));
    await exact(join(directory, 'task.json'), jsonBytes(this.record));
    const html = Buffer.from(renderWorkbench(snapshot, { task: this.record, received }));
    await exact(join(directory, 'index.html'), html);
    const manifest = { schema: DELIVERY, taskSha256: this.sha256, originalTaskSha256: received.taskSha256,
      originalPlanSha256: received.packet.planSha256, snapshotSha256: snapshot.sha256,
      files: [
        { path: 'task.json', bytes: jsonBytes(this.record).length, sha256: digest(jsonBytes(this.record)) },
        { path: 'index.html', bytes: html.length, sha256: digest(html) },
      ] };
    await exact(join(directory, 'manifest.json'), jsonBytes(manifest));
    return openAgentLedgerDelivery({ directory, expectedTaskSha256: this.sha256, signal });
  }
  toJSON() { return { directory: this.directory, ...this.record }; }
}
class LocalFile extends VerifiedFile {
  constructor(metadata) { super(); this.metadata = metadata; }
  _metadata() { return this.metadata; }
}
export async function openAgentLedgerDelivery({ directory, expectedTaskSha256, signal } = {}) {
  directory = await privateDirectory(directory, { create: false });
  const snapshot = await openAgentLedgerSnapshot({ directory: join(directory, 'ledger') });
  const record = validateTaskRecord(await readJson(join(directory, 'task.json'), MAXIMUM), snapshot);
  const manifest = await readJson(join(directory, 'manifest.json'), MAXIMUM);
  need(manifest.schema === DELIVERY && manifest.taskSha256 === record.sha256 &&
    manifest.originalTaskSha256 === record.manifest.originalTaskSha256 && manifest.snapshotSha256 === snapshot.sha256,
    'AGENTLEDGER_DELIVERY_CHANGED');
  if (expectedTaskSha256 !== undefined) need(record.sha256 === expectedTaskSha256, 'AGENTLEDGER_TASK_CHANGED');
  const received = await openInboxTaskPacket({ directory: join(directory, 'results'),
    expectedTaskSha256: manifest.originalTaskSha256, signal });
  need(received.packet.planSha256 === manifest.originalPlanSha256, 'AGENTLEDGER_RECEIVED_PLAN_CHANGED');
  const html = Buffer.from(renderWorkbench(snapshot, { task: record, received }));
  const expected = [
    { path: 'task.json', bytes: jsonBytes(record).length, sha256: digest(jsonBytes(record)) },
    { path: 'index.html', bytes: html.length, sha256: digest(html) },
  ];
  need(sha(manifest.files) === sha(expected), 'AGENTLEDGER_DELIVERY_FILES_CHANGED');
  for (const file of expected) await new LocalFile({ ...file, path: join(directory, file.path) }).verify({ signal });
  return new AgentLedgerDelivery(directory, snapshot, record, manifest, received);
}
export class AgentLedgerDelivery {
  constructor(directory, snapshot, record, manifest, received) {
    this.directory = directory; this.snapshot = snapshot; this.record = frozen(structuredClone(record));
    this.manifest = frozen(structuredClone(manifest)); this.received = received;
  }
  response(intentId) { return this.received.response(intentId); }
  toJSON() { return { schema: DELIVERY, directory: this.directory, taskSha256: this.record.sha256,
    agent: this.record.manifest.agent, task: this.received.task, files: this.received.files,
    outcomes: this.received.outcomes, report: join(this.directory, 'index.html') }; }
}
export function compareAgentLedgerTasks(previous, next) {
  need(previous instanceof AgentLedgerTask && next instanceof AgentLedgerTask, 'AGENTLEDGER_TASKS_REQUIRED');
  need(sha(previous.record.manifest.agent) === sha(next.record.manifest.agent), 'AGENTLEDGER_SAME_AGENT_REQUIRED');
  return { previous: previous.sha256, next: next.sha256,
    ledger: compareAgentLedgerSnapshots(previous.snapshot, next.snapshot),
    task: compareInboxTasks(previous.originalTask.record, next.originalTask.record),
    decisions: next.record.manifest.joins.map(row => {
      const before = previous.record.manifest.joins.find(item => item.selection.role === row.selection.role);
      return { role: row.selection.role, previousSequence: before?.decision.seq ?? null,
        nextSequence: row.decision.seq, decisionChanged: before?.decision.hash !== row.decision.hash,
        settlementHistoryChanged: sha(before?.settlementRecords ?? []) !== sha(row.settlementRecords) };
    }) };
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function cell(label, content) { return '<td data-label="' + esc(label) + '">' + content + '</td>'; }
function renderWorkbench(snapshot, { task, received } = {}) {
  const joins = task?.manifest.joins ?? [], agentNames = [...new Set(snapshot.entries.map(row => row.agentId))].sort();
  const networks = [...new Set(snapshot.entries.map(row => row.network).filter(Boolean))].sort();
  const verdicts = [...new Set(snapshot.entries.map(row => row.verdict))].sort();
  const outputByIntent = new Map((received?.files ?? []).map((file, i) => [file.intentId, { file, outcome: received.outcomes[i] }]));
  const rows = snapshot.entries.map(entry => {
    const joined = joins.find(row => row.decision.seq === entry.seq);
    const settlements = entry.kind === 'decision' ? snapshot.settlements(entry) : [];
    const output = joined ? outputByIntent.get(joined.selection.intentId) : null;
    const details = '<details><summary>Full recorded entry</summary><pre>' + esc(JSON.stringify(entry, null, 2)) + '</pre></details>';
    const ledgerSettlement = settlements.length ? settlements.map(row => '#' + row.seq + ' ' + row.verdict +
      (row.txHash ? ' · ' + row.txHash : '')).join('\n') : (entry.txHash ?? (entry.settles ? 'Decision #' + entry.settles : '—'));
    let result = output ? '<a href="results/' + output.file.path + '" download>Complete result</a><br>' +
      output.file.bytes + ' bytes<br><small>' + esc(output.file.sha256) + '</small><br>' +
      'Original HTTP ' + esc(output.outcome.httpStatus ?? 'not recorded') + '<br>' +
      esc(output.outcome.nativeStatus ?? output.outcome.state ?? '') : joined ? 'Original task awaiting complete result' : '—';
    if (output) result += '<details><summary>Original outcome</summary><pre>' +
      esc(JSON.stringify(output.outcome, null, 2)) + '</pre></details>';
    const query = [entry.seq, entry.agentId, entry.tenantId, entry.resource, entry.verdict, entry.rule,
      entry.reason, entry.network, entry.txHash, joined?.selection.intentId].join(' ').toLowerCase();
    return '<tr class="entry" data-agent="' + esc(entry.agentId) + '" data-network="' + esc(entry.network ?? '') +
      '" data-verdict="' + esc(entry.verdict) + '" data-query="' + esc(query) + '">' +
      cell('Recorded', '<strong>#' + entry.seq + '</strong><br><time>' + esc(entry.ts) + '</time>') +
      cell('Agent / resource', '<strong>' + esc(entry.agentId) + '</strong><br>' + esc(entry.method) + ' ' +
        esc(entry.resource) + '<br><small>Tenant ' + esc(entry.tenantId ?? 'not recorded') + '</small>' + details) +
      cell('Decision / amount', '<strong>' + esc(entry.verdict) + '</strong><br>' + esc(entry.rule) +
        '<br>Recorded ' + esc(entry.amount ?? entry.quoted ?? '—') + '<br><small>' + esc(entry.network ?? '') + '</small>' +
        (joined ? '<br><small>Quote ' + esc(joined.recordedAmountAtomic) + ' atomic · original ceiling ' +
          esc(joined.configuredMaxAtomic) + ' atomic</small>' : '')) +
      cell('Ledger settlement', '<pre class="plain">' + esc(ledgerSettlement) + '</pre>') +
      cell('Buyer result', result) + '</tr>';
  }).join('');
  const select = (name, values, label) => '<label>' + label + '<select id="' + name + '"><option value="">All</option>' +
    values.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('') + '</select></label>';
  const title = task ? task.manifest.originalManifest.task.title : 'AgentLedger result workbench';
  const sourcePrefix = task ? 'ledger/' : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title><style>' +
    '*{box-sizing:border-box}body{margin:0;background:#f4f4f4;color:#171717;font:14px system-ui,sans-serif;line-height:1.5}' +
    'header,main{max-width:1500px;margin:auto;padding:24px}header{border-bottom:1px solid #bdbdbd;background:#fff}' +
    'h1{font-size:26px;line-height:1.25;margin:8px 0 12px}h2{font-size:18px}.brand{font-size:12px;text-transform:uppercase;letter-spacing:.08em}' +
    'a{color:inherit;text-decoration:underline}p{max-width:100ch}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}' +
    '.metric{background:#fff;border:1px solid #bbb;padding:14px}.metric strong{display:block;font-size:23px}.metric span{font-size:12px;color:#555}' +
    '.filters{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px;margin:20px 0}label{display:block;font-size:12px;font-weight:600}' +
    'input,select{display:block;width:100%;background:#fff;border:1px solid #888;border-radius:0;padding:9px;margin-top:5px;font:inherit;color:inherit}' +
    'table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:12px;border:1px solid #bbb;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
    'th{background:#e8e8e8;font-size:12px}td:nth-child(1){width:13%}td:nth-child(2){width:25%}td:nth-child(3){width:20%}' +
    'time,small{font-size:12px;overflow-wrap:anywhere}details{margin:12px 0;max-width:100%}summary{cursor:pointer;font-weight:500}' +
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;border:1px solid #ccc;padding:10px;font:12px ui-monospace,monospace}' +
    '.plain{margin:0;background:transparent;border:0;padding:0}.empty{padding:20px;background:#fff;border:1px solid #aaa}.entry[hidden]{display:none}' +
    ':focus-visible{outline:2px solid #111;outline-offset:2px}.source{border-top:1px solid #aaa;margin-top:28px;padding-top:14px}' +
    '@media(max-width:800px){header,main{padding:16px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.filters{grid-template-columns:1fr 1fr}' +
    'h1{font-size:23px}table,tbody,tr,td{display:block}thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}' +
    'tr{margin-bottom:16px;border:1px solid #aaa}td,td:nth-child(1),td:nth-child(2),td:nth-child(3){width:100%;border:0;border-bottom:1px solid #ddd}' +
    'td:last-child{border-bottom:0}td::before{content:attr(data-label);display:block;font-size:11px;font-weight:650;color:#555;margin-bottom:4px}}' +
    '@media(max-width:440px){.filters{grid-template-columns:1fr}}@media print{.filters{display:none}body{background:#fff}tr{break-inside:avoid}}</style></head><body>' +
    '<header><div class="brand">AgentLedger / Buyer operations</div><h1>' + esc(title) + '</h1><p>' +
    esc(task?.manifest.originalManifest.task.purpose ?? 'Review recorded agent decisions and settlement history from one retained ledger window.') +
    '</p><p>' + (received ? '<a href="results/review.html">Open all original buyer results</a> · ' : '') +
    '<a href="' + sourcePrefix + 'ledger.json" download>Complete ledger JSON</a> · <a href="' + sourcePrefix +
    'snapshot.json" download>Capture details</a></p></header><main>' +
    '<div class="summary"><div class="metric"><strong>' + snapshot.entries.length + '</strong><span>Recorded entries</span></div>' +
    '<div class="metric"><strong>' + agentNames.length + '</strong><span>Agent IDs in this window</span></div>' +
    '<div class="metric"><strong>' + joins.length + '</strong><span>Original request joins</span></div>' +
    '<div class="metric"><strong>' + (received?.files.length ?? 0) + '</strong><span>Complete buyer files</span></div></div>' +
    '<div class="filters"><label>Search records<input id="query" type="search" placeholder="Agent, resource, rule, transaction or intent"></label>' +
    select('agent', agentNames, 'Agent') + select('network', networks, 'Network') + select('verdict', verdicts, 'Verdict') + '</div>' +
    '<p id="count" aria-live="polite">' + snapshot.entries.length + ' entries shown</p>' +
    '<table><thead><tr><th>Recorded</th><th>Agent / resource</th><th>Decision / amount</th><th>Ledger settlement</th><th>Buyer result</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table><p class="empty" id="empty" hidden>No records match these filters.</p>' +
    '<section class="source"><h2>Source window</h2><p>Sequences ' + esc(snapshot.window.firstSequence ?? 'empty') + '–' +
    esc(snapshot.window.lastSequence ?? 'empty') + ' · observed ' + esc(snapshot.manifest.source.observedAt) + '</p>' +
    '<p>The chain check follows AgentLedger’s documented field order within this captured window. The original JSON retains every field, including reason, tenant and settlement references.</p>' +
    '<details><summary>Capture and chain details</summary><pre>' + esc(JSON.stringify(snapshot.manifest, null, 2)) + '</pre></details>' +
    '<details><summary>Recorded account state</summary><pre>' + esc(JSON.stringify({
      state: snapshot.inspection.body.state ?? null, mainnetPolicy: snapshot.inspection.body.mainnetPolicy ?? null,
      reportedIntegrity: snapshot.inspection.body.integrity ?? null }, null, 2)) + '</pre></details>' +
    (task ? '<details><summary>Caller, request and decision bindings</summary><pre>' + esc(JSON.stringify(task, null, 2)) + '</pre></details>' : '') +
    '</section></main><script>' +
    'const rows=[...document.querySelectorAll(".entry")],query=document.getElementById("query"),agent=document.getElementById("agent"),' +
    'network=document.getElementById("network"),verdict=document.getElementById("verdict");function filter(){let n=0;const q=query.value.trim().toLowerCase();' +
    'for(const row of rows){const show=(!q||row.dataset.query.includes(q))&&(!agent.value||row.dataset.agent===agent.value)&&' +
    '(!network.value||row.dataset.network===network.value)&&(!verdict.value||row.dataset.verdict===verdict.value);row.hidden=!show;if(show)n++;}' +
    'document.getElementById("count").textContent=n+" entries shown";document.getElementById("empty").hidden=n!==0;}' +
    'for(const control of [query,agent,network,verdict]){control.addEventListener("input",filter);control.addEventListener("change",filter);}' +
    '</script></body></html>\n';
}
