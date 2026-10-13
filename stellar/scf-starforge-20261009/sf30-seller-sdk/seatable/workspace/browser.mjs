// MIT. Industrial local operator. No provider token or source rows enter browser storage.
const $ = id => document.getElementById(id);
const clone = value => value == null ? value : structuredClone(value);
const node = (tag, value, className) => { const e = document.createElement(tag); if (value != null) e.textContent = String(value); if (className) e.className = className; return e; };
const short = value => value ? String(value).slice(0,16) : '—';
const shown = value => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const when = value => value ? new Date(value).toLocaleString() : '—';
const uuid = () => crypto.randomUUID();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
const bodyHash = value => sha(JSON.stringify(stable(value)));
const tokenKey = 'stellar.seatable.authoring.token';
let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) { sessionStorage.setItem(tokenKey, token); history.replaceState(null, '', location.pathname + location.search); }
else token = sessionStorage.getItem(tokenKey);
let state = null, busy = false, pending = null, retryPayload = null, known = null, recovering = false;
let metadata = null, sourceOrders = [], captureColumns = new Map(), editorColumns = new Map(), captureView = null;
let draft = null, draftRevision = 0, dirty = false, queryName = null, preview = null, upload = null;
let revision = 0, renderEpoch = 0, deployment = null, deploymentReview = null;
let capturesOffset = 0, versionsOffset = 0, discoveriesOffset = 0, deploymentOffset = 0;
const limit = 25;
const errorMessage = e => [e.code, e.message || String(e)].filter(Boolean).join(': ');
function notice(value, error = false) { $('notice').textContent = value || ''; $('notice').hidden = !value; $('notice').classList.toggle('error', error); }
function tab(name) {
  document.querySelectorAll('[data-panel]').forEach(e => { e.hidden = e.dataset.panel !== name; });
  document.querySelectorAll('[data-view]').forEach(e => e.setAttribute('aria-current', e.dataset.view === name ? 'page' : 'false'));
}
function lock() {
  $('workspace-controls').disabled = !state || busy || Boolean(pending) || Boolean(handoverPending);
  for (const id of ['check-operation','resume-operation','retry-operation','dismiss-operation','retry-file']) $(id).disabled = busy || recovering;
  $('retry-operation').disabled = busy || recovering || (!retryPayload && Boolean(pending?.file));
}
const markerPrefix = directory => 'stellar.seatable.pending.v1:' + directory + ':';
const activeKey = directory => 'stellar.seatable.active.v1:' + directory;
function showRecovery(message) {
  $('recovery').hidden = !pending;
  if (!pending) { lock(); return; }
  $('recovery-title').textContent = pending.label || 'Retained source request';
  $('recovery-id').textContent = pending.requestId;
  $('recovery-message').textContent = message || (known?.status === 'complete' ? 'The original receipt is available. Refreshing its saved result…' :
    known?.status === 'pending' ? 'The original operation is still running. Check this same receipt again.' :
    known?.status === 'interrupted' ? (known.kind==='CAPTURE'?'Resume this same capture through the original provider step journal. Its source selection and read bounds stay fixed.':'Resume this retained request. Metadata is adopted only from its saved response.') :
    known?.status === 'failed' ? known.error?.message || 'The operation ended with a recorded error. Saved work remains available.' :
    'No receipt is currently visible. Retry only this identical request.');
  $('resume-operation').hidden = known?.status !== 'interrupted';
  $('retry-operation').hidden = known !== null;
  $('dismiss-operation').hidden = known?.status !== 'failed';
  $('retry-file-label').hidden = known !== null || !pending.file || Boolean(retryPayload);
  $('retry-operation').disabled = busy || recovering || !retryPayload && Boolean(pending.file);
  lock();
}
async function sha(content) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
}
function remember(marker, body) {
  marker.directory = state.directory;
  localStorage.setItem(markerPrefix(state.directory) + marker.requestId, JSON.stringify(marker));
  sessionStorage.setItem(activeKey(state.directory), marker.requestId);
  pending = marker; retryPayload = body; known = null; showRecovery('Waiting for the original request receipt…');
}
function forget() {
  if (pending) {
    localStorage.removeItem(markerPrefix(pending.directory) + pending.requestId);
    if (sessionStorage.getItem(activeKey(pending.directory)) === pending.requestId) sessionStorage.removeItem(activeKey(pending.directory));
  }
  pending = null; retryPayload = null; known = null; showRecovery();
}
async function api(path, options = {}) {
  const control = new AbortController(), timeout = setTimeout(() => control.abort(), options.timeout ?? 65000);
  try {
    const response = await fetch(path, { method: options.body === undefined ? 'GET' : 'POST',
      headers: { 'x-seatable-workspace-token': token || '', ...(options.body === undefined ? {} : { 'content-type':'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), cache:'no-store', signal:control.signal });
    if (options.binary && response.ok) return { data: await response.blob(),
      filename: response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'seatable-source.json' };
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.message || result.error || response.statusText), { code: result.error, status: response.status });
    return result;
  } catch (issue) { if (!issue.status) issue.uncertain = true; throw issue; }
  finally { clearTimeout(timeout); }
}
async function refresh({ loadCurrentDraft = false } = {}) {
  const epoch = ++renderEpoch, editing = revision;
  const latest = await api('/api/status?' + new URLSearchParams({capturesOffset,versionsOffset,discoveriesOffset,limit}));
  if (epoch !== renderEpoch) return state;
  state = latest; renderState();
  if (loadCurrentDraft && latest.draft && editing === revision) await loadDraft(latest.draft, latest.draftRevision);
  return latest;
}
async function finish(result, marker) {
  // Retain the same request marker through a failed status read or view refresh.
  await refresh();
  if (marker.path === '/api/discover') { loadDiscovery(result); tab('acquire'); }
  if (['/api/import-package','/api/capture','/api/draft'].includes(marker.path)) {
    if (state.draft) await loadDraft(state.draft, state.draftRevision);
    tab('review');
  }
  if (marker.path === '/api/preview') { preview = result; renderPreview(); tab('review'); }
  if (marker.path === '/api/version' || marker.path === '/api/select') tab('versions');
  if (marker.path === '/api/deployment/review') { deploymentReview = result; renderDeploymentReview(); }
  if (marker.path?.startsWith('/api/deployment/')) await refreshDeployment();
  if (marker.path === '/api/deployment/prepare') { $('stage-package').value = result.packageRequestId; $('stage-sha').value = result.sourceSha256; }
  if (marker.path === '/api/publisher/start') { tab('deploy'); renderPublisher(); }
  await finishReturnedMutation(result,marker);
  if (pending?.requestId === marker.requestId) forget();
  notice('Saved. Original request ' + marker.requestId + '.');
}
async function checkReceipt() {
  if (!pending || recovering) return;
  recovering = true; lock();
  try {
    const reply = await api('/api/operation?id=' + encodeURIComponent(pending.requestId));
    known = reply.operation; showRecovery();
    if (known?.status === 'complete') await finish(known.result, pending);
  } catch (issue) { showRecovery('The receipt could not be read. Its original request remains retained. ' + errorMessage(issue)); }
  finally { recovering = false; lock(); }
}
async function mutate(path, body, label, file = null) {
  if (pending || busy || handoverPending) return;
  busy = true; lock(); notice('');
  try {
    const requestId = uuid(), payload = { ...clone(body), requestId };
    const marker = { requestId, path, label, bodySha256: await bodyHash(payload),
      small: file ? { ...clone(body), packet: undefined } : payload, file, createdAt: new Date().toISOString() };
    remember(marker, payload);
    try { const result = await api(path, { body: payload }); await finish(result, marker); }
    catch (issue) {
      notice(errorMessage(issue), true);
      const reply = await api('/api/operation?id=' + requestId).catch(() => null);
      if (reply) {
        known = reply.operation; showRecovery();
        if (known?.status === 'complete') await finish(known.result, marker);
        else if (known === null && issue.status) { if(!rejectReturnedMutation(issue))forget(); notice(errorMessage(issue), true); }
      } else showRecovery('The request response is uncertain. Keep this identifier and read its original receipt.');
    }
  } catch (issue) { notice(errorMessage(issue), true); }
  finally { busy = false; lock(); }
}
async function readAction(action) {
  if (busy || pending || handoverPending) return;
  busy = true; lock(); notice('');
  try { await action(); } catch (issue) { notice(errorMessage(issue), true); } finally { busy = false; lock(); }
}
async function download(path) {
  const file = await api(path, { binary:true }), url = URL.createObjectURL(file.data);
  const a = document.createElement('a'); a.href = url; a.download = file.filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function table(parent, headings, rows) {
  parent.replaceChildren();
  if (!rows.length) { parent.append(node('p','No retained items.','help')); return; }
  const t=node('table'),head=node('thead'),tr=node('tr');
  for(const value of headings)tr.append(node('th',value));head.append(tr);t.append(head);
  const b=node('tbody');for(const cells of rows){const r=node('tr');for(const value of cells){const c=node('td');c.append(value instanceof Node?value:node('span',shown(value)));r.append(c);}b.append(r);}t.append(b);parent.append(t);
}
function button(label, action) {
  const b=node('button',label);b.type='button';b.addEventListener('click',async event=>{event.preventDefault();if(busy||pending||handoverPending)return;try{await action();}catch(issue){notice(errorMessage(issue),true);}});return b;
}
function actions(...buttons){const n=node('div');n.append(...buttons);return n;}
function description(title, detail){const n=node('div');n.append(node('strong',title),node('small',detail));return n;}
function jsonView(value){return node('pre',JSON.stringify(value,null,2));}
function change(){dirty=true;revision++;$('draft-state').textContent='Unsaved edits · based on draft revision '+draftRevision;preview=null;renderPreview();}
function pager(name,offset,total){$(name+'-page').textContent=(total?offset+1:0)+'–'+Math.min(offset+limit,total)+' of '+total;$(name+'-prev').disabled=offset===0;$(name+'-next').disabled=offset+limit>=total;}
function renderState(){
  $('workspace-path').textContent=state.directory;
  $('summary').textContent='Draft '+state.draftRevision+' · Selected source '+(state.selectedVersion??'none');
  const stats=$('overview-stats');stats.replaceChildren();
  for(const [label,value] of [['Observations',state.pages.capturesTotal],['Saved versions',state.pages.versionsTotal],['Selected version',state.selectedVersion??'—']]){const e=node('div',null,'stat');e.append(node('strong',value),node('span',label));stats.append(e);}
  const choice=$('connection'),old=choice.value;choice.replaceChildren(node('option','Select connection'));
  for(const c of state.connections){const o=node('option',c.label+' · '+c.server+' · '+c.state);o.value=c.alias;choice.append(o);}if(state.connections.some(c=>c.alias===old))choice.value=old;
  $('connection-help').textContent=state.connections.length?'Token values remain on this host. The browser selects only these declared connection aliases.':'No live read connection is declared. Import a complete source packet, or restart with the private connections file described in WORKSPACE.md.';
  table($('captures'),['Observation','Rows / pages','Original source','Completed','Actions'],state.captures.map(c=>[
    description(c.title,c.tableTitle+' · '+short(c.manifestSha256)),c.rowCount+' / '+c.pageCount,
    description(c.selection.tableId,c.selection.baseId+(c.selection.viewId?' · view '+c.selection.viewId:'')),when(c.completedAt),
    actions(button('Review',()=>readAction(()=>loadDraft(c.draft,state.draftRevision))),button('Download',()=>readAction(()=>download('/api/export-capture?id='+c.id))))]));
  pager('captures',capturesOffset,state.pages.capturesTotal);
  table($('discoveries'),['Table','Source','Inspected','Actions'],state.discoveries.map(d=>[d.title,description(d.source.tableId,d.source.server),when(d.receivedAt),button('Use metadata',()=>{loadDiscovery(d);tab('acquire');})]));
  pager('discoveries',discoveriesOffset,state.pages.discoveriesTotal);
  table($('operations'),['Action','Request','State','Updated','Actions'],state.operations.map(o=>[
    o.kind,node('code',o.id),o.status,when(o.updatedAt),actions(
      button('Receipt',()=>readAction(async()=>{const v=await api('/api/operation?id='+o.id);$('attempt-detail').hidden=false;$('attempt-detail').replaceChildren(node('h3','Original operation'),jsonView(v));})),
      ...(o.kind==='CAPTURE'?[button('Retained files',()=>readAction(async()=>{const v=await api('/api/capture-attempt?id='+o.id);$('attempt-detail').hidden=false;$('attempt-detail').replaceChildren(node('h3','Original capture files'),jsonView(v));}))]:[]),
      ...(['pending','interrupted'].includes(o.status)?[button('Recover',()=>{
        pending={requestId:o.id,path:'/api/resume',label:o.kind,directory:state.directory};known=o;retryPayload=null;showRecovery();checkReceipt();
      })]:[]))]));
  table($('versions'),['Version','Review','Rows / queries','Exact source','Actions'],state.versions.map(v=>[
    description('v'+v.id+(v.id===state.selectedVersion?' · SELECTED':''),v.title),description(v.reviewer,when(v.createdAt)+' · '+v.note),
    v.rowCount+' / '+Object.keys(v.queries).join(', '),node('code',short(v.sourceSha256)),
    actions(button('Select',()=>mutate('/api/select',{versionId:v.id,expectedSelectedVersion:state.selectedVersion},'Select saved source')),
      button('Review draft',()=>readAction(()=>loadDraft(v.draft,state.draftRevision))),
      button('Download complete source',()=>readAction(()=>download('/api/export?id='+v.id))))]));
  pager('versions',versionsOffset,state.pages.versionsTotal);
  renderPublisher();lock();
}
function alias(text,index){return (text.normalize('NFKD').replace(/[^A-Za-z0-9_]/g,'_').replace(/_+/g,'_').replace(/^([^A-Za-z])/,'field_$1').slice(0,40)||'field')+'_'+index;}
function defaultSpec(field,index){
  if(field.id==='$recordId')return{alias:'record_id',enabled:true,source:'$recordId',type:'string',encoding:'identity-text',nullable:false,empty:'preserve'};
  const numeric=['number','percent','dollar','euro','duration'].includes(field.type);
  return{alias:alias(field.title,index),enabled:false,source:field.id,providerType:field.type,type:field.type==='checkbox'?'boolean':field.type==='rate'?'integer':field.type==='formula'?'':'string',encoding:numeric?'number-text':'native',nullable:true,empty:'preserve'};
}
function selectInput(values,value,changed){
  const input=node('select');for(const item of values){const [v,label]=Array.isArray(item)?item:[item,item];const o=node('option',label);o.value=v;input.append(o);}input.value=value;input.addEventListener('change',()=>{if(!busy&&!pending)changed(input.value);});return input;
}
function fieldTable(parent,fields,map,onChange){
  table(parent,['Use','Native field / observed values','Public alias','Scalar type','Value encoding','Nulls','Empty strings'],fields.map((f,index)=>{
    let spec=map.get(f.id);if(!spec){spec=defaultSpec(f,index);map.set(f.id,spec);}
    const check=node('input');check.type='checkbox';check.checked=spec.enabled;check.setAttribute('aria-label','Use '+f.title);check.addEventListener('change',()=>{if(!busy&&!pending){spec.enabled=check.checked;onChange();}});
    const details=description(f.title,(f.id==='$recordId'?'Native identity':f.type)+' · '+f.id);
    if(f.counts){details.append(node('small',Object.entries(f.counts).filter(([,n])=>n).map(([k,n])=>k+' '+n).join(' · ')));details.append(node('small',(f.samples??[]).map(s=>s.kind+': '+shown(s.value)).join(' | ')));}
    const name=node('input');name.value=spec.alias;name.maxLength=48;name.setAttribute('aria-label','Public alias for '+f.title);name.addEventListener('input',()=>{if(!busy&&!pending){spec.alias=name.value;onChange();}});
    const type=selectInput(f.type==='formula'?[['','Choose scalar'],'string','integer','number','boolean']:['string','integer','number','boolean'],spec.type,v=>{spec.type=v;onChange();});type.setAttribute('aria-label','Scalar type for '+f.title);
    const encoding=selectInput(f.id==='$recordId'?['identity-text','native','number-text']:['native','number-text'],spec.encoding,v=>{spec.encoding=v;onChange();});encoding.setAttribute('aria-label','Encoding for '+f.title);
    const nullable=selectInput([['false','Required'],['true','Allow null']],String(spec.nullable),v=>{spec.nullable=v==='true';onChange();});nullable.setAttribute('aria-label','Null policy for '+f.title);if(f.id==='$recordId')nullable.disabled=true;
    const empty=selectInput([['preserve','Preserve'],['null','Use null']],spec.empty,v=>{spec.empty=v;onChange();});empty.setAttribute('aria-label','Empty string policy for '+f.title);
    return[check,details,name,type,encoding,nullable,empty];
  }));
}
function columnsFrom(map){
  const result={};for(const spec of map.values())if(spec.enabled){
    if(!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(spec.alias)||['constructor','prototype','__proto__'].includes(spec.alias)||Object.hasOwn(result,spec.alias))throw new Error('Use unique public column names beginning with a letter, followed by letters, digits or underscores.');
    if(!['string','integer','number','boolean'].includes(spec.type))throw new Error('Choose an explicit scalar type for every selected formula field.');
    const {alias:ignored,enabled:ignoredEnabled,...value}=spec;result[spec.alias]=value;
  }return result;
}
function mapFrom(fields,columns){
  const mapped=new Map(fields.map((f,i)=>[f.id,defaultSpec(f,i)]));for(const spec of mapped.values())spec.enabled=false;
  for(const [name,spec]of Object.entries(columns))mapped.set(spec.source,{...clone(spec),alias:name,enabled:true});
  return mapped;
}
function loadDiscovery(value){
  metadata=value;sourceOrders=value.source.viewId?[]:[{field:'_id',direction:'asc'}];
  $('connection').value=value.connectionAlias;$('base-id').value=value.source.baseId;
  $('table-id').value=value.source.tableId;$('view-id').value=value.source.viewId??'';
  $('where').value=value.source.where?JSON.stringify(value.source.where,null,2):'';
  for(const [id,items] of [['known-tables',value.tables??[]],['known-views',value.views??[]]]){
    const list=$(id);list.replaceChildren();for(const item of items){const option=node('option',item.title??item.name??item.id);option.value=item.id;list.append(option);}
  }
  captureColumns=new Map();$('acquisition').hidden=false;$('acquisition-title').textContent=value.title;
  $('acquisition-source').textContent=value.source.server+' · '+value.source.baseId+' / '+value.source.tableId+' · '+when(value.receivedAt);
  $('capture-title').value=value.title;
  $('source-mode').textContent=value.source.viewId?
    'Native SeaTable view '+value.source.viewId+'. Its saved provider filter and order are retained. All view pages are read until the native terminal page; no independent row count is claimed.':
    'Constructed read-only SQL over the selected base/table. The declarative filter and explicit order, including _id, are retained with verified opening/closing counts.';
  renderOrders();
  const fields=[{id:'$recordId',title:'Native record identity',type:'RecordIdentity'},...value.fields.filter(f=>f.scalarProjectionSupported&&!f.generatedRecordIdentity)];
  fieldTable($('capture-fields'),fields,captureColumns,()=>{});
}
function renderOrders(){
  const list=$('source-order');list.replaceChildren();
  const view=Boolean(metadata?.source.viewId);$('order-controls').hidden=view;$('add-order').disabled=view;
  if(view){sourceOrders=[];return;}
  for(const [index,order]of sourceOrders.entries()){
    const row=node('div',null,'order-row'),label=node('label','Actual field');
    const choices=metadata.fields.filter(f=>f.scalarProjectionSupported||f.generatedRecordIdentity).map(f=>[f.id,f.title+' · '+f.id]);
    const field=selectInput(choices,order.field,v=>{order.field=v;});label.append(field);
    const direction=node('label','Direction');direction.append(selectInput(['asc','desc'],order.direction,v=>{order.direction=v;}));
    row.append(label,direction,button('Remove',()=>{sourceOrders.splice(index,1);renderOrders();}));list.append(row);
  }
}
async function loadDraft(value,currentRevision){
  const epoch=++renderEpoch;const loaded=await api('/api/capture?id='+encodeURIComponent(value.captureId));
  if(epoch!==renderEpoch)return;captureView=loaded;draft=clone(value);draftRevision=currentRevision;dirty=JSON.stringify(value)!==JSON.stringify(state.draft);revision++;
  $('draft-title').value=draft.title;$('draft-editor').hidden=false;queryName=Object.keys(draft.queries)[0];renderQuery();
  $('draft-state').textContent=(dirty?'Unsaved selection based on draft ':'Draft revision ')+draftRevision+' · '+loaded.capture.rowCount+' complete rows · '+loaded.capture.pageCount+' original pages';
  $('capture-binding').textContent=loaded.capture.selection.server+' · '+loaded.capture.selection.baseId+' / '+loaded.capture.selection.tableId+
    (loaded.capture.selection.viewId?' · view '+loaded.capture.selection.viewId:'')+' · Capture '+loaded.capture.manifestSha256+
    (loaded.capture.selection.viewId?' · Native view order; terminal-page completeness':
      ' · SQL order '+loaded.capture.selection.sourceOrder.map(o=>o.field+' '+o.direction).join(', '))+
    ' · '+(loaded.capture.countVerified?'Opening/closing row counts verified':'No independent count assertion')+
    ' · Captured '+when(loaded.capture.completedAt);
  preview=!dirty&&state.preview?.draftRevision===draftRevision&&state.draft?.captureId===draft.captureId?state.preview:null;renderPreview();tab('review');
}
function flushQuery(){if(draft&&queryName)draft.queries[queryName]={columns:columnsFrom(editorColumns)};}
function renderQuery(){
  const s=$('query-select');s.replaceChildren();for(const name of Object.keys(draft.queries)){const o=node('option',name);o.value=name;s.append(o);}s.value=queryName;$('query-name').value=queryName;
  editorColumns=mapFrom(captureView.fields,draft.queries[queryName].columns);fieldTable($('draft-fields'),captureView.fields,editorColumns,change);
}
function renderPreview(){
  const out=$('preview');out.replaceChildren();out.hidden=!preview;
  $('save-version').disabled=!preview||dirty||preview.draftRevision!==draftRevision;
  $('preview-draft').disabled=dirty||!draft;
  if(!preview)return;
  const summary=preview.publicationSummary;
  out.append(node('h3','Complete row validation'));
  if(summary){
    out.append(node('p','Captured '+when(summary.captureCompletedAt)+' · '+summary.sourceRows+' retained rows · '+
      (summary.selection.viewId?'Native view '+summary.selection.viewId:'Constructed SQL selection')+' · '+
      (summary.countVerified?'Verified opening/closing counts':'Terminal-page completeness; no independent row count')+'.','help'));
    out.append(node('p',summary.rowRule,'help'));
    for(const [name,query] of Object.entries(summary.queries)){
      out.append(node('h4',name+' · '+query.emittedRows+' emitted rows'));
      const wrap=node('div',null,'table-wrap');
      table(wrap,['Public alias','Original field','Scalar / encoding','Null handling','Empty strings'],
        Object.entries(query.columns).map(([alias,column])=>[
          alias,column.source,column.type+' / '+(column.encoding??'native'),
          column.nullable?'Allow null':'Required',column.empty??'preserve']));
      out.append(wrap,node('p','Preview order: '+query.previewOrder.map(row=>row.column+' '+row.direction).join(', ')+
        '. Choose the published column subset and final extraction order in the original publisher.','help'));
    }
  }
  out.append(node('p','Every configured scalar in every captured row was validated through the original source reader. Samples below show at most 25 rows per query.','help'));
  for(const [name,value]of Object.entries(preview.reports)){out.append(node('h4',name+' · '+value.report.rowCount+' rows'));const wrap=node('div',null,'table-wrap');
    const sample=value.sample,keys=sample.length?Object.keys(sample[0]):Object.keys(draft.queries[name].columns);
    table(wrap,keys,sample.map(row=>keys.map(k=>shown(row[k]))));out.append(wrap);}
}
function renderPublisher(){
  if(!state)return;
  $('publisher-state').textContent='Selected source version: '+(state.selectedVersion??'none')+'. Publisher '+(state.publisher.running?'running':'stopped')+'. Dataset directory: '+state.publisher.targetDirectory;
  $('publisher-link').hidden=!state.publisher.url;if(state.publisher.url)$('publisher-link').href=state.publisher.url;
  $('open-publisher').disabled=state.selectedVersion===null;$('stop-publisher').disabled=!state.publisher.running;
  if(state.selectedVersion!==null&&!$('deployment-version').value)$('deployment-version').value=state.selectedVersion;
}


async function refreshDeployment(){
  deployment=await api('/api/deployment/status?'+new URLSearchParams({operationsOffset:deploymentOffset,limit}));
  table($('published-runs'),['Published extraction','Source version','State / snapshot','Actions'],(deployment.publisher?.runs??[]).map(r=>[
    description(r.id,r.dataset?.name??''),r.sourceVersions.map(v=>'v'+v.id).join(', ')||'Other retained source',description(r.state,r.publication?.snapshot??'Not published'),
    button('Use this publication',()=>{if(!r.publication)throw new Error('Review and publish this candidate in the original publisher first.');$('deployment-run').value=r.id;if(r.sourceVersions.length)$('deployment-version').value=r.sourceVersions[0].id;})
  ]));
  table($('deployment-packages'),['Original request','Action / state','Source / snapshot','Actions'],deployment.operations.map(o=>{
    const r=o.result,buttons=[];
    if(o.status==='complete'&&o.kind==='DEPLOYMENT_REVIEW')buttons.push(button('Use review',()=>{deploymentReview=r;renderDeploymentReview();}));
    if(o.status==='complete'&&o.kind==='DEPLOYMENT_PREPARE'){
      buttons.push(button('Use package',()=>{$('stage-package').value=o.id;$('stage-sha').value=r.sourceSha256;}));
      for(const f of r.files??[])buttons.push(button('Download '+f.file,()=>readAction(()=>download('/api/deployment/file?'+new URLSearchParams({packageId:o.id,file:f.file})))));
    }
    buttons.push(button('Receipt',()=>{$('release-state').replaceChildren(jsonView(o));}));
    return[node('code',o.id),description(o.kind,o.status),description(short(r?.sourceSha256??r?.reviewSha256),r?.dataset?.baselineSnapshot??r?.snapshot??''),actions(...buttons)];
  }));
  pager('deploy',deploymentOffset,deployment.pages.operationsTotal);
  const running=deployment.console?.running; $('release-link').hidden=!running;
  if(running)$('release-link').href=deployment.console.url;
  $('close-release-console').disabled=!running;
  $('release-state').replaceChildren(node('p',running?'Original release console is running.':'Original release console is stopped.','help'));
  if(deployment.native)$('release-state').append(jsonView(deployment.native));
}
function renderDeploymentReview(){
  const out=$('deployment-review');out.replaceChildren();out.hidden=!deploymentReview;
  $('prepare-deployment').disabled=!deploymentReview;
  if(deploymentReview)out.append(node('h4','Reviewed original publication'),jsonView(deploymentReview));
}
function filterInput(){
  const text=$('where').value.trim(),view=$('view-id').value.trim();
  if(view&&text)throw new Error('A native view uses its original saved SeaTable filter. Clear the SQL filter or clear the view ID.');
  if(!text)return null;
  let value;try{value=JSON.parse(text);}catch{throw new Error('Use a complete JSON filter object with field/op/value, all, any or not.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The SQL filter must be a JSON object.');
  return value;
}
for(const id of ['connection','base-id','table-id','view-id','where'])$(id).addEventListener('input',()=>{
  if(busy||pending)return;metadata=null;$('acquisition').hidden=true;
});
function guarded(action){return async event=>{event?.preventDefault();if(busy||pending)return;try{await action();}catch(issue){notice(errorMessage(issue),true);}};}
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>tab(b.dataset.view));
$('refresh').addEventListener('click',guarded(()=>readAction(()=>refresh())));
$('load-current-draft').addEventListener('click',guarded(()=>readAction(async()=>{await refresh();if(state.draft)await loadDraft(state.draft,state.draftRevision);})));
$('discover-form').addEventListener('submit',guarded(()=>mutate('/api/discover',{connectionAlias:$('connection').value,
  baseId:$('base-id').value.trim(),tableId:$('table-id').value.trim(),viewId:$('view-id').value.trim()||null,
  where:filterInput()},'Inspect actual table metadata')));
$('add-order').addEventListener('click',guarded(()=>{
  if(metadata?.source.viewId)throw new Error('The selected native view retains its original SeaTable order.');
  if(sourceOrders.length>=8)throw new Error('The original source supports at most eight stable-order fields.');
  const next=metadata.fields.find(f=>(f.scalarProjectionSupported||f.generatedRecordIdentity)&&!sourceOrders.some(o=>o.field===f.id));
  if(!next)throw new Error('All available order fields are already selected.');
  sourceOrders.push({field:next.id,direction:'asc'});renderOrders();
}));
$('capture-live').addEventListener('click',guarded(async()=>{
  const name=$('capture-query').value.trim();
  if(!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name))throw new Error('Use a valid query name.');
  const columns=columnsFrom(captureColumns);
  await mutate('/api/capture',{discoveryId:metadata.id,connectionAlias:metadata.connectionAlias,sourceOrder:clone(sourceOrders),
    queries:{[name]:{columns}},title:$('capture-title').value.trim(),expectedDraftRevision:state.draftRevision},'Capture complete SeaTable observation');
}));
async function readUpload(file){
  if(!file||file.size<1||file.size>553648128)throw new Error('Choose a complete source packet within the supported 528 MiB transport limit.');
  const data=await file.arrayBuffer(), text=new TextDecoder('utf-8',{fatal:true}).decode(data),packet=JSON.parse(text);
  if(packet.schema!=='stellar-forge.seatable-source-packet.v1')throw new Error('This is not an original SeaTable source packet.');
  return{packet,file:{name:file.name,bytes:file.size,sha256:await sha(data)}};
}
$('import-file').addEventListener('change',guarded(async()=>{
  const file=$('import-file').files[0],epoch=++revision;upload=null;
  const value=await readUpload(file);if(epoch!==revision)return;upload=value;
  $('import-summary').textContent=file.name+' · '+file.size+' bytes · '+value.packet.source.baseId+' / '+value.packet.source.tableId;
}));
$('import-form').addEventListener('submit',guarded(async()=>{
  if(!upload)throw new Error('Wait for the complete selected packet to be read.');
  await mutate('/api/import-package',{packet:upload.packet,title:$('import-title').value.trim(),expectedDraftRevision:state.draftRevision},'Import original complete source',upload.file);
}));
$('draft-title').addEventListener('input',()=>{if(!busy&&!pending)change();});
$('query-select').addEventListener('change',guarded(()=>{flushQuery();queryName=$('query-select').value;renderQuery();}));
$('rename-query').addEventListener('click',guarded(()=>{
  flushQuery();const next=$('query-name').value.trim();
  if(!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(next)||['constructor','prototype','__proto__'].includes(next))throw new Error('Use a valid query name.');
  if(next!==queryName&&Object.hasOwn(draft.queries,next))throw new Error('That query name already exists.');
  if(next!==queryName){draft.queries=Object.fromEntries(Object.entries(draft.queries).map(([n,q])=>[n===queryName?next:n,q]));queryName=next;change();renderQuery();}
}));
$('add-query').addEventListener('click',guarded(()=>{
  flushQuery();if(Object.keys(draft.queries).length>=32)throw new Error('The original source supports at most 32 queries.');
  let i=1;while(Object.hasOwn(draft.queries,'query_'+i))i++;
  const cols={};for(const [index,field]of captureView.fields.entries()){const v=defaultSpec(field,index);v.enabled=true;const {alias:name,enabled:ignored,...spec}=v;cols[name]=spec;}
  queryName='query_'+i;draft.queries[queryName]={columns:cols};change();renderQuery();
}));
$('remove-query').addEventListener('click',guarded(()=>{
  flushQuery();if(Object.keys(draft.queries).length===1)throw new Error('Keep at least one configured query.');
  delete draft.queries[queryName];queryName=Object.keys(draft.queries)[0];change();renderQuery();
}));
$('save-draft').addEventListener('click',guarded(async()=>{
  flushQuery();draft.title=$('draft-title').value.trim();
  await mutate('/api/draft',{draft:clone(draft),expectedRevision:draftRevision},'Save source draft');
}));
$('preview-draft').addEventListener('click',guarded(async()=>{
  if(dirty)throw new Error('Save the edited draft before validating it.');
  await mutate('/api/preview',{draftRevision},'Validate complete source projection');
}));
$('save-version-form').addEventListener('submit',guarded(async()=>{
  if(dirty||!preview)throw new Error('Save and validate this exact draft first.');
  await mutate('/api/version',{draftRevision,previewId:preview.id,reviewer:$('reviewer').value.trim(),
    note:$('change-note').value.trim(),expectedSelectedVersion:state.selectedVersion},'Freeze reviewed source version');
}));
$('compare-form').addEventListener('submit',guarded(()=>readAction(async()=>{
  const result=await api('/api/compare?'+new URLSearchParams({left:$('compare-left').value,right:$('compare-right').value})),out=$('comparison');out.replaceChildren();
  out.append(node('h3','v'+result.left.id+' → v'+result.right.id),node('p','Same capture: '+result.sameObservation+' · Same source selection: '+result.sameSelection+' · Same projection: '+result.sameProjection,'help'));
  for(const q of result.queries){out.append(node('h4',q.name));const wrap=node('div',null,'table-wrap');table(wrap,['Alias','Earlier','Later','Change'],q.columns.map(c=>[c.alias,shown(c.before),shown(c.after),c.status]));out.append(wrap);}
})));
$('open-publisher').addEventListener('click',guarded(()=>mutate('/api/publisher/start',{expectedSelectedVersion:state.selectedVersion},'Open original publisher')));
$('stop-publisher').addEventListener('click',guarded(()=>mutate('/api/publisher/stop',{},'Close original publisher')));
$('refresh-deploy').addEventListener('click',guarded(()=>readAction(refreshDeployment)));
$('deployment-review-form').addEventListener('submit',guarded(()=>mutate('/api/deployment/review',{
  versionId:Number($('deployment-version').value),runId:$('deployment-run').value.trim(),
  terms:JSON.parse($('deployment-terms').value)},'Review original merchant release')));
$('prepare-deployment').addEventListener('click',guarded(()=>{
  if(!deploymentReview)throw new Error('Select a completed original deployment review.');
  return mutate('/api/deployment/prepare',{reviewRequestId:deploymentReview.reviewRequestId,
    expectedReviewSha256:deploymentReview.reviewSha256},'Prepare original deployment package');
}));
$('stage-form').addEventListener('submit',guarded(()=>mutate('/api/deployment/stage',{
  packageRequestId:$('stage-package').value.trim(),expectedSourceSha256:$('stage-sha').value.trim(),
  id:$('stage-id').value.trim(),label:$('stage-label').value.trim(),runtime:{port:0}},'Stage original release')));
$('open-release-console').addEventListener('click',guarded(()=>mutate('/api/deployment/console/open',{},'Open original release controls')));
$('close-release-console').addEventListener('click',guarded(()=>{
  if(!deployment?.console?.instanceId)throw new Error('Refresh the running original console first.');
  return mutate('/api/deployment/console/close',{instanceId:deployment.console.instanceId},'Close original release controls');
}));
for(const [name,get,set]of [
  ['captures',()=>capturesOffset,v=>{capturesOffset=v;}],['versions',()=>versionsOffset,v=>{versionsOffset=v;}],
  ['discoveries',()=>discoveriesOffset,v=>{discoveriesOffset=v;}],['deploy',()=>deploymentOffset,v=>{deploymentOffset=v;}],
])for(const [suffix,delta]of [['prev',-limit],['next',limit]])$(name+'-'+suffix).addEventListener('click',guarded(()=>readAction(async()=>{
  set(Math.max(0,get()+delta));if(name==='deploy')await refreshDeployment();else await refresh();
})));
$('check-operation').addEventListener('click',()=>checkReceipt());
$('resume-operation').addEventListener('click',async()=>{
  if(!pending||busy||recovering)return;recovering=true;lock();
  try{const marker=pending,result=await api('/api/resume',{body:{requestId:marker.requestId}});await finish(result,marker);}
  catch(issue){notice(errorMessage(issue),true);const reply=await api('/api/operation?id='+pending.requestId).catch(()=>null);if(reply){known=reply.operation;showRecovery();}}
  finally{recovering=false;lock();}
});
$('retry-file').addEventListener('change',async()=>{
  if(!pending||busy||recovering)return;
  try{const value=await readUpload($('retry-file').files[0]);if(value.file.bytes!==pending.file.bytes||value.file.sha256!==pending.file.sha256)throw new Error('Reselect the exact original packet bytes.');
    const payload={...pending.small,packet:value.packet,requestId:pending.requestId};
    if(await bodyHash(payload)!==pending.bodySha256)throw new Error('The retained request payload differs. Keep this original request for receipt lookup.');
    retryPayload=payload;showRecovery();
  }catch(issue){notice(errorMessage(issue),true);}
});
$('retry-operation').addEventListener('click',async()=>{
  if(!pending||busy||recovering)return;recovering=true;lock();
  try{const body=retryPayload??pending.small;
    if(!body||await bodyHash(body)!==pending.bodySha256)throw new Error('The identical input is not available. Reselect its original packet or inspect the receipt.');
    const marker=pending,result=await api(marker.path,{body});await finish(result,marker);
  }catch(issue){notice(errorMessage(issue),true);if(pending){const marker=pending,r=await api('/api/operation?id='+pending.requestId).catch(()=>null);if(r){known=r.operation;showRecovery();if(known?.status==='complete')await finish(known.result,marker);else if(known===null&&issue.status)rejectReturnedMutation(issue);}}}
  finally{recovering=false;lock();}
});
$('dismiss-operation').addEventListener('click',async()=>{
  if(!pending||busy||recovering||known?.status!=='failed')return;
  const original=pending.requestId;forget();await refresh().catch(issue=>notice(errorMessage(issue),true));
  notice('Recorded failure acknowledged. Original request '+original+' and its retained files remain in the workspace.');
});

// Whole editable workspace handover. Private archive bytes never enter browser storage.
let handoverPending = null, handoverUpload = null, handoverFile = null, handoverAbort = null, handoverRejected = [];
const HANDOVER_MAX = 32 * 1024 * 1024 * 1024 + 32 * 1024 * 1024 + 13, HANDOVER_CHUNK = 1024 * 1024;
const handoverKey = () => 'stellar.seatable.workspace-handover.v1:' + state.directory;
function saveHandoverState() {
  localStorage.setItem(handoverKey(), JSON.stringify({ pending: handoverPending, upload: handoverUpload, rejected:handoverRejected }));
}
function renderHandoverRecovery(message = '') {
  $('handover-recovery').hidden = !handoverPending;
  if (handoverPending) {
    $('handover-request').textContent = handoverPending.requestId;
    $('handover-recovery-title').textContent = handoverPending.kind === 'upload' ? 'Complete workspace upload retained' : 'Original workspace ' + handoverPending.kind + ' retained';
    $('handover-recovery-message').textContent = message || 'Keep this original request. Check its saved receipt or continue the identical input.';
    $('handover-reselect-label').hidden = handoverPending.kind !== 'upload';
    $('handover-retry').textContent = handoverPending.kind === 'upload' ? 'Resume with the same file' : 'Retry original request';
  }
  for (const name of ['handover-check','handover-retry','handover-reselect']) $(name).disabled = busy || recovering;
  $('handover-pause').hidden = !handoverAbort;
  $('handover-pause').disabled = !handoverAbort;
  lock();
}
function renderHandoverUpload() {
  const out = $('handover-upload-summary'); out.replaceChildren();
  $('handover-receive').disabled = !handoverUpload?.complete || Boolean(handoverPending);
  if (!handoverUpload) { out.append(node('p', 'Select a whole-workspace .stwh file. Its complete bytes remain on this host.', 'help')); return; }
  out.append(node('p', (handoverUpload.complete ? 'Verified complete archive' : 'Retained upload') + ' · ' + handoverUpload.received + ' / ' + handoverUpload.bytes + ' bytes'));
  if (handoverUpload.sha256) out.append(node('code', handoverUpload.sha256));
  out.append(node('p', 'Upload ID: ' + handoverUpload.id, 'path'));
  $('handover-receive').disabled = !handoverUpload.complete || Boolean(handoverPending);
}
async function handoverApi(path, { method = 'GET', body, raw, signal } = {}) {
  const control = new AbortController(), timeout = setTimeout(() => control.abort(), 180000);
  const abort = () => control.abort();
  signal?.addEventListener('abort', abort, { once:true });
  if (signal?.aborted) control.abort();
  try {
    const response = await fetch(path, { method, headers: {
      'x-seatable-workspace-token': token || '',
      ...(raw !== undefined ? { 'content-type':'application/octet-stream' } : body !== undefined ? { 'content-type':'application/json' } : {})
    }, ...(raw !== undefined ? { body:raw } : body !== undefined ? { body:JSON.stringify(body) } : {}), cache:'no-store', signal:control.signal });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.message || value.error || response.statusText), { code:value.error, status:response.status });
    return value;
  } catch (issue) { if (!issue.status) issue.uncertain = true; throw issue; }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
function rememberHandover(kind, input, file = null) {
  const marker = { kind, requestId:input.requestId, input:clone(input), ...(file ? {file:{name:file.name,bytes:file.size}} : {}), createdAt:new Date().toISOString() };
  // Persist the exact intent before the first native request.
  const previous = handoverPending; handoverPending = marker;
  try { saveHandoverState(); } catch (issue) { handoverPending = previous; throw issue; }
  renderHandoverRecovery(); return marker;
}
function finishHandoverMarker(marker) {
  if (handoverPending?.requestId !== marker.requestId) return;
  const previous = handoverPending; handoverPending = null;
  try { saveHandoverState(); } catch (issue) { handoverPending = previous; throw issue; }
  renderHandoverRecovery();
}
async function downloadWorkspace(id) {
  const ticket = await handoverApi('/api/workspace/download', { method:'POST', body:{id} });
  const url = new URL(ticket.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/workspace/')) throw new Error('The archive download must stay on this original workspace.');
  const link = node('a'); link.href = url.href; link.download = ticket.filename; link.rel = 'noreferrer'; link.click();
  $('handover-download-note').textContent = 'Download requested: ' + ticket.filename + ' · ' + ticket.bytes + ' bytes · SHA256 ' + ticket.sha256 + '. If interrupted, choose Download again for this same archive.';
}
function handoverCounts(value) {
  return Object.entries(value ?? {}).map(([name,count]) => name + ': ' + shown(count)).join(' · ') || 'Full saved workspace';
}
async function refreshHandovers() {
  const [exportsValue, receivedValue] = await Promise.all([
    handoverApi('/api/workspace/exports'), handoverApi('/api/workspace/received')
  ]);
  table($('handover-exports'), ['Archive','Saved work','Exact identity','Actions'], exportsValue.exports.map(item => [
    description(item.filename, item.bytes + ' bytes'), handoverCounts(item.counts),
    node('code', item.sha256),
    button('Download complete workspace', () => readAction(() => downloadWorkspace(item.id)))
  ]));
  table($('handover-received'), ['Independent workspace','Saved work','Original archive','Actions'], receivedValue.received.map(item => [
    description(item.name, item.workspaceIdentity), handoverCounts(item.counts), node('code', item.archiveSha256),
    button('Open received workspace', () => readAction(async () => {
      const result = await handoverApi('/api/workspace/open', {method:'POST',body:{name:item.name}});
      const url = new URL(result.url, location.href);
      if (!['http:','https:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password)
        throw new Error('The received workspace must use its original private local listener.');
      const out=$('handover-opened');out.hidden=false;out.replaceChildren(node('p','Independent workspace ' + result.name + ' is open. Its edits remain separate from this source.'));
      const link=node('a','Open '+result.name);link.href=url.href;link.target='_blank';link.rel='noreferrer';out.append(link);
    }))
  ]));
}
async function completeHandover(result, marker) {
  await refreshHandovers();
  if (marker.kind === 'export') {
    $('handover-download-note').textContent = 'Saved ' + result.filename + ' · ' + result.bytes + ' bytes · SHA256 ' + result.sha256 + '. Download the exact file from the list.';
    await refresh();
  } else if (marker.kind === 'receive') {
    $('handover-opened').hidden=false;$('handover-opened').replaceChildren(node('p','Received independent workspace ' + result.name + '. Open it from the saved receiving list.'));
  }
  finishHandoverMarker(marker);
  notice('Saved original whole-workspace ' + marker.kind + ' request ' + marker.requestId + '.');
}
async function submitHandover(marker) {
  try {
    const result = await handoverApi('/api/workspace/' + marker.kind, {method:'POST',body:marker.input});
    await completeHandover(result, marker);
  } catch (issue) {
    if ([400,409,413,422].includes(issue.status)) {
      const status = await handoverApi('/api/workspace/' + marker.kind + '-status?id=' + encodeURIComponent(marker.requestId)).catch(() => undefined);
      if (status === null) {
        handoverRejected.push({...clone(marker),rejectedAt:new Date().toISOString(),error:{code:issue.code,message:issue.message}});
        finishHandoverMarker(marker);
      }
    }
    throw issue;
  }
}
async function checkHandover() {
  if (!handoverPending || busy || recovering) return;
  recovering=true;renderHandoverRecovery();
  try {
    const marker=handoverPending;
    if(marker.kind==='upload'){
      handoverUpload=await handoverApi('/api/workspace/upload?id='+encodeURIComponent(marker.requestId));
      saveHandoverState();renderHandoverUpload();
      if(!handoverUpload){renderHandoverRecovery('No original upload receipt is visible. Resume the same file and original request.');return;}
      // Even a complete prior upload must be rechecked byte-for-byte if the response
      // was unknown. Resume replays its full selected file from offset zero.
      renderHandoverRecovery(handoverUpload.complete ?
        'The complete original upload is retained. Resume with the same file to reconcile every byte before accepting this local selection.' :
        'The original upload retains '+handoverUpload.received+' bytes. Resume rechecks every retained range before appending.');
    }else{
      const status=await handoverApi('/api/workspace/'+marker.kind+'-status?id='+encodeURIComponent(marker.requestId));
      const saved=status?.operation ?? status;
      if(saved?.status==='complete') await completeHandover(saved.result,marker);
      else renderHandoverRecovery(saved?.error ? errorMessage(saved.error) :
        saved ? 'Original request state: '+saved.status+'. Retry only this same retained request.' : 'No original receipt is visible. Retry this exact request.');
    }
  }catch(issue){notice(errorMessage(issue),true);renderHandoverRecovery('The original request remains retained. '+errorMessage(issue));}
  finally{recovering=false;renderHandoverRecovery();}
}
async function streamHandoverUpload(file, marker) {
  if(!file || file.size!==marker.file.bytes)throw new Error('Select the complete original archive with the same byte length. Every retained byte is compared by the original host.');
  handoverAbort=new AbortController();renderHandoverRecovery('Uploading original archive…');
  try{
    try {
      handoverUpload=await handoverApi('/api/workspace/upload/start',{method:'POST',body:marker.input,signal:handoverAbort.signal});
    } catch(issue) {
      if([400,409,413,422].includes(issue.status)){
        const saved=await handoverApi('/api/workspace/upload?id='+encodeURIComponent(marker.requestId)).catch(()=>undefined);
        if(saved===null){
          handoverRejected.push({...clone(marker),rejectedAt:new Date().toISOString(),error:{code:issue.code,message:issue.message}});
          finishHandoverMarker(marker);
        }
      }
      throw issue;
    }
    for(let offset=0;offset<file.size;offset+=HANDOVER_CHUNK){
      if(handoverAbort.signal.aborted)throw new Error('Upload paused. The original host retains its bytes and request.');
      const block=file.slice(offset,Math.min(file.size,offset+HANDOVER_CHUNK));
      handoverUpload=await handoverApi('/api/workspace/upload?'+new URLSearchParams({id:marker.requestId,offset}),{method:'PUT',raw:block,signal:handoverAbort.signal});
      $('handover-progress').textContent='Compared / uploaded '+Math.min(file.size,offset+block.size)+' of '+file.size+' bytes.';
      renderHandoverUpload();
    }
    handoverUpload=await handoverApi('/api/workspace/upload/finish',{method:'POST',body:{requestId:marker.requestId},signal:handoverAbort.signal});
    if(!handoverUpload.complete || handoverUpload.bytes!==file.size || !/^[a-f0-9]{64}$/.test(handoverUpload.sha256))
      throw new Error('The host has not returned a complete exact archive identity.');
    saveHandoverState();finishHandoverMarker(marker);renderHandoverUpload();
    $('handover-progress').textContent='Complete archive retained and verified. Review its SHA256 before receiving.';
  }finally{handoverAbort=null;renderHandoverRecovery();}
}
async function runHandover(action) {
  if(busy||recovering||pending)return;
  busy=true;lock();renderHandoverRecovery();notice('');
  try{await action();}catch(issue){notice(errorMessage(issue),true);renderHandoverRecovery('The original request is retained. '+errorMessage(issue));}
  finally{busy=false;lock();renderHandoverRecovery();}
}
$('handover-refresh').addEventListener('click',guarded(()=>readAction(refreshHandovers)));
$('handover-export-form').addEventListener('submit',guarded(()=>runHandover(async()=>{
  if(handoverPending)throw new Error('Finish the retained handover request first.');
  if(dirty)throw new Error('Save or reload the current draft before exporting the whole workspace.');
  if(!$('handover-export-confirm').checked)throw new Error('Confirm that export closes the owned publisher and release consoles.');
  const marker=rememberHandover('export',{requestId:uuid(),expectedDraftRevision:state.draftRevision,expectedSelectedVersion:state.selectedVersion});
  await submitHandover(marker);
})));
$('handover-file').addEventListener('change',guarded(()=>{
  handoverFile=$('handover-file').files[0]??null;
  $('handover-file-info').textContent=handoverFile?handoverFile.name+' · '+handoverFile.size+' bytes. The complete file will be streamed in 1 MiB chunks.':'';
}));
$('handover-upload-form').addEventListener('submit',guarded(()=>runHandover(async()=>{
  if(handoverPending)throw new Error('Finish the retained handover request first.');
  if(!handoverFile||handoverFile.size<1||handoverFile.size>HANDOVER_MAX)throw new Error('Select a complete .stwh archive within the native limit: 32 GiB of contents plus its manifest and header.');
  const marker=rememberHandover('upload',{requestId:uuid(),sha256:null,bytes:handoverFile.size,filename:handoverFile.name},handoverFile);
  await streamHandoverUpload(handoverFile,marker);
})));
$('handover-receive-form').addEventListener('submit',guarded(()=>runHandover(async()=>{
  if(handoverPending)throw new Error('Finish the retained handover request first.');
  if(!handoverUpload?.complete)throw new Error('Finish uploading the complete archive first.');
  const latest=await handoverApi('/api/workspace/upload?id='+encodeURIComponent(handoverUpload.id));
  if(!latest.complete||latest.sha256!==handoverUpload.sha256||latest.bytes!==handoverUpload.bytes)throw new Error('The retained archive identity changed. Review it again.');
  if(!$('handover-receive-confirm').checked)throw new Error('Confirm the complete private archive and independent receiving destination.');
  const name=$('handover-name').value.trim();
  if(!/^[a-z][a-z0-9_-]{0,47}$/.test(name))throw new Error('Use a lowercase receiving name beginning with a letter, at most 48 characters.');
  const marker=rememberHandover('receive',{requestId:uuid(),uploadId:latest.id,expectedSha256:latest.sha256,name});
  await submitHandover(marker);
})));
$('handover-check').addEventListener('click',checkHandover);
$('handover-reselect').addEventListener('change',()=>{
  handoverFile=$('handover-reselect').files[0]??null;
  renderHandoverRecovery(handoverFile?'Selected '+handoverFile.name+'. Resume will compare its complete bytes against this original upload.':'');
});
$('handover-retry').addEventListener('click',()=>runHandover(async()=>{
  const marker=handoverPending;if(!marker)return;
  if(marker.kind==='upload')await streamHandoverUpload(handoverFile,marker);else await submitHandover(marker);
}));
$('handover-pause').addEventListener('click',()=>handoverAbort?.abort());
async function restoreHandoverState() {
  const saved=localStorage.getItem(handoverKey());
  if(saved){const value=JSON.parse(saved);handoverPending=value.pending??null;handoverUpload=value.upload??null;handoverRejected=Array.isArray(value.rejected)?value.rejected:[];}
  renderHandoverRecovery();renderHandoverUpload();
  await refreshHandovers();
}


// Source-bound review of a complete, already received independent workspace.
// Only exact review identities, field choices and notes enter local storage.
let returnedSelection=null, returnedPreview=null, returnedRecord=null;
let returnedChoices=Object.create(null), returnedNote='', returnedOffset=0;
let returnedDirty=false, returnedStale=null;
const returnedLimit=100;
const returnedKey=id=>'stellar.seatable.return-review.v1:'+state.directory+':'+id;
const returnedEqual=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));

const returnedStaleCodes=new Set(['SEATABLE_RETURN_CHANGED','SEATABLE_RETURN_PREVIEW_CHANGED','SEATABLE_DRAFT_CHANGED']);
function rejectReturnedMutation(issue) {
  if(!pending?.path?.startsWith('/api/return/')||!returnedStaleCodes.has(issue.code))return false;
  localStorage.setItem(markerPrefix(pending.directory)+'rejected:'+pending.requestId,JSON.stringify({
    ...clone(pending),rejectedAt:new Date().toISOString(),error:{code:issue.code,message:issue.message}}));
  forget();return true;
}

function returnedSavedState() {
  return {schema:'stellar-forge.seatable-local-return-review.v1',reviewId:returnedSelection,
    revision:returnedPreview.review.revision,previewSha256:returnedPreview.previewSha256,
    choices:clone(returnedChoices),note:returnedNote,updatedAt:new Date().toISOString()};
}
function retainReturnedEdits() {
  if(!returnedSelection||!returnedPreview||returnedStale)return;
  // Persist before permitting a save or apply. Storage failures remain visible.
  localStorage.setItem(returnedKey(returnedSelection),JSON.stringify(returnedSavedState()));
}
function updateReturnedDirty() {
  returnedDirty=!returnedEqual(returnedChoices,returnedRecord?.choices??{})||returnedNote!==(returnedRecord?.note??'');
}
function returnedGuardDraft() {
  if(dirty)throw new Error('Save the unsaved column edits in Review columns before capturing, reviewing or applying a returned draft. They remain in this editor.');
}
async function refreshReturnedInventory() {
  const [reviews,received]=await Promise.all([api('/api/returns'),api('/api/workspace/received')]);
  const selector=$('return-child'),old=selector.value;
  selector.replaceChildren(node('option','Select a received independent workspace'));
  selector.firstChild.value='';
  for(const child of received.received??[]){
    const option=node('option',child.name+' · '+short(child.archiveSha256)+' · '+short(child.workspaceIdentity));
    option.value=child.name;selector.append(option);
  }
  if((received.received??[]).some(item=>item.name===old))selector.value=old;
  table($('return-inventory'),['Saved review','Incoming workspace','Status','Action'],(reviews.returns??[]).map(item=>[
    description(item.id,'Revision '+item.revision),
    description(item.received?.name??'Original received workspace',short(item.received?.archiveSha256)),
    item.status,button('Open returned review',()=>readAction(()=>openReturnedReview(item.id)))
  ]));
}
async function readReturnedEdition(id,offset=0) {
  const query=new URLSearchParams({id,offset,limit:returnedLimit});
  const [record,view]=await Promise.all([api('/api/return?id='+encodeURIComponent(id)),api('/api/return/preview?'+query)]);
  if(record.id!==id||view.review?.id!==id||record.revision!==view.review.revision)
    throw new Error('The saved review changed while it was read. Refresh this same review.');
  return {record,view};
}
async function openReturnedReview(id,offset=0) {
  const {record,view}=await readReturnedEdition(id,offset);
  let saved=null;const original=localStorage.getItem(returnedKey(id));
  if(original){
    try{saved=JSON.parse(original);}catch{throw new Error('The retained local choices cannot be decoded. Preserve this browser storage before continuing.');}
    if(saved.reviewId!==id||!saved.choices||typeof saved.choices!=='object'||Array.isArray(saved.choices)||typeof saved.note!=='string')
      throw new Error('The retained local choices have an invalid identity. Preserve them before continuing.');
  }
  returnedSelection=id;returnedRecord=record;returnedPreview=view;returnedOffset=offset;
  returnedChoices=Object.assign(Object.create(null),record.choices??{});returnedNote=record.note??'';returnedStale=null;
  if(saved){
    if(saved.revision===view.review.revision&&saved.previewSha256===view.previewSha256){
      returnedChoices=Object.assign(Object.create(null),saved.choices);returnedNote=saved.note;
    }else returnedStale=saved;
  }
  updateReturnedDirty();renderReturnedReview();tab('returned');
}
function renderReturnedReview() {
  const view=returnedPreview;
  $('return-detail').hidden=!view;
  if(!view)return;
  $('return-title').textContent='Returned review '+view.review.id+' · revision '+view.review.revision+' · '+view.review.status;
  $('return-identities').replaceChildren();
  for(const side of ['base','local','returned']){
    const identity=view[side];
    const box=node('div',null,'return-identity');
    box.append(node('strong',side==='base'?'Common original draft':side==='local'?'Current author draft':'Frozen returned draft'),
      node('p',identity?'Draft revision '+identity.draftRevision:'No common draft'),
      node('code',identity?.draftSha256??'Unavailable'));
    $('return-identities').append(box);
  }
  $('return-source').replaceChildren(node('summary','Exact source and incoming workspace'),jsonView({
    source:view.source,received:view.review.received,previewSha256:view.previewSha256}));
  const issues=$('return-issues');issues.replaceChildren();
  for(const issue of view.issues??[])issues.append(node('p',[issue.code,issue.message].filter(Boolean).join(': '),'error'));
  $('return-stale').hidden=!returnedStale;
  $('return-stale-message').textContent=returnedStale?
    'Local choices belong to saved revision '+returnedStale.revision+' and preview '+returnedStale.previewSha256+
    '. The current source, local draft or saved review has changed. Your local choices remain retained; save and apply are blocked until you choose how to continue.':'';
  $('return-note').value=returnedNote;
  $('return-note').disabled=Boolean(returnedStale);
  $('return-review-state').textContent=returnedStale?'Retained local choices need reconciliation':
    returnedDirty?'Unsaved review choices or note': 'Showing saved review choices';
  $('return-summary').textContent=view.total+' changed fields · '+view.unresolved+' unresolved · '+Object.keys(returnedChoices).length+' explicit choices';
  const cards=$('return-rows');cards.replaceChildren();
  for(const row of view.rows??[]){
    const card=node('article',null,'return-row'),heading=node('h4',row.path||'Whole draft');
    heading.append(node('span',row.status,'badge'));card.append(heading);
    const values=node('div',null,'return-values');
    for(const side of ['base','local','returned']){
      const entry=row[side],cell=node('div');
      cell.append(node('strong',side==='base'?'Common original':side==='local'?'Current author':'Returned'),
        entry?.present?jsonView(entry.value):node('p','Absent','help'));values.append(cell);
    }
    card.append(values);
    const label=node('label','Field decision'),choice=node('select');
    const empty=node('option',row.status==='conflict'?'Choose explicitly to resolve this conflict':'Use automatic comparison');
    empty.value='';choice.append(empty);
    for(const [side,title]of [['local','Keep current author value'],['returned','Use returned value'],['base','Use common original value']]){
      const option=node('option',title);option.value=side;choice.append(option);
    }
    choice.value=returnedChoices[row.path]??'';choice.disabled=Boolean(returnedStale);
    choice.addEventListener('change',()=>{
      if(returnedStale||busy||pending||handoverPending)return;
      if(choice.value)returnedChoices[row.path]=choice.value;else delete returnedChoices[row.path];
      updateReturnedDirty();
      try{retainReturnedEdits();}catch(issue){notice('Local choices could not be saved: '+errorMessage(issue),true);}
      renderReturnedReview();
    });
    label.append(choice);card.append(label);cards.append(card);
  }
  if(!view.rows?.length)cards.append(node('p',view.total?'No changes on this page.':'No changed fields in this comparison.','help'));
  $('return-page').textContent=(view.total?returnedOffset+1:0)+'–'+Math.min(returnedOffset+(view.rows?.length??0),view.total)+' of '+view.total;
  $('return-prev').disabled=returnedOffset===0;
  $('return-next').disabled=view.nextOffset==null;
  $('return-save').disabled=Boolean(returnedStale)||dirty||view.review.status==='applied';
  $('return-apply').disabled=Boolean(returnedStale)||returnedDirty||dirty||!view.canApply||view.review.status==='applied';
  $('return-apply-help').textContent=dirty?'Save the column editor before continuing.':
    returnedStale?'Resolve the retained local review first.':
    returnedDirty?'Save these choices and refresh the preview before applying.':
    view.canApply?'Applying changes only the author draft. Preview all rows and save a version separately.':
    'Resolve the conflicts and source/ancestry issues, save the review, then inspect the refreshed preview.';
}
async function returnedPage(offset) {
  retainReturnedEdits();
  await openReturnedReview(returnedSelection,offset);
}
function downloadReturnedChoices() {
  if(!returnedPreview)return;
  const content=JSON.stringify(returnedStale??returnedSavedState(),null,2)+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=node('a');
  a.href=url;a.download='seatable-return-'+returnedSelection+'-local-choices.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function archiveReturnedLocal(value) {
  // Keep a recoverable local copy before an explicit replacement/carry operation.
  localStorage.setItem(returnedKey(returnedSelection)+':history:'+uuid(),JSON.stringify(value));
}
async function useSavedReturnedReview() {
  const id=returnedSelection,saved=returnedStale??returnedSavedState();
  archiveReturnedLocal(saved);localStorage.removeItem(returnedKey(id));
  await openReturnedReview(id,0);
}
async function carryReturnedChoices() {
  if(!returnedStale)return;
  const saved=clone(returnedStale),id=returnedSelection,first=await readReturnedEdition(id,0);
  const hash=first.view.previewSha256,version=first.view.review.revision,paths=new Set(first.view.rows.map(row=>row.path));
  let next=first.view.nextOffset;
  while(next!=null){
    const page=await api('/api/return/preview?'+new URLSearchParams({id,offset:next,limit:returnedLimit}));
    if(page.previewSha256!==hash||page.review.revision!==version)throw new Error('This review changed while its pages were read. Refresh and try again.');
    for(const row of page.rows)paths.add(row.path);
    if(page.nextOffset!=null&&page.nextOffset<=next)throw new Error('The return preview did not advance.');
    next=page.nextOffset;
  }
  const choices=Object.fromEntries(Object.entries(saved.choices).filter(([path,side])=>paths.has(path)&&['local','returned','base'].includes(side)));
  archiveReturnedLocal(saved);
  const adopted={...saved,revision:version,previewSha256:hash,choices,updatedAt:new Date().toISOString()};
  localStorage.setItem(returnedKey(id),JSON.stringify(adopted));
  await openReturnedReview(id,0);
  notice('Carried '+Object.keys(choices).length+' explicit choices to the current comparison. '+(Object.keys(saved.choices).length-Object.keys(choices).length)+
    ' choices no longer match changed fields; their complete original map remains in local history. Review every page and save explicitly.');
}
async function finishReturnedMutation(result,marker) {
  if(!marker.path?.startsWith('/api/return/'))return;
  const id=marker.path==='/api/return/apply'?result.review?.id:result.id;
  if(!id)throw new Error('The original returned-review result is missing its saved identity.');
  if(marker.path==='/api/return/review'||marker.path==='/api/return/apply'){
    // Only clear choices after an observed durable save. Exact marker remains if a later read fails.
    localStorage.removeItem(returnedKey(id));
  }
  if(marker.path==='/api/return/apply'&&!dirty&&state.draft)await loadDraft(state.draft,state.draftRevision);
  await refreshReturnedInventory();await openReturnedReview(id,0);
}
$('returns-refresh').addEventListener('click',guarded(()=>readAction(async()=>{
  await refresh();await refreshReturnedInventory();
  if(returnedSelection)await returnedPage(returnedOffset);
})));
$('return-capture-form').addEventListener('submit',guarded(()=>{
  returnedGuardDraft();const name=$('return-child').value;
  if(!name)throw new Error('Select an existing received independent workspace.');
  return mutate('/api/return/capture',{name,expectedDraftRevision:state.draftRevision},'Capture returned customer draft');
}));
$('return-refresh').addEventListener('click',guarded(()=>readAction(()=>returnedPage(returnedOffset))));
$('return-prev').addEventListener('click',guarded(()=>readAction(()=>returnedPage(Math.max(0,returnedOffset-returnedLimit)))));
$('return-next').addEventListener('click',guarded(()=>readAction(()=>returnedPage(returnedPreview.nextOffset))));
$('return-note').addEventListener('input',()=>{
  if(returnedStale||busy||pending||handoverPending)return;
  returnedNote=$('return-note').value;updateReturnedDirty();
  try{retainReturnedEdits();}catch(issue){notice('Local note could not be saved: '+errorMessage(issue),true);}
  // Do not rebuild the focused textarea while typing.
  $('return-review-state').textContent=returnedDirty?'Unsaved review choices or note':'Showing saved review choices';
  $('return-apply').disabled=returnedDirty||dirty||!returnedPreview.canApply;
});
$('return-save').addEventListener('click',guarded(()=>{
  returnedGuardDraft();if(returnedStale||!returnedPreview)throw new Error('Open and reconcile the current saved review first.');
  retainReturnedEdits();
  return mutate('/api/return/review',{reviewId:returnedSelection,expectedReviewRevision:returnedPreview.review.revision,
    previewSha256:returnedPreview.previewSha256,choices:clone(returnedChoices),note:returnedNote},'Save returned draft decisions');
}));
$('return-apply').addEventListener('click',guarded(()=>{
  returnedGuardDraft();
  if(returnedStale||returnedDirty||!returnedPreview?.canApply)throw new Error('Save the resolved choices and inspect the current preview before applying.');
  return mutate('/api/return/apply',{reviewId:returnedSelection,expectedReviewRevision:returnedPreview.review.revision,
    previewSha256:returnedPreview.previewSha256},'Apply reviewed return to author draft');
}));
$('return-export').addEventListener('click',guarded(()=>readAction(()=>download('/api/return/export?'+new URLSearchParams({
  id:returnedSelection,revision:returnedPreview.review.revision
})))));
$('return-local-download').addEventListener('click',guarded(downloadReturnedChoices));
$('return-use-saved').addEventListener('click',guarded(()=>readAction(useSavedReturnedReview)));
$('return-carry').addEventListener('click',guarded(()=>readAction(carryReturnedChoices)));

try{
  await refresh();
  await restoreHandoverState();
  await refreshReturnedInventory();
  const active=sessionStorage.getItem(activeKey(state.directory));
  if(active){try{pending=JSON.parse(localStorage.getItem(markerPrefix(state.directory)+active));}catch{}}
  if(pending){retryPayload=pending.file?null:pending.small;showRecovery();await checkReceipt();}
  else if(state.draft)await loadDraft(state.draft,state.draftRevision);
}catch(issue){notice(errorMessage(issue),true);lock();}

