import { isOrganisationReconciliationTool, executeOrganisationReconciliation } from './organisation_reconciliation_mcp.mjs';
import { sourceWorkspaceTools, read, selection, page, digest, alias, UUID, SHA, ALIAS } from './catalog/source-workspace.mjs';
export { sourceWorkspaceTools } from './catalog/source-workspace.mjs';
import { IATI_ORGANISATION_TOOL_PREFIX } from './catalog/source-iati-organisation.mjs';
import { executeIatiOrganisation, IATI_ORGANISATION_ROUTE } from './source-iati-organisation.mjs';
// MIT. Agent access to the original XML/NDJSON/IATI console and its retained workspace.
import { constants } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { open, lstat, mkdir, readdir, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { RetainedFileReads, MAX_RETAINED_CHUNK_BYTES } from './retained-file-reads.mjs';

export const SOURCE_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.source-workspace-connection.v1';
const EXPORT_SCHEMA = 'stellar-forge.source-console-export.v1';



const MAX_EXPORT = 256000000;
const MAX_IATI_PACKET = 4 * 1024 * 1024 * 1024;
const exportLimit = (format, kind) => format === 'iati' && ['portfolio', 'report', 'dqa', 'publishing', 'refresh', 'organisation', 'results', 'results-report', 'reconciliation'].includes(kind) ? MAX_IATI_PACKET : ['dqa-file', 'organisation-file', 'reconciliation-file'].includes(kind) ? 64 * 1024 * 1024 : MAX_EXPORT;
const packetRoute = route => route === '/api/import' || route === IATI_ORGANISATION_ROUTE + 'receive' || route === '/api/iati/reconciliation/receive';
const extendedIatiRoute = route => route.startsWith('/api/iati/dqa/') || route.startsWith('/api/iati/publishing/') || route.startsWith('/api/iati/refresh/') || route.startsWith(IATI_ORGANISATION_ROUTE) || route.startsWith('/api/iati/results') || route.startsWith('/api/iati/reconciliation/');
const MAX_SOURCE = 256 * 1024 * 1024;
const MAX_JSON = 16 * 1024 * 1024;
const fail = (code, message) => Object.assign(new Error(message), { code });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function exact(value, keys, required = []) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw fail('INVALID_PARAMS', 'Supply the declared fields and every required field.');
}
function checked(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw fail('INVALID_PARAMS', 'Use a valid ' + label + '.');
  return value;
}
function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw fail('INVALID_PARAMS', 'Integer is outside its declared range.');
  return value;
}
function text(value, label, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value))
    throw fail('INVALID_PARAMS', label + ' must be printable, nonempty text.');
  return value;
}
async function fileHandle(path, maximum, privateFile = false) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum || privateFile && process.platform !== 'win32' && (info.mode & 0o077))
      throw fail('SOURCE_FILE_INVALID', 'Use a regular file within its original size and privacy limits.');
    return { handle, info };
  } catch (error) { await handle.close(); throw error; }
}
async function bytes(path, maximum, privateFile = false) {
  const { handle } = await fileHandle(path, maximum, privateFile);
  try {
    const value = await handle.readFile();
    if (value.length > maximum) throw fail('SOURCE_FILE_INVALID', 'The selected file grew beyond its size limit.');
    return value;
  } finally { await handle.close(); }
}
async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== 'win32' && (info.mode & 0o077))
    throw fail('SOURCE_EXPORT_DIRECTORY_INVALID', 'Use the original private customer export directory.');
  return path;
}
function hostPath(value, base) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw fail('CONFIGURATION_ERROR', 'Declare a host file path.');
  return resolve(base, value);
}
/** Connection files contain host references, never credentials or client-selected paths. */
export async function readSourceWorkspaceConfiguration(path) {
  path = resolve(path);
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(path, 1024 * 1024, true)));
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== SOURCE_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      Object.keys(raw.workspaces).length < 1 || Object.keys(raw.workspaces).length > 32)
    throw fail('CONFIGURATION_ERROR', 'Declare 1–32 original XML, NDJSON or IATI source workspaces.');
  const workspaces = Object.create(null), base = dirname(path);
  for (const [alias, input] of Object.entries(raw.workspaces)) {
    checked(alias, ALIAS, 'workspace alias');
    exact(input, ['label', 'format', 'consoleUrlEnv', 'consoleUrlFile', 'files'], ['format']);
    if (!['xml', 'ndjson', 'iati'].includes(input.format) || (input.consoleUrlEnv === undefined) === (input.consoleUrlFile === undefined))
      throw fail('CONFIGURATION_ERROR', 'Choose XML, NDJSON or IATI and exactly one original console URL environment or file reference.');
    const files = Object.create(null);
    if (input.files !== undefined && (!plain(input.files) || Object.keys(input.files).length > 128))
      throw fail('CONFIGURATION_ERROR', 'Declare up to 128 original source or project-packet file handles.');
    for (const [handle, file] of Object.entries(input.files ?? {})) {
      checked(handle, ALIAS, 'file handle');
      exact(file, ['path', 'kind', 'label', 'name', 'sha256'], ['path', 'kind']);
      if (!['source', 'packet'].includes(file.kind)) throw fail('CONFIGURATION_ERROR', 'File kind must be source or packet.');
      files[handle] = { path: hostPath(file.path, base), kind: file.kind,
        ...(file.label === undefined ? {} : { label: text(file.label, 'Source label') }),
        ...(file.name === undefined ? {} : { name: text(file.name, 'Source name') }),
        ...(file.sha256 === undefined ? {} : { sha256: checked(file.sha256, SHA, 'source SHA256') }) };
    }
    workspaces[alias] = { label: text(input.label ?? alias, 'Workspace label'), format: input.format, files,
      ...(input.consoleUrlEnv === undefined ? { consoleUrlFile: hostPath(input.consoleUrlFile, base) }
        : { consoleUrlEnv: checked(input.consoleUrlEnv, /^[A-Za-z_][A-Za-z0-9_]*$/, 'console URL environment name') }) };
  }
  return { schema: SOURCE_WORKSPACE_CONNECTION_SCHEMA, workspaces };
}







const definitions = new Map(sourceWorkspaceTools((name, description, properties, required) => ({ name, properties, required })).map(value => [value.name, value]));
function paged(items, input) {
  const offset = integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER), limit = integer(input.limit ?? 50, 1, 250);
  const snapshot = hash(JSON.stringify(items));
  if (input.expectedSnapshot !== undefined && checked(input.expectedSnapshot, SHA, 'inventory snapshot') !== snapshot)
    throw fail('SOURCE_INVENTORY_CHANGED', 'Original inventory changed. Continue a new page-zero snapshot.');
  if (offset && input.expectedSnapshot === undefined) throw fail('SOURCE_SNAPSHOT_REQUIRED', 'Continue the returned original inventory snapshot.');
  if (offset > items.length) throw fail('INVALID_PARAMS', 'Offset exceeds the original inventory.');
  return { total: items.length, snapshot, offset, items: items.slice(offset, offset + limit),
    nextOffset: offset + limit < items.length ? offset + limit : null };
}
async function responseBytes(response, maximum) {
  const pieces = []; let length = 0;
  for await (const chunk of response.body ?? []) {
    length += chunk.length;
    if (length > maximum) throw fail('SOURCE_RESPONSE_TOO_LARGE', 'Use the complete native export for this response.');
    pieces.push(chunk);
  }
  return Buffer.concat(pieces, length);
}

// Original consoles use HTTP/1.0. Keep their response stream on Node's native
// HTTP carrier: affected built-in Undici versions crash on EOF under backpressure
// (nodejs/undici#5360), including while a retained output file is being opened.
function originalConsoleResponse(url, { method, signal, headers, body }) {
  return new Promise((resolveResponse, reject) => {
    const requestHeaders = { ...headers };
    if (typeof body === 'string' || Buffer.isBuffer(body))
      requestHeaders['Content-Length'] = String(Buffer.byteLength(body));
    const outgoing = httpRequest(url, { method, signal, headers: requestHeaders }, incoming => {
      let responseHeaders;
      try {
        responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2)
          responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      } catch (error) { incoming.destroy(); reject(error); return; }
      incoming.once('error', reject);
      const status = incoming.statusCode ?? 0;
      resolveResponse({ ok: status >= 200 && status < 300, status, headers: responseHeaders, body: incoming });
    });
    outgoing.once('error', reject);
    if (body && typeof body.pipe === 'function') {
      const sourceError = error => outgoing.destroy(error);
      body.once('error', sourceError);
      outgoing.once('close', () => { body.off('error', sourceError); body.unpipe(outgoing); });
      body.pipe(outgoing);
    } else outgoing.end(body);
  });
}

export class MerchantSourceWorkspaces {
  #config; #pending = new Set(); #closing = false; #close;
  #reads = new RetainedFileReads({ errorPrefix: 'SOURCE_FILE' });
  constructor(config) { this.#config = config; }
  get summary() {
    return { configured: Boolean(this.#config.sourceWorkspaces), ...this.#reads.summary,
      workspaces: Object.entries(this.#config.sourceWorkspaces?.workspaces ?? {}).map(([workspace, value]) => ({
        workspace, label: value.label, format: value.format, connection: value.consoleUrlFile ? 'ORIGINAL_CONSOLE_URL_FILE' : 'ORIGINAL_CONSOLE_URL_ENV',
        files: Object.entries(value.files).map(([file, source]) => ({ file, kind: source.kind, sha256: source.sha256 ?? null })),
        fileReads: this.#reads.status(workspace), ownership: 'EXISTING_SOURCE_CONSOLE' })) };
  }
  #definition(workspace) {
    checked(workspace, ALIAS, 'workspace alias');
    const value = this.#config.sourceWorkspaces?.workspaces[workspace];
    if (!value) throw fail('SOURCE_WORKSPACE_NOT_CONFIGURED', 'Choose an original source workspace from merchant_source_workspaces.');
    return value;
  }
  async #connection(definition) {
    let raw;
    try {
      raw = definition.consoleUrlFile
        ? new TextDecoder('utf-8', { fatal: true }).decode(await bytes(definition.consoleUrlFile, 4096, true)).trim()
        : process.env[definition.consoleUrlEnv];
    } catch {
      throw fail('SOURCE_CONSOLE_UNAVAILABLE', 'Start or reconnect the original source console using its declared private connection file.');
    }
    let url; try { url = new URL(raw); } catch {}
    if (!url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port || 80) < 1 || url.username || url.password ||
        url.pathname !== '/' || url.search || !/^#[A-Za-z0-9_-]{32,256}$/.test(url.hash))
      throw fail('SOURCE_CONSOLE_CONNECTION_INVALID', 'Use the exact private URL printed by the running original source console.');
    return { origin: url.origin, token: url.hash.slice(1) };
  }
  async #request(definition, route, { body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}, consume) {
    const connection = await this.#connection(definition);
    let response;
    try {
      response = await originalConsoleResponse(connection.origin + route, { method,
        signal: AbortSignal.timeout(extendedIatiRoute(route) ? 900000 : 240000),
        headers: { Authorization: 'Bearer ' + connection.token, ...headers }, body });
      if (!response.ok) {
        let detail = {}; try { detail = JSON.parse((await responseBytes(response, 65536)).toString('utf8')); } catch {}
        const issue = fail('SOURCE_CONSOLE_REJECTED', typeof detail.error === 'string' ? detail.error.slice(0,2000) : 'Original source console returned HTTP ' + response.status + '.');
        issue.status = response.status; throw issue;
      }
      return await consume(response);
    } catch (error) {
      if (error.code?.startsWith('SOURCE_') || error.code === 'INVALID_PARAMS') throw error;
      if (['ENOSPC','EDQUOT','EROFS','EACCES'].includes(error.code))
        throw fail('SOURCE_STORAGE_UNAVAILABLE', 'Original export storage returned ' + error.code + '. Restore its private directory capacity or access and continue the saved source operation.');
      throw fail('SOURCE_CONSOLE_OPERATION_INTERRUPTED', 'Original console operation interrupted. Read its saved state and retained exports before repeating a change.');
    } finally { response?.body.destroy(); }
  }
  #json(definition, route, body) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const maximum = extendedIatiRoute(route) ? 64 * 1024 * 1024 : MAX_JSON;
    if (payload !== undefined && Buffer.byteLength(payload) > (extendedIatiRoute(route) ? maximum : 131072)) throw fail('INVALID_PARAMS', 'Native JSON request exceeds its complete selection limit.');
    return this.#request(definition, route, { body: payload, headers: payload === undefined ? {} : { 'Content-Type': 'application/json' } },
      async response => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await responseBytes(response, maximum))));
  }
  async #state(definition) {
    const state = await this.#json(definition, '/api/state');
    if (state.schema !== 'stellar-forge.' + definition.format + '-workspace.v1') throw fail('SOURCE_FORMAT_CHANGED', 'Original console does not match this configured source format.');
    return state;
  }
  async #directory(workspace) {
    const root = await privateDirectory(join(this.#config.exportsDirectory, 'source-consoles'));
    return privateDirectory(join(root, workspace));
  }
  async #exportMetadata(workspace, id) {
    checked(id, SHA, 'export SHA256');
    const directory = await this.#directory(workspace);
    const metadata = JSON.parse((await bytes(join(directory, id + '.json'), 65536, true)).toString('utf8'));
    if (metadata.schema !== EXPORT_SCHEMA || metadata.workspace !== workspace || metadata.exportId !== id ||
        !['project','dataset','changes','merchant','portfolio','report','dqa','dqa-file','publishing','refresh','organisation','organisation-file','results','results-report','reconciliation','reconciliation-file'].includes(metadata.kind) ||
        ['portfolio','report','dqa','dqa-file','publishing','refresh','organisation','organisation-file','results','results-report','reconciliation','reconciliation-file'].includes(metadata.kind) && metadata.format !== 'iati' ||
        !Number.isSafeInteger(metadata.bytes) || metadata.bytes < 0 || metadata.bytes > exportLimit(metadata.format, metadata.kind))
      throw fail('SOURCE_EXPORT_INVALID', 'Retained export metadata changed.');
    return { directory, metadata };
  }
  async #exports(workspace) {
    const directory = await this.#directory(workspace), results = [];
    for (const name of await readdir(directory)) {
      if (/^[0-9a-f]{64}\.json$/.test(name)) results.push((await this.#exportMetadata(workspace, name.slice(0,64))).metadata);
    }
    return results.sort((a,b) => b.created.localeCompare(a.created) || a.exportId.localeCompare(b.exportId));
  }
  async #retain(workspace, definition, route, kind, selection, body, fileInfo) {
    const directory = await this.#directory(workspace);
    return this.#request(definition, route, { body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' } }, async response => {
      let nativeSha256, nativeBytes;
      if (fileInfo?.verifyNativeDescriptor) {
        nativeSha256 = response.headers.get('x-content-sha256');
        const length = response.headers.get('content-length');
        if (!nativeSha256 || !SHA.test(nativeSha256) || !/^(0|[1-9][0-9]*)$/.test(length ?? '') ||
            !Number.isSafeInteger(Number(length)) || Number(length) > exportLimit(definition.format, kind))
          throw fail('SOURCE_EXPORT_DESCRIPTOR_REQUIRED', 'Original organisation export must declare its complete SHA256 and byte count.');
        nativeBytes = Number(length);
      }
      const temporary = join(directory, '.partial-' + randomUUID()), handle = await open(temporary, 'wx', 0o600);
      const digest = createHash('sha256'); let length = 0;
      try {
        for await (const chunk of response.body ?? []) {
          length += chunk.length;
          if (length > exportLimit(definition.format, kind)) throw fail('SOURCE_EXPORT_TOO_LARGE', 'Original export exceeds its declared complete delivery limit.');
          digest.update(chunk); await handle.writeFile(chunk);
        }
        const exportId = digest.digest('hex');
        if (fileInfo?.verifyNativeDescriptor && (length !== nativeBytes || exportId !== nativeSha256))
          throw fail('SOURCE_EXPORT_CHANGED', 'Original organisation bytes differ from their native complete-file descriptor.');
        await handle.sync();
        const destination = join(directory, exportId + '.data');
        await link(temporary, destination).catch(error => { if (error.code !== 'EEXIST') throw error; });
        const name = fileInfo?.name ?? definition.format + '-' + kind + (kind === 'changes' ? '.jsonl' : kind === 'dqa-file' ? '.json' : '.zip');
        const metadata = { schema: EXPORT_SCHEMA, workspace, format: definition.format, exportId, kind, ...selection,
          name, bytes: length, sha256: exportId, contentType: fileInfo?.contentType ?? (kind === 'changes' ? 'application/x-ndjson' : kind === 'dqa-file' ? (response.headers.get('content-type') || 'application/json') : 'application/zip'), created: new Date().toISOString() };
        const recordPath = join(directory, '.record-' + randomUUID());
        let record;
        try {
          record = await open(recordPath, 'wx', 0o600);
          await record.writeFile(JSON.stringify(metadata, null, 2) + '\n'); await record.sync();
          await link(recordPath, join(directory, exportId + '.json')).catch(error => { if (error.code !== 'EEXIST') throw error; });
        } finally { await record?.close(); await unlink(recordPath).catch(() => {}); }
        return (await this.#exportMetadata(workspace, exportId)).metadata;
      } finally { await handle.close(); await unlink(temporary).catch(() => {}); }
    });
  }
  async #upload(definition, file, route) {
    const packet = packetRoute(route);
    const { handle, info } = await fileHandle(file.path, packet ? (definition.format === 'iati' ? MAX_IATI_PACKET : 2 * MAX_SOURCE) : MAX_SOURCE);
    let stream;
    try {
      if (file.sha256) {
        const digest = createHash('sha256');
        for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) digest.update(chunk);
        if (digest.digest('hex') !== file.sha256) throw fail('SOURCE_FILE_CHANGED', 'Configured source file differs from its selected SHA256.');
      }
      stream = handle.createReadStream({ autoClose: false, start: 0 });
      const prefix = 'X-' + definition.format.toUpperCase() + '-';
      const result = await this.#request(definition, route, { body: stream, headers: {
        'Content-Length': String(info.size), 'Content-Type': packet ? 'application/zip' : 'application/octet-stream',
        ...(file.name ? { [prefix + 'Name']: encodeURIComponent(file.name) } : {}),
        ...(file.label ? { [prefix + 'Label']: encodeURIComponent(file.label) } : {}) } },
        async response => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await responseBytes(response,
          packet && definition.format === 'iati' ? 64 * 1024 * 1024 : MAX_JSON))));
      const after = await handle.stat();
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs)
        throw fail('SOURCE_FILE_CHANGED', 'Source changed during intake. Inspect the original saved source before continuing.');
      return result;
    } finally { stream?.destroy(); await handle.close(); }
  }
  async #receivePackage(workspace, definition, input, route, kinds) {
    if ((input.file === undefined) === (input.exportId === undefined))
      throw fail('INVALID_PARAMS', 'Choose exactly one configured packet file or retained project export.');
    let file;
    if (input.file !== undefined) {
      if (input.fromWorkspace !== undefined) throw fail('INVALID_PARAMS', 'fromWorkspace selects an existing retained export.');
      file = definition.files[checked(input.file, ALIAS, 'packet file handle')];
      if (!file || file.kind !== 'packet') throw fail('INVALID_PARAMS', 'Choose a configured original project-packet handle.');
    } else {
      const owner = input.fromWorkspace ?? workspace; this.#definition(owner);
      const { directory, metadata } = await this.#exportMetadata(owner, input.exportId);
      if (!kinds.includes(metadata.kind) || metadata.format !== definition.format)
        throw fail('INVALID_PARAMS', 'Choose a complete native packet matching this receiving operation and its original source format.');
      file = { path: join(directory, input.exportId + '.data'), sha256: input.exportId };
    }
    return this.#upload(definition, file, route);
  }
  async #execute(name, args) {
    if (name === 'merchant_source_workspaces') return this.summary;
    const { workspace, ...input } = args, definition = this.#definition(workspace);
    for (const field of ['source','plan','build','before','after','comparison','exportId','portfolio','assessment','case','participant','run','project','projection','indicator'])
      if (input[field] !== undefined && !(name === 'merchant_source_iati_reconciliation_compare' && ['before', 'after'].includes(field)))
        checked(input[field], SHA, field + ' SHA256');
    const result = native => ({ workspace, native });
    if (name.startsWith('merchant_source_iati_') && definition.format !== 'iati')
      throw fail('SOURCE_FORMAT_REQUIRED', 'Select an original IATI console for its portfolio operation.');
    if (name.startsWith(IATI_ORGANISATION_TOOL_PREFIX)) return executeIatiOrganisation(name, input, {
      workspace, page: paged,
      json: (route, body) => this.#json(definition, route, body),
      retain: (route, kind, selected, fileInfo) => this.#retain(workspace, definition, route, kind, selected, undefined, fileInfo),
      receive: (selected, route, kinds) => this.#receivePackage(workspace, definition, selected, route, kinds)
    });
    if (isOrganisationReconciliationTool(name)) return executeOrganisationReconciliation(name, input, {
      workspace, page: paged,
      json: (route, body) => this.#json(definition, route, body),
      retain: (route, kind, selected, fileInfo) => this.#retain(workspace, definition, route, kind, selected, undefined, fileInfo),
      receive: (selected, route, kinds) => this.#receivePackage(workspace, definition, selected, route, kinds)
    });
    switch (name) {
      case 'merchant_source_status': {
        const state = await this.#state(definition);
        return { workspace, schema: state.schema, counts: Object.fromEntries(['sources','plans','builds','comparisons', ...(definition.format === 'iati' ? ['portfolios'] : [])].map(key => [key,state[key].length])),
          ownership: 'EXISTING_SOURCE_CONSOLE', retainedExports: (await this.#exports(workspace)).length, fileReads: this.#reads.status(workspace) };
      }
      case 'merchant_source_inventory': {
        if (!['sources','plans','builds','comparisons', ...(definition.format === 'iati' ? ['portfolios'] : [])].includes(input.kind)) throw fail('INVALID_PARAMS', 'Select a saved source inventory kind.');
        return result({ kind: input.kind, ...paged((await this.#state(definition))[input.kind], input) });
      }
      case 'merchant_source_inspect': return result(await this.#json(definition, '/api/source?id=' + input.source));
      case 'merchant_source_plan': return result(await this.#json(definition, '/api/plan?id=' + input.plan));
      case 'merchant_source_plan_save':
        if (!plain(input.definition)) throw fail('INVALID_PARAMS', 'Supply the complete native mapping definition.');
        return result(await this.#json(definition, '/api/plan', input.definition));
      case 'merchant_source_build': return result(await this.#json(definition, '/api/build', { source: input.source, plan: input.plan }));
      case 'merchant_source_query':
        if (input.query !== undefined && (!plain(input.query) || Object.values(input.query).some(value => typeof value !== 'string')))
          throw fail('INVALID_PARAMS', 'Native query parameters must be scalar strings.');
        return result(await this.#json(definition, '/api/query', { build: input.build, query: input.query ?? {} }));
      case 'merchant_source_compare': return result(await this.#json(definition, '/api/compare', { before: input.before, after: input.after }));
      case 'merchant_source_changes': return result(await this.#json(definition, '/api/changes?id=' + input.comparison + '&offset=' +
        integer(input.offset ?? 0,0,Number.MAX_SAFE_INTEGER) + '&limit=' + integer(input.limit ?? 50,1,250)));
      case 'merchant_source_ingest': {
        const file = definition.files[checked(input.file, ALIAS, 'source file handle')];
        if (!file || file.kind !== 'source') throw fail('INVALID_PARAMS', 'Choose a configured original source file handle.');
        return result(await this.#upload(definition, file, '/api/source'));
      }
      case 'merchant_source_ingest_text': {
        if (typeof input.text !== 'string' || !input.text.length || Buffer.byteLength(input.text) > 131072)
          throw fail('INVALID_PARAMS', 'Use up to 128 KiB of complete source text, or a configured file handle.');
        const prefix = 'X-' + definition.format.toUpperCase() + '-';
        return result(await this.#request(definition, '/api/source', { body: Buffer.from(input.text), headers: {
          'Content-Type': 'application/octet-stream', 'Content-Length': String(Buffer.byteLength(input.text)),
          [prefix + 'Name']: encodeURIComponent(text(input.name ?? 'source.' + definition.format, 'Source name')),
          [prefix + 'Label']: encodeURIComponent(text(input.label ?? definition.label, 'Source label')) } },
          async response => JSON.parse((await responseBytes(response, MAX_JSON)).toString('utf8'))));
      }
      case 'merchant_source_export': {
        if (!['project','dataset','changes','portfolio','report'].includes(input.kind))
          throw fail('INVALID_PARAMS', 'Choose a complete native export kind.');
        if (['portfolio','report'].includes(input.kind)) {
          if (definition.format !== 'iati' || !input.portfolio || input.build !== undefined || input.comparison !== undefined)
            throw fail('INVALID_PARAMS', 'IATI portfolio/report export selects only its original portfolio and optional revision.');
          const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
          return this.#retain(workspace, definition,
            (input.kind === 'portfolio' ? '/api/iati/export' : '/api/iati/report/export') + '?portfolio=' + input.portfolio + revision,
            input.kind, { portfolio: input.portfolio, ...(input.revision === undefined ? {} : { revision: input.revision }) });
        }
        if (input.portfolio !== undefined || input.revision !== undefined)
          throw fail('INVALID_PARAMS', 'Native build and comparison exports already select immutable editions.');
        if (input.kind === 'changes') {
          if (!input.comparison || input.build !== undefined) throw fail('INVALID_PARAMS', 'Changes export requires only its original comparison.');
          return this.#retain(workspace, definition, '/api/changes/download?id=' + input.comparison, input.kind, { comparison: input.comparison });
        }
        if (!input.build || input.comparison !== undefined) throw fail('INVALID_PARAMS', 'Project or dataset export requires only its original build.');
        return this.#retain(workspace, definition, (input.kind === 'project' ? '/api/export' : '/api/dataset-export') + '?build=' + input.build, input.kind, { build: input.build });
      }
      case 'merchant_source_merchant_prepare':
        if (definition.format !== 'ndjson' || !plain(input.payment) || typeof input.origin !== 'string' || typeof input.path !== 'string' ||
            Buffer.byteLength(JSON.stringify(input)) > 131072) throw fail('INVALID_PARAMS', 'Supply an NDJSON build and its complete original public merchant terms.');
        return this.#retain(workspace, definition, '/api/merchant', 'merchant', { build: input.build }, input);
      case 'merchant_source_exports': return result(paged(await this.#exports(workspace), input));
      case 'merchant_source_file_read': {
        if (input.readId !== undefined) checked(input.readId, UUID, 'original file read');
        const { directory, metadata } = await this.#exportMetadata(workspace, input.exportId);
        return { workspace, exportId: input.exportId, ...await this.#reads.read({ scope: workspace, key: input.exportId,
          kind: 'source-' + metadata.kind, directory, readId: input.readId, expectedSha256: input.exportId, offset: input.offset, limit: input.limit,
          load: async () => {
            const { handle: readonlyFileHandle, info } = await fileHandle(join(directory, input.exportId + '.data'), exportLimit(metadata.format, metadata.kind), true);
            if (info.size !== metadata.bytes) { await readonlyFileHandle.close(); throw fail('SOURCE_EXPORT_CHANGED', 'Retained export byte count changed.'); }
            return { readonlyFileHandle, bytes: metadata.bytes, sha256: metadata.sha256, name: metadata.name, type: metadata.contentType };
          } }) };
      }
      case 'merchant_source_file_release':
        await this.#reads.release(workspace, checked(input.readId, UUID, 'original file read'));
        return { workspace, readId: input.readId, state: 'RELEASED' };
      case 'merchant_source_import':
        return result(await this.#receivePackage(workspace, definition, input, '/api/import', ['project','portfolio','dqa','publishing','refresh','organisation','results','reconciliation']));
      case 'merchant_source_iati_presets': return result(await this.#json(definition, '/api/iati/presets'));
      case 'merchant_source_iati_profile': return result(await this.#json(definition, '/api/iati/profile?source=' + input.source));
      case 'merchant_source_iati_portfolios':
        return result(paged((await this.#json(definition, '/api/iati/portfolios')).portfolios, input));
      case 'merchant_source_iati_history':
        return result(paged((await this.#json(definition, '/api/iati/history?portfolio=' + input.portfolio)).history, input));
      case 'merchant_source_iati_portfolio':
      case 'merchant_source_iati_report': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return result(await this.#json(definition,
          (name === 'merchant_source_iati_portfolio' ? '/api/iati/portfolio?id=' : '/api/iati/report?portfolio=') +
          input.portfolio + revision));
      }
      case 'merchant_source_iati_portfolio_save':
      case 'merchant_source_iati_compare':
        if (!plain(input.definition)) throw fail('INVALID_PARAMS', 'Supply the complete original IATI request definition.');
        return result(await this.#json(definition,
          name === 'merchant_source_iati_portfolio_save' ? '/api/iati/portfolio' : '/api/iati/compare', input.definition));

      case 'merchant_source_iati_dqa_providers':
      case 'merchant_source_iati_dqa_assessments':
      case 'merchant_source_iati_dqa_cases': {
        const family = name.slice('merchant_source_iati_dqa_'.length);
        return result(paged((await this.#json(definition, '/api/iati/dqa/' + family))[family], input));
      }
      case 'merchant_source_iati_dqa_provider':
      case 'merchant_source_iati_dqa_capture':
      case 'merchant_source_iati_dqa_save_case': {
        if (!plain(input.definition)) throw fail('INVALID_PARAMS', 'Supply the complete original DQA request with its retained requestId.');
        const route = { merchant_source_iati_dqa_provider: 'provider', merchant_source_iati_dqa_capture: 'capture',
          merchant_source_iati_dqa_save_case: 'case' }[name];
        return result(await this.#json(definition, '/api/iati/dqa/' + route, input.definition));
      }
      case 'merchant_source_iati_dqa_assessment':
        return result(await this.#json(definition, '/api/iati/dqa/assessment?id=' + input.assessment));
      case 'merchant_source_iati_dqa_case': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return result(await this.#json(definition, '/api/iati/dqa/case?id=' + input.case + revision));
      }
      case 'merchant_source_iati_dqa_history':
        return result(paged((await this.#json(definition, '/api/iati/dqa/history?case=' + input.case)).history, input));
      case 'merchant_source_iati_dqa_findings': {
        if (input.status !== undefined && !['', 'pass', 'fail', 'not_applicable'].includes(input.status) ||
            input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 1000))
          throw fail('INVALID_PARAMS', 'Choose a native finding status and complete activity or rule search.');
        const query = new URLSearchParams({ id: input.assessment, offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
          limit: integer(input.limit ?? 50, 1, 250), status: input.status ?? '', search: input.search ?? '' });
        return result(await this.#json(definition, '/api/iati/dqa/findings?' + query));
      }
      case 'merchant_source_iati_dqa_compare':
        return result(await this.#json(definition, '/api/iati/dqa/compare', { before: input.before, after: input.after }));
      case 'merchant_source_iati_dqa_comparison':
      case 'merchant_source_iati_dqa_operations': {
        const query = new URLSearchParams({ offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
          limit: integer(input.limit ?? 50, 1, 250) });
        const route = name.endsWith('_comparison') ? 'comparison' : 'operations';
        if (route === 'comparison') query.set('id', input.comparison);
        return result(await this.#json(definition, '/api/iati/dqa/' + route + '?' + query));
      }
      case 'merchant_source_iati_dqa_export': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return this.#retain(workspace, definition, '/api/iati/dqa/export?case=' + input.case + revision,
          'dqa', { case: input.case, ...(input.revision === undefined ? {} : { revision: input.revision }) });
      }
      case 'merchant_source_iati_dqa_file': {
        if (!['response', 'request', 'configuration-before', 'configuration-after'].includes(input.kind))
          throw fail('INVALID_PARAMS', 'Select the complete original DQA response, request or configuration observation.');
        const retained = await this.#retain(workspace, definition, '/api/iati/dqa/file?' +
          new URLSearchParams({ assessment: input.assessment, kind: input.kind }), 'dqa-file',
          { assessment: input.assessment, fileKind: input.kind });
        // One original file can be selected by several assessments. Its SHA owns
        // the bytes; this response owns the current assessment/kind selection.
        return { ...retained, assessment: input.assessment, fileKind: input.kind };
      }

      case 'merchant_source_iati_publishing_context':
      case 'merchant_source_iati_publishing_methodology': {
        const route = name.endsWith('_context') ? 'context' : 'methodology';
        return result(await this.#json(definition, '/api/iati/publishing/' + route));
      }
      case 'merchant_source_iati_publishing_projects':
        return result(paged((await this.#json(definition, '/api/iati/publishing/projects')).projects, input));
      case 'merchant_source_iati_publishing_project': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return result(await this.#json(definition, '/api/iati/publishing/project?id=' + input.participant + revision));
      }
      case 'merchant_source_iati_publishing_history': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return result(paged((await this.#json(definition, '/api/iati/publishing/history?id=' + input.participant + revision)).history, input));
      }
      case 'merchant_source_iati_publishing_request':
        checked(input.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/, 'original participant request ID');
        return result(await this.#json(definition, '/api/iati/publishing/request?' + new URLSearchParams({ requestId: input.requestId })));
      case 'merchant_source_iati_publishing_activities': {
        const query = new URLSearchParams({ id: input.participant, offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
          limit: integer(input.limit ?? 50, 1, 200) });
        if (input.revision !== undefined) query.set('revision', integer(input.revision, 1, Number.MAX_SAFE_INTEGER));
        return result(await this.#json(definition, '/api/iati/publishing/activities?' + query));
      }
      case 'merchant_source_iati_publishing_fields': {
        text(input.activity, 'Original activity identifier', 1000);
        const query = new URLSearchParams({ id: input.participant, activity: input.activity });
        if (input.revision !== undefined) query.set('revision', integer(input.revision, 1, Number.MAX_SAFE_INTEGER));
        return result(await this.#json(definition, '/api/iati/publishing/fields?' + query));
      }
      case 'merchant_source_iati_publishing_preview':
        if (!plain(input.definition)) throw fail('INVALID_PARAMS', 'Supply the exact selected participant revision and full proposed corrections.');
        return result(await this.#json(definition, '/api/iati/publishing/preview', input.definition));
      case 'merchant_source_iati_publishing_save':
        if (!['create','feedback','evidence','triage','correct','candidate','finance','review','release'].includes(input.action) || !plain(input.definition))
          throw fail('INVALID_PARAMS', 'Choose an original participant action and its full requestId/actor/revision definition.');
        return result(await this.#json(definition, '/api/iati/publishing/' + input.action, input.definition));
      case 'merchant_source_iati_publishing_file': {
        if (!['feedback','evidence'].includes(input.action) || !plain(input.definition) || Object.hasOwn(input.definition, 'fileBase64'))
          throw fail('INVALID_PARAMS', 'Choose feedback or evidence with its complete original definition; the declared file supplies all bytes.');
        const selected = definition.files[checked(input.file, ALIAS, 'participant file handle')];
        if (!selected || selected.kind !== 'source') throw fail('INVALID_PARAMS', 'Choose one configured original source-file handle.');
        const raw = await bytes(selected.path, 16 * 1024 * 1024);
        if (selected.sha256 && hash(raw) !== selected.sha256) throw fail('SOURCE_FILE_CHANGED', 'Participant file differs from its selected original SHA256.');
        return result(await this.#json(definition, '/api/iati/publishing/' + input.action,
          { ...input.definition, filename: input.definition.filename ?? selected.name ?? input.file, fileBase64: raw.toString('base64') }));
      }
      case 'merchant_source_iati_publishing_export': {
        const revision = input.revision === undefined ? '' : '&revision=' + integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
        return this.#retain(workspace, definition, '/api/iati/publishing/export?id=' + input.participant + revision,
          'publishing', { participant: input.participant, ...(input.revision === undefined ? {} : { revision: input.revision }) });
      }

      case 'merchant_source_iati_refresh_context':
        return result(await this.#json(definition, '/api/iati/refresh/context'));
      case 'merchant_source_iati_refresh_status':
        return result(await this.#json(definition, '/api/iati/refresh/status?plan=' + input.plan));
      case 'merchant_source_iati_refresh_plans':
      case 'merchant_source_iati_refresh_history':
      case 'merchant_source_iati_refresh_runs':
      case 'merchant_source_iati_refresh_run_history': {
        const route = name.slice('merchant_source_iati_refresh_'.length).replaceAll('_', '-');
        const query = new URLSearchParams({ offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
          limit: integer(input.limit ?? 50, 1, 250) });
        if (input.plan !== undefined) query.set('plan', input.plan);
        if (input.run !== undefined) query.set('id', input.run);
        if (input.expectedSnapshot !== undefined) query.set('snapshot', checked(input.expectedSnapshot, SHA, 'refresh inventory snapshot'));
        return result(await this.#json(definition, '/api/iati/refresh/' + route + '?' + query));
      }
      case 'merchant_source_iati_refresh_plan':
      case 'merchant_source_iati_refresh_run': {
        const run = name.endsWith('_run');
        const query = new URLSearchParams(run ? { plan: input.plan, id: input.run } : { id: input.plan });
        if (input.revision !== undefined) query.set('revision', integer(input.revision, 1, Number.MAX_SAFE_INTEGER));
        return result(await this.#json(definition, '/api/iati/refresh/' + (run ? 'run' : 'plan') + '?' + query));
      }
      case 'merchant_source_iati_refresh_request':
        checked(input.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/, 'original refresh request ID');
        return result(await this.#json(definition, '/api/iati/refresh/request?' + new URLSearchParams({ requestId: input.requestId })));
      case 'merchant_source_iati_refresh_preview':
        if (!plain(input.definition)) throw fail('INVALID_PARAMS', 'Supply the full saved plan, source pairs, selections and current native revisions.');
        return result(await this.#json(definition, '/api/iati/refresh/preview', input.definition));
      case 'merchant_source_iati_refresh_save':
        if (!['plan-save','start','review','promote','cancel','abandon'].includes(input.action) || !plain(input.definition))
          throw fail('INVALID_PARAMS', 'Choose an original refresh action and its complete retained request definition.');
        return result(await this.#json(definition, '/api/iati/refresh/' + input.action, input.definition));
      case 'merchant_source_iati_refresh_resume':
        checked(input.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/, 'original refresh request ID');
        return result(await this.#json(definition, '/api/iati/refresh/resume', { requestId: input.requestId }));
      case 'merchant_source_iati_refresh_export': {
        const query = new URLSearchParams({ plan: input.plan });
        if (input.expectedSnapshot !== undefined) query.set('snapshot', checked(input.expectedSnapshot, SHA, 'whole refresh journal snapshot'));
        return this.#retain(workspace, definition, '/api/iati/refresh/export?' + query,
          'refresh', { plan: input.plan, ...(input.expectedSnapshot === undefined ? {} : { snapshot: input.expectedSnapshot }) });
      }

      case 'merchant_source_iati_results_inventory': {
        if (!['projects','projections','receipts'].includes(input.kind)) throw fail('INVALID_PARAMS','Choose an original results inventory.');
        const state = await this.#json(definition, '/api/iati/results');
        return result({workspaceId:state.workspaceId,analysisContract:state.analysisContract,kind:input.kind,...paged(state[input.kind],input)});
      }
      case 'merchant_source_iati_results_source':
        return result(await this.#json(definition, '/api/iati/results/source', {source:input.source}));
      case 'merchant_source_iati_results_indicators': {
        if (input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 256) ||
            input.measure !== undefined && (typeof input.measure !== 'string' || input.measure.length > 64))
          throw fail('INVALID_PARAMS','Use bounded original indicator search and measure text.');
        const query = new URLSearchParams({projection:input.projection,offset:integer(input.offset ?? 0,0,Number.MAX_SAFE_INTEGER),
          limit:integer(input.limit ?? 50,1,100),search:input.search ?? '',measure:input.measure ?? ''});
        return result(await this.#json(definition,'/api/iati/results/indicators?'+query));
      }
      case 'merchant_source_iati_results_indicator':
        return result(await this.#json(definition,'/api/iati/results/indicator?'+new URLSearchParams({projection:input.projection,key:input.indicator})));
      case 'merchant_source_iati_results_project':
      case 'merchant_source_iati_results_report': {
        const route = name.endsWith('_project') ? 'project' : 'report';
        const query = new URLSearchParams({id:input.project});
        if(input.revision !== undefined)query.set('revision',integer(input.revision,1,Number.MAX_SAFE_INTEGER));
        return result(await this.#json(definition,'/api/iati/results/'+route+'?'+query));
      }
      case 'merchant_source_iati_results_history': {
        const value=await this.#json(definition,'/api/iati/results/history?'+new URLSearchParams({id:input.project}));
        return result({id:value.id,headRevision:value.headRevision,...paged(value.editions,input)});
      }
      case 'merchant_source_iati_results_comparisons':
        return result(paged((await this.#json(definition,'/api/iati/results/comparisons?'+new URLSearchParams({id:input.project}))).comparisons,input));
      case 'merchant_source_iati_results_request':
        checked(input.requestId,/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/,'original results request ID');
        return result(await this.#json(definition,'/api/iati/results/operation?'+new URLSearchParams({requestId:input.requestId})));
      case 'merchant_source_iati_results_preview':
        if(!plain(input.definition))throw fail('INVALID_PARAMS','Supply the complete original results definition.');
        return result(await this.#json(definition,'/api/iati/results/preview',input.definition));
      case 'merchant_source_iati_results_action':
        if(!['save','compare','adopt','cancel'].includes(input.action)||!plain(input.definition))
          throw fail('INVALID_PARAMS','Select an original results action and its complete request identity.');
        return result(await this.#json(definition,'/api/iati/results/'+input.action,input.definition));
      case 'merchant_source_iati_results_export': {
        if(!['project','report'].includes(input.kind))throw fail('INVALID_PARAMS','Select an editable results project or report-only packet.');
        const query=new URLSearchParams({id:input.project});
        if(input.revision!==undefined)query.set('revision',integer(input.revision,1,Number.MAX_SAFE_INTEGER));
        return this.#retain(workspace,definition,'/api/iati/results/'+(input.kind==='report'?'report/export':'export')+'?'+query,
          input.kind==='report'?'results-report':'results',{project:input.project,...(input.revision===undefined?{}:{revision:input.revision})});
      }
      default: throw fail('TOOL_NOT_FOUND', 'Unknown original source-workspace operation.');
    }
  }
  async call(name, args = {}) {
    if (this.#closing) throw fail('SOURCE_WORKSPACE_CLOSING', 'Source-workspace access is closing.');
    const definition = definitions.get(name);
    if (!definition) throw fail('TOOL_NOT_FOUND', 'Unknown original source-workspace operation.');
    exact(args, Object.keys(definition.properties), definition.required);
    const pending = Promise.resolve().then(() => this.#execute(name, args)); this.#pending.add(pending);
    try { return await pending; } finally { this.#pending.delete(pending); }
  }
  close() {
    if (!this.#close) {
      this.#closing = true;
      this.#close = (async () => { await Promise.allSettled([...this.#pending]); await this.#reads.close(); })();
    }
    return this.#close;
  }
}

