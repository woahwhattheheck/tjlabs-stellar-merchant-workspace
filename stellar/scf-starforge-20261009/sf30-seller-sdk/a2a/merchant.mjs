// SPDX-License-Identifier: MIT
import { join } from 'node:path';
import { compileHttpSellerOffer } from '../seller.mjs';
import { LIMITS, id, now, sha, text, canonical, clone, fail, atomicFile, privateDirectory, readVerifiedFile } from './foundation.mjs';
import { makeResultPacket, encodePacket, inspectResultPacket } from './portable.mjs';

export const MAX_PAID_RESULT_BYTES=16*1024*1024;
export function prepareA2APublication({workspace,project,edition,input}) {
  const publicOrigin=new URL(text(input.publicOrigin,'public origin',2048));
  if(publicOrigin.origin!==input.publicOrigin||publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password)fail('PUBLIC_ORIGIN','Select the public HTTPS merchant origin.');
  const routePath=text(input.routePath,'route path',400);
  if(!/^\/[A-Za-z0-9_.~/-]+$/.test(routePath)||routePath.includes('//')||routePath.startsWith('/_seller/')||new URL(routePath,publicOrigin).pathname!==routePath)fail('PUBLIC_ROUTE');
  const title=text(input.title??edition.title,'publication title',300);
  const definition={method:'GET',description:title,serviceName:'A2A result editions',tags:['a2a','retained-result'],payment:clone(input.payment)};
  // Compile with the original payment terms/schema before saving a publication.
  compileHttpSellerOffer({...definition,url:publicOrigin.origin+routePath});
  const packet=encodePacket(makeResultPacket(workspace,project,edition.id));
  if(packet.bytes.length>MAX_PAID_RESULT_BYTES)fail('PAID_ASSET_LIMIT','The complete result exceeds the original seller’s 16 MiB immutable asset limit. Retain/export the whole result; this publication has not been created.',409,{bytes:packet.bytes.length,limit:MAX_PAID_RESULT_BYTES});
  const source=workspace.addSource(project,workspace.put(packet.bytes,{role:'merchant-result',filename:packet.filename,mediaType:packet.mediaType,operationId:input.requestId}));
  const publicationId='a2a-'+sha(input.requestId).slice(0,24);
  const asset={file:'result.json.gz',sha256:source.sha256,contentType:'application/gzip',downloadName:packet.filename};
  const service={schema:'stellar-forge.seller-service.v1',publicOrigin:publicOrigin.origin,maxResponseBytes:MAX_PAID_RESULT_BYTES,assetBudgetBytes:MAX_PAID_RESULT_BYTES,routes:[{id:publicationId,path:routePath,definition,responseAsset:asset}]};
  return{id:publicationId,createdAt:now(),title,editionId:edition.id,projectId:project.id,projectRevision:project.revision+1,asset:{...asset,sourceId:source.id,bytes:source.bytes},service,source:{agentCardSha256:edition.selection.cardSha256,observationSha256:edition.observationSha256,editionId:edition.id},paymentAuthority:'original-sf30-x402'};
}
export function materializeA2APublication(workspace,{id:projectId,publicationId,directory=null}) {
  const project=workspace.raw(projectId),publication=project.publications.find(x=>x.id===publicationId);
  if(!publication)fail('PUBLICATION_NOT_FOUND',undefined,404);
  const bytes=workspace.objects.get(publication.asset.sha256);if(bytes.length!==publication.asset.bytes)fail('PUBLICATION_ASSET_CHANGED');
  const inspected=inspectResultPacket(bytes);if(inspected.edition.id!==publication.editionId||inspected.project.id!==projectId)fail('PUBLICATION_RESULT_CHANGED');
  const root=privateDirectory(directory??join(workspace.directory,'merchant',publication.id));
  atomicFile(join(root,'result.json.gz'),bytes);
  atomicFile(join(root,'seller.json'),Buffer.from(canonical(publication.service)));
  atomicFile(join(root,'source.json'),Buffer.from(canonical({schema:'stellar-forge.a2a-publication-source.v1',publication:clone(publication),assetSha256:sha(bytes)})));
  return{directory:root,configPath:join(root,'seller.json'),assetPath:join(root,'result.json.gz'),publication:clone(publication)};
}
export async function startA2AMerchant(workspace,options) {
  const materialized=materializeA2APublication(workspace,options);
  const {readSellerConfig,startSellerService}=await import('../serve.mjs');
  const config=await readSellerConfig(materialized.configPath);
  let factory=options.nativeFactory??null;
  if(options.facilitator){
    if(factory)fail('ONE_PAYMENT_AUTHORITY');
    const url=new URL(options.facilitator),local=options.allowLocalFacilitator===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
    if((!local&&url.protocol!=='https:')||url.username||url.password||url.search||url.hash)fail('FACILITATOR_URL');
    const [{HTTPFacilitatorClient},{createNativeSellerServer}]=await Promise.all([import('@x402/core/server'),import('../native-factory.mjs')]);
    factory=routes=>createNativeSellerServer(routes,{facilitatorClient:new HTTPFacilitatorClient({url:url.href.replace(/\/$/,'')})});
  }
  const seller=await startSellerService({config,port:options.port??0,nativeFactory:factory,...(options.availabilityDirectory?{availabilityDirectory:options.availabilityDirectory}:{})});
  let closing;
  return{seller,publication:materialized.publication,url:seller.url,mode:seller.mode,close:()=>closing??=seller.close()};
}
