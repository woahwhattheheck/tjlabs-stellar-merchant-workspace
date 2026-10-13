// MIT. Complete customer-to-author Research return course on the original owned project copies.
import {readFile,writeFile,mkdir,link,unlink,lstat,readdir} from 'node:fs/promises';
import {resolve,join,isAbsolute,basename,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {startFredWorkspace} from '../workspace.mjs';
import {readFredProject} from '../project.mjs';
import {privateDirectory,atomicJson,readPrivateJson,withPrivateLock} from '../../routescan/quota.mjs';
const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),clone=v=>structuredClone(v);
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const equal=(a,b)=>stable(a)===stable(b),need=(v,m)=>{if(!v)throw Error(m);};
const withoutReplay=v=>{const copy=clone(v);delete copy.replayed;delete copy.reused;return copy;};
async function maybe(file,max=768*1024*1024){try{return await readPrivateJson(file,max);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function bytesIf(file){try{const stat=await lstat(file);need(stat.isFile()&&!stat.isSymbolicLink(),'Keep ordinary complete course outputs.');return await readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function exact(file,bytes){
 await mkdir(resolve(file,'..'),{recursive:true,mode:0o700});const old=await bytesIf(file);if(old){need(old.equals(bytes),'Preserve the original complete course output: '+file);return;}
 const temporary=file+'.'+randomUUID()+'.partial';try{await writeFile(temporary,bytes,{flag:'wx',mode:0o600});try{await link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(file)).equals(bytes),'Concurrent original output differs.');}}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
function product(state,id){const value=state.research.products.find(p=>p.id===id);need(value,'Keep the original selected Research product.');return value;}
function definition(state,id){const p=product(state,id);return clone(p.versions.find(v=>v.id===p.currentId).definition);}
function safeName(value){return String(value).replace(/[^A-Za-z0-9_.-]+/g,'_').slice(0,120)||'original';}
export async function runResearchReturnBrowserCourse({directory,manifestPath,browserConfig,phase='operate'}={}){
 need(isAbsolute(directory??'')&&['operate','receive'].includes(phase),'Select the existing complete course and browser phase.');
 need(browserConfig&&isAbsolute(browserConfig.playwrightModule??'')&&isAbsolute(browserConfig.chromium??''),'Use the existing equipped native browser.');
 directory=await privateDirectory(resolve(directory));manifestPath=resolve(manifestPath??join(directory,'return-course.json'));
 return withPrivateLock(directory,'return-course.lock',async()=>{
  const manifest=await readPrivateJson(manifestPath,4*1024*1024);
  need(manifest.schema==='stellar-forge.research-return-course.v1'&&manifest.operation&&manifest.productId&&/^[a-f0-9]{64}$/.test(manifest.packageSha256),'Open the whole original prepared return course.');
  need(isAbsolute(manifest.producerDirectory)&&isAbsolute(manifest.customerDirectory)&&manifest.producerDirectory!==manifest.selection.producerDirectory&&manifest.customerDirectory!==manifest.selection.customerDirectory,'Operate only the original course-owned project copies.');
  if(phase==='receive')need(manifest.phase==='RECEIVED'&&isAbsolute(manifest.producerReceivedDirectory)&&isAbsolute(manifest.customerReceivedDirectory),'Finish original independent v9 receiving before its browser phase.');
  const root=await privateDirectory(join(directory,phase==='operate'?'return-browser':'return-browser-received'));
  const file=name=>join(root,name),selection={operation:manifest.operation,productId:manifest.productId,packageSha256:manifest.packageSha256,
   original:manifest.original,originalEditionId:manifest.originalEditionId,originalDefinitionId:manifest.originalDefinitionId,
   producerDirectory:manifest.producerDirectory,customerDirectory:manifest.customerDirectory,scenario:manifest.scenario,
   phase,...(phase==='receive'?{producerReceivedDirectory:manifest.producerReceivedDirectory,customerReceivedDirectory:manifest.customerReceivedDirectory,
    producerBundleSha256:manifest.producerBundleSha256,customerBundleSha256:manifest.customerBundleSha256}:{})};
  const state=await maybe(file('journey.json'))??{schema:'stellar-forge.research-return-browser-journal.v1',selection,steps:[],requests:[],downloads:[],screenshots:[],sources:[]};
  need(equal(state.selection,selection),'Continue the same original return operation, products and project copies.');
  const save=()=>atomicJson(root,'journey.json',state);
  async function retain(name,bytes,kind='artifact',metadata={}){
   await exact(file(name),bytes);const descriptor={path:file(name),bytes:bytes.length,sha256:sha(bytes),kind,...metadata};
   const previous=state.downloads.find(x=>x.path===descriptor.path);if(previous)need(equal(previous,descriptor),'Retained complete file identity changed.');
   else state.downloads.push(descriptor);await save();return descriptor;
  }
  async function step(name,run){const old=state.steps.find(s=>s.name===name);if(old)return clone(old.result);
   state.active={name,startedAt:new Date().toISOString()};await save();const result=await run();state.steps.push({...state.active,result,completedAt:new Date().toISOString()});state.active=null;await save();return result;}
  const source=await readFile(new URL(import.meta.url)),sourceHash=sha(source);
  await exact(file('source-editions/'+sourceHash+'.mjs'),source);
  if(!state.sources.some(s=>s.sha256===sourceHash)){state.sources.push({path:file('source-editions/'+sourceHash+'.mjs'),bytes:source.length,sha256:sourceHash});await save();}
  const resultPath=join(directory,phase==='operate'?'return-browser.json':'return-browser-received.json');
  const completedResult=await maybe(resultPath);if(completedResult&&!state.completed){need(equal(completedResult.selection,selection)&&completedResult.operation===manifest.operation,'Retain the original complete result at its checkpoint boundary.');state.result=completedResult;state.completed=true;await save();}
  if(state.completed){for(const d of [...state.downloads,...state.sources,...state.screenshots]){const bytes=await bytesIf(d.path);need(bytes&&bytes.length===d.bytes&&sha(bytes)===d.sha256,'Retained completed course bytes changed.');}
   const result=await readPrivateJson(resultPath,768*1024*1024);need(equal(result,state.result),'Original complete browser result changed.');return {resultPath,...result};}
  const imported=await import(pathToFileURL(browserConfig.playwrightModule).href),pw=imported.chromium?imported:imported.default;
  const browser=await pw.chromium.launch({headless:true,executablePath:browserConfig.chromium,args:['--no-sandbox','--disable-dev-shm-usage']});
  let server=null,context=null,page=null,role=null,projectDirectory=null,projectId=null;const pageErrors=[];
  const timeout=browserConfig.timeoutMs??300000;need(Number.isSafeInteger(timeout)&&timeout>=30000&&timeout<=1800000,'Use a bounded original operation timeout.');
  async function close(){if(context){await context.close();context=null;page=null;}if(server){await server.close();server=null;}}
  async function ready(){
   await page.waitForFunction(()=>{const button=document.getElementById('rr-refresh');return button&&!button.disabled;},null,{timeout});
  }
  async function openProject(path,name){
   await close();role=name;projectDirectory=path;projectId=(await readFredProject(path)).id;
   server=await startFredWorkspace({directory:path,port:0});context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
   page=await context.newPage();page.setDefaultTimeout(Math.min(timeout,60000));page.on('pageerror',e=>pageErrors.push({role:name,message:String(e)}));
   await page.goto(server.url,{waitUntil:'domcontentloaded'});await page.locator('[data-tab="research"]').click();await ready();
   need(await page.locator('link[href="/research-returns.css"]').count()===1,'Load the installed return stylesheet through the original CSP.');
   return page;
  }
  async function api(path,body){
   const response=await fetch(server.origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+new URL(server.url).hash.slice(1),'x-fred-project-id':projectId,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const value=await response.json();need(response.ok,value.message??'Original native request failed.');return value;
  }
  async function shot(name,width=1440){
   const target=file('views/'+name+'-'+width+'.png'),old=await bytesIf(target);if(old){const d={path:target,bytes:old.length,sha256:sha(old)};if(!state.screenshots.some(x=>x.path===target)){state.screenshots.push(d);await save();}return d;}
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts?.ready);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   need(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),'Inspect and fix horizontal overflow in the actual '+name+' view.');
   const bytes=await page.screenshot({fullPage:true});await exact(target,bytes);const d={path:target,bytes:bytes.length,sha256:sha(bytes)};state.screenshots.push(d);await save();return d;
  }
  async function download(control,name,expected,validate){
   const target=file(name),old=await bytesIf(target);
   const check=async bytes=>{if(expected?.bytes!==undefined)need(bytes.length===expected.bytes,'Original download length changed.');if(expected?.sha256)need(sha(bytes)===expected.sha256,'Original download SHA changed.');if(validate)await validate(bytes);};
   if(old){await check(old);return retain(name,old,'download',expected?{filename:expected.filename??basename(target)}:{});}
   const waiting=page.waitForEvent('download',{timeout});waiting.catch(()=>{});
   await control.click();const item=await waiting;need(!await item.failure(),'Complete original browser download failed.');
   const temporary=file('download-'+randomUUID()+'.partial');await item.saveAs(temporary);let bytes;try{bytes=await readFile(temporary);}finally{await unlink(temporary);}
   await check(bytes);return retain(name,bytes,'download',expected?{filename:expected.filename??item.suggestedFilename()}:{});}
  async function productForm(){await ready();const revision=(await readFredProject(projectDirectory)).revision;await page.waitForFunction(revision=>Number(document.getElementById('research-workspace')?.dataset.researchRevision)>=revision,revision,{timeout});await page.locator('#research-product-select option[value="'+manifest.productId+'"]').waitFor({state:'attached',timeout});await page.locator('#research-product-select').selectOption(manifest.productId);need(await page.locator('#research-product-id').inputValue()===manifest.productId,'Open the original complete product form.');}
  async function openReturn(id){
   await ready();const selectedSection=role.startsWith('customer')?'sent':'received';await page.locator('#rr-section').selectOption(selectedSection);await page.waitForFunction(section=>document.getElementById('rr-inventory')?.dataset.section===section,selectedSection,{timeout});await ready();
   for(let n=0;n<100000;n++){
    const button=page.locator('[data-return-id="'+id+'"]');if(await button.count()){await button.click();await ready();break;}
    need(!await page.locator('#rr-next').isDisabled(),'The original retained return is absent.');const oldOffset=await page.locator('#rr-inventory').getAttribute('data-offset');await page.locator('#rr-next').click();await page.waitForFunction(offset=>document.getElementById('rr-inventory')?.dataset.offset!==offset,oldOffset,{timeout});await ready();
   }
   need((await page.locator('#rr-selection').innerText()).includes(id),'Open the complete original return selection.');
  }
  async function exportCompanionDirect(request){
   if(!request.action.startsWith('research-return-'))return null;
   const packet=await page.evaluate(async projectId=>{
    const module=await import('/research-return-work.mjs'),tabId=sessionStorage.getItem('fred-research-return-tab');
    const store=await module.createResearchReturnWork({projectId,tabId});return store.exportWork();
   },projectId);
   need(packet.operations.some(x=>x.id===request.id&&equalBrowser(x.bodyText,request)),'The original request was not durably stored before HTTP.');
   function equalBrowser(text,value){return equal(JSON.parse(text),value);}
   return retain('requests/'+request.id+'.before.work.json',json(packet),'browser-companion');
  }
  async function adoptCompanion(path){
   await ready();await page.locator('#rr-work-file').setInputFiles(path);await page.locator('#rr-import-work').click();await ready();
   need(!(await page.locator('#rr-status').getAttribute('class')??'').includes('rr-error'),'Complete browser companion was not received.');
   await page.locator('#rr-reload-work').click();await ready();
  }
  async function act(name,action,setup,{lose=false}={}){
   const requestName='requests/'+name+'.request.json',resultName='requests/'+name+'.result.json',prior=await maybe(file(requestName));
   let request=prior,expected=null,trigger;
   if(prior){
    need(prior.action===action&&prior.projectId===projectId,'Continue the same original copied-project request.');
    const result=await api('/api/action',prior),existing=await maybe(file(resultName));
    if(existing)need(equal(withoutReplay(existing),withoutReplay(result)),'Original native replay returned another result.');
    else await retain(resultName,json(result),'native-result');
    await page.locator('#refresh').click();await ready();
    if(!state.requests.some(x=>x.id===prior.id)){state.requests.push({id:prior.id,action,projectId,requestPath:file(requestName),resultPath:file(resultName)});await save();}
    return existing??result;
   }
   ({expected,trigger}=await setup());
   const expectedPath='requests/'+name+'.business.json';await retain(expectedPath,json({projectId,action,expected}),'selection');
   let settled=false,caught=null,result=null,observed=null;
   const handler=async route=>{
    const body=route.request().postDataJSON();if(body.action!==action){await route.continue();return;}
    try{
     const business=Object.fromEntries(Object.entries(body).filter(([k])=>!['id','action','projectId','expectedRevision'].includes(k)));
     need(body.projectId===projectId&&equal(business,expected),'The UI selected different original business fields.');
     request=body;await retain(requestName,json(body),'native-request');await exportCompanionDirect(body);
     const response=await route.fetch({timeout});observed=await response.json();need(response.ok(),observed.message??'Original UI mutation failed.');
     result=observed;await retain(resultName,json(result),'native-result');
     if(lose)await route.abort('failed');else await route.fulfill({response});settled=true;
    }catch(e){caught=e;settled=true;await route.abort('failed').catch(()=>{});}
   };
   await page.route(server.origin+'/api/action',handler);
   try{
    await trigger();const end=Date.now()+timeout;
    while(!settled&&Date.now()<end){need(!page.isClosed(),'Original page closed; continue its retained request.');await page.waitForTimeout(100);}
    need(settled,'Original action timed out; resume its same retained request.');if(caught)throw caught;
   }finally{await page.unroute(server.origin+'/api/action',handler);}
   if(lose){
    await ready();await shot(name+'-lost-response',390);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-tab="research"]').click();await ready();
    const button=page.locator('[data-return-operation="'+request.id+'"] [data-native-request-pending]');
    if(!await button.count())await adoptCompanion(file('requests/'+request.id+'.before.work.json'));
    const expectedResponse=page.waitForResponse(r=>r.url()===server.origin+'/api/action'&&r.request().method()==='POST'&&r.request().postDataJSON()?.id===request.id,{timeout});expectedResponse.catch(()=>{});
    await page.locator('[data-return-operation="'+request.id+'"] [data-native-request-pending]').click();const response=await expectedResponse,replayed=await response.json();
    need(response.ok()&&equal(withoutReplay(replayed),withoutReplay(result)),'Visible recovery did not return the same original native result.');await ready();
    await retain('requests/'+name+'.recovery.json',json(replayed),'native-replay');
   }else await ready();
   state.requests.push({id:request.id,action,projectId,requestPath:file(requestName),resultPath:file(resultName)});await save();return result;
  }
  async function returnFiles(id,label){
   await openReturn(id);const detail=await api('/api/research/return?id='+id);need(detail.returnId===id&&Array.isArray(detail.files),'Read the complete selected return inventory.');
   const outputs=[];
   for(let i=0;i<detail.files.length;i++){
    const f=detail.files[i],name='files/'+label+'/'+String(i).padStart(4,'0')+'-'+safeName(f.filename);
    const output=await download(page.locator('#rr-files button').nth(i),name,f);outputs.push({...output,...f,path:output.path});
   }
   await shot(label+'-originals',1440);await shot(label+'-originals',390);return {returnId:id,files:outputs};
  }
  async function views(items,label){
   for(const item of items){
    const type=(item.contentType??'').split(';')[0].toLowerCase();
    if(type==='application/pdf'||extname(item.filename??'')==='.pdf'){
     const prefixName=label+'-'+item.sha256.slice(0,16),receiptPath=file('views/'+prefixName+'.pdf-view.json');let receipt=await maybe(receiptPath);
     if(!receipt){const temporary=await privateDirectory(file('pdf-'+randomUUID()+'.partial')),prefix=join(temporary,prefixName);
      await exec(browserConfig.pdftoppm??'pdftoppm',['-r','100','-png',item.path,prefix],{maxBuffer:1024*1024});
      const pages=(await readdir(temporary)).filter(x=>x.startsWith(prefixName+'-')&&x.endsWith('.png')).sort();need(pages.length,'Render every page of the actual original PDF.');const files=[];
      for(const name of pages){const bytes=await readFile(join(temporary,name)),path=file('views/'+name);await exact(path,bytes);files.push({path,bytes:bytes.length,sha256:sha(bytes)});await unlink(join(temporary,name));}
      receipt={source:{path:item.path,bytes:item.bytes,sha256:item.sha256},files};await exact(receiptPath,json(receipt));
     }
     need(receipt.source.sha256===item.sha256,'Retain the same complete original PDF view.');
     for(const record of receipt.files){const bytes=await bytesIf(record.path);need(bytes&&bytes.length===record.bytes&&sha(bytes)===record.sha256,'The original PDF rendering changed.');if(!state.screenshots.some(x=>x.path===record.path))state.screenshots.push(record);}await save();
    }else if(item.file==='source'&&(type.startsWith('text/')||type.includes('json')||type.includes('xml'))){
     const bytes=await readFile(item.path),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
     const route='/'+randomUUID(),html=Buffer.from('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="'+route+'/style.css"></head><body><h1>'+escape(item.filename)+'</h1><pre><span>'+escape(text).replace(/\r/g,'&#13;')+'</span></pre></body></html>');
     const css=Buffer.from('body{font:15px/1.5 system-ui;margin:20px;color:#222;background:#fff}h1{font-size:18px;overflow-wrap:anywhere}pre{height:calc(100vh - 120px);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #888;padding:12px;box-sizing:border-box}');
     const viewServer=createServer((req,res)=>{const body=req.url===route?html:req.url===route+'/style.css'?css:null;if(!body){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':req.url===route?'text/html; charset=utf-8':'text/css; charset=utf-8','content-length':body.length,'content-security-policy':"default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'"});res.end(body);});
     await new Promise((resolve,reject)=>{viewServer.once('error',reject);viewServer.listen(0,'127.0.0.1',resolve);});
     const viewer=await context.newPage();try{
      await viewer.goto('http://127.0.0.1:'+viewServer.address().port+route,{waitUntil:'load'});
      need(await viewer.locator('pre').textContent()===text,'The safe HTTP source view changed original Unicode text.');
      for(const width of [1440,390]){await viewer.setViewportSize({width,height:1000});
       for(const position of ['first','end']){
        await viewer.locator('pre').evaluate((node,position)=>{node.scrollTop=position==='first'?0:node.scrollHeight;},position);
        need(await viewer.locator('pre').evaluate((node,position)=>position==='first'?node.scrollTop===0:node.scrollTop+node.clientHeight>=node.scrollHeight-2,position),'Inspect the actual first and final source viewports.');
        const path=file('views/'+label+'-'+item.sha256.slice(0,16)+'-'+width+'-'+position+'.png'),raw=await bytesIf(path)??await viewer.screenshot({fullPage:false});await exact(path,raw);if(!state.screenshots.some(x=>x.path===path))state.screenshots.push({path,bytes:raw.length,sha256:sha(raw)});
       }
      }await save();
     }finally{await viewer.close();await new Promise((resolve,reject)=>{viewServer.close(e=>e?reject(e):resolve());viewServer.closeAllConnections?.();});}
    }
   }
  }
  async function fullWork(name){
   return download(page.locator('#rr-export-work'),name,null,raw=>{const packet=JSON.parse(raw);need(packet.projectId===projectId&&packet.schema==='stellar-forge.research-return-browser-work.v1'&&packet.drafts.length,'Retain the actual complete project browser companion.');});
  }
  let result;
  try{
   if(phase==='operate'){
    await openProject(manifest.customerDirectory,'customer');
    const changedCustomer=await step('customer-following-definition',()=>act('customer-product','research-product-save',async()=>{
     const d=definition(await readFredProject(projectDirectory),manifest.productId);d.title+=manifest.scenario.customerTitleSuffix;need(d.title.length<=500,'The explicitly authored customer title exceeds the native bound; revise the retained scenario before beginning.');
     await productForm();await page.locator('#research-product-title').fill(d.title);
     return {expected:{definition:d},trigger:()=>page.locator('#research-product-form button').filter({hasText:'Save research product'}).click()};
    }));
    await step('customer-definition-view',async()=>{await productForm();await shot('customer-following-product',1440);await shot('customer-following-product',390);return {definition:definition(await readFredProject(projectDirectory),manifest.productId)};});
    const created=await step('customer-return',()=>act('customer-return','research-return-create',async()=>{
     await ready();await page.locator('#rr-package').selectOption(manifest.packageSha256);await page.locator('#rr-author').fill(manifest.scenario.label);await page.locator('#rr-create-note').fill('Complete customer review from the original issued package; internal operating course.');
     return {expected:{packageSha256:manifest.packageSha256,author:manifest.scenario.label,note:'Complete customer review from the original issued package; internal operating course.'},trigger:()=>page.locator('#rr-create button').click()};
    }));
    const returnId=created.returnId;need(/^[a-f0-9]{64}$/.test(returnId),'The native customer return lacks its exact identity.');
    const customerFiles=await step('customer-original-downloads',()=>returnFiles(returnId,'customer'));
    const packet=customerFiles.files.find(x=>x.file==='packet');need(packet,'Download the actual complete customer return packet.');
    await step('customer-companion',()=>fullWork('customer-browser.work.json'));
    await openProject(manifest.producerDirectory,'producer');
    await step('producer-later-definition',()=>act('producer-later-product','research-product-save',async()=>{
     const d=definition(await readFredProject(projectDirectory),manifest.productId);d.notes+=(d.notes?'\n':'')+manifest.scenario.producerNoteAppend;need(d.notes.length<=12000,'The explicitly authored producer note exceeds the native bound; retain the original scenario for correction.');
     await productForm();await page.locator('#research-product-notes').fill(d.notes);
     return {expected:{definition:d},trigger:()=>page.locator('#research-product-form button').filter({hasText:'Save research product'}).click()};
    }));
    const importedReturn=await step('producer-import',()=>act('producer-import','research-return-import',async()=>{
     await page.locator('#rr-return-file').setInputFiles(packet.path);
     return {expected:{filename:basename(packet.path),bodyBase64:(await readFile(packet.path)).toString('base64')},trigger:()=>page.locator('#rr-import button').click()};
    },{lose:true}));need(importedReturn.returnId===returnId,'The actual downloaded customer packet changed during receiving.');
    const producerFiles=await step('producer-original-downloads',()=>returnFiles(returnId,'producer'));
    await step('all-original-source-views',async()=>{await views(producerFiles.files,'producer-source');return {files:producerFiles.files.map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256}))};});
    const partial=await step('partial-native-draft',()=>act('partial-draft','research-return-draft-save',async()=>{
     await openReturn(returnId);await page.locator('#rr-compare').click();await ready();const c=await api('/api/research/return-compare?id='+returnId);
     const index=c.items.findIndex(x=>x.field==='product/title');need(index>=0,'The complete title comparison is absent.');await page.locator('#rr-field').selectOption(String(index));await page.locator('#rr-alternatives input[value="returned"]').check();
     await page.locator('#rr-label').fill('Unfinished original comparison');await page.locator('#rr-note').fill('Title reviewed; every remaining field deliberately awaits explicit review.');
     await page.locator('#rr-order').fill('');
     return {expected:{returnId,expectedDraftRevision:c.draft?.revision??0,comparisonSha256:c.comparisonSha256,choices:{'product/title':'returned'},order:[],note:'Title reviewed; every remaining field deliberately awaits explicit review.',label:'Unfinished original comparison'},trigger:()=>page.locator('#rr-save').click()};
    }));
    await step('native-draft-cold-reopen',async()=>{
     await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-tab="research"]').click();await ready();await openReturn(returnId);
     const saved=await api('/api/research/return-work?returnId='+returnId+'&revision='+partial.draftRevision);
     need(saved.work.revision===partial.draftRevision&&equal(saved.work.choices,{'product/title':'returned'})&&saved.work.order.length===0,'Cold native draft lost its exact unfinished decisions.');
     await page.locator('[data-work-revision="'+partial.draftRevision+'"]').click();await ready();
     need(JSON.parse(await page.locator('#rr-compared').textContent()).comparisonSha256===saved.comparison.comparisonSha256,'The original saved comparison context was not reopened.');
     await retain('native-saved-work.json',json(saved),'saved-work');await shot('native-unfinished-draft',1440);await shot('native-unfinished-draft',390);
     return {draftRevision:partial.draftRevision,comparisonSha256:saved.comparison.comparisonSha256};
    });
    const applied=await step('explicit-following-definition',()=>act('apply-return','research-return-apply',async()=>{
     await openReturn(returnId);await page.locator('#rr-compare').click();await ready();let c=await api('/api/research/return-compare?id='+returnId);
     const shown=JSON.parse(await page.locator('#rr-compared').textContent());if(shown.comparisonSha256!==c.comparisonSha256){await page.locator('#rr-rebase').click();await ready();}
     const choices={};for(let index=0;index<c.items.length;index++){const item=c.items[index],choice=item.field==='product/notes'?'current':item.kind==='source'?(item.current===null?'returned':'current'):'returned';choices[item.field]=choice;await page.locator('#rr-field').selectOption(String(index));await page.locator('#rr-alternatives input[value="'+choice+'"]').check();}
     need(Array.isArray(c.orders?.returned),'The actual returned requirement order is absent.');const order=c.orders.returned;
     await page.locator('#rr-order').fill(order.join('\n'));await page.locator('#rr-label').fill('Explicit customer return reconciliation');await page.locator('#rr-note').fill('Customer product choices retained with later producer notes and original current source histories.');
     await page.locator('#rr-preview').click();await ready();const preview=JSON.parse(await page.locator('#rr-preview-result').textContent());
     need(preview.comparisonSha256===c.comparisonSha256&&preview.document.title.endsWith(manifest.scenario.customerTitleSuffix)&&preview.document.notes.includes(manifest.scenario.producerNoteAppend),'Actual preview must retain the customer title and later producer notes.');
     await retain('applied-preview.json',json(preview),'preview');await shot('explicit-complete-coverage',1440);await shot('explicit-complete-coverage',390);
     return {expected:{returnId,expectedDraftRevision:c.draft?.revision??0,comparisonSha256:c.comparisonSha256,choices,order,note:'Customer product choices retained with later producer notes and original current source histories.',label:'Explicit customer return reconciliation'},trigger:()=>page.locator('#rr-apply').click()};
    }));
    need(applied.applied===true&&applied.definitionId,'The original transaction did not save the following product definition.');
    const issued=await step('original-issue-action',()=>act('issue-following','research-product-issue',async()=>{
     await productForm();await page.locator('#research-issuer').fill(manifest.scenario.label);await page.locator('#research-issue-note').fill('Following issued edition after explicit customer return reconciliation.');
     return {expected:{productId:manifest.productId,issuedBy:manifest.scenario.label,note:'Following issued edition after explicit customer return reconciliation.'},trigger:()=>page.locator('#research-issue button').click()};
    }));
    const issuedEditionId=issued.edition?.id;need(issuedEditionId,'The original explicit Issue action did not return an edition.');
    await step('producer-complete-outputs',async()=>{
     await productForm();await shot('producer-following-issued',1440);await shot('producer-following-issued',390);
     await download(page.locator('#research-export-project'),'producer-v9-project.json',null,raw=>need(JSON.parse(raw).schema?.includes('v9'),'Export the complete v9 project.'));
     const work=await fullWork('producer-browser.work.json');return {browserCompanion:work};
    });
    const producer=await readFredProject(manifest.producerDirectory),customer=await readFredProject(manifest.customerDirectory);
    need(product(producer,manifest.productId).editions.some(e=>e.id===issuedEditionId&&e.definitionId===applied.definitionId),'Retain the actual applied definition and its separate issued edition.');
    result={schema:'stellar-forge.research-return-browser.v1',operation:manifest.operation,phase:'OPERATED',producerProjectId:producer.id,customerProjectId:customer.id,returnId,appliedDefinitionId:applied.definitionId,issuedEditionId,customerDefinitionResult:changedCustomer};
   }else{
    const operated=await readPrivateJson(join(directory,'return-browser.json'),768*1024*1024);need(operated.phase==='OPERATED'&&operated.operation===manifest.operation,'Open the original operated browser chapter.');const returnId=operated.returnId;
    for(const item of [{role:'producer-received',path:manifest.producerReceivedDirectory,projectId:operated.producerProjectId,companion:join(directory,'return-browser','producer-browser.work.json')},{role:'customer-received',path:manifest.customerReceivedDirectory,projectId:operated.customerProjectId,companion:join(directory,'return-browser','customer-browser.work.json')}]){
     await openProject(item.path,item.role);need(projectId===item.projectId,'The whole received project identity changed.');
     await step(item.role+'-complete-reopen',async()=>{
      await adoptCompanion(item.companion);await openReturn(returnId);const files=await returnFiles(returnId,item.role);
      const work=await fullWork(item.role+'.browser.work.json');
      if(item.role==='producer-received'){const c=await api('/api/research/return-compare?id='+returnId);need(c.draft?.history.length,'The v9 archive lost original saved work history.');
       for(const h of c.draft.history){await page.locator('[data-work-revision="'+h.revision+'"]').click();await ready();const original=await api('/api/research/return-work?returnId='+returnId+'&revision='+h.revision);await retain('saved-work/'+h.revision+'.json',json(original),'saved-work');need(JSON.parse(await page.locator('#rr-compared').textContent()).comparisonSha256===original.comparison.comparisonSha256,'Independent receiving lost the original saved comparison context.');}}
      await productForm();await shot(item.role+'-full',1440);await shot(item.role+'-full',390);await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-tab="research"]').click();await ready();await openReturn(returnId);await shot(item.role+'-cold',390);
      return {projectId:item.projectId,files,browserCompanion:work};
     });
    }
    result={schema:'stellar-forge.research-return-browser.v1',operation:manifest.operation,phase:'RECEIVED',returnId,producerProjectId:operated.producerProjectId,customerProjectId:operated.customerProjectId,appliedDefinitionId:operated.appliedDefinitionId,issuedEditionId:operated.issuedEditionId};
   }
   need(!pageErrors.length,'Fix actual browser script errors before completing: '+JSON.stringify(pageErrors));
   const requests=[];for(const r of state.requests)requests.push({...r,body:await readPrivateJson(r.requestPath,768*1024*1024),result:await readPrivateJson(r.resultPath,768*1024*1024)});
   result={...result,selection,requests,downloads:clone(state.downloads),screenshots:clone(state.screenshots),sourceEditions:clone(state.sources),completedStages:state.steps.map(s=>s.name),ownerReview:'The original producing owner must open and VIEW the actual desktop/narrow screenshots, complete source/PDF pages, original return/package files and received projects; repair concrete rendered faults before presentation.'};
   await exact(resultPath,json(result));state.result=result;state.completed=true;await save();return {resultPath,...result};
  }finally{await close();await browser.close();}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const config=process.argv[2];if(!config)throw Error('Use one complete JSON course configuration.');
 runResearchReturnBrowserCourse(JSON.parse(await readFile(resolve(config),'utf8'))).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
}
