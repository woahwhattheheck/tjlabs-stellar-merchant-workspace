// MIT. Continue the retained PREP12 project through its installed managed product.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,lstat,realpath,access,rename,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
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
const attempt=options.attemptDirectory||root;
const progressFile=join(root,'managed-receiving-progress.json');
let progress;
try{progress=JSON.parse(await readFile(progressFile,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;progress={schema:'stellar-forge.data-preparation-managed-continuation.v1',
 operationId:randomUUID(),packageSha256:options.packageSha256,projectSha256:options.projectSha256,pins:{}};}
assert.equal(progress.schema,'stellar-forge.data-preparation-managed-continuation.v1');
assert.equal(progress.packageSha256,options.packageSha256);assert.equal(progress.projectSha256,options.projectSha256);
async function saveProgress(){
 const path=join(attempt,'progress-'+randomUUID()+'.json');
 const file=await open(path,'wx',0o600);
 try{await file.writeFile(JSON.stringify(progress,null,2)+'\n');await file.sync();}finally{await file.close();}
 await rename(path,progressFile);
 const parent=await open(root,'r');try{await parent.sync();}finally{await parent.close();}
}
async function pin(key,value){progress.pins[key]=value;await saveProgress();return value;}
function portableRun(record){
 if(!record)return record;
 const result={...record};
 if(record.files){result.files={...record.files};delete result.files['result.sqlite'];}
 return result;
}
function retainOriginals(value){
 for(const collection of ['sources','recipes','reviews']){
  for(const item of original[collection]){
   const found=value[collection].find(record=>record.id===item.id&&(collection!=='recipes'||record.revision===item.revision));
   assert.deepEqual(found,item,'Retain original '+collection+' '+item.id);
  }
 }
 for(const item of original.runs){const found=value.runs.find(record=>record.id===item.id);assert.deepEqual(portableRun(found),portableRun(item),'Retain original result '+item.id);}
 assert.equal(value.sources.filter(item=>original.sources.some(old=>old.id===item.id)).reduce((sum,item)=>sum+item.rows,0),120012);
}
async function recipeFor(key,spec,nativeClient,create){
 const current=await nativeClient.state(),pinned=progress.pins[key];
 const matches=value=>['label','sql','bindings','parameters','note'].every(field=>isDeepStrictEqual(value[field],spec[field]));
 let record;
 if(pinned){record=current.recipes.find(value=>value.id===pinned.id&&value.revision===pinned.revision);assert(record,'Retain the same receiving recipe');assert(matches(record));}
 else{
  const candidates=current.recipes.filter(matches);
  assert(candidates.length<=1,'Resolve the exact retained receiving recipe before continuing');
  record=candidates[0]||await create(spec);
  await pin(key,{id:record.id,revision:record.revision});
 }
 return record;
}
async function runFor(key,recipe,nativeClient,create){
 let current=await nativeClient.state();
 if(current.runs.some(value=>value.recipe.id===recipe.id&&value.recipe.revision===recipe.revision&&value.status==='RUNNING')&&
   !(await nativeClient.status()).running){await nativeClient.recover();current=await nativeClient.state();}
 const pinned=progress.pins[key];
 const candidates=current.runs.filter(value=>value.recipe.id===recipe.id&&value.recipe.revision===recipe.revision);
 let result;
 if(pinned){result=candidates.find(value=>value.id===pinned);assert(result,'Retain the same native receiving result');}
 else{
  const roots=candidates.filter(value=>!value.previousRun);
  assert(roots.length<=1,'Resolve the retained recipe result before continuing');
  result=roots[0]||await create();await pin(key,result.id);
 }
 while(true){
  const later=candidates.filter(value=>value.previousRun===result.id);
  assert(later.length<=1,'Resolve the original rerun chain before continuing');
  if(!later.length)break;
  result=later[0];await pin(key,result.id);
 }
 if(['INTERRUPTED','FAILED','CANCELLED'].includes(result.status)){
  result=await nativeClient.rerun(result.id);await pin(key,result.id);
 }
 return result;
}
async function reviewFor(nativeClient,runId,spec,create){
 const current=(await nativeClient.state()).reviews.find(value=>value.id===runId);
 const last=current?.history.at(-1);
 if(last&&['decision','reviewer','note'].every(field=>last[field]===spec[field]))return current;
 return create({...spec,expectedRevision:current?.revision||0});
}
await saveProgress();
const events=[];
function emit(stage,value={}){const item={stage,...value};events.push(item);console.log(JSON.stringify(item));}
const [{receivePreparationWorkspace},{PreparationWorkspaceClient},{MerchantPreparationWorkspaces,readPreparationWorkspaceConfiguration},
 {default:provider},{prepareProviderApplication,applicationField,applicationCommonFields}]=await Promise.all([
 fromSource(D+'managed.mjs'),fromSource(D+'connection.mjs'),fromSource(D+'mcp.mjs'),fromSource(D+'application-provider.mjs'),
 fromSource(P+'distribution/runtime-workspace/application-provider.mjs'),
]);
const operator=join(root,'operator'),customer=join(root,'customer'),downloads=join(attempt,'downloads');
const pictures=join(attempt,'browser');await mkdir(pictures,{mode:0o700});
const captures=[];
const originalProject=join(root,'original-project.zip');
let operatorExists=false;
if(options.continueOriginal){try{const info=await lstat(operator);assert(info.isDirectory()&&!info.isSymbolicLink());operatorExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}}
const received=operatorExists?{sourceSha256:options.projectSha256}:await receivePreparationWorkspace({archive:originalProject,directory:operator,expectedSha256:options.projectSha256});

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
const baseline=original;
const initial=await state(operator);retainOriginals(initial);
emit('ORIGINAL_PROJECT_RECEIVED',{sourceSha256:received.sourceSha256,inputRows:120012,continued:!!options.continueOriginal});
const firstRecipe=baseline.recipes.find(x=>x.revision===1);
const priorRun=baseline.runs.find(x=>x.recipe.id===firstRecipe.id&&x.recipe.revision===firstRecipe.revision);
assert(firstRecipe&&priorRun,'Keep the original saved recipe and corresponding complete result together');

let active,client,merchant,browser,context;
const children=new Set();
async function launch(directory,label){
 const operation=join(attempt,'applications-'+label);await mkdir(operation,{mode:0o700});
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
async function runPreparationJourney(){
 active=await launch(operator,'operator');
 client=await PreparationWorkspaceClient.connect(active.connection,{directory:operator,expectedInstanceId:active.instanceId});
 const hostPath=join(attempt,'merchant-host.json'),orders=original.sources.find(x=>x.alias==='orders');
 await writeJSON(hostPath,{schema:'stellar-forge.data-preparation-workspaces.v1',workspaces:{operator:{
  directory:operator,inputs:{orders:{kind:'csv',file:join(root,'inputs','orders.csv'),sha256:orders.sha256,label:orders.label}},
  destinations:{customer:{directory:customer,label:'Independent customer project'}},
 }}});
 const config=await readPreparationWorkspaceConfiguration(hostPath);
 merchant=openMerchant(config);
 const connected=await call('connect');assert.equal(connected.instanceId,active.instanceId);
 const linked=await call('browser');assert.equal(linked.instanceId,active.instanceId);
 assert(connected.native.counts.sources>=original.sources.length);
 emit('APPLICATIONS_AND_TYPED_MERCHANT_ATTACHED',{instanceId:active.instanceId,workspaceSha256:active.observed.original.workspaceSha256,tools:40});

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
 const recipe=await recipeFor('managedRecipe',{label:'Managed receiving · closed orders',sql:firstRecipe.sql,
  bindings:firstRecipe.bindings,parameters:firstRecipe.parameters,note:'Continue the original reviewed project through the installed managed customer workflow.'},client,value=>call('save_recipe',value));
 const queued=await runFor('managedRun',recipe,client,()=>call('run',{recipeId:recipe.id,revision:recipe.revision}));
 const run=await waitRun(queued.id);assert.equal(run.rows,6);
 const actualRows=await call('result_page',{runId:run.id,offset:0,limit:200});
 const priorRows=await call('result_page',{runId:priorRun.id,offset:0,limit:200});
 assert.deepEqual(actualRows.rows,priorRows.rows);assert.deepEqual(actualRows.columns,priorRows.columns);
 await reviewFor(client,run.id,{decision:'accept',reviewer:'Managed customer receiving',note:'Complete six-row result matches the retained original closed-order transformation.'},value=>call('review',{runId:run.id,...value}));
 const current=await client.status();
 retainOriginals(await client.state());
 assert.equal(current.counts.sources,3);assert(current.counts.runs>=3);
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
 for(const [kind,width,height] of [['desktop',1440,1080],['phone',390,844]]){
  await page.setViewportSize({width,height});
  for(const section of ['inputs','recipes','results','handover']){
   await page.locator('nav button[data-tab="'+section+'"]').click();
   await page.waitForLoadState('networkidle');
   const measured=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
   assert(measured.document<=measured.width,kind+' '+section+' overflows');
   const path=join(pictures,'preparation-'+section+'-'+kind+'.png');
   await page.screenshot({path,fullPage:true});captures.push({surface:'preparation',section,kind,path});
  }
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
 assert.equal((await client.status()).counts.runs,current.counts.runs);
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
 for(const expected of deliveries)assert(inventory.files.some(file=>file.fileId===expected.fileId&&file.sha256===expected.sha256));
 const replay=await call('export',requests[0]);assert.equal(replay.sha256,project.sha256);assert.equal(replay.reused,true);
 assert.equal(hash(await fullFile(project)),project.sha256);
 emit('COMPLETE_NATIVE_DELIVERIES_AND_OFFLINE_REPLAY',{deliveries:deliveries.map(({kind,bytes,sha256})=>({kind,bytes,sha256})),resumedAfterDetach:true});

 const restored=await call('receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,destination:'customer'});
 const again=await call('receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,destination:'customer'});
 assert.equal(again.reused,true);assert.deepEqual(restored.counts,current.counts);
 const inspected=await call('received',{destination:'customer'});assert.equal(inspected.sourceSha256,project.sha256);
 const restoredState=await state(customer),operatorState=await state(operator);
 for(const collection of ['sources','recipes','reviews','runs'])for(const item of operatorState[collection]){
  const retained=restoredState[collection].find(value=>value.id===item.id&&(collection!=='recipes'||value.revision===item.revision));
  assert.deepEqual(collection==='runs'?portableRun(retained):retained,collection==='runs'?portableRun(item):item,'The received customer retains its complete imported '+collection);
 }
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
 const customerRecipe=await recipeFor('customerRecipe',{label:'Customer revision · open orders',sql:firstRecipe.sql,
  bindings:firstRecipe.bindings,parameters:{status:'open'},note:'Independent customer edit on the fully received original project.'},client,value=>client.saveRecipe(value));
 const customerQueued=await runFor('customerRun',customerRecipe,client,()=>client.run(customerRecipe.id,customerRecipe.revision));
 const customerRun=await waitRun(customerQueued.id);assert.equal(customerRun.rows,6);
 const customerState=await client.state();retainOriginals(customerState);
 assert(customerState.recipes.some(value=>value.id===customerRecipe.id&&value.revision===customerRecipe.revision));
 assert(customerState.runs.some(value=>value.id===customerRun.id));
 assert.equal((await state(operator)).runs.length,current.counts.runs);
 const customerStatus=await client.status();
 const customerResult=await client.resultPage(customerRun.id,{offset:0,limit:200});
 assert.equal(customerResult.total,6);assert.equal(customerResult.nextOffset,null);
 const customerProject=await client.exportDelivery({kind:'project',operationId:'customer-edited-'+customerRun.id,expectedStateSha256:customerStatus.stateSha256});
 await client.downloadDelivery(customerProject,join(downloads,'customer-edited-project.zip'));
 await client.close();client=null;await active.stop();active=null;
 const result={schema:'stellar-forge.data-preparation-managed-receiving.v1',completedAt:new Date().toISOString(),
  originalPackageSha256:options.packageSha256,originalProjectSha256:options.projectSha256,originalInputRows:120012,
  originalSourceIds:baseline.sources.map(x=>x.id),originalRecipeId:firstRecipe.id,originalRunIds:baseline.runs.map(x=>x.id),
  managedRunId:run.id,customerRunId:customerRun.id,customerResult,managedCounts:current.counts,customerCounts:customerStatus.counts,
  deliveries,customerProject,browser:{desktop:[1440,1080],phone:[390,844],sections:4,captures:[...captures]},
  archives:{browser:browserArchive,project:join(downloads,'project.zip'),sdkProject:join(downloads,'sdk-project.zip'),customerProject:join(downloads,'customer-edited-project.zip')},
  merchantArchive:join(downloads,'merchant.zip'),events:[...events]};
 emit('INDEPENDENT_CUSTOMER_EDIT_COMPLETED',{customerRunId:customerRun.id,customerCounts:customerStatus.counts,originalCounts:current.counts});
 return result;
}

async function runPipelineJourney(){
 const {PreparationPipelineClient}=await fromSource(D+'pipeline-connection.mjs');
 const preparation=progress.preparation,stageId='prepare',pipelineCaptures=[];
 active=await launch(operator,'pipeline-operator');
 client=await PreparationWorkspaceClient.connect(active.connection,{directory:operator,expectedInstanceId:active.instanceId});
 let parentClient=client,childClient=null,childConnection=null,receivedProject;
 const pipeline=new PreparationPipelineClient(parentClient);
 const hostPath=join(attempt,'pipeline-merchant-host.json');
 await writeJSON(hostPath,{schema:'stellar-forge.data-preparation-workspaces.v1',workspaces:{operator:{directory:operator}}});
 merchant=openMerchant(await readPreparationWorkspaceConfiguration(hostPath));
 await call('connect');
 await call('pipeline_recover');
 const nativeDefinition=await call('pipeline_from_recipe',{recipeId:firstRecipe.id,revision:firstRecipe.revision});
 const definition={...nativeDefinition,label:'Managed pipeline receiving · closed orders',
  description:'Continue the complete retained PREP12 sources, SQL and original result through the installed managed pipeline workspace.'};
 const pipelineId=progress.pins.pipelineId||await pin('pipelineId','p_'+randomUUID().replaceAll('-',''));
 let saved;
 for await(const item of pipeline.all('pipelines'))if(item.id===pipelineId)saved=await pipeline.definition(pipelineId,{revision:1});
 if(!saved)saved=await call('pipeline_save',{definition,pipelineId,expectedRevision:0});
 assert.equal(saved.id,pipelineId);assert.equal(saved.revision,1);
 for(const name of ['label','description','inputs','outputs'])assert.deepEqual(saved[name],definition[name]);
 assert.deepEqual(saved.stages.map(value=>({id:value.id,sql:value.sql,bindings:value.bindings,parameters:value.parameters})),
  definition.stages.map(value=>({id:value.id,sql:value.sql,bindings:value.bindings,parameters:value.parameters})));
 let execution=await call('pipeline_enqueue',{pipelineId,revision:1,requestKey:'managed-pipeline-'+progress.operationId});
 if(execution.status!=='COMPLETE'){
  await call('pipeline_execute',{executionId:execution.id,resume:execution.status!=='QUEUED'});
  execution=await pipeline.wait(execution.id,{intervalMs:100,signal:AbortSignal.timeout(90000)});
 }
 assert.equal(execution.status,'COMPLETE',JSON.stringify(execution.stages));
 await pin('pipelineExecutionId',execution.id);
 const result=await call('pipeline_rows',{executionId:execution.id,stageId,offset:0,limit:200});
 const originalRows=await parentClient.resultPage(priorRun.id,{offset:0,limit:200});
 assert.equal(result.total,6);assert.equal(result.nextOffset,null);
 assert.deepEqual(result.columns,originalRows.columns);assert.deepEqual(result.rows,originalRows.rows);
 const streamed=[];for await(const row of pipeline.allRows(execution.id,stageId,{pageSize:2}))streamed.push(row);
 assert.deepEqual(streamed,result.rows.map(row=>Object.fromEntries(result.columns.map((column,index)=>[column,row[index]]))));
 const nativeRun=execution.stages[stageId].nativeRun;assert(nativeRun);
 await reviewFor(parentClient,nativeRun,{decision:'accept',reviewer:'Managed pipeline receiving',
  note:'The complete original closed-order SQL result matches every retained row and column.'},
  value=>call('pipeline_review',{executionId:execution.id,stageId,...value}));
 retainOriginals(await parentClient.state());
 emit('ORIGINAL_PIPELINE_COMPLETED',{pipelineId,revision:1,executionId:execution.id,nativeRun,rows:result.total});

 const require=createRequire(import.meta.url),{chromium}=require(options.playwrightModule);
 browser=await chromium.launch({headless:true,executablePath:options.chromiumExecutable,args:['--no-sandbox','--disable-dev-shm-usage']});
 context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
 const page=await context.newPage(),pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 const linked=await call('pipeline_browser');
 await page.goto(linked.url,{waitUntil:'networkidle',timeout:30000});
 assert.equal(await page.evaluate(()=>location.hash),'');
 await page.locator('#pipeline-select').selectOption(pipelineId);
 await page.locator('#open-pipeline').click();
 await page.locator('#pipeline-label').waitFor();
 assert.equal(await page.locator('#pipeline-label').inputValue(),saved.label);
 await page.locator('nav button[data-view="runs"]').click();
 await page.locator('#execution-select').selectOption(execution.id);
 await page.locator('#open-execution').click();
 await page.locator('[data-inspect="'+stageId+'"]').click();
 await page.locator('#result-preview').waitFor();
 for(const [kind,width,height] of [['desktop',1440,1080],['phone',390,844]]){
  await page.setViewportSize({width,height});
  for(const section of ['pipelines','inputs','runs','compare','handover']){
   await page.locator('nav button[data-view="'+section+'"]').click();
   await page.waitForLoadState('networkidle');
   const measured=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
   assert(measured.document<=measured.width,kind+' pipeline '+section+' overflows');
   const path=join(pictures,'pipeline-'+section+'-'+kind+'.png');
   await page.screenshot({path,fullPage:true});pipelineCaptures.push({surface:'pipeline',section,kind,path});
  }
 }
 await page.setViewportSize({width:1440,height:1080});
 const browserDownload=page.waitForEvent('download');
 await page.locator('#export-project').click();
 const delivered=await browserDownload,browserProject=join(downloads,'pipeline-browser-project.zip');
 await delivered.saveAs(browserProject);assert.equal(await delivered.failure(),null);
 assert((await lstat(browserProject)).size>0);assert.deepEqual(pageErrors,[]);
 await context.close();context=null;await browser.close();browser=null;

 let requests=progress.pins.pipelineExportRequests;
 if(!requests){
  const status=await call('pipeline_status');
  requests=[
   {kind:'pipeline-project'},
   {kind:'pipeline-results',executionId:execution.id},
   {kind:'pipeline-report',executionId:execution.id},
   {kind:'pipeline-merchant',executionId:execution.id,stageId,label:'Managed original pipeline dataset'},
   {kind:'pipeline-result',executionId:execution.id,stageId,file:'result.jsonl'},
  ].map(value=>({...value,operationId:value.kind+'-'+progress.operationId,
   expectedStateSha256:status.stateSha256,expectedPipelineSha256:status.pipelineStateSha256}));
  await pin('pipelineExportRequests',requests);
 }
 const deliveries=[];
 for(const request of requests){
  const record=await call('pipeline_export',request),path=join(downloads,request.kind+(request.kind==='pipeline-report'?'.html':request.kind==='pipeline-result'?'.jsonl':'.zip'));
  await writeFile(path,await fullFile(record),{flag:'wx',mode:0o600});
  deliveries.push({...record,localPath:path});
 }
 const project=deliveries.find(value=>value.kind==='pipeline-project');
 const sdkProject=join(downloads,'pipeline-sdk-project.zip');
 await parentClient.downloadDelivery(project,sdkProject);
 assert.equal(hash(await readFile(sdkProject)),project.sha256);
 const ticket=await pipeline.downloadLink(pipeline.resultURL(execution.id,stageId,'result.jsonl'));
 const response=await fetch(ticket.url,{redirect:'error'});
 assert.equal(response.status,200);
 const ticketBytes=Buffer.from(await response.arrayBuffer());
 const nativeRecord=(await parentClient.state()).runs.find(value=>value.id===nativeRun);
 assert.equal(hash(ticketBytes),nativeRecord.files['result.jsonl'].sha256);
 emit('COMPLETE_PIPELINE_DELIVERIES',{deliveries:deliveries.map(({kind,bytes,sha256})=>({kind,bytes,sha256})),
  browserBytes:(await lstat(browserProject)).size});

 try{
  receivedProject=await call('pipeline_receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,
   requestKey:'managed-pipeline-customer-'+progress.operationId});
  const receivedAgain=await call('pipeline_receive',{fileId:project.fileId,expectedSourceSha256:project.sha256,
   requestKey:'managed-pipeline-customer-'+progress.operationId});
  assert.equal(receivedAgain.id,receivedProject.id);assert.equal(receivedAgain.path,receivedProject.path);
  assert.equal(receivedAgain.archiveSha256,project.sha256);
  const reopened=await call('pipeline_open_received',{receivedId:receivedProject.id});
  assert.equal(reopened.instanceId,receivedProject.instanceId);
  assert.equal(reopened.path,receivedProject.path);
  childConnection=reopened.connectionFile;
  childClient=await PreparationWorkspaceClient.connect(childConnection,{directory:reopened.path,expectedInstanceId:reopened.instanceId});
  const customerPipeline=new PreparationPipelineClient(childClient);
  const retainedExecution=await customerPipeline.execution(execution.id);
  assert.equal(retainedExecution.id,execution.id);assert.equal(retainedExecution.status,'COMPLETE');
  retainOriginals(await childClient.state());
  const retainedDefinition=await customerPipeline.definition(pipelineId,{revision:1});
  assert.deepEqual(retainedDefinition,saved);
  const customerDefinition={label:'Customer pipeline revision · open orders',
   description:'Independent edit of the complete received pipeline; retain the original closed-order edition and both execution histories.',
   inputs:retainedDefinition.inputs,outputs:retainedDefinition.outputs,
   stages:retainedDefinition.stages.map(value=>({...value,parameters:{...value.parameters,status:'open'}}))};
  const latest=await customerPipeline.definition(pipelineId);
  let customerSaved;
  if(latest.revision===1)customerSaved=await customerPipeline.save(customerDefinition,{pipelineId,expectedRevision:1});
  else{assert.equal(latest.revision,2);customerSaved=latest;}
  assert.equal(customerSaved.revision,2);assert.equal(customerSaved.label,customerDefinition.label);
  assert.equal(customerSaved.stages.find(value=>value.id===stageId).parameters.status,'open');
  let customerExecution=await customerPipeline.enqueue(pipelineId,'managed-pipeline-customer-edit-'+progress.operationId,{revision:2});
  if(customerExecution.status!=='COMPLETE'){
   await customerPipeline.recover();
   customerExecution=await customerPipeline.execution(customerExecution.id);
   await customerPipeline.execute(customerExecution.id,{resume:customerExecution.status!=='QUEUED'});
   customerExecution=await customerPipeline.wait(customerExecution.id,{intervalMs:100,signal:AbortSignal.timeout(90000)});
  }
  assert.equal(customerExecution.status,'COMPLETE',JSON.stringify(customerExecution.stages));
  const customerRows=await customerPipeline.rows(customerExecution.id,stageId,{offset:0,limit:200});
  assert.equal(customerRows.total,6);assert.equal(customerRows.nextOffset,null);
  assert.deepEqual(customerRows.columns,preparation.customerResult.columns);
  assert.deepEqual(customerRows.rows,preparation.customerResult.rows);
  const customerNativeRun=customerExecution.stages[stageId].nativeRun;
  await reviewFor(childClient,customerNativeRun,{decision:'accept',reviewer:'Independent pipeline customer',
   note:'The complete open-order result matches the independent preparation edit while the original closed-order execution remains retained.'},
   value=>customerPipeline.review(customerExecution.id,stageId,value));
  const comparison=await customerPipeline.compare(execution.id,customerExecution.id);
  const oldRows=await customerPipeline.rows(execution.id,stageId,{offset:0,limit:200});
  assert.deepEqual(oldRows.rows,result.rows);assert.deepEqual(oldRows.columns,result.columns);
  assert.deepEqual(await pipeline.definition(pipelineId),saved);
  await pin('pipelineCustomerExecutionId',customerExecution.id);

  browser=await chromium.launch({headless:true,executablePath:options.chromiumExecutable,args:['--no-sandbox','--disable-dev-shm-usage']});
  context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
  const customerPage=await context.newPage(),customerErrors=[];
  customerPage.on('pageerror',error=>customerErrors.push(error.message));
  await customerPage.goto((await customerPipeline.browser()).url,{waitUntil:'networkidle',timeout:30000});
  await customerPage.locator('#pipeline-select').selectOption(pipelineId);await customerPage.locator('#open-pipeline').click();
  assert.equal(await customerPage.locator('#pipeline-label').inputValue(),customerSaved.label);
  assert.equal(JSON.parse(await customerPage.locator('#stage-parameters-0').inputValue()).status,'open');
  for(const [kind,width,height] of [['desktop',1440,1080],['phone',390,844]]){
   await customerPage.setViewportSize({width,height});
   for(const section of ['pipelines','compare']){
    await customerPage.locator('nav button[data-view="'+section+'"]').click();
    if(section==='compare'){
     await customerPage.locator('#before-run').selectOption(execution.id);
     await customerPage.locator('#after-run').selectOption(customerExecution.id);
     await customerPage.locator('#compare-runs').click();await customerPage.locator('#comparison').waitFor();
    }
    await customerPage.waitForLoadState('networkidle');
    const measured=await customerPage.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
    assert(measured.document<=measured.width,'Customer '+kind+' '+section+' overflows');
    const path=join(pictures,'pipeline-customer-'+section+'-'+kind+'.png');
    await customerPage.screenshot({path,fullPage:true});pipelineCaptures.push({surface:'pipeline-customer',section,kind,path});
   }
  }
  assert.deepEqual(customerErrors,[]);
  await context.close();context=null;await browser.close();browser=null;
  const customerStatus=await customerPipeline.status();
  const customerProject=await customerPipeline.exportDelivery({kind:'pipeline-project',
   operationId:'customer-pipeline-'+progress.operationId,
   expectedStateSha256:customerStatus.stateSha256,expectedPipelineSha256:customerStatus.pipelineStateSha256});
  const customerArchive=join(downloads,'pipeline-customer-project.zip');
  await childClient.downloadDelivery(customerProject,customerArchive);
  const customerCounts=(await childClient.status()).counts;
  const operatorCounts=(await parentClient.status()).counts;
  retainOriginals(await childClient.state());retainOriginals(await parentClient.state());
  await childClient.close();childClient=null;
  await parentClient.close();parentClient=null;client=null;
  await merchant.close();merchant=null;
  await active.stop();active=null;
  await assert.rejects(access(childConnection),error=>error.code==='ENOENT');
  emit('PIPELINE_PARENT_AND_RECEIVED_LISTENER_CLOSED',{receivedId:receivedProject.id,customerExecutionId:customerExecution.id});
  active=await launch(receivedProject.path,'pipeline-customer-reopened');
  client=await PreparationWorkspaceClient.connect(active.connection,{directory:receivedProject.path,expectedInstanceId:active.instanceId});
  const coldPipeline=new PreparationPipelineClient(client);
  assert.equal((await coldPipeline.definition(pipelineId)).revision,2);
  assert.equal((await coldPipeline.execution(customerExecution.id)).status,'COMPLETE');
  const coldRows=await coldPipeline.rows(customerExecution.id,stageId,{offset:0,limit:200});
  assert.deepEqual(coldRows,customerRows);retainOriginals(await client.state());
  assert.deepEqual((await client.status()).counts,customerCounts);
  await client.close();client=null;await active.stop();active=null;
  return {pipelineId,revision:1,executionId:execution.id,nativeRun,rows:result.total,customerRevision:2,
   customerExecutionId:customerExecution.id,customerNativeRun,customerRows:customerRows.total,
   receivedId:receivedProject.id,receivedDirectory:receivedProject.path,operatorCounts,customerCounts,
   comparison,deliveries,customerProject,archives:{browser:browserProject,project:project.localPath,sdkProject,customerProject:customerArchive},
   browser:{desktop:[1440,1080],phone:[390,844],sections:5,customerSections:2,captures:pipelineCaptures},
   parentDrainedReceivedListener:true,independentColdReopen:true};
 }finally{
  await childClient?.close().catch(()=>{});
  await parentClient?.close().catch(()=>{});
 }
}

try{
 const preparation=progress.preparation||await runPreparationJourney();
 if(!progress.preparation){progress.preparation=preparation;await saveProgress();}
 const pipeline=await runPipelineJourney();
 const result={...preparation,schema:'stellar-forge.data-preparation-managed-pipeline-receiving.v1',
  completedAt:new Date().toISOString(),operationId:progress.operationId,pipeline,
  managedCounts:pipeline.operatorCounts,preparationEditionCounts:preparation.managedCounts,
  events:[...preparation.events,...events.filter(value=>!preparation.events.some(old=>isDeepStrictEqual(old,value)))],browser:{...preparation.browser,pipeline: pipeline.browser}};
 await writeJSON(join(attempt,'receiving-result.json'),result);
 progress.completed={attempt,completedAt:result.completedAt};await saveProgress();
 emit('COMPLETE_MANAGED_PIPELINE_CUSTOMER_RECEIVED',{pipelineId:pipeline.pipelineId,executionId:pipeline.executionId,
  customerExecutionId:pipeline.customerExecutionId,operatorCounts:pipeline.operatorCounts,customerCounts:pipeline.customerCounts});
}finally{
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
 await client?.close().catch(()=>{});await merchant?.close().catch(()=>{});
 let stopError;
 try{if(active)await active.stop();}catch(error){stopError=error;}
 finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
 if(stopError)throw stopError;
}
