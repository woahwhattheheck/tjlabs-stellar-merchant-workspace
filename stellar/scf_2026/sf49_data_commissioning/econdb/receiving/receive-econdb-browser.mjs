// Operate the exact outgoing offline UI and every generated attachment.
import {readFile,writeFile,mkdir,readdir,lstat,copyFile,open,rename,link,unlink,readlink,chmod} from 'node:fs/promises';
import {resolve,join,dirname,extname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const need=(x,m)=>{if(!x)throw Error(m)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
async function exists(p){try{await lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function write(p,body){
 await mkdir(dirname(p),{recursive:true,mode:0o700});const bytes=Buffer.from(body),tmp=p+'.writing-'+randomUUID();
 const fd=await open(tmp,'wx',0o600);
 try{
  try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
  try{await link(tmp,p)}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(p)).equals(bytes),'Existing retained browser member differs: '+p)}
  const parent=await open(dirname(p),'r');try{await parent.sync()}finally{await parent.close()}
 }finally{await unlink(tmp).catch(error=>{if(error.code!=='ENOENT')throw error})}
}
async function walk(root){const out=[];for(const n of (await readdir(root)).sort()){const p=join(root,n),s=await lstat(p);need(!s.isSymbolicLink(),'Unexpected output symlink');if(s.isDirectory())out.push(...await walk(p));else if(s.isFile())out.push(p);}return out}
const CHROMIUM_OWNER_PYTHON="import json,os,pathlib,sys,tempfile\npath=pathlib.Path(os.environ[\"ECONDB_BROWSER_RECORD\"])\ntry: os.setsid()\nexcept PermissionError:\n if os.getpgrp()!=os.getpid(): raise\nproc_pid=int(os.readlink(\"/proc/self\"))\nraw=pathlib.Path(\"/proc/self/stat\").read_text()\nfields=raw[raw.rfind(\")\")+2:].split()\nif int(raw.split(\"(\",1)[0].strip())!=proc_pid or int(fields[2])!=proc_pid or int(fields[3])!=proc_pid: raise RuntimeError(\"Browser did not enter its own private process group\")\nrecord={\"operation\":os.environ[\"ECONDB_BROWSER_OPERATION\"],\"launchId\":os.environ[\"ECONDB_BROWSER_LAUNCH\"],\"sourceSha256\":os.environ[\"ECONDB_BROWSER_SOURCE\"],\"procPid\":proc_pid,\"procPgid\":int(fields[2]),\"procSession\":int(fields[3]),\"namespacePid\":os.getpid(),\"namespacePgid\":os.getpgrp(),\"bootId\":pathlib.Path(\"/proc/sys/kernel/random/boot_id\").read_text().strip(),\"pidNamespace\":os.readlink(\"/proc/self/ns/pid\"),\"startTicks\":fields[19]}\nfd,name=tempfile.mkstemp(prefix=\".chromium-process-\",dir=path.parent)\ntry:\n with os.fdopen(fd,\"w\",encoding=\"utf8\") as f:\n  f.write(json.dumps(record,sort_keys=True)+\"\\n\");f.flush();os.fsync(f.fileno())\n os.link(name,path)\n d=os.open(path.parent,os.O_RDONLY)\n try: os.fsync(d)\n finally: os.close(d)\nfinally:\n os.unlink(name)\nos.execv(os.environ[\"ECONDB_BROWSER_EXECUTABLE\"],[os.environ[\"ECONDB_BROWSER_EXECUTABLE\"],*sys.argv[1:]])\n";
export async function receiveBrowser({work,playwrightPath,chromiumPath,projectBrowserHook=null}){
 const W=resolve(work),PRODUCT=join(W,'checkout/stellar/scf_2026/sf49_data_commissioning/econdb');
 const final=join(W,'browser-result.json');
 if(await exists(final)){const old=JSON.parse(await readFile(final,'utf8'));need(old.state==='CAPTURED_REQUIRES_PIXEL_REVIEW'&&old.chromium_closed===true,'Unknown completed browser state');for(const row of old.files)await retainedFile(row);return old}
 const attempt=join(W,'browser','attempt-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
 await mkdir(attempt,{recursive:true,mode:0o700});
 const result={operation:'ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013',started_at:new Date().toISOString(),state:'RUNNING',attempt:relative(W,attempt),views:[],opened:[],downloads:[],controls:[],errors:[],chromium_closed:false,pixel_review:{state:'REQUIRED',instruction:'The producing operator must open and LOOK at these actual images and use every outgoing attachment before claiming readiness. Captured pixels and DOM observations are not a visual review.'}};
 let browser,context,page,viewNo=0;
 const playwright=await import(pathToFileURL(resolve(playwrightPath)));const chromium=playwright.chromium??playwright.default?.chromium;need(chromium,'Explicit Playwright module does not export Chromium');
 async function event(kind,detail){await import('node:fs/promises').then(fs=>fs.appendFile(join(attempt,'events.jsonl'),json({at:new Date().toISOString(),kind,...detail}),{mode:0o600}));}

 // Lifecycle adapted from the original MPC donor 6eedea0e0804dd88eca16dbf6764d64087cc3816.
 // Only this launch's exact private process group may be settled; another owner is never signalled.
 let launchPending=null,shutdownPromise=null,shutdownReason=null,launchDispatched=false;
 const launchId=randomUUID(),recordPath=join(attempt,'chromium-process.json');
 const lifecycle={id:launchId,state:'PREPARING',process_record:relative(W,recordPath)};
 result.browser_lifecycle=lifecycle;
 const assertRunning=()=>{if(shutdownReason)throw shutdownReason};
 async function maybe(path){try{return await readFile(path)}catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error}}
 async function retainedFile(row){
  need(row&&typeof row.path==='string'&&row.path&&!row.path.startsWith('/')&&!row.path.includes('\\')&&row.path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Unsafe retained browser member');
  need(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&/^[a-f0-9]{64}$/.test(row.sha256),'Invalid retained browser member identity');
  let target=W;
  const parts=row.path.split('/');
  for(let i=0;i<parts.length;i++){target=join(target,parts[i]);const info=await lstat(target);need(!info.isSymbolicLink()&&(i===parts.length-1?info.isFile():info.isDirectory()),'Retained browser member crosses nonregular path: '+row.path)}
  const body=await readFile(target);need(body.length===row.bytes&&sha(body)===row.sha256,'Retained browser output changed: '+row.path);return row;
 }
 let hostIdentity=null,receiverSha=null;
 async function groupMembers(record){
  need(record.operation===result.operation&&record.launchId===launchId&&record.sourceSha256===receiverSha,'Browser process receipt differs from this original launch');
  need(record.bootId===hostIdentity.bootId&&record.pidNamespace===hostIdentity.pidNamespace,'Browser host or PID namespace changed');
  need(Number.isInteger(record.procPid)&&record.procPid>1&&record.procPgid===record.procPid&&record.procSession===record.procPid&&Number.isInteger(record.namespacePgid)&&record.namespacePgid===record.namespacePid&&record.namespacePid>1&&/^[0-9]+$/.test(record.startTicks),'Incomplete private browser process group identity');
  const leader=await maybe('/proc/'+record.procPid+'/stat');
  if(leader){const f=leader.toString().slice(leader.toString().lastIndexOf(')')+2).trim().split(/\s+/);need(f[19]===record.startTicks,'Original browser PID was reused; retain for owner reconciliation')}
  const members=[];
  for(const name of await readdir('/proc')){
   if(!/^[0-9]+$/.test(name))continue;
   const path='/proc/'+name,body=await maybe(path+'/stat');if(!body)continue;
   const raw=body.toString(),f=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
   if(Number(f[2])!==record.procPgid||f[0]==='Z')continue;
   let ns;try{ns=await readlink(path+'/ns/pid')}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error}
   need(ns===record.pidNamespace&&Number(f[3])===record.procSession&&BigInt(f[19])>=BigInt(record.startTicks),'Private browser group contains an unbound process; retain for owner reconciliation');
   const again=await maybe(path+'/stat');if(!again)continue;const f2=again.toString().slice(again.toString().lastIndexOf(')')+2).trim().split(/\s+/);
   if(f2[19]!==f[19]||Number(f2[2])!==record.procPgid||f2[0]==='Z')continue;
   members.push({procPid:Number(name),startTicks:f[19]});
  }
  return members;
 }
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function closeOwnedGroup(){
  if(!launchDispatched){lifecycle.not_dispatched=true;return}
  const raw=await maybe(recordPath);need(raw,'Dispatched browser has no complete process receipt; retain for original owner reconciliation');
  const record=JSON.parse(raw);let members=await groupMembers(record);
  for(const signal of ['SIGTERM','SIGKILL']){
   if(!members.length)break;
   members=await groupMembers(record);if(!members.length)break;
   try{process.kill(-record.namespacePgid,signal)}catch(error){if(error.code!=='ESRCH')throw error}
   await event('OWNED_BROWSER_GROUP_SIGNAL',{signal,launch_id:launchId,members});
   for(let i=0;i<100;i++){members=await groupMembers(record);if(!members.length)break;await pause(50)}
  }
  need(!(await groupMembers(record)).length,'Original private Chromium group remains active');
 }
 function shutdown(reason=null){
  if(reason&&!shutdownReason)shutdownReason=reason;
  if(shutdownPromise)return shutdownPromise;
  shutdownPromise=(async()=>{
   if(launchPending)try{await launchPending}catch{}
   lifecycle.state='CLOSING';
   const closing=browser?browser.close().then(()=>({closed:true}),error=>({error})):Promise.resolve({closed:true});
   await Promise.race([closing,pause(2000)]);
   try{
    await closeOwnedGroup();
    const closed=await Promise.race([closing,pause(1000).then(()=>({error:Error('Chromium group closed but browser API close did not return')}))]);
    if(closed.error)throw closed.error;
    context=null;browser=null;result.chromium_closed=true;lifecycle.state='CLOSED';
    lifecycle.closed_at=new Date().toISOString();await event('OWNED_BROWSER_CLOSED',{lifecycle});
   }catch(error){lifecycle.state='UNRESOLVED';result.chromium_closed=false;result.errors.push({type:'browser-close',message:error.message});throw error}
  })();return shutdownPromise;
 }
 function interrupted(signal){
  const error=Error('Original Econdb browser receiving interrupted by '+signal);
  process.exitCode=signal==='SIGINT'?130:143;
  void shutdown(error).catch(error=>console.error(error.stack));
 }
 const onTerm=()=>interrupted('SIGTERM'),onInt=()=>interrupted('SIGINT'),onHup=()=>interrupted('SIGHUP');
 process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);process.on('SIGHUP',onHup);
 async function launchOwned(){
  assertRunning();
  // Publish the pending owner before the first await: a signal during preparation
  // must wait for this same branch and must not mistake it for a dispatched process.
  launchPending=Promise.resolve().then(async()=>{
   receiverSha=sha(await readFile(fileURLToPath(import.meta.url)));
   hostIdentity={bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),pidNamespace:await readlink('/proc/self/ns/pid')};
   const python=process.env.ECONDB_RECEIVING_PYTHON;need(python&&python.startsWith('/')&&!/[\s\0]/.test(python),'Original Python executable path required for owned Chromium launcher');
   const wrapper=join(attempt,'chromium-owner.py');
   await write(wrapper,'#!'+python+'\n'+CHROMIUM_OWNER_PYTHON);await chmod(wrapper,0o700);
   await event('BROWSER_PREPARING',{launch_id:launchId,receiver_sha256:receiverSha});
   if(shutdownReason){lifecycle.not_dispatched=true;throw shutdownReason}
   lifecycle.state='STARTING';launchDispatched=true;
   browser=await chromium.launch({executablePath:wrapper,headless:true,timeout:15000,
    env:{...process.env,ECONDB_BROWSER_EXECUTABLE:resolve(chromiumPath),ECONDB_BROWSER_RECORD:recordPath,ECONDB_BROWSER_OPERATION:result.operation,ECONDB_BROWSER_LAUNCH:launchId,ECONDB_BROWSER_SOURCE:receiverSha},
    args:process.getuid?.()===0?['--no-sandbox']:[]});
   need(await maybe(recordPath),'Owned Chromium did not retain its process identity');
   lifecycle.state='RUNNING';await event('BROWSER_RUNNING',{launch_id:launchId});return browser;
  });
  try{await launchPending}finally{launchPending=null}
  assertRunning();
 }

 async function capture(label,p=page,fullPage=true){
  assertRunning();
  const name=String(++viewNo).padStart(3,'0')+'-'+label.replace(/[^a-z0-9_-]/gi,'-')+'.png',path=join(attempt,'views',name);
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  await p.screenshot({path,fullPage});
  const layout=await p.evaluate(()=>({title:document.title,width:innerWidth,height:innerHeight,document_width:document.documentElement.scrollWidth,document_height:document.documentElement.scrollHeight,text:document.body.innerText.slice(0,4000)}));
  const b=await readFile(path),row={path:relative(W,path),bytes:b.length,sha256:sha(b),label,url:p.url(),...layout,viewed_by_operator:false};
  result.views.push(row);await event('RENDER_CAPTURED',row);return row;
 }
 async function exactOpen(path,label,{narrow=false,captureImage=true}={}){
  const bytes=await readFile(path),extension=extname(path).toLowerCase();let reader=path,mode='browser original HTML';
  if(extension!=='.html'){
   // Chromium downloads CSV; a byte-identical .txt copy opens the exact UTF-8 text.
   // This is a real plain-text reader, not a claimed spreadsheet recalculation.
   new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   reader=join(attempt,'readers',sha(Buffer.from(path)).slice(0,12)+'-'+path.split('/').at(-1)+'.txt');
   if(!await exists(reader))await write(reader,bytes);
   mode=extension==='.csv'?'browser exact-byte CSV text; original CSV also retained':extension==='.json'?'browser exact-byte JSON text':'browser exact-byte source/document text';
   if(extension==='.json')JSON.parse(bytes.toString('utf8'));
  }
  const p=await context.newPage();try{
   await p.setViewportSize(narrow?{width:390,height:844}:{width:1440,height:1000});
   await p.goto(pathToFileURL(reader).href,{waitUntil:'load'});
   if(extension!=='.html')await p.addStyleTag({content:'pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}body{font:14px/1.5 monospace;margin:20px}'});
   const row={path:relative(W,path),bytes:bytes.length,sha256:sha(bytes),reader:relative(W,reader),mode,label};
   result.opened.push(row);await event('ATTACHMENT_OPENED',row);if(captureImage)await capture(label,p,extension==='.html');
  }finally{await p.close()}
 }
 async function download(id,label){
  const pending=page.waitForEvent('download');await page.locator('#'+id).click();const d=await pending;
  const path=join(attempt,'downloads',label+'-'+d.suggestedFilename());await mkdir(dirname(path),{recursive:true,mode:0o700});need(!await exists(path),'Existing download would be overwritten');await d.saveAs(path);
  need(await d.failure()===null,'Browser download failed');const b=await readFile(path);
  result.downloads.push({control:id,path:relative(W,path),bytes:b.length,sha256:sha(b)});await exactOpen(path,label+'-download');
  return path;
 }
 async function click(id){await page.locator('#'+id).click();result.controls.push(id);}
 async function messageContains(value){await page.waitForFunction(v=>document.getElementById('message').textContent.includes(v),value);}
 async function loadPair(raw,descriptor){
  await page.locator('#raw-file').setInputFiles(raw);await page.locator('#descriptor-file').setInputFiles(descriptor);
  await click('load-current');await messageContains('Review updated');
 }
 async function window(from,until,compare=false){
  await page.locator('#from').fill(from);await page.locator('#until').fill(until);
  await page.locator('#compare-toggle').setChecked(compare);await click('apply');
 }
 try{
  await launchOwned();
  context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  context.on('page',p=>p.on('pageerror',e=>result.errors.push({type:'pageerror',url:p.url(),message:e.message})));
  page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(pathToFileURL(join(PRODUCT,'maritime-workbench.html')).href,{waitUntil:'load'});
  need(await page.locator('#source-summary').innerText().then(x=>x.includes('No source edition')),'Initial workbench is not empty');
  await capture('empty-desktop');await page.setViewportSize({width:390,height:844});await capture('empty-narrow');await page.setViewportSize({width:1440,height:1000});
  await click('capacity-example');await messageContains('Review updated');await capture('capacity-example-monthly-comparison');
  const expectedDeltas=['72041','33971','19984','11605','-13683','-12352'];
  const comparison=await page.locator('#comparison').innerText();need(expectedDeltas.every(x=>comparison.includes(x)),'Original monthly changes are not visible');
  const raw=join(W,'editions/issuer-doc-capacity-by-operator/response.json'),descriptor=join(W,'editions/issuer-doc-capacity-by-operator/descriptor.json');
  await loadPair(raw,descriptor);await capture('capacity-original-file-pair');
  await window('2022-01-01','2022-04-01',false);await messageContains('Review updated');
  need((await page.locator('#summary').innerText()).includes('2022-01-01'),'Absent January source label not displayed');await capture('missing-january');
  await window('2021-01-01','2021-02-01',false);await messageContains('contains no source observations');await capture('empty-selected-period');
  await window('2022-04-01','2022-02-01',false);need((await page.locator('#message').getAttribute('class')).includes('error'),'Invalid range did not show error');await capture('invalid-range');
  await window('2022-02-01','2022-04-01',true);await messageContains('Review updated');
  // An actual asynchronous File.text load is superseded synchronously by an actual example control.
  // No source rows, file API, engine, timing function or response is mocked.
  await page.locator('#raw-file').setInputFiles(raw);await page.locator('#descriptor-file').setInputFiles(descriptor);
  const loading=await page.evaluate(()=>{document.getElementById('load-current').click();const text=document.getElementById('message').textContent;document.getElementById('traffic-example').click();return text;});
  need(loading.includes('Reading the selected local source'),'Real file-read loading state was not entered');await messageContains('Review updated');
  await page.waitForFunction(()=>document.getElementById('load-current').disabled===false);
  need((await page.locator('#source-summary').innerText()).includes('issuer-doc-container-traffic'),'Superseded source replaced current example');
  result.controls.push('load-current → traffic-example during original asynchronous file read');await capture('superseded-file-read-keeps-traffic');
  // Mismatched real source/descriptor pair is rejected without invented corrupt input.
  await page.locator('#raw-file').setInputFiles(raw);await page.locator('#descriptor-file').setInputFiles(join(W,'editions/issuer-doc-container-traffic/descriptor.json'));
  await click('load-current');await page.waitForFunction(()=>document.getElementById('message').classList.contains('error'));await capture('mismatched-original-pair');
  await loadPair(join(W,'editions/issuer-doc-container-traffic/response.json'),join(W,'editions/issuer-doc-container-traffic/descriptor.json'));
  await window('2022-02-01','2022-04-01');await messageContains('Review updated');
  need((await page.locator('#observations').innerText()).includes('null'),'Original null status disappeared');
  need((await page.locator('#source-summary').innerText()).includes('Undeclared'),'Undeclared frequency is no longer explicit');
  await capture('traffic-null-and-undeclared-frequency');
  for(const id of ['source-download','csv-download','json-download','report-download','workspace-download'])await download(id,'traffic-'+id);
  await page.setViewportSize({width:390,height:844});await capture('traffic-narrow');await page.setViewportSize({width:1440,height:1000});
  await loadPair(raw,descriptor);await window('2022-02-01','2022-04-01',true);await messageContains('Review updated');
  // A pending control edit must not replace the applied selection in a saved workspace.
  await page.locator('#from').fill('2022-01-01');
  const saved=await download('workspace-download','capacity-applied-workspace'),state=JSON.parse(await readFile(saved,'utf8'));
  need(state.selection.from==='2022-02-01'&&state.selection.until==='2022-04-01','Workspace saved an unapplied control edit');
  await page.locator('#workspace-file').setInputFiles(saved);await click('restore');await messageContains('Review updated');
  need(await page.locator('#from').inputValue()==='2022-02-01','Applied selection was not restored');await capture('saved-applied-selection-reopened');
  for(const id of ['source-download','csv-download','json-download','report-download'])await download(id,'capacity-'+id);
  need(await page.locator('#previous-page').isDisabled()&&await page.locator('#next-page').isDisabled(),'Original 12-cell source unexpectedly paginates');
  result.controls.push('Original 12/3-cell pagination: one full page; Previous/Next disabled. No artificial 100-row source created.');
  await page.setViewportSize({width:390,height:844});await capture('capacity-narrow');
  // Cold independent context, exact portable source and original saved workspace.
  await page.close();await context.close();context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  context.on('page',p=>p.on('pageerror',e=>result.errors.push({type:'pageerror',url:p.url(),message:e.message})));
  page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(pathToFileURL(join(W,'project-independent/source/maritime-workbench.html')).href,{waitUntil:'load'});
  await page.locator('#workspace-file').setInputFiles(saved);await click('restore');await messageContains('Review updated');await capture('independent-workspace-reopen');
  await window('2022-03-01','2022-04-01',false);await messageContains('Review updated');
  const continued=await download('workspace-download','independent-march-workspace');
  for(const id of ['csv-download','json-download','report-download','source-download'])await download(id,'independent-march-'+id);
  await page.reload();await page.locator('#workspace-file').setInputFiles(continued);await click('restore');await messageContains('Review updated');
  need(await page.locator('#from').inputValue()==='2022-03-01','Continued portable workspace selection changed');await capture('independent-march-cold-reopen');
  for(const name of ['capacity-review','traffic-review','project-delivery','project-independent']){
   const report=join(W,name,'report.html');await exactOpen(report,name+'-desktop');await exactOpen(report,name+'-narrow',{narrow:true});
  }
  // Follow actual project links; preserve each target, then open all archive members as exact text/HTML.
  for(const name of ['project-delivery','project-independent']){
   const root=join(W,name),report=join(root,'report.html');const p=await context.newPage();await p.goto(pathToFileURL(report).href);
   const links=await p.locator('a[href]').evaluateAll(as=>as.map(a=>({href:a.getAttribute('href'),text:a.textContent})));
   for(const item of links){
    if(item.href.startsWith('#')){await p.locator('a[href="'+item.href+'"]').first().click();continue}
    const url=new URL(item.href,pathToFileURL(report));need(url.protocol==='file:','Unexpected external project link');const target=fileURLToPath(url);need(target.startsWith(root+'/'),'Project link escapes delivery');
    const s=await lstat(target);need(s.isFile()&&!s.isSymbolicLink(),'Broken project link: '+item.href);
    result.controls.push(name+': '+item.text+' → '+item.href);
    await exactOpen(target,name+'-linked-'+item.href.replaceAll('/','-'));
   }await p.close();
  }
  const seen=new Set(result.opened.map(x=>x.path));
  for(const name of ['editions','capacity-review','traffic-review','publications','typed-pages','project-delivery','project-independent']){
   for(const path of await walk(join(W,name))){const rel=relative(W,path);if(seen.has(rel))continue;
    await exactOpen(path,'member-'+rel.replaceAll('/','-'),{captureImage:false});seen.add(rel);
   }
  }
  if(projectBrowserHook){
   const hook=await import(pathToFileURL(resolve(projectBrowserHook)));
   need(typeof hook.receiveProjectBrowser==='function','Application project hook must export receiveProjectBrowser');
   result.project_browser=await hook.receiveProjectBrowser({work:W,product:PRODUCT,browser,context,page,capture,exactOpen,download,result});
  }else result.project_browser={state:'UNSELECTED',scope:'Original native project and reports received; an unstarted revised project-editor source can supply its application-owned hook.'};
  assertRunning();need(result.errors.length===0,'Browser page errors are retained for repair');
  result.state='CAPTURED_REQUIRES_PIXEL_REVIEW';
 }catch(error){result.state='FAILED';result.failure={message:error.message,stack:error.stack};if(page&&!page.isClosed())try{await capture('failure')}catch{};throw error}
 finally{
  try{await shutdown()}catch(error){result.state='FAILED';result.failure??={message:error.message,stack:error.stack}}
  if(shutdownReason){result.state='INTERRUPTED';result.failure={message:shutdownReason.message,stack:shutdownReason.stack}}
  process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);process.removeListener('SIGHUP',onHup);
  result.completed_at=new Date().toISOString();result.files=[];
  for(const p of await walk(attempt)){const b=await readFile(p);result.files.push({path:relative(W,p),bytes:b.length,sha256:sha(b)})}
  const retainedPaths=new Map(result.files.map(row=>[row.path,row]));
  if(result.project_browser?.files){
   need(Array.isArray(result.project_browser.files),'Project browser receipt files must be an array');
   for(const row of result.project_browser.files){await retainedFile(row);const prior=retainedPaths.get(row.path);need(!prior||(prior.bytes===row.bytes&&prior.sha256===row.sha256),'Conflicting project browser member identity');retainedPaths.set(row.path,{path:row.path,bytes:row.bytes,sha256:row.sha256})}
  }
  result.files=[...retainedPaths.values()].sort((a,b)=>a.path.localeCompare(b.path));
  await write(join(attempt,'result.json'),json(result));
  if(result.state==='CAPTURED_REQUIRES_PIXEL_REVIEW'&&result.chromium_closed){await write(final,json(result));}
  console.log(json({phase:'BROWSER_CLOSED',state:result.state,chromium_closed:result.chromium_closed,views:result.views.length,attempt:result.attempt}));
 }
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 receiveBrowser({work:process.argv[2],playwrightPath:process.argv[3],chromiumPath:process.argv[4],projectBrowserHook:process.argv[5]??null}).catch(error=>{console.error(error.stack);process.exitCode=1});
