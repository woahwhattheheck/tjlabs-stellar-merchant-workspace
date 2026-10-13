// MIT. Source-qualified Zarr plans use the original publisher and dataset loader.
import { join } from 'node:path';
import { loadCsvDataset } from '../../dataset-handler.mjs';
import { csvLine } from '../../postgres/publisher/plan.mjs';
import { datasetExtractionOptions } from '../../postgres/publisher/stream.mjs';
import { object, bytes, digest, identity, createFile, fault } from '../../postgres/publisher/files.mjs';
import { only, integer, HASH, ZARR_SOURCE_MAX_BYTES, readZarrSourceFile,
  inspectZarrSource, openZarrSourceFile, checkZarrColumnTypes, encodeZarrRow } from '../source.mjs';

export async function captureZarrPublicationPlan(sourceFile, directory, input) {
  only(input, ['title', 'query', 'input', 'dataset', 'extraction', 'sourceHash'], 'INVALID_PUBLICATION_PLAN');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 128) throw fault('PLAN_TITLE_REQUIRED');
  const selected = await readZarrSourceFile(sourceFile), query = selected.queries[input.query];
  if (selected.hash !== input.sourceHash) throw fault('SOURCE_REVIEW_CHANGED', 'Reload the exact frozen source before saving this plan.', 409);
  if (!query) throw fault('QUERY_NOT_FOUND');
  only(input.input ?? {}, [], 'ZARR_QUERY_PARAMETERS_UNAVAILABLE');
  const extraction = datasetExtractionOptions(query, input.extraction);
  only(input.dataset, ['name', 'columns', 'filters', 'ranges', 'sorts', 'maxCellChars',
    'defaultLimit', 'maxLimit', 'maxPageBytes'], 'INVALID_DATASET_PLAN');
  if (!object(input.dataset.columns) || !Object.keys(input.dataset.columns).length ||
      Object.keys(input.dataset.columns).some(name => !query.columns.includes(name))) throw fault('DATASET_COLUMN_NOT_IN_QUERY');
  const columns = Object.fromEntries(Object.entries(input.dataset.columns).map(([name, spec]) => {
    const value = typeof spec === 'string' ? { type: spec, nullable: false } : spec;
    only(value, ['type', 'nullable'], 'INVALID_DATASET_COLUMN');
    return [name, { type: value.type, nullable: value.nullable ?? false }];
  }));
  checkZarrColumnTypes(columns, Object.entries(query.projection).map(([name, spec]) => ({ name, type: spec.type })));
  const dataset = { schema: 'stellar-forge.csv-dataset.v1', file: 'data.csv', name: input.dataset.name, columns,
    filters: input.dataset.filters ?? [], ranges: input.dataset.ranges ?? [], sorts: input.dataset.sorts ?? [],
    maxBytes: extraction.maxBytes, maxRows: extraction.maxRows,
    maxCellChars: integer(input.dataset.maxCellChars ?? 65536, 1, 1048576, 'DATASET_CELL_SIZE_INVALID'),
    defaultLimit: input.dataset.defaultLimit ?? 50, maxLimit: input.dataset.maxLimit ?? 250,
    maxPageBytes: input.dataset.maxPageBytes ?? 921600 };
  await createFile(join(directory, 'schema.csv'), csvLine(Object.keys(columns)));
  await loadCsvDataset({ ...dataset, file: join(directory, 'schema.csv') });
  // The original file is already a complete immutable reviewed projection.
  // Both original-source and runtime source retain these exact bytes.
  await createFile(join(directory, 'original-source.json'), selected.original);
  await createFile(join(directory, 'source.json'), selected.original);
  const value = { schema: 'stellar-forge.zarr-dataset-plan.v1', title: input.title.trim(),
    query: input.query, input: {}, dataset, extraction, sourceHash: selected.hash,
    sourceBytes: selected.original.length, runtimeSourceHash: digest(selected.original), queryHash: identity(query),
    sourceQuery: { sql: null, columns: query.columns, parameters: {}, projection: query.projection,
      origin: selected.config.origin, review: selected.config.review } };
  value.digest = identity(value);
  await createFile(join(directory, 'plan.json'), bytes(value));
  return value;
}
export const zarrPublisherDriver = Object.freeze({
  sourceName: 'Zarr', workspaceSchema: 'stellar-forge.zarr-publisher-workspace.v1',
  statusSchema: 'stellar-forge.zarr-publisher-status.v1', candidateSchema: 'stellar-forge.zarr-dataset-candidate.v1',
  maxSourceBytes: ZARR_SOURCE_MAX_BYTES,
  capturePlan: captureZarrPublicationPlan, inspectSource: inspectZarrSource, openSource: openZarrSourceFile,
  checkColumnTypes: checkZarrColumnTypes, encodeRow: encodeZarrRow,
  validateExtraction: value => value?.schema === 'stellar-forge.zarr-dataset-extraction.v1' &&
    value.valueEncoding === 'zarr-reviewed-native-scalars' && value.nullEncoding === 'non-null' &&
    value.observation?.schema === 'stellar-forge.zarr-frozen-observation.v1' &&
    value.observation.kind === 'RETAINED_TYPED_ARRAY_SELECTION' && value.observation.readOnly === true &&
    value.observation.complete === true && HASH.test(value.observation.sourceHash ?? '') &&
    HASH.test(value.observation.reviewId ?? '') && value.observation.origin?.provider === 'zarr-python' &&
    value.observation.origin.engine?.version === '3.4.1' &&
    ['sourceId', 'sourceSha256', 'resultId', 'resultSha256'].every(key => HASH.test(value.observation.origin[key] ?? '')) &&
    Number.isSafeInteger(value.rowCount) && value.rowCount >= 0 &&
    value.rowCount === value.observation.rowCount && value.rowCount === value.observation.origin.rowCount,
});
