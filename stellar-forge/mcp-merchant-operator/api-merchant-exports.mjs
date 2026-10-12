// MIT. Whole original API merchant exports through existing retained file ownership.
import {join} from 'node:path';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {inspectApiMerchantState} from './api-merchant-connection.mjs';
import {readExport,openExportFile} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/exports.mjs';
import {ownedBytes,digest,canonical} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {API_MERCHANT_MANIFEST,API_MERCHANT_MAX_MANIFEST_BYTES,apiMerchantNeed,parseApiMerchantExport} from './api-merchant-protocol.mjs';

export class ApiMerchantNativeExports{
 #reads=new RetainedFileReads({errorPrefix:'API_MERCHANT_AGENT'});
 constructor(alias,definition){this.alias=alias;this.definition=definition;}
 get summary(){return this.#reads.summary;}
 #scope(exportId){return this.definition.workspaceId+':'+exportId;}
 async #manifest(exportId){
  await inspectApiMerchantState(this.definition);
  const native=await readExport(this.definition,exportId);
  const bytes=await ownedBytes(join(this.definition.directory,'exports',exportId,API_MERCHANT_MANIFEST),API_MERCHANT_MAX_MANIFEST_BYTES);
  const parsed=parseApiMerchantExport(bytes,exportId),{exportId:unused,...original}=parsed;
  apiMerchantNeed(canonical(original)===canonical(native),'The original native manifest changed while being selected.','API_MERCHANT_AGENT_EXPORT_CHANGED');
  return {manifest:parsed,bytes,sha256:digest(bytes)};
 }
 async manifest(exportId){
  const saved=await this.#manifest(exportId);
  return {state:'MANIFEST_RETAINED',exportId,workspaceId:this.definition.workspaceId,
   kind:saved.manifest.kind,label:saved.manifest.label,createdAt:saved.manifest.createdAt,
   manifestFile:{name:API_MERCHANT_MANIFEST,bytes:saved.bytes.length,sha256:saved.sha256,contentType:'application/json'},
   files:saved.manifest.files.map(({path,...file})=>file)};
 }
 async file({exportId,file,expectedManifestSha256,expectedSha256,readId,offset=0,limit=65536}){
  const result=await this.#reads.read({
   scope:this.#scope(exportId),key:canonical({exportId,expectedManifestSha256,file}),kind:'api-merchant-export',
   directory:this.definition.directory,expectedSha256,readId,offset,limit,
   load:async()=>{
    // A retained read already owns the verified original descriptor and manifest
    // identity. Recheck native state and metadata only when opening that read.
    const saved=await this.#manifest(exportId);
    apiMerchantNeed(saved.sha256===expectedManifestSha256,'The selected original manifest SHA changed.','API_MERCHANT_AGENT_EXPORT_CHANGED');
    const metadata=file===API_MERCHANT_MANIFEST?{name:file,bytes:saved.bytes.length,sha256:saved.sha256,contentType:'application/json'}:
     saved.manifest.files.find(item=>item.name===file);
    apiMerchantNeed(metadata&&metadata.sha256===expectedSha256,'Select an original member with its exact manifest and file SHA.','API_MERCHANT_AGENT_EXPORT_FILE_CHANGED');
    if(file===API_MERCHANT_MANIFEST)return {bytes:saved.bytes,name:file,type:'application/json'};
    const selected=await openExportFile(this.definition,exportId,file);
    // Transfer the original read-only descriptor immediately. RetainedFileReads
    // owns exact digest/length verification and every later read and close.
    return {readonlyFileHandle:selected.handle,name:selected.file.name,bytes:selected.file.bytes,
     sha256:selected.file.sha256,type:selected.file.contentType};
   },
  });
  return {exportId,manifestSha256:expectedManifestSha256,...result};
 }
 release(exportId,readId){return this.#reads.release(this.#scope(exportId),readId);}
 close(){return this.#reads.close();}
}
