// MIT. Budget planning uses the original portfolio writer and original retained requests.
import {randomUUID} from 'node:crypto';
export const GRANT_BUDGET_PLANNING_SCHEMA = 'stellar-forge.grant-budget-planning.v1';
export const GRANT_BUDGET_PLANNING_COLLECTIONS = Object.freeze(['scenarios','lines']);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const need = (v, message) => { if (!v) throw Object.assign(new Error(message), {code:'GRANT_BUDGET_PLANNING_INPUT'}); };
const FIELDS = {
  scenarios:['code','title','nodeId','owner','startMonth','endMonth','description','openingBalances','basedOn','reviewStatus','reviewer','reviewNote','documentIds','sourceRefs','notes'],
  lines:['scenarioId','nodeId','grantId','code','title','direction','category','period','amount','currency','classification','commitmentReference','cashDate','milestoneId','documentIds','sourceRefs','notes'],
};
const copy = v => JSON.parse(JSON.stringify(v));
function checkedFields(collection, fields) {
  need(FIELDS[collection] && plain(fields) && Object.keys(fields).every(k => FIELDS[collection].includes(k)),
    'Use the complete declared fields for the selected planning register.');
  return copy(fields);
}
export function planningBatch(actor, expectedPlanningRevision, changes, {archive = []} = {}) {
  need(typeof actor === 'string' && actor.trim() && Number.isSafeInteger(expectedPlanningRevision) &&
    expectedPlanningRevision >= 0 && Array.isArray(changes) && Array.isArray(archive) &&
    changes.length + archive.length <= 2000, 'Keep the actor, original revision and at most 2,000 changes.');
  return {schema:GRANT_BUDGET_PLANNING_SCHEMA, actor, expectedPlanningRevision, changes:copy(changes), archive:copy(archive)};
}
export function newPlanningRecord(collection, fields, id = randomUUID()) {
  return {collection,id,expectedRevision:0,fields:checkedFields(collection,fields)};
}
export function revisePlanningRecord(collection, record, fields) {
  need(plain(record) && typeof record.id === 'string' && Number.isSafeInteger(record.revision) && record.revision > 0 && !record.archived,
    'Select the current active original planning record.');
  return {collection,id:record.id,expectedRevision:record.revision,fields:checkedFields(collection,fields)};
}
export async function saveGrantBudgetPlanning(client, operationId, selection, planning, options = {}) {
  need(plain(selection) && typeof selection.portfolioId === 'string' && Number.isSafeInteger(selection.revision) &&
    selection.revision > 0 && plain(planning) && planning.schema === GRANT_BUDGET_PLANNING_SCHEMA,
    'Select the original saved portfolio and complete planning changes.');
  const p = await client.portfolio(selection.portfolioId, {revision:selection.revision, signal:options.signal});
  need((p.definition.planning?.revision ?? 0) === planning.expectedPlanningRevision, 'The selected planning revision differs.');
  const {name,notes,sources,review} = p.definition;
  return client.savePortfolio(operationId, {id:selection.portfolioId,expectedPortfolioRevision:selection.revision,
    name,notes,sources,review,planning}, options);
}
/** One stable complete copy; callers retain this returned plan before starting explicit save batches. */
export function copyPlanningScenario(scenario, lines, {code,title,id = randomUUID(),lineIds} = {}) {
  need(plain(scenario) && Number.isSafeInteger(scenario.revision) && scenario.revision > 0 &&
    typeof scenario.sha256 === 'string' && Array.isArray(lines) && typeof code === 'string' && code.trim() &&
    typeof title === 'string' && title.trim(), 'Copy one complete original scenario with its code, title and saved identity.');
  const selected = lines.filter(r => r.scenarioId === scenario.id && !r.archived);
  if (lineIds !== undefined) need(Array.isArray(lineIds) && lineIds.length === selected.length &&
    new Set(lineIds).size === lineIds.length, 'Retain one distinct new ID per original copied line.');
  const fields = collection => record => Object.fromEntries(FIELDS[collection].filter(k => Object.hasOwn(record,k)).map(k => [k,copy(record[k])]));
  const changes = [newPlanningRecord('scenarios', {...fields('scenarios')(scenario),code,title,
    basedOn:{id:scenario.id,revision:scenario.revision,sha256:scenario.sha256},reviewStatus:'working',reviewer:'',reviewNote:''}, id)];
  for (let index=0; index<selected.length; index++)
    changes.push(newPlanningRecord('lines', {...fields('lines')(selected[index]),scenarioId:id}, lineIds?.[index] ?? randomUUID()));
  return {scenarioId:id, basedOn:{id:scenario.id,revision:scenario.revision,sha256:scenario.sha256}, changes};
}
