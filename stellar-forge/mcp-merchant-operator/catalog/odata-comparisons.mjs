// MIT. Complete live comparison metadata; original native source loads with its provider.
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const record = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const read = { readOnly: true, idempotent: true };
const page = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } };
const revision = { type: 'integer', minimum: 0 };
const fields = { type: 'array', minItems: 1, maxItems: 64, uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: 240 } };
const limits = { type: 'object', additionalProperties: false, properties: {
  maxInputBytes: { type: 'integer', minimum: 1, maximum: 536870912 },
  maxOutputBytes: { type: 'integer', minimum: 1, maximum: 134217728 },
  maxCells: { type: 'integer', minimum: 1, maximum: 1000000 },
} };
export function odataComparisonTools(tool) {
  const scoped = properties => ({ workspace: alias, liveServiceId: record, ...properties });
  const selected = properties => scoped({ comparisonId: record, ...properties });
  const required = ['workspace', 'liveServiceId', 'comparisonId'];
  return [
    tool('merchant_odata_live_comparisons',
      'Page the original live service’s complete and interrupted collection comparisons. Keep the saved comparison ID and exact original source-pair identity when continuing. Counts.matched refers to equal declared entity keys; changed/unchanged/before_only/after_only describe entity results.',
      scoped(page), ['workspace', 'liveServiceId'], read),
    tool('merchant_odata_live_comparison',
      'Inspect the original complete source pair, selected field declarations, exact comparison counts, current reviews, every original review version and retained file inventory. Each paginated array has its own nextOffset. Reopen this comparison before selecting a new review or publication revision.',
      selected(page), required, read),
    tool('merchant_odata_live_comparison_create',
      'Create or resume one saved comparison from two complete collections under this original live service. Supply both inspected collection hashes, stable comparisonId and original title. Native declared keys, exact scalar/null/selection/type semantics and bounded complete source/Analysis delivery remain authoritative.',
      selected({ beforeCollectionId: record, afterCollectionId: record,
        expectedBeforeSha256: hash, expectedAfterSha256: hash,
        title: { type: 'string', minLength: 1, maxLength: 160 }, fields, limits }),
      [...required, 'beforeCollectionId', 'afterCollectionId', 'expectedBeforeSha256', 'expectedAfterSha256', 'title'],
      { idempotent: true }),
    tool('merchant_odata_live_comparison_rows',
      'Page original changed cells or all joined entities, optionally filtered by native entity status. Rows keep the exact entityKey for review, original value spellings, null/selection states and typed-equality result. A matched key can have changed fields.',
      selected({ kind: { enum: ['cells', 'entities'] }, status: { enum: ['changed', 'unchanged', 'before_only', 'after_only'] }, ...page }),
      required, read),
    tool('merchant_odata_live_comparison_review',
      'Save an original comparison/entity/column/cell review. Retain requestId and its exact scope, entityKey, field, actor, status and note after an uncertain reply; exact replay reopens the first saved version. expectedRevision is checked for a new save and stays outside the signed request. Choose inline fields OR one pinned host comparisonReviews alias; the alias supports a complete native key beyond the MCP request-body limit.',
      selected({ reviewRequest: alias,
        requestId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' },
        expectedRevision: revision, scope: { enum: ['comparison', 'entity', 'column', 'cell'] },
        entityKey: { type: ['string', 'null'], maxLength: 2097152 }, field: { type: ['string', 'null'], maxLength: 240 },
        status: { enum: ['accepted', 'investigate', 'excluded', 'note'] },
        actor: { type: 'string', minLength: 1, maxLength: 160 }, note: { type: 'string', minLength: 1, maxLength: 8000 } }),
      required, { idempotent: true }),
    tool('merchant_odata_live_comparison_publish',
      'Publish the selected current review revision as an immutable complete analytical edition. Returns its editionId, exact source-document SHA256 and every required file reference. A later review produces another edition; repeated publication of the same revision reopens its original source.',
      selected({ expectedRevision: revision }), [...required, 'expectedRevision'], { idempotent: true }),
    tool('merchant_odata_live_comparison_source',
      'Read one explicitly published comparison edition’s complete original Analysis source document and every required ranged-file download reference. Require the published editionId AND source SHA256. Supply the actual registered Analysis source name and sourceRevision together for the original 13-column text mapping.',
      selected({ editionId: hash, expectedSha256: hash,
        source: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
        sourceRevision: { type: 'integer', minimum: 1 } }),
      [...required, 'editionId', 'expectedSha256'], read),
    tool('merchant_odata_live_comparison_restore',
      'Receive a complete original comparison, source pair and review history from one pinned host comparisonSources document OR one explicit published edition under another declared workspace. Keep the target comparisonId and source SHA256 across interruptions. Native receiving verifies every source packet and preserves a compatible longer local review history.',
      selected({ sourceDocument: alias, sourceWorkspace: alias, sourceLiveServiceId: record,
        sourceComparisonId: record, sourceEditionId: hash, expectedSha256: hash }),
      required, { idempotent: true }),
  ];
}
