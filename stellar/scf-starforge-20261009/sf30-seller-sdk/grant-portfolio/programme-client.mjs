// MIT. Programme record batches use the original retained portfolio operation.
import {randomUUID} from 'node:crypto';
export const GRANT_PROGRAMME_SCHEMA = 'stellar-forge.grant-programme.v1';
export const GRANT_PROGRAMME_COLLECTIONS = Object.freeze([
  'nodes','partners','grants','milestones','indicators','observations',
  'risks','issues','documents','reports','closures',
]);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (condition, message) => {
  if (!condition) throw Object.assign(new Error(message), {code:'GRANT_PROGRAMME_INPUT'});
};

/** Capture the complete selected definition once; the original writer checks both revisions. */
export async function saveGrantProgramme(client, operationId, selection, programme, options = {}) {
  need(plain(selection) && typeof selection.portfolioId === 'string' &&
    Number.isSafeInteger(selection.revision) && selection.revision > 0,
  'Select the original portfolio and revision.');
  need(plain(programme) && programme.schema === GRANT_PROGRAMME_SCHEMA,
    'Use the complete programme change input.');
  const portfolio = await client.portfolio(selection.portfolioId, {revision:selection.revision, signal:options.signal});
  const {name, notes, sources, review} = portfolio.definition;
  need(programme.expectedProgrammeRevision === (portfolio.definition.programme?.revision ?? 0),
    'The selected programme revision differs.');
  return client.savePortfolio(operationId, {
    id:selection.portfolioId, expectedPortfolioRevision:selection.revision,
    name, notes, sources, review, programme,
  }, options);
}

/** New local projects can precede an external source capture; source IDs are added by the normal intake. */
export function createGrantProgramme(client, operationId, {name, notes = '', reviewer, sources = [], programme}, options) {
  need(plain(programme) && programme.schema === GRANT_PROGRAMME_SCHEMA &&
    programme.expectedProgrammeRevision === 0, 'A new programme has no earlier programme revision.');
  return client.savePortfolio(operationId, {name, notes, sources,
    review:{status:'draft', reviewer, note:''}, programme}, options);
}

/** An unsent record gets one stable ID; retain the returned change with the caller's operation. */
export function newProgrammeRecord(collection, fields, id = randomUUID()) {
  need(GRANT_PROGRAMME_COLLECTIONS.includes(collection) && plain(fields), 'Select a programme register and complete fields.');
  return {collection, id, expectedRevision:0, fields};
}

export function reviseProgrammeRecord(collection, record, fields) {
  need(GRANT_PROGRAMME_COLLECTIONS.includes(collection) && plain(record) &&
    Number.isSafeInteger(record.revision) && record.revision > 0 && plain(fields),
  'Select the original saved record and changed fields.');
  return {collection, id:record.id, expectedRevision:record.revision, fields};
}

export function programmeBatch(actor, expectedProgrammeRevision, changes, {archive = [], settings} = {}) {
  need(typeof actor === 'string' && actor.trim() && Number.isSafeInteger(expectedProgrammeRevision) &&
    expectedProgrammeRevision >= 0 && Array.isArray(changes) && Array.isArray(archive),
  'Keep the actor, original programme revision and complete changes.');
  return {schema:GRANT_PROGRAMME_SCHEMA, actor, expectedProgrammeRevision, changes, archive,
    ...(settings === undefined ? {} : {settings})};
}
