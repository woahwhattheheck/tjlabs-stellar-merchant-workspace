#!/usr/bin/env node
// MIT. Original Account Statements commissioning through the maintained Grant UI, APIs and CLI.
// Navigation, access-file and server launch follow buyer-operations-receiving.mjs at cdcec0a7.
import {readFile,writeFile,open,mkdir,rename,chmod,lstat} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const sha=raw=>createHash('sha256').update(raw).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
 value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
need(process.argv.length===3,'Use node operate-original-statements.mjs PRIVATE_CONFIG.json');
const configPath=resolve(process.argv[2]),configRaw=await readFile(configPath),config=JSON.parse(configRaw);
need(config.schema==='commons.grant.original-statements-config.v1','Select the original Statements configuration.');
for(const key of ['sourceRoot','workDirectory','originalsDirectory','nativeReceiver','browserExecutable','playwrightModule'])
 need(typeof config[key]==='string'&&isAbsolute(config[key]),'Use an absolute '+key+'.');
const work=resolve(config.workDirectory),repo=resolve(config.sourceRoot);
const grant=join(repo,'stellar/scf_2026/sf47_budget_model/workspace');
const workspace=join(work,'grant-workspace'),receivedWorkspace=join(work,'received-workspace'),nativeOutput=join(work,'native');
const node=config.nodeExecutable||process.execPath,python=config.pythonExecutable||'python3';
const actor=config.actor||'32C2 Statements operator';
const statePath=join(work,'continuation.json');
for(const directory of [work,nativeOutput,join(work,'requests'),join(work,'captures'),join(work,'browser-tmp')])
 await mkdir(directory,{recursive:true,mode:0o700});
need(((await lstat(work)).mode&0o077)===0,'Use a private Statements work directory.');
async function optionalJSON(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function atomic(path,value){
 const raw=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
 const temporary=path+'.writing-'+randomUUID(),handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
 await rename(temporary,path);return {filename:path.slice(work.length+1),bytes:raw.length,sha256:sha(raw)};
}
let state=await optionalJSON(statePath);
if(state)need(state.configSha256===sha(configRaw),'Continue with the same original Statements configuration.');
else state={schema:'commons.grant.original-statements-run.v1',configSha256:sha(configRaw),
 operationId:'scf-statements-original-a0d5-32c2-20261013',sourceHead:config.sourceHead,
 startedAt:new Date().toISOString(),stages:[],requests:[],captures:[]};
const save=()=>atomic(statePath,state);
async function stage(name,value={}){state.stages.push({name,at:new Date().toISOString(),...value});await save();process.stdout.write(JSON.stringify({stage:name,...value})+'\n');}
async function command(executable,args,{cwd=repo,timeout=120000}={}){
 return new Promise((done,reject)=>{
  const child=spawn(executable,args,{cwd,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',
   PATH:dirname(node)+':'+(process.env.PATH||''),SF47_BUYER_NODE:node},stdio:['ignore','pipe','pipe']});
  const out=[],err=[];let bytes=0,limited=false;
  const timer=setTimeout(()=>{limited=true;child.kill('SIGTERM');},timeout);
  for(const [stream,parts]of [[child.stdout,out],[child.stderr,err]])stream.on('data',chunk=>{
   bytes+=chunk.length;if(bytes>32*1024*1024){limited=true;child.kill('SIGTERM');}else parts.push(chunk);
  });
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',(code,signal)=>{
   clearTimeout(timer);const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');
   if(code!==0||signal||limited)reject(new Error('Original command failed: '+args[0]+'; '+(stderr||stdout).slice(-8000)));
   else done({stdout,stderr,code});
  });
 });
}
async function grantCLI(directory,args){
 const result=await command(python,['-B',join(grant,'cli.py'),args[0],'--workspace',directory,...args.slice(1)]);
 return JSON.parse(result.stdout);
}
let server=null,context=null,page=null,origin=null,token=null;
async function stopServer(){
 if(!server)return;const child=server;server=null;
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(done=>{const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
  child.once('close',()=>{clearTimeout(timer);done();});child.kill('SIGTERM');});
}
async function startServer(directory){
 await stopServer();
 const child=spawn(python,['-B',join(grant,'cli.py'),'serve','--workspace',directory,'--port','0'],
  {cwd:grant,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PATH:dirname(node)+':'+(process.env.PATH||''),SF47_BUYER_NODE:node},
   stdio:['ignore','pipe','pipe']});
 server=child;const errors=[];child.stderr.on('data',raw=>{if(errors.reduce((n,b)=>n+b.length,0)<131072)errors.push(raw);});
 const launch=await new Promise((done,reject)=>{
  let pending='';const timer=setTimeout(()=>reject(new Error('Original Grant server did not announce its address.')),30000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error('Original Grant server exited: '+code+'/'+signal+' '+Buffer.concat(errors).toString('utf8')));});
  child.stdout.on('data',raw=>{
   pending+=raw.toString('utf8');const lines=pending.split('\n');pending=lines.pop();
   for(const line of lines){try{const value=JSON.parse(line);if(value.url&&value.access_file){clearTimeout(timer);done(value);}}catch{}}
  });
 });
 origin=launch.url;
 const access=await readFile(launch.access_file,'utf8'),match=/href="([^"]+#access=[^"]+)"/.exec(access);
 need(match,'The original private workspace access link is absent.');
 const href=match[1].replaceAll('&amp;','&');token=new URL(href).hash.slice('#access='.length);
 return href;
}
async function api(path,body){
 const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',
  headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();
 need(response.ok,'Original API request failed: '+JSON.stringify(value));return value;
}
async function retainRequest(path,body){
 if(!body?.requestId)return;
 const key=sha(body.requestId),pathName=join(work,'requests',key+'.json'),prior=await optionalJSON(pathName);
 const request={id:body.requestId,path,body};
 need(!prior||canonical(prior)===canonical(request),'The original request ID has different fields.');
 if(!prior)await atomic(pathName,request);
 if(!state.requests.includes(key)){state.requests.push(key);await save();}
 if(state.phase==='csv-import'&&body.action==='statement.receive'){
  const originalPath=join(nativeOutput,'browser-csv-operation.json'),earlier=await optionalJSON(originalPath);
  const value={caseId:state.caseId,input:body};
  need(!earlier||canonical(earlier.input)===canonical(body),'Keep the original browser CSV request.');
  if(!earlier)await atomic(originalPath,value);
  state.csvRequestKey=key;await save();
 }
}
async function openOperations(href,caseId){
 await page.goto(href,{waitUntil:'domcontentloaded'});
 await page.locator('[data-tab="operations"]').waitFor({state:'visible'});
 await page.locator('[data-tab="operations"]').click();
 const operator=page.locator('[name="recordingActor"]');
 await operator.waitFor({state:'visible'});
 if(await operator.getAttribute('readonly')===null)await operator.fill(actor);
 await page.locator('[name="caseSelect"]').selectOption(caseId);
 await page.locator('[data-nav-find], [data-ops-tab="statements"]').first().waitFor({state:'visible'});
}
async function openSection(id){
 const nav=page.locator('.operating-navigation');
 if(await nav.count()){
  const toggle=nav.locator('[data-nav-toggle]');
  if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  const button=nav.locator('[data-nav-section="'+id+'"]').first();
  await button.waitFor({state:'attached'});
  const group=button.locator('xpath=ancestor::details[1]');
  if(await group.count()&&await group.getAttribute('open')===null)await group.locator('summary').click();
  await button.click();
 }else{
  need(!config.requireNavigation,'Select the maintained edition containing grouped case navigation.');
  await page.locator('[data-ops-tab="'+id+'"]').click();
 }
}
async function openStatements(){
 await openSection('statements');
 await page.locator('.statement-desk [name="accountId"]').waitFor({state:'visible'});
}
async function capture(name){
 const path=join(work,'captures',name+'.png');
 await page.screenshot({path,fullPage:true});await chmod(path,0o600);
 const raw=await readFile(path),value={name,filename:'captures/'+name+'.png',bytes:raw.length,sha256:sha(raw)};
 state.captures=state.captures.filter(row=>row.name!==name).concat(value);await save();return value;
}
async function preview(name,caseId=state.caseId){
 const waiting=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/operations/'+caseId+'/statement-preview'
  &&response.request().method()==='POST',{timeout:60000});
 waiting.catch(()=>{});
 await page.locator('.statement-desk [data-statement-action="preview"]').first().click();
 const response=await waiting,result=await response.json();need(response.ok(),'Original preview failed: '+JSON.stringify(result));
 await atomic(join(work,name+'.json'),result);
 await page.locator('.statement-desk [data-statement-confirm]').waitFor({state:'visible'});
 return result;
}
async function download(action,name){
 const waiting=page.waitForEvent('download',{timeout:60000});waiting.catch(()=>{});
 await page.locator('.statement-desk [data-statement-action="'+action+'"]').first().click();
 const result=await waiting,path=join(work,name);await result.saveAs(path);await chmod(path,0o600);
 return {path,raw:await readFile(path)};
}
async function openRecovery(path){
 const waiting=page.waitForEvent('filechooser',{timeout:30000});waiting.catch(()=>{});
 await page.locator('.statement-desk [data-statement-action="draft-import"]').click();
 const chooser=await waiting;await chooser.setFiles(path);
 await page.locator('.statement-desk [name="accountId"]').waitFor({state:'visible'});
}
async function statementCopiesBrowser(prepared){
 const desk=page.locator('.statement-desk');
 if(!await desk.locator('.statement-copies').count())return;
 const act=name=>desk.locator('[data-statement-action="copies-'+name+'"]');
 const original=await download('draft-export','copies-original-csv-before-switch.json');
 const initial=JSON.parse(original.raw);
 await desk.locator('[name="copyName"]').fill('Operating USD · original October');
 await desk.locator('[name="copyNote"]').fill('Complete original CSV mapping, classifications and supplier allocation before bank-file switch.');
 await act('new').click();
 await desk.locator('.statement-notice').filter({hasText:'Saved Operating USD'}).waitFor();
 await capture('00-copies-saved-csv-desktop');
 const firstArchive=await download('copies-export','statement-working-copies-first-complete.json');
 const first=JSON.parse(firstArchive.raw),csv=first.index.copies.find(row=>row.name==='Operating USD · original October');
 need(csv,'Save the original named CSV working copy.');
 const csvEdition=first.editions.find(row=>row.id===csv.id&&row.revision===csv.revision);
 need(canonical(csvEdition.draft.inputs)===canonical(initial.inputs),'Keep every original CSV input and applied invoice allocation.');
 await desk.locator('[data-statement-mapping] [name="sourceFormat"]').selectOption('OFX');
 await desk.locator('[data-statement-file]').setInputFiles(join(config.originalsDirectory,'bank-initial.ofx'));
 await desk.locator('[name="copyName"]').fill('Original OFX · account inspection');
 await desk.locator('[name="copyNote"]').fill('Original unchanged OFX bytes; precision exception remains for the later original account phase.');
 await act('new').click();
 await desk.locator('.statement-notice').filter({hasText:'Saved Original OFX'}).waitFor();
 await desk.locator('[name="copyQuery"]').fill('no-original-copy-has-this-name');await act('filter').click();
 await desk.locator('.statement-copies .statement-empty').waitFor();
 await capture('00-copies-empty-search-desktop');
 await desk.locator('[name="copyQuery"]').fill('October');await act('filter').click();
 await desk.locator('[data-statement-action="copies-select"][data-copy-id="'+csv.id+'"]').click();
 await desk.locator('[name="copyEdition"]').fill(String(csvEdition.revision));
 await act('review').click();await desk.locator('.statement-copy-comparison').waitFor();
 await capture('00-copies-before-open-desktop');
 await page.setViewportSize({width:390,height:844});await capture('00-copies-before-open-phone');
 const selected=await download('copies-download','statement-selected-edition-recovery.json');
 need(canonical(JSON.parse(selected.raw))===canonical(csvEdition.draft),'Selected edition download retains its exact complete original draft.');
 await act('open').click();
 await desk.locator('.statement-notice').filter({hasText:'Opened Operating USD'}).waitFor();
 const restored=await download('draft-export','statement-working-copies-restored-csv.json');
 need(canonical(JSON.parse(restored.raw).inputs)===canonical(initial.inputs),'Opening the saved CSV retains all source decisions and the original supplier allocation.');
 const archive=await download('copies-export','statement-working-copies-complete.json');
 const complete=JSON.parse(archive.raw);
 need(complete.index.copies.some(row=>row.filename==='bank-initial.ofx'),'Full archive includes the independently prepared original OFX.');
 need(complete.editions.every(row=>row.draft.caseId===state.caseId),'Every complete edition keeps the original case.');
 const chooser=page.waitForEvent('filechooser');await act('import').click();await(await chooser).setFiles(archive.path);
 await desk.locator('.statement-notice').filter({hasText:'Received 0 complete saved editions'}).waitFor();
 const conflict=structuredClone(complete),firstEdition=conflict.editions[0];
 firstEdition.draft.inputs.source.sourceUrl=(firstEdition.draft.inputs.source.sourceUrl||'')+'#conflicting-received-copy';
 const conflictPath=join(work,'statement-working-copies-conflicting-receiving.json');await atomic(conflictPath,conflict);
 const conflictChooser=page.waitForEvent('filechooser');await act('import').click();await(await conflictChooser).setFiles(conflictPath);
 await desk.locator('[role="alert"]').filter({hasText:'different complete content'}).waitFor();
 await capture('00-copies-conflict-preserves-original-phone');
 const afterConflict=await download('draft-export','statement-working-copies-after-conflict.json');
 need(canonical(JSON.parse(afterConflict.raw).inputs)===canonical(initial.inputs),'Conflict rejection preserves the current complete CSV.');
 await page.setViewportSize({width:1360,height:1000});
 await stage('original-statement-working-copies-operated',{caseId:state.caseId,csvCopyId:csv.id,csvEdition:csvEdition.revision,
  originalRequestId:initial.pending?.payload?.requestId||null,archiveSha256:sha(archive.raw),
  completeEditions:complete.editions.length,originalInvoiceId:prepared.invoiceId});
}
async function csvBrowser(href,prepared){
 await openOperations(href,state.caseId);await openStatements();
 const originalPath=join(nativeOutput,'browser-csv-operation.json');
 let original=await optionalJSON(originalPath);
 if(original){
  const result=await api('/api/operations/'+state.caseId+'/command',original.input);
  need(!original.result||canonical(result)===canonical(original.result),'The original browser CSV replay returned another result.');
  original={...original,result};await atomic(originalPath,original);
  await stage('original-browser-csv-request-recovered',{caseId:state.caseId,requestId:original.input.requestId,sourceId:result.recordId});
  return;
 }
 const desk=page.locator('.statement-desk'),field=name=>desk.locator('[data-statement-mapping] [name="'+name+'"]');
 await field('sourceFormat').selectOption('CSV');
 await desk.locator('[data-statement-file]').setInputFiles(join(config.originalsDirectory,'operating-october.csv'));
 await field('accountId').fill('operating-usd');await field('accountLabel').fill('Operating USD');
 await field('currency').fill('USD');await field('format.amountMode').selectOption('DEBIT_CREDIT');
 for(const [name,value]of Object.entries({'format.delimiter':',','format.decimalMark':'.','format.groupMark':'',
  'format.dateFormat':'YYYY-MM-DD','format.positiveDirection':'IN','columns.date':'Date','columns.reference':'Reference',
  'columns.description':'Description','columns.debit':'Debit','columns.credit':'Credit','columns.currency':'Currency'}))
  await field(name).selectOption(value);
 await field('openingBalance').fill('100.00');await field('closingBalance').fill('1100.00');
 await field('defaultCategory').selectOption('OTHER');
 const initial=await preview('csv-first-mapped-preview');
 need(initial.rows.length===3,'Review the complete original three-row CSV.');
 await desk.locator('[data-row-category="2"]').selectOption('GRANT');
 await desk.locator('[data-row-tranche="2"]').selectOption('1');
 await desk.locator('[data-row-category="3"]').selectOption('INVOICE');
 await desk.locator('[data-row-category="4"]').selectOption('CUSTOMER');
 await preview('csv-classified-before-allocation');
 await desk.locator('[data-statement-action="allocations"][data-row="3"]').click();
 if(await desk.locator('.statement-allocation-panel').count()){
  const allocation=()=>desk.locator('.statement-allocation-panel');
  await allocation().locator('[name="allocationQuery"]').fill('no-retained-invoice-matches-this-query');
  await allocation().locator('[data-statement-action="allocation-filter"]').click();
  await allocation().getByText('No invoices match.',{exact:false}).waitFor();
  await capture('00-allocation-empty-search-desktop');
  await allocation().locator('[name="allocationQuery"]').fill(prepared.invoiceId);
  await allocation().locator('[data-statement-action="allocation-filter"]').click();
  await allocation().locator('[data-statement-action="allocation-inspect"][data-invoice="'+prepared.invoiceId+'"]').first().click();
  const originalInvoice=await download('allocation-source','allocation-original-invoice-source.txt');
  const originalCase=await api('/api/operations/'+state.caseId);
  const invoice=originalCase.records.invoices.find(row=>row.id===prepared.invoiceId);
  need(invoice?.sourceIds?.length===1,'Keep the original single-source walkthrough invoice.');
  need(sha(originalInvoice.raw)===originalCase.sources.find(row=>row.id===invoice.sourceIds[0])?.sha256,'Download the exact retained invoice source.');
  await allocation().locator('[data-statement-action="allocation-add"][data-invoice="'+prepared.invoiceId+'"]').click();
  await allocation().locator('[name="amount.0"]').fill('125.00');
  need((await allocation().locator('[data-allocation-total]').textContent())==='125.00 USD','Update the visible partial allocation immediately.');
  need((await allocation().locator('[data-allocation-remaining]').textContent())==='125.00 USD','Update the visible remaining payment capacity immediately.');
  await allocation().locator('[name="allocationReason"]').fill('Reviewed the original 250 USD supplier invoice and original statement movement.');
  await allocation().locator('[data-statement-action="allocation-review"]').click();
  await allocation().locator('.statement-allocation-proposal').waitFor();
  await capture('00-allocation-partial-review-desktop');
  await page.setViewportSize({width:390,height:844});
  await capture('00-allocation-partial-review-phone');
  await allocation().locator('[name="amount.0"]').fill('250.01');
  need(await allocation().locator('.statement-allocation-proposal').count()===0,'Editing the explicit amount invalidates the earlier partial proposal.');
  await allocation().locator('[data-statement-action="allocation-review"]').click();
  await desk.locator('[role="alert"]').filter({hasText:'exceed'}).waitFor();
  await capture('00-allocation-capacity-error-phone');
  await allocation().locator('[data-statement-action="allocation-remaining"]').click();
  need(await allocation().locator('[name="amount.0"]').inputValue()==='250.00','Use the original invoice open amount capped by this movement.');
  const working=await download('draft-export','original-allocation-working-recovery.json');
  const workingValue=JSON.parse(working.raw);
  need(workingValue.allocationWorks?.['3']?.allocations?.[0]?.invoiceId===prepared.invoiceId,'Retain the unfinished allocation in the original full recovery.');
  await openRecovery(working.path);await preview('csv-reopened-allocation-working-copy');
  need(await allocation().locator('[name="amount.0"]').inputValue()==='250.00','Reopen the original unfinished allocation amount.');
  await allocation().locator('[data-statement-action="allocation-review"]').click();
  const reviewedAllocation=await download('allocation-review-export','original-supplier-allocation-review.json');
  const proposal=JSON.parse(reviewedAllocation.raw);
  need(proposal.rowNumber===3&&proposal.after.allocations.length===1&&proposal.after.allocations[0].invoiceId===prepared.invoiceId&&proposal.totalUsd==='250.00','Review the original invoice and full source payment.');
  await capture('00-allocation-complete-review-phone');
  await page.setViewportSize({width:1360,height:1000});
  await capture('00-allocation-complete-review-desktop');
  await allocation().locator('[data-statement-action="allocation-apply"]').click();
  await stage('original-supplier-allocation-reviewed',{caseId:state.caseId,invoiceId:prepared.invoiceId,sourceId:invoice.sourceIds[0],reviewSha256:sha(reviewedAllocation.raw),workingRecoverySha256:sha(working.raw)});
 }else{
  await desk.locator('[data-statement-action="add-allocation"]').click();
  await desk.locator('[data-statement-allocations] [name="invoice.0"]').selectOption(prepared.invoiceId);
  await desk.locator('[data-statement-allocations] [name="amount.0"]').fill('250.00');
  await desk.locator('[data-statement-allocations] button[type="submit"]').click();
 }
 await statementCopiesBrowser(prepared);
 const reviewed=await preview('csv-complete-reviewed-preview');
 need(reviewed.canImport&&reviewed.summary.newCount===3&&reviewed.balance.status==='MATCH',
  'Finish the original CSV classifications, allocation and source balances.');
 await capture('01-desktop-original-csv-mapping');
 await page.setViewportSize({width:390,height:844});
 await capture('02-phone-original-csv-mapping');
 const recovery=await download('draft-export','original-csv-browser-recovery.json');
 const saved=JSON.parse(recovery.raw);
 need(saved.schema==='sf47.statement-draft.v1'&&saved.caseId===state.caseId&&saved.inputs.source.contentBase64===
  (await readFile(join(config.originalsDirectory,'operating-october.csv'))).toString('base64'),'Retain the complete actual browser recovery.');
 await openRecovery(recovery.path);
 const reopened=await preview('csv-reopened-browser-recovery-preview');
 need(reopened.canImport&&reopened.summary.newCount===3,'Open the complete original browser recovery and its row decisions.');
 await capture('03-phone-reopened-csv-recovery');
 await page.setViewportSize({width:1360,height:1000});
 state.phase='csv-import';await save();
 const waiting=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/operations/'+state.caseId+'/command'
  &&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='statement.receive',{timeout:60000});
 waiting.catch(()=>{});
 await desk.locator('[data-statement-confirm]').check();
 await desk.locator('[data-statement-action="import"]').click();
 const response=await waiting,result=await response.json();need(response.ok(),'Original browser import failed: '+JSON.stringify(result));
 const retained=await optionalJSON(originalPath);
 need(retained&&canonical(retained.input)===canonical(response.request().postDataJSON()),'The actual browser request must precede its result.');
 await atomic(originalPath,{...retained,result});
 await atomic(join(work,'requests',state.csvRequestKey+'.result.json'),{result});
 state.phase=null;await save();
 const current=await api('/api/operations/'+state.caseId);
 need(current.records.cash.filter(row=>row.state==='OBSERVED').length===3,'Read back the three original received cash movements.');
 await atomic(join(work,'browser-csv-saved-case.json'),current);
 await stage('original-browser-csv-received',{caseId:state.caseId,requestId:retained.input.requestId,sourceId:result.recordId,cashIds:result.cashIds});
}
async function native(mode,planId){
 const path=join(work,'native-config.json');
 await atomic(path,{sourceDirectory:grant,output:nativeOutput,originals:config.originalsDirectory,
  origin,keyFile:join(workspace,'access.key'),planId,...(config.caseId?{caseId:config.caseId}:{}) ,
  ...(config.invoiceId?{invoiceId:config.invoiceId}:{})});
 const result=await command(python,['-B',config.nativeReceiver,mode,'--config',path]);
 const parsed=JSON.parse(result.stdout.trim());await atomic(join(work,'native-'+mode+'-result.json'),parsed);return parsed;
}
async function inspectAccount(name,{review=false,exportAccount=false}={}){
 await openSection('cash');
 const desk=page.locator('.cash-account-desk');await desk.waitFor({state:'visible'});
 for(const [field,value]of [['startDate','2024-08-15'],['endDate','2026-10-12']]){
  const control=desk.locator('[data-ca-field="select.'+field+'"]');
  await control.fill(value);await control.dispatchEvent('change');
 }
 for(const field of ['network','currency','asset'])await desk.locator('[data-ca-field="select.'+field+'"]').selectOption('null');
 const selectedCase=await page.locator('[name="caseSelect"]').inputValue();
 const waiting=page.waitForResponse(response=>{
  const url=new URL(response.url());
  return url.pathname==='/api/operations/'+selectedCase+'/cash-account'&&
   url.searchParams.get('startDate')==='2024-08-15'&&url.searchParams.get('endDate')==='2026-10-12';
 },{timeout:60000});waiting.catch(()=>{});
 await desk.locator('[data-ca-action="load"]').click();
 const response=await waiting,report=await response.json();
 need(response.ok()&&report.selection.startDate==='2024-08-15'&&report.selection.endDate==='2026-10-12',
  'Open the complete original two-year account period in the native Cash desk.');
 need(report.selection.network===null&&report.selection.currency===null&&report.selection.asset===null,
  'Review all original account currencies and assets.');
 await atomic(join(work,name+'-account.json'),report);
 await desk.locator('[data-ca-action="export"]').waitFor({state:'visible'});
 await capture(name);
 if(review){
  for(const panel of ['accounts','balances','corrections','sources']){
   await desk.locator('[data-ca-action="panel"][data-id="'+panel+'"]').click();
   await capture(name+'-'+panel);
  }
  const correction=report.corrections.find(item=>item.record?.original?.externalRef==='TRX1002');
  need(correction,'The account must retain the original supplier payment correction.');
  await desk.locator('[data-ca-action="panel"][data-id="corrections"]').click();
  for(const [kind,id]of [['original',correction.record.originalCashId||correction.record.original.id],
    ['successor',correction.record.replacementCashId||correction.record.replacement.id]]){
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/'+selectedCase+'/cash-account',{timeout:60000});
   pending.catch(()=>{});
   await desk.locator('[data-ca-action="detail"][data-id="'+id+'"]').first().click();
   need((await pending).ok(),'Open the original correction record in the complete account.');
   await desk.locator('.cash-account-record').waitFor({state:'visible'});
   await capture(name+'-correction-'+kind);
  }
 }
 if(exportAccount){
  const pending=page.waitForEvent('download',{timeout:60000});pending.catch(()=>{});
  await desk.locator('[data-ca-action="export"]').click();
  const value=await pending,path=join(work,name+'-complete-account.zip');await value.saveAs(path);await chmod(path,0o600);
  const raw=await readFile(path);
  need(raw.length>0,'Retain the complete original browser account download.');
  const record={filename:path.slice(work.length+1),bytes:raw.length,sha256:sha(raw),caseId:selectedCase,
   caseVersion:report.case.version,reportSha256:report.reportSha256};
  await atomic(join(work,name+'-complete-account-download.json'),record);return record;
 }
 return report;
}
async function reopenOriginal(caseId,key,sourceId){
 const original=await api('/api/operations/'+caseId+'/account-reconciliation-statements/'+sourceId+'/inputs');
 need(original.inputs?.source?.contentBase64,'The original source reopening must return the complete inputs.');
 await atomic(join(work,key+'-received-original-inputs.json'),original);
 const scales=original.inputs.statementOptions?.currencyScales||{};
 const recovery={schema:'sf47.statement-draft.v1',caseId,inputs:original.inputs,headers:[],inspection:null,
  nativeScalesText:Object.entries(scales).map(([currency,scale])=>currency+': '+scale).join('\n'),
  preview:null,dirty:true,pending:null,accepted:null,originalInputHandoff:null};
 const path=join(work,key+'-original-input-recovery.json');await atomic(path,recovery);
 await openStatements();await openRecovery(path);
 if(original.inputs.sourceFormat&&original.inputs.sourceFormat!=='CSV'){
  const waiting=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/operations/'+caseId+'/statement-inspect'
   &&response.request().method()==='POST',{timeout:60000});waiting.catch(()=>{});
  await page.locator('.statement-desk [data-statement-action="inspect"]').click();
  const response=await waiting,inspection=await response.json();need(response.ok(),'Open the original native account inspection.');
  need(inspection.statements.some(row=>row.id===original.inputs.statementId),'Keep the original bank account section identity.');
  await atomic(join(work,key+'-received-bank-inspection.json'),inspection);
 }
 const report=await preview(key+'-received-browser-preview',caseId);
 need(report.canImport&&report.summary.newCount===0,'The received original input must resolve its existing cash identities.');
 await capture('received-'+key+'-original-source');
 return {statementSourceId:sourceId,sourceSha256:report.source.sha256,previewSha256:report.previewSha256,
  existingCount:report.summary.existingCount,excludedCount:report.summary.excludedCount};
}
try{
 const identities={};
 for(const file of ['cli.py','server.py','operations.py','operations_statements.py','operations_statement_formats.py',
  'operations_cash_accounts.py','operations_account_reconciliation.py','operations_statements.mjs',
  'operations_cash_accounts.mjs','operations_account_reconciliation.mjs','operations.mjs']){
  const raw=await readFile(join(grant,file));identities[file]={bytes:raw.length,sha256:sha(raw)};
 }
 for(const file of ['operations_navigation.mjs','operations_navigation_ui.mjs']){
  try{const raw=await readFile(join(grant,file));identities[file]={bytes:raw.length,sha256:sha(raw)};}
  catch(error){if(error.code!=='ENOENT'||config.requireNavigation)throw error;}
 }
 if(state.sourceFiles)need(canonical(state.sourceFiles)===canonical(identities),'Reopen the same original installed Grant edition.');
 else{state.sourceFiles=identities;await save();}
 await grantCLI(workspace,['init']);
 const href=await startServer(workspace),existingNative=await optionalJSON(join(nativeOutput,'operations-walkthrough-checkpoint.json'));
 const plans=(await api('/api/plans')).plans;
 const planId=config.planId||existingNative?.statementsPlan?.id||state.planId||(plans.length===1?plans[0].id:null);
 need(planId,'Select the existing original planning case when this workspace has several plans.');
 state.planId=planId;await save();
 const prepared=await native('prepare',planId);state.caseId=prepared.caseId;state.invoiceId=prepared.invoiceId;await save();
 const {chromium}=await import(pathToFileURL(config.playwrightModule).href);
 context=await chromium.launchPersistentContext(join(work,'browser-profile'),{executablePath:config.browserExecutable,
  headless:true,args:['--disable-dev-shm-usage'],viewport:{width:1360,height:1000},acceptDownloads:true,
  env:{...process.env,TMPDIR:join(work,'browser-tmp')}});
 page=await context.newPage();const browserErrors=[];
 page.on('pageerror',error=>browserErrors.push(String(error).replaceAll(token||'\0','[workspace key]')));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['http:','https:'].includes(url.protocol)){await route.continue();return;}
  if(url.origin!==origin){await route.abort();return;}
  if(request.method()==='POST'&&url.pathname.startsWith('/api/operations'))
   await retainRequest(url.pathname,request.postDataJSON());
  await route.continue();
 });
 await csvBrowser(href,prepared);
 const operated=await native('continue',planId);state.nativeResult=operated;await save();
 await stage('original-native-banks-and-correction-complete',{caseId:state.caseId,caseVersion:operated.caseVersion,
  correction:operated.correction,ofx:operated.ofx,mt940:operated.mt940,archives:operated.archives});
 await openOperations(href,state.caseId);
 const browserAccount=await inspectAccount('04-desktop-complete-cash-account',{review:true,exportAccount:true});
 state.browserAccount=browserAccount;await save();
 await page.setViewportSize({width:390,height:844});await inspectAccount('05-phone-complete-cash-account');
 await page.setViewportSize({width:1360,height:1000});
 const completePath=join(work,browserAccount.filename),complete=await readFile(completePath);
 need(complete.length===browserAccount.bytes&&sha(complete)===browserAccount.sha256,'Retain the actual complete browser account ZIP.');
 await stopServer();
 await grantCLI(receivedWorkspace,['init']);
 if(!state.importRequestId){state.importRequestId='statements-cold-receive-'+randomUUID();await save();}
 const imported=await grantCLI(receivedWorkspace,['operations','import','--file',completePath,
  '--name','Original Statements account / independently received','--actor',actor,
  '--request-id',state.importRequestId,'--note','Reopen the original complete account, bank sources, supplier allocation and cash correction.']);
 need(!state.imported||state.imported.id===imported.id,'Continue the original independent account receiver.');
 state.imported=imported;await save();
 const receivedHref=await startServer(receivedWorkspace);
 const received=await api('/api/operations/'+imported.id),original=JSON.parse(await readFile(join(nativeOutput,'complete-operated-case.json'),'utf8'));
 need(canonical(received.records.cash)===canonical(original.records.cash),'The received cash records or original successor chain differ.');
 need(canonical(received.records.invoices)===canonical(original.records.invoices),'The received supplier invoice or allocation differs.');
 need(canonical(received.sources)===canonical(original.sources),'The complete original bank sources must reopen unchanged.');
 await atomic(join(work,'complete-cold-received-case.json'),received);
 await openOperations(receivedHref,imported.id);await inspectAccount('06-cold-received-complete-account');
 const reopened={};
 for(const [key,receipt]of [['csv',operated.originalCsv],['ofx',operated.ofx],['mt940',operated.mt940]])
  reopened[key]=await reopenOriginal(imported.id,key,receipt.recordId);
 await page.setViewportSize({width:390,height:844});
 reopened.phoneMt940=await reopenOriginal(imported.id,'mt940-phone',operated.mt940.recordId);
 await openSection('account-reconciliation');
 await page.locator('.account-reconciliation-desk').waitFor({state:'visible'});
 await capture('07-phone-original-account-reconciliation');
 need(browserErrors.length===0,'The original browser reported: '+browserErrors.join('; '));
 await stopServer();
 const coldHref=await startServer(receivedWorkspace);
 await openOperations(coldHref,imported.id);await inspectAccount('08-closed-workspace-reopened-account');
 const final=await api('/api/operations/'+imported.id);
 need(canonical(final.records.cash)===canonical(original.records.cash),'The closed workspace did not retain its original cash.');
 const result={schema:'commons.grant.original-statements-complete.v1',state:'COMPLETE',operationId:state.operationId,
  sourceHead:state.sourceHead,sourceFiles:state.sourceFiles,caseId:state.caseId,caseVersion:operated.caseVersion,
  receivedCaseId:imported.id,receivedVersion:final.program.version,invoiceId:state.invoiceId,
  native:operated,browserAccount,reopened,captures:state.captures,completedAt:new Date().toISOString()};
 state.result=await atomic(join(work,'statements-complete-result.json'),result);await save();
 await atomic(join(work,'navigation-handoff.json'),{
  schema:'commons.grant.original-statements-navigation-handoff.v1',owner:'390E',operationId:state.operationId,
  sourceRoot:repo,sourceHead:state.sourceHead,sourceFiles:state.sourceFiles,grantDirectory:grant,
  workspace:receivedWorkspace,caseId:imported.id,originalCaseId:state.caseId,invoiceId:state.invoiceId,
  originalStatementSourceIds:{csv:operated.originalCsv.recordId,ofx:operated.ofx.recordId,mt940:operated.mt940.recordId},
  browserExecutable:config.browserExecutable,playwrightModule:config.playwrightModule,
  nodeExecutable:node,pythonExecutable:python,result:state.result,
  controller:resolve(process.argv[1]),configPath,
  completedAccountArchive:browserAccount,
  continuation:'Start the same original Grant CLI serve command for this received workspace; use its ordinary access-file link and original case. Continue full grouped navigation, Find in case, original-source/editor handoff, saved shortcuts and actual finance/reviewer access in this same case.'
 });
 await stage('complete-original-account-received',{caseId:state.caseId,receivedCaseId:imported.id,invoiceId:state.invoiceId,
  result:state.result,captures:state.captures.length});
}catch(error){
 const message=String(error?.stack||error).replaceAll(token||'\0','[workspace key]');
 await atomic(join(work,'last-interruption.json'),{at:new Date().toISOString(),message,phase:state.phase||null});
 process.stderr.write(message+'\n');process.exitCode=1;
}finally{
 if(context)await context.close().catch(()=>{});
 await stopServer();
}
