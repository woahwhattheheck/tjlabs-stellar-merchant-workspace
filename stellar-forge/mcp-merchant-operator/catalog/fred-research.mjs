// MIT. Static metadata for Research in the existing FRED workspace provider.
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$' };
const operation = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$' };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 1 };
const text = maxLength => ({ type: 'string', maxLength });
const requiredText = maxLength => ({ type: 'string', minLength: 1, maxLength });
const page = { offset: { type: 'integer', minimum: 0, maximum: 1000000 },
  limit: { type: 'integer', minimum: 1, maximum: 100 }, expectedRevision: revision };
const timestamp = requiredText(64);
const workspace = { workspace: alias };
const mutation = { ...workspace, id: operation, expectedRevision: revision };
const read = { readOnly: true, idempotent: true }, change = { idempotent: true };
const definition = { type: 'object', description: 'Complete original Research definition, validated by the maintained catalogue model.' };
export const fredResearchFileSelection = {
  snapshotId: digest, entryId: id, productId: id, editionId: digest, expectedRevision: revision
};
export function fredResearchTools(tool) {
  return [
    tool('merchant_fred_research_catalogue',
      'Search the original Research source catalogue by text/topic/geography/status/due. Continue nextOffset with the same filters, expectedRevision and returned asOf. Products and taxonomy have separate complete pages.',
      { ...workspace, ...page, query: text(1000), topic: text(160), geography: text(160),
        status: { type: 'string', enum: ['', 'RETIRED', 'SOURCE_NEEDED', 'SOURCE_UNAVAILABLE', 'APPROVED', 'REJECTED', 'NEEDS_WORK', 'REVIEW_NEEDED'] },
        due: { type: 'boolean' }, asOf: timestamp }, ['workspace'], read),
    tool('merchant_fred_research_taxonomy', 'Read every original topic or geography through complete revision-bound pages.',
      { ...workspace, ...page, section: { type: 'string', enum: ['topics', 'geographies'] } },
      ['workspace', 'section'], read),
    tool('merchant_fred_research_entry', 'Read complete source definition versions, retained source descriptors or literal review history. Keep entryId, section, expectedRevision and asOf across pages; original bytes are available through research-source file reads.',
      { ...workspace, ...page, entryId: id, section: { type: 'string', enum: ['versions', 'sources', 'reviews'] }, asOf: timestamp },
      ['workspace', 'entryId', 'section'], read),
    tool('merchant_fred_research_products', 'Search the original Research product inventory, including saved version and issued-edition counts; follow nextOffset at the same revision.',
      { ...workspace, ...page, query: text(1000) }, ['workspace'], read),
    tool('merchant_fred_research_product', 'Read complete saved product versions, issued editions, explicit source requirements or coverage. Keep productId, section, expectedRevision and returned asOf across pages. Issue only after the original source requirements are covered.',
      { ...workspace, ...page, productId: id, section: { type: 'string', enum: ['versions', 'editions', 'requirements', 'coverage'] }, asOf: timestamp },
      ['workspace', 'productId', 'section'], read),
    tool('merchant_fred_research_entry_save', 'Save an original Research source definition using the same project journal and stable operation ID. Fields: entryId/title/publisher/url/kind/topics/geographies/cadenceDays/expectedRelease/licence/notes/retired.',
      { ...mutation, definition }, ['workspace', 'id', 'expectedRevision', 'definition'], change),
    tool('merchant_fred_research_import', 'Import the complete UTF-8 catalogue CSV from a configured research-catalogue input alias. Review its exact expectedSha256. The original model validates all rows and retains one original id/revision operation.',
      { ...mutation, input: alias, expectedSha256: digest },
      ['workspace', 'id', 'expectedRevision', 'input', 'expectedSha256'], change),
    tool('merchant_fred_research_source_acquire', 'Acquire the source URL from its exact current entry/definition on the original host. The native programme retains full bytes, HTTP status and headers, then requires an explicit source review.',
      { ...mutation, entryId: id, definitionId: digest },
      ['workspace', 'id', 'expectedRevision', 'entryId', 'definitionId'], change),
    tool('merchant_fred_research_source_upload', 'Upload the complete original binary/text source from a configured research-source alias, at most16MiB. Bind the reviewed file hash, definition, filename, media type and optional original retrievedAt; retries retain the same operation and source bytes.',
      { ...mutation, entryId: id, definitionId: digest, input: alias, expectedSha256: digest,
        filename: requiredText(180), contentType: requiredText(250), retrievedAt: timestamp },
      ['workspace', 'id', 'expectedRevision', 'entryId', 'definitionId', 'input', 'expectedSha256', 'filename', 'contentType'], change),
    tool('merchant_fred_research_review', 'Record the explicit operator decision and literal review note on the latest original source for its current definition. ACCEPT requires the original successful source response.',
      { ...mutation, snapshotId: digest, decision: { type: 'string', enum: ['ACCEPT', 'NEEDS_WORK', 'REJECT'] },
        reviewer: requiredText(200), note: requiredText(12000) },
      ['workspace', 'id', 'expectedRevision', 'snapshotId', 'decision', 'reviewer', 'note'], change),
    tool('merchant_fred_research_product_save', 'Save the complete Research product definition and explicit requirements. Fields: productId/title/audience/purpose/format/notes/retired/requirements; each requirement retains id/title/entryIds/topics/geographies/note.',
      { ...mutation, definition }, ['workspace', 'id', 'expectedRevision', 'definition'], change),
    tool('merchant_fred_research_product_issue', 'Issue the original product only when every explicit requirement has reviewed source coverage. Retain the real issuer, note and same original operation ID; the native edition records each exact source/review identity.',
      { ...mutation, productId: id, issuedBy: requiredText(200), note: text(12000) },
      ['workspace', 'id', 'expectedRevision', 'productId', 'issuedBy'], change),
    tool('merchant_fred_research_resume', 'Continue the exact original pending Research operation using its retained payload. First inspect merchant_fred_operation; a completed operation is already available there. Keep its original id/action/expectedRevision.',
      { ...mutation, action: { type: 'string', enum: ['research-entry-save', 'research-import', 'research-source-acquire',
        'research-source-upload', 'research-review', 'research-product-save', 'research-product-issue'] } },
      ['workspace', 'id', 'expectedRevision', 'action'], change)
  ];
}
