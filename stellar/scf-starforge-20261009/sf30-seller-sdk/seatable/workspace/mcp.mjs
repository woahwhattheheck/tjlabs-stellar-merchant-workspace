// MIT. Browser and agent authoring over the one original SeaTable workspace.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { exact, failure, identifier, line, plain, privateSupportDirectory } from '../../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import { RetainedFileReads } from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { MAX_PACKET_BYTES, makeSeaTableSourcePacket } from './packet.mjs';
import { inspectSeaTableAuthoring } from './launch.mjs';
import { UUID, SHA256, deploymentFile } from './catalog.mjs';
export { seatableWorkspaceTools } from './catalog.mjs';
import { MAX_WORKSPACE_BYTES } from './handover.mjs';
import { normalizeConnections } from './provider.mjs';

export const SEATABLE_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.seatable-authoring-connection.v1';
const NATIVE_SCHEMA = 'stellar-forge.seatable-authoring.v1';

function hostPath(value, base) {
  if (typeof value !== 'string' || !value || value.includes('\0'))
    throw failure('CONFIGURATION_ERROR', 'Declare a nonempty host path.');
  return isAbsolute(value) ? resolve(value) : resolve(base, value);
}
function nativeId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw failure('INVALID_PARAMS', 'Use the original request/instance UUID.');
  return value;
}
function expectedDigest(value) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw failure('INVALID_PARAMS', 'Use the inspected exact SHA256.');
  return value;
}
function nativeVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw failure('INVALID_PARAMS', 'Select an original positive source version.');
  return value;
}
function decode(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('SEATABLE_INPUT_JSON_INVALID', 'The declared input must be complete UTF-8 JSON.'); }
}
async function privateFile(path, maximum, consume = false) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.mode & 0o077n || before.size > BigInt(maximum))
      throw failure('SEATABLE_INPUT_PRIVATE_FILE_REQUIRED', 'Use one private regular file within the original size limit.');
    const hash = createHash('sha256'), blocks = [], buffer = Buffer.alloc(65536);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      if (position > maximum) throw failure('SEATABLE_INPUT_SIZE_LIMIT', 'The declared original file exceeds its size limit.');
      const block = buffer.subarray(0, bytesRead); hash.update(block);
      if (consume) blocks.push(Buffer.from(block));
    }
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(position) !== after.size)
      throw failure('SEATABLE_INPUT_CHANGED', 'The declared file changed while being read. Inspect its new original identity.');
    return { sha256: hash.digest('hex'), bytes: position, ...(consume ? { content: Buffer.concat(blocks, position) } : {}) };
  } catch (issue) {
    if (/^SEATABLE_/.test(issue.code ?? '')) throw issue;
    throw failure('SEATABLE_INPUT_UNAVAILABLE', 'The host-declared private input is unavailable. Check that same input alias on the host.');
  } finally { await handle?.close(); }
}
async function readConnectionFile(path) {
  return decode((await privateFile(path, 1024 * 1024, true)).content);
}

/** Host configuration only. Native model validates its saved database on explicit open. */
export async function readSeaTableWorkspaceConfiguration(path) {
  path = resolve(path);
  const raw = await readConnectionFile(path);
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== SEATABLE_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      !Object.keys(raw.workspaces).length || Object.keys(raw.workspaces).length > 32)
    throw failure('CONFIGURATION_ERROR', 'Declare between 1 and 32 original SeaTable source workspaces.');
  const base = dirname(path), directories = new Set(), workspaces = Object.create(null);
  for (const [key, input] of Object.entries(raw.workspaces)) {
    identifier(key, 'SeaTable workspace alias');
    exact(input, ['label', 'directory', 'connections', 'inputs', 'seller', 'resource'], ['directory']);
    const directory = hostPath(input.directory, base);
    await privateSupportDirectory(directory);
    const canonical = await realpath(directory), database = await lstat(join(directory, 'sources.sqlite'));
    if (canonical !== directory || directories.has(canonical) || !database.isFile() || database.isSymbolicLink() ||
        database.nlink !== 1 || database.mode & 0o077)
      throw failure('CONFIGURATION_ERROR', 'Bind each existing private original SeaTable source database through one canonical alias.');
    directories.add(canonical);
    const identity = (await inspectSeaTableAuthoring(directory)).sha256;
    let connections = {};
    if (input.connections !== undefined) {
      const file = hostPath(input.connections, base);
      connections = normalizeConnections(await readConnectionFile(file));
    }
    if (input.inputs !== undefined && (!plain(input.inputs) || Object.keys(input.inputs).length > 64))
      throw failure('CONFIGURATION_ERROR', 'Declare at most 64 named original frozen-source or private-packet inputs.');
    const inputs = Object.create(null);
    for (const [alias, item] of Object.entries(input.inputs ?? {})) {
      identifier(alias, 'SeaTable input alias');
      exact(item, ['kind', 'file', 'label'], ['kind', 'file']);
      if (!['source', 'packet', 'workspace'].includes(item.kind))
        throw failure('CONFIGURATION_ERROR', 'A source input is an original frozen declaration; packet is a complete capture; workspace is an original complete .stwh handover.');
      inputs[alias] = { kind: item.kind, file: hostPath(item.file, base),
        label: line(item.label ?? alias, 'SeaTable input label') };
    }
    if ((input.seller === undefined) !== (input.resource === undefined))
      throw failure('CONFIGURATION_ERROR', 'Declare seller and resource together for the original buyer handoff.');
    for (const key of ['seller', 'resource']) if (input[key] !== undefined) {
      let url;
      try { url = new URL(input[key]); } catch {}
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
        throw failure('CONFIGURATION_ERROR', 'Use a host-declared HTTP(S) seller and resource without URL credentials or fragments.');
    }
    workspaces[key] = { label: line(input.label ?? key, 'SeaTable workspace label'), directory, identity, connections, inputs,
      seller: input.seller ?? null, resource: input.resource ?? null };
  }
  return { schema: SEATABLE_WORKSPACE_CONNECTION_SCHEMA, workspaces };
}

// Dynamic query/column names and public values are data. A public alias named
// "directory" or "sourceFile" must survive without exposing an internal path.
const dataFields = new Set(['draft', 'columns', 'sample', 'samples', 'columnTypes', 'projection', 'rows']);
const keyedFields = new Set(['queries', 'reports', 'datasets']);
const privateFields = new Set(['directory', 'sourceFile', 'targetDirectory', 'publisherDirectory', 'manifestFile',
  'captureFile', 'resourceFile', 'oauthDirectory', 'tokenEnv', 'accessTokenEnv', 'root',
  'releaseDirectory', 'packageDirectory', 'datasetDirectory', 'path', 'folder']);
function view(value) {
  if (Array.isArray(value)) return value.map(view);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    !privateFields.has(key) && !(key === 'file' && typeof item === 'string' && isAbsolute(item))
  ).map(([key, item]) => {
    if (dataFields.has(key)) return [key, structuredClone(item)];
    if (keyedFields.has(key) && plain(item))
      return [key, Object.fromEntries(Object.entries(item).map(([name, original]) => [name, view(original)]))];
    if (key === 'error' && plain(item)) return [key, { code: item.code ?? 'SEATABLE_OPERATION_FAILED', status: item.status ?? null }];
    return [key, view(item)];
  }));
}
function safeError(issue) {
  const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(issue?.code ?? '') ? issue.code : 'SEATABLE_WORKSPACE_OPERATION_FAILED';
  return failure(code, 'Original SeaTable operation: ' + code + '. Read its original request receipt and current source state before continuing.');
}

export class MerchantSeaTableWorkspaces {
  #derived=new Map(); #config; #publishers; #entries = new Map(); #opening = new Map(); #closing = false; #close;
  #reads = new RetainedFileReads({ errorPrefix: 'SEATABLE_PACKET',maxImmutableFileBytes:MAX_WORKSPACE_BYTES+32*1024*1024+13 });
  constructor(config, publishers) { this.#config = config; this.#publishers = publishers; }
  get summary() {
    return { configured: Boolean(this.#config.seatableWorkspaces), ...this.#reads.summary,
      workspaces: [...Object.entries(this.#config.seatableWorkspaces?.workspaces ?? {}),...this.#derived.entries()].map(([workspace, value]) => {
        const entry = this.#entries.get(workspace);
        return { workspace, label: value.label, open: Boolean(entry?.admitted??(entry&&entry.model)), cleanupPending:Boolean(entry?.cleanupPending), opening: this.#opening.has(workspace),
          closing: Boolean(entry?.closing), instanceId: entry?.instanceId ?? null,
          browserUrl: entry?.service.url ?? null, inputAliases: Object.keys(value.inputs),
          connectionAliases: Object.keys(value.connections), workspaceIdentity: value.identity, buyerConfigured: Boolean(value.seller) };
      }) };
  }
  #definition(alias) {
    identifier(alias, 'SeaTable workspace alias');
    const definition = this.#config.seatableWorkspaces?.workspaces[alias]??this.#derived.get(alias);
    if (!definition) throw failure('SEATABLE_WORKSPACE_NOT_CONFIGURED', 'Choose a host-declared alias from merchant_seatable_workspaces.');
    return definition;
  }
  #entry(alias) {
    this.#definition(alias);
    const entry = this.#entries.get(alias);
    if (!entry) throw failure('SEATABLE_WORKSPACE_NOT_OPEN', 'Explicitly open this original SeaTable source workspace first.');
    if(entry.cleanupPending)throw failure('SEATABLE_CLEANUP_PENDING','Close the retained original instance.');
    if (entry.closing) throw failure('SEATABLE_WORKSPACE_CLOSING', 'This owned original SeaTable workspace is draining.');
    return entry;
  }
  #scope(alias) { return 'seatable:' + alias + ':' + this.#definition(alias).directory; }
  async #state(entry, options) {
    const native = await entry.model.status(options);
    if (native.schema !== NATIVE_SCHEMA) throw failure('SEATABLE_WORKSPACE_SCHEMA_CHANGED', 'Use the original supported SeaTable source workspace.');
    return { workspace: entry.alias, instanceId: entry.instanceId, browserUrl: entry.service.url,
      native: view(native), packetReads: this.#reads.status(this.#scope(entry.alias)) };
  }
  async #open(alias) {
    const definition = this.#definition(alias);
    if(this.#entries.get(alias)?.cleanupPending)throw failure('SEATABLE_CLEANUP_PENDING','Close the exact retained instance before opening another.');
    if (this.#entries.has(alias)) return this.#state(this.#entry(alias));
    if (this.#opening.has(alias)) return this.#opening.get(alias);
    const opening = (async () => {
      const { openSeaTableAuthoring } = await import('./model.mjs');
      const { serveSeaTableAuthoring } = await import('./server.mjs');
      let model, service;
      try {
        model = await openSeaTableAuthoring({ directory: definition.directory, connections: definition.connections,
          seller: definition.seller, resource: definition.resource, expectedIdentity: definition.identity });
        service = await serveSeaTableAuthoring({ workspace: model, port: 0 });
        if (this.#closing) throw failure('SEATABLE_WORKSPACE_CLOSING', 'The merchant operator is closing.');
        const entry = { alias, model, service, instanceId: randomUUID(), pending: new Set(), closing: null,admitted:false,cleanupPending:false };
        this.#entries.set(alias, entry);
        try {const state=await this.#state(entry);entry.admitted=true;return state;}
        catch (issue) {entry.cleanupPending=true;throw issue;}
       } catch (issue) {
        let entry=this.#entries.get(alias);
        const owner=service??model??issue.seaTableCleanup;
        if(owner&&!entry){entry={alias,model:model??null,service:service??{close:()=>owner.close()},instanceId:randomUUID(),pending:new Set(),closing:null,admitted:false,cleanupPending:true};this.#entries.set(alias,entry);}
        if(entry){entry.cleanupPending=true;try{await this.#closeEntry(entry);}catch(cleanup){issue.cleanupCode=cleanup.code??'SEATABLE_CLOSE_FAILED';}}
        throw issue;
      }
    })();
    this.#opening.set(alias, opening);
    try { return await opening; } finally { this.#opening.delete(alias); }
  }
  async #closeEntry(entry) {
    if(!entry.closing){
      const attempt=(async()=>{
        await Promise.allSettled([...entry.pending]);
        for(const child of [...this.#entries.values()].filter(c=>c.parentAlias===entry.alias))await this.#closeEntry(child);
        await this.#reads.closeScope(this.#scope(entry.alias));
        if(entry.parentAlias){const parent=this.#entries.get(entry.parentAlias);if(parent)await parent.model.closeReceivedWorkspace(entry.childName);else await entry.service.close();}
        else await entry.service.close();
        if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);
        if(entry.parentAlias)this.#derived.delete(entry.alias);
        return{workspace:entry.alias,instanceId:entry.instanceId,state:'CLOSED'};
      })();
      entry.closing=attempt;attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
    }return entry.closing;
  }

  #input(alias, input) {
    identifier(input, 'SeaTable input alias');
    const configured = this.#definition(alias).inputs[input];
    if (!configured) throw failure('SEATABLE_INPUT_NOT_CONFIGURED', 'Choose an original input declared by this host.');
    return configured;
  }
  async #inputs(alias, selectedInput) {
    const configured = this.#definition(alias).inputs;
    if (selectedInput === undefined) return { workspace: alias,
      inputs: Object.entries(configured).map(([input, value]) => ({ input, label: value.label, kind: value.kind })) };
    const input = this.#input(alias, selectedInput);
    const current = await privateFile(input.file, input.kind === 'workspace' ? MAX_WORKSPACE_BYTES+32*1024*1024+13 : input.kind === 'packet' ? MAX_PACKET_BYTES : 1048576);
    return { workspace: alias, input: selectedInput, label: input.label, kind: input.kind,
      file: { name: basename(input.file), bytes: current.bytes, sha256: current.sha256 } };
  }
  async #import(entry, args, kind) {
    const input = this.#input(entry.alias, args.input), expected = expectedDigest(args.expectedSha256);
    if (input.kind !== kind) throw failure('SEATABLE_INPUT_KIND_CONFLICT', 'Choose the declared original input kind.');
    nativeId(args.requestId);
    let packet, importedSha256;
    if (kind === 'source') {
      // The original builder hashes the SAME declaration it interprets, then
      // verifies its pinned capture. Never verify one read and import another.
      packet = await makeSeaTableSourcePacket(input.file);
      importedSha256 = packet.origin.sourceSha256;
    } else {
      const source = await privateFile(input.file, MAX_PACKET_BYTES, true);
      importedSha256 = source.sha256; packet = decode(source.content);
    }
    if (importedSha256 !== expected)
      throw failure('SEATABLE_INPUT_CHANGED', 'Inspect the exact current host input before importing it.');
    const result = await entry.model.importPacket({ packet, title: args.title,
      expectedDraftRevision: args.expectedDraftRevision, requestId: args.requestId });
    return { workspace: entry.alias, input: args.input, importedSha256, native: view(result) };
  }
  async #execute(entry, name, args) {
    const original = entry.model, { workspace, ...input } = args;
    if (name.startsWith('merchant_seatable_publisher_') &&
        !['merchant_seatable_publisher_open', 'merchant_seatable_publisher_close'].includes(name)) {
      if (!this.#publishers || typeof this.#publishers.callBorrowed !== 'function')
        throw failure('SEATABLE_PUBLISHER_ADAPTER_MISSING', 'Use the matching original merchant publisher adapter.');
      return original.withOpenPublisher(async ({ publisher, schedule }) => {
        const result = await this.#publishers.callBorrowed({
          alias: workspace, publisher, schedule, instanceId: entry.instanceId,
        }, name.replace('merchant_seatable_publisher_', 'merchant_publisher_'), { publisher: workspace, ...input });
        const { publisher: ignored, ...native } = plain(result) ? result : { result };
        return { workspace, authoringInstanceId: entry.instanceId, native: view(native) };
      });
    }
    switch (name) {
      case 'merchant_seatable_workspace_export': return {workspace,native:view(await original.exportWorkspace(input))};
      case 'merchant_seatable_workspace_exports': return {workspace,exports:view(await original.workspaceExports())};
      case 'merchant_seatable_workspace_transfer': return {workspace,receipt:view(input.kind==='export'?await original.workspaceExportStatus(nativeId(input.requestId)):await original.workspaceReceiveStatus(nativeId(input.requestId)))};
      case 'merchant_seatable_workspace_receive': {
        const source=this.#input(workspace,input.input);if(source.kind!=='workspace')throw failure('SEATABLE_INPUT_KIND_CONFLICT','Choose a complete workspace alias.');
        return {workspace,native:view(await original.receiveWorkspaceFile({archiveFile:source.file,expectedSha256:expectedDigest(input.expectedSha256),name:input.name,requestId:nativeId(input.requestId)}))};
      }
      case 'merchant_seatable_workspace_received': return {workspace,received:view(await original.receivedWorkspaces())};
      case 'merchant_seatable_workspace_open_received': {
        const alias=(workspace.slice(0,28)+'_received_'+createHash('sha256').update(JSON.stringify([workspace,input.name])).digest('hex').slice(0,16));
        await original.withReceivedWorkspace(input.name,async child=>{
          const old=this.#entries.get(alias);
          if(old&&old.model!==child.model)throw failure('SEATABLE_RECEIVED_INSTANCE_CHANGED','Close the original received alias before opening a replacement.');
          if(!old){const parent=this.#definition(workspace),definition={...parent,directory:child.model.directory,identity:(await inspectSeaTableAuthoring(child.model.directory)).sha256,label:parent.label+' / '+input.name};
            this.#derived.set(alias,definition);this.#entries.set(alias,{alias,model:child.model,service:child.service,instanceId:randomUUID(),parentAlias:workspace,childName:input.name,pending:new Set(),closing:null});}
        });
        return {parentWorkspace:workspace,childWorkspace:alias,...await this.#state(this.#entry(alias))};
      }
      case 'merchant_seatable_workspace_read': {
        const id=nativeId(input.requestId);const chunk=await this.#reads.read({scope:this.#scope(workspace),key:'workspace:'+id,kind:'seatable-whole-workspace',
          directory:this.#definition(workspace).directory,readId:input.readId,expectedSha256:input.expectedSha256,offset:input.offset,limit:input.limit,
          load:async()=>{const file=await original.exportWorkspaceFile(id);const handle=await open(file.path,constants.O_RDONLY|constants.O_NOFOLLOW);
            return{readonlyFileHandle:handle,name:file.filename,type:file.mime,bytes:file.bytes,sha256:file.sha256};}});
        return{workspace,requestId:id,...chunk};
      }
      case 'merchant_seatable_status': return this.#state(entry, input);
      case 'merchant_seatable_inputs': return this.#inputs(workspace, input.input);
      case 'merchant_seatable_import': return this.#import(entry, args, 'source');
      case 'merchant_seatable_import_packet': return this.#import(entry, args, 'packet');
      case 'merchant_seatable_discover': return { workspace, native: view(await original.discover(input)) };
      case 'merchant_seatable_discovery': return { workspace, native: view(original.discovery(nativeId(input.requestId))) };
      case 'merchant_seatable_capture': return { workspace, native: view(await original.readLive(input)) };
      case 'merchant_seatable_capture_attempt': return { workspace, native: view(await original.captureAttempt(nativeId(input.requestId))) };
      case 'merchant_seatable_columns': return { workspace, native: view(await original.inspectCapture(nativeId(input.captureId))) };
      case 'merchant_seatable_draft_save': return { workspace, native: view(await original.saveDraft(input)) };
      case 'merchant_seatable_preview': return { workspace, native: view(await original.preview(input)) };
      case 'merchant_seatable_version_save': return { workspace, native: view(await original.saveVersion(input)) };
      case 'merchant_seatable_version': return { workspace, native: view(original.version(nativeVersion(input.versionId))) };
      case 'merchant_seatable_compare': return { workspace, native: view(await original.compareVersions(nativeVersion(input.leftVersion), nativeVersion(input.rightVersion))) };
      case 'merchant_seatable_select': return { workspace, native: view(await original.selectVersion(input)) };
      case 'merchant_seatable_operation': {
        const receipt = original.operation(nativeId(input.requestId)), state = await original.status();
        return { workspace, receipt: view(receipt), currentPublisher: view(state.publisher), currentDeployment: view(state.deployment),
          currentSelection: state.selectedVersion, currentDraftRevision: state.draftRevision };
      }
      case 'merchant_seatable_resume': {
        const result = await original.resume(nativeId(input.requestId)), state = await original.status();
        return { workspace, native: view(result), receipt: view(original.operation(input.requestId)),
          currentPublisher: view(state.publisher), currentDeployment: view(state.deployment), currentSelection: state.selectedVersion };
      }
      case 'merchant_seatable_publisher_open':
      case 'merchant_seatable_publisher_close': {
        const result = name === 'merchant_seatable_publisher_open' ? await original.openPublisher(input) : await original.closePublisher(input);
        const state = await original.status();
        const { url: recordedBrowserUrl, ...receipt } = result;
        return { workspace, receipt: view({ ...receipt, ...(recordedBrowserUrl ? { recordedBrowserUrl } : {}) }),
          currentPublisher: view(state.publisher), currentSelection: state.selectedVersion };
      }
      case 'merchant_seatable_deployment_status': return { workspace, native: view(await original.deploymentStatus(input)) };
      case 'merchant_seatable_deployment_review': return { workspace, native: view(await original.reviewDeployment(input)) };
      case 'merchant_seatable_deployment_prepare': return { workspace, native: view(await original.prepareDeployment(input)) };
      case 'merchant_seatable_deployment_package': return { workspace, native: view(await original.inspectDeploymentPackage(nativeId(input.packageRequestId))) };
      case 'merchant_seatable_deployment_stage': return { workspace, native: view(await original.stageDeployment(input)) };
      case 'merchant_seatable_deployment_compare': return { workspace, native: view(await original.compareDeployment(input)) };
      case 'merchant_seatable_deployment_command': {
        const result = await original.commandDeployment(input), current = await original.deploymentStatus();
        return { workspace, receipt:view(result), currentDeployment:view(current.console), native:view(current.native) };
      }
      case 'merchant_seatable_deployment_console_open':
      case 'merchant_seatable_deployment_console_close': {
        const result = name === 'merchant_seatable_deployment_console_open'
          ? await original.openDeploymentConsole(input) : await original.closeDeploymentConsole(input);
        const current = await original.status(), { url:recordedConsoleUrl, ...receipt } = result;
        return { workspace, receipt:view({...receipt, ...(recordedConsoleUrl ? {recordedConsoleUrl} : {})}),
          currentDeployment:view(current.deployment) };
      }
      case 'merchant_seatable_deployment_file_read': {
        const packageRequestId = nativeId(input.packageRequestId), filename = input.file;
        if (!deploymentFile.enum.includes(filename)) throw failure('INVALID_PARAMS','Choose one original package filename.');
        const chunk = await this.#reads.read({ scope:this.#scope(workspace),
          key:'deployment:' + packageRequestId + ':' + filename, kind:'seatable-deployment-file',
          directory:this.#definition(workspace).directory,
          readId:input.readId, expectedSha256:input.expectedSha256, offset:input.offset, limit:input.limit,
          load:async () => { const file = await original.deploymentFile(packageRequestId,filename);
            return {name:file.filename,type:file.mime,bytes:file.bytes}; } });
        return { workspace, packageRequestId, file:filename, ...chunk };
      }
      case 'merchant_seatable_deployment_file_release':
        await this.#reads.release(this.#scope(workspace), nativeId(input.readId));
        return { workspace, readId:input.readId, state:'RELEASED' };
      case 'merchant_seatable_capture_read': {
        const captureId = nativeId(input.captureId);
        const chunk = await this.#reads.read({ scope: this.#scope(workspace), key: 'capture:' + captureId,
          kind: 'seatable-capture-packet', directory: this.#definition(workspace).directory,
          readId: input.readId, expectedSha256: input.expectedSha256, offset: input.offset, limit: input.limit,
          load: async () => { const packet = await original.exportCapture(captureId);
            return { name: packet.filename, type: packet.mime, bytes: packet.bytes }; } });
        return { workspace, captureId, ...chunk };
      }
      case 'merchant_seatable_packet_read': {
        const versionId = nativeVersion(input.versionId); original.version(versionId);
        const chunk = await this.#reads.read({ scope: this.#scope(workspace), key: 'source-version:' + versionId,
          kind: 'seatable-source-packet', directory: this.#definition(workspace).directory,
          readId: input.readId, expectedSha256: input.expectedSha256, offset: input.offset, limit: input.limit,
          load: async () => { const packet = await original.exportVersion(versionId);
            return { name: packet.filename, type: packet.mime, bytes: packet.bytes }; } });
        return { workspace, versionId, ...chunk };
      }
      case 'merchant_seatable_packet_release':
        await this.#reads.release(this.#scope(workspace), nativeId(input.readId));
        return { workspace, readId: input.readId, state: 'RELEASED' };
      default: throw failure('TOOL_NOT_FOUND', 'Unknown SeaTable authoring operation.');
    }
  }
  async call(name, args = {}) {
    args=structuredClone(args);
    if (this.#closing && name!=='merchant_seatable_close') throw failure('SEATABLE_WORKSPACE_CLOSING', 'The merchant operator is closing.');
    try {
      if (name === 'merchant_seatable_workspaces') return this.summary;
      if (name === 'merchant_seatable_open') return await this.#open(args.workspace);
      if (name === 'merchant_seatable_close') {
        this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);if(!entry)throw failure('SEATABLE_WORKSPACE_NOT_OPEN','No owned instance is open.');
        if (entry.instanceId !== nativeId(args.instanceId))
          throw failure('SEATABLE_INSTANCE_CONFLICT', 'Close only the current SeaTable instance owned by this MCP process.');
        return await this.#closeEntry(entry);
      }
      const entry = this.#entry(args.workspace), pending = Promise.resolve().then(() => this.#execute(entry, name, args));
      entry.pending.add(pending);
      try { return await pending; } finally { entry.pending.delete(pending); }
    } catch (issue) { throw safeError(issue); }
  }
  close() {
    if (!this.#close) {
      this.#closing = true;
      const attempt = (async () => {
        await Promise.allSettled([...this.#opening.values()]);
        const results = await Promise.allSettled([...this.#entries.values()].map(entry => this.#closeEntry(entry)));
        await this.#reads.close();
        if (results.some(result => result.status === 'rejected'))
          throw failure('SEATABLE_SHUTDOWN_INCOMPLETE', 'An original owned SeaTable workspace reported incomplete shutdown.');
      })();
      this.#close=attempt;attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});
    }
    return this.#close;
  }
}
