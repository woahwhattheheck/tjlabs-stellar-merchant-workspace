// MIT. Original project browser; every mutation joins the one native operation.
import {hashFile} from './sha256.js';
import {canonical, Epoch, JobJournal, DraftSession} from './recovery.js';
const $=id=>document.getElementById(id), el=(name,text,cls)=>{const node=document.createElement(name);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const state={project:null,editions:[],artifacts:[],edition:'',baseline:'',page:0,pageSize:30,node:null,selected:new Set(),decisions:{},review:null,reviews:[],comparison:null,editors:{}};
let messageTimer, draftTimer, draft, journal, storage, draftKey, recoveryReady=false, restoring=false;
const resourceEpoch=new Epoch(), nodeEpoch=new Epoch(), comparisonEpoch=new Epoch(), refreshEpoch=new Epoch();

function say(message){$('message').textContent=message;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>{$('message').hidden=true;},9000);}
function guard(fn){return async event=>{try{return await fn(event);}catch(error){say(error.message||String(error));console.error(error.code||'Operation failed');}};}
async function request(path,body,method='POST'){const response=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message||value.error),{code:value.error});return value;}
const read=(action,input={})=>request('/api/read',{action,input});
function newId(){return crypto.randomUUID();}
function button(text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.addEventListener('click',guard(fn));return b;}
function option(value,label){const item=el('option',label);item.value=value;return item;}
function replaceOptions(select,rows,empty){select.replaceChildren();if(empty)select.append(option('',empty));for(const row of rows)select.append(option(row.id,row.title||`${row.name} · ${row.kind} v${row.version} · ${row.id.slice(0,8)}`));}
function tab(name){scheduleDraft();document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-current',x.dataset.tab===name?'page':'false'));document.querySelectorAll('[data-page]').forEach(x=>x.hidden=x.dataset.page!==name);if(name==='review')renderSelection();}
function neededEdition(){if(!state.edition)throw Error('Create or select an original project edition first.');return state.edition;}
function neededNode(){neededEdition();if(!state.node)throw Error('Select the original resource in the Resources section first.');return state.node.uid;}
async function job(action,input={},id){
 if(!journal)throw Error('Open the original project before starting an operation.');
 return journal.run(action,input,id);
}

function download(descriptor,name){const a=el('a',name||descriptor.name||'Complete file');a.href=`/api/objects/${descriptor.sha256}?name=${encodeURIComponent(name||descriptor.name||'dbt-output.bin')}`;a.download=name||descriptor.name||'dbt-output.bin';return a;}
async function downloadReport(format){await finalizeReviewForOutput();const result=await job('report',{edition:neededEdition(),format,...(state.review?{review:state.review.id}:{})});const a=download(result,`dbt-project.${format}`);document.body.append(a);a.click();a.remove();}
async function upload(file,progress=$('upload-progress')){
 if(!file)throw Error('Select a complete original file.');
 const digest=await hashFile(file,(at,total)=>{progress.textContent=`Hashing ${file.name} · ${total?Math.round(100*at/total):100}%`;});
 // Digest + name + byte length identifies the original reusable browser upload.
 const key='dbt-upload:'+state.project.id+':'+digest+':'+file.name;
 let id=sessionStorage.getItem(key);if(!id){id=newId();sessionStorage.setItem(key,id);}
 let record=await request('/api/uploads/start',{id,name:file.name,bytes:file.size,expected_sha:digest});
 while(record.state!=='complete'){
  const at=record.offset,end=Math.min(file.size,at+4*1024*1024);
  const response=await fetch(`/api/uploads/${id}?offset=${at}`,{method:'PUT',body:file.slice(at,end),headers:{'Content-Type':'application/octet-stream'},credentials:'same-origin'});
  const value=await response.json();if(!response.ok)throw Error(value.message||value.error);record=value;
  progress.textContent=`Retaining ${file.name} · ${file.size?Math.round(record.offset/file.size*100):100}%`;
 }
 progress.textContent=`Retained ${file.name} · ${file.size.toLocaleString()} bytes · ${digest.slice(0,12)}`;
 return record.object;
}
async function refresh(){
 const ticket=refreshEpoch.next();
 const [project,editions,artifacts,reviews]=await Promise.all([read('status'),read('editions'),read('artifacts'),read('reviews')]);
 if(!refreshEpoch.current(ticket))return;
 Object.assign(state,{project,editions,artifacts,reviews});
 const restored=await initializeRecovery();
 if(!refreshEpoch.current(ticket))return;

 $('login').hidden=true;$('workspace').hidden=false;$('project-title').textContent=project.title;$('project-id').textContent=project.id;
 $('owner-state').textContent='Original project · local owner';
 $('counts').textContent=`${project.counts.artifacts} artifacts · ${project.counts.editions} editions · ${project.counts.reviews} review revisions`;
 replaceOptions($('edition'),editions,'Select an edition');replaceOptions($('baseline'),editions,'No baseline');
 if(!editions.some(e=>e.id===state.edition))state.edition=editions[0]?.id||'';
 $('edition').value=state.edition;$('baseline').value=state.baseline;
 replaceOptions($('saved-review'),reviews.map(r=>({id:r.id,title:`${r.name} · revision ${r.revision}`})),'New review');
 if(state.review)$('saved-review').value=state.review.id;
 renderArtifacts();renderContext();renderSelection();await resources();
 if(restored?.node){await showNode(restored.node);restoreEditor(restored.editor);}
 if(!state.edition)tab('intake');
 restoring=false;scheduleDraft();
}
function renderContext(){const ed=state.editions.find(x=>x.id===state.edition),warnings=ed?.context?.warnings||[];$('context-warning').textContent=warnings.join(' ');$('context-warning').hidden=!warnings.length;}
function renderArtifacts(){
 $('artifact-list').replaceChildren();
 for(const a of state.artifacts){const card=el('div',undefined,'card');card.append(el('strong',a.name),el('p',`${a.kind} v${a.version??'?'} · ${a.bytes.toLocaleString()} bytes · ${a.node_count} indexed entries`, 'subdued'));
 card.append(el('p',a.metadata.invocation_id||'Invocation not declared','mono break'),download({sha256:a.id},a.name));if(a.warnings.length)card.append(el('p',a.warnings.join(' '),'subdued'));$('artifact-list').append(card);}
 replaceOptions($('manifest-select'),state.artifacts.filter(a=>a.supported&&a.kind==='manifest'));
 replaceOptions($('catalog-select'),state.artifacts.filter(a=>a.supported&&a.kind==='catalog'),'No catalog selected');
 for(const [id,kinds]of [['runs-select',['run-results']],['freshness-select',['sources','freshness']]]){
  $(id).replaceChildren();for(const a of state.artifacts.filter(a=>a.supported&&kinds.includes(a.kind))){const label=el('label');const check=el('input');check.type='checkbox';check.value=a.id;label.append(check,document.createTextNode(`${a.name} · ${a.metadata.invocation_id||a.id.slice(0,10)}`));$(id).append(label);}
 }
}
async function resources(){
 const ticket=resourceEpoch.next(),edition=state.edition;
 $('resource-rows').replaceChildren();if(!state.edition){$('page-status').textContent='No edition selected';return;}
 const page=await read('nodes',{edition:state.edition,q:$('query').value,type:$('type').value,offset:state.page*state.pageSize,limit:state.pageSize});
 if(!resourceEpoch.current(ticket)||edition!==state.edition)return;
 for(const item of page.items){const tr=el('tr');if(state.node?.uid===item.uid)tr.classList.add('selected-row');const cell=el('td',undefined,'check'),check=el('input');check.type='checkbox';check.checked=state.selected.has(item.uid);check.setAttribute('aria-label','Select '+item.name);check.addEventListener('change',()=>{check.checked?state.selected.add(item.uid):state.selected.delete(item.uid);renderSelection();});cell.append(check);
  const main=el('td');main.append(button(item.name,()=>showNode(item.uid),'row-link'),el('span',item.uid,'row-id'));tr.append(cell,main,el('td',item.type));$('resource-rows').append(tr);}
 $('page-status').textContent=page.total?`${page.offset+1}–${page.offset+page.items.length} of ${page.total}`:'No matching resources';$('previous').disabled=state.page===0;$('next').disabled=page.next_offset===null;
}
function renderSelection(){
 $('selection-count').textContent=`${state.selected.size} selected`;$('selected-resources').replaceChildren();
 for(const uid of state.selected){const row=el('div');row.append(el('span',uid,'mono'),document.createTextNode(' '),button('Remove',()=>{state.selected.delete(uid);renderSelection();return resources();}));$('selected-resources').append(row);}
 $('select-current').textContent=state.node&&state.selected.has(state.node.uid)?'Remove from delivery':'Select for delivery';
 $('binding-resource').textContent=state.node?.uid||'Select a resource first.';
 scheduleDraft();
}
async function showNode(uid){
 if(state.node)state.editors[state.node.uid]={status:$('decision').value,note:$('decision-note').value,proposed_code:$('proposed-code').value};
 const ticket=nodeEpoch.next(),edition=neededEdition();
 const node=await read('node',{edition,uid});if(!nodeEpoch.current(ticket)||edition!==state.edition)return;state.node=node;
 $('detail-empty').hidden=true;$('detail').hidden=false;$('node-kind').textContent=node.type.toUpperCase();$('node-name').textContent=node.name;$('node-id').textContent=node.uid;
 $('node-description').textContent=node.description;$('node-relation').textContent=[node.database_name,node.schema_name,node.relation_name].filter(Boolean).join(' / ');
 $('raw-code').textContent=node.raw_code??'No raw code in this artifact.';$('compiled-code').textContent=node.compiled_code??'This artifact does not contain compiled code for this resource.';$('source-json').textContent=node.source_json;$('catalog-json').textContent=node.catalog?.source_json||'No joined catalog observation.';
 // Column names/type/descriptions are strings. Arbitrary adapter numbers are
 // displayed only in original source_json text, never reserialized from Number.
 const record=JSON.parse(node.source_json),catalog=node.catalog?JSON.parse(node.catalog.source_json):null;
 const names=new Set([...Object.keys(record.columns||{}),...Object.keys(catalog?.columns||{})]);$('columns').replaceChildren();
 for(const name of names){const declared=record.columns?.[name]||{},observed=catalog?.columns?.[name]||{},tr=el('tr');tr.append(el('td',name,'mono'),el('td',observed.type||declared.data_type||'Not declared'),el('td',declared.description||observed.comment||''));$('columns').append(tr);}
 if(!names.size){const tr=el('tr'),td=el('td','No column definitions in selected artifacts.');td.colSpan=3;tr.append(td);$('columns').append(tr);}
 $('outcomes').replaceChildren();for(const outcome of node.outcomes){const card=el('div',undefined,'card');card.append(el('span',outcome.status,'badge'),el('span',outcome.kind,'badge'),el('p',`${outcome.metadata.invocation_id||'Invocation not declared'} · ${outcome.metadata.generated_at||''}`,'mono break'),el('pre',outcome.source_json));$('outcomes').append(card);}
 if(!node.outcomes.length)$('outcomes').append(el('p','No execution or freshness outcome is present in the selected artifact set.','subdued'));
 $('result-bindings').replaceChildren();for(const r of node.results){const card=el('div',undefined,'card');card.append(el('strong',r.source_kind),el('p',r.original_request_id,'mono break'),download(r.file,r.file.name),document.createTextNode(' · '),download(r.query,r.query.name),document.createTextNode(' · '),download(r.provenance,r.provenance.name));$('result-bindings').append(card);}
 const d=state.decisions[uid]||{};$('decision').value=d.status||'';$('decision-note').value=d.note||'';$('proposed-code').value=d.proposed_code||'';if(state.editors[uid])restoreEditor(state.editors[uid]);renderSelection();await resources();
}
async function showLineage(){const result=await read('lineage',{edition:neededEdition(),ids:[neededNode()],direction:'both'});$('lineage-panel').hidden=false;$('lineage-count').textContent=`${result.nodes.length} related resources · ${result.edges.length} original dependency links`;$('lineage-rows').replaceChildren();for(const edge of result.edges){const tr=el('tr');tr.append(el('td',edge.parent,'mono'),el('td',edge.child,'mono'));$('lineage-rows').append(tr);}$('lineage-missing').textContent=result.missing.length?'Referenced IDs absent from selected manifest: '+result.missing.join(', '):'All referenced resources have bodies in this manifest.';$('lineage-panel').scrollIntoView({behavior:'smooth'});}
async function compare(){const ticket=comparisonEpoch.next(),baseline=state.baseline,edition=state.edition;if(!state.baseline)throw Error('Select a comparison baseline first.');const result=await read('compare',{before:state.baseline,after:neededEdition()});if(!comparisonEpoch.current(ticket)||baseline!==state.baseline||edition!==state.edition)return;state.comparison=result;$('change-summary').replaceChildren();for(const [key,count]of Object.entries(result.counts)){const metric=el('div',undefined,'metric');metric.append(el('strong',String(count)),el('span',key));$('change-summary').append(metric);}$('affected-count').textContent=`${result.affected.length} structurally affected resources`;$('select-affected').disabled=false;$('change-rows').replaceChildren();for(const change of result.changes){const tr=el('tr'),first=el('td');first.append(el('strong',change.name),el('span',change.uid,'row-id'));const dimensions=['definition','compiled','catalog','outcomes','lineage'].filter(x=>change[x+'_changed']);tr.append(first,el('td',change.kind),el('td',dimensions.join(', ')));$('change-rows').append(tr);}}
async function loadReview(id){
 await saveDraft();await draft.fork();rememberDraft();
 state.editors={};state.node=null;state.comparison=null;nodeEpoch.invalidate();comparisonEpoch.invalidate();
 $('detail').hidden=true;$('detail-empty').hidden=false;$('select-affected').disabled=true;
 restoreEditor({status:'',note:'',proposed_code:''});
 state.review=id?await read('review',{id}):null;const r=state.review;
 if(r){state.edition=r.edition;state.baseline=r.baseline||'';state.selected=new Set(r.selection);state.decisions=structuredClone(r.decisions);$('review-name').value=r.name;$('reviewer').value=r.reviewer;$('review-note').value=r.note;}
 else{state.selected=new Set();state.decisions={};$('review-name').value='';$('review-note').value='';}
 $('review-revision').textContent=r?`Reopened revision ${r.revision} · next save uses a checked revision`:'New review · revision 1';await refresh();renderSelection();
}
async function jobs(){renderPending();const records=await request('/api/jobs',undefined,'GET');$('job-list').replaceChildren();for(const r of records){const card=el('div',undefined,'card');card.append(el('strong',r.action),document.createTextNode(' '),el('span',r.state,'badge'),el('p',r.id,'mono'),el('p',r.updated_at||r.created_at,'subdued'));if(r.error)card.append(el('p',r.error.message));if(['failed','interrupted','cancelled'].includes(r.state))card.append(button('Resume same operation',async()=>{await job(r.action,r.input,r.id);await refresh();await jobs();}));if(['running','queued'].includes(r.state))card.append(button('Request cancellation',async()=>{await request(`/api/jobs/${r.id}/cancel`,{});await jobs();}));if(r.result?.sha256)card.append(document.createTextNode(' '),download(r.result, r.action==='export'?'dbt-project.zip':r.result.name));const detail=el('details');detail.append(el('summary','Complete operation record'),el('pre',JSON.stringify(r,null,2)));card.append(detail);$('job-list').append(card);}if(!records.length)$('job-list').append(el('p','No browser operations yet.'))}
$('login-form').addEventListener('submit',guard(async e=>{e.preventDefault();await request('/api/session',{token:$('token').value});$('token').value='';await refresh();}));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',guard(async()=>{tab(b.dataset.tab);if(b.dataset.tab==='operations')await jobs();})));
$('refresh').addEventListener('click',guard(refresh));$('edition').addEventListener('change',guard(()=>switchEdition($('edition').value)));$('baseline').addEventListener('change',()=>{state.baseline=$('baseline').value;comparisonEpoch.invalidate();state.comparison=null;$('select-affected').disabled=true;});
$('search-form').addEventListener('submit',guard(async e=>{e.preventDefault();state.page=0;await resources();}));$('previous').addEventListener('click',guard(async()=>{state.page--;await resources();scheduleDraft();}));$('next').addEventListener('click',guard(async()=>{state.page++;await resources();scheduleDraft();}));
$('select-current').addEventListener('click',guard(async()=>{const uid=neededNode();state.selected.has(uid)?state.selected.delete(uid):state.selected.add(uid);renderSelection();await resources();}));$('lineage-current').addEventListener('click',guard(showLineage));$('hide-lineage').addEventListener('click',()=>{$('lineage-panel').hidden=true;});$('apply-decision').addEventListener('click',guard(()=>{const uid=neededNode(),status=$('decision').value;if(!status)delete state.decisions[uid];else{state.decisions[uid]={status,note:$('decision-note').value};if($('proposed-code').value)state.decisions[uid].proposed_code=$('proposed-code').value;}scheduleDraft();say('Decision retained in the working copy. Save a named review revision to include it in a delivery.');}));
$('artifact-files').addEventListener('change',guard(async()=>{for(const file of $('artifact-files').files){const object=await upload(file);await job('import',{sha256:object.sha256,name:file.name});}await refresh();say('Original artifacts imported. Bind the selected files into an edition.');}));
$('edition-form').addEventListener('submit',guard(async e=>{e.preventDefault();const checked=id=>Array.from($(id).querySelectorAll('input:checked'),x=>x.value);const result=await job('edition.create',{title:$('edition-title').value,manifest:$('manifest-select').value,catalog:$('catalog-select').value||null,runs:checked('runs-select'),freshness:checked('freshness-select')});await switchEdition(result.id);await refresh();tab('resources');say('Edition created with original invocation identities.');}));
$('compare').addEventListener('click',guard(compare));$('select-affected').addEventListener('click',guard(()=>{if(!state.comparison)throw Error('Run comparison first.');state.comparison.affected.forEach(x=>state.selected.add(x));renderSelection();say(`Selected ${state.selected.size} affected resources.`);}));
$('saved-review').addEventListener('change',guard(()=>loadReview($('saved-review').value)));
$('review-form').addEventListener('submit',guard(async e=>{e.preventDefault();await saveCurrentReview();}));

document.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',guard(()=>downloadReport(b.dataset.report))));
$('export-project').addEventListener('click',guard(async()=>{await finalizeReviewForOutput();const result=await job('export');$('export-result').replaceChildren(el('p',`${result.bytes.toLocaleString()} bytes · SHA-256 ${result.sha256}`,'mono break'),download(result,'dbt-project.zip'));say('Complete editable project export is ready.');}));
$('receive-file').addEventListener('change',guard(async()=>{const name=$('receive-name').value;if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name))throw Error('Use a new receiving name with letters, digits, hyphens or underscores.');const object=await upload($('receive-file').files[0],$('receive-result'));const result=await job('receive',{sha256:object.sha256,name});$('receive-result').replaceChildren(document.createTextNode(`Received ${result.editions} editions and ${result.reviews} review revisions. ${result.path}`),document.createTextNode(' '),button('Open editable received project',async()=>{const opened=await request('/api/received/open',{name});const link=el('a','Enter editable received project');link.href=opened.url;link.target='_blank';link.rel='noopener';$('receive-result').append(document.createTextNode(' '),link);say('Received project is running. Use its new link to enter.');}));}));
$('result-form').addEventListener('submit',guard(async e=>{e.preventDefault();const uid=neededNode(),result=await upload($('result-file').files[0]),query=await upload($('result-query').files[0]),provenance=await upload($('result-provenance').files[0]);await job('result.bind',{edition:state.edition,uid,file:result.sha256,query_file:query.sha256,provenance_file:provenance.sha256,expected_sha:result.sha256,source_kind:$('result-kind').value,original_request_id:$('result-request').value});say('Exact result, query and provenance are bound to the selected resource.');await showNode(uid);await refresh();}));$('refresh-jobs').addEventListener('click',guard(jobs));

function context(){
 if(state.node)state.editors[state.node.uid]={status:$('decision').value,note:$('decision-note').value,proposed_code:$('proposed-code').value};
 return {edition:state.edition,baseline:state.baseline,review:state.review?{id:state.review.id,name:state.review.name,revision:state.review.revision}:null,
  selection:[...state.selected].sort(),decisions:structuredClone(state.decisions),editors:structuredClone(state.editors),
  form:{name:$('review-name').value,reviewer:$('reviewer').value,note:$('review-note').value},
  node:state.node?.uid||'',editor:{status:$('decision').value,note:$('decision-note').value,proposed_code:$('proposed-code').value},
  tab:document.querySelector('[data-tab][aria-current="page"]')?.dataset.tab||'resources',query:$('query').value,type:$('type').value,page:state.page};
}
function restoreEditor(editor){if(!editor)return;$('decision').value=editor.status;$('decision-note').value=editor.note;$('proposed-code').value=editor.proposed_code;}
function rememberDraft(){if(draft.id)storage.setItem(draftKey,draft.id);}
async function initializeRecovery(){
 if(recoveryReady)return null;
 const binding=await read('binding');storage=sessionStorage;draftKey='dbt-browser-draft:'+binding.sha256;
 journal=new JobJournal({request,storage,scope:binding.sha256,changed:renderPending});
 draft=new DraftSession({request,changed:record=>{rememberDraft();$('draft-status').textContent=`Working copy saved · revision ${record.revision} · ${record.updated_at}`;}});
 const previous=storage.getItem(draftKey);let restored=null;
 if(previous){try{restored=await draft.open(previous);}catch(error){if(error.code!=='BROWSER_DRAFT_NOT_FOUND')throw error;}}
 recoveryReady=true;
 if(restored){restoring=true;await applyContext(restored);}
 else{await draft.fork();rememberDraft();}
 await listDrafts();renderPending();return restored;
}
function scheduleDraft(){
 if(!recoveryReady||restoring)return;clearTimeout(draftTimer);
 $('draft-status').textContent='Working copy changed · saving to original workspace';
 draftTimer=setTimeout(()=>saveDraft().catch(error=>{say(error.message);$('draft-status').textContent='Working copy not saved · '+error.message;}),350);
}
async function saveDraft(){
 clearTimeout(draftTimer);if(!recoveryReady||restoring)return;
 const result=await draft.save(context());rememberDraft();
 if(!result&&draft.revision)$('draft-status').textContent=`Working copy saved · revision ${draft.revision}`;
 return result;
}
async function listDrafts(){
 const rows=await request('/api/browser',undefined,'GET');
 replaceOptions($('working-copy'),rows.map(row=>({id:row.id,title:`${row.name} · working revision ${row.revision} · ${row.selection_count} selected`})),'Choose a saved working copy');
 $('working-copy').value=draft.id;
}
async function applyContext(value){
 if(value.edition&&!state.editions.some(e=>e.id===value.edition))throw Error('The saved working edition is absent from this project. Its working copy has been retained.');
 state.edition=value.edition;state.baseline=value.baseline;state.page=value.page;state.node=null;
 state.selected=new Set(value.selection);state.decisions=structuredClone(value.decisions);state.editors=structuredClone(value.editors||{});state.comparison=null;
 state.review=value.review?await read('review',{id:value.review.id}):null;
 if(value.review&&(state.review.revision!==value.review.revision||state.review.name!==value.review.name))throw Error('The original saved review anchor changed. Reopen its original revision.');
 for(const [id,key]of [['review-name','name'],['reviewer','reviewer'],['review-note','note']])$(id).value=value.form[key];
 $('query').value=value.query;$('type').value=value.type;restoreEditor(value.editor);
 $('review-revision').textContent=state.review?`Reopened original revision ${state.review.revision}`:'New review · revision 1';
 $('detail').hidden=true;$('detail-empty').hidden=false;$('select-affected').disabled=true;
 resourceEpoch.invalidate();nodeEpoch.invalidate();comparisonEpoch.invalidate();tab(value.tab);
}
async function openDraft(id){
 if(!id)return;clearTimeout(draftTimer);
 // Saving a new copy is the explicit alternative when a concurrent writer won.
 await saveDraft();restoring=true;
 try{const value=await draft.open(id);rememberDraft();await applyContext(value);await refresh();if(value.node){await showNode(value.node);restoreEditor(value.editor);}}
 finally{restoring=false;}
}
async function switchEdition(id){
 await saveDraft();await draft.fork();rememberDraft();restoring=true;
 try{state.edition=id;state.page=0;state.node=null;state.editors={};state.selected=new Set();state.decisions={};state.review=null;state.comparison=null;
 resourceEpoch.invalidate();nodeEpoch.invalidate();comparisonEpoch.invalidate();
 $('saved-review').value='';$('review-name').value='';$('review-note').value='';$('review-revision').textContent='New review · revision 1';
 $('select-affected').disabled=true;$('detail').hidden=true;$('detail-empty').hidden=false;
 restoreEditor({status:'',note:'',proposed_code:''});renderContext();renderSelection();await resources();}
 finally{restoring=false;}await saveDraft();await listDrafts();
}
async function saveCurrentReview(){
 if(!$('review-form').reportValidity())throw Error('Name the review and its reviewer before saving the delivery.');
 const name=$('review-name').value;
 const result=await job('review.save',{name,edition:neededEdition(),baseline:state.baseline||null,selection:[...state.selected].sort(),decisions:state.decisions,
 reviewer:$('reviewer').value,note:$('review-note').value,expected_revision:state.review?.name===name?state.review.revision:0});
 state.review=result;await saveDraft();await refresh();$('review-revision').textContent=`Saved revision ${result.revision} · ${result.id.slice(0,12)}`;say('Complete review revision saved.');return result;
}
async function finalizeReviewForOutput(){
 await saveDraft();
 const current={edition:state.edition,baseline:state.baseline||null,selection:[...state.selected].sort(),decisions:state.decisions,name:$('review-name').value,reviewer:$('reviewer').value,note:$('review-note').value};
 const saved=state.review?Object.fromEntries(Object.keys(current).map(key=>[key,state.review[key]])):null;
 const meaningful=current.name||current.note||current.selection.length||Object.keys(current.decisions).length;
 if(meaningful&&canonical(current)!==canonical(saved))await saveCurrentReview();
}
function renderPending(){
 if(!journal)return;const records=journal.pending();$('pending-jobs').replaceChildren();
 for(const record of records){const row=el('div',undefined,'card');row.append(el('strong',record.action),el('p',record.id,'mono'),button('Resume original operation',async()=>{await job(record.action,record.input,record.id);await refresh();await jobs();}));$('pending-jobs').append(row);}
 $('recovery-count').textContent=records.length?`${records.length} original operation${records.length===1?'':'s'} awaiting browser completion`:'';
}
$('save-working-copy').addEventListener('click',guard(async()=>{await saveDraft();await listDrafts();}));
$('refresh-working-copies').addEventListener('click',guard(listDrafts));
$('working-copy').addEventListener('change',guard(()=>openDraft($('working-copy').value)));
$('copy-working-copy').addEventListener('click',guard(async()=>{clearTimeout(draftTimer);await draft.fork();rememberDraft();await saveDraft();await listDrafts();say('Your current work is retained as a separate native working copy.');}));
for(const event of ['input','change'])$('workspace').addEventListener(event,ev=>{if(ev.target.type!=='file'&&!['edition','working-copy'].includes(ev.target.id))scheduleDraft();});
window.addEventListener('beforeunload',event=>{if(recoveryReady&&(draft.pending||canonical(context())!==draft.saved)){event.preventDefault();event.returnValue='';}});

refresh().catch(error=>{if(error.code!=='UNAUTHORIZED')say(error.message);});
