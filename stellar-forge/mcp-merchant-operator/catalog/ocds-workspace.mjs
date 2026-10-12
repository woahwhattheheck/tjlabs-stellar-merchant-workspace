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
  limit: { type: 'integer', minimum: 1, maximum: 100 },
};

const sourceCollections = ['selections', 'windows', 'work', 'documents', 'receivings', 'documentBodies'];
const sourceIds = { type: 'array', minItems: 1, maxItems: 10000, uniqueItems: true, items: id };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const jsonObject = { type: 'object', additionalProperties: true };
const sourceBaseline = { type: 'array', maxItems: 10000, items: object({
  ocid: id, entryId: { type: ['string', 'null'], maxLength: 256 }
}, ['ocid', 'entryId']) };
const sourceRequest = object(Object.fromEntries(Object.entries(capture).filter(([key]) => key !== 'captureId')), ['kind']);
const sourceSelection = object({
  id, label: { type: 'string', maxLength: 1024 }, provider: { type: 'string', enum: ['find-tender'] },
  request: sourceRequest, ocids: sourceIds, owner: { type: 'string', maxLength: 256 },
  enabled: { type: 'boolean' }, acquireDocuments: { type: 'boolean' },
  documentEditionScope: { type: 'string', enum: ['current', 'all-retained'] },
  documentHosts: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'string', pattern: '^[A-Za-z0-9.-]+$', maxLength: 253 } },
  attachments: { type: 'array', maxItems: 10000, items: object({
    ocid: id, entryId: id, referenceUrl: { type: 'string', maxLength: 8192 }, document: jsonObject
  }, ['ocid', 'referenceUrl', 'document']) },
  reviewPolicy: object({ administrativePointers: { type: 'array', maxItems: 1000, uniqueItems: true,
    items: { type: 'string', maxLength: 8192 } } }, ['administrativePointers'])
}, ['id', 'provider', 'request', 'ocids']);
const acquisition = {
  type: 'object', required: ['operationId', 'requestedUrl', 'retrievedAt', 'sha256', 'bytes'],
  properties: {
    operationId: { type: 'string', minLength: 1, maxLength: 4096 },
    requestedUrl: { type: 'string', minLength: 1, maxLength: 8192 },
    finalUrl: { type: ['string', 'null'], maxLength: 8192 },
    retrievedAt: { type: ['string', 'null'], maxLength: 64 },
    completedBy: { type: 'string', maxLength: 64 },
    transport: { type: 'string', minLength: 1, maxLength: 256 },
    status: { type: ['integer', 'null'], minimum: 200, maximum: 299 },
    sha256: digest, bytes: { type: 'integer', minimum: 0, maximum: 128 * 1024 * 1024 }
  }, additionalProperties: true
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
  ['merchant_ocds_inputs', 'List host-declared input, completed SF100 delivery and source-handoff aliases. Inspect an input SHA256 or a sourceDelivery handoff ID before adopting it.', {
    ...selected, input: alias, sourceDelivery: alias,
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
  ['merchant_ocds_source_state', 'Read one complete page of saved publisher selections, source windows, assigned reviews, original-document metadata or source receivings. Continue page.nextOffset; original arrays and acquisition metadata are retained.', {
    ...selected, collection: { type: 'string', enum: sourceCollections }, offset, limit
  }, ['workspace'], read],
  ['merchant_ocds_source_selection_save', 'Save a publisher selection through the original native source engine. expectedRevision is this saved selection revision, or zero for a new selection. Explicit attachment references retain the original publisher document object.', {
    ...selected, selection: sourceSelection, expectedRevision: revision
  }, ['workspace', 'selection', 'expectedRevision'], mutation],
  ['merchant_ocds_source_window', 'Read one complete native source window, including capture checkpoints, original observations and assigned review IDs.', {
    ...selected, windowId: id
  }, ['workspace', 'windowId'], read],
  ['merchant_ocds_source_refresh', 'Start a fresh observation of selected saved publishers and original document URLs, or resume windowId alone. Native capture checkpoints and the source-window lease survive interruptions. A started response is asynchronous; read that window until complete.', {
    ...selected, windowId: id, name: { type: 'string', minLength: 1, maxLength: 1024 },
    selectionIds: sourceIds, baseline: sourceBaseline, context: jsonObject
  }, ['workspace'], { ...mutation, openWorld: true }],
  ['merchant_ocds_source_pause', 'Request a pause of the selected running source window. Read that same window to observe its saved interruption and resume it by ID.', {
    ...selected, windowId: id
  }, ['workspace', 'windowId'], { idempotent: true }],
  ['merchant_ocds_source_review', 'Read the selected assigned change review and its original before/after comparison and document associations.', {
    ...selected, reviewId: id
  }, ['workspace', 'reviewId'], read],
  ['merchant_ocds_source_review_save', 'Assign, progress or resolve the selected native source review. expectedRevision belongs to this review; preserve its immutable comparison. Every status needs a saved owner and resolved additionally needs a nonblank resolution.', {
    ...selected, reviewId: id, expectedRevision: revision,
    status: { type: 'string', enum: ['pending', 'reviewing', 'resolved'] },
    owner: { type: 'string', maxLength: 256 }, nextAction: { type: 'string', maxLength: 8192 },
    resolution: { type: 'string', maxLength: 65536 }
  }, ['workspace', 'reviewId', 'expectedRevision', 'status'], mutation],
  ['merchant_ocds_source_observation_adopt', 'Adopt a complete original Find a Tender record response from an inspected host input and its existing acquisition metadata. The original SHA256, bytes, request URL and saved OCID are checked. Use null retrievedAt with the real completedBy bound when that provider omitted retrieval time; preserve its transport and operation ID. Resume the returned window to finish document acquisition and review.', {
    ...selected, input: alias, expectedSha256: digest, selectionId: id, selectionIds: sourceIds,
    windowId: id, name: { type: 'string', maxLength: 1024 }, baseline: sourceBaseline, context: jsonObject,
    expectedWindowRevision: revision, observation: acquisition
  }, ['workspace', 'input', 'expectedSha256', 'selectionId', 'observation'], { idempotent: true }],
  ['merchant_ocds_source_original_import', 'Attach the complete original acquired document from an inspected host input to its saved publisher reference. Retain the actual successful HTTP receipt, original bytes and operation ID. A repeated operation reuses its existing body and adds any newly available native entry bindings.', {
    ...selected, input: alias, expectedSha256: digest, selectionId: id, referenceId: id, ocid: id,
    documentId: { type: ['string', 'integer', 'null'], maxLength: 256 }, observation: acquisition
  }, ['workspace', 'input', 'expectedSha256', 'selectionId', 'observation'], { idempotent: true }],
  ['merchant_ocds_source_document_export', 'Retain one exact original document edition by its reference ID and SHA256. Use the existing listed-file reader for the complete binary bytes.', {
    ...selected, documentId: id, expectedSha256: digest
  }, ['workspace', 'documentId', 'expectedSha256'], mutation],
  ['merchant_ocds_source_handoff_export', 'Freeze and retain one full native client handoff, including original OCDS bodies, binary documents, observations, assigned reviews and editable receiving material. expectedRevision pins the shared native snapshot. Read every listed file through the existing file reader.', {
    ...selected, expectedRevision: revision, ocids: sourceIds
  }, ['workspace', 'expectedRevision', 'ocids'], mutation],
  ['merchant_ocds_source_handoff_receive', 'Receive the exact original handoff from a host-declared sourceDelivery alias. expectedHandoffId pins the inspected manifest before any mutation; expectedRevision is the destination global workspace revision. Read original receiving context after a lost response.', {
    ...selected, sourceDelivery: alias, expectedHandoffId: digest, expectedRevision: revision
  }, ['workspace', 'sourceDelivery', 'expectedHandoffId', 'expectedRevision'], { idempotent: true }],
  ['merchant_ocds_source_receiving', 'Read a complete retained source-operations receiving by its original package ID, including preserved incoming work, selections and acquisition context.', {
    ...selected, packageId: digest
  }, ['workspace', 'packageId'], read],

];
export function ocdsWorkspaceTools(tool) { return definitions.map(definition => tool(...definition)); }
