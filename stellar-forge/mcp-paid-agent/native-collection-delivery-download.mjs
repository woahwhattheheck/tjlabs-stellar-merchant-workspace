// SPDX-License-Identifier: MIT
// Complete original package download using the maintained retained-file engine.
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {createRetainedDownload} from '../mcp-merchant-operator/retained-download.mjs';
import {openNativeCollectionDeliveryClient,checkedDeliveryRange} from './native-collection-delivery-client.mjs';
import {openCustomerDelivery} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/delivery/model.mjs';
import {inspectPackage,MAX_PACKAGE,need,identity} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/delivery/format.mjs';
const SCHEMA='stellar-forge.collection-customer-download-manifest.v1',TOOL='collection_customer_package';
const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9._-]{1,100}$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const select=id=>need(typeof id==='string'&&ID.test(id)&&!['.','..'].includes(id),'MCP_DELIVERY_DOWNLOAD_ID');
function transport(options){
 select(options.id);need(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(options.deliveryWorkspace??''),'MCP_DELIVERY_DOWNLOAD_ALIAS');
 function parseManifest(raw,exportId){
  select(exportId);need(exportId===options.id,'MCP_DELIVERY_DOWNLOAD_SELECTION');let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{need(false,'MCP_DELIVERY_DOWNLOAD_MANIFEST');}
  need(value?.schema===SCHEMA&&value.id===exportId&&HASH.test(value.previewSha256??'')&&Array.isArray(value.files)&&value.files.length===1&&
   value.files[0].name==='customer-delivery.ndjson'&&Number.isSafeInteger(value.files[0].bytes)&&value.files[0].bytes>0&&
   value.files[0].bytes<=MAX_PACKAGE&&HASH.test(value.files[0].sha256??'')&&value.package?.sha256===value.files[0].sha256&&
   value.package.bytes===value.files[0].bytes&&HASH.test(value.package.manifestSha256??''),'MCP_DELIVERY_DOWNLOAD_MANIFEST');
  return value;
 }
 async function connect(connectionOptions){
  const client=await openNativeCollectionDeliveryClient({...connectionOptions,deliveryWorkspace:options.deliveryWorkspace});let saved;
  async function metadata(){
   saved??=await client.inspect(options.id);
   need(saved.state==='COMPLETE'&&saved.id===options.id&&saved.files?.manifest?.name==='manifest.json'&&
    Number.isSafeInteger(saved.files.manifest.bytes)&&saved.files.manifest.bytes>0&&saved.files.manifest.bytes<=65000&&
    HASH.test(saved.files.manifest.sha256??'')&&HASH.test(saved.package?.sha256??''),'MCP_DELIVERY_DOWNLOAD_METADATA');
   return saved;
  }
  return{endpoint:client.endpoint+'#collection-delivery='+options.deliveryWorkspace,async call(tool,args,context){
   need(args.exportId===options.id,'MCP_DELIVERY_DOWNLOAD_SELECTION');const value=await metadata(),manifest=value.files.manifest;
   if(tool===TOOL+'_manifest')return{state:'MANIFEST_RETAINED',exportId:options.id,manifestFile:manifest};
   need(tool===TOOL+'_file'&&args.readId===undefined&&args.expectedManifestSha256===manifest.sha256,'MCP_DELIVERY_DOWNLOAD_FILE');
   const name=args.file,file=name==='manifest.json'?manifest:name==='customer-delivery.ndjson'?{name,bytes:value.package.bytes,sha256:value.package.sha256}:null;
   need(file&&file.sha256===args.expectedSha256,'MCP_DELIVERY_DOWNLOAD_FILE');
   const offset=args.offset??0,limit=Math.min(args.limit??65536,65536);
   const response=await client.call(name==='manifest.json'?'manifest-file':'package-file',{id:options.id,expectedFileSha256:file.sha256,
    byteOffset:offset,maxBytes:limit},context);
   need(response.id===options.id&&response.filename===name,'MCP_DELIVERY_DOWNLOAD_FILE');
   checkedDeliveryRange(response.file,{...file,byteOffset:offset,maxBytes:limit});
   return{exportId:options.id,manifestSha256:manifest.sha256,file,offset:response.file.byteOffset,
    bytesRead:response.file.returnedBytes,encoding:response.file.encoding,nextOffset:response.file.nextByteOffset,data:response.file.data};
  }};
 }
 return createRetainedDownload({manifestName:'manifest.json',parseManifest,maximumBytes:MAX_PACKAGE,
  stateSchema:'stellar-forge.customer-package-download-state.v1',resultSchema:'stellar-forge.customer-package-download.v1',
  toolPrefix:TOOL,errorPrefix:'MCP_DELIVERY',clientName:'starforge-customer-package',connect,readLease:false,
  validateExportId:select,describe:m=>({deliveryId:m.id,packageSha256:m.package.sha256,packageManifestSha256:m.package.manifestSha256})});
}
export async function inspectNativeCustomerPackage(options){return transport(options).inspect({...options,exportId:options.id});}
export async function downloadNativeCustomerPackage(options){
 need(HASH.test(options.expectedManifestSha256??''),'MCP_DELIVERY_DOWNLOAD_REVIEW_REQUIRED');
 const chunkSize=options.chunkSize??65536;
 need(Number.isSafeInteger(chunkSize)&&chunkSize>=1&&chunkSize<=65536,'MCP_DELIVERY_DOWNLOAD_CHUNK_SIZE');
 const result=await transport(options).download({...options,exportId:options.id,chunkSize});
 const checked=await inspectPackage(join(options.directory,'customer-delivery.ndjson'),{expected:{sha256:result.packageSha256,bytes:result.bytes}});
 need(checked.manifestSha256===result.packageManifestSha256,'MCP_DELIVERY_DOWNLOAD_PACKAGE_CHANGED');
 return{...result,packageFiles:checked.files,contentBytes:checked.contentBytes,outputsComplete:checked.outputsComplete};
}
export async function reopenNativeCustomerPackage(options){
 need(HASH.test(options.expectedManifestSha256??''),'MCP_DELIVERY_DOWNLOAD_REVIEW_REQUIRED');const selected=transport(options);
 return selected.lockedDownload(options.directory,async context=>{
  const raw=await selected.bytesAt(join(context.root,'manifest.json'),65000);need(sha(raw)===options.expectedManifestSha256,'MCP_DELIVERY_DOWNLOAD_MANIFEST_CHANGED');
  await selected.loadContext(context,raw,options.id);const file=context.manifest.files[0];
  await selected.verifiedFile(join(context.root,file.name),file);
  const checked=await inspectPackage(join(context.root,file.name),{expected:file});
  need(checked.manifestSha256===context.manifest.package.manifestSha256,'MCP_DELIVERY_DOWNLOAD_PACKAGE_CHANGED');
  context.state.files[file.name]={bytes:file.bytes,sha256:file.sha256,complete:true};await selected.checkpoint(context);
  return{schema:'stellar-forge.customer-package-download.v1',state:'COMPLETE',deliveryId:options.id,manifestSha256:sha(raw),
   packageSha256:checked.sha256,packageManifestSha256:checked.manifestSha256,bytes:checked.bytes,packageFiles:checked.files,
   contentBytes:checked.contentBytes,outputsComplete:checked.outputsComplete};
 });
}
/** Keep downloaded source inert and receive through the original full package reader. */
export async function receiveDownloadedCustomerPackage({file,receivingDirectory,expectedSha256}){
 const desk=await openCustomerDelivery({directory:receivingDirectory});try{
  const result=await desk.receive({file,expectedSha256}),reopened=await desk.received(expectedSha256);
  const {directory:ignored,...saved}=result;need(identity(reopened)===identity(saved),'MCP_DELIVERY_RECEIVED_CHANGED');return result;
 }finally{await desk.close();}
}
