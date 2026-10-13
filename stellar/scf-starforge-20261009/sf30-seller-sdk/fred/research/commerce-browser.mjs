// MIT. Operate the actual Research Merchant/Customer and received economic workspaces.
import { readFile, readdir, mkdir, writeFile, link, unlink, stat } from 'node:fs/promises';
import { resolve, join, isAbsolute, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { startFredWorkspace } from '../workspace.mjs';
import { readFredProject } from '../project.mjs';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { readResearchEditionReceiving } from './delivery.mjs';
import { getResearchPublication } from './commerce.mjs';
const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>value===null?'null':Array.isArray(value)?'['+value.map(stable).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
function need(value,message){if(!value)throw new Error(message);}
async function optional(file){try{return await readPrivateJson(file,32*1024*1024);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function exact(file,bytes){
 await mkdir(resolve(file,'..'),{recursive:true,mode:0o700});
 try{const old=await readFile(file);need(old.equals(bytes),'Retained original output changed: '+file);return;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=file+'.'+randomUUID()+'.pending';
 await writeFile(temporary,bytes,{flag:'wx',mode:0o600});
 try{try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(file)).equals(bytes),'Concurrent original output changed.');}}
 finally{await unlink(temporary);}
}
async function originalAttachmentViewer(files){
 const prefix='/'+randomUUID()+'/',members=new Map();
 for(const member of files){
  const bytes=Buffer.from(member.bodyBase64,'base64');
  need(bytes.length===member.bytes&&sha(bytes)===member.sha256,'Original attachment bytes changed.');
  members.set(prefix+member.path,{bytes,type:member.contentType});
 }
 const server=createServer((request,response)=>{
  let member;
  try{member=members.get(decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname));}catch{}
  if(!member||!['GET','HEAD'].includes(request.method)){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'content-type':member.type,'content-length':member.bytes.length,
   'cache-control':'no-store','x-content-type-options':'nosniff'});
  response.end(request.method==='HEAD'?undefined:member.bytes);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:path=>'http://127.0.0.1:'+server.address().port+prefix+path.split('/').map(encodeURIComponent).join('/'),
  close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
export async function runResearchCommerceBrowserCourse({directory,projectDirectory,customer,restored,financial,identity,journal,
 browserConfig,launchOptions={}}={}){
 need(isAbsolute(directory??'')&&isAbsolute(projectDirectory??''),'Use the original native course directories.');
 need(browserConfig&&isAbsolute(browserConfig.playwrightModule??'')&&isAbsolute(browserConfig.chromium??''),'Select the existing complete browser runtime.');
 const root=await privateDirectory(join(resolve(directory),'browser')),file=name=>join(root,name);
 const sourceBytes=await readFile(new URL(import.meta.url));
 const binding={schema:'stellar-forge.research-commerce-browser-selection.v1',operation:identity.operation,
  projectId:identity.projectId,productId:identity.productId,editionId:identity.editionId,
  projectDirectory:resolve(projectDirectory),customer:customer.projectDirectory,restored:restored.directory,
  financial:financial?{publicationId:financial.publicationId,intentId:financial.intentId,directory:financial.directory}:null,
  browserConfig:clone(browserConfig)};
 const state=await optional(file('journey.json'))??{schema:'stellar-forge.research-commerce-browser.v1',binding,steps:[],files:[],views:[]};
 const priorBinding=clone(state.binding);delete priorBinding.sourceSha256;
 need(stable(priorBinding)===stable(binding),'Continue the original browser business selection and native case.');
 const save=()=>atomicJson(root,'journey.json',state);
 const retain=async(name,bytes)=>{await exact(file(name),bytes);const item={path:name,bytes:bytes.length,sha256:sha(bytes)};
  const prior=state.files.find(row=>row.path===name);if(prior)need(stable(prior)===stable(item),'A retained browser artifact changed.');
  else state.files.push(item);await save();return item;};
 const step=async(name,run)=>{const done=state.steps.find(row=>row.name===name&&row.completedAt);if(done)return done.result;
  state.active={name,startedAt:new Date().toISOString()};await save();const result=await run();
  state.steps.push({...state.active,completedAt:new Date().toISOString(),result});state.active=null;await save();return result;};
 // Executable repairs preserve the fixed business case and all completed steps.
 if(state.binding.sourceSha256){
  await retain('source-editions/original-binding.json',json(state.binding));
  state.sourceEditions??=[];
  if(!state.sourceEditions.some(item=>item.sha256===state.binding.sourceSha256))
   state.sourceEditions.push({sha256:state.binding.sourceSha256,retainedBinding:'source-editions/original-binding.json',legacy:true});
 }
 state.binding=clone(binding);
 const sourceRecord=await retain('source-editions/'+sha(sourceBytes)+'.mjs',sourceBytes);
 state.sourceEditions??=[];
 if(!state.sourceEditions.some(item=>item.sha256===sourceRecord.sha256&&!item.legacy))
  state.sourceEditions.push({...sourceRecord,selectedAt:new Date().toISOString()});
 await save();
 if(state.status==='COMPLETE'){for(const item of state.files){const bytes=await readFile(file(item.path));need(bytes.length===item.bytes&&sha(bytes)===item.sha256,'Completed browser output changed.');}await exact(file('result.json'),json(state.result));return state.result;}
 await save();
 const module=await import(pathToFileURL(browserConfig.playwrightModule).href),pw=module.chromium?module:module.default;
 const browser=await pw.chromium.launch({headless:true,executablePath:browserConfig.chromium,args:['--no-sandbox','--disable-dev-shm-usage']});
 let server=null,context=null,page=null;
 const errors=[];
 async function stop(){if(context){await context.close();context=null;page=null;}if(server){await server.close();server=null;}}
 async function open(project,paid=false){
  await stop();
  server=await startFredWorkspace({directory:project,port:0,...(paid?launchOptions:{})});
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(server.url);
  await page.waitForFunction(()=>document.getElementById('project-title')?.textContent.includes('revision'));
  return page;
 }
 async function tab(name){await page.locator('[data-tab="'+name+'"]').click();}
 async function snapshot(name,width=1440,height=1000,target=page){
  await target.setViewportSize({width,height});await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const view=await target.evaluate(()=>({title:document.title,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,text:document.body.innerText}));
  need(view.documentWidth<=width+1,'The actual '+name+' view overflows at '+width+'px.');
  const relative='views/'+sha(sourceBytes)+'/'+name+'.png';await mkdir(resolve(file(relative),'..'),{recursive:true});
  if(!state.files.some(row=>row.path===relative))await retain(relative,await target.screenshot({fullPage:true}));
  const value={name,path:relative,width,height,...view};state.views.push(value);await save();return value;
 }
 async function download(control,name,expected){
  const verify=bytes=>{
   if(expected?.bytes!==undefined)need(bytes.length===expected.bytes,'Original downloaded member length changed.');
   if(expected?.sha256)need(sha(bytes)===expected.sha256,'Original downloaded member SHA changed.');
   if(name==='complete-customer-work.json'){
    const packet=JSON.parse(bytes.toString('utf8')),{sha256,...payload}=packet;
    need(packet.schema==='stellar-forge.fred-customer-work.v1'&&packet.projectId===identity.projectId&&
     Array.isArray(packet.drafts)&&Array.isArray(packet.operations)&&sha(Buffer.from(stable(payload)))===sha256,
     'Retain the complete original customer-work download.');
   }
  };
  const old=state.files.find(row=>row.path===name);
  if(old){const bytes=await readFile(file(name));verify(bytes);need(bytes.length===old.bytes&&sha(bytes)===old.sha256,'Saved original download changed.');return old;}
  // exact() publishes atomically before the journal; keep that original completed download on restart.
  let retained;
  try{retained=await readFile(file(name));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(retained){verify(retained);return retain(name,retained);}
  const event=page.waitForEvent('download',{timeout:120000});event.catch(()=>{});
  await control.click();const item=await event,temp=file('download-'+randomUUID());
  await item.saveAs(temp);let bytes;try{bytes=await readFile(temp);}finally{await unlink(temp);}
  verify(bytes);return retain(name,bytes);
 }
 async function uiAction(name,action,trigger){
  const requestFile=file('requests/'+name+'.json'),resultFile=file('requests/'+name+'.result.json');
  const previous=await optional(requestFile);
  if(previous){
   const token=new URL(server.url).hash.slice(1);
   const response=await fetch(server.origin+'/api/action',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-fred-project-id':previous.projectId},body:JSON.stringify(previous)});
   const result=await response.json();need(response.ok,result.message??'The original browser request did not return.');
   const stableResult={...result};delete stableResult.replayed;delete stableResult.reused;
   const existing=await optional(resultFile);
   if(existing)need(stable(existing)===stable(stableResult),'The original native result changed.');
   else await retain('requests/'+name+'.result.json',json(stableResult));
   await page.locator('#refresh').click();return stableResult;
  }
  let resolveResult,rejectResult;
  const returned=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});returned.catch(()=>{});
  const url=server.origin+'/api/action';
  await page.route(url,async route=>{
   try{const body=route.request().postDataJSON();if(body.action!==action){await route.continue();return;}
    await retain('requests/'+name+'.json',json(body));
    const response=await route.fetch({timeout:300000}),result=await response.json();
    await route.fulfill({response});
    if(!response.ok())throw Error(result.message??'Original native action failed.');
    const value={...result};delete value.replayed;delete value.reused;await retain('requests/'+name+'.result.json',json(value));resolveResult(value);
   }catch(error){rejectResult(error);await route.abort().catch(()=>{});}
  });
  let timeout,monitor,busy=false,finished=false;
  const failed=new Promise((_resolve,reject)=>{
   timeout=setTimeout(()=>reject(Error('Original '+action+' did not return; its retained request remains.')),300000);
   monitor=setInterval(async()=>{if(busy||finished)return;busy=true;try{
    if(page.isClosed())throw Error('Original browser page closed.');
    const text=await page.locator('#message.error').textContent({timeout:1000}).catch(()=>null);
    if(text)throw Error(text);
    if(errors.length)throw Error(errors.at(-1));
   }catch(error){reject(error);}finally{busy=false;}},300);
  });
  try{return await Promise.race([Promise.resolve().then(trigger).then(()=>returned),failed]);}
  finally{finished=true;clearTimeout(timeout);clearInterval(monitor);await page.unroute(url);}
 }
 async function openResearch(project,label){
  await open(project);await tab('research');
  await page.locator('#research-product-select option[value="'+identity.productId+'"]').waitFor({state:'attached'});
  await page.locator('#research-product-select').selectOption(identity.productId);
  await page.locator('#research-product-history').getByText(identity.editionId,{exact:true}).waitFor();
  await snapshot(label+'-desktop');await snapshot(label+'-narrow',390,844);
  const current=await readFredProject(project),product=current.research.products.find(row=>row.id===identity.productId);
  need(product.editions.some(row=>row.id===identity.editionId),'Original issued product lost after opening.');
  const original=product.editions.find(row=>row.id===identity.editionId);
  for(const source of original.sources){
   const entry=current.research.entries.find(row=>row.id===source.entryId),definition=entry.versions.find(row=>row.id===source.definitionId)?.definition;
   await page.locator('#research-query').fill(definition?.title??source.entryId);
   await page.locator('#research-filter button[type="submit"]').click();
   await page.locator('#research-table tr').filter({has:page.getByText(source.entryId,{exact:true})}).getByRole('button',{name:'Open source',exact:true}).click();
   const member=current.research.sources.find(row=>row.id===source.snapshotId);
   await page.locator('#research-source-history').getByText(member.filename,{exact:true}).first().waitFor();
   await snapshot(label+'-source-'+sha(source.entryId).slice(0,12),390,844);
  }
  return {projectId:current.id,revision:current.revision,productId:identity.productId,editions:product.editions.map(row=>row.id)};
 }
 try{
  await step('producer-issued-source-views',()=>openResearch(projectDirectory,'producer'));
  await step('independent-customer-views',()=>openResearch(customer.projectDirectory,'customer'));
  await step('restored-customer-views',()=>openResearch(restored.directory,'restored'));
  await step('complete-original-attachment-views',async()=>{
   await stop();const received=await readResearchEditionReceiving(join(directory,'customer'));
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),viewer=await context.newPage();
   const outputs=[];let attachments=null;
   try{
    // Every complete original is materialized before any HTML opens its relative links.
    for(const member of received.files){
     const bytes=Buffer.from(member.bodyBase64,'base64');
     need(bytes.length===member.bytes&&sha(bytes)===member.sha256,'Original received file changed.');
     await retain('attachments/'+member.path,bytes);
    }
    attachments=await originalAttachmentViewer(received.files);
    for(const member of received.files){
     const bytes=Buffer.from(member.bodyBase64,'base64');need(bytes.length===member.bytes&&sha(bytes)===member.sha256,'Original received file changed.');
     const relative='attachments/'+member.path;await retain(relative,bytes);
     const type=member.contentType.split(';')[0].trim().toLowerCase();
     if(type==='text/html'||extname(member.path)==='.html'){
      await viewer.goto(attachments.url(member.path));
      await snapshot('attachment-'+sha(member.path).slice(0,16),1440,1000,viewer);
      await snapshot('attachment-'+sha(member.path).slice(0,16)+'-narrow',390,844,viewer);
     }else if(type==='application/pdf'||extname(member.path)==='.pdf'){
      const prefix=file('views/pdf-'+sha(member.path).slice(0,16));
      await exec(browserConfig.pdftoppm??'pdftoppm',['-r','100','-png',file(relative),prefix],{maxBuffer:1024*1024});
      const pages=(await readdir(file('views'))).filter(name=>name.startsWith(basename(prefix)+'-')&&name.endsWith('.png')).sort();
      need(pages.length>0,'Original PDF produced no rendered pages.');
      for(const name of pages){const rendered=await readFile(file('views/'+name));await retain('views/'+name,rendered);}
      outputs.push({path:relative,type,pages});
     }else{
      // Render complete plain source bytes safely in their recipient text/table view.
      if(type.startsWith('text/')||type.includes('json')||type.includes('xml')){
       const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
       await viewer.goto('about:blank');await viewer.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.5 system-ui;margin:20px}h1,pre{overflow-wrap:anywhere}pre{white-space:pre-wrap}</style></head><body><h1></h1><pre></pre></body></html>');
       await viewer.locator('h1').evaluate((node,value)=>node.textContent=value,member.path);
       await viewer.locator('pre').evaluate((node,value)=>node.textContent=value,text);
       await snapshot('source-'+sha(member.path).slice(0,16),1440,1000,viewer);
       await snapshot('source-'+sha(member.path).slice(0,16)+'-narrow',390,844,viewer);
      }
     }
     outputs.push({path:relative,bytes:bytes.length,sha256:sha(bytes),contentType:member.contentType});
    }
    return {files:outputs,ownerInstruction:'Open and visually VIEW every actual screenshot and rendered PDF page, all original files and the whole received application; fix the affected exact output before customer presentation.'};
   }finally{await context.close();await attachments?.close();}
  });
  if(financial){
   await open(projectDirectory,true);
   const publication=await getResearchPublication(projectDirectory,financial.publicationId);
   await tab('publication');await page.locator('#publication-select').selectOption(financial.publicationId);
   await page.locator('#open-publication').click();await page.locator('#publication-detail').getByText(publication.edition.title,{exact:true}).waitFor();
   // The native producer closes its seller before this helper takes the same fixed port.
   await uiAction('merchant-start','merchant-start',()=>page.locator('#merchant-start').click());
   await step('merchant-original-offer-views',async()=>{await snapshot('merchant-desktop');await snapshot('merchant-narrow',390,844);return {publicationId:financial.publicationId,files:publication.plan.downloads};});
   await tab('customer');await page.locator('#customer-publication').selectOption(financial.publicationId);
   await page.locator('#request-select option[value="'+financial.intentId+'"]').waitFor({state:'attached'});
   await page.locator('#request-select').selectOption(financial.intentId);await page.locator('#open-request').click();
   await page.locator('#intent').waitFor();need(await page.locator('#intent').inputValue()===financial.intentId,'Open the original paid intent.');
   await step('customer-ui-original-result-recovery',async()=>{
    const result=await uiAction('same-intent-recover','recover',()=>page.locator('#recover').click());
    need(result.state==='DELIVERED','The original paid intent has no completed delivery.');
    return {intentId:financial.intentId,state:result.state};
   });
   await step('customer-ui-original-execute-reopen',async()=>{
    const result=await uiAction('same-intent-execute','buy',()=>page.locator('#buy').click());
    need(result.state==='DELIVERED','The same native intent must reopen its retained delivery.');
    return {intentId:financial.intentId,state:result.state};
   });
   await step('customer-ui-complete-receiving',async()=>{
    const target=financial.receiving.receiving.directory;
    await page.locator('#county-purchase-directory').fill(target);
    const result=await uiAction('same-intent-receive','receive-research-purchase',()=>page.locator('#county-receive-purchase').click());
    await page.locator('#county-open-receiving').click();
    await page.locator('#county-customer-downloads button').first().waitFor();
    await snapshot('customer-received-desktop');await snapshot('customer-received-narrow',390,844);
    for(const member of publication.plan.downloads){
     const label=member.path==='research-package.json.gz'?'Complete received Research package':member.path==='manifest.json'?'Complete source manifest':member.path;
     await download(page.locator('#county-customer-downloads').getByRole('button',{name:label,exact:true}),'customer-downloads/'+member.path,member);
    }
    return {intentId:financial.intentId,directory:target,result};
   });
   await step('customer-ui-original-prepare',async()=>{
    // This distinct retained request stays unstarted and never triggers a second payment.
    const intent='research-ui-'+sha(identity.operation+':unstarted-browser').slice(0,48);
    await page.locator('#new-customer-request').click();
    await page.locator('#intent').fill(intent);await page.locator('#customer-file').selectOption('research-package.json.gz');
    await page.locator('#intent').fill(intent);
    await page.locator('#accept-index').fill(String(identity.acceptIndex));
    const value=await uiAction('unstarted-browser-prepare','prepare',()=>page.locator('#prepare').click());
    need(value.intentId===intent,'The original unstarted browser intent changed.');
    return {intentId:intent,purchaseSha256:value.purchaseSha256};
   });
   await step('complete-customer-work-download',async()=>{
    const button=page.locator('#customer-saved-work').getByRole('button',{name:'Export complete customer work',exact:true});
    const output=await download(button,'complete-customer-work.json');return output;
   });
   await uiAction('merchant-stop','merchant-stop',()=>page.locator('[data-tab="publication"]').click().then(()=>page.locator('#merchant-stop').click()));
   await step('new-origin-customer-work-reopen',async()=>{
    await open(financial.directory,true);await tab('customer');
    await page.locator('#customer-work-file').setInputFiles(file('complete-customer-work.json'));
    await page.locator('#customer-saved-work').getByRole('button',{name:'Receive retained work',exact:true}).click();
    await page.locator('#message').filter({hasText:'Complete customer work received'}).waitFor();
    const original=state.steps.find(row=>row.name==='customer-ui-original-result-recovery');
    need(original?.result.intentId===financial.intentId,'The retained original paid intent changed.');
    await page.locator('#customer-publication').selectOption(financial.publicationId);
    await page.locator('#request-select').selectOption(financial.intentId);await page.locator('#open-request').click();
    await uiAction('restored-original-recover','recover',()=>page.locator('#recover').click());
    await page.locator('#county-open-receiving').click();
    await page.locator('#county-customer-downloads button').first().waitFor();
    await snapshot('restored-customer-desk-desktop');await snapshot('restored-customer-desk-narrow',390,844);
    return {projectDirectory:financial.directory,publicationId:financial.publicationId,intentId:financial.intentId,customerWork:'complete-customer-work.json'};
   });
  }
  need(errors.length===0,'Actual application page error: '+errors.join('; '));
  state.status='COMPLETE';state.result={schema:'stellar-forge.research-commerce-browser-result.v1',status:'COMPLETE',
   identity:binding,sourceEditions:clone(state.sourceEditions),steps:clone(state.steps),files:clone(state.files),views:clone(state.views),
   completedAt:new Date().toISOString(),ownerInstruction:'The producing owner must actually VIEW every captured image and original attachment in its normal recipient view before presenting this exact product.'};
  await save();await exact(file('result.json'),json(state.result));return state.result;
 }catch(error){state.failure={at:new Date().toISOString(),message:String(error),pageErrors:errors};await save();throw error;}
 finally{await stop();await browser.close();}
}
