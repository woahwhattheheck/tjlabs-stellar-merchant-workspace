// MIT. Operate the complete original OpenFEMA working-copy flow on a received workspace.
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i+1])throw new Error('Use paired receiving options.');args[process.argv[i]]=process.argv[i+1];}
const need=key=>{if(!args[key])throw new Error(key+' is required.');return args[key];};
const outputRoot=resolve(need('--out')),application=resolve(need('--application')),workspace=resolve(need('--workspace')),workspaceId=need('--workspace-id'),csvPath=resolve(need('--customer-csv'));
let out=outputRoot;
const operation='OPENFEMA-OPERATOR-WORKING-COPIES-22B7-20261013';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const must=(condition,message)=>{if(!condition)throw new Error(message);};
await mkdir(out,{recursive:true,mode:0o700});
const completed=join(outputRoot,'working-copy-result.json');
const sourceFiles=['web/app.js','web/working-copies.js','web/working-copy-ui.js','web/index.html','web/style.css','browser-assets.json'];
const source=[];for(const path of sourceFiles){const bytes=await readFile(join(application,path));source.push({path,bytes:bytes.length,sha256:sha(bytes)});}
const customerBytes=await readFile(csvPath),customerSha256=sha(customerBytes);
try{
  const prior=JSON.parse(await readFile(completed,'utf8'));
  if(prior.status==='COMPLETE'&&prior.operation===operation&&prior.workspaceId===workspaceId&&JSON.stringify(prior.source)===JSON.stringify(source)&&prior.customerSha256===customerSha256){
    for(const file of prior.files){const bytes=await readFile(file.path);must(bytes.length===file.bytes&&sha(bytes)===file.sha256,'A prior complete receiving output changed: '+file.name);}
    console.log(JSON.stringify(prior));process.exit(0);
  }
}catch(error){if(error.code!=='ENOENT')throw error;}
const planPath=join(outputRoot,'original-receiving-plan.json');let plan;
try{plan=JSON.parse(await readFile(planPath,'utf8'));must(plan.operation===operation&&plan.workspaceId===workspaceId&&plan.workspace===workspace&&plan.customerSha256===customerSha256,'The original receiving output belongs to different source/workspace inputs.');}catch(error){if(error.code!=='ENOENT')throw error;plan={operation,workspaceId,workspace,customerSha256,createdAt:new Date().toISOString(),port:0,attempts:[]};}
const savePlan=()=>writeFile(planPath,JSON.stringify(plan,null,2));
out=join(outputRoot,'attempts',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await mkdir(out,{recursive:true,mode:0o700});
plan.attempts.push({directory:out,source,startedAt:new Date().toISOString()});await savePlan();
const {chromium}=await import(pathToFileURL(resolve(need('--playwright'))));
const {startOpenFemaWorkspace}=await import(pathToFileURL(join(application,'workspace.mjs')));
const started=await startOpenFemaWorkspace({directory:workspace,port:plan.port,expectedWorkspaceId:workspaceId});
plan.port=Number(new URL(started.origin).port);await savePlan();
const headers={Authorization:'Bearer '+started.token},native=async path=>{const response=await fetch(started.origin+path,{headers});if(!response.ok)throw new Error('Native read '+response.status);return response.json();};
let context;const result={schema:'stellar-forge.openfema-working-copy-receiving.v1',operation,workspaceId,startedAt:new Date().toISOString(),status:'RUNNING',source,customerSha256,attemptDirectory:out,originalPlan:planPath,steps:[],files:[],screenshots:[]};
async function record(name,value={}){result.steps.push({name,completedAt:new Date().toISOString(),...value});await writeFile(join(out,'working-copy-progress.json'),JSON.stringify(result,null,2));}
async function fileRecord(path,kind){const bytes=await readFile(path),record={path:resolve(path),name:path.split('/').at(-1),kind,bytes:bytes.length,sha256:sha(bytes)};result.files.push(record);return record;}
async function openBrowser(){
  context=await chromium.launchPersistentContext(join(outputRoot,'profile'),{headless:true,executablePath:resolve(need('--chromium')),viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=context.pages()[0]||await context.newPage();await page.goto(started.url,{waitUntil:'networkidle'});await page.locator('#working-copy-select').waitFor();return page;
}
async function saved(page){await page.waitForFunction(()=>document.querySelector('#copy-status')?.textContent==='Saved in this browser');}
async function copiesOpen(page){const panel=page.locator('#working-copy-panel');if(!(await panel.evaluate(n=>n.open)))await panel.locator('summary').first().click();}
async function copyCommand(page,name){await copiesOpen(page);await page.locator('[data-copy-command="'+name+'"]').click();}
async function downloadCopy(page,name){
  await copiesOpen(page);const next=page.waitForEvent('download');await page.locator('[data-copy-command="export"]').click();const item=await next,path=join(out,name);await item.saveAs(path);await fileRecord(path,'complete-working-copy');
  const value=JSON.parse(await readFile(path,'utf8'));
  must(value.schema==='stellar-forge.openfema-working-copy-export.v1'&&value.workspaceId===workspaceId,'The full copy is not bound to the original workspace.');
  for(const file of value.files){const bytes=Buffer.from(file.base64,'base64');must(bytes.length===file.reference.bytes&&sha(bytes)===file.reference.sha256,'A complete original file differs in the export.');}
  return {path,value};
}
async function screenshot(page,name){
  const path=join(out,name);await page.screenshot({path,fullPage:true});result.screenshots.push(await fileRecord(path,'actual-rendered-screen'));
}
async function rootRecord(page){
  return page.evaluate(workspaceId=>new Promise((resolve,reject)=>{const req=indexedDB.open('openfema-operator-working-copies',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('workspaces','readonly'),r=tx.objectStore('workspaces').get(workspaceId);r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};}),workspaceId);
}
try{
  let page=await openBrowser(),view=await native('/api/view');
  must(view.workspaceId===workspaceId&&view.editions.length>0,'Receive the original completed source workspace first.');
  const selected=view.versions.find(v=>v.id===view.selectedVersionId);
  must(selected,'Select the original complete portfolio.');
  const rows=await native('/api/rows?'+new URLSearchParams({versionId:selected.id,table:'projects',offset:'0',limit:'100'}));
  must(rows.total===195,'The original receiving expects the actual complete 195-project portfolio.');
  await record('original_complete_portfolio',{versionId:selected.id,projectRows:rows.total,sourceEdition:selected.editionId});
  await page.locator('[data-command="section"][data-section="integration"]').click();
  const mapping=page.locator('#integration-mapping-json'),originalText=await mapping.inputValue(),draftText=originalText+'\n\n';
  const details=page.locator('#integration-mapping-editor');await details.evaluate(n=>n.open=true);await mapping.fill(draftText);await saved(page);
  const reviewer=page.locator('#integration-mapping-reviewer');if(await reviewer.count()){await reviewer.fill('Original receiving operator');await page.locator('#integration-mapping-note').fill('Complete destination mapping retained as an unfinished operator review.');await saved(page);}
  const receivingSelect=page.locator('#integration-reconcile-form [name="deliveryId"]');
  const deliveryId=await receivingSelect.inputValue()||(await receivingSelect.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean))).at(-1);
  must(deliveryId,'The original native exchange has no complete project delivery.');await receivingSelect.selectOption(deliveryId);
  await page.locator('#integration-customer-file').setInputFiles(csvPath);await saved(page);
  await page.waitForFunction(()=>document.querySelector('#integration-customer-file')?.nextElementSibling?.textContent.includes('Retained complete original'));
  await copiesOpen(page);await page.locator('#working-copy-name').fill('Original programme exchange');await page.locator('[data-copy-command="rename"]').click();await saved(page);
  const baseline=await downloadCopy(page,'OpenFEMA_Original_Programme_Working_Copy.json'),csv=await readFile(csvPath),csvRef=Object.values(baseline.value.copy.snapshot.files).find(f=>f.sha256===sha(csv));
  must(csvRef&&csvRef.bytes===csv.length,'The complete original customer CSV was not retained byte-for-byte.');
  await screenshot(page,'01-populated-desktop.png');
  await record('complete_fields_and_original_file',{copyId:baseline.value.copy.id,customerFileSha256:sha(csv),customerFileBytes:csv.length,mappingCharacters:draftText.length});
  await context.close();context=null;page=await openBrowser();
  await page.locator('[data-command="section"][data-section="integration"]').click();await page.locator('#integration-mapping-editor').evaluate(n=>n.open=true);
  must(await page.locator('#integration-mapping-json').inputValue()===draftText,'Cold reopen lost the exact unfinished mapping text.');
  await receivingSelectFallback(page,deliveryId);
  const reopened=await downloadCopy(page,'OpenFEMA_Cold_Reopened_Working_Copy.json');
  must(reopened.value.files.some(f=>f.reference.sha256===sha(csv)),'Cold reopen lost original customer bytes.');
  await record('closed_browser_reopen',{copyId:reopened.value.copy.id});
  await copyCommand(page,'duplicate');await saved(page);
  let duplicate=await rootRecord(page);const duplicateId=duplicate.activeId;must(duplicateId!==baseline.value.copy.id,'Duplicate overwrote the original copy.');
  // A complete native export is useful work; lose only its browser response, then resume its same operation.
  await page.locator('[data-command="section"][data-section="handover"]').click();
  let interrupted=plan.exportRequest?.operationId||null;
  if(!interrupted){
    await page.route('**/api/action',async route=>{
      const body=route.request().postDataJSON();
      if(body.action==='workspace.export'&&!interrupted){
        interrupted=body.operationId;plan.exportRequest=body;await savePlan();await route.fetch();await route.abort('connectionreset');return;
      }
      await route.continue();
    });
    await page.locator('[data-command="workspace-export"]').click();
    await page.waitForFunction(()=>document.querySelector('#notice.error [data-command="retry"]'));
  }
  must(interrupted,'The original export request did not dispatch.');
  const originalOperation=await native('/api/operation?operationId='+encodeURIComponent(interrupted));must(originalOperation?.operationId===interrupted,'The original native operation is missing.');
  await context.close();context=null;page=await openBrowser();
  const pendingRoot=await rootRecord(page),pending=pendingRoot.requests.find(r=>r.operationId===interrupted);
  must(pending?.payloadFile,'The complete original request did not survive browser close.');
  await page.locator('[data-command="section"][data-section="handover"]').click();
  if(pending.status==='pending'){await page.locator('[data-command="resume-operation"][data-id="'+interrupted+'"]').click();}else{await page.locator('[data-command="operation"][data-id="'+interrupted+'"]').click();await page.locator('#record-dialog [data-command="resume-operation"]').click();}await saved(page);
  await page.waitForFunction(async({workspaceId,id})=>{const db=await new Promise(resolve=>{const r=indexedDB.open('openfema-operator-working-copies',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('workspaces').objectStore('workspaces').get(workspaceId);r.onsuccess=()=>{const ok=r.result.requests.find(v=>v.operationId===id)?.status==='completed';db.close();resolve(ok);};});},{workspaceId,id:interrupted});
  const completedRoot=await rootRecord(page),receipt=completedRoot.requests.find(r=>r.operationId===interrupted);
  const complete=await downloadCopy(page,'OpenFEMA_Complete_Operation_Working_Copy.json');
  must(complete.value.requests.some(r=>r.operationId===interrupted&&r.resultFile),'The completed original receipt is missing from the complete export.');
  const opAfter=await native('/api/operation?operationId='+encodeURIComponent(interrupted));
  must(opAfter.operationId===originalOperation.operationId,'Original operation changed on continuation.');
  await record('same_native_export_after_lost_response',{operationId:interrupted,originalState:originalOperation.state,continuedState:opAfter.state,firstOutcomeSha256:receipt.resultFile.sha256});
  // Import keeps one native identity and creates a separate preparation copy with complete request references.
  await copiesOpen(page);await page.locator('#working-copy-file').setInputFiles(complete.path);await page.locator('[data-copy-command="import"]').click();await saved(page);
  const imported=await downloadCopy(page,'OpenFEMA_Imported_Complete_Working_Copy.json');
  must(imported.value.copy.id!==complete.value.copy.id,'Import replaced the original working copy.');
  const receivedRequest=imported.value.requests.find(r=>r.operationId===interrupted);
  must(receivedRequest?.resultFile.sha256===receipt.resultFile.sha256,'Import/re-export lost or replaced the first successful original outcome.');
  must(imported.value.files.some(f=>f.reference.sha256===sha(csv)),'Import/re-export lost complete customer bytes.');
  await record('separate_import_and_complete_reexport',{copyId:imported.value.copy.id,originalOperation:interrupted,files:imported.value.files.length});
  // Actual concurrent windows keep both preparations rather than last-writer-wins.
  const second=await context.newPage();await second.goto(started.url,{waitUntil:'networkidle'});await second.locator('#working-copy-select').waitFor();
  await page.locator('[data-command="section"][data-section="integration"]').click();await page.locator('#integration-mapping-editor').evaluate(n=>n.open=true);await page.locator('#integration-mapping-json').fill(draftText+'\n');await saved(page);
  await second.locator('[data-command="section"][data-section="integration"]').click();
  await second.waitForFunction(()=>document.querySelector('#notice.error')?.textContent.includes('Another window'));
  await screenshot(second,'02-concurrent-window-conflict.png');
  const recovered=await downloadCopy(second,'OpenFEMA_Second_Window_Visible_Copy.json');must(recovered.value.copy.workspaceId===workspaceId,'The conflicted window could not preserve its complete visible copy.');await second.close();
  await record('concurrent_window_retained',{file:recovered.path});
  await page.setViewportSize({width:390,height:844});
  await screenshot(page,'03-narrow-operator.png');
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  must(layout.scroll<=layout.width+1,'The narrow operator page has horizontal overflow: '+JSON.stringify(layout));
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-command="section"][data-section="handover"]').click();await screenshot(page,'04-handover-desktop.png');
  result.status='COMPLETE';result.finishedAt=new Date().toISOString();result.nativeViewRevision=(await native('/api/view')).revision;
  await writeFile(completed,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){result.status='FAILED';result.error={name:error.name,message:error.message,stack:error.stack};await writeFile(join(out,'working-copy-failure.json'),JSON.stringify(result,null,2));throw error;}
finally{if(context)await context.close();await started.close();}
async function receivingSelectFallback(page,id){const selected=page.locator('#integration-reconcile-form [name="deliveryId"]');if(await selected.inputValue()!==id)await selected.selectOption(id);}
