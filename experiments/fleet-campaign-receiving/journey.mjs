// MIT. Original delivery fixture -> saved multi-merchant rollout -> retained release recovery.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, mkdir, lstat, realpath, rename, link, unlink } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const PRODUCT = 'e316fc9db6ef67949938b560a36c4700bf38410b';
const OPERATION = 'SCF-MANAGED-SF98-DELIVERY-E49D-20261012';
const SCHEMA = 'scratch.fleet-campaign-receiving.v1';
const CAMPAIGN = 'original-delivery-rollout';
const SDK = 'stellar/scf-starforge-20261009/';
const FLEET = SDK + 'merchant-fleet-gateway/';
const MCP = 'stellar-forge/mcp-merchant-operator/';
const EXPECTED = [
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/server.mjs",
    "blob": "70c562dba3e53c17368081eff7ed107ac5058ee0",
    "bytes": 26346
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/browser.mjs",
    "blob": "695b0c70bd061efa11ad7cdbef3e46559d730d5e",
    "bytes": 40304
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/campaigns.mjs",
    "blob": "c526caeda6e3fb67f8f8e6ca5abe69898dce9e64",
    "bytes": 35278
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/index.html",
    "blob": "eb7115e135123c791838179dabf60c6e7c36c743",
    "bytes": 23702
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/style.css",
    "blob": "0f4575f70c039d6aaa26570f1c271107297bcd24",
    "bytes": 14249
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/workspace/browser-assets.json",
    "blob": "9846b47efa09d9c0f80eab69a5c9c2d9e0ce0e00",
    "bytes": 1027
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-campaigns.mjs",
    "blob": "af3ce6437da2957ff4e7bf9dff5a22f841cba61e",
    "bytes": 29174
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-operator.mjs",
    "blob": "2e773e8c34ed77854c99a4e82c46df677718c311",
    "bytes": 51334
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/rollout-state.mjs",
    "blob": "df2d3d09d127a19e56382e30cccdaf74209b3e5d",
    "bytes": 9451
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/selections/merchant-fleet.json",
    "blob": "c68cba56cac2ec58aaa4437b7d30f476ce73bc6e",
    "bytes": 6438
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/contributions/merchant-fleet-campaigns.json",
    "blob": "051d7510a439ea7b94bb8ed10ec3491e4aa2e8e3",
    "bytes": 894
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/examples/campaign.json",
    "blob": "23e28bfb6e02b9b2907df31bb100a2a73a7e2ba5",
    "bytes": 539
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/CAMPAIGNS.md",
    "blob": "aa8ae0826e5f2ca82631499115100688f7935c51",
    "bytes": 17339
  },
  {
    "path": "products/merchant-fleet/OPERATING.md",
    "blob": "dde7aab5a44fce8705809c3fb437c99705c8c57c",
    "bytes": 41787
  },
  {
    "path": "stellar/scf-starforge-20261009/merchant-fleet-gateway/release-cli.mjs",
    "blob": "2eab02c97120118ad20d4e416ad1ad27b9b24b35",
    "bytes": 21600
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/catalog/fleet-campaigns.mjs",
    "blob": "394cea451610aad9ecd9a49de996eb147c5f5e84",
    "bytes": 6047
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/catalog/fleet.mjs",
    "blob": "89a14df2cac8a57ef4ad86e6fa2ba35ddb8decec",
    "bytes": 18557
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/providers/fleet.mjs",
    "blob": "7e83ac625d6ee16af1d83f86b335ed1a5d31a014",
    "bytes": 2305
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/fleet.mjs",
    "blob": "6163a07c463f326ecd1cf406907af93a58912d19",
    "bytes": 9767
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/fleet-campaign-client.mjs",
    "blob": "bb12aa0ba433a9cb3dc6222c0d14c12f1ff26cf9",
    "bytes": 17939
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/fleet-campaign-client.d.mts",
    "blob": "abf3010517c97e51d3f02bcc828dcca3039785b3",
    "bytes": 11858
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/FLEET_CAMPAIGN_CLIENT.md",
    "blob": "9b160d63f1b08aac276903229a02661a2f08d442",
    "bytes": 20685
  },
  {
    "path": "stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs",
    "blob": "1485e7684755399b136013c8bf882cf590000b95",
    "bytes": 89790
  },
  {
    "path": "stellar/scf-starforge-20261009/sf82-seller-pilot/release-python.mjs",
    "blob": "f8532d6b13e346d3fe7e74788eb518d6c9f11167",
    "bytes": 23690
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
    "blob": "ad324ba35f477871856a8fab8f18a7c873004201",
    "bytes": 7357
  },
  {
    "path": "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs",
    "blob": "9320041597a7d04afd9f15c707a303bd3cc25042",
    "bytes": 1894
  },
  {
    "path": "stellar/scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs",
    "blob": "48e4f643601fb8464f695dd8e8785f4ad9e0f21c",
    "bytes": 11720
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/serve.mjs",
    "blob": "082122ec84d445058026afd4211ed8cf643b390c",
    "bytes": 87544
  },
  {
    "path": "stellar-forge/mcp-merchant-operator/provider-contract.mjs",
    "blob": "84a78fa4f594294b3b3e82d7056a5aeff740ab3d",
    "bytes": 6260
  }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const requestHash = value => hash(JSON.stringify(canonical(value)));
const nativeIdentity = value => ({ revision: value.revision, digest: value.digest, snapshotId: value.snapshotId });
const diagnostic = error => ({ code: error?.code ?? null, message: String(error?.message ?? error),
  stack: String(error?.stack ?? '').slice(0,8000) });
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function privateDirectory(path, create = false) {
  assert.equal(path, resolve(path));
  if (create) await mkdir(path, { mode: 0o700 });
  const info = await lstat(path);
  assert(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077), 'Use an original private directory: ' + path);
  assert.equal(await realpath(path), path); return path;
}
async function originalJSON(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const first = await handle.stat({ bigint: true });
    assert(first.isFile() && first.size <= 32n*1024n*1024n, 'Use bounded original JSON');
    const bytes = await handle.readFile(), last = await handle.stat({ bigint: true });
    for (const key of ['dev','ino','size','mtimeNs','ctimeNs']) assert.equal(first[key], last[key]);
    assert.equal(BigInt(bytes.length), last.size);
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), bytes, sha256: hash(bytes) };
  } finally { await handle.close(); }
}
async function syncParent(path) {
  const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); }
}
async function atomicJSON(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp'; let file;
  try {
    file = await open(temporary, 'wx', 0o600); await file.writeFile(json(value)); await file.sync();
    await file.close(); file = null; await rename(temporary, path); await syncParent(path);
  } finally { await file?.close(); await unlink(temporary).catch(error => { if(error.code!=='ENOENT')throw error; }); }
}
async function exactFile(path, bytes) {
  if (await exists(path)) {
    const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink());
    assert.deepEqual(await readFile(path),bytes,'Preserve selected input: '+path);return;
  }
  const temporary=path+'.'+randomUUID()+'.tmp';let file;
  try {
    file=await open(temporary,'wx',0o600);await file.writeFile(bytes);await file.sync();
    await file.close();file=null;
    try{await link(temporary,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink());
      assert.deepEqual(await readFile(path),bytes,'Preserve selected input: '+path);
    }
    await syncParent(path);
  }finally{
    await file?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((done, fail) => { server.close(error => error ? fail(error) : done()); server.closeIdleConnections?.(); });
}
function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  promise.catch(() => {});
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
async function waitFor(work, predicate, label, signal, maximum = 30000) {
  const end = Date.now() + maximum; let value;
  while (Date.now() < end) { signal?.throwIfAborted(); value = await work(); if (predicate(value)) return value; await delay(75); }
  throw new Error(label + ': ' + JSON.stringify(value));
}
const mappingIdentity = mapping => [...mapping].sort((a,b)=>a.tenant.localeCompare(b.tenant));
function requireReceipts(records, managedOutput, directOutput, applicationsOutput) {
  const { managed, direct, applications } = Object.fromEntries(Object.entries(records).map(([key,row])=>[key,row.value]));
  assert.equal(managed.operation,OPERATION); assert.equal(managed.state,'PASS');
  for (const key of ['nativeComplete','browserComplete','mcpComplete','ownedProcessesClosed']) assert.equal(managed[key],true,key);
  assert.equal(direct.schema,'scratch.single-release-delivery-receiving.v1');
  assert.equal(direct.operation,OPERATION); assert.equal(direct.state,'PASS');
  for (const key of ['localComplete','browserComplete','mcpComplete','ownedProcessesClosed']) assert.equal(direct[key],true,key);
  assert.equal(direct.managedReceiptSha256,records.managed.sha256); assert.equal(direct.managedDirectory,managedOutput);
  assert.equal(direct.releaseStore,managed.stores.blue);
  assert.equal(applications.schema,'scratch.merchant-delivery-applications-receiving.v1');
  assert.equal(applications.operation,OPERATION); assert.equal(applications.state,'PASS');
  for (const key of ['browserComplete','customerReopenComplete','ownedProcessesClosed']) assert.equal(applications[key],true,key);
  assert.equal(applications.product,'8b08a9333af070df0e96b6f09f6612eb07eab1ad');
  assert.equal(applications.managedOutput,managedOutput); assert.equal(applications.directOutput,directOutput);
  assert.equal(applications.managedReceiptSha256,records.managed.sha256);
  assert.equal(applications.directReceiptSha256,records.direct.sha256);
  assert.equal(applications.releaseStore,managed.stores.blue);
  assert.equal(applicationsOutput,resolve(applicationsOutput));
  return {managed,direct,applications};
}

/** One sequential continuation of the already completed original receiving operation. */
export async function runFleetCampaignPhase({ sourceRoot, managedOutput, directOutput, applicationsOutput, output,
  sourcePin = PRODUCT, operation = OPERATION, node = process.execPath, python, playwrightModules, chromium, signal } = {}) {
  assert.equal(operation,OPERATION); assert.equal(sourcePin,PRODUCT);
  for (const value of [sourceRoot,managedOutput,directOutput,applicationsOutput,output,node,python,playwrightModules,chromium])
    assert.equal(typeof value,'string','Supply the exact existing receiving context');
  sourceRoot=resolve(sourceRoot);
  const sourceInfo=await lstat(sourceRoot);
  assert(sourceInfo.isDirectory()&&!sourceInfo.isSymbolicLink());assert.equal(await realpath(sourceRoot),sourceRoot);
  managedOutput=await privateDirectory(resolve(managedOutput)); directOutput=await privateDirectory(resolve(directOutput));
  applicationsOutput=await privateDirectory(resolve(applicationsOutput)); output=resolve(output);
  assert(![sourceRoot,managedOutput,directOutput,applicationsOutput].includes(output));
  assert.equal(await realpath(node),await realpath(process.execPath),'Use the selected Node process');
  const originalFiles={managed:join(managedOutput,'receipt.json'),direct:join(directOutput,'receipt.json'),
    applications:join(applicationsOutput,'receipt.json')};
  const originals=Object.fromEntries(await Promise.all(Object.entries(originalFiles).map(async([name,path])=>[name,await originalJSON(path)])));
  const {managed,direct,applications}=requireReceipts(originals,managedOutput,directOutput,applicationsOutput);
  const sourceFiles=[];
  for(const row of EXPECTED){
    const bytes=await readFile(join(sourceRoot,row.path));assert.equal(bytes.length,row.bytes,row.path);
    assert.equal(gitBlob(bytes),row.blob,row.path);sourceFiles.push({...row,sha256:hash(bytes)});
  }
  if(!await exists(output))await privateDirectory(output,true);else await privateDirectory(output);
  const moduleAt=path=>import(pathToFileURL(join(sourceRoot,path)).href);
  const {operationLease}=await moduleAt(SDK+'distribution/runtime-workspace/storage.mjs');
  const phaseLease=await operationLease(join(output,'campaign-phase.lock'));
  try {
  const receiptFile=join(output,'receipt.json'),directory=join(managedOutput,'fleet');
  const planDocument=await originalJSON(managed.planFile);
  const bindings={schema:SCHEMA,operation,product:sourcePin,sourceRoot,managedOutput,directOutput,applicationsOutput,
    managedReceiptSha256:originals.managed.sha256,directReceiptSha256:originals.direct.sha256,
    applicationsReceiptSha256:originals.applications.sha256,planFile:managed.planFile,planFileSha256:planDocument.sha256,
    sourceFiles};
  let receipt=await exists(receiptFile)?(await originalJSON(receiptFile)).value:{
    ...bindings,state:'RUNNING',attempts:[],milestones:[],requests:[],stages:{},screenshots:[],gates:[],payments:[]};
  for(const [key,value]of Object.entries(bindings))assert.deepEqual(receipt[key],value,'Retain the original phase binding: '+key);
  if(receipt.state==='PASS'&&receipt.ownedProcessesClosed&&receipt.restorationComplete&&receipt.reopenComplete)return receipt;
  let saving=Promise.resolve();
  function save(){const value=structuredClone(receipt);const work=saving.then(()=>atomicJSON(receiptFile,value));saving=work.catch(()=>{});return work;}
  const completed=key=>receipt.milestones.some(row=>row.key===key);
  async function mark(key,value={}){
    if(completed(key))return;
    receipt.milestones.push({key,at:new Date().toISOString(),...value});await save();
    process.stdout.write(JSON.stringify({phase:'FLEET_CAMPAIGN',key,...value})+'\n');
  }
  const attempt={startedAt:new Date().toISOString(),browserErrors:[],cleanupErrors:[]};receipt.attempts.push(attempt);
  receipt.state='RUNNING';receipt.ownedProcessesClosed=false;await save();
  const {readFleetReleasePlan,openFleetReleaseOperator}=await moduleAt(FLEET+'release-operator.mjs');
  const {startFleetWorkspace}=await moduleAt(FLEET+'workspace/server.mjs');
  const {inspectRelease,stageRelease,readReleaseState}=await moduleAt(SDK+'sf82-seller-pilot/releases.mjs');
  const {preparePythonRelease}=await moduleAt(SDK+'sf82-seller-pilot/release-python.mjs');
  const {startMerchantMcp}=await moduleAt(MCP+'serve.mjs');
  const {createFleetCampaignClient,verifyFleetCampaignExport}=await moduleAt(MCP+'fleet-campaign-client.mjs');
  const {applicationEnvironment}=await moduleAt(SDK+'distribution/runtime-workspace/application-environment.mjs');
  const {openOutbox}=await moduleAt(SDK+'sf98-merchant-delivery/outbox.mjs');
  const requireOriginal=createRequire(join(sourceRoot,'package.json'));
  const {encodePaymentSignatureHeader}=requireOriginal('@x402/core/http');
  const plan=await readFleetReleasePlan(managed.planFile);
  assert.equal(plan.tenants.length,2);assert.deepEqual(plan.tenants.map(row=>row.id).sort(),['python','reference']);
  const tenant=id=>plan.tenants.find(row=>row.id===id);
  const slot=(id,name)=>tenant(id).slots[name];
  for(const id of ['python','reference'])assert.deepEqual(Object.keys(tenant(id).slots).sort(),['blue','green']);
  assert.equal(slot('python','blue').store,managed.stores.blue);
  assert.equal(slot('reference','blue').store,managed.referenceStores.blue);
  const environment=await applicationEnvironment(join(managedOutput,'private-environment.json'));
  const originalEnvironment=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));
  for(const [key,value]of Object.entries(environment))process.env[key]=value;
  let workspace,browser,browserContext,page,mcp,client,terminal,operator,sessionKey,facilitator,failure;
  const accepted=new Set(),responseWork=new Set(),gates=new Set();
  let gate=null,wireId=0,managerId=null,dropAdvance=false,delayClientExport=null;
  const token=randomBytes(32).toString('hex');
  function track(promise){accepted.add(promise);promise.finally(()=>accepted.delete(promise)).catch(()=>{});return promise;}
  function active(){signal?.throwIfAborted();}
  function retainedRequest(key,action,input){
    const found=receipt.requests.find(row=>row.key===key&&!row.refused&&!row.superseded);
    if(found){assert.equal(found.action,action);if(input)assert.deepEqual(found.input,input);return found;}
    assert(input,'A new original request requires its complete reviewed input');
    const row={key,action,input:structuredClone(input),requestSha256:requestHash(input),createdAt:new Date().toISOString()};
    receipt.requests.push(row);return row;
  }
  async function keepRequest(key,action,input){const row=retainedRequest(key,action,input);await save();return row;}
  async function completedRequest(row,result){row.result=structuredClone(result);row.finishedAt=new Date().toISOString();await save();return result;}
  async function observedPayment(row){
    const outbox=await openOutbox(managed.boundSource);
    const found=(await outbox.rows()).filter(item=>item.event.orderReference===row.order);
    assert(found.length<=1,'One retained local fixture order must identify at most one native settlement');
    return found[0]?.event??null;
  }

  function assertPrice(release, amount) {
    const route=release.routes.find(row=>row.id==='summarize');
    assert(route&&route.method==='POST'&&route.path==='/summary');assert.equal(route.payment.length,1);
    assert.equal(route.payment[0].amount,amount);assert.equal(route.payment[0].network,'stellar:testnet');
  }
  async function prepareSources() {
    for(const [name,identity]of Object.entries(managed.packageIdentities)){
      const selected=managed.relocated?.[name]??identity.directory;
      await privateDirectory(selected);
      for(const [file,digest]of Object.entries(identity.files))assert.equal(hash(await readFile(join(selected,file))),digest);
    }
    const additions=[
      {tenant:'reference',slot:'green',releaseId:'campaign-reference-v2',amount:'30000',base:'reference'},
      {tenant:'python',slot:'blue',releaseId:'campaign-python-v3',amount:'40000',base:'current'},
      {tenant:'reference',slot:'blue',releaseId:'campaign-reference-v3',amount:'45000',base:'reference'},
    ];
    const sourceDirectory=join(output,'source');
    if(!await exists(sourceDirectory))await privateDirectory(sourceDirectory,true);else await privateDirectory(sourceDirectory);
    for(const input of additions){
      active();const original=managed.relocated?.[input.base]??managed.packageIdentities[input.base].directory;
      const declaration=(await originalJSON(join(original,'merchant.json'))).value;
      assert.equal(declaration.python,python,'Use the original retained Python interpreter');
      assert.equal(declaration.publicOrigin,'https://'+tenant(input.tenant).host);
      for(const definition of Object.values(declaration.functions))definition.payment={...definition.payment,amount:input.amount};
      const selected=join(sourceDirectory,input.releaseId);
      if(!await exists(selected))await privateDirectory(selected,true);else await privateDirectory(selected);
      assert.equal(declaration.application,'example-application.py','Preserve the original application entry');
      await exactFile(join(selected,declaration.application),await readFile(join(original,declaration.application)));
      await exactFile(join(selected,'merchant.json'),Buffer.from(json(declaration)));
      const prepared=await preparePythonRelease(join(selected,'merchant.json'),{sourceRoot:selected});
      const runtime={facilitator:'http://127.0.0.1:'+(managed.portStart+6),allowLocalFacilitator:true,port:slot(input.tenant,input.slot).port};
      const intent={...input,directory:selected,store:slot(input.tenant,input.slot).store,
        label:'Original rollout '+input.tenant+' '+input.slot+' '+input.amount,python:prepared.python,runtime};
      const old=receipt.stages[input.releaseId];
      if(old)assert.deepEqual(old.intent,intent);else{receipt.stages[input.releaseId]={intent};await save();}
      const held=receipt.stages[input.releaseId];let release;
      if(await exists(join(intent.store,'releases',input.releaseId,'release.json'))){
        release=await inspectRelease(intent.store,input.releaseId);
      }else{
        const before=await readReleaseState(intent.store);
        release=await stageRelease(intent.store,{id:input.releaseId,label:intent.label,python:join(selected,'merchant.json'),
          pythonRoot:selected,runtime});
        const after=await readReleaseState(intent.store);
        assert.equal(after.active,before.active,'Stage must preserve the current selection');
        assert.equal(after.generation,before.generation,'Stage must not activate a merchant');
      }
      assert.equal(release.id,input.releaseId);assert.equal(release.label,intent.label);
      assert.equal(release.publicOrigin,declaration.publicOrigin);assert.deepEqual(release.python,prepared.python);
      assert.deepEqual(release.runtime,runtime);assertPrice(release,input.amount);
      if(held.digest)assert.equal(release.digest,held.digest);held.digest=release.digest;await save();
    }
    assertPrice(await inspectRelease(slot('python','blue').store,'python-v1'),'20000');
    assertPrice(await inspectRelease(slot('reference','blue').store,'reference-v1'),'20000');
    assertPrice(await inspectRelease(slot('python','green').store,'python-v2'),'25000');
    await mark('three-additional-original-releases-staged',{stores:4,merchants:2,
      releases:additions.map(({tenant,slot,releaseId,amount})=>({tenant,slot,releaseId,amount}))});
  }
  const proposal={id:CAMPAIGN,title:'Original two-merchant delivery rollout and retained restoration',
    waves:Array.from({length:17},(_,index)=>({id:'wave-'+String(index+1).padStart(2,'0'),
      label:'Wave '+(index+1)+' · both original merchants',
      targets:index%2===0?
        [{tenant:'python',slot:'green',releaseId:'python-v2'},{tenant:'reference',slot:'green',releaseId:'campaign-reference-v2'}]:
        [{tenant:'python',slot:'blue',releaseId:'campaign-python-v3'},{tenant:'reference',slot:'blue',releaseId:'campaign-reference-v3'}]}))};
  function armGate(path,label){
    assert.equal(gate,null,'One original fixture boundary is held at a time');
    const entered=deferred(),released=deferred(),row={path,label,armedAt:new Date().toISOString()};
    receipt.gates.push(row);const item={path,label,entered,released,row,release(){
      if(row.releasedAt)return;row.releasedAt=new Date().toISOString();released.resolve();if(gate===item)gate=null;
    }};
    gates.add(item);gate=item;return item;
  }
  async function waitGate(held,pending){
    let settled=false,problem;
    if(pending)pending.then(()=>{settled=true;},error=>{settled=true;problem=error;});
    return waitFor(async()=>{
      if(!held.row.enteredAt&&settled)throw problem??new Error('The original operation returned before its selected fixture boundary');
      return Boolean(held.row.enteredAt);
    },Boolean,'Original fixture boundary '+held.label,signal,45000);
  }
  async function startFacilitator(){
    assert(!facilitator);
    facilitator=createServer((req,res)=>{
      const work=(async()=>{
        const chunks=[];let length=0;
        for await(const chunk of req){length+=chunk.length;assert(length<=2*1024*1024);chunks.push(chunk);}
        const input=length?JSON.parse(Buffer.concat(chunks)):{};let result;
        const held=gate?.path===req.url?gate:null;
        if(held){
          gate=null;held.row.enteredAt=new Date().toISOString();await save();held.entered.resolve();
          await held.released.promise;await save();
        }
        if(req.url==='/supported')result={kinds:[{x402Version:2,scheme:'exact',network:'stellar:testnet'}],extensions:['bazaar'],signers:{}};
        else if(req.url==='/verify')result={isValid:true,payer:'ORIGINAL_E49_LOCAL_FACILITATOR_FIXTURE'};
        else if(req.url==='/settle'){
          result={success:true,network:'stellar:testnet',transaction:hash('LOCAL_FIXTURE\n'+JSON.stringify(input)),
            payer:'ORIGINAL_E49_LOCAL_FACILITATOR_FIXTURE'};
          receipt.settleCalls=(receipt.settleCalls??0)+1;
        }
        res.writeHead(result?200:404,{'content-type':'application/json'});res.end(JSON.stringify(result??{}));
      })().catch(error=>{if(!res.headersSent)res.writeHead(500);res.end();attempt.facilitatorError=diagnostic(error);});
      track(work);
    });
    await new Promise((done,fail)=>{facilitator.once('error',fail);facilitator.listen(managed.portStart+6,'127.0.0.1',done);});
  }
  async function api(path,input,expected=200){
    assert(workspace);
    const response=await fetch(workspace.url+'/api/'+path,{method:input===undefined?'GET':'POST',
      headers:{'x-fleet-workspace':sessionKey,...(input===undefined?{}:{'content-type':'application/json'})},
      ...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(90000)});
    const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;
  }
  const campaignPath=action=>'releases/campaigns/'+action;
  const browserInspect=()=>api('releases/campaigns/inspect?id='+CAMPAIGN);
  async function openWorkspace(){
    assert(!workspace&&!mcp&&!terminal&&!operator);
    workspace=await startFleetWorkspace({releasePlan:managed.planFile,releaseDirectory:directory,expectedPlanDigest:plan.digest,port:0});
    sessionKey=(await(await fetch(workspace.url+'/api/session')).json()).session;
    const state=await api('status');assert.equal(state.releaseStatus.planDigest,plan.digest);return state.releaseStatus;
  }
  async function closeWorkspace(){
    if(!workspace)return;
    const selected=workspace;await selected.close();if(workspace===selected)workspace=null;
  }
  async function wire(method,params={}){
    const response=await fetch(mcp.url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',
      accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},
      body:JSON.stringify({jsonrpc:'2.0',id:++wireId,method,params}),signal:AbortSignal.timeout(90000)});
    assert.equal(response.status,200);const reply=await response.json();
    assert.equal(reply.error,undefined,JSON.stringify(reply));return reply.result;
  }
  async function call(name,args={}){
    const result=await wire('tools/call',{name,arguments:args});
    if(result.isError){const error=result.structuredContent;throw Object.assign(new Error(JSON.stringify(error)),{
      code:error?.code??error?.error?.code??(typeof error?.error==='string'?error.error:null)});}
    assert(result.structuredContent&&typeof result.structuredContent==='object');
    const value=result.structuredContent;
    if(dropAdvance&&name==='merchant_fleet_campaign_advance'&&value.nextWave===1&&!value.awaiting){
      dropAdvance=false;receipt.lostAdvance={request:structuredClone(args),nativeResult:structuredClone(value),
        at:new Date().toISOString()};await save();
      throw Object.assign(new Error('Original local fixture: committed MCP response was not delivered to this caller'),
        {code:'FIXTURE_MCP_RESPONSE_LOST'});
    }
    if(delayClientExport&&name==='merchant_fleet_campaign_export'){
      const held=delayClientExport;delayClientExport=null;held.entered.resolve();await held.released.promise;
    }
    return value;
  }
  async function openMcp(){
    assert(!workspace&&!mcp&&!terminal&&!operator);
    mcp=await startMerchantMcp({configPath:managed.mcpConfiguration,port:0,environment:{...process.env,MCP_ACCESS_TOKEN:token}});
    await wire('initialize');
    const listed=(await wire('tools/list')).tools.filter(row=>row.name.startsWith('merchant_fleet_campaign_'));
    assert.equal(listed.length,10);
    const originalPlan=await call('merchant_fleet_plan');assert.equal(originalPlan.digest,plan.digest);
    const running=await call('merchant_fleet_start',{expectedPlanDigest:plan.digest});managerId=running.managerId;
    client=createFleetCampaignClient({call,expectedPlanDigest:plan.digest,expectedManagerId:managerId});
    receipt.mcpTools=listed.map(row=>row.name);await save();return running.fleet;
  }
  async function closeMcp(){
    if(!mcp)return;
    if(client){await client.disconnect();client=null;}
    const selected=mcp;
    if(managerId){await call('merchant_fleet_stop',{managerId});managerId=null;}
    await selected.close();if(mcp===selected)mcp=null;
  }
  function paymentHTTP(host,body,headers={}){
    const bytes=Buffer.from(JSON.stringify(body));
    return new Promise((done,fail)=>{
      const request=httpRequest({hostname:'127.0.0.1',port:plan.gateway.port,path:'/summary',method:'POST',
        headers:{host,'content-type':'application/json','content-length':bytes.length,...headers}},response=>{
        const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',fail);
        response.on('end',()=>done({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
      });
      request.on('error',fail);request.setTimeout(90000,()=>request.destroy(new Error('Original merchant request timed out')));
      request.end(bytes);
    });
  }
  async function challenge(id,amount){
    const response=await paymentHTTP(tenant(id).host,{values:[2,4,6,8],window:2});
    assert.equal(response.status,402,response.body.toString());
    const value=JSON.parse(Buffer.from(response.headers['payment-required'],'base64'));
    assert.equal(value.accepts[0].amount,amount);assert.equal(value.accepts[0].network,'stellar:testnet');return value;
  }
  async function startPaidDrain(){
    const challengeValue=await challenge('python','20000');
    const order='E49_CAMPAIGN_DRAIN_'+String(receipt.payments.length+1);
    const body={values:[2,4,6,8],window:2},header=encodePaymentSignatureHeader({x402Version:2,resource:challengeValue.resource,
      accepted:challengeValue.accepts[0],extensions:challengeValue.extensions,payload:{managedSf98Fixture:order}});
    const row={order,amount:'20000',request:{body,paymentSignatureSha256:hash(header)},
      startedAt:new Date().toISOString(),execution:'Original x402 SDK and Python application with original local facilitator responses'};
    receipt.payments.push(row);await save();
    const held=armGate('/settle','original-blue-request-drains-through-first-wave');await save();
    const response=track(paymentHTTP(tenant('python').host,body,{'x-sf98-order-id':order,'payment-signature':header}));
    await waitGate(held,response);return {held,response,row};
  }
  async function finishPaidDrain(payment){
    payment.held.release();
    const response=await payment.response;
    assert.equal(response.status,200,response.body.toString());assert(response.headers['payment-response']);
    const value=JSON.parse(response.body);assert.equal(value.count,4);assert.equal(value.mean,5);assert.deepEqual(value.rollingMean,[2,3,5,7]);
    const event=await waitFor(()=>observedPayment(payment.row),Boolean,'Retained native settlement event',signal);
    assert.equal(event.amountAtomic,'20000');
    Object.assign(payment.row,{finishedAt:new Date().toISOString(),status:200,bytes:response.body.length,sha256:hash(response.body),
      nativeReceipt:JSON.parse(Buffer.from(response.headers['payment-response'],'base64')),event});
    await save();return payment.row;
  }
  async function retainRetirements(read,retire){
    for(;;){
      const view=await read();const target=view.retirements.find(row=>row.canRetire);
      if(!target)return view;
      const key='retire-'+target.tenant+'-'+target.slot+'-'+target.instanceId;
      const previous=receipt.requests.find(row=>row.key===key&&!row.refused&&!row.superseded);
      const row=await keepRequest(key,'retire',previous?.input??{id:CAMPAIGN,expectedRevision:view.revision,
        requestId:'retire-'+randomUUID(),tenant:target.tenant,slot:target.slot,instanceId:target.instanceId,
        expectedNativeRevision:view.observed.revision});
      await completedRequest(row,await retire(row.input));
    }
  }

  let loseBrowserSave=false,loseBrowserRollback=false;
  async function interceptCampaign(route){
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='POST'||!url.pathname.startsWith('/api/releases/campaigns/'))return route.continue();
    const action=url.pathname.split('/').at(-1),input=request.postDataJSON();
    const row=input.requestId?await keepRequest('browser-'+action+'-'+input.requestId,action,input):null;
    let response;
    try{
      response=await route.fetch();const payload=await response.json();
      if(row){row.httpStatus=response.status();row.reply=structuredClone(payload);await save();}
      if(response.status()===200&&['review','rollback-review'].includes(action)){
        receipt.browserReviews??=[];receipt.browserReviews.push({action,input,result:payload.result,at:new Date().toISOString()});await save();
      }
      const drop=response.status()===200&&((action==='save'&&loseBrowserSave)||(action==='rollback'&&loseBrowserRollback));
      if(drop){
        if(action==='save'){loseBrowserSave=false;receipt.lostSave={request:input,result:payload.result};}
        else{loseBrowserRollback=false;receipt.lostRollback={request:input,result:payload.result};}
        await save();await route.abort('failed');return;
      }
      await route.fulfill({response});
    }finally{await response?.dispose();}
  }
  async function openBrowser(){
    assert(workspace&&!browser);
    const loaded=createRequire(join(resolve(playwrightModules),'runtime-loader.cjs'))('playwright');
    browser=await loaded.chromium.launch({executablePath:chromium,headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-background-networking','--renderer-process-limit=1']});
    browserContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await browserContext.route('**/api/releases/campaigns/**',route=>{
      const work=interceptCampaign(route).catch(async error=>{
        attempt.interceptionErrors??=[];attempt.interceptionErrors.push(diagnostic(error));
        await route.abort('failed').catch(()=>{});throw error;
      });
      responseWork.add(work);work.finally(()=>responseWork.delete(work)).catch(()=>{});return work;
    });
    page=await browserContext.newPage();page.on('pageerror',error=>attempt.browserErrors.push(diagnostic(error)));
    await page.goto(workspace.url,{waitUntil:'domcontentloaded'});await page.locator('#fleet-campaigns').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.getElementById('campaign-import')?.disabled);
  }
  async function selectBrowserCampaign(){
    await page.locator('#campaign-refresh').click();
    await page.waitForFunction(id=>[...document.getElementById('campaign-select').options].some(row=>row.value===id),CAMPAIGN);
    await page.locator('#campaign-select').selectOption(CAMPAIGN);
    await page.waitForFunction(()=>document.getElementById('campaign-summary')?.textContent.includes('Saved plan revision'));
  }
  async function closeBrowser(){
    while(responseWork.size)await Promise.allSettled([...responseWork]);
    if(browser){await browser.close();browser=null;browserContext=null;page=null;}
  }
  async function screenshot(name,selector='#campaign-summary'){
    await page.locator(selector).scrollIntoViewIfNeeded();
    const path=join(output,name+'.png');await page.screenshot({path,fullPage:false});
    const bytes=await readFile(path),size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    assert(size.document<=size.viewport+2,'Rollout content must fit the actual viewport');
    receipt.screenshots.push({name,path,bytes:bytes.length,sha256:hash(bytes),...size});await save();
  }
  async function browserPauseFirstWave(){
    if(completed('browser-approved-wave-paused-before-activation'))return;
    const current=await openWorkspace();
    const listing=await api('releases/campaigns');
    if(!listing.campaigns.some(row=>row.id===CAMPAIGN)){
      assert.equal(current.native.revision,3,'Begin with the original managed/direct baseline');
      await openBrowser();loseBrowserSave=!receipt.lostSave;
      const proposalPath=join(output,'original-rollout-proposal.json');
      await exactFile(proposalPath,Buffer.from(json(proposal)));
      await page.locator('#campaign-file').setInputFiles(proposalPath);
      await page.waitForFunction(id=>document.getElementById('campaign-id').value===id,CAMPAIGN);
      await page.locator('#campaign-save').click();
      await waitFor(()=>api('releases/campaigns'),value=>value.campaigns.some(row=>row.id===CAMPAIGN),'Original saved rollout',signal);
    }else await openBrowser();
    await selectBrowserCampaign();let view=await browserInspect();
    assert.equal(view.plan.waves.length,17);assert.equal(view.plan.baseline.revision,3);assert.equal(view.nextWave,0);
    assert.deepEqual(view.plan.waves.map(row=>({id:row.id,label:row.label,
      targets:row.targets.map(({tenant,slot,releaseId})=>({tenant,slot,releaseId}))})),proposal.waves);
    receipt.baseline=structuredClone(view.plan.baseline);
    if(receipt.lostSave){
      const original=view.plan.requests.find(row=>row.id===receipt.lostSave.request.requestId);
      assert.equal(original.kind,'save');assert.equal(original.phase,'COMPLETE');
      assert.deepEqual(original.request,receipt.lostSave.request);
      const repeated=(await api(campaignPath('save'),receipt.lostSave.request)).result;
      assert.deepEqual(repeated,original.result);
      await mark('browser-save-response-recovered',{requestId:original.id,requestSha256:original.requestSha256,waves:17});
    }
    if(!view.plan.pending||view.plan.pending.phase!=='PREPARED'||!view.paused){
      const held=armGate('/supported','browser-pause-during-original-multi-merchant-prepare');await save();
      try{
        if(view.plan.pending){
          if(view.paused){
            await page.locator('#campaign-pause').click();
            await waitFor(browserInspect,row=>!row.paused,'Continue the existing pause control',signal);
          }
          await page.locator('#campaign-retry').click();
        }else{
          await page.locator('#campaign-review-wave').click();
          await page.locator('#campaign-review').waitFor({state:'visible'});
          await screenshot('campaign-first-two-merchant-review','#campaign-review');
          await page.locator('#campaign-apply').click();
        }
        await waitGate(held);
        await page.locator('#campaign-pause-reason').fill('Hold this reviewed wave before activation; retain the exact request.');
        assert.equal(await page.locator('#campaign-pause').isDisabled(),false,'Pause must remain usable during preparation');
        await page.locator('#campaign-pause').click();
        await waitFor(browserInspect,row=>row.paused&&row.plan.pending,'Durable pause while preparation remains held',signal);
        assert.equal(held.row.releasedAt,undefined);
        held.release();
        view=await waitFor(browserInspect,row=>row.paused&&row.plan.pending?.phase==='PREPARED','Paused prepared wave',signal);
        await waitFor(async()=>responseWork.size,value=>value===0,'Original browser POST response drains',signal);
      }finally{held.release();}
    }
    view=await browserInspect();assert.equal(view.nextWave,0);assert.equal(view.observed.revision,3);
    assert.equal(view.paused,true);assert.equal(view.plan.pending.phase,'PREPARED');assert(view.pendingRequest);
    const original=view.plan.requests.find(row=>row.id===view.pendingRequest.requestId);
    assert.equal(original.phase,'PENDING');assert.deepEqual(original.request,view.pendingRequest);
    receipt.originalAdvance=structuredClone(view.pendingRequest);receipt.browserPrepared=structuredClone(view.plan.pending);
    const download=page.waitForEvent('download');await page.locator('#campaign-download-draft').click();
    const saved=await download,path=join(output,'browser-paused-proposal.json');await saved.saveAs(path);
    const retained=(await originalJSON(path)).value;
    assert.deepEqual(retained.pending.input,view.pendingRequest);assert.equal(retained.planDigest,plan.digest);
    await screenshot('campaign-paused-desktop');
    await page.setViewportSize({width:390,height:844});await screenshot('campaign-paused-mobile');
    await mark('browser-approved-wave-paused-before-activation',{requestId:view.pendingRequest.requestId,
      campaignRevision:view.revision,controlRevision:view.controlRevision,nativeRevision:view.observed.revision,
      candidateId:view.plan.pending.candidateId,merchants:view.plan.pending.after.length});
    await closeBrowser();await closeWorkspace();
  }
  async function setPause(clientLike,paused,key){
    for(let attempt=0;attempt<3;attempt++){
      const view=await clientLike.inspect({id:CAMPAIGN});if(view.paused===paused)return view;
      let previous=receipt.requests.find(row=>row.key===key&&!row.refused&&!row.superseded);
      if(previous&&view.control.requests.some(row=>row.id===previous.input.requestId)){
        previous.superseded={at:new Date().toISOString(),reason:'A later original pause control is current.',
          observedControlRevision:view.controlRevision};await save();previous=null;
      }
      const input=previous?.input??{id:CAMPAIGN,expectedControlRevision:view.controlRevision,requestId:'pause-'+randomUUID(),
        paused,reason:paused?'Retain the reviewed original request before activation.':'Continue the same approved request.'};
      const row=await keepRequest(key,'pause',input);
      try{
        await completedRequest(row,await clientLike.pause(row.input));
        const current=await clientLike.inspect({id:CAMPAIGN});if(current.paused===paused)return current;
      }catch(error){
        if(!/FLEET_CAMPAIGN_CONTROL_REVISION_CHANGED/.test(String(error.code)+' '+error.message))throw error;
        const current=await clientLike.inspect({id:CAMPAIGN});
        assert(!current.control.requests.some(item=>item.id===row.input.requestId),'Preserve an accepted pause request');
        row.refused={at:new Date().toISOString(),code:'FLEET_CAMPAIGN_CONTROL_REVISION_CHANGED',
          observedControlRevision:current.controlRevision,originalRequestPreserved:true};await save();
      }
    }
    throw new Error('The original pause control changed repeatedly; retain its exact requests.');
  }
  async function waveRequest(clientLike,index,key){
    let view=await clientLike.inspect({id:CAMPAIGN});
    if(view.plan.pending){
      assert.equal(view.plan.pending.kind,'wave');assert.equal(view.plan.pending.waveIndex,index);
      return keepRequest(key,'advance',view.pendingRequest);
    }
    assert.equal(view.nextWave,index);assert.equal(view.state,'READY');
    const old=receipt.requests.find(row=>row.key===key&&!row.refused&&!row.superseded);
    if(old){
      const recorded=view.plan.requests.find(row=>row.id===old.input.requestId);
      if(recorded){assert.deepEqual(recorded.request,old.input);return old;}
      // A saved but never accepted review can expire when its original owner closes.
      // First replay that exact body; only a definite missing-review refusal permits a new review.
      try{await completedRequest(old,await clientLike.advance(old.input));return old;}
      catch(error){
        assert(/FLEET_CAMPAIGN_REVIEW_CHANGED/.test(String(error.code)+' '+error.message),'Retain an uncertain original request');
        const checked=await clientLike.inspect({id:CAMPAIGN});
        assert(!checked.plan.requests.some(row=>row.id===old.input.requestId));
        old.refused={at:new Date().toISOString(),code:'FLEET_CAMPAIGN_REVIEW_CHANGED',originalRequestPreserved:true};
        await save();view=checked;
      }
    }
    const reviewed=await clientLike.review({id:CAMPAIGN,expectedRevision:view.revision});
    assert.equal(reviewed.atomicMerchants,2);
    const input={id:CAMPAIGN,expectedRevision:view.revision,requestId:'wave-'+randomUUID(),reviewId:reviewed.reviewId};
    return keepRequest(key,'advance',input);
  }
  async function mcpFirstWaves(){
    if(completed('mcp-two-waves-closed'))return;
    await openMcp();let view=await client.inspect({id:CAMPAIGN});
    if(view.nextWave===0){
      assert.deepEqual(view.pendingRequest,receipt.originalAdvance,'Reopen the exact browser-approved request');
      assert.equal(view.plan.pending.kind,'wave');
      await setPause(client,false,'mcp-resume-browser-control');
      const held=armGate('/supported','mcp-independent-pause-during-reprepared-wave');await save();
      let advance;
      try{
        advance=track(client.advance(receipt.originalAdvance));
        await waitGate(held,advance);
        const paused=await setPause(client,true,'mcp-concurrent-pause');
        assert.equal(paused.paused,true);
        assert.equal(held.row.releasedAt,undefined,'Concurrent pause must return before the native prepare gate opens');
        held.release();const waiting=await advance;assert.equal(waiting.awaiting,'CONTINUE_APPROVED_REQUEST');
        view=await client.inspect({id:CAMPAIGN});assert.equal(view.paused,true);assert.equal(view.plan.pending.phase,'PREPARED');
        await mark('mcp-independent-pause-and-original-request-reprepare',{requestId:receipt.originalAdvance.requestId,
          controlRevision:view.controlRevision,candidateId:view.plan.pending.candidateId,nativeRevision:view.observed.revision});
      }finally{held.release();if(advance)await advance.catch(()=>{});}
      const payment=await startPaidDrain();
      try{
        await setPause(client,false,'mcp-activate-original-control');
        dropAdvance=true;
        await assert.rejects(()=>client.advance(receipt.originalAdvance),error=>error.code==='FIXTURE_MCP_RESPONSE_LOST');
        const reconciled=await client.reconcile('advance',receipt.originalAdvance);
        assert.equal(reconciled.status,'COMMITTED');assert.equal(reconciled.result.nextWave,1);
        const replayed=await client.advance(receipt.originalAdvance);
        assert.deepEqual(replayed,{managerId,...reconciled.result});
        view=await client.inspect({id:CAMPAIGN});
        const original=view.retirements.find(row=>row.tenant==='python'&&row.slot==='blue'&&row.owned);
        assert(original);assert.equal(original.serving,false);assert(original.drainingRequests>0);assert.equal(original.canRetire,false);
        const previousRefusal=receipt.requests.find(row=>row.key==='retire-before-original-drain'&&!row.refused&&!row.superseded);
        const refused=await keepRequest('retire-before-original-drain','retire',previousRefusal?.input??{
          id:CAMPAIGN,expectedRevision:view.revision,requestId:'drain-refusal-'+randomUUID(),
          tenant:original.tenant,slot:original.slot,instanceId:original.instanceId,expectedNativeRevision:view.observed.revision});
        await assert.rejects(()=>client.retire(refused.input),error=>/FLEET_CAMPAIGN_DRAIN_REQUIRED/.test(String(error.code)+' '+error.message));
        refused.expectedRefusal='FLEET_CAMPAIGN_DRAIN_REQUIRED';
        receipt.drainObserved={instanceId:original.instanceId,active:original.drainingRequests,nativeRevision:view.observed.revision};
        await save();
        const paid=await finishPaidDrain(payment);
        await mark('original-paid-request-drained-before-retirement',{order:paid.order,status:paid.status,
          eventId:paid.event.id,instanceId:original.instanceId,nativeRevision:view.observed.revision,
          paymentAmount:paid.amount,execution:paid.execution});
      }finally{payment.held.release();await payment.response.catch(()=>{});}
      await retainRetirements(()=>client.inspect({id:CAMPAIGN}),input=>client.retire(input));
      await mark('mcp-lost-activation-response-reconciled',{requestId:receipt.originalAdvance.requestId,nativeRevision:4,merchants:2});
    }
    view=await client.inspect({id:CAMPAIGN});
    assert(completed('original-paid-request-drained-before-retirement'),'Retain the interrupted original drain observation for continuation');
    if(view.nextWave===1){
      await retainRetirements(()=>client.inspect({id:CAMPAIGN}),input=>client.retire(input));
      const row=await waveRequest(client,1,'mcp-wave-two');
      await completedRequest(row,await client.advance(row.input));
      view=await client.inspect({id:CAMPAIGN});assert.equal(view.nextWave,2);assert.equal(view.observed.revision,5);
      await retainRetirements(()=>client.inspect({id:CAMPAIGN}),input=>client.retire(input));
    }
    view=await client.inspect({id:CAMPAIGN});assert.equal(view.nextWave,2);
    const held=deferred(),released=deferred();delayClientExport={entered:held,released};
    const replyGate={release:()=>released.resolve()};gates.add(replyGate);
    const exported=track(client.export({id:CAMPAIGN}));await held.promise;
    let disconnected=false;const closing=track(client.disconnect().then(value=>{disconnected=true;return value;}));
    await delay(50);assert.equal(disconnected,false,'Disconnect must drain only this client’s accepted result');
    released.resolve();verifyFleetCampaignExport(await exported);await closing;client=null;
    const stillRunning=await call('merchant_fleet_status');assert.equal(stillRunning.running,true);
    await mark('typed-client-drains-own-call-with-owner-retained',{managerId,nativeRevision:stillRunning.fleet.native.revision});
    await closeMcp();await mark('mcp-two-waves-closed',{completedWaves:2,nativeRevision:5});
  }

  async function browserServingSlotExplanation(){
    if(completed('browser-serving-slot-restoration-explained'))return;
    await openWorkspace();await openBrowser();await selectBrowserCampaign();
    const view=await browserInspect();assert.equal(view.nextWave,2);
    const baseline=view.rollbackTargets.find(row=>row.revision===receipt.baseline.revision);
    assert(baseline);assert.equal(baseline.availability,'SLOT_IN_USE');assert.equal(baseline.blockers.length,2);
    for(const blocker of baseline.blockers){assert.equal(blocker.serving,true);assert.equal(blocker.canRetire,false);}
    await page.locator('#campaign-rollback-revision').selectOption(String(baseline.revision));
    await page.waitForFunction(()=>document.getElementById('campaign-rollback-availability')?.textContent.includes('currently serves another release'));
    assert.equal(await page.locator('#campaign-review-rollback').isDisabled(),true);
    await screenshot('campaign-serving-slot-explanation','#campaign-rollback-area');
    await page.setViewportSize({width:390,height:844});
    await screenshot('campaign-serving-slot-explanation-mobile','#campaign-rollback-area');
    await mark('browser-serving-slot-restoration-explained',{targetRevision:baseline.revision,blockers:baseline.blockers,
      instruction:'Move the serving release through a reviewed wave before restoring this occupied slot.'});
    await closeBrowser();await closeWorkspace();
  }
  async function openTerminal(){
    assert(!workspace&&!mcp&&!terminal&&!operator);
    const child=spawn(node,[join(sourceRoot,FLEET+'release-cli.mjs'),'start','--plan',managed.planFile,'--directory',directory],
      {cwd:sourceRoot,env:{...process.env},stdio:['pipe','pipe','pipe']});
    let spawnError=null,stdout='',stderr='',buffer='',depth=0,quoted=false,escaped=false,started=false;
    const rows=[],waiters=[];let parserError=null,quitting=false,closedResult=null;
    const observedExit=deferred();
    function settle(){
      for(let index=0;index<waiters.length;){
        const waiter=waiters[index];
        const found=rows.findIndex(row=>waiter.accept(row)||row&&Object.hasOwn(row,'error'));
        if(found>=0){
          const row=rows.splice(found,1)[0];waiters.splice(index,1);clearTimeout(waiter.timer);
          if(row&&Object.hasOwn(row,'error'))waiter.reject(Object.assign(new Error(row.error),{code:row.code}));
          else waiter.resolve(row);
        }else if(parserError||spawnError||closedResult){
          waiters.splice(index,1);clearTimeout(waiter.timer);
          waiter.reject(parserError??spawnError??new Error('Original terminal ended before its accepted command returned'));
        }else index++;
      }
    }
    function recordObject(raw){
      try{const row=JSON.parse(raw);assert(row&&typeof row==='object'&&!Array.isArray(row));rows.push(row);settle();}
      catch(error){parserError=error;settle();}
    }
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      stdout=(stdout+chunk).slice(-2*1024*1024);
      for(const character of chunk){
        if(!started){if(character!=='{')continue;started=true;buffer='{';depth=1;quoted=false;escaped=false;continue;}
        buffer+=character;
        if(buffer.length>16*1024*1024){parserError=new Error('Original terminal JSON exceeded its bounded receipt');settle();return;}
        if(quoted){if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')quoted=false;continue;}
        if(character==='"'){quoted=true;continue;}
        if(character==='{'||character==='[')depth++;
        else if(character==='}'||character===']')depth--;
        if(depth===0){recordObject(buffer);buffer='';started=false;}
      }
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
    child.stdin.on('error',error=>{if(!quitting){parserError=error;settle();}});
    child.once('error',error=>{spawnError=error;observedExit.resolve({spawnError:diagnostic(error)});settle();});
    child.once('exit',(code,signal)=>{closedResult={code,signal};observedExit.resolve(closedResult);settle();});
    function receive(accept,maximum=120000){
      const result=new Promise((resolve,reject)=>{
        const waiter={accept,resolve,reject,timer:null};waiter.timer=setTimeout(()=>{
          const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);
          reject(new Error('Original terminal command has not returned; retain its exact request'));
        },maximum);waiters.push(waiter);settle();
      });
      return track(result);
    }
    const api={
      child,get stderr(){return stderr;},
      receive,
      ask(line,accept){
        assert(!quitting,'The original terminal is draining');
        const result=receive(accept);child.stdin.write(line+'\n');return result;
      },
      async close(){
        if(!quitting){quitting=true;if(child.stdin.writable){child.stdin.write('quit\n');child.stdin.end();}}
        if(!closedResult&&!spawnError){
          let last=Date.now(),signalSent=false;
          while(!closedResult&&!spawnError){
            if(!signalSent&&Date.now()-last>=60000){child.kill('SIGTERM');signalSent=true;last=Date.now();}
            if(signalSent&&Date.now()-last>=15000){
              process.stdout.write(JSON.stringify({phase:'FLEET_CAMPAIGN_TERMINAL_DRAIN',pid:child.pid,operation})+'\n');last=Date.now();
            }
            await delay(250);
          }
        }
        const result=await observedExit.promise;
        receipt.terminalAttempts??=[];receipt.terminalAttempts.push({pid:child.pid??null,finishedAt:new Date().toISOString(),
          result,stdoutSha256:hash(stdout),stderr,source:PRODUCT});
        await atomicJSON(join(output,'terminal-last-transcript.json'),{result,stdout,stderr});await save();
        assert(!spawnError,'The original terminal must start successfully');
        assert.equal(result.code,0,'The original terminal must finish its owned merchant cleanup');
      },
    };
    terminal=api;
    const ready=await api.receive(row=>Boolean(row.status?.schema==='stellar-forge.fleet-release-status.v1'));
    assert.equal(ready.status.planDigest,plan.digest);
    return api;
  }
  async function closeTerminal(){
    if(!terminal)return;
    const selected=terminal;await selected.close();if(terminal===selected)terminal=null;
  }
  async function terminalRequest(action,input){
    const key=input.requestId;assert(key);
    const parent=join(output,'Requests  and approvals');
    if(!await exists(parent))await privateDirectory(parent,true);
    const path=join(parent,key+'.json');await exactFile(path,Buffer.from(json(input)));
    return terminal.ask('campaign-'+action+' @'+JSON.stringify(path),
      row=>action==='pause'?row.id===input.id&&row.paused===input.paused&&row.controlRevision===input.expectedControlRevision+1:
        row.requestId===input.requestId);
  }
  function terminalClient(){
    return {
      inspect:()=>terminal.ask('campaign-inspect '+CAMPAIGN,row=>row.id===CAMPAIGN&&row.plan?.schema==='stellar-forge.fleet-campaign.v1'),
      review:input=>terminal.ask('campaign-review '+CAMPAIGN+' '+input.expectedRevision,row=>row.kind==='wave'&&row.id===CAMPAIGN),
      advance:input=>terminalRequest('advance',input),
      pause:input=>terminalRequest('pause',input),
      retire:input=>terminalRequest('retire',input),
    };
  }
  async function terminalRemainingWaves(){
    if(completed('seventeen-waves-through-original-cli'))return;
    await openTerminal();const original=terminalClient();let view=await original.inspect({id:CAMPAIGN});
    assert(view.nextWave>=2&&view.nextWave<=17);
    for(;;){
      active();view=await retainRetirements(()=>original.inspect({id:CAMPAIGN}),input=>original.retire(input));
      if(view.nextWave===17)break;
      const index=view.nextWave,row=await waveRequest(original,index,'terminal-wave-'+(index+1));
      if(index===2&&!completed('terminal-pause-bypasses-active-wave')){
        if(view.paused)await setPause(original,false,'terminal-resume-before-wave-three');
        const held=armGate('/supported','terminal-pause-before-third-whole-mapping-activation');await save();
        let advancing;
        try{
          advancing=track(original.advance(row.input));await waitGate(held,advancing);
          const status=await terminal.ask('status',item=>item.schema==='stellar-forge.fleet-release-status.v1');
          assert.equal(status.busy,'campaign-advance');
          const paused=await setPause(original,true,'terminal-independent-pause');
          assert.equal(paused.paused,true);
          assert.equal(held.row.releasedAt,undefined);held.release();
          const waiting=await advancing;assert.equal(waiting.awaiting,'CONTINUE_APPROVED_REQUEST');
          await mark('terminal-pause-bypasses-active-wave',{requestId:row.input.requestId,nativeRevision:status.native.revision,
            exactInputFileDirectory:join(output,'Requests  and approvals')});
          await setPause(original,false,'terminal-resume-approved-wave-three');
        }finally{held.release();if(advancing)await advancing.catch(()=>{});}
      }else if(view.paused)await setPause(original,false,'terminal-resume-wave-'+(index+1));
      const result=await original.advance(row.input);await completedRequest(row,result);
      view=await original.inspect({id:CAMPAIGN});assert.equal(view.nextWave,index+1);
      assert.equal(view.observed.revision,receipt.baseline.revision+index+1);
      const committed=view.plan.history.filter(item=>item.kind==='WAVE_ACTIVATED');
      assert.equal(committed.length,index+1);
      assert.equal(committed.at(-1).after.length,2);
      await mark('original-wave-'+String(index+1).padStart(2,'0'),{requestId:row.input.requestId,
        nativeRevision:view.observed.revision,merchants:2});
    }
    assert.equal(view.state,'COMPLETE');assert.equal(view.observed.revision,20);
    const status=await terminal.ask('status',row=>row.schema==='stellar-forge.fleet-release-status.v1');
    assert(!status.native.history.some(row=>row.revision===receipt.baseline.revision),
      'Seventeen real waves must outlive the original sixteen-snapshot history');
    const target=view.rollbackTargets.find(row=>row.revision===receipt.baseline.revision);
    assert(target);assert.equal(target.mode,'RETAINED_RELEASES');assert.equal(target.availability,'REVIEW_REQUIRED');
    assert.deepEqual(mappingIdentity(target.mapping),mappingIdentity(receipt.baseline.mapping));
    const path=join(output,'completed  seventeen-wave-plan.json');
    const exported=await terminal.ask('campaign-export '+CAMPAIGN+' '+JSON.stringify(path),
      row=>row.schema==='stellar-forge.fleet-campaign-file.v1');
    assert.equal(exported.file.path,path);
    const document=await originalJSON(path);assert.equal(document.sha256,exported.file.sha256);
    verifyFleetCampaignExport(document.value);
    assert.equal(document.value.plan.history.filter(row=>row.kind==='WAVE_ACTIVATED').length,17);
    const replay=await terminal.ask('campaign-export '+CAMPAIGN+' '+JSON.stringify(path),
      row=>row.schema==='stellar-forge.fleet-campaign-file.v1');
    assert.equal(replay.reopened,true);assert.deepEqual(replay.file,exported.file);
    await mark('seventeen-waves-through-original-cli',{waves:17,nativeRevision:view.observed.revision,
      nativeHistory:status.native.history.map(row=>row.revision),restoration:target,
      export:{path,sha256:document.sha256,documentSha256:document.value.sha256}});
    await closeTerminal();
  }
  async function browserRetainedRestoration(){
    if(completed('browser-restored-retained-whole-mapping'))return;
    await openWorkspace();await openBrowser();await selectBrowserCampaign();let view=await browserInspect();
    if(view.state!=='ROLLED_BACK'){
      assert.equal(view.nextWave,17);
      const target=view.rollbackTargets.find(row=>row.revision===receipt.baseline.revision);
      assert.equal(target.mode,'RETAINED_RELEASES');assert.equal(target.availability,'REVIEW_REQUIRED');
      assert.deepEqual(mappingIdentity(target.mapping),mappingIdentity(receipt.baseline.mapping));
      if(view.plan.pending){
        assert.equal(view.plan.pending.kind,'rollback');assert.equal(view.plan.pending.restoreMode,'RETAINED_RELEASES');
        assert.equal(view.plan.pending.targetRevision,receipt.baseline.revision);
        if(view.paused){
          await page.locator('#campaign-pause').click();
          await waitFor(browserInspect,row=>!row.paused,'Continue the original restoration control',signal);
        }
        loseBrowserRollback=!receipt.lostRollback;
        await page.locator('#campaign-retry').click();
        view=await waitFor(browserInspect,row=>row.state==='ROLLED_BACK','Continue the original retained mapping restoration',signal,90000);
      }else{
      await page.locator('#campaign-rollback-revision').selectOption(String(target.revision));
      await page.locator('#campaign-review-rollback').click();await page.locator('#campaign-review').waitFor({state:'visible'});
      await page.waitForFunction(()=>document.getElementById('campaign-review-description')?.textContent.startsWith('Restore the saved release mapping'));
      const review=receipt.browserReviews.filter(row=>row.action==='rollback-review').at(-1).result;
      assert.equal(review.restoreMode,'RETAINED_RELEASES');assert.equal(review.targetRevision,receipt.baseline.revision);
      assert.deepEqual(mappingIdentity(review.after),mappingIdentity(receipt.baseline.mapping));
      await screenshot('campaign-retained-release-restoration-review','#campaign-review');
      const downloading=page.waitForEvent('download');await page.locator('#campaign-download-review').click();
      const downloaded=await downloading,path=join(output,'retained-release-restoration-review.json');await downloaded.saveAs(path);
      assert.deepEqual((await originalJSON(path)).value,review);
      loseBrowserRollback=!receipt.lostRollback;await page.locator('#campaign-apply').click();
      view=await waitFor(browserInspect,row=>row.state==='ROLLED_BACK','Original whole mapping restoration',signal,90000);
      }
    }
    assert.equal(view.observed.revision,21);assert.equal(view.plan.pending,null);
    const restored=view.plan.history.filter(row=>row.kind==='ROLLED_BACK').at(-1);
    assert.equal(restored.restoreMode,'RETAINED_RELEASES');assert.equal(restored.targetRevision,3);
    assert.deepEqual(mappingIdentity(restored.after),mappingIdentity(receipt.baseline.mapping));
    assert(receipt.lostRollback?.request,'Retain the exact committed browser restoration request');
    const original=view.plan.requests.find(row=>row.id===receipt.lostRollback.request.requestId);
    assert.equal(original.phase,'COMPLETE');assert.deepEqual(original.request,receipt.lostRollback.request);
    await challenge('python','20000');await challenge('reference','20000');
    await waitFor(async()=>responseWork.size,value=>value===0,'Restoration response interception finishes',signal);
    await page.locator('#campaign-refresh').click();await screenshot('campaign-restored-whole-mapping');
    await page.setViewportSize({width:390,height:844});await screenshot('campaign-restored-whole-mapping-mobile');
    receipt.restorationComplete=true;
    await mark('browser-restored-retained-whole-mapping',{nativeRevision:view.observed.revision,targetRevision:3,
      requestId:original.id,mapping:restored.after,mode:restored.restoreMode,pythonPrice:'20000',referencePrice:'20000'});
    await closeBrowser();await closeWorkspace();
  }
  async function finalMcpReopen(){
    if(completed('original-final-reopen-and-request-export'))return;
    await openMcp();const view=await client.inspect({id:CAMPAIGN});
    assert.equal(view.state,'ROLLED_BACK');assert.equal(view.observed.revision,21);assert.equal(view.nextWave,17);
    const original=receipt.lostRollback.request,reconciled=await client.reconcile('rollback',original);
    assert.equal(reconciled.status,'COMMITTED');
    const again=await client.rollback(original);assert.deepEqual(again,{managerId,...reconciled.result});
    const exported=verifyFleetCampaignExport(await client.export({id:CAMPAIGN}));
    assert.equal(exported.plan.history.filter(row=>row.kind==='WAVE_ACTIVATED').length,17);
    assert.equal(exported.plan.history.filter(row=>row.kind==='ROLLED_BACK').length,1);
    assert.deepEqual(mappingIdentity(exported.plan.expected.mapping),mappingIdentity(receipt.baseline.mapping));
    await challenge('python','20000');await challenge('reference','20000');
    await atomicJSON(join(output,'completed-campaign-export.json'),exported);
    receipt.reopenComplete=true;
    await mark('original-final-reopen-and-request-export',{nativeRevision:21,requestId:original.requestId,
      canonicalExportSha256:exported.sha256,waves:17,rollbacks:1,managerId});
    await closeMcp();
  }

  try {
    active();await prepareSources();await startFacilitator();
    await browserPauseFirstWave();
    await mcpFirstWaves();
    await browserServingSlotExplanation();
    await terminalRemainingWaves();
    await browserRetainedRestoration();
    await finalMcpReopen();
    assert.deepEqual(attempt.browserErrors,[]);
    assert.deepEqual(attempt.interceptionErrors??[],[]);
    assert.equal(attempt.facilitatorError,undefined);
    for(const key of ['browser-save-response-recovered','browser-approved-wave-paused-before-activation',
      'mcp-independent-pause-and-original-request-reprepare','original-paid-request-drained-before-retirement',
      'mcp-lost-activation-response-reconciled','typed-client-drains-own-call-with-owner-retained',
      'browser-serving-slot-restoration-explained','terminal-pause-bypasses-active-wave',
      'seventeen-waves-through-original-cli','browser-restored-retained-whole-mapping',
      'original-final-reopen-and-request-export'])assert(completed(key),'Retain the unfinished original milestone: '+key);
  }catch(error){
    failure=error;attempt.error=diagnostic(error);receipt.state='FAILED';
  }finally{
    // Begin the original cancellation before releasing any fixture-held HTTP call.
    // The original owners retain their merchant leases while those calls drain.
    const closings=[];
    if(workspace){const held=workspace;const p=held.close().then(()=>{if(workspace===held)workspace=null;});
      p.catch(()=>{});closings.push(p);}
    if(mcp){const held=mcp;const p=held.close().then(()=>{if(mcp===held)mcp=null;managerId=null;});
      p.catch(()=>{});closings.push(p);}
    if(operator){const held=operator;const p=held.close().then(()=>{if(operator===held)operator=null;});
      p.catch(()=>{});closings.push(p);}
    if(failure&&terminal?.child.pid&&terminal.child.exitCode===null&&terminal.child.signalCode===null)
      terminal.child.kill('SIGTERM');
    for(const held of gates)held.release();
    delayClientExport?.released.resolve();delayClientExport=null;
    while(accepted.size||responseWork.size)
      await Promise.allSettled([...accepted,...responseWork]);
    if(client)try{await client.disconnect();client=null;}catch(error){attempt.cleanupErrors.push(diagnostic(error));}
    for(const result of await Promise.allSettled(closings))
      if(result.status==='rejected')attempt.cleanupErrors.push(diagnostic(result.reason));
    try{await closeTerminal();}catch(error){attempt.cleanupErrors.push(diagnostic(error));}
    try{await closeBrowser();}catch(error){attempt.cleanupErrors.push(diagnostic(error));}
    try{await closeServer(facilitator);facilitator=null;}catch(error){attempt.cleanupErrors.push(diagnostic(error));}
    try{
      const {releaseStatus}=await moduleAt(SDK+'sf82-seller-pilot/releases.mjs');
      const closedStores=[];
      for(const id of ['python','reference'])for(const name of ['blue','green']){
        const status=await releaseStatus(slot(id,name).store);
        assert.equal(status.runtime.state,'STOPPED','The original merchant child must really close: '+id+'/'+name);
        assert.notEqual(status.runtime.childAlive,true);
        closedStores.push({tenant:id,slot:name,state:status.runtime.state,generation:status.state.generation,
          activeRelease:status.state.active});
      }
      attempt.closedStores=closedStores;
      for(const [name,path]of Object.entries(originalFiles))
        assert.equal(hash(await readFile(path)),originals[name].sha256,'Preserve the actual preceding '+name+' receipt');
      assert.equal(hash(await readFile(managed.planFile)),planDocument.sha256,'Preserve the original operator plan');
    }catch(error){attempt.cleanupErrors.push(diagnostic(error));}
    for(const [key,value]of originalEnvironment){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    receipt.ownedProcessesClosed=attempt.cleanupErrors.length===0&&!workspace&&!mcp&&!terminal&&!operator&&!browser&&!facilitator;
    attempt.ownedProcessesClosed=receipt.ownedProcessesClosed;attempt.finishedAt=new Date().toISOString();
    if(!failure&&attempt.cleanupErrors.length)failure=new Error(attempt.cleanupErrors.map(row=>row.message).join('; '));
    receipt.state=!failure&&receipt.restorationComplete&&receipt.reopenComplete&&receipt.ownedProcessesClosed?'PASS':'FAILED';
    receipt.finishedAt=attempt.finishedAt;await save();await saving;
  }
  if(failure)throw failure;
  return receipt;
  }finally{await phaseLease.close();}
}
async function main(argv){
  assert(argv.length===2&&argv[0]==='--context','Use --context ORIGINAL_CONTEXT_JSON');
  const controller=new AbortController(),stop=()=>controller.abort(new Error('Original rollout receiving interrupted'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    const input=(await originalJSON(resolve(argv[1]))).value;
    const receipt=await runFleetCampaignPhase({...input,signal:controller.signal});
    process.stdout.write(JSON.stringify({schema:receipt.schema,operation:receipt.operation,product:receipt.product,
      state:receipt.state,receipt:join(resolve(input.output),'receipt.json'),ownedProcessesClosed:receipt.ownedProcessesClosed})+'\n');
  }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify(diagnostic(error))+'\n');process.exitCode=1;});
