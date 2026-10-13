// MIT. SDP event custody and explicit readback recovery in the original company host.
import {canonical,textHash,fileHash} from './journal.mjs';
const $=s=>document.querySelector(s),copy=v=>JSON.parse(JSON.stringify(v)),pretty=v=>JSON.stringify(v,null,2);
const need=(v,code,message=code)=>{if(!v)throw Object.assign(new Error(message),{code});};
const cleanError=e=>({code:String(e.code??'REQUEST_UNCERTAIN'),message:String(e.message??e),status:e.status??null});
const DB_NAME='bloccpay-sdp-events-browser',UNFINISHED=new Set(['PENDING','RUNNING','UNCERTAIN']);
let token='',bootstrap=null,events=[],nativeRequests=[],selected=null,selectedOperation=null,proposal=null;
let database=null,opening=null,closing=false,closed=false,closePromise=null,busy=false,filter='',page=0;
const tasks=new Set(),controllers=new Set(),urls=new Set(),known=new Map(),memory=new Map();
function notice(message,error=false){$('#status').textContent=message;$('#status').dataset.error=String(error);}
function report(error){notice((error.code?error.code+': ':'')+(error.message??String(error)),true);}
function track(work){
 need(!closing&&!closed,'DESK_CLOSING');
 let pending;try{pending=Promise.resolve(work());}catch(error){pending=Promise.reject(error);}
 tasks.add(pending);pending.then(()=>tasks.delete(pending),()=>tasks.delete(pending));return pending;
}
function run(work){
 return track(async()=>{
  need(!busy,'DESK_BUSY','Wait for the original operation to finish.');busy=true;$('#desk').inert=true;
  try{return await work();}
  finally{busy=false;$('#desk').inert=!bootstrap||closing;}
 }).catch(report);
}
function button(label,work,kind='secondary'){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.className=kind;b.onclick=()=>run(work);return b;
}
function detail(label,value){
 const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=label;p.textContent=pretty(value);d.append(s,p);return d;
}
function text(tag,value,className=''){
 const e=document.createElement(tag);e.textContent=String(value??'');if(className)e.className=className;return e;
}
async function db(){
 if(database)return database;
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'id'});
  request.onerror=()=>reject(request.error??new Error('Browser storage could not open.'));
  request.onblocked=()=>notice('Close an older event-inbox tab so this same browser storage can open.',true);
  request.onsuccess=()=>{database=request.result;database.onversionchange=()=>notice('Browser storage has a pending version change. Finish the retained request and close this tab.',true);resolve(database);};
 }).catch(error=>{opening=null;throw error;});
 return opening;
}
async function transaction(mode,work){
 const owner=await db();
 return new Promise((resolve,reject)=>{
  const tx=owner.transaction('requests',mode);let result,failure=null;
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(failure??tx.error??Object.assign(new Error('Keep this tab open; its original request has not finished saving.'),{code:'STORAGE_FAILED'}));
  tx.onerror=()=>{};
  const fail=error=>{failure??=error;try{tx.abort();}catch{}};
  try{work(tx.objectStore('requests'),value=>{result=value;},fail);}catch(error){fail(error);}
 });
}
function validate(row){
 need(row&&row.id===row.command?.requestId&&row.workspaceId&&
  ['webhook.project','webhook.reconcile','operation.reconcile'].includes(row.command.method)&&
  textHash(canonical(row.command))===row.commandSha256,'ORIGINAL_REQUEST_CHANGED');
 if(row.command.method==='operation.reconcile')need(row.command.args.operationId===row.eventOperationId,'ORIGINAL_OPERATION_CHANGED');
 else need(row.command.args.webhookId===row.eventId,'ORIGINAL_EVENT_CHANGED');
 return row;
}
function adopt(row,{publish=true}={}){
 validate(row);const existing=memory.get(row.id),accepted=known.get(row.id);
 for(const old of [existing,accepted])if(old){
  need(old.commandSha256===row.commandSha256&&old.workspaceId===row.workspaceId,'ORIGINAL_REQUEST_CHANGED');
  if(old.status==='COMPLETE'){
   if(row.status==='COMPLETE')need(canonical(old.response)===canonical(row.response),'ORIGINAL_RESULT_CHANGED');
   else row=old;
  }
 }
 if(publish)memory.set(row.id,row);return row;
}
async function rows(){
 const values=await transaction('readonly',(store,result,fail)=>{
  const r=store.getAll();r.onsuccess=()=>{try{result(r.result);}catch(e){fail(e);}};
 });
 for(const row of values)adopt(row);
 return [...memory.values()].filter(row=>row.workspaceId===bootstrap?.workspace.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function get(id){
 const value=await transaction('readonly',(store,result)=>{
  const r=store.get(id);r.onsuccess=()=>result(r.result??null);
 });
 return value?adopt(value):memory.get(id)??null;
}
async function put(value,{newAdmission=false}={}){
 const row=copy(adopt(value,{publish:false}));
 const saved=await transaction('readwrite',(store,result,fail)=>{
  const r=store.getAll();r.onsuccess=()=>{
   try{
    const all=r.result,old=all.find(x=>x.id===row.id);
    if(old){
     need(old.commandSha256===row.commandSha256&&old.workspaceId===row.workspaceId,'ORIGINAL_REQUEST_CHANGED');
     if(old.status==='COMPLETE'){
      if(row.status==='COMPLETE')need(canonical(old.response)===canonical(row.response),'ORIGINAL_RESULT_CHANGED');
      result(old);return;
     }
    }else if(newAdmission){
     need(!all.some(x=>x.workspaceId===row.workspaceId&&UNFINISHED.has(x.status)),'ORIGINAL_REQUEST_PENDING',
      'Reconcile the retained unfinished request before preparing another recovery.');
    }
    store.put(row);result(row);
   }catch(error){fail(error);}
  };
 });
 return adopt(saved);
}
async function api(route,{body,binary=false}={}){
 need(!closing&&!closed,'DESK_CLOSING','The inbox is closing; retain the original request for its next opening.');
 need(token,'OPERATOR_TOKEN_REQUIRED','Enter the original company operator token.');
 const c=new AbortController();controllers.add(c);
 try{
  const response=await fetch(route,{method:body===undefined?'GET':'POST',cache:'no-store',signal:c.signal,
   headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json','X-Bloccpay-Workspace-ID':bootstrap?.workspace.id??''})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(binary&&response.ok)return{body:new Blob([await response.arrayBuffer()]),sha256:response.headers.get('x-content-sha256')};
  const raw=await response.text();let value;
  try{value=JSON.parse(raw);}catch{throw Object.assign(new Error('The complete response could not be decoded. Keep the original request.'),{code:'RESPONSE_UNCERTAIN',status:response.status});}
  if(!response.ok)throw Object.assign(new Error(value.error?.message??'The original host rejected the request.'),value.error??{},{status:response.status});
  return value;
 }catch(error){if(!error.code)error.code='TRANSPORT_UNCERTAIN';throw error;}
 finally{controllers.delete(c);}
}
async function item(table,id,optional=false){
 try{return await api('/api/item?'+new URLSearchParams({table,id}));}
 catch(error){if(optional&&error.code==='RECORD_NOT_FOUND')return null;throw error;}
}
async function list(table){
 const result=[],seen=new Set();let cursor=null;
 do{
  const value=await api('/api/list?'+new URLSearchParams({table,limit:'500',...(cursor?{cursor}:{})}));
  need(Array.isArray(value.rows),'NATIVE_PAGE_REQUIRED');result.push(...value.rows);cursor=value.nextCursor;
  if(cursor){need(!seen.has(cursor),'NATIVE_CURSOR_CYCLE');seen.add(cursor);}
 }while(cursor);
 return result;
}
function selectedKey(){return bootstrap?'bloccpay.sdp-events.view.'+bootstrap.workspace.id:null;}
function saveView(){if(bootstrap)localStorage.setItem(selectedKey(),JSON.stringify({eventId:selected?.id??null,filter,page}));}
async function refresh({keep=true}={}){
 const next=await api('/api/bootstrap');
 need(!bootstrap||next.workspace.id===bootstrap.workspace.id,'WORKSPACE_CHANGED','This host now serves another workspace. Open its original workspace to continue retained work.');
 bootstrap=next;
 // Both complete paginations are awaited independently; no response is abandoned.
 events=(await list('webhooks')).filter(row=>row.provider==='sdp');
 nativeRequests=(await list('requests')).filter(row=>['webhook.project','webhook.reconcile','operation.reconcile'].includes(row.method));
 $('#workspace').textContent=next.workspace.name+' · '+next.workspace.id;
 $('#revision').textContent='Revision '+next.workspace.revision+' · '+(next.workspace.receivedFrom?'Received workspace':'Original workspace');
 $('#access').hidden=true;
 const saved=JSON.parse(localStorage.getItem(selectedKey())||'null');
 if(!keep&&saved){filter=saved.filter??'';page=Number.isSafeInteger(saved.page)?saved.page:0;$('#filter').value=filter;}
 const wanted=selected?.id??saved?.eventId;
 renderEvents();await renderRequests();
 if(wanted&&events.some(row=>row.id===wanted))await openEvent(wanted);
 else{$('#event').replaceChildren(text('p','Select an original signed event.'));selected=null;selectedOperation=null;}
 $('#desk').inert=closing;saveView();
}
function renderEvents(){
 const q=filter.toLowerCase(),found=events.filter(row=>[row.eventId,row.eventType,row.id,row.status,row.connectionAlias,row.readback?.status]
  .filter(Boolean).join(' ').toLowerCase().includes(q)).sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));
 const counts={total:events.length,complete:events.filter(x=>x.readback?.status==='COMPLETE').length,
  incomplete:events.filter(x=>x.readback?.status==='INCOMPLETE').length,conflicts:events.filter(x=>x.status==='CONFLICT').length};
 $('#counts').textContent=counts.total+' events · '+counts.complete+' complete readbacks · '+counts.incomplete+' incomplete · '+counts.conflicts+' conflicts';
 page=Math.min(Math.max(0,page),Math.max(0,Math.ceil(found.length/50)-1));
 $('#page').textContent=(page+1)+' / '+Math.max(1,Math.ceil(found.length/50));
 $('#previous').disabled=page===0;$('#next').disabled=(page+1)*50>=found.length;
 const host=$('#events');host.replaceChildren();
 for(const row of found.slice(page*50,page*50+50)){
  const a=document.createElement('article');a.className='event-row';a.dataset.eventId=row.id;
  if(row.id===selected?.id)a.dataset.selected='true';
  a.append(text('strong',row.eventType??'Rejected signed delivery'),text('span',row.readback?.status??row.status,'badge'),
   text('small',row.eventId??row.id,'mono'),text('small',row.connectionAlias+' · '+(row.createdAt??'')));
  a.append(button('Open event',()=>openEvent(row.id)));host.append(a);
 }
 if(!found.length)host.append(text('p','No retained SDP events match this view.'));
}
async function downloadFile(fileId,label,expected=null){
 need(typeof fileId==='string'&&fileId.startsWith('public-'),'PUBLIC_ORIGINAL_REQUIRED','Signed bodies remain in the private workspace delivery. This download requires an original public file.');
 const expectedSHA=expected??fileId.slice(7);
 need(/^[a-f0-9]{64}$/.test(expectedSHA),'ORIGINAL_FILE_HASH_REQUIRED');
 const value=await api('/api/file/'+encodeURIComponent(fileId),{binary:true});
 need(value.sha256===expectedSHA&&await fileHash(value.body)===expectedSHA,'ORIGINAL_DOWNLOAD_CHANGED');
 offer(value.body,label);
}
function offer(body,name){
 const url=URL.createObjectURL(body);urls.add(url);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);
 try{a.click();}finally{a.remove();}
}
function sourceCard(row){
 const d=document.createElement('article');d.className='source';d.dataset.sourceId=row.id;
 d.append(text('strong',row.kind),text('small',row.id,'mono'),text('p',(row.bodyComplete?'Complete response':'Incomplete response')+' · '+row.bytes+' bytes · HTTP '+(row.status??'—')),
  detail('Full original source identity',row));
 if(row.publicFileId)d.append(button('Download source observation',()=>downloadFile(row.publicFileId,'sdp-source-'+row.id+'.json')));
 if(row.downloadableFileId)d.append(button('Download original response',()=>downloadFile(row.downloadableFileId,row.downloadFileName??'sdp-response.json',row.bodySha256)));
 return d;
}
function operationCard(row,label){
 const d=document.createElement('section');d.className='operation';d.dataset.operationId=row.id;
 d.append(text('h3',label),text('p',row.state+' · '+row.action),text('small',row.id,'mono'),detail('Prepared request, source IDs and reconciliation',row));return d;
}
async function openEvent(id){
 const row=await item('webhooks',id);need(row.provider==='sdp','SDP_EVENT_REQUIRED');
 let operation=null,reconciled=null;const sources=[],versions=[];
 if(row.readback?.operationId)operation=await item('operations',row.readback.operationId,true);
 if(operation?.reconciliation?.operationId)reconciled=await item('operations',operation.reconciliation.operationId);
 const sourceIds=[...new Set([row.sourceId,...(operation?.sourceIds??[]),...(reconciled?.sourceIds??[]),...(row.readback?.sourceIds??[])].filter(Boolean))];
 for(const sourceId of sourceIds)sources.push(await item('sources',sourceId));
 for(const versionId of [...new Set(sources.flatMap(s=>s.versionIds??[]))])versions.push(await item('resourceVersions',versionId));
 // Adopt only after all selected original reads succeed.
 selected=row;selectedOperation=operation;
 const host=$('#event');host.replaceChildren(text('p',row.connectionAlias+' / '+(row.eventId??row.id),'eyebrow'),
  text('h2',row.eventType??'Rejected SDP delivery'),text('p',row.status+' · readback '+(row.readback?.status??'not admitted')),
  detail('Full retained event and reception history',row));
 if(row.eventKey)host.append(detail('Frozen tenant, source wallet and origin',row.eventKey));
 if(row.selection)host.append(detail('Original selected GET and source scope',row.selection));
 if(row.status==='CONFLICT'&&row.conflictsWith)host.append(button('Open accepted original event',()=>openEvent(row.conflictsWith)));
 for(const conflictId of row.conflictIds??[])host.append(button('Open conflict '+conflictId.slice(0,12),()=>openEvent(conflictId)));
 const admitted=row.verified===true&&row.status!=='CONFLICT'&&!row.conflictsWith;
 if(admitted&&row.readback?.status!=='COMPLETE'){
  if(!operation)host.append(button('Prepare first resource read',()=>prepare('webhook.project',row),'primary'));
  else if(operation.reconciliation)host.append(button('Prepare adoption of retained reconciliation',()=>prepare('webhook.reconcile',row),'primary'));
  else if(['PREPARED','DISPATCHING'].includes(operation.state))host.append(button('Prepare original read continuation',()=>prepare('webhook.project',row),'primary'));
  else host.append(text('p','The original observation is terminal and incomplete. An explicit reconciliation requests one new read-only GET.'));
  if(operation&&['ACCEPTED','REJECTED','UNCERTAIN','CANCELED'].includes(operation.state))
   host.append(button('Prepare explicit reconciliation GET',()=>prepare('operation.reconcile',row)));
 }
 if(operation)host.append(operationCard(operation,'Original GET'));
 if(reconciled)host.append(operationCard(reconciled,'Explicit reconciliation GET'));
 const responses=document.createElement('section');responses.append(text('h3','Original response sources'));
 for(const source of sources)responses.append(sourceCard(source));host.append(responses);
 if(versions.length)host.append(detail('Complete native resource versions',versions));
 const history=nativeRequests.filter(request=>request.args?.webhookId===row.id||
  [operation?.id,reconciled?.id].filter(Boolean).includes(request.args?.operationId));
 host.append(detail('Original native recovery request history',history));
 host.append(button('Download event and readback record',async()=>offer(new Blob([pretty({schema:'bloccpay.sdp-event-view.v1',
  workspace:bootstrap.workspace,event:row,operation,reconciliation:reconciled,sources,versions,requests:history})+'\n'],
  {type:'application/json'}),'sdp-event-'+row.id+'.json')));
 renderEvents();saveView();
}
async function unfinished(){
 const values=await rows();return values.filter(row=>UNFINISHED.has(row.status)||known.has(row.id));
}
async function prepare(method,event){
 need((await unfinished()).length===0,'ORIGINAL_REQUEST_PENDING','Use the original retained request below before preparing another recovery.');
 const current=await item('webhooks',event.id);
 need(current.provider==='sdp'&&current.verified&&current.status!=='CONFLICT'&&!current.conflictsWith,'SDP_EVENT_NOT_ADMITTED');
 need(current.selectionSha256===event.selectionSha256,'EVENT_SELECTION_CHANGED');
 let operation=null;
 if(current.readback?.operationId)operation=await item('operations',current.readback.operationId,true);
 if(method==='operation.reconcile'){
  need(operation&&operation.request?.mutation===false&&operation.request?.method==='GET'&&
   ['sdp.disbursement.get','sdp.distribution-wallet.get'].includes(operation.action),'ORIGINAL_SDP_GET_REQUIRED');
 }else if(method==='webhook.reconcile')need(operation?.reconciliation?.operationId,'RETAINED_RECONCILIATION_REQUIRED');
 const state=await api('/api/bootstrap');need(state.workspace.id===bootstrap.workspace.id,'WORKSPACE_CHANGED');bootstrap=state;
 proposal={workspaceId:state.workspace.id,eventId:current.id,eventOperationId:current.readback?.operationId??null,
  selectionSha256:current.selectionSha256,command:{requestId:crypto.randomUUID(),expectedRevision:state.workspace.revision,method,
   args:method==='operation.reconcile'?{operationId:operation.id}:{webhookId:current.id}}};
 $('#proposal').hidden=false;$('#proposal-title').textContent=method==='operation.reconcile'?'One explicit provider GET':
  method==='webhook.reconcile'?'Adopt the retained readback':'Continue the original resource read';
 $('#proposal-note').textContent=method==='operation.reconcile'?
  'This uses the original native operation.reconcile and selected tenant/wallet/resource. It can make one provider GET. It cannot change a balance, send a payment or repeat the original GET.':
  method==='webhook.reconcile'?'This selects the existing reconciliation record. It sends no provider request.':
  'This preserves the event’s original operation and dispatch IDs. A first read can issue the selected GET; a terminal original outcome is reused.';
 $('#proposal-body').textContent=pretty(proposal);$('#confirm').disabled=false;
}
function nativeMatches(row,native){
 need(native.id===row.id&&native.method===row.command.method&&
  canonical(native.args)===canonical(row.command.args)&&native.expectedRevision===row.command.expectedRevision,'ORIGINAL_NATIVE_REQUEST_CHANGED');
}
function resultMatches(row,result){
 need(result?.requestId===row.id&&result.workspaceId===row.workspaceId&&Number.isSafeInteger(result.revision),'ORIGINAL_RESULT_CHANGED');
 const value=result.result;
 if(row.command.method==='operation.reconcile')need(value?.id===row.eventOperationId,'ORIGINAL_RESULT_OPERATION_CHANGED');
 else need(value?.id===row.eventId,'ORIGINAL_RESULT_EVENT_CHANGED');
 return result;
}
async function accepted(row,response){
 const result={...row,status:'COMPLETE',response:copy(resultMatches(row,response)),error:null,updatedAt:new Date().toISOString()};
 known.set(row.id,result);adopt(result);
 const durable=await put(result);known.delete(row.id);return durable;
}
async function transmit(input){
 let row=await get(input.id)??input;validate(row);need(row.workspaceId===bootstrap.workspace.id,'WORKSPACE_CHANGED');
 if(known.has(row.id)){await put(known.get(row.id));known.delete(row.id);row=await get(row.id);}
 if(row.status==='COMPLETE'){showResult(row);return row;}
 const native=await item('requests',row.id,true);
 if(native){
  nativeMatches(row,native);
  if(native.status==='COMPLETE'){row=await accepted(row,native.result);showResult(row);return row;}
  if(native.status==='FAILED'){
   row=await put({...row,status:'REJECTED',error:native.error,updatedAt:new Date().toISOString()});
   showResult(row);throw Object.assign(new Error(native.error?.message??'The retained original native request failed.'),native.error??{});
  }
 }else need(row.status!=='REJECTED','REQUEST_REJECTED','Keep this rejected request. Refresh and explicitly prepare a new recovery.');
 row=await put({...row,status:'RUNNING',attempts:[...row.attempts,{at:new Date().toISOString()}],updatedAt:new Date().toISOString()});
 try{
  const response=await api('/api/command',{body:row.command});row=await accepted(row,response);showResult(row);return row;
 }catch(error){
  if(known.has(row.id)||memory.get(row.id)?.status==='COMPLETE')throw error;
  let status='UNCERTAIN';
  // A revision conflict is unlockable only after proving this request was not admitted.
  if(error.code==='REVISION_CONFLICT'){
   const observed=await item('requests',row.id,true);
   if(!observed)status='REJECTED';
   else{nativeMatches(row,observed);if(observed.status==='COMPLETE'){row=await accepted(row,observed.result);showResult(row);return row;}
    if(observed.status==='FAILED')status='REJECTED';}
  }
  await put({...row,status,error:cleanError(error),updatedAt:new Date().toISOString()});throw error;
 }
}
function showResult(row){$('#result').textContent=pretty(row);notice(row.status==='COMPLETE'?
 'Original request '+row.id+' completed at revision '+row.response.revision+'.':
 'Original request '+row.id+' remains '+row.status+'.');}
async function renderRequests(){
 const host=$('#requests');host.replaceChildren();
 for(const row of await rows()){
  const a=document.createElement('article');a.className='request';a.dataset.requestId=row.id;
  a.append(text('strong',row.command.method+' · '+row.status),text('small',row.id,'mono'),
   detail('Exact retained request, attempts and receipt',row));
  a.append(button(row.status==='COMPLETE'?'Open accepted receipt':'Reconcile / continue this exact request',async()=>{await transmit(row);await refresh();}));
  host.append(a);
 }
}
async function close(){
 if(closed)return{state:'CLOSED'};if(closePromise)return closePromise;closing=true;$('#desk').inert=true;
 const pending=(async()=>{
  for(const controller of controllers)controller.abort('event-inbox-closing');
  while(tasks.size)await Promise.allSettled([...tasks]);
  for(const [id,row]of [...known]){await put(row);known.delete(id);}
  if(bootstrap)saveView();
  let failure=null;for(const url of [...urls])try{URL.revokeObjectURL(url);urls.delete(url);}catch(e){failure??=e;}
  if(failure)throw failure;
  if(opening)await opening;database?.close();database=null;opening=null;closed=true;
  return{state:'CLOSED',workspaceId:bootstrap?.workspace.id??null};
 })();closePromise=pending;pending.catch(()=>{if(closePromise===pending)closePromise=null;});return pending;
}
$('#access').onsubmit=event=>{event.preventDefault();run(async()=>{
 token=String(new FormData(event.target).get('token')??'');sessionStorage.setItem('bloccpay.operator.token',token);await refresh({keep:false});
});};
$('#refresh').onclick=()=>run(()=>refresh());
$('#filter').oninput=event=>{if(closing||closed||busy)return;filter=event.target.value;page=0;renderEvents();try{saveView();}catch(e){report(e);}};
$('#previous').onclick=()=>run(async()=>{page--;renderEvents();saveView();});
$('#next').onclick=()=>run(async()=>{page++;renderEvents();saveView();});
$('#cancel-proposal').onclick=()=>{if(busy||closing)return;proposal=null;$('#proposal').hidden=true;};
$('#confirm').onclick=()=>run(async()=>{
 need(proposal,'EXPLICIT_RECOVERY_SELECTION_REQUIRED');const p=copy(proposal);
 const row={id:p.command.requestId,workspaceId:p.workspaceId,eventId:p.eventId,eventOperationId:p.eventOperationId,
  selectionSha256:p.selectionSha256,command:p.command,commandSha256:textHash(canonical(p.command)),status:'PENDING',
  attempts:[],response:null,error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 await put(row,{newAdmission:true});proposal=null;$('#proposal').hidden=true;await renderRequests();
 await transmit(row);await refresh();
});
$('#leave').onclick=()=>{if(busy)return;close().then(()=>location.assign('/')).catch(report);};
window.bloccpaySDPEvents={observe:()=>({workspaceId:bootstrap?.workspace.id??null,eventId:selected?.id??null,
 active:tasks.size,knownResults:known.size,closing,closed}),close};
addEventListener('beforeunload',event=>{if(tasks.size||known.size){event.preventDefault();event.returnValue='';}});
run(async()=>{
 await db();token=sessionStorage.getItem('bloccpay.operator.token')??'';
 const fragment=new URLSearchParams(location.hash.slice(1));
 if(fragment.has('token')){token=fragment.get('token');sessionStorage.setItem('bloccpay.operator.token',token);history.replaceState(null,'',location.pathname+location.search);}
 if(token)await refresh({keep:false});else notice('Enter the original operator token to read this workspace.');
});
