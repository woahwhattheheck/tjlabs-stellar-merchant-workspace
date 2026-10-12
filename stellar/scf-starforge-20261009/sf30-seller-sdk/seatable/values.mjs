// MIT. Retain provider JSON number lexemes before JavaScript can round them.
import { object, identity, fault } from '../postgres/publisher/files.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';

export class SeaTableNumber {
  constructor(text) { this.text = text; Object.freeze(this); }
}
export function parseSeaTableJSON(buffer) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer), (key, value, context) => {
      if (typeof value !== 'number') return value;
      if (typeof context?.source !== 'string') throw fault('SEATABLE_LOSSLESS_JSON_RUNTIME_REQUIRED', 'Use Node.js 24 or a supported JSON.parse source-context runtime.');
      return new SeaTableNumber(context.source);
    });
  } catch (issue) { if (issue.code) throw issue; throw fault('SEATABLE_RESPONSE_JSON_INVALID'); }
}
export function parseSeaTableRecords(buffer, mode) {
  const response = parseSeaTableJSON(buffer);
  if (!object(response) || !['sql', 'view'].includes(mode)) throw fault('SEATABLE_RECORDS_RESPONSE_INVALID');
  if (mode === 'sql' && response.success !== true) throw fault('SEATABLE_SQL_READ_FAILED');
  const rows = mode === 'sql' ? response.results : response.rows;
  if (!Array.isArray(rows) || rows.length > (mode === 'sql' ? 10000 : 1000)) throw fault('SEATABLE_RECORDS_RESPONSE_INVALID');
  const records = rows.map(row => {
    if (!object(row) || typeof row._id !== 'string' || !row._id.length || row._id.length > 256 ||
        Object.keys(row).length > 10000) throw fault('SEATABLE_RECORD_INVALID');
    return { id: row._id, fields: row };
  });
  return { records, metadata: response.metadata ?? null };
}
export function parseSeaTableCount(buffer) {
  const response = parseSeaTableJSON(buffer);
  if (!object(response) || response.success !== true || !Array.isArray(response.results) ||
      response.results.length !== 1 || !object(response.results[0])) throw fault('SEATABLE_COUNT_RESPONSE_INVALID');
  const row = response.results[0], value = row.__sf_count;
  if (Object.keys(row).length !== 1 || !(value instanceof SeaTableNumber) ||
      !/^(?:0|[1-9]\d*)$/.test(value.text)) throw fault('SEATABLE_COUNT_RESPONSE_INVALID');
  const result = Number(value.text);
  if (!Number.isSafeInteger(result)) throw fault('SEATABLE_COUNT_TOO_LARGE');
  return result;
}
function canonicalNumber(text) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw fault('SEATABLE_JSON_NUMBER_INVALID');
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
  let exponent = BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length);
  if (!digits) return '0';
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
  if (trailing) { digits = digits.slice(0, -trailing); exponent += BigInt(trailing); }
  return match[1] + digits + 'e' + exponent;
}
export const recordIdentity = row => 'string:' + row.id;
export function identityDigest(records) {
  return identity(records.map(recordIdentity));
}
export function projectedSeaTableValue(row, spec) {
  if (spec.source !== '$recordId' && !Object.hasOwn(row.fields, spec.source))
    throw fault('SEATABLE_SELECTED_FIELD_MISSING', 'A selected field is absent, possibly hidden in the view. Review the actual field/view selection; absence is not null.');
  let value = spec.source === '$recordId' ? row.id : row.fields[spec.source];
  if (value === '' && spec.empty === 'null') value = null;
  if (value === null) {
    if (!spec.nullable) throw fault('DATASET_NULL_NOT_ALLOWED');
    return null;
  }
  if (spec.encoding === 'identity-text') {
    if (typeof value === 'string') return value;
    if (value instanceof SeaTableNumber) return value.text;
    throw fault('SEATABLE_IDENTITY_VALUE_INVALID');
  }
  if (spec.encoding === 'number-text') {
    if (!(value instanceof SeaTableNumber)) throw fault('SEATABLE_NUMBER_TOKEN_REQUIRED', 'The reviewed number-text encoding requires a provider JSON number, not a numeric-looking string.');
    return value.text;
  }
  if (value instanceof SeaTableNumber) {
    if (!['integer', 'number'].includes(spec.type)) throw fault('SEATABLE_NATIVE_TYPE_CHANGED');
    const number = Number(value.text);
    if (!Number.isFinite(number) || Number.isInteger(number) && !Number.isSafeInteger(number) ||
        spec.type === 'integer' && !Number.isSafeInteger(number) ||
        canonicalNumber(value.text) !== canonicalNumber(String(number)))
      throw fault('SEATABLE_NUMBER_PRECISION_LOSS', 'Choose explicit number-text encoding and a Text dataset column to preserve the exact provider JSON number.');
    return number;
  }
  if (spec.type === 'string' && typeof value === 'string' || spec.type === 'boolean' && typeof value === 'boolean') return value;
  throw fault('SEATABLE_NATIVE_TYPE_CHANGED', 'The actual field value does not match its reviewed scalar type. Review the source without automatic string, date or number conversion.');
}
export function scalarText(value, spec) {
  if (value === null) { if (!spec.nullable) throw fault('DATASET_NULL_NOT_ALLOWED'); return ''; }
  if (spec.type === 'string' && typeof value !== 'string' || spec.type === 'boolean' && typeof value !== 'boolean' ||
      spec.type === 'integer' && !Number.isSafeInteger(value) ||
      spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    throw fault('SEATABLE_PROJECTED_VALUE_INVALID');
  const text = String(value);
  if (!text.length && spec.nullable)
    throw fault('DATASET_EMPTY_NULL_CONFLICT', 'Choose explicit empty-to-null or a non-nullable Text column.');
  return text;
}
export function encodeSeaTableRow(row, dataset) {
  return csvLine(Object.entries(dataset.columns).map(([name, spec]) => {
    const text = scalarText(row[name], spec);
    if (text.length > dataset.maxCellChars) throw fault('DATASET_CELL_TOO_LARGE');
    return text;
  }));
}
export function checkSeaTableColumnTypes(columns, types) {
  if (!Array.isArray(types)) throw fault('SEATABLE_COLUMN_TYPES_MISSING');
  for (const [name, spec] of Object.entries(columns)) {
    const selected = types.find(column => column.name === name);
    if (!selected || selected.type !== spec.type) throw fault('SEATABLE_COLUMN_TYPE_MISMATCH', 'Use the reviewed type for ' + name + '.');
  }
}
