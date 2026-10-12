// MIT. Additive tools over the original IATI console and retained file carrier.
const TOOL_PREFIX = 'merchant_source_iati_reconciliation_';
const API = '/api/iati/reconciliation/';
const sha = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const rev = { type: 'integer', minimum: 1 };
const requestId = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' };
const scope = { workspace: alias };
const paging = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 250 }, expectedSnapshot: sha };
const read = { readOnly: true, idempotent: true };
const pinned = { type: 'object', properties: { id: sha, revision: rev }, required: ['id', 'revision'], additionalProperties: false };
const selection = {
  organisation: { type: 'object', properties: { id: sha, revision: rev, organisationKey: sha },
    required: ['id', 'revision', 'organisationKey'], additionalProperties: false },
  portfolios: { type: 'array', minItems: 1, items: pinned }
};
const comparison = { type: 'object', properties: {
  organisationRowId: sha, activityRowIds: { type: 'array', items: sha, uniqueItems: true },
  coverage: { type: 'string', enum: ['selected', 'complete'] },
  scopeStatement: { type: 'string', minLength: 1 },
  valueDatePolicy: { type: 'string', enum: ['separate', 'nominal'] }
}, required: ['organisationRowId', 'activityRowIds', 'coverage', 'scopeStatement'], additionalProperties: false };
const decision = { type: 'object', properties: {
  issueId: sha, decision: { type: 'string', enum: ['acknowledge', 'follow-up'] },
  actor: { type: 'string', minLength: 1 }, note: { type: 'string' }
}, required: ['issueId', 'decision', 'actor', 'note'], additionalProperties: false };
const definitionProperties = { ...selection, name: { type: 'string', minLength: 1 }, notes: { type: 'string' },
  comparisons: { type: 'array', items: comparison }, decisions: { type: 'array', items: decision } };
const definitionRequired = ['organisation', 'portfolios', 'name', 'notes', 'comparisons', 'decisions'];
const definition = { type: 'object', properties: definitionProperties, required: definitionRequired, additionalProperties: false };

/** Compose with sourceWorkspaceTools(tool); no new transport or authentication. */
export function organisationReconciliationTools(tool) {
  return [
    tool(TOOL_PREFIX + 'status', 'Read retained financial reconciliation cases and available organisation plans and activity portfolios.', scope, ['workspace'], read),
    tool(TOOL_PREFIX + 'inventory', 'Page cases, organisation plans or activity portfolios from one original status snapshot.',
      { ...scope, kind: { type: 'string', enum: ['cases', 'organisationPlans', 'activityPortfolios'] }, ...paging }, ['workspace', 'kind'], read),
    tool(TOOL_PREFIX + 'plan', 'Read the full selected reconciliation case and pinned financial report. An explicit revision selects historical work.',
      { ...scope, id: sha, revision: rev }, ['workspace', 'id'], read),
    tool(TOOL_PREFIX + 'history', 'Page the complete saved reconciliation history using the returned inventory snapshot.',
      { ...scope, id: sha, ...paging }, ['workspace', 'id'], read),
    tool(TOOL_PREFIX + 'request', 'Resolve the original saved action by its request ID before replaying an interrupted save or review.',
      { ...scope, requestId }, ['workspace', 'requestId'], read),
    tool(TOOL_PREFIX + 'catalog', 'Page native assessed organisation records or activity finance rows from exact saved revisions. Retain row IDs and snapshot to make explicit comparisons.',
      { ...scope, definition: { type: 'object', properties: selection, required: ['organisation', 'portfolios'], additionalProperties: false },
        section: { type: 'string', enum: ['organisation', 'activity'] }, ...paging }, ['workspace', 'definition', 'section'], read),
    tool(TOOL_PREFIX + 'preview', 'Calculate the complete proposed reconciliation from explicit row links. Decimal strings, currencies, dates, versions, hierarchy, coverage and exclusions remain distinct.',
      { ...scope, definition }, ['workspace', 'definition'], read),
    tool(TOOL_PREFIX + 'save', 'Save one complete reconciliation revision with a retained requestId. Updating a case requires id and expectedRevision. Exact replay returns the original saved result.',
      { ...scope, definition: { type: 'object', properties: { ...definitionProperties, requestId, id: sha, expectedRevision: rev },
        required: [...definitionRequired, 'requestId'], additionalProperties: false } }, ['workspace', 'definition'], { idempotent: true }),
    tool(TOOL_PREFIX + 'rows', 'Page every comparison, activity row, issue or decision from a pinned saved reconciliation revision.',
      { ...scope, id: sha, revision: rev, section: { type: 'string', enum: ['comparisons', 'activity', 'issues', 'decisions'] }, ...paging },
      ['workspace', 'id', 'revision', 'section'], read),
    tool(TOOL_PREFIX + 'review', 'Record a named approve or request_changes review as the next case revision, with exact acknowledged issue IDs and retained requestId.',
      { ...scope, definition: { type: 'object', properties: { requestId, id: sha, expectedRevision: rev,
        decision: { type: 'string', enum: ['approve', 'request_changes'] }, actor: { type: 'string', minLength: 1 },
        note: { type: 'string' }, acknowledgedIssueIds: { type: 'array', items: sha, uniqueItems: true } },
        required: ['requestId', 'id', 'expectedRevision', 'decision', 'actor', 'note', 'acknowledgedIssueIds'], additionalProperties: false } },
      ['workspace', 'definition'], { idempotent: true }),
    tool(TOOL_PREFIX + 'compare', 'Compare two exact saved reconciliation revisions and their full source, selections, findings and review changes.',
      { ...scope, before: pinned, after: pinned }, ['workspace', 'before', 'after'], read),
    tool(TOOL_PREFIX + 'file', 'Retain the complete financial report HTML, comparison CSV or JSON for the original full-file reader.',
      { ...scope, id: sha, revision: rev, kind: { type: 'string', enum: ['report', 'csv', 'json'] } },
      ['workspace', 'id', 'revision', 'kind'], { idempotent: true }),
    tool(TOOL_PREFIX + 'export', 'Retain the complete selected reconciliation ZIP including nested original organisation and activity source packages, financial records, revisions and reviews.',
      { ...scope, id: sha, revision: rev }, ['workspace', 'id', 'revision'], { idempotent: true }),
    tool(TOOL_PREFIX + 'receive', 'Receive a complete reconciliation ZIP from a configured packet file or retained reconciliation export, and reopen the imported historical and current cases.',
      { ...scope, file: alias, exportId: sha, fromWorkspace: alias }, ['workspace'], { idempotent: true })
  ];
}
export const isOrganisationReconciliationTool = name => typeof name === 'string' && name.startsWith(TOOL_PREFIX);
const fail = message => Object.assign(new Error(message), { code: 'INVALID_PARAMS' });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, minimum, maximum) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw fail('Select an integer in the documented range.');
  return value;
};
const digest = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw fail('Select a full saved SHA-256.');
  return value;
};
const query = value => new URLSearchParams(Object.entries(value).filter(([, item]) => item !== undefined)
  .map(([key, item]) => [key, String(item)])).toString();

/**
 * The original provider supplies:
 * workspace, json(route, body?), page(rows,input),
 * retain(route,kind,selection,fileInfo), receive(input,route,allowedExportKinds).
 * receive resolves configured files/retained exports with its existing private
 * file, hash and workspace checks before calling the original upload helper.
 */
export async function executeOrganisationReconciliation(name, input, { workspace, json, page: paged, retain, receive }) {
  const result = native => ({ workspace, native });
  if (!isOrganisationReconciliationTool(name)) throw fail('Select a reconciliation tool.');
  const action = name.slice(TOOL_PREFIX.length);
  const id = () => digest(input.id);
  const selectedRevision = required => input.revision === undefined && !required ? undefined
    : integer(input.revision, 1, Number.MAX_SAFE_INTEGER);
  const page = () => ({ offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
    limit: integer(input.limit ?? 50, 1, 250),
    ...(input.expectedSnapshot === undefined ? {} : { expectedSnapshot: digest(input.expectedSnapshot) }) });
  switch (action) {
    case 'status': return result(await json(API + 'status'));
    case 'inventory': {
      if (!['cases', 'organisationPlans', 'activityPortfolios'].includes(input.kind)) throw fail('Select a reconciliation inventory.');
      const status = await json(API + 'status');
      if (!Array.isArray(status[input.kind])) throw fail('The original inventory was not returned.');
      return result({ kind: input.kind, ...paged(status[input.kind], input) });
    }
    case 'plan': return result(await json(API + 'plan?' + query({ id: id(), revision: selectedRevision(false) })));
    case 'history': return result(paged((await json(API + 'history?' + query({ id: id() }))).history, input));
    case 'request':
      if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.requestId))
        throw fail('Select the original request ID.');
      return result(await json(API + 'request?' + query({ requestId: input.requestId })));
    case 'catalog': {
      if (!plain(input.definition) || !['organisation', 'activity'].includes(input.section)) throw fail('Supply the original selection and register section.');
      const { expectedSnapshot, ...pagination } = page();
      const native = await json(API + 'catalog', { ...input.definition, section: input.section, ...pagination });
      if (expectedSnapshot !== undefined && native.snapshotSha256 !== expectedSnapshot)
        throw Object.assign(new Error('The selected financial register changed. Restart at page zero.'), { code: 'SOURCE_INVENTORY_CHANGED' });
      return result(native);
    }
    case 'preview':
    case 'save':
    case 'review':
      if (!plain(input.definition)) throw fail('Supply the complete original request definition.');
      return result(await json(API + action, input.definition));
    case 'rows':
      if (!['comparisons', 'activity', 'issues', 'decisions'].includes(input.section)) throw fail('Select a saved register section.');
      return result(await json(API + 'rows?' + query({ id: id(), revision: selectedRevision(true), section: input.section, ...page() })));
    case 'compare':
      if (!plain(input.before) || !plain(input.after)) throw fail('Select both saved case revisions.');
      return result(await json(API + 'compare', { before: { id: digest(input.before.id), revision: integer(input.before.revision, 1, Number.MAX_SAFE_INTEGER) },
        after: { id: digest(input.after.id), revision: integer(input.after.revision, 1, Number.MAX_SAFE_INTEGER) } }));
    case 'file': {
      if (!['report', 'csv', 'json'].includes(input.kind)) throw fail('Select the complete report, CSV or JSON file.');
      const selection = { case: id(), revision: selectedRevision(true), fileKind: input.kind };
      return retain(API + 'file?' + query({ id: selection.case, revision: selection.revision, kind: input.kind }),
        'reconciliation-file', selection, { name: 'iati-reconciliation-' + input.kind + ({ report: '.html', csv: '.csv', json: '.json' }[input.kind]),
          contentType: { report: 'text/html', csv: 'text/csv', json: 'application/json' }[input.kind], verifyNativeDescriptor: true });
    }
    case 'export': {
      const selection = { case: id(), revision: selectedRevision(true) };
      return retain(API + 'export?' + query({ id: selection.case, revision: selection.revision }), 'reconciliation', selection,
        { name: 'iati-reconciliation.zip', contentType: 'application/zip', verifyNativeDescriptor: true });
    }
    case 'receive':
      if (typeof receive !== 'function') throw fail('The original complete packet receiver is not composed.');
      if ((input.file === undefined) === (input.exportId === undefined)) throw fail('Select exactly one packet file or retained export.');
      if (input.file !== undefined && input.fromWorkspace !== undefined) throw fail('fromWorkspace selects a retained export.');
      return result(await receive(input, API + 'receive', ['reconciliation']));
    default: throw fail('Unknown original reconciliation operation.');
  }
}
