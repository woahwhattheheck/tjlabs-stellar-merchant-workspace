// MIT. One Zarr browser, publisher, SF82 and borrowed-MCP continuation.
import {pathToFileURL} from 'node:url';
import {
 assert,readFile,mkdir,lstat,join,dirname,resolve,hash,jsonBytes,save,saveBytes,optional,fileIdentity,
 absolute,privateDirectory,availablePort,waitFor,paged,exactRows,openStage,native,errorView,stamp,captureOnce,SDK,RELEASE,MCP
} from './common.mjs';
import {receiveClient} from './customer.mjs';

export async function receiveZarrMerchant(input,inputSha256){
 const stage=await openStage(input,inputSha256,'merchant'),{directory:output,intent,intentFile,checkpoint,requestId}=stage;
 if(stage.completed)return stage.completed;
 const baselineBytes=await readFile(input.sourceStage.resultFile);
 assert.equal(hash(baselineBytes),input.sourceStage.resultSha256);
 const baseline=JSON.parse(baselineBytes);assert.equal(baseline.state,'SOURCE_WORKSPACE_COMPLETE');
 assert.equal(baseline.operationId,input.operationId);assert.equal(baseline.workspace,input.workspaceDirectory);
 const importAt=p=>import(pathToFileURL(join(input.sourceRoot,p)).href);
 const [{startZarrServer},{readZarrSourceFile},deployment,{datasetControl},{startReleaseConsole},
  {initReleaseStore,releaseStatus,inspectRelease},{startMerchantMcp},{chromium}]=await Promise.all([
  importAt(SDK+'/zarr/workspace/server.mjs'),importAt(SDK+'/zarr/source.mjs'),importAt(SDK+'/zarr/deployment.mjs'),
  importAt(SDK+'/dataset-refresh/service.mjs'),importAt(RELEASE+'/release-console.mjs'),importAt(RELEASE+'/releases.mjs'),
  importAt(MCP+'/serve.mjs'),import(pathToFileURL(input.browser.module).href)]);
 const report={schema:'stellar-forge.zarr-merchant-receiving-result.v1',basis:stage.basis,state:'RUNNING',
  startedAt:stamp(),workspaceId:baseline.workspaceId,sourceStageSha256:input.sourceStage.resultSha256,
  sourceBaseline:{revision:baseline.revision,arrays:baseline.fullArrayCount,cells:baseline.fullArrayCells,
   selectedCells:baseline.additionalSelectedCells},browserErrors:[],paymentScope:'Original development challenge, pinned buyer configuration and offline customer request; no signer or settlement.'};
 const initial=await native(input,['status','--directory',input.workspaceDirectory]);
 assert.equal(initial.workspaceId,baseline.workspaceId);assert.equal(initial.revision,baseline.revision);
 assert.equal(initial.results.length,baseline.results.length);assert.equal(initial.frozen.length,baseline.frozen.length);
 if(!intent.sourceBasis){intent.sourceBasis={sha256:hash(jsonBytes(initial)),status:initial};await stage.saveIntent();}
 assert.deepEqual(initial,intent.sourceBasis.status,'No source-stage mutation or array reread is required');
 const selected=[];
 for(const [id,frozenId]of Object.entries(input.frozen)){
  const metadata=await native(input,['frozen','--directory',input.workspaceDirectory,'--id',frozenId]);
  assert.equal(metadata.id,frozenId);assert.equal(metadata.sourceSha256,frozenId);
  assert.deepEqual(await fileIdentity(metadata.sourceFile),{bytes:metadata.sourceBytes,sha256:frozenId});
  const frozen=await readZarrSourceFile(metadata.sourceFile);
  assert.equal(frozen.hash,frozenId);assert.equal(frozen.config.rows.length,frozen.config.origin.rowCount);
  selected.push({id,frozenId,metadata,frozen,rows:frozen.config.rows});
 }
 const primary=selected.find(x=>x.id==='primary'),secondary=selected.find(x=>x.id==='secondary');
 assert(primary&&secondary&&primary.rows.length>=3&&secondary.rows.length>=1);
 report.primary={frozenId:primary.frozenId,resultId:primary.frozen.config.origin.resultId,rows:primary.rows.length};
 report.secondary={frozenId:secondary.frozenId,resultId:secondary.frozen.config.origin.resultId,rows:secondary.rows.length};
 if(!intent.sellerPort){intent.sellerPort=await availablePort();await stage.saveIntent();}
 const listener='http://127.0.0.1:'+intent.sellerPort,resource=input.merchant.origin+input.merchant.path;
 const connectionsFile=join(output,'connections.json');
 const originalSelection=JSON.parse(await readFile(input.sourceStage.inputFile,'utf8'));
 const connections={schema:'stellar-forge.zarr-workspace-connections.v1',
  inputs:[...originalSelection.sources.map(s=>({id:s.id,title:s.title,path:s.file,kind:'zip',root:s.root,provenance:s.provenance,sha256:s.sha256})),
   {id:'original-source-packet',title:'Completed original source workspace',path:baseline.packet.archive,kind:'packet',root:'',provenance:{operationId:input.operationId},sha256:baseline.packet.inspection.packet.sha256}],
  destinations:[{id:'received',title:'Independent source receiving',path:join(output,'source-receiving')}],
  publisher:{seller:listener,resource}};
 await mkdir(join(output,'source-receiving'),{recursive:true,mode:0o700});
 await save(connectionsFile,connections,{createOnly:true});
 report.connectionsFile=connectionsFile;
 const releaseStore=join(output,'releases'),exportsDirectory=join(output,'customer-exports');
 await initReleaseStore(releaseStore,{resume:true});await mkdir(exportsDirectory,{recursive:true,mode:0o700});
 let service,browser,context,page,consoleHost,mcpHost,mcpToken='',rpcId=0;
 const resources=[];const own=v=>(resources.push(v),v);
 const close=async value=>{if(value){await value.close();const i=resources.indexOf(value);if(i>=0)resources.splice(i,1);}};
 const api=async(path,body)=>{
  const u=new URL(service.url);const response=await fetch(service.origin+path,{method:body===undefined?'GET':'POST',
   headers:{authorization:'Bearer '+u.hash.slice('#token='.length),...(body===undefined?{}:{origin:service.origin,'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(180000)});
  const value=await response.json();assert(response.ok,JSON.stringify(value));return value;
 };
 const pub=(id,action,value={},request)=>api('/api/publisher',{frozenId:id,action,input:value,...(request?{requestId:request}:{})});
 const pubWrite=async(key,id,action,value)=>pub(id,action,value,await requestId(key));
 const uiAction=async(key,action,trigger)=>{
  intent.uiRequests??={};
  if(intent.uiRequests[key])return api('/api/publisher',intent.uiRequests[key]);
  let retained=null;
  const intercept=async route=>{
   const request=route.request();if(request.method()!=='POST'){await route.continue();return;}
   const body=request.postDataJSON();
   if(body.action!==action||body.frozenId!==primary.frozenId){await route.continue();return;}
   assert(!retained,'One original browser request per action');retained=body;intent.uiRequests[key]=body;await stage.saveIntent();
   await route.continue();
  };
  await page.route('**/api/publisher',intercept);
  try{
   const received=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/publisher'&&r.request().method()==='POST'&&r.request().postDataJSON()?.action===action,{timeout:180000});
   received.catch(()=>{});await trigger();const response=await received;const value=await response.json();assert(response.ok(),JSON.stringify(value));assert(retained,'Real browser request retained before native dispatch');
   await save(join(output,key+'-browser-response.json'),value,{createOnly:true});return value;
  }finally{await page.unroute('**/api/publisher',intercept);}
 };
 const inspectAll=async(id,runId,expected)=>{
  const received=await paged(async query=>(await pub(id,'inspect',{runId,query})).preview,expected.length);
  exactRows(received.rows,expected,'Complete original Zarr scalar projection');return received;
 };
 const planInput=(item,direction)=>({title:input.operationId+' '+item.id+' '+direction,
  query:'selected',input:{},sourceHash:item.frozenId,dataset:{name:'Zarr '+item.id+' retained array',
   columns:structuredClone(item.frozen.queries.selected.projection),filters:[],ranges:[],sorts:['ordinal'],
   maxCellChars:65536,defaultLimit:7,maxLimit:250,maxPageBytes:921600},
  extraction:{order:[{column:'ordinal',direction}],maxRows:Math.max(item.rows.length,1000),maxBytes:16*1024*1024,maxRowBytes:1024*1024,timeoutMs:120000}});
 const runFor=async(id,key,plan)=>{
  const runId=await requestId(key+'-run');
  let run;try{run=await pub(id,'run',{runId});}catch(e){if(!String(e.message).includes('RUN_NOT_FOUND'))throw e;}
  if(!run)run=await pubWrite(key+'-extract',id,'extract',{planId:plan.id,runId});
  run=await pub(id,'run',{runId});
  if(['INTERRUPTED','FAILED','CANCELLED'].includes(run.state))run=await pubWrite(key+'-recover',id,'recover',{runId});
  assert(['READY','REVIEWED','PUBLISHED','PUBLICATION_UNKNOWN'].includes(run.state),JSON.stringify(run));
  assert.equal(run.plan,plan.id);return run;
 };
 const initialPublish=async(id,key,run)=>{
  if(run.state==='PUBLISHED')return run;
  if(run.state==='PUBLICATION_UNKNOWN')return pubWrite(key+'-recover-publication',id,'recover',{runId:run.id});
  if(run.state!=='REVIEWED')run=await pubWrite(key+'-review',id,'review',{runId:run.id,review:{reviewer:'Original Zarr receiving operation',note:'Complete original reviewed values and coordinates, explicit scalar projection.',initialize:true}});
  const result=await pubWrite(key+'-publish',id,'publish',{runId:run.id,reviewId:run.data.review.id});
  assert.equal(result.state,'PUBLISHED');return result;
 };
 const consoleApi=async(path,body,raw=false,extra={})=>{
  const response=await fetch(consoleHost.url+path,{method:body===undefined?'GET':'POST',headers:{'x-release-token':consoleHost.token,...extra,
   ...(body===undefined?{}:{'content-type':'application/json',origin:consoleHost.url})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(180000)});
  if(raw)return response;const value=await response.json();assert(response.ok,JSON.stringify(value));return value;
 };
 const rpc=async(method,params={})=>{
  const response=await fetch(mcpHost.url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',
   authorization:'Bearer '+mcpToken,'mcp-protocol-version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(180000)});
  assert.equal(response.status,200);const reply=await response.json();assert(!reply.error,JSON.stringify(reply.error));return reply.result;
 };
 const call=async(name,args={})=>{const value=await rpc('tools/call',{name,arguments:args});assert(!value.isError,JSON.stringify(value.structuredContent??value.content));return value.structuredContent;};
 const mp=(action,value={},request)=>call('merchant_zarr_publisher',{workspace:'original',frozenId:primary.frozenId,action,input:value,...(request?{requestId:request}:{})});
 const mpWrite=async(key,action,value)=>mp(action,value,await requestId(key));
 const challenge=async(amount,label)=>{
  intent.challenges??={};
  if(intent.challenges[label]){
   const saved=intent.challenges[label];assert.equal(saved.amount,amount);
   assert.deepEqual(await fileIdentity(join(output,label+'-challenge.json')),saved.file);return saved.result;
  }
  const response=await fetch(listener+input.merchant.path+'?limit=2',{signal:AbortSignal.timeout(15000)});
  const raw=Buffer.from(await response.arrayBuffer());assert.equal(response.status,402);
  const encoded=response.headers.get('payment-required');const value=encoded?JSON.parse(Buffer.from(encoded,'base64')):JSON.parse(raw);
  assert(JSON.stringify(value).includes('"amount":"'+amount+'"'));
  const retained=await optional(join(output,label+'-challenge.json'));
  if(retained)assert(JSON.stringify(retained).includes('"amount":"'+amount+'"'));
  const file=retained?await fileIdentity(join(output,label+'-challenge.json')):await save(join(output,label+'-challenge.json'),value,{createOnly:true});
  const result={status:402,amount,sha256:file.sha256};
  intent.challenges[label]={amount,file,result};await stage.saveIntent();return result;
 };
 const termsA={origin:input.merchant.origin,path:input.merchant.path,payment:input.merchant.payment};
 const termsB={...termsA,payment:{...termsA.payment,amount:input.merchant.nextAmount}};
 const prepareRelease=async(runId,terms,id)=>{
  const result=await service.withPublisher(primary.frozenId,async publisher=>{
   const review=await deployment.reviewZarrDeployment({publisher,runId,terms});
   const prepared=await deployment.prepareZarrDeployment({publisher,runId,terms,expectedReviewSha256:review.reviewSha256,directory:join(output,'deployment',id)});
   const inspected=await deployment.inspectZarrDeployment(prepared.packageDirectory);assert.equal(inspected.sourceSha256,prepared.sourceSha256);
   for(const file of prepared.files){const body=await deployment.readZarrDeploymentFile(prepared.packageDirectory,file.file);assert.equal(hash(body.bytes),file.sha256);assert.equal(body.bytes.length,file.bytes);}
   const staged=await deployment.stageZarrDeployment({packageDirectory:prepared.packageDirectory,releaseDirectory:releaseStore,id,
    label:'Original Zarr '+id,runtime:{port:intent.sellerPort},expectedSourceSha256:prepared.sourceSha256});
   return {review,prepared,release:staged.release};
  });await save(join(output,id+'-deployment.json'),result,{createOnly:true});return result;
 };
 const ensureRunning=async id=>{
  let current=await consoleApi('/api/status');
  assert([null,'zarr-a','zarr-b'].includes(current.state.active),'Preserve unrelated release selection');
  if(current.state.active!==id){
   const before=current.runtime.observed?.instanceId;
   current=await consoleApi('/api/activate',{id,expectedGeneration:current.state.generation,reason:'Run the explicitly reviewed '+id+' Zarr merchant selection.'});
   if(current.runtime.state==='RESTART_REQUIRED')current=await consoleApi('/api/restart',{instanceId:before,expectedGeneration:current.state.generation});
  }
  if(current.runtime.state==='STOPPED')current=await consoleApi('/api/run',{expectedGeneration:current.state.generation});
  assert.equal(current.runtime.state,'RUNNING');assert.equal(current.runtime.observed.listener,listener);
  return current;
 };
 try{
  service=own(await startZarrServer({directory:input.workspaceDirectory,connectionsFile,python:input.python,sourceDirectory:join(input.sourceRoot,SDK,'zarr'),port:0}));
  browser=own(await chromium.launch({executablePath:input.browser.executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}));
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();
  page.on('pageerror',e=>report.browserErrors.push({surface:'zarr',message:e.message}));
  const initialView=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/status'&&r.ok());await page.goto(service.url);await initialView;
  await page.locator("button[data-tab='sources']").waitFor();
  await captureOnce(stage,page,'01-overview.png');
  await page.click("button[data-tab='sources']");await page.locator('.source-card table').first().waitFor();
  await captureOnce(stage,page,'02-hierarchy.png');
  const tempSource=secondary.frozen.config.origin.sourceId;
  await page.click("button[data-select-array='"+secondary.frozen.config.origin.array+"'][data-source='"+tempSource+"']");
  await page.locator("form[data-form='selection']").waitFor();
  for(const [name,value]of Object.entries({'start-0':'0','stop-0':'3','step-0':'2','start-1':'1','stop-1':'4','step-1':'2'}))
   await page.locator("form[data-form='selection'] [name='"+name+"']").fill(value);
  await captureOnce(stage,page,'03-selected-region.png');
  await page.click("button[data-tab='results']");await page.locator('#result-select').selectOption(secondary.frozen.config.origin.resultId);
  await waitFor(async()=>String(await page.locator('#result-page').textContent()).includes('281.200012'), 'original four-cell temperature result');
  await captureOnce(stage,page,'04-temperature-result.png');
  const nativePage=await api('/api/results/'+secondary.frozen.config.origin.resultId+'?offset=0&limit=500');
  assert.equal(nativePage.total,secondary.rows.length);assert.deepEqual(nativePage.rows.map(r=>r.sourceIndex),secondary.rows.map(r=>JSON.parse(r.source_index)));
  await save(join(output,'temperature-native-page.json'),nativePage,{createOnly:true});
  await checkpoint('original-browser-source',{workspaceId:initial.workspaceId,revision:initial.revision,results:initial.results.length,frozen:initial.frozen.length});

  // One completed original mutation is explicitly prepared/applied under the same UUID.
  const replayFile=join(dirname(input.sourceStage.resultFile),'steps',hash(Buffer.from('cut:temperature-strided:selection')),'request.json');
  if(input.replayRequestFile)assert.equal(input.replayRequestFile,replayFile);
  const replay=JSON.parse(await readFile(replayFile,'utf8'));
  const prepared=await api('/api/prepare',replay);
  await save(join(output,'original-prepared-replay.json'),prepared,{createOnly:true});
  const adopted=await api('/api/apply',prepared);assert.equal(adopted.operationId,replay.id);assert.equal(adopted.replayed,true);
  const repeated=await api('/api/apply',prepared);assert.equal(repeated.operationId,replay.id);assert.equal(repeated.replayed,true);
  assert.deepEqual(await api('/api/status'),initial);
  report.nativeReplay={operationId:replay.id,requestSha256:prepared.requestSha256,noNewArrayResult:true};
  await checkpoint('same-native-uuid-replay',report.nativeReplay);
  const oldPacket=await native(input,['export','--directory',input.workspaceDirectory,'--id',baseline.packet.id,'--out',baseline.packet.archive]);
  assert.equal(oldPacket.replayed,true);assert.deepEqual(await fileIdentity(baseline.packet.archive),baseline.packet.inspection.packet);
  report.originalPacketReplay={id:baseline.packet.id,...baseline.packet.inspection.packet};
  await checkpoint('completed-source-export-replays-after-code-upgrade',report.originalPacketReplay);

  await page.click("button[data-tab='publisher']");await page.locator('#frozen-select').selectOption(primary.frozenId);
  await page.locator("form[data-form='publisher-plan']").waitFor();
  const planA=await uiAction('plan-a','save-plan',async()=>{
   await page.fill("form[data-form='publisher-plan'] textarea[name='plan']",JSON.stringify(planInput(primary,'asc'),null,2));
   await page.locator("form[data-form='publisher-plan']").evaluate(form=>form.requestSubmit());
  });
  await waitFor(()=>page.locator("button[data-extract='"+planA.id+"']").isVisible(),'original saved plan A');
  const extractionA=await uiAction('extract-a','extract',async()=>{
   await page.click("button[data-extract='"+planA.id+"']");await page.locator('#dialog').waitFor({state:'visible'});await page.click('#dialog-submit');
  });
  const runAId=extractionA.id??intent.uiRequests['extract-a'].input.runId;
  let runA=await pub(primary.frozenId,'run',{runId:runAId});assert.equal(runA.plan,planA.id);
  const valuesA=await inspectAll(primary.frozenId,runAId,primary.rows);
  await page.click("button[data-pub-inspect='"+runAId+"']");
  if(!intent.uiRequests['review-a']){
   await waitFor(()=>page.locator("button[data-pub-review='"+runAId+"']").isVisible(),'original candidate review');
  }
  const reviewedA=await uiAction('review-a','review',async()=>{
   await page.click("button[data-pub-review='"+runAId+"']");await page.locator('#dialog').waitFor({state:'visible'});
   await page.fill("#dialog input[name='reviewer']",'Original Zarr receiving operation');
   await page.fill("#dialog textarea[name='note']",'All retained ragged-array values and original source coordinates were compared; explicit ascending original ordinal, unchanged accepted native source.');
   await page.click('#dialog-submit');
  });
  const reviewAId=reviewedA.data.review.id;
  const publishedA=await uiAction('publish-a','publish',async()=>{
   await waitFor(()=>page.locator("button[data-publish='"+runAId+"'][data-review='"+reviewAId+"']").isVisible(),'original Publish control');
   await page.click("button[data-publish='"+runAId+"'][data-review='"+reviewAId+"']");await page.locator('#dialog').waitFor({state:'visible'});await page.click('#dialog-submit');
  });
  assert.equal(publishedA.state,'PUBLISHED');assert.equal(publishedA.data.publication.snapshot,valuesA.snapshot);
  await captureOnce(stage,page,'05-publisher-publication.png');
  await page.setViewportSize({width:412,height:915});await captureOnce(stage,page,'06-publisher-mobile.png');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Zarr operator fits the mobile viewport');
  await page.setViewportSize({width:1440,height:1000});
  report.primary.first={planId:planA.id,runId:runAId,snapshot:valuesA.snapshot,...exactRows(valuesA.rows,primary.rows,'Primary complete ascending values')};
  await checkpoint('browser-plan-extract-review-publish',report.primary.first);

  const secondaryPlan=await pubWrite('secondary-plan',secondary.frozenId,'save-plan',{plan:planInput(secondary,'asc')});
  const secondaryRun=await runFor(secondary.frozenId,'secondary',secondaryPlan);
  const secondaryValues=await inspectAll(secondary.frozenId,secondaryRun.id,secondary.rows);
  const secondaryPublished=await initialPublish(secondary.frozenId,'secondary',secondaryRun);
  report.secondary.publication={planId:secondaryPlan.id,runId:secondaryPublished.id,snapshot:secondaryValues.snapshot,...exactRows(secondaryValues.rows,secondary.rows,'Complete native Kelvin selection')};
  await checkpoint('native-temperature-projection-published',report.secondary.publication);

  const releaseA=await prepareRelease(runAId,termsA,'zarr-a');
  const targetDirectory=join(input.workspaceDirectory,'datasets',primary.frozenId);
  assert.equal(releaseA.prepared.dataset.datasetDirectory,targetDirectory);
  consoleHost=own(await startReleaseConsole(releaseStore,{port:0,clientExportsDirectory:exportsDirectory}));
  if(!intent.steps['first-native-page']){
   const state=await ensureRunning('zarr-a');const payment=await challenge(termsA.payment.amount,'zarr-a');
   const first=await datasetControl(targetDirectory,'preview',{query:'snapshot='+valuesA.snapshot+'&limit=2'});
   assert(first.page.nextCursor);assert.deepEqual(first.rows,primary.rows.slice(0,2));
   await save(join(output,'first-native-page.json'),first,{createOnly:true});
   await checkpoint('first-native-page',{snapshot:first.dataset.snapshot,instanceId:state.runtime.observed.instanceId,...payment});
  }
  // Reopen whichever original release is currently selected; this does not change the dataset head.
  const currentRelease=await consoleApi('/api/status');await ensureRunning(currentRelease.state.active??'zarr-a');
  const connectFile=join(output,'zarr-workspaces.json');
  const hostConnection={schema:'stellar-forge.zarr-workspaces.v1',workspaces:{original:{label:'Original Zarr receiving',directory:input.workspaceDirectory,workspaceId:baseline.workspaceId,workspaceSha256:service.workspace.identity.sha256}}};
  await save(connectFile,hostConnection,{createOnly:true});
  const mcpConfigFile=join(output,'merchant-mcp.json');
  await save(mcpConfigFile,{schema:'stellar-forge.merchant-mcp.v1',name:'Original Zarr receiving',releaseStore,exportsDirectory,sources:{},zarrWorkspaceConnection:connectFile},{createOnly:true});
  mcpToken=await requestId('mcp-token-a')+await requestId('mcp-token-b');
  mcpHost=own(await startMerchantMcp({configPath:mcpConfigFile,port:0,environment:{...process.env,MCP_ACCESS_TOKEN:mcpToken}}));
  const initialized=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'zarr-complete-receiving',version:'1'}});assert.equal(initialized.protocolVersion,'2025-11-25');
  const connected=await call('merchant_zarr_connect',{workspace:'original'});assert.equal(connected.workspaceId,baseline.workspaceId);assert.equal(connected.instanceId,service.instanceId);
  const connectedState=await call('merchant_zarr_status',{workspace:'original'});assert.deepEqual(connectedState.native,initial);
  const mcpFrozen=await call('merchant_zarr_frozen',{workspace:'original',frozenId:primary.frozenId});assert.equal(mcpFrozen.id,primary.frozenId);
  const mcpResult=await call('merchant_zarr_result_page',{workspace:'original',resultId:secondary.frozen.config.origin.resultId,offset:0,limit:500});assert.deepEqual(mcpResult,nativePage);
  const mcpReplay=await call('merchant_zarr_apply',{workspace:'original',prepared});assert.equal(mcpReplay.replayed,true);assert.equal(mcpReplay.operationId,replay.id);
  const offer=await mp('buyer-offer',{runId:runAId,query:'limit=2'});assert.equal(offer.snapshot,valuesA.snapshot);
  const buyer=await mpWrite('buyer-a','prepare-buyer',{runId:runAId,buyer:{query:'limit=2',offerSha256:offer.offerSha256,acceptIndex:0,
   accepts:offer.accepts,intentId:input.operationId+'-array-a'}});
  assert(buyer.configText.includes(valuesA.snapshot));assert.equal(hash(Buffer.from(buyer.configText)),buyer.configSha256);
  await saveBytes(join(output,'original-pinned-buyer.json'),Buffer.from(buyer.configText),{createOnly:true});
  report.buyer={snapshot:valuesA.snapshot,configSha256:buyer.configSha256,offerSha256:buyer.offerSha256};
  await checkpoint('borrowed-mcp-and-pinned-buyer',report.buyer);

  const planB=await mpWrite('plan-b','save-plan',{plan:planInput(primary,'desc')});
  const runBId=await requestId('run-b');let runB;
  try{runB=await mp('run',{runId:runBId});}catch(e){if(!String(e.message).includes('RUN_NOT_FOUND'))throw e;}
  if(!runB)runB=await mpWrite('extract-b','extract',{planId:planB.id,runId:runBId});
  runB=await mp('run',{runId:runBId});
  if(['INTERRUPTED','FAILED','CANCELLED','PUBLICATION_UNKNOWN'].includes(runB.state))runB=await mpWrite('recover-b','recover',{runId:runBId});
  assert(['READY','REVIEWED','PUBLISHED'].includes(runB.state),JSON.stringify(runB));
  const replayedExtraction=await mpWrite('extract-b','extract',{planId:planB.id,runId:runBId});
  assert.equal(replayedExtraction.id,runBId);
  const expectedB=[...primary.rows].reverse();
  const valuesB=await paged(async query=>(await mp('inspect',{runId:runBId,query})).preview,primary.rows.length);
  exactRows(valuesB.rows,expectedB,'Complete original descending values');assert.notEqual(valuesB.snapshot,valuesA.snapshot);
  if(runB.state==='READY'){
   const target=await mp('target');assert.equal(target.connected,true);
   runB=await mpWrite('review-b','review',{runId:runBId,review:{reviewer:'Original Zarr receiving operation',
    note:'The same accepted original array and scalar values, with explicit descending original ordinal.',
    expectedSnapshot:target.versions.current,expectedRevision:target.versions.revision}});
  }
  if(runB.state==='REVIEWED'){
   const response=await mpWrite('publish-b','publish',{runId:runBId,reviewId:runB.data.review.id});
   // Keep the successful original response; subsequent work resolves the retained publication, never issues another UUID.
   await save(join(output,'withheld-original-publication-reply.json'),response,{createOnly:true});
   await checkpoint('publication-b-response-retained',{runId:runBId,reviewId:runB.data.review.id});
  }
  const reconciled=await mpWrite('reconcile-b','recover',{runId:runBId});assert.equal(reconciled.state,'PUBLISHED');
  const allB=await paged(query=>datasetControl(targetDirectory,'preview',{query}),primary.rows.length);
  exactRows(allB.rows,expectedB,'Original running dataset current edition');
  report.primary.second={planId:planB.id,runId:runBId,snapshot:valuesB.snapshot,...exactRows(allB.rows,expectedB,'Published second ordering')};
  await checkpoint('mcp-original-second-publication',report.primary.second);
  const releaseB=await prepareRelease(runBId,termsB,'zarr-b');
  await save(join(output,'merchant-comparison.json'),await consoleApi('/api/diff?from=zarr-a&to=zarr-b'),{createOnly:true});
  await ensureRunning('zarr-b');await challenge(termsB.payment.amount,'zarr-b');
  const first=JSON.parse(await readFile(join(output,'first-native-page.json'),'utf8'));
  const continued=await datasetControl(targetDirectory,'preview',{query:new URLSearchParams({limit:'2',cursor:first.page.nextCursor}).toString()});
  assert.equal(continued.dataset.snapshot,valuesA.snapshot);assert.deepEqual(continued.rows,primary.rows.slice(2,4));
  await save(join(output,'continued-original-cursor.json'),continued,{createOnly:true});
  const sourceExportId=await requestId('current-source-export');
  const exported=await call('merchant_zarr_export',{workspace:'original',operationId:sourceExportId});
  assert.equal(exported.operationId,sourceExportId);
  const file=exported.file;const received=[];let offset=0;
  for(;;){const part=await call('merchant_zarr_file_read',{workspace:'original',fileId:file.id,expectedSha256:file.sha256,offset,limit:65536});
   const content=Buffer.from(part.content,'base64');assert.equal(part.sha256,hash(content));assert.equal(part.bytes,content.length);assert.equal(part.offset,offset);assert.equal(part.file.sha256,file.sha256);received.push(content);
   if(part.next===null)break;assert(part.next>offset);offset=part.next;
  }
  const sourceZip=Buffer.concat(received);assert.equal(sourceZip.length,file.bytes);assert.equal(hash(sourceZip),file.sha256);
  await saveBytes(join(output,'Zarr_Current_Source_Workspace.zip'),sourceZip,{createOnly:true});
  report.currentSourcePacket={id:sourceExportId,file:file.name,bytes:file.bytes,sha256:file.sha256,path:join(output,'Zarr_Current_Source_Workspace.zip')};
  await checkpoint('borrowed-mcp-complete-source-packet',report.currentSourcePacket);
  await close(mcpHost);mcpHost=null;
  const client=await receiveClient({context,consoleHost,consoleApi,output,clientId:'zarr-array-client',report,checkpoint,
   expectedRelease:releaseB.release,expectedAmount:termsB.payment.amount,snapshot:valuesB.snapshot,
   resourcePath:input.merchant.path,operationId:input.operationId,intent,intentFile});
  report.customer=client;
  const stopped=await consoleApi('/api/status');
  if(stopped.runtime.state==='RUNNING')await consoleApi('/api/stop',{instanceId:stopped.runtime.observed.instanceId});
  await close(consoleHost);consoleHost=null;
  await page.close();page=null;await close(service);service=null;await close(browser);browser=null;
  // The next owner reopens the exact same native workspace; no hidden array operation was added.
  const final=await native(input,['status','--directory',input.workspaceDirectory]);
  assert.deepEqual(final,initial);
  const receivedSource=await native(input,['receive','--archive',report.currentSourcePacket.path,'--directory',join(output,'current-source-received')]);
  const receivedStatus=await native(input,['status','--directory',join(output,'current-source-received')]);assert.deepEqual(receivedStatus,initial);
  report.currentSourceReceived=receivedSource;
  report.publisherDirectories=Object.fromEntries(selected.map(s=>[s.id,{directory:join(input.workspaceDirectory,'publishers',s.frozenId),targetDirectory:join(input.workspaceDirectory,'datasets',s.frozenId)}]));
  report.releaseStore=releaseStore;report.releaseA=releaseA.release;report.releaseB=releaseB.release;
  report.hostConnection={connectionsFile,workspaceIdentity:hostConnection.workspaces.original.workspaceSha256};
  assert.deepEqual(report.browserErrors,[]);report.state='COMPLETE';report.completedAt=stamp();
  report.files=[];
  for(const name of ['01-overview.png','02-hierarchy.png','03-selected-region.png','04-temperature-result.png','05-publisher-publication.png','06-publisher-mobile.png','Zarr_Current_Source_Workspace.zip','original-pinned-buyer.json','customer-handover.json']){
   report.files.push({path:name,...await fileIdentity(join(output,name))});
  }
  await save(join(output,'result.json'),report);return report;
 }catch(error){
  report.state='INTERRUPTED';report.error=errorView(error);report.updatedAt=stamp();await save(join(output,'result.json'),report).catch(()=>{});throw error;
 }finally{
  for(const value of resources.reverse()){try{await value.close();}catch(error){console.error('Original Zarr receiving close:',error.message);}}
 }
}
