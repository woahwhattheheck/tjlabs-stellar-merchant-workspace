import assert from 'node:assert/strict';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect } from 'node:net';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { createNativeSellerServer, NATIVE_SDK_VERSION } from '../../../sf30-seller-sdk/native-factory.mjs';
import { openJobMerchant } from '../../../sf30-seller-sdk/jobs/model.mjs';
import { startJobSeller } from '../../../sf30-seller-sdk/jobs/merchant.mjs';
import { startCustomerServer } from '../../../sf30-seller-sdk/jobs/customer.mjs';
import { CATALOG_PATH, REQUEST_PATH, WITHDRAW_PATH } from '../../../sf30-seller-sdk/jobs/intake/protocol.mjs';
import { createPublicHttpsFetch } from '../../../sf31-buyer-client/public-transport.mjs';
import { readBytes, readJson, writeBytes, writeJson, jsonBytes, digest, exists,
  privateDirectory } from '../../node/store.mjs';
import { openJobWorkspace } from '../model.mjs';
import { startJobCustomerWorkspace } from '../server.mjs';
import { readJobWorkspaceLaunch } from '../launch.mjs';
import { readJobCheckoutTicket } from './contract.mjs';
import { isInputRoute } from '../../../sf30-seller-sdk/jobs/inputs/http.mjs';

import {spawn} from 'node:child_process';
import {pipelineJobConfiguration} from '../../../sf30-seller-sdk/data-preparation/jobs/configuration.mjs';
import {PreparationWorkspaceClient} from '../../../sf30-seller-sdk/data-preparation/connection.mjs';
import {openCommissioningCourse} from './commissioning-tools.mjs';
import {reviewCommissioningBrowser} from './commissioning-browser.mjs';

const origin='https://jobs-merchant.example';
const operation='SCF-JOB-RESULT-PACKAGES-0B8D-20261012',phase='pipeline-commissioning';
const jobId='pipeline-output-files:2026.10',functionId='executePipeline',purchasePath='/preparation-pipeline';
const fixture=resolve(process.env.SF_JOBS_CHECKOUT_FIXTURE_DIR??'/');
assert.notEqual(fixture,'/');
const marker=await readJson(join(fixture,'fixture.json'));
assert.equal(marker.schema,'stellar-forge.preparation-commissioning-native-fixture.v1');
assert.equal(marker.operation,operation);assert.equal(marker.phase,phase);assert.equal(marker.fixtureDirectory,fixture);
const retained=marker.retainedDirectory,runtimeDirectory=resolve(fileURLToPath(new URL('../../',import.meta.url)));
assert.equal(marker.runtimeDirectory,runtimeDirectory);
assert.equal(resolve(fileURLToPath(new URL('./',import.meta.url))),join(runtimeDirectory,'job-workspace','checkout'));
assert.equal(fixture,join(marker.originalFixtureDirectory,phase));
assert.equal(process.env.NODE_EXTRA_CA_CERTS,join(fixture,'tls','tls.pem'));
const browserApproval=true,inputFilesMode=true;
const directory=join(fixture,'customer-workspace'),configPath=join(fixture,'merchant.json');
const handoffPath=join(fixture,'checkout.handoff.json'),output=join(fixture,'commissioning-result.json');
const profilePath=join(fixture,'operator-profile.json'),merchantState=join(fixture,'merchant-state');
const checkoutId=digest(JSON.stringify(['paid-job-checkout',origin+'/jobs/'+encodeURIComponent(jobId)]));
const intentId='job-checkout:'+checkoutId;
const fixtureAsset='CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const fixturePayTo='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const fixturePayer='GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
let merchant,seller,customer,model,host,frontend,proxy,facilitator,transport,course,managed,browser,preparationClient;
let interrupted=false,complete=false;
const sockets=new Set(),servers=new Set(),children=new Set();
const traffic={connects:0,status:0,result:0,intakeCatalog:0,intakePrepare:0,intakeWithdraw:0};
const progress=stage=>process.stdout.write(JSON.stringify({operation,phase,stage})+'\n');
const python=process.env.SF_JOBS_CHECKOUT_PYTHON;
const prepRoot=resolve(fileURLToPath(new URL('../../../sf30-seller-sdk/data-preparation/',import.meta.url)));
const sourceProject=join(fixture,'source-project');
const checkoutSource=join(marker.originalFixtureDirectory,'native-complete.json');

async function originalSnapshot(){
 const files={};
 async function walk(root,relative=''){
  for(const item of await readdir(root,{withFileTypes:true})){
   const rel=relative?relative+'/'+item.name:item.name;
   if(rel===phase||item.name==='driver.lock')continue;
   const path=join(root,item.name);
   if(item.isDirectory())await walk(path,rel);
   else if(item.isFile())files[rel]=digest(await readFile(path));
   else throw new Error('Keep original ordinary fixture files: '+rel);
  }
 }
 await walk(marker.originalFixtureDirectory);
 const old=await readJson(checkoutSource);assert.equal(old.operation,operation);assert.equal(old.result,'PASS');
 assert.equal(old.outputFiles.jobId,'output-files:2026.10');
 assert.equal(digest(await readFile(checkoutSource)),marker.originalCheckoutSha256);
 return files;
}
function owned(command,args,{env=process.env,max=4*1024*1024}={}){
 const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe'],detached:false});
 let stdout=[],stderr=[],size=0,error=null;
 const done=new Promise((resolveDone,reject)=>{
  child.once('error',value=>{error=value;});
  child.stdout.on('data',b=>{size+=b.length;if(size<=max)stdout.push(b);else{error??=new Error('Native output limit');child.kill('SIGTERM');}});
  child.stderr.on('data',b=>{if(Buffer.concat(stderr).length<65536)stderr.push(b.subarray(0,65536));});
  child.once('close',(code,signal)=>{children.delete(handle);if(error||code!==0||signal!==null)
    reject(error??Object.assign(new Error('Native helper failed'),{code,signal,stderr:Buffer.concat(stderr).toString()}));
   else resolveDone(Buffer.concat(stdout));});
 });
 const handle={child,done};children.add(handle);done.catch(()=>{});
 return handle;
}
async function project(action,workspace){
 const h=owned(python,['-B',resolve(fileURLToPath(new URL('./commissioning-project.py',import.meta.url))),
  action,'--checkout',checkoutSource,'--workspace',workspace]);
 return JSON.parse((await h.done).toString('utf8'));
}
async function startPreparation(){
 const config=join(fixture,'private-customers.json');
 await immutable(config,jsonBytes({original:{label:'Original native Request customer',
  customer:{directory,runtimeDirectory,operatorProfile:profilePath}}}));
 const handle=owned(python,['-B',join(prepRoot,'managed.py'),'serve','--workspace',sourceProject,'--port','0'],
  {env:{...process.env,SF30_PREPARATION_JOB_CUSTOMERS:config}});
 managed=handle;
 const connectionFile=join(sourceProject,'preparation-connection.json');
 let ready;
 for(let n=0;n<600;n++){
  if(interrupted)throw new Error('Interrupted managed startup');
  try{
   const value=await readJson(connectionFile);
   if(value.pid===handle.child.pid){ready=value;break;}
  }catch(e){if(e.code!=='ENOENT')throw e;}
  if(handle.child.exitCode!==null||handle.child.signalCode!==null){await handle.done;throw new Error('Managed listener ended before READY');}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'Original managed startup required');
 preparationClient=await PreparationWorkspaceClient.connect(connectionFile,{directory:sourceProject,
  workspaceSha256:ready.workspaceSha256,expectedInstanceId:ready.instanceId});
 return preparationClient.pipelineBrowser();
}
async function closePreparation(){
 await preparationClient?.close();preparationClient=null;
 if(managed){const h=managed;managed=null;h.child.kill('SIGTERM');await h.done;}
}
const stop=()=>{interrupted=true;void model?.close().catch(()=>{});for(const h of children)h.child.kill('SIGTERM');};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
async function nativeSdkVersion() {
  const require = createRequire(import.meta.url);
  let root = dirname(require.resolve('@x402/core/server'));
  for (let depth = 0; depth < 8; depth++, root = dirname(root)) {
    try {
      const metadata = JSON.parse(await readFile(join(root, 'package.json')));
      if (metadata.name === '@x402/core') return metadata.version;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error('NATIVE_SDK_PACKAGE_REQUIRED');
}
async function immutable(path, bytes) {
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.ok((await readBytes(path, Math.max(1048576, bytes.length))).equals(bytes), 'Retained fixture file changed: ' + path);
  }
}
async function serve(server) {
  servers.add(server);
  server.on('connection', socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => { server.off('error', fail); done(); });
  });
  return server;
}
async function shutdownServers() {
  for (const socket of sockets) socket.destroy();
  const closed = await Promise.allSettled([...servers].filter(server => server.listening).map(server =>
    new Promise((done, fail) => server.close(error => error ? fail(error) : done()))));
  servers.clear();
  const failures = closed.filter(value => value.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(value => value.reason), 'CHECKOUT_FIXTURE_SERVERS_CLOSE_FAILED');
}
async function api(path, body, method) {
  const response = await fetch(host.origin + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { authorization: 'Bearer ' + host.token, origin: host.origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(JSON.stringify({ path, status: response.status, value })),
    { code: 'CHECKOUT_API_FAILED', status: response.status });
  return value;
}
// This launcher can approve only its existing disposable native fixture.
// Read the SF62 review through the same authenticated route used by the browser.
async function approveBrowserFixture(taskId) {
  const path = '/api/job-checkout/checkouts/' + checkoutId + '/approval';
  const handoff = await readJson(handoffPath);
  assert.equal(handoff.job.id, jobId); assert.equal(handoff.purchase.orderReference, jobId);
  const body = Buffer.from(JSON.stringify({ jobId }));
  let snapshot;
  const deadline = Date.now() + 80000;
  while (Date.now() < deadline) {
    assert.equal(interrupted, false, 'Browser fixture was interrupted.');
    const current = await api(path);
    assert.equal(current.mode, 'BROWSER');
    assert.equal(current.checkoutId, checkoutId); assert.equal(current.intentId, intentId);
    if (current.snapshot?.state === 'AWAITING_OPERATOR') {
      assert.equal(current.taskId, taskId); assert.equal(current.executing, true);
      snapshot = current.snapshot; break;
    }
    const task = model.checkout.get(checkoutId).task;
    assert.equal(task?.id, taskId, 'Original checkout task changed while loading its live review.');
    assert.equal(task.state, 'RUNNING', JSON.stringify(task));
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(snapshot, 'Original SF62 browser review was not received.');
  assert.equal(snapshot.intentId, intentId);
  const expected = {
    schema: 'stellar-forge.sf62.operator-review.v1',
    request_id: intentId, actor: 'fixture-job-checkout', service: 'fixture-application-jobs',
    resource: origin + purchasePath + '?sf98_order=' + encodeURIComponent(jobId), method: 'POST',
    scheme: 'exact', network: 'stellar:testnet', asset: fixtureAsset, pay_to: fixturePayTo,
    max_atomic_units_to_reserve: '10000', max_timeout_seconds: 60,
    body_present: true, body_bytes: body.length, body_sha256: digest(body),
  };
  for (const [key, value] of Object.entries(expected))
    assert.equal(snapshot.review[key], value, 'Disposable native review changed: ' + key);
  assert.deepEqual(snapshot.review.complete_original_accepted_terms, handoff.purchase.payment);
  assert.match(snapshot.review.request_sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.review.accepted_terms_sha256, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.current_native_budget_estimate.approved, true);
  assert.equal(snapshot.current_native_budget_estimate.reserved_max_base_units, '10000');
  for (const key of ['max_single', 'max_total', 'max_per_utc_day',
    'max_per_actor_utc_day', 'max_per_service_utc_day'])
    assert.match(snapshot.current_native_budget_estimate.limit_remaining[key], /^(0|[1-9][0-9]*)$/);
  await immutable(join(fixture, 'browser-review.json'), jsonBytes(snapshot));
  const decision = { intent: intentId, approvalId: snapshot.id,
    requestSha256: snapshot.review.request_sha256, decision: 'approve', taskId };
  // A delayed decision from an earlier task must leave this live review unchanged.
  await assert.rejects(api(path, { ...decision, taskId: 'previous-checkout-task' }),
    error => error.status === 409 && error.message.includes('JOB_CHECKOUT_APPROVAL_TASK_CHANGED'));
  const unchanged = await api(path);
  assert.equal(unchanged.snapshot.id, snapshot.id);
  assert.equal(unchanged.snapshot.state, 'AWAITING_OPERATOR');
  const decided = await api(path, decision);
  assert.equal(decided.approval.snapshot.id, snapshot.id);
  assert.ok(['APPROVING', 'APPROVED'].includes(decided.approval.snapshot.state));
  progress('original browser decision accepted');
}

async function runCheckout(kind) {
  const before = await api('/api/job-checkout/checkouts/' + checkoutId);
  const started = await api('/api/job-checkout/checkouts/' + checkoutId + '/start', { kind, expectedRevision: before.revision });
  if (browserApproval && kind === 'execute') await approveBrowserFixture(started.task.id);
  const after = await model.checkout.wait(checkoutId);
  assert.equal(after.task.state, 'COMPLETE', JSON.stringify({ kind, phase: after.phase, error: after.lastError,
    nativeDirectory: after.nativeDirectory }));
  return after;
}
async function startWorkspace() {
  model = await openJobWorkspace({ directory, buyerRoots: [], fileRoots: [fixture], fetchImpl: transport,
    checkout: { operatorProfile: profilePath, runtimeDirectory, timeoutMs: 90000 } });
  host = await startJobCustomerWorkspace({ model, port: 0, browserApproval });
  const ready = await readJobWorkspaceLaunch({ directory, runtimeDirectory,
    operatorProfile: profilePath, pid: process.pid });
  assert.equal(ready.checkoutUrl, host.checkoutUrl);
  if (browserApproval) assert.equal(ready.intakeUrl, host.intakeUrl);
}
async function closeWorkspace() {
  try { await host?.close(); }
  finally {
    host = null;
    if (model) {
      const current = model;
      try {
        const closing = current.close();
        assert.equal(current.close(), closing, 'All close callers await the same native-child drain.');
        await closing;
      } finally { model = null; }
    }
  }
}
async function startMerchant() {
  merchant = await openJobMerchant({ configPath, directory: merchantState,
    env: {SF30_PREPARATION_PYTHON:process.env.SF_JOBS_CHECKOUT_PYTHON,SF30_JOB_TEMP:join(fixture,'job-temp')} });
  seller = await startJobSeller(merchant, { port: 0, operationsPort: 0,
    nativeFactory: compiled => createNativeSellerServer(compiled, {
      facilitatorClient: new HTTPFacilitatorClient({ url: 'http://127.0.0.1:' + facilitator.address().port }),
    }) });
  customer = await startCustomerServer({ model: merchant, port: 0,
    ...(browserApproval ? { intakeConfig: { enabled: true, functions: [functionId] } } : {}) });
}
async function closeMerchant() {
  const results = await Promise.allSettled([seller?.close(), customer?.close()]);
  seller = customer = null;
  try { await merchant?.close(); } catch (error) { results.push({ status: 'rejected', reason: error }); }
  merchant = null;
  const errors = results.filter(value => value.status === 'rejected').map(value => value.reason);
  if (errors.length) throw new AggregateError(errors, 'CHECKOUT_MERCHANT_CLOSE_FAILED');
}
async function transfer(path, body) {
  const ticket = await api(path, body), response = await fetch(host.origin + ticket.url);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, ticket.bytes); assert.equal(digest(bytes), ticket.sha256);
  return { bytes, sha256: ticket.sha256 };
}
let result,primaryFailure;
try{
 assert.equal(await nativeSdkVersion(),NATIVE_SDK_VERSION);
 const original=await originalSnapshot();
 const projectInfo=await project('seed',sourceProject);
 assert.equal(projectInfo.sourceSelection.records,6000);
 const configured=pipelineJobConfiguration({publicOrigin:origin,payment:{
  scheme:'exact',network:'stellar:testnet',asset:fixtureAsset,payTo:fixturePayTo,amount:'10000',maxTimeoutSeconds:60}});
 await mkdir(join(fixture,'job-temp'),{recursive:true,mode:0o700});
 await immutable(configPath,jsonBytes(configured));
  await immutable(join(fixture, 'signer.mjs'), Buffer.from([
    '// Disposable signer envelope for this one local original-protocol journey.',
    'export async function sign({ challenge, accepted }) {',
    "  if (challenge.resource?.url !== " + JSON.stringify(origin + purchasePath + '?sf98_order=' + encodeURIComponent(jobId)) + " ||",
    "      accepted.scheme !== 'exact' || accepted.network !== 'stellar:testnet' ||",
    "      accepted.asset !== " + JSON.stringify(fixtureAsset) + " || accepted.payTo !== " + JSON.stringify(fixturePayTo) + " ||",
    "      accepted.amount !== '10000') throw new Error('CHECKOUT_FIXTURE_TERMS_CHANGED');",
    "  return { x402Version: 2, resource: challenge.resource, accepted, extensions: challenge.extensions,",
    "    payload: { fixture: 'LOCAL_PAID_JOB_PROTOCOL', jobId: " + JSON.stringify(jobId) + " } };",
    '}', '',
  ].join('\n')));
  const profile = {
    operator: { python: process.env.SF_JOBS_CHECKOUT_PYTHON, actor: 'fixture-job-checkout',
      service: 'fixture-application-jobs', policy: join(fixture, 'policy.json'), ledger: join(fixture, 'ledger.sqlite') },
    signerModule: join(fixture, 'signer.mjs'),
    buyerTransport: { mode: 'explicit-connect', origin, proxyEnv: 'SF_JOBS_CHECKOUT_PROXY' },
  };
  await immutable(profilePath, jsonBytes(profile));

  const counterPath = join(fixture, 'facilitator.json');
  let counters = await exists(counterPath) ? await readJson(counterPath) :
    { operation, verifies: 0, settles: 0, paymentSha256: null };
  assert.equal(counters.operation, operation);
  let counterTail = Promise.resolve();
  facilitator = await serve(httpServer((request, response) => {
    const action = counterTail.then(async () => {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length; assert.ok(size <= 262144); chunks.push(chunk);
      }
      const value = size ? JSON.parse(Buffer.concat(chunks)) : null;
      let result;
      if (request.url === '/supported') result = {
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'stellar:testnet' }], extensions: ['bazaar'], signers: {},
      };
      else if (['/verify', '/settle'].includes(request.url)) {
        for (const field of ['scheme', 'network', 'asset', 'payTo', 'amount', 'maxTimeoutSeconds'])
          assert.equal(value.paymentRequirements[field], configured.functions[functionId].payment[field]);
        assert.deepEqual(value.paymentPayload.payload, { fixture: 'LOCAL_PAID_JOB_PROTOCOL', jobId });
        const paymentSha256 = digest(JSON.stringify(value.paymentPayload));
        if (counters.paymentSha256) assert.equal(paymentSha256, counters.paymentSha256);
        counters.paymentSha256 = paymentSha256;
        if (request.url === '/verify') {
          counters.verifies++;
          result = { isValid: true, payer: fixturePayer };
        } else {
          counters.settles++;
          result = { success: true, network: 'stellar:testnet',
            transaction: digest(operation + ':' + jobId), payer: fixturePayer };
        }
        await writeJson(counterPath, counters);
      }
      response.writeHead(result ? 200 : 404, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result ?? {}));
    });
    counterTail = action.catch(() => {});
    action.catch(() => { if (!response.headersSent) response.writeHead(500); response.end('{}'); });
  }));
  await startMerchant();

  frontend = await serve(httpsServer({
    key: await readFile(join(fixture, 'tls', 'tls.key')), cert: await readFile(join(fixture, 'tls', 'tls.pem')),
    minVersion: 'TLSv1.2',
  }, (request, response) => {
    const allowedPurchase = request.method === 'POST' &&
      request.url === purchasePath + '?sf98_order=' + encodeURIComponent(jobId);
    const allowedGet = request.method === 'GET' &&
      ['/jobs/' + encodeURIComponent(jobId), '/jobs/' + encodeURIComponent(jobId) + '/result'].includes(request.url);
    const allowedIntake = browserApproval && (request.method === 'GET' && request.url === CATALOG_PATH ||
      request.method === 'POST' && [REQUEST_PATH, WITHDRAW_PATH].includes(request.url));
    const allowedInput = inputFilesMode && isInputRoute(request.url) && ['POST', 'PUT', 'GET', 'HEAD', 'DELETE'].includes(request.method);
    if (request.headers.host !== 'jobs-merchant.example' || !(allowedPurchase || allowedGet || allowedIntake || allowedInput)) {
      response.writeHead(404); response.end(); return;
    }
    if (allowedGet) traffic[request.url.endsWith('/result') ? 'result' : 'status']++;
    if (allowedIntake) traffic[request.url === CATALOG_PATH ? 'intakeCatalog' :
      request.url === REQUEST_PATH ? 'intakePrepare' : 'intakeWithdraw']++;
    const target = new URL(allowedGet || allowedIntake || allowedInput ? customer.url : seller.url);
    const forwarded = httpRequest({ hostname: '127.0.0.1', port: target.port, method: request.method,
      path: request.url, headers: { ...request.headers, connection: 'close' }, agent: false }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
    });
    request.once('aborted', () => forwarded.destroy());
    forwarded.once('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(forwarded);
  }));
  proxy = await serve(httpServer((_request, response) => { response.writeHead(405); response.end(); }));
  proxy.on('connect', (request, socket, head) => {
    if (request.url !== 'jobs-merchant.example:443' || head.length) { socket.destroy(); return; }
    traffic.connects++;
    const upstream = connect({ host: '127.0.0.1', port: frontend.address().port });
    sockets.add(upstream); upstream.once('close', () => sockets.delete(upstream));
    upstream.once('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.once('error', () => socket.destroy());
    socket.once('error', () => upstream.destroy());
    socket.once('close', () => upstream.destroy());
  });
  process.env.SF_JOBS_CHECKOUT_PROXY = 'http://127.0.0.1:' + proxy.address().port;
  transport = createPublicHttpsFetch({ trustedProxy: profile.buyerTransport, timeoutMs: 30000 });

 await startWorkspace();
 course=await openCommissioningCourse({directory:fixture,project:projectInfo,python,immutable,
  customer:{directory,runtimeDirectory,operatorProfile:profilePath}});
 const selected=await course.prepare({merchantOrigin:origin,reference:jobId,label:'Original supplier pipeline commissioning'});
 progress('full prepared order and two sealed Request files retained');
 const requestPath='/api/job-intake/requests/'+selected.request.requestId;
 let request=await api(requestPath);
 if(request.phase!=='IMPORTED'){
  await api(requestPath+'/start',{kind:'prepare',expectedRevision:request.revision});
  const prepared=await model.intake.wait(request.id);
  assert.equal(prepared.task.state,'COMPLETE',JSON.stringify(prepared.lastError));
  request=await api(requestPath);
 }
 assert.equal(request.phase,'IMPORTED');assert.equal(request.reference,jobId);
 assert.equal(request.checkoutId,checkoutId);
 const ticketBytes=await model.intake.ticket(request.id),ticket=readJobCheckoutTicket(ticketBytes);
 assert.equal(ticket.id,checkoutId);
 await immutable(handoffPath,ticketBytes);
 let checked=await api('/api/job-checkout/checkouts/'+checkoutId);
 if(checked.attempted)checked=await runCheckout('recover');
 if(!checked.attempted&&checked.phase!=='REVIEWED')checked=await runCheckout('review');
 if(!checked.attempted&&checked.phase==='REVIEWED')checked=await runCheckout('execute');
 assert.equal(checked.phase,'ACCEPTED',JSON.stringify(checked.lastError));
 assert.equal(checked.native.status,'DELIVERED_REPORTED_SETTLED');
 const entryId=checked.jobEntryId;
 let job=await merchant.get(jobId);
 if(['FAILED','INTERRUPTED','CANCELLED'].includes(job.state))await merchant.retry({id:jobId,
  expectedRevision:job.revision,reason:'Continue this original commissioned pipeline execution after interruption.'});
 await merchant.startWorker();
 await api('/api/job-workspace/jobs/'+entryId+'/start',{kind:'fetch',deadlineMs:600000,pollMs:100});
 const delivered=await model.wait(entryId);
 assert.equal(delivered.task.state,'COMPLETE',JSON.stringify(delivered.lastError));
 assert.equal(delivered.resource.status,'VERIFIED');
 const packageSelection=await api('/api/job-workspace/jobs/'+entryId+'/outputs');
 assert.equal(packageSelection.received,true);assert.equal(packageSelection.job.id,jobId);
 assert.equal(packageSelection.job.functionId,'executePipeline');
 assert.equal(packageSelection.files.length,4);
 job=await merchant.get(jobId);
 assert.deepEqual(packageSelection.job.nativeSettlement,job.nativeSettlement);
 const downloaded=await transfer('/api/resources/'+delivered.resource.id+'/download',{});
 assert.equal(downloaded.sha256,packageSelection.package.sha256);
 const expected=packageSelection.package;
 const acceptedJob=packageSelection.job;
 const receive=await course.receive({bytes:downloaded.bytes,expected,job:acceptedJob});
 const validation=await project('verify',receive.editableDirectory);
 assert.equal(validation.records,6000);assert.equal(validation.exceptions,4000);
 await immutable(join(fixture,'result-expected.json'),jsonBytes(expected));
 await immutable(join(fixture,'result-job.json'),jsonBytes(acceptedJob));
 // Close and reopen the same original Request customer. The prepared order and
 // accepted purchase remain untouched; the facade refreshes only its current URL.
 const priorRequestId=request.id,priorAttempts=request.requestAttempts;
 const originalAttempt=digest(await readFile(join(checked.nativeDirectory,'attempt.json')));
 const originalOutbox=(await merchant.deliveryOutbox.rows()).map(x=>x.event.id);
 await closeWorkspace();await startWorkspace();
 const restarted=await course.prepare({merchantOrigin:origin,reference:jobId,label:'Original supplier pipeline commissioning'});
 assert.equal(restarted.request.requestId,priorRequestId);
 assert.equal(restarted.request.request.requestAttempts,priorAttempts);
 assert.equal(restarted.request.request.checkoutId,checkoutId);
 assert.equal(digest(await readFile(join(checked.nativeDirectory,'attempt.json'))),originalAttempt);
 assert.deepEqual((await merchant.deliveryOutbox.rows()).map(x=>x.event.id),originalOutbox);
 assert.equal(counters.verifies,1);assert.equal(counters.settles,1);
 progress('complete paid result and original Request restart received');
 const browserLink=await startPreparation();
 const {chromium}=await import(marker.browserModule);
 browser=await chromium.launch({executablePath:marker.browserExecutable,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();
 await page.goto(browserLink.url,{waitUntil:'domcontentloaded'});
 const reviewDirectory=join(fixture,'browser-runs',String(Date.now()));
 await mkdir(reviewDirectory,{recursive:true,mode:0o700});
 const browserResult=await reviewCommissioningBrowser({page,directory:reviewDirectory,
  pipelineId:projectInfo.pipeline.id,revision:1,reportName:'Original supplier pipeline browser review',
  packagePath:receive.packagePath,expectedPath:join(fixture,'result-expected.json'),jobPath:join(fixture,'result-job.json'),
  requestUrl:restarted.request.requestUrl,immutable});
 await browser.close();browser=null;
 await closePreparation();
 // The delivered editable customer remains separate from the browser's copy.
 // Continue it with the original SQL engine, then reopen through the facade.
 const advanced=await project('advance',receive.editableDirectory);
 const reopened=await course.reopen({expected,job:acceptedJob});
 assert.equal(reopened.workspace.directory,receive.editableDirectory);
 const after=await project('verify',receive.editableDirectory);
 assert.equal(after.currentRevision,2);assert.equal(after.originalExecutionSha256,advanced.originalExecutionSha256);
 const summary=course.summary();assert.equal(summary.tools.length,9);
 await course.close();course=null;
 assert.deepEqual(await originalSnapshot(),original);
 assert.equal(counters.verifies,1);assert.equal(counters.settles,1);
 result={schema:'stellar-forge.preparation-commissioning-native-result.v1',operation,phase,result:'PASS',
  originalCheckout:{path:checkoutSource,sha256:marker.originalCheckoutSha256,jobId:'output-files:2026.10'},
  fixtureDirectory:fixture,jobId,functionId,checkout:{id:checkoutId,entryId,attemptSha256:originalAttempt},
  request:{id:priorRequestId,reference:jobId,requestAttempts:priorAttempts,files:restarted.request.files},
  merchant:{nativeSdk:NATIVE_SDK_VERSION,verifies:counters.verifies,settles:counters.settles,outbox:originalOutbox},
  prepared:{orderSha256:selected.order.orderSha256,files:selected.order.files,read:selected.read},
  package:{...expected,manifestSha256:packageSelection.manifestSha256},job:acceptedJob,
  mcp:{...summary,read:receive.read},validation,advanced,browser:browserResult,
  originalSnapshotSha256:digest(JSON.stringify(original)),traffic};
 complete=true;
}catch(error){primaryFailure=error;throw error;}
finally{
 const errors=[];
 for(const close of [()=>browser?.close(),()=>course?.close(),closePreparation,closeWorkspace,closeMerchant,shutdownServers]){
  try{await close();}catch(e){errors.push(e);}
 }
 for(const h of children){h.child.kill('SIGTERM');try{await h.done;}catch(e){errors.push(e);}}
 process.off('SIGINT',stop);process.off('SIGTERM',stop);
 if(errors.length)throw new AggregateError(primaryFailure?[primaryFailure,...errors]:errors,
  'Commissioning native execution and owner cleanup',{cause:primaryFailure??errors[0]});
}
assert.equal(complete,true);await writeJson(output,result);progress('complete original commissioning result saved');
