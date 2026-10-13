// MIT. Open and operate the exact outgoing MCP files from the original saved customer.
import { readFile, open, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import model from './model.cjs';
import { canonical } from '../core.mjs';

const need=(value,message)=>{if(!value)throw new Error(message);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const modelOptions={hash:sha,hashBytes:value=>sha(Buffer.from(value))};
const utf8=value=>new TextDecoder('utf-8',{fatal:true}).decode(value);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function checked(info){
 const bytes=await readFile(info.path);need(bytes.length===info.bytes&&sha(bytes)===info.sha256,'The outgoing MCP file changed: '+info.path);return bytes;
}
async function retain(path,bytes){
 const temporary=path+'.'+randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);
 try{await file.writeFile(bytes);await file.sync();await file.close();await rename(temporary,path);}
 catch(error){await file.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}
 return {path,bytes:bytes.length,sha256:sha(bytes)};
}
/**
 * Runs only after the native clients, provider and HTTP owners have closed.
 * Opens the actual downloaded editor and complete source-backed outgoing files.
 * The new browser is this course's own isolated headless process.
 */
export async function renderResponseReviewTools({caseDirectory,result,save}){
 const selected={record:result.course.record,files:Object.fromEntries(Object.entries(result.downloads).map(([k,v])=>[k,{bytes:v.bytes,sha256:v.sha256}])),
  attachments:result.attachments.map(({id,bytes,sha256})=>({id,bytes,sha256}))};
 const inputSha256=sha(canonical(selected));
 if(result.renderedDelivery?.status==='captured'){
  need(result.renderedDelivery.inputSha256===inputSha256,'The completed outgoing views belong to another file edition.');
  for(const info of [...result.renderedDelivery.screenshots,...result.renderedDelivery.downloads])await checked(info);
  return result.renderedDelivery;
 }
 const document=JSON.parse(utf8(await checked(result.downloads.document))).document;
 const editorBytes=await checked(result.downloads.editor),editorText=utf8(editorBytes);
 const prefix='<script>window.CANADABUYS_RESPONSE_TRANSFER=',start=editorText.indexOf(prefix),end=editorText.indexOf(';</script>',start+prefix.length);
 need(start>=0&&end>start,'The exact outgoing editor lacks its complete original working file.');
 const embedded=await model.validateTransfer(JSON.parse(editorText.slice(start+prefix.length,end)),modelOptions);
 need(canonical(embedded.base.document)===canonical(document),'The outgoing editor is not the exact downloaded document.');
 const original=JSON.parse(utf8(await readFile(join(caseDirectory,'case-result.json'))));
 const executable=[process.env.CANADABUYS_BROWSER_EXECUTABLE,original.browser?.executable,
  '/workspace/scratch/6cf60819dc7c/grant-browser-runtime/headless-shell-155.0.8059.39/chrome-headless-shell-linux64/chrome-headless-shell',
  '/tmp/chromium'].filter(Boolean).find(existsSync);
 need(executable,'Use the original accepted isolated Chromium executable for the actual outgoing files.');
 const directory=join(result.directory,'rendered-'+randomUUID());await mkdir(directory,{mode:0o700});
 if(result.renderedDelivery)result.renderedAttempts=[...(result.renderedAttempts||[]),result.renderedDelivery];
 const view={schema:'starforge.canadabuys.response-review-mcp-rendered.v1',inputSha256,selected,
  directory,executable,status:'running',startedAt:new Date().toISOString(),screenshots:[],downloads:[],documents:[],errors:[],network:[]};
 result.renderedDelivery=view;await save();
 const require=createRequire(import.meta.url);
 const playwright=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
 let browser,context,page,failure;
 const errors=[],network=[];
 async function screenshot(label,description){
  const path=join(directory,String(view.screenshots.length+1).padStart(4,'0')+'-'+label+'.png');
  const bytes=await page.screenshot({path,fullPage:false});
  const info={path,bytes:bytes.length,sha256:sha(bytes),label,description,viewport:page.viewportSize()};
  view.screenshots.push(info);await save();
 }
 async function capturePage(label){
  await page.evaluate(()=>window.scrollTo(0,0));
  const size=await page.evaluate(()=>({height:innerHeight,width:innerWidth,total:document.documentElement.scrollHeight,
   scrollWidth:document.documentElement.scrollWidth}));
  need(size.scrollWidth<=size.width+2,'The outgoing '+label+' view overflows its actual viewport.');
  const step=Math.max(1,Math.floor(size.height*0.8));
  for(let top=0;;top+=step){
   const at=Math.min(top,Math.max(0,size.total-size.height));
   await page.evaluate(y=>window.scrollTo(0,y),at);
   await screenshot(label,'Complete outgoing page at vertical offset '+at);
   if(at+size.height>=size.total)break;
  }
 }
 async function capturePanes(selector,label){
  const panes=await page.locator(selector).all();
  for(let index=0;index<panes.length;index++){
   const pane=panes[index];if(!await pane.isVisible())continue;
   const geometry=await pane.evaluate(el=>({height:el.clientHeight,total:el.scrollHeight}));
   if(geometry.total<=geometry.height+1||geometry.height<=0)continue;
   await pane.scrollIntoViewIfNeeded();
   const step=Math.max(1,Math.floor(geometry.height*0.8));
   for(let top=0;;top+=step){
    const at=Math.min(top,geometry.total-geometry.height);
    await pane.evaluate((el,y)=>{el.scrollTop=y;},at);
    await screenshot(label+'-pane-'+index,'Original scroll control at content offset '+at);
    if(at+geometry.height>=geometry.total)break;
   }
   await pane.evaluate(el=>{el.scrollTop=0;});
  }
 }
 async function expand(selector){
  for(;;){
   let changed=false;
   for(const item of await page.locator(selector+' details:not([open])').all()){
    if(!await item.isVisible())continue;
    await item.locator(':scope > summary').click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    changed=true;break;
   }
   if(!changed)break;
  }
 }
 async function downloadFrom(action,name,expected){
  const pending=page.waitForEvent('download');await action();const download=await pending;
  const path=join(directory,name);await download.saveAs(path);const bytes=await readFile(path);
  const info={path,bytes:bytes.length,sha256:sha(bytes),suggestedFilename:download.suggestedFilename()};
  if(expected)need(info.bytes===expected.bytes&&info.sha256===expected.sha256,'The actual browser download differs from its original bytes.');
  view.downloads.push(info);await save();return {bytes,info};
 }
 async function showText(info,label){
  const bytes=await checked(info),text=utf8(bytes);
  const body='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>'+escape(label)+'</title><style>body{margin:0;padding:24px;background:#fff;color:#202020;font:16px system-ui}h1{font-size:22px}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;font:14px/1.5 ui-monospace,monospace}a{color:inherit}</style></head><body>'+
   '<h1>'+escape(label)+'</h1><p>Complete original UTF-8 file. '+bytes.length+' bytes. SHA256 '+info.sha256+'</p>'+
   '<p><a id="original-download" download href="'+escape(pathToFileURL(resolve(info.path)).href)+'">Download the original file</a></p><pre id="complete-original">'+escape(text)+'</pre></body></html>';
  const rendered=await retain(join(directory,'reader-'+sha(label).slice(0,16)+'.html'),Buffer.from(body));
  await page.goto(pathToFileURL(rendered.path).href,{waitUntil:'domcontentloaded'});
  need(await page.locator('#complete-original').textContent()===text.replace(/\r\n?/g,'\n'),'The complete file reader omitted original source text.');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await capturePage('file-'+sha(label).slice(0,8)+'-'+width);
  }
  await downloadFrom(()=>page.locator('#original-download').click(),'reopened-'+sha(label).slice(0,16),info);
  view.documents.push({original:info,reader:rendered,characters:text.length});await save();
 }
 try{
  browser=await playwright.chromium.launch({headless:true,executablePath:executable,
   args:['--no-sandbox','--disable-dev-shm-usage'],env:process.env});
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:\/\//,async route=>{network.push(route.request().url());await route.abort();});
  await page.goto(pathToFileURL(result.downloads.editor.path).href,{waitUntil:'domcontentloaded'});
  await page.locator('#response-identity').filter({hasText:result.course.record.id}).waitFor();
  need((await page.locator('#response-identity').textContent()).includes('baseline revision '+result.course.record.revision),
   'The actual outgoing editor opened another baseline revision.');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   for(const tab of ['source','answers','annexes','attachments','history']){
    await page.locator('[data-tab="'+tab+'"]').click();await expand('#tab-'+tab);
    if(tab==='answers'||tab==='annexes'){
     const originals=document.content[tab],cards=page.locator('[data-kind="'+tab+'"]');
     need(await cards.count()===originals.length,'The outgoing editor omitted a complete original response section.');
     for(let i=0;i<originals.length;i++){
      const card=cards.nth(i);
      need(await card.locator('.item-id').textContent()===originals[i].id,
       'The actual editor changed a selected answer/annex identifier.');
      for(const key of ['text','comment'])need(await card.locator('[data-field="'+key+'"]').inputValue()===originals[i][key],
       'The actual outgoing editor omitted original '+key+' content.');
      need(await card.locator('[data-field="status"]').inputValue()===originals[i].status,'The outgoing review status changed.');
     }
    }
    await capturePage('editor-'+tab+'-'+width);
    await capturePanes('#tab-'+tab+' textarea, #tab-'+tab+' pre, #tab-'+tab+' .tree-string','editor-'+tab+'-'+width);
   }
  }
  await page.locator('[data-tab="source"]').click();
  const originalDownload=await downloadFrom(()=>page.getByRole('button',{name:'Download complete original response',exact:true}).click(),'complete-original-response.json');
  need(canonical(JSON.parse(utf8(originalDownload.bytes)))===canonical(document),'The actual original-response download lost complete saved source.');
  // Important controls operate the same exported document without creating a new named edition.
  await page.locator('[data-tab="answers"]').click();
  const empty='no-response-id-'+randomUUID();
  await page.locator('#answer-filter').fill(empty);
  need(await page.locator('[data-kind="answers"]').count()===0,'The actual answer filter did not show its empty state.');
  await capturePage('editor-empty-search');await page.locator('#answer-filter').fill('');
  const saved=await downloadFrom(()=>page.locator('#save-draft').click(),'exact-outgoing-working.json');
  const draft=await model.validateTransfer(JSON.parse(utf8(saved.bytes)),modelOptions);
  need(canonical(draft)===canonical(embedded),'Saving the unchanged outgoing editor changed its complete working source.');
  await page.locator('#working-file').setInputFiles(saved.info.path);
  await page.locator('#notice').filter({hasText:'Opened the complete working file.'}).waitFor();
  need(await page.locator('#answer-count').textContent()===String(document.content.answers.length)
   &&await page.locator('#annex-count').textContent()===String(document.content.annexes.length),'The full working file did not reopen every section.');
  await capturePage('editor-complete-working-reopened');
  await page.locator('[data-tab="attachments"]').click();
  for(const attachment of document.attachments){
   const item=await downloadFrom(()=>page.locator('[data-download-attachment="'+attachment.id+'"]').click(),
    'attachment-'+attachment.id,attachment);
   view.documents.push({kind:'original-attachment-download',...item.info,name:attachment.name,mime:attachment.mime});
   const card=page.locator('.attachment-card').filter({has:page.locator('[data-download-attachment="'+attachment.id+'"]')});
   const preview=card.getByRole('button',{name:'View complete text',exact:true});
   if(await preview.count()){
    await preview.click();await page.locator('#detail-dialog').waitFor({state:'visible'});
    await expand('#detail-body');await screenshot('attachment-native-preview','Complete original attached text in the actual editor dialog');
    await capturePanes('#detail-dialog, #detail-dialog pre','attachment-native-preview');
    await page.locator('#close-detail').click();
   }
  }
  // Read the exact original outgoing text files and original attached text after the interactive editor.
  for(const [name,info]of Object.entries(result.downloads)){
   if(name==='editor')continue;
   await showText(info,'MCP '+name+' — complete original response');
  }
  for(const attachment of result.attachments){
   need(/^text\/|json|xml|csv|javascript/.test(attachment.mime||''),
    'Receive this original non-text attachment with its actual format viewer before declaring the whole outgoing delivery captured: '+attachment.name);
   await showText(attachment,'Original attachment — '+attachment.name);
  }
  need(errors.length===0&&network.length===0,'The actual standalone outgoing files reported browser errors or network requests.');
  view.status='captured';view.capturedAt=new Date().toISOString();view.errors=errors;view.network=network;
  view.producerInspection={status:'AWAITING_PRODUCER_LOOK',instruction:'LOOK at every exact saved page image and actual delivered file. Repair any observed readability, layout or control defect in this same original source and course.'};
  result.producerInspection={...result.producerInspection,status:'ACTUAL_CONTROLS_AND_REOPEN_CAPTURED_AWAITING_LOOK',
   renderedDirectory:directory,screenshots:view.screenshots};
  await save();
 }catch(error){failure=error;view.status='failed';view.failure={message:error.message,at:new Date().toISOString()};view.errors=errors;view.network=network;await save().catch(saveError=>{error.saveError={message:saveError.message};});}
 finally{
  const closing=[];
  if(context)try{await context.close();}catch(error){closing.push(error.message);}
  if(browser)try{await browser.close();}catch(error){closing.push(error.message);}
  if(closing.length){
   view.status='close-incomplete';view.closing=closing;
   if(failure)failure.closing=closing;else failure=new Error('The original outgoing browser did not close completely.');
   await save().catch(error=>{failure.closeSaveError={message:error.message};});
  }
 }
 if(failure)throw failure;
 return view;
}
