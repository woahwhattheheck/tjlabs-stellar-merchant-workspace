// MIT. Award batches retain the original portfolio action and exact selected revision.
import {randomUUID} from 'node:crypto';
export const GRANT_AWARDS_SCHEMA='stellar-forge.grant-awards.v1';
export const GRANT_AWARDS_COLLECTIONS=Object.freeze([
  'rounds','applications','checks','assignments','assessments','decisions','agreements','claims','monitoring',
]);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(condition,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_INPUT'});};
export function awardsBatch(actor,expectedAwardsRevision,changes=[],{archive=[]}={}){
  need(typeof actor==='string'&&actor.trim()&&Number.isSafeInteger(expectedAwardsRevision)&&
    expectedAwardsRevision>=0&&Array.isArray(changes)&&Array.isArray(archive),
    'Keep the actor, exact awards revision and complete changed records.');
  return {schema:GRANT_AWARDS_SCHEMA,actor,expectedAwardsRevision,changes,archive};
}
export function newAwardRecord(collection,fields,id=randomUUID()){
  need(GRANT_AWARDS_COLLECTIONS.includes(collection)&&plain(fields),'Select an award register and complete fields.');
  return {collection,id,expectedRevision:0,fields};
}
export function reviseAwardRecord(collection,record,fields){
  need(GRANT_AWARDS_COLLECTIONS.includes(collection)&&plain(record)&&plain(fields)&&
    Number.isSafeInteger(record.revision)&&record.revision>0,'Select the original award record and complete changed fields.');
  return {collection,id:record.id,expectedRevision:record.revision,fields};
}
/** Preserve the original final record. Following editions start with a new stable record identity. */
export function followingAwardRecord(collection,record,fields,id=randomUUID()){
  need(GRANT_AWARDS_COLLECTIONS.includes(collection)&&plain(record)&&record.status!=='draft'&&plain(fields),
    'Select the original published or recorded award edition.');
  return newAwardRecord(collection,{...fields,supersedesId:record.id,status:'draft'},id);
}
export async function saveGrantAwards(client,operationId,selection,awards,options={}){
  need(plain(selection)&&typeof selection.portfolioId==='string'&&Number.isSafeInteger(selection.revision)&&selection.revision>0,
    'Select the original portfolio and revision.');
  need(plain(awards)&&awards.schema===GRANT_AWARDS_SCHEMA,'Use the complete award change input.');
  const portfolio=await client.portfolio(selection.portfolioId,{revision:selection.revision,signal:options.signal});
  need(portfolio.definition.programme,'Create the original programme and partners before award administration.');
  need(awards.expectedAwardsRevision===(portfolio.definition.awards?.revision??0),'The selected awards revision differs.');
  const {name,notes,sources,review}=portfolio.definition;
  return client.savePortfolio(operationId,{id:selection.portfolioId,expectedPortfolioRevision:selection.revision,
    name,notes,sources,review,awards},options);
}
/** Source replacements and simultaneous programme changes use this same atomic retained action. */
export async function saveProgrammeAndAwards(client,operationId,selection,{programme,awards},options={}){
  need(plain(selection)&&typeof selection.portfolioId==='string'&&Number.isSafeInteger(selection.revision)&&selection.revision>0,
    'Select the original portfolio and revision.');
  need(plain(programme)&&plain(awards)&&awards.schema===GRANT_AWARDS_SCHEMA,
    'Supply the complete programme and award changes.');
  const portfolio=await client.portfolio(selection.portfolioId,{revision:selection.revision,signal:options.signal});
  need(programme.expectedProgrammeRevision===(portfolio.definition.programme?.revision??0)&&
    awards.expectedAwardsRevision===(portfolio.definition.awards?.revision??0),'The selected programme or awards revision differs.');
  const {name,notes,sources,review}=portfolio.definition;
  return client.savePortfolio(operationId,{id:selection.portfolioId,expectedPortfolioRevision:selection.revision,
    name,notes,sources,review,programme,awards},options);
}
