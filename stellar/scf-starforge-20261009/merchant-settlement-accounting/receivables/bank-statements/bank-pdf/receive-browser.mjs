// SPDX-License-Identifier: MIT
// Whole browser receiving against the actual installed Bank service and original PDF.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openWorkingCopy,accountReview,canonical} from './model.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
async function exactFile(file){const bytes=await fs.readFile(file);return{file,bytes:bytes.length,sha256:sha(bytes)};}
export async function receiveBankPdfBrowser({browser,baseUrl,originalPdfPath,reviewedWorkingCopyPath=null,outDirectory,
 actor='PDF receiving operator',reviewNote='Receive the complete original source and retained operator interpretation',receive=false,acknowledgeBalanceDifference=false,password=undefined}){
 const target=new URL('/bank-statements/pdf/',baseUrl);
 need(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Use the actual local Bank service.');
 await fs.mkdir(outDirectory,{mode:0o700});const report={schema:'stellar-forge.bank-pdf-browser-receiving.v1',startedAt:new Date().toISOString(),url:target.href,
  original:await exactFile(originalPdfPath),phases:[],screenshots:[],downloads:[],consoleErrors:[],completed:false};
 const reportFile=path.join(outDirectory,'browser-receiving.json');let context,second;
 const attachDialogs=page=>page.on('dialog',async dialog=>{
  if(dialog.type()==='prompt'){
   const message=dialog.message(),pdfPassword=/original.*password|PDF password/i.test(message);
   if(pdfPassword&&typeof password==='string'&&password&&!/not accepted/i.test(message))await dialog.accept(password);
   else await dialog.dismiss();
  }else await dialog.accept();
 });
 const save=()=>fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const phase=async(name,work)=>{const value=await work();report.phases.push({name,at:new Date().toISOString(),...value});await save();return value;};
 try{
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  let page=await context.newPage();page.on('pageerror',error=>report.consoleErrors.push(String(error)));
  attachDialogs(page);
  const idle=async()=>{await page.waitForFunction(()=>!document.querySelector('#export')?.disabled,{timeout:180000});};
  const clean=async()=>{const error=await page.locator('#message.error').count();need(!error,await page.locator('#message').innerText());};
  const screenshot=async name=>{const file=path.join(outDirectory,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(await exactFile(file));};
  const download=async(selector,name)=>{const waiting=page.waitForEvent('download');await page.locator(selector).click();const item=await waiting;
   const file=path.join(outDirectory,name);await item.saveAs(file);need(!(await item.failure()),'Original download failed');const info=await exactFile(file);report.downloads.push({...info,suggestedFilename:item.suggestedFilename(),sourceUrl:item.url()});return file;};
  await phase('open-original-and-extract-every-page',async()=>{
   await page.goto(target.href,{waitUntil:'networkidle'});await page.locator('#pdf-file').setInputFiles(originalPdfPath);
   await page.locator('#workspace').waitFor({state:'visible',timeout:180000});await idle();await clean();
   await page.locator('#actor').fill(actor);await page.locator('#reason').fill(reviewNote);
   const file=await download('#export','initial-complete-working-copy.json'),work=await openWorkingCopy(await fs.readFile(file,'utf8'));
   need(work.file.sha256===report.original.sha256,'The browser opened a different original PDF');
   need(work.extraction.pages.length>0,'Every original PDF page must be retained');
   report.originalPages=work.extraction.pages.length;report.originalTextItems=work.extraction.pages.reduce((sum,row)=>sum+row.items.length,0);
   return{workingCopyId:work.id,pages:report.originalPages,textItems:report.originalTextItems,engine:work.extraction.engine};
  });
  await phase('render-every-original-page',async()=>{
   for(let number=1;number<=report.originalPages;number++){
    await page.locator('#page').selectOption(String(number));await idle();
    await page.waitForFunction(()=>document.querySelector('#page-canvas').width>0);
    await screenshot('original-page-'+String(number).padStart(3,'0'));
   }
   const pdf=await download('#original','original-statement.pdf');need((await exactFile(pdf)).sha256===report.original.sha256,'Original PDF download changed');
   return{renderedPages:report.originalPages};
  });
  if(reviewedWorkingCopyPath){
   await phase('receive-full-reviewed-working-copy',async()=>{
    const raw=await fs.readFile(reviewedWorkingCopyPath,'utf8'),work=await openWorkingCopy(raw);
    need(work.file.sha256===report.original.sha256,'Reviewed mapping belongs to a different original PDF');
    await page.locator('#working-file').setInputFiles(reviewedWorkingCopyPath);await idle();await clean();
    const file=await download('#export','received-reviewed-working-copy.json'),received=await openWorkingCopy(await fs.readFile(file,'utf8'));
    need(canonical(received)===canonical(work),'Browser working-copy receiving changed the complete original interpretation');
    report.reviewedAccounts=work.accounts.map(account=>({id:account.id,accountId:account.accountId,review:accountReview(work,account.id)}));
    return{revision:work.revision,accounts:work.accounts.length,rows:work.rows.length,history:work.history.length};
   });
   await phase('operate-real-row-and-balance-review',async()=>{
    const work=await openWorkingCopy(await fs.readFile(reviewedWorkingCopyPath,'utf8'));
    for(const account of work.accounts){
     await page.locator('#account').selectOption(account.id);await idle();await clean();
     const row=work.rows.find(item=>item.accountId===account.id&&item.decision==='INCLUDE');
     if(row){
      await page.locator('#row-search').fill(row.reference||row.memo||row.postedDate);
      const button=page.locator('[data-edit-row]').filter({hasText:'Review'}).first();
      await button.click();await page.locator('#editor').waitFor({state:'visible'});
      const fields=await page.locator('#editor-form').evaluate(form=>Object.fromEntries(new FormData(form)));
      need(fields.postedDate&&fields.amount,'Original mapped row values must remain visible');
      await page.locator('#editor-form [name=note]').fill((fields.note||'')+'\nOriginal receiving: inspected source and retained its exact financial values.');
      await page.locator('#editor-form button[type=submit]').click();await page.locator('#editor').waitFor({state:'hidden'});await idle();await clean();
      await page.locator('#row-search').fill('');
     }
     const review=accountReview(work,account.id);
     if(review.receivable){
      need(!review.problems.length||acknowledgeBalanceDifference,'Inspect and explicitly acknowledge the original balance difference before automated Bank receiving.');
      await download('#download-csv','account-'+account.id.replace(/[^A-Za-z0-9_-]/g,'_')+'.csv');
      await page.locator('#preview-bank').click();await page.locator('#bank-preview').waitFor({state:'visible',timeout:180000});await idle();await clean();
      await download('#preview-json','account-'+account.id.replace(/[^A-Za-z0-9_-]/g,'_')+'-source-input.json');
      if(receive){
       if(!(await page.locator('#bank-account').inputValue())){
        await page.locator('#receive-bank').click();await idle();await clean();
        await page.locator('#preview-bank').click();await page.locator('#bank-preview').waitFor({state:'visible'});await idle();await clean();
       }
       need(await page.locator('#bank-account').inputValue(),'Choose the bound original Bank account');
       need((await page.locator('#supersedes option').count())===1,'Existing source interpretations require a deliberate correction selection, not automatic receiving');
       await page.locator('#receive-bank').click();await idle();await clean();
       need(!(await page.locator('#pending').isVisible()),'Recover the original accounting operation before completing receiving');
      }
     }
     await screenshot('account-'+account.id.replace(/[^A-Za-z0-9_-]/g,'_')+'-desktop');
    }
    return{bankReceiveRequested:receive,reviewedAccounts:work.accounts.length};
   });
  }
  let finalWorking;
  await phase('desktop-and-narrow-full-operating-view',async()=>{
   await page.setViewportSize({width:1440,height:1000});await screenshot('desktop-complete');
   await page.setViewportSize({width:390,height:844});await page.locator('#page').selectOption('1');await idle();await clean();
   const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
   need(overflow.width<=overflow.viewport+2,'The narrow PDF desk overflows the viewport');
   await screenshot('narrow-390');
   if(report.originalPages>1){await page.locator('#next-page').click();await idle();need((await page.locator('#page').inputValue())==='2','Narrow page navigation failed');}
   finalWorking=await download('#export','final-complete-working-copy.json');return{viewport:390,overflow};
  });
  await phase('cold-browser-receive-and-edit-reexport',async()=>{
   const previous=await openWorkingCopy(await fs.readFile(finalWorking,'utf8'));
   second=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});page=await second.newPage();page.on('pageerror',error=>report.consoleErrors.push(String(error)));attachDialogs(page);
   await page.goto(target.href,{waitUntil:'networkidle'});await page.locator('#working-file').setInputFiles(finalWorking);
   await page.locator('#workspace').waitFor({state:'visible'});await idle();await clean();
   const restoredFile=await download('#export','cold-restored-working-copy.json'),restored=await openWorkingCopy(await fs.readFile(restoredFile,'utf8'));
   need(canonical(restored)===canonical(previous),'Cold receiving changed original bytes, mappings or history');
   await page.locator('#actor').fill(actor);await page.locator('#reason').fill('Continue the received original working copy');
   const old=restored.pageReviews.find(row=>row.page===1);
   await page.locator('#page-review [name=disposition]').selectOption(old?.disposition||'MANUAL_REVIEW');
   await page.locator('#page-review [name=note]').fill((old?.note||'Original page awaiting account mapping.')+' Continued from complete downloaded working copy.');
   await page.locator('#page-review button').click();await idle();await clean();
   const continuedFile=await download('#export','cold-continued-working-copy.json'),continued=await openWorkingCopy(await fs.readFile(continuedFile,'utf8'));
   need(continued.file.sha256===restored.file.sha256&&continued.revision===restored.revision+1,'Cold continuation lost original source or history');
   await screenshot('cold-received-narrow');return{workingCopyId:continued.id,restoredRevision:restored.revision,continuedRevision:continued.revision};
  });
  need(report.consoleErrors.length===0,'The complete operating journey produced browser errors: '+report.consoleErrors.join('; '));
  report.completed=true;report.completedAt=new Date().toISOString();await save();return report;
 }catch(error){report.error={name:error.name,message:error.message,stack:error.stack};await save();throw Object.assign(error,{reportFile});}
 finally{await second?.close();await context?.close();}
}
