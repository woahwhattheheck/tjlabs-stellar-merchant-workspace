// Apache-2.0. Configured original publishing installations for the existing Merchant owner.
import {createHash, randomUUID} from 'node:crypto';
import {dirname, join} from 'node:path';
import {lstat, realpath} from 'node:fs/promises';
import {PublicationInstallation, PUBLICATION_SOURCE, canonicalDirectory, exact, plain, readPrivateJSON,
  requestId, selectedPath, publicationError} from './client.mjs';
import {publicationWorkspaceTools} from './catalog.mjs';
export const PUBLICATION_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.publication-workspace-connection.v1';
const keep = input => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
function alias(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) ||
      ['__proto__', 'prototype', 'constructor'].includes(value))
    throw publicationError('INVALID_PARAMS', 'Select a configured publication workspace alias.');
  return value;
}
async function originalFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path)
    throw publicationError('PUBLICATION_SOURCE_FILE', 'Select a canonical original source or archive file.');
  return path;
}
export async function readPublicationWorkspaceConfiguration(path) {
  const selected = await readPrivateJSON(path, 131072), raw = selected.value;
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== PUBLICATION_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      !Object.keys(raw.workspaces).length || Object.keys(raw.workspaces).length > 32)
    throw publicationError('PUBLICATION_CONFIGURATION', 'Select one to thirty-two original publication workspaces.');
  const base = dirname(selected.path), workspaces = Object.create(null), seen = new Set();
  for (const [name, input] of Object.entries(raw.workspaces)) {
    alias(name);
    exact(input, ['label', 'directory', 'sourceDirectory', 'sourceRoot', 'sourceManifest', 'python',
      'workspaceArchive', 'receiveArchive', 'nativeFile', 'transferDirectory', 'binding'], ['directory']);
    const directory = await canonicalDirectory(selectedPath(input.directory, base), {missing: true, privateOnly: true});
    if (seen.has(directory)) throw publicationError('PUBLICATION_CONFIGURATION', 'Give each actual installation directory one alias.');
    seen.add(directory);
    const sourceDirectory = await canonicalDirectory(selectedPath(input.sourceDirectory ?? PUBLICATION_SOURCE, base));
    await originalFile(join(sourceDirectory, 'native', 'operations.py'));
    const value = {directory, sourceDirectory, python: selectedPath(input.python ?? '/usr/bin/python3', base),
      label: input.label ?? name};
    if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 240 || /[\0\r\n]/.test(value.label))
      throw publicationError('PUBLICATION_CONFIGURATION', 'Use a complete short publication label.');
    if (input.sourceRoot !== undefined)
      value.sourceRoot = await canonicalDirectory(selectedPath(input.sourceRoot, base));
    for (const key of ['sourceManifest', 'workspaceArchive', 'receiveArchive', 'nativeFile'])
      if (input[key] !== undefined) value[key] = await originalFile(selectedPath(input[key], base));
    if (input.transferDirectory !== undefined)
      value.transferDirectory = await canonicalDirectory(selectedPath(input.transferDirectory, base), {privateOnly: true});
    if (input.binding !== undefined) {
      const temporary = new PublicationInstallation({directory, sourceDirectory, python: value.python, binding: input.binding});
      value.binding = temporary.selection.binding; await temporary.close();
    }
    workspaces[name] = value;
  }
  return {schema: PUBLICATION_WORKSPACE_CONNECTION_SCHEMA, workspaces,
    selectionSha256: createHash('sha256').update(selected.bytes).digest('hex')};
}
const definitions = new Map(publicationWorkspaceTools((name, description, properties, required) =>
  ({name, properties, required})).map(value => [value.name, value]));
function selectionSource(selected) {
  if (!selected.sourceRoot || !selected.sourceManifest)
    throw publicationError('PUBLICATION_SOURCE_SELECTION', 'Select the complete original source root and manifest in the private connection.');
  return {source_root: selected.sourceRoot, source_manifest: selected.sourceManifest};
}
async function nativeSelection(selected) {
  if (!selected.nativeFile) return undefined;
  const value = (await readPrivateJSON(selected.nativeFile, 32768)).value;
  exact(value, ['node', 'playground_module', 'wordpress_zip'], ['node', 'playground_module', 'wordpress_zip']);
  return Object.fromEntries(Object.entries(value).map(([key, path]) => [key, selectedPath(path, dirname(selected.nativeFile))]));
}
function validate(input, lookup) {
  if (input.requestId !== undefined) {
    if (lookup) {
      if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(input.requestId))
        throw publicationError('INVALID_PARAMS', 'Select the retained original lifecycle identifier.');
    } else requestId(input.requestId);
  }
  if (input.originInstallationId !== undefined) requestId(input.originInstallationId);
  if (input.actor !== undefined && (typeof input.actor !== 'string' || !input.actor.trim() ||
      input.actor.length > 200 || /[\0\r\n]/.test(input.actor)))
    throw publicationError('INVALID_PARAMS', 'Give the original operation its complete actor label.');
  for (const key of ['recordId', 'jobId', 'documentId', 'requirementId', 'returnId'])
    if (input[key] !== undefined && (typeof input[key] !== 'string' || !input[key] ||
        input[key].length > 200 || /[\0\r\n]/.test(input[key])))
      throw publicationError('INVALID_PARAMS', 'Keep the complete original ' + key + '.');
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 0 || input.port > 65535))
    throw publicationError('INVALID_PARAMS', 'Choose a local service port from 0 to 65535.');
  if (input.roles !== undefined && (!Array.isArray(input.roles) || !input.roles.length ||
      new Set(input.roles).size !== input.roles.length ||
      input.roles.some(value => !['operator', 'resident', 'wordpress'].includes(value))))
    throw publicationError('INVALID_PARAMS', 'Select each original service role at most once.');
  if (input.releaseId !== undefined && !/^[a-f0-9]{64}$/.test(input.releaseId))
    throw publicationError('INVALID_PARAMS', 'Keep the exact original frozen release identity.');
}
export class MerchantPublicationWorkspaces {
  #workspaces; #clients = new Map(); #closing = false; #closed;
  constructor(config) { this.#workspaces = structuredClone(config.publicationWorkspaces?.workspaces ?? {}); }
  get summary() {
    return {configured: Object.keys(this.#workspaces).length > 0, ownership: 'ORIGINAL_PUBLICATION_INSTALLATION',
      workspaces: Object.entries(this.#workspaces).map(([workspace, value]) => ({workspace, label: value.label})),
      activeCalls: [...this.#clients.values()].reduce((n, value) => n + value.activeCalls, 0), closing: this.#closing};
  }
  #selected(name) {
    const selected = this.#workspaces[name];
    if (!selected) throw publicationError('PUBLICATION_NOT_CONFIGURED', 'Select a host-declared original publication installation.');
    let client = this.#clients.get(name);
    if (!client) {
      client = new PublicationInstallation({directory: selected.directory, sourceDirectory: selected.sourceDirectory,
        python: selected.python, ...(selected.binding ? {binding: selected.binding} : {})});
      this.#clients.set(name, client);
    }
    return {selected, client};
  }
  async call(name, args = {}) {
    if (this.#closing) throw publicationError('PUBLICATION_CLOSING', 'The original publication adapter is draining its calls.');
    const definition = definitions.get(name);
    if (!definition) throw publicationError('TOOL_NOT_FOUND', 'Unknown publication operation.');
    exact(args, Object.keys(definition.properties), definition.required);
    const action = name.slice('merchant_publication_'.length), input = structuredClone(args);
    const nameAlias = alias(input.workspace), id = input.requestId;
    validate(input, action === 'request');
    const {selected, client} = this.#selected(nameAlias);
    let reply;
    if (action === 'status') reply = await client.inspect();
    else if (action === 'source') reply = await client.source(selectionSource(selected));
    else if (action === 'prepare') {
      if (selected.receiveArchive) throw publicationError('PUBLICATION_RECEIVING_SELECTION', 'Receive the selected installation archive through this alias.');
      reply = await client.prepare(keep({...selectionSource(selected), python: selected.python,
        workspace_archive: selected.workspaceArchive, actor: input.actor, native: await nativeSelection(selected)}), id);
    } else if (action === 'adopt_source') reply = await client.adoptSource(selectionSource(selected), id);
    else if (action === 'snapshot' || action === 'export') {
      if (!selected.transferDirectory) throw publicationError('PUBLICATION_TRANSFER_DIRECTORY', 'Select the original private transfer directory in the connection.');
      const file = join(selected.transferDirectory, id + '.zip');
      reply = action === 'snapshot' ? await client.snapshot(file, id) : await client.export(input.kind, file, input.actor, id);
    } else if (action === 'receive') {
      if (!selected.receiveArchive) throw publicationError('PUBLICATION_ARCHIVE_SELECTION', 'Select the complete original installation archive in the connection.');
      const native = await nativeSelection(selected);
      reply = await client.receive(keep({archive_path: selected.receiveArchive, python: selected.python, actor: input.actor,
        native_runtime: native ? {node: native.node, playground_module: native.playground_module} : undefined}), id);
      if (reply.installation?.paths?.directory !== selected.directory)
        throw publicationError('PUBLICATION_RECEIVING_CHANGED', 'The original receiver selected another directory.');
    } else if (action === 'state') reply = await client.state();
    else if (action === 'record') reply = await client.record(input.recordId);
    else if (action === 'history') reply = await client.history(input.recordId);
    else if (action === 'job') reply = await client.call('workspace.job', {id: input.jobId});
    else if (action === 'procurement') reply = await client.procurement();
    else if (action === 'document') reply = await client.call('procurement.document', {id: input.documentId});
    else if (action === 'requirement') reply = await client.call('procurement.requirement', {id: input.requirementId});
    else if (action === 'native_return') reply = await client.call('native.return', {id: input.returnId});
    else if (action === 'native_configure') {
      const native = await nativeSelection(selected);
      if (!native) throw publicationError('PUBLICATION_NATIVE_SELECTION', 'Select the existing native runtime file in this private connection.');
      reply = await client.call('native.configure', native, id);
    } else if (action === 'request') reply = await client.request(id, input.originInstallationId);
    else if (action === 'commands') {
      if (!selected.transferDirectory) throw publicationError('PUBLICATION_TRANSFER_DIRECTORY', 'Select a private directory for a fresh original ready-file descriptor.');
      reply = await client.call('commands.describe', keep({roles: input.roles, port: input.port, release_id: input.releaseId,
        ready_file: join(selected.transferDirectory, 'service-' + randomUUID() + '.json')}));
    } else throw publicationError('TOOL_NOT_FOUND', 'Unknown original publication operation.');
    return {...reply, workspace: nameAlias};
  }
  close() {
    return this.#closed ??= (async () => {
      this.#closing = true;
      await Promise.allSettled([...this.#clients.values()].map(client => client.close()));
    })();
  }
}
