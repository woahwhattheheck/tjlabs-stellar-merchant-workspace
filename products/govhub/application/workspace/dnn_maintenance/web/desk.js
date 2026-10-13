'use strict';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=value=>JSON.stringify(value,null,2);
const date=value=>value?new Date(value).toLocaleString():'';
const size=value=>Number(value||0)>=1024*1024?(Number(value)/(1024*1024)).toFixed(1)+' MB':Number(value||0).toLocaleString()+' bytes';
const state={user:null,data:null,view:'overview',selected:{},drafts:{},pending:{},files:new Map(),uploaded:{},busy:false,submitting:false};
const views={overview:'Overview',sites:'Installations',requests:'Service requests',packages:'Packages & sources',releases:'Maintenance releases',native:'Native operations',reports:'Reports & recovery',staff:'Staff'};
function note(message,error=false){
  const box=$('#notice');box.className=message?'notice'+(error?' error':''):'';
  box.replaceChildren(document.createTextNode(message||''));
  if(Object.keys(state.pending).length){
    box.append(document.createTextNode(' '));
    const button=document.createElement('button');button.textContent='Retry original operation';button.className='small';button.dataset.command='retry';box.append(button);
  }
}
function storageKey(){return 'dnn-desk:'+location.origin+':'+(state.data?.workspace?.id||'')+':'+(state.user?.name||'');}
function persist(){if(state.data&&state.user)sessionStorage.setItem(storageKey(),JSON.stringify({view:state.view,selected:state.selected,drafts:state.drafts,pending:state.pending}));}
function restoreSaved(){
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey())||'null');if(saved){Object.assign(state,{view:saved.view in views?saved.view:'overview',selected:saved.selected||{},drafts:saved.drafts||{},pending:saved.pending||{}});}}catch{}
}
async function api(url,body,options={}){
  const request=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
  const response=await fetch(url,{credentials:'same-origin',...request,...options});
  let value;try{value=await response.json();}catch{throw Object.assign(new Error('The response was interrupted. Reopen the original operation to recover it.'),{status:response.status});}
  if(!response.ok)throw Object.assign(new Error(value.error||'The desk could not complete this request.'),{status:response.status,fields:value.fields});
  return value;
}
function inspect(title,value){
  $('#inspect-title').textContent=title;
  $('#inspect-body').innerHTML='<pre>'+esc(typeof value==='string'?value:pretty(value))+'</pre>';
  if(!$('#inspect').open)$('#inspect').showModal();
}
function fileLink(file,label='Download'){
  const href=file?.id?'/api/files/'+encodeURIComponent(file.id):file?.download_url;
  return href&&href.startsWith('/api/')?'<a class="button small" href="'+esc(href)+'">'+esc(label)+'</a>':'';
}
function table(headers,rows,empty='No saved records in this view.'){
  if(!rows.length)return '<div class="empty">'+esc(empty)+'</div>';
  return '<div class="table-scroll"><table><thead><tr>'+headers.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function badge(text){return '<span class="badge">'+esc(text||'prepared')+'</span>';}
function head(title,description,action=''){return '<div class="page-head"><div><h1>'+esc(title)+'</h1><p class="muted">'+esc(description)+'</p></div>'+action+'</div>';}
function button(label,command,attrs='',primary=false){return '<button type="button" data-command="'+command+'" '+attrs+' class="'+(primary?'primary':'')+'">'+esc(label)+'</button>';}
function field(name,label,value='',options={}){
  const attr=(options.required?' required':'')+(options.readonly?' readonly':'')+(options.type==='number'?' step="'+esc(options.step||'1')+'"':'');
  let input;
  if(options.options)input='<select name="'+name+'"'+attr+(options.multiple?' multiple':'')+'>'+options.options.map(x=>{
    const id=Array.isArray(x)?x[0]:x,label=Array.isArray(x)?x[1]:x;
    return '<option value="'+esc(id)+'"'+((options.multiple?Array.isArray(value)&&value.includes(id):String(value??'')===String(id))?' selected':'')+'>'+esc(label)+'</option>';
  }).join('')+'</select>';
  else if(options.textarea)input='<textarea name="'+name+'" rows="'+(options.rows||4)+'"'+attr+(options.json?' class="mono"':'')+'>'+esc(value)+'</textarea>';
  else input='<input name="'+name+'" type="'+(options.type||'text')+'" value="'+esc(value)+'"'+attr+'>';
  return '<label class="field'+(options.full?' full':'')+'"><span>'+esc(label)+'</span>'+input+(options.hint?'<small>'+esc(options.hint)+'</small>':'')+'</label>';
}
function form(id,action,body,label='Save',extra=''){
  return '<form data-form="'+esc(id)+'" data-action="'+action+'">'+body+'<div class="actions form-foot"><button class="primary" type="submit">'+esc(label)+'</button>'+extra+'<span class="draft" data-draft-indicator hidden>Draft kept</span></div></form>';
}
function values(form){
  const result={};
  for(const item of new FormData(form).entries()){
    const field=form.elements.namedItem(item[0]);
    if(field?.multiple)result[item[0]]=[...field.selectedOptions].map(x=>x.value);
    else if(!(item[1] instanceof File))result[item[0]]=item[1];
  }
  $$('input[type=checkbox][data-list]',form).forEach(input=>{const key=input.dataset.list;if(!result[key])result[key]=[];if(input.checked)result[key].push(input.value);});
  return result;
}
function saveDrafts(){
  for(const form of $$('form[data-form]')){
    if(form.dataset.action==='login'||form.dataset.action==='staff')continue;
    if(form.dataset.dirty==='true'){state.drafts[form.dataset.form]=values(form);}
  }
  persist();
}
function applyDrafts(){
  for(const form of $$('form[data-form]')){
    const draft=state.drafts[form.dataset.form];if(!draft)continue;
    for(const [key,value]of Object.entries(draft)){
      $$('[name="'+CSS.escape(key)+'"]',form).forEach(input=>{
        if(input.type==='file'||input.type==='password')return;
        if(input.multiple){[...input.options].forEach(option=>option.selected=value.includes(option.value));}
        else if(input.type==='checkbox'){input.checked=Array.isArray(value)?value.includes(input.value):Boolean(value);}
        else input.value=value;
      });
      $$('input[data-list="'+CSS.escape(key)+'"]',form).forEach(input=>input.checked=Array.isArray(value)&&value.includes(input.value));
    }
    form.dataset.dirty='true';const indicator=$('[data-draft-indicator]',form);if(indicator)indicator.hidden=false;
  }
}
function selected(kind,list,key='id'){
  const item=list.find(x=>x[key]===state.selected[kind]);
  return item||null;
}
const sites=()=>state.data?.sites||[];
const siteName=id=>sites().find(x=>x.site_id===id)?.label||id||'';
const siteOptions=environment=>[['','Select installation'],...sites().filter(x=>!environment||x.environment===environment).map(x=>[x.site_id,x.label+' · '+x.environment])];
function latestInventory(siteId){return [...state.data.inventories].reverse().find(x=>x.site_id===siteId);}
function selectList(kind,list,label,detail,key='id'){
  return '<div class="select-list">'+list.map(x=>'<button type="button" data-command="select" data-kind="'+kind+'" data-id="'+esc(x[key])+'" class="'+(state.selected[kind]===x[key]?'selected':'')+'"><strong>'+esc(label(x))+'</strong><small>'+esc(detail(x))+'</small></button>').join('')+'</div>';
}
function recordTools(kind,item,key){return item?button('Saved history','history','data-kind="'+kind+'" data-id="'+esc(item[key])+'"')+button('Original record','inspect','data-collection="'+kind+'s" data-id="'+esc(item[key])+'"') :'';}
function overview(){
  const d=state.data,open=d.tickets.filter(x=>!['accepted','closed'].includes(x.status)).length;
  return head('Maintenance overview','Keep the actual installation, reviewed release and native recovery history together.')+
  '<div class="metrics">'+[[sites().length,'Installations'],[open,'Open service requests'],[d.releases.length,'Maintenance releases'],[d.jobs.filter(x=>x.result?.status==='complete').length,'Completed native operations']].map(([n,l])=>'<div class="metric"><strong>'+n+'</strong><span>'+esc(l)+'</span></div>').join('')+'</div>'+
  '<div class="card"><h2>Current installations</h2>'+table(['Installation','Environment','Observed DNN','Latest inventory','Open'],sites().map(x=>{const i=latestInventory(x.site_id);return [esc(x.label),badge(x.environment),esc(i?.inventory.platform.database_version||'Inventory required'),esc(date(i?.inventory.observed_at)),button('Open','open-site','data-id="'+esc(x.site_id)+'"')];}),'Add the actual production installation and paired staging site to begin.')+'</div>'+
  '<div class="card"><h2>Release decisions</h2>'+table(['Release','Staging receiving','Production readiness','Open'],d.releases.map(x=>[esc(x.label)+'<small>Revision '+x.revision+'</small>',esc(x.audit.staging_upgrade?'Upgrade received':'Upgrade required')+'<small>'+esc(x.audit.staging_restore?'Restore received':'Restore required')+'</small>',badge(x.audit.production_ready?'Ready for production review':x.audit.ready?'Staging ready':'Inputs required'),button('Open','open-release','data-id="'+esc(x.release_id)+'"')]))+'</div>'+
  '<div class="card"><h2>Working sequence</h2><ol class="status-list"><li>Add the actual production and isolated staging installations; export and receive their native inventory operations.</li><li>Retain the original platform or extension packages, prepare the maintenance release and record its compatibility review.</li><li>Approve staging, receive its native upgrade and paired restore rehearsal, then record the production review and window.</li><li>Receive the production result, resolve the associated requests and export the service report and full workspace.</li></ol></div>';
}
function installationView(){
  const item=selected('site',sites(),'site_id'),v=item||{environment:'production',application_path:'/'};
  const current=item?latestInventory(item.site_id):null;
  const body='<div class="grid">'+field('label','Installation label',v.label,{required:true})+field('environment','Environment',v.environment,{options:['production','staging'],required:true})+
  field('environment_id','Existing environment identifier',v.environment_id,{hint:'Complete the actual host reference before a Windows operation.'})+field('url','Site base URL',v.url,{type:'url',hint:'Retain the actual public or staging URL when known.'})+
  field('iis_site','Exact IIS site name',v.iis_site,{hint:'The receiving technician supplies the actual IIS name before native inventory.'})+field('application_path','IIS application path',v.application_path,{required:true,hint:'Use / for the root application, or its actual virtual application path.'})+
  field('owner','Accountable maintenance owner',v.owner,{required:true})+field('technical_contact','Technical contact',v.technical_contact)+field('external_reference','Client or environment reference',v.external_reference,{full:true})+
  field('notes','Operating notes',v.notes,{textarea:true,full:true})+'</div>';
  return head('Installations','Record the agreed production installation and its paired staging environment.',button('Add installation','new','data-kind="site"'))+
  '<div class="split"><div class="card"><h2>Saved installations</h2>'+selectList('site',sites(),x=>x.label,x=>x.environment+' · '+(x.configured?'Configured':'Receiving setup'),'site_id')+'</div><div>'+
  '<div class="card"><h2>'+esc(item?'Edit installation':'New installation')+'</h2>'+form('site-'+(item?.site_id||'new'),'site.save',body,'Save installation',recordTools('site',item,'site_id'))+'</div>'+
  (item?'<div class="card"><h2>Observed native inventory</h2>'+(current?'<dl class="pair"><dt>Observed</dt><dd>'+esc(date(current.inventory.observed_at))+'</dd><dt>DNN files / database</dt><dd>'+esc(current.inventory.platform.assembly_version+' / '+current.inventory.platform.database_version)+'</dd><dt>Registered packages</dt><dd>'+current.inventory.packages.length+'</dd><dt>Original operation</dt><dd class="mono">'+esc(current.job_id)+'</dd></dl><div class="actions">'+button('Inspect complete inventory','inventory','data-id="'+esc(current.id)+'"')+fileLink(current.return_file,'Download native return')+'</div>':'<p>The installation has no received native inventory yet.</p>')+'<div class="actions">'+button('Prepare inventory operation','new-inventory','data-id="'+esc(item.site_id)+'"')+'</div></div>':'')+
  '</div></div>';
}
function requestView(){
  const d=state.data,item=selected('ticket',d.tickets,'ticket_id'),v=item||{status:'open',priority:'normal',site_id:state.selected.site||''};
  const body='<div class="grid">'+field('site_id','Installation',v.site_id,{options:siteOptions(),required:true})+field('external_reference','Original client ticket or incident reference',v.external_reference)+
  field('title','Request title',v.title,{required:true,full:true})+field('description','Requested work or incident',v.description,{required:true,textarea:true,full:true})+
  field('owner','Assigned owner',v.owner)+field('priority','Priority',v.priority,{options:['normal','urgent','critical']})+
  field('status','Request state',v.status,{options:['open','planned','in_progress','accepted','closed']})+field('incident_started_at','Incident start with timezone',v.incident_started_at,{hint:'Optional actual timestamp, such as 2026-10-12T14:00:00Z.'})+
  field('incident_ended_at','Incident restored with timezone',v.incident_ended_at)+field('resolution','Acceptance or resolution',v.resolution,{textarea:true,full:true,hint:'Record the actual result when accepting or closing the request.'})+'</div>';
  return head('Service requests','Retain the original client reference, assigned work, incident times and accepted result.',button('New request','new','data-kind="ticket"'))+
  '<div class="split"><div class="card"><h2>Request queue</h2>'+selectList('ticket',d.tickets,x=>x.title,x=>siteName(x.site_id)+' · '+x.status,'ticket_id')+'</div><div class="card"><h2>'+esc(item?'Edit saved request':'New service request')+'</h2>'+form('ticket-'+(item?.ticket_id||'new'),'ticket.save',body,'Save request',recordTools('ticket',item,'ticket_id'))+'</div></div>';
}
function uploadField(id,label,accept=''){return '<label class="field"><span>'+esc(label)+'</span><input type="file" name="'+id+'" data-file="'+id+'"'+(accept?' accept="'+accept+'"':'')+' required><small class="file-name" data-file-label="'+id+'"></small></label>';}
function packageView(){
  const d=state.data;
  return head('Packages and sources','Retain the exact original files. Platform and extension manifests are inspected before they enter a release.')+
  '<div class="grid"><div class="card"><h2>Inspect a DNN package</h2>'+form('package-import','package.inspect',uploadField('package_file','Original platform or extension ZIP','.zip')+
  field('publisher_source','Official release or vendor source URL','',{required:true,type:'url'})+field('release_note','License, release notes and compatibility reference','',{textarea:true}),'Retain and inspect package')+'</div>'+
  '<div class="card"><h2>Retain a supporting source</h2>'+form('source-upload','file.upload',uploadField('source_file','Original inventory, runbook, vendor note or monitoring source')+
  field('category','Source category','Evidence',{options:['Evidence','Inventory','Extract']}),'Retain source')+
  '<details><summary>Use an original file already in the private intake directory</summary>'+form('intake-retain','sources.retain',field('path','Relative path below the configured intake directory','',{required:true})+field('source_label','Source label','')+
  field('category','Source category','Evidence',{options:['Evidence','Inventory','Extract']}),'Retain original file')+'</details></div></div>'+
  '<div class="card"><h2>Inspected packages</h2>'+table(['Original package','Version / type','Publisher source','Contents','Download'],d.packages.map(x=>[
    '<strong>'+esc(x.file.filename)+'</strong><small>'+size(x.file.bytes)+'</small>',
    esc(x.package.kind==='platform'?x.package.version+' · '+x.package.package_type:x.package.manifests.map(m=>m.name+' '+m.version).join(', ')),
    '<a href="'+esc(x.publisher_source)+'" target="_blank" rel="noreferrer">'+esc(x.publisher_source)+'</a>',
    button('Inspect manifest','inspect','data-collection="packages" data-id="'+esc(x.id)+'"'),fileLink(x.file)]))+'</div>'+
  '<div class="card"><h2>Retained source files</h2>'+table(['Original filename','Category','Size','Retained','Download'],d.files.map(x=>[esc(x.filename)+'<small class="mono">'+esc(x.sha256)+'</small>',esc(x.category),size(x.bytes),esc(date(x.created_at)),fileLink(x)]))+'</div>';
}
function listCheckboxes(name,items,checked,label,details){
  return '<div class="checkbox-list checks">'+(items.length?items.map(x=>'<label><input type="checkbox" data-list="'+name+'" value="'+esc(x.id)+'"'+(checked.includes(x.id)?' checked':'')+'><span>'+esc(label(x))+(details?'<small>'+esc(details(x))+'</small>':'')+'</span></label>').join(''):'<p class="hint">No retained choices yet.</p>')+'</div>';
}
function inventoryOptions(siteId){return [['','Select received inventory'],...[...state.data.inventories].reverse().filter(x=>!siteId||x.site_id===siteId).map(x=>[x.id,siteName(x.site_id)+' · DNN '+x.inventory.platform.database_version+' · '+date(x.inventory.observed_at)])];}
function releaseView(){
  const d=state.data,item=selected('release',d.releases,'release_id'),v=item||{production_site_id:'',staging_site_id:'',package_ids:[],ticket_ids:[],telerik_decision:'native_required',checks:[{label:'Site homepage',path:'/',status:200,contains:''}]};
  const draft=state.drafts['release-'+(item?.release_id||'new')]||{};
  const production=draft.production_site_id??v.production_site_id,staging=draft.staging_site_id??v.staging_site_id;
  const body='<div class="grid">'+field('label','Release label',v.label,{required:true,full:true})+
  field('production_site_id','Production installation',v.production_site_id,{required:true,options:siteOptions('production')})+field('staging_site_id','Paired staging installation',v.staging_site_id,{required:true,options:siteOptions('staging')})+
  field('production_inventory_id','Production baseline',v.production_inventory_id,{required:true,options:inventoryOptions(production)})+field('staging_inventory_id','Staging baseline',v.staging_inventory_id,{required:true,options:inventoryOptions(staging)})+
  field('target_version','Agreed target DNN version',v.target_version,{required:true,hint:'For extension-only maintenance, retain the current DNN version.'})+field('maintenance_window','Production maintenance window',v.maintenance_window,{required:true,hint:'Date, timezone, approved start/end and interruption.'})+
  '<div class="field full"><span>Exact retained package set</span>'+listCheckboxes('package_ids',d.packages,v.package_ids,x=>x.file.filename,x=>x.package.kind+' · '+size(x.file.bytes))+'</div>'+
  field('compatibility_review','Module, theme, integration and runtime compatibility review',v.compatibility_review,{textarea:true,rows:5,required:true,full:true})+
  field('checks_json','HTTP service checks',pretty(v.checks),{textarea:true,rows:7,json:true,required:true,full:true,hint:'Each row: label, exact site-relative path, expected status, optional literal contains text. Record staff/editor functional acceptance in the review note.'})+
  field('rollback_note','Paired restore and rollback decision',v.rollback_note,{textarea:true,required:true,full:true})+
  field('telerik_decision','Telerik security decision',v.telerik_decision,{options:[['native_required','Use the native security view’s required decision'],['remove','Explicitly reviewed removal offered by DNN']]})+
  '<div class="field full"><span>Associated client requests</span>'+listCheckboxes('ticket_ids',d.tickets.map(x=>({...x,id:x.ticket_id})),v.ticket_ids,x=>x.title,x=>x.external_reference)+'</div>'+
  field('notes','Release notes',v.notes,{textarea:true,full:true})+'</div>';
  const audit=item?.audit;
  const decision=item?'<div class="card"><h2>Current release path</h2>'+
  (audit.problems.length?'<div class="warning"><strong>Complete the release inputs</strong><ul class="status-list">'+audit.problems.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'<p>'+badge('Staging inputs complete')+'</p>')+
  (audit.notices.length?'<ul class="status-list">'+audit.notices.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+
  table(['Installed version','Target','Original package','Native route'],audit.steps.map(x=>[esc(x.from),esc(x.to),esc(x.package_type),esc(x.route)]),'The selected maintenance keeps the current platform version.')+
  '<div class="actions">'+button('Inspect complete release','inspect','data-collection="releases" data-id="'+esc(item.release_id)+'"')+button('Prepare native action','release-native','data-id="'+esc(item.release_id)+'"')+'</div>'+
  '<h3 class="form-foot">Record the actual review</h3>'+form('review-'+item.release_id,'review.save',field('purpose','Operating phase','staging',{options:[['staging','Staging release'],['production','Production release'],['rollback','Production rollback']]})+
  field('note','Review and functional acceptance','',{textarea:true,required:true,hint:'Name the accepted package/version, actual staging and staff/editor outcomes, maintenance decision and recovery owner.'}),'Save reviewed decision')+
  table(['Phase','Reviewer','Recorded','Decision'],audit.reviews.map(x=>[esc(x.purpose),esc(x.author),esc(date(x.created_at)),esc(x.note)]))+'</div>':'';
  return head('Maintenance releases','Review the exact inventory, package set, staged receiving and production decision.',button('New release','new','data-kind="release"'))+
  '<div class="split"><div class="card"><h2>Saved releases</h2>'+selectList('release',d.releases,x=>x.label,x=>'Revision '+x.revision+' · '+x.target_version,'release_id')+'</div><div><div class="card"><h2>'+esc(item?'Edit release revision':'Prepare a maintenance release')+'</h2>'+form('release-'+(item?.release_id||'new'),'release.save',body,'Save release revision',recordTools('release',item,'release_id'))+'</div>'+decision+'</div></div>';
}
function operationView(){
  const d=state.data,item=selected('job',d.jobs),v=state.drafts['job-new']||{action:'inventory',site_id:state.selected.site||'',release_id:state.selected.release||''};
  const release=d.releases.find(x=>x.release_id===v.release_id);
  const backupOptions=[['','Select original paired generation'],...d.jobs.filter(x=>x.result?.native?.backup).map(x=>[x.id,siteName(x.site_id)+' · '+x.action+' · '+date(x.result.finished_at)])];
  const jobBody='<div class="grid">'+field('action','Native action',v.action,{options:[['inventory','Read installation inventory'],['backup','Create paired website and SQL backup'],['upgrade','Execute reviewed maintenance release'],['restore','Restore original paired generation'],['verify','Read version and service checks']]})+
  field('site_id','Receiving installation',v.site_id,{required:true,options:siteOptions()})+
  field('release_id','Reviewed release',v.release_id,{options:[['','Independent inventory / backup / staging restore'],...d.releases.map(x=>[x.release_id,x.label+' · revision '+x.revision])]})+
  field('inventory_id','Actual receiving baseline',v.inventory_id||latestInventory(v.site_id)?.id||'',{options:inventoryOptions(v.site_id)})+
  field('backup_job_id','Original paired backup operation',v.backup_job_id,{options:backupOptions})+
  field('note','Operating instruction or recovery decision',v.note,{textarea:true,full:true,hint:'Required for backup, upgrade, restore and verification. Keep the original native operation when resuming.'})+
  '<details class="full"><summary>Production-to-staging restore bindings</summary>'+field('staging_binding_note','Approved staging environment and data-handling instruction',v.staging_binding_note,{textarea:true})+
  field('staging_bindings_json','Exact original alias map and handling method',v.staging_bindings_json||pretty({portal_aliases:[],data_handling_note:''}),{textarea:true,json:true,rows:7,hint:'Use every PortalAliasID from the source generation and its actual staging host/path. The source generation and receiving database must be distinct.'})+
  field('checks_json','Independent restore / verification HTTP checks',v.checks_json||pretty([{label:'Site homepage',path:'/',status:200,contains:''}]),{textarea:true,json:true,rows:6})+'</details></div>';
  const result=item?.result;
  const selectedHtml=item?'<div class="card"><h2>Original native operation</h2><dl class="pair"><dt>Operation</dt><dd class="mono">'+esc(item.id)+'</dd><dt>Action / installation</dt><dd>'+esc(item.action+' · '+siteName(item.site_id))+'</dd><dt>Original request</dt><dd class="mono">'+esc(item.request_sha256)+'</dd><dt>State</dt><dd>'+badge(result?.status||'prepared')+'</dd></dl>'+
  (result?'<p>'+esc(result.message)+'</p><p class="hint">'+esc(date(result.finished_at))+'</p>':'<p>Export the original request, run its included Windows receiver on the selected host, then return the complete ZIP here.</p>')+
  '<div class="actions">'+button('Export original request','export-job','data-id="'+esc(item.id)+'"',true)+button('Inspect original input','inspect','data-collection="jobs" data-id="'+esc(item.id)+'"')+(result?fileLink(result.return_file,'Download original return'):'')+(item.export?fileLink(item.export.file,'Download native request'):'')+'</div>'+
  (result?.native?.backup?'<details><summary>Paired recovery generation</summary><pre>'+esc(pretty(result.native.backup))+'</pre></details>':'')+
  (result?.native?.checks?table(['Service check','Observed / expected','Result'],result.native.checks.map(x=>[esc(x.label)+'<small>'+esc(x.path)+'</small>',esc(x.observed_status+' / '+x.expected_status),badge(x.passed?'Passed':'Failed')])):'')+
  '<details><summary>Receive this original native return</summary>'+form('receive-'+item.id,'job.receive',uploadField('native_return','Complete returned ZIP','.zip')+'<p class="hint">The receiver checks the original operation, request hash, entire artifact index and native result. Keep the same operation for an interrupted Windows session.</p>','Retain native return')+
  '<details><summary>Use a returned ZIP already retained in sources</summary>'+form('receive-existing-'+item.id,'job.receive-existing',field('file_id','Retained original file','',{required:true,options:[['','Select retained return'],...d.files.filter(x=>x.filename.toLowerCase().endsWith('.zip')).map(x=>[x.id,x.filename+' · '+size(x.bytes)])]}),'Receive selected original')+'</details></details></div>':'';
  return head('Native operations','Prepare, run and reopen the original Windows IIS / SQL / DNN action. Each return stays attached to its request.',button('Prepare another action','new','data-kind="job"'))+
  '<div class="split"><div class="card"><h2>Original operations</h2>'+selectList('job',d.jobs,x=>x.action+' · '+siteName(x.site_id),x=>(x.result?.status||'prepared')+' · '+date(x.created_at))+'</div><div>'+selectedHtml+
  '<div class="card"><h2>Prepare native work</h2>'+form('job-new','job.create',jobBody,'Prepare original operation')+(release?'<p class="hint">Selected release '+esc(release.label)+' · revision '+release.revision+'</p>':'')+'</div></div></div>';
}
function reportView(){
  const d=state.data;
  return head('Service reports and recovery','Export the actual work, source coverage, recorded incidents and complete reopened workspace.')+
  '<div class="grid"><div class="card"><h2>Prepare a monthly service report</h2>'+form('report-new','report.create',field('label','Report label','DNN maintenance service report',{required:true})+
  field('period','Service month',new Date().toISOString().slice(0,7),{required:true,type:'month'})+
  '<div class="field"><span>Installations in the report</span>'+listCheckboxes('site_ids',sites().map(x=>({...x,id:x.site_id})),sites().map(x=>x.site_id),x=>x.label,x=>x.environment)+'</div>'+
  field('summary','Work completed and open decisions','',{textarea:true,required:true})+field('support_handoff','Incident route, owners and following work','',{textarea:true}),'Create service report')+'</div>'+
  '<div class="card"><h2>Retain monitoring coverage</h2>'+form('monitoring-new','monitoring.save',field('site_id','Installation','',{required:true,options:siteOptions()})+
  field('source_file_id','Original monitoring source','',{required:true,options:[['','Choose retained source'],...d.files.map(x=>[x.id,x.filename])]})+
  field('source_kind','Measurement source','provider',{options:[['provider','Provider monitoring report'],['manual','Manually recorded incident interval']]})+
  '<div class="grid">'+field('started_at','Coverage start with timezone','',{required:true})+field('ended_at','Coverage end with timezone','',{required:true})+
  field('monitored_seconds','Actual observed seconds','',{required:true,type:'number',step:'0.001'})+field('unavailable_seconds','Observed unavailable seconds','',{required:true,type:'number',step:'0.001'})+'</div>'+
  field('supersedes_id','Correction of an earlier measurement','',{options:[['','New original measurement'],...(d.monitoring||[]).filter(x=>!(d.monitoring||[]).some(y=>y.supersedes===x.id)).map(x=>[x.id,siteName(x.site_id)+' · '+x.started_at+' · '+x.source_file.filename])]})+
  field('notes','Coverage method and qualifications','',{textarea:true,required:true})+'<p class="hint">Availability is shown only for its explicit provider coverage. Manual incidents stay separately labeled.</p>','Retain coverage')+'</div></div>'+
  '<div class="card"><h2>Saved reports</h2>'+table(['Report','Period','Requests / operations','Download'],d.reports.map(x=>[esc(x.label),esc(x.period),esc(x.request_count+' / '+x.native_operation_count),fileLink(x.file,'Download report ZIP')]))+'</div>'+
  '<div class="card"><h2>Complete source and workspace handover</h2><p>The export carries this desk, its maintained source, the complete original records, source files, native requests, paired backup returns and reports. Reopen the archive using the included restore command.</p>'+
  form('workspace-export','workspace.export',field('label','Handover label','DNN Maintenance Desk complete handover',{required:true}),'Export complete workspace')+
  '<div id="latest-export" class="actions"></div>'+table(['Saved handover','Working revision','Archive'],(d.handoffs||[]).map(x=>[esc(x.label),esc(x.workspace_head),fileLink({download_url:'/api/dnn/download/'+x.id},'Download complete archive')]))+'</div>';
}
async function staffView(){
  const result=await api('/api/staff');state.staff=result.staff;
  if(state.view!=='staff')return;
  $('#main').innerHTML=head('Staff','Use the desk’s existing operator, reviewer and administrator roles.')+
  '<div class="card">'+table(['Account','Role','State'],result.staff.map(x=>[esc(x.name),esc(x.role),badge(x.disabled?'Disabled':'Active')]))+'</div>'+
  '<div class="card"><h2>Add or update a staff account</h2>'+form('staff-new','staff','<div class="grid">'+field('name','Account name','',{required:true})+
  field('role','Role','operator',{options:['operator','reviewer','admin']})+field('password','New password','',{type:'password',hint:'Use 12–1024 characters for a new account.'})+
  field('disabled','Account state','false',{options:[['false','Active'],['true','Disabled']]})+'</div>','Save staff account')+'</div>';
}
function login(){
  $('#navigation').innerHTML='';$('#account').innerHTML='';
  $('#main').innerHTML='<div class="card login"><h1>Open the maintenance desk</h1><p>Sign in to the private workspace.</p>'+form('login','login',field('name','Account name','',{required:true})+field('password','Password','',{required:true,type:'password'}),'Sign in')+'</div>';
}
function render(){
  if(!state.user){login();return;}
  $('#workspace-label').textContent=state.data?.workspace?.name||'Private operations workspace';
  $('#account').innerHTML='<span>'+esc(state.user.name)+' · '+esc(state.user.role)+'</span> '+button('Sign out','logout');
  $('#navigation').innerHTML=Object.entries(views).filter(([key])=>key!=='staff'||state.user.role==='admin').map(([key,label])=>'<button data-view="'+key+'"'+(key===state.view?' aria-current="page"':'')+'>'+esc(label)+'</button>').join('');
  const functions={overview,sites:installationView,requests:requestView,packages:packageView,releases:releaseView,native:operationView,reports:reportView};
  if(state.view==='staff'){staffView().catch(e=>note(e.message,true));return;}
  $('#main').innerHTML=functions[state.view]();applyDrafts();restoreFileLabels();
  $$('button[type=submit]',document).forEach(x=>x.disabled=state.busy);
}
function restoreFileLabels(){for(const [key,file]of state.files){const target=$('[data-file-label="'+CSS.escape(key)+'"]');if(target)target.textContent='Kept selection: '+file.name+' · '+size(file.size);}}
async function refresh(){saveDrafts();state.data=await api('/api/dnn/snapshot');render();}
function parseJson(value,label){try{return JSON.parse(value);}catch{throw new Error('Use complete JSON for '+label+'.');}}
function formPayload(action,form,raw){
  const d=state.data,p={...raw};
  const pick=(kind,collection,key)=>selected(kind,collection,key);
  if(action==='site.save'){const x=pick('site',d.sites,'site_id');if(x)Object.assign(p,{site_id:x.site_id,expected_revision:x.revision});}
  if(action==='ticket.save'){const x=pick('ticket',d.tickets,'ticket_id');if(x)Object.assign(p,{ticket_id:x.ticket_id,expected_revision:x.revision});}
  if(action==='release.save'){
    const x=pick('release',d.releases,'release_id');if(x)Object.assign(p,{release_id:x.release_id,expected_revision:x.revision});
    p.checks=parseJson(p.checks_json,'service checks');delete p.checks_json;p.package_ids=p.package_ids||[];p.ticket_ids=p.ticket_ids||[];
  }
  if(action==='review.save'){
    const x=pick('release',d.releases,'release_id');if(!x)throw new Error('Open the saved release first.');
    Object.assign(p,{release_id:x.release_id,expected_revision:x.revision});
  }
  if(action==='job.create'){
    if(!p.release_id)delete p.release_id;
    if(!p.inventory_id)delete p.inventory_id;
    if(!p.backup_job_id)delete p.backup_job_id;
    if(p.release_id){const x=d.releases.find(x=>x.release_id===p.release_id);p.expected_revision=x.revision;}
    p.staging_bindings=parseJson(p.staging_bindings_json||'{}','staging bindings');delete p.staging_bindings_json;
    p.checks=parseJson(p.checks_json||'[]','independent checks');delete p.checks_json;
  }
  // Keep provider durations as decimal text for the original exact Decimal calculation.
  if(action==='job.receive-existing'){const x=pick('job',d.jobs,'id');p.job_id=x.id;}
  if(action==='staff'){p.disabled=p.disabled==='true';if(!p.password)delete p.password;}
  return p;
}
async function act(action,payload,key='button-'+action){
  if(state.busy)throw new Error('The current operation is still receiving its result.');
  const existing=state.pending[key];
  if(existing&&JSON.stringify(existing.payload)!==JSON.stringify(payload)){
    note('The previous response is still unresolved. Retry its original input before starting this changed operation.',true);
    throw new Error('The original operation input is retained for recovery.');
  }
  const operation=existing||{action,payload,request_key:crypto.randomUUID()};
  state.pending[key]=operation;persist();state.busy=true;
  $$('button[type=submit]').forEach(x=>x.disabled=true);
  try{
    const result=await api('/api/dnn/'+operation.action,{...operation.payload,request_key:operation.request_key});
    delete state.pending[key];delete state.drafts[key];persist();
    await afterResult(action,result);return result;
  }catch(error){
    if(error.status&&error.status<500&&error.status!==429){delete state.pending[key];persist();}
    throw error;
  }finally{state.busy=false;$$('button[type=submit]').forEach(x=>x.disabled=false);}
}
async function upload(key,file,category='Evidence'){
  if(!file)throw new Error('Select the original source file.');
  const signature=JSON.stringify({name:file.name,bytes:file.size,modified:file.lastModified,category});
  if(state.uploaded[key]?.signature===signature)return state.uploaded[key].result;
  const pendingKey='upload-'+key,identity={filename:file.name,bytes:file.size,last_modified:file.lastModified,category};
  let operation=state.pending[pendingKey];
  if(operation&&JSON.stringify(operation.payload)!==JSON.stringify(identity))throw new Error('Reselect the same original file to finish its interrupted upload.');
  if(!operation){operation={action:'file.upload',payload:identity,request_key:crypto.randomUUID()};state.pending[pendingKey]=operation;persist();}
  note('Retaining '+file.name+' · '+size(file.size)+'…');
  try{
    const result=await api('/api/dnn/upload',undefined,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name),'X-Request-Key':operation.request_key,'X-Category':category},body:file});
    delete state.pending[pendingKey];state.uploaded[key]={signature,result};persist();return result;
  }catch(error){if(error.status&&error.status<500&&error.status!==429){delete state.pending[pendingKey];persist();}throw error;}
}
async function afterResult(action,result){
  if(result.site)state.selected.site=result.site.site_id;
  if(result.ticket)state.selected.ticket=result.ticket.ticket_id;
  if(result.release)state.selected.release=result.release.release_id;
  if(result.job){state.selected.job=result.job.id;state.view='native';}
  if(action==='job.export')state.lastExport=result.file;
  if(action==='workspace.export')state.lastWorkspaceExport=result.file;
  state.data=await api('/api/dnn/snapshot');render();persist();
  note('Saved. The original operation and its result are retained.');
  if(action==='job.export'&&result.file)inspectDownload('Original Windows request',result.file);
  if(action==='workspace.export'&&result.file)inspectDownload('Complete workspace handover',result.file);
}
function inspectDownload(title,file){
  $('#inspect-title').textContent=title;$('#inspect-body').innerHTML='<p class="file-name">'+esc(file.filename)+' · '+size(file.bytes)+'</p><p class="mono">'+esc(file.sha256)+'</p>'+fileLink(file,'Download complete archive');
  if(!$('#inspect').open)$('#inspect').showModal();
}
document.addEventListener('input',event=>{
  const form=event.target.closest('form[data-form]');if(!form)return;
  if(form.dataset.action!=='login'&&form.dataset.action!=='staff'){form.dataset.dirty='true';const badge=$('[data-draft-indicator]',form);if(badge)badge.hidden=false;saveDrafts();}
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.matches('input[data-file]')&&input.files[0]){state.files.set(input.dataset.file,input.files[0]);restoreFileLabels();}
  const form=input.closest('form[data-form]');
  if(form&&((form.dataset.action==='release.save'&&['production_site_id','staging_site_id'].includes(input.name))||(form.dataset.action==='job.create'&&['site_id','action','release_id'].includes(input.name)))){
    form.dataset.dirty='true';saveDrafts();render();
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-action]');if(!form)return;event.preventDefault();
  if(state.submitting){note('The original form operation is still running.');return;}state.submitting=true;
  saveDrafts();const action=form.dataset.action,key=form.dataset.form,raw=values(form);
  try{
    if(action==='login'){
      const result=await api('/api/login',raw);state.user=result.user;state.data=await api('/api/dnn/snapshot');restoreSaved();render();note('');return;
    }
    if(action==='staff'){await api('/api/staff',formPayload(action,form,raw));await staffView();note('Staff account saved.');return;}
    if(action==='package.inspect'){
      if(state.pending[key]){await act(state.pending[key].action,state.pending[key].payload,key);state.files.delete('package_file');delete state.uploaded[key];return;}
      const retained=await upload(key,state.files.get('package_file'),'Evidence');
      await act(action,{file_id:retained.id,publisher_source:raw.publisher_source,release_note:raw.release_note},key);
      state.files.delete('package_file');delete state.uploaded[key];return;
    }
    if(action==='file.upload'){
      await upload(key,state.files.get('source_file'),raw.category);delete state.drafts[key];delete state.uploaded[key];state.files.delete('source_file');form.dataset.dirty='false';state.data=await api('/api/dnn/snapshot');render();note('Original source retained.');return;
    }
    if(action==='job.receive'){
      if(state.pending[key]){await act(state.pending[key].action,state.pending[key].payload,key);state.files.delete('native_return');delete state.uploaded[key];return;}
      const job=selected('job',state.data.jobs);if(!job)throw new Error('Open the original native operation.');
      const retained=await upload(key,state.files.get('native_return'),'Evidence');
      await act(action,{job_id:job.id,file_id:retained.id},key);state.files.delete('native_return');delete state.uploaded[key];return;
    }
    const payload=formPayload(action,form,raw);
    await act(action==='job.receive-existing'?'job.receive':action,payload,key);
  }catch(error){note(error.message,true);}finally{state.submitting=false;}
});
document.addEventListener('click',async event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.view){saveDrafts();state.view=target.dataset.view;persist();render();return;}
  const command=target.dataset.command;if(!command)return;
  try{
    saveDrafts();
    if(command==='logout'){await api('/api/logout',{});state.user=null;state.data=null;state.files.clear();state.uploaded={};state.pending={};state.drafts={};render();note('');}
    else if(command==='new'){delete state.selected[target.dataset.kind];persist();render();}
    else if(command==='select'){state.selected[target.dataset.kind]=target.dataset.id;persist();render();}
    else if(command==='open-site'){state.selected.site=target.dataset.id;state.view='sites';persist();render();}
    else if(command==='open-release'){state.selected.release=target.dataset.id;state.view='releases';persist();render();}
    else if(command==='new-inventory'){
      state.selected.site=target.dataset.id;state.view='native';delete state.selected.job;
      state.drafts['job-new']={action:'inventory',site_id:target.dataset.id,note:'Collect the actual selected installation and dependency inventory.'};persist();render();
    }else if(command==='release-native'){
      const release=state.data.releases.find(x=>x.release_id===target.dataset.id);
      state.view='native';delete state.selected.job;
      state.drafts['job-new']={action:'upgrade',site_id:release.staging_site_id,release_id:release.release_id,inventory_id:release.staging_inventory_id,note:'Execute this exact reviewed maintenance release on staging.'};persist();render();
    }else if(command==='inspect'){
      const collection=state.data[target.dataset.collection]||[];
      const item=collection.find(x=>x.id===target.dataset.id||x.site_id===target.dataset.id||x.ticket_id===target.dataset.id||x.release_id===target.dataset.id);
      inspect('Original saved record',item);
    }else if(command==='inventory'){inspect('Complete observed installation inventory',state.data.inventories.find(x=>x.id===target.dataset.id));}
    else if(command==='history'){inspect('Saved '+target.dataset.kind+' revisions',await api('/api/dnn/history/'+encodeURIComponent(target.dataset.id)+'?kind='+target.dataset.kind));}
    else if(command==='export-job'){await act('job.export',{job_id:target.dataset.id},'export-'+target.dataset.id);}
    else if(command==='retry'){
      const entry=Object.entries(state.pending).find(([key])=>!key.startsWith('upload-'));
      if(entry){await act(entry[1].action,entry[1].payload,entry[0]);}
      else note('Reselect the original file in its form and submit it again; its existing upload identity is kept.');
    }
  }catch(error){note(error.message,true);}
});
$('#close-inspect').addEventListener('click',()=>$('#inspect').close());
window.addEventListener('beforeunload',saveDrafts);
(async()=>{
  try{
    const session=await api('/api/session');state.user=session.user;
    if(state.user){state.data=await api('/api/dnn/snapshot');restoreSaved();}
    render();
    if(Object.keys(state.pending).length)note('An original response is still awaiting recovery.');
  }catch(error){login();note(error.message,true);}
})();
