#!/usr/bin/env node
// MIT. Complete native provider/client receiving of the original supplier-account format.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { MerchantSupplierAccountWorkspaces } from '../supplier-account-workspaces.mjs';
import { readSupplierAccountWorkspaceConfiguration } from '../supplier-account-connection.mjs';
import { createSupplierAccountClient } from '../supplier-account-client.mjs';
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function privateJson(path,value){await writeFile(path,json(value),{mode:0o600,flag:'wx'});}
const fixture=fileURLToPath(new URL('../../../stellar/scf-starforge-20261009/sf30-seller-sdk/supplier-quota/receiving/original-workspace-84eb/upstreams.original.json',import.meta.url));

/** Run one complete local receiving journey in a new private directory, using actual native SQLite and files. */
export async function receiveSupplierAccountsThroughMerchant({directory,source=fixture}={}){
  if(typeof directory!=='string'||!directory)throw new TypeError('Select a new private receiving directory.');
  const root=resolve(directory);await mkdir(root,{mode:0o700});
  const origin=join(root,'origin'),target=join(root,'target'),sourceDirectory=join(root,'source');
  await mkdir(origin,{mode:0o700});await mkdir(target,{mode:0o700});await mkdir(sourceDirectory,{mode:0o700});
  const original=JSON.parse(await readFile(source,'utf8'));
  // Preserve the public original binding; give this new operation its own native quota directory.
  original.supplierAccounts.routescan.directory=join(root,'quota');
  const upstreamsFile=join(sourceDirectory,'upstreams.json'),targetFile=join(sourceDirectory,'received-upstreams.json');
  await privateJson(upstreamsFile,original);
  const connection=join(root,'connection.json');
  await privateJson(connection,{schema:'stellar-forge.supplier-account-workspace-connection.v1',workspaces:{
    operations:{directory:origin,upstreamsFile}
  }});
  const sourceConfig=await readSupplierAccountWorkspaceConfiguration(connection);
  let host=new MerchantSupplierAccountWorkspaces({supplierAccountWorkspaces:sourceConfig});
  const clientFor=async(workspace)=>createSupplierAccountClient({workspace,client:{
    endpoint:'native://supplier-account-receiving/'+root,call:(name,args)=>host.call(name,args)
  }});
  const steps=[];let receivedReport;
  try{
    let client=await clientFor('operations');
    const opened=await client.open();assert.equal(opened.state,'OPEN');
    const workspaceId=opened.workspaceId;steps.push('open-original-native-workspace');
    const proposal=await client.proposal();
    proposal.accounts[0].callsPerDay+=100;
    const prepared=await client.prepare({...proposal,note:'Review the original account through the maintained Merchant interface.'});
    assert.equal(prepared.state,'COMPLETE');assert.equal(prepared.change.status,'PREPARED');
    const reviewed=prepared.change;
    const refused=await client.apply({id:reviewed.id,revision:reviewed.revision,reviewSha256:'0'.repeat(64)});
    assert.equal(refused.state,'NATIVE_ERROR');assert.equal(refused.change.id,reviewed.id);
    assert.equal(refused.change.status,'PREPARED');steps.push('retain-original-review-and-native-error-identity');
    const applied=await client.apply({id:reviewed.id,revision:reviewed.revision,reviewSha256:reviewed.reviewSha256});
    assert.equal(applied.change.status,'APPLIED');
    const recovered=await client.recover({id:reviewed.id,revision:reviewed.revision,reviewSha256:reviewed.reviewSha256});
    assert.equal(recovered.change.id,reviewed.id);assert.equal(recovered.change.status,'APPLIED');
    steps.push('save-and-reopen-the-same-applied-change');
    const first=await client.history({limit:1});
    const current=await client.proposal();
    const restoration=await client.prepareRestore({id:reviewed.id,sourceSha256:current.sourceSha256,note:'Retain a reviewed restoration.'});
    assert.equal(restoration.state,'COMPLETE');
    await assert.rejects(client.history({limit:1,expectedToken:first.token}),{code:'SUPPLIER_HISTORY_CHANGED'});
    const cancelled=await client.cancel({id:restoration.change.id,revision:restoration.change.revision});
    assert.equal(cancelled.change.status,'CANCELLED');
    const pages=[];for await(const page of client.pages('history',{limit:1}))pages.push(page);
    assert.equal(pages.length,2);assert.equal(new Set(pages.map(page=>page.token)).size,1);
    steps.push('walk-complete-native-history-and-reject-a-changed-view');
    const quota=await client.quota();assert.equal(quota.workspaceId,workspaceId);
    const retained=await client.exportBackup({exportId:'original-account-handover'});
    const replayed=await client.exportBackup({exportId:'original-account-handover'});
    assert.equal(replayed.manifestSha256,retained.manifestSha256);
    const downloadDirectory=join(root,'handover'),controller=new AbortController();
    let interruption;
    try{await client.downloadExport({exportId:retained.exportId,directory:downloadDirectory,chunkSize:1024,
      expectedManifestSha256:retained.manifestSha256,signal:controller.signal,
      onProgress:()=>controller.abort(new Error('Retain this original download checkpoint.'))});}
    catch(error){interruption=error;}
    assert.ok(interruption);assert.ok(controller.signal.aborted);
    await client.downloadExport({exportId:retained.exportId,directory:downloadDirectory,chunkSize:1024,
      expectedManifestSha256:retained.manifestSha256});
    const backupPath=join(downloadDirectory,'workspace-backup.json'),backupBytes=await readFile(backupPath);
    assert.equal(backupBytes.length,retained.manifest.files[0].bytes);
    assert.equal(sha(backupBytes),retained.manifest.files[0].sha256);
    const backup=JSON.parse(backupBytes);assert.equal(backup.data.metadata.id,workspaceId);
    steps.push('retain-whole-native-backup-and-resume-its-complete-download');
    await writeFile(targetFile,backup.data.source.text,{flag:'wx',mode:0o600});
    await client.close();await host.close();
    const receivingConnection=join(root,'receiving-connection.json');
    await privateJson(receivingConnection,{schema:'stellar-forge.supplier-account-workspace-connection.v1',workspaces:{
      receiving:{directory:target,upstreamsFile:targetFile,inputs:{handover:{
        path:backupPath,bytes:backupBytes.length,sha256:sha(backupBytes),provenance:{workspaceId,exportId:retained.exportId}
      }}}
    }});
    const selected=await readSupplierAccountWorkspaceConfiguration(receivingConnection);
    host=new MerchantSupplierAccountWorkspaces({supplierAccountWorkspaces:selected});
    client=await clientFor('receiving');await client.open();
    const received=await client.receiveWorkspace({inputId:'handover',expectedSha256:sha(backupBytes)});
    assert.equal(received.state,'RECEIVED');assert.equal(received.workspaceId,workspaceId);
    const incoming=await client.history();assert.equal(incoming.total,2);
    steps.push('receive-exact-host-selected-backup-and-reopen-original-identity');
    const targetProposal=await client.proposal();targetProposal.accounts[0].callsPerDay+=100;
    const correction=await client.prepare({...targetProposal,note:'Continue original receiving history with a customer account review.'});
    assert.equal(correction.state,'COMPLETE');
    const again=await client.receiveWorkspace({inputId:'handover',expectedSha256:sha(backupBytes)});
    assert.equal(again.state,'RECEIVED');
    const preserved=await client.change({id:correction.change.id});assert.equal(preserved.status,'PREPARED');
    const saved=await client.apply({id:preserved.id,revision:preserved.revision,reviewSha256:preserved.reviewSha256});
    assert.equal(saved.change.status,'APPLIED');
    steps.push('preserve-later-receiving-review-on-same-backup-replay-and-save-it');
    const report=await client.exportReport({exportId:'received-account-report'});
    await client.downloadExport({exportId:report.exportId,directory:join(root,'received-report'),chunkSize:2048,
      expectedManifestSha256:report.manifestSha256});
    const reportBytes=await readFile(join(root,'received-report','operator-report.json'));
    assert.equal(sha(reportBytes),report.manifest.files[0].sha256);
    receivedReport=JSON.parse(reportBytes);assert.equal(receivedReport.changes.length,3);
    assert.equal(receivedReport.workspaceId,workspaceId);
    await client.close();steps.push('download-whole-later-report-and-drain-native-handles');
    const result={schema:'stellar-forge.supplier-account-merchant-receiving.v1',completedAt:new Date().toISOString(),
      directory:root,node:process.version,workspaceId,steps,backup:{bytes:backupBytes.length,sha256:sha(backupBytes),
        changes:backup.data.changes.length,events:backup.data.events.length},
      receivedReport:{bytes:reportBytes.length,sha256:sha(reportBytes),changes:receivedReport.changes.length,events:receivedReport.events.length}};
    await privateJson(join(root,'receiving-result.json'),result);
    return result;
  }finally{await host.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  receiveSupplierAccountsThroughMerchant({directory:process.argv[2]}).then(
    result=>process.stdout.write(json(result)),
    error=>{process.stderr.write(json({error:{code:error.code??'SUPPLIER_ACCOUNT_RECEIVING_FAILED',message:error.message}}));process.exitCode=1;});
