/* MIT. Browser operator for original, saved multistage preparation. */
'use strict';
const $ = (selector) => document.querySelector(selector);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = (n) => Number(n || 0).toLocaleString();
const date = (s) => s ? new Intl.DateTimeFormat('en-US', {dateStyle:'medium',timeStyle:'short'}).format(new Date(s)) : 'Not started';
const status = (s) => `<span class="status ${esc(s)}">${esc(s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Pending')}</span>`;
const clone = v => JSON.parse(JSON.stringify(v));
const ui = {creationId:null,view:'pipelines', state:null, draft:null, editing:null, execution:null, stage:null, page:0, request:null};
let poll = null;
let reuseChoice = '';
let receivingRequest = null;
const unique = () => typeof crypto.randomUUID==='function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
function reuseControl() {
  const items=ui.state.executions.items.filter(r=>r.status!=='RUNNING');
  return `<div class="field"><label for="reuse-execution">Prior execution for unchanged stages</label><select id="reuse-execution"><option value="">Compute every stage</option>${options(items,reuseChoice,runLabel)}</select><p class="hint">Optional. Exact SQL, parameters, original input results and the recorded engine must match. Changed stages compute normally; reused results keep their original reviews and history.</p></div>`;
}
function bindReuse() {const select=$('#reuse-execution');if(select)select.onchange=()=>{reuseChoice=select.value;};}

async function request(path, body, raw=false) {
  const response = await fetch(path, body === undefined ? {} : {method:'POST',headers:raw ? {} : {'Content-Type':'application/json'},body:raw ? body : JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}
function notice(text, error=false) {
  const target = $('#notice'); target.hidden = !text; target.textContent = text; target.className = error ? 'error' : '';
}
async function action(fn) { try { await fn(); } catch (error) { notice(error.message, true); } }
async function refresh(render=true) {
  ui.state = await request('/api/state'); $('#workspace-label').textContent = ui.state.label;
  if (render) await show(ui.view);
}
function head(title, note, buttons='') { return `<div class="page-head"><div><h2>${esc(title)}</h2><p class="muted">${esc(note)}</p></div>${buttons}</div>`; }
function options(items, selected, label) { return items.map(v=>`<option value="${esc(v.id)}" ${v.id===selected?'selected':''}>${esc(label(v))}</option>`).join(''); }
const runLabel = r => `${r.definition.label} · edition ${r.revision} · ${date(r.createdAt)}`;
async function show(view) {
  clearTimeout(poll); ui.view = view;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  if (view === 'pipelines') await pipelines();
  if (view === 'inputs') await inputs();
  if (view === 'runs') await runs();
  if (view === 'compare') await comparison();
  if (view === 'handover') await handover();
  bindPages();
}
function more(collection) {
  const page=ui.state[collection];
  return page.nextOffset===null?'':`<div class="toolbar"><button data-more="${collection}">Load more ${collection==='pipelines'?'pipelines':'executions'}</button><span class="hint">${count(page.items.length)} of ${count(page.total)} loaded</span></div>`;
}
function bindPages() {
  document.querySelectorAll('[data-more]').forEach(button=>button.onclick=()=>action(async()=>{
    if(ui.view==='pipelines'&&ui.draft&&$('#editor'))readEditor();
    button.disabled=true;const collection=button.dataset.more;const state=ui.state;
    try {
      const current=state[collection];if(current.nextOffset===null)return;
      const page=await request('/api/list?'+new URLSearchParams({collection,offset:current.nextOffset,limit:100}));
      if(ui.state!==state)return;
      const byId=new Map(current.items.map(item=>[item.id,item]));for(const item of page.items)byId.set(item.id,item);
      state[collection]={...page,items:[...byId.values()],offset:0};await show(ui.view);
    } finally {if(button.isConnected)button.disabled=false;}
  }));
}
function initialDraft() {
  const sources = ui.state.sources.filter(s=>!s.alias.startsWith('pipe_'));
  const selected = Object.fromEntries(sources.map(s=>[s.alias,s.id]));
  const first = Object.keys(selected)[0];
  return {label:'New preparation pipeline',description:'',inputs:selected,stages:first?[{id:'prepare',label:'Prepare dataset',sql:`SELECT * FROM ${first}`,parameters:{},bindings:{[first]:{input:first}},description:''}]:[],outputs:first?['prepare']:[]};
}
function edit(definition) {
  ui.creationId = null;
  ui.editing = definition ? {id:definition.id,revision:definition.revision} : null;
  ui.draft = definition ? Object.fromEntries(['label','description','inputs','stages','outputs'].map(k=>[k,clone(definition[k])])) : initialDraft();
  ui.view = 'pipelines'; pipelines();
}
function pipelines() {
  const definitions = ui.state.pipelines.items;
  $('#content').innerHTML = head('Saved pipelines','Build a sequence of preparation steps from exact source editions.','<button id="new-pipeline" class="primary">New pipeline</button>') +
  `<div class="toolbar"><label for="pipeline-select">Open saved pipeline</label><select id="pipeline-select"><option value="">Select a saved pipeline…</option>${options(definitions,ui.editing?.id,p=>`${p.label} · edition ${p.revision}`)}</select><button id="open-pipeline">Open</button></div>`+
  more('pipelines') + `<div class="panel">${reuseControl()}${more('executions')}</div>` +
  (ui.draft ? '<div id="editor"></div>' : `<div class="metric-row"><div class="metric"><b>${count(ui.state.pipelines.total)}</b><span>Saved pipelines</span></div><div class="metric"><b>${count(ui.state.executions.total)}</b><span>Retained executions</span></div><div class="metric"><b>${count(ui.state.sources.filter(s=>!s.alias.startsWith('pipe_')).length)}</b><span>Original source editions</span></div><div class="metric"><b>${count(definitions.reduce((n,p)=>n+p.stages.length,0))}</b><span>Stages in loaded pipelines</span></div></div>`+
  (definitions.length ? definitions.map(p=>`<div class="run-card"><div><h3>${esc(p.label)}</h3><p class="muted">Edition ${p.revision} · ${p.stages.length} stages · ${p.outputs.length} outputs</p><p>${esc(p.description)}</p></div><div class="toolbar"><button data-edit="${esc(p.id)}">Edit pipeline</button><button class="primary" data-run="${esc(p.id)}">Run saved edition</button></div></div>`).join('') : '<div class="empty">Import an original input, then create your first pipeline or start from an existing saved recipe.</div>'));
  bindReuse();
  $('#new-pipeline').onclick = ()=>edit(null);
  $('#open-pipeline').onclick = ()=>action(async()=>{ const id=$('#pipeline-select').value; if(id) edit(await request('/api/definition?id='+encodeURIComponent(id))); });
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(definitions.find(p=>p.id===b.dataset.edit)));
  document.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>action(()=>launch(b.dataset.run,definitions.find(p=>p.id===b.dataset.run).revision)));
  if (ui.draft) renderEditor();
  bindPages();
}
function renderEditor() {
  const d=ui.draft;
  const sourceOptions = selected=>options(ui.state.sources,selected,s=>`${s.label} · ${count(s.rows)} rows · ${s.format.toUpperCase()}`);
  const bindingOptions = (value,sid)=>{
    const chosen = value.input ? 'input:'+value.input : 'stage:'+value.stage;
    return Object.keys(d.inputs).map(k=>`<option value="input:${esc(k)}" ${chosen==='input:'+k?'selected':''}>Input: ${esc(k)}</option>`).join('')+
      d.stages.filter(s=>s.id!==sid).map(s=>`<option value="stage:${esc(s.id)}" ${chosen==='stage:'+s.id?'selected':''}>Stage: ${esc(s.label)}</option>`).join('');
  };
  $('#editor').innerHTML = `<div class="panel"><div class="section-title"><h3>${ui.editing?`Editing edition ${ui.editing.revision}`:'New pipeline'}</h3><button id="close-editor" class="small quiet">Close editor</button></div>
    <div class="grid"><div class="field"><label for="pipeline-label">Pipeline name</label><input id="pipeline-label" value="${esc(d.label)}" maxlength="128"></div><div class="field"><label for="recipe-start">Start from an original saved recipe</label><div class="toolbar"><select id="recipe-start"><option value="">Select a recipe…</option>${options(ui.state.recipes.filter(r=>!r.note?.startsWith('pipeline:')).map(r=>({...r,id:r.id+'@'+r.revision})),null,r=>`${r.label} · edition ${r.revision}`)}</select><button id="use-recipe" class="small">Use recipe</button></div></div></div>
    <div class="field"><label for="pipeline-description">Purpose and handover notes</label><textarea id="pipeline-description">${esc(d.description)}</textarea></div>
    <h3>Exact input editions</h3><p class="hint">Each execution pins these retained files. A later import does not change a saved execution.</p>
    ${Object.entries(d.inputs).map(([alias,id])=>`<div class="input-choice"><label for="input-${esc(alias)}">${esc(alias)}</label><select id="input-${esc(alias)}" data-input="${esc(alias)}">${sourceOptions(id)}</select></div>`).join('')}
    <div class="toolbar"><button id="add-input" class="small">Add named input</button></div>
    <div class="help">SQL aliases select either an original input or another stage. The dependency graph determines execution order; completed stages are reused on Resume.</div></div>
    <div class="section-title"><h3>Preparation stages</h3><button id="add-stage">Add stage</button></div>
    ${d.stages.map((s,i)=>`<section class="stage" data-stage="${i}"><div class="stage-head"><strong>${i+1}. ${esc(s.label)}</strong><button data-remove-stage="${i}" class="small quiet">Remove</button></div>
      <div class="grid"><div class="field"><label for="stage-label-${i}">Stage name</label><input id="stage-label-${i}" data-field="label" value="${esc(s.label)}" maxlength="128"></div><div class="field"><label for="stage-id-${i}">Query reference</label><input id="stage-id-${i}" data-field="id" value="${esc(s.id)}" maxlength="48"></div></div>
      <label>SQL inputs</label>${Object.entries(s.bindings).map(([alias,value],j)=>`<div class="stage-line" data-binding="${j}"><input aria-label="SQL alias" value="${esc(alias)}" data-alias><select aria-label="Input selection" data-selection>${bindingOptions(value,s.id)}</select><button class="small" data-remove-binding="${i}:${j}" aria-label="Remove SQL input">×</button></div>`).join('')}
      <button class="small quiet" data-add-binding="${i}">Add SQL input</button>
      <div class="field"><label for="stage-sql-${i}">Read-only SQL</label><textarea id="stage-sql-${i}" class="sql" data-field="sql" spellcheck="false">${esc(s.sql)}</textarea></div>
      <div class="field"><label for="stage-parameters-${i}">Named parameters (JSON)</label><textarea id="stage-parameters-${i}" class="params" data-field="parameters" spellcheck="false">${esc(JSON.stringify(s.parameters))}</textarea></div>
      <label class="checkline"><input type="checkbox" data-output ${d.outputs.includes(s.id)?'checked':''}> Include this stage in the final customer results</label>
    </section>`).join('')}
    <div class="toolbar"><button id="save-pipeline" class="primary">Save ${ui.editing?'new edition':'pipeline'}</button><button id="save-run">Save and run</button><span class="hint">Existing editions and executions remain unchanged.</span></div>`;
  $('#close-editor').onclick=()=>{ui.draft=null;ui.editing=null;pipelines();};
  $('#add-stage').onclick=()=>action(async()=>{readEditor();let n=d.stages.length+1;while(d.stages.some(s=>s.id==='stage'+n))n++;const last=d.stages.at(-1);const alias=last?'previous':Object.keys(d.inputs)[0];d.stages.push({id:'stage'+n,label:'Preparation stage '+n,sql:`SELECT * FROM ${alias||'source'}`,parameters:{},bindings:alias?{[alias]:last?{stage:last.id}:{input:alias}}:{},description:''});d.outputs.push('stage'+n);renderEditor();});
  $('#add-input').onclick=()=>action(async()=>{readEditor();let n=1;while(d.inputs['input'+n])n++;if(!ui.state.sources.length)throw new Error('Import an original input first.');d.inputs['input'+n]=ui.state.sources[0].id;renderEditor();});
  $('#use-recipe').onclick=()=>action(async()=>{const value=$('#recipe-start').value;if(!value)return;const [recipe_id,revision]=value.split('@');ui.draft=await request('/api/from-recipe',{recipe_id,revision:Number(revision)});ui.editing=null;renderEditor();});
  document.querySelectorAll('[data-remove-stage]').forEach(b=>b.onclick=()=>action(async()=>{readEditor();const index=Number(b.dataset.removeStage);const id=d.stages[index].id;if(d.stages.some((s,i)=>i!==index&&Object.values(s.bindings).some(v=>v.stage===id)))throw new Error('Another stage uses this output. Change that input selection before removing the stage.');d.stages.splice(index,1);d.outputs=d.outputs.filter(v=>v!==id);renderEditor();}));
  document.querySelectorAll('[data-add-binding]').forEach(b=>b.onclick=()=>action(async()=>{readEditor();const s=d.stages[Number(b.dataset.addBinding)];let n=1;while(s.bindings['source'+n])n++;const input=Object.keys(d.inputs)[0];if(!input)throw new Error('Add an input first.');s.bindings['source'+n]={input};renderEditor();}));
  document.querySelectorAll('[data-remove-binding]').forEach(b=>b.onclick=()=>action(async()=>{const [i,j]=b.dataset.removeBinding.split(':').map(Number);readEditor();delete d.stages[i].bindings[Object.keys(d.stages[i].bindings)[j]];renderEditor();}));
  $('#save-pipeline').onclick=()=>action(()=>saveEditor(false)); $('#save-run').onclick=()=>action(()=>saveEditor(true));
}
function readEditor() {
  const d=ui.draft; d.label=$('#pipeline-label').value;d.description=$('#pipeline-description').value;
  document.querySelectorAll('[data-input]').forEach(input=>d.inputs[input.dataset.input]=input.value);
  const oldIDs=d.stages.map(s=>s.id);const updated=[];const outputs=[];
  document.querySelectorAll('[data-stage]').forEach((element,i)=>{
    const field=name=>element.querySelector(`[data-field="${name}"]`).value;
    const bindings={};element.querySelectorAll('[data-binding]').forEach(row=>{const alias=row.querySelector('[data-alias]').value.trim();if(Object.hasOwn(bindings,alias))throw new Error('SQL aliases must be unique.');const [kind,value]=row.querySelector('[data-selection]').value.split(':');bindings[alias]={[kind]:value};});
    const parameters=JSON.parse(field('parameters'));if(!parameters||Array.isArray(parameters)||typeof parameters!=='object')throw new Error('Named parameters must be a JSON object.');if(Object.values(parameters).some(v=>typeof v==='number'&&!Number.isSafeInteger(v)))throw new Error('Use quoted text for decimal amounts and integers outside the safe JavaScript range.');const stage={...d.stages[i],id:field('id').trim(),label:field('label'),sql:field('sql'),parameters,bindings};updated.push(stage);if(element.querySelector('[data-output]').checked)outputs.push(stage.id);
  });
  const renamed=Object.fromEntries(oldIDs.map((id,i)=>[id,updated[i].id]));
  updated.forEach(s=>Object.values(s.bindings).forEach(v=>{if(v.stage&&renamed[v.stage])v.stage=renamed[v.stage];}));
  d.stages=updated;d.outputs=outputs;
}
function definitionContent(value) {
  const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return JSON.stringify(sort({label:value.label.trim(),description:value.description||'',inputs:value.inputs,
    stages:value.stages.map(stage=>({...stage,label:stage.label.trim(),description:stage.description||'',parameters:stage.parameters||{}})),outputs:value.outputs}));
}
async function saveEditor(run) {
  readEditor();if(!ui.editing&&!ui.creationId)ui.creationId='p_'+unique().replaceAll('-','');
  const pipeline_id=ui.editing?.id||ui.creationId,expected_revision=ui.editing?.revision||0,definition=clone(ui.draft);
  let result;
  try {result=await request('/api/save',{definition,pipeline_id,expected_revision});}
  catch(error) {
    // Read back this exact intended edition after a lost response. Never create
    // a second pipeline or silently adopt a concurrent different definition.
    try {const saved=await request('/api/definition?'+new URLSearchParams({id:pipeline_id,revision:expected_revision+1}));
      if(definitionContent(saved)===definitionContent(definition))result=saved;
    } catch { /* Preserve the original actionable save error. */ }
    if(!result)throw error;
  }
  ui.creationId=null;ui.editing={id:result.id,revision:result.revision};await refresh(false);notice(`Saved ${result.label}, edition ${result.revision}.`);
  if(run)await launch(result.id,result.revision);else renderEditor();
}
async function launch(id, revision) {
  // Retain the request key until enqueue is received; retrying a lost response
  // uses the same immutable selection instead of silently creating another run.
  const spec={pipeline_id:id,...(revision?{revision}:{}),...(reuseChoice?{reuse_execution:reuseChoice}:{})};
  if(!ui.request||JSON.stringify(ui.request.spec)!==JSON.stringify(spec))ui.request={spec,key:unique()};
  try{sessionStorage.setItem('pipeline-pending-request',JSON.stringify(ui.request));}catch{}
  const run=await request('/api/enqueue',{...spec,request_key:ui.request.key});
  ui.request=null;try{sessionStorage.removeItem('pipeline-pending-request');}catch{}
  ui.execution=run.id;ui.stage=null;ui.page=0;try{await request('/api/execute',{execution_id:run.id});}finally{await refresh(false);await show('runs');}
}
function inputs() {
  const sources=ui.state.sources;
  $('#content').innerHTML=head('Original inputs','Retain complete source files and select explicit editions for each pipeline.')+
    `<div class="panel"><h3>Import a source edition</h3><form id="upload-form"><div class="grid"><div class="field"><label for="input-file">CSV or JSON Lines file</label><input id="input-file" type="file" accept=".csv,.jsonl,.ndjson" required></div><div class="field"><label for="source-alias">Input alias</label><input id="source-alias" pattern="[A-Za-z][A-Za-z0-9_]{0,47}" placeholder="orders" required></div><div class="field"><label for="source-label">Edition label</label><input id="source-label" placeholder="October orders" maxlength="128"></div><div class="field"><label for="source-format">Format</label><select id="source-format"><option value="csv">CSV</option><option value="jsonl">JSON Lines</option></select></div></div><div class="grid"><div class="field"><label for="null-token">CSV missing-value token (optional)</label><input id="null-token" placeholder="Leave blank to preserve empty text"></div></div><button class="primary" type="submit">Retain original file</button></form></div>
    <div class="panel"><div class="section-title"><h3>Retained source editions</h3><span class="stats">${count(sources.length)} complete files</span></div><div class="scroll"><table><thead><tr><th>Edition</th><th>Rows</th><th>Columns</th><th>Format</th><th>Purpose</th></tr></thead><tbody>${sources.map(s=>`<tr><td class="wrap"><strong>${esc(s.label)}</strong><br><span class="hint">${esc(s.originalName)}</span></td><td>${count(s.rows)}</td><td>${s.columns.length}</td><td>${esc(s.format.toUpperCase())}</td><td>${s.alias.startsWith('pipe_')?'Retained intermediate':'Original input'}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#upload-form').onsubmit=event=>{event.preventDefault();action(async()=>{const file=$('#input-file').files[0];if(!file)return;const q=new URLSearchParams({alias:$('#source-alias').value,label:$('#source-label').value,format:$('#source-format').value,filename:file.name});if($('#null-token').value)q.set('nullToken',$('#null-token').value);await request('/api/upload?'+q,file,true);await refresh();notice('The complete original input edition is retained.');});};
}
async function runs() {
  const items=ui.state.executions.items;
  if(!ui.execution&&items.length)ui.execution=items[0].id;
  $('#content').innerHTML=head('Pipeline executions','Inspect complete stage results, recover an interrupted run, or review a delivered edition.','<button id="recover-runs">Recover interrupted work</button>')+
    `<div class="toolbar"><label for="execution-select">Saved execution</label><select id="execution-select">${options(items,ui.execution,runLabel)}</select><button id="open-execution">Open execution</button></div>${more('executions')}<div id="run-detail">${items.length?'':'<div class="empty">No pipeline executions yet. Save a pipeline and run its exact edition.</div>'}</div>`;
  $('#recover-runs').onclick=()=>action(async()=>{const result=await request('/api/recover',{});await refresh();notice(`Recovered ${result.executions.length} pipeline executions. Use Resume to continue their original stages.`);});
  $('#open-execution').onclick=()=>action(async()=>{ui.execution=$('#execution-select').value;ui.stage=null;ui.page=0;await detail();});
  if(ui.execution)await detail();
}
async function detail() {
  const run=await request('/api/execution?id='+encodeURIComponent(ui.execution));
  if(ui.view!=='runs'||ui.execution!==run.id||!$('#run-detail'))return;
  const savedIndex=ui.state.executions.items.findIndex(e=>e.id===run.id);if(savedIndex>=0)ui.state.executions.items[savedIndex]=run;
  const completed=Object.values(run.stages).filter(s=>s.status==='COMPLETE');
  const resumable=!['COMPLETE','RUNNING'].includes(run.status);
  $('#run-detail').innerHTML=`<div class="metric-row"><div class="metric"><b>${completed.length} / ${run.definition.stages.length}</b><span>Completed stages</span></div><div class="metric"><b>${run.revision}</b><span>Saved pipeline edition</span></div><div class="metric"><b>${Object.keys(run.inputs).length}</b><span>Pinned original inputs</span></div><div class="metric"><b>${run.definition.outputs.length}</b><span>Selected final outputs</span></div></div>
    <div class="panel"><div class="section-title"><div><h3>${esc(run.definition.label)}</h3><p class="hint">Created ${esc(date(run.createdAt))}</p></div>${status(run.status)}</div>${run.message?`<p>${esc(run.message)}</p>`:''}
    <div class="toolbar">${resumable?'<button id="resume-execution" class="primary">Resume saved execution</button>':''}${['QUEUED','RUNNING','WAITING'].includes(run.status)?'<button id="cancel-execution">Cancel execution</button>':''}<button id="to-handover">Prepare handover</button></div>
    <div class="scroll"><table><thead><tr><th>Stage</th><th>Status</th><th>Rows</th><th>Attempts</th><th>Output</th></tr></thead><tbody>${run.definition.order.map(sid=>{const s=run.definition.stages.find(s=>s.id===sid),state=run.stages[sid];return `<tr><td class="wrap">${state.status==='COMPLETE'?`<button class="link" data-inspect="${esc(sid)}">${esc(s.label)}</button>`:esc(s.label)}</td><td>${status(state.status)}</td><td>${state.rows===undefined?'—':count(state.rows)}</td><td>${state.reuseFrom?'Reused prior result':state.attempts.length}</td><td>${run.definition.outputs.includes(sid)?'Customer result':'Intermediate'}</td></tr>`;}).join('')}</tbody></table></div>
    <details><summary>Stage execution history</summary><div id="event-history"></div></details></div><div id="result-preview"></div>`;
  $('#to-handover').onclick=()=>show('handover');
  if($('#resume-execution'))$('#resume-execution').onclick=()=>action(async()=>{await request('/api/execute',{execution_id:run.id,resume:true});await detail();});
  if($('#cancel-execution'))$('#cancel-execution').onclick=()=>action(async()=>{await request('/api/cancel',{execution_id:run.id});notice('Cancellation requested. Completed stages are retained.');await detail();});
  document.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>action(async()=>{ui.stage=b.dataset.inspect;ui.page=0;await preview(run);}));
  const history=$('#event-history');let cursor=0;const entries=[];do{const page=await request('/api/events?'+new URLSearchParams({id:run.id,after:cursor,limit:200}));entries.push(...page.items);cursor=page.nextAfter;}while(cursor!==null);
  if(!history.isConnected||ui.view!=='runs'||ui.execution!==run.id)return;
  history.innerHTML=`<table><thead><tr><th>Time</th><th>Operation</th><th>Stage</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(date(e.at))}</td><td>${esc(e.type.replaceAll('_',' ').toLowerCase())}</td><td>${esc(run.definition.stages.find(s=>s.id===e.details.stage)?.label||'Pipeline')}</td></tr>`).join('')}</tbody></table>`;
  if(!ui.stage&&completed.length)ui.stage=run.definition.outputs.find(s=>run.stages[s].status==='COMPLETE')||run.definition.order.find(s=>run.stages[s].status==='COMPLETE');
  if(ui.stage&&run.stages[ui.stage]?.status==='COMPLETE')await preview(run);
  if(run.status==='RUNNING'||run.status==='QUEUED')poll=setTimeout(()=>action(detail),1200);
}
async function preview(run) {
  const selectedStage=ui.stage;const stage=run.definition.stages.find(s=>s.id===selectedStage);const data=await request('/api/rows?'+new URLSearchParams({id:run.id,stage:ui.stage,offset:ui.page,limit:100}));
  if(ui.view!=='runs'||ui.execution!==run.id||ui.stage!==selectedStage||!$('#result-preview'))return;
  const link=file=>'/api/result?'+new URLSearchParams({id:run.id,stage:ui.stage,file});
  const native=run.stages[ui.stage].nativeRun;const review=ui.state.reviews.find(r=>r.id===native);const last=review?.history.at(-1);
  $('#result-preview').innerHTML=`<div class="panel"><div class="section-title"><h3>${esc(stage.label)}</h3><span class="stats">${count(data.total)} complete rows</span></div><div class="outputs"><a href="${link('result.csv')}">Complete CSV</a><a href="${link('result.jsonl')}">Complete JSON Lines</a><a href="${link('schema.json')}">Schema and counts</a></div><p class="hint">Missing values and empty text remain distinct in JSON Lines. This view is one page of the complete result.</p><div class="scroll"><table><thead><tr>${data.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${r.map(v=>`<td>${v===null?'<span class="value-missing">Missing</span>':v===''?'<span class="value-empty">Empty text</span>':esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="pager"><button id="previous-page" class="small" ${ui.page===0?'disabled':''}>Previous</button><span>Rows ${data.total?count(ui.page+1):0}–${count(ui.page+data.rows.length)} of ${count(data.total)}</span><button id="next-page" class="small" ${data.nextOffset===null?'disabled':''}>Next</button></div>
    <div class="help"><h3>Result review</h3>${last?`<p class="hint">${esc(last.decision)} · ${esc(last.reviewer)} · ${esc(date(last.createdAt))}</p><p>${esc(last.note)}</p>`:'<p class="hint">Attach a review to this exact completed result.</p>'}<div class="grid"><div class="field"><label for="reviewer">Reviewer</label><input id="reviewer" value="${esc(last?.reviewer||'')}" maxlength="128"></div><div class="field"><label for="decision">Decision</label><select id="decision"><option value="accept">Accept</option><option value="revise">Request revision</option><option value="withdraw">Withdraw review</option></select></div></div><div class="field"><label for="review-note">Review note</label><textarea id="review-note"></textarea></div><button id="save-review">Save review</button></div></div>`;
  $('#previous-page').onclick=()=>action(async()=>{ui.page=Math.max(0,ui.page-100);await preview(run);});$('#next-page').onclick=()=>action(async()=>{ui.page=data.nextOffset;await preview(run);});
  $('#save-review').onclick=()=>action(async()=>{await request('/api/review',{execution_id:run.id,stage_id:ui.stage,reviewer:$('#reviewer').value,decision:$('#decision').value,note:$('#review-note').value,expected_revision:review?.revision||0});await refresh(false);await preview(run);notice('Review saved against this complete result edition.');});
}
function comparison() {
  const items=ui.state.executions.items;
  $('#content').innerHTML=head('Compare executions','Compare exact source selections and complete ordered stage results.')+`<div class="panel"><div class="grid"><div class="field"><label for="before-run">Before</label><select id="before-run">${options(items,items[1]?.id,runLabel)}</select></div><div class="field"><label for="after-run">After</label><select id="after-run">${options(items,items[0]?.id,runLabel)}</select></div></div><button id="compare-runs" class="primary" ${items.length?'':'disabled'}>Compare saved executions</button></div>${more('executions')}<div id="comparison"></div>`;
  $('#compare-runs').onclick=()=>action(async()=>{const value=await request('/api/compare?'+new URLSearchParams({before:$('#before-run').value,after:$('#after-run').value}));$('#comparison').innerHTML=`<div class="panel"><h3>Complete stage comparison</h3><div class="scroll"><table><thead><tr><th>Stage</th><th>Before rows</th><th>After rows</th><th>Ordered result</th></tr></thead><tbody>${value.stages.map(s=>`<tr><td class="wrap">${esc(s.label)}</td><td>${s.beforeRows===null?'—':count(s.beforeRows)}</td><td>${s.afterRows===null?'—':count(s.afterRows)}</td><td>${s.sameOrderedResult===true?'Identical':s.sameOrderedResult===false?'Changed':'Not available'}</td></tr>`).join('')}</tbody></table></div><p class="comparison-note">Equality uses the full ordered JSON Lines files, not the preview rows. A changed order counts as a changed result; this is not a key-matched row comparison.</p><h3>Input edition changes</h3>${value.inputChanges.length?value.inputChanges.map(c=>`<p><strong>${esc(c.input)}</strong>: ${esc(ui.state.sources.find(s=>s.id===c.before)?.label||'Absent')} → ${esc(ui.state.sources.find(s=>s.id===c.after)?.label||'Absent')}</p>`).join(''):'<p>The exact original input editions are unchanged.</p>'}</div>`;});
}
async function handover() {
  const items=ui.state.executions.items;const selected=items.find(r=>r.id===ui.execution)||items[0];
  $('#content').innerHTML=head('Customer handover','Receive complete results or reopen the whole editable preparation project.')+`<div class="panel"><h3>Select the execution</h3><div class="field"><label for="handover-run">Saved execution</label><select id="handover-run">${options(items,selected?.id,runLabel)}</select></div>${more('executions')}<div id="handover-actions"></div></div><div class="panel"><h3>Editable project</h3><p>Includes every retained original, saved recipe and pipeline edition, intermediate and final dataset, result review, and execution history.</p><button id="export-project" class="primary">Download complete project</button><div class="delivery-links" id="project-link"></div><div class="help"><h3>Independent receiving</h3><p>Use the pipeline source package and a new destination directory:</p><pre>python3 cli.py --workspace ./received receive ./project.zip
python3 cli.py --workspace ./received serve --port 8777</pre><p>The receiver reconstructs the original source tables and result indexes, keeps all saved editions, and opens the same pipeline editor. It does not execute saved queries during import.</p></div></div>`;
  $('#content').insertAdjacentHTML('beforeend', `<div class="panel"><h3>Receive an editable project</h3><p>Upload a current pipeline project or an earlier saved pipeline project. The receiver preserves its complete original records and opens a separate workspace; this workspace and any running jobs remain unchanged.</p><form id="receive-form"><div class="field"><label for="project-file">Complete project ZIP</label><input id="project-file" type="file" accept=".zip" required></div><button class="primary" type="submit">Receive independent project</button></form><div id="receive-info" class="delivery-links"></div><h3>Previously received projects</h3><div id="received-projects"></div></div>`);
  const receiveForm=$('#receive-form'), projectFile=$('#project-file'), receiveInfo=$('#receive-info');
  const receivedProjects=$('#received-projects'), handoverRun=$('#handover-run'), handoverActions=$('#handover-actions');
  const exportButton=$('#export-project'), projectLink=$('#project-link');
  function completedDownload(container, value, description) {
    const link=document.createElement('a');
    link.href=value.download;link.textContent=description+' ('+count(value.bytes)+' bytes)';
    const current=container.isConnected;
    if(current)container.replaceChildren(link);
    else{link.hidden=true;document.body.append(link);}
    link.click();
    if(!current)link.remove();
  }
  async function receivedList() {
    if(!receivedProjects.isConnected)return;
    const data=await request('/api/received');
    if(!receivedProjects.isConnected)return;
    receivedProjects.innerHTML=data.items.length?data.items.map(p=>`<div class="run-card"><div><strong>${esc(p.label)}</strong><p class="hint">${count(p.executions)} executions · ${count(p.sources)} retained source editions</p></div><button data-open-received="${esc(p.id)}">Open independent workspace</button></div>`).join(''):'<p class="hint">No projects have been received here.</p>';
    receivedProjects.querySelectorAll('[data-open-received]').forEach(b=>b.onclick=()=>action(async()=>{const value=await request('/api/open-received',{id:b.dataset.openReceived});if(receiveInfo.isConnected)receiveInfo.innerHTML=`<a href="${esc(value.origin)}" target="_blank" rel="noopener">Open received project: ${esc(value.label)}</a>`;}));
  }
  receiveForm.onsubmit=event=>{event.preventDefault();action(async()=>{
    const file=projectFile.files[0];if(!file)return;
    const fingerprint=JSON.stringify([file.name,file.size,file.lastModified]);
    if(!receivingRequest||receivingRequest.file!==fingerprint)receivingRequest={file:fingerprint,key:unique()};
    try{sessionStorage.setItem('pipeline-receiving-request',JSON.stringify(receivingRequest));}catch{}
    const pendingRequest=receivingRequest,button=receiveForm.querySelector('button');button.disabled=true;
    try{const value=await request('/api/receive?'+new URLSearchParams({requestKey:pendingRequest.key}),file,true);
      if(receiveInfo.isConnected)receiveInfo.innerHTML=`<p>Received ${count(value.executions)} executions with their complete original results.</p><a href="${esc(value.origin)}" target="_blank" rel="noopener">Open received project: ${esc(value.label)}</a>`;
      if(receivingRequest?.key===pendingRequest.key){receivingRequest=null;try{sessionStorage.removeItem('pipeline-receiving-request');}catch{}}
      await receivedList();notice('The independent project is ready. This workspace is unchanged.');
    }finally{button.disabled=false;}
  });};
  const renderActions=()=>{
    const run=items.find(r=>r.id===handoverRun.value);if(!run){handoverActions.innerHTML='<p>No saved execution yet.</p>';return;}
    const completed=run.definition.stages.filter(s=>run.stages[s.id].status==='COMPLETE');
    const preferred=run.definition.outputs.find(id=>completed.some(s=>s.id===id))??completed[0]?.id;
    ui.execution=run.id;handoverActions.innerHTML=`<p>${status(run.status)} · ${run.definition.outputs.length} final output selections</p><div class="toolbar"><button data-delivery="report">Download operating report</button><button data-delivery="deliver" ${run.status==='COMPLETE'?'':'disabled'}>Download all customer results</button></div><div class="field"><label for="merchant-stage">Original merchant dataset</label><select id="merchant-stage">${completed.map(s=>`<option value="${esc(s.id)}" ${s.id===preferred?'selected':''}>${esc(s.label)} · ${count(run.stages[s.id].rows)} ${run.stages[s.id].rows===1?'row':'rows'}</option>`).join('')}</select></div><button data-delivery="merchant" ${Object.values(run.stages).some(s=>s.status==='COMPLETE')?'':'disabled'}>Download merchant dataset package</button><div class="delivery-links" id="result-link"></div>`;
    const merchantStage=handoverActions.querySelector('#merchant-stage'),resultLink=handoverActions.querySelector('#result-link');
    handoverActions.querySelectorAll('[data-delivery]').forEach(b=>b.onclick=()=>action(async()=>{b.disabled=true;try{const value=await request('/api/'+b.dataset.delivery,{execution_id:run.id,stage_id:merchantStage.value});completedDownload(resultLink,value,'Open completed '+(b.dataset.delivery==='report'?'report':'download'));}finally{b.disabled=false;}}));
  };
  handoverRun.onchange=renderActions;renderActions();exportButton.onclick=()=>action(async()=>{const b=exportButton;b.disabled=true;try{const value=await request('/api/export',{});completedDownload(projectLink,value,'Open complete editable project');}finally{b.disabled=false;}});
  await receivedList();
}
document.querySelectorAll('nav button').forEach(button=>button.onclick=()=>action(async()=>{if(ui.view==='pipelines'&&ui.draft&&$('#editor'))readEditor();await show(button.dataset.view);}));
$('#refresh').onclick=()=>action(async()=>{if(ui.view==='pipelines'&&ui.draft&&$('#editor'))readEditor();await refresh();});
try { const saved=sessionStorage.getItem('pipeline-pending-request');if(saved)ui.request=JSON.parse(saved); } catch { /* A malformed local draft never changes stored work. */ }
try {const saved=sessionStorage.getItem('pipeline-receiving-request');if(saved)receivingRequest=JSON.parse(saved);}catch{}
action(()=>refresh());
