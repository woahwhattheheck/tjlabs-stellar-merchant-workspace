// MIT — A received research project's exact original identities remain stable.
import {dirname,join} from 'node:path';
import {readSnapshot,digest,requireValue} from '../files.mjs';
export const PROJECT_SOURCE='stellar-forge.resource-research-source.v1';
const HASH=/^[a-f0-9]{64}$/;
export async function readProjectSource(config){
  const bytes=await readSnapshot(config.source),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  requireValue(value.schema===PROJECT_SOURCE&&Array.isArray(value.resources)&&value.resources.length<=10000,'PROJECT_SOURCE_INVALID');
  const seen=new Set(),base=dirname(config.source);
  const resources=value.resources.map(record=>{
    requireValue(record&&HASH.test(record.id??'')&&!seen.has(record.id),'PROJECT_IDENTITY_INVALID');seen.add(record.id);
    const copy={...record};
    if(copy.deliveryStatus==='SAVED'){
      requireValue(HASH.test(copy.sha256??'')&&Number.isSafeInteger(copy.bytes)&&copy.bytes>=0,'PROJECT_FILE_METADATA_INVALID');
      copy.path=join(base,'files',copy.sha256);copy.status='UNVERIFIED';
    }
    // Original source, payment terms, intent, digest and ID are provenance, not new purchases.
    return copy;
  });
  return {resources,details:{sourceSha256:digest(bytes),sourceBytes:bytes.length,
    jobCount:value.originalScan?.jobCount??resources.length,resourceCount:resources.length,
    withoutFile:value.originalScan?.withoutFile??0,rejected:value.originalScan?.rejected??[],
    projectId:value.projectId,originalSource:value.originalConfig,originalGeneration:value.originalScan?.generation}};
}
