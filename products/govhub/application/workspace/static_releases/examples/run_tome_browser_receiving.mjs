#!/usr/bin/env node
/** Receive the completed native Tome operation through its original GovHub UI. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const SCHEMA='govhub.tome-complete-browser-receiving.v1';
const reads=new Set(['static.list','static.editions.get','static.plans.get','static.targets.get','static.targets.inspect','static.exports.get','operations.get']);
const ownFile=fileURLToPath(import.meta.url);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');
const required=(condition,message)=>{if(!condition)throw Error(message);};
const absolute=value=>{required(typeof value==='string'&&path.isAbsolute(value),'Select actual absolute source and operating paths.');return path.resolve(value);};
const json=async name=>JSON.parse(await fs.readFile(name,'utf8'));
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function identity(name){
 const info=await fs.lstat(name);required(info.isFile()&&!info.isSymbolicLink(),'Use the retained ordinary file: '+name);
 const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(name)){bytes+=chunk.length;h.update(chunk);}
 required(bytes===info.size,'The selected file changed while it was read.');
 return {path:name,bytes,sha256:h.digest('hex')};
}
async function writeJson(name,value){
 await fs.mkdir(path.dirname(name),{recursive:true,mode:0o700});
 const temp=name+'.tmp-'+process.pid;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
 await fs.rename(temp,name);
}
async function readIfPresent(name){try{return await json(name);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function selectedInput(completed,planIds){
 required(completed?.schema==='tjl.govhub-tome-native-journey.v1'&&completed.status==='COMPLETE','Select the complete original native Tome receiving result.');
 required(Array.isArray(completed.edition_ids)&&completed.edition_ids.length===2&&new Set(completed.edition_ids).size===2,'Retain both original native Tome edition IDs.');
 required(completed.selected_release?.edition_id===completed.edition_ids[0],'The completed native predecessor selection differs from edition A.');
 required(completed.target_id&&completed.export?.id&&completed.export?.file?.id,'Retain the original target and complete handover identities.');
 required(Array.isArray(completed.published_release_ids)&&Array.isArray(completed.reopened_editions)&&completed.reopened_editions.length===2,'Retain the complete original release and received-edition identities.');
 required(Array.isArray(planIds)&&planIds.length===2&&new Set(planIds).size===2,'Select the original retained A/B comparison IDs.');
 return {source_commit:completed.application_source_commit,source_manifest_sha256:completed.application_source_sha256,
  target_id:completed.target_id,edition_ids:completed.edition_ids,plan_ids:planIds,
  published_release_ids:completed.published_release_ids,selected_release:completed.selected_release,
  export:completed.export,handover:{bytes:completed.handover.bytes,sha256:completed.handover.sha256}};
}

/** Use an already-equipped context; this function owns only its page. */
export async function inspectTomeBrowser(options){
 const {context,credentials,completed,planIds,visual=true}=options;
 const base=new URL(options.baseUrl);required(['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&base.protocol==='http:','Use the original local GovHub server URL.');
 const output=absolute(options.outputDirectory),label=options.label||'original';
 required(/^[a-z0-9_-]{1,40}$/.test(label),'Choose a short local receiving label.');
 required(credentials?.name&&credentials?.password&&context?.newPage,'Supply the original private operating account and existing browser context.');
 const selected=selectedInput(completed,planIds),inputSha=digest(selected),resultPath=path.join(output,'tome-browser-'+label+'.json');
 await fs.mkdir(output,{recursive:true,mode:0o700});
 const existing=await readIfPresent(resultPath);
 if(existing)required(existing.input_sha256===inputSha,'The existing browser attempt belongs to another original operation.');
 if(existing?.status==='COMPLETE'){
  required(existing.input_sha256===inputSha,'The saved browser result belongs to another original operation.');
  for(const item of [...existing.downloads,...existing.images]){
   const actual=await identity(path.join(output,item.relative_path));
   required(actual.bytes===item.bytes&&actual.sha256===item.sha256,'Restore the exact previously received browser artifact.');
  }
  return existing;
 }
 const result={schema:SCHEMA,status:'RUNNING',label,input_sha256:inputSha,selected,started_at:new Date().toISOString(),
  views:[],editions:[],comparisons:[],operations:[],downloads:[],images:[],page_errors:[],request_failures:[],http_errors:[]};
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>result.page_errors.push(e.message));
 page.on('requestfailed',req=>{const error=req.failure()?.errorText||'';if(!error.includes('ERR_ABORTED'))result.request_failures.push({path:new URL(req.url()).pathname,error});});
 page.on('response',response=>{if(response.url().startsWith(base.origin)&&response.status()>=400)result.http_errors.push({path:new URL(response.url()).pathname,status:response.status()});});
 async function domain(action,payload={}){
  required(reads.has(action),'This receiving phase opens the existing original operation.');
  return page.evaluate(async({action,payload})=>{
   const response=await fetch('/api/govhub/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const value=await response.json();
   if(!response.ok)throw Error(value.error||value.message||('Original '+action+' returned '+response.status));
   return value;
  },{action,payload});
 }
 async function observe(view,params={},title=''){
  const hash='#'+view+(Object.keys(params).length?'?'+new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)]))).toString():'');
  await page.goto(new URL(hash,base).href,{waitUntil:'networkidle'});
  await page.waitForFunction(({hash,title})=>{
   const main=document.querySelector('#main'),heading=main?.querySelector('h1');
   return location.hash===hash&&main?.getAttribute('aria-busy')==='false'&&heading&&(!title||heading.textContent.trim()===title);
  },{hash,title});
  const visible=await page.evaluate(()=>{
   const main=document.querySelector('#main'),notice=document.querySelector('#notice');
   return {title:main.querySelector('h1')?.textContent.trim(),width:innerWidth,document_width:document.documentElement.scrollWidth,
    main_text:main.innerText,forms:[...main.querySelectorAll('form')].map(f=>f.dataset.form),
    table_rows:main.querySelectorAll('tbody tr').length,error:notice&&!notice.hidden&&notice.classList.contains('error')?notice.textContent:null};
  });
  result.views.push({view,params,title:visible.title,width:visible.width,document_width:visible.document_width,
   forms:visible.forms,table_rows:visible.table_rows});
  required(!visible.error,'The original '+view+' view returned: '+visible.error);
  required(visible.document_width<=visible.width+1,'The '+view+' view extends to '+visible.document_width+'px at '+visible.width+'px.');
  return visible;
 }
 async function visiblePaths(heading,column,expected){
  const card=page.getByRole('heading',{name:heading,exact:true}).locator('..');
  const paths=await card.locator('tbody tr').evaluateAll((rows,column)=>rows.map(row=>row.querySelectorAll('td')[column]?.querySelector('code')?.textContent||''),column);
  required(JSON.stringify(paths)===JSON.stringify(expected.map(row=>row.path)),'The visible complete path page differs from its original source rows.');
  return paths;
 }
 async function pages(kind,id){
  const field=kind==='edition'?'files':'comparison',action=kind==='edition'?'static.editions.get':'static.plans.get';
  const idField=kind==='edition'?'edition_id':'plan_id',received=[],rows=[],seen=new Set();let offset=0,total=null,pinned=null;
  for(;;){
   required(!seen.has(offset),'The original complete path cursor repeated.');seen.add(offset);
   const value=await domain(action,{[idField]:id,offset,limit:100,status:'all',query:''}),part=value[field];
   required(part&&part.offset===offset&&Array.isArray(part.rows),'The original complete path page changed shape.');
   const editionOrPlan=value[kind],pin=kind==='edition'?editionOrPlan.id:editionOrPlan.comparison_sha256;
   if(pinned===null)pinned=pin;else required(pin===pinned,'The original complete path source changed while receiving.');
   if(total===null)total=part.total;else required(part.total===total,'The original total changed while receiving its pages.');
   await observe('static-'+kind,{id,offset},editionOrPlan.label);
   await visiblePaths(kind==='edition'?'Complete output paths':'All output paths',kind==='edition'?0:1,part.rows);
   rows.push(...part.rows);received.push(value);
   if(part.next_offset===null)break;
   required(Number.isSafeInteger(part.next_offset)&&part.next_offset>offset,'The native complete-path cursor did not advance.');
   offset=part.next_offset;
  }
  required(rows.length===total,'The browser receiving did not receive every original path.');
  return {id,pages:received,rows,total};
 }
 async function download(file,relative,view,params,title){
  required(file&&typeof file.file_id==='string'&&Number.isSafeInteger(file.bytes)&&/^[0-9a-f]{64}$/.test(file.sha256),'Retain the native file descriptor.');
  await observe(view,params,title);
  const href='/api/files/'+encodeURIComponent(file.file_id);
  const selectedLink=page.locator('#main a[href="'+href+'"]').first();await selectedLink.waitFor();
  const arriving=page.waitForEvent('download');await selectedLink.click();const item=await arriving;
  const destination=path.join(output,relative);await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  await item.saveAs(destination);const failure=await item.failure();required(!failure,'The original browser download failed: '+failure);
  const actual=await identity(destination);required(actual.bytes===file.bytes&&actual.sha256===file.sha256,'The received original file changed bytes.');
  const receipt={file_id:file.file_id,source_path:file.path||null,suggested_filename:item.suggestedFilename(),relative_path:relative,bytes:actual.bytes,sha256:actual.sha256};
  result.downloads.push(receipt);return receipt;
 }
 async function screenshot(name){
  const destination=path.join(output,name);await page.screenshot({path:destination,fullPage:true});
  const actual=await identity(destination);result.images.push({relative_path:name,bytes:actual.bytes,sha256:actual.sha256});
 }
 try{
  await page.goto(base.href,{waitUntil:'networkidle'});
  const login=page.locator('[data-form="login"]');
  if(await login.count()){
   await login.locator('[name="name"]').fill(credentials.name);await login.locator('[name="password"]').fill(credentials.password);
   await login.locator('button').click();
  }
  await page.locator('#navigation a[href="#static"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  const session=await page.evaluate(async()=>{const r=await fetch('/api/session');if(!r.ok)throw Error('Original sign-in read failed.');return r.json();});
  required(session.user?.name===credentials.name,'The actual signed-in operator differs.');
  result.operator={name:session.user.name,role:session.user.role};
  const list=await domain('static.list'),target=await domain('static.targets.get',{target_id:completed.target_id});
  required(target.target.target_id===completed.target_id&&target.current_release?.id===completed.selected_release.id,'The retained current release differs from the original completed operation.');
  for(const id of completed.edition_ids)required(list.editions.some(e=>e.id===id),'The full native edition is absent.');
  for(const id of planIds)required(list.plans.some(p=>p.id===id&&p.target_id===completed.target_id),'The complete original comparison is absent.');
  result.target=target;
  await page.setViewportSize({width:1366,height:1000});
  await observe('static',{},'Static releases');
  await observe('static-target',{id:completed.target_id},target.target.label);
  if(visual)await screenshot('tome-'+label+'-target-1366.png');
  for(let i=0;i<completed.edition_ids.length;i++){
   const item=await pages('edition',completed.edition_ids[i]);
   required(item.pages[0].edition.id===completed.reopened_editions[i].id,'The browser reopened another native edition.');
   result.editions.push(item);
   const selectedFile=item.rows.find(row=>row.path==='index.html')||item.rows.find(row=>row.path.endsWith('.html'))||item.rows[0];
   required(selectedFile,'The original operated Tome edition has no generated output.');
   await download(selectedFile,'downloads/'+label+'-edition-'+(i?'b':'a')+'-'+path.basename(selectedFile.path),'static-edition',
    {id:item.id,query:selectedFile.path},item.pages[0].edition.label);
   const plan=await pages('plan',planIds[i]);required(plan.pages[0].plan.candidate_id===item.id,'The original comparison candidate changed.');
   result.comparisons.push(plan);
   const change=plan.rows.find(row=>row.status!=='unchanged')||plan.rows[0];
   if(change){
    await observe('static-plan',{id:plan.id},plan.pages[0].plan.label);
    const form=page.locator('[data-form="static-filter"]');
    await form.locator('[name="query"]').fill(change.path);await form.locator('[name="status"]').selectOption(change.status);
    const changed=page.waitForFunction(({query,status})=>{const p=new URLSearchParams(location.hash.split('?')[1]||'');return p.get('query')===query&&p.get('status')===status&&document.querySelector('#main')?.getAttribute('aria-busy')==='false';},{query:change.path,status:change.status});
    await form.locator('button').click();await changed;await page.waitForLoadState('networkidle');
    const filtered=await domain('static.plans.get',{plan_id:plan.id,offset:0,limit:100,query:change.path,status:change.status});
    await visiblePaths('All output paths',1,filtered.comparison.rows);
    result.comparisons.at(-1).filtered_page=filtered;
   }
  }
  const operationIds=new Set(result.editions.map(e=>e.pages[0].edition.operation_id));
  for(const p of result.comparisons)for(const stage of p.pages[0].stages)operationIds.add(stage.operation_id);
  for(const release of target.releases)if(completed.published_release_ids.includes(release.id)||release.id===completed.selected_release.id)operationIds.add(release.operation_id);
  for(const id of operationIds){
   if(!id)continue;const value=await domain('operations.get',{operation_id:id});
   required(value.operation.state==='COMPLETE','An original retained native operation is no longer complete.');
   result.operations.push(value);
   await observe(value.operation.type.startsWith('STATIC_')?'static-operation':'operation',{id});
  }
  const exported=(await domain('static.exports.get',{export_id:completed.export.id})).export;
  required(exported.file.id===completed.export.file.id&&exported.file.sha256===completed.handover.sha256,'The original complete handover changed.');
  result.export=exported;
  await download({file_id:exported.file.id,bytes:completed.handover.bytes,sha256:completed.handover.sha256},
   'downloads/'+label+'-Static_Release_Handover.zip','static-export',{id:exported.id},exported.name);
  await page.setViewportSize({width:390,height:900});
  await observe('static',{},'Static releases');
  await observe('static-target',{id:completed.target_id},target.target.label);
  if(visual)await screenshot('tome-'+label+'-target-390.png');
  for(const edition of result.editions)await observe('static-edition',{id:edition.id},edition.pages[0].edition.label);
  for(const comparison of result.comparisons)await observe('static-plan',{id:comparison.id},comparison.pages[0].plan.label);
  await observe('static-export',{id:exported.id},exported.name);
  if(visual)await screenshot('tome-'+label+'-handover-390.png');
  const after=await domain('static.targets.get',{target_id:completed.target_id}),afterList=await domain('static.list');
  required(after.current_release?.id===target.current_release.id&&after.target.revision===target.target.revision,'The receiving views changed the original release selection.');
  required(digest(afterList.editions)===digest(list.editions)&&digest(afterList.plans)===digest(list.plans)&&digest(afterList.releases)===digest(list.releases),'The original native edition, comparison or release history changed during receiving.');
  required(!result.page_errors.length&&!result.request_failures.length&&!result.http_errors.length,'The original browser recorded page or service errors.');
  result.status='COMPLETE';emit({stage:'TOME_BROWSER_COMPLETE',label,views:result.views.length,downloads:result.downloads.length});
 }catch(error){result.status='FAILED';result.error=error.message;throw Object.assign(error,{result});}
 finally{result.finished_at=new Date().toISOString();await writeJson(resultPath,result);await page.close();}
 return result;
}

async function originalServer({python,application,workspace,sourceRoot,output}){
 const server=path.join(application,'workspace','server.py');await identity(server);
 const stdout=path.join(output,'server.stdout.log'),stderr=path.join(output,'server.stderr.log');await fs.mkdir(output,{recursive:true,mode:0o700});
 const out=await fs.open(stdout,'a',0o600),err=await fs.open(stderr,'a',0o600);
 const child=spawn(python,['-B','-u',server,'--workspace',workspace,'--source-root',sourceRoot,
  '--assessment-core',path.join(application,'workspace','vendor','assessment-core'),'--port','0'],{cwd:application,stdio:['ignore','pipe',err.fd],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 let captured='',settled=false,logWrites=Promise.resolve();const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error('The original GovHub server did not return its startup URL; read the retained server logs.'));}},45000);
  child.on('error',error=>{clearTimeout(timer);if(!settled){settled=true;reject(error);}});
  child.on('exit',(code,signal)=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('The original server exited before startup: '+code+'/'+signal));}});
  child.stdout.on('data',chunk=>{
   logWrites=logWrites.then(()=>out.write(chunk));captured+=chunk.toString('utf8');
   for(const line of captured.split('\n').slice(0,-1)){
    try{const value=JSON.parse(line);if(value.url&&value.workspace&&!settled){required(path.resolve(value.workspace)===path.resolve(workspace),'The original server opened another workspace.');settled=true;clearTimeout(timer);resolve(value);}}catch(error){if(error.message==='The original server opened another workspace.'){settled=true;clearTimeout(timer);reject(error);}}
   }
   captured=captured.slice(captured.lastIndexOf('\n')+1);
  });
 });
 async function close(){
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  const ended=await Promise.race([closed,new Promise(resolve=>{const t=setTimeout(()=>resolve(null),10000);t.unref();})]);
  if(!ended){child.kill('SIGKILL');await closed;}
  await logWrites;await Promise.all([out.close(),err.close()]);
 }
 try{return {child,ready:await ready,close};}catch(error){await close();throw error;}
}

export async function runTomeBrowserReceiving(options){
 const application=absolute(options.application),operation=absolute(options.operationDirectory),output=absolute(options.outputDirectory);
 const temporaryParent=absolute(options.temporaryDirectory||os.tmpdir()),python=absolute(options.python),playwrightModule=absolute(options.playwrightModule),chromiumExecutable=absolute(options.chromium);
 await fs.mkdir(output,{recursive:true,mode:0o700});
 const nativePath=path.join(operation,'delivery','GovHub-Tome-Native-Result.json'),completed=await json(nativePath);
 const nativeIdentity=await identity(nativePath),manifest=await identity(path.join(application,'APPLICATION_SOURCE.json'));
 const sourceLock=await json(manifest.path);required(sourceLock.source_commit===completed.application_source_commit&&manifest.sha256===completed.application_source_sha256,'Use the exact application selection retained by the native operation.');
 const planIds=[];for(const letter of ['a','b'])planIds.push((await json(path.join(operation,'results','comparison-'+letter+'-full.json'))).plan.id);
 const account=await json(path.join(operation,'operator-credentials.json'));const credentials={name:account.username,password:account.password};
 const programIdentity=await identity(ownFile);
 const signature={programme:{bytes:programIdentity.bytes,sha256:programIdentity.sha256},native_result:{bytes:nativeIdentity.bytes,sha256:nativeIdentity.sha256},application_manifest:{bytes:manifest.bytes,sha256:manifest.sha256},selected:selectedInput(completed,planIds)};
 const resultPath=path.join(output,'GovHub-Tome-Browser-Receiving.json'),prior=await readIfPresent(resultPath);
 if(prior)required(prior.input_sha256===digest(signature),'The existing browser programme belongs to another native result or source edition.');
 if(prior?.status==='COMPLETE'){for(const item of prior.files){const actual=await identity(path.join(output,item.relative_path));required(actual.bytes===item.bytes&&actual.sha256===item.sha256,'Restore the original completed browser artifact.');}return prior;}
 const temp=await fs.mkdtemp(path.join(temporaryParent,'tome-browser-'));
 const previousTmp=process.env.TMPDIR;process.env.TMPDIR=temp;
 const require=createRequire(import.meta.url);
 const args=['--no-sandbox','--no-zygote','--disable-gpu','--disable-dev-shm-usage'];if(options.singleProcess)args.push('--single-process');
 const result={schema:'govhub.tome-complete-browser-programme.v1',status:'RUNNING',started_at:new Date().toISOString(),input_sha256:digest(signature),input:signature,runs:[],files:[]};
 let browser;
 try{
  const playwright=require(playwrightModule);
  browser=await playwright.chromium.launch({headless:true,executablePath:chromiumExecutable,args,env:{...process.env,TMPDIR:temp}});
  for(const [label,workspace] of [['original',completed.workspace],['receiving',completed.receiving_workspace]]){
   const dir=path.join(output,label),server=await originalServer({python,application,workspace:absolute(workspace),sourceRoot:path.join(operation,'inputs'),output:dir});
   const context=await browser.newContext({viewport:{width:1366,height:1000},acceptDownloads:true});
   try{const observed=await inspectTomeBrowser({context,baseUrl:server.ready.url,credentials,completed,planIds,outputDirectory:dir,label,visual:options.visual!==false});result.runs.push(observed);}
   finally{await context.close();await server.close();}
  }
  async function collect(dir){
   for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.name===path.basename(resultPath)||item.name.startsWith('.'))continue;const current=path.join(dir,item.name);if(item.isDirectory())await collect(current);else if(item.isFile()){const value=await identity(current);result.files.push({relative_path:path.relative(output,current),bytes:value.bytes,sha256:value.sha256});}}
  }
  await collect(output);result.files.sort((a,b)=>a.relative_path.localeCompare(b.relative_path));
  required(result.runs.length===2&&result.runs.every(r=>r.status==='COMPLETE'),'Complete both original and independently received browser workspaces.');
  result.status='COMPLETE';
 }catch(error){result.status='FAILED';result.error=error.message;throw Object.assign(error,{result});}
 finally{if(browser)await browser.close();if(previousTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previousTmp;await fs.rm(temp,{recursive:true,force:true});result.finished_at=new Date().toISOString();await writeJson(resultPath,result);}
 emit({stage:'TOME_BROWSER_RECEIVING_COMPLETE',result:resultPath,status:result.status,workspaces:result.runs.length,views:result.runs.reduce((n,r)=>n+r.views.length,0),files:result.files.length});return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===ownFile){
 try{
  const argv=process.argv.slice(2),options={};const names={'--application':'application','--operation-directory':'operationDirectory','--output-directory':'outputDirectory','--temporary-directory':'temporaryDirectory','--python':'python','--playwright-module':'playwrightModule','--chromium':'chromium'};
  for(let i=0;i<argv.length;i++){if(argv[i]==='--single-process'){options.singleProcess=true;continue;}if(argv[i]==='--no-images'){options.visual=false;continue;}const key=names[argv[i]];required(key&&argv[i+1],'Choose the documented full browser receiving flags.');options[key]=argv[++i];}
  await runTomeBrowserReceiving(options);
 }catch(error){process.stderr.write(JSON.stringify({status:'FAILED',error:error.message})+'\n');process.exitCode=1;}
}
