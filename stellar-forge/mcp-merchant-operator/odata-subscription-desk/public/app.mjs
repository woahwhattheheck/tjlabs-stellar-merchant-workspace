// SPDX-License-Identifier: MIT
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=v=>JSON.stringify(v,null,2),short=v=>v?String(v).slice(0,14)+'…':'—';
let token='',state=null,customer=null,profile='',pane='overview',pageOffset=0,nav=0,busy=false,storageReady=false,storageError=null,pending=null,scope=null,dbPromise=null,detail=null;
let rowRequestId=null;let formSelection=null,rowsPage=null,historyPage=null,editionPage=null;
const message=(text,error=false)=>{ $('#message').textContent=text;$('#message').classList.toggle('error',error);};
function db(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((ok,fail)=>{const r=indexedDB.open('starforge-odata-customer-desk',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('requests');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);r.onblocked=()=>fail(new Error('Close another older desk tab before opening request storage.'));});
 dbPromise.catch(()=>{dbPromise=null;});return dbPromise;
}
async function stored(key){const database=await db();return new Promise((ok,fail)=>{const tx=database.transaction('requests'),r=tx.objectStore('requests').get(key);r.onsuccess=()=>ok(r.result??null);r.onerror=()=>fail(r.error);});}
async function persist(key,value){const database=await db();return new Promise((ok,fail)=>{const tx=database.transaction('requests','readwrite'),object=tx.objectStore('requests');value===null?object.delete(key):object.put(value,key);tx.oncomplete=ok;tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error);});}
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error?.message??'The original operation did not return a successful response.'),{code:value.error?.code,status:response.status,details:value.error});return value;
}
function query(path,params={}){const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null));return path+'?'+q.toString();}
function controls(){
 const locked=busy||!storageReady||!!pending||!!state?.pending;
 $$('#content [data-mutate],#fields input,#fields select,#fields textarea,#submit-action').forEach(el=>el.disabled=locked);
 $('#profile').disabled=busy;$('#refresh').disabled=busy;$('#dismiss').disabled=busy;$('#cancel-form').disabled=busy;
 renderPending();
}
function renderPending(){
 const box=$('#pending');box.hidden=storageReady&&!pending&&!state?.pending;
 if(box.hidden)return;
 if(!storageReady){box.innerHTML='<strong>Original request storage is not ready</strong><p>'+esc(storageError??'Reading the saved request for this exact customer desk…')+'</p><button id="retry-storage">Retry original request read</button>';
 $('#retry-storage').onclick=()=>loadScope();return;}
 const request=pending?.request??state?.pending?.request,error=state?.pending?.error;
 box.innerHTML='<strong>Continue the original '+esc(request?.action??'customer')+' request</strong><p class="code">'+esc(request?.requestId??'')+'</p>'+
 '<p>'+esc(error?.message??(state?.active?'The original native operation is active. Refresh its saved status before any continuation.':'Its exact saved body and original edition remain selected.'))+'</p>'+
 '<button id="retry-request">Resume this request</button><button id="inspect-request" class="secondary">Inspect original request</button><button id="export-request" class="secondary">Save request JSON</button>';
 $('#retry-request').disabled=busy||!!state?.active;
 $('#retry-request').onclick=()=>resumeOriginal().catch(e=>message(e.message,true));
 $('#inspect-request').onclick=()=>showDetail(pending??state.pending);
 $('#export-request').onclick=()=>saveJson(request,'original-customer-request.json');
}
async function loadScope(){
 if(!state)return;const selected=location.origin+'|'+state.id,generation=++nav;scope=selected;storageReady=false;storageError=null;pending=null;controls();
 try{const value=await stored(selected);if(scope!==selected||generation!==nav)return;pending=value;storageReady=true;storageError=null;
  if(pending){const r=await api(query('/api/request',{id:pending.request.requestId})).catch(e=>e.status===404||e.code==='ENOENT'?null:Promise.reject(e));
   if(scope!==selected||generation!==nav)return;
   if(r?.state==='COMPLETE'&&JSON.stringify(r.request)===JSON.stringify(pending.request)){await persist(selected,null);if(scope!==selected||generation!==nav)return;pending=null;}
  }
 }catch(e){if(scope!==selected||generation!==nav)return;storageReady=false;storageError=e.message;}
 controls();await render();
}
async function refresh(){
 const next=await api('/api/state');const oldId=state?.id;state=next;
 if(!profile||!state.profiles.some(p=>p.id===profile))profile=state.profiles[0].id;
 $('#profile').innerHTML=state.profiles.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+'</option>').join('');$('#profile').value=profile;
 if(oldId!==state.id||scope!==location.origin+'|'+state.id){await loadScope();return;}
 customer=(await api(query('/api/customer',{profile}))).customer;controls();await render();
}
async function login(){
 token=$('#token').value.trim()||token;await api('/api/session',{});
 $('#login').hidden=true;$('#workspace').hidden=false;$('#token').value='';await refresh();
}
function showDetail(value){detail=value;$('#detail-text').textContent=pretty(value);$('#detail').showModal();}
function saveJson(value,filename){const url=URL.createObjectURL(new Blob([pretty(value)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function nativeSummary(){
 $('#edition-summary').innerHTML=customer?'<strong>Received edition '+esc(customer.revision)+'</strong><br><span class="muted">'+esc(customer.rows)+' complete rows · '+esc(short(customer.editionSha256))+'</span>':'<strong>No received baseline</strong><br><span class="muted">Review a published edition to begin.</span>';
}
function profileValue(){return state.profiles.find(p=>p.id===profile);}
function rowTable(items){
 const columns=[...new Set(items.flatMap(row=>Object.keys(row.values??row)))];
 return '<div class="table-wrap"><table><thead><tr>'+columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+
 items.map(row=>'<tr>'+columns.map(c=>'<td>'+esc(typeof(row.values??row)[c]==='object'?JSON.stringify((row.values??row)[c]):(row.values??row)[c])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function pages(value){
 return '<div class="pagination"><span>'+esc(value.offset+1)+'–'+esc(value.offset+value.items.length)+' of '+esc(value.total)+'</span><button class="secondary" id="previous" '+(value.offset===0?'disabled':'')+'>Previous</button><button class="secondary" id="next" '+(value.nextOffset===null?'disabled':'')+'>Next</button></div>';
}
function bindPages(value){$('#previous')?.addEventListener('click',()=>{pageOffset=Math.max(0,pageOffset-(pane==='editions'?50:pane==='rows'?100:30));render();});$('#next')?.addEventListener('click',()=>{pageOffset=value.nextOffset;render();});}
function noteField(label='Reason or receiving note'){return '<label>'+esc(label)+'<textarea name="note" required maxlength="4000"></textarea></label>';}
function openForm(action,title,fields,base={}){
 if(!storageReady||pending||state?.pending||busy){message('Complete the original pending request or request-storage read first.',true);return;}
 formSelection={action,profile,base};$('#dialog-title').textContent=title;$('#fields').innerHTML=fields;$('#dialog').showModal();controls();
}
async function submitAction(request){
 if(!storageReady||scope!==location.origin+'|'+state.id)throw new Error('Wait for the exact original request storage.');
 const selectedScope=scope,entry={request,body:JSON.stringify(request),savedAt:new Date().toISOString()};
 await persist(selectedScope,entry);pending=entry;controls();return sendOriginal(entry,selectedScope);
}
async function sendOriginal(entry,selectedScope){
 busy=true;controls();message('Running the selected original operation…');
 try{
  const result=await api('/api/actions',entry.body);
  if(!result.request||JSON.stringify(result.request)!==entry.body)throw new Error('The response does not bind this exact original request.');
  if(scope===selectedScope&&pending?.request.requestId===entry.request.requestId){await persist(selectedScope,null);pending=null;}
  message('Original '+entry.request.action+' completed at desk revision '+result.committedRevision+'.');
  if($('#dialog').open)$('#dialog').close();formSelection=null;
  await refresh();showDetail(result);
 }catch(e){
  const rejected=e.details?.requestNotSelected===true&&e.details.requestId===entry.request.requestId;
  if(rejected&&scope===selectedScope&&pending?.request.requestId===entry.request.requestId){
   // Preserve the authored body and explicit no-selection response before
   // clearing only this active slot. The same form remains available to correct.
   await persist(selectedScope+'|rejected|'+entry.request.requestId,{...entry,rejection:e.details});
   await persist(selectedScope,null);pending=null;
  }
  message((e.code?e.code+': ':'')+e.message+(rejected?' No request was selected; correct the retained form.':' The original request remains selected.'),true);
  await refresh().catch(()=>{});throw e;
 }
 finally{busy=false;controls();}
}
async function resumeOriginal(){
 if(!storageReady||busy||state?.active)throw new Error('Inspect the original active operation and wait for storage readiness.');
 if(!pending){if(!state?.pending)throw new Error('There is no pending operation.');const request=state.pending.request;await persist(scope,{request,body:JSON.stringify(request),savedAt:new Date().toISOString()});pending=await stored(scope);}
 return sendOriginal(pending,scope);
}
async function render(){
 if(!state)return;const generation=++nav,selectedProfile=profile,selectedPane=pane;const content=$('#content');nativeSummary();
 $$('nav [data-pane]').forEach(b=>b.setAttribute('aria-current',b.dataset.pane===pane?'page':'false'));
 content.innerHTML='<div class="panel">Reading the original '+esc(pane)+'…</div>';controls();
 try{
  if(!customer||customer.profile!==profile){const v=await api(query('/api/customer',{profile}));if(generation!==nav)return;customer=v.customer;nativeSummary();}
  if(pane==='overview'){
   const p=profileValue();content.innerHTML='<div class="cards"><section class="card"><h3>Current edition</h3><div class="number">'+esc(customer?.revision??'—')+'</div><p class="muted">Original received edition</p></section>'+
    '<section class="card"><h3>Complete rows</h3><div class="number">'+esc(customer?.rows??'—')+'</div><p class="muted">Native receiver verified</p></section>'+
    '<section class="card"><h3>Retained transfers</h3><div class="number">'+esc(customer?.transfers?.length??0)+'</div><p class="muted">Original receiving history</p></section></div>'+
    '<section class="panel"><h2>'+esc(p.label)+'</h2><dl class="definition"><dt>Merchant endpoint</dt><dd>'+esc(p.url)+'</dd><dt>Publisher</dt><dd>'+esc(p.publisher)+'</dd><dt>Edition SHA</dt><dd class="code">'+esc(customer?.editionSha256??'No baseline received')+'</dd><dt>Definition SHA</dt><dd class="code">'+esc(customer?.definitionSha256??'—')+'</dd></dl><div class="actions"><button id="browse-editions">Review published editions</button><button id="inspect-customer" class="secondary">Inspect complete customer</button></div></section>'+
    '<section class="panel"><h2>Your next recurring delivery</h2><p>Choose an actual published edition and review its retained source and query. Continue from this customer’s saved edition, or receive an older baseline in a separate historical customer. A valid unchanged edition may contain zero change events.</p><p>Receiving preserves exact Decimal and Int64 values, source nulls and the complete native chain. Source membership removals are shown with their original query context.</p></section>';
   $('#browse-editions').onclick=()=>selectPane('editions');$('#inspect-customer').onclick=()=>showDetail(customer);
  }else if(pane==='editions'){
   editionPage=await api(query('/api/editions',{profile,offset:pageOffset,limit:50}));if(generation!==nav)return;
   content.innerHTML='<div class="panel"><h2>Published editions</h2><p>Select an immutable edition from the original merchant. Review its source, field mapping and query scope before receiving.</p><button class="secondary" id="publisher-detail">Inspect publisher & definition</button></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Edition</th><th>Original source</th><th>Counts & scope</th><th>Selection</th></tr></thead><tbody>'+
    editionPage.items.map((e,i)=>'<tr><td><strong>'+esc(e.revision)+'</strong><br><code>'+esc(short(e.manifestSha256))+'</code></td><td>'+esc(e.source?.collection??e.source?.id??e.source?.entitySet??'Original source retained')+'<br><span class="muted">'+esc(e.note??'')+'</span></td><td>'+esc(e.rows??e.counts?.rows??'See full edition')+' rows<br>'+esc(JSON.stringify(e.changes??e.counts??{}))+'</td><td><button class="small secondary" data-edition-detail="'+i+'">Inspect full edition</button> <button class="small" data-mutate data-review-edition="'+i+'">Review receiving</button></td></tr>').join('')+'</tbody></table></div>'+pages(editionPage);
   $('#publisher-detail').onclick=async()=>{try{showDetail(await api(query('/api/publisher',{profile})));}catch(e){message(e.message,true);}};
   $$('[data-edition-detail]').forEach(b=>b.onclick=()=>showDetail(editionPage.items[Number(b.dataset.editionDetail)]));
   $$('[data-review-edition]').forEach(b=>b.onclick=()=>{const e=editionPage.items[Number(b.dataset.reviewEdition)];openForm('review','Review edition '+e.revision,
    '<p class="code">'+esc(e.manifestSha256)+'</p><label>Receiving mode<select name="mode">'+(!customer?'<option value="baseline">First full baseline</option>':e.revision>customer.revision?'<option value="continue">Continue saved edition '+customer.revision+'</option>':'')+'<option value="historical">Independent historical customer</option></select></label>'+noteField('Source and scope review'),
    {toRevision:e.revision,expectedEditionSha256:e.manifestSha256});});
   bindPages(editionPage);
  }else if(pane==='rows'){
   if(!customer&&!rowRequestId){content.innerHTML='<div class="panel empty">Receive a full baseline before reading customer rows.</div>';return;}
   rowsPage=await api(query('/api/rows',{profile,offset:pageOffset,limit:100,restoredRequestId:rowRequestId}));if(generation!==nav)return;
   content.innerHTML='<div class="panel"><h2>'+esc(rowRequestId?'Independent received customer rows':'Current customer rows')+'</h2><p>Edition '+esc(rowsPage.revision)+' · '+esc(rowsPage.total)+' complete rows · <span class="code">'+esc(rowsPage.editionSha256)+'</span></p><p class="muted">This is one page of the complete saved native customer. Use Backups & delivery to retain every original row and its receiving history.</p></div>'+rowTable(rowsPage.items)+pages(rowsPage);
   bindPages(rowsPage);
  }else{
   historyPage=await api(query('/api/history',{profile,offset:pageOffset,limit:30}));if(generation!==nav)return;
   const items=pane==='outputs'?historyPage.items.filter(r=>['backup','analysis','restore','package','mapping'].includes(r.request.action)):historyPage.items;
   content.innerHTML=(pane==='outputs'?'<section class="panel"><h2>Backups & customer delivery</h2><p>Create a complete native backup or Analysis source, restore it independently, or package every original output file with the installed source. Completed outputs stay bound to their selected edition.</p><div class="actions"><button id="backup" data-mutate>Back up current customer</button><button id="analysis" data-mutate>Export Analysis source</button><button id="mapping" data-mutate class="secondary">Registered-source mapping</button></div></section>':'<section class="panel"><h2>Requests & customer reviews</h2><p>Each selection retains its original body, merchant binding, result and recovery state. A saved review precedes receiving.</p></section>')+
    (items.length?items.map((r,i)=>'<section class="panel"><span class="badge '+(r.state!=='COMPLETE'?'warn':'')+'">'+esc(r.state)+'</span><h3>'+esc(r.request.action)+' · '+esc(r.request.requestId)+'</h3><p>'+esc(r.createdAt)+' · '+esc(r.result?.note??r.result?.title??'')+'</p><div class="actions"><button class="secondary small" data-request-detail="'+i+'">Complete record</button>'+
    (r.state==='COMPLETE'&&r.request.action==='review'?'<button data-mutate data-receive="'+i+'">Receive this reviewed edition</button>':'')+
    (r.state==='COMPLETE'&&['receive','restore'].includes(r.request.action)?'<button data-mutate data-accept="'+i+'">Record customer review</button>':'')+
    (r.state==='COMPLETE'&&(r.request.action==='restore'||(r.request.action==='receive'&&r.result.mode==='historical'))?'<button data-restored-rows="'+i+'" class="secondary">Read independent customer rows</button>':'')+
    (r.state==='COMPLETE'&&['backup','analysis'].includes(r.request.action)?'<button data-mutate data-restore="'+i+'">Restore independently</button><button data-mutate data-package="'+i+'">Package complete output + source</button>':'')+'</div>'+
    (r.result?.files?'<ul class="file-list">'+r.result.files.map(f=>'<li><a href="'+esc(query('/api/file',{requestId:r.request.requestId,path:f.path,sha256:f.sha256}))+'" download>'+esc(f.path)+'</a><small>'+esc(f.bytes)+' bytes · '+esc(short(f.sha256))+'</small></li>').join('')+'</ul>':'')+
    (r.result?.packet?'<p><a href="'+esc(query('/api/file',{requestId:r.request.requestId,path:r.result.packet.filename,sha256:r.result.packet.sha256}))+'" download>Download complete customer/source package</a></p><p class="code">'+esc(r.result.packet.sha256)+'</p>':'')+'</section>').join(''):'<section class="panel empty">No matching completed records on this history page.</section>')+pages(historyPage);
   $$('[data-request-detail]').forEach(b=>b.onclick=()=>showDetail(items[Number(b.dataset.requestDetail)]));
   $$('[data-restored-rows]').forEach(b=>b.onclick=()=>{rowRequestId=items[Number(b.dataset.restoredRows)].request.requestId;selectPane('rows',true);});
   $$('[data-receive]').forEach(b=>b.onclick=()=>{const r=items[Number(b.dataset.receive)];openForm('receive','Receive reviewed edition '+r.result.toRevision,'<p>'+esc(r.result.mode)+' · From '+esc(r.result.fromRevision)+' to '+esc(r.result.toRevision)+'</p>'+noteField(),{reviewRequestId:r.request.requestId});});
   $$('[data-restore]').forEach(b=>b.onclick=()=>{const r=items[Number(b.dataset.restore)];openForm('restore','Independently restore native output',noteField(),{exportRequestId:r.request.requestId});});
   $$('[data-package]').forEach(b=>b.onclick=()=>{const r=items[Number(b.dataset.package)];if(!state.sourceManifest){message('Restart this installed desk with its complete source manifest to package source.',true);return;}openForm('package','Package complete original output','<p>Every native output member and every selected installed source file will be retained. The package can be independently inspected and received.</p><p class="code">Source '+esc(state.sourceManifest.sha256)+'</p>',{exportRequestId:r.request.requestId,expectedSourceSha256:state.sourceManifest.sha256});});
   $$('[data-accept]').forEach(b=>b.onclick=()=>{const r=items[Number(b.dataset.accept)];openForm('accept','Record customer review','<label>Decision<select name="decision"><option value="accepted">Accepted</option><option value="changes-requested">Changes requested</option></select></label>'+noteField('Customer findings'),{receivingRequestId:r.request.requestId});});
   for(const action of ['backup','analysis'])if($('#'+action))$('#'+action).onclick=()=>{if(!customer){message('Receive a complete baseline first.',true);return;}openForm(action,action==='backup'?'Back up complete customer':'Export complete Analysis source','<label>Output title<input name="title" required maxlength="160" value="'+esc((profileValue().label+' · edition '+customer.revision).slice(0,160))+'"></label>',{expectedRevision:customer.revision,expectedEditionSha256:customer.editionSha256});};
   if($('#mapping'))$('#mapping').onclick=()=>{if(!customer){message('Receive a complete baseline first.',true);return;}openForm('mapping','Generate the actual registered-source mapping','<label>Registered Analysis source alias<input name="source" required pattern="[A-Za-z][A-Za-z0-9_-]{0,63}"></label><label>Actual registered source revision<input name="sourceRevision" type="number" min="1" required></label>',{expectedRevision:customer.revision,expectedEditionSha256:customer.editionSha256});};
   bindPages(historyPage);
  }
  if(generation!==nav||profile!==selectedProfile||pane!==selectedPane)return;controls();
 }catch(e){if(generation!==nav)return;content.innerHTML='<section class="panel"><h2>Original data could not be read</h2><p>'+esc(e.message)+'</p></section>';message(e.message,true);controls();}
}
function selectPane(value,keepIndependent=false){if(!keepIndependent)rowRequestId=null;pane=value;pageOffset=0;render();}
$('#login-form').onsubmit=e=>{e.preventDefault();login().catch(err=>{$('#login').hidden=false;message(err.message,true);});};
$('#profile').onchange=()=>{profile=$('#profile').value;rowRequestId=null;customer=null;pageOffset=0;render();};
$('#refresh').onclick=()=>refresh().catch(e=>message(e.message,true));
$$('[data-pane]').forEach(b=>b.onclick=()=>selectPane(b.dataset.pane));
$('#cancel-form').onclick=$('#dismiss').onclick=()=>{if(!busy){$('#dialog').close();formSelection=null;}};
$('#close-detail').onclick=()=>$('#detail').close();$('#save-detail').onclick=()=>saveJson(detail,'customer-record.json');
$('#action-form').onsubmit=e=>{e.preventDefault();if(!formSelection||busy)return;
 const selection=formSelection,payload={...selection.base,...Object.fromEntries(new FormData(e.target))};
 if(payload.sourceRevision!==undefined)payload.sourceRevision=Number(payload.sourceRevision);
 submitAction({requestId:'desk-'+crypto.randomUUID(),expectedRevision:state.revision,action:selection.action,profile:selection.profile,payload}).catch(()=>{});
};
window.odataCustomerDesk=Object.freeze({inspect:()=>({deskId:state?.id??null,profile,revision:state?.revision??null,pane,scope,storageReady,storageError,busy,
 pending:pending?{requestId:pending.request.requestId,action:pending.request.action,expectedRevision:pending.request.expectedRevision}:null})});
const hash=new URLSearchParams(location.hash.slice(1));token=hash.get('token')??'';
if(token){history.replaceState(null,'',location.pathname+location.search);login().catch(e=>message(e.message,true));}
