// MIT. An operator-selected SeaTable v2 table/view and explicit public columns.
import { dirname, resolve } from 'node:path';
import { object, readPrivate, digest, identity, fault } from '../postgres/publisher/files.mjs';

export const HASH = /^[a-f0-9]{64}$/;
export const MAX_CAPTURE_BYTES = 268435456;
export const MAX_PAGE_BYTES = 16777216;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);
export const SCALAR_TYPES = new Set(['text', 'email', 'url', 'long-text', 'number', 'percent', 'dollar', 'euro', 'duration', 'date', 'single-select', 'checkbox', 'rate', 'auto-number', 'formula']);
export function only(value, keys, code) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw fault(code);
}
export function integer(value, low, high, code) {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw fault(code);
  return value;
}
export function identifier(value, label = 'ID') {
  if (typeof value !== 'string' || !ID.test(value) || RESERVED.has(value)) throw fault('SEATABLE_' + label + '_INVALID');
  return value;
}
export function normalizeWhere(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 8 || !object(value)) throw fault('SEATABLE_FILTER_INVALID');
  for (const key of ['all', 'any']) if (Object.hasOwn(value, key)) {
    only(value, [key], 'SEATABLE_FILTER_INVALID');
    if (!Array.isArray(value[key]) || !value[key].length || value[key].length > 32) throw fault('SEATABLE_FILTER_INVALID');
    return { [key]: value[key].map(item => {
      const result = normalizeWhere(item, depth + 1);
      if (result === null) throw fault('SEATABLE_FILTER_INVALID');
      return result;
    }) };
  }
  if (Object.hasOwn(value, 'not')) {
    only(value, ['not'], 'SEATABLE_FILTER_INVALID');
    const result = normalizeWhere(value.not, depth + 1);
    if (result === null) throw fault('SEATABLE_FILTER_INVALID');
    return { not: result };
  }
  only(value, ['field', 'op', 'value'], 'SEATABLE_FILTER_INVALID');
  const field = identifier(value.field, 'FILTER_FIELD');
  const op = value.op;
  if (!['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'not-in', 'like', 'is-null', 'not-null'].includes(op)) throw fault('SEATABLE_FILTER_OPERATOR_INVALID');
  if (['is-null', 'not-null'].includes(op)) {
    if (Object.hasOwn(value, 'value')) throw fault('SEATABLE_FILTER_VALUE_UNEXPECTED');
    return { field, op };
  }
  const scalar = item => {
    if (typeof item === 'string' && item.length <= 8192 && !item.includes('\0') || Number.isSafeInteger(item)) return item;
    throw fault('SEATABLE_FILTER_VALUE_INVALID', 'Use native SQL string or safe-integer parameters. Null has its own operator; no raw SQL or interpolated value is accepted.');
  };
  if (op === 'in' || op === 'not-in') {
    if (!Array.isArray(value.value) || !value.value.length || value.value.length > 100) throw fault('SEATABLE_FILTER_VALUE_INVALID');
    return { field, op, value: value.value.map(scalar) };
  }
  if (op === 'like' && typeof value.value !== 'string') throw fault('SEATABLE_FILTER_VALUE_INVALID');
  return { field, op, value: scalar(value.value) };
}
export function binding(value, { allowUnordered = false } = {}) {
  if (value.apiVersion !== 'v2') throw fault('SEATABLE_API_GATEWAY_V2_REQUIRED');
  let url;
  try { url = new URL(value.server); } catch { throw fault('SEATABLE_SERVER_INVALID'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      /%2f|%5c|%2e/i.test(url.pathname) || url.pathname.includes('//'))
    throw fault('SEATABLE_SERVER_INVALID', 'Use the existing SeaTable server origin and optional fixed reverse-proxy path without credentials or query parameters.');
  const server = url.origin + url.pathname.replace(/\/$/, '');
  const baseId = value.baseId;
  if (typeof baseId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(baseId))
    throw fault('SEATABLE_BASE_UUID_REQUIRED');
  const viewId = value.viewId ?? null, where = normalizeWhere(value.where);
  if (viewId !== null) identifier(viewId, 'VIEW_ID');
  const orders = value.sourceOrder ?? [];
  if (!Array.isArray(orders) || orders.length > 8) throw fault('SEATABLE_SOURCE_ORDER_INVALID');
  const seen = new Set(), sourceOrder = orders.map(item => {
    only(item, ['field', 'direction'], 'SEATABLE_SOURCE_ORDER_INVALID');
    const field = identifier(item.field, 'SORT_FIELD');
    if (seen.has(field) || !['asc', 'desc'].includes(item.direction)) throw fault('SEATABLE_SOURCE_ORDER_INVALID');
    seen.add(field); return { field, direction: item.direction };
  });
  if (viewId !== null && (where !== null || sourceOrder.length))
    throw fault('SEATABLE_VIEW_SELECTION_EXCLUSIVE', 'A saved native view supplies its own filters and order. Use where:null and sourceOrder:[]; do not approximate that view with SQL.');
  if (viewId === null && !allowUnordered && !seen.has('_id'))
    throw fault('SEATABLE_IDENTITY_ORDER_REQUIRED', 'Include native _id in the explicit SQL source order so ties have a stable identity.');
  return { server, apiVersion: 'v2', baseId, tableId: identifier(value.tableId, 'TABLE_ID'), viewId, where, sourceOrder };
}
export function compileQueries(value, allowEmpty = false) {
  if (!object(value) || (!allowEmpty && !Object.keys(value).length) || Object.keys(value).length > 32)
    throw fault('SEATABLE_QUERIES_REQUIRED');
  return Object.fromEntries(Object.entries(value).map(([name, query]) => {
    if (!NAME.test(name) || RESERVED.has(name)) throw fault('SEATABLE_QUERY_NAME_INVALID');
    only(query, ['columns'], 'SEATABLE_QUERY_INVALID');
    if (!object(query.columns) || !Object.keys(query.columns).length || Object.keys(query.columns).length > 64)
      throw fault('SEATABLE_PUBLIC_COLUMNS_REQUIRED');
    const selected = new Set();
    const projection = Object.fromEntries(Object.entries(query.columns).map(([alias, spec]) => {
      if (!NAME.test(alias) || RESERVED.has(alias)) throw fault('SEATABLE_COLUMN_NAME_INVALID');
      only(spec, ['source', 'providerType', 'type', 'encoding', 'nullable', 'empty'], 'SEATABLE_COLUMN_INVALID');
      const recordId = spec.source === '$recordId';
      if (!recordId) { identifier(spec.source, 'FIELD_ID'); if (spec.source === '_id') throw fault('SEATABLE_USE_RECORD_ID_PROJECTION', 'Use $recordId for the native row identity.'); }
      if (selected.has(spec.source) || !['string', 'integer', 'number', 'boolean'].includes(spec.type) ||
          spec.nullable !== undefined && typeof spec.nullable !== 'boolean' ||
          spec.empty !== undefined && !['preserve', 'null'].includes(spec.empty))
        throw fault('SEATABLE_COLUMN_INVALID');
      selected.add(spec.source);
      if (recordId ? spec.providerType !== undefined : !SCALAR_TYPES.has(spec.providerType))
        throw fault('SEATABLE_SCALAR_FIELD_TYPE_REQUIRED', 'Select a scalar field by its actual field ID and provider type; structured and linked fields are not complete scalar values.');
      const encoding = spec.encoding ?? (recordId && spec.type === 'string' ? 'identity-text' : 'native');
      if (!['native', 'number-text', 'identity-text'].includes(encoding) ||
          encoding === 'identity-text' && (!recordId || spec.type !== 'string') ||
          encoding === 'number-text' && spec.type !== 'string')
        throw fault('SEATABLE_VALUE_ENCODING_INVALID');
      const nullable = spec.nullable ?? false, empty = spec.empty ?? 'preserve';
      if (recordId && nullable || empty === 'null' && !nullable) throw fault('SEATABLE_NULL_POLICY_INVALID');
      return [alias, { source: spec.source, ...(recordId ? {} : { providerType: spec.providerType }),
        type: spec.type, encoding, nullable, empty }];
    }));
    return [name, { columns: Object.keys(projection), projection, parameters: {}, parameterOrder: [],
      sql: 'SeaTable API-gateway v2: complete SQL or native-view pages; exact table/column keys, explicit scalar types and native row identity; read-only.' }];
  }));
}
export function selectedFields(queries) {
  const result = new Map();
  for (const query of Object.values(queries)) for (const spec of Object.values(query.projection)) {
    if (spec.source === '$recordId') continue;
    if (result.has(spec.source) && result.get(spec.source) !== spec.providerType)
      throw fault('SEATABLE_FIELD_TYPE_DECLARATION_CONFLICT');
    result.set(spec.source, spec.providerType);
  }
  if (!result.size) throw fault('SEATABLE_PUBLIC_SOURCE_FIELD_REQUIRED', 'Declare at least one actual public field in addition to any record identity.');
  return [...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, type]) => ({ id, type }));
}
export function restOptions(config, { allowUnordered = false } = {}) {
  const connection = config.connection;
  only(connection, ['kind', 'tokenEnv', 'allowHttp', 'pageSize', 'maxPageBytes', 'maxCaptureBytes',
    'maxPages', 'maxRows', 'timeoutMs', 'requestIntervalMs', 'tokenKind'], 'SEATABLE_REST_CONNECTION_INVALID');
  if (connection.kind !== 'rest' || typeof connection.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(connection.tokenEnv))
    throw fault('SEATABLE_TOKEN_REFERENCE_REQUIRED', 'Reference an existing SeaTable read token through its environment variable.');
  if (connection.allowHttp !== undefined && typeof connection.allowHttp !== 'boolean') throw fault('SEATABLE_HTTP_OPTION_INVALID');
  const selected = binding(config, { allowUnordered }), url = new URL(selected.server);
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && connection.allowHttp !== true)
    throw fault('SEATABLE_HTTPS_REQUIRED', 'Use HTTPS, or explicitly approve this existing private HTTP host in the source file.');
  if (!['api', 'base'].includes(connection.tokenKind ?? 'api')) throw fault('SEATABLE_TOKEN_KIND_INVALID');
  return { tokenEnv: connection.tokenEnv, tokenKind: connection.tokenKind ?? 'api',
    pageSize: integer(connection.pageSize ?? 100, 1, selected.viewId === null ? 10000 : 1000, 'SEATABLE_PAGE_SIZE_INVALID'),
    maxPageBytes: integer(connection.maxPageBytes ?? MAX_PAGE_BYTES, 1024, MAX_PAGE_BYTES, 'SEATABLE_PAGE_BYTES_INVALID'),
    maxCaptureBytes: integer(connection.maxCaptureBytes ?? 67108864, 1024, MAX_CAPTURE_BYTES, 'SEATABLE_CAPTURE_BYTES_INVALID'),
    maxPages: integer(connection.maxPages ?? 10000, 1, 10000, 'SEATABLE_PAGE_LIMIT_INVALID'),
    maxRows: integer(connection.maxRows ?? 1000000, 1, 1000000, 'SEATABLE_ROW_LIMIT_INVALID'),
    timeoutMs: integer(connection.timeoutMs ?? 300000, 100, 3600000, 'SEATABLE_TIMEOUT_INVALID'),
    requestIntervalMs: integer(connection.requestIntervalMs ?? 250, 200, 30000, 'SEATABLE_REQUEST_INTERVAL_INVALID') };
}
export function sourceSelection(config, queries = compileQueries(config.queries)) {
  return { ...binding(config), fields: selectedFields(queries) };
}
export async function readSeaTableSourceFile(filename, { allowUnprojected = false, resolveCaptureFile = value => value } = {}) {
  const original = await readPrivate(filename);
  let config;
  try { config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original)); }
  catch { throw fault('SEATABLE_SOURCE_JSON_INVALID'); }
  only(config, ['schema', 'server', 'apiVersion', 'baseId', 'tableId', 'viewId', 'where', 'sourceOrder', 'connection', 'queries'],
    'SEATABLE_SOURCE_CONFIG_INVALID');
  if (config.schema !== 'stellar-forge.seatable-source.v1') throw fault('SEATABLE_SOURCE_CONFIG_INVALID');
  const selected = binding(config, { allowUnordered: allowUnprojected }), queries = compileQueries(config.queries, allowUnprojected);
  if (config.connection?.kind === 'capture') {
    only(config.connection, ['kind', 'file', 'sha256'], 'SEATABLE_CAPTURE_CONNECTION_INVALID');
    if (typeof config.connection.file !== 'string' || !config.connection.file || config.connection.file.includes('\0') ||
        !HASH.test(config.connection.sha256 ?? '')) throw fault('SEATABLE_CAPTURE_CONNECTION_INVALID');
  } else restOptions(config, { allowUnordered: allowUnprojected });
  return { config, binding: selected, queries, original, hash: digest(original),
    selectionHash: Object.keys(queries).length ? identity(sourceSelection(config, queries)) : null,
    captureFile: config.connection.kind === 'capture' ? resolveCaptureFile(resolve(dirname(filename), config.connection.file)) : null };
}
