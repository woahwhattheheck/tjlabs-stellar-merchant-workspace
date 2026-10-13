// MIT. Full issued Research editions compose the existing native SF30 asset seller.
import { resolve, join } from 'node:path';
import { privateDirectory, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { compileHttpSellerOffer } from '../../seller.mjs';
import { readSellerConfig, startSellerService } from '../../serve.mjs';
import { compileAssetRouteOffer, MAX_ASSET_BYTES, MAX_ASSET_BUDGET } from '../../response-asset.mjs';
import { createNativeHttpFactory } from '../../native-http-factory.mjs';
import { need, clone, canonical, sha } from './model.mjs';
import { encodeResearchEditionDelivery, decodeResearchEditionDelivery, retainResearchDeliveryBytes } from './delivery.mjs';
import { RESEARCH_MERCHANT, RESEARCH_PACKAGE, normalizeResearchMerchantTerms,
  researchPublicationId, researchMerchantPlanSha256, validateResearchMerchantPlan } from './commerce-model.mjs';

const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const HASH = /^[a-f0-9]{64}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const RESERVED = new Set([RESEARCH_PACKAGE,'manifest.json','merchant-config.json','merchant-plan.json','offers.json']);
const descriptor = (path,bytes,contentType,role) => ({path,bytes:bytes.length,sha256:sha(bytes),
  contentType:contentType.split(';',1)[0].trim().toLowerCase(),role});
async function exactFile(directory,name,bytes) {
  need(FILE.test(name) && name !== '.' && name !== '..','Use one complete publication member filename.');
  try { await writeBytes(join(directory,name),bytes,{exclusive:true}); }
  catch(error) {
    if(error.code !== 'EEXIST') throw error;
    need((await readBytes(join(directory,name),Math.max(1,bytes.length))).equals(bytes),
      'The original Research publication retains different bytes.','RESEARCH_PUBLICATION_CONFLICT',409);
  }
}
export function researchPublicationDirectory(directory,publicationId) {
  need(HASH.test(publicationId ?? ''),'Select an original Research publication.');
  return join(resolve(directory),'research','publications',publicationId);
}
function editionView(checked) {
  const value = checked.edition, delivery = checked.delivery;
  return {schema:'stellar-forge.research-merchant-edition.v1',
    sourceProjectId:delivery.sourceProjectId,productId:delivery.productId,editionId:delivery.editionId,
    definitionId:value.definitionId,title:value.title,sources:value.sources,
    manifestSha256:delivery.manifestSha256,deliverySha256:delivery.deliverySha256,
    files:checked.files.map(({bodyBase64,...file})=>clone(file))};
}
export function researchMerchantDefinition({deliveryBytes,origin,path,payment}={}) {
  const checked = decodeResearchEditionDelivery(deliveryBytes);
  const terms = normalizeResearchMerchantTerms({origin,path,payment});
  const {delivery} = checked;
  const publicationId = researchPublicationId({...delivery,...terms});
  const base = terms.path+'/'+publicationId+'/files/';
  const manifestBytes = jsonBytes(delivery.manifest);
  need(sha(manifestBytes) === delivery.manifestSha256,'The original Research delivery manifest changed.');
  const originalFiles = checked.files.map(file=>{
    need(FILE.test(file.path ?? '') && !RESERVED.has(file.path) && file.path !== '.' && file.path !== '..',
      'The selected Research package contains a reserved or unsupported publication path.');
    const body = Buffer.from(file.bodyBase64,'base64');
    need(body.toString('base64')===file.bodyBase64 && body.length===file.bytes && sha(body)===file.sha256,
      'The selected Research file bytes changed.');
    return {...descriptor(file.path,body,file.contentType,'RESEARCH_MEMBER'),body};
  });
  need(new Set(originalFiles.map(file=>file.path)).size===originalFiles.length,
    'Retain each original Research file once.');
  const assets = [
    {...descriptor(RESEARCH_PACKAGE,deliveryBytes,'application/gzip','RESEARCH_PACKAGE'),body:deliveryBytes},
    {...descriptor('manifest.json',manifestBytes,'application/json','RESEARCH_MANIFEST'),body:manifestBytes},
    ...originalFiles
  ];
  need(assets.every(file=>file.bytes<=MAX_ASSET_BYTES) &&
    assets.reduce((sum,file)=>sum+file.bytes,0)<=MAX_ASSET_BUDGET,
    'This complete Research edition exceeds the native seller asset capacity; select a complete product within that capacity.',
    'RESEARCH_PUBLICATION_CAPACITY',413);
  const config = {schema:'stellar-forge.seller-service.v1',publicOrigin:terms.origin,
    maxResponseBytes:Math.max(1,...assets.map(file=>file.bytes)),assetBudgetBytes:MAX_ASSET_BUDGET,
    routes:assets.map((file,index)=>({id:'research-'+index,path:base+file.path,
      definition:{method:'GET',serviceName:'Research product editions',
        description:file.path===RESEARCH_PACKAGE?'Complete issued Research product and all selected original sources':
          'Original Research edition file: '+file.path,payment:clone(terms.payment)},
      responseAsset:{file:file.path,sha256:file.sha256,contentType:file.contentType,downloadName:file.path}}))};
  const offers=config.routes.map(route=>compileAssetRouteOffer(route,terms.origin,compileHttpSellerOffer));
  const configBytes=jsonBytes(config),offersBytes=jsonBytes({resources:offers});
  need(configBytes.length<=256*1024 && offersBytes.length<=256*1024,
    'This complete Research offer inventory exceeds the native retained configuration capacity.',
    'RESEARCH_PUBLICATION_CAPACITY',413);
  const plan={schema:RESEARCH_MERCHANT,publicationId,sourceProjectId:delivery.sourceProjectId,
    productId:delivery.productId,editionId:delivery.editionId,definitionId:checked.edition.definitionId,
    manifestSha256:delivery.manifestSha256,deliverySha256:delivery.deliverySha256,...terms,
    resource:terms.origin+base+RESEARCH_PACKAGE,
    downloads:assets.map(({body,...file})=>({...file,resource:terms.origin+base+file.path})),
    configSha256:sha(configBytes),offersSha256:sha(offersBytes)};
  plan.planSha256=researchMerchantPlanSha256(plan);
  validateResearchMerchantPlan(plan);
  return {checked,edition:editionView(checked),assets,plan,config,configBytes,offers,offersBytes};
}
export async function prepareResearchMerchant({directory,delivery,origin,path='/research-products',payment,
  originalDeliveryBytes=null}={}) {
  directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'research-merchant.lock',async()=>{
    let deliveryBytes=originalDeliveryBytes;
    if(deliveryBytes===null) {
      try {deliveryBytes=await readBytes(join(directory,RESEARCH_PACKAGE),MAX_ASSET_BYTES);}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    deliveryBytes??=encodeResearchEditionDelivery(delivery);
    const checked=decodeResearchEditionDelivery(deliveryBytes);
    need(canonical(checked.delivery)===canonical(delivery),
      'Retain the original complete Research package for this selected issued product.');
    const value=researchMerchantDefinition({deliveryBytes,origin,path,payment});
    await retainResearchDeliveryBytes(directory,deliveryBytes);
    for(const file of value.assets)if(file.path!==RESEARCH_PACKAGE)await exactFile(directory,file.path,file.body);
    await exactFile(directory,'merchant-config.json',value.configBytes);
    await exactFile(directory,'offers.json',value.offersBytes);
    await readSellerConfig(join(directory,'merchant-config.json'));
    await exactFile(directory,'merchant-plan.json',jsonBytes(value.plan));
    return {edition:value.edition,plan:value.plan,directory};
  });
}
export async function readResearchMerchant(directory) {
  directory=resolve(directory);
  const plan=validateResearchMerchantPlan(await readPrivateJson(join(directory,'merchant-plan.json'),256*1024));
  const packageFile=plan.downloads.find(file=>file.path===RESEARCH_PACKAGE);
  const deliveryBytes=await readBytes(join(directory,RESEARCH_PACKAGE),Math.max(1,packageFile.bytes));
  need(deliveryBytes.length===packageFile.bytes && sha(deliveryBytes)===packageFile.sha256,
    'The original paid Research package changed.');
  const value=researchMerchantDefinition({deliveryBytes,origin:plan.origin,path:plan.path,payment:plan.payment});
  need(canonical(plan)===canonical(value.plan),'The original Research merchant plan or file inventory changed.');
  for(const asset of value.assets)if(asset.path!==RESEARCH_PACKAGE) {
    const bytes=await readBytes(join(directory,asset.path),Math.max(1,asset.bytes));
    need(bytes.length===asset.bytes && sha(bytes)===asset.sha256,'An original Research resource changed: '+asset.path);
  }
  const configBytes=await readBytes(join(directory,'merchant-config.json'),256*1024);
  const offersBytes=await readBytes(join(directory,'offers.json'),256*1024);
  need(configBytes.equals(value.configBytes) && offersBytes.equals(value.offersBytes),
    'The original Research seller configuration or offers changed.');
  return {edition:value.edition,plan,directory,
    config:await readSellerConfig(join(directory,'merchant-config.json')),offers:value.offers,
    offersBytes,deliveryBytes,checked:value.checked};
}
export async function startResearchMerchant({directory,port=0,nativeFactory,facilitator,
  allowLocalFacilitator=false,maxInFlight=64,drainGraceMs=60000}={}) {
  need(!(nativeFactory&&facilitator),'Choose the existing native factory or configured facilitator.');
  const {edition,plan,config}=await readResearchMerchant(directory);
  const factory=nativeFactory??(facilitator?await createNativeHttpFactory({facilitator,allowLocalFacilitator}):null);
  const session=await startSellerService({config,port,nativeFactory:factory,maxInFlight,drainGraceMs});
  return {...session,publicationId:plan.publicationId,productId:edition.productId,editionId:edition.editionId,
    resource:plan.resource,mode:factory?'NATIVE_SELLER':'CHALLENGE_ONLY'};
}
