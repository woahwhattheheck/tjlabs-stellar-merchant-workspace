// SPDX-License-Identifier: MIT
import { escapeHtml as e, plan } from '/core.mjs';
const $=id=>document.getElementById(id),forms=['capture-form','review-form','batch-form','report-form','compare-form','query-form'];
let token=new URLSearchParams(location.hash.slice(1)).get('token')??sessionStorage.getItem('gleif-token')??'';
if(token){sessionStorage.setItem('gleif-token',token);history.replaceState(null,'',location.pathname);}
let state,workspaceId,instanceId,selectedCapture=null,offset=0,rows=null,detail=null,selected=new Map(),pending=null,polling=false,db,rowsRequest=0;
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').setAttribute('role',error?'alert':'status');};
async function api(path,{method='GET',body,raw=false}={}) {
  const response=await fetch(path,{method,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(instanceId&&response.headers.get('x-gleif-instance')!==instanceId)throw new Error('The original application instance changed. Reopen its current private URL.');
  if(!response.ok){let v;try{v=await response.json();}catch{}throw new Error(v?.message??'Request failed: '+response.status);}
  return raw?response.arrayBuffer():response.json();
}
async function database() {return new Promise((resolve,reject)=>{const request=indexedDB.open('stellar-forge-gleif',1);request.onupgradeneeded=()=>request.result.createObjectStore('work');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function stored(mode,value,slot='pending') {
  return new Promise((resolve,reject)=>{const tx=db.transaction('work',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('work'),key=workspaceId+'/'+slot;let result;
    const request=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value,key);
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('The saved request could not be retained.'));});
}
async function renderRequestHistory() {
  const prefix=workspaceId+'/request/';
  const keys=await new Promise((resolve,reject)=>{const tx=db.transaction('work','readonly'),req=tx.objectStore('work').getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  $('browser-requests').innerHTML=keys.length?keys.map(key=>'<article><code>'+e(key.slice(prefix.length))+'</code><button data-browser-request="'+e(key.slice(prefix.length))+'">Restore original request</button></article>').join(''):'<p>No original browser requests have been retained.</p>';
}
function chooseCapture(id){rowsRequest++;selectedCapture=id;offset=0;selected.clear();detail=null;$('detail').hidden=true;$('batch').hidden=true;}
function draftKey(id){return workspaceId+'/form/'+id;}
function saveDraft(form) {if(!workspaceId)return;const value=Object.fromEntries(new FormData(form));if(form.id==='report-form')value.captureIds=[...form.elements.captureIds.selectedOptions].map(v=>v.value);localStorage.setItem(draftKey(form.id),JSON.stringify(value));}
function restoreDraft(form){let value;try{value=JSON.parse(localStorage.getItem(draftKey(form.id))??'null');}catch{}if(!value)return;
  for(const [name,v]of Object.entries(value)){const field=form.elements.namedItem(name);if(!field)continue;if(field.multiple){for(const option of field.options)option.selected=Array.isArray(v)&&v.includes(option.value);}else field.value=v;}}
function options(select,items,defaultValue) {
  const values=select.multiple?[...select.selectedOptions].map(v=>v.value):[select.value||defaultValue];
  select.innerHTML=items.map(([value,text])=>'<option value="'+e(value)+'">'+e(text)+'</option>').join('');
  for(const option of select.options)option.selected=values.includes(option.value);
  if(!select.multiple&&!select.value&&select.options.length)select.options[0].selected=true;
}
async function refresh({loadRows=true}={}) {
  state=await api('/api/status');$('title').textContent=state.workspace.title;if(state.persistenceFailure)notice(state.persistenceFailure.message,true);
  const editions=state.captures;const complete=editions.filter(c=>c.state==='COMPLETE');
  $('captures').innerHTML=editions.length?editions.slice().reverse().map(c=>'<article class="'+(selectedCapture===c.id?'active':'')+'"><button data-capture="'+e(c.id)+'">'+e(c.plan.query)+'</button><p>'+e(c.state)+' · '+c.rows+' records · '+c.pages.length+' pages</p><small>'+e(c.id)+'</small>'+(c.error?'<p>'+e(c.error.message)+'</p>':'')+(c.state==='INTERRUPTED'&&c.next?'<button data-continue-capture="'+e(c.id)+'">Continue original pages</button>':'')+'</article>').join(''):'<p class="hint">No source editions have been captured.</p>';
  $('shortlist').innerHTML=state.reviews.length?state.reviews.map(r=>'<article><button data-review="'+e(r.id)+'">'+e(r.title)+'</button><p>'+e(r.decision)+' · '+e(r.reviewer)+' · revision '+r.version+'</p><small>'+e(r.lei)+'</small></article>').join(''):'<p class="hint">Company research decisions appear here.</p>';
  for(const select of document.querySelectorAll('.capture-select,.capture-multi'))options(select,complete.map(c=>[c.id,c.plan.query+' · '+c.createdAt+' · '+c.id]));
  $('reports').innerHTML=state.reports.map(r=>'<article><strong>'+e(r.title)+'</strong><p>'+r.records+' complete source records</p><div class="toolbar">'+r.files.map(file=>'<button data-file="'+file.sha256+'" data-name="'+e(file.name)+'">'+e(file.name)+'</button>').join('')+'</div></article>').join('');
  $('datasets').innerHTML=state.datasets.map(r=>'<article><strong>'+e(r.name)+'</strong><p>'+r.rows+' rows · native snapshot <small>'+e(r.snapshot)+'</small></p><code>'+e(r.relativeDirectory)+'</code><div class="toolbar">'+r.files.map(file=>'<button data-file="'+file.sha256+'" data-name="'+e(file.name)+'">'+e(file.name)+'</button>').join('')+'</div></article>').join('');
  options($('dataset-select'),state.datasets.map(d=>[d.id,d.name+' · '+d.id]));
  $('operations').innerHTML=state.operations.slice().reverse().map(op=>'<article><strong>'+e(op.action)+'</strong> · '+e(op.state)+'<p>'+e(op.id)+'</p>'+(op.error?'<p>'+e(op.error.message)+'</p>':'')+
    (op.state==='INTERRUPTED'?'<button data-resume="'+e(op.id)+'">Resume original request</button>':'')+'</article>').join('');
  if(!selectedCapture&&editions.length)selectedCapture=editions.at(-1).id;
  renderPending();if(selectedCapture&&loadRows)await loadEntityRows();
}
function renderPending() {
  $('pending').hidden=!pending&&!state?.active;$('pause').hidden=!['capture','capture.resume'].includes(state?.active?.action);
  $('resume').disabled=!!state?.active||!pending;$('dismiss').disabled=!!state?.active||!pending;
  $('pending-text').textContent=state?.active?state.active.action+' · '+state.active.id+' · running':pending?pending.action+' · '+pending.id:'';
}
async function loadEntityRows() {
  const captureId=selectedCapture,sequence=++rowsRequest;
  const incoming=await api('/api/captures/'+encodeURIComponent(captureId)+'/rows?'+new URLSearchParams({offset:String(offset),limit:'50',search:$('row-search').value}));
  if(sequence!==rowsRequest||selectedCapture!==captureId)return;rows=incoming;
  if(rows.issues?.length)notice(rows.issues[0].message,true);
  $('edition-title').textContent=rows.capture.plan.query;$('edition-meta').textContent=rows.capture.state+' · '+rows.total+' retained matching records · '+rows.capture.id;
  $('entity-rows').innerHTML=rows.items.map(item=>'<tr><td><input type="checkbox" data-select="'+e(item.row.lei)+'" '+(selected.has(item.row.lei)?'checked':'')+' aria-label="Select '+e(item.row.legalName)+'"></td><td><button data-entity="'+e(item.row.lei)+'">'+e(item.row.legalName)+'</button><small>'+e(item.row.lei)+'</small></td><td>'+e(item.row.legalJurisdiction)+'</td><td>'+e(item.row.entityStatus)+'</td><td>'+e(item.row.registrationStatus)+'</td><td>'+e(item.needsReview?'Source changed; review again':item.review?.decision??'Awaiting review')+'</td></tr>').join('');
  $('page-label').textContent=rows.total?(offset+1)+'–'+Math.min(offset+rows.items.length,rows.total)+' of '+rows.total:'0 records';
  $('previous').disabled=offset===0;$('next').disabled=rows.nextOffset===null;
}
function showDetail(item) {
  detail=item;$('detail').hidden=false;$('detail-title').textContent=item.row.legalName;
  const fields=['lei','entityStatus','registrationStatus','legalJurisdiction','legalAddress','headquartersAddress','nextRenewalDate','registrationAuthorityId','registrationAuthorityEntityId','relationshipReferences'];
  $('source-fields').innerHTML=fields.map(k=>'<div><strong>'+e(k)+'</strong>'+e(item.row[k])+'</div>').join('');
  $('resource').textContent=JSON.stringify(item.resource,null,2);
  const form=$('review-form'),review=item.review??state.reviews.filter(v=>v.lei===item.row.lei).at(-1);
  for(const name of ['decision','reviewer','rationale','useCase','nextWork'])form.elements[name].value=review?.[name]??(name==='decision'?'research':'');
  let draft;try{draft=JSON.parse(localStorage.getItem(workspaceId+'/review/'+item.row.lei)??'null');}catch{}
  if(draft)for(const[name,value]of Object.entries(draft))if(form.elements[name])form.elements[name].value=value;
  $('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
async function execute(request) {
  if(pending&&pending.id!==request.id)throw new Error('Continue the saved request before starting another operation.');
  pending=request;await stored('put',pending,'request/'+pending.id);await stored('put',pending);renderPending();await renderRequestHistory();
  await api('/api/start',{method:'POST',body:request});notice('Running '+request.action+'. The complete request is saved.');
  if(!polling)poll();
}
async function poll() {
  const id=pending?.id;if(!id)return;polling=true;
  try{
    while(pending?.id===id){
      const result=await api('/api/operations/'+encodeURIComponent(id));if(pending?.id!==id)break;
      await refresh();if(pending?.id!==id)break;
      if(result.state==='COMPLETE'){const action=pending.action;await stored('delete');pending=null;renderPending();notice('Completed '+action+'.');break;}
      if(result.state==='INTERRUPTED'){notice(result.error?.message??'The original request is ready to continue.',true);break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }catch(error){notice(error.message,true);}finally{polling=false;renderPending();if(pending&&pending.id!==id)poll();}
}
function request(action,input){return {id:crypto.randomUUID(),action,input,expectedRevision:state.revision};}
function researchInput(item,form) {
  const current=state.reviews.filter(r=>r.lei===item.row.lei).at(-1);
  return {id:current?.id??'lei-'+item.row.lei,title:item.row.legalName,captureId:item.row.captureId,lei:item.row.lei,expectedVersion:current?.version??0,...Object.fromEntries(new FormData(form))};
}
async function download(sha,name){const data=await api('/api/objects/'+sha,{raw:true}),url=URL.createObjectURL(new Blob([data]));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function run(fn){return async event=>{if(event?.type==='submit')event.preventDefault();try{await fn(event);}catch(error){notice(error.message,true);}};}
$('capture-form').onsubmit=run(async()=>{
  const value=Object.fromEntries(new FormData($('capture-form')));value.pageSize=Number(value.pageSize);value.country=value.country.toUpperCase();
  if(value.kind==='lei'){delete value.country;delete value.entityStatus;delete value.registrationStatus;}
  await execute(request('capture',{plan:plan(value)}));
});
$('source-import').onclick=run(async()=>{const file=$('source-file').files[0];if(!file)throw new Error('Choose the original source-response file.');const input=JSON.parse(await file.text());await execute(request('source.import',input));});
$('refresh').onclick=run(()=>refresh());
$('resume').onclick=run(async()=>{if(pending)await execute(pending);});
$('dismiss').onclick=run(async()=>{const original=pending;if(!original)return;await refresh({loadRows:false});if(state.active)throw new Error('Finish or pause the running project operation first.');if(pending?.id!==original.id)return;await stored('put',original,'request/'+original.id);await stored('delete');pending=null;renderPending();await renderRequestHistory();notice('The original request remains in browser and project history. Edit the form and start a new request.');});
$('browser-requests').onclick=run(async event=>{const button=event.target.closest('[data-browser-request]');if(!button)return;const saved=await stored('get',undefined,'request/'+button.dataset.browserRequest);if(saved)await execute(saved);});
$('pause').onclick=run(async()=>{if(state.active)await api('/api/pause/'+state.active.id,{method:'POST',body:{}});await refresh();});
$('previous').onclick=run(async()=>{offset=Math.max(0,offset-50);await loadEntityRows();});
$('next').onclick=run(async()=>{if(rows.nextOffset!==null){offset=rows.nextOffset;await loadEntityRows();}});
let searchTimer;$('row-search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;loadEntityRows().catch(error=>notice(error.message,true));},250);};
$('captures').onclick=run(async event=>{const continuation=event.target.closest('[data-continue-capture]');if(continuation){const id=continuation.dataset.continueCapture;if(pending&&(pending.id===id||pending.input?.captureId===id))await execute(pending);else await execute(request('capture.resume',{captureId:id}));return;}const button=event.target.closest('[data-capture]');if(!button)return;chooseCapture(button.dataset.capture);await refresh();});
$('shortlist').onclick=run(async event=>{const button=event.target.closest('[data-review]');if(!button)return;const review=state.reviews.find(r=>r.id===button.dataset.review);chooseCapture(review.captureId);$('row-search').value=review.lei;await refresh();const item=rows.items.find(r=>r.row.lei===review.lei);if(item)showDetail(item);});
$('entity-rows').onclick=run(async event=>{const entity=event.target.closest('[data-entity]');if(entity)showDetail(rows.items.find(r=>r.row.lei===entity.dataset.entity));
  const checkbox=event.target.closest('[data-select]');if(checkbox){const item=rows.items.find(r=>r.row.lei===checkbox.dataset.select);if(checkbox.checked)selected.set(item.row.lei,item);else selected.delete(item.row.lei);}});
$('source-download').onclick=run(async()=>{if(detail)await download(rows.capture.pages[detail.page-1].sha256,'gleif-'+selectedCapture+'-page-'+detail.page+'.json');});
$('review-form').onsubmit=run(async()=>{if(!detail)return;await execute(request('review.save',researchInput(detail,$('review-form'))));});
$('review-selected').onclick=run(async()=>{if(!selected.size)throw new Error('Select companies from the retained source table.');$('batch').hidden=false;$('batch-label').textContent=selected.size+' selected companies from '+selectedCapture;$('batch').scrollIntoView({behavior:'smooth'});});
$('batch-form').onsubmit=run(async()=>{await execute(request('review.batch',{items:[...selected.values()].map(item=>researchInput(item,$('batch-form')))}));});
$('compare-form').onsubmit=run(async()=>{const values=Object.fromEntries(new FormData($('compare-form'))),result=await api('/api/compare?'+new URLSearchParams(values));
  $('comparison').innerHTML='<p>'+result.counts.added+' added · '+result.counts.missing+' absent from the later search · '+result.counts.changed+' changed · '+result.counts.unchanged+' unchanged</p>'+
    result.changed.map(c=>'<details><summary>'+e(c.legalName)+' · '+e(c.lei)+' · '+c.fields.length+' changed fields</summary><pre>'+e(JSON.stringify(c.fields,null,2))+'</pre></details>').join('')+
    '<details><summary>Complete comparison and original records</summary><pre>'+e(JSON.stringify(result,null,2))+'</pre></details>';});
function reportInput(){const form=$('report-form');return {title:form.elements.title.value,captureIds:[...form.elements.captureIds.selectedOptions].map(v=>v.value),selection:form.elements.selection.value};}
$('report-form').onsubmit=run(()=>execute(request('report.prepare',reportInput())));
$('dataset-prepare').onclick=run(async()=>{const input=reportInput();await execute(request('dataset.prepare',{...input,name:input.title}));});
$('query-form').onsubmit=run(async()=>{const form=$('query-form');const value=await api('/api/datasets/'+encodeURIComponent(form.elements.dataset.value)+'/query?'+form.elements.query.value);$('query-result').textContent=JSON.stringify(value,null,2);});
for(const id of ['reports','datasets'])$(id).onclick=run(async event=>{const b=event.target.closest('[data-file]');if(b)await download(b.dataset.file,b.dataset.name);});
$('operations').onclick=run(async event=>{const b=event.target.closest('[data-resume]');if(!b)return;const op=await api('/api/operations/'+b.dataset.resume);await execute({id:op.id,action:op.action,input:op.input});});
$('export').onclick=run(async()=>{const file=await api('/api/package-file',{method:'POST',body:{}});await download(file.sha256,file.name);notice('Complete project exported. Use gleif receive to open it in an independent private directory.');});
for(const id of forms){const form=$(id);form.addEventListener('input',()=>{saveDraft(form);if(id==='review-form'&&detail)localStorage.setItem(workspaceId+'/review/'+detail.row.lei,JSON.stringify(Object.fromEntries(new FormData(form))));});}
async function start(){
  const identity=await api('/api/identity');workspaceId=identity.workspaceId;instanceId=identity.instanceId;db=await database();pending=await stored('get')??null;
  await refresh();await renderRequestHistory();for(const id of forms)restoreDraft($(id));
  if(pending){try{const result=await api('/api/operations/'+pending.id);if(result.state==='COMPLETE'){await stored('delete');pending=null;renderPending();}else if(result.state==='RUNNING')poll();}catch{}}
  notice('Saved company research is ready.');
}
start().catch(error=>notice(error.message,true));
