// MIT. Original Grafana delivery desktop/mobile workflow and same-request recovery.
const $=id=>document.getElementById(id),BASE='/api/grafana-delivery',SOURCE='/api/commissioning/source-bundles';
const S={host:null,db:null,case:null,tasks:[],source:null,inspection:null,review:null,result:null,busy:false,pending:null,historyOffset:0};
const status=(message,error=false)=>{$('status').textContent=message;$('status').dataset.error=String(error);};
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function facts(target,rows){$(target).innerHTML=rows.map(([k,v])=>'<dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd>').join('');}
function table(heads,rows){return '<table><thead><tr>'+heads.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(x=>'<tr>'+x.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
async function request(url,body,method){
 const response=await fetch(url,{method:method??(body===undefined?'GET':'POST'),
   ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 let value;try{value=await response.json();}catch{throw new Error('The original response was incomplete. Reconcile the same retained request.');}
 if(!response.ok){const e=new Error(typeof value.detail==='string'?value.detail:'The original request did not complete.');e.native=value;e.status=response.status;throw e;}
 return value;
}
async function dbOpen(){
 return new Promise((done,reject)=>{const r=indexedDB.open('merchant-grafana-delivery-v1',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('requests',{keyPath:'key'});
 r.onerror=()=>reject(r.error);r.onsuccess=()=>done(r.result);});
}
async function retain(value){
 const row={...structuredClone(value),key:S.host.workspaceId+':'+value.id,workspaceId:S.host.workspaceId};
 await new Promise((done,reject)=>{const t=S.db.transaction('requests','readwrite');t.objectStore('requests').put(row);
 t.oncomplete=done;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('The browser could not retain the original request.'));});
 const read=await get(row.id);if(!same(read,row))throw new Error('The browser did not retain the exact original request.');
 return row;
}
async function get(id){return new Promise((done,reject)=>{const r=S.db.transaction('requests').objectStore('requests').get(S.host.workspaceId+':'+id);r.onsuccess=()=>done(r.result);r.onerror=()=>reject(r.error);});}
async function all(){return new Promise((done,reject)=>{const r=S.db.transaction('requests').objectStore('requests').getAll();r.onsuccess=()=>done(r.result.filter(x=>x.workspaceId===S.host.workspaceId));r.onerror=()=>reject(r.error);});}
async function bound(){
 const now=await request(BASE+'/config');
 if(now.workspaceId!==S.host.workspaceId)throw new Error('The original workspace changed. Reopen its page before continuing.');
}
function controls(){
 for(const el of document.querySelectorAll('button,input,select,textarea'))el.disabled=S.busy||el.dataset.allowed==='false';
 $('apply').disabled=S.busy||!S.review||!$('confirm').checked||S.review.selection.caseId!==S.case?.id;
 $('review').disabled=S.busy||!S.inspection||!S.case;
 $('reopen').disabled=S.busy||S.result?.state!=='COMPLETE';
}
async function work(fn){
 if(S.busy)return;S.busy=true;controls();
 try{await bound();await fn();}
 catch(e){status(e.message,true);}
 finally{S.busy=false;controls();await showPending().catch(()=>{});}
}
function invalidate(){S.review=null;$('confirm').checked=false;$('review-panel').hidden=true;controls();}
function invalidateSource(){invalidate();S.source=null;S.inspection=null;$('inspection').hidden=true;$('operations').replaceChildren();$('tasks').replaceChildren();controls();}
async function loadCases(){
 let offset=0,rows=[];
 for(;;){const page=await request('/api/cases?limit=200&offset='+offset);rows.push(...page.cases);
  if(page.nextOffset===null||page.nextOffset===undefined)break;if(page.nextOffset<=offset)throw new Error('Case list did not advance.');offset=page.nextOffset;}
 const old=S.case?.id;$('case').replaceChildren(new Option('Choose an existing case',''),...rows.map(row=>new Option(row.name||row.id,row.id)));
 if(old&&rows.some(x=>x.id===old))$('case').value=old;
}
async function openCase(id){
 invalidate();S.case=null;S.tasks=[];S.inspection=null;S.source=null;S.result=null;
 $('inspection').hidden=true;$('result').hidden=true;$('transfer').value='';
 if(!id){facts('case-facts',[]);return;}
 const original=await request('/api/cases/'+encodeURIComponent(id));
 const overview=await request('/api/cases/'+encodeURIComponent(id)+'/implementation');
 let offset=0,tasks=[];
 for(;;){const p=await request('/api/cases/'+encodeURIComponent(id)+'/implementation?section=tasks&limit=200&offset='+offset);
  if(p.case.revision!==original.revision)throw new Error('The case changed while opening its tasks. Refresh this case.');
  tasks.push(...p.rows);if(p.nextOffset===null)break;offset=p.nextOffset;}
 if(overview.case.revision!==original.revision)throw new Error('The case changed. Open its current saved revision.');
 S.case={id,revision:original.revision,name:original.name??original.metadata?.merchant??id};S.tasks=tasks;
 facts('case-facts',[['Case',S.case.id],['Saved revision',S.case.revision],['Active implementation tasks',tasks.filter(x=>!x.retired&&x.status!=='retired').length]]);
 $('case').value=id;S.historyOffset=0;await history(false);controls();
}
async function command(p,action,input){
 const id=p.id,requestId=id+'.'+action,body={id,requestId,action,input};
 p.commands??={};
 if(p.commands[action]&&!same(p.commands[action],body))throw new Error('The retained source command belongs to different original input.');
 p.commands[action]=body;await retain(p);
 let native=null;
 try{native=await request(SOURCE+'/command?'+new URLSearchParams({id,requestId}));}
 catch(e){if(e.native?.error!=='SF49_DELIVERY_COMMAND_NOT_FOUND')throw e;}
 if(native){
  if(!same(native.request.input,input)||native.request.action!==action)throw new Error('The native command input differs from this browser request.');
  if(native.state==='COMPLETE')return native.result;
  if(native.state==='RUNNING')return waitCommand(id,requestId);
  await request(SOURCE+'/command',{...body,continue:true});
 }else await request(SOURCE+'/command',body);
 return waitCommand(id,requestId);
}
async function waitCommand(id,requestId){
 for(let i=0;i<120;i++){
  const value=await request(SOURCE+'/command?'+new URLSearchParams({id,requestId}));
  if(value.state==='COMPLETE')return value.result;
  if(value.state!=='RUNNING')throw new Error(value.error?.message??'Inspect and resume the original source command.');
  await new Promise(done=>setTimeout(done,500));
 }
 throw new Error('The original source remains active. Resume this same transfer to read its result.');
}

async function reconcileRejectedSource(p){
 const saved=p.commands?.begin;if(!saved)return false;
 let native;
 try{native=await request(SOURCE+'/command?'+new URLSearchParams({id:p.id,requestId:saved.requestId}));}
 catch{return false;}
 const reasons=new Set(['Attach the original runtime support capture before preparing its source delivery',
   'Save the original owner terms in this case']);
 if(native.state!=='FAILED'||!same(native.request,{schema:'stellar-forge.sf49.source-delivery-command.v1',...saved})||native.error?.code!=='INVALID_SOURCE_CASE_INPUT'||
   !reasons.has(native.error?.message))return false;
 try{await request(SOURCE+'/transfer?id='+encodeURIComponent(p.id));return false;}
 catch(e){if(e.native?.error!=='SF49_DELIVERY_NOT_FOUND')return false;}
 p.state='REJECTED';p.rejection={command:native,reason:native.error.message,observedAt:new Date().toISOString()};
 await retain(p);return true;
}
async function reconcileRejectedDelivery(p,error){
 if(error.status!==409||error.native?.error!=='CASE_CONFLICT'||error.native?.requestState!=='UNKNOWN'||
    typeof error.native?.detail!=='string'||!error.native.detail)return false;
 const native=await request(BASE+'/status?'+new URLSearchParams({caseId:p.caseId,requestId:p.id}));
 if(native.schema!=='stellar-forge.grafana-case-delivery-result.v1'||native.state!=='NOT_STARTED'||
    native.caseId!==p.caseId||native.requestId!==p.id)return false;
 const current=await request('/api/cases/'+encodeURIComponent(p.caseId));
 if(current.id!==p.caseId||current.revision===p.body.selection.expectedRevision)return false;
 p.state='REJECTED';p.rejection={error:error.native,status:error.status,native,currentRevision:current.revision,
   observedAt:new Date().toISOString()};await retain(p);invalidate();return true;
}

async function prepareSource(existing=null){
 if(!S.case)throw new Error('Open an existing Support case first.');
 const file=$('archive').files[0];
 let p=existing;
 if(!p){
  const pending=(await all()).find(r=>r.kind==='source'&&r.caseId===S.case.id&&!['SOURCE_READY','COMPLETE','REJECTED'].includes(r.state));
  if(pending)throw new Error('Resume the retained source request '+pending.id+' before starting another upload.');
  if(!file||file.size<=0||file.size>S.host.archiveBytes)throw new Error('Choose the complete native handover ZIP, at most 8 GiB.');
  const actor=$('actor').value.trim();if(!actor||new TextEncoder().encode(actor).length>200)throw new Error('Enter the receiving operator using at most 200 UTF-8 bytes.');
  p={id:'grafana-'+uuid(),kind:'source',caseId:S.case.id,caseRevision:S.case.revision,actor,
    file:{name:file.name,bytes:file.size,lastModified:file.lastModified},createdAt:new Date().toISOString(),state:'PREPARED'};
  await retain(p);
 }
 if(p.state==='REJECTED')throw new Error('This original source input was rejected. Review the current case and deliberately prepare a new source.');
 if(p.caseId!==S.case.id)throw new Error('Open the original saved case for this source request.');
 invalidateSource();S.pending=p;$('transfer').value=p.id;
 const input={id:p.id,kind:'source',caseId:p.caseId,caseRevision:p.caseRevision,label:'Grafana native handover',
   actor:p.actor,files:[{id:'grafana',name:'Grafana_Handover.zip',role:'grafana-target-handover',bytes:String(p.file.bytes),sha256:null}]};
 status('Retaining original source inputs and the complete native handover…');
 try{await command(p,'begin',input);}catch(e){
  if(await reconcileRejectedSource(p))throw new Error('The original case revision lacks required runtime support or owner terms. Its rejection is retained. Save those inputs in the case, refresh, then prepare a new source.');
  throw e;
 }
 let transfer=await request(SOURCE+'/transfer?id='+encodeURIComponent(p.id));
 if(!transfer.files.find(x=>x.id==='grafana')?.present){
  if(!file||file.size!==p.file.bytes||file.name!==p.file.name||file.lastModified!==p.file.lastModified)
    throw new Error('Select the same original handover file to continue its unfinished upload.');
  const response=await fetch(SOURCE+'/upload?'+new URLSearchParams({id:p.id,file:'grafana'}),
    {method:'PUT',headers:{'content-type':'application/octet-stream'},body:file});
  const value=await response.json();if(!response.ok)throw new Error(value.detail??'The retained upload needs its same-file continuation.');
 }
 await command(p,'prepare',{id:p.id});
 p.state='SOURCE_READY';await retain(p);
 await inspectTransfer(p.id);
}
async function inspectTransfer(id){
 if(!S.case)throw new Error('Select the original receiving case.');
 invalidateSource();
 const transfer=await request(SOURCE+'/transfer?id='+encodeURIComponent(id));
 const member=transfer.descriptor?.files.find(f=>f.role==='grafana-target-handover');
 if(!member)throw new Error('Prepare the complete native Grafana source attachment in this transfer first.');
 const result=await request(BASE+'/inspect',{transferId:id,memberPath:member.path});
 S.source=result.source;S.inspection=result.inspection;$('transfer').value=id;
 facts('inspection-facts',[['Project',result.inspection.project.name],['Original archive SHA256',result.source.sha256],
   ['Target integration',result.inspection.integration_id],['Original prepared time',result.inspection.prepared_at],
   ['Project revision',result.inspection.project.revision],['History revisions verified',result.inspection.project.history_count],
   ['Source editions verified',result.inspection.source_editions.length],['Pending target jobs',result.inspection.receiving_state.pending_target_jobs],
   ['Unresolved native actions',result.inspection.receiving_state.unresolved_target_actions]]);
 $('operations').innerHTML=table(['Select','Operation','Stream','Status'],result.inspection.operations.map(r=>[
  '<input type="checkbox" data-operation="'+escape(r.id)+'" data-allowed="'+String(r.selected)+'" '+(r.selected?'':'disabled')+'>',
  escape(r.id),escape(r.stream),escape(r.status)]));
 $('tasks').innerHTML=table(['Select','Task','Acceptance definition'],S.tasks.filter(t=>!t.retired&&t.status!=='retired').map(t=>[
  '<input type="checkbox" data-task="'+escape(t.id)+'">',escape(t.title),escape(t.acceptance)]));
 $('inspection').hidden=false;
 for(const el of document.querySelectorAll('[data-task],[data-operation]'))el.addEventListener('change',invalidate);
 status('Complete native source inspected. Select the implementation tasks and original operations to review.');
}
async function review(){
 if(!S.case||!S.source)throw new Error('Inspect the original source first.');
 const pending=(await all()).find(r=>r.kind==='delivery'&&r.caseId===S.case.id&&!['COMPLETE','REJECTED'].includes(r.state));
 if(pending)throw new Error('Reconcile the retained attachment '+pending.id+' before reviewing another request.');
 invalidate();
 const input={transferId:S.source.transferId,memberPath:S.source.path,caseId:S.case.id,expectedRevision:S.case.revision,
  requestId:'grafana-delivery-'+uuid(),actor:$('actor').value.trim(),recordedAt:new Date().toISOString(),
  taskIds:[...document.querySelectorAll('[data-task]:checked')].map(x=>x.dataset.task),
  operationIds:[...document.querySelectorAll('[data-operation]:checked')].map(x=>x.dataset.operation),
  notes:$('notes').value,privateScopeAcknowledged:$('private').checked};
 const value=await request(BASE+'/review',input);
 S.review=value;$('review-panel').hidden=false;$('confirm').checked=false;
 $('review-summary').textContent='Case '+value.selection.caseId+' · '+value.selection.taskIds.length+' tasks · '+value.selection.operationIds.length+' selected operations';
 $('review-changes').textContent='The native workorder will add '+value.selection.workorderChanges.added.length+
  ' tasks and update '+value.selection.workorderChanges.changed.length+' source task records; existing local task edits remain under original source-change review.';
 $('review-json').textContent=JSON.stringify(value.selection,null,2);
 status('Review the full private source and original workorder changes, then confirm this exact case attachment.');
}
function showResult(value){
 S.result=value;$('result').hidden=false;
 $('result-steps').replaceChildren(...Object.entries(value.steps??{}).map(([k,v])=>{const e=document.createElement('span');e.textContent=k+': '+(v?'retained':'pending');return e;}));
 facts('result-facts',[['State',value.state],['Local case',value.caseId],['Original source case',value.sourceCaseId??value.selection?.caseId],
  ['Delivery request',value.requestId],['Source edition',value.editionId],['Customer acceptance',value.customerAcceptance]]);
}
async function apply(existing=null){
 let p=existing;
 if(p?.state==='REJECTED')throw new Error('This original input was rejected before attachment. Review the current case with new input.');
 if(!p){
  if(!S.review||!$('confirm').checked||S.review.selection.caseId!==S.case?.id)throw new Error('Confirm this exact selected case review.');
  p={id:S.review.selection.requestId,kind:'delivery',caseId:S.case.id,state:'PREPARED',
    body:{selection:S.review.selection,reviewSha256:S.review.reviewSha256},createdAt:S.review.selection.recordedAt};
  await retain(p);S.pending=p;
 }
 if(p.caseId!==S.case?.id)throw new Error('Open this pending request’s original case.');
 // Always replay the exact original input, even if status already reports
 // complete: native request hashing is the authority for lost-response recovery.
 p.state='UNCERTAIN';await retain(p);status('Attaching through the original source and case commands…');
 let value;
 try{value=await request(BASE+'/apply',p.body);}catch(e){
  if(await reconcileRejectedDelivery(p,e))throw new Error('The original request was rejected before any case attachment because the saved case advanced. The exact rejection is retained. Refresh the case and review a new request.');
  throw e;
 }
 if(value.requestId!==p.id||value.caseId!==p.caseId||value.reviewSha256!==p.body.reviewSha256)
   throw new Error('The original delivery response has a different identity.');
 showResult(value);
 p.state=value.state;p.result=value;
 try{await retain(p);}catch(e){status('The native result was received, but browser storage did not retain it. Reconcile this same request. '+e.message,true);return;}
 status(value.state==='COMPLETE'?'Original source, task links and readable inspection are saved in the case.':'The original case retains accepted steps. Continue the same delivery.');
 await history(false);
}
async function history(append){
 if(!S.case)return;
 const page=await request(BASE+'/history?'+new URLSearchParams({caseId:S.case.id,offset:append?S.historyOffset:0,limit:50}));
 if(!append)$('history').replaceChildren();
 for(const row of page.rows){
  const box=document.createElement('p'),b=document.createElement('button');b.type='button';b.className='secondary';
  b.textContent=row.requestId+' · '+row.state+' · '+row.recordedAt;
  b.addEventListener('click',()=>work(async()=>{invalidate();const value=await request(BASE+'/status?'+new URLSearchParams({caseId:S.case.id,requestId:row.requestId}));
    showResult(value);status('Opened the exact retained delivery. Original source case '+value.selection.caseId+'.');}));
  box.append(b);$('history').append(box);
 }
 S.historyOffset=page.nextOffset;$('more-history').hidden=page.nextOffset===null;
}
async function showPending(){
 if(!S.db||!S.host)return;
 const rows=(await all()).filter(r=>r.state!=='COMPLETE'&&r.state!=='SOURCE_READY');$('pending').replaceChildren();
 for(const row of rows){
  const block=document.createElement('p'),button=document.createElement('button');button.className='secondary';
  button.textContent=row.kind+' · '+row.id+' · '+row.state;
  button.addEventListener('click',()=>work(async()=>{await openCase(row.caseId);S.pending=row;
    if(row.state==='REJECTED'){status('Original rejection retained: '+(row.rejection.reason??row.rejection.error?.detail??'The source case advanced')+'. Review the current case before new input.');return;}
    if(row.kind==='source'){await prepareSource(row);}else{S.review=row.body;await apply(row);}}));
  block.append(button);$('pending').append(block);
 }
 if(!rows.length)$('pending').textContent='No incomplete request is retained by this browser.';
}
$('case').addEventListener('change',()=>work(()=>openCase($('case').value)));
$('refresh').addEventListener('click',()=>work(async()=>{await loadCases();if(S.case)await openCase(S.case.id);}));
$('upload').addEventListener('click',()=>work(()=>prepareSource()));
$('resume-source').addEventListener('click',()=>work(async()=>{const p=await get($('transfer').value.trim());if(!p||p.kind!=='source')throw new Error('Choose the retained source request from Browser recovery.');await prepareSource(p);}));
$('open-transfer').addEventListener('click',()=>work(()=>inspectTransfer($('transfer').value.trim())));
$('review').addEventListener('click',()=>work(review));
$('confirm').addEventListener('change',controls);
$('apply').addEventListener('click',()=>work(()=>apply()));
$('resume-delivery').addEventListener('click',()=>work(async()=>{if(!S.pending||S.pending.kind!=='delivery')throw new Error('Choose the original attachment request from Browser recovery.');await apply(S.pending);}));
$('reopen').addEventListener('click',()=>work(async()=>{if(!S.result||S.result.caseId!==S.case?.id)throw new Error('Open the saved delivery for this case first.');
 const result=await request(BASE+'/reopen',{caseId:S.result.caseId,requestId:S.result.requestId});showResult(result);status('Complete original source reopened and independently inspected. Later local case history is preserved.');}));
$('more-history').addEventListener('click',()=>work(()=>history(true)));
for(const id of ['actor','notes','private'])$(id).addEventListener('input',invalidate);
for(const id of ['archive','transfer'])$(id).addEventListener('input',invalidateSource);
(async()=>{
 try{S.host=await request(BASE+'/config');S.db=await dbOpen();await loadCases();await showPending();status('Choose the saved implementation case and its complete native Grafana handover.');controls();}
 catch(e){status(e.message,true);for(const el of document.querySelectorAll('button,input,select,textarea'))el.disabled=true;}
})();
