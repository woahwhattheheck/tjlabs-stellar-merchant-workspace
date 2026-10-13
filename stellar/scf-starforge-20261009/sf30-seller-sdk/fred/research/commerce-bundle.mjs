// MIT. Complete original Research publications, customer intents and received packages.
import { resolve, join } from 'node:path';
import { privateDirectory } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { need, plain, canonical, sha } from './model.mjs';
import { decodeResearchEditionDelivery } from './delivery.mjs';
import { RESEARCH_COMMERCE_EXTENSION, RESEARCH_PACKAGE, researchCommerceState,
  validateResearchCommerceState, validateResearchMerchantPlan } from './commerce-model.mjs';
import { researchPublicationDirectory, researchMerchantDefinition, prepareResearchMerchant, readResearchMerchant } from './merchant.mjs';
import { exportResearchCustomerState, validateResearchCustomerState, receiveResearchCustomerState } from './purchase.mjs';

const PACKAGE_LIMIT=256*1024*1024;
function originalBytes(encoded) {
  need(typeof encoded==='string' && encoded.length<=Math.ceil(PACKAGE_LIMIT/3)*4+4,
    'Receive the complete original Research package within its retained capacity.');
  const bytes=Buffer.from(encoded,'base64');
  need(bytes.length>0 && bytes.length<=PACKAGE_LIMIT && bytes.toString('base64')===encoded,
    'The original Research package encoding changed.');
  return bytes;
}
function exactKeys(value,keys) {
  need(plain(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key)),
    'Retain the complete original Research commerce member.');
}
function receiving(directory,id) {
  need(/^[a-f0-9]{64}$/.test(id??''),'Retain the original Research receiving package digest.');
  return join(resolve(directory),'research','receivings',id);
}
function matchReceiving(record,bytes) {
  const checked=decodeResearchEditionDelivery(bytes),d=checked.delivery;
  need(record.id===sha(bytes) && record.deliverySha256===d.deliverySha256 &&
    record.manifestSha256===d.manifestSha256 && record.sourceProjectId===d.sourceProjectId &&
    record.productId===d.productId && record.editionId===d.editionId,
    'The received Research package differs from its original project record.');
  return checked;
}
export function validateResearchCommerceExtension(value,state) {
  validateResearchCommerceState(state);
  if(state.researchCommerce===undefined) {
    need(value===undefined||value===null,'Unexpected Research commerce source in this project.');
    return null;
  }
  exactKeys(value,['schema','publications','receivings']);
  need(value.schema===RESEARCH_COMMERCE_EXTENSION && Array.isArray(value.publications)&&Array.isArray(value.receivings),
    'Receive the complete original Research commerce extension.');
  const records=researchCommerceState(state);
  for(const name of ['publications','receivings'])need(value[name].length===records[name].length &&
    new Set(value[name].map(item=>item?.id)).size===records[name].length,
    'Keep every original Research '+name+' member once.');
  for(const item of value.publications) {
    exactKeys(item,['id','plan','packageBase64','customer']);
    const record=records.publications.find(row=>row.id===item.id);
    need(record,'Unexpected Research publication in the full project.');
    const bytes=originalBytes(item.packageBase64);
    const merchant=researchMerchantDefinition({deliveryBytes:bytes,origin:item.plan?.origin,path:item.plan?.path,payment:item.plan?.payment});
    validateResearchMerchantPlan(item.plan,{record});
    need(canonical(item.plan)===canonical(merchant.plan),'The complete Research publication plan changed.');
    validateResearchCustomerState(item.customer,merchant);
  }
  for(const item of value.receivings) {
    exactKeys(item,['id','packageBase64']);
    const record=records.receivings.find(row=>row.id===item.id);
    need(record,'Unexpected original Research receiving package in the full project.');
    matchReceiving(record,originalBytes(item.packageBase64));
  }
  return value;
}
export async function exportResearchCommerceExtension(directory,state) {
  if(state.researchCommerce===undefined)return null;
  validateResearchCommerceState(state);
  const records=researchCommerceState(state),publications=[],receivings=[];
  for(const record of records.publications) {
    const root=researchPublicationDirectory(directory,record.id),merchant=await readResearchMerchant(root);
    validateResearchMerchantPlan(merchant.plan,{record});
    publications.push({id:record.id,plan:merchant.plan,packageBase64:merchant.deliveryBytes.toString('base64'),
      customer:await exportResearchCustomerState(root,merchant)});
  }
  for(const record of records.receivings) {
    const bytes=await readBytes(join(receiving(directory,record.id),RESEARCH_PACKAGE),PACKAGE_LIMIT);
    matchReceiving(record,bytes);
    receivings.push({id:record.id,packageBase64:bytes.toString('base64')});
  }
  const value={schema:RESEARCH_COMMERCE_EXTENSION,publications,receivings};
  validateResearchCommerceExtension(value,state);
  return value;
}
export async function receiveResearchCommerceExtension(directory,value,state) {
  const validated=validateResearchCommerceExtension(value,state);
  if(!validated)return;
  for(const item of validated.publications) {
    const bytes=originalBytes(item.packageBase64),checked=decodeResearchEditionDelivery(bytes);
    const root=researchPublicationDirectory(directory,item.id);
    await prepareResearchMerchant({directory:root,delivery:checked.delivery,origin:item.plan.origin,
      path:item.plan.path,payment:item.plan.payment,originalDeliveryBytes:bytes});
    await receiveResearchCustomerState(root,item.customer);
  }
  for(const item of validated.receivings) {
    const root=await privateDirectory(receiving(directory,item.id)),bytes=originalBytes(item.packageBase64);
    try{await writeBytes(join(root,RESEARCH_PACKAGE),bytes,{exclusive:true});}
    catch(error){if(error.code!=='EEXIST')throw error;
      need((await readBytes(join(root,RESEARCH_PACKAGE),Math.max(1,bytes.length))).equals(bytes),
        'The retained original Research receiving bytes changed.');}
  }
}
