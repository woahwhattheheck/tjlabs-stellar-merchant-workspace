// SPDX-License-Identifier: MIT
// The original host owns all operations. Page load only reads its retained state.
const $=id=>document.getElementById(id),esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const short=v=>v?String(v).slice(0,12):'—',size=n=>Number(n).toLocaleString()+' B',pretty=v=>JSON.stringify(v,null,2),uuid=()=>crypto.randomUUID();
let state=null,identity=null,token='',busy=0,contractDraft=null,requestPreview=null,sourcePreview=null,quotaPreview=null,reportPage=null,comparison=null,nativeState=null,nativeRecovery=null,buyerPreview=null,projectPreview=null,selectedUpload=null;
let sourceEpoch=0,reportEpoch=0,comparisonEpoch=0,projectEpoch=0,contractEpoch=0;
const contracts=new Map(),requests=new Map(),savedDisabled=new Map();
function notice(text,error=false){$('notice').textContent=text;$('notice').dataset.error=String(error);}
function show(value){$('result').textContent=pretty(value);$('last-result').hidden=false;$('last-result').open=true;}
function displayValue(value){if(!value||typeof value!=='object')return value;const copy=structuredClone(value);if(copy.payload?.bodyBase64)copy.payload.bodyBase64='[Exact original body retained with this request; omitted from this display.]';return copy;}
function check(ok,message){if(!ok)throw Error(message);}
function controls(active){if(active){if(busy++===0)for(const b of document.querySelectorAll('[data-mutation]')){savedDisabled.set(b,b.disabled);b.disabled=true;}}
 else if(--busy===0){for(const[b,disabled]of savedDisabled)b.disabled=disabled;savedDisabled.clear();}}
function on(id,fn){$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>notice(e.message,true)));}
function submit(id,fn){$(id).addEventListener('submit',event=>{event.preventDefault();Promise.resolve().then(fn).catch(e=>notice(e.message,true));});}
function tab(id){for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-current',b.dataset.tab===id?'page':'false');for(const panel of document.querySelectorAll('.panel'))panel.hidden=panel.id!=='panel-'+id;}
$('navigation').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)tab(b.dataset.tab);});
async function api(path,{method='GET',body,raw=false}={}){
 check(token,'Open the private URL printed by the original host.');
 const response=await fetch(path,{method,cache:'no-store',redirect:'error',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(identity)check(response.headers.get('x-pirate-instance')===identity.instanceId,'The original listener changed. Open its current private connection.');
 if(raw)return response;const text=await response.text();check(text.length<=32*1024*1024,'Read a paged original response.');let value;
 try{value=JSON.parse(text);}catch{throw Error('The original host did not return a complete JSON response. Preserve the request UUID.');}
 if(!response.ok)throw Object.assign(Error(value.message??value.error??'The original request did not complete.'),{code:value.error,status:response.status,operationId:value.operationId});
 return value;
}
const read=(method,input={})=>api('/api/read',{method:'POST',body:{method,input}});
const database=new Promise((yes,no)=>{const q=indexedDB.open('pirate-weather-original-requests',1);q.onupgradeneeded=()=>q.result.createObjectStore('requests',{keyPath:'key'});q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);});
database.catch(()=>{});
async function remember(value){
 const db=await database;const row={...structuredClone(value),key:identity.workspaceId+':'+value.operationId,workspaceId:identity.workspaceId};
 await new Promise((yes,no)=>{const t=db.transaction('requests','readwrite');t.objectStore('requests').put(row);t.oncomplete=yes;t.onabort=()=>no(t.error??Error('The original request could not be saved locally.'));t.onerror=()=>{};});
 requests.set(row.operationId,row);renderLocal();
}
async function loadLocal(){
 const db=await database,rows=await new Promise((yes,no)=>{const q=db.transaction('requests').objectStore('requests').getAll();q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);});
 requests.clear();for(const r of rows)if(r.workspaceId===identity.workspaceId)requests.set(r.operationId,r);renderLocal();
}
async function perform(action,payload){
 check(state&&!busy,'Wait for the current submitted operation.');controls(true);
 const request={operationId:uuid(),expectedRevision:state.revision,action,payload:structuredClone(payload)},saved={operationId:request.operationId,request,status:'PREPARED',preparedAt:new Date().toISOString()};
 try{
  await remember(saved);notice('Original request '+request.operationId+' is retained. '+action+' is in progress.');
  let response;
  try{response=await api('/api/action',{method:'POST',body:request});}
  catch(error){try{await remember({...saved,status:'ACKNOWLEDGEMENT_UNRESOLVED',error:{code:error.code??null,message:error.message},at:new Date().toISOString()});}catch{}
   $('request-id').value=request.operationId;notice(error.message+'\nOriginal UUID: '+request.operationId+'. Read its retained request before continuing.',true);throw error;}
  show(response);notice('Accepted '+action+' at workspace revision '+response.revision+'. Original UUID: '+request.operationId+'.');
  try{await remember({...saved,status:'ACCEPTED',response,at:new Date().toISOString()});}catch{notice('The original host accepted '+request.operationId+'. The browser acknowledgement could not be saved; recover this same UUID from the server.',true);}
  try{await refresh();}catch(error){notice('The original host accepted '+request.operationId+'. Saved result is above. Refresh failed: '+error.message,true);}
  return response;
 }finally{controls(false);eligibility();}
}
function select(id,items,chosen=null,empty='Select an original retained item'){
 const el=$(id),old=chosen??el.value;el.innerHTML='<option value="">'+esc(empty)+'</option>'+items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
 if(items.some(x=>x.id===old))el.value=old;
}
function table(headers,rows){return rows.length?'<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p class="empty">No retained entries.</p>';}
function fileMarkup(file){return '<div class="file"><strong>'+esc(file.filename)+'</strong><p>'+esc(size(file.bytes))+' · '+esc(file.role??file.type??'original output')+'</p><p class="code">'+esc(file.sha256)+'</p><button data-download="'+esc(file.id)+'">Download exact file</button></div>';}
function filesInto(id,files){$(id).innerHTML=files.length?'<div class="files">'+files.map(fileMarkup).join('')+'</div>':'<p class="empty">No original output files retained for this selection.</p>';}
function list(items,render){return items.length?items.map(render).join(''):'<p class="empty">No retained entries.</p>';}
async function contract(id){check(id,'Select a retained contract edition.');if(!contracts.has(id))contracts.set(id,await read('contract',{id}));return contracts.get(id);}
async function refresh(){
 const next=await api('/api/state');check(next.workspaceId===identity.workspaceId,'The original workspace identity changed.');state=next;
 $('connection').textContent='Workspace '+short(state.workspaceId)+' · revision '+state.revision+' · '+(state.provider.configured?'host key reference configured':'host key reference not configured');
 $('summary').innerHTML=[['captures','Source captures'],['reports','Report editions'],['reviews','Named reviews'],['datasets','Native datasets']].map(([k,label])=>'<div class="metric"><strong>'+esc(state.counts[k])+'</strong><span>'+esc(label)+'</span></div>').join('');
 $('source-identity').textContent='Application source '+identity.sourceIdentity.sha256;
 const cs=state.contractEditions.map(c=>({id:c.id,label:'Edition '+c.ordinal+' · '+c.title+' · '+c.units+' · '+short(c.id)}));
 select('source-contract',cs,$('source-contract').value||state.currentContractSha256);select('report-contract',cs,$('report-contract').value||state.currentContractSha256);
 $('contract-history').innerHTML=list([...state.contractEditions].reverse(),c=>'<div class="list-item"><div><strong>Edition '+esc(c.ordinal)+' · '+esc(c.title)+'</strong><p>'+esc(c.createdAt)+' · '+esc(c.units)+'</p><p class="code">'+esc(c.id)+'</p></div><button data-contract-view="'+esc(c.id)+'">View exact edition</button></div>');
 const rs=state.reports.map(r=>({id:r.id,label:r.title+' · '+short(r.id)+' · '+r.rows+' rows'}));
 for(const id of ['report-selected','report-previous','compare-before','compare-after'])select(id,rs,id==='report-selected'?$('report-selected').value||state.selectedReportId:null,id==='report-previous'?'No prior report':'Select retained report');
 select('dataset-selected',state.datasets.map(d=>({id:d.id,label:d.name+' · '+d.rows+' rows · '+short(d.snapshot)})));
 select('release-selected',state.releases.map(r=>({id:r.id,label:r.id+' · '+short(r.digest)})));
 select('quota-source',state.captures.filter(c=>c.state==='COMPLETE').map(c=>({id:c.id,label:c.locationId+' · '+c.observedAt+' · '+short(c.id)})));
 select('native-recovery-request',state.requests.filter(r=>['release.activate','release.start','release.stop','release.rollback'].includes(r.action)&&r.state!=='COMPLETE').map(r=>({id:r.operationId,label:r.action+' · '+r.operationId})));
 $('capture-list').innerHTML=table(['Location / source','Outcome','Observed at / original body','Contract',''],[...state.captures].reverse().map(c=>[
  '<strong>'+esc(c.locationId)+'</strong><p>'+esc(c.origin)+'</p><span class="code">'+esc(c.id)+'</span>',
  '<span class="tag">'+esc(c.state)+'</span><p>HTTP '+esc(c.status??'not returned')+'</p>',
  esc(c.observedAt)+'<p class="code">'+esc(c.body.sha256)+'</p><p>'+esc(size(c.body.bytes))+'</p>',esc(short(c.contractSha256)),
  '<button data-capture="'+esc(c.id)+'">View source</button>']));
 $('provider-hold').hidden=!state.providerHold;$('provider-hold-info').textContent=pretty({current:state.providerHold,history:state.providerHoldHistory});
 $('buyer-history').innerHTML=list([...state.buyerReceipts].reverse(),r=>'<article><h3>Original Buyer receiving '+esc(r.id)+'</h3><pre>'+esc(pretty({...r,files:undefined}))+'</pre>'+((r.files??[]).map(fileMarkup).join(''))+'</article>');
 filesInto('all-files',state.files);filesInto('project-exports',state.files.filter(f=>f.role==='complete-source-project'));
 $('project-receipts').innerHTML=list(state.receiving,r=>'<article><h3>Workspace '+esc(r.workspaceId)+' · revision '+esc(r.revision)+'</h3><p>'+esc(r.receivedAt)+' · '+esc(r.actor)+'</p><p>'+esc(r.note)+'</p><p class="code">'+esc(r.archive.sha256)+'</p><p>Original application '+esc(r.application.sourceCommit)+' · '+esc(r.counts.captures)+' captures · '+esc(r.counts.reportIds)+' reports.</p><button data-open-received="'+esc(r.operationId)+'">Open received workspace</button><div id="received-link-'+esc(r.operationId)+'"></div></article>');
 $('requests').innerHTML=table(['Original UUID / action','State','Accepted at / stages',''],[...state.requests].reverse().map(r=>[
  '<span class="code">'+esc(r.operationId)+'</span><p>'+esc(r.action)+'</p>',esc(r.state)+(r.error?'<p>'+esc(r.error.message)+'</p>':''),
  esc(r.createdAt)+'<p>'+esc(r.stageNames.join(', ')||'no stage checkpoint')+'</p>','<button data-request="'+esc(r.operationId)+'">Recover original</button>']));
 await Promise.all([sourceContract(),reportContract()]);if(reportPage)renderReview();eligibility();renderLocal();
}
function eligibility(){
 if(busy)return;
 $('capture-fetch').disabled=!requestPreview||!state?.provider.configured;
 $('source-import').disabled=!sourcePreview;
 $('quota-release').disabled=!quotaPreview?.canRelease;
 $('project-receive').disabled=!projectPreview||!selectedUpload;
 $('buyer-receive').disabled=!buyerPreview;
 for(const action of ['activate','start','stop','rollback'])$('release-'+action).disabled=!nativeState||nativeState.release?.id!==$('release-selected').value;
 $('native-recovery-save').disabled=!nativeRecovery;
 const approved=reportPage&&state?.reviews.filter(r=>r.reportId===reportPage.id).at(-1)?.disposition==='APPROVED';
 $('report-export').disabled=!approved;$('dataset-prepare').disabled=!approved;
}
function locationRow(value={id:'',name:'',latitude:'',longitude:''}){
 const tr=document.createElement('tr');tr.innerHTML=['id','name','latitude','longitude'].map(k=>'<td><input data-location="'+k+'" '+(k==='latitude'||k==='longitude'?'type="number" step="any" min="'+(k==='latitude'?'-90':'-180')+'" max="'+(k==='latitude'?'90':'180')+'"':'maxlength="'+(k==='id'?48:160)+'"')+' value="'+esc(value[k])+'" required></td>').join('')+'<td><button type="button" data-remove-location class="secondary">Remove</button></td>';$('locations').append(tr);$('add-location').disabled=$('locations').children.length>=3;
}
function editContract(value=null){
 contractDraft=value;const c=value?.value;
 for(const [id,key]of [['contract-title','title'],['contract-customer','customer'],['contract-destination','destination'],['contract-purpose','purpose'],['contract-units','units']])$(id).value=c?.[key]??(key==='units'?'si':'');
 $('contract-zone').value=c?.schedule.timeZone??'UTC';$('contract-slot1').value=c?.schedule.slots[0]??'';$('contract-slot2').value=c?.schedule.slots[1]??'';
 $('locations').replaceChildren();for(const l of c?.locations??[{}])locationRow(l);
 $('contract-binding').textContent=c?'Original contract '+c.id+' · previous edition '+value.sha256:'A new contract UUID will be retained with its first submitted request.';
}
on('load-current',async()=>editContract(state.currentContractSha256?await contract(state.currentContractSha256):null));
on('add-location',()=>{check($('locations').children.length<3,'This contract supports up to three locations.');locationRow();});
$('locations').addEventListener('click',e=>{if(e.target.closest('[data-remove-location]')){if($('locations').children.length<=1){notice('Retain at least one location.',true);return;}e.target.closest('tr').remove();$('add-location').disabled=false;}});
submit('contract-form',async()=>{
 const locations=[...$('locations').children].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(i=>[i.dataset.location,['latitude','longitude'].includes(i.dataset.location)?Number(i.value):i.value])));
 const value={id:contractDraft?.value.id??uuid(),title:$('contract-title').value,customer:$('contract-customer').value,destination:$('contract-destination').value,units:$('contract-units').value,horizonHours:48,locations,
  schedule:{timeZone:$('contract-zone').value,slots:[$('contract-slot1').value,$('contract-slot2').value]},purpose:$('contract-purpose').value};
 const accepted=await perform('contract.save',{value,previousContractSha256:contractDraft?.sha256??null,actor:$('contract-actor').value,note:$('contract-note').value});
 editContract(accepted.result);contracts.set(accepted.result.id,accepted.result);
});
async function sourceContract(){
 const selected=$('source-contract').value;if(!selected){select('source-location',[]);return;}
 const epoch=++contractEpoch,c=await contract(selected);if(epoch!==contractEpoch||selected!==$('source-contract').value)return;
 select('source-location',c.value.locations.map(l=>({id:l.id,label:l.name+' · '+l.latitude+', '+l.longitude})));
}
function clearSourcePreview(){sourceEpoch++;requestPreview=null;sourcePreview=null;quotaPreview=null;eligibility();}
$('source-contract').addEventListener('change',()=>{clearSourcePreview();sourceContract().catch(e=>notice(e.message,true));});
for(const id of ['source-location','source-actor','source-note','source-file','source-started','source-observed','source-status','source-complete','source-headers','source-original-operation'])$(id).addEventListener('input',clearSourcePreview);
on('request-preview',async()=>{
 const input={contractSha256:$('source-contract').value,locationId:$('source-location').value},epoch=sourceEpoch;
 const value=await read('request-preview',input);if(epoch!==sourceEpoch)return;requestPreview=value;$('request-preview-result').textContent=pretty(value);eligibility();
});
on('capture-fetch',async()=>{
 check(requestPreview,'Review the original source request first.');
 const p={contractSha256:requestPreview.contractSha256,locationId:requestPreview.request.locationId,expectedRequestSha256:requestPreview.requestSha256,actor:$('source-actor').value,note:$('source-note').value};
 check(confirm('Make exactly one Pirate Weather request for '+p.locationId+' under this contract? Provider usage may be charged according to the original account terms.'),'No provider request submitted.');
 await perform('capture.fetch',p);requestPreview=null;eligibility();
});
async function sha256(raw){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64(raw){const b=new Uint8Array(raw),parts=[];for(let i=0;i<b.length;i+=32768)parts.push(String.fromCharCode(...b.subarray(i,i+32768)));return btoa(parts.join(''));}
async function sourceInput(){
 const file=$('source-file').files[0];check(file&&file.size>0&&file.size<=8*1024*1024,'Choose the complete original response file within 8 MiB.');
 const raw=await file.arrayBuffer(),digest=await sha256(raw);
 $('source-file-info').textContent=file.name+' · '+size(file.size)+' · SHA256 '+digest;
 const p={contractSha256:$('source-contract').value,locationId:$('source-location').value,bodyBase64:base64(raw),expectedBodySha256:digest,filename:file.name,
  actor:$('source-actor').value,note:$('source-note').value,startedAt:$('source-started').value,observedAt:$('source-observed').value,
  status:$('source-status').value===''?null:Number($('source-status').value),headers:JSON.parse($('source-headers').value),bodyComplete:$('source-complete').checked};
 const original=$('source-original-operation').value.trim();if(original)p.originalOperationId=original;return p;
}
on('source-preview',async()=>{
 const epoch=sourceEpoch,input=await sourceInput(),value=await read('source-preview',input);if(epoch!==sourceEpoch)return;
 sourcePreview={input,result:value};$('source-preview-result').textContent=pretty(value);eligibility();
});
on('source-import',async()=>{check(sourcePreview,'Preview the exact original file first.');const selected=await sourceInput();check(pretty(selected)===pretty(sourcePreview.input),'The original file or metadata changed; preview it again.');
 await perform(selected.originalOperationId?'capture.reconcile':'capture.import',selected);sourcePreview=null;eligibility();});
on('quota-preview',async()=>{const id=$('quota-source').value,value=await read('provider.recovery-preview',{captureId:id});if(id!==$('quota-source').value)return;quotaPreview=value;$('quota-preview-result').textContent=pretty(quotaPreview);eligibility();});
$('quota-source').addEventListener('change',()=>{quotaPreview=null;eligibility();});
on('quota-release',async()=>{check(quotaPreview?.canRelease,'Review the exact later source first.');await perform('provider.reconcile',{captureId:quotaPreview.source.captureId,expectedHoldSha256:quotaPreview.holdSha256,actor:$('source-actor').value,note:$('source-note').value});quotaPreview=null;eligibility();});
async function reportContract(){
 const id=$('report-contract').value;if(!id){$('report-captures').replaceChildren();return;}const c=await contract(id);if(id!==$('report-contract').value)return;
 const prior=new Map([...$('report-captures').querySelectorAll('select')].map(s=>[s.dataset.location,s.value]));
 $('report-captures').innerHTML=c.value.locations.map(l=>'<label>'+esc(l.name)+' — exact complete source<select data-location="'+esc(l.id)+'"><option value="">Select a complete original response</option>'+
  state.captures.filter(x=>x.locationId===l.id&&x.contractSha256===id&&x.state==='COMPLETE').map(x=>'<option value="'+esc(x.id)+'" '+(prior.get(l.id)===x.id?'selected':'')+'>'+esc(x.observedAt+' · '+x.origin+' · '+short(x.id))+'</option>').join('')+'</select></label>').join('');
}
$('report-contract').addEventListener('change',()=>reportContract().catch(e=>notice(e.message,true)));
submit('report-form',async()=>{
 const time=$('report-window').value;check(/^\d{4}-\d\d-\d\dT\d\d:00$/.test(time),'Choose an exact UTC hour; no time-zone conversion is applied to this input.');
 const accepted=await perform('report.prepare',{contractSha256:$('report-contract').value,captureIds:[...$('report-captures').querySelectorAll('select')].map(s=>s.value),
  title:$('report-title').value,windowStart:Date.parse(time+':00Z')/1000,previousReportId:$('report-previous').value||null,actor:$('report-actor').value});
 $('report-selected').value=accepted.result.id;await openReport(accepted.result.id,0);
});
async function openReport(id,offset=0){
 check(id,'Select a retained report.');const epoch=++reportEpoch,value=await read('report',{id,offset,limit:100});if(epoch!==reportEpoch)return;reportPage=value;
 $('report-detail').hidden=false;$('report-heading').textContent=value.title;
 $('report-metadata').innerHTML='<p>'+esc(value.customer)+' · '+esc(value.destination)+'</p><p>'+esc(value.window.startUtc)+' through '+esc(value.window.endUtc)+' · '+esc(value.units)+' · '+esc(value.total)+' exact field rows.</p><p class="code">'+esc(value.id)+'</p>';
 $('report-coverage').innerHTML='<div class="coverage">'+value.coverage.map(c=>'<div><strong>'+esc(c.locationId)+'</strong><p>'+esc(c.uniqueHours)+' / 48 unique expected hours · '+esc(c.selectedRecords)+' source records</p><span class="tag">'+(c.complete?'COMPLETE COVERAGE':'SOURCE GAP / DUPLICATE')+'</span><p>Missing: '+esc(c.missingHours.join(', ')||'none')+'</p><p>Duplicates: '+esc(pretty(c.duplicateHours))+'</p></div>').join('')+'</div>';
 const {rows,...metadata}=value;$('report-metadata-json').textContent=pretty(metadata);
 $('report-rows').innerHTML=rows.map(r=>'<tr><td>'+esc(r.location)+'<p class="code">'+esc(r.captureId)+'</p></td><td>'+esc(r.timeUtc)+'<p>'+esc(r.timeLocal)+'</p></td><td>'+esc(r.field)+'</td><td class="code">'+esc(r.value)+'</td><td>'+esc(r.valueType)+'<p>'+esc(r.unitSystem)+'</p></td><td>'+esc(r.sourceOrdinal)+'</td></tr>').join('');
 $('report-page').textContent=(value.total?value.offset+1:0)+'–'+(value.offset+rows.length)+' of '+value.total;$('report-prev').disabled=value.offset===0;$('report-next').disabled=value.nextOffset===null;
 renderReview();eligibility();
}
$('report-selected').addEventListener('change',()=>{reportEpoch++;reportPage=null;$('report-detail').hidden=true;eligibility();});
on('report-open',()=>openReport($('report-selected').value));on('report-prev',()=>openReport(reportPage.id,Math.max(0,reportPage.offset-100)));on('report-next',()=>openReport(reportPage.id,reportPage.nextOffset));
function renderReview(){if(!reportPage)return;const reviews=state.reviews.filter(r=>r.reportId===reportPage.id);
 $('review-history').innerHTML=list(reviews,r=>'<div class="list-item"><div><strong>'+esc(r.disposition)+' · '+esc(r.actor)+'</strong><p>'+esc(r.at)+'</p><p>'+esc(r.note)+'</p><p class="code">'+esc(r.id)+'</p></div></div>');
 filesInto('report-files',state.files.filter(f=>f.reportId===reportPage.id));eligibility();}
submit('review-form',async()=>{check(reportPage,'Open the original report first.');await perform('report.review',{reportId:reportPage.id,actor:$('review-actor').value,disposition:$('review-disposition').value,note:$('review-note').value});renderReview();});
function approval(){check(reportPage,'Open a retained report.');const r=state.reviews.filter(r=>r.reportId===reportPage.id).at(-1);check(r?.disposition==='APPROVED','Use the current named approval for this exact report.');return r;}
on('report-export',()=>perform('report.export',{reportId:reportPage.id,reviewId:approval().id}));
on('dataset-prepare',()=>perform('dataset.prepare',{reportId:reportPage.id,reviewId:approval().id,name:$('dataset-name').value}));
async function compare(offset=0){
 const input={beforeId:$('compare-before').value,afterId:$('compare-after').value,offset,limit:100},epoch=++comparisonEpoch,value=await read('compare',input);if(epoch!==comparisonEpoch||input.beforeId!==$('compare-before').value||input.afterId!==$('compare-after').value)return;comparison=value;
 $('compare-counts').textContent=value.counts.added+' added · '+value.counts.removed+' removed · '+value.counts.changed+' changed fields.';
 $('compare-result').innerHTML=['added','removed','changed'].map(kind=>'<h3>'+esc(kind)+'</h3>'+table(kind==='changed'?['Location / time / field','Before exact value','After exact value']:['Location','UTC time','Field','Exact value'],value[kind].map(r=>kind==='changed'?[esc(r.after.locationId+' / '+r.after.timeUtc+' / '+r.after.field),esc(r.before.value),esc(r.after.value)]:[esc(r.locationId),esc(r.timeUtc),esc(r.field),esc(r.value)]))).join('');
 const total=Math.max(...Object.values(value.counts));$('compare-page').textContent='Offset '+offset+' / largest group '+total;$('compare-prev').disabled=offset===0;$('compare-next').disabled=offset+100>=total;
}
on('compare',()=>compare());on('compare-prev',()=>compare(Math.max(0,comparison.offset-100)));on('compare-next',()=>compare(comparison.offset+100));
submit('release-form',()=>perform('release.prepare',{datasetId:$('dataset-selected').value,origin:$('release-origin').value,path:$('release-path').value,payment:JSON.parse($('release-payment').value)}));
on('dataset-query-run',async()=>{$('dataset-query-result').textContent=pretty(await read('dataset.query',{datasetId:$('dataset-selected').value,query:JSON.parse($('dataset-query').value)}));});
on('release-inspect',async()=>{nativeState=await read('release.inspect',{releaseId:$('release-selected').value});$('release-state').textContent=pretty(nativeState);eligibility();});
$('release-selected').addEventListener('change',()=>{nativeState=null;eligibility();});
for(const action of ['activate','start','stop','rollback'])on('release-'+action,async()=>{
 check(nativeState&&nativeState.release.id===$('release-selected').value,'Inspect the exact original release first.');
 const input={releaseId:nativeState.release.id,expectedGeneration:nativeState.selection.generation};
 check(confirm('Apply '+action+' to the original release '+input.releaseId+' at generation '+input.expectedGeneration+'?'),'No native control action submitted.');
 await perform('release.'+action,input);nativeState=null;eligibility();
});
on('native-recovery-preview',async()=>{const id=$('native-recovery-request').value,value=await read('release.recovery-preview',{operationId:id});if(id!==$('native-recovery-request').value)return;nativeRecovery=value;$('native-recovery-result').textContent=pretty(nativeRecovery);eligibility();});
$('native-recovery-request').addEventListener('change',()=>{nativeRecovery=null;eligibility();});
on('native-recovery-save',async()=>{check(nativeRecovery,'Inspect the original native outcome first.');await perform('release.reconcile',{originalOperationId:nativeRecovery.originalOperationId,expectedObservationSha256:nativeRecovery.observationSha256,
 disposition:$('native-recovery-disposition').value,actor:$('native-recovery-actor').value,note:$('native-recovery-note').value});nativeRecovery=null;eligibility();});
const intentIds=()=>[...new Set($('buyer-intents').value.split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean))];
$('buyer-intents').addEventListener('input',()=>{buyerPreview=null;eligibility();});
on('buyer-inspect',async()=>{const ids=intentIds(),value=await read('buyer.inspect',{intentIds:ids});buyerPreview={ids,value};$('buyer-preview').textContent=pretty(value);eligibility();});
on('buyer-receive',async()=>{check(buyerPreview&&pretty(buyerPreview.ids)===pretty(intentIds()),'Inspect these exact original Inbox IDs first.');await perform('buyer.receive',{intentIds:buyerPreview.ids});buyerPreview=null;eligibility();});
submit('project-export-form',()=>perform('project.export',{title:$('project-title').value}));
$('project-file').addEventListener('change',()=>{projectEpoch++;projectPreview=null;eligibility();});
async function previewProject(upload){const epoch=projectEpoch,value=await read('project.preview',{uploadId:upload.id,expectedArchiveSha256:upload.sha256});if(epoch!==projectEpoch)return;selectedUpload=upload;projectPreview=value;$('project-preview').textContent=pretty(value);eligibility();}
on('project-upload',async()=>{
 const file=$('project-file').files[0];check(file&&file.size>0&&file.size<=64*1024*1024,'Select a ZIP within 64 MiB here, or use the original CLI for a larger project.');
 const epoch=projectEpoch,raw=await file.arrayBuffer(),digest=await sha256(raw);if(epoch!==projectEpoch)return;
 const retained=[...requests.values()].find(r=>r.kind==='project-upload'&&r.sha256===digest&&r.bytes===file.size),id=retained?.operationId??uuid();
 const upload={operationId:id,kind:'project-upload',sha256:digest,bytes:file.size,filename:file.name,status:'PREPARED'};await remember(upload);
 $('project-file-info').textContent=file.name+' · '+size(file.size)+' · '+digest+' · original upload UUID '+id;notice('Retaining the exact original ZIP under '+id+'.');
 const response=await fetch('/api/upload?id='+id+'&sha256='+digest,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/zip'},body:file,redirect:'error'});
 check(response.headers.get('x-pirate-instance')===identity.instanceId,'The original listener changed.');const value=await response.json();
 if(!response.ok)throw Error(value.message??value.error);check(value.id===id&&value.sha256===digest&&value.bytes===file.size,'The original upload receipt differs.');
 await remember({...upload,status:'RETAINED',receipt:value});if(epoch!==projectEpoch)return;$('project-upload-id').value=id;$('project-upload-sha').value=digest;await previewProject(value);
});
on('project-existing-preview',()=>previewProject({id:$('project-upload-id').value.trim(),sha256:$('project-upload-sha').value.trim()}));
on('project-receive',async()=>{check(projectPreview&&selectedUpload,'Preview the retained complete project first.');
 await perform('project.receive',{uploadId:selectedUpload.id,expectedArchiveSha256:selectedUpload.sha256,expectedPreviewSha256:projectPreview.previewSha256,actor:$('project-actor').value,note:$('project-note').value});});
async function recover(id){
 $('request-id').value=id;const value=await read('operation',{operationId:id});$('request-detail').textContent=pretty(displayValue(value));
 const local=requests.get(id);if(local)try{await remember({...local,status:value.state==='COMPLETE'?'ACCEPTED':'SERVER_'+value.state,server:value});}catch{}
 if(value.state==='COMPLETE'){show({operationId:id,result:value.acceptedResult});notice('Recovered the original accepted result for '+id+'. No replay.');}
 return value;
}
on('request-recover',()=>recover($('request-id').value.trim()));
on('request-resume',async()=>{
 check(!busy,'Wait for the current submitted operation.');const id=$('request-id').value.trim();await recover(id);controls(true);
 try{const value=await api('/api/resume',{method:'POST',body:{operationId:id}});show(value);notice('Original request '+id+' returned its retained continuation result.');await recover(id);try{await refresh();}catch(e){notice('Original result is saved. Refresh failed: '+e.message,true);}}
 finally{controls(false);eligibility();}
});
function renderLocal(){
 if(!identity)return;$('local-requests').innerHTML=list([...requests.values()].reverse(),r=>'<div class="list-item"><div><strong>'+esc(r.request?.action??r.kind??'original request')+' · '+esc(r.status)+'</strong><p class="code">'+esc(r.operationId)+'</p><p>'+esc(r.error?.message??r.filename??'')+'</p></div>'+(r.request?'<button data-local-request="'+esc(r.operationId)+'">View original submission</button><button data-request="'+esc(r.operationId)+'">Recover from server</button>':'')+'</div>');
}
async function download(file){
 check(file,'Select a retained original output.');let handle=null,writable=null;
 if(file.bytes>64*1024*1024){check(typeof window.showSaveFilePicker==='function','Use pirate-weather download for this large original file; the browser keeps its memory bounded.');
  handle=await window.showSaveFilePicker({suggestedName:file.filename});writable=await handle.createWritable();}
 let response;
 try{
  response=await api('/api/file?id='+encodeURIComponent(file.id),{raw:true});check(response.ok,'The original download did not open.');
  check(response.headers.get('x-content-sha256')===file.sha256&&Number(response.headers.get('content-length'))===file.bytes,'The original output descriptor changed.');
  if(writable){let total=0;for await(const chunk of response.body){total+=chunk.length;check(total<=file.bytes,'The original stream exceeded its saved size.');await writable.write(chunk);}
   check(total===file.bytes,'The original stream ended before its saved size.');await writable.close();writable=null;
   notice('Saved the complete original '+file.filename+' ('+size(total)+'). The host verified the retained SHA256 before completing its stream.');return;}
  const raw=await response.arrayBuffer();check(raw.byteLength===file.bytes&&await sha256(raw)===file.sha256,'The exact downloaded source bytes differ.');
  const url=URL.createObjectURL(new Blob([raw],{type:file.type??'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=file.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice('Downloaded exact '+file.filename+' · SHA256 '+file.sha256+'.');
 }catch(e){try{await response?.body?.cancel();}catch{}throw e;}finally{if(writable)await writable.abort().catch(()=>{});}
}
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;let task;
 if(b.dataset.download)task=()=>download(state.files.find(f=>f.id===b.dataset.download));
 if(b.dataset.capture)task=async()=>{const c=await read('capture',{id:b.dataset.capture});$('capture-detail').hidden=false;$('capture-detail-result').textContent=pretty(c);filesInto('capture-files',state.files.filter(f=>f.captureId===c.id));};
 if(b.dataset.contractView)task=async()=>show(await contract(b.dataset.contractView));
 if(b.dataset.request)task=()=>{tab('requests');return recover(b.dataset.request);};
 if(b.dataset.localRequest)task=()=>{$('request-detail').textContent=pretty(displayValue(requests.get(b.dataset.localRequest)));};
 if(b.dataset.openReceived)task=async()=>{
  const value=await api('/api/received/open',{method:'POST',body:{operationId:b.dataset.openReceived}}),target=$('received-link-'+b.dataset.openReceived),a=document.createElement('a');
  const url=new URL(value.url);check(url.protocol==='http:'&&url.hostname==='127.0.0.1','The received workspace must use its original loopback host.');
  a.href=value.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open original received workspace '+value.workspaceId;a.className='download-link';target.replaceChildren(a);
  notice('The received workspace is open under this original host. Use its private link below.');
 };
 if(task)Promise.resolve().then(task).catch(e=>notice(e.message,true));
});
on('refresh',async()=>{await refresh();await loadLocal();notice('Read the current retained state. No provider request was made.');});
async function start(){
 const fragment=new URLSearchParams(location.hash.slice(1)),offered=fragment.get('token'),key='pirate-weather-token:'+location.origin;
 if(offered){check(/^[A-Za-z0-9_-]{43}$/.test(offered),'The original private connection token is invalid.');token=offered;try{sessionStorage.setItem(key,token);}catch{}history.replaceState(null,'',location.pathname);}
 else{try{token=sessionStorage.getItem(key)??'';}catch{token='';}}
 identity=await api('/api/identity');await refresh();editContract(state.currentContractSha256?await contract(state.currentContractSha256):null);
 try{await loadLocal();}catch{notice('The original workspace is available for reading. This browser cannot retain new request UUIDs; use the CLI or allow local site storage before submitting changes.',true);}
}
start().catch(e=>notice(e.message,true));
