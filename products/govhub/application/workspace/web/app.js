'use strict';
const state={user:null,snapshot:null,view:'overview',params:{},busy:false,record:null,preview:null,plan:null};
const main=document.querySelector('#main'),navigation=document.querySelector('#navigation'),identity=document.querySelector('#identity');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=v=>encodeURIComponent(String(v??'')),iso=()=>new Date().toISOString(),short=v=>String(v??'').slice(0,12);
const size=v=>Number(v)<1024?v+' B':Number(v)<1048576?(Number(v)/1024).toFixed(1)+' KB':(Number(v)/1048576).toFixed(1)+' MB';
const KINDS=['sites','environments','migration_issues'];
function date(v){if(!v)return '—';const p=new Date(v);if(Number.isNaN(p.getTime()))return String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'UTC'}).format(p);return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(p);}
function href(view,params={}){const q=new URLSearchParams(params).toString();return '#'+view+(q?'?'+q:'');}
function link(text,view,params={},cls=''){return `<a class="${esc(cls)}" href="${esc(href(view,params))}">${esc(text)}</a>`;}
function button(label,action,data={},primary=false){return `<button type="button" class="${primary?'primary':''}" data-action="${esc(action)}"${Object.entries(data).map(([k,v])=>` data-${esc(k)}="${esc(v)}"`).join('')}>${esc(label)}</button>`;}
function badge(label,strong=false){return `<span class="badge ${strong?'dark':''}">${esc(label)}</span>`;}
function empty(message){return `<div class="empty">${esc(message)}</div>`;}
function heading(title,description='',actions=''){return `<div class="page-heading"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
function card(title,content,extra=''){return `<section class="card ${esc(extra)}"><h2>${esc(title)}</h2>${content}</section>`;}
function table(headers,rows){return rows.length?`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty('There are no records in this view.');}
function definition(rows){return `<dl class="details-grid">${rows.map(([a,b])=>`<dt>${esc(a)}</dt><dd>${b}</dd>`).join('')}</dl>`;}
function input(label,name,value='',type='text',required=false,help=''){return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}"${required?' required':''}>${help?`<small>${esc(help)}</small>`:''}</label>`;}
function area(label,name,value='',required=false,help=''){return `<label>${esc(label)}<textarea name="${esc(name)}"${required?' required':''}>${esc(value)}</textarea>${help?`<small>${esc(help)}</small>`:''}</label>`;}
function select(label,name,options,value='',help=''){return `<label>${esc(label)}<select name="${esc(name)}">${options.map(o=>{const[v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}"${String(v)===String(value)?' selected':''}>${esc(t)}</option>`;}).join('')}</select>${help?`<small>${esc(help)}</small>`:''}</label>`;}
function checks(label,name,options,values=[]){return `<fieldset><legend>${esc(label)}</legend><div class="checklist">${options.map(o=>{const[v,t]=Array.isArray(o)?o:[o,o];return `<label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(v)}"${values.includes(v)?' checked':''}>${esc(t)}</label>`;}).join('')||'<p class="muted">Add the related records first.</p>'}</div></fieldset>`;}
function values(form){return Object.fromEntries(new FormData(form));}
function notice(message,error=false){const e=document.querySelector('#notice');e.textContent=message;e.className='notice'+(error?' error':'');e.hidden=false;clearTimeout(notice.timer);if(!error)notice.timer=setTimeout(()=>e.hidden=true,9000);}
async function api(path,payload){const response=await fetch('/api/'+path,{credentials:'same-origin',...(payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});let data;try{data=await response.json();}catch{throw Error('The local service returned an unreadable response. Reopen the saved workspace.');}if(!response.ok){const e=Error(data.error||data.message||'The requested action could not complete.');e.status=response.status;e.fields=data.fields||{};throw e;}return data;}
const ops=(operation,payload={})=>api('govhub/'+operation,payload);
async function busy(action){if(state.busy)return;state.busy=true;main.setAttribute('aria-busy','true');document.querySelector('#notice').hidden=true;for(const b of main.querySelectorAll('button'))b.disabled=true;try{return await action();}catch(e){if(e.status===401){state.user=null;renderLogin();}else{notice(e.message,true);for(const[name,message]of Object.entries(e.fields||{})){const c=main.querySelector('[name="'+CSS.escape(name)+'"]');if(c){c.classList.add('invalid');c.setAttribute('aria-invalid','true');const note=document.createElement('small');note.className='field-error';note.textContent=message;c.parentElement.append(note);}}}throw e;}finally{state.busy=false;main.setAttribute('aria-busy','false');for(const b of main.querySelectorAll('button'))b.disabled=false;}}
function records(kind,archived=false){return(state.snapshot?.entities?.[kind]||[]).filter(r=>archived||!r.archived);}
function schema(kind){return state.snapshot?.schemas?.[kind];}
function recordName(kind,id){return records(kind,true).find(r=>r.id===id)?.data?.name||id||'—';}
function gov(){return state.snapshot?.govhub||{};}
function registerKinds(){return KINDS.filter(k=>schema(k));}
function refOptions(kind,blank='Choose a record'){return[['',blank],...records(kind).map(r=>[r.id,r.data.name])];}
function route(){const[v,q]=location.hash.slice(1).split('?');state.view=v||'overview';state.params=Object.fromEntries(new URLSearchParams(q||''));}
async function reload(){state.snapshot=await api('govhub/snapshot');}
function renderNavigation(){
  document.querySelector('#layout').classList.remove('login-layout');
  identity.innerHTML=`<span>${esc(state.user.name)}</span>${badge(state.user.role)}${button('Sign out','logout')}`;
  const groups=[['Cutover operations',[['overview','Operating queue'],['inventories','Inventory versions'],['plans','Cohort plans'],['operations','Native operations']]],['Registers',KINDS.map(k=>['records',schema(k)?.title||k,k])],['POTS delivery',[['pots','Builds and deployments']]],['Content operations',[['content','Content consolidation'],['playbooks','Publishing playbooks'],['packages','Content packages']]],['Visitor operations',[['visitor','Visitor journeys']]],['Static release operations',[['static','Static releases']]],['Workspace',[['sources','Original sources'],['handover','Handover'],['activity','Activity'],['settings','Scope & backup']]]];
  navigation.innerHTML=groups.map(([group,items])=>'<div class="nav-group">'+esc(group)+'</div>'+items.map(([v,t,k])=>`<a href="${esc(href(v,k?{kind:k}:{}))}"${(k?state.params.kind===k&&['records','record','new'].includes(state.view):(v==='packages'?state.view.startsWith('package'):state.view===v))?' aria-current="page"':''}><span>${esc(t)}</span>${k?`<span class="nav-count">${records(k).length}</span>`:''}</a>`).join('')).join('')+(state.user.role==='admin'?`<a href="#staff"${state.view==='staff'?' aria-current="page"':''}>Staff access</a>`:'');
}
function renderLogin(){document.querySelector('#layout').classList.add('login-layout');navigation.innerHTML='';identity.innerHTML='';main.innerHTML=`<section class="login"><h1>Open your workspace</h1><p class="muted">Sign in to the private multi-site cutover workspace.</p><form data-form="login">${input('Username','name','','text',true)}<label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="primary">Sign in</button></form></section>`;main.querySelector('[name=name]').focus();}
function recordField(f,value){
  const name=f.name,label=(f.title||f.label)+(f.required?' *':''),help=f.help||'',type=f.type;
  if(['select','reference'].includes(type))return select(label,name,type==='reference'?refOptions(f.ref):f.options||[],value??f.default??'',help);
  if(['multi','references'].includes(type))return checks(label,name,type==='references'?records(f.ref).map(r=>[r.id,r.data.name]):f.options||[],value||[]);
  if(type==='bool')return `<label class="check"><input name="${esc(name)}" type="checkbox"${value??f.default?' checked':''}>${esc(label)}${help?`<small>${esc(help)}</small>`:''}</label>`;
  if(['textarea','list'].includes(type))return area(label,name,type==='list'?(value||[]).join('\n'):value??f.default??'',f.required,type==='list'?(help?help+' ':'')+'One item per line.':help);
  return input(label,name,value??f.default??'',['number','date'].includes(type)?type:'text',f.required,type==='datetime'?(help?help+' ':'')+'Include the time zone, for example 2026-10-11T14:30:00-04:00.':help);
}
function formRecordData(form,kind){const data={};for(const f of schema(kind).fields){const c=form.elements.namedItem(f.name);if(['multi','references'].includes(f.type))data[f.name]=[...form.querySelectorAll('[name="'+CSS.escape(f.name)+'"]:checked')].map(e=>e.value);else if(f.type==='bool')data[f.name]=Boolean(c?.checked);else if(f.type==='number')data[f.name]=c?.value===''?null:Number(c.value);else if(f.type==='list')data[f.name]=(c?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);else data[f.name]=c?.value||'';}return data;}
function renderRecords(){
  const kind=state.params.kind,s=schema(kind);if(!s)throw Error('Choose an available operations register.');
  const query=(state.params.q||'').toLowerCase(),all=state.params.archived==='1',items=records(kind,all).filter(r=>!query||JSON.stringify(r.data).toLowerCase().includes(query));
  const cols=s.fields.filter(f=>['status','state','owner_role','owner_id','email','location','due_at','renewal_date','criticality','priority'].includes(f.name)).slice(0,3);
  main.innerHTML=heading(s.title,s.description||'Review current records and retain changes with their source and operating history.',link('Add '+s.singular.toLowerCase(),'new',{kind}))+
    `<form class="toolbar" data-form="filter"><input type="hidden" name="kind" value="${esc(kind)}">${input('Find records','q',state.params.q||'')}${select('Show','archived',[['0','Active records'],['1','Active and archived']],all?'1':'0')}<button>Apply</button></form>`+
    table(['Record',...cols.map(f=>f.title||f.label),'Last updated'],items.map(r=>[link(r.data.name||r.id,'record',{kind,id:r.id},'record-title')+`<small>${esc(r.id)} ${r.archived?badge('Archived'):''}</small>`,...cols.map(f=>['date','datetime'].includes(f.type)?esc(date(r.data[f.name])):f.ref?esc(recordName(f.ref,r.data[f.name])):esc(r.data[f.name]??'—')),esc(date(r.updated_at))+`<small>${esc(r.author)}</small>`]));
}
async function renderRecord(isNew=false){
  const kind=state.params.kind,s=schema(kind);if(!s)throw Error('Choose an available record type.');
  const row=isNew?{id:'',data:{},revision:null,history:[],origin:[]}:await api('entities/'+enc(kind)+'/'+enc(state.params.id)+(state.params.revision?'?revision='+enc(state.params.revision):''));
  state.record=row;const historical=Boolean(state.params.revision&&row.current_revision!==row.revision);
  const fields=s.fields.map(f=>`<div class="${['textarea','multi','references','list'].includes(f.type)?'full':''}">${recordField(f,row.data[f.name])}</div>`).join('');
  main.innerHTML=`<div class="breadcrumbs">${link(s.title,'records',{kind})}<span>${esc(isNew?'New record':row.data.name)}</span></div>`+heading(isNew?'Add '+s.singular.toLowerCase():row.data.name,isNew?'Enter the actual site or environment record and its source.':historical?'A retained historical edition. Open the current record to make changes.':'Each saved change retains its previous edition and operator.')+
    (historical?`<div class="callout">${link('Open current edition','record',{kind,id:row.id})}</div>`:'')+
    `<div class="grid wide"><section class="card"><form data-form="record" data-kind="${esc(kind)}" data-id="${esc(row.id)}">${isNew?input('Stable record ID','record_id','','text',true,'Use the stable site or environment identifier; it remains stable across imports.'):definition([['Record ID',`<code>${esc(row.id)}</code>`],['Revision',`<code>${esc(row.revision)}</code>`]])}<fieldset${historical?' disabled':''}><legend>${esc(s.singular)} details</legend><div class="form-grid">${fields}</div></fieldset>${historical?'':area('Change notes / source reference','change_note','',!isNew)+`<div class="form-footer"><button class="primary">Save ${esc(s.singular.toLowerCase())}</button>${isNew?'':button(row.archived?'Restore record':'Archive record','archive',{kind,id:row.id,archived:row.archived?'0':'1'})}</div>`}</form></section><div><div id="record-operations"></div>${card('Retained history',row.history.length?`<ol class="timeline">${row.history.map(h=>`<li><span class="time">${esc(date(h.created_at))} · ${esc(h.author)}</span>${link(short(h.revision),'record',{kind,id:row.id,revision:h.revision})}<p>${esc(h.note||'Record retained')}</p></li>`).join('')}</ol>`:empty('History begins with the first saved record.'))}${card('Source lineage',row.origin.length?row.origin.map(o=>`<div class="source-file"><div>${o.file_id?`<a href="/api/files/${enc(o.file_id)}">Download original source</a>`:esc(o.source||'Retained origin')}<small>Row ${esc(o.row??'—')}</small><code>${esc(o.sha256||'')}</code></div></div>`).join(''):empty('Add the original source reference when saving or import a retained source file.'))}</div></div>`;
}
async function fileBase64(file){if(!file||!file.size||file.size>128*1024*1024)throw Error('Choose a nonempty original file within 128 MiB.');const b=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<b.length;i+=32768)binary+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(binary);}
async function renderActivity(){const result=await api('activity?offset='+enc(state.params.offset||0)),items=Array.isArray(result)?result:result.events||result.items||result.activity||[];main.innerHTML=heading('Workspace activity','Saved source versions, decisions and native operations in their original sequence.',button('Refresh','refresh'))+card('Recent activity',table(['Time','Operator','Action','Record / details'],items.map(x=>[esc(date(x.created_at)),esc(x.actor),esc(x.operation),x.kind&&KINDS.includes(x.kind)&&x.entity_id?link(x.entity_id,'record',{kind:x.kind,id:x.entity_id})+`<small>${esc(x.details?.note||'')}</small>`:esc(x.details?.note||x.entity_id||'')]))+`<div class="actions">${Number(state.params.offset||0)>0?link('Newer activity','activity',{offset:Math.max(0,Number(state.params.offset)-100)}):''}${items.length>=100?link('Older activity','activity',{offset:Number(state.params.offset||0)+100}):''}</div>`);}

const manifestFields=['agency_id','canonical_url','export_sha256','backup_sha256','route_count','observed_http_status'];
const comparedFields=['canonical_url','export_sha256','backup_sha256','route_count'];
const newKey=()=>crypto.randomUUID();
const isReviewer=()=>['admin','reviewer'].includes(state.user?.role);
const snapshots=()=>gov().snapshots||[],plans=()=>gov().plans||[],operations=()=>gov().operations||[],handovers=()=>gov().exports||[];
const sourceFiles=()=>state.snapshot.files.filter(f=>!['Handover','Generated','Export'].includes(f.category)&&!String(f.source_label).startsWith('GovHub handover'));
const snapshotName=id=>snapshots().find(s=>s.id===id)?.label||id||'—';
const planName=id=>plans().find(s=>s.id===id)?.name||id||'—';
const fileName=id=>state.snapshot.files.find(s=>s.id===id)?.filename||id||'—';
function fileOptions(blank='Choose a retained file',filter=()=>true){return [['',blank],...sourceFiles().filter(filter).map(f=>[f.id,f.filename+' · '+size(f.bytes)])];}
function snapshotOptions(blank='Choose an inventory version'){return [['',blank],...snapshots().map(s=>[s.id,s.label+' · '+s.kind+' · '+date(s.observed_at)])];}
function planOptions(){return [['','Choose a cohort'],...plans().map(p=>[p.id,p.name])];}
function detailValue(value){return value===null||value===undefined?'—':typeof value==='object'?esc(JSON.stringify(value)):esc(value);}
function rawDetails(title,value){return `<details><summary>${esc(title)}</summary><pre class="preview-text">${esc(JSON.stringify(value,null,2))}</pre></details>`;}
function opRows(items){return items.map(o=>{
  const content=o.type.startsWith('CONTENT_'),visitor=o.type==='VISITOR_CAPTURE';
  const project=visitor?state.snapshot?.govhub?.visitor?.projects?.find(p=>'visitor:'+p.entity_id===o.environment_id):null;
  const scope=o.plan_id?link(planName(o.plan_id),'plan',{id:o.plan_id}):content&&o.content_family_id?link(contentName(o.content_family_id),'content-family',{id:o.content_family_id}):esc(project?.label||'—');
  return [link(o.type+' · '+short(o.id),content?'content-operation':visitor?'visitor-capture':o.type.startsWith('STATIC_')?'static-operation':'operation',{id:o.id}),scope,esc(project?.label||recordName('environments',o.environment_id)),badge(o.state,['FAILED','WAITING_NATIVE'].includes(o.state)),esc(o.progress?.detail||o.progress?.stage||'')+`<small>${esc(date(o.updated_at||o.created_at))}</small>`];
});}
function planRows(items){return items.map(p=>[link(p.name,'plan',{id:p.id},'record-title'),esc((p.agency_ids||[]).length)+' comparison IDs',esc(snapshotName(p.baseline_id))+`<small>→ ${esc(snapshotName(p.candidate_id))}</small>`,badge(p.latest_audit_status||'Awaiting audit',p.latest_audit_status==='FAIL'),badge(p.latest_review?.decision||'Awaiting review')]);}
function inventoryRows(items){return items.map(s=>[link(s.label,'inventory',{id:s.id}),badge(s.kind),esc(s.row_count),esc(date(s.observed_at)),esc(s.bound_exports??0)+' exports / '+esc(s.bound_backups??0)+' backups']);}
function issueRows(items){return items.map(r=>[link(r.data.name,'record',{kind:'migration_issues',id:r.id}),badge(r.data.severity,r.data.severity==='High'),esc(r.data.owner||'Unassigned'),esc(r.data.status),esc(date(r.data.due_at))]);}
function renderOverview(){
  const summary=gov().summary||{},settings=gov().settings||{},active=operations().filter(o=>!['COMPLETE','CANCELLED'].includes(o.state));
  main.innerHTML=heading(state.snapshot.workspace.name,'Coordinate the actual source inventory, migration cohorts and recovery work.',button('Refresh','refresh'))+
    `<div class="stats">${[['Registered sites',summary.sites??records('sites').length],['Cohorts',summary.plans??plans().length],['Active operations',summary.active_operations??active.length],['Open issues',summary.open_issues??0]].map(([label,value])=>`<div class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>`+
    (settings.input_mode==='PILOT'?`<div class="callout">${badge('PILOT')} This workspace contains the operator’s selected pilot scope. Each inventory keeps its original source and observation time.</div>`:'')+
    `<div class="grid wide"><div>${card('Current operating queue',table(['Operation','Cohort','Environment','State','Progress'],opRows(active))+`<div class="actions">${link('Open native operations','operations')}${link('Prepare a cohort','plan-new')}</div>`)}${card('Cohort decisions',table(['Cohort','Scope','Source pair','Audit','Review'],planRows(plans())))}${card('Migration work',table(['Issue','Severity','Owner','Status','Due'],issueRows(records('migration_issues').filter(r=>!['Resolved','Accepted'].includes(r.data.status))))+`<div class="actions">${link('Register an issue','new',{kind:'migration_issues'})}</div>`)}</div><div>${card('Operating basis',settings.scope_file_id?definition([['Retained source',`<a href="/api/files/${enc(settings.scope_file_id)}">${esc(fileName(settings.scope_file_id))}</a>`],['Scope reference',esc(settings.scope_reference)],['Inventory versions',esc(snapshots().length)],['Background worker',gov().worker?.running?'Running':'Stopped']]):`<p>Retain the issued scope and the prime’s operating instruction, then set the explicit cohort identifiers.</p>${link('Set the scope','settings')}`)}${card('Source observations',table(['Version','Kind','Rows','Observed','Bound files'],inventoryRows(snapshots().slice(0,5))))}${card('Environment preparation',`<p>Register each actual target and configure its installed Drupal tools or Acquia environment. Native operations retain their original target and progress after a restart.</p><div class="actions">${link('Open environments','records',{kind:'environments'})}${link('Retain original sources','sources')}</div>`)}</div></div>`;
}

async function renderSources(){
  const available=await ops('sources.list'),all=sourceFiles(),query=(state.params.q||'').trim().toLowerCase(),category=state.params.category||'';
  const matching=all.filter(f=>(!category||f.category===category)&&(!query||[f.filename,f.source_label,f.sha256,f.category].join(' ').toLowerCase().includes(query)));
  const offset=Math.min(Math.max(0,Number(state.params.offset)||0),Math.max(0,Math.ceil(matching.length/50)-1)*50),files=matching.slice(offset,offset+50);
  const search=`<form class="toolbar" data-form="source-filter">${input('Find original files','q',state.params.q||'','search',false,'Search filenames, export context or exact hashes.')}${select('Category','category',[['','All source categories'],...[...new Set(all.map(f=>f.category).filter(Boolean))].sort()],category)}<button>Find files</button></form><p class="field-help">${matching.length?offset+1:0}–${Math.min(offset+50,matching.length)} of ${matching.length} matching files · ${all.length} retained originals</p>`;
  const pages=`<div class="actions">${offset?link('Previous files','sources',{q:state.params.q||'',category,offset:Math.max(0,offset-50)}):''}${offset+50<matching.length?link('More files','sources',{q:state.params.q||'',category,offset:offset+50}):''}</div>`;
  main.innerHTML=heading('Original sources','Keep the complete source bytes, their export context and the observation time used in each inventory.')+
    `<div class="grid wide"><div>${card('Retained source versions',search+(files.length?files.map(f=>`<div class="source-file"><div><strong>${esc(f.filename)}</strong><small>${esc(f.source_label||f.category)} · ${size(f.bytes)} · ${esc(date(f.created_at))}</small><code>${esc(f.sha256)}</code></div><div class="actions">${link('Inspect','source',{id:f.id})}<a href="/api/files/${enc(f.id)}">Download</a></div></div>`).join(''):empty(all.length?'No original files match these search fields.':'Retain the original inventory, backup, configuration or issuer document to begin.'))+pages)}${card('Files in the configured input directory',available.root_configured?table(['File','Size','Modified','Retain'],(available.files||[]).map(f=>[esc(f.path||f.name),esc(size(f.bytes)),esc(date(f.modified_at)),button('Retain file','retain-local',{path:f.path})])):empty('Configure an input directory when starting the local workspace.'))}</div>${card('Retain an original file',`<form data-form="source"><label>Original file<input name="source_file" type="file" required></label>${select('Source category','category',['Inventory','Extract','Evidence'],'Inventory')}${input('Source description / export context','source_label','','text',true,'Include the issuing system, actual export time and supplied scope.')}<button class="primary">Retain source file</button><p class="field-help">Use the configured input directory for large native backup archives. Those files stream directly into the source store.</p></form>`)}</div>`;
}
async function renderSource(){
  const result=await ops('sources.get',{file_id:state.params.id}),f=result.file;
  state.source=result;
  let preview='';
  if(result.headers){const rows=Array.isArray(result.rows)?result.rows:Array.isArray(result.preview)?result.preview:[];preview=table(result.headers,rows.map(row=>Array.isArray(row)?row.map(detailValue):result.headers.map(h=>detailValue(row[h]))))+`<p class="field-help">Showing ${rows.length} of ${Array.isArray(result.rows)?result.rows.length:esc(result.rows||0)} original rows. Inventory acceptance uses the complete file.</p>`;}
  else if(result.preview)preview=`<pre class="preview-text">${esc(typeof result.preview==='string'?result.preview:JSON.stringify(result.preview,null,2))}</pre>`;
  main.innerHTML=`<div class="breadcrumbs">${link('Original sources','sources')}<span>${esc(f.filename)}</span></div>`+
    heading(f.filename,f.source_label||'',`<a href="/api/files/${enc(f.id)}">Download original</a>`)+
    card('Original source',definition([['SHA-256',`<code>${esc(f.sha256)}</code>`],['Size',esc(size(f.bytes))],['Retained',esc(date(f.created_at))],['Operator',esc(f.author)],['Format',esc(result.format)]]))+
    (preview?card('Source preview',preview):'')+
    (String(result.format).toLowerCase().includes('csv')||f.filename.toLowerCase().endsWith('.csv')?card('Prepare an inventory version',intakeForm(f.id)):'')+
    (result.metadata?rawDetails('Retained source metadata',result.metadata):'');
}
function intakeForm(fileId=''){
  return `<form data-form="inventory-preview">${fileId?`<input type="hidden" name="file_id" value="${esc(fileId)}">`:select('Original inventory CSV','file_id',fileOptions('Choose the six-column inventory',f=>f.filename.toLowerCase().endsWith('.csv')))}<div class="form-grid">${input('Version label','label','','text',true)}${select('Inventory role','kind',['BASELINE','CANDIDATE','RESTORED'],'BASELINE')}<div class="full">${input('Source observation time','observed_at','','text',true,'Use the actual source observation time, including UTC offset. This is separate from the time it is retained here.')}</div></div><button class="primary">Preview complete inventory</button></form>`;
}
function renderInventories(){
  main.innerHTML=heading('Inventory versions','Retain each original baseline, candidate and restored observation as a distinct version.',link('Retain original files','sources'))+
    card('Accepted source observations',table(['Version','Kind','Rows','Observed','Bound files'],inventoryRows(snapshots())))+
    `<details><summary>Retained intake previews (${(gov().intakes||[]).length})</summary>${table(['Preview','Kind','Rows','Source observed','Retained'],(gov().intakes||[]).map(i=>[link(i.label,'intake',{id:i.id}),badge(i.kind),esc(i.row_count),esc(date(i.observed_at)),esc(date(i.created_at))]))}</details>`+
    `<div class="grid">${card('Prepare a source version',intakeForm())}${card('Compare two observations',`<form data-form="compare" data-domain="inventories">${select('Earlier observation','before_id',snapshotOptions())}${select('Later observation','after_id',snapshotOptions())}<button>Compare original fields</button></form>`)}</div>`;
}
function manifestTable(rows){return table(['Comparison ID','Canonical URL','Routes','HTTP','Export SHA-256','Backup SHA-256'],rows.map(r=>[esc(r.agency_id),esc(r.canonical_url),esc(r.route_count),esc(r.observed_http_status),`<code>${esc(r.export_sha256)}</code>`,`<code>${esc(r.backup_sha256)}</code>`]));}
function bindingsTable(bindings){return table(['Comparison ID','Export','Backup','Additional native material'],(bindings||[]).map(b=>[esc(b.agency_id),esc(fileName(b.export_file_id||b.export?.id||b.export?.file_id)),esc(fileName(b.backup_file_id||b.backup?.id||b.backup?.file_id)),(b.files||[]).map(f=>esc(f.role)+': '+esc(fileName(f.file_id||f.id||f.file?.id))).join('<br>')]));}
async function renderIntake(){
  const intake=(await ops('inventories.intake',{intake_id:state.params.id})).intake;
  state.intake=intake;state.intakeKey=newKey();
  const existing=new Map((intake.bindings||[]).map(b=>[b.agency_id,b]));
  main.innerHTML=`<div class="breadcrumbs">${link('Inventory versions','inventories')}<span>Preview</span></div>`+
    heading(intake.label,'Review the complete original inventory and bind the exact native export and backup files.',badge(intake.kind))+
    card('Source observation',definition([['Original CSV',`<a href="/api/files/${enc(intake.file_id)}">${esc(fileName(intake.file_id))}</a>`],['Observed',esc(date(intake.observed_at))],['Comparison IDs',esc(intake.row_count)],['Source SHA-256',`<code>${esc(intake.source_sha256)}</code>`]]))+
    card('Inventory rows',manifestTable(intake.rows))+
    card('Native source bindings',`<form data-form="inventory-bindings"><p>Choose each retained export and backup by its exact manifest hash. Additional files keep their actual role in a native restore.</p>${intake.rows.map(r=>{const b=existing.get(r.agency_id)||{};return `<fieldset data-binding="${esc(r.agency_id)}"><legend>${esc(r.agency_id)}</legend>${select('Use complete native source operation','capture_operation_id',[['','Choose a retained capture or backup operation, or bind files below'],...operations().filter(o=>['CAPTURE','PREVIEW','BACKUP_CREATE','BACKUP_DOWNLOAD'].includes(o.type)&&o.state==='COMPLETE').map(o=>[o.id,recordName('environments',o.environment_id)+' · '+date(o.created_at)+' · '+short(o.id)])],b.capture_operation_id||'')}<div class="form-grid">${select('Export archive','export_file_id',fileOptions('Choose matching export',f=>f.sha256===r.export_sha256),b.export_file_id||b.export?.id||'')}${select('Backup archive','backup_file_id',fileOptions('Choose matching backup',f=>f.sha256===r.backup_sha256),b.backup_file_id||b.backup?.id||'')}</div><details><summary>Additional native material (${(b.files||[]).length})</summary><div data-native-files>${(b.files||[]).map(nativeBindingRow).join('')}</div>${button('Add native file','add-native-binding')}</details></fieldset>`;}).join('')}<div class="form-footer"><button class="primary">Save bindings and accept inventory</button>${button('Accept inventory as shown','inventory-commit',{id:intake.id})}</div></form>`);
}
async function renderInventory(){
  const s=(await ops('inventories.get',{snapshot_id:state.params.id})).snapshot;state.inventory=s;
  main.innerHTML=`<div class="breadcrumbs">${link('Inventory versions','inventories')}<span>${esc(s.label)}</span></div>`+
    heading(s.label,'The original source observation and its accepted native file bindings.',badge(s.kind))+
    card('Retained inventory',definition([['Observed',esc(date(s.observed_at))],['Accepted',esc(date(s.created_at))+' · '+esc(s.author)],['Source',`<a href="/api/files/${enc(s.file_id)}">${esc(fileName(s.file_id))}</a>`],['Snapshot SHA-256',`<code>${esc(s.sha256)}</code>`],['Original CSV SHA-256',`<code>${esc(s.source_sha256)}</code>`]]))+
    card('Original comparison rows',manifestTable(s.rows))+card('Bound native sources',bindingsTable(s.bindings))+
    `<div class="actions">${link('Create a cohort using this inventory','plan-new',{[s.kind==='BASELINE'?'baseline_id':'candidate_id']:s.id})}${link('Compare versions','inventories')}</div>`;
}

function renderPlans(){
  main.innerHTML=heading('Cohort plans','Set the actual source pair and explicit site scope for each migration wave.',link('Create cohort','plan-new'))+
    card('Migration cohorts',table(['Cohort','Scope','Source pair','Audit','Review'],planRows(plans())))+
    card('Review sequence','<p>Choose retained source observations, identify the comparison IDs, run the original field audit, resolve actual changes and retain a reviewer decision for the selected cohort revision.</p>');
}
function planForm(p={},editing=false){
  return `<form data-form="plan" data-editing="${editing?'1':'0'}"><div class="form-grid">${input('Cohort name','name',p.name||'','text',true)}${input('Accountable owner','owner',p.owner||'')}${select('Baseline observation','baseline_id',snapshotOptions(),p.baseline_id||state.params.baseline_id||'')}${select('Candidate observation','candidate_id',snapshotOptions(),p.candidate_id||state.params.candidate_id||'')}<div class="full">${area('Comparison IDs in this cohort','agency_ids',(p.agency_ids||[]).join('\n'),true,'One exact original agency_id from the manifests per line. A site’s owning agency is recorded separately in the site register.')}</div>${input('Minimum baseline sites','min_agencies',p.min_agencies||'','number',false,'Defaults to the number of selected comparison IDs.')}${input('Rollback instruction / runbook','rollback_reference',p.rollback_reference||'')}${input('Operating window starts','window_start',p.window_start||'','text',false,'Actual time including UTC offset.')}${input('Operating window ends','window_end',p.window_end||'','text',false,'Actual time including UTC offset.')}<div class="full">${area('Operating context','notes',p.notes||'')}${editing?area('Reason for this cohort revision','reason','',true):''}</div></div><button class="primary">${editing?'Retain revised cohort':'Create cohort'}</button></form>`;
}
function auditTable(checks){return table(['Comparison ID','Field','Baseline','Candidate','Result','Reason'],checks.map(c=>[esc(c.agency_id),esc(c.field),`<code>${esc(c.before)}</code>`,`<code>${esc(c.after)}</code>`,badge(c.result,c.result==='FAIL'),esc(c.reason)+(c.approved_by?`<small>${esc(c.approved_by)}</small>`:'')]));}
async function renderPlan(editing=false){
  const result=await ops('plans.get',{plan_id:state.params.id,...(state.params.revision?{revision:state.params.revision}:{})}),p=result.plan;
  state.plan=result;const current=plans().find(x=>x.id===p.id),historical=current?.revision!==p.revision;
  if(editing){if(historical)throw Error('Open the current cohort revision before editing.');main.innerHTML=`<div class="breadcrumbs">${link(p.name,'plan',{id:p.id})}<span>Revise cohort</span></div>`+heading('Revise '+p.name,'The existing source pair, audits and decisions remain available in their original revision.')+card('Cohort revision',planForm(p,true));return;}
  const audits=(result.audits||[]).filter(a=>a.plan_revision===p.revision).reverse(),audit=state.params.audit?audits.find(a=>a.id===state.params.audit):audits[0],latest=audits[0];
  const approvals=(result.approvals||[]).map(a=>({...a,revoked:(result.revocations||[]).some(r=>r.approval_id===a.id)})),reviews=(result.reviews||[]).filter(r=>r.plan_revision===p.revision).reverse();
  const findings=(audit?.summary?.checks||[]),exact=findings.filter(c=>comparedFields.includes(c.field)&&c.result==='FAIL');
  main.innerHTML=`<div class="breadcrumbs">${link('Cohort plans','plans')}<span>${esc(p.name)}</span></div>`+
    heading(p.name,p.notes||'Review the retained source pair and the exact cohort decision.',historical?badge('Historical revision'):`${button('Run source audit','audit',{id:p.id,revision:p.revision},true)}${link('Revise cohort','plan-edit',{id:p.id})}`)+
    (historical?`<div class="callout">${link('Open current cohort revision','plan',{id:p.id})}</div>`:'')+
    `<div class="grid wide"><div>${card('Selected cohort',definition([['Baseline',link(snapshotName(p.baseline_id),'inventory',{id:p.baseline_id})],['Candidate',link(snapshotName(p.candidate_id),'inventory',{id:p.candidate_id})],['Comparison IDs',esc(p.agency_ids.join(', '))],['Minimum baseline',esc(p.min_agencies)],['Owner',esc(p.owner||'—')],['Operating window',esc(date(p.window_start))+' – '+esc(date(p.window_end))],['Rollback instruction',esc(p.rollback_reference||'—')],['Cohort revision',`<code>${esc(p.revision)}</code>`]]))}${card('Original field audit',audit?`<div class="split-heading"><div>${badge(audit.status,audit.status==='FAIL')} · ${esc(date(audit.created_at))} · ${esc(audit.author)}</div></div>${definition([['Matched sites',esc(audit.summary.matched_sites)],['Approved changes',esc(audit.summary.approved_changes)],['Open findings',esc(audit.summary.blocking_issues)]])}<h3>Exact findings</h3>${findings.length?auditTable(findings):empty('The original comparison found no differing fields or failed observations.')}${(audit.scope_issues||[]).length?card('Declared scope findings',table(['Finding'],audit.scope_issues.map(x=>[detailValue(x)]))):''}${rawDetails('Original audit inputs and structured result',audit)}`:empty('Run the source audit for this cohort revision.'))}${exact.length&&!historical&&isReviewer()?card('Review an exact field change',`<form data-form="approval">${select('Observed change','finding',exact.map((c,i)=>[String(i),c.agency_id+' · '+c.field+' · '+c.before+' → '+c.after]))}${area('Reason and approving instruction','reason','',true)}<button class="primary">Retain exact change decision</button></form>`):''}${card('Operating work',table(['Operation','Cohort','Environment','State','Progress'],opRows(result.operations||[])))}<div class="actions">${link('Start native operation','operation-new',{plan_id:p.id})}${link('Register migration issue','new',{kind:'migration_issues'})}</div></div><div>${!historical&&isReviewer()?card('Cohort reviewer decision',latest?`<form data-form="review">${definition([['Current audit',badge(latest.status)],['Audited',esc(date(latest.created_at))]])}${select('Decision','decision',[['APPROVE','Approve this successful source audit'],['RETURN','Return for work']],latest.status==='PASS'?'APPROVE':'RETURN')}${area('Decision and operating reference','reason','',true)}<button class="primary">Retain reviewer decision</button></form>`:empty('Run the cohort audit before recording its review.')):''}${card('Retained reviewer decisions',reviews.length?`<ol class="timeline">${reviews.map(r=>`<li><span class="time">${esc(date(r.created_at))} · ${esc(r.author)}</span><h3>${esc(r.decision)}</h3><p>${esc(r.reason)}</p><code>${esc(short(r.audit_id))}</code></li>`).join('')}</ol>`:empty('The reviewer decision will be retained with this source pair.'))}${card('Source change decisions',approvals.length?approvals.map(a=>`<details><summary>${esc(a.agency_id)} · ${esc(a.field)} ${a.revoked_at||a.revoked?badge('Revoked'):''}</summary>${definition([['Before',`<code>${esc(a.before)}</code>`],['After',`<code>${esc(a.after)}</code>`],['Approved by',esc(a.approved_by)],['Reason',esc(a.reason)],['Original revision',`<code>${esc(short(a.plan_revision))}</code>`]])}${isReviewer()&&!a.revoked_at&&!a.revoked?button('Revoke this decision','revoke-approval',{id:a.id}):''}</details>`).join(''):empty('Exact approved changes will appear here.'))}${card('Cohort history',(result.versions||[]).map(v=>`<p>${link(short(v.revision),'plan',{id:p.id,revision:v.revision})}<small> · ${esc(date(v.created_at||v.updated_at))} · ${esc(v.author)}</small></p>`).join(''))}${card('Audit history',audits.map(a=>`<p>${link(a.status+' · '+date(a.created_at),'plan',{id:p.id,revision:p.revision,audit:a.id})}</p>`).join('')||empty('Run the original source audit.'))}</div></div>`;
  state.findings=exact;state.currentAudit=latest;
}

async function renderNative(){
  const environment=await api('entities/environments/'+enc(state.params.id));
  const result=await ops('operations.capabilities',{environment_id:environment.id});
  state.environment=environment;state.capabilities=result;
  const schema=result.configuration_schema||result.capabilities?.configuration_schema||{},providers=schema.providers||[];
  const config=result.current_config||result.profile?.config||result.capabilities?.current_config||{};
  state.profileDrafts={[config.source_kind||providers[0]?.value]:{...config}};
  const selected=config.source_kind||providers[0]?.value||'';
  state.profileDrafts[selected]??={};
  state.profileDrafts[selected].environment_id??=environment.data.provider_resource_id||'';
  if(['drush','tome'].includes(selected))state.profileDrafts[selected].uri??=environment.data.canonical_url||'';
  main.innerHTML=`<div class="breadcrumbs">${link('Environments','records',{kind:'environments'})}<span>${esc(environment.data.name)}</span></div>`+
    heading(environment.data.name+' · Native tools','Configure the actual Drupal, Tome, Acquia, Lagoon, Pantheon, Skpr, Tugboat, Upsun or Castor environment and its existing native tools.',link('Environment record','record',{kind:'environments',id:environment.id}))+
    `<div class="grid wide"><div>${card('Native driver profile',state.user.role==='admin'?`<form data-form="native-profile">${select('Native source','source_kind',providers.map(p=>[p.value,p.label]),selected)}<div id="native-profile-fields"></div><button class="primary">Save native configuration</button></form>`:definition(Object.entries(config).map(([k,v])=>[k,detailValue(v)])))}${card('Observed native capability',nativeCapability(result))}</div><div>${card('Operating target',definition([['Provider',esc(environment.data.provider)],['Purpose',esc(environment.data.purpose)],['Provider resource',esc(environment.data.provider_resource_id||'—')],['Canonical URL',esc(environment.data.canonical_url||'—')],['Authority reference',esc(environment.data.authorization_reference)],['Profile revision',`<code>${esc(result.profile?.revision||'Not configured')}</code>`]]))}${card('Native operation',`<p>Capture original native source, prepare a backup download, or execute this provider’s reviewed cohort operation.</p><div class="actions">${link('Capture original source','operation-new',{environment_id:environment.id,type:'CAPTURE'})}${['tugboat','upsun','castor'].includes(selected)?link(selected==='castor'?'Run selected task':selected==='upsun'?'Operate environment':'Operate preview','operation-new',{environment_id:environment.id,type:'PREVIEW'}):link('Prepare cohort operation','operation-new',{environment_id:environment.id})}${['lagoon','pantheon','skpr'].includes(selected)?link('Download selected native backup','operation-new',{environment_id:environment.id,type:'BACKUP_DOWNLOAD'}):''}${['pantheon','skpr','upsun','castor'].includes(selected)?link(selected==='upsun'?'Create native backup snapshot':'Create and retain native backup','operation-new',{environment_id:environment.id,type:'BACKUP_CREATE'}):''}</div>`)}</div></div>`;
  if(state.user.role==='admin')renderNativeFields(selected);
}
function nativeCapability(result){
  if(window.GovHubCastor?.isCastor(result))return window.GovHubCastor.capability(result)+rawDetails('Original capability observation',result.capabilities||result);
  if(window.GovHubUpsun?.isUpsun(result))return window.GovHubUpsun.capability(result)+rawDetails('Original capability observation',result.capabilities||result);
  if(window.GovHubSkpr?.isSkpr(result))return window.GovHubSkpr.capability(result)+rawDetails('Original capability observation',result.capabilities||result);
  const c=result.capabilities||result,items=c.native_status||{};
  const status=Array.isArray(items)?table(['Native observation'],items.map(x=>[detailValue(x)])):definition(Object.entries(items).map(([k,v])=>[k,detailValue(v)]));
  return status+((c.actions||[]).length?`<p>Available actions: ${esc(c.actions.map(a=>typeof a==='string'?a:a.label||a.value||a.name).join(', '))}</p>`:'')+
    (c.target_fingerprint?definition([['Observed target fingerprint',`<code>${esc(c.target_fingerprint)}</code>`]]):'')+
    rawDetails('Original capability observation',c);
}
function renderNativeFields(provider){
  const r=state.capabilities,s=r.configuration_schema||r.capabilities?.configuration_schema||{},p=(s.providers||[]).find(x=>x.value===provider);
  const current=state.profileDrafts[provider]||{};
  document.querySelector('#native-profile-fields').innerHTML=p?`<div class="form-grid">${p.fields.map(f=>{
    const value=current[f.name]??f.default??'',type=['integer','number'].includes(f.type)?'number':'text';
    if(f.type==='boolean')return `<label class="check"><input name="${esc(f.name)}" type="checkbox"${value?' checked':''}>${esc(f.label)}<small>${esc(f.help||'')}</small></label>`;
    if(f.type==='textarea')return area(f.label,f.name,value,Boolean(f.required))+(f.help?`<small class="field-help">${esc(f.help)}</small>`:'');
    if(f.options)return select(f.label,f.name,f.options,value,f.help||'');
    return input(f.label,f.name,value,type,f.required,f.help||'');
  }).join('')}</div>`:empty('Choose an available native source.');
}
function profileValues(form){
  const r=state.capabilities,s=r.configuration_schema||r.capabilities?.configuration_schema||{},provider=form.elements.source_kind.value,p=(s.providers||[]).find(x=>x.value===provider),config={source_kind:provider};
  for(const f of p?.fields||[]){const element=form.elements.namedItem(f.name),v=element?.value??'';if(f.type==='boolean')config[f.name]=Boolean(element?.checked);else if(v!=='')config[f.name]=['integer','number'].includes(f.type)?Number(v):v;}
  return config;
}
function renderOperations(){
  main.innerHTML=heading('Native operations','Operate the configured target, retain original progress and reconcile the exact restored observation.',link('Start operation','operation-new'))+
    card('Operating queue',table(['Operation','Cohort','Environment','State','Progress'],opRows(operations())))+
    `<div class="grid">${card('Native source capture',`<p>Capture the actual Drupal, Tome, Acquia, Lagoon, Pantheon, Skpr, Tugboat, Upsun or Castor environment and retain the complete native source inventory.</p>${link('Capture original source','operation-new',{type:'CAPTURE'})}`)}${card('Compare retained operations',`<form data-form="compare" data-domain="operations">${select('Earlier operation','before_id',[['','Choose an operation'],...operations().map(o=>[o.id,o.type+' · '+short(o.id)+' · '+date(o.created_at)])])}${select('Later operation','after_id',[['','Choose an operation'],...operations().map(o=>[o.id,o.type+' · '+short(o.id)+' · '+date(o.created_at)])])}<button>Compare source and result</button></form>`)}</div>`;
}
async function renderOperationNew(){
  state.operationKey=newKey();state.operationDraft={};state.operationCapabilities=new Map();state.operationChoiceSequence=0;
  const p=plans().find(p=>p.id===state.params.plan_id);
  main.innerHTML=heading('Start a native operation','Select the actual environment, source cohort and authorized native work.')+
    `<div class="grid wide">${card('Operating instruction',`<form data-form="operation-new">${select('Operation purpose','type',[['CAPTURE','Capture original source'],['PREVIEW','Operate native preview or environment'],['BACKUP_CREATE','Create and retain a native backup'],['BACKUP_DOWNLOAD','Download selected native backup'],['REHEARSAL','Rehearse the baseline operation'],['CUTOVER','Apply approved candidate'],['ROLLBACK','Return to original baseline']],state.params.type||'REHEARSAL')}<div id="operation-plan-field">${select('Source cohort','plan_id',planOptions(),p?.id||'')}</div>${select('Target environment','environment_id',refOptions('environments'),state.params.environment_id||'')}<div id="operation-native-choice"></div>${input('Operating authorization reference','authorization_reference','','text',true,'Use the actual operating instruction for this target and source.')}<button class="primary">Queue native operation</button></form>`)}<div>${card('Pinned source and target','<p>The operation retains the exact source snapshot, cohort revision, target environment and native driver configuration selected here. The completed cohort result is compared to that source through the original six-column inventory. Backup creation and download retain their exact native archives as source operations.</p>')}<div id="operation-readiness"></div></div></div>`;
  await operationChoice();
}
async function operationChoice(){
  const form=main.querySelector('[data-form=operation-new]');if(!form)return;
  const sequence=++state.operationChoiceSequence,submit=form.querySelector('button[type=submit],button.primary');
  submit.disabled=true;
  const v=values(form),needsPlan=!['CAPTURE','PREVIEW','BACKUP_CREATE','BACKUP_DOWNLOAD'].includes(v.type);
  const current=()=>form.isConnected&&sequence===state.operationChoiceSequence;
  document.querySelector('#operation-plan-field').hidden=!needsPlan;
  const environment=records('environments').find(r=>r.id===v.environment_id);
  if(!environment){
    state.operationCapability=null;
    document.querySelector('#operation-native-choice').innerHTML='';
    document.querySelector('#operation-readiness').innerHTML=card('Target configuration',empty('Choose the actual target environment.'));
    return;
  }
  const cacheKey=environment.id+':'+environment.revision;
  let pending=state.operationCapabilities.get(cacheKey);
  if(!pending){
    pending=ops('operations.capabilities',{environment_id:environment.id});
    state.operationCapabilities.set(cacheKey,pending);
  }
  let r;
  try{r=await pending;}
  catch(error){if(state.operationCapabilities.get(cacheKey)===pending)state.operationCapabilities.delete(cacheKey);if(current())throw error;return;}
  if(!current())return;
  const config=r.current_config||r.profile?.config||r.capabilities?.current_config||{},kind=config.source_kind;
  const available=r.capabilities?.operation_actions?.[v.type]||[],action=available.some(a=>a.value===v.native_action)?v.native_action:available[0]?.value||'';
  const plan=plans().find(p=>p.id===v.plan_id);
  let source;
  if(needsPlan&&plan)source=(await ops('inventories.get',{snapshot_id:v.type==='CUTOVER'?plan.candidate_id:plan.baseline_id})).snapshot;
  if(!current())return;
  state.operationCapability=r;
  const backups=[...new Set((source?.bindings||[]).map(b=>b.backup_sha256||b.backup?.sha256||state.snapshot.files.find(f=>f.id===b.backup_file_id)?.sha256).filter(Boolean))];
  document.querySelector('#operation-native-choice').innerHTML=(available.length>1?select('Native action','native_action',available.map(a=>[a.value,a.label]),action,'Each action retains a separate native instruction and its original result.'):input('Native action','native_action',action,'text',true,available[0]?.label||'This provider does not offer the selected operation purpose.'))+
    (needsPlan&&plan?checks('Original comparison IDs operated by this command','operation_agency_ids',plan.agency_ids,plan.agency_ids)+(['lagoon','pantheon','skpr','upsun','castor'].includes(kind)?'':select('Exact source backup','backup_sha256',[['','Use the uniquely selected source backup'],...backups.map(h=>[h,h])])):'')+
    input('Observed target fingerprint','target_fingerprint',r.capabilities?.target_fingerprint||r.target_fingerprint||'','text',false,'The actual target identity observed by the selected native driver.');
  if(available.length<=1)form.elements.native_action.readOnly=true;
  if(form.elements.target_fingerprint)form.elements.target_fingerprint.readOnly=true;
  if(!form.elements.authorization_reference.value)form.elements.authorization_reference.value=environment.data.authorization_reference||'';
  document.querySelector('#operation-readiness').innerHTML=card('Target readiness',nativeCapability(r)+`<p>${link('Configure native tools','native',{id:environment.id})} · <button type="button" data-action="refresh-native-choice">Refresh native inventory</button></p>`);
  submit.disabled=!action;
}

function operationStatus(result){
  const o=result.operation,p=o.progress||{};
  return `<div class="split-heading"><div>${badge(o.state,['FAILED','WAITING_NATIVE'].includes(o.state))}</div><small>Updated ${esc(date(o.updated_at))}</small></div>${definition([['Current stage',esc(p.stage||'Queued')],['Progress',esc(p.completed??0)+' / '+esc(p.total??0)],['Detail',esc(p.detail||'—')]])}${o.error?`<div class="callout">${esc(typeof o.error==='string'?o.error:o.error.message||JSON.stringify(o.error))}</div>`:''}`;
}
function operationEvents(result){
  const events=result.events||[];if(!events.length)return empty('The original worker events will appear here.');
  const name=e=>e.event||e.type||e.stage||e.action||'Operation progress';
  const render=e=>`<li><span class="time">${esc(date(e.created_at||e.at))} · ${esc(e.author||e.actor||'Native worker')}</span><h3>${esc(name(e))}</h3><p>${esc(e.message||e.note||e.detail||e.details?.message||'')}</p>${e.details?rawDetails('Retained checkpoint',e.details):''}</li>`;
  const rows=[];let checkpoints=[];
  function flush(){
    if(!checkpoints.length)return;
    if(checkpoints.length===1)rows.push(render(checkpoints[0]));
    else rows.push(`<li><details class="native-checkpoint-group"><summary>${checkpoints.length} native checkpoints</summary><p class="time">${esc(date(checkpoints[0].created_at||checkpoints[0].at))} to ${esc(date(checkpoints.at(-1).created_at||checkpoints.at(-1).at))}</p><ol class="timeline">${checkpoints.map(render).join('')}</ol></details></li>`);
    checkpoints=[];
  }
  for(const event of events){if(name(event)==='Native checkpoint retained')checkpoints.push(event);else{flush();rows.push(render(event));}}
  flush();return `<ol class="timeline">${rows.join('')}</ol>`;
}
function observationDetails(o){
  return `<section class="card soft"><div class="split-heading"><h3>${esc(date(o.created_at))}</h3>${badge(o.status,o.status==='FAIL')}</div>${definition([['Restored inventory',link(snapshotName(o.restored_snapshot_id),'inventory',{id:o.restored_snapshot_id})],['Native started',esc(date(o.actual_started_at))],['Native finished',esc(date(o.actual_finished_at))],['Elapsed native work',esc(o.duration_seconds)+' seconds'],['Original execution',`<a href="/api/files/${enc(o.capture_file_id)}">Download original native capture</a>`],['Observed by',esc(o.author)],['Context',esc(o.notes)]])}${o.summary?.checks?.length?auditTable(o.summary.checks):empty('The actual restored inventory matches the selected source fields.')}${(o.missing_declared_ids||[]).length?`<div class="callout">Comparison IDs absent from both observations: ${esc(o.missing_declared_ids.join(', '))}</div>`:''}</section>`;
}
function retainedDownloads(files,domain,id){
  const items=files||[],primary=items.filter(f=>/\.(zip|html)$/.test(f.name)),others=items.filter(f=>!primary.includes(f));
  const boxes=list=>`<div class="download-grid">${list.map(f=>`<div class="download-box"><strong><a href="/api/${enc(domain)}/${enc(id)}/${enc(f.name)}">${esc(f.name)}</a></strong><small>${esc(size(f.size))}</small></div>`).join('')}</div>`;
  return boxes(primary.length?primary:items)+(primary.length&&others.length?`<details><summary>Individual files (${others.length})</summary>${boxes(others)}</details>`:'')+
    `<details><summary>Retained file hashes</summary>${table(['File','Bytes','SHA-256'],items.map(f=>[esc(f.name),esc(f.size),`<code>${esc(f.sha256)}</code>`]))}</details>`;
}

function tugboatContinuationFields(o){
  if(!o.native_action?.startsWith('tugboat-'))return '';
  const raw=o.resume_checkpoint||o.checkpoint||{},native=raw.resume_checkpoint||raw.state||raw;
  const pending=native.native_poll||{},rows=native.candidate_jobs||[];
  const identity=definition([['Original job',esc(pending.id||'Awaiting original provider identity')],['Preview',esc(pending.preview_id||o.profile?.config?.preview_id||'Created by this operation')],['Native phase',esc(native.phase||'prepared')]]);
  const paths={...(o.profile?.config||{}),...(o.runtime_bindings||{})};
  const receiving='<details><summary>Receiving machine</summary>'+
    '<label class="check"><input type="checkbox" name="use_tugboat_runtime_bindings">Use these native references for this continuation</label>'+
    input('Original Git project root','tugboat_runtime_site_root',paths.site_root||'','text',false,'Restore the retained Git bundle and select its actual checkout on this host.')+
    input('Git executable','tugboat_runtime_git_path',paths.git_path||'','text',false)+
    input('Existing API-key environment variable','tugboat_runtime_access_token_env',paths.access_token_env||'','text',false,'Supply the variable name, with its existing authorized key kept on this host.')+
    '<p class="field-help">The original project, repository, reviewed commit, request and job identity remain attached to this operation.</p></details>';
  return '<fieldset><legend>Original Tugboat preview operation</legend>'+identity+receiving+
    (['dispatching','native_interrupted'].includes(native.phase)?input('Original native job ID','tugboat_job_id',pending.id||o.tugboat_job_association?.id||'','text',false,'Use the actual job for this retained dispatch. Its repository, action, created time and preview source are checked before continuing.')+
      (rows.length?rawDetails('Original provider jobs received after dispatch',rows):''):'')+
    '<p class="field-help">The complete original request, response, Git source, job log and preview result remain in this operation’s downloads.</p></fieldset>';
}

function pantheonContinuationFields(o){
  if(!o.native_action?.startsWith('pantheon-'))return '';
  const raw=o.resume_checkpoint||o.checkpoint||{},native=raw.resume_checkpoint||raw.state||raw;
  let result='';
  const label=native.pending_step,step=native.steps?.[label];
  if(label&&step&&!['complete','provider_failed'].includes(step.phase)){
    result+='<fieldset><legend>Original Pantheon workflow</legend><p>'+esc(label)+' · command '+esc(short(step.argv_sha256))+'</p>'+
      '<input type="hidden" name="native_workflow_step" value="'+esc(label)+'">'+
      input('Original provider workflow UUID','native_workflow_id',step.workflow_id||(o.native_workflow_step===label?o.native_workflow_id:'')||'','text',false,'Select the exact workflow for this retained command. The same operation checks its native site, environment and status.')+
      '<p class="field-help">Completed native steps stay attached to this operation. The original command and output are in its retained artifacts.</p></fieldset>';
  }
  const backup=native.pending_backup_set;
  if(backup){
    const prior=o.native_backup_selections?.[backup]||{};
    result+='<fieldset><legend>Original backup component selection</legend><p>'+esc(backup)+'</p><input type="hidden" name="native_backup_step" value="'+esc(backup)+'">';
    for(const element of ['code','database','files']){
      const candidates=(native.backup_candidates||[]).filter(r=>r.element===element);
      result+=select(element[0].toUpperCase()+element.slice(1)+' backup filename','native_backup_'+element,[['','Choose the original completed backup'],...candidates.map(r=>[r.file,r.file+' · '+r.date+' · '+r.size])],prior[element]||'');
    }
    result+='<p class="field-help">These files came from the retained backup result. Resume joins the selected set to the completed backup command.</p></fieldset>';
  }
  const paths={...(o.profile?.config||{}),...(o.runtime_bindings||{})};
  result+='<details><summary>Receiving machine</summary><p>Use the current machine’s PHP, Terminus and working directory when continuing this saved operation.</p>'+
    '<label class="check"><input type="checkbox" name="use_runtime_bindings">Use these local paths for this continuation</label>'+
    input('Terminus executable or PHAR','runtime_terminus_path',paths.terminus_path||'','text',false)+
    input('PHP executable','runtime_php_path',paths.php_path||'','text',false,'Leave empty when Terminus is directly executable.')+
    input('Native working directory','runtime_site_root',paths.site_root||'','text',false)+
    '<p class="field-help">The operation retains the same native site, reviewed source and workflow. Its earlier command history stays available.</p></details>';
  return result;
}

async function renderOperation(){
  const r=await ops('operations.get',{operation_id:state.params.id}),o=r.operation;state.operation=r;state.resumeKey=newKey();
  const complete=o.state==='COMPLETE',sourceOnly=['CAPTURE','PREVIEW','BACKUP_CREATE','BACKUP_DOWNLOAD'].includes(o.type);
  const originalTask=o.resume_checkpoint?.task_id||o.native_task_id||'';
  const taskContinuation=o.native_action==='lagoon-switch-active-standby'?input('Original Lagoon task ID','native_task_id',originalTask,'number',false,'Only for recovering this original switch after its response was lost. Select the actual native task; the operation will verify its environment and purpose.'):'';
  const pantheonContinuation=pantheonContinuationFields(o)+tugboatContinuationFields(o)+(window.GovHubUpsun?await window.GovHubUpsun.continuation(o):'')+(window.GovHubCastor?await window.GovHubCastor.continuation(o):'');
  const skprContinuation=window.GovHubSkpr?await window.GovHubSkpr.continuation(o):'';
  const selectedBackups=[...new Set((o.source_snapshot?.rows||[]).filter(row=>(o.agency_ids||[]).includes(row.agency_id)).map(row=>row.backup_sha256).filter(Boolean))];
  main.innerHTML=`<div class="breadcrumbs">${link('Native operations','operations')}<span>${esc(short(o.id))}</span></div>`+
    heading(o.type+' · '+recordName('environments',o.environment_id),'The selected source, original native work and retained result.',button('Refresh operation','refresh-operation'))+
    `<div class="grid wide"><div>${card('Native progress',`<div id="native-operation-status">${operationStatus(r)}</div>`)}${card('Pinned operating instruction',definition([['Operation',`<code>${esc(o.id)}</code>`],['Native action',esc(o.native_action||o.config?.action||'—')],['Cohort',o.plan_id?link(planName(o.plan_id),'plan',{id:o.plan_id,revision:o.plan_revision}):'Source capture'],['Selected source',o.source_snapshot_id?link(snapshotName(o.source_snapshot_id),'inventory',{id:o.source_snapshot_id}):'Current native environment'],['Comparison IDs',esc((o.agency_ids||[]).join(', ')||'Native source capture')],['Selected backup',`<code>${esc(selectedBackups.join(', ')||o.backup_sha256||'—')}</code>`],['Target environment',link(recordName('environments',o.environment_id),'record',{kind:'environments',id:o.environment_id,revision:o.environment_revision||o.environment?.revision||''})],['Authorization',esc(o.authorization_reference)],['Started',esc(date(o.actual_started_at||o.started_at))],['Completed',esc(date(o.actual_finished_at||o.finished_at))]]))}${o.native_action?.startsWith('castor-')?card('Task and verification',window.GovHubCastor.result(o)):''}${card('Original native artifacts',`<div id="native-operation-files">${r.files?.length?retainedDownloads(r.files,'operations',o.id):empty('The worker retains each original native artifact as it completes.')}</div>`)}${(r.observations||[]).length?card('Restored source observations',r.observations.slice().reverse().map(observationDetails).join('')):''}${card('Retained event sequence',`<div id="native-operation-events">${operationEvents(r)}</div>`)}</div><div>${!complete&&!sourceOnly?card('Attach the actual restored observation',`<form data-form="operation-observe">${select('Original native execution capture','capture_file_id',fileOptions('Choose the native capture'),o.native_capture_file_id||'')}${select('Observed restored inventory','restored_snapshot_id',snapshotOptions())}${input('Native work started at','actual_started_at',o.actual_started_at||'','text',true,'Actual time including UTC offset.')}${input('Native work finished at','actual_finished_at',o.actual_finished_at||'','text',true,'Actual time including UTC offset.')}${area('Observed work and operating context','notes','',true)}<button class="primary">Reconcile actual restore result</button><p class="field-help">Retain the original capture and inventory in Sources, then select them here.</p></form>`):''}${!complete?card('Operating continuation',`<form data-form="operation-control">${taskContinuation}${pantheonContinuation}${skprContinuation}${area('Operating instruction / reason','reason','',true)}<div class="actions">${['PAUSED','WAITING_NATIVE','FAILED','CANCELLED'].includes(o.state)?'<button name="control" value="resume">Resume retained work</button>':''}${!['CANCELLED','COMPLETE'].includes(o.state)?'<button name="control" value="cancel">Cancel remaining work</button>':''}</div></form>`):card('Complete result',`<p>The retained native result is available with this operation’s original source and target.</p><div class="actions">${link('Prepare a handover','handover')}${link('Open retained sources','sources')}</div>`)}${rawDetails('Complete original operation',o)}</div></div>`;
  state.operationDirty=false;
}
async function pollOperation(){
  if(state.busy||!state.user||state.view!=='operation'||!state.operation)return;
  const id=state.operation.operation.id;
  if(['COMPLETE','CANCELLED'].includes(state.operation.operation.state))return;
  try{
    const r=await ops('operations.get',{operation_id:id});
    if(state.view!=='operation'||state.params.id!==id)return;
    const previous=state.operation.operation;
    state.operation=r;
    if(!state.operationDirty&&(window.GovHubSkpr?.needsRefresh(previous,r.operation)||window.GovHubUpsun?.needsRefresh(previous,r.operation)||window.GovHubCastor?.needsRefresh(previous,r.operation))){await renderOperation();return;}
    const status=document.querySelector('#native-operation-status'),events=document.querySelector('#native-operation-events'),files=document.querySelector('#native-operation-files');
    if(status)status.innerHTML=operationStatus(r);if(events)events.innerHTML=operationEvents(r);if(files&&r.files?.length)files.innerHTML=retainedDownloads(r.files,'operations',id);
    if(['COMPLETE','CANCELLED'].includes(r.operation.state))notice('Native operation '+r.operation.state.toLowerCase()+'. Refresh the operation to open its completed controls.');
  }catch(e){if(e.status===401){state.user=null;renderLogin();}}
}

const visitorEditions=()=>state.snapshot?.govhub?.visitor?.editions||[];
const visitorEditionName=id=>visitorEditions().find(e=>e.id===id)?.label||id;
function renderHandover(){
  main.innerHTML=heading('Complete handover','Retain the selected cohorts, content consolidations and visitor editions with their original sources, review and operating history.')+
    card('Retained handovers',table(['Handover','Captured','Cohorts','Consolidations','Visitor editions','POTS projects','Publishing playbooks','Files','Operator'],handovers().map(e=>[link(e.name,'export',{id:e.id}),esc(date(e.created_at)),esc(e.plan_ids.length),esc((e.content_family_ids||[]).length),esc((e.visitor_edition_ids||[]).length),esc((e.pots_project_ids||[]).length),esc((e.playbook_version_ids||[]).length),esc(e.files.length),esc(e.author)])))+
    `<div class="grid">${card('Create a handover',`<form data-form="handover" data-request-key="${newKey()}">${input('Handover name','name','','text',true)}${checks('Included cohorts','plan_ids',plans().map(p=>[p.id,p.name]))}${checks('Included content consolidations','content_family_ids',contentFamilies().map(f=>[f.id,f.label]))}${checks('Included visitor editions','visitor_edition_ids',visitorEditions().map(e=>[e.id,e.label]))}${checks('Included POTS projects','pots_project_ids',window.GovHubPots.projects().map(p=>[p.id,p.label]))}${checks('Included publishing playbooks','playbook_version_ids',window.GovHubPlaybook.entries().map(p=>[p.version_id,p.label+' · edition '+p.revision]))}<label class="check"><input name="include_sources" type="checkbox" checked>Include complete original source files</label><button class="primary">Create complete handover</button></form>`)}${card('Compare retained handovers',`<form data-form="compare" data-domain="exports">${select('Earlier handover','before_id',[['','Choose a handover'],...handovers().map(e=>[e.id,e.name])])}${select('Later handover','after_id',[['','Choose a handover'],...handovers().map(e=>[e.id,e.name])])}<button>Compare retained editions</button></form>`)}</div>`;
}
async function renderExport(){
  const e=(await ops('exports.get',{export_id:state.params.id})).export;state.export=e;
  main.innerHTML=`<div class="breadcrumbs">${link('Complete handover','handover')}<span>${esc(e.name)}</span></div>`+
    heading(e.name,'Download the complete archive or readable handover and retain its original capture time.')+
    card('Handover edition',definition([['Captured',esc(date(e.created_at))],['Prepared by',esc(e.author)],['Cohorts',esc(e.plan_ids.map(planName).join(', '))],['Content consolidations',(e.content_family_ids||[]).map(id=>link(contentName(id),'content-family',{id})).join(', ')||'—'],['Visitor editions',(e.visitor_edition_ids||[]).map(id=>link(visitorEditionName(id),'visitor-edition',{id})).join(', ')||'—'],['POTS projects',(e.pots_project_ids||[]).map(id=>link(window.GovHubPots.projects().find(p=>p.id===id)?.label||id,'pots-project',{id})).join(', ')||'—'],['Publishing playbooks',(e.playbook_version_ids||[]).map(id=>link(window.GovHubPlaybook.entries().find(p=>p.version_id===id)?.label||id,'playbook',{version:id})).join(', ')||'—'],['Edition SHA-256',`<code>${esc(e.sha256)}</code>`]]))+
    card('Complete delivery',retainedDownloads(e.files,'exports',e.id))+
    `<div class="actions">${link('Create another retained edition','handover')}${link('Back up the complete workspace','settings')}</div>`;
}
async function renderComparison(){
  const domain=state.params.domain,allowed=['inventories','operations','exports'];if(!allowed.includes(domain))throw Error('Choose an available comparison.');
  const result=await ops(domain+'.compare',{before_id:state.params.before_id,after_id:state.params.after_id});state.comparison=result;
  const names={inventories:'Inventory observations',operations:'Native operations',exports:'Retained handovers'};
  main.innerHTML=`<div class="breadcrumbs">${link(names[domain],domain==='exports'?'handover':domain)}<span>Comparison</span></div>`+
    heading(names[domain]+' · Comparison','Review the changes between the selected original retained results.')+
    card('Selected editions',definition([['Earlier',esc(domain==='inventories'?snapshotName(result.before_id):(result.before?.name||result.before_id))],['Later',esc(domain==='inventories'?snapshotName(result.after_id):(result.after?.name||result.after_id))]]))+
    Object.entries(result).filter(([k])=>!['before_id','after_id'].includes(k)).map(([name,value])=>{
      if(Array.isArray(value)){const rows=value.map(v=>typeof v==='object'&&v!==null?v:{value:v}),columns=[...new Set(rows.flatMap(v=>Object.keys(v)))];return card(name.replaceAll('_',' '),table(columns,rows.map(v=>columns.map(k=>detailValue(v[k])))));}
      if(value&&typeof value==='object')return card(name.replaceAll('_',' '),definition(Object.entries(value).map(([k,v])=>[k,detailValue(v)])));
      return card(name.replaceAll('_',' '),`<p>${detailValue(value)}</p>`);
    }).join('');
}
function renderSettings(){
  const s=gov().settings||{};
  main.innerHTML=heading('Scope & backup','Retain the issued scope, operating instruction and a complete recoverable workspace.')+
    `<div class="grid">${card('Operating basis',`<form data-form="scope">${select('Original issued scope','file_id',fileOptions('Choose the original scope document'),s.scope_file_id||'')}${area('Scope and operating reference','reference',s.scope_reference||'',true,'Include the actual instruction and how the operating cohort is selected.')}<button class="primary">Retain scope reference</button></form>`)}${card('Complete private backup',`<form data-form="backup">${input('New absolute backup directory','destination','','text',true,'The complete copy includes the source bytes, database, accounts, revisions and generated deliveries. Choose a new directory outside this workspace.')}<button>Create complete backup</button></form><div id="backup-result"></div>`)}</div>`+
    card('Operating scope',definition([['Input mode',badge(s.input_mode||state.snapshot.mode||'SUPPLIED')],['Registered sites',esc(records('sites').length)],['Accepted inventories',esc(snapshots().length)],['Source versions',esc(sourceFiles().length)],['Workspace revision',esc(state.snapshot.head)]]))+
    card('Cohort selection','<p>Use explicit site comparison identifiers supplied for the operating cohort. The service estate and agency count describe different populations; each cohort retains its own named source set and minimum baseline coverage.</p>');
}
async function renderStaff(){
  const r=await api('staff');state.staff=r.staff;
  main.innerHTML=heading('Staff access','Use named operator, reviewer and administrator accounts for retained work.')+
    `<div class="grid wide">${card('Workspace staff',table(['Name','Role','Access','Edit'],r.staff.map(s=>[esc(s.name),badge(s.role),esc(s.disabled?'Disabled':'Active'),button('Edit staff','edit-staff',{name:s.name})])))}${card('Staff member',`<form data-form="staff">${input('Username','name','','text',true)}${select('Role','role',[['operator','Operator — sources, registers and operating work'],['reviewer','Reviewer — exact field decisions and cohort approval'],['admin','Administrator — access and native configuration']],'operator')}<label>New or replacement password<input name="password" type="password" minlength="12" autocomplete="new-password"><small>Required for a new staff member. Leave empty to retain an existing password.</small></label><label class="check"><input name="disabled" type="checkbox">Disable access</label><button class="primary">Save staff access</button></form>`)}</div>`;
}

async function render(){
  window.GovHubPackages?.suspend();
  main.setAttribute('aria-busy','true');
  try {
  if(!state.user){renderLogin();return;}
  renderNavigation();
  if(state.view.startsWith('package')){await window.GovHubPackages.render();return;}
  if(['playbooks','playbook','playbook-edit'].includes(state.view)){await window.GovHubPlaybook.render();return;}
  if(state.view==='static'||state.view.startsWith('static-')){await window.GovHubStaticRelease.render();return;}
  if(state.view.startsWith('visitor')){await window.GovHubVisitor.render();return;}
  if(state.view==='pots'||state.view.startsWith('pots-')){await window.GovHubPots.render();return;}
  if(state.view==='overview')renderOverview();
  else if(state.view==='records')renderRecords();
  else if(['record','new'].includes(state.view)){
    await renderRecord(state.view==='new');
    const extra=document.querySelector('#record-operations');
    if(state.view==='record'&&state.params.kind==='environments'&&extra)extra.innerHTML=card('Native operating tools',`<p>Configure this environment’s actual Drupal, Tome, Acquia, Lagoon, Pantheon, Skpr, Tugboat, Upsun or Castor tools and open its original operations.</p><div class="actions">${link('Native configuration','native',{id:state.params.id})}${link('Start operation','operation-new',{environment_id:state.params.id})}</div>`);
  }
  else if(state.view==='content'||state.view.startsWith('content-'))await renderContent();
  else if(state.view==='sources')await renderSources();
  else if(state.view==='source')await renderSource();
  else if(state.view==='inventories')renderInventories();
  else if(state.view==='intake')await renderIntake();
  else if(state.view==='inventory')await renderInventory();
  else if(state.view==='plans')renderPlans();
  else if(state.view==='plan-new')main.innerHTML=heading('Create a cohort','Select the exact source observations and comparison identifiers for this migration wave.')+card('Cohort scope',planForm());
  else if(state.view==='plan')await renderPlan();
  else if(state.view==='plan-edit')await renderPlan(true);
  else if(state.view==='native')await renderNative();
  else if(state.view==='operations')renderOperations();
  else if(state.view==='operation-new')await renderOperationNew();
  else if(state.view==='operation')await renderOperation();
  else if(state.view==='handover')renderHandover();
  else if(state.view==='export')await renderExport();
  else if(state.view==='comparison')await renderComparison();
  else if(state.view==='settings')renderSettings();
  else if(state.view==='staff')await renderStaff();
  else if(state.view==='activity')await renderActivity();
  else{state.view='overview';renderOverview();}
  } finally { main.setAttribute('aria-busy','false'); }
}
async function go(view,params={}){
  const target=href(view,params);
  if(location.hash===target){route();await render();}
  else location.hash=target;
}
async function refresh(){await reload();await render();}
async function acceptIntake(intake,key){
  const result=await ops('inventories.commit',{intake_id:intake.id,request_key:key});
  await reload();await go('inventory',{id:result.snapshot.id});notice('The complete source observation and bindings are retained.');
}
function readBindings(form){
  return [...form.querySelectorAll('[data-binding]')].map(fieldset=>{
    const read=name=>fieldset.querySelector('[name="'+name+'"]')?.value||'';
    const b={agency_id:fieldset.dataset.binding,files:[]};
    if(read('capture_operation_id'))b.capture_operation_id=read('capture_operation_id');
    for(const name of ['export_file_id','backup_file_id'])if(read(name))b[name]=read(name);
    for(const row of fieldset.querySelectorAll('[data-native-binding]')){
      const role=row.querySelector('[name=extra_role]').value,file_id=row.querySelector('[name=extra_file]').value,relative_path=row.querySelector('[name=extra_path]').value;
      if(file_id)b.files.push({role,file_id,...(relative_path?{relative_path}:{})});
    }
    return b;
  });
}
function nativeBindingRow(b={}){
  return `<fieldset data-native-binding><legend>Native file</legend><div class="form-grid">${select('Role','extra_role',[...new Set(['database_dump','configuration_file','public_files','private_files','configuration','capture','native_status',...(b.role?[b.role]:[])])],b.role||'database_dump')}${select('Retained file','extra_file',fileOptions('Choose original native file'),b.file_id||b.id||b.file?.id||'')}<div class="full">${input('Relative path within native material','extra_path',b.relative_path||b.native?.relative_path||'','text',false,'Native captures preserve this automatically. Supply the original path for an individually retained configuration file.')}</div></div>${button('Remove native binding','remove-native-binding')}</fieldset>`;
}
async function submitForm(form,submitter){
  if(form.dataset.form.startsWith('playbook-'))return window.GovHubPlaybook.submit(form);
  if(form.dataset.form.startsWith('pots-'))return window.GovHubPots.submit(form);
  if(form.dataset.form.startsWith('static-'))return window.GovHubStaticRelease.submit(form,submitter);
  if(form.dataset.form.startsWith('content-'))return contentSubmit(form,submitter);
  const kind=form.dataset.form,v=values(form);
  if(kind.startsWith('visitor-'))return window.GovHubVisitor.submit(form);
  if(kind==='login'){const result=await api('login',v);state.user=result.user;await reload();route();await render();return;}
  if(kind==='filter'){await go('records',v);return;}
  if(kind==='source-filter'){await go('sources',{q:v.q,category:v.category});return;}
  if(kind==='record'){
    const k=form.dataset.kind,id=form.dataset.id||v.record_id;
    const result=await api('entities/'+enc(k)+'/'+enc(id),{data:formRecordData(form,k),expected_revision:form.dataset.id?state.record.revision:null,note:v.change_note||'Original operating record retained',archived:state.record.archived||false});
    await reload();await go('record',{kind:k,id:result.id});notice('The operating record and its history are saved.');return;
  }
  if(kind==='source'){
    const file=form.elements.source_file.files[0],content_base64=await fileBase64(file);
    const result=await api('files',{filename:file.name,content_base64,category:v.category,source_label:v.source_label});
    await reload();await go('source',{id:result.id});notice('The complete original file is retained.');return;
  }
  if(kind==='inventory-preview'){
    const result=await ops('inventories.preview',v);await reload();await go('intake',{id:result.intake.id});return;
  }
  if(kind==='inventory-bindings'){
    const original=state.intake,bindings=readBindings(form),payload={file_id:original.file_id,label:original.label,kind:original.kind,observed_at:original.observed_at,bindings},fingerprint=JSON.stringify(payload);
    if(state.pendingIntakeCommit?.fingerprint!==fingerprint){
      const result=await ops('inventories.preview',payload);
      state.pendingIntakeCommit={fingerprint,intake:result.intake,key:newKey()};
    }
    await acceptIntake(state.pendingIntakeCommit.intake,state.pendingIntakeCommit.key);return;
  }
  if(kind==='plan'){
    const payload={...v,agency_ids:v.agency_ids.split('\n').map(x=>x.trim()).filter(Boolean)};
    if(v.min_agencies==='')delete payload.min_agencies;else payload.min_agencies=Number(v.min_agencies);
    const editing=form.dataset.editing==='1';if(editing){payload.plan_id=state.plan.plan.id;payload.expected_revision=state.plan.plan.revision;}
    const result=await ops(editing?'plans.revise':'plans.create',payload);await reload();await go('plan',{id:result.plan.id});notice(editing?'The revised cohort is retained alongside its earlier decisions.':'The cohort and exact source pair are retained.');return;
  }
  if(kind==='approval'){
    const finding=state.findings[Number(v.finding)];if(!finding)throw Error('Choose a current differing field.');
    const p=state.plan.plan;
    const result=await ops('approvals.save',{plan_id:p.id,expected_revision:p.revision,agency_id:finding.agency_id,field:finding.field,before:String(finding.before),after:String(finding.after),reason:v.reason});
    const revision=result.plan?.revision||p.revision;
    await ops('audits.run',{plan_id:p.id,expected_revision:revision});await refresh();notice('The exact field decision is retained and the cohort audit is refreshed.');return;
  }
  if(kind==='review'){
    await ops('reviews.save',{plan_id:state.plan.plan.id,expected_revision:state.plan.plan.revision,audit_id:state.currentAudit.id,decision:v.decision,reason:v.reason});
    await refresh();notice('The reviewer decision is retained with the current source pair.');return;
  }
  if(kind==='native-profile'){
    await ops('operations.configure',{environment_id:state.environment.id,expected_revision:state.environment.revision,config:profileValues(form)});
    await refresh();notice('The native target configuration is retained.');return;
  }
  if(kind==='operation-new'){
    const p=plans().find(p=>p.id===v.plan_id),capability=state.operationCapability,base={environment_id:v.environment_id,environment_revision:capability?.environment?.revision,config_sha256:capability?.profile?.revision,authorization_reference:v.authorization_reference,request_key:state.operationKey,native_action:v.native_action,...(v.target_fingerprint?{target_fingerprint:v.target_fingerprint}:{})};
    let result;
    if(v.type==='CAPTURE')result=await ops('sources.capture',base);
    else if(['PREVIEW','BACKUP_CREATE','BACKUP_DOWNLOAD'].includes(v.type))result=await ops('operations.create',{...base,type:v.type,native_action:v.native_action,...(v.target_fingerprint?{target_fingerprint:v.target_fingerprint}:{})});
    else{
      if(!p)throw Error('Choose the source cohort for this native operation.');
      const agency_ids=[...form.querySelectorAll('[name=operation_agency_ids]:checked')].map(x=>x.value);
      if(!agency_ids.length)throw Error('Choose the original comparison IDs operated on this exact target.');
      result=await ops('operations.create',{...base,type:v.type,plan_id:p.id,expected_revision:p.revision,native_action:v.native_action,agency_ids,...(v.backup_sha256?{backup_sha256:v.backup_sha256}:{}),...(v.target_fingerprint?{target_fingerprint:v.target_fingerprint}:{})});
    }
    await reload();await go('operation',{id:result.operation.id});notice('The selected native work is queued with its original source and target.');return;
  }
  if(kind==='operation-observe'){
    const o=state.operation.operation;
    await ops('operations.observe',{...v,operation_id:o.id,expected_revision:o.revision});
    await refresh();notice('The actual native result is retained with its original source comparison.');return;
  }
  if(kind==='operation-control'){
    const control=submitter?.value,o=state.operation.operation;if(!['resume','cancel'].includes(control))return;
    const native_task_id=control==='resume'&&v.native_task_id!==undefined&&v.native_task_id!==''?Number(v.native_task_id):undefined;
    if(native_task_id!==undefined&&(!Number.isSafeInteger(native_task_id)||native_task_id<1))throw Error('Use the actual positive integer ID of this original Lagoon task.');
    const nativeContinuation=control==='resume'?{...(window.GovHubSkpr?.continuationPayload(form,o)||{}),...(window.GovHubUpsun?.continuationPayload(form,o)||{}),...(window.GovHubCastor?.continuationPayload(form,o)||{})}:{};
    if(control==='resume'&&form.elements.use_runtime_bindings?.checked){
      const paths={terminus_path:v.runtime_terminus_path?.trim()||'',php_path:v.runtime_php_path?.trim()||'',site_root:v.runtime_site_root?.trim()||''};
      if(!paths.terminus_path||!paths.site_root)throw Error('Select this receiving machine’s Terminus and working directory.');
      nativeContinuation.runtime_bindings=paths;
    }
    if(control==='resume'&&form.elements.use_tugboat_runtime_bindings?.checked){
      const paths={site_root:v.tugboat_runtime_site_root?.trim()||'',git_path:v.tugboat_runtime_git_path?.trim()||'',access_token_env:v.tugboat_runtime_access_token_env?.trim()||''};
      if(Object.values(paths).some(value=>!value))throw Error('Select this receiving machine’s original Git checkout, executable and API-key variable.');
      nativeContinuation.runtime_bindings=paths;
    }
    if(control==='resume'&&v.tugboat_job_id?.trim())nativeContinuation.tugboat_job_id=v.tugboat_job_id.trim();
    if(control==='resume'&&v.native_workflow_id?.trim()){
      nativeContinuation.native_workflow_id=v.native_workflow_id.trim();
      nativeContinuation.native_workflow_step=v.native_workflow_step;
    }
    if(control==='resume'&&v.native_backup_step){
      const files=Object.fromEntries(['code','database','files'].map(k=>[k,v['native_backup_'+k]||'']));
      if(Object.values(files).some(Boolean)){
        if(!Object.values(files).every(Boolean))throw Error('Select the original code, database and files backup components together.');
        nativeContinuation.native_backup_step=v.native_backup_step;
        nativeContinuation.native_backup_files=files;
      }
    }
    await ops('operations.'+control,{operation_id:o.id,expected_revision:o.revision,reason:v.reason,...(control==='resume'?{request_key:state.resumeKey}:{}),...(native_task_id!==undefined?{native_task_id}:{}),...nativeContinuation});
    await refresh();notice(control==='resume'?'The retained operating work is resumed.':'The remaining operating work is cancelled.');return;
  }
  if(kind==='handover'){
    const result=await ops('exports.create',{name:v.name,plan_ids:[...form.querySelectorAll('[name=plan_ids]:checked')].map(x=>x.value),content_family_ids:[...form.querySelectorAll('[name=content_family_ids]:checked')].map(x=>x.value),visitor_edition_ids:[...form.querySelectorAll('[name=visitor_edition_ids]:checked')].map(x=>x.value),pots_project_ids:[...form.querySelectorAll('[name=pots_project_ids]:checked')].map(x=>x.value),playbook_version_ids:[...form.querySelectorAll('[name=playbook_version_ids]:checked')].map(x=>x.value),include_sources:form.elements.include_sources.checked,request_key:form.dataset.requestKey});
    await reload();await go('export',{id:result.export.id});notice('The complete handover and original captured files are retained.');return;
  }
  if(kind==='compare'){
    if(!v.before_id||!v.after_id)throw Error('Choose both retained results.');
    await go('comparison',{domain:form.dataset.domain,before_id:v.before_id,after_id:v.after_id});return;
  }
  if(kind==='scope'){await ops('scope.save',{...v,expected_head:state.snapshot.head});await refresh();notice('The original scope reference is retained.');return;}
  if(kind==='backup'){
    const result=await ops('workspace.backup',{destination:v.destination});
    document.querySelector('#backup-result').innerHTML=`<div class="callout">Complete workspace backup created.</div>${rawDetails('Backup location and retained result',result)}`;
    notice('The complete private backup is available at the selected directory.');return;
  }
  if(kind==='staff'){
    await api('staff',{name:v.name,role:v.role,password:v.password||undefined,disabled:form.elements.disabled.checked});
    const s=await api('session');state.user=s.user;if(state.user){await reload();await renderStaff();}else renderLogin();
    notice('Staff access is saved.');return;
  }
}

main.addEventListener('submit',event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const submitter=event.submitter;busy(()=>submitForm(form,submitter)).catch(()=>{});});
main.addEventListener('input',()=>{if(state.view==='operation')state.operationDirty=true;});
main.addEventListener('change',event=>{
  const form=event.target.closest('form');if(!form)return;
  if(form.dataset.form==='operation-new'&&['type','environment_id','plan_id','native_action'].includes(event.target.name))busy(()=>operationChoice()).catch(()=>{});
  if(form.dataset.form==='native-profile'&&event.target.name==='source_kind')renderNativeFields(event.target.value);
});
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  event.preventDefault();
  busy(async()=>{
    const action=target.dataset.action;
    if(action.startsWith('playbook-'))await window.GovHubPlaybook.action(action,target);
    else if(action.startsWith('pots-'))await window.GovHubPots.action(action,target);
    else if(action.startsWith('castor-'))await window.GovHubCastor.action(action,target);
    else if(action.startsWith('upsun-'))await window.GovHubUpsun.action(action,target);
    else if(action.startsWith('skpr-'))await window.GovHubSkpr.action(action,target);
    else if(action.startsWith('static-'))await window.GovHubStaticRelease.action(action,target);
    else if(action.startsWith('content-'))await contentAction(action,target);
    else if(action==='logout'){await api('logout',{});state.user=null;state.snapshot=null;renderLogin();}
    else if(action==='refresh'||action==='refresh-operation')await refresh();
    else if(action==='refresh-native-choice'){state.operationCapabilities.clear();await operationChoice();}
    else if(action==='audit'){await ops('audits.run',{plan_id:target.dataset.id,expected_revision:target.dataset.revision});await refresh();notice('The complete original source audit is retained.');}
    else if(action==='inventory-commit')await acceptIntake(state.intake,state.intakeKey);
    else if(action==='archive'){
      const reason=prompt('Why is this operating record being '+(target.dataset.archived==='1'?'archived':'restored')+'?');if(!reason?.trim())return;
      const r=state.record;await api('entities/'+enc(target.dataset.kind)+'/'+enc(r.id),{data:r.data,expected_revision:r.revision,note:reason,archived:target.dataset.archived==='1'});
      await refresh();notice('The operating record and retained history are saved.');
    }
    else if(action==='retain-local'){
      const context=prompt('Original source description and export context for '+target.dataset.path);if(!context?.trim())return;
      const result=await ops('sources.retain',{path:target.dataset.path,source_label:context,category:'Extract'});
      await reload();await go('source',{id:result.id});notice('The complete local file is retained.');
    }
    else if(action==='revoke-approval'){
      const reason=prompt('Reason for revoking this exact field decision');if(!reason?.trim())return;
      await ops('approvals.revoke',{approval_id:target.dataset.id,reason});
      const id=state.plan.plan.id;await reload();await ops('audits.run',{plan_id:id,expected_revision:plans().find(p=>p.id===id).revision});await refresh();
      notice('The revocation and updated source audit are retained.');
    }
    else if(action==='edit-staff'){
      const s=state.staff.find(s=>s.name===target.dataset.name),form=main.querySelector('[data-form=staff]');
      form.elements.name.value=s.name;form.elements.name.readOnly=true;form.elements.role.value=s.role;form.elements.disabled.checked=Boolean(s.disabled);form.elements.password.value='';form.scrollIntoView({block:'center'});
    }
    else if(action==='add-native-binding')target.closest('[data-binding]').querySelector('[data-native-files]').insertAdjacentHTML('beforeend',nativeBindingRow());
    else if(action==='remove-native-binding')target.closest('[data-native-binding]').remove();
  }).catch(()=>{});
});
window.addEventListener('hashchange',()=>{if(window.GovHubPackages?.beforeNavigate()===false)return;route();render().catch(e=>notice(e.message,true));});
setInterval(pollOperation,5000);
(async()=>{try{state.user=(await api('session')).user;if(state.user)await reload();route();await render();}catch(e){notice(e.message,true);if(!state.user)renderLogin();}})();
