// MIT. Complete offline recipient workspace over the original native delivery.
import {createRecipientCore} from './recipient-core.mjs';
const WORKSPACE_SCHEMA='stellar-forge.openfema-recipient-workspace.v1';
const css=":root{color-scheme:light;font-family:Arial,Helvetica,sans-serif;color:#202124;background:#f4f4f4;font-size:15px;line-height:1.5}*{box-sizing:border-box}body{margin:0}body>header,main,body>footer{max-width:1600px;margin:0 auto;padding:20px 28px}body>header{border-bottom:1px solid #c7c7c7;background:#fff}header p{margin:0}h1{font-size:30px;line-height:1.2;margin:4px 0 10px}h2{font-size:19px;margin:0 0 12px}h3{font-size:16px}p{margin:8px 0 16px}.eyebrow{font-size:11px;letter-spacing:.12em;font-weight:700}.main-heading,.row-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.identity{display:grid;font-size:13px;text-align:right;flex-shrink:0}.panel{background:#fff;border:1px solid #c5c5c5;padding:20px;margin:0 0 18px;min-width:0}.actions,.file-row,.filters,.pagination{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.file-row{border-top:1px solid #ddd;margin-top:16px;padding-top:16px}.file-row label{flex-basis:100%}.actions>label{min-width:220px}.two-column{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}.reviewer{display:grid;grid-template-columns:minmax(180px,1fr) minmax(0,2fr);gap:16px}.editor-fields{display:grid;grid-template-columns: minmax(120px,.4fr) minmax(0,1fr);gap:12px;align-items:start;margin:20px 0}label{font-weight:600;font-size:13px;display:block}label small,dt small{display:block;color:#5d5d5d;font-weight:400;margin-top:3px}input,textarea,select,button{font:inherit;color:inherit;border:1px solid #aaa;border-radius:2px;background:#fff;max-width:100%;min-width:0}input,textarea,select{padding:8px;width:100%;font-weight:400;margin-top:4px}textarea{resize:vertical;line-height:1.4;overflow-wrap:anywhere}button{padding:8px 11px;font-size:13px;font-weight:600;cursor:pointer}button:hover{background:#ececec;border-color:#666}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid #111;outline-offset:3px}.check{display:flex;align-items:center;gap:6px}.check input{width:auto;margin:0}.filters{align-items:flex-end;margin-bottom:14px}.filters>label:first-child{flex:1;min-width:150px}.table-wrap{max-width:100%;overflow:auto;border:1px solid #ddd}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px;vertical-align:top;text-align:left;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{background:#f0f0f0;font-weight:700}td small{display:block;color:#5e5e5e}.selected td{background:#eee}.pagination{justify-content:space-between;margin-top:12px;font-size:13px}.small{font-size:12px;color:#595959}.mono,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.wrap,pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}pre{background:#f4f4f4;border:1px solid #ddd;padding:12px;max-height:460px;overflow:auto}details{border-top:1px solid #ddd;margin-top:16px;padding-top:12px}summary{cursor:pointer;font-size:13px;font-weight:600}dl{display:grid;grid-template-columns:minmax(100px,.4fr) minmax(0,1fr);gap:8px 15px;font-size:13px}dt,dd{margin:0;overflow-wrap:anywhere;border-bottom:1px solid #eee;padding-bottom:8px}dt{font-weight:600}.empty{padding:20px;background:#f5f5f5;font-size:13px}.original-files>div{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:10px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere}.original-files small{display:block;color:#666}#status{font-size:13px}#error{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #444;padding-left:12px;margin-top:8px}#error:empty{display:none}[inert]{opacity:.8;cursor:progress}footer{border-top:1px solid #ccc;padding-top:18px;font-size:13px;color:#555}@media(max-width:900px){.two-column{grid-template-columns:1fr}.identity{text-align:left}.main-heading{flex-direction:column}.identity{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:100%}}@media(max-width:540px){body>header,main,body>footer{padding:16px 12px}.panel{padding:14px}.reviewer,.editor-fields{grid-template-columns:1fr}.editor-fields{gap:5px}.editor-fields textarea,.editor-fields input,.editor-fields select{margin-bottom:12px}.row-heading{flex-direction:column}.identity{grid-template-columns:1fr;gap:2px}.actions>*{flex:1 1 100%}.actions>label{min-width:0}.file-row input{width:100%}.original-files>div{flex-wrap:wrap}h1{font-size:26px}.pagination{gap:6px}dl{grid-template-columns:1fr}dt{border-bottom:0}dd{padding-bottom:12px}}@media print{body{background:#fff}body>header,main{padding:10px}.panel{break-inside:avoid}.actions,.file-row,.filters,.pagination,button{display:none}.two-column{display:block}.table-wrap{overflow:visible}pre{max-height:none}}";
const escapedJson=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function recipientBrowserMain(createRecipientCore) {
  'use strict';
  const C=createRecipientCore(),SCHEMA='stellar-forge.openfema-recipient-workspace.v1';
  const root=document.querySelector('#workspace'),status=document.querySelector('#status'),errorBox=document.querySelector('#error');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>structuredClone(v),token=()=>crypto.randomUUID(),text=v=>v===null||v===undefined?'':String(v);
  const safeJson=v=>JSON.stringify(v).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  const bytes=t=>new TextEncoder().encode(t).length;
  let S=null,db=null,timer=null,queue=Promise.resolve(),serial=0,busy=false,storageFailure=null,offered=null,rescuedEnvelope=null;
  const WORKING_FILE_LIMIT=512*1024*1024;
  const editable=p=>p.issued.manifest.mapping.columns.filter(c=>c.source===null||['review.status','review.disposition','review.priority','review.owner','review.dueDate','review.note'].includes(c.source));
  const title=p=>p.issued.manifest.mapping.target.name;
  const prep=()=>({query:'',changedOnly:false,offset:0,selectedKey:null,actor:'',note:'',editionName:'',drafts:{}});
  const cellValue=(row,column)=>Object.hasOwn(S.preparation.drafts[row.key]||{},column)?S.preparation.drafts[row.key][column]:text(row.values[column]);
  const need=(v,m)=>{if(!v)throw new Error(m);};
  function normalizePreparation(value,project){
    need(!value||Object.keys(value).every(k=>Object.hasOwn(prep(),k)),'Use the declared complete recipient preparation fields.');
    const p={...prep(),...(value||{})},validKeys=new Set(project.issued.manifest.rows.map(r=>r.key)),allowed=new Set(editable(project).map(c=>c.column));
    need(typeof p.query==='string'&&p.query.length<=2000,'Keep the project search within 2,000 characters.');
    need(typeof p.actor==='string'&&p.actor.length<=200&&typeof p.note==='string'&&p.note.length<=12000,'Keep the reviewer and review reason within their original field limits.');
    need(typeof p.editionName==='string'&&p.editionName.length<=200,'Keep the edition name within 200 characters.');
    need(p.drafts&&typeof p.drafts==='object'&&!Array.isArray(p.drafts),'Use the complete retained row preparation.');
    const drafts={};
    for(const [key,values] of Object.entries(p.drafts)){
      need(validKeys.has(key)&&values&&typeof values==='object'&&!Array.isArray(values),'A prepared row must belong to this original delivery.');
      drafts[key]={};
      for(const [column,value]of Object.entries(values)){need(allowed.has(column)&&typeof value==='string'&&bytes(value)<=C.LIMITS.csvBytes,'A prepared cell must use an editable original column.');drafts[key][column]=value;}
    }
    need(bytes(JSON.stringify(drafts))<=C.LIMITS.projectBytes,'Retain complete preparation within the recipient project capacity.');
    p.drafts=drafts;p.changedOnly=Boolean(p.changedOnly);p.offset=Number.isSafeInteger(p.offset)&&p.offset>=0?p.offset:0;
    p.selectedKey=validKeys.has(p.selectedKey)?p.selectedKey:project.issued.manifest.rows[0]?.key??null;
    return p;
  }
  async function readEnvelope(value,{separate=false}={}){
    need(value&&value.schema===SCHEMA&&typeof value.project==='string','Open a complete OpenFEMA recipient working file.');
    const project=await C.importProject(value.project),preparation=normalizePreparation(value.preparation,project);
    const id=typeof value.copyId==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(value.copyId)?value.copyId:'recipient-'+project.id;
    need(!value.originCopyId||(typeof value.originCopyId==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(value.originCopyId)),'Keep the complete original working-copy identity.');
    return {schema:SCHEMA,project,preparation,copyId:separate?'recipient-'+token():id,originCopyId:value.originCopyId||id,storeRevision:0};
  }
  const envelope=(s=S)=>({schema:SCHEMA,copyId:s.copyId,originCopyId:s.originCopyId,project:C.exportProject(s.project),preparation:clone(s.preparation)});
  const key=s=>'openfema-recipient:'+s.copyId;
  function openDatabase(){
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open('stellar-forge-openfema-recipient',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('copies');
      r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Another browser session is retaining this working-file store.'));
      r.onsuccess=()=>resolve(r.result);
    });
  }
  function readSaved(k){return new Promise((resolve,reject)=>{const t=db.transaction('copies','readonly'),r=t.objectStore('copies').get(k);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  function writeSaved(k,value,expectedRevision){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('copies','readwrite'),store=tx.objectStore('copies');let next,reason=null;
      const r=store.get(k);
      r.onsuccess=()=>{
        const current=r.result?.revision||0;
        if(current!==expectedRevision){reason=new Error('Another window saved this working copy. Download your complete working file, then open it as a separate copy.');tx.abort();return;}
        next={revision:current+1,savedAt:new Date().toISOString(),envelope:value};store.put(next,k);
      };
      r.onerror=()=>{reason=r.error;};tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(reason||tx.error||new Error('The browser could not save this complete copy.'));tx.onerror=()=>{};
    });
  }
  function show(message,bad=false){(bad?errorBox:status).textContent=message;if(!bad)errorBox.textContent='';}
  function schedule(){
    serial++;clearTimeout(timer);status.textContent='Preparation changed';
    timer=setTimeout(()=>{timer=null;persistCurrent().catch(e=>{storageFailure=e;show(e.message,true);});},450);
  }
  function persistCurrent(){
    if(!db){show('Browser storage is unavailable. Download the complete working file to retain this preparation.',true);return Promise.resolve(null);}
    const owner=S,selection=key(owner),value=envelope(owner),at=serial;
    const work=queue.catch(()=>{}).then(async()=>{
      need(S===owner&&key(S)===selection,'The selected working copy changed before its save.');
      const saved=await writeSaved(selection,value,owner.storeRevision);owner.storeRevision=saved.revision;
      storageFailure=null;if(at===serial)show('Saved in this browser · revision '+saved.revision);return saved;
    });
    queue=work;return work;
  }
  async function flush({allowFailure=false}={}){
    clearTimeout(timer);timer=null;
    try{await queue;await persistCurrent();}catch(e){storageFailure=e;if(!allowFailure)throw e;}
  }
  async function adopt(candidate,{separate=false}={}){
    const next={...candidate,preparation:normalizePreparation(candidate.preparation,candidate.project)};
    if(separate){next.copyId='recipient-'+token();next.storeRevision=0;}
    if(db){
      const saved=await writeSaved(key(next),envelope(next),next.storeRevision);next.storeRevision=saved.revision;
    }
    S=next;serial++;if(db)storageFailure=null;render();show(db?'Saved in this browser · revision '+S.storeRevision:'Preparation updated. Download editable project to retain changes.',!db);
  }
  async function run(action,{allowSaveFailure=false}={}){
    if(busy)return;busy=true;root.inert=true;root.setAttribute('aria-busy','true');clearTimeout(timer);
    try{await flush({allowFailure:allowSaveFailure});await action();}
    catch(e){show(e.message||String(e),true);}
    finally{busy=false;root.inert=false;root.removeAttribute('aria-busy');}
  }
  function download(name,content,type){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
    a.href=url;a.download=String(name).replace(/[\\/\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'').slice(0,220)||'OpenFEMA_original';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const basename=()=>('OpenFEMA_Recipient_'+S.project.id.replace(/[^a-z0-9_-]/gi,'_').slice(0,60));
  function fullFile(){const value=JSON.stringify(envelope())+'\n';need(bytes(value)<=WORKING_FILE_LIMIT,'The complete working file exceeds its 512 MiB receiving capacity. Preserve the original file and current browser preparation.');return value;}
  const currentIdentity=()=>C.sha256(fullFile());
  function preserveDeparture(){need((db&&!storageFailure)||rescuedEnvelope===currentIdentity(),'Download the complete current editable project before replacing this unsaved preparation. Its full file can then be reopened separately.');}
  function fullHtml(){
    const copy=document.documentElement.cloneNode(true);
    copy.querySelector('#recipient-source').textContent=safeJson(envelope());
    copy.querySelector('#workspace').innerHTML='<p>Opening the complete recipient project…</p>';
    copy.querySelector('#workspace').removeAttribute('inert');copy.querySelector('#workspace').removeAttribute('aria-busy');
    copy.querySelector('#status').textContent='Opening complete working file';copy.querySelector('#error').textContent='';
    return '<!doctype html>\n'+copy.outerHTML;
  }
  const rowByKey=k=>{const index=S.project.issued.manifest.rows.findIndex(r=>r.key===k);if(index<0)return null;const issued=S.project.issued.manifest.rows[index];return {...issued,issuedValues:issued.values,values:S.project.values[k]||issued.values};};
  const pending=()=>Object.values(S.preparation.drafts).reduce((n,v)=>n+Object.keys(v).length,0);
  function allChanges(){
    return Object.entries(S.preparation.drafts).flatMap(([key,values])=>Object.entries(values).map(([column,value])=>({key,column,value})));
  }
  async function commitPrepared(){
    const changes=allChanges();if(!changes.length)return;
    need(S.preparation.actor.trim(),'Enter the receiving reviewer before recording prepared decisions.');
    const project=C.updateCells(S.project,changes,{expectedRevision:S.project.revision,actor:S.preparation.actor,note:S.preparation.note});
    await adopt({...S,project,preparation:{...clone(S.preparation),drafts:{}}});
  }
  const option=(value,label,current)=>'<option value="'+esc(value)+'"'+(value===current?' selected':'')+'>'+esc(label)+'</option>';
  const button=(action,label,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+label+'</button>';
  function editableControl(column,value){
    const id='cell-'+S.project.issued.manifest.mapping.columns.indexOf(column),attr=' id="'+id+'" data-cell="'+esc(column.column)+'"';
    let input;
    const states=column.source==='review.status'?['open','reviewed','follow_up','resolved']:column.source==='review.disposition'?['include','exclude']:column.source==='review.priority'?['low','normal','high']:null;
    if(states){input='<select'+attr+'>'+(!states.includes(value)?option(value,value||'Empty',value):'')+states.map(v=>option(v,v,value)).join('')+'</select>';}
    else if(column.source==='review.note'||column.source===null){input='<textarea'+attr+' rows="'+(column.source==='review.note'?5:3)+'"'+(column.source==='review.note'?' maxlength="12000"':'')+'>'+esc(value)+'</textarea>';}
    else input='<input'+attr+' type="text" value="'+esc(value)+'" maxlength="'+(column.source==='review.owner'?200:column.source==='review.dueDate'?10:12000)+'"'+(column.source==='review.dueDate'?' placeholder="YYYY-MM-DD"':'')+'>';
    return '<label for="'+id+'">'+esc(column.column)+'<small>'+esc(column.source||'Customer-owned field')+'</small></label>'+input;
  }
  function renderRow(){
    const r=rowByKey(S.preparation.selectedKey);if(!r)return '<p class="empty">This source edition has no issued project rows. Its source scope and complete files remain available below.</p>';
    const fields=editable(S.project),m=S.project.issued.manifest;
    const source=m.mapping.columns.filter(c=>!fields.some(e=>e.column===c.column));
    return '<header class="row-heading"><div><p class="eyebrow">Selected original project</p><h2>'+esc(r.disasterNumber)+' / '+esc(r.projectId)+'</h2></div>'+button('revert-row','Prepare issued values')+'</header>'+
      '<p class="mono wrap">'+esc(r.key)+'</p><p>Source values and project identity stay with the issued delivery. Record your analyst decision or customer-owned value in the reviewed target columns.</p>'+
      '<div class="editor-fields">'+fields.map(c=>editableControl(c,cellValue(r,c.column))).join('')+'</div>'+
      (!fields.length?'<p class="empty">This reviewed mapping has no editable recipient columns.</p>':'')+
      '<div class="actions">'+button('apply','Record all prepared cells')+'</div>'+
      '<details open><summary>Complete original source values</summary><dl>'+source.map(c=>'<dt>'+esc(c.column)+'<small>'+esc(c.source)+'</small></dt><dd>'+esc(r.issuedValues[c.column])+'</dd>').join('')+'</dl></details>'+
      '<details><summary>Original source and analyst baseline</summary><pre>'+esc(JSON.stringify({source:r.source,annotation:r.annotation,included:r.included,subject:r.subject},null,2))+'</pre></details>';
  }
  function render(){
    if(!S)return;
    const p=S.project,m=p.issued.manifest,sum=C.summary(p),filtered=C.rows(p,{query:S.preparation.query,changedOnly:S.preparation.changedOnly,offset:S.preparation.offset,limit:25});
    const rows=filtered.rows||[],total=filtered.total??rows.length;
    const titleColumn=m.mapping.columns.find(c=>c.source==='projectTitle')?.column;
    const statusColumn=m.mapping.columns.find(c=>c.source==='review.status')?.column;
    const issues=C.reviewIssues(p);
    root.innerHTML='<header class="main-heading"><div><p class="eyebrow">OPENFEMA · PUBLIC ASSISTANCE</p><h1>Recipient review</h1><p>'+esc(title(p))+'</p></div><div class="identity"><strong>'+esc(m.summary.rows)+' issued projects</strong><span>'+esc(sum.changedRows??C.diff(p).length)+' changed rows</span><span>'+esc(p.editions.length)+' saved editions</span></div></header>'+
      '<section class="panel"><div class="actions">'+button('json','Download editable project')+button('html','Download standalone workspace')+button('csv','Download returned CSV')+'</div>'+
      '<div class="file-row"><label for="open-project">Open a complete recipient working file</label><input id="open-project" type="file" accept=".json,application/json">'+button('import','Open as separate copy')+'</div>'+
      '<p class="small">Return the complete CSV to the original sender for Data integration → Receive customer CSV against delivery <span class="mono wrap">'+esc(p.deliveryId)+'</span>. The editable project and standalone workspace retain your source, saved editions and unfinished preparation.</p>'+
      '<details><summary>Complete issued original files</summary><div class="original-files">'+C.originals(p).map((f,i)=>'<div><span>'+esc(f.name)+' <small>'+bytes(f.content).toLocaleString()+' UTF-8 bytes</small></span>'+button('original','Download full file','data-index="'+i+'"')+'</div>').join('')+'</div></details>'+
      '<details><summary>Delivery and source selection</summary><pre>'+esc(JSON.stringify({deliveryId:p.deliveryId,version:m.version,editionId:m.editionId,sourceSha256:m.sourceSha256,sourceScope:m.sourceScope,criteria:m.criteria,mapping:m.mapping.target,mappingReview:m.mappingReview,summary:m.summary},null,2))+'</pre></details></section>'+
      (offered?'<section class="panel"><h2>Saved browser preparation is available</h2><p>The current file and this browser have separate retained editions. Choose the edition you want to continue.</p><div class="actions">'+button('saved','Open saved browser copy')+button('separate','Continue this file separately')+'</div></section>':'')+
      '<section class="panel"><h2>Receiving reviewer and prepared decisions</h2><div class="reviewer"><label for="reviewer">Reviewer<input id="reviewer" value="'+esc(S.preparation.actor)+'" maxlength="200"></label><label for="review-note">Review reason<textarea id="review-note" maxlength="12000" rows="3">'+esc(S.preparation.note)+'</textarea></label></div><p id="prepared" class="small">'+pending()+' prepared cells. Recording a decision preserves the preceding project and appends its reviewer and reason.</p></section>'+
      '<div class="two-column"><section class="panel register"><h2>Complete issued register</h2><div class="filters"><label for="search">Search original rows<input id="search" value="'+esc(S.preparation.query)+'"></label><label class="check"><input id="changed" type="checkbox"'+(S.preparation.changedOnly?' checked':'')+'> Changed rows</label>'+button('filter','Apply filter')+'</div>'+
      '<div class="table-wrap"><table><thead><tr><th>Disaster / project</th><th>Project</th><th>Review</th><th>Open</th></tr></thead><tbody>'+rows.map(r=>'<tr'+(r.key===S.preparation.selectedKey?' class="selected"':'')+'><td>'+esc(r.disasterNumber)+'<small>'+esc(r.projectId)+'</small></td><td>'+esc(titleColumn?r.values[titleColumn]:'')+'</td><td>'+esc(statusColumn?r.values[statusColumn]:'')+(r.changed?'<small>Changed</small>':'')+'</td><td>'+button('row','Review','data-key="'+esc(r.key)+'"')+'</td></tr>').join('')+'</tbody></table></div>'+
      (!rows.length?'<p class="empty">No rows match the current selection.</p>':'')+
      '<div class="pagination">'+button('previous','Previous',S.preparation.offset?'':'disabled')+'<span>'+(total?Math.min(total,S.preparation.offset+1):0)+'–'+Math.min(total,S.preparation.offset+rows.length)+' of '+total+'</span>'+button('next','Next',S.preparation.offset+rows.length<total?'':'disabled')+'</div></section>'+
      '<section class="panel detail">'+renderRow()+'</section></div>'+
      '<section class="panel"><h2>Review issues before returning CSV</h2><p>The original native importer reviews the returned file and explicitly applies selected decisions. This editor identifies incomplete analyst values before that return.</p>'+(!issues.length?'<p>No invalid recorded analyst proposals.</p>':'<div class="table-wrap"><table><thead><tr><th>Original project</th><th>Issue</th></tr></thead><tbody>'+issues.map(x=>'<tr><td>'+esc(x.key||x.projectId||'')+'</td><td>'+esc(x.message||x.reason||JSON.stringify(x))+'</td></tr>').join('')+'</tbody></table></div>')+'</section>'+
      '<section class="panel"><h2>Named editions and complete history</h2><div class="actions"><label for="edition-name">Edition name<input id="edition-name" value="'+esc(S.preparation.editionName)+'" maxlength="200"></label>'+button('edition','Save named edition')+'</div><div class="table-wrap"><table><thead><tr><th>Edition</th><th>Reviewer / time</th><th>Continue</th></tr></thead><tbody>'+p.editions.map(e=>'<tr><td>'+esc(e.name)+'<small class="mono wrap">'+esc(e.id)+'</small></td><td>'+esc(e.actor||e.reviewer||'')+'<small>'+esc(e.createdAt||e.savedAt||'')+'</small></td><td>'+button('restore','Restore as current preparation','data-id="'+esc(e.id)+'"')+'</td></tr>').join('')+'</tbody></table></div>'+
      '<details><summary>Every retained review action</summary><pre>'+esc(JSON.stringify(p.history,null,2))+'</pre></details></section>'+
      '<footer><p>FEMA OpenFEMA source is retained with this issued delivery. Four financial measures remain separate. Source-field edits and customer-only records are reconciled by the original operator.</p><p class="small">Working copy <span class="mono wrap">'+esc(S.copyId)+'</span> · native delivery <span class="mono wrap">'+esc(p.deliveryId)+'</span></p></footer>';
  }
  root.addEventListener('input',event=>{
    if(busy||!S)return;const el=event.target,p=S.preparation;
    if(el.dataset.cell){const key=p.selectedKey;(p.drafts[key]??={})[el.dataset.cell]=el.value;document.querySelector('#prepared').textContent=pending()+' prepared cells.';}
    else if(el.id==='reviewer')p.actor=el.value;
    else if(el.id==='review-note')p.note=el.value;
    else if(el.id==='edition-name')p.editionName=el.value;
    else if(el.id==='search')p.query=el.value;
    else if(el.id==='changed')p.changedOnly=el.checked;
    else return;
    schedule();
  });
  root.addEventListener('click',event=>{
    const b=event.target.closest('[data-action]');if(!b||busy)return;
    const action=b.dataset.action,file=action==='import'?document.querySelector('#open-project')?.files?.[0]:null;
    const rescue=['json','html','import','separate','saved','original'].includes(action);
    run(async()=>{
      if(action==='json'){download(basename()+'.json',fullFile(),'application/json');rescuedEnvelope=currentIdentity();show('Complete editable project downloaded.');return;}
      if(action==='html'){download(basename()+'.html',fullHtml(),'text/html;charset=utf-8');rescuedEnvelope=currentIdentity();show('Complete standalone workspace downloaded.');return;}
      if(action==='original'){const f=C.originals(S.project)[Number(b.dataset.index)];need(f,'Choose an original issued file.');download(f.name,f.content,'text/plain;charset=utf-8');show('Complete original file downloaded: '+f.name);return;}
      if(action==='csv'){need(!pending(),'Record the prepared cells before returning CSV, or download the editable project to retain unfinished work.');download('OpenFEMA_Recipient_Return.csv',C.returnedCsv(S.project),'text/csv;charset=utf-8');show('Complete returned CSV downloaded.');return;}
      if(action==='import'){
        need(file,'Choose the complete recipient working file.');preserveDeparture();
        need(file.size<=WORKING_FILE_LIMIT,'Choose a complete recipient working file within 512 MiB.');
        const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
        const value=JSON.parse(content.charCodeAt(0)===0xfeff?content.slice(1):content);
        const candidate=await readEnvelope(value,{separate:true});
        await adopt(candidate);offered=null;render();show('Complete working file opened as a separate copy.');return;
      }
      if(action==='saved'){preserveDeparture();need(offered,'No saved browser edition is selected.');const candidate=await readEnvelope(offered.envelope);candidate.storeRevision=offered.revision;S=candidate;offered=null;storageFailure=null;render();show('Original saved browser copy opened.');return;}
      if(action==='separate'){await adopt({...S,copyId:'recipient-'+token(),storeRevision:0});offered=null;render();return;}
      if(action==='apply'){await commitPrepared();return;}
      if(action==='revert-row'){
        const r=rowByKey(S.preparation.selectedKey);need(r,'Choose an issued row.');const preparation=clone(S.preparation);preparation.drafts[r.key]=Object.fromEntries(editable(S.project).map(c=>[c.column,text(r.issuedValues[c.column])]));
        await adopt({...S,preparation});return;
      }
      if(action==='row'){await adopt({...S,preparation:{...clone(S.preparation),selectedKey:b.dataset.key}});return;}
      if(action==='filter'){await adopt({...S,preparation:{...clone(S.preparation),offset:0}});return;}
      if(action==='previous'||action==='next'){await adopt({...S,preparation:{...clone(S.preparation),offset:Math.max(0,S.preparation.offset+(action==='next'?25:-25))}});return;}
      if(action==='edition'){
        need(S.preparation.actor.trim(),'Enter the receiving reviewer.');need(S.preparation.editionName.trim(),'Enter a name for the complete edition.');await commitPrepared();
        const project=C.saveEdition(S.project,{name:S.preparation.editionName,actor:S.preparation.actor,note:S.preparation.note,expectedRevision:S.project.revision});
        await adopt({...S,project});return;
      }
      if(action==='restore'){
        need(!pending()||rescuedEnvelope===currentIdentity(),'Record prepared cells or download the complete current working file before restoring an edition.');
        need(S.preparation.actor.trim(),'Enter the receiving reviewer.');
        const project=C.restoreEdition(S.project,b.dataset.id,{actor:S.preparation.actor,note:S.preparation.note,expectedRevision:S.project.revision});
        await adopt({...S,project,preparation:{...clone(S.preparation),drafts:{}}});return;
      }
    },{allowSaveFailure:rescue});
  });
  window.addEventListener('beforeunload',event=>{if(timer||busy||storageFailure){event.preventDefault();event.returnValue='';}});
  busy=true;root.inert=true;root.setAttribute('aria-busy','true');
  (async()=>{
    try{
      const value=JSON.parse(document.querySelector('#recipient-source').textContent);S=await readEnvelope(value);rescuedEnvelope=currentIdentity();render();
      try{db=await openDatabase();const existing=await readSaved(key(S));
        if(existing){const actual=await readEnvelope(existing.envelope);need(actual.project.deliveryId===S.project.deliveryId,'Saved browser copy belongs to another delivery.');if(existing.envelope.project===envelope().project&&JSON.stringify(existing.envelope.preparation)===JSON.stringify(S.preparation)){S.storeRevision=existing.revision;show('Saved browser copy matches this complete file.');}else{offered=existing;storageFailure=new Error('Choose the saved browser edition or continue this complete file separately.');render();show('Choose which retained edition to continue.');}}
        else await persistCurrent();
      }catch(e){storageFailure=e;show(e.message+' Download editable project retains the complete current file.',true);}
    }catch(e){show(e.message||String(e),true);root.innerHTML='<p>The complete project could not be received. The original file remains unchanged.</p>';}finally{busy=false;root.inert=false;root.removeAttribute('aria-busy');}
  })();
}
export function renderRecipientWorkspace(envelope){
  if(!envelope||envelope.schema!==WORKSPACE_SCHEMA)throw new Error('Choose the complete recipient working file.');
  createRecipientCore().importProject(envelope.project);
  const script='('+recipientBrowserMain.toString()+')('+createRecipientCore.toString()+');';
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>OpenFEMA recipient review</title><style>'+css+'</style></head><body><header><p id="status" role="status">Opening complete working file</p><p id="error" role="alert"></p></header><main id="workspace"><p>Opening the complete recipient project…</p></main><script id="recipient-source" type="application/json">'+escapedJson(envelope)+'</script><script>'+script+'</script></body></html>\n';
}
export function createRecipientDelivery({deliveryId,manifest,targetCsv,originalCustomer=null,createdAt}={}){
  const C=createRecipientCore();
  const limits={...C.LIMITS};
  try{
    const project=C.create({deliveryId,manifest,targetCsv,originalCustomer,createdAt});
    const envelope={schema:WORKSPACE_SCHEMA,copyId:'recipient-copy-'+project.id.slice(10),originCopyId:'recipient-copy-'+project.id.slice(10),project:C.exportProject(project),preparation:{query:'',changedOnly:false,offset:0,selectedKey:project.issued.manifest.rows[0]?.key??null,actor:'',note:'',editionName:'',drafts:{}}};
    const projectFile=JSON.stringify(envelope,null,2)+'\n';
    return {availability:{schema:'stellar-forge.openfema-recipient-availability.v1',state:'AVAILABLE',deliveryId,limits,rows:project.issued.manifest.rows.length},entries:[{path:'recipient.html',text:renderRecipientWorkspace(envelope)},{path:'recipient-project.json',text:projectFile},{path:'RECIPIENT_README.txt',text:recipientInstructions(deliveryId)}]};
  }catch(error){
    if(error.code!=='OPENFEMA_RECIPIENT_CAPACITY')throw error;
    const availability={schema:'stellar-forge.openfema-recipient-availability.v1',state:'CAPACITY_EXCEEDED',deliveryId,limits,source:{targetCsvBytes:new TextEncoder().encode(targetCsv).length,manifestBytes:new TextEncoder().encode(typeof manifest==='string'?manifest:JSON.stringify(manifest)).length},reason:error.message};
    return {availability,entries:[{path:'RECIPIENT_README.txt',text:'The complete native delivery is retained in this archive. Its recipient editor input exceeds the declared complete-file capacity.\n\n'+JSON.stringify(availability,null,2)+'\n\nUse projects-target.csv in the receiving programme’s existing CSV editor. Retain both disaster and GM project identities, all original source values and mapped columns. Return the complete CSV through the original sender’s Data integration / Receive customer CSV for this exact delivery. The original full workspace and project delivery files remain the source of every record.\n'}]};
  }
}
export function recipientInstructions(deliveryId){return 'OPENFEMA — COMPLETE RECIPIENT REVIEW\n\n1. Extract this full ZIP and open recipient.html in a current browser. It includes the complete issued register and operates offline.\n2. Choose an original project. Source and identity cells remain visible. Edit the mapped analyst fields and customer-owned columns, enter the receiving reviewer and reason, then record the prepared cells.\n3. Save named editions as the review develops. Complete JSON and standalone HTML downloads retain every issued file, recorded revision, saved edition and unfinished prepared value. Open a downloaded JSON through the same workspace as a separate copy.\n4. Download returned CSV after completing the recorded analyst values. Send the complete CSV back to the original operator for Data integration / Receive customer CSV against delivery '+deliveryId+'. The operator examines the reconciliation and explicitly applies selected review proposals to the current portfolio version.\n5. Keep recipient-project.json or a later complete working file. Browser storage can be unavailable or cleared; the downloaded files provide a complete portable continuation. Download each issued original from the file list whenever needed.\n\nThe six mapped analyst fields are status, disposition, priority, owner, due date and note. The reviewed mapping may omit some of them. Customer-owned columns are editable; they remain customer data and do not become a published FEMA source fact. Original customer-only or unlinked rows remain in the complete original customer file. The returned CSV covers the exact issued project rows and target column order.\n\nSource fields, row identities, parent amounts, mapping and original file bytes remain retained. The four monetary measures stay separate. This local review prepares a return for the original native reconciliation; it does not call any external service or issue a payment.\n';}
