// MIT. Selected retained Bridge evidence in the original company commissioning operation.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createBridgeIntake} from './bridge-intake.mjs';
import {need,canonical,clone,hash,jsonBytes,directory,confined,writeExact,fileDescriptor} from './files.mjs';
import {parseSourceJSON} from './source-json.mjs';

const OPERATION='BLOCCPAY-PAYROLL-RECONCILIATION-COMMISSIONING-6BBB-20261013';
const SCHEMA='bloccpay.bridge-commissioning-selection.v1';
const fingerprint=value=>hash(Buffer.from(canonical(value)));
function fields(value,allowed,code){
 need(value&&typeof value==='object'&&!Array.isArray(value),code);
 need(Object.keys(value).every(key=>allowed.includes(key)),code);
}
function id(value){need(typeof value==='string'&&value.length>0&&value.length<200&&!/[\u0000-\u001f]/.test(value),'BRIDGE_COMMISSIONING_ID_REQUIRED');return value;}
function selected(value){
 fields(value,['schema','reviews','existingRequestIds','browser'],'BRIDGE_COMMISSIONING_SELECTION_REQUIRED');
 need(value.schema===SCHEMA&&Array.isArray(value.reviews??[])&&Array.isArray(value.existingRequestIds??[])&&typeof value.browser==='boolean',
  'BRIDGE_COMMISSIONING_SELECTION_REQUIRED');
 const result=clone({schema:SCHEMA,reviews:value.reviews??[],existingRequestIds:value.existingRequestIds??[],browser:value.browser});
 need(result.reviews.length<=1000&&result.existingRequestIds.length<=10000,'BRIDGE_COMMISSIONING_SELECTION_TOO_LARGE');
 const seen=new Set(),add=value=>{id(value);need(!seen.has(value),'BRIDGE_COMMISSIONING_DUPLICATE_REQUEST');seen.add(value);};
 for(const review of result.reviews){
  fields(review,['requestId','selection','actor','note','preparedAt','decisions'],'BRIDGE_COMMISSIONING_REVIEW_REQUIRED');
  add(review.requestId);need(review.selection&&typeof review.actor==='string'&&typeof review.note==='string'&&typeof review.preparedAt==='string',
   'BRIDGE_COMMISSIONING_REVIEW_REQUIRED');
  need(Array.isArray(review.decisions??[])&&(review.decisions??[]).length<=1000,'BRIDGE_COMMISSIONING_DECISIONS_REQUIRED');
  for(const decision of review.decisions??[]){
   fields(decision,['requestId','incidentIds','action','actor','note','evidenceFileIds','supersedes','preparedAt'],'BRIDGE_COMMISSIONING_DECISION_REQUIRED');
   add(decision.requestId);
   need(Array.isArray(decision.incidentIds)&&decision.incidentIds.length&&typeof decision.action==='string'&&
    typeof decision.actor==='string'&&typeof decision.note==='string'&&typeof decision.preparedAt==='string','BRIDGE_COMMISSIONING_DECISION_REQUIRED');
  }
 }
 for(const requestId of result.existingRequestIds)add(requestId);
 need(seen.size>0,'BRIDGE_COMMISSIONING_EMPTY_SELECTION');
 return result;
}
async function readOptional(filename){
 let handle;
 try{
  handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  const stat=await handle.stat();need(stat.isFile()&&stat.size<=48*1024*1024,'BRIDGE_COMMISSIONING_FILE_REQUIRED');
  return parseSourceJSON(await handle.readFile(),{maxBytes:48*1024*1024}).value;
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
 finally{if(handle)await handle.close();}
}
function recordIdentity(row){
 return {requestId:row.request.id,requestSha256:fingerprint(row.request),documentSha256:row.documentSha256,
  schema:row.document.schema,originalWorkspaceId:row.document.workspace.id,
  file:{id:row.file.id,bytes:row.file.bytes,sha256:row.file.sha256},
  selectionSha256:row.document.selectionSha256??row.document.review.selectionSha256,
  reviewRequestId:row.document.review?.requestId??null};
}
// Construction acquires no asynchronous resource. The caller registers this exact
// owner before produce/receive/browser work, and retains it if close rejects.
export function createBridgeCommissioning({workspace,operationDirectory,selection,signal}){
 need(workspace&&typeof workspace.describe==='function','ORIGINAL_BLOCCPAY_WORKSPACE_REQUIRED');
 need(path.isAbsolute(operationDirectory),'ABSOLUTE_OPERATION_DIRECTORY_REQUIRED');
 const frozen=selected(selection),selectionSha256=fingerprint(frozen);
 const root=path.join(operationDirectory,'bridge-intake',selectionSha256);
 const tasks=new Set(),browserOwners=new Set(),downloads=new Map(),interrupters=new Set();
 let intake=null,closing=false,closed=false,closePromise=null,interrupted=false;
 const interruption=()=>signal?.reason??Object.assign(new Error('The original Bridge operation was interrupted.'),{code:'BRIDGE_COMMISSIONING_INTERRUPTED'});
 const stop=()=>{if(interrupted)throw interruption();signal?.throwIfAborted();};
 function cancelDownload(row){
  if(row.cancelled)return Promise.resolve();
  if(row.cancelPromise)return row.cancelPromise;
  const pending=Promise.resolve().then(()=>row.download.cancel()).then(()=>{row.cancelled=true;});
  row.cancelPromise=pending;
  pending.catch(()=>{if(row.cancelPromise===pending)row.cancelPromise=null;});
  return pending;
 }
 function interrupt(){
  interrupted=true;
  for(const reject of interrupters)reject(interruption());
  for(const row of downloads.values())cancelDownload(row).catch(()=>{});
 }
 signal?.addEventListener('abort',interrupt);
 if(signal?.aborted)interrupt();
 function ownDownload(row,work){
  let task;try{task=Promise.resolve(work());}catch(error){task=Promise.reject(error);}
  row.pending.add(task);task.then(()=>row.pending.delete(task),()=>row.pending.delete(task));return task;
 }
 async function finishDownload(row,cancel=false){
  if(cancel||interrupted)await cancelDownload(row);
  if(row.cancelPromise)await row.cancelPromise;
  if(row.pending.size)await Promise.allSettled([...row.pending]);
  await row.download.delete();downloads.delete(row.download);row.owner.downloads.delete(row);
 }
 function track(work){
  need(!closing&&!closed,'BRIDGE_COMMISSIONING_CLOSING');
  let promise;try{promise=Promise.resolve(work());}catch(error){promise=Promise.reject(error);}
  tasks.add(promise);promise.then(()=>tasks.delete(promise),()=>tasks.delete(promise));return promise;
 }
 function service(){if(!intake)intake=createBridgeIntake({workspace});return intake;}
 async function file(relative,body){
  await directory(root);const filename=await confined(root,relative,true);
  await writeExact(filename,body);
  return fileDescriptor(filename,relative);
 }
 async function document(relative,value){return file(relative,jsonBytes(value));}
 function maybeRequest(requestId){
  try{return workspace.item('requests',requestId);}catch(error){if(error.code==='RECORD_NOT_FOUND')return null;throw error;}
 }
 async function admitted(kind,spec,reviewRequestId=null){
  stop();const key=hash(Buffer.from(spec.requestId)),relative='requests/'+key+'/admission.json';
  const filename=await confined(root,relative,true),prior=await readOptional(filename);
  const declared={kind,requestId:spec.requestId,reviewRequestId,spec:clone(spec)};
  let admission=prior;
  if(admission){
   need(admission.schema==='bloccpay.bridge-commissioning-admission.v1'&&admission.operation===OPERATION&&
    admission.selectionSha256===selectionSha256&&canonical(admission.declared)===canonical(declared),'BRIDGE_COMMISSIONING_ADMISSION_CHANGED');
   need(admission.workspaceId===workspace.describe().workspace.id,'BRIDGE_COMMISSIONING_WORKSPACE_CHANGED');
  }else{
   // An existing native ID without this operation's retained preview is not
   // guessed or re-created. Select it through existingRequestIds for inspection.
   need(!maybeRequest(spec.requestId),'BRIDGE_COMMISSIONING_ORIGINAL_ADMISSION_REQUIRED');
   const expectedRevision=workspace.describe().workspace.revision;
   const preview=kind==='review'?
    await service().previewReview({expectedRevision,selection:spec.selection,actor:spec.actor,note:spec.note,preparedAt:spec.preparedAt}):
    await service().previewDecision({expectedRevision,reviewRequestId,incidentIds:spec.incidentIds,action:spec.action,
     actor:spec.actor,note:spec.note,evidenceFileIds:spec.evidenceFileIds??[],supersedes:spec.supersedes??null,preparedAt:spec.preparedAt});
   admission={schema:'bloccpay.bridge-commissioning-admission.v1',operation:OPERATION,selectionSha256,
    workspaceId:workspace.describe().workspace.id,declared,
    save:{requestId:spec.requestId,expectedRevision,document:preview.document,expectedPreviewSha256:preview.previewSha256},
    documentSha256:preview.documentSha256};
   await document(relative,admission);
  }
  need(fingerprint(admission.save.document)===admission.save.expectedPreviewSha256&&
   hash(jsonBytes(admission.save.document))===admission.documentSha256,'BRIDGE_COMMISSIONING_PREVIEW_CHANGED');
  stop();
  // save checks the exact native prior request before any current-revision test.
  // An admitted preview is never silently rebased or assigned a replacement ID.
  const result=await service().save({...admission.save,signal});
  const retained=await service().read(spec.requestId);
  need(retained.request.status==='COMPLETE'&&retained.documentSha256===admission.documentSha256&&
   canonical(retained.document)===canonical(admission.save.document)&&canonical(result)===canonical(retained.request.result),
   'BRIDGE_COMMISSIONING_RESULT_CHANGED');
  await document('requests/'+key+'/result.json',result);
  await document('requests/'+key+'/record.json',retained);
  return retained;
 }
 async function collect(requestIds){
  const inspection=await service().inspect({requestIds});
  need(inspection.providerRequests===0&&inspection.ledgerAction==='NONE','BRIDGE_COMMISSIONING_NATIVE_BOUNDARY_CHANGED');
  const outputs=[];
  for(const row of inspection.records){
   outputs.push(await document('records/'+hash(Buffer.from(row.request.id))+'.json',row));
   outputs.push(await file('documents/'+row.documentSha256+'.json',jsonBytes(row.document)));
  }
  for(const descriptor of inspection.files){
   const body=await workspace.fileBytes(descriptor.id,{private:true});
   need(body.length===descriptor.bytes&&hash(body)===descriptor.sha256,'BRIDGE_COMMISSIONING_EVIDENCE_CHANGED');
   outputs.push(await file('evidence/'+descriptor.sha256+'.bin',body));
  }
  return {inspection,outputs};
 }
 async function produce(){
  stop();await directory(root);
  const initial=workspace.describe().workspace;
  await document('selection.json',{schema:SCHEMA,operation:OPERATION,workspaceId:initial.id,selectionSha256,selection:frozen});
  const requestIds=[];
  for(const review of frozen.reviews){
   await admitted('review',review);requestIds.push(review.requestId);
   for(const decision of review.decisions??[]){await admitted('decision',decision,review.requestId);requestIds.push(decision.requestId);}
  }
  for(const requestId of frozen.existingRequestIds){
   const row=await service().read(requestId);need(row.request.status==='COMPLETE','BRIDGE_COMPLETE_REVIEW_REQUIRED');
   requestIds.push(requestId);
  }
  const {inspection,outputs}=await collect(requestIds);
  // Download originals only from the selected saved review. No newly observed
  // provider response, invented event or different scope is substituted.
  const originals=new Map();
  for(const row of inspection.records)if(row.document.schema==='bloccpay.bridge-intake-review.v1'){
   for(const source of row.document.sources)if(source.responseFileId)originals.set('sources:'+source.id,{table:'sources',id:source.id});
   for(const event of row.document.webhooks)originals.set('webhooks:'+event.id,{table:'webhooks',id:event.id});
  }
  for(const target of originals.values()){
   stop();const original=await service().originalBody(target);
   outputs.push(await file('originals/'+original.descriptor.sha256+'.bin',original.body));
  }
  const result={schema:'bloccpay.bridge-commissioning-result.v1',operation:OPERATION,selectionSha256,
   originalWorkspaceId:initial.id,requests:inspection.records.map(recordIdentity),
   files:inspection.files.map(row=>({id:row.id,bytes:row.bytes,sha256:row.sha256})),
   outputs:[...new Map(outputs.map(row=>[row.path,row])).values()].sort((a,b)=>a.path.localeCompare(b.path)),
   providerRequests:0,ledgerAction:'NONE',creditAuthorization:false};
  await document('PRODUCING_RESULT.json',result);return result;
 }
 function validateResult(value){
  need(value?.schema==='bloccpay.bridge-commissioning-result.v1'&&value.operation===OPERATION&&
   value.selectionSha256===selectionSha256&&Array.isArray(value.requests)&&value.requests.length&&Array.isArray(value.files),
   'BRIDGE_COMMISSIONING_ORIGINAL_RESULT_REQUIRED');
  const expected=[...frozen.reviews.flatMap(r=>[r.requestId,...(r.decisions??[]).map(d=>d.requestId)]),...frozen.existingRequestIds].sort();
  need(canonical(value.requests.map(r=>r.requestId))===canonical(expected),'BRIDGE_COMMISSIONING_REQUEST_SELECTION_CHANGED');
 }
 async function receive(original){
  stop();validateResult(original);
  const before=clone(workspace.describe().workspace);
  need(before.id!==original.originalWorkspaceId&&before.dispatchEnabled===false,'BRIDGE_INDEPENDENT_RECEIVING_REQUIRED');
  const {inspection,outputs}=await collect(original.requests.map(r=>r.requestId));
  need(canonical(inspection.records.map(recordIdentity))===canonical(original.requests),'BRIDGE_RECEIVED_RECORD_CHANGED');
  need(canonical(inspection.files.map(row=>({id:row.id,bytes:row.bytes,sha256:row.sha256})))===canonical(original.files),
   'BRIDGE_RECEIVED_EVIDENCE_CHANGED');
  const after=workspace.describe().workspace;
  need(canonical(before)===canonical(after),'BRIDGE_RECEIVING_MUTATED_WORKSPACE');
  const result={schema:'bloccpay.bridge-commissioning-received.v1',operation:OPERATION,selectionSha256,
   originalWorkspaceId:original.originalWorkspaceId,workspace:before,requests:clone(original.requests),
   files:clone(original.files),outputs,providerRequests:0,ledgerAction:'NONE',creditAuthorization:false};
  await document('RECEIVED_RESULT.json',result);return result;
 }
 async function closeBrowser(owner){
  if(!owner.operatorClosed){
   if(owner.page&&!owner.page.isClosed()){
    const state=await owner.page.evaluate(async()=>{
     if(window.bloccpayBridge)return window.bloccpayBridge.close();
     if(document.readyState!=='loading'&&!document.querySelector('script[src="/bridge-desk.mjs"]'))return {state:'NO_DESK'};
     return {state:'PENDING'};
    });
    need(['CLOSED','NO_DESK'].includes(state?.state),'BRIDGE_DESK_CLOSE_PENDING');
   }
   owner.operatorClosed=true;
  }
  if(owner.pending.size)await Promise.allSettled([...owner.pending]);
  for(const row of [...owner.downloads])await finishDownload(row,true);
  if(owner.context&&!owner.contextClosed){await owner.closeContext(owner.context);owner.contextClosed=true;}
  browserOwners.delete(owner);
 }
 async function observeBrowser({server,openContext,closeContext,original,phase}){
  stop();validateResult(original);need(frozen.browser,'BRIDGE_BROWSER_NOT_SELECTED');
  need(['original','received'].includes(phase)&&server?.startup?.origin&&typeof server.token==='string'&&
   typeof openContext==='function'&&typeof closeContext==='function','COMMISSIONING_DEPENDENCY_MISSING',
   {required:'The original live host and borrowed browser context owner.'});
  const identity=workspace.describe().workspace.id;
  need(phase==='original'?identity===original.originalWorkspaceId:identity!==original.originalWorkspaceId,
   'BRIDGE_BROWSER_WORKSPACE_CHANGED');
  const owner={context:null,page:null,pending:new Set(),downloads:new Set(),operatorClosed:false,contextClosed:false,closeContext};
  browserOwners.add(owner);
  let rejectInterrupted;
  const interruptedWork=new Promise((resolve,reject)=>{rejectInterrupted=reject;});
  interruptedWork.catch(()=>{});interrupters.add(rejectInterrupted);
  if(interrupted)rejectInterrupted(interruption());
  const responsive=task=>Promise.race([task,interruptedWork]);
  let first=null,result;
  try{
   owner.context=await openContext({viewport:{width:1440,height:1000},acceptDownloads:true});stop();
   owner.page=await owner.context.newPage();const page=owner.page;
   await page.goto(server.startup.origin+'/bridge#token='+encodeURIComponent(server.token),{waitUntil:'domcontentloaded'});
   await page.waitForFunction(id=>window.bloccpayBridge?.observe().workspaceId===id,identity,{timeout:30000});
   const records=[],downloaded=[];
   for(const row of original.requests){
    stop();
    const article=page.locator('#reviews article').filter({has:page.getByText(row.requestId,{exact:true})});
    need(await article.count()===1,'BRIDGE_ORIGINAL_REVIEW_CONTROL_REQUIRED');
    await article.getByRole('button',{name:'Open original record',exact:true}).click();
    await page.waitForFunction(id=>{
     try{return JSON.parse(document.querySelector('#result').textContent).request.id===id;}catch{return false;}
    },row.requestId,{timeout:30000});
    const record=parseSourceJSON(Buffer.from(await page.locator('#result').textContent()),{maxBytes:48*1024*1024}).value;
    need(canonical(recordIdentity(record))===canonical(row),'BRIDGE_BROWSER_ORIGINAL_RECORD_CHANGED');
    records.push(record);
    const wait=page.waitForEvent('download',{timeout:30000});owner.pending.add(wait);
    let download=null;
    const adopt=wait.then(value=>{
     download=value;const row={download:value,owner,pending:new Set(),cancelPromise:null,cancelled:false};
     downloads.set(value,row);owner.downloads.add(row);
     if(interrupted)cancelDownload(row).catch(()=>{});
     return value;
    });
    owner.pending.add(adopt);adopt.then(()=>owner.pending.delete(adopt),()=>owner.pending.delete(adopt));
    let downloadError=null;
    try{
     await article.getByRole('button',{name:'Download exact JSON',exact:true}).click();
     download=await responsive(adopt);stop();const held=downloads.get(download);
     need(!await responsive(ownDownload(held,()=>download.failure())),'BRIDGE_DOWNLOAD_FAILED');
     const temporary=await responsive(ownDownload(held,()=>download.path()));stop();need(temporary,'BRIDGE_DOWNLOAD_PATH_REQUIRED');
     const descriptor=await fileDescriptor(temporary);
     need(descriptor.bytes===row.file.bytes&&descriptor.sha256===row.documentSha256,'BRIDGE_BROWSER_DOWNLOAD_CHANGED');
     const input=await fs.open(temporary,constants.O_RDONLY|constants.O_NOFOLLOW);let body;
     try{body=await input.readFile();}finally{await input.close();}
     need(body.length===descriptor.bytes&&hash(body)===descriptor.sha256,'BRIDGE_BROWSER_DOWNLOAD_CHANGED');
     downloaded.push(await file('browser/'+phase+'/downloads/'+row.documentSha256+'.json',body));
    }catch(error){downloadError=error;}
    try{
     await Promise.allSettled([wait,adopt]);owner.pending.delete(wait);
     if(download)await finishDownload(downloads.get(download),interrupted||!!downloadError);
    }catch(error){downloadError??=error;}
    if(downloadError)throw downloadError;
   }
   const observation=await page.evaluate(()=>window.bloccpayBridge.observe());
   need(observation.workspaceId===identity,'BRIDGE_BROWSER_WORKSPACE_CHANGED');
   result={schema:'bloccpay.bridge-browser-observation.v1',operation:OPERATION,selectionSha256,phase,workspaceId:identity,
    records,downloads:downloaded,providerRequests:0,domainWrites:0};
  }catch(error){first=error;}
  try{await closeBrowser(owner);}catch(error){first??=error;}
  interrupters.delete(rejectInterrupted);
  if(first)throw first;
  await document('browser/'+phase+'/OBSERVATION.json',result);return result;
 }
 function close(){
  if(closed)return Promise.resolve({state:'CLOSED',borrowedWorkspace:true});
  if(closePromise)return closePromise;closing=true;interrupt();
  const pending=(async()=>{
   while(tasks.size)await Promise.allSettled([...tasks]);
   let first=null;
   for(const owner of [...browserOwners]){
    try{if(owner.context)await closeBrowser(owner);else browserOwners.delete(owner);}catch(error){first??=error;}
   }
   for(const row of [...downloads.values()])try{await finishDownload(row,true);}catch(error){first??=error;}
   if(browserOwners.size||downloads.size)throw first??Object.assign(new Error('Original browser owners remain.'),{code:'BRIDGE_BROWSER_CLOSE_PENDING'});
   if(intake){await intake.close();intake=null;}
   if(first)throw first;signal?.removeEventListener('abort',interrupt);closed=true;return {state:'CLOSED',borrowedWorkspace:true};
  })();
  closePromise=pending;pending.catch(()=>{if(closePromise===pending)closePromise=null;});return pending;
 }
 return{produce:()=>track(produce),receive:original=>track(()=>receive(original)),
  observeBrowser:options=>track(()=>observeBrowser(options)),close,
  inspect:()=>({selectionSha256,directory:root,closing,closed,tasks:tasks.size,browsers:browserOwners.size,downloads:downloads.size})};
}
