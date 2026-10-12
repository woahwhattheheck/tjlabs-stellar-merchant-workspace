// MIT. Immutable whole native snapshots using the existing private file and download engines.
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { privateDirectory, withPrivateLock, atomicJson, readPrivateJson } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import { failure } from './host-files.mjs';
import { MAX_SUPPLIER_ACCOUNT_FILE_BYTES, SUPPLIER_ACCOUNT_EXPORT_SCHEMA,
  SUPPLIER_ACCOUNT_EXPORT_MANIFEST, validateSupplierAccountExportId,
  parseSupplierAccountExportManifest } from './supplier-account-contracts.mjs';
const ENVELOPE='stellar-forge.supplier-account-retained-snapshot.v1';
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const root=entry=>join(entry.directory,'merchant-account-exports');
const filename=exportId=>validateSupplierAccountExportId(exportId)+'.json';
function describe(value,exportId,workspaceId){
  if(!value||value.schema!==ENVELOPE||value.exportId!==exportId||value.workspaceId!==workspaceId||
      !['report','backup'].includes(value.kind)||typeof value.createdAt!=='string')
    throw failure('SUPPLIER_ACCOUNT_EXPORT_CHANGED','Reopen the exact retained snapshot from its original workspace and export ID.');
  const payload=bytes(value.payload);
  if(payload.length<1||payload.length>MAX_SUPPLIER_ACCOUNT_FILE_BYTES||value.payloadSha256!==sha(payload))
    throw failure('SUPPLIER_ACCOUNT_EXPORT_CHANGED','The complete retained native snapshot differs from its recorded SHA-256.');
  const originalId=value.kind==='backup'?value.payload?.data?.metadata?.id:value.payload?.workspaceId;
  const expectedSchema=value.kind==='backup'?'stellar-forge.supplier-account-backup.v1':'stellar-forge.supplier-account-report.v1';
  if(originalId!==workspaceId||value.payload?.schema!==expectedSchema)
    throw failure('SUPPLIER_ACCOUNT_EXPORT_CHANGED','The complete native payload differs from its original workspace or kind.');
  const manifest={schema:SUPPLIER_ACCOUNT_EXPORT_SCHEMA,exportId,workspaceId,kind:value.kind,createdAt:value.createdAt,
    files:[{name:value.kind==='backup'?'workspace-backup.json':'operator-report.json',bytes:payload.length,sha256:value.payloadSha256,type:'application/json'}]};
  const manifestBytes=bytes(manifest);
  parseSupplierAccountExportManifest(manifestBytes,exportId);
  return{manifest,manifestBytes,payload,manifestFile:{name:SUPPLIER_ACCOUNT_EXPORT_MANIFEST,bytes:manifestBytes.length,sha256:sha(manifestBytes)},manifestSha256:sha(manifestBytes)};
}
export async function readSupplierAccountExport(entry,exportId,workspaceId){
  const directory=root(entry);await privateDirectory(directory);
  const value=await readPrivateJson(join(directory,filename(exportId)),2*MAX_SUPPLIER_ACCOUNT_FILE_BYTES+1048576);
  return describe(value,exportId,workspaceId);
}
export async function retainSupplierAccountExport({entry,model,workspaceId,exportId,kind}){
  if(!['report','backup'].includes(kind))throw failure('SUPPLIER_ACCOUNT_EXPORT_KIND','Select a complete report or native backup.');
  const directory=root(entry),name=filename(exportId);await privateDirectory(directory);
  return withPrivateLock(directory,exportId+'.lock',async()=>{
    let existing;
    try{existing=await readPrivateJson(join(directory,name),2*MAX_SUPPLIER_ACCOUNT_FILE_BYTES+1048576);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(existing!==undefined){
      const result=describe(existing,exportId,workspaceId);
      if(result.manifest.kind!==kind)throw failure('SUPPLIER_ACCOUNT_EXPORT_ID_USED','This export ID already retains its original snapshot kind.');
      return result;
    }
    const payload=await model[kind==='backup'?'backup':'report'](),body=bytes(payload);
    if(body.length>MAX_SUPPLIER_ACCOUNT_FILE_BYTES)throw failure('SUPPLIER_ACCOUNT_EXPORT_TOO_LARGE','The complete native snapshot exceeds its declared receiving limit.');
    const value={schema:ENVELOPE,exportId,workspaceId,kind,createdAt:new Date().toISOString(),payloadSha256:sha(body),payload};
    const result=describe(value,exportId,workspaceId);
    await atomicJson(directory,name,value,{exclusive:true});
    return result;
  });
}
export function supplierAccountExportSummary(value){
  return{state:'MANIFEST_RETAINED',exportId:value.manifest.exportId,workspaceId:value.manifest.workspaceId,
    manifestFile:value.manifestFile,manifestSha256:value.manifestSha256,manifest:value.manifest};
}
