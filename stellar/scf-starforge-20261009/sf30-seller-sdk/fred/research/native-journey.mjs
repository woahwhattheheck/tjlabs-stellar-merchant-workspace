#!/usr/bin/env node
// MIT. Original-source catalogue operation in the maintained economic application.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {privateDirectory,atomicJson} from '../../routescan/quota.mjs';
import {initializeFredProject,readFredProject,importFredCapture,exportFredProject,receiveFredProject} from '../project.mjs';
import {sealFredPublicTable} from '../source.mjs';
import {startFredWorkspace} from '../workspace.mjs';
import {runResearchAction,researchView,researchEntry,researchSourceDownload,researchCsv} from './project.mjs';
import {canonical,digest,sha,need,definition,normalizeProduct,importDefinitions,exportDefinitions,MAX_SOURCE_BYTES} from './model.mjs';

async function optional(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function originalFile(file,expected){const stat=await lstat(file);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_SOURCE_BYTES,'Select a complete ordinary original source file.');const bytes=await readFile(file);if(expected)need(bytes.length===expected.bytes&&sha(bytes)===expected.sha256,'Original source file differs: '+file);return bytes;}
async function exactOutput(file,bytes){try{await writeFile(file,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(file)).equals(bytes),'Retained output differs: '+file);}}
export async function runResearchNativeJourney({directory,inputFile,cpiFile,originalProjectBundle=null,chromium=null,playwrightModule=null}){
directory=await privateDirectory(resolve(directory));
const inputBytes=await originalFile(resolve(inputFile)),input=JSON.parse(inputBytes);
need(input.schema==='stellar-forge.research-native-input.v1'&&Array.isArray(input.sources)&&input.sources.length>=2,'Select the complete original source catalogue input.');
const definitions=input.sources.map(s=>definition(s.definition));
need(new Set(definitions.map(d=>d.entryId)).size===definitions.length,'Select each original entry once.');
const cpiBytes=await originalFile(resolve(cpiFile)),cpi=sealFredPublicTable(JSON.parse(cpiBytes));
const bundleBytes=originalProjectBundle?await readFile(resolve(originalProjectBundle)):null;
const identity={operation:input.operation,inputSha256:sha(inputBytes),cpiSha256:sha(cpiBytes),originalBundleSha256:bundleBytes?sha(bundleBytes):null};
let journal=await optional(join(directory,'journey.json'));
if(journal)need(canonical(journal.identity)===canonical(identity),'Continue this retained journey with the same original inputs.');
else journal={schema:'stellar-forge.research-native-journey.v1',identity,startedAt:new Date().toISOString(),status:'RUNNING',steps:[]};
const project=join(directory,'project'),received=join(directory,'received-project');
const checkpoint=()=>atomicJson(directory,'journey.json',journal);
await checkpoint();
const step=async(name,work)=>{const previous=journal.steps.find(s=>s.name===name&&s.status==='COMPLETE');if(previous)return previous.result;
const startedAt=new Date().toISOString();try{const result=await work();journal.steps.push({name,startedAt,completedAt:new Date().toISOString(),status:'COMPLETE',result});await checkpoint();console.log(JSON.stringify({event:'research_step',name,result}));return result;}catch(e){journal.lastError={name,at:new Date().toISOString(),code:e.code??'ERROR',message:e.message};await checkpoint();throw e;}};
const actions=await privateDirectory(join(directory,'actions'));
// The original FRED transaction requires a 1–96 character operation ID using
// letters, digits, underscores or hyphens. Keep the caller's full operation
// identity in this journey and derive each native request deterministically.
const actionId=name=>'research-'+digest({operation:input.operation,name});
const savedRequest=async(name,body,target=project)=>{
const path=join(actions,name+'.json');let request=await optional(path);
if(request){
need(canonical(Object.fromEntries(Object.entries(request).filter(([k])=>!['id','expectedRevision'].includes(k))))===canonical(body),'Continue the original complete action '+name);
if(request.id!==actionId(name)){
need(request.id===input.operation+':'+name,'The retained action has another original request identity.');
const state=await readFredProject(target);
need(!state.operations.some(operation=>operation.id===request.id)&&state.pending?.id!==request.id,'Keep the retained native operation identity.');
// The previous colon-form ID could never enter a native FRED transaction.
// Retain its exact original request before correcting only that invalid ID.
const original=await originalFile(path);
need(canonical(JSON.parse(original))===canonical(request),'The retained original request changed during receiving.');
await exactOutput(join(actions,name+'.native-id-predecessor.json'),original);
request={...request,id:actionId(name)};
await atomicJson(actions,name+'.json',request);
}
}else{
request={...body,id:actionId(name),expectedRevision:(await readFredProject(target)).revision};
await atomicJson(actions,name+'.json',request,{exclusive:true});
}
return request;
};
const act=async(name,body,target=project)=>runResearchAction({directory:target,request:await savedRequest(name,body,target)});
try{
await step('open_original_economic_project',async()=>{if(bundleBytes){await receiveFredProject({directory:project,bundle:JSON.parse(bundleBytes)});}else{await initializeFredProject({directory:project,title:input.title,selection:cpi.selection});const state=await readFredProject(project);await importFredCapture({directory:project,id:actionId('cpi-original'),expectedRevision:state.revision,capture:cpi});}
const state=await readFredProject(project);await atomicJson(directory,'original-project-state.json',state);return {projectId:state.id,revision:state.revision,captures:state.captures.length,qcew:state.qcew!==undefined};});
await step('import_complete_source_inventory',async()=>act('inventory',{action:'research-import',definitions}));
const product=normalizeProduct(input.product);
await step('save_research_product',()=>act('product',{action:'research-product-save',definition:product}));
await step('retain_actual_source_gap',async()=>{const state=await readFredProject(project);let code=null;try{await runResearchAction({directory:project,request:{action:'research-product-issue',id:actionId('source-gap'),expectedRevision:state.revision,productId:product.productId,issuedBy:input.reviewer,note:'Inspect the actual not-yet-received source requirement.'}});}catch(e){code=e.code;}
need(code==='RESEARCH_PRODUCT_GAPS','The original incomplete source selection must expose its gap.');const after=await readFredProject(project);need(after.revision===state.revision&&!after.pending,'An editable source gap must not reserve the original journal.');return {code,revision:after.revision};});
for(const source of input.sources){const id=source.definition.entryId;
await step('receive_'+id,async()=>{const bytes=await originalFile(resolve(dirname(inputFile),source.file),source),entry=await researchEntry(project,id);
return act('upload-'+id,{action:'research-source-upload',entryId:id,definitionId:entry.entry.currentId,filename:source.filename,contentType:source.contentType,bodyBase64:bytes.toString('base64'),...(source.retrievedAt?{retrievedAt:source.retrievedAt}:{})});});
await step('review_'+id,async()=>{const entry=await researchEntry(project,id);return act('review-'+id,{action:'research-review',snapshotId:entry.current.sourceId,decision:'ACCEPT',reviewer:input.reviewer,note:source.reviewNote});});
}
await step('issue_initial_research_product',()=>act('issue-initial',{action:'research-product-issue',productId:product.productId,issuedBy:input.reviewer,note:input.issueNote}));
await step('correct_product_definition',()=>act('product-correction',{action:'research-product-save',definition:normalizeProduct(input.successorProduct)}));
await step('issue_corrected_research_product',()=>act('issue-corrected',{action:'research-product-issue',productId:product.productId,issuedBy:input.reviewer,note:input.successorIssueNote}));
await step('search_complete_inventory',async()=>{const view=await researchView(project,{query:input.search.query,topic:input.search.topic,geography:input.search.geography});need(view.rows.some(r=>r.entryId===input.search.expectedEntryId),'The selected original source must be discoverable through its taxonomy.');return {total:view.total,entries:view.rows.map(r=>r.entryId)};});
await step('complete_http_operator_receiving',async()=>{const workspace=await startFredWorkspace({directory:project});let browser;
try{const token=new URL(workspace.url).hash.slice(1),headers={authorization:'Bearer '+token,'x-fred-project-id':(await readFredProject(project)).id};
const csvResponse=await fetch(workspace.origin+'/api/research/catalog.csv',{headers});need(csvResponse.ok,'Original CSV route failed.');const csv=await csvResponse.text();need(canonical(importDefinitions(csv))===canonical(importDefinitions(await researchCsv(project))),'HTTP CSV must carry exact reimportable definitions.');await exactOutput(join(directory,'research-source-catalog.csv'),Buffer.from(csv));
const request=await savedRequest('http-csv-reimport',{action:'research-import',csv});
const response=await fetch(workspace.origin+'/api/action',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(request)});const result=await response.json();need(response.ok,'HTTP CSV reimport failed: '+JSON.stringify(result));
for(const source of input.sources){const entry=await researchEntry(project,source.definition.entryId),response=await fetch(workspace.origin+'/api/research/source?id='+entry.current.sourceId,{headers});need(response.ok,'Original file download failed.');const bytes=Buffer.from(await response.arrayBuffer()),retained=await researchSourceDownload(project,entry.current.sourceId);need(bytes.equals(retained.bytes),'Downloaded original source differs.');need(/attachment;/.test(response.headers.get('content-disposition')??''),'Original source attachment name is missing.');}
let rendered=null;
if(chromium){const runtime=playwrightModule?await import(pathToFileURL(resolve(playwrightModule)).href):createRequire(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??process.cwd(),'_research_runtime.cjs'))('playwright');const playwright=runtime.chromium?runtime:runtime.default;need(typeof playwright?.chromium?.launch==='function','Select the existing complete Playwright module.');browser=await playwright.chromium.launch({executablePath:resolve(chromium),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(workspace.url,{waitUntil:'networkidle'});await page.locator('[data-tab="research"]').click();await page.locator('#research-table tbody tr').first().waitFor();await page.locator('#research-query').fill(input.search.query);await page.locator('#research-filter button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#research-table tbody')?.textContent?.includes('APPROVED'));await page.screenshot({path:join(directory,'research-catalogue-desktop.png'),fullPage:true});const downloadWait=page.waitForEvent('download');await page.locator('#research-export-csv').click();const download=await downloadWait;await download.saveAs(join(directory,'browser-research-source-catalog.csv'));need((await readFile(join(directory,'browser-research-source-catalog.csv'),'utf8'))===csv,'Browser CSV source differs.');await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(directory,'research-catalogue-phone.png'),fullPage:true});need(!errors.length,'Browser source errors: '+errors.join('; '));rendered={desktop:true,phone:true,download:true};await context.close();}
return {csvBytes:Buffer.byteLength(csv),sources:input.sources.length,rendered};
}finally{await browser?.close();await workspace.close();}});
await step('export_complete_original_project',async()=>{const bundle=await exportFredProject({directory:project});need(bundle.schema==='stellar-forge.fred-project-bundle.v7','Research travels in complete bundle v7.');await exactOutput(join(directory,'complete-economic-project.json'),Buffer.from(JSON.stringify(bundle,null,2)+'\n'));return {bundleSha256:bundle.bundleSha256,projectId:bundle.state.id,revision:bundle.state.revision,sources:bundle.research.sources.length};});
await step('receive_and_reopen_complete_project',async()=>{const bundle=JSON.parse(await readFile(join(directory,'complete-economic-project.json'),'utf8')),receipt=await receiveFredProject({directory:received,bundle});const again=await exportFredProject({directory:received});need(again.bundleSha256===bundle.bundleSha256&&canonical(again)===canonical(bundle),'Complete receiving must preserve every original project member.');const before=await readFredProject(received),first=input.sources[0],request=await optional(join(actions,'upload-'+first.definition.entryId+'.json'));const replay=await runResearchAction({directory:received,request});need(replay.replayed===true&&(await readFredProject(received)).revision===before.revision,'The original completed upload must replay after full receiving without staging files.');return {...receipt,uploadReplayed:true};});
journal.status='COMPLETE';journal.completedAt=new Date().toISOString();delete journal.lastError;await checkpoint();return journal;
}catch(error){journal.status='INTERRUPTED';await checkpoint();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];need(key?.startsWith('--')&&process.argv[i+1],'Use complete named native options.');options[key.slice(2)]=process.argv[i+1];}
runResearchNativeJourney({directory:options.directory,inputFile:options.input,cpiFile:options.cpi,originalProjectBundle:options['original-project']??null,chromium:options.chromium??null,playwrightModule:options['playwright-module']??null}).then(result=>console.log(JSON.stringify({status:result.status,directory:resolve(options.directory),steps:result.steps.length}))).catch(error=>{console.error(JSON.stringify({code:error.code??'ERROR',message:error.message}));process.exitCode=1;});
}
