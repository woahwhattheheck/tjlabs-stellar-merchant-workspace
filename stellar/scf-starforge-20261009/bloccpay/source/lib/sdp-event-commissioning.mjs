// MIT. Actual SDP inbox work inside the original company commissioning operation.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {need,canonical,hash,jsonBytes,clone,directory,readJSON,writeExact,
 fileDescriptor,copyDeclared,syncDirectory} from './files.mjs';

const METHODS={project:'webhook.project',reconcile:'operation.reconcile',adopt:'webhook.reconcile'};
const copy=clone,sha=value=>hash(Buffer.from(canonical(value)));
const errorValue=error=>({code:error.code??error.name??'ERROR',message:String(error.message??error)});
function same(value,expected,code){need(canonical(value)===canonical(expected),code);}
function selector(name,value){return '['+name+'='+JSON.stringify(value)+']';}

/**
 * Construct and register this owner before invoking any method.
 * The original programme owns workspace, browser, hosts and its operation guard.
 * This owner retains only its original inbox contexts, downloads and file work.
 */
export function createSDPEventInboxCommissioning({
 workspace,selection,operationDirectory,signal,request,
 openBrowserContext,closeBrowserContext,
}={}){
 need(workspace&&selection&&path.isAbsolute(operationDirectory),'ORIGINAL_SDP_INBOX_SELECTION_REQUIRED');
 need(typeof selection.webhookId==='string'&&selection.webhookId.length>0&&
  /^[a-f0-9]{64}$/.test(selection.selectionSha256),'ORIGINAL_SDP_EVENT_IDENTITY_REQUIRED');
 const actions=selection.actions??[];
 need(Array.isArray(actions)&&actions.length<=3&&actions.every(value=>Object.hasOwn(METHODS,value))&&
  new Set(actions).size===actions.length,'EXPLICIT_SDP_INBOX_ACTIONS_REQUIRED');
 const initialWorkspaceId=workspace.describe().workspace.id;
 const input={schema:'bloccpay.sdp-event-inbox-selection.v1',workspaceId:initialWorkspaceId,
  webhookId:selection.webhookId,selectionSha256:selection.selectionSha256,actions:copy(actions)};
 const inputSha256=sha(input),root=path.join(operationDirectory,'sdp-event-inbox',inputSha256),contexts=new Set(),tasks=new Set();
 const downloadStop=new AbortController();
 let admitted=false,closing=false,closed=false,closePromise=null,running=false;
 let originalResult=null,abortListening=false;
 function cancelDownload(item){
  if(item.cancelled)return Promise.resolve();if(item.cancelling)return item.cancelling;
  const pending=Promise.resolve().then(()=>item.download.cancel()).then(()=>{item.cancelled=true;},error=>{item.cancelError=error;throw error;});
  item.cancelling=pending;
  pending.then(()=>{if(item.cancelling===pending)item.cancelling=null;},()=>{if(item.cancelling===pending)item.cancelling=null;});
  return pending;
 }
 function cancelOwnedDownloads(){
  if(!downloadStop.signal.aborted)downloadStop.abort(signal?.reason??Object.assign(new Error('Original inbox is closing.'),{code:'SDP_INBOX_CLOSING'}));
  for(const record of contexts)for(const item of record.downloads)cancelDownload(item).catch(()=>{});
 }
 function waitForDownload(item){
  const stopped=downloadStop.signal;
  if(stopped.aborted)return Promise.reject(stopped.reason);
  return new Promise((resolve,reject)=>{
   const abort=()=>reject(stopped.reason);stopped.addEventListener('abort',abort,{once:true});
   item.pending.then(resolve,reject).finally(()=>stopped.removeEventListener('abort',abort));
   if(stopped.aborted)abort();
  });
 }
 function armCancellation(){
  if(signal&&!abortListening){signal.addEventListener('abort',cancelOwnedDownloads);abortListening=true;}
  if(signal?.aborted)cancelOwnedDownloads();
 }
 function stopped(){need(!closing&&!closed,'SDP_INBOX_CLOSING');signal?.throwIfAborted();}
 function track(work){
  stopped();armCancellation();let pending;try{pending=Promise.resolve(work());}catch(error){pending=Promise.reject(error);}
  tasks.add(pending);pending.then(()=>tasks.delete(pending),()=>tasks.delete(pending));return pending;
 }
 function run(work){return track(async()=>{
  need(!running,'SDP_INBOX_OPERATION_ACTIVE');running=true;
  try{return await work();}finally{running=false;}
 });}
 function eventIn(owner){
  const event=owner.privateItem('webhooks',input.webhookId);
  need(event.provider==='sdp'&&event.verified===true&&event.status!=='CONFLICT'&&!event.conflictsWith,
   'ORIGINAL_VERIFIED_SDP_EVENT_REQUIRED');
  need(event.selectionSha256===input.selectionSha256,'ORIGINAL_SDP_EVENT_SELECTION_CHANGED');
  return event;
 }
 function snapshot(owner){
  const event=eventIn(owner),operations=[],sources=[],versions=[];
  if(event.readback?.operationId){
   let operation;try{operation=owner.privateItem('operations',event.readback.operationId);}
   catch(error){if(error.code!=='RECORD_NOT_FOUND')throw error;}
   if(operation){
    operations.push(operation);
    if(operation.reconciliation?.operationId)operations.push(owner.privateItem('operations',operation.reconciliation.operationId));
   }
  }
  const sourceIds=[...new Set([event.sourceId,...operations.flatMap(row=>row.sourceIds??[]),
   ...(event.readback?.sourceIds??[])].filter(Boolean))];
  for(const id of sourceIds)sources.push(owner.privateItem('sources',id));
  for(const id of [...new Set(sources.flatMap(row=>row.versionIds??[]))])versions.push(owner.privateItem('resourceVersions',id));
  return {event,operations,sources,versions};
 }
 async function selectOriginal(){
  stopped();need(workspace.describe().workspace.id===initialWorkspaceId,'ORIGINAL_WORKSPACE_CHANGED');
  const event=eventIn(workspace);
  await directory(root);await writeExact(path.join(root,'selection.json'),jsonBytes(input));
  // Observe already-verified native custody. Never replay or regenerate a signature.
  const source=workspace.privateItem('sources',event.sourceId);
  need(source.provider==='sdp'&&source.kind==='sdp.event-metadata','ORIGINAL_SDP_METADATA_REQUIRED');
  need(event.bodyFileId&&event.signatureFileId,'ORIGINAL_SIGNED_DELIVERY_CUSTODY_REQUIRED');
  const body=await workspace.fileBytes(event.bodyFileId,{private:true});
  need(body.length===event.bytes&&hash(body)===event.rawSha256,'ORIGINAL_SIGNED_BODY_CHANGED');
  await workspace.fileBytes(event.signatureFileId,{private:true});
  admitted=true;
  return {input:copy(input),inputSha256,eventId:event.eventId,sourceId:source.id,
   readback:copy(event.readback??null),coverage:'ACTUAL_RETAINED_SIGNED_EVENT'};
 }
 function commandFile(index){return path.join(root,'commands',String(index).padStart(2,'0')+'.json');}
 function validateCommand(record,index){
  need(record?.schema==='bloccpay.sdp-event-inbox-command.v1'&&record.inputSha256===inputSha256&&
   record.index===index&&record.action===actions[index],'ORIGINAL_INBOX_COMMAND_CHANGED');
  const row=record.row,command=row?.command;
  need(row?.workspaceId===initialWorkspaceId&&row.eventId===input.webhookId&&
   row.selectionSha256===input.selectionSha256&&row.id===command?.requestId&&
   row.commandSha256===sha(command)&&command.method===METHODS[actions[index]],
   'ORIGINAL_INBOX_COMMAND_CHANGED');
  if(command.method==='operation.reconcile')
   need(command.args.operationId===row.eventOperationId&&
    row.eventOperationId===eventIn(workspace).readback?.operationId,'ORIGINAL_INBOX_GET_CHANGED');
  else same(command.args,{webhookId:input.webhookId},'ORIGINAL_INBOX_EVENT_CHANGED');
  need(Number.isSafeInteger(command.expectedRevision)&&command.expectedRevision>=0,
   'ORIGINAL_INBOX_REVISION_REQUIRED');
  return record;
 }
 async function retainedCommands(){
  const result=[];
  for(let i=0;i<actions.length;i++){
   const record=await readJSON(commandFile(i),true);
   if(record)result.push(validateCommand(record,i));
  }
  return result;
 }
 async function persistCommands(record){
  for(const [index,value]of record.commands){
   validateCommand(value,index);await writeExact(commandFile(index),jsonBytes(value));
  }
 }
 async function openContext(browser,server,{received=false}={}){
  stopped();need(browser&&server?.workspace,'COMMISSIONING_DEPENDENCY_MISSING',
   {required:'The original programme browser, actual host and selected company workspace.'});
  const context=await (openBrowserContext?openBrowserContext({acceptDownloads:true,viewport:{width:1440,height:1000}}):
   browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}));
  const record={context,page:null,opened:false,operatorClosed:false,contextClosed:false,
   commands:new Map(),downloads:new Set(),routeTasks:new Set(),first:null,step:null,received};
  contexts.add(record);
  try{
   record.page=await context.newPage();
   record.page.setDefaultTimeout(30000);
   record.page.on('pageerror',error=>{record.first??=error;});
   const restored=received?[]:await retainedCommands();
   await context.addInitScript(async ({rows,workspaceId})=>{
    // Restore only exact commands captured from this inbox before their original dispatch.
    if(!rows.length)return;
    window.__bloccpayOriginalInboxRestore=(async()=>{
     const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('bloccpay-sdp-events-browser',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'id'});
      request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
     });
     try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('requests','readwrite'),store=tx.objectStore('requests');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      for(const row of rows){
       if(row.workspaceId!==workspaceId){tx.abort();return;}
       const request=store.get(row.id);
       request.onsuccess=()=>{
        if(request.result&&request.result.commandSha256!==row.commandSha256){tx.abort();return;}
        if(!request.result)store.put(row);
       };
      }
     });}finally{db.close();}
    })();
   },{rows:restored.map(item=>item.row),workspaceId:initialWorkspaceId});
   // Static assets initialize normally; authentication is supplied through the actual access form.
   await record.page.goto(server.startup.origin+'/sdp-events',{waitUntil:'domcontentloaded'});
   await record.page.evaluate(async()=>{if(window.__bloccpayOriginalInboxRestore)await window.__bloccpayOriginalInboxRestore;});
   if(await record.page.locator('#access').isVisible()){
    await record.page.locator('#access input[name=token]').fill(server.token);
    await record.page.locator('#access button[type=submit]').click();
   }
   await record.page.waitForFunction(id=>window.bloccpaySDPEvents?.observe().workspaceId===id&&
    window.bloccpaySDPEvents.observe().active===0,server.workspace.describe().workspace.id);
   record.opened=true;
   if(!received)await record.page.route('**/api/command',route=>{
    const pending=(async()=>{
     try{
      stopped();need(record.step!==null,'UNSELECTED_INBOX_COMMAND');
      const command=route.request().postDataJSON(),index=record.step;
      const row=await record.page.evaluate(async id=>{
       const db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('bloccpay-sdp-events-browser',1);
        request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
       });
       try{return await new Promise((resolve,reject)=>{
        const tx=db.transaction('requests'),request=tx.objectStore('requests').get(id);let row;
        request.onsuccess=()=>{row=request.result;};tx.oncomplete=()=>resolve(row);
        tx.onabort=()=>reject(tx.error);
       });}finally{db.close();}
      },command.requestId);
      const selected=validateCommand({schema:'bloccpay.sdp-event-inbox-command.v1',
       inputSha256,index,action:actions[index],row},index);
      same(row.command,command,'ORIGINAL_UI_COMMAND_CHANGED');
      const existing=record.commands.get(index)??await readJSON(commandFile(index),true);
      if(existing){validateCommand(existing,index);same(existing.row.command,selected.row.command,'ORIGINAL_UI_REQUEST_REPLACED');
       need(existing.row.id===selected.row.id&&existing.row.workspaceId===selected.row.workspaceId,'ORIGINAL_UI_REQUEST_REPLACED');}
      // Attempts may advance; the first exact captured command remains immutable.
      const original=existing??selected;
      record.commands.set(index,original);
      await writeExact(commandFile(index),jsonBytes(original));
      await route.continue();
     }catch(error){
      record.first??=error;
      try{await route.abort('failed');}catch(cleanup){record.first??=cleanup;}
     }
    })();
    record.routeTasks.add(pending);pending.then(()=>record.routeTasks.delete(pending),()=>record.routeTasks.delete(pending));
    return pending;
   });
   await openEvent(record,input.webhookId);return record;
  }catch(error){
   record.first??=error;
   try{await closeRecord(record);}catch(cleanup){Object.defineProperty(error,'sdpEventInboxOwner',{value:{close},enumerable:false});error.cleanup=errorValue(cleanup);}
   throw error;
  }
 }
 async function idle(record){
  await record.page.waitForFunction(()=>window.bloccpaySDPEvents?.observe().active===0);
  while(record.routeTasks.size)await Promise.allSettled([...record.routeTasks]);
  if(record.first)throw record.first;stopped();
 }
 async function openEvent(record,id){
  await record.page.locator('#filter').fill(id);
  await record.page.locator('.event-row'+selector('data-event-id',id)+' button').click();
  await idle(record);
  need(await record.page.evaluate(id=>window.bloccpaySDPEvents.observe().eventId===id,id),
   'ORIGINAL_INBOX_EVENT_NOT_OPEN');
 }
 async function observedRequest(record,commandRecord){
  const row=await record.page.evaluate(async id=>{
   const db=await new Promise((resolve,reject)=>{
    const r=indexedDB.open('bloccpay-sdp-events-browser',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
   });
   try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('requests'),r=tx.objectStore('requests').get(id);let value;
    r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);
   });}finally{db.close();}
  },commandRecord.row.id);
  need(row&&row.commandSha256===commandRecord.row.commandSha256,'ORIGINAL_INBOX_REQUEST_LOST');
  const native=workspace.item('requests',row.id);
  same({method:native.method,args:native.args,expectedRevision:native.expectedRevision},
   {method:row.command.method,args:row.command.args,expectedRevision:row.command.expectedRevision},
   'ORIGINAL_INBOX_NATIVE_REQUEST_CHANGED');
  if(native.status==='COMPLETE'){
   need(row.status==='COMPLETE','ORIGINAL_ACCEPTED_INBOX_RESULT_NOT_RETAINED');
   same(row.response,native.result,'ORIGINAL_INBOX_RESULT_CHANGED');
  }else need(row.status==='REJECTED'&&native.status==='FAILED','ORIGINAL_INBOX_REQUEST_UNFINISHED');
  const result={schema:'bloccpay.sdp-event-inbox-command-result.v1',inputSha256,
   command:copy(commandRecord),local:row,native};
  const resultFile=path.join(root,'commands',String(commandRecord.index).padStart(2,'0')+'-result.json');
  const previous=await readJSON(resultFile,true);
  if(previous){need(previous.inputSha256===inputSha256,'ORIGINAL_INBOX_RESULT_CHANGED');
   same(previous.command,commandRecord,'ORIGINAL_INBOX_COMMAND_CHANGED');same(previous.native,native,'ORIGINAL_INBOX_RESULT_CHANGED');return previous;}
  await writeExact(resultFile,jsonBytes(result));return result;
 }
 async function perform(record,index){
  stopped();record.step=index;
  let retained=await readJSON(commandFile(index),true);
  if(retained){
   validateCommand(retained,index);
   // The access refresh rendered the original restored request, including COMPLETE native recovery.
   await record.page.locator('.request'+selector('data-request-id',retained.row.id)+' button').click();
  }else{
   const action=actions[index],labels=action==='reconcile'?['Prepare explicit reconciliation GET']:
    action==='adopt'?['Prepare adoption of retained reconciliation']:
    ['Prepare first resource read','Prepare original read continuation'];
   let control=null;
   for(const label of labels){
    const candidate=record.page.getByRole('button',{name:label,exact:true});
    if(await candidate.count()){control=candidate;break;}
   }
   need(control,'SDP_INBOX_ACTION_NOT_AVAILABLE',{action,eventId:input.webhookId});
   await control.click();await idle(record);
   const proposal=JSON.parse(await record.page.locator('#proposal-body').textContent());
   need(proposal.workspaceId===initialWorkspaceId&&proposal.eventId===input.webhookId&&
    proposal.selectionSha256===input.selectionSha256&&proposal.command.method===METHODS[action],
    'ORIGINAL_INBOX_PROPOSAL_CHANGED');
   await record.page.locator('#confirm').click();
  }
  await idle(record);
  retained=await readJSON(commandFile(index));validateCommand(retained,index);
  const result=await observedRequest(record,retained);
  record.step=null;
  need(result.native.status==='COMPLETE','ORIGINAL_INBOX_COMMAND_REJECTED',{requestId:retained.row.id,error:result.native.error});
  return result;
 }
 async function download(record,control,{label,expectedSha256=null,eventView=false}={}){
  stopped();
  let item=null,eventError=null;
  const acquired=record.page.waitForEvent('download',{timeout:30000}).then(download=>{
   item={download,pending:null,cancelling:null,cancelled:false};record.downloads.add(item);
   if(signal?.aborted||closing)cancelDownload(item).catch(()=>{});return item;
  },error=>{eventError=error;throw error;});
  // Attach rejection immediately; retain settlement even if the UI action fails.
  acquired.catch(()=>{});
  let primary=null;
  try{await control.click();await idle(record);}catch(error){primary=error;}
  try{await acquired;}catch(error){primary??=error;}
  if(primary)throw primary;if(eventError)throw eventError;stopped();
  const temporaryRoot=await directory(path.join(root,'download-work'));
  const temporary=path.join(temporaryRoot,randomUUID());
  item.pending=(async()=>{
   await item.download.saveAs(temporary);
   need(await item.download.failure()===null,'ORIGINAL_INBOX_DOWNLOAD_FAILED');
   await fs.chmod(temporary,0o600);
   const descriptor=await fileDescriptor(temporary,path.basename(temporary));
   if(expectedSha256)need(descriptor.sha256===expectedSha256,'ORIGINAL_INBOX_DOWNLOAD_CHANGED');
   if(eventView){
    need(descriptor.bytes<=64*1024*1024,'INBOX_EVENT_VIEW_TOO_LARGE');
    const view=await readJSON(temporary);
    need(view.schema==='bloccpay.sdp-event-view.v1'&&view.event.id===input.webhookId&&
     view.event.selectionSha256===input.selectionSha256,'ORIGINAL_EVENT_VIEW_CHANGED');
   }
   const retained=await copyDeclared(temporaryRoot,descriptor,root,'downloads/'+descriptor.sha256+'.bin');
   await fs.unlink(temporary);await syncDirectory(temporaryRoot);
   return{...retained,label};
  })();
  // Observe the owned save immediately even if interruption won before this wait.
  item.pending.catch(()=>{});
  const result=await waitForDownload(item);
  if(item.cancelling)await item.cancelling;
  stopped();record.downloads.delete(item);return result;
 }
 async function captureView(record,owner){
  const observation=snapshot(owner),downloads=[];
  downloads.push(await download(record,record.page.getByRole('button',{name:'Download event and readback record',exact:true}),
   {label:'event-and-readback.json',eventView:true}));
  for(const source of observation.sources){
   const card=record.page.locator('.source'+selector('data-source-id',source.id));
   if(source.publicFileId)downloads.push(await download(record,card.getByRole('button',{name:'Download source observation',exact:true}),
    {label:'source-'+source.id+'.json',expectedSha256:source.publicFileId.slice(7)}));
   if(source.downloadableFileId)downloads.push(await download(record,card.getByRole('button',{name:'Download original response',exact:true}),
    {label:source.downloadFileName??'original-response.json',expectedSha256:source.bodySha256}));
  }
  return{observation,downloads};
 }
 async function closeRecord(record){
  let first=null;
  // A captured browser command is preserved before the page or its IndexedDB owner is released.
  while(record.routeTasks.size)await Promise.allSettled([...record.routeTasks]);
  try{await persistCommands(record);}catch(error){first??=error;}
  if(!first&&record.page&&!record.page.isClosed()&&!record.operatorClosed){
   try{
    const result=await record.page.evaluate(async()=>{
     const app=window.bloccpaySDPEvents;return app?await app.close():{state:'NOT_OPENED'};
    });
    need(result.state==='CLOSED'||!record.opened&&result.state==='NOT_OPENED','ORIGINAL_INBOX_OPERATOR_NOT_CLOSED');
    record.operatorClosed=true;
   }catch(error){first??=error;}
  }else if(record.page?.isClosed())record.operatorClosed=true;
  // A live failed operator remains available for the same close retry.
  if(first)throw first;
  for(const item of [...record.downloads]){
   // Cancel this acquired download before awaiting a potentially blocked save.
   try{await cancelDownload(item);}catch(error){first??=error;continue;}
   if(item.pending)try{await item.pending;}catch(error){item.saveError??=errorValue(error);}
   record.downloads.delete(item);
  }
  if(first)throw first;
  if(!record.contextClosed){
   if(closeBrowserContext)await closeBrowserContext(record.context);else await record.context.close();
   record.contextClosed=true;
  }
  contexts.delete(record);
 }
 async function verifySaved(result){
  need(result.schema==='bloccpay.sdp-event-inbox-result.v1'&&result.inputSha256===inputSha256,
   'ORIGINAL_INBOX_RESULT_CHANGED');
  for(const file of result.files){
   const selected=await fileDescriptor(path.join(root,file.path),file.path);
   need(selected.bytes===file.bytes&&selected.sha256===file.sha256,'ORIGINAL_INBOX_ARTIFACT_CHANGED');
  }
  if(result.retainedObservation){
   const {retainedObservation,...candidate}=result;
   const original=await workspace.fileBytes(retainedObservation.file.id,{private:true});
   need(original.length===retainedObservation.file.bytes&&hash(original)===retainedObservation.file.sha256&&
    original.equals(jsonBytes(candidate))&&retainedObservation.receipt.file.id===retainedObservation.file.id,
    'ORIGINAL_RETAINED_INBOX_REPORT_CHANGED');
  }
  for(const command of result.commands){
   const native=workspace.item('requests',command.native.id);
   same(native.result,command.native.result,'ORIGINAL_INBOX_ACCEPTED_RESULT_CHANGED');
  }
  return result;
 }
 async function finishCandidate(value){
  await verifySaved(value);
  need(typeof request==='function','ORIGINAL_COMMISSIONING_REQUEST_REQUIRED');
  const body=jsonBytes(value),file=await workspace.retainFile(body,{
   filename:'sdp-event-inbox-observation.json',contentType:'application/json',private:true});
  need(file.sha256===hash(body),'ORIGINAL_INBOX_REPORT_CHANGED');
  const retained=await request(workspace,'sdp-event-inbox-observation:'+inputSha256,'file.retain',{fileId:file.id});
  const result={...value,retainedObservation:{file,receipt:retained}};
  await writeExact(path.join(root,'result.json'),jsonBytes(result));originalResult=result;return copy(result);
 }
 async function operateOriginal({browser,server}={}){
  if(!admitted)await selectOriginal();
  const completed=await readJSON(path.join(root,'result.json'),true);
  if(completed){originalResult=await verifySaved(completed);return copy(originalResult);}
  const candidate=await readJSON(path.join(root,'candidate.json'),true);
  if(candidate)return finishCandidate(candidate);
  need(server.workspace===workspace,'ORIGINAL_COMPANY_HOST_REQUIRED');
  const record=await openContext(browser,server);let value,first=null;
  try{
   const commands=[];
   for(let index=0;index<actions.length;index++)commands.push(await perform(record,index));
   await record.page.locator('#refresh').click();await idle(record);await openEvent(record,input.webhookId);
   const captured=await captureView(record,workspace);
   const commandFiles=[await fileDescriptor(path.join(root,'selection.json'),'selection.json')];
   for(let index=0;index<actions.length;index++)for(const suffix of ['.json','-result.json']){
    const relative='commands/'+String(index).padStart(2,'0')+suffix;
    commandFiles.push(await fileDescriptor(path.join(root,relative),relative));
   }
   value={schema:'bloccpay.sdp-event-inbox-result.v1',inputSha256,input:copy(input),
    workspaceId:initialWorkspaceId,commands,observation:captured.observation,files:[...commandFiles,...captured.downloads],
    readbackStatus:captured.observation.event.readback?.status??null,
    coverage:'ACTUAL_RETAINED_EVENT_AND_OPERATOR',ownersClosed:true};
  }catch(error){first=error;}
  try{await closeRecord(record);}catch(error){first??=error;}
  if(first)throw first;
  await writeExact(path.join(root,'candidate.json'),jsonBytes(value));return finishCandidate(value);
 }
 async function receiveOriginal({browser,server}={}){
  if(!admitted)await selectOriginal();
  originalResult??=await readJSON(path.join(root,'result.json'),true);
  need(originalResult,'COMMISSIONING_DEPENDENCY_MISSING',{required:'Completed original SDP inbox work before received observation.'});
  await verifySaved(originalResult);
  need(server.workspace.describe().workspace.id!==initialWorkspaceId&&
   server.workspace.describe().workspace.dispatchEnabled===false,'ORIGINAL_RECEIVING_SCOPE_REQUIRED');
  const received=snapshot(server.workspace),original=originalResult.observation;
  const selectedReport=originalResult.retainedObservation?.file;
  need(selectedReport,'ORIGINAL_RETAINED_INBOX_REPORT_REQUIRED');
  const originalReport=await server.workspace.fileBytes(selectedReport.id,{private:true});
  need(originalReport.length===selectedReport.bytes&&hash(originalReport)===selectedReport.sha256,
   'RECEIVED_INBOX_REPORT_CHANGED');
  need(received.event.rawSha256===original.event.rawSha256&&
   received.event.selectionSha256===original.event.selectionSha256,'RECEIVED_SIGNED_EVENT_CHANGED');
  for(const source of original.sources){
   const selected=server.workspace.privateItem('sources',source.id);
   same(selected,source,'RECEIVED_ORIGINAL_EVENT_SOURCE_CHANGED');
  }
  for(const version of original.versions)same(server.workspace.privateItem('resourceVersions',version.id),version,'RECEIVED_EVENT_VERSION_CHANGED');
  for(const command of originalResult.commands){
   const native=server.workspace.item('requests',command.native.id);
   same(native.result,command.native.result,'RECEIVED_ORIGINAL_REQUEST_CHANGED');
  }
  const receivedId=server.workspace.describe().workspace.id;
  const previous=await readJSON(path.join(root,'received',receivedId+'.json'),true);
  if(previous){need(previous.inputSha256===inputSha256&&previous.workspaceId===receivedId,'ORIGINAL_RECEIVED_INBOX_RESULT_CHANGED');
   for(const file of previous.files){const actual=await fileDescriptor(path.join(root,file.path),file.path);
    need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'ORIGINAL_INBOX_ARTIFACT_CHANGED');}
   return previous;}
  const record=await openContext(browser,server,{received:true});let captured,first=null;
  try{captured=await captureView(record,server.workspace);}catch(error){first=error;}
  try{await closeRecord(record);}catch(error){first??=error;}
  if(first)throw first;
  const value={schema:'bloccpay.sdp-event-inbox-received.v1',inputSha256,
   originalWorkspaceId:initialWorkspaceId,workspaceId:server.workspace.describe().workspace.id,
   observation:captured.observation,files:captured.downloads,commandRequests:0,readOnlyUI:true,ownersClosed:true};
  // Receiving a subsequent original export is a distinct immutable received observation.
  await writeExact(path.join(root,'received',value.workspaceId+'.json'),jsonBytes(value));return value;
 }
 function close(){
  if(closed)return Promise.resolve({state:'CLOSED'});if(closePromise)return closePromise;
  closing=true;cancelOwnedDownloads();
  const pending=(async()=>{
   while(tasks.size)await Promise.allSettled([...tasks]);
   let first=null;for(const record of [...contexts])try{await closeRecord(record);}catch(error){first??=error;}
   if(first)throw first;need(contexts.size===0,'ORIGINAL_INBOX_CONTEXTS_OPEN');
   if(abortListening){signal.removeEventListener('abort',cancelOwnedDownloads);abortListening=false;}
   closed=true;return{state:'CLOSED'};
  })();closePromise=pending;pending.catch(()=>{if(closePromise===pending)closePromise=null;});return pending;
 }
 return {select:()=>run(selectOriginal),operate:options=>run(()=>operateOriginal(options)),
  receive:options=>run(()=>receiveOriginal(options)),close,
  observe:()=>({inputSha256,resultSha256:originalResult?sha(originalResult):null,
   contexts:contexts.size,tasks:tasks.size,closing,closed})};
}
