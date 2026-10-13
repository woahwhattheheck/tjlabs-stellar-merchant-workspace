// MIT. Continue the original five invoices through named unfinished preparation.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import * as Draft from './web/invoice-drafts.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
export async function receiveInvoiceWorkingCopies({page,opening,scenario,reads,label,root,directory,save,originalFile,control}){
 const folder=join(root,'downloads','invoice-working-'+label+'-'+randomUUID());await directory(folder);
 const files=[],images=[],outcomes=[];
 const owner={storeId:reads.storeId,tenantId:reads.tenantId};
 // Obtain actual original store identity and complete first invoice from the
 // already connected browser's authenticated original register/read results.
 const selected=await page.evaluate(async token=>{
  const r=await fetch('/api/register?limit=50',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!r.ok)throw Error('Read the original merchant register.');
  const body=await r.json();if(r.headers.get('x-merchant-store-id')!==body.source.storeId||r.headers.get('x-merchant-tenant-id')!==body.config.tenantId)throw Error('Keep original merchant identity.');
  return {owner:{storeId:body.source.storeId,tenantId:body.config.tenantId},config:body.config};
 },scenario.operatorToken);
 Object.assign(owner,selected.owner);
 const first=reads.invoices[0],detail=await page.evaluate(async({token,owner,id})=>{
  const r=await fetch('/api/orders/'+id,{headers:{Authorization:'Bearer '+token,'X-Merchant-Store-Id':owner.storeId,'X-Merchant-Tenant-Id':owner.tenantId},cache:'no-store'});if(!r.ok)throw Error('Read the original invoice.');
  return r.json();
 },{token:scenario.operatorToken,owner,id:first.merchantOrderId});
 const original=detail.order;assert.equal(original.state,'COMPLETE');assert.equal(original.result.sha256,first.sha256);
 const idle=()=>page.waitForFunction(()=>!document.getElementById('refresh').disabled);
 const stored=()=>page.waitForFunction(()=>document.getElementById('draft-storage-state').textContent==='Saved in this browser');
 async function capture(name,p=page){const path=join(folder,name);await p.screenshot({path,fullPage:true,animations:'disabled'});const raw=await readFile(path);images.push({path,bytes:raw.length,sha256:sha(raw),viewport:p.viewportSize(),fullPage:true});}
 async function downloaded(button,name){const event=page.waitForEvent('download');await page.locator(button).click();const download=await event,path=join(folder,name);await download.saveAs(path);assert.equal(await download.failure(),null);const raw=await readFile(path);files.push(await originalFile(path,{bytes:raw.length,sha256:sha(raw)}));return {path,raw,value:JSON.parse(raw)};}
 const accept=dialog=>dialog.accept();page.on('dialog',accept);
 try{
  await page.locator('#show-create').click();await page.locator('#draft-editor').waitFor({state:'visible'});await idle();
  await page.locator('#draft-label').fill('Original invoice preparation · '+first.reference);
  await page.locator('#create-form input[name=reference]').fill(first.reference);
  await page.locator('#create-form input[name=title]').fill(first.title);
  for(const rail of selected.config.template.rails){
   const saved=original.frozen.rails.find(r=>r.assetId===rail.assetId);
   await page.locator('#create-form input[name=rail]').evaluateAll((items,{id,checked})=>{
    const item=items.find(i=>i.value===id);if(!item)throw Error('Original asset is absent.');item.checked=checked;item.dispatchEvent(new Event('change',{bubbles:true}));
   },{id:rail.assetId,checked:!!saved});
   if(saved)await page.locator('#rail-fields input[data-asset-id]').evaluateAll((items,{id,value})=>{
    const item=items.find(i=>i.dataset.assetId===id);if(!item)throw Error('Original amount field is absent.');item.value=value;item.dispatchEvent(new Event('input',{bubbles:true}));
   },{id:rail.assetId,value:Draft.decimal(saved.amountAtomic,rail.decimals)});
  }
  await page.locator('#draft-save').click();await stored();await idle();
  const unfinished=await downloaded('#draft-download','unfinished-working-copy.json');
  Draft.validate(unfinished.value,owner);assert.equal(unfinished.value.request,null);
  assert.equal(unfinished.value.fields.reference,first.reference);assert.equal(unfinished.value.fields.title,first.title);
  await capture('unfinished-desktop.png');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#operator-token').fill(scenario.operatorToken);await page.locator('#connect-form button').click();
  await page.locator('#workspace').waitFor({state:'visible'});await idle();await page.locator('#show-create').click();await idle();
  await page.locator('#draft-list').selectOption(unfinished.value.id);await idle();
  assert.equal(await page.locator('#create-form input[name=title]').inputValue(),first.title);
  await page.locator('#draft-new').click();await idle();await stored();
  const secondId=await page.locator('#draft-list').inputValue();assert.notEqual(secondId,unfinished.value.id);
  await page.locator('#draft-file').setInputFiles(unfinished.path);await idle();
  assert.equal(await page.locator('#draft-list').inputValue(),unfinished.value.id);
  // A second actual browser tab starts from the same IDB revision. Its later
  // edit must retain its entered values when the first tab has already saved.
  const colleague=await page.context().newPage();
  try{
   await colleague.goto(opening.url,{waitUntil:'networkidle'});
   await colleague.locator('#operator-token').fill(scenario.operatorToken);await colleague.locator('#connect-form button').click();
   await colleague.locator('#workspace').waitFor({state:'visible'});
   await colleague.locator('#show-create').click();await colleague.waitForFunction(()=>!document.getElementById('refresh').disabled);await colleague.locator('#draft-list').selectOption(unfinished.value.id);
   await colleague.waitForFunction(()=>!document.getElementById('refresh').disabled);
   await page.locator('#draft-label').fill('Original saved preparation · '+first.reference);await page.locator('#draft-save').click();await stored();await idle();
   await colleague.locator('#draft-label').fill('Colleague retained alternative · '+first.reference);
   await colleague.waitForFunction(()=>document.getElementById('creation-note').textContent.includes('Another tab changed'));
   assert.equal(await colleague.locator('#draft-label').inputValue(),'Colleague retained alternative · '+first.reference);
   await capture('actual-two-tab-conflict.png',colleague);
   const event=colleague.waitForEvent('download');await colleague.locator('#draft-download').click();const file=await event,path=join(folder,'retained-colleague-alternative.json');await file.saveAs(path);
   assert.equal(await file.failure(),null);const raw=await readFile(path);files.push(await originalFile(path,{bytes:raw.length,sha256:sha(raw)}));
  }finally{await colleague.close();}
  // This complete working copy is derived from the same original paid invoice;
  // saving/replaying it exercises the existing idempotent writer without making
  // another invoice, charge, authorization, payment or provider call.
  const originalConfig={publicOrigin:new URL(original.frozen.request.url).origin,template:original.frozen.template};
  let pending=Draft.create(owner,originalConfig,{id:original.id});
  pending.label='Receive original invoice · '+first.reference;
  pending.fields={reference:original.reference,title:original.title,prices:originalConfig.template.rails.map(rail=>{
   const p=original.frozen.rails.find(r=>r.assetId===rail.assetId);return {assetId:rail.assetId,selected:!!p,amount:p?Draft.decimal(p.amountAtomic,rail.decimals):''};})};
  pending=Draft.prepare(pending,originalConfig);
  const pendingPath=join(folder,'original-invoice-request.json');await save(pendingPath,Buffer.from(Draft.encode(pending)),{original:true});
  const pendingRaw=await readFile(pendingPath);files.push(await originalFile(pendingPath,{bytes:pendingRaw.length,sha256:sha(pendingRaw)}));
  await page.locator('#draft-file').setInputFiles(pendingPath);await idle();assert.equal(await page.locator('#draft-list').inputValue(),original.id);
  control.retainRequest(pending.request);control.interruptOnce();
  await page.locator('#create-submit').click();
  await page.waitForFunction(()=>document.getElementById('creation-note').textContent.includes('original saved invoice'));await idle();
  assert.equal(await page.locator('#create-form input[name=reference]').isDisabled(),true);
  const interrupted=await downloaded('#draft-download','interrupted-original-working-copy.json');
  assert.deepEqual(interrupted.value.request,pending.request);assert.equal(interrupted.value.receipt,null);
  await capture('original-invoice-response-recovery.png');
  await page.reload({waitUntil:'networkidle'});await page.locator('#operator-token').fill(scenario.operatorToken);
  await page.locator('#connect-form button').click();await page.locator('#workspace').waitFor({state:'visible'});await idle();
  await page.locator('#show-create').click();await idle();await page.locator('#draft-list').selectOption(original.id);await idle();
  await page.locator('#create-submit').click();await page.locator('#draft-open-invoice').waitFor({state:'visible'});await idle();
  const received=await downloaded('#draft-download','received-original-working-copy.json');
  assert.deepEqual(received.value.request,pending.request);assert.equal(received.value.receipt.id,original.id);
  await page.locator('#draft-open-invoice').click();await page.locator('#detail-content[data-order-id="'+original.id+'"]').waitFor({state:'visible'});
  assert.equal(await page.locator('#count-total').innerText(),'5');assert.equal(await page.locator('#count-complete').innerText(),'5');
  await page.setViewportSize({width:390,height:844});await page.locator('#show-create').click();await idle();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await capture('working-copies-phone.png');
  await page.locator('#hide-create').click();await idle();await page.setViewportSize({width:1440,height:1080});
  outcomes.push({unfinished:unfinished.value.id,additionalDraft:secondId,originalInvoice:original.id,requestRetained:true,receiptRetained:true,originalCount:5});
  return {schema:'stellar-forge.merchant-invoice-working-receiving.v1',owner,outcomes,files,images,
   producerInspection:{state:'AWAITING_PRODUCER_SCREEN_AND_ATTACHMENT_REVIEW',guide:'INVOICE_WORKING_COPIES.md#inspect-the-complete-delivery'}};
 }finally{page.off('dialog',accept);control.retainRequest(null);}
}
