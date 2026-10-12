// MIT. Document-link evidence through the original authenticated IATI console.
const PREFIX = '/api/iati/document-evidence/';
const JSON_LIMIT = 64 * 1024 * 1024;
const PACKET_LIMIT = 4 * 1024 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const FILE_KINDS = Object.freeze(['report', 'register', 'plan', 'correction']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const problem = (code, message) => Object.assign(new Error(message), { code: 'IATI_DOCUMENT_EVIDENCE_' + code });
function digest(value) {
  if (typeof value !== 'string' || !SHA.test(value))
    throw problem('SELECTION', 'Select the complete saved record or row SHA-256.');
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw problem('REVISION', 'Select an explicit positive saved revision.');
  return value;
}
function requestId(value) {
  if (typeof value !== 'string' || !REQUEST.test(value))
    throw problem('REQUEST', 'Retain the original requestId for this action.');
  return value;
}
const query = values => new URLSearchParams(Object.entries(values)
  .filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
function pagination(input = {}) {
  const { offset = 0, limit = 50, expectedSnapshot } = input;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw problem('PAGE', 'Use a nonnegative row offset and a limit from 1 to 500.');
  if (expectedSnapshot !== undefined) digest(expectedSnapshot);
  return { offset, limit, ...(expectedSnapshot === undefined ? {} : { expectedSnapshot }) };
}
function checkedPage(value, selected) {
  if (!object(value) || !Array.isArray(value.rows) || !Number.isSafeInteger(value.total) || value.total < 0
      || value.offset !== selected.offset || value.limit !== selected.limit
      || value.rows.length > selected.limit || selected.offset > value.total
      || value.rows.length > value.total - selected.offset
      || selected.offset < value.total && value.rows.length === 0
      || typeof value.snapshotSha256 !== 'string' || !SHA.test(value.snapshotSha256))
    throw problem('RESPONSE', 'The original console returned an incomplete document register page.');
  if (selected.expectedSnapshot !== undefined && value.snapshotSha256 !== selected.expectedSnapshot)
    throw problem('SNAPSHOT_CHANGED', 'Reopen the selected evidence revision after its row snapshot changed.');
  return value;
}
function action(input, actionName) {
  if (!object(input)) throw problem('INPUT', 'Supply the complete original native action object.');
  requestId(input.requestId);
  if (typeof input.actor !== 'string' || !input.actor.trim())
    throw problem('ACTOR', 'Name the operator responsible for this action.');
  if (['note', 'observe', 'review'].includes(actionName)) {
    digest(input.id); revision(input.expectedRevision);
  }
  if (actionName === 'save') {
    if (!object(input.selection) || !['source', 'candidate'].includes(input.selection.view))
      throw problem('SELECTION', 'Select an exact organisation plan revision and source or candidate view.');
    digest(input.selection.id); revision(input.selection.revision); digest(input.selection.expectedSnapshot);
    if (!Array.isArray(input.documentRowIds) || input.documentRowIds.length < 1 || input.documentRowIds.length > 500)
      throw problem('SELECTION', 'Select from one to 500 original document rows.');
    input.documentRowIds.forEach(digest);
    if (new Set(input.documentRowIds).size !== input.documentRowIds.length)
      throw problem('SELECTION', 'Select each original document row once.');
  }
  if (actionName === 'observe') {
    if (!Array.isArray(input.rowIds) || !input.rowIds.length || input.rowIds.length > 500)
      throw problem('SELECTION', 'Select the original rows sharing one exact published URL.');
    input.rowIds.forEach(digest);
    if (new Set(input.rowIds).size !== input.rowIds.length)
      throw problem('SELECTION', 'Select each original document row once.');
    if (input.acknowledgeNewObservation !== undefined && typeof input.acknowledgeNewObservation !== 'boolean')
      throw problem('OBSERVATION', 'A later observation uses an explicit acknowledgement.');
  }
  if (actionName === 'compare') {
    for (const selected of [input.before, input.after]) {
      if (!object(selected)) throw problem('COMPARISON', 'Select both original evidence plan revisions.');
      digest(selected.id); revision(selected.revision);
    }
    if (input.rowPairs !== undefined) {
      if (!Array.isArray(input.rowPairs)) throw problem('COMPARISON', 'Supply explicit row pairs or omit rowPairs.');
      const before = new Set(), after = new Set();
      for (const pair of input.rowPairs) {
        if (!object(pair)) throw problem('COMPARISON', 'Use complete beforeRowId and afterRowId pairs.');
        digest(pair.beforeRowId); digest(pair.afterRowId);
        if (before.has(pair.beforeRowId) || after.has(pair.afterRowId))
          throw problem('COMPARISON', 'Pair each original row at most once on each side.');
        before.add(pair.beforeRowId); after.add(pair.afterRowId);
      }
    }
  }
  // The original model owns all other field validation. Preserve the complete
  // input, including omitted versus explicitly empty rowPairs and unknown fields.
  return input;
}

/** Use the original IatiWorkspaceClient request bridge and its stream ownership.
 * No method creates IDs, retries a mutation or starts another console process.
 * Observe may return the original ACQUIRING receipt; recover it with request().
 */
export function createDocumentEvidenceClient(request) {
  if (typeof request !== 'function') throw problem('CONNECTION', 'Use the original console request bridge.');
  const read = (route, values, options = {}) => request(PREFIX + route + (values ? '?' + query(values) : ''),
    { ...options, maximum: JSON_LIMIT });
  const post = (route, input, options = {}) => {
    action(input, route);
    const body = JSON.stringify(input);
    if (new TextEncoder().encode(body).length > JSON_LIMIT)
      throw problem('INPUT_LIMIT', 'The complete original action exceeds 64 MiB.');
    return request(PREFIX + route, { ...options, maximum: JSON_LIMIT,
      headers: { ...(options.headers ?? {}), 'content-type': 'application/json' }, body });
  };
  const api = {
    status: options => read('status', undefined, options),
    plan(id, { revision: selected, ...options } = {}) {
      return read('plan', { id: digest(id), ...(selected === undefined ? {} : { revision: revision(selected) }) }, options);
    },
    history: (id, options) => read('history', { id: digest(id) }, options),
    request: (id, options) => read('request', { requestId: requestId(id) }, options),
    rows(id, input, options) {
      if (!object(input)) throw problem('REVISION', 'Select an explicit saved evidence revision.');
      const selected = pagination(input);
      return read('rows', { id: digest(id), revision: revision(input.revision), ...selected }, options)
        .then(value => checkedPage(value, selected));
    },
    async *rowPages(id, input, options) {
      if (!object(input)) throw problem('REVISION', 'Select an explicit saved evidence revision.');
      const initial = pagination(input);
      let offset = initial.offset, expectedSnapshot = initial.expectedSnapshot, total;
      for (;;) {
        const value = await api.rows(id, { revision: input.revision, offset, limit: initial.limit, expectedSnapshot }, options);
        if (total !== undefined && value.total !== total)
          throw problem('SNAPSHOT_CHANGED', 'The original document register total changed within one saved snapshot.');
        total = value.total;
        yield value;
        expectedSnapshot = value.snapshotSha256;
        offset += value.rows.length;
        if (offset >= total) return;
      }
    },
    async detail(id, input, options) {
      if (!object(input)) throw problem('REVISION', 'Select an explicit saved evidence revision and document row.');
      const selected = { id: digest(id), revision: revision(input.revision), rowId: digest(input.rowId),
        ...(input.expectedSnapshot === undefined ? {} : { expectedSnapshot: digest(input.expectedSnapshot) }) };
      const value = await read('detail', selected, options);
      if (!object(value) || !object(value.row) || !Array.isArray(value.observations)
          || typeof value.snapshotSha256 !== 'string' || !SHA.test(value.snapshotSha256))
        throw problem('RESPONSE', 'The original console returned incomplete document evidence detail.');
      if (selected.expectedSnapshot !== undefined && value.snapshotSha256 !== selected.expectedSnapshot)
        throw problem('SNAPSHOT_CHANGED', 'Reopen the selected evidence revision after its row snapshot changed.');
      return value;
    },
    observation: (id, options) => read('observation', { id: digest(id) }, options),
    comparison: (id, options) => read('comparison', { id: digest(id) }, options),
    correction(id, { revision: selected, ...options } = {}) {
      return read('correction', { id: digest(id), revision: revision(selected) }, options);
    },
    save: (input, options) => post('save', input, options),
    note: (input, options) => post('note', input, options),
    observe: (input, options) => post('observe', input, options),
    review: (input, options) => post('review', input, options),
    compare: (input, options) => post('compare', input, options),
    /** Consume or cancel the returned complete native response. */
    file(id, kind, { revision: selected, ...options } = {}) {
      if (!FILE_KINDS.includes(kind)) throw problem('FILE', 'Select report, register, plan or correction.');
      return request(PREFIX + 'file?' + query({ id: digest(id), revision: revision(selected), kind }), { ...options, raw: true });
    },
    /** The native descriptor states whether these bytes are a full HTTP body or a retained prefix. */
    body(observationId, options = {}) {
      return request(PREFIX + 'body?' + query({ observationId: digest(observationId) }), { ...options, raw: true });
    },
    export(id, { revision: selected, ...options } = {}) {
      return request(PREFIX + 'export?' + query({ id: digest(id), ...(selected === undefined ? {} : { revision: revision(selected) }) }),
        { ...options, raw: true });
    },
    receive(input, options = {}) {
      if (!object(input) || input.body === undefined || input.body === null || !Number.isSafeInteger(input.bytes)
          || input.bytes < 1 || input.bytes > PACKET_LIMIT)
        throw problem('PACKET', 'Supply the complete original document-evidence ZIP stream and its byte count, up to 4 GiB.');
      return request(PREFIX + 'receive', { ...options, maximum: JSON_LIMIT, body: input.body,
        headers: { ...(options.headers ?? {}), 'content-type': 'application/zip', 'content-length': String(input.bytes) } });
    }
  };
  return Object.freeze(api);
}
export { PREFIX as DOCUMENT_EVIDENCE_PREFIX, FILE_KINDS as DOCUMENT_EVIDENCE_FILE_KINDS };
