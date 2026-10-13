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


function originalOutputFixture(receipt,run,protocol,descriptors){
  fail(run.kind==='TRAINING_FIXTURE'&&run.engine?.runtime?.actualExecution===false,'Only the retained explicit software fixture is used by this course');
  fail(run.metrics.length===2&&run.metrics[0].value==='1.2500'&&run.metrics[1].value===null,'Original training metrics changed');
  const headers=['metric_id','criterion_id','label','value','unit','definition','cohort','denominator_json','undefined_reason'];
  const rows=run.metrics.map(m=>[m.id,m.criterionId,m.label,m.value??'',m.unit,m.definition,m.cohortRef,JSON.stringify(m.denominator),m.undefinedReason]);
  const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
  const table=[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  const plan={schema:'sf88-original-output-plan/v1',source:{file:'table.csv',...descriptors.table},
    originals:[
      {id:'fixture-native-run',file:'original-run.json',path:'original/native-run.json',role:'complete original software fixture run',mediaType:'application/json',...descriptors.run},
      {id:'fixture-observations',file:'training-observations.csv',path:'original/training-observations.csv',role:'complete original software fixture observations',mediaType:'text/csv',...descriptors.observations}
    ],
    protocol:JSON.parse(JSON.stringify(protocol)),
    candidate:{name:'Original-output receiving '+receipt.operationId,kind:'MODEL',version:'desk-fixture-1',
      description:receipt.fixture+'; original-output desk receiving only',configuration:{meaning:receipt.fixture,originalRunSha256:descriptors.run.sha256},sourceRefs:run.input.sourceRefs},
    run:Object.fromEntries(['externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','limitations'].map(k=>[k,JSON.parse(JSON.stringify(run[k]))])),
    mapping:{delimiter:',',rowKeyColumns:['metric_id'],selection:[],exclude:[],
      fields:Object.fromEntries(Object.entries({criterionId:'criterion_id',label:'label',value:'value',unit:'unit',definition:'definition',cohortRef:'cohort'}).map(([key,column])=>[key,{column}])),
      denominator:{originalDenominatorJson:{column:'denominator_json'}},missingTokens:[''],missingReason:{column:'undefined_reason'}}};
  plan.run.externalRunId=run.externalRunId+'-browser-output';
  plan.run.limitations=[...plan.run.limitations,'The receiving table transcribes the two literal original fixture metrics. Complete original denominators remain JSON text; no metric is recalculated.'];
  return{table,plan,headers,rows};
}

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
  if(state.status==='COMPLETE_REQUIRES_VISUAL_INSPECTION'){fail(state.steps['output-desk-cold-originals']?.complete,'An earlier completed browser edition is preserved; select an explicit reviewed following source/course before adding the original-output desk');await retain(join(directory,'browser-result.json'),Buffer.from(json(state)));return state;}
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

    // Same dossier and browser lifetime: exercise the complete original-output desk.
    // The table transcribes the already retained software fixture; it is not a model run.
    const desk=p=>comparison(p).locator('.output-desk');
    async function settleDesk(p=page){
      await settle(p);await p.waitForFunction(()=>{const d=document.querySelector('#view-comparison .output-desk');return d&&d.getAttribute('aria-busy')==='false'&&d.querySelector('[aria-label="Saved original-output working copies"]');});
    }
    async function deskClick(name,p=page){await exactButton(desk(p),name).click();await settleDesk(p);}
    async function deskRead(id,p=page){
      return p.evaluate(async id=>{
        const {openProtocolDraftStore}=await import('/study-protocol-storage.js');
        const db=await openProtocolDraftStore({databaseName:'sf88-original-output-drafts'});
        try{return(await db.read(id))?.snapshot??null;}finally{db.close();}
      },id);
    }
    async function deskCurrent(p=page){
      const id=await desk(p).getByLabel('Saved original-output working copies',{exact:true}).inputValue();
      fail(id,'No original-output working copy selected');const d=await deskRead(id,p);
      fail(d?.schema==='sf88-original-output-browser/v1'&&d.dossierId===receipt.dossierId&&d.caseId===receipt.caseId&&d.caseVersionId===receipt.caseVersionId,'Wrong original-output working copy');
      return d;
    }
    async function deskOpen(id,p=page){
      await desk(p).getByLabel('Saved original-output working copies',{exact:true}).selectOption(id);await settleDesk(p);
      fail((await deskCurrent(p)).id===id,'Original output working copy selection changed');
    }
    async function deskCopies(p=page){
      return desk(p).getByLabel('Saved original-output working copies',{exact:true}).locator('option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean));
    }
    async function deskWorking(name,p=page){
      const d=await download(name,()=>exactButton(desk(p),'Download complete working copy').click(),p,
        async()=>{const w=await deskCurrent(p);return{kind:'ORIGINAL_OUTPUT_WORKING_COPY',draftId:w.id,commitId:w.commitId,caseVersionId:w.caseVersionId};});
      const value=JSON.parse(await readFile(d.file,'utf8'));
      fail(value.schema==='sf88-original-output-working-copy-file/v1'&&value.workingCopy.id===d.generation.draftId&&value.workingCopy.commitId===d.generation.commitId,'Downloaded working-copy generation changed');
      for(const f of value.files){const b=Buffer.from(f.bodyBase64,'base64');fail(b.length===f.bytes&&sha(b)===f.sha256,'Complete downloaded working-copy source changed');}
      for(const f of value.workingCopy.files)fail(value.files.some(x=>x.id===f.id&&x.bytes===f.bytes&&x.sha256===f.sha256),'Downloaded working copy omitted an original file');
      return{descriptor:d,value};
    }
    async function reopenDeskWorking(phase,descriptor,expectedId,p=page){
      const incoming=JSON.parse(await readFile(descriptor.file,'utf8')).workingCopy;
      const semantic=d=>{const value=JSON.parse(JSON.stringify(d));delete value.commitId;delete value.updatedAt;const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;return canonical(value);};
      let current=await deskCurrent(p),checkpoint=state.steps[phase]?.workingCopyReopen;
      fail(current.id===expectedId&&JSON.stringify(semantic(current))===JSON.stringify(semantic(incoming)),'Visible working copy changed before its retained-file reopen');
      if(!checkpoint){
        checkpoint={file:descriptor.file,bytes:descriptor.bytes,sha256:descriptor.sha256,draftId:expectedId,beforeCommit:current.commitId};
        await progress(phase,{workingCopyReopen:checkpoint});
      }
      fail(checkpoint.file===descriptor.file&&checkpoint.sha256===descriptor.sha256&&checkpoint.draftId===expectedId,'Original working-copy reopen selection changed');
      if(!checkpoint.observedCommit&&current.commitId===checkpoint.beforeCommit){
        await desk(p).getByLabel('Open complete output working copy',{exact:true}).setInputFiles(descriptor.file);await settleDesk(p);
        current=await deskCurrent(p);
        fail(current.id===expectedId&&JSON.stringify(semantic(current))===JSON.stringify(semantic(incoming)),'Working-copy import changed original source, draft basis or requests');
        checkpoint={...checkpoint,observedCommit:current.commitId,actualUiReturnObserved:true};
        await progress(phase,{workingCopyReopen:checkpoint});
      }else if(!checkpoint.observedCommit){
        // The source-owned import rewrites only commit/time for an identical
        // existing draft. Recover that exact durable successor after a lost return.
        checkpoint={...checkpoint,observedCommit:current.commitId,actualUiReturnObserved:false,recoveredSameBody:true};
        await progress(phase,{workingCopyReopen:checkpoint});
      }
      fail(current.commitId===checkpoint.observedCommit,'Imported working copy advanced again; inspect its retained draft before continuing');
      return current;
    }
    async function keepInput(name,body){
      const item={name,...await retain(join(output,name),body)};
      const saved=state.files.find(x=>x.name===name);
      if(saved)fail(saved.bytes===item.bytes&&saved.sha256===item.sha256,'Original-output input changed');
      else{state.files.push(item);await save(statePath,state);}
      return item;
    }
    const outputInputs=await step('output-fixture-originals',async()=>{
      const rawFile=receipt.files.find(f=>f.file.endsWith('original-run.json'));
      const observationsFile=receipt.files.find(f=>f.file.endsWith('training-observations.csv'));
      const reportFile=receipt.files.find(f=>f.file.endsWith('comparison-report.json'));
      fail(rawFile&&observationsFile&&reportFile,'Original software receiving files are required');
      const raw=await readFile(rawFile.file),observations=await readFile(observationsFile.file),reportBytes=await readFile(reportFile.file);
      fail(reportBytes.length===reportFile.bytes&&sha(reportBytes)===reportFile.sha256,'Original native fixture report changed');
      const report=JSON.parse(reportBytes);
      fail(raw.length===rawFile.bytes&&sha(raw)===rawFile.sha256&&observations.length===observationsFile.bytes&&sha(observations)===observationsFile.sha256,'Original native fixture bytes changed');
      const run=JSON.parse(raw),descriptors={table:{bytes:0,sha256:''},run:{bytes:raw.length,sha256:sha(raw)},observations:{bytes:observations.length,sha256:sha(observations)}};
      const first=originalOutputFixture(receipt,run,report.case.definition,descriptors),table=Buffer.from(first.table);
      descriptors.table={bytes:table.length,sha256:sha(table)};
      const selected=originalOutputFixture(receipt,run,report.case.definition,descriptors);
      fail(selected.table===first.table,'Original fixture table generation changed');
      const files={
        table:await keepInput('desk-fixture-metrics.csv',table),
        run:await keepInput('desk-fixture-original-run.json',raw),
        observations:await keepInput('desk-fixture-observations.csv',observations),
        plan:await keepInput('desk-fixture-plan.json',Buffer.from(json(selected.plan)))
      };
      return{files,sourceRun:rawFile,sourceObservations:observationsFile,sourceReport:reportFile,fixture:receipt.fixture,metricIds:run.metrics.map(m=>m.id)};
    });
    const outputFiles=outputInputs.files;
    await protocol(receipt.caseVersionId);await settleDesk();
    const intake=await step('output-desk-source-and-plan',async(saved)=>{
      let draftId=saved.draftId;
      if(!draftId){
        if(!saved.beforeIds){await progress('output-desk-source-and-plan',{beforeIds:await deskCopies()});saved=state.steps['output-desk-source-and-plan'];}
        let added=(await deskCopies()).filter(id=>!saved.beforeIds.includes(id));
        fail(added.length<=1,'Another original-output working copy appeared during initial preparation; inspect it before continuing');
        if(!added.length){await deskClick('New original output');added=(await deskCopies()).filter(id=>!saved.beforeIds.includes(id));}
        fail(added.length===1,'Original new output working-copy identity unavailable');
        draftId=added[0];await progress('output-desk-source-and-plan',{draftId});
      }
      await deskOpen(draftId);let d=await deskCurrent();
      const matches=(f,x)=>f.bytes===x.bytes&&f.sha256===x.sha256;
      if(!d.files.some(f=>matches(f,outputFiles.table))){
        await desk(page).getByLabel('Select original output table',{exact:true}).setInputFiles({name:'table.csv',mimeType:'text/csv',buffer:await readFile(outputFiles.table.file)});await settleDesk();d=await deskCurrent();
      }
      const additions=[];
      for(const [key,name,mimeType]of [['run','original-run.json','application/json'],['observations','training-observations.csv','text/csv']]){
        if(!d.files.some(f=>matches(f,outputFiles[key])))additions.push({name,mimeType,buffer:await readFile(outputFiles[key].file)});
      }
      if(additions.length){await desk(page).getByLabel('Add original workbooks, reports or logs',{exact:true}).setInputFiles(additions);await settleDesk();d=await deskCurrent();}
      if(!d.files.some(f=>matches(f,outputFiles.plan))){
        await desk(page).getByLabel('Open existing complete preparation plan',{exact:true}).setInputFiles({name:'desk-fixture-plan.json',mimeType:'application/json',buffer:await readFile(outputFiles.plan.file)});await settleDesk();
      }
      await desk(page).getByLabel('Operator identifier',{exact:true}).fill('comparison-output-reviewer');
      await desk(page).getByLabel('Operator name',{exact:true}).fill(reviewer);
      // Operate the actual typed mapping control; the original exact column is retained.
      await desk(page).getByLabel('Original numeric value',{exact:true}).selectOption('value');
      await deskClick('Reopen saved browser work');d=await deskCurrent();
      fail(d.table.rows.length===2&&d.plan.mapping.rowKeyColumns.join(',')==='metric_id'&&d.plan.mapping.fields.value.column==='value','Original complete table or typed mapping changed');
      fail(d.plan.run.kind==='TRAINING_FIXTURE'&&d.plan.run.engine.runtime.actualExecution===false,'Software fixture was presented as actual model execution');
      for(const x of Object.values(outputFiles))fail(d.files.some(f=>matches(f,x)),'An original fixture file was not selected');
      fail(d.files.length===4,'Unexpected source file entered the original preparation');
      await capture('desktop-original-output-source-mapping');
      return{draftId,sourceFiles:d.files,rows:d.table.rows.length,caseVersionId:d.caseVersionId,expectedRevision:d.expectedRevision};
    });
    const outputDraft=intake.draftId;
    await deskOpen(outputDraft);
    await step('output-desk-reviewed-exclusion',async()=>{
      let d=await deskCurrent();
      if(!d.plan.mapping.exclude.some(e=>e.key[0]==='undefined-ratio')){
        await exactButton(desk(page),'Review exclusion for row 2').click();
        const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Review original row 2',exact:true})});await dialog.waitFor();
        await dialog.getByLabel('Exclusion reason',{exact:true}).fill('Temporary software receiving review: exclude this fixture row, retain the complete original, then explicitly restore it before final import.');
        await dialog.getByLabel('Actual reviewer',{exact:true}).fill(reviewer);
        await exactButton(dialog,'Retain this reviewed exclusion').click();await settleDesk();d=await deskCurrent();
      }
      const exclusion=d.plan.mapping.exclude.find(e=>e.key[0]==='undefined-ratio');fail(exclusion?.reviewer===reviewer,'Named reviewed exclusion missing');
      let prepared=d.preparation?(await deskRead(d.preparation))?.value:null;
      if(prepared?.review.coverage.excludedByReview!==1){await deskClick('Prepare and review complete output');d=await deskCurrent();prepared=(await deskRead(d.preparation)).value;}
      fail(prepared.review.status==='READY'&&prepared.review.coverage.sourceRows===2&&prepared.review.coverage.excludedByReview===1&&prepared.review.coverage.selectedValues===1,'Reviewed exclusion lost complete row accounting');
      const review=await download('desk-excluded-row-review.json',()=>exactButton(desk(page),'Download full mapping review').click(),page,
        async()=>({kind:'ORIGINAL_OUTPUT_REVIEW',preparationId:(await deskCurrent()).preparation}));
      fail(JSON.stringify(JSON.parse(await readFile(review.file,'utf8')))===JSON.stringify(prepared.review),'Complete excluded-row review download changed');
      await capture('desktop-original-output-reviewed-exclusion');
      return{exclusion,review,coverage:prepared.review.coverage};
    });
    await step('output-desk-complete-preparation',async()=>{
      let d=await deskCurrent();
      if(d.plan.mapping.exclude.some(e=>e.key[0]==='undefined-ratio'))await deskClick('Remove reviewed exclusion undefined-ratio');
      d=await deskCurrent();let prepared=d.preparation?(await deskRead(d.preparation))?.value:null;
      if(!prepared||prepared.review.coverage.selectedUndefined!==1||prepared.review.coverage.excludedByReview!==0){
        await deskClick('Prepare and review complete output');d=await deskCurrent();prepared=(await deskRead(d.preparation)).value;
      }
      fail(prepared.review.status==='READY'&&prepared.review.coverage.sourceRows===2&&prepared.review.coverage.selectedValues===1&&prepared.review.coverage.selectedUndefined===1&&prepared.review.coverage.excludedByReview===0&&prepared.review.coverage.reviewRequired===0,'Final complete fixture coverage changed');
      const run=JSON.parse(prepared.rawText);
      fail(run.metrics[0].value==='1.2500'&&run.metrics[1].value===null&&run.metrics[1].undefinedReason.includes('deliberately zero'),'Exact numeric text or unavailable meaning lost');
      const native=JSON.parse(await readFile(outputFiles.run.file,'utf8'));
      for(let i=0;i<native.metrics.length;i++)fail(run.metrics[i].denominator.originalDenominatorJson===JSON.stringify(native.metrics[i].denominator),'Complete original denominator text changed');
      const mapped=await download('desk-complete-mapping-review.json',()=>exactButton(desk(page),'Download full mapping review').click(),page,
        async()=>({kind:'ORIGINAL_OUTPUT_REVIEW',preparationId:(await deskCurrent()).preparation}));
      fail(JSON.stringify(JSON.parse(await readFile(mapped.file,'utf8')))===JSON.stringify(prepared.review),'Complete final mapping review differs');
      const raw=await download('desk-prepared-complete-run.json',()=>exactButton(desk(page),'Download prepared complete run').click(),page,
        async()=>({kind:'PREPARED_ORIGINAL_OUTPUT',preparationId:(await deskCurrent()).preparation,rawIdentity:prepared.rawIdentity}));
      fail(raw.sha256===prepared.rawIdentity.sha256&&raw.bytes===prepared.rawIdentity.bytes,'Prepared run download differs from complete original preparation');
      const plan=await download('desk-selected-plan.json',()=>exactButton(desk(page),'Download selected plan').click(),page,
        async()=>({kind:'SELECTED_ORIGINAL_OUTPUT_PLAN',preparationId:(await deskCurrent()).preparation,planSha256:prepared.planSha256}));
      fail(plan.sha256===prepared.planSha256,'Downloaded selected plan changed');
      const copy=await deskWorking('desk-prepared-working-copy.json');
      await capture('desktop-original-output-complete-review');
      return{draftId:outputDraft,preparationId:d.preparation,rawIdentity:prepared.rawIdentity,mapped,raw,plan,workingCopy:copy.descriptor,coverage:prepared.review.coverage};
    });
    await step('output-desk-working-copy-reopen',async()=>{
      const prior=state.steps['output-desk-complete-preparation'];
      const d=await reopenDeskWorking('output-desk-working-copy-reopen',prior.workingCopy,outputDraft);fail(d.id===outputDraft&&d.preparation===prior.preparationId&&d.attempts.length===0,'Prepared complete working copy did not reopen under its original identity');
      await page.reload();await settleDesk();await protocol(receipt.caseVersionId);await settleDesk();await deskOpen(outputDraft);
      const reopened=await deskCurrent(),prepared=(await deskRead(reopened.preparation)).value;
      fail(prepared.rawIdentity.sha256===prior.rawIdentity.sha256&&reopened.files.length===4,'Reload lost complete original file/preparation selection');
      await page.setViewportSize({width:390,height:844});await capture('phone-original-output-prepared');
      fail((await inspectOverflow(page)).length===0,'Original-output phone controls overflow');
      await page.setViewportSize({width:1440,height:1000});
      return{draftId:outputDraft,preparationId:reopened.preparation,sourceFiles:reopened.files};
    });
    async function receiveDeskPhase(phase){
      const name='output-desk-'+phase+'-request';
      return step(name,async saved=>{
        await protocol(receipt.caseVersionId);await settleDesk();await deskOpen(outputDraft);
        let d=await deskCurrent(),attempt=d.attempts.find(a=>a.phase===phase&&!a.superseded);
        fail(d.attempts.filter(a=>a.phase===phase&&!a.superseded).length<=1,'Original course has multiple active output requests');
        if(!attempt){await deskClick(phase==='candidate'?'Freeze and prepare candidate request':'Prepare original output import');d=await deskCurrent();attempt=d.attempts.find(a=>a.phase===phase&&!a.superseded);}
        fail(attempt,'Original output request was not durably prepared');
        const request=(await deskRead(attempt.command)).value;
        fail(request.requestId===attempt.id&&request.action===(phase==='candidate'?'candidate.save':'run.import')&&request.payload.caseId===receipt.caseId&&request.payload.caseVersionId===receipt.caseVersionId,'Wrong original output request');
        if(saved.request)fail(JSON.stringify(saved.request)===JSON.stringify(request),'Original output request changed after restart');
        await keepInput('desk-'+phase+'-request.json',Buffer.from(json(request)));
        await progress(name,{request,draftId:outputDraft});
        const frozen=await deskWorking('desk-frozen-'+phase+'-working-copy.json');
        fail(frozen.value.records[attempt.command]?.requestId===request.requestId,'Frozen download omitted the original request');
        let observed=state.steps[name].observedOriginalReturn;
        // Candidate phase deliberately loses its first accepted response. The
        // intention may survive before POST; observed provider returns are separate.
        if(!attempt.receipt&&!state.steps[name].dispatchIntended){
          await progress(name,{dispatchIntended:true});
          const handler=async route=>{
            fail(JSON.stringify(route.request().postDataJSON())===JSON.stringify(request),'Another output request reached the receiving interceptor');
            const response=await route.fetch();observed={status:response.status(),body:await response.json()};
            await progress(name,{observedOriginalReturn:observed});
            if(phase==='candidate'){await route.abort('failed');await progress(name,{responseInterruptionObserved:true});}
            else await route.fulfill({response});
          };
          await page.route('**/comparison/reviews?**',handler,{times:1});
          try{await deskClick('Apply or receive original '+phase);fail(observed&&[200,201].includes(observed.status),'Original output request was not accepted');}
          finally{await page.unroute('**/comparison/reviews?**',handler);}
        }
        d=await deskCurrent();attempt=d.attempts.find(a=>a.id===request.requestId);
        if(!attempt.receipt){
          await page.reload();await settleDesk();await protocol(receipt.caseVersionId);await settleDesk();await deskOpen(outputDraft);
          const retained=(await deskRead(attempt.command)).value;fail(JSON.stringify(retained)===JSON.stringify(request),'Reload replaced the exact original output request');
          await deskClick('Apply or receive original '+phase);d=await deskCurrent();attempt=d.attempts.find(a=>a.id===request.requestId);
        }
        fail(attempt?.receipt,'Original output acceptance receipt is missing');
        const operation=(await deskRead(attempt.receipt)).value;
        fail(operation.requestId===request.requestId&&operation.action===request.action,'Output receipt does not match its original request');
        observed=state.steps[name].observedOriginalReturn;
        if([200,201].includes(observed?.status))fail(JSON.stringify(operation)===JSON.stringify(observed.body.operation),'Received output operation differs from the observed original return');
        const complete=await deskWorking('desk-accepted-'+phase+'-working-copy.json');
        // Read-only preparation + original-request lookup verify accepted working
        // copies in the SAME workspace; they do not rebind browser storage.
        const reopened=await reopenDeskWorking(name,complete.descriptor,outputDraft),reopenedAttempt=reopened.attempts.find(a=>a.id===request.requestId);
        fail(reopened.id===outputDraft&&reopenedAttempt?.receipt&&JSON.stringify((await deskRead(reopenedAttempt.receipt)).value)===JSON.stringify(operation),'Accepted working-copy reopen lost original command/result');
        await capture('desktop-original-output-'+phase+'-received');
        return{request,record:operation.record,operation,workingCopy:complete.descriptor,observedHttpStatus:observed?.status??null,responseInterruptionObserved:state.steps[name].responseInterruptionObserved===true};
      });
    }
    await receiveDeskPhase('candidate');await receiveDeskPhase('run');
    const outputRun=state.steps['output-desk-run-request'].record;
    await step('output-desk-accepted-files',async()=>{
      await protocol(receipt.caseVersionId);await records('runs');const row=exactRow(page,outputRun.id);
      fail(await row.count()===1,'Accepted output run is absent from its original protocol');
      const raw=await download('desk-accepted-original-run.json',()=>exactButton(row,'Download complete original run').click());
      const expected=state.steps['output-desk-complete-preparation'].rawIdentity;
      fail(raw.bytes===expected.bytes&&raw.sha256===expected.sha256,'Accepted run differs from its original prepared complete bytes');
      const model=JSON.parse(await readFile(raw.file,'utf8')),members=[];
      for(let i=0;i<model.artifacts.length;i++){
        const a=model.artifacts[i],d=await download('desk-original-member-'+String(i+1).padStart(2,'0')+'.bin',()=>exactButton(row,'Download '+a.path).click());
        fail(d.bytes===a.bytes&&d.sha256===a.sha256&&Buffer.from(a.bodyBase64,'base64').equals(await readFile(d.file)),'Accepted complete original member changed: '+a.path);
        members.push({path:a.path,mediaType:a.mediaType,...d});
      }
      const reports=[];
      for(const format of ['html','json','csv']){
        const item=await download('desk-accepted-report.'+format,()=>exactButton(comparison(page),'Download '+format.toUpperCase()).click(),page,async()=>{
          await click(page,'Read comparison report');const report=JSON.parse(await comparison(page).locator('[data-comparison-report] details').filter({has:page.locator('summary',{hasText:'Complete case report and source identities'})}).locator('pre').textContent());
          fail(report.case.versionId===receipt.caseVersionId&&report.runs.some(r=>r.id===outputRun.id),'Current report omitted the accepted original output');
          return{kind:'DISPLAYED_COMPARISON_REPORT',format,report};
        });
        const generated=exportComparison(item.generation.report,{format});
        fail(item.bytes===generated.bytes&&item.sha256===generated.sha256,'Accepted output report download differs from its bound full model');
        reports.push(item);
      }
      await page.setViewportSize({width:390,height:844});await records('runs');await capture('phone-original-output-accepted-run');
      fail((await inspectOverflow(page)).length===0,'Accepted output phone controls overflow');await page.setViewportSize({width:1440,height:1000});
      return{runId:outputRun.id,raw,members,reports};
    });

    await step('output-desk-portable-export',async()=>{
      // Keep any earlier completed original portable generation. This separately
      // named continuation includes the accepted desk candidate and original run.
      await page.locator('#export-open').click();await page.locator('#export-format').selectOption('json');
      const d=await download('desk-complete-dossier.json',()=>page.locator('#export-form button[type=submit]').click(),page,
        async()=>({kind:'ORIGINAL_OUTPUT_DOSSIER_CONTINUATION',dossierId:receipt.dossierId,runId:outputRun.id,candidateVersionId:state.steps['output-desk-candidate-request'].record.versionId,
          originalPortable:state.steps['browser-portable-export'].descriptor.sha256}));
      return{descriptor:d,originalPortable:state.steps['browser-portable-export'].descriptor};
    });
    const portable=state.steps['output-desk-portable-export'].descriptor;
    cold=await openReceived({directory:join(directory,'received-workspace'),portableFile:portable.file,operationId:receipt.operationId});
    fail(cold?.url,'Original received listener URL required');
    coldPage=await page.context().newPage();await coldPage.goto(cold.url);
    await coldPage.locator('#portable-file').setInputFiles(portable.file);
    await coldPage.waitForFunction(id=>location.hash.includes(encodeURIComponent(id))&&!document.getElementById('dossier-workspace').hidden,receipt.dossierId);
    await coldPage.locator('#comparison-tab').click();await settle(coldPage);
    await comparison(coldPage).getByLabel('Comparison case',{exact:true}).selectOption(receipt.caseId);await settle(coldPage);await protocol(receipt.currentCaseVersionId,coldPage);

    await step('output-desk-cold-originals',async()=>{
      await protocol(receipt.caseVersionId,coldPage);await records('runs',coldPage);
      const row=exactRow(coldPage,outputRun.id);fail(await row.count()===1,'Cold dossier omitted the accepted desk run');
      const raw=await download('desk-cold-original-run.json',()=>exactButton(row,'Download complete original run').click(),coldPage);
      const original=state.steps['output-desk-accepted-files'];
      fail(raw.bytes===original.raw.bytes&&raw.sha256===original.raw.sha256,'Cold original output run changed');
      const model=JSON.parse(await readFile(raw.file,'utf8')),members=[];
      for(let i=0;i<model.artifacts.length;i++){
        const a=model.artifacts[i],d=await download('desk-cold-member-'+String(i+1).padStart(2,'0')+'.bin',()=>exactButton(row,'Download '+a.path).click(),coldPage);
        fail(d.bytes===a.bytes&&d.sha256===a.sha256&&d.sha256===original.members[i].sha256,'Cold original output member changed: '+a.path);
        members.push({path:a.path,mediaType:a.mediaType,...d});
      }
      await click(coldPage,'Read comparison report');await readDetails(coldPage);
      const report=JSON.parse(await comparison(coldPage).locator('[data-comparison-report] details').filter({has:coldPage.locator('summary',{hasText:'Complete case report and source identities'})}).locator('pre').textContent());
      fail(report.runs.some(r=>r.id===outputRun.id)&&report.candidateEditions.some(r=>r.versionId===state.steps['output-desk-candidate-request'].record.versionId),'Cold source/protocol/candidate lineage changed');
      for(const phase of ['candidate','run'])fail(report.operations.some(o=>JSON.stringify(o)===JSON.stringify(state.steps['output-desk-'+phase+'-request'].operation)),'Cold original command receipt changed: '+phase);
      await capture('desktop-cold-original-output-report',coldPage);
      await coldPage.setViewportSize({width:390,height:844});await capture('phone-cold-original-output-report',coldPage);
      fail((await inspectOverflow(coldPage)).length===0,'Cold original-output controls overflow');await coldPage.setViewportSize({width:1440,height:1000});
      await protocol(receipt.currentCaseVersionId,coldPage);await records('runs',coldPage);
      fail(await exactRow(coldPage,outputRun.id).count()===0,'Cold desk run leaked across protocol editions');
      return{runId:outputRun.id,raw,members,caseVersionId:receipt.caseVersionId,workingCopyScope:'Original workspace only; accepted native records travel through the complete dossier'};
    });

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

    await step('output-desk-literal-file-opening',async()=>{
      const files=state.files.filter(f=>f.name?.startsWith('desk-')),opened=[];
      for(const d of files){
        const p=await page.context().newPage();
        try{
          if(d.name.endsWith('.html'))await p.goto(pathToFileURL(d.file).href);
          else{
            const bytes=await readFile(d.file),raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
            await p.setContent('<!doctype html><html><head><meta charset="utf-8"><title>Original output receiving file</title></head><body><h1></h1><p></p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></body></html>');
            await p.locator('h1').evaluate((e,v)=>e.textContent=v,d.name);
            await p.locator('p').evaluate((e,v)=>e.textContent=v,d.bytes+' bytes · SHA256 '+d.sha256+' · complete retained software fixture file');
            await p.locator('pre').evaluate((e,v)=>e.textContent=v,raw);
          }
          const text=await p.locator('body').innerText();fail(text.length>0,'Original desk file did not render: '+d.name);
          await capture('opened-'+d.name.replace(/\./g,'-'),p);opened.push({name:d.name,bytes:d.bytes,sha256:d.sha256,renderedTextBytes:Buffer.byteLength(text)});
        }finally{await p.close();}
      }
      return{opened,completePortableReceived:true,note:'JSON/CSV/member downloads are fully opened as text; HTML is rendered. Actual human LOOK/USE remains required.'};
    });

    fail(errors.length===0,'Original application JavaScript errors: '+errors.join('; '));
    state.status='COMPLETE_REQUIRES_VISUAL_INSPECTION';
    state.literalInspection={status:'AWAITING_ACTUAL_REVIEWER_VIEW',instruction:'Personally open and LOOK at every saved desktop/390px image and actual generated HTML/CSV/JSON/report. Use the original received editable dossier and inspect the full portable source/history. Record concrete findings and fixes before marking rendered readiness; screenshots alone are not completion.'};
    await save(statePath,state);await retain(join(directory,'browser-result.json'),Buffer.from(json(state)));return state;
  }catch(error){primaryError=error;try{await save(join(directory,'browser-error-'+Date.now()+'.json'),{schema:SCHEMA,operationId:receipt.operationId,message:error.message,stack:error.stack,steps:state.steps});}catch(retainError){throw new AggregateError([error,retainError],'Original browser failure and error retention failed',{cause:error});}throw error;}
  finally{page.off('pageerror',onError);const failures=[];for(const x of [other,coldPage])if(x)try{await x.close();}catch(e){failures.push(e);}if(cold?.close)try{await cold.close();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(primaryError?[primaryError,...failures]:failures,'Owned receiving pages/listener could not close',{cause:primaryError??failures[0]});}
}
