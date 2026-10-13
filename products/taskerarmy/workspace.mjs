// MIT. Source-owned MCP operations over the one original Tasker installation.
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {lstat, realpath} from 'node:fs/promises';
import {TaskerInstallation, TASKER_SOURCE, canonicalDirectory, exact, plain, readPrivateJSON,
  requestId, selectedPath, taskerError} from './client.mjs';
import {taskerWorkspaceTools} from './catalog.mjs';

export const TASKER_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.tasker-workspace-connection.v1';
const alias = value => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) ||
      ['__proto__', 'constructor', 'prototype'].includes(value))
    throw taskerError('INVALID_PARAMS', 'Choose a configured Tasker workspace alias.');
  return value;
};
async function originalFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path)
    throw taskerError('TASKER_CONFIGURATION_ERROR', 'Choose a canonical original regular file.');
  return path;
}
/** Reads only host selections. Preparing or receiving happens in the original native operation. */
export async function readTaskerWorkspaceConfiguration(path) {
  const selected = await readPrivateJSON(path, 65536), raw = selected.value;
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== TASKER_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      Object.keys(raw.workspaces).length < 1 || Object.keys(raw.workspaces).length > 32)
    throw taskerError('TASKER_CONFIGURATION_ERROR', 'Declare one to thirty-two original Tasker workspaces.');
  const base = dirname(selected.path), workspaces = Object.create(null), seen = new Set();
  for (const [name, input] of Object.entries(raw.workspaces)) {
    alias(name);
    exact(input, ['label', 'directory', 'sourceDirectory', 'application', 'python', 'configurationFile',
      'manifestPath', 'transferDirectory', 'receiveArchive', 'binding'], ['directory']);
    const directory = await canonicalDirectory(selectedPath(input.directory, base), {missing: true, privateOnly: true});
    if (seen.has(directory)) throw taskerError('TASKER_CONFIGURATION_ERROR', 'Give each original installation directory one alias.');
    seen.add(directory);
    const sourceDirectory = await canonicalDirectory(selectedPath(input.sourceDirectory ?? TASKER_SOURCE, base));
    await originalFile(join(sourceDirectory, 'native', 'operations.py'));
    const value = {directory, sourceDirectory, python: selectedPath(input.python ?? '/usr/bin/python3', base),
      application: await canonicalDirectory(selectedPath(input.application ?? sourceDirectory, base)),
      label: input.label ?? name};
    if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 240 || /[\0\r\n]/.test(value.label))
      throw taskerError('TASKER_CONFIGURATION_ERROR', 'Use a short original workspace label.');
    for (const key of ['configurationFile', 'manifestPath', 'receiveArchive'])
      if (input[key] !== undefined) value[key] = await originalFile(selectedPath(input[key], base));
    if (input.transferDirectory !== undefined)
      value.transferDirectory = await canonicalDirectory(selectedPath(input.transferDirectory, base), {privateOnly: true});
    if (input.binding !== undefined) {
      const checked = new TaskerInstallation({directory, sourceDirectory, python: value.python, binding: input.binding});
      value.binding = checked.selection.binding; await checked.close();
    }
    workspaces[name] = value;
  }
  return {schema: TASKER_WORKSPACE_CONNECTION_SCHEMA,
    selectionSha256: createHash('sha256').update(selected.bytes).digest('hex'), workspaces};
}
const definitions = new Map(taskerWorkspaceTools((name, description, properties, required) =>
  ({name, properties, required})).map(value => [value.name, value]));
function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw taskerError('INVALID_PARAMS', 'Use an integer within this operation’s declared range.');
}
function decimal(value) {
  if (typeof value === 'number') { integer(value, 1, Number.MAX_SAFE_INTEGER); return; }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw taskerError('INVALID_PARAMS', 'Keep the original positive SQLite identifier as a decimal string or safe integer.');
}
function validate(input, requestLookup = false) {
  if (input.requestId !== undefined) {
    if (requestLookup) {
      if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(input.requestId))
        throw taskerError('INVALID_PARAMS', 'Select the retained original native request identifier.');
    } else requestId(input.requestId);
  }
  if (input.originInstallationId !== undefined) requestId(input.originInstallationId);
  for (const key of ['tenant', 'status', 'routeId', 'jobId']) if (input[key] !== undefined &&
    (typeof input[key] !== 'string' || !input[key].trim() || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(input[key])))
      throw taskerError('INVALID_PARAMS', 'Use the complete original ' + key + ' identifier.');
  for (const key of ['deliveryId', 'beforeId', 'beforeVersion']) if (input[key] !== undefined) decimal(input[key]);
  if (input.limit !== undefined) integer(input.limit, 1, 200);
  if (input.ttlSeconds !== undefined) integer(input.ttlSeconds, 60, 604800);
  if (input.operatorPort !== undefined) integer(input.operatorPort, 0, 65535);
  if (input.ingressPort !== undefined) integer(input.ingressPort, 1, 65535);
  if (input.workerInterval !== undefined && (typeof input.workerInterval !== 'number' ||
      !Number.isFinite(input.workerInterval) || input.workerInterval < 0.1 || input.workerInterval > 60))
    throw taskerError('INVALID_PARAMS', 'Choose a worker interval from 0.1 to 60 seconds.');
  if (input.roles !== undefined && (!Array.isArray(input.roles) || !input.roles.length ||
      input.roles.length > 3 || new Set(input.roles).size !== input.roles.length ||
      input.roles.some(role => !['operator', 'ingress', 'worker'].includes(role))))
    throw taskerError('INVALID_PARAMS', 'Select each original service role at most once.');
  if (input.revision !== undefined && !/^[a-f0-9]{64}$/.test(input.revision))
    throw taskerError('INVALID_PARAMS', 'Keep the original configuration revision.');
  for (const key of ['event', 'configuration']) if (input[key] !== undefined && !plain(input[key]))
    throw taskerError('INVALID_PARAMS', 'Supply the complete original ' + key + ' object.');
  if (input.event?.version !== undefined) decimal(input.event.version);
  if (input.outcome !== undefined && !['sent', 'retry', 'cancelled'].includes(input.outcome))
    throw taskerError('INVALID_PARAMS', 'Select the original delivery’s sent, retry or cancelled outcome.');
  if (input.note !== undefined && (typeof input.note !== 'string' || !input.note.trim() ||
      input.note.length > 300 || input.note.includes('\0')))
    throw taskerError('INVALID_PARAMS', 'Keep a complete operator note up to 300 characters.');
}
const keep = value => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

export class MerchantTaskerWorkspaces {
  #workspaces; #clients = new Map(); #closing = false; #closed;
  constructor(config) { this.#workspaces = structuredClone(config.taskerWorkspaces?.workspaces ?? {}); }
  get summary() {
    return {configured: Object.keys(this.#workspaces).length > 0, ownership: 'ORIGINAL_TASKER_INSTALLATION',
      workspaces: Object.entries(this.#workspaces).map(([workspace, value]) => ({workspace, label: value.label})),
      activeCalls: [...this.#clients.values()].reduce((sum, client) => sum + client.activeCalls, 0),
      closing: this.#closing};
  }
  #selected(workspace) {
    const selected = this.#workspaces[workspace];
    if (!selected) throw taskerError('TASKER_WORKSPACE_NOT_CONFIGURED', 'Choose a host-declared original Tasker alias.');
    let client = this.#clients.get(workspace);
    if (!client) {
      client = new TaskerInstallation({directory: selected.directory, sourceDirectory: selected.sourceDirectory,
        python: selected.python, ...(selected.binding ? {binding: selected.binding} : {})});
      this.#clients.set(workspace, client);
    }
    return {selected, client};
  }
  async call(name, args = {}) {
    if (this.#closing) throw taskerError('TASKER_CLOSING', 'The Tasker merchant adapter is draining.');
    const definition = definitions.get(name);
    if (!definition) throw taskerError('TOOL_NOT_FOUND', 'Unknown original Tasker tool.');
    exact(args, Object.keys(definition.properties), definition.required);
    const workspace = alias(args.workspace), input = structuredClone(args);
    validate(input, name === 'merchant_tasker_request');
    const {selected, client} = this.#selected(workspace);
    const action = name.slice('merchant_tasker_'.length), id = input.requestId;
    let result;
    if (action === 'status') result = await client.inspect();
    else if (action === 'prepare') {
      if (!selected.configurationFile) throw taskerError('TASKER_CONFIGURATION_REQUIRED', 'Select the original configuration file in this host’s connection JSON.');
      result = await client.prepare(keep({application: selected.application, configuration: selected.configurationFile,
        manifest_path: selected.manifestPath, python: selected.python}), id);
    } else if (action === 'adopt_source') {
      result = await client.call('installation.adopt_source', keep({application: selected.application,
        manifest_path: selected.manifestPath, operation_id: id}), id);
    } else if (action === 'snapshot') {
      if (!selected.transferDirectory) throw taskerError('TASKER_TRANSFER_DIRECTORY_REQUIRED', 'Select the original private transfer directory in this host’s connection JSON.');
      result = await client.snapshot(join(selected.transferDirectory, id + '.tar.gz'), id);
    } else if (action === 'receive') {
      if (!selected.receiveArchive) throw taskerError('TASKER_ARCHIVE_REQUIRED', 'Select the complete original receive archive in this host’s connection JSON.');
      result = await client.receive({archive_path: selected.receiveArchive, python: selected.python}, id);
    } else if (action === 'configuration') result = await client.configuration();
    else if (action === 'save_configuration') result = await client.saveConfiguration(input.revision, input.configuration, id);
    else if (action === 'queue_status') result = await client.call('queue.status', keep({tenant: input.tenant, limit: input.limit}));
    else if (action === 'queue') result = await client.queue(keep({tenant: input.tenant, status: input.status,
      route_id: input.routeId, job_id: input.jobId, before_id: input.beforeId, limit: input.limit}));
    else if (action === 'delivery') result = await client.delivery(input.deliveryId);
    else if (action === 'job_history') result = await client.history(input.tenant, input.jobId,
      keep({before_version: input.beforeVersion, limit: input.limit}));
    else if (action === 'receive_event') result = await client.receiveEvent(input.tenant, input.event, id, input.ttlSeconds);
    else if (action === 'render_event') result = await client.call('events.render', {tenant: input.tenant, event: input.event});
    else if (action === 'resolve_delivery') result = await client.call('deliveries.resolve',
      {delivery_id: input.deliveryId, outcome: input.outcome, note: input.note}, id);
    else if (action === 'resume_route') result = await client.call('routes.resume', {route_id: input.routeId}, id);
    else if (action === 'request') result = await client.request(id, input.originInstallationId);
    else if (action === 'commands') result = await client.call('commands.describe', keep({roles: input.roles,
      operator_port: input.operatorPort, ingress_port: input.ingressPort, worker_interval: input.workerInterval,
      ready_file: join(selected.directory, 'operator-ready.json')}));
    else throw taskerError('TOOL_NOT_FOUND', 'Unknown original Tasker operation.');
    return {...result, workspace};
  }
  close() {
    return this.#closed ??= (async () => {
      this.#closing = true; await Promise.allSettled([...this.#clients.values()].map(client => client.close()));
    })();
  }
}
