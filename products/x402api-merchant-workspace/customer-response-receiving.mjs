// MIT. Same issued review, native disposition, recipient response and following return.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {parseReview,parseMerchantResponse,canonical} from './customer-review-core.mjs';
import {main as operate} from './operator-cli.mjs';
import {MERCHANT_OPERATOR_CONNECTION_SCHEMA} from './operator-client.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const optional=async p=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export async function receiveMerchantResponseCourse({browser,client,opening,scenario,invoiceId,decision,originalReturnPath,root,identity,directory,save,originalFile}){
 const folder=join(root,'customer-response-course');await directory(folder);
 const owner={storeId:client.connection.storeId,tenantId:client.connection.tenantId};
 const originalText=await readFile(originalReturnPath,'utf8'),original=await parseReview(originalText);
 assert.equal(original.issue.invoiceId,invoiceId);assert.deepEqual(original.issue.owner,owner);
 assert.equal(sha(originalText),decision.returnSha256);assert(original.editions.some(e=>e.sha256===decision.editionSha256));
 const selected={schema:'stellar-forge.merchant-customer-response-input.v1',owner,invoiceId,issueId:original.issue.id,
  reviewId:original.id,returnSha256:decision.returnSha256,decision:JSON.parse(canonical(decision))};
 await save(join(folder,'selection.json'),selected,{original:true});
 const completePath=join(folder,'complete.json'),prior=await optional(completePath);
 if(prior){assert.deepEqual(prior.selection,selected);for(const f of [...prior.files,...prior.images])await originalFile(f.path,f);
  const history=await client.customerReviews(invoiceId);assert(history.returns.some(r=>r.sha256===prior.followingReturnSha256));return {...prior,reopened:true};}
 const files=[],images=[],errors=[];let context=null;
 async function retain(path){const raw=await readFile(path),f=await originalFile(path,{bytes:raw.length,sha256:sha(raw)});files.push(f);return f;}
 async function originalJSON(name,make){const path=join(folder,name),old=await optional(path);if(old)return old;const value=await make();await save(path,value,{original:true});return value;}
 const responsePath=join(folder,'Merchant_Response.json'),responseHTML=join(folder,'Customer_Response.html');
 await client.downloadCustomerResponse(invoiceId,decision.id,responsePath);await client.downloadCustomerResponseDocument(invoiceId,decision.id,responseHTML);
 const responseRaw=await readFile(responsePath,'utf8'),response=await parseMerchantResponse(responseRaw);
 assert.equal(response.decision.id,decision.id);assert.equal(response.editionSha256,decision.editionSha256);
 assert.equal(response.returnSha256,decision.returnSha256);assert.equal(response.decision.note,decision.note);
 assert.equal(Object.hasOwn(response.decision,'supportCaseId'),false);assert.equal(Object.hasOwn(response.decision,'requestId'),false);
 await retain(responsePath);await retain(responseHTML);await retain(join(folder,'selection.json'));
 const connection={schema:MERCHANT_OPERATOR_CONNECTION_SCHEMA,url:opening.url,...owner,tokenEnvironment:'MERCHANT_RESPONSE_RECEIVING_TOKEN',timeoutMs:120000};
 const connectionPath=join(folder,'connection-'+sha(JSON.stringify(connection))+'.json');await save(connectionPath,connection,{original:true});await retain(connectionPath);
 for(const [command,expected,name]of [['customer-review-response',responsePath,'CLI_Merchant_Response.json'],['customer-review-response-document',responseHTML,'CLI_Customer_Response.html']]){
  const target=join(folder,name),receiptPath=join(folder,name+'.receipt.json'),originalReceipt=await optional(receiptPath);
  let receipt=originalReceipt;
  if(!receipt){let stdout='';
   await operate([command,'--connection',connectionPath,'--id',invoiceId,'--operation',decision.id,'--out',target],{environment:{MERCHANT_RESPONSE_RECEIVING_TOKEN:scenario.operatorToken},stdout:{write:text=>{stdout+=text;}}});
   receipt=JSON.parse(stdout);
  }
  const raw=await readFile(target);assert.deepEqual(raw,await readFile(expected));
  assert.equal(receipt.path,target);assert.equal(receipt.bytes,raw.length);assert.equal(receipt.sha256,sha(raw));assert.equal(typeof receipt.reused,'boolean');
  await retain(target);if(!originalReceipt)await save(receiptPath,receipt,{original:true});await retain(receiptPath);
 }
 let recipient=await optional(join(folder,'recipient-complete.json'));
 if(recipient){for(const f of [...recipient.files,...recipient.images])await originalFile(f.path,f);files.push(...recipient.files);images.push(...recipient.images);}
 else {
  const attempt=join(folder,'attempt-'+randomUUID());await directory(attempt);const recipientFiles=[],recipientImages=[];
  const retainRecipient=async path=>{const f=await retain(path);recipientFiles.push(f);return f;};
  try {
   context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1080}});
   await context.route('**/*',route=>new URL(route.request().url()).protocol==='file:'&&route.request().method()==='GET'?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(responseHTML).href,{waitUntil:'load'});await page.waitForFunction(()=>!document.querySelector('#save').disabled);
   assert.equal(await page.locator('#responses article').count(),1);
   const seed=JSON.parse(await page.locator('#review-data').textContent());
   assert.deepEqual(seed.editions,original.editions);assert.deepEqual(seed.draft,original.draft);assert.deepEqual(seed.files,original.files);
   page.on('dialog',d=>d.accept());
   // Select the complete original customer return, then adopt the response while actual newer entered work remains.
   await page.locator('#open-file').setInputFiles(originalReturnPath);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('portable review is open'));
   const unfinished='Following clarification after merchant response; original unfinished note: '+original.draft.summary;
   await page.locator('#summary').fill(unfinished);
   const wrong=JSON.parse(responseRaw);wrong.decision.note+=' altered';const wrongPath=join(attempt,'Rejected_Altered_Response.json');
   await save(wrongPath,wrong,{original:true});await retainRecipient(wrongPath);
   await page.locator('#open-response').setInputFiles(wrongPath);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('original merchant response changed'));
   assert.equal(await page.locator('#summary').inputValue(),unfinished);assert.equal(await page.locator('#responses article').count(),0);
   await page.locator('#open-response').setInputFiles(responsePath);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Original merchant response retained'));
   assert.equal(await page.locator('#summary').inputValue(),unfinished);assert.equal(await page.locator('#responses article').count(),1);
   await page.locator('#open-response').setInputFiles(responsePath);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Original merchant response retained'));assert.equal(await page.locator('#responses article').count(),1);
   await page.locator('#record').click();await page.waitForFunction(count=>document.querySelectorAll('#history details').length===count,original.editions.length+1);
   await page.locator('#summary').fill('A further unfinished response note remains after the following recorded edition.');
   await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('saved in this browser'));
   async function download(button,name){const event=page.waitForEvent('download');await button.click();const d=await event,path=join(attempt,name);await d.saveAs(path);assert.equal(await d.failure(),null);await retainRecipient(path);return path;}
   const returnPath=await download(page.locator('#return'),'Customer_Following_Return.json');
   const working=await download(page.locator('#json'),'Customer_Response_Working.json'),html=await download(page.locator('#html'),'Customer_Response_Continued.html');
   const downloadedResponse=await download(page.getByRole('button',{name:'Download original merchant response',exact:true}),'Original_Merchant_Response.json');
   assert.equal(await readFile(downloadedResponse,'utf8'),responseRaw);
   const following=await parseReview(await readFile(returnPath,'utf8'));assert.deepEqual(following.editions.slice(0,-1),original.editions);
   assert.deepEqual(following.files,original.files);assert.equal(following.editions.at(-1).draft.summary,unfinished);
   assert.equal(following.responses[0].text,responseRaw);assert.deepEqual(following.editions.at(-1).responseSha256s,[sha(responseRaw)]);
   assert.notEqual(following.draft.summary,following.editions.at(-1).draft.summary);
   async function capture(name){const path=join(attempt,name);await page.screenshot({path,fullPage:true,animations:'disabled'});const raw=await readFile(path),f=await originalFile(path,{bytes:raw.length,sha256:sha(raw)});images.push(f);recipientImages.push(f);}
   await capture('response-desktop.png');await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
   assert((await page.locator('#print-review').textContent()).includes(decision.note));
   assert((await page.locator('#print-review').textContent()).includes(unfinished));
   const pdf=join(attempt,'Complete_Response_Review.pdf');await page.pdf({path:pdf,format:'A4',printBackground:true});await retainRecipient(pdf);await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
   await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await capture('response-phone.png');
   const cold=await context.newPage();cold.on('pageerror',e=>errors.push(e.message));await cold.goto(pathToFileURL(html).href,{waitUntil:'load'});
   await cold.waitForFunction(()=>!document.querySelector('#save').disabled);assert.equal(await cold.locator('#responses article').count(),1);
   assert.equal(await cold.locator('#summary').inputValue(),following.draft.summary);assert.equal(await cold.locator('#history details').count(),following.editions.length);
   // Reopening JSON also preserves the complete original response and unfinished alternative.
   await cold.locator('#open-file').setInputFiles(working);await cold.waitForFunction(()=>document.querySelector('#status').textContent.includes('portable review is open'));
   assert.equal(await cold.locator('#responses article').count(),1);assert.equal(await cold.locator('#summary').inputValue(),following.draft.summary);
   await cold.close();await page.close();await context.close();context=null;assert.deepEqual(errors,[]);
   recipient={returnPath,followingReturnSha256:sha(await readFile(returnPath)),working,html,files:recipientFiles,images:recipientImages};
   await save(join(folder,'recipient-complete.json'),recipient,{original:true});
  }finally{if(context)await context.close();}
 }
 const followingText=await readFile(recipient.returnPath,'utf8'),following=await parseReview(followingText);
 assert.equal(sha(followingText),recipient.followingReturnSha256);assert.deepEqual(following.editions.slice(0,-1),original.editions);
 const request=await originalJSON('following-return-request.json',async()=>({invoiceId,requestId:identity('customer-review-following-return'),
  expectedReviewVersion:(await client.customerReviews(invoiceId)).reviewVersion,text:followingText}));
 assert.equal(request.text,followingText);assert.equal(request.invoiceId,invoiceId);
 const received=await client.receiveCustomerReview(request);assert.equal(received.returnSha256,recipient.followingReturnSha256);
 assert.deepEqual(await client.receiveCustomerReview(request),received);
 await save(join(folder,'following-return-result.json'),received,{original:true});
 const comparison=await client.compareCustomerReview(invoiceId,received.returnSha256);assert.equal(comparison.invoiceChanged,false);
 assert.equal(comparison.unfinishedReturnedDraft,true);assert.equal(comparison.returned.responses[0].text,responseRaw);
 assert.equal(comparison.returned.editions.length,original.editions.length+1);
 await save(join(folder,'following-comparison.json'),comparison,{original:true});
 for(const name of ['recipient-complete.json','following-return-request.json','following-return-result.json','following-comparison.json'])await retain(join(folder,name));
 const result={schema:'stellar-forge.merchant-customer-response-receiving.v1',selection:selected,invoiceId,decisionId:decision.id,
  originalReturnSha256:decision.returnSha256,followingReturnSha256:received.returnSha256,responsePath,responseHTML,
  responseSha256:sha(responseRaw),selectedCustomerEdition:{sha256:decision.editionSha256,sequence:original.editions.find(e=>e.sha256===decision.editionSha256).sequence,latestSequence:original.editions.length},followingEditionSha256:following.editions.at(-1).sha256,files,images,
  producerInspection:{state:'AWAITING_PRODUCER_LOOK',guide:'CUSTOMER_REVIEWS.md#merchant-response-and-following-customer-review'}};
 await save(completePath,result,{original:true});return result;
}
