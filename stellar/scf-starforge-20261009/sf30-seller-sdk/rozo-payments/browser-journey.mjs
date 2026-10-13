import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, jsonDigest, assert } from './model.mjs';
import { hashOriginalFile } from './delivery.mjs';
import { saveNative } from './native-fixture.mjs';

const VIEWS=['Overview','Orders','Payments','Source capture','Reports','Requests','Workspace'];
export async function runRozoBrowser({directory,startup,chromium,playwrightModule,profileId='merchant',orderId='merchant-order',reports=[],workspace}){
  assert(chromium&&playwrightModule,'BROWSER_RUNTIME','Supply the actual Chromium executable and original Playwright module.',409);
  mkdirSync(directory,{recursive:true,mode:0o700});const progressFile=join(directory,'BROWSER_PROGRESS.json');
  let progress=existsSync(progressFile)?JSON.parse(readFileSync(progressFile)):{schema:'stellar-forge.rozo-native-browser-progress.v1',workspaceId:startup.workspaceId,steps:{},files:[]};
  assert(progress.workspaceId===startup.workspaceId,'BROWSER_CASE','Continue the original saved browser case.',409);
  const save=()=>saveNative(progressFile,progress),mod=await import(pathToFileURL(playwrightModule)),pw=mod.chromium?mod:mod.default;
  assert(pw?.chromium,'BROWSER_RUNTIME','The original Playwright module has no Chromium export.');
  const browser=await pw.chromium.launch({executablePath:chromium,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const api=async(path)=>{const r=await fetch(startup.origin+path,{headers:{'X-Rozo-Session':startup.sessionToken}}),v=await r.json();assert(r.ok,'BROWSER_API','The original native read failed.',500,v);return v;};
  const nav=async name=>{await page.locator('#navigation button').filter({hasText:new RegExp(name+'$')}).click();await page.waitForFunction(title=>document.getElementById('page-title')?.textContent===title,name);};
  const select=async()=>{await page.selectOption('#profile',profileId);await page.waitForFunction(label=>document.getElementById('workspace-label')?.textContent.startsWith(label),workspace.get('profile',profileId).value.label);};
  const shot=async name=>{const path=join(directory,name),known=progress.files.find(f=>f.name===name);if(known){const got=hashOriginalFile(path);assert(got.sha256===known.sha256&&got.bytes===known.bytes,'BROWSER_ARTIFACT','The retained screenshot differs.');return {path,...got};}await page.screenshot({path,fullPage:true});const original=hashOriginalFile(path);if(!progress.files.some(f=>f.name===name)){progress.files.push({name,...original});save();}return {path,...original};};
  try{
    await page.goto(startup.url,{waitUntil:'networkidle'});await page.waitForSelector('#navigation button');await select();
    if(!progress.steps.views){
      for(const view of VIEWS){await nav(view);assert((await page.locator('#page').innerText()).trim().length>20,'BROWSER_VIEW','A complete staff view did not render: '+view);}
      progress.steps.views={views:VIEWS,at:new Date().toISOString()};save();
    }
    await nav('Orders');
    const originalRow=()=>page.locator('#page tbody tr').filter({hasText:'native-merchant-order'});
    if(!progress.editRequest){
      await originalRow().getByRole('button',{name:'Edit',exact:true}).click();
      await page.locator('#dialog input[name=title]').fill('Native merchant order · staff reviewed');
      await page.locator('#dialog input[name=amount]').fill('5.000000');
      let interceptedResolve;const intercepted=new Promise(r=>interceptedResolve=r);
      const routeHandler=async route=>{
        const body=route.request().postData();
        let request;try{request=JSON.parse(body);}catch{return route.continue();}
        if(request.command!=='order.save'||request.payload.id!==orderId)return route.continue();
        if(progress.editRequest){assert(canonical(progress.editRequest.envelope)===canonical(request),'BROWSER_REPLAY','The staff form tried to create a second original edit.');return route.abort('failed');}
        progress.editRequest={envelope:request,bodyText:body,fingerprint:jsonDigest(request),at:new Date().toISOString()};save();
        const response=await route.fetch();const value=await response.json();
        assert(response.ok()&&value.requestId===request.requestId&&value.fingerprint===progress.editRequest.fingerprint,'BROWSER_ACCEPTANCE','The actual server did not accept this original form edit.');
        progress.editRequest.accepted=value;progress.editRequest.responseAborted=true;save();await route.abort('failed');interceptedResolve();
      };
      await page.route('**/api/commands',routeHandler);
      await page.getByRole('button',{name:'Save original order',exact:true}).click();
      let timeout;try{await Promise.race([intercepted,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('The original form response was not intercepted.')),30000);})]);}finally{clearTimeout(timeout);}
      await page.unroute('**/api/commands',routeHandler);
    }
    if(!progress.steps.recovery){
      const original=progress.editRequest.envelope;let status=await api('/api/requests/'+encodeURIComponent(original.requestId));
      if(status.state!=='accepted'){
        if(status.state!=='not_found')assert(canonical(status.request.envelope)===canonical(original)&&status.fingerprint===progress.editRequest.fingerprint,'BROWSER_ORIGINAL_REQUEST','Another request occupies the retained identity.');
        const restored={key:original.workspaceId+':'+original.requestId,envelope:original,bodyText:progress.editRequest.bodyText,fingerprint:progress.editRequest.fingerprint,attempts:1,uncertain:true,state:'pending',createdAt:progress.editRequest.at,retainedFromNativeBrowserReceipt:true};
        await page.evaluate(async record=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('rozo-original-requests',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('requests','readwrite');tx.objectStore('requests').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},restored);
        await page.reload({waitUntil:'networkidle'});await select();
        await page.locator('#recovery [data-request-id="'+original.requestId+'"] [data-action=request-resume]').click();
        await page.waitForFunction(id=>!document.querySelector('#recovery [data-request-id="'+id+'"]'),original.requestId);
        status=await api('/api/requests/'+encodeURIComponent(original.requestId));progress.editRequest.recoveredFromOriginalBody=true;save();
      }
      assert(status.state==='accepted'&&canonical(status.request.envelope)===canonical(original)&&status.fingerprint===progress.editRequest.fingerprint,'BROWSER_ORIGINAL_REQUEST','The accepted original form request differs.');
      await page.reload({waitUntil:'networkidle'});await select();
      const pending=page.locator('#recovery [data-request-id="'+original.requestId+'"]');
      if(await pending.count()){
        await pending.locator('[data-action=request-check]').click();
        await page.waitForFunction(id=>!document.querySelector('#recovery [data-request-id="'+id+'"]'),original.requestId);
        progress.steps.recovery={method:'visible original request panel after reload',requestId:original.requestId,acceptedRevision:status.result.revision};
      }else{
        progress.steps.recovery={method:'retained original accepted request after interrupted completion',requestId:original.requestId,acceptedRevision:status.result.revision};
      }
      const record=workspace.get('order',orderId);assert(record.value.title==='Native merchant order · staff reviewed'&&record.value.source.amount==='5.000000','BROWSER_ORDER','The actual saved form values differ.');
      assert(workspace.history('order',orderId).filter(v=>v.requestId===original.requestId).length===1,'BROWSER_REPLAY','The staff edit appended more than one original edition.');
      save();
    }
    await nav('Orders');await originalRow().getByRole('button',{name:'History',exact:true}).click();
    await page.waitForSelector('#dialog-body details');const details=page.locator('#dialog-body details');
    assert(await details.count()>=2,'BROWSER_HISTORY','The original and staff editions are missing.');
    for(let i=0;i<await details.count();i++)await details.nth(i).locator('summary').click();
    const history=await page.locator('#dialog-body').innerText();assert(history.includes('Native merchant order · staff reviewed')&&history.includes('5.000000'),'BROWSER_HISTORY','Full original form editions were not rendered.');
    await page.locator('#dialog-close').click();progress.steps.history=true;save();
    await nav('Payments');assert((await page.locator('#page').innerText()).includes('matching original payments'),'BROWSER_REGISTER','The full register counts are absent.');
    const next=page.getByRole('button',{name:'Next',exact:true});if(await next.isEnabled()){await next.click();await page.waitForTimeout(100);assert((await page.locator('#page tbody').innerText()).length>0,'BROWSER_REGISTER','The next retained payment page is empty.');}
    await nav('Reports');
    if(!progress.steps.downloads){
      const files=[];
      for(const report of reports){
        const row=page.locator('#page tbody tr').filter({hasText:report.id});
        for(const f of report.files){
          const label=f.type.includes('csv')?'CSV':f.type.includes('html')?'HTML':'Complete JSON';
          const waiting=page.waitForEvent('download');await row.getByRole('button',{name:label,exact:true}).click();const download=await waiting;
          const path=join(directory,'download-'+report.id+'-'+f.name);await download.saveAs(path);
          const got=hashOriginalFile(path);assert(got.bytes===f.bytes&&got.sha256===f.sha256,'BROWSER_DOWNLOAD','The real downloaded report differs from its retained original bytes.');files.push({path,original:f,...got});
        }
      }
      progress.steps.downloads={files};save();
    }
    if(reports.length>1){
      await page.locator('select[name=before]').selectOption(reports[0].id);await page.locator('select[name=after]').selectOption(reports[1].id);
      await page.getByRole('button',{name:'Compare full reports',exact:true}).click();await page.waitForFunction(()=>document.getElementById('dialog-title')?.textContent==='Full original period comparison');
      assert((await page.locator('#dialog-body').innerText()).includes('payment rows changed'),'BROWSER_COMPARISON','The full saved period comparison did not render.');await page.locator('#dialog-close').click();
    }
    await nav('Overview');await shot('rozo-desktop.png');await page.setViewportSize({width:390,height:844});await shot('rozo-mobile.png');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),'BROWSER_MOBILE','The staff page exceeds its narrow viewport.');
    assert(errors.length===0,'BROWSER_ERRORS','The actual staff interface raised an exception.',500,{errors});
    progress.steps.finished={at:new Date().toISOString(),errors};save();return {...progress,directory};
  }finally{await context.close();await browser.close();}
}
