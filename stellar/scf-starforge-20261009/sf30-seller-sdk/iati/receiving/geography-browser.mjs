// MIT. One complete browser receiving leg in the parent-owned IATI geography run.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, chmod, mkdir, open, readFile, readdir, rename, stat, unlink, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA='stellar-forge.iati-geography-browser-receiving.v1';
const PREFIX='stellar/scf-starforge-20261009/sf30-seller-sdk/iati';
const HASH=/^[a-f0-9]{64}$/;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const digest=v=>createHash('sha256').update(v).digest('hex');
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const observePromise=promise=>{promise.catch(()=>{});return promise;};
async function exists(path){try{await access(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function json(path,maximum=129*1024*1024){
 const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<=maximum,'Use the complete original regular JSON file: '+path);
 return JSON.parse(await readFile(path,'utf8'));
}
async function fileIdentity(path){
 const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink(),'Expected a complete original regular file: '+path);
 const hash=createHash('sha256');let size=0;
 for await(const block of createReadStream(path)){size+=block.length;hash.update(block);}
 const after=await lstat(path);assert(size===info.size&&after.dev===info.dev&&after.ino===info.ino&&after.size===info.size&&after.mtimeMs===info.mtimeMs,'An original file changed while it was read: '+path);
 return {path,bytes:size,sha256:hash.digest('hex')};
}
async function write(path,value,immutable=false){
 const body=Buffer.isBuffer(value)?value:bytes(value);
 if(immutable&&await exists(path)){assert((await readFile(path)).equals(body),'The original retained file identifies another selection: '+path);return fileIdentity(path);}
 const temporary=path+'.partial-'+process.pid+'-'+Date.now();
 const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
 await rename(temporary,path);
 const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
 return fileIdentity(path);
}
async function verifyFiles(files){for(const item of files||[]){const actual=await fileIdentity(item.path);assert(actual.bytes===item.bytes&&actual.sha256===item.sha256,'The complete retained output changed: '+item.path);}}
async function chooseRuntime(input){
 const moduleOverride=process.env.SF30_PLAYWRIGHT_MODULE;
 if(moduleOverride)assert(isAbsolute(moduleOverride),'SF30_PLAYWRIGHT_MODULE must select an absolute existing module.');
 const candidates=moduleOverride?[moduleOverride]:[
  '/workspace/scratch/00697d85ae60/rea-runtime/node_modules/playwright-core/index.mjs',
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES&&join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright/index.js'),
  '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
 ].filter(Boolean);
 let selected,module;
 const failures=[];
 for(const path of [...new Set(candidates)]){if(!await exists(path))continue;try{const loaded=await import(pathToFileURL(path).href);module=loaded.chromium?loaded:loaded.default;if(module?.chromium){selected=path;break;}}catch(e){failures.push({path,message:String(e.message)});}}
 assert(module?.chromium,'No original installed Playwright module is available; no browser was installed. '+JSON.stringify(failures));
 const executableOverride=process.env.SF30_CHROMIUM_EXECUTABLE;
 if(executableOverride)assert(isAbsolute(executableOverride),'SF30_CHROMIUM_EXECUTABLE must select an absolute existing executable.');
 const executables=executableOverride?[executableOverride]:[
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/workspace/scratch/705ebf077387/browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell',
  module.chromium.executablePath(),'/usr/bin/chromium','/usr/bin/chromium-browser'
 ].filter(Boolean);
 let executable;
 for(const path of [...new Set(executables)]){try{await access(path,constants.X_OK);const info=await stat(path);if(info.isFile()){executable=path;break;}}catch{}}
 assert(executable,'No original installed Chromium executable is available; no browser was downloaded.');
 return {module,playwrightModule:selected,chromiumExecutable:executable,nodeExecutable:process.execPath,nodeVersion:process.version};
}
async function browserPending(page,workspaceSha256){
 return page.evaluate(async identity=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-geography-requests',1);r.onupgradeneeded=()=>r.result.createObjectStore('requests',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  let value;
  try{value=await new Promise((resolve,reject)=>{const tx=db.transaction('requests','readonly'),r=tx.objectStore('requests').get(identity+':pending');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  finally{db.close();}
  if(!value)return null;
  const body=value.body,complete={...value};delete complete.body;
  if(body instanceof Blob){const bytes=await body.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');complete.bodyIdentity={bytes:bytes.byteLength,sha256,type:body.type,name:body instanceof File?body.name:null};}
  else if(body!==undefined)complete.bodyIdentity={state:'NOT_A_COMPLETE_BLOB'};
  return complete;
 },workspaceSha256);
}
async function browserCompletedPacket(page,selection){
 return page.evaluate(async selected=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-geography-requests',1);r.onupgradeneeded=()=>r.result.createObjectStore('requests',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  let values;try{values=await new Promise((resolve,reject)=>{const tx=db.transaction('requests','readonly'),r=tx.objectStore('requests').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
  const candidates=values.filter(value=>value.key===selected.workspaceSha256+':history:'+value.localId&&value.workspaceSha256===selected.workspaceSha256&&value.kind==='receive'&&value.bytes===selected.packet.bytes&&value.sha256===selected.packet.sha256&&value.result?.review?.id===selected.review.id&&value.result.review.revision===selected.review.revision);
  if(!candidates.length)return null;
  if(candidates.length!==1)throw new Error('More than one original browser receipt matches this selected packet.');
  const value=candidates[0],body=value.body,complete={...value};delete complete.body;
  if(!(body instanceof Blob))throw new Error('The original completed browser receipt has no complete packet body.');
  const bytes=await body.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  complete.bodyIdentity={bytes:bytes.byteLength,sha256,type:body.type,name:body instanceof File?body.name:null};return complete;
 },selection);
}
function saveDefinition(input){const complete={...input};delete complete.requestId;return complete;}
export async function runGeographyBrowserReceiving(input){
 assert(input&&typeof input==='object'&&!Array.isArray(input),'Use the complete original browser input.');
 for(const key of ['sourceRoot','outputRoot','ownerWorkspace','offlineHtml'])assert(typeof input[key]==='string'&&isAbsolute(input[key]),'Use the original absolute '+key+'.');
 assert(HASH.test(input.source)&&HASH.test(input.review?.id)&&Number.isSafeInteger(input.review.revision)&&input.review.revision>0,'Select the exact original source and saved review revision.');
 for(const key of ['rows','activities','mapped'])assert(Number.isSafeInteger(input.expected?.[key])&&input.expected[key]>=0,'Use actual original '+key+' counts.');
 const connection=new URL(input.consoleUrl);
 assert(['http:','https:'].includes(connection.protocol)&&['127.0.0.1','localhost','[::1]'].includes(connection.hostname)&&connection.hash.length>1&&!connection.username&&!connection.password,'Borrow the parent-owned private local console URL.');
 const sourceRoot=resolve(input.sourceRoot),out=resolve(input.outputRoot),base='/api/iati/geography';
 await mkdir(out,{recursive:true,mode:0o700});await chmod(out,0o700);
 const normalized={schema:SCHEMA,sourceRoot,outputRoot:out,ownerWorkspace:resolve(input.ownerWorkspace),source:input.source,review:input.review,offlineHtml:resolve(input.offlineHtml),expected:input.expected};
 const selectionSha256=digest(bytes(normalized));
 await write(join(out,'selection.json'),{...normalized,selectionSha256},true);
 const resultPath=join(out,'result.json'),workflowPath=join(out,'completed-workflow.json'),progressPath=join(out,'progress.json'),cleanupPath=join(out,'browser-cleanup.json');
 if(await exists(resultPath)){
  const result=await json(resultPath);assert(result.schema===SCHEMA&&result.state==='COMPLETE'&&result.selectionSha256===selectionSha256,'The original browser result belongs to another receiving selection.');
  await verifyFiles(result.files);assert(result.cleanup?.path===cleanupPath,'The original completed browser result has no retained owned cleanup.');
  const closure=await json(cleanupPath),workflow=await fileIdentity(workflowPath);
  assert(closure.state==='CLOSED'&&closure.selectionSha256===selectionSha256&&same(closure.workflow,workflow),'The completed workflow has no matching actual browser shutdown receipt.');
  return result;
 }
 let progress=await exists(progressPath)?await json(progressPath):{schema:SCHEMA,selectionSha256,downloads:{},observations:[],screens:[],phases:[]};
 assert(progress.selectionSha256===selectionSha256,'The original browser continuation selected another input.');
 const outputs=new Map();
 const remember=item=>{outputs.set(item.path,item);return item;};
 for(const item of [...(progress.files||[]),...(progress.observations||[]),...(progress.screens||[])])remember(item);
 for(const value of Object.values(progress.downloads||{}))if(value.file)remember(value.file);
 if(progress.offlineUpdate?.file)remember(progress.offlineUpdate.file);
 const record=async(name,value,immutable=true)=>remember(await write(join(out,name),value,immutable));
 const save=()=>{progress.files=[...outputs.values()];return write(progressPath,progress);};
 await mkdir(join(out,'downloads'),{recursive:true,mode:0o700});await mkdir(join(out,'observations'),{recursive:true,mode:0o700});await mkdir(join(out,'screens'),{recursive:true,mode:0o700});
 // A completed observation may precede its progress-pointer publication. Select
 // only the original atomically published numbered files, preserving all bytes.
 const observed=new Map((progress.observations||[]).map(value=>[value.path,value]));
 let sequence=0;
 for(const name of await readdir(join(out,'observations'))){
  if(!/^[0-9]{6,}\.json$/.test(name))continue;
  sequence=Math.max(sequence,Number(name.slice(0,-5)));
  const path=join(out,'observations',name),value=await json(path);
  assert(typeof value.path==='string'&&value.path.startsWith(base)&&typeof value.method==='string'&&Number.isSafeInteger(value.status),'The original observation is incomplete: '+path);
  const item=await fileIdentity(path),prior=observed.get(path);
  if(prior)assert(same(prior,item),'The retained browser observation changed: '+path);
  observed.set(path,item);remember(item);
  for(const referenced of [value.request?.file,value.request?.selectedOriginalFile])if(referenced?.path){await verifyFiles([referenced]);remember(referenced);}
 }
 progress.observations=[...observed.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const launchOptions=runtime=>({executablePath:runtime.chromiumExecutable,headless:true,acceptDownloads:true,viewport:{width:1360,height:980},args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const cleanupReceipt=async()=>{
  const workflow=await fileIdentity(workflowPath);
  if(await exists(cleanupPath)){const old=await json(cleanupPath);assert(old.state==='CLOSED'&&old.selectionSha256===selectionSha256&&same(old.workflow,workflow),'The original cleanup receipt identifies another workflow.');return fileIdentity(cleanupPath);}
  return write(cleanupPath,{schema:SCHEMA,state:'CLOSED',selectionSha256,workflow,browserProfile:join(out,'browser-profile'),parentOwnsServer:true,closedAt:new Date().toISOString()},true);
 };
 const finalize=async completed=>{
  assert(completed.state==='WORKFLOW_COMPLETE'&&completed.selectionSha256===selectionSha256,'The original complete browser workflow selected another input.');
  await verifyFiles(completed.files);const cleanup=await fileIdentity(cleanupPath),closed=await json(cleanupPath),workflow=await fileIdentity(workflowPath);
  assert(closed.state==='CLOSED'&&closed.selectionSha256===selectionSha256&&same(closed.workflow,workflow),'The original completed workflow still needs owned browser shutdown.');
  const files=new Map(completed.files.map(value=>[value.path,value]));files.set(workflow.path,workflow);files.set(cleanup.path,cleanup);
  const result={...completed,state:'COMPLETE',completedAt:new Date().toISOString(),ownedBrowserClosed:true,cleanup,files:[...files.values()]};
  await write(resultPath,result,true);return result;
 };
 await access(input.ownerWorkspace);await access(input.offlineHtml);
 const sources=[];
 for(const path of ['public/app.js','public/index.html','public/geography.js','public/geography.css','client.mjs','client.d.mts','geography.py','geography_portable.py','geography_html.py','GEOGRAPHY_UI.md','receiving/geography-browser.mjs','receiving/GEOGRAPHY_BROWSER.md'])sources.push({relative:path,...await fileIdentity(join(sourceRoot,PREFIX,path))});
 const sourceSelection={schema:SCHEMA,files:sources},sourceSelectionPath=join(out,'selected-source.json');
 if(await exists(sourceSelectionPath)){
  const original=await json(sourceSelectionPath);
  assert(original.schema===SCHEMA&&Array.isArray(original.files)&&original.files.length===sources.length,'The original complete source selection is incomplete.');
  const previous=new Map(original.files.map(file=>[file.relative,file]));
  const changed=sources.filter(file=>!same(previous.get(file.relative),file));
  if(changed.length){
   // A corrected receiving driver can resume the same product, request, and
   // browser profile. Keep its complete earlier source and every observation.
   assert(changed.every(file=>file.relative==='receiving/geography-browser.mjs'),'A continuation changed application source; use the original application for this case.');
   const before=previous.get('receiving/geography-browser.mjs'),after=changed[0];
   assert(before&&before.path===after.path,'The receiving correction selected another original driver path.');
   const retained=await fileIdentity(join(out,'source-history',before.sha256+'.mjs'));
   assert(retained.bytes===before.bytes&&retained.sha256===before.sha256,'Preserve the complete original receiving driver before applying its correction.');
   remember(retained);remember(await fileIdentity(sourceSelectionPath));
   await record('receiving-source-'+after.sha256+'.json',{schema:SCHEMA,reason:'Continue the original case with a corrected receiving driver.',originalSelection:await fileIdentity(sourceSelectionPath),before,retainedBefore:retained,after,files:sources});
  }else remember(await fileIdentity(sourceSelectionPath));
 }else await record('selected-source.json',sourceSelection);
 if(await exists(workflowPath)){
  const completed=await json(workflowPath);assert(completed.state==='WORKFLOW_COMPLETE'&&completed.selectionSha256===selectionSha256,'A retained browser workflow belongs to another selection.');await verifyFiles(completed.files);
  if(!await exists(cleanupPath)){
   // The exact completed UI work is not replayed. Chromium's original persistent
   // profile ownership must permit a new local handle before it can be closed.
   // An already-live profile is left with its existing owner; no process is killed.
   const runtime=await chooseRuntime(input);
   await record('selected-runtime.json',{playwrightModule:runtime.playwrightModule,chromiumExecutable:runtime.chromiumExecutable,nodeExecutable:runtime.nodeExecutable,nodeVersion:runtime.nodeVersion});
   const owned=await runtime.module.chromium.launchPersistentContext(join(out,'browser-profile'),launchOptions(runtime));
   await owned.close();await cleanupReceipt();
  }
  return finalize(completed);
 }
 const runtime=await chooseRuntime(input);
 await record('selected-runtime.json',{playwrightModule:runtime.playwrightModule,chromiumExecutable:runtime.chromiumExecutable,nodeExecutable:runtime.nodeExecutable,nodeVersion:runtime.nodeVersion});
 const {connectIatiWorkspace}=await import(pathToFileURL(join(sourceRoot,PREFIX,'client.mjs')).href);
 const client=await connectIatiWorkspace({consoleUrl:input.consoleUrl,timeoutMs:120000});
 let context,page,offline,completed,error;
 const errors=[],requestFailures=[],observerErrors=[],tasks=new Set();
 const runTask=fn=>{const task=Promise.resolve().then(fn).catch(e=>observerErrors.push(String(e.stack||e))).finally(()=>tasks.delete(task));tasks.add(task);};
 const drain=async()=>{while(tasks.size)await Promise.allSettled([...tasks]);assert(observerErrors.length===0,'An original browser observation could not be retained: '+observerErrors.join('\n'));};
 const phase=async(name,data)=>{if(!progress.phases.some(p=>p.name===name)){progress.phases.push({name,at:new Date().toISOString(),data});await save();}};
 const shot=async(name,target=page)=>{
  const path=join(out,'screens',name+'.png'),scopePath=join(out,'screens',name+'-capture.json');
  if(await exists(path)){
   const item=await fileIdentity(path),retained=progress.screens.find(x=>x.path===path);
   if(retained)await verifyFiles([retained]);else progress.screens.push(item);
   if(await exists(scopePath))remember(await fileIdentity(scopePath));
   remember(item);await save();return item;
  }
  const viewport=target.viewportSize();
  assert(viewport&&Number.isSafeInteger(viewport.width)&&Number.isSafeInteger(viewport.height)&&viewport.width>0&&viewport.height>0&&viewport.width<=4096&&viewport.height<=4096,'Retain the selected bounded browser viewport.');
  const layout=await target.evaluate(()=>({
   scrollWidth:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0),
   scrollHeight:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0),
   innerWidth:window.innerWidth,innerHeight:window.innerHeight,devicePixelRatio:window.devicePixelRatio
  }));
  let scope;
  if(await exists(scopePath)){
   scope=await json(scopePath);
   assert(scope.schema==='stellar-forge.iati-geography-screenshot.v1'&&scope.selectionSha256===selectionSha256&&scope.name===name&&scope.mode==='viewport'&&same(scope.viewport,viewport)&&scope.documentAtFirstAttempt.devicePixelRatio===layout.devicePixelRatio,'Continue the exact original screenshot scope.');
   remember(await fileIdentity(scopePath));
  }else{
   scope={schema:'stellar-forge.iati-geography-screenshot.v1',selectionSha256,name,mode:'viewport',viewport,documentAtFirstAttempt:layout,fullPagePixelsAtFirstAttempt:layout.scrollWidth*layout.scrollHeight,viewportPixels:viewport.width*viewport.height};
   await record('screens/'+name+'-capture.json',scope,true);
  }
  // Preserve the measured document extent before Chromium allocates an image.
  // The full register is checked through its native/DOM/export contracts; QA
  // images retain the useful viewport, including a long offline report.
  await save();
  const item=await write(path,await target.screenshot({fullPage:false}),true);
  progress.screens.push(item);remember(item);await save();return item;
 };
 const retainDownload=async(download,label,descriptor)=>{
  assert(typeof label==='string'&&label===basename(label)&&!label.includes('\\')&&label!=='.'&&label!=='..','Use the selected complete download filename.');
  const path=join(out,'downloads',label),temporary=path+'.incoming-'+Date.now();
  await download.saveAs(temporary);await chmod(temporary,0o600);assert(await download.failure()===null,'The complete browser download failed.');
  const actual=await fileIdentity(temporary);
  if(descriptor)assert(actual.bytes===descriptor.bytes&&actual.sha256===descriptor.sha256,'The downloaded complete bytes differ from the original native descriptor.');
  if(await exists(path)){const retained=await fileIdentity(path);assert(retained.bytes===actual.bytes&&retained.sha256===actual.sha256,'The original download name already contains another complete file.');await unlink(temporary);}else await rename(temporary,path);
  const item=await fileIdentity(path);outputs.set(path,item);return item;
 };
 try{
  const state=await client.geographyState();
  assert(HASH.test(state.workspaceSha256),'The original workspace has no persistent geography identity.');
  if(progress.workspaceSha256)assert(progress.workspaceSha256===state.workspaceSha256,'The browser operation belongs to another original workspace.');
  else{progress.workspaceSha256=state.workspaceSha256;await save();}
  const original=await client.geographyReview(input.review.id,{revision:input.review.revision});
  assert(original.sources.includes(input.source),'The original review does not include the selected publisher.');
  for(const key of ['rows','activities','mapped'])assert(original.report.counts[key]===input.expected[key],'The selected native '+key+' count differs from the actual source input.');
  await record('original-review.json',original);
  context=await runtime.module.chromium.launchPersistentContext(join(out,'browser-profile'),launchOptions(runtime));
  context.setDefaultTimeout(120000);
  page=context.pages()[0]||await context.newPage();
  page.on('pageerror',e=>errors.push({page:'console',message:String(e.stack||e)}));
  page.on('requestfailed',r=>requestFailures.push({path:new URL(r.url()).pathname,method:r.method(),failure:r.failure()?.errorText}));
  // Keep large original JSON responses in this observer's own bounded CDP buffer.
  // Playwright's inspector cache can evict a complete packet-receive response.
  const network=await context.newCDPSession(page),networkRequests=new Map();
  await network.send('Network.enable',{maxTotalBufferSize:64*1024*1024,maxResourceBufferSize:32*1024*1024,maxPostDataSize:2*1024*1024,enableDurableMessages:true});
  network.on('Network.requestWillBeSent',event=>{
   const url=new URL(event.request.url);
   if(url.origin!==connection.origin||!url.pathname.startsWith(base)||url.pathname.includes('/download/')){networkRequests.delete(event.requestId);return;}
   const requestType=Object.entries(event.request.headers||{}).find(([name])=>name.toLowerCase()==='content-type')?.[1]||'';
   networkRequests.set(event.requestId,{path:url.pathname+url.search,method:event.request.method,requestType,hasPostData:event.request.hasPostData,postData:event.request.postData});
  });
  network.on('Network.responseReceived',event=>{
   const selected=networkRequests.get(event.requestId);if(!selected)return;
   selected.status=event.response.status;selected.json=(event.response.mimeType||'').includes('json');
  });
  network.on('Network.loadingFailed',event=>networkRequests.delete(event.requestId));
  network.on('Network.loadingFinished',event=>{
   const selected=networkRequests.get(event.requestId);networkRequests.delete(event.requestId);
   if(!selected?.json)return;
   const no=++sequence;
   runTask(async()=>{
    try{
     const returned=await network.send('Network.getResponseBody',{requestId:event.requestId});
     const buffer=Buffer.from(returned.body,returned.base64Encoded?'base64':'utf8'),body=JSON.parse(buffer.toString('utf8'));
     let retainedBody=null;
     if(selected.requestType.includes('json')&&(selected.hasPostData||selected.postData!==undefined)){
      const data=selected.postData??(await network.send('Network.getRequestPostData',{requestId:event.requestId})).postData;
      retainedBody=JSON.parse(data);
     }else if(selected.method==='POST'&&selected.requestType.includes('application/zip')){
      const packet=progress.downloads.packet?.file;assert(packet,'The original packet request has no retained complete file.');
      retainedBody={contentType:selected.requestType,selectedOriginalFile:packet};
     }
     const item=await record('observations/'+String(no).padStart(6,'0')+'.json',{path:selected.path,method:selected.method,status:selected.status,request:retainedBody,response:body});
     progress.observations.push(item);
    }catch(error){throw new Error(selected.method+' '+selected.path+': '+String(error.stack||error));}
   });
  });
  const idle=async(allowError=false)=>{
   await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false',null,{timeout:120000});
   if(!allowError)assert(!await page.locator('#status').evaluate(e=>e.classList.contains('error')),'The original interface reported: '+await page.locator('#status').innerText());
   await drain();await save();
  };
  const click=async(selector)=>{await page.locator(selector).click();await idle();};
  const openReview=async(revision)=>{
   await page.locator('[data-view="geography"]').click();await page.locator('#geo-review-select').selectOption(input.review.id);
   await page.locator('#geo-open-revision').fill(String(revision));await click('#geo-open');
   assert((await page.locator('#geo-identity').innerText()).includes('Revision '+revision),'The browser opened another historical review.');
  };
  await page.goto(input.consoleUrl,{waitUntil:'domcontentloaded',timeout:120000});await idle();
  await page.locator('#geo-review-select option[value="'+input.review.id+'"]').waitFor({state:'attached'});
  await page.locator('[data-view="geography"]').click();
  const requestFile=join(out,'browser-save-request.json'),saveIntentFile=join(out,'browser-save-intent.json'),packetIntentFile=join(out,'browser-packet-intent.json');
  let retainedRequest=await exists(requestFile)?await json(requestFile):null;
  let saveIntent=await exists(saveIntentFile)?await json(saveIntentFile):null;
  let packetIntent=await exists(packetIntentFile)?await json(packetIntentFile):null;
  const initialPending=await browserPending(page,state.workspaceSha256);
  if(initialPending&&!retainedRequest){
   assert(initialPending.kind==='save'&&saveIntent?.workspaceSha256===state.workspaceSha256&&initialPending.key===state.workspaceSha256+':pending'&&initialPending.workspaceSha256===state.workspaceSha256&&typeof initialPending.input?.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(initialPending.input.requestId)&&initialPending.localId===initialPending.input.requestId&&same(saveDefinition(initialPending.input),saveIntent.input),'An unrelated original browser request is pending; it has not been dispatched by this receiver.');
   retainedRequest={workspaceSha256:state.workspaceSha256,input:initialPending.input};
   await record('browser-save-request.json',retainedRequest,true);
  }
  const retryOriginalPending=async()=>{
   const pending=await browserPending(page,state.workspaceSha256);
   assert(pending&&pending.key===state.workspaceSha256+':pending'&&pending.workspaceSha256===state.workspaceSha256,'The original pending browser request belongs to another workspace.');
   if(pending.kind==='save'){
    assert(retainedRequest&&pending.localId===retainedRequest.input.requestId&&same(pending.input,retainedRequest.input),'The pending save differs from the complete original retained request.');
   }else if(pending.kind==='receive'){
    assert(packetIntent&&packetIntent.workspaceSha256===state.workspaceSha256&&packetIntent.review.id===input.review.id&&packetIntent.review.revision===input.review.revision+1&&typeof pending.localId==='string'&&pending.localId.length>0,'No exact original packet receiving intent was selected for this pending request.');
    const file=packetIntent.packet;await verifyFiles([file]);
    assert(pending.bytes===file.bytes&&pending.sha256===file.sha256&&pending.fileName===basename(file.path)&&pending.bodyIdentity?.bytes===file.bytes&&pending.bodyIdentity?.sha256===file.sha256,'The pending receiving body is not the complete selected original packet.');
   }else throw new Error('The original pending browser operation kind is not part of this receiving workflow.');
   await record('pending-request-before-continuation-'+Date.now()+'-'+process.pid+'.json',pending,true);
   await click('#geo-retry');
   return pending.kind;
  };
  let selected=original;
  if(retainedRequest){
   assert(retainedRequest.workspaceSha256===state.workspaceSha256&&retainedRequest.input.id===input.review.id&&retainedRequest.input.expectedRevision===input.review.revision,'The retained original browser save names another selection.');
   const lookup=await client.geographyRequest(retainedRequest.input.requestId);
   await record('original-request-lookup-'+Date.now()+'-'+process.pid+'.json',lookup,true);
   assert(lookup.workspaceSha256===state.workspaceSha256,'The original request lookup belongs to another workspace.');
   if(lookup.status==='RECORDED'){assert(same(lookup.request,retainedRequest.input),'The original request ID identifies another body.');selected=lookup.review;}
  }
  if(initialPending){
   const kind=await retryOriginalPending();
   const lookup=await client.geographyRequest(retainedRequest.input.requestId);
   assert(lookup.status==='RECORDED'&&same(lookup.request,retainedRequest.input),'The original pending save did not return its retained native revision.');selected=lookup.review;
   if(kind==='receive'){
    const receivedHistory=await client.geographyHistory(selected.id);
    assert(same(receivedHistory,packetIntent.history),'Continuing the selected complete packet changed the original history.');
    await record('browser-packet-received.json',{packet:packetIntent.packet,history:receivedHistory},true);
    progress.packetReceiveComplete=true;await save();
   }
  }
  await openReview(selected.revision);
  if(!retainedRequest){
  await page.locator('[data-geo-tab="locations"]').click();
  const first=await client.geographyRows({id:selected.id,revision:selected.revision,offset:0,limit:50});
  assert(first.total===input.expected.rows,'The complete register row count changed.');
  assert(await page.locator('#geo-rows tbody tr').count()===Math.max(first.rows.length,1),'The original register page is incomplete.');
  const firstLabel=await page.locator('#geo-rows-page').innerText();
  if(first.nextOffset!==null){await click('#geo-rows-next');assert((await page.locator('#geo-rows-page').innerText())!==firstLabel,'Next records did not select the original next page.');await click('#geo-rows-prev');assert(await page.locator('#geo-rows-page').innerText()===firstLabel,'Previous records did not return the original page start.');}
  let pages=1;
  while(await page.locator('#geo-more-points').isEnabled()){assert(pages++<=1001,'Original coordinate pagination did not end.');await click('#geo-more-points');}
  assert(await page.locator('#geo-map-points circle').count()===input.expected.mapped,'The browser did not load the complete valid coordinate coverage.');
  if(input.expected.mapped){const before=await page.locator('#geo-map').getAttribute('viewBox');await page.locator('#geo-zoom-in').click();assert(await page.locator('#geo-map').getAttribute('viewBox')!==before,'Zoom did not change the loaded coordinate extent.');await page.locator('#geo-map-fit').click();await page.locator('#geo-map-points circle').first().press('Enter');await idle();assert((await page.locator('#geo-finding-selection').innerText()).includes(input.source),'The original map record lost its source identity.');}
  await shot('01-original-location-map');
  }
  if(!retainedRequest){
   const candidate=await client.geographyRows({id:selected.id,revision:selected.revision,source:input.source,decision:'unreviewed',offset:0,limit:1});
   assert(candidate.rows.length===1,'Choose a retained original unreviewed location for the browser receiving finding.');
   const row=candidate.rows[0];
   await page.locator('#geo-filter-source').selectOption(row.source);await page.locator('#geo-filter-activity').fill(row.activity_id);await page.locator('#geo-filter-decision').selectOption('unreviewed');
   await page.locator('#geo-filter-form button[type="submit"]').click();await idle();
   const matching=await client.geographyRows({id:selected.id,revision:selected.revision,source:row.source,activityId:row.activity_id,decision:'unreviewed',offset:0,limit:50});
   const at=matching.rows.findIndex(value=>value.row_id===row.row_id);assert(at>=0,'The selected original finding row is not on its retained activity page.');
   await page.locator('#geo-rows tbody button').nth(at).click();await idle();
   assert((await page.locator('#geo-finding-selection').innerText()).includes(row.row_id),'The record form selected another source row.');
   await page.locator('#geo-finding-decision').selectOption('note');await page.locator('#geo-finding-reviewer').fill('7108 geography receiving');
   await page.locator('#geo-finding-note').fill('Original reported location and complete source fields received through the native Geography interface. This note records receiving; it does not assert independent geographic accuracy.');
   await click('#geo-prepare-finding');
   await page.locator('[data-geo-tab="selection"]').click();await page.locator('#geo-review-status').selectOption('reviewed');await page.locator('#geo-reviewer').fill('7108 geography receiving');
   await page.locator('#geo-review-note').fill('Complete source-bound geography browser receiving, including original request recovery and full handover.');
   const finding={source:row.source,rowId:row.row_id,decision:'note',reviewer:'7108 geography receiving',note:'Original reported location and complete source fields received through the native Geography interface. This note records receiving; it does not assert independent geographic accuracy.'};
   const intendedFindings=[...original.findings,finding].sort((a,b)=>a.source===b.source?a.rowId.localeCompare(b.rowId):a.source.localeCompare(b.source));
   saveIntent={workspaceSha256:state.workspaceSha256,input:{id:original.id,expectedRevision:original.revision,name:original.name.trim(),notes:original.notes,sources:[...original.sources].sort(),selection:{activityIds:original.selection.activityIds,language:original.selection.language.trim()},portfolio:original.portfolio,acquisition:[...original.acquisition].sort((a,b)=>a.source.localeCompare(b.source)),review:{status:'reviewed',reviewer:'7108 geography receiving',note:'Complete source-bound geography browser receiving, including original request recovery and full handover.'},baselineRevision:original.baselineRevision,findings:intendedFindings}};
   await record('browser-save-intent.json',saveIntent,true);await save();
   await page.route('**/api/iati/geography/reviews',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    try{
     const body=route.request().postDataJSON();
     assert(body.id===input.review.id&&body.expectedRevision===input.review.revision&&same(saveDefinition(body),saveIntent.input),'The browser attempted another complete original review selection.');
     retainedRequest={workspaceSha256:state.workspaceSha256,input:body};
     await record('browser-save-request.json',retainedRequest,true);
     // Make one actual native save. Retain its complete return, then withhold only
     // that browser response so the original request lookup receives it on reopen.
     const response=await route.fetch({timeout:120000,maxRetries:0});
     const buffer=await response.body(),returned=JSON.parse(buffer.toString('utf8'));
     await record('browser-save-native-return.json',{status:response.status(),request:body,response:returned},true);
     assert(response.ok(),'The original native geography save returned '+response.status());
     await route.abort('connectionreset');
    }catch(e){observerErrors.push(String(e.stack||e));try{await route.abort('failed');}catch{}}
   });
   await page.locator('#geo-save').click();await idle(true);await page.unroute('**/api/iati/geography/reviews');await drain();
   assert(retainedRequest&&await page.locator('#geo-pending').isVisible(),'The browser did not retain the complete original request after its response was withheld.');
   await phase('native-save-return-withheld',{requestId:retainedRequest.input.requestId,source:row.source,rowId:row.row_id});
   await page.reload({waitUntil:'domcontentloaded'});await idle();
   await page.locator('[data-view="geography"]').click();assert(await page.locator('#geo-pending').isVisible(),'The original browser profile did not retain the pending save across reopen.');
   await retryOriginalPending();
   const lookup=await client.geographyRequest(retainedRequest.input.requestId);
   assert(lookup.status==='RECORDED'&&same(lookup.request,retainedRequest.input),'The native lookup did not return the exact original browser action.');
   selected=lookup.review;assert(selected.revision===input.review.revision+1,'Browser recovery created another revision.');
   await record('browser-save-reconciled.json',lookup,true);
  }else if(selected.revision===input.review.revision){
   // A prior parent ended before a native return. Restore only the complete
   // already-retained original UI request into the same native workspace.
   await page.evaluate(async value=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-geography-requests',1);r.onupgradeneeded=()=>r.result.createObjectStore('requests',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('requests','readwrite'),s=tx.objectStore('requests'),key=value.workspaceSha256+':pending',r=s.get(key);
     r.onsuccess=()=>{
      const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
      if(r.result&&(r.result.kind!=='save'||r.result.workspaceSha256!==value.workspaceSha256||r.result.localId!==value.input.requestId||JSON.stringify(canonical(r.result.input))!==JSON.stringify(canonical(value.input)))){tx.abort();return;}
      s.put(r.result||{key,kind:'save',localId:value.input.requestId,input:value.input,workspaceSha256:value.workspaceSha256,selectedAt:new Date().toISOString()});
     };tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Another complete browser request is retained.'));});
    db.close();
   },retainedRequest);
   await page.reload({waitUntil:'domcontentloaded'});await idle();await page.locator('[data-view="geography"]').click();await retryOriginalPending();
   const lookup=await client.geographyRequest(retainedRequest.input.requestId);assert(lookup.status==='RECORDED'&&same(lookup.request,retainedRequest.input),'The original request did not complete through the original UI continuation.');selected=lookup.review;
   await record('browser-save-reconciled.json',lookup,true);
  }
  for(const key of ['sources','selection','portfolio','acquisition','baselineRevision'])assert(same(selected[key],original[key]),'The browser finding changed the original '+key+'.');
  assert(selected.id===original.id&&selected.revision===original.revision+1,'The browser must create exactly one original finding revision.');
  await record('browser-review.json',selected,true);await phase('original-request-received',{id:selected.id,revision:selected.revision,requestId:retainedRequest.input.requestId});
  await openReview(original.revision);assert(await page.locator('#geo-save').isDisabled(),'The historical revision unexpectedly permits a new save.');
  const originalAgain=await client.geographyReview(original.id,{revision:original.revision});assert(same(originalAgain,original),'Historical receiving changed the original selected revision.');
  await openReview(selected.revision);await page.locator('[data-geo-tab="history"]').click();
  await page.locator('#geo-compare-before').selectOption(String(original.revision));await page.locator('#geo-compare-after').selectOption(String(selected.revision));await click('#geo-compare');
  const comparison=await client.geographyCompare({id:selected.id,beforeRevision:original.revision,afterRevision:selected.revision});
  assert(comparison.counts.added===0&&comparison.counts.removed===0&&comparison.counts.changed===0,'A source-preserving finding changed native location data.');
  assert(comparison.findingChanges.length===1,'The complete receiving comparison must retain one new analyst finding.');
  await record('browser-comparison.json',comparison,true);
  const button=page.getByRole('button',{name:'Read changes',exact:true});if(await button.count()){await button.first().click();await idle();}
  await page.locator('[data-geo-tab="handover"]').click();
  for(const format of ['packet','geojson','csv','json','html']){
   if(progress.downloads[format]){await verifyFiles([progress.downloads[format].file]);assert(progress.downloads[format].descriptor.review===selected.id&&progress.downloads[format].descriptor.revision===selected.revision,'A retained complete export belongs to another review.');continue;}
   const returned=observePromise(page.waitForResponse(response=>new URL(response.url()).pathname===base+'/export'&&response.request().method()==='POST'&&response.request().postDataJSON()?.format===format));
   const downloading=observePromise(page.waitForEvent('download',{timeout:120000}));
   await page.locator('[data-geo-export="'+format+'"]').click();
   const response=await returned,descriptor=await response.json();assert(response.ok(),'The native '+format+' export returned HTTP '+response.status()+': '+String(descriptor.error||'Unknown local export error.'));assert(descriptor.review===selected.id&&descriptor.revision===selected.revision&&descriptor.format===format,'The native export descriptor selected another original review.');
   const download=await downloading,file=await retainDownload(download,format+'-'+descriptor.filename,descriptor);await idle();
   progress.downloads[format]={descriptor,file};await save();
  }
  const beforeReceive=await client.geographyHistory(selected.id);
  const packet=progress.downloads.packet.file;
  if(!packetIntent){packetIntent={workspaceSha256:state.workspaceSha256,review:{id:selected.id,revision:selected.revision},packet,history:beforeReceive};await record('browser-packet-intent.json',packetIntent,true);await save();}
  assert(packetIntent.workspaceSha256===state.workspaceSha256&&same(packetIntent.review,{id:selected.id,revision:selected.revision})&&same(packetIntent.packet,packet)&&same(packetIntent.history,beforeReceive),'The original receiving intent selected another complete packet or revision history.');
  const packetReceivedPath=join(out,'browser-packet-received.json');
  if(!await exists(packetReceivedPath)){
   const originalReceipt=await browserCompletedPacket(page,packetIntent);
   if(originalReceipt){
    assert(originalReceipt.bodyIdentity.bytes===packet.bytes&&originalReceipt.bodyIdentity.sha256===packet.sha256&&originalReceipt.result.packet.bytes===packet.bytes&&originalReceipt.result.packet.sha256===packet.sha256,'The completed original browser receipt does not retain this complete packet.');
    const afterReceive=await client.geographyHistory(selected.id);assert(same(beforeReceive,afterReceive),'The completed original browser receive changed the selected history.');
    const receiptFile=await record('browser-original-received-request.json',originalReceipt,true);
    await record('browser-packet-received.json',{packet,history:afterReceive,originalBrowserReceipt:receiptFile},true);progress.packetReceiveComplete=true;await save();
   }
  }
  if(await exists(packetReceivedPath)){
   const received=await json(packetReceivedPath);assert(same(received.packet,packet)&&same(received.history,beforeReceive),'The completed original packet receipt differs from this selection.');remember(await fileIdentity(packetReceivedPath));progress.packetReceiveComplete=true;
  }else{
   await page.locator('#geo-receive-file').setInputFiles(packet.path);await click('#geo-receive');
   const afterReceive=await client.geographyHistory(selected.id);assert(same(beforeReceive,afterReceive),'Receiving the same complete packet changed the original revision history.');
   await record('browser-packet-received.json',{packet,history:afterReceive},true);progress.packetReceiveComplete=true;
  }
  await save();
  await page.locator('[data-geo-tab="locations"]').click();await shot('02-received-desktop');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="geography"]').click();await shot('03-received-mobile');
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:document.documentElement.scrollWidth}));
  assert(geometry.width<=geometry.viewport+4,'The complete mobile interface has unintended page-level horizontal overflow.');
  await page.reload({waitUntil:'domcontentloaded'});await idle();await openReview(selected.revision);
  assert(!await page.locator('#geo-pending').isVisible(),'The completed original receiving still has a pending action.');
  const reopened=await client.geographyReview(selected.id,{revision:selected.revision});assert(same(reopened,selected),'Same-workspace browser reopen changed the full saved review.');
  await record('browser-reopened.json',reopened,true);
  offline=await context.newPage();const external=[];
  offline.on('pageerror',e=>errors.push({page:'offline',message:String(e.stack||e)}));
  await offline.route(/^https?:\/\//,async route=>{external.push(route.request().url());await route.abort('blockedbyclient');});
  await offline.goto(pathToFileURL(input.offlineHtml).href,{waitUntil:'domcontentloaded',timeout:120000});
  await offline.locator('#workspace').waitFor({state:'visible'});
  const embedded=JSON.parse(await offline.locator('#geography-data').textContent());
  assert(embedded.view.id===original.id&&embedded.view.revision===original.revision&&embedded.rows.length===input.expected.rows,'The complete offline report selected another original review or truncated its register.');
  assert(embedded.view.report.counts.activities===input.expected.activities&&embedded.view.report.counts.mapped===input.expected.mapped,'The offline report lost its original source coverage.');
  await offline.locator('#register-body button').first().click();
  await offline.locator('#record-detail').waitFor({state:'visible'});
  assert((await offline.locator('#selected-identity').innerText()).length>64,'The offline record has no complete original source identity.');
  await offline.waitForFunction(()=>document.querySelector('#register')?.getAttribute('aria-busy')==='false');
  if(input.expected.mapped){
   const before=await offline.locator('#map-zoom').innerText();await offline.locator('#zoom-in').click();
   await offline.waitForFunction(value=>document.querySelector('#map-zoom').textContent!==value,before);
   assert(await offline.locator('#map').evaluate(canvas=>canvas.tagName==='CANVAS'&&canvas.width>0&&canvas.height>0),'The offline coordinate canvas is unavailable.');
   await offline.locator('#fit-view').click();
  }
  await offline.locator('#review-status').selectOption('reviewed');await offline.locator('#review-reviewer').fill('7108 geography receiving');
  await offline.locator('#review-note').fill('Offline source register and complete update request received; publisher coordinates remain unchanged.');
  let offlineUpdate=progress.offlineUpdate;
  const offlineUpdatePath=join(out,'downloads','offline-review-update.json');
  if(!offlineUpdate&&await exists(offlineUpdatePath)){offlineUpdate={file:await fileIdentity(offlineUpdatePath),request:await json(offlineUpdatePath)};progress.offlineUpdate=offlineUpdate;remember(offlineUpdate.file);await save();}
  if(!offlineUpdate){
   const waiting=observePromise(offline.waitForEvent('download',{timeout:30000}));await offline.locator('#download-update').click();
   const file=await retainDownload(await waiting,'offline-review-update.json');const update=await json(file.path);
   assert(typeof update.requestId==='string'&&update.id===original.id&&update.expectedRevision===original.revision,'The offline update lost its original review/expected revision.');
   for(const key of ['sources','selection','portfolio','acquisition','baselineRevision','findings'])assert(same(update[key],original[key]),'The offline review update changed unrelated original '+key+'.');
   progress.offlineUpdate={file,request:update};offlineUpdate=progress.offlineUpdate;await save();
  }else await verifyFiles([offlineUpdate.file]);
  assert(offlineUpdate.request.id===original.id&&offlineUpdate.request.expectedRevision===original.revision&&typeof offlineUpdate.request.requestId==='string','The retained offline request identifies another original review.');
  for(const key of ['sources','selection','portfolio','acquisition','baselineRevision','findings'])assert(same(offlineUpdate.request[key],original[key]),'The retained offline update changed unrelated original '+key+'.');
  remember(offlineUpdate.file);
  await offline.setViewportSize({width:1360,height:980});await shot('04-offline-report',offline);
  await offline.setViewportSize({width:390,height:844});await shot('05-offline-mobile',offline);
  assert(external.length===0,'The complete offline report attempted a network request.');
  await record('offline-original-report.json',{input:await fileIdentity(input.offlineHtml),id:embedded.view.id,revision:embedded.view.revision,rows:embedded.rows.length,activities:embedded.view.report.counts.activities,mapped:embedded.view.report.counts.mapped,offlineUpdate:offlineUpdate.file,externalRequests:external},true);
  await drain();assert(errors.length===0,'The original browser emitted JavaScript errors: '+JSON.stringify(errors));
  await save();
  completed={schema:SCHEMA,state:'WORKFLOW_COMPLETE',selectionSha256,workspaceSha256:state.workspaceSha256,source:input.source,originalReview:input.review,review:{id:selected.id,revision:selected.revision},requestId:retainedRequest.input.requestId,counts:selected.report.counts,downloads:progress.downloads,offlineUpdate:offlineUpdate.file,errors,requestFailures,observations:progress.observations,screens:progress.screens,files:[...outputs.values()],parentOwnsServer:true};
  await write(workflowPath,completed,true);
 }catch(e){error=e;try{await record('continuation-needed-'+Date.now()+'-'+process.pid+'.json',{schema:SCHEMA,state:'NEEDS_CONTINUATION',selectionSha256,error:String(e.stack||e),errors,requestFailures,at:new Date().toISOString()},false);await save();}catch{}}
 finally{
  const stops=await Promise.allSettled([context?.close(),client.dispose()]);
  const rejected=stops.filter(v=>v.status==='rejected').map(v=>String(v.reason));
  if(rejected.length){error??=new Error('Original owned browser/client cleanup needs continuation: '+rejected.join('\n'));try{await record('cleanup-needed-'+Date.now()+'-'+process.pid+'.json',{errors:rejected,at:new Date().toISOString()},false);}catch{}}
  else if(context&&await exists(workflowPath)){
   try{const candidate=await json(workflowPath);assert(candidate.state==='WORKFLOW_COMPLETE'&&candidate.selectionSha256===selectionSha256,'The original workflow selected another input.');await cleanupReceipt();}
   catch(e){error??=e;}
  }
 }
 if(error)throw error;
 assert(completed,'The whole original browser receiving did not produce a completed workflow.');
 return finalize(completed);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const path=process.argv[2];
 if(!path||!isAbsolute(path)){process.stderr.write('Use one original private absolute browser-input.json path.\n');process.exitCode=2;}
 else{
  const input=await json(path);
  runGeographyBrowserReceiving(input).then(result=>process.stdout.write(JSON.stringify({schema:SCHEMA,state:result.state,result:join(resolve(input.outputRoot),'result.json'),review:result.review,files:result.files.length})+'\n')).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
 }
}
