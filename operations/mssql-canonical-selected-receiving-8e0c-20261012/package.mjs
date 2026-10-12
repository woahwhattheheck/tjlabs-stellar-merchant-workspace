import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const root=resolve(process.argv[2]),work=resolve(process.argv[3]);
const module=relative=>import(pathToFileURL(join(root,relative)).href);
const p='stellar/scf-starforge-20261009/sf30-seller-sdk/mssql/';
const sha=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const report={source:process.argv[4],phase:'load-original-modules'};
let author,receiver,authorTransfers,receiverTransfers;
try{
 const {prepareMssqlSeller,verifyPreparedMssqlSeller}=await module(p+'prepare.mjs');
 const {createMssqlWorkspace}=await module(p+'workspace/model.mjs');
 const {initializeMssqlOperator}=await module(p+'workspace/operator-store.mjs');
 const {createMssqlTransfers}=await module(p+'workspace/transfer.mjs');
 const {downloadMssqlTransfer,inspectMssqlTransfer}=await module(p+'agent/download.mjs');
 report.phase='prepare-original-example';
 const original=join(work,'original-package');await mkdir(original,{mode:0o700});
 const sourceFile=join(root,p+'examples/source.json'),planFile=join(root,p+'examples/merchant-plan.json');
 const prepared=await prepareMssqlSeller({sourceFile,planFile,directory:join(original,'package')});
 assert.equal(prepared.schema,'stellar-forge.mssql-prepared.v1');
 const choices={releaseId:'catalog_example',label:'Original SQL Server example package',endpoints:JSON.parse(await readFile(planFile,'utf8')).routes};
 const metadata={schema:'stellar-forge.mssql-workspace-release.v1',releaseId:choices.releaseId,label:choices.label,
  planId:sha(Buffer.concat([await readFile(sourceFile),await readFile(planFile)])),createdAt:prepared.createdAt,
  manifestSha256:prepared.manifestSha256,choices,requiredEnvironment:'STARFORGE_MSSQL_PASSWORD'};
 const metadataBytes=encoded(metadata);await writeFile(join(original,'workspace.json'),metadataBytes,{mode:0o600});
 const authorState=join(work,'author'),receiverState=join(work,'receiver');
 const originalIdentity=await initializeMssqlOperator({sourceFile,stateDirectory:authorState});
 const receivingIdentity=await initializeMssqlOperator({sourceFile,stateDirectory:receiverState});
 assert.notEqual(originalIdentity.workspaceId,receivingIdentity.workspaceId);
 for(const identity of [originalIdentity,receivingIdentity])for(const name of ['exports','staging'])await mkdir(join(identity.directory,name),{mode:0o700});
 author=await createMssqlWorkspace({sourceFile,stateDirectory:authorState});
 receiver=await createMssqlWorkspace({sourceFile,stateDirectory:receiverState});
 const loaded=await author.adoptRelease({directory:original,manifestSha256:prepared.manifestSha256,workspaceSha256:sha(metadataBytes)});
 assert.equal(loaded.reopened,false);assert.equal(loaded.manifestSha256,prepared.manifestSha256);
 authorTransfers=createMssqlTransfers({model:author,identity:originalIdentity});
 receiverTransfers=createMssqlTransfers({model:receiver,identity:receivingIdentity});
 report.phase='export-original-merchant-customer';
 const exported={};
 for(const kind of ['merchant','customer']){
  const request={operationId:randomUUID(),createdAt:new Date().toISOString()};
  const selection={releaseId:choices.releaseId,manifestSha256:prepared.manifestSha256,kind};
  exported[kind]=await authorTransfers.exportSource(selection,request);
  assert.deepEqual(await authorTransfers.exportSource(selection,request),exported[kind]);
 }
 let calls=0,lostAfter=0;
 const transport={endpoint:'http://127.0.0.1:1/mssql-native-source-receiving',async call(name,args){
  calls++;assert.equal(args.workspace,'author');assert.equal(args.workspaceId,originalIdentity.workspaceId);
  const {workspace,workspaceId,...input}=args;
  const result=name==='merchant_mssql_export_manifest'?await authorTransfers.manifest(input.exportId):
   name==='merchant_mssql_export_file'?await authorTransfers.file(input):
   name==='merchant_mssql_export_file_release'?await authorTransfers.release(input):
   assert.fail('Unexpected retained-file operation '+name);
  return {workspace,workspaceId,result};
 }};
 const selection=kind=>({client:transport,workspace:'author',workspaceId:originalIdentity.workspaceId,
  exportId:exported[kind].exportId,expectedManifestSha256:exported[kind].manifestSha256,
  directory:join(work,kind),chunkSize:1024});
 report.phase='interrupted-original-retained-download';
 await assert.rejects(downloadMssqlTransfer({...selection('merchant'),onProgress(progress){
  if(!lostAfter){lostAfter=progress.bytes;throw Object.assign(new Error('Original receiving interrupted after checkpoint'),{code:'RECEIVING_INTERRUPTED'});}
 }}),error=>error.code==='RECEIVING_INTERRUPTED');
 assert(lostAfter>0);
 const merchant=await downloadMssqlTransfer(selection('merchant'));assert.equal(merchant.state,'COMPLETE');assert.equal(merchant.resumed,true);assert(merchant.resumedBytes>=lostAfter);
 const beforeReplay=calls,replayed=await downloadMssqlTransfer(selection('merchant'));assert.equal(replayed.bytes,merchant.bytes);
 const replayCalls=calls-beforeReplay;
 const customer=await downloadMssqlTransfer(selection('customer'));assert.equal(customer.state,'COMPLETE');
 const inspected=await inspectMssqlTransfer({client:transport,workspace:'author',workspaceId:originalIdentity.workspaceId,exportId:exported.customer.exportId});
 assert.equal(inspected.manifest.kind,'customer');assert.equal(inspected.manifest.files.length,6);
 report.phase='receive-into-original-other-workspace';
 const received=await receiverTransfers.receive({directory:join(work,'merchant'),expectedManifestSha256:exported.merchant.manifestSha256});
 assert.equal(received.reopened,false);assert.equal(received.manifestSha256,prepared.manifestSha256);assert.deepEqual(received.choices,metadata.choices);
 const reopened=await receiverTransfers.receive({directory:join(work,'merchant'),expectedManifestSha256:exported.merchant.manifestSha256});
 assert.equal(reopened.reopened,true);assert.deepEqual(reopened.choices,metadata.choices);
 const retainedMetadata=await readFile(join(receiverState,'releases',choices.releaseId,'workspace.json'));assert(retainedMetadata.equals(metadataBytes));
 const customerOpenapi=await readFile(join(work,'customer','openapi.json'));
 const generated=await import(pathToFileURL(join(work,'customer','client','seller-client.mjs')).href);
 assert.equal(generated.source.sourceSha256,sha(customerOpenapi));
 assert.equal(generated.operations.length,1);assert.equal(generated.operations[0].id,'catalog');
 assert((await readFile(join(work,'customer','client','seller-openapi.json'))).equals(customerOpenapi));
 report.phase='reopen-after-sender-removal';
 await authorTransfers.close();authorTransfers=null;await author.close();author=null;
 await rm(authorState,{recursive:true});await rm(original,{recursive:true});await rm(join(work,'merchant'),{recursive:true});
 const final=await receiver.open(choices.releaseId);assert.equal(final.manifestSha256,prepared.manifestSha256);assert.deepEqual(final.choices,metadata.choices);
 assert.equal((await receiver.list()).total,1);
 const finalPackage=await verifyPreparedMssqlSeller(final.directory);assert.equal(finalPackage.manifestSha256,prepared.manifestSha256);
 report.phase='complete';Object.assign(report,{node:process.version,packageFiles:Object.keys(prepared.files).length,
  merchantFiles:merchant.files,merchantBytes:merchant.bytes,customerFiles:customer.files,customerBytes:customer.bytes,
  interruptedAfterBytes:lostAfter,resumedBytes:merchant.resumedBytes,completeReplayAdditionalCalls:replayCalls,
  packageManifestSha256:prepared.manifestSha256,originalMetadataSha256:sha(metadataBytes),receivedRelease:final.releaseId,
  originalSenderRemoved:true,receivedReopened:true,customerClientLoaded:true});
 console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({...report,error:error.code??error.name,message:error.message,stack:error.stack},null,2));process.exitCode=1;}
finally{await authorTransfers?.close();await receiverTransfers?.close();await author?.close();await receiver?.close();}
