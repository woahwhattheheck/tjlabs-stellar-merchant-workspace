#!/usr/bin/env node
/**
 * One source-owned local merchant workflow: tariff planning, original pricing,
 * both HTTP entry points, native backup/restore, portfolio receiving and the
 * original Merchant Pricing MCP operation on the same saved workspace.
 *
 * Run from any directory:
 *   node native-workflow.mjs --source-root ABSOLUTE_SF97_DIRECTORY --output NEW_PRIVATE_DIRECTORY
 *
 * The SF97 directory supplies the repository's unchanged illustrative seller,
 * observation and terms fixtures. Operation inputs are retained before writes.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const FIXTURES = Object.freeze({
  'illustrative-service.json':'e882bac9ecf5f68ed47a23b097969bd0aded40c0',
  'illustrative-native-shape-snapshot.json':'fdcd6a2621003c90398430d1bef02283fd57243d',
  'example-terms.json':'fd37ff4d0c6cdd9eea42c102edaf2b81f0de25e7'
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';
let operationDirectory;

function argumentsFor(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index], value = argv[index + 1];
    if (!['--source-root','--output'].includes(name) || Object.hasOwn(values,name) ||
        typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value)
      throw new Error('Use --source-root ABSOLUTE_SF97_DIRECTORY --output NEW_PRIVATE_DIRECTORY.');
    values[name] = value;
  }
  if (!values['--source-root'] || !values['--output'])
    throw new Error('Both --source-root and --output are required.');
  return {sourceRoot:values['--source-root'],output:values['--output']};
}
async function jsonFile(path, value) {
  await writeFile(path, encode(value), {flag:'wx',mode:0o600});
}
async function exactFile(path, bytes) {
  await writeFile(path, bytes, {flag:'wx',mode:0o600});
}
function comparison(review, tariffId, quantity) {
  const row = review.comparisons.find(item => item.tariffId === tariffId && item.quantity === quantity);
  assert.ok(row, 'The requested original comparison must exist.');
  return row;
}
async function response(url, headers = {}) {
  const result = await fetch(url, {
    headers, redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)
  });
  assert.equal(result.status, 200, 'The local workspace request must succeed: ' + new URL(url).pathname);
  return result;
}

async function main() {
  process.umask(0o077);
  const {sourceRoot,output} = argumentsFor(process.argv.slice(2));
  assert.equal(await realpath(sourceRoot), sourceRoot, 'Use the real original source directory.');
  const fixtureBytes = {}, fixtures = [];
  for (const [name,expected] of Object.entries(FIXTURES)) {
    const bytes = await readFile(join(sourceRoot,name));
    assert.equal(gitBlob(bytes), expected, 'Use the unchanged repository fixture: ' + name);
    fixtureBytes[name] = bytes;
    fixtures.push({name,gitBlob:expected,sha256:sha256(bytes),bytes:bytes.length});
  }
  const importedPaths = [
    'analyze.mjs','workspace/model.mjs','workspace/server.mjs',
    'planning/scenarios.mjs','planning/workspace.mjs','economics/archive.mjs',
    'tariffs/model.mjs','tariffs/workspace.mjs','tariffs/server.mjs','tariffs/client.mjs',
    'tariffs/public/index.html','tariffs/public/browser.mjs','tariffs/public/style.css'
  ];
  const sourceFiles = [];
  for (const name of importedPaths) {
    const bytes = await readFile(join(sourceRoot,name));
    sourceFiles.push({name,gitBlob:gitBlob(bytes),sha256:sha256(bytes),bytes:bytes.length});
  }
  const imported = async name => import(pathToFileURL(join(sourceRoot,name)).href);
  const {openWorkspace} = await imported('workspace/model.mjs');
  const {startWorkspace} = await imported('workspace/server.mjs');
  const {openTariffWorkspace} = await imported('tariffs/workspace.mjs');
  const {startTariffServer} = await imported('tariffs/server.mjs');
  const {createTariffClient} = await imported('tariffs/client.mjs');
  const {inspectCostWorkspaceRestore,restoreCostWorkspace} = await imported('economics/archive.mjs');

  await mkdir(output,{mode:0o700});
  operationDirectory = output;
  const operation = {
    schema:'stellar-forge.merchant-tariff-native-operation.v1',
    startedAt:new Date().toISOString(),sourceRoot,fixtures,sourceFiles,
    seedRequestId:randomUUID(),tariffRequestId:randomUUID(),
    scenarioRequestId:randomUUID(),pricingRequestId:randomUUID(),
    repricingRequestId:randomUUID(),backupRequestId:randomUUID()
  };
  await jsonFile(join(output,'operation.json'),operation);
  const options = {
    config:join(sourceRoot,'illustrative-service.json'),
    snapshot:join(sourceRoot,'illustrative-native-shape-snapshot.json'),
    directory:join(output,'pricing')
  };
  async function opened(directory = options.directory) {
    const model = await openWorkspace({...options,directory});
    return {model,tariffs:await openTariffWorkspace({model,directory})};
  }
  let active = await opened();
  const originalTerms = JSON.parse(fixtureBytes['example-terms.json'].toString('utf8'));
  const routeFields = ['unitPriceUsd','priceBasis','perFulfilledUsd','perChallengeUsd','monthlyPaidTarget'];
  const commercial = {
    merchantName:originalTerms.merchantName,sharedMonthlyFixedUsd:originalTerms.sharedMonthlyFixedUsd,
    routes:Object.fromEntries(Object.entries(originalTerms.routes).map(([id,term]) =>
      [id,Object.fromEntries(routeFields.map(field => [field,term[field]]))]))
  };
  const initial = await active.model.state();
  assert.ok(initial.snapshot, 'The original fixture snapshot must be captured.');
  const seedRequest = {
    requestId:operation.seedRequestId,expectedRevision:initial.revision,
    label:'Repository fixture original pricing',sellerSha256:initial.seller.sha256,
    snapshotSha256:initial.snapshot.sha256,commercial
  };
  await jsonFile(join(output,'seed-request.json'),seedRequest);
  const seed = await active.model.save(seedRequest);
  await jsonFile(join(output,'seed-result.json'),seed);
  const originalSource = await active.tariffs.source(seed.version);
  const routeId = originalSource.routes.find(route => route.routeId === 'dataset')?.routeId;
  assert.equal(routeId, 'dataset', 'Use the original repository seller route.');

  const commonTiers = [{upTo:'1000',unitPriceUsd:'0.012'},{upTo:null,unitPriceUsd:'0.009'}];
  const previewInput = {
    version:seed.version,
    tariffs:[
      {id:'graduated',label:'Graduated fixture requests',routeId,mode:'graduated',tiers:commonTiers},
      {id:'volume',label:'Volume fixture requests',routeId,mode:'volume',tiers:commonTiers},
      {id:'fractional',label:'Fractional uniform quote',routeId,mode:'graduated',
        tiers:[{upTo:'2',unitPriceUsd:'0.01'},{upTo:null,unitPriceUsd:'0.005'}]}
    ],
    volumes:['0','3','1000','1001','1250']
  };
  const preview = await active.tariffs.preview(previewInput);
  const review = preview.review;
  assert.equal(comparison(review,'graduated','1250').quote.totalUsd,'14.25');
  assert.equal(comparison(review,'volume','1250').quote.totalUsd,'11.25');
  assert.equal(comparison(review,'volume','1000').quote.totalUsd,'12');
  assert.equal(comparison(review,'volume','1001').quote.totalUsd,'9.009');
  assert.equal(comparison(review,'fractional','3').quote.chosenUniformQuoteUsd,'0.008334');
  assert.equal(comparison(review,'fractional','3').quote.roundingDeltaUsd,'0.000002');
  assert.equal(comparison(review,'graduated','0').scenario,null);
  await jsonFile(join(output,'tariff-preview-input.json'),previewInput);
  await jsonFile(join(output,'tariff-preview.json'),preview);
  const tariffRequest = {
    ...previewInput,requestId:operation.tariffRequestId,label:'Repository fixture tariff portfolio',
    tariffReviewSha256:review.tariffReviewSha256
  };
  await jsonFile(join(output,'tariff-save-request.json'),tariffRequest);
  const saved = await active.tariffs.save(tariffRequest);
  const savedReplay = await active.tariffs.save(tariffRequest);
  assert.equal(saved.planId,operation.tariffRequestId);
  assert.equal(savedReplay.planId,saved.planId);
  assert.equal(savedReplay.recovered,true);
  await jsonFile(join(output,'tariff-save-result.json'),saved);
  const chosen = comparison(saved.record.review,'graduated','1250');
  const selection = await active.tariffs.selection({planId:saved.planId,comparisonId:chosen.id});
  assert.equal(selection.pricingInput.commercial.routes[routeId].unitPriceUsd,'0.0114');
  const commitRequest = {
    selection,planRequestId:operation.scenarioRequestId,pricingRequestId:operation.pricingRequestId
  };
  await jsonFile(join(output,'selection-request.json'),commitRequest);

  // A fresh original model has no in-memory capture. The retained exact source
  // must recover the capture when the original native pricing save needs it.
  active = await opened();
  const committed = await active.tariffs.commitSelection(commitRequest);
  await jsonFile(join(output,'selection-result.json'),committed);
  active = await opened();
  const recovered = await active.tariffs.commitSelection(commitRequest);
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.pricing.version,committed.pricing.version);
  assert.equal(recovered.scenarioPlan.planId,operation.scenarioRequestId);

  const pricingTerms = await active.tariffs.downloadPricing(committed.pricing.version,'terms.json');
  const chosenTerms = JSON.parse(pricingTerms.toString('utf8'));
  assert.equal(chosenTerms.routes[routeId].unitPriceUsd,'0.0114');
  assert.equal(chosenTerms.routes[routeId].monthlyPaidTarget,1250);
  assert.equal(chosenTerms.routes[routeId].perFulfilledUsd,originalTerms.routes[routeId].perFulfilledUsd);
  await exactFile(join(output,'selected-pricing-terms.json'),pricingTerms);
  const repricingSource = await active.tariffs.repricingSource(committed.pricing.version);
  const payment = repricingSource.routes.find(route => route.routeId === routeId).paymentOptions[0];
  const repricingInput = {
    version:committed.pricing.version,sellerSha256:repricingSource.sellerSha256,
    quoteValuations:[{
      routeId,paymentIndex:0,expectedAmount:payment.atomicAmount,atomicUnits:'10000000',usd:'1',
      basis:'Explicit local fixture valuation: 10000000 illustrative units per USD.'
    }]
  };
  const repricingPreview = await active.tariffs.previewRepricing(repricingInput);
  assert.equal(repricingPreview.quoteConversion.rows[0].amount,'114000');
  const repricingRequest = {
    ...repricingInput,requestId:operation.repricingRequestId,
    expectedRevision:repricingSource.repricingRevision,label:'Selected fixture quote',
    reviewSha256:repricingPreview.reviewSha256
  };
  await jsonFile(join(output,'repricing-request.json'),repricingRequest);
  const repriced = await active.tariffs.saveRepricing(repricingRequest);
  const repricedReplay = await active.tariffs.saveRepricing(repricingRequest);
  assert.equal(repricedReplay.decision,repriced.decision);
  assert.equal(repricedReplay.recovered,true);
  await jsonFile(join(output,'repricing-result.json'),repriced);
  const sellerBytes = await active.tariffs.downloadRepricing(repriced.decision,'seller.json');
  assert.equal(JSON.parse(sellerBytes.toString('utf8')).routes[0].definition.payment.amount,'114000');
  await exactFile(join(output,'repriced-seller.json'),sellerBytes);
  const tariffFiles = {};
  for (const name of ['plan.json','tariffs.json','comparison.csv']) {
    tariffFiles[name] = await active.tariffs.download(saved.planId,name);
    await exactFile(join(output,'tariff-'+name),tariffFiles[name]);
  }
  const portfolio = await active.tariffs.bundle();
  await jsonFile(join(output,'tariff-portfolio.json'),portfolio);

  let standalone;
  try {
    standalone = await startTariffServer({workspace:active.tariffs,port:0});
    const launch = new URL(standalone.url); launch.hash = '';
    const page = await response(launch);
    assert.match(page.headers.get('content-type'),/^text\/html/);
    await page.text();
    const client = createTariffClient({url:standalone.url});
    const remoteState = await client.state();
    assert.equal(remoteState.pricing.revision,committed.pricing.revision);
    assert.equal((await client.source(seed.version)).version,seed.version);
    assert.equal((await client.load(saved.planId)).review.tariffReviewSha256,review.tariffReviewSha256);
    assert.equal((await client.bundle()).sha256,portfolio.sha256);
    const receivedCsv = await client.download(saved.planId,'comparison.csv');
    assert.deepEqual(Buffer.from(receivedCsv.bytes),tariffFiles['comparison.csv']);
    assert.equal((await client.repricingSource(committed.pricing.version)).version,committed.pricing.version);
  } finally {
    if (standalone) await standalone.close();
  }

  const backup = await active.model.economics.bundle({
    kind:'WORKSPACE_BACKUP',requestId:operation.backupRequestId
  });
  const archive = await active.model.economics.exportFile(operation.backupRequestId);
  const restoredDirectory = join(output,'received-pricing');
  const restoreReview = await inspectCostWorkspaceRestore({archive:archive.path,directory:restoredDirectory});
  assert.equal(restoreReview.sourceArchiveSha256,archive.sha256);
  const restored = await restoreCostWorkspace({
    archive:archive.path,directory:restoredDirectory,expectedArchiveSha256:restoreReview.sourceArchiveSha256
  });
  await jsonFile(join(output,'original-backup.json'),backup);
  await jsonFile(join(output,'original-restore.json'),restored);
  const receiving = await opened(restoredDirectory);
  const received = await receiving.tariffs.receive(portfolio);
  assert.equal(received.status,'TARIFF_PORTFOLIO_RECEIVED');
  assert.equal(received.plans.length,1);
  assert.equal(received.selections,1);
  await jsonFile(join(output,'portfolio-received.json'),received);

  let integrated;
  try {
    integrated = await startWorkspace({...options,directory:restoredDirectory,port:0});
    const page = await response(integrated.tariffsUrl);
    assert.match(page.headers.get('content-type'),/^text\/html/);
    await page.text();
    const bootstrap = await (await response(new URL('/api/state',integrated.url))).json();
    const headers = {'x-sf97-workspace':bootstrap.token};
    const sourceUrl = new URL('/api/tariffs/source',integrated.url);
    sourceUrl.searchParams.set('version',seed.version);
    assert.equal((await (await response(sourceUrl,headers)).json()).version,seed.version);
    const repricingUrl = new URL('/api/tariffs/repricing/source',integrated.url);
    repricingUrl.searchParams.set('version',committed.pricing.version);
    assert.equal((await (await response(repricingUrl,headers)).json()).version,committed.pricing.version);
    for (const asset of ['/tariffs/browser.mjs','/tariffs/style.css'])
      await (await response(new URL(asset,integrated.url))).arrayBuffer();
  } finally {
    if (integrated) await integrated.close();
  }

  const reopened = await opened(restoredDirectory);
  const reopenedPlan = await reopened.tariffs.load(saved.planId);
  assert.equal(reopenedPlan.review.tariffReviewSha256,review.tariffReviewSha256);
  const importedRecovery = await reopened.tariffs.commitSelection(commitRequest);
  assert.equal(importedRecovery.recovered,true);
  assert.equal(importedRecovery.pricing.version,committed.pricing.version);
  for (const name of Object.keys(tariffFiles))
    assert.deepEqual(await reopened.tariffs.download(saved.planId,name),tariffFiles[name]);
  assert.deepEqual(await reopened.tariffs.downloadPricing(committed.pricing.version,'terms.json'),pricingTerms);
  assert.deepEqual(await reopened.tariffs.downloadRepricing(repriced.decision,'seller.json'),sellerBytes);
  assert.equal((await reopened.tariffs.bundle()).sha256,portfolio.sha256);
  const result = {
    schema:'stellar-forge.merchant-tariff-native-result.v1',completedAt:new Date().toISOString(),
    status:'COMPLETE',operationDirectory:output,sourceRoot,
    tariffPlan:saved.planId,scenarioPlan:committed.scenarioPlan.planId,
    pricingVersion:committed.pricing.version,repricingDecision:repriced.decision,
    selected:{quantity:'1250',tariffGrossUsd:'14.25',uniformQuoteUsd:'0.0114',atomicAmount:'114000'},
    arithmetic:{volumeGrossUsd:'11.25',volumeBoundaryGrossUsd:['12','9.009'],
      fractionalUniformQuoteUsd:'0.008334',fractionalRoundingDeltaUsd:'0.000002'},
    recovery:{tariffSave:savedReplay.recovered,pricingSelection:recovered.recovered,
      repricing:repricedReplay.recovered,receivedSelection:importedRecovery.recovered},
    http:{standalone:'COMPLETE',integrated:'COMPLETE'},
    portfolio:{sha256:portfolio.sha256,plans:received.plans.length,selections:received.selections},
    originalBackup:{sha256:archive.sha256,bytes:archive.bytes,archive:archive.path},
    receivedDirectory:restoredDirectory,sourceFiles
  };
  const {runTariffMcpContinuation} = await import('./native-mcp-continuation.mjs');
  result.mcp = await runTariffMcpContinuation({sourceRoot,output,flowResult:result});
  await jsonFile(join(output,'flow-result.json'),result);
  process.stdout.write(encode(result));
}

main().catch(async failure => {
  const error = {code:failure.code ?? 'NATIVE_WORKFLOW_FAILED',message:failure.message,stack:failure.stack};
  if (operationDirectory)
    await jsonFile(join(operationDirectory,'flow-failure.json'),error).catch(() => {});
  process.stderr.write(encode({error,operationDirectory:operationDirectory ?? null}));
  process.exitCode = 1;
});
