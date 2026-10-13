// SPDX-License-Identifier: MIT
import { renderCommissioning, commissioningClick, commissioningSelection, refreshCommissioningFields, commissioningFormPayload } from './commissioning.mjs';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=value=>JSON.stringify(value,null,2),uid=()=>crypto.randomUUID();
const token=$('meta[name=operator-token]').content,workspaceId=$('meta[name=workspace-id]').content;
const state={list:null,project:null,pane:'agents',generation:0,listGeneration:0,storageReady:false,pending:null,busy:false,source:null,sourceGeneration:0,db:null};
const terminal=new Set(['complete','failed','interrupted','unknown','rejected']);
const scope=location.origin+'|'+workspaceId,storageKey='a2a:'+scope;
function notice(message,error=false){$('#notice').textContent=message??'';$('#notice').classList.toggle('error',error);}
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function openDB(){if(!state.db)state.db=new Promise((resolve,reject)=>{const request=indexedDB.open('stellar-forge-a2a-operator',1);request.onupgradeneeded=()=>request.result.createObjectStore('pending');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).catch(error=>{state.db=null;throw error;});return state.db;}
async function saved(mode,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('pending',mode==='get'?'readonly':'readwrite'),table=tx.objectStore('pending');let result;const r=mode==='get'?table.get(storageKey):mode==='put'?table.put(value,storageKey):table.delete(storageKey);r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result??null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Local operation journal aborted.'));});}
async function loadPending(){state.storageReady=false;controls();try{state.pending=await saved('get');state.storageReady=true;controls();}catch(error){notice('The original pending operation could not be read. Retry local storage before making a new change.',true);controls();}}
function requireMutation(){if(!state.storageReady)throw new Error('Recover the original local operation journal first.');if(state.busy||state.pending)throw new Error('Complete or observe the saved original operation first.');if(state.project?.historical)throw new Error('Return to the current project revision before a new action.');}
function draftKey(form){return scope+'|'+(state.project?.id??'new')+'|'+form.dataset.action+(form.dataset.draftScope?'|'+form.dataset.draftScope:'');}
function draftFields(form){const fields=Object.fromEntries([...new FormData(form)].filter(([,v])=>typeof v==='string'));const checks=Object.fromEntries([...form.querySelectorAll('input[type=checkbox]')].map(input=>[input.name,input.checked]));const multi=Object.fromEntries([...form.querySelectorAll('select[multiple]')].map(input=>[input.name,[...input.selectedOptions].map(option=>option.value)]));if(Object.keys(checks).length)fields.__checks=checks;if(Object.keys(multi).length)fields.__multi=multi;return fields;}
function rememberDraft(form){try{localStorage.setItem(draftKey(form),JSON.stringify(draftFields(form)));}catch{}}
function restoreDrafts(){for(const form of $$('form[data-action]')){let value;try{value=JSON.parse(localStorage.getItem(draftKey(form))??'null');}catch{}form.__restoredDraft=value;if(value)for(const [name,content]of Object.entries(value)){const input=form.elements.namedItem(name);if(input&&!input.readOnly&&input.type!=='hidden'&&input.type!=='file'&&input.type!=='checkbox'&&!input.multiple)input.value=content;}if(value?.__checks)for(const input of form.querySelectorAll('input[type=checkbox]'))input.checked=value.__checks[input.name]===true;if(value?.__multi)for(const input of form.querySelectorAll('select[multiple]'))for(const option of input.options)option.selected=(value.__multi[input.name]??[]).includes(option.value);}}
function clearDraftIfSame(key,fields){try{if(localStorage.getItem(key)===JSON.stringify(fields))localStorage.removeItem(key);}catch{}}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},redirect:'error'});let value;try{value=await response.json();}catch{throw new Error('The original operator did not return a complete JSON response.');}if(!response.ok)throw Object.assign(new Error(value.error?.message??'Operator request failed.'),{value,status:response.status});return value;}
function readonly(){return !state.storageReady||state.busy||!!state.pending||!!state.project?.historical;}
function controls(){
  for(const element of $$('[data-mutation],form[data-action] button[type=submit],#create-form button[type=submit],#new-project'))element.disabled=readonly()||element.dataset.unavailable==='true';
  $('#recovery').hidden=state.storageReady&&!state.pending;
  $('#retry-storage').hidden=state.storageReady;
  $('#retry-request').hidden=!state.pending;$('#inspect-request').hidden=!state.pending;
  $('#stop-local').hidden=!state.pending||!state.pending.projectId;
  $('#retry-request').disabled=!state.storageReady||state.busy;$('#inspect-request').disabled=!state.storageReady||state.busy;
  $('#recovery-description').textContent=!state.storageReady?'Recovering the original browser operation journal.':state.pending?'Saved '+state.pending.label+' · '+state.pending.id+'. Its complete request bytes and selected revision are retained.':'';
}
async function savePending({path,body,id:requestId,label,projectId=null,contentType='application/json'}){
  requireMutation();state.busy=true;controls();try{const bytes=body instanceof Blob?await body.arrayBuffer():new TextEncoder().encode(body);
  const record={schema:'stellar-forge.a2a-browser-request.v1',scope,workspaceId,id:requestId,path,method:'POST',contentType,body:body instanceof Blob?body:new Blob([bytes],{type:contentType}),bodySha256:await hash(bytes),bodyBytes:bytes.byteLength,label,projectId,createdAt:new Date().toISOString()};
  await saved('put',record);state.pending=record;return record;}finally{state.busy=false;controls();}
}
async function finishPending(record,result){
  if(state.pending?.id!==record.id||state.pending.bodySha256!==record.bodySha256)throw new Error('The displayed pending identity changed; the original result remains retained.');
  await saved('delete');state.pending=null;controls();
  const error=result.error??result.request?.error;if(error)notice(error.message??error.code,true);else notice(record.label+' retained. '+(result.replay?'The saved original request was reopened.':''));
}
async function runPending(){
  if(!state.storageReady||!state.pending||state.busy)return;
  const record=state.pending,generation=state.generation;state.busy=true;controls();
  try{
    const raw=await record.body.arrayBuffer();if(raw.byteLength!==record.bodyBytes||await hash(raw)!==record.bodySha256)throw new Error('The saved request bytes no longer match their original hash.');
    const response=await fetch(record.path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':record.contentType},body:record.body,redirect:'error'});
    let value;try{value=await response.json();}catch{throw new Error('The response was incomplete. The saved request remains available.');}
    if(value.requestId!==record.id||value.bodySha256!==record.bodySha256)throw new Error('The response is not bound to this saved request. Observe or replay the original ID.');
    if(response.status===202){notice('The original native capture is running. You can inspect its saved progress or close only the local capture.');await observePending(false);return;}
    if(value.state==='rejected'||terminal.has(value.state)||response.ok){
      await finishPending(record,value);
      if(generation===state.generation){await refreshList();const projectId=value.project?.id??value.projectId??record.projectId;if(generation===state.generation&&projectId)await openProject(projectId,state.pane,null,{hash:true});}
      return value;
    }else throw new Error(value.error?.message??'The original operation is unresolved.');
  }catch(error){notice(error.message,true);}
  finally{state.busy=false;controls();}
}
async function observePending(manual=true){
  const record=state.pending;if(!record)return;
  if(record.path.startsWith('/api/receive')){if(manual)notice('Replay the retained receive request to recover its original import receipt.');return;}
  try{
    const value=await api('/api/request?id='+encodeURIComponent(record.id));
    $('#recovery-description').textContent=record.label+' · '+value.state+' · '+record.id+' · retained revision '+value.revision;
    if(terminal.has(value.state)){
      const generation=state.generation;await finishPending(record,value);
      if(generation===state.generation&&record.projectId===state.project?.id)await openProject(record.projectId,state.pane,null,{hash:false});
      await refreshList();
    }else if(manual)notice('The original local request remains '+value.state+'. This read did not invoke the remote agent again.');
  }catch(error){if(manual)notice(error.status===404?'No committed request is visible under this ID. Replay only the saved exact request.':error.message,true);}
}
async function dispatch(action,fields={},label=action,selectedProject=state.project){
  requireMutation();if(selectedProject&&(state.project?.id!==selectedProject.id||state.project?.revision!==selectedProject.revision))throw new Error('The selected project or revision changed while reading this input. Review the current view before submitting.');const project=selectedProject,requestId=uid(),payload={requestId,...fields};
  if(action!=='create'){if(!project)throw new Error('Select a project.');payload.id=project.id;payload.expectedRevision=project.revision;}
  await savePending({path:action==='commission_retain_source'?'/api/commissioning/source':'/api/dispatch',body:JSON.stringify({action,payload}),id:requestId,label,projectId:project?.id??null});
  return runPending();
}
async function refreshList(){const generation=++state.listGeneration,value=await api('/api/projects');if(generation!==state.listGeneration)return;state.list=value;$('#connection-status').textContent='Original SDK '+value.sdk.version+' · private workspace';$('#projects').innerHTML=value.projects.map(p=>'<button data-project="'+esc(p.id)+'" class="'+(p.id===state.project?.id?'selected':'')+'">'+esc(p.title)+'<small class="quiet"> · r'+p.revision+'</small></button>').join('')||'<p class="quiet">No retained projects yet.</p>';$('#create-connection').innerHTML=value.connections.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>').join('');}
function locationSelection(){const q=new URLSearchParams(location.hash.slice(1));return{id:q.get('id'),pane:q.get('pane')??'agents',revision:q.get('revision')?Number(q.get('revision')):null};}
async function openProject(projectId,pane='agents',revision=null,{hash:updateHash=true}={}){
  const generation=++state.generation;state.sourceGeneration++;state.source=null;if($('#source-dialog').open)$('#source-dialog').close();state.pane=['agents','messages','tasks','results','delivery','history','commissioning'].includes(pane)?pane:'agents';
  if(!projectId){state.project=null;render();return;}
  try{const project=await api('/api/project?id='+encodeURIComponent(projectId)+(revision?'&revision='+revision:''));if(generation!==state.generation)return;state.project=project;
    if(updateHash){const q=new URLSearchParams({id:projectId,pane:state.pane});if(revision)q.set('revision',String(revision));history.replaceState(null,'','#'+q);}
    render();await refreshList();
  }catch(error){if(generation===state.generation)notice(error.message,true);}
}
const card=(title,body,sub='')=>'<section class="card"><h2>'+esc(title)+'</h2>'+(sub?'<p class="lede">'+esc(sub)+'</p>':'')+body+'</section>';
const empty=message=>'<div class="empty">'+esc(message)+'</div>';
const options=(rows,label,selected=null)=>rows.map(x=>'<option value="'+esc(x.id)+'"'+(selected===x.id?' selected':'')+'>'+esc(label(x))+'</option>').join('');
const pill=value=>'<span class="pill '+(/complete|accepted/.test(value??'')?'good':/unknown|failed|interrupted/.test(value??'')?'attention':'')+'">'+esc(value)+'</span>';
const jsonDetails=(title,value)=>'<details><summary>'+esc(title)+'</summary><pre>'+esc(pretty(value))+'</pre></details>';
const input=(name,label,value='',type='text')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" required></label>';
const textarea=(name,label,value='',rows=4,code=false)=>'<label>'+esc(label)+'<textarea name="'+name+'" rows="'+rows+'"'+(code?' class="code"':'')+'>'+esc(value)+'</textarea></label>';
const submit=label=>'<div class="actions"><button type="submit">'+esc(label)+'</button></div>';
const form=(action,body)=>'<form data-action="'+action+'">'+body+'</form>';
function render(){
  const p=state.project;$('#project-title').textContent=p?.title??'Agent result workspace';$('#project-subtitle').textContent=p?'Revision '+p.revision+' · '+(p.historical?'Historical view · current revision '+p.currentRevision:'Current view')+' · '+p.connection.label:'Choose a host connection, retain its Agent Card, and review the original task result.';
  for(const b of $$('nav button'))b.classList.toggle('active',b.dataset.pane===state.pane);
  if(!p){$('#panel').innerHTML=card('Retained agent work',empty('Create a project to review an agent and its native task outputs.'),'The host selects the permitted endpoints and credential references. No remote key is sent to this browser.');controls();return;}
  const content=({agents:renderAgents,messages:renderMessages,tasks:renderTasks,results:renderResults,delivery:renderDelivery,history:renderHistory,commissioning:renderCommissioning})[state.pane](p);
  $('#panel').innerHTML=(p.historical?'<div class="history-banner">This is the immutable revision '+p.revision+'. <button data-current>Return to current project</button></div>':'')+content;
  restoreDrafts();refreshCardInterfaces(true);refreshCommissioningFields(p,{restore:true});controls();
}
function refreshCardInterfaces(preserve=false){const form=$('form[data-action="select_agent"]');if(!form)return;const card=state.project?.cards.find(x=>x.id===form.elements.cardId.value);if(!card)return;const selected=preserve?form.elements.interfaceIndex.value:'0';form.elements.interfaceIndex.innerHTML=card.card.supportedInterfaces.map((x,i)=>'<option value="'+i+'">'+i+' · '+esc(x.protocolBinding)+' '+esc(x.protocolVersion)+' · '+esc(x.url)+'</option>').join('');if(card.card.supportedInterfaces[Number(selected)])form.elements.interfaceIndex.value=selected;if(!preserve){form.elements.skillIds.value=card.card.skills.map(x=>x.id).join(', ');form.elements.extensions.value='';}}
function renderAgents(p){
  const newest=p.cards.at(-1),selected=p.selection,cardRecord=p.cards.find(x=>x.id===selected?.cardId)??newest,agent=cardRecord?.card;
  let body='<div class="facts"><div><small>Connection</small><b>'+esc(p.connection.label)+'</b></div><div><small>Retained cards</small><b>'+p.cards.length+'</b></div><div><small>Execution</small><b>'+(p.networkEnabled?'Host bound':'Review connection')+'</b></div></div><p class="mono">'+esc(p.connection.cardUrl)+'</p><div class="actions"><button data-action="capture_card" data-mutation>Capture original Agent Card</button></div>';
  if(agent)body+='<h3>'+esc(agent.name)+'</h3><p>'+esc(agent.description)+'</p><p class="quiet">Agent version '+esc(agent.version)+' · Card SHA256 '+esc(cardRecord.sha256)+'</p>'+jsonDetails('Complete retained Agent Card',agent);
  let select=newest?form('select_agent','<label>Retained Agent Card<select name="cardId">'+options(p.cards,c=>c.card.name+' · '+c.createdAt,newest.id)+'</select></label><label>Interface index<select name="interfaceIndex">'+newest.card.supportedInterfaces.map((x,i)=>'<option value="'+i+'">'+i+' · '+esc(x.protocolBinding)+' '+esc(x.protocolVersion)+' · '+esc(x.url)+'</option>').join('')+'</select></label>'+input('skillIds','Reviewed skill IDs (comma separated)',newest.card.skills.map(x=>x.id).join(', '))+input('extensions','Reviewed extension URIs (comma separated, or empty)',selected?.extensions?.join(', ')??'').replace(' required','')+textarea('note','Why this exact agent, interface, and skills are selected','',3)+submit('Save agent selection')):empty('Capture a card before selecting its exact interface.');
  const detail=form('update',input('title','Project title',p.title)+textarea('notes','Operating notes',p.notes,3)+submit('Save project details'));
  const bind=form('bind_connection','<label>Host connection<select name="connectionId">'+options(state.list.connections,x=>x.label,p.connectionId)+'</select></label>'+textarea('note','Explicit receiving / connection review','',3)+submit('Bind reviewed host connection'));
  return card('Agent source',body,'Capture the source before choosing a native interface and skills.')+'<div class="grid">'+card('Reviewed interface',select)+card('Project and receiving',detail+(!p.networkEnabled?'<h3>Continue a received project</h3>'+bind:''))+'</div>';
}
function renderMessages(p){
  const draft={messageId:uid(),role:'ROLE_USER',parts:[{data:{action:'catalog'}}]};
  const editor=form('prepare_message',textarea('message','Original A2A user Message JSON',pretty(draft),10,true)+textarea('configuration','Send configuration',pretty({returnImmediately:true}),3,true)+textarea('metadata','Request metadata (optional JSON object)','{}',3,true)+textarea('note','Review of the requested work and inputs','',3)+submit('Retain reviewed message'));
  const rows=p.messages.map(m=>'<div class="record"><strong>'+esc(m.native.message.messageId)+'</strong><p class="quiet">Reviewed '+esc(m.createdAt)+' · '+esc(m.selection.interface.url)+'</p><p>'+esc(m.note)+'</p>'+jsonDetails('Exact reviewed message and configuration',m.native)+'<div class="actions"><button data-send="'+esc(m.id)+'" data-stream="false" data-mutation'+(m.private||m.sendRequestId||m.adoptedTaskId?' disabled data-unavailable="true"':'')+'>Send original message</button><button data-send="'+esc(m.id)+'" data-stream="true" data-mutation'+(m.private||m.sendRequestId||m.adoptedTaskId?' disabled data-unavailable="true"':'')+'>Send and retain stream</button></div>'+(m.sendRequestId?'<p class="quiet">Original request '+esc(m.sendRequestId)+' · a saved message is never resent.</p>':'')+(m.adoptedTaskId?'<p>Verified task '+esc(m.adoptedTaskId)+'</p>':'')+'</div>').join('')||empty('No reviewed messages have been prepared.');
  return '<div class="grid">'+card('Message workshop',editor,'Use original v1.0 Part fields: text, data, raw, or url. File bytes use base64 raw; the server enforces the complete request limit.')+card('Prepared messages',rows,'Each saved native message ID has one dispatch. Unknown outcomes stay attached to their original input.')+'</div>';
}
function taskRows(p){const map=new Map();for(const o of p.observations)if(o.kind==='task'&&!o.private)map.set(o.value.id,o);return[...map.values()];}
function renderTasks(p){
  const tasks=taskRows(p),taskOptions=tasks.map(x=>({id:x.value.id,label:x.value.id+' · '+x.value.status?.state}));
  const nativeTable=tasks.length?'<div class="table-scroll"><table><thead><tr><th>Task / context</th><th>Original state</th><th>Observed</th><th>Source</th></tr></thead><tbody>'+tasks.map(o=>'<tr><td class="mono">'+esc(o.value.id)+'<div class="quiet">'+esc(o.value.contextId)+'</div></td><td>'+pill(o.value.status?.state)+'</td><td>'+esc(o.createdAt)+'</td><td><button data-observation="'+esc(o.id)+'">Inspect</button></td></tr>').join('')+'</tbody></table></div>':empty('No complete Task observation yet. A stream’s first Task is retained; use GetTask to retain its current full result.');
  const get=form('get_task',input('taskId','Original task ID',tasks.at(-1)?.value.id??'')+submit('Get original task'));
  const subscribe=form('subscribe_task',input('taskId','Original task ID',tasks.at(-1)?.value.id??'')+submit('Retain native subscription'));
  const cancel=form('cancel_task','<label>Observed task<select name="taskId">'+options(taskOptions,x=>x.label)+'</select></label>'+textarea('reason','Reason for the original CancelTask request','',3)+submit('Request remote cancellation'));
  const list=form('list_tasks',input('contextId','Context ID (optional)','').replace(' required','')+input('pageToken','Original next page token (optional)','').replace(' required','')+input('pageSize','Tasks per original page','100','number')+submit('List native task page'));
  const pendingMessages=p.messages.filter(x=>x.sendRequestId);
  const adopt=form('adopt_task','<label>Original attempted message<select name="messageId">'+options(pendingMessages,x=>x.native.message.messageId)+'</select></label>'+input('taskId','Original task ID to verify')+textarea('note','Recovery review','',3)+submit('Verify and adopt exact original task'));
  const lists=p.observations.filter(x=>x.kind==='task_list').slice(-3).map(o=>jsonDetails('Native ListTasks page · '+o.createdAt,o.value)).join('');
  return card('Native task history',nativeTable,'The server owns task state, context, and cancellation. Local capture closure does not cancel the remote task.')+'<div class="grid">'+card('Observe and subscribe',get+'<h3>Native streaming</h3>'+subscribe)+card('Discover and recover',list+lists+'<h3>Unknown message outcome</h3>'+adopt)+'</div>'+card('Explicit remote cancellation',cancel,'Only tasks retained under the currently selected agent can be cancelled here.');
}
function renderResults(p){
  const obs=p.observations.filter(x=>['task','message'].includes(x.kind)&&!x.private),observationOptions=options(obs,o=>(o.kind==='task'?o.value.id:o.value.messageId)+' · '+o.createdAt);
  const table=obs.map(o=>'<div class="record"><strong>'+esc(o.kind==='task'?o.value.id:o.value.messageId)+'</strong><p class="quiet">'+esc(o.createdAt)+' · '+esc(o.kind)+' · '+(o.value.status?pill(o.value.status.state):'original Message')+'</p><div class="actions"><button data-observation="'+esc(o.id)+'">Inspect full native result</button><button data-source="'+esc(o.sha256)+'">Read retained JSON</button></div></div>').join('')||empty('Get or receive a complete native Task or Message first.');
  const capture=form('capture_artifacts','<label>Original observation<select name="observationId">'+observationOptions+'</select></label>'+submit('Retain every original output part'));
  const captures=p.artifactCaptures.map(c=>'<div class="record"><strong>'+c.files.length+' exact parts · '+c.bytes.toLocaleString()+' bytes</strong><p class="quiet">'+esc(c.id)+' · '+esc(c.createdAt)+'</p><div class="table-scroll"><table><tbody>'+c.files.map(f=>'<tr><td>'+esc(f.filename)+'</td><td>'+esc(f.mediaType)+'</td><td>'+f.bytes+'</td><td><button data-download-source="'+esc(f.sha256)+'">Download</button></td></tr>').join('')+'</tbody></table></div></div>').join('');
  const review=form('review_result','<label>Observation<select name="observationId">'+observationOptions+'</select></label><label>Complete artifact capture<select name="captureId"><option value="">Latest complete capture for this observation</option>'+options(p.artifactCaptures,c=>c.id+' · '+c.files.length+' parts')+'</select></label><label>Decision<select name="decision"><option value="accepted">Accepted</option><option value="needs_work">Needs work</option><option value="rejected">Rejected</option></select></label>'+textarea('note','What was reviewed, limits, and delivery suitability','',4)+submit('Record source-bound decision'));
  const freeze=form('freeze_result','<label>Accepted observation<select name="observationId">'+observationOptions+'</select></label>'+input('title','Result edition title')+submit('Freeze immutable result edition'));
  const editions=p.editions.map(e=>'<div class="record"><strong>'+esc(e.title)+'</strong><p class="quiet">'+esc(e.id)+' · revision '+e.projectRevision+' · '+esc(e.createdAt)+'</p><button data-result="'+esc(e.id)+'">Download complete result edition</button></div>').join('')||empty('Accept a completed original result before freezing an edition.');
  return '<div class="grid">'+card('Original result observations',table)+card('Artifact custody',capture+captures,'URL parts use host-selected origins; credentials are never forwarded to an artifact host.')+'</div><div class="grid">'+card('Result review',review+p.reviews.slice(-5).map(r=>jsonDetails(r.decision+' · '+r.createdAt,r)).join(''))+card('Immutable result editions',freeze+editions)+'</div>';
}
function renderDelivery(p){
  const publication=form('prepare_publication','<label>Reviewed result edition<select name="editionId">'+options(p.editions,e=>e.title)+'</select></label>'+input('title','Public result description')+input('publicOrigin','Public HTTPS merchant origin','https://merchant.example')+input('routePath','Exact paid route','/agent-results/'+p.id.slice(0,8))+'<div class="form-row"><label>Original Stellar network<select name="network"><option value="stellar:testnet">stellar:testnet</option><option value="stellar:pubnet">stellar:pubnet</option></select></label>'+input('amount','Amount in original asset base units','10000')+'</div>'+input('asset','Original SEP-41 asset contract')+input('payTo','Merchant recipient')+input('maxTimeoutSeconds','Original payment timeout, seconds','60','number')+submit('Prepare complete native seller asset'));
  const publications=p.publications.map(x=>'<div class="record"><strong>'+esc(x.title)+'</strong><p class="mono">'+esc(x.service.publicOrigin+x.service.routes[0].path)+'</p><p class="quiet">'+x.asset.bytes.toLocaleString()+' bytes · SHA256 '+esc(x.asset.sha256)+'</p>'+jsonDetails('Original seller configuration and source binding',x)+'<div class="actions"><button data-start-merchant="'+esc(x.id)+'" data-mutation>Start original seller</button><button data-download-source="'+esc(x.asset.sha256)+'">Download exact paid file</button></div></div>').join('');
  const handoff=form('create_handoff',input('title','Handoff name')+textarea('notes','Receiving instructions and operating context','',3)+submit('Freeze complete workspace handoff'));
  const handoffs=p.handoffs.map(h=>'<div class="record"><strong>'+esc(h.title)+'</strong><p class="quiet">Revision '+h.projectRevision+' · '+esc(h.createdAt)+'</p><p>'+esc(h.notes)+'</p><button data-handoff="'+esc(h.id)+'">Download fixed complete handoff</button></div>').join('');
  return '<div class="grid">'+card('Merchant publication',publication+publications,'The paid asset contains the complete reviewed edition, agent/card/message provenance, and every output part. The original seller owns payment verification and settlement.')+card('Whole workspace receiving',handoff+handoffs+'<div class="actions"><button data-export>Download selected revision</button></div><h3>Receive a complete project</h3><form id="receive-form"><label>Original workspace packet<input type="file" name="packet" accept=".gz,.json" required></label><button type="submit" data-mutation>Receive original history and sources</button></form>','Fresh, forward, same, and older packets preserve compatible history. A received connection must be explicitly reviewed before new remote calls.')+'</div>'+card('Original seller lifecycle','<div id="merchant-state" class="quiet">Inspect the current seller to see its actual mode and address.</div><div class="actions"><button id="inspect-merchant">Inspect original seller</button><button id="stop-merchant" data-mutation>Stop original seller</button></div>');
}
function renderHistory(p){
  const history='<div class="table-scroll"><table><thead><tr><th>Revision</th><th>Original event</th><th>Actor / time</th><th>View</th></tr></thead><tbody>'+[...p.history].reverse().map(h=>'<tr><td>'+h.revision+'</td><td>'+esc(h.kind)+'</td><td>'+esc(h.actor)+'<div class="quiet">'+esc(h.at)+'</div></td><td><button data-revision="'+h.revision+'">Open</button></td></tr>').join('')+'</tbody></table></div>';
  const operations=[...p.operations].reverse().map(o=>'<div class="record"><strong>'+esc(o.action)+' '+pill(o.state)+'</strong><p class="mono">'+esc(o.requestId)+'</p><p class="quiet">'+esc(o.createdAt)+' · '+o.wire.length+' retained HTTP events</p>'+jsonDetails('Complete original request and capture receipts',o)+'</div>').join('');
  const sources='<div class="source-list table-scroll"><table><thead><tr><th>Source</th><th>Bytes</th><th>Identity</th><th>Access</th></tr></thead><tbody>'+p.sources.map(s=>'<tr><td>'+esc(s.role)+'<div class="quiet">'+esc(s.filename)+'</div></td><td>'+s.bytes+'</td><td class="mono">'+esc(s.sha256)+'</td><td><button data-source="'+esc(s.sha256)+'">Read</button> <button data-download-source="'+esc(s.sha256)+'">Download</button></td></tr>').join('')+'</tbody></table></div>';
  return card('Immutable source history',history,'Every history row binds the prior state and its exact selected source objects.')+card('Original local and remote operation receipts',operations)+card('Complete source objects',sources);
}
function parseJSON(value,label,{optional=false}={}){if(optional&&!value.trim())return undefined;try{return JSON.parse(value);}catch{throw new Error(label+' must be complete valid JSON.');}}
async function submitForm(form){
  requireMutation();const selectedProject=state.project,action=form.dataset.action,fields=Object.fromEntries(new FormData(form)),key=draftKey(form),snapshot=JSON.stringify(draftFields(form));rememberDraft(form);
  let payload=action.startsWith('commission_')?await commissioningFormPayload(form):{...fields};
  if(action==='select_agent'){payload.interfaceIndex=Number(fields.interfaceIndex);payload.skillIds=fields.skillIds.split(',').map(x=>x.trim()).filter(Boolean);payload.extensions=fields.extensions.split(',').map(x=>x.trim()).filter(Boolean);}
  if(action==='prepare_message'){payload={message:parseJSON(fields.message,'Message'),configuration:parseJSON(fields.configuration,'Configuration'),metadata:parseJSON(fields.metadata,'Metadata',{optional:true}),note:fields.note};if(payload.metadata===undefined)delete payload.metadata;}
  if(action==='list_tasks'){payload.pageSize=Number(fields.pageSize);if(!payload.contextId)delete payload.contextId;if(!payload.pageToken)delete payload.pageToken;}
  if(action==='review_result'&&!payload.captureId)delete payload.captureId;
  if(action==='prepare_publication')payload={editionId:fields.editionId,title:fields.title,publicOrigin:fields.publicOrigin,routePath:fields.routePath,payment:{scheme:'exact',network:fields.network,asset:fields.asset,payTo:fields.payTo,amount:fields.amount,maxTimeoutSeconds:Number(fields.maxTimeoutSeconds)}};
  const outcome=await dispatch(action,payload,form.querySelector('button[type=submit]').textContent,selectedProject);
  // Clear only the originating unchanged draft after its operation is sealed.
  if(!state.pending&&outcome?.state==='complete'&&!outcome.error){try{if(localStorage.getItem(key)===snapshot)localStorage.removeItem(key);}catch{}}
}
async function download(path,fallback){const response=await fetch(path,{headers:{Authorization:'Bearer '+token},redirect:'error'});if(!response.ok){let e=await response.json().catch(()=>({}));throw new Error(e.error?.message??'The selected download is unavailable.');}const bytes=await response.arrayBuffer(),expected=response.headers.get('x-content-sha256');if(expected&&await hash(bytes)!==expected)throw new Error('The downloaded bytes do not match their retained hash.');const filename=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]??fallback,url=URL.createObjectURL(new Blob([bytes],{type:response.headers.get('content-type')??'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Downloaded '+filename+' · '+bytes.byteLength.toLocaleString()+' exact bytes.');}
const selectedQuery=()=>'?id='+encodeURIComponent(state.project.id)+'&revision='+state.project.revision;
async function openSource(hashValue){
  const p=state.project,generation=++state.sourceGeneration,path='/api/source?id='+encodeURIComponent(p.id)+'&revision='+p.revision+'&sha256='+hashValue;
  const response=await fetch(path,{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('The selected source is unavailable.');const bytes=await response.arrayBuffer();if(await hash(bytes)!==hashValue)throw new Error('Source identity mismatch.');if(generation!==state.sourceGeneration||state.project?.id!==p.id||state.project?.revision!==p.revision)return;
  state.source={path,hash:hashValue};$('#source-title').textContent='Source '+hashValue.slice(0,20);const type=response.headers.get('content-type')??'';
  $('#source-body').textContent=/json|text|xml|csv|javascript/.test(type)?new TextDecoder().decode(bytes.slice(0,250000))+(bytes.byteLength>250000?'\n\n[Preview limited to 250,000 bytes. Download preserves the complete source.]':''):pretty({mediaType:type,bytes:bytes.byteLength,sha256:hashValue,preview:'Binary source; use the exact download.'});
  if(!$('#source-dialog').open)$('#source-dialog').showModal();
}
async function merchantControl(action,publicationId=null){
  requireMutation();const selectedProject=state.project.id,generation=state.generation;state.busy=true;controls();
  try{const value=await api('/api/merchant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:selectedProject,publicationId})});const node=generation===state.generation?$('#merchant-state'):null;if(node)node.textContent=pretty(value);notice(value.running?'Original seller started in '+value.mode+' mode.':'Original seller is closed.');}
  finally{state.busy=false;controls();}
}
document.addEventListener('input',event=>{const form=event.target.closest('form[data-action]');if(form)rememberDraft(form);});
document.addEventListener('submit',event=>{
  const form=event.target;if(form.matches('form[data-action]')){event.preventDefault();submitForm(form).catch(e=>notice(e.message,true));}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
    if(commissioningClick(button,state.project)){render();return;}
    if(button.hasAttribute('data-commission-template')){await download('/api/commissioning/template','a2a-customer-commissioning.json');return;}
    if(button.hasAttribute('data-commission-report')){await download('/api/commissioning'+selectedQuery(),'a2a-commissioning.json');return;}
    if(button.dataset.project){await openProject(button.dataset.project,state.pane);return;}
    if(button.dataset.pane){await openProject(state.project?.id,button.dataset.pane,state.project?.historical?state.project.revision:null);return;}
    if(button.hasAttribute('data-current')){await openProject(state.project.id,state.pane);return;}
    if(button.dataset.revision){await openProject(state.project.id,'history',Number(button.dataset.revision));return;}
    if(button.dataset.action){await dispatch(button.dataset.action,{},button.textContent);return;}
    if(button.dataset.send){await dispatch('send_message',{messageId:button.dataset.send,stream:button.dataset.stream==='true'},button.textContent);return;}
    if(button.dataset.observation){const o=state.project.observations.find(x=>x.id===button.dataset.observation);state.source={path:'/api/source'+selectedQuery()+'&sha256='+o.sha256};$('#source-title').textContent='Original '+o.kind+' observation';$('#source-body').textContent=pretty(o);if(!$('#source-dialog').open)$('#source-dialog').showModal();return;}
    if(button.dataset.source){await openSource(button.dataset.source);return;}
    if(button.dataset.downloadSource){await download('/api/source'+selectedQuery()+'&sha256='+button.dataset.downloadSource,'source.bin');return;}
    if(button.dataset.result){await download('/api/result?id='+encodeURIComponent(state.project.id)+'&editionId='+encodeURIComponent(button.dataset.result),'a2a-result.json.gz');return;}
    if(button.dataset.handoff){await download('/api/export?id='+encodeURIComponent(state.project.id)+'&handoffId='+encodeURIComponent(button.dataset.handoff),'a2a-workspace.json.gz');return;}
    if(button.hasAttribute('data-export')){await download('/api/export'+selectedQuery(),'a2a-workspace.json.gz');return;}
    if(button.dataset.startMerchant){await merchantControl('start',button.dataset.startMerchant);return;}
    if(button.id==='inspect-merchant'){const v=await api('/api/merchant');$('#merchant-state').textContent=pretty(v);return;}
    if(button.id==='stop-merchant'){await merchantControl('stop');return;}
  }catch(error){notice(error.message,true);}
});
document.addEventListener('change',event=>{if(commissioningSelection(event,state.project)){render();return;}const form=event.target.form;if(event.target.name==='cardId'&&form?.dataset.action==='select_agent'){refreshCardInterfaces();rememberDraft(form);}if(form?.dataset.action==='commission_prepare_job'&&['catalogueEditionId','procedureId'].includes(event.target.name)){refreshCommissioningFields(state.project,{resetProcedure:event.target.name==='catalogueEditionId',resetMappings:true});rememberDraft(form);}else if(form?.dataset.action?.startsWith('commission_'))rememberDraft(form);});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='receive-form')return;event.preventDefault();
  try{requireMutation();const file=event.target.elements.packet.files[0];if(!file)throw new Error('Select the complete original packet.');const requestId=uid();await savePending({path:'/api/receive?requestId='+requestId,body:file,id:requestId,label:'Complete workspace receiving',contentType:'application/gzip'});await runPending();}catch(error){notice(error.message,true);}
});
$('#new-project').onclick=()=>{try{requireMutation();$('#create-dialog').showModal();}catch(e){notice(e.message,true);}};
$('#close-create').onclick=()=>$('#create-dialog').close();
$('#create-form').onsubmit=async event=>{event.preventDefault();try{const fields=Object.fromEntries(new FormData(event.target));const outcome=await dispatch('create',fields,'Create project');if(!state.pending&&outcome?.state==='complete')$('#create-dialog').close();}catch(e){notice(e.message,true);}};
$('#refresh').onclick=()=>openProject(state.project?.id,state.pane).catch(e=>notice(e.message,true));
$('#retry-request').onclick=runPending;$('#inspect-request').onclick=()=>observePending(true);
$('#retry-storage').onclick=loadPending;
$('#stop-local').onclick=async()=>{try{if(state.pending)notice(pretty(await api('/api/local-stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:state.pending.id})})));}catch(e){notice(e.message,true);}};
$('#close-source').onclick=()=>{state.sourceGeneration++;$('#source-dialog').close();};
$('#download-source').onclick=()=>state.source&&download(state.source.path,'source.bin').catch(e=>notice(e.message,true));
window.addEventListener('hashchange',()=>{const q=locationSelection();openProject(q.id,q.pane,q.revision,{hash:false});});
window.a2aOperator={
  inspect:()=>({workspaceId,projectId:state.project?.id??null,revision:state.project?.revision??null,pane:state.pane,storageReady:state.storageReady,pending:state.pending?{...state.pending,body:undefined}:null}),
  async restorePending(record){if(!state.storageReady)await loadPending();if(!state.storageReady||state.busy)throw new Error('Read the original operation journal before restoring a request.');if(state.pending&&(state.pending.id!==record.id||state.pending.bodySha256!==record.bodySha256))throw new Error('An original operation is already pending.');state.busy=true;controls();try{const selected={...record},bytes=await selected.body.arrayBuffer();if(selected.workspaceId!==workspaceId||await hash(bytes)!==selected.bodySha256||bytes.byteLength!==selected.bodyBytes)throw new Error('Original request custody does not match this workspace.');if(selected.method!=='POST'||!(selected.path==='/api/dispatch'||selected.path==='/api/commissioning/source'||selected.path==='/api/receive?requestId='+encodeURIComponent(selected.id)))throw new Error('Restore only an original retained operator action.');const value={...selected,scope};await saved('put',value);state.pending=value;}finally{state.busy=false;controls();}},
  retry:runPending,observe:observePending
};
await loadPending();await refreshList();const initial=locationSelection();await openProject(initial.id??state.list.projects[0]?.id??null,initial.pane,initial.revision);controls();
setInterval(()=>{if(state.pending&&!state.busy)observePending(false);},2500);
