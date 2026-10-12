// MIT. Organisation budgets and documents on the original IATI source console.
export const IATI_ORGANISATION_TOOL_PREFIX = 'merchant_source_iati_organisation_';
export const IATI_ORGANISATION_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const IATI_ORGANISATION_FILE_KINDS = Object.freeze(['source', 'candidate', 'report', 'budgets', 'documents']);

export function iatiOrganisationTools(tool, { selection, digest, page, read }) {
  const revision = { type: 'integer', minimum: 1 };
  const requestId = { type: 'string', pattern: IATI_ORGANISATION_REQUEST.source };
  const nativeDefinition = { type: 'object', description: 'The complete original native request, including its unchanged requestId. Native validation and immutable request replay remain authoritative.' };
  const saved = { ...selection, id: digest, revision };
  const snapshot = {
    ...selection, sourceId: digest, id: digest, revision,
    view: { type: 'string', enum: ['source', 'candidate'] },
    organisationKey: digest, expectedSnapshot: digest
  };
  const section = { type: 'string', enum: ['budgets', 'documents', 'issues'] };
  return [
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'status',
      'Read the original organisation workspace identity, retained organisation sources and latest saved plans. This is the same workspace used by the operator browser.',
      selection, ['workspace'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'profile',
      'Inspect one complete original organisation XML source, including source-bound organisation keys, budget periods and document coverage. Financial values remain exact strings.',
      { ...selection, sourceId: digest }, ['workspace', 'sourceId'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'plan',
      'Read a saved organisation plan and its exact assessment, source, cumulative corrections, review and release. Select revision to reopen a historical edition.',
      saved, ['workspace', 'id'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'history',
      'Page the original revisions of one organisation plan. Continue the returned inventory snapshot with expectedSnapshot.',
      { ...selection, id: digest, ...page }, ['workspace', 'id'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'request',
      'Recover a saved organisation request after a lost reply. Returns RECORDED with the exact input and original plan, or NOT_RECORDED. Preserve the same requestId and bytes when continuing.',
      { ...selection, requestId }, ['workspace', 'requestId'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'rows',
      'Page complete budget, document or issue rows from immutable sourceId, or id plus an explicit saved revision. Saved-plan reads default to candidate; sourceId reads use source. Continue nextOffset with the returned snapshotSha256 as expectedSnapshot.',
      { ...snapshot, section, offset: page.offset, limit: { type: 'integer', minimum: 1, maximum: 250 } },
      ['workspace', 'section'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'detail',
      'Read one original organisation, budget or document row and its XML-bound correction targets. Use returned target IDs and beforeSha256 values; optional targetId reopens the exact selected element XML within that row. Select sourceId or id with an explicit revision.',
      { ...snapshot, rowId: digest, targetId: digest }, ['workspace', 'rowId'], read),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'save',
      'Save a full organisation plan through the original engine. Definition includes requestId, name, sourceId, organisationKeys, assessment and the full cumulative source-bound edits; changes include id and expectedRevision. Replaying unchanged bytes returns the original revision.',
      { ...selection, definition: nativeDefinition }, ['workspace', 'definition'], { idempotent: true }),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'review',
      'Record the actual named review of one original plan revision. Definition includes requestId, id, expectedRevision, decision (approve or request_changes), actor, note and acknowledgedIssueIds.',
      { ...selection, definition: nativeDefinition }, ['workspace', 'definition'], { idempotent: true }),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'release',
      'Prepare a complete organisation handover through the original reviewed release operation. Definition includes requestId, id, expectedRevision and reviewId, plus optional actor. Its original release and full file descriptors remain retained in the workspace.',
      { ...selection, definition: nativeDefinition }, ['workspace', 'definition'], { idempotent: true }),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'compare',
      'Compare two explicit saved organisation revisions using original source identities or reviewed unique rowPairs. Definition includes requestId, before and after {id,revision}; optional rowPairs, actor and notes. Amount arithmetic is limited to the original compatible budget contexts.',
      { ...selection, definition: nativeDefinition }, ['workspace', 'definition'], { idempotent: true }),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'export',
      'Retain the complete original organisation ZIP for an explicit saved revision, including full source/candidate XML, plan history, request/review records and reports. Read its exact bytes through merchant_source_file_read and receive through the organisation receive tool.',
      saved, ['workspace', 'id', 'revision'], {}),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'file',
      'Retain one complete original source XML, candidate XML, report HTML, budget CSV or document CSV for an explicit saved revision. The returned exportId identifies the verified complete bytes and preserves the selected plan/revision/fileKind.',
      { ...saved, kind: { type: 'string', enum: IATI_ORGANISATION_FILE_KINDS } },
      ['workspace', 'id', 'revision', 'kind'], {}),
    tool(IATI_ORGANISATION_TOOL_PREFIX + 'receive',
      'Receive one complete original organisation ZIP through the existing console. Choose a configured packet file handle, or an organisation exportId with optional fromWorkspace. The original importer verifies all members and preserves its native history and request identities.',
      { ...selection, file: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' }, exportId: digest,
        fromWorkspace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' } },
      ['workspace'], { idempotent: true })
  ];
}
