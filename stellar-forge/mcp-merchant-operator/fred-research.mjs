// MIT. Research views use the original economic catalogue and original project revision.
import { catalogue, validateResearchState, definition, normalizeProduct, importDefinitions,
  currentDefinition, sourceStatus, productCoverage, exportDefinitions, key, instant, need,
  MAX_SOURCE_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/model.mjs';
import { createHash } from 'node:crypto';

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (message, code = 'FRED_CLIENT_RESEARCH_INVALID', details = {}) => {
  throw Object.assign(new Error(message), { code, ...details });
};
export const RESEARCH_KINDS = Object.freeze({
  saveResearchEntry: 'research-entry-save', importResearchCatalogue: 'research-import',
  acquireResearchSource: 'research-source-acquire', uploadResearchSource: 'research-source-upload',
  reviewResearchSource: 'research-review', saveResearchProduct: 'research-product-save',
  issueResearchProduct: 'research-product-issue'
});
export function researchInput(value = {}) {
  if (!plain(value)) fail('Use a complete Research selection.');
  return JSON.parse(JSON.stringify(value));
}
function pin(state, input) {
  validateResearchState(state);
  if (input.expectedRevision !== undefined && state.revision !== input.expectedRevision)
    fail('The economic project changed; reopen this Research view at its current revision.',
      'FRED_CLIENT_REVISION_CHANGED', { revision: state.revision });
  if ((input.offset ?? 0) > 0 && input.expectedRevision === undefined)
    fail('Continue a Research page with its original expectedRevision.');
  return { projectId: state.id, revision: state.revision };
}
function asOf(input) {
  if ((input.offset ?? 0) > 0 && input.asOf === undefined)
    fail('Continue Research coverage and due-date pages with the original asOf.');
  return instant(input.asOf ?? new Date().toISOString());
}
function paged(values, input) {
  const offset = input.offset ?? 0, limit = input.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > values.length ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    fail('Choose an offset in this Research collection and a limit from 1 to 100.');
  const items = []; let bytes = 0;
  for (const value of values.slice(offset, offset + limit)) {
    const size = Buffer.byteLength(JSON.stringify(value));
    if (size > 700000 && items.length === 0)
      fail('This complete record exceeds the tool page capacity; download its retained entry or product file.',
        'FRED_CLIENT_RESEARCH_FILE_REQUIRED');
    if (bytes + size > 700000) break;
    items.push(value); bytes += size;
  }
  return { total: values.length, offset, limit, returned: items.length,
    nextOffset: offset + items.length < values.length ? offset + items.length : null, items };
}
function entryAt(state, id) {
  key(id); const cat = catalogue(state), entry = cat.entries.find(e => e.id === id);
  if (!entry) fail('Choose a retained Research entry.', 'FRED_CLIENT_RESEARCH_NOT_FOUND');
  return { cat, entry };
}
function productAt(state, id) {
  key(id); const cat = catalogue(state), product = cat.products.find(p => p.id === id);
  if (!product) fail('Choose a retained Research product.', 'FRED_CLIENT_RESEARCH_NOT_FOUND');
  return { cat, product };
}
export function researchCatalogueQuery(input) {
  input = researchInput(input);
  if ((input.offset ?? 0) > 0 && input.expectedRevision === undefined)
    fail('Continue catalogue pages with the original expectedRevision.');
  const query = new URLSearchParams({ asOf: asOf(input), offset: String(input.offset ?? 0),
    limit: String(input.limit ?? 20) });
  for (const name of ['query', 'topic', 'geography', 'status'])
    if (input[name] !== undefined) query.set(name, input[name]);
  if (input.due !== undefined) query.set('due', String(input.due));
  return query;
}
export function researchCatalogueResult(value, input, projectId) {
  if (value?.projectId !== projectId || !Number.isSafeInteger(value.revision) ||
      !Array.isArray(value.rows) || !Number.isSafeInteger(value.total) ||
      value.offset !== (input.offset ?? 0) || value.limit !== (input.limit ?? 20))
    fail('The original Research catalogue response changed.');
  if (input.expectedRevision !== undefined && value.revision !== input.expectedRevision)
    fail('The economic project changed; restart the original catalogue page.',
      'FRED_CLIENT_REVISION_CHANGED', { revision: value.revision });
  if (input.asOf !== undefined && value.asOf !== instant(input.asOf))
    fail('The original catalogue coverage timestamp changed.');
  // The native catalogue includes all products and editions. Those have their own complete pages.
  const rows = paged(value.rows, { offset: 0, limit: input.limit ?? 20 });
  return { projectId: value.projectId, revision: value.revision, asOf: value.asOf,
    total: value.total, offset: value.offset, limit: value.limit, returned: rows.returned,
    nextOffset: value.offset + rows.returned < value.total ? value.offset + rows.returned : null,
    rows: rows.items, counts: value.counts,
    products: 'merchant_fred_research_products', taxonomy: 'merchant_fred_research_taxonomy' };
}
export function researchTaxonomy(state, input) {
  const binding = pin(state, input), cat = catalogue(state);
  if (!['topics', 'geographies'].includes(input.section)) fail('Choose topics or geographies.');
  const values = [...new Set(cat.entries.flatMap(e => currentDefinition(cat, e.id).definition[input.section]))].sort();
  return { ...binding, section: input.section, ...paged(values, input) };
}
export function researchEntryPage(state, input) {
  const binding = pin(state, input), { cat, entry } = entryAt(state, input.entryId), at = asOf(input);
  const sections = { versions: entry.versions, sources: cat.sources.filter(s => s.entryId === entry.id),
    reviews: cat.reviews.filter(r => r.entryId === entry.id) };
  if (!Object.hasOwn(sections, input.section)) fail('Choose entry versions, sources or reviews.');
  return { ...binding, entryId: entry.id, currentId: entry.currentId, asOf: at,
    current: sourceStatus(cat, entry.id, at), section: input.section, ...paged(sections[input.section], input) };
}
export function researchProductsPage(state, input) {
  const binding = pin(state, input), cat = catalogue(state), query = input.query?.toLowerCase() ?? '';
  const products = cat.products.map(p => {
    const d = p.versions.find(v => v.id === p.currentId).definition;
    return { productId: p.id, currentId: p.currentId, title: d.title, audience: d.audience,
      format: d.format, retired: d.retired, versions: p.versions.length, editions: p.editions.length,
      requirements: d.requirements.length };
  }).filter(p => !query || [p.productId, p.title, p.audience, p.format].join(' ').toLowerCase().includes(query));
  return { ...binding, ...paged(products, input) };
}
export function researchProductPage(state, input) {
  const binding = pin(state, input), { cat, product } = productAt(state, input.productId), at = asOf(input);
  const current = product.versions.find(v => v.id === product.currentId);
  const sections = { versions: product.versions, editions: product.editions,
    requirements: current.definition.requirements, coverage: productCoverage(cat, current.definition, at) };
  if (!Object.hasOwn(sections, input.section)) fail('Choose product versions, editions, requirements or coverage.');
  const { requirements, ...definition } = current.definition;
  return { ...binding, productId: product.id, currentId: product.currentId, asOf: at, definition,
    section: input.section, ...paged(sections[input.section], input) };
}
export function researchActionInput(action, value) {
  const input = researchInput(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(input.id ?? '') ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
    fail('Keep the original operation ID and expected project revision.');
  if (input.resume === true) return { id: input.id, expectedRevision: input.expectedRevision, resume: true };
  if (action === 'research-entry-save') input.definition = definition(input.definition);
  else if (action === 'research-product-save') input.definition = normalizeProduct(input.definition);
  else if (action === 'research-import') {
    input.definitions = importDefinitions(input.csv ?? input.definitions); delete input.csv;
    if (Buffer.byteLength(JSON.stringify({ definitions: input.definitions })) > 2 * 1024 * 1024)
      fail('Select an explicit catalogue import within the original 2 MiB native operation capacity.');
  } else if (['research-source-acquire', 'research-source-upload'].includes(action)) {
    key(input.entryId);
    if (!/^[a-f0-9]{64}$/.test(input.definitionId ?? '')) fail('Keep the complete original source definition identity.');
    if (action === 'research-source-upload') {
      const bytes = Buffer.from(input.bodyBase64 ?? '', 'base64');
      if (bytes.length > MAX_SOURCE_BYTES || bytes.toString('base64') !== input.bodyBase64)
        fail('Upload the exact complete original source within 16 MiB.');
      if (input.retrievedAt !== undefined) input.retrievedAt = instant(input.retrievedAt);
    }
  } else if (action === 'research-review') {
    if (!/^[a-f0-9]{64}$/.test(input.snapshotId ?? '') ||
        !['ACCEPT', 'NEEDS_WORK', 'REJECT'].includes(input.decision))
      fail('Select the retained original source and an explicit review decision.');
  } else if (action === 'research-product-issue') key(input.productId);
  else fail('Select an original Research action.');
  return input;
}
export function researchFile(state, selection) {
  const binding = pin(state, selection), cat = catalogue(state);
  let value, name, type = 'application/json; charset=utf-8', content;
  if (selection.kind === 'research-catalogue') {
    content = exportDefinitions(cat); name = 'research-source-catalog.csv'; type = 'text/csv; charset=utf-8';
  } else if (selection.kind === 'research-entry') {
    const { entry } = entryAt(state, selection.entryId);
    value = { ...binding, entry, sources: cat.sources.filter(s => s.entryId === entry.id),
      reviews: cat.reviews.filter(r => r.entryId === entry.id) };
    name = 'research-entry-' + entry.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.json';
  } else if (selection.kind === 'research-product') {
    const { product } = productAt(state, selection.productId);
    const edition = selection.editionId === undefined ? null : product.editions.find(e => e.id === selection.editionId);
    if (selection.editionId !== undefined && !edition) fail('Choose an issued edition of this original product.');
    const ids = new Set((edition ? [edition] : product.editions).flatMap(e => e.sources.map(s => s.snapshotId)));
    value = { ...binding, product, selectedEdition: edition,
      sources: cat.sources.filter(s => ids.has(s.id)), reviews: cat.reviews.filter(r => ids.has(r.snapshotId)),
      originalFiles: 'The complete project bundle retains every original source body.' };
    name = 'research-product-' + product.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.json';
  } else fail('Choose a complete Research catalogue, entry or product file.');
  const bytes = Buffer.from(content ?? JSON.stringify(value, null, 2) + '\n', 'utf8');
  return { ...binding, name, type, bytes, sha256: sha(bytes), status: 200 };
}
export function researchSourceMember(state, selection) {
  pin(state, selection);
  if (!/^[a-f0-9]{64}$/.test(selection.snapshotId ?? '')) fail('Select the complete original Research source identity.');
  const source = catalogue(state).sources.find(s => s.id === selection.snapshotId);
  if (!source) fail('Choose a source belonging to this original project.', 'FRED_CLIENT_RESEARCH_NOT_FOUND');
  return { ...source };
}
