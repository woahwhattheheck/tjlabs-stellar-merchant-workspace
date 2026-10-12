// MIT. Organisation budget/activity finance reconciliation through the original console.
const PREFIX = '/api/iati/reconciliation/';
const JSON_LIMIT = 64 * 1024 * 1024;
const PACKET_LIMIT = 4 * 1024 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const problem = (code, message) => Object.assign(new Error(message), { code: 'IATI_RECONCILIATION_' + code });
const digest = value => {
  if (typeof value !== 'string' || !SHA.test(value)) throw problem('SELECTION', 'Select a full saved record SHA-256.');
  return value;
};
const revision = value => {
  if (!Number.isSafeInteger(value) || value < 1) throw problem('REVISION', 'Select an explicit saved revision.');
  return value;
};
const requestId = value => {
  if (typeof value !== 'string' || !REQUEST.test(value)) throw problem('REQUEST', 'Retain one original request ID for this action.');
  return value;
};
const query = values => new URLSearchParams(Object.entries(values)
  .filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
function page(input = {}) {
  const { offset = 0, limit = 50, expectedSnapshot } = input;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 250)
    throw problem('PAGE', 'Select a register page with a limit from 1 to 250.');
  if (expectedSnapshot !== undefined) digest(expectedSnapshot);
  return { offset, limit, ...(expectedSnapshot === undefined ? {} : { expectedSnapshot }) };
}
function selector(input) {
  if (!object(input) || !object(input.organisation) || !Array.isArray(input.portfolios) || !input.portfolios.length)
    throw problem('SELECTION', 'Select one saved organisation and at least one saved activity portfolio.');
  const organisation = { id: digest(input.organisation.id), revision: revision(input.organisation.revision),
    organisationKey: digest(input.organisation.organisationKey) };
  const seen = new Set();
  const portfolios = input.portfolios.map(value => {
    if (!object(value)) throw problem('SELECTION', 'Select each activity portfolio by ID and revision.');
    const item = { id: digest(value.id), revision: revision(value.revision) };
    const key = item.id + ':' + item.revision;
    if (seen.has(key)) throw problem('SELECTION', 'Select each portfolio revision once.');
    seen.add(key); return item;
  });
  return { organisation, portfolios };
}
function definition(input) {
  if (!object(input) || typeof input.name !== 'string' || !input.name.trim()
      || !Array.isArray(input.comparisons) || !Array.isArray(input.decisions))
    throw problem('INPUT', 'Supply a named definition with explicit comparisons and decisions.');
  selector(input);
  for (const row of input.comparisons) {
    if (!object(row) || !Array.isArray(row.activityRowIds) || !['selected', 'complete'].includes(row.coverage)
        || typeof row.scopeStatement !== 'string' || !row.scopeStatement.trim())
      throw problem('COMPARISON', 'Select the activity rows and describe each comparison scope.');
    if (row.valueDatePolicy !== undefined && !['separate', 'nominal'].includes(row.valueDatePolicy))
      throw problem('COMPARISON', 'Choose separate value dates or reported nominal amounts.');
    digest(row.organisationRowId); row.activityRowIds.forEach(digest);
    if (new Set(row.activityRowIds).size !== row.activityRowIds.length)
      throw problem('COMPARISON', 'An activity row may occur once in each comparison.');
  }
  return input;
}
function checkedPage(value, expected, offset) {
  if (!object(value) || !Array.isArray(value.rows) || !Number.isSafeInteger(value.total)
      || value.total < 0 || value.offset !== offset || value.rows.length > value.total - offset
      || offset < value.total && !value.rows.length)
    throw problem('RESPONSE', 'The console did not return a complete register page.');
  digest(value.snapshotSha256);
  if (expected && value.snapshotSha256 !== expected)
    throw problem('SNAPSHOT_CHANGED', 'The selected register changed. Restart this register at its first page.');
  return value;
}

/**
 * Borrow the existing IatiWorkspaceClient request function. The bridge retains
 * its loopback URL, authentication, cancellation, timeout and process ownership.
 * Returned financial amounts are original decimal strings.
 */
export function createOrganisationReconciliationClient(request) {
  if (typeof request !== 'function') throw problem('CONNECTION', 'Use the original console request bridge.');
  const read = (route, values, options = {}) => request(PREFIX + route + (values ? '?' + query(values) : ''),
    { ...options, maximum: JSON_LIMIT });
  const post = (route, input, options = {}) => {
    if (!object(input)) throw problem('INPUT', 'Use a complete native action object.');
    const body = JSON.stringify(input);
    if (new TextEncoder().encode(body).length > JSON_LIMIT) throw problem('INPUT_LIMIT', 'The complete request exceeds 64 MiB.');
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
    async catalog(input, options) {
      if (!['organisation', 'activity'].includes(input?.section)) throw problem('SECTION', 'Select organisation or activity records.');
      const selectedPage = page(input), { expectedSnapshot, ...pagination } = selectedPage;
      const result = await post('catalog', { ...selector(input), section: input.section, ...pagination }, options);
      return checkedPage(result, expectedSnapshot, selectedPage.offset);
    },
    async *catalogPages(input, { limit = 250, ...options } = {}) {
      let offset = 0, expectedSnapshot;
      do {
        const value = await api.catalog({ ...input, offset, limit, expectedSnapshot }, options);
        yield value;
        expectedSnapshot = value.snapshotSha256; offset += value.rows.length;
        if (offset >= value.total) return;
      } while (true);
    },
    rows(id, input, options) {
      if (!['comparisons', 'activity', 'issues', 'decisions'].includes(input?.section))
        throw problem('SECTION', 'Select comparisons, activity records, issues or decisions.');
      const pagination = page(input);
      return read('rows', { id: digest(id), revision: revision(input.revision), section: input.section, ...pagination }, options)
        .then(value => checkedPage(value, pagination.expectedSnapshot, pagination.offset));
    },
    async *rowPages(id, input, { limit = 250, ...options } = {}) {
      let offset = 0, expectedSnapshot;
      do {
        const value = await api.rows(id, { ...input, offset, limit, expectedSnapshot }, options);
        yield value;
        expectedSnapshot = value.snapshotSha256; offset += value.rows.length;
        if (offset >= value.total) return;
      } while (true);
    },
    preview: (input, options) => post('preview', definition(input), options),
    save(input, options) {
      definition(input); requestId(input.requestId);
      if ((input.id === undefined) !== (input.expectedRevision === undefined))
        throw problem('REVISION', 'A revision update requires its case ID and expected revision together.');
      if (input.id !== undefined) { digest(input.id); revision(input.expectedRevision); }
      return post('save', input, options);
    },
    review(input, options) {
      if (!object(input) || !['approve', 'request_changes'].includes(input.decision)
          || typeof input.actor !== 'string' || !input.actor.trim() || typeof input.note !== 'string'
          || !Array.isArray(input.acknowledgedIssueIds))
        throw problem('REVIEW', 'Supply the named review and its explicit acknowledged issues.');
      digest(input.id); revision(input.expectedRevision); requestId(input.requestId);
      input.acknowledgedIssueIds.forEach(digest);
      return post('review', input, options);
    },
    compare(input, options) {
      if (!object(input?.before) || !object(input?.after)) throw problem('COMPARISON', 'Select the two saved case revisions.');
      return post('compare', {
        before: { id: digest(input.before.id), revision: revision(input.before.revision) },
        after: { id: digest(input.after.id), revision: revision(input.after.revision) }
      }, options);
    },
    file(id, kind, { revision: selected, ...options } = {}) {
      if (!['report', 'csv', 'json'].includes(kind)) throw problem('FILE', 'Select the full report, CSV or JSON file.');
      return request(PREFIX + 'file?' + query({ id: digest(id), revision: revision(selected), kind }), { ...options, raw: true });
    },
    export(id, { revision: selected, ...options } = {}) {
      return request(PREFIX + 'export?' + query({ id: digest(id), revision: revision(selected) }), { ...options, raw: true });
    },
    receive({ body, bytes }, options = {}) {
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > PACKET_LIMIT)
        throw problem('PACKET', 'Select a complete reconciliation ZIP up to 4 GiB.');
      return request(PREFIX + 'receive', { ...options, maximum: JSON_LIMIT, body,
        headers: { ...(options.headers ?? {}), 'content-type': 'application/zip', 'content-length': String(bytes) } });
    }
  };
  return Object.freeze(api);
}
export { PREFIX as ORGANISATION_RECONCILIATION_PREFIX };
