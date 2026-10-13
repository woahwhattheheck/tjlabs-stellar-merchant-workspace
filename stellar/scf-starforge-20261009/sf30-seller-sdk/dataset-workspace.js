/* MIT. Browser client for local operator previews; never fetches a merchant URL. */
import { createStudy,validateStudy,updateStudy,checkpointStudy,forkStudy,rebindStudy,restoreEdition,
  sourceBinding,emptyDraft,sameSource,queryFromDraft,STUDY_MAX_BYTES } from '/dataset-study-core.mjs';
const $ = id => document.getElementById(id);
const text = (tag, value, className) => {
  const node = document.createElement(tag); node.textContent = String(value);
  if (className) node.className = className;
  return node;
};
const sessionKey = 'sf30-dataset-workspace-session';
let token = location.hash.slice(1);
try {
  if (token) { sessionStorage.setItem(sessionKey, token); history.replaceState(null, '', '/'); }
  else token = sessionStorage.getItem(sessionKey) || '';
} catch { /* Session still works without browser storage; use the printed URL after reload. */ }
let schema, controls = [], latest = null, currentQuery = '', historyQueries = [], busy = false;
let catalogBusy = false, activationNeedsRefresh = false;
let study=null, storageRevision=null, studiesEnabled=false, studyBusy=false, editGeneration=0, switchGeneration=0;
let recoveryTimer=null, pendingStudy=null, exportJob=null, exportPoll=null;
const pendingSaves=new Map();let exportGeneration=0;
const memoryRecovery=new Map(), recoveryPrefix='sf30-dataset-study:';
const now=()=>new Date().toISOString(), newId=()=>crypto.randomUUID();
const selectedVersion = () => schema?.versions?.versions.find(version => version.snapshot === $('version').value);
const short = value => String(value).slice(0, 12);
function status(message, error = false) {
  $('status').textContent = message; $('status').className = error ? 'error' : '';
}
function buttons() {
  for (const id of ['run', 'run-raw', 'reset']) $(id).disabled = busy || studyBusy || !schema;
  if (selectedVersion()?.status === 'EXPIRED') $('run').disabled = true;
  $('version').disabled = busy || !schema?.versions;
  $('refresh-state').disabled = busy || !schema?.versions;
  $('activate').disabled = busy || activationNeedsRefresh || !selectedVersion() ||
    selectedVersion().snapshot === schema?.versions?.current;
  $('refresh-catalog').disabled = catalogBusy;
  $('previous').disabled = busy || !historyQueries.length;
  $('next').disabled = busy || !latest?.result.page.nextCursor;
  $('save-query').disabled = busy || !latest;
  $('save-result').disabled = busy || !latest;
  $('copy').disabled = busy || !latest?.curl;
  studyButtons();
}
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', credentials: 'omit' });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message || value.error || 'HTTP ' + response.status),
    { code: value.error, status: response.status });
  return value;
}
function input(label) {
  const node = document.createElement('input'); node.type = 'text'; node.setAttribute('aria-label', label);
  node.autocomplete = 'off'; return node;
}
function bound(column, side) {
  const cell = document.createElement('td');
  if (!column.rangeFilterable) { cell.textContent = '—'; return { cell }; }
  const op = document.createElement('select'); op.setAttribute('aria-label', `${column.name} ${side} operator`);
  const choices = side === 'lower' ? [['', 'None'], ['gt', '>'], ['gte', '≥']] : [['', 'None'], ['lt', '<'], ['lte', '≤']];
  choices.forEach(([value, label]) => { const option = text('option', label); option.value = value; op.append(option); });
  const value = input(`${column.name} ${side} value`); value.disabled = true;
  op.addEventListener('change', () => { value.disabled = !op.value; });
  cell.append(op, value); return { cell, op, value };
}
function renderControls() {
  const body = $('columns').tBodies[0]; body.replaceChildren(); controls = [];
  const description=study?.working.source.dataset || schema.dataset;
  for (const c of description.columns) {
    const row = document.createElement('tr');
    const include = document.createElement('input'); include.type = 'checkbox'; include.checked = true;
    include.setAttribute('aria-label', `Include ${c.name}`);
    const label = text('label', c.name); label.prepend(include);
    const fieldCell = document.createElement('td'); fieldCell.append(label);
    row.append(fieldCell, text('td', c.type + (c.nullable ? ' / null' : '')));
    const eqCell = document.createElement('td'); let eqEnabled, eqValue;
    if (c.filterable) {
      eqEnabled = document.createElement('input'); eqEnabled.type = 'checkbox';
      eqEnabled.setAttribute('aria-label', `${c.name} equality enabled`);
      eqValue = input(`${c.name} equals value`); eqValue.disabled = true;
      eqEnabled.addEventListener('change', () => { eqValue.disabled = !eqEnabled.checked; });
      eqCell.append(eqEnabled, eqValue);
    } else eqCell.textContent = '—';
    const low = bound(c, 'lower'), high = bound(c, 'upper');
    row.append(eqCell, low.cell, high.cell); body.append(row);
    controls.push({ c, include, eqEnabled, eqValue, low, high });
  }
  $('sort').replaceChildren(text('option', 'CSV record order')); $('sort').options[0].value = '';
  for (const c of description.columns.filter(c => c.sortable)) {
    const option = text('option', c.name); option.value = c.name; $('sort').append(option);
  }
  $('sort').disabled = !description.columns.some(c => c.sortable);
  $('limit').value = description.defaultLimit; $('limit').max = description.maxLimit;
  $('descending').checked = false;
}
function formQuery() {
  return queryFromDraft(readDraft('guided'),study.working.source.dataset,{service:study.working.source.mode==='service'});
}
function renderResult(value) {
  const result = value.result;
  const headers = document.createElement('tr');
  result.fields.forEach(field => { const th = text('th', field); th.scope = 'col'; headers.append(th); });
  $('results').tHead.replaceChildren(headers);
  const fragment = document.createDocumentFragment();
  for (const row of result.rows) {
    const tr = document.createElement('tr');
    for (const field of result.fields) {
      const value = row[field]; tr.append(text('td', value === null ? 'null' : value, value === null ? 'null' : ''));
    }
    fragment.append(tr);
  }
  $('results').tBodies[0].replaceChildren(fragment);
  const order = result.order ? `${result.order.column} ${result.order.direction}; nulls last; CSV ties` : 'CSV record order';
  $('result-summary').textContent = `${result.page.returned.toLocaleString()} returned / ${result.page.total.toLocaleString()} matching records · ${order}`;
  $('result-snapshot').textContent = 'Preview snapshot · ' + value.snapshot;
  $('recipe').textContent = value.curl ? value.requestUrl + '\n\n' + value.curl : value.requestUnavailable || 'No public resource configured. The saved query still contains exact parameters and snapshot identity. Restart with --resource to add public request examples.';
}
async function run(query, mode = 'new', editorMode = 'guided') {
  if (busy || studyBusy || !study) return;
  try {
    captureDraft(editorMode);
    if (!sameSource(study,schema)) throw new Error('This study belongs to a different source. Review its saved binding below, then explicitly adopt the displayed source to run here.');
    const q=new URLSearchParams(query);
    if (study.working.source.mode==='service') {
      const pinned=study.working.draft.selectedSnapshot || study.working.source.dataset.snapshot;
      if (q.has('snapshot') && q.get('snapshot')!==pinned) throw new Error('The edited query selects a different snapshot. Select that snapshot in the study controls before running it.');
      q.set('snapshot',pinned);
    }
    query=q.toString();
  } catch(error) { status(error.message,true); return; }
  const submitted=readDraft(editorMode), generation=switchGeneration;
  busy = true; buttons(); status('Preparing query against the study’s selected source snapshot…');
  try {
    const result = await api('/api/query', { query });
    if (generation!==switchGeneration) return;
    if (mode === 'next') historyQueries.push(currentQuery);
    else if (mode === 'previous') historyQueries.pop();
    else historyQueries = [];
    latest = result; currentQuery = result.query;
    const live=readDraft();
    const success={...result,executedAt:now()};
    if (mode==='new') {
      const executed=updateStudy(study,{draft:submitted,lastSuccess:success});
      study=checkpointStudy(executed,{at:now(),reason:'Successful '+editorMode+' query'});
    }
    study=updateStudy(study,{draft:live,lastSuccess:success});
    renderResult(result); renderStudy(); persistRecovery();
    status('Preview complete. '+result.result.page.total.toLocaleString()+' matching records. The successful query and unfinished controls are retained.');
  } catch (error) { status(error.message + (latest ? ' The last successful result remains below.' : ''), true); }
  finally { busy = false; buttons(); }
}
function save(name, value) {
  const workingFile=name.startsWith('dataset-study-');
  const serialized=workingFile ? JSON.stringify(value) : JSON.stringify(value,null,2)+'\n';
  if(workingFile && new TextEncoder().encode(serialized).length>STUDY_MAX_BYTES)throw new Error('The complete working file exceeds 8 MiB.');
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('run').addEventListener('click', () => {
  try { run(formQuery(), 'new', 'guided'); } catch (error) { status(error.message, true); }
});
$('run-raw').addEventListener('click', () => run($('raw').value.replace(/^\?/, ''), 'new', 'raw'));
$('next').addEventListener('click', () => {
  if (!latest?.result.page.nextCursor) return;
  const q = new URLSearchParams(currentQuery); q.set('cursor', latest.result.page.nextCursor); run(q.toString(), 'next', study.working.draft.mode);
});
$('previous').addEventListener('click', () => { if (historyQueries.length) run(historyQueries.at(-1), 'previous', study.working.draft.mode); });
$('reset').addEventListener('click', () => {
  try { captureDraft(); study=checkpointStudy(study,{at:now(),reason:'Preserved before query reset'});
    const fresh=emptyDraft(study.working.source.dataset); fresh.selectedSnapshot=study.working.draft.selectedSnapshot;
    study=updateStudy(study,{draft:fresh}); renderControls(); applyDraft(fresh); edited();
    status('Query controls reset. Earlier controls are retained in the edition history.'); }
  catch(error) { status(error.message,true); }
});
$('save-query').addEventListener('click', () => {
  if (!latest) return;
  const { schema, mode, snapshot, query, requestUrl, requestUnavailable } = latest;
  save('dataset-query.json', { schema, mode, snapshot, query, requestUrl,
    ...(requestUnavailable ? { requestUnavailable } : {}) });
});
$('save-result').addEventListener('click', () => { if (latest) save('dataset-page.json', latest.result); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(latest.curl); status('Unpaid request example copied.'); }
  catch { status('Clipboard unavailable. Select and copy the request example shown above.', true); }
});
function selectionNote() {
  const selected = selectedVersion();
  $('selection-note').textContent = !selected ?
    'No snapshot parameter is added. The running service selects its current dataset when the query is admitted.' :
    selected.status === 'EXPIRED' ?
      'This stored version has expired for new queries. You can explicitly reactivate it while it is still stored.' :
      'New previews explicitly select ' + selected.snapshot + '. Continuation keeps the original cursor unchanged.';
  $('activation-note').textContent = schema?.versions ?
    'Activation uses displayed revision ' + schema.versions.revision + ' and current snapshot ' +
      short(schema.versions.current) + '. It changes the current pointer; the previous snapshot keeps its configured retention period.' : '';
}
function renderVersions() {
  const live = schema.versions;
  $('version-panel').hidden = !live;
  if (!live) return;
  const selected = study?.working.draft.selectedSnapshot ?? $('version').value;
  $('version-summary').textContent = 'Revision ' + live.revision + ' · ' + live.versions.length + ' / ' +
    live.settings.maxVersions + ' stored versions · ' + live.retainedSourceBytes.toLocaleString() + ' source bytes retained';
  $('cache-summary').textContent = 'Parsed cache: ' + live.cache.residentVersions + ' / ' +
    live.cache.maxCachedVersions + ' snapshots · ' + live.cache.residentRows.toLocaleString() + ' / ' +
    live.cache.maxResidentRows.toLocaleString() + ' rows. Cold snapshots load within this same budget.';
  const body = $('versions').tBodies[0]; body.replaceChildren();
  $('version').replaceChildren(text('option', 'Current at request admission')); $('version').options[0].value = '';
  for (const version of live.versions) {
    const row = document.createElement('tr');
    row.append(text('td', version.snapshot, 'mono digest'), text('td', version.status),
      text('td', version.rowCount.toLocaleString()), text('td', version.resident ? 'Resident' : 'Cold'),
      text('td', version.readers + ' / ' + version.loading),
      text('td', version.expiresAt === null ? 'Current — no expiry' : new Date(version.expiresAt).toISOString()));
    body.append(row);
    const option = text('option', short(version.snapshot) + ' · ' + version.status + ' · ' + version.rowCount + ' rows');
    option.value = version.snapshot; $('version').append(option);
  }
  if (selected && !live.versions.some(version => version.snapshot === selected)) {
    const missing=text('option',short(selected)+' · unavailable in current inventory'); missing.value=selected; $('version').append(missing);
  }
  $('version').value=selected;
  selectionNote();
}
function renderSchema(value, reset = false) {
  schema = value;
  const d = schema.dataset;
  $('stats').replaceChildren();
  for (const [value, label] of [[d.name, 'Dataset'], [d.rowCount.toLocaleString(), 'Source records'],
    [d.columns.length, 'Exposed columns'], [d.maxLimit, 'Maximum page size']]) {
    const block = document.createElement('div'); block.append(text('strong', value), text('span', label, 'muted')); $('stats').append(block);
  }
  $('snapshot-heading').textContent = schema.versions ? 'Current source snapshot' : 'Source snapshot';
  $('snapshot').textContent = 'Snapshot · ' + d.snapshot;
  $('resource').textContent = schema.resource ? 'Public request examples target ' + schema.resource + ' (not contacted).' :
    'No public resource configured. Query preparation and exports remain available.';
  if (schema.versions) {
    $('subtitle').textContent = 'Inspect the running dataset, prepare native queries and manage retained versions.';
    $('resource').textContent += schema.publicSnapshotSelection ?
      ' This route advertises optional first-page snapshot selection.' :
      ' This route accepts current queries and original cursors; first-page selection stays private.';
    $('footer-note').textContent = 'The workspace uses the running service’s original dataset engine and private control connection. Preview reads expose only configured columns and do not make a payment. Making a snapshot current changes the retained version pointer with snapshot and revision checks. Keep the session URL private; close this workspace when finished.';
  }
  $('catalog-panel').hidden = !schema.catalogConfigured;
  renderVersions();
  if (reset) renderControls();
}
async function refreshSchema() {
  const value = await api('/api/schema');
  renderSchema(value); activationNeedsRefresh = false; renderStudy();
}
async function refreshCatalog() {
  if (!schema?.catalogConfigured || catalogBusy) return;
  catalogBusy = true; buttons();
  try {
    const value = await api('/api/catalog');
    $('catalog-summary').textContent = value.state + ' · ' + value.activeResources + ' active catalog resources · ' +
      value.committedOperations + ' committed operations. This is catalog-wide status.';
    $('catalog-head').textContent = 'Journal head · ' + value.journalHead;
    $('catalog-origin').textContent = 'Live discovery origin · ' + value.discoveryOrigin;
  } catch (error) {
    $('catalog-summary').textContent = error.message; $('catalog-head').textContent = ''; $('catalog-origin').textContent = '';
  } finally { catalogBusy = false; buttons(); }
}
$('version').addEventListener('change', () => {
  if (!study) return;
  try {
    const chosen=$('version').value || schema.dataset.snapshot;
    study=checkpointStudy(study,{at:now(),reason:'Preserved before snapshot selection'});
    const draft={...readDraft(),selectedSnapshot:chosen};
    study=updateStudy(study,{draft,lastSuccess:null}); clearResult(); edited(); renderVersions(); renderStudy();
    selectionNote(); buttons(); status('Study snapshot selected. Earlier query editions retain their original snapshots.');
  } catch(error) { status(error.message,true); }
});
$('refresh-state').addEventListener('click', async () => {
  if (busy) return;
  busy = true; buttons(); status('Reading current versions and parsed-cache occupancy…');
  try { await refreshSchema(); status('Live state refreshed. Existing query cursors and explicit snapshot selections are preserved.'); }
  catch (error) { activationNeedsRefresh = true; status(error.message, true); }
  finally { busy = false; buttons(); }
});
$('activate').addEventListener('click', async () => {
  const selected = selectedVersion();
  if (busy || !selected || activationNeedsRefresh) return;
  const input = { snapshot: selected.snapshot, expectedSnapshot: schema.versions.current, expectedRevision: schema.versions.revision };
  busy = true; buttons(); status('Making the selected retained snapshot current…');
  try {
    const result = await api('/api/activate', input);
    renderSchema(result.workspace); activationNeedsRefresh = false; renderStudy();
    status((result.activation.changed ? 'Activated ' : 'Already current: ') + short(result.activation.current) +
      '. Live state is revision ' + schema.versions.revision + ', current ' + short(schema.versions.current) + '.');
  } catch (error) {
    activationNeedsRefresh = true;
    let refreshed = false;
    try { await refreshSchema(); refreshed = true; } catch { /* Keep the stale state visibly non-actionable. */ }
    status(error.message + (refreshed ?
      ' Live state has been refreshed. Review the selection and choose Make current again if appropriate.' :
      ' Refresh live state to inspect the current result before another activation.'), true);
  } finally { busy = false; buttons(); }
});
$('refresh-catalog').addEventListener('click', refreshCatalog);

function clearResult() {
  latest=null; currentQuery=''; historyQueries=[];
  $('results').tHead.replaceChildren(); $('results').tBodies[0].replaceChildren();
  $('result-summary').textContent='Run a query to inspect selected records.';
  $('result-snapshot').textContent=''; $('recipe').textContent='Preview a query to prepare a request example.';
}
function readDraft(mode) {
  return {mode:mode || study.working.draft.mode,raw:$('raw').value,
    selectedSnapshot:study.working.source.mode==='service' ? ($('version').value || study.working.draft.selectedSnapshot || study.working.source.dataset.snapshot) : '',
    columns:controls.map(c=>({name:c.c.name,include:c.include.checked,eqEnabled:Boolean(c.eqEnabled?.checked),
      eqValue:c.eqValue?.value ?? '',lowerOp:c.low.op?.value ?? '',lowerValue:c.low.value?.value ?? '',
      upperOp:c.high.op?.value ?? '',upperValue:c.high.value?.value ?? ''})),
    sort:$('sort').value,descending:$('descending').checked,limit:$('limit').value};
}
function captureDraft(mode) {
  if (!study) return;
  study=updateStudy(study,{title:$('study-title').value,draft:readDraft(mode)});
}
function applyDraft(d) {
  const byName=new Map(d.columns.map(c=>[c.name,c]));
  for (const c of controls) {
    const v=byName.get(c.c.name); if (!v) continue;
    c.include.checked=v.include;
    if(c.eqEnabled) {c.eqEnabled.checked=v.eqEnabled;c.eqValue.value=v.eqValue;c.eqValue.disabled=!v.eqEnabled;}
    for(const [b,op,value] of [[c.low,v.lowerOp,v.lowerValue],[c.high,v.upperOp,v.upperValue]]) {
      if(b.op) {b.op.value=op;b.value.value=value;b.value.disabled=!op;}
    }
  }
  $('sort').value=d.sort; $('descending').checked=d.descending; $('limit').value=d.limit; $('raw').value=d.raw;
  renderVersions();
}
function studyButtons() {
  const locked=busy || studyBusy;
  for(const id of ['study-new','study-open','study-reload-list','study-open-saved','study-fork','study-adopt','study-restore','study-apply-open'])
    $(id).disabled=locked || (id==='study-open-saved' && !$('study-list').value) ||
      (id==='study-restore' && !$('study-editions').value) || (id==='study-apply-open' && !pendingStudy);
  $('study-download').disabled=locked || !study;
  $('study-save').disabled=locked || !study || !studiesEnabled;
  $('export-all').disabled=locked || !latest || !studiesEnabled;
  $('export-resume').disabled=locked || !exportJob || !['READY','INTERRUPTED','FAILED','PAUSED'].includes(String(exportJob.status).toUpperCase());
}
function renderStudy() {
  if(!study) return;
  const w=study.working, d=w.source.dataset;
  $('study-binding').textContent='Study source · '+d.name+' · '+w.source.mode+' · '+(w.source.resource || 'local CSV')+
    '\nBound dataset snapshot · '+d.snapshot+'\nSelected query snapshot · '+(w.draft.selectedSnapshot || d.snapshot);
  $('study-summary').textContent=study.editions.length+' saved editions · '+(storageRevision===null?'not saved in this private study store':'private store revision '+storageRevision)+
    (study.parent ? ' · fork of '+study.parent.id+' / edition '+study.parent.edition:'');
  $('study-source-note').textContent=sameSource(study,schema) ?
    'This study can run against this source. Its selected snapshot remains fixed when the live service changes.' :
    'This study belongs to a different source. Its controls and saved page are preserved. Adopt the displayed source explicitly to prepare a new run here.';
  const selected=$('study-editions').value;
  $('study-editions').replaceChildren(text('option','Choose an earlier edition')); $('study-editions').options[0].value='';
  for(const e of [...study.editions].reverse()) {
    const o=text('option',e.number+' · '+e.at+' · '+e.reason+(e.success?' · '+e.success.total+' matches':''));
    o.value=String(e.number); $('study-editions').append(o);
  }
  $('study-editions').value=selected;
  $('study-storage').textContent=studiesEnabled ?
    'Save stores the complete study in the private directory selected at launch. Download working file includes unfinished controls, the latest preview and all editions.' :
    'Working files and browser recovery are available. Start with --studies PRIVATE_DIR to enable durable native saves and complete-result exports.';
  studyButtons();
}
function persistRecovery() {
  if(!study) return true;
  try {
    captureDraft();
    const record={study,storageRevision,savedAt:now()};
    memoryRecovery.set(study.id,record);
    localStorage.setItem(recoveryPrefix+study.id,JSON.stringify(record));
    $('study-recovery-warning').textContent='';
    return true;
  } catch(error) {
    $('study-recovery-warning').textContent='Browser recovery could not be written: '+error.message+
      ' Use Download working file or Save study to retain the current work before closing.';
    return false;
  }
}
function edited() {
  editGeneration++;
  try {captureDraft();} catch(error) {
    $('study-recovery-warning').textContent=error.message+' Current controls remain on screen; shorten the indicated field before saving.';
  }
  clearTimeout(recoveryTimer); recoveryTimer=setTimeout(()=>{persistRecovery();renderStudy();},250);
}
function preserveCurrent() {
  if(!study) return;
  captureDraft(); persistRecovery();
  memoryRecovery.set(study.id,{study:JSON.parse(JSON.stringify(study)),storageRevision,savedAt:now()});
}
function installStudy(value,revision=null) {
  validateStudy(value); switchGeneration++; study=JSON.parse(JSON.stringify(value)); storageRevision=revision;
  $('study-title').value=study.title; clearResult(); renderControls(); applyDraft(study.working.draft);
  if(study.working.lastSuccess) {latest=study.working.lastSuccess;currentQuery=latest.query;renderResult(latest);}
  renderStudy(); persistRecovery(); buttons();
  clearTimeout(exportPoll);exportGeneration++;exportJob=null;$('export-files').replaceChildren();$('export-status').textContent='Choose a saved export or export the complete selected result.';
  refreshExports().catch(error=>{$('export-status').textContent=error.message;});
}
async function refreshStudies() {
  const selected=$('study-list').value;
  const all=new Map(memoryRecovery);
  try {
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i); if(!key?.startsWith(recoveryPrefix)) continue;
      try {
        const r=JSON.parse(localStorage.getItem(key)); validateStudy(r.study);
        if(!all.has(r.study.id)) all.set(r.study.id,r);
      } catch { /* A malformed stored copy stays untouched. */ }
    }
  } catch { /* Explicit save/download remains available. */ }
  $('study-list').replaceChildren(text('option','Choose a saved study')); $('study-list').options[0].value='';
  try {
    const found=await api('/api/studies'); studiesEnabled=found.enabled;
    for(const r of found.studies || []) {
      const o=text('option','Private store · '+(r.title || 'Untitled')+' · revision '+r.storageRevision);
      o.value='native:'+r.id; $('study-list').append(o);
    }
  } catch(error) { status('Study store could not be read: '+error.message,true); }
  for(const [id,r] of all) {
    memoryRecovery.set(id,r);
    const o=text('option','Browser recovery · '+(r.study.title || 'Untitled')+' · '+r.savedAt);
    o.value='recovery:'+id; $('study-list').append(o);
  }
  $('study-list').value=selected; renderStudy(); buttons();
}
async function nativeSave(reason='Saved working study') {
  captureDraft();
  const originalId=study.id, generation=switchGeneration;
  const pending=pendingSaves.get(originalId);
  if(pending) {
    const recovered=await api('/api/studies/save',pending);
    if(generation!==switchGeneration || originalId!==study.id) return recovered;
    storageRevision=recovered.storageRevision;pendingSaves.delete(originalId);
    if(JSON.stringify(study)===JSON.stringify(recovered.study)) {
      persistRecovery();renderStudy();return recovered;
    }
  }
  const candidate=checkpointStudy(study,{at:now(),reason}),edits=editGeneration;
  const request={study:candidate,expectedRevision:storageRevision};
  study=candidate;pendingSaves.set(originalId,request);persistRecovery();renderStudy();
  const saved=await api('/api/studies/save',request);
  pendingSaves.delete(originalId);
  if(generation!==switchGeneration || originalId!==study.id) return saved;
  if(edits===editGeneration)study=saved.study;
  else captureDraft();
  storageRevision=saved.storageRevision;persistRecovery();renderStudy();
  return saved;
}
function setExport(job,generation=exportGeneration) {
  if(generation!==exportGeneration || job.studyId!==study?.id)return;
  exportJob=job;
  const total=job.total===undefined || job.total===null ? 'unknown' : job.total.toLocaleString();
  $('export-status').textContent='Complete result · '+job.status+' · '+(job.rows??0).toLocaleString()+' / '+total+
    ' rows · '+(job.pages??0)+' pages'+(job.error?' · '+(job.error.message || job.error):'');
  $('export-files').replaceChildren();
  for(const item of job.files || []) {
    const name=typeof item==='string'?item:item.name;
    if(!name) continue;
    const button=text('button','Download '+name); button.type='button';
    button.addEventListener('click',()=>downloadExport(job.id,name,button)); $('export-files').append(button);
  }
  studyButtons();
  clearTimeout(exportPoll);
  if(['RUNNING','QUEUED','IN_PROGRESS','PENDING'].includes(String(job.status).toUpperCase()))
    exportPoll=setTimeout(()=>pollExport(job.id,generation),1000);
}
async function pollExport(id,generation=exportGeneration) {
  try {const value=await api('/api/studies/exports/'+encodeURIComponent(id));if(generation===exportGeneration && value.export.studyId===study?.id)setExport(value.export,generation);}
  catch(error) {if(generation!==exportGeneration)return;$('export-status').textContent='Export status unavailable: '+error.message+'. The private export remains saved; use Refresh export.';
    clearTimeout(exportPoll);}
}
async function downloadExport(id,name,button) {
  button.disabled=true;
  try {
    const response=await fetch('/api/studies/exports/'+encodeURIComponent(id)+'/files/'+encodeURIComponent(name),
      {headers:{authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if(!response.ok) {const body=await response.json();throw new Error(body.message || body.error || 'Download failed.');}
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Downloaded '+name+' from the retained complete-result export.');
  } catch(error) {status(error.message,true);} finally {button.disabled=false;}
}
$('study-title').addEventListener('input',edited);
for(const id of ['columns','sort','descending','limit','raw'])
  $(id).addEventListener('input',()=>{if(id==='raw' && study) study.working.draft.mode='raw';edited();});
for(const id of ['columns','sort','descending'])
  $(id).addEventListener('change',edited);
$('study-list').addEventListener('change',studyButtons);
$('study-editions').addEventListener('change',studyButtons);
$('study-new').addEventListener('click',async()=>{
  try {preserveCurrent();installStudy(createStudy({schema,id:newId(),title:'Untitled dataset study',at:now()}));
    await refreshStudies();status('New study opened. Previous work remains in the saved-study list.');}
  catch(error){status(error.message,true);}
});
$('study-fork').addEventListener('click',async()=>{
  try{preserveCurrent();const value=forkStudy(study,{id:newId(),title:(study.title || 'Untitled')+' — copy',at:now()});
    installStudy(value);await refreshStudies();status('Independent study created with complete history and original ancestry.');}
  catch(error){status(error.message,true);}
});
$('study-adopt').addEventListener('click',()=>{
  try{captureDraft();study=rebindStudy(study,{schema,at:now()});
    installStudy(study,storageRevision);status('Displayed source adopted explicitly. Compatible controls remain; earlier source and queries remain in edition history. Review the raw query before using it.');}
  catch(error){status(error.message,true);}
});
$('study-restore').addEventListener('click',()=>{
  try{captureDraft();const value=restoreEdition(study,{number:Number($('study-editions').value),at:now()});
    installStudy(value,storageRevision);status('Earlier controls and source restored. Current unfinished work was preserved as an edition. Run the query to read that exact source again.');}
  catch(error){status(error.message,true);}
});
$('study-download').addEventListener('click',()=>{
  try{captureDraft();study=checkpointStudy(study,{at:now(),reason:'Downloaded complete working file'});
    save('dataset-study-'+study.id+'.json',study);persistRecovery();renderStudy();status('Complete working file downloaded. Open it here to continue with every edition and unfinished control.');}
  catch(error){status(error.message,true);}
});
$('study-save').addEventListener('click',async()=>{
  if(studyBusy || busy) return;studyBusy=true;buttons();
  try{await nativeSave();await refreshStudies();status('Complete study saved in the private study store.');}
  catch(error){status(error.message+' Current work is retained on screen. Download it or fork before resolving another writer’s saved revision.',true);}
  finally{studyBusy=false;buttons();}
});
$('study-open').addEventListener('click',()=>{$('study-file').value='';$('study-file').click();});
$('study-file').addEventListener('change',async()=>{
  const file=$('study-file').files?.[0]; if(!file)return;
  const started=switchGeneration;
  try{
    if(file.size>STUDY_MAX_BYTES)throw new Error('Working files must be at most 8 MiB.');
    const value=validateStudy(JSON.parse(await file.text()));
    if(started!==switchGeneration)throw new Error('The active study changed while the file was being read. Choose the file again.');
    pendingStudy=value;
    $('study-open-review').hidden=false;
    $('study-open-description').textContent='Ready to open “'+(value.title || 'Untitled')+'” · '+value.editions.length+
      ' editions · '+value.working.source.dataset.name+' · snapshot '+value.working.source.dataset.snapshot+
      '. Your current controls stay active until you choose Open as independent study.';
    buttons();
  }catch(error){pendingStudy=null;status(error.message,true);buttons();}
});
$('study-apply-open').addEventListener('click',async()=>{
  if(!pendingStudy)return;
  try{preserveCurrent();const value=forkStudy(pendingStudy,{id:newId(),title:pendingStudy.title,at:now()});
    pendingStudy=null;$('study-open-review').hidden=true;installStudy(value);await refreshStudies();
    status('Working file opened as an independent study with its original ancestry and complete editions.');}
  catch(error){status(error.message,true);}
});
$('study-open-saved').addEventListener('click',async()=>{
  if(busy || studyBusy)return;
  const selected=$('study-list').value;if(!selected)return;
  const split=selected.indexOf(':'),kind=selected.slice(0,split),id=selected.slice(split+1),edits=editGeneration;
  studyBusy=true;buttons();
  try{
    const found=kind==='native'?await api('/api/studies/'+encodeURIComponent(id)):memoryRecovery.get(id);
    if(!found)throw new Error('The selected recovery is unavailable.');
    validateStudy(found.study);
    if(editGeneration!==edits)throw new Error('Your controls changed while the saved study was loading. They remain intact; choose Open selected again when ready.');
    preserveCurrent();installStudy(found.study,found.storageRevision??null);status('Saved study reopened with its original source and unfinished query controls.');
  }catch(error){status(error.message,true);}
  finally{studyBusy=false;buttons();}
});
$('study-reload-list').addEventListener('click',refreshStudies);
$('export-all').addEventListener('click',async()=>{
  if(busy || studyBusy || !latest)return;
  studyBusy=true;buttons();
  try{
    const selected={query:latest.query,snapshot:latest.snapshot}, saved=await nativeSave('Saved before complete-result export');
    const requestId=newId();
    const request={studyId:saved.study.id,expectedRevision:saved.storageRevision,...selected,requestId};
    $('export-status').textContent='Starting the complete selected result from its first page…';
    const result=await api('/api/studies/export-result',request);exportGeneration++;setExport(result.export);await refreshExports();
    status('Complete-result export started against snapshot '+selected.snapshot+'.');
  }catch(error){status(error.message+' Use Refresh export to recover any accepted export after an interrupted response.',true);await refreshExports().catch(()=>{});}
  finally{studyBusy=false;buttons();}
});
async function refreshExports() {
  if(!study)return;
  const studyId=study.id;
  const value=await api('/api/studies/exports?studyId='+encodeURIComponent(studyId));
  if(study.id!==studyId)return;
  const chosen=$('export-list').value;
  $('export-list').replaceChildren(text('option','Choose a retained export'));$('export-list').options[0].value='';
  for(const job of value.exports || []) {
    const o=text('option',(job.createdAt || job.id)+' · '+job.status+' · '+(job.rows??0)+' rows');
    o.value=job.id;$('export-list').append(o);
  }
  $('export-list').value=chosen;
  if(exportJob)await pollExport(exportJob.id);
}
$('export-list').addEventListener('change',()=>{const id=$('export-list').value;exportGeneration++;clearTimeout(exportPoll);exportJob=null;if(id)pollExport(id,exportGeneration);});
$('export-refresh').addEventListener('click',()=>refreshExports().catch(error=>status(error.message,true)));
$('export-resume').addEventListener('click',async()=>{
  if(!exportJob)return;
  const selected=exportJob.id,generation=exportGeneration;
  try{const result=await api('/api/studies/exports/'+encodeURIComponent(selected)+'/resume',{});setExport(result.export,generation);}
  catch(error){status(error.message,true);}
});
window.addEventListener('beforeunload',()=>{clearTimeout(recoveryTimer);persistRecovery();});
(async()=>{
  try{
    renderSchema(await api('/api/schema'),true);
    installStudy(createStudy({schema,id:newId(),title:'Untitled dataset study',at:now()}));
    await refreshStudies();status('Ready. Build a query, open an existing study or continue a browser recovery.');
    buttons();await refreshCatalog();
  }catch(error){status(error.message,true);}
})();
