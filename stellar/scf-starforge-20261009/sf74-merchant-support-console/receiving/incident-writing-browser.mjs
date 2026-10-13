#!/usr/bin/env node
// MIT. Operate the original Incident desk and preserve its complete browser course.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createReceivingProcessOwner} from './receiving-process.mjs';
const require=createRequire(import.meta.url);
const fail=message=>{throw new Error(message);};
const need=(ok,message)=>{if(!ok)fail(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const url=new URL(config.base_url);
need(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash,'Use the original loopback Support console.');
need(typeof config.source_id==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.source_id),'Select the original registered Incident source.');
need(typeof config.case_root==='string'&&config.case_root,'Retain the original receiving case root.');
const out=resolve(config.case_root,'incident-writing-course');
await mkdir(out,{recursive:true,mode:0o700});
const progressPath=join(out,'progress.json'),attempt=randomUUID(),attemptDir=join(out,attempt);
await mkdir(attemptDir,{mode:0o700});
let progress;
try{progress=JSON.parse(await readFile(progressPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;
  progress={schema:'stellar-forge.incident-writing-course.v1',id:randomUUID(),sourceId:config.source_id,
    done:[],session:{},local:{},requests:[],downloads:[],screenshots:[]};}
need(progress.sourceId===config.source_id,'This original course belongs to another source.');
const save=async()=>{const path=progressPath+'.'+attempt+'.tmp';await writeFile(path,JSON.stringify(progress,null,2)+'\n',{mode:0o600});await rename(path,progressPath);};
const completed=name=>progress.done.includes(name);
const KEY='stellar-forge.incident-writing.v1';
let browser,context,page,owner,interrupted=null,shutdownPromise=null,expectedNetworkError=false,routeTail=Promise.resolve();
async function shutdown(reason=null){
 if(reason&&!interrupted)interrupted=reason;if(shutdownPromise)return shutdownPromise;
 shutdownPromise=(async()=>{if(owner)await owner.close(async()=>{if(context)await context.close();if(browser)await browser.close();});})();return shutdownPromise;
}
function signalReceived(signal){process.exitCode=signal==='SIGTERM'?143:130;void shutdown(Error('Original browser receiving interrupted by '+signal)).catch(e=>{progress.cleanupError=e.stack||String(e);});}
const onTerminate=()=>signalReceived('SIGTERM'),onInterrupt=()=>signalReceived('SIGINT');
process.on('SIGTERM',onTerminate);process.on('SIGINT',onInterrupt);
const errors=[];
function loadPlaywright(){
  if(config.playwright_module)return require(config.playwright_module);
  try{return require('playwright');}catch{}
  const root=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if(root){try{return require(join(root,'playwright'));}catch{}}
  fail('Use the installed original Playwright module through playwright_module.');
}
async function checkpoint(){
  if(!page||page.isClosed())return;
  const value=await page.evaluate(key=>({session:Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k===key)),
    local:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith(key+':copy:')))}),KEY);
  progress.session=value.session;progress.local=value.local;await save();
}
async function stage(name,action){
  if(completed(name))return;
  await action();await checkpoint();progress.done.push(name);await save();
}
async function screenshot(name){
  const filename=name+'.png',path=join(attemptDir,filename);
  await page.screenshot({path,fullPage:true});
  const body=await readFile(path);progress.screenshots.push({name,path,bytes:body.length,sha256:hash(body),viewport:page.viewportSize()});await save();
}
async function sourceRead(){
  const result=await page.request.get(new URL('/api/incidents/'+encodeURIComponent(config.source_id),url).href);
  need(result.ok(),'The original selected Incident source did not open.');
  return result.json();
}
async function openSource(){
  await page.locator('#incident-source').waitFor({state:'visible'});
  const select=page.locator('#incident-source');
  if(await select.inputValue()!==config.source_id)await select.selectOption(config.source_id);
  await page.locator('#incident-writing-status').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const field=document.querySelector('#incident-config-json');return field&&!field.disabled&&field.value.length>0;});
  await page.locator('.incident-live input').uncheck();
  await page.locator('#incident-writing').scrollIntoViewIfNeeded();
}
async function download(name){
  const waiting=page.waitForEvent('download');await page.locator('#incident-writing-download').click();
  const item=await waiting,path=join(attemptDir,name+'.json');await item.saveAs(path);
  const bytes=await readFile(path),value=JSON.parse(bytes.toString('utf8'));
  need(value.schema===KEY&&value.source.id===config.source_id,'The downloaded complete copy has a different original source.');
  const record={name,path,bytes:bytes.length,sha256:hash(bytes)};progress.downloads.push(record);await save();
  return{value,record};
}
async function working(){
  return page.evaluate(({key,id})=>JSON.parse(sessionStorage.getItem(key)||'{}')[id],{key:KEY,id:config.source_id});
}
async function controlsReady(){await page.waitForFunction(()=>!document.querySelector('#incident-config-json').disabled);}
try{
  const {chromium}=loadPlaywright();
  owner=await createReceivingProcessOwner({directory:join(out,'process-control'),operation:'493D-SF74-INCIDENT-CONFIGURATION-WRITING-20261013:browser',sourceSha256:hash(await readFile(new URL(import.meta.url))),executable:config.chromium_path||chromium.executablePath()});
  if(interrupted)throw interrupted;
  browser=await owner.launch(({executablePath,env})=>chromium.launch({headless:true,executablePath,env,timeout:15000,handleSIGTERM:false,handleSIGINT:false,handleSIGHUP:false,args:['--disable-dev-shm-usage']}));
  if(interrupted)throw interrupted;
  context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  await context.addInitScript(({session,local,origin,courseId})=>{
    if(location.origin!==origin||sessionStorage.getItem('incident-writing-course-restored')===courseId)return;
    sessionStorage.setItem('incident-writing-course-restored',courseId);
    for(const [k,v]of Object.entries(session))sessionStorage.setItem(k,v);
    for(const [k,v]of Object.entries(local))localStorage.setItem(k,v);
  },{session:progress.session,local:progress.local,origin:url.origin,courseId:progress.id});
  page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/incidents/**',async route=>{
    const request=route.request();
    if(request.method()==='GET'){await route.continue();return;}
    const path=new URL(request.url()).pathname;
    need(path==='/api/incidents/'+encodeURIComponent(config.source_id)+'/configure','The course only applies the selected original configuration.');
    const body=request.postDataJSON();
    need(progress.original&&canonical(body.config)===canonical(progress.original.config),'The course cannot change the original watcher configuration.');
    const action=async()=>{
      await checkpoint();
      const retained=(await working())?.pending;
      need(retained&&canonical(retained.payload)===canonical(body),'The complete original request must be retained before forwarding.');
      const record={at:new Date().toISOString(),path,payload:body,pending:retained,status:'forwarded'};
      need(progress.applySelection&&canonical(progress.applySelection.payload)===canonical(body),'Retain the selected original apply phase before forwarding.');
      if(progress.applyOriginalRequest)need(progress.applyOriginalRequest.requestedAt===retained.requestedAt&&
        canonical(progress.applyOriginalRequest.payload)===canonical(retained.payload),'Resume the same original prepared request.');
      else progress.applyOriginalRequest=retained;
      progress.requests.push(record);await save();
      try{const response=await route.fetch();record.status=response.status();record.body=await response.text();await save();await route.fulfill({response,body:record.body});}
      catch(error){record.transportError=error.message;await save();await route.abort().catch(()=>{});}
    };
    routeTail=routeTail.then(action);await routeTail;
  });
  await page.goto(url.href,{waitUntil:'domcontentloaded'});await openSource();
  const original=await sourceRead();
  if(progress.original){need(original.configHash===progress.original.configHash&&canonical(original.source)===canonical(progress.original.source),'The original source/configuration changed. Retain this course and review before continuing.');}
  else{
    if(config.expected_config_hash)need(original.configHash===config.expected_config_hash,'The selected original configuration differs from the receiving input.');
    if(config.expected_config_revision)need(original.configRevision===config.expected_config_revision,'The original revision differs from the receiving input.');
    progress.original={source:original.source,configRevision:original.configRevision,configHash:original.configHash,config:original.config};
    progress.raw='{\n  "original source": '+JSON.stringify(config.source_id)+',\n  "unfinished note": "élève – keep exact text",\n';
    await save();
  }
  if(config.source_files)for(const file of config.source_files){
    const response=await page.request.get(new URL('/'+file.name,url).href);need(response.ok(),'Missing selected product source '+file.name);
    const body=await response.body();need(body.length===file.bytes&&hash(body)===file.sha256,'The rendered product differs from selected source '+file.name);
  }
  await stage('incomplete-writing-and-reload',async()=>{
    await page.locator('#incident-config-json').fill(progress.raw);await checkpoint();
    await page.reload({waitUntil:'domcontentloaded'});await openSource();
    need(await page.locator('#incident-config-json').inputValue()===progress.raw,'Reload lost incomplete original writing.');
    await screenshot('desktop-incomplete-writing');
  });
  await stage('named-copy-download-and-reopen',async()=>{
    await page.locator('#incident-writing-label').fill('Original receiving '+progress.id);
    await page.locator('#incident-writing-save').click();
    progress.namedKey=await page.locator('#incident-writing-copies').inputValue();need(progress.namedKey,'Named copy was not retained.');
    const result=await download('complete-incomplete-writing');progress.originalDownload=result.record;
    need(result.value.text===progress.raw,'Download changed incomplete Unicode writing.');
    await page.locator('#incident-config-json').fill('{"later raw edition":');
    await page.locator('#incident-writing-file').setInputFiles(result.record.path);
    await page.waitForFunction(raw=>document.querySelector('#incident-config-json').value===raw,progress.raw);
    const record=await working();need(record.editions.some(row=>row.text==='{"later raw edition":'),'Opening a complete file lost the earlier writing.');
  });
  await stage('source-switch-preserves-writing',async()=>{
    const choices=await page.locator('#incident-source option').evaluateAll(nodes=>nodes.map(n=>n.value));
    const other=choices.find(id=>id!==config.source_id);
    if(other){await page.locator('#incident-source').selectOption(other);await controlsReady();
      await page.locator('#incident-source').selectOption(config.source_id);await controlsReady();
      need(await page.locator('#incident-config-json').inputValue()===progress.raw,'Source switch lost its original writing.');
      progress.sourceSwitch={other,performed:true};}
    else progress.sourceSwitch={performed:false,reason:'The original receiving configuration registers one source.'};
  });
  await stage('original-current-comparison',async()=>{
    const details=page.locator('#incident-writing-comparison');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
    need((await details.textContent()).includes(progress.original.configHash),'Comparison omitted the original current digest.');
    await screenshot('desktop-original-current-comparison');
    await page.locator('#incident-writing-current').click();
    need(canonical(JSON.parse(await page.locator('#incident-config-json').inputValue()))===canonical(progress.original.config),'Use current did not retain the original settings.');
    need((await working()).editions.some(row=>row.text===progress.raw),'Use current discarded incomplete earlier writing.');
  });
  await stage('same-original-configuration-apply',async()=>{
    const current=await sourceRead();
    if(!progress.applySelection){
      need(current.configHash===progress.original.configHash,'Review the changed original configuration before applying.');
      progress.applySelection={source:current.source,configHash:current.configHash,
        payload:{config:progress.original.config,expectedConfigRevision:current.configRevision}};
      await save();
    }
    const matches=request=>request&&progress.applyOriginalRequest&&
      request.requestedAt===progress.applyOriginalRequest.requestedAt&&
      canonical(request.payload)===canonical(progress.applyOriginalRequest.payload);
    let retained=await working();
    if(progress.applyOriginalRequest){
      const outcome=retained.requests.find(row=>matches(row.request));
      if(outcome)need(['SERVER_ACCEPTED','CURRENT_SETTINGS_MATCH'].includes(outcome.outcome),'The original apply needs current-settings review.');
      else{
        need(matches(retained.pending),'The original prepared apply is absent from retained writing. Preserve this case for review.');
        const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/incidents/'+config.source_id+'?')),page.locator('#incident-refresh').click()]);
        const observed=await response.json();
        need(response.ok()&&observed.configHash===progress.original.configHash,'The original current settings need review.');
        if(canonical(observed.config)===canonical(progress.applyOriginalRequest.payload.config)){
          await page.waitForFunction(({key,id,request})=>JSON.parse(sessionStorage.getItem(key)||'{}')[id]?.requests.some(row=>
            row.request.requestedAt===request.requestedAt&&(row.outcome==='SERVER_ACCEPTED'||row.outcome==='CURRENT_SETTINGS_MATCH')),
            {key:KEY,id:config.source_id,request:progress.applyOriginalRequest});
        }
        retained=await working();
        if(!retained.requests.some(row=>matches(row.request))){
          need(matches(retained.pending)&&!retained.pending.accepted,'Review the original accepted-but-different current revision.');
          await page.locator('#incident-writing-retry').click();await controlsReady();await routeTail;
        }
      }
    }else{
      need(!retained.pending,'Reconcile the existing original request before this course can continue.');
      const text=JSON.stringify(progress.applySelection.payload.config,null,2)+'\n';
      await page.locator('#incident-config-json').fill(text);await checkpoint();
      await page.locator('#incident-config-save').click();await controlsReady();await routeTail;
    }
    await page.waitForFunction(({key,id,request})=>{const record=JSON.parse(sessionStorage.getItem(key)||'{}')[id];
      return record&&!record.pending&&record.requests.some(row=>row.request.requestedAt===request.requestedAt&&
        (row.outcome==='SERVER_ACCEPTED'||row.outcome==='CURRENT_SETTINGS_MATCH'));},
      {key:KEY,id:config.source_id,request:progress.applyOriginalRequest});
    const after=await sourceRead();need(after.configHash===progress.original.configHash,'The original same-config apply changed watcher settings.');
    progress.applied={revision:after.configRevision,hash:after.configHash,record:await working()};
  });
  await stage('named-copy-preserves-full-history',async()=>{
    const before=await working();
    await page.locator('#incident-writing-copies').selectOption(progress.namedKey);
    await page.locator('#incident-writing-open').click();
    const reopened=await working();
    for(const row of before.editions)need(reopened.editions.some(item=>canonical(item)===canonical(row)),'Opening a saved copy dropped an earlier full edition.');
    for(const row of before.requests)need(reopened.requests.some(item=>canonical(item)===canonical(row)),'Opening a saved copy dropped an original request.');
    const result=await download('complete-worked-writing');progress.finalDownload=result.record;
    need(result.value.text===progress.raw,'The original named writing did not reopen exactly.');
  });
  await stage('empty-error-and-recovery-views',async()=>{
    await page.locator('#incident-search').fill('receiving-empty-'+progress.id);
    await Promise.all([page.waitForResponse(r=>r.url().includes('/api/incidents/'+config.source_id+'?')&&new URL(r.url()).searchParams.get('q')==='receiving-empty-'+progress.id),page.locator('#incident-search').press('Enter')]);
    await page.waitForFunction(()=>document.querySelector('.incident-table tbody')?.textContent.includes('No incidents'));
    await screenshot('desktop-empty-incidents');
    await page.locator('#incident-search').fill('');await Promise.all([page.waitForResponse(r=>r.url().includes('/api/incidents/'+config.source_id+'?')&&!new URL(r.url()).searchParams.has('q')),page.locator('#incident-search').press('Enter')]);
    await page.route('**/api/incidents/'+config.source_id+'?*',route=>route.abort(),{times:1});
    expectedNetworkError=true;await page.locator('#incident-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#incident-status')?.classList.contains('error'));
    await screenshot('desktop-original-read-error');
    await page.locator('#incident-refresh').click();await controlsReady();expectedNetworkError=false;
    need(await page.locator('#incident-config-json').inputValue()===progress.raw,'A read failure replaced retained writing.');
  });
  await stage('narrow-view-and-complete-file-cold-reopen',async()=>{
    await page.setViewportSize({width:390,height:844});await page.locator('#incident-writing').scrollIntoViewIfNeeded();
    const overflow=await page.locator('#incident-writing').evaluate(n=>n.scrollWidth>n.clientWidth+1);
    need(!overflow,'The complete working-copy controls overflow at390px.');await screenshot('phone-complete-writing');
    await checkpoint();await page.reload({waitUntil:'domcontentloaded'});await openSource();
    const current=await working();need(current.editions.length>0&&current.requests.length>0,'Cold reopen lost complete worked history.');
    await page.locator('#incident-writing-file').setInputFiles(progress.finalDownload.path);
    await page.waitForFunction(raw=>document.querySelector('#incident-config-json').value===raw,progress.raw);
    await screenshot('phone-reopened-working-file');await page.setViewportSize({width:1280,height:900});
  });
  await checkpoint();if(interrupted)throw interrupted;need(!errors.length,'Original browser errors: '+errors.join('; '));
  progress.status='passed';progress.completedAt=new Date().toISOString();await save();
}catch(error){progress.status='failed';progress.error=error.stack||String(error);try{await checkpoint();if(page&&!page.isClosed())await screenshot('failure');}catch{}await save();process.exitCode=1;}
finally{
  try{await shutdown();}catch(error){progress.cleanupError=error.stack||String(error);progress.status='failed';process.exitCode=1;}
  await routeTail.catch(()=>{});
  if(interrupted){progress.status='failed';progress.error=interrupted.stack||String(interrupted);}
  await save();process.removeListener('SIGTERM',onTerminate);process.removeListener('SIGINT',onInterrupt);
  const result={schema:progress.schema,status:progress.status,id:progress.id,sourceId:progress.sourceId,
    original:progress.original,completed:progress.done,requests:progress.requests,downloads:progress.downloads,
    screenshots:progress.screenshots,pageErrors:errors,error:progress.error??null,cleanupError:progress.cleanupError??null,processes:owner?.report??null,progressPath};
  await writeFile(join(attemptDir,'browser-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}
