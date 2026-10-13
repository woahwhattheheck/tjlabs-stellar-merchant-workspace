#!/usr/bin/env node
// MIT. Continue the completed original Support case through its portfolio and whole-case receiving.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {constants,createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,readdir,lstat,open,unlink,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {hostname} from 'node:os';

const SCHEMA='stellar-forge.implementation-portfolio-native-result.v1';
const P='stellar/scf-starforge-20261009/sf74-merchant-support-console';
const API='/api/implementation-portfolio';
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const now=()=>new Date().toISOString();
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const fault=(message,code='IMPLEMENTATION_PORTFOLIO_NATIVE_FAILED')=>Object.assign(new Error(message),{code});
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function absolute(value,label){assert(typeof value==='string'&&isAbsolute(value),label+' requires an absolute path');return resolve(value);}
function within(parent,path){const r=relative(parent,path);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));}
async function privateDirectory(path){
  await mkdir(path,{recursive:true,mode:0o700});const st=await lstat(path);
  assert(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0,'Use a real private directory: '+path);
  if(process.getuid)assert.equal(st.uid,process.getuid());return path;
}
async function bytes(path,maximum=96*1024*1024){
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await h.stat();assert(before.isFile()&&before.size<=maximum,'Original file exceeds its declared input');
    const value=await h.readFile(),after=await h.stat();
    assert.equal(value.length,before.size);assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);
    assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);return value;
  }finally{await h.close();}
}
async function filePin(path){
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await h.stat();assert(before.isFile(),'Original member must be a regular file');
    const buffer=Buffer.allocUnsafe(1024*1024),hash=createHash('sha256');let count=0;
    for(;;){const r=await h.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;count+=r.bytesRead;hash.update(buffer.subarray(0,r.bytesRead));}
    const after=await h.stat();assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);assert.equal(count,before.size);assert.equal(after.size,before.size);
    assert.equal(after.mtimeMs,before.mtimeMs);return {bytes:count,sha256:hash.digest('hex')};
  }finally{await h.close();}
}
async function retain(path,value){
  value=Buffer.isBuffer(value)?value:Buffer.from(value);await privateDirectory(dirname(path));
  let h;try{h=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await h.writeFile(value);await h.sync();}
  catch(error){if(error.code!=='EEXIST')throw error;assert((await bytes(path,Math.max(1,value.length))).equals(value),'Original retained bytes changed: '+path);}
  finally{await h?.close();}return {name:basename(path),bytes:value.length,sha256:sha(value)};
}
async function atomic(path,value){
  await privateDirectory(dirname(path));const temp=path+'.'+randomUUID()+'.tmp';let h;
  try{h=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    await h.writeFile(json(value));await h.sync();await h.close();h=null;await rename(temp,path);
    const d=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{await d.sync();}finally{await d.close();}
  }finally{await h?.close();await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function inventory(directory){
  const found=[];async function walk(root,prefix){
    for(const e of(await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const path=join(root,e.name),name=prefix?prefix+'/'+e.name:e.name,st=await lstat(path);
      assert(!st.isSymbolicLink(),'Portable original cannot contain a symbolic link: '+name);
      if(st.isDirectory())await walk(path,name);else{assert(st.isFile());found.push({name,...await filePin(path)});}
    }
  }await walk(directory,'');return found;
}
async function until(read,accept,label,{timeout=180000,interval=200}={}){
  const end=performance.now()+timeout;let value;
  for(;;){value=await read();if(accept(value))return value;if(performance.now()>end)throw Object.assign(fault(label+' did not settle'),{lastResult:value});await pause(interval);}
}
async function http(origin,path,{method='GET',body,headers={},timeout=180000,raw=false}={}){
  const has=body!==undefined;
  const response=await fetch(origin+path,{method,headers:{...(has?{origin}:{}),
    ...(has&&!raw?{'content-type':'application/json'}:{}),...headers},
    ...(has?{body:raw?body:JSON.stringify(body)}:{}),...(raw&&body?.pipe?{duplex:'half'}:{}),
    signal:AbortSignal.timeout(timeout)});
  const original=Buffer.from(await response.arrayBuffer());let result;
  try{result=JSON.parse(original.toString('utf8'));}catch{throw fault('Original API returned a non-JSON response: '+path);}
  if(!response.ok)throw Object.assign(fault(result.detail||result.error||'Original API failed',result.error||'HTTP_'+response.status),
    {status:response.status,result});
  return result;
}
async function allHistory(store,id){
  const rows=[],seen=new Set();let before=null;
  do{const page=await store.history(id,{before,limit:100});for(const row of page.revisions){assert(!seen.has(row.revision));seen.add(row.revision);rows.push(row);}before=page.nextBefore;}while(before!==null);
  return rows;
}
function decodeTool(result){
  if(result?.isError)throw Object.assign(fault('The original MCP tool returned an error'),{result});
  if(result?.structuredContent&&Object.keys(result.structuredContent).length)return result.structuredContent;
  const text=result?.content?.filter(row=>row.type==='text').map(row=>row.text).join('\n');if(text){try{return JSON.parse(text);}catch{}}
  return result;
}

async function main(){
  const {values}=parseArgs({options:Object.fromEntries(['source','source-map','baseline-workspace','workspace','input','modules','browser','python'].map(name=>[name,{type:'string'}])),strict:true});
  const source=absolute(values.source,'Complete selected source'),root=absolute(values.workspace,'Following workspace'),
    baselineRoot=absolute(values['baseline-workspace'],'Completed original Support workspace'),inputPath=absolute(values.input,'Reviewed course input'),
    modules=absolute(values.modules,'Existing Node modules'),browserPath=absolute(values.browser,'Existing Chromium'),
    python=absolute(values.python,'Existing Python'),sourceMapPath=absolute(values['source-map'],'Complete selected source map');
  assert(!within(source,root)&&!within(root,source)&&!within(baselineRoot,root)&&!within(root,baselineRoot),
    'Use a separate following output, preserving both the installed source and original case workspace');
  const inputRaw=await bytes(inputPath,4*1024*1024),input=JSON.parse(inputRaw),baselineRaw=await bytes(join(baselineRoot,'implementation-operation.json'),64*1024*1024),
    baseline=JSON.parse(baselineRaw),originalInput=JSON.parse(await bytes(join(baselineRoot,'original-input.json'),4*1024*1024));
  assert.equal(input.schema,'stellar-forge.implementation-portfolio-native-input.v1');
  assert(/^[A-Za-z0-9][A-Za-z0-9._:-]{3,150}$/.test(input.operationId));const operationId=input.operationId,exportId=label=>'portfolio-'+sha(operationId+'\0'+label).slice(0,48);
  assert.equal(baseline.status,'COMPLETED');assert(uuid(baseline.receivedCase?.id));
  assert(Array.isArray(baseline.resourcesReleased?.results)&&baseline.resourcesReleased.results.every(row=>row.status==='closed'),
    'Complete and close the existing original Support owners first');
  const baselineRevision=baseline.finalExport?.caseRevision??baseline.steps.final_complete_native_delivery?.revision;
  assert(digest(baselineRevision));assert.equal(input.baselineOperationId,baseline.operationId);
  assert.equal(input.baselineCaseId,baseline.receivedCase.id);assert.equal(input.baselineRevision,baselineRevision);
  assert.equal(input.actor,originalInput.operator?.name,'Use the actual original operated case participant');
  assert(Array.isArray(input.taskIds)&&input.taskIds.length&&new Set(input.taskIds).size===input.taskIds.length);
  assert(input.definitionPatch&&typeof input.definitionPatch.id==='string'&&input.taskIds.includes(input.definitionPatch.id));
  assert(Object.keys(input.definitionPatch).every(key=>['id','title','acceptance'].includes(key)));
  assert(Object.keys(input.definitionPatch).some(key=>key!=='id'),'Retain an explicit reviewed definition change for the receiving comparison');
  const mapRaw=await bytes(sourceMapPath,32*1024*1024),map=JSON.parse(mapRaw);
  const declared=Array.isArray(map.files)?map.files:Object.entries(map.files??{}).map(([path,value])=>({path,...(typeof value==='string'?{source:value}:value)}));
  assert(declared.length>0,'Supply the complete selected native source map');
  const selection=[];
  for(const entry of declared){
    assert(typeof entry.path==='string'&&!isAbsolute(entry.path)&&!entry.path.split('/').some(part=>part==='..'||part===''));
    const pin=await filePin(join(source,entry.path)),literal=entry.source??entry.content??entry.text;
    const expected=typeof literal==='string'?sha(Buffer.from(literal)):entry.sha256;
    assert(digest(expected));assert.equal(pin.sha256,expected,'Original selected source changed: '+entry.path);
    if(entry.bytes!==undefined)assert.equal(pin.bytes,entry.bytes);
    selection.push({path:entry.path,...pin});
  }
  for(const required of ['case-store.mjs','case-commissioning.mjs','commissioning.mjs','case-source-package.mjs',
    'case-source-delivery.mjs','commissioning-cli.mjs','case-implementation-portfolio.mjs','implementation-portfolio-model.mjs',
    'implementation-portfolio-http.mjs','implementation-portfolio-cli.mjs','implementation-portfolio.mjs','implementation-portfolio.html',
    'implementation-portfolio.css','server.mjs','workspace-file.mjs','case-desk.mjs','console.mjs',
    'case-commercial.mjs','tools/receive_implementation_portfolio.mjs'])
    assert(selection.some(row=>row.path===P+'/'+required),'Keep the complete original product source: '+required);
  await privateDirectory(root);
  const ownerPath=join(root,'active-owner.json'),owner={operationId,pid:process.pid,hostname:hostname(),startedAt:now()};
  const ownerHandle=await open(ownerPath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{await ownerHandle.writeFile(json(owner));await ownerHandle.sync();}
  catch(error){await ownerHandle.close().catch(()=>{});await unlink(ownerPath).catch(()=>{});throw error;}
  await ownerHandle.close();
  // A leftover owner is deliberately not removed by another invocation. The
  // maintained outer job reconciles its actual original process before recovery.
  const paths={cases:join(root,'cases'),sources:join(root,'cases','source-bundles'),packages:join(root,'packages'),
    baselinePackage:join(root,'original-complete-package'),firstReceive:join(root,'first-receiving'),secondReceive:join(root,'second-receiving'),
    outputs:join(root,'delivery'),screens:join(root,'screens'),browserProfile:join(root,'browser-profile'),
    finalPackage:join(root,'final-complete-package'),freshCases:join(root,'fresh-cases'),freshSources:join(root,'fresh-cases','source-bundles'),
    freshReceive:join(root,'fresh-receiving')};
  let journal,saveTail=Promise.resolve(),context=null,desk=null,portfolio=null,primary=null,cancelled=false;const sourceReaders=[];
  const journalFile=join(root,'implementation-portfolio-operation.json'),controller=new AbortController();
  const cancel=()=>{cancelled=true;controller.abort();};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const stop=()=>{if(cancelled)throw fault('The original following operation was stopped.','PORTFOLIO_NATIVE_CANCELLED');};
  const save=()=>saveTail=saveTail.catch(()=>{}).then(()=>atomic(journalFile,journal));
  const artifactRoots=()=>[paths.outputs,paths.screens,paths.baselinePackage,paths.finalPackage,
    join(paths.firstReceive,'package'),join(paths.secondReceive,'package'),join(paths.freshReceive,'package')];
  const artifactInventory=async()=>{
    const files=[];
    for(const directory of artifactRoots()){
      let found;try{found=await inventory(directory);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      for(const member of found)files.push({path:relative(root,join(directory,member.name)).split(sep).join('/'),
        bytes:member.bytes,sha256:member.sha256});
    }
    for(const name of ['original-input.json','completed-baseline-operation.json','source-map.json'])
      files.push({path:name,...await filePin(join(root,name))});
    return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  };
  const verifyFiles=async files=>{
    assert(Array.isArray(files)&&files.length>0,'Retain the complete original delivery inventory');
    for(const selected of files){
      assert(typeof selected.path==='string'&&!isAbsolute(selected.path)&&within(root,resolve(root,selected.path)));
      assert.deepEqual(await filePin(join(root,selected.path)),{bytes:selected.bytes,sha256:selected.sha256},
        'An original retained delivery/source member changed: '+selected.path);
    }
  };
  const stage=async(name,fn)=>{stop();if(journal.stages[name]){await verifyFiles(journal.stages[name].retainedFiles);return journal.stages[name];}
    journal.activeStage=name;journal.state='running';await save();await exactSource();
    const result=await fn();stop();journal.stages[name]={completedAt:now(),...result,retainedFiles:await artifactInventory()};
    await save();return journal.stages[name];};
  const exactSource=async()=>{for(const selected of selection){const pin=await filePin(join(source,selected.path));assert.deepEqual(pin,{bytes:selected.bytes,sha256:selected.sha256},'Keep the selected source at every continuation boundary');}};
  const retainResult=async(name,value)=>{const path=join(paths.outputs,name),pin=await retain(path,json(value));return {path,...pin};};
  const originalRequest=async(key,make,run)=>{
    if(!journal.requests[key]){journal.requests[key]={input:await make(),preparedAt:now()};await save();}
    const retained=journal.requests[key];if(retained.result)return retained.result;
    stop();const result=await run(copy(retained.input));retained.result=result;retained.returnedAt=now();await save();return result;
  };
  const loadModule=name=>import(pathToFileURL(join(source,P,name)).href);
  let store,native,workspace,commissioning,model,commercial,caseCommands;
  try{
    for(const path of Object.values(paths))await privateDirectory(path);
    const binding={operationId:baseline.operationId,caseId:baseline.receivedCase.id,revision:baselineRevision,journalSha256:sha(baselineRaw),
      inputSha256:sha(inputRaw),sourceMapSha256:sha(mapRaw),source:source,runtime:{node:process.execPath,modules,browser:browserPath,python}};
    try{journal=JSON.parse(await bytes(journalFile,64*1024*1024));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(journal){assert.equal(journal.schema,SCHEMA);assert.equal(journal.operationId,operationId);assert.deepEqual(journal.binding,binding);}
    else journal={schema:SCHEMA,operationId,state:'running',startedAt:now(),binding,paths,sourceSelection:selection,stages:{},requests:{},
      screenshots:[],browserErrors:[],resources:{closed:false,browserClosed:false,serversClosed:false,workersClosed:false}};
    await retain(join(root,'original-input.json'),inputRaw);await retain(join(root,'completed-baseline-operation.json'),baselineRaw);
    await retain(join(root,'source-map.json'),mapRaw);await save();
    if(journal.state==='completed'&&journal.resources.closed){
      await verifyFiles(journal.deliveryInventory?.files);await verifyFiles(journal.deliveryInventory?.sourceMembers);
      assert.deepEqual(await artifactInventory(),journal.deliveryInventory.files,'Keep the complete original delivered artifact set');
      const caseStore=await loadModule('case-store.mjs');
      for(const selected of journal.deliveryInventory.cases){
        const selectedStore=await caseStore.openCaseStore(join(root,selected.directory)),
          record=await selectedStore.read(selected.id,selected.revision);
        assert.equal(sha(record.workspaceText),selected.workspaceSha256);
        assert.equal(record.supportText===null?null:sha(record.supportText),selected.supportSha256);
      }
      process.stdout.write(json({state:'completed',operationId,result:journalFile,verifiedDelivery:true}));return;
    }
    journal.resources={closed:false,browserClosed:false,serversClosed:false,workersClosed:false};journal.state='running';
    delete journal.error;await save();
    const modulesLoaded=await Promise.all(['case-store.mjs','commissioning-cli.mjs','workspace-file.mjs','commissioning.mjs',
      'implementation-portfolio-model.mjs','case-commercial.mjs','case-commissioning.mjs','case-implementation-portfolio.mjs'].map(loadModule));
    const [caseStore,cli,ws,comm,mod,commercialModule,commands,portfolioModule]=modulesLoaded;
    native=async argv=>{
      journal.nativeClosure={state:'running',action:argv[0],startedAt:now()};await save();
      try{const result=await cli.commissioningCli(argv);journal.nativeClosure={state:'closed',action:argv[0],completedAt:now()};await save();return result;}
      catch(error){journal.nativeClosure={state:'unconfirmed',action:argv[0],error:{code:error.code??'NATIVE_CLI_FAILED',message:error.message,
        ...(error.closeError?{closeError:error.closeError.message}:{})}};await save().catch(()=>{});throw error;}
    };workspace=ws;commissioning=comm;model=mod;commercial=commercialModule;caseCommands=commands;
    model.day(input.asOf,'actual report date');model.text(input.actor,200,'actual operator',{empty:false});
    assert(Buffer.byteLength(input.actor)<=200,'Use the original source receiving actor byte bound');
    model.validateChanges(input.changes);model.validateChanges(input.followupChanges);model.validateChanges(input.receiverChanges);
    assert(input.changes.status!=='retired'&&input.followupChanges.status!=='retired',
      'Keep the selected actual task active for the stale-receiving demonstration');
    const originalCases=join(baselineRoot,'receiver-cases'),originalStore=await caseStore.openCaseStore(originalCases),
      originalRecord=await originalStore.read(binding.caseId,binding.revision),originalState=(await workspace.parseWorkspace(originalRecord.workspaceText)).commissioning;
    assert(originalState,'The original operated case must contain its real implementation');
    for(const taskId of input.taskIds)assert(originalState.tasks.some(row=>row.id===taskId&&!row.retired&&row.status!=='retired'),
      'Use actual active original tasks');
    const definitionOriginal=originalState.tasks.find(row=>row.id===input.definitionPatch.id);
    assert(Object.entries(input.definitionPatch).some(([key,value])=>key!=='id'&&value!==definitionOriginal[key]),
      'The explicitly reviewed definition patch must change its selected original definition');
    assert(originalState.receiving.some(row=>row.taskIds.includes(input.definitionPatch.id)&&commissioning.commissioningReceivingMatches(originalState,row)),
      'Choose an actual original received task for the current-versus-earlier subject demonstration');
    store=await caseStore.openCaseStore(paths.cases);
    portfolio=portfolioModule.createImplementationPortfolio({store,workspaceId:commercial.commercialWorkspaceId(paths.cases)});
    const packageResult=await stage('original_full_case_and_two_receiving_branches',async()=>{
      const exported=await originalRequest('baseline-export',async()=>({caseId:binding.caseId,revision:binding.revision,generatedAt:now()}),
        async request=>native(['export','--cases-dir',originalCases,'--source-dir',join(originalCases,'source-bundles'),
          '--case',request.caseId,'--revision',request.revision,'--out',paths.baselinePackage,'--export-id',exportId('original'),
          '--generated-at',request.generatedAt,'--python',python]));
      const manifestSha=exported.caseSource.manifestSha256;assert(digest(manifestSha));
      const received=[];
      for(const [key,directory]of [['first',paths.firstReceive],['second',paths.secondReceive]])
        received.push(await originalRequest(key+'-receive',async()=>({requestId:randomUUID(),actor:input.actor,manifestSha256:manifestSha}),
          request=>native(['receive-package','--from',paths.baselinePackage,'--sha256',request.manifestSha256,'--out',directory,
            '--cases-dir',paths.cases,'--source-dir',paths.sources,'--request-id',request.requestId,'--actor',request.actor,'--python',python])));
      assert(uuid(received[0].case.id)&&uuid(received[1].case.id));assert.notEqual(received[0].case.id,received[1].case.id);
      for(const result of received){assert.equal(result.sourceCase.id,binding.caseId);const record=await store.read(result.case.id,result.case.revision);
        assert.deepEqual((await workspace.parseWorkspace(record.workspaceText)).commissioning,originalState);}
      return {exported,primary:received[0],secondary:received[1]};
    });
    const primaryId=packageResult.primary.case.id,secondaryId=packageResult.secondary.case.id;
    const {start}=await loadModule('server.mjs');desk=await start({casesDir:paths.cases,sourceDir:paths.sources,packageDir:paths.packages,
      port:journal.serverPort??0,allowLoopback:true,environment:{...process.env,SCF_PYTHON:python}});
    const origin=new URL(desk.url).origin,actualPort=Number(new URL(origin).port);
    assert(Number.isSafeInteger(actualPort)&&actualPort>0);
    if(journal.serverPort!==undefined)assert.equal(actualPort,journal.serverPort);
    if(journal.browserOrigin!==undefined)assert.equal(origin,journal.browserOrigin,'Keep the original browser storage origin');
    journal.serverPort=actualPort;journal.browserOrigin=origin;await save();
    const require=createRequire(join(modules,'playwright','package.json')),{chromium}=require('playwright');
    context=await chromium.launchPersistentContext(paths.browserProfile,{executablePath:browserPath,headless:true,viewport:{width:1440,height:1000},
      args:['--no-sandbox','--disable-dev-shm-usage']});
    let page=context.pages()[0]??await context.newPage();page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>{journal.browserErrors.push({at:now(),message:error.message});});
    const screenshot=async name=>{const path=join(paths.screens,name+'.png');await page.screenshot({path,fullPage:true});
      const pin=await filePin(path);journal.screenshots=journal.screenshots.filter(row=>row.name!==name);
      journal.screenshots.push({name,path,...pin});await save();};
    const idle=()=>until(()=>page.locator('#capture').isEnabled(),Boolean,'original portfolio operation');
    const openDesk=async()=>{await page.goto(origin+'/implementation-portfolio',{waitUntil:'domcontentloaded'});await idle();};
    const capture=async()=>{
      await page.locator('#as-of').fill(input.asOf);
      await page.locator('#case-query').fill('');await page.locator('#case-status').fill(originalRecord.metadata.status);
      await page.locator('#case-due').fill('');await page.locator('#filter-q').fill('');
      await page.locator('#filter-owner').fill('');await page.locator('#filter-status').selectOption('');
      await page.locator('#filter-attention').selectOption('all');await page.locator('#filter-due').fill('');
      await page.locator('#filter-retired').check();
      const response=page.waitForResponse(r=>new URL(r.url()).pathname===API+'/capture'&&r.request().method()==='POST');
      await page.locator('#capture').click();const result=await(await response).json();await idle();assert.equal(result.schema,model.SELECTION_SCHEMA);
      return result;
    };
    const allRows=async selected=>{
      const rows=[],diagnostics=[];let cursor=null;
      do{const result=await portfolio.page({selection:selected,query:{includeRetired:true},cursor,limit:100});
        rows.push(...result.rows);diagnostics.push(result);cursor=result.nextCursor;}while(cursor);
      assert.equal(new Set(rows.map(row=>row.caseId+':'+row.task.id)).size,rows.length);
      assert(diagnostics.every(row=>row.unavailable.length===0));return rows;
    };
    await stage('whole_pinned_catalog_and_original_browser',async()=>{
      await openDesk();const selected=await capture();assert(selected.cases.some(row=>row.id===primaryId));assert(selected.cases.some(row=>row.id===secondaryId));
      const rows=await allRows(selected);assert.equal(rows.length,originalState.tasks.length*2);
      await screenshot('01-captured-original-implementation-cases');
      const selectedTask=rows.find(row=>row.caseId===primaryId&&row.task.id===input.taskIds[0]);assert(selectedTask);
      const definitionRow=rows.find(row=>row.caseId===primaryId&&row.task.id===input.definitionPatch.id);
      assert(definitionRow&&[definitionRow.technical,definitionRow.customer].some(row=>row?.current),
        'Choose the task whose actual selected receiving observation is current before the definition change');
      await page.locator('#filter-q').fill(input.taskIds[0]);await page.locator('#filter').click();await idle();
      const tr=page.locator('#tasks tr').filter({has:page.locator('a[href*="case='+primaryId+'"]')}).filter({hasText:input.taskIds[0]}).first();
      await tr.getByRole('button',{name:selectedTask.task.title,exact:true}).click();await idle();
      assert((await page.locator('#detail-raw').textContent()).includes(primaryId));await screenshot('02-complete-task-source-and-receiving');
      await page.setViewportSize({width:390,height:844});await screenshot('03-portfolio-phone');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Portfolio must fit the phone viewport');
      await page.setViewportSize({width:1440,height:1000});
      return {selection:selected,rows:rows.length,reportDate:input.asOf};
    });
    await stage('reviewed_browser_edit_lost_reply_and_original_replay',async()=>{
      await openDesk();
      if(!journal.requests.browserApply){
      await capture();
      await page.locator('#filter-q').fill('');await page.locator('#filter').click();await idle();
      while(await page.locator('#more').isEnabled()){await page.locator('#more').click();await idle();}
      for(const taskId of input.taskIds){const row=page.locator('#tasks tr').filter({has:page.locator('a[href*="case='+primaryId+'"]')}).filter({hasText:taskId}).first();
        const check=row.locator('input[type=checkbox]');if(!await check.isChecked())await check.check();await idle();}
      for(const id of ['change-owner','change-due','change-status','change-notes'])await page.locator('#'+id).uncheck();
      for(const [key,value]of Object.entries(input.changes)){
        const control={owner:['change-owner','edit-owner'],dueOn:['change-due','edit-due'],status:['change-status','edit-status'],notes:['change-notes','edit-notes']}[key];
        await page.locator('#'+control[0]).check();if(key==='status')await page.locator('#'+control[1]).selectOption(value);else await page.locator('#'+control[1]).fill(value);
      }
      await page.locator('#actor').fill(input.actor);await page.locator('#preview').click();await idle();
      assert(await page.locator('#preview-panel').isVisible());await screenshot('04-reviewed-operational-task-edits');
        let armed=true,routeFailure=null;
        await page.route('**'+API+'/apply',async route=>{
          if(!armed){await route.continue();return;}armed=false;
          try{
            const body=route.request().postDataJSON();
            assert.equal(body.caseId,primaryId);assert.deepEqual(body.taskIds,[...input.taskIds].sort());assert.deepEqual(body.changes,input.changes);
            journal.requests.browserApply={input:body,preparedAt:now()};await save();
            const response=await route.fetch(),result=await response.json();
            journal.requests.browserApply.observedResponse={status:response.status(),body:result};await save();
            assert.equal(response.status(),200);assert.equal(result.state,'COMPLETE');
            journal.requests.browserApply.nativeResult=result;await save();
          }catch(error){routeFailure=error;}
          finally{await route.abort('failed').catch(()=>{});}
        });
        try{await page.locator('#confirm').check();await page.locator('#apply').click();await idle();}
        finally{await page.unroute('**'+API+'/apply');}
        if(routeFailure)throw routeFailure;
      }
      const request=journal.requests.browserApply;assert(request?.input,'Keep the accepted original browser request');
      // Resume reads the same retained command before any new preview or UUID.
      const observed=await portfolio.status(request.input);
      await openDesk();let saved=page.locator('#requests article').filter({hasText:request.input.requestId});
      assert.equal(await saved.count(),1,'The original browser request remains in the same profile');
      await saved.getByRole('button',{name:'Read original status',exact:true}).click();await idle();
      if(observed.state==='NOT_STARTED'){
        stop();await saved.getByRole('button',{name:'Retry same original request',exact:true}).click();await idle();
      }
      const complete=await portfolio.status(request.input);assert.equal(complete.state,'COMPLETE');
      request.nativeResult??=complete;await save();
      await saved.getByRole('button',{name:'Read original status',exact:true}).click();await idle();
      assert((await saved.textContent()).includes('COMPLETE'));await screenshot('05-original-request-reconciled-after-lost-response');
      const replay=await portfolio.apply(request.input);assert.equal(replay.replayed,true);
      assert.equal(replay.requestSha256,request.nativeResult.requestSha256);
      const primary=await store.read(primaryId),secondary=await store.read(secondaryId);
      assert.equal(secondary.revision,packageResult.secondary.case.revision,'Other original receiving branch is unchanged');
      const state=(await workspace.parseWorkspace(primary.workspaceText)).commissioning;
      assert.equal(state.events.filter(row=>row.id===request.input.requestId).length,1);
      for(const taskId of input.taskIds){const task=state.tasks.find(row=>row.id===taskId);for(const [key,value]of Object.entries(input.changes))assert.equal(task[key],value);}
      const {implementationPortfolioCli}=await loadModule('implementation-portfolio-cli.mjs');
      const requestPath=join(paths.outputs,'original-browser-apply.json'),receiptPath=join(paths.outputs,'original-apply-cli-receipt.json');
      await retain(requestPath,json(request.input));
      const first=await implementationPortfolioCli(['apply','--cases-dir',paths.cases,'--input',requestPath,'--out',receiptPath]);
      journal.firstApplyReceipt={path:receiptPath,...await filePin(receiptPath)};await save();
      return {requestId:request.input.requestId,result:replay,firstCli:first,primaryRevision:primary.revision,unchangedSecondary:secondary.revision};
    });
    await stage('current_case_conflict_then_same_request_recovery',async()=>{
      const stale=await originalRequest('stale-reviewed-operation',async()=>{
        const record=await store.read(primaryId),preview=await portfolio.preview({caseId:primaryId,expectedRevision:record.revision,
          taskIds:input.taskIds,changes:input.followupChanges});
        return {caseId:primaryId,expectedRevision:record.revision,taskIds:input.taskIds,changes:input.followupChanges,
          previewSha256:preview.previewSha256,requestId:randomUUID(),actor:input.actor,recordedAt:now()};
      },async request=>({prepared:request}));
      const prepared=stale.prepared;
      await originalRequest('reviewed-source-definition-change',async()=>{
        const record=await store.read(primaryId),state=(await workspace.parseWorkspace(record.workspaceText)).commissioning;
        return {id:primaryId,expectedRevision:record.revision,command:{type:'save_tasks',requestId:randomUUID(),actor:input.actor,recordedAt:now(),
          expectedRevision:state.revision,payload:{tasks:[input.definitionPatch]}}};
      },request=>caseCommands.operateCaseCommissioning(store,request));
      let conflict;try{await portfolio.apply(prepared);}catch(error){conflict=error;}
      assert.equal(conflict?.code,'CASE_CONFLICT');
      const observed=await portfolio.status(prepared);assert.equal(observed.state,'NOT_STARTED');
      const result=await originalRequest('fresh-followup-operation',async()=>{
        const record=await store.read(primaryId),preview=await portfolio.preview({caseId:primaryId,expectedRevision:record.revision,
          taskIds:input.taskIds,changes:input.followupChanges});
        return {caseId:primaryId,expectedRevision:record.revision,taskIds:input.taskIds,changes:input.followupChanges,
          previewSha256:preview.previewSha256,requestId:randomUUID(),actor:input.actor,recordedAt:now()};
      },request=>portfolio.apply(request));
      const later=await store.read(primaryId),replay=await portfolio.apply(journal.requests.browserApply.input);
      assert.equal(replay.replayed,true);assert.equal((await store.read(primaryId)).revision,later.revision,'Original replay must preserve the later actual edits');
      const state=(await workspace.parseWorkspace(later.workspaceText)).commissioning,receiving=state.receiving.filter(row=>row.taskIds.includes(input.definitionPatch.id));
      assert(receiving.some(row=>!commissioning.commissioningReceivingMatches(state,row)),'Earlier receiving retains its original subject');
      await openDesk();await capture();await page.locator('#filter-attention').selectOption('receiving_stale');await page.locator('#filter').click();await idle();
      await screenshot('06-later-definition-and-earlier-receiving');return {originalRejection:observed,followup:result,laterRevision:later.revision,originalReplay:replay};
    });
    await stage('complete_pinned_reports_and_cli_first_receipt',async()=>{
      const selected=await originalRequest('report-selection',()=>({asOf:input.asOf,status:originalRecord.metadata.status}),request=>portfolio.capture(request));
      const artifacts=[];
      for(const format of ['json','html']){
        const report=await portfolio.export({selection:selected,query:{includeRetired:true},format});
        const pin=await retain(join(paths.outputs,report.name),report.text);assert.equal(pin.sha256,report.sha256);artifacts.push(pin);
        if(format==='html'){
          await page.goto(pathToFileURL(join(paths.outputs,report.name)).href);await page.setViewportSize({width:390,height:844});
          await screenshot('07-complete-operating-report-phone');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Complete report should pan inside bounded tables');
          await page.setViewportSize({width:1440,height:1000});await screenshot('08-complete-operating-report-desktop');
        }else{const parsed=JSON.parse(report.text);assert(parsed.coverage.complete);assert.equal(parsed.rows.length,originalState.tasks.length*2);}
      }
      const {implementationPortfolioCli}=await loadModule('implementation-portfolio-cli.mjs');
      const requestPath=join(paths.outputs,'original-browser-apply.json'),receiptPath=join(paths.outputs,'original-apply-cli-receipt.json');
      await retain(requestPath,json(journal.requests.browserApply.input));
      const cliArgs=['apply','--cases-dir',paths.cases,'--input',requestPath,'--out',receiptPath];
      const first=await implementationPortfolioCli(cliArgs),before=await filePin(receiptPath),second=await implementationPortfolioCli(cliArgs);
      assert(first.outputs[0].retained&&second.outputs[0].retained);assert.deepEqual(await filePin(receiptPath),before);
      assert.deepEqual(before,{bytes:journal.firstApplyReceipt.bytes,sha256:journal.firstApplyReceipt.sha256});
      return {selectionSha256:selected.selectionSha256,artifacts,firstCli:first,recoveredCli:second};
    });
    await stage('whole_case_export_fresh_receiving_and_later_edit_preservation',async()=>{
      const exported=await originalRequest('final-export',async()=>{
        const record=await store.read(primaryId);return {caseId:primaryId,revision:record.revision,generatedAt:now()};
      },request=>native(['export','--cases-dir',paths.cases,'--source-dir',paths.sources,'--case',request.caseId,
        '--revision',request.revision,'--out',paths.finalPackage,'--export-id',exportId('final'),'--generated-at',request.generatedAt,'--python',python]));
      const received=await originalRequest('fresh-receive',async()=>({requestId:randomUUID(),actor:input.actor,manifestSha256:exported.caseSource.manifestSha256}),
        request=>native(['receive-package','--from',paths.finalPackage,'--sha256',request.manifestSha256,'--out',paths.freshReceive,
          '--cases-dir',paths.freshCases,'--source-dir',paths.freshSources,'--request-id',request.requestId,'--actor',request.actor,'--python',python]));
      const freshStore=await caseStore.openCaseStore(paths.freshCases),record=await freshStore.read(received.case.id,received.case.importedRevision??received.case.revision),
        sourceRecord=await store.read(primaryId,journal.requests['final-export'].input.revision);
      assert.deepEqual((await workspace.parseWorkspace(record.workspaceText)).commissioning,
        (await workspace.parseWorkspace(sourceRecord.workspaceText)).commissioning);
      const receiverEdit=await originalRequest('fresh-receiver-reviewed-edit',async()=>{
        const current=await freshStore.read(received.case.id),state=(await workspace.parseWorkspace(current.workspaceText)).commissioning;
        assert(input.taskIds.some(id=>Object.entries(input.receiverChanges).some(([key,value])=>state.tasks.find(task=>task.id===id)[key]!==value)),
          'Retain an actual reviewed later edit for the fresh receiver');
        return {id:received.case.id,expectedRevision:current.revision,command:{type:'save_tasks',requestId:randomUUID(),
          actor:input.actor,recordedAt:now(),expectedRevision:state.revision,
          payload:{tasks:input.taskIds.map(id=>({id,...input.receiverChanges}))}}};
      },request=>caseCommands.operateCaseCommissioning(freshStore,request));
      const later=await freshStore.read(received.case.id);assert.notEqual(later.revision,record.revision);
      const request=journal.requests['fresh-receive'].input;
      const reopened=await native(['receive-package','--from',paths.finalPackage,'--sha256',request.manifestSha256,'--out',paths.freshReceive,
        '--cases-dir',paths.freshCases,'--source-dir',paths.freshSources,'--request-id',request.requestId,'--actor',request.actor,'--python',python]);
      assert.equal(reopened.case.id,received.case.id);assert.equal((await freshStore.read(received.case.id)).revision,later.revision,'Original receiving replay preserves later receiver edits');
      const completeHistory=await allHistory(freshStore,received.case.id);for(const version of completeHistory)await freshStore.read(received.case.id,version.revision);
      await retainResult('FINAL_PORTFOLIO_CASE_RECEIVING.json',{exported,received,receiverEdit,laterRevision:later.revision,reopened,history:completeHistory});
      journal.receivedCase={id:received.case.id,revision:later.revision,directory:paths.freshCases};
      const {createCaseSourceDelivery}=await loadModule('case-source-delivery.mjs'),members=new Map();
      for(const [selectedStore,directory,result]of [[store,paths.sources,packageResult.primary],[freshStore,paths.freshSources,received]]){
        const delivery=await createCaseSourceDelivery({store:selectedStore,directory,python});sourceReaders.push(delivery);
        for(const bundle of result.sourceBundles){
          const resolved=await delivery.resolveBundle(bundle);
          for(const member of resolved.descriptor.files){
            const original=await delivery.resolveFile({...bundle,path:member.path});assert(within(root,original.path));
            const pin=await filePin(original.path);assert.equal(pin.sha256,member.sha256);assert.equal(String(pin.bytes),String(member.bytes));
            members.set(original.path,{path:relative(root,original.path).split(sep).join('/'),...pin});
          }
        }
      }
      // A source-free case still has its original full source-bearing package manifest.
      members.set(join(paths.finalPackage,'case-source-package.json'),{path:relative(root,join(paths.finalPackage,'case-source-package.json')).split(sep).join('/'),
        ...await filePin(join(paths.finalPackage,'case-source-package.json'))});
      journal.sourceMembers=[...members.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);await save();
      return {exported,received,receiverEdit,laterRevision:later.revision,reopened,history:completeHistory.length};
    });
    assert.equal(journal.browserErrors.length,0,'Keep all actual browser failures visible');
    await exactSource();await verifyFiles(journal.sourceMembers);
    const selectedCases=[];
    for(const [selectedStore,directory,id]of [[store,paths.cases,primaryId],[store,paths.cases,secondaryId],
      [await caseStore.openCaseStore(paths.freshCases),paths.freshCases,journal.receivedCase.id]]){
      const record=await selectedStore.read(id);
      selectedCases.push({directory:relative(root,directory).split(sep).join('/'),id,revision:record.revision,
        workspaceSha256:sha(record.workspaceText),supportSha256:record.supportText===null?null:sha(record.supportText)});
    }
    journal.deliveryInventory={files:await artifactInventory(),sourceMembers:journal.sourceMembers,cases:selectedCases};
    journal.state='completed';journal.completedAt=now();delete journal.activeStage;await save();
  }catch(error){
    primary=error;if(journal){journal.state='failed';journal.error={code:error.code??'PORTFOLIO_NATIVE_FAILED',message:error.message,stack:error.stack};await save().catch(e=>{primary.journalError=e;});}
  }finally{
    const failures=[];
    for(const [name,close]of [['browserClosed',()=>context?.close()],['serversClosed',()=>desk?.close()],['workersClosed',async()=>{
      const outcomes=await Promise.allSettled([portfolio?.close(),...sourceReaders.map(reader=>reader.close())]);
      const failed=outcomes.filter(row=>row.status==='rejected');
      if(failed.length)throw Object.assign(fault('Original portfolio/source readers did not all close'),{causes:failed.map(row=>row.reason)});
      if(journal?.nativeClosure&&journal.nativeClosure.state!=='closed')throw fault('The original native CLI closure needs owning-process reconciliation');
    }]])
      try{await close();if(journal)journal.resources[name]=true;}catch(error){failures.push({resource:name,message:error.message});}
    if(journal){journal.resources.closed=failures.length===0;journal.resources.failures=failures;
      if(failures.length){journal.state='failed';primary??=fault('The original following resources did not all close');}
      await save().catch(error=>{primary??=error;});}
    process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
    const actual=await bytes(ownerPath,4096).catch(()=>null);if(failures.length===0&&actual&&actual.equals(Buffer.from(json(owner))))await unlink(ownerPath);
  }
  if(primary)throw primary;
  assert.equal(journal.state,'completed');assert(journal.resources.closed);
  process.stdout.write(json({state:'completed',operationId,result:journalFile,receivedCase:journal.receivedCase,
    screenshots:journal.screenshots,resources:journal.resources}));
}
main().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'PORTFOLIO_NATIVE_FAILED',detail:error.message},null,2)+'\n');process.exitCode=1;});
