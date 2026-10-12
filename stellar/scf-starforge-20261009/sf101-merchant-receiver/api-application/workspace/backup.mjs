#!/usr/bin/env node
// MIT. Complete merchant sidecars join the original encrypted application recovery.
import {join,dirname,resolve} from 'node:path';
import {openOutbox} from '../../../sf98-merchant-delivery/outbox.mjs';
import {fileURLToPath} from 'node:url';
import {lstat,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {run as encryptedRecovery} from '../../../sf101-merchant-recovery/recover.mjs';
import {inspectApplicationSnapshot,restoreApplication,readApplicationRuntime} from '../recovery.mjs';
import {openJobStore} from '../../../sf30-seller-sdk/jobs/store.mjs';
import {validateExecution} from '../worker.mjs';
import {need,absolute,ownedDirectory,ownedBytes,writeExact,encoded,parse,digest,canonical,HASH,UUID} from './configuration.mjs';

const SIDECAR='stellar-forge.sf101.api-merchant-backup-sidecar.v1';
async function sidecar(directory){
 await ownedDirectory(directory);
 const bytes=await ownedBytes(join(directory,'manifest.json'),262144),manifest=parse(bytes);
 need(manifest.schema===SIDECAR&&UUID.test(manifest.offerId)&&HASH.test(manifest.profileSha256)&&
  HASH.test(manifest.planSha256)&&HASH.test(manifest.checkoutSha256)&&HASH.test(manifest.snapshotManifestSha256),
  'API_MERCHANT_BACKUP_SIDECAR_CHANGED',409);
 need(manifest.outboxBinding&&typeof manifest.outboxBinding.root==='string'&&
  (manifest.outboxBinding.root==='application'||/^data-[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(manifest.outboxBinding.root))&&
  typeof manifest.outboxBinding.path==='string'&&manifest.outboxBinding.path.length<=2048&&
  !/[\\\\\x00-\x1f\x7f]/.test(manifest.outboxBinding.path)&&
  (manifest.outboxBinding.path===''||manifest.outboxBinding.path.split('/').every(part=>part&&part!=='.'&&part!=='..')),
  'API_MERCHANT_BACKUP_OUTBOX_CHANGED',409);
 absolute(manifest.originalOutbox);
 const plan=await ownedBytes(join(directory,'api-pass.json'),1048576);
 const checkout=await ownedBytes(join(directory,'checkout.json'),131072);
 need(digest(plan)===manifest.planSha256&&plan.length===manifest.planBytes&&digest(checkout)===manifest.checkoutSha256,
  'API_MERCHANT_BACKUP_SIDECAR_CHANGED',409);
 need(parse(checkout).outbox===manifest.originalOutbox,'API_MERCHANT_BACKUP_OUTBOX_CHANGED',409);
 return {manifest,bytes,plan,checkout};
}
async function verifyOutboxBinding(snapshot,extra){
 const bytes=await ownedBytes(join(snapshot,'application-snapshot.json'),12*1024*1024),manifest=parse(bytes);
 need(digest(bytes)===extra.manifest.snapshotManifestSha256,'API_MERCHANT_BACKUP_SOURCE_CHANGED',409);
 const binding=extra.manifest.outboxBinding,root=manifest.roots.find(root=>root.id===binding.root);
 need(root&&['application','data'].includes(root.kind)&&
  resolve(root.sourcePath,...binding.path.split('/'))===extra.manifest.originalOutbox&&
  manifest.entries.some(entry=>entry.root===binding.root&&entry.path===binding.path&&entry.kind==='directory'),
  'API_MERCHANT_BACKUP_OUTBOX_CHANGED',409);
}
async function restoredOutbox(runtime,manifest){
 const binding=manifest.outboxBinding;
 const root=binding.root==='application'?runtime.recoveryApplicationRoot:
  runtime.recoveryDataRoots?.find(root=>'data-'+root.name===binding.root)?.path;
 need(root,'API_MERCHANT_RESTORED_OUTBOX_CHANGED',409);
 const path=resolve(root,...binding.path.split('/'));
 need(path===root||path.startsWith(root+'/'),'API_MERCHANT_RESTORED_OUTBOX_CHANGED',409);
 await ownedDirectory(path);
 // Reopen the original journal; no delivery or settlement record is rewritten.
 await (await openOutbox(path)).status();
 return path;
}
async function verified(bundle,passEnv,expected){
 const verification=await encryptedRecovery(['verify','--bundle',bundle,'--pass-env',passEnv]);
 const manifest=parse(await ownedBytes(join(bundle,'manifest.json'),12*1024*1024));
 need(canonical(manifest.roots.map(root=>root.name).sort())===canonical(['application','merchant-workspace']),
  'API_MERCHANT_BACKUP_ROOTS_CHANGED',409);
 const source=manifest.entries.find(entry=>entry.path==='application/application-snapshot.json');
 const selected=manifest.entries.find(entry=>entry.path==='merchant-workspace/manifest.json');
 need(source?.sha256===expected.snapshotManifestSha256&&selected?.sha256===expected.sidecarSha256,
  'API_MERCHANT_BACKUP_SOURCE_CHANGED',409);
 return verification;
}
export async function encryptMerchantSnapshot(value){
 const snapshot=absolute(value.snapshot),sidecarDirectory=absolute(value.sidecar),bundle=absolute(value.bundle);
 const original=await inspectApplicationSnapshot(snapshot,{python:value.python}),extra=await sidecar(sidecarDirectory);
 need(original.manifestSha256===extra.manifest.snapshotManifestSha256&&
  original.profileSha256===extra.manifest.profileSha256&&canonical(original.source)===canonical(extra.manifest.source),
  'API_MERCHANT_BACKUP_SOURCE_CHANGED',409);
 await verifyOutboxBinding(snapshot,extra);
 const expected={snapshotManifestSha256:original.manifestSha256,sidecarSha256:digest(extra.bytes)};
 let present;try{present=await lstat(bundle);}catch(error){if(error.code!=='ENOENT')throw error;}
 let result;
 if(present){
  need(present.isDirectory()&&!present.isSymbolicLink(),'API_MERCHANT_BACKUP_DIRECTORY_CHANGED',409);
  try{result=await verified(bundle,value.passEnv,expected);}
  catch(error){
   // A crash before the original encryptor published its final manifest leaves
   // no complete bundle. Preserve that partial directory and resume this image.
   let hasManifest=true;try{await lstat(join(bundle,'manifest.json'));}catch(e){if(e.code==='ENOENT')hasManifest=false;else throw e;}
   if(hasManifest)throw error;
   await rename(bundle,join(dirname(bundle),'interrupted-encrypted-'+randomUUID()));present=null;
  }
 }
 if(!present){
  const planPath=join(dirname(bundle),'merchant-encryption-plan.json');
  await writeExact(planPath,encoded({schema:'stellar-forge.merchant-recovery-plan.v1',
   roots:[{name:'application',path:snapshot},{name:'merchant-workspace',path:sidecarDirectory}]}));
  result=await encryptedRecovery(['snapshot','--plan',planPath,'--out',bundle,'--pass-env',value.passEnv,'--quiesced']);
  await verified(bundle,value.passEnv,expected);
 }
 const encryptedManifest=await ownedBytes(join(bundle,'manifest.json'),12*1024*1024);
 return {...result,bundle,...expected,encryptedManifestSha256:digest(encryptedManifest),
  source:original.source,profileSha256:original.profileSha256};
}
export async function restoreMerchantSnapshot(value){
 const bundle=absolute(value.bundle),destination=absolute(value.destination);
 need(value.recoverInterruptedDestination===undefined||typeof value.recoverInterruptedDestination==='boolean',
  'API_MERCHANT_RESTORE_RECOVERY_MODE_REQUIRED');
 need(HASH.test(value.encryptedManifestSha256)&&HASH.test(value.snapshotManifestSha256)&&HASH.test(value.sidecarSha256),
  'API_MERCHANT_BACKUP_SOURCE_REQUIRED');
 const encryptedManifest=await ownedBytes(join(bundle,'manifest.json'),12*1024*1024);
 need(digest(encryptedManifest)===value.encryptedManifestSha256,'API_MERCHANT_ENCRYPTED_MANIFEST_CHANGED',409);
 await verified(bundle,value.passEnv,value);
 const temporary=join(dirname(destination),'.merchant-workspace-decrypted-'+randomUUID());
 let created=false;
 try{
  await encryptedRecovery(['restore','--bundle',bundle,'--out',temporary,'--pass-env',value.passEnv]);created=true;
  const extra=await sidecar(join(temporary,'merchant-workspace'));
  need(digest(extra.bytes)===value.sidecarSha256&&extra.manifest.snapshotManifestSha256===value.snapshotManifestSha256,
   'API_MERCHANT_BACKUP_SIDECAR_CHANGED',409);
  await verifyOutboxBinding(join(temporary,'application'),extra);
  let runtime,restoration,present;
  try{present=await lstat(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(present){
   await ownedDirectory(destination);
   let complete=true;
   try{parse(await ownedBytes(join(destination,'application.json'),12*1024*1024));}
   catch(error){if(!['ENOENT','API_MERCHANT_JSON_REQUIRED'].includes(error.code))throw error;complete=false;}
   if(complete)runtime=await readApplicationRuntime(join(destination,'application.json'));
   else{
    need(value.recoverInterruptedDestination!==false,'API_MERCHANT_RESTORE_DESTINATION_INCOMPLETE',409);
    await rename(destination,join(dirname(destination),'interrupted-restored-'+randomUUID()));
   }
  }
  if(runtime){
   need(runtime.executionBinding?.snapshotManifestSha256===value.snapshotManifestSha256&&
    runtime.profileSha256===extra.manifest.profileSha256&&
    canonical(runtime.source.identity)===canonical(extra.manifest.source),'API_MERCHANT_RESTORED_SOURCE_CHANGED',409);
   const store=await openJobStore(runtime.profile.store,runtime.source);
   try{for(const row of store.rows()){validateExecution(runtime,row);if(row.result)await store.readResult(row.result);}}
   finally{await store.close();}
   restoration={profile:runtime.profilePath,state:runtime.gateway.state,store:runtime.profile.store,
    profileSha256:runtime.profileSha256,source:runtime.source.identity,snapshotManifestSha256:value.snapshotManifestSha256,replayed:true};
  }else{
   restoration=await restoreApplication(join(temporary,'application'),destination,{python:value.python});
   runtime=await readApplicationRuntime(restoration.profile);
  }
  const receiving=join(destination,'merchant-workspace');
  await ownedDirectory(receiving,{create:true});
  await writeExact(join(receiving,'manifest.json'),extra.bytes);
  await writeExact(join(receiving,'api-pass.json'),extra.plan);
  await writeExact(join(receiving,'checkout-original.json'),extra.checkout);
  const checkout=parse(extra.checkout);
  checkout.state=runtime.gateway.state;checkout.outbox=await restoredOutbox(runtime,extra.manifest);
  await writeExact(join(receiving,'checkout-restored.json'),encoded(checkout));
  return {...restoration,sidecar:{...extra.manifest,sha256:digest(extra.bytes),
   directory:receiving,planFile:join(receiving,'api-pass.json'),checkoutFile:join(receiving,'checkout-restored.json')}};
 }finally{if(created)await rm(temporary,{recursive:true,force:true});}
}
async function main(){
 const parts=[];let size=0;
 for await(const part of process.stdin){size+=part.length;need(size<=1048576,'API_MERCHANT_BACKUP_REQUEST_TOO_LARGE');parts.push(part);}
 const value=parse(Buffer.concat(parts));
 const result=process.argv[2]==='encrypt'?await encryptMerchantSnapshot(value):
  process.argv[2]==='restore'?await restoreMerchantSnapshot(value):
  process.argv[2]==='verify'?await verified(value.bundle,value.passEnv,value):null;
 need(result,'API_MERCHANT_BACKUP_ACTION_REQUIRED');
 process.stdout.write(canonical(result)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{const code=/^[A-Z][A-Z0-9_]{1,120}$/.test(error?.code??'')?error.code:'API_MERCHANT_BACKUP_FAILED';
  process.stderr.write(JSON.stringify({error:code,status:Number.isInteger(error.status)?error.status:503})+'\n');process.exitCode=1;});
