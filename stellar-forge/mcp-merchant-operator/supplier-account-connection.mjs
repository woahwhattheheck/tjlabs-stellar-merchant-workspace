// MIT. Private host aliases and exact complete native receiving inputs.
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { exact, failure, identifier, line, plain, privateSupportDirectory, writePrivate } from './host-files.mjs';
import { MAX_SUPPLIER_ACCOUNT_FILE_BYTES } from './supplier-account-contracts.mjs';

export const SUPPLIER_ACCOUNT_CONNECTION_SCHEMA='stellar-forge.supplier-account-workspace-connection.v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
function hostPath(value,base){
  if(typeof value!=='string'||!value||value.includes('\0'))
    throw failure('CONFIGURATION_ERROR','Select paths in the private host connection.');
  return resolve(base,value);
}
async function stablePrivateBytes(path,{maximum,bytes,sha256}={}){
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await file.stat({bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.size<1n||before.size>BigInt(maximum)||
        bytes!==undefined&&before.size!==BigInt(bytes)||process.platform!=='win32'&&
        ((before.mode&0o077n)!==0n||process.getuid&&before.uid!==BigInt(process.getuid())))
      throw failure('SUPPLIER_ACCOUNT_INPUT_INVALID','Use the selected owned private regular file within its exact byte limit.');
    const length=Number(before.size),result=Buffer.allocUnsafe(length);let position=0;
    while(position<length){
      const read=await file.read(result,position,Math.min(65536,length-position),position);
      if(!read.bytesRead)throw failure('SUPPLIER_ACCOUNT_INPUT_CHANGED','The selected input ended before its complete retained bytes.');
      position+=read.bytesRead;
    }
    const extra=await file.read(Buffer.alloc(1),0,1,length),after=await file.stat({bigint:true}),named=await lstat(path,{bigint:true});
    if(extra.bytesRead||!same(before,after)||!same(before,named)||named.isSymbolicLink()||sha256!==undefined&&sha(result)!==sha256)
      throw failure('SUPPLIER_ACCOUNT_INPUT_CHANGED','The selected input changed from its original descriptor, bytes or SHA-256.');
    return result;
  }finally{await file.close();}
}
function json(bytes){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw failure('SUPPLIER_ACCOUNT_INPUT_JSON','Retain the complete UTF-8 JSON input.');}
}
/** Configuration reads neither receiving bodies nor native databases. */
export async function readSupplierAccountWorkspaceConfiguration(path){
  path=resolve(path);
  const raw=json(await stablePrivateBytes(path,{maximum:1048576}));
  exact(raw,['schema','workspaces'],['schema','workspaces']);
  if(raw.schema!==SUPPLIER_ACCOUNT_CONNECTION_SCHEMA||!plain(raw.workspaces)||
      Object.keys(raw.workspaces).length<1||Object.keys(raw.workspaces).length>32)
    throw failure('CONFIGURATION_ERROR','Declare 1–32 supplier-account workspace aliases.');
  const base=dirname(path),workspaces=Object.create(null),directories=new Set();
  for(const [alias,item]of Object.entries(raw.workspaces)){
    identifier(alias,'Supplier-account workspace alias');
    exact(item,['label','directory','upstreamsFile','inputs'],['directory','upstreamsFile']);
    const directory=hostPath(item.directory,base);
    await privateSupportDirectory(directory);
    if(await realpath(directory)!==directory)throw failure('CONFIGURATION_ERROR','Select the canonical original workspace directory.');
    const info=await lstat(directory);
    if(process.getuid&&info.uid!==process.getuid())throw failure('CONFIGURATION_ERROR','The native directory must belong to the host user.');
    if(directories.has(directory))throw failure('CONFIGURATION_ERROR','Give each original supplier-account directory one alias.');
    directories.add(directory);
    const inputs=Object.create(null),declared=item.inputs??{};
    if(!plain(declared)||Object.keys(declared).length>256)throw failure('CONFIGURATION_ERROR','Declare up to 256 complete receiving inputs.');
    for(const [inputId,input]of Object.entries(declared)){
      identifier(inputId,'Receiving input alias');
      exact(input,['path','bytes','sha256','provenance'],['path','bytes','sha256']);
      if(!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>MAX_SUPPLIER_ACCOUNT_FILE_BYTES||
          typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256))
        throw failure('CONFIGURATION_ERROR','Each complete backup input needs its exact byte length and SHA-256.');
      if(input.provenance!==undefined&&(!plain(input.provenance)||Buffer.byteLength(JSON.stringify(input.provenance))>32768))
        throw failure('CONFIGURATION_ERROR','Keep complete input provenance within 32 KiB.');
      inputs[inputId]=Object.freeze({path:hostPath(input.path,base),bytes:input.bytes,sha256:input.sha256,
        ...(input.provenance===undefined?{}:{provenance:JSON.parse(JSON.stringify(input.provenance))})});
    }
    workspaces[alias]=Object.freeze({label:line(item.label??alias,'Workspace label'),directory,
      upstreamsFile:hostPath(item.upstreamsFile,base),inputs:Object.freeze(inputs)});
  }
  return Object.freeze({workspaces:Object.freeze(workspaces)});
}
export function supplierAccountInputSummary(inputId,input){
  return{inputId,kind:'backup',bytes:input.bytes,sha256:input.sha256,
    ...(input.provenance===undefined?{}:{provenance:JSON.parse(JSON.stringify(input.provenance))})};
}
export async function readSupplierAccountBackupInput(input,expectedSha256){
  if(input.sha256!==expectedSha256)throw failure('SUPPLIER_ACCOUNT_INPUT_CHANGED','Select the original host input SHA-256.');
  const backup=json(await stablePrivateBytes(input.path,{maximum:MAX_SUPPLIER_ACCOUNT_FILE_BYTES,bytes:input.bytes,sha256:input.sha256}));
  if(!plain(backup)||backup.schema!=='stellar-forge.supplier-account-backup.v1')
    throw failure('SUPPLIER_ACCOUNT_INPUT_KIND','Select a complete original supplier-account receiving backup.');
  return backup;
}
/** Create a maintained Merchant host around already-selected original workspace aliases. */
export async function initializeSupplierAccountMerchant({directory,connection,releaseStore,name='Starforge supplier accounts'}={}){
  const root=hostPath(directory,process.cwd()),selectedConnection=hostPath(connection,process.cwd());
  name=line(name,'Merchant name');
  const selection=await readSupplierAccountWorkspaceConfiguration(selectedConnection);
  const release=await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs');
  const existing=releaseStore===undefined?null:hostPath(releaseStore,process.cwd());
  if(existing)await release.readReleaseState(existing);
  await mkdir(root,{mode:0o700});
  const selectedStore=existing??join(root,'releases');
  if(!existing)await release.initReleaseStore(selectedStore);
  await mkdir(join(root,'customer-exports'),{mode:0o700});
  const configuration=join(root,'merchant-mcp.json');
  const {CONFIG_SCHEMA,readMerchantConfig}=await import('./config.mjs');
  await writePrivate(configuration,{schema:CONFIG_SCHEMA,name,releaseStore:selectedStore,exportsDirectory:'./customer-exports',
    sources:{},supplierAccountWorkspaceConnection:selectedConnection});
  await readMerchantConfig(configuration);
  return{schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',supplierAccountsConfigured:true,
    workspaces:Object.entries(selection.workspaces).map(([workspace,entry])=>({workspace,label:entry.label})),
    authoring:'OPENED_BY_MERCHANT_SUPPLIER_ACCOUNT_OPEN',existingReleaseStore:Boolean(existing)};
}
