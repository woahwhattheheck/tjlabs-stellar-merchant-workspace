// MIT. Operate the selected retained programme through the original Results console.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

const config=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(config.schema,'stellar-forge.iati-programme-browser-selection.v1');
for(const key of ['sourceRoot','output','playwright','chromium','connectionFile'])
  assert.ok(isAbsolute(config[key]),'Select the actual absolute '+key);
for(const key of ['operationId','project','editionSha256','expectedUiSha256','reviewer','reviewNote'])
  assert.equal(typeof config[key],'string','Select '+key);
assert.ok(Number.isSafeInteger(config.revision)&&config.revision>0);
assert.match(config.source.sha256,/^[0-9a-f]{64}$/);
assert.ok(Number.isSafeInteger(config.source.bytes)&&config.source.bytes>0);
assert.equal(config.source.sha256,'2bbc8f8a367f304c186a69e7e9b3a399118a472dcfd093a35dad1672a2347539');
assert.equal(config.source.bytes,21249);
assert.ok(config.reviewer.trim()&&config.reviewNote.trim());
const selection={operationId:config.operationId,project:config.project,revision:config.revision,
 editionSha256:config.editionSha256,source:config.source};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?'['+v.map(canonical).join(',')+']':
 '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'):JSON.stringify(v);
await mkdir(config.output,{recursive:true,mode:0o700});
const progressFile=join(config.output,'programme-browser-progress.json');
const resultFile=join(config.output,'programme-browser-result.json');
async function readOptional(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomicJson(path,value){const next=path+'.next';const f=await open(next,'w',0o600);
 try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(next,path);}
let progress=await readOptional(progressFile)??{schema:'stellar-forge.iati-programme-browser-progress.v1',selection,stages:{}};
assert.equal(canonical(progress.selection),canonical(selection),'Resume this same original programme selection.');
async function checkpoint(stage,value){progress.stages[stage]=value;progress.updatedAt=new Date().toISOString();
 await atomicJson(progressFile,progress);process.stdout.write(JSON.stringify({stage,state:'COMPLETE',project:config.project})+'\n');}
async function fileIdentity(path){const h=createHash('sha256');let bytes=0;const f=await open(path,'r');
 try{for await(const part of f.createReadStream()){h.update(part);bytes+=part.length;}}finally{await f.close();}
 return{file:path,bytes,sha256:h.digest('hex')};}
async function checkArtifacts(items){for(const item of Object.values(items))assert.deepEqual(await fileIdentity(item.file),item);}
const {IatiWorkspaceClient}=await import(pathToFileURL(join(config.sourceRoot,'iati','client.mjs')));
const privateUrl=(await readFile(config.connectionFile,'utf8')).trim();
const client=new IatiWorkspaceClient(privateUrl);
let browser,page,ui;
const errors=[];
const pm=name=>ui.locator('[data-pm="'+name+'"]');
async function idle(){await page.locator('#main').waitFor();await page.waitForFunction(()=>document.getElementById('main')?.getAttribute('aria-busy')==='false');}
async function clickPm(name){await pm(name).click();await idle();}
async function tab(name){await ui.locator('[data-tab="'+name+'"]').click();await idle();}
async function openSelectedProgramme(){
 await tab('programme');
 const sourceBox=pm('programme').locator('details').first();
 if(!await sourceBox.evaluate(node=>node.open))await sourceBox.locator('summary').first().click();
 await ui.locator('[data-project-id="'+config.project+'"] [data-pm="open-programme"]').click();await idle();
 await pm('programme-tab-framework').waitFor();
}
async function launch(){
 const selectedModule=await import(pathToFileURL(config.playwright));
 const chromium=selectedModule.chromium??selectedModule.default?.chromium;
 assert.equal(typeof chromium?.launchPersistentContext,'function','The selected installed Playwright module exposes Chromium.');
 browser=await chromium.launchPersistentContext(join(config.output,'browser-profile'),{
  executablePath:config.chromium,headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
 page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 ui=page.locator('[data-panel="results"]');
 const scriptResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/results.js'&&r.status()===200);
 await page.goto(privateUrl,{waitUntil:'domcontentloaded'});await idle();
 const script=await (await scriptResponse).body();
 assert.equal(hash(script),config.expectedUiSha256,'The browser must operate these exact complete UI postimages.');
 await page.getByRole('button',{name:'Results',exact:true}).click();await idle();
}
async function screenshot(name){const path=join(config.output,name);await page.screenshot({path,fullPage:true});return await fileIdentity(path);}
async function originalReceipt(stage){
 const input=progress.stages[stage+'Request'];if(!input)return null;
 let receipt=await client.resultsRequest(input.requestId);
 if(!receipt.found){
  const method=stage==='comparison'?'resultsCompare':'resultsSave';
  const response=await client[method](input);receipt={found:true,state:'COMPLETED',input,response};
 }
 assert.ok(receipt.found&&receipt.state!=='CANCELLED','The selected original request must complete.');
 assert.equal(canonical(receipt.input),canonical(input),'Reconcile the exact captured UI input.');
 return receipt.response;
}
async function saveThroughUi(stage,{interruptResponse=false}={}){
 if(progress.stages[stage]){
  const saved=progress.stages[stage];const actual=await client.resultsProject(config.project,{revision:saved.revision});
  assert.equal(actual.sha256,saved.sha256);return actual;
 }
 if(progress.stages[stage+'Request']){
  const actual=await originalReceipt(stage);
  await checkpoint(stage,{requestId:progress.stages[stage+'Request'].requestId,revision:actual.revision,sha256:actual.sha256});
  return actual;
 }
 let seen=null;
 await page.route('**/api/iati/results/save',async route=>{
  const input=route.request().postDataJSON();
  assert.equal(input.id,config.project);assert.ok(Number.isSafeInteger(input.expectedRevision));
  seen=input;await checkpoint(stage+'Request',input);
  if(interruptResponse){
   const response=await route.fetch();assert.ok(response.ok(),'Original save must reach its native result before interrupting the reply.');
   const value=await response.json();assert.equal(value.id,config.project);
   await checkpoint(stage+'Accepted',{requestId:input.requestId,revision:value.revision,sha256:value.sha256});
   await route.abort('failed');
  }else await route.continue();
 });
 try{await clickPm('save-programme');}finally{await page.unroute('**/api/iati/results/save');}
 assert.ok(seen,'The UI did not issue its complete original save request.');
 if(interruptResponse){
  await ui.getByRole('button',{name:'Read original result',exact:true}).waitFor();
  await browser.close();browser=null;
  await launch();
  await ui.getByRole('button',{name:'Read original result',exact:true}).waitFor();
  await ui.getByRole('button',{name:'Read original result',exact:true}).click();await idle();
  assert.equal(await ui.getByRole('button',{name:'Read original result',exact:true}).count(),0);
 }
 const actual=await originalReceipt(stage);
 await checkpoint(stage,{requestId:seen.requestId,revision:actual.revision,sha256:actual.sha256,
  ...(interruptResponse?{browserRestart:true,originalRequestRecovered:true}:{})});
 return actual;
}
try{
 const baseline=await client.resultsProject(config.project,{revision:config.revision});
 assert.equal(baseline.sha256,config.editionSha256);
 assert.ok(baseline.definition.sources.includes(config.source.sha256));
 const sourceResponse=await client.resultsOriginalSource(config.source.sha256);
 const sourceHash=createHash('sha256');let bytes=0;
 for await(const part of sourceResponse.body){sourceHash.update(part);bytes+=part.length;}
 assert.equal(bytes,config.source.bytes);assert.equal(sourceHash.digest('hex'),config.source.sha256);
 const originalReport=(await client.resultsReport(config.project,{revision:config.revision})).report;
 for(const [key,value]of Object.entries({activities:1,results:4,indicators:12,selectedPeriods:6,baselines:10,targets:0,actuals:12}))
  assert.equal(originalReport.counts[key],value,'Complete retained activity '+key);
 const indicators=originalReport.indicators.filter(i=>i.title==='Number of people trained in sustainable livelihoods');
 assert.equal(indicators.length,1);const indicator=indicators[0];
 const periods=indicator.periods.filter(p=>p.startOriginal==='2025-04-01'&&p.endOriginal==='2026-02-01');
 assert.equal(periods.length,1);const period=periods[0];assert.equal(period.targets.length,0);
 const actuals=period.actuals.filter(v=>v.dimensions.length===0&&v.locations.length===0);
 assert.equal(actuals.length,1);const actual=actuals[0];assert.equal(actual.rawValue,'2348.00');
 const baselines=indicator.baselines.filter(v=>v.contextKey===actual.contextKey&&v.year==='2025');
 assert.equal(baselines.length,1);const initial=baselines[0];assert.equal(initial.rawValue,'0');
 assert.deepEqual(period.actuals.map(v=>v.rawValue).sort(),['1466.00','2348.00','882.00']);
 const complete=await readOptional(resultFile);
 if(complete){
  assert.equal(complete.state,'COMPLETE');assert.equal(canonical(complete.selection),canonical(selection));
  await checkArtifacts(complete.artifacts);await checkArtifacts(complete.screenshots);
  const edition=await client.resultsProject(config.project,{revision:complete.finalRevision});
  assert.equal(edition.sha256,complete.finalEditionSha256);
  process.stdout.write(JSON.stringify({...complete,reused:true})+'\n');
 }else{
  await checkpoint('original-source',{source:config.source,counts:originalReport.counts,indicator:indicator.key,period:period.key,
   actual:actual.key,baseline:initial.key,context:actual.contextKey});
  await launch();
  // Pending work belongs to this same persistent browser profile. Reconcile it
  // before opening an edition, which otherwise would replace the retained draft.
  async function recoverOwnPending(){
   const recover=ui.getByRole('button',{name:'Read original result',exact:true});
   if(await recover.count()){
    const pendingId=(await ui.locator('.irm-pending .irm-identity').innerText()).trim();
    const ownRequests=Object.entries(progress.stages).filter(([k])=>k.endsWith('Request')).map(([,v])=>v.requestId);
    assert.ok(ownRequests.includes(pendingId),'The browser retains another original request; preserve its complete input.');
    await recover.click();await idle();
   }
  }
  await recoverOwnPending();
  for(const stage of ['review','following']){
   if(progress.stages[stage+'Request']&&!progress.stages[stage]){
    const edition=await originalReceipt(stage);
    await checkpoint(stage,{requestId:progress.stages[stage+'Request'].requestId,revision:edition.revision,sha256:edition.sha256});
   }
  }
  await recoverOwnPending();
  const currentHead=await client.resultsProject(config.project);
  const selectedHead=progress.stages.following??progress.stages.review??{revision:config.revision,sha256:config.editionSha256};
  assert.equal(currentHead.revision,selectedHead.revision,'Preserve the programme head selected by the existing operation.');
  assert.equal(currentHead.sha256,selectedHead.sha256);
  await openSelectedProgramme();
  if(!progress.stages.framework){
   const framework=ui.getByRole('heading',{name:'Complete programme framework',exact:true}).locator('..');
   assert.equal(await framework.locator('tbody tr[data-record-key]').count(),12);
   const shot=await screenshot('programme-framework-desktop.png');
   await clickPm('programme-tab-observations');
   const observations=ui.getByRole('heading',{name:'Original observations',exact:true}).locator('..');
   assert.equal(await observations.locator('tbody tr[data-record-key]').count(),22);
   for(const value of period.actuals){
    const row=observations.locator('tr[data-record-key="'+value.key+'"]');
    assert.equal(await row.count(),1);assert.ok((await row.innerText()).includes(value.rawValue));
   }
   await observations.getByLabel('Find a result or indicator',{exact:true}).fill(indicator.title);
   await clickPm('filter-programme');
   assert.equal(await observations.locator('tbody tr[data-record-key]').count(),4);
   await checkpoint('framework',{indicators:12,observationRows:22,selectedIndicatorRows:4,screenshot:shot});
  }
  if(!progress.stages.review){
   await clickPm('programme-tab-worksheet');
   await pm('worksheet-indicator').selectOption(indicator.key);await idle();
   await pm('worksheet-period').selectOption(period.key);await idle();
   assert.equal(await pm('editor-title').innerText(),indicator.title);
   await pm('unit-meaning').fill('people');
   await pm('unit-direction').selectOption('none');
   await pm('interpretation-note').fill('The title reports people trained; the description refers to awareness of land and natural-resource rights. Preserve both wordings. Count units are people; a directional performance conclusion awaits programme review.');
   await pm('pair-operation').selectOption('baseline-change');await idle();
   await pm('pair-actual').selectOption(actual.key);
   await pm('pair-baseline').selectOption(initial.key);
   assert.equal(await pm('pair-target').isDisabled(),true);
   await pm('pair-note').fill('Compare the source undimensioned actual 2348.00 with its undimensioned 2025 baseline 0 in the period 2025-04-01 through 2026-02-01. Gender-disaggregated actuals retain their original contexts.');
   await clickPm('stage-comparison');
   const staged=()=>ui.getByRole('heading',{name:'Staged comparisons for this indicator',exact:true}).locator('..');
   const originalBindingCount=await staged().locator('tbody tr').count();
   assert.equal(originalBindingCount,1);
   await pm('edit-pair').click();await idle();
   const originalBasis=await pm('pair-note').inputValue();
   const female=period.actuals.find(value=>value.rawValue==='882.00');assert.ok(female);
   await pm('pair-actual').selectOption(female.key);
   await pm('pair-note').fill('Review the separately reported female observation against its retained source context.');
   await clickPm('stage-comparison');
   assert.equal(await staged().locator('tbody tr').count(),originalBindingCount,'Editing replaces the original selection.');
   assert.ok((await staged().innerText()).includes('882.00'));
   await pm('edit-pair').click();await idle();
   await pm('pair-actual').selectOption(actual.key);await pm('pair-note').fill(originalBasis);
   // The current calculation build also flushes the complete unfinished editor.
   await clickPm('build-calculations');
   await browser.close();browser=null;await launch();
   await tab('programme');await clickPm('programme-tab-worksheet');
   assert.equal(await pm('worksheet-indicator').inputValue(),indicator.key);
   assert.equal(await pm('pair-actual').inputValue(),actual.key);
   assert.equal(await pm('pair-note').inputValue(),originalBasis);
   await clickPm('stage-comparison');await clickPm('build-calculations');
   assert.equal(await staged().locator('tbody tr').count(),originalBindingCount,'The restored edit still replaces its original row.');
   await checkpoint('comparison-edit-recovery',{indicator:indicator.key,originalBindingCount,retainedActual:actual.key});
   await clickPm('open-programme-report');
   const calculations=ui.getByRole('heading',{name:'Selected observation calculations',exact:true}).locator('..');
   assert.ok((await calculations.innerText()).includes('Change 2348.00'));
   await pm('programme-review-status').selectOption('needs-correction');
   await pm('programme-reviewer').fill(config.reviewer);
   await pm('programme-review-note').fill(config.reviewNote);
   await clickPm('report-build');
   await saveThroughUi('review',{interruptResponse:true});
  }
  await openSelectedProgramme();await clickPm('programme-tab-report');
  const reviewed=await client.resultsProject(config.project,{revision:progress.stages.review.revision});
  const comparison=reviewed.report.comparisons.find(v=>v.binding.actualKey===actual.key&&v.binding.baselineKey===initial.key);
  assert.ok(comparison);assert.equal(comparison.binding.targetKey,null);
  assert.equal(comparison.calculation.actualMinusBaseline,'2348.00');
  assert.equal(comparison.calculation.ratioPercent,null);
  assert.equal(reviewed.report.counts.indicators,12);
  assert.equal(reviewed.report.counts.actuals,12);
  if(!progress.stages.following){
   await clickPm('programme-tab-worksheet');
   await pm('worksheet-indicator').selectOption(indicator.key);await idle();
   const originalNote=await pm('interpretation-note').inputValue();
   await pm('interpretation-note').fill(originalNote+'\nReview refinement: the undimensioned actual is retained as its own reported population. Female 882.00 and male 1466.00 are separate source records; they are not additional observations to add to the undimensioned record.');
   await clickPm('build-calculations');await clickPm('open-programme-report');
   await pm('programme-review-status').selectOption('needs-correction');
   await pm('programme-reviewer').fill(config.reviewer);
   await pm('programme-review-note').fill(config.reviewNote+'\nFollowing local review edition: preserve the title/description question and record the disaggregation interpretation alongside the same retained source.');
   await clickPm('report-build');await saveThroughUi('following');
  }
  const following=await client.resultsProject(config.project,{revision:progress.stages.following.revision});
  assert.equal(following.parentRevision,reviewed.revision);
  assert.deepEqual(following.definition.sources,reviewed.definition.sources);
  await tab('compare');
  if(progress.stages.comparisonRequest&&!progress.stages.comparison){
   const saved=await originalReceipt('comparison');
   await checkpoint('comparison',{requestId:progress.stages.comparisonRequest.requestId,id:saved.id});
  }
  if(!progress.stages.comparison){
   await pm('compare-programme').selectOption(config.project);await idle();
   await pm('compare-before').fill(String(reviewed.revision));await pm('compare-after').fill(String(following.revision));
   await clickPm('open-comparison-reports');
   const correspondenceNote='Both local review editions retain the same original publisher source; the review interpretation changed.';
   await pm('mapping-note').fill(correspondenceNote);
   // Reopening these same immutable reports retains and flushes the unfinished note.
   await clickPm('open-comparison-reports');
   await browser.close();browser=null;await launch();await tab('compare');
   assert.equal(await pm('compare-programme').inputValue(),config.project);
   assert.equal(await pm('compare-before').inputValue(),String(reviewed.revision));
   assert.equal(await pm('compare-after').inputValue(),String(following.revision));
   assert.equal(await pm('mapping-note').inputValue(),correspondenceNote);
   assert.equal(await pm('comparison-restore-error').count(),0);
   await checkpoint('following-edition-draft-recovery',{beforeRevision:reviewed.revision,beforeSha256:reviewed.sha256,
    afterRevision:following.revision,afterSha256:following.sha256});
   let input;
   await page.route('**/api/iati/results/compare',async route=>{
    input=route.request().postDataJSON();assert.equal(input.id,config.project);
    assert.equal(input.beforeRevision,reviewed.revision);assert.equal(input.afterRevision,following.revision);
    await checkpoint('comparisonRequest',input);await route.continue();
   });
   try{await clickPm('save-programme-comparison');}finally{await page.unroute('**/api/iati/results/compare');}
   assert.ok(input);const saved=await originalReceipt('comparison');
   await checkpoint('comparison',{requestId:input.requestId,id:saved.id});
  }
  const comparisonReceipt=await client.resultsRequest(progress.stages.comparison.requestId);
  const retainedComparison=comparisonReceipt.response;
  assert.equal(retainedComparison.id,progress.stages.comparison.id);
  assert.equal(retainedComparison.comparison.pairs.length,12);
  assert.equal(retainedComparison.comparison.interpretationChanged,true);
  assert.ok(retainedComparison.comparison.pairs.every(v=>v.originalValuesChanged===false&&v.selectedValuesChanged===false));
  assert.deepEqual(retainedComparison.comparison.addedIndicators,[]);
  assert.deepEqual(retainedComparison.comparison.removedIndicators,[]);
  await clickPm('existing-comparisons');
  await ui.getByRole('button',{name:'Open r'+reviewed.revision+' → r'+following.revision,exact:true}).click();await idle();
  const screenshots={framework:progress.stages.framework.screenshot};
  screenshots.comparison=await screenshot('programme-following-review.png');
  await openSelectedProgramme();await clickPm('programme-tab-report');
  screenshots.report=await screenshot('programme-report-desktop.png');
  const artifacts=progress.stages.exports?.artifacts??{};
  for(const [name,key,filename]of [
   ['download-programme-report','report','programme-report-r'+following.revision+'.zip'],
   ['download-programme-project','project','programme-editable-r'+following.revision+'.zip']]){
   if(artifacts[key]){assert.deepEqual(await fileIdentity(artifacts[key].file),artifacts[key]);continue;}
   const target=join(config.output,filename),next=target+'.download';
   const promised=page.waitForEvent('download');await clickPm(name);const download=await promised;
   await download.saveAs(next);assert.equal(await download.failure(),null);await rename(next,target);
   artifacts[key]=await fileIdentity(target);
   await checkpoint('exports',{revision:following.revision,editionSha256:following.sha256,artifacts});
  }
  await page.setViewportSize({width:390,height:844});
  screenshots.mobileReport=await screenshot('programme-report-mobile.png');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Programme report must fit the mobile viewport.');
  await clickPm('programme-tab-worksheet');await pm('worksheet-indicator').selectOption(indicator.key);await idle();
  screenshots.mobileWorksheet=await screenshot('programme-worksheet-mobile.png');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Programme worksheet must fit the mobile viewport.');
  await browser.close();browser=null;
  await launch();await openSelectedProgramme();await clickPm('programme-tab-report');
  assert.equal(await pm('programme-review-note').inputValue(),following.definition.review.note);
  const finalHead=await client.resultsProject(config.project);assert.equal(finalHead.sha256,following.sha256);
  const history=await client.resultsHistory(config.project);
  assert.ok(history.editions.some(e=>e.sha256===baseline.sha256));
  assert.ok(history.editions.some(e=>e.sha256===reviewed.sha256));
  assert.ok(history.editions.some(e=>e.sha256===following.sha256));
  assert.deepEqual(errors,[],'The operated programme UI raised an uncaught application error.');
  const result={schema:'stellar-forge.iati-programme-browser-outcome.v1',state:'COMPLETE',selection,
   finalRevision:following.revision,finalEditionSha256:following.sha256,reportSha256:following.report.reportSha256,
   sourceCounts:originalReport.counts,reviewRevision:reviewed.revision,followingReviewRevision:following.revision,
   comparison:retainedComparison.id,sourceEditionKind:'Retained D-Portal activity representation',
   reviewEditionKind:'Two local reviewed editions of the same retained source',
   actualMinusBaseline:comparison.calculation.actualMinusBaseline,unit:'people',artifacts,screenshots,
   source:config.source,uiSha256:config.expectedUiSha256,browserErrors:errors,completedAt:new Date().toISOString()};
  await atomicJson(resultFile,result);process.stdout.write(JSON.stringify(result)+'\n');
 }
}finally{await browser?.close();await client.dispose();}
