// MIT. Original document-link evidence operations for Merchant source workspaces.
export const IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX = 'merchant_source_iati_document_evidence_';
export const IATI_DOCUMENT_EVIDENCE_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const IATI_DOCUMENT_EVIDENCE_FILE_KINDS = Object.freeze(['report', 'register', 'plan', 'correction']);

export function iatiDocumentEvidenceTools(tool, { selection, digest, page, read }) {
  const revision = { type: 'integer', minimum: 1 };
  const saved = { ...selection, id: digest, revision };
  const rows = { ...saved, expectedSnapshot: digest };
  const nativeDefinition = { type: 'object',
    description: 'Complete unchanged native request including the original requestId. Preserve all fields and omitted versus empty rowPairs. For action files over the existing 128 KiB Merchant request limit, use document_evidence_client_cli.mjs with the original private connection file; its native action limit is 64 MiB.' };
  const mutation = { idempotent: true };
  const define = (action, description) => tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + action, description,
    { ...selection, definition: nativeDefinition }, ['workspace', 'definition'], mutation);
  return [
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'status',
      'Read the same document-evidence workspace used by the browser: original organisation plans, saved evidence plans, full workspace identity and active request receipts.',
      selection, ['workspace'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'plan',
      'Read one complete saved evidence plan. Omit revision for current, or select an explicit revision to reopen its exact original URL selection, observations and named review.',
      saved, ['workspace', 'id'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'history',
      'Page all original revisions of one evidence plan using the existing inventory snapshot. Continue nextOffset and expectedSnapshot without replacing later receiving notes.',
      { ...selection, id: digest, ...page }, ['workspace', 'id'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'request',
      'Recover the exact original request after a lost reply. Preserve ACQUIRING with its unchanged input and requestId; a terminal interrupted request records an INTERRUPTED observation. Reconcile this receipt before explicitly requesting any later observation.',
      { ...selection, requestId: { type: 'string', pattern: IATI_DOCUMENT_EVIDENCE_REQUEST.source } }, ['workspace', 'requestId'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'rows',
      'Read complete original evidence rows for an explicit saved revision, including observations and review decisions. Continue nextOffset with snapshotSha256 as expectedSnapshot; native pages contain at most 500 rows.',
      { ...rows, offset: page.offset, limit: { type: 'integer', minimum: 1, maximum: 500 } },
      ['workspace', 'id', 'revision'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'detail',
      'Read one original document row with every retained observation, original organisation XML and exact correction targets, bound to the selected evidence revision.',
      { ...rows, rowId: digest }, ['workspace', 'id', 'revision', 'rowId'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'observation',
      'Read the full dated HTTP evidence for an observation, including redirects, actual response status, public network addresses and original body descriptor. body.complete means HTTP message completion; documentComplete and named relevance review remain separate.',
      { ...selection, id: digest }, ['workspace', 'id'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'comparison',
      'Reopen one complete saved comparison, including exact source row pairs, added or removed documents, complete-body changes and indeterminate prefixes.',
      { ...selection, id: digest }, ['workspace', 'id'], read),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'correction',
      'Read the complete reviewed URL-correction draft for the existing organisation workflow. It retains the original revision guard, all cumulative source edits and rebaseRequired when the organisation plan has advanced.',
      saved, ['workspace', 'id', 'revision'], read),
    define('save',
      'Save an original document-evidence plan: requestId, name, exact organisation selection {id,revision,view,expectedSnapshot}, one to 500 distinct documentRowIds, optional limits and notes, and actor. Literal publisher URLs remain unchanged.'),
    define('note',
      'Save a named receiving or operating note as the next original evidence revision. Definition contains requestId, id, expectedRevision, name, notes and actor; original source selection, observations and unchanged review remain retained.'),
    define('observe',
      'Acquire one exact selected public URL through the native document fetcher. Definition contains requestId, id, expectedRevision, rowIds sharing that literal URL, actor and explicit acknowledgeNewObservation for rows already observed. Preserve an ACQUIRING response and recover this same request; capture creates dated evidence and keeps earlier observations.'),
    define('review',
      'Save one named decision for every selected document row. Definition contains requestId, id, expectedRevision, actor, note and decisions with rowId, observationId, decision and note. usable requires native documentComplete plus an explicit relevance judgment; needs_correction can include a reviewed correctedUrl for the original organisation draft.'),
    define('compare',
      'Save a complete comparison of two explicit evidence revisions. Definition contains requestId, before and after {id,revision}, actor, optional notes and rowPairs. Omitted rowPairs uses stable original-source matching; [] explicitly suppresses automatic pairing. Cross-source pairs must be unique.'),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'export',
      'Retain the complete native evidence ZIP, up to 4 GiB, with original organisation source, plan history, request receipts, observations, complete bodies or explicit prefixes, comparisons and reports. Omitted revision is resolved once and pinned before export. Read all retained bytes through merchant_source_file_read.',
      saved, ['workspace', 'id'], {}),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'file',
      'Retain the complete selected report HTML, document register CSV, plan JSON or correction-draft JSON after its native byte count and SHA256 verify. Use merchant_source_file_read for its exact bytes.',
      { ...saved, kind: { type: 'string', enum: IATI_DOCUMENT_EVIDENCE_FILE_KINDS } },
      ['workspace', 'id', 'revision', 'kind'], {}),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'body',
      'Retain the exact observed HTTP message body or explicitly retained prefix, up to 64 MiB. Verify both native response headers and the saved observation body descriptor. The result includes bodyComplete, documentComplete and the full original observation; retain these distinctions when interpreting the bytes.',
      { ...selection, observationId: digest }, ['workspace', 'observationId'], {}),
    tool(IATI_DOCUMENT_EVIDENCE_TOOL_PREFIX + 'receive',
      'Receive a complete document-evidence ZIP using an existing configured packet file, or a document-evidence exportId with optional fromWorkspace. The native importer preserves all original records and later recipient notes. Read currentPlan for the latest receiving revision and plan for the selected imported revision.',
      { ...selection, file: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' }, exportId: digest,
        fromWorkspace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' } },
      ['workspace'], mutation)
  ];
}
