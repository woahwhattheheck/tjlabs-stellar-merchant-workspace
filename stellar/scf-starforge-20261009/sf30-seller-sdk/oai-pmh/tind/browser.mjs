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
let filePage = null, fileOffset = 0, fileQuery = '', fileHistory = null;
let sourceCollections = null, sourceCollectionOffset = 0, sourceCollection = null, sourcePlan = null;
let sourceReviewNext = 0, sourcePlanDirty = false, sourceContext = '';

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
    if(result.kind==='source-cases'||result.kind==='source-case-review'){
      sourcePlanDirty=false;sourcePlan=null;
      await openSourceCollection(result.kind==='source-cases'?result.result.id:result.result.collectionId);
    }
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
  if (name === 'receiving' && data?.project) loadFiles().catch(error => message(error.message,true));
  if (name === 'source-cases') loadSourceCollections().catch(error => message(error.message,true));
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
  if(!$('[data-panel="receiving"]').hidden) await loadFiles();
  if(sourceContext!==projectId){sourceContext=projectId;sourceCollection=null;sourceCollections=null;sourcePlan=null;sourcePlanDirty=false;sourceCollectionOffset=0;$('#source-case-detail').hidden=true;}
  if(!$('[data-panel="source-cases"]').hidden) await loadSourceCollections();
}

function sourceQuery(values={}) { return new URLSearchParams({project:projectId,...values}); }
async function loadSourceCollections() {
  if(!data?.project){$('#source-collection-rows').innerHTML='<tr><td colspan="4" class="empty">Choose a migration first.</td></tr>';return;}
  sourceCollections=await api('/api/source-cases?'+sourceQuery({offset:String(sourceCollectionOffset),limit:'50'}));
  $('#source-collection-count').textContent=sourceCollections.total+' complete collections';
  $('#source-collection-rows').innerHTML=sourceCollections.items.map((item,index)=>'<tr><td><strong>'+esc(item.title)+'</strong><div class="record-id">'+esc(item.id)+'</div></td><td>'+esc(item.observedOn)+'</td><td>'+item.matchedCount+' single · '+item.unmatchedCount+' unmatched · '+item.ambiguousCount+' multiple</td><td><button type="button" data-source-collection="'+index+'">Open collection</button></td></tr>').join('')||'<tr><td colspan="4" class="empty">Receive the first source collection above.</td></tr>';
  $('#source-collections-previous').disabled=sourceCollectionOffset===0;
  $('#source-collections-next').disabled=sourceCollections.next===null;
  $('#source-collection-page').textContent=sourceCollections.total?'Collections '+(sourceCollectionOffset+1)+'–'+(sourceCollectionOffset+sourceCollections.items.length):'No collections';
}
async function openSourceCollection(identity) {
  if(sourcePlanDirty)throw new Error('Download the current edited draft or save its decisions before opening another collection.');
  sourceCollection=await api('/api/source-case?'+sourceQuery({id:identity}));
  sourcePlan=null;sourceReviewNext=0;
  $('#source-case-detail').hidden=false;$('#source-case-review-desk').hidden=true;
  $('#source-case-title').textContent=sourceCollection.title;
  $('#source-case-description').textContent='Original observations '+sourceCollection.observedOn+' · '+sourceCollection.caseCount+' cases · matching current repository edition '+short(sourceCollection.currentEditionId)+'.';
  $('#source-case-download').href='/download/source-cases?'+sourceQuery({id:identity});
  $('#source-case-rows').innerHTML=sourceCollection.document.cases.map((item,index)=>{
    const candidates=sourceCollection.matches[item.caseId]||[];
    return '<tr><td><input type="checkbox" data-source-case="'+index+'" aria-label="Select '+esc(item.title)+'" '+(!candidates.length?'disabled':'')+'></td><td><strong>'+esc(item.title)+'</strong><div class="record-id">'+esc(item.caseId)+'</div><p>'+item.sourceUrls.map(url=>'<a href="'+esc(url)+'" target="_blank" rel="noreferrer">Original source</a>').join(' · ')+'</p><details><summary>Complete source observations</summary><pre>'+esc(pretty(item))+'</pre></details></td><td>'+
      (candidates.length?'<label>Exact original record<select data-source-match="'+index+'">'+(candidates.length>1?'<option value="">Choose the actual matching record</option>':'')+candidates.map(candidate=>'<option value="'+esc(candidate.identifier)+'">'+esc(candidate.identifier+' — '+candidate.title)+'</option>').join('')+'</select></label><p>'+candidates.length+' original identity match'+(candidates.length===1?'':'es')+'</p>':'<p>No retained original identity matches yet. Receive the source edition or edit the source document with its actual identifier, then import that continuation.</p>')+'</td></tr>';
  }).join('');
  $('#source-case-review-history').innerHTML='';
  await loadSourceCaseReviews();
}
async function loadSourceCaseReviews() {
  if(!sourceCollection||sourceReviewNext===null)return;
  const page=await api('/api/source-case-reviews?'+sourceQuery({id:sourceCollection.id,offset:String(sourceReviewNext),limit:'50'}));
  $('#source-case-review-history').insertAdjacentHTML('beforeend',page.items.map(item=>'<p><a href="/download/source-case-review?'+esc(sourceQuery({id:item.id}))+'">Download complete review</a> · '+item.recordCount+' records · '+esc(item.reviewedAt)+'</p>').join('')||(!sourceReviewNext?'<p class="muted">Saved staff decisions will appear here.</p>':''));
  sourceReviewNext=page.next;$('#source-case-review-more').hidden=page.next===null;
}
function sourceChoices() {
  return $$('#source-case-rows [data-source-case]:checked').map(box=>{
    const index=Number(box.dataset.sourceCase),caseItem=sourceCollection.document.cases[index];
    const identifier=$('#source-case-rows [data-source-match="'+index+'"]')?.value;
    if(!identifier)throw new Error('Choose the actual original record for '+caseItem.caseId+'.');
    return {caseId:caseItem.caseId,identifier};
  });
}
async function prepareSourceCases() {
  projectRequired();
  if(!sourceCollection)throw new Error('Open a source collection.');
  if(sourcePlanDirty)throw new Error('Download the current edited draft or save its decisions before preparing another.');
  const choices=sourceChoices();
  if(!choices.length)throw new Error('Select source cases and their actual original record identities.');
  const result=await api('/api/source-cases/plan',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({projectId,collectionId:sourceCollection.id,choices})});
  sourcePlan={...result,projectId,workspaceIdentity:data.workspaceIdentity};
  sourcePlanDirty=false;
  $('#source-case-review-json').value=pretty(result.input);
  $('#source-case-plan-description').textContent=result.plans.length+' complete records prepared at migration revision '+result.revision+'. The save uses this same revision; reopen the plan if another change is saved first.';
  $('#source-case-plan-details').innerHTML=result.plans.map(plan=>'<details><summary>'+esc(plan.case.title)+'</summary>'+
    (plan.warnings.length?'<ul>'+plan.warnings.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'')+
    '<p>'+esc(plan.changes.join('; ')||'The complete current record is retained with the proposed access and hierarchy.')+'</p><pre>'+esc(pretty({source:plan.case,currentStaff:plan.currentStaff,currentSource:plan.currentSource,currentFiles:plan.currentFiles}))+'</pre></details>').join('');
  $('#source-case-review-desk').hidden=false;
  $('#source-case-review-desk').scrollIntoView({block:'start'});
}
function sourceReviewInput(form) {
  if(!sourcePlan||sourcePlan.projectId!==projectId||sourcePlan.workspaceIdentity!==data.workspaceIdentity)throw new Error('Prepare the source-case plan in this current workspace.');
  const input=JSON.parse(form.elements.input.value);
  if(input.collectionId!==sourcePlan.collectionId||!Array.isArray(input.records)||!input.records.length)throw new Error('Keep this collection and its complete selected records in the review.');
  const reviewer=form.elements.reviewer.value.trim(),note=form.elements.note.value.trim();
  if(!reviewer||!note)throw new Error('Enter the reviewing operator and source decision note.');
  for(const row of input.records){
    if(!row.staff||typeof row.staff!=='object')throw new Error('Retain each complete staff object.');
    row.staff.reviewer=reviewer;
    row.staff.note=[row.staff.note,note].filter(Boolean).join('\n');
  }
  return input;
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

async function loadFiles() {
  if(!data?.project) {
    filePage=null;$('#file-rows').innerHTML='<tr><td colspan="6" class="empty">Choose a migration first.</td></tr>';
    $('#file-page-label').textContent='';$('#previous-files').disabled=true;$('#next-files').disabled=true;return;
  }
  const requestedProject=projectId;
  const response=await api('/api/files?'+new URLSearchParams({project:projectId,offset:String(fileOffset),limit:'50',query:fileQuery}));
  if(requestedProject!==projectId)return;
  filePage=response;
  $('#file-rows').innerHTML=response.items.map((item,index)=>{
    const file=item.file, native=file.destination, receiving=item.receiving;
    const policy=file.access.files+(file.access.releaseDate?' / '+file.access.releaseDate:'');
    return '<tr><td><strong>'+esc(file.filename)+'</strong><div class="record-id">'+esc(file.identifier)+'</div><div>'+esc(file.id)+' · '+Number(file.bytes).toLocaleString()+' bytes</div></td>'+
      '<td>'+esc(file.role)+'<div>'+esc(policy)+'</div></td><td>'+esc(item.targetId||'Choose native match')+(native?'<div class="record-id">Observed '+esc(native.nativeRecordId)+'</div>':'')+'</td>'+
      '<td>'+esc(receiving.bytesConfirmed?'Confirmed':receiving.bytesObserved?'Observed; match record':'Receive bytes')+'</td>'+
      '<td>'+esc(receiving.policyConfirmed?'Confirmed':receiving.policyObserved?'Compare observed policy':'Receive role and access')+'</td>'+
      '<td><button type="button" data-file-receive="'+index+'">Receive result</button><button type="button" data-file-history="'+index+'">History</button><button type="button" data-file-download="'+index+'">Working file</button></td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">No retained files match this selection.</td></tr>';
  $('#file-page-label').textContent=response.total?'Files '+(fileOffset+1)+'–'+(fileOffset+response.items.length)+' of '+response.total:'No retained files';
  $('#previous-files').disabled=fileOffset===0;$('#next-files').disabled=response.next===null;
}
function receiveFileRow(item) {
  const form=$('#file-receipt-form'), file=item.file, observed=file.destination||{};
  const fields={identifier:file.identifier,fileId:file.id,nativeRecordId:observed.nativeRecordId||item.targetId||'',
    nativeFileId:observed.nativeFileId||'',url:observed.url||'',sha256:observed.sha256||file.sha256,bytes:observed.bytes??file.bytes,
    observedAt:observed.observedAt||now(),operator:observed.operator||'',original:'',
    attachmentRole:'',attachmentSourceUrl:'',attachmentObservedAt:now(),attachmentMetadata:'',attachmentFiles:'',
    attachmentReleaseDate:'',attachmentRestriction:'',attachmentLicenseURI:'',attachmentOriginal:''};
  for(const [key,value]of Object.entries(fields))form.elements[key].value=String(value);
  $('#attachment-observed').checked=false;$('#attachment-observation').disabled=true;
  form.scrollIntoView({block:'center'});form.elements.nativeFileId.focus();
  message('Selected '+file.filename+'. Enter the actual native result and include its observed attachment settings when available.');
}
async function loadFileHistory(item=null) {
  if(item) {
    fileHistory={identifier:item.file.identifier,fileId:item.file.id,next:0};
    $('#file-history-title').textContent=item.file.filename+' / '+item.file.id;
    $('#file-history-list').textContent='';$('#file-history').hidden=false;$('#file-history').open=true;
  }
  if(!fileHistory || fileHistory.next===null)return;
  const selectedHistory=fileHistory, requestedProject=projectId;
  const result=await api('/api/file-history?'+new URLSearchParams({project:projectId,identifier:fileHistory.identifier,
    file:fileHistory.fileId,offset:String(fileHistory.next),limit:'50'}));
  if(selectedHistory!==fileHistory || requestedProject!==projectId)return;
  if(!result.items.length && fileHistory.next===0)$('#file-history-list').textContent='No separate native observations have been received. The working file retains any earlier native result.';
  for(const entry of result.items) {
    const link=document.createElement('a');
    link.href='/download/file-receipt?'+new URLSearchParams({project:projectId,id:entry.id});
    link.textContent=entry.observedAt+' · native '+entry.nativeRecordId+' / '+entry.nativeFileId+' · '+(entry.attachment?'bytes and attachment/access':'bytes');
    const paragraph=document.createElement('p');paragraph.append(link);$('#file-history-list').append(paragraph);
  }
  fileHistory.next=result.next;$('#more-file-history').hidden=result.next===null;
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
  if(currentRecord.staff?.sourceSupplement)staff.sourceSupplement=currentRecord.staff.sourceSupplement;
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
  if((recordDirty||mappingDirty||sourcePlanDirty)&&!confirm('Discard unsaved form changes and open this migration?')){event.target.value=projectId;return;}
  if(pending){event.target.value=projectId;message('Resume the saved operation before changing migrations.',true);return;}
  projectId=next;selected.clear();offset=0;query='';recordDirty=false;mappingDirty=false;currentRecord=null;
  filePage=null;fileOffset=0;fileQuery='';fileHistory=null;$('#file-search-form').elements.query.value='';$('#file-history').hidden=true;
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

formHandler('#source-case-import',async form=>{
  if(form.elements.file.files[0]?.size>MAX)throw new Error('Split this collection into complete source documents below 8 MiB.');
  const document=await jsonInput(form,'document'),project=projectRequired();
  const request={operationId:id(),kind:'source-cases',projectId,expectedRevision:project.revision,input:{document}};
  if(encoder.encode(JSON.stringify(request)).length>MAX)throw new Error('Split this source collection so its complete save body fits within 8 MiB.');
  const result=await submit('/api/apply',request);
  sourceCollectionOffset=0;await loadSourceCollections();

});
action('#refresh-source-cases',()=>loadSourceCollections());
action('#source-collections-previous',async()=>{sourceCollectionOffset=Math.max(0,sourceCollectionOffset-50);await loadSourceCollections();});
action('#source-collections-next',async()=>{if(sourceCollections?.next!==null&&sourceCollections?.next!==undefined){sourceCollectionOffset=sourceCollections.next;await loadSourceCollections();}});
$('#source-collection-rows').addEventListener('click',event=>{
  const button=event.target.closest('[data-source-collection]');if(!button)return;
  const item=sourceCollections?.items[Number(button.dataset.sourceCollection)];
  if(item)openSourceCollection(item.id).catch(error=>message(error.message,true));
});
action('#source-case-select-matched',()=>{$$('#source-case-rows [data-source-case]').forEach(box=>{const item=sourceCollection.document.cases[Number(box.dataset.sourceCase)];box.checked=(sourceCollection.matches[item.caseId]||[]).length===1;});});
action('#source-case-clear',()=>{$$('#source-case-rows [data-source-case]').forEach(box=>{box.checked=false;});});
action('#source-case-plan',()=>prepareSourceCases());
action('#source-case-review-more',()=>loadSourceCaseReviews());
$('#source-case-review-json').addEventListener('input',()=>{sourcePlanDirty=true;});
formHandler('#source-case-draft-form',async form=>{
  if(sourcePlanDirty)throw new Error('Save or download the current edited draft before receiving another.');
  const draft=await jsonInput(form,'draft');
  if(draft.schema!=='stellar-forge.tind-source-case-draft.v1'||draft.projectId!==projectId||
    draft.collectionId!==sourceCollection?.id||!Number.isSafeInteger(draft.expectedRevision)||draft.expectedRevision<0||
    draft.input?.collectionId!==draft.collectionId||!Array.isArray(draft.input?.records))
    throw new Error('Receive the complete draft for this same migration and source collection.');
  sourcePlan={collectionId:draft.collectionId,revision:draft.expectedRevision,projectId,
    workspaceIdentity:data.workspaceIdentity,sourceWorkspaceIdentity:draft.workspaceIdentity};
  $('#source-case-review-json').value=pretty(draft.input);
  $('#source-case-review-form').elements.reviewer.value=draft.reviewer||'';
  $('#source-case-review-form').elements.note.value=draft.note||'';
  $('#source-case-plan-description').textContent='Received complete editable draft at migration revision '+draft.expectedRevision+'.';
  $('#source-case-plan-details').innerHTML='<p>The original source collection and review history remain available above.</p>';
  $('#source-case-review-desk').hidden=false;sourcePlanDirty=false;
});
formHandler('#source-case-review-form',async form=>{
  const input=sourceReviewInput(form),plan=sourcePlan;
  const request={operationId:id(),kind:'source-case-review',projectId,expectedRevision:plan.revision,input};
  if(encoder.encode(JSON.stringify(request)).length>MAX)throw new Error('Save fewer complete source-case records per operation so the body fits within 8 MiB.');
  const result=await submit('/api/apply',request);
  if(result)message('Saved '+result.result.recordCount+' complete source-case decisions.');
});
action('#source-case-download-draft',()=>{
  const form=$('#source-case-review-form');
  if(!sourcePlan)throw new Error('Prepare the source-case plan first.');
  const input=JSON.parse(form.elements.input.value);
  download('tind-source-case-draft.json',pretty({schema:'stellar-forge.tind-source-case-draft.v1',
    projectId:sourcePlan.projectId,workspaceIdentity:sourcePlan.workspaceIdentity,expectedRevision:sourcePlan.revision,
    collectionId:sourcePlan.collectionId,reviewer:form.elements.reviewer.value,note:form.elements.note.value,input}));
  sourcePlanDirty=false;
});

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
formHandler('#file-receipt-form',async(_form,values)=>{
  const input={};
  for(const key of ['identifier','fileId','nativeRecordId','nativeFileId','url','sha256','observedAt','operator','original'])
    input[key]=String(values.get(key)||'');
  input.bytes=Number(values.get('bytes'));
  if(values.get('attachmentObserved')==='on')input.attachment={
    role:String(values.get('attachmentRole')),sourceUrl:String(values.get('attachmentSourceUrl')),
    observedAt:String(values.get('attachmentObservedAt')),original:String(values.get('attachmentOriginal')),
    access:{metadata:String(values.get('attachmentMetadata')),files:String(values.get('attachmentFiles')),
      releaseDate:String(values.get('attachmentReleaseDate')||''),restriction:String(values.get('attachmentRestriction')||''),
      licenseURI:String(values.get('attachmentLicenseURI')||'')}
  };
  await apply('file-receipt',input);
});
$('#attachment-observed').addEventListener('change',event=>{$('#attachment-observation').disabled=!event.target.checked;});
formHandler('#file-search-form',async(_form,values)=>{fileQuery=String(values.get('query')||'');fileOffset=0;await loadFiles();});
action('#refresh-files',()=>loadFiles());
action('#previous-files',async()=>{fileOffset=Math.max(0,fileOffset-50);await loadFiles();});
action('#next-files',async()=>{if(filePage?.next!==null&&filePage?.next!==undefined){fileOffset=filePage.next;await loadFiles();}});
action('#more-file-history',()=>loadFileHistory());
$('#file-rows').addEventListener('click',event=>{
  const button=event.target.closest('[data-file-receive],[data-file-history],[data-file-download]');
  if(!button)return;
  const index=Number(button.dataset.fileReceive??button.dataset.fileHistory??button.dataset.fileDownload);
  const item=filePage?.items[index];if(!item)return;
  if(button.hasAttribute('data-file-receive'))receiveFileRow(item);
  else if(button.hasAttribute('data-file-download'))download('tind-working-file.json',pretty(item.file));
  else loadFileHistory(item).catch(error=>message(error.message,true));
});
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
window.addEventListener('beforeunload',event=>{if(pending||recordDirty||mappingDirty||sourcePlanDirty){event.preventDefault();event.returnValue='';}});
(async()=>{
  try{
    if(!token)throw new Error('Open the complete local launch link to enter the original workspace.');
    await api('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    await reload();
    message(pending?'A retained operation is ready to resume.':'Original workspace is open.');
    if(data.project)await loadRecords();
  }catch(error){message(error.message,true);}
})();
