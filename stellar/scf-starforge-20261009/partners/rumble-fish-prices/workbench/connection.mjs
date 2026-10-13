// MIT. Private connection and transport for the original Rumble workspace listener.
import {constants} from 'node:fs';
import {open, lstat, realpath, rename, unlink} from 'node:fs/promises';
import {resolve, dirname, join, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const RUMBLE_CONNECTION_SCHEMA = 'stellar-forge.rumble-live-connection.v1';
export const RUMBLE_STARTUP_SCHEMA = 'stellar-forge.rumble-workspace-startup.v1';
export const RUMBLE_CONNECTION_FILENAME = 'rumble.connection.json';
export const RUMBLE_MAX_RESPONSE_BYTES = 512 * 1024 * 1024;
export const RUMBLE_MAX_CONTROL_BYTES = 1024 * 1024;
export const RUMBLE_HASH = /^[a-f0-9]{64}$/;
export const RUMBLE_UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const rumbleDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const rumblePlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function rumbleFailure(code, message, status = 400, details) {
  return Object.assign(new Error(message), {code, status, ...(details ? {details, data: details} : {})});
}
export function rumbleNeed(value, code, message, status = 400) {
  if (!value) throw rumbleFailure(code, message || code, status);
}
export function rumbleExact(value, allowed, required = []) {
  rumbleNeed(rumblePlain(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)),
  'RUMBLE_CONFIGURATION_INVALID', 'Use the declared Rumble configuration fields.');
}
export function rumbleAbsolute(value) {
  rumbleNeed(typeof value === 'string' && isAbsolute(value) && value.length <= 4096 &&
    !/[\x00-\x1f\x7f]/.test(value), 'RUMBLE_PATH_INVALID', 'Choose an absolute host-owned path.');
  return resolve(value);
}
export async function rumblePrivateDirectory(path) {
  path = rumbleAbsolute(path);
  const information = await lstat(path);
  rumbleNeed(information.isDirectory() && !information.isSymbolicLink() && await realpath(path) === path &&
    (process.platform === 'win32' || !(information.mode & 0o077) &&
      (!process.getuid || information.uid === process.getuid())),
  'RUMBLE_PRIVATE_DIRECTORY_REQUIRED', 'Use the original owned private directory.');
  return {path, dev: String(information.dev), ino: String(information.ino)};
}
function privateFile(info) {
  return info.isFile() && !info.isSymbolicLink() &&
    (process.platform === 'win32' || !(info.mode & 0o077) &&
      (!process.getuid || info.uid === process.getuid()));
}
export async function rumbleReadPrivateFile(path, maximum = RUMBLE_MAX_RESPONSE_BYTES) {
  path = rumbleAbsolute(path);
  rumbleNeed(await realpath(path) === path, 'RUMBLE_PRIVATE_FILE_REQUIRED', 'Use a canonical private file.');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat();
    rumbleNeed(privateFile(before) && before.size <= maximum,
      'RUMBLE_PRIVATE_FILE_REQUIRED', 'Use an owned private regular file within the declared size limit.');
    const bytes = await file.readFile(), after = await file.stat();
    rumbleNeed(bytes.length === before.size && bytes.length <= maximum &&
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => before[key] === after[key]),
    'RUMBLE_PRIVATE_FILE_CHANGED', 'The selected private file changed during reading.', 409);
    return {path, bytes, sha256: rumbleDigest(bytes)};
  } finally { await file.close(); }
}
export function rumbleParseJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw rumbleFailure('RUMBLE_JSON_INVALID', 'The selected source is not complete UTF-8 JSON.'); }
}
export async function rumbleReadPrivateJson(path, maximum = 1024 * 1024) {
  const source = await rumbleReadPrivateFile(path, maximum);
  return {...source, value: rumbleParseJson(source.bytes)};
}
/** The existing writer owns replacement; this helper preserves private atomic publication. */
export async function rumbleWritePrivateJson(path, value, {replace = false} = {}) {
  path = rumbleAbsolute(path);
  await rumblePrivateDirectory(dirname(path));
  try {
    const found = await lstat(path);
    rumbleNeed(replace && privateFile(found) && !found.isSymbolicLink(),
      'RUMBLE_PRIVATE_OUTPUT_EXISTS', 'Choose an unused private output or the same original connection.', 409);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const temporary = join(dirname(path), '.rumble-' + randomUUID() + '.tmp');
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
  return {path, sha256: rumbleDigest(bytes), bytes: bytes.length};
}
function liveUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw rumbleFailure('RUMBLE_CONNECTION_INVALID', 'The original private listener URL is invalid.'); }
  rumbleNeed(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password &&
    url.pathname === '/_prices/' && !url.search && /^#[a-f0-9]{64}$/.test(url.hash) &&
    /^\d+$/.test(url.port) && Number(url.port) >= 1 && Number(url.port) <= 65535,
  'RUMBLE_CONNECTION_INVALID', 'Use the original private loopback Rumble listener.');
  return url;
}
export async function readRumbleConnection(path, {directory, workspaceId} = {}) {
  const source = await rumbleReadPrivateJson(path, 32768), value = source.value;
  const fields = ['schema','instanceId','directory','directoryIdentity','workspaceId','pid','startedAt','origin','url'];
  rumbleExact(value, fields, fields);
  const selected = await rumblePrivateDirectory(value.directory);
  rumbleNeed(value.schema === RUMBLE_CONNECTION_SCHEMA && RUMBLE_UUID.test(value.instanceId ?? '') &&
    Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) &&
    /^workspace-[a-f0-9]{24}$/.test(value.workspaceId ?? '') &&
    rumblePlain(value.directoryIdentity) && value.directoryIdentity.dev === selected.dev &&
    value.directoryIdentity.ino === selected.ino &&
    (!directory || selected.path === rumbleAbsolute(directory)) &&
    (!workspaceId || value.workspaceId === workspaceId) &&
    source.path === join(selected.path, RUMBLE_CONNECTION_FILENAME),
  'RUMBLE_CONNECTION_CHANGED', 'The original Rumble workspace binding changed. Review its current connection.', 409);
  const url = liveUrl(value.url);
  rumbleNeed(value.origin === url.origin, 'RUMBLE_CONNECTION_INVALID', 'The original listener origin changed.');
  return {path:source.path, sha256:source.sha256, value, token:url.hash.slice(1)};
}
export function rumbleConnectionView(connection) {
  const {instanceId,workspaceId,startedAt,origin,pid} = connection.value;
  return {instanceId,workspaceId,startedAt,origin,pid};
}
export async function rumbleRequest(connection, path, {
  method = 'GET', body, signal, maximum = 64 * 1024 * 1024, fetchImpl = fetch, raw = false,
} = {}) {
  const url = new URL(path, connection.value.origin);
  rumbleNeed(url.origin === connection.value.origin && url.pathname.startsWith('/_prices/api/') &&
    !url.username && !url.password && !url.hash && ['GET','POST'].includes(method),
  'RUMBLE_REQUEST_ROUTE_INVALID', 'Choose an original Rumble workspace API operation.');
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  rumbleNeed(serialized === undefined || Buffer.byteLength(serialized) <= RUMBLE_MAX_CONTROL_BYTES,
    'RUMBLE_REQUEST_TOO_LARGE', 'The original control request exceeds 1 MiB.', 413);
  const timeout = AbortSignal.timeout(300000);
  const combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(url, {method, redirect:'error', signal:combined,
      headers:{authorization:'Bearer '+connection.token,
        ...(serialized === undefined ? {} : {'content-type':'application/json'})},
      ...(serialized === undefined ? {} : {body:serialized})});
    const advertised = response.headers.get('content-length');
    rumbleNeed(advertised === null || /^\d+$/.test(advertised) && Number(advertised) <= maximum,
      'RUMBLE_RESPONSE_TOO_LARGE', 'The original response exceeds the selected byte limit.', 413);
    const chunks = []; let length = 0;
    if (response.body) for await (const chunk of response.body) {
      length += chunk.length;
      rumbleNeed(length <= maximum,'RUMBLE_RESPONSE_TOO_LARGE','The original response exceeds the selected byte limit.',413);
      chunks.push(chunk);
    }
    rumbleNeed(advertised === null || length === Number(advertised),
      'RUMBLE_RESPONSE_INCOMPLETE','The original listener returned an incomplete response.',502);
    const bytes = Buffer.concat(chunks);
    if (!response.ok) {
      const value = rumbleParseJson(bytes);
      const message = String(value?.error?.message || 'The original Rumble operation failed.')
        .split(connection.token).join('[redacted]').slice(0,4000);
      throw rumbleFailure(/^[A-Z0-9_]{1,100}$/.test(value?.error?.code ?? '') ? value.error.code : 'RUMBLE_REQUEST_FAILED',
        message,response.status,{operationId:body?.operationId ?? null,originalResponse:true});
    }
    return raw ? {bytes,headers:response.headers} : rumbleParseJson(bytes);
  } catch (error) {
    if (error.details?.originalResponse) throw error;
    if (String(error.code ?? '').startsWith('RUMBLE_')) {
      if (method === 'POST') error.details = error.data = {...error.details,operationId:body?.operationId ?? null,dispatch:'unknown'};
      throw error;
    }
    throw rumbleFailure('RUMBLE_CONNECTION_UNAVAILABLE',
      method === 'GET' ? 'Reopen the saved Rumble application and connect to its current listener.'
        : 'Inspect the retained original operation before repeating the same operation ID and input.',
      503,{operationId:body?.operationId ?? null,dispatch:method === 'GET' ? 'read' : 'unknown'});
  } finally {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
export async function inspectRumbleListener(connection, options) {
  const state = await rumbleRequest(connection, '/_prices/api/state', {...options,maximum:RUMBLE_MAX_RESPONSE_BYTES});
  rumbleNeed(state?.schema === 'tjlabs.prices-workbench.snapshot.v1' &&
    state.workspace?.id === connection.value.workspaceId,
    'RUMBLE_LISTENER_CHANGED','The authenticated listener differs from the selected customer workspace.',409);
  return {schema:'stellar-forge.rumble-listener.v1',...rumbleConnectionView(connection),revision:state.workspace.revision};
}
/** A typed attachment to the single Applications-owned workbench writer. */
export class RumbleWorkspaceClient {
  #connection; #pending=new Set(); #closing=false;
  constructor(connection) { this.#connection=connection; }
  static async connect(path,options={}) {
    const connection=await readRumbleConnection(path,options);
    if(options.expectedInstanceId) rumbleNeed(connection.value.instanceId===options.expectedInstanceId,
      'RUMBLE_INSTANCE_CHANGED','Select the current Applications instance.',409);
    await inspectRumbleListener(connection);
    return new RumbleWorkspaceClient(connection);
  }
  get connection() { return rumbleConnectionView(this.#connection); }
  async #request(path,options={}) {
    rumbleNeed(!this.#closing,'RUMBLE_ATTACHMENT_CLOSED','Connect to the current application again.',409);
    const operation=(async()=>{
      const current=await readRumbleConnection(this.#connection.path,{
        directory:this.#connection.value.directory,workspaceId:this.#connection.value.workspaceId});
      rumbleNeed(current.sha256===this.#connection.sha256,'RUMBLE_INSTANCE_CHANGED',
        'The application restarted. Inspect and reconnect to its current instance.',409);
      return rumbleRequest(this.#connection,'/_prices/api/'+path,options);
    })();
    this.#pending.add(operation);
    try { return await operation; } finally { this.#pending.delete(operation); }
  }
  async browser() { await this.#request('state'); return {...this.connection,url:this.#connection.value.url}; }
  state() { return this.#request('state',{maximum:RUMBLE_MAX_RESPONSE_BYTES}); }
  consumers() { return this.#request('consumers'); }
  consumer({consumerId}) { return this.#request('consumer?'+new URLSearchParams({consumerId})); }
  edition({consumerId,editionId}) { return this.#request('consumer/edition?'+new URLSearchParams({consumerId,...(editionId?{editionId}:{})})); }
  values({consumerId,editionId}) { return this.#request('consumer/output?'+new URLSearchParams({consumerId,...(editionId?{editionId}:{}),format:'json'})); }
  async csv({consumerId,editionId}) {
    const result=await this.#request('consumer/output?'+new URLSearchParams({consumerId,...(editionId?{editionId}:{}),format:'csv'}),{raw:true});
    return {bytes:result.bytes,sha256:rumbleDigest(result.bytes),contentType:result.headers.get('content-type')};
  }
  saveConsumer(input) { return this.#request('consumer',{method:'POST',body:input}); }
  createEdition(input) { return this.#request('consumer/edition',{method:'POST',body:input}); }
  reviewEdition(input) { return this.#request('consumer/review',{method:'POST',body:input}); }
  configure(input) { return this.#request('configuration',{method:'POST',body:input}); }
  plan(input) { return this.#request('plan',{method:'POST',body:input}); }
  getPlan({planId}) { return this.#request('plan?'+new URLSearchParams({planId})); }
  start({planId}) { return this.#request('start',{method:'POST',body:{planId}}); }
  pause() { return this.#request('pause',{method:'POST',body:{}}); }
  resume({runId}) { return this.#request('resume',{method:'POST',body:{runId}}); }
  result({runId,taskId}) { return this.#request('result?'+new URLSearchParams({runId,taskId,format:'json'})); }
  async exportBundle() {
    const result=await this.#request('delivery',{raw:true,maximum:RUMBLE_MAX_RESPONSE_BYTES});
    const bundle=rumbleParseJson(result.bytes);
    rumbleNeed(bundle?.schema==='tjlabs.stellar-prices.workbench-delivery.v1' &&
      bundle.workspaceId===this.#connection.value.workspaceId &&
      !bundle.files.some(file=>file.path==='workspace/'+RUMBLE_CONNECTION_FILENAME),
      'RUMBLE_EXPORT_CHANGED','The complete export differs from the selected original workspace.',409);
    return {bytes:result.bytes,sha256:rumbleDigest(result.bytes),bundle};
  }
  async close() { this.#closing=true; await Promise.allSettled([...this.#pending]); }
}
