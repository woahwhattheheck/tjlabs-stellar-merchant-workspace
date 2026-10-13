// MIT. Document evidence on the original authenticated Merchant source workspace.
import { IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX, IATI_DOCUMENT_EVIDENCE_REQUEST,
  IATI_DOCUMENT_EVIDENCE_FILE_KINDS } from './catalog/source-iati-document-evidence.mjs';

export const IATI_DOCUMENT_EVIDENCE_ROUTE = '/api/iati/document-evidence/';
const SHA = /^[0-9a-f]{64}$/;
const BODY_LIMIT = 64 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMS' });
const malformed = message => Object.assign(new Error(message), { code: 'SOURCE_RESPONSE_INVALID' });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function digest(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) throw invalid('Use the complete original ' + label + ' SHA256.');
  return value;
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid('Select an explicit positive saved revision.');
  return value;
}
function request(value) {
  if (typeof value !== 'string' || !IATI_DOCUMENT_EVIDENCE_REQUEST.test(value))
    throw invalid('Retain the original document-evidence requestId.');
  return value;
}
function revision(input, required = false) {
  return { id: digest(input.id, 'evidence plan'),
    ...(required || input.revision !== undefined ? { revision: positive(input.revision) } : {}) };
}
function snapshot(input) {
  return { ...revision(input, true),
    ...(input.expectedSnapshot === undefined ? {} : { expectedSnapshot: digest(input.expectedSnapshot, 'row snapshot') }) };
}
function page(native, selected) {
  if (!plain(native) || !Array.isArray(native.rows) || !Number.isSafeInteger(native.total) || native.total < 0
      || native.offset !== selected.offset || native.limit !== selected.limit || native.rows.length > selected.limit
      || selected.offset > native.total || selected.offset + native.rows.length > native.total
      || selected.offset < native.total && native.rows.length === 0
      || typeof native.snapshotSha256 !== 'string' || !SHA.test(native.snapshotSha256))
    throw malformed('The original document evidence engine returned an incomplete row page.');
  if (selected.expectedSnapshot !== undefined && native.snapshotSha256 !== selected.expectedSnapshot)
    throw Object.assign(new Error('Reopen the original evidence revision after its row snapshot changed.'), { code: 'SOURCE_INVENTORY_CHANGED' });
  return { ...native, nextOffset: selected.offset + native.rows.length < native.total ? selected.offset + native.rows.length : null };
}

/** Authentication, transport, full file retention and receiving remain owned by
 * MerchantSourceWorkspaces. No new sender, retry loop or network client is added.
 */
export async function executeIatiDocumentEvidence(name, input, original) {
  const action = name.slice(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX.length);
  const result = native => ({ workspace: original.workspace, native });
  const json = (route, body) => original.json(IATI_DOCUMENT_EVIDENCE_ROUTE + route, body);
  switch (action) {
    case 'status': return result(await json('status'));
    case 'plan': return result(await json('plan?' + new URLSearchParams(revision(input))));
    case 'history': {
      const native = await json('history?' + new URLSearchParams({ id: digest(input.id, 'evidence plan') }));
      if (!plain(native) || !Array.isArray(native.history)) throw malformed('The original evidence history is incomplete.');
      return result(original.page(native.history, input));
    }
    case 'request': return result(await json('request?' + new URLSearchParams({ requestId: request(input.requestId) })));
    case 'rows': {
      const offset = input.offset ?? 0, limit = input.limit ?? 50;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
        throw invalid('Use a nonnegative row offset and a limit from 1 to 500.');
      if (offset > 0 && input.expectedSnapshot === undefined)
        throw invalid('Continue the original row snapshotSha256 as expectedSnapshot.');
      const selected = { ...snapshot(input), offset, limit };
      return result(page(await json('rows?' + new URLSearchParams(selected)), selected));
    }
    case 'detail': {
      const selected = { ...snapshot(input), rowId: digest(input.rowId, 'document row') };
      const native = await json('detail?' + new URLSearchParams(selected));
      if (!plain(native) || !plain(native.row) || !Array.isArray(native.observations)
          || typeof native.snapshotSha256 !== 'string' || !SHA.test(native.snapshotSha256))
        throw malformed('The original document evidence detail is incomplete.');
      if (selected.expectedSnapshot !== undefined && native.snapshotSha256 !== selected.expectedSnapshot)
        throw Object.assign(new Error('The original evidence detail snapshot changed.'), { code: 'SOURCE_INVENTORY_CHANGED' });
      return result(native);
    }
    case 'observation': return result(await json('observation?' + new URLSearchParams({ id: digest(input.id, 'observation') })));
    case 'comparison': return result(await json('comparison?' + new URLSearchParams({ id: digest(input.id, 'comparison') })));
    case 'correction': return result(await json('correction?' + new URLSearchParams(revision(input, true))));
    case 'save':
    case 'note':
    case 'observe':
    case 'review':
    case 'compare': {
      if (!plain(input.definition)) throw invalid('Supply the complete original native action definition.');
      request(input.definition.requestId);
      // Native validation receives every original field and preserves [] versus omission.
      // ACQUIRING is returned intact; request() recovers this same original acquisition.
      return result(await json(action, input.definition));
    }
    case 'export': {
      let selected = revision(input);
      if (selected.revision === undefined) {
        const current = await json('plan?' + new URLSearchParams(selected));
        if (current?.id !== selected.id) throw malformed('The original console returned a different evidence plan.');
        selected = { ...selected, revision: positive(current.revision) };
      }
      const retained = await original.retain(IATI_DOCUMENT_EVIDENCE_ROUTE + 'export?' + new URLSearchParams(selected),
        'document-evidence', { evidence: selected.id, revision: selected.revision },
        { name: 'iati-document-evidence.zip', contentType: 'application/zip', verifyNativeDescriptor: true });
      return { ...retained, evidence: selected.id, revision: selected.revision };
    }
    case 'file': {
      const selected = revision(input, true);
      if (!IATI_DOCUMENT_EVIDENCE_FILE_KINDS.includes(input.kind))
        throw invalid('Select the complete report, register, plan or correction file.');
      const extension = input.kind === 'report' ? 'html' : input.kind === 'register' ? 'csv' : 'json';
      const contentType = extension === 'html' ? 'text/html' : extension === 'csv' ? 'text/csv' : 'application/json';
      const retained = await original.retain(IATI_DOCUMENT_EVIDENCE_ROUTE + 'file?' + new URLSearchParams({ ...selected, kind: input.kind }),
        'document-evidence-file', { evidence: selected.id, revision: selected.revision, fileKind: input.kind },
        { name: 'iati-document-evidence-' + input.kind + '.' + extension, contentType, verifyNativeDescriptor: true });
      return { ...retained, evidence: selected.id, revision: selected.revision, fileKind: input.kind };
    }
    case 'body': {
      const observationId = digest(input.observationId, 'observation');
      const observation = await json('observation?' + new URLSearchParams({ id: observationId }));
      const body = observation?.body;
      if (observation?.id !== observationId || !plain(body) || typeof body.sha256 !== 'string' || !SHA.test(body.sha256)
          || !Number.isSafeInteger(body.bytes) || body.bytes < 0 || body.bytes > BODY_LIMIT
          || typeof body.complete !== 'boolean' || typeof observation.documentComplete !== 'boolean'
          || body.representation !== 'http-message-body')
        throw malformed('Select an observation with its complete native retained-body descriptor.');
      const contentType = typeof body.media === 'string' && body.media.length > 0 && body.media.length <= 200 && !/[\r\n]/.test(body.media)
        ? body.media : 'application/octet-stream';
      const retained = await original.retain(IATI_DOCUMENT_EVIDENCE_ROUTE + 'body?' + new URLSearchParams({ observationId }),
        'document-evidence-body', { observationId, bodyComplete: body.complete, documentComplete: observation.documentComplete },
        { name: 'iati-document-body-' + observationId + '.bin', contentType, verifyNativeDescriptor: true });
      if (retained.sha256 !== body.sha256 || retained.bytes !== body.bytes)
        throw Object.assign(new Error('The retained response body differs from the original observation descriptor.'), { code: 'SOURCE_EXPORT_CHANGED' });
      return { ...retained, observationId, bodyComplete: body.complete, documentComplete: observation.documentComplete,
        bodyDescriptor: body, observation };
    }
    case 'receive':
      return result(await original.receive(input, IATI_DOCUMENT_EVIDENCE_ROUTE + 'receive', ['document-evidence']));
    default: throw Object.assign(new Error('Unknown original document-evidence operation.'), { code: 'TOOL_NOT_FOUND' });
  }
}
