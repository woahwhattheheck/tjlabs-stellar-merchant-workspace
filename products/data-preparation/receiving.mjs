// MIT. Continue the retained PREP12 project through its installed managed product.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,lstat,realpath,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {setTimeout as pause} from 'node:timers/promises';

const [sourceRoot,root,optionsFile]=process.argv.slice(2);
const options=JSON.parse(await readFile(optionsFile,'utf8'));
const P='stellar/scf-starforge-20261009/',D=P+'sf30-seller-sdk/data-preparation/';
const fromSource=path=>import(pathToFileURL(join(sourceRoot,path)).href);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const writeJSON=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const original=JSON.parse(await readFile(join(root,'original-manifest.json'),'utf8')).workspace;
const events=[];
function emit(stage,value={}){const item={stage,...value};events.push(item);console.log(JSON.stringify(item));}
const [{receivePreparationWorkspace},{PreparationWorkspaceClient},{MerchantPreparationWorkspaces,readPreparationWorkspaceConfiguration},
 {default:provider},{prepareProviderApplication,applicationField,applicationCommonFields}]=await Promise.all([
 fromSource(D+'managed.mjs'),fromSource(D+'connection.mjs'),fromSource(D+'mcp.mjs'),fromSource(D+'application-provider.mjs'),
 fromSource(P+'distribution/runtime-workspace/application-provider.mjs'),
]);
const operator=join(root,'operator'),customer=join(root,'customer'),downloads=join(root,'downloads');
const originalProject=join(root,'original-project.zip');
const received=await receivePreparationWorkspace({archive:originalProject,directory:operator,expectedSha256:options.projectSha256});
assert.deepEqual(received.counts,{sources:3,recipes:2,runs:2,reviews:1});
emit('ORIGINAL_PROJECT_RECEIVED',{sourceSha256:received.sourceSha256,counts:received.counts,inputRows:120012});

async function native(program,args,input){
 const child=spawn(program,args,{stdio:['pipe','pipe','pipe'],env:process.env,shell:false});
 const out=[],err=[];child.stdout.on('data',part=>out.push(part));child.stderr.on('data',part=>err.push(part));
 const result=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{
  if(code===0)resolve(Buffer.concat(out).toString('utf8'));else reject(Error('Native receiving failed '+JSON.stringify({code,signal,error:Buffer.concat(err).toString('utf8').slice(-5000)})));
 });});
 child.stdin.end(input);
 return result;
}
const python=process.env.STARFORGE_PYTHON||'python3';
async function state(directory){return JSON.parse(await native(python,[join(sourceRoot,D+'cli.py'),'--workspace',directory,'state']));}
const baseline=await state(operator);
assert.deepEqual(baseline.sources,original.sources);
assert.deepEqual(baseline.recipes,original.recipes);
assert.deepEqual(baseline.reviews,original.reviews);
assert.deepEqual(baseline.runs.map(x=>x.id),original.runs.map(x=>x.id));
assert.equal(baseline.sources.reduce((n,v)=>n+v.rows,0),120012);
const firstRecipe=baseline.recipes.find(x=>x.revision===1);
const priorRun=baseline.runs.find(x=>x.recipe.revision===1);

let active,client,merchant,browser,context;
const children=new Set();
async function launch(directory,label){
 const operation=join(root,'applications-'+label);await mkdir(operation,{mode:0o700});
 const type=provider.catalog({common:applicationCommonFields,field:applicationField}).find(x=>x.id==='data-preparation-workspace');
 assert(type);
 const inputPath=async(path,kind,missing,privateOnly)=>{
  const actual=await realpath(path);assert.equal(actual,path);
  const info=await lstat(path,{bigint:true});
  assert(kind==='directory'?info.isDirectory():info.isFile());
  if(privateOnly)assert.equal(info.mode&0o077n,0n);
  return {path,kind,exists:true,dev:String(info.dev),ino:String(info.ino),mode:Number(info.mode&0o777n)};
 };
 const selected=await prepareProviderApplication(provider,type,{workspaceDirectory:directory,port:0},{
  inputPath,applicationEnvironment:async()=>({values:{},sha256:null}),
 });
 const request={...selected,applicationId:'data-preparation-'+label};
 const observer=provider.createObserver(request,operation);
 const child=spawn(process.execPath,[join(sourceRoot,D+'managed.mjs'),...selected.args],{
  stdio:['ignore','pipe','pipe'],env:process.env,shell:false,
 });
 children.add(child);let out='',errorText='',settled=false,resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const closed=new Promise((resolve,reject)=>{
  child.once('error',error=>{rejectReady(error);reject(error);});
  child.once('close',(code,signal)=>{children.delete(child);if(!settled)rejectReady(Error('Application closed before startup: '+errorText));resolve({code,signal});});
 });
 child.stderr.on('data',part=>{errorText=(errorText+part.toString()).slice(-5000);});
 child.stdout.on('data',part=>{
  observer.write(part);out+=part.toString();
  const lines=out.split(/\r?\n/);out=lines.pop();
  for(const line of lines)if(line.startsWith('{"schema":"stellar-forge.data-preparation-managed-startup.v1",')){
   settled=true;resolveReady(JSON.parse(line));
  }
 });
 const timer=setTimeout(()=>rejectReady(Error('Application startup exceeded 30 seconds')),30000);
 try{
  const announced=await ready;await observer.close();
  const observed=JSON.parse(await readFile(join(operation,'application-url.json'),'utf8'));
  assert.equal(observed.original.instanceId,announced.instanceId);
  assert.equal(observed.original.workspaceSha256,announced.workspaceSha256);
  const connection=join(directory,'preparation-connection.json');
  return {child,connection,instanceId:announced.instanceId,observed,
   async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const exit=await closed;
    assert.equal(exit.code,0,'Original managed process must drain successfully');
    await assert.rejects(access(connection),error=>error.code==='ENOENT');},
  };
 }catch(error){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await closed;throw error;}
 finally{clearTimeout(timer);}
}
function openMerchant(config){return new MerchantPreparationWorkspaces({preparationWorkspaces:config,exportsDirectory:downloads});}
const call=(name,args={})=>merchant.call('merchant_preparation_'+name,{workspace:'operator',...args});
async function fullFile(record,{start=0,prefix=Buffer.alloc(0),readId}={}){
 const parts=[prefix];let offset=start,id=readId;
 do{
  const chunk=await call('file',{fileId:record.fileId,expectedSha256:record.sha256,offset,limit:65536,...(id?{readId:id}:{})});
  assert.equal(chunk.offset,offset);assert.equal(chunk.file.sha256,record.sha256);assert.equal(chunk.file.bytes,record.bytes);
  const bytes=Buffer.from(chunk.data,'base64');assert.equal(bytes.length,chunk.bytesRead);parts.push(bytes);
  id=chunk.readId;offset=chunk.nextOffset;
 }while(offset!==null);
 const bytes=Buffer.concat(parts);assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256);
 await call('file_release',{readId:id});return bytes;
}
async function waitRun(runId){
 const retryAfter=Date.now()+750,until=Date.now()+60000;let restarted=false;
 while(Date.now()<until){
  const run=(await client.state()).runs.find(x=>x.id===runId);assert(run);
  if(run.status==='COMPLETE')return run;
  if(!['QUEUED','RUNNING'].includes(run.status))throw Error('Original SQL '+run.status+': '+(run.message||''));
  if(run.status==='QUEUED'&&!restarted&&Date.now()>=retryAfter){const status=await client.status();if(!status.running){restarted=true;await client.start(runId);}}
  await pause(100);
 }
 throw Error('Original SQL run did not complete within its receiving interval');
}
try{
 active=await launch(operator,'operator');
 client=await PreparationWorkspaceClient.connect(active.connection,{directory:operator,expectedInstanceId:active.instanceId});
 const hostPath=join(root,'merchant-host.json'),orders=original.sources.find(x=>x.alias==='orders');
 await writeJSON(hostPath,{schema:'stellar-forge.data-preparation-workspaces.v1',workspaces:{operator:{
  directory:operator,inputs:{orders:{kind:'csv',file:join(root,'inputs','orders.csv'),sha256:orders.sha256,label:orders.label}},
  destinations:{customer:{directory:customer,label:'Independent customer project'}},
 }}});
 const config=await readPreparationWorkspaceConfiguration(hostPath);
 merchant=openMerchant(config);
 const connected=await call('connect');assert.equal(connected.instanceId,active.instanceId);
 const linked=await call('browser');assert.equal(linked.instanceId,active.instanceId);
 assert.equal(connected.native.counts.sources,3);
 emit('APPLICATIONS_AND_TYPED_MERCHANT_ATTACHED',{instanceId:active.instanceId,workspaceSha256:received.workspaceSha256,tools:21});

 const require=createRequire(import.meta.url);
 const {chromium}=require(options.playwrightModule);
 browser=await chromium.launch({headless:true,executablePath:options.chromiumExecutable,args:['--no-sandbox','--disable-dev-shm-usage']});
 context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
 const page=await context.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(linked.url,{waitUntil:'networkidle',timeout:30000});
 await page.locator('#input-count').filter({hasText:'3'}).waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'');
 assert.equal(await page.locator('#workspace-label').textContent(),original.label);
 const originalPage=await call('source_page',{sourceId:orders.id,offset:0,limit:2});
 assert.equal(originalPage.rows[0][0],'9007199254740993');
 assert.equal(originalPage.total,120000);
 const tail=await call('source_page',{sourceId:orders.id,offset:119998,limit:2});
 assert.equal(tail.rows.length,2);assert.equal(tail.nextOffset,null);
 const reused=await call('import_source',{sourceInput:'orders',expectedSourceSha256:orders.sha256,alias:'orders'});
 assert.equal(reused.id,orders.id);assert.equal((await client.status()).counts.sources,3);
 const recipe=await call('save_recipe',{label:'Managed receiving · closed orders',sql:firstRecipe.sql,
  bindings:firstRecipe.bindings,parameters:firstRecipe.parameters,note:'Continue the original reviewed project through the installed managed customer workflow.'});
 const queued=await call('run',{recipeId:recipe.id,revision:recipe.revision});
 const run=await waitRun(queued.id);assert.equal(run.rows,6);
 const actualRows=await call('result_page',{runId:run.id,offset:0,limit:200});
 const priorRows=await call('result_page',{runId:priorRun.id,offset:0,limit:200});
 assert.deepEqual(actualRows.rows,priorRows.rows);assert.deepEqual(actualRows.columns,priorRows.columns);
 await call('review',{runId:run.id,decision:'accept',reviewer:'Managed customer receiving',note:'Complete six-row result matches the retained original closed-order transformation.',expectedRevision:0});
 const current=await client.status();
 assert.deepEqual(current.counts,{sources:3,recipes:3,runs:3,reviews:2});
 emit('ORIGINAL_SQL_AND_REVIEW_COMPLETED',{runId:run.id,rows:run.rows,counts:current.counts,originalRecipeId:firstRecipe.id});

 await page.reload({waitUntil:'networkidle'});
 await page.locator('nav button[data-tab="results"]').click();
 await page.getByText(recipe.label,{exact:true}).first().waitFor();
 await page.locator('nav button[data-tab="handover"]').click();
 const downloaded=page.waitForEvent('download');
 await page.locator('#export-workspace').click();
 const fullBrowser=await downloaded;const browserArchive=join(downloads,'browser-project.zip');
 await fullBrowser.saveAs(browserArchive);
 assert.equal(await fullBrowser.failure(),null);
 assert((await lstat(browserArchive)).size>0);
 const desktopWidth=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
 assert(desktopWidth.document<=desktopWidth.width);
 await page.setViewportSize({width:390,height:844});
 for(const section of ['inputs','recipes','results','handover']){
  await page.locator('nav button[data-tab="'+section+'"]').click();
  const width=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
  assert(width.document<=width.width,'Phone section '+section+' overflows');
 }
 assert.deepEqual(pageErrors,[]);
 await context.close();context=null;await browser.close();browser=null;
 emit('ORIGINAL_BROWSER_AND_COMPLETE_DOWNLOAD',{desktop:[1440,1080],phone:[390,844],sections:4,browserArchiveBytes:(await lstat(browserArchive)).size});

 const requests=[
  {kind:'project'},
  {kind:'merchant',runId:run.id,label:'Managed customer prepared dataset'},
  {kind:'report',runId:run.id},
  {kind:'result',runId:run.id,file:'result.jsonl'},
 ].map(value=>({...value,operationId:'managed-original-'+value.kind+'-'+run.id,expectedStateSha256:current.stateSha256}));
 const deliveries=[];
 for(const request of requests)deliveries.push(await call('export',request));
 const project=deliveries.find(x=>x.kind==='project'),merchantRecord=deliveries.find(x=>x.kind==='merchant');
 const first=await call('file',{fileId:project.fileId,expectedSha256:project.sha256,offset:0,limit:65536});
 assert(first.nextOffset!==null);
 await call('disconnect',{instanceId:active.instanceId});await merchant.close();
 assert.equal((await client.status()).counts.runs,3);
 merchant=openMerchant(config);
 const projectBytes=await fullFile(project,{start:first.nextOffset,prefix:Buffer.from(first.data,'base64')});
 await writeFile(join(downloads,'project.zip'),projectBytes,{flag:'wx',mode:0o600});
 for(const record of deliveries.filter(x=>x.kind!=='project')){
  await writeFile(join(downloads,record.kind==='merchant'?'merchant.zip':record.filename),await fullFile(record),{flag:'wx',mode:0o600});
 }
 const link=await client.resultDownloadLink(run.id,'result.jsonl');
 const ticketResponse=await fetch(link.url,{redirect:'error'});
 assert.equal(ticketResponse.status,200);const ticketBytes=Buffer.from(await ticketResponse.arrayBuffer());
 assert.equal(hash(ticketBytes),run.files['result.jsonl'].sha256);
 await client.downloadDelivery(project,join(downloads,'sdk-project.zip'));
 await client.close();client=null;
 await active.stop();active=null;
 const inventory=await call('exports',{offset:0,limit:200});
 assert.equal(inventory.files.length,4);
 const replay=await call('export',requests[0]);assert.equal(replay.sha256,project.sha256);assert.equal(replay.reused,true);
 assert.equal(hash(await fullFile(project)),project.sha256);
 emit('COMPLETE_NATIVE_DELIVERIES_AND_OFFLINE_REPLAY',{deliveries:deliveries.map(({kind,bytes,sha256})=>({kind,bytes,sha256})),resumedAfterDetach:true});

 const restored=await call('receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,destination:'customer'});
 const again=await call('receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,destination:'customer'});
 assert.equal(again.reused,true);assert.deepEqual(restored.counts,current.counts);
 const inspected=await call('received',{destination:'customer'});assert.equal(inspected.sourceSha256,project.sha256);
 const restoredState=await state(customer),operatorState=await state(operator);
 for(const collection of ['sources','recipes','reviews'])assert.deepEqual(restoredState[collection],operatorState[collection]);
 assert.deepEqual(restoredState.runs.map(x=>x.id),operatorState.runs.map(x=>x.id));
 for(const collection of ['sources','recipes','reviews']){
  for(const record of baseline[collection]){
   const retained=operatorState[collection].find(value=>value.id===record.id&&
    (collection!=='recipes'||value.revision===record.revision));
   assert.deepEqual(retained,record,'Original '+collection+' history must remain exact');
  }
 }
 await merchant.close();merchant=null;
 active=await launch(operator,'operator-reopened');
 assert.notEqual(active.instanceId,connected.instanceId);
 client=await PreparationWorkspaceClient.connect(active.connection,{directory:operator,expectedInstanceId:active.instanceId});
 assert.deepEqual((await client.status()).counts,current.counts);
 await client.close();client=null;await active.stop();active=null;
 emit('APPLICATION_REOPENED_AND_ORIGINAL_HISTORY_RETAINED',{receivedCounts:restored.counts,originalRunIds:baseline.runs.map(x=>x.id)});

 active=await launch(customer,'customer');
 client=await PreparationWorkspaceClient.connect(active.connection,{directory:customer,expectedInstanceId:active.instanceId});
 const customerRecipe=await client.saveRecipe({label:'Customer revision · open orders',sql:firstRecipe.sql,
  bindings:firstRecipe.bindings,parameters:{status:'open'},note:'Independent customer edit on the fully received original project.'});
 const customerQueued=await client.run(customerRecipe.id,customerRecipe.revision);
 const customerRun=await waitRun(customerQueued.id);assert.equal(customerRun.rows,6);
 const customerState=await client.state();assert.equal(customerState.recipes.length,4);assert.equal(customerState.runs.length,4);
 assert.equal((await state(operator)).runs.length,3);
 const customerStatus=await client.status();
 const customerProject=await client.exportDelivery({kind:'project',operationId:'customer-edited-'+customerRun.id,expectedStateSha256:customerStatus.stateSha256});
 await client.downloadDelivery(customerProject,join(downloads,'customer-edited-project.zip'));
 await client.close();client=null;await active.stop();active=null;
 const result={schema:'stellar-forge.data-preparation-managed-receiving.v1',completedAt:new Date().toISOString(),
  originalPackageSha256:options.packageSha256,originalProjectSha256:options.projectSha256,originalInputRows:120012,
  originalSourceIds:baseline.sources.map(x=>x.id),originalRecipeId:firstRecipe.id,originalRunIds:baseline.runs.map(x=>x.id),
  managedRunId:run.id,customerRunId:customerRun.id,managedCounts:current.counts,customerCounts:customerStatus.counts,
  deliveries,customerProject,browser:{desktop:[1440,1080],phone:[390,844],sections:4},events};
 await writeJSON(join(root,'receiving-result.json'),result);
 emit('INDEPENDENT_CUSTOMER_EDIT_COMPLETED',{customerRunId:customerRun.id,customerCounts:customerStatus.counts,originalCounts:current.counts});
}finally{
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
 await client?.close().catch(()=>{});await merchant?.close().catch(()=>{});
 if(active)await active.stop();
 for(const child of children)child.kill('SIGTERM');
}
