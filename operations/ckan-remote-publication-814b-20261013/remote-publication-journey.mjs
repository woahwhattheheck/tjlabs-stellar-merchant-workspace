// One complete operator journey against an isolated CKAN Action protocol fixture.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openCkanWorkbench } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/model.mjs';
import { startCkanServer } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/server.mjs';
import { receiveCkanWorkspaceArchive } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/archive.mjs';
import { readCkanCapture } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/capture.mjs';
import { parseRemote, stringifyRemote, cloneRemote, remoteIdentity } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/remote-json.mjs';
import { requestRemoteCkan } from './stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/remote-adapter.mjs';
import { atomicJson } from './stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
const root=process.cwd(), cfg=JSON.parse(await readFile(join(root,'journey-input.json'),'utf8'));
const token=randomUUID()+randomUUID(), environment={...process.env,REMOTE_JOURNEY_TOKEN:token};
const targets={packages:new Map(),resources:new Map()}, calls=[], problems=[];
let loseResourceResponse=true, mode=null, workbench, browser=null, listener=null;
function envelope(res,value,status=200) {res.writeHead(status,{'content-type':'application/json'});res.end(stringifyRemote(value));}
const server=createServer(async(req,res)=>{
  try {
    assert.equal(req.headers.authorization,token);
    const url=new URL(req.url,'http://127.0.0.1'), action=url.pathname.split('/').at(-1);
    let parameters=Object.fromEntries(url.searchParams);
    if(req.method==='POST'){const chunks=[];for await(const p of req)chunks.push(p);parameters=parseRemote(Buffer.concat(chunks));}
    calls.push({action,method:req.method,id:parameters.id??parameters.name??null});
    if(mode==='rate'){res.writeHead(429,{'content-type':'text/html','retry-after':'17'});res.end('<html>rate limited</html>');return;}
    if(mode==='reflection'){
      res.writeHead(200,{'content-type':'application/json','etag':token});
      const escaped=[...token].map(ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0')).join('');
      res.end('{"success":true,"result":{"decoded":"'+escaped+'"}}');return;
    }
    const pkgFor=id=>targets.packages.get(id)??[...targets.packages.values()].find(p=>p.name===id);
    const current=action==='package_show'?pkgFor(parameters.id):targets.resources.get(parameters.id);
    if(['package_show','resource_show'].includes(action)){
      if(!current){envelope(res,{success:false,error:{__type:'Not Found Error',message:'Not found'}},404);return;}
      const value=cloneRemote(current);
      if(action==='package_show')value.resources=[...targets.resources.values()].filter(x=>x.package_id===value.id).map(cloneRemote);
      envelope(res,{success:true,result:value});return;
    }
    let result;
    if(action==='package_create'){
      assert.equal(parameters.id,undefined);
      assert(!pkgFor(parameters.name));
      result={...cloneRemote(parameters),id:randomUUID(),metadata_created:'2026-10-13T07:00:00Z',metadata_modified:'2026-10-13T07:00:00Z'};
      targets.packages.set(result.id,result);
    } else if(action==='resource_create'){
      assert(pkgFor(parameters.package_id));assert(!targets.resources.has(parameters.id));
      result=cloneRemote(parameters);targets.resources.set(result.id,result);
      if(loseResourceResponse){loseResourceResponse=false;res.destroy();return;}
    } else if(action==='package_patch'){
      result=pkgFor(parameters.id);assert(result);Object.assign(result,cloneRemote(parameters));
      result.metadata_modified='2026-10-13T07:01:00Z';
    } else if(action==='resource_patch'){
      result=targets.resources.get(parameters.id);assert(result);Object.assign(result,cloneRemote(parameters));
    } else {throw Error('Unexpected action '+action);}
    envelope(res,{success:true,result:cloneRemote(result)});
  } catch(error){problems.push(error.stack);envelope(res,{success:false,error:{__type:'Validation Error',message:error.message}},409);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const originalFetch=globalThis.fetch, port=server.address().port;
globalThis.fetch=(value,options)=>{const url=new URL(value);assert.equal(url.origin,'https://ckan-native-journey.example.org');
  return originalFetch('http://127.0.0.1:'+port+url.pathname+url.search,options);};
const settle=async started=>{const op=await started.completion;assert.equal(op.state,'COMPLETE',JSON.stringify(op.error));return op.result;};
const posts=()=>calls.filter(x=>x.method==='POST').length;
const report={operation:'CKAN-REMOTE-PUBLICATION-814B-20261013',target:'isolated local CKAN 2.11 Action protocol fixture',
  source:'original complete Zürich source captures, version0',checks:[],startedAt:new Date().toISOString()};
const visual=report.rendered={operation:report.operation,inspection:'awaiting-producing-peer-view',images:[],downloads:[]};
const pageErrors=[];

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

async function remotePage() {
  if(!browser){
    const {chromium}=await import('playwright');
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
      ...(cfg.browserExecutable?{executablePath:cfg.browserExecutable}:{})});
  }
  if(!listener)listener=await startCkanServer({workbench});
  const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true});
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(listener.url,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Catalogue publication',exact:true}).click();
  return page;
}
async function closeRenderedBrowser(){
  if(browser){await browser.close();browser=null;}
  if(listener){await listener.close();listener=null;}
}
async function awaitRenderedPublication(page,id,state,title){
  await page.waitForFunction(({id,state,title})=>{
    const selected=document.querySelector('select[name="release"]');
    return selected?.value===id && [...document.querySelectorAll('.card')].some(card=>
      [...card.querySelectorAll('h3')].some(heading=>heading.textContent===title) &&
      [...card.querySelectorAll('.pill')].some(pill=>pill.textContent===state));
  },{id,state,title},{timeout:120000});
}
async function awaitPublication(id,state){
  const deadline=Date.now()+120000;
  for(;;){if((await workbench.remotePublication(id)).state===state)return;
    if(Date.now()>deadline)throw new Error('Original browser publication did not reach '+state);
    await new Promise(resolve=>setTimeout(resolve,100));}
}
try {
  const captures=await Promise.all(cfg.captures.map(path=>readCkanCapture(path)));
  captures.sort((a,b)=>a.manifest.rowCount-b.manifest.rowCount);
  assert.deepEqual(captures.map(c=>c.manifest.rowCount),[3821,4389]);
  const home=join(root,'operator');await mkdir(home,{mode:0o700});
  const directory=join(home,'original');
  workbench=await openCkanWorkbench({directory,create:true,origin:captures[0].manifest.catalogOrigin,environment});
  const emptyPage=await remotePage();await renderedWidths(emptyPage,'empty-publication-workspace');
  await closeRenderedBrowser();
  const sourceIds=[];
  for(const capture of captures){
    const received=await settle(workbench.importCapture(capture.manifestFile,{expectedManifestSha256:capture.manifestSha256}));
    const source=await settle(workbench.saveSource(received.id,{title:'Retained Zürich edition '+capture.manifest.rowCount,
      expectedCaptureSha256:capture.manifestSha256,projection:{record_id:{field:'_id',type:'integer',nullable:false,encoding:'native'}}}));
    sourceIds.push(source.id);
  }
  report.sourceRows=captures.map(c=>c.manifest.rowCount);report.sourceManifests=captures.map(c=>c.manifestSha256);
  const targetId=randomUUID();
  await settle(workbench.saveRemoteTarget({id:targetId,label:'Owned protocol journey',origin:'https://ckan-native-journey.example.org',authTokenEnv:'REMOTE_JOURNEY_TOKEN'}));
  const first=randomUUID(), exact=parseRemote('{"native_count":9007199254740993,"ratio":0.123456789012345678901}');
  await settle(workbench.prepareRemotePublication({id:first,title:'First reviewed edition',targetId,sourceIds:[sourceIds[0]],
    package:{mode:'create',fields:{name:'remote-journey-814b',title:'First complete edition',notes:'Original retained source'}},
    resources:[{key:'data',mode:'create',sourceId:sourceIds[0],fields:{name:'Original data',url:'https://example.org/reviewed-first.csv',format:'CSV',...exact,signed_zero:-0}}]}));
  let record=await workbench.remotePublication(first);
  const review={expectedPlanSha256:record.planSha256,reviewer:'814B native operator',decision:'approve',reason:'Reviewed original source and explicit linked distribution.'};
  await settle(workbench.reviewRemotePublication(first,review));record=await workbench.remotePublication(first);
  const originalReviewId=record.review.id;
  await settle(workbench.reviewRemotePublication(first,review));assert.equal((await workbench.remotePublication(first)).review.id,originalReviewId);
  const guard={expectedPlanSha256:record.planSha256,expectedReviewId:originalReviewId};
  const interrupted=await workbench.publishRemotePublication(first,guard).completion;
  assert.equal(interrupted.state,'FAILED');
  record=await workbench.remotePublication(first);assert.equal(record.state,'UNCERTAIN');assert.equal(posts(),2);
  const beforeClose=calls.length;await workbench.close();workbench=null;
  workbench=await openCkanWorkbench({directory,environment});assert.equal(calls.length,beforeClose);
  const beforeReconcile=posts(),recoverPage=await remotePage();
  await recoverPage.getByRole('button',{name:'Read and reconcile the same target',exact:true}).waitFor();
  await awaitRenderedPublication(recoverPage,first,'UNCERTAIN','First reviewed edition');
  await renderedWidths(recoverPage,'uncertain-original-dispatch');
  await recoverPage.getByRole('button',{name:'Read and reconcile the same target',exact:true}).click();
  await awaitPublication(first,'COMPLETE');
  await recoverPage.getByRole('button',{name:'Download complete publication record',exact:true}).waitFor();
  await awaitRenderedPublication(recoverPage,first,'COMPLETE','First reviewed edition');
  await renderedView(recoverPage,'original-target-reconciled');
  await closeRenderedBrowser();
  record=await workbench.remotePublication(first);assert.equal(record.state,'COMPLETE');assert.equal(posts(),beforeReconcile);
  assert.equal(remoteIdentity(targets.resources.get(record.progress[1].observedId).native_count),remoteIdentity(exact.native_count));
  assert.equal(remoteIdentity(targets.resources.get(record.progress[1].observedId).signed_zero),remoteIdentity(-0));
  await settle(workbench.publishRemotePublication(first,guard));assert.equal(posts(),beforeReconcile);
  report.checks.push('Identical review retry retained approval','Committed resource with lost response reconciled after cold workbench reopen without another POST','Complete publication replay performed no writes','Exact large integer and decimal metadata preserved');
  const pkgId=record.progress[0].observedId,resId=record.progress[1].observedId,second=randomUUID();
  const deletedResource=cloneRemote(targets.resources.get(resId)), beforeDeletedReconcile=posts();
  assert(record.progress[1].confirmedAt);assert(record.progress[1].attempts>0);
  targets.resources.delete(resId);
  for(let observation=0;observation<2;observation++){
    await settle(workbench.reconcileRemotePublication(first));
    const observed=await workbench.remotePublication(first);
    assert.equal(observed.state,'CONFLICT');assert.equal(observed.progress[1].status,'CONFLICT');
    assert(observed.progress[1].confirmedAt);assert.equal(posts(),beforeDeletedReconcile);
  }
  targets.resources.set(resId,deletedResource);
  await settle(workbench.reconcileRemotePublication(first));
  assert.equal((await workbench.remotePublication(first)).progress[1].status,'CONFLICT');
  assert.equal((await workbench.remotePublication(first)).state,'CONFLICT');
  const deletedRefused=await workbench.publishRemotePublication(first,guard).completion;
  assert.equal(deletedRefused.state,'FAILED');assert.equal(posts(),beforeDeletedReconcile);
  report.checks.push('Actually confirmed creation deleted remotely remained CONFLICT through two absent-target reconciliations and restoration; its original approval could not recreate it');
  const input={id:second,title:'Following reviewed source edition',targetId,sourceIds:[sourceIds[1]],previousReleaseId:first,
    package:{mode:'patch',id:pkgId,fields:{title:'Following complete edition'}},
    resources:[{key:'data',mode:'patch',id:resId,sourceId:sourceIds[1],fields:{url:'https://example.org/reviewed-following.csv',description:'Following retained source'}}]};
  await settle(workbench.prepareRemotePublication(input));record=await workbench.remotePublication(second);
  await settle(workbench.reviewRemotePublication(second,{...review,expectedPlanSha256:record.planSha256}));
  record=await workbench.remotePublication(second);
  await settle(workbench.publishRemotePublication(second,{expectedPlanSha256:record.planSha256,expectedReviewId:record.review.id}));
  assert.equal((await workbench.remotePublication(second)).state,'COMPLETE');
  report.checks.push('Following source edition patched the same original package and resource');
  const conflict=randomUUID();
  await settle(workbench.prepareRemotePublication({...input,id:conflict,previousReleaseId:second,package:{mode:'patch',id:pkgId,fields:{title:'Explicit third review'}}}));
  record=await workbench.remotePublication(conflict);
  await settle(workbench.reviewRemotePublication(conflict,{...review,expectedPlanSha256:record.planSha256}));
  record=await workbench.remotePublication(conflict);
  targets.packages.get(pkgId).notes='Independent target edit';
  const beforeConflict=posts();
  await settle(workbench.publishRemotePublication(conflict,{expectedPlanSha256:record.planSha256,expectedReviewId:record.review.id}));
  assert.equal((await workbench.remotePublication(conflict)).state,'CONFLICT');assert.equal(posts(),beforeConflict);
  assert.equal(targets.packages.get(pkgId).notes,'Independent target edit');
  targets.packages.get(pkgId).notes='Original retained source';
  await settle(workbench.reconcileRemotePublication(conflict));
  assert.equal((await workbench.remotePublication(conflict)).state,'CONFLICT');
  const refused=await workbench.publishRemotePublication(conflict,{expectedPlanSha256:record.planSha256,expectedReviewId:record.review.id}).completion;
  assert.equal(refused.state,'FAILED');assert.equal(posts(),beforeConflict);
  report.checks.push('Changed target preimage became a retained conflict without overwrite; repeated reconciliation retained the conflict even after baseline restoration');
  const target=workbench.remoteTarget(targetId);mode='rate';
  let rate;try{await requestRemoteCkan(target,'status_show',{}, {environment});}catch(e){rate=e;}
  assert.equal(rate?.category,'rate');assert.equal(rate.retryAfter,'17');mode='reflection';
  let retained=false,reflection;try{await requestRemoteCkan(target,'status_show',{}, {environment,onResponse:()=>{retained=true;}});}catch(e){reflection=e;}
  assert.equal(reflection?.code,'CKAN_REMOTE_CREDENTIAL_REFLECTED');assert.equal(retained,false);
  assert(!Object.values(reflection.receipt.headers).some(value=>value.includes(token)));mode=null;
  report.checks.push('HTML rate response preserved Retry-After','Credential reflection in headers and escaped JSON was excluded from retained response');
  const expectedStates=['CONFLICT','COMPLETE','CONFLICT'];
  {
    const page=await remotePage();
    await page.getByLabel('Publication to inspect',{exact:true}).selectOption(conflict);
    await awaitRenderedPublication(page,conflict,'CONFLICT',input.title);
    await renderedView(page,'retained-target-conflict');
    await page.getByRole('button',{name:'Start a new publication mapping',exact:true}).click();
    const browserId=randomUUID(), browserInput={...input,id:browserId,previousReleaseId:second,title:'Browser operated following edition',
      package:{mode:'patch',id:pkgId,fields:{title:'Browser reviewed complete edition'}},
      resources:[{key:'data',mode:'patch',id:resId,sourceId:sourceIds[1],
        fields:{url:'https://example.org/browser-reviewed.csv',native_count:exact.native_count}}]};
    await page.getByLabel('Complete dataset and resource mapping').fill('{');
    await page.getByRole('button',{name:'Prepare or resume this exact plan',exact:true}).click();
    await page.locator('#notice .error').waitFor();
    await renderedView(page,'invalid-mapping-editor');
    await page.getByLabel('Complete dataset and resource mapping').fill(stringifyRemote(browserInput));
    await page.getByRole('button',{name:'Prepare or resume this exact plan',exact:true}).click();
    await page.getByLabel('Reviewer',{exact:true}).waitFor();
    await awaitRenderedPublication(page,browserId,'READY',browserInput.title);
    const intended=page.locator('.card').filter({has:page.getByRole('heading',{name:'Source bindings and intended target changes',exact:true})});
    for(const details of await intended.locator(':scope > details').all()){
      if((await details.getAttribute('open'))===null)await details.locator(':scope > summary').click();
    }
    await renderedWidths(page,'prepared-complete-target-plan');
    await page.getByLabel('Reviewer',{exact:true}).fill('814B browser operator');
    await page.getByLabel('Source, metadata and target decision').fill('Reviewed original full source and target fields in the browser.');
    await page.getByRole('button',{name:'Record plan decision',exact:true}).click();
    await page.getByRole('button',{name:'Publish approved plan',exact:true}).click();
    for(let i=0;i<60;i++){if((await workbench.remotePublication(browserId)).state==='COMPLETE')break;await new Promise(resolve=>setTimeout(resolve,500));}
    assert.equal((await workbench.remotePublication(browserId)).state,'COMPLETE');
    assert.equal(targets.packages.get(pkgId).title,'Browser reviewed complete edition');
    assert.equal(remoteIdentity(targets.resources.get(resId).native_count),remoteIdentity(exact.native_count));
    await awaitRenderedPublication(page,browserId,'COMPLETE',browserInput.title);
    await renderedWidths(page,'published-following-edition');
    const downloadedRecord=parseRemote(await userDownload(page,'Download complete publication record','published-record.json'));
    assert.equal(downloadedRecord.id,browserId);assert.equal(downloadedRecord.state,'COMPLETE');
    const downloadedPlan=parseRemote(await userDownload(page,'Download exact reviewed plan','reviewed-plan.json'));
    assert.equal(downloadedPlan.inputSha256,downloadedRecord.inputSha256);
    assert.deepEqual(pageErrors,[]);
    report.browser={state:'PASS',publicationId:browserId,pageErrors};
    expectedStates.push('COMPLETE');
    report.checks.push('Actual browser prepared, reviewed and published a following edition through the authenticated original server with exact numeric metadata');
    await closeRenderedBrowser();
  }
  const archive=await settle(workbench.archiveWorkspace({out:join(home,'complete-remote-workspace.ckanw')}));
  await workbench.close();workbench=null;
  const beforeReceiving=calls.length, receivedRoot=join(home,'received');
  const received=await receiveCkanWorkspaceArchive({file:archive.file??archive.out,directory:receivedRoot,expectedSha256:archive.sha256});
  workbench=await openCkanWorkbench({directory:receivedRoot,environment:{}});
  assert.equal(calls.length,beforeReceiving);
  assert.deepEqual(workbench.status().remote.releases.map(r=>r.state),expectedStates);
  for(const id of workbench.status().remote.releases.map(row=>row.id)){
    const retainedRecord=await workbench.remotePublication(id);
    await workbench.remotePublicationFile(id,'record');await workbench.remotePublicationFile(id,'plan');
    for(const receipt of retainedRecord.receipts)await workbench.remotePublicationFile(id,'receipt',receipt.id);
  }
  assert.equal((await workbench.remotePublication(first)).review.id,originalReviewId);
  assert.equal(workbench.remoteTarget(targetId).credentialAvailable,false);
  await workbench.close();workbench=null;
  workbench=await openCkanWorkbench({directory:receivedRoot,environment:{}});
  assert.equal(calls.length,beforeReceiving);
  report.checks.push('Complete original workspace archive received and all plan/response files verified','Cold receiving retained exact source/review/target state without credentials or network');
  const receivedPage=await remotePage();
  await receivedPage.getByLabel('Publication to inspect',{exact:true}).selectOption(report.browser.publicationId);
  await receivedPage.getByRole('button',{name:'Download complete publication record',exact:true}).waitFor();
  await awaitRenderedPublication(receivedPage,report.browser.publicationId,'COMPLETE','Browser operated following edition');
  await renderedWidths(receivedPage,'cold-received-publication');
  const reopenedRecord=parseRemote(await userDownload(receivedPage,'Download complete publication record','received-record.json'));
  assert.equal(reopenedRecord.id,report.browser.publicationId);assert.equal(reopenedRecord.state,'COMPLETE');
  assert.equal(calls.length,beforeReceiving);assert.deepEqual(pageErrors,[]);
  await closeRenderedBrowser();
  report.checks.push('Actual desktop/narrow operator views, original read-only browser reconciliation and complete record/plan downloads returned for producing-peer inspection.');
  report.publications={first,second,conflict,targetId,packageId:pkgId,resourceId:resId};
  report.requests={total:calls.length,writes:posts(),actions:calls};
  report.archive=archive;report.received=received;assert.deepEqual(problems,[]);
  report.state='PASS';
} catch(error){report.state='FAIL';report.error={message:error.message,code:error.code,stack:error.stack};report.providerErrors=problems;}
finally {
  // Attempt every original resource close independently in its original order.
  // A rejected browser
  // close must not skip the owner/workbench, fetch restoration or saved result.
  const cleanupActions=[
    ['browser',async()=>{const owned=browser;if(owned){await owned.close();if(browser===owned)browser=null;}}],
    ['listener',async()=>{const owned=listener;if(owned){await owned.close();if(listener===owned)listener=null;}}],
    ['workbench',async()=>{const owned=workbench;if(owned){await owned.close();if(workbench===owned)workbench=null;}}],
    ['protocol target',async()=>{
      server.closeAllConnections();
      await new Promise((resolve,reject)=>server.close(error=>
        error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve()));
    }]
  ];
  const cleanupErrors=[];
  for(const [resource,close] of cleanupActions){
    try { await close(); }
    catch(error){
      cleanupErrors.push({
        resource,message:String(error?.message??error),
        ...(error?.code?{code:error.code}:{}),
        ...(error?.stack?{stack:error.stack}:{})
      });
    }
  }
  globalThis.fetch=originalFetch;
  delete report.cleanupErrors;
  if(cleanupErrors.length){
    report.cleanupErrors=cleanupErrors;
    report.state='FAIL';
    report.error??={message:'Original receiving resources did not all close; see cleanupErrors.'};
  }
}
report.completedAt=new Date().toISOString();
await writeFile(join(root,'remote-publication-result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));if(report.state!=='PASS')process.exitCode=1;
