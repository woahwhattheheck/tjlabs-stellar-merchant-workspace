// MIT — Portable data-only request plans; usable by Node and the private browser.
import { validateCollectionPlan, stableJson, fields, plain, need } from './plan.mjs';

export const PLAN_PACKAGE_SCHEMA = 'stellar-forge.sf88.collection-plan-package.v1';
export const PLAN_PACKAGE_STATUS_SCHEMA = 'stellar-forge.sf88.collection-plan-package-status.v1';
export const PLAN_PACKAGE_CHUNK_BYTES = 64 * 1024;
export const PLAN_PACKAGE_MAX_BYTES = 128 * 1024 * 1024;
export const PLAN_PACKAGE_MANIFEST_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const HEADER = /^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/;
const encoder = new TextEncoder();
const fail = (condition, suffix) => need(condition, 'COLLECTION_PACKAGE_' + suffix);
export const packageJson = value => stableJson(value) + '\n';
export const credentialHeader = name =>
  /^(authorization|proxy-authorization|cookie|set-cookie)$/i.test(name)
  || /(?:^|[-_])(api[-_]?key|access[-_]?key|auth|authorization|token|secret|credential|ticket|session|password|signature)(?:$|[-_])/i.test(name);
export const representationHeader = name => /^(accept|accept-language|content-type|content-language)$/i.test(name);

export function validatePackageManifest(value) {
  fields(value, ['schema','origin','plan','planSha256','operators','sources','objects'], 'COLLECTION_PACKAGE_MANIFEST_INVALID');
  fail(value.schema === PLAN_PACKAGE_SCHEMA && HASH.test(value.planSha256 ?? ''), 'MANIFEST_INVALID');
  const plan = validateCollectionPlan(value.plan);
  fields(value.origin, ['planId','planSha256','collectionId','editionSha256','createdAt','values'], 'COLLECTION_PACKAGE_ORIGIN_INVALID');
  fail(value.origin.planId === plan.id && HASH.test(value.origin.planSha256 ?? '')
    && HASH.test(value.origin.editionSha256 ?? '') && typeof value.origin.collectionId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value.origin.collectionId)
    && typeof value.origin.createdAt === 'string' && plain(value.origin.values), 'ORIGIN_INVALID');
  fail(Array.isArray(value.operators) && value.operators.length > 0 && value.operators.length <= plan.requests.length, 'OPERATORS_INVALID');
  const groups = new Set();
  for (const operator of value.operators) {
    fields(operator, ['id','kind','path','configSha256','manifestSha256','actor','service'], 'COLLECTION_PACKAGE_OPERATOR_INVALID');
    fail(KEY.test(operator.id ?? '') && !groups.has(operator.id) && ['workspace','configuration'].includes(operator.kind)
      && typeof operator.path === 'string' && operator.path.startsWith('/') && operator.path.length <= 8192
      && HASH.test(operator.configSha256 ?? '')
      && (operator.manifestSha256 === undefined || HASH.test(operator.manifestSha256))
      && typeof operator.actor === 'string' && typeof operator.service === 'string', 'OPERATOR_INVALID');
    groups.add(operator.id);
  }
  fail(Array.isArray(value.objects) && value.objects.length > 0 && value.objects.length <= plan.requests.length * 2, 'OBJECTS_INVALID');
  let total = 0;
  const objects = new Map(), used = new Set();
  for (const object of value.objects) {
    fields(object, ['sha256','bytes'], 'COLLECTION_PACKAGE_OBJECT_INVALID');
    fail(HASH.test(object.sha256 ?? '') && !objects.has(object.sha256)
      && Number.isSafeInteger(object.bytes) && object.bytes >= 0, 'OBJECT_INVALID');
    total += object.bytes;
    fail(total <= PLAN_PACKAGE_MAX_BYTES, 'INPUT_BYTES_EXCEEDED');
    objects.set(object.sha256, object);
  }
  fail(Array.isArray(value.sources) && value.sources.length === plan.requests.length, 'SOURCES_INVALID');
  const usedGroups = new Set();
  for (let index = 0; index < value.sources.length; index++) {
    const source = value.sources[index], request = plan.requests[index];
    fields(source, ['key','operatorGroup','catalog','body','ticket','headers'], 'COLLECTION_PACKAGE_SOURCE_INVALID');
    fail(source.key === request.key && groups.has(source.operatorGroup), 'SOURCE_INVALID');
    usedGroups.add(source.operatorGroup);
    fail(request.operatorWorkspace === '/shared-operator/' + source.operatorGroup
      && request.operatorConfigFile === undefined && request.responseOut === undefined, 'LOCAL_BINDING_REQUIRED');
    for (const kind of ['catalog','body']) {
      const reference = source[kind];
      if (kind === 'body' && reference === undefined) {
        fail(request.bodyFile === undefined, 'BODY_INVALID'); continue;
      }
      fields(reference, ['sha256','bytes'], 'COLLECTION_PACKAGE_OBJECT_INVALID');
      fail(objects.has(reference.sha256) && objects.get(reference.sha256).bytes === reference.bytes, 'OBJECT_INVALID');
      fail(request[kind === 'catalog' ? 'discoveryFile' : 'bodyFile'] === '/shared-input/' + reference.sha256, 'SOURCE_INVALID');
      if (kind === 'catalog') fail(reference.bytes > 0 && reference.bytes <= 1048576, 'CATALOG_INVALID');
      used.add(reference.sha256);
    }
    if (source.ticket !== undefined) {
      fields(source.ticket, ['required','metadata'], 'COLLECTION_PACKAGE_TICKET_INVALID');
      fail(source.ticket.required === true && plain(source.ticket.metadata)
        && request.ticketFile === '/recipient-ticket/' + request.key, 'TICKET_INVALID');
      // Only existing ticket metadata is accepted; bearer-capability fields never travel here.
      const metadata = source.ticket.metadata;
      fields(metadata, ['schema','operationKey','requestHash','expiresAt','requestHeader','sha256','bytes','expired'], 'COLLECTION_PACKAGE_TICKET_INVALID');
      fail(['schema','operationKey','requestHeader'].every(key => typeof metadata[key] === 'string' && metadata[key].length > 0 && metadata[key].length <= 1024)
        && HASH.test(metadata.requestHash ?? '') && HASH.test(metadata.sha256 ?? '')
        && Number.isSafeInteger(metadata.expiresAt) && metadata.expiresAt >= 0
        && Number.isSafeInteger(metadata.bytes) && metadata.bytes > 0 && metadata.bytes <= PLAN_PACKAGE_MAX_BYTES
        && (metadata.expired === undefined || typeof metadata.expired === 'boolean'), 'TICKET_INVALID');
    } else fail(request.ticketFile === undefined && request.ticketHeader === undefined, 'TICKET_INVALID');
    fail(Array.isArray(source.headers) && source.headers.length <= 64, 'HEADERS_INVALID');
    const names = new Set(), included = new Set();
    for (const header of source.headers) {
      fields(header, ['name','kind','credential'], 'COLLECTION_PACKAGE_HEADER_INVALID');
      fail(typeof header.name === 'string' && HEADER.test(header.name) && header.name.length <= 256
        && !names.has(header.name.toLowerCase()) && ['included','local'].includes(header.kind)
        && header.credential === credentialHeader(header.name), 'HEADER_INVALID');
      names.add(header.name.toLowerCase());
      if (header.kind === 'included') {
        fail(!header.credential && Object.hasOwn(request.headers ?? {}, header.name), 'CREDENTIAL_VALUE_DISALLOWED');
        included.add(header.name);
      } else fail(!Object.keys(request.headers ?? {}).some(name => name.toLowerCase() === header.name.toLowerCase()), 'CREDENTIAL_VALUE_DISALLOWED');
    }
    fail(Object.keys(request.headers ?? {}).every(name => included.has(name)), 'HEADER_INVALID');
  }
  fail(used.size === objects.size && usedGroups.size === groups.size, 'UNREFERENCED_INPUT');
  fail(encoder.encode(packageJson(value)).length <= PLAN_PACKAGE_MANIFEST_BYTES, 'MANIFEST_TOO_LARGE');
  return JSON.parse(JSON.stringify(value));
}
export async function packageDigest(value) {
  const bytes = encoder.encode(packageJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export function chunkByteLength(base64) {
  fail(typeof base64 === 'string' && base64.length > 0 && base64.length <= Math.ceil(PLAN_PACKAGE_CHUNK_BYTES / 3) * 4
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64), 'CHUNK_INVALID');
  return base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}
/** Bounded streaming JSONL parser. Exhaust the iterator before finalizing receipt. */
export async function* parsePlanPackage(input) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '', manifest = null, packageSha256 = null, objectIndex = 0, offset = 0, complete = false;
  function skipEmptyObjects() {
    while (manifest && objectIndex < manifest.objects.length && manifest.objects[objectIndex].bytes === 0) objectIndex++;
  }
  async function record(line) {
    fail(!complete && line.length > 0, 'RECORD_ORDER_INVALID');
    let value;
    try { value = JSON.parse(line); } catch { fail(false, 'JSON_INVALID'); }
    if (!manifest) {
      fields(value, ['type','manifest'], 'COLLECTION_PACKAGE_RECORD_INVALID');
      fail(value.type === 'manifest', 'MANIFEST_REQUIRED');
      manifest = validatePackageManifest(value.manifest);
      packageSha256 = await packageDigest(manifest);
      fail(await packageDigest(manifest.plan) === manifest.planSha256, 'PLAN_CHANGED');
      skipEmptyObjects(); return { type: 'manifest', manifest };
    }
    if (value.type === 'complete') {
      fields(value, ['type','packageSha256'], 'COLLECTION_PACKAGE_RECORD_INVALID');
      fail(objectIndex === manifest.objects.length && value.packageSha256 === packageSha256, 'INCOMPLETE');
      complete = true; return value;
    }
    fields(value, ['type','sha256','offset','base64'], 'COLLECTION_PACKAGE_RECORD_INVALID');
    const object = manifest.objects[objectIndex], bytes = chunkByteLength(value.base64);
    fail(value.type === 'object' && object && value.sha256 === object.sha256 && value.offset === offset
      && bytes === Math.min(PLAN_PACKAGE_CHUNK_BYTES, object.bytes - offset), 'CHUNK_ORDER_INVALID');
    offset += bytes;
    if (offset === object.bytes) { objectIndex++; offset = 0; skipEmptyObjects(); }
    return value;
  }
  try {
    for await (const chunk of input) {
      fail(chunk instanceof Uint8Array, 'BYTE_STREAM_REQUIRED');
      // Slice caller chunks too: a single 128 MiB chunk must not become one string.
      for (let start = 0; start < chunk.length; start += PLAN_PACKAGE_CHUNK_BYTES) {
        pending += decoder.decode(chunk.subarray(start, start + PLAN_PACKAGE_CHUNK_BYTES), { stream: true });
        let end;
        while ((end = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          fail(encoder.encode(line).length <= (manifest ? 128 * 1024 : PLAN_PACKAGE_MANIFEST_BYTES + 1024), 'RECORD_TOO_LARGE');
          yield await record(line);
        }
        fail(encoder.encode(pending).length <= (manifest ? 128 * 1024 : PLAN_PACKAGE_MANIFEST_BYTES + 1024), 'RECORD_TOO_LARGE');
      }
    }
    pending += decoder.decode();
  } catch (error) {
    if (error?.code) throw error;
    throw Object.assign(new Error('COLLECTION_PACKAGE_STREAM_INVALID'), { code: 'COLLECTION_PACKAGE_STREAM_INVALID', cause: error });
  }
  fail(pending.length === 0 && complete, 'INCOMPLETE');
}
