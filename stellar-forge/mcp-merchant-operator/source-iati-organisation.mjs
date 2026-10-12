// MIT. Thin organisation dispatch into the original authenticated source adapter.
import { IATI_ORGANISATION_TOOL_PREFIX, IATI_ORGANISATION_REQUEST, IATI_ORGANISATION_FILE_KINDS } from './catalog/source-iati-organisation.mjs';

export const IATI_ORGANISATION_ROUTE = '/api/iati/organisation/';
const SHA = /^[0-9a-f]{64}$/;
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMS' });
const digest = (value, label) => {
  if (typeof value !== 'string' || !SHA.test(value)) throw invalid('Use the original ' + label + ' SHA256.');
  return value;
};
const positive = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid('Use a positive original ' + label + '.');
  return value;
};
const request = value => {
  if (typeof value !== 'string' || !IATI_ORGANISATION_REQUEST.test(value))
    throw invalid('Use the original organisation requestId.');
  return value;
};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function selectedRevision(input, required = false) {
  const selected = { id: digest(input.id, 'organisation plan') };
  if (required || input.revision !== undefined) selected.revision = positive(input.revision, 'revision');
  return selected;
}

function selectedSnapshot(input, detail = false) {
  if ((input.sourceId === undefined) === (input.id === undefined))
    throw invalid('Choose original sourceId, or id with an explicit saved revision.');
  const selected = input.sourceId === undefined ? selectedRevision(input, true) : { sourceId: digest(input.sourceId, 'organisation source') };
  if (input.sourceId !== undefined && input.revision !== undefined)
    throw invalid('An original source already selects immutable bytes; use a saved plan for revisions.');
  const view = input.view ?? (input.sourceId === undefined ? 'candidate' : 'source');
  if (!['source', 'candidate'].includes(view) || view === 'candidate' && input.id === undefined)
    throw invalid('Candidate view requires an explicit saved plan revision.');
  selected.view = view;
  if (detail) {
    if (input.section !== undefined) throw invalid('Original row detail selects rowId and the immutable snapshot; omit section.');
  } else {
    if (!['budgets', 'documents', 'issues'].includes(input.section))
      throw invalid('Choose the original budgets, documents or issues section.');
    selected.section = input.section;
  }
  if (input.organisationKey !== undefined) selected.organisationKey = digest(input.organisationKey, 'organisation key');
  if (input.expectedSnapshot !== undefined) selected.expectedSnapshot = digest(input.expectedSnapshot, 'row snapshot');
  return selected;
}

/**
 * All transport, file selection, atomic export retention and stream ownership
 * belong to MerchantSourceWorkspaces. This module only selects native routes.
 */
export async function executeIatiOrganisation(name, input, original) {
  const action = name.slice(IATI_ORGANISATION_TOOL_PREFIX.length);
  const result = native => ({ workspace: original.workspace, native });
  const json = (route, body) => original.json(IATI_ORGANISATION_ROUTE + route, body);
  switch (action) {
    case 'status': return result(await json('status'));
    case 'profile': return result(await json('profile?' + new URLSearchParams({ sourceId: digest(input.sourceId, 'organisation source') })));
    case 'plan': return result(await json('plan?' + new URLSearchParams(selectedRevision(input))));
    case 'history': {
      const history = await json('history?' + new URLSearchParams({ id: digest(input.id, 'organisation plan') }));
      return result(original.page(history.history, input));
    }
    case 'request': return result(await json('request?' + new URLSearchParams({ requestId: request(input.requestId) })));
    case 'rows': {
      const selected = selectedSnapshot(input);
      const offset = input.offset ?? 0, limit = input.limit ?? 50;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 250)
        throw invalid('Use the declared native row offset and limit.');
      if (offset > 0 && input.expectedSnapshot === undefined)
        throw invalid('Continue the original row snapshotSha256 as expectedSnapshot.');
      const native = await json('rows?' + new URLSearchParams({ ...selected, offset, limit }));
      // The original engine validates the snapshot. Preserve its complete page;
      // add only a continuation offset derived from its authoritative bounds.
      if (!Array.isArray(native.rows) || !Number.isSafeInteger(native.total) || native.total < 0 ||
          native.offset !== offset || !Number.isSafeInteger(native.limit) || native.limit < 1 ||
          native.rows.length > native.limit || offset + native.rows.length > native.total ||
          native.rows.length === 0 && offset < native.total ||
          typeof native.snapshotSha256 !== 'string' || !SHA.test(native.snapshotSha256))
        throw Object.assign(new Error('Original organisation rows returned an invalid page envelope.'), { code: 'SOURCE_RESPONSE_INVALID' });
      if (input.expectedSnapshot !== undefined && native.snapshotSha256 !== input.expectedSnapshot)
        throw Object.assign(new Error('The original organisation row snapshot changed. Reopen the selected source or revision.'), { code: 'SOURCE_INVENTORY_CHANGED' });
      return result({ ...native, nextOffset: offset + native.rows.length < native.total ? offset + native.rows.length : null });
    }
    case 'detail': {
      const selected = selectedSnapshot(input, true);
      return result(await json('detail?' + new URLSearchParams({ ...selected, rowId: digest(input.rowId, 'organisation row'),
        ...(input.targetId === undefined ? {} : { targetId: digest(input.targetId, 'organisation target') }) })));
    }
    case 'save':
    case 'review':
    case 'release':
    case 'compare': {
      if (!plain(input.definition)) throw invalid('Supply the complete original organisation definition.');
      request(input.definition.requestId);
      return result(await json(action, input.definition));
    }
    case 'export': {
      const selected = selectedRevision(input, true);
      const retained = await original.retain(IATI_ORGANISATION_ROUTE + 'export?' + new URLSearchParams(selected),
        'organisation', { organisation: selected.id, revision: selected.revision },
        { name: 'iati-organisation.zip', contentType: 'application/zip', verifyNativeDescriptor: true });
      return { ...retained, organisation: selected.id, revision: selected.revision };
    }
    case 'file': {
      const selected = selectedRevision(input, true);
      if (!IATI_ORGANISATION_FILE_KINDS.includes(input.kind)) throw invalid('Choose an original organisation file kind.');
      const extension = ['source', 'candidate'].includes(input.kind) ? 'xml' : input.kind === 'report' ? 'html' : 'csv';
      const contentType = extension === 'xml' ? 'application/xml' : extension === 'html' ? 'text/html' : 'text/csv';
      const retained = await original.retain(IATI_ORGANISATION_ROUTE + 'file?' + new URLSearchParams({ ...selected, kind: input.kind }),
        'organisation-file', { organisation: selected.id, revision: selected.revision, fileKind: input.kind },
        { name: 'iati-organisation-' + input.kind + '.' + extension, contentType, verifyNativeDescriptor: true });
      return { ...retained, organisation: selected.id, revision: selected.revision, fileKind: input.kind };
    }
    case 'receive': return result(await original.receive(input, IATI_ORGANISATION_ROUTE + 'receive', ['organisation']));
    default: throw Object.assign(new Error('Unknown original organisation operation.'), { code: 'TOOL_NOT_FOUND' });
  }
}
