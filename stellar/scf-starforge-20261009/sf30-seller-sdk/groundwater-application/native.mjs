// SPDX-License-Identifier: MIT
// One existing scientific study, one supplied complete backup and the native Applications lifecycle.
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {openRuntimeWorkspace} from '../../distribution/runtime-workspace/model.mjs';
import {operationRunning} from '../../distribution/runtime-workspace/storage.mjs';
import {inspectRuntimeInstall} from '../../distribution/runtime-install.mjs';
import {put,exists,recoverPendingJSON,ident} from '../groundwater-report/common.mjs';
import {
 APP,SCHEMA,UUID,HASH,need,fields,text,absolute,directory,readJSON,hash,same,
 completeSelection,inspectSelection,inspectScientificWorkspace,coreFor,fileIdentity,disjoint,workspaceKey
} from './source.mjs';
import {authenticatedApplicationState} from './application-provider.mjs';
import {inspectBackup,inspectReceiving} from './receiving.mjs';

export const NATIVE=SCHEMA+'.native-receiving';
const idFor=text=>{const value=hash(text);return value.slice(0,8)+'-'+value.slice(8,12)+'-4'+value.slice(13,16)+'-a'+value.slice(17,20)+'-'+value.slice(20,32);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,500));
const readValue=async(path,missing=false)=>missing&&!await exists(path)?null:(await readJSON(path)).value;
function validate(input){
 fields(input,['schema','operationId','actor','reason','runtimeWorkspaceDirectory','runtimeDirectory','expectedSourceCommit',
  'workspaceDirectory','expectedWorkspaceId','receivingDirectory','python','archive','originalOperationIds',
  'outputDirectory','browser','label','port','waitMilliseconds','allowClosedLaunchRetry'],'original scientific application receiving');
 need(input.schema===NATIVE,'GROUNDWATER_APPLICATION_NATIVE_INPUT','Select the complete original receiving input.');
 ident(input.operationId);text(input.actor,'native operator',200);text(input.reason,'receiving purpose',4000);
 for(const name of ['runtimeWorkspaceDirectory','runtimeDirectory','workspaceDirectory','receivingDirectory','python','outputDirectory'])absolute(input[name],name);
 need(/^[a-f0-9]{40}$/.test(input.expectedSourceCommit??'')&&typeof input.expectedWorkspaceId==='string',
  'GROUNDWATER_APPLICATION_NATIVE_SOURCE','Select the existing runtime commit and original workspace identity.');
 fields(input.archive,['path','bytes','sha256'],'complete original backup');absolute(input.archive.path);
 need(Number.isSafeInteger(input.archive.bytes)&&input.archive.bytes>0&&input.archive.bytes<=2*1024**3&&HASH.test(input.archive.sha256??''),
  'GROUNDWATER_APPLICATION_NATIVE_BACKUP','Retain the complete original backup bytes and digest.');
 need(Array.isArray(input.originalOperationIds)&&input.originalOperationIds.length>0&&input.originalOperationIds.length<=200&&
  new Set(input.originalOperationIds).size===input.originalOperationIds.length,'GROUNDWATER_APPLICATION_NATIVE_ORIGINALS','Select the original committed scientific operations to verify.');
 for(const id of input.originalOperationIds)ident(id);
 fields(input.browser,['package','executable'],'existing original browser');absolute(input.browser.package);absolute(input.browser.executable);
 need(input.port===undefined||Number.isSafeInteger(input.port)&&input.port>=0&&input.port<=65535,'GROUNDWATER_APPLICATION_NATIVE_PORT','Choose the original local port.');
 need(input.waitMilliseconds===undefined||Number.isSafeInteger(input.waitMilliseconds)&&input.waitMilliseconds>=10000&&input.waitMilliseconds<=600000,
  'GROUNDWATER_APPLICATION_NATIVE_WAIT','Use a bounded native wait of 10–600 seconds.');
 need(input.allowClosedLaunchRetry===undefined||typeof input.allowClosedLaunchRetry==='boolean','GROUNDWATER_APPLICATION_NATIVE_RETRY','Select the explicit closed-launch recovery choice.');
 for(const name of ['workspaceDirectory','receivingDirectory','runtimeWorkspaceDirectory','runtimeDirectory'])
  need(disjoint(input.outputDirectory,input[name]),'GROUNDWATER_APPLICATION_NATIVE_DIRECTORY','Keep the caller record outside selected workspaces, runtime and receiving storage.');
}
export async function runApplicationReceiving(input,{signal,progress=()=>{}}={}){
 validate(input);
 const runtime=await inspectRuntimeInstall({directory:input.runtimeDirectory,load:true,source:true,python:input.python});
 need(runtime.ready&&runtime.status==='READY'&&runtime.sourceCommit===input.expectedSourceCommit,
  'GROUNDWATER_APPLICATION_NATIVE_RUNTIME','Select the original complete READY runtime with this application installed.');
 const selected=await completeSelection({workspaceDirectory:input.workspaceDirectory,receivingDirectory:input.receivingDirectory,
  sourceRoot:runtime.sourceRoot,python:input.python,actor:input.actor,port:input.port??0},{probe:true});
 const identity=await inspectSelection(selected);
 need(identity.workspace.workspace.id===input.expectedWorkspaceId,'GROUNDWATER_APPLICATION_NATIVE_WORKSPACE','Use the original scientific workspace.');
 await fileIdentity(input.archive.path,{expected:input.archive});
 await directory(input.outputDirectory,{create:true});
 const inputPath=join(input.outputDirectory,'native-input.json');
 await put(inputPath,{schema:NATIVE,body:input,sourceSha256:selected.expectedSource,
  workspaceIdentity:selected.expectedWorkspace,receivingIdentity:selected.expectedReceiving,pythonIdentity:selected.expectedPython});
 const path=name=>join(input.outputDirectory,name+'.json');
 async function frozen(name,producer){
  const target=path(name),valid=record=>record?.schema===NATIVE+'.phase'&&record.operationId===input.operationId&&
   record.inputSha256===hash(input)&&record.phase===name&&Object.hasOwn(record,'value');
  const old=await readValue(target,true)||await recoverPendingJSON(target,valid);
  if(old){need(valid(old),'GROUNDWATER_APPLICATION_NATIVE_PHASE','The retained phase belongs to another original input.');return old.value;}
  const value=await producer();await put(target,{schema:NATIVE+'.phase',operationId:input.operationId,inputSha256:hash(input),phase:name,value});return value;
 }
 const core=coreFor(selected);
 const originals=await frozen('selected-original-operations',async()=>{
  const rows=[];
  for(const id of input.originalOperationIds){
   const value=await core.operation(id,{signal});
   need(value.state==='committed','GROUNDWATER_APPLICATION_NATIVE_ORIGINALS','The selected scientific operation is not committed.');
   rows.push({id,requestSha256:value.request_sha256,resultSha256:hash(value.result),action:value.action});
  }
  return rows;
 });
 need(same(originals.map(row=>row.id),input.originalOperationIds),'GROUNDWATER_APPLICATION_NATIVE_ORIGINALS','The original operation selection changed.');
 async function verifyOriginals(workspace){
  const reader=coreFor(selected,workspace),values=[];
  for(const original of originals){
   const value=await reader.operation(original.id,{signal});
   need(value.state==='committed'&&value.request_sha256===original.requestSha256&&hash(value.result)===original.resultSha256&&value.action===original.action,
    'GROUNDWATER_APPLICATION_NATIVE_ORIGINALS','An original scientific request or committed result changed.');
   values.push({id:original.id,requestSha256:value.request_sha256,resultSha256:hash(value.result)});
  }
  return values;
 }
 await verifyOriginals(input.workspaceDirectory);
 const preview=await frozen('original-backup-preview',()=>inspectBackup(selected,input.archive.path));
 need(preview.archive.bytes===input.archive.bytes&&preview.archive.sha256===input.archive.sha256&&preview.workspaceId===input.expectedWorkspaceId,
  'GROUNDWATER_APPLICATION_NATIVE_BACKUP','The supplied backup belongs to another original study or file.');
 need(same(await inspectBackup(selected,input.archive.path),preview),'GROUNDWATER_APPLICATION_NATIVE_BACKUP','The complete original backup changed.');
 const model=await openRuntimeWorkspace({directory:input.runtimeWorkspaceDirectory});
 const waitMilliseconds=input.waitMilliseconds??120000;
 const ownedRuns=new Map(),adoptions=new Set();
 let browser,failure,completed;
 async function current(applicationId){
  const state=await model.applicationsState({historyLimit:100});
  const app=state.applications.find(row=>row.id===applicationId);
  need(app?.kind==='groundwater-scientific-workspace'&&app.providerId==='groundwater-application',
   'GROUNDWATER_APPLICATION_NATIVE_APPLICATION','The retained managed application is unavailable or belongs to another provider.');
  return app;
 }
 async function findRun(applicationId,operationId){
  let cursor=null;const seen=new Set();
  do{
   const page=await model.applicationsHistory({applicationId,limit:100,...(cursor?{cursor}:{})});
   const found=page.runs.find(row=>row.id===operationId);if(found)return found;
   cursor=page.nextCursor;
   need(!cursor||!seen.has(cursor),'GROUNDWATER_APPLICATION_NATIVE_HISTORY','The original run history cursor repeated.');
   if(cursor)seen.add(cursor);
  }while(cursor);
  return null;
 }
 async function wait(check,label,{ignoreAbort=false}={}){
  const end=Date.now()+waitMilliseconds;
  while(true){
   if(!ignoreAbort&&signal?.aborted)throw signal.reason??new Error('The original receiving was stopped.');
   const value=await check();if(value)return value;
   need(Date.now()<end,'GROUNDWATER_APPLICATION_NATIVE_PENDING','The original '+label+' remains retained. Keep this producing lifetime and its original operation available.');
   await sleep();
  }
 }
 async function stop(applicationId,operationId){
  const run=await findRun(applicationId,operationId);
  if(!run)return {operationId,notDispatched:true};
  if(run.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(run.phase))
   await model.applicationsStop({applicationId,operationId});
  return wait(async()=>{
   const selected=await findRun(applicationId,operationId);
   const worker=await operationRunning(join(input.runtimeWorkspaceDirectory,'operations',operationId,'worker.lock'));
   if(!selected||selected.active||worker||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(selected.phase))return null;
   need(['SUCCEEDED','CANCELLED'].includes(selected.phase),'GROUNDWATER_APPLICATION_NATIVE_DRAIN_FAILED','The original managed application ended with an unsuccessful native result.');
   return {operationId,phase:selected.phase,active:false,result:selected.result??null};
  },'managed stop and drain',{ignoreAbort:true});
 }
 async function verifyCompleted(value){
  need(value.schema===NATIVE&&value.state==='COMPLETE'&&value.operationId===input.operationId&&
   value.inputSha256===hash(input)&&value.sourceSha256===selected.expectedSource,
   'GROUNDWATER_APPLICATION_NATIVE_COMPLETION','The original complete receiving belongs to another selected source or input.');
  const request=await readValue(path('browser-receiving-request'));
  need(request.operationId===value.receivingOperationId,'GROUNDWATER_APPLICATION_NATIVE_COMPLETION','The original receiving ID changed.');
  const received=await inspectReceiving(selected,request.operationId);
  need(received.result&&received.result.requestSha256===value.receivingRequestSha256,
   'GROUNDWATER_APPLICATION_NATIVE_COMPLETION','The original receiving result changed.');
  await verifyOriginals(input.workspaceDirectory);await verifyOriginals(received.result.native.workspace);
  for(const item of value.files)await fileIdentity(item.path,{expected:item});
  for(const leg of value.legs){
   const run=await findRun(leg.applicationId,leg.operationId);
   need(run&&!run.active&&!await operationRunning(join(input.runtimeWorkspaceDirectory,'operations',leg.operationId,'worker.lock')),
    'GROUNDWATER_APPLICATION_NATIVE_COMPLETION','An original completed managed run is active or unavailable.');
  }
  return {...value,currentVerification:{workspace:received.current.workspace,originalOperations:originals.map(row=>row.id),automaticRun:false}};
 }
 try{
  const previous=await readValue(path('native-result'),true)||await recoverPendingJSON(path('native-result'),value=>value.schema===NATIVE&&value.operationId===input.operationId);
  if(previous){completed=await verifyCompleted(previous);}
  else{
   const attachment=await frozen('runtime-attachment',()=>model.attach({directory:input.runtimeDirectory,label:input.label??'Groundwater Scientific Workspace'}));
   const settings={workspaceDirectory:input.workspaceDirectory,receivingDirectory:input.receivingDirectory,
    python:input.python,actor:input.actor,port:input.port??0};
   const review=await frozen('application-review',()=>model.applicationsReview({runtimeId:attachment.runtimeId,
    providerId:'groundwater-application',kind:'groundwater-scientific-workspace',
    label:input.label??'Groundwater Scientific Workspace',settings}));
   if(review.adoption?.requestId)adoptions.add(review.adoption.requestId);
   const saveRequest={requestId:idFor(input.operationId+':application-save'),reviewId:review.id};
   await put(path('application-save-request'),saveRequest);
   const saved=await frozen('application-saved',()=>model.applicationsSave(saveRequest));
   need(!saved.superseded,'GROUNDWATER_APPLICATION_NATIVE_APPLICATION','The original saved application has a later user selection; it was preserved.');
   const applicationId=saved.applicationId;
   let app=await current(applicationId);
   need(app.runtimeId===attachment.runtimeId&&same(app.settings,settings),
    'GROUNDWATER_APPLICATION_NATIVE_APPLICATION','The original saved application selected different inputs.');
   if(!app.release){await model.applicationsConnect({applicationId});app=await wait(async()=>{
    const value=await current(applicationId);return value.release?value:null;
   },'original managed source adoption');}
   const require=createRequire(import.meta.url),playwright=require(input.browser.package);
   browser=await playwright.chromium.launch({headless:true,executablePath:input.browser.executable,args:['--no-sandbox']});
   async function browserReceiving(url,legName){
    const context=await browser.newContext({viewport:{width:1450,height:1050}});
    const page=await context.newPage();
    let request=await readValue(path('browser-receiving-request'),true),routeError;
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.route('**/api/**',async route=>{
     const native=route.request();
     if(native.method()!=='POST')return route.continue();
     const parsed=new URL(native.url());
     try{
      need(parsed.origin===new URL(url).origin,'GROUNDWATER_APPLICATION_NATIVE_BROWSER','An original action left its selected host.');
      need(!/^\/w\/.*\/api\/action$/.test(parsed.pathname),
       'GROUNDWATER_APPLICATION_NATIVE_MODEL_ACTION','This receiving continuation never dispatches a scientific action.');
      const body=JSON.parse(native.postData()??'null');
      if(parsed.pathname==='/api/application/receive-backup'){
       need(body.actor===input.actor&&body.reason===input.reason&&same(body.preview,preview)&&UUID.test(body.operationId??''),
        'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The visible receiving selected another complete backup or operator.');
       if(request)need(same(body,request),'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The browser tried to replace its original receiving request.');
       await put(path('browser-receiving-request'),body);request=body;
      }else if(parsed.pathname==='/api/application/inspect-backup'){
       need(body.path===input.archive.path,'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The browser selected another incoming archive.');
      }else if(['/api/application/continue-receiving','/api/application/open-received'].includes(parsed.pathname)){
       need(request&&same(body,{operationId:request.operationId}),'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The browser selected another original receiving.');
      }else need(false,'GROUNDWATER_APPLICATION_NATIVE_BROWSER','An unselected application write was stopped before dispatch.');
      return route.continue();
     }catch(error){routeError=error;return route.abort('aborted');}
    });
    try{
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:waitMilliseconds});
     await page.locator('#workspace-identity').filter({hasText:input.expectedWorkspaceId}).waitFor({timeout:waitMilliseconds});
     await page.locator('[data-nav="history"]').click();
     await page.locator('#page-title').filter({hasText:'Original operations'}).waitFor({timeout:waitMilliseconds});
     const before=await page.locator('#content').innerText();
     for(const id of input.originalOperationIds)need(before.includes(id),'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The original scientific operation is not visible.');
     await page.locator('[data-complete-receiving]').click();
     await page.locator('#original-identity').filter({hasText:input.expectedWorkspaceId}).waitFor({timeout:waitMilliseconds});
     if(!request){
      await page.locator('#archive-path').fill(input.archive.path);
      await page.locator('#inspect-form button[type="submit"]').click();
      await page.locator('#preview-panel').waitFor({state:'visible',timeout:waitMilliseconds});
      const shown=JSON.parse(await page.locator('#preview-json').innerText());
      need(same(shown,preview),'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The original complete backup preview differs.');
      await page.locator('#actor').fill(input.actor);await page.locator('#reason').fill(input.reason);
      await page.locator('#receive-form button[type="submit"]').click();
      await page.locator('#detail-status').filter({hasText:'have been verified'}).waitFor({timeout:waitMilliseconds});
     }else{
      await page.locator('[data-open="'+request.operationId+'"]').click();
      await page.locator('#detail-panel').waitFor({state:'visible',timeout:waitMilliseconds});
      if(await page.locator('[data-continue="'+request.operationId+'"]').count()){
       await page.locator('[data-continue="'+request.operationId+'"]').click();
       await page.locator('#detail-status').filter({hasText:'have been verified'}).waitFor({timeout:waitMilliseconds});
      }
     }
     if(routeError)throw routeError;
     need(request,'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The original visible receiving request is unavailable.');
     const received=await inspectReceiving(selected,request.operationId);
     need(received.result,'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The native complete receiving is not committed.');
     await verifyOriginals(received.result.native.workspace);
     await page.locator('[data-open-received="'+request.operationId+'"]').click();
     await page.locator('#workspace-identity').filter({hasText:input.expectedWorkspaceId}).waitFor({timeout:waitMilliseconds});
     const receivedUrl=new URL(page.url()),originalUrl=new URL(url),key=workspaceKey(received.current.identity);
     need(receivedUrl.pathname==='/w/'+key+'/'&&receivedUrl.pathname!==originalUrl.pathname,
      'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The independent working copy did not receive a distinct original browser namespace.');
     await page.locator('[data-nav="history"]').click();
     await page.locator('#page-title').filter({hasText:'Original operations'}).waitFor({timeout:waitMilliseconds});
     const history=await page.locator('#content').innerText();
     for(const id of input.originalOperationIds)need(history.includes(id),'GROUNDWATER_APPLICATION_NATIVE_BROWSER','The original operation is not visible after independent receiving.');
     const namespaces=await page.evaluate(()=>{
      const config=window.GROUNDWATER_CONFIG;return {apiBase:config.apiBase,origin:location.origin};
     });
     need(namespaces.apiBase==='/w/'+key+'/api','GROUNDWATER_APPLICATION_NATIVE_BROWSER','The received browser API has another context binding.');
     need(pageErrors.length===0,'GROUNDWATER_APPLICATION_NATIVE_PAGE_ERROR','The original browser reported errors: '+pageErrors.join('; '));
     return {leg:legName,workspaceId:input.expectedWorkspaceId,receivingOperationId:request.operationId,
      receivedDirectory:received.result.native.workspace,receivedKey:key,originalKey:workspaceKey(identity.workspace),
      originalOperations:originals.map(row=>row.id),nativeRequestPreserved:true,visibleHistory:true,
      completeBackupVerified:true,distinctBrowserNamespace:true,pageErrors,automaticRun:false};
    }finally{await context.close();}
   }
   async function operate(name){
    const observed=await readValue(path(name+'-observed'),true);
    if(observed){
     ownedRuns.set(observed.operationId,{applicationId,operationId:observed.operationId});
     const stopped=await stop(applicationId,observed.operationId);
     await frozen(name+'-stopped',async()=>stopped);
     const received=await inspectReceiving(selected,observed.receivingOperationId);
     need(received.result,'GROUNDWATER_APPLICATION_NATIVE_COMPLETION','The original received workspace is unavailable.');
     return observed;
    }
    let attempt=1,request;
    while(true){
     const key=name+'-attempt-'+String(attempt).padStart(4,'0');
     request=await readValue(path(key+'-request'),true);
     if(!request){
      const reviewed=await frozen(key+'-review',()=>model.applicationsStartReview({applicationId}));
      request={applicationId,requestId:idFor(input.operationId+':'+key),reviewId:reviewed.id};
      await put(path(key+'-request'),request);break;
     }
     const run=await findRun(applicationId,request.requestId);
     if(!run||run.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(run.phase))break;
     need(input.allowClosedLaunchRetry===true&&attempt<32,'GROUNDWATER_APPLICATION_NATIVE_CLOSED_LAUNCH',
      'The original managed run ended before observation. Preserve it; an explicitly authorized closed-launch continuation may select the next numbered managed run.');
     await frozen(key+'-closed',async()=>({operationId:run.id,phase:run.phase,result:run.result??null}));
     attempt++;
    }
    const operationId=request.requestId;
    ownedRuns.set(operationId,{applicationId,operationId});
    await model.applicationsStart(request);
    let run=await findRun(applicationId,operationId);
    if(run&&!run.active&&['PENDING','QUEUED','INTERRUPTED'].includes(run.phase))
     await model.applicationsRecover({applicationId,operationId});
    run=await wait(async()=>{
     const value=await findRun(applicationId,operationId);
     need(!value||value.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(value.phase),
      'GROUNDWATER_APPLICATION_NATIVE_CLOSED_LAUNCH','The original managed run ended before its complete browser observation.');
     return value?.active&&value.privateUrl?value:null;
    },'authenticated scientific listener');
    const state=await authenticatedApplicationState(run.privateUrl,{signal});
    need(state.original.sha256===selected.expectedWorkspace&&state.sourceSha256===selected.expectedSource,
     'GROUNDWATER_APPLICATION_NATIVE_LISTENER','The actual listener selected another original workspace or source.');
    const browserResult=await browserReceiving(run.privateUrl,name);
    const value={applicationId,operationId,attempt,workspaceId:input.expectedWorkspaceId,
     receivingOperationId:browserResult.receivingOperationId,browser:browserResult,sourceSha256:selected.expectedSource};
    await put(path(name+'-observed'),value);
    await frozen(name+'-stopped',()=>stop(applicationId,operationId));
    await progress({phase:name+'-complete',applicationId,operationId,receivingOperationId:browserResult.receivingOperationId});
    return value;
   }
   const first=await operate('first'),reopened=await operate('reopened');
   const request=await readValue(path('browser-receiving-request')),received=await inspectReceiving(selected,request.operationId);
   await verifyOriginals(input.workspaceDirectory);await verifyOriginals(received.result.native.workspace);
   const evidence=[];
   for(const name of ['native-input','selected-original-operations','original-backup-preview','browser-receiving-request',
    'runtime-attachment','application-review','application-save-request','application-saved','first-observed','first-stopped','reopened-observed','reopened-stopped'])
    evidence.push(await fileIdentity(path(name)));
   completed={schema:NATIVE,state:'COMPLETE',operationId:input.operationId,inputSha256:hash(input),
    sourceCommit:runtime.sourceCommit,sourceSha256:selected.expectedSource,workspaceId:input.expectedWorkspaceId,
    applicationId,runtimeId:attachment.runtimeId,legs:[first,reopened],receivingOperationId:request.operationId,
    receivingRequestSha256:received.result.requestSha256,receivedWorkspace:received.result.workspace,
    originalArchive:received.result.archive,completeReceivingDirectory:join(input.receivingDirectory,'groundwater-receivings',request.operationId),
    originalOperations:originals,files:evidence,automaticModelRun:false,completedAt:new Date().toISOString()};
  }
 }catch(error){failure=error;}
 finally{
  const errors=[];
  if(browser)try{await browser.close();}catch(error){errors.push(error);}
  for(const run of ownedRuns.values())try{await stop(run.applicationId,run.operationId);}catch(error){errors.push(error);}
  for(const operationId of adoptions)try{
   await wait(async()=>{
    const row=(await model.state()).operations.find(row=>row.id===operationId);
    const held=await operationRunning(join(input.runtimeWorkspaceDirectory,'operations',operationId,'worker.lock'));
    return !held&&(!row||['SUCCEEDED','FAILED','CANCELLED'].includes(row.phase))?true:null;
   },'original source-adoption worker drain',{ignoreAbort:true});
  }catch(error){errors.push(error);}
  await model.close();
  if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Keep the original producing lifetime: selected application work has not fully drained.');
 }
 if(failure)throw failure;
 const target=path('native-result'),old=await readValue(target,true);
 if(!old)await put(target,completed);
 return completed;
}
