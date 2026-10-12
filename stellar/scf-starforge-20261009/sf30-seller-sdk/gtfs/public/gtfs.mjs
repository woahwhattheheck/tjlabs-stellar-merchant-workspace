import { publisherHost } from '/app.mjs';
const $=id=>document.getElementById(id);
const native=publisherHost;
const ui={status:null,feed:null,feedSource:null,acquisition:null,edition:null,comparison:null,busy:false,refreshing:false,
  offsets:{feeds:0,feedSources:0,acquisitions:0,editions:0,comparisons:0,decisions:0,releases:0,exports:0},rows:null,rowOffset:0,routeOffset:0,
  manifest:null,manifestOffset:0,artifact:null,recipeDirty:false,sourceDirty:false,sourceVersionOffset:0,attemptOffset:0,
  feedRequest:null,feedRequestLoaded:false};
const previousAcquisitions=new Map();
const selectedRoutes=new Set();
function element(tag,text='',attrs={}) {
  const value=document.createElement(tag);value.textContent=text;
  for(const [key,item]of Object.entries(attrs))value.setAttribute(key,item);
  return value;
}
function message(text){$('gtfs-notice').textContent=text;$('gtfs-notice').hidden=!text;}
function short(value){return value?value.slice(0,12)+'…':'—';}
function count(value){return Number(value??0).toLocaleString();}
function json(value){return JSON.stringify(value,null,2);}
async function api(path,input) {
  const response=await fetch(path,input===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.message??value.error??'The original operation did not complete.'),
    {code:value.code??value.error,status:response.status});
  return value;
}
function request(payload){return{requestId:crypto.randomUUID(),expectedRevision:ui.status.revision,payload};}
function button(label,action,attributes={}) {
  const control=element('button',label,{type:'button',...attributes});
  control.addEventListener('click',()=>run(action));return control;
}
async function run(action) {
  if(ui.busy)return;ui.busy=true;message('');controls();
  try{await action();}catch(issue){message(issue.message);}
  finally{ui.busy=false;await refresh().catch(issue=>message(issue.message));controls();}
}
function download(kind,id,file,sha) {
  const query=new URLSearchParams({kind,id,file,expectedSha256:sha});
  return '/api/gtfs/download?'+query;
}
function table(container,fields,rows,extra=null) {
  container.replaceChildren();
  const grid=element('table'),head=element('thead'),tr=element('tr');
  for(const name of fields)tr.append(element('th',name));
  if(extra)tr.append(element('th','Select'));head.append(tr);grid.append(head);
  const body=element('tbody');
  for(const row of rows) {
    const line=element('tr');
    for(const name of fields)line.append(element('td',row[name]??''));
    if(extra){const cell=element('td');extra(cell,row);line.append(cell);}
    body.append(line);
  }
  grid.append(body);container.append(grid);
}
const root=element('section','',{class:'gtfs-workspace','aria-label':'GTFS Schedule source workspace'});
root.innerHTML='<section class="panel"><div class="section-heading"><div><span class="eyebrow">GTFS / SOURCE AND SERVICE DATES</span><h2>Schedule editions</h2></div><span id="gtfs-identity" class="mono muted"></span></div>'+
'<p>Retain the original feed, choose its service dates and review a complete edition. Publish selected resources through the dataset controls below.</p>'+
'<div id="gtfs-notice" class="notice" role="status" hidden></div><div id="gtfs-pending" class="gtfs-pending" hidden></div>'+
'<details open><summary>Agency feed sources and refresh</summary><p>Save the agency’s public HTTPS ZIP URL. Each download is retained with its response headers and inspected before you create an edition.</p>'+
'<div id="gtfs-source-request" class="gtfs-pending" hidden></div>'+
'<form id="gtfs-source-config"><div class="two"><label>Source title<input id="gtfs-config-title" maxlength="128" required></label><label>Public HTTPS feed URL<input id="gtfs-config-url" type="url" maxlength="4096" placeholder="https://agency.org/transit/feed.zip" required></label></div>'+
'<div class="two"><label>Download timeout (seconds)<input id="gtfs-config-timeout" type="number" min="1" max="180" value="120" required></label><label>Source note<textarea id="gtfs-config-note" rows="2" maxlength="4000"></textarea></label></div>'+
'<div class="actions"><button type="submit" id="gtfs-source-save">Save agency feed source</button><button type="button" id="gtfs-source-new">New source</button><span id="gtfs-config-identity" class="mono muted"></span></div></form>'+
'<div id="gtfs-acquire-controls" hidden><div class="two"><label>Previous retained response<select id="gtfs-previous-acquisition"></select></label><label class="check"><input id="gtfs-conditional" type="checkbox" checked>Use saved response validators when available</label></div>'+
'<p id="gtfs-previous-summary" class="muted"></p><div class="actions"><button id="gtfs-acquire" type="button">Acquire or refresh feed</button><button id="gtfs-source-files" type="button">Download source versions</button></div>'+
'<details><summary>Saved source versions</summary><div id="gtfs-source-versions" class="stack"></div><nav id="gtfs-source-version-pages" class="pagination"></nav><pre id="gtfs-source-version-json"></pre></details></div>'+
'<div class="gtfs-split"><div><h3>Saved agency sources</h3><div id="gtfs-feedSources" class="stack"></div><nav id="gtfs-feedSources-pages" class="pagination"></nav></div><div><h3>Completed acquisitions</h3><div id="gtfs-acquisitions" class="stack"></div><nav id="gtfs-acquisitions-pages" class="pagination"></nav></div></div>'+
'<div id="gtfs-acquisition-panel" hidden><h3 id="gtfs-acquisition-title">Retained source response</h3><p id="gtfs-acquisition-summary"></p><div class="actions"><button id="gtfs-acquisition-use" type="button">Use retained feed for an edition</button><button id="gtfs-acquisition-files" type="button">Download original response files</button></div>'+
'<div id="gtfs-acquisition-attempts" class="table-wrap"></div><nav id="gtfs-acquisition-attempt-pages" class="pagination"></nav><details><summary>Exact response, source and feed identities</summary><pre id="gtfs-acquisition-json"></pre></details></div></details>'+
'<form id="gtfs-upload"><div class="two"><label>Feed title<input id="gtfs-feed-title" maxlength="128" placeholder="Agency or service feed" required></label><label>Original GTFS ZIP<input id="gtfs-file" type="file" accept=".zip,application/zip" required></label></div><div class="actions"><button type="submit">Retain complete feed</button><small>Maximum 16 MiB compressed. Every original member remains available.</small></div></form>'+
'<div class="gtfs-split"><div><h3>Retained feeds</h3><div id="gtfs-feeds" class="stack"></div><nav id="gtfs-feeds-pages" class="pagination"></nav></div><div><h3>Saved editions</h3><div id="gtfs-editions" class="stack"></div><nav id="gtfs-editions-pages" class="pagination"></nav></div></div></section>'+
'<section class="panel" id="gtfs-source-panel" hidden><div class="section-heading"><h2 id="gtfs-source-title">Original feed</h2><div id="gtfs-feed-downloads" class="actions"></div></div><div id="gtfs-source-metrics" class="metrics"></div>'+
'<details><summary>Original members, agency records and source bounds</summary><div id="gtfs-members" class="table-wrap"></div><pre id="gtfs-original-info"></pre></details>'+
'<form id="gtfs-recipe"><div class="two"><label>Edition title<input id="gtfs-edition-title" maxlength="128" required></label><label class="check"><input id="gtfs-schedule" type="checkbox" checked>Include dated trips, stop calls and frequency windows</label></div>'+
'<div class="two"><label>First service date<input id="gtfs-start" type="date" required></label><label>Last service date<input id="gtfs-end" type="date" required></label></div>'+
'<label>Agencies<select id="gtfs-agencies" multiple size="4"></select><small>No selection includes every original agency.</small></label>'+
'<details><summary>Choose routes for the derived schedule</summary><div class="actions"><input id="gtfs-route-query" aria-label="Search all original routes" placeholder="Route ID or name"><button id="gtfs-route-search" type="button">Search all routes</button><button id="gtfs-route-clear" type="button">Include every route</button></div><p id="gtfs-routes-selected"></p><div id="gtfs-route-results" class="table-wrap"></div><nav id="gtfs-route-pages" class="pagination"></nav></details>'+
'<fieldset><legend>Complete original tables to publish</legend><div id="gtfs-tables" class="gtfs-table-choices"></div></fieldset>'+
'<details open><summary>Original source and rights fields</summary><div class="two"><label>Original source URL<input id="gtfs-source-url" type="url"></label><label>Retrieved at<input id="gtfs-retrieved" placeholder="2026-10-12T08:00:00Z"></label><label>License or source terms URL<input id="gtfs-license-url" type="url"></label><label>License name<input id="gtfs-license-name" maxlength="4096"></label></div><label>Attribution<input id="gtfs-attribution" maxlength="4096"></label></details>'+
'<label>Edition note<textarea id="gtfs-note" rows="2" maxlength="4000"></textarea></label><div class="actions"><button type="submit">Create complete edition</button><span id="gtfs-selection-detail" class="muted"></span></div></form></section>'+
'<section class="panel" id="gtfs-edition-panel" hidden><div class="section-heading"><div><span class="eyebrow">RETAINED EDITION</span><h2 id="gtfs-edition-heading"></h2></div><span id="gtfs-edition-hash" class="mono"></span></div><div id="gtfs-edition-resources" class="table-wrap"></div>'+
'<div class="actions"><button id="gtfs-select" type="button">Select edition for new publication plans</button><button id="gtfs-edition-files" type="button">Original source and CSV downloads</button><span id="gtfs-selected-message" class="muted"></span></div>'+
'<div class="two"><label>Inspect resource<select id="gtfs-resource"></select></label><label>Search retained rows<input id="gtfs-row-query" maxlength="256"></label></div><div class="actions"><button id="gtfs-row-search" type="button">Inspect rows</button><span id="gtfs-row-summary" class="muted"></span></div><div id="gtfs-rows" class="table-wrap"></div><nav id="gtfs-row-pages" class="pagination"></nav><details><summary>Exact selection, original identities and schedule semantics</summary><pre id="gtfs-edition-json"></pre></details></section>'+
'<section class="panel"><span class="eyebrow">SOURCE COMPARISON</span><h2>Compare editions and record decisions</h2><form id="gtfs-compare"><div class="two"><label>Before edition<select id="gtfs-before" required></select></label><label>After edition<select id="gtfs-after" required></select></label></div><button type="submit">Compare complete resources</button></form>'+
'<div id="gtfs-comparisons" class="stack"></div><nav id="gtfs-comparisons-pages" class="pagination"></nav><div id="gtfs-comparison-panel" hidden><p id="gtfs-comparison-label"></p><div id="gtfs-comparison-resources" class="table-wrap"></div><div class="actions"><button id="gtfs-comparison-files" type="button">Download complete changes</button></div><details><summary>Original descriptor and source comparison</summary><pre id="gtfs-comparison-json"></pre></details></div>'+
'<form id="gtfs-decision"><div class="two"><label>Decision applies to<select id="gtfs-decision-subject"><option value="edition">Displayed edition</option><option value="comparison">Displayed comparison</option></select></label><label>Decision<select id="gtfs-verdict"><option value="accept">Accept</option><option value="reject">Reject</option><option value="defer">Defer</option></select></label><label>Reviewer<input id="gtfs-reviewer" maxlength="128" required></label><label>Review note<input id="gtfs-decision-note" maxlength="4000" required></label></div><button type="submit">Save decision with source identity</button></form><div id="gtfs-decisions" class="stack"></div><nav id="gtfs-decisions-pages" class="pagination"></nav></section>'+
'<section class="panel"><span class="eyebrow">CUSTOMER DELIVERY</span><h2>Original merchant release and whole workspace export</h2><p>Prepare a customer release from the selected native publication below. A complete workspace export carries the source feeds, editions, comparisons, publication history and retained dataset versions.</p>'+
'<form id="gtfs-release"><div class="two"><label>Public merchant origin<input id="gtfs-origin" type="url" placeholder="https://data.example.com" required></label><label>Dataset route path<input id="gtfs-route-path" value="/data" required></label></div><label>Original merchant payment configuration<textarea id="gtfs-payment" rows="4" required placeholder="Paste the payment configuration reviewed for this merchant"></textarea></label><button type="submit">Prepare release from selected published extraction</button></form><div id="gtfs-releases" class="stack"></div><nav id="gtfs-releases-pages" class="pagination"></nav>'+
'<form id="gtfs-stage" hidden><div class="two"><label>Prepared release<select id="gtfs-release-choice"></select></label><label>Original SF82 release ID<input id="gtfs-stage-id" maxlength="128" required></label><label>Release label<input id="gtfs-stage-label" maxlength="128"></label><label>Runtime port<input id="gtfs-stage-port" type="number" min="0" max="65535" value="0"></label></div><button type="submit">Stage in original release store</button></form>'+
'<div class="actions"><button id="gtfs-export" type="button">Export complete workspace</button><span class="muted">Pause a running dataset writer before its complete version store is exported.</span></div><div id="gtfs-exports" class="stack"></div><nav id="gtfs-exports-pages" class="pagination"></nav></section>'+
'<section class="panel" id="gtfs-files-panel" hidden><div class="section-heading"><h2>Retained artifact files</h2><span id="gtfs-manifest-hash" class="mono muted"></span></div><p id="gtfs-files-summary"></p><div id="gtfs-files" class="table-wrap"></div><nav id="gtfs-files-pages" class="pagination"></nav></section>';
document.querySelector('main').prepend(root);
// Static markup only; original feed values enter the DOM through textContent.
document.title='GTFS Schedule merchant workspace';
document.querySelector('header h1').textContent='GTFS Schedule merchant workspace';
document.querySelector('header .muted').textContent='Original feeds, dated service editions and retained merchant publication.';
document.querySelector('footer').textContent='Local GTFS workspace · Original source capture, dataset publisher, versions and seller release lifecycle';
function controls() {
  root.querySelectorAll('button').forEach(control=>{control.disabled=ui.busy;});
  $('gtfs-select').disabled=ui.busy||!ui.edition||Boolean(ui.status?.active||ui.status?.pending);
  $('gtfs-export').disabled=ui.busy||Boolean(ui.status?.active||ui.status?.pending);
  $('gtfs-acquire').disabled=ui.busy||!ui.feedSource||ui.sourceDirty||Boolean(ui.status?.active||ui.status?.pending||ui.feedRequest);
  $('gtfs-source-save').disabled=ui.busy||Boolean(ui.status?.active||ui.status?.pending||ui.feedRequest);
  $('gtfs-acquisition-use').disabled=ui.busy||!ui.acquisition?.feed;
  $('gtfs-acquisition-files').disabled=ui.busy||!ui.acquisition?.historySha256;
  $('gtfs-source-config').querySelectorAll('input,textarea').forEach(control=>{control.disabled=ui.busy||Boolean(ui.feedRequest);});
  $('gtfs-previous-acquisition').disabled=ui.busy;
  const previous=previousAcquisitions.get($('gtfs-previous-acquisition').value);
  $('gtfs-conditional').disabled=ui.busy||!Boolean(previous?.acquisition?.validators?.etag||previous?.acquisition?.validators?.lastModified);
}
function pagination(container,record,select) {
  container.replaceChildren();
  container.append(element('span',(record.total?record.offset+1:0)+'–'+Math.min(record.offset+record.limit,record.total)+' of '+count(record.total)));
  if(record.offset>0)container.append(button('Previous',()=>select(Math.max(0,record.offset-record.limit))));
  if(record.next!==null)container.append(button('Next',()=>select(record.next)));
}
function recordList(key,format,select) {
  const value=ui.status[key],container=$('gtfs-'+key);container.replaceChildren();
  for(const item of value.items)container.append(button(format(item),()=>select(item),{class:'gtfs-record'}));
  if(!value.items.length)container.append(element('p','No saved '+key+' in this page.',{class:'muted'}));
  pagination($('gtfs-'+key+'-pages'),value,async offset=>{ui.offsets[key]=offset;await refresh();});
}
function rememberOption(select,id,title) {
  let existing=[...select.options].find(option=>option.value===id);
  if(!existing){existing=element('option',title,{value:id});select.append(existing);}
  return existing;
}
async function refresh() {
  if(ui.refreshing)return;ui.refreshing=true;
  try {
    const query=new URLSearchParams({limit:'10'});
    for(const[key,value]of Object.entries(ui.offsets))query.set(key+'Offset',String(value));
    ui.status=await api('/api/gtfs/status?'+query);
    $('gtfs-identity').textContent='Workspace '+short(ui.status.id)+' · revision '+ui.status.revision;
    loadFeedRequest();renderFeedRequest();
    const pending=$('gtfs-pending');pending.replaceChildren();pending.hidden=!ui.status.pending;
    if(ui.status.pending) {
      pending.append(element('p','Original operation '+ui.status.pending.kind+' · '+ui.status.pending.requestId));
      if(ui.status.pending.error)pending.append(element('p',ui.status.pending.error.message));
      if(ui.status.pending.kind==='acquireFeed')pending.append(button('Inspect retained source response',()=>chooseAcquisition({id:ui.status.pending.requestId})));
      pending.append(button('Resume original operation',async()=>{
        await api('/api/gtfs/recover',{requestId:ui.status.pending.requestId});message('Original operation recovered.');
      }));
    }
    recordList('feedSources',item=>item.title+' · '+item.versionCount+' source versions · '+short(item.sourceSha256),chooseFeedSource);
    recordList('acquisitions',item=>item.outcome+' · HTTP '+item.httpStatus+' · '+count(item.feedBytes)+' bytes · '+item.createdAt,chooseAcquisition);
    recordList('feeds',item=>item.title+' · '+count(item.feedBytes)+' bytes · '+short(item.feedSha256),chooseFeed);
    recordList('editions',item=>item.title+' · '+item.resourceCount+' resources'+(item.id===ui.status.selectedEditionId?' · selected':''),chooseEdition);
    recordList('comparisons',item=>short(item.beforeId)+' → '+short(item.afterId)+' · '+count(item.changesBytes)+' change bytes',chooseComparison);
    recordList('decisions',item=>item.verdict+' · '+item.reviewer+' · '+item.note,async item=>{await showFiles('decision',item.id);});
    recordList('releases',item=>short(item.snapshot)+' · '+count(item.rowCount)+' rows',item=>showFiles('release',item.id));
    recordList('exports',item=>(item.state==='COMPLETE'?count(item.result.bytes)+' bytes':'Pending export')+' · '+item.createdAt,
      async item=>{if(item.state==='COMPLETE')await showFiles('archive',item.requestId);
        else {await api('/api/gtfs/export',{requestId:item.requestId,expectedRevision:item.revision});await showFiles('archive',item.requestId);}});
    for(const item of ui.status.editions.items) {
      rememberOption($('gtfs-before'),item.id,item.title);rememberOption($('gtfs-after'),item.id,item.title);
    }
    for(const item of ui.status.releases.items)rememberOption($('gtfs-release-choice'),item.id,short(item.snapshot)+' · '+item.id);
    $('gtfs-stage').hidden=!ui.status.capabilities.releaseStore;
    $('gtfs-selected-message').textContent=ui.edition?.record.id===ui.status.selectedEditionId?'Selected for new plans. Earlier saved plans retain their own source.':'';
    controls();
  } finally {ui.refreshing=false;}
}
function isoDate(value) {return /^\d{8}$/.test(value??'')?value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6):'';}
function scheduleControls() {
  const include=$('gtfs-schedule').checked;
  for(const id of ['gtfs-start','gtfs-end','gtfs-agencies','gtfs-route-query','gtfs-route-search','gtfs-route-clear'])$(id).disabled=!include;
  $('gtfs-start').required=include;$('gtfs-end').required=include;
}
async function chooseFeed(item) {
  if(ui.recipeDirty&&ui.feed?.record.id!==item.id&&!window.confirm('Replace the unsaved edition selection with this feed?'))return;
  ui.feed=await api('/api/gtfs/feed?id='+encodeURIComponent(item.id));ui.recipeDirty=false;selectedRoutes.clear();
  const {record,inspection}=ui.feed;
  $('gtfs-source-panel').hidden=false;$('gtfs-source-title').textContent=record.title;
  $('gtfs-source-metrics').replaceChildren(element('span',count(record.feedBytes)+' original bytes'),
    element('span',inspection.members.length+' members'),element('span',inspection.agencies.length+' agencies'));
  const files=$('gtfs-feed-downloads');files.replaceChildren(
    element('a','Download original ZIP',{href:download('feed',record.id,'original.gtfs.zip',record.feedSha256)}),
    button('All retained files',()=>showFiles('feed',record.id)));
  table($('gtfs-members'),['name','bytes','sha256'],inspection.members);
  $('gtfs-original-info').textContent=json({feedInfo:inspection.feedInfo,originalAgencies:inspection.originalAgencies,
    catalog:inspection.catalog,publicationLimits:inspection.publicationLimits,fixedStopSchedule:inspection.fixedStopSchedule});
  $('gtfs-edition-title').value=record.title+' edition';
  const bounds=inspection.feedInfo[0]??{},start=isoDate(bounds.feed_start_date),end=isoDate(bounds.feed_end_date);
  const today=new Date().toISOString().slice(0,10),first=start&&today<start?start:end&&today>end?start||end:today;
  $('gtfs-start').value=first;
  const last=new Date(first+'T12:00:00Z');last.setUTCDate(last.getUTCDate()+6);
  $('gtfs-end').value=end&&last.toISOString().slice(0,10)>end?end:last.toISOString().slice(0,10);
  $('gtfs-schedule').checked=inspection.fixedStopSchedule.available;
  $('gtfs-agencies').replaceChildren(...inspection.agencies.map(item=>element('option',item.name+' · '+item.timezone,{value:item.id})));
  const choices=$('gtfs-tables');choices.replaceChildren();
  inspection.tables.forEach((item,index)=>{
    const label=element('label'),box=element('input');box.type='checkbox';box.value=item.name;
    box.checked=item.publishable&&index<61;box.disabled=!item.publishable;
    label.append(box,element('span',item.name+' · '+count(item.rows)+' rows'+(!item.publishable?' · '+(item.error?.message??'Unsupported publication width'):'')));
    choices.append(label);
  });
  for(const id of ['gtfs-source-url','gtfs-retrieved','gtfs-license-url','gtfs-license-name','gtfs-attribution','gtfs-note'])$(id).value='';
  if(record.acquiredFrom){$('gtfs-source-url').value=record.acquiredFrom.sourceUrl;$('gtfs-retrieved').value=record.acquiredFrom.receivedAt;}
  $('gtfs-selection-detail').textContent=inspection.fixedStopSchedule.available?
    'Scheduled rows use the agency timezone and original service-day rules. Unscheduled frequency windows stay separate.':
    'Original table publication is available. Fixed-stop expansion: '+inspection.fixedStopSchedule.message;
  ui.routeOffset=0;$('gtfs-route-query').value='';renderSelectedRoutes();scheduleControls();
  await searchRoutes();
}
function renderSelectedRoutes() {
  const value=$('gtfs-routes-selected');value.replaceChildren();
  if(!selectedRoutes.size){value.textContent='Every original route is included.';return;}
  value.append(element('span',selectedRoutes.size+' selected: '));
  for(const id of selectedRoutes)value.append(button(id+' ×',async()=>{selectedRoutes.delete(id);ui.recipeDirty=true;renderSelectedRoutes();}));
}
async function searchRoutes() {
  if(!ui.feed)return;
  if(!ui.feed.inspection.tables.some(item=>item.name==='routes.txt')) {
    $('gtfs-route-results').textContent='This source has no original routes.txt table.';$('gtfs-route-pages').replaceChildren();return;
  }
  const query=new URLSearchParams({feedId:ui.feed.record.id,resource:'routes.txt',offset:String(ui.routeOffset),limit:'20',query:$('gtfs-route-query').value});
  const result=await api('/api/gtfs/source-rows?'+query);
  const fields=['route_id','agency_id','route_short_name','route_long_name','route_type'].filter(key=>result.fields.includes(key));
  table($('gtfs-route-results'),fields,result.rows.map(item=>item.values),(cell,row)=>cell.append(button(
    selectedRoutes.has(row.route_id)?'Selected':'Add route',async()=>{selectedRoutes.add(row.route_id);ui.recipeDirty=true;renderSelectedRoutes();await searchRoutes();})));
  pagination($('gtfs-route-pages'),result,async offset=>{ui.routeOffset=offset;await searchRoutes();});
}
function recipe() {
  const include=$('gtfs-schedule').checked;
  return{schema:'stellar-forge.gtfs-selection.v1',title:$('gtfs-edition-title').value,feedSha256:ui.feed.record.feedSha256,
    includeSchedule:include,startDate:include?$('gtfs-start').value:'',endDate:include?$('gtfs-end').value:'',
    agencyIds:include?[...$('gtfs-agencies').selectedOptions].map(item=>item.value):[],routeIds:include?[...selectedRoutes]:[],
    tables:[...$('gtfs-tables input:checked')].map(item=>item.value),
    authority:{sourceUrl:$('gtfs-source-url').value,licenseUrl:$('gtfs-license-url').value,licenseName:$('gtfs-license-name').value,
      attribution:$('gtfs-attribution').value,retrievedAt:$('gtfs-retrieved').value},note:$('gtfs-note').value};
}
async function chooseEdition(item) {
  ui.edition=await api('/api/gtfs/edition?id='+encodeURIComponent(item.id));
  const{record,edition}=ui.edition;
  $('gtfs-edition-panel').hidden=false;$('gtfs-edition-heading').textContent=edition.title;$('gtfs-edition-hash').textContent=short(record.editionSha256);
  table($('gtfs-edition-resources'),['resource','rows','bytes','originalMember'],edition.resources);
  $('gtfs-resource').replaceChildren(...edition.resources.map(item=>element('option',item.resource,{value:item.resource})));
  $('gtfs-edition-json').textContent=json(edition);
  rememberOption($('gtfs-after'),record.id,record.title);$('gtfs-after').value=record.id;
  rememberOption($('gtfs-before'),record.id,record.title);
  ui.rowOffset=0;$('gtfs-row-query').value='';await inspectRows();controls();
}
async function inspectRows() {
  if(!ui.edition)return;
  const query=new URLSearchParams({editionId:ui.edition.record.id,resource:$('gtfs-resource').value,
    offset:String(ui.rowOffset),limit:'25',query:$('gtfs-row-query').value});
  const result=await api('/api/gtfs/rows?'+query);ui.rows=result;
  table($('gtfs-rows'),result.fields,result.rows.map(row=>row.values));
  $('gtfs-row-summary').textContent=count(result.total)+' matching original rows';
  pagination($('gtfs-row-pages'),result,async offset=>{ui.rowOffset=offset;await inspectRows();});
}
async function chooseComparison(item) {
  ui.comparison=await api('/api/gtfs/comparison?id='+encodeURIComponent(item.id));
  const{record,comparison}=ui.comparison;$('gtfs-comparison-panel').hidden=false;
  $('gtfs-comparison-label').textContent=short(record.beforeId)+' → '+short(record.afterId)+' · '+short(record.reportSha256);
  table($('gtfs-comparison-resources'),['resource','beforeRows','afterRows','added','removed','changed','unchanged','comparison'],comparison.resources);
  $('gtfs-comparison-json').textContent=json(comparison.originalCaptureComparison);
  $('gtfs-decision-subject').value='comparison';
}
async function showFiles(kind,id,offset=0) {
  const query=new URLSearchParams({kind,id,offset:String(offset),limit:'50'});
  if(ui.artifact?.kind===kind&&ui.artifact.id===id&&ui.manifest)query.set('expectedManifestSha256',ui.manifest.manifestSha256);
  const result=await api('/api/gtfs/manifest?'+query);ui.artifact={kind,id};ui.manifest=result;ui.manifestOffset=offset;
  $('gtfs-files-panel').hidden=false;$('gtfs-manifest-hash').textContent=short(result.manifestSha256);
  $('gtfs-files-summary').textContent=result.pagination.total+' complete files · '+count(result.totalBytes)+' bytes';
  table($('gtfs-files'),['file','bytes','sha256'],result.files,(cell,file)=>cell.append(element('a','Download',{href:download(kind,id,file.file,file.sha256)})));
  pagination($('gtfs-files-pages'),result.pagination,next=>showFiles(kind,id,next));
  $('gtfs-files-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function applyPublisherDefaults(force=false) {
  const context=native.context();
  if(context.query?.resource) {
    $('source-sql').textContent=json({resource:context.query.resource,projection:context.query.projection,
      originalFeed:ui.edition?.edition.feedSha256,capture:ui.edition?.edition.captureSha256});
    if((force||!context.dirty)&&!context.plan&&ui.edition?.record.id===ui.status?.selectedEditionId) {
      const selected=ui.edition.edition.resources.find(item=>item.resource===context.query.resource);
      if(selected) {
        $('max-rows').value=String(Math.max(1,selected.rows));
        $('max-mib').value=String(Math.max(1,Math.min(256,Math.ceil(selected.bytes/1048576)+1)));
        $('timeout').value='300';
        $('plan-title').value=ui.edition.edition.title+' / '+selected.resource;
        $('dataset-name').value=selected.resource;
      }
    }
  }
}

function sourceRequestKey(){return 'starforge.gtfs.feed-request.'+ui.status.id;}
function loadFeedRequest() {
  if(ui.feedRequestLoaded)return;ui.feedRequestLoaded=true;
  try {
    const raw=sessionStorage.getItem(sourceRequestKey());
    if(!raw)return;
    if(raw.length>20000)throw new Error('source request too large');
    const saved=JSON.parse(raw);
    if(saved.schema!=='stellar-forge.gtfs-browser-source-request.v1'||saved.workspaceId!==ui.status.id||
      !['/api/gtfs/feed-source','/api/gtfs/acquire'].includes(saved.path)||
      !/^[a-f0-9-]{36}$/.test(saved.input?.requestId??'')||!Number.isSafeInteger(saved.input.expectedRevision))
      throw new Error('source request changed');
    ui.feedRequest=saved;
  } catch {try {sessionStorage.removeItem(sourceRequestKey());}catch{}}
}
function saveFeedRequest(value) {
  ui.feedRequest=value;
  try {if(value)sessionStorage.setItem(sourceRequestKey(),JSON.stringify(value));else sessionStorage.removeItem(sourceRequestKey());}
  catch { /* The current view still retains the exact original request. */ }
  renderFeedRequest();controls();
}
function renderFeedRequest() {
  const panel=$('gtfs-source-request');panel.replaceChildren();panel.hidden=!ui.feedRequest;
  if(!ui.feedRequest)return;
  const saved=ui.feedRequest;
  panel.append(element('p',saved.path.endsWith('/acquire')?'Continue the saved feed acquisition to recover its result.':'Continue the saved source edit to recover its result.'),
    button('Continue saved source action',async()=>{
      const result=await sendFeedRequest(saved);await receiveFeedAction(saved.path,result);
    }),element('small','Request '+saved.input.requestId));
}
async function sendFeedRequest(saved) {
  try {
    const result=await api(saved.path,saved.input);saveFeedRequest(null);return result;
  } catch(issue) {
    let original,readIssue;
    try {original=await api('/api/gtfs/operation?'+new URLSearchParams({requestId:saved.input.requestId}));}catch(problem){readIssue=problem;}
    if(original?.state==='COMPLETE'){saveFeedRequest(null);return original.result;}
    if(original?.state==='FAILED') {
      saveFeedRequest(null);
      if(saved.path.endsWith('/acquire'))await chooseAcquisition({id:saved.input.requestId}).catch(()=>{});
    } else if(readIssue?.code==='GTFS_REQUEST_NOT_FOUND'&&
      ['GTFS_REVISION_CHANGED','GTFS_INPUT_INVALID','GTFS_OPERATION_PENDING','GTFS_WORKSPACE_BUSY','GTFS_WORKSPACE_CLOSING'].includes(issue.code))
      saveFeedRequest(null);
    throw issue;
  }
}
async function sourceAction(path,payload) {
  if(ui.feedRequest)throw new Error('Continue the saved source action before starting another.');
  const saved={schema:'stellar-forge.gtfs-browser-source-request.v1',workspaceId:ui.status.id,path,input:request(payload)};
  saveFeedRequest(saved);const result=await sendFeedRequest(saved);await receiveFeedAction(path,result);
}
async function receiveFeedAction(path,result) {
  await refresh();
  if(path.endsWith('/feed-source')) {
    ui.sourceDirty=false;await chooseFeedSource(result.source);
    message('Source version saved. Acquire its complete response when ready.');
  } else {
    await chooseAcquisition(result.acquisition);
    await chooseFeedSource(result.source);
    message(result.acquisition.outcome==='not-modified'?'The agency confirmed the retained feed is unchanged.':
      result.acquisition.outcome==='same-content'?'The complete response matches the retained feed bytes.':
      'The complete source was downloaded and inspected. Use its retained feed to create an edition.');
  }
}
function resetFeedSource() {
  ui.feedSource=null;ui.sourceDirty=false;ui.sourceVersionOffset=0;previousAcquisitions.clear();
  $('gtfs-source-config').reset();$('gtfs-config-timeout').value='120';
  $('gtfs-config-identity').textContent='';$('gtfs-source-save').textContent='Save agency feed source';
  $('gtfs-acquire-controls').hidden=true;$('gtfs-source-versions').replaceChildren();
  $('gtfs-source-version-pages').replaceChildren();$('gtfs-source-version-json').textContent='';controls();
}
async function chooseFeedSource(item) {
  if(ui.sourceDirty&&!window.confirm('Replace the unsaved source edit with this saved version?'))return;
  const selected=await api('/api/gtfs/feed-source?'+new URLSearchParams({id:item.id,limit:'10'}));
  ui.feedSource=selected;ui.sourceDirty=false;ui.sourceVersionOffset=0;previousAcquisitions.clear();
  const source=selected.source;
  $('gtfs-config-title').value=source.title;$('gtfs-config-url').value=source.url;
  $('gtfs-config-timeout').value=String(source.timeoutMs/1000);$('gtfs-config-note').value=source.note;
  $('gtfs-source-save').textContent='Save source version';
  $('gtfs-config-identity').textContent='Source '+short(selected.record.id)+' · '+short(selected.version.sourceSha256);
  $('gtfs-acquire-controls').hidden=false;renderSourceVersions(selected);
  const previous=$('gtfs-previous-acquisition');previous.replaceChildren(element('option','First acquisition / no previous response',{value:''}));
  for(const row of ui.status.acquisitions.items.filter(value=>value.sourceId===selected.record.id))
    rememberOption(previous,row.id,row.createdAt+' · '+row.outcome+' · '+short(row.feedSha256));
  if(selected.record.lastAcquisitionId) {
    const latest=await api('/api/gtfs/acquisition?'+new URLSearchParams({id:selected.record.lastAcquisitionId,limit:'1'}));
    previousAcquisitions.set(latest.record.id,latest);
    if(latest.acquisition.sourceUrl===source.url) {
      rememberOption(previous,latest.record.id,latest.record.createdAt+' · '+latest.record.outcome+' · '+short(latest.record.feedSha256));
      previous.value=latest.record.id;
    }
  }
  await previousSelection();controls();
}
function renderSourceVersions(selected) {
  const container=$('gtfs-source-versions');container.replaceChildren();
  for(const version of selected.versions.items)container.append(button(version.createdAt+' · '+short(version.sourceSha256),async()=>{
    const value=await api('/api/gtfs/feed-source?'+new URLSearchParams({id:selected.record.id,versionId:version.id,limit:'1'}));
    $('gtfs-source-version-json').textContent=json(value.source);
  },{class:'gtfs-record'}));
  pagination($('gtfs-source-version-pages'),selected.versions,async offset=>{
    ui.sourceVersionOffset=offset;
    renderSourceVersions(await api('/api/gtfs/feed-source?'+new URLSearchParams({id:selected.record.id,offset:String(offset),limit:'10'})));
  });
  $('gtfs-source-version-json').textContent=json(selected.source);
}
async function previousSelection() {
  const id=$('gtfs-previous-acquisition').value,conditional=$('gtfs-conditional');
  if(!id){conditional.checked=false;conditional.disabled=true;$('gtfs-previous-summary').textContent='Acquire the complete original ZIP.';return null;}
  let selected=previousAcquisitions.get(id);
  if(!selected){selected=await api('/api/gtfs/acquisition?'+new URLSearchParams({id,limit:'1'}));previousAcquisitions.set(id,selected);}
  if(selected.acquisition.sourceId!==ui.feedSource.record.id||selected.acquisition.sourceUrl!==ui.feedSource.source.url)
    throw new Error('Choose a previous response from the same saved source URL.');
  const validators=selected.acquisition.validators,usable=Boolean(validators.etag||validators.lastModified);
  conditional.disabled=!usable;conditional.checked=usable;
  $('gtfs-previous-summary').textContent=count(selected.record.feedBytes)+' retained bytes · '+selected.record.feedSha256+
    (usable?' · A conditional check is available.':' · This source supplied no usable validator; refresh downloads the complete ZIP.');
  return selected;
}
async function chooseAcquisition(item,offset=0) {
  const result=await api('/api/gtfs/acquisition?'+new URLSearchParams({id:item.id,offset:String(offset),limit:'10'}));
  ui.acquisition=result;ui.attemptOffset=offset;
  $('gtfs-acquisition-panel').hidden=false;
  $('gtfs-acquisition-title').textContent=result.source.title+' / '+(result.record?.outcome??result.requestState.toLowerCase());
  $('gtfs-acquisition-summary').textContent=result.record?
    'HTTP '+result.record.httpStatus+' · '+count(result.record.feedBytes)+' original bytes · '+result.record.feedSha256:
    'Original request '+result.requestId+' · '+result.requestState;
  table($('gtfs-acquisition-attempts'),['Attempt','Started','Outcome','HTTP','URL'],result.attempts.items.map(item=>({
    Attempt:item.request.ordinal,Started:item.request.startedAt,Outcome:item.response?.outcome??'Interrupted',
    HTTP:item.response?.response?.status??'',URL:item.response?.response?.url??result.source.url})));
  pagination($('gtfs-acquisition-attempt-pages'),result.attempts,next=>chooseAcquisition({id:result.requestId},next));
  $('gtfs-acquisition-json').textContent=json(result.acquisition??{source:result.source,binding:result.binding,attempts:result.attempts.items});
  controls();
}
$('gtfs-source-config').addEventListener('input',()=>{ui.sourceDirty=true;controls();});
$('gtfs-source-new').addEventListener('click',()=>run(async()=>{
  if(ui.sourceDirty&&!window.confirm('Clear this unsaved source edit?'))return;resetFeedSource();
}));
$('gtfs-source-config').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  await sourceAction('/api/gtfs/feed-source',{sourceId:ui.feedSource?.record.id??null,
    expectedSourceSha256:ui.feedSource?.record.sourceSha256??null,
    source:{title:$('gtfs-config-title').value,url:$('gtfs-config-url').value,
      timeoutMs:Number($('gtfs-config-timeout').value)*1000,note:$('gtfs-config-note').value}});
});});
$('gtfs-previous-acquisition').addEventListener('change',()=>run(previousSelection));
$('gtfs-acquire').addEventListener('click',()=>run(async()=>{
  if(!ui.feedSource||ui.sourceDirty)throw new Error('Save the selected source configuration first.');
  const id=$('gtfs-previous-acquisition').value;
  let previous=id?previousAcquisitions.get(id):null;
  if(id&&!previous){previous=await api('/api/gtfs/acquisition?'+new URLSearchParams({id,limit:'1'}));previousAcquisitions.set(id,previous);}
  await sourceAction('/api/gtfs/acquire',{sourceId:ui.feedSource.record.id,sourceSha256:ui.feedSource.record.sourceSha256,
    previousAcquisitionId:previous?.record.id??null,expectedPreviousSha256:previous?.record.acquisitionSha256??null,
    conditional:Boolean(previous&&$('gtfs-conditional').checked)});
}));
$('gtfs-source-files').addEventListener('click',()=>run(()=>showFiles('feedSource',ui.feedSource.record.id)));
$('gtfs-acquisition-files').addEventListener('click',()=>run(()=>showFiles('acquisition',ui.acquisition.requestId)));
$('gtfs-acquisition-use').addEventListener('click',()=>run(async()=>{
  if(ui.acquisition?.feed)await chooseFeed(ui.acquisition.feed);
}));

$('gtfs-upload').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const file=$('gtfs-file').files[0];if(!file)throw new Error('Choose the complete original ZIP.');
  if(file.size<1||file.size>16*1024*1024)throw new Error('Choose a complete ZIP no larger than 16 MiB.');
  const content=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),byte=>byte.toString(16).padStart(2,'0')).join('');
  let input={requestId:crypto.randomUUID(),expectedRevision:ui.status.revision,title:$('gtfs-feed-title').value,filename:file.name,feedSha256:hash};
  if(ui.status.pending?.kind==='retainFeed'&&ui.status.pending.payload.feedSha256===hash) {
    const pending=ui.status.pending;input={requestId:pending.requestId,expectedRevision:pending.baseRevision,
      title:pending.payload.title,filename:pending.payload.filename,feedSha256:hash};
  }
  const response=await fetch('/api/gtfs/upload?'+new URLSearchParams(input),{method:'POST',headers:{'content-type':'application/zip'},body:content});
  const result=await response.json();if(!response.ok)throw new Error(result.message??result.error);
  await refresh();await chooseFeed(result.feed);message('Complete original feed retained: '+hash);
});});
$('gtfs-file').addEventListener('change',()=>{if(!$('gtfs-feed-title').value)$('gtfs-feed-title').value=$('gtfs-file').files[0]?.name.replace(/\.zip$/i,'')??'';});
$('gtfs-recipe').addEventListener('input',()=>{ui.recipeDirty=true;});
$('gtfs-schedule').addEventListener('change',scheduleControls);
$('gtfs-route-search').addEventListener('click',()=>run(async()=>{ui.routeOffset=0;await searchRoutes();}));
$('gtfs-route-clear').addEventListener('click',()=>run(async()=>{selectedRoutes.clear();ui.recipeDirty=true;renderSelectedRoutes();await searchRoutes();}));
$('gtfs-recipe').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!ui.feed)throw new Error('Select the retained original feed.');
  const result=await api('/api/gtfs/edition',request({feedId:ui.feed.record.id,recipe:recipe()}));ui.recipeDirty=false;
  await refresh();await chooseEdition(result.edition);message('Complete edition created. Review its resources and select it for new publication plans.');
});});
$('gtfs-select').addEventListener('click',()=>run(async()=>{
  const{record}=ui.edition;
  await api('/api/gtfs/select',request({editionId:record.id,editionSha256:record.editionSha256}));
  await refresh();if(!native.context().dirty)await native.newPlan();await native.refresh();applyPublisherDefaults();
  message('Edition selected. The original dataset publisher now loads these resources for new plans.');
}));
$('gtfs-edition-files').addEventListener('click',()=>run(()=>showFiles('edition',ui.edition.record.id)));
$('gtfs-resource').addEventListener('change',()=>run(async()=>{ui.rowOffset=0;await inspectRows();}));
$('gtfs-row-search').addEventListener('click',()=>run(async()=>{ui.rowOffset=0;await inspectRows();}));
$('gtfs-compare').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const before=await api('/api/gtfs/edition?id='+encodeURIComponent($('gtfs-before').value));
  const after=await api('/api/gtfs/edition?id='+encodeURIComponent($('gtfs-after').value));
  const result=await api('/api/gtfs/compare',request({beforeId:before.record.id,afterId:after.record.id,
    beforeSha256:before.record.editionSha256,afterSha256:after.record.editionSha256}));
  await refresh();await chooseComparison(result.comparison);message('Complete comparison retained with its exact changes file.');
});});
$('gtfs-comparison-files').addEventListener('click',()=>run(()=>showFiles('comparison',ui.comparison.record.id)));
$('gtfs-decision').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const kind=$('gtfs-decision-subject').value,selected=kind==='edition'?ui.edition:ui.comparison;
  if(!selected)throw new Error('Display the original '+kind+' first.');
  const record=selected.record;
  await api('/api/gtfs/decision',request({subject:{kind,id:record.id,sha256:record.editionSha256??record.reportSha256},
    verdict:$('gtfs-verdict').value,reviewer:$('gtfs-reviewer').value,note:$('gtfs-decision-note').value}));
  message('Decision saved against the exact retained source.');
});});
$('gtfs-export').addEventListener('click',()=>run(async()=>{
  const result=await api('/api/gtfs/export',{requestId:crypto.randomUUID(),expectedRevision:ui.status.revision});
  await showFiles('archive',result.requestId);message('Complete workspace export is ready.');
}));
$('gtfs-release').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const selected=native.context().detail?.run;
  if(!selected||selected.state!=='PUBLISHED')throw new Error('Select a published original extraction in the dataset controls.');
  let payment;try{payment=JSON.parse($('gtfs-payment').value);}catch{throw new Error('Enter the original payment configuration as JSON.');}
  const result=await api('/api/gtfs/release-prepare',request({runId:selected.id,payment,origin:$('gtfs-origin').value,path:$('gtfs-route-path').value}));
  await refresh();await showFiles('release',result.release.id);message('Original merchant release prepared from the published dataset and retained feed.');
});});
$('gtfs-stage').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  const id=$('gtfs-release-choice').value,selected=ui.status.releases.items.find(item=>item.id===id);
  if(!selected)throw new Error('Load the page containing the prepared original release.');
  const result=await api('/api/gtfs/release-stage',request({releaseId:id,releaseSha256:selected.releaseSha256,
    id:$('gtfs-stage-id').value,label:$('gtfs-stage-label').value||$('gtfs-stage-id').value,runtime:{port:Number($('gtfs-stage-port').value)}}));
  message('Release staged in the original SF82 store: '+result.original.id);
});});
window.addEventListener('publisher:change',()=>applyPublisherDefaults());
$('query-name').addEventListener('change',()=>applyPublisherDefaults(true));
window.addEventListener('beforeunload',event=>{if(ui.recipeDirty||ui.sourceDirty){event.preventDefault();event.returnValue='';}});
await run(async()=>{
  await refresh();
  if(ui.status.feedSources.items[0])await chooseFeedSource(ui.status.feedSources.items[0]);
  const selected=ui.status.editions.items.find(item=>item.id===ui.status.selectedEditionId)??ui.status.editions.items[0];
  if(selected)await chooseEdition(selected);
  const source=ui.status.feeds.items.find(item=>item.id===ui.edition?.record.feedId)??ui.status.feeds.items[0];
  if(source)await chooseFeed(source);
  applyPublisherDefaults();
});
setInterval(()=>{if(!ui.busy)refresh().catch(issue=>message(issue.message));},5000);
