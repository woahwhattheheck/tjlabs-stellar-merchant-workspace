#!/usr/bin/env node
// MIT. Complete receiving, retained receipts, original accounting review and cold opening.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {openReceivedCustomer} from './serve_customer.mjs';

const cfg=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const output=path.resolve(cfg.output);await fs.mkdir(output,{recursive:true,mode:0o700});
const requestPath=path.join(output,'operator-input.json');
const input=JSON.stringify(cfg);
try{assert.equal(await fs.readFile(requestPath,'utf8'),input,'This operation output belongs to different inputs.');}
catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(requestPath,input,{mode:0o600,flag:'wx'});}
try{
  const retained=JSON.parse(await fs.readFile(path.join(output,'operator-result.json'),'utf8'));
  if(retained.status==='COMPLETE'&&retained.nativeOwnerClosed&&retained.browserClosed){
    for(const item of retained.downloads){const bytes=await fs.readFile(path.join(output,item.path));
      assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);}
    console.log(JSON.stringify({status:'COMPLETE',reused:true,phase:retained.phase,views:retained.views.length,downloads:retained.downloads.length}));
    process.exit(0);
  }
}catch(error){if(error.code!=='ENOENT')throw error;}
const report={schema:'stellar-forge.accounting-customer-operator.v1',operation:cfg.operation,
  phase:cfg.cold?'COLD_OPEN':'RECEIVE_AND_REVIEW',startedAt:new Date().toISOString(),status:'RUNNING',
  views:[],pageErrors:[],downloads:[],operations:[]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=async(name,value)=>fs.writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=120000){
  const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await delay(200);}
  throw new Error(label+' did not complete within the receiving interval.');
}
let app,browser;
try{
  app=await openReceivedCustomer({handover:cfg.handover,instance:cfg.instance,paused:!cfg.cold,port:0});
  async function get(route){const response=await fetch(app.url+route);const value=await response.json();
    assert.equal(response.status,200,route+': '+JSON.stringify(value));return value;}
  async function waitJob(kind,prior){
    const job=await until(async()=>{
      const state=await get('/api/maintenance'),candidate=state.jobs.find(row=>row.kind===kind&&!prior.has(row.id));
      if(!candidate)return false;if(['FAILED','CANCELLED','INTERRUPTED'].includes(candidate.status))throw new Error(JSON.stringify(candidate.error||candidate));
      return candidate.status==='COMPLETE'?candidate:false;
    },kind);
    report.operations.push(job);await write('operator-progress.json',report);return job;
  }
  const require=createRequire(import.meta.url),{chromium}=require(cfg.playwright);
  browser=await chromium.launch({executablePath:cfg.chrome,headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
  report.browserVersion=await browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push({message:error.message,url:page.url()}));
  const open=async()=>{await page.goto(app.url+'/',{waitUntil:'networkidle'});
    await page.locator('#maintenance-restore-form').waitFor({state:'attached'});await page.locator('#operator').fill(cfg.actor);};
  const picture=async(name,width)=>{
    await page.setViewportSize({width,height:width===390?844:1000});
    const result=await page.evaluate(()=>({width:innerWidth,clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,title:document.title,
      header:[...document.querySelectorAll('.topbar a')].map(a=>{const b=a.getBoundingClientRect(),h=a.closest('.topbar').getBoundingClientRect();
        return {label:a.textContent.trim(),top:b.top,bottom:b.bottom,headerTop:h.top,headerBottom:h.bottom};})}));
    assert.equal(result.width,width);assert(result.scrollWidth<=result.clientWidth+1,name+' overflows: '+JSON.stringify(result));
    for(const link of result.header)assert(link.top>=link.headerTop-1&&link.bottom<=link.headerBottom+1,name+' clips header: '+link.label);
    report.views.push({name,...result});await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
  };
  await open();
  if(!cfg.cold){
    let maintenance=await get('/api/maintenance');
    const completed=maintenance.jobs.find(job=>job.kind==='restore'&&job.status==='COMPLETE');
    if(!completed){
      assert(['PAUSED','RECOVERY_REQUIRED'].includes(maintenance.mode));assert.equal(app.binding,null);
      const instance=JSON.parse(await fs.readFile(path.join(cfg.instance,'INSTANCE.json'),'utf8'));
      const retained=maintenance.backups.find(row=>row.id==='retained-account');
      assert.equal(retained?.manifestSha256,instance.backupManifestSha256);
      await page.locator('[data-area="maintenance"]').click();
      await page.locator('#maintenance-backup-select').selectOption('retained-account');
      const beforeVerify=new Set(maintenance.jobs.map(row=>row.id));
      if(!retained.verifiedAt){await page.locator('#maintenance-verify').click();await waitJob('verify',beforeVerify);}
      await page.locator('#maintenance-restore-mode').selectOption('relocate');
      await page.locator('#maintenance-restore-workspace-id').evaluate((e,value)=>{e.closest('details').open=true;e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},instance.workspaceId);
      await page.locator('#maintenance-restore-sources-sha256').fill(instance.sourcesSha256);
      await page.locator('#maintenance-restore-writers').check();await page.locator('#maintenance-restore-confirm').check();
      assert.equal(await page.locator('#maintenance-restore').isEnabled(),true);
      await picture('original-restore-form',1440);await picture('original-restore-form',390);
      maintenance=await get('/api/maintenance');const prior=new Set(maintenance.jobs.map(row=>row.id));
      await page.locator('#maintenance-restore-form').evaluate(form=>form.requestSubmit());
      const job=await waitJob('restore',prior);assert.equal(job.result.status,'ACCOUNTING_WORKSPACE_RESTORED');
      assert.equal(job.result.relocated,true);assert.equal(job.result.binding.workspaceId,instance.workspaceId);
      assert.equal(job.result.binding.sourcesSha256,instance.sourcesSha256);report.restoreRequestId=job.id;
    }else{report.restoreRequestId=completed.id;report.operations.push(completed);}
    await page.reload({waitUntil:'networkidle'});await page.locator('#maintenance-restore-form').waitFor({state:'attached'});
    await page.locator('[data-area="maintenance"]').click();
    await page.locator('[data-maintenance-job="'+report.restoreRequestId+'"]').click();
    await page.locator('#maintenance-job-detail').waitFor({state:'visible'});
    await picture('retained-restore-receipt',1440);await picture('retained-restore-receipt',390);
    maintenance=await get('/api/maintenance');report.restoreCount=maintenance.jobs.filter(row=>row.kind==='restore').length;
    assert(maintenance.jobs.some(row=>row.id===report.restoreRequestId&&row.status==='COMPLETE'));
    if(maintenance.mode!=='RUNNING'){
      const prior=new Set(maintenance.jobs.map(row=>row.id));await page.locator('#maintenance-resume').click();await waitJob('resume',prior);
    }
    await open();
  }
  assert.equal(app.maintenance.view().mode,'RUNNING');
  const expected=JSON.parse(await fs.readFile(path.join(cfg.instance,'INSTANCE.json'),'utf8'));
  assert.equal(app.binding.workspaceId,expected.workspaceId);assert.equal(app.binding.sourcesSha256,expected.sourcesSha256);
  report.binding=app.binding;
  let state=await get('/api/state');report.before=state;await write('state-before.json',state);
  if(!cfg.cold&&cfg.captureReconciliation){
    const name=cfg.runName||'Received original account reconciliation';
    let run=state.runs.find(row=>row.name===name&&row.actor===cfg.actor);
    if(!run){
      await page.locator('[data-area="reconcile"]').click();await page.locator('#run-name').fill(name);
      await page.locator('#run-form').evaluate(form=>form.requestSubmit());
      run=await until(async()=>{const s=await get('/api/state');const r=s.runs.find(row=>row.name===name&&row.actor===cfg.actor);
        if(r&&['failed','interrupted'].includes(r.status))throw new Error(JSON.stringify(r));return r?.status==='complete'?r:false;},'Original reconciliation');
    }
    assert.equal(run.status,'complete');report.receivedRun=run;await open();
    await page.locator('[data-run="'+run.id+'"]').click();
    await page.locator('[data-area="compare"]').click();
    await page.locator('#export-run').selectOption(run.id);await page.locator('#include-sources').check();
    state=await get('/api/state');const previous=new Set(state.exports.map(row=>row.id));
    const already=state.exports.find(row=>row.runId===run.id&&row.actor===cfg.actor&&row.includeSources);
    if(already)report.reviewExport=already;
    else{
      await page.locator('#export-form').evaluate(form=>form.requestSubmit());
      report.reviewExport=await until(async()=>{const s=await get('/api/state');return s.exports.find(row=>!previous.has(row.id)&&row.runId===run.id);},'Source-inclusive review archive');
    }
  }
  await open();
  for(const area of ['reconcile','sources','pricing','collection','recovery','periods','accountant','adjustments','compare','maintenance']){
    const button=page.locator('.tabs button[data-area="'+area+'"]');
    if(!await button.isVisible())continue;
    await button.click();await page.locator('#area-'+area).waitFor({state:'visible'});
    await picture('account-'+area,1440);await picture('account-'+area,390);
  }
  for(const route of ['/connections.html','/runbooks.html','/portfolio.html','/cryptoworth.html','/delivery-notices/','/customer-statements/','/qbo.html','/xero.html','/source-changes.html','/bitwave.html']){
    const response=await page.goto(app.url+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);
    const name='desk-'+route.replace(/[^a-zA-Z0-9]/g,'-');await picture(name,1440);await picture(name,390);
  }
  state=await get('/api/state');report.after=state;await write('state-after.json',state);
  await fs.mkdir(path.join(output,'downloads'),{recursive:true,mode:0o700});
  const saveDownload=async(route,name)=>{
    const response=await fetch(app.url+route);assert.equal(response.status,200,route);
    const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(path.join(output,'downloads',name),bytes,{mode:0o600});
    report.downloads.push({path:'downloads/'+name,bytes:bytes.length,sha256:hash(bytes),route});
  };
  for(const run of state.runs.filter(row=>row.status==='complete')){
    for(const file of ['report.json','ledger.csv','options.csv','exceptions.csv','review.html','manifest.json'])
      await saveDownload('/api/runs/'+encodeURIComponent(run.id)+'/download/'+file,run.id+'-'+file);
  }
  for(const item of state.exports)await saveDownload('/api/exports/'+encodeURIComponent(item.id)+'/download',item.id+'.tar');
  report.maintenance=await get('/api/maintenance');await write('maintenance.json',report.maintenance);
  assert.equal(report.pageErrors.length,0,JSON.stringify(report.pageErrors));
  report.status='COMPLETE';
}catch(error){report.status='FAILED';report.error={name:error.name,message:error.message,code:error.code};process.exitCode=1;
}finally{
  if(browser){await browser.close();report.browserClosed=true;}
  if(app){await app.close();report.nativeOwnerClosed=true;}
  report.finishedAt=new Date().toISOString();await write('operator-result.json',report);
  console.log(JSON.stringify({status:report.status,phase:report.phase,views:report.views.length,
    downloads:report.downloads.length,pageErrors:report.pageErrors.length,browserClosed:report.browserClosed,
    nativeOwnerClosed:report.nativeOwnerClosed,error:report.error}));
}
