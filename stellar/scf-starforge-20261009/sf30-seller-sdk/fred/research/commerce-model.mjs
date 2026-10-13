// MIT. Research edition commerce reuses the native asset seller and Buyer.
import { need, plain, clone, canonical, digest, key, instant } from './model.mjs';
import { normalizeQcewMerchantTerms } from '../qcew/publication-model.mjs';

export const RESEARCH_MERCHANT = 'stellar-forge.research-merchant.v1';
export const RESEARCH_COMMERCE = 'stellar-forge.research-commerce.v1';
export const RESEARCH_COMMERCE_EXTENSION = 'stellar-forge.research-commerce-bundle.v1';
export const RESEARCH_PACKAGE = 'research-package.json.gz';
export const RESEARCH_PUBLICATION_MAX_BYTES = 16 * 1024 * 1024;
export const RESEARCH_PUBLICATION_MAX_BUDGET = 64 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/;
const filePath = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(value) &&
  value !== '.' && value !== '..';
const contentType = value => typeof value === 'string' && /^[a-zA-Z0-9!#$%&'*+.^_`|~-]+\/[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(value);

export function normalizeResearchMerchantTerms({origin, path = '/research-products', payment} = {}) {
  return normalizeQcewMerchantTerms({origin, path, payment});
}
export function researchPublicationId(value) {
  need(HASH.test(value?.editionId ?? '') && HASH.test(value?.deliverySha256 ?? ''),
    'Select a complete issued Research edition.');
  key(value.productId);
  need(UUID.test(value.sourceProjectId ?? ''), 'Retain the original economic project identity.');
  return digest({schema: RESEARCH_MERCHANT, sourceProjectId: value.sourceProjectId,
    productId: value.productId, editionId: value.editionId, deliverySha256: value.deliverySha256,
    ...normalizeResearchMerchantTerms(value)});
}
export function researchMerchantPlanIdentity(plan) {
  return {schema: plan.schema, publicationId: plan.publicationId, sourceProjectId: plan.sourceProjectId,
    productId: plan.productId, editionId: plan.editionId, definitionId: plan.definitionId,
    manifestSha256: plan.manifestSha256, deliverySha256: plan.deliverySha256,
    origin: plan.origin, path: plan.path, payment: plan.payment, resource: plan.resource,
    downloads: plan.downloads, configSha256: plan.configSha256, offersSha256: plan.offersSha256};
}
export const researchMerchantPlanSha256 = plan => digest(researchMerchantPlanIdentity(plan));
export function researchPublicationRecord(plan, createdAt) {
  return {id: plan.publicationId, sourceProjectId: plan.sourceProjectId,
    productId: plan.productId, editionId: plan.editionId, definitionId: plan.definitionId,
    manifestSha256: plan.manifestSha256, deliverySha256: plan.deliverySha256,
    planSha256: plan.planSha256, origin: plan.origin, path: plan.path,
    payment: clone(plan.payment), resource: plan.resource, createdAt: instant(createdAt)};
}
export function validateResearchPublicationRecord(record, state = null) {
  need(plain(record) && ['id','editionId','definitionId','manifestSha256','deliverySha256','planSha256']
    .every(name => HASH.test(record[name] ?? '')) && UUID.test(record.sourceProjectId ?? ''),
    'The original Research publication identity changed.');
  key(record.productId);
  const terms = normalizeResearchMerchantTerms(record);
  need(canonical(terms) === canonical({origin:record.origin,path:record.path,payment:record.payment}) &&
    record.id === researchPublicationId(record) &&
    record.resource === record.origin + record.path + '/' + record.id + '/files/' + RESEARCH_PACKAGE &&
    instant(record.createdAt) === record.createdAt, 'The original Research publication terms changed.');
  if (state) {
    need(record.sourceProjectId === state.id, 'The publication belongs to another original economic project.');
    const product = state.research?.products.find(item => item.id === record.productId);
    const edition = product?.editions.find(item => item.id === record.editionId);
    need(edition?.definitionId === record.definitionId,
      'The publication lost its original issued Research edition.');
  }
  return record;
}
export function validateResearchMerchantPlan(plan, {record = null} = {}) {
  need(plain(plan) && plan.schema === RESEARCH_MERCHANT &&
    ['publicationId','editionId','definitionId','manifestSha256','deliverySha256','planSha256',
      'configSha256','offersSha256'].every(name => HASH.test(plan[name] ?? '')) &&
    UUID.test(plan.sourceProjectId ?? ''), 'Retain the complete original Research merchant plan.');
  key(plan.productId);
  const terms = normalizeResearchMerchantTerms(plan);
  need(canonical(terms) === canonical({origin:plan.origin,path:plan.path,payment:plan.payment}) &&
    plan.publicationId === researchPublicationId(plan) && plan.planSha256 === researchMerchantPlanSha256(plan),
    'The original Research merchant terms or plan identity changed.');
  const base = plan.origin + plan.path + '/' + plan.publicationId + '/files/';
  need(Array.isArray(plan.downloads) && plan.downloads.length >= 3 && plan.downloads.length <= 10006 &&
    new Set(plan.downloads.map(file => file?.path)).size === plan.downloads.length,
    'Keep the complete Research publication file inventory.');
  let total = 0;
  for (const file of plan.downloads) {
    need(plain(file) && filePath(file.path) && HASH.test(file.sha256 ?? '') &&
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= RESEARCH_PUBLICATION_MAX_BYTES &&
      contentType(file.contentType) && ['RESEARCH_PACKAGE','RESEARCH_MANIFEST','RESEARCH_MEMBER'].includes(file.role) &&
      file.resource === base + file.path, 'An original Research merchant resource changed.');
    total += file.bytes;
  }
  need(total <= RESEARCH_PUBLICATION_MAX_BUDGET &&
    plan.downloads.some(file => file.path === RESEARCH_PACKAGE && file.role === 'RESEARCH_PACKAGE') &&
    plan.downloads.some(file => file.path === 'manifest.json' && file.role === 'RESEARCH_MANIFEST') &&
    plan.resource === base + RESEARCH_PACKAGE, 'The complete Research publication exceeds native asset capacity or lost its package.');
  if (record) {
    validateResearchPublicationRecord(record);
    need(canonical(record) === canonical(researchPublicationRecord(plan,record.createdAt)),
      'The retained Research publication differs from its original merchant plan.');
  }
  return plan;
}
export function researchReceivingRecord(delivery, packageSha256, receivedAt) {
  need(HASH.test(packageSha256 ?? ''), 'Retain the exact received Research package identity.');
  return {id:packageSha256, deliverySha256:delivery.deliverySha256,
    manifestSha256:delivery.manifestSha256, sourceProjectId:delivery.sourceProjectId,
    productId:delivery.productId, editionId:delivery.editionId, receivedAt:instant(receivedAt)};
}
export function validateResearchReceivingRecord(record, state = null) {
  need(plain(record) && ['id','deliverySha256','manifestSha256','editionId']
    .every(name => HASH.test(record[name] ?? '')) && UUID.test(record.sourceProjectId ?? ''),
    'Retain the complete original Research receiving identity.');
  key(record.productId);
  need(instant(record.receivedAt) === record.receivedAt, 'Keep the original Research receiving time.');
  if (state) need(state.research?.products.some(product => product.id === record.productId &&
    product.editions.some(edition => edition.id === record.editionId)),
    'The received Research package lost its original issued product.');
  return record;
}
export function researchCommerceState(state) {
  return state.researchCommerce ?? {schema:RESEARCH_COMMERCE,publications:[],receivings:[]};
}
export function validateResearchCommerceState(state) {
  if (state.researchCommerce === undefined) return state;
  const value = state.researchCommerce;
  need(state.research && plain(value) && value.schema === RESEARCH_COMMERCE &&
    Object.keys(value).every(name => ['schema','publications','receivings'].includes(name)) &&
    Array.isArray(value.publications) && Array.isArray(value.receivings),
    'Keep the complete Research commerce inventory in its original economic project.');
  for (const name of ['publications','receivings']) need(value[name].length <= 5000 &&
    new Set(value[name].map(item => item?.id)).size === value[name].length,
    'Keep each original Research commerce operation once.');
  for (const record of value.publications) validateResearchPublicationRecord(record,state);
  for (const record of value.receivings) validateResearchReceivingRecord(record,state);
  return state;
}
export function retainResearchReceivingRecord(state, record) {
  validateResearchReceivingRecord(record,state);
  state.researchCommerce ??= clone(researchCommerceState(state));
  const original = state.researchCommerce.receivings.find(item => item.id === record.id);
  if (original) need(canonical({...original,receivedAt:record.receivedAt}) === canonical(record),
    'The original Research receiving identifies different source work.');
  else state.researchCommerce.receivings.push(clone(record));
  validateResearchCommerceState(state);
  return original ?? record;
}
