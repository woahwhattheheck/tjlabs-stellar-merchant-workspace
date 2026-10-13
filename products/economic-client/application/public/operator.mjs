import { createReviewPanel } from './reviews.mjs';
// SPDX-License-Identifier: MIT
const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('economic-client-token');
if(token){sessionStorage.setItem('economic-client-token',token);history.replaceState(null,'',location.pathname);}
let state,capture,rowsNext=null,selected=[],rights={},companions=[],busy=false;
const pendingPrefix='economic-client-pending:'+location.origin;
function pendingKey(){return pendingPrefix+':'+(state?.project_id||'unbound');}
function pendingStorageKey(){return localStorage.getItem(pendingKey())!==null?pendingKey():pendingPrefix;}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=value=>JSON.stringify(value,null,2);
function message(value){$('message').textContent=value;}
function pending(){try{return JSON.parse(localStorage.getItem(pendingStorageKey())||'null');}catch{return null;}}
function pendingView(){const p=pending();$('pending').hidden=!p;$('pending-label').textContent=p?p.action+' · '+p.operation_id+' · '+(p.project_id||'unbound original project'):'';}
async function request(path,{body,method='GET',raw=false}={}){
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':body instanceof Blob?'application/gzip':'application/json'}:{})},
 body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body)});
 const content=await response.blob();if(!response.ok){let detail=await content.text();try{detail=JSON.parse(detail).error;}catch{}throw new Error(detail);}
 return raw?content:JSON.parse(await content.text());
}
async function action(name,input={},write=false){
 const proposed={action:name,input};
 let p;
 if(write){
  if(!state?.project_id)throw new Error('Open the original project before saving an operation');
  p=pending();
  if(p&&p.project_id!==state.project_id)throw new Error('This retained request names another or an unbound original project. Preserve it in history and reopen its original project; it cannot be dispatched here.');
  if(p&&(p.action!==name||JSON.stringify(p.input)!==JSON.stringify(input)))throw new Error('Continue the saved original request, or retain it in history before starting another action.');
  if(!p){p={...proposed,project_id:state.project_id,operation_id:'client-'+crypto.randomUUID()};localStorage.setItem(pendingKey(),JSON.stringify(p));pendingView();}
 }
 const result=await request('/api/action',{method:'POST',body:p||proposed});
 if(write){localStorage.removeItem(pendingKey());pendingView();}
 return result;
}
async function task(fn){
 if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;message('Working on the original saved operation…');
 try{await fn();message('Saved operation completed.');}catch(error){message(error.message);}
 finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;pendingView();}
}
function options(id,rows,value,label){const previous=$(id).value;$(id).innerHTML=rows.map(r=>'<option value="'+escape(value(r))+'">'+escape(label(r))+'</option>').join('');if(rows.some(r=>String(value(r))===previous))$(id).value=previous;}
function loadDraft(draft){
 selected=structuredClone(draft?.series||[]);rights=structuredClone(draft?.rights||{});companions=[...(draft?.companion_ids||[])];
 for(const[id,key]of [['title','title'],['audience','audience'],['prepared-by','prepared_by'],['summary','summary'],['notes','editorial_notes']])$(id).value=draft?.[key]||'';
 renderSelections();
}
async function refresh({draft=true}={}){
 if(state&&!draft)readDraft();
 state=await request('/api/state');$('identity').textContent=state.label+' · '+state.project_id+' · revision '+state.revision;
 $('config').value=pretty(state.config);options('capture-list',state.captures,r=>r.id,r=>r.dataset_ref+' · '+r.id);
 options('compare-before',state.briefings,r=>r.id,r=>r.revision+' · '+r.title);options('compare-after',state.briefings,r=>r.id,r=>r.revision+' · '+r.title);
 options('reopen-companion',state.companions,r=>r.id,r=>r.label+' · '+r.briefing_id);
 $('edition-list').innerHTML=state.briefings.slice().reverse().map(r=>'<article><h2>Edition '+r.revision+' · '+escape(r.title)+'</h2><p class="muted">'+escape(r.created_at)+' · '+escape(r.id)+'</p>'+
 Object.keys(r.files).map(name=>'<button data-download="'+escape(r.id)+'" data-name="'+escape(name)+'">'+escape(name)+'</button>').join('')+
 '<button data-activate="'+escape(r.id)+'">Make active edition</button></article>').join('');
 $('operations').innerHTML=state.requests.slice().reverse().map(r=>'<details><summary>'+escape(r.action)+' · '+escape(r.state)+' · '+escape(r.operation_id)+'</summary><pre>'+escape(pretty(r))+'</pre></details>').join('');
 if(draft)loadDraft(state.draft);else renderSelections();
 await reviewPanel.refresh();
}
function readDraft(){
 for(const card of document.querySelectorAll('.series-card')){
  const row=selected[Number(card.dataset.index)];for(const field of card.querySelectorAll('[data-field]'))row[field.dataset.field]=field.value;
 }
 for(const card of document.querySelectorAll('.rights-card'))for(const field of card.querySelectorAll('[data-right]'))rights[card.dataset.capture][field.dataset.right]=field.value;
 companions=[...document.querySelectorAll('[data-companion]:checked')].map(x=>x.dataset.companion);
 return {title:$('title').value,audience:$('audience').value,prepared_by:$('prepared-by').value,summary:$('summary').value,
  editorial_notes:$('notes').value,series:structuredClone(selected),rights:structuredClone(rights),companion_ids:companions};
}
function renderSelections(){
 $('selected-series').innerHTML=selected.map((r,i)=>'<article class="series-card" data-index="'+i+'"><h2>'+escape(r.title||'Selected native series')+'</h2><p class="muted">'+escape(r.capture_id)+' · '+escape(r.series_id)+'</p>'+
 '<label>Client title<input data-field="title" value="'+escape(r.title)+'"></label><div class="row"><label>Classification<select data-field="role">'+['observed','forecast','mixed','unclassified'].map(x=>'<option '+(x===r.role?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
 '<label>Original frequency<input data-field="frequency" value="'+escape(r.frequency)+'"></label><label>Original units<input data-field="units" value="'+escape(r.units)+'"></label></div>'+
 ['adjustment','methodology','interpretation','start','end'].map(f=>'<label>'+escape(f.replace(/_/g,' '))+'<input data-field="'+f+'" value="'+escape(r[f])+'"></label>').join('')+
 '<button type="button" data-remove="'+i+'">Remove from this draft</button></article>').join('');
 const ids=[...new Set(selected.map(r=>r.capture_id))];
 $('source-rights').innerHTML=ids.map(id=>'<article class="rights-card" data-capture="'+escape(id)+'"><h2>Customer source terms</h2><p>'+escape(id)+'</p>'+
 ['citation','terms','customer_use','source_url','access_basis','notes'].map(f=>'<label>'+escape(f.replace(/_/g,' '))+'<textarea data-right="'+f+'" rows="2">'+escape(rights[id]?.[f]||'')+'</textarea></label>').join('')+'</article>').join('');
 $('companions').innerHTML=(state?.companions||[]).map(c=>'<label class="check"><input type="checkbox" data-companion="'+escape(c.id)+'" '+(companions.includes(c.id)?'checked':'')+'>'+escape(c.label)+' · '+escape(c.briefing_id)+'</label>').join('')||'<p>No original companion edition attached.</p>';
}
async function inspectCapture(){
 capture=await action('capture-info',{capture_id:$('capture-list').value});
 options('series-list',capture.series,r=>r.id,r=>JSON.stringify(r.series_key)+' · '+r.observation_count+' observations');
 $('capture-metadata').textContent=pretty(capture);rowsNext=null;$('row-page').innerHTML='';$('next-rows').hidden=true;
}
async function rows(offset=0){
 const result=await action('rows',{capture_id:$('capture-list').value,series_id:$('series-list').value,offset,limit:100});
 $('row-page').innerHTML='<p>'+result.offset+'–'+(result.offset+result.rows.length)+' of '+result.total+'</p><pre>'+escape(pretty(result.rows))+'</pre>';
 rowsNext=result.next_offset;$('next-rows').hidden=rowsNext===null;
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const reviewPanel=createReviewPanel({$,action,request,task,download,getState:()=>state,refresh,readDraft});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
 for(const p of document.querySelectorAll('[data-panel]'))p.hidden=p.dataset.panel!==button.dataset.view;
 for(const b of document.querySelectorAll('[data-view]'))b.dataset.active=String(b===button);
});
$('refresh').onclick=()=>task(()=>refresh());
$('resume').onclick=()=>task(async()=>{const p=pending();if(!p)return;const result=await action(p.action,p.input,true);$('preview-result').textContent=pretty(result);await refresh();});
$('clear-pending').onclick=()=>{const p=pending(),storedKey=pendingStorageKey();if(p)localStorage.setItem(storedKey+':history:'+p.operation_id,JSON.stringify(p));localStorage.removeItem(storedKey);pendingView();message('The original request remains unchanged in its browser history. Reopen its original project to reconcile it before issuing an equivalent new request.');};
$('registry-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 readDraft();const input={kind:$('registry-kind').value,detail:'full',relations:'references'};
 for(const[id,key]of [['registry-agency','agencyids'],['registry-ids','ids'],['registry-versions','versions']])if($(id).value)input[key]=$(id).value;
 const result=await action('registry',input,true);$('registry-result').textContent=pretty(result);await refresh({draft:false});
});};
$('capture-form').onsubmit=e=>{e.preventDefault();task(async()=>{
 readDraft();const release={kind:$('release-kind').value};if(['timestamp','description'].includes(release.kind))release.value=$('release-value').value;
 const input={dataset:{agencyid:$('agency').value,id:$('dataset').value,version:$('version').value},release,
  series_keys:JSON.parse($('series-keys').value||'[]'),hist_obs:$('historical').checked};
 if($('source-start').value)input.start=$('source-start').value;if($('source-end').value)input.end=$('source-end').value;
 const result=await action('capture',input,true);await refresh({draft:false});$('capture-list').value=result.capture_id;await inspectCapture();
});};
$('inspect-capture').onclick=()=>task(inspectCapture);$('load-rows').onclick=()=>task(()=>rows());$('next-rows').onclick=()=>task(()=>rows(rowsNext));
$('add-series').onclick=()=>task(async()=>{
 readDraft();if(!capture||capture.operation_id!==$('capture-list').value)await inspectCapture();
 const row=capture.series.find(r=>r.id===$('series-list').value);if(!row)throw new Error('Select an original series');
 if(selected.some(r=>r.capture_id===capture.operation_id&&r.series_id===row.id))throw new Error('This original series is already selected');
 selected.push({capture_id:capture.operation_id,series_id:row.id,title:JSON.stringify(row.series_key),role:'unclassified',frequency:'',units:'',adjustment:'',methodology:'',interpretation:'',start:'',end:''});
 rights[capture.operation_id]??={citation:'Codera EconData, '+capture.dataset_ref+', release '+JSON.stringify(capture.release)+', accessed '+capture.acquired_at,
  terms:'https://econdata.co.za/terms-of-service/',customer_use:'',source_url:capture.sources?.find(s=>s.url)?.url||'https://www.econdata.co.za/sdmx-codera/v1',
  access_basis:'',notes:''};
 renderSelections();document.querySelector('[data-view="briefing"]').click();
});
$('selected-series').onclick=e=>{const button=e.target.closest('[data-remove]');if(button){readDraft();selected.splice(Number(button.dataset.remove),1);renderSelections();}};
$('draft-form').onsubmit=e=>{e.preventDefault();task(async()=>{await action('save-draft',{expected_revision:state.revision,draft:readDraft()},true);await refresh();});};
$('preview').onclick=()=>task(async()=>{$('preview-result').textContent=pretty(await action('preview',readDraft()));});
$('save-briefing').onclick=()=>task(async()=>{await action('save-briefing',{expected_revision:state.revision,draft:readDraft()},true);await refresh();document.querySelector('[data-view="editions"]').click();});
$('compare').onclick=()=>task(async()=>{$('comparison').textContent=pretty(await action('compare',{before:$('compare-before').value,after:$('compare-after').value}));});
$('edition-list').onclick=e=>{const d=e.target.closest('[data-download]'),a=e.target.closest('[data-activate]');if(d)task(async()=>download(await request('/api/file?id='+encodeURIComponent(d.dataset.download)+'&name='+encodeURIComponent(d.dataset.name),{raw:true}),d.dataset.name));if(a)task(async()=>{await action('activate',{expected_revision:state.revision,briefing_id:a.dataset.activate},true);await refresh();});};
$('save-config').onclick=()=>task(async()=>{await action('configure',{expected_revision:state.revision,config:JSON.parse($('config').value)},true);await refresh({draft:false});});
$('export-project').onclick=()=>task(async()=>download(await request('/api/project',{raw:true}),'economic-client-project.json.gz'));
$('import-project').onclick=()=>task(async()=>{const file=$('project-upload').files[0];if(!file)throw new Error('Select the complete original project');await request('/api/project',{method:'POST',body:file});await refresh();});
$('oecd-state').onclick=()=>task(async()=>{$('oecd-result').textContent=pretty(await action('oecd-state'));});
$('oecd-seed').onclick=()=>task(async()=>{
 const capture=await action('oecd-seed',{},true);$('oecd-result').textContent=pretty(capture);
 $('oecd-request').value=pretty({operation_id:'client-oecd-'+crypto.randomUUID(),capture_id:capture.id,countries:['CAN','DEU','FRA','GBR','ITA','JPN','USA'],
 start_period:'2024-01',end_period:null,title:'OECD leading-indicator client briefing',notes:'Original selected monthly observations with complete source metadata and customer project.'});
 await refresh({draft:false});
});
$('oecd-save').onclick=()=>task(async()=>{const result=await action('oecd-save',JSON.parse($('oecd-request').value),true);$('oecd-result').textContent=pretty(result);$('oecd-id').value=result.id;await refresh({draft:false});});
$('oecd-attach').onclick=()=>task(async()=>{const result=await action('oecd-attach',{briefing_id:$('oecd-id').value},true);await refresh({draft:false});if(!companions.includes(result.id))companions.push(result.id);renderSelections();});
$('reopen-oecd').onclick=()=>task(async()=>{const result=await action('oecd-reopen',{companion_id:$('reopen-companion').value},true);$('oecd-result').textContent=pretty(result);await refresh({draft:false});});
pendingView();document.querySelector('[data-view="sources"]').click();task(()=>refresh());
