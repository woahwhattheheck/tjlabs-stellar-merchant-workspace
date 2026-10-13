#!/usr/bin/env node
/** MIT. Additive receiving for an existing Reviewer's maintained Applications installation. */
import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join, isAbsolute} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';

const SCHEMA = 'stellar-forge.grant-reviewer-applications-receiving.v1';
const RESULT_SCHEMA = 'stellar-forge.grant-reviewer-applications-receiving-result.v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const now = () => new Date().toISOString();
const allowedReads = new Set(['bazaar_history','bazaar_results','bazaar_status','bazaar_read_result']);
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  assert(['--operation','--source-root','--runtime-directory','--playwright','--chromium',
    '--workbench-sha256','--merchant-sha256'].includes(key) && value && !value.startsWith('--'),
  'Use --operation ABS --source-root ABS --runtime-directory ABS --playwright ABS --chromium ABS --workbench-sha256 SHA256 --merchant-sha256 SHA256.');
  assert(!Object.hasOwn(options, key), 'Repeated option: ' + key);
  if (key.endsWith('-sha256')) assert(/^[a-f0-9]{64}$/.test(value), 'An exact original result SHA-256 is required.');
  else assert(isAbsolute(value) && resolve(value) === value, 'Use an absolute normalized path for ' + key);
  options[key] = value;
}
for (const key of ['--operation','--source-root','--runtime-directory','--playwright','--chromium',
  '--workbench-sha256','--merchant-sha256']) assert(options[key], key + ' is required.');
assert(Number(process.versions.node.split('.')[0]) >= 22, 'Use the maintained Node 22 or later runtime.');

const operation = options['--operation'], sourceRoot = options['--source-root'];
const source = relative => join(sourceRoot, relative);
const reviewerPrefix = 'stellar/scf_2026/presentation/reviewer/';
const {readSourceFile, writeSourceFile} = await import(pathToFileURL(source(reviewerPrefix + 'workspace.mjs')).href);
const {operationLease, privateDirectory} = await import(pathToFileURL(source(
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs')).href);
const {inspectMerchantRuntime} = await import(pathToFileURL(source(
  'stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs')).href);
const {receiveManagedGrantReviewer} = await import(pathToFileURL(source(
  reviewerPrefix + 'WORKBENCH_MANAGED_RECEIVING.mjs')).href);

await privateDirectory(operation);
let sourceLease, controllerLease, browser, context, page, browserTemp, state, primaryError;
let saving = Promise.resolve(), stopping = false, attempt, instance = null;
const secrets = new Set();
function safeText(value) {
  let text = String(value ?? '');
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[private access code]');
  return text;
}
const safeError = error => ({code:error.code ?? error.name ?? 'ERROR', message:safeText(error.message ?? error)});
const signal = () => { stopping = true; };
process.once('SIGINT', signal); process.once('SIGTERM', signal);
const check = () => assert(!stopping, 'The original Applications receiving was interrupted.');
const directory = join(operation, 'managed-applications');
const stateFile = join(directory, 'APPLICATIONS-STATE.json'), resultFile = join(directory, 'APPLICATIONS-RESULT.json');
const readPrivate = path => readSourceFile(path, {privateFile:true});
async function optional(path) {
  try { return await readPrivate(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function exact(path, bytes) {
  const old = await optional(path);
  if (old !== null) assert.deepEqual(old, bytes, 'The retained file has different bytes: ' + path);
  else await writeSourceFile(path, bytes);
  return {path, bytes:bytes.length, sha256:sha(bytes)};
}
async function verifyParents(binding) {
  for (const item of [binding.workbench, binding.merchant]) {
    const bytes = await readPrivate(item.path);
    assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256,
      'Preserve the completed original Workbench and Merchant results.');
  }
}
const save = () => {
  const bytes = json(state);
  // A failed earlier atomic save must not prevent retaining later cleanup.
  saving = saving.catch(() => {}).then(() => writeSourceFile(stateFile, bytes, {replace:true}));
  return saving;
};
async function api(connection, path) {
  check();
  const response = await fetch(connection.url + 'api/' + path, {
    redirect:'error', headers:{authorization:'Bearer ' + connection.accessToken}});
  const value = await response.json();
  assert(response.ok, 'Original workbench read failed with HTTP ' + response.status);
  return value;
}
async function idle() {
  await page.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true');
}
async function press(label) {
  check(); await page.getByRole('button', {name:label, exact:true}).click(); await idle();
}
async function view(label) { await press(label); await page.locator('main h2').first().waitFor({state:'visible'}); }
async function ensureBrowser() {
  if (browser) return;
  check();
  const module = await import(pathToFileURL(options['--playwright']).href);
  const chromium = module.chromium ?? module.default?.chromium;
  assert(chromium && typeof chromium.launch === 'function', 'The selected Playwright must expose Chromium.');
  browserTemp = await mkdtemp(join(tmpdir(), 'scf-reviewer-applications-'));
  browser = await chromium.launch({executablePath:options['--chromium'], headless:true,
    env:{...process.env,TMPDIR:browserTemp,TMP:browserTemp,TEMP:browserTemp},
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']});
  check();
  context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  page = await context.newPage();
  page.on('pageerror', error => { attempt.pageErrors.push(safeText(error.message)); });
  page.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      attempt.httpErrors.push({status:response.status(),path:url.pathname});
    }
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/' && request.method() === 'POST') {
      try {
        const rpc = request.postDataJSON();
        attempt.nativeReads.push({stage:state.activeStage,method:rpc.method,tool:rpc.params?.name ?? null,
          quoteId:rpc.params?.arguments?.quoteId ?? null});
      } catch {}
    }
  });
  await page.route('**/api/**', async route => {
    try {
      const request = route.request();
      if (request.method() !== 'POST') return await route.continue();
      const body = request.postDataJSON();
      if (!body?.requestId) return await route.continue();
      const input = {...body}; delete input.requestId;
      const url = new URL(request.url()), path = url.pathname;
      assert(instance && url.origin === new URL(instance.url).origin, 'Use only the selected original instance.');
      const key = sha(JSON.stringify({stage:state.activeStage,path,input,
        ...(['/api/open','/api/close'].includes(path) ? {instanceId:instance.instanceId} : {})}));
      let retained = state.requests[key];
      if (!retained) {
        retained = {requestId:body.requestId,path,inputSha256:sha(JSON.stringify(input)),
          stage:state.activeStage,instanceId:instance.instanceId};
        state.requests[key] = retained; await save();
      }
      if (stopping) return await route.abort('aborted');
      return await route.continue({postData:JSON.stringify({...body,requestId:retained.requestId})});
    } catch (error) {
      attempt.routeErrors.push(safeError(error));
      await route.abort('failed').catch(() => {});
    }
  });
}
async function savedResult(quote, stage) {
  check();
  await page.getByLabel('Original quote', {exact:true}).selectOption(quote.quoteId); await idle();
  await press('Read complete saved result');
  await page.getByRole('heading', {name:'Complete saved result',exact:true}).waitFor();
  const pending = page.waitForEvent('download').then(value => ({value}), error => ({error}));
  await press('Download complete JSON');
  const observed = await pending; if (observed.error) throw observed.error;
  const download = observed.value;
  assert.equal(await download.failure(), null, 'The complete saved result download failed.');
  const local = await download.path(); assert(local);
  const bytes = await readSourceFile(local);
  assert.equal(bytes.length, quote.bytes); assert.equal(sha(bytes), quote.sha256);
  const output = await exact(join(directory,'downloads',stage + '-' + quote.quoteId + '.json'),bytes);
  await download.delete();
  return {...output,quoteId:quote.quoteId};
}
async function nativeStatus(connection, quoteId) {
  check();
  const response = await fetch(connection.url, {method:'POST', redirect:'error',
    headers:{authorization:'Bearer ' + connection.accessToken,'content-type':'application/json',
      'mcp-protocol-version':'2025-11-25'},
    body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',
      params:{name:'bazaar_status',arguments:{quoteId}}})});
  const body = await response.json(); assert(response.ok && !body.error);
  const value = body.result.structuredContent ??
    JSON.parse(body.result.content.find(item => item.type === 'text').text);
  assert(!body.result.isError, 'The original status read returned a native error.');
  attempt.nativeReads.push({stage:state.activeStage,method:'tools/call',tool:'bazaar_status',quoteId});
  return value;
}
async function screenshot(stage, name, width) {
  await idle();
  const dimensions = await page.evaluate(() => ({
    width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert(dimensions.scroll <= dimensions.width + 1, 'The selected Reviewer viewport overflows.');
  const bytes = await page.screenshot({fullPage:false,animations:'disabled'});
  const receipt = await exact(join(directory,'screenshots',stage + '-' + name + '-' + width + '-' +
    sha(bytes).slice(0,16) + '.png'),bytes);
  return {...receipt,viewport:dimensions,name};
}
async function inspectLive(connection, stage) {
  state.activeStage = stage; instance = connection; secrets.add(connection.accessToken); await save();
  try {
    check(); await ensureBrowser();
    await page.goto(connection.url + '#' + encodeURIComponent(connection.accessToken));
    await page.locator('#workspace').waitFor({state:'visible'}); await idle();
    await page.locator('#selection').selectOption(state.input.selectionId); await idle();
    const before = await api(connection,'state');
    assert.equal(before.id,state.input.workbenchId);
    assert.equal(before.newPayments,0); assert.equal(before.signingConnected,false);
    const selected = before.selections.find(item => item.id === state.input.selectionId);
    assert(selected); assert.equal(selected.packet.sha256,state.input.packetSha256);
    assert.equal(selected.receipt.newPayments,0);
    assert.deepEqual([...selected.receipt.originalQuoteIds].sort(),[...state.input.originalQuoteIds].sort());
    await view('Source and query');
    if (!before.buyer.active) await press('Open original Buyer');
    else await view('Buyer results');
    const files = [], observations = [];
    for (const quote of state.input.results) {
      files.push(await savedResult(quote,stage));
      observations.push({quoteId:quote.quoteId,status:await nativeStatus(connection,quote.quoteId)});
    }
    const views = [];
    await page.setViewportSize({width:1440,height:1000}); await view('Buyer results');
    views.push(await screenshot(stage,'original-results',1440));
    await page.setViewportSize({width:390,height:844}); await view('Handover');
    views.push(await screenshot(stage,'original-handover',390));
    await page.setViewportSize({width:1440,height:1000});
    const after = await api(connection,'state');
    assert(after.buyer.active && after.buyer.selectionId === state.input.selectionId);
    assert.equal(after.newPayments,0);
    assert.deepEqual(attempt.pageErrors,[]); assert.deepEqual(attempt.routeErrors,[]); assert.deepEqual(attempt.httpErrors,[]);
    assert(attempt.nativeReads.filter(row => row.method === 'tools/call').every(row => allowedReads.has(row.tool)));
    await page.goto('about:blank');
    return {workbenchId:after.id,selectionId:state.input.selectionId,packetSha256:state.input.packetSha256,
      originalQuoteIds:selected.receipt.originalQuoteIds,completeResults:files,observations,views,newPayments:0};
  } catch (error) {
    const safe = safeError(error);
    throw Object.assign(new Error(safe.message),{code:safe.code});
  } finally { instance = null; }
}

try {
  sourceLease = await operationLease(source('SCF-SOURCE-LEASE'));
  controllerLease = await operationLease(join(operation,'controller.lock'));
  const workbenchPath = join(operation,'WORKBENCH-RESULT.json');
  const merchantPath = join(operation,'merchant-client','MERCHANT-RESULT.json');
  const originalBytes = await readPrivate(workbenchPath), merchantBytes = await readPrivate(merchantPath);
  assert.equal(sha(originalBytes),options['--workbench-sha256']);
  assert.equal(sha(merchantBytes),options['--merchant-sha256']);
  const original = JSON.parse(originalBytes), merchant = JSON.parse(merchantBytes);
  assert.equal(original.schema,'stellar-forge.grant-reviewer-receiving-result.v1');
  assert.equal(merchant.schema,'stellar-forge.grant-reviewer-merchant-receiving-result.v1');
  for (const value of [original,merchant]) {
    assert.equal(value.state,'COMPLETE'); assert.equal(value.newPaymentTransactions,0);
    assert.equal(value.ownedWorkbenchesClosed,true);
  }
  assert.equal(original.ownedBrowserClosed,true); assert.equal(merchant.ownedMerchantClosed,true);
  assert.equal(merchant.original.runId,original.runId); assert.equal(merchant.original.sha256,sha(originalBytes));
  assert.equal(original.operation,operation); assert.equal(original.sourceRoot,sourceRoot);
  const phases = original.phases;
  for (const name of ['second_operator_packet_intake','closed_native_export','source_owned_application_handoff',
    'original_native_receive','complete_primary_result','complete_earlier_result']) assert(phases[name]);
  const input = {
    workbenchDirectory:join(operation,'workbenches','receiver'),
    selectionId:phases.second_operator_packet_intake.selectionId,
    packetSha256:phases.closed_native_export.export.sha256,
    workbenchId:phases.source_owned_application_handoff.workbenchId,
    originalQuoteIds:phases.original_native_receive.receipt.originalQuoteIds,
    results:['complete_primary_result','complete_earlier_result'].map(name => ({
      quoteId:phases[name].quoteId,bytes:phases[name].bytes,sha256:phases[name].sha256}))
  };
  const header = JSON.parse(await readPrivate(join(input.workbenchDirectory,'workbench.json')));
  assert.equal(header.id,input.workbenchId);
  const binding = {operation,sourceRoot,runtimeDirectory:options['--runtime-directory'],runId:original.runId,
    workbench:{path:workbenchPath,bytes:originalBytes.length,sha256:sha(originalBytes)},
    merchant:{path:merchantPath,bytes:merchantBytes.length,sha256:sha(merchantBytes)}};
  await mkdir(directory,{mode:0o700}).catch(error => {if(error.code!=='EEXIST')throw error;});
  await privateDirectory(directory);
  for (const name of ['downloads','screenshots','source']) {
    await mkdir(join(directory,name),{mode:0o700}).catch(error => {if(error.code!=='EEXIST')throw error;});
    await privateDirectory(join(directory,name));
  }
  const previous = await optional(stateFile);
  state = previous ? JSON.parse(previous) : {schema:SCHEMA,id:randomUUID(),createdAt:now(),state:'CONTINUING',
    binding,input,requests:{},attempts:[],managed:{schema:'stellar-forge.grant-reviewer-managed-receiving.v1'}};
  assert.equal(state.schema,SCHEMA); assert.deepEqual(state.binding,binding); assert.deepEqual(state.input,input);
  const completedBytes = await optional(resultFile);
  if (completedBytes) {
    const completed = JSON.parse(completedBytes);
    assert.equal(completed.schema,RESULT_SCHEMA); assert.equal(completed.state,'COMPLETE');
    assert.equal(completed.id,state.id); assert.deepEqual(completed.binding,binding); assert.deepEqual(completed.input,input);
    assert.equal(completed.newPaymentTransactions,0); assert.equal(completed.ownedBrowserClosed,true);
    assert.equal(completed.managed.state,'COMPLETE');
    assert(completed.managed.cleanup.ownedApplicationClosed && completed.managed.cleanup.managedControllerClosed);
    for (const name of ['saved','connected','retained_launch','original_stop','prepared_restart','closed_reopen'])
      assert(completed.managed.steps[name], 'The original Applications lifecycle is incomplete.');
    for (const name of ['retained_launch','prepared_restart']) {
      const observed = completed.managed.steps[name].result;
      assert.equal(observed.completeResults.length,2); assert.equal(observed.views.length,2);
      for (const file of [...observed.completeResults,...observed.views]) {
        assert(typeof file.path==='string' && file.path.startsWith(directory+'/'));
        const bytes = await readPrivate(file.path);
        assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);
      }
    }
    await verifyParents(binding);
    if(state.state!=='COMPLETE') {state.state='COMPLETE';state.completedAt=completed.completedAt;await save();}
    process.stdout.write(JSON.stringify({state:'REUSED_COMPLETE',resultFile,sha256:sha(completedBytes),
      originalRunId:binding.runId,liveProcessClaim:false,newPaymentTransactions:0})+'\n');
  } else {
    const selected = await inspectMerchantRuntime(options['--runtime-directory'],{load:false});
    const runtimeBinding = Object.fromEntries(['directory','installationId','profileId','profileSha256',
      'lockSha256','sourceCommit','sourceManifestSha256','sourceRoot'].map(key => [key,selected[key]]));
    if (state.runtime) assert.deepEqual(state.runtime,runtimeBinding);
    else state.runtime=runtimeBinding;
    await exact(join(directory,'source','WORKBENCH-RESULT.json'),originalBytes);
    await exact(join(directory,'source','MERCHANT-RESULT.json'),merchantBytes);
    const ownSource = await readFile(fileURLToPath(import.meta.url));
    const helperSource = await readSourceFile(source(reviewerPrefix+'WORKBENCH_MANAGED_RECEIVING.mjs'));
    const code = {receiver:sha(ownSource),managedHelper:sha(helperSource)};
    if(state.sourceCodeSha256)assert.deepEqual(state.sourceCodeSha256,code);
    else state.sourceCodeSha256=code;
    attempt={id:randomUUID(),startedAt:now(),pageErrors:[],routeErrors:[],httpErrors:[],nativeReads:[]};
    state.attempts.push(attempt); state.state='CONTINUING'; delete state.error; await save();
    try {
      await receiveManagedGrantReviewer({operation,sourceRoot,runtimeDirectory:options['--runtime-directory'],
        workbenchDirectory:input.workbenchDirectory,selectionId:input.selectionId,
        packetSha256:input.packetSha256,workbenchId:input.workbenchId,record:state.managed,
        checkpoint:save,inspectLive,cancelled:()=>stopping});
      assert.equal(state.managed.state,'COMPLETE');
    } catch(error) {primaryError=error;}
    finally {
      // Attempt every owner close; a failed close never becomes a COMPLETE receipt.
      for (const [name,close] of [
        ['page',async()=>{if(page){await page.close();page=null;}}],
        ['context',async()=>{if(context){await context.close();context=null;}}],
        ['browser',async()=>{if(browser){await browser.close();browser=null;}}]]) {
        try {await close();} catch(error) {
          attempt.closeErrors??=[];attempt.closeErrors.push({owner:name,...safeError(error)});primaryError??=error;
        }
      }
      state.ownedBrowserClosed=!browser && !context && !page;
      if(browserTemp && state.ownedBrowserClosed) {
        try {await rm(browserTemp,{recursive:true,force:true});browserTemp=null;}
        catch(error){attempt.temporaryCleanupError=safeError(error);}
      }
      attempt.closedAt=now();attempt.ownedBrowserClosed=state.ownedBrowserClosed;
      state.state=primaryError?'CONTINUATION_REQUIRED':'FINALIZING';
      if(primaryError)state.error=safeError(primaryError);
      await save();
    }
    if(primaryError)throw primaryError;
    assert(state.ownedBrowserClosed);
    assert(state.managed.cleanup.ownedApplicationClosed && state.managed.cleanup.managedControllerClosed);
    await verifyParents(binding);
    state.completedAt??=now();state.state='FINALIZING';await save();
    const result={...state,schema:RESULT_SCHEMA,state:'COMPLETE',node:process.version,
      originalPurchaseTransactions:original.originalPurchaseTransactions,
      originalQuoteAttempts:original.originalQuoteAttempts,newPaymentTransactions:0,
      parentReceiptsPreserved:true};
    const receipt=await exact(resultFile,json(result));
    state.state='COMPLETE';await save();
    process.stdout.write(JSON.stringify({state:'COMPLETE',...receipt,originalRunId:binding.runId,
      applicationId:state.managed.applicationId,ownedBrowserClosed:true,
      ownedManagedApplicationClosed:true,newPaymentTransactions:0})+'\n');
  }
} catch(error) {
  if(state && state.state!=='COMPLETE') {
    state.state='CONTINUATION_REQUIRED';state.error=safeError(error);
    try {await save();} catch(saveError) {
      process.stderr.write(JSON.stringify({error:'STATE_SAVE_FAILED',detail:safeError(saveError)})+'\n');
    }
  }
  process.stderr.write(JSON.stringify({state:'CONTINUATION_REQUIRED',error:safeError(error),
    newPaymentTransactions:0})+'\n');process.exitCode=1;
} finally {
  process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);
  for(const held of [controllerLease,sourceLease])if(held)await held.close();
}
