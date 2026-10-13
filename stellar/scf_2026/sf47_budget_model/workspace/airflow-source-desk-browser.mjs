// MIT. Actual registered Grant Operations browser receiving; no substitute API.
import {readFile,mkdir,rename,open,stat,link,unlink} from 'node:fs/promises';
import {resolve,join,basename,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {validateArchive} from './operations_airflow_model.mjs';
const [inputPath,accessPath]=process.argv.slice(2);
const input=JSON.parse(await readFile(inputPath,'utf8')),access=JSON.parse(await readFile(accessPath,'utf8'));
const root=resolve(input.directory),out=join(root,'artifacts'),reportPath=join(root,'Airflow_Source_Desk_Browser.json');
await mkdir(out,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
const need=(v,m)=>{if(!v)throw Error(m);};
const pretty=v=>JSON.stringify(v,null,2)+'\n';
const exists=async p=>{try{return (await stat(p)).isFile();}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function publish(path,body,immutable){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 if(immutable&&await exists(path)){need((await readFile(path)).equals(Buffer.from(body)),'Preserve the exact original '+basename(path));return;}
 const temp=path+'.pending-'+randomUUID(),h=await open(temp,'wx',0o600);
 try{try{await h.writeFile(body);await h.sync();}finally{await h.close();}
  if(immutable){try{await link(temp,path);}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(path)).equals(Buffer.from(body)),'The original retained file changed.');}}
  else await rename(temp,path);
  await syncDirectory(dirname(path));
 }finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
const replace=(path,body)=>publish(path,body,false),exact=(path,body)=>publish(path,body,true);
async function receipt(path){const b=await readFile(path);return {path,bytes:b.length,sha256:sha(b)};}
const report=await exists(reportPath)?JSON.parse(await readFile(reportPath,'utf8')):{schema:'stellar-forge.airflow-source-desk-browser.v1',inputSha256:input.inputSha256,state:'PREPARED',phases:{},artifacts:{},requests:{},session:null};
need(report.inputSha256===input.inputSha256,'Resume the same whole original source input.');
let saveTail=Promise.resolve(),context,page,failure,closed=false;
function save(){const body=pretty(report);saveTail=saveTail.then(()=>replace(reportPath,body));return saveTail;}
async function remember(path){report.artifacts[relative(out,path)]=await receipt(path);await save();return path;}
async function keep(name,body){const path=join(out,name);await exact(path,body);return remember(path);}
const sessionKey='sf47.installations.'+input.caseId,prefix='/api/operations/'+input.caseId;
async function snapshot(){if(page&&!page.isClosed()){report.session=await page.evaluate(key=>sessionStorage.getItem(key),sessionKey);await save();}}
async function api(path,body){const response=await context.request.fetch(access.origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+access.token,'Content-Type':'application/json'},data:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();need(response.ok(),value.message||value.error?.message||'Original native request failed.');return value;}
async function idle({allowError=false}={}){
 await page.waitForFunction(()=>document.querySelector('.airflow-source-desk')?.getAttribute('aria-busy')!=='true'&&document.querySelector('.installation-desk')?.getAttribute('aria-busy')!=='true',null,{timeout:60000});
 const errors=await page.locator('.airflow-source-desk [role="alert"],.installation-message[role="alert"]').allTextContents();
 if(!allowError)need(!errors.some(x=>x.trim()),errors.filter(Boolean).join('\n'));
}
async function click(action){await page.locator('[data-af-action="'+action+'"]').click();await idle();await snapshot();}
async function stage(name,fn){if(report.phases[name])return;await fn();await snapshot();report.phases[name]={completedAt:new Date().toISOString()};await save();}
async function image(name){
 const path=join(out,name+'.png');if(!await exists(path))await page.screenshot({path,fullPage:true});await remember(path);
}
async function capture(name){
 await page.setViewportSize({width:1440,height:1000});await image(name+'-desktop');
 await page.setViewportSize({width:390,height:844});await image(name+'-narrow');
 need(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'The actual narrow page overflows horizontally.');
 await page.setViewportSize({width:1440,height:1000});
}
async function download(action,name){
 const path=join(out,name);
 if(await exists(path)){await remember(path);return path;}
 const pending=page.waitForEvent('download');await click(action);const d=await pending;
 need(!await d.failure(),'The original full download failed.');await d.saveAs(path);return remember(path);
}
async function navigate(){
 await page.goto(access.origin+'/#access='+access.token,{waitUntil:'domcontentloaded'});
 await page.locator('#workbench').waitFor({state:'visible'});
 const plans=page.locator('#plan-select');if(await plans.inputValue()!==input.planId)await plans.selectOption(input.planId);
 await page.locator('[data-tab="operations"]').click();
 const cases=page.locator('select[name="caseSelect"]');await cases.waitFor({state:'visible'});
 if(await cases.inputValue()!==input.caseId)await cases.selectOption(input.caseId);
 need(await cases.inputValue()===input.caseId,'The browser selected another original case.');
 await page.locator('input[name="recordingActor"]').fill(input.actor);
 const nav=page.locator('[data-ops-navigation]'),toggle=nav.locator('[data-nav-toggle]');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 const group=nav.locator('details[data-nav-group]:has([data-nav-section="installations"])');
 if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();
 await group.locator('[data-nav-section="installations"]').click();await idle();
}
async function installationSession(){return page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null'),sessionKey);}
try{
 const imported=await import(pathToFileURL(input.playwright).href),chromium=imported.chromium??imported.default?.chromium;
 context=await chromium.launchPersistentContext(join(root,'browser-profile'),{executablePath:input.chromium,headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage'],timeout:60000});
 context.setDefaultTimeout(45000);
 if(report.session)await context.addInitScript(({key,value,origin})=>{if(location.origin===origin&&!sessionStorage.getItem(key))sessionStorage.setItem(key,value);},{key:sessionKey,value:report.session,origin:access.origin});
 page=context.pages()[0]??await context.newPage();
 async function receiveCommand(route){
  const request=route.request(),body=JSON.parse(request.postData()||'null'),path=new URL(request.url()).pathname;
  need(body&&['source.add','airflow-source.add','installation.save'].includes(body.action),'Use only the original selected source and Installation commands.');
  need(path===prefix+'/airflow-source'?body.action==='airflow-source.add':body.action!=='airflow-source.add','Keep the typed source on its original route.');
  const id=body.requestId;need(/^[a-f0-9-]{36}$/.test(id),'Retain the original native request identity.');
  const bodyPath=join(out,'requests',id+'.json'),bytes=pretty(body),prior=report.requests[id];
  await exact(bodyPath,bytes);await remember(bodyPath);
  if(prior)need(prior.sha256===sha(Buffer.from(bytes))&&prior.path===path,'Keep the exact original command and route.');
  else {report.requests[id]={bodyPath,path,sha256:sha(Buffer.from(bytes)),action:body.action,state:'PENDING'};await snapshot();await save();}
  const response=await route.fetch(),raw=await response.body();let result;try{result=JSON.parse(raw);}catch{}
  report.requests[id]={...report.requests[id],state:response.ok()?'RECORDED':'REJECTED',status:response.status(),result};
  await save();
  if(body.action==='airflow-source.add'&&response.ok()&&!report.lostIntakeReply){
   // Receive this same retained command after withholding its first reply.
   report.lostIntakeReply={requestId:id,recordId:result.recordId};await save();await route.abort('failed');
  }else await route.fulfill({response,body:raw});
  await response.dispose();
 }
 await context.route(access.origin+prefix+'/command',receiveCommand);
 await context.route(access.origin+prefix+'/airflow-source',receiveCommand);
 page.on('pageerror',e=>{report.pageErrors??=[];report.pageErrors.push(e.message);});
 report.state='RUNNING';await save();
 for(const artifact of Object.values(report.artifacts))need(same(await receipt(artifact.path),artifact),'A retained complete browser artifact changed.');
 await navigate();
 // Reconcile the exact original request after a lost HTTP response before any replacement.
 for(const item of Object.values(report.requests).filter(x=>x.state==='PENDING')){
  const body=JSON.parse(await readFile(item.bodyPath,'utf8'));need(sha(Buffer.from(pretty(body)))===item.sha256,'The original pending request changed.');
  const result=await api(item.path,body);item.result=result;item.state='RECORDED';await save();
 }
 const nativeRecovery=page.locator('[data-installation-action="recover"]');
 if(await nativeRecovery.count()){await nativeRecovery.click();await idle();await snapshot();}
 await stage('01-original-commercial-draft',async()=>{
  let s=await installationSession(),d=s?.drafts?.[s.draftKey];
  if(!d||d.installationId!==null||!same(d.document,input.document)){
   await page.locator('[data-installation-action="new"]').click();await idle();
   await page.locator('[data-installation-file]').setInputFiles(input.documentPath);await idle();
  }
  s=await installationSession();d=s.drafts[s.draftKey];
  need(!d.installationId&&same(d.document,input.document),'The complete original commercial document was not received.');
 });
 await page.locator('[data-installation-action="airflow-open"]').click();await idle();
 const desk=page.locator('.airflow-source-desk');await desk.waitFor({state:'visible'});
 const copyName=input.operationId+' original';
 await stage('00-complete-typed-source-custody',async()=>{
  if(input.sourceId){const c=await api(prefix);const row=c.sources.find(x=>x.id===input.sourceId);
   need(row?.sha256===input.sourceSha256,'The original attached source changed.');report.sourceId=row.id;
  }else{
   const c=await api(prefix),existing=c.sources.find(x=>x.sha256===input.sourceSha256&&x.airflowHandover);
   if(existing)report.sourceId=existing.id;
   else{
    const full=await readFile(input.handoverPath);need(sha(full)===input.sourceSha256,'The retained full Airflow file changed.');
    await desk.locator('[data-af-source-file]').setInputFiles({name:basename(input.sourceFile),mimeType:'application/json',buffer:full});
    await idle({allowError:true});
   }
   const recovery=desk.locator('[data-af-action="intake-recover"]');
   if(await recovery.count()){need(await recovery.count()===1,'Retain the original sole pending Airflow intake.');await recovery.click();await idle();}
   const after=await api(prefix),received=after.sources.filter(x=>x.sha256===input.sourceSha256&&x.airflowHandover);
   need(received.length===1,'Receive one exact original complete typed Airflow attachment.');report.sourceId=received[0].id;
  }
  const original=await context.request.get(access.origin+prefix+'/sources/'+report.sourceId,{headers:{Authorization:'Bearer '+access.token}});
  need(original.ok()&&sha(await original.body())===input.sourceSha256,'The retained original source download differs.');
  await save();await capture('00-complete-handover-custody');
 });

 await stage('02-complete-source-and-all-decisions',async()=>{
  const existing=desk.locator('[data-af-action="copy-open"]').filter({hasText:copyName});
  if(await existing.count())await existing.first().click();
  else {
   await desk.locator('aside [data-af-field="sourceId"]').selectOption(report.sourceId);
   await desk.locator('[data-af-field="name"]').fill(copyName);await click('new');
  }
  const original=JSON.parse(await readFile(join(root,'Original_Native_Inspection.json'),'utf8'));
  for(let i=0;i<original.cohort.length;i++){
   const r=input.cohort.find(x=>same(x.reference,original.cohort[i].reference));need(r,'Retain every exact native row.');
   await desk.locator('[data-af-row="'+i+'"][data-af-key="included"]').setChecked(r.included);
   await desk.locator('[data-af-row="'+i+'"][data-af-key="role"]').selectOption(r.role);
   await desk.locator('[data-af-row="'+i+'"][data-af-key="purpose"]').fill(r.purpose);
  }
  const selected=desk.locator('[data-af-action="copy-open"]').filter({hasText:copyName});
  need(await selected.count()===1,'Retain one exact original source working copy.');
  report.originalCopyId=await selected.getAttribute('data-id');await save();
  await click('checkpoint');await capture('01-complete-dag-cohort');
  await desk.locator('[data-af-action="member"]').first().click();await idle();
  need((await desk.locator('.af-source').textContent()).trim(),'The complete original record reader is empty.');
  while(await desk.locator('[data-af-action="page"]').count())await click('page');
  await capture('02-original-record-source');
 });
 // Restore the exact original copy after interruption; another tab or a later
 // named copy must not redirect this original course. Recover its retained
 // attachment before switching to any preparation view.
 if(!report.phases['04-original-native-installation-save']){
  need(typeof report.originalCopyId==='string'&&report.originalCopyId,'Retain the original working-copy identity.');
  await desk.locator('[data-af-action="copy-open"][data-id="'+report.originalCopyId+'"]').click();await idle();
  if(await desk.locator('[data-af-action="recover"]').count())await click('recover');
 }
 await stage('02b-complete-original-member-receiving',async()=>{
  const original=JSON.parse(await readFile(join(root,'Original_Native_Inspection.json'),'utf8')),caseValue=await api(prefix);
  const members=[];
  for(const selected of original.members){
   let offset=0,encoding=null,total=0,pages=0;const text=[],binary=[];
   do{
    const result=await api(prefix+'/airflow/member',{expectedVersion:caseValue.program.version,sourceId:report.sourceId,
     expectedSourceSha256:input.sourceSha256,path:selected.path,offset,limit:32000}),part=result.result;
    need(part.file.path===selected.path&&part.file.bytes===selected.bytes&&part.file.sha256===selected.sha256,
      'The selected full original member changed.');
    need(part.offset===offset&&Number.isSafeInteger(part.end)&&part.end>=offset&&part.end<=part.total,
      'The native member range differs.');
    need(encoding===null||encoding===part.encoding,'Original member encoding changed.');encoding=part.encoding;
    if(encoding==='utf8'){need(Array.from(part.text).length===part.end-offset,'The text page is incomplete.');text.push(part.text);}
    else{need(encoding==='base64','Use the native member encoding.');const bytes=Buffer.from(part.base64,'base64');
     need(bytes.length===part.end-offset,'The binary page is incomplete.');binary.push(bytes);total+=bytes.length;}
    need(part.nextOffset===null?part.end===part.total:part.nextOffset===part.end&&part.end>offset,'The original member did not progress.');
    offset=part.nextOffset;pages++;
   }while(offset!==null);
   const complete=encoding==='utf8'?Buffer.from(text.join(''),'utf8'):Buffer.concat(binary,total);
   need(complete.length===selected.bytes&&sha(complete)===selected.sha256,'The complete original member differs from its native identity.');
   members.push({file:selected,pages});
  }
  await keep('Complete_Native_Member_Receiving.json',pretty({sourceId:report.sourceId,sourceSha256:input.sourceSha256,members}));
  const originalDownload=await download('source-download','Original_Handover_Download.json');
  need(sha(await readFile(originalDownload))===input.sourceSha256,'The actual outgoing original handover differs.');
  const selection=await download('selection-download','Selected_Cohort_Download.json');
  need(same(JSON.parse(await readFile(selection,'utf8')).cohort,input.cohort),'The complete outgoing selected cohort differs.');
 });
 await stage('03-complete-native-preparation',async()=>{
  await desk.locator('[data-af-action="view"][data-view="prepare"]').click();await idle();await click('template');
  for(const key of ['source.reference','source.authority','receiving.host','receiving.operator']){
   const [a,b]=key.split('.');await desk.locator('[data-af-binding="'+key+'"]').fill(input.bindings[a][b]);
  }
  if(await desk.locator('[data-af-action="recover"]').count())await click('recover');
  await click('attach');await click('prepare');await capture('03-complete-preparation');
  const file=await download('prepared-download','Complete_Installation_Preparation.json');
  const prepared=JSON.parse(await readFile(file,'utf8'));
  need(prepared.scope.caseId===input.caseId&&same(prepared.result.prepared.document.workshare,input.document.workshare),'Preparation changed the original commercial source.');
  report.cohortSourceId=prepared.result.snapshot.selectedCohortSource.sourceId;
  await download('download','Whole_Working_Copies_Before_Save.json');await save();
 });
 await stage('04-original-native-installation-save',async()=>{
  const prior=Object.values(report.requests).filter(x=>x.action==='installation.save'&&x.state==='RECORDED');
  need(prior.length<=1,'Preserve the one original receiving Installation save.');
  if(!prior.length){
   await desk.locator('[data-af-action="view"][data-view="prepare"]').click();await idle();
   if(await desk.locator('[data-af-action="recover"]').count())await click('recover');
   await click('receive');
   await page.locator('[data-installation-note]').fill('Receive the complete selected Airflow API source and original commercial workshare.');
   await page.locator('[data-installation-action="preview"]').click();await idle();
   await snapshot();await page.locator('[data-installation-action="save"]').click();await idle();await snapshot();
  }
  const saved=Object.values(report.requests).filter(x=>x.action==='installation.save'&&x.state==='RECORDED');
  need(saved.length===1,'Receive one actual original Installation result.');
  const result=saved[0].result,row=await api(prefix+'/installations/'+result.recordId+'?revision='+result.revision);
  need(row.sha256===result.sha256&&same(row.preview.document,JSON.parse(await readFile(saved[0].bodyPath,'utf8')).data.document),'Native save differs from its original complete command.');
  report.installation={id:row.id,revision:row.revision,sha256:row.sha256};
  await keep('Actual_Saved_Installation.json',pretty(row));await capture('04-original-saved-installation');
 });
 await stage('05-complete-download-and-working-reopen',async()=>{
  await page.locator('[data-installation-action="airflow-open"]').click();await idle();
  const path=await download('download','Whole_Working_Copies_Final.json'),raw=await readFile(path,'utf8'),v=validateArchive(raw);
  const original=v.copies.find(x=>x.name===copyName);need(original,'The downloaded working file lost the complete source copy.');
  need(original.source.metadata.sha256===input.sourceSha256&&original.selection.cohort.length===input.cohort.length,'The complete source/selection changed in download.');
  // Receive a full historical archive as alternatives: later local changes and
  // request/working history must not be overwritten by an older same-ID copy.
  await desk.locator('[data-af-action="import-fork"]').click();
  await desk.locator('[data-af-import]').setInputFiles(path);await idle();
  await desk.locator('[data-af-action="copy-open"]').filter({hasText:copyName}).first().click();await idle();await click('verify');
  await desk.locator('[data-af-action="view"][data-view="history"]').click();await idle();
  need(await desk.locator('[data-af-action="history-open"]').count(),'Complete working history was lost.');
  await capture('05-received-working-history');
 });
 if(input.laterSourceId)await stage('06-later-full-edition-comparison',async()=>{
  await desk.locator('[data-af-action="view"][data-view="compare"]').click();await idle();
  await desk.locator('main [data-af-field="sourceId"]').selectOption(input.laterSourceId);await click('compare');
  const choices=desk.locator('[data-af-choice]'),count=await choices.count();
  need(count>0&&Array.isArray(input.laterChoices)&&input.laterChoices.length===count,'Supply each explicit later-edition decision.');
  for(let i=0;i<count;i++)await choices.nth(i).selectOption(input.laterChoices[i]);
  await capture('06-complete-edition-comparison');await click('compare-apply');
  await download('download','Whole_Working_Copies_Later_Edition.json');
  await capture('07-explicit-later-source');
 });
 await stage('07-cold-browser-working-reopen',async()=>{
  await snapshot();await page.reload({waitUntil:'domcontentloaded'});await navigate();
  await page.locator('[data-installation-action="airflow-open"]').click();await idle();
  await desk.locator('[data-af-action="copy-open"]').filter({hasText:copyName}).first().click();await idle();await click('verify');
  await capture('08-cold-working-reopen');
 });
 need(!report.pageErrors?.length,'The original browser reported a JavaScript error.');
 report.state='COMPLETE';report.visualReview='PENDING_PRODUCING_SEAT_OPEN_AND_LOOK';delete report.error;
}catch(e){failure=e;report.state='INTERRUPTED';report.error={name:e.name,message:e.message};}
finally{
 try{await snapshot();if(context)await context.close();closed=true;}catch(e){failure??=e;report.state='INTERRUPTED';report.closeError=e.message;}
 report.lifetimes=closed?'CLOSED':'UNCONFIRMED';await save();
 process.stdout.write(JSON.stringify({state:report.state,phases:Object.keys(report.phases),artifacts:Object.keys(report.artifacts).length,report:await receipt(reportPath)})+'\n');
}
if(failure)throw failure;
