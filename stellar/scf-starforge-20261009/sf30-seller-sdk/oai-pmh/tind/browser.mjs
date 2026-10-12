// MIT. Complete private TIND migration desk; saved operations retain exact replay inputs.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const MAX = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const pretty = value => JSON.stringify(value, null, 2);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const id = () => 'tind-' + crypto.randomUUID();
const short = value => String(value ?? '').slice(0, 14);
const now = () => new Date().toISOString();
const savedToken = sessionStorage.getItem('tind-session') || '';
const fragment = location.hash.slice(1);
const token = /^[a-f0-9]{32}$/.test(fragment) ? fragment : savedToken;
if (token) sessionStorage.setItem('tind-session', token);
if (fragment) history.replaceState(null, '', location.pathname + location.search);
let data = null, projectId = new URLSearchParams(location.search).get('project') || '';
let currentRecord = null, page = null, offset = 0, query = '', busy = false, pending = null;
let selected = new Set(), batchSelection = 'ready', recordDirty = false, mappingDirty = false, pollTimer = null;
let allEditions = [], dbPromise, resetOverride = false;

function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').dataset.error = String(error);
}
function projectRequired() {
  if (!data?.project) throw new Error('Choose or create the original migration first.');
  return data.project;
}
function pendingKey() { return data?.workspaceIdentity; }
function openDB() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('tind-migration-operations-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending');
    request.onerror = () => reject(new Error('Browser operation storage could not open: ' + request.error?.message));
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}
async function storage(mode, value) {
  const db = await openDB(), key = pendingKey();
  if (!key) throw new Error('Open the original workspace before saving an operation.');
  return await new Promise((resolve, reject) => {
    const transaction = db.transaction('pending', mode === 'get' ? 'readonly' : 'readwrite');
    const object = transaction.objectStore('pending');
    const request = mode === 'get' ? object.get(key) : mode === 'delete' ? object.delete(key) : object.put(value, key);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(new Error('The complete pending operation could not be retained: ' + transaction.error?.message));
    transaction.onabort = () => reject(new Error('The pending operation storage transaction did not finish.'));
  });
}
function pendingUI() {
  $('#pending').hidden = !pending;
  $('#pending-description').textContent = pending ?
    'Operation ' + pending.request.operationId + ' is retained for this original workspace. Resume its same encoded request before saving another change.' : '';
  $('#retry-pending').disabled = busy;
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache:'no-store', credentials:'same-origin', ...options,
    headers:{ 'X-Tind-Session':token, ...(options.headers || {}) } });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The operator response was interrupted. The exact saved request remains available.'); }
  if (!response.ok) {
    const error = new Error(result.error || 'Operator request returned HTTP ' + response.status);
    error.status = response.status;
    throw error;
  }
  return result;
}
async function replay() {
  if (!pending || busy) return;
  busy = true; pendingUI();
  let completed = false;
  try {
    const result = await api(pending.path, { method:'POST', headers:{'Content-Type':'application/json'}, body:pending.body });
    completed = true;
    await storage('delete');
    pending = null; busy = false; pendingUI();
    if (result.projectId) projectId = result.projectId;
    message(result.task ? 'Native operation started. Its original responses will appear below.' : 'Saved operation ' + result.operationId + '.');
    await reload({preserve:true});
    return result;
  } catch (error) {
    if (!completed && error.status >= 400 && error.status < 500) {
      await storage('delete'); pending = null;
    }
    message(completed ? 'The operation was saved. Resume the retained request to finish the browser receipt: ' + error.message : error.message, true);
    throw error;
  } finally { busy = false; pendingUI(); }
}
async function submit(path, request) {
  if (busy || pending) throw new Error('Resume the existing saved operation before creating another.');
  const body = JSON.stringify(request);
  if (encoder.encode(body).length > MAX) throw new Error('The complete encoded request exceeds 8 MiB. Use the local original command for this larger source file.');
  pending = {workspaceIdentity:pendingKey(), path, request, body, createdAt:now()};
  try { await storage('put', pending); }
  catch (error) {
    const copy = pending; pending = null; pendingUI();
    download('tind-retained-operation.json', copy.body, 'application/json');
    throw new Error(error.message + ' The exact operation was downloaded for the local apply command.');
  }
  pendingUI();
  return await replay();
}
async function apply(kind, input) {
  const project = kind === 'create' ? null : projectRequired();
  return await submit('/api/apply', {operationId:id(), kind, projectId:project?.id || null,
    expectedRevision:project?.revision ?? null, input});
}
async function native(task, input, operationId = id()) {
  const project = projectRequired();
  return await submit('/api/native', {operationId, projectId:project.id, expectedRevision:project.revision, task, input});
}
function download(name, content, type='application/json') {
  const blob = new Blob([content], {type}), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function fileText(file) {
  if (!file) throw new Error('Choose the original file.');
  if (file.size > MAX) throw new Error('This browser import exceeds 8 MiB. Receive the original file through the local command.');
  const text = await file.text();
  if (encoder.encode(text).length > MAX) throw new Error('The complete UTF-8 import exceeds 8 MiB.');
  return text;
}
async function jsonInput(form, name, fileName='file') {
  const file = form.elements[fileName]?.files?.[0];
  const value = file ? await fileText(file) : form.elements[name].value.trim();
  if (!value) throw new Error('Choose the original JSON file or paste its complete contents.');
  try { return JSON.parse(value); } catch (error) { throw new Error('The complete JSON could not be read: ' + error.message); }
}
function formHandler(selector, work) {
  $(selector).addEventListener('submit', async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = event.currentTarget;
    try { await work(form, new FormData(form)); }
    catch (error) { message(error.message, true); }
  });
}
function action(selector, work) {
  $(selector).addEventListener('click', async event => {
    try { await work(event); } catch (error) { message(error.message, true); }
  });
}
function tab(name) {
  $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
  $$('[data-tab]').forEach(button => { if (button.dataset.tab === name) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (name === 'records' && data?.project) loadRecords().catch(error => message(error.message,true));
}
function recordLink(view) {
  return '/download/record?' + new URLSearchParams({project:projectId, identifier:view.identifier});
}
function batchSelects() {
  const batches = data?.batches || [];
  $$('.batch-select').forEach(select => {
    const original=select.value;
    select.innerHTML='<option value="">Choose a frozen batch</option>' + batches.map(batch=>'<option value="'+esc(batch.id)+'">'+esc(batch.title+' / '+short(batch.id)+' / '+batch.status)+'</option>').join('');
    if (batches.some(batch=>batch.id===original)) select.value=original;
  });
}
function renderNative() {
  const searches=data?.nativeSearches || [], transfers=data?.nativeTransfers || [];
  $('#native-search-status').innerHTML=searches.map(item=>'<div class="conflict"><strong>'+esc(item.id)+'</strong><p>'+esc(item.status)+' · '+Number(item.records).toLocaleString()+' records · '+(item.pages?.length||0)+' original pages</p>'+
    (item.lastError?'<p>'+esc(item.lastError)+'</p>':'')+
    (item.status==='ready'?'<button type="button" data-resume-search="'+esc(item.id)+'">Continue this same native export</button>':'')+'</div>').join('');
  $('#native-transfer-status').innerHTML=transfers.map(item=>'<div class="conflict"><strong>'+esc(item.id)+'</strong><p>'+esc(item.file)+' · '+esc(item.status)+
    (item.response?' · HTTP '+item.response.status:'')+'</p>'+(item.lastError?'<p>'+esc(item.lastError)+'</p>':'')+
    '<p>Request '+esc(short(item.requestBody?.sha256))+' · native result '+esc(short(item.response?.original?.sha256))+'</p></div>').join('');
  for(const job of data?.nativeJobs||[]){
    if(job.status!=='error')continue;
    const container=job.task==='search'?$('#native-search-status'):$('#native-transfer-status');
    container.insertAdjacentHTML('afterbegin','<div class="conflict" role="status"><strong>'+esc(job.operationId)+
      '</strong><p>Native operation returned: '+esc(job.error||'Open the retained operation for its result.')+'</p></div>');
  }
  const active=(data?.nativeJobs||[]).some(job=>job.status==='running');
  clearTimeout(pollTimer);
  if (active) pollTimer=setTimeout(()=>reload({preserve:true}).catch(error=>message(error.message,true)),2500);
}
function renderBatches() {
  const batches=data?.batches || [];
  $('#batch-list').innerHTML=batches.length?batches.map(batch=>'<section class="panel batch"><div class="section-heading"><div><h2>'+esc(batch.title)+'</h2><p class="mono">'+esc(batch.id)+'</p></div><span class="status">'+esc(batch.status)+'</span></div>'+
    '<p>'+esc(batch.note)+'</p><p>'+batch.counts.create+' new · '+batch.counts.update+' updates · '+batch.counts.withdraw+' withdrawals · '+batch.counts.files+' files · '+batch.counts.unresolved+' remaining source decisions</p>'+
    '<p class="muted">Prepared '+esc(batch.createdAt)+' by '+esc(batch.reviewer)+' from source edition '+esc(short(batch.editionId))+'.</p>'+
    '<div class="batch-files">'+batch.files.map(file=>'<a href="/download/batch-file?'+esc(new URLSearchParams({batch:batch.id,file:file.name}))+'">'+esc(file.name)+' ('+Number(file.bytes).toLocaleString()+' bytes)</a>').join('')+'</div>'+
    '<div class="actions"><a class="button" href="/download/batch?batch='+esc(batch.id)+'">Download complete batch</a><button type="button" data-reconcile="'+esc(batch.id)+'">Reconcile current native export</button>'+
    (!batch.receipts.length&&batch.status!=='withdrawn'?'<button type="button" data-withdraw="'+esc(batch.id)+'">Withdraw before delivery</button>':'')+'</div>'+
    (batch.reconciliations?.length?'<p>Latest receiving: '+batch.reconciliations.at(-1).counts.confirmed+' confirmed · '+batch.reconciliations.at(-1).counts.remaining+' remaining.</p>':'')+'</section>').join(''):'<section class="panel empty">Prepared native batches will appear here.</section>';
  batchSelects();
}
function renderState(preserve=false) {
  $('#workspace-name').textContent=data.workspace;
  const selectedProject=projectId;
  $('#project-select').innerHTML='<option value="">Choose a migration</option>'+data.projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>').join('');
  $('#project-select').value=selectedProject;
  $$('.project-only').forEach(item=>{item.hidden=!data.project;});
  const counts=data.project?[
    [Number(data.recordCount).toLocaleString(),'Original records'],
    [Number(data.fileCount).toLocaleString(),'Retained files'],
    [String(data.batches?.length||0),'Recent frozen batches'],
    [String(data.project.revision),'Working revision']
  ]:[[String(data.original.editions.length),'Recent reviewed source editions'],[String(data.projects.length),'Working migrations'],[String(data.original.repositories.length),'Original repositories'],['OAI → TIND','Native metadata receiving']];
  $('#summary').innerHTML=counts.map(([value,label])=>'<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>').join('');
  if (!$('#create-profile').value) $('#create-profile').value=pretty(data.profileTemplate);
  if (!mappingDirty && data.project) $('#mapping-json').value=pretty(data.project.profile);
  if (data.project) {
    $('#file-root-state').textContent=data.project.fileRoot?'Original file tree: '+data.project.fileRoot:'Choose the original file directory when receiving the file manifest.';
    if (!preserve) {
      $('#destination-form').elements.url.value=data.project.profile.instance.replace(/\/$/,'')+'/search?of=xm';
      $('#receipt-form').elements.url.value=data.project.profile.instance;
      $('#file-root-form').elements.path.value=data.project.fileRoot||'';
    }
  }
  $('#handover-size').textContent=data.project?Number(data.recordCount).toLocaleString()+' source records and '+Number(data.fileCount).toLocaleString()+' retained file entries in this migration. The complete handover includes every migration in the original workspace.':'The complete handover contains the original workspace and all its migrations.';
  $('#receive-command').textContent='python3 stellar/scf-starforge-20261009/sf30-seller-sdk/oai-pmh/tind/cli.py receive \\\n  --archive /path/to/tind-editable-handover.zip \\\n  --destination /path/to/new-received-migration\n\npython3 /path/to/new-received-migration/source/oai-pmh/tind/cli.py \\\n  --workspace /path/to/new-received-migration/workspace serve';
  $('#session-details').textContent='Original workspace identity '+data.workspaceIdentity+'. Each save carries one operation ID and the current migration revision. Interrupted requests stay in this browser’s operation storage until their receipt is recovered.';
  renderBatches(); renderNative();
}
function renderEditions() {
  const options=allEditions.map(edition=>'<option value="'+esc(edition.id)+'">'+esc((edition.repository.label||edition.repository.baseURL)+' / '+edition.activeRecords+' active / '+short(edition.id))+'</option>').join('');
  for (const selector of ['#edition-select','#continue-edition']) {
    const original=$(selector).value;
    $(selector).innerHTML='<option value="">Choose a reviewed original edition</option>'+options;
    if(allEditions.some(edition=>edition.id===original))$(selector).value=original;
  }
}
async function receiveEditions() {
  allEditions=[...data.original.editions];
  let next=data.original.pages?.editions?.next;
  while(next!==null && next!==undefined) {
    const response=await api('/api/history?'+new URLSearchParams({kind:'editions',offset:String(next),limit:'200'}));
    allEditions.push(...response.items); next=response.next;
  }
  renderEditions();
}
async function reload({preserve=false}={}) {
  data=await api('/api/state'+(projectId?'?project='+encodeURIComponent(projectId):''));
  if (!pending) {
    const saved=await storage('get');
    if(saved) {
      if(saved.workspaceIdentity!==data.workspaceIdentity || typeof saved.body!=='string' ||
        encoder.encode(saved.body).length>MAX || JSON.stringify(saved.request)!==saved.body ||
        !['/api/apply','/api/native'].includes(saved.path)) throw new Error('The saved operation does not match this original workspace.');
      pending=saved;
    }
  }
  const url=new URL(location.href);
  if(projectId)url.searchParams.set('project',projectId);else url.searchParams.delete('project');
  history.replaceState(null,'',url.pathname+url.search);
  renderState(preserve); pendingUI();
  if(!allEditions.length || allEditions[0]?.id!==data.original.editions[0]?.id) await receiveEditions();
}
async function loadRecords() {
  if(!data?.project){$('#record-rows').innerHTML='<tr><td colspan="6" class="empty">Choose a migration first.</td></tr>';return;}
  page=await api('/api/records?'+new URLSearchParams({project:projectId,offset:String(offset),limit:'50',query}));
  $('#record-total').textContent=Number(page.total).toLocaleString()+' records in this selection';
  $('#record-rows').innerHTML=page.items.map(item=>'<tr><td><input type="checkbox" data-select="'+esc(item.identifier)+'" aria-label="Select '+esc(item.title)+'" '+(selected.has(item.identifier)?'checked':'')+'></td><td><div class="record-title">'+esc(item.title)+'</div><div class="record-id">'+esc(item.identifier)+'</div></td><td>'+esc(item.targetId||'New / unresolved')+'</td><td><span class="status">'+esc(item.action==='exclude'?'excluded':item.ready?'ready':item.sourceStatus==='deleted'?'source deletion':'decisions remaining')+'</span></td><td>'+item.issues.length+'</td><td><button type="button" data-open="'+esc(item.identifier)+'">Open record</button></td></tr>').join('')||'<tr><td colspan="6" class="empty">No records match this selection.</td></tr>';
  $('#page-label').textContent=page.total?'Records '+(offset+1)+'–'+(offset+page.items.length)+' of '+page.total:'No records';
  $('#previous-page').disabled=offset===0;$('#next-page').disabled=page.next===null;
  selectionLabel();
}
function selectionLabel() {$('#selection-count').textContent=selected.size+' selected';}
async function openRecord(identifier) {
  if(recordDirty && !confirm('Discard unsaved changes to the open record?'))return;
  currentRecord=await api('/api/record?'+new URLSearchParams({project:projectId,identifier}));
  const view=currentRecord, staff=view.staff||{}, form=$('#record-form');
  $('#record-heading').textContent=view.title;$('#record-id').textContent=view.identifier;
  $('#record-source-status').textContent='Original observation '+short(view.observationId)+' · '+view.sourceStatus+' · repository datestamp '+view.sourceDatestamp;
  $('#record-issues').innerHTML=view.issues.length?'<ul class="issue-list">'+view.issues.map(issue=>'<li>'+esc(issue.message)+'</li>').join('')+'</ul>':'<p>Complete record is ready for the selected native batch.</p>';
  const fields={action:view.action,targetId:view.targetId||'',reviewer:staff.reviewer||'',note:staff.note||'',...view.access,...(staff.hierarchy||{})};
  for(const name of ['action','targetId','reviewer','note','metadata','files','releaseDate','restriction','licenseURI','journalTitle','volume','issue','pages','parentRecordId','issn','relationship'])
    form.elements[name].value=fields[name]||'';
  form.elements.mappedOverride.value=pretty(view.source);
  $('#destination-record').textContent=pretty(view.destination);
  $('#proposed-record').textContent=pretty(view.proposed);
  $('#original-observation').hidden=true;$('#original-observation').textContent='';
  $('#field-conflicts').innerHTML=view.issues.filter(issue=>issue.kind==='field').map((issue,index)=>'<fieldset class="conflict" data-field-conflict="'+index+'"><legend>Field '+esc(issue.key.replace(/ /g,'_'))+'</legend><div class="grid three"><details open><summary>Last delivered source</summary><pre>'+esc(pretty(issue.baseline))+'</pre></details><details open><summary>Current source</summary><pre>'+esc(pretty(issue.source))+'</pre></details><details open><summary>Current native destination</summary><pre>'+esc(pretty(issue.destination))+'</pre></details></div><label>Staff field choice<select data-choice><option value="">Choose this field group</option><option value="source">Current source</option><option value="destination">Current native destination</option><option value="custom">Complete custom field group</option></select></label><label>Decision note<input data-note></label><label data-custom-wrap hidden>Complete custom repeated field array<textarea data-custom rows="7" spellcheck="false">'+esc(pretty(issue.destination))+'</textarea></label></fieldset>').join('');
  recordDirty=false;resetOverride=false;
  if(!$('#record-dialog').open)$('#record-dialog').showModal();
}
function recordStaff(form) {
  const values=new FormData(form), access={}, hierarchy={};
  for(const key of ['metadata','files','releaseDate','restriction','licenseURI'])access[key]=String(values.get(key)||'');
  for(const key of ['journalTitle','volume','issue','pages','parentRecordId','issn','relationship']) if(values.get(key))hierarchy[key]=String(values.get(key));
  const decisions={}, conflicts=currentRecord.issues.filter(issue=>issue.kind==='field');
  $$('[data-field-conflict]').forEach(group=>{
    const issue=conflicts[Number(group.dataset.fieldConflict)], choice=group.querySelector('[data-choice]').value;
    if(!choice)return;
    const note=group.querySelector('[data-note]').value.trim();
    if(!note)throw new Error('Record the staff reason for field '+issue.key.replace(/ /g,'_')+'.');
    decisions[issue.key]={choice,note,expectedDigest:issue.expectedDigest};
    if(choice==='custom')decisions[issue.key].fields=JSON.parse(group.querySelector('[data-custom]').value);
  });
  for(const [key,decision]of Object.entries(currentRecord.staff?.decisions||{})){
    if(!currentRecord.issues.some(issue=>issue.key===key||issue.kind==='stale_decision'&&issue.message.includes(key.replace(/ /g,'_'))))
      decisions[key]=decision;
  }
  const staff={action:String(values.get('action')),targetId:String(values.get('targetId')||'')||null,access,hierarchy,
    reviewer:String(values.get('reviewer')),note:String(values.get('note')),decisions};
  const mapped=JSON.parse(form.elements.mappedOverride.value);
  if(resetOverride && JSON.stringify(mapped)===JSON.stringify(currentRecord.mappedSource)) { /* The source mapping resumes ownership. */ }
  else if(JSON.stringify(mapped)!==JSON.stringify(currentRecord.source))staff.mappedOverride=mapped;
  else if(currentRecord.staff?.mappedOverride)staff.mappedOverride=currentRecord.staff.mappedOverride;
  return staff;
}
function selectedBatch(form) {
  const batch=data.batches.find(item=>item.id===form.elements.batchId.value);
  if(!batch)throw new Error('Choose the original prepared batch.');
  return batch;
}
function updateNativeTemplate() {
  const form=$('#native-send-form');
  if(!form.elements.batchId.value)return;
  const batch=selectedBatch(form), file=batch.files.find(item=>item.kind==='marcxml');
  if(!file)return;
  form.elements.request.value=pretty({batchId:batch.id,file:file.name,url:'',method:'POST',contentType:'application/xml',encoding:'raw',
    documentation:'https://docs.tind.io/article/ivm6ow3pha-batchuploader-api'});
}

$$('[data-tab]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.tab)));
$$('.now-field').forEach(input=>{input.value=now();});
$('#project-select').addEventListener('change',async event=>{
  const next=event.target.value;
  if((recordDirty||mappingDirty)&&!confirm('Discard unsaved form changes and open this migration?')){event.target.value=projectId;return;}
  if(pending){event.target.value=projectId;message('Resume the saved operation before changing migrations.',true);return;}
  projectId=next;selected.clear();offset=0;query='';recordDirty=false;mappingDirty=false;currentRecord=null;
  if($('#record-dialog').open)$('#record-dialog').close();
  try{await reload();if(projectId)await loadRecords();}catch(error){message(error.message,true);}
});
action('#refresh',async()=>{await reload({preserve:true});if(data.project)await loadRecords();message('Current workspace refreshed.');});
action('#retry-pending',()=>replay());
action('#download-pending',()=>{if(pending)download('tind-'+pending.request.operationId+'.json',pending.body);});
formHandler('#create-form',async(form,values)=>{
  const profile=JSON.parse(form.elements.profile.value);profile.instance=String(values.get('instance')).replace(/\/$/,'');
  const result=await apply('create',{title:String(values.get('title')),editionId:String(values.get('editionId')),profile});
  if(result){projectId=result.projectId;await reload();await loadRecords();tab('records');}
});
formHandler('#edition-form',async(_form,values)=>{await apply('edition',{editionId:String(values.get('editionId'))});await loadRecords();});
formHandler('#mapping-form',async(form)=>{const profile=JSON.parse(form.elements.profile.value);await apply('profile',{profile});mappingDirty=false;await reload();});
$('#mapping-json').addEventListener('input',()=>{mappingDirty=true;});
formHandler('#search-form',async(_form,values)=>{query=String(values.get('query')||'');offset=0;await loadRecords();});
action('#previous-page',async()=>{offset=Math.max(0,offset-50);await loadRecords();});
action('#next-page',async()=>{if(page?.next!==null){offset=page.next;await loadRecords();}});
action('#clear-selection',async()=>{selected.clear();selectionLabel();await loadRecords();});
action('#prepare-selected',()=>{if(!selected.size)throw new Error('Choose the original records in the table.');batchSelection=[...selected];$('#batch-selection').value=selected.size+' selected records';tab('batches');$('#prepare-form').scrollIntoView({block:'center'});});
action('#all-ready',()=>{batchSelection='ready';$('#batch-selection').value='Every ready record';});
$('#record-rows').addEventListener('change',event=>{if(event.target.matches('[data-select]')){const key=event.target.dataset.select;event.target.checked?selected.add(key):selected.delete(key);selectionLabel();}});
$('#record-rows').addEventListener('click',event=>{const button=event.target.closest('[data-open]');if(button)openRecord(button.dataset.open).catch(error=>message(error.message,true));});
$('#record-form').addEventListener('input',()=>{recordDirty=true;});
$('#field-conflicts').addEventListener('change',event=>{if(event.target.matches('[data-choice]'))event.target.closest('[data-field-conflict]').querySelector('[data-custom-wrap]').hidden=event.target.value!=='custom';recordDirty=true;});
$('#record-dialog').addEventListener('cancel',event=>{if(recordDirty&&!confirm('Discard unsaved record changes?'))event.preventDefault();});
$('.dialog-close').addEventListener('submit',event=>{if(recordDirty&&!confirm('Discard unsaved record changes?'))event.preventDefault();else recordDirty=false;});
formHandler('#record-form',async(form)=>{
  const identifier=currentRecord.identifier, staff=recordStaff(form);
  await apply('review',{identifier,staff});recordDirty=false;await openRecord(identifier);await loadRecords();
});
action('#reset-mapped',()=>{$('#record-form').elements.mappedOverride.value=pretty(currentRecord.mappedSource);resetOverride=true;recordDirty=true;message('The current mapped source is in the editor. Review the complete record before saving.');});
action('#download-record',()=>{if(currentRecord)location.assign(recordLink(currentRecord));});
action('#show-original',async()=>{const result=await api('/api/original?observation='+encodeURIComponent(currentRecord.observationId));$('#original-observation').textContent=pretty(result);$('#original-observation').hidden=false;});
formHandler('#bulk-review-form',async(form)=>{const rows=await jsonInput(form,'records');await apply('review-many',{records:Array.isArray(rows)?rows:rows.records});await loadRecords();});
formHandler('#destination-form',async(form,values)=>{
  const marcxml=await fileText(form.elements.file.files[0]);
  await apply('destination',{marcxml,provenance:{url:String(values.get('url')),retrievedAt:String(values.get('retrievedAt')),
    recordCount:Number(values.get('recordCount')),scope:String(values.get('scope')),reviewer:String(values.get('reviewer')),complete:values.get('complete')==='on',
    fieldCoverage:String(values.get('fieldCoverage')),authority:String(values.get('authority')||''),instanceVersion:String(values.get('instanceVersion')||'')}});
});
formHandler('#native-search-form',async(form,values)=>{await native('search',{selection:JSON.parse(form.elements.selection.value),
  pageSize:Number(values.get('pageSize')),interval:Number(values.get('interval')),authorizationEnvironment:String(values.get('authorizationEnvironment')||'')||null,
  exportContext:{fieldCoverage:String(values.get('fieldCoverage')),authority:String(values.get('authority')||''),instanceVersion:String(values.get('instanceVersion')||'')}});});
$('#native-search-status').addEventListener('click',async event=>{
  const button=event.target.closest('[data-resume-search]');if(!button)return;
  try{
    const item=data.nativeSearches.find(value=>value.id===button.dataset.resumeSearch);
    const input={selection:item.contract.selection,pageSize:item.contract.pageSize,interval:item.interval??2.1,authorizationEnvironment:item.contract.authorizationEnvironment,exportContext:item.contract.exportContext};
    const old=(data.nativeJobs||[]).find(job=>job.operationId===item.id);
    if(old?.request) await submit('/api/native', old.request);
    else await native('search',input,item.id);
  }catch(error){message(error.message,true);}
});
formHandler('#files-form',async form=>{const rows=await jsonInput(form,'files');await apply('files',{files:Array.isArray(rows)?rows:rows.files});});
formHandler('#file-root-form',async(_form,values)=>{await apply('file-root',{path:String(values.get('path'))});});
action('#verify-files',async()=>{await apply('verify-files',{});});
formHandler('#file-receipt-form',async(_form,values)=>{const input=Object.fromEntries(values);input.bytes=Number(input.bytes);await apply('file-receipt',input);});
formHandler('#prepare-form',async(_form,values)=>{await apply('prepare',{identifiers:batchSelection,reviewer:String(values.get('reviewer')),note:String(values.get('note'))});});
$('#native-send-form').elements.batchId.addEventListener('change',()=>{try{updateNativeTemplate();}catch(error){message(error.message,true);}});
formHandler('#native-send-form',async(form,values)=>{
  const batch=selectedBatch(form), request=JSON.parse(form.elements.request.value);
  if(request.batchId!==batch.id)throw new Error('The request must select this exact prepared batch.');
  if(!request.url)throw new Error('Enter the endpoint from the current native documentation.');
  await native('send',{request,authorizationEnvironment:String(values.get('authorizationEnvironment')||'')||null});
});
formHandler('#receipt-form',async(form,values)=>{const input=Object.fromEntries(values);input.records=JSON.parse(form.elements.records.value);
  if(!input.transferId)delete input.transferId;await apply('receipt',input);});
$('#batch-list').addEventListener('click',async event=>{
  const button=event.target.closest('[data-reconcile],[data-withdraw]');if(!button)return;
  try{
    if(button.dataset.reconcile)await apply('reconcile',{batchId:button.dataset.reconcile});
    else{
      const operator=prompt('Withdrawing operator');if(!operator)return;
      const note=prompt('Reason for withdrawing this prepared batch before delivery');if(!note)return;
      await apply('withdraw-batch',{batchId:button.dataset.withdraw,operator,note});
    }
  }catch(error){message(error.message,true);}
});
window.addEventListener('beforeunload',event=>{if(pending||recordDirty||mappingDirty){event.preventDefault();event.returnValue='';}});
(async()=>{
  try{
    if(!token)throw new Error('Open the complete local launch link to enter the original workspace.');
    await api('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    await reload();
    message(pending?'A retained operation is ready to resume.':'Original workspace is open.');
    if(data.project)await loadRecords();
  }catch(error){message(error.message,true);}
})();
