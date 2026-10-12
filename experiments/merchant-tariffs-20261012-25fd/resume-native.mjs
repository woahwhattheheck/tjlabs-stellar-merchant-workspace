#!/usr/bin/env node
// MIT. Reopen the same completed Pricing phase and continue original MCP.
// Usage: node resume-native.mjs --native-run ABSOLUTE_NATIVE_DIRECTORY
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runTariffMcpContinuation} from './native-mcp-continuation.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const retain=async(p,v)=>{
  const b=Buffer.from(JSON.stringify(v,null,2)+'\n');
  try {await writeFile(p,b,{flag:'wx',mode:0o600});}
  catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(p),b);}
};
async function main(){
  process.umask(0o077);
  assert.equal(process.argv.length,4);
  assert.equal(process.argv[2],'--native-run');
  const output=resolve(process.argv[3]);assert.equal(await realpath(output),output);
  const operation=await json(join(output,'operation.json'));
  const sourceRoot=operation.sourceRoot;assert.equal(await realpath(sourceRoot),sourceRoot);
  const packet=await json(join(dirname(output),'source-packet.json'));
  assert.equal(packet.operation,'SCF-MERCHANT-TARIFFS-25FD-20261012');
  assert.equal(packet.fileCount,packet.files.length);
  for(const f of packet.files){
    const p=resolve(dirname(output),'source',f.path);
    assert.ok(p.startsWith(resolve(dirname(output),'source')+'/'));
    assert.equal(await realpath(p),p);
    const b=await readFile(p);assert.equal(b.length,f.bytes);assert.equal(git(b),f.gitBlob,f.path);
  }
  for(const f of [...operation.fixtures,...operation.sourceFiles]){
    const b=await readFile(join(sourceRoot,f.name));
    assert.equal(b.length,f.bytes);assert.equal(git(b),f.gitBlob);assert.equal(sha(b),f.sha256);
  }
  try {
    const previous=await json(join(output,'flow-result.json'));
    assert.equal(previous.status,'COMPLETE');
    assert.equal(previous.operationDirectory,output);assert.equal(previous.sourceRoot,sourceRoot);
    assert.equal(previous.tariffPlan,operation.tariffRequestId);
    const resumed=await runTariffMcpContinuation({sourceRoot,output,flowResult:previous});
    assert.deepEqual(resumed,previous.mcp);
    console.log(JSON.stringify(previous,null,2));return;
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  // Reopen only the existing saved UUIDs. Never generate a second selection,
  // backup, receipt or receiving workspace when recovering a failed caller.
  const committed=await json(join(output,'selection-result.json'));
  const commitRequest=await json(join(output,'selection-request.json'));
  const repriced=await json(join(output,'repricing-result.json'));
  const repricingRequest=await json(join(output,'repricing-request.json'));
  const tariffRequest=await json(join(output,'tariff-save-request.json'));
  const tariffSaved=await json(join(output,'tariff-save-result.json'));
  const portfolio=await json(join(output,'tariff-portfolio.json'));
  const received=await json(join(output,'portfolio-received.json'));
  const restored=await json(join(output,'original-restore.json'));
  const backup=await json(join(output,'original-backup.json'));
  assert.equal(tariffSaved.planId,operation.tariffRequestId);
  assert.equal(commitRequest.pricingRequestId,operation.pricingRequestId);
  assert.equal(committed.scenarioPlan.planId,operation.scenarioRequestId);
  assert.equal(repriced.requestId,operation.repricingRequestId);
  assert.equal(backup.requestId,operation.backupRequestId);
  assert.equal(received.status,'TARIFF_PORTFOLIO_RECEIVED');
  assert.equal(restored.directory,join(output,'received-pricing'));
  assert.equal(restored.sourceArchiveSha256,backup.sha256);
  const imported=n=>import(pathToFileURL(join(sourceRoot,n)).href);
  const {openWorkspace}=await imported('workspace/model.mjs');
  const {openTariffWorkspace}=await imported('tariffs/workspace.mjs');
  const options={config:join(sourceRoot,'illustrative-service.json'),
    snapshot:join(sourceRoot,'illustrative-native-shape-snapshot.json')};
  const model=await openWorkspace({...options,directory:join(output,'pricing')});
  const tariffs=await openTariffWorkspace({model,directory:join(output,'pricing')});
  const targetModel=await openWorkspace({...options,directory:restored.directory});
  const target=await openTariffWorkspace({model:targetModel,directory:restored.directory});
  const recovered=await tariffs.commitSelection(commitRequest);
  const importedRecovery=await target.commitSelection(commitRequest);
  assert.equal(recovered.recovered,true);assert.equal(importedRecovery.recovered,true);
  assert.equal(recovered.pricing.version,committed.pricing.version);
  assert.equal(importedRecovery.pricing.version,committed.pricing.version);
  const savedReplay=await tariffs.save(tariffRequest);
  const repricedReplay=await tariffs.saveRepricing(repricingRequest);
  assert.equal(savedReplay.recovered,true);assert.equal(repricedReplay.recovered,true);
  assert.equal((await tariffs.bundle()).sha256,portfolio.sha256);
  assert.equal((await target.bundle()).sha256,portfolio.sha256);
  for(const [name,file] of [['plan.json','tariff-plan.json'],['tariffs.json','tariff-tariffs.json'],['comparison.csv','tariff-comparison.csv']]){
    const b=await readFile(join(output,file));
    assert.deepEqual(await tariffs.download(tariffSaved.planId,name),b);
    assert.deepEqual(await target.download(tariffSaved.planId,name),b);
  }
  const terms=await target.downloadPricing(committed.pricing.version,'terms.json');
  assert.deepEqual(terms,await readFile(join(output,'selected-pricing-terms.json')));
  const seller=await target.downloadRepricing(repriced.decision,'seller.json');
  assert.deepEqual(seller,await readFile(join(output,'repriced-seller.json')));
  const archive=await model.economics.exportFile(operation.backupRequestId);
  const bytes=await readFile(archive.path);
  assert.equal(sha(bytes),backup.sha256);assert.equal(bytes.length,backup.bytes);
  const {startTariffServer}=await imported('tariffs/server.mjs');
  const {startWorkspace}=await imported('workspace/server.mjs');
  let server;
  try{
    server=await startTariffServer({workspace:tariffs,port:0});
    assert.equal((await fetch(server.url)).status,200);
  }finally{if(server)await server.close();}
  server=null;
  try{
    server=await startWorkspace({...options,directory:restored.directory,port:0});
    assert.equal((await fetch(server.tariffsUrl)).status,200);
  }finally{if(server)await server.close();}
  const chosen=tariffSaved.record.review.comparisons.find(v=>v.id===commitRequest.selection.comparisonId);
  assert.ok(chosen);const rows=tariffSaved.record.review.comparisons;
  const q=(id,n)=>rows.find(v=>v.tariffId===id&&v.quantity===n).quote;
  const result={schema:'stellar-forge.merchant-tariff-native-result.v1',
    completedAt:new Date().toISOString(),status:'COMPLETE',operationDirectory:output,sourceRoot,
    tariffPlan:tariffSaved.planId,scenarioPlan:committed.scenarioPlan.planId,
    pricingVersion:committed.pricing.version,repricingDecision:repriced.decision,
    selected:{quantity:chosen.quantity,tariffGrossUsd:chosen.quote.totalUsd,
      uniformQuoteUsd:JSON.parse(terms).routes.dataset.unitPriceUsd,
      atomicAmount:JSON.parse(seller).routes[0].definition.payment.amount},
    arithmetic:{volumeGrossUsd:q('volume','1250').totalUsd,
      volumeBoundaryGrossUsd:[q('volume','1000').totalUsd,q('volume','1001').totalUsd],
      fractionalUniformQuoteUsd:q('fractional','3').chosenUniformQuoteUsd,
      fractionalRoundingDeltaUsd:q('fractional','3').roundingDeltaUsd},
    recovery:{tariffSave:savedReplay.recovered,pricingSelection:recovered.recovered,
      repricing:repricedReplay.recovered,receivedSelection:importedRecovery.recovered},
    http:{standalone:'COMPLETE',integrated:'COMPLETE'},
    portfolio:{sha256:portfolio.sha256,plans:received.plans.length,selections:received.selections},
    originalBackup:{sha256:archive.sha256,bytes:archive.bytes,archive:archive.path},
    receivedDirectory:restored.directory,sourceFiles:operation.sourceFiles};
  result.mcp=await runTariffMcpContinuation({sourceRoot,output,flowResult:result});
  await retain(join(output,'flow-result.json'),result);
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(JSON.stringify({code:e.code??'TARIFF_RESUME_FAILED',message:e.message,stack:e.stack},null,2));process.exitCode=1;});
