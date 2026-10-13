// MIT. Continue the original accepted CIIM desk through its actual operator UI.
// No native transformation is invoked. The complete portable checkpoint is saved
// before this process starts; every browser write retains its original request.
'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {isDeepStrictEqual}=require('node:util');
const OPERATION='CIIM-METADATA-RECEIVING-DESK-ADC6-20261012';
const AUTHORITY='commons-adc6',ACTOR='ADC6 / Commons receiving operator';
const SOURCE='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/150';
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(v,m)=>{if(!v)throw new Error(m);};
const event=(name,data={})=>process.stdout.write(JSON.stringify({event:name,operation:OPERATION,...data})+'\n');
async function exists(p){try{return await fsp.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function read(p){return JSON.parse(await fsp.readFile(p,'utf8'));}
async function write(p,v){await fsp.mkdir(path.dirname(p),{recursive:true,mode:0o700});const t=p+'.'+randomUUID()+'.pending',f=await fsp.open(t,'wx',0o600);try{await f.writeFile(JSON.stringify(v,null,2)+'\n');await f.sync();}finally{await f.close();}await fsp.rename(t,p);}
async function descriptor(file){let bytes=0;const h=createHash('sha256');for await(const b of fs.createReadStream(file)){bytes+=b.length;h.update(b);}return {file,bytes,sha256:h.digest('hex')};}
async function exactCopy(source,target,expected){
 const actual=await descriptor(source);need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'The original export bytes differ.');
 await fsp.mkdir(path.dirname(target),{recursive:true,mode:0o700});
 try{await fsp.link(source,target);}catch(e){if(e.code!=='EEXIST')throw e;const prior=await descriptor(target);need(prior.bytes===actual.bytes&&prior.sha256===actual.sha256,'The retained original export was replaced.');}
 return {...expected,file:target};
}
async function runBrowser({root,modules,chromium,python='python3'}){
 root=path.resolve(root);need(modules&&chromium,'Use the existing Playwright package and Chromium executable.');
 const nativePath=path.join(root,'native-result.json'),resultPath=path.join(root,'browser-result.json');
 let native=await read(nativePath);
 need(native.operation===OPERATION&&['native_complete','browser_complete','browser_needs_continuation'].includes(native.status),'Complete the original native receiving and checkpoint before opening the browser.');
 const checkpointReceipt=path.join(root,'delivery','checkpoint-library-result.json');
 const saved=await read(checkpointReceipt);
 need(saved.returncode===0&&saved.result?.results?.length&&saved.result.results.every(x=>x.status==='succeeded'&&x.local_metadata_applied),'The complete portable native checkpoint must be saved before Chromium.');
 const selection=await read(path.join(root,'source-selection.json'));
 const workspace=path.join(root,'desk'),exports=path.join(root,'exports'),screens=path.join(root,'screenshots'),requests=path.join(root,'requests');
 await fsp.mkdir(screens,{recursive:true,mode:0o700});
 let result=await exists(resultPath)?await read(resultPath):{schema:'tjl.ciim.desk-browser-receiving.v1',operation:OPERATION,workspaceId:native.workspaceId,status:'in_progress',phases:{},attempts:[]};
 need(result.operation===OPERATION&&result.workspaceId===native.workspaceId,'The browser operation belongs to a different original case.');
 const attempt={startedAt:new Date().toISOString(),source:selection.source,errors:[],expectedNetworkFailures:[]};result.attempts.push(attempt);await write(resultPath,result);
 const {startCiimDeskServer}=await import(pathToFileURL(path.resolve(__dirname,'../server.mjs')).href);
 const {openCiimDesk}=await import(pathToFileURL(path.resolve(__dirname,'../model.mjs')).href);
 const {chromium:browserType}=require(path.resolve(modules));
 let server=null,context=null,page=null,base=null,token=null,closing=false,deliberateAbort=false;
 const labels={overview:'Overview',intake:'Intake',records:'Records',profiles:'Profiles',comparison:'Edition changes',handbacks:'Handbacks',context:'Receiving context',history:'History'};
 const editions=native.editions,records=native.recordSelection;
 async function save(){await write(resultPath,result);}
 async function phase(name,fn){
  if(result.phases[name]?.status==='complete')return result.phases[name].value;
  event('BROWSER_PHASE_START',{phase:name});
  try{const value=await fn();result.phases[name]={status:'complete',completedAt:new Date().toISOString(),value};await save();event('BROWSER_PHASE_COMPLETE',{phase:name,value});return value;}
  catch(error){result.status='needs_continuation';result.currentFailure={phase:name,message:error.message,recordedAt:new Date().toISOString()};await save();event('BROWSER_PHASE_FAILED',{phase:name,message:error.message});throw error;}
 }
 async function start(){
  server=await startCiimDeskServer({directory:workspace,python});const u=new URL(server.startup.url);base=u.origin;token=u.hash.slice(1);
  need(server.startup.workspaceId===native.workspaceId,'The actual browser listener opened a different desk.');
  return server.startup;
 }
 async function stop(){if(server){closing=true;const old=server;server=null;await old.close();closing=false;}}
 async function api(url,options={}){
  const response=await fetch(base+url,{...options,headers:{'X-CIIM-Session':token,...options.headers}});
  const value=await response.json();if(!response.ok)throw new Error((value.error?.code||response.status)+': '+(value.error?.message||'Original HTTP operation failed.'));return value;
 }
 async function jsonAct(body){return api('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 async function idle(){await page.waitForFunction(()=>document.getElementById('main')?.getAttribute('aria-busy')==='false'&&/^Revision \d+$/.test(document.getElementById('revision')?.textContent||''),null,{timeout:600000});}
 async function currentRevision(){return Number((await page.locator('#revision').textContent()).match(/\d+/)[0]);}
 async function openPage(url){await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await idle();await page.locator('#operator').fill(ACTOR);await page.locator('#operator').dispatchEvent('change');}
 async function nav(view){await page.locator('#navigation [data-view="'+view+'"]').click();await idle();need(await page.locator('#navigation [data-view="'+view+'"]').getAttribute('aria-current')==='page','The actual operator view did not open: '+view);}
 async function chooseEdition(id){await page.locator('#edition').selectOption(id);await idle();need(await page.locator('#edition').inputValue()===id,'The original edition selection changed.');}
 async function download(button,name,expected){
  const [received]=await Promise.all([page.waitForEvent('download',{timeout:600000}),button.click()]);
  const file=path.join(exports,name),pending=file+'.'+randomUUID()+'.pending';await received.saveAs(pending);
  const actual=await descriptor(pending);
  if(expected){need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'The browser download differs from the original retained bytes.');}
  try{await fsp.link(pending,file);}catch(e){if(e.code!=='EEXIST')throw e;const old=await descriptor(file);need(old.bytes===actual.bytes&&old.sha256===actual.sha256,'A prior browser download differs.');}finally{await fsp.unlink(pending);}
  await idle();return {...actual,file,suggestedFilename:received.suggestedFilename()};
 }
 async function getRecord(editionId,recordId){return api('/api/record?'+new URLSearchParams({editionId,recordId}));}
 async function showRecord(editionId,recordId){
  const record=await getRecord(editionId,recordId);
  await nav('records');await chooseEdition(editionId);await page.locator('#record-query').fill(record.identifier);await page.locator('#record-status').selectOption('');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();await idle();
  const rows=page.locator('#content table > tbody > tr').filter({has:page.locator('small.mono').filter({hasText:record.identifier})});
  need(await rows.count()===1,'The exact original identifier did not select one record.');
  await rows.first().locator('button.text-button').click();await idle();await page.locator('#detail').waitFor({state:'visible'});
  need((await page.locator('#detail-content').textContent()).includes(record.identifier),'The original record detail differs.');
  return record;
 }
 async function pendingRequest(){
  need(await page.locator('#pending').isVisible(),'The original browser request was not retained for recovery.');
  const value=JSON.parse(await page.locator('#pending-detail').textContent());
  return value.request??value;
 }
 async function trackedAct(key,type,submit,{dropReceipt=false}={}){
  const file=path.join(requests,'browser-'+hash(key)+'.json');
  let prior=await exists(file)?await read(file):null;
  if(prior?.request){
   need(prior.request.type===type,'The retained browser request type differs.');
   const receipt=await jsonAct(prior.request);
   need(receipt.operationId===prior.request.operationId&&receipt.type===prior.request.type&&receipt.revision===prior.request.expectedRevision+1,'The original browser request returned a different saved receipt.');
   prior.receipt=receipt;prior.reconciledAt=new Date().toISOString();await write(file,prior);
   return {...prior,reconciled:true};
  }
  let resolveRequest,rejectRequest;
  const accepted=new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;});
  const handler=async route=>{
   try{
    const request=route.request().postDataJSON();need(request.type===type,'The browser sent a different operation than selected.');
    prior={key,request,workspaceId:native.workspaceId,destination:{workspace},capturedAt:new Date().toISOString()};
    await write(file,prior);
    const response=await route.fetch({timeout:600000}),receipt=await response.json();
    prior.receipt=receipt;prior.httpStatus=response.status();prior.receivedAt=new Date().toISOString();await write(file,prior);
    if(!response.ok()){await route.fulfill({response});throw new Error('Original browser operation rejected: '+JSON.stringify(receipt.error));}
    need(receipt.operationId===request.operationId,'The original browser receipt belongs to another operation.');
    if(dropReceipt){deliberateAbort=true;await route.abort('failed');}else await route.fulfill({response});
    resolveRequest(prior);
   }catch(error){rejectRequest(error);try{await route.abort();}catch{}}
  };
  await page.route('**/api/act',handler,{times:1});
  try{await submit();const record=await accepted;await idle();return record;}
  finally{await page.unroute('**/api/act',handler);deliberateAbort=false;}
 }
 async function exactPendingRecovery(record){
  const file=path.join(requests,'browser-recovery-'+hash(record.request.operationId)+'.json');
  const retained=await exists(file)?await read(file):null;
  if(!await page.locator('#pending').isVisible()){
   need(retained&&isDeepStrictEqual(retained.request,record.request),'The original pending browser request and its recovery record are unavailable.');
   const receipt=await jsonAct(record.request);need(receipt.replayed===true&&receipt.operationId===record.request.operationId,'The original saved browser recovery receipt differs.');
   await write(file,{...retained,receipt,reconciledAt:new Date().toISOString()});
   return {receipt,browserRequestSent:false,recoveredRetainedReceipt:true};
  }
  const pending=await pendingRequest();need(isDeepStrictEqual(pending,record.request),'The visible original request changed before recovery.');
  if(retained)need(isDeepStrictEqual(retained.request,record.request),'The retained recovery attempt belongs to a different request.');
  await write(file,{...retained,request:record.request,pendingObservedAt:new Date().toISOString(),workspaceId:native.workspaceId});
  const sentPromise=page.waitForRequest(req=>req.method()==='POST'&&new URL(req.url()).pathname==='/api/act',{timeout:600000});
  const responsePromise=page.waitForResponse(res=>res.request().method()==='POST'&&new URL(res.url()).pathname==='/api/act',{timeout:600000});
  await page.locator('#recover').click();const sent=await sentPromise,response=await responsePromise;
  need(isDeepStrictEqual(sent.postDataJSON(),record.request),'Recovery changed the original browser request.');
  const receipt=await response.json();need(response.ok()&&receipt.replayed===true,'The saved browser operation was not replayed.');
  await write(file,{request:record.request,receipt,workspaceId:native.workspaceId,receivedAt:new Date().toISOString()});
  await idle();need(!await page.locator('#pending').isVisible(),'The successful original request remained pending.');
  return {receipt,browserRequestSent:true,recoveredRetainedReceipt:false};
 }
 async function reviewForm(label){
  const form=page.locator('form.review-form').filter({has:page.getByRole('heading',{name:label,exact:true})});
  need(await form.count()===1,'The actual named review form is ambiguous.');
  await form.getByLabel('Decision',{exact:true}).selectOption('accept');await form.getByLabel('Named authority',{exact:true}).selectOption(AUTHORITY);
  await form.getByLabel('Review note',{exact:true}).fill('Inspected the retained original XML and complete native mapped properties in the operator desk, preserving original identity and earlier named decisions.');
  await form.getByLabel('Decision reference',{exact:true}).fill(SOURCE);return form;
 }
 async function checkpoint(){
  await stop();
  const desk=await openCiimDesk({directory:workspace,python});
  try{
   const state=desk.state();need(state.workspaceId===native.workspaceId&&state.editions.reduce((n,x)=>n+x.counts.records,0)===569,'The final browser checkpoint lost original source coverage.');
   const exported=await desk.exportWorkspace();
   const target=path.join(exports,'browser-workspace-r'+exported.revision+'-'+exported.sha256.slice(0,16)+'.zip');
   const retained=await exactCopy(exported.file,target,exported);
   const historical=await desk.exportHandback({handbackId:native.handbacks.first});
   need(historical.sha256===native.firstHandbackExport.sha256&&historical.bytes===native.firstHandbackExport.bytes,'The original historical handback changed during browser work.');
   native.workspaceExport=retained;native.state=state;native.workspace=workspace;
   native.status=result.status==='complete'?'browser_complete':'browser_needs_continuation';
   native.browser={status:result.status,workspace,completedAt:result.completedAt??null,phases:Object.keys(result.phases).length,source:selection.source};
   await write(nativePath,native);result.checkpoint={...retained,firstHandbackSha256:historical.sha256};await save();
   event('BROWSER_CHECKPOINT_READY',{workspaceId:state.workspaceId,revision:state.revision,workspaceExport:retained,firstHandbackSha256:historical.sha256});
  }finally{await desk.close();}
 }
 let failed=null;
 try{
  const launched=await start();
  context=await browserType.launchPersistentContext(path.join(root,'browser-profile'),{headless:true,executablePath:path.resolve(chromium),viewport:{width:1365,height:900},acceptDownloads:true,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run']});
  page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>attempt.errors.push({kind:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error'){const item={kind:'console',message:message.text()};if(deliberateAbort&&/Failed to load resource|net::ERR_FAILED/.test(item.message))attempt.expectedNetworkFailures.push(item);else attempt.errors.push(item);}});
  page.on('requestfailed',request=>{const item={url:new URL(request.url()).pathname,message:request.failure()?.errorText};if(deliberateAbort||closing)attempt.expectedNetworkFailures.push(item);else if(!/net::ERR_ABORTED/.test(item.message||''))attempt.errors.push({kind:'requestfailed',...item});});
  await openPage(launched.url);
  need((await api('/api/state')).workspaceId===native.workspaceId,'The browser has opened a different original desk.');
  await phase('all-original-operator-sections',async()=>{
   const visited=[];for(const view of Object.keys(labels)){await nav(view);need(await page.locator('#content h2').count()>0,'The complete operator section is empty: '+view);visited.push({view,label:labels[view],heading:await page.locator('#content h2').first().textContent()});}
   return {visited,revision:await currentRevision()};
  });
  await phase('complete-operator-guide-download',async()=>{
   const file=selection.files.find(x=>x.path.endsWith('/desk/DESK_OPERATOR_GUIDE.md'));need(file,'Selected operator guide is missing.');
   const downloaded=await download(page.getByRole('link',{name:'Download operator guide',exact:true}),'operator-guide.md',file);
   need(downloaded.suggestedFilename==='CIIM-receiving-operator-guide.md','The complete operator guide download name differs.');return downloaded;
  });
  await phase('original-intake-preview-without-duplicate-population',async()=>{
   await nav('intake');await page.locator('#intake-file').setInputFiles(path.join(root,'original','CIIM-Proteus-native-receiving-case.zip'));
   await page.locator('#intake-sha256').fill(native.original.sha256);
   const replyPromise=page.waitForResponse(res=>res.request().method()==='POST'&&new URL(res.url()).pathname==='/api/import',{timeout:600000});
   await page.getByRole('button',{name:'Inspect original package',exact:true}).click();
   const reply=await replyPromise,preview=await reply.json();need(reply.ok()&&preview.kind==='native'&&preview.sha256===native.original.sha256,'The original browser intake differs.');
   await idle();need(preview.existingEditionIds.length===3&&preview.editions.reduce((n,x)=>n+x.counts.records,0)===569,'The browser intake did not identify the existing full source population.');
   const controls=page.locator('#content input[id^="receive-"]');need(await controls.count()===3,'The original three edition choices are missing.');
   for(let i=0;i<3;i++)need(await controls.nth(i).isDisabled(),'An already retained edition was offered as a duplicate source population.');
   return {candidateId:preview.candidateId,sha256:preview.sha256,existingEditionIds:preview.existingEditionIds,records:569};
  });
  await phase('original-record-pagination-and-source-download',async()=>{
   await nav('records');await chooseEdition(editions.datacite);
   await page.locator('#record-query').fill('');await page.locator('#record-status').selectOption('');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await idle();
   const first=await page.locator('#content table > tbody > tr small.mono').first().textContent();
   need((await page.locator('#content .pagination').textContent()).includes('of 231'),'The original complete record population is not shown.');
   await page.locator('#content .pagination').getByRole('button',{name:'Next',exact:true}).click();await idle();
   const second=await page.locator('#content table > tbody > tr small.mono').first().textContent();
   need(first!==second&&(await page.locator('#content .pagination').textContent()).includes('51–100'),'The original record page did not advance.');
   const record=await showRecord(editions.datacite,records.firstDatacite);
   const original=native.phases['complete-record-and-original-source-inspection'].value.downloads.find(x=>x.editionId===editions.datacite&&x.kind==='xml'&&x.requestId===record.native.provenance.requestId);
   need(original,'The retained exact original XML descriptor is missing.');
   const downloaded=await download(page.getByRole('button',{name:'Download Original XML page',exact:true}),'browser-original-datacite-page.xml',original);
   const properties=await page.locator('#detail-content').textContent();need(properties.includes('Complete native mapped record')&&properties.includes('Original provenance'),'The complete original native detail is missing.');
   await page.keyboard.press('Escape');need(!await page.locator('#detail').isVisible(),'Escape did not close the original record detail.');
   return {editionId:editions.datacite,recordId:record.id,identifier:record.identifier,firstPage:first,secondPage:second,originalXml:downloaded,escapeClosed:true};
  });
  const lost=await phase('retain-browser-context-write-after-lost-receipt',async()=>{
   await nav('context');const before=await api('/api/state');
   await page.locator('#context-label').fill('CIIM original metadata receiving desk — operator reviewed');
   await page.locator('#context-note').fill('Operator inspected the original record/source views and kept the current named receiving authority and processing profile. This same saved context request is retained across an interrupted response.');
   const record=await trackedAct('context-lost-receipt','context.save',()=>page.getByRole('button',{name:'Save receiving context',exact:true}).click(),{dropReceipt:true});
   const current=await api('/api/state');need(record.receipt.revision===record.request.expectedRevision+1&&current.revision===record.receipt.revision&&current.context.label===record.request.data.label,'The original context request did not retain its exact saved revision.');
   const pending=await pendingRequest();need(isDeepStrictEqual(pending,record.request),'The pending browser body differs from the original submitted request.');
   return {operationId:record.request.operationId,request:record.request,revision:record.receipt.revision,origin:base,recordFile:path.join(requests,'browser-'+hash('context-lost-receipt')+'.json')};
  });
  await phase('same-origin-browser-request-recovery-after-reopen',async()=>{
   const oldOrigin=base;await stop();const reopened=await start();need(base===oldOrigin,'The original listener moved to a different browser origin.');
   await openPage(reopened.url);const recovery=await exactPendingRecovery({request:lost.request}),receipt=recovery.receipt;
   need(receipt.revision===lost.revision&&(await api('/api/state')).revision===lost.revision,'Browser recovery duplicated the saved context write.');
   const operations=await api('/api/view?'+new URLSearchParams({view:'history',limit:250}));
   need(operations.items.filter(x=>x.operationId===lost.operationId).length===1,'The original recovered browser request has duplicate history.');
   if(recovery.browserRequestSent)need((await page.locator('#message').textContent()).includes('Recovered the original saved operation'),'The operator did not receive the original recovery receipt.');
   return {operationId:lost.operationId,replayed:receipt.replayed,revision:receipt.revision,origin:base,markerSha256:reopened.markerSha256,browserRequestSent:recovery.browserRequestSent,recoveredRetainedReceipt:recovery.recoveredRetainedReceipt};
  });
  await phase('named-original-record-review-in-browser',async()=>{
   const record=await showRecord(editions.datacite,records.firstDatacite),form=await reviewForm('Review this original record');
   const accepted=await trackedAct('named-record-review','records.review',()=>form.getByRole('button',{name:'Save named review',exact:true}).click());
   need(accepted.request.data.editionId===editions.datacite&&isDeepStrictEqual(accepted.request.data.recordIds,[record.id]),'The named browser review selected different original records.');
   const actual=await getRecord(editions.datacite,record.id);need(actual.effectiveDecision==='accept'&&actual.review.operationId===accepted.request.operationId,'The original record review did not persist.');
   return {operationId:accepted.request.operationId,recordId:record.id,revision:accepted.receipt.revision,authority:actual.review.authority};
  });
  await phase('original-profile-and-complete-edition-change-views',async()=>{
   await nav('profiles');await chooseEdition(editions.datacite);need(await page.getByRole('button',{name:'Download original profile',exact:true}).count()>0,'The retained native profiles are unavailable.');
   const specifications=await page.getByText('Complete native specification',{exact:true}).count();
   await nav('comparison');await page.locator('#comparison-selected').selectOption(native.comparisons.forward);await idle();
   need((await page.locator('#content').textContent()).includes('Named review covers the complete 169-record comparison'),'The named review scope lost the full original population.');
   let found=false,pageCount=0;
   while(true){
    pageCount++;const rows=page.locator('#content .panel').filter({has:page.locator('#comparison-selected')}).locator(':scope > .table-wrap > table > tbody > tr');
    const row=rows.filter({has:page.locator('code.mono').filter({hasText:records.originalIdentifier})});
    if(await row.count()){need((await row.first().textContent()).includes('restored'),'The original restoration is misclassified.');await row.first().getByRole('button',{name:'Later record',exact:true}).click();await idle();need((await page.locator('#detail-content').textContent()).includes(records.originalIdentifier),'The comparison opened a different original identifier.');await page.keyboard.press('Escape');found=true;break;}
    const next=page.locator('#content .pagination').getByRole('button',{name:'Next',exact:true});if(await next.isDisabled())break;await next.click();await idle();
   }
   need(found,'The full original restoration record could not be reached across pages.');
   return {nativeSpecifications:specifications,comparisonId:native.comparisons.forward,records:169,originalIdentifier:records.originalIdentifier,visiblePage:pageCount};
  });
  const browserHandback=await phase('complete-named-handback-from-operator-ui',async()=>{
   await nav('handbacks');await page.locator('#handback-label').fill('Original metadata receiving — operator reviewed handback');
   for(const id of Object.values(editions))await page.locator('#handback-editions input[value="'+id+'"]').check();
   for(const id of Object.values(native.comparisons))await page.locator('#handback-comparisons input[value="'+id+'"]').check();
   await page.locator('#handback-authority').selectOption(AUTHORITY);await page.locator('#handback-note').fill('Complete original source populations, native profiles and named receiving decisions inspected through the operator desk. The earlier immutable scoped handback remains available with its original exclusion and authority history.');
   const accepted=await trackedAct('complete-browser-handback','handback.create',()=>page.getByRole('button',{name:'Create immutable handback',exact:true}).click());
   const id=accepted.receipt.result.handbackId;need(id,'The actual operator handback receipt is missing.');
   const state=await api('/api/state'),h=state.handbacks.find(x=>x.id===id);need(h.editionIds.length===3&&h.comparisonIds.length===2,'The operator handback lost original selected populations.');
   return {handbackId:id,operationId:accepted.request.operationId,revision:accepted.receipt.revision,sha256:h.sha256,counts:h.counts};
  });
  await phase('exact-historical-and-current-browser-downloads',async()=>{
   await nav('handbacks');
   const historical=page.locator('#content table > tbody > tr').filter({has:page.locator('small.mono').filter({hasText:native.handbacks.first})});
   need(await historical.count()===1,'The original historical handback row is missing.');
   const first=await download(historical.getByRole('button',{name:'Download complete handback',exact:true}),'browser-historical-handback.zip',native.firstHandbackExport);
   const current=page.locator('#content table > tbody > tr').filter({has:page.locator('small.mono').filter({hasText:browserHandback.handbackId})});
   const latest=await download(current.getByRole('button',{name:'Download complete handback',exact:true}),'browser-reviewed-handback.zip');
   const complete=await download(page.locator('#workspace-export'),'browser-complete-workspace.zip');
   need(latest.bytes>0&&complete.bytes>native.original.bytes,'The complete original reviewed downloads are empty or incomplete.');
   return {historical:first,currentHandback:latest,workspace:complete};
  });
  await phase('responsive-full-workspace-and-keyboard-focus',async()=>{
   await nav('overview');await page.screenshot({path:path.join(screens,'ciim-receiving-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});const widths=[];
   for(const view of ['overview','records','profiles','comparison','handbacks','context','history']){
    await nav(view);const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    need(geometry.document<=geometry.viewport+1&&geometry.body<=geometry.viewport+1,'The '+view+' view overflows the390px operator viewport.');
    widths.push({view,...geometry});
   }
   await nav('records');await chooseEdition(editions.withdrawal);await page.locator('#record-status').selectOption('deleted');await page.locator('#record-query').fill('');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await idle();
   need((await page.locator('#content .pagination').textContent()).includes('of 1'),'The original withdrawn record filter lost its one-row population.');
   await page.screenshot({path:path.join(screens,'ciim-receiving-mobile-withdrawal.png'),fullPage:true});
   await nav('overview');await page.keyboard.press('Tab');await page.getByRole('link',{name:'Skip to workspace',exact:true}).focus();await page.keyboard.press('Enter');
   need(await page.locator('#main').evaluate(n=>n===document.activeElement),'The keyboard skip link did not focus the original workspace.');
   const original=await showRecord(editions.restored,records.restoredRecord);
   await page.locator('#close-detail').focus();await page.keyboard.press('Tab');
   need(await page.locator('#detail').evaluate(n=>n.contains(document.activeElement)),'Keyboard focus escaped the open record dialog.');
   await page.keyboard.press('Escape');need(!await page.locator('#detail').isVisible(),'Escape failed to close the mobile record dialog.');
   return {widths,keyboard:{skipLink:true,dialogFocus:true,escape:true},originalRestoredIdentifier:original.identifier};
  });
  await phase('ordinary-browser-reopen-preserves-final-case',async()=>{
   const before=await api('/api/state'),origin=base;await stop();const reopened=await start();need(base===origin,'The final ordinary reopen changed the original listener.');
   await openPage(reopened.url);const after=await api('/api/state');
   need(isDeepStrictEqual(after,before),'The final browser reopen changed the original retained case.');
   await nav('context');need(await page.locator('#context-label').inputValue()===after.context.label,'The saved operator context did not reopen.');
   need(after.handbacks.some(x=>x.id===browserHandback.handbackId),'The final complete operator handback did not reopen.');
   return {workspaceId:after.workspaceId,revision:after.revision,origin,editions:after.editions.length,records:after.editions.reduce((n,e)=>n+e.counts.records,0),handbackId:browserHandback.handbackId};
  });
  need(attempt.errors.length===0,'The actual operator browser reported unexpected errors: '+JSON.stringify(attempt.errors));
  result.status='complete';result.completedAt=new Date().toISOString();delete result.currentFailure;await save();
 }catch(error){failed=error;result.status='needs_continuation';result.currentFailure??={message:error.message,recordedAt:new Date().toISOString()};await save();}
 finally{
  closing=true;if(context){await context.close();context=null;}closing=false;await stop();
  try{await checkpoint();}catch(error){result.checkpointError={message:error.message,recordedAt:new Date().toISOString()};await save();if(!failed)failed=error;}
 }
 if(failed)throw failed;
 event('BROWSER_COMPLETE',{resultFile:resultPath,workspaceId:result.workspaceId,phases:Object.keys(result.phases).length,checkpoint:result.checkpoint,consoleErrors:attempt.errors.length});return result;
}
module.exports={runBrowser,OPERATION};
if(require.main===module){
 const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i];if(!['--root','--modules','--chromium','--python'].includes(k)||!a[i+1])throw Error('Use --root --modules --chromium and optional --python.');o[k.slice(2)]=a[i+1];}
 runBrowser(o).catch(error=>{event('BROWSER_FAILED',{message:error.message,stack:error.stack});process.exitCode=1;});
}
