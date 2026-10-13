import { geoapifyWorkspaceTools, publisherActions } from './catalog/geoapify-workspace.mjs';
export { geoapifyWorkspaceTools } from './catalog/geoapify-workspace.mjs';
// MIT. Agent and browser operation of the original address review workspace and publisher.
import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { exact, failure, identifier, line, plain, privateSupportDirectory, fileBytes } from './config.mjs';
import { RetainedFileReads, MAX_RETAINED_CHUNK_BYTES } from './retained-file-reads.mjs';

export const GEOAPIFY_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.geoapify-workspace-connection.v1';







function hostPath(value, base) {
  if (typeof value !== 'string' || !value || value.length>4096 || /[\x00-\x1f\x7f]/.test(value))
    throw failure('CONFIGURATION_ERROR', 'Geoapify host paths belong in the private connection file.');
  return resolve(base, value);
}
function count(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw failure('INVALID_PARAMS', label + ' must be an integer from ' + minimum + ' to ' + maximum + '.');
  return value;
}
async function connectionJSON(path) {
  if (await realpath(path) !== resolve(path)) throw failure('CONFIGURATION_ERROR', 'Use the canonical private connection file.');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024 || process.platform !== 'win32' &&
        ((info.mode & 0o077) || process.getuid && info.uid !== process.getuid()))
      throw failure('CONFIGURATION_ERROR', 'Use an owned private Geoapify connection JSON file, at most one MiB.');
    const bytes = await file.readFile();
    if (bytes.length > 1024 * 1024) throw failure('CONFIGURATION_ERROR', 'The connection file exceeds one MiB.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await file.close(); }
}
function entries(value, label) {
  if (value === undefined) return [];
  if (!plain(value) || Object.keys(value).length > 32)
    throw failure('CONFIGURATION_ERROR', 'Use up to 32 named ' + label + '.');
  return Object.entries(value).map(([name, entry]) => [identifier(name, label + ' alias'), entry]);
}
function runtime(raw = {}) {
  exact(raw, ['port', 'facilitator', 'allowLocalFacilitator']);
  count(raw.port ?? 0, 'Seller port', 0, 65535);
  if (raw.allowLocalFacilitator !== undefined && typeof raw.allowLocalFacilitator !== 'boolean')
    throw failure('CONFIGURATION_ERROR', 'allowLocalFacilitator must be a Boolean.');
  if (raw.facilitator !== undefined) {
    const url = new URL(raw.facilitator);
    if (url.username || url.password || url.search || url.hash ||
        url.protocol !== 'https:' && !(raw.allowLocalFacilitator === true && url.protocol === 'http:' && url.hostname === '127.0.0.1'))
      throw failure('CONFIGURATION_ERROR', 'Use the original configured HTTPS or explicit loopback facilitator.');
  }
  return { ...raw, port: raw.port ?? 0 };
}
async function declaredFile(value, base) {
  const path = hostPath(value, base), actual = await realpath(path), info = await lstat(path);
  if (actual !== path || !info.isFile())
    throw failure('CONFIGURATION_ERROR', 'Declare an original regular import file through its canonical path.');
  return path;
}
/** Resolve original host inputs without opening a workspace or contacting Geoapify. */
export async function readGeoapifyWorkspaceConfiguration(path) {
  path = resolve(path);
  const raw = await connectionJSON(path);
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== GEOAPIFY_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      !Object.keys(raw.workspaces).length || Object.keys(raw.workspaces).length > 32)
    throw failure('CONFIGURATION_ERROR', 'Declare 1–32 original Geoapify workspaces.');
  const base = dirname(path), workspaces = Object.create(null), seen = new Set();
  for (const [name, input] of Object.entries(raw.workspaces)) {
    identifier(name, 'Geoapify workspace alias');
    exact(input, ['label', 'directory', 'apiKeyEnv', 'timeoutMs', 'imports', 'merchants', 'buyerWorkspaces', 'runtime', 'facilitators'], ['directory']);
    const directory = await realpath(hostPath(input.directory, base));
    await privateSupportDirectory(directory);
    if (seen.has(directory)) throw failure('CONFIGURATION_ERROR', 'Give each original address workspace one alias.');
    seen.add(directory);
    if (input.apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.apiKeyEnv))
      throw failure('CONFIGURATION_ERROR', 'Use an existing environment-variable name for the provider key.');
    const timeoutMs = count(input.timeoutMs ?? 120000, 'Provider timeout', 1000, 900000);
    const imports = Object.create(null), merchants = Object.create(null), buyers = Object.create(null);
    for (const [key, item] of entries(input.imports, 'retained imports')) {
      if (!plain(item) || !['intake','response','package'].includes(item.kind))
        throw failure('CONFIGURATION_ERROR', 'An import is an original CSV/JSON intake, generic-batch response, or complete package.');
      const allowed = item.kind === 'intake' ? ['label','kind','file','format','name','sourceURL','provenance','mapping'] :
        item.kind === 'response' ? ['label','kind','file','status','retryAfter'] : ['label','kind','file'];
      exact(item, allowed, ['kind','file']);
      const configured = { label: line(item.label ?? key), kind: item.kind, file: await declaredFile(item.file, base) };
      if (item.kind === 'intake') {
        if (!['csv','json'].includes(item.format))
          throw failure('CONFIGURATION_ERROR', 'Choose CSV or JSON original records.');
        if (!plain(item.mapping)) throw failure('CONFIGURATION_ERROR', 'Declare explicit original address fields.');
        configured.format=item.format; configured.mapping=structuredClone(item.mapping);
        configured.provenance=line(item.provenance, 'Source rights and provenance');
        if(item.name!==undefined)configured.name=line(item.name,'Source name');
        if(item.sourceURL!==undefined)configured.sourceURL=line(item.sourceURL,'Original source URL');
      } else if(item.kind==='response') {
        configured.status=count(item.status??200,'Original HTTP status',100,599);
        if(item.retryAfter!==undefined)configured.retryAfter=line(item.retryAfter,'Original Retry-After');
      }
      imports[key]=configured;
    }
    for (const [key, item] of entries(input.merchants, 'merchant profiles')) {
      exact(item, ['label', 'origin', 'path', 'payment'], ['origin', 'path', 'payment']);
      if (!plain(item.payment) || typeof item.origin !== 'string' || typeof item.path !== 'string')
        throw failure('CONFIGURATION_ERROR', 'Merchant profiles contain the original public origin, route and payment terms.');
      merchants[key] = { label: line(item.label ?? key), origin: item.origin, path: item.path, payment: item.payment };
    }
    for (const [key, item] of entries(input.buyerWorkspaces, 'buyer workspaces')) {
      exact(item, ['label', 'directory'], ['directory']);
      const buyerDirectory = await realpath(hostPath(item.directory, base));
      await privateSupportDirectory(buyerDirectory);
      buyers[key] = { label: line(item.label ?? key), directory: buyerDirectory };
    }
    const facilitators=input.facilitators===undefined?undefined:
      (await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/release-facilitator.mjs')).normalizeFacilitatorProfiles(input.facilitators);
    workspaces[name] = { label: line(input.label ?? name), directory, apiKeyEnv: input.apiKeyEnv ?? 'GEOAPIFY_API_KEY',
      timeoutMs, imports, merchants, buyerWorkspaces: buyers, runtime: runtime(input.runtime),facilitators };
  }
  return { workspaces };
}

function pageRows(rows, offset, limit) {
  const values = rows.slice(offset, offset + limit);
  return { values, page: { offset, limit, total: rows.length, nextOffset: offset + values.length < rows.length ? offset + values.length : null } };
}
function jobView(job,offset=0,limit=20) {
  const {queryIds,events=[],...rest}=job;const listed=pageRows(events,offset,limit);
  return {...rest,...(queryIds?{queryCount:queryIds.length}:{}),events:listed.values,eventsPage:listed.page};
}
function reviewRow(row,offset=0,limit=10) {
  const {values:sourceOrdinals,page:sourcePage}=pageRows(row.sourceOrdinals??[],offset,limit);
  return {...row,sourceOrdinals,sourcePage,candidates:(row.candidates??[]).map(candidate=>{
    const {values:sourceCoordinates,page:sourceCoordinatesPage}=pageRows(candidate.sourceCoordinates??[],offset,limit);
    return {...candidate,sourceCoordinates,sourceCoordinatesPage};
  })};
}
function sourceView(state, offset = 0, limit = 50) {
  const {directory,editor,...result}=state;
  result.editor={saved:Boolean(editor),bytes:editor?Buffer.byteLength(JSON.stringify(editor)):0};
  result.pages={};
  for(const key of ['jobs','editions','exports']) {
    const {values,page}=pageRows(state[key]??[],offset,limit);
    result[key]=key==='exports'?values.map(({directory,...item})=>item):
      key==='jobs'?values.map(job=>jobView(job)):values;
    result.pages[key]=page;
  }
  return result;
}
async function exactRetainedBytes(path, descriptor) {
  const bytes = await fileBytes(path, 256 * 1024 * 1024);
  if (bytes.length !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256)
    throw failure('GEOAPIFY_RETAINED_CHANGED', 'The original retained file changed before its chunk snapshot was opened.');
  return bytes;
}
function originalId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value))
    throw failure('INVALID_PARAMS', 'Use the exact retained native record ID.');
  return value;
}
function only(raw, keys) { exact(raw, keys); return raw; }
export class MerchantGeoapifyWorkspaces {
  #config; #environment; #handles = new Map(); #pending = new Set(); #closing = false; #close;
  #reads = new RetainedFileReads({ errorPrefix: 'GEOAPIFY' });
  constructor(config, {environment=process.env}={}) { this.#config=config; this.#environment=environment; }
  get summary() { return { configured: Boolean(this.#config.geoapifyWorkspaces),
    opened: [...this.#handles.keys()], pending: this.#pending.size, closing: this.#closing, ...this.#reads.summary }; }
  #declared(name) {
    identifier(name, 'Geoapify workspace alias');
    const entry = this.#config.geoapifyWorkspaces?.workspaces?.[name];
    if (!entry) throw failure('GEOAPIFY_WORKSPACE_NOT_CONFIGURED', 'Choose an alias from merchant_geoapify_status.');
    return entry;
  }
  async #open(name) {
    const configuration = this.#declared(name);
    if (!this.#handles.has(name)) {
      const opening = (async () => {
        const apiKey = this.#environment[configuration.apiKeyEnv];
        const { openGeoapifyOperator } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/server.mjs');
        const operator = await openGeoapifyOperator({ directory: configuration.directory, apiKey, timeoutMs: configuration.timeoutMs,facilitators:configuration.facilitators });
        return { configuration, operator, instanceId: randomUUID(), browser: null, tail: Promise.resolve(), closing: false };
      })();
      this.#handles.set(name, opening);
      try { await opening; } catch (error) { if (this.#handles.get(name) === opening) this.#handles.delete(name); throw error; }
    }
    return this.#status(name);
  }
  async #status(name, offset = 0, limit = 50) {
    count(offset, 'History offset'); count(limit, 'History page size', 1, 100);
    if (name === undefined) return { ...this.summary,
      workspaces: Object.entries(this.#config.geoapifyWorkspaces?.workspaces ?? {}).map(([workspace, entry]) => ({
        workspace, label: entry.label, state: this.#handles.has(workspace) ? 'OPEN' : 'CLOSED',
        imports: Object.entries(entry.imports).map(([sourceImport, item]) => ({ sourceImport, label: item.label, kind: item.kind })),
        merchants: Object.entries(entry.merchants).map(([profile, item]) => ({ profile, label: item.label, origin: item.origin, path: item.path, payment: item.payment })),
        buyerWorkspaces: Object.entries(entry.buyerWorkspaces).map(([buyerWorkspace, item]) => ({ buyerWorkspace, label: item.label }))
      })) };
    const configuration = this.#declared(name), pending = this.#handles.get(name);
    if (!pending) return { workspace: name, label: configuration.label, state: 'CLOSED' };
    const handle = await pending;
    return { workspace: name, instanceId: handle.instanceId, state: handle.closing ? 'CLOSING' : 'OPEN',
      native: sourceView(await handle.operator.state(), offset, limit), browser: { open: Boolean(handle.browser) },
      fileReads: this.#reads.status(name) };
  }
  async #stop(name, handle) {
    handle.closing = true;
    await handle.tail.catch(() => {});
    if (handle.browser) { await handle.browser.close(); handle.browser = null; }
    await this.#reads.closeScope(name);
    await handle.operator.close();
    this.#handles.delete(name);
    return { workspace: name, instanceId: handle.instanceId, state: 'CLOSED' };
  }
  async #file(name, handle, args) {
    originalId(args.id);
    if (args.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(args.expectedSha256)) throw failure('INVALID_PARAMS', 'Choose the exact original file SHA-256.');
    const key = args.kind + ':' + args.id + ':' + (args.filename ?? '');
    return this.#reads.read({ scope: name, key, kind: args.kind, directory: this.#config.exportsDirectory,
      expectedSha256: args.expectedSha256, readId: args.readId, offset: args.offset, limit: args.limit,
      load: async () => {
        if (args.kind === 'source-export') {
          if (typeof args.filename !== 'string') throw failure('INVALID_PARAMS', 'Choose an original filename from this export.');
          const file = await handle.operator.readExport(args.id, args.filename);
          return { bytes: await exactRetainedBytes(file.path, file), name: args.filename, type: file.contentType };
        }
        if (args.kind === 'provider-request') {
          const {result}=await handle.operator.act('provider.request',{id:args.id});
          const bytes=Buffer.from(JSON.stringify(result.request,null,2)+'\n');
          if(bytes.length!==result.job.request.bytes||createHash('sha256').update(bytes).digest('hex')!==result.job.request.sha256)
            throw failure('GEOAPIFY_RETAINED_CHANGED','The retained original prepared request differs.');
          return {bytes,name:result.job.id+'.json',type:'application/json; charset=utf-8'};
        }
        if (!['draft-csv', 'draft-review', 'buyer-config', 'session-manifest', 'session-csv', 'session-jsonl', 'session-review', 'facilitator-review', 'facilitator-response'].includes(args.kind))
          throw failure('INVALID_PARAMS', 'Choose a supported original publisher file kind.');
        const file = await handle.operator.readPublisherExport(args.kind, args.id);
        return { bytes: file.bytes, name: file.filename, type: file.contentType };
      } });
  }
  async #execute(name, handle, args) {
    const entry = handle.configuration, original = handle.operator;
    const call = async (action, payload = {}) => {
      const result = await original.act(action, payload);
      return { ...result, state: sourceView(result.state) };
    };
    switch (name) {
      case 'merchant_geoapify_source':
        return call('source.inspect',{...(args.sourceSha256===undefined?{}:{sourceSha256:args.sourceSha256}),
          offset:count(args.offset??0,'Source offset',0,1000000),limit:count(args.limit??25,'Source page size',1,250)});
      case 'merchant_geoapify_sources': {
        const payload=args.payload??{};
        if(!plain(payload))throw failure('INVALID_PARAMS','Use an original source revision payload.');
        if(args.action==='history') {
          only(payload,['offset','limit']);
          return call('source.history',{offset:count(payload.offset??0,'Source history offset',0,1000000),
            limit:count(payload.limit??25,'Source history page size',1,250)});
        }
        if(args.action==='stage') {
          only(payload,['sourceImport','mapping','baselineEditionId','expectedRevision']);
          const source=entry.imports[identifier(payload.sourceImport,'Successor source import')];
          if(!source||source.kind!=='intake')throw failure('GEOAPIFY_IMPORT_NOT_CONFIGURED','Choose a declared complete CSV or JSON successor source.');
          const {file,label,kind,...input}=source;
          return call('source.stage',{...input,path:file,mapping:payload.mapping??source.mapping,
            baselineEditionId:originalId(payload.baselineEditionId),expectedRevision:payload.expectedRevision});
        }
        if(args.action==='compare') {
          only(payload,['sourceSha256','offset','limit','status','search','reuseOffset','reuseLimit','sourceOffset','sourceLimit']);
          const {sourceOffset=0,sourceLimit=25,...selected}=payload;
          const offset=count(sourceOffset,'Reusable query source offset',0,1000000),
            limit=count(sourceLimit,'Reusable query source page size',1,100);
          const response=await original.act('source.compare',{...selected,
            offset:count(payload.offset??0,'Comparison offset',0,2000000),
            limit:count(payload.limit??25,'Comparison page size',1,250),
            reuseOffset:count(payload.reuseOffset??0,'Reusable query offset',0,1000000),
            reuseLimit:count(payload.reuseLimit??25,'Reusable query page size',1,250)});
          return {...response,result:{...response.result,reusableQueries:(response.result.reusableQueries??[]).map(query=>{
            const {values:sourceOrdinals,page:sourceOrdinalsPage}=pageRows(query.sourceOrdinals??[],offset,limit);
            return {...query,sourceOrdinals,sourceOrdinalsPage};
          })},state:sourceView(response.state)};
        }
        if(args.action==='activate') {
          only(payload,['sourceSha256','expectedComparisonSha256','reuseQueryIds','reuseAllEligible','reviewer','note','expectedRevision']);
          return call('source.activate',payload);
        }
        throw failure('INVALID_PARAMS','Choose history, stage, compare or activate.');
      }
      case 'merchant_geoapify_intake': {
        const source=entry.imports[identifier(args.sourceImport,'Source import')];
        if(!source||source.kind!=='intake')throw failure('GEOAPIFY_IMPORT_NOT_CONFIGURED','Choose a declared original CSV or JSON intake.');
        const {file,label,kind,...input}=source;
        return call('intake.import',{...input,path:file,expectedRevision:args.expectedRevision,
          mapping:args.mapping??source.mapping});
      }
      case 'merchant_geoapify_provider': {
        const payload=args.payload??{};
        if(!plain(payload))throw failure('INVALID_PARAMS','Use an original provider action payload.');
        if(args.action==='prepare') {
          only(payload,['expectedRevision','expectedIntakeSha256','maximumInputs','queryIds','refresh','options']);
          return call('provider.prepare',payload);
        }
        if(['run','poll'].includes(args.action)) {
          only(payload,['expectedRevision','id','expectedRequestSha256']);originalId(payload.id);
          return call('provider.'+args.action,payload);
        }
        if(args.action==='abandon') {
          only(payload,['expectedRevision','id','reviewer','reason']);originalId(payload.id);
          return call('provider.abandon',payload);
        }
        if(args.action==='request') {
          only(payload,['id','offset','limit','eventOffset','eventLimit']);
          const offset=count(payload.offset??0,'Input offset',0,1000),limit=count(payload.limit??50,'Input page size',1,250);
          const eventOffset=count(payload.eventOffset??0,'Event offset'),eventLimit=count(payload.eventLimit??20,'Event page size',1,100);
          const response=await original.act('provider.request',{id:originalId(payload.id)});
          const {job,request}=response.result,{values:inputs,page}=pageRows(request.body.inputs,offset,limit);
          return {result:{job:jobView(job,eventOffset,eventLimit),request:{...request,body:{...request.body,inputs}},page,
            file:{kind:'provider-request',id:job.id,...job.request}},state:sourceView(response.state)};
        }
        if(args.action==='import') {
          only(payload,['expectedRevision','sourceImport','id','expectedRequestSha256']);
          const source=entry.imports[identifier(payload.sourceImport,'Provider response import')];
          if(!source||source.kind!=='response')throw failure('GEOAPIFY_IMPORT_NOT_CONFIGURED','Choose a declared complete generic-batch response.');
          return call('provider.import',{expectedRevision:payload.expectedRevision,id:originalId(payload.id),
            expectedRequestSha256:payload.expectedRequestSha256,path:source.file,status:source.status,
            ...(source.retryAfter===undefined?{}:{retryAfter:source.retryAfter})});
        }
        throw failure('INVALID_PARAMS','Choose prepare, request, run, poll, import or abandon.');
      }
      case 'merchant_geoapify_review': {
        const payload=args.payload??{};
        if(!plain(payload))throw failure('INVALID_PARAMS','Use an original review payload.');
        if(args.action==='list'){
          only(payload,['sourceSha256','status','search','offset','limit']);
          const response=await original.act('review.list',payload);
          return {...response,result:{...response.result,rows:response.result.rows.map(row=>reviewRow(row))},state:sourceView(response.state)};
        }
        if(args.action==='query'){
          only(payload,['sourceSha256','queryId','sourceOffset','sourceLimit']);
          const offset=count(payload.sourceOffset??0,'Original source offset',0,1000000),limit=count(payload.sourceLimit??25,'Original source page size',1,100);
          const response=await original.act('review.query',{queryId:payload.queryId,...(payload.sourceSha256===undefined?{}:{sourceSha256:payload.sourceSha256})});
          const {values:originalRows,page:originalRowsPage}=pageRows(response.result.originalRows,offset,limit);
          return {...response,result:{...reviewRow(response.result,offset,limit),originalRows,originalRowsPage},state:sourceView(response.state)};
        }
        if(args.action==='decide'){
          only(payload,['expectedRevision','expectedIntakeSha256','queryId','action','candidateId','coordinateChoice','reviewer','note','expectedResponseSha256']);
          return call('review.decide',payload);
        }
        throw failure('INVALID_PARAMS','Choose list, query or decide.');
      }
      case 'merchant_geoapify_editor': {
        if(args.action==='read'){const state=await original.state();return {editor:state.editor??{},state:sourceView(state)};}
        if(args.action!=='save')throw failure('INVALID_PARAMS','Choose read or save.');
        return call('editor.save',{editor:args.editor,expectedRevision:args.expectedRevision,
          ...(args.expectedIntakeSha256===undefined?{}:{expectedIntakeSha256:args.expectedIntakeSha256})});
      }
      case 'merchant_geoapify_edition': {
        const payload = { ...(args.payload ?? {}) };
        if (!plain(args.payload ?? {})) throw failure('INVALID_PARAMS', 'Use an original edition payload.');
        if (args.action === 'build') {
          only(payload, ['expectedRevision','expectedIntakeSha256','name','scope','sourceColumns']);
          return call('edition.build', payload);
        }
        if (args.action === 'activate') {
          only(payload, ['expectedRevision','editionId']); originalId(payload.editionId);
          return call('edition.activate', payload);
        }
        throw failure('INVALID_PARAMS', 'Choose build or activate.');
      }
      case 'merchant_geoapify_query':
        return call('dataset.query', { expectedRevision: args.expectedRevision, query: args.query });
      case 'merchant_geoapify_merchant': {
        const profile = entry.merchants[identifier(args.profile, 'Merchant profile')];
        if (!profile) throw failure('GEOAPIFY_MERCHANT_NOT_CONFIGURED', 'Choose a declared public merchant profile.');
        const { label, ...merchant } = profile;
        return call('merchant.configure', { expectedRevision: args.expectedRevision, merchant });
      }
      case 'merchant_geoapify_export':
        return call('package.export', { expectedRevision: args.expectedRevision });
      case 'merchant_geoapify_restore': {
        const source = entry.imports[identifier(args.sourceImport, 'Source import')];
        if (!source || source.kind !== 'package') throw failure('GEOAPIFY_IMPORT_NOT_CONFIGURED', 'Choose a declared original portable address package.');
        return call('package.import', { path: source.file, expectedRevision: args.expectedRevision });
      }
      case 'merchant_geoapify_file': return this.#file(args.workspace, handle, args);
      case 'merchant_geoapify_file_release':
        await this.#reads.release(args.workspace, args.readId); return { workspace: args.workspace, readId: args.readId, released: true };
      case 'merchant_geoapify_publisher': {
        if (!publisherActions.has(args.action)) throw failure('INVALID_PARAMS', 'Choose an original publisher action.');
        const payload = { ...(args.payload ?? {}) };
        if (!plain(args.payload ?? {})) throw failure('INVALID_PARAMS', 'Use an object publisher payload.');
        if (args.action === 'publisher.prepare') {
          only(payload, ['exportId']);
          const selected = (await original.state()).exports.find(item => item.id === payload.exportId);
          if (!selected) throw failure('GEOAPIFY_EXPORT_NOT_FOUND', 'Choose an original export ID from this source workspace.');
          return call(args.action, { exportDirectory: selected.directory });
        }
        if (args.action === 'publisher.release.stage') {
          only(payload, ['draftId', 'id', 'label']);
          return call(args.action, { ...payload, runtime: entry.runtime });
        }
        if (args.action === 'publisher.buyer.session') {
          only(payload, ['buyerId','buyerWorkspace','maxPages','maxTotalAtomic','maxRows','maxPageBytes']);
          const buyer = entry.buyerWorkspaces[identifier(payload.buyerWorkspace, 'Buyer workspace')];
          if (!buyer) throw failure('GEOAPIFY_BUYER_NOT_CONFIGURED', 'Choose a host-declared original buyer workspace.');
          const { buyerWorkspace, ...selected } = payload;
          return call(args.action, { ...selected, workspaceDirectory: buyer.directory });
        }
        // Original action schemas validate all other draft/release/session inputs.
        return call(args.action, payload);
      }
      case 'merchant_geoapify_browser': {
        if (args.action === 'close') {
          if (handle.browser) { await handle.browser.close(); handle.browser = null; }
          return { workspace: args.workspace, browser: 'CLOSED', instanceId: handle.instanceId };
        }
        if (args.action !== 'open') throw failure('INVALID_PARAMS', 'Choose open or close.');
        if (!handle.browser) {
          const { startGeoapifyWorkspace } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/server.mjs');
          handle.browser = await startGeoapifyWorkspace({ directory: entry.directory, operator: original,
            port: count(args.port ?? 0, 'Browser port', 0, 65535) });
        }
        return { workspace: args.workspace, instanceId: handle.instanceId, url: handle.browser.url, browser: 'OPEN' };
      }
      default: throw failure('TOOL_NOT_FOUND', 'Unknown Geoapify workspace operation.');
    }
  }
  async #dispatch(name, args) {
    if (name === 'merchant_geoapify_status') return this.#status(args.workspace, args.offset ?? 0, args.limit ?? 50);
    if (name === 'merchant_geoapify_open') return this.#open(args.workspace);
    this.#declared(args.workspace);
    const opening = this.#handles.get(args.workspace);
    if (!opening) throw failure('GEOAPIFY_WORKSPACE_CLOSED', 'Open this original workspace with merchant_geoapify_open.');
    const handle = await opening;
    if (handle.closing) throw failure('GEOAPIFY_WORKSPACE_CLOSING', 'The original workspace is closing.');
    if (name === 'merchant_geoapify_close') {
      if (args.instanceId !== handle.instanceId) throw failure('INSTANCE_CONFLICT', 'Use this process-owned instance ID from status.');
      return this.#stop(args.workspace, handle);
    }
    const operation = handle.tail.then(() => this.#execute(name, handle, args));
    handle.tail = operation.then(() => {}, () => {});
    return operation;
  }
  async call(name, args) {
    if (this.#closing) throw failure('OPERATOR_CLOSING', 'The Geoapify adapter is closing.');
    const operation = this.#dispatch(name, args);
    this.#pending.add(operation);
    try { return await operation; } finally { this.#pending.delete(operation); }
  }
  close() {
    if (this.#close) return this.#close;
    this.#closing = true;
    this.#close = (async () => {
      await Promise.allSettled([...this.#pending]);
      const outcomes = await Promise.allSettled([...this.#handles].map(async ([name, pending]) => this.#stop(name, await pending)));
      await this.#reads.close();
      if (outcomes.some(item => item.status === 'rejected')) throw failure('GEOAPIFY_CLOSE_FAILED', 'An original Geoapify operator reported incomplete shutdown.');
    })();
    return this.#close;
  }
}
