// MIT. CIIM receiving operations over the same saved model and original sources.
const $ = id => document.getElementById(id);
const views = ['overview','intake','records','profiles','comparison','handbacks','context','history'];
const escQuery = value => new URLSearchParams(Object.entries(value).filter(([,v]) => v !== undefined && v !== null && v !== '')).toString();
const format = value => value === undefined ? 'Absent' : value === null ? 'Null' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const display = value => value === undefined || value === null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const words = value => String(value ?? '').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');
const decision = review => typeof review === 'string' ? review : review?.decision || 'unreviewed';
const editionLabel = edition => edition.label+' · '+edition.counts.active+' active / '+edition.counts.deleted+' deleted · '+String(edition.nativeEditionId || edition.id).slice(0,12);
let state = null, launch = null, busy = false, alive = true, pending = null, pendingDb, imported = null;
let recordSelection = new Set(), selectionEdition = '', selectionPopulation = '';
let route = Object.fromEntries(new URL(location.href).searchParams);
let view = views.includes(route.view) ? route.view : 'overview';
let selectedEdition = route.editionId || '', selectedComparison = route.comparisonId || '';
let recordStatus = '', recordQuery = '', recordOffset = 0, profileOffset = 0, comparisonOffset = 0, historyOffset = 0;
const tokenKey = 'ciim-session:' + location.origin;
let token = '';
try { token = sessionStorage.getItem(tokenKey) || ''; } catch {}
const fragment = location.hash.slice(1);
if (/^[a-f0-9]{64}$/.test(fragment)) {
  token = fragment;
  try { sessionStorage.setItem(tokenKey, token); } catch {}
  history.replaceState(null, '', location.pathname + location.search);
}
try { $('operator').value = localStorage.getItem('ciim-operator') || ''; } catch {}
$('operator').addEventListener('change', () => { try { localStorage.setItem('ciim-operator', $('operator').value); } catch {} });
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function add(parent, ...children) {
  for (const child of children.flat()) if (child !== null && child !== undefined) parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return parent;
}
function button(label, fn, { id, disabled = false, className = '' } = {}) {
  const b = el('button', label, className); b.type = 'button'; b.disabled = disabled;
  if (id) b.id = id;
  b.addEventListener('click', () => run(fn)); return b;
}
function input(id, value = '', type = 'text') {
  const n = el('input'); n.id = id; n.name = id; n.type = type; n.value = value ?? ''; return n;
}
function textarea(id, value = '') {
  const n = el('textarea'); n.id = id; n.name = id; n.value = value ?? ''; n.rows = 3; return n;
}
function field(label, control, help) {
  const box = el('div', null, 'field'), name = el('label', label);
  name.htmlFor = control.id; add(box,name,control);
  if (help) add(box,el('p',help,'help')); return box;
}
function select(id, options, value) {
  const n = el('select'); n.id = id; n.name = id;
  for (const item of options) {
    const opt = el('option', item.label); opt.value = item.value; opt.disabled = Boolean(item.disabled); n.append(opt);
  }
  n.value = value ?? ''; return n;
}
function panel(title, description) {
  const p = el('section',null,'panel'); add(p,el('h2',title));
  if (description) add(p,el('p',description,'muted')); return p;
}
function details(title, value, open = false) {
  const d = el('details'); d.open = open; add(d,el('summary',title),el('pre',format(value),'source')); return d;
}
function kv(values) {
  const n = el('dl',null,'key-values');
  for (const [label,value] of Object.entries(values)) add(n,el('dt',label),el('dd',display(value),'break'));
  return n;
}
function grid(headers, rows, caption) {
  const wrap = el('div',null,'table-wrap'), table = el('table');
  if (caption) table.append(el('caption',caption));
  const head = el('thead'), tr = el('tr'); for (const h of headers) tr.append(el('th',h)); head.append(tr); table.append(head);
  const body = el('tbody');
  for (const cells of rows) { const row = el('tr'); for (const cell of cells) { const td = el('td'); add(td,cell); row.append(td); } body.append(row); }
  table.append(body); wrap.append(table);
  if (!rows.length) wrap.append(el('p','No saved rows match this view.','empty'));
  return wrap;
}
function status(text) { return el('span',words(text),'badge'); }
function showMessage(message, error = false) {
  $('message').replaceChildren(el('p',message,error ? 'error' : 'notice'));
  $('message').setAttribute('role',error ? 'alert' : 'status');
}
async function run(fn) {
  if (!alive || busy) return;
  busy = true; document.body.classList.add('working'); $('main').setAttribute('aria-busy','true');
  try { await fn(); }
  catch (error) {
    if (error.status === 401) $('connection').hidden = false;
    showMessage((error.code ? error.code + ': ' : '') + error.message,true);
  } finally { busy = false; document.body.classList.remove('working'); $('main').setAttribute('aria-busy','false'); }
}
async function request(path, options = {}) {
  const response = await fetch(path,{...options,headers:{'X-CIIM-Session':token,...options.headers},
    signal:options.signal || AbortSignal.timeout(600000),cache:'no-store',redirect:'error'});
  if (!response.ok) {
    let value;
    try { value = await response.json(); } catch {}
    const cause = value?.error || {};
    throw Object.assign(new Error(cause.message || 'The original local request did not finish.'),{code:cause.code || 'HTTP_'+response.status,status:response.status,details:cause.details});
  }
  return response;
}
async function api(path, parameters) {
  return (await request(path+(parameters ? '?'+escQuery(parameters) : ''))).json();
}
async function readView(parameters) { return api('/api/view',parameters); }
async function download(path, parameters) {
  const response = await request(path+(parameters ? '?'+escQuery(parameters) : ''));
  const blob = await response.blob();
  const expected = response.headers.get('content-length');
  if (expected && blob.size !== Number(expected)) throw Error('The original download ended before its complete bytes arrived.');
  const disposition = response.headers.get('content-disposition') || '';
  let name = /filename="([^"]+)"/.exec(disposition)?.[1] || 'ciim-receiving.zip';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) { try { name = decodeURIComponent(encoded); } catch {} }
  const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  showMessage('Downloaded '+name+' · '+blob.size.toLocaleString()+' bytes · SHA256 '+(response.headers.get('x-content-sha256') || 'retained in the original manifest'));
}
function openDb() {
  if (!pendingDb) pendingDb = new Promise((resolve,reject) => {
    const opening = indexedDB.open('ciim-receiving-requests',1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('requests',{keyPath:'workspaceId'});
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(Error('The browser could not retain the original decision request. Enable local site storage before saving.'));
    opening.onblocked = () => reject(Error('Close the older receiving tab so its local request storage can open.'));
  });
  return pendingDb;
}
async function pendingTransaction(work, mode='readonly') {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('requests',mode), store = tx.objectStore('requests'); let result, cause;
    const setResult = value => { result = value; };
    const fail = error => { cause = error; tx.abort(); };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(cause || tx.error || Error('Original request storage failed.'));
    tx.onabort = () => reject(cause || tx.error || Error('Original request storage was interrupted.'));
    try { work(store,setResult,fail); } catch (error) { fail(error); }
  });
}
function pendingMatches(value, workspaceId, workspace) {
  if (value.workspaceId===workspaceId) return true;
  return value.request?.type==='workspace.restore' && value.destination?.workspace===workspace
    && value.restore?.workspaceId===workspaceId;
}
async function readPending(workspaceId, workspace=launch?.workspace) {
  return pendingTransaction((store,done,fail) => {
    const r=store.getAll();
    r.onsuccess=()=>{
      const matches=r.result.filter(value=>pendingMatches(value,workspaceId,workspace));
      if(matches.length>1) return fail(Error('Several original requests refer to this restored desk. Preserve them and reopen their originating tabs before saving another decision.'));
      done(matches[0] || null);
    };
  });
}
async function retainPending(value) {
  return pendingTransaction((store,done,fail) => {
    const r=store.getAll();
    r.onsuccess=()=>{
      const matches=r.result.filter(old=>pendingMatches(old,value.workspaceId,value.destination?.workspace)
        || (value.restore?.workspaceId && pendingMatches(old,value.restore.workspaceId,value.destination?.workspace)));
      for(const old of matches)
        if(JSON.stringify(old.request)!==JSON.stringify(value.request))
          return fail(Error('Another original request is already retained. Recover it before creating a new decision.'));
      store.put(value); done(value);
    };
  },'readwrite');
}
async function deletePending(workspaceId, operationId) {
  return pendingTransaction((store,done,fail) => {
    const r=store.get(workspaceId); r.onsuccess=()=>{
      if (r.result && r.result.request.operationId!==operationId) return fail(Error('Another retained request must stay intact.'));
      store.delete(workspaceId); done();
    };
  },'readwrite');
}
function renderPending() {
  $('pending').hidden=!pending;
  if (!pending) return;
  $('pending-summary').textContent=words(pending.request.type)+' · original revision '+pending.request.expectedRevision+' · '+pending.request.operationId;
  $('pending-detail').textContent=JSON.stringify(pending.request,null,2);
  $('discard-pending').hidden=pending.status!=='rejected';
}
function actor() {
  const value=$('operator').value.trim();
  if (!value) { $('operator').focus(); throw Error('Enter the name to record with this receiving decision.'); }
  return value;
}
async function submitPending() {
  if (!pending) throw Error('There is no retained original request.');
  const original=pending, key=original.workspaceId;
  try {
    const result=await (await request('/api/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(original.request)})).json();
    await deletePending(key,original.request.operationId);
    pending=null; renderPending(); state=result.state;
    syncSelection(); await render();
    showMessage((result.replayed?'Recovered the original saved operation':'Saved '+words(result.type))+' · revision '+result.revision);
    return result;
  } catch (error) {
    if (error.status>=400 && error.status<500 && ![401,408,425,429].includes(error.status)) {
      pending={...original,status:'rejected',error:{code:error.code,message:error.message}};
      await retainPending(pending);
    }
    renderPending(); throw error;
  }
}
async function act(type,data) {
  if (!state) throw Error('Open the original desk first.');
  const existing=await readPending(state.workspaceId);
  if (existing) { pending=existing; renderPending(); throw Error('Recover the retained original request before saving another decision.'); }
  if(!launch?.workspace) throw Error('Refresh the original desk connection before saving.');
  let restore;
  if(type==='workspace.restore') {
    if(!imported || imported.candidateId!==data.candidateId || !['workspace','handback'].includes(imported.kind)
      || !imported.workspace?.workspaceId) throw Error('Inspect the original complete desk package before restoring it.');
    restore={workspaceId:imported.workspace.workspaceId,archiveSha256:imported.sha256,candidateId:imported.candidateId};
  }
  const requestBody={operationId:crypto.randomUUID(),expectedRevision:state.revision,actor:actor(),type,data};
  pending=await retainPending({workspaceId:state.workspaceId,destination:{workspace:launch.workspace},
    ...(restore?{restore}:{}),request:requestBody,status:'pending',createdAt:new Date().toISOString()});
  renderPending(); return submitPending();
}
function syncSelection() {
  if (!state.editions.some(e=>e.id===selectedEdition)) selectedEdition=state.editions[0]?.id || '';
  if (!state.comparisons.some(e=>e.id===selectedComparison)) selectedComparison=state.comparisons[0]?.id || '';
  const edition=state.editions.find(e=>e.id===selectedEdition);
  if (selectionEdition!==selectedEdition || selectionPopulation!==edition?.populationDigest) {
    recordSelection.clear(); selectionEdition=selectedEdition; selectionPopulation=edition?.populationDigest || ''; recordOffset=0;
  }
}
async function refresh() {
  let currentLaunch=await api('/api/launch');
  const currentState=await api('/api/state');
  if(currentLaunch.workspaceId!==currentState.workspaceId) currentLaunch=await api('/api/launch');
  if(currentLaunch.workspaceId!==currentState.workspaceId)
    throw Error('The saved desk identity changed during refresh. Refresh again to open the complete restored state.');
  launch=currentLaunch;state=currentState;$('connection').hidden=true;
  syncSelection();
  try { pending=await readPending(state.workspaceId); } catch (error) { showMessage(error.message,true); }
  renderPending(); await render();
}
function editionPicker(onChange) {
  const box=field('Native edition',select('edition',state.editions.map(e=>({value:e.id,label:editionLabel(e)})),selectedEdition));
  box.querySelector('select').addEventListener('change',event=>run(async()=>{selectedEdition=event.target.value;syncSelection();profileOffset=0;route.editionId=selectedEdition;await onChange();}));
  return box;
}
function pager(result, change) {
  const p=el('div',null,'pagination');
  add(p,el('span',result.total ? ((result.offset+1)+'–'+Math.min(result.offset+result.items.length,result.total)+' of '+result.total.toLocaleString()) : '0 records'),
    button('Previous',()=>change(Math.max(0,result.offset-result.limit)),{disabled:result.offset===0}),
    button('Next',()=>change(result.offset+result.limit),{disabled:result.offset+result.items.length>=result.total}));
  return p;
}
function reviewForm(type, selection, {allowExclude=false, label='Record review', scope=''}={}) {
  const form=el('form',null,'review-form');
  const prefix='review-'+Math.random().toString(16).slice(2);
  const authority=select(prefix+'-authority',[{value:'',label:'Choose the named authority'},...state.context.authorities.map(a=>({value:a.id,label:a.name+' · '+a.reference}))],'');
  authority.required=true;
  const choice=select(prefix+'-decision',[{value:'accept',label:'Accept'},{value:'needs_changes',label:'Needs changes'},...(allowExclude?[{value:'exclude',label:'Exclude from receiving scope'}]:[]),{value:'reopen',label:'Reopen review'}],'accept');
  const note=textarea(prefix+'-note');note.required=true;
  const reference=input(prefix+'-reference');
  add(form,el('h3',label),scope?el('p',scope,'help'):null,
    field('Decision',choice),field('Named authority',authority),field('Review note',note,'Describe the actual receiving decision and any correction needed.'),field('Decision reference',reference));
  const submit=el('button','Save named review');submit.type='submit';form.append(submit);
  form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if (!form.reportValidity()) return;
    const data=typeof selection==='function'?selection():selection;
    const result=await act(type,{...data,decision:choice.value,note:note.value.trim(),authorityId:authority.value,...(reference.value.trim()?{reference:reference.value.trim()}:{})});
    if(result) $('detail').open && $('detail').close();
  });});return form;
}
function noEditions() {
  const p=panel('Receive a completed native case','Start with the original complete CIIM package, containing its captured source, native conversion and mapped editions.');
  p.append(button('Open intake',()=>navigate('intake')));return p;
}
async function overview() {
  const root=el('div');
  const summary=panel(state.context.label || 'Receiving workspace');
  add(summary,kv({'Saved revision':state.revision,'Native editions':state.editions.length,'Original inputs':state.imports.length,'Retained comparisons':state.comparisons.length,'Handbacks':state.handbacks.length}),
    el('p','Enter the receiving context, inspect the original records and profiles, then record named decisions for the handback.','muted'));
  root.append(summary);
  if (!state.editions.length) root.append(noEditions());
  else {
    const p=panel('Native editions','Each row keeps the complete source population and original native result.');
    p.append(grid(['Edition','Repository / selection','Population','Review','Open'],state.editions.map(e=>[
      add(el('div'),el('strong',e.label),el('small',e.nativeEditionId,'mono')),
      add(el('div'),el('p',display(e.repository?.baseUrl || e.repository?.name || e.repository?.id || e.repository)),el('small',display(e.selection))),
      kv(e.counts),status(decision(e.review)),button('Inspect edition',async()=>{selectedEdition=e.id;syncSelection();await navigate('records');})
    ])));
    root.append(p);
  }
  const context=panel('Receiving responsibilities');
  add(context,kv({'Institution':state.context.institution?.name,'Receiving environment':state.context.receivingEnvironment?.name,'Processing profile':state.context.processingProfile?.name,'Named authorities':state.context.authorities.map(a=>a.name).join(', ')}),button('Edit receiving context',()=>navigate('context')));
  root.append(context);return root;
}
async function intake() {
  const root=el('div'),p=panel('Receive an original package','Select the complete native case, a reviewed handback or a portable desk export. The original ZIP and its inventory remain attached to the receiving workspace.');
  const file=input('intake-file','','file');file.accept='.zip,application/zip';file.required=true;
  const expected=input('intake-sha256'); expected.placeholder='Optional original SHA256';
  const form=el('form');add(form,field('Original ZIP',file),field('Expected SHA256',expected));
  const upload=el('button','Inspect original package');upload.type='submit';form.append(upload);
  form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if (!file.files?.[0]) throw Error('Select the original ZIP.');
    const chosen=file.files[0];
    if(chosen.size>state.limits.archiveBytes) throw Error('The original ZIP exceeds '+state.limits.archiveBytes+' bytes.');
    const headers={'Content-Type':'application/zip','X-CIIM-Filename':encodeURIComponent(chosen.name)};
    if(expected.value.trim()) headers['X-CIIM-SHA256']=expected.value.trim();
    imported=await (await request('/api/import',{method:'POST',headers,body:chosen})).json();
    await render();
    showMessage(['workspace','handback'].includes(imported.kind)?'Original complete desk retained and inspected. Restore it into a fresh destination.':'Original package retained and inspected. Choose the editions to receive.');
  });});p.append(form);root.append(p);
  if(imported) {
    const ready=panel('Retained package selection');
    add(ready,kv({'Filename':imported.filename,'SHA256':imported.sha256,'Original bytes':imported.bytes,'Members':imported.memberCount,'Expanded bytes':imported.expandedBytes,'Kind':imported.kind}));
    for(const warning of imported.warnings || []) ready.append(el('p',display(warning),'notice'));
    const label=input('intake-label',imported.filename), choices=el('div',null,'choice-list');
    for(const edition of imported.editions || []) {
      const cb=input('receive-'+edition.id,'','checkbox');cb.value=edition.id;cb.checked=!(imported.existingEditionIds || []).includes(edition.id);cb.disabled=!cb.checked;
      add(choices,field(editionLabel(edition)+' · '+edition.counts.records+' records'+(cb.disabled?' · already received':''),cb));
    }
    const note=textarea('restore-note');
    if(['workspace','handback'].includes(imported.kind)) {
      add(ready,kv({'Original workspace':imported.workspace?.workspaceId,'Original revision':imported.workspace?.revision}),
        field('Restore note',note,'Restore the original complete desk into this fresh empty destination. Then select its saved identity in Applications.'),
        button('Restore complete desk',async()=>{
          if(!note.value.trim()) throw Error('Enter the restore note.');
          await act('workspace.restore',{candidateId:imported.candidateId,note:note.value.trim()});imported=null;await refresh();
        },{disabled:state.revision!==0 || state.editions.length>0 || state.imports.length>0 || state.comparisons.length>0 || state.handbacks.length>0}));
    } else {
      add(ready,field('Receiving label',label),choices,
        button('Receive selected native editions',async()=>{
          const ids=[...choices.querySelectorAll('input:checked:not(:disabled)')].map(n=>n.value);
          if(!ids.length) throw Error('Choose at least one original edition that has not been received.');
          if(!label.value.trim()) throw Error('Enter the receiving label.');
          const result=await act('intake.import',{candidateId:imported.candidateId,label:label.value.trim(),editionIds:ids});
          if(result) { imported=null;selectedEdition=result.result.editionIds?.[0] || selectedEdition;syncSelection();await navigate('records'); }
        }));
    }
    root.append(ready);
  }
  const history=panel('Original received inputs');
  history.append(grid(['Label / original filename','Received','Edition coverage','Original bytes / SHA256'],state.imports.map(i=>[
    add(el('div'),el('strong',i.label),el('p',i.filename)),add(el('div'),el('p',i.importedAt),el('small',i.actor)),String(i.editionIds.length),
    add(el('div'),el('p',i.bytes.toLocaleString()),el('code',i.sha256,'mono'))
  ])));root.append(history);return root;
}
async function showRecord(editionId,recordId) {
  const value=await api('/api/record',{editionId,recordId});
  const root=el('div');$('detail-title').textContent=value.title || value.identifier;
  add(root,kv({'Identifier':value.identifier,'Native observation':value.observationId,'Original ordinal':value.ordinal,'Status':value.status,'Datestamp':value.datestamp,'Record SHA256':value.recordSha256,'Effective decision':value.effectiveDecision}));
  const links=el('div',null,'actions');
  for(const [kind,label] of [['xml','Original XML page'],['native','Native conversion'],['mapped','Mapped page']])
    links.append(button('Download '+label,()=>download('/api/attachment',{editionId,kind,id:value.source?.requestId})));
  root.append(links);
  if(value.status==='deleted') root.append(el('p','The original OAI observation explicitly records deletion. Its identifier and source datestamp remain in this edition.','notice'));
  for(const [index,resource] of (value.native.resources || []).entries()) {
    const section=el('details');section.open=index===0;section.append(el('summary','Resource '+(index+1)));
    section.append(grid(['Original field','Complete repeated values'],Object.entries(resource).map(([key,val])=>[key,el('pre',format(val),'source')])));
    root.append(section);
  }
  add(root,details('Original record issues',value.issues),details('Original provenance',value.provenance),details('Complete native mapped record',value.native),details('Current named review',value.review));
  root.append(reviewForm('records.review',{editionId,recordIds:[recordId]},{allowExclude:true,label:'Review this original record',scope:'One original record: '+value.identifier}));
  $('detail-content').replaceChildren(root);$('detail').showModal();
}
async function records() {
  if(!selectedEdition) return noEditions();
  const edition=state.editions.find(e=>e.id===selectedEdition),result=await readView({view:'records',editionId:selectedEdition,offset:recordOffset,limit:50,status:recordStatus,query:recordQuery});
  const root=panel('Original records','Inspect complete mapped values and their exact original XML/native page before recording a receiving decision.');
  root.append(editionPicker(render));
  const filters=el('form',null,'filters'),q=input('record-query',recordQuery),st=select('record-status',[{value:'',label:'All original statuses'},{value:'active',label:'Active'},{value:'deleted',label:'Deleted'}],recordStatus);
  add(filters,field('Search identifier or title',q),field('Original status',st));const search=el('button','Apply filters');search.type='submit';filters.append(search);
  filters.addEventListener('submit',e=>{e.preventDefault();run(async()=>{recordQuery=q.value;recordStatus=st.value;recordOffset=0;await render();});});root.append(filters);
  add(root,kv({'Complete edition':edition.counts.records,'Filtered rows':result.total,'Selected rows across pages':recordSelection.size,'Population digest':edition.populationDigest}),
    details('Edition readiness',edition.readiness));
  const rows=result.items.map(r=>{
    const cb=input('record-'+r.id,'','checkbox');cb.checked=recordSelection.has(r.id);cb.setAttribute('aria-label','Select '+r.identifier);
    cb.addEventListener('change',()=>{cb.checked?recordSelection.add(r.id):recordSelection.delete(r.id);$('record-selection-count').textContent=recordSelection.size+' selected across pages';});
    return [cb,add(el('div'),button(r.title || r.identifier,()=>showRecord(selectedEdition,r.id),{className:'text-button'}),el('small',r.identifier,'mono')),
      add(el('div'),status(r.status),el('small',r.datestamp)),String(r.issueCount),status(r.effectiveDecision)];
  });
  add(root,grid(['Select','Record','Original status / date','Issues','Receiving decision'],rows,'Original population, page '+(Math.floor(result.offset/result.limit)+1)),
    pager(result,async offset=>{recordOffset=offset;await render();}));
  const selection=el('div',null,'actions'),count=el('span',recordSelection.size+' selected across pages');count.id='record-selection-count';
  add(selection,count,button('Select this page',async()=>{for(const r of result.items)recordSelection.add(r.id);await render();}),button('Clear selection',async()=>{recordSelection.clear();await render();}));
  root.append(selection);
  root.append(reviewForm('records.review',()=>{
    if(!recordSelection.size)throw Error('Select the exact original records to review.');
    return {editionId:selectedEdition,recordIds:[...recordSelection]};
  },{allowExclude:true,label:'Review selected records',scope:'Applies only to the original IDs selected across pages; a search does not select hidden rows.'}));
  root.append(reviewForm('edition.review',{editionId:selectedEdition},{label:'Review the complete edition',scope:'Applies to all '+edition.counts.records+' records in population '+edition.populationDigest+'. Later explicit record decisions override this edition decision.'}));
  return root;
}
async function profiles() {
  if(!selectedEdition)return noEditions();
  const result=await readView({view:'profiles',editionId:selectedEdition,offset:profileOffset,limit:25}),edition=state.editions.find(e=>e.id===selectedEdition);
  const root=panel('Native transformation profiles','These are the exact native profiles used for this edition. Acceptance records the named review of those retained bytes.');
  root.append(editionPicker(render));
  const actions=el('div',null,'actions');
  for(const [kind,label] of [['manifest','Delivery manifest'],['operation','Native operation'],['source','Original source']])
    actions.append(button('Download '+label,()=>download('/api/attachment',{editionId:selectedEdition,kind})));
  root.append(actions);
  add(root,details('Receiving readiness',edition.readiness),pager(result,async offset=>{profileOffset=offset;await render();}));
  for(const item of result.items) {
    const card=panel(item.file);
    add(card,kv({'Profile SHA256':item.sha256,'Bytes':item.bytes,'Review':decision(item.review)}),details('Complete native specification',item.specification),
      button('Download original profile',()=>download('/api/attachment',{editionId:selectedEdition,kind:'profile',id:item.sha256})),
      reviewForm('profile.review',{editionId:selectedEdition,profileSha256:item.sha256},{label:'Review this profile',scope:item.file+' · '+item.sha256}));
    root.append(card);
  }
  return root;
}
async function comparisons() {
  const root=el('div'),create=panel('Compare native editions','Choose two editions from the same original repository and metadata prefix. Explicit withdrawal stays distinct from a record absent from an edition.');
  const opts=[{value:'',label:'Choose an original edition'},...state.editions.map(e=>({value:e.id,label:editionLabel(e)}))];
  const before=select('comparison-before',opts,''),after=select('comparison-after',opts,''),label=input('comparison-label');
  add(create,field('Earlier edition',before),field('Later edition',after),field('Comparison label',label),button('Save complete edition comparison',async()=>{
    if(!before.value || !after.value || before.value===after.value || !label.value.trim())throw Error('Choose two distinct original editions and a comparison label.');
    const result=await act('comparison.create',{beforeEditionId:before.value,afterEditionId:after.value,label:label.value.trim()});
    selectedComparison=result.result.comparisonId;comparisonOffset=0;await render();
  }));root.append(create);
  if(!state.comparisons.length)return root;
  const chosen=select('comparison-selected',state.comparisons.map(c=>({value:c.id,label:c.label})),selectedComparison);
  chosen.addEventListener('change',e=>run(async()=>{selectedComparison=e.target.value;comparisonOffset=0;await render();}));
  const p=panel('Saved edition changes');p.append(field('Retained comparison',chosen));
  const metadata=state.comparisons.find(c=>c.id===selectedComparison),result=await readView({view:'comparison',comparisonId:selectedComparison,offset:comparisonOffset,limit:50});
  add(p,kv(metadata.counts),details('Original comparison identity',metadata));
  const rows=result.items.map(r=>{
    const changes=el('details');changes.append(el('summary',r.changes.length+' complete field changes'));
    changes.append(grid(['Original path','Earlier value','Later value'],r.changes.map(c=>[el('code',c.path,'mono'),el('pre',c.before.present?format(c.before.value):'Absent','source'),el('pre',c.after.present?format(c.after.value):'Absent','source')])));
    const before=r.before?button('Earlier record',()=>showRecord(metadata.beforeEditionId,r.before.recordId)):el('span','Absent');
    const after=r.after?button('Later record',()=>showRecord(metadata.afterEditionId,r.after.recordId)):el('span','Absent');
    return [el('code',r.identifier,'mono'),status(r.change),before,after,changes];
  });
  add(p,grid(['Original identifier','Change','Earlier','Later','Changed fields'],rows),pager(result,async offset=>{comparisonOffset=offset;await render();}),
    reviewForm('comparison.review',{comparisonId:selectedComparison},{label:'Review the complete edition comparison',scope:'Named review covers the complete '+result.total+'-record comparison, including pages outside this view.'}));
  root.append(p);return root;
}
function checkboxList(id, items) {
  const root=el('div',null,'choice-list');root.id=id;
  for(const item of items){const cb=input(id+'-'+item.id,'','checkbox');cb.value=item.id;add(root,field(item.nativeEditionId?editionLabel(item):item.label,cb));}
  return root;
}
async function handbacks() {
  const root=el('div'),p=panel('Create a reviewed handback','Select the reviewed native editions and comparisons for this receiving package. The original input ZIPs remain complete; their inventory can include additional native editions outside the selected review scope.');
  const label=input('handback-label'),editions=checkboxList('handback-editions',state.editions),comparisons=checkboxList('handback-comparisons',state.comparisons),note=textarea('handback-note'),
    authority=select('handback-authority',[{value:'',label:'Choose the named authority'},...state.context.authorities.map(a=>({value:a.id,label:a.name+' · '+a.reference}))],'');
  add(p,field('Handback label',label),el('h3','Reviewed editions'),editions,el('h3','Reviewed comparisons'),comparisons,field('Named authority',authority),field('Handback note',note),
    button('Create immutable handback',async()=>{
      const editionIds=[...editions.querySelectorAll('input:checked')].map(n=>n.value),comparisonIds=[...comparisons.querySelectorAll('input:checked')].map(n=>n.value);
      if(!editionIds.length || !label.value.trim() || !authority.value || !note.value.trim())throw Error('Select editions, label, named authority and the handback note.');
      const result=await act('handback.create',{label:label.value.trim(),editionIds,comparisonIds,note:note.value.trim(),authorityId:authority.value});
      showMessage('Handback '+result.result.handbackId+' retains this exact review and receiving context.');await render();
    }));
  root.append(p);
  const saved=panel('Retained handbacks','Historical handbacks keep their original context and decisions when later editions or reviews change.');
  saved.append(grid(['Handback','Created','Selected scope','Original digest / output'],state.handbacks.map(h=>[
    add(el('div'),el('strong',h.label),el('small',h.id,'mono')),
    add(el('div'),el('p',h.createdAt),el('small',h.actor+' · revision '+h.revision)),
    kv({'Editions':h.editionIds.length,'Comparisons':h.comparisonIds.length,...h.counts}),
    add(el('div'),el('code',h.sha256,'mono'),button('Download complete handback',()=>download('/api/export/handback',{handbackId:h.id})))
  ])));root.append(saved);return root;
}
async function context() {
  const c=state.context,root=panel('Receiving context and responsibilities','Record the selected institutional authority, processing profile and receiving environment. These named choices accompany the reviewed handback.');
  const form=el('form'),label=input('context-label',c.label),institution=input('institution-name',c.institution?.name),institutionRef=input('institution-reference',c.institution?.reference),
    environment=input('environment-name',c.receivingEnvironment?.name),environmentRef=input('environment-reference',c.receivingEnvironment?.reference),
    profile=input('processing-name',c.processingProfile?.name),profileRef=input('processing-reference',c.processingProfile?.reference),profileVersion=input('processing-version',c.processingProfile?.version),note=textarea('context-note',c.note);
  label.required=true;note.required=true;
  add(form,field('Workspace label',label),field('Institution',institution),field('Institution reference',institutionRef),field('Receiving environment',environment),field('Environment reference',environmentRef),
    field('Selected processing profile',profile),field('Processing profile reference',profileRef),field('Processing profile version',profileVersion),el('h3','Named receiving authorities'));
  const rows=el('div',null,'authority-rows');
  function addAuthority(value={id:crypto.randomUUID(),name:'',reference:''}) {
    const row=el('div',null,'authority-row');row.dataset.identity=value.id;
    const name=input('authority-name-'+value.id,value.name),reference=input('authority-reference-'+value.id,value.reference);
    name.required=true;reference.required=true;name.dataset.authorityName='';reference.dataset.authorityReference='';
    add(row,field('Name',name),field('Authority / responsibility reference',reference),el('small',value.id,'mono'),
      button('Remove authority row',async()=>row.remove()));rows.append(row);
  }
  for(const a of c.authorities)addAuthority(a);
  add(form,rows,button('Add named authority',async()=>addAuthority()),field('Context note',note,'Describe the receiving scope and how responsibilities were selected.'));
  const save=el('button','Save receiving context');save.type='submit';form.append(save);
  function named(name,ref,extra={}) {
    if(!name.value.trim() && !ref.value.trim() && !Object.values(extra).some(Boolean))return null;
    if(!name.value.trim() || !ref.value.trim())throw Error('Named context choices require both name and reference.');
    return {name:name.value.trim(),reference:ref.value.trim(),...extra};
  }
  form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!form.reportValidity())return;
    const authorities=[...rows.children].map(row=>({id:row.dataset.identity,name:row.querySelector('[data-authority-name]').value.trim(),reference:row.querySelector('[data-authority-reference]').value.trim()}));
    await act('context.save',{label:label.value.trim(),institution:named(institution,institutionRef),receivingEnvironment:named(environment,environmentRef),
      processingProfile:named(profile,profileRef,{version:profileVersion.value.trim()}),authorities,note:note.value.trim()});
  });});root.append(form);return root;
}
async function historyView() {
  const result=await readView({view:'history',offset:historyOffset,limit:50}),root=panel('Saved receiving history','Original requests, named reviews and receiving outputs stay in this same workspace.');
  root.append(grid(['Operation / event','Actor / time','Original details'],result.items.map(item=>[
    add(el('div'),el('strong',words(item.type || item.kind || item.action)),el('small',item.operationId || item.id,'mono')),
    add(el('div'),el('p',item.actor || item.by || ''),el('small',item.at || item.createdAt || '')),
    details('Complete saved event',item)
  ])));
  root.append(pager(result,async offset=>{historyOffset=offset;await render();}));return root;
}
async function render() {
  if(!state || !alive)return;
  $('workspace-label').textContent=state.context.label || 'Receiving workspace';
  $('revision').textContent='Revision '+state.revision;
  for(const button of $('navigation').querySelectorAll('button'))button.setAttribute('aria-current',button.dataset.view===view?'page':'false');
  const params=new URLSearchParams({view});
  if(selectedEdition)params.set('editionId',selectedEdition);
  if(selectedComparison)params.set('comparisonId',selectedComparison);
  history.replaceState(null,'',location.pathname+'?'+params);
  const renderers={overview,intake,records,profiles,comparison:comparisons,handbacks,context,history:historyView};
  const content=await renderers[view]();
  if(alive)$('content').replaceChildren(content);
}
async function navigate(next) { view=next;await render();$('main').focus(); }
for(const b of $('navigation').querySelectorAll('button'))b.addEventListener('click',()=>run(()=>navigate(b.dataset.view)));
$('refresh').addEventListener('click',()=>run(refresh));
$('workspace-export').addEventListener('click',()=>run(()=>download('/api/export/workspace')));
$('recover').addEventListener('click',()=>run(submitPending));
$('discard-pending').addEventListener('click',()=>run(async()=>{
  if(!pending || pending.status!=='rejected')throw Error('Recover this request to establish its original outcome first.');
  await deletePending(pending.workspaceId,pending.request.operationId);pending=null;renderPending();await refresh();
  showMessage('The rejected request was dismissed. Its original input can now be corrected against current saved state.');
}));
$('close-detail').addEventListener('click',()=>$('detail').close());
$('connection-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const value=$('session-token').value.trim();if(!/^[a-f0-9]{64}$/.test(value))throw Error('Use the original 64-character local session token.');
  token=value;try{sessionStorage.setItem(tokenKey,token);}catch{}$('session-token').value='';await refresh();
});});
window.addEventListener('pagehide',()=>{alive=false;});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('storage',event=>{if(event.key==='ciim-receiving-change')run(refresh);});
if(token)run(refresh);else $('connection').hidden=false;
