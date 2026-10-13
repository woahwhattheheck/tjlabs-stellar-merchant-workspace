#!/usr/bin/env node
// MIT. Observe the existing customer programme UI; original host/capture writers remain unchanged.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!/^--(?:url|token-file|output|commission|playwright|chrome)$/.test(args[i])||!args[i+1])throw new Error('Use --url URL --token-file PRIVATE_FILE --output DIRECTORY --commission ORIGINAL_ID [--playwright MODULE] [--chrome EXECUTABLE].');options[args[i].slice(2)]=args[i+1];}
for(const key of ['url','token-file','output','commission'])if(!options[key])throw new Error('Missing --'+key+'. Use the original running operator and its saved commission ID.');
const base=new URL(options.url);
if(base.username||base.password||base.search||base.hash||!['http:','https:'].includes(base.protocol))throw new Error('Use the original listener URL without credentials, query or fragment.');
const token=(await readFile(resolve(options['token-file']),'utf8')).trim();
if(!token)throw new Error('The original operator token file is empty.');
const output=resolve(options.output);await mkdir(output,{recursive:true});
const playwright=await import(options.playwright?pathToFileURL(resolve(options.playwright)).href:'playwright');
let browser;const errors=[],mutations=[];
try{
  browser=await playwright.chromium.launch({headless:true,...(options.chrome?{executablePath:resolve(options.chrome)}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1360,height:1000},acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const url=new URL(request.url());if(request.method()!=='GET'&&request.method()!=='HEAD'&&url.pathname!=='/api/downloads')mutations.push({method:request.method(),path:url.pathname});});
  const response=await context.request.get(new URL('/api/commissioning/state',base).href,{headers:{Authorization:'Bearer '+token}});
  if(!response.ok())throw new Error('Original commissioning read returned HTTP '+response.status()+'.');
  const state=await response.json(),commission=state.commissions?.find(value=>value.id===options.commission);
  if(!commission)throw new Error('The selected original commission is absent from this listener.');
  if(commission.definition.periods.length!==2)throw new Error('Select the original two-period programme.');
  await page.goto(new URL('/#token='+encodeURIComponent(token),base).href,{waitUntil:'domcontentloaded'});
  await page.locator('#identity').filter({hasText:state.workspaceId}).waitFor({state:'visible'});
  await page.locator('nav [data-pane="programme"]').click();
  await page.waitForFunction(()=>document.getElementById('programme-status').textContent.startsWith('Programme revision '));
  await page.locator('#programme-select').selectOption(commission.id);
  await page.locator('#programme-body h2').filter({hasText:commission.definition.agreement.name||commission.definition.agreement.opportunity_id}).first().waitFor({state:'visible'});
  const periods=await page.locator('.programme-period h3').allTextContents();
  if(JSON.stringify(periods)!==JSON.stringify(commission.definition.periods.map(x=>x.label)))throw new Error('The customer view changed the original reporting period labels.');
  await page.screenshot({path:join(output,'customer-programme-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  if(overflow)throw new Error('The customer programme overflows its mobile viewport.');
  await page.screenshot({path:join(output,'customer-programme-mobile.png'),fullPage:true});
  const artifacts=[];
  const originalDocument=(commission.deliveries??[]).flatMap(d=>d.documents??[]).find(d=>d.sha256&&d.name);
  if(originalDocument){
    const downloadButton=page.locator('#programme-deliveries button').filter({hasText:originalDocument.name}).first();
    const [download]=await Promise.all([page.waitForEvent('download'),downloadButton.click()]);
    const path=join(output,'original-customer-document-'+originalDocument.name.replace(/[^A-Za-z0-9._-]/g,'_'));await download.saveAs(path);
    const body=await readFile(path),sha256=createHash('sha256').update(body).digest('hex');
    if(sha256!==originalDocument.sha256)throw new Error('The downloaded customer document differs from the original retained source.');
    artifacts.push({name:originalDocument.name,bytes:body.length,sha256});
  }
  await page.locator('#programme-body button').filter({hasText:'Open this agreement in commissioning'}).click();
  await page.waitForFunction(id=>document.getElementById('commission-select')?.value===id,commission.id);
  await page.locator('#field-link').click();
  await page.locator('nav [data-pane="programme"]').click();
  await page.waitForFunction(()=>document.getElementById('programme-status').textContent.startsWith('Programme revision '));
  if(await page.locator('#programme-select').inputValue()!==commission.id)throw new Error('The original programme selection was lost when reopening.');
  const capture=(commission.captures??[])[0];
  if(capture){
    const row=page.locator('.programme-period tbody tr').filter({hasText:capture.id}).first();
    await row.getByRole('button',{name:'Open edition',exact:true}).click();
    await page.waitForFunction(id=>document.getElementById('edition-select')?.value===id, capture.id);
    await page.locator('#edition-body').waitFor({state:'visible'});
  }
  if(errors.length)throw new Error('Customer browser errors: '+errors.join('; '));
  if(mutations.length)throw new Error('The read-only customer review attempted an unexpected operation: '+JSON.stringify(mutations));
  const receipt={schema:'stellar-forge.odk-customer-programme-review.v1',observedAt:new Date().toISOString(),workspaceId:state.workspaceId,commissionId:commission.id,revision:state.revision,
    forms:commission.definition.forms,periods,deliveries:(commission.deliveries??[]).map(d=>({id:d.id,status:d.status})),
    originalFiles:artifacts,desktop:{width:1360,height:1000},mobile:{width:390,height:844,overflow:false},
    actions:['open existing programme','read both original period labels','download and verify retained customer document when present','open exact commissioning version','return and retain programme selection','open original edition when present'],pageErrors:errors,unexpectedMutations:mutations};
  await writeFile(join(output,'customer-programme-review.json'),JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify({ok:true,workspaceId:state.workspaceId,commissionId:commission.id,receipt:join(output,'customer-programme-review.json'),downloadedFiles:artifacts.length})+'\n');
}finally{await browser?.close();}
