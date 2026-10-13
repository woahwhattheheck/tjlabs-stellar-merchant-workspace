// MIT. CanadaBuys customer operations over the original merchant MCP transport.
import { definitions } from './catalog/canadabuys-workspace.mjs';
import { openMerchantFileClient } from './retained-download.mjs';
import { MAX_RETAINED_CHUNK_BYTES } from './retained-file-contracts.mjs';

export const CANADABUYS_MCP_CLIENT_SCHEMA = 'stellar-forge.canadabuys-mcp-client.v1';
export const CANADABUYS_TOOL_PREFIX = 'merchant_canadabuys_';
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const byName = new Map(definitions.map(value => [value[0], value]));
const copy = value => structuredClone(value);
export const canadaBuysClientError = (code, message, details) =>
  Object.assign(new Error(message), { code: 'CANADABUYS_CLIENT_' + code, ...(details === undefined ? {} : { details }) });
function need(value, message, code = 'ARGUMENTS') { if (!value) throw canadaBuysClientError(code, message); }
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function json(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { need(Number.isFinite(value), label + ' must be finite.'); return; }
  need((Array.isArray(value) || plain(value)) && !seen.has(value), label + ' must be complete acyclic JSON.');
  seen.add(value);
  for (const [key, item] of Object.entries(value)) json(item, label + '.' + key, seen);
  seen.delete(value);
}
function validate(value, schema, label) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  need(types.some(selected => selected === type || selected === 'integer' && Number.isSafeInteger(value)),
    label + ' has the wrong value type.');
  if (schema.enum) need(schema.enum.includes(value), label + ' must use an original declared choice.');
  if (typeof value === 'number') need(Number.isFinite(value)
    && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), label + ' is outside its original bounds.');
  if (typeof value === 'string') need(value.length >= (schema.minLength ?? 0)
    && value.length <= (schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(schema.pattern).test(value)),
    label + ' has an invalid length or format.');
  if (Array.isArray(value)) {
    need(value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity),
      label + ' is outside its original item bounds.');
    if (schema.uniqueItems) need(new Set(value.map(item => JSON.stringify(item))).size === value.length,
      label + ' must not repeat selected items.');
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, label + '[' + index + ']'));
  }
  if (plain(value)) {
    if (schema.properties) {
      for (const key of schema.required ?? []) need(Object.hasOwn(value, key), label + '.' + key + ' is required.');
      for (const [key, item] of Object.entries(value)) {
        if (schema.properties[key]) validate(item, schema.properties[key], label + '.' + key);
        else if (schema.additionalProperties === false) need(false, label + '.' + key + ' is not declared.');
        else if (plain(schema.additionalProperties)) validate(item, schema.additionalProperties, label + '.' + key);
      }
    } else if (plain(schema.additionalProperties)) {
      for (const [key, item] of Object.entries(value)) validate(item, schema.additionalProperties, label + '.' + key);
    }
  }
}
export function canadaBuysToolName(value) {
  need(typeof value === 'string', 'Select an original CanadaBuys tool name.');
  const name = value.startsWith(CANADABUYS_TOOL_PREFIX) ? value : CANADABUYS_TOOL_PREFIX + value;
  need(byName.has(name), 'Select one of the original CanadaBuys tools.', 'TOOL_NOT_FOUND');
  return name;
}
/** Validation uses the maintained provider catalogue; arguments are never inferred from prose. */
export function canadaBuysRequest(tool, args = {}, workspace) {
  const name = canadaBuysToolName(tool), definition = byName.get(name);
  need(plain(args), 'Tool arguments must be an object.'); json(args, 'arguments');
  const selected = copy(args);
  if (name !== CANADABUYS_TOOL_PREFIX + 'workspaces' && workspace !== undefined) {
    need(typeof workspace === 'string' && ALIAS.test(workspace), 'Use the original configured workspace alias.');
    need(selected.workspace === undefined || selected.workspace === workspace,
      'The selected tool belongs to another workspace alias.', 'WORKSPACE_CONFLICT');
    selected.workspace = workspace;
  }
  const properties = definition[2];
  need(Object.keys(selected).every(key => Object.hasOwn(properties, key))
    && definition[3].every(key => Object.hasOwn(selected, key)), 'Supply exactly the original tool fields and required values.');
  for (const [key, value] of Object.entries(selected)) validate(value, properties[key], key);
  return { name, arguments: selected };
}
export function canadaBuysTools() {
  return definitions.map(([name, description, properties, required, behavior]) => ({
    name, description, inputSchema: { type: 'object', properties: copy(properties), required: [...required], additionalProperties: false },
    annotations: { readOnlyHint: behavior?.readOnly === true, idempotentHint: behavior?.idempotent === true,
      openWorldHint: behavior?.openWorld === true },
  }));
}
/** Only original source-backed read/idempotency contracts permit an entered request to resume. */
export function canadaBuysReplayPolicy(tool, args = {}) {
  const request = canadaBuysRequest(tool, args), definition = byName.get(request.name);
  if (definition[4]?.readOnly) return { replayable: true, basis: 'ORIGINAL_READ_ONLY_TOOL' };
  if (request.name === CANADABUYS_TOOL_PREFIX + 'open')
    return { replayable: true, basis: 'ORIGINAL_OPEN_SAME_WORKSPACE' };
  if (['bidder_create', 'bidder_update'].includes(request.name.slice(CANADABUYS_TOOL_PREFIX.length))
      && typeof request.arguments.commandId === 'string' && request.arguments.commandId.trim())
    return { replayable: true, basis: 'ORIGINAL_BIDDER_COMMAND_ID', commandId: request.arguments.commandId };
  if (request.name === CANADABUYS_TOOL_PREFIX + 'bidder_intake')
    return { replayable: true, basis: 'ORIGINAL_INTAKE_COMMAND_AND_INPUT_SHA256',
      commandId: request.arguments.commandId, inputSha256: request.arguments.expectedSha256 };
  if (request.name === CANADABUYS_TOOL_PREFIX + 'capture' && request.arguments.captureId)
    return { replayable: true, basis: 'ORIGINAL_CAPTURE_ID', captureId: request.arguments.captureId };
  return { replayable: false, basis: 'RETAIN_ORIGINAL_OUTCOME_BEFORE_ANOTHER_MUTATION' };
}
function nativeWorkspace(value, expected) {
  need(plain(value) && UUID.test(value.id ?? '') && Number.isSafeInteger(value.revision) && value.revision >= 0,
    'The original response did not identify its native workspace and revision.', 'WORKSPACE_REPLY');
  if (expected !== undefined) need(value.id === expected,
    'This endpoint alias now identifies another native workspace.', 'WORKSPACE_CONFLICT');
  return value;
}
function options(value, lifetime) {
  need(plain(value), 'Request options must be an object.');
  const timeoutMs = value.timeoutMs ?? 120000;
  need(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 1800000,
    'Use a request timeout from 1 to 1800000 milliseconds.');
  const signal = value.signal ? AbortSignal.any([value.signal, lifetime]) : lifetime;
  signal.throwIfAborted(); return { requestSignal: signal, timeoutMs };
}
function pageSelection(value, offset, key) {
  need(plain(value) && plain(value.page) && Array.isArray(value[key]), 'The original tool returned no complete page.', 'PAGE_REPLY');
  const p = value.page;
  need(p.offset === offset && Number.isSafeInteger(p.limit) && p.limit > 0
    && Number.isSafeInteger(p.total) && p.total >= 0 && value[key].length <= p.limit
    && offset <= p.total && offset + value[key].length <= p.total
    && (p.nextOffset === null ? offset + value[key].length === p.total
      : Number.isSafeInteger(p.nextOffset) && p.nextOffset === offset + value[key].length && p.nextOffset > offset && p.nextOffset < p.total),
    'The original page changed its requested offset or did not advance.', 'PAGE_REPLY');
  return value;
}
const PAGE_KEYS = Object.freeze({
  status: 'items', entries: 'items', compare: 'items', qualify: 'items', bidder_list: 'records', bidder_fit: 'items',
});

/** One existing MCP connection. Disconnect drains client requests/read leases; it never stops an application. */
export class CanadaBuysMerchantClient {
  #client; #workspace; #workspaceId; #lifetime = new AbortController();
  #pending = new Set(); #reads = new Set(); #closing = false; #closePromise;
  constructor({ client, workspace, workspaceId } = {}) {
    need(client && typeof client.call === 'function' && typeof client.endpoint === 'string'
      && client.endpoint.trim() && client.endpoint.length <= 4096 && !/[\x00-\x1f\x7f]/.test(client.endpoint),
      'Use the existing merchant MCP client with its actual endpoint.');
    need(typeof workspace === 'string' && ALIAS.test(workspace), 'Select the host-declared original workspace alias.');
    if (workspaceId !== undefined) need(typeof workspaceId === 'string' && UUID.test(workspaceId), 'Use the original native workspace UUID.');
    this.#client = client; this.#workspace = workspace; this.#workspaceId = workspaceId;
  }
  get endpoint() { return this.#client.endpoint; }
  get workspace() { return this.#workspace; }
  get workspaceId() { return this.#workspaceId; }
  get closed() { return this.#closing; }
  get activeFileReads() { return this.#reads.size; }
  async #raw(request, requestOptions) {
    const value = await this.#client.call(request.name, request.arguments, requestOptions);
    need(plain(value), 'The original tool returned no structured object.', 'REPLY');
    if (request.name !== CANADABUYS_TOOL_PREFIX + 'workspaces'
        && !['file_read', 'file_release'].includes(request.name.slice(CANADABUYS_TOOL_PREFIX.length)))
      need(value.workspace === this.#workspace, 'The tool replied for another configured alias.', 'WORKSPACE_CONFLICT');
    if (value.native) {
      nativeWorkspace(value.native, this.#workspaceId); this.#workspaceId ??= value.native.id;
    }
    if (request.name === CANADABUYS_TOOL_PREFIX + 'file_read') {
      if (typeof value.readId === 'string') {
        if (value.nextOffset === null) this.#reads.delete(value.readId);
        else this.#reads.add(value.readId);
      }
    } else if (request.name === CANADABUYS_TOOL_PREFIX + 'file_release') this.#reads.delete(request.arguments.readId);
    return value;
  }
  async #status(requestOptions) {
    const value = await this.#raw(canadaBuysRequest('status', { limit: 1 }, this.#workspace), requestOptions);
    nativeWorkspace(value.native, this.#workspaceId); this.#workspaceId ??= value.native.id;
    return value;
  }
  async call(tool, args = {}, requestOptions = {}) {
    need(!this.#closing, 'This client is disconnecting; retain the original request.', 'CLOSED');
    const request = canadaBuysRequest(tool, args, this.#workspace);
    const selectedOptions = options(requestOptions, this.#lifetime.signal);
    const work = (async () => {
      if (!['workspaces', 'open', 'status', 'file_release'].includes(request.name.slice(CANADABUYS_TOOL_PREFIX.length)))
        await this.#status(selectedOptions);
      return this.#raw(request, selectedOptions);
    })();
    this.#pending.add(work);
    try { return await work; } finally { this.#pending.delete(work); }
  }
  workspaces(options) { return this.call('workspaces', {}, options); }
  open(options) { return this.call('open', {}, options); }
  status(args = {}, options) { return this.call('status', args, options); }
  closeWorkspace(instanceId, options) { return this.call('close', { instanceId }, options); }
  notice(args, options) { return this.call('notice', args, options); }
  entries(args, options) { return this.call('entries', args, options); }
  entry(args, options) { return this.call('entry', args, options); }
  compare(args, options) { return this.call('compare', args, options); }
  source(args, options) { return this.call('source', args, options); }
  inputs(args = {}, options) { return this.call('inputs', args, options); }
  importSource(args, options) { return this.call('import', args, options); }
  capture(args, options) { return this.call('capture', args, options); }
  captureRecord(args, options) { return this.call('capture_record', args, options); }
  review(args, options) { return this.call('review', args, options); }
  workshare(args, options) { return this.call('workshare', args, options); }
  createWorkshare(args, options) { return this.call('workshare_create', args, options); }
  updateWorkshare(args, options) { return this.call('workshare_update', args, options); }
  qualify(args, options) { return this.call('qualify', args, options); }
  inspectEvidenceIntake(args, options) { return this.call('bidder_intake_inspect', args, options); }
  intakeEvidence(args, options) { return this.call('bidder_intake', args, options); }
  bidderStatus(options) { return this.call('bidder_status', {}, options); }
  bidderList(args, options) { return this.call('bidder_list', args, options); }
  bidderRecord(args, options) { return this.call('bidder_record', args, options); }
  bidderCreate(args, options) { return this.call('bidder_create', args, options); }
  bidderUpdate(args, options) { return this.call('bidder_update', args, options); }
  bidderFit(args, options) { return this.call('bidder_fit', args, options); }
  bidderAssess(args, options) { return this.call('bidder_assess', args, options); }
  bidderCompare(args, options) { return this.call('bidder_compare', args, options); }
  receive(args, options) { return this.call('receive', args, options); }
  receiving(args, options) { return this.call('receiving', args, options); }
  export(args, options) { return this.call('export', args, options); }
  files(args, options) { return this.call('files', args, options); }
  fileRead(args, options) { return this.call('file_read', args, options); }
  fileRelease(args, options) { return this.call('file_release', args, options); }
  prepareMerchant(args, options) { return this.call('merchant_prepare', args, options); }
  previewMerchant(args, options) { return this.call('merchant_preview', args, options); }
  startMerchant(args, options) { return this.call('merchant_start', args, options); }
  stopMerchant(args, options) { return this.call('merchant_stop', args, options); }
  adoptDelivery(args, options) { return this.call('delivery_adopt', args, options); }
  /** Each page is original. This iterator never changes a request to hide a short page. */
  async *pages(tool, args = {}, requestOptions = {}) {
    const name = canadaBuysToolName(tool).slice(CANADABUYS_TOOL_PREFIX.length), key = PAGE_KEYS[name];
    need(key, 'Choose one of the original paged operations.');
    let offset = args.offset ?? 0, total;
    for (;;) {
      const value = pageSelection(await this.call(name, { ...args, offset }, requestOptions), offset, key);
      total ??= value.page.total;
      need(value.page.total === total, 'The collection changed during paging; retain the pages and start a new read.', 'PAGE_CHANGED');
      yield value;
      if (value.page.nextOffset === null) return;
      offset = value.page.nextOffset;
    }
  }
  /** A complete read is accepted only while the native workspace revision remains unchanged. */
  async collect(tool, args = {}, requestOptions = {}) {
    need((args.offset ?? 0) === 0, 'Complete collection reads begin at the original first page.');
    const before = await this.status({ limit: 1 }, requestOptions), pages = [], items = [];
    const key = PAGE_KEYS[canadaBuysToolName(tool).slice(CANADABUYS_TOOL_PREFIX.length)];
    for await (const page of this.pages(tool, args, requestOptions)) { pages.push(page); items.push(...page[key]); }
    const after = await this.status({ limit: 1 }, requestOptions);
    need(before.native.id === after.native.id && before.native.revision === after.native.revision,
      'The native workspace advanced while reading; these pages are retained observations, not one complete revision.', 'PAGE_CHANGED');
    return { workspace: this.workspace, workspaceId: this.workspaceId, revision: before.native.revision,
      tool: canadaBuysToolName(tool), complete: true, pages, items };
  }
  async inspectPublication(publicationId, options) {
    const module = await import('./canadabuys-download.mjs');
    return module.inspectCanadaBuysPublication({ client: this, publicationId, signal: options?.signal });
  }
  async downloadPublication(publicationId, directory, options = {}) {
    const module = await import('./canadabuys-download.mjs');
    return module.downloadCanadaBuysPublication({ client: this, publicationId, directory, ...options });
  }
  async disconnect() {
    this.#closing = true;
    this.#lifetime.abort(canadaBuysClientError('CLOSED', 'The client is disconnecting.'));
    if (!this.#closePromise) {
      this.#closePromise = (async () => {
        await Promise.allSettled([...this.#pending]);
        const results = await Promise.allSettled([...this.#reads].map(async readId => {
          await this.#client.call(CANADABUYS_TOOL_PREFIX + 'file_release',
            { workspace: this.#workspace, readId }, { requestSignal: null, timeoutMs: 5000 });
          this.#reads.delete(readId);
        }));
        need(results.every(value => value.status === 'fulfilled'),
          'A retained native file reader has not closed; retry disconnect on this same client.', 'CLOSE_INCOMPLETE');
      })();
      this.#closePromise.catch(() => { this.#closePromise = undefined; });
    }
    return this.#closePromise;
  }
}
export async function openCanadaBuysMerchantClient({ client, workspace, workspaceId, url, tokenEnv,
  environment, signal, maximumResponseBytes = 4 * 1024 * 1024 } = {}) {
  need(client === undefined || url === undefined, 'Select an existing native MCP client or its original URL.');
  const original = client ?? await openMerchantFileClient({ url, tokenEnv, environment, signal,
    maximumResponseBytes, errorPrefix: 'CANADABUYS', clientName: 'starforge-canadabuys-customer' });
  return new CanadaBuysMerchantClient({ client: original, workspace, workspaceId });
}
export { MAX_RETAINED_CHUNK_BYTES };
