// MIT. Research publication and receiving share the original economic transaction.
import { resolve, join, isAbsolute } from 'node:path';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { readFredProject, transactFredProject } from '../project.mjs';
import { operationId } from '../model.mjs';
import { need, clone, canonical, digest, sha, key, text, catalogue, validateResearchState } from './model.mjs';
import { readResearchSource } from './project.mjs';
import { createResearchEditionDelivery, encodeResearchEditionDelivery, decodeResearchEditionDelivery,
  receiveResearchEditionDelivery } from './delivery.mjs';
import { RESEARCH_PACKAGE, normalizeResearchMerchantTerms, researchPublicationId,
  researchPublicationRecord, validateResearchMerchantPlan, researchCommerceState,
  validateResearchCommerceState } from './commerce-model.mjs';
import { researchPublicationDirectory, researchMerchantDefinition, prepareResearchMerchant, readResearchMerchant } from './merchant.mjs';

export const RESEARCH_COMMERCE_ACTIONS = Object.freeze(['research-publish','research-receive']);
const PACKAGE_LIMIT = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
async function optionalJson(path,limit=131072) {
  try{return await readPrivateJson(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function optionalBytes(path,limit=PACKAGE_LIMIT) {
  try{return await readBytes(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function exactBytes(root,name,bytes) {
  try{await writeBytes(join(root,name),bytes,{exclusive:true});}
  catch(error){if(error.code!=='EEXIST')throw error;
    need((await readBytes(join(root,name),Math.max(1,bytes.length))).equals(bytes),
      'This original Research operation retains different bytes.','RESEARCH_COMMERCE_CONFLICT',409);}
}
function hash(value,label) {need(HASH.test(value??''),'Choose the original '+label+'.');return value;}
function targetDirectory(value,source) {
  need(typeof value==='string' && value.length<=4096 && isAbsolute(value) && !/[\x00-\x1f]/.test(value),
    'Choose an absolute customer receiving directory.');
  const target=resolve(value),parent=resolve(source);
  need(target!==parent && !target.startsWith(parent+'/') && !parent.startsWith(target+'/'),
    'Choose a separate customer directory outside this original project.');
  return target;
}
function selectedEdition(state,productId,editionId) {
  validateResearchState(state);
  const product=catalogue(state).products.find(item=>item.id===productId);
  const edition=product?.editions.find(item=>item.id===editionId);
  need(edition,'Choose an issued edition of this original Research product.','RESEARCH_EDITION_NOT_FOUND',404);
  return {product,edition,definition:product.versions.find(item=>item.id===edition.definitionId)};
}
async function originalSelection(root,name,payload) {
  const dir=await privateDirectory(join(resolve(root),'research',name));
  const old=await optionalJson(join(dir,'selection.json'));
  const selection={schema:'stellar-forge.research-commerce-selection.v1',payload:clone(payload),sha256:digest(payload)};
  if(old)need(canonical(old)===canonical(selection),'Continue the complete original Research selection.','RESEARCH_COMMERCE_CONFLICT',409);
  else await atomicJson(dir,'selection.json',selection,{exclusive:true});
  return dir;
}
async function stagedPublication(directory,id,payload,state) {
  const {edition}=selectedEdition(state,payload.productId,payload.editionId);
  const stage=await originalSelection(directory,'publish-requests/'+id,payload);
  let bytes=await optionalBytes(join(stage,RESEARCH_PACKAGE));
  if(bytes===null) {
    const captures=[];
    for(const sourceId of [...new Set(edition.sources.map(item=>item.snapshotId))])
      captures.push(await readResearchSource(directory,sourceId));
    const delivery=createResearchEditionDelivery({state,sources:captures,productId:payload.productId,
      editionId:payload.editionId,note:payload.note});
    bytes=encodeResearchEditionDelivery(delivery);
    need(bytes.length<=PACKAGE_LIMIT,'The complete Research delivery exceeds its retained capacity.');
    await exactBytes(stage,RESEARCH_PACKAGE,bytes);
  }
  const checked=decodeResearchEditionDelivery(bytes);
  need(checked.delivery.sourceProjectId===state.id && checked.delivery.productId===payload.productId &&
    checked.delivery.editionId===payload.editionId && checked.edition.definitionId===edition.definitionId,
    'The retained publication package belongs to another issued Research edition.');
  return {bytes,checked};
}
async function applyPublication(directory,request) {
  return transactFredProject(directory,request,async(state,root)=>{
    const payload=request.payload;
    const {bytes,checked}=await stagedPublication(root,request.id,payload,state);
    const publicationId=researchPublicationId({...checked.delivery,...payload.terms});
    const prepared=await prepareResearchMerchant({directory:researchPublicationDirectory(root,publicationId),
      delivery:checked.delivery,...payload.terms,originalDeliveryBytes:bytes});
    state.researchCommerce??=clone(researchCommerceState(state));
    const record=researchPublicationRecord(prepared.plan,state.pending.startedAt);
    const original=state.researchCommerce.publications.find(item=>item.id===publicationId);
    if(original)validateResearchMerchantPlan(prepared.plan,{record:original});
    else state.researchCommerce.publications.push(record);
    validateResearchCommerceState(state);
    return {publicationId,productId:payload.productId,editionId:payload.editionId,
      edition:prepared.edition,plan:prepared.plan};
  });
}
export async function publishResearchEdition({directory,id,expectedRevision,productId,editionId,note='',
  origin,path='/research-products',payment}={}) {
  operationId(id);
  const payload={productId:key(productId),editionId:hash(editionId,'issued Research edition'),
    note:text(note,12000),terms:normalizeResearchMerchantTerms({origin,path,payment})};
  const current=await readFredProject(directory);
  if(!current.operations.some(item=>item.id===id) && !current.pending) {
    need(current.revision===expectedRevision,'The project changed; reopen the publication selection.','FRED_REVISION_CONFLICT',409);
    // Resolve complete file and offer capacities before reserving the native project transaction.
    const {bytes}=await stagedPublication(directory,id,payload,current);
    researchMerchantDefinition({deliveryBytes:bytes,...payload.terms});
  }
  return applyPublication(directory,{id,expectedRevision,kind:'research-publish',payload});
}
async function applyReceiving(directory,request) {
  const stage=await originalSelection(directory,'receiving-requests/'+request.id,request.payload);
  const bytes=await readBytes(join(stage,RESEARCH_PACKAGE),PACKAGE_LIMIT);
  need(bytes.length===request.payload.bytes && sha(bytes)===request.payload.packageSha256,
    'The original complete Research receiving input changed.');
  const checked=decodeResearchEditionDelivery(bytes);
  need(checked.delivery.deliverySha256===request.payload.deliverySha256,
    'The original Research source selection changed.');
  return transactFredProject(directory,request,async()=>{
    const receiving=await receiveResearchEditionDelivery({directory:request.payload.receivingDirectory,bytes});
    return {receiving,directory:request.payload.receivingDirectory,
      sourceProjectId:checked.delivery.sourceProjectId,productId:checked.delivery.productId,
      editionId:checked.delivery.editionId,packageSha256:request.payload.packageSha256};
  });
}
export async function receiveResearchEdition({directory,id,expectedRevision,receivingDirectory,bytes}={}) {
  operationId(id);
  need(Buffer.isBuffer(bytes) && bytes.length>0 && bytes.length<=PACKAGE_LIMIT,
    'Receive the complete original Research package within its retained capacity.');
  const target=targetDirectory(receivingDirectory,directory),checked=decodeResearchEditionDelivery(bytes);
  const payload={receivingDirectory:target,bytes:bytes.length,packageSha256:sha(bytes),
    deliverySha256:checked.delivery.deliverySha256};
  const current=await readFredProject(directory),prior=current.operations.find(item=>item.id===id);
  if(!prior && !current.pending)need(current.revision===expectedRevision,
    'The project changed; reopen the receiving selection.','FRED_REVISION_CONFLICT',409);
  const stage=await originalSelection(directory,'receiving-requests/'+id,payload);
  await exactBytes(stage,RESEARCH_PACKAGE,bytes);
  return applyReceiving(directory,{id,expectedRevision,kind:'research-receive',payload});
}
export async function resumeResearchCommerceAction({directory,id,expectedRevision}={}) {
  operationId(id);
  const state=await readFredProject(directory);
  const completed=state.operations.find(item=>item.id===id);
  if(completed) {
    need(RESEARCH_COMMERCE_ACTIONS.includes(completed.kind),'Select the original Research commerce operation.');
    return {...clone(completed.result),replayed:true,revision:state.revision};
  }
  need(state.pending?.id===id && state.pending.expectedRevision===expectedRevision &&
    RESEARCH_COMMERCE_ACTIONS.includes(state.pending.kind),
    'Continue the original pending Research commerce operation.','RESEARCH_COMMERCE_CHANGED',409);
  const request={id,expectedRevision,kind:state.pending.kind,payload:clone(state.pending.payload)};
  return request.kind==='research-publish'?applyPublication(directory,request):applyReceiving(directory,request);
}
export async function researchCommerceView(directory,{section='publications',offset=0,limit=100,expectedRevision=null}={}) {
  const state=await readFredProject(directory);validateResearchCommerceState(state);
  need(expectedRevision===null || expectedRevision===state.revision,
    'The economic project changed; reopen the original commerce inventory.','FRED_REVISION_CONFLICT',409);
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,
    'Choose a complete Research commerce inventory page.');
  need(['publications','receivings'].includes(section),'Choose the original Research publication or receiving inventory.');
  const commerce=researchCommerceState(state),rows=commerce[section];
  need(offset<=rows.length,'Choose a page inside the Research publication inventory.');
  return {projectId:state.id,revision:state.revision,section,total:rows.length,offset,limit,
    nextOffset:offset+limit<rows.length?offset+limit:null,
    rows:clone(rows.slice(offset,offset+limit)),counts:{publications:commerce.publications.length,receivings:commerce.receivings.length},
    pending:state.pending&&RESEARCH_COMMERCE_ACTIONS.includes(state.pending.kind)?clone(state.pending):null};
}
export async function getResearchPublication(directory,publicationId) {
  hash(publicationId,'Research publication');
  const state=await readFredProject(directory),record=researchCommerceState(state).publications.find(item=>item.id===publicationId);
  need(record,'The selected Research publication is not in this economic project.','RESEARCH_PUBLICATION_NOT_FOUND',404);
  const merchant=await readResearchMerchant(researchPublicationDirectory(directory,publicationId));
  validateResearchMerchantPlan(merchant.plan,{record});
  return {...merchant,projectId:state.id,revision:state.revision,record:clone(record)};
}
export async function downloadResearchPublication({directory,publicationId,file=RESEARCH_PACKAGE}={}) {
  const merchant=await getResearchPublication(directory,publicationId);
  const selected=merchant.plan.downloads.find(item=>item.path===file);
  need(selected,'Choose one complete original Research publication file.','RESEARCH_PUBLICATION_FILE_NOT_FOUND',404);
  const bytes=await readBytes(join(merchant.directory,selected.path),Math.max(1,selected.bytes));
  need(bytes.length===selected.bytes&&sha(bytes)===selected.sha256,'The original Research publication bytes changed.');
  return {bytes,filename:selected.path,contentType:selected.contentType,sha256:selected.sha256};
}
