#!/usr/bin/env node
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installReceivedRuntime, inspectRuntimeTransfer } from '../../distribution/runtime-transfer.mjs';
import { inspectRuntimeInstall } from '../../distribution/runtime-install.mjs';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { selectRozoSource } from './source.mjs';
import { RozoWorkspace } from './store.mjs';
import { receiveDelivery, putOriginal, hashOriginalFile } from './delivery.mjs';
import { nativeInventory, compareNativeInventory } from './native-inventory.mjs';
import { assert, canonical, digest } from './model.mjs';

const PRODUCT='stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
function document(path){return JSON.parse(readFileSync(path));}
function exact(path,expected){
  const actual=hashOriginalFile(path);
  assert(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,
    'INSTALLED_RECEIVE_FILE','The complete original receiving member differs: '+path,409);
  return actual;
}
/** Called from the received runtime's own complete source in a separate Node process. */
export async function receiveInstalledRozo(selectionFile){
  const raw=readFileSync(selectionFile),selection=JSON.parse(raw);
  assert(selection.schema==='stellar-forge.rozo-installed-receiving-selection.v1'&&
    selection.nativeOperation==='ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012',
    'INSTALLED_RECEIVE_SELECTION','Select the retained original installed receiving request.',409);
  const runtimeDirectory=realpathSync(selection.runtimeDirectory);
  const selected=selectRozoSource(join(runtimeDirectory,'package','source'));
  assert(selected.sourceIdentity.manifestSha256===selection.sourceIdentity.manifestSha256&&
    canonical(selected.sourceIdentity)===canonical(selection.sourceIdentity),
    'INSTALLED_RECEIVE_SOURCE','The received original runtime source differs.',409);
  const self=join(selected.sourceRoot,PRODUCT,'applications-receiving.mjs');
  assert(realpathSync(self)===realpathSync(fileURLToPath(import.meta.url)),
    'INSTALLED_RECEIVE_PROCESS','Run the receiving module from the extracted original runtime source.',409);
  const transfer=await inspectRuntimeTransfer({directory:selection.transfer.directory,verify:true});
  assert(transfer.complete&&transfer.manifestSha256===selection.transfer.manifestSha256&&
    transfer.manifest.transferId===selection.transfer.transferId,
    'INSTALLED_RECEIVE_TRANSFER','The complete original runtime transfer differs.',409);
  const installed=await installReceivedRuntime({
    directory:selection.transfer.directory,runtimeDirectory,npm:selection.npm,python:selection.python,
    install:true,recoverFrom:selection.recoverFrom??null
  });
  const inspection=await inspectRuntimeInstall({directory:runtimeDirectory,source:true,load:true,python:selection.python});
  assert(installed.status==='READY'&&inspection.status==='READY'&&inspection.ready,
    'INSTALLED_RECEIVE_READY','The received original runtime did not finish installation.',409);
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:true});
  for(const key of ['installationId','profileId','profileSha256','lockSha256','sourceCommit','sourceManifestSha256'])
    assert(runtime[key]===selection.runtime[key],'INSTALLED_RECEIVE_RUNTIME','The original runtime identity differs: '+key,409);
  exact(selection.archive.path,selection.archive);
  exact(selection.inventory.path,selection.inventory);
  const expected=document(selection.inventory.path);
  assert(expected.workspace.workspaceId===selection.workspaceId&&expected.workspace.originId===selection.originId,
    'INSTALLED_RECEIVE_WORKSPACE','The retained original inventory belongs to another workspace.',409);
  const received=await receiveDelivery(selection.archive.path,selection.directory,{
    sha256:selection.archive.sha256,activate:false,python:selection.python
  });
  const manifest=document(join(received.directory,'DELIVERY.json'));
  assert(manifest.mode==='working'&&manifest.operation.requestId===selection.exportRequestId&&
    manifest.sourceIdentity.manifestSha256===selected.sourceIdentity.manifestSha256,
    'INSTALLED_RECEIVE_DELIVERY','The working archive does not retain the same installed source and original request.',409);
  const original=new RozoWorkspace(received.workspaceDirectory,{readOnly:true});let verified,actual,exportRequest;
  try{
    actual=nativeInventory(original);verified=compareNativeInventory(expected,actual);
    exportRequest=original.request(selection.exportRequestId);
    assert(exportRequest?.state==='accepted'&&exportRequest.envelope.command==='workspace.export'&&
      exportRequest.intent.sourceSha256===selected.sourceIdentity.manifestSha256,
      'INSTALLED_RECEIVE_REQUEST','The original working export request is not retained.',409);
  }finally{original.close();}
  let readOnly=false;
  try{const invalid=new RozoWorkspace(received.workspaceDirectory);invalid.close();}
  catch(error){readOnly=error.code==='RECEIVE_REQUIRED';}
  assert(readOnly,'INSTALLED_RECEIVE_CUSTODY','A working snapshot must remain read-only.',409);
  const result={
    schema:'stellar-forge.rozo-installed-receiving-result.v1',
    operationId:selection.operationId,nativeOperation:selection.nativeOperation,nativeCompletionSha256:selection.nativeCompletionSha256,
    dataContext:'DEVELOPMENT',selectionSha256:digest(raw),runtime,transfer:{id:transfer.manifest.transferId,manifestSha256:transfer.manifestSha256},
    workspace:verified,archive:selection.archive,exportRequestId:selection.exportRequestId,exportFingerprint:exportRequest.fingerprint,
    sourceRoot:received.sourceRoot,sourceManifest:received.sourceManifest,sourceIdentity:selected.sourceIdentity,
    workspaceDirectory:received.workspaceDirectory,configuration:received.configuration,
    readOnly:true,applicationId:selection.applicationId,applicationRevision:selection.applicationRevision,applicationRunId:selection.applicationRunId
  };
  const out=resolve(selection.resultFile);
  if(existsSync(out))assert(canonical(document(out))===canonical(result),'INSTALLED_RECEIVE_RESULT','The accepted original receiving result differs.',409);
  else putOriginal(out,Buffer.from(canonical(result)+'\n'));
  return result;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  assert(process.argv.length===4&&process.argv[2]==='--selection','INSTALLED_RECEIVE_ARGUMENT','Supply the complete original --selection file.');
  receiveInstalledRozo(resolve(process.argv[3])).then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{
    process.stderr.write(JSON.stringify({error:{code:error.code??'INSTALLED_RECEIVE_ERROR',message:error.message,details:error.details??{}}})+'\n');
    process.exitCode=1;
  });
}
