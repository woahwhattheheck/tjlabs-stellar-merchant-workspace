// MIT. Complete Grist observations feed the original durable publisher.
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { object, privateDirectory, fault } from '../postgres/publisher/files.mjs';
import { datasetExtractionOptions } from '../postgres/publisher/stream.mjs';
import { responseKind } from './http.mjs';
import { readGristSourceFile } from './declaration.mjs';
import { readGristCapture, bindGristCapture, captureGristSource } from './capture.mjs';
import { projectedGristValue, scalarText, checkGristColumnTypes, encodeGristRow } from './values.mjs';
export { checkGristColumnTypes, encodeGristRow };

const description = (query, selection) => ({ sql: query.sql, columns: query.columns, parameters: {}, parameterOrder: [],
  columnTypes: Object.entries(query.projection).map(([name, spec]) => ({ name, type: spec.type, nullable: spec.nullable })),
  source: { projection: query.projection, responseKind: responseKind(selection), atomicSourceSnapshot: false } });
export async function inspectGristSource(filename) {
  const selected = await readGristSourceFile(filename); let observation = null;
  if (selected.captureFile) {
    const capture = await readGristCapture(selected.captureFile, selected.config.connection.sha256);
    bindGristCapture(capture, selected.config);
    observation = { ...capture.manifest, manifestSha256: capture.manifestSha256 };
  }
  return { hash: selected.hash, bytes: selected.original.length, sourceName: 'Grist',
    connectionKind: selected.config.connection.kind, source: selected.binding, observation,
    queries: Object.fromEntries(Object.entries(selected.queries).map(([name, query]) => [name, description(query, selected.binding)])) };
}
export async function openGristSourceFile(filename, { env = process.env } = {}) {
  const selected = await readGristSourceFile(filename);
  const retained = selected.captureFile ? await readGristCapture(selected.captureFile, selected.config.connection.sha256) : null;
  if (retained) bindGristCapture(retained, selected.config);
  let closed = false, active = false; const lifetime = new AbortController();
  const types = Object.fromEntries(Object.entries(selected.queries).map(([name, query]) =>
    [name, Object.entries(query.projection).map(([name, spec]) => ({ name, type: spec.type }))]));
  return { source: {
    inspect: () => ({ columnTypes: structuredClone(types) }),
    async exportDataset(name, input = {}, supplied = {}) {
      if (closed) throw fault('GRIST_SOURCE_CLOSED');
      if (active) throw fault('GRIST_SOURCE_BUSY');
      const query = selected.queries[name];
      if (!query) throw fault('QUERY_NOT_FOUND');
      if (!object(input) || Object.keys(input).length) throw fault('GRIST_QUERY_INPUT_NOT_SUPPORTED');
      const { signal, onRow, ...declared } = supplied, options = datasetExtractionOptions(query, declared);
      if (typeof onRow !== 'function') throw fault('GRIST_ROW_CONSUMER_REQUIRED');
      const timeout = AbortSignal.timeout(options.timeoutMs);
      const abort = AbortSignal.any([lifetime.signal, timeout, ...(signal ? [signal] : [])]);
      const ensure = () => { if (abort.aborted) throw fault(timeout.aborted ? 'GRIST_EXTRACTION_TIMEOUT' : 'GRIST_EXTRACTION_CANCELLED'); };
      active = true;
      try {
        ensure(); let capture = retained;
        if (!capture) {
          const root = join(dirname(filename), 'captures'); await privateDirectory(root, true);
          const config = structuredClone(selected.config);
          config.connection.maxRows = Math.min(config.connection.maxRows ?? 1000000, options.maxRows);
          capture = await captureGristSource(config, join(root, randomUUID()), { env, signal: abort }); ensure();
        }
        const records = bindGristCapture(capture, selected.config);
        if (records.length > options.maxRows) throw fault('DATASET_EXTRACTION_TOO_MANY_ROWS');
        const rows = []; let sourceTextBytes = 0;
        for (let index = 0; index < records.length; index++) {
          ensure(); if (index % 256 === 0) { await setImmediate(); ensure(); }
          const row = Object.fromEntries(Object.entries(query.projection).map(([alias, spec]) =>
            [alias, projectedGristValue(records[index], spec)]));
          let rowBytes = 0;
          for (const [alias, spec] of Object.entries(query.projection)) rowBytes += Buffer.byteLength(scalarText(row[alias], spec));
          sourceTextBytes += rowBytes;
          if (rowBytes > options.maxRowBytes) throw fault('DATASET_EXTRACTION_ROW_TOO_LARGE');
          if (sourceTextBytes > options.maxBytes) throw fault('DATASET_EXTRACTION_TOO_MANY_BYTES');
          rows.push({ row, ordinal: index });
        }
        rows.sort((left, right) => {
          for (const item of options.order) {
            const a = left.row[item.column], b = right.row[item.column];
            if (a === b) continue;
            if (a === null || b === null) return a === null ? 1 : -1;
            return (a < b ? -1 : 1) * (item.direction === 'asc' ? 1 : -1);
          }
          return left.ordinal - right.ordinal;
        });
        ensure();
        for (let index = 0; index < rows.length; index++) {
          ensure(); await onRow(rows[index].row, types[name], { rowCount: index + 1, sourceTextBytes }); ensure();
        }
        return { schema: 'stellar-forge.grist-dataset-extraction.v1', query: name, rowCount: rows.length,
          sourceTextBytes, columns: [...query.columns], columnTypes: types[name], order: options.order,
          valueEncoding: 'grist-rest-explicit-typed-values', nullEncoding: 'json-null',
          observation: { schema: 'stellar-forge.grist-records-observation.v1', kind: capture.manifest.responseKind,
            atomicSourceSnapshot: false, readOnly: true, visibility: 'credential-visible-table-records',
            capture: { schema: capture.manifest.schema, provider: 'grist', apiVersion: 'unversioned', method: capture.manifest.method,
              transport: capture.manifest.transport, readOnly: true, complete: true, countVerified: false, documentStateVerified: true, repeatReadVerified: true, documentState: capture.manifest.documentState, recordsSha256: capture.manifest.recordsSha256, responseKind: capture.manifest.responseKind,
              atomicSourceSnapshot: false, selectionSha256: capture.manifest.selectionSha256,
              schemaSha256: capture.manifest.schemaSha256, recordIdentitiesSha256: capture.manifest.recordIdentitiesSha256,
              rowCount: capture.manifest.rowCount, pageCount: capture.manifest.pageCount, sourceBytes: capture.manifest.sourceBytes,
              startedAt: capture.manifest.startedAt, completedAt: capture.manifest.completedAt,
              manifestSha256: capture.manifestSha256, file: capture.manifestFile } } };
      } finally { active = false; }
    },
    close() { closed = true; lifetime.abort(); }
  } };
}
