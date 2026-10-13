// SPDX-License-Identifier: MIT
'use strict';
(async function () {
  const root=document.getElementById('workspace'),$=id=>document.getElementById(id);
  const api=root.dataset.api,actor=root.dataset.actor;
  const copy=v=>JSON.parse(JSON.stringify(v)),pretty=v=>JSON.stringify(v,null,2);
  const id=prefix=>prefix+'-'+crypto.randomUUID(),lines=text=>text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const scope=location.origin+api+':'+actor;
  let projectId='',project=null,captureId='',cohort=null,offset=0,review=null,approval=null,rules={};
  let fieldOffset=0,query='',busy=false,lastResult=null,tab='project';
  const keys=p=>({pending:'catalogue:pending:'+scope+':'+p,draft:'catalogue:review:'+scope+':'+p});
  const say=(text,type='')=>{$('status').textContent=text;$('status').className=type;};
  const make=(tag,attrs={},children=[])=>{
    const node=document.createElement(tag);
    for(const [key,value]of Object.entries(attrs)){
      if(key==='text')node.textContent=value;
      else if(key==='class')node.className=value;
      else if(key==='on')for(const [name,fn]of Object.entries(value))node.addEventListener(name,fn);
      else if(key in node)node[key]=value;
      else node.setAttribute(key,String(value));
    }
    for(const child of children)node.append(typeof child==='string'?document.createTextNode(child):child);
    return node;
  };
  const button=(label,fn,attrs={})=>make('button',{type:'button',text:label,...attrs,on:{click:()=>task(fn)}});
  const download=(value,name,type='application/json')=>{
    const url=URL.createObjectURL(new Blob([typeof value==='string'?value:pretty(value)+'\n'],{type}));
    const a=make('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  const showResult=value=>{lastResult=value;$('result').textContent=pretty(value);};
  function selectedProject(){
    const value=$('project-id').value.trim();
    if(!value)throw new Error('Enter the original project ID.');
    if(projectId!==value)throw new Error('Open the selected original project first, or use Receive to create it from its archive.');
    return value;
  }
  async function task(fn){
    if(busy)return;busy=true;
    // Freeze all editable controls for the same native request; draft values cannot be replaced during an await.
    const controls=[...root.querySelectorAll('button,input,select,textarea')].map(node=>[node,node.disabled]);
    controls.forEach(([node])=>node.disabled=true);root.setAttribute('aria-busy','true');
    try{await fn();}catch(error){say(error.message||String(error),'error');}
    finally{for(const[node,disabled]of controls)if(node.isConnected)node.disabled=disabled;
      busy=false;root.removeAttribute('aria-busy');syncButtons();renderPending();}
  }
  function storageRead(key){const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}
  function pending(){
    if(!projectId)return null;
    const value=storageRead(keys(projectId).pending);
    if(value&&(value.project_id!==projectId||value.actor!==actor||value.api!==api))throw new Error('The retained action belongs to another original project or session.');
    return value;
  }
  function renderPending(){
    try{const value=pending();$('pending').hidden=!value;
      $('pending-label').textContent=value?value.action+' · '+value.operation_id+' · '+value.project_id:'';
    }catch(error){say(error.message,'error');}
  }
  function writePending(value){
    localStorage.setItem(keys(value.project_id).pending,JSON.stringify(value));
    if(storageRead(keys(value.project_id).pending)?.operation_id!==value.operation_id)
      throw new Error('This browser could not retain the original action. Use the native command with a private input file.');
    renderPending();
  }
  function retainDraft(){
    if(!projectId||!review)return;
    localStorage.setItem(keys(projectId).draft,JSON.stringify({review,approval,rules,query,fieldOffset}));
  }
  async function transport(body){
    const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':root.dataset.csrf},
      body:JSON.stringify({action:body.action,input:body.input,operation_id:body.operation_id})});
    const text=await response.text();let value;
    try{value=JSON.parse(text);}catch{throw new Error('The native response was interrupted or the administrator session expired. The original action remains retained.');}
    if(value.schema!=='tjl.catalogue.workspace-result.v1'||value.operation_id!==body.operation_id||value.action!==body.action||
      (body.input.project_id!==undefined&&value.project_id!==body.input.project_id))
      throw new Error('The native response does not name this exact original action and project.');
    showResult(value);
    if(value.state==='ATTENTION')throw new Error(value.error?.message||'The original native action requires attention. Its complete result is retained.');
    if(!response.ok)throw new Error('Native request returned HTTP '+response.status+'.');
    return value;
  }
  async function read(action,input={}){
    return transport({action,input,operation_id:id('read')});
  }
  async function mutate(action,input,existing=null){
    const pid=input.project_id;
    if(!pid||pid!==projectId)throw new Error('Bind the mutation to the opened original project.');
    let body=existing;
    if(!body){
      const previous=pending();if(previous)throw new Error('Continue or retain the existing original action before starting another one.');
      body={schema:'tjl.catalogue.browser-command.v1',api,actor,project_id:pid,action,input:copy(input),operation_id:id(action),created_at:new Date().toISOString()};
      writePending(body);
    }
    if(body.project_id!==projectId||body.actor!==actor||body.api!==api)throw new Error('The retained original command authority differs.');
    const value=await transport(body);
    // Capture may need to drive the same request again. A dispatch response is only queue admission.
    if(action!=='capture'||value.state==='COMPLETE'){
      const current=pending();if(current?.operation_id===body.operation_id)localStorage.removeItem(keys(projectId).pending);
    }
    consume(value);renderPending();
    say(value.state==='WAITING_NATIVE'?'Original action received. Native completion is still pending.':'Original '+action+' result retained.','success');
    return value;
  }
  function selectTab(name){tab=name;document.querySelectorAll('.tab').forEach(n=>n.hidden=n.id!=='tab-'+name);
    document.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-selected',String(n.dataset.tab===name)));}
  document.querySelectorAll('[data-tab]').forEach(node=>node.addEventListener('click',()=>selectTab(node.dataset.tab)));
  function syncButtons(){
    $('dispatch').disabled=busy||!approval;
    $('cohort-previous').disabled=busy||!cohort||offset===0;
    $('cohort-next').disabled=busy||!cohort||cohort.next_offset===null;
    const count=review?Object.values(review.native.fields).filter(field=>pretty(field.selector).toLowerCase().includes(query.toLowerCase())).length:0;
    $('field-previous').disabled=busy||fieldOffset===0;
    $('field-next').disabled=busy||fieldOffset+25>=count;
  }
  function consume(value){
    const r=value.result;
    if(value.action==='capture'||value.action==='cohort'){if(r?.cohort){cohort=r;captureId=r.cohort.id;offset=r.offset;renderCohort();}}
    if(value.action==='review'||value.action==='missing-review'||(value.action==='record'&&r?.schema==='tjl.catalogue.review.v1')){
      if(review&&review.sha256!==r.sha256&&Object.keys(rules).length)retainDraft();
      review=r;rules={};approval=null;query='';fieldOffset=0;retainDraft();renderReview();selectTab('review');
    }
    if(value.action==='approve'){approval=r;retainDraft();$('approval-status').textContent='Approval '+r.id+' · '+r.sha256;syncButtons();}
    if(value.action==='dispatch'||value.action==='retry'||value.action==='operation'){
      $('operation-detail').textContent=pretty(r);selectTab('operations');
    }
    if(value.action==='files')renderFiles(r);
    if(value.action==='export'){
      const a=make('a',{href:fileUrl(r.archive.sha256),text:'Download complete catalogue ZIP · '+r.archive.bytes.toLocaleString()+' bytes',download:'catalogue-'+projectId+'.zip'});
      $('export-result').replaceChildren(a,make('p',{class:'identity',text:r.archive.sha256+' · frozen manifest '+r.manifest_sha256}));
    }
    if(value.action==='engine')$('engine').textContent=pretty(r);
  }
  async function listProjects(){
    const value=await read('projects',{limit:500});$('projects').replaceChildren();
    for(const p of value.result.projects)$('projects').append(make('option',{value:p.id,text:p.label}));
  }
  function switchProject(next){
    if(next===projectId)return;
    retainDraft();projectId=next;project=null;review=null;approval=null;rules={};captureId='';cohort=null;offset=0;query='';fieldOffset=0;
    const saved=storageRead(keys(projectId).draft);
    if(saved&&saved.review?.project_id===projectId){review=saved.review;approval=saved.approval;rules=saved.rules||{};query=saved.query||'';fieldOffset=saved.fieldOffset||0;}
    for(const name of ['cohort-rows','operation-rows','file-rows','capture-select','source-summary','operation-detail','live-pending','export-result'])$(name).replaceChildren();
    $('project-summary').textContent='Selected original project '+projectId+'. Read its current native state.';
    $('cohort-page').textContent='';renderReview();renderPending();
  }
  async function openProject(){
    const next=$('project-id').value.trim();if(!next)throw new Error('Enter an original project ID.');
    const value=await read('project',{project_id:next});
    switchProject(next);project=value.result;
    renderProject();renderReview();renderPending();
    say('Opened '+project.project.label+' with its original selected identifiers.','success');
  }
  function renderProject(){
    if(!project)return;
    const p=project.project;
    $('project-summary').textContent=p.label+' · '+p.selection.identifiers.length+' identifiers · locales '+p.selection.locales.join(', ')+' · channels '+p.selection.channels.join(', ');
    const select=$('capture-select');select.replaceChildren();
    for(const c of project.cohorts)select.append(make('option',{value:c.id,text:c.id+' · '+c.created_at,selected:c.id===captureId}));
    if(captureId&&!project.cohorts.some(c=>c.id===captureId)&&cohort)select.append(make('option',{value:captureId,text:captureId,selected:true}));
    renderOperations();$('live-pending').textContent=pretty(project.live_pending);
  }
  async function refreshProject(){
    const pid=selectedProject();const value=await read('project',{project_id:pid});project=value.result;renderProject();
  }
  async function openCapture(start=0){
    const pid=selectedProject(),capture=$('capture-select').value||captureId;
    if(!capture)throw new Error('Select a retained source capture.');
    const value=await read('cohort',{project_id:pid,capture_id:capture,offset:start,limit:50});consume(value);
  }
  function renderCohort(){
    if(!cohort)return;
    $('cohort-page').textContent=(cohort.total?cohort.offset+1:0)+'–'+(cohort.offset+cohort.rows.length)+' of '+cohort.total+' selected identifiers · '+captureId;
    $('cohort-rows').replaceChildren();
    for(const row of cohort.rows){
      const action=row.source.state==='MISSING'?'missing-review':'review';
      $('cohort-rows').append(make('tr',{},[make('td',{text:row.identifier}),make('td',{},[make('span',{class:'badge',text:row.source.state})]),
        make('td',{text:row.claim.active?'Workspace review':'Original live imports'}),
        make('td',{},[button(row.source.state==='MISSING'?'Review missing record':'Review source and local fields',async()=>{
          if(review&&Object.keys(rules).length&&!confirm('Keep the current choices in a JSON download before opening another review? Cancel to remain here.'))return;
          if(review&&Object.keys(rules).length)download({review,rules,approval},'catalogue-review-'+review.id+'.json');
          await mutate(action,{project_id:selectedProject(),capture_id:captureId,identifier:row.identifier});
        })])]));
    }
    $('source-summary').textContent=pretty(cohort.source_summary);
    syncButtons();
  }
  function fieldProtected(field){
    const s=field.selector;
    return (s.locale!==undefined&&s.locale!==null&&!review.selection.locales.includes(s.locale))||
      (s.kind==='pricing'&&!review.selection.channels.includes(s.channel))||
      (s.kind==='scalar'&&['onHand','onHold','tracked'].includes(s.property));
  }
  function readRules(){
    // Values are maintained on every input; malformed JSON remains as draft text until explicit approval.
    return Object.entries(rules).map(([field_id,row])=>{
      const field=review.native.fields[field_id];if(!field)throw new Error('An ownership decision names another original review.');
      const out={field_id,owner:row.owner,before_sha256:field.value_sha256};
      if(row.owner==='local'&&row.replace){out.value=JSON.parse(row.text);}
      return out;
    });
  }
  function renderReview(){
    $('review-content').hidden=!review;
    if(!review){$('review-title').textContent='Review one original catalogue item';$('review-binding').textContent='Open an item from the retained source cohort.';syncButtons();return;}
    $('review-title').textContent=(review.kind==='MISSING'?'Selected missing-record review · ':'Field ownership review · ')+review.identifier;
    $('review-binding').textContent='Review '+review.id+' · '+review.sha256;
    $('review-notice').textContent=review.scope_notice;$('source-product').textContent=pretty(review.source);
    $('native-product').textContent=pretty({native:review.native,native_sha256:review.native_sha256,engine:review.engine});
    $('import-review').hidden=review.kind==='MISSING';$('missing-review').hidden=review.kind!=='MISSING';
    $('approve-confirm').checked=false;$('missing-confirm').checked=false;$('missing-access').checked=false;$('missing-parent').checked=false;
    $('field-search').value=query;renderFields();$('approval-status').textContent=approval?'Saved approval '+approval.id+' · ownership changes require a following approval.':'No saved approval for these choices.';
    syncButtons();
  }
  function renderFields(){
    $('field-rows').replaceChildren();if(!review)return;
    const all=Object.values(review.native.fields).filter(field=>pretty(field.selector).toLowerCase().includes(query.toLowerCase()));
    if(fieldOffset>=all.length)fieldOffset=0;
    for(const field of all.slice(fieldOffset,fieldOffset+25)){
      const selected=rules[field.id],protectedField=fieldProtected(field);
      const owner=make('select',{disabled:protectedField});
      for(const[value,label]of [['source','Source: installed native mapping'],['local','Local: preserve or explicitly replace']])
        owner.append(make('option',{value,text:label,selected:value===(protectedField?'local':selected?.owner||'source')}));
      const replace=make('input',{type:'checkbox',checked:!!selected?.replace,disabled:protectedField||owner.value!=='local'});
      const text=make('textarea',{rows:4,value:selected?.text??pretty(field.value),disabled:protectedField||owner.value!=='local'||!replace.checked});
      const label=Object.entries(field.selector).map(([k,v])=>k+'='+String(v)).join(' · ');
      const card=make('article',{class:'field'},[make('h3',{text:label}),make('p',{class:'identity',text:field.id}),
        make('div',{class:'two'},[make('div',{},[make('p',{class:'muted',text:'Reviewed current native value'}),make('pre',{text:pretty(field.value)})]),
          make('div',{},[make('label',{},['Owner',owner]),make('label',{class:'check'},[replace,'Use an explicit local replacement JSON value']),text,
            make('p',{class:'muted',text:protectedField?'Automatically preserved outside scope or as native stock.':'Leave replacement unchecked to preserve the reviewed local value exactly.'})])])]);
      function changed(){
        rules[field.id]={owner:owner.value,replace:replace.checked,text:text.value};
        replace.disabled=owner.value!=='local'||protectedField;text.disabled=owner.value!=='local'||!replace.checked||protectedField;
        approval=null;retainDraft();$('approval-status').textContent='Unsaved ownership choices. Save a following exact approval before dispatch.';syncButtons();
      }
      owner.addEventListener('change',changed);replace.addEventListener('change',changed);text.addEventListener('input',changed);
      $('field-rows').append(card);
    }
    $('field-page').textContent=(all.length?fieldOffset+1:0)+'–'+Math.min(fieldOffset+25,all.length)+' of '+all.length+' fields';
    $('field-previous').disabled=fieldOffset===0;$('field-next').disabled=fieldOffset+25>=all.length;
  }
  function renderOperations(){
    $('operation-rows').replaceChildren();
    for(const row of project?.imports||[]){
      const controls=[button('Inspect current result',async()=>{const value=await read('operation',{project_id:selectedProject(),import_operation_id:row.id});consume(value);})];
      if(!['COMPLETE','RETAINED_UNAPPLIED'].includes(row.display_state))controls.push(button('Continue same approval',async()=>{
        if(!confirm('Continue this exact original approval and stamped native operation? Current source/native checks remain in effect.'))return;
        await mutate('retry',{project_id:selectedProject(),import_operation_id:row.id,preserve_original_approval:true});await refreshProject();
      }));
      if(['PREPARED','DISPATCHING','QUEUED','ATTENTION'].includes(row.state))controls.push(button('Retain unapplied',async()=>{
        const reason=prompt('Retain this original operation without applying it. Enter the explicit reason for a following review.');
        if(!reason)return;
        await mutate('retain-unapplied',{project_id:selectedProject(),import_operation_id:row.id,confirm_no_native_commit:true,reason});await refreshProject();
      }));
      $('operation-rows').append(make('tr',{},[make('td',{},[make('strong',{text:row.identifier}),make('div',{class:'identity',text:row.id})]),
        make('td',{},[make('span',{class:'badge',text:row.display_state||row.state})]),make('td',{text:(row.native_result_ids||[]).join(', ')||'Awaiting original result'}),make('td',{},controls)]));
    }
  }
  const fileUrl=sha=>root.dataset.download.replace('PROJECT',encodeURIComponent(projectId)).replace('0000000000000000000000000000000000000000000000000000000000000000',sha);
  function renderFiles(result){
    $('file-rows').replaceChildren();
    for(const file of result.files)$('file-rows').append(make('tr',{},[
      make('td',{class:'identity',text:file.sha256}),make('td',{text:file.bytes.toLocaleString()}),
      make('td',{},[make('a',{href:fileUrl(file.sha256),text:'Download original',download:file.name||file.sha256+'.bin'})])]));
  }
  function on(name,fn){$(name).addEventListener('click',()=>task(fn));}
  on('list-projects',listProjects);on('open-project',openProject);
  on('read-engine',async()=>consume(await read('engine')));
  on('create-project',async()=>{
    if(!$('claim-confirm').checked)throw new Error('Explicitly confirm the selected identifier claims.');
    const next=$('new-id').value.trim()||id('catalogue');
    if(projectId&&pending())throw new Error('Retain the original pending action before changing projects.');
    switchProject(next);$('project-id').value=next;
    await mutate('project-create',{project_id:next,label:$('new-label').value,identifiers:lines($('new-identifiers').value),
      locales:lines($('new-locales').value),channels:lines($('new-channels').value)});
    await openProject();await listProjects();
  });
  on('capture',async()=>{
    const input={project_id:selectedProject(),capture_id:id('capture')};
    const extra=JSON.parse($('additional-requests').value||'[]');if(!Array.isArray(extra))throw new Error('Additional native requests must be a JSON array.');
    if(extra.length)input.additional_requests=extra;
    await mutate('capture',input);await refreshProject();selectTab('cohort');
  });
  on('open-capture',()=>openCapture(0));on('cohort-previous',()=>openCapture(Math.max(0,offset-50)));on('cohort-next',()=>openCapture(cohort.next_offset));
  $('field-search').addEventListener('input',()=>{query=$('field-search').value;fieldOffset=0;renderFields();retainDraft();});
  on('field-previous',()=>{fieldOffset=Math.max(0,fieldOffset-25);renderFields();retainDraft();});
  on('field-next',()=>{fieldOffset+=25;renderFields();retainDraft();});
  on('approve',async()=>{
    if(!review||review.kind!=='IMPORT'||!$('approve-confirm').checked)throw new Error('Explicitly approve the displayed source/native review and mapping.');
    await mutate('approve',{project_id:selectedProject(),review_id:review.id,review_sha256:review.sha256,approve_native_mapping:true,rules:readRules()});
  });
  on('dispatch',async()=>{
    if(!approval)throw new Error('Save the exact ownership approval first.');
    await mutate('dispatch',{project_id:selectedProject(),approval_id:approval.id,import_operation_id:id('import')});await refreshProject();
  });
  on('apply-missing',async()=>{
    if(!review||review.kind!=='MISSING'||!$('missing-access').checked||!$('missing-confirm').checked)throw new Error('Review and confirm the exact selected missing-record action and access limitation.');
    await mutate('missing-apply',{project_id:selectedProject(),review_id:review.id,review_sha256:review.sha256,
      confirm_selected_disable:true,acknowledge_access_boundary:true,disable_parent_if_no_enabled_variants:$('missing-parent').checked});await refreshProject();
  });
  on('release-claim',async()=>{
    if(!$('release-confirm').checked)throw new Error('Explicitly confirm resuming original live importing for the selected identifier.');
    await mutate('release-claim',{project_id:selectedProject(),identifier:$('release-identifier').value,resume_original_live_imports:true});await refreshProject();
  });
  on('refresh-operations',refreshProject);
  on('refresh-files',async()=>consume(await read('files',{project_id:selectedProject()})));
  on('export-project',async()=>{await mutate('export',{project_id:selectedProject()});consume(await read('files',{project_id:projectId}));});
  on('download-review',()=>{if(!review)throw new Error('Open an original review.');download({review,approval,rules},'catalogue-review-'+review.id+'.json');});
  on('read-record',async()=>{const value=await read('record',{project_id:selectedProject(),kind:$('record-kind').value,id:$('record-id').value});consume(value);});
  on('download-result',()=>{if(!lastResult)throw new Error('Read an original result first.');download(lastResult,'catalogue-'+lastResult.operation_id+'.json');});
  on('resume-pending',async()=>{
    const body=pending();if(!body)throw new Error('There is no original pending action in this project.');
    if(body.action==='receive'){throw new Error('Reselect the same complete archive and press Receive. Its original operation and file identity are retained.');}
    await mutate(body.action,body.input,body);if(body.action==='project-create')await openProject();else if(project)await refreshProject();
  });
  on('download-pending',()=>{const body=pending();if(!body)throw new Error('No pending action.');download(body,'catalogue-action-'+body.operation_id+'.json');});
  on('retain-pending',()=>{
    const body=pending();if(!body)return;
    if(!confirm('Retain this original action and its ID without cancelling any native work, then permit a separate action?'))return;
    const saved='catalogue:retained:'+scope+':'+body.project_id+':'+body.operation_id;
    localStorage.setItem(saved,JSON.stringify(body));download(body,'catalogue-action-'+body.operation_id+'.json');
    localStorage.removeItem(keys(body.project_id).pending);renderPending();say('Original action retained. Native work has not been cancelled.');
  });
  on('receive-project',async()=>{
    const pid=$('project-id').value.trim(),file=$('receive-file').files?.[0];
    if(!pid||!file||!$('receive-confirm').checked)throw new Error('Select the original project ID, complete archive and explicit receiving confirmation.');
    if(projectId&&projectId!==pid&&pending())throw new Error('Retain the original pending action before changing projects.');
    switchProject(pid);
    if(!crypto.subtle)throw new Error('This browser needs a secure native origin for complete archive hashing; use the native CLI on this host.');
    const bytes=await file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    let body=pending();
    if(body&&(body.action!=='receive'||body.archive_sha256!==digest||body.archive_bytes!==file.size))throw new Error('Reselect the same original archive or retain the existing receiving action first.');
    if(!body){body={schema:'tjl.catalogue.browser-command.v1',api,actor,project_id:pid,action:'receive',input:{project_id:pid},
      operation_id:id('receive'),archive_sha256:digest,archive_bytes:file.size,created_at:new Date().toISOString()};writePending(body);}
    const data=new FormData();data.append('project_id',pid);data.append('operation_id',body.operation_id);data.append('archive',file);
    const response=await fetch(root.dataset.upload,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':root.dataset.csrf},body:data});
    const value=await response.json();
    if(value.schema!=='tjl.catalogue.workspace-result.v1'||value.action!=='receive'||value.project_id!==pid||value.operation_id!==body.operation_id)
      throw new Error('The native receiving response does not match its original action.');
    showResult(value);
    if(!response.ok||value.state!=='COMPLETE')throw new Error(value.error?.message||'Original receiving needs continuation.');
    localStorage.removeItem(keys(pid).pending);await openProject();say('Original project received. Later work will remain under this same project identity.','success');
  });
  window.addEventListener('beforeunload',()=>{try{retainDraft();}catch{}});
  $('new-id').value=id('catalogue');
  selectTab('project');
  await task(async()=>{await listProjects();say('Native administrator session is ready. Select an existing project or create a reviewed cohort.');});
})();
