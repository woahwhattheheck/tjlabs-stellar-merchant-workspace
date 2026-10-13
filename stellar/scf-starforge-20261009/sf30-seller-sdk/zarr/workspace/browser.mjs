/** The original Zarr operator: retained intent, exact native IDs, explicit recovery. */
const $=(s,root=document)=>root.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>esc(JSON.stringify(value,null,2));
const short=value=>String(value??'').length>20?String(value).slice(0,12)+'…'+String(value).slice(-6):String(value??'');
const uid=()=>crypto.randomUUID();
const number=(value,name,{min=0,max=Number.MAX_SAFE_INTEGER}={})=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(name+' must be an exact integer from '+min+' to '+max);return n;};
const date=value=>value?new Date(value).toLocaleString(): '—';
const count=value=>Number(value??0).toLocaleString();
const bytes=value=>value>=1048576?(value/1048576).toFixed(2)+' MiB':value>=1024?(value/1024).toFixed(1)+' KiB':value+' B';
const badge=(text,kind='')=>'<span class="badge '+esc(kind)+'">'+esc(text)+'</span>';
const option=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const hashView=value=>'<code class="hash" title="'+esc(value)+'">'+esc(value)+'</code>';
const empty=(title,text)=>'<section class="empty"><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p></section>';
const detail=(title,value)=>'<details><summary>'+esc(title)+'</summary><pre>'+json(value)+'</pre></details>';
const field=(name,label,value='',extra='')=>'<label>'+esc(label)+'<input name="'+esc(name)+'" value="'+esc(value)+'" '+extra+'></label>';
const area=(name,label,value,extra='')=>'<label>'+esc(label)+'<textarea name="'+esc(name)+'" '+extra+'>'+esc(value??'')+'</textarea></label>';
const titles={overview:'Workspace overview',sources:'Retained sources',selections:'Array selections',results:'Results & review',publisher:'Dataset publisher',transfer:'Receive & transfer',operations:'Original operations'};
const state={session:null,native:null,tab:'overview',source:null,array:null,result:null,offset:0,limit:100,
 frozen:null,publisher:null,publisherError:null,epoch:0,busy:0,drafts:{},local:[],files:[],publisherRequests:[],publisherOffsets:{}};
const tokenKey='zarr-operator-token:'+location.origin;
let token=new URLSearchParams(location.hash.slice(1)).get('token')||sessionStorage.getItem(tokenKey);
if(token){sessionStorage.setItem(tokenKey,token);history.replaceState(null,'',location.pathname+location.search);}
let storeKey=null;
function persist(){if(storeKey)localStorage.setItem(storeKey,JSON.stringify({drafts:state.drafts,local:state.local,source:state.source,array:state.array,result:state.result,frozen:state.frozen}));}
function retain(value){const at=state.local.findIndex(x=>x.id===value.id);if(at<0)state.local.push(value);else state.local[at]=value;persist();return value;}
function notice(text,kind='info'){const n=$('#notice');n.hidden=!text;n.className='notice '+kind;n.textContent=text??'';}
function fail(error){notice((error.code?error.code+': ':'')+(error.message??error),'error');}
async function api(path,body){
 if(!token)throw Error('Open the private operator link supplied by the local command or Applications.');
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 let value;try{value=await response.json();}catch{throw Error('The original listener returned an incomplete response. Preserve this request and reconnect.');}
 if(!response.ok)throw Object.assign(Error(value.message??'The original operation was not accepted'),{code:value.code,status:response.status});
 return value;
}
function captureDrafts(){for(const form of document.querySelectorAll('form[data-draft]')){
 const values={};for(const input of form.elements){if(!input.name||['submit','button'].includes(input.type))continue;values[input.name]=input.type==='checkbox'?input.checked:input.value;}
 state.drafts[form.dataset.draft]=values;
}persist();}
function restoreDrafts(){for(const form of document.querySelectorAll('form[data-draft]')){
 const values=state.drafts[form.dataset.draft];if(!values)continue;
 for(const input of form.elements)if(Object.hasOwn(values,input.name)){if(input.type==='checkbox')input.checked=values[input.name];else input.value=values[input.name];}
}}
function localPending(){return state.local.filter(x=>!['COMPLETE','NOT_DISPATCHED','ABANDONED'].includes(x.state));}
function original(id,items){return items.find(x=>x.id===id);}
function latestReview(id){return state.native.reviews.find(x=>x.resultId===id);}
function reconcileLocal(){
 for(const entry of state.local){if(entry.kind!=='native')continue;const op=state.native.operations.find(x=>x.id===entry.id);
  if(op?.state==='COMPLETE')Object.assign(entry,{state:'COMPLETE',result:op.result});
  if(op?.state==='ABANDONED')entry.state='ABANDONED';
 }persist();
}
async function refresh({render=true}={}){
 captureDrafts();const current=await api('/api/status');
 if(current.workspaceId!==state.session.workspaceId)throw Error('The listener now selects another original workspace. Reopen its declared private link.');
 state.native=current;reconcileLocal();$('#revision').textContent='Revision '+current.revision;
 $('#workspace-label').textContent='WORKSPACE '+short(current.workspaceId);
 $('#source-count').textContent=count(current.sources.length);$('#selection-count').textContent=count(current.selections.length);
 $('#result-count').textContent=count(current.results.length);$('#pending-count').textContent=count(current.operations.filter(x=>['RUNNING','INTERRUPTED'].includes(x.state)).length);
 if(render)await renderPage();
}
async function task(callback){state.busy++;$('#main').setAttribute('aria-busy','true');try{return await callback();}catch(error){fail(error);throw error;}finally{state.busy--;$('#main').setAttribute('aria-busy',state.busy?'true':'false');}}
async function nativeAction(action,input,{id=uid(),existing=null}={}){
 const entry=existing??retain({id,kind:'native',action,state:'PREPARING',createdAt:new Date().toISOString(),
  intent:{id,action,expectedRevision:state.native.revision,input}});
 try{
  if(!entry.prepared){entry.prepared=await api('/api/prepare',entry.intent);entry.state='PREPARED';retain(entry);}
  entry.state='DISPATCHING';retain(entry);const result=await api('/api/apply',entry.prepared);
  entry.state='COMPLETE';entry.result=result;retain(entry);notice('Original '+action+' completed at revision '+result.revision+'.','success');
  await refresh();return result;
 }catch(error){entry.state=entry.state==='PREPARING'?'PREPARE_FAILED':'RESPONSE_UNCONFIRMED';entry.error={code:error.code,message:error.message};retain(entry);await refresh().catch(()=>{});throw error;}
}
async function replayLocal(id){const entry=state.local.find(x=>x.id===id);if(!entry)throw Error('Retain the original local request first.');
 if(entry.kind==='native')return nativeAction(entry.action,entry.intent.input,{id,existing:entry});
 if(entry.kind==='export')return exportWorkspace(entry);
 if(entry.kind==='receive')return receiveWorkspace(entry);
 if(entry.kind==='publisher')return publisherWrite(entry.request.action,entry.request.input,entry);
 throw Error('This retained request cannot be replayed by another operation type.');
}
async function nativeResume(id){const current=await api('/api/operations/'+id);if(current.state==='COMPLETE'){notice('The original operation is already complete.','success');await refresh();return current.result;}
 const result=await api('/api/resume',{id});notice('The same original operation resumed at revision '+result.revision+'.','success');await refresh();return result;}
function overview(){
 const n=state.native,pending=n.operations.filter(x=>['RUNNING','INTERRUPTED'].includes(x.state)),cells=n.results.reduce((sum,x)=>sum+x.rowCount,0);
 return '<section class="hero"><div><p class="eyebrow">COMPLETE SOURCE · EXPLICIT REVIEW</p><h2>From native arrays to reviewed data.</h2><p>Choose coordinates from a retained Zarr store, inspect exact typed values, and publish a reviewed scalar edition through the original dataset publisher.</p></div><div class="hero-status">'+badge('zarr '+state.session.runtime.version,'good')+'<small>Original Python engine</small></div></section>'+
 '<section class="metrics">'+[['Sources',n.sources.length,'Complete retained stores'],['Selections',n.selections.length,'Explicit source coordinates'],['Result cells',cells,'Full saved typed results'],['Frozen editions',n.frozen.length,'Reviewed publisher inputs']].map(([name,value,sub])=>'<article class="metric"><span>'+name+'</span><strong>'+count(value)+'</strong><small>'+sub+'</small></article>').join('')+'</section>'+
 (pending.length?'<section class="callout warning"><h3>Continue the original operation</h3><p>'+pending.length+' retained operation(s) need a completed response or an explicit closure. Open Operations to inspect the exact request.</p><button data-go="operations">Review operations</button></section>':'')+
 '<section class="card"><div class="section-heading"><h2>Working sequence</h2><span class="muted">Each edition keeps its source identity</span></div><ol class="steps">'+[
 ['Retain a source','Import one named complete Zarr directory or ZIP store.','sources'],['Choose the cells','Save a named axis selection against its native metadata.','selections'],
 ['Inspect & review','Page the complete typed result and record its interpretation.','results'],['Publish an edition','Freeze the selected scalar type, extract and review the original dataset.','publisher']
 ].map(([a,b,c],i)=>'<li><span class="step-number">'+(i+1)+'</span><div><h3>'+a+'</h3><p>'+b+'</p><button class="link" data-go="'+c+'">Open '+a.toLowerCase()+' →</button></div></li>').join('')+'</ol></section>'+
 '<section class="two-column"><article class="card"><h2>Original workspace</h2><dl><dt>Workspace UUID</dt><dd>'+hashView(n.workspaceId)+'</dd><dt>Revision</dt><dd>'+n.revision+'</dd><dt>Connected instance</dt><dd>'+hashView(state.session.instanceId)+'</dd><dt>Native engine</dt><dd>'+esc(JSON.stringify(state.session.runtime))+'</dd></dl></article>'+
 '<article class="card"><h2>Typed values remain explicit</h2><p>Large integers, non-finite numbers, bytes, dates, complex values and records retain their native tags. A public scalar projection is a separate reviewed choice.</p><button class="secondary" data-go="results">Inspect retained results</button></article></section>';
}
function sources(){
 const inputs=state.session.connections.inputs.filter(x=>x.kind!=='packet'),n=state.native;
 return '<section class="card"><div class="section-heading"><h2>Import a complete declared store</h2>'+badge('Read-only source')+'</div>'+
 (inputs.length?'<form data-form="import" data-draft="import" class="form-grid"><label>Host-declared input<select name="inputId" required>'+inputs.map(x=>option(x.id,x.title+' · '+x.kind)).join('')+'</select></label>'+
 field('title','Source edition title','','required maxlength="160"')+
 '<div class="full"><p class="hint">The host declaration pins ZIP bytes and records provenance. Directory capture verifies the entire member population before and after the copy.</p><button>Retain source</button></div></form>':
 '<p class="muted">No source inputs are declared for this listener. Add complete sources to the host connection file, then stop and reopen the operator.</p>')+'</section>'+
 (n.sources.length?'<section class="source-grid">'+n.sources.map(source=>'<article class="card source-card"><div class="section-heading"><h2>'+esc(source.title)+'</h2>'+badge(source.captureAtomic?'ZIP edition':'Verified directory')+'</div>'+
 '<p class="muted">'+count(source.inspection.arrays)+' arrays · '+count(source.inspection.groups)+' groups · '+count(source.memberCount)+' members · '+bytes(source.sourceBytes)+'</p>'+hashView(source.sourceSha256)+
 '<div class="table-wrap"><table><thead><tr><th>Native path</th><th>Kind / shape</th><th>Type</th><th></th></tr></thead><tbody>'+source.inspection.nodes.map(node=>'<tr><td><code>'+esc(node.path||'/')+'</code></td><td>'+esc(node.nodeType)+(node.shape?' · '+esc(JSON.stringify(node.shape)):'')+'</td><td>'+esc(typeof node.dtype==='string'?node.dtype:JSON.stringify(node.dtype??''))+'</td><td>'+(node.nodeType==='array'?'<button class="secondary small" data-select-array="'+esc(node.path)+'" data-source="'+source.id+'">Choose cells</button>':'')+'</td></tr>').join('')+'</tbody></table></div>'+
 detail('Original metadata and provenance',{inspection:source.inspection,provenance:source.provenance,sourceId:source.id})+'</article>').join('')+'</section>':empty('No retained sources yet','Select a declared store above. The complete original bytes are retained before native inspection.'));
}
function selectedArray(){
 const source=original(state.source,state.native.sources);return {source,array:source?.inspection.nodes.find(x=>x.path===state.array&&x.nodeType==='array')};
}
function selections(){
 const {source,array}=selectedArray(),n=state.native;
 let editor='';
 if(source&&array){
  const safe=array.shape.every(Number.isSafeInteger);
  editor='<section class="card"><div class="section-heading"><div><p class="eyebrow">'+esc(source.title)+'</p><h2>'+esc(array.path||'Root array')+'</h2></div>'+badge('Source shape '+JSON.stringify(array.shape))+'</div>'+
  (!safe?'<p class="callout warning">This array geometry exceeds exact browser integer precision. Use the original Python interface to declare coordinates; the browser will not round them.</p>':
  '<form data-form="selection" data-draft="selection:'+source.id+':'+array.path+'">'+field('title','Selection title',source.title+' / '+(array.path||'root'),'required maxlength="160"')+
  '<div class="axis-list">'+array.shape.map((size,i)=>'<div class="axis-row"><strong>Axis '+i+'<small>length '+count(size)+'</small></strong><label>Selection<select name="mode-'+i+'"><option value="slice">Slice</option><option value="index">Single index</option></select></label>'+
   field('start-'+i,'Start / index',0,'type="number" min="0" step="1"')+field('stop-'+i,'Stop (exclusive)',size,'type="number" min="0" step="1"')+field('step-'+i,'Step',1,'type="number" min="1" step="1"')+'</div>').join('')+'</div>'+
  (array.shape.length===0?'<p class="hint">This is a scalar array. Its explicit selection has no axes and contains one value.</p>':'')+
  '<div class="form-grid">'+field('maxCells','Maximum selected cells',250000,'type="number" min="1" max="1000000" step="1"')+field('maxNativeBytes','Native result memory allowance (bytes)',67108864,'type="number" min="1" max="536870912" step="1"')+'</div>'+
  '<p class="hint" id="selection-estimate"></p><button>Save selection</button></form>')+'</section>';
 }else editor='<section class="callout"><h2>Choose a source array</h2><p>Start from the complete native hierarchy. Each saved selection binds the array metadata and exact retained source.</p><button class="secondary" data-go="sources">Open sources</button></section>';
 return editor+(n.selections.length?'<section class="card"><div class="section-heading"><h2>Saved selections</h2><span class="muted">'+n.selections.length+' retained</span></div><div class="table-wrap"><table><thead><tr><th>Selection</th><th>Coordinates</th><th>Cells</th><th>Source</th><th></th></tr></thead><tbody>'+n.selections.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><small>'+esc(short(x.id))+'</small></td><td><code>'+esc(JSON.stringify(x.axes))+'</code></td><td>'+count(x.selectedCellCount)+'</td><td>'+esc(short(x.sourceSha256))+'</td><td><button data-run="'+x.id+'">Run selection</button></td></tr>').join('')+'</tbody></table></div></section>':'');
}
function typed(value){
 const v=value??{};let display;
 if(['text','integer','float','boolean'].includes(v.kind))display=String(v.value);
 else if(v.kind==='bytes')display=v.base64+' (base64)';
 else if(['datetime','timedelta'].includes(v.kind))display=v.display+' · ticks '+v.ticks+' · '+v.dtype;
 else if(v.kind==='complex')display=String(v.real?.value)+' + '+String(v.imaginary?.value)+'i';
 else display=JSON.stringify(v);
 return '<span class="typed-kind">'+esc(v.kind??'unknown')+'</span><code class="typed-value">'+esc(display)+'</code>';
}
function results(){
 const n=state.native;if(!n.results.length)return empty('No result has been run','Run one original saved selection. The complete result keeps its typed values and exact source coordinates.');
 if(!original(state.result,n.results))state.result=n.results[0].id;
 const current=original(state.result,n.results),review=latestReview(current.id);
 return '<section class="card"><div class="form-grid"><label>Original retained result<select id="result-select">'+n.results.map(x=>option(x.id,x.title+' · '+x.rowCount+' cells',state.result)).join('')+'</select></label>'+
 '<div class="selection-summary">'+badge(review?.decision??'Awaiting review',review?.decision==='accepted'?'good':'')+'<span>'+esc(current.dtype)+' · shape '+esc(JSON.stringify(current.shape))+'</span></div></div>'+
 '<dl class="inline-details"><dt>Source coordinates</dt><dd>'+esc(current.array||'/')+' in '+esc(JSON.stringify(current.sourceShape))+'</dd><dt>Complete result SHA</dt><dd>'+hashView(current.contentSha256)+'</dd></dl>'+
 '<div id="result-page" aria-live="polite"><p class="muted">Opening the retained result page…</p></div></section>'+
 '<section class="two-column"><article class="card"><h2>Review this exact result</h2><form data-form="review" data-draft="review:'+current.id+'"><label>Decision<select name="decision"><option value="accepted">Accept</option><option value="needs-changes">Needs changes</option><option value="rejected">Reject</option></select></label>'+
 area('comment','Interpretation, checks and limitations','','required maxlength="4000"')+'<button>Record review</button></form>'+
 (review?detail('Latest retained review',review):'')+'</article>'+
 '<article class="card"><h2>Freeze a scalar edition</h2><p>Choose how the reviewed native values are represented in the dataset. Text preserves tagged or precise values; number requires finite safe values.</p>'+
 (review?.decision==='accepted'?'<form data-form="freeze" data-draft="freeze:'+current.id+'">'+field('title','Public source title',current.title,'required maxlength="160"')+
 '<label>Public value type<select name="valueType"><option value="text">Text — preserve precise values and native tags</option><option value="number">Number — finite safe values</option><option value="boolean">Boolean — true / false values only</option></select></label><button>Freeze reviewed edition</button></form>':
 '<p class="callout warning">Record an accepted review of this result before freezing its scalar edition.</p>')+'</article></section>'+
 '<section class="card"><h2>Result and review history</h2>'+detail('Original result identity',current)+n.reviews.filter(x=>x.resultId===current.id).map(x=>'<div class="history-item">'+badge(x.decision,x.decision==='accepted'?'good':'')+' <span>'+esc(date(x.createdAt))+'</span><p>'+esc(x.comment)+'</p>'+hashView(x.id)+'</div>').join('')+'</section>';
}
async function loadResult(epoch){
 const id=state.result,offset=state.offset,limit=state.limit,value=await api('/api/results/'+id+'?offset='+offset+'&limit='+limit);
 if(epoch!==state.epoch||id!==state.result||state.tab!=='results')return;
 const node=$('#result-page');if(!node)return;
 node.innerHTML='<div class="section-heading"><p>'+count(value.total)+' complete cells · rows '+count(value.rows.length?offset+1:0)+'–'+count(offset+value.rows.length)+'</p><div class="button-row">'+
 '<button class="secondary small" data-result-prev '+(offset===0?'disabled':'')+'>Previous</button><button class="secondary small" data-result-next="'+esc(value.next??'')+'" '+(value.next===null?'disabled':'')+'>Next</button></div></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Ordinal</th><th>Source index</th><th>Native value</th></tr></thead><tbody>'+value.rows.map(row=>'<tr><td>'+esc(row.ordinal)+'</td><td><code>'+esc(JSON.stringify(row.sourceIndex))+'</code></td><td>'+typed(row.value)+'</td></tr>').join('')+'</tbody></table></div>'+
 '<p class="hint">Values are displayed from the immutable result. Numeric text is not converted to JavaScript numbers.</p>';
}
function queryDescription(source){const queries=source?.queries;return Array.isArray(queries)?queries.find(x=>x.id==='selected'||x.name==='selected'||x.query==='selected'):queries?.selected;}
function defaultPlan(frozen,publisher){
 const query=queryDescription(publisher.source);const rawTypes=query?.projection??query?.columnTypes??publisher.source?.columnTypes;const types=Array.isArray(rawTypes)?Object.fromEntries(rawTypes.map(x=>[x.name,x])):rawTypes;
 if(!types||typeof types!=='object')throw Error('The original publisher has not returned the selected query column types.');
 const columns={};for(const name of ['row_id','ordinal','source_index','value']){
  const v=types[name],type=typeof v==='string'?v:v?.type;if(!['string','number','boolean'].includes(type))throw Error('The original query did not declare a supported type for '+name);columns[name]={type,nullable:false};
 }
 return {title:frozen.title,query:'selected',input:{},sourceHash:publisher.source.hash,
 dataset:{name:frozen.title,columns,filters:[],ranges:[],sorts:[],maxCellChars:65536,defaultLimit:50,maxLimit:250,maxPageBytes:921600},
 extraction:{order:[{column:'ordinal',direction:'asc'}],maxRows:Math.max(frozen.rowCount,1),maxBytes:67108864}};
}
function publisherPage(){
 const n=state.native;if(!n.frozen.length)return empty('Freeze a reviewed edition first','The publisher reads a complete immutable scalar source from an accepted native result.');
 if(!original(state.frozen,n.frozen))state.frozen=n.frozen[0].id;
 return '<section class="card"><label>Original reviewed scalar edition<select id="frozen-select">'+n.frozen.map(x=>option(x.id,x.title+' · '+x.valueType+' · '+x.rowCount+' rows',state.frozen)).join('')+'</select></label>'+
 '<p class="hint">Each frozen version owns its original publisher and dataset target. The source workspace, publisher history and target versions remain separate original stores.</p></section><div id="publisher-body">'+
 (state.publisherError?'<section class="callout warning"><h2>Publisher could not open</h2><p>'+esc(state.publisherError)+'</p><button data-publisher-refresh>Retry original read</button></section>':'<section class="card"><p class="muted">Opening the original publisher…</p></section>')+'</div>';
}
async function pubRead(action,input={}){return api('/api/publisher',{frozenId:state.frozen,action,input});}
async function publisherWrite(action,input,existing=null){
 const entry=existing??retain({id:uid(),kind:'publisher',state:'PREPARED',createdAt:new Date().toISOString(),request:{frozenId:state.frozen,action,input}});
 entry.request.requestId=entry.id;entry.state='DISPATCHING';retain(entry);
 try{const result=await api('/api/publisher',entry.request);entry.result=result;entry.state='COMPLETE';retain(entry);notice('The original publisher returned '+(result?.state??'its saved result')+'.','success');await renderPage();return result;}
 catch(error){entry.state='RESPONSE_UNCONFIRMED';entry.error={code:error.code,message:error.message};retain(entry);await renderPage();throw error;}
}
async function loadPublisher(epoch){
 const id=state.frozen;
 try{
  const [source,status,target,pending]=await Promise.all([pubRead('source'),pubRead('status',{options:{limit:100,...state.publisherOffsets}}),pubRead('target'),api('/api/publisher-requests')]);
  if(epoch!==state.epoch||id!==state.frozen||state.tab!=='publisher')return;
  state.publisher={source,status,target};state.publisherRequests=pending.requests;state.publisherError=null;
  const frozen=original(id,state.native.frozen);let plan='',planError='';
  try{plan=JSON.stringify(defaultPlan(frozen,state.publisher),null,2);}catch(error){planError=error.message;}
  $('#publisher-body').innerHTML='<section class="metrics">'+[['Plans',status.pages.plans.total],['Runs',status.pages.runs.total],['Target',target.connected?'Running':target.initializable?'New':'Stopped'],['Activity',status.active?.kind??'Idle']].map(([a,b])=>'<article class="metric"><span>'+a+'</span><strong>'+esc(b)+'</strong></article>').join('')+'</section>'+
  (status.active?'<section class="callout"><h3>Original '+esc(status.active.kind)+' is active</h3><p>'+esc(JSON.stringify(status.active.progress))+'</p><button data-publisher-refresh class="secondary">Refresh original progress</button>'+
  (status.active.id?'<button class="danger" data-pub-action="cancel" data-run="'+esc(status.active.id)+'">Cancel this extraction</button>':'')+'</section>':'')+
  '<section class="two-column"><article class="card"><h2>Save an extraction plan</h2><p>The original query supplies the dataset types. Review the full query contract and explicit limits before saving.</p>'+
  (planError?'<p class="callout warning">'+esc(planError)+'</p>':'<form data-form="publisher-plan" data-draft="publisher-plan:'+id+'">'+area('plan','Complete original publisher plan',plan,'required spellcheck="false" class="code-input"')+'<button>Save plan</button></form>')+
  detail('Original source and query declaration',source)+'</article><article class="card"><h2>Target and delivery</h2><p>'+esc(target.connected?'The original dataset target is running. Review the current snapshot and revision before publication.':target.initializable?'The selected target is absent. Its first explicit publication may initialize it.':'The retained target exists. Start its original seller through the dataset deployment workflow before a refresh or buyer handover.')+'</p>'+
  detail('Actual target status',target)+'<p class="hint">Publisher plans, runs and target versions are included in the full product handover. The source-workspace ZIP alone is for array authoring.</p></article></section>'+
  '<section class="card"><div class="section-heading"><h2>Saved extraction plans</h2>'+badge(status.pages.plans.total+' total')+'</div><div class="table-wrap"><table><thead><tr><th>Plan</th><th>Query</th><th>Source SHA</th><th></th></tr></thead><tbody>'+
  status.plans.map(p=>'<tr><td><strong>'+esc(p.data.title)+'</strong><small>Plan '+p.id+'</small></td><td>'+esc(p.data.query)+'</td><td>'+esc(short(p.data.sourceHash))+'</td><td><button data-extract="'+p.id+'">Extract</button></td></tr>').join('')+'</tbody></table></div>'+
  historyPageControls('plans',status.pages.plans)+'</section>'+
  '<section class="card"><div class="section-heading"><h2>Original extraction & publication history</h2>'+badge(status.pages.runs.total+' total')+'</div>'+
  status.runs.map(run=>'<article class="run-card"><div class="section-heading"><div><h3>Plan '+run.plan+' · '+esc(short(run.id))+'</h3><p class="muted">'+esc(date(run.created))+'</p></div>'+badge(run.state,run.state==='PUBLISHED'?'good':'')+'</div>'+
   (run.data.error?'<p class="callout warning">'+esc(run.data.error)+'</p>':'')+
   '<div class="button-row"><button class="secondary" data-pub-inspect="'+run.id+'">Inspect candidate</button>'+
   (['READY','REVIEWED','PUBLISHED','PUBLICATION_UNKNOWN'].includes(run.state)?'<button class="secondary" data-pub-review="'+run.id+'">Review candidate</button>':'')+
   (run.data.review&&['REVIEWED','PUBLICATION_UNKNOWN'].includes(run.state)?'<button data-publish="'+run.id+'" data-review="'+run.data.review.id+'">Publish current review</button>':'')+
   (['INTERRUPTED','FAILED','CANCELLED','PUBLICATION_UNKNOWN','PUBLISHED'].includes(run.state)?'<button class="secondary" data-pub-action="recover" data-run="'+run.id+'">Recover original run</button>':'')+
   (run.state==='PUBLISHED'?'<button class="secondary" data-buyer="'+run.id+'">Buyer handover</button>':'')+'</div>'+detail('Original run, review and publication',run)+'</article>').join('')+historyPageControls('runs',status.pages.runs)+'</section>'+
  publisherPending(pending.requests.filter(x=>x.frozenId===id))+'<section class="card"><h2>Original publisher event history</h2>'+detail('Retained native events',status.history)+historyPageControls('history',status.pages.history)+'</section>';
  restoreDrafts();
 }catch(error){if(epoch!==state.epoch||id!==state.frozen)return;state.publisherError=error.message;$('#publisher-body').innerHTML='<section class="callout warning"><h2>Publisher could not open</h2><p>'+esc(error.message)+'</p><button data-publisher-refresh>Retry original read</button></section>';}
}
function historyPageControls(collection,page){return '<div class="button-row"><span class="muted">Showing '+count(page.offset+1)+'–'+count(Math.min(page.offset+page.limit,page.total))+' of '+count(page.total)+'</span>'+
 (page.previous!==null?'<button class="secondary small" data-pub-page="'+collection+'" data-offset="'+page.previous+'">Previous</button>':'')+
 (page.next!==null?'<button class="secondary small" data-pub-page="'+collection+'" data-offset="'+page.next+'">Next</button>':'')+'</div>';}
function publisherPending(rows){return '<section class="card"><h2>Publisher request receipts</h2>'+(!rows.length?'<p class="muted">No publisher writes have been submitted from this operator.</p>':rows.map(r=>'<article class="history-item"><div class="section-heading"><strong>'+esc(r.action)+'</strong>'+badge(r.state)+'</div>'+hashView(r.requestId)+
 (!['COMPLETE','CLOSED_UNCONFIRMED'].includes(r.state)?'<div class="button-row"><button data-pub-transport="'+r.requestId+'">Continue same request</button><button class="secondary" data-pub-close="'+r.requestId+'">Close unknown response</button></div>':'')+detail('Exact retained publisher input',r.input)+'</article>').join(''))+'</section>';}
function transfers(){
 const inputs=state.session.connections.inputs.filter(x=>x.kind==='packet'),destinations=state.session.connections.destinations;
 return '<section class="two-column"><article class="card"><p class="eyebrow">SOURCE AUTHORING</p><h2>Export the complete workspace</h2><p>The original packet includes complete retained stores, selections, typed results, reviews, frozen source editions and operation history. It can reopen independently with the same workspace UUID and revision.</p>'+
 '<p class="callout">Publisher and dataset target stores belong to the separate full merchant handover. This source packet does not claim to contain those stores or a deployed service.</p><button data-export>Prepare source workspace ZIP</button></article>'+
 '<article class="card"><h2>Receive a declared packet</h2><p>Receive into a new directory under an explicitly declared destination. The original archive verifier owns the complete file and database checks.</p>'+
 (inputs.length&&destinations.length?'<form data-form="receive" data-draft="receive"><label>Declared complete packet<select name="inputId">'+inputs.map(x=>option(x.id,x.title+' · '+short(x.sha256))).join('')+'</select></label><label>Separate receiving root<select name="destinationId">'+destinations.map(x=>option(x.id,x.title)).join('')+'</select></label><button>Receive original workspace</button></form>':'<p class="muted">Declare a complete packet and a separate destination in the host connection file to enable receiving.</p>')+'</article></section>'+
 '<section class="card"><h2>Complete prepared downloads</h2><div id="files"><p class="muted">Reading retained exports…</p></div></section>'+
 '<section class="card"><h2>Transfer requests</h2>'+state.local.filter(x=>['export','receive'].includes(x.kind)).map(x=>'<article class="history-item"><strong>'+esc(x.kind)+'</strong> '+badge(x.state)+hashView(x.id)+
 (x.state!=='COMPLETE'?'<button data-replay="'+x.id+'">Continue same request</button>':'')+(x.result?detail('Original transfer result',x.result):'')+'</article>').join('')+'</section>';
}
async function loadFiles(epoch){const result=await api('/api/files');if(epoch!==state.epoch||state.tab!=='transfer')return;state.files=result.files;
 $('#files').innerHTML=result.files.length?'<div class="table-wrap"><table><thead><tr><th>Complete file</th><th>Bytes</th><th>SHA-256</th><th></th></tr></thead><tbody>'+result.files.map(f=>'<tr><td>'+esc(f.name)+'</td><td>'+bytes(f.bytes)+'</td><td>'+hashView(f.sha256)+'</td><td><button data-download="'+f.id+'">Download verified ZIP</button></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No source workspace ZIP has been prepared here yet.</p>';}
async function exportWorkspace(existing=null){const entry=existing??retain({id:uid(),kind:'export',state:'PREPARED',createdAt:new Date().toISOString()});entry.state='DISPATCHING';retain(entry);
 try{entry.result=await api('/api/export',{id:entry.id});entry.state='COMPLETE';retain(entry);notice('The complete source workspace ZIP is retained.','success');await renderPage();return entry.result;}catch(error){entry.state='RESPONSE_UNCONFIRMED';entry.error={message:error.message,code:error.code};retain(entry);throw error;}}
async function receiveWorkspace(existing){const entry=existing;entry.state='DISPATCHING';retain(entry);
 try{entry.result=await api('/api/receive',entry.request);entry.state='COMPLETE';retain(entry);notice('The original packet received and reopened independently.','success');await renderPage();return entry.result;}catch(error){entry.state='RESPONSE_UNCONFIRMED';entry.error={message:error.message,code:error.code};retain(entry);throw error;}}
async function download(id){
 const f=state.files.find(x=>x.id===id);if(!f)throw Error('Refresh the complete retained file list.');
 const response=await fetch('/api/files/'+id,{headers:{authorization:'Bearer '+token}});if(!response.ok){const v=await response.json();throw Error(v.message);}
 const raw=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(raw.byteLength!==f.bytes||digest!==f.sha256)throw Error('The full download bytes do not match the original retained ZIP.');
 const url=URL.createObjectURL(new Blob([raw],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 notice('Downloaded '+f.name+' after checking every byte against its original SHA-256.','success');
}
function operations(){const n=state.native;
 return '<section class="card"><h2>Inspect an original request</h2><form data-form="lookup" class="inline-form">'+field('id','Operation UUID','','required pattern="[a-f0-9-]{36}"')+'<button>Inspect</button></form><p class="hint">The native status lists its latest 100 operations. Exact UUID lookup reopens an older request without changing it.</p><div id="operation-lookup"></div></section>'+
 '<section class="card"><h2>Browser-retained requests</h2>'+(!state.local.length?'<p class="muted">This browser has no retained action requests.</p>':state.local.slice().reverse().map(x=>'<article class="history-item"><div class="section-heading"><strong>'+esc(x.action??x.request?.action??x.kind)+'</strong>'+badge(x.state,x.state==='COMPLETE'?'good':'')+'</div>'+hashView(x.id)+
 (!['COMPLETE','ABANDONED'].includes(x.state)?'<button data-replay="'+x.id+'">Continue exact request</button>':'')+
 (x.state==='PREPARE_FAILED'?'<button class="secondary" data-close-preparation="'+x.id+'">Close unsent preparation</button>':'')+
 detail('Retained intent and response',x)+'</article>').join(''))+'</section>'+
 '<section class="card"><h2>Original native history</h2>'+n.operations.map(operationRow).join('')+'</section>';
}
function operationRow(x){return '<article class="history-item"><div class="section-heading"><strong>'+esc(x.request?.action??'Original operation')+'</strong>'+badge(x.state,x.state==='COMPLETE'?'good':'')+'</div>'+hashView(x.id)+
 '<p class="muted">'+esc(date(x.created))+' · admitted revision '+esc(x.admitted_revision)+'</p>'+
 (['RUNNING','INTERRUPTED'].includes(x.state)?'<div class="button-row"><button data-resume="'+x.id+'">Resume same operation</button><button class="secondary" data-abandon="'+x.id+'">Close interrupted operation</button></div>':'')+
 detail('Complete original request, result and error',x)+'</article>';}
async function renderPage(){
 if(!state.native)return;captureDrafts();const epoch=++state.epoch;$('#page-title').textContent=titles[state.tab];for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false');}
 const renderers={overview,sources,selections,results,publisher:publisherPage,transfer:transfers,operations};$('#main').innerHTML=renderers[state.tab]();restoreDrafts();$('#main').setAttribute('aria-busy',state.busy?'true':'false');
 if(state.tab==='results')await loadResult(epoch);
 if(state.tab==='publisher')await loadPublisher(epoch);
 if(state.tab==='transfer')await loadFiles(epoch);
 if(state.tab==='selections')selectionEstimate();
 persist();
}
function selectionInput(form){
 const {source,array}=selectedArray();if(!array||!source)throw Error('Choose the original source array.');
 const f=new FormData(form),axes=array.shape.map((length,i)=>{
  if(!Number.isSafeInteger(length))throw Error('Array geometry exceeds exact browser integer precision.');
  const start=number(f.get('start-'+i),'Axis '+i+' start');
  if(f.get('mode-'+i)==='index'){if(start>=length)throw Error('Index is outside source axis '+i);return start;}
  const stop=number(f.get('stop-'+i),'Axis '+i+' stop'),step=number(f.get('step-'+i),'Axis '+i+' step',{min:1});
  if(start>stop||stop>length)throw Error('Slice is outside source axis '+i);return {start,stop,step};
 });
 return {sourceId:source.id,array:array.path,title:String(f.get('title')),axes,maxCells:number(f.get('maxCells'),'Cell allowance',{min:1,max:1000000}),maxNativeBytes:number(f.get('maxNativeBytes'),'Native memory allowance',{min:1,max:536870912})};
}
function selectionEstimate(){const form=$('form[data-form="selection"]'),out=$('#selection-estimate');if(!form||!out)return;try{const v=selectionInput(form);let cells=1n;for(const x of v.axes)if(typeof x!=='number')cells*=BigInt(Math.ceil((x.stop-x.start)/x.step));out.textContent=cells.toLocaleString()+' selected cells; original source coordinates remain attached to every value.';}catch(error){out.textContent=error.message;}}
async function dialog(title,html,onSubmit,{button='Continue'}={}){
 const d=$('#dialog'),form=$('form',d);$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$('#dialog-submit').textContent=button;
 const prior=form.onsubmit;form.onsubmit=event=>{
  if(event.submitter?.value==='cancel')return;event.preventDefault();if(form.dataset.submitting==='true')return;form.dataset.submitting='true';const submit=$('#dialog-submit');submit.disabled=true;void task(async()=>{const value=new FormData(form);const result=await onSubmit(value);if(result!==false)d.close();}).catch(()=>{}).finally(()=>{form.dataset.submitting='false';submit.disabled=false;});
 };d.addEventListener('close',()=>{form.onsubmit=prior;},{once:true});d.showModal();
}
document.addEventListener('input',event=>{if(event.target.closest('form[data-draft]'))captureDrafts();if(event.target.closest('form[data-form="selection"]'))selectionEstimate();});
document.addEventListener('change',event=>{
 if(event.target.id==='result-select'){captureDrafts();state.result=event.target.value;state.offset=0;void task(renderPage).catch(()=>{});}
 if(event.target.id==='frozen-select'){captureDrafts();state.frozen=event.target.value;state.publisher=null;state.publisherError=null;state.publisherOffsets={};void task(renderPage).catch(()=>{});}
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!form.dataset.form)return;event.preventDefault();if(form.dataset.submitting==='true')return;form.dataset.submitting='true';const submit=event.submitter;if(submit)submit.disabled=true;captureDrafts();const f=new FormData(form);
 void task(async()=>{
  switch(form.dataset.form){
   case 'import':return nativeAction('import',{inputId:String(f.get('inputId')),title:String(f.get('title'))});
   case 'selection':return nativeAction('selection',selectionInput(form));
   case 'review':{const r=original(state.result,state.native.results);return nativeAction('review',{resultId:r.id,contentSha256:r.contentSha256,decision:String(f.get('decision')),comment:String(f.get('comment'))});}
   case 'freeze':{const r=original(state.result,state.native.results),review=latestReview(r.id);const result=await nativeAction('freeze',{resultId:r.id,reviewId:review.id,title:String(f.get('title')),valueType:String(f.get('valueType'))});state.frozen=result.item.id;return;}
   case 'publisher-plan':return publisherWrite('save-plan',{plan:JSON.parse(String(f.get('plan')))});
   case 'receive':{const id=uid();return receiveWorkspace(retain({id,kind:'receive',state:'PREPARED',createdAt:new Date().toISOString(),request:{id,inputId:String(f.get('inputId')),destinationId:String(f.get('destinationId'))}}));}
   case 'lookup':{const id=String(f.get('id')).trim(),result=await api('/api/operations/'+encodeURIComponent(id));$('#operation-lookup').innerHTML=operationRow(result);return;}
  }
 }).catch(()=>{}).finally(()=>{form.dataset.submitting='false';if(submit)submit.disabled=false;});
});
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.tab||b.dataset.go){captureDrafts();state.tab=b.dataset.tab??b.dataset.go;void task(renderPage).catch(()=>{});return;}
 if(b.id==='refresh'){void task(()=>refresh()).catch(()=>{});return;}
 void task(async()=>{
  if(b.hasAttribute('data-select-array')){captureDrafts();state.source=b.dataset.source;state.array=b.dataset.selectArray;state.tab='selections';return renderPage();}
  if(b.dataset.run&&!b.dataset.pubAction)return dialog('Run this saved selection?','<p>The original engine will read the retained source cells for this selection and retain a new complete typed result.</p>'+hashView(b.dataset.run),()=>nativeAction('run',{selectionId:b.dataset.run}),{button:'Run original selection'});
  if(b.hasAttribute('data-result-prev')){state.offset=Math.max(0,state.offset-state.limit);return renderPage();}
  if(b.hasAttribute('data-result-next')){state.offset=number(b.dataset.resultNext,'Result offset');return renderPage();}
  if(b.dataset.resume)return nativeResume(b.dataset.resume);
  if(b.dataset.replay)return replayLocal(b.dataset.replay);
  if(b.dataset.closePreparation){const x=state.local.find(x=>x.id===b.dataset.closePreparation);if(x.state!=='PREPARE_FAILED'||x.prepared)throw Error('Only an unsent failed preparation can be closed locally.');x.state='NOT_DISPATCHED';retain(x);return renderPage();}
  if(b.dataset.abandon)return dialog('Close this interrupted original operation',area('reason','Why this operation will not be resumed','','required maxlength="4000"')+'<p>The native engine preserves the request and all retained partial material. It will refuse closure while its writer lease is still held.</p>',f=>nativeAction('abandon',{operationId:b.dataset.abandon,reason:String(f.get('reason'))}),{button:'Record original closure'});
  if(b.hasAttribute('data-export'))return exportWorkspace();
  if(b.dataset.download)return download(b.dataset.download);
  if(b.hasAttribute('data-publisher-refresh'))return renderPage();
  if(b.dataset.extract)return dialog('Extract the retained scalar source','<p>This creates one original extraction run for saved plan '+esc(b.dataset.extract)+'. Its run UUID is retained before dispatch.</p>',()=>publisherWrite('extract',{planId:Number(b.dataset.extract),runId:uid()}),{button:'Start extraction'});
  if(b.dataset.pubAction)return publisherWrite(b.dataset.pubAction,{runId:b.dataset.run});
  if(b.dataset.pubInspect){const selected=b.dataset.pubInspect;return dialog('Inspect original candidate',field('query','Candidate query','limit=50')+'<div id="candidate-preview"></div>',async f=>{const r=await pubRead('inspect',{runId:selected,query:String(f.get('query'))});$('#candidate-preview').innerHTML=detail('Complete candidate response',r);return false;},{button:'Read candidate'});}
  if(b.dataset.pubReview){const target=await pubRead('target'),runId=b.dataset.pubReview;return dialog('Review this candidate against the actual target',field('reviewer','Reviewer','','required maxlength="128"')+area('note','Review note','','required maxlength="2000"')+detail('Exact target binding',target),f=>publisherWrite('review',{runId,review:{reviewer:String(f.get('reviewer')),note:String(f.get('note')),...(target.initializable?{initialize:true}:{expectedSnapshot:target.versions?.current,expectedRevision:target.versions?.revision})}}),{button:'Record candidate review'});}
  if(b.dataset.publish)return dialog('Publish the reviewed candidate','<p>Publication uses the original review below and the target revision it binds. The original engine owns initialization or version refresh.</p>'+hashView(b.dataset.review),()=>publisherWrite('publish',{runId:b.dataset.publish,reviewId:b.dataset.review}),{button:'Publish reviewed version'});
  if(b.dataset.pubTransport){const result=await api('/api/publisher-request/recover',{requestId:b.dataset.pubTransport});notice('The original publisher request returned its retained result.','success');return renderPage();}
  if(b.dataset.pubClose)return dialog('Close an unknown publisher response',area('reason','Reason and original history reviewed','','required maxlength="4000"')+'<p>This closes only the transport uncertainty after the original publisher is inactive. Native plans, runs, review and publication history stay intact.</p>',async f=>{await api('/api/publisher-request/close',{requestId:b.dataset.pubClose,reason:String(f.get('reason'))});return renderPage();},{button:'Retain explicit closure'});
  if(b.dataset.pubPage){state.publisherOffsets[b.dataset.pubPage+'Offset']=Number(b.dataset.offset);return renderPage();}
  if(b.dataset.buyer){
   const runId=b.dataset.buyer,offer=await pubRead('buyer-offer',{runId,query:''});
   return dialog('Prepare an original buyer handover',
    '<p>Review the current advertised payment alternative. Preparing this configuration does not make a purchase.</p>'+
    field('intentId','Unique original buyer intent',uid(),'required maxlength="160"')+
    '<label>Advertised payment alternative<select name="acceptIndex">'+offer.accepts.map((x,i)=>option(String(i),JSON.stringify(x))).join('')+'</select></label>'+
    '<p>Reviewed offer SHA</p>'+hashView(offer.offerSha256)+detail('Complete original offer',offer),
    f=>publisherWrite('prepare-buyer',{runId,buyer:{query:'',intentId:String(f.get('intentId')),acceptIndex:number(f.get('acceptIndex'),'Payment alternative',{max:offer.accepts.length-1}),offerSha256:offer.offerSha256}}),
    {button:'Prepare original buyer configuration'});
  }
 }).catch(()=>{});
});
async function main(){
 try{
  if(!token)throw Error('Open the private URL printed by zarr-workspace serve or by its original Applications entry.');
  state.session=await api('/api/session');storeKey='zarr-ui:'+state.session.workspaceId;
  const old=JSON.parse(localStorage.getItem(storeKey)||'null');if(old){state.drafts=old.drafts??{};state.local=old.local??[];for(const k of ['source','array','result','frozen'])state[k]=old[k]??null;}
  $('#connection-label').textContent='Connected to original workspace';$('#connection-signal').classList.add('connected');
  await refresh();
 }catch(error){$('#connection-label').textContent='Private connection required';$('#main').innerHTML=empty('Open the original operator',error.message);fail(error);}
}
void main();
