// Actual staff form, accepted-response loss/reload recovery and complete finance views.
import { mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, canonical, jsonDigest, digest } from './model.mjs';
import { hashOriginalFile } from './delivery.mjs';
import { originalJSON, saveFinance, retainFinance } from './finance-native-support.mjs';

export async function runFinanceBrowser({service,startup,directory,plan,coding,chromium,playwrightModule,phase}){
  assert(chromium&&playwrightModule,'FINANCE_BROWSER_RUNTIME','Select the actual installed Chromium and Playwright runtime.');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const path=join(directory,'FINANCE_BROWSER_PROGRESS.json'),progress=existsSync(path)?originalJSON(path):{
    schema:'stellar-forge.rozo-finance-browser.v1',operationId:plan.operationId,workspaceId:plan.workspaceId,planSha256:jsonDigest(plan),steps:{},files:[]};
  assert(progress.workspaceId===plan.workspaceId&&progress.operationId===plan.operationId&&progress.planSha256===jsonDigest(plan),
    'FINANCE_BROWSER_CASE','Continue the original finance staff operation.');
  const save=()=>saveFinance(path,progress),module=await import(pathToFileURL(playwrightModule)),pw=module.chromium?module:module.default;
  assert(pw?.chromium,'FINANCE_BROWSER_RUNTIME','The maintained Playwright module has no Chromium export.');
  const context=await pw.chromium.launchPersistentContext(join(directory,'profile'),{executablePath:chromium,headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage'],viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const api=async path=>{const r=await fetch(startup.origin+path,{headers:{'X-Rozo-Session':startup.sessionToken}}),v=await r.json();
    assert(r.ok,'FINANCE_BROWSER_API','The original authenticated state read failed.',500,v);return v;};
  const profile=service.finance.capture(plan.report).source.report.value.profileId;
  const open=async()=>{
    await page.goto(startup.url,{waitUntil:'networkidle'});await page.waitForSelector('#navigation button');
    await page.locator('#actor').fill(plan.actor);await page.locator('#actor').dispatchEvent('change');
    await page.selectOption('#profile',profile);await page.locator('#navigation button').filter({hasText:/Finance$/}).click();
    await page.waitForSelector('[data-finance-desk] [data-finance-view]');
  };
  const view=async name=>{await page.locator('[data-finance-view="'+name+'"]').click();await page.waitForTimeout(50);};
  const originalStatus=async()=>{
    const expected=progress.request.envelope,value=await api('/api/requests/'+encodeURIComponent(expected.requestId));
    if(value.state!=='not_found')assert(value.fingerprint===jsonDigest(expected)&&canonical(value.request.envelope)===canonical(expected),
      'FINANCE_BROWSER_REQUEST','The original browser request binding differs.');
    return value;
  };
  const shot=async name=>{
    const destination=join(directory,name),old=progress.files.find(f=>f.name===name);
    if(old){const got=hashOriginalFile(destination);assert(got.bytes===old.bytes&&got.sha256===old.sha256,'FINANCE_BROWSER_FILE','The retained screenshot differs.');return old;}
    await page.screenshot({path:destination,fullPage:true});const row={name,...hashOriginalFile(destination)};progress.files.push(row);save();return row;
  };
  try{
    await open();
    if(phase==='amendment'){
      assert(plan.amendment,'FINANCE_BROWSER_PLAN','Select the complete following-edition source review.');
      if(!progress.steps.amendment){
        await view('amendments');
        await page.locator('[data-action=finance-amendment-review]').click();
        const form=page.locator('[data-finance-amendment-form]');
        await form.locator('[name=report]').selectOption(plan.report.reportId);
        await page.waitForFunction(()=>document.querySelector('[data-finance-amendment-form]')?.textContent.includes('Each Buyer purchase must be selected'));
        for(const key of ['name','provenance'])await form.locator('[name='+key+']').fill(plan.source[key]);
        await form.locator('[name=dataContext]').selectOption(plan.source.dataContext);
        if(plan.buyer){
          await form.locator('[name=includeBuyer]').check();
          for(const purchase of plan.buyer.purchaseSelection.purchases){
            const row=form.locator('[data-amendment-purchase="'+purchase.movementId+'"]');
            await row.locator('input[type=checkbox]').check();
            for(const [name,key] of [['owner','purchaseOwner'],['reference','purchaseReference'],['reason','reason']])
              await row.locator('[name="'+name+'-'+purchase.movementId+'"]').fill(purchase[key]);
          }
        }
        await form.getByRole('button',{name:'Compare original financial editions',exact:true}).click();
        const panel=form.locator('[data-amendment-preview]');await panel.waitFor();
        assert(await panel.getAttribute('data-preview-sha')===plan.amendment.preview.previewSha256,
          'FINANCE_BROWSER_AMENDMENT','The actual staff comparison differs from the reviewed full source impact.');
        const visible=await panel.innerText();
        for(const close of plan.amendment.preview.accounting.closes)
          assert(await panel.locator('[data-amendment-close="'+close.id+'"]').count()===1,'FINANCE_BROWSER_AMENDMENT','An affected merchant close is absent.');
        for(const close of plan.amendment.preview.buyer?.closedPeriods??[])
          assert(await panel.locator('[data-amendment-buyer-close="'+close.closeId+'"]').count()===1,'FINANCE_BROWSER_AMENDMENT','An affected Buyer close is absent.');
        assert(visible.includes('Native-unit difference'),'FINANCE_BROWSER_AMENDMENT','The complete native-unit comparison is absent.');
        const downloadPromise=page.waitForEvent('download');
        await panel.locator('[data-action=save-amendment-comparison]').click();
        const download=await downloadPromise,temp=join(directory,'comparison-download.tmp');
        await download.saveAs(temp);
        const raw=readFileSync(temp),observed=JSON.parse(raw);
        assert(canonical(observed)===canonical(plan.amendment.preview),'FINANCE_BROWSER_AMENDMENT','The staff comparison download differs from the complete reviewed source.');
        const name='staff-amendment-comparison.json';retainFinance(join(directory,name),raw);unlinkSync(temp);
        await shot('finance-amendment-desktop.png');
        await page.setViewportSize({width:390,height:844});await shot('finance-amendment-mobile.png');
        progress.steps.amendment={previewSha256:observed.previewSha256,predecessorSha256:plan.amendment.predecessor.sha256,
          download:{name,...hashOriginalFile(join(directory,name))},merchantCloses:observed.accounting.closes.map(c=>c.id),
          buyerCloses:observed.buyer?.closedPeriods.map(c=>c.closeId)??[],readOnly:true};save();
      }else{
        const row=progress.steps.amendment.download,got=hashOriginalFile(join(directory,row.name));
        assert(got.bytes===row.bytes&&got.sha256===row.sha256&&
          canonical(originalJSON(join(directory,row.name)))===canonical(plan.amendment.preview),
          'FINANCE_BROWSER_AMENDMENT','Retain the complete original staff comparison.');
      }
    }else if(phase==='coding'){
      assert(coding,'FINANCE_BROWSER_PLAN','Choose the original reviewed coding for this form.');
      if(!progress.request){
        await view('merchant');
        await page.locator('[data-finance-code="'+coding.movementId+'"]').click();
        const dialog=page.locator('#dialog');
        await dialog.locator('[name=recognitionDate]').fill(coding.recognitionDate);
        await dialog.locator('[name=reason]').fill(coding.reason);
        await dialog.locator('[name=evidence]').check();
        const initial=await dialog.locator('.finance-allocation').count();
        for(let i=initial;i>coding.allocations.length;i--)await dialog.locator('.finance-allocation').last().getByRole('button',{name:'Remove allocation',exact:true}).click();
        for(let i=initial;i<coding.allocations.length;i++)await dialog.getByRole('button',{name:'Add allocation line',exact:true}).click();
        for(let i=0;i<coding.allocations.length;i++)for(const key of ['amount','accountCode','costCenter','project','memo'])
          await dialog.locator('.finance-allocation').nth(i).locator('[name='+key+']').fill(coding.allocations[i][key]??'');
        let received,failed;const dispatched=new Promise((resolve,reject)=>{received=resolve;failed=reject;});
        const handler=async route=>{
          const raw=route.request().postData();let body;try{body=JSON.parse(raw);}catch{return route.continue();}
          if(body.command!=='finance.accounting.mutate'||body.payload?.command!=='coding.save'||body.payload.payload?.movementId!==coding.movementId)return route.continue();
          try{
            assert(!progress.request,'FINANCE_BROWSER_DUPLICATE','The form attempted a second original request.');
            const actual=body.payload.payload;
            if(plan.amendment)assert(actual.expectedVersion===coding.expectedVersion,'FINANCE_BROWSER_CODING_CHANGED','The actual form must retain the original reviewed coding version.');
            for(const key of ['movementId','basisSha256','recognitionDate','reason','providerEvidenceAcknowledged','allocations'])
              assert(canonical(actual[key])===canonical(coding[key]),'FINANCE_BROWSER_FORM','The actual form differs from the explicit reviewed '+key+'.');
            progress.request={envelope:body,bodyText:raw,fingerprint:jsonDigest(body),at:new Date().toISOString()};save();
            const response=await route.fetch(),value=await response.json();
            assert(response.ok()&&value.requestId===body.requestId&&value.fingerprint===jsonDigest(body),
              'FINANCE_BROWSER_ACCEPTANCE','The native owner did not accept this actual form operation.');
            progress.request.accepted=value;progress.request.abortedAfterAcceptance=true;save();
            await route.abort('failed');received();
          }catch(error){failed(error);await route.abort('failed');}
        };
        await page.route('**/api/commands',handler);
        await dialog.getByRole('button',{name:'Save reviewed operation',exact:true}).click();
        let timer;try{await Promise.race([dispatched,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The original coding response did not complete.')),45000);})]);}
        finally{clearTimeout(timer);await page.unroute('**/api/commands',handler);}
      }
      if(!progress.steps.recovery){
        let status=await originalStatus();
        // A restart can lose its browser profile; retain and restore only the exact already captured browser request.
        const request=progress.request,entry={key:plan.workspaceId+':'+request.envelope.requestId,envelope:request.envelope,
          bodyText:request.bodyText,fingerprint:request.fingerprint,attempts:1,uncertain:true,state:'pending',createdAt:request.at};
        await page.evaluate(async value=>{
          const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('rozo-original-requests',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
          await new Promise((resolve,reject)=>{const tx=db.transaction('requests','readwrite');tx.objectStore('requests').put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
        },entry);
        await page.reload({waitUntil:'networkidle'});
        const button=page.locator('#recovery [data-request-id="'+request.envelope.requestId+'"] [data-action=request-resume]');
        if(await button.count())await button.click();
        await page.waitForFunction(id=>!document.querySelector('#recovery [data-request-id="'+id+'"]'),request.envelope.requestId);
        status=await originalStatus();assert(status.state==='accepted','FINANCE_BROWSER_RECOVERY','The original saved request has not been recovered.');
        const accepted=service.workspace.request(request.envelope.requestId),outcome=accepted.result.result;
        const native=JSON.parse(service.workspace.wholeObject(outcome.originalResult.sha256));
        for(const key of ['movementId','basisSha256','recognitionDate','reason','providerEvidenceAcknowledged','allocations'])
          assert(canonical(key==='allocations'?native.coding.allocations.map(({line,...row})=>row):native.coding[key])===canonical(coding[key]),'FINANCE_BROWSER_CODING','The accepted original coding differs.');
        progress.steps.recovery={requestId:request.envelope.requestId,revision:accepted.result.revision,nativeRequestId:outcome.nativeRequestId,
          lostResponseAfterAcceptance:Boolean(request.abortedAfterAcceptance),reloaded:true};save();
      }
      await open();await view('merchant');await shot('merchant-reviewed-desktop.png');
    }else{
      assert(phase==='delivery','FINANCE_BROWSER_PHASE','Select the original amendment comparison, coding or following delivery views.');
      if(!progress.steps.views){
        const views=['intake','merchant','buyer','accountant','amendments','deliveries'];
        for(const name of views){await view(name);assert((await page.locator('[data-finance-desk]').innerText()).length>80,'FINANCE_BROWSER_VIEW','The original '+name+' view did not render.');}
        await shot('finance-delivery-desktop.png');
        const links=page.getByRole('button',{name:'Download original file',exact:true});
        assert(await links.count()>0,'FINANCE_BROWSER_DOWNLOAD','The full original accountant/Buyer files are not visible.');
        const downloadPromise=page.waitForEvent('download');await links.first().click();const download=await downloadPromise;
        const file=join(directory,'staff-original-download');await download.saveAs(file);const got=hashOriginalFile(file);
        const accepted=service.workspace.list('finance-outcome',{all:true}).items.flatMap(x=>x.value.summary?.files??[]);
        assert(accepted.some(x=>x.bytes===got.bytes&&x.sha256===got.sha256),'FINANCE_BROWSER_DOWNLOAD','The staff download differs from every retained original file.');
        progress.steps.views={views,download:{name:download.suggestedFilename(),...got}};save();
      }
      await page.setViewportSize({width:390,height:844});await view('accountant');await shot('finance-accountant-mobile.png');
      await view('deliveries');await shot('finance-handover-mobile.png');
      progress.steps.delivery={views:progress.steps.views.views,files:progress.files};save();
    }
    assert(errors.length===0,'FINANCE_BROWSER_ERRORS','The actual finance browser reported an error.',500,{errors});
    const result={schema:'stellar-forge.rozo-finance-browser-result.v1',operationId:plan.operationId,phase,workspaceId:plan.workspaceId,
      steps:progress.steps,files:progress.files,errors};retainFinance(join(directory,'FINANCE_BROWSER_'+phase.toUpperCase()+'.json'),result);return result;
  }finally{await context.close();}
}
