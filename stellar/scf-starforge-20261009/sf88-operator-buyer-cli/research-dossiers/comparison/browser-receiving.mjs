// SPDX-License-Identifier: MIT
// Full original Research browser receiving. Caller owns browser, listener and process lifetime.
import {mkdir,readFile,writeFile,rename,open,link,unlink,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {exportComparison} from './render.mjs';

const SCHEMA='sf88-research-comparison-browser-receiving/v1';
const fail=(ok,message)=>{if(!ok)throw new Error(message);};
const json=v=>JSON.stringify(v,null,2)+'\n';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function maybe(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function save(path,value){const tmp=path+'.'+randomUUID()+'.tmp',h=await open(tmp,'wx',0o600);try{await h.writeFile(json(value));await h.sync();}finally{await h.close();}await rename(tmp,path);await syncDirectory(dirname(path));}
async function identity(path){const h=createHash('sha256');let bytes=0;for await(const b of createReadStream(path)){bytes+=b.length;h.update(b);}return {file:path,bytes,sha256:h.digest('hex')};}
async function retain(path,bytes){
  // A partial staging file is never the retained original name.
  const temporary=path+'.'+randomUUID()+'.tmp',h=await open(temporary,'wx',0o600);
  try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;fail((await readFile(path)).equals(Buffer.from(bytes)),'Original browser file changed: '+path);}
  await syncDirectory(dirname(path));await unlink(temporary);return identity(path);
}
const comparison=p=>p.locator('#view-comparison');
const exactButton=(p,name)=>p.getByRole('button',{name,exact:true});
const form=p=>comparison(p).locator('form[data-comparison-form]');
async function settle(p){await p.waitForFunction(()=>{const r=document.querySelector('#view-comparison');return r&&!r.hidden&&r.getAttribute('aria-busy')==='false'&&r.querySelector('[aria-label="Comparison case"]');});}
async function click(p,name){await exactButton(comparison(p),name).click();await settle(p);}
async function openDraft(p,id){await comparison(p).getByLabel('Saved comparison working copies',{exact:true}).selectOption(id);await settle(p);fail(await comparison(p).getByLabel('Saved comparison working copies',{exact:true}).inputValue()===id,'Wrong saved working copy');}
async function requestFromUI(p){const text=await form(p).locator('details').filter({has:p.locator('summary',{hasText:'Complete saved original request'})}).locator('pre').textContent();return JSON.parse(text);}
async function selectedDraft(p){return comparison(p).getByLabel('Saved comparison working copies',{exact:true}).inputValue();}
async function field(p,name,value){await form(p).locator('[name="'+name+'"]').fill(value);}
async function readDetails(p){const d=comparison(p).locator('details');for(let i=0;i<await d.count();i++){const x=d.nth(i);if(await x.isVisible())await x.evaluate(e=>{e.open=true;});}}
async function inspectOverflow(p){return p.evaluate(()=>{const v=innerWidth;return [...document.querySelectorAll('#view-comparison button,#view-comparison input,#view-comparison select,#view-comparison textarea')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')||e.name||'').slice(0,100),r:e.getBoundingClientRect()})).filter(x=>x.r.left< -1||x.r.right>v+1).map(x=>({tag:x.tag,text:x.text,left:x.r.left,right:x.r.right}));});}

export async function reviewComparisonBrowser({page,url,receipt,directory,reviewer,openReceived}){
  fail(page&&typeof openReceived==='function','Original page and received-workspace opener required');
  fail(receipt?.status==='BACKEND_RECEIVING_COMPLETE'&&receipt.operationId&&receipt.dossierId,'Receive the original complete backend result first');
  fail(typeof reviewer==='string'&&reviewer.trim(),'Actual reviewer is required');
  directory=resolve(directory);await mkdir(directory,{recursive:true,mode:0o700});
  const output=join(directory,'files');await mkdir(output,{recursive:true,mode:0o700});
  const statePath=join(directory,'browser-progress.json');
  const original=await maybe(statePath);
  const selection={schema:SCHEMA,operationId:receipt.operationId,dossierId:receipt.dossierId,originalRevision:receipt.revision,caseId:receipt.caseId,caseVersionId:receipt.caseVersionId,currentCaseVersionId:receipt.currentCaseVersionId,reviewer,source:receipt.source};
  let state=original??{...selection,steps:{},files:[],screens:[],status:'IN_PROGRESS'};
  for(const k of Object.keys(selection))fail(JSON.stringify(state[k])===JSON.stringify(selection[k]),'Original browser selection changed: '+k);
  await save(statePath,state);
  for(const d of [...state.files,...state.screens]){const a=await identity(d.file);fail(a.bytes===d.bytes&&a.sha256===d.sha256,'Retained browser output changed: '+d.file);}
  if(state.status==='COMPLETE_REQUIRES_VISUAL_INSPECTION'){await retain(join(directory,'browser-result.json'),Buffer.from(json(state)));return state;}
  const token=new URLSearchParams(new URL(url).hash.slice(1)).get('token');
  fail(token,'Original authenticated listener address required');
  const address=(base,id=receipt.dossierId)=>{const u=new URL(base);const q=new URLSearchParams(u.hash.slice(1));q.set('dossier',id);q.set('view','comparison');u.hash=q.toString();return u.href;};
  async function capture(name,p=page){
    const path=join(output,name+'-attempt-'+randomUUID()+'.png');
    const bytes=await p.screenshot({fullPage:true});
    const d={name,...await retain(path,bytes)};state.screens.push(d);await save(statePath,state);
  }
  async function step(name,fn){if(state.steps[name]?.complete)return state.steps[name];const before=state.steps[name]??{};const result=await fn(before);state.steps[name]={...state.steps[name],...result,complete:true};await save(statePath,state);return state.steps[name];}
  async function progress(name,values){state.steps[name]={...state.steps[name],...values};await save(statePath,state);}
  async function download(name,action,p=page,prepare=async()=>null){
    fail(/^[A-Za-z0-9_.-]+$/.test(name),'Unsafe receiving download name');
    const phase=join(output,'download-journals',name);await mkdir(phase,{recursive:true,mode:0o700});
    const binding={...selection,name},selectedPath=join(phase,'selected.json');
    await retain(join(phase,'intent.json'),Buffer.from(json(binding)));
    async function verifySelected(d){
      fail(JSON.stringify(d.binding)===JSON.stringify(binding),'Original download source/phase changed');
      fail(d.attemptDirectory===String(d.attempt).padStart(6,'0')+'-'+d.attemptId&&/^[0-9a-f-]{36}$/.test(d.attemptId),'Invalid retained download attempt');
      const file=join(phase,d.attemptDirectory,'complete-download');
      const actual=await identity(file);fail(actual.bytes===d.bytes&&actual.sha256===d.sha256,'First completed download changed');
      return {file,...actual};
    }
    let selected=await maybe(selectedPath);
    if(!selected){
      // Recover a fully fsynced original attempt before requesting another export.
      const attempts=(await readdir(phase)).filter(x=>/^\d{6}-[0-9a-f-]{36}$/.test(x)).sort();
      for(const dir of attempts){const completed=await maybe(join(phase,dir,'completed.json'));if(completed){await verifySelected(completed);selected=completed;break;}}
      if(!selected){
        const attempt=attempts.length?Number(attempts.at(-1).slice(0,6))+1:1,attemptId=randomUUID();
        fail(attempt<1000000,'Download attempt bound reached');
        const attemptDirectory=String(attempt).padStart(6,'0')+'-'+attemptId,folder=join(phase,attemptDirectory);
        await mkdir(folder,{mode:0o700});const generation=await prepare();await retain(join(folder,'intent.json'),Buffer.from(json({binding,attempt,attemptId,attemptDirectory,generation})));
        const event=p.waitForEvent('download');event.catch(()=>{});await action();const download=await event;
        fail(!await download.failure(),'Actual browser download failed');
        const file=join(folder,'complete-download');await download.saveAs(file);
        const handle=await open(file,'r');try{await handle.sync();}finally{await handle.close();}
        await syncDirectory(folder);
        const d=await identity(file);
        selected={binding,attempt,attemptId,attemptDirectory,generation,suggestedFilename:download.suggestedFilename(),bytes:d.bytes,sha256:d.sha256};
        await retain(join(folder,'completed.json'),Buffer.from(json(selected)));
      }
      await retain(selectedPath,Buffer.from(json(selected)));
    }
    const original=await verifySelected(selected),path=join(output,name);
    try{await link(original.file,path);}catch(e){if(e.code!=='EEXIST')throw e;const got=await identity(path);fail(got.bytes===selected.bytes&&got.sha256===selected.sha256,'Existing original download differs');}
    await syncDirectory(output);
    const item={name,suggestedFilename:selected.suggestedFilename,file:path,bytes:selected.bytes,sha256:selected.sha256,downloadReceipt:selectedPath,generation:selected.generation??null};
    const current=state.files.find(x=>x.name===name);
    if(current)fail(current.bytes===item.bytes&&current.sha256===item.sha256&&current.file===item.file&&JSON.stringify(current.generation??null)===JSON.stringify(item.generation),'Original journaled download changed');
    else{state.files.push(item);await save(statePath,state);}
    return current??item;
  }
  async function visit(){await page.goto(address(url));await settle(page);await comparison(page).getByLabel('Comparison case',{exact:true}).selectOption(receipt.caseId);await settle(page);}
  async function records(kind,p=page){await comparison(p).getByLabel('Comparison records',{exact:true}).selectOption(kind);await settle(p);}
  async function protocol(version,p=page){await comparison(p).getByLabel('Protocol edition',{exact:true}).selectOption(version);await settle(p);fail(await comparison(p).getByLabel('Protocol edition',{exact:true}).inputValue()===version,'Original protocol selection changed');}
  function exactRow(p,value){return comparison(p).locator('tr').filter({has:p.locator('td:nth-child(2)').getByText(value,{exact:true})});}
  async function reportRow(){await records('case-editions');const row=exactRow(page,receipt.caseVersionId);fail(await row.count()===1,'Original protocol row not uniquely visible');return row;}
  const errors=[];const onError=e=>errors.push(String(e));page.on('pageerror',onError);
  let other=null,cold=null,coldPage=null,primaryError=null;
  try{
    await page.setViewportSize({width:1440,height:1000});await visit();
    await step('original-source-and-protocol',async()=>{
      await protocol(receipt.caseVersionId);await readDetails(page);const text=await comparison(page).innerText();fail(text.includes('TRAINING FIXTURE'),'Fixture identity must be visible');
      const row=await reportRow();await exactButton(row,'Read this protocol report').click();await settle(page);
      await page.waitForFunction(()=>document.querySelector('[data-comparison-report]')?.textContent.includes('1.2500'));
      const reportText=await comparison(page).locator('[data-comparison-report]').innerText();
      fail(reportText.includes('Undefined:')&&reportText.includes('Training denominator deliberately zero'),'Undefined metric lost');
      fail(reportText.includes('Training-only review')&&reportText.includes('Retain for software review only'),'Named original review missing');
      await readDetails(page);await capture('desktop-original-protocol-report');
      return {originalProtocol:receipt.caseVersionId,exactDecimal:'1.2500',undefinedMetricRetained:true};
    });
    await step('original-reports-and-files',async()=>{
      await protocol(receipt.caseVersionId);
      const original=receipt.files.find(x=>x.file.endsWith('comparison-report.json'));
      fail(original,'Original pinned report descriptor missing');
      const nativeReport=JSON.parse(await readFile(original.file,'utf8'));
      function retainOriginalReportRecords(report){
        fail(report.dossierId===receipt.dossierId&&report.case?.versionId===receipt.caseVersionId&&
          Number.isSafeInteger(report.revision)&&report.revision>=receipt.revision,'Browser report generation is not the retained original protocol');
        fail(JSON.stringify(report.case)===JSON.stringify(nativeReport.case),'Original protocol definition changed');
        for(const key of ['caseEditions','candidateEditions','runs','judgments','decisions','operations','measurementRows','judgmentRows','sourceEditions']){
          fail(Array.isArray(report[key])&&nativeReport[key].every(row=>report[key].some(current=>JSON.stringify(current)===JSON.stringify(row))),'Original report records changed: '+key);
        }
      }
      const generations=[];
      for(const format of ['html','json','csv']){
        let row;
        const d=await download('original-protocol.'+format,
          ()=>exactButton(row,'This edition '+format.toUpperCase()).click(),page,async()=>{
            row=await reportRow();await exactButton(row,'Read this protocol report').click();await settle(page);
            const report=JSON.parse(await comparison(page).locator('[data-comparison-report] details')
              .filter({has:page.locator('summary',{hasText:'Complete case report and source identities'})}).locator('pre').textContent());
            retainOriginalReportRecords(report);
            return {kind:'DISPLAYED_COMPARISON_REPORT',dossierId:receipt.dossierId,revision:report.revision,caseId:receipt.caseId,caseVersionId:receipt.caseVersionId,format,report};
          });
        const generation=d.generation;fail(generation?.kind==='DISPLAYED_COMPARISON_REPORT'&&generation.format===format,'Missing original browser report generation');
        retainOriginalReportRecords(generation.report);
        const expected=exportComparison(generation.report,{format}),bytes=await readFile(d.file);
        fail(d.bytes===expected.bytes&&d.sha256===expected.sha256&&bytes.equals(expected.body),'Downloaded report differs from its exact displayed generation');
        const native=receipt.files.find(x=>x.file.endsWith('comparison-report.'+format));
        fail(native,'Original pinned report file missing');
        if(generation.revision===receipt.revision)fail(d.bytes===native.bytes&&d.sha256===native.sha256,'Same-revision report differs from original native generation');
        generations.push({format,revision:generation.revision,sha256:d.sha256,originalNative:{revision:receipt.revision,bytes:native.bytes,sha256:native.sha256}});
        if(format==='json')fail(JSON.parse(bytes).measurementRows.some(x=>x.value==='1.2500'),'Original JSON metric changed');
      }
      await records('runs');
      const row=exactRow(page,receipt.runId);
      fail(await row.count()===1,'Original run row unavailable under its exact selected protocol');
      const run=await download('original-run.json',()=>exactButton(row,'Download complete original run').click());
      const native=receipt.files.find(x=>x.file.endsWith('original-run.json'));fail(run.sha256===native.sha256&&run.bytes===native.bytes,'Original run bytes changed');
      const attachment=await download('training-observations.csv',()=>exactButton(row,'Download source/training-observations.csv').click());
      const nativeAttachment=receipt.files.find(x=>x.file.endsWith('training-observations.csv'));fail(attachment.sha256===nativeAttachment.sha256,'Original member changed');
      await records('judgments');fail(await exactRow(page,receipt.judgmentVersionId).count()===1,'Historical named judgment unavailable');
      await records('decisions');fail(await exactRow(page,receipt.decisionVersionId).count()===1,'Historical named decision unavailable');
      await protocol(receipt.currentCaseVersionId);await records('runs');fail(await exactRow(page,receipt.runId).count()===0,'Historical measurement leaked into the newer protocol');
      return {allFormats:true,protocol:receipt.caseVersionId,rawRun:run.sha256,attachment:attachment.sha256,historicalJudgmentAndDecision:true,reportGenerations:generations};
    });
    await step('failed-protocol-navigation',async()=>{
      await protocol(receipt.caseVersionId);await records('runs');
      fail(await exactRow(page,receipt.runId).count()===1,'Original protocol not selected before the read interruption');
      await page.route('**/comparison?**',async route=>{
        const q=new URL(route.request().url()).searchParams;
        fail(q.get('section')==='overview'&&q.get('caseVersionId')===receipt.currentCaseVersionId,'Unexpected navigation request was intercepted');
        await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'RECEIVING_READ_INTERRUPTED'})});
      },{times:1});
      await comparison(page).getByLabel('Protocol edition',{exact:true}).selectOption(receipt.currentCaseVersionId);
      await settle(page);
      fail(await comparison(page).getByLabel('Protocol edition',{exact:true}).inputValue()===receipt.caseVersionId,'Failed navigation replaced the original protocol');
      fail(await comparison(page).getByLabel('Comparison records',{exact:true}).inputValue()==='runs'&&await exactRow(page,receipt.runId).count()===1,'Failed navigation replaced the original record page');
      await capture('desktop-failed-protocol-retained');
      await protocol(receipt.currentCaseVersionId);
      return {retainedProtocol:receipt.caseVersionId,retainedRun:receipt.runId,recoveredProtocol:receipt.currentCaseVersionId};
    });
    await step('draft-validation-reload',async(saved)=>{
      await protocol(receipt.currentCaseVersionId);
      let id=saved.draftId;
      if(!id){await click(page,'Candidate');await field(page,'name','Browser receiving '+receipt.operationId);id=await selectedDraft(page);await progress('draft-validation-reload',{draftId:id});}
      else await openDraft(page,id);
      await field(page,'actorId','comparison-browser-reviewer');await field(page,'actorName',reviewer);
      await field(page,'version','browser-1');await field(page,'description','Incomplete typed input is retained for '+receipt.operationId);
      await field(page,'configuration','{');
      await click(page,'Prepare complete request');
      fail(await form(page).locator('[name=configuration]').inputValue()==='{','Invalid complete configuration was discarded');
      await page.reload();await settle(page);await openDraft(page,id);
      fail(await form(page).locator('[name=configuration]').inputValue()==='{','Incomplete input did not survive reload');
      const savedCopy=await download('incomplete-working-copy.json',()=>exactButton(form(page),'Download complete working copy').click());
      fail(JSON.parse(await readFile(savedCopy.file,'utf8')).form.configuration==='{','Incomplete download was normalized');
      await field(page,'configuration','{"meaning":"explicit browser receiving fixture"}');
      await click(page,'Refresh saved work');await openDraft(page,id);await capture('desktop-complete-working-copy');
      return {draftId:id,incompleteRetained:true};
    });
    const mainDraft=state.steps['draft-validation-reload'].draftId;
    await step('cross-tab-draft-preservation',async()=>{
      await openDraft(page,mainDraft);
      other=await page.context().newPage();await other.goto(address(url));await settle(other);await openDraft(other,mainDraft);
      await field(page,'description','Clean remote body '+receipt.operationId);await click(page,'Refresh saved work');
      await click(other,'Refresh saved work');await openDraft(other,mainDraft);
      fail(await form(other).locator('[name=description]').inputValue()==='Clean remote body '+receipt.operationId,'Clean tab missed complete remote body');
      await field(page,'description','First tab saved '+receipt.operationId);await click(page,'Refresh saved work');
      await field(other,'description','Second tab losing body '+receipt.operationId);
      await other.waitForFunction(()=>document.body.textContent.includes('Working copy could not be saved')||document.body.textContent.includes('complete entered draft remains'));
      fail(await form(other).locator('[name=description]').inputValue()==='Second tab losing body '+receipt.operationId,'Conflicting entered text lost');
      const losing=await download('conflicting-working-copy.json',()=>exactButton(form(other),'Download complete working copy').click(),other);
      fail(JSON.parse(await readFile(losing.file,'utf8')).form.description==='Second tab losing body '+receipt.operationId,'Conflict download lost entered text');
      await exactButton(form(other),'Preserve a separate working copy').click();await settle(other);
      const separate=await selectedDraft(other);fail(separate!==mainDraft,'Conflict did not retain a separate identity');
      await capture('desktop-cross-tab-conflict-preserved',other);
      await other.close();other=null;
      return {originalDraftId:mainDraft,separateDraftId:separate,enteredTextPreserved:true};
    });
    await step('lost-reply-original-request',async(saved)=>{
      await openDraft(page,mainDraft);
      const requestDetail=form(page).locator('details').filter({has:page.locator('summary',{hasText:'Complete saved original request'})});
      let prepared=saved.request;
      if(!prepared){
        // Preparation may already have committed to IndexedDB before file progress.
        if(!await requestDetail.count())await click(page,'Prepare complete request');
        prepared=await requestFromUI(page);fail(prepared.action==='candidate.save','Unexpected prepared action');
        await retain(join(output,'original-browser-request.json'),Buffer.from(json(prepared)));
        await progress('lost-reply-original-request',{request:prepared,draftId:mainDraft});
      }else fail(JSON.stringify(await requestFromUI(page))===JSON.stringify(prepared),'Saved original request changed');
      if(!state.steps['lost-reply-original-request'].dispatchIntended){
        await progress('lost-reply-original-request',{dispatchIntended:true,request:prepared,draftId:mainDraft});
        let intercepted=null;
        const handler=async route=>{
          const body=route.request().postDataJSON();fail(JSON.stringify(body)===JSON.stringify(prepared),'Intercepted another request');
          const response=await route.fetch();intercepted={status:response.status(),body:await response.json()};
          await progress('lost-reply-original-request',{observedOriginalReturn:intercepted});
          await route.abort('failed');await progress('lost-reply-original-request',{responseInterruptionObserved:true});
        };
        await page.route('**/comparison/reviews?**',handler,{times:1});
        try{
          const apply=exactButton(form(page),'Apply or receive this original request');
          if(await apply.count())await apply.click();else await exactButton(form(page),'Receive original saved result').click();
          await settle(page);fail(intercepted&&[200,201].includes(intercepted.status),'Original interrupted POST was not accepted');
        }finally{await page.unroute('**/comparison/reviews?**',handler);}
      }
      await page.reload();await settle(page);await openDraft(page,mainDraft);
      fail(JSON.stringify(await requestFromUI(page))===JSON.stringify(prepared),'Reload replaced original request');
      const apply=exactButton(form(page),'Apply or receive this original request');
      if(await apply.count())await apply.click();else await exactButton(form(page),'Receive original saved result').click();
      await settle(page);
      const resultFromUI=async()=>JSON.parse(await form(page).locator('details').filter({has:page.locator('summary',{hasText:'Original saved result'})}).locator('pre').textContent());
      const received=await resultFromUI();
      fail(received.operation.requestId===prepared.requestId,'Original request identity changed');
      const observed=state.steps['lost-reply-original-request'].observedOriginalReturn;
      if([200,201].includes(observed?.status))fail(JSON.stringify(received.operation)===JSON.stringify(observed.body.operation),'Received original operation differs from observed return');
      await progress('lost-reply-original-request',{receivedOriginalReturn:received});
      // The pre-dispatch checkpoint can survive before any actual POST. Receive
      // that same UUID first (duplicate may be false), then prove exact replay.
      await click(page,'Receive original saved result');const replay=await resultFromUI();
      fail(replay.operation.requestId===prepared.requestId&&replay.duplicate===true&&JSON.stringify(replay.operation)===JSON.stringify(received.operation),'Same original request did not replay');
      await capture('desktop-original-request-received');
      return {request:prepared,draftId:mainDraft,receivedRequestId:replay.operation.requestId,record:replay.operation.record,duplicate:true,
        firstReceivingDuplicate:received.duplicate,responseInterruptionObserved:state.steps['lost-reply-original-request'].responseInterruptionObserved===true};
    });
    await step('phone-and-current-protocol',async()=>{
      await page.setViewportSize({width:390,height:844});await click(page,'Refresh saved work');await protocol(receipt.currentCaseVersionId);
      await click(page,'Read comparison report');await readDetails(page);await capture('phone-current-protocol-report');
      const overflow=await inspectOverflow(page);fail(overflow.length===0,'Phone control overflow: '+JSON.stringify(overflow));
      const tables=comparison(page).locator('.comparison-table');for(let i=0;i<await tables.count();i++){const t=tables.nth(i);await t.focus();await page.keyboard.press('ArrowRight');}
      await records('operations');await readDetails(page);await capture('phone-original-operations');
      await page.setViewportSize({width:1440,height:1000});
      return {width:390,controlOverflow:overflow,keyboardTablesUsed:true};
    });
    await step('browser-portable-export',async()=>{
      await page.locator('#export-open').click();await page.locator('#export-format').selectOption('json');
      const d=await download('browser-complete-dossier.json',()=>page.locator('#export-form button[type=submit]').click());
      return {descriptor:d};
    });
    const portable=state.steps['browser-portable-export'].descriptor;
    cold=await openReceived({directory:join(directory,'received-workspace'),portableFile:portable.file,operationId:receipt.operationId});
    fail(cold?.url,'Original received listener URL required');
    coldPage=await page.context().newPage();await coldPage.goto(cold.url);
    await coldPage.locator('#portable-file').setInputFiles(portable.file);
    await coldPage.waitForFunction(id=>location.hash.includes(encodeURIComponent(id))&&!document.getElementById('dossier-workspace').hidden,receipt.dossierId);
    await coldPage.locator('#comparison-tab').click();await settle(coldPage);
    await comparison(coldPage).getByLabel('Comparison case',{exact:true}).selectOption(receipt.caseId);await settle(coldPage);await protocol(receipt.currentCaseVersionId,coldPage);
    await step('cold-reopen-and-named-edit',async(saved)=>{
      await records('candidates',coldPage);await readDetails(coldPage);
      fail((await comparison(coldPage).innerText()).includes('Browser receiving '+receipt.operationId),'Received dossier lost accepted browser candidate');
      let id=saved.draftId;
      if(!id){await click(coldPage,'Decision');await field(coldPage,'title','Received workspace review '+receipt.operationId);id=await selectedDraft(coldPage);await progress('cold-reopen-and-named-edit',{draftId:id});}else await openDraft(coldPage,id);
      if(!await form(coldPage).locator('details').filter({has:coldPage.locator('summary',{hasText:'Complete saved original request'})}).count()){
        await field(coldPage,'actorId','comparison-cold-reviewer');await field(coldPage,'actorName',reviewer);
        await field(coldPage,'reviewer',reviewer);await field(coldPage,'recommendation','Retained software course only');
        await field(coldPage,'rationale','Original case, source and review history reopened. No scientific conclusion.');
        await field(coldPage,'limitations',receipt.fixture);await field(coldPage,'candidateVersionIds',state.steps['lost-reply-original-request'].record.versionId);
        await click(coldPage,'Prepare complete request');
      }
      const request=await requestFromUI(coldPage);await progress('cold-reopen-and-named-edit',{draftId:id,request});
      const apply=exactButton(form(coldPage),'Apply or receive this original request');if(await apply.count())await apply.click();else await exactButton(form(coldPage),'Receive original saved result').click();await settle(coldPage);
      await click(coldPage,'Read comparison report');await readDetails(coldPage);await capture('desktop-cold-editable-workspace',coldPage);
      await coldPage.setViewportSize({width:390,height:844});await capture('phone-cold-editable-workspace',coldPage);
      await coldPage.reload();await settle(coldPage);await records('decisions',coldPage);
      fail((await comparison(coldPage).innerText()).includes('Received workspace review '+receipt.operationId),'Cold named edit did not reopen');
      return {draftId:id,requestId:request.requestId,namedEditRetained:true};
    });
    await step('literal-file-opening',async()=>{
      const names=['original-protocol.html','original-protocol.json','original-protocol.csv','original-run.json','training-observations.csv'];
      const inspected=[];
      for(const name of names){
        const d=state.files.find(x=>x.name===name),p=await page.context().newPage();fail(d,'Missing complete file '+name);
        try{if(name.endsWith('.html'))await p.goto(pathToFileURL(d.file).href);else{const raw=await readFile(d.file,'utf8');await p.setContent('<!doctype html><html><head><meta charset="utf-8"><title>Original received file</title></head><body><h1></h1><p></p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></body></html>');await p.locator('h1').evaluate((e,v)=>e.textContent=v,name);await p.locator('p').evaluate((e,v)=>e.textContent=v,d.bytes+' bytes · SHA256 '+d.sha256+' · complete original file text');await p.locator('pre').evaluate((e,v)=>e.textContent=v,raw);}const text=await p.locator('body').innerText();fail(text.length>0,'Actual file did not render '+name);await capture('opened-'+name.replace(/\./g,'-'),p);inspected.push({name,bytes:d.bytes,sha256:d.sha256,renderedTextBytes:Buffer.byteLength(text)});}finally{await p.close();}
      }
      return {opened:inspected,portableOpenedByOriginalApplication:true};
    });
    fail(errors.length===0,'Original application JavaScript errors: '+errors.join('; '));
    state.status='COMPLETE_REQUIRES_VISUAL_INSPECTION';
    state.literalInspection={status:'AWAITING_ACTUAL_REVIEWER_VIEW',instruction:'Personally open and LOOK at every saved desktop/390px image and actual generated HTML/CSV/JSON/report. Use the original received editable dossier and inspect the full portable source/history. Record concrete findings and fixes before marking rendered readiness; screenshots alone are not completion.'};
    await save(statePath,state);await retain(join(directory,'browser-result.json'),Buffer.from(json(state)));return state;
  }catch(error){primaryError=error;try{await save(join(directory,'browser-error-'+Date.now()+'.json'),{schema:SCHEMA,operationId:receipt.operationId,message:error.message,stack:error.stack,steps:state.steps});}catch(retainError){throw new AggregateError([error,retainError],'Original browser failure and error retention failed',{cause:error});}throw error;}
  finally{page.off('pageerror',onError);const failures=[];for(const x of [other,coldPage])if(x)try{await x.close();}catch(e){failures.push(e);}if(cold?.close)try{await cold.close();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(primaryError?[primaryError,...failures]:failures,'Owned receiving pages/listener could not close',{cause:primaryError??failures[0]});}
}
