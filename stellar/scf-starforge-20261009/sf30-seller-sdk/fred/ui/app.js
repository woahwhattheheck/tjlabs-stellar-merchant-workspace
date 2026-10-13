import { mountFredBriefing } from './briefing.js';
import { mountFredRecurring } from './recurring.js';
import { mountFredReleases } from './releases.js';
import { mountFredResearch } from './research.js';
import { mountFredQcew } from './qcew.js';
import { mountFredDdp } from './ddp.js';
import { mountFredDdpPublished } from './ddp-published.js';
import { mountFredCustomerWork } from './customer-work.mjs';
// MIT. Original economic project controls; source text is rendered as text.
const $ = id => document.getElementById(id);
let token = location.hash.slice(1);
if (token) { sessionStorage.setItem('fred-session', token); history.replaceState(null, '', location.pathname); }
else token = sessionStorage.getItem('fred-session') ?? '';
let state, publication, customerPublication, currentPage, comparisonPage, delivery, previous = null, workspaceBusy = null;
let rowOffset = 0, comparisonOffset = 0, selectionDirty = false;
let buyerConfigured = false, countyReceiving = null, publicationDraftProject = null;
let merchantPublicationRead = 0, customerPublicationRead = 0, countyReceivingRead = 0;
let customerWork = null, nativeWorkspace = null, preparedPurchase = null, preparedPurchaseRead = 0, customerFormVersion = 0, refreshRead = 0;
let customerCatalogLoading = false, adoptingCustomerWork = false, publicationSubmission = null;
const customerFields = ['publication-kind','qcew-merchant-edition','review-select','public-origin','public-path','payment',
  'publication-select','preview-query','customer-publication','customer-file','intent','accept-index','customer-query',
  'request-select','county-purchase-directory','county-received-edition'];
const clone = value => value === undefined ? null : structuredClone(value);
function customerSelection() {
  return { projectId:state?.id ?? null, directory:nativeWorkspace?.directory ?? null,
    version:customerFormVersion, publicationId: $('customer-publication').value, intentId: $('intent').value,
    file: $('customer-file').value, query: $('customer-query').value, acceptIndex: $('accept-index').value,
    receivingDirectory:$('county-purchase-directory').value };
}
function sameCustomerSelection(selection) {
  const current = customerSelection();
  return Object.keys(selection).every(key => current[key] === selection[key]);
}
const freshId = prefix => prefix + '-' + crypto.randomUUID().replaceAll('-', '');
const defaults = { fields: ['series','date','value','missing','as_of','time_basis','realtime_start','realtime_end','units','frequency','seasonal_adjustment'],
  filters: ['series','missing'], ranges: ['date'], sorts: ['date','series'], defaultLimit: 25, maxLimit: 100 };
$('policy').value = JSON.stringify(defaults, null, 2);
$('intent').value = freshId('fred');
$('payment').value = JSON.stringify({ scheme: 'exact', network: '', asset: '', amount: '', payTo: '', maxTimeoutSeconds: 60 }, null, 2);
function message(text = '', error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
async function api(path, value, projectId = state?.id) {
  const response = await fetch(path, { method: value === undefined ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + token, ...(projectId ? {'x-fred-project-id':projectId} : {}),
      ...(value === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const actualProject = response.headers.get('x-fred-project-id');
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error((data.code ? data.code + ': ' : '') + (data.message ?? 'Workspace request failed.')), { status: response.status, code: data.code });
  if (projectId && actualProject && projectId !== actualProject)
    throw Object.assign(new Error('The response belongs to another original economic project.'),{code:'FRED_WORKSPACE_BINDING_CHANGED',status:409});
  return data;
}
async function upload(path, form) {
  const response = await fetch(path, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: form });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error((value.code ? value.code + ': ' : '') + (value.message ?? 'Source upload failed.')),
    { status: response.status, code: value.code });
  return value;
}
async function download(path, filename, expected = null) {
  const projectId = state?.id;
  const response = await fetch(path, { headers: { authorization: 'Bearer ' + token,
    ...(projectId ? {'x-fred-project-id':projectId} : {}) } });
  if (!response.ok) { const error = await response.json(); throw new Error(error.message ?? 'Download failed.'); }
  const actualProject = response.headers.get('x-fred-project-id');
  if (projectId && actualProject && projectId !== actualProject) throw new Error('The original download belongs to another economic project.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (expected?.bytes !== undefined && bytes.length !== expected.bytes) throw new Error('The complete original download length changed.');
  if (expected?.sha256) {
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
    if (checksum !== expected.sha256) throw new Error('The complete original download SHA256 changed.');
  }
  const href = URL.createObjectURL(new Blob([bytes],{type:response.headers.get('content-type')??'application/octet-stream'})), link = document.createElement('a');
  const suppliedName = /filename="([A-Za-z0-9._-]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1];
  link.href = href; link.download = suppliedName ?? filename; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
function event(id, work, type = 'click') {
  $(id).addEventListener(type, async event => {
    event.preventDefault(); const button = event.currentTarget;
    if (button.tagName === 'BUTTON') button.disabled = true;
    message();
    try { await work(event); } catch (error) { message(error.message, true); }
    finally {
      if (button.tagName === 'BUTTON') button.disabled = false;
      if (['prepare','buy','recover','download-customer','open-request','county-receive-purchase-form'].includes(id)) syncCustomerResource();
    }
  });
}
function table(id, rows, columns) {
  const root = $(id); root.replaceChildren();
  if (!rows.length) { root.textContent = 'No rows in this selection.'; return; }
  columns ??= Object.keys(rows[0]);
  const table = document.createElement('table'), head = document.createElement('thead'), labels = document.createElement('tr'), body = document.createElement('tbody');
  for (const column of columns) { const th = document.createElement('th'); th.textContent = column; labels.append(th); }
  head.append(labels);
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const column of columns) { const td = document.createElement('td'), value = row[column]; td.textContent = value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); tr.append(td); }
    body.append(tr);
  }
  table.append(head, body); root.append(table);
}
function select(id, choices, wanted) {
  const control = $(id), selected = wanted ?? control.value;
  control.replaceChildren();
  for (const [value, label] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = label; control.append(option); }
  if (choices.some(([value]) => value === selected)) control.value = selected;
}
const briefing = mountFredBriefing({ api, download, event, table, select, getState: () => state,
  getCaptureId: () => $('capture-select').value, chooseCapture: async captureId => {
    $('capture-select').value = captureId; rowOffset = 0; select('row-series', [['','All original series']]); await showRows();
  }, message });
const recurring = mountFredRecurring({ api, download, event, table, select, getState: () => state,
  refresh, message, openBriefing: async reviewId => {
    document.querySelector('[data-tab="editions"]').click();
    $('briefing-saved').value = reviewId; $('briefing-open').click();
    $('briefing-report-panel').scrollIntoView({ block: 'start' });
  } });
const releases = mountFredReleases({ api, download, table, select, getState: () => state, refresh, message,
  openObservations: async captureId => {
    document.querySelector('[data-tab="editions"]').click();
    $('capture-select').value = captureId; $('row-series').value = ''; rowOffset = 0; await showRows();
    $('observations').scrollIntoView({ block: 'start' });
  },
  openBriefing: async selection => {
    document.querySelector('[data-tab="recurring"]').click();
    await recurring.useCapture(selection);
    $('recurring-report-panel').scrollIntoView({ block: 'start' });
  } });
const ddp = mountFredDdp({ api, upload, download, table, select, getState: () => state, refresh, message,
  openObservations: async captureId => {
    document.querySelector('[data-tab="editions"]').click();
    $('capture-select').value = captureId; rowOffset = 0; select('row-series', [['','All original series']]); await showRows();
    $('briefing-editor').scrollIntoView({ block: 'start' });
  },
  openReleaseWatch: async selection => {
    document.querySelector('[data-tab="releases"]').click(); releases.useSelection(selection);
    $('release-watch-form').scrollIntoView({ block: 'start' });
  } });
const published = mountFredDdpPublished({ api, table, select, getState: () => state,
  getBusy: () => workspaceBusy, refresh, message });
const research = mountFredResearch({api,download,getState:()=>state,getBusy:()=>workspaceBusy,refresh,message});
const qcew = mountFredQcew({ api, download, table, select, getState: () => state,
  getBusy: () => workspaceBusy, refresh, message, onPublication: async result => {
    await acceptPublication(result,'QCEW',publicationSubmission);
  } });
function retainChoice(id,value) {
  const control=$(id);
  if (control.tagName === 'SELECT' && value && ![...control.options].some(item=>item.value===value)) {
    const option=document.createElement('option');option.value=value;option.textContent='Retained selection · '+value;control.append(option);
  }
  control.value=value;
}
function selectRetained(id,choices,wanted) {
  const value=wanted??$(id).value;select(id,choices,value);
  if (value && !choices.some(([id])=>id===value)) retainChoice(id,value);
}
function captureCustomerWork() {
  return {fields:Object.fromEntries(customerFields.map(id=>[id,$(id).value])),previous:clone(previous),
    delivery:clone(delivery),preparedPurchase:clone(preparedPurchase),resultText:$('customer-result').textContent,
    tab:document.querySelector('[data-tab].active')?.dataset.tab??'customer'};
}
function touchCustomer(reason='Customer form edited') {
  customerFormVersion++;
  if (!adoptingCustomerWork) customerWork?.edit(reason);
  syncCustomerResource();
}
async function adoptCustomerWork(value) {
  const projectId=state?.id, version=++customerFormVersion;
  adoptingCustomerWork=true;
  const panels=[document.querySelector('[data-panel="customer"]'),document.querySelector('[data-panel="publication"]')];
  for (const panel of panels) panel.inert=true;
  try {
    customerPublicationRead++;merchantPublicationRead++;countyReceivingRead++;
    customerPublication=null;publication=null;preparedPurchase=null;preparedPurchaseRead++;customerCatalogLoading=false;
    previous=clone(value.previous);delivery=clone(value.delivery);clearCountyReceiving();
    for (const id of customerFields) if (typeof value.fields?.[id]==='string') retainChoice(id,value.fields[id]);
    $('customer-result').textContent=typeof value.resultText==='string'?value.resultText:'Original retained customer form opened.';
    table('customer-rows',delivery?.page?.rows??[]);
    syncPublicationKind();syncCustomerResource();
    const tab=[...document.querySelectorAll('[data-tab]')].find(item=>item.dataset.tab===value.tab);
    if (tab) {
      document.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item===tab));
      document.querySelectorAll('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==tab.dataset.tab;});
    }
    await showPublication(true,{preserveResult:true});
    if (state?.id!==projectId || customerFormVersion!==version) return;
    if ($('county-purchase-directory').value && customerPublication?.kind==='QCEW') {
      await showCountyReceiving({preserveSelection:true}).catch(error=>{
        if (error.code==='ENOENT') $('county-customer-status').textContent='The original receiving selection is retained. Open or continue it on its original customer host.';
        else throw error;
      });
    }
  } finally {for (const panel of panels) panel.inert=false;adoptingCustomerWork=false;syncCustomerResource();}
}
function publicationContext() {
  return {projectId:state?.id,version:customerFormVersion,
    fields:Object.fromEntries(['publication-kind','qcew-merchant-edition','review-select','public-origin','public-path','payment'].map(id=>[id,$(id).value]))};
}
function samePublicationContext(value) {
  if (!value || value.projectId!==state?.id || value.version!==customerFormVersion) return false;
  return Object.entries(value.fields).every(([id,text])=>$(id).value===text);
}
async function acceptPublication(result,kind,context) {
  if (!samePublicationContext(context)) return;
  $('publication-kind').value=kind;syncPublicationKind();
  retainChoice('publication-select',result.publicationId);retainChoice('customer-publication',result.publicationId);
  touchCustomer('Published edition selected');await showPublication();
}
async function acceptCustomerResult(body,result,selected) {
  if (!sameCustomerSelection(selected)) return;
  if (body.action==='prepare') {
    const value=await showPublication(true,{preserveResult:true});
    if (!value || !sameCustomerSelection(selected)) return;
    preparedPurchase=clone(result);
    $('customer-result').textContent=JSON.stringify({intentId:result.intentId,url:result.url,
      expectedTerms:result.config?.operation?.expect,purchaseSha256:result.purchaseSha256,
      originalSource:result.captureSha256,expectedFile:result.expected},null,2);
    retainChoice('request-select',result.intentId);
    message('Original request prepared. Review its terms before executing.');
  } else if (body.action==='receive-county-purchase') {
    const value=await showPublication(true,{preserveResult:true});
    if (!value || !sameCustomerSelection(selected)) return;
    $('county-purchase-directory').value=result.directory;retainChoice('request-select',body.intentId);
    if (await showCountyReceiving()) message('The purchased county report and original predecessor files were received.');
  } else {
    delivery=clone(result);const {page,...summary}=result;
    $('customer-result').textContent=JSON.stringify(summary,null,2);table('customer-rows',page?.rows??[]);
    message(result.state==='DELIVERED'?'Original delivery is available.':'Original operation state: '+result.state);
  }
  customerWork?.edit('Original '+body.action+' result opened');
}
customerWork=mountFredCustomerWork({root:document.querySelector('[data-panel="customer"]'),
  getProject:()=>state&&nativeWorkspace?{id:state.id,directory:nativeWorkspace.directory}:null,
  capture:captureCustomerWork,adopt:adoptCustomerWork,context:customerSelection,
  send:(body,projectId)=>api('/api/action',body,projectId),returned:acceptCustomerResult,
  changed:syncCustomerResource,message});

const labelCapture = item => (item.sourceMode === 'PUBLIC_TABLE' ? item.retrievalWindow ? 'Collected through ' : 'Captured ' : 'Vintage ') + item.selection.asOf + ' · ' + item.selection.series.join(', ') + ' · ' + item.rowCount + ' rows · ' + item.id.slice(0, 10);
async function renderState(value) {
  state = value.project;
  nativeWorkspace=value.workspace??nativeWorkspace; workspaceBusy = value.busy ?? null; $('project-title').textContent = state.title + ' · revision ' + state.revision;
  $('summary').replaceChildren();
  for (const [label, number] of [['Captures', state.captures.length], ['Saved reviews', state.reviews.length], ['Publications', state.publications.length + (state.qcew?.publications?.length ?? 0)], ['Completed actions', state.operations.length]]) {
    const node = document.createElement('div'); node.className = 'metric';
    const strong = document.createElement('strong'), span = document.createElement('span'); strong.textContent = number; span.textContent = label; node.append(strong, span); $('summary').append(node);
  }
  if (!selectionDirty) {
    $('series').value = state.selection.series.join('\n'); $('as-of').value = state.selection.asOf;
    $('start-date').value = state.selection.start; $('end-date').value = state.selection.end;
    $('page-size').value = state.selection.pageSize; $('max-rows').value = state.selection.maxRows;
  }
  const captures = state.captures.map(item => [item.id, labelCapture(item)]);
  select('capture-select', captures, $('capture-select').value || state.selectedCapture);
  
  const combined = $('combine-captures'), chosen = new Set(state.pending?.kind === 'combine'
    ? state.pending.payload.captureIds : [...combined.selectedOptions].map(option => option.value));
  combined.replaceChildren();
  for (const item of state.captures.filter(item => item.sourceMode === 'PUBLIC_TABLE' && item.series.length === 1)) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = labelCapture(item);
    option.selected = chosen.has(item.id); combined.append(option);
  }

  select('compare-before', captures); select('compare-after', captures, $('compare-after').value || state.selectedCapture);
  selectRetained('review-select', state.reviews.map(item => [item.id, (item.briefing?.title ? item.briefing.title + ' · ' : '') + item.id.slice(0,12) + ' · ' + item.captureId.slice(0,12) + ' · ' + item.reviewedAt]));
  selectRetained('qcew-merchant-edition', (state.qcew?.editions ?? []).map(item => [item.id,
    item.period.year + '-Q' + item.period.quarter + ' · ' + item.id.slice(0, 12)]));
  const publications = [...state.publications.map(item => [item.id, 'Source · ' + item.id.slice(0,12) + ' · ' + item.resource]),
    ...(state.qcew?.publications ?? []).map(item => [item.id, 'County report · ' + item.id.slice(0,12) + ' · ' + item.resource])];
  selectRetained('publication-select', publications); selectRetained('customer-publication', publications);
  $('acquisition-state').textContent = JSON.stringify(state.acquisition ?? { state: state.pending?.kind === 'capture' ? 'CAPTURING' : 'IDLE' }, null, 2);
  $('pending').textContent = state.pending ? JSON.stringify(state.pending, null, 2) : 'No pending operation.';
  $('merchant-state').textContent = value.merchant ? JSON.stringify(value.merchant, null, 2) : 'Merchant stopped. Select its retained publication to reopen.';
  $('buyer-status').textContent = value.buyerConfigured ? 'The original buyer is configured on this host. Approval appears in its terminal.' : 'Customer preparation is available. Start the workspace with --buyer-config to operate the existing native buyer.';
  buyerConfigured = value.buyerConfigured;
  $('buy').disabled = !buyerConfigured; $('recover').disabled = !buyerConfigured; $('download-customer').disabled = !buyerConfigured;
  restorePublicationDraft(); syncPublicationKind(); syncCustomerResource();
  table('history', [...state.operations].reverse(), ['id','kind','completedAt','result']);
  briefing.onState();
  recurring.onState();
  releases.onState();
  ddp.onState();
  published.onState();
  qcew.onState();
  research.onState();
  if (nativeWorkspace?.projectId!==state.id || typeof nativeWorkspace?.directory!=='string')
    throw new Error('The complete customer host did not return its original workspace binding.');
  await customerWork.open(state.id);
}
async function refresh() {
  const request=++refreshRead,value=await api('/api/state');
  if (request!==refreshRead) return;
  await renderState(value);
}
async function action(actionName, payload = {}) {
  const original = state.pending?.kind === actionName ? state.pending : null;
  const result = await api('/api/action', { action: actionName, id: original?.id ?? freshId(actionName),
    expectedRevision: original?.expectedRevision ?? state.revision, projectId:state.id, ...payload });
  await refresh().catch(error=>message('The original action returned; its catalog could not refresh: '+error.message,true)); return result;
}
async function showRows() {
  const capture = $('capture-select').value;
  if (!capture) return;
  const query = new URLSearchParams({ capture, series: $('row-series').value, offset: String(rowOffset) });
  currentPage = await api('/api/observations?' + query);
  briefing.onCapture(capture, currentPage.series);
  select('row-series', [['','All original series'], ...currentPage.series.map(item => [item.id,item.id + ' · ' + item.title])]);
  table('observations', currentPage.rows);
  table('series-detail', currentPage.series, ['id','title','publisher','asOf','timeBasis','frequency','units','seasonalAdjustment','count','missing','lastUpdated','notes','notesCoverage','sourceUrl']);
  $('row-count').textContent = currentPage.total + ' observations · ' + (currentPage.total ? rowOffset + 1 : 0) + '–' + Math.min(rowOffset + 100, currentPage.total);
  $('rows-previous').disabled = rowOffset === 0; $('rows-next').disabled = rowOffset + 100 >= currentPage.total;
}
async function compare() {
  const query = new URLSearchParams({ before: $('compare-before').value, after: $('compare-after').value, offset: String(comparisonOffset) });
  comparisonPage = await api('/api/compare?' + query);
  const { changes, ...summary } = comparisonPage; $('comparison-summary').textContent = JSON.stringify(summary, null, 2);
  table('comparison', changes, ['kind','series','date','before','after','delta','meaningChanges']);
  $('compare-previous').disabled = comparisonOffset === 0; $('compare-next').disabled = comparisonOffset + 100 >= comparisonPage.total;
}
function syncPublicationKind(changePath = false) {
  const county = $('publication-kind').value === 'QCEW';
  $('publication-review-field').hidden = county; $('publication-county-field').hidden = !county;
  $('review-select').required = !county; $('qcew-merchant-edition').required = county;
  if (changePath && ['/economic-data', '/county-reports'].includes($('public-path').value))
    $('public-path').value = county ? '/county-reports' : '/economic-data';
  $('publish-button').disabled = Boolean(state?.pending || workspaceBusy) ||
    !(county ? $('qcew-merchant-edition').value : $('review-select').value);
}
function retainPublicationDraft() {
  if (!state) return;
  try { sessionStorage.setItem('fred-publication-draft:' + state.id, JSON.stringify(
    Object.fromEntries(['publication-kind','qcew-merchant-edition','public-origin','public-path','payment']
      .map(id => [id, $(id).value])))); } catch {}
}
function restorePublicationDraft() {
  if (publicationDraftProject === state.id) return;
  publicationDraftProject = state.id;
  try {
    const saved = JSON.parse(sessionStorage.getItem('fred-publication-draft:' + state.id) ?? 'null');
    if (saved) for (const id of ['publication-kind','qcew-merchant-edition','public-origin','public-path','payment'])
      if (typeof saved[id] === 'string') $(id).value = saved[id];
  } catch {}
}
function clearCountyReceiving({ keepDirectory = false } = {}) {
  countyReceivingRead++; countyReceiving = null;
  if (!keepDirectory) $('county-purchase-directory').value = '';
  $('county-customer-downloads').replaceChildren(); $('county-customer-receipt').replaceChildren();
  $('county-customer-status').textContent = ''; $('county-received-edition').replaceChildren();
}
function selectedPreparedPurchase() {
  if (!preparedPurchase || !customerPublication || preparedPurchase.intentId!==$('intent').value ||
    !customerPublication.requests.some(item=>item.intentId===preparedPurchase.intentId&&item.purchaseSha256===preparedPurchase.purchaseSha256)) return null;
  const expectedFile=preparedPurchase.file??'';
  if (expectedFile!==$('customer-file').value || String(preparedPurchase.config?.preparedFrom?.acceptIndex??0)!==$('accept-index').value) return null;
  if (!expectedFile) {
    const expected=new URL(preparedPurchase.url).searchParams,current=new URLSearchParams($('customer-query').value);
    // A snapshot parameter inserted by the original preparer keeps that source pin.
    if(!current.has('snapshot'))expected.delete('snapshot');
    if(expected.toString()!==current.toString())return null;
  }
  return preparedPurchase;
}
function syncCustomerResource() {
  const navigating=Boolean(customerWork?.isNavigating());
  for(const panel of [document.querySelector('[data-panel="customer"]'),document.querySelector('[data-panel="publication"]')])
    panel.inert=adoptingCustomerWork||navigating;
  const known=Boolean(customerPublication?.plan.publicationId===$('customer-publication').value);
  const current=Boolean(known&&!customerCatalogLoading&&!adoptingCustomerWork&&customerWork?.isReady()&&!customerWork.isBusy());
  const county=known&&customerPublication.kind==='QCEW',prepared=known&&selectedPreparedPurchase();
  const resource=current&&(!$('customer-file').value&&!county||customerPublication.plan.downloads.some(item=>item.path===$('customer-file').value));
  $('prepare').disabled=!resource;
  $('buy').disabled=$('recover').disabled=$('download-customer').disabled=!buyerConfigured||!current||!prepared;
  $('open-request').disabled=!current||!customerPublication.requests.length;
  $('customer-query').disabled=!known||county||Boolean($('customer-file').value);
  $('next-customer-page').disabled=!current||county||!delivery?.metadata?.nextCursor;
  $('new-customer-request').disabled=!current;
  $('county-open-receiving').disabled=!current||!county;
  $('customer-rows').hidden=county;
  $('county-purchase-receiving').hidden=!county;
  $('county-receive-purchase').disabled=!buyerConfigured||!current||!county||!prepared||$('customer-file').value!=='report-package.json.gz';
}
async function readOriginalPurchase({restoreFields=false}={}) {
  const selection=customerSelection(),request=++preparedPurchaseRead;
  const item=customerPublication?.requests.find(row=>row.intentId===selection.intentId);
  if(!item){preparedPurchase=null;syncCustomerResource();return null;}
  const value=await api('/api/customer-request?'+new URLSearchParams({publication:selection.publicationId,intent:selection.intentId}),undefined,selection.projectId);
  if(request!==preparedPurchaseRead||!sameCustomerSelection(selection))return null;
  const purchase=value.purchase;
  if(purchase.intentId!==item.intentId||purchase.purchaseSha256!==item.purchaseSha256)throw new Error('The retained original purchase body changed.');
  preparedPurchase=purchase;
  if(restoreFields){
    retainChoice('customer-file',purchase.file??'');
    $('customer-query').value=expectedQuery(purchase);
    $('accept-index').value=String(purchase.config?.preparedFrom?.acceptIndex??0);
  }
  syncCustomerResource();return purchase;
}
function expectedQuery(purchase){return purchase.file?'':new URL(purchase.url).search.slice(1);}
async function showPublication(customer = false,{preserveResult=false}={}) {
  const control=$(customer?'customer-publication':'publication-select'),id=control.value,projectId=state?.id;
  const request=customer?++customerPublicationRead:++merchantPublicationRead;
  const selected=()=>state?.id===projectId && control.value===id && request===(customer?customerPublicationRead:merchantPublicationRead);
  const originalSelection=customer?customerSelection():null;
  if (customer) {customerCatalogLoading=true;syncCustomerResource();}
  if (!id) {
    if(customer){customerPublication=null;customerCatalogLoading=false;syncCustomerResource();}
    else {publication=null;$('publication-detail').replaceChildren();$('publication-files').replaceChildren();}
    return null;
  }
  try {
    const value=await api('/api/publication?'+new URLSearchParams({publication:id}),undefined,projectId);
    if (!selected()) return null;
    const county=value.kind==='QCEW';
    if(customer){
      customerPublication=value;
      selectRetained('customer-file',[...(county?[]:[['','Observation page']]),
        ...value.plan.downloads.map(item=>[item.path,(item.path==='report-package.json.gz'?'Complete report package':item.path)+' · '+item.bytes+' bytes'])]);
      selectRetained('request-select',value.requests.map(item=>[item.intentId,item.intentId+' · '+item.url]));
      if (!preparedPurchase || preparedPurchase.intentId!==$('intent').value || !value.requests.some(item=>item.purchaseSha256===preparedPurchase.purchaseSha256))
        await readOriginalPurchase();
      if (!selected()) return null;
      if (!preserveResult && sameCustomerSelection(originalSelection))
        $('customer-result').textContent=JSON.stringify({editionId:value.edition.editionId,
          ...(county?{title:value.edition.title,period:value.edition.period}:{selection:value.edition.selection}),
          payment:value.plan.payment,resource:value.plan.resource,sourceFiles:value.plan.downloads},null,2);
    }else{
      publication=value;$('publication-data-preview').hidden=county;
      table('publication-detail',county?[{title:value.edition.title,
        period:value.edition.period.year+'-Q'+value.edition.period.quarter,edition:value.edition.editionId,
        predecessor_editions:value.edition.predecessorEditions,resource:value.plan.resource,payment:value.plan.payment}]:
        [{edition:value.edition.editionId,sourceMode:value.edition.sourceMode,asOf:value.edition.selection.asOf,
          timeBasis:value.edition.timeBasis,retrievalWindow:value.edition.retrievalWindow??null,rows:value.edition.rowCount,
          snapshot:value.edition.snapshot,briefing:value.edition.briefing??null,resource:value.plan.resource,payment:value.plan.payment}]);
      table('publication-files',value.plan.downloads,['path','contentType','bytes','resource']);
    }
    return value;
  }catch(error){if(!selected())return null;throw error;}
  finally{if(customer&&selected()){customerCatalogLoading=false;syncCustomerResource();}}
}
function paintCountyReceiving() {
  const root = $('county-customer-downloads'); root.replaceChildren();
  const receiving = countyReceiving;
  if (!receiving || receiving.publicationId !== $('customer-publication').value ||
    receiving.intentId !== $('intent').value || receiving.directory !== $('county-purchase-directory').value.trim()) return;
  const edition = receiving.editions.find(item => item.manifest.editionId === $('county-received-edition').value);
  if (!edition) return;
  const files = [{ name: 'report-package.json.gz', label: 'Complete received report package' },
    ...edition.manifest.files.map(file => ({ ...file, label: file.name }))];
  for (const file of files) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = file.label;
    button.addEventListener('click', async () => {
      if (countyReceiving !== receiving || receiving.publicationId !== $('customer-publication').value ||
        receiving.intentId !== $('intent').value || receiving.directory !== $('county-purchase-directory').value.trim()) return;
      button.disabled = true;
      try { await download('/api/customer-received?' + new URLSearchParams({
        publication: receiving.publicationId, intent: receiving.intentId,
        edition: edition.manifest.editionId, file: file.name }), file.name,file); }
      catch (error) { message(error.message, true); }
      finally { button.disabled = false; }
    });
    root.append(button);
  }
}
async function showCountyReceiving({preserveSelection=false}={}) {
  const selection = customerSelection(), { publicationId, intentId } = selection;
  const directory = $('county-purchase-directory').value.trim(), request = ++countyReceivingRead,
    originalEdition=$('county-received-edition').value;
  const selected = () => request === countyReceivingRead && sameCustomerSelection(selection) &&
    directory === $('county-purchase-directory').value.trim();
  let value;
  try { value = await api('/api/customer-received?' + new URLSearchParams({ publication: publicationId, intent: intentId })); }
  catch (error) { if (!selected()) return null; throw error; }
  if (!selected()) return null;
  countyReceiving = { ...value, publicationId, intentId };
  $('county-purchase-directory').value = value.directory;
  $('county-customer-status').textContent = value.receipt.title + ' is received in ' + value.directory + '.';
  table('county-customer-receipt', [{ report: value.receipt.title,
    period: value.receipt.period.year + '-Q' + value.receipt.period.quarter,
    editions: value.receipt.editions, files: value.receipt.files, received: value.receipt.receivedAt }]);
  select('county-received-edition', value.editions.map(item => [item.manifest.editionId,
    item.period.year + '-Q' + item.period.quarter + ' · ' + item.title]), preserveSelection && originalEdition || value.receipt.editionId);
  paintCountyReceiving(); return value;
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', async () => {
  document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
  touchCustomer('Opened '+button.dataset.tab+' desk');
  try {
    if (button.dataset.tab === 'editions') await showRows();
    if (button.dataset.tab === 'county') await qcew.open();
    if (button.dataset.tab === 'publication') await showPublication();
    if (button.dataset.tab === 'customer') await showPublication(true);
    if (button.dataset.tab === 'ddp') await ddp.onOpen();
    if (button.dataset.tab === 'published') await published.onOpen();
  } catch (error) { message(error.message, true); }
}));
$('selection-form').addEventListener('input', () => { selectionDirty = true; });
event('refresh', refresh);

event('combine-tables', async () => {
  const captureIds = [...$('combine-captures').selectedOptions].map(option => option.value);
  const result = await action('combine', { captureIds });
  $('capture-select').value = result.captureId; rowOffset = 0;
  await showRows(); message('Combined original tables are retained. Review this economic edition before publication.');
});

event('selection-form', async () => {
  const selection = { series: $('series').value.split(/[\s,]+/).filter(Boolean), asOf: $('as-of').value,
    start: $('start-date').value, end: $('end-date').value, pageSize: Number($('page-size').value), maxRows: Number($('max-rows').value) };
  await action('configure', { selection }); selectionDirty = false; await refresh(); message('Source selection saved.');
}, 'submit');
event('capture', async () => {
  if (selectionDirty) throw new Error('Save the selected source settings before acquiring.');
  const result = await action('capture'); $('capture-select').value = result.captureId; await showRows(); message('Original source capture retained.');
});
event('resume', async () => {
  if (state.pending?.kind !== 'capture') throw new Error('Choose the original pending form to continue this action; no source acquisition is pending.');
  await action('capture'); message('Original acquisition completed.');
});
event('import-capture', async () => {
  const file = $('capture-file').files[0]; if (!file) throw new Error('Select an original capture JSON file.');
  if (file.size > 128 * 1024 * 1024) throw new Error('Capture file exceeds 128 MiB.');
  const result = await action('import', { capture: JSON.parse(await file.text()) }); $('capture-select').value = result.captureId; await showRows(); message('Original capture imported.');
});
event('capture-select', async () => { rowOffset = 0; select('row-series', [['','All original series']]); await showRows(); }, 'change');
event('row-series', async () => { rowOffset = 0; await showRows(); }, 'change');
event('rows-previous', async () => { rowOffset = Math.max(0,rowOffset - 100); await showRows(); });
event('rows-next', async () => { if (rowOffset + 100 < currentPage.total) rowOffset += 100; await showRows(); });
event('select-capture', async () => { await action('select', { captureId: $('capture-select').value }); message('Original capture selected.'); });
event('download-source', () => download('/api/source?' + new URLSearchParams({ capture: $('capture-select').value }), 'fred-original-capture.json'));
event('save-review', async () => {
  const selectedBriefing = briefing.selection();
  const result = await action('review', { captureId: $('capture-select').value, policy: JSON.parse($('policy').value),
    note: $('review-note').value, ...(selectedBriefing ? { briefing: selectedBriefing } : {}) });
  $('review-select').value = result.reviewId; await briefing.afterSave(result);
  message(result.briefing ? 'Source review, exact analyst measures and complete report files saved.' : 'Source review and customer projection saved.');
});
event('compare', async () => { comparisonOffset = 0; await compare(); });
event('compare-previous', async () => { comparisonOffset = Math.max(0,comparisonOffset - 100); await compare(); });
event('compare-next', async () => { if (comparisonOffset + 100 < comparisonPage.total) comparisonOffset += 100; await compare(); });
event('download-comparison', () => download('/api/compare?' + new URLSearchParams({ before: $('compare-before').value, after: $('compare-after').value, download: '1' }), 'fred-vintage-comparison.json'));
event('publication-form', async () => {
  retainPublicationDraft();
  publicationSubmission=publicationContext();
  const terms = { origin: $('public-origin').value, path: $('public-path').value, payment: JSON.parse($('payment').value) };
  if ($('publication-kind').value === 'QCEW') {
    await qcew.publish({ editionId: $('qcew-merchant-edition').value, ...terms });
  } else {
    const result = await action('publish', { reviewId: $('review-select').value, ...terms });
    await acceptPublication(result,'FRED',publicationSubmission); message('Reviewed merchant edition published.');
  }
}, 'submit');
event('publication-kind', () => { syncPublicationKind(true); retainPublicationDraft(); qcew.onState(); }, 'change');
$('publication-form').addEventListener('input', retainPublicationDraft);
event('qcew-merchant-edition', () => { syncPublicationKind(); retainPublicationDraft(); qcew.onState(); }, 'change');
event('county-publish-continue', async () => {publicationSubmission=publicationContext();await qcew.continuePublication();});
event('qcew-publish-selected', async () => {
  $('publication-kind').value = 'QCEW'; $('qcew-merchant-edition').value = $('qcew-edition').value;
  syncPublicationKind(true); retainPublicationDraft();
  document.querySelector('[data-tab="publication"]').click(); $('publication-form').scrollIntoView({ block: 'start' });
});
event('open-publication', () => showPublication());
event('publication-select', () => showPublication(), 'change');
event('merchant-start', async () => { await action('merchant-start', { publicationId: $('publication-select').value }); message('Original seller started.'); });
event('merchant-stop', async () => { await action('merchant-stop', { publicationId: $('publication-select').value }); message('Original seller drained and retained.'); });
event('preview', async () => { const result = await api('/api/preview?' + new URLSearchParams({ publication: $('publication-select').value, query: $('preview-query').value })); table('preview-result', result.rows ?? []); message('Original native dataset preview: ' + result.page.returned + ' of ' + result.page.total + ' rows.'); });
event('customer-publication', async () => {
  previous = null; delivery = null; preparedPurchase=null;preparedPurchaseRead++;clearCountyReceiving();
  $('customer-result').textContent = '';
  await showPublication(true);
}, 'change');
event('customer-file', () => {
  previous = null; delivery = null; clearCountyReceiving();
  $('customer-result').textContent = '';
  if (customerPublication?.requests.some(item => item.intentId === $('intent').value)) $('intent').value = freshId('economic');
  syncCustomerResource();
}, 'change');
event('new-customer-request', () => {
  $('intent').value = freshId('economic'); previous = null; delivery = null;
  $('request-select').value = ''; $('customer-result').textContent = 'A new original request is ready to prepare.';
  clearCountyReceiving();
  syncCustomerResource();
});
$('customer-query').addEventListener('input', () => { previous = null; });
$('intent').addEventListener('input', () => { previous = null; delivery = null; preparedPurchase=null;preparedPurchaseRead++;clearCountyReceiving(); });
$('county-purchase-directory').addEventListener('input', () => clearCountyReceiving({ keepDirectory: true }));
async function customerAction(kind,payload={}) {
  if (!customerWork.isReady() || customerWork.isBusy()) throw new Error('Open the complete customer workspace before continuing.');
  const selection=customerSelection();
  const prepared=kind==='prepare'?null:selectedPreparedPurchase();
  if(kind!=='prepare'&&!prepared)throw new Error('Open the exact saved request, resource and payment alternative before continuing its original purchase.');
  return customerWork.perform({action:kind,id:freshId(kind),projectId:state.id,expectedRevision:state.revision,
    publicationId:selection.publicationId,intentId:selection.intentId,...(prepared?{expectedPurchaseSha256:prepared.purchaseSha256}:{}),...payload});
}
event('prepare', async () => {
  const selection=customerSelection();
  await customerAction('prepare',{query:selection.file?'':selection.query,file:selection.file||null,
    previous:clone(previous),acceptIndex:Number(selection.acceptIndex)});
});
event('buy',()=>customerAction('buy'));
event('recover',()=>customerAction('recover'));
event('download-customer',()=>{
  const selection=customerSelection(),expected=customerPublication?.plan.downloads.find(item=>item.path===selection.file);
  return download('/api/customer-download?'+new URLSearchParams({publication:selection.publicationId,intent:selection.intentId}),
    expected?.path??selection.intentId+'.json',expected??null);
});
event('next-customer-page', async () => {
  if (!delivery?.metadata?.nextCursor) throw new Error('The selected delivered page has no next cursor.');
  previous = delivery.metadata;
  const query = new URLSearchParams(new URL(customerPublication.requests.find(item => item.intentId === delivery.intentId)?.url ??
    location.origin + '/?' + $('customer-query').value).search);
  query.set('cursor', previous.nextCursor); $('customer-query').value = query.toString(); $('customer-file').value = '';
  $('intent').value = freshId('fred'); message('Next page selected with the original cursor. Prepare this new request to review it.');
});
event('open-request', async () => {
  const item = customerPublication?.requests.find(item => item.intentId === $('request-select').value);
  if (!item) throw new Error('Select a retained original request.');
  $('intent').value = item.intentId; $('customer-file').value = item.file ?? ''; $('customer-query').value = new URL(item.url).search.slice(1);
  previous = null; delivery = null; clearCountyReceiving(); $('customer-result').textContent = JSON.stringify(item, null, 2);
  $('county-purchase-directory').value = item.receiving?.directory ?? ''; syncCustomerResource();
  touchCustomer('Selected original native request');
  const opened=await readOriginalPurchase({restoreFields:true});
  if(!opened)return;
  customerWork.edit('Opened original native request');
  if (item.receiving) await showCountyReceiving().catch(error => {
    if (error.code === 'ENOENT') $('county-customer-status').textContent = 'The original receiving destination is saved. Continue the report receiving operation.';
    else throw error;
  });
});
event('county-receive-purchase-form',async()=>{
  const directory=$('county-purchase-directory').value.trim();
  await customerAction('receive-county-purchase',{receivingDirectory:directory||null});
},'submit');
event('county-open-receiving', () => showCountyReceiving());
event('county-received-edition', paintCountyReceiving, 'change');
event('abandon', async () => {
  if (!state.pending) throw new Error('There is no pending project operation.');
  await action('abandon', { pendingId: state.pending.id }); message('Pending action abandoned; its original files remain retained.');
});
event('download-bundle', () => download('/api/bundle', 'fred-economic-project.json'));
for (const id of customerFields) for (const type of ['input','change']) $(id).addEventListener(type,()=>{
  touchCustomer('Edited '+id);
});
for (const id of ['new-customer-request','next-customer-page','qcew-publish-selected'])
  $(id).addEventListener('click',()=>queueMicrotask(()=>touchCustomer('Selected customer work')));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&customerWork.isReady())customerWork.edit('Retained before leaving this tab');});
refresh().catch(error => message(error.message, true));
