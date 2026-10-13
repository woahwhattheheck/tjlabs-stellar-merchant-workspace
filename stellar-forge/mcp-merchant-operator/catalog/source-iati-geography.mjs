// MIT. Agent metadata for the original IATI geography review workflow.
export const IATI_GEOGRAPHY_TOOL_PREFIX = 'merchant_source_iati_geography_';

export function iatiGeographyTools(tool, { selection, digest, page, read, alias }) {
  const revision = { type: 'integer', minimum: 1 };
  const selected = { ...selection, id: digest, revision };
  const request = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' };
  const complete = { type: 'object' };
  const named = (name, description, properties, required, hints = read) =>
    tool(IATI_GEOGRAPHY_TOOL_PREFIX + name, description, properties, required, hints);
  return [
    named('state', 'Read the original geography workspace identity, complete coordinate/source contract and saved-review count.', selection, ['workspace']),
    named('reviews', 'Page saved geography reviews with exact source editions, coverage, review status and inventory snapshot.', { ...selection, ...page }, ['workspace']),
    named('review', 'Read the complete current or selected original geography review, source editions, acquisition, named findings and report.', selected, ['workspace', 'id']),
    named('history', 'Page every original geography review revision through the selected revision; continue the returned snapshot.', { ...selected, ...page }, ['workspace', 'id']),
    named('report', 'Recompute the saved geographic coverage from its complete original native editions and source-bound findings.', selected, ['workspace', 'id']),
    named('request', 'Resolve one original geography save request and its historical result after an interrupted reply.', { ...selection, requestId: request }, ['workspace', 'requestId']),
    named('save', 'Save a complete geography review on original publisher editions. definition includes requestId and, for edits, id/expectedRevision. Exact request replay returns its original revision.', { ...selection, definition: complete }, ['workspace', 'definition'], { idempotent: true }),
    named('rows', 'Page complete location associations and findings from one exact saved review revision. query includes id/revision and optional source/search/activityId/rowId/coordinateStatus/decision/classification/offset/limit.', { ...selection, query: complete }, ['workspace', 'query']),
    named('points', 'Page valid reported latitude/longitude points for the exact saved revision using the same native location filters. Missing and invalid coordinates remain in the full register.', { ...selection, query: complete }, ['workspace', 'query']),
    named('compare', 'Compare two saved geography revisions through the original native edition engine. definition includes id/beforeRevision/afterRevision and explicit replacement-source pairs when selected.', { ...selection, definition: complete }, ['workspace', 'definition'], { idempotent: true }),
    named('comparison', 'Read one complete saved geography comparison, definition changes, source replacements and named finding changes.', { ...selection, id: digest }, ['workspace', 'id']),
    named('changes', 'Page the complete native row changes belonging to one saved geography comparison.', { ...selection, id: digest, native: digest, offset: page.offset, limit: page.limit }, ['workspace', 'id', 'native']),
    named('export', 'Retain the complete geography packet, GeoJSON, CSV, JSON or offline interactive HTML. Packets include every original publisher XML, native edition, review revision, original save request, comparison and linked portfolio. Deliver through merchant_source_file_read.', { ...selected, format: { type: 'string', enum: ['packet', 'geojson', 'csv', 'json', 'html'] } }, ['workspace', 'id'], { idempotent: true }),
    named('receive', 'Receive a whole geography packet into another original IATI workspace and continue the same review/history/request identities. Select one configured file or retained exportId, optionally fromWorkspace.', { ...selection, file: alias, exportId: digest, fromWorkspace: alias }, ['workspace'], { idempotent: true }),
  ];
}
