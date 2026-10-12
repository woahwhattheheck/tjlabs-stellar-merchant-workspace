// MIT. Continue the one completed native Results case through its original console.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,stat,open,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(config.schema,'stellar-forge.iati-results-browser-selection.v1');
for(const key of ['sourceRoot','root','output','playwright','chromium','connectionFile','merchantRoot'])assert.ok(isAbsolute(config[key]),'Select absolute '+key);
const {IatiWorkspaceClient}=await import(pathToFileURL(join(config.sourceRoot,'iati','client.mjs')));
const {MerchantSourceWorkspaces}=await import(pathToFileURL(join(config.merchantRoot,'source-workspace.mjs')));
const privateUrl=(await readFile(config.connectionFile,'utf8')).trim(),client=new IatiWorkspaceClient(privateUrl);
const original=JSON.parse(await readFile(join(config.root,'result.json'),'utf8'));
assert.equal(original.state,'COMPLETE');assert.equal(original.operationId,config.operationId);
await mkdir(config.output,{recursive:true,mode:0o700});
const progressFile=join(config.output,'browser-progress.json'),resultFile=join(config.output,'browser-result.json');
let progress={schema:'stellar-forge.iati-results-browser-progress.v1',operationId:config.operationId,project:original.project,stages:{}};
try{const value=JSON.parse(await readFile(progressFile,'utf8'));assert.equal(value.project,original.project);assert.equal(value.operationId,config.operationId);progress=value;}catch(error){if(error.code!=='ENOENT')throw error;}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const checkpoint=async(stage,value)=>{progress.stages[stage]=value;progress.updatedAt=new Date().toISOString();
 const next=progressFile+'.next';await writeFile(next,JSON.stringify(progress,null,2)+'\n',{mode:0o600});await rename(next,progressFile);
 process.stdout.write(JSON.stringify({stage,state:'COMPLETE',project:original.project})+'\n');};
async function fileIdentity(path){const h=createHash('sha256');let bytes=0;const f=await open(path,'r');try{for await(const piece of f.createReadStream()){h.update(piece);bytes+=piece.length;}}finally{await f.close();}
 return{file:path,bytes,sha256:h.digest('hex')};}
async function retainedResponse(response,path){const h=createHash('sha256');let bytes=0;const f=await open(path,'wx',0o600);
 try{for await(const piece of response.body){h.update(piece);bytes+=piece.length;await f.writeFile(piece);}await f.sync();}finally{await f.close();}
 return{file:path,bytes,sha256:h.digest('hex')};}
const merchantExportRoot=join(config.output,'merchant');await mkdir(merchantExportRoot,{recursive:true,mode:0o700});
const merchant=new MerchantSourceWorkspaces({exportsDirectory:merchantExportRoot,sourceWorkspaces:{workspaces:{
 receiving:{label:'Original Results receiving',format:'iati',consoleUrlFile:config.connectionFile,files:{}}
}}});
let browser;
try{
 try{
  const complete=JSON.parse(await readFile(resultFile,'utf8'));
  assert.equal(complete.state,'COMPLETE');assert.equal(complete.operationId,config.operationId);assert.equal(complete.project,original.project);
  for(const item of Object.values(complete.artifacts))assert.deepEqual(await fileIdentity(item.file),item);
  const retained=await client.resultsProject(original.project,{revision:complete.reviewRevision});
  assert.equal(retained.sha256,complete.editionSha256);
  assert.equal((await client.resultsProject(original.project)).revision,complete.reviewRevision);
  process.stdout.write(JSON.stringify({...complete,reused:true})+'\n');
  await merchant.close();await client.dispose();process.exit(0);
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const baseline=await client.resultsProject(original.project,{revision:original.receivingRevision});
 assert.equal(baseline.sha256,original.receivingEditionSha256);
 const inventory=await client.resultsInventory();assert.ok(inventory.workspaceId);
 const projection=await client.resultsSource(original.sources[0].sha256);
 const page=await client.resultsIndicators(projection.projection.id,{limit:10});
 if(page.rows.length){const record=await client.resultsIndicator(projection.projection.id,page.rows[0].key);assert.equal(record.key,page.rows[0].key);}
 const raw=await client.resultsOriginalSource(original.sources[0].sha256);
 const h=createHash('sha256');let rawBytes=0;for await(const piece of raw.body){h.update(piece);rawBytes+=piece.length;}
 assert.equal(h.digest('hex'),original.sources[0].sha256);assert.equal(rawBytes,original.sources[0].bytes);
 await checkpoint('original-client-source',{workspaceId:inventory.workspaceId,projection:projection.projection.id,source:original.sources[0].sha256,bytes:rawBytes,indicatorPage:page.rows.length,totalIndicators:page.total});

 const {chromium}=await import(pathToFileURL(createRequire(import.meta.url).resolve(config.playwright)));
 const profile=join(config.output,'browser-profile');
 browser=await chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:true,viewport:{width:1440,height:1000},
  acceptDownloads:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
 const errors=[];browser.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
 const p=await browser.newPage();p.on('pageerror',error=>errors.push(error.message));
 const ui=p.locator('[data-panel="results"]');
 async function idle(){await p.locator('#main').waitFor();await p.waitForFunction(()=>document.getElementById('main')?.getAttribute('aria-busy')==='false');}
 async function click(name){await ui.getByRole('button',{name,exact:true}).click();await idle();}
 async function openProject(){await p.getByRole('button',{name:'Results',exact:true}).click();await idle();await click('Review project');
  await ui.getByLabel('Results project',{exact:true}).selectOption(original.project);await click('Open current head');}
 await p.goto(privateUrl,{waitUntil:'domcontentloaded'});await idle();await openProject();
 await ui.getByRole('heading',{name:'Project selection and named review',exact:true}).waitFor();

 // Retain the browser's original request before forwarding it. A interrupted
 // controller can reconcile this same request through the original client.
 if(progress.stages.uiRequest&&!progress.stages.uiReview){
  let receipt=await client.resultsRequest(progress.stages.uiRequest.requestId);
  if(!receipt.found){const response=await client.resultsSave(progress.stages.uiRequest);receipt={found:true,state:'COMPLETED',response};}
  assert.ok(receipt.found&&receipt.state!=='CANCELLED');
  await checkpoint('uiReview',{requestId:progress.stages.uiRequest.requestId,revision:receipt.response.revision,sha256:receipt.response.sha256});
  await click('Open current head');
 }
 if(!progress.stages.uiReview){
  let observed=null;
  await p.route('**/api/iati/results/save',async route=>{
   const input=route.request().postDataJSON();
   if(input.id!==original.project)throw Error('The original UI selected another project');
   observed=input;await checkpoint('uiRequest',input);await route.continue();
  });
  const originalNote=await ui.getByLabel('Purpose / scope notes',{exact:true}).inputValue();
  await ui.getByLabel('Purpose / scope notes',{exact:true}).fill(originalNote+'\nOriginal console receiving: inspect, review, publish and reopen this retained source project.');
  await ui.getByLabel('Review status',{exact:true}).selectOption('reviewed');
  await ui.getByLabel('Named reviewer',{exact:true}).fill(config.reviewer);
  await ui.getByLabel('Review conclusion / source basis',{exact:true}).fill(config.reviewNote);
  await click('Preview complete selected report');
  await ui.getByRole('heading',{name:'Complete selected report',exact:true}).waitFor();
  await click('Save new immutable revision');assert.ok(observed,'No original browser save request was observed');
  await p.unroute('**/api/iati/results/save');
  const receipt=await client.resultsRequest(observed.requestId);
  assert.ok(receipt.found&&receipt.state!=='CANCELLED');assert.equal(receipt.response.id,original.project);
  await checkpoint('uiReview',{requestId:observed.requestId,revision:receipt.response.revision,sha256:receipt.response.sha256});
 }
 const reviewed=await client.resultsProject(original.project,{revision:progress.stages.uiReview.revision});
 assert.equal(reviewed.sha256,progress.stages.uiReview.sha256);
 const head=await client.resultsProject(original.project);assert.equal(head.revision,reviewed.revision,'Another operator changed the selected head; retain that head and explicitly continue');
 await p.screenshot({path:join(config.output,'results-reviewed-desktop.png'),fullPage:true});
 await click('Source indicators');
 await ui.getByLabel('Original source',{exact:true}).selectOption(original.sources[0].sha256);await click('Inspect results');
 await ui.getByRole('heading',{name:'Original indicator inventory',exact:true}).waitFor();
 if(page.rows.length){await ui.getByRole('button',{name:'Inspect original records',exact:true}).first().click();await idle();
  await ui.getByRole('heading',{name:'Source-bound interpretation',exact:true}).waitFor();}
 await p.screenshot({path:join(config.output,'results-original-records.png'),fullPage:true});
 await checkpoint('source-browser',{rows:page.rows.length,total:page.total,originalRecordsVisible:page.rows.length>0});

 await click('Compare revisions');await ui.getByLabel('Saved project',{exact:true}).selectOption(original.project);await click('Read existing comparisons');
 if((await client.resultsComparisons(original.project)).comparisons.length){
  await ui.getByRole('button',{name:/^r[0-9]+ → r[0-9]+ · /}).first().click();
  await ui.getByRole('heading',{name:'Retained source / selection changes',exact:true}).waitFor();
 }
 await click('Receive / export');await ui.getByLabel('Saved project',{exact:true}).selectOption(original.project);
 await ui.getByLabel('Exact revision (blank = current head)',{exact:true}).fill(String(reviewed.revision));
 const artifacts={};
 for(const [label,key,filename]of [
  ['Download complete report / CSVs','browserReport','browser-results-report.zip'],
  ['Download full editable source project','browserProject','browser-results-project.zip']]){
  const target=join(config.output,filename);
  try{artifacts[key]=await fileIdentity(target);}catch(error){
   if(error.code!=='ENOENT')throw error;
   const pending=p.waitForEvent('download');await ui.getByRole('button',{name:label,exact:true}).click();
   const download=await pending;await download.saveAs(target);await idle();assert.equal(await download.failure(),null);
   artifacts[key]=await fileIdentity(target);
  }
 }
 // Receiving the exact browser export selects no new case and keeps the existing
 // local head. Its original immutable receipt is retained by the backend.
 await ui.getByLabel('Original receiving archive',{exact:true}).setInputFiles(artifacts.browserProject.file);
 await ui.getByLabel('Expected archive SHA256',{exact:true}).fill(artifacts.browserProject.sha256);
 await click('Verify and receive original project');
 assert.equal((await client.resultsProject(original.project)).revision,reviewed.revision);
 const afterReceive=await client.resultsInventory();assert.ok(afterReceive.receipts.length>=inventory.receipts.length);
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:join(config.output,'results-receiving-mobile.png'),fullPage:true});
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,'The mobile receiving page overflows horizontally');
 await p.setViewportSize({width:1440,height:1000});
 await p.reload({waitUntil:'domcontentloaded'});await idle();await openProject();
 assert.equal(await ui.getByLabel('Project title',{exact:true}).inputValue(),reviewed.definition.name);
 await checkpoint('browser-export-receive-reload',{revision:reviewed.revision,artifacts,localHeadPreserved:true,mobileOverflow:false});

 const mi=await merchant.call('merchant_source_iati_results_inventory',{workspace:'receiving',kind:'projects',limit:10});
 assert.ok(mi.native.items.some(v=>v.id===original.project));
 const mp=await merchant.call('merchant_source_iati_results_project',{workspace:'receiving',project:original.project,revision:reviewed.revision});
 assert.equal(mp.native.sha256,reviewed.sha256);
 const mr=await merchant.call('merchant_source_iati_results_report',{workspace:'receiving',project:original.project,revision:reviewed.revision});
 assert.equal(mr.native.report.reportSha256,reviewed.report.reportSha256);
 const mh=await merchant.call('merchant_source_iati_results_history',{workspace:'receiving',project:original.project,limit:100});
 assert.equal(mh.native.headRevision,reviewed.revision);
 const mq=await merchant.call('merchant_source_iati_results_request',{workspace:'receiving',requestId:progress.stages.uiReview.requestId});
 assert.equal(mq.native.response.sha256,reviewed.sha256);
 const me=progress.stages.merchantExport??await merchant.call('merchant_source_iati_results_export',{workspace:'receiving',project:original.project,revision:reviewed.revision,kind:'project'});
 if(!progress.stages.merchantExport)await checkpoint('merchantExport',me);
 const byteHash=createHash('sha256');let offset=0,readId,received=0;
 for(;;){
  const piece=await merchant.call('merchant_source_file_read',{workspace:'receiving',exportId:me.exportId,offset,limit:65536,...(readId?{readId}:{})});
  assert.equal(piece.encoding,'base64');assert.equal(piece.offset,offset);assert.equal(piece.file.sha256,me.sha256);
  const data=Buffer.from(piece.data,'base64');assert.equal(data.length,piece.bytesRead);
  if(!data.length&&received<me.bytes)throw Error('Original retained-file reader returned no complete bytes');
  byteHash.update(data);received+=data.length;
  if(piece.nextOffset===null){assert.equal(received,me.bytes);break;}
  offset=piece.nextOffset;readId=piece.readId;
 }
 assert.equal(received,me.bytes);assert.equal(byteHash.digest('hex'),me.sha256);
 const completeProject=join(config.output,'complete-results-project.zip');
 try{await link(join(merchantExportRoot,'source-consoles','receiving',me.exportId+'.data'),completeProject);}catch(error){if(error.code!=='EEXIST')throw error;}
 artifacts.completeProject=await fileIdentity(completeProject);assert.equal(artifacts.completeProject.sha256,me.sha256);
 await checkpoint('merchant-original-project',{export:me,bytes:received,history:mh.native.total,reportSha256:mr.native.report.reportSha256});
 assert.deepEqual(errors,[],'The original browser raised an uncaught application error');
 const result={schema:'stellar-forge.iati-results-browser-outcome.v1',state:'COMPLETE',operationId:config.operationId,
  project:original.project,originalReceivingRevision:original.receivingRevision,reviewRevision:reviewed.revision,
  editionSha256:reviewed.sha256,reportSha256:reviewed.report.reportSha256,source:original.sources[0].sha256,
  sourceBytes:rawBytes,sourceIndicators:page.total,publisherRequests:0,providerRequests:0,financialDatasetBuilds:0,
  browserErrors:errors,completedAt:new Date().toISOString(),artifacts,merchantExport:me,
  screenshots:['results-reviewed-desktop.png','results-original-records.png','results-receiving-mobile.png']};
 await writeFile(resultFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});process.stdout.write(JSON.stringify(result)+'\n');
}finally{await browser?.close();await merchant.close();await client.dispose();}
