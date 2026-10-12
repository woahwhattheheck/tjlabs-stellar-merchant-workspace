// MIT. SeaTable joins the original retained plan, review, version and buyer engine.
import { join } from 'node:path';
import { loadCsvDataset } from '../../dataset-handler.mjs';
import { csvLine } from '../../postgres/publisher/plan.mjs';
import { datasetExtractionOptions } from '../../postgres/publisher/stream.mjs';
import { object, bytes, digest, identity, createFile, fault } from '../../postgres/publisher/files.mjs';
import { responseKind } from '../http.mjs';
import { only, integer, HASH, readSeaTableSourceFile } from '../declaration.mjs';
import { readSeaTableCapture, bindSeaTableCapture, copySeaTableCapture } from '../capture.mjs';
import { inspectSeaTableSource, openSeaTableSourceFile, checkSeaTableColumnTypes, encodeSeaTableRow } from '../source.mjs';

export async function captureSeaTablePublicationPlan(sourceFile, directory, input) {
  only(input, ['title', 'query', 'input', 'dataset', 'extraction', 'sourceHash'], 'INVALID_PUBLICATION_PLAN');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 128) throw fault('PLAN_TITLE_REQUIRED');
  const selected = await readSeaTableSourceFile(sourceFile);
  if (selected.hash !== input.sourceHash) throw fault('SOURCE_REVIEW_CHANGED', 'Reload the source before saving this plan.', 409);
  const query = selected.queries[input.query];
  if (!query) throw fault('QUERY_NOT_FOUND');
  if (!object(input.input ?? {}) || Object.keys(input.input ?? {}).length) throw fault('SEATABLE_QUERY_INPUT_NOT_SUPPORTED');
  const extraction = datasetExtractionOptions(query, input.extraction);
  only(input.dataset, ['name', 'columns', 'filters', 'ranges', 'sorts', 'maxCellChars', 'defaultLimit', 'maxLimit', 'maxPageBytes'], 'INVALID_DATASET_PLAN');
  if (!object(input.dataset.columns) || !Object.keys(input.dataset.columns).length ||
      Object.keys(input.dataset.columns).some(name => !query.columns.includes(name))) throw fault('DATASET_COLUMN_NOT_IN_QUERY');
  const columns = Object.fromEntries(Object.entries(input.dataset.columns).map(([name, spec]) => {
    const value = typeof spec === 'string' ? { type: spec, nullable: false } : spec;
    only(value, ['type', 'nullable'], 'INVALID_DATASET_COLUMN');
    return [name, { type: value.type, nullable: value.nullable ?? false }];
  }));
  checkSeaTableColumnTypes(columns, Object.entries(query.projection).map(([name, spec]) => ({ name, type: spec.type })));
  const dataset = { schema: 'stellar-forge.csv-dataset.v1', file: 'data.csv', name: input.dataset.name, columns,
    filters: input.dataset.filters ?? [], ranges: input.dataset.ranges ?? [], sorts: input.dataset.sorts ?? [],
    maxBytes: extraction.maxBytes, maxRows: extraction.maxRows,
    maxCellChars: integer(input.dataset.maxCellChars ?? 65536, 1, 1048576, 'DATASET_CELL_SIZE_INVALID'),
    defaultLimit: input.dataset.defaultLimit ?? 50, maxLimit: input.dataset.maxLimit ?? 250,
    maxPageBytes: input.dataset.maxPageBytes ?? 921600 };
  await createFile(join(directory, 'schema.csv'), csvLine(Object.keys(columns)));
  await loadCsvDataset({ ...dataset, file: join(directory, 'schema.csv') });
  const runtime = structuredClone(selected.config); let retainedCapture = null;
  if (selected.captureFile) {
    const capture = await readSeaTableCapture(selected.captureFile, selected.config.connection.sha256);
    bindSeaTableCapture(capture, selected.config);
    await copySeaTableCapture(capture, join(directory, 'capture'));
    runtime.connection.file = 'capture/capture.json';
    retainedCapture = { manifestSha256: capture.manifestSha256, selectionSha256: capture.manifest.selectionSha256,
      schemaSha256: capture.manifest.schemaSha256, sourceBytes: capture.manifest.sourceBytes,
      rowCount: capture.manifest.rowCount, pageCount: capture.manifest.pageCount,
      startedAt: capture.manifest.startedAt, completedAt: capture.manifest.completedAt, transport: capture.manifest.transport };
  }
  const runtimeBytes = bytes(runtime);
  await createFile(join(directory, 'original-source.json'), selected.original);
  await createFile(join(directory, 'source.json'), runtimeBytes);
  const value = { schema: 'stellar-forge.seatable-dataset-plan.v1', title: input.title.trim(), query: input.query, input: {},
    dataset, extraction, sourceHash: selected.hash, sourceBytes: selected.original.length,
    runtimeSourceHash: digest(runtimeBytes), queryHash: identity(query), retainedCapture,
    sourceQuery: { sql: query.sql, columns: query.columns, parameters: {}, projection: query.projection,
      selection: selected.binding, responseKind: responseKind(selected.binding), atomicSourceSnapshot: false } };
  value.digest = identity(value); await createFile(join(directory, 'plan.json'), bytes(value));
  return value;
}
export const seaTablePublisherDriver = Object.freeze({
  sourceName: 'SeaTable', workspaceSchema: 'stellar-forge.seatable-publisher-workspace.v1',
  statusSchema: 'stellar-forge.seatable-publisher-status.v1', candidateSchema: 'stellar-forge.seatable-dataset-candidate.v1',
  capturePlan: captureSeaTablePublicationPlan, inspectSource: inspectSeaTableSource, openSource: openSeaTableSourceFile,
  checkColumnTypes: checkSeaTableColumnTypes, encodeRow: encodeSeaTableRow,
  validateExtraction: record => record?.schema === 'stellar-forge.seatable-dataset-extraction.v1' &&
    record.valueEncoding === 'seatable-v2-explicit-scalars' && record.nullEncoding === 'json-null' &&
    record.observation?.schema === 'stellar-forge.seatable-records-observation.v1' &&
    ['PAGED_SQL_READ', 'PAGED_VIEW_READ'].includes(record.observation.kind) && record.observation.atomicSourceSnapshot === false &&
    record.observation.readOnly === true && record.observation.capture?.provider === 'seatable' &&
    record.observation.capture.apiVersion === 'v2' && record.observation.capture.responseKind === record.observation.kind &&
    record.observation.capture.method === (record.observation.kind === 'PAGED_SQL_READ' ? 'POST' : 'GET') &&
    record.observation.capture.transport === 'seatable-rest' && record.observation.capture.complete === true && record.observation.capture.countVerified === (record.observation.kind === 'PAGED_SQL_READ') &&
    record.observation.capture.readOnly === true && record.observation.capture.atomicSourceSnapshot === false &&
    HASH.test(record.observation.capture.selectionSha256 ?? '') && HASH.test(record.observation.capture.schemaSha256 ?? '') &&
    HASH.test(record.observation.capture.recordIdentitiesSha256 ?? '') && HASH.test(record.observation.capture.manifestSha256 ?? '') &&
    Number.isSafeInteger(record.rowCount) && record.rowCount >= 0 && record.rowCount === record.observation.capture.rowCount &&
    Number.isSafeInteger(record.observation.capture.pageCount) && record.observation.capture.pageCount >= 1,
});
