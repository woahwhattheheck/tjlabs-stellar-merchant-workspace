// MIT — Data-only plan transfer and explicit adoption into the original authoring store.
import { createHash } from 'node:crypto';
import { readdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { initializationDirectory, initializationBytes, optionalInitializationBytes,
  retainInitializationFile, retainInitializationRecord } from '../initialization.mjs';
import { validateCollectionPlan, resolveCollectionEdition, fields, need, plain } from './plan.mjs';
import { PLAN_PACKAGE_SCHEMA, PLAN_PACKAGE_STATUS_SCHEMA, PLAN_PACKAGE_CHUNK_BYTES,
  PLAN_PACKAGE_MAX_BYTES, PLAN_PACKAGE_MANIFEST_BYTES, packageJson, validatePackageManifest,
  credentialHeader, representationHeader, chunkByteLength } from './package-format.mjs';

const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => Buffer.from(packageJson(value));
const hashValue = value => digest(encoded(value));
const fail = (condition, suffix) => need(condition, 'COLLECTION_PACKAGE_' + suffix);
const parse = bytes => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(false, 'JSON_INVALID'); }
};
const checkedHash = value => { fail(typeof value === 'string' && HASH.test(value), 'HASH_REQUIRED'); return value; };
function absolute(value) {
  fail(typeof value === 'string' && isAbsolute(value) && value !== '/' && resolve(value) === value
    && !value.includes('\0') && !value.includes('{{'), 'LOCAL_PATH_REQUIRED');
  return value;
}
async function names(path) {
  return (await readdir(path, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => entry.name);
}
export function openPlanExchange({ directory, mutate, live, preparedSource, retainPlan, reviewLocalRequest }) {
  const root = join(directory, 'sharing'), packages = join(root, 'packages'), objects = join(root, 'objects');
  const packageDir = sha => join(packages, checkedHash(sha));
  const objectDir = sha => join(objects, checkedHash(sha));
  const objectPath = sha => join(objectDir(sha), 'data');
  async function ensure() {
    await initializationDirectory(root, { create: true });
    await initializationDirectory(packages, { create: true });
    await initializationDirectory(objects, { create: true });
  }
  async function manifestFor(packageSha256) {
    live();
    const raw = await initializationBytes(join(packageDir(packageSha256), 'manifest.json'), PLAN_PACKAGE_MANIFEST_BYTES);
    const manifest = validatePackageManifest(parse(raw));
    fail(digest(raw) === packageSha256 && raw.equals(encoded(manifest))
      && hashValue(manifest.plan) === manifest.planSha256, 'MANIFEST_CHANGED');
    return manifest;
  }
  async function completedObject(object) {
    const raw = await optionalInitializationBytes(objectPath(object.sha256), Math.max(1, object.bytes));
    if (raw === null) return null;
    fail(raw.length === object.bytes && digest(raw) === object.sha256, 'OBJECT_CHANGED');
    return raw;
  }
  async function objectStatus(object) {
    const final = await lstat(objectPath(object.sha256)).catch(error => {
      if (error.code === 'ENOENT') return null; throw error;
    });
    if (final) {
      fail(final.isFile() && !final.isSymbolicLink() && final.size === object.bytes, 'OBJECT_CHANGED');
      return { ...object, receivedBytes: object.bytes, complete: true };
    }
    let receivedBytes = 0;
    const partDirectory = join(objectDir(object.sha256), 'parts');
    const entries = new Set(await readdir(partDirectory).catch(error => {
      if (error.code === 'ENOENT') return []; throw error;
    }));
    while (receivedBytes < object.bytes && entries.has(String(receivedBytes))) {
      const size = Math.min(PLAN_PACKAGE_CHUNK_BYTES, object.bytes - receivedBytes);
      const stat = await lstat(join(partDirectory, String(receivedBytes)));
      fail(stat.isFile() && !stat.isSymbolicLink() && stat.size === size, 'CHUNK_CHANGED');
      receivedBytes += size;
    }
    return { ...object, receivedBytes, complete: false };
  }
  async function status(packageSha256, manifest) {
    manifest ??= await manifestFor(packageSha256);
    const result = [];
    for (const object of manifest.objects) result.push(await objectStatus(object));
    const ready = await optionalInitializationBytes(join(packageDir(packageSha256), 'ready.json'), 1024);
    if (ready !== null) fail(parse(ready).packageSha256 === packageSha256, 'STATE_CHANGED');
    const all = result.every(item => item.complete);
    return { schema: PLAN_PACKAGE_STATUS_SCHEMA, packageSha256, manifest,
      phase: ready !== null && all ? 'READY' : 'RECEIVING', objects: result,
      receivedBytes: result.reduce((sum, item) => sum + item.receivedBytes, 0),
      totalBytes: result.reduce((sum, item) => sum + item.bytes, 0) };
  }
  async function retainManifest(input) {
    const manifest = validatePackageManifest(input);
    fail(hashValue(manifest.plan) === manifest.planSha256, 'PLAN_CHANGED');
    const packageSha256 = hashValue(manifest);
    await ensure();
    await initializationDirectory(packageDir(packageSha256), { create: true });
    await retainInitializationFile(join(packageDir(packageSha256), 'manifest.json'), encoded(manifest), { resume: true });
    return { packageSha256, manifest };
  }
  async function receiveManifest({ manifest } = {}) {
    return mutate(async () => {
      const saved = await retainManifest(manifest);
      return status(saved.packageSha256, saved.manifest);
    });
  }
  async function receiveChunk({ packageSha256, objectSha256, offset, base64 } = {}) {
    const size = chunkByteLength(base64), bytes = Buffer.from(base64, 'base64');
    fail(bytes.length === size && bytes.toString('base64') === base64, 'CHUNK_INVALID');
    return mutate(async () => {
      const manifest = await manifestFor(packageSha256), object = manifest.objects.find(item => item.sha256 === objectSha256);
      fail(object && Number.isSafeInteger(offset) && offset >= 0 && offset % PLAN_PACKAGE_CHUNK_BYTES === 0
        && size === Math.min(PLAN_PACKAGE_CHUNK_BYTES, object.bytes - offset), 'CHUNK_INVALID');
      const prior = await objectStatus(object);
      fail(offset <= prior.receivedBytes, 'CHUNK_ORDER_INVALID');
      if (prior.complete) {
        const original = await completedObject(object);
        fail(original.subarray(offset, offset + size).equals(bytes), 'CHUNK_CHANGED');
      } else {
        await initializationDirectory(objectDir(objectSha256), { create: true });
        const partDirectory = join(objectDir(objectSha256), 'parts');
        await initializationDirectory(partDirectory, { create: true });
        await retainInitializationFile(join(partDirectory, String(offset)), bytes, { resume: true });
      }
      const current = await objectStatus(object);
      return { schema: 'stellar-forge.sf88.collection-plan-package-chunk.v1',
        packageSha256, objectSha256, bytes: object.bytes,
        receivedBytes: current.receivedBytes, complete: current.complete };
    });
  }
  async function finish(packageSha256, manifest) {
    for (const object of manifest.objects) {
      if (await completedObject(object) !== null) continue;
      await initializationDirectory(objectDir(object.sha256), { create: true });
      const pieces = [];
      for (let offset = 0; offset < object.bytes; offset += PLAN_PACKAGE_CHUNK_BYTES) {
        const size = Math.min(PLAN_PACKAGE_CHUNK_BYTES, object.bytes - offset);
        const bytes = await initializationBytes(join(objectDir(object.sha256), 'parts', String(offset)), size);
        fail(bytes.length === size, 'INCOMPLETE'); pieces.push(bytes);
      }
      const raw = Buffer.concat(pieces);
      fail(raw.length === object.bytes && digest(raw) === object.sha256, 'OBJECT_CHANGED');
      await retainInitializationFile(objectPath(object.sha256), raw, { resume: true });
    }
    await retainInitializationFile(join(packageDir(packageSha256), 'ready.json'),
      encoded({ packageSha256 }), { resume: true });
    return status(packageSha256, manifest);
  }
  async function finishReceiving({ packageSha256 } = {}) {
    return mutate(async () => finish(packageSha256, await manifestFor(packageSha256)));
  }
  async function ready(packageSha256) {
    const manifest = await manifestFor(packageSha256), current = await status(packageSha256, manifest);
    fail(current.phase === 'READY', 'INCOMPLETE');
    for (const object of manifest.objects) fail(await completedObject(object) !== null, 'INCOMPLETE');
    return manifest;
  }
  async function fileFor(packageSha256) {
    const manifest = await ready(packageSha256), folder = packageDir(packageSha256);
    const filename = manifest.plan.id + '.request-plan.jsonl', path = join(folder, filename);
    const metadataPath = join(folder, 'download.json');
    const saved = await optionalInitializationBytes(metadataPath, 4096);
    if (saved) {
      const info = parse(saved), stat = await lstat(path);
      fail(info.packageSha256 === packageSha256 && info.path === path && stat.isFile()
        && !stat.isSymbolicLink() && stat.size === info.bytes && HASH.test(info.sha256), 'DOWNLOAD_CHANGED');
      return { ...info, manifest };
    }
    const temporary = path + '.partial';
    // Only this private operation's interrupted output is removed; all inputs remain immutable.
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const handle = await open(temporary, 'wx', 0o600), hash = createHash('sha256');
    let bytes = 0;
    async function write(value) {
      const raw = encoded(value); hash.update(raw); bytes += raw.length;
      let offset = 0;
      while (offset < raw.length) {
        const result = await handle.write(raw, offset, raw.length - offset);
        fail(result.bytesWritten > 0, 'WRITE_INCOMPLETE'); offset += result.bytesWritten;
      }
    }
    try {
      await write({ type: 'manifest', manifest });
      for (const object of manifest.objects) {
        const raw = await completedObject(object);
        for (let offset = 0; offset < raw.length; offset += PLAN_PACKAGE_CHUNK_BYTES)
          await write({ type: 'object', sha256: object.sha256, offset,
            base64: raw.subarray(offset, offset + PLAN_PACKAGE_CHUNK_BYTES).toString('base64') });
      }
      await write({ type: 'complete', packageSha256 }); await handle.sync();
    } finally { await handle.close(); }
    // A prior final file can only be this same deterministic package after interruption.
    const present = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    fail(present === null || present.isFile() && !present.isSymbolicLink(), 'DOWNLOAD_CHANGED');
    await rename(temporary, path);
    const parent = await open(folder, 'r'); try { await parent.sync(); } finally { await parent.close(); }
    const info = { path, name: filename, bytes, sha256: hash.digest('hex'), packageSha256 };
    await retainInitializationFile(metadataPath, encoded(info), { resume: true });
    return { ...info, manifest };
  }
  async function downloadPackage({ packageSha256 } = {}) {
    live();
    const manifest = await manifestFor(packageSha256);
    const raw = await initializationBytes(join(packageDir(packageSha256), 'download.json'), 4096);
    const descriptor = parse(raw), path = join(packageDir(packageSha256), manifest.plan.id + '.request-plan.jsonl');
    fail(descriptor.path === path && descriptor.packageSha256 === packageSha256
      && descriptor.name === manifest.plan.id + '.request-plan.jsonl'
      && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0
      && HASH.test(descriptor.sha256 ?? ''), 'DOWNLOAD_CHANGED');
    return descriptor;
  }
  async function exportPackage({ collectionId, expectedEditionSha256, headerSelections = [] } = {}) {
    checkedHash(expectedEditionSha256);
    fail(Array.isArray(headerSelections), 'HEADER_SELECTION_INVALID');
    const selectedHeaders = new Map();
    for (const choice of headerSelections) {
      fields(choice, ['key','names'], 'COLLECTION_PACKAGE_HEADER_SELECTION_INVALID');
      fail(typeof choice.key === 'string' && !selectedHeaders.has(choice.key) && Array.isArray(choice.names)
        && choice.names.every(name => typeof name === 'string' && !credentialHeader(name))
        && new Set(choice.names.map(name => name.toLowerCase())).size === choice.names.length, 'HEADER_SELECTION_INVALID');
      selectedHeaders.set(choice.key, new Set(choice.names.map(name => name.toLowerCase())));
    }
    return mutate(async () => {
      const source = await preparedSource(collectionId, expectedEditionSha256);
      const plan = JSON.parse(JSON.stringify(source.savedPlan.plan)), operators = [], sources = [], objectMap = new Map(), groups = new Map();
      fail([...selectedHeaders.keys()].every(key => plan.requests.some(request => request.key === key)), 'HEADER_SELECTION_INVALID');
      await ensure();
      for (let index = 0; index < plan.requests.length; index++) {
        const request = plan.requests[index], capture = source.edition.captures[index], prior = capture.request;
        const binding = request.operatorWorkspace !== undefined ? ['workspace',request.operatorWorkspace] : ['configuration',request.operatorConfigFile];
        const identity = JSON.stringify([binding, prior.operator.sha256, prior.operator.manifestSha256 ?? null]);
        if (!groups.has(identity)) {
          const id = 'operator-' + (operators.length + 1); groups.set(identity, id);
          operators.push({ id, kind: binding[0], path: binding[1], configSha256: prior.operator.sha256,
            ...(prior.operator.manifestSha256 ? { manifestSha256: prior.operator.manifestSha256 } : {}),
            actor: prior.operator.actor, service: prior.operator.service });
        }
        const operatorGroup = groups.get(identity), row = { key: request.key, operatorGroup, headers: [] };
        for (const [kind, relative] of [['catalog','catalogs/' + prior.discovery.sha256 + '.json'],
          ['body','inputs/' + request.key + '/request-body.bin']]) {
          const entry = capture.files.find(file => file.path === relative);
          if (!entry) { fail(kind === 'body' && request.bodyFile === undefined, 'SOURCE_INVALID'); continue; }
          const raw = await initializationBytes(join(source.base, relative), Math.max(entry.bytes, 1));
          fail(raw.length === entry.bytes && digest(raw) === entry.sha256, 'OBJECT_CHANGED');
          const object = { sha256: entry.sha256, bytes: entry.bytes };
          row[kind] = object; objectMap.set(object.sha256, object);
          await initializationDirectory(objectDir(object.sha256), { create: true });
          await retainInitializationFile(objectPath(object.sha256), raw, { resume: true });
          request[kind === 'catalog' ? 'discoveryFile' : 'bodyFile'] = '/shared-input/' + object.sha256;
        }
        const choices = selectedHeaders.get(request.key) ?? new Set(), headers = {};
        fail([...choices].every(name => Object.keys(request.headers ?? {}).some(key => key.toLowerCase() === name)), 'HEADER_SELECTION_INVALID');
        for (const [name, value] of Object.entries(request.headers ?? {})) {
          const credential = credentialHeader(name), included = !credential && (representationHeader(name) || choices.has(name.toLowerCase()));
          row.headers.push({ name, kind: included ? 'included' : 'local', credential });
          if (included) headers[name] = value;
        }
        request.headers = headers;
        if (prior.operationTicket !== null) {
          const metadata = {};
          for (const name of ['schema','operationKey','requestHash','expiresAt','requestHeader','sha256','bytes','expired'])
            if (prior.operationTicket[name] !== undefined) metadata[name] = prior.operationTicket[name];
          row.ticket = { required: true, metadata };
          request.ticketFile = '/recipient-ticket/' + request.key;
        } else { delete request.ticketFile; delete request.ticketHeader; }
        delete request.operatorConfigFile; request.operatorWorkspace = '/shared-operator/' + operatorGroup;
        delete request.responseOut;
        sources.push(row);
      }
      const manifest = validatePackageManifest({ schema: PLAN_PACKAGE_SCHEMA,
        origin: { planId: source.request.planId, planSha256: source.request.planSha256,
          collectionId, editionSha256: source.editionSha256, createdAt: source.request.createdAt,
          values: source.request.values },
        plan, planSha256: hashValue(plan), operators, sources,
        objects: [...objectMap.values()].sort((a,b) => a.sha256.localeCompare(b.sha256)) });
      const saved = await retainManifest(manifest);
      await finish(saved.packageSha256, manifest);
      return fileFor(saved.packageSha256);
    });
  }
  async function review(input) {
    fields(input, ['packageSha256','planId','name','description','operatorBindings','outputDirectory',
      'deliveryParameter','deliveryValue','requestBindings'], 'COLLECTION_PACKAGE_ADOPTION_INPUT_INVALID');
    const manifest = await ready(input.packageSha256), plan = JSON.parse(JSON.stringify(manifest.plan));
    const bindings = new Map(), requests = new Map();
    fail(Array.isArray(input.operatorBindings) && input.operatorBindings.length === manifest.operators.length, 'OPERATOR_BINDINGS_REQUIRED');
    for (const binding of input.operatorBindings) {
      fields(binding, ['groupId','operatorWorkspace','operatorConfigFile'], 'COLLECTION_PACKAGE_OPERATOR_BINDING_INVALID');
      fail(manifest.operators.some(item => item.id === binding.groupId) && !bindings.has(binding.groupId)
        && (binding.operatorWorkspace !== undefined) !== (binding.operatorConfigFile !== undefined), 'OPERATOR_BINDING_INVALID');
      const key = binding.operatorWorkspace !== undefined ? 'operatorWorkspace' : 'operatorConfigFile';
      bindings.set(binding.groupId, { [key]: absolute(binding[key]) });
    }
    fail(Array.isArray(input.requestBindings ?? []), 'REQUEST_BINDINGS_INVALID');
    for (const binding of input.requestBindings ?? []) {
      fields(binding, ['key','ticketFile','headers','omitHeaders'], 'COLLECTION_PACKAGE_REQUEST_BINDING_INVALID');
      fail(plan.requests.some(item => item.key === binding.key) && !requests.has(binding.key), 'REQUEST_BINDING_INVALID');
      if (binding.ticketFile !== undefined) absolute(binding.ticketFile);
      fail(binding.headers === undefined || plain(binding.headers), 'HEADERS_INVALID');
      fail(binding.omitHeaders === undefined || Array.isArray(binding.omitHeaders) && binding.omitHeaders.every(name => typeof name === 'string'), 'HEADERS_INVALID');
      requests.set(binding.key, binding);
    }
    const outputDirectory = absolute(input.outputDirectory);
    fail(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(input.deliveryParameter ?? '')
      && typeof input.deliveryValue === 'string' && input.deliveryValue.length > 0, 'DELIVERY_REQUIRED');
    plan.id = input.planId; plan.name = input.name;
    if (input.description !== undefined) plan.description = input.description;
    for (const parameter of plan.parameters) parameter.default = manifest.origin.values[parameter.name] ?? parameter.default;
    let delivery = plan.parameters.find(item => item.name === input.deliveryParameter);
    if (!delivery) { delivery = { name: input.deliveryParameter, label: 'Delivery period' }; plan.parameters.push(delivery); }
    delivery.default = input.deliveryValue;
    const sourceMap = [], operators = [];
    for (let index = 0; index < plan.requests.length; index++) {
      const request = plan.requests[index], source = manifest.sources[index], local = requests.get(request.key) ?? {};
      delete request.operatorWorkspace; delete request.operatorConfigFile;
      Object.assign(request, bindings.get(source.operatorGroup));
      request.discoveryFile = objectPath(source.catalog.sha256);
      if (source.body) request.bodyFile = objectPath(source.body.sha256);
      if (source.ticket) { fail(typeof local.ticketFile === 'string', 'LOCAL_TICKET_REQUIRED'); request.ticketFile = local.ticketFile; }
      else fail(local.ticketFile === undefined, 'UNEXPECTED_TICKET');
      const supplied = new Map(Object.entries(local.headers ?? {}).map(([name,value]) => [name.toLowerCase(), { name,value }]));
      fail(supplied.size === Object.keys(local.headers ?? {}).length, 'HEADERS_INVALID');
      const omitted = new Set((local.omitHeaders ?? []).map(name => name.toLowerCase()));
      fail(omitted.size === (local.omitHeaders ?? []).length, 'HEADERS_INVALID');
      const required = new Set(source.headers.filter(header => header.kind === 'local').map(header => header.name.toLowerCase()));
      fail([...supplied.keys(), ...omitted].every(name => required.has(name)) && [...supplied.keys()].every(name => !omitted.has(name)), 'HEADER_BINDING_INVALID');
      for (const header of source.headers.filter(header => header.kind === 'local')) {
        const name = header.name.toLowerCase();
        fail(supplied.has(name) || omitted.has(name), 'LOCAL_HEADER_REQUIRED');
        if (supplied.has(name)) request.headers[header.name] = supplied.get(name).value;
      }
      request.responseOut = join(outputDirectory, '{{' + input.deliveryParameter + '}}--' + request.key + '.response');
      sourceMap.push({ key: request.key, operatorGroup: source.operatorGroup,
        sourceCollectionId: manifest.origin.collectionId, sourceIntentId: manifest.origin.collectionId + ':' + request.key,
        catalog: source.catalog, ...(source.body ? { body: source.body } : {}),
        discoveryFile: request.discoveryFile, ...(request.bodyFile ? { bodyFile: request.bodyFile } : {}) });
    }
    const normalized = validateCollectionPlan(plan), planSha256 = hashValue(normalized);
    const resolved = resolveCollectionEdition(normalized, { planId: normalized.id, planSha256,
      collectionId: normalized.id, name: normalized.name });
    for (const request of resolved.requests) {
      const result = await reviewLocalRequest(request);
      operators.push({ key: request.key, ...result });
    }
    const result = { plan: normalized, packageSha256: input.packageSha256,
      origin: manifest.origin, operators, sourceMap };
    return { reviewSha256: hashValue(result), ...result };
  }
  async function reviewAdoption(input) { return mutate(() => review(input)); }
  async function adoptPlan(input = {}) {
    const { expectedReviewSha256, ...selection } = input; checkedHash(expectedReviewSha256);
    return mutate(async () => {
      const reviewed = await review(selection);
      fail(reviewed.reviewSha256 === expectedReviewSha256, 'ADOPTION_REVIEW_CHANGED');
      const saved = await retainPlan(reviewed.plan);
      const folder = join(packageDir(selection.packageSha256), 'adoptions');
      await initializationDirectory(folder, { create: true });
      const adoption = await retainInitializationRecord(join(folder, reviewed.reviewSha256 + '.json'),
        { schema: 'stellar-forge.sf88.collection-plan-adoption.v1', ...reviewed,
          planId: saved.id, planSha256: saved.planSha256, savedAt: saved.savedAt },
        { resume: true });
      return { saved, adoption };
    });
  }
  async function listPackages() {
    live(); const result = [];
    for (const sha of await names(packages)) {
      if (!HASH.test(sha)) continue;
      const current = await status(sha);
      result.push({ packageSha256: sha, planId: current.manifest.plan.id, name: current.manifest.plan.name,
        sourceCollectionId: current.manifest.origin.collectionId, requestCount: current.manifest.sources.length,
        phase: current.phase, receivedBytes: current.receivedBytes, totalBytes: current.totalBytes });
    }
    return { schema: 'stellar-forge.sf88.collection-plan-packages.v1', packages: result };
  }
  return Object.freeze({ exportPackage, listPackages, downloadPackage,
    inspectPackage: ({ packageSha256 }) => status(packageSha256), receiveManifest, receiveChunk, finishReceiving,
    packageFile: ({ packageSha256 }) => mutate(() => fileFor(packageSha256)), reviewAdoption, adoptPlan });
}
