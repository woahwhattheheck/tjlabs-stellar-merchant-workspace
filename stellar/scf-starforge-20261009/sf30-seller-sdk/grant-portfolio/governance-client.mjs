// MIT. Governance batches retain the original portfolio action and exact selected revision.
import {randomUUID} from 'node:crypto';
export const GRANT_GOVERNANCE_SCHEMA='stellar-forge.grant-governance.v1';
export const GRANT_GOVERNANCE_COLLECTIONS=Object.freeze([
  'committees','meetings','decisions','evaluations','findings','responses','followups',
]);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_GOVERNANCE_INPUT'});};
export function governanceBatch(actor,expectedGovernanceRevision,changes=[],{archive=[]}={}){
  need(typeof actor==='string'&&actor.trim()&&Number.isSafeInteger(expectedGovernanceRevision)&&
    expectedGovernanceRevision>=0&&Array.isArray(changes)&&Array.isArray(archive),
    'Keep the actor, exact governance revision and complete changed records.');
  return {schema:GRANT_GOVERNANCE_SCHEMA,actor,expectedGovernanceRevision,changes,archive};
}
export function newGovernanceRecord(collection,fields,id=randomUUID()){
  need(GRANT_GOVERNANCE_COLLECTIONS.includes(collection)&&plain(fields),'Select a governance register and complete fields.');
  return {collection,id,expectedRevision:0,fields};
}
export function reviseGovernanceRecord(collection,record,fields){
  need(GRANT_GOVERNANCE_COLLECTIONS.includes(collection)&&plain(record)&&plain(fields)&&
    Number.isSafeInteger(record.revision)&&record.revision>0,'Select the original governance record and complete changed fields.');
  return {collection,id:record.id,expectedRevision:record.revision,fields};
}
/** Preserve the original final record. Following editions start with a new stable record identity. */
export function followingGovernanceRecord(collection,record,fields,id=randomUUID()){
  need(GRANT_GOVERNANCE_COLLECTIONS.includes(collection)&&plain(record)&&record.status!=='draft'&&plain(fields),
    'Select the original published or recorded governance edition.');
  return newGovernanceRecord(collection,{...fields,supersedesId:record.id,status:'draft'},id);
}
export async function saveGrantGovernance(client,operationId,selection,governance,options={}){
  need(plain(selection)&&typeof selection.portfolioId==='string'&&Number.isSafeInteger(selection.revision)&&selection.revision>0,
    'Select the original portfolio and revision.');
  need(plain(governance)&&governance.schema===GRANT_GOVERNANCE_SCHEMA,'Use the complete governance change input.');
  const portfolio=await client.portfolio(selection.portfolioId,{revision:selection.revision,signal:options.signal});
  need(portfolio.definition.programme,'Create the original programme and partners before governance administration.');
  need(governance.expectedGovernanceRevision===(portfolio.definition.governance?.revision??0),'The selected governance revision differs.');
  const {name,notes,sources,review}=portfolio.definition;
  return client.savePortfolio(operationId,{id:selection.portfolioId,expectedPortfolioRevision:selection.revision,
    name,notes,sources,review,governance},options);
}
/** Source replacements and simultaneous programme changes use this same atomic retained action. */
export async function saveProgrammeAndGovernance(client,operationId,selection,{programme,governance},options={}){
  need(plain(selection)&&typeof selection.portfolioId==='string'&&Number.isSafeInteger(selection.revision)&&selection.revision>0,
    'Select the original portfolio and revision.');
  need(plain(programme)&&plain(governance)&&governance.schema===GRANT_GOVERNANCE_SCHEMA,
    'Supply the complete programme and governance changes.');
  const portfolio=await client.portfolio(selection.portfolioId,{revision:selection.revision,signal:options.signal});
  need(programme.expectedProgrammeRevision===(portfolio.definition.programme?.revision??0)&&
    governance.expectedGovernanceRevision===(portfolio.definition.governance?.revision??0),'The selected programme or governance revision differs.');
  const {name,notes,sources,review}=portfolio.definition;
  return client.savePortfolio(operationId,{id:selection.portfolioId,expectedPortfolioRevision:selection.revision,
    name,notes,sources,review,programme,governance},options);
}
