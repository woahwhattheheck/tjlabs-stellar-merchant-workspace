// MIT. Whole saved-review comparison course in the original authenticated browser.
import {need,json,sha} from './core.mjs';
import {cashRealizationComparisonFile,receiveCashRealizationComparison,CASH_COMPARISON_FILES} from './cash-realization-comparison.mjs';
export async function receiveCashRealizationComparisonBrowser({page,receivables,nativeResult,save}){
 need(nativeResult?.selection&&typeof save==='function','CASH_COMPARISON_BROWSER_INPUT','Use the original completed native selection and private case writer.');
 const selection=nativeResult.selection,report=await receivables.compareCashRealizations(selection);
 need(report.workspaceId===nativeResult.workspaceId&&report.comparisonSha256===nativeResult.comparisonSha256,'CASH_COMPARISON_BROWSER_SOURCE','The original comparison changed.',409);
 const errors=[],observations=[],downloads=[];const onError=error=>errors.push(String(error.message));page.on('pageerror',onError);
 async function closeDialog(){if(await page.locator('#dialog').isVisible())await page.locator('#dialog [data-action="close-dialog"]').first().click();}
 async function openComparison(){
  await closeDialog();await page.locator('[data-action="view"][data-view="cash-planning"]').click();
  await page.locator('[data-action="cash-comparison-choose"]').click();
  const form=page.locator('#cash-comparison-select');await form.waitFor();
  await form.locator('[name="leftId"]').selectOption(selection.leftId);await form.locator('[name="rightId"]').selectOption(selection.rightId);
  await form.locator('button[type="submit"]').click();await page.locator('#cash-comparison-display').waitFor();
 }
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   await page.setViewportSize(viewport);await openComparison();
   const groups=[];
   for(const [group,metric] of [['currencies','currentBalance'],['invoices','currentBalance'],['dates','incomingAllocatedCash'],['receipts','amount']]){
    const form=page.locator('#cash-comparison-display');await form.locator('[name="group"]').selectOption(group);await form.locator('[name="metric"]').selectOption(metric);await form.locator('button[type="submit"]').click();
    const rows=report[group],visiblePages=[];
    for(let offset=0;offset<Math.max(1,rows.length);offset+=100){
     const visible=await page.locator('#dialog-content').innerText();
     for(const row of rows.slice(offset,offset+100))for(const key of ['left','restatedLeft','right','sourceChange','periodChange','totalChange'])
      need(visible.includes(row.metrics[metric][key]),'CASH_COMPARISON_BROWSER_AMOUNT','Every selected exact '+group+' amount must remain visible.');
     visiblePages.push({offset,visible});
     if(offset+100<rows.length)await page.locator('[data-action="cash-comparison-page"]').filter({hasText:'Next'}).click();
    }
    const shot=await page.screenshot({fullPage:true}),name='comparison-'+viewport.width+'-'+group+'.png';
    await save(name+'.source.json',{name,type:'image/png',bytes:shot.length,sha256:sha(shot),contentBase64:shot.toString('base64')});
    groups.push({group,metric,rows:rows.length,pages:visiblePages,screenshot:{name,bytes:shot.length,sha256:sha(shot)}});
   }
   observations.push({viewport,groups});
  }
  await page.setViewportSize({width:1440,height:1000});await openComparison();
  const changeGroup=report.sourceChanges.find(x=>x.changes.length);
  if(changeGroup){
   const change=changeGroup.changes[0],control=page.locator('[data-action="cash-comparison-source"][data-kind="'+changeGroup.kind+'"][data-id="'+change.id+'"]');
   await control.locator('xpath=ancestor::details').evaluate(node=>{node.open=true;});await control.click();
   const text=await page.locator('#dialog-content').innerText();
   need(text.includes(change.id)&&text.includes('Earlier original')&&text.includes('Later original'),'CASH_COMPARISON_BROWSER_ORIGINAL','Both original source record views must open.');
   await save('comparison-original-record.json',{kind:changeGroup.kind,id:change.id,visible:text});
   await page.locator('[data-action="cash-comparison-return"]').click();
  }
  for(const name of CASH_COMPARISON_FILES){
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="cash-comparison-file"][data-name="'+name+'"]').click()]);
   const stream=await download.createReadStream();need(stream,'CASH_COMPARISON_BROWSER_DOWNLOAD','The browser must retain the complete original download stream.');
   const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks),expected=cashRealizationComparisonFile(report,name);
   need(bytes.equals(expected.bytes),'CASH_COMPARISON_BROWSER_DOWNLOAD','The downloaded '+name+' differs from its original full source.',409);
   if(name==='comparison.json')receiveCashRealizationComparison(JSON.parse(bytes.toString('utf8')));
   const identity={name,bytes:bytes.length,sha256:sha(bytes),type:expected.type};downloads.push(identity);
   await save('downloads/'+name+'.source.json',{...identity,contentBase64:bytes.toString('base64')});
  }
  await closeDialog();await page.reload();await openComparison();
  const after=await receivables.compareCashRealizations(selection);need(json(after)===json(report),'CASH_COMPARISON_BROWSER_REOPEN','Browser reload must keep the original saved reviews exact.',409);
  need(!errors.length,'CASH_COMPARISON_BROWSER_ERRORS','The original page reported errors: '+errors.join('; '));
  const result={schema:'stellar-forge.cash-comparison-browser-receiving.v1',operationId:nativeResult.operationId,workspaceId:report.workspaceId,selection,
   state:nativeResult.state==='NATIVE_COMPLETE'?'COMPLETE':'BROWSER_COMPLETE_REOPEN_PENDING',comparisonSha256:report.comparisonSha256,
   observations,downloads,originalReloadExact:true,errors};
  await save('comparison-browser-result.json',result);return result;
 }finally{page.off('pageerror',onError);}
}
