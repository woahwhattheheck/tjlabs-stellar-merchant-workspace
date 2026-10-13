// MIT. Native Tasker operations through the selected complete original application.
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {access, lstat, open, realpath} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const TASKER_REQUEST_SCHEMA = 'taskerarmy.operation-request.v1';
export const TASKER_RESULT_SCHEMA = 'taskerarmy.operation-result.v1';
export const TASKER_SOURCE = dirname(fileURLToPath(import.meta.url));
export const TASKER_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const TASKER_MAX_REPLY_BYTES = 16 * 1024 * 1024;
export const taskerError = (code, message) => Object.assign(new Error(message), {code});
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exact(value, fields, required = []) {
  if (!plain(value) || Object.keys(value).some(key => !fields.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key)))
    throw taskerError('INVALID_PARAMS', 'Supply the declared fields and every required selection.');
}
export function selectedPath(value, base = process.cwd()) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value))
    throw taskerError('TASKER_PATH_INVALID', 'Select a complete original host path.');
  return resolve(base, value);
}
export function requestId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))
    throw taskerError('INVALID_PARAMS', 'Retain one version-four request UUID for this complete operation.');
  return value;
}
export async function readPrivateJSON(path, maximum = 2 * 1024 * 1024) {
  path = selectedPath(path);
  if (await realpath(path) !== path) throw taskerError('TASKER_PRIVATE_FILE', 'Use a canonical private original JSON file.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum || process.platform !== 'win32' &&
        ((stat.mode & 0o077) || typeof process.getuid === 'function' && stat.uid !== process.getuid()))
      throw taskerError('TASKER_PRIVATE_FILE', 'Use an owned private regular JSON file within its declared limit.');
    const bytes = await handle.readFile();
    if (bytes.length > maximum) throw taskerError('TASKER_PRIVATE_FILE', 'The original JSON file exceeded its declared limit.');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw taskerError('TASKER_JSON_INVALID', 'Read the complete original UTF-8 JSON document.'); }
    return {path, bytes, value};
  } finally { await handle.close(); }
}
export async function canonicalDirectory(path, {missing = false, privateOnly = false} = {}) {
  path = selectedPath(path);
  let stat;
  try { stat = await lstat(path); }
  catch (error) {
    if (error.code !== 'ENOENT' || !missing) throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    await canonicalDirectory(parent, {privateOnly});
    return path;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path ||
      privateOnly && process.platform !== 'win32' &&
      ((stat.mode & 0o077) || typeof process.getuid === 'function' && stat.uid !== process.getuid()))
    throw taskerError('TASKER_DIRECTORY_INVALID', 'Select the canonical original directory with its required ownership and permissions.');
  return path;
}

const installedOperations = new Set(['installation.inspect', 'installation.adopt_source', 'installation.snapshot',
  'configuration.read', 'configuration.save', 'queue.status', 'queue.list', 'queue.get', 'jobs.history',
  'events.receive', 'events.render', 'deliveries.resolve', 'routes.resume', 'requests.get', 'commands.describe']);
const mutations = new Set(['installation.prepare', 'installation.adopt_source', 'installation.snapshot',
  'installation.receive', 'configuration.save', 'events.receive', 'deliveries.resolve', 'routes.resume']);

/** This client has no queue, database, worker or automatic mutation retry of its own. */
export class TaskerInstallation {
  #selection; #active = new Set(); #closing = false; #closed;
  constructor(selection) {
    exact(selection, ['directory', 'sourceDirectory', 'python', 'binding', 'environment'], ['directory']);
    const directory = selectedPath(selection.directory);
    const sourceDirectory = selectedPath(selection.sourceDirectory ?? TASKER_SOURCE);
    const python = selectedPath(selection.python ?? '/usr/bin/python3');
    if (selection.binding !== undefined) {
      exact(selection.binding, ['installation_id', 'source_identity'], ['installation_id', 'source_identity']);
      if (typeof selection.binding.installation_id !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(selection.binding.installation_id) ||
          !/^[a-f0-9]{64}$/.test(selection.binding.source_identity ?? ''))
        throw taskerError('TASKER_BINDING_INVALID', 'Keep the selected installation UUID and original source SHA256.');
    }
    this.#selection = {directory, sourceDirectory, python,
      ...(selection.binding ? {binding: {...selection.binding}} : {}),
      environment: selection.environment ?? process.env};
  }
  get selection() {
    const {environment, ...value} = this.#selection;
    return structuredClone(value);
  }
  get activeCalls() { return this.#active.size; }
  async #execute(operation, args, id) {
    const selected = this.#selection;
    await canonicalDirectory(selected.sourceDirectory);
    const script = join(selected.sourceDirectory, 'native', 'operations.py');
    const info = await lstat(script);
    if (!info.isFile() || info.isSymbolicLink() || await realpath(script) !== script)
      throw taskerError('TASKER_SOURCE_INVALID', 'Select the complete native Tasker operations source.');
    await access(selected.python, constants.X_OK);
    const body = {schema: TASKER_REQUEST_SCHEMA, operation, arguments: args,
      ...(installedOperations.has(operation) ? {installation: selected.directory} : {}),
      ...(id === undefined ? {} : {request_id: id}),
      ...(installedOperations.has(operation) && selected.binding ? {binding: selected.binding} : {})};
    const encoded = Buffer.from(JSON.stringify(body) + '\n');
    if (encoded.length > TASKER_MAX_REQUEST_BYTES)
      throw taskerError('INVALID_PARAMS', 'The complete Tasker request exceeds two MiB.');
    return new Promise((accept, reject) => {
      let child, bytes = 0, failure = null;
      const chunks = [];
      try { child = spawn(selected.python, ['-B', script], {cwd: selected.sourceDirectory,
        env: selected.environment, shell: false, stdio: ['pipe', 'pipe', 'pipe']}); }
      catch { reject(taskerError('TASKER_LAUNCH_FAILED', 'The selected original Python process could not start.')); return; }
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > TASKER_MAX_REPLY_BYTES) {
          failure ??= taskerError('TASKER_REPLY_LIMIT', 'The native reply exceeds sixteen MiB. Read the same request or use a smaller queue/history page.');
          child.kill('SIGTERM');
        } else chunks.push(chunk);
      });
      // Original stderr can contain host paths or provider output. Keep it out of model replies.
      child.stderr.on('data', () => {});
      child.stdin.on('error', () => {});
      child.once('error', () => { failure ??= taskerError('TASKER_LAUNCH_FAILED', 'The selected original Python process could not start.'); });
      child.once('close', (code, signal) => {
        if (failure) { reject(failure); return; }
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, bytes))); }
        catch {
          reject(taskerError('TASKER_REPLY_INVALID',
            'The original process did not return complete UTF-8 JSON (exit ' + code + ', signal ' + (signal ?? 'none') +
            '). Reconcile the same request ID before another mutation.'));
          return;
        }
        if (!plain(value) || value.schema !== TASKER_RESULT_SCHEMA || value.operation !== operation ||
            typeof value.ok !== 'boolean' || (id !== undefined && value.request_id !== id)) {
          reject(taskerError('TASKER_REPLY_CHANGED', 'The native response does not identify this original operation and request.'));
          return;
        }
        if (!value.ok) {
          const errorCode = /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value.error?.code ?? '') ? value.error.code : 'TASKER_OPERATION_FAILED';
          const message = typeof value.error?.message === 'string' ? value.error.message.slice(0, 2000) : 'The original Tasker operation failed.';
          reject(taskerError(errorCode, message)); return;
        }
        if (code !== 0 || signal) {
          reject(taskerError('TASKER_PROCESS_EXIT', 'The original process exited after its reply. Reconcile this retained request ID before retrying.'));
          return;
        }
        accept(value);
      });
      child.stdin.end(encoded);
    });
  }
  call(operation, args = {}, id) {
    if (this.#closing) return Promise.reject(taskerError('TASKER_CLOSING', 'The Tasker client is draining its original calls.'));
    if ((!installedOperations.has(operation) && !['installation.prepare', 'installation.receive'].includes(operation)) || !plain(args))
      return Promise.reject(taskerError('INVALID_PARAMS', 'Select a declared Tasker operation and complete JSON arguments.'));
    if (mutations.has(operation)) requestId(id);
    else if (id !== undefined) requestId(id);
    const input = structuredClone(args);
    const pending = this.#execute(operation, input, id);
    this.#active.add(pending);
    pending.finally(() => this.#active.delete(pending)).catch(() => {});
    return pending;
  }
  inspect() { return this.call('installation.inspect'); }
  prepare(input, id) { return this.call('installation.prepare', {...input, directory: this.#selection.directory, operation_id: id}, id); }
  receive(input, id) { return this.call('installation.receive', {...input, directory: this.#selection.directory}, id); }
  snapshot(output, id) { return this.call('installation.snapshot', {output, operation_id: id}, id); }
  configuration() { return this.call('configuration.read'); }
  saveConfiguration(revision, configuration, id) { return this.call('configuration.save', {revision, configuration}, id); }
  queue(filters = {}) { return this.call('queue.list', filters); }
  delivery(delivery_id) { return this.call('queue.get', {delivery_id}); }
  history(tenant, job, filters = {}) { return this.call('jobs.history', {tenant, job, ...filters}); }
  receiveEvent(tenant, event, id, ttl_seconds) {
    return this.call('events.receive', {tenant, event, ...(ttl_seconds === undefined ? {} : {ttl_seconds})}, id);
  }
  request(request_id, installation_id) { return this.call('requests.get', {request_id, ...(installation_id === undefined ? {} : {installation_id})}); }
  close() {
    return this.#closed ??= (async () => { this.#closing = true; await Promise.allSettled([...this.#active]); })();
  }
}
