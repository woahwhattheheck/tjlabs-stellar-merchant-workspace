'use strict';
window.GovHubPackages=(()=>{
  const S={epoch:0,hash:'',busy:false,dirty:false,timer:null,pending:null,replacedRequests:[],drafts:new Map(),baselines:new Map(),family:null,preview:null,comparison:null,operation:null,offset:0,assetOffset:0,familyOffset:0,comparisonOffsets:{packages:0,assets:0},allowHash:false};
  const $=(q,root=main)=>root.querySelector(q),$$=(q,root=main)=>[...root.querySelectorAll(q)];
  const copy=value=>JSON.parse(JSON.stringify(value));
  const textValue=value=>typeof value==='string'?value:JSON.stringify(value??null,null,2);
  const canonical=value=>{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);};
  const workspaceId=()=>state.snapshot?.workspace?.id||'';
  const nativeOps=(name,payload={})=>ops('packages.'+name,payload);
  const phref=(view,params={})=>href(view,params);
  const plink=(label,view,params={},cls='')=>'<a class="'+esc(cls)+'" href="'+esc(phref(view,params))+'">'+esc(label)+'</a>';
  const pbutton=(label,action,data={},primary=false)=>'<button type="button" '+(primary?'class="primary" ':'')+'data-package-action="'+esc(action)+'"'+Object.entries(data).map(([k,v])=>' data-'+esc(k)+'="'+esc(v)+'"').join('')+'>'+esc(label)+'</button>';
  const message=(value,error=false)=>{notice(value,error);const node=$('[data-package-message]');if(node){node.textContent=value;node.className='package-message'+(error?' error':'');node.hidden=false;node.setAttribute('role',error?'alert':'status');}};
  const details=(label,value,open=false)=>'<details class="package-details"'+(open?' open':'')+'><summary>'+esc(label)+'</summary><pre>'+esc(textValue(value))+'</pre></details>';
  const meta=rows=>definition(rows);
  const check=(label,name,value=false,help='')=>'<label class="check"><input type="checkbox" name="'+esc(name)+'"'+(value?' checked':'')+'>'+esc(label)+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
  const formHead=(name,body,label,role=false)=>'<form data-package-form="'+esc(name)+'">'+body+'<div data-package-message role="alert" class="package-message" hidden></div><div class="form-footer"><button class="primary"'+(role&&!['reviewer','admin'].includes(state.user?.role)?' disabled data-package-permission="review"':'')+'>'+esc(label)+'</button>'+pbutton('Download open entries','download-draft')+'</div></form>';
  const formJSON=form=>{const result={};for(const field of $$('input,textarea,select',form)){if(!field.name||field.type==='file')continue;if(field.type==='checkbox'){if(field.dataset.multiple){(result[field.name]??=[]);if(field.checked)result[field.name].push(field.value);}else result[field.name]=field.checked;}else if(field.multiple)result[field.name]=[...field.selectedOptions].map(o=>o.value);else result[field.name]=field.value;}return result;};
  const restoreForm=(form,values)=>{for(const field of $$('input,textarea,select',form)){if(!Object.hasOwn(values,field.name)||field.type==='file')continue;const value=values[field.name];if(field.type==='checkbox')field.checked=field.dataset.multiple?Array.isArray(value)&&value.includes(field.value):value===true;else if(field.multiple)for(const option of field.options)option.selected=Array.isArray(value)&&value.includes(option.value);else field.value=typeof value==='string'?value:String(value??'');}};
  const draftKey=(name,hash=S.hash)=>hash+'\n'+name;
  const defaultForm=view=>({'package-family-new':'family','package-family-edit':'family','package-export':'export','package-edition-new':'edition','package-edition':'preview','package-preview':'review','package-operation':'receiving','package-handover':'handover'}[view]||'');
  const savedForms=(hash=S.hash)=>Object.fromEntries([...S.drafts].filter(([key])=>key.startsWith(hash+'\n')).map(([key,value])=>[key.slice(hash.length+1),copy(value)]));
  const hasDraft=(hash=S.hash)=>[...S.drafts.keys()].some(key=>key.startsWith(hash+'\n'));
  function captureForms(){for(const form of $$('form[data-package-form]'))S.drafts.set(draftKey(form.dataset.packageForm),formJSON(form));}
  function installDraft(value){
    const hash=href(value.view,value.params||{}),forms=value.form_values;
    if(forms&&typeof forms==='object'&&!Array.isArray(forms))for(const [name,fields] of Object.entries(forms))if(fields&&typeof fields==='object'&&!Array.isArray(fields))S.drafts.set(draftKey(name,hash),copy(fields));
    const fields=value.draft_values||value.values,name=value.form_name||defaultForm(value.view);
    if(name&&fields&&typeof fields==='object'&&!Array.isArray(fields))S.drafts.set(draftKey(name,hash),copy(fields));
  }
  const watch=form=>{const save=()=>{S.dirty=true;S.drafts.set(draftKey(form.dataset.packageForm),formJSON(form));};form.addEventListener('input',save);form.addEventListener('change',save);const saved=S.drafts.get(draftKey(form.dataset.packageForm));if(saved)restoreForm(form,saved);};
  function download(name,value,mime='application/json'){
    const body=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',url=URL.createObjectURL(new Blob([body],{type:mime})),a=document.createElement('a');
    a.href=url;a.download=name.replace(/[^a-zA-Z0-9_.-]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function fileLink(file,label){
    if(!file)return '—';const id=typeof file==='string'?file:file.id;if(!id)return details(label||'Retained file',file);
    if(file.available===false)return '<span>'+esc(label||file.filename||id)+'</span><small class="package-sub">Referenced source · '+esc(file.sha256||'')+'</small>';
    return '<a href="/api/files/'+enc(id)+'" download="'+esc(typeof file==='object'?file.filename||id:id)+'">'+esc(label||file.filename||id)+'</a>';
  }
  function fileRow(file){return fileLink(file)+'<small class="package-sub">'+esc(size(file.bytes??file.size??0))+' · <code>'+esc(file.sha256||'')+'</code></small>';}
  function locked(value){
    for(const el of $$('input,textarea,select,button')){
      if(value){if(!Object.hasOwn(el.dataset,'packageDisabled'))el.dataset.packageDisabled=el.disabled?'1':'0';el.disabled=true;}
      else if(Object.hasOwn(el.dataset,'packageDisabled')){el.disabled=el.dataset.packageDisabled==='1';delete el.dataset.packageDisabled;}
    }
    main.setAttribute('aria-busy',value?'true':'false');
  }
  function pendingBanner(){
    if(!S.pending)return '';
    const selected=S.pending,refusal=selected.response_failure,canRevise=Boolean(selected.inspected_at&&[400,409,422].includes(refusal?.status));
    return '<section class="callout package-pending"><h2>Selected request needs a response</h2><p>The original operation and request key remain selected while you inspect current source. Recover the same request to reconcile a lost response.</p>'+
      meta([['Operation',esc(selected.operation)],['Request','<code>'+esc(selected.payload.request_key)+'</code>'],['Original view',plink('Open its retained context',selected.view,selected.params)]])+
      (refusal?'<p>'+esc(refusal.status?'Original service response '+refusal.status+': ':'Response unavailable: ')+esc(refusal.message)+'</p>':'')+
      '<div class="actions">'+pbutton('Recover exact request','retry-request',{},true)+pbutton('Download exact request','download-request')+pbutton('Inspect current source','review-latest')+'</div>'+
      (canRevise?'<div class="package-replacement">'+area('Reason for revising this rejected request','package_replacement_reason','',true,'The exact previous request and service refusal remain in the downloadable editor draft.')+pbutton('Retain refusal and edit revised request','replace-rejected')+'</div>':'')+
      details('Original request body',selected.payload)+'</section>';
  }
  function shell(title,description,body,actions=''){
    main.classList.add('package-workspace');main.innerHTML=heading(title,description,actions)+pendingBanner()+'<div data-package-message role="status" class="package-message" hidden></div>'+body;
    for(const form of $$('form[data-package-form]'))watch(form);
    S.dirty=hasDraft();
    if(S.pending)for(const form of $$('form[data-package-form]'))for(const element of $$('input,textarea,select,button',form))element.disabled=true;
    if(S.replacedRequests.length)main.insertAdjacentHTML('beforeend',details('Retained request revisions',S.replacedRequests));
    syncPermissions();
  }
  function syncPermissions(){for(const button of $$('[data-package-permission=review]'))button.disabled=S.busy||Boolean(S.pending)||!['reviewer','admin'].includes(state.user?.role);}
  function fail(error){
    if(error.status===401){state.user=null;renderLogin();return;}
    message(error.message||String(error),true);
    for(const [name,reason] of Object.entries(error.fields||{})){const field=$('[name="'+CSS.escape(name)+'"]');if(!field)continue;field.setAttribute('aria-invalid','true');const note=document.createElement('small');note.className='field-error';note.textContent=reason;field.parentElement.append(note);}
  }
  async function mutate(operation,payload,form=null){
    if(S.busy)return null;
    if(S.pending&&S.pending.operation!==operation)throw Error('Recover the selected original request before starting another operation.');
    if(!S.pending){if(form)S.drafts.set(draftKey(form.dataset.packageForm),formJSON(form));S.pending={schema:'govhub.package-request.v1',workspace_id:workspaceId(),operation,view:state.view,params:copy(state.params),payload:{...copy(payload),request_key:payload.request_key||crypto.randomUUID()},created_at:new Date().toISOString(),baseline:S.baselines.has(S.hash)?copy(S.baselines.get(S.hash)):null,form_name:form?.dataset.packageForm||defaultForm(state.view),draft_values:form?formJSON(form):null,form_values:savedForms()};}
    const selected=S.pending;S.busy=true;state.busy=true;locked(true);let result;
    try{result=await nativeOps(selected.operation,selected.payload);S.pending=null;S.dirty=false;S.drafts.delete(draftKey(selected.form_name||defaultForm(selected.view),href(selected.view,selected.params)));return result;}
    catch(error){if(S.pending){S.pending.response_failure={status:Number.isInteger(error.status)?error.status:null,message:error.message||String(error),fields:copy(error.fields||{}),observed_at:new Date().toISOString()};delete S.pending.inspected_at;delete S.pending.inspected_workspace_head;}fail(error);return null;}
    finally{S.busy=false;state.busy=false;locked(false);syncPermissions();if(S.pending&&state.user&&state.view.startsWith('package')){for(const form of $$('form[data-package-form]'))for(const el of $$('input,textarea,select,button',form))el.disabled=true;const banner=$('.package-pending');if(banner)banner.outerHTML=pendingBanner();else main.insertAdjacentHTML('afterbegin',pendingBanner());}}
  }
  function isCurrent(epoch){return epoch===S.epoch&&state.user&&state.view.startsWith('package');}
  function viewContext(){return{epoch:S.epoch,hash:location.hash,user:state.user,workspace_id:workspaceId()};}
  function sameView(context){return context.epoch===S.epoch&&context.hash===location.hash&&context.user===state.user&&context.workspace_id===workspaceId()&&state.view.startsWith('package');}
  async function read(operation,payload,epoch){const result=await nativeOps(operation,payload);return isCurrent(epoch)?result:null;}
  function suspend(){S.epoch++;clearTimeout(S.timer);S.timer=null;main.classList.remove('package-workspace');}
  function beforeNavigate(){
    if(S.allowHash){S.allowHash=false;return true;}
    if(!state.view.startsWith('package'))return true;
    if(S.busy){notice('Wait for the selected package operation to return.',true);S.allowHash=true;location.hash=S.hash;return false;}
    if(S.dirty&&!confirm('Keep these open entries in this browser and open another view?')){S.allowHash=true;location.hash=S.hash;return false;}
    if(S.dirty)captureForms();S.dirty=false;return true;
  }
  function keepPendingDraft(){
    if(S.pending)return{...copy(S.pending),replacement_history:copy(S.replacedRequests)};
    captureForms();const form=$('form[data-package-form]');return{schema:'govhub.package-draft.v1',workspace_id:workspaceId(),view:state.view,params:copy(state.params),form_name:form?.dataset.packageForm||'',values:form?formJSON(form):{},form_values:savedForms(),baseline:S.baselines.has(S.hash)?copy(S.baselines.get(S.hash)):null,replacement_history:copy(S.replacedRequests),saved_at:new Date().toISOString()};
  }
  async function openDraft(file){
    if(!file)return;if(S.busy||S.pending)throw Error('Recover the current selected request before opening another draft.');
    if(file.size>4*1024*1024)throw Error('Choose a package draft smaller than 4 MiB.');
    const selectedHash=location.hash,selectedWorkspace=workspaceId(),selectedEpoch=S.epoch,value=JSON.parse(await file.text());
    if(location.hash!==selectedHash||workspaceId()!==selectedWorkspace||S.epoch!==selectedEpoch)return;
    if(S.busy||S.pending)throw Error('Finish the selected original operation, then reopen this saved draft.');
    if(value.workspace_id!==workspaceId())throw Error('This package draft belongs to another workspace.');
    if(!['govhub.package-draft.v1','govhub.package-request.v1'].includes(value.schema)||typeof value.view!=='string'||!value.view.startsWith('package'))throw Error('Choose an original package editor draft or request.');
    if(value.schema==='govhub.package-request.v1'){
      const allowed=['families.save','exports.create','editions.create','previews.create','reviews.save','imports.create','receiving.create','comparisons.create','handovers.create'];
      if(!allowed.includes(value.operation)||!value.payload||typeof value.payload.request_key!=='string'||!value.payload.request_key)throw Error('This saved package request has no original operation identity.');
      S.pending=copy(value);delete S.pending.replacement_history;installDraft(value);
    }else installDraft(value);
    if(Array.isArray(value.replacement_history))S.replacedRequests=copy(value.replacement_history);
    if(value.baseline&&value.params?.id===value.baseline.id)S.baselines.set(href(value.view,value.params||{}),copy(value.baseline));
    S.allowHash=location.hash!==href(value.view,value.params||{});await go(value.view,value.params||{});S.dirty=true;
  }
  const draftControls=()=>'<div class="actions">'+pbutton('Open saved draft','open-draft')+'<input type="file" data-package-draft-file accept=".json,application/json" hidden>'+pbutton('Download open entries','download-draft')+'</div>';
  function packageIdentity(row){return row.key||[row.entity_type,row.uuid].filter(Boolean).join(':')||row.identity||row.path||'Unspecified identity';}
  function packageLabel(row){const source=row.source||{};return row.title||source.label||source.title||source.name||source.data?.label||packageIdentity(row);}
  function fieldDiffs(diffs){
    if(!diffs?.length)return empty('The original native preview reports no field differences.');
    return '<ol class="package-native-diffs">'+diffs.map(value=>'<li><pre class="package-value">'+esc(typeof value==='string'?value:textValue(value))+'</pre></li>').join('')+'</ol>';
  }
  function rowsOrDetails(title,rows){
    if(!rows||!rows.length)return '';
    return card(title,'<ul class="package-issues">'+rows.map(row=>'<li>'+esc(typeof row==='string'?row:row.message||row.reason||row.code||textValue(row))+(typeof row==='object'?details('Original item',row):'')+'</li>').join('')+'</ul>');
  }


  const FAMILY_FIELDS=['label','owner','environment_id','source_environment_id','plan_ids','recovery_instruction','notes'];
  function familyValues(row){return Object.fromEntries(FAMILY_FIELDS.map(key=>[key,key==='plan_ids'?[...(row[key]||[])]:String(row[key]||'')]));}
  function prepareFamilyMerge(family){
    if(!family.id)return [];
    const prior=S.baselines.get(S.hash),draft=S.drafts.get(draftKey('family'));if(!prior){S.baselines.set(S.hash,copy(family));return [];}
    if(prior.id!==family.id||prior.revision===family.revision||!draft)return [];
    const base=familyValues(prior),current=familyValues(family),incoming={...base,...copy(draft)},merged={},conflicts=[];
    for(const key of FAMILY_FIELDS){
      if(canonical(current[key])===canonical(base[key])||canonical(current[key])===canonical(incoming[key]))merged[key]=incoming[key];
      else if(canonical(incoming[key])===canonical(base[key]))merged[key]=current[key];
      else{merged[key]=incoming[key];conflicts.push({key,base:base[key],current:current[key],incoming:incoming[key]});}
    }
    S.drafts.set(draftKey('family'),merged);
    if(!conflicts.length)S.baselines.set(S.hash,copy(family));
    return conflicts;
  }
  function familyMergeHTML(conflicts){
    if(!conflicts.length)return '';
    return '<section class="callout"><h2>The family changed while you were editing</h2><p>Unrelated changes are carried forward. Choose the value to retain for each field changed by both editors before saving the current family revision.</p>'+
      table(['Field','Earlier saved value','Current saved value','Your open value','Keep'],conflicts.map(row=>[
        esc(row.key.replaceAll('_',' ')),details('Earlier value',row.base),details('Current value',row.current),details('Your value',row.incoming),
        '<label>Selected value<select data-package-merge="'+esc(row.key)+'" required><option value="">Choose explicitly</option><option value="current">Current saved value</option><option value="incoming">My open value</option></select></label>'
      ]))+'</section>';
  }
  function bindFamilyMerge(conflicts){
    for(const select of $$('[data-package-merge]'))select.addEventListener('change',()=>{
      const row=conflicts.find(item=>item.key===select.dataset.packageMerge);if(!row||!select.value)return;
      restoreForm($('form[data-package-form=family]'),{[row.key]:row[select.value]});S.dirty=true;
      const selected=S.drafts.get(draftKey('family'))||{};selected[row.key]=copy(row[select.value]);S.drafts.set(draftKey('family'),selected);
    });
  }


  function familyLabel(id){return S.families?.find(row=>row.id===id)?.label||S.family?.family?.label||id||'Content package';}
  function envLink(id){return id?link(recordName('environments',id),'record',{kind:'environments',id}):'—';}
  function familyNavigation(family){
    return '<nav class="package-context" aria-label="Package family">'+plink('Family and editions','package-family',{id:family.id})+
      plink('Export original root','package-export',{family_id:family.id})+plink('Retain an archive edition','package-edition-new',{family_id:family.id})+
      plink('Complete handover','package-handover',{family_id:family.id})+plink('Edit family','package-family-edit',{id:family.id})+'</nav>';
  }
  async function familiesView(epoch){
    const result=await read('families.list',{},epoch);if(!result)return;
    S.families=result.families||[];
    shell('Content packages','Export one original entity with its dependency graph, review the exact destination changes and carry the same package through native import and receiving.',
      card('Package families','<div class="package-toolbar">'+input('Find family','families_search','','search').replace('name="families_search"','id="package-families-search"')+'</div><div id="package-families"></div>')+
      card('Complete editorial workflow','<ol class="package-steps"><li><strong>Select original environments.</strong> Retain the package owner, source, destination and recovery instruction.</li><li><strong>Retain the original archive.</strong> Export one root and its actual dependencies, or select a supplied archive.</li><li><strong>Review current native changes.</strong> Inspect types, field differences, publication behavior and exact assets.</li><li><strong>Apply a reviewed edition.</strong> Retain the reviewer decision, native import and original receiving readback.</li></ol>'),
      plink('Create package family','package-family-new',{},'button primary')+draftControls());
    const render=()=>{const q=$('#package-families-search').value.toLowerCase(),rows=S.families.filter(row=>!q||canonical([row.label,row.id,row.owner,row.environment_id,row.source_environment_id]).toLowerCase().includes(q));if(S.familyOffset>=rows.length)S.familyOffset=0;
      $('#package-families').innerHTML=table(['Family','Source and destination','Editions / review','Owner','Updated'],rows.slice(S.familyOffset,S.familyOffset+40).map(row=>[
        plink(row.label,'package-family',{id:row.id})+'<small class="package-sub"><code>'+esc(row.id)+'</code></small>',
        envLink(row.source_environment_id)+'<small class="package-sub">Destination: '+envLink(row.environment_id)+'</small>',
        esc(row.edition_count??0)+'<small class="package-sub">'+(row.latest_review?badge(row.latest_review.decision):'No retained decision')+'</small>',
        esc(row.owner||'Unassigned'),esc(date(row.updated_at||row.created_at))
      ]))+'<div class="package-pager"><span>'+(rows.length?S.familyOffset+1:0)+'–'+Math.min(rows.length,S.familyOffset+40)+' of '+rows.length+' families</span><div class="actions"><button type="button" id="package-families-prev"'+(!S.familyOffset?' disabled':'')+'>Previous</button><button type="button" id="package-families-next"'+(S.familyOffset+40>=rows.length?' disabled':'')+'>Next</button></div></div>';$('#package-families-prev').onclick=()=>{S.familyOffset=Math.max(0,S.familyOffset-40);render();};$('#package-families-next').onclick=()=>{S.familyOffset+=40;render();};};$('#package-families-search').oninput=()=>{S.familyOffset=0;render();};render();
  }
  async function familyView(epoch){
    const result=await read('families.get',{family_id:state.params.id},epoch);if(!result)return;S.family=result;
    const f=result.family,editions=result.editions||[],operations=result.operations||[],reviews=result.reviews||[],comparisons=result.comparisons||[];
    shell(f.label,'Original package editions and their native review, import and receiving history.',familyNavigation(f)+
      card('Operating responsibility',meta([['Family ID','<code>'+esc(f.id)+'</code>'],['Owner',esc(f.owner)],['Source environment',envLink(f.source_environment_id)],
        ['Destination environment',envLink(f.environment_id)],['Revision','<code>'+esc(f.revision)+'</code>'],['Recovery instruction',esc(f.recovery_instruction||'')]])+
        (f.notes?'<p class="package-preserve">'+esc(f.notes)+'</p>':'')+
        details('Selected recovery and cutover plans',(f.plan_ids||[]).map(id=>({id,name:planName(id)}))))+
      card('Original archive editions',table(['Edition','Original archive','Source context','Retained'],editions.map(e=>[
        plink(e.label||e.id,'package-edition',{id:e.id,family_id:f.id})+(e.previous_edition_id?'<small class="package-sub">Previous: '+esc(e.previous_edition_id)+'</small>':''),
        '<code>'+esc(e.archive_sha256||'')+'</code>'+ (e.file?'<small class="package-sub">'+fileLink(e.file)+'</small>':''),
        details('Original source provenance',e.provenance||{}),esc(date(e.created_at))
      ])))+
      card('Native package operations',table(['Operation','Edition','State','Updated','Owner'],operations.map(o=>[
        plink(o.type||o.native_action||o.id,'package-operation',{id:o.id,family_id:f.id}),
        esc(o.edition_id||o.package_edition_id||'—'),badge(o.state),esc(date(o.updated_at||o.created_at)),esc(o.author||o.actor||'')
      ])))+
      card('Retained reviewer decisions',table(['Decision','Original preview','Reviewer','Reason','Time'],reviews.map(r=>[
        badge(r.decision),plink(short(r.preview_sha256||r.preview_file_sha256),'package-preview',{id:r.preview_operation_id,family_id:f.id}),
        esc(r.author||r.reviewer||''),'<span class="package-preserve">'+esc(r.reason)+'</span>',esc(date(r.created_at))
      ])))+
      card('Edition comparisons',table(['Comparison','Earlier edition','Candidate edition','Time'],comparisons.map(c=>[
        plink(short(c.id),'package-comparison',{id:c.id,family_id:f.id}),esc(c.baseline_edition_id),esc(c.candidate_edition_id),esc(date(c.created_at))
      ]))),draftControls());
  }
  async function familyFormView(epoch){
    let result=null;if(state.params.id){result=await read('families.get',{family_id:state.params.id},epoch);if(!result)return;}
    const f=result?.family||{};S.family=result;
    const conflicts=prepareFamilyMerge(f);
    const envs=[['','Choose an environment'],...records('environments').map(e=>[e.id,e.data.name])];
    const body='<div class="form-grid">'+input('Family label','label',f.label||'','text',true)+input('Responsible owner','owner',f.owner||'','text',true)+
      select('Destination environment','environment_id',envs,f.environment_id||'')+select('Original source environment','source_environment_id',[['','Use a supplied original archive'],...envs.slice(1)],f.source_environment_id||'')+
      '<div class="full">'+area('Recovery instruction','recovery_instruction',f.recovery_instruction||'',true,'Identify the original backup or recovery plan and the operator responsible for restoration.')+'</div>'+
      '<div class="full">'+checks('Related original cutover and recovery plans','plan_ids',plans().map(p=>[p.id,p.name]),f.plan_ids||[]).replaceAll('type="checkbox"','type="checkbox" data-multiple="true"')+'</div>'+
      '<div class="full">'+area('Source and editorial notes','notes',f.notes||'')+'</div></div>'+
      (f.id?meta([['Original family revision','<code>'+esc(f.revision)+'</code>']]):'');
    shell(f.id?'Edit package family':'Create package family','The original destination and recovery context remain attached to every retained package operation.',
      card('Family and native environment',formHead('family',familyMergeHTML(conflicts)+body,'Save original family')),draftControls());
    bindFamilyMerge(conflicts);
  }
  async function exportView(epoch){
    const result=await read('families.get',{family_id:state.params.family_id},epoch);if(!result)return;S.family=result;const f=result.family;
    shell('Export an original content root','The native Content Packages module exports one selected entity and the exact dependency graph and assets it reaches.',familyNavigation(f)+
      card('Original native export',formHead('export','<div class="form-grid">'+input('Original entity type','entity_type','node','text',true,'Use the native Drupal entity type for the selected root.')+
      input('Original root UUID','uuid','','text',true,'Select exactly one existing source entity. Its references are captured by the original module.')+
      input('Maximum dependency depth','max_depth','20','number',true)+input('Package type','package_type','content_entity','text',true)+
      '<div class="full">'+check('Create destination-owned draft packages','unpublished',true,'The native unpublished export option creates new packages as drafts and preserves existing destination publication. Clear it only when reviewing the original source publication mode deliberately.')+'</div>'+
      '<div class="full">'+area('Export purpose and original source reference','reason','',true)+'</div></div>','Queue original native export'))+
      card('Selected source and destination',meta([['Original source',envLink(f.source_environment_id)],['Destination',envLink(f.environment_id)],['Recovery',esc(f.recovery_instruction)]])),
      draftControls());
    $('input[name=package_type]').readOnly=true;
    if(!f.source_environment_id){message('Select an original source environment in this family before queuing a native export. Supplied archives can be retained directly as an edition.',true);$('form[data-package-form=export] button[type=submit],form[data-package-form=export] button:not([type])')?.setAttribute('disabled','');}
  }
  async function editionNewView(epoch){
    const result=await read('families.get',{family_id:state.params.family_id},epoch);if(!result)return;S.family=result;const f=result.family;
    const exports=(result.operations||[]).filter(o=>o.type==='PACKAGE_EXPORT'&&o.state==='COMPLETE'),editions=result.editions||[];
    const body='<div class="form-grid">'+input('Edition label','label','','text',true)+
      select('Original archive source','source_kind',[['export','Completed native export'],['file','Retained supplied archive']],state.params.export_operation_id?'export':'file')+
      '<div data-package-edition-export>'+select('Completed export operation','export_operation_id',[['','Choose original native export'],...exports.map(o=>[o.id,o.id+' · '+date(o.updated_at||o.created_at)])],state.params.export_operation_id||'')+'</div>'+
      '<div data-package-edition-file>'+select('Retained original archive','file_id',fileOptions('Choose original package archive'),state.params.file_id||'')+
      '<small>'+link('Retain another original archive','sources')+'</small></div>'+
      select('Previous corrected edition','previous_edition_id',[['',editions.length?'Latest retained edition (automatic)':'First edition'],...editions.map(e=>[e.id,e.label||e.id])],state.params.previous_edition_id||'')+
      '<div class="full" data-package-source-reference>'+area('Original source reference','source_reference','',true,'Identify the author and source of this supplied archive edition.')+'</div>'+
      '<div class="full">'+area('Editorial correction notes','notes','')+'</div></div>';
    shell('Retain an original package edition','Bind this family to the completed native export or exact uploaded archive bytes. A correction retains its preceding edition.',familyNavigation(f)+
      card('Archive and source identity',formHead('edition',body,'Retain original edition')),draftControls());
    const form=$('form[data-package-form=edition]'),sync=()=>{const exported=form.elements.source_kind.value==='export';$('[data-package-edition-export]').hidden=!exported;$('[data-package-edition-file]').hidden=exported;form.elements.export_operation_id.disabled=!exported;form.elements.export_operation_id.required=exported;form.elements.file_id.disabled=exported;form.elements.file_id.required=!exported;form.elements.source_reference.required=!exported;form.elements.source_reference.disabled=exported;$('[data-package-source-reference]').hidden=exported;};form.elements.source_kind.onchange=sync;sync();
  }
  async function editionView(epoch){
    const result=await read('editions.get',{edition_id:state.params.id},epoch);if(!result)return;S.edition=result;
    const e=result.edition,family=await read('families.get',{family_id:e.family_id},epoch);if(!family)return;S.family=family;const f=family.family;
    const file=result.file||e.file||(state.snapshot.files||[]).find(row=>row.id===e.file_id);
    shell(e.label||'Original package edition','The exact archive and source reference remain immutable across preview, review and native import.',familyNavigation(f)+
      card('Retained original edition',meta([['Edition','<code>'+esc(e.id)+'</code>'],['Original archive',file?fileRow(file):'<code>'+esc(e.archive_sha256||'')+'</code>'],
        ['Source provenance',details('Original source provenance',e.provenance||{},true)],['Previous edition',e.previous_edition_id?plink(e.previous_edition_id,'package-edition',{id:e.previous_edition_id,family_id:f.id}):'—'],
        ['Archive bytes',esc(e.archive_bytes)],['Retained',esc(date(e.created_at))]])+details('Complete original edition',e))+
      card('Preview current destination',formHead('preview',area('Reason for the native destination read','reason','',true,'The original module will compare the selected archive with the current destination before review.'),'Queue exact native preview')),
      plink('Retain a corrected edition','package-edition-new',{family_id:f.id,previous_edition_id:e.id},'button')+draftControls());
  }


  function previewSummary(value){
    const p=value.preview||{},packages=p.packages||[],assets=p.assets||[],types=new Map();
    for(const row of packages){const key=[row.entity_type,row.bundle].filter(Boolean).join(' / ');types.set(key,(types.get(key)||0)+1);}
    return card('Exact destination preview',meta([
      ['Preview source',fileRow(value.preview_file)],
      ['Archive SHA-256','<code>'+esc(p.archive_sha256||'')+'</code>'],
      ['Destination SHA-256','<code>'+esc(p.target_sha256||'')+'</code>'],
      ['Prior destination SHA-256','<code>'+esc(p.before_sha256||'')+'</code>'],
      ['Native packages',esc(packages.length)],['Original assets',esc(assets.length)],
      ['Content types',table(['Native entity type / bundle','Packages'],[...types].map(([key,count])=>[esc(key),esc(count)]))]
    ]))+rowsOrDetails('Native preview issues',p.issues)+rowsOrDetails('Native preview warnings',p.warnings)+
      rowsOrDetails('References omitted by the original export',p.omitted_references)+rowsOrDetails('Omitted references absent from the destination',p.missing_omitted_references);
  }
  function renderPackageRows(p){
    const rows=p.packages||[],root=$('#package-records'),type=$('#package-type-filter').value,query=$('#package-search').value.toLowerCase();
    const selected=rows.filter(row=>(!type||[row.entity_type,row.bundle].filter(Boolean).join(' / ')===type)&&(!query||canonical([packageIdentity(row),packageLabel(row),row.native_action,row.source]).toLowerCase().includes(query)));
    if(S.offset>=selected.length)S.offset=0;
    root.innerHTML=table(['Package identity','Native destination action','Publication','Original content and field changes'],selected.slice(S.offset,S.offset+40).map(row=>[
      '<strong>'+esc(packageLabel(row))+'</strong><small class="package-sub">'+esc(row.entity_type)+' / '+esc(row.bundle||'')+'</small><code>'+esc(row.uuid||row.key||'')+'</code><small class="package-sub">'+esc(row.path||'')+'</small>',
      esc(typeof row.native_action==='string'?row.native_action:textValue(row.native_action||'Supplied by native preview'))+details('Current destination identity',row.before||{}),
      details('Original publication behavior',row.publication||{},true),
      '<details class="package-record-detail"><summary>Review this package</summary>'+fieldDiffs(row.diffs)+details('Original source fields',row.source?.front_matter||{})+details('Original source body',row.source?.body??row.source?.text??'')+details('Original incoming document',row.source)+details('Native destination before this import',row.before)+details('Original components',row.components||[])+details('Original translations',row.translations||[])+details('Original references',row.references||[])+details('Referenced assets',row.assets||[])+'</details>'
    ]))+'<div class="package-pager"><span>'+(selected.length?S.offset+1:0)+'–'+Math.min(selected.length,S.offset+40)+' of '+selected.length+' packages</span><div class="actions">'+
      '<button type="button" data-package-action="package-prev"'+(!S.offset?' disabled':'')+'>Previous</button><button type="button" data-package-action="package-next"'+(S.offset+40>=selected.length?' disabled':'')+'>Next</button></div></div>';
  }
  function renderAssets(p){
    const rows=p.assets||[],query=$('#package-asset-search').value.toLowerCase(),selected=rows.filter(row=>!query||canonical([row.path,row.sha256,row.file?.filename]).toLowerCase().includes(query));
    if(S.assetOffset>=selected.length)S.assetOffset=0;const target=$('#package-assets');target.innerHTML=table(['Original asset','Bytes and identity','Retained original'],selected.slice(S.assetOffset,S.assetOffset+40).map(row=>{
      const file=row.file,filename=file?.filename||row.path||'',image=Boolean(file?.id&&file.available!==false&&/\.(png|jpe?g|gif|webp|avif)$/i.test(filename));
      return['<code>'+esc(row.path||'')+'</code>',esc(size(row.bytes??0))+'<small class="package-sub"><code>'+esc(row.sha256||'')+'</code></small>',
        (image?'<a href="/api/files/'+enc(file.id)+'" target="_blank" rel="noopener"><img class="package-asset" loading="lazy" src="/api/files/'+enc(file.id)+'" alt="'+esc(filename)+'"></a>':'')+(file?fileLink(file,'Open original asset'):details('Native retained asset',row))];
    }))+'<div class="package-pager"><span>'+(selected.length?S.assetOffset+1:0)+'–'+Math.min(selected.length,S.assetOffset+40)+' of '+selected.length+' assets</span><div class="actions"><button type="button" data-package-action="asset-prev"'+(!S.assetOffset?' disabled':'')+'>Previous</button><button type="button" data-package-action="asset-next"'+(S.assetOffset+40>=selected.length?' disabled':'')+'>Next</button></div></div>';
  }
  function previewBody(value,family){
    const p=value.preview||{},packages=p.packages||[],types=[...new Set(packages.map(row=>[row.entity_type,row.bundle].filter(Boolean).join(' / ')))].sort();
    return previewSummary(value)+
      card('Package and content-type review','<div class="package-toolbar">'+input('Find package','package_search','','search',false,'Search native type, UUID, label or source content.').replace('name="package_search"','id="package-search" name="package_search"')+
      select('Native content type','package_type',[['','All content types'],...types.map(type=>[type,type])]).replace('name="package_type"','id="package-type-filter" name="package_type"')+'</div><div id="package-records"></div>')+
      card('Exact original assets',input('Find asset path','asset_search','','search').replace('name="asset_search"','id="package-asset-search" name="asset_search"')+'<div id="package-assets"></div>')+
      card('Review the native import behavior','<p>The preview retains the source publication mode and current destination identity for every package. An item excluded from a later archive remains in the destination. Correction work produces a new source edition and a new exact preview.</p>'+
      details('Native manifest',p.manifest||value.native?.manifest||{})+details('Exact destination observation',p.target||{})+details('Complete native result',value.native||{}));
  }
  function bindPreviewRows(){
    S.offset=0;S.assetOffset=0;renderPackageRows(S.preview.preview);renderAssets(S.preview.preview);
    $('#package-search').oninput=()=>{S.offset=0;renderPackageRows(S.preview.preview);};
    $('#package-type-filter').onchange=()=>{S.offset=0;renderPackageRows(S.preview.preview);};
    $('#package-asset-search').oninput=()=>{S.assetOffset=0;renderAssets(S.preview.preview);};
  }
  function comparisonBody(result){
    const c=result.comparison||result;
    return card('Compared original previews',meta([
      ['Earlier edition',esc(c.baseline_edition_id)],['Candidate edition',esc(c.candidate_edition_id)],
      ['Earlier preview','<code>'+esc(c.baseline_preview_sha256)+'</code>'],['Candidate preview','<code>'+esc(c.candidate_preview_sha256)+'</code>'],
      ['Original comparison ID','<code>'+esc(c.id)+'</code>']
    ]))+card('Source edition changes',details('Exact native counts',c.counts||{},true)+
      '<div class="package-toolbar">'+input('Find native identity','comparison_query','','search').replace('name="comparison_query"','id="package-comparison-query"')+
      select('Original edition change','comparison_change',[['','All changes'],['ADDED','Added'],['CHANGED','Changed'],['UNCHANGED','Unchanged'],['EXCLUDED','Excluded; destination retained']]).replace('name="comparison_change"','id="package-comparison-change"')+'</div><div id="package-comparison-packages"></div>')+
      card('Original asset changes','<div id="package-comparison-assets"></div>')+
      card('Excluded source behavior','<p>'+esc(c.exclusion_behavior||'Packages excluded from the archive remain in the destination.')+'</p>');
  }
  function renderComparisonRows(){
    const query=$('#package-comparison-query').value.toLowerCase(),change=$('#package-comparison-change').value;
    for(const kind of ['packages','assets']){
      const selected=(S.comparison[kind]||[]).filter(row=>(!change||row.change===change)&&(!query||canonical([row.identity,row.path,row.baseline?.path,row.candidate?.path,packageIdentity(row.candidate||row.baseline||{})]).toLowerCase().includes(query)));
      if(S.comparisonOffsets[kind]>=selected.length)S.comparisonOffsets[kind]=0;const offset=S.comparisonOffsets[kind];
      const root=$('#package-comparison-'+kind);
      root.innerHTML=table(kind==='assets'?['Asset path','Edition change','Earlier original','Candidate original']:['Native identity','Edition change','Earlier package','Candidate package'],
        selected.slice(offset,offset+40).map(row=>[esc(textValue(row.identity||row.path||packageIdentity(row.candidate||row.baseline||{}))),badge(row.change),details('Earlier original',row.baseline||null),details('Candidate original',row.candidate||null)]))+
        '<div class="package-pager"><span>'+(selected.length?offset+1:0)+'–'+Math.min(selected.length,offset+40)+' of '+selected.length+' '+kind+'</span><div class="actions"><button type="button" data-comparison-page="prev"'+(!offset?' disabled':'')+'>Previous</button><button type="button" data-comparison-page="next"'+(offset+40>=selected.length?' disabled':'')+'>Next</button></div></div>';
      for(const button of $$('[data-comparison-page]',root))button.onclick=()=>{S.comparisonOffsets[kind]=Math.max(0,offset+(button.dataset.comparisonPage==='next'?40:-40));renderComparisonRows();};
    }
  }


  async function previewView(epoch){
    const value=await read('previews.get',{preview_operation_id:state.params.id},epoch);if(!value)return;
    if(!value.preview){await operationView(epoch);return;}S.preview=value;
    const familyId=state.params.family_id||value.operation?.family_id||value.operation?.package_family_id;
    const family=await read('families.get',{family_id:familyId},epoch);if(!family)return;S.family=family;
    const f=family.family,p=value.preview,operation=value.operation,allReviews=(family.reviews||[]).filter(r=>r.preview_operation_id===operation.id);
    const currentReview=allReviews.at(-1)||null;S.review=currentReview;
    const comparisons=(family.comparisons||[]).filter(c=>c.candidate_preview_operation_id===operation.id);
    const otherPreviews=(family.operations||[]).filter(o=>o.type==='PACKAGE_PREVIEW'&&o.state==='COMPLETE'&&o.id!==operation.id);
    const exactHash=value.preview_file?.sha256;
    const reviewForm=formHead('review',
      meta([['Exact original preview','<code>'+esc(exactHash||'')+'</code>'],['Previous decision',currentReview?badge(currentReview.decision)+' · '+esc(currentReview.reason):'No retained reviewer decision']])+
      select('Reviewer disposition','decision',[['','Choose a disposition'],['APPROVE','Approve this exact native import'],['RETURN','Return this edition for source correction']])+
      select('Original edition comparison','comparison_id',[['','No comparison selected'],...comparisons.map(c=>[c.id,c.baseline_edition_id+' → '+c.candidate_edition_id])],state.params.comparison_id||'')+
      area('Accountable editorial reason','reason','',true,'Record the actual content, type, reference, asset and publication review for these exact preview bytes.'),
      'Retain original reviewer decision',true);
    const applyBody=currentReview?.decision==='APPROVE'?
      formHead('import',meta([['Selected approval','<code>'+esc(currentReview.id)+'</code>'],['Reviewer',esc(currentReview.author||currentReview.reviewer)],['Reason',esc(currentReview.reason)]])+
        area('Native import instruction','reason','',true,'The original worker rechecks the selected archive, review and destination before mutation.'),'Queue the reviewed native import'):
      '<p>Retain an approval for this exact native preview to prepare its import. A returned edition stays available with its original correction reason.</p>'+
      (currentReview?.decision==='RETURN'?plink('Retain a corrected source edition','package-edition-new',{family_id:f.id,previous_edition_id:operation.edition_id||operation.package_edition_id},'button'):'');
    shell('Review native package changes','Inspect the original package graph, current destination fields and publication behavior before retaining the final editorial decision.',familyNavigation(f)+
      previewBody(value,f)+'<div class="grid">'+card('Final editorial decision',reviewForm)+card('Import the reviewed edition',applyBody)+'</div>'+
      card('Compare another original preview',formHead('comparison',
        select('Earlier retained native preview','baseline_preview_operation_id',[['','Choose earlier preview'],...otherPreviews.map(o=>[o.id,(o.edition_id||o.package_edition_id||short(o.id))+' · '+date(o.created_at||o.updated_at)])])+
        '<p>The comparison uses the two exact native preview files. Excluded packages remain in the destination.</p>','Retain exact edition comparison'))+
      card('Reviewer history',table(['Decision','Reviewer','Reason','Time','Original ID'],allReviews.map(r=>[badge(r.decision),esc(r.author||r.reviewer),'<span class="package-preserve">'+esc(r.reason)+'</span>',esc(date(r.created_at)),'<code>'+esc(r.id)+'</code>']))),
      pbutton('Download original preview','download-preview')+plink('Open native operation','package-operation',{id:operation.id,family_id:f.id},'button')+draftControls());
    bindPreviewRows();
    if(!exactHash){for(const el of $$('form[data-package-form=review] button,form[data-package-form=import] button'))el.disabled=true;message('Refresh the original operation to obtain its retained preview file before review.',true);}
  }
  async function comparisonView(epoch){
    const result=await read('comparisons.get',{comparison_id:state.params.id},epoch);if(!result)return;S.comparison=result.comparison||result;
    const c=S.comparison,family=await read('families.get',{family_id:c.family_id},epoch);if(!family)return;S.family=family;
    shell('Compare original package editions','Review the exact source and asset changes between two retained native destination previews.',familyNavigation(family.family)+comparisonBody(result),
      plink('Review candidate preview','package-preview',{id:c.candidate_preview_operation_id,family_id:c.family_id,comparison_id:c.id},'button primary')+
      pbutton('Download original comparison','download-comparison'));
    S.comparisonOffsets={packages:0,assets:0};renderComparisonRows();for(const input of [$('#package-comparison-query'),$('#package-comparison-change')])input.addEventListener('input',()=>{S.comparisonOffsets={packages:0,assets:0};renderComparisonRows();});
  }
  function packageOperationBody(result){
    const o=result.operation;
    const entries=[['Operation','<code>'+esc(o.id)+'</code>'],['Type',esc(o.type)],['Current revision','<code>'+esc(o.revision)+'</code>'],
      ['Original edition',esc(o.edition_id||o.package_edition_id||'')],['Destination',envLink(o.environment_id)],['Native action',esc(o.native_action||'')],
      ['Started',esc(date(o.actual_started_at||o.started_at||o.created_at))],['Updated',esc(date(o.updated_at))]];
    let continuation='';
    if(o.state==='COMPLETE'){
      if(o.type==='PACKAGE_EXPORT')continuation=plink('Retain this exact archive edition','package-edition-new',{family_id:state.params.family_id||o.family_id||o.package_family_id,export_operation_id:o.id},'button primary');
      if(o.type==='PACKAGE_PREVIEW')continuation=plink('Review native content and assets','package-preview',{id:o.id,family_id:state.params.family_id||o.family_id||o.package_family_id},'button primary');
      
    }
    if(o.type==='PACKAGE_IMPORT')continuation=formHead('receiving',area('Receiving readback instruction','reason','',true,'Read this original import receipt and the current destination. The native result identifies whether that same import has committed; this read does not start another import.'),'Queue original receiving readback');
    return '<div class="grid wide"><div>'+card('Original native progress','<div id="package-operation-status">'+operationStatus(result)+'</div>')+
      card('Retained original files','<div id="package-operation-files">'+(result.files?.length?retainedDownloads(result.files,'operations',o.id):empty('The original worker will retain the native files here.'))+'</div>')+
      card('Original event sequence','<div id="package-operation-events">'+operationEvents(result)+'</div>')+'</div><div>'+
      card('Pinned operation',meta(entries))+card('Continue the same native work','<div id="package-operation-continuation">'+continuation+'</div><div class="actions">'+
        link('Open original worker controls','operation',{id:o.id})+link('Open destination tools','native',{id:o.environment_id})+'</div>')+
      details('Complete original operation',o)+'</div></div>';
  }
  async function operationView(epoch){
    const result=await read('operations.get',{operation_id:state.params.id},epoch);if(!result)return;S.operation=result;
    const o=result.operation,familyId=state.params.family_id||o.family_id||o.package_family_id;
    let family=null;if(familyId){family=await read('families.get',{family_id:familyId},epoch);if(!family)return;S.family=family;}
    shell('Native package operation','Keep the same original worker, archive, target and checkpoints through completion and receiving.',
      (family?familyNavigation(family.family):'')+packageOperationBody(result),pbutton('Refresh original operation','refresh')+draftControls());
    scheduleOperation(epoch);
  }
  function scheduleOperation(epoch){
    clearTimeout(S.timer);const o=S.operation?.operation;
    if(!o||!['QUEUED','RUNNING','WAITING_NATIVE'].includes(o.state)||!isCurrent(epoch)||state.view!=='package-operation')return;
    S.timer=setTimeout(async()=>{
      if(S.busy||S.dirty){scheduleOperation(epoch);return;}
      try{
        const latest=await read('operations.get',{operation_id:o.id},epoch);if(!latest)return;
        const changed=latest.operation.state!==S.operation.operation.state;S.operation=latest;
        if($('#package-operation-status'))$('#package-operation-status').innerHTML=operationStatus(latest);
        if($('#package-operation-events'))$('#package-operation-events').innerHTML=operationEvents(latest);
        if($('#package-operation-files'))$('#package-operation-files').innerHTML=latest.files?.length?retainedDownloads(latest.files,'operations',o.id):empty('Original native files are retained as the worker progresses.');
        if(changed){await render();return;}scheduleOperation(epoch);
      }catch(error){if(isCurrent(epoch)){fail(error);scheduleOperation(epoch);}}
    },3000);
  }
  async function handoverView(epoch){
    const result=await read('families.list',{},epoch);if(!result)return;S.families=result.families||[];
    const chosen=state.params.family_id?[state.params.family_id]:[];
    const body=input('Handover name','name','','text',true)+
      checks('Included package families','package_family_ids',S.families.map(f=>[f.id,f.label]),chosen).replaceAll('type="checkbox"','type="checkbox" data-multiple="true"')+
      checks('Original cutover and recovery plans','plan_ids',plans().map(p=>[p.id,p.name]),[]).replaceAll('type="checkbox"','type="checkbox" data-multiple="true"')+
      check('Include original source bytes','include_sources',true)+
      '<p class="muted">The original handover retains the selected package families, archive editions, native previews, exact reviewer decisions, imports and receiving results.</p>';
    shell('Complete package handover','Create a retained customer handover from the same package and native operating history.',
      card('Selected original scope',formHead('handover',body,'Create complete package handover'))+
      card('Private recovery and existing deliveries','<div class="actions">'+link('Open original handovers','handover')+link('Back up this complete workspace','settings')+'</div>'),draftControls());
  }


  function requireText(value,label){if(typeof value!=='string'||!value.trim())throw Error('Enter '+label+'.');return value.trim();}
  function operationEdition(operation){return operation.edition_id||operation.package_edition_id||state.params.edition_id||'';}
  function operationFamily(operation){return operation.family_id||operation.package_family_id||state.params.family_id||S.family?.family?.id||'';}
  async function afterMutation(operation,result,context){
    if(!result)return;await reload();
    if(context.epoch!==undefined&&context.epoch!==S.epoch)return;
    if(operation==='families.save'){await go('package-family',{id:result.family.id});notice('The original family revision is retained.');}
    else if(operation==='editions.create'){await go('package-edition',{id:result.edition.id,family_id:context.family_id});notice('The exact archive edition and source reference are retained.');}
    else if(operation==='comparisons.create'){const c=result.comparison||result;await go('package-comparison',{id:c.id,family_id:c.family_id||context.family_id});notice('The exact original preview comparison is retained.');}
    else if(operation==='reviews.save'){await go('package-preview',{id:context.preview_operation_id,family_id:context.family_id,edition_id:context.edition_id||''});notice('The original reviewer decision and exact preview identity are retained.');}
    else if(operation==='handovers.create'){await go('export',{id:result.export.id});notice('The complete original package handover is retained.');}
    else{const o=result.operation;await go('package-operation',{id:o.id,family_id:context.family_id||operationFamily(o),edition_id:context.edition_id||operationEdition(o)});notice('The same original native operation is retained and ready for its worker.');}
  }
  async function submit(form){
    if(S.busy||!form.reportValidity())return;
    if(S.pending){message('Recover the selected original request before editing another operation.',true);return;}
    const name=form.dataset.packageForm,v=formJSON(form),f=S.family?.family;let operation,payload,context={family_id:f?.id||'',epoch:S.epoch};
    if(name==='family'){
      for(const control of $$('[data-package-merge]',form))if(!control.value)throw Error('Choose which value to retain for every family field changed by both editors.');
      payload={label:requireText(v.label,'a family label'),owner:requireText(v.owner,'the responsible owner'),environment_id:requireText(v.environment_id,'the destination environment'),
        source_environment_id:v.source_environment_id||'',plan_ids:v.plan_ids||[],recovery_instruction:requireText(v.recovery_instruction,'the original recovery instruction'),notes:v.notes||''};
      if(f?.id)Object.assign(payload,{family_id:f.id,expected_revision:f.revision,comparison_id:f.comparison_id||''});operation='families.save';
    }else if(name==='export'){
      if(!f?.source_environment_id)throw Error('Select the original source environment in this family first.');
      const depth=Number(v.max_depth);if(!Number.isSafeInteger(depth)||depth<0)throw Error('Use a nonnegative whole-number native dependency depth.');
      operation='exports.create';payload={family_id:f.id,roots:[{entity_type:requireText(v.entity_type,'the original entity type'),uuid:requireText(v.uuid,'the original root UUID')}],
        options:{package_type:'content_entity',max_depth:depth,unpublished:v.unpublished===true},reason:requireText(v.reason,'the export purpose')};
    }else if(name==='edition'){
      operation='editions.create';payload={family_id:f.id,label:requireText(v.label,'an edition label'),notes:v.notes||''};
      if(v.previous_edition_id)payload.previous_edition_id=v.previous_edition_id;
      if(v.source_kind==='export')payload.export_operation_id=requireText(v.export_operation_id,'the completed original export');
      else{payload.file_id=requireText(v.file_id,'the retained original archive');payload.source_reference=requireText(v.source_reference,'the original supplied archive reference');}
    }else if(name==='preview'){
      const e=S.edition.edition;operation='previews.create';payload={family_id:f.id,edition_id:e.id,reason:requireText(v.reason,'the native preview reason')};context.edition_id=e.id;
    }else if(name==='review'){
      if(!['reviewer','admin'].includes(state.user?.role))throw Error('A reviewer or administrator records the final editorial decision.');
      if(!['APPROVE','RETURN'].includes(v.decision))throw Error('Choose Approve or Return for this exact native preview.');
      const p=S.preview,o=p.operation;operation='reviews.save';payload={preview_operation_id:o.id,preview_sha256:requireText(p.preview_file?.sha256,'the original retained preview identity'),
        decision:v.decision,reason:requireText(v.reason,'the accountable editorial reason'),expected_review_id:S.review?.id||''};
      if(v.comparison_id)payload.comparison_id=v.comparison_id;context={family_id:f.id,preview_operation_id:o.id,edition_id:operationEdition(o),epoch:S.epoch};
    }else if(name==='import'){
      const p=S.preview,o=p.operation,r=S.review;
      if(r?.decision!=='APPROVE'||r.preview_sha256!==p.preview_file?.sha256)throw Error('Retain an approval for this exact original native preview first.');
      operation='imports.create';payload={family_id:f.id,edition_id:requireText(operationEdition(o),'the original edition identity'),review_id:r.id,reason:requireText(v.reason,'the native import instruction')};context.edition_id=payload.edition_id;
    }else if(name==='receiving'){
      const o=S.operation.operation;if(o.type!=='PACKAGE_IMPORT')throw Error('Choose the same original import for its native receipt and destination readback.');
      operation='receiving.create';payload={family_id:requireText(operationFamily(o),'the original family identity'),import_operation_id:o.id,reason:requireText(v.reason,'the receiving readback instruction')};context.family_id=payload.family_id;context.edition_id=operationEdition(o);
    }else if(name==='comparison'){
      const o=S.preview.operation,baseline=requireText(v.baseline_preview_operation_id,'the earlier original preview');
      if(baseline===o.id)throw Error('Select two different retained native previews.');
      operation='comparisons.create';payload={baseline_preview_operation_id:baseline,candidate_preview_operation_id:o.id};context.family_id=f.id;
    }else if(name==='handover'){
      if(!v.package_family_ids?.length)throw Error('Select at least one original package family for this handover.');
      operation='handovers.create';payload={name:requireText(v.name,'the handover name'),package_family_ids:v.package_family_ids,plan_ids:v.plan_ids||[],include_sources:v.include_sources===true};
    }else throw Error('Choose an available package operation.');
    const result=await mutate(operation,payload,form);await afterMutation(operation,result,context);
  }
  async function action(name,target){
    if(S.busy)return;
    if(name==='download-draft')download('content-package-draft.json',keepPendingDraft());
    else if(name==='download-request'){if(S.pending)download('content-package-original-request.json',keepPendingDraft());}
    else if(name==='open-draft')$('[data-package-draft-file]')?.click();
    else if(name==='retry-request'){
      if(!S.pending)return;const selected=copy(S.pending),context={epoch:S.epoch,family_id:selected.payload.family_id||selected.params.family_id||selected.params.id,
        edition_id:selected.payload.edition_id||selected.params.edition_id,preview_operation_id:selected.payload.preview_operation_id||selected.params.id};
      const result=await mutate(selected.operation,selected.payload);await afterMutation(selected.operation,result,context);
    }else if(name==='review-latest'){
      if(!S.pending)return;const context=viewContext(),selected=S.pending;
      installDraft(selected);
      await reload();if(!sameView(context)||S.pending!==selected||S.busy)return;
      selected.inspected_at=new Date().toISOString();selected.inspected_workspace_head=state.snapshot?.head??state.snapshot?.workspace?.head??null;
      S.allowHash=location.hash!==href(selected.view,selected.params);await go(selected.view,selected.params);
    }else if(name==='replace-rejected'){
      const selected=S.pending;if(!selected||!selected.inspected_at||![400,409,422].includes(selected.response_failure?.status))throw Error('Recover the exact request or inspect its original service refusal before preparing a revision.');
      const reason=requireText($('[name=package_replacement_reason]')?.value,'the reason for revising this rejected request');
      S.replacedRequests.push({id:crypto.randomUUID(),request:copy(selected),reason,retained_at:new Date().toISOString(),workspace_id:workspaceId(),operator:state.user?.name||'',inspected_workspace_head:selected.inspected_workspace_head});
      installDraft(selected);
      S.pending=null;S.allowHash=location.hash!==href(selected.view,selected.params);await go(selected.view,selected.params);
    }else if(name==='refresh'){
      const context=viewContext();if(S.dirty)captureForms();await reload();if(!sameView(context)||S.busy)return;await render();
    }else if(name==='download-preview'){if(S.preview?.preview_file?.id){const a=document.createElement('a');a.href='/api/files/'+enc(S.preview.preview_file.id);a.download=S.preview.preview_file.filename||'original-package-preview.json';a.click();}}
    else if(name==='download-comparison'){if(S.comparison)download('original-package-comparison.json',S.comparison);}
    else if(name==='package-prev'||name==='package-next'){S.offset=Math.max(0,S.offset+(name==='package-next'?40:-40));renderPackageRows(S.preview.preview);}
    else if(name==='asset-prev'||name==='asset-next'){S.assetOffset=Math.max(0,S.assetOffset+(name==='asset-next'?40:-40));renderAssets(S.preview.preview);}
  }
  async function render(){
    if(!state.user||!state.view.startsWith('package'))return;
    suspend();const epoch=S.epoch;S.hash=location.hash||href('packages');S.dirty=false;main.innerHTML='<p class="loading">Opening original content packages…</p>';
    try{
      if(state.view==='packages')await familiesView(epoch);
      else if(state.view==='package-family')await familyView(epoch);
      else if(['package-family-new','package-family-edit'].includes(state.view))await familyFormView(epoch);
      else if(state.view==='package-export')await exportView(epoch);
      else if(state.view==='package-edition-new')await editionNewView(epoch);
      else if(state.view==='package-edition')await editionView(epoch);
      else if(state.view==='package-preview')await previewView(epoch);
      else if(state.view==='package-comparison')await comparisonView(epoch);
      else if(state.view==='package-operation')await operationView(epoch);
      else if(state.view==='package-handover')await handoverView(epoch);
      else throw Error('This package editor view does not exist.');
    }catch(error){if(isCurrent(epoch))fail(error);}
  }
  document.addEventListener('submit',event=>{
    const form=event.target.closest('form[data-package-form]');if(!form)return;event.preventDefault();event.stopPropagation();submit(form).catch(fail);
  },true);
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-package-action]');if(!target)return;event.preventDefault();event.stopPropagation();action(target.dataset.packageAction,target).catch(fail);
  },true);
  document.addEventListener('change',event=>{
    if(!event.target.matches('[data-package-draft-file]'))return;const input=event.target;openDraft(input.files?.[0]).catch(fail).finally(()=>{input.value='';});
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-action=logout]')||!state.view.startsWith('package'))return;
    if(S.busy||S.dirty&&!confirm('Keep your package draft in this browser and sign out?')){event.preventDefault();event.stopImmediatePropagation();notice('The current package entries remain open.');}
  },true);
  window.addEventListener('beforeunload',event=>{if(S.busy||S.dirty||S.pending){event.preventDefault();event.returnValue='';}});
  return{render,suspend,beforeNavigate};
})();
