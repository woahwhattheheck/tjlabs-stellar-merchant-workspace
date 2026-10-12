// SPDX-License-Identifier: MIT
// A thin original-client adapter; the maintained retained-download owns checkpoints and no-replace publication.
import { randomUUID } from 'node:crypto';
import { createRetainedDownload } from '../../../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import { RetainedFileReads } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { bytes, digest } from '../postgres/publisher/files.mjs';
import { readOpenAQConnection, verifyOpenAQConnection, operatorJSON } from './managed.mjs';
import { need, uuid, HASH } from './contract.mjs';
const SCHEMA='stellar-forge.openaq-download-manifest.v1',NAME='OpenAQ_Delivery_Manifest.json';
function parseManifest(raw,exportId){
 const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 need(v.schema===SCHEMA&&v.exportId===exportId&&Array.isArray(v.files)&&v.files.length===1,'OPENAQ_DOWNLOAD_MANIFEST_INVALID');
 for(const x of v.files)need(x.name==='OpenAQ_Project_'+uuid(exportId)+'.tgz'&&HASH.test(x.sha256??'')&&Number.isSafeInteger(x.bytes)&&x.bytes>=1&&x.bytes<=256*1024*1024,'OPENAQ_DOWNLOAD_FILE_INVALID');
 return v;
}
const transfer=createRetainedDownload({manifestName:NAME,parseManifest,maximumBytes:256*1024*1024,
 stateSchema:'stellar-forge.openaq-download.v1',resultSchema:'stellar-forge.openaq-download-result.v1',
 toolPrefix:'openaq_original',errorPrefix:'OPENAQ',clientName:'openaq-project-download',validateExportId:uuid,
 describe:v=>({workspaceId:v.workspaceId,sourceWorkspaceId:v.sourceWorkspaceId,projectManifestSha256:v.projectManifestSha256})});
export async function downloadOpenAQProject({connectionFile,exportId,directory,expectedManifestSha256,signal}){
 uuid(exportId);const binding=await readOpenAQConnection(connectionFile);await verifyOpenAQConnection(binding);
 const op=await operatorJSON(binding,'/api/read',{method:'POST',body:{action:'operation',input:{id:exportId}},signal});
 need(op.action==='export'&&op.state==='COMPLETE'&&op.result.requestId===exportId,'OPENAQ_EXPORT_NOT_COMPLETE');
 const selected=op.result,manifest={schema:SCHEMA,exportId,workspaceId:binding.workspaceId,sourceWorkspaceId:selected.sourceWorkspaceId,
  projectManifestSha256:selected.manifestSha256,files:[{name:selected.file,sha256:selected.sha256,bytes:selected.bytes}]};
 const raw=bytes(manifest),manifestHash=digest(raw),manifestFile={name:NAME,sha256:manifestHash,bytes:raw.length};
 const reader=new RetainedFileReads({errorPrefix:'OPENAQ'}),scope=randomUUID(),remoteReads=new Set();
 const client={endpoint:'openaq-project:'+binding.workspaceId+':'+binding.configurationSha256+':'+exportId,
  async call(name,args){
   need(args.exportId===exportId,'OPENAQ_DOWNLOAD_EXPORT_CHANGED');
   if(name==='openaq_original_manifest')return{state:'MANIFEST_RETAINED',exportId,manifestFile};
   if(name==='openaq_original_file_release'){
    await reader.release(scope,args.readId);if(remoteReads.has(args.readId)){await operatorJSON(binding,'/api/file-release',{method:'POST',body:{readId:args.readId}});remoteReads.delete(args.readId);}return{released:true};
   }
   need(name==='openaq_original_file'&&args.expectedManifestSha256===manifestHash,'OPENAQ_DOWNLOAD_MANIFEST_CHANGED');
   let value;
   if(args.file===NAME)value=await reader.read({scope,key:NAME,kind:'manifest',directory,load:()=>({bytes:raw,name:NAME,type:'application/json'}),readId:args.readId,expectedSha256:args.expectedSha256,offset:args.offset,limit:args.limit});
   else{
    need(args.file===selected.file&&args.expectedSha256===selected.sha256,'OPENAQ_DOWNLOAD_FILE_CHANGED');
    value=await operatorJSON(binding,'/api/file-read',{method:'POST',body:{kind:'export',id:exportId,name:selected.file,
     readId:args.readId,expectedSha256:args.expectedSha256,offset:args.offset,limit:args.limit},signal});
    if(value.nextOffset!==null)remoteReads.add(value.readId);else remoteReads.delete(value.readId);
   }
   return {...value,exportId,manifestSha256:manifestHash};
  }};
 let outcome,originalError;try{outcome=await transfer.download({client,exportId,directory,expectedManifestSha256,signal});}catch(e){originalError=e;}
 const failures=[];for(const readId of remoteReads)try{await operatorJSON(binding,'/api/file-release',{method:'POST',body:{readId}});}catch(e){failures.push(e);}try{await reader.close();}catch(e){failures.push(e);}
 if(originalError){if(failures.length)throw new AggregateError([originalError,...failures],'The original transfer failed and an owned reader also failed to close.',{cause:originalError});throw originalError;}
 if(failures.length)throw new AggregateError(failures,'Original OpenAQ download readers did not close.');return outcome;
}
