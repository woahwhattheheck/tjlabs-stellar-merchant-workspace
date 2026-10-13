// MIT. Bloccpay operator interface. Provider credentials stay on the host.
import { canonical, verifyRequest, prepareRequest, initializeJournal, listRequests, getRequest, beginAttempt, finishAttempt, rebaseRequest, markApplied, saveView, fileHash } from './journal.mjs';
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const text=value=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
const pretty=value=>JSON.stringify(value,null,2);
const esc=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=value=>typeof value==='string'&&value.length>25?value.slice(0,12)+'…'+value.slice(-8):text(value);
const titles={programmes:'Programmes',payrolls:'Payroll ledgers',instructions:'Payment instructions',collections:'Scheduled collections',runs:'Collection runs',overview:'Overview',trade:'Prepare operation',operations:'Operations',resources:'Provider resources',captures:'Source captures',sources:'Source files',webhooks:'Webhooks',corrections:'Corrections',reconciliations:'Reconciliation',reports:'Reports',transfer:'Export & receive',recovery:'Request recovery',settings:'Workspace settings'};
const descriptions={programmes:'Immutable programme versions, exact mappings and selected connections.',payrolls:'Complete imported ledgers and every normalized payment row.',instructions:'Instruction files bound to their payroll and exact provider versions.',collections:'Explicitly enabled read-only monitoring with complete task selections.',runs:'Frozen collection runs, captured pages and reconciliation editions.',operations:'Every prepared request, provider attempt and readback.',resources:'Latest selected resource observations and their immutable versions.',captures:'Complete paged source acquisition, with saved cursors and coverage.',sources:'Full retained exchanges and imported source files.',webhooks:'Signature verification and retained provider event history.',corrections:'Append-only notes and explicit reconciliation decisions.',reconciliations:'Frozen editions with exact source and version selections.',reports:'Complete JSON, CSV and HTML report members.'};
const tables=new Set(Object.keys(descriptions));
let token=sessionStorage.getItem('bloccpay.operator.token')??'',bootstrap=null,workspaceId=null,view={},page='overview',rows=[],cursor=null,listGeneration=0,detailGeneration=0,navigationGeneration=0,selected=null,requests=[],pendingCount=0,busyCount=0,refreshPromise=null,previewUrl=null,mutationTail=Promise.resolve(),pollTimer=null,exportCursor=null,exportRows=[];
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('token')){token=fragment.get('token');sessionStorage.setItem('bloccpay.operator.token',token);history.replaceState(null,'',location.pathname+location.search);}
function fail(code,message,details){return Object.assign(new Error(message),{code,details});}
function notice(message,kind='info'){$('#notice').hidden=!message;$('#notice').textContent=message;$('#notice').dataset.kind=kind;}
function busy(label){busyCount++;$('#busy').hidden=false;$('#busy').textContent=label??'Working…';return()=>{busyCount=Math.max(0,busyCount-1);$('#busy').hidden=busyCount===0;};}
function report(error){notice((error.code?error.code+': ':'')+(error.message??String(error)),'error');}
function handle(task){return Promise.resolve().then(task).catch(report);}
function button(label,callback,style='secondary'){const b=document.createElement('button');b.type='button';b.className=style;b.textContent=label;b.addEventListener('click',()=>handle(callback));return b;}
function badge(value){const span=document.createElement('span');span.className='badge';span.dataset.state=text(value);span.textContent=text(value);return span;}
function jsonDetails(label,value,open=false){const d=document.createElement('details');d.open=open;const s=document.createElement('summary');s.textContent=label;const p=document.createElement('pre');p.textContent=pretty(value);d.append(s,p);return d;}
function definitions(values){const dl=document.createElement('dl');for(const [label,value]of Object.entries(values)){if(value===undefined)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=text(value);dl.append(dt,dd);}return dl;}
function parse(textValue,label='JSON'){try{const value=JSON.parse(textValue||'{}');canonical(value);return value;}catch(error){throw fail('INPUT_JSON_INVALID',label+': '+error.message);}}
function objectInput(value,label){const result=parse(value,label);if(!result||Array.isArray(result)||typeof result!=='object')throw fail('INPUT_OBJECT_REQUIRED',label+' must be a JSON object.');return result;}
function formObject(form){return Object.fromEntries(new FormData(form).entries());}
function nativeDate(value){return value?new Date(value+'Z').toISOString():undefined;}
function ids(value){return value.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);}
function actionId(action){return action.id??action.action;}
function catalogue(){return bootstrap?.catalogue??[];}
function currentAction(){return catalogue().find(action=>actionId(action)===$('#action-select').value);}
function isMutation(action){return action?.mutation===true;}
function connection(alias){return bootstrap.connections.find(row=>row.alias===alias);}
async function api(path,{method='GET',body,headers={},raw=false}={}){
 if(!token)throw fail('OPERATOR_TOKEN_REQUIRED','Open the workspace with its operator token.');
 const options={method,headers:{Authorization:'Bearer '+token,...headers},cache:'no-store'};
 if(method!=='GET'){if(!workspaceId)throw fail('WORKSPACE_REQUIRED','Open the selected workspace first.');options.headers['X-Bloccpay-Workspace-ID']=workspaceId;}
 if(body!==undefined){if(raw)options.body=body;else{options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}}
 let response;try{response=await fetch(path,options);}catch(error){throw Object.assign(fail('TRANSPORT_UNCERTAIN','The host response was not received. The exact request remains in this browser.'),{cause:error});}
 if(!response.ok){let payload;try{payload=await response.json();}catch{payload={};}const source=payload.error??payload;const error=fail(source.code??'HTTP_'+response.status,source.message??'The host could not complete this request.',source.details);error.status=response.status;if(response.status===401){$('#access-screen').hidden=false;$('#shell').inert=true;}throw error;}
 return response;
}
async function readJSON(path){return(await api(path)).json();}
async function fetchItem(table,id){return readJSON('/api/item?'+new URLSearchParams({table,id}));}
async function fetchList(table,options={}){const query=new URLSearchParams({table,limit:'100'});for(const[k,v]of Object.entries(options))if(v!==null&&v!==undefined&&v!=='')query.set(k,String(v));return readJSON('/api/list?'+query);}
async function refreshBootstrap(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{const value=await readJSON('/api/bootstrap');if(workspaceId&&value.workspace.id!==workspaceId)throw fail('WORKSPACE_CHANGED','The host now serves a different workspace. Reload to select it; this workspace’s retained requests will not be sent there.');
 bootstrap=value;workspaceId=value.workspace.id;$('#workspace-name').textContent=value.workspace.name;$('#workspace-identity').textContent=workspaceId;$('#connection-status').textContent='Revision '+value.workspace.revision;
 $('#dispatch-indicator').textContent=value.workspace.dispatchEnabled?'Dispatch enabled':'Dispatch disabled';
 for(const node of $$('[data-count]'))node.textContent=String(value.summary[node.dataset.count]??0);
 if(document.activeElement!==$('#profile-form [name=name]')&&!$('#profile-form').dataset.dirty)$('#profile-form [name=name]').value=value.workspace.name;
 if(!$('#dispatch-form').dataset.dirty)$('#dispatch-form [name=enabled]').checked=value.workspace.dispatchEnabled;
 renderConnections();renderOverview();renderWorker();fillSelects();$('#programme-contract').textContent=pretty(value.methods?.find(m=>m.name==='programme.save')??{});return value;})().finally(()=>{refreshPromise=null;});return refreshPromise;
}
function fillSelect(select,items,first=null){
 const prior=select.value;select.replaceChildren();if(first){const option=document.createElement('option');option.value='';option.textContent=first;select.append(option);}
 for(const item of items){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;select.append(option);}
 if([...select.options].some(option=>option.value===prior))select.value=prior;
}
function fillSelects(){
 const connections=bootstrap.connections.map(row=>({value:row.alias,label:row.alias+' · '+row.environment+(row.organizationId?' · '+short(row.organizationId):'')}));
 for(const select of $$('.connection-select'))fillSelect(select,connections);
 fillSelect($('#action-connection'),connections);fillSelect($('#filter-connection'),connections,'All connections');
 const actions=catalogue().map(action=>({value:actionId(action),label:(action.label??actionId(action))+' · '+actionId(action)}));
 fillSelect($('#action-select'),actions);for(const select of $$('.catalogue-select'))fillSelect(select,actions);
}
function renderConnections(){
 for(const target of [$('#overview-connections'),$('#settings-connections')]){
 target.replaceChildren();if(!bootstrap.connections.length){target.innerHTML='<p class="muted">No provider connection is configured. Full source, reports and receiving remain available.</p>';continue;}
 for(const row of bootstrap.connections){const box=document.createElement('div');box.append(definitions({Connection:row.alias,Environment:row.environment,Organization:row.organizationId,Network:row.network,Endpoint:row.baseUrl}));target.append(box);}
 }
}
function renderWorker(){
 const target=$('#collection-worker-status'),worker=bootstrap?.operator?.collections;
 target.replaceChildren();const message=document.createElement('p');message.className='muted';
 message.textContent=worker?.active===true?'The host collection worker is running. It schedules only collections you explicitly enable.':worker?.enabled===true?'The host is configured for scheduled collections, but the worker is not active. Review its retained error before relying on scheduled runs.':worker?.enabled===false?'The host collection worker is disabled. You can run a saved collection explicitly; scheduled runs require the host configuration to enable the worker.':'The host has not reported its scheduled worker configuration. Review the host configuration before relying on scheduled runs.';
 target.append(message);if(worker)target.append(definitions({'Worker selected':worker.selected,'Worker active':worker.active,'Worker poll seconds':worker.pollSeconds,'Maximum pages per pass':worker.maxPages}));
 if(worker?.error)target.append(jsonDetails('Retained worker error',worker.error,true));
}
function renderOverview(){
 $('#overview-metrics').replaceChildren();for(const [label,key]of [['Payroll ledgers','payrolls'],['Payment instructions','instructions'],['Collection runs','runs'],['Report editions','reports']]){const metric=document.createElement('div');metric.className='metric';metric.innerHTML='<span>'+esc(label)+'</span><strong>'+esc(bootstrap.summary[key]??0)+'</strong>';$('#overview-metrics').append(metric);}
 $('#received-notice').replaceChildren();if(bootstrap.workspace.receivedFrom)$('#received-notice').append(jsonDetails('Received workspace provenance',bootstrap.workspace.receivedFrom));
}
async function remember(){await saveView(workspaceId,view);}
async function navigate(next,{keepSelection=false}={}){
 const generation=++navigationGeneration;detailGeneration++;if(!titles[next])next='overview';page=next;view.page=next;$('#page-title').textContent=titles[next];
 for(const b of $$('#navigation [data-view]'))b.setAttribute('aria-current',b.dataset.view===next?'page':'false');
 for(const panel of $$('[data-panel]'))panel.hidden=true;
 if(tables.has(next)){
 const recordPanel=$('[data-panel=records]');recordPanel.hidden=false;
 if(next==='sources'){$('[data-panel=sources]').hidden=false;$('#sources-record-mount').append(recordPanel);}else{$('[data-panel=trade]').after(recordPanel);}
 if(next==='corrections')$('[data-panel=correction-editor]').hidden=false;
 if(next==='reconciliations')$('[data-panel=reconciliation-editor]').hidden=false;
 for(const [table,panel]of Object.entries({programmes:'programme-editor',payrolls:'payroll-editor',instructions:'instruction-editor',collections:'collection-editor'}))if(next===table)$('[data-panel='+panel+']').hidden=false;
 await loadRecords(false);if(generation!==navigationGeneration)return;if(!keepSelection)$('#record-detail').hidden=true;
 }else{$('[data-panel="'+next+'"]').hidden=false;if(next==='trade')renderAction();if(next==='recovery')await renderRecovery();if(next==='transfer'){renderTransfer();await loadExports(false);}}
 await remember();
}
async function loadRecords(more=false){
 const generation=++listGeneration,table=page;if(!tables.has(table))return;
 const filters=formObject($('#record-filter'));
 if(table==='operations'){filters.state=filters.status;delete filters.status;}
 if(table!=='resources'&&table!=='sources')delete filters.kind;
 const result=await fetchList(table,{...filters,cursor:more?cursor:null});
 if(generation!==listGeneration||table!==page)return;
 rows=more?[...rows,...result.rows]:result.rows;cursor=result.nextCursor;$('#records-title').textContent=titles[table];$('#records-description').textContent=descriptions[table];$('#records-more').hidden=!cursor;$('#record-page-label').textContent=rows.length+' retained rows loaded'+(cursor?' · more available':'');renderRows();updateOptions(table,rows);
}
function updateOptions(table,items){
 const mapping={resources:'resource-options',resourceVersions:'version-options',sources:'source-options',programmes:'programme-options',payrolls:'payroll-options',instructions:'instruction-options'},id=mapping[table];if(!id)return;
 const target=$('#'+id),known=new Map([...target.options].map(o=>[o.value,o.textContent]));
 for(const row of items)known.set(row.id,(row.name??row.kind??row.action??'')+' '+(row.version??row.resourceId??row.id));
 target.replaceChildren(...[...known].map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));
 if(table==='resources')updateOptions('resourceVersions',items.filter(x=>x.currentVersionId).map(x=>({id:x.currentVersionId,kind:x.kind,resourceId:x.resourceId})));
}
function renderRows(){
 const host=$('#record-table');host.replaceChildren();if(!rows.length){host.innerHTML='<p class="empty">No records match this selection.</p>';return;}
 const table=document.createElement('table');const head=document.createElement('thead');head.innerHTML='<tr><th>Record</th><th>State / kind</th><th>Connection</th><th>Observed / created</th><th>Selection</th></tr>';const body=document.createElement('tbody');
 for(const row of rows){const tr=document.createElement('tr');if(selected?.id===row.id&&selected.table===page)tr.className='selected';
 const name=document.createElement('td');name.append(button(row.name??row.definition?.name??row.action??row.eventType??row.kind??(page==='payrolls'?'Payroll ledger':page==='instructions'?'Payment instructions':page==='runs'?'Collection run':short(row.id)),()=>selectRecord(page,row.id),'text-button'));const identifier=document.createElement('small');identifier.className='mono';identifier.textContent=row.id;name.append(identifier);
 const state=document.createElement('td');state.append(badge(row.conflict?'CONFLICT':page==='collections'?(row.enabled?'ENABLED':'DISABLED'):page==='programmes'?'VERSION '+row.version:page==='payrolls'?'IMPORTED':page==='instructions'?'PREPARED':row.state??row.status??row.action??row.kind??'RETAINED'));
 const conn=document.createElement('td');conn.textContent=[row.connectionAlias,row.environment].filter(Boolean).join(' · ')||'Workspace';
 const time=document.createElement('td');time.textContent=row.observedAt??row.createdAt??row.updatedAt??'—';
 const summary=document.createElement('td');summary.textContent=page==='payrolls'?(row.data?.rows?.length??0)+' payroll rows':page==='instructions'?(row.rowIds?.length??0)+' instruction rows':page==='collections'?(row.tasks?.length??0)+' tasks · every '+row.intervalSeconds+' seconds':page==='programmes'?[row.definition?.period?.start,row.definition?.period?.end].filter(Boolean).join(' → '):row.resourceId??(row.pages?row.pages.length+' pages':row.sourceIds?row.sourceIds.length+' sources':row.files?row.files.length+' files':row.bodyComplete===false?'Incomplete body':'');
 tr.append(name,state,conn,time,summary);body.append(tr);}
 table.append(head,body);host.append(table);
}
async function selectRecord(table,id){
 const generation=++detailGeneration;const row=await fetchItem(table,id);if(generation!==detailGeneration||page!==table)return;selected={table,id,row};view.selected={table,id};$('#record-detail').hidden=false;$('#detail-type').textContent=table;$('#detail-title').textContent=row.name??row.definition?.name??row.action??row.eventType??row.kind??short(id);
 $('#detail-summary').replaceChildren(definitions({ID:row.id,State:row.state??row.status,Connection:row.connectionAlias,Environment:row.environment,Resource:row.resourceId,Created:row.createdAt,Updated:row.updatedAt}));
 $('#detail-actions').replaceChildren();$('#detail-content').replaceChildren();await renderDetail(table,row);renderRows();await remember();$('#record-detail').scrollIntoView({behavior:'smooth',block:'start'});
}


function addAction(label,callback,style){$('#detail-actions').append(button(label,callback,style));}
function appendContent(node){$('#detail-content').append(node);}
async function renderDetail(table,row){
 if(['programmes','payrolls','instructions','collections','runs'].includes(table)){await renderPayrollDetail(table,row);return;}
 if(table==='operations'){
 const action=catalogue().find(item=>actionId(item)===row.action);
 appendContent(jsonDetails('Prepared request · '+(isMutation(action)?'provider mutation':'read-only'),row.request,true));appendContent(jsonDetails('Selected evidence',row.evidence??{}));
 if(row.state==='PREPARED'){if(isMutation(action)&&!bootstrap.workspace.dispatchEnabled){const p=document.createElement('p');p.textContent='Economic dispatch is disabled for this workspace. Review the selected connection in Workspace settings before enabling it.';appendContent(p);addAction('Open dispatch settings',()=>navigate('settings'));}else addAction(isMutation(action)?'Dispatch reviewed operation':'Run prepared read',()=>command('operation.dispatch',{operationId:row.id}),isMutation(action)?'':'secondary');}
 if(row.state!=='PREPARED'&&row.state!=='CANCELED'&&row.readback)addAction('Read provider outcome',()=>command('operation.reconcile',{operationId:row.id}));
 
 if(row.state==='PREPARED')addAction('Cancel preparation',async()=>{const reason=prompt('Reason for canceling this prepared operation');if(reason?.trim())await command('operation.cancel',{operationId:row.id,reason:reason.trim()});});
 if(['DISPATCHING','UNCERTAIN'].includes(row.state)){const p=document.createElement('p');p.textContent='The provider outcome is unresolved. Read the existing resource and inspect retained attempts before preparing any new economic operation.';appendContent(p);}
 if(row.readback)appendContent(jsonDetails('Provider readback',row.readback,true));
 if(row.retry?.sameRequestSafe&&bootstrap.methods.some(method=>method.name==='operation.retry-original')){appendContent(definitions({'Retry permitted by provider':row.retry.reason,'Retry after':row.retryAfter,'Original first attempt':row.firstAttemptAt}));addAction('Retry the same original request',()=>command('operation.retry-original',{operationId:row.id}));const retryNote=document.createElement('p');retryNote.textContent='This explicit retry retains the original provider body and idempotency key. The host enforces the provider delay and original 24-hour window.';appendContent(retryNote);}
 appendRelatedReads(row.relatedReads??row.readback?.relatedReads,row.connectionAlias);
 appendContent(jsonDetails('Full operation record',row));
 await linkedRows('attempts',row.attemptIds??[],'Provider attempts');await linkedRows('sources',row.sourceIds??[],'Retained source files');
 }else if(table==='resources'){
 const currentVersion=row.currentVersionId?await fetchItem('resourceVersions',row.currentVersionId):null;if(selected?.table!=='resources'||selected.id!==row.id)return;
 appendContent(renderData(row.projection,String(row.kind).includes('account')?'Account balances and trustlines':'Selected provider resource'));appendRelatedReads(row.relatedReads??row.projection?.relatedReads,row.connectionAlias);
 addAction('Read current provider resource',()=>prepareReadback(row,currentVersion));
 if(row.currentVersionId)addAction('Select version for reconciliation',()=>selectReconciliation('versionIds',row.currentVersionId));
 addAction('Record correction',()=>editCorrection({resourceId:row.id}));
 await renderVersions(row);
 }else if(table==='captures'){
 appendContent(definitions({Action:row.action,Pages:row.pages?.length??0,Status:row.status,Next:row.next,PendingOperation:row.pendingOperationId}));
 appendContent(jsonDetails('Frozen input and retained cursor',{input:row.input,next:row.next,pages:row.pages},true));
 if(row.status!=='COMPLETE')addAction('Continue collection',()=>command('capture.run',{captureId:row.id,maxPages:100}));
 if(!['PAUSED','COMPLETE'].includes(row.status))addAction('Pause collection',()=>command('capture.pause',{captureId:row.id}));
 if(row.pendingOperationId)addAction('Inspect pending operation',async()=>{await navigate('operations');await selectRecord('operations',row.pendingOperationId);});
 appendContent(jsonDetails('Full collection record',row));
 }else if(table==='sources'){
 appendContent(definitions({Kind:row.kind,Action:row.action,Bytes:row.bytes,'Body SHA-256':row.bodySha256,'Complete body':row.bodyComplete,'Private raw body':row.privateBody,'Projection error':row.projectionError}));
 if(row.downloadableFileId)addAction('Download complete statement',()=>download('/api/file/'+encodeURIComponent(row.downloadableFileId),row.downloadFileName??row.downloadFilename??row.filename??('statement-'+row.id+(String(row.kind).endsWith('.pdf')?'.pdf':'.csv'))));
 if(row.publicFileId)addAction('Download public source',()=>download('/api/file/'+encodeURIComponent(row.publicFileId),'source-'+row.id+'.json'));
 if(row.receiptFileId)addAction('Project retained response',()=>command('source.project',{sourceId:row.id}));
 addAction('Use as named source evidence',()=>selectNamedEvidence('sourceIds',row.id,row.connectionAlias));
 addAction('Record correction',()=>editCorrection({sourceId:row.id}));
 appendContent(jsonDetails('Source record',row,true));await linkedRows('resourceVersions',row.versionIds??[],'Projected versions');
 }else if(table==='webhooks'){
 appendContent(definitions({Signature:row.verified?'Verified':'Not verified',Event:row.eventType,'Raw SHA-256':row.rawSha256,'Canonical SHA-256':row.canonicalSha256,Status:row.status,Error:row.error}));
 addAction('Reconcile retained webhook',()=>command('webhook.reconcile',{webhookId:row.id}));
 if(row.sourceId)addAction('Inspect projected source',async()=>{await navigate('sources');await selectRecord('sources',row.sourceId);});
 appendContent(jsonDetails('Webhook verification and source record',row,true));
 }else if(table==='corrections'){
 appendContent(renderData(row,'Retained correction'));addAction('Supersede with new correction',()=>editCorrection({programmeVersionId:row.programmeVersionId,payrollId:row.payrollId,payrollRowId:row.payrollRowId,resourceId:row.resourceId,versionId:row.versionId,sourceId:row.sourceId,supersedes:row.id,actor:row.actor}));
 }else if(table==='reconciliations'){
 appendContent(renderData(row.data,'Payroll reconciliation'));appendContent(jsonDetails('Pinned source and version selection',{sourceIds:row.sourceIds,versionIds:row.versionIds,correctionIds:row.correctionIds}));
 const form=document.createElement('form');form.id='report-form';form.innerHTML='<h3>Create report from this edition</h3><label>Report name<input name="name" value="'+esc(row.name??'Payroll reconciliation report')+'"></label><button type="submit">Create full JSON, CSV and HTML report</button>';
 form.addEventListener('submit',event=>{event.preventDefault();handle(()=>command('report.create',{reconciliationId:row.id,name:form.elements.name.value}));});appendContent(form);
 }else if(table==='reports'){
 appendContent(definitions({Edition:row.reconciliationId,Created:row.createdAt}));appendContent(fileList(row.files??[]));appendContent(jsonDetails('Report scope',row.scope));
 const form=document.createElement('form');form.id='report-export-form';form.innerHTML='<h3>Export this report</h3><label>Destination directory<input name="destination" required placeholder="/private/deliveries/bloccpay-report"></label><button type="submit">Create complete report delivery</button>';
 form.addEventListener('submit',event=>{event.preventDefault();handle(()=>command('report.export',{reportId:row.id,destination:form.elements.destination.value}));});appendContent(form);
 }else appendContent(jsonDetails('Full record',row,true));
}
async function linkedRows(table,identities,title){
 if(!identities.length)return;const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title+' · '+identities.length;details.append(summary);appendContent(details);
 for(const id of identities){const wrapper=document.createElement('div');wrapper.className='file-row';wrapper.append(button(short(id),async()=>{const value=await fetchItem(table,id);const display=jsonDetails('Full '+table+' record',value,true);wrapper.append(display);if(table==='sources'&&value.publicFileId)wrapper.append(button('Download source',()=>download('/api/file/'+encodeURIComponent(value.publicFileId),'source-'+id+'.json')));},'text-button'));details.append(wrapper);}
}
async function renderVersions(resource){
 let next=null,loaded=0;const holder=document.createElement('div');holder.innerHTML='<h3>Retained versions</h3>';appendContent(holder);
 const list=document.createElement('div'),more=button('Load next versions',()=>loadMore());holder.append(list,more);
 async function loadMore(){const pageResult=await fetchList('resourceVersions',{resourceId:resource.resourceId,connectionAlias:resource.connectionAlias,environment:resource.environment,cursor:next});next=pageResult.nextCursor;if(selected?.table!=='resources'||selected.id!==resource.id)return;
 for(const version of pageResult.rows){if(version.localResourceId!==resource.id)continue;loaded++;if(version.id===resource.currentVersionId)appendRelatedReads(version.relatedReads??version.value?.relatedReads,version.connectionAlias);const d=jsonDetails(version.id===resource.currentVersionId?'Current version · '+short(version.id):'Version · '+short(version.id),version);const actions=document.createElement('div');actions.className='button-row';
 actions.append(button('Use exact version',()=>selectEvidence(version)),button('Select for reconciliation',async()=>{const field=$('#reconciliation-form [name=versionIds]');field.value=[...new Set([...ids(field.value),version.id])].join('\n');await navigate('reconciliations');}),button('Record correction',()=>editCorrection({resourceId:resource.id,versionId:version.id})));d.append(actions);list.append(d);updateOptions('resourceVersions',[version]);}
 more.hidden=!next;if(!loaded&&!next)list.innerHTML='<p class="empty">No versions in this selection.</p>';
 }
 await loadMore();
}
async function selectEvidence(version){
 await selectNamedEvidence('versionIds',version.id,version.connectionAlias,version.kind??'resource');
}
async function selectNamedEvidence(field,id,alias,suggested='source'){
 const name=prompt('Evidence name from the selected action contract',suggested);if(!name?.trim())return;
 const input=$('#operation-form [name='+field+']'),value=objectInput(input.value,field);value[name.trim()]=id;input.value=pretty(value);
 if(alias)$('#action-connection').value=alias;await navigate('trade');notice('Selected exact retained evidence. Review its programme, environment and complete request before preparation.');
}
function appendRelatedReads(reads,alias){
 if(!Array.isArray(reads)||!reads.length)return;
 const selected=reads.filter(read=>catalogue().some(action=>actionId(action)===(read.action??read.id)&&!action.mutation));
 if(!selected.length)return;const holder=document.createElement('section');holder.innerHTML='<h3>Read linked chain records</h3>';const actions=document.createElement('div');actions.className='button-row';
 for(const read of selected)actions.append(button(read.label??(read.field?read.action+' · '+read.field:read.action??read.id),()=>selectNativeAction(read.action??read.id,read.input??{},alias)));holder.append(actions);appendContent(holder);
}

function parameterInput(id,resourceId){
 const entry=catalogue().find(x=>actionId(x)===id),params={};for(const raw of entry?.inputSchema?.parameters??[]){const parameter=resolveSchema(raw,entry);if(parameter.in==='path')params[parameter.name]=resourceId;}return params;
}
async function prepareReadback(resource,currentVersion){
 const observed=resource.relatedReads??resource.projection?.relatedReads??currentVersion?.relatedReads??[];
 const selectedRead=observed.find(read=>catalogue().some(entry=>actionId(entry)===read.action&&!isMutation(entry)));
 if(selectedRead){await selectNativeAction(selectedRead.action,selectedRead.input??{},resource.connectionAlias);return;}
 await navigate('trade');notice('Select the matching provider read action and retain its exact resource ID: '+resource.resourceId+'. No request has been dispatched.');
}
async function editCorrection(values){$('#correction-form').reset();for(const[k,v]of Object.entries(values))if(v!==undefined&&$('#correction-form').elements[k])$('#correction-form').elements[k].value=v;await navigate('corrections');$('#correction-form').scrollIntoView({behavior:'smooth'});}
function renderData(value,title){
 const section=document.createElement('section');if(title){const heading=document.createElement('h3');heading.textContent=title;section.append(heading);}
 if(Array.isArray(value)){renderArray(section,value);return section;}
 if(value&&typeof value==='object'){const simple={},complex=[];for(const[k,v]of Object.entries(value)){if(v===null||typeof v!=='object')simple[k]=v;else complex.push([k,v]);}if(Object.keys(simple).length)section.append(definitions(simple));
 for(const[k,v]of complex){const d=document.createElement('details');d.open=Array.isArray(v)&&v.length>0&&v.length<12;const s=document.createElement('summary');s.textContent=k+(Array.isArray(v)?' · '+v.length:'');d.append(s,renderData(v));section.append(d);}return section;}
 section.textContent=text(value);return section;
}
function renderArray(holder,values){
 if(!values.length){holder.innerHTML='<p class="empty">No retained rows.</p>';return;}
 if(values.every(v=>v&&typeof v==='object'&&!Array.isArray(v))){
 const keys=[...new Set(values.flatMap(v=>Object.keys(v)))];const wrap=document.createElement('div');wrap.className='table-scroll';const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');head.innerHTML='<tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr>';table.append(head,body);wrap.append(table);holder.append(wrap);let offset=0;
 const more=button('Show more retained rows',()=>add());holder.append(more);function add(){for(const row of values.slice(offset,offset+100)){const tr=document.createElement('tr');for(const key of keys){const td=document.createElement('td');td.textContent=text(row[key]);tr.append(td);}body.append(tr);}offset+=100;more.hidden=offset>=values.length;}add();
 }else{const pre=document.createElement('pre');pre.textContent=pretty(values);holder.append(pre);}
}
function fileList(files){
 const holder=document.createElement('div');holder.className='file-list';for(const file of files){const row=document.createElement('div');row.className='file-row';const detail=document.createElement('div');detail.textContent=file.filename??file.id;const small=document.createElement('small');small.textContent=(file.bytes??0)+' bytes · '+(file.sha256??'');detail.append(small);const actions=document.createElement('div');actions.className='button-row';const url=file.private===true?null:file.url??'/api/file/'+encodeURIComponent(file.id);if(url)actions.append(button('Download',()=>download(url,file.filename??file.id)));if(url&&(file.contentType?.includes('text/html')||file.filename?.endsWith('.html')))actions.append(button('Preview',()=>preview(url,file.filename)));row.append(detail,actions);holder.append(row);}return holder;
}
async function download(path,filename){
 const done=busy('Downloading complete file…');try{if(globalThis.showSaveFilePicker){let output;try{const handle=await showSaveFilePicker({suggestedName:filename});const response=await api(path);output=await handle.createWritable();await response.body.pipeTo(output);}catch(error){if(error.name==='AbortError')return;try{await output?.abort();}catch{}throw error;}}
 else{const response=await api(path);saveBlob(await response.blob(),filename);}}finally{done();}
}
function saveBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function downloadText(value,filename){saveBlob(new Blob([value],{type:'text/plain'}),filename);}
async function preview(url,title){const response=await api(url);if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(await response.blob());$('#report-preview').src=previewUrl;$('#preview-title').textContent=title;$('#preview-dialog').showModal();}
function resolveSchema(value,entry,seen=new Set()){
 if(!value||typeof value!=='object')return value;
 if(value.$ref?.startsWith('#/')){if(seen.has(value.$ref))return {};seen.add(value.$ref);let target=entry.spec??{components:entry.inputSchema?.components};for(const key of value.$ref.slice(2).split('/'))target=target?.[key.replace(/~1/g,'/').replace(/~0/g,'~')];return resolveSchema(target??{},entry,seen);}
 if(value.allOf){const result={...value,properties:{...(value.properties??{})},required:[...(value.required??[])]};delete result.allOf;for(const part of value.allOf){const resolved=resolveSchema(part,entry,new Set(seen));Object.assign(result.properties,resolved.properties??{});result.required.push(...resolved.required??[]);if(!result.type&&resolved.type)result.type=resolved.type;}return result;}return value;
}
function inputSchemas(entry){
 const schemas={params:{type:'object',properties:{},required:[]},query:{type:'object',properties:{},required:[]},body:{}};
 for(const raw of entry?.inputSchema?.parameters??[]){const parameter=resolveSchema(raw,entry);const section=parameter.in==='path'?'params':parameter.in==='query'?'query':null;if(section){schemas[section].properties[parameter.name]={...resolveSchema(parameter.schema??{},entry),description:parameter.description??parameter.schema?.description};if(parameter.required)schemas[section].required.push(parameter.name);}}
 const request=resolveSchema(entry?.inputSchema?.requestBody??{},entry);const media=request.content?.['application/json']??Object.values(request.content??{})[0];schemas.body=resolveSchema(media?.schema??{},entry);return schemas;
}
function renderAction(){
 const entry=currentAction();$('#action-description').textContent=entry?.description??entry?.spec?.info?.description??entry?.label??'Select a native action.';
 $('#action-class').textContent=entry?(isMutation(entry)?'Provider mutation':'Read-only'):'No action';$('#action-contract').textContent=pretty(entry??{});$('#start-capture').disabled=!entry||isMutation(entry);$('#start-capture').textContent=entry?.pagination?'Collect all pages':'Capture complete read';
 const holder=$('#action-guided-fields');holder.replaceChildren();if(!entry)return;const schemas=inputSchemas(entry);
 for(const section of ['params','query','body']){
 const schema=resolveSchema(schemas[section],entry);if(!schema.properties)continue;const fieldset=document.createElement('fieldset');fieldset.innerHTML='<legend>'+esc(section)+' fields</legend>';const grid=document.createElement('div');grid.className='guided-grid';let value;try{value=objectInput($('#action-'+section).value,section);}catch{value={};}
 for(const[name,raw]of Object.entries(schema.properties)){const definition=resolveSchema(raw,entry);const label=document.createElement('label');label.textContent=name+(schema.required?.includes(name)?' *':'');let control;
 if(definition.enum){control=document.createElement('select');const blank=document.createElement('option');blank.value='';blank.textContent='Not supplied';control.append(blank);for(const item of definition.enum){const option=document.createElement('option');option.value=JSON.stringify(item);option.textContent=text(item);control.append(option);}if(value[name]!==undefined)control.value=JSON.stringify(value[name]);}
 else if(definition.type==='boolean'){control=document.createElement('select');control.innerHTML='<option value="">Not supplied</option><option value="true">true</option><option value="false">false</option>';control.value=value[name]===undefined?'':String(value[name]);}
 else if(definition.type==='object'||definition.type==='array'||definition.oneOf||definition.anyOf||definition.properties){control=document.createElement('textarea');control.rows=3;label.className='wide';control.value=value[name]===undefined?'':pretty(value[name]);}
 else{control=document.createElement('input');control.type='text';control.value=value[name]===undefined?'':String(value[name]);control.autocomplete='off';if(definition.format==='uuid')control.placeholder='UUID';if(definition.type==='integer'||definition.type==='number')control.inputMode='decimal';}
 control.dataset.section=section;control.dataset.field=name;control.title=definition.description??'';
 control.addEventListener('change',()=>handle(()=>{const all=objectInput($('#action-'+section).value,section);if(control.value==='')delete all[name];else if(definition.enum||definition.type==='boolean'||control.tagName==='TEXTAREA')all[name]=parse(control.value,name);else if(definition.type==='integer'||definition.type==='number'){const number=Number(control.value);if(!Number.isFinite(number)||definition.type==='integer'&&!Number.isSafeInteger(number))throw fail('EXACT_NUMBER_REQUIRED',name+' must be an exact safe '+definition.type+'. Use the complete JSON input with decimal strings only where the provider schema supports them.');all[name]=number;}else all[name]=control.value;$('#action-'+section).value=pretty(all);}));
 label.append(control);if(definition.description){const hint=document.createElement('small');hint.textContent=definition.description;label.append(hint);}
 if(definition.format==='uuid'&&definition['x-client-generated']===true)label.append(button('Assign new '+name,()=>{control.value=crypto.randomUUID();control.dispatchEvent(new Event('change'));},'text-button'));
 grid.append(label);
 }fieldset.append(grid);holder.append(fieldset);
 }
}
function nativeInput(){const input={};for(const section of ['params','query','body']){const value=objectInput($('#action-'+section).value,section);if(Object.keys(value).length)input[section]=value;}return input;}
async function selectNativeAction(id,input={},alias){
 if(!catalogue().some(entry=>actionId(entry)===id))throw fail('ACTION_NOT_AVAILABLE','This connection catalogue does not contain '+id+'.');
 $('#action-select').value=id;if(alias)$('#action-connection').value=alias;for(const section of ['params','query','body'])$('#action-'+section).value=pretty(input[section]??{});await navigate('trade');renderAction();
}



const mappingTargets=['id','externalId','externalPaymentId','amount','currency','phoneNumber','email','verificationValue','memo','walletAddress','walletAddressMemo','links.sdpDisbursementId','links.sdpPaymentId','links.sdpReceiverId','links.bridgeTransferId','links.bridgeVirtualAccountId','links.bridgeDepositId','links.stellarTransactionHash'];
function mappingEditor(){
 const form=$('#programme-form'),holder=$('#mapping-fields');let mapping;try{mapping=objectInput(form.elements.mapping.value,'Mapping');}catch{mapping={};}holder.replaceChildren();
 for(const key of mappingTargets){const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.dataset.mapping=key;input.value=typeof mapping[key]==='string'?mapping[key]:'';input.placeholder='Canonical field';input.addEventListener('change',()=>handle(()=>{const latest=objectInput(form.elements.mapping.value,'Mapping');if(input.value.trim())latest[key]=input.value.trim();else delete latest[key];form.elements.mapping.value=pretty(latest);rememberDrafts();}));label.append(input);holder.append(label);}
}
function dateControl(value){if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString().slice(0,16):'';}
function selectedScope({programmeVersionId,payrollId,instructionId}={}){
 const prior=view.scope??{};
 if(programmeVersionId&&programmeVersionId!==prior.programmeVersionId&&!payrollId)for(const input of $$('[name=payrollId],[name=instructionId]'))input.value='';
 if((programmeVersionId&&programmeVersionId!==prior.programmeVersionId||payrollId&&payrollId!==prior.payrollId)&&!instructionId){for(const input of $$('[name=instructionId]'))input.value='';$('#operation-file-id').value='';}
 view.scope={programmeVersionId:programmeVersionId??prior.programmeVersionId,payrollId:payrollId??(programmeVersionId&&programmeVersionId!==prior.programmeVersionId?null:prior.payrollId),instructionId:instructionId??null};
 for(const [field,value]of Object.entries({programmeVersionId,payrollId,instructionId}))if(value)for(const input of $$('[name="'+field+'"]'))input.value=value;
}
async function selectReconciliation(field,id){const input=$('#reconciliation-form [name='+field+']');input.value=[...new Set([...ids(input.value),id])].join('\n');await navigate('reconciliations');}
async function openRecord(table,id){await navigate(table);await selectRecord(table,id);}
function programmeDefinition(form){
 const values=formObject(form),definition=objectInput(values.definition,'Retained programme definition');
 definition.name=values.name.trim();definition.environment=values.environment;definition.sourceWalletId=values.sourceWalletId.trim();
 definition.connectionAliases=parse(values.connectionAliases,'Connection aliases');definition.asset={...(definition.asset??{}),code:values.assetCode.trim(),issuer:values.assetIssuer.trim()};
 if(values.assetScale!==''){const scale=Number(values.assetScale);if(!Number.isSafeInteger(scale)||scale<0)throw fail('ASSET_SCALE_INVALID','Amount scale must be a nonnegative integer.');definition.asset.scale=scale;}else delete definition.asset.scale;
 definition.period={...(definition.period??{}),start:nativeDate(values.periodStart),end:nativeDate(values.periodEnd)};
 if(!definition.period.start||!definition.period.end||definition.period.end<=definition.period.start)throw fail('PERIOD_INVALID','Select a period whose end follows its start.');
 definition.mapping=objectInput(values.mapping,'Mapping');if(values.programmeId.trim())definition.id=values.programmeId.trim();return definition;
}
async function loadProgramme(row){
 const definition=row.definition,form=$('#programme-form');if(!definition||!row.id)throw fail('PROGRAMME_VERSION_REQUIRED','Select a retained programme version.');
 form.reset();form.elements.programmeId.value=row.programmeId;form.elements.name.value=definition.name??'';form.elements.environment.value=definition.environment;form.elements.sourceWalletId.value=definition.sourceWalletId??'';
 form.elements.assetCode.value=definition.asset?.code??'';form.elements.assetIssuer.value=definition.asset?.issuer??'';form.elements.assetScale.value=definition.asset?.scale??'';
 form.elements.periodStart.value=dateControl(definition.period?.start);form.elements.periodEnd.value=dateControl(definition.period?.end);
 form.elements.connectionAliases.value=pretty(definition.connectionAliases??{});form.elements.mapping.value=pretty(definition.mapping??{});form.elements.definition.value=pretty(definition);form.elements.sourceIds.value=(row.sourceIds??[]).join('\n');
 $('#programme-editor-title').textContent='Edit from version '+row.version;mappingEditor();await navigate('programmes');await rememberDrafts();form.scrollIntoView({behavior:'smooth'});
}
function newProgramme(){const form=$('#programme-form');form.reset();form.elements.definition.value='{}';form.elements.mapping.value='{}';form.elements.connectionAliases.value='{}';$('#programme-editor-title').textContent='Save a programme version';mappingEditor();handle(()=>rememberDrafts());}
async function renderPayrollDetail(table,row){
 if(table==='programmes'){
  appendContent(definitions({'Programme ID':row.programmeId,Version:row.version,'Version ID':row.id,'Definition SHA-256':row.sha256}));
  appendContent(renderData(row.definition,'Programme definition'));appendContent(jsonDetails('Retained source selection',row.sourceIds??[]));
  addAction('Edit as a new version',()=>loadProgramme(row));
  addAction('Import a payroll for this version',async()=>{selectedScope({programmeVersionId:row.id});await navigate('payrolls');await rememberDrafts();$('#payroll-form').scrollIntoView({behavior:'smooth'});});
  addAction('Create a read collection',async()=>{selectedScope({programmeVersionId:row.id});await navigate('collections');});
 }else if(table==='payrolls'){
  const data=row.data??{},ledgerRows=data.rows??[];
  appendContent(definitions({'Programme version':row.programmeVersionId,'Payroll SHA-256':row.sha256,Rows:ledgerRows.length,'Source file':row.sourceId}));
  const retained=await getRequest(row.id);if(retained?.file&&retained.workspaceId===workspaceId)addAction('Download the imported payroll file',async()=>{await verifyRequest(retained,workspaceId);saveBlob(retained.file,retained.source.name);});
  if(row.sourceId)addAction('Inspect original ledger source',()=>openRecord('sources',row.sourceId));
  addAction('Prepare instructions',async()=>{selectedScope({programmeVersionId:row.programmeVersionId,payrollId:row.id});await navigate('instructions');await rememberDrafts();});
  addAction('Reconcile payroll',async()=>{selectedScope({programmeVersionId:row.programmeVersionId,payrollId:row.id});await navigate('reconciliations');});
  addAction('Monitor this payroll',async()=>{selectedScope({programmeVersionId:row.programmeVersionId,payrollId:row.id});await navigate('collections');});
  appendContent(renderData(data.period,'Payroll period'));appendContent(renderData(ledgerRows,'Complete imported payroll rows'));appendContent(jsonDetails('Full payroll and original values',row));
 }else if(table==='instructions'){
  appendContent(definitions({'Programme version':row.programmeVersionId,Payroll:row.payrollId,'Wallet version':row.walletVersionId,'Disbursement version':row.disbursementVersionId,Rows:row.rowIds?.length??0,'File SHA-256':row.sha256}));
  if(row.file)appendContent(fileList([row.file]));appendContent(renderData(row.providerContract,'Selected provider contract'));appendContent(jsonDetails('Complete source row selection',row.rowIds??[]));
  addAction('Select for provider preparation',async()=>{selectedScope({programmeVersionId:row.programmeVersionId,payrollId:row.payrollId,instructionId:row.id});$('#operation-file-id').value=row.fileId;const versions=objectInput($('#operation-form [name=versionIds]').value,'Named version evidence');versions.wallet=row.walletVersionId;versions.disbursement=row.disbursementVersionId;$('#operation-form [name=versionIds]').value=pretty(versions);await navigate('trade');notice('Instruction file and its original payroll are selected. Choose the matching SDP action, inspect its provider contract and complete the native request before preparation.');await rememberDrafts();});
  appendContent(jsonDetails('Complete instruction record',row));
 }else if(table==='collections'){
  appendContent(definitions({'Programme version':row.programmeVersionId,Payroll:row.payrollId,'Interval seconds':row.intervalSeconds,Enabled:row.enabled,'Task selection SHA-256':row.definitionSha256}));
  appendContent(renderData(row.tasks,'Frozen read tasks'));
  addAction(row.enabled?'Disable scheduled runs':'Enable scheduled runs',()=>command('collection.enable',{collectionId:row.id,enabled:!row.enabled}));
  addAction('Run this collection now',()=>command('collection.run',{collectionId:row.id,maxPages:100}));
  addAction('Copy to a new disabled collection',async()=>{const form=$('#collection-form');form.elements.name.value=row.name+' copy';form.elements.programmeVersionId.value=row.programmeVersionId;form.elements.payrollId.value=row.payrollId??'';form.elements.intervalSeconds.value=row.intervalSeconds;form.elements.tasks.value=pretty(row.tasks.map(task=>({id:task.id,connectionAlias:task.connectionAlias,action:task.action,input:task.input,required:task.required})));renderTasks();await navigate('collections');await rememberDrafts();form.scrollIntoView({behavior:'smooth'});});
  appendContent(jsonDetails('Complete collection record',row));
 }else if(table==='runs'){
  appendContent(definitions({Collection:row.collectionId,'Programme version':row.programmeVersionId,Payroll:row.payrollId,'Scheduled for':row.scheduledFor,Status:row.status,Passes:row.passes?.length??0,'Source files':row.sourceIds?.length??0}));
  if(row.status!=='COMPLETE')addAction('Continue original run',()=>command('run.continue',{runId:row.id,maxPages:100}));
  if(!['PAUSED','COMPLETE'].includes(row.status))addAction('Pause run',()=>command('run.pause',{runId:row.id}));
  for(const task of row.tasks??[])if(task.captureId)addAction('Inspect capture · '+task.id,()=>openRecord('captures',task.captureId));
  for(const id of row.reconciliationIds??[])addAction('Open reconciliation · '+short(id),()=>openRecord('reconciliations',id));
  appendContent(renderData(row.tasks,'Frozen task selections'));appendContent(renderData(row.passes,'Retained execution passes'));appendContent(jsonDetails('Complete run record',row));
 }
}
function taskSelection(){
 const result=parse($('#collection-form [name=tasks]').value,'Collection tasks');if(!Array.isArray(result))throw fail('TASKS_ARRAY_REQUIRED','Tasks must be a complete JSON array.');return result;
}
function storeTasks(tasks){$('#collection-form [name=tasks]').value=pretty(tasks);renderTasks();handle(()=>rememberDrafts());}
function renderTasks(){
 const host=$('#collection-tasks');host.replaceChildren();let tasks;try{tasks=taskSelection();}catch(error){host.append(jsonDetails('Task JSON needs correction',{message:error.message}));return;}
 tasks.forEach((task,index)=>{
  const block=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Task '+(index+1);block.append(legend);
  function field(name,labelText,control){const label=document.createElement('label');label.textContent=labelText;label.append(control);block.append(label);control.addEventListener('change',()=>handle(()=>{const latest=taskSelection();if(!latest[index])throw fail('TASK_CHANGED','Reload the selected task before editing.');let value=control.type==='checkbox'?control.checked:control.value;if(name==='input')value=objectInput(value,'Task input');latest[index]={...latest[index],[name]:value};$('#collection-form [name=tasks]').value=pretty(latest);awaitableDraft();}));}
  const id=document.createElement('input');id.value=task.id??'';field('id','Task ID',id);
  const connectionSelect=document.createElement('select');fillSelect(connectionSelect,bootstrap.connections.map(row=>({value:row.alias,label:row.alias+' · '+row.environment})));if(task.connectionAlias&&!Array.from(connectionSelect.options).some(o=>o.value===task.connectionAlias)){const option=new Option(task.connectionAlias,task.connectionAlias);connectionSelect.append(option);}connectionSelect.value=task.connectionAlias??'';field('connectionAlias','Connection',connectionSelect);
  const action=document.createElement('select');fillSelect(action,catalogue().filter(entry=>!isMutation(entry)).map(entry=>({value:actionId(entry),label:entry.label??actionId(entry)})));if(task.action&&!Array.from(action.options).some(o=>o.value===task.action))action.append(new Option(task.action,task.action));action.value=task.action??'';field('action','Read action',action);
  const input=document.createElement('textarea');input.rows=5;input.value=pretty(task.input??{});field('input','Complete request input JSON',input);
  const required=document.createElement('input');required.type='checkbox';required.checked=task.required!==false;field('required','Required for a complete run',required);
  block.append(button('Remove this task',()=>{const latest=taskSelection();latest.splice(index,1);storeTasks(latest);},'text-button'));host.append(block);
 });
 if(!tasks.length){const p=document.createElement('p');p.className='muted';p.textContent='Add read tasks from the configured provider catalogue.';host.append(p);}
}
function awaitableDraft(){handle(()=>rememberDrafts());}
let draftTimer=null;
const draftForms=['programme-form','payroll-form','instruction-form','collection-form','operation-form','correction-form','reconciliation-form'];
async function rememberDrafts(){
 if(!workspaceId)return;const drafts={};
 for(const id of draftForms){const form=$('#'+id),values={};for(const element of form.elements){if(!element.name||element.type==='file'||['submit','button'].includes(element.type))continue;values[element.name]=element.type==='checkbox'?element.checked:element.value;}drafts[id]=values;}
 for(const section of ['params','query','body'])drafts['operation-form']['action-'+section]=$('#action-'+section).value;
 view.drafts=drafts;await remember();
}
function restoreDrafts(){
 for(const [id,values]of Object.entries(view.drafts??{})){if(!draftForms.includes(id))continue;const form=$('#'+id);for(const [name,value]of Object.entries(values)){if(name.startsWith('action-')){const input=$('#'+name);if(input)input.value=value;continue;}const input=form.elements[name];if(input&&input.type!=='file'){if(input.type==='checkbox')input.checked=value===true;else input.value=value;}}}
 mappingEditor();renderTasks();
}
for(const id of draftForms)$('#'+id).addEventListener('input',()=>{if(draftTimer)clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;handle(()=>rememberDrafts());},350);});
$('#programme-form [name=mapping]').addEventListener('change',()=>handle(mappingEditor));
$('#new-programme').addEventListener('click',newProgramme);
$('#collection-form [name=tasks]').addEventListener('change',()=>handle(renderTasks));
$('#add-collection-task').addEventListener('click',()=>handle(()=>{const tasks=taskSelection(),read=catalogue().find(action=>!isMutation(action));tasks.push({id:crypto.randomUUID(),connectionAlias:bootstrap.connections[0]?.alias??'',action:read?actionId(read):'',input:{},required:true});storeTasks(tasks);}));
bindForm('#programme-form',form=>{
 const values=formObject(form),args={definition:programmeDefinition(form)};if(values.programmeId.trim())args.programmeId=values.programmeId.trim();const sourceIds=ids(values.sourceIds);if(sourceIds.length)args.sourceIds=sourceIds;return command('programme.save',args);
});
bindForm('#payroll-form',form=>serialized(async()=>{
 const file=form.elements.file.files[0];if(!file)throw fail('PAYROLL_FILE_REQUIRED','Select the complete payroll file.');
 const args={method:'payroll.import',programmeVersionId:form.elements.programmeVersionId.value.trim(),format:form.elements.format.value,filename:file.name};if(form.elements.format.value==='json'&&form.elements.recordsPath.value.trim())args.recordsPath=form.elements.recordsPath.value.trim();
 const record=await prepareRequest({workspaceId,revision:bootstrap.workspace.revision,kind:'upload',method:'payroll.import',args,file,label:'Import payroll '+file.name});return transmit(record);
}));
bindForm('#instruction-form',form=>command('payroll.instructions',{payrollId:form.elements.payrollId.value.trim(),walletVersionId:form.elements.walletVersionId.value.trim(),disbursementVersionId:form.elements.disbursementVersionId.value.trim()}));
bindForm('#collection-form',form=>{
 const intervalSeconds=Number(form.elements.intervalSeconds.value);if(!Number.isSafeInteger(intervalSeconds)||intervalSeconds<60)throw fail('INTERVAL_INVALID','Select an interval of at least 60 whole seconds.');
 const tasks=taskSelection();if(!tasks.length)throw fail('TASKS_REQUIRED','Add at least one complete read task.');for(const task of tasks){const entry=catalogue().find(action=>actionId(action)===task.action);if(!entry||isMutation(entry))throw fail('READ_ACTION_REQUIRED','Collection tasks must be declared read actions.');}
 const args={name:form.elements.name.value.trim(),programmeVersionId:form.elements.programmeVersionId.value.trim(),intervalSeconds,tasks};if(form.elements.payrollId.value.trim())args.payrollId=form.elements.payrollId.value.trim();return command('collection.save',args);
});
bindForm('#file-form',form=>serialized(async()=>{
 const file=form.elements.file.files[0];if(!file)throw fail('SOURCE_FILE_REQUIRED','Select a complete file.');
 const record=await prepareRequest({workspaceId,revision:bootstrap.workspace.revision,kind:'file-upload',method:'file.retain',args:{filename:file.name},file,label:'Retain '+file.name});return transmit(record);
}));

const activeIntents=new Map();
function serialized(task){
 const run=()=>navigator.locks?navigator.locks.request('bloccpay-workspace-'+workspaceId,{mode:'exclusive'},task):task();
 const promise=mutationTail.then(run,run);mutationTail=promise.catch(()=>{});return promise;
}
function command(method,args){
 const key=canonical({method,args});if(activeIntents.has(key))return activeIntents.get(key);
 const promise=serialized(async()=>{const record=await prepareRequest({workspaceId,revision:bootstrap.workspace.revision,method,args});return transmit(record);});
 activeIntents.set(key,promise);promise.finally(()=>activeIntents.delete(key)).catch(()=>{});return promise;
}
async function originalHostRequest(record){
 if(record.kind==='unpack')return null;
 try{return await fetchItem('requests',record.id);}catch(error){if(error.status===404||error.code==='RECORD_NOT_FOUND')return null;throw error;}
}
function envelope(response,record){
 if(record.kind==='unpack')return response;
 if(response?.requestId!==record.id||response?.workspaceId!==workspaceId||!Number.isSafeInteger(response.revision))throw fail('HOST_RESPONSE_IDENTITY_MISMATCH','The returned host request does not match this workspace and retained request.');
 return response;
}
async function transmit(original,{recover=false,continueRunning=false}={}){
 let record=await getRequest(original.id)??original;const done=busy(recover?'Checking retained request…':'Retaining and sending request…');
 try{
 await verifyRequest(record,workspaceId);
 if(record.status==='COMPLETE'){if(!record.appliedAt)await applyResult(record);return record.response;}
 if(recover&&record.attempts.length&&record.kind!=='unpack'){
 const host=await originalHostRequest(record);
 if(host?.status==='COMPLETE'){record=await finishAttempt(record,{response:envelope(host.result,record),status:'COMPLETE'});await applyResult(record);return record.response;}
 if(host?.status==='FAILED'){const error=Object.assign(new Error(host.error?.message??'The original host request failed.'),host.error??{});record=await finishAttempt(record,{error,status:'REJECTED'});await renderRecovery();throw error;}
 if(host?.status==='RUNNING'&&!continueRunning){notice('Request '+short(record.id)+' is still running on the host. Its original operation remains selected.');scheduleRecovery();return null;}
 }
 if(record.status==='REJECTED')throw fail('REQUEST_REJECTED','This retained request has a definitive host rejection. Review its recorded error before preparing a changed request.');
 record=await beginAttempt(record,workspaceId);let response;
 if(record.kind==='file-upload'){
 const args={...record.args,requestId:record.id,expectedRevision:record.request.expectedRevision};response=await(await api('/api/files/upload?'+new URLSearchParams({args:JSON.stringify(args)}),{method:'POST',body:record.file,raw:true,headers:{'Content-Type':record.file.type||'application/octet-stream','X-Content-SHA256':record.source.sha256}})).json();
 }else if(record.kind==='upload'){
 const args={...record.args,requestId:record.id,expectedRevision:record.request.expectedRevision};
 response=await(await api('/api/source-import?'+new URLSearchParams({args:JSON.stringify(args)}),{method:'POST',body:record.file,raw:true,headers:{'Content-Type':record.file.type||'application/octet-stream','X-Content-SHA256':record.source.sha256}})).json();
 }else if(record.kind==='unpack'){
 const query=new URLSearchParams({requestId:record.id});if(record.manifestSha256)query.set('manifestSha256',record.manifestSha256);
 response=await(await api('/api/packages/unpack?'+query,{method:'POST',body:record.file,raw:true,headers:{'Content-Type':'application/gzip','X-Content-SHA256':record.source.sha256,...(record.manifestSha256?{'X-Bloccpay-Manifest-SHA256':record.manifestSha256}:{})}})).json();
 }else response=await(await api('/api/command',{method:'POST',body:record.request})).json();
 envelope(response,record);record=await finishAttempt(record,{response,status:'COMPLETE'});await applyResult(record);return response;
 }catch(error){
 if(record.status!=='COMPLETE'&&record.status!=='REJECTED'&&record.attempts.length){
 const uncertain=error.code==='TRANSPORT_UNCERTAIN'||error.code==='OPERATION_BUSY'||error.status===401||!error.status||error.status>=500;
 record=await finishAttempt(record,{error,status:uncertain?'UNCERTAIN':'REJECTED'});if(uncertain&&error.status!==401)scheduleRecovery();
 }
 throw error;
 }finally{done();await renderRecovery();}
}
async function applyResult(record){
 const response=record.response,result=record.kind==='unpack'?response:response.result;
 if(record.kind==='unpack'){view.inspection=result;view.receiveSource=result.sourceDirectory??result.directory;view.receiveHash=result.manifestSha256;view.page='transfer';}
 else if(record.method==='file.retain'){view.lastFile=result.file;view.page='sources';}
 else if(['workspace.export','report.export'].includes(record.method)){view.lastExport=result;view.page='transfer';}
 else if(record.method==='package.inspect'){view.inspection=result;view.receiveSource=record.args.sourceDirectory;view.receiveHash=result.manifestSha256??record.args.expectedManifestSha256;view.page='transfer';}
 else if(record.method==='package.receive'){view.received=result;view.page='transfer';}
 else{
 const table=record.method==='programme.save'?'programmes':record.method==='payroll.import'?'payrolls':record.method==='payroll.instructions'?'instructions':record.method==='collection.run'||record.method.startsWith('run.')?'runs':record.method.startsWith('collection.')?'collections':record.method.startsWith('operation.')?'operations':record.method.startsWith('capture.')?'captures':record.method.startsWith('source.')?'sources':record.method==='webhook.reconcile'?'webhooks':record.method==='correction.save'?'corrections':record.method==='reconciliation.create'?'reconciliations':record.method==='report.create'?'reports':null;
 if(table&&result?.id){view.selected={table,id:result.id};view.page=table;}
 }
 await refreshBootstrap();if(record.method==='file.retain'&&result.file){$('#operation-file-id').value=result.file.id;$('#file-result').replaceChildren(definitions({'Retained file':result.file.id,'SHA-256':result.file.sha256,Bytes:result.file.bytes}),fileList([result.file]));}await markApplied(record,view);
 if(record.method==='profile.update')delete $('#profile-form').dataset.dirty;if(record.method==='delivery.configure')delete $('#dispatch-form').dataset.dirty;
 await navigate(view.page??page,{keepSelection:true});
 if(view.selected&&view.selected.table===page&&tables.has(page))await selectRecord(view.selected.table,view.selected.id);
 notice(record.kind==='unpack'?'Complete delivery inspected. Choose a new destination to receive it.':'Request completed and retained: '+record.method+'.');
}
let recoveryPasses=0;
function scheduleRecovery(){if(pollTimer||recoveryPasses>=8)return;pollTimer=setTimeout(()=>{pollTimer=null;recoveryPasses++;handle(()=>recoverRequests({quiet:true}));},6000);}
async function recoverRequests({quiet=false}={}){
 const all=await listRequests(workspaceId);const unfinished=all.filter(row=>row.status==='COMPLETE'&&!row.appliedAt||['PENDING','RUNNING','UNCERTAIN'].includes(row.status));
 for(const row of unfinished){try{await serialized(()=>transmit(row,{recover:true}));}catch(error){if(!quiet)report(error);}}
 await renderRecovery();
}
async function renderRecovery(){
 if(!workspaceId)return;requests=await listRequests(workspaceId);pendingCount=requests.filter(row=>['PENDING','RUNNING','UNCERTAIN'].includes(row.status)||row.status==='COMPLETE'&&!row.appliedAt||row.error?.code==='REVISION_CONFLICT').length;$('#recovery-count').textContent=pendingCount?String(pendingCount):'';
 const host=$('#recovery-list');host.replaceChildren();if(!requests.length){host.innerHTML='<p class="empty">No browser requests have been recorded in this workspace.</p>';return;}
 const table=document.createElement('table');table.innerHTML='<thead><tr><th>Request</th><th>State</th><th>Attempts</th><th>Outcome / recovery</th></tr></thead>';const body=document.createElement('tbody');
 for(const row of requests){const tr=document.createElement('tr'),name=document.createElement('td'),state=document.createElement('td'),attempt=document.createElement('td'),action=document.createElement('td');tr.dataset.requestId=row.id;tr.dataset.requestStatus=row.status;name.textContent=row.label;const id=document.createElement('small');id.className='mono';id.textContent=row.id;name.append(id);if(row.source){const detail=document.createElement('small');detail.textContent=row.source.name+' · '+row.source.size+' bytes · '+short(row.source.sha256);name.append(detail);}
 state.append(badge(row.status));attempt.textContent=String(row.attempts.length);
 if(row.error){const p=document.createElement('p');p.textContent=row.error.code+': '+row.error.message;action.append(p);}
 if(row.status==='REJECTED'&&row.error?.code==='REVISION_CONFLICT')action.append(button('Refresh revision and retry same request',()=>serialized(async()=>{await refreshBootstrap();const fresh=await getRequest(row.id);const rebased=await rebaseRequest(fresh,bootstrap.workspace.revision);await transmit(rebased);})));
 else if(row.status!=='REJECTED'&&(row.status!=='COMPLETE'||!row.appliedAt))action.append(button(row.status==='COMPLETE'?'Restore completed result':'Check original request',()=>serialized(()=>transmit(row,{recover:true}))));
 else if(row.appliedAt){const p=document.createElement('small');p.textContent='Result retained · '+row.appliedAt;action.append(p);}
 if(['RUNNING','UNCERTAIN'].includes(row.status)&&row.kind!=='unpack'){const continuation=button('Continue original host request',()=>serialized(()=>transmit(row,{recover:true,continueRunning:true})));continuation.dataset.requestAction='continue';action.append(continuation);}
 for(const control of action.querySelectorAll('button'))if(!control.dataset.requestAction)control.dataset.requestAction=row.error?.code==='REVISION_CONFLICT'?'rebase':'check';
 const details=jsonDetails('Request arguments and attempts',{request:row.request,intentSha256:row.intentSha256,source:row.source,attempts:row.attempts,revisionHistory:row.revisionHistory,response:row.response,error:row.error});action.append(details);tr.append(name,state,attempt,action);body.append(tr);}
 table.append(body);host.append(table);
}
function renderTransfer(){
 const exported=view.lastExport,host=$('#export-result');host.hidden=!exported;host.replaceChildren();
 if(exported){const heading=document.createElement('h2');heading.textContent='Complete export';host.append(heading,definitions({ID:exported.id??exported.exportId,Directory:exported.directory??exported.sourceDirectory,'Manifest SHA-256':exported.manifestSha256}));const id=exported.id??exported.exportId;if(id)host.append(button('Download full archive',()=>download('/api/exports/'+encodeURIComponent(id)+'/archive','bloccpay-'+id+'.tar.gz')));host.append(jsonDetails('Complete export result',exported));}
 const form=$('#receive-form');if(view.receiveSource&&!form.dataset.dirty)form.elements.sourceDirectory.value=view.receiveSource;if(view.receiveHash&&!form.dataset.dirty)form.elements.expectedManifestSha256.value=view.receiveHash;
 const received=$('#receive-result');received.hidden=!view.inspection&&!view.received;received.replaceChildren();
 if(view.inspection){const heading=document.createElement('h2');heading.textContent='Delivery inspection';received.append(heading,renderData(view.inspection));}
 if(view.received){const heading=document.createElement('h2');heading.textContent='Received workspace';received.append(heading,renderData(view.received));const p=document.createElement('p');p.textContent='The received workspace is independent. Use its returned application and workspace paths to start it, then review the selected connections before enabling dispatch.';received.append(p);}
}
async function loadExports(more=false){
 const result=await fetchList('exports',{cursor:more?exportCursor:null});exportRows=more?[...exportRows,...result.rows]:result.rows;exportCursor=result.nextCursor;$('#exports-more').hidden=!exportCursor;const target=$('#exports-list');target.replaceChildren();
 for(const row of exportRows){const line=document.createElement('div');line.className='file-row';const detail=document.createElement('div');detail.textContent=row.name??row.kind??'Workspace export';const small=document.createElement('small');small.textContent=row.id+' · '+(row.createdAt??'')+' · '+(row.manifestSha256??'');detail.append(small);line.append(detail,button('Open export',async()=>{view.lastExport=row;await remember();renderTransfer();}));target.append(line);}if(!exportRows.length)target.innerHTML='<p class="empty">No exports are recorded.</p>';
}
function bindForm(id,handler){
 const form=$(id);form.addEventListener('submit',event=>{event.preventDefault();if(form.dataset.running)return;form.dataset.running='true';const buttons=[...form.querySelectorAll('button[type=submit]')];for(const button of buttons)button.disabled=true;handle(()=>handler(form)).finally(()=>{delete form.dataset.running;for(const button of buttons)button.disabled=false;});});
}
bindForm('#operation-form',form=>{
 const entry=currentAction();if(!entry)throw fail('ACTION_REQUIRED','Select a native action.');const evidence={};
 for(const name of ['programmeVersionId','payrollId','instructionId'])if(form.elements[name].value.trim())evidence[name]=form.elements[name].value.trim();
 for(const name of ['versionIds','sourceIds']){const value=objectInput(form.elements[name].value,name);if(Object.keys(value).length)evidence[name]=value;}
 const args={connectionAlias:form.elements.connectionAlias.value,action:actionId(entry),input:nativeInput(),...(Object.keys(evidence).length?{evidence}:{})};
 if(form.elements.fileId.value.trim())args.fileId=form.elements.fileId.value.trim();return command('operation.prepare',args);
});
$('#start-capture').addEventListener('click',()=>handle(()=>{const action=currentAction();if(!action||action.mutation)throw fail('READ_ACTION_REQUIRED','Only a read action can collect pages.');return command('capture.start',{connectionAlias:$('#action-connection').value,action:actionId(action),input:nativeInput()});}));
$('#action-select').addEventListener('change',()=>{for(const section of ['params','query','body'])$('#action-'+section).value='{}';renderAction();});
for(const field of ['params','query','body'])$('#action-'+field).addEventListener('change',()=>handle(()=>{objectInput($('#action-'+field).value,field);renderAction();}));
$('#reset-operation').addEventListener('click',()=>{$('#operation-form').reset();for(const section of ['params','query','body'])$('#action-'+section).value='{}';renderAction();});
$('#browse-evidence').addEventListener('click',()=>handle(()=>navigate('resources')));
$('#browse-files').addEventListener('click',()=>handle(async()=>{await navigate('sources');$('#file-form').scrollIntoView({behavior:'smooth'});}));
bindForm('#record-filter',()=>loadRecords(false));
$('#records-more').addEventListener('click',()=>handle(()=>loadRecords(true)));
$('#close-detail').addEventListener('click',()=>{$('#record-detail').hidden=true;});
bindForm('#source-form',form=>serialized(async()=>{
 const input=formObject(form),file=form.elements.file.files[0];if(!file)throw fail('SOURCE_FILE_REQUIRED','Select a complete file.');
 const args={connectionAlias:input.connectionAlias,action:input.action,input:objectInput(input.input,'Source request input'),bodyComplete:form.elements.bodyComplete.checked,filename:file.name};
 if(input.observedAt)args.observedAt=nativeDate(input.observedAt);if(input.status)args.status=Number(input.status);
 const record=await prepareRequest({workspaceId,revision:bootstrap.workspace.revision,kind:'upload',method:'source.import',args,file,label:'Import '+file.name});return transmit(record);
}));
bindForm('#correction-form',form=>{
 const values=formObject(form),args={programmeVersionId:values.programmeVersionId.trim(),payrollId:values.payrollId.trim(),action:values.action,reason:values.reason.trim(),actor:values.actor.trim()};
 for(const key of ['payrollRowId','resourceId','versionId','sourceId','supersedes'])if(values[key].trim())args[key]=values[key].trim();
 if(!args.payrollRowId&&!args.resourceId&&!args.versionId&&!args.sourceId)throw fail('CORRECTION_TARGET_REQUIRED','Select a payroll row, resource, version or source.');if(values.action==='link')args.links=objectInput(values.links,'Link details');return command('correction.save',args);
});
bindForm('#reconciliation-form',form=>{
 const values=formObject(form),args={programmeVersionId:values.programmeVersionId.trim(),payrollId:values.payrollId.trim()};
 for(const key of ['versionIds','sourceIds','captureIds','runIds']){const selected=ids(values[key]);if(selected.length)args[key]=selected;}return command('reconciliation.create',args);
});
bindForm('#profile-form',form=>command('profile.update',{name:form.elements.name.value.trim()}));
bindForm('#dispatch-form',form=>command('delivery.configure',{enabled:form.elements.enabled.checked}));
for(const id of ['#profile-form','#dispatch-form','#receive-form'])$(id).addEventListener('input',()=>{$(id).dataset.dirty='true';});
bindForm('#export-form',form=>command('workspace.export',{destination:form.elements.destination.value.trim()}));
bindForm('#unpack-form',form=>serialized(async()=>{
 const file=form.elements.archive.files[0];if(!file)throw fail('ARCHIVE_REQUIRED','Select the full delivery archive.');const manifestSha256=form.elements.manifestSha256.value.trim().toLowerCase()||null;if(manifestSha256&&!/^[a-f0-9]{64}$/.test(manifestSha256))throw fail('MANIFEST_HASH_INVALID','Enter a complete SHA-256 hash.');
 const record=await prepareRequest({workspaceId,revision:bootstrap.workspace.revision,kind:'unpack',method:'package.unpack',args:{},file,manifestSha256,label:'Unpack '+file.name});delete $('#receive-form').dataset.dirty;return transmit(record);
}));
function receiveArgs(){const form=$('#receive-form'),args={sourceDirectory:form.elements.sourceDirectory.value.trim()};if(!args.sourceDirectory)throw fail('DELIVERY_SOURCE_REQUIRED','Enter the complete source delivery directory.');if(form.elements.expectedManifestSha256.value.trim())args.expectedManifestSha256=form.elements.expectedManifestSha256.value.trim().toLowerCase();return args;}
$('#inspect-package').addEventListener('click',()=>handle(()=>command('package.inspect',receiveArgs())));
bindForm('#receive-form',form=>{const args=receiveArgs();args.destination=form.elements.destination.value.trim();if(!args.destination)throw fail('RECEIVE_DESTINATION_REQUIRED','Choose a new destination directory.');return command('package.receive',args);});
$('#exports-more').addEventListener('click',()=>handle(()=>loadExports(true)));
$('#recover-all').addEventListener('click',()=>{recoveryPasses=0;handle(()=>recoverRequests());});
$('#close-preview').addEventListener('click',()=>{$('#preview-dialog').close();$('#report-preview').removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;});
$('#forget-token').addEventListener('click',()=>{sessionStorage.removeItem('bloccpay.operator.token');token='';$('#access-screen').hidden=false;$('#shell').inert=true;});
for(const node of $$('[data-view]'))node.addEventListener('click',()=>handle(()=>navigate(node.dataset.view)));
$('#refresh').addEventListener('click',()=>handle(async()=>{await refreshBootstrap();if(tables.has(page))await loadRecords(false);if(selected?.table===page)await selectRecord(selected.table,selected.id);if(page==='transfer')await loadExports(false);await renderRecovery();notice('Workspace refreshed.');}));
bindForm('#access-form',async form=>{token=form.elements['operator-token'].value.trim();try{await open();sessionStorage.setItem('bloccpay.operator.token',token);form.reset();}catch(error){$('#access-error').textContent=error.message;throw error;}});
async function open(){
 const done=busy('Opening selected workspace…');try{
 await refreshBootstrap();const saved=await initializeJournal(workspaceId);view=saved.view??{};requests=saved.requests;restoreDrafts();if(view.lastFile){$('#file-result').replaceChildren(definitions({'Retained file':view.lastFile.id,'SHA-256':view.lastFile.sha256,Bytes:view.lastFile.bytes}),fileList([view.lastFile]));}$('#access-screen').hidden=true;$('#shell').inert=false;await navigate(view.page??'overview',{keepSelection:true});if(view.selected?.table===page&&tables.has(page))await selectRecord(view.selected.table,view.selected.id);renderAction();await renderRecovery();await recoverRequests({quiet:true});
 }finally{done();}
}
$('.brand').addEventListener('click',event=>{event.preventDefault();handle(()=>navigate('overview'));});
if(token)handle(open).catch(()=>{});else{$('#access-screen').hidden=false;$('#shell').inert=true;}
