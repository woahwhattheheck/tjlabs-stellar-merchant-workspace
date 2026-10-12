// Same saved workspace and original operation journal. No hosted libraries.
const $ = (selector) => document.querySelector(selector);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => Number(n).toLocaleString('en-US');
const date = value => value ? new Date(value).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Not yet saved';
const label = action => ({import:'Import source',recipe:'Save recipe',run:'Create edition',review:'Save review',export:'Export dataset',backup:'Create workspace backup'}[action] ?? action);
const token = location.hash.slice(1) || sessionStorage.getItem('blend-token') || '';
if (token) sessionStorage.setItem('blend-token',token);
history.replaceState(null,'',location.pathname);
let workspaceKey = sessionStorage.getItem('blend-workspace') || 'original';
let state, tab='inputs', selectedSource='', selectedEdition='', draft=null, recipeId=null, recipeVersion=0, previewAfter=0;
let busy=false;
const notice=(text,error=false)=>{ $('#notice').textContent=text;$('#notice').classList.toggle('error',error); };
async function http(path,input) {
  const response=await fetch(path,{method:input===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Blend-Workspace':workspaceKey},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const result=await response.json();
  if(!response.ok || result.error)throw Error(result.error?.message ?? 'The operation did not complete.');
  return result;
}
async function call(action,input={}){return http('/api/action',{action,input});}
async function refresh(render=true){
  const collected={sources:new Map(),recipes:new Map(),editions:new Map()};let page=0,next=true,last;
  while(next){
    last=await http('/api/state?offset='+page+'&limit=100');next=false;
    for(const key of Object.keys(collected)){
      for(const item of last[key]) collected[key].set(item.id,item);
      next ||= last.pagination[key].nextOffset!==null;
    }
    page+=100;
  }
  state={...last,...Object.fromEntries(Object.entries(collected).map(([k,v])=>[k,[...v.values()]]))};
  $('#workspace-title').textContent=state.workspace.label;
  const pending=$('#pending');pending.hidden=!state.pending.length;
  pending.innerHTML='<h3>Unfinished operations</h3><p class="hint">Resume the original operation after an interruption, or dismiss it after changing the recipe.</p>'+state.pending.map(p=>`<div class="pending-item"><span>${esc(label(p.action))} · ${esc(date(p.created))}</span><div><button data-resume="${esc(p.id)}">Resume</button> <button data-dismiss="${esc(p.id)}">Dismiss</button></div></div>`).join('');
  if(render)draw();
}
async function task(message,fn){
  if(busy)return;busy=true;notice(message);document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await fn();}catch(e){notice(e.message,true);try{await refresh(false);}catch{}}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function source(id){return state.sources.find(s=>s.id===id);}
function edition(id){return state.editions.find(s=>s.id===id);}
function options(items,selected,key='id',title=s=>s.label){return '<option value="">Choose…</option>'+items.map(x=>`<option value="${esc(x[key])}" ${x[key]===selected?'selected':''}>${esc(title(x))}</option>`).join('');}
function simpleOptions(values,selected){return values.map(([key,name])=>`<option value="${esc(key)}" ${key===selected?'selected':''}>${esc(name)}</option>`).join('');}
function cells(headers,rows,origins=false){
  return `<div class="table-wrap"><table><thead><tr><th>Row</th>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}${origins?'<th>Source rows</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td>${number(r.row)}</td>${r.values.map(v=>`<td>${v===null?'<span class="muted">—</span>':v===''?'<span class="muted">(empty)</span>':esc(v)}</td>`).join('')}${origins?`<td>${Object.entries(r.origins).map(([a,n])=>esc(a)+': '+(n===null?'unmatched':number(n))).join('<br>')}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function draw(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));
  ({inputs:drawInputs,recipe:drawRecipe,editions:drawEditions,delivery:drawDelivery})[tab]();
}
function drawInputs(){
  $('#view').innerHTML=`<h2>Retain the source files</h2><p class="intro">Import CSVs without changing their text values. Each import keeps its original file and creates a separate source edition.</p>
  <section class="card"><h3>Add an input</h3><form id="import-form"><div class="grid"><label>Input name<input id="input-label" required maxlength="160" placeholder="Customer directory — October"></label><label>CSV file<input id="input-file" type="file" accept=".csv,.tsv,text/csv" required></label><label>Delimiter<select id="delimiter">${simpleOptions([[',','Comma'],[';','Semicolon'],['\t','Tab'],['|','Pipe']],',')}</select></label><label>Explicit null marker <span class="muted">(optional)</span><input id="input-null" maxlength="80" placeholder="Leave blank to preserve every field as text"></label><label class="wide">Source reference <span class="muted">(private, optional)</span><input id="input-reference" maxlength="2000" placeholder="Where this source was obtained"></label></div><p class="hint">Browser files: up to 12 MiB. Use the CLI for larger inputs. Blank fields stay empty strings unless an explicit null marker is supplied.</p><div class="actions"><button class="primary" type="submit">Import complete CSV</button></div></form></section>
  <section class="card"><div class="split"><h3>Saved inputs</h3><span class="badge">${number(state.sources.length)} inputs</span></div>${state.sources.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Records</th><th>Columns</th><th>Imported</th><th></th></tr></thead><tbody>${state.sources.map(s=>`<tr><td>${esc(s.label)}</td><td>${number(s.rows)}</td><td>${number(s.headers.length)}</td><td>${esc(date(s.created))}</td><td><button data-source="${esc(s.id)}">Inspect</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Import the first CSV to begin a recipe.</p>'}<div id="input-preview"></div></section>`;
  if(selectedSource&&source(selectedSource))showSource(selectedSource,previewAfter).catch(e=>notice(e.message,true));
}
async function showSource(id,after=0){
  selectedSource=id;previewAfter=after;const page=await call('source.rows',{source:id,after,limit:50});
  const host=$('#input-preview');if(!host||tab!=='inputs'||selectedSource!==id)return;
  host.innerHTML=`<h3 class="actions">${esc(source(id).label)}</h3><p class="hint">Original record numbers; no inferred data types.</p>${cells(page.headers,page.rows)}<div class="actions"><button data-source-page="0" ${after===0?'disabled':''}>First records</button>${page.next!==null?`<button data-source-page="${page.next}">More records</button>`:''}<span class="hint">${number(page.total)} total records</span></div>`;
}
function blankDraft(){return {name:'',base:{source:state.sources[0]?.id??'',as:'base'},joins:[],columns:[]};}
function allColumns(){
  if(!draft)return [];
  return [draft.base,...draft.joins].flatMap(t=>(source(t.source)?.headers??[]).map(c=>({source:t.as,column:c,key:t.as+'\u0000'+c})));
}
function outputName(c){let part=(c.source+'_'+c.column).toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,48);return /^[a-z]/.test(part)?part:'c_'+part.slice(0,46);}
function syncColumns(){
  const available=allColumns();
  draft.columns=draft.columns.filter(c=>available.some(a=>a.source===c.source&&a.column===c.column));
}
function leftFields(index){return [draft.base,...draft.joins.slice(0,index)].flatMap(t=>(source(t.source)?.headers??[]).map(c=>({value:JSON.stringify([t.as,c]),label:t.as+' · '+c})));}
function drawRecipe(){
  draft??=blankDraft();syncColumns();
  const outputs=allColumns();
  $('#view').innerHTML=`<h2>Define the join recipe</h2><p class="intro">Choose the source editions, match keys and public columns. Joins run in the order shown. Matching is exact and case-sensitive; SQL null keys never match.</p>
  <section class="card"><div class="toolbar"><label>Saved recipe<select id="load-recipe">${options(state.recipes,recipeId,'id',r=>r.spec.name+' · version '+r.version)}</select></label><button id="new-recipe">New recipe</button></div></section>
  <form id="recipe-form"><section class="card"><div class="grid"><label>Recipe name<input id="recipe-name" required maxlength="160" value="${esc(draft.name)}" placeholder="Orders with customer and regional details"></label><label>Base table alias<input id="base-alias" required pattern="[a-z][a-z0-9_]{0,47}" value="${esc(draft.base.as)}"></label><label class="wide">Base source edition<select id="base-source" required>${options(state.sources,draft.base.source)}</select></label></div>
  <div id="joins">${draft.joins.map((j,i)=>`<section class="join"><div class="split"><h3>Join ${i+1}</h3><button type="button" data-remove-join="${i}">Remove join</button></div><div class="grid three"><label>Source edition<select data-join-source="${i}" required>${options(state.sources,j.source)}</select></label><label>Table alias<input data-join-alias="${i}" required pattern="[a-z][a-z0-9_]{0,47}" value="${esc(j.as)}"></label><label>Join type<select data-join-kind="${i}">${simpleOptions([['inner','Inner — matched rows'],['left','Left — keep all earlier rows'],['full','Full — keep both sides']],j.kind)}</select></label><label>Duplicate matches<select data-join-cardinality="${i}">${simpleOptions([['many-to-many','Keep every matching combination'],['many-to-one','Require unique keys on this source']],j.cardinality)}</select></label><label>Empty-string keys<select data-join-empty="${i}">${simpleOptions([['unmatched','Leave unmatched'],['match','Match empty strings exactly']],j.emptyKeys)}</select></label></div><div class="keys">${j.on.map((k,n)=>`<div class="key"><label>Earlier table key<select data-left-key="${i}:${n}" required>${options(leftFields(i),JSON.stringify([k.leftAlias,k.leftColumn]),'value',v=>v.label)}</select></label><label>New source key<select data-right-key="${i}:${n}" required>${simpleOptions([['','Choose…'],...(source(j.source)?.headers??[]).map(c=>[c,c])],k.rightColumn)}</select></label><button type="button" data-remove-key="${i}:${n}" aria-label="Remove key pair">×</button></div>`).join('')}<button type="button" data-add-key="${i}">Add key pair</button></div></section>`).join('')}</div><div class="actions"><button type="button" id="add-join" ${draft.joins.length>=7?'disabled':''}>Add source join</button><span class="hint">Composite keys use all selected pairs together.</span></div></section>
  <section class="card"><div class="split"><h3>Customer output columns</h3><button type="button" id="select-all">Select all columns</button></div><p class="hint">Only checked columns reach the customer dataset. Output names are lowercase identifiers, at most 48 characters.</p><div>${outputs.map((c,i)=>{const chosen=draft.columns.find(o=>o.source===c.source&&o.column===c.column);return `<div class="output"><input type="checkbox" data-output="${i}" aria-label="Include ${esc(c.source+' '+c.column)}" ${chosen?'checked':''}><span>${esc(c.source)} · ${esc(c.column)}</span><input type="text" data-output-name="${i}" aria-label="Output name for ${esc(c.column)}" value="${esc(chosen?.name??outputName(c))}" pattern="[a-z][a-z0-9_]{0,47}"></div>`;}).join('')}</div><div class="actions"><button class="primary" type="submit">Save recipe ${recipeVersion?'version '+(recipeVersion+1):''}</button>${recipeId?'<button type="button" id="run-recipe">Create complete edition</button>':''}<span class="hint">${recipeVersion?'Saved version '+recipeVersion:'New recipe'}</span></div></section></form>`;
}
function drawEditions(){
  const current=edition(selectedEdition)??state.editions[0];selectedEdition=current?.id??'';
  $('#view').innerHTML=`<h2>Inspect and review result editions</h2><p class="intro">Each run uses a saved recipe version and immutable inputs. Earlier editions remain available when you change a source or recipe.</p>
  <section class="card"><div class="toolbar"><label>Result edition<select id="edition-select">${options(state.editions,selectedEdition,'id',e=>e.recipe.spec.name+' · v'+e.recipe.version+' · '+date(e.created))}</select></label><button id="open-recipe" ${current?'':'disabled'}>Open recipe</button></div></section><div id="edition-detail"></div>`;
  if(current)showEdition(current.id).catch(e=>notice(e.message,true));else $('#edition-detail').innerHTML='<p class="empty">Save a recipe and create its first complete edition.</p>';
}
async function showEdition(id,after=0){
  const [item,page]=await Promise.all([call('edition',{edition:id}),call('rows',{edition:id,after,limit:50})]);
  if(tab!=='editions'||selectedEdition!==id)return;
  const review=item.review;
  $('#edition-detail').innerHTML=`<section class="card"><h3>${esc(item.recipe.spec.name)} · version ${item.recipe.version}</h3><div class="metrics"><div class="metric"><strong>${number(item.rows)}</strong><span>Complete output rows</span></div><div class="metric"><strong>${number(item.columns.length)}</strong><span>Selected output columns</span></div><div class="metric"><strong>${number(Object.keys(item.sources).length)}</strong><span>Retained source editions</span></div></div>
  <div class="table-wrap"><table><thead><tr><th>Input</th><th>Source records</th><th>Output rows without this source</th></tr></thead><tbody>${item.sourceOrder.map(a=>`<tr><td>${esc(item.sources[a].label)} <span class="muted">(${esc(a)})</span></td><td>${number(item.sources[a].rows)}</td><td>${number(item.missingSourceRows[a])}</td></tr>`).join('')}</tbody></table></div>
  ${item.diagnostics.length?`<p class="hint">${item.diagnostics.map(d=>esc(d.alias)+': '+number(d.duplicateKeyGroups)+' duplicate key groups on the joined input').join(' · ')}. Every permitted combination is retained.</p>`:''}
  ${cells(page.columns,page.rows,true)}<div class="actions"><button data-edition-page="0" ${after===0?'disabled':''}>First records</button>${page.next!==null?`<button data-edition-page="${page.next}">More records</button>`:''}<span class="hint">Em dash = unmatched or explicit null. “(empty)” = empty text.</span></div></section>
  <section class="card"><div class="split"><h3>Edition review</h3><span class="badge">${esc(review.decision.replace('-',' '))}</span></div><form id="review-form"><div class="grid"><label>Reviewer<input id="reviewer" required maxlength="160" value="${esc(review.reviewer)}"></label><label>Decision<select id="decision">${simpleOptions([['accepted','Accepted'],['needs-work','Needs work'],['archived','Archived']],review.decision==='unreviewed'?'accepted':review.decision)}</select></label><label class="wide">Review note<textarea id="review-note" maxlength="10000">${esc(review.note)}</textarea></label></div><div class="actions"><button class="primary" type="submit" data-review-version="${review.revision}">Save review</button><span class="hint">${review.revision?'Revision '+review.revision+' · '+date(review.created):'No review saved'}</span></div></form></section>`;
}
function drawDelivery(){
  selectedEdition=edition(selectedEdition)?.id??state.editions[0]?.id??'';
  $('#view').innerHTML=`<h2>Deliver datasets and reopen workspaces</h2><p class="intro">Customer packages contain selected output data and reading instructions. Private workspace backups retain original files, recipes, provenance and review history.</p>
  <section class="card"><h3>Customer dataset</h3><form id="export-form"><div class="grid"><label class="wide">Result edition<select id="export-edition" required>${options(state.editions,selectedEdition,'id',e=>e.recipe.spec.name+' · v'+e.recipe.version+' · '+date(e.created))}</select></label><label>Format<select id="export-kind">${simpleOptions([['customer','Complete package — CSV, SQLite and guide'],['csv','CSV'],['sqlite','SQLite']], 'customer')}</select></label><label>CSV null marker<input id="export-null" value="\\N" required maxlength="80"></label></div><p class="hint">The marker must not equal any literal output value. SQLite preserves SQL NULL and empty text without a marker.</p><div class="actions"><button class="primary" type="submit" ${state.editions.length?'':'disabled'}>Create and download</button></div></form></section>
  <section class="card"><h3>Private workspace backup</h3><p>Keep the complete editable project, including its original CSV files, saved recipe versions, result editions and review history.</p><div class="actions"><button id="backup">Create complete backup</button></div><p class="hint">Store this archive privately. Downloaded customer packages are regenerable and are not nested inside the backup.</p></section>
  <section class="card"><h3>Receive and reopen a backup</h3><form id="receive-form"><div class="grid"><label>Private workspace ZIP<input id="receive-file" type="file" accept=".zip" required></label><label>New folder name<input id="receive-name" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}" placeholder="received-project"></label></div><p class="hint">Receives into a new folder beneath the operator’s configured receiving parent. Existing workspaces are never replaced. Larger than 12 MiB: use the CLI.</p><div class="actions"><button type="submit">Receive and open editable workspace</button>${workspaceKey!=='original'?'<button type="button" id="open-original">Return to original workspace</button>':''}</div></form></section>`;
}
async function upload(file){
  if(!file||file.size>12*1024*1024)throw Error('Choose a file up to 12 MiB; use the CLI for larger files.');
  const bytes=new Uint8Array(await file.arrayBuffer());const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {contentBase64:btoa(raw),sha256:[...hash].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
function download(result){
  const a=document.createElement('a');a.href='/api/download/'+encodeURIComponent(result.id)+'?workspace='+encodeURIComponent(workspaceKey);a.download='';a.hidden=true;document.body.append(a);a.click();a.remove();
}
async function runSaved(){
  const saved=state.recipes.find(r=>r.id===recipeId);
  if(!saved||JSON.stringify(saved.spec)!==JSON.stringify(draft))throw Error('Save the current recipe before creating its edition.');
  const result=await call('run',{recipe:recipeId,version:recipeVersion,request:crypto.randomUUID()});
  selectedEdition=result.id;tab='editions';await refresh();notice('Complete edition created: '+number(result.rows)+' output rows.');
}
$('#refresh').onclick=()=>task('Refreshing saved workspace…',async()=>{await refresh();notice('Saved workspace refreshed.');});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||busy)return;
  if(b.dataset.tab){tab=b.dataset.tab;draw();return;}
  if(b.dataset.source){task('Reading retained source records…',async()=>{await showSource(b.dataset.source);notice('Retained source records loaded.');});return;}
  if(b.dataset.sourcePage){task('Reading the source page…',()=>showSource(selectedSource,Number(b.dataset.sourcePage)));return;}
  if(b.dataset.editionPage){task('Reading the result page…',()=>showEdition(selectedEdition,Number(b.dataset.editionPage)));return;}
  if(b.dataset.resume||b.dataset.dismiss){task(b.dataset.resume?'Resuming the original saved operation…':'Dismissing the unfinished operation…',async()=>{const result=await call(b.dataset.resume?'resume':'dismiss',{request:b.dataset.resume??b.dataset.dismiss});if(result?.kind&&result?.filename)download(result);await refresh();notice(b.dataset.resume?'Original operation completed.':'Unfinished operation dismissed; its retained data remains available.');});return;}
  if(b.id==='new-recipe'){draft=blankDraft();recipeId=null;recipeVersion=0;draw();return;}
  if(b.id==='add-join'){const n=draft.joins.length+1;draft.joins.push({source:state.sources[n]?.id??state.sources[0]?.id??'',as:'joined'+n,kind:'left',cardinality:'many-to-many',emptyKeys:'unmatched',on:[{leftAlias:draft.base.as,leftColumn:source(draft.base.source)?.headers[0]??'',rightColumn:state.sources[n]?.headers[0]??''}]});draw();return;}
  if(b.dataset.removeJoin!==undefined){draft.joins.splice(Number(b.dataset.removeJoin),1);draw();return;}
  if(b.dataset.addKey!==undefined){const j=draft.joins[Number(b.dataset.addKey)];j.on.push({leftAlias:draft.base.as,leftColumn:'',rightColumn:''});draw();return;}
  if(b.dataset.removeKey!==undefined){const [i,k]=b.dataset.removeKey.split(':').map(Number);draft.joins[i].on.splice(k,1);draw();return;}
  if(b.id==='select-all'){const used=new Set();draft.columns=allColumns().map(c=>{let name=outputName(c),n=2;while(used.has(name))name=outputName(c).slice(0,43)+'_'+n++;used.add(name);return {source:c.source,column:c.column,name};});draw();return;}
  if(b.id==='run-recipe'){task('Creating the complete result edition…',runSaved);return;}
  if(b.id==='open-recipe'){const e=edition(selectedEdition);draft=structuredClone(e.recipe.spec);recipeId=e.recipe.id;recipeVersion=e.recipe.version;tab='recipe';draw();return;}
  if(b.id==='backup'){task('Creating the complete private backup…',async()=>{const out=await call('backup',{request:crypto.randomUUID()});download(out);notice('Private backup created. The browser is downloading the complete archive.');});return;}
  if(b.id==='open-original'){workspaceKey='original';sessionStorage.removeItem('blend-workspace');draft=null;selectedSource='';selectedEdition='';task('Reopening the original workspace…',async()=>{await refresh();notice('Original editable workspace reopened.');});}
});
document.addEventListener('input',event=>{
  const e=event.target;
  if(e.id==='recipe-name'&&draft)draft.name=e.value;
  if(e.dataset.outputName!==undefined){const c=allColumns()[Number(e.dataset.outputName)];const existing=draft.columns.find(o=>o.source===c.source&&o.column===c.column);if(existing)existing.name=e.value;}
});
document.addEventListener('change',event=>{
  const e=event.target;
  if(e.id==='load-recipe'){const r=state.recipes.find(r=>r.id===e.value);if(r){draft=structuredClone(r.spec);recipeId=r.id;recipeVersion=r.version;}else{draft=blankDraft();recipeId=null;recipeVersion=0;}draw();return;}
  if(e.id==='edition-select'){selectedEdition=e.value;draw();return;}
  if(e.id==='export-edition'){selectedEdition=e.value;return;}
  if(e.id==='base-source'){draft.base.source=e.value;draw();return;}
  function renameAlias(old,name){for(const j of draft.joins)for(const key of j.on)if(key.leftAlias===old)key.leftAlias=name;for(const c of draft.columns)if(c.source===old)c.source=name;}
  if(e.id==='base-alias'){renameAlias(draft.base.as,e.value);draft.base.as=e.value;draw();return;}
  for(const [key,field]of [['joinSource','source'],['joinKind','kind'],['joinCardinality','cardinality'],['joinEmpty','emptyKeys'],['joinAlias','as']])if(e.dataset[key]!==undefined){const j=draft.joins[Number(e.dataset[key])];if(field==='as')renameAlias(j.as,e.value);j[field]=e.value;draw();return;}
  if(e.dataset.leftKey!==undefined){const[i,k]=e.dataset.leftKey.split(':').map(Number);const value=e.value?JSON.parse(e.value):['',''];Object.assign(draft.joins[i].on[k],{leftAlias:value[0],leftColumn:value[1]});return;}
  if(e.dataset.rightKey!==undefined){const[i,k]=e.dataset.rightKey.split(':').map(Number);draft.joins[i].on[k].rightColumn=e.value;return;}
  if(e.dataset.output!==undefined){const i=Number(e.dataset.output),c=allColumns()[i];draft.columns=draft.columns.filter(o=>!(o.source===c.source&&o.column===c.column));if(e.checked)draft.columns.push({source:c.source,column:c.column,name:$(`[data-output-name="${i}"]`).value});}
});
document.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;if(busy)return;
  if(form.id==='import-form')task('Retaining and importing the complete CSV…',async()=>{const label=$('#input-label').value,delimiter=$('#delimiter').value,nullToken=$('#input-null').value||null,reference=$('#input-reference').value;const file=await upload($('#input-file').files[0]);const result=await http('/api/import',{...file,label,delimiter,nullToken,reference,request:crypto.randomUUID()});selectedSource=result.id;previewAfter=0;await refresh();notice('Imported '+number(result.rows)+' complete records from '+result.label+'.');});
  if(form.id==='recipe-form')task('Saving the explicit recipe version…',async()=>{const result=await call('recipe.save',{spec:draft,request:crypto.randomUUID(),recipe:recipeId,expected_version:recipeVersion});recipeId=result.id;recipeVersion=result.version;draft=structuredClone(result.spec);await refresh();notice('Recipe version '+recipeVersion+' saved. Create its complete edition when ready.');});
  if(form.id==='review-form')task('Saving edition review…',async()=>{await call('review',{edition:selectedEdition,decision:$('#decision').value,note:$('#review-note').value,reviewer:$('#reviewer').value,expected_revision:Number(form.querySelector('[data-review-version]').dataset.reviewVersion),request:crypto.randomUUID()});await refresh();notice('Review saved to this result edition.');});
  if(form.id==='export-form')task('Preparing the complete customer delivery…',async()=>{const result=await call('export',{edition:$('#export-edition').value,kind:$('#export-kind').value,null_token:$('#export-null').value,request:crypto.randomUUID()});download(result);notice('Complete customer delivery created. The browser is downloading the file.');});
  if(form.id==='receive-form')task('Receiving and reopening the complete workspace…',async()=>{const name=$('#receive-name').value,file=await upload($('#receive-file').files[0]);const result=await http('/api/receive',{...file,name,request:crypto.randomUUID()});workspaceKey=result.sessionWorkspace;sessionStorage.setItem('blend-workspace',workspaceKey);draft=null;recipeId=null;recipeVersion=0;selectedSource='';selectedEdition='';await refresh();notice('Received workspace opened. Original inputs, recipes, editions and review history are editable here.');});
});
try{await http('/api/session',{});try{await refresh();}catch(error){if(workspaceKey==='original')throw error;workspaceKey='original';sessionStorage.removeItem('blend-workspace');await refresh();}notice('Workspace ready. Choose an input, recipe or saved edition.');}catch(error){notice(error.message,true);}
