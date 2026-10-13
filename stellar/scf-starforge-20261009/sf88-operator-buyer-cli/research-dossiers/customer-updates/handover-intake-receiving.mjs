#!/usr/bin/env node
// MIT. Actual first-use handover selection followed by the original complete desk receiving course.
import {join,resolve,basename,dirname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerDirectory,readCustomerJson,retainCustomerBytes,retainCustomerJson,describeCustomerFile,copyCustomerFile} from './files.mjs';
import {startCustomerHandoverIntakeDesk} from './handover-intake-desk.mjs';
import {readCustomerHandoverIntakePreparation} from './handover-intake.mjs';
import {runCustomerHandoverDeskReceiving,HANDOVER_DESK_RECEIVING_SCHEMA} from './handover-desk-receiving.mjs';

export const HANDOVER_INTAKE_RECEIVING_SCHEMA='sf88.research-customer-handover-intake-receiving.v1';
const JSON_LIMIT=16*1024*1024,WIRE_LIMIT=256*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const digest=x=>createHash('sha256').update(x).digest('hex');
const pause=milliseconds=>new Promise(done=>setTimeout(done,milliseconds));
function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','INTAKE_RECEIVING_ABSOLUTE_PATH');return value;}
function checksum(value){need(/^[a-f0-9]{64}$/.test(value??''),'INTAKE_RECEIVING_SHA_REQUIRED');return value;}
function key(value){need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value??''),'INTAKE_RECEIVING_KEY_REQUIRED');return value;}
function fields(value,allowed){need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),'INTAKE_RECEIVING_INPUT_FIELDS');}
function limit(value,max,min=0){need(Number.isSafeInteger(value)&&value>=min&&value<=max,'INTAKE_RECEIVING_LIMIT_REQUIRED');return value;}
function safeCode(error){return /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'INTAKE_RECEIVING_INCOMPLETE';}
async function save(root,name,value){await customerDirectory(root);return retainCustomerJson(root,name,value);}
async function snapshot(root,name,value){return save(await customerDirectory(join(root,name)),digest(json(value))+'.json',value);}
function validate(input){
 fields(input,['schema','connectionFile','workspaceDirectory','directory','engine','dossierId','deliveryId','sourceWorkspace',
  'scope','rounds','playwrightModule','chromiumExecutable','python','node','jobTimeoutMs']);
 need(input.schema===HANDOVER_INTAKE_RECEIVING_SCHEMA,'INTAKE_RECEIVING_SCHEMA');
 for(const name of ['connectionFile','directory','playwrightModule','chromiumExecutable'])absolute(input[name]);
 if(input.workspaceDirectory!==undefined)absolute(input.workspaceDirectory);
 fields(input.engine,['root','manifestFile','manifestSha256']);absolute(input.engine.root);absolute(input.engine.manifestFile);checksum(input.engine.manifestSha256);
 need(/^d_[a-f0-9-]{36}$/.test(input.dossierId??'')&&/^cud_[a-f0-9]{64}$/.test(input.deliveryId??''),'INTAKE_RECEIVING_NATIVE_IDS_REQUIRED');
 if(input.sourceWorkspace!==undefined&&input.sourceWorkspace!==null){
  fields(input.sourceWorkspace,['library','actor']);
  need(/^(original|received-[a-f0-9]{64})$/.test(input.sourceWorkspace.library??'')&&
   typeof input.sourceWorkspace.actor==='string'&&input.sourceWorkspace.actor.length>0&&input.sourceWorkspace.actor.length<=200,'INTAKE_RECEIVING_SOURCE_WORKSPACE_REQUIRED');
 }
 const scope=input.scope;
 fields(scope,['operationId','customerLabel','sourceActor','maximumTotalItems','maximumTotalReturns','rounds','output']);
 key(scope.operationId);need(typeof scope.customerLabel==='string'&&scope.customerLabel.trim()&&scope.customerLabel.length<=240,'INTAKE_RECEIVING_CUSTOMER_REQUIRED');
 if(scope.sourceActor!==undefined)need(typeof scope.sourceActor==='string'&&scope.sourceActor.trim()&&scope.sourceActor.length<=512,'INTAKE_RECEIVING_SOURCE_ACTOR_REQUIRED');
 limit(scope.maximumTotalItems,100000);limit(scope.maximumTotalReturns,100000,1);
 need(Array.isArray(scope.rounds)&&scope.rounds.length>0&&scope.rounds.length<=32&&scope.rounds.length<=scope.maximumTotalReturns,'INTAKE_RECEIVING_ROUNDS_REQUIRED');
 const keys=new Set();
 for(const row of scope.rounds){fields(row,['key','maximumItems','maximumSourceBytes']);key(row.key);need(!keys.has(row.key),'INTAKE_RECEIVING_DUPLICATE_ROUND');keys.add(row.key);
  limit(row.maximumItems,100000);limit(row.maximumSourceBytes,WIRE_LIMIT,1);}
 fields(scope.output,['filenameStem','maximumArchiveBytes']);key(scope.output.filenameStem);limit(scope.output.maximumArchiveBytes,WIRE_LIMIT,1);
 need(input.rounds===undefined||Array.isArray(input.rounds)&&input.rounds.every(row=>keys.has(row.key)),'INTAKE_RECEIVING_UNSELECTED_RETURN');
 const timeout=input.jobTimeoutMs??1800000;limit(timeout,86400000,1000);
 return {...input,sourceWorkspace:input.sourceWorkspace??null,rounds:input.rounds??[],python:input.python??'python3',node:input.node??process.execPath,jobTimeoutMs:timeout};
}
function apiFor(url){
 const parsed=new URL(url);need(parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&parsed.pathname==='/'&&!parsed.search,'INTAKE_RECEIVING_HOST_CHANGED');
 const token=new URLSearchParams(parsed.hash.slice(1)).get('token');need(token,'INTAKE_RECEIVING_TOKEN_REQUIRED');
 return async(path,{method='GET',body}={})=>{
  const response=await fetch(parsed.origin+path,{method,headers:{Authorization:'Bearer '+token,Origin:parsed.origin,
   ...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:json(body),redirect:'error',cache:'no-store'});
  const parts=[];let size=0;for await(const part of response.body??[]){const bytes=Buffer.from(part);size+=bytes.length;
   need(size<=JSON_LIMIT,'INTAKE_RECEIVING_RESPONSE_LIMIT');parts.push(bytes);}
  const raw=Buffer.concat(parts,size);need(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),'INTAKE_RECEIVING_RESPONSE_UTF8');
  let value;try{value=JSON.parse(raw.toString('utf8'));}catch{need(false,'INTAKE_RECEIVING_RESPONSE_JSON');}
  if(!response.ok)throw Object.assign(new Error(value?.code??value?.error?.code??'INTAKE_RECEIVING_HTTP_FAILED'),
   {code:value?.code??value?.error?.code??'INTAKE_RECEIVING_HTTP_FAILED',status:response.status});return value;
 };
}
async function waitFor(api,fn,timeout,code){
 const until=Date.now()+timeout;
 for(;;){const value=await api('/api/status');if(fn(value))return value;
  need(Date.now()<until,code);await pause(200);}
}
async function settled(api,job,timeout){
 need(job&&typeof job.id==='string','INTAKE_RECEIVING_JOB_REQUIRED');
 const status=await waitFor(api,s=>{need(s.job?.id===job.id,'INTAKE_RECEIVING_JOB_CHANGED');return s.job.state!=='RUNNING';},timeout,'INTAKE_RECEIVING_JOB_TIMEOUT');
 need(status.job.state==='SUCCEEDED',status.job.error?.code??'INTAKE_RECEIVING_JOB_FAILED');return status;
}
async function browserJob(page,api,button,action,timeout){
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/'+action&&response.request().method()==='POST',{timeout});
 await page.locator(button).click();const response=await pending;
 need(response.status()===202,'INTAKE_RECEIVING_JOB_NOT_STARTED');return settled(api,(await response.json()).job,timeout);
}
async function choosePaged(page,select,more,wanted,timeout){
 for(let count=0;count<=100000;count+=100){
  await page.locator(select).waitFor();
  const options=await page.locator(select).evaluate(node=>Array.from(node.options).map(option=>option.value));
  if(options.includes(wanted)){await page.locator(select).selectOption(wanted);return;}
  need(await page.locator(more).isVisible(),'INTAKE_RECEIVING_NATIVE_SELECTION_ABSENT');
  const before=options.length;await page.locator(more).click();
  await page.waitForFunction(({selector,count})=>document.querySelector(selector).options.length>count,{selector:select,count:before},{timeout});
 }
 need(false,'INTAKE_RECEIVING_NATIVE_INVENTORY_LIMIT');
}
function baselineMatch(row,input){return row.dossierId===input.dossierId&&row.deliveryId===input.deliveryId&&
 (input.sourceWorkspace?row.sourceWorkspace?.library===input.sourceWorkspace.library&&row.sourceWorkspace?.actor===input.sourceWorkspace.actor:!row.sourceWorkspace);}
async function chooseBaseline(page,api,input){
 let status=await api('/api/status'),matches=status.baselines.filter(row=>baselineMatch(row,input));
 const retained=matches.find(row=>row.id===status.draft?.value?.baselineId);
 if(retained)return retained;
 need(matches.length<=1,'INTAKE_RECEIVING_BASELINE_AMBIGUOUS');
 if(matches.length)return matches[0];
 need(!status.frozen&&!status.prepared,'INTAKE_RECEIVING_FROZEN_BASELINE_CHANGED');
 await page.locator('#load-dossiers').click();
 await page.waitForFunction(()=>document.getElementById('inventory-note').textContent.includes('immutable inventory snapshot'),null,{timeout:input.jobTimeoutMs});
 await choosePaged(page,'#dossier','#more-dossiers',input.dossierId,input.jobTimeoutMs);
 await page.waitForFunction(()=>!document.getElementById('delivery').disabled,null,{timeout:input.jobTimeoutMs});
 // The backend pins this dossier's native history before returning these records.
 await choosePaged(page,'#delivery','#more-deliveries',input.deliveryId,input.jobTimeoutMs);
 if(input.sourceWorkspace){await page.locator('summary').filter({hasText:'Include an original source workspace'}).click();
  await page.locator('#source-library').fill(input.sourceWorkspace.library);await page.locator('#source-actor').fill(input.sourceWorkspace.actor);}
 status=await browserJob(page,api,'#retain-baseline','baseline',input.jobTimeoutMs);
 matches=status.baselines.filter(row=>baselineMatch(row,input));need(matches.length===1,'INTAKE_RECEIVING_BASELINE_NOT_RETAINED');
 return matches[0];
}
async function fillScope(page,scope,baselineId){
 await page.locator('#baseline').selectOption(baselineId);
 for(const [id,value] of [['operation-id',scope.operationId],['customer-label',scope.customerLabel],
  ['scope-source-actor',scope.sourceActor??''],['total-items',scope.maximumTotalItems],['total-returns',scope.maximumTotalReturns],
  ['filename-stem',scope.output.filenameStem],['archive-bytes',scope.output.maximumArchiveBytes]])
  await page.locator('#'+id).fill(String(value));
 let count=await page.locator('#rounds [data-round-index]').count();
 while(count>scope.rounds.length){await page.locator('#rounds [data-remove-round]').last().click();count--;}
 while(count<scope.rounds.length){await page.locator('#add-round').click();count++;}
 for(const [index,row] of scope.rounds.entries())for(const field of ['key','maximumItems','maximumSourceBytes'])
  await page.locator('#rounds [data-round-index="'+index+'"] [data-field="'+field+'"]').fill(String(row[field]));
}
function verifyPreview(preview,baseline,input,workspaceId,draftSha256){
 checksum(preview.sha256);const value=preview.value,selection=value.selection;
 need(value.draftSha256===draftSha256&&value.baseline.id===baseline.id&&value.baseline.manifestSha256===baseline.manifestSha256&&
  selection.schema==='sf88.research-customer-handover-returns.v1'&&selection.workspace_id===workspaceId&&selection.dossier_id===input.dossierId&&
  selection.baseline.manifest_sha256===baseline.manifestSha256&&selection.operation_id===input.scope.operationId&&
  selection.customer_label===input.scope.customerLabel&&selection.expected_revision===value.current.revision&&
  selection.expected_revision_sha256===value.current.sha256,'INTAKE_RECEIVING_PREVIEW_CHANGED');
 need(selection.maximum_total_items===input.scope.maximumTotalItems&&selection.maximum_total_returns===input.scope.maximumTotalReturns&&
  same(selection.rounds,input.scope.rounds.map(row=>({key:row.key,maximum_items:row.maximumItems,maximum_source_bytes:row.maximumSourceBytes})))&&
  same(selection.output,{filename_stem:input.scope.output.filenameStem,maximum_archive_bytes:input.scope.output.maximumArchiveBytes})&&
  (selection.source_actor??null)===(input.scope.sourceActor??null)&&same(selection.engine,input.engine),'INTAKE_RECEIVING_SCOPE_CHANGED');
 need(Array.isArray(value.history)&&value.history.some(row=>row.revision===baseline.revision)&&Array.isArray(value.inheritedReceipts)&&
  value.inheritedReturns===value.inheritedReceipts.length&&
  value.reviewedItemCount===value.inheritedReceipts.reduce((sum,row)=>sum+row.decisions.length,0)&&
  value.inheritedReturns+input.scope.rounds.length<=input.scope.maximumTotalReturns&&
  value.reviewedItemCount<=input.scope.maximumTotalItems,'INTAKE_RECEIVING_PRIOR_RETURN_SCOPE_CHANGED');
 return selection;
}
async function prepareFromBrowser(page,api,preview,timeout){
 let withheld=null,failed=null;
 const intercept=async route=>{
  if(route.request().method()!=='POST')return route.continue();
  try{const response=await route.fetch();need(response.status()===202,'INTAKE_RECEIVING_PREPARE_NOT_STARTED');
   const request=route.request().postDataJSON();need(request.previewSha256===preview.sha256,'INTAKE_RECEIVING_PREPARE_PREVIEW_CHANGED');
   withheld=await response.json();await route.abort('failed');}
  catch(error){failed=error;await route.abort('failed').catch(()=>{});}
 };
 await page.route('**/api/prepare',intercept);
 try{
  await page.locator('#acknowledge').check();
  await page.locator('#prepare').click();
  const until=Date.now()+timeout;while(!withheld){if(failed)throw failed;need(Date.now()<until,'INTAKE_RECEIVING_PREPARE_RESPONSE_TIMEOUT');await pause(100);}
  const status=await settled(api,withheld.job,timeout);
  need(status.prepared&&status.frozen?.previewSha256===preview.sha256,'INTAKE_RECEIVING_PREPARED_BINDING_CHANGED');
  return status;
 }finally{await page.unroute('**/api/prepare',intercept);}
}
async function downloads(page,root,attempt,files){
 const out=[];
 for(const descriptor of files){
  need(typeof descriptor.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(descriptor.id)&&
   typeof descriptor.filename==='string'&&descriptor.filename.length>0,'INTAKE_RECEIVING_DOWNLOAD_DESCRIPTOR');
  checksum(descriptor.sha256);limit(descriptor.bytes,WIRE_LIMIT);
  const destination=join(root,'downloads',descriptor.id+'.bin');await customerDirectory(dirname(destination));
  let exists=false;try{await describeCustomerFile(destination,{bytes:descriptor.bytes,sha256:descriptor.sha256,maximum:WIRE_LIMIT});exists=true;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(!exists){
   const waiting=page.waitForEvent('download',{timeout:1800000});
   await page.locator('button[data-download="'+descriptor.id+'"]').click();
   const download=await waiting,temp=join(attempt,descriptor.id+'.bin');await download.saveAs(temp);
   need(!await download.failure(),'INTAKE_RECEIVING_BROWSER_DOWNLOAD_FAILED');
   await copyCustomerFile(temp,destination,{bytes:descriptor.bytes,sha256:descriptor.sha256,maximum:WIRE_LIMIT});
  }
  const result={...descriptor,file:destination};await save(dirname(destination),descriptor.id+'.json',descriptor);out.push(result);
 }
 return out;
}
export async function runCustomerHandoverIntakeReceiving(options){
 const input=validate(options),root=await customerDirectory(input.directory);
 return withPrivateLock(root,'handover-intake-receiving.lock',async()=>{
  const privateRoot=await customerDirectory(join(root,'private')),publicRoot=await customerDirectory(join(root,'public'));
  const intakeDirectory=await customerDirectory(join(root,'intake')),attempt=await customerDirectory(join(privateRoot,'attempts',randomUUID()));
  const clientFactory=()=>ResearchWorkspaceClient.fromFile(input.connectionFile,input.workspaceDirectory?{directory:input.workspaceDirectory}:{});
  const client=clientFactory();let intake,browser,prepared,firstUse;
  try{
   const workspaceId=(await client.status()).workspaceId;
   const binding={schema:HANDOVER_INTAKE_RECEIVING_SCHEMA,workspaceId,dossierId:input.dossierId,deliveryId:input.deliveryId,
    sourceWorkspace:input.sourceWorkspace,scope:input.scope,engine:input.engine,intakeDirectory,
    playwrightModule:input.playwrightModule,chromiumExecutable:input.chromiumExecutable,python:input.python,node:input.node};
   await save(privateRoot,'BINDING.json',binding);
   intake=await startCustomerHandoverIntakeDesk({client,clientFactory,directory:intakeDirectory,
    engineRoot:input.engine.root,engineManifest:input.engine.manifestFile,engineManifestSha256:input.engine.manifestSha256,
    python:input.python,node:input.node});
   const api=apiFor(intake.url),playwright=await import(pathToFileURL(input.playwrightModule).href);
   need(playwright.chromium&&typeof playwright.chromium.launch==='function','INTAKE_RECEIVING_PLAYWRIGHT_REQUIRED');
   browser=await playwright.chromium.launch({executablePath:input.chromiumExecutable,headless:true});
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1050}}),page=await context.newPage();
   page.on('dialog',dialog=>void dialog.accept());
   await page.goto(intake.url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>location.hash===''&&document.getElementById('workspace').textContent.includes('research_'));
   let status=await api('/api/status');need(status.workspace.workspaceId===workspaceId,'INTAKE_RECEIVING_WORKSPACE_CHANGED');
   const baselineAlreadyRetained=status.baselines.some(row=>baselineMatch(row,input));
   const baseline=await chooseBaseline(page,api,input);
   await save(publicRoot,'BASELINE.json',baseline);
   const draft={baselineId:baseline.id,...input.scope};
   status=await api('/api/status');const scopeAlreadyFrozen=!!status.frozen||!!status.prepared;
   if(!status.frozen&&!status.prepared){
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('baseline').options.length>1,null,{timeout:input.jobTimeoutMs});
    await fillScope(page,input.scope,baseline.id);
    const saving=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/draft'&&response.request().method()==='POST');
    await page.locator('#save-draft').click();const saved=await saving;
    need(saved.ok(),'INTAKE_RECEIVING_DRAFT_SAVE_FAILED');const savedDraft=await saved.json();
    need(same(savedDraft.value,draft),'INTAKE_RECEIVING_DRAFT_CHANGED');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>document.getElementById('draft-state').textContent.includes(expected),savedDraft.sha256,{timeout:input.jobTimeoutMs});
    need(await page.locator('#operation-id').inputValue()===input.scope.operationId&&
     await page.locator('#customer-label').inputValue()===input.scope.customerLabel,'INTAKE_RECEIVING_RELOADED_SCOPE_CHANGED');
    status=await browserJob(page,api,'#preview','preview',input.jobTimeoutMs);
    verifyPreview(status.preview,baseline,input,workspaceId,savedDraft.sha256);await snapshot(publicRoot,'previews',status.preview);
    await page.locator('#refresh').click();
    await page.waitForFunction(expected=>document.getElementById('preview-json').textContent.includes(expected),savedDraft.sha256,{timeout:input.jobTimeoutMs});
    status=await prepareFromBrowser(page,api,status.preview,input.jobTimeoutMs);
    await snapshot(publicRoot,'response-recovery',{action:'prepare',previewSha256:status.frozen.previewSha256,
     responseWithheld:true,prepared:status.prepared});
   }else{
    need(same(status.draft?.value,draft),'INTAKE_RECEIVING_FROZEN_SCOPE_CHANGED');
    verifyPreview(status.preview,baseline,input,workspaceId,status.draft.sha256);
    if(!status.prepared){
     const resumed=await api('/api/prepare',{method:'POST',body:{previewSha256:status.frozen.previewSha256}});
     status=await settled(api,resumed.job,input.jobTimeoutMs);
    }
   }
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!document.getElementById('launch').disabled,null,{timeout:input.jobTimeoutMs});
   status=await browserJob(page,api,'#launch','launch',input.jobTimeoutMs);
   need(status.desk?.url,'INTAKE_RECEIVING_ORIGINAL_DESK_NOT_LAUNCHED');
   await page.locator('#refresh').click();await page.locator('#open-desk').waitFor();
   const selectedDesk=new URL(await page.locator('#open-desk').getAttribute('href')),actualDesk=new URL(status.desk.url);
   need(selectedDesk.href===actualDesk.href&&actualDesk.hostname==='127.0.0.1'&&actualDesk.protocol==='http:','INTAKE_RECEIVING_LAUNCHED_DESK_CHANGED');
   const deskPage=await context.newPage();await deskPage.goto(actualDesk.href,{waitUntil:'domcontentloaded'});
   await deskPage.waitForFunction(expected=>location.hash===''&&document.getElementById('customer').textContent===expected,input.scope.customerLabel,{timeout:input.jobTimeoutMs});
   const deskStatus=await apiFor(actualDesk.href)('/api/status');
   need(deskStatus.selection.operationId===input.scope.operationId&&deskStatus.selection.dossierId===input.dossierId&&
    deskStatus.selection.workspaceId===workspaceId&&deskStatus.initialized,'INTAKE_RECEIVING_DESK_BINDING_CHANGED');
   const files=await downloads(page,publicRoot,attempt,status.files??[]);
   await page.screenshot({path:join(attempt,'intake-prepared.png'),fullPage:true});
   firstUse={schema:HANDOVER_INTAKE_RECEIVING_SCHEMA,state:'PREPARED',workspaceId,dossierId:input.dossierId,
    deliveryId:input.deliveryId,baseline,preview:status.preview,prepared:status.prepared,files,
    browser:{nativeBaselineVerified:true,dossierDeliveryChosenThisAttempt:!baselineAlreadyRetained,
     scopeAlreadyFrozen,scopeSavedReloadedThisAttempt:!scopeAlreadyFrozen,fullPreviewInspected:true,
     originalDeskLaunched:true,completeRetainedDownloads:true}};
  }catch(error){
   await save(attempt,'INCOMPLETE.json',{schema:HANDOVER_INTAKE_RECEIVING_SCHEMA,state:'INCOMPLETE',code:safeCode(error),
    instruction:'Keep this original intake directory and scope. Reenter the same receiving course; do not replace a frozen selection.'});throw error;
  }finally{
   const errors=[];try{if(browser)await browser.close();}catch(error){errors.push(error);}
   try{if(intake)await intake.close();else await client.close();}catch(error){errors.push(error);}
   if(errors.length){await save(attempt,'CLOSURE_INCOMPLETE.json',{state:'INCOMPLETE',codes:errors.map(safeCode)});
    throw new AggregateError(errors,'INTAKE_RECEIVING_CLOSURE_INCOMPLETE');}
  }
  // The initial listener, its actual launched desk and original client are closed before delegation.
  prepared=await readCustomerHandoverIntakePreparation(intakeDirectory);
  const selection=await readCustomerJson(prepared.selectionFile,JSON_LIMIT);
  need(selection.sha256===prepared.selectionSha256&&selection.sha256===firstUse.prepared.selectionSha256&&
   selection.value.operation_id===input.scope.operationId&&selection.value.dossier_id===input.dossierId,'INTAKE_RECEIVING_NATIVE_PREPARATION_CHANGED');
  await retainCustomerBytes(publicRoot,'SELECTION.original.json',selection.body);await snapshot(publicRoot,'first-use',firstUse);
  const returned=await runCustomerHandoverDeskReceiving({
   schema:HANDOVER_DESK_RECEIVING_SCHEMA,connectionFile:input.connectionFile,
   ...(input.workspaceDirectory?{workspaceDirectory:input.workspaceDirectory}:{}),
   directory:join(root,'returns'),deskDirectory:prepared.directory,selectionFile:prepared.selectionFile,
   selectionSha256:prepared.selectionSha256,rounds:input.rounds,playwrightModule:input.playwrightModule,
   chromiumExecutable:input.chromiumExecutable,python:input.python,node:input.node,jobTimeoutMs:input.jobTimeoutMs});
  const result={schema:HANDOVER_INTAKE_RECEIVING_SCHEMA,state:returned.state,operationId:input.scope.operationId,
   workspaceId:firstUse.workspaceId,dossierId:input.dossierId,baseline:firstUse.baseline,selectionSha256:prepared.selectionSha256,
   firstUse,returns:returned};
  await snapshot(publicRoot,'results',result);return result;
 });
}
export const HANDOVER_INTAKE_RECEIVING_USAGE='node handover-intake-receiving.mjs --input ABSOLUTE_JSON --sha256 SHA256\n'+
 'Select actual native dossier/delivery IDs, explicit scope, original engine and existing Playwright/Chromium.\n'+
 'The course retains the actual baseline, prepares it through the intake browser and delegates the same original desk directory.\n'+
 'SOURCE_REQUIRED or REVIEW_REQUIRED preserves that course for actual source/review input on reentry.\n';
export async function runCustomerHandoverIntakeReceivingCli(argv=process.argv.slice(2)){
 if(!argv.length||argv.includes('--help')){process.stdout.write(HANDOVER_INTAKE_RECEIVING_USAGE);return;}
 const {values}=parseArgs({args:argv,options:{input:{type:'string'},sha256:{type:'string'}},strict:true,allowPositionals:false});
 absolute(values.input);checksum(values.sha256);
 const raw=await readResearchHostFile(values.input,JSON_LIMIT,{sha256:values.sha256});
 need(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),'INTAKE_RECEIVING_INPUT_UTF8');
 const result=await runCustomerHandoverIntakeReceiving(JSON.parse(raw.toString('utf8')));
 process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 runCustomerHandoverIntakeReceivingCli().catch(error=>{process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:safeCode(error)})+'\n');process.exitCode=1;});
