#!/usr/bin/env node
// MIT. One complete source-window operation using actual retained publisher originals.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {OcdsWorkspace} from '../workspace.mjs';
import {SourceOperations} from '../source-window.mjs';
import {startOcdsServer} from '../server.mjs';
import {OcdsClient} from '../client.mjs';
import {TRACKER_COLUMNS} from '../agency/tracker-core.mjs';

const sourceDirectory=fileURLToPath(new URL('../',import.meta.url));
const hash=body=>createHash('sha256').update(body).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const clone=value=>JSON.parse(JSON.stringify(value));
const CYMRU='ocds-h6vhtk-06e0f5',TONBRIDGE='ocds-h6vhtk-0783eb';
const require=createRequire(import.meta.url);
async function save(path,value) { await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,typeof value==='string'?value:json(value),{mode:0o600}); }
async function original(path,observation) {
  const body=await readFile(path);
  assert.equal(body.length,observation.bytes,'Original acquisition byte count');
  assert.equal(hash(body),observation.sha256,'Original acquisition SHA-256');
  return {path:resolve(path),body,observation:clone(observation)};
}
async function command(args,directory,logPath) {
  const processResult=await new Promise((accept,reject)=>{
    const child=spawn(process.execPath,args,{cwd:directory,env:process.env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},20*60*1000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);accept({code,signal,timedOut,stdout,stderr,args});});
  });
  await save(logPath,processResult);
  assert.equal(processResult.code,0,'Native operator command: '+args[1]);
  assert.equal(processResult.timedOut,false,'The native operation finished within its execution allowance');
  return JSON.parse(processResult.stdout);
}
async function settledWindow(client,id) {
  for(let index=0;index<720;index++){
    const window=await client.sourceWindow(id);
    if(window.status!=='running')return window;
    await delay(500);
  }
  throw Error('The saved source window is still running; retain its exact window ID for continuation: '+id);
}
function chromiumRuntime() {
  const roots=[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,...String(process.env.NODE_PATH||'').split(':')].filter(Boolean);
  for(const name of ['playwright','@playwright/test',...roots.flatMap(root=>[join(root,'playwright'),join(root,'@playwright/test')])]){
    try{const result=require(name);if(result.chromium)return result.chromium;}
    catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  }
  throw Error('Use the already installed Playwright runtime for the source-window browser phase.');
}
async function browserJourney({origin,receiverOrigin,executiveOrigin,executive,documentSha,outDirectory,executablePath,resume=false,retainedHandoffDirectory}) {
  const chromium=chromiumRuntime(),temporary=join(outDirectory,'browser-temporary');
  await mkdir(temporary,{recursive:true,mode:0o700});
  const originalTmp=process.env.TMPDIR;process.env.TMPDIR=temporary;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...((executablePath||process.env.OCDS_BROWSER_EXECUTABLE)
      ?{executablePath:executablePath||process.env.OCDS_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    const handoffDirectory=retainedHandoffDirectory||join(outDirectory,'browser-client-handoff');
    let mobileWidth=null;
    if(!resume){
    const page=await context.newPage();await page.goto(origin+'/source-windows',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#count-selections')?.textContent==='1');
    await page.locator('nav [data-tab="reviews"]').click();
    await page.locator('#work-filter').selectOption('all');
    await page.locator('#reviews-list').getByRole('button',{name:'Review',exact:true}).first().click();
    await page.locator('#review-dialog[open]').waitFor();
    await page.locator('#review-status').selectOption('reviewing');
    await page.locator('#review-owner').fill('source-window-browser-operator');
    await page.locator('#review-action').fill('Prepare the current Stage 1 response against the original EOI deadline and assigned client evidence.');
    const saved=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().includes('/api/source-reviews/'));
    await page.locator('#review-form button[type="submit"]').click();
    const savedResponse=await saved;assert(savedResponse.ok(),await savedResponse.text());
    await page.waitForFunction(()=>!document.querySelector('#review-dialog')?.open);
    await page.locator('nav [data-tab="documents"]').click();
    const documentLink=page.locator('#documents-list a').filter({hasText:'Download '+documentSha.slice(0,10)}).first();
    const download=page.waitForEvent('download');await documentLink.click();
    const originalDownload=await download,downloadPath=join(outDirectory,'browser-original-document.docx');
    await originalDownload.saveAs(downloadPath);assert.equal(hash(await readFile(downloadPath)),documentSha);
    await page.locator('#documents-list').getByRole('button',{name:'History',exact:true}).first().click();
    await page.locator('#detail-dialog[open]').waitFor();
    assert((await page.locator('#detail-content').textContent()).includes(CYMRU));
    await page.locator('#close-detail').click();
    await page.screenshot({path:join(outDirectory,'source-windows-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(outDirectory,'source-windows-mobile.png'),fullPage:true});
    mobileWidth=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    assert(mobileWidth.document<=mobileWidth.viewport,'Source operator remains within the mobile viewport');
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('nav [data-tab="handoff"]').click();
    await page.locator('#export-ocids').fill(CYMRU);
    await page.locator('#export-directory').fill(handoffDirectory);
    const exportReply=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/source-export'));
    await page.locator('#export-form button').click();const exported=await exportReply;
    assert(exported.ok(),await exported.text());
    await page.waitForFunction(()=>document.querySelector('#receipt')?.hidden===false);
    await page.close();
    }
    const receivePage=await context.newPage();await receivePage.goto(receiverOrigin+'/source-windows',{waitUntil:'networkidle'});
    await receivePage.locator('nav [data-tab="handoff"]').click();
    await receivePage.locator('#receive-directory').fill(handoffDirectory);
    const receiveReply=receivePage.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/source-receive'));
    await receivePage.locator('#receive-form button').click();const received=await receiveReply;
    assert(received.ok(),await received.text());
    await receivePage.locator('#receiving-list').getByRole('button',{name:'Context',exact:true}).first().click();
    await receivePage.locator('#detail-dialog[open]').waitFor();
    assert((await receivePage.locator('#detail-content').textContent()).includes(CYMRU));
    const receivingLayout=await receivePage.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},receiptHeight:document.querySelector('#receipt').getBoundingClientRect().height,dialogHeight:document.querySelector('#detail-dialog').getBoundingClientRect().height}));
    await receivePage.screenshot({path:join(outDirectory,'source-receiving.png'),fullPage:false});
    await receivePage.close();
    const publisherPage=await context.newPage();await publisherPage.goto(executiveOrigin+'/source-windows',{waitUntil:'networkidle'});
    await publisherPage.locator('#new-selection').click();
    await publisherPage.locator('#selection-id').fill('leicestershire-record');
    await publisherPage.locator('#selection-label').fill('Highway Waste Services Framework_2026');
    await publisherPage.locator('#selection-owner').fill('highway-waste-operator');
    await publisherPage.locator('#selection-ocids').fill(executive.ocid);
    await publisherPage.locator('#selection-documents').uncheck();
    const selectionReply=publisherPage.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/source-selections'));
    await publisherPage.locator('#selection-form button[type="submit"]').click();const selectionSaved=await selectionReply;
    assert(selectionSaved.ok(),await selectionSaved.text());
    await publisherPage.locator('nav [data-tab="windows"]').click();
    await publisherPage.locator('#source-observation-editor > summary').click();
    await publisherPage.locator('#observed-selection').selectOption('leicestershire-record');
    await publisherPage.locator('#observed-name').fill('Original highway-waste acquisition');
    await publisherPage.locator('#observed-file').setInputFiles(executive.path);
    await publisherPage.locator('#observed-receipt').fill(json(executive.observation));
    const observedReply=publisherPage.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/source-observation'));
    await publisherPage.locator('#source-observation-form button').click();const observed=await observedReply;
    assert(observed.ok(),await observed.text());
    await publisherPage.waitForFunction(()=>document.querySelector('#windows-list')?.textContent.includes('complete'));
    await publisherPage.screenshot({path:join(outDirectory,'original-publisher-acquisition.png'),fullPage:true});
    await publisherPage.close();
    assert.deepEqual(errors,[],'Browser script errors');
    return {desktopWidth:1440,...(mobileWidth?{mobileWidth}:{}),downloadSha256:documentSha,handoffDirectory,receivingLayout,resumed:resume,
      executiveOriginal:executive.observation.sha256,screenshots:resume?['source-receiving.png','original-publisher-acquisition.png']:['source-windows-desktop.png','source-windows-mobile.png','source-receiving.png','original-publisher-acquisition.png']};
  }finally{if(browser)await browser.close();if(originalTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=originalTmp;}
}
export async function runSourceWindowJourney({companyDirectory,executiveOriginal,outDirectory,browser=true,browserExecutable,mcpModule}={}) {
  assert(companyDirectory&&executiveOriginal?.path&&executiveOriginal?.observation&&outDirectory,'Complete original input locations are required');
  outDirectory=resolve(outDirectory);companyDirectory=resolve(companyDirectory);
  await mkdir(outDirectory,{recursive:true,mode:0o700});
  const result={schema:'stellar-forge.ocds.source-window-journey.v1',startedAt:new Date().toISOString(),sourceDirectory,outDirectory,stages:[],status:'running'};
  const record=(stage,details)=>{result.stages.push({stage,completedAt:new Date().toISOString(),...details});process.stderr.write(json({stage,...details}));};
  const services=new Set(),start=async options=>{const service=await startOcdsServer(options);services.add(service);return service;};
  try{
    const companion=join(companyDirectory,'onboarding-v2'),configDirectory=join(outDirectory,'agency-configuration');
    await mkdir(configDirectory,{recursive:true,mode:0o700});
    const config=await readJson(join(companion,'pilot.template.json'));
    const library=await readJson(join(companion,'worked-source-selection-library.json'));
    const acquisitions=await readJson(join(companion,'source-acquisitions.json'));
    const originals=await readJson(join(companion,'source-originals.json'));
    const documentRegister=await readJson(join(companion,'documents.json'));
    const contexts=await readJson(join(companion,'source-contexts.json'));
    const selected=[['portfolio-01',CYMRU,'cymru-client-a'],['portfolio-02',TONBRIDGE,'cemetery-client'],['portfolio-03',CYMRU,'cymru-client-b']];
    config.productSourceDirectory=sourceDirectory;config.workspaceRoot=join(outDirectory,'agency-workspaces');config.operator='source-window-agency-operator';
    for(const portfolio of config.portfolios){const assignment=selected.find(row=>row[0]===portfolio.id);portfolio.selectedOcids=assignment?[assignment[1]]:[];portfolio.label=assignment?assignment[2]:'Unassigned client store '+portfolio.id;portfolio.contextBindings={};}
    const selectionConfig={schema:'tjlabs.ocds.agency-source-selections.v1',portfolios:config.portfolios.map(portfolio=>({
      portfolioId:portfolio.id,selections:portfolio.selectedOcids.map(ocid=>({...clone(library.selections.find(value=>value.ocids.includes(ocid))),owner:portfolio.label+'-operator'}))
    }))};
    const bySelection=id=>selectionConfig.portfolios.filter(portfolio=>portfolio.selections.some(value=>value.id===id)).map(value=>value.portfolioId);
    for(const row of acquisitions.acquisitions){row.path=resolve(companion,row.path);row.portfolioIds=bySelection(row.selectionId);}
    for(const row of originals.originals){row.path=resolve(companion,row.path);row.portfolioIds=bySelection(row.selectionId);}
    for(const row of documentRegister.documents)if(row.path)row.path=resolve(companion,row.path);
    const acquired=await Promise.all(acquisitions.acquisitions.map(row=>original(row.path,row.observation)));
    const documentFiles=await Promise.all(originals.originals.map(row=>original(row.path,row.observation)));
    const highway=await original(executiveOriginal.path,executiveOriginal.observation);
    highway.ocid=JSON.parse(highway.body.toString('utf8')).records[0].ocid;
    for(const [name,value] of [['source-selections.json',selectionConfig],['source-acquisitions.json',acquisitions],['source-originals.json',originals],['source-contexts.json',contexts],['documents.json',documentRegister],['retrievals.json',{schema:'tjlabs.ocds.agency-retrievals.v1',retrievals:[]}]]){
      await save(join(configDirectory,name),value);
    }
    for(const [field,filename] of [['sourceSelectionsFile','source-selections.json'],['sourceAcquisitionsFile','source-acquisitions.json'],['sourceOriginalsFile','source-originals.json'],['contextsFile','source-contexts.json'],['documentsFile','documents.json'],['retrievalsFile','retrievals.json']])config[field]=join(configDirectory,filename);
    const configPath=join(configDirectory,'pilot.json');await save(configPath,config);
    const operator=join(sourceDirectory,'agency/pilot-operator.mjs');
    await command([operator,'init','--config',configPath],configDirectory,join(outDirectory,'logs/agency-init.json'));
    await command([operator,'source-select','--config',configPath],configDirectory,join(outDirectory,'logs/source-selections.json'));
    const baselineDirectory=join(outDirectory,'baseline');
    const baseline=await command([operator,'refresh','--config',configPath,'--name','baseline','--out',baselineDirectory],configDirectory,join(outDirectory,'logs/agency-refresh.json'));
    const tracker=await readJson(join(baselineDirectory,'tracker.rows.json')),meter=await readJson(join(baselineDirectory,'scope-meter.json'));
    assert.equal(tracker.rows.length,3);assert.equal(TRACKER_COLUMNS.length,32);
    assert(tracker.rows.every(row=>TRACKER_COLUMNS.every(column=>Object.hasOwn(row,column))));
    assert.equal(meter.values.clientWorkspaces,5);assert.equal(meter.values.uniquePayloads,2);assert.equal(meter.values.distinctSelectedOcids,2);
    const eoi=tracker.rows.find(row=>row.portfolio_id==='portfolio-01'),tender=tracker.rows.find(row=>row.ocid===TONBRIDGE);
    assert(eoi.full_deadline_text.startsWith('Expression of interest: '));
    assert.equal(eoi.deadline_timezone,'+01:00');assert.equal(eoi.full_deadline_date,'2026-10-16');
    assert.equal(eoi.deadline_context_status,'confirmed-current-expression-of-interest');
    assert.equal(tender.full_deadline_date,'2026-11-05');assert.equal(tender.deadline_timezone,'+00:00');
    const ids=[];
    for(const portfolio of config.portfolios){
      const workspace=new OcdsWorkspace(join(config.workspaceRoot,portfolio.id),{operator:config.operator});
      try{
        ids.push(workspace.metadata().id);
        const operations=new SourceOperations(workspace),state=operations.state();
        for(const window of state.windows.filter(value=>value.name==='baseline'))assert(window.sources.every(value=>value.status==='complete'),'Every supplied original family was adopted');
        for(const source of workspace.view().sources){const exact=workspace.getSource(source.id);assert.equal(exact.retrievedAt,null);assert(Number.isFinite(Date.parse(exact.importedAt)));assert(exact.acquisition?.completedBy);}
      }finally{workspace.close();}
    }
    assert.equal(new Set(ids).size,5);
    record('five-client-source-refresh',{status:baseline.status,workspaces:5,selectedRows:3,columns:32,uniqueOriginals:meter.values.uniquePayloads,sourceResults:(await readJson(join(baselineDirectory,'source-window-runs.json'))).portfolios});
    const primaryDirectory=join(config.workspaceRoot,'portfolio-01');
    const primary=await start({directory:primaryDirectory,operator:'source-window-http-operator'});
    const client=new OcdsClient(primary.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    let state=await client.sourceState();
    const originalDocument=state.documents.find(value=>value.document.url===documentFiles[0].observation.requestedUrl&&value.origin==='original-ocds-document');
    assert(originalDocument?.entryId&&originalDocument.sourceId&&originalDocument.sourcePointer);
    assert(originalDocument.versions.some(value=>value.sha256===documentFiles[0].observation.sha256));
    const downloaded=await client.sourceDocument(originalDocument.id,{sha256:documentFiles[0].observation.sha256});
    assert.equal(hash(downloaded.body),documentFiles[0].observation.sha256);
    const acquisition=acquisitions.acquisitions.find(value=>value.selectionId==='cymrusoc-record');
    const replay=await client.adoptSourceObservation({selectionId:'cymrusoc-record',rawText:(await readFile(acquisition.path,'utf8')),observation:acquisition.observation});
    assert.equal(replay.repeated,true);
    const work=state.work.find(value=>value.ocid===CYMRU);assert(work,'Original source changes are assigned');
    const first=await client.updateSourceReview(work.id,{expectedRevision:work.revision,status:'reviewing',owner:'cymru-client-a-operator',nextAction:'Review the Stage 1 response against the exact EOI and enquiry fields.'});
    await assert.rejects(()=>client.updateSourceReview(work.id,{expectedRevision:work.revision,status:'reviewing',owner:'stale-operator'}),error=>error.code==='SOURCE_REVIEW_CHANGED');
    let view=await client.workspace(),project=view.projects.find(value=>value.ocid===CYMRU);
    await client.updateReview(CYMRU,{expectedRevision:project.review.revision,disposition:'reviewing',owner:'cymru-client-a-operator',nextAction:'Prepare the selected client evidence for the 16 October EOI.',note:'Original EOI offset +01:00; separate enquiry deadline 14 October.',shortlisted:true});
    view=await client.workspace();project=view.projects.find(value=>value.ocid===CYMRU);
    const releases=project.entries.filter(value=>value.kind==='release').sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const compared=await client.compare(releases[0].id,releases.at(-1).id);
    assert(JSON.stringify(compared.changes).includes('2026-10-16T12:00:00+01:00'),'Exact publisher deadline survives release comparison');
    const otherWorkspace=new OcdsWorkspace(join(config.workspaceRoot,'portfolio-03'),{operator:'isolation-reader'});
    try{assert.notEqual(otherWorkspace.view().projects.find(value=>value.ocid===CYMRU).review.nextAction,project.review.nextAction);}finally{otherWorkspace.close();}
    record('originals-assignment-and-isolation',{documentId:originalDocument.id,documentSha256:documentFiles[0].observation.sha256,assignedReviewRevision:first.review.revision,exactComparisonCounts:compared.counts,originalReplay:true});
    const handoffDirectory=join(outDirectory,'reviewed-client-handoff');
    await command([operator,'source-handoff','--config',configPath,'--portfolio','portfolio-01','--baseline',join(baselineDirectory,'window.json'),'--out',handoffDirectory],configDirectory,join(outDirectory,'logs/current-client-handoff.json'));
    const receiverDirectory=join(outDirectory,'customer-workspace');
    const receiver=await start({directory:receiverDirectory,operator:'customer-operator',title:'Selected client receiving'});
    const receivingClient=new OcdsClient(receiver.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    const expectedHandoffId=(await readJson(join(handoffDirectory,'handoff.json'))).handoffId;
    const beforeReceiving=(await receivingClient.workspace()).workspace.revision;
    await assert.rejects(()=>receivingClient.receiveSourceHandoff(handoffDirectory,beforeReceiving,{expectedHandoffId:'0'.repeat(64)}),error=>error.code==='SOURCE_HANDOFF_CHANGED');
    assert.equal((await receivingClient.workspace()).workspace.revision,beforeReceiving,'A changed handoff identity leaves the destination unchanged');
    const received=await receivingClient.receiveSourceHandoff(handoffDirectory,beforeReceiving,{expectedHandoffId});
    const receivedView=await receivingClient.workspace();assert.deepEqual(receivedView.projects.map(value=>value.ocid),[CYMRU]);
    await receivingClient.updateReview(CYMRU,{expectedRevision:receivedView.projects[0].review.revision,disposition:'reviewing',owner:'customer-owner',nextAction:'Continue the received client review locally.',note:'Received original publisher and document context.',shortlisted:true});
    const repeated=await receivingClient.receiveSourceHandoff(handoffDirectory,(await receivingClient.workspace()).workspace.revision,{expectedHandoffId});
    assert.equal(repeated.repeated,true);assert.equal((await receivingClient.workspace()).projects[0].review.owner,'customer-owner');
    const originalSource=await receivingClient.source(acquisition.observation.sha256);assert.equal(originalSource.retrievedAt,null);assert.equal(originalSource.acquisition.completedBy,acquisition.observation.completedBy);
    record('complete-customer-receiving',{handoffId:received.handoffId,selectedOcids:[CYMRU],repeated:true,localOwner:'customer-owner'});
    const executiveDirectory=join(outDirectory,'executive-compass-workspace');
    const executiveService=await start({directory:executiveDirectory,operator:'highway-waste-operator',title:'Highway waste original review'});
    const executiveClient=new OcdsClient(executiveService.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    if(browser){
      result.browser=await browserJourney({origin:primary.origin,receiverOrigin:receiver.origin,executiveOrigin:executiveService.origin,
        executive:highway,documentSha:documentFiles[0].observation.sha256,outDirectory:join(outDirectory,'browser'),executablePath:browserExecutable});
      record('source-browser-and-original-acquisition',result.browser);
    }else{
      await executiveClient.saveSourceSelection({id:'leicestershire-record',label:'Highway Waste Services Framework_2026',provider:'find-tender',request:{kind:'record',ocid:highway.ocid},ocids:[highway.ocid],owner:'highway-waste-operator',acquireDocuments:false},0);
      const adopted=await executiveClient.adoptSourceObservation({selectionId:'leicestershire-record',name:'Original highway-waste acquisition',bodyBase64:highway.body.toString('base64'),observation:highway.observation});
      await executiveClient.refreshSources({windowId:adopted.window.id});await settledWindow(executiveClient,adopted.window.id);
    }
    const highwayView=await executiveClient.workspace();assert.deepEqual(highwayView.projects.map(value=>value.ocid),[highway.ocid]);
    const highwayProject=highwayView.projects[0],highwayEntry=await executiveClient.entry(highwayProject.currentEntryId);
    assert.equal(highwayProject.entries.filter(value=>value.kind==='release').length,4);
    assert.equal(highwayEntry.document.tender.tenderPeriod.endDate,'2026-11-06T12:00:00Z');
    assert.equal(highwayEntry.document.tender.enquiryPeriod.endDate,'2026-10-23T12:00:00+01:00');
    record('separate-highway-waste-workspace',{ocid:highway.ocid,releases:4,tenderDeadline:highwayEntry.document.tender.tenderPeriod.endDate,enquiryDeadline:highwayEntry.document.tender.enquiryPeriod.endDate});
    if(mcpModule){
      const native=await import(pathToFileURL(resolve(mcpModule)).href);
      assert.equal(typeof native.runSourceWindowMcpJourney,'function');
      const mcp=await native.runSourceWindowMcpJourney({sourceDirectory,outDirectory:join(outDirectory,'mcp'),workspaceDirectory:primaryDirectory,origin:primary.origin,client,
        sourceState:await client.sourceState(),ocid:CYMRU,selectionId:'cymrusoc-record',original:{path:acquisition.path,observation:acquisition.observation},
        originalDocuments:documentFiles.map(value=>({path:value.path,observation:value.observation})),handoffDirectory,receiverDirectory,
        executive:{workspaceDirectory:executiveDirectory,origin:executiveService.origin,ocid:highway.ocid,path:highway.path,observation:highway.observation}});
      record('native-mcp-source-workflow',mcp);
    }
    await receiver.close();services.delete(receiver);
    const reopened=new OcdsWorkspace(receiverDirectory,{operator:'customer-reopen'});
    try{
      assert.equal(reopened.view().projects[0].review.owner,'customer-owner');
      const retained=new SourceOperations(reopened),documents=retained.state().documents;
      const exact=documents.find(value=>value.versions.some(version=>version.sha256===documentFiles[0].observation.sha256));
      assert.equal(hash(retained.document(exact.id,{sha256:documentFiles[0].observation.sha256}).body),documentFiles[0].observation.sha256);
      assert(retained.state().receivings.length>0);
      record('editable-reopen',{workspaceId:reopened.metadata().id,owner:reopened.view().projects[0].review.owner,documentSha256:documentFiles[0].observation.sha256,receivings:retained.state().receivings.length});
    }finally{reopened.close();}
    result.status='passed';
  }catch(error){result.status='failed';result.error={name:error.name,code:error.code||null,message:error.message,stack:error.stack};throw error;}
  finally{
    for(const service of services)try{await service.close();}catch(error){result.closeError=error.message;}
    result.finishedAt=new Date().toISOString();await save(join(outDirectory,'source-window-result.json'),result);
  }
  return result;
}

/** Continue the retained operation after the receiving screenshot failure. */
export async function continueSourceWindowJourney({executiveOriginal,outDirectory,browser=true,browserExecutable,mcpModule}={}) {
  assert(outDirectory&&executiveOriginal?.path&&executiveOriginal?.observation,'Use the retained operation and original Executive acquisition');
  outDirectory=resolve(outDirectory);
  const priorPath=join(outDirectory,'source-window-result.json'),prior=await readJson(priorPath);
  assert(prior.stages.some(value=>value.stage==='complete-customer-receiving'),'Continue only after the saved source, review and client-receiving stages');
  const continuationDirectory=join(outDirectory,'continuation-'+new Date().toISOString().replace(/[^0-9A-Za-z]/g,''));
  await mkdir(continuationDirectory,{recursive:true,mode:0o700});
  const result={schema:'stellar-forge.ocds.source-window-journey.v1',startedAt:new Date().toISOString(),
    sourceDirectory,outDirectory:continuationDirectory,continuedFrom:priorPath,
    stages:clone(prior.stages),status:'running',
    retainedBrowserFiles:['source-windows-desktop.png','source-windows-mobile.png','browser-original-document.docx']
      .map(name=>join(outDirectory,'browser',name))};
  const record=(stage,details)=>{result.stages.push({stage,completedAt:new Date().toISOString(),...details});process.stderr.write(json({stage,...details}));};
  const services=new Set(),start=async options=>{const service=await startOcdsServer(options);services.add(service);return service;};
  try{
    for(const file of result.retainedBrowserFiles)assert((await stat(file)).isFile());
    const config=await readJson(join(outDirectory,'agency-configuration/pilot.json'));
    const acquisitions=await readJson(config.sourceAcquisitionsFile),originals=await readJson(config.sourceOriginalsFile);
    const acquisition=acquisitions.acquisitions.find(value=>value.selectionId==='cymrusoc-record');
    await original(acquisition.path,acquisition.observation);
    const documentFiles=await Promise.all(originals.originals.map(value=>original(value.path,value.observation)));
    const highway=await original(executiveOriginal.path,executiveOriginal.observation);
    highway.ocid=JSON.parse(highway.body.toString('utf8')).records[0].ocid;
    const primaryDirectory=join(config.workspaceRoot,'portfolio-01');
    const primary=await start({directory:primaryDirectory,operator:'source-window-http-operator'});
    const client=new OcdsClient(primary.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    const receiverDirectory=join(outDirectory,'customer-workspace');
    const receiver=await start({directory:receiverDirectory,operator:'customer-operator'});
    const receivingClient=new OcdsClient(receiver.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    assert.equal((await receivingClient.workspace()).projects.find(value=>value.ocid===CYMRU).review.owner,'customer-owner');
    const executiveDirectory=join(outDirectory,'executive-compass-workspace');
    const executiveService=await start({directory:executiveDirectory,operator:'highway-waste-operator',title:'Highway waste original review'});
    const executiveClient=new OcdsClient(executiveService.origin,{timeoutMs:120000,maxResponseBytes:256*1024*1024});
    assert.equal(browser,true,'This retained continuation completes the original browser phase');
    result.browser=await browserJourney({origin:primary.origin,receiverOrigin:receiver.origin,executiveOrigin:executiveService.origin,
      executive:highway,documentSha:documentFiles[0].observation.sha256,outDirectory:join(continuationDirectory,'browser'),
      executablePath:browserExecutable,resume:true,retainedHandoffDirectory:join(outDirectory,'browser/browser-client-handoff')});
    record('source-browser-and-original-acquisition',result.browser);
    const highwayView=await executiveClient.workspace();assert.deepEqual(highwayView.projects.map(value=>value.ocid),[highway.ocid]);
    const highwayProject=highwayView.projects[0],highwayEntry=await executiveClient.entry(highwayProject.currentEntryId);
    assert.equal(highwayProject.entries.filter(value=>value.kind==='release').length,4);
    assert.equal(highwayEntry.document.tender.tenderPeriod.endDate,'2026-11-06T12:00:00Z');
    assert.equal(highwayEntry.document.tender.enquiryPeriod.endDate,'2026-10-23T12:00:00+01:00');
    record('separate-highway-waste-workspace',{ocid:highway.ocid,releases:4,tenderDeadline:highwayEntry.document.tender.tenderPeriod.endDate,enquiryDeadline:highwayEntry.document.tender.enquiryPeriod.endDate});
    if(mcpModule){
      const native=await import(pathToFileURL(resolve(mcpModule)).href);
      assert.equal(typeof native.runSourceWindowMcpJourney,'function');
      const mcp=await native.runSourceWindowMcpJourney({sourceDirectory,outDirectory:join(continuationDirectory,'mcp'),
        workspaceDirectory:primaryDirectory,origin:primary.origin,client,sourceState:await client.sourceState(),
        ocid:CYMRU,selectionId:'cymrusoc-record',original:{path:acquisition.path,observation:acquisition.observation},
        originalDocuments:documentFiles.map(value=>({path:value.path,observation:value.observation})),
        handoffDirectory:join(outDirectory,'reviewed-client-handoff'),receiverDirectory,
        executive:{workspaceDirectory:executiveDirectory,origin:executiveService.origin,ocid:highway.ocid,path:highway.path,observation:highway.observation}});
      record('native-mcp-source-workflow',mcp);
    }
    await receiver.close();services.delete(receiver);
    const reopened=new OcdsWorkspace(receiverDirectory,{operator:'customer-reopen'});
    try{
      assert.equal(reopened.view().projects[0].review.owner,'customer-owner');
      const retained=new SourceOperations(reopened),documents=retained.state().documents;
      const exact=documents.find(value=>value.versions.some(version=>version.sha256===documentFiles[0].observation.sha256));
      assert.equal(hash(retained.document(exact.id,{sha256:documentFiles[0].observation.sha256}).body),documentFiles[0].observation.sha256);
      assert(retained.state().receivings.length>0);
      record('editable-reopen',{workspaceId:reopened.metadata().id,owner:reopened.view().projects[0].review.owner,
        documentSha256:documentFiles[0].observation.sha256,receivings:retained.state().receivings.length});
    }finally{reopened.close();}
    result.status='passed';
  }catch(error){result.status='failed';result.error={name:error.name,code:error.code||null,message:error.message,stack:error.stack};throw error;}
  finally{
    for(const service of services)try{await service.close();}catch(error){result.closeError=error.message;}
    result.finishedAt=new Date().toISOString();await save(join(continuationDirectory,'source-window-result.json'),result);
  }
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {values}=parseArgs({options:{input:{type:'string'},out:{type:'string'},browser:{type:'boolean'},resume:{type:'boolean'}}});
  if(!values.input||!values.out)throw Error('Use --input original-inputs.json --out a-new-output-directory [--browser].');
  const input=await readJson(resolve(values.input));
  (values.resume?continueSourceWindowJourney:runSourceWindowJourney)({...input,outDirectory:resolve(values.out),browser:values.browser===true})
    .then(value=>process.stdout.write(json(value))).catch(error=>{process.stderr.write(json({error:{message:error.message,code:error.code||error.name}}));process.exitCode=1;});
}
