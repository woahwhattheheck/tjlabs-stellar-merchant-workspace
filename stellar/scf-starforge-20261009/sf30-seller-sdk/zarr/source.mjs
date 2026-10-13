// MIT. Reviewed native Zarr values join the original dataset publisher.
import { setImmediate } from 'node:timers/promises';
import { object, readPrivate, digest, identity, fault } from '../postgres/publisher/files.mjs';
import { datasetExtractionOptions } from '../postgres/publisher/stream.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';

export const ZARR_SOURCE_MAX_BYTES = 64 * 1024 * 1024;
export const HASH = /^[a-f0-9]{64}$/;
export function only(value, keys, code = 'ZARR_SOURCE_FIELDS') {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw fault(code);
}
export function integer(value, low, high, code) {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw fault(code);
  return value;
}
function vector(value, code) {
  if (!Array.isArray(value) || value.length > 64 || value.some(item => !Number.isSafeInteger(item) || item < 0)) throw fault(code);
  return value;
}
function text(value, maximum, code, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > maximum || value.includes('\0')) throw fault(code);
  return value;
}
const scalarType = type => type === 'text' ? 'string' : type;
function scalar(value, spec) {
  if (value === null || spec.type === 'string' && typeof value !== 'string' ||
      spec.type === 'boolean' && typeof value !== 'boolean' ||
      spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)))
    throw fault('ZARR_FROZEN_VALUE_TYPE', 'Use the exact reviewed non-null scalar representation.');
  return value;
}
export function checkZarrColumnTypes(columns, types) {
  if (!object(columns) || !Array.isArray(types)) throw fault('ZARR_COLUMN_TYPES_REQUIRED');
  for (const [name, spec] of Object.entries(columns)) {
    const selected = types.find(item => item.name === name);
    if (!selected || selected.type !== spec.type) throw fault('ZARR_COLUMN_TYPE_CHANGED', 'Use the reviewed original dataset type for ' + name + '.');
  }
}
export function scalarZarrText(value, spec) {
  const selected = scalar(value, spec), result = String(selected);
  if (!result.length && spec.nullable) throw fault('DATASET_EMPTY_NULL_CONFLICT', 'A real empty string needs a non-nullable Text column.');
  return result;
}
export function encodeZarrRow(row, dataset) {
  return csvLine(Object.entries(dataset.columns).map(([name, spec]) => {
    const value = scalarZarrText(row[name], spec);
    if (value.length > dataset.maxCellChars) throw fault('DATASET_CELL_TOO_LARGE');
    return value;
  }));
}
function readShape(config) {
  const source = vector(config.origin.sourceShape, 'ZARR_SOURCE_SHAPE');
  const shape = vector(config.origin.shape, 'ZARR_RESULT_SHAPE');
  if (!Array.isArray(config.origin.selection) || config.origin.selection.length !== source.length) throw fault('ZARR_SELECTION_CHANGED');
  const counts = [], axes = [];
  config.origin.selection.forEach((value, index) => {
    if (Number.isSafeInteger(value)) {
      integer(value, 0, source[index] - 1, 'ZARR_SELECTION_CHANGED'); axes.push({ index: value });
    } else {
      only(value, ['start', 'stop', 'step'], 'ZARR_SELECTION_CHANGED');
      const start = integer(value.start ?? 0, 0, source[index], 'ZARR_SELECTION_CHANGED');
      const stop = integer(value.stop ?? source[index], start, source[index], 'ZARR_SELECTION_CHANGED');
      const step = integer(value.step ?? 1, 1, Number.MAX_SAFE_INTEGER, 'ZARR_SELECTION_CHANGED');
      const count = Math.ceil((stop - start) / step);
      counts.push(count); axes.push({ start, step, count });
    }
  });
  if (JSON.stringify(counts) !== JSON.stringify(shape)) throw fault('ZARR_RESULT_SHAPE');
  const size = counts.reduce((total, value) => total * value, 1);
  if (!Number.isSafeInteger(size) || size !== config.origin.rowCount) throw fault('ZARR_RESULT_COUNT_CHANGED');
  return { source, shape, axes, size };
}
function rowIndices(ordinal, axes) {
  const indices = new Array(axes.length);
  for (let index = axes.length - 1; index >= 0; index--) {
    const axis = axes[index];
    if (Object.hasOwn(axis, 'index')) indices[index] = axis.index;
    else {
      indices[index] = axis.start + ordinal % axis.count * axis.step;
      ordinal = Math.floor(ordinal / axis.count);
    }
  }
  return indices;
}
export async function readZarrSourceFile(filename) {
  const original = await readPrivate(filename, ZARR_SOURCE_MAX_BYTES);
  let config;
  try {
    config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original), (key, value) => {
      // Native float values intentionally retain IEEE-754 semantics. Source
      // dimensions, coordinates and all other integer metadata must remain exact.
      if (typeof value === 'number' && (!Number.isFinite(value) ||
          key !== 'value' && Number.isInteger(value) && !Number.isSafeInteger(value)))
        throw fault('ZARR_SOURCE_NUMBER_PRECISION', 'Use exact source metadata within the selected runtime integer range.');
      return value;
    });
  } catch (issue) { if (issue.code) throw issue; throw fault('ZARR_FROZEN_SOURCE_JSON'); }
  only(config, ['schema', 'title', 'query', 'columns', 'rows', 'origin', 'review']);
  if (config.schema !== 'stellar-forge.zarr-dataset-source.v1' || config.query !== 'selected') throw fault('ZARR_FROZEN_SOURCE_SCHEMA');
  text(config.title, 200, 'ZARR_SOURCE_TITLE');
  only(config.columns, ['row_id', 'ordinal', 'source_index', 'value']);
  const nativeColumns = config.columns;
  if (Object.keys(nativeColumns).length !== 4) throw fault('ZARR_FROZEN_COLUMNS');
  for (const [name, spec] of Object.entries(nativeColumns)) {
    only(spec, ['type', 'nullable']);
    if (spec.nullable !== false || !['text', 'number', 'boolean'].includes(spec.type) ||
        ['row_id', 'source_index'].includes(name) && spec.type !== 'text' ||
        name === 'ordinal' && spec.type !== 'number') throw fault('ZARR_FROZEN_COLUMNS');
  }
  const projection = Object.fromEntries(Object.entries(nativeColumns).map(([name, spec]) =>
    [name, { type: scalarType(spec.type), nullable: false }]));
  only(config.origin, ['provider', 'engine', 'sourceId', 'sourceSha256', 'resultId', 'resultSha256',
    'array', 'dtype', 'shape', 'selection', 'sourceShape', 'rowCount']);
  if (config.origin.provider !== 'zarr-python' || config.origin.engine?.provider !== 'zarr-python' ||
      config.origin.engine.version !== '3.4.1' ||
      ['sourceId', 'sourceSha256', 'resultId', 'resultSha256'].some(key => !HASH.test(config.origin[key] ?? '')))
    throw fault('ZARR_FROZEN_ORIGIN');
  text(config.origin.array, 2048, 'ZARR_SOURCE_ARRAY', true); text(config.origin.dtype, 128, 'ZARR_SOURCE_DTYPE');
  if (config.origin.array.startsWith('/') || config.origin.array.includes('\\') ||
      config.origin.array.split('/').some(value => value === '..' || value === '.')) throw fault('ZARR_SOURCE_ARRAY');
  integer(config.origin.rowCount, 0, 1000000, 'ZARR_RESULT_COUNT_CHANGED');
  const selectedShape = readShape(config);
  only(config.review, ['id', 'createdAt', 'resultId', 'contentSha256', 'decision', 'comment']);
  if (!HASH.test(config.review.id ?? '') || config.review.resultId !== config.origin.resultId ||
      config.review.contentSha256 !== config.origin.resultSha256 || config.review.decision !== 'accepted')
    throw fault('ZARR_ACCEPTED_REVIEW_REQUIRED');
  text(config.review.comment, 4000, 'ZARR_REVIEW_COMMENT'); text(config.review.createdAt, 64, 'ZARR_REVIEW_DATE');
  if (!Array.isArray(config.rows) || config.rows.length !== selectedShape.size) throw fault('ZARR_RESULT_COUNT_CHANGED');
  for (let index = 0; index < config.rows.length; index++) {
    const row = config.rows[index];
    only(row, ['row_id', 'ordinal', 'source_index', 'value']);
    if (Object.keys(row).length !== 4 || row.ordinal !== index ||
        row.row_id !== config.origin.resultSha256 + ':' + index ||
        row.source_index !== JSON.stringify(rowIndices(index, selectedShape.axes)))
      throw fault('ZARR_FROZEN_ROW_IDENTITY');
    for (const [name, spec] of Object.entries(projection)) scalar(row[name], spec);
  }
  const query = { sql: null, columns: Object.keys(projection), parameters: {}, parameterOrder: [],
    projection, source: structuredClone(config.origin) };
  return { filename, original, hash: digest(original), config, queries: { selected: query } };
}
export async function inspectZarrSource(filename) {
  const selected = await readZarrSourceFile(filename), query = selected.queries.selected;
  return { hash: selected.hash, bytes: selected.original.length, sourceName: 'Zarr',
    connectionKind: 'retained-frozen-source', source: structuredClone(selected.config.origin),
    observation: { kind: 'RETAINED_TYPED_ARRAY_SELECTION', readOnly: true, complete: true,
      sourceHash: selected.hash, sourceRows: selected.config.rows.length, reviewId: selected.config.review.id },
    queries: { selected: { ...query,
      columnTypes: Object.entries(query.projection).map(([name, spec]) => ({ name, ...spec })) } } };
}
export async function openZarrSourceFile(filename) {
  const selected = await readZarrSourceFile(filename), query = selected.queries.selected;
  const types = Object.entries(query.projection).map(([name, spec]) => ({ name, type: spec.type }));
  const lifetime = new AbortController(); let closed = false, active = false;
  return { source: {
    inspect: () => ({ columnTypes: { selected: structuredClone(types) } }),
    async exportDataset(name, input = {}, supplied = {}) {
      if (closed) throw fault('ZARR_SOURCE_CLOSED');
      if (active) throw fault('ZARR_SOURCE_BUSY');
      if (name !== 'selected') throw fault('QUERY_NOT_FOUND');
      only(input, [], 'ZARR_QUERY_PARAMETERS_UNAVAILABLE');
      const { signal, onRow, ...declared } = supplied;
      const options = datasetExtractionOptions(query, declared);
      if (typeof onRow !== 'function') throw fault('ZARR_ROW_CONSUMER_REQUIRED');
      const timeout = AbortSignal.timeout(options.timeoutMs);
      const signalAll = AbortSignal.any([lifetime.signal, timeout, ...(signal ? [signal] : [])]);
      const ensure = () => { if (signalAll.aborted) throw fault(timeout.aborted ? 'ZARR_EXTRACTION_TIMEOUT' : 'ZARR_EXTRACTION_CANCELLED'); };
      active = true;
      try {
        ensure();
        if (selected.config.rows.length > options.maxRows) throw fault('DATASET_EXTRACTION_TOO_MANY_ROWS');
        let sourceTextBytes = 0;
        const rows = [];
        for (let index = 0; index < selected.config.rows.length; index++) {
          ensure(); if (index % 256 === 0) { await setImmediate(); ensure(); }
          const row = selected.config.rows[index];
          const rowBytes = Object.entries(query.projection).reduce((total, [name, spec]) =>
            total + Buffer.byteLength(scalarZarrText(row[name], spec)), 0);
          sourceTextBytes += rowBytes;
          if (rowBytes > options.maxRowBytes) throw fault('DATASET_EXTRACTION_ROW_TOO_LARGE');
          if (sourceTextBytes > options.maxBytes) throw fault('DATASET_EXTRACTION_TOO_MANY_BYTES');
          rows.push({ row, ordinal: index });
        }
        rows.sort((left, right) => {
          for (const order of options.order) {
            const a = left.row[order.column], b = right.row[order.column];
            if (a !== b) return (a < b ? -1 : 1) * (order.direction === 'asc' ? 1 : -1);
          }
          return left.ordinal - right.ordinal;
        });
        for (let index = 0; index < rows.length; index++) {
          ensure(); await onRow(rows[index].row, types, { rowCount: index + 1, sourceTextBytes }); ensure();
        }
        return { schema: 'stellar-forge.zarr-dataset-extraction.v1', query: name, rowCount: rows.length,
          sourceTextBytes, columns: query.columns, columnTypes: types, order: options.order,
          valueEncoding: 'zarr-reviewed-native-scalars', nullEncoding: 'non-null',
          observation: { schema: 'stellar-forge.zarr-frozen-observation.v1', kind: 'RETAINED_TYPED_ARRAY_SELECTION',
            readOnly: true, complete: true, sourceHash: selected.hash, sourceBytes: selected.original.length,
            rowCount: rows.length, reviewId: selected.config.review.id, origin: structuredClone(selected.config.origin) } };
      } finally { active = false; }
    },
    close() { closed = true; lifetime.abort(); }
  } };
}
