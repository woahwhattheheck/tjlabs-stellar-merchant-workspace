// MIT. Original workspace-bound Bridge review desk. No provider credential custody.
import {canonical,textHash,fileHash} from './journal.mjs';
const $=selector=>document.querySelector(selector),pretty=value=>JSON.stringify(value,null,2);
const copy=value=>JSON.parse(JSON.stringify(value)),split=value=>value.split(/[\r\n,]+/).map(x=>x.trim()).filter(Boolean);
const checked=(ok,code,message=code)=>{if(!ok)throw Object.assign(new Error(message),{code});};
let token=sessionStorage.getItem('bloccpay.operator.token')??'',state=null,preview=null,database=null,opening=null,closing=false,closed=false,closePromise=null,active=0;
const tasks=new Set(),controllers=new Set(),urls=new Set(),knownResults=new Map();
const selections={versions:new Set(),sources:new Set(),webhooks:new Set(),captures:new Set()};
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('token')){token=fragment.get('token');sessionStorage.setItem('bloccpay.operator.token',token);history.replaceState(null,'',location.pathname+location.search);}
function notice(value,error=false){$('#status').textContent=value;$('#status').dataset.error=String(error);}
function report(error){notice((error.code?error.code+': ':'')+(error.message??String(error)),true);}
function track(work) {
 checked(!closing&&!closed,'DESK_CLOSING');
 let promise;try{promise=Promise.resolve(work());}catch(error){promise=Promise.reject(error);}
 tasks.add(promise);promise.then(()=>tasks.delete(promise),()=>tasks.delete(promise));return promise;
}
function run(work) {
 return track(async()=>{
  checked(active===0,'DESK_BUSY','Wait for the original admitted operation to finish.');active++;
  document.body.dataset.working='true';$('#desk').inert=true;
  try{return await work();}finally{active--;document.body.dataset.working='false';$('#desk').inert=!state||closing;}
 }).catch(report);
}
function button(label,work){const value=document.createElement('button');value.type='button';value.textContent=label;value.className='secondary';value.onclick=()=>run(work);return value;}
function details(label,value){const box=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('pre');title.textContent=label;body.textContent=pretty(value);box.append(title,body);return box;}
async function db() {
 if(database)return database;
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open('bloccpay-bridge-intake-browser',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'id'});
  request.onerror=()=>reject(request.error);request.onblocked=()=>notice('Close the older Bridge tab to finish opening this same storage owner.',true);
  request.onsuccess=()=>{database=request.result;database.onversionchange=()=>{database.close();database=null;opening=null;};resolve(database);};
 }).catch(error=>{opening=null;throw error;});return opening;
}
async function transaction(mode,work) {
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction(['requests'],mode);let output;
  tx.oncomplete=()=>resolve(output);tx.onabort=()=>reject(tx.error??Object.assign(new Error('The original request could not be saved. Keep this tab open and retry.'),{code:'STORAGE_FAILED'}));
  tx.onerror=()=>{};try{work(tx.objectStore('requests'),value=>{output=value;});}catch(error){tx.abort();reject(error);}
 });
}
async function rows(){return transaction('readonly',(store,result)=>{const req=store.getAll();req.onsuccess=()=>result(req.result);});}
async function get(id){return transaction('readonly',(store,result)=>{const req=store.get(id);req.onsuccess=()=>result(req.result??null);});}
async function put(row) {
 checked(textHash(canonical(row.input))===row.inputSha256,'REQUEST_CHANGED');
 return transaction('readwrite',(store,result)=>{
  const request=store.get(row.id);request.onsuccess=()=>{
   const old=request.result;
   if(old&&old.inputSha256!==row.inputSha256){store.transaction.abort();return;}
   if(old?.status==='COMPLETE'&&row.status!=='COMPLETE'){result(old);return;}
   if(old?.status==='COMPLETE'&&row.status==='COMPLETE'&&canonical(old.response)!==canonical(row.response)){store.transaction.abort();return;}
   store.put(row);result(row);
  };
 });
}
async function api(path,{body,method=body===undefined?'GET':'POST',raw=false,headers={},binary=false}={}) {
 checked(!closing&&!closed,'DESK_CLOSING');
 checked(token,'OPERATOR_TOKEN_REQUIRED','Enter this workspace’s original operator token.');
 const controller=new AbortController();controllers.add(controller);
 try {
  const response=await fetch(path,{method,cache:'no-store',signal:controller.signal,
   headers:{Authorization:'Bearer '+token,...(method!=='GET'?{'X-Bloccpay-Workspace-ID':state?.workspace.id??''}:{}),
    ...(body!==undefined&&!raw?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
  if(binary&&response.ok)return {body:await response.blob(),sha256:response.headers.get('x-content-sha256')};
  const text=await response.text();let value;
  try{value=JSON.parse(text);}catch{throw Object.assign(new Error('The complete host response was not valid JSON.'),{code:'RESPONSE_UNCERTAIN',status:response.status});}
  if(!response.ok)throw Object.assign(new Error(value.error?.message??'The original host request failed.'),value.error??{},{status:response.status});
  return value;
 }catch(error){if(!error.code)error.code='TRANSPORT_UNCERTAIN';throw error;}
 finally{controllers.delete(controller);}
}
function draft() {
 const form=Object.fromEntries(new FormData($('#selection')).entries());
 form.selected={};for(const group of ['versions','sources','webhooks','captures'])form.selected[group]=[...selections[group]].sort();
 return form;
}
function saveDraft(){if(state)localStorage.setItem('bloccpay.bridge.draft.'+state.workspace.id,JSON.stringify(draft()));}
function applyDraft(value) {
 if(!value)return;for(const [key,item]of Object.entries(value)){if(key==='selected')continue;const input=$('#selection').elements.namedItem(key);if(input)input.value=item;}
 for(const [group,ids]of Object.entries(value.selected??{}))for(const input of document.querySelectorAll('input[data-group="'+group+'"]'))input.checked=ids.includes(input.value);
}
function binding() {
 const form=Object.fromEntries(new FormData($('#selection')).entries());
 return {connectionAlias:form.connectionAlias,environment:form.environment,sourceScope:form.sourceScope,developerId:form.developerId,
  customerIds:split(form.customerIds),virtualAccounts:JSON.parse(form.virtualAccounts||'[]')};
}
function renderInventory(saved) {
 const select=$('#selection').elements.connectionAlias,prior=saved?.connectionAlias??select.value;
 const aliases=[...new Set([...state.connections.map(x=>x.alias),...state.sources.map(x=>x.connectionAlias),...state.webhooks.map(x=>x.connectionAlias)])].filter(Boolean);
 select.replaceChildren(...aliases.map(alias=>{const option=document.createElement('option');option.value=alias;option.textContent=alias;return option;}));if(aliases.includes(prior))select.value=prior;
 for(const group of Object.keys(selections))selections[group]=new Set(saved?.selected?.[group]??[]);
 const host=$('#inventory');host.replaceChildren();
 for(const [group,label]of [['versions','Native resource versions'],['sources','Original response bodies'],['webhooks','Signed delivery attempts'],['captures','Retained capture coverage']]){
  const section=document.createElement('details'),title=document.createElement('summary');title.textContent=label+' · '+state[group].length;section.append(title);
  // Pagination affects presentation only; all selections remain in the full draft.
  let count=0;const list=document.createElement('div');section.append(list);
  const more=button('Show next 100',async()=>show());
  function show(){for(const row of state[group].slice(count,count+100)){
   const item=document.createElement('div');item.className='record';const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=row.id;input.dataset.group=group;
   input.checked=selections[group].has(row.id);input.onchange=()=>{if(input.checked)selections[group].add(row.id);else selections[group].delete(row.id);preview=null;$('#save').disabled=true;try{saveDraft();}catch(error){report(error);}};
   label.append(input,document.createTextNode([row.kind??row.eventType??row.action,row.state??row.status,row.id].filter(Boolean).join(' · ')));
   item.append(label,details('Original identity',row));
   if(group==='sources'||group==='webhooks')item.append(button('Download original body',()=>download('/api/bridge/original?'+new URLSearchParams({table:group,id:row.id}),'bridge-original-'+row.id+'.bin')));
   list.append(item);
  }count=Math.min(count+100,state[group].length);more.hidden=count>=state[group].length;}
  show();section.append(more);host.append(section);
 }
 applyDraft(saved);
}
async function refresh({restore=true}={}) {
 const value=await api('/api/bridge/intake');
 checked(!state||value.workspace.id===state.workspace.id,'WORKSPACE_CHANGED','The host now serves another workspace. Reload to select it; retained requests stay bound to their original workspace.');
 const saved=state?draft():restore?JSON.parse(localStorage.getItem('bloccpay.bridge.draft.'+value.workspace.id)||'null'):null;
 if(preview&&preview.document.workspace.revision!==value.workspace.revision){preview=null;$('#save').disabled=true;}
 state=value;$('#workspace').textContent=value.workspace.name+' · '+value.workspace.id;$('#revision').textContent='Revision '+value.workspace.revision;
 renderInventory(saved);
 if(!saved){const selected=value.sources.find(x=>x.connectionAlias===$('#selection').elements.connectionAlias.value);if(selected){$('#selection').elements.environment.value=selected.environment;$('#selection').elements.sourceScope.value=selected.sourceScope;}}
 await renderRequests();renderReviews();$('#access').hidden=true;$('#desk').inert=false;
 notice('Original retained workspace loaded. Provider delivery is evidence; a review decision does not authorize a balance credit.');
}
function showPreview(value) {
 checked(textHash(canonical(value.document))===value.previewSha256,'PREVIEW_HASH_MISMATCH');
 checked(textHash(pretty(value.document)+'\n')===value.documentSha256,'PREVIEW_FILE_HASH_MISMATCH');
 preview=copy(value);const host=$('#preview');host.replaceChildren();
 const heading=document.createElement('h3');heading.textContent=value.document.schema.endsWith('review.v1')?'Frozen source review':'Incident decision';host.append(heading);
 const note=document.createElement('p');note.textContent='Original workspace revision '+value.document.workspace.revision+' · '+value.documentSha256;host.append(note);
 for(const incident of value.document.incidents??[]){
  const item=document.createElement('article');item.className='incident';const h=document.createElement('strong');h.textContent=incident.code;
  const p=document.createElement('p');p.textContent=incident.severity+' · '+incident.target.table+' / '+incident.target.id;
  const id=document.createElement('small');id.className='mono';id.textContent=incident.id;item.append(h,p,id,details('Complete finding',incident));host.append(item);
 }
 host.append(details('Complete immutable review and evidence',value.document));$('#save').disabled=false;
}
async function prepare(kind,input,{file=null}={}) {
 checked(state,'WORKSPACE_REQUIRED');const id=crypto.randomUUID();
 const row={id,workspaceId:state.workspace.id,kind,input:copy(input),inputSha256:textHash(canonical(input)),file,
  fileSha256:file?await fileHash(file):null,status:'PENDING',attempts:[],response:null,error:null,createdAt:new Date().toISOString()};
 // The exact body and original File commit before any HTTP mutation is admitted.
 await put(row);return row;
}
function nativeArgs(row) {
 if(row.kind==='bridge'){
  const document=row.input.document,fileId='private-'+textHash(pretty(document)+'\n');
  return {fileId,bridgeIntake:{schema:'bloccpay.bridge-intake.v1',kind:document.schema.endsWith('review.v1')?'review':'decision',
   documentSha256:fileId.slice(8),selectionSha256:document.selectionSha256??document.review.selectionSha256,
   reviewRequestId:document.review?.requestId??null}};
 }
 if(row.kind==='import')return {...row.input.args,fileId:'private-'+row.fileSha256};
 return row.input.args;
}
function checkResponse(row,response) {
 checked(response?.requestId===row.id&&response.workspaceId===row.workspaceId&&Number.isSafeInteger(response.revision),'HOST_RESULT_IDENTITY_MISMATCH');return response;
}
async function transmit(original) {
 let row=await get(original.id)??original;
 checked(row.workspaceId===state.workspace.id&&textHash(canonical(row.input))===row.inputSha256,'REQUEST_CHANGED');
 if(row.file)checked(await fileHash(row.file)===row.fileSha256,'ORIGINAL_FILE_CHANGED');
 if(knownResults.has(row.id)){row=await put(knownResults.get(row.id));knownResults.delete(row.id);}
 if(row.status==='COMPLETE'){showResult(row.response);return row.response;}
 let native=null;try{native=await api('/api/item?'+new URLSearchParams({table:'requests',id:row.id}));}catch(error){if(error.code!=='RECORD_NOT_FOUND'&&error.status!==404)throw error;}
 const method=row.kind==='bridge'?'file.retain':row.kind==='import'?'source.import':row.input.method;
 if(native){
  checked(native.method===method&&canonical(native.args)===canonical(nativeArgs(row)),'NATIVE_REQUEST_CHANGED');
  if(native.status==='COMPLETE'){
   row={...row,status:'COMPLETE',response:checkResponse(row,native.result),error:null};knownResults.set(row.id,row);row=await put(row);knownResults.delete(row.id);showResult(row.response);return row.response;
  }
  if(native.status==='FAILED'){row={...row,status:'REJECTED',error:native.error};await put(row);throw Object.assign(new Error(native.error?.message??'The original request failed.'),native.error??{});}
 }
 checked(row.status!=='REJECTED','REQUEST_REJECTED','Keep the rejected request in history. Re-preview changed input and prepare a new explicit request.');
 row={...row,status:'RUNNING',attempts:[...row.attempts,{at:new Date().toISOString()}]};await put(row);
 try {
  let response;
  if(row.kind==='bridge')response=await api('/api/bridge/save',{body:{requestId:row.id,...row.input}});
  else if(row.kind==='import'){
   const args={requestId:row.id,expectedRevision:row.input.expectedRevision,filename:row.file.name,method:'source.import',...row.input.args};
   response=await api('/api/source-import?'+new URLSearchParams({args:JSON.stringify(args)}),{body:row.file,raw:true,headers:{'Content-Type':row.file.type||'application/octet-stream','X-Content-SHA256':row.fileSha256}});
  }else response=await api('/api/command',{body:{requestId:row.id,...row.input}});
  row={...row,status:'COMPLETE',response:checkResponse(row,response),error:null};knownResults.set(row.id,row);await put(row);knownResults.delete(row.id);
  showResult(response);return response;
 }catch(error){
  if(row.status!=='COMPLETE'){row={...row,status:error.status&&error.status<500&&![401,408,409,429].includes(error.status)?'REJECTED':'UNCERTAIN',error:{code:error.code,message:error.message}};await put(row);}
  throw error;
 }
}
function showResult(value){$('#result').textContent=pretty(value);notice('Original request '+value.requestId+' retained at revision '+value.revision+'.');}
async function renderRequests() {
 const host=$('#requests');host.replaceChildren();
 for(const row of (await rows()).filter(row=>row.workspaceId===state.workspace.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){
  const article=document.createElement('article'),title=document.createElement('strong');title.textContent=row.kind+' · '+row.status;
  const id=document.createElement('small');id.textContent=row.id;article.dataset.requestId=row.id;
  article.append(title,id,details('Original request, attempts and result',{...row,file:row.file?{name:row.file.name,bytes:row.file.size,sha256:row.fileSha256}:null}));
  article.append(button(row.status==='COMPLETE'?'Open accepted result':'Reconcile / continue same request',async()=>{await transmit(row);await refresh();}));
  host.append(article);
 }
}
function renderReviews() {
 const host=$('#reviews');host.replaceChildren();
 for(const row of state.reviews.slice().reverse()){
  const item=document.createElement('article'),title=document.createElement('strong');title.textContent=row.kind+' · '+row.status;
  const id=document.createElement('small');id.textContent=row.id;
  item.append(title,id,button('Open original record',async()=>{const result=await api('/api/bridge/reviews/'+encodeURIComponent(row.id));$('#result').textContent=pretty(result);if(result.document.schema.endsWith('review.v1'))$('#decision').elements.reviewRequestId.value=row.id;}),
   button('Download exact JSON',()=>download('/api/bridge/reviews/'+encodeURIComponent(row.id)+'/download','bridge-'+row.id+'.json')));host.append(item);
 }
}
async function download(path,filename) {
 const result=await api(path,{binary:true});
 checked(result.sha256&&await fileHash(result.body)===result.sha256,'DOWNLOAD_HASH_MISMATCH');
 const url=URL.createObjectURL(result.body);urls.add(url);const link=document.createElement('a');link.href=url;link.download=filename;link.click();
 // URL custody is retained until the next explicit desk close; no early revoke.
}
$('#access').onsubmit=event=>{event.preventDefault();run(async()=>{token=new FormData(event.target).get('token');sessionStorage.setItem('bloccpay.operator.token',token);await refresh();});};
$('#selection').oninput=()=>{preview=null;$('#save').disabled=true;try{saveDraft();}catch(error){report(error);}};
$('#selection').onsubmit=event=>{event.preventDefault();run(async()=>{
 saveDraft();const form=Object.fromEntries(new FormData(event.target)),selected=draft().selected;
 const selection={...binding(),versionIds:selected.versions,sourceIds:selected.sources,webhookIds:selected.webhooks,captureIds:selected.captures};
 showPreview(await api('/api/bridge/preview',{body:{expectedRevision:state.workspace.revision,selection,actor:form.actor,note:form.note,preparedAt:new Date().toISOString()}}));
});};
$('#decision').oninput=()=>{preview=null;$('#save').disabled=true;};
$('#decision').onsubmit=event=>{event.preventDefault();run(async()=>{
 const value=Object.fromEntries(new FormData(event.target));value.incidentIds=split(value.incidentIds);value.evidenceFileIds=split(value.evidenceFileIds);value.supersedes=value.supersedes||null;
 showPreview(await api('/api/bridge/decision-preview',{body:{...value,expectedRevision:state.workspace.revision,preparedAt:new Date().toISOString()}}));
});};
$('#save').onclick=()=>run(async()=>{
 checked(preview,'PREVIEW_REQUIRED');const selected=copy(preview);
 const record=await prepare('bridge',{expectedRevision:selected.document.workspace.revision,document:selected.document,expectedPreviewSha256:selected.previewSha256});
 $('#save').disabled=true;preview=null;await transmit(record);await refresh();
});
$('#capture').onsubmit=event=>{event.preventDefault();run(async()=>{
 const form=Object.fromEntries(new FormData(event.target)),input=JSON.parse(form.input);canonical(input);
 const record=await prepare('command',{expectedRevision:state.workspace.revision,method:'capture.start',args:{connectionAlias:binding().connectionAlias,action:form.action,input}});
 const result=await transmit(record);$('#continue').elements.captureId.value=result.result.id;await refresh();
});};
$('#continue').onsubmit=event=>{event.preventDefault();const mode=event.submitter?.value;run(async()=>{
 const form=Object.fromEntries(new FormData(event.target)),method=mode==='pause'?'capture.pause':'capture.run';
 const args={captureId:form.captureId,...(method==='capture.run'?{maxPages:Number(form.maxPages)}:{})};
 const record=await prepare('command',{expectedRevision:state.workspace.revision,method,args});await transmit(record);await refresh();
});};
$('#source-import').onsubmit=event=>{event.preventDefault();run(async()=>{
 const form=Object.fromEntries(new FormData(event.target)),file=form.file;checked(file instanceof File&&file.size>0,'ORIGINAL_FILE_REQUIRED');
 checked(String(form.action).startsWith('bridge.'),'BRIDGE_ACTION_REQUIRED');
 const args={connectionAlias:binding().connectionAlias,action:form.action,input:JSON.parse(form.input),status:Number(form.httpStatus),observedAt:form.observedAt,bodyComplete:true};
 const record=await prepare('import',{expectedRevision:state.workspace.revision,args},{file});await transmit(record);await refresh();
});};
$('#refresh').onclick=()=>run(()=>refresh());
function close(){
 if(closed)return Promise.resolve({state:'CLOSED'});if(closePromise)return closePromise;closing=true;$('#desk').inert=true;
 closePromise=(async()=>{
  for(const controller of controllers)controller.abort('desk-closing');
  while(tasks.size)await Promise.allSettled([...tasks]);
  for(const [id,row]of knownResults){await put(row);knownResults.delete(id);}
  if(state)saveDraft();for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  if(opening)await opening;database?.close();database=null;opening=null;closed=true;return {state:'CLOSED'};
 })();closePromise.catch(()=>{closePromise=null;});return closePromise;
}
// Explicit navigation drains this installed desk before leaving its origin/page.
// A failed storage close keeps the same owner available for another link attempt.
document.addEventListener('click',event=>{
 const link=event.target.closest?.('a[href]');
 if(!link||link.hasAttribute('download')||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const target=new URL(link.href,location.href);if(target.origin!==location.origin||link.target&&link.target!=='_self')return;
 event.preventDefault();
 close().then(()=>location.assign(target.href),report);
});
window.bloccpayBridge={observe:()=>({workspaceId:state?.workspace.id??null,revision:state?.workspace.revision??null,
 active,closing,closed,knownResults:knownResults.size}),close};
addEventListener('beforeunload',event=>{if(tasks.size||knownResults.size){event.preventDefault();event.returnValue='';}});
run(async()=>{await db();try{await refresh();}catch(error){$('#access').hidden=false;throw error;}});
