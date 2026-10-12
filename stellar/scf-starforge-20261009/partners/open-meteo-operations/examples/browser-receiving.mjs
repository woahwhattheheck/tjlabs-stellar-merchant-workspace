#!/usr/bin/env node
// MIT. Complete retained weather report receiving, revision and onward delivery.
import {readFile,writeFile,mkdir,rename,chmod,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const OPERATION='SCF-WEATHER-EDITABLE-RECEIVING-6ARMS-20261012';
const ORIGINAL_ARCHIVE_SHA256='28d56f92cdf35756773a40eb5a0125d03b5b0f86d5ebf63485d2c79365643f53';
const ORIGINAL_ARCHIVE_BYTES=33416;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,details)=>{throw Object.assign(new Error(code),{code,details});};
function options(args){
 const allowed=new Set(['--runtime','--archive','--output','--chrome','--playwright','--owner','--report-title','--archive-sha256','--archive-bytes']);
 const result={};
 for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key)||result[key]!==undefined||!args[i+1])fail('OPTION_INVALID',key);result[key]=args[++i];}
 for(const name of ['--runtime','--archive','--output','--chrome'])if(!result[name])fail('OPTION_REQUIRED',name);
 return result;
}
async function exists(path){try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function atomic(path,value){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const tmp=path+'.'+randomUUID()+'.pending';
 await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 await rename(tmp,path);
}
async function retained(path,bytes){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 if(await exists(path)){if(!(await readFile(path)).equals(Buffer.from(bytes)))fail('RETAINED_FILE_CHANGED',{path});}
 else await writeFile(path,bytes,{mode:0o600,flag:'wx'});
 return {path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
async function child(command,args,{cwd,environment,log}){
 const process=spawn(command,args,{cwd,env:environment,stdio:['ignore','pipe','pipe']});
 const stdout=[],stderr=[];
 process.stdout.on('data',data=>stdout.push(data));process.stderr.on('data',data=>stderr.push(data));
 const exit=await new Promise((resolve,reject)=>{process.once('error',reject);process.once('close',(code,signal)=>resolve({code,signal}));});
 const result={...exit,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
 if(log)await atomic(log,result);
 if(result.code!==0)fail('NATIVE_WEATHER_COMMAND_FAILED',{command,args,result});
 return result;
}
function playwrightModule(value){
 const require=createRequire(import.meta.url);
 if(value)return require(value);
 const root=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
 if(root)try{return require(join(root,'playwright'));}catch{}
 return require('playwright');
}
async function main(){
 const opt=options(process.argv.slice(2));
 const root=resolve(opt['--output']),runtime=resolve(opt['--runtime']),archive=resolve(opt['--archive']);
 await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
 const logs=join(root,'operation'),deliveries=join(root,'deliveries'),screenshots=join(root,'screenshots');
 for(const p of [logs,deliveries,screenshots])await mkdir(p,{recursive:true,mode:0o700});
 const source=join(runtime,'partners','open-meteo-operations');
 process.env.OPEN_METEO_RUNTIME_ROOT=runtime;
 const selectedHash=opt['--archive-sha256'],selectedBytes=opt['--archive-bytes'];
 if((selectedHash===undefined)!==(selectedBytes===undefined))fail('SELECT_BOTH_ARCHIVE_HASH_AND_BYTES');
 if(selectedHash!==undefined&&(!/^[a-f0-9]{64}$/.test(selectedHash)||!/^[1-9][0-9]*$/.test(selectedBytes)||!Number.isSafeInteger(Number(selectedBytes))))fail('ARCHIVE_SELECTION_INVALID');
 const archiveSha256=selectedHash??ORIGINAL_ARCHIVE_SHA256,archiveBytes=selectedBytes===undefined?ORIGINAL_ARCHIVE_BYTES:Number(selectedBytes);
 const bytes=await readFile(archive);
 if(bytes.length!==archiveBytes||sha(bytes)!==archiveSha256)fail('ORIGINAL_WEATHER_ARCHIVE_CHANGED',{expected:{bytes:archiveBytes,sha256:archiveSha256},actual:{bytes:bytes.length,sha256:sha(bytes)}});
 const owner=opt['--owner']??'TJL weather receiving operator';
 const reportTitle=opt['--report-title']??'Received weather operating review — retained forecast, history and ensemble';
 const selection={schema:'stellar-forge.weather-receiving-operation.v1',operation:OPERATION,runtime,archiveSha256,archiveBytes:bytes.length,owner,reportTitle};
 if(archiveSha256!==ORIGINAL_ARCHIVE_SHA256)selection.historicalArchiveReference={bytes:ORIGINAL_ARCHIVE_BYTES,sha256:ORIGINAL_ARCHIVE_SHA256,relationship:'Earlier engineering run; this operation receives the explicitly selected archive.'};
 const inputPath=join(logs,'selection.json');
 if(await exists(inputPath)){if(!equal(await json(inputPath),selection))fail('ORIGINAL_OPERATION_SELECTION_CHANGED');}
 else await atomic(inputPath,selection);
 const originalZip=join(deliveries,'original-frozen-report.zip');
 await retained(originalZip,bytes);
 const statePath=join(logs,'progress.json');
 const progress=await exists(statePath)?await json(statePath):{schema:'stellar-forge.weather-receiving-progress.v1',operation:OPERATION,startedAt:new Date().toISOString(),phases:{}};
 const phase=async(name,work)=>{if(Object.hasOwn(progress.phases,name))return progress.phases[name];const value=await work();progress.phases[name]=value;await atomic(statePath,progress);process.stdout.write(JSON.stringify({phase:name,finishedAt:new Date().toISOString()})+'\n');return value;};
 const cli=join(source,'cli.mjs'),environment={...process.env,OPEN_METEO_RUNTIME_ROOT:runtime};
 const runCli=async(name,args)=>{const result=await child(process.execPath,[cli,...args],{cwd:source,environment,log:join(logs,name+'.json')});return JSON.parse(result.stdout);};
 const {WeatherWorkspace,initializeWeatherReview,readWeatherSettings}=await import(pathToFileURL(join(source,'workspace.mjs')));
 const {startWeatherServer}=await import(pathToFileURL(join(source,'server.mjs')));
 const {inspectWeatherHandover,prepareWeatherReceiving}=await import(pathToFileURL(join(source,'portable.mjs')));
 const converted=join(deliveries,'original-editable.weather.json');
 await phase('convert-original-zip',async()=>{
  if(await exists(converted)){const retainedValue=inspectWeatherHandover(await readFile(converted,'utf8'));if(retainedValue.value.legacyArchive?.sha256!==archiveSha256)fail('ORIGINAL_CONVERSION_CHANGED');return retainedValue.review;}
  return runCli('convert-original-zip',['from-report-zip','--input',originalZip,'--output',converted,'--archive-sha',archiveSha256]);
 });
 const originalContent=await readFile(converted,'utf8'),originalInspection=inspectWeatherHandover(originalContent);
 await atomic(join(logs,'original-handover-review.json'),originalInspection.review);
 if(originalInspection.review.sourceCount!==3||originalInspection.review.selectedDecisions!==3)fail('ORIGINAL_REPORT_SELECTION_CHANGED',originalInspection.review);
 const firstRoot=join(root,'review-workspace'),secondRoot=join(root,'onward-review-workspace');
 await phase('initialize-first-review',()=>runCli('initialize-first-review',['review-init','--state-root',firstRoot]));
 const launch=async(directory)=>{
  const workspace=await WeatherWorkspace.open(await readWeatherSettings(join(directory,'settings.json')));
  try{return await startWeatherServer({workspace,port:0});}catch(error){await workspace.close();throw error;}
 };
 const browser=await playwrightModule(opt['--playwright']).chromium.launch({headless:true,executablePath:resolve(opt['--chrome']),args:['--no-sandbox','--disable-dev-shm-usage']});
 let first,second,context,page;
 const pageErrors=[],failedResponses=[],downloads=[];
 const inspectState=async(page)=>page.evaluate(async()=>{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw new Error('STATE_HTTP_'+r.status);return r.json();});
 async function newPage(session,width=1440){
  const ctx=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const p=await ctx.newPage();
  p.on('pageerror',error=>pageErrors.push({name:error.name,message:error.message}));
  p.on('response',response=>{if(response.url().startsWith(session.origin+'/api/')&&response.status()>=400)failedResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  await p.goto(session.url,{waitUntil:'networkidle'});
  await p.locator('#mode').filter({hasText:'Independent weather review workspace'}).waitFor();
  return {context:ctx,page:p};
 }
 async function shot(p,name,width=1440){
  await p.setViewportSize({width,height:1000});
  await p.screenshot({path:join(screenshots,name+'.png'),fullPage:true});
  const dimensions=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  if(dimensions.document>dimensions.viewport+1)fail('WEATHER_HORIZONTAL_OVERFLOW',{name,...dimensions});
  return dimensions;
 }
 async function receiveViaBrowser(p,file,expected){
  await p.locator('[data-tab="reports"]').click();
  await p.locator('#handover-file').setInputFiles(file);
  const reviewed=p.waitForResponse(response=>new URL(response.url()).pathname==='/api/handover/review'&&response.request().method()==='POST');
  await p.locator('[data-action="review-handover"]').click();
  const reviewResponse=await reviewed,review=await reviewResponse.json();
  if(!reviewResponse.ok()||review.packageSha256!==expected||!review.canReceive)fail('WEATHER_RECEIVING_REVIEW_FAILED',review);
  await p.locator('[data-action="receive-handover"]:not([disabled])').waitFor();
  const accepted=p.waitForResponse(response=>new URL(response.url()).pathname==='/api/handover/receive'&&response.request().method()==='POST');
  await p.locator('[data-action="receive-handover"]').click();
  const response=await accepted,result=await response.json();
  if(!response.ok()||result.receipt?.packageSha256!==expected)fail('WEATHER_RECEIVING_FAILED',result);
  await p.locator('[data-action="receive-handover"]:not([disabled])').waitFor();
  return {review,result};
 }
 async function download(p,href,path){
  const promised=p.waitForEvent('download');
  await p.locator('a[href="'+href+'"]').first().click();
  const item=await promised;await item.saveAs(path);
  if(await item.failure())fail('WEATHER_DOWNLOAD_FAILED',await item.failure());
  const bytes=await readFile(path),record={path,bytes:bytes.length,sha256:sha(bytes)};
  downloads.push(record);return record;
 }
 try{
  first=await launch(firstRoot);({context,page}=await newPage(first));
  const received=await phase('first-browser-receiving',async()=>receiveViaBrowser(page,converted,originalInspection.packageSha256));
  let current=await inspectState(page);
  const receipt=current.receiving.find(record=>record.packageSha256===originalInspection.packageSha256);
  if(!receipt)fail('ORIGINAL_RECEIVING_MISSING');
  await atomic(join(logs,'first-original-receiving.json'),receipt);
  await phase('first-browser-original-report',async()=>{
   await page.locator('[data-tab="reports"]').click();
   await shot(page,'01-original-received-report-desktop');
   await shot(page,'02-original-received-report-phone',390);
   return {reportId:receipt.mapping.report.local,sourceIds:receipt.mapping.captures.map(item=>item.local),decisionRevisions:receipt.mapping.decisions};
  });
  const selectedReport=current.reports.find(report=>report.id===receipt.mapping.report.local);
  const target=selectedReport.decisions.find(decision=>current.captures.find(capture=>capture.id===decision.captureId)?.metadata.family==='forecast')??selectedReport.decisions[0];
  const notes=target.notes+'\n\nReceiving review: retain this original source and exact UTC operating window. Keep the model, unit, threshold and coverage requirement unchanged. Monitor the selected window using the retained forecast; keep the historical and full-member ensemble decisions with the onward report. Reopening an earlier delivery must preserve this local revision.';
  const intended={id:target.id,expectedRevision:target.revision,captureId:target.captureId,decision:{title:target.title,owner,disposition:'monitor',notes,rule:target.rule}};
  await retained(join(logs,'decision-update.json'),JSON.stringify(intended,null,2)+'\n');
  const revised=await phase('revise-received-decision',async()=>{
   let latest=(await inspectState(page)).decisions.find(item=>item.id===target.id);
   if(latest.revision===target.revision+1&&latest.notes===notes&&latest.owner===owner&&latest.disposition==='monitor'&&equal(latest.rule,target.rule))return latest;
   if(latest.revision!==target.revision)fail('LOCAL_DECISION_ALREADY_CHANGED',latest);
   await page.locator('[data-tab="analysis"]').click();
   await page.locator('[data-action="revise-decision"][data-id="'+target.id+'"]').click();
   await page.locator('#decision-form').waitFor();
   await page.locator('#decision-form [name="owner"]').fill(owner);
   await page.locator('#decision-form [name="disposition"]').selectOption('monitor');
   await page.locator('#decision-form [name="notes"]').fill(notes);
   const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/decisions'&&response.request().method()==='POST');
   await page.locator('#decision-form button').filter({hasText:'Save decision revision'}).click();
   const response=await saved,result=await response.json();
   if(!response.ok()||result.id!==target.id||result.revision!==target.revision+1||!equal(result.rule,target.rule))fail('LOCAL_DECISION_REVISION_FAILED',result);
   await page.locator('#refresh').click();
   return result;
  });
  await phase('review-full-original-source-views',async()=>{
   const result=[];
   for(const mapping of receipt.mapping.captures){
    const source=current.captures.find(capture=>capture.id===mapping.local);
    await page.locator('[data-tab="analysis"]').click();
    await page.locator('[data-action="view-source"][data-id="'+source.id+'"]').click();
    await page.locator('#source-details svg').waitFor();
    const payload=await page.evaluate(async(id)=>{const r=await fetch('/api/captures/'+id);if(!r.ok)throw new Error('CAPTURE_HTTP_'+r.status);return r.json();},source.id);
    await shot(page,'03-source-'+source.metadata.family,source.metadata.family==='ensemble'?390:1440);
    const original=await page.evaluate(async(id)=>{const r=await fetch('/api/captures/'+id+'/raw');if(!r.ok)throw new Error('RAW_HTTP_'+r.status);return {hex:r.headers.get('x-content-sha256'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))};},source.id);
    const raw=Buffer.from(original.bytes);if(raw.length!==source.bytes||sha(raw)!==source.sha256||original.hex!==source.sha256)fail('RECEIVED_ORIGINAL_SOURCE_CHANGED',source.id);
    await retained(join(deliveries,'sources',source.id+'.json'),raw);
    result.push({id:source.id,originalId:mapping.original,sha256:source.sha256,bytes:source.bytes,metadata:source.metadata,series:payload.series});
   }
   return result;
  });
  const reportNotes='Onward receiving review of the three retained original weather captures. Selected decisions retain their original model, units and UTC windows; the forecast decision carries the receiving operator revision. Source attribution and earlier delivery relationships are included.';
  const selections=selectedReport.decisions.map(item=>({id:item.id,revision:item.id===revised.id?revised.revision:item.revision}));
  const newReport=await phase('freeze-next-operating-report',async()=>{
   current=await inspectState(page);
   const same=current.reports.filter(report=>report.title===reportTitle&&report.owner===owner&&report.notes===reportNotes&&equal(report.decisions.map(item=>({id:item.id,revision:item.revision})).sort((a,b)=>a.id.localeCompare(b.id)),[...selections].sort((a,b)=>a.id.localeCompare(b.id))));
   if(same.length>1)fail('NEXT_REPORT_SELECTION_AMBIGUOUS');if(same.length)return same[0];
   await page.locator('[data-tab="reports"]').click();
   await page.locator('#report-form [name="title"]').fill(reportTitle);
   await page.locator('#report-form [name="owner"]').fill(owner);
   await page.locator('#report-form [name="notes"]').fill(reportNotes);
   for(const item of selections)await page.locator('#report-form input[name="decision"][value="'+item.id+'"]').check();
   const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/reports'&&response.request().method()==='POST');
   await page.locator('#report-form button').filter({hasText:'Freeze report'}).click();
   const response=await created,result=await response.json();
   if(!response.ok()||!equal(result.decisions.map(item=>({id:item.id,revision:item.revision})).sort((a,b)=>a.id.localeCompare(b.id)),[...selections].sort((a,b)=>a.id.localeCompare(b.id))))fail('NEXT_REPORT_SELECTION_CHANGED',result);
   for(const decision of result.decisions){
    const expected=decision.id===revised.id?revised:selectedReport.decisions.find(item=>item.id===decision.id);
    if(!equal(decision,expected))fail('NEXT_REPORT_DECISION_CHANGED',{id:decision.id});
   }
   if(!equal(result.captures.slice().sort((a,b)=>a.id.localeCompare(b.id)),selectedReport.captures.slice().sort((a,b)=>a.id.localeCompare(b.id))))fail('NEXT_REPORT_SOURCE_CHANGED');
   return result;
  });
  const newHandover=join(deliveries,'next-operating-review.weather.json');
  await phase('download-complete-onward-delivery',async()=>{
   await page.locator('[data-tab="reports"]').click();
   const outputs=[];
   for(const [format,name]of [['handover','next-operating-review.weather.json'],['zip','next-operating-review.zip'],['html','next-operating-review.html'],['json','next-operating-review.json']]){
    outputs.push(await download(page,'/api/reports/'+newReport.id+'/download?format='+format,join(deliveries,name)));
   }
   await shot(page,'04-revised-report-desktop');await shot(page,'05-revised-report-phone',390);
   return outputs;
  });
  const onwardContent=await readFile(newHandover,'utf8'),onward=inspectWeatherHandover(onwardContent);
  if(onward.value.report.id!==newReport.id||onward.value.receivingHistory.length<1||!onward.value.receivingHistory.some(item=>item.originalArchive?.sha256===archiveSha256))fail('ONWARD_ORIGINAL_LINEAGE_CHANGED');
  await phase('initialize-second-review',()=>initializeWeatherReview({stateRoot:secondRoot}));
  second=await launch(secondRoot);
  const other=await newPage(second);
  const onwardReceipt=await phase('second-independent-browser-receiving',()=>receiveViaBrowser(other.page,newHandover,onward.packageSha256));
  const secondState=await inspectState(other.page);
  const expectedOnward=prepareWeatherReceiving(onward);
  const expectedCaptures=expectedOnward.captures.map(({raw,view,...capture})=>capture).sort((a,b)=>a.id.localeCompare(b.id));
  if(!equal(secondState.captures.slice().sort((a,b)=>a.id.localeCompare(b.id)),expectedCaptures)||
   !equal(secondState.decisions.slice().sort((a,b)=>a.id.localeCompare(b.id)),expectedOnward.decisions.slice().sort((a,b)=>a.id.localeCompare(b.id)))||
   !equal(secondState.reports.find(report=>report.id===expectedOnward.report.id),expectedOnward.report)||
   !equal(onwardReceipt.result.receipt.mapping,expectedOnward.mapping))fail('ONWARD_COMPLETE_SELECTION_CHANGED');
  await atomic(join(logs,'second-received-state.json'),secondState);
  await shot(other.page,'06-second-independent-workspace-desktop');await shot(other.page,'07-second-independent-workspace-phone',390);
  await other.page.locator('[data-tab="recovery"]').click();
  await other.page.locator('details > summary').first().click();
  await shot(other.page,'08-onward-receiving-lineage');
  await other.context.close();await second.close();second=null;
  await phase('reopen-original-preserve-local-revision',async()=>{
   const reopened=await receiveViaBrowser(page,converted,originalInspection.packageSha256);
   if(!reopened.result.reopened)fail('ORIGINAL_RECEIVING_REPLAY_CHANGED');
   const later=(await inspectState(page)).decisions.find(item=>item.id===revised.id);
   if(!equal(later,revised))fail('LOCAL_REVISION_CHANGED_ON_ORIGINAL_REOPEN');
   await page.locator('[data-tab="recovery"]').click();
   await page.locator('details > summary').first().click();
   const originalReturned=await download(page,'/api/receiving/'+originalInspection.packageSha256+'/original',join(deliveries,'received-original-package.weather.json'));
   if(originalReturned.sha256!==originalInspection.packageSha256)fail('ORIGINAL_RECEIVED_PACKAGE_CHANGED');
   await shot(page,'09-reopened-original-local-revision-retained');
   return {reopened:true,decision:later,receipt:reopened.result.receipt,originalReturned};
  });
  await atomic(join(logs,'first-final-state.json'),await inspectState(page));
  await context.close();context=null;await first.close();first=null;
  await phase('cold-cli-reopen',async()=>({
   first:await runCli('cold-first-reopen',['status','--settings',join(firstRoot,'settings.json')]),
   second:await runCli('cold-second-reopen',['status','--settings',join(secondRoot,'settings.json')])
  }));
  if(pageErrors.length||failedResponses.length)fail('BROWSER_OPERATION_ERRORS',{pageErrors,failedResponses});
  const result={schema:'stellar-forge.weather-editable-receiving-result.v1',operation:OPERATION,complete:true,
   startedAt:progress.startedAt,finishedAt:new Date().toISOString(),runtime:{node:process.version,executable:process.execPath,source:runtime},
   originalArchive:{path:originalZip,bytes:bytes.length,sha256:archiveSha256},original:originalInspection.review,
   first:{directory:firstRoot,receipt,revisedDecision:revised},onward:{directory:secondRoot,review:onward.review,receipt:onwardReceipt.result.receipt},
   nextReport:newReport,deliveries:progress.phases['download-complete-onward-delivery'],
   phases:Object.keys(progress.phases),browser:{pageErrors,failedResponses,screenshots},sourceSelection:selection};
  await atomic(join(root,'result.json'),result);
  process.stdout.write(JSON.stringify({complete:true,operation:OPERATION,result:join(root,'result.json'),originalArchiveSha256:archiveSha256,nextReport:newReport.id,onwardPackageSha256:onward.packageSha256})+'\n');
 }finally{
  await context?.close().catch(()=>{});
  await second?.close().catch(()=>{});
  await first?.close().catch(()=>{});
  await browser.close();
 }
}
main().catch(async error=>{
 const value={error:{code:error.code??error.name,message:error.message,details:error.details??null},at:new Date().toISOString()};
 try{const args=options(process.argv.slice(2));await atomic(join(resolve(args['--output']),'operation','last-error.json'),value);}catch{}
 process.stderr.write(JSON.stringify(value)+'\n');process.exitCode=1;
});
