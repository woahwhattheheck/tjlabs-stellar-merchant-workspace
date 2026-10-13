// MIT. Invoice customer operations over the original merchant MCP transport.
import { definitions } from './catalog/invoice-settlement-workspace.mjs';
import { openMerchantFileClient } from './retained-download.mjs';
import { MAX_RETAINED_CHUNK_BYTES } from './retained-file-contracts.mjs';

export const INVOICE_MCP_CLIENT_SCHEMA = 'stellar-forge.invoice-settlement-mcp-client.v1';
export const INVOICE_TOOL_PREFIX = 'merchant_invoice_';
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const byName = new Map(definitions.map(value => [value[0], value]));
const copy = value => structuredClone(value);
export const invoiceClientError = (code, message, details) =>
  Object.assign(new Error(message), { code: 'INVOICE_CLIENT_' + code, ...(details === undefined ? {} : { details }) });
function need(value, message, code = 'ARGUMENTS') { if (!value) throw invoiceClientError(code, message); }
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
export function invoiceToolName(value) {
  need(typeof value === 'string', 'Select an original Invoice tool name.');
  const name = value.startsWith(INVOICE_TOOL_PREFIX) ? value : INVOICE_TOOL_PREFIX + value;
  need(byName.has(name), 'Select one of the original Invoice tools.', 'TOOL_NOT_FOUND');
  return name;
}
/** Validation uses the maintained provider catalogue; arguments are never inferred from prose. */
export function invoiceRequest(tool, args = {}, workspace) {
  const name = invoiceToolName(tool), definition = byName.get(name);
  need(plain(args), 'Tool arguments must be an object.'); json(args, 'arguments');
  const selected = copy(args);
  if (name !== INVOICE_TOOL_PREFIX + 'workspaces' && workspace !== undefined) {
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
export function invoiceTools() {
  return definitions.map(([name, description, properties, required, behavior]) => ({
    name, description, inputSchema: { type: 'object', properties: copy(properties), required: [...required], additionalProperties: false },
    annotations: { readOnlyHint: behavior?.readOnly === true, idempotentHint: behavior?.idempotent === true,
      openWorldHint: behavior?.openWorld === true },
  }));
}
/** Only original source-backed read/idempotency contracts permit an entered request to resume. */
export function invoiceReplayPolicy(tool,args={}){
 const request=invoiceRequest(tool,args),definition=byName.get(request.name),short=request.name.slice(INVOICE_TOOL_PREFIX.length);
 if(definition[4]?.readOnly)return {replayable:true,basis:'ORIGINAL_READ_ONLY_TOOL'};
 if(short==='open')return {replayable:true,basis:'ORIGINAL_OPEN_SAME_WORKSPACE'};
 if(short==='export'||short==='import')return {replayable:true,basis:'ORIGINAL_NATIVE_REQUEST_UUID_AND_EXACT_INPUT'};
 const direct=new Set(['workspace.profile','programme.save','source.project','horizon.apply','decision.save','reconciliation.create','report.create']);
 if(short==='change'&&direct.has(request.arguments.method))return {replayable:true,basis:'ORIGINAL_ATOMIC_NATIVE_REQUEST_UUID'};
 return {replayable:false,basis:'EXPLICIT_ORIGINAL_CONTINUATION_REQUIRED'};
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
/** One existing MCP connection. Disconnect drains client requests/read leases; it never stops an application. */
export class InvoiceMerchantClient {
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
    if (request.name !== INVOICE_TOOL_PREFIX + 'workspaces'
        && !['file_read', 'file_release'].includes(request.name.slice(INVOICE_TOOL_PREFIX.length)))
      need(value.workspace === this.#workspace, 'The tool replied for another configured alias.', 'WORKSPACE_CONFLICT');
    if (value.native) {
      nativeWorkspace(value.native, this.#workspaceId); this.#workspaceId ??= value.native.id;
    }
    if (request.name === INVOICE_TOOL_PREFIX + 'file_read') {
      if (typeof value.readId === 'string') {
        if (value.nextOffset === null) this.#reads.delete(value.readId);
        else this.#reads.add(value.readId);
      }
    } else if (request.name === INVOICE_TOOL_PREFIX + 'file_release') this.#reads.delete(request.arguments.readId);
    return value;
  }
  async #status(requestOptions) {
    const value = await this.#raw(invoiceRequest('status', {}, this.#workspace), requestOptions);
    nativeWorkspace(value.native, this.#workspaceId); this.#workspaceId ??= value.native.id;
    return value;
  }
  async call(tool, args = {}, requestOptions = {}) {
    need(!this.#closing, 'This client is disconnecting; retain the original request.', 'CLOSED');
    const request = invoiceRequest(tool, args, this.#workspace);
    const selectedOptions = options(requestOptions, this.#lifetime.signal);
    const work = (async () => {
      if (!['workspaces', 'open', 'status', 'file_release'].includes(request.name.slice(INVOICE_TOOL_PREFIX.length)))
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
  methods(options){return this.call('methods',{},options);}
  read(method,args={},options){return this.call('read',{method,args},options);}
  change(method,args,options){return this.call('change',{method,args},options);}
  inputs(args={},options){return this.call('inputs',args,options);}
  importSource(args,options){return this.call('import',args,options);}
  export(args,options){return this.call('export',args,options);}
  files(args,options){return this.call('files',args,options);}
  fileRead(args,options){return this.call('file_read',args,options);}
  fileRelease(args,options){return this.call('file_release',args,options);}
  async history({limit=100}={},options={}){
    const before=await this.status({},options),pages=[],records=[];let offset=0;
    for(;;){
      const response=await this.read('workspace.history',{offset,limit},options),p=response.value;
      need(p.workspaceId===this.workspaceId&&p.revision===before.native.revision&&p.offset===offset
       &&Array.isArray(p.records)&&p.records.length<=limit&&Number.isSafeInteger(p.total)&&p.total>=0
       &&(p.nextOffset===null?offset+p.records.length===p.total:p.nextOffset===offset+p.records.length&&p.nextOffset>offset),
       'The original complete history changed its selected revision or page.','PAGE_REPLY');
      pages.push(response);records.push(...p.records);if(p.nextOffset===null)break;offset=p.nextOffset;
    }
    const after=await this.status({},options);
    need(after.native.id===before.native.id&&after.native.revision===before.native.revision,'The original workspace advanced while reading its history.','PAGE_CHANGED');
    return {workspace:this.workspace,workspaceId:this.workspaceId,revision:before.native.revision,complete:true,records,pages};
  }
  async inspectPublication(publicationId, options) {
    const module = await import('./invoice-settlement-download.mjs');
    return module.inspectInvoicePublication({ client: this, publicationId, signal: options?.signal });
  }
  async downloadPublication(publicationId, directory, options = {}) {
    const module = await import('./invoice-settlement-download.mjs');
    return module.downloadInvoicePublication({ client: this, publicationId, directory, ...options });
  }
  async disconnect() {
    this.#closing = true;
    this.#lifetime.abort(invoiceClientError('CLOSED', 'The client is disconnecting.'));
    if (!this.#closePromise) {
      this.#closePromise = (async () => {
        await Promise.allSettled([...this.#pending]);
        const results = await Promise.allSettled([...this.#reads].map(async readId => {
          await this.#client.call(INVOICE_TOOL_PREFIX + 'file_release',
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
export async function openInvoiceMerchantClient({ client, workspace, workspaceId, url, tokenEnv,
  environment, signal, maximumResponseBytes = 4 * 1024 * 1024 } = {}) {
  need(client === undefined || url === undefined, 'Select an existing native MCP client or its original URL.');
  const original = client ?? await openMerchantFileClient({ url, tokenEnv, environment, signal,
    maximumResponseBytes, errorPrefix: 'INVOICE', clientName: 'starforge-invoice-settlement-customer' });
  return new InvoiceMerchantClient({ client: original, workspace, workspaceId });
}
export { MAX_RETAINED_CHUNK_BYTES };
