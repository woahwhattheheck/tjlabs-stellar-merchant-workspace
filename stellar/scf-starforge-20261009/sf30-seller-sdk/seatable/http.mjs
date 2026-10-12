// MIT. Fixed-origin read-only SeaTable API-gateway v2 access.
import { setTimeout as delay } from 'node:timers/promises';
import { object, identity, fault, stamp } from '../postgres/publisher/files.mjs';
import { binding, restOptions, SCALAR_TYPES, identifier } from './declaration.mjs';

export const SAFE_HEADERS = Object.freeze(['content-type', 'date', 'etag', 'last-modified',
  'x-request-id', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining',
  'x-api-calls-limit', 'x-api-calls-remaining', 'x-api-calls-reset']);
export const modeOf = selected => selected.viewId === null ? 'sql' : 'view';
export const responseKind = selected => selected.viewId === null ? 'PAGED_SQL_READ' : 'PAGED_VIEW_READ';
export const metadataUrl = selected => new URL(selected.server + '/api-gateway/api/v2/dtables/' + selected.baseId + '/metadata/');
export const serverInfoUrl = selected => new URL(selected.server + '/server-info/');
const sqlUrl = selected => new URL(selected.server + '/api-gateway/api/v2/dtables/' + selected.baseId + '/sql/');
export const metadataRequest = selected => ({ method: 'GET', url: metadataUrl(selected).href });
export const serverInfoRequest = selected => ({ method: 'GET', url: serverInfoUrl(selected).href });
function quote(value) {
  if (typeof value !== 'string' || !value.length || value.length > 512 || /[\u0000-\u001f\u007f\\\x60]/.test(value))
    throw fault('SEATABLE_SQL_IDENTIFIER_UNSUPPORTED', 'This source uses a control, backslash or backtick in a native name. Rename it explicitly in SeaTable before choosing it for a SQL capture.');
  return String.fromCharCode(96) + value + String.fromCharCode(96);
}
const json = content => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
  catch { throw fault('SEATABLE_METADATA_JSON_INVALID'); }
};
function whereFields(node, found = new Set()) {
  if (!node) return found;
  if (node.field) found.add(node.field);
  for (const child of node.all ?? node.any ?? (node.not ? [node.not] : [])) whereFields(child, found);
  return found;
}
export function inspectTableBytes(content, selected, fields = null) {
  const body = json(content), metadata = body?.metadata;
  if (!object(metadata) || !Array.isArray(metadata.tables) || metadata.tables.length > 10000)
    throw fault('SEATABLE_METADATA_RESPONSE_INVALID');
  const tables = metadata.tables;
  if (tables.filter(item => item?._id === selected.tableId).length !== 1) throw fault('SEATABLE_TABLE_NOT_FOUND');
  const original = tables.find(item => item?._id === selected.tableId);
  if (typeof original.name !== 'string' || !Array.isArray(original.columns) || original.columns.length > 10000 ||
      !Array.isArray(original.views)) throw fault('SEATABLE_TABLE_METADATA_INVALID');
  const inventory = new Map(), names = new Set();
  for (const field of original.columns) {
    if (!object(field) || typeof field.type !== 'string' || typeof field.name !== 'string') throw fault('SEATABLE_COLUMN_METADATA_INVALID');
    identifier(field.key, 'FIELD_ID');
    if (inventory.has(field.key) || names.has(field.name) || field.key === '_id') throw fault('SEATABLE_COLUMN_IDENTITY_AMBIGUOUS');
    inventory.set(field.key, field); names.add(field.name);
  }
  const views = original.views.map(view => {
    if (!object(view) || typeof view.name !== 'string') throw fault('SEATABLE_VIEW_METADATA_INVALID');
    identifier(view._id, 'VIEW_ID');
    return { ...view, id: view._id, title: view.name };
  });
  if (new Set(views.map(view => view.id)).size !== views.length) throw fault('SEATABLE_VIEW_IDENTITY_AMBIGUOUS');
  const view = selected.viewId === null ? null : views.find(item => item.id === selected.viewId);
  if (selected.viewId !== null && !view) throw fault('SEATABLE_VIEW_NOT_IN_TABLE');
  if (view && (!Array.isArray(view.hidden_columns ?? []) || (view.hidden_columns ?? []).some(key => typeof key !== 'string')))
    throw fault('SEATABLE_VIEW_COLUMNS_INVALID');
  const hidden = new Set(view?.hidden_columns ?? []);
  if (fields !== null) {
    for (const field of fields) {
      const actual = inventory.get(field.id);
      if (!actual || actual.type !== field.type) throw fault('SEATABLE_SELECTED_FIELD_CHANGED');
      if (hidden.has(field.id)) throw fault('SEATABLE_SELECTED_FIELD_HIDDEN', 'Native saved views return their visible columns. Select a visible field or explicitly use SQL mode.');
    }
    for (const id of [...selected.sourceOrder.map(item => item.field), ...whereFields(selected.where)]) {
      if (id !== '_id' && (!inventory.has(id) || !SCALAR_TYPES.has(inventory.get(id).type)))
        throw fault('SEATABLE_FILTER_OR_ORDER_FIELD_CHANGED');
    }
  }
  const table = { id: original._id, title: original.name,
    fields: original.columns.map(field => ({ id: field.key, title: field.name, type: field.type, data: field.data ?? null })),
    views, view: view ?? null };
  // The actual full selected table definition includes view filters/order and column options.
  // Preserve the separate whole-base native version when the provider supplies it.
  const schema = { baseId: selected.baseId, table: original, viewId: selected.viewId };
  const version = metadata.version ?? null;
  if (version !== null && !(typeof version === 'string' || Number.isSafeInteger(version))) throw fault('SEATABLE_METADATA_VERSION_INVALID');
  return { table, schema, schemaSha256: identity(schema), metadataVersion: version,
    tables: tables.map(item => ({ id: item._id, title: item.name })) };
}
export function inspectServerInfoBytes(content) {
  const info = json(content);
  if (!object(info) || typeof info.version !== 'string' || info.version.length > 128 ||
      typeof info.edition !== 'string' || info.edition.length > 128) throw fault('SEATABLE_SERVER_INFO_INVALID');
  const major = /^(\d+)\./.exec(info.version);
  if (!major || Number(major[1]) < 5) throw fault('SEATABLE_CURRENT_GATEWAY_REQUIRED', 'Use SeaTable 5 or later with the current API-gateway and complete null-valued columns.');
  return { version: info.version, edition: info.edition };
}
function columnName(table, id) {
  if (id === '_id') return quote('_id');
  const field = table.fields.find(item => item.id === id);
  if (!field) throw fault('SEATABLE_SQL_FIELD_NOT_FOUND');
  return quote(field.title);
}
function compileWhere(table, value, parameters) {
  if (!value) return '';
  if (value.all || value.any) return '(' + (value.all ?? value.any).map(item => compileWhere(table, item, parameters)).join(value.all ? ' AND ' : ' OR ') + ')';
  if (value.not) return '(NOT ' + compileWhere(table, value.not, parameters) + ')';
  const field = columnName(table, value.field);
  if (value.op === 'is-null' || value.op === 'not-null') return '(' + field + (value.op === 'is-null' ? ' IS NULL)' : ' IS NOT NULL)');
  if (value.op === 'in' || value.op === 'not-in') {
    parameters.push(...value.value);
    return '(' + field + (value.op === 'in' ? ' IN (' : ' NOT IN (') + value.value.map(() => '?').join(', ') + '))';
  }
  const ops = { eq: '=', ne: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=', like: 'LIKE' };
  parameters.push(value.value);
  return '(' + field + ' ' + ops[value.op] + ' ?)';
}
export function sqlRequest(selection, table, { count = false, offset = 0, limit = 100 } = {}) {
  if (selection.viewId !== null) throw fault('SEATABLE_NATIVE_VIEW_SQL_MISMATCH');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw fault('SEATABLE_SQL_PAGE_INVALID');
  const parameters = [], condition = compileWhere(table, selection.where, parameters);
  const fields = count ? 'COUNT(*) AS __sf_count' : [quote('_id'), ...selection.fields.map(field => columnName(table, field.id))].join(', ');
  let sql = 'SELECT ' + fields + ' FROM ' + quote(table.title);
  if (condition) sql += ' WHERE ' + condition;
  if (!count) sql += ' ORDER BY ' + selection.sourceOrder.map(item => columnName(table, item.field) + ' ' + item.direction.toUpperCase()).join(', ') + ' LIMIT ' + limit + ' OFFSET ' + offset;
  return { method: 'POST', url: sqlUrl(selection).href, body: { sql, convert_keys: false, parameters, server_only: false } };
}
export function rowsRequest(selection, { offset = 0, limit = 100 } = {}) {
  if (selection.viewId === null || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw fault('SEATABLE_VIEW_PAGE_INVALID');
  const url = new URL(selection.server + '/api-gateway/api/v2/dtables/' + selection.baseId + '/rows/');
  url.searchParams.set('table_id', selection.tableId); url.searchParams.set('view_id', selection.viewId);
  url.searchParams.set('start', String(offset)); url.searchParams.set('limit', String(limit));
  url.searchParams.set('convert_keys', 'false');
  return { method: 'GET', url: url.href };
}
export function checkedHeaders(value = {}) {
  if (!object(value) || Object.keys(value).some(key => !SAFE_HEADERS.includes(key))) throw fault('SEATABLE_CAPTURE_HEADERS_INVALID');
  for (const text of Object.values(value)) if (typeof text !== 'string' || text.length > 1024 || /[\r\n\0]/.test(text)) throw fault('SEATABLE_CAPTURE_HEADERS_INVALID');
  return value;
}
export function createSeaTableReader(config, { env = process.env, signal, allowUnordered = false } = {}) {
  const selected = binding(config, { allowUnordered }), options = restOptions(config, { allowUnordered });
  const credential = env[options.tokenEnv];
  if (typeof credential !== 'string' || !credential.length || credential.length > 32768 || /[^\x21-\x7e]/.test(credential))
    throw fault('SEATABLE_TOKEN_MISSING', 'Supply the existing API/base read token through its environment reference.');
  const timeout = AbortSignal.timeout(options.timeoutMs), abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let lastStarted = 0, bearer = options.tokenKind === 'base' ? credential : null;
  const fail = (code, status = null, headers = {}) => {
    const issue = fault(code);
    if (status !== null) issue.providerStatus = status;
    if (headers['retry-after']) issue.retryAfter = headers['retry-after'];
    if (headers['x-request-id']) issue.requestId = headers['x-request-id'];
    return issue;
  };
  async function request(spec, token = null) {
    const url = new URL(spec.url);
    if (url.origin !== new URL(selected.server).origin || url.username || url.password || url.hash) throw fault('SEATABLE_REQUEST_ORIGIN_CHANGED');
    const wait = options.requestIntervalMs - (Date.now() - lastStarted);
    try { if (wait > 0) await delay(wait, undefined, { signal: abort }); }
    catch { throw fail(timeout.aborted ? 'SEATABLE_CAPTURE_TIMEOUT' : 'SEATABLE_CAPTURE_CANCELLED'); }
    lastStarted = Date.now();
    let response;
    try {
      response = await fetch(url, { method: spec.method, redirect: 'error', signal: abort,
        headers: { accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}),
          ...(spec.body ? { 'content-type': 'application/json' } : {}) },
        ...(spec.body ? { body: JSON.stringify(spec.body) } : {}) });
    } catch { throw fail(signal?.aborted ? 'SEATABLE_CAPTURE_CANCELLED' : timeout.aborted ? 'SEATABLE_CAPTURE_TIMEOUT' : 'SEATABLE_PROVIDER_UNREACHABLE'); }
    const headers = checkedHeaders(Object.fromEntries(SAFE_HEADERS.filter(name => response.headers.has(name)).map(name => [name, response.headers.get(name)])));
    if (response.status !== 200) {
      await response.body?.cancel();
      const codes = { 400: 'SEATABLE_REQUEST_INVALID', 401: 'SEATABLE_TOKEN_INVALID', 402: 'SEATABLE_PROVIDER_PLAN_REQUIRED',
        403: 'SEATABLE_READ_SCOPE_REQUIRED', 404: 'SEATABLE_SOURCE_NOT_FOUND', 429: 'SEATABLE_RATE_LIMITED' };
      throw fail(codes[response.status] ?? 'SEATABLE_PROVIDER_FAILED', response.status, headers);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] ?? '')) { await response.body?.cancel(); throw fail('SEATABLE_JSON_RESPONSE_REQUIRED'); }
    if (Number(response.headers.get('content-length') ?? 0) > options.maxPageBytes) { await response.body?.cancel(); throw fail('SEATABLE_PAGE_TOO_LARGE'); }
    const chunks = []; let size = 0;
    try {
      if (!response.body) throw fail('SEATABLE_RESPONSE_MISSING');
      for await (const chunk of response.body) {
        size += chunk.byteLength; if (size > options.maxPageBytes) throw fail('SEATABLE_PAGE_TOO_LARGE'); chunks.push(chunk);
      }
    } catch (issue) {
      if (issue.code?.startsWith('SEATABLE_')) throw issue;
      throw fail(signal?.aborted ? 'SEATABLE_CAPTURE_CANCELLED' : timeout.aborted ? 'SEATABLE_CAPTURE_TIMEOUT' : 'SEATABLE_RESPONSE_INTERRUPTED');
    }
    return { content: Buffer.concat(chunks), receivedAt: stamp(), request: structuredClone(spec), headers };
  }
  async function authorize() {
    if (bearer !== null) return;
    const response = await request({ method: 'GET', url: selected.server + '/api/v2.1/dtable/app-access-token/' }, credential);
    const value = json(response.content);
    if (!object(value) || value.dtable_uuid !== selected.baseId || typeof value.access_token !== 'string' ||
        !value.access_token.length || value.access_token.length > 32768 || /[^\x21-\x7e]/.test(value.access_token) ||
        value.use_api_gateway === false) throw fault('SEATABLE_BASE_TOKEN_BINDING_MISMATCH');
    if (value.dtable_server !== undefined) {
      let gateway; try { gateway = new URL(value.dtable_server); } catch { throw fault('SEATABLE_TOKEN_GATEWAY_INVALID'); }
      const expected = new URL(selected.server + '/api-gateway/');
      if (gateway.origin !== expected.origin || gateway.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '') ||
          gateway.search || gateway.hash || gateway.username || gateway.password) throw fault('SEATABLE_TOKEN_GATEWAY_CHANGED');
    }
    bearer = value.access_token; // Neither credential nor this response enters a capture.
  }
  return { options, selected, signal: abort,
    async read(spec) {
      if (spec.method === 'GET' && spec.url === serverInfoUrl(selected).href) return request(spec);
      const url = new URL(spec.url), prefix = selected.server + '/api-gateway/api/v2/dtables/' + selected.baseId + '/';
      const allowedGet = spec.method === 'GET' && (spec.url === metadataUrl(selected).href ||
        url.origin + url.pathname === prefix + 'rows/');
      const allowedSQL = spec.method === 'POST' && spec.url === sqlUrl(selected).href && object(spec.body) &&
        /^SELECT /i.test(spec.body.sql ?? '') && spec.body.convert_keys === false && Array.isArray(spec.body.parameters);
      if (!allowedGet && !allowedSQL) throw fault('SEATABLE_READ_ENDPOINT_REQUIRED');
      await authorize(); return request(spec, bearer);
    }
  };
}
export async function discoverSeaTableTable(config, options = {}) {
  const reader = createSeaTableReader(config, { ...options, allowUnordered: true });
  const version = await reader.read(serverInfoRequest(reader.selected)), server = inspectServerInfoBytes(version.content);
  const observation = await reader.read(metadataRequest(reader.selected));
  const { table, tables, schemaSha256, metadataVersion } = inspectTableBytes(observation.content, reader.selected);
  return { schema: 'stellar-forge.seatable-discovery.v1', source: reader.selected, receivedAt: observation.receivedAt,
    requestUrl: observation.request.url, schemaSha256, title: table.title, serverVersion: server.version, serverEdition: server.edition,
    metadataVersion, fields: [{ id: '_id', title: 'Native row identity', type: 'identity', scalarProjectionSupported: true,
      generatedRecordIdentity: true }, ...table.fields.map(field => ({ id: field.id, title: field.title, type: field.type,
      scalarProjectionSupported: SCALAR_TYPES.has(field.type), generatedRecordIdentity: false, data: field.data }))],
    views: table.views.map(view => ({ id: view.id, title: view.title, type: view.type ?? null,
      hiddenColumns: view.hidden_columns ?? [], filters: view.filters ?? [], sorts: view.sorts ?? [] })),
    tables, scope: 'Original server and complete base metadata only. Choose SQL with native _id order, or a native saved view with its unchanged filters, visible columns and order. A full capture and scalar review follow.' };
}
