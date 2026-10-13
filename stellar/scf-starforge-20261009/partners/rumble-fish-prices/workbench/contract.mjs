import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const PROVIDER_ORIGIN = 'https://prices-api.sorobanscan.rumblefish.dev';
export const PROVIDER_SOURCE = '5109d3937af8cb2211a4ef0cff4c417595be0718';
export const PROVIDER_LIMITS = Object.freeze({ requestsPerSecond: 1, monthlyRequests: 100000, batchAssets: 100, catalogPage: 200, historyPoints: 5000 });
export const GRANULARITY_SECONDS = Object.freeze({ '1m': 60, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 });
const TIMEFRAMES = Object.freeze({ '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000, '1y': 31536000, all: null });
const DEFAULT_GRANULARITY = Object.freeze({ '1h': '1m', '24h': '15m', '7d': '1h', '30d': '4h', '1y': '1d' });
const GENESIS = 1443571200;
const byteLength = value => Buffer.byteLength(value, 'utf8');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const clone = value => structuredClone(value);
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class WorkbenchError extends Error {
  constructor(code, message, status = 400, details) { super(message); this.name = 'WorkbenchError'; this.code = code; this.status = status; if (details !== undefined) this.details = details; }
}
const fail = (message, details) => { throw new WorkbenchError('CONFIGURATION_INVALID', message, 400, details); };
function object(value, label) { if (!isObject(value)) fail(`${label} must be an object.`); return value; }
function fields(value, allowed, label) { object(value, label); const extra = Object.keys(value).filter(key => !allowed.includes(key)); if (extra.length) fail(`${label} has unknown fields: ${extra.join(', ')}.`); }
function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}.`); return value; }
function choice(value, values, label) { if (!values.includes(value)) fail(`${label} must be one of ${values.join(', ')}.`); return value; }
function text(value, max, label, { empty = true } = {}) { if (typeof value !== 'string' || byteLength(value) > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail(`${label} must be text of at most ${max} bytes.`); return value; }
function volume(value, label) { if (value === null || value === undefined || value === '') return undefined; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e15) fail(`${label} must be a number from 0 to 1e15, or omitted.`); return value; }

function validStrKey(value, version) {
  if (!/^[A-Z2-7]{56}$/u.test(value)) return false;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = []; let bits = 0; let accumulator = 0;
  for (const character of value) { accumulator = (accumulator << 5) | alphabet.indexOf(character); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); } }
  if (bytes.length !== 35 || bytes[0] !== version) return false;
  let crc = 0;
  for (const byte of bytes.slice(0, 33)) { crc ^= byte << 8; for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff; }
  return bytes[33] === (crc & 255) && bytes[34] === (crc >>> 8);
}

export function parseAssetIdentifier(value) {
  if (typeof value !== 'string') throw new WorkbenchError('ASSET_INVALID', 'An asset needs its native, CODE:ISSUER, or contract identifier.');
  const identifier = value.trim();
  if (/^native$/iu.test(identifier)) return { identifier: 'native', kind: 'native', code: 'XLM', issuer: '', contract: '' };
  const colon = identifier.indexOf(':');
  if (colon >= 0) {
    const code = identifier.slice(0, colon), issuer = identifier.slice(colon + 1);
    if (!byteLength(code) || byteLength(code) > 12 || !validStrKey(issuer, 48)) throw new WorkbenchError('ASSET_INVALID', 'Use the exact case-sensitive code (1–12 bytes) and a valid G-address issuer.');
    return { identifier, kind: 'credit', code, issuer, contract: '' };
  }
  if (validStrKey(identifier, 16)) return { identifier, kind: 'contract', code: '', issuer: '', contract: identifier };
  throw new WorkbenchError('ASSET_INVALID', 'Use native for XLM, CODE:ISSUER for a classic asset, or a valid C-address for a Soroban token.');
}

export function identifierFromCatalog(row) {
  if (!isObject(row)) return null;
  try {
    if (row.asset_type === 'native' || (row.asset_type === 'classic' && row.asset_code === 'XLM' && row.issuer_address === '' && row.contract_address === '')) return 'native';
    if (row.asset_type === 'contract' || row.contract_address) return parseAssetIdentifier(row.contract_address).identifier;
    if (row.issuer_address) return parseAssetIdentifier(`${row.asset_code}:${row.issuer_address}`).identifier;
  } catch { /* Preserve unresolvable provider rows for the operator. */ }
  return null;
}

export function validateBaseUrl(value) {
  let url; try { url = new URL(value); } catch { fail('baseUrl must be the provider origin or an explicit local source instance.'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) fail('baseUrl must contain only a service origin, without credentials, a path, query, or fragment.');
  if (url.origin !== PROVIDER_ORIGIN && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) fail('Use the production Prices API origin or http://127.0.0.1 for an original local service instance.');
  return url.origin;
}

function catalogSettings(value = {}) {
  fields(value, ['type', 'search', 'sort', 'order', 'limit', 'min_volume_usd'], 'catalog');
  const out = { type: choice(value.type ?? 'all', ['all', 'classic', 'soroban'], 'catalog.type'), search: text(value.search ?? '', 64, 'catalog.search'), sort: choice(value.sort ?? 'volume_24h', ['volume_24h', 'price', 'change_24h', 'code'], 'catalog.sort'), order: choice(value.order ?? 'desc', ['desc', 'asc'], 'catalog.order'), limit: integer(value.limit ?? 50, 1, 200, 'catalog.limit') };
  const minimum = volume(value.min_volume_usd, 'catalog.min_volume_usd'); if (minimum !== undefined) out.min_volume_usd = minimum;
  return out;
}

export function parseTime(value, label = 'time') {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be an ISO date/time or Unix timestamp.`);
  let result; const input = value.trim();
  if (/^\d+$/u.test(input)) result = Math.floor(Number(input) / (input.length >= 13 ? 1000 : 1));
  else {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/u.exec(input);
    if (!match) fail(`${label} must be an ISO date/time or Unix timestamp.`);
    const [, year, month, day, hour = '00', minute = '00', second = '00', fraction, offset = 'Z'] = match;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59) fail(`${label} contains an invalid date or time.`);
    const zone = /^[+-]\d{4}$/u.test(offset) ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset;
    result = Math.floor(Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ? '.' + fraction : ''}${zone}`) / 1000);
  }
  if (!Number.isSafeInteger(result) || result < 0 || result > 4294967295) fail(`${label} is outside the provider's supported time range.`);
  return result;
}

function historySettings(value = {}) {
  fields(value, ['timeframe', 'granularity', 'base_currency', 'start', 'end'], 'history');
  const out = { timeframe: choice(value.timeframe ?? '7d', Object.keys(TIMEFRAMES), 'history.timeframe'), base_currency: choice(value.base_currency ?? 'USD', ['USD', 'XLM', 'usd', 'xlm'], 'history.base_currency').toUpperCase() };
  if (value.granularity !== undefined && value.granularity !== '' && value.granularity !== null) out.granularity = choice(value.granularity, Object.keys(GRANULARITY_SECONDS), 'history.granularity');
  for (const key of ['start', 'end']) if (value[key] !== undefined && value[key] !== null && value[key] !== '') out[key] = new Date(parseTime(value[key], `history.${key}`) * 1000).toISOString();
  if (out.start && out.end && parseTime(out.start) > parseTime(out.end)) fail('history.start must be at or before history.end.');
  return out;
}

export function normalizeConfiguration(value = {}) {
  fields(value, ['name', 'baseUrl', 'assetIdentifiers', 'catalog', 'history', 'priceMinVolumeUsd', 'requestIntervalMs', 'maxRequestsPerRun', 'maxRetries', 'requestTimeoutMs', 'freshnessSeconds'], 'configuration');
  const assets = value.assetIdentifiers ?? [];
  if (!Array.isArray(assets) || assets.length > 1000) fail('assetIdentifiers must be an array of at most 1000 exact identifiers.');
  const unique = [...new Set(assets.map(asset => parseAssetIdentifier(asset).identifier))];
  return {
    name: text(value.name ?? 'Stellar prices workbench', 160, 'name', { empty: false }).trim(), baseUrl: validateBaseUrl(value.baseUrl ?? PROVIDER_ORIGIN), assetIdentifiers: unique,
    catalog: catalogSettings(value.catalog ?? {}), history: historySettings(value.history ?? { timeframe: '7d', granularity: '1h', base_currency: 'USD' }), priceMinVolumeUsd: volume(value.priceMinVolumeUsd, 'priceMinVolumeUsd') ?? null,
    requestIntervalMs: integer(value.requestIntervalMs ?? 1100, 1000, 60000, 'requestIntervalMs'), maxRequestsPerRun: integer(value.maxRequestsPerRun ?? 250, 1, 10000, 'maxRequestsPerRun'),
    maxRetries: integer(value.maxRetries ?? 3, 0, 8, 'maxRetries'), requestTimeoutMs: integer(value.requestTimeoutMs ?? 30000, 1000, 120000, 'requestTimeoutMs'), freshnessSeconds: integer(value.freshnessSeconds ?? 7200, 1, 2592000, 'freshnessSeconds'),
  };
}

export function historyWindows(settings, now = Date.now()) {
  const h = historySettings(settings); const end = h.end ? parseTime(h.end) : Math.floor(now / 1000);
  const start = h.start ? parseTime(h.start) : Math.max(0, TIMEFRAMES[h.timeframe] === null ? GENESIS : end - TIMEFRAMES[h.timeframe]);
  if (start > end) fail('The historical window starts after it ends.');
  const explicit = Boolean(h.start || h.end);
  const granularity = h.granularity ?? (!explicit && h.timeframe !== 'all' ? DEFAULT_GRANULARITY[h.timeframe] : Object.keys(GRANULARITY_SECONDS).find(key => Math.ceil((end - start) / GRANULARITY_SECONDS[key]) + 1 <= 5000) ?? '1M');
  const step = GRANULARITY_SECONDS[granularity]; const maxSpan = step * 4999; const windows = [];
  for (let cursor = start; cursor <= end;) { const stop = Math.min(end, cursor + maxSpan); windows.push({ start: new Date(cursor * 1000).toISOString(), end: new Date(stop * 1000).toISOString(), granularity, base_currency: h.base_currency, ...(h.timeframe === 'all' ? { timeframe: 'all' } : {}) }); if (stop === end) break; cursor = stop + 1; }
  return { windows, granularity, start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString(), base_currency: h.base_currency, original: h };
}

export function compilePlan(specification, configuration, now = Date.now()) {
  const config = normalizeConfiguration(configuration); const spec = clone(object(specification, 'plan'));
  fields(spec, ['kind', 'name', 'catalog', 'maxPages', 'cursor', 'assets', 'operations', 'history'], 'plan');
  const kind = choice(spec.kind, ['catalog', 'collection', 'coverage', 'health'], 'plan.kind');
  const tasks = [], notices = [];
  const add = (taskKind, request, extra = {}) => { const task = { id: `task-${String(tasks.length + 1).padStart(6, '0')}`, kind: taskKind, request, ...extra }; tasks.push(task); return task; };
  const name = text(spec.name ?? ({ catalog: 'Asset catalog', collection: 'Selected asset collection', coverage: 'Historical coverage', health: 'Provider health' })[kind], 160, 'plan.name', { empty: false }).trim();
  let maximum;
  if (kind === 'catalog') {
    const settings = catalogSettings({ ...config.catalog, ...(spec.catalog ?? {}) });
    if (settings.type === 'soroban' && settings.search) fail('The provider searches classic asset codes only; clear search when listing Soroban tokens.');
    const query = { ...settings }; if (!query.search) delete query.search;
    if (spec.cursor) query.cursor = text(spec.cursor, 8192, 'cursor', { empty: false });
    const maxPages = integer(spec.maxPages ?? 50, 1, 1000, 'maxPages');
    add('catalog', { method: 'GET', path: '/v1/assets', query }, { page: 1 });
    spec.catalog = settings; spec.maxPages = maxPages; maximum = maxPages;
    notices.push('Pagination retains the same filters, sort, and order. A catalog can change while it is being paged.');
  } else if (kind === 'collection') {
    const values = spec.assets ?? config.assetIdentifiers;
    if (!Array.isArray(values) || !values.length || values.length > 1000) fail('Select 1–1000 exact asset identifiers for a collection.');
    const assets = [...new Set(values.map(value => parseAssetIdentifier(value).identifier))];
    const operations = spec.operations ?? ['batch', 'history', 'detail'];
    if (!Array.isArray(operations) || !operations.length || new Set(operations).size !== operations.length) fail('Choose at least one unique collection operation.');
    for (const operation of operations) choice(operation, ['batch', 'price', 'detail', 'history', 'oracles'], 'operation');
    if (operations.includes('batch') && operations.includes('price')) fail('Choose batch prices or individual prices for a collection.');
    if (operations.includes('batch') && config.priceMinVolumeUsd !== null) fail('The batch endpoint has no minimum-volume parameter. Use individual prices for that filter.');
    if (operations.includes('batch')) for (let index = 0; index < assets.length; index += 100) add('batch', { method: 'POST', path: '/v1/prices/batch', query: {}, body: { assets: assets.slice(index, index + 100) } });
    const historical = operations.includes('history') ? historyWindows({ ...config.history, ...(spec.history ?? {}) }, now) : null;
    for (const asset of assets) {
      const encoded = encodeURIComponent(asset);
      if (operations.includes('detail')) add('detail', { method: 'GET', path: `/v1/assets/${encoded}`, query: {} }, { asset });
      if (operations.includes('price')) add('price', { method: 'GET', path: `/v1/assets/${encoded}/price`, query: config.priceMinVolumeUsd === null ? {} : { min_volume_usd: config.priceMinVolumeUsd } }, { asset });
      if (operations.includes('oracles')) add('oracles', { method: 'GET', path: `/v1/oracles/${encoded}`, query: {} }, { asset });
      if (historical) historical.windows.forEach((query, index) => add('history', { method: 'GET', path: `/v1/assets/${encoded}/ohlcv`, query }, { asset, window: index + 1, windows: historical.windows.length }));
    }
    spec.assets = assets; spec.operations = operations; if (historical) { spec.history = historical; notices.push('History windows are fixed at plan creation. Inclusive ranges are split at the native 5000-candle limit without overlapping requests.'); }
    maximum = tasks.length;
  } else add(kind, { method: 'GET', path: kind === 'coverage' ? '/v1/backfill/status' : '/health', query: {} });
  if (tasks.length > 10000) fail('This collection requires more than 10000 requests. Choose a coarser history interval or fewer assets.');
  return { name, kind, specification: spec, configuration: config, createdAt: new Date(now).toISOString(), tasks, requestCount: tasks.length, requestMaximum: maximum ?? tasks.length, notices };
}

let documentPromise;
export async function providerDocument() { documentPromise ??= readFile(new URL('./sources/provider.openapi.json', import.meta.url)).then(bytes => ({ document: JSON.parse(bytes), sha256: digest(bytes), bytes: bytes.length })); return documentPromise; }
const responseSchema = Object.freeze({ catalog: 'AssetListResponse', price: 'PriceResponse', detail: 'AssetDetail', batch: 'BatchResponse', history: 'OhlcvResponse', oracles: 'OraclesResponse', coverage: 'BackfillStatus', health: 'HealthStatus' });

function schemaErrors(value, schema, document, path = '$', depth = 0) {
  if (!schema || depth > 40) return depth > 40 ? [`${path}: response is nested too deeply.`] : [];
  if (schema.$ref) { const target = schema.$ref.split('/').slice(1).reduce((node, key) => node?.[key.replace(/~1/gu, '/').replace(/~0/gu, '~')], document); return target ? schemaErrors(value, target, document, path, depth + 1) : [`${path}: unknown source schema.`]; }
  if (schema.allOf) return schema.allOf.flatMap(item => schemaErrors(value, item, document, path, depth + 1));
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf).some(item => !schemaErrors(value, item, document, path, depth + 1).length) ? [] : [`${path}: no original schema variant matched.`];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (types.length && !types.includes(actual) && !(types.includes('integer') && Number.isSafeInteger(value))) return [`${path}: expected ${types.join(' or ')}.`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: unrecognized provider value.`];
  const errors = [];
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: missing required field.`);
    for (const [key, item] of Object.entries(value)) { const child = schema.properties?.[key] ?? (isObject(schema.additionalProperties) ? schema.additionalProperties : null); if (child) errors.push(...schemaErrors(item, child, document, `${path}.${key}`, depth + 1)); }
  } else if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few entries.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many entries.`);
    for (let index = 0; index < value.length && errors.length < 30; index++) errors.push(...schemaErrors(value[index], schema.items, document, `${path}[${index}]`, depth + 1));
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || (types.includes('integer') && !Number.isSafeInteger(value))) errors.push(`${path}: integer or number cannot be represented safely.`);
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below original minimum.`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above original maximum.`);
  }
  return errors.slice(0, 30);
}

export async function validateProviderResponse(kind, value) {
  const { document, sha256 } = await providerDocument();
  const schema = document.components?.schemas?.[responseSchema[kind]];
  const errors = schema ? schemaErrors(value, schema, document) : ['The requested operation is absent from the retained provider contract.'];
  return { valid: errors.length === 0, errors, contractSha256: sha256 };
}
