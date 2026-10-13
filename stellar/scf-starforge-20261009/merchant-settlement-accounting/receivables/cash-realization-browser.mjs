// MIT. Operate the existing receivables page; caller owns its isolated browser and original server.
import {need,json,sha} from './core.mjs';
/**
 * Supply the original already-authenticated page, immutable receiving result and
 * complete save callback. Screenshots/downloads are returned to the same private
 * case. Caller owns page/context/server cleanup; no browser or second host starts.
 */
export async function receiveCashRealizationBrowser({page,receivables,nativeResult,save}){
 need(nativeResult?.realizationId&&typeof save==='function','CASH_REALIZATION_BROWSER_INPUT','Use the completed original native receiving result and case writer.');
 const row=(await receivables.cashRealization(nativeResult.realizationId)).realization;
 need(row.workspaceId===nativeResult.workspaceId,'CASH_REALIZATION_BROWSER_WORKSPACE','Open the same original workspace.',409);
 const errors=[];const onError=error=>errors.push(String(error.message));
 page.on('pageerror',onError);
 async function closeDialog(){const d=page.locator('#dialog');if(await d.isVisible())await page.locator('#dialog [data-action="close-dialog"]').first().click();}
 async function selectReview(){
   await closeDialog();
   await page.locator('[data-action="view"][data-view="cash-planning"]').click();
   await page.locator('[data-action="cash-realization-open"][data-id="'+row.id+'"]').click();
   await page.locator('#dialog-content').getByText('Original balance bridge',{exact:true}).waitFor();
 }
 const observations=[];
 try{
   for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
     await page.setViewportSize(viewport);await selectReview();
     const visible=await page.locator('#dialog-content').innerText();
     need(visible.includes(row.report.plan.plan.title)||await page.locator('#dialog-title').innerText()===row.report.plan.plan.title+' — realized receipts',
       'CASH_REALIZATION_BROWSER_TITLE','The original reviewed plan must be visible.');
     for(const currency of row.report.currencies)for(const key of ['expectedToDate','incomingAllocatedCash','cashVariance','currentAmountDue'])
       need(visible.includes(currency[key]),'CASH_REALIZATION_BROWSER_VALUE','The exact '+key+' value must remain visible.');
     for(const invoice of row.report.invoices)need(visible.includes(invoice.invoiceNumber)&&visible.includes(invoice.currentBalance),
       'CASH_REALIZATION_BROWSER_INVOICE','Every original planned invoice must remain in the rendered report.');
     const dimensions=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth}));
     const screenshot=await page.screenshot({fullPage:true});
     const name='browser-'+viewport.width+'.png';
     await save(name+'.source.json',{name,type:'image/png',bytes:screenshot.length,sha256:sha(screenshot),contentBase64:screenshot.toString('base64')});
     observations.push({viewport,dimensions,visible,screenshot:{name,bytes:screenshot.length,sha256:sha(screenshot)}});
   }
   await page.setViewportSize({width:1440,height:1000});await selectReview();
   const [download]=await Promise.all([page.waitForEvent('download'),
     page.locator('[data-action="cash-realization-download"][data-name="realization.json"]').click()]);
   const stream=await download.createReadStream();need(stream,'CASH_REALIZATION_BROWSER_DOWNLOAD','The browser must retain the original download stream.');
   const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
   need(json(JSON.parse(bytes.toString('utf8')))===json(row),'CASH_REALIZATION_BROWSER_DOWNLOAD','The browser download must contain the complete original immutable report.',409);
   await save('browser-realization.json.source.json',{name:download.suggestedFilename(),bytes:bytes.length,sha256:sha(bytes),contentBase64:bytes.toString('base64')});
   await page.locator('#dialog [data-action="cash-realization-new"]').click();
   const form=page.locator('#cash-realization-form');await form.waitFor();
   await form.locator('[name="through"]').fill(row.request.through);
   await form.locator('[name="note"]').fill('Following review inspected in the original browser.');
   await form.locator('button[type="submit"]').click();
   const saveButton=page.locator('[data-action="cash-realization-save"]');await saveButton.waitFor();
   await form.locator('[name="note"]').fill('Edited following review must be recalculated.');
   need(await saveButton.isDisabled(),'CASH_REALIZATION_BROWSER_REVIEW','Edited assumptions must disable the old preview save.');
   await save('browser-following-review.json',{through:row.request.through,note:'Edited following review must be recalculated.',saveDisabled:true});
   await closeDialog();await page.reload();await selectReview();
   const reopened=(await receivables.cashRealization(row.id)).realization;
   need(json(reopened)===json(row),'CASH_REALIZATION_BROWSER_REOPEN','Reload must preserve the exact saved review.',409);
   need(!errors.length,'CASH_REALIZATION_BROWSER_ERRORS','The original operator reported browser errors: '+errors.join('; '));
   const result={schema:'stellar-forge.merchant-cash-realization-browser-receiving.v1',
     operationId:nativeResult.operationId,reviewAttempt:nativeResult.reviewAttempt,workspaceId:row.workspaceId,realizationId:row.id,
     state:nativeResult.state==='NATIVE_COMPLETE'?'COMPLETE':'BROWSER_COMPLETE_REOPEN_PENDING',
     observations,download:{bytes:bytes.length,sha256:sha(bytes)},followingReviewInvalidation:true,originalReloadExact:true,errors};
   await save('browser-result.json',result);return result;
 }finally{page.off('pageerror',onError);}
}
