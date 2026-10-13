#!/usr/bin/env node
// MIT. One complete original-bundle browser receiving course.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openText,tableJsonl,materialCsv,compareEditions,TABLES} from './core.mjs';
import {buildRecipient} from './build.mjs';
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const required=['--bundle','--sha256','--directory','--playwright'];
for(const key of required)if(!get(key))throw new Error('Required: '+key);
if(Boolean(get('--cdp'))===Boolean(get('--executable')))throw new Error('Select exactly one assigned CDP endpoint or installed browser executable.');
const input=resolve(get('--bundle')),directory=resolve(get('--directory'));
const bytes=await readFile(input),sha=value=>createHash('sha256').update(value).digest('hex');
if(sha(bytes)!==get('--sha256'))throw new Error('ORIGINAL_BUNDLE_SHA256_DIFFERS');
const originalText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),bundle=openText(originalText,{name:input.split(/[\\/]/).at(-1)});
await mkdir(directory,{mode:0o700});
const record={schema:'stellar-forge.material-recipient-browser-receiving.v1',status:'RUNNING',startedAt:new Date().toISOString(),original:bundle.summary,downloads:[],screenshots:[],steps:[],browserErrors:[],pixelReview:{status:'PENDING',instructions:'Open and inspect all actual retained images before recording visual completion.'}};
const save=()=>writeFile(join(directory,'RECEIVING.json'),JSON.stringify(record,null,2)+'\n');
await save();
let browser,page,reopened;
try{
 const empty=join(directory,'Material_Catalog_Reader.html'),populated=join(directory,'Material_Catalog_Complete.html');
 record.built=[await buildRecipient({output:empty}),await buildRecipient({output:populated,bundle:input})];
 const installed=await import(pathToFileURL(resolve(get('--playwright'))).href),playwright=installed.chromium?installed:installed.default;
 browser=get('--cdp')?await playwright.chromium.connectOverCDP(get('--cdp')):await playwright.chromium.launch({executablePath:resolve(get('--executable')),headless:true,args:['--no-sandbox']});
 const context=get('--cdp')?browser.contexts()[0]:await browser.newContext({acceptDownloads:true});
 if(!context)throw new Error('ASSIGNED_BROWSER_CONTEXT_MISSING');
 page=await context.newPage();
 const observe=p=>{p.on('pageerror',e=>record.browserErrors.push(e.message));};
 observe(page);
 const requireVisible=async locator=>{await locator.waitFor({state:'visible',timeout:30000});};
 const shot=async(name,width=1440)=>{
  await page.setViewportSize({width,height:1000});
  const path=join(directory,name+'.png');await page.screenshot({path,fullPage:true});record.screenshots.push({name,width,path});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  if(overflow)throw new Error('PAGE_HORIZONTAL_OVERFLOW:'+name);
 };
 const download=async(label,name,expected,type='bytes')=>{
  const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();
  const d=await event,path=join(directory,name);await d.saveAs(path);const body=await readFile(path);
  const desired=type==='json'?Buffer.from(JSON.stringify(expected)):Buffer.from(expected);
  if(type==='json'?JSON.stringify(JSON.parse(body))!==JSON.stringify(expected):!body.equals(desired))throw new Error('DOWNLOADED_CONTENT_DIFFERS:'+name);
  record.downloads.push({name,path,bytes:body.length,sha256:sha(body)});return path;
 };
 await page.goto(pathToFileURL(empty).href);await requireVisible(page.getByRole('heading',{name:'Open a catalogue handover',exact:true}));
 await shot('01-empty-desktop');await shot('02-empty-narrow',390);
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(input);
 await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 if(!await page.getByText(bundle.identity.sha256,{exact:true}).isVisible())throw new Error('ORIGINAL_BUNDLE_IDENTITY_NOT_DISPLAYED');
 record.steps.push('open-complete-original-file');
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
 reopened=await context.newPage();observe(reopened);await reopened.goto(pathToFileURL(recipientPath).href);
 if(!await reopened.getByText(bundle.identity.sha256,{exact:true}).isVisible())throw new Error('COLD_REOPEN_BUNDLE_DIFFERS');
 await reopened.getByRole('button',{name:'Customer decisions',exact:true}).click();
 await reopened.getByRole('button',{name:'Overview',exact:true}).click();
 const restoredDownload=reopened.waitForEvent('download');await reopened.getByRole('button',{name:'Download unchanged original bundle',exact:true}).click();
 const restored=await restoredDownload,restoredPath=join(directory,'cold-reopened-original.jsonl');await restored.saveAs(restoredPath);
 if(!(await readFile(restoredPath)).equals(bytes))throw new Error('COLD_REOPEN_ORIGINAL_BYTES_DIFFER');
 record.steps.push('downloaded-complete-recipient-cold-open-and-original-byte-export');
 const invalid=join(directory,'incomplete-original.jsonl');await writeFile(invalid,bytes.subarray(0,bytes.length-1));
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(invalid);await requireVisible(page.getByRole('alert'));await shot('11-incomplete-file-error-narrow',390);
 await page.getByLabel('Open original catalogue bundle',{exact:true}).setInputFiles(input);
 await requireVisible(page.getByRole('heading',{name:'Complete recipient workspace',exact:true}));
 record.steps.push('incomplete-file-error-and-original-reopen');
 if(record.browserErrors.length)throw new Error('BROWSER_ERRORS_RECORDED');
 record.status='BROWSER_COURSE_COMPLETE';record.completedAt=new Date().toISOString();record.customerReader=recipientPath;
 await save();console.log(JSON.stringify(record,null,2));
}catch(error){record.status='ERROR';record.error=String(error.stack??error);record.failedAt=new Date().toISOString();await save();throw error;}
finally{if(reopened)await reopened.close().catch(()=>{});if(page)await page.close().catch(()=>{});if(browser&&!get('--cdp'))await browser.close().catch(()=>{});}

// End only this receiving client after disconnecting its owned page from assigned CDP.
if(get('--cdp'))process.exit(0);
