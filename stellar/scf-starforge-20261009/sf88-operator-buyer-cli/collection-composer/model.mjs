// MIT — Retained authoring over the original SF88 builder and collection controller.
import { createHash } from 'node:crypto';
import { openPlanExchange } from './exchange.mjs';
import { openCollectionInputLibrary } from './input-library.mjs';
import { readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { prepareReview } from '../prepare.mjs';
import { config, execution, bytes as originalBytes } from '../config.mjs';
import { openWorkspace } from '../workspace.mjs';
import { readRequestBody, requestBodyPin } from '../request-body.mjs';
import { loadOperationTicket, operationTicketView } from '../operation-ticket.mjs';
import { previewCollection, acquireCollectionLease } from '../collections/model.mjs';
import { initializationDirectory, initializationBytes, optionalInitializationBytes,
  retainInitializationFile, retainInitializationRecord } from '../initialization.mjs';
import { COLLECTION_PLAN_SCHEMA, COLLECTION_EDITION_SCHEMA, validateCollectionPlan,
  resolveCollectionEdition, stableJson, plain, fields, need } from './plan.mjs';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const MAX_INPUT = 128 * 1024 * 1024;
const MAX_RECORD = 32 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(stableJson(value) + '\n');
const parse = bytes => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { need(false, 'COLLECTION_AUTHORING_JSON_INVALID'); }
};
const codeOf = error => /^[A-Z0-9_]{1,120}$/.test(error?.code ?? '')
  ? error.code : 'COLLECTION_AUTHORING_SOURCE_UNAVAILABLE';
function absolute(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path
    && path !== '/' && !path.includes('\0'), 'COLLECTION_AUTHORING_ABSOLUTE_PATH_REQUIRED');
  return path;
}
function checkedId(id) { need(ID.test(id ?? ''), 'COLLECTION_PLAN_ID_INVALID'); return id; }
function checkedHash(value) { need(HASH.test(value ?? ''), 'COLLECTION_PLAN_REVISION_REQUIRED'); return value; }
async function readOriginal(path, limit) {
  absolute(path);
  need(await realpath(path) === path, 'COLLECTION_AUTHORING_SOURCE_PATH_AMBIGUOUS');
  return initializationBytes(path, limit);
}
// Public saved catalogs use the original regular-file reader; snapshots stay private.
async function readDiscovery(path) {
  absolute(path);
  need(await realpath(path) === path, 'COLLECTION_AUTHORING_SOURCE_PATH_AMBIGUOUS');
  return originalBytes(path, 1048576, 'INVALID_DISCOVERY_FILE');
}
async function optionalRecord(path, limit = MAX_RECORD) {
  const bytes = await optionalInitializationBytes(path, limit);
  return bytes === null ? null : parse(bytes);
}
async function directories(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  return entries.filter(item => item.isDirectory() && !item.isSymbolicLink()).map(item => item.name);
}
function filePath(path, key) {
  need(typeof path === 'string' && (
    /^catalogs\/[a-f0-9]{64}\.json$/.test(path)
    || new RegExp('^inputs/' + key.replaceAll('.', '\\.') +
      '/(?:operator-source\\.json|operator-workspace\\.json|request-body\\.bin|operation-ticket\\.json|config\\.json)$').test(path)),
  'COLLECTION_EDITION_FILE_INVALID');
  return path;
}
function checkedCapture(value, key, base) {
  need(value?.schema === 'stellar-forge.sf88.collection-request-capture.v1'
    && value.request?.key === key && KEY.test(key)
    && typeof value.request.intentId === 'string'
    && value.request.configFile === join(base, 'inputs', key, 'config.json')
    && Array.isArray(value.files) && value.files.length >= 3 && value.files.length <= 6,
  'COLLECTION_EDITION_CAPTURE_INVALID');
  const paths = new Set();
  for (const file of value.files) {
    filePath(file.path, key);
    need(!paths.has(file.path) && HASH.test(file.sha256 ?? '') && Number.isSafeInteger(file.bytes)
      && file.bytes >= 0 && file.bytes <= MAX_INPUT, 'COLLECTION_EDITION_FILE_INVALID');
    paths.add(file.path);
  }
  for (const name of ['operator-source.json', 'config.json'])
    need(paths.has('inputs/' + key + '/' + name), 'COLLECTION_EDITION_CAPTURE_INVALID');
  need(paths.has('catalogs/' + value.request.discovery?.sha256 + '.json'),
    'COLLECTION_EDITION_CAPTURE_INVALID');
  return value;
}
async function verifyFiles(base, files) {
  let total = 0;
  for (const file of files) {
    total += file.bytes; need(total <= MAX_INPUT, 'COLLECTION_AUTHORING_INPUT_BYTES_EXCEEDED');
    const path = join(base, file.path);
    await initializationDirectory(dirname(path));
    const raw = await initializationBytes(path, Math.max(file.bytes, 1));
    need(raw.length === file.bytes && hash(raw) === file.sha256, 'COLLECTION_EDITION_INPUT_CHANGED');
  }
}
function uniqueFiles(captures) {
  const files = new Map();
  for (const capture of captures) for (const file of capture.files) {
    need(!files.has(file.path) || same(files.get(file.path), file), 'COLLECTION_EDITION_INPUT_CHANGED');
    files.set(file.path, file);
  }
  const result = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  need(result.reduce((sum, file) => sum + file.bytes, 0) <= MAX_INPUT,
    'COLLECTION_AUTHORING_INPUT_BYTES_EXCEEDED');
  return result;
}
function boundOperator(original, prepared, manifest) {
  const prior = execution(original), chosen = execution(prepared);
  const limit = manifest?.signer?.maxAtomic ?? prior.op.expect.maxAtomic;
  for (const key of ['scheme', 'network', 'asset', 'payTo'])
    need(prior.op.expect[key] === chosen.op.expect[key], 'COLLECTION_PLAN_OPERATOR_TERMS_MISMATCH');
  need((prior.op.expect.paymentFlow ?? 'authorization') === (chosen.op.expect.paymentFlow ?? 'authorization')
    && typeof limit === 'string' && BigInt(chosen.op.expect.maxAtomic) <= BigInt(limit),
  'COLLECTION_PLAN_OPERATOR_LIMIT_EXCEEDED');
  return chosen;
}
async function readOperator(request) {
  let original, path, manifest = null, manifestBytes = null;
  if (request.operatorWorkspace !== undefined) {
    const directory = absolute(request.operatorWorkspace);
    await initializationDirectory(directory);
    const opened = await openWorkspace(['--dir', directory]);
    path = opened.configPath; original = opened.config; manifest = opened.manifest;
    manifestBytes = await readOriginal(join(directory, 'workspace.json'), 65536);
    need(same(parse(manifestBytes), manifest), 'COLLECTION_PLAN_OPERATOR_CHANGED');
  } else {
    path = absolute(request.operatorConfigFile);
    original = await config(path);
  }
  const raw = await readOriginal(path, 65536);
  need(same(parse(raw), original) && raw.equals(await readOriginal(path, 65536)),
    'COLLECTION_PLAN_OPERATOR_CHANGED');
  execution(original);
  return { original, path, raw, manifest, manifestBytes };
}
async function checkOperatorBinding(request) {
  const binding = request.operator;
  const current = await readOperator(binding.workspaceDirectory
    ? { operatorWorkspace: binding.workspaceDirectory } : { operatorConfigFile: binding.configFile });
  need(current.path === binding.configFile && hash(current.raw) === binding.sha256
    && (binding.manifestSha256 === undefined || hash(current.manifestBytes) === binding.manifestSha256),
  'COLLECTION_PLAN_OPERATOR_CHANGED');
}
/** Read the exact saved native catalog. Selection validation belongs to prepareReview. */
export async function inspectCollectionCatalog({ path } = {}) {
  const raw = await readDiscovery(path), saved = parse(raw);
  need(plain(saved), 'INVALID_SAVED_DISCOVERY');
  let rows, source = null;
  if (saved.schema === 'scf61-observed-native-page-v1') {
    need(saved.readOnly === true && saved.paidOrSettled === false
      && !['resources', 'items', 'originalListings'].some(key => Object.hasOwn(saved, key))
      && (saved.sourceUrl === undefined || typeof saved.sourceUrl === 'string'), 'INVALID_SAVED_DISCOVERY');
    rows = saved.nativeProviderRows; source = saved.sourceUrl ?? null;
  } else if (saved.mode === 'ORIGINAL_UNSIGNED_CATALOG') {
    need(!Object.hasOwn(saved, 'resources') && !Object.hasOwn(saved, 'items')
      && ['resources', 'items'].includes(saved.sourceEnvelope) && typeof saved.source === 'string',
    'INVALID_SAVED_DISCOVERY');
    rows = saved.originalListings; source = saved.source;
  } else {
    const resources = Object.hasOwn(saved, 'resources'), items = Object.hasOwn(saved, 'items');
    need(resources !== items && !Object.hasOwn(saved, 'originalListings'), 'INVALID_SAVED_DISCOVERY');
    rows = saved[resources ? 'resources' : 'items'];
  }
  need(Array.isArray(rows), 'INVALID_SAVED_DISCOVERY');
  return { schema: 'stellar-forge.sf88.collection-catalog.v1', path, sha256: hash(raw), bytes: raw.length, source,
    rows: rows.map((row, index) => ({ index,
      resource: typeof row?.resource === 'string' ? row.resource : row?.resource?.url ?? '',
      description: row?.description ?? row?.resource?.description ?? '',
      method: row?.extensions?.bazaar?.info?.input?.method ?? 'GET',
      accepts: Array.isArray(row?.accepts) ? row.accepts.map((item, index) => ({ ...item, index })) : [],
      listing: row })) };
}
export function openCollectionComposer({ collections } = {}) {
  need(collections && typeof collections.create === 'function' && typeof collections.inspect === 'function'
    && typeof collections.list === 'function', 'COLLECTION_CONTROLLER_REQUIRED');
  const originalDirectory = absolute(collections.directory), directory = join(originalDirectory, 'authoring');
  const plansDirectory = join(directory, 'plans'), editionsDirectory = join(directory, 'editions');
  let closed = false;
  const live = () => need(!closed, 'COLLECTION_AUTHORING_CLOSED');
  async function mutate(action) {
    live();
    const releaseRoot = await acquireCollectionLease(originalDirectory, { shared: true });
    let releaseAuthoring;
    try {
      await initializationDirectory(directory, { create: true });
      releaseAuthoring = await acquireCollectionLease(directory);
      await initializationDirectory(plansDirectory, { create: true });
      await initializationDirectory(editionsDirectory, { create: true });
      live(); return await action();
    } finally { if (releaseAuthoring) await releaseAuthoring(); await releaseRoot(); }
  }
  async function retainPlan(input) {
    const plan = validateCollectionPlan(input), raw = json(plan), planSha256 = hash(raw);
      const parent = join(plansDirectory, plan.id), location = join(parent, planSha256);
      await initializationDirectory(parent, { create: true });
      await initializationDirectory(location, { create: true });
      await retainInitializationFile(join(location, 'plan.json'), raw, { resume: true });
      const revision = await retainInitializationRecord(join(location, 'revision.json'),
        { schema: 'stellar-forge.sf88.collection-plan-revision.v1', id: plan.id, planSha256,
          savedAt: new Date().toISOString() }, { resume: true, ignore: ['savedAt'] });
      return { ...revision, plan };
  }
  async function savePlan({ plan: input } = {}) {
    return mutate(() => retainPlan(input));
  }
  async function inspectPlan(id, planSha256) {
    live(); checkedId(id); checkedHash(planSha256);
    const path = join(plansDirectory, id, planSha256);
    const raw = await initializationBytes(join(path, 'plan.json'), 1048576);
    const plan = validateCollectionPlan(parse(raw));
    need(plan.id === id && hash(raw) === planSha256 && raw.equals(json(plan)), 'COLLECTION_PLAN_REVISION_CHANGED');
    const revision = await optionalRecord(join(path, 'revision.json'), 65536);
    need(revision?.schema === 'stellar-forge.sf88.collection-plan-revision.v1'
      && revision.id === id && revision.planSha256 === planSha256 && typeof revision.savedAt === 'string',
    'COLLECTION_PLAN_REVISION_INCOMPLETE');
    return { ...revision, plan };
  }
  async function listPlans() {
    live(); const plans = [];
    for (const id of await directories(plansDirectory)) {
      if (!ID.test(id)) continue;
      for (const planSha256 of await directories(join(plansDirectory, id))) {
        if (!HASH.test(planSha256)) continue;
        try {
          const saved = await inspectPlan(id, planSha256);
          plans.push({ id, planSha256, name: saved.plan.name, description: saved.plan.description ?? '',
            savedAt: saved.savedAt, requestCount: saved.plan.requests.length, parameters: saved.plan.parameters });
        } catch (error) { plans.push({ id, planSha256, name: id, error: codeOf(error) }); }
      }
    }
    plans.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || a.id.localeCompare(b.id)
      || a.planSha256.localeCompare(b.planSha256));
    return { schema: 'stellar-forge.sf88.collection-plans.v1', directory, plans };
  }
  async function captureRequest(request, base) {
    const folder = join(base, 'inputs', request.key);
    await initializationDirectory(folder, { create: true });
    const saved = await optionalRecord(join(folder, 'capture.json'));
    if (saved) {
      const retained = checkedCapture(saved, request.key, base);
      need(retained.request.intentId === request.intentId
        && retained.selectionSha256 === hash(json(request)), 'COLLECTION_EDITION_REQUEST_CHANGED');
      await verifyFiles(base, retained.files);
      return retained;
    }
    const discovery = await readDiscovery(request.discoveryFile);
    const operator = await readOperator(request);
    const body = request.bodyFile === undefined ? undefined : await readRequestBody({ bodyFile: absolute(request.bodyFile) });
    const selected = { rowIndex: request.rowIndex, acceptIndex: request.acceptIndex, intentId: request.intentId,
      url: request.url, method: request.method,
      ...(body === undefined ? {} : { bodyFile: request.bodyFile, ...requestBodyPin(body) }),
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.ticketFile === undefined ? {} : { ticketFile: absolute(request.ticketFile) }),
      ...(request.ticketHeader === undefined ? {} : { ticketHeader: request.ticketHeader }),
      ...(request.responseOut === undefined ? {} : { responseOut: absolute(request.responseOut) }) };
    const { draft } = prepareReview(discovery, selected);
    const ticket = await loadOperationTicket(draft.operation, { requireCurrent: true });
    const configured = { ...draft };
    for (const key of ['operator', 'signerModule', 'evidenceDir', 'trustedPayer', 'buyerTransport', 'requestTimeoutMs'])
      if (operator.original[key] !== undefined) configured[key] = operator.original[key];
    boundOperator(operator.original, configured, operator.manifest);
    if (request.responseOut !== undefined) {
      const present = await lstat(request.responseOut).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      need(present === null, 'COLLECTION_EDITION_OUTPUT_EXISTS');
    }
    configured.operation = { ...draft.operation,
      ...(body === undefined ? {} : { bodyFile: join(folder, 'request-body.bin') }),
      ...(ticket === null ? {} : { ticketFile: join(folder, 'operation-ticket.json') }) };
    execution(configured);
    const configuredBytes = json(configured);
    need(configuredBytes.length <= 65536, 'PREPARED_CONFIG_EXCEEDS_CONFIG_LIMIT');
    const content = [
      { path: 'catalogs/' + hash(discovery) + '.json', raw: discovery },
      { path: 'inputs/' + request.key + '/operator-source.json', raw: operator.raw },
      { path: 'inputs/' + request.key + '/config.json', raw: configuredBytes },
      ...(operator.manifestBytes ? [{ path: 'inputs/' + request.key + '/operator-workspace.json', raw: operator.manifestBytes }] : []),
      ...(body === undefined ? [] : [{ path: 'inputs/' + request.key + '/request-body.bin', raw: Buffer.from(body) }]),
      ...(ticket === null ? [] : [{ path: 'inputs/' + request.key + '/operation-ticket.json', raw: ticket.sourceBytes }]),
    ];
    for (const file of content)
      await retainInitializationFile(join(base, file.path), file.raw, { resume: true });
    const { owner } = execution(configured);
    const retained = { schema: 'stellar-forge.sf88.collection-request-capture.v1',
      selectionSha256: hash(json(request)), request: {
        key: request.key, name: request.name, intentId: request.intentId,
        configFile: join(folder, 'config.json'),
        discovery: { path: request.discoveryFile, sha256: hash(discovery), bytes: discovery.length,
          retainedPath: join(base, 'catalogs', hash(discovery) + '.json'), rowIndex: request.rowIndex, acceptIndex: request.acceptIndex },
        operator: { configFile: operator.path, sha256: hash(operator.raw), actor: owner.actor, service: owner.service,
          policy: owner.policy, ledger: owner.ledger, signerModule: configured.signerModule, evidenceDir: configured.evidenceDir,
          ...(request.operatorWorkspace === undefined ? {} : { workspaceDirectory: request.operatorWorkspace,
            manifestSha256: hash(operator.manifestBytes) }) },
        responseOut: configured.responseFile?.destination ?? null,
        operation: configured.operation, operationTicket: operationTicketView(ticket),
      }, files: content.map(file => ({ path: file.path, bytes: file.raw.length, sha256: hash(file.raw) })) };
    checkedCapture(retained, request.key, base);
    await retainInitializationFile(join(folder, 'capture.json'), json(retained), { resume: true });
    return retained;
  }
  async function readEdition(id) {
    live(); checkedId(id);
    const base = join(editionsDirectory, id);
    const requestRaw = await optionalInitializationBytes(join(base, 'request.json'), 2 * 1024 * 1024);
    need(requestRaw !== null, 'COLLECTION_EDITION_NOT_FOUND');
    const request = parse(requestRaw);
    const savedPlan = await inspectPlan(request.planId, request.planSha256);
    const resolved = resolveCollectionEdition(savedPlan.plan, {
      planId: request.planId, planSha256: request.planSha256, collectionId: id,
      name: request.name, values: request.values,
    });
    need(request.collectionId === id && typeof request.createdAt === 'string'
      && same({ ...resolved, createdAt: request.createdAt }, request), 'COLLECTION_EDITION_REQUEST_CHANGED');
    const raw = await optionalInitializationBytes(join(base, 'edition.json'), MAX_RECORD);
    if (raw === null) return { base, request, savedPlan, edition: null, editionSha256: null };
    const edition = parse(raw);
    need(edition.schema === COLLECTION_EDITION_SCHEMA && edition.collectionId === id
      && edition.requestSha256 === hash(requestRaw) && edition.planSha256 === request.planSha256
      && edition.planId === request.planId && edition.name === request.name
      && Array.isArray(edition.captures) && edition.captures.length === request.requests.length,
    'COLLECTION_EDITION_INVALID');
    edition.captures.forEach((value, index) => {
      checkedCapture(value, request.requests[index].key, base);
      need(value.selectionSha256 === hash(json(request.requests[index]))
        && value.request.intentId === request.requests[index].intentId, 'COLLECTION_EDITION_REQUEST_CHANGED');
    });
    need(same(edition.files, uniqueFiles(edition.captures))
      && same(edition.configFiles, edition.captures.map(value => value.request.configFile))
      && same(edition.values, request.values) && edition.createdAt === request.createdAt
      && HASH.test(edition.preview?.previewSha256 ?? ''), 'COLLECTION_EDITION_INVALID');
    return { base, request, savedPlan, edition, editionSha256: hash(raw) };
  }
  async function originalCollection(id, edition) {
    let snapshot;
    try { snapshot = await collections.inspect(id); }
    catch (error) { if (['COLLECTION_NOT_FOUND', 'ENOENT'].includes(error.code)) return null; throw error; }
    need(edition && snapshot.name === edition.name
      && snapshot.previewSha256 === edition.preview.previewSha256, 'COLLECTION_EDITION_ID_CONFLICT');
    return snapshot;
  }
  async function inspectEdition(id) {
    const saved = await readEdition(id), { request, edition } = saved;
    const common = { schema: COLLECTION_EDITION_SCHEMA, collectionId: id, name: request.name,
      planId: request.planId, planSha256: request.planSha256, values: request.values, createdAt: request.createdAt,
      editionSha256: saved.editionSha256 };
    if (!edition) return { ...common, phase: 'PREPARING', preview: null, requests: [], workspaceByIntent: {},
      collection: null, issues: [{ code: 'COLLECTION_EDITION_PREPARATION_INCOMPLETE' }] };
    const issues = [];
    try { await verifyFiles(saved.base, edition.files); }
    catch (error) { issues.push({ code: codeOf(error) }); }
    for (const capture of edition.captures) {
      try { await checkOperatorBinding(capture.request); }
      catch (error) { issues.push({ key: capture.request.key, code: codeOf(error) }); }
    }
    try {
      const preview = await previewCollection({ configFiles: edition.configFiles });
      need(preview.previewSha256 === edition.preview.previewSha256, 'COLLECTION_EDITION_REVIEW_CHANGED');
    } catch (error) { issues.push({ code: codeOf(error) }); }
    let collection = null;
    try { collection = await originalCollection(id, edition); }
    catch (error) { issues.push({ code: codeOf(error) }); }
    const workspaceByIntent = Object.fromEntries(edition.captures.filter(value => value.request.operator.workspaceDirectory)
      .map(value => [value.request.intentId, value.request.operator.workspaceDirectory]));
    return { ...common, phase: collection && collection.state !== 'PREPARING' ? 'CREATED' : issues.length ? 'REVIEW_REQUIRED' : 'PREPARED',
      preview: edition.preview, requests: edition.captures.map(value => value.request),
      workspaceByIntent, collection, issues };
  }
  async function prepareEdition(input) {
    live();
    const plan = await inspectPlan(input?.planId, input?.planSha256);
    const resolved = resolveCollectionEdition(plan.plan, input);
    const outputs = resolved.requests.filter(item => item.responseOut !== undefined).map(item => absolute(item.responseOut));
    need(new Set(outputs).size === outputs.length, 'COLLECTION_EDITION_DUPLICATE_OUTPUT');
    for (const request of resolved.requests) {
      absolute(request.discoveryFile);
      if (request.bodyFile !== undefined) absolute(request.bodyFile);
      if (request.ticketFile !== undefined) absolute(request.ticketFile);
    }
    return mutate(async () => {
      const base = join(editionsDirectory, resolved.collectionId);
      await initializationDirectory(base, { create: true });
      const prior = await optionalRecord(join(base, 'request.json'), 2 * 1024 * 1024);
      need(prior === null || same({ ...resolved, createdAt: prior.createdAt }, prior), 'COLLECTION_EDITION_ID_CONFLICT');
      const request = prior ?? { ...resolved, createdAt: new Date().toISOString() };
      await retainInitializationFile(join(base, 'request.json'), json(request), { resume: true });
      if (await optionalInitializationBytes(join(base, 'edition.json'), MAX_RECORD))
        return inspectEdition(resolved.collectionId);
      await initializationDirectory(join(base, 'inputs'), { create: true });
      await initializationDirectory(join(base, 'catalogs'), { create: true });
      const captures = [];
      for (const selected of resolved.requests) {
        captures.push(await captureRequest(selected, base));
        uniqueFiles(captures);
      }
      const files = uniqueFiles(captures), configFiles = captures.map(value => value.request.configFile);
      await verifyFiles(base, files);
      const preview = await previewCollection({ configFiles });
      const edition = { schema: COLLECTION_EDITION_SCHEMA, collectionId: request.collectionId, name: request.name,
        planId: request.planId, planSha256: request.planSha256, values: request.values, createdAt: request.createdAt,
        requestSha256: hash(json(request)), captures, files, configFiles, preview };
      const raw = json(edition);
      need(raw.length <= MAX_RECORD, 'COLLECTION_EDITION_TOO_LARGE');
      await retainInitializationFile(join(base, 'edition.json'), raw, { resume: true });
      return inspectEdition(resolved.collectionId);
    });
  }
  async function createEdition({ collectionId, expectedEditionSha256, expectedPreviewSha256 } = {}) {
    checkedId(collectionId); checkedHash(expectedEditionSha256); checkedHash(expectedPreviewSha256);
    return mutate(async () => {
      const saved = await readEdition(collectionId);
      need(saved.edition && saved.editionSha256 === expectedEditionSha256
        && saved.edition.preview.previewSha256 === expectedPreviewSha256, 'COLLECTION_EDITION_REVIEW_CHANGED');
      const existing = await originalCollection(collectionId, saved.edition);
      if (existing && existing.state !== 'PREPARING') {
        await retainInitializationRecord(join(saved.base, 'created.json'),
          { schema: 'stellar-forge.sf88.collection-edition-created.v1', collectionId,
            editionSha256: expectedEditionSha256, manifestSha256: existing.manifestSha256 }, { resume: true });
        return inspectEdition(collectionId);
      }
      const current = await inspectEdition(collectionId);
      need(current.phase === 'PREPARED' && current.issues.length === 0, 'COLLECTION_EDITION_REVIEW_REQUIRED');
      const result = await collections.create({ id: collectionId, name: saved.request.name,
        configFiles: saved.edition.configFiles, expectedPreviewSha256 });
      await retainInitializationRecord(join(saved.base, 'created.json'),
        { schema: 'stellar-forge.sf88.collection-edition-created.v1', collectionId,
          editionSha256: expectedEditionSha256, manifestSha256: result.manifestSha256 }, { resume: true });
      return inspectEdition(collectionId);
    });
  }
  async function listEditions() {
    live(); const editions = [];
    for (const id of await directories(editionsDirectory)) {
      if (!ID.test(id)) continue;
      try {
        const saved = await readEdition(id);
        const created = await optionalRecord(join(saved.base, 'created.json'), 65536);
        need(created === null || created.schema === 'stellar-forge.sf88.collection-edition-created.v1'
          && created.collectionId === id && created.editionSha256 === saved.editionSha256
          && HASH.test(created.manifestSha256 ?? ''), 'COLLECTION_EDITION_INVALID');
        const original = saved.edition ? await originalCollection(id, saved.edition) : null;
        editions.push({ collectionId: id, name: saved.request.name, planId: saved.request.planId,
          planSha256: saved.request.planSha256, values: saved.request.values, createdAt: saved.request.createdAt,
          editionSha256: saved.editionSha256,
          phase: original && original.state !== 'PREPARING' ? 'CREATED' : saved.edition ? 'PREPARED' : 'PREPARING',
          requestCount: saved.request.requests.length });
      } catch (error) { editions.push({ collectionId: id, name: id, phase: 'REVIEW_REQUIRED', error: codeOf(error) }); }
    }
    editions.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.collectionId.localeCompare(b.collectionId));
    return { schema: 'stellar-forge.sf88.collection-editions.v1', directory, editions };
  }
  // Called inside the original recovery root lease. Completed request snapshots
  // discover their original operator roots even before the collection is created.
  async function inspectRecoverySources() {
    live(); const configFiles = [], operatorConfigFiles = [];
    for (const id of await directories(editionsDirectory)) {
      if (!ID.test(id)) continue;
      const saved = await readEdition(id);
      for (let index = 0; index < saved.request.requests.length; index++) {
        const request = saved.request.requests[index];
        const value = saved.edition?.captures[index]
          ?? await optionalRecord(join(saved.base, 'inputs', request.key, 'capture.json'));
        if (value === null) continue;
        const capture = checkedCapture(value, request.key, saved.base);
        need(capture.selectionSha256 === hash(json(request))
          && capture.request.intentId === request.intentId, 'COLLECTION_EDITION_REQUEST_CHANGED');
        await verifyFiles(saved.base, capture.files);
        configFiles.push(capture.request.configFile);
        operatorConfigFiles.push(capture.request.operator.configFile);
      }
    }
    return { configFiles: [...new Set(configFiles)], operatorConfigFiles: [...new Set(operatorConfigFiles)] };
  }
  const sharing = openPlanExchange({ directory, mutate, live, retainPlan,
    async preparedSource(collectionId, expectedEditionSha256) {
      const source = await readEdition(collectionId);
      need(source.edition && source.editionSha256 === expectedEditionSha256, 'COLLECTION_EDITION_REVIEW_CHANGED');
      await verifyFiles(source.base, source.edition.files);
      return source;
    },
    async reviewLocalRequest(request) {
      const discovery = await readDiscovery(request.discoveryFile), operator = await readOperator(request);
      const body = request.bodyFile === undefined ? undefined : await readRequestBody({ bodyFile: absolute(request.bodyFile) });
      const selected = { rowIndex: request.rowIndex, acceptIndex: request.acceptIndex,
        intentId: request.intentId, url: request.url, method: request.method,
        ...(body === undefined ? {} : { bodyFile: request.bodyFile, ...requestBodyPin(body) }),
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.ticketFile === undefined ? {} : { ticketFile: absolute(request.ticketFile) }),
        ...(request.ticketHeader === undefined ? {} : { ticketHeader: request.ticketHeader }),
        responseOut: absolute(request.responseOut) };
      const { draft } = prepareReview(discovery, selected);
      const ticket = await loadOperationTicket(draft.operation, { requireCurrent: true });
      const configured = { ...draft };
      for (const key of ['operator','signerModule','evidenceDir','trustedPayer','buyerTransport','requestTimeoutMs'])
        if (operator.original[key] !== undefined) configured[key] = operator.original[key];
      const selectedOperation = boundOperator(operator.original, configured, operator.manifest);
      const present = await lstat(request.responseOut).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      need(present === null, 'COLLECTION_EDITION_OUTPUT_EXISTS');
      return { configFile: operator.path, configSha256: hash(operator.raw),
        ...(operator.manifestBytes ? { manifestSha256: hash(operator.manifestBytes) } : {}),
        expect: selectedOperation.op.expect, ticket: operationTicketView(ticket),
        responseOut: request.responseOut };
    },
  });
  const inputs = openCollectionInputLibrary({directory,mutate,live,inspectCatalog:inspectCollectionCatalog});
  return Object.freeze({ directory, inputs, sharing, savePlan, inspectPlan, listPlans, prepareEdition, createEdition,
    inspectEdition, listEditions, inspectRecoverySources, inspectCatalog: inspectCollectionCatalog,
    close() { closed = true; } });
}
