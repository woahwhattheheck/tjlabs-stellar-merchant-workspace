// MIT. Private connection and transport for the original Allium workspace listener.
import {constants} from 'node:fs';
import {open, lstat, realpath, rename, unlink} from 'node:fs/promises';
import {resolve, dirname, join, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const ALLIUM_CONNECTION_SCHEMA = 'stellar-forge.allium-live-connection.v1';
export const ALLIUM_STARTUP_SCHEMA = 'stellar-forge.allium-workspace-startup.v1';
export const ALLIUM_CONNECTION_FILENAME = 'allium.connection.json';
export const ALLIUM_MAX_RESPONSE_BYTES = 192 * 1024 * 1024;
export const ALLIUM_MAX_CONTROL_BYTES = 2 * 1024 * 1024;
export const ALLIUM_HASH = /^[a-f0-9]{64}$/;
export const ALLIUM_UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const alliumDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const alliumPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function alliumFailure(code, message, status = 400, details) {
  return Object.assign(new Error(message), {code, status, ...(details ? {details, data: details} : {})});
}
export function alliumNeed(value, code, message, status = 400) {
  if (!value) throw alliumFailure(code, message || code, status);
}
export function alliumExact(value, allowed, required = []) {
  alliumNeed(alliumPlain(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)),
  'ALLIUM_CONFIGURATION_INVALID', 'Use the declared Allium configuration fields.');
}
export function alliumAbsolute(value) {
  alliumNeed(typeof value === 'string' && isAbsolute(value) && value.length <= 4096 &&
    !/[\x00-\x1f\x7f]/.test(value), 'ALLIUM_PATH_INVALID', 'Choose an absolute host-owned path.');
  return resolve(value);
}
export async function alliumPrivateDirectory(path) {
  path = alliumAbsolute(path);
  const information = await lstat(path);
  alliumNeed(information.isDirectory() && !information.isSymbolicLink() && await realpath(path) === path &&
    (process.platform === 'win32' || !(information.mode & 0o077) &&
      (!process.getuid || information.uid === process.getuid())),
  'ALLIUM_PRIVATE_DIRECTORY_REQUIRED', 'Use the original owned private directory.');
  return {path, dev: String(information.dev), ino: String(information.ino)};
}
function privateFile(info) {
  return info.isFile() && !info.isSymbolicLink() &&
    (process.platform === 'win32' || !(info.mode & 0o077) &&
      (!process.getuid || info.uid === process.getuid()));
}
export async function alliumReadPrivateFile(path, maximum = ALLIUM_MAX_RESPONSE_BYTES) {
  path = alliumAbsolute(path);
  alliumNeed(await realpath(path) === path, 'ALLIUM_PRIVATE_FILE_REQUIRED', 'Use a canonical private file.');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat();
    alliumNeed(privateFile(before) && before.size <= maximum,
      'ALLIUM_PRIVATE_FILE_REQUIRED', 'Use an owned private regular file within the declared size limit.');
    const bytes = await file.readFile(), after = await file.stat();
    alliumNeed(bytes.length === before.size && bytes.length <= maximum &&
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => before[key] === after[key]),
    'ALLIUM_PRIVATE_FILE_CHANGED', 'The selected private file changed during reading.', 409);
    return {path, bytes, sha256: alliumDigest(bytes)};
  } finally { await file.close(); }
}
export function alliumParseJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw alliumFailure('ALLIUM_JSON_INVALID', 'The selected source is not complete UTF-8 JSON.'); }
}
export async function alliumReadPrivateJson(path, maximum = 1024 * 1024) {
  const source = await alliumReadPrivateFile(path, maximum);
  return {...source, value: alliumParseJson(source.bytes)};
}
/** The existing writer owns replacement; this helper preserves private atomic publication. */
export async function alliumWritePrivateJson(path, value, {replace = false} = {}) {
  path = alliumAbsolute(path);
  await alliumPrivateDirectory(dirname(path));
  try {
    const found = await lstat(path);
    alliumNeed(replace && privateFile(found) && !found.isSymbolicLink(),
      'ALLIUM_PRIVATE_OUTPUT_EXISTS', 'Choose an unused private output or the same original connection.', 409);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const temporary = join(dirname(path), '.allium-' + randomUUID() + '.tmp');
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  catch (error) { await file.close(); await unlink(temporary).catch(() => {}); throw error; }
  finally { await file.close(); }
  try {
    if (!replace) {
      const {link} = await import('node:fs/promises');
      await link(temporary, path); await unlink(temporary);
    } else await rename(temporary, path);
    const folder = await open(dirname(path), 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return {path, sha256: alliumDigest(bytes), bytes: bytes.length};
}
function liveUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw alliumFailure('ALLIUM_CONNECTION_INVALID', 'The original private listener URL is invalid.'); }
  alliumNeed(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password &&
    url.pathname === '/' && !url.search && /^#[a-f0-9]{64}$/.test(url.hash) &&
    /^\d+$/.test(url.port) && Number(url.port) >= 1 && Number(url.port) <= 65535,
  'ALLIUM_CONNECTION_INVALID', 'Use the original private loopback Allium listener.');
  return url;
}
export async function readAlliumConnection(path, {directory, workspaceId} = {}) {
  const source = await alliumReadPrivateJson(path, 32768), value = source.value;
  const fields = ['schema','instanceId','directory','directoryIdentity','workspaceId','pid','startedAt','origin','url'];
  alliumExact(value, fields, fields);
  const selected = await alliumPrivateDirectory(value.directory);
  alliumNeed(value.schema === ALLIUM_CONNECTION_SCHEMA && ALLIUM_UUID.test(value.instanceId ?? '') &&
    Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) &&
    /^allium-[a-f0-9-]{36}$/.test(value.workspaceId ?? '') &&
    alliumPlain(value.directoryIdentity) && value.directoryIdentity.dev === selected.dev &&
    value.directoryIdentity.ino === selected.ino &&
    (!directory || selected.path === alliumAbsolute(directory)) &&
    (!workspaceId || value.workspaceId === workspaceId) &&
    source.path === join(selected.path, ALLIUM_CONNECTION_FILENAME),
  'ALLIUM_CONNECTION_CHANGED', 'The original Allium workspace binding changed. Review its current connection.', 409);
  const url = liveUrl(value.url);
  alliumNeed(value.origin === url.origin, 'ALLIUM_CONNECTION_INVALID', 'The original listener origin changed.');
  return {path:source.path, sha256:source.sha256, value, token:url.hash.slice(1)};
}
export function alliumConnectionView(connection) {
  const {instanceId,workspaceId,startedAt,origin,pid} = connection.value;
  return {instanceId,workspaceId,startedAt,origin,pid};
}
export async function alliumRequest(connection, path, {
  method = 'GET', body, signal, maximum = 64 * 1024 * 1024, fetchImpl = fetch, raw = false,
} = {}) {
  const url = new URL(path, connection.value.origin);
  alliumNeed(url.origin === connection.value.origin && url.pathname.startsWith('/api/') &&
    !url.username && !url.password && !url.hash && ['GET','POST'].includes(method),
  'ALLIUM_REQUEST_ROUTE_INVALID', 'Choose an original Allium workspace API operation.');
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  alliumNeed(serialized === undefined || Buffer.byteLength(serialized) <= ALLIUM_MAX_CONTROL_BYTES,
    'ALLIUM_REQUEST_TOO_LARGE', 'The original control request exceeds 2 MiB.', 413);
  const timeout = AbortSignal.timeout(300000);
  const combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(url, {method, redirect:'error', signal:combined,
      headers:{'x-allium-workspace-token':connection.token,
        'x-allium-workspace-instance':connection.value.instanceId,
        ...(serialized === undefined ? {} : {'content-type':'application/json'})},
      ...(serialized === undefined ? {} : {body:serialized})});
    const advertised = response.headers.get('content-length');
    alliumNeed(advertised === null || /^\d+$/.test(advertised) && Number(advertised) <= maximum,
      'ALLIUM_RESPONSE_TOO_LARGE', 'The original response exceeds the selected byte limit.', 413);
    const chunks = []; let length = 0;
    if (response.body) for await (const chunk of response.body) {
      length += chunk.length;
      alliumNeed(length <= maximum,'ALLIUM_RESPONSE_TOO_LARGE','The original response exceeds the selected byte limit.',413);
      chunks.push(chunk);
    }
    alliumNeed(advertised === null || length === Number(advertised),
      'ALLIUM_RESPONSE_INCOMPLETE','The original listener returned an incomplete response.',502);
    const bytes = Buffer.concat(chunks);
    if (!response.ok) {
      const value = alliumParseJson(bytes);
      const message = String(value?.message || 'The original Allium operation failed.')
        .split(connection.token).join('[redacted]').slice(0,4000);
      throw alliumFailure(/^[A-Z0-9_]{1,100}$/.test(value?.error ?? '') ? value.error : 'ALLIUM_REQUEST_FAILED',
        message,response.status,{operationId:body?.operationId ?? null,originalResponse:true});
    }
    return raw ? {bytes,headers:response.headers} : alliumParseJson(bytes);
  } catch (error) {
    if (error.details?.originalResponse) throw error;
    if (String(error.code ?? '').startsWith('ALLIUM_')) {
      if (method === 'POST') error.details = error.data = {...error.details,operationId:body?.operationId ?? null,dispatch:'unknown'};
      throw error;
    }
    throw alliumFailure('ALLIUM_CONNECTION_UNAVAILABLE',
      method === 'GET' ? 'Reopen the saved Allium application and connect to its current listener.'
        : 'Inspect the retained original operation before repeating the same operation ID and input.',
      503,{operationId:body?.operationId ?? null,dispatch:method === 'GET' ? 'read' : 'unknown'});
  } finally {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
export async function inspectAlliumListener(connection, options) {
  const live = await alliumRequest(connection,'/api/connection',{...options,maximum:32768});
  alliumNeed(live?.schema === 'stellar-forge.allium-listener.v1' &&
    ['instanceId','workspaceId','directory','pid','startedAt','origin'].every(key => live[key] === connection.value[key]),
  'ALLIUM_LISTENER_CHANGED','The authenticated listener differs from the selected original Allium workspace.',409);
  return live;
}
/** One attachment to the Applications-owned original writer. */
export class AlliumWorkspaceClient {
  #connection; #pending = new Set(); #closing = false;
  constructor(connection) { this.#connection = connection; }
  static async connect(path, options = {}) {
    const connection = await readAlliumConnection(path,options);
    if (options.expectedInstanceId) alliumNeed(connection.value.instanceId === options.expectedInstanceId,
      'ALLIUM_INSTANCE_CHANGED','Select the current Applications instance.',409);
    await inspectAlliumListener(connection);
    return new AlliumWorkspaceClient(connection);
  }
  get connection() { return alliumConnectionView(this.#connection); }
  async #request(path, options) {
    alliumNeed(!this.#closing,'ALLIUM_ATTACHMENT_CLOSED','Connect the current Allium application again.',409);
    const operation = (async () => {
      const current = await readAlliumConnection(this.#connection.path,{
        directory:this.#connection.value.directory,workspaceId:this.#connection.value.workspaceId});
      alliumNeed(current.sha256 === this.#connection.sha256,
        'ALLIUM_INSTANCE_CHANGED','The original application restarted. Inspect and reconnect to its current instance.',409);
      return alliumRequest(this.#connection,path,options);
    })();
    this.#pending.add(operation);
    try { return await operation; } finally { this.#pending.delete(operation); }
  }
  async browser() {
    await this.#request('/api/connection');
    return {...this.connection,url:this.#connection.value.url};
  }
  state() { return this.#request('/api/state'); }
  revision(id) { return this.#request('/api/revision?id='+encodeURIComponent(id)); }
  acquisition(id) { return this.#request('/api/acquisition?id='+encodeURIComponent(id)); }
  saveProduct(input) { return this.#request('/api/product/save',{method:'POST',body:input}); }
  restoreProduct(input) { return this.#request('/api/product/restore',{method:'POST',body:input}); }
  importResult(input) { return this.#request('/api/import',{method:'POST',body:input}); }
  startQuery(input) { return this.#request('/api/query/start',{method:'POST',body:input}); }
  resumeQuery(input) { return this.#request('/api/query/resume',{method:'POST',body:input}); }
  collectQuery(input) { return this.#request('/api/query/collect',{method:'POST',body:input}); }
  recoverQuery(input) { return this.#request('/api/query/recover',{method:'POST',body:input}); }
  query(input) { return this.#request('/api/preview',{method:'POST',body:input}); }
  configure(input) { return this.#request('/api/merchant/configure',{method:'POST',body:input}); }
  startMerchant(input) { return this.#request('/api/merchant/start',{method:'POST',body:input}); }
  stopMerchant(input) { return this.#request('/api/merchant/stop',{method:'POST',body:input}); }
  refresh(input) { return this.#request('/api/merchant/refresh',{method:'POST',body:input}); }
  activate(input) { return this.#request('/api/merchant/activate',{method:'POST',body:input}); }
  collectVersions() { return this.#request('/api/merchant/collect',{method:'POST',body:{}}); }
  openPublisher() { return this.#request('/api/publisher',{method:'POST',body:{}}); }
  stageForPublisher(input) { return this.#request('/api/publisher/stage',{method:'POST',body:input}); }
  async download({acquisitionId,kind}) {
    const value = await this.#request('/api/download?id='+encodeURIComponent(acquisitionId)+'&kind='+encodeURIComponent(kind),
      {raw:true,maximum:2*1024*1024});
    const sha256 = alliumDigest(value.bytes);
    alliumNeed(value.headers.get('x-content-sha256') === sha256,
      'ALLIUM_DOWNLOAD_CHANGED','The original file differs from its advertised SHA-256.',409);
    return {...value,sha256};
  }
  async exportBundle({expectedRevision} = {}) {
    const value = await this.#request('/api/export',{method:'POST',body:{...(expectedRevision === undefined ? {} : {expectedRevision})},raw:true,maximum:ALLIUM_MAX_RESPONSE_BYTES});
    const bundle = alliumParseJson(value.bytes);
    alliumNeed(bundle?.schema === 'stellar-forge.allium-workspace-export.v1' &&
      bundle.workspaceId === this.#connection.value.workspaceId &&
      value.headers.get('x-manifest-sha256') === bundle.manifestSha256,
    'ALLIUM_EXPORT_CHANGED','The original complete export differs from the selected workspace.',409);
    return {...value,sha256:alliumDigest(value.bytes),bundle};
  }
  async close() { this.#closing = true; await Promise.allSettled([...this.#pending]); }
}
