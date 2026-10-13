#!/usr/bin/env node
// MIT. One complete original-bundle browser receiving course.
import {readFile,writeFile,mkdir,lstat,open,rename,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openText,tableJsonl,materialCsv,compareEditions,TABLES,decodeBase64} from './core.mjs';
import {buildRecipient} from './build.mjs';
import {assembleRecipient} from './assemble.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
const DEFAULT_OPERATION='MATERIAL-CATALOG-OFFLINE-RECIPIENT-EE290-20261013';
const sha=value=>createHash('sha256').update(value).digest('hex');
const identity=body=>({bytes:body.length,sha256:sha(body)});
const decode=body=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);
async function exactHtml(selection){
 if(!selection||typeof selection.path!=='string'||!/^[a-f0-9]{64}$/.test(selection.sha256??''))throw new Error('SUPPLY_EXACT_HTML_PATH_AND_SHA256');
 const path=resolve(selection.path),stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>384*1024*1024)throw new Error('SUPPLIED_HTML_MUST_BE_A_BOUNDED_REGULAR_FILE');
 const body=await readFile(path);
 if(sha(body)!==selection.sha256)throw new Error('SUPPLIED_HTML_SHA256_DIFFERS:'+path);
 return {path,body,text:decode(body),...identity(body)};
}
async function validateSuppliedHtml(supplied,originalBytes,originalName){
 const blank=await exactHtml(supplied?.blank),populated=await exactHtml(supplied?.populated);
 const names=['sha256.mjs','core.mjs','review.mjs','review-panel.mjs','workspace.mjs','reader.html'];
 const sources=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(join(ROOT,name),'utf8')])));
 if(blank.text!==assembleRecipient(sources))throw new Error('SUPPLIED_BLANK_HTML_IS_NOT_THIS_COMPLETE_SOURCE_EDITION');
 const matches=[...populated.text.matchAll(/<script id="catalog-payload" type="application\/json">([\s\S]*?)<\/script>/g)];
 if(matches.length!==1)throw new Error('SUPPLIED_POPULATED_HTML_PAYLOAD_MISSING_OR_DUPLICATED');
 const payload=JSON.parse(matches[0][1]),embedded=Buffer.from(decodeBase64(payload.base64));
 if(payload.name!==originalName)throw new Error('SUPPLIED_PAYLOAD_NAME_DIFFERS_USE_THE_RETAINED_ORIGINAL_BASENAME');
 if(!embedded.equals(originalBytes)||payload.sha256!==sha(originalBytes))throw new Error('SUPPLIED_HTML_EMBEDDED_ORIGINAL_DIFFERS');
 if(populated.text!==assembleRecipient(sources,payload))throw new Error('SUPPLIED_POPULATED_HTML_IS_NOT_THIS_COMPLETE_SOURCE_EDITION');
 return {blank,populated};
}
// The caller owns the browser/context. A supplied Page must be a fresh about:blank Page.
// This API does not launch a browser, navigate an existing user tab, or close its caller's Page.
export async function receiveRecipientBrowser({context:assignedContext,page:assignedPage=null,bundlePath,bundleSha256,directory:output,pageSource='file',suppliedHtml=null,operationId=DEFAULT_OPERATION,reviewReturn=false,resumeReviewReturn=false}){
 if(typeof reviewReturn!=='boolean'||typeof resumeReviewReturn!=='boolean'||(reviewReturn&&resumeReviewReturn))throw Error('SELECT_ONE_ORIGINAL_REVIEW_PHASE');
 if(!['file','supplied-html'].includes(pageSource))throw new Error('SELECT_FILE_OR_SUPPLIED_HTML');
 if(typeof operationId!=='string'||!operationId.trim())throw new Error('KEEP_THE_ORIGINAL_RECEIVING_OPERATION');
 const context=assignedContext??assignedPage?.context();
 if(!context||(assignedPage&&assignedPage.context()!==context))throw new Error('ASSIGNED_BROWSER_CONTEXT_MISSING_OR_DIFFERENT');
 if(assignedPage&&assignedPage.url()!=='about:blank')throw new Error('PRESERVE_EXISTING_PAGE_USE_A_FRESH_ABOUT_BLANK_PAGE');
 const input=resolve(bundlePath),directory=resolve(output),bytes=await readFile(input);
 if(!/^[a-f0-9]{64}$/.test(bundleSha256??'')||sha(bytes)!==bundleSha256)throw new Error('ORIGINAL_BUNDLE_SHA256_DIFFERS');
 const originalText=decode(bytes),bundle=openText(originalText,{name:input.split(/[\\/]/).at(-1)});
 const supplied=pageSource==='supplied-html'?await validateSuppliedHtml(suppliedHtml,bytes,bundle.name):null;
 if(pageSource==='file'&&suppliedHtml!==null)throw new Error('SUPPLIED_HTML_REQUIRES_ITS_EXPLICIT_PAGE_SOURCE');
 const resume=Boolean(resumeReviewReturn);
const sourceNames=['sha256.mjs','core.mjs','review.mjs','review-panel.mjs','workspace.mjs','reader.html','assemble.mjs','build.mjs','receive.mjs',
 ...(reviewReturn||resume?['receive-review.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/workspace.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/recipient-return.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/transfer.mjs',
 '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/store.mjs']:[])];
const sourceBinding=await Promise.all(sourceNames.map(async path=>{const body=await readFile(resolve(ROOT,path));return{path,bytes:body.length,sha256:sha(body)};}));
if(!resume){await mkdir(directory,{mode:0o700});const parent=await open(dirname(directory),'r');try{await parent.sync();}finally{await parent.close();}}
let reviewGuard;
if(reviewReturn||resume){
 reviewGuard=await open(join(directory,'.review-receiving.lock'),'a',0o600);
 const held=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','75','3'],{stdio:['ignore','pipe','pipe',reviewGuard.fd],timeout:5000});
 if(held.status!==0){await reviewGuard.close();throw Object.assign(Error(held.status===75?'ORIGINAL_REVIEW_COURSE_ACTIVE':'REVIEW_COURSE_FLOCK_UNAVAILABLE'),{cause:held.error});}
}
try{
const record=resume?JSON.parse(await readFile(join(directory,'RECEIVING.json'),'utf8')):{schema:'stellar-forge.material-recipient-browser-receiving.v1',status:'RUNNING',operation:operationId,pageSource,renderedHtml:[],startedAt:new Date().toISOString(),original:bundle.summary,downloads:[],screenshots:[],steps:[],browserErrors:[],pixelReview:{status:'PENDING',instructions:'Open and inspect all actual retained images before recording visual completion.'}};
if(resume){
 if(record.schema!=='stellar-forge.material-recipient-browser-receiving.v1'||record.original.bundleSha256!==bundle.identity.sha256||record.original.bundleBytes!==bytes.length||record.inputBinding?.path!==input||record.inputBinding?.name!==bundle.name)throw Error('RECEIVING_ORIGINAL_INPUT_DIFFERS');
 if(JSON.stringify(record.sourceBinding)!==JSON.stringify(sourceBinding))throw Error('RECEIVING_SELECTED_SOURCE_DIFFERS');
 if(!record.steps.includes('incomplete-file-error-and-original-reopen'))throw Error('RECONCILE_ORIGINAL_BROWSER_PHASE_BEFORE_REVIEW_CONTINUATION');
 if(record.operation!==operationId||record.pageSource!==pageSource)throw Error('RECEIVING_OPERATION_OR_TRANSPORT_DIFFERS');
 if(supplied&&JSON.stringify(record.suppliedHtml)!==JSON.stringify({blank:{path:supplied.blank.path,bytes:supplied.blank.bytes,sha256:supplied.blank.sha256},populated:{path:supplied.populated.path,bytes:supplied.populated.bytes,sha256:supplied.populated.sha256}}))throw Error('RECEIVING_SUPPLIED_HTML_DIFFERS');
 for(const built of record.built){const actual=await readFile(built.output);if(actual.length!==built.bytes||sha(actual)!==built.sha256)throw Error('RECEIVING_BUILT_SOURCE_DIFFERS');}
 record.continuations??=[];record.continuations.push({at:new Date().toISOString(),previousStatus:record.status});
 record.status='RUNNING';
}else{record.sourceBinding=sourceBinding;record.inputBinding={path:input,name:bundle.name,bytes:bytes.length,sha256:sha(bytes)};}
const save=async()=>{
 const path=join(directory,'RECEIVING.json'),pending=path+'.'+randomUUID()+'.part',handle=await open(pending,'wx',0o600);
 try{
  await handle.writeFile(JSON.stringify(record,null,2)+'\n');await handle.sync();await handle.close();
  await rename(pending,path);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
 }finally{await handle.close().catch(()=>{});await unlink(pending).catch(()=>{});}
};
await save();
let page=assignedPage,reopened;
const ownedPages=[],observers=[];
const previousViewport=assignedPage?.viewportSize();
const newPage=async()=>{const next=await context.newPage();ownedPages.push(next);return next;};
try{
 const empty=join(directory,'Material_Catalog_Reader.html'),populated=join(directory,'Material_Catalog_Complete.html');
 let blank,populatedHtml;
 if(supplied){
  blank=supplied.blank;populatedHtml=supplied.populated;
  record.built=[];record.suppliedHtml={blank:{path:blank.path,bytes:blank.bytes,sha256:blank.sha256},populated:{path:populatedHtml.path,bytes:populatedHtml.bytes,sha256:populatedHtml.sha256}};
 }else{
  if(!resume){record.built=[await buildRecipient({output:empty}),await buildRecipient({output:populated,bundle:input})];
   for(const built of record.built)built.sha256=sha(await readFile(built.output));await save();}
  blank=await exactHtml({path:empty,sha256:sha(await readFile(empty))});
  populatedHtml=await exactHtml({path:populated,sha256:sha(await readFile(populated))});
 }
 if(!page)page=await newPage();
 const openHtml=async(target,html,role)=>{
  if(target.url()!=='about:blank')throw new Error('USE_FRESH_PAGE_FOR_EXACT_HTML:'+role);
  if(pageSource==='supplied-html')await target.setContent(html.text,{waitUntil:'load'});
  else await target.goto(pathToFileURL(html.path).href);
  record.renderedHtml.push({role,path:html.path,bytes:html.bytes,sha256:html.sha256,pageSource});
 };
 const observe=p=>{const handler=e=>record.browserErrors.push(e.message);p.on('pageerror',handler);observers.push([p,handler]);};
 observe(page);
 const requireVisible=async locator=>{await locator.waitFor({state:'visible',timeout:30000});};
 const shot=async(name,width=1440,target=page)=>{
  await target.setViewportSize({width,height:1000});
  const path=join(directory,name+'.png');await target.screenshot({path,fullPage:true});record.screenshots.push({name,width,path,...identity(await readFile(path))});
  const overflow=await target.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  if(overflow)throw new Error('PAGE_HORIZONTAL_OVERFLOW:'+name);
 };
 const download=async(label,name,expected,type='bytes')=>{
  const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();
  const d=await event,path=join(directory,name);await d.saveAs(path);const body=await readFile(path);
  const desired=type==='json'?Buffer.from(JSON.stringify(expected)):Buffer.from(expected);
  if(type==='json'?JSON.stringify(JSON.parse(body))!==JSON.stringify(expected):!body.equals(desired))throw new Error('DOWNLOADED_CONTENT_DIFFERS:'+name);
  record.downloads.push({name,path,bytes:body.length,sha256:sha(body)});return path;
 };
 if(!resume){
 await openHtml(page,blank,'blank-reader');await requireVisible(page.getByRole('heading',{name:'Open a catalogue handover',exact:true}));
 await shot('01-empty-desktop');await shot('02-empty-narrow',390);
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(input);
 await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 if(!await page.getByText(bundle.identity.sha256,{exact:true}).isVisible())throw new Error('ORIGINAL_BUNDLE_IDENTITY_NOT_DISPLAYED');
 record.steps.push('open-complete-original-file');
 await save();
 // Operate the exact outgoing populated attachment as well as its original-file input.
 page=await newPage();observe(page);await openHtml(page,populatedHtml,'supplied-or-built-populated-reader');
 await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 if(!await page.getByText(bundle.identity.sha256,{exact:true}).isVisible())throw new Error('POPULATED_ATTACHMENT_BUNDLE_DIFFERS');
 record.steps.push('open-exact-populated-attachment');
 const tabs=['Overview','Materials','Compare editions','Customer decisions','Supplier records','Original sources','All retained records'];
 for(let i=0;i<tabs.length;i++){
  await page.getByRole('button',{name:tabs[i],exact:true}).click();
  await shot(String(i+3).padStart(2,'0')+'-'+tabs[i].replaceAll(' ','-').toLowerCase()+'-desktop');
  await shot(String(i+3).padStart(2,'0')+'-'+tabs[i].replaceAll(' ','-').toLowerCase()+'-narrow',390);
 }
 record.steps.push('all-seven-sections-desktop-and-narrow');
 await page.getByRole('button',{name:'Materials',exact:true}).click();
 const current=bundle.catalog.activeEditionId??[...bundle.editions.keys()].at(-1),material=(bundle.materials.get(current)??new Map()).values().next().value;
 await page.getByLabel('Retained edition',{exact:true}).selectOption(current);
 if(material){
  await page.getByRole('searchbox').fill(material.materialId);await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('button',{name:material.materialId,exact:true}).first().click();
  await requireVisible(page.getByRole('heading',{name:'Material '+material.materialId,exact:true}));
  await download('Download record','selected-material.json',material,'json');
  await shot('10-material-detail-narrow',390);
  await page.getByRole('button',{name:'Close detail',exact:true}).click();
  await page.getByRole('button',{name:'Clear',exact:true}).click();
 }
 await download('Download complete edition CSV','selected-edition.csv',materialCsv(bundle,current));
 await download('Download complete edition records','selected-edition.jsonl',bundle.tables.catalog_materials.filter(x=>x.edition_id===current).map(x=>x.record_json+'\n').join(''));
 record.steps.push('material-selection-search-detail-and-complete-downloads');
 const editions=[...bundle.editions.keys()];
 if(editions.length){
  await page.getByRole('button',{name:'Compare editions',exact:true}).click();
  await page.getByLabel('Before',{exact:true}).selectOption(editions[0]);await page.getByLabel('After',{exact:true}).selectOption(current);
  await download('Download full comparison','edition-comparison.json',compareEditions(bundle,editions[0],current),'json');
 }
 await page.getByRole('button',{name:'Customer decisions',exact:true}).click();
 await download('Download every original decision revision','customer-decision-history.jsonl',tableJsonl(bundle,'catalog_decision_history'));
 await page.getByRole('button',{name:'All retained records',exact:true}).click();
 for(const table of Object.keys(TABLES)){
  await page.getByLabel('Original table',{exact:true}).selectOption(table);
  await download('Download complete original table',table+'.jsonl',tableJsonl(bundle,table));
 }
 record.steps.push('every-original-table-and-contained-history-download');
 await page.getByRole('button',{name:'Original sources',exact:true}).click();
 let sourceIndex=0;
 for(const [sourceId,source] of bundle.sources){
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download original bytes',exact:true}).nth(sourceIndex++).click();
  const d=await event,path=join(directory,'source-'+sourceId+'.bin');await d.saveAs(path);const actual=await readFile(path);
  if(sha(actual)!==source.manifest.sha256||actual.length!==source.bytes.length)throw new Error('ORIGINAL_SOURCE_DOWNLOAD_DIFFERS');
  record.downloads.push({name:'source-'+sourceId,path,bytes:actual.length,sha256:sha(actual)});
 }
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await download('Download unchanged original bundle','original-bundle.jsonl',bytes);
 await download('Download inspection manifest','inspection.json',bundle.summary,'json');
 const recipientEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download complete offline reader',exact:true}).click();
 const recipient=await recipientEvent,recipientPath=join(directory,'Downloaded_Complete_Recipient.html');await recipient.saveAs(recipientPath);
 const recipientBytes=await readFile(recipientPath);record.downloads.push({name:'Downloaded_Complete_Recipient.html',path:recipientPath,bytes:recipientBytes.length,sha256:sha(recipientBytes)});
 reopened=await newPage();observe(reopened);
 await openHtml(reopened,{path:recipientPath,body:recipientBytes,text:decode(recipientBytes),...identity(recipientBytes)},'downloaded-complete-reader');
 await requireVisible(reopened.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 if(!await reopened.getByText(bundle.identity.sha256,{exact:true}).isVisible())throw new Error('COLD_REOPEN_BUNDLE_DIFFERS');
 await shot('12-downloaded-recipient-desktop',1440,reopened);await shot('13-downloaded-recipient-narrow',390,reopened);
 await reopened.getByRole('button',{name:'Customer decisions',exact:true}).click();
 await reopened.getByRole('button',{name:'Overview',exact:true}).click();
 const restoredDownload=reopened.waitForEvent('download');await reopened.getByRole('button',{name:'Download unchanged original bundle',exact:true}).click();
 const restored=await restoredDownload,restoredPath=join(directory,'cold-reopened-original.jsonl');await restored.saveAs(restoredPath);
 const restoredBytes=await readFile(restoredPath);
 record.downloads.push({name:'cold-reopened-original.jsonl',path:restoredPath,...identity(restoredBytes)});
 if(!restoredBytes.equals(bytes))throw new Error('COLD_REOPEN_ORIGINAL_BYTES_DIFFER');
 record.steps.push('downloaded-complete-recipient-cold-open-and-original-byte-export');
 const invalid=join(directory,'incomplete-original.jsonl');await writeFile(invalid,bytes.subarray(0,bytes.length-1));
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(invalid);await requireVisible(page.getByRole('alert'));await shot('11-incomplete-file-error-narrow',390);
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(input);
 await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 record.steps.push('incomplete-file-error-and-original-reopen');await save();
 }else{await openHtml(page,blank,'original-review-resume');await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(input);await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));}
 record.reviewBlank={path:blank.path,bytes:blank.bytes,sha256:blank.sha256};
 if(reviewReturn||resume){const {receiveReviewReturn}=await import('./receive-review.mjs');await receiveReviewReturn({page,context,directory,input,bundle,record,save,openDocument:openHtml});}
 if(record.browserErrors.length)throw new Error('BROWSER_ERRORS_RECORDED');
 record.status='BROWSER_COURSE_COMPLETE';record.completedAt=new Date().toISOString();if(!resume)record.customerReader=join(directory,'Downloaded_Complete_Recipient.html');
 await save();return record;
}catch(error){record.status='ERROR';record.error=String(error.stack??error);record.failedAt=new Date().toISOString();await save();throw error;}
finally{for(const [observed,handler] of observers)observed.off('pageerror',handler);for(const owned of ownedPages.reverse())await owned.close().catch(()=>{});if(assignedPage&&previousViewport&&!assignedPage.isClosed())await assignedPage.setViewportSize(previousViewport).catch(()=>{});}
}finally{if(reviewGuard)await reviewGuard.close().catch(()=>{});}
}
async function cli(){
 const rawArgs=process.argv.slice(2),flags=rawArgs.filter(x=>['--review-return','--resume-review-return'].includes(x));
 if(flags.length>1)throw Error('Choose one original review suffix or its same-directory continuation.');
 const args=rawArgs.filter(x=>!flags.includes(x)),get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
 const allowed=['--bundle','--sha256','--directory','--playwright','--cdp','--executable','--page-source','--blank-html','--blank-sha256','--populated-html','--populated-sha256','--operation'];
 if(args.length%2||args.some((x,i)=>i%2===0&&!allowed.includes(x))||new Set(args.filter((_,i)=>i%2===0)).size!==args.length/2)throw new Error('Use one value for each supported receiving option.');
 for(const key of ['--bundle','--sha256','--directory','--playwright'])if(!get(key))throw new Error('Required: '+key);
 if(Boolean(get('--cdp'))===Boolean(get('--executable')))throw new Error('Select exactly one assigned CDP endpoint or installed browser executable.');
 const pageSource=get('--page-source')??'file';
 if(!['file','supplied-html'].includes(pageSource))throw new Error('SELECT_FILE_OR_SUPPLIED_HTML');
 const htmlFlags=['--blank-html','--blank-sha256','--populated-html','--populated-sha256'];
 if(pageSource==='supplied-html'&&htmlFlags.some(k=>!get(k)))throw new Error('Supplied HTML requires both original file paths and SHA-256 values.');
 if(pageSource==='file'&&htmlFlags.some(k=>get(k)))throw new Error('Use --page-source supplied-html with original HTML selections.');
 const installed=await import(pathToFileURL(resolve(get('--playwright'))).href),playwright=installed.chromium?installed:installed.default;
 let browser;
 try{
  browser=get('--cdp')?await playwright.chromium.connectOverCDP(get('--cdp')):await playwright.chromium.launch({executablePath:resolve(get('--executable')),headless:true,args:['--no-sandbox']});
  const context=get('--cdp')?browser.contexts()[0]:await browser.newContext({acceptDownloads:true});
  const record=await receiveRecipientBrowser({context,bundlePath:get('--bundle'),bundleSha256:get('--sha256'),directory:get('--directory'),pageSource,reviewReturn:flags.includes('--review-return'),resumeReviewReturn:flags.includes('--resume-review-return'),
   operationId:get('--operation')??DEFAULT_OPERATION,suppliedHtml:pageSource==='supplied-html'?{blank:{path:get('--blank-html'),sha256:get('--blank-sha256')},populated:{path:get('--populated-html'),sha256:get('--populated-sha256')}}:null});
  console.log(JSON.stringify(record,null,2));
 }finally{if(browser&&!get('--cdp'))await browser.close().catch(()=>{});}
 // End only this CLI client; never terminate an importing caller or its assigned browser.
 if(get('--cdp'))process.exit(0);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(error=>{console.error(error.stack??error);if(process.argv.slice(2).includes('--cdp'))process.exit(1);process.exitCode=1;});
