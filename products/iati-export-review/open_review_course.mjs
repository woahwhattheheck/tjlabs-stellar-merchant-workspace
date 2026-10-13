#!/usr/bin/env node
/* Operate the real original review form and rendered complete handover. */
import {readFile,writeFile,mkdir,open,rename,unlink,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,relative,dirname,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {request as httpRequest} from 'node:http';

const cfg=JSON.parse(await readFile(process.argv[2],'utf8'));
const need=(value,message)=>{if(!value)throw new Error(message)};
const root=resolve(cfg.root),output=resolve(cfg.outputDirectory);
const origin=new URL(cfg.origin);
need(origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)
     &&origin.pathname==='/'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash,
     'Use the original loopback operation server.');
need(['review','handover'].includes(cfg.mode),'Select the original review or handover phase.');
need(isAbsolute(cfg.playwrightModule)&&isAbsolute(cfg.chromium),'Select existing complete browser runtime paths.');
await mkdir(output,{recursive:true,mode:0o700});
const result={schema:'tjlabs.publisher-review-browser.v1',mode:cfg.mode,state:'RUNNING',
 startedAt:new Date().toISOString(),views:[],files:[],errors:[],phase:'starting'};
let browser;
const stable=value=>JSON.stringify(canonical(value));
function canonical(value){if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;}
const same=(a,b)=>stable(a)===stable(b);
function normalizedReviews(value){
 const copy=JSON.parse(JSON.stringify(value));
 need(Array.isArray(copy.editions),'Retain the full original edition list.');
 for(const item of copy.editions){
  const review=item.review;
  need(review&&typeof review.actor==='string'&&typeof review.note==='string'&&
       Array.isArray(review.acknowledgedIssueIds),'Retain the complete named review.');
  need(review.acknowledgedIssueIds.every(id=>typeof id==='string'&&/^[0-9a-f]{64}$/.test(id))&&
       new Set(review.acknowledgedIssueIds).size===review.acknowledgedIssueIds.length,
       'Use unique original issue IDs in the named review.');
  review.actor=review.actor.trim();review.note=review.note.trim();
  review.acknowledgedIssueIds.sort();
 }
 return copy;
}
function local(name){need(typeof name==='string'&&name&&!name.includes('\\')&&!isAbsolute(name),
 'Use the original relative operation member.');const path=resolve(root,name);
 need(path!==root&&relative(root,path)!=='..'&&!relative(root,path).startsWith('../'),
 'Keep original members inside the operation.');return path;}
function url(name){local(name);return new URL(name.split('/').map(encodeURIComponent).join('/'),origin).href;}
async function digest(path){const hash=createHash('sha256');let bytes=0;
 for await(const part of createReadStream(path)){bytes+=part.length;hash.update(part)}
 return {bytes,sha256:hash.digest('hex')};}
async function syncDir(path){const handle=await open(path,'r');try{await handle.sync()}finally{await handle.close()}}
async function atomicJson(path,value){const temporary=join(dirname(path),'.'+basename(path)+'.incoming-'+randomUUID());
 await mkdir(dirname(path),{recursive:true,mode:0o700});let handle;
 try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');
 await handle.sync();await handle.close();handle=undefined;await rename(temporary,path);await syncDir(dirname(path));}
 finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(()=>{})}}
async function checkpoint(phase){result.phase=phase;result.updatedAt=new Date().toISOString();
 result.memory=process.memoryUsage();await atomicJson(join(output,'progress.json'),result);}
async function capture(page,label){await page.evaluate(()=>document.fonts.ready);
 const path=join(output,label+'.png');const bytes=await page.screenshot({path,fullPage:false});
 const handle=await open(path,'r');try{await handle.sync()}finally{await handle.close()}
 const geometry=await page.evaluate(()=>({viewport:innerWidth,
 document:document.documentElement.scrollWidth,body:document.body.scrollWidth,title:document.title}));
 need(geometry.document<=geometry.viewport+1&&geometry.body<=geometry.viewport+1,
 'Rendered document overflows the actual viewport: '+label);
 result.views.push({label,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...geometry});
 await checkpoint(label);}
async function navigate(page,name){const response=await page.goto(url(name),{waitUntil:'domcontentloaded',timeout:45000});
 need(response&&response.ok(),'Open the complete original operation page: '+name);
 need(response.url()===url(name),'Keep the original operation URL.');}
async function download(name,expected){
 const source=local(name),path=join(output,'downloads',name),temporary=path+'.incoming-'+randomUUID();
 need(same(await digest(source),expected),'The selected original file differs: '+name);
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const handle=await open(temporary,'wx',0o600),hash=createHash('sha256');let count=0;
 try{
  await new Promise((accept,reject)=>{
   const request=httpRequest(url(name),{method:'GET'},response=>{
    if(response.statusCode!==200){response.resume();reject(new Error('Original download HTTP '+response.statusCode));return}
    (async()=>{try{for await(const block of response){count+=block.length;
     need(count<=expected.bytes,'Original download grew beyond its selected complete file.');
     hash.update(block);await handle.writeFile(block);}accept()}catch(error){response.destroy();reject(error)}})();
   });
   request.on('error',reject);request.setTimeout(60000,()=>request.destroy(new Error('Original download timed out.')));request.end();
  });
  const actual={bytes:count,sha256:hash.digest('hex')};
  need(same(actual,expected),'The full received file differs: '+name);
  await handle.sync();await handle.close();await rename(temporary,path);await syncDir(dirname(path));
  result.files.push({file:name,path,...actual});await checkpoint('download:'+name);
 }catch(error){await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error}
}
const selectedInput=cfg.mode==='review'?resolve(cfg.reviewInput):local('delivery/HANDOVER.json');
const binding={schema:'tjlabs.publisher-review-browser-binding.v1',mode:cfg.mode,root,
 source:await digest(new URL(import.meta.url)),input:await digest(selectedInput)};
const bindingPath=join(output,'binding.json');
try{const previous=JSON.parse(await readFile(bindingPath,'utf8'));
 need(same(previous,binding),'Continue the original browser source and exact selected case input.');}
catch(error){if(error.code!=='ENOENT')throw error;await atomicJson(bindingPath,binding)}
result.sourceBinding=binding;
try{
 const module=await import(pathToFileURL(cfg.playwrightModule).href);
 need(typeof module.chromium?.launch==='function','Use the existing Playwright Chromium runtime.');
 browser=await module.chromium.launch({headless:true,executablePath:cfg.chromium,args:['--no-sandbox'],env:process.env});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
 if(cfg.mode==='review'){
  const decisions=JSON.parse(await readFile(cfg.reviewInput,'utf8'));
  need(decisions.schema==='devresults.export-review-decisions.v1'&&/^[0-9a-f]{64}$/.test(decisions.mappingSha256),
       'Select the actual named decisions for the original native previews.');
  const normalizedDecisions=normalizedReviews(decisions);
  const pageName='preview/'+decisions.mappingSha256+'/review.html';
  await navigate(page,pageName);
  const original=await page.locator('#original-definition').textContent();
  const wanted=JSON.parse(JSON.stringify(decisions));for(const item of wanted.editions)delete item.review;
  need(same(JSON.parse(original),wanted),'Keep the exact preview definitions and original named-decision input.');
  result.operation=decisions.operation;result.mappingSha256=decisions.mappingSha256;
  const sections=page.locator('section[data-edition]');need(await sections.count()===decisions.editions.length,
       'Render each actual edition exactly once.');
  for(const section of await sections.all()){
   need(await section.locator('[name=actor]').inputValue()===''&&
        await section.locator('[name=decision]').inputValue()===''&&
        await section.locator('[name=note]').inputValue()===''&&
        await section.locator('.issue input:checked').count()===0,
        'The actual preview must start undecided.');
  }
  await capture(page,'review-desktop-undecided');
  await page.setViewportSize({width:390,height:844});await capture(page,'review-phone-undecided');
  await page.setViewportSize({width:1280,height:900});
  for(let index=0;index<decisions.editions.length;index++){
   const section=sections.nth(index),review=decisions.editions[index].review;
   need(review&&['approve','request_changes'].includes(review.decision)&&typeof review.actor==='string'&&
        typeof review.note==='string'&&Array.isArray(review.acknowledgedIssueIds),'Use the complete supplied review.');
   const remaining=new Set(review.acknowledgedIssueIds);
   for(const input of await section.locator('.issue input').all()){
    const id=await input.getAttribute('value');if(remaining.has(id)){await input.check();remaining.delete(id)}
   }
   need(remaining.size===0,'A named decision acknowledges an issue absent from its original preview.');
   await section.locator('[name=actor]').fill(review.actor);
   await section.locator('[name=decision]').selectOption(review.decision);
   await section.locator('[name=note]').fill(review.note);
  }
  await capture(page,'review-desktop-named-decisions');
  const pending=page.waitForEvent('download',{timeout:15000});
  await page.getByRole('button',{name:'Export named review decisions',exact:true}).click();
  const item=await pending;need(await item.failure()===null,'Export the original named-decision download.');
  const path=join(output,'review.json'),temporary=path+'.incoming-'+randomUUID();
  await item.saveAs(temporary);
  const exported=JSON.parse(await readFile(temporary,'utf8'));
  need(same(normalizedReviews(exported),normalizedDecisions),'The actual form changed the supplied named review or original preview.');
  const handle=await open(temporary,'r');try{await handle.sync()}finally{await handle.close()}
  await rename(temporary,path);await syncDir(dirname(path));
  result.review={file:path,downloadFilename:item.suggestedFilename(),...await digest(path)};
  await checkpoint('named-decisions-exported');
 }else{
  const handover=JSON.parse(await readFile(local('delivery/HANDOVER.json'),'utf8'));
  need(handover.schema==='devresults.export-review-handover.v1'&&Array.isArray(handover.files)&&handover.files.length===21,
       'Receive the whole original 21-file handover.');
  result.operation=handover.operation;result.caseId=handover.caseId;result.revision=handover.revision;
  const names=handover.files.map(row=>row.file);need(new Set(names).size===names.length,'Retain every unique handover file.');
  for(const row of handover.files)await download('delivery/'+row.file,{bytes:row.bytes,sha256:row.sha256});
  await navigate(page,'delivery/index.html');
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
  need(links.includes('Publisher_Financial_Review.zip')&&links.includes('received-current.html')&&
       links.includes('review-definition.json')&&links.includes('preview/review.html'),
       'Open the native package, independent report, decisions and actual previews from the original handover.');
  await capture(page,'handover-desktop');
  await page.setViewportSize({width:390,height:844});await capture(page,'handover-phone');
  const reports=[...handover.editionRevisions.map(row=>row.id+'.html'),'received-current.html'];
  for(const report of reports){
   await navigate(page,'delivery/'+report);
   need((await page.locator('body').innerText()).trim().length>100,'Render the whole original financial report.');
   await page.setViewportSize({width:1280,height:900});await capture(page,'report-'+report.replace('.html','')+'-desktop');
   await page.setViewportSize({width:390,height:844});await capture(page,'report-'+report.replace('.html','')+'-phone');
  }
  await navigate(page,'delivery/index.html');
  await page.getByRole('link',{name:'Original undecided form and the actual reviewed previews',exact:true}).click();
  need(await page.locator('#review-form').count()===1,'Open the retained original preview from the completed handover.');
  need(await page.locator('section[data-edition]').count()===2,'Keep both actual historical previews in the delivered form.');
  await capture(page,'handover-original-preview-phone');
 }
 need(result.errors.length===0,'Resolve original application browser errors.');
 result.state='COMPLETE';result.completedAt=new Date().toISOString();await checkpoint('complete');
 await atomicJson(join(output,'result.json'),result);
}catch(error){
 result.state='INCOMPLETE';result.error={name:error.name,message:error.message,stack:error.stack};
 await checkpoint('interrupted').catch(()=>{});
 await atomicJson(join(output,'result.json'),result).catch(()=>{});
 process.exitCode=1;
}finally{
 try{await browser?.close();result.browserClosed=!browser||!browser.isConnected();
  need(result.browserClosed,'Close the original browser before retaining its completed receiving result.');}
 catch(error){result.browserClosed=false;result.state='INCOMPLETE';result.closeError=error.message;process.exitCode=1}
 await atomicJson(join(output,'result.json'),result).catch(error=>{process.exitCode=1;console.error(error.message)});
}
console.log(JSON.stringify({state:result.state,mode:result.mode,operation:result.operation,caseId:result.caseId,
 revision:result.revision,output,browserClosed:result.browserClosed,views:result.views.length,files:result.files.length,
 error:result.error??null}));
