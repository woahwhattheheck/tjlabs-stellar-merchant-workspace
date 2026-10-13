// Complete customer opening from the original installed five-invoice case.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inspectMerchantOperator,createMerchantOperatorClient} from './operator-client.mjs';
import {main as operatorCLI} from './operator-cli.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),ROOT=dirname(fileURLToPath(import.meta.url));
export async function receiveInvoiceDeliveries({browser,page,opening,scenario,reads,label,root,directory,save,originalFile,runCommand,stopped}){
 const attempt=randomUUID(),folder=join(root,'downloads','customer-'+label+'-'+attempt);await directory(folder);
 const files=[],images=[],results=[],errors=[];let context=null;
 const selected=await inspectMerchantOperator({url:opening.url,operatorToken:scenario.operatorToken});
 const client=await createMerchantOperatorClient({...selected,operatorToken:scenario.operatorToken,timeoutMs:120000});
 const connection=join(folder,'operator-connection.json');
 await save(connection,{schema:selected.schema,url:selected.url,storeId:selected.storeId,tenantId:selected.tenantId,tokenEnvironment:'MERCHANT_CUSTOMER_RECEIVING_TOKEN',timeoutMs:120000},{original:true});
 async function retain(path,expected=null){const raw=await readFile(path);const file=await originalFile(path,expected??{bytes:raw.length,sha256:sha(raw)});files.push(file);return file;}
 async function capture(p,name){const path=join(folder,name);await p.screenshot({path,fullPage:true,animations:'disabled'});const raw=await readFile(path);images.push({path,bytes:raw.length,sha256:sha(raw),viewport:p.viewportSize(),fullPage:true});}
 try{
  context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1080}});
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  // The exact extracted outgoing HTML uses local files exclusively.
  await context.route(/^https?:/,route=>{errors.push('Unexpected network request from extracted customer delivery.');return route.abort();});
  for(const [index,invoice] of reads.invoices.entries()){
   stopped();const id=invoice.merchantOrderId,preview=await client.previewInvoiceDelivery(id);
   assert.equal(preview.state,'COMPLETE');assert.equal(preview.result.sha256,invoice.sha256);assert.equal(preview.result.bytes,invoice.bytes);
   const reviewFile=join(folder,id+'-review.json');await save(reviewFile,preview,{original:true});await retain(reviewFile);
   const archive=join(folder,id+'-customer.zip'),ticket=await client.prepareInvoiceDelivery(id,preview.revision);
   await client.downloadInvoiceDelivery(ticket,archive);const received=await retain(archive,ticket);
   await page.getByRole('row',{name:invoice.reference+', Delivered',exact:true}).click();
   await page.locator('#detail-content[data-order-id="'+id+'"]').waitFor({state:'visible'});
   await page.locator('#customer-delivery-review').click();
   await page.waitForFunction(reference=>document.getElementById('customer-delivery-summary').textContent.includes(reference),invoice.reference);
   await page.locator('#customer-delivery-download').waitFor({state:'visible'});
   const pending=page.waitForEvent('download');await page.locator('#customer-delivery-download').click();const download=await pending;
   const browserZip=join(folder,id+'-browser.zip');await download.saveAs(browserZip);assert.equal(await download.failure(),null);await retain(browserZip,received);
   const opened=join(folder,id+'-opened');
   const inspection=await runCommand('customer-delivery-'+label+'-'+attempt+'-'+index,{executable:process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3',
     args:['-B',join(ROOT,'invoice_delivery_receive.py'),'--archive',archive,'--directory',opened],cwd:ROOT});
   const inspected=JSON.parse(inspection.stdout.trim());assert.equal(inspected.invoiceId,id);assert.equal(inspected.revision,preview.revision);
   const manifest=JSON.parse(await readFile(join(opened,'MANIFEST.json'))),record=JSON.parse(await readFile(join(opened,'invoice.json')));
   assert.equal(record.invoice.id,id);assert.equal(record.invoice.paymentId,invoice.paymentId);
   assert.equal(record.invoice.result.sha256,invoice.sha256);assert.equal(record.invoice.result.bytes,invoice.bytes);
   await retain(join(opened,'MANIFEST.json'));
   for(const member of manifest.members)await retain(join(opened,member.name),member);
   const offline=await context.newPage();await offline.goto(pathToFileURL(join(opened,'index.html')).href,{waitUntil:'load'});
   assert.equal(await offline.locator('h1').innerText(),invoice.reference);
   assert((await offline.locator('main').innerText()).includes(invoice.title));
   await offline.getByText('Complete original activity',{exact:false}).click();
   assert.equal(await offline.locator('details').last().locator('tbody tr').count(),record.history.length);
   assert(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await capture(offline,id+'-customer-desktop.png');
   const printState=await offline.locator('details').evaluateAll(items=>items.map(e=>e.open));
   await offline.evaluate(()=>dispatchEvent(new Event('beforeprint')));
   assert(await offline.locator('details').evaluateAll(items=>items.every(e=>e.open)));
   await offline.emulateMedia({media:'print'});await capture(offline,id+'-customer-print.png');
   await offline.emulateMedia({media:'screen'});await offline.evaluate(()=>dispatchEvent(new Event('afterprint')));
   assert.deepEqual(await offline.locator('details').evaluateAll(items=>items.map(e=>e.open)),printState);
   for(const name of ['invoice.json','MANIFEST.json','payment-request.json',preview.result.member]){
    const expectation=name==='MANIFEST.json'?files.find(v=>v.path===join(opened,name)):manifest.members.find(m=>m.name===name);
    assert(expectation);const event=offline.waitForEvent('download');
    await offline.locator('a[href="'+name+'"]').click();const actual=await event;
    const target=join(folder,id+'-customer-download-'+name.replaceAll('/','_'));await actual.saveAs(target);
    assert.equal(await actual.failure(),null);await retain(target,expectation);
   }
   const resultPage=await context.newPage();
   await resultPage.goto(pathToFileURL(join(opened,preview.result.member)).href,{waitUntil:'load'});
   assert((await resultPage.locator('body').innerText()).length>0);await capture(resultPage,id+'-original-result.png');await resultPage.close();
   await offline.setViewportSize({width:390,height:844});
   assert(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await capture(offline,id+'-customer-phone.png');await offline.close();
   // Independent cold opening keeps the exact delivered HTML and original file.
   const cold=await context.newPage();await cold.goto(pathToFileURL(join(opened,'index.html')).href,{waitUntil:'load'});
   assert.equal(await cold.locator('h1').innerText(),invoice.reference);await cold.close();
   if(index===0){
    let stdout='';const cliZip=join(folder,id+'-cli.zip');
    await operatorCLI(['invoice-delivery-download','--connection',connection,'--request',reviewFile,'--out',cliZip],
      {environment:{...process.env,MERCHANT_CUSTOMER_RECEIVING_TOKEN:scenario.operatorToken},stdout:{write:value=>{stdout+=value;}}});
    const returned=JSON.parse(stdout.trim());assert.equal(returned.invoiceId,id);assert.equal(returned.revision,preview.revision);
    await retain(cliZip,received);
   }
   results.push({invoiceId:id,revision:preview.revision,archive:received,opened,completeFiles:manifest.members.length+1});
  }
  assert.deepEqual(errors,[]);await retain(connection);
  return {schema:'stellar-forge.merchant-invoice-customer-receiving.v1',invoices:results,files,images,
   producerInspection:{state:'AWAITING_PRODUCER_SCREEN_AND_ATTACHMENT_REVIEW',guide:'CUSTOMER_DELIVERY.md#inspect-the-exact-outgoing-delivery'}};
 }finally{if(context)await context.close();}
}
