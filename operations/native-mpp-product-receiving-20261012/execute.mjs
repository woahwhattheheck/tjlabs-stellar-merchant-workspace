#!/usr/bin/env node
// MIT. One native product receiving operation over the original completed MPP workspace.
import assert from 'node:assert/strict';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const SOURCE_FILES = {
  "products/mpp-workspace/workspace.mjs": "267432ac38b8e6854692011bd291f6dbd6795fc9",
  "stellar-forge/mcp-merchant-operator/mpp-config.mjs": "6f8c5d04e79d42409d6ccf81e61d3758260b09d1",
  "products/mpp-workspace/client.mjs": "127685423ffdf0dd5252c7ada12b094828495263",
  "products/mpp-workspace/managed.mjs": "d4e327220ecbe43fa9aebac744cb2bf1b3f822b4",
  "products/mpp-workspace/application-provider.mjs": "77e2e400a2f2089b3f83a1ebfc9076183a6ba971",
  "products/mpp-workspace/cli.mjs": "5b735c0330951606c75f0b504e8c096d91243556",
  "products/mpp-workspace/workspace.d.mts": "f38c0762d75be87f0bfa079e8bc9a50d753d5c07",
  "products/mpp-workspace/client.d.mts": "00aa8a6c10ad732d5b5463ff872dbfd2d7c27d4f",
  "products/mpp-workspace/managed.d.mts": "1c85e7360a4fa093d68d3aa07a2e76f88b995cf5",
  "stellar/scf-starforge-20261009/distribution/contributions/mpp-product.json": "c1e846026552259d3eb997c142a3f082ff61f37b",
  "products/mpp-workspace/README.md": "b1554c8441c189f54b91479f0b24fd0dba926c48",
  "products/mpp-workspace/OPERATING.md": "1dabf5be2d4991b8b4778042e6305fdd0a57dead",
  "products/mpp-workspace/RECEIVING.md": "0c8c4854b9fc6f1bf96745c3e1cb85a4c80fb8ff",
  "README.md": "d94e50b8d6a2c24aaf2db54b389f42134e616a62",
  "products/merchant-workspace/OPERATING.md": "a56c1c42f7c3fe6de3e5af03ea6371205365ae06",
  "stellar/scf-starforge-20261009/mpp-charge/storage.mjs": "6ff5c4b9b9cc3d6614d041a7e0503d51def97976",
  "stellar/scf-starforge-20261009/mpp-charge/config.mjs": "ce9e0fd4a8117462a50efc14a7511862393f921d",
  "stellar/scf-starforge-20261009/mpp-charge/runtime.mjs": "26526645570fecd2cffa068d4de2eedef29f90e1",
  "stellar/scf-starforge-20261009/mpp-charge/server.mjs": "3e8b57113f4eb29689dfb052dcde62d8332df1f0",
  "stellar/scf-starforge-20261009/mpp-charge/customer/contract.mjs": "feea5a7f84301caaa7c78f2eef516c81170eb8c1",
  "stellar/scf-starforge-20261009/mpp-charge/customer/workbench.mjs": "05d50b67939448d11435b592ea0b58fde44d0640",
  "stellar/scf-starforge-20261009/mpp-charge/customer/export.mjs": "8d485d1caa2db44254aee56490c9279482379031",
  "stellar/scf-starforge-20261009/mpp-charge/customer/templates/bridge.mjs": "a04397a1232bc4076215308deedafe4fdec83181",
  "stellar/scf-starforge-20261009/mpp-charge/customer/templates/merchant_client.py": "493c8c401c243c9206a8835c3bf63d023e284e70",
  "stellar/scf-starforge-20261009/mpp-charge/package.json": "6aa4f85f4d71cf60cb3dee1fb2d004df96acff4e",
  "stellar/scf-starforge-20261009/mpp-charge/package-lock.json": "fa76d6661a80646a57687f269567660e823e9128",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs": "8ee253de89866a761ed415412e654e6c79235ff1",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-providers.mjs": "efdd7afc7f9fed49830e17eee6742e8738ee4c7a",
  "stellar-forge/mcp-merchant-operator/config.mjs": "8531db76180e20d28eb6ee79a744c461d858d6c7",
  "stellar-forge/mcp-merchant-operator/operator.mjs": "cfa714f4df0c481371101e9c21c460231d33e4d2",
  "stellar-forge/mcp-merchant-operator/serve.mjs": "3b01f62dc188f802e0aaecf9bd30dd1b5a89171d",
  "stellar-forge/mcp-merchant-operator/mpp-console.mjs": "f08c45452fb0b4bc79de1bc5c4393c7bd40c12ad",
  "stellar-forge/mcp-merchant-operator/mpp-files.mjs": "cc2295f965bf9299fa8742090caadc0cfe9c6034",
  "stellar-forge/mcp-merchant-operator/mpp-download.mjs": "33cbbd6d50947c9b3c44f3593f95cd5b18e2f9df",
  "stellar-forge/mcp-merchant-operator/retained-download.mjs": "603986faaa5d707e938dbc8c6a1bc35a388c4e4d"
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const json = bytes => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
const stable = value => JSON.stringify(value, Object.keys(value).sort());
const absolute = value => typeof value === 'string' && value === resolve(value) && !/[\0\r\n]/.test(value);
const inputFile = process.argv[2];
assert(absolute(inputFile), 'Pass the original absolute private receiving-input JSON path.');
const inputBytes = await readFile(inputFile), input = json(inputBytes);
assert.equal(input.schema, 'stellar-forge.mpp-product-receiving-input.v1');
for (const key of ['sourceDirectory','operationDirectory','productDirectory','merchantWorkspace','customerWorkspace','dependencyRoot','customerConfiguration'])
  assert(absolute(input[key]), 'Use the original absolute ' + key + '.');
assert(input.productDirectory !== input.customerWorkspace && input.productDirectory !== input.merchantWorkspace);
for (const [name, expected] of Object.entries(SOURCE_FILES)) {
  const actual = await readFile(join(input.sourceDirectory, name));
  assert.equal(gitBlob(actual), expected, 'The original selected source differs: ' + name);
}
const imported = relative => import(pathToFileURL(join(input.sourceDirectory,relative)).href);
const product = await imported('products/mpp-workspace/workspace.mjs');
const clients = await imported('products/mpp-workspace/client.mjs');
const managed = await imported('products/mpp-workspace/managed.mjs');
const {operationLease, privateDirectory} = await imported('stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs');
const {parseCustomerBundle} = await imported('stellar/scf-starforge-20261009/mpp-charge/customer/export.mjs');
const {MPP_EXPORT_MANIFEST,parseMppExportManifest} = await imported('stellar-forge/mcp-merchant-operator/mpp-files.mjs');
const now = () => new Date().toISOString();
await mkdir(input.operationDirectory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
await privateDirectory(input.operationDirectory);
const lease=await operationLease(join(input.operationDirectory,'.receiving.lock'));
let active, consoleClient, record;
const resultFile=join(input.operationDirectory,'result.json');
const persist=async()=>product.writePrivate(resultFile,record,true);
const fingerprintFiles=async directory=>{
  const result={};
  for(const name of (await readdir(directory)).filter(name=>name.endsWith('.json')).sort())
    result[name]=sha256(await readFile(join(directory,name)));
  return result;
};
const stop=async()=>{
  if(consoleClient){await consoleClient.close();consoleClient=undefined;}
  if(active){await active.close();active=undefined;}
};
const publicStartup=value=>({schema:value.schema,state:value.state,bindingSha256:value.bindingSha256,
  resourceId:value.resourceId,workspace:value.workspace,workspaceCreatedAt:value.workspaceCreatedAt,
  revision:value.revision,pid:value.pid,ppid:value.ppid,versions:value.versions,
  browserOrigin:new URL(value.browserUrl).origin,mcpUrl:value.mcpUrl});
try {
  const merchant=await product.readNativeIdentity(input.merchantWorkspace);
  const customer=await product.readNativeIdentity(input.customerWorkspace);
  assert(merchant.profiles.merchant,'Select the original merchant workspace after its native operation closes.');
  const merchantProfile=merchant.profiles.merchant.profile;
  assert.equal(merchantProfile.dependencyRoot,input.dependencyRoot);
  const customerBytes=await product.privateFile(input.customerConfiguration), customerConfiguration=json(customerBytes);
  assert.equal(customerConfiguration.workspace,input.customerWorkspace);
  assert.equal(customerConfiguration.dependencyRoot,input.dependencyRoot);
  assert(!customer.metadata.merchant || customer.metadata.merchant===merchant.profiles.merchant.id,
    'The customer workspace already selects a different original merchant.');
  const sourceFingerprint=sha256(JSON.stringify(SOURCE_FILES));
  const selection={inputSha256:sha256(inputBytes),sourceFingerprint,
    merchantWorkspace:input.merchantWorkspace,merchantCreatedAt:merchant.metadata.createdAt,
    merchantProfileId:merchant.profiles.merchant.id,customerWorkspace:input.customerWorkspace,
    customerCreatedAt:customer.metadata.createdAt,customerConfigurationSha256:sha256(customerBytes),
    productDirectory:input.productDirectory,dependencyRoot:input.dependencyRoot};
  if(await product.exists(resultFile)){
    record=json(await product.privateFile(resultFile,2*1024*1024));
    assert.deepEqual(record.selection,selection,'Continue the same source and original receiving selection.');
  }else{
    record={schema:'stellar-forge.mpp-product-receiving.v1',selection,startedAt:now(),
      originalPurchaseFiles:await fingerprintFiles(join(input.customerWorkspace,'purchases')),
      phases:{},complete:false};
    await persist();
  }
  if(record.complete){
    const local=await clients.inspectMppCustomer(join(input.operationDirectory,'customer-received'));
    const remote=await clients.inspectMppCustomer(join(input.operationDirectory,'agent-customer-received'));
    assert.equal(local.bundleSha256,record.phases.customerFiles.bundleSha256);
    assert.equal(remote.bundleSha256,local.bundleSha256);
    assert(local.files.every(file=>file.state==='MATCH') && remote.files.every(file=>file.state==='MATCH'));
    console.log(JSON.stringify({schema:record.schema,state:'REOPENED',resultFile,
      sourceFingerprint,bundleSha256:local.bundleSha256,customerFiles:local.files.length}));
  }else{
    const initialized=await product.initializeMppProduct({directory:input.productDirectory,
      name:input.name??'Native MPP merchant and customer',workspaceDirectory:input.customerWorkspace,
      dependencyRoot:input.dependencyRoot});
    assert.equal(initialized.workspaceCreatedAt,customer.metadata.createdAt);
    record.phases.setup={state:initialized.state,workspace:initialized.workspaceDirectory,
      workspaceCreatedAt:initialized.workspaceCreatedAt,reused:initialized.reused};
    await persist();
    const current=await product.readNativeIdentity(input.customerWorkspace);
    if(!current.metadata.merchant){
      const retained=join(input.operationDirectory,'merchant-original.json');
      await product.writePrivate(retained,merchantProfile);
      const configured=await product.configureMppProfile({directory:input.productDirectory,kind:'merchant',
        file:retained,expectedRevision:current.metadata.revision});
      assert.equal(configured.profileId,merchant.profiles.merchant.id);
    }
    const profile=await product.readMppProduct(input.productDirectory);
    const customers=await product.readProductCustomers(profile);
    const registered=await product.registerMppCustomer({directory:input.productDirectory,customer:'accounts',
      file:input.customerConfiguration,label:'Original native customer',expectedRevision:customers.revision});
    record.phases.customerSelection={revision:registered.revision,configurationSha256:sha256(customerBytes)};
    await persist();
    const environment={...process.env,MPP_PRODUCT_RECEIVING_TOKEN:randomBytes(32).toString('hex')};
    delete environment.MCP_OAUTH_CONFIG;
    delete environment.MCP_CLIENT_ORIGINS;
    const options={directory:input.productDirectory,port:0,mcpPort:0,browserOnly:false,
      tokenEnv:'MPP_PRODUCT_RECEIVING_TOKEN'};
    let launch=await managed.inspectMppLaunch(options,{environment});
    active=await managed.openMppProductManaged({...options,expectedBindingSha256:launch.bindingSha256},{environment});
    record.phases.open=publicStartup(active.startup);
    await persist();
    consoleClient=await clients.connectMppProduct({directory:input.productDirectory});
    const identity=await consoleClient.identity();
    assert.equal(identity.workspace,input.customerWorkspace);
    assert.equal(identity.createdAt,customer.metadata.createdAt);
    const catalog=await consoleClient.catalog(), contract=catalog.contract;
    assert.equal(contract.profileId,merchant.profiles.merchant.id);
    const handoff=await consoleClient.handoff('package',contract.profileId);
    const bundle=parseCustomerBundle(handoff.bytes);
    assert.equal(bundle.contractSha256,contract.sha256);
    const local=await consoleClient.receiveCustomer({profileId:contract.profileId,
      directory:join(input.operationDirectory,'customer-received'),expectedBundleSha256:bundle.sha256});
    assert.equal(local.files.length,12);
    assert(local.files.every(file=>file.state==='MATCH'));
    const localAgain=await clients.resumeMppCustomer(local.directory);
    assert.equal(localAgain.bundleSha256,bundle.sha256);
    record.phases.customerFiles={directory:local.directory,bundleSha256:bundle.sha256,
      contractSha256:contract.sha256,sourceSha256:handoff.sha256,files:local.files};
    await persist();
    let agent=await clients.connectMppAgent({directory:input.productDirectory,environment});
    const reviewId='product-receiving-'+selection.customerConfigurationSha256.slice(0,20);
    const reviewed=await agent.review({customer:'accounts',reviewId,document:bundle});
    const selected=await agent.configure(reviewId,reviewed.reviewSha256);
    assert.equal(selected.state,'SELECTED');
    const state=await consoleClient.customerStatus({limit:10});
    assert.equal(state.profileId,reviewed.profileId);
    const offer=contract.offers.find(row=>customerConfiguration.assetLimits.some(limit=>
      limit.currency===row.payment.currency && limit.network===row.payment.network &&
      limit.decimals===row.payment.decimals && BigInt(limit.maxAtomic)>=BigInt(row.payment.amountAtomic)));
    assert(offer,'Select an original offer within the retained customer limits.');
    const preview=await consoleClient.preview({profileId:state.profileId,offerId:offer.id,inputs:{}});
    const agentPreview=await agent.preview({profileId:state.profileId,offerId:offer.id,inputs:{}});
    assert.deepEqual(agentPreview,preview);
    record.phases.customerReview={reviewId,reviewSha256:reviewed.reviewSha256,profileId:reviewed.profileId,
      selectedState:selected.state,offerId:offer.id,preview};
    await persist();
    const exportId='product-customer-'+contract.sha256.slice(0,24);
    const exported=await agent.export({exportId,kind:'package',profileId:contract.profileId,
      expectedSha256:handoff.sha256});
    const downloaded=await agent.download({exportId,directory:join(input.operationDirectory,'agent-transfer'),
      chunkSize:65536});
    const manifestBytes=await readFile(join(input.operationDirectory,'agent-transfer',MPP_EXPORT_MANIFEST));
    const manifest=parseMppExportManifest(manifestBytes,exportId);
    assert.equal(manifest.files[0].sha256,handoff.sha256);
    const payload=join(input.operationDirectory,'agent-transfer',manifest.files[0].name);
    assert.equal(sha256(await readFile(payload)),handoff.sha256);
    const target=join(input.operationDirectory,'agent-customer-received');
    const fromAgent=await clients.receiveMppCustomer({file:payload,directory:target,
      resume:await product.exists(target)});
    assert.equal(fromAgent.bundleSha256,bundle.sha256);
    assert.equal(fromAgent.files.length,12);
    assert(fromAgent.files.every(file=>file.state==='MATCH'));
    record.phases.agentFiles={exportId,exportState:exported.state,downloadState:downloaded.state,
      manifestSha256:sha256(manifestBytes),directory:target,bundleSha256:fromAgent.bundleSha256,files:fromAgent.files};
    await persist();
    await stop();
    assert.equal(json(await product.privateFile(profile.sessionFile)).state,'CLOSED');
    launch=await managed.inspectMppLaunch(options,{environment});
    active=await managed.openMppProductManaged({...options,expectedBindingSha256:launch.bindingSha256},{environment});
    assert.equal(active.startup.resourceId,record.phases.open.resourceId);
    assert.equal(active.startup.workspaceCreatedAt,customer.metadata.createdAt);
    consoleClient=await clients.connectMppProduct({directory:input.productDirectory});
    agent=await clients.connectMppAgent({directory:input.productDirectory,environment});
    const retainedReview=await agent.reviewStatus(reviewId);
    assert.equal(retainedReview.state,'SELECTED');
    assert.equal(retainedReview.reviewSha256,reviewed.reviewSha256);
    const reopenedFiles=await agent.download({exportId,directory:join(input.operationDirectory,'agent-transfer'),
      expectedManifestSha256:sha256(manifestBytes),chunkSize:65536});
    const originalAfter=await fingerprintFiles(join(input.customerWorkspace,'purchases'));
    assert.deepEqual(originalAfter,record.originalPurchaseFiles);
    record.phases.reopen={...publicStartup(active.startup),reviewState:retainedReview.state,
      exportId,downloadState:reopenedFiles.state,originalPurchases:Object.keys(originalAfter).length};
    await stop();
    record.complete=true;record.finishedAt=now();
    await persist();
    console.log(JSON.stringify({schema:record.schema,state:'COMPLETE',resultFile,
      sourceFingerprint,bundleSha256:bundle.sha256,customerFiles:12,
      reviewId,exportId,workspace:input.customerWorkspace,originalPurchases:Object.keys(originalAfter).length}));
  }
}catch(error){
  try{await stop();}catch(closeError){error=new AggregateError([error,closeError],'The original product owner is still draining.');}
  if(record){record.error={code:error.code??error.name,message:error.message,at:now()};await persist();}
  throw error;
}finally{
  await lease.close();
}
