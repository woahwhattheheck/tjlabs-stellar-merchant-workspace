// SPDX-License-Identifier: MIT
// Immutable A2A result source family for the original SF82 release manager.
import { mkdir, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSellerConfig, startSellerService } from '../serve.mjs';
import { compileHttpSellerOffer } from '../seller.mjs';
import { compileAssetRouteOffer } from '../response-asset.mjs';
import { A2A_SOURCE_SCHEMA } from '../../sf82-seller-pilot/release-source-contracts.mjs';
import { canonical, clone, sha, fail, atomicFile, readVerifiedFile } from './foundation.mjs';
import { inspectResultPacket } from './portable.mjs';
import { MAX_PAID_RESULT_BYTES } from './merchant.mjs';
export { A2A_SOURCE_SCHEMA };
const SOURCE_FILES=['result.json.gz','seller.json','source.json'];
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const same=(a,b)=>canonical(a)===canonical(b);
const descriptor=(file,bytes)=>({file,bytes:bytes.length,sha256:sha(bytes)});
function originalBytes(path,max=2*1024*1024){if(realpathSync(path)!==resolve(path))fail('A2A_RELEASE_PATH','Use the original canonical source files without symbolic links.');return readVerifiedFile(path,max);}
export async function prepareA2ARelease(packageDirectory){
  const directory=resolve(packageDirectory);if(realpathSync(directory)!==directory)fail('A2A_RELEASE_PATH');
  const retained=Object.fromEntries(SOURCE_FILES.map(file=>[file,originalBytes(join(directory,file),file.endsWith('.gz')?MAX_PAID_RESULT_BYTES:2*1024*1024)]));
  const source=json(retained['source.json']),original=json(retained['seller.json']),publication=source.publication;
  if(source.schema!=='stellar-forge.a2a-publication-source.v1'||!publication||!same(original,publication.service)||source.assetSha256!==sha(retained['result.json.gz'])||publication.asset.sha256!==source.assetSha256||publication.asset.bytes!==retained['result.json.gz'].length)fail('A2A_RELEASE_SOURCE_CHANGED');
  const result=inspectResultPacket(retained['result.json.gz']);
  if(result.project.id!==publication.projectId||result.edition.id!==publication.editionId||result.edition.observationSha256!==publication.source.observationSha256||result.edition.selection.cardSha256!==publication.source.agentCardSha256)fail('A2A_RELEASE_EDITION_CHANGED');
  if(original.routes?.length!==1||original.routes[0].responseAsset?.file!=='result.json.gz'||Object.keys(original.routes[0]).some(k=>!['id','path','definition','responseAsset'].includes(k)))fail('A2A_RELEASE_SERVICE');
  // Use the original SF30 asset compiler for MIME, admission and payment terms.
  const route={...clone(original.routes[0]),responseAsset:{...original.routes[0].responseAsset,file:'a2a/result.json.gz'}};
  const offer=compileAssetRouteOffer(route,original.publicOrigin,compileHttpSellerOffer);
  const {definition,...selected}=route;
  const service={...clone(original),routes:[{...selected,offer}]};
  const serviceBytes=Buffer.from(canonical(service)),offers={schema:'stellar-forge.a2a-seller-offers.v1',offers:[{id:route.id,seller:offer}]},offersBytes=Buffer.from(canonical(offers));
  const a2a={schema:'stellar-forge.a2a-release-source.v1',projectId:publication.projectId,projectRevision:publication.projectRevision,publicationId:publication.id,editionId:publication.editionId,assetSha256:publication.asset.sha256,assetBytes:publication.asset.bytes,agentCardSha256:publication.source.agentCardSha256,observationSha256:publication.source.observationSha256,sourceSha256:sha(retained['source.json']),originalServiceSha256:sha(retained['seller.json']),executionSha256:sha(canonical({source,service}))};
  return{directory,retained,source,publication,a2a,service,serviceBytes,offers,offersBytes,files:SOURCE_FILES.map(file=>descriptor('a2a/'+file,retained[file])).sort((a,b)=>a.file.localeCompare(b.file))};
}
export async function stageA2ARelease(directory,packageDirectory){
  const target=resolve(directory),prepared=await prepareA2ARelease(packageDirectory);
  if(realpathSync(dirname(target))!==dirname(target))fail('A2A_RELEASE_PATH');
  const within=relative(prepared.directory,target);
  if(!within||!isAbsolute(within)&&within!=='..'&&!within.startsWith('..'+sep))fail('A2A_RELEASE_INSIDE_SOURCE');
  let created=false;
  try{
    await mkdir(target,{mode:0o700});created=true;await mkdir(join(target,'a2a'),{mode:0o700});
    for(const file of SOURCE_FILES)atomicFile(join(target,'a2a',file),prepared.retained[file]);
    atomicFile(join(target,'offers.json'),prepared.offersBytes);atomicFile(join(target,'seller-service.json'),prepared.serviceBytes);
    const manifest={schema:A2A_SOURCE_SCHEMA,packagePath:'a2a',a2a:prepared.a2a,offersSha256:sha(prepared.offersBytes),serviceConfigSha256:sha(prepared.serviceBytes),files:prepared.files};
    atomicFile(join(target,'manifest.json'),Buffer.from(canonical(manifest)));return await inspectA2ARelease(target);
  }catch(error){if(created)await rm(target,{recursive:true,force:true});throw error;}
}
export async function inspectA2ARelease(directory){
  const root=resolve(directory),manifestBytes=originalBytes(join(root,'manifest.json')),manifest=json(manifestBytes);
  if(manifest.schema!==A2A_SOURCE_SCHEMA||manifest.packagePath!=='a2a')fail('A2A_RELEASE_MANIFEST');
  const prepared=await prepareA2ARelease(join(root,'a2a'));
  const offersBytes=originalBytes(join(root,'offers.json')),serviceBytes=originalBytes(join(root,'seller-service.json'));
  if(!same(prepared.a2a,manifest.a2a)||!same(prepared.files,manifest.files)||!offersBytes.equals(prepared.offersBytes)||!serviceBytes.equals(prepared.serviceBytes)||sha(offersBytes)!==manifest.offersSha256||sha(serviceBytes)!==manifest.serviceConfigSha256)fail('A2A_RELEASE_CHANGED','Restore the exact retained original A2A result release.');
  return{manifest,a2a:prepared.a2a,service:prepared.service,offers:prepared.offers,hasApplication:false,files:[descriptor('manifest.json',manifestBytes),descriptor('offers.json',offersBytes),descriptor('seller-service.json',serviceBytes),...prepared.files].sort((a,b)=>a.file.localeCompare(b.file))};
}
export async function startA2ARelease(directory,{runtime={port:0},nativeFactory=null}={}){
  const snapshot=await inspectA2ARelease(directory);
  if(runtime.handlers||runtime.upstreams||runtime.allowLoopbackUpstream)fail('A2A_RELEASE_RUNTIME','The result release serves only its retained paid asset.');
  const port=Number(runtime.port??0);if(!Number.isInteger(port)||port<0||port>65535)fail('A2A_RELEASE_PORT');
  if(runtime.facilitator){
    if(nativeFactory)fail('ONE_PAYMENT_AUTHORITY');const url=new URL(runtime.facilitator),local=runtime.allowLocalFacilitator===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
    if((!local&&url.protocol!=='https:')||url.username||url.password||url.search||url.hash)fail('FACILITATOR_URL');
    const [{HTTPFacilitatorClient},{createNativeSellerServer}]=await Promise.all([import('@x402/core/server'),import('../native-factory.mjs')]);
    nativeFactory=routes=>createNativeSellerServer(routes,{facilitatorClient:new HTTPFacilitatorClient({url:url.href.replace(/\/$/,'')})});
  }else if(runtime.allowLocalFacilitator)fail('FACILITATOR_REQUIRED');
  const config=await readSellerConfig(join(resolve(directory),'seller-service.json'));
  const session=await startSellerService({config,port,nativeFactory});
  return{...session,a2a:snapshot.a2a,snapshot};
}
export async function launch(args=process.argv.slice(2)){
  if(args.length!==2||args[0]!=='--resume')fail('A2A_RELEASE_ARGS','Usage: node release.mjs --resume RELEASE_DIRECTORY');
  const directory=resolve(args[1]),snapshot=await inspectA2ARelease(directory),saved=json(originalBytes(join(directory,'pilot-runtime.json'),65536));
  if(saved.schema!=='stellar-forge.seller-pilot-runtime.v1'||saved.source?.offersSha256!==snapshot.manifest.offersSha256||saved.source?.serviceConfigSha256!==snapshot.manifest.serviceConfigSha256)fail('A2A_RELEASE_RUNTIME_CHANGED');
  const session=await startA2ARelease(directory,{runtime:saved.options});
  try{
    atomicFile(join(directory,'runtime-readiness.json'),Buffer.from(canonical({schema:'stellar-forge.seller-pilot-readiness.v1',observedAt:new Date().toISOString(),originalOffersSha256:snapshot.manifest.offersSha256,originalServiceConfigSha256:snapshot.manifest.serviceConfigSha256,runtimeMode:session.mode,listener:session.url,routeCount:1,a2a:snapshot.a2a})),{replace:true});
    let closing;const originalClose=session.close.bind(session),onSignal=()=>{void session.close().catch(()=>{process.exitCode=1;});};
    session.close=()=>closing??=(async()=>{try{return await originalClose();}finally{for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,onSignal);}})();
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,onSignal);return session;
  }catch(error){await session.close();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))launch().catch(error=>{process.stderr.write(String(error.code??'A2A_RELEASE_FAILED')+'\n');process.exitCode=1;});
