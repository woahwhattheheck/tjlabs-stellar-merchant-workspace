// MIT. Full original HILA sources, saved requests, named reviews and receiving.
'use strict';
const $ = id => document.getElementById(id);
const by = selector => [...document.querySelectorAll(selector)];
const LIMIT = 64 * 1024 * 1024;
const definitionFields = ['name','notes','editions','rules','selection','review','rowDecisions','cellDecisions'];
const axes = {country:['respondent_info/country','respondent_info/countries'],sector:['respondent_info/topic'],organization:['respondent_info/org_type'],role:['respondent_info/roles']};
const state = {saved:null,form:null,mapping:null,mappingSelection:null,review:null,report:null,rows:null,row:null,cell:null,page:0,local:null,db:null,key:null,launch:null,forms:new Map(),busy:false};
let token = location.hash.slice(1);
if (!/^[A-Za-z0-9_-]{43}$/.test(token)) token = sessionStorage.getItem('hila-console-token') || '';
if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
  sessionStorage.setItem('hila-console-token', token); history.replaceState(null,'',location.pathname);
}
function show(text, error=false) { $('message').textContent=String(text); $('message').classList.toggle('error',error); }
function element(tag, text, attrs={}) { const out=document.createElement(tag); if(text!==undefined) out.textContent=String(text); for(const [key,value] of Object.entries(attrs)) out.setAttribute(key,String(value)); return out; }
function json(value) { return JSON.stringify(value,null,2)+'\n'; }
function canonical(value) { if(Array.isArray(value)) return value.map(canonical); if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])); return value; }
function same(a,b) { return JSON.stringify(canonical(a))===JSON.stringify(canonical(b)); }
function parse(text) { const value=JSON.parse(text); if(new TextEncoder().encode(text).byteLength>LIMIT) throw Error('Complete JSON input exceeds 64 MiB'); return value; }
function short(value,max,required=false) { if(typeof value!=='string'||Array.from(value).length>max||value.includes('\0')||required&&!value.trim()) throw Error('Enter the complete bounded required field'); return value; }
function uuid() { return crypto.randomUUID(); }
async function sha(blob) { const bytes=blob instanceof Blob?await blob.arrayBuffer():new TextEncoder().encode(blob); return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function download(blob,name) { const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
function downloadJSON(value,name) { download(new Blob([json(value)],{type:'application/json'}),name); }
async function api(path,options={}) {
  const response=await fetch(path,{...options,redirect:'error',headers:{authorization:'Bearer '+token,...options.headers}});
  if(!response.ok) { const body=await response.text(); let message=body;try{message=JSON.parse(body).error||body;}catch{} const error=Error(message||('HTTP '+response.status));error.status=response.status;throw error; }
  return response;
}
async function get(path,params={}) { const url=new URL(path,location.origin);for(const [k,v]of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));return(await api(url.pathname+url.search)).json(); }
async function reportDownload(kind,html=false) { const v=requireSaved();const params={id:v.id,revision:v.revision,...(html?{}:{kind})};const url=new URL('/api/hila/'+(html?'html':'export'),location.origin);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);const r=await api(url.pathname+url.search);const blob=await r.blob();download(blob,'hila-'+(html?'offline-report.html':kind+'.zip'));show('Complete saved revision '+v.revision+' downloaded.'); }
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('stellar-forge-hila-review',1);req.onupgradeneeded=()=>{req.result.createObjectStore('workspaces');req.result.createObjectStore('operations');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function read(store,key){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,'readonly');const q=tx.objectStore(store).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function write(records){return new Promise((resolve,reject)=>{const tx=state.db.transaction([...new Set(records.map(x=>x.store))],'readwrite');for(const row of records)tx.objectStore(row.store).put(row.value,row.key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Original browser state could not be retained'));tx.onerror=()=>{};});}
let retaining=Promise.resolve();
const editable=['form-label','form-url','form-time','form-license','form-notice','source-label','edition-form','edition-acquisition','edition-source','edition-name','respondent-key','edition-kind','edition-label','edition-url','edition-time','period-start','period-end','edition-approved','edition-approved-time','edition-approval','method-form','method-json','review-name','review-before','review-after','review-notes','review-status','reviewer','review-note'];
function capture(){for(const id of editable)state.local.fields[id]=$(id).value;state.local.mapping=state.mapping;state.local.mappingSelection=state.mappingSelection;return structuredClone(state.local);}
function retain(){const snapshot=capture();retaining=retaining.catch(()=>{}).then(()=>write([{store:'workspaces',key:state.key,value:snapshot}]));return retaining;}
function selections(id,items,label,empty=null){const s=$(id),previous=s.value||state.local?.fields?.[id]||'';s.replaceChildren();if(empty!==null)s.append(element('option',empty,{value:''}));for(const item of items)s.append(element('option',label(item),{value:item.id}));if([...s.options].some(x=>x.value===previous))s.value=previous;}
function selectedList(id,name,items,label){const box=$(id);const previous=box.querySelector('input:checked')?.value;box.className='saved-list';box.replaceChildren();for(const item of items){const row=element('label'),radio=element('input',undefined,{type:'radio',name,value:item.id});radio.checked=item.id===previous||!previous&&item===items[0];row.append(radio,document.createTextNode(label(item)),element('small',item.id));box.append(row);}}
function selectedRadio(name){const input=document.querySelector('input[name="'+name+'"]:checked');if(!input)throw Error('Select an original saved record');return input.value;}
async function form(id){if(!id)throw Error('Select the original questionnaire');if(!state.forms.has(id))state.forms.set(id,await get('/api/hila/questionnaire',{id}));return state.forms.get(id);}
function title(field,language=null){const label=field?.label&&typeof field.label==='object'?field.label:field;const values=label?.translations||{};const key=language||Object.keys(values).find(x=>x.toLowerCase().startsWith('english'))||Object.keys(values)[0];const t=values[key];return typeof t==='string'?t:(t?.long||t?.label||t?.text||label?.text||'');}
function acquisitions(){const selected=$('edition-form').value;selections('edition-acquisition',state.saved.acquisitions.filter(x=>x.questionnaire===selected),x=>x.provenance.label+' · '+x.provenance.retrievedAt);}
async function refresh(){
  state.saved=await get('/api/state');
  $('connection').textContent='Original workspace open';$('workspace-identity').textContent=state.launch.workspace;
  const fs=state.saved.questionnaires,ed=state.saved.editions;
  selectedList('source-list','saved-source',state.saved.sources,x=>x.label+' · '+x.bytes.toLocaleString()+' bytes');
  selectedList('questionnaire-list','saved-form',fs,x=>x.title+' · '+x.languages.join(' / '));
  selectedList('edition-list','saved-edition',ed,x=>x.name+' · '+x.rows.toLocaleString()+' rows');
  selections('edition-form',fs,x=>x.title);selections('method-form',fs,x=>x.title);acquisitions();
  selections('edition-source',state.saved.sources,x=>x.label+' · '+x.name);
  selections('saved-review',state.saved.reviews,x=>x.name+' · revision '+x.revision,'Select saved review');
  selections('review-before',ed,x=>x.name);selections('review-after',ed,x=>x.name,'Single edition');selections('rows-edition',ed,x=>x.name);
  if(!state.local.restored){for(const[id,value]of Object.entries(state.local.fields))if($(id))$(id).value=value;state.local.restored=true;acquisitions();}
  await pendingUI();return state.saved;
}
async function exclusive(callback){
  if(!navigator.locks)throw Error('This browser needs Web Locks to preserve one original operation. Use the current browser or original CLI.');
  return navigator.locks.request('hila-operation:'+state.key,{ifAvailable:true},async lock=>{if(!lock)throw Error('Another tab is continuing the original operation');return callback();});
}
async function startOperation(kind,route,body,{blob=null,headers={},name=null}={}){
  await retain();
  return exclusive(async()=>{
    const saved=await read('workspaces',state.key);
    if(saved.pending)throw Error('Continue or reconcile the retained operation before starting another.');
    const id=body?.requestId||uuid();
    const operation={schema:'stellar-forge.hila-browser-operation.v1',id,workspace:state.key,kind,route,body,headers,
      ...(blob?{blob,name,bytes:blob.size,sha256:await sha(blob)}:{}),status:'PREPARED',created:new Date().toISOString()};
    const bytes=blob||new Blob([json(body)],{type:'application/json'});
    if(!blob&&bytes.size>LIMIT)throw Error('Complete request exceeds 64 MiB');
    operation.inputSha256=await sha(bytes);state.local.pending=id;
    await write([{store:'operations',key:state.key+':'+id,value:operation},{store:'workspaces',key:state.key,value:capture()}]);
    return dispatch(operation);
  });
}
async function dispatch(operation){
  if(operation.workspace!==state.key||operation.schema!=='stellar-forge.hila-browser-operation.v1')throw Error('Retained browser operation belongs to another workspace');
  const blob=operation.blob||new Blob([json(operation.body)],{type:'application/json'});
  if(await sha(blob)!==operation.inputSha256||operation.blob&&(blob.size!==operation.bytes||operation.sha256!==operation.inputSha256))throw Error('Retained complete input bytes changed');
  if(operation.status==='COMPLETE')return finishOperation(operation);
  operation={...operation,status:'INVOKING'};
  await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);await pendingUI();
  let result;
  try{
    if(operation.body?.requestId){
      try{
        const original=await get('/api/hila/request',{id:operation.body.requestId});
        if(original.kind!==operation.kind||!same(original.input,operation.body))throw Error('Original saved request differs from retained browser input');
        result=original.result;
      }catch(error){if(error.status!==400&&error.status!==404)throw error;}
    }
    if(result===undefined){const response=await api(operation.route,{method:'POST',headers:{'content-type':operation.blob?'application/octet-stream':'application/json',...operation.headers},body:blob});result=await response.json();}
    if(operation.body?.requestId){const original=await get('/api/hila/request',{id:operation.body.requestId});if(original.kind!==operation.kind||!same(original.input,operation.body)||!same(original.result,result))throw Error('Saved native request and full returned result differ');}
    operation={...operation,status:'COMPLETE',result,completed:new Date().toISOString()};
    await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);
    return finishOperation(operation);
  }catch(error){
    operation={...operation,status:error.status===400?'REJECTED':'RETURN_UNCERTAIN',failure:{message:String(error.message),httpStatus:error.status||null,observedAt:new Date().toISOString()}};
    await write([{store:'operations',key:state.key+':'+operation.id,value:operation}]);await pendingUI();throw error;
  }
}
async function finishOperation(operation){
  state.local.lastOperation=operation.id;
  if(operation.kind==='review.save'){await selectReview(operation.result,{retainNow:false});}
  if(operation.kind==='receive'){const selected=operation.result.review||operation.result; if(selected.id&&Number.isInteger(selected.revision))state.local.received={id:selected.id,revision:selected.revision};$('receive-result').hidden=false;$('receive-result').textContent=json(operation.result);}
  state.local.pending=null;
  await retain();await refresh();
  show('Original '+operation.kind+' completed. Its full input and result remain retained.');
  return operation.result;
}
async function pendingUI(){
  const saved=await read('workspaces',state.key);state.local.pending=saved?.pending||null;
  $('pending').hidden=!state.local.pending;if(!state.local.pending)return;
  const operation=await read('operations',state.key+':'+state.local.pending);
  if(!operation)throw Error('The original pending request is missing from browser storage');
  $('pending-text').textContent=operation.kind+' · '+operation.id+' · '+operation.status+(operation.failure?' · '+operation.failure.message:'');
  $('close-rejected').hidden=operation.status!=='REJECTED';
}
function requireSaved(){if(!state.review)throw Error('Open a saved review revision');return state.review;}
function draft(){const editions=[$('review-before').value,...($('review-after').value?[$('review-after').value]:[])];if(!editions[0]||new Set(editions).size!==editions.length)throw Error('Select one edition or two distinct editions');const value={name:short($('review-name').value,160,true),notes:short($('review-notes').value,8000),editions,rules:parse($('method-json').value),selection:{},review:{status:$('review-status').value,reviewer:short($('reviewer').value,160,$('review-status').value!=='draft'),note:short($('review-note').value,8000)},rowDecisions:state.local.rowDecisions,cellDecisions:state.local.cellDecisions};
  for(const axis of Object.keys(axes))value.selection[axis]=by('#cohort-'+axis+' input:checked').map(x=>JSON.parse(x.value));
  if(state.local.reviewSelection)value.id=state.local.reviewSelection.id,value.expectedRevision=state.local.reviewSelection.revision;return value;
}
async function renderCohorts(selection={}){
  const edition=state.saved.editions.find(x=>x.id===$('review-before').value);
  $('cohort-selections').replaceChildren();if(!edition)return;
  const catalogue=await form(edition.questionnaire);state.form=catalogue;
  for(const[axis,paths]of Object.entries(axes)){const box=element('div');box.id='cohort-'+axis;box.append(element('h3',axis==='organization'?'Organisation type':axis));const choices=new Map();
    for(const path of paths)for(const choice of catalogue.fields[path]?.choices||[])choices.set(choice.value,choice);
    const rows=[[null,{value:null}],...choices.entries()];
    for(const[value,choice]of rows){const label=element('label'),input=element('input',undefined,{type:'checkbox',value:JSON.stringify(value)});input.checked=(selection[axis]||[]).some(x=>x===value);label.append(input,document.createTextNode(value===null?'Missing membership':title(choice)||value));input.addEventListener('change',()=>action(async()=>{state.local.selection=Object.fromEntries(Object.keys(axes).map(a=>[a,by('#cohort-'+a+' input:checked').map(x=>JSON.parse(x.value))]));await retain();}));box.append(label);}
    $('cohort-selections').append(box);
  }
}
async function selectReview(view,{retainNow=true}={}){
  if(!view?.id||!Number.isInteger(view.revision))throw Error('Expected the complete saved review');
  state.review=view;state.report=null;state.cell=null;$('report-cells').replaceChildren();$('report-overview').replaceChildren();$('comparison').textContent='';$('cell-detail').hidden=true;state.local.reviewSelection={id:view.id,revision:view.revision};state.local.rowDecisions=structuredClone(view.rowDecisions);state.local.cellDecisions=structuredClone(view.cellDecisions);state.local.selection=structuredClone(view.selection);
  $('review-name').value=view.name;$('review-notes').value=view.notes;$('review-before').value=view.editions[0];$('review-after').value=view.editions[1]||'';
  $('review-status').value=view.review.status;$('reviewer').value=view.review.reviewer;$('review-note').value=view.review.note;$('method-json').value=json(view.rules);
  const edition=state.saved.editions.find(x=>x.id===view.editions[0]);if(edition)$('method-form').value=edition.questionnaire;
  $('review-identity').textContent=view.id+' · revision '+view.revision+' · definition '+view.definitionSha256;
  $('report-identity').textContent=view.name+' · saved revision '+view.revision;
  const history=await get('/api/hila/history',{id:view.id});selections('history',history.map(x=>({...x,id:String(x.revision)})),x=>'Revision '+x.revision+' · '+x.updated);$('history').value=String(view.revision);
  await renderCohorts(view.selection);decisionCounts();if(retainNow)await retain();
}
function decisionCounts(){$('decision-counts').textContent=state.local.rowDecisions.length+' respondent decisions · '+state.local.cellDecisions.length+' cell decisions retained in this draft.';}
async function loadMapping(){
  const questionnaire=$('edition-form').value,source=$('edition-source').value;
  const [preview,retained,catalogue]=await Promise.all([get('/api/hila/mapping',{questionnaire,source}),get('/api/source',{id:source}),form(questionnaire)]);
  state.form=catalogue;state.mapping=preview.mapping;state.mappingSelection={questionnaire,source,inventory:retained.inventory};
  $('respondent-key').replaceChildren(element('option','Source ordinal and row hash',{value:''}));
  for(const column of retained.inventory.columns)$('respondent-key').append(element('option',column.name,{value:column.name}));
  renderMapping();await retain();show('Original mapping suggestions loaded. '+preview.unresolved.length+' coded fields are missing or ambiguous; select their source explicitly where available.');
}
function renderMapping(){
  const table=$('mapping-rows');table.replaceChildren();if(!state.mappingSelection||!state.form)return;
  const search=$('mapping-search').value.toLowerCase(),columns=state.mappingSelection.inventory.columns;
  const fields=Object.entries(state.form.fields).filter(([,value])=>value.analysisAllowed);
  $('mapping-summary').textContent=Object.keys(state.mapping||{}).length+' selected mappings / '+fields.length+' original coded fields. Unmapped fields remain explicit in coverage.';
  for(const[path,field]of fields){if(search&&!(path+' '+title(field)).toLowerCase().includes(search))continue;const tr=element('tr'),td=element('td');td.append(element('code',path),element('small',title(field)));const selected=element('select');selected.append(element('option','Unmapped',{value:''}));for(const column of columns)selected.append(element('option',column.name,{value:column.name}));selected.value=state.mapping[path]||'';selected.addEventListener('change',()=>action(async()=>{if(selected.value)state.mapping[path]=selected.value;else delete state.mapping[path];await retain();$('mapping-summary').textContent=Object.keys(state.mapping).length+' selected mappings / '+fields.length+' original coded fields.';}));const cell=element('td');cell.append(selected);tr.append(td,cell);table.append(tr);}
}
async function editionInput(){
  if(!state.mappingSelection||state.mappingSelection.questionnaire!==$('edition-form').value||state.mappingSelection.source!==$('edition-source').value)throw Error('Load and review the mapping for this exact form and source');
  return{requestId:uuid(),name:short($('edition-name').value,120,true),questionnaire:$('edition-form').value,source:$('edition-source').value,acquisition:$('edition-acquisition').value,mapping:state.mapping,respondentKey:$('respondent-key').value||null,provenance:{kind:$('edition-kind').value,label:$('edition-label').value,sourceUrl:$('edition-url').value,obtainedAt:$('edition-time').value,periodStart:$('period-start').value,periodEnd:$('period-end').value,approvedBy:$('edition-approved').value,approvedAt:$('edition-approved-time').value,approval:$('edition-approval').value}};
}
async function loadRows(offset=0){
  state.rows=await get('/api/hila/rows',{edition:$('rows-edition').value,offset,limit:50});
  $('rows-page').textContent=(state.rows.total?offset+1:0)+'–'+(offset+state.rows.rows.length)+' / '+state.rows.total;
  $('rows-prev').disabled=offset===0;$('rows-next').disabled=state.rows.nextOffset===null;
  $('respondent-rows').replaceChildren();
  for(const row of state.rows.rows){const tr=element('tr'),d=state.local.rowDecisions.find(x=>x.edition===state.rows.edition&&x.recordId===row.recordId),button=element('button','Review');button.addEventListener('click',()=>{state.row={...row,edition:state.rows.edition};$('respondent-detail').hidden=false;$('respondent-json').textContent=json(state.row);$('row-decision').value=d?.decision||'';$('row-reviewer').value=d?.reviewer||$('reviewer').value;$('row-note').value=d?.note||'';});for(const v of[row.sourceRow,row.recordId,row.consent,d?.decision||''])tr.append(element('td',v));const td=element('td');td.append(button);tr.append(td);$('respondent-rows').append(tr);}
}
async function loadReport(){
  const view=requireSaved();state.report=await get('/api/hila/report',{id:view.id,revision:view.revision});state.page=0;
  $('report-overview').replaceChildren();
  for(const edition of state.report.editions){const box=element('div'),name=state.saved.editions.find(x=>x.id===edition.edition)?.name||edition.edition;box.append(element('h3',name),element('pre',json(edition.counts),{class:'details'}));$('report-overview').append(box);}
  $('comparison').textContent=json(state.report.comparison);
  selections('cell-dimension',Object.keys(state.form?.dimensions||{availability:0,accessibility:0,quality:0,use:0,awareness:0}).map(id=>({id})),x=>x.id,'All dimensions');
  renderCells();show('Complete report loaded for saved revision '+view.revision+'.');
}
function renderCells(){
  if(!state.report)return;const dimension=$('cell-dimension').value,axis=$('cell-axis').value,search=$('cell-search').value.toLowerCase();
  const cells=state.report.editions.flatMap(edition=>edition.cells.map(cell=>({...cell,edition:edition.edition}))).filter(c=>(!dimension||c.dimension===dimension)&&(!axis||c.axis===axis)&&(!search||(c.dimension+' '+c.axis+' '+c.value).toLowerCase().includes(search)));
  state.page=Math.min(state.page,Math.max(0,Math.ceil(cells.length/50)-1));const start=state.page*50;
  $('cells-page').textContent=(cells.length?start+1:0)+'–'+Math.min(start+50,cells.length)+' / '+cells.length;
  $('cells-prev').disabled=state.page===0;$('cells-next').disabled=start+50>=cells.length;$('report-cells').replaceChildren();
  for(const cell of cells.slice(start,start+50)){const tr=element('tr'),decision=state.local.cellDecisions.find(x=>x.key===cell.key);const name=state.saved.editions.find(x=>x.id===cell.edition)?.name||cell.edition;
    for(const v of[cell.dimension+' / '+cell.axis,cell.value===null?'Missing membership':cell.value,name,cell.respondents,cell.scoredRespondents,cell.meanScore??'Unconfigured / unavailable',decision?.decision||''])tr.append(element('td',v));
    const button=element('button','Review');button.addEventListener('click',()=>{state.cell=cell;$('cell-detail').hidden=false;$('cell-title').textContent=cell.dimension+' / '+cell.axis+' / '+(cell.value??'Missing membership');$('cell-json').textContent=json(cell);$('cell-decision').value=decision?.decision||'';$('cell-reviewer').value=decision?.reviewer||$('reviewer').value;$('cell-note').value=decision?.note||'';});const td=element('td');td.append(button);tr.append(td);$('report-cells').append(tr);
  }
}
async function action(callback){if(state.busy)return;state.busy=true;document.querySelector('main').inert=true;by('#pending button').forEach(x=>x.disabled=true);try{await callback();}catch(error){show(error.message||error,true);}finally{state.busy=false;document.querySelector('main').inert=false;by('#pending button').forEach(x=>x.disabled=false);}}
function on(id,event,callback){$(id).addEventListener(event,e=>{if(event==='submit')e.preventDefault();action(()=>callback(e));});}
by('[data-tab]').forEach(button=>button.addEventListener('click',()=>{by('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));by('.tab').forEach(x=>x.hidden=x.id!=='tab-'+button.dataset.tab);}));
on('refresh','click',async()=>{await refresh();show('Original saved state refreshed; the current draft remains selected.');});
on('form-upload','submit',async()=>{const file=$('form-file').files[0];if(!file||file.size>16*1024*1024)throw Error('Select the full XForm within 16 MiB');const provenance={label:$('form-label').value,url:$('form-url').value,retrievedAt:$('form-time').value,license:$('form-license').value,notice:$('form-notice').value};const metadata=new TextEncoder().encode(json(provenance));if(metadata.byteLength>262144)throw Error('Complete questionnaire provenance exceeds 256 KiB');await startOperation('questionnaire.add','/api/hila/questionnaire',null,{blob:new Blob([metadata,file]),name:'hila-questionnaire-input.bin',headers:{'X-HILA-Provenance-Bytes':String(metadata.byteLength)}});});
on('source-upload','submit',async()=>{const file=$('source-file').files[0];if(!file||file.size>100000000)throw Error('Select the full response source within 100,000,000 bytes');await startOperation('source.add','/api/source',null,{blob:file,name:file.name,headers:{'X-HILA-Name':encodeURIComponent(file.name),'X-HILA-Label':encodeURIComponent($('source-label').value)}});});
on('source-inspect','click',async()=>{$('source-details').hidden=false;$('source-details').textContent=json(await get('/api/source',{id:selectedRadio('saved-source')}));});
on('questionnaire-inspect','click',async()=>{$('questionnaire-details').hidden=false;$('questionnaire-details').textContent=json(await form(selectedRadio('saved-form')));});
on('questionnaire-download','click',async()=>downloadJSON(await form(selectedRadio('saved-form')),'hila-original-questionnaire-catalogue.json'));
on('edition-form','change',async()=>{acquisitions();await retain();});on('mapping-load','click',loadMapping);on('mapping-search','input',async()=>renderMapping());
on('edition-save','click',async()=>{const input=await editionInput();await startOperation('edition.save','/api/hila/edition',input);});
on('edition-inspect','click',async()=>{$('edition-details').hidden=false;$('edition-details').textContent=json(await get('/api/hila/edition',{id:selectedRadio('saved-edition')}));});
on('dataset-download','click',async()=>{const e=await get('/api/hila/edition',{id:selectedRadio('saved-edition')});const r=await api('/api/dataset-export?build='+e.build.id);download(await r.blob(),'hila-merchant-dataset.zip');});
on('method-template','click',async()=>{if($('method-json').value&&!confirm('Keep the current rules as a downloaded file before replacing this draft? Choose OK to download and load the original unconfigured template.'))return;if($('method-json').value)download(new Blob([$('method-json').value],{type:'application/json'}),'hila-previous-methodology.json');const rules=await get('/api/hila/rules-template',{questionnaire:$('method-form').value});$('method-json').value=json(rules);await retain();$('method-summary').textContent='Complete unconfigured template retained. Supply approved values and provenance before scoring.';});
on('method-file','change',async()=>{const f=$('method-file').files[0];if(!f||f.size>65536)throw Error('Methodology file must be at most 64 KiB');const rules=parse(await f.text());$('method-json').value=json(rules);await retain();});
on('method-validate','click',async()=>{const r=await api('/api/hila/rules',{method:'POST',headers:{'content-type':'application/json'},body:json({questionnaire:$('method-form').value,rules:parse($('method-json').value)})});const v=await r.json();$('method-summary').textContent='Complete rules validated · scoring '+v.status+' · disclosure '+v.disclosure.status;});
on('method-download','click',async()=>downloadJSON(parse($('method-json').value),'hila-selected-methodology.json'));
on('review-open','click',async()=>{await selectReview(await get('/api/hila/review',{id:$('saved-review').value}));show('Complete saved review selected.');});
on('history-open','click',async()=>{const v=requireSaved();await selectReview(await get('/api/hila/review',{id:v.id,revision:$('history').value}));show('Historical revision selected. A later save retains this exact expected revision.');});
on('review-new','click',async()=>{if(state.local.pending)throw Error('Continue the retained operation first');state.review=null;state.report=null;state.local.reviewSelection=null;state.local.rowDecisions=[];state.local.cellDecisions=[];state.local.selection={};$('review-name').value='';$('review-notes').value='';$('review-status').value='draft';$('review-note').value='';$('review-identity').textContent='New review draft';$('report-identity').textContent='Open a saved review.';await renderCohorts();decisionCounts();await retain();});
on('review-before','change',async()=>{await renderCohorts(state.local.selection);await retain();if(state.local.rowDecisions.length||state.local.cellDecisions.length)show('Existing decisions remain in the draft. The save validates every decision against this complete selected edition pair.');});
on('review-save','click',async()=>{const input={requestId:uuid(),...draft()};await startOperation('review.save','/api/hila/review',input);});
on('review-input-download','click',async()=>{const value={requestId:uuid(),...draft()};const body=json(value);if(new TextEncoder().encode(body).byteLength>LIMIT)throw Error('Complete request exceeds 64 MiB');download(new Blob([body],{type:'application/json'}),'hila-review-update.json');});
on('review-input-file','change',async()=>{const file=$('review-input-file').files[0];if(!file||file.size>LIMIT)throw Error('Select the complete review update within 64 MiB');const input=parse(await file.text());if(!input.requestId||!input.id||!Number.isInteger(input.expectedRevision))throw Error('Offline update must select its original saved review and expected revision');await startOperation('review.save','/api/hila/review',input);});
on('rows-load','click',()=>loadRows(0));on('rows-prev','click',()=>loadRows(Math.max(0,(state.rows?.offset||0)-50)));on('rows-next','click',()=>loadRows(state.rows?.nextOffset??0));
on('row-apply','click',async()=>{if(!state.row)throw Error('Select an original respondent');const ed=[$('review-before').value,$('review-after').value];if(!ed.includes(state.row.edition))throw Error('The row must belong to this review edition selection');const row=state.row,decision=$('row-decision').value;const list=state.local.rowDecisions.filter(x=>x.edition!==row.edition||x.recordId!==row.recordId);if(decision)list.push({edition:row.edition,recordId:row.recordId,decision,reviewer:short($('row-reviewer').value,160,true),note:short($('row-note').value,8000,true)});state.local.rowDecisions=list;decisionCounts();await retain();await loadRows(state.rows.offset);show('Named respondent decision retained in this draft. Save the review to publish a revision.');});
on('cell-apply','click',async()=>{if(!state.cell)throw Error('Select a full original cell');const decision=$('cell-decision').value,list=state.local.cellDecisions.filter(x=>x.key!==state.cell.key);if(decision)list.push({key:state.cell.key,decision,reviewer:short($('cell-reviewer').value,160,true),note:short($('cell-note').value,8000,true)});state.local.cellDecisions=list;decisionCounts();await retain();renderCells();show('Named cell decision retained in this draft. Save the review to publish a revision.');});
on('report-load','click',loadReport);on('report-json','click',async()=>{if(!state.report)await loadReport();downloadJSON(state.report,'hila-complete-analyst-report.json');});
on('report-html','click',()=>reportDownload(null,true));on('report-zip','click',()=>reportDownload('report'));on('review-zip','click',()=>reportDownload('workspace'));on('public-zip','click',()=>reportDownload('public'));
for(const id of ['cell-dimension','cell-axis','cell-search'])on(id,id==='cell-search'?'input':'change',async()=>{state.page=0;renderCells();});on('cells-prev','click',async()=>{state.page--;renderCells();});on('cells-next','click',async()=>{state.page++;renderCells();});
on('packet-receive','submit',async()=>{const file=$('packet-file').files[0];if(!file||file.size>4*1024*1024*1024)throw Error('Select the complete workspace ZIP within 4 GiB');await startOperation('receive','/api/import',null,{blob:file,name:file.name});});
on('retry','click',()=>exclusive(async()=>{await retaining;const local=await read('workspaces',state.key);if(!local.pending)throw Error('No retained operation is pending');return dispatch(await read('operations',state.key+':'+local.pending));}));
on('pending-download','click',async()=>{const op=await read('operations',state.key+':'+state.local.pending);if(op.blob){download(op.blob,op.name);const{blob,...metadata}=op;downloadJSON(metadata,'hila-retained-input-metadata.json');}else downloadJSON(op.body,'hila-retained-operation.json');});
on('close-rejected','click',()=>exclusive(async()=>{const local=await read('workspaces',state.key),op=await read('operations',state.key+':'+local.pending);if(op?.status!=='REJECTED'||op.failure?.httpStatus!==400)throw Error('The original operation has no definite rejected return');if(op.body?.requestId){try{const found=await get('/api/hila/request',{id:op.body.requestId});if(same(found.input,op.body))return finishOperation({...op,status:'COMPLETE',result:found.result});throw Error('The original request has changed');}catch(e){if(e.status!==400&&e.status!==404)throw e;}}state.local.pending=null;state.local.lastRejected=op.id;await retain();await pendingUI();show('The complete rejected input remains retained. Edit its successor and save a new request.');}));
for(const id of editable)$(id).addEventListener('input',()=>{if(state.local)retain().catch(error=>show('Draft could not be retained: '+error.message,true));});
async function initialize(){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Open the private console URL returned by the original command or Applications.');
  state.launch=await get('/api/launch');if(state.launch.schema!=='stellar-forge.hila-workspace-launch.v1')throw Error('This is not the original HILA workspace');
  state.key=state.launch.workspace;state.db=await openDB();state.local=await read('workspaces',state.key)||{schema:'stellar-forge.hila-browser-workspace.v1',workspace:state.key,fields:{},rowDecisions:[],cellDecisions:[],selection:{},pending:null,reviewSelection:null};
  if(state.local.schema!=='stellar-forge.hila-browser-workspace.v1'||state.local.workspace!==state.key)throw Error('Browser draft does not belong to this original workspace');
  state.mapping=state.local.mapping||null;state.mappingSelection=state.local.mappingSelection||null;state.local.restored=false;
  await refresh();if(state.mappingSelection){state.form=await form(state.mappingSelection.questionnaire);renderMapping();}
  if(state.local.reviewSelection){const selected=await get('/api/hila/review',state.local.reviewSelection);state.review=selected;$('review-identity').textContent=selected.id+' · saved revision '+selected.revision+' · retained edited draft';$('report-identity').textContent=selected.name+' · saved revision '+selected.revision;const history=await get('/api/hila/history',{id:selected.id});selections('history',history.map(x=>({...x,id:String(x.revision)})),x=>'Revision '+x.revision);$('history').value=String(selected.revision);}
  await renderCohorts(state.local.selection);decisionCounts();await retain();show(state.local.pending?'Original pending input recovered. Continue it from the retained operation panel.':'Original sources and saved reviews are ready. Complete browser drafts are retained on this console origin.');
}
initialize().catch(error=>{$('connection').textContent='Connection required';show(error.message,true);});
