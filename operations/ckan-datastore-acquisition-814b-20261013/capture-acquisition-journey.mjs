// One complete live, read-only source acquisition and customer receiving programme.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openCkanWorkbench } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/model.mjs';
import { startCkanServer } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/server.mjs';
import { saveWorkbenchStartup } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/workbench-owner.mjs';
import { readCkanCapture } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/capture.mjs';
import { scheduledCkanCaptureRunId } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/capture-plans.mjs';
import { receiveCkanWorkspaceArchive } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/archive.mjs';
import { cloneRemote, remoteIdentity, parseRemote } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/remote-json.mjs';
import { atomicJson } from './stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
const root=process.cwd(), cfg=JSON.parse(await readFile(join(root,'journey-input.json'),'utf8'));
const recordFile=join(root,'acquisition-journey-record.json'), exists=async path=>access(path).then(()=>true,()=>false);
const settle=async handle=>{const started=await handle, operation=await started.completion;
  assert.equal(operation.state,'COMPLETE',JSON.stringify(operation.error));return operation.result;};
let record=await exists(recordFile)?JSON.parse(await readFile(recordFile,'utf8')):{
  operation:'CKAN-DATASTORE-ACQUISITION-814B-20261013',planId:randomUUID(),requests:[],
  checks:[],createdAt:new Date().toISOString(),controlledInterruption:false,publisher:{}};
assert.equal(record.operation,'CKAN-DATASTORE-ACQUISITION-814B-20261013');
const visualIndexFile=join(root,'rendered-product','rendered-index.json');
const previousVisual=await exists(visualIndexFile)?JSON.parse(await readFile(visualIndexFile,'utf8')):null;
if(previousVisual)assert(previousVisual.operation===record.operation&&Array.isArray(previousVisual.images)&&Array.isArray(previousVisual.downloads));
const visual=record.rendered=previousVisual??record.rendered??{operation:record.operation,inspection:'awaiting-producing-peer-view',images:[],downloads:[]};
const save=()=>atomicJson(root,'acquisition-journey-record.json',record);
// Retain the actual rendered pixels for direct inspection by the producing peer.
const renderedRoot=join(root,'rendered-product');
async function renderedView(page,name,viewport={width:1366,height:900}) {
  await mkdir(renderedRoot,{mode:0o700,recursive:true});
  await page.setViewportSize(viewport);
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const raw=await page.screenshot({type:'png',fullPage:true});
  const filename=String(visual.images.length+1).padStart(2,'0')+'-'+name+'-'+randomUUID()+'.png';
  await writeFile(join(renderedRoot,filename),raw,{flag:'wx',mode:0o600});
  visual.images.push({file:filename,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),
    viewport:{...viewport},title:await page.title(),path:new URL(page.url()).pathname});
  await atomicJson(renderedRoot,'rendered-index.json',visual);
}
async function renderedWidths(page,name) {
  await renderedView(page,name+'-desktop');
  await renderedView(page,name+'-narrow',{width:390,height:844});
  await page.setViewportSize({width:1366,height:900});
}
async function userDownload(page,label,name) {
  await mkdir(renderedRoot,{mode:0o700,recursive:true});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:label,exact:true}).click()]);
  const filename=String(visual.downloads.length+1).padStart(2,'0')+'-'+randomUUID()+'-'+name;
  await download.saveAs(join(renderedRoot,filename));
  assert.equal(await download.failure(),null);
  const raw=await readFile(join(renderedRoot,filename));
  visual.downloads.push({file:filename,suggestedName:download.suggestedFilename(),bytes:raw.length,
    sha256:createHash('sha256').update(raw).digest('hex')});
  await atomicJson(renderedRoot,'rendered-index.json',visual);
  return raw;
}

const checked=message=>{if(!record.checks.includes(message))record.checks.push(message);};
let workbench, listener, browser;
const pageErrors=[];
const until=async(predicate,message)=>{const deadline=Date.now()+120000;for(;;){if(await predicate())return;if(Date.now()>deadline)throw new Error(message);await new Promise(resolve=>setTimeout(resolve,100));}};
const browserPage=async()=>{
  if(!listener)listener=await startCkanServer({workbench});
  if(!browser){const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(cfg.browserExecutable?{executablePath:cfg.browserExecutable}:{})});}
  const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true});page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(listener.url,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Capture plans',exact:true}).click();return page;
};
const captureDue=async()=>{
  if(!listener)listener=await startCkanServer({workbench});
  const startupFile=join(home,'private-listener.json');
  await saveWorkbenchStartup({project:workbench,web:listener,file:startupFile});
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[join(root,'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/cli.mjs'),'capture-due','--project',directory,'--startup-file',startupFile,'--wait-ms','900000'],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
    const out=[],err=[];let size=0;
    child.on('error',reject);child.stdout.on('data',chunk=>{size+=chunk.length;if(size>16777216){child.kill();reject(new Error('Original CLI output exceeded its retained bound.'));}else out.push(chunk);});
    child.stderr.on('data',chunk=>{if(err.reduce((n,p)=>n+p.length,0)<65536)err.push(chunk);});
    child.on('close',(code,signal)=>{try{const raw=Buffer.concat(out).toString('utf8');const outcome={code,signal,result:raw?JSON.parse(raw):null,error:Buffer.concat(err).toString('utf8')};resolve(outcome);}catch(error){reject(error);}});
  });
};
const originalFetch=globalThis.fetch;
const home=join(root,'operator'), directory=join(home,'original');
await mkdir(home,{mode:0o700,recursive:true});
await save();
function periodTemplate(value) {
  if(typeof value==='string')return value.replaceAll('2026-10-10','{{period.date}}');
  if(Array.isArray(value))return value.map(periodTemplate);
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,periodTemplate(item)]));
  return cloneRemote(value);
}
async function publication(sourceId) {
  let current=workbench.status().publications.find(row=>row.sourceId===sourceId);
  if(!current)current=await settle(workbench.createPublication(sourceId,{defaultLimit:100,maxLimit:1000}));
  if(!['READY','REVIEWED','PUBLISHED'].includes(current.state))
    current=await settle(workbench.recoverPublication(current.id));
  if(current.state==='READY'){
    const detail=await workbench.publication(current.id);
    current=await settle(workbench.reviewPublication(current.id,{
      expectedCandidateDigest:detail.run.data.candidate.candidateDigest,reviewer:'814B source operator',
      note:'Reviewed the complete live source, field definitions, source terms and selected edition.'}));
  }
  if(current.state!=='PUBLISHED')current=await settle(workbench.publishDataset(current.id,current.run.data.review.id));
  assert.equal(current.state,'PUBLISHED');return current;
}
try {
  const originals=await Promise.all(cfg.captures.map(file=>readCkanCapture(file)));
  originals.sort((a,b)=>a.manifest.rowCount-b.manifest.rowCount);
  assert.deepEqual(originals.map(row=>row.manifest.rowCount),[3821,4389]);
  const referenceHashes=originals.map(row=>row.manifestSha256);
  if(record.referenceHashes)assert.deepEqual(record.referenceHashes,referenceHashes);
  else{record.referenceHashes=referenceHashes;await save();}
  const firstSelection=cloneRemote(originals[0].manifest.selection);
  const selection={...firstSelection,filters:periodTemplate(firstSelection.filters),q:periodTemplate(firstSelection.q)};
  assert(JSON.stringify({filters:selection.filters,q:selection.q}).includes('{{period.date}}'),
    'The original selected date must be explicit in its retained filters/query.');
  const initialConfig={label:'Zürich daily source observations',enabled:true,selection,
    limits:{maxRows:250000,maxBytes:268435456},cadence:{anchorAt:'2026-10-11T00:00:00.000Z',intervalMinutes:1440},
    period:{kind:'utc-day',offsetDays:-1},comparisonKeys:['_id']};
  workbench=await openCkanWorkbench({directory,create:!await exists(join(directory,'workbench.json')),
    origin:firstSelection.catalogOrigin});
  if(!workbench.status().capturePlans.plans.length&&!visual.images.some(item=>item.file.includes('empty-plans'))){
    const emptyPage=await browserPage();await renderedWidths(emptyPage,'empty-plans');
    await emptyPage.close();await browser.close();browser=null;await listener.close();listener=null;await save();
  }
  const firstPreview=workbench.previewCapturePlan({config:initialConfig,scheduledFor:'2026-10-11T00:00:00.000Z'});
  const secondPreview=workbench.previewCapturePlan({config:initialConfig,scheduledFor:'2026-10-12T00:00:00.000Z'});
  assert.equal(remoteIdentity(firstPreview.selection),remoteIdentity(originals[0].manifest.selection));
  assert.equal(remoteIdentity(secondPreview.selection),remoteIdentity(originals[1].manifest.selection));
  if(record.initialPlanSha256)assert.equal(record.initialPlanSha256,firstPreview.planSha256);
  else{record.initialPlanSha256=firstPreview.planSha256;await save();}
  if(!workbench.status().capturePlans.plans.some(row=>row.id===record.planId))
    await settle(workbench.saveCapturePlan({id:record.planId,expectedPlanSha256:null,config:initialConfig}));
  const firstId=scheduledCkanCaptureRunId(record.planId,record.initialPlanSha256,firstPreview.scheduledFor);
  record.firstRunId=firstId;await save();
  let activeRun='first', firstDataPages=0;
  globalThis.fetch=async(value,options)=>{
    const url=new URL(value);
    assert.equal(url.origin,firstSelection.catalogOrigin,'Only the original public catalogue may receive acquisition requests.');
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    const action=url.pathname.split('/').at(-1);
    if(activeRun==='first'&&action==='datastore_search')firstDataPages++;
    if(activeRun==='first'&&action==='datastore_search'&&firstDataPages===2&&!record.controlledInterruption){
      record.controlledInterruption=true;
      record.interruption={kind:'controlled local transport interruption before the second page request',
        at:new Date().toISOString(),url:url.href};await save();
      throw new TypeError('Original controlled read interruption');
    }
    record.requests.push({run:activeRun,url:url.href,method:'GET',at:new Date().toISOString()});await save();
    return originalFetch(value,options);
  };
  let first=workbench.status().capturePlans.runs.find(row=>row.id===firstId);
  if(!first){
    const handle=workbench.runCapturePlan({id:firstId,planId:record.planId,
      expectedPlanSha256:record.initialPlanSha256,kind:'scheduled',scheduledFor:firstPreview.scheduledFor});
    assert.throws(()=>workbench.runCapturePlan({id:firstId,planId:record.planId,
      expectedPlanSha256:record.initialPlanSha256,kind:'scheduled',scheduledFor:firstPreview.scheduledFor}),
      error=>error.code==='CKAN_PROJECT_BUSY');
    const operation=await handle.completion;
    first=await workbench.capturePlanRun(firstId);
    if(operation.state!=='COMPLETE')assert(record.controlledInterruption,JSON.stringify(operation.error));
    checked('Overlapping admission retained one original run and workbench owner.');
  } else first=await workbench.capturePlanRun(firstId);
  if(first.state!=='COMPLETE'){
    const originalEdition=first.editionId,originalSelection=first.selectionSha256;
    const interruptedPage=await browserPage();
    await interruptedPage.getByRole('button',{name:'Open plan and complete history',exact:true}).click();
    await interruptedPage.getByRole('button',{name:'Inspect original run',exact:true}).first().click();
    await interruptedPage.getByRole('button',{name:'Resume the same source acquisition',exact:true}).waitFor();
    await renderedView(interruptedPage,'retained-interrupted-acquisition');
    await interruptedPage.close();await browser.close();browser=null;await listener.close();listener=null;await save();
    await workbench.close();workbench=null;
    workbench=await openCkanWorkbench({directory});
    assert.throws(()=>workbench.resumeCapture(originalEdition,{maxRows:first.limits.maxRows+1}),
      error=>error.code==='CKAN_CAPTURE_PLAN_LIMITS_PINNED');
    first=await settle(workbench.resumeCapture(originalEdition));
    checked('The existing edition resume preserved its original plan run and refused changed limits.');
    assert.equal(first.editionId,originalEdition);
    assert.equal((await workbench.capturePlanRun(firstId)).selectionSha256,originalSelection);
    checked('Cold recovery resumed the original period, edition and retained pages.');
  }
  const requestsBeforeReplay=record.requests.length;
  await settle(workbench.runCapturePlan({id:firstId,planId:record.planId,
    expectedPlanSha256:record.initialPlanSha256,kind:'scheduled',scheduledFor:firstPreview.scheduledFor}));
  assert.equal(record.requests.length,requestsBeforeReplay);
  checked('Reopening the completed scheduled run issued no source request.');
  const renamed={...cloneRemote(firstPreview.config),label:'Zürich reviewed daily source policy'};
  let plan=await workbench.capturePlan(record.planId);
  const renamedPreview=workbench.previewCapturePlan({config:renamed,scheduledFor:secondPreview.scheduledFor});
  if(plan.planSha256!==renamedPreview.planSha256){
    assert.equal(plan.planSha256,record.initialPlanSha256);
    const page=await browserPage();
    await page.getByRole('button',{name:'Open plan and complete history',exact:true}).click();
    await page.getByRole('button',{name:'Edit this inspected plan version',exact:true}).click();
    await renderedWidths(page,'edit-original-plan');
    await page.getByRole('button',{name:'Save this plan version',exact:true}).click();
    await page.locator('#notice .error').waitFor();
    await renderedView(page,'unchanged-preview-required');
    await page.getByLabel('Complete capture plan configuration',{exact:true}).fill(JSON.stringify(renamed,null,2));
    await page.getByLabel('Preview slot in UTC',{exact:true}).fill(secondPreview.scheduledFor);
    await page.getByRole('button',{name:'Preview exact upstream selection',exact:true}).click();
    await page.getByText('Exact resolved period, filters and query',{exact:true}).waitFor();
    await page.getByText('Exact resolved period, filters and query',{exact:true}).click();
    await renderedView(page,'resolved-following-source-selection');
    await page.getByRole('button',{name:'Save this plan version',exact:true}).click();
    await until(async()=>!workbench.status().active&&(await workbench.capturePlan(record.planId)).planSha256===renamedPreview.planSha256,
      'The browser plan save did not reach its original retained result.');
    assert.deepEqual(pageErrors,[]);
    record.browser={state:'PASS',planId:record.planId,planSha256:renamedPreview.planSha256,pageErrors:[]};await save();
    checked('The actual browser edited, previewed and saved the exact following plan through its original owner.');
    await page.close();
    plan=await workbench.capturePlan(record.planId);
  }
  assert.equal(plan.planSha256,renamedPreview.planSha256);
  assert.equal(plan.nextDueAt,secondPreview.scheduledFor);
  assert.equal(plan.latestCompleteRunId,firstId);
  checked('Renaming a plan preserved the next due period and its completed original observation.');
  const firstEdition=await workbench.edition(first.editionId);
  const projection=Object.fromEntries(firstEdition.suggestions.map(column=>[column.alias,{
    field:column.field,type:column.type,nullable:column.nullable,encoding:column.encoding}]));
  let source=workbench.status().sources.find(row=>row.editionId===first.editionId&&row.title==='First complete scheduled source edition');
  if(!source)source=await settle(workbench.saveSource(first.editionId,{title:'First complete scheduled source edition',
    expectedCaptureSha256:first.manifestSha256,projection}));
  const firstPublication=await publication(source.id);
  const secondId=scheduledCkanCaptureRunId(record.planId,plan.planSha256,secondPreview.scheduledFor);
  record.secondRunId=secondId;await save();activeRun='following';
  let second=workbench.status().capturePlans.runs.find(row=>row.id===secondId);
  if(!second){
    const due=await workbench.dueCapturePlans(), selected=due.runs.find(row=>row.planId===record.planId);
    assert.equal(selected.id,secondId);assert.equal(selected.scheduledFor,secondPreview.scheduledFor);
    record.cli=await captureDue();await save();
    assert.equal(record.cli.code,0,record.cli.error);
    assert.equal(record.cli.result.listener.instanceId,listener.instanceId);
    assert.equal(record.cli.result.runs.length,1);
    assert.equal(record.cli.result.runs[0].runId,secondId);
    assert.equal(record.cli.result.runs[0].run.state,'COMPLETE');
    checked('The actual capture-due CLI joined the private live owner and acquired only the selected following period.');
    second=await workbench.capturePlanRun(secondId);
  } else if(second.state!=='COMPLETE'){
    await settle(workbench.resumeCapturePlanRun(secondId,{expectedIntentSha256:second.intentSha256}));
    second=await workbench.capturePlanRun(secondId);
  } else second=await workbench.capturePlanRun(secondId);
  const after=await workbench.edition(second.editionId);
  assert.notEqual(first.editionId,second.editionId);
  assert.notEqual(first.manifestSha256,second.manifestSha256);
  assert.equal((await workbench.capturePlanRun(firstId)).period.date,'2026-10-10');
  assert.equal(second.period.date,'2026-10-11');
  const refresh=await settle(workbench.prepareCapturePlanRefresh(secondId,{
    expectedIntentSha256:second.intentSha256,sourceId:source.id,expectedSourceSha256:source.sha256,
    previousPublicationId:firstPublication.id}));
  const beforeDecision=workbench.status();
  if(refresh.state!=='ACCEPTED'){
    assert(!beforeDecision.sources.some(row=>row.refreshId===refresh.id));
    checked('Collection and comparison left the new source unpublished until explicit review.');
  }
  const decision=await workbench.previewRefresh(refresh.id,{expectedComparisonSha256:refresh.comparisonSha256,
    title:'Following complete scheduled source edition'});
  const accepted=await settle(workbench.reviewRefresh(refresh.id,{
    expectedComparisonSha256:refresh.comparisonSha256,decision:'accept',reviewer:'814B source operator',
    note:'Reviewed both complete live observations, changed selection, row differences and source definitions.',
    title:decision.title,query:decision.query,projection:decision.projection,
    expectedProjectionSha256:decision.projectionSha256,
    expectedSemanticsSha256:decision.semanticReview?.sha256??null,
    expectedDefinitionSha256:decision.semanticReview?.definitionSha256??null}));
  const followingPublication=await publication(accepted.acceptedSourceId);
  assert.equal(followingPublication.previousPublicationId,firstPublication.id);
  checked('The following source period passed the original complete comparison, semantic decision and publisher.');
  record.publisher={first:firstPublication.id,following:followingPublication.id,refresh:refresh.id};
  record.observations=[{runId:firstId,period:'2026-10-10',editionId:first.editionId,
    manifestSha256:first.manifestSha256,rowCount:firstEdition.rowCount,pageCount:firstEdition.pageCount},
    {runId:secondId,period:'2026-10-11',editionId:second.editionId,
    manifestSha256:second.manifestSha256,rowCount:after.rowCount,pageCount:after.pageCount}];
  record.fieldDefinitions={first:firstEdition.semantics,following:after.semantics};await save();
  // Reopen the actual operator after the following edition and inspect its
  // complete retained run. This also exercises a resumed programme whose
  // original browser save has already completed.
  const page=await browserPage();
  await page.getByRole('button',{name:'Open plan and complete history',exact:true}).click();
  await page.getByRole('button',{name:'Inspect original run',exact:true}).last().click();
  await page.getByRole('button',{name:'Open retained edition and field dictionary',exact:true}).waitFor();
  await renderedWidths(page,'following-original-run');
  const downloadedRun=parseRemote((await userDownload(page,'Download full original run','following-run.json')).toString('utf8'));
  assert.equal(downloadedRun.id,secondId);
  const downloadedPlan=parseRemote((await userDownload(page,'Download inspected plan version','current-plan.json')).toString('utf8'));
  assert.equal(downloadedPlan.planId,record.planId);assert.equal(downloadedPlan.planSha256,plan.planSha256);
  checked('Actual operator download controls returned and reopened the selected complete run and plan.');
  assert.deepEqual(pageErrors,[]);
  record.browser={...(record.browser??{}),state:'PASS',followingRunId:secondId,pageErrors:[]};await save();
  checked('The actual browser reopened both original acquisition periods and the retained following run.');
  await page.close();await browser.close();browser=null;
  await listener.close();listener=null;
  const archivePath=join(home,'complete-acquisition-workspace.ckanw');
  if(!record.archive){
    record.archive=await settle(workbench.archiveWorkspace({out:archivePath}));await save();
  }
  await workbench.close();workbench=null;
  const callsBeforeReceive=record.requests.length,receivedRoot=join(home,'received');
  record.received=await receiveCkanWorkspaceArchive({file:record.archive.file,directory:receivedRoot,
    expectedSha256:record.archive.sha256});
  workbench=await openCkanWorkbench({directory:receivedRoot});
  const receivedPlan=await workbench.capturePlan(record.planId);
  assert.equal(receivedPlan.planSha256,plan.planSha256);
  assert.equal(receivedPlan.latestCompleteRunId,secondId);
  for(const runId of [firstId,secondId]){
    const retained=await workbench.capturePlanRun(runId);
    assert.equal(retained.state,'COMPLETE');await workbench.capturePlanFile(runId,'run');
  }
  for(const version of receivedPlan.versions)
    await workbench.capturePlanFile(record.planId,'plan',version.planSha256);
  for(const id of [firstPublication.id,followingPublication.id])
    assert.equal((await workbench.publication(id)).state,'PUBLISHED');
  await workbench.close();workbench=null;workbench=await openCkanWorkbench({directory:receivedRoot});
  assert.equal((await workbench.capturePlanRun(secondId)).manifestSha256,second.manifestSha256);
  assert.equal(record.requests.length,callsBeforeReceive);
  checked('Complete customer receiving and cold reopen retained both policies, all pages, reviews and published editions without network.');
  const receivedPage=await browserPage();
  await receivedPage.getByRole('button',{name:'Open plan and complete history',exact:true}).click();
  await receivedPage.getByRole('button',{name:'Inspect original run',exact:true}).last().click();
  await receivedPage.getByRole('button',{name:'Open retained edition and field dictionary',exact:true}).waitFor();
  await renderedWidths(receivedPage,'cold-received-acquisition');
  const reopenedRun=parseRemote((await userDownload(receivedPage,'Download full original run','received-following-run.json')).toString('utf8'));
  assert.equal(reopenedRun.id,secondId);assert.equal(record.requests.length,callsBeforeReceive);
  await receivedPage.close();await browser.close();browser=null;await listener.close();listener=null;
  checked('Actual cold-received desktop and narrow operator screens, retained controls and reopened download were returned for producing-peer inspection.');
  record.state='PASS';record.error=null;
} catch(error) {
  record.state='FAIL';record.error={code:error.code,message:error.message,stack:error.stack};
} finally {
  if(browser)await browser.close();if(listener)await listener.close();if(workbench)await workbench.close();
  globalThis.fetch=originalFetch;record.completedAt=new Date().toISOString();await save();
}
await writeFile(join(root,'acquisition-result.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(record));
if(record.state!=='PASS')process.exitCode=1;
