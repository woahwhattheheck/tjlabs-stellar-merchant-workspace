// MIT. OCDS tool metadata; the native workspace is loaded only on explicit open.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const id = { type: 'string', minLength: 1, maxLength: 256 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 0 };
const offset = { type: 'integer', minimum: 0 };
const limit = { type: 'integer', minimum: 1, maximum: 500 };
const selected = { workspace: alias };
const scope = { type: 'string', enum: ['all', 'shortlist'] };
const ocids = { type: 'array', maxItems: 10000, uniqueItems: true, items: id };
const read = { readOnly: true, idempotent: true };
const mutation = { idempotent: false };
const capture = {
  captureId: id, kind: { type: 'string', enum: ['releases', 'record'] }, ocid: id, noticeId: id,
  updatedFrom: { type: 'string', maxLength: 64 }, updatedTo: { type: 'string', maxLength: 64 },
  stages: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 64 } },
  limit: { type: 'integer', minimum: 1, maximum: 10000 },
};
export const definitions = [
  ['merchant_ocds_workspaces', 'List host-declared OCDS workspace aliases, retained input aliases and original service ownership.', {}, [], read],
  ['merchant_ocds_open', 'Open one original saved OCDS workspace and its loopback operator interface. Browser, client and MCP use the same SQLite model.', selected, ['workspace'], { idempotent: true }],
  ['merchant_ocds_close', 'Close the exact owned OCDS service instance after draining current work and retained file reads.', { ...selected, instanceId: id }, ['workspace', 'instanceId'], mutation],
  ['merchant_ocds_status', 'Read current workspace identity and revision plus one complete page of projects, sources, publications, receivings, captures or diagnostics. Continue using page.nextOffset.', {
    ...selected, collection: { type: 'string', enum: ['projects', 'sources', 'publications', 'diagnostics', 'receivings', 'captures'] }, offset, limit,
  }, ['workspace'], read],
  ['merchant_ocds_entries', 'List retained original release, compiled-release and versioned-release metadata for a contracting process. Each selection retains its exact source pointer.', {
    ...selected, ocid: id, offset, limit,
  }, ['workspace', 'ocid'], read],
  ['merchant_ocds_entry', 'Read one original selected release and its source metadata. Use the source export to receive the complete original UTF-8 source bytes.', {
    ...selected, entryId: id, includeDocument: { type: 'boolean' },
  }, ['workspace', 'entryId'], read],
  ['merchant_ocds_compare', 'Compare two exact retained documents using the native domain engine. Pages retain actual before/after JSON pointers; includeValues adds complete values to each change.', {
    ...selected, beforeId: id, afterId: id, offset, limit, includeValues: { type: 'boolean' },
  }, ['workspace', 'beforeId', 'afterId'], read],
  ['merchant_ocds_source', 'Read metadata for one exact retained source, including linked-only and empty publication envelopes. includeBody returns the complete original body; source export supports chunked download.', {
    ...selected, sourceId: digest, includeBody: { type: 'boolean' },
  }, ['workspace', 'sourceId'], read],
  ['merchant_ocds_capture_record', 'Read one original saved capture record, retained page identities and its exact resumption state.', {
    ...selected, captureId: id,
  }, ['workspace', 'captureId'], read],
  ['merchant_ocds_receiving', 'Read the complete retained receiving record for an original package, including incoming review context and source identity.', {
    ...selected, packageId: digest,
  }, ['workspace', 'packageId'], read],
  ['merchant_ocds_inputs', 'List host-declared input and completed SF100 delivery aliases, or inspect one current original input byte count and SHA256.', {
    ...selected, input: alias,
  }, ['workspace'], read],
  ['merchant_ocds_import', 'Import one exact host-declared UTF-8 OCDS source. The SHA256 and current global workspace revision are checked immediately before the original import.', {
    ...selected, input: alias, expectedSha256: digest, expectedRevision: revision,
  }, ['workspace', 'input', 'expectedSha256', 'expectedRevision'], mutation],
  ['merchant_ocds_capture', 'Capture original Find a Tender release or record data through the native HTTP route. Supply kind for a new capture, or captureId alone to resume the saved original selection.', {
    ...selected, ...capture,
  }, ['workspace'], { ...mutation, openWorld: true }],
  ['merchant_ocds_review', 'Save the selected process review through the original model. expectedRevision is this process review revision, not the global workspace revision.', {
    ...selected, ocid: id, expectedRevision: revision,
    disposition: { type: 'string', enum: ['unreviewed', 'reviewing', 'pursue', 'passed'] },
    owner: { type: 'string', maxLength: 1000 }, nextAction: { type: 'string', maxLength: 10000 },
    note: { type: 'string', maxLength: 100000 }, shortlisted: { type: 'boolean' },
  }, ['workspace', 'ocid', 'expectedRevision'], mutation],
  ['merchant_ocds_receive', 'Receive one hash-pinned original workspace package from a host-declared input through the same native merge and source verification transaction.', {
    ...selected, input: alias, expectedSha256: digest, expectedRevision: revision,
  }, ['workspace', 'input', 'expectedSha256', 'expectedRevision'], mutation],
  ['merchant_ocds_export', 'Retain a complete native report, portable package, comparison, selected document or original source file. Receive its saved bytes with the existing retained-file reader.', {
    ...selected, expectedRevision: revision,
    format: { type: 'string', enum: ['json', 'csv', 'html', 'package', 'comparison', 'document', 'source'] },
    scope, ocids, sourceId: digest, entryId: id, beforeId: id, afterId: id,
  }, ['workspace', 'expectedRevision', 'format'], mutation],
  ['merchant_ocds_files', 'List retained export or original merchant package files with exact byte counts and SHA256. Select a saved publication ID from status.', {
    ...selected, publicationId: id,
  }, ['workspace', 'publicationId'], read],
  ['merchant_ocds_file_read', 'Read one listed immutable original file in pinned Base64 chunks. Continue with readId, expectedSha256 and nextOffset; after expiry resume the same original hash and offset.', {
    ...selected, publicationId: id, file: { type: 'string', minLength: 1, maxLength: 256 },
    readId: id, expectedSha256: digest, offset,
    limit: { type: 'integer', minimum: 1, maximum: MAX_RETAINED_CHUNK_BYTES },
  }, ['workspace', 'publicationId', 'file', 'expectedSha256'], read],
  ['merchant_ocds_file_release', 'Release one original retained-file snapshot after completing or abandoning its download.', {
    ...selected, readId: id,
  }, ['workspace', 'readId'], read],
  ['merchant_ocds_merchant_prepare', 'Create a source-preserving dataset and merchant package from the selected current processes using host-declared public payment terms. Large documents use complete 24 KiB chunks through the original SF30 dataset protocol.', {
    ...selected, expectedRevision: revision, scope, ocids, name: { type: 'string', minLength: 1, maxLength: 128 },
  }, ['workspace', 'expectedRevision'], mutation],
  ['merchant_ocds_merchant_preview', 'Query the exact original immutable CSV dataset through its native handlers. All query values are strings; filter by where_ocid or where_package_id and continue page.nextCursor unchanged.', {
    ...selected, publicationId: id, query: { type: 'object', additionalProperties: { type: 'string' } },
  }, ['workspace', 'publicationId'], read],
  ['merchant_ocds_merchant_start', 'Start the selected configured merchant through the existing SF30 seller service. Public terms and facilitator are host-declared; returns the owned seller instance.', {
    ...selected, publicationId: id,
  }, ['workspace', 'publicationId'], mutation],
  ['merchant_ocds_merchant_stop', 'Stop the exact currently owned seller instance while retaining its complete original package.', {
    ...selected, sellerInstanceId: id,
  }, ['workspace', 'sellerInstanceId'], mutation],
  ['merchant_ocds_delivery_adopt', 'Verify a completed original SF100 delivery, reconstruct every selected package, and receive it through the native OCDS transaction. Original source bytes, page chain, snapshot and buyer intents remain linked.', {
    ...selected, delivery: alias, expectedRevision: revision,
  }, ['workspace', 'delivery', 'expectedRevision'], mutation],
];
export function ocdsWorkspaceTools(tool) { return definitions.map(definition => tool(...definition)); }
