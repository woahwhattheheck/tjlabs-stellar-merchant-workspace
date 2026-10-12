// MIT. Typed WordPress operations and the original complete-file receiver.
import {join,resolve} from 'node:path';
import {openMerchantFileClient,createRetainedDownload} from '../../../../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import {wordpressTools,validateWordPressArguments} from './catalog.mjs';
import {TOOL_PREFIX,MANIFEST_NAME,MAX_JSON_BYTES,MAX_ARTIFACT_BYTES,MAX_RETAINED_CHUNK_BYTES,
  SHA,UUID,ALIAS,need,checked,plain,decode,encode,digest,parseWordPressExport} from './contracts.mjs';
export {wordpressMerchantTools,wordpressTools,wordpressActionNames,wordpressActionContract} from './catalog.mjs';

const RESULT_SCHEMA='stellar-forge.wordpress-merchant-result.v1';
const RECEIPT_SCHEMA='stellar-forge.wordpress-merchant-file-receipt.v1';
const camel=name=>name.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());

/** Initialize the existing authenticated merchant MCP transport. */
export async function openWordPressMerchantClient(options={}){
  const original=await openMerchantFileClient({...options,errorPrefix:'WORDPRESS_MERCHANT',
    clientName:'starforge-wordpress-merchant-client',maximumResponseBytes:3*1024*1024});
  const call=async(name,args={},requestOptions)=>{
    const action=validateWordPressArguments(name,args);
    try{return await original.call(TOOL_PREFIX+action,args,requestOptions);}
    catch(error){
      // Keep the caller's original identity available after any uncertain reply.
      if(args.operationId && error && typeof error==='object'){
        error.operationId??=args.operationId;
        error.action??=action==='act'?args.action:action;
      }
      throw error;
    }
  };
  const core={endpoint:original.endpoint,call};
  const named=Object.fromEntries(Object.keys(wordpressTools).map(name=>[
    camel(name),(args={},requestOptions)=>call(name,args,requestOptions)]));
  return Object.freeze({...core,...named,
    async callValue(name,args={},requestOptions){
      const result=await call(name,args,requestOptions);
      const value=result.schema===RESULT_SCHEMA
        ?await readWordPressValue({workspace:args.workspace,result,client:core,signal:requestOptions?.requestSignal})
        :result;
      return {result,value};
    },
    readValue:args=>readWordPressValue({...args,client:core}),
    downloadExport:args=>downloadWordPressExport({...args,client:core}),
    inspectExport:args=>inspectWordPressExport({...args,client:core}),
    reopenExport:args=>reopenWordPressExport(args),
    receiveSourcePacket:args=>receiveWordPressSourcePacket({...args,client:core})
  });
}

function selection(options={}){
  const {result}=options;
  let {workspace,exportId,expectedManifestSha256}=options;
  if(result!==undefined){
    need(plain(result)&&result.schema===RESULT_SCHEMA && result.retention?.state==='COMPLETE',
      'WORDPRESS_MERCHANT_RETENTION_REQUIRED',
      'Recover the original operation or read after complete-file storage is available.',
      {operationId:result?.source?.operationId,retention:result?.retention});
    need(workspace===undefined||workspace===result.workspace,'WORDPRESS_MERCHANT_EXPORT_CHANGED');
    need(exportId===undefined||exportId===result.exportId,'WORDPRESS_MERCHANT_EXPORT_CHANGED');
    need(expectedManifestSha256===undefined||expectedManifestSha256===result.manifestSha256,
      'WORDPRESS_MERCHANT_EXPORT_CHANGED');
    workspace??=result.workspace;exportId??=result.exportId;expectedManifestSha256??=result.manifestSha256;
  }
  checked(workspace,ALIAS,'workspace alias');checked(exportId,SHA,'export ID');
  if(expectedManifestSha256!==undefined)checked(expectedManifestSha256,SHA,'manifest SHA-256');
  return {...options,workspace,exportId,expectedManifestSha256};
}

async function boundClient(options={}){
  const selected=selection(options),{workspace,exportId,expectedManifestSha256,result}=selected;
  const original=selected.client??await openWordPressMerchantClient(selected);
  need(original && typeof original.call==='function','WORDPRESS_MERCHANT_CLIENT_REQUIRED');
  const call=(name,args={},requestOptions)=>{
    need(args.workspace===undefined||args.workspace===workspace,'WORDPRESS_MERCHANT_EXPORT_CHANGED');
    return original.call(name,{...args,workspace},requestOptions);
  };
  const info=await call(TOOL_PREFIX+'manifest',{exportId},
    selected.signal?{requestSignal:selected.signal}:undefined);
  need(info.state==='MANIFEST_RETAINED'&&info.exportId===exportId&&plain(info.manifestFile),
    'WORDPRESS_MERCHANT_MANIFEST_INVALID');
  const bytes=encode(info.manifest),manifest=parseWordPressExport(bytes,exportId),manifestSha256=digest(bytes);
  need(manifest.workspace===workspace && info.workspace===workspace &&
    info.workspaceId===manifest.workspaceId && info.workspaceIdentity===manifest.workspaceIdentity &&
    info.manifestFile.name===MANIFEST_NAME &&
    info.manifestFile.bytes===bytes.length && info.manifestFile.sha256===manifestSha256 &&
    (expectedManifestSha256===undefined||manifestSha256===expectedManifestSha256),
    'WORDPRESS_MERCHANT_MANIFEST_INVALID','The complete original manifest identity differs.');
  if(result!==undefined)need(result.workspaceId===manifest.workspaceId &&
    result.workspaceIdentity===manifest.workspaceIdentity && result.kind===manifest.kind &&
    result.manifestFile?.sha256===manifestSha256 && result.manifestFile?.bytes===bytes.length &&
    result.files?.length===1 && result.files[0].name===manifest.files[0].name &&
    result.files[0].bytes===manifest.files[0].bytes && result.files[0].sha256===manifest.files[0].sha256,
    'WORDPRESS_MERCHANT_EXPORT_CHANGED','The retained result and complete file describe different exports.');
  if(selected.expectedWorkspaceId!==undefined)need(
    checked(selected.expectedWorkspaceId,UUID,'workspace UUID')===manifest.workspaceId,
    'WORDPRESS_MERCHANT_EXPORT_CHANGED');
  if(selected.expectedWorkspaceIdentity!==undefined)need(
    checked(selected.expectedWorkspaceIdentity,SHA,'workspace identity')===manifest.workspaceIdentity,
    'WORDPRESS_MERCHANT_EXPORT_CHANGED');
  return {selected,manifest,manifestSha256,bytes,client:{
    endpoint:'stellar-forge:wordpress:'+manifest.workspaceId+':'+manifest.workspaceIdentity+':'+workspace,call}};
}

const transfers=createRetainedDownload({
  manifestName:MANIFEST_NAME,parseManifest:parseWordPressExport,maximumBytes:MAX_ARTIFACT_BYTES,
  stateSchema:'stellar-forge.wordpress-merchant-file-download.v1',resultSchema:RECEIPT_SCHEMA,
  toolPrefix:TOOL_PREFIX.slice(0,-1),errorPrefix:'WORDPRESS_MERCHANT',
  clientName:'starforge-wordpress-merchant-file-receiver',
  validateExportId:id=>checked(id,SHA,'export ID'),
  describe:manifest=>({workspace:manifest.workspace,workspaceId:manifest.workspaceId,
    workspaceIdentity:manifest.workspaceIdentity,kind:manifest.kind,source:manifest.source})
});

/** Download the complete original file, resuming the same private directory. */
export async function downloadWordPressExport(options={}){
  const bound=await boundClient(options),{directory,chunkSize,signal}=options;
  return transfers.download({client:bound.client,exportId:bound.manifest.exportId,directory,
    expectedManifestSha256:bound.manifestSha256,signal,...(chunkSize===undefined?{}:{chunkSize})});
}
export async function inspectWordPressExport(options={}){
  const bound=await boundClient(options);
  return transfers.inspect({client:bound.client,exportId:bound.manifest.exportId,signal:options.signal});
}
/** Verify a previously downloaded complete export without opening the merchant endpoint. */
export async function reopenWordPressExport(options={}){
  const selected=selection(options),{workspace,exportId,expectedManifestSha256}=selected;
  return transfers.lockedDownload(resolve(options.directory),async context=>{
    const bytes=await transfers.bytesAt(join(context.root,MANIFEST_NAME),65000),
      manifest=parseWordPressExport(bytes,exportId),manifestSha256=digest(bytes);
    need(manifest.workspace===workspace &&
      (expectedManifestSha256===undefined||manifestSha256===expectedManifestSha256) &&
      (selected.expectedWorkspaceId===undefined||checked(selected.expectedWorkspaceId,UUID,'workspace UUID')===manifest.workspaceId) &&
      (selected.expectedWorkspaceIdentity===undefined||checked(selected.expectedWorkspaceIdentity,SHA,'workspace identity')===manifest.workspaceIdentity),
      'WORDPRESS_MERCHANT_DOWNLOAD_EXPORT_CHANGED');
    await transfers.loadContext(context,bytes,exportId);
    for(const file of manifest.files)await transfers.verifiedFile(join(context.root,file.name),file,options.signal);
    return {schema:RECEIPT_SCHEMA,state:'REOPENED',workspace,workspaceId:manifest.workspaceId,
      workspaceIdentity:manifest.workspaceIdentity,exportId,manifestSha256,files:manifest.files.length,
      bytes:manifest.files.reduce((n,file)=>n+file.bytes,0),directory:context.root,kind:manifest.kind,source:manifest.source};
  });
}

/** Read and verify every byte of the original JSON, including previewed responses. */
export async function readWordPressValue(options={}){
  const bound=await boundClient(options),{manifest,manifestSha256}=bound;
  const file=options.file??manifest.files[0].name,item=manifest.files.find(row=>row.name===file);
  need(item&&item.bytes<=MAX_JSON_BYTES && (/\.json$/i.test(item.name)||/application\/(?:[A-Za-z0-9.+-]*\+)?json(?:;|$)/i.test(item.contentType)),
    'WORDPRESS_MERCHANT_JSON_BYTES','Select a complete JSON response; download other artifacts to a private directory.');
  const chunks=[],limit=Math.min(65536,MAX_RETAINED_CHUNK_BYTES);
  let offset=0,readId=null;
  try{
    while(offset<item.bytes){
      options.signal?.throwIfAborted();
      const args={exportId:manifest.exportId,file,expectedManifestSha256:manifestSha256,
        expectedSha256:item.sha256,offset,limit,...(readId?{readId}:{})};
      let page;
      try{page=await bound.client.call(TOOL_PREFIX+'file',args,
        options.signal?{requestSignal:options.signal}:undefined);}
      catch(error){
        if(error.code!=='WORDPRESS_MERCHANT_READ_NOT_FOUND'||!readId)throw error;
        readId=null;delete args.readId;
        page=await bound.client.call(TOOL_PREFIX+'file',args,
          options.signal?{requestSignal:options.signal}:undefined);
      }
      const count=Math.min(limit,item.bytes-offset),chunk=Buffer.from(page.data??'','base64');
      need(page.exportId===manifest.exportId && page.manifestSha256===manifestSha256 &&
        page.file?.name===file && page.file.sha256===item.sha256 && page.file.bytes===item.bytes &&
        page.offset===offset && page.bytesRead===count && chunk.length===count &&
        chunk.toString('base64')===page.data &&
        page.nextOffset===(offset+count<item.bytes?offset+count:null) &&
        typeof page.readId==='string' && new RegExp(UUID).test(page.readId) && (!readId||readId===page.readId),
        'WORDPRESS_MERCHANT_DOWNLOAD_CHUNK_CONFLICT','An original file range differs from its retained identity.');
      chunks.push(chunk);offset+=count;readId=page.nextOffset===null?null:page.readId;
    }
  }finally{
    if(readId)await bound.client.call(TOOL_PREFIX+'file_release',
      {exportId:manifest.exportId,readId},{requestSignal:null,timeoutMs:2000}).catch(()=>{});
  }
  const bytes=Buffer.concat(chunks,offset);
  need(bytes.length===item.bytes&&digest(bytes)===item.sha256,
    'WORDPRESS_MERCHANT_FILE_CHANGED','The complete JSON differs from its manifest.');
  return decode(bytes);
}

/** Select a source packet and the host's declared receiver; use its original receiver. */
export async function receiveWordPressSourcePacket(options={}){
  const bound=await boundClient(options);
  checked(options.receiver,ALIAS,'receiving alias');
  need(bound.manifest.kind==='source-packet','WORDPRESS_MERCHANT_SOURCE_PACKET_REQUIRED',
    'Choose the complete original WordPress source packet.');
  return bound.client.call(TOOL_PREFIX+'receive',{exportId:bound.manifest.exportId,
    expectedManifestSha256:bound.manifestSha256,receiver:options.receiver},
    options.signal?{requestSignal:options.signal}:undefined);
}
