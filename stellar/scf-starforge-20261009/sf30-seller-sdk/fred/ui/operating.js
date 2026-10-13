// MIT. Stream complete original operating handovers through the existing private workspace.
export function mountFredOperatingHandovers({api,getToken,getState,getBusy,message}) {
  const $ = id => document.getElementById(id);
  const MAX_ARCHIVE = 4429185024, MAX_PLAN = 32*1024*1024;
  const PAGE = 20, SOURCE_PAGE = 50;
  const states = new Set(['EXPORTING','UPLOADING','INSPECTING','INSPECTED','RECEIVING','COMPLETE','FAILED','INTERRUPTED']);
  let projectId=null, selected=null, current=null, offset=0, listing=null;
  let generation=0, listRead=0, detailRead=0, sourceRead=0, poll=null, upload=null, working=false;
  let source=null, plan=null, sourceOffset=0, planFile=null, planValue=null, planRead=0;
  let retainedPlan=null, retainedPlanLoaded=false, retainedPlanRead=0, planChoiceVersion=0;
  const freshId = prefix => prefix+'-'+crypto.randomUUID().replaceAll('-','');
  const visible = () => !$('operating-handover').closest('[data-panel]').hidden && document.visibilityState!=='hidden';
  const bytes = value => Number.isSafeInteger(value) ? new Intl.NumberFormat().format(value)+' bytes' : '—';
  const json = value => JSON.stringify(value,null,2);
  const stopPoll = () => {if(poll)clearTimeout(poll);poll=null;};
  const scope = () => ({projectId,generation});
  const same = value => value.projectId===projectId && value.generation===generation;
  const boundStatus = () => current?.id===selected ? current : null;
  function selectOperation(id) {selected=id;current=null;detailRead++;clearSource();stopPoll();$('handover-selected').hidden=true;remember('selected',id);enable();}
  async function planDigest(value) {const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
  const key = name => 'fred-operating-handover:'+projectId+':'+name;
  function remember(name,value) {try{sessionStorage.setItem(key(name),JSON.stringify(value));}catch{}}
  function recall(name) {try{return JSON.parse(sessionStorage.getItem(key(name))||'null');}catch{return null;}}
  function fileIdentity(file) {return {name:file.name,bytes:file.size,lastModified:file.lastModified};}
  function sameFile(left,right) {return left && right && left.name===right.name && left.bytes===right.bytes && left.lastModified===right.lastModified;}
  function validStatus(value,id=null) {
    if(value?.projectId!==projectId || typeof value.id!=='string' || id && value.id!==id ||
        !['EXPORT','IMPORT'].includes(value.kind) || !states.has(value.state) || typeof value.active!=='boolean')
      throw new Error('The retained handover response does not match this project and operation.');
    return value;
  }
  function clearSource() {
    sourceRead++;source=null;plan=null;sourceOffset=0;
    $('handover-source-panel').hidden=true;
    $('handover-source-rows').replaceChildren();$('handover-plan-steps').replaceChildren();
  }
  function enable() {
    const ready=Boolean(projectId && getState()?.id===projectId), busy=working||Boolean(upload), current=boundStatus();
    $('handover-export').disabled=!ready||busy||Boolean(getBusy()||getState()?.pending)||($('handover-plan-mode').value==='file'&&!planValue)||($('handover-plan-mode').value==='retained'&&!retainedPlanLoaded);
    $('handover-upload').disabled=!ready||busy||!$('handover-archive-file').files[0];
    $('handover-cancel-upload').disabled=!upload;
    $('handover-refresh').disabled=!ready||working;
    $('handover-list-prev').disabled=busy||offset===0;
    $('handover-list-next').disabled=busy||listing?.nextOffset==null;
    $('handover-download').disabled=busy||!current?.result?.archive;
    $('handover-source').disabled=busy||!current?.result?.sourceId;
    $('handover-receive').disabled=busy||current?.kind!=='IMPORT'||current?.state!=='INSPECTED';
    $('handover-open').disabled=busy||!current?.result?.projectDirectory||current?.state!=='COMPLETE';
    $('handover-retry').hidden=!current?.retryAction||current.active;
    $('handover-retry').disabled=busy;
    $('handover-retry').textContent='Continue original '+(current?.retryAction||'operation');
    $('handover-source-save').disabled=!source;
    $('handover-plan-save').disabled=!plan;
    $('handover-plan-revision').disabled=!plan;
  }
  function notice(text,error=false) {$('handover-status').textContent=text; if(error)message(text,true);}
  function metric(parent,label,value) {
    const box=document.createElement('div');box.className='metric';
    const strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=String(value??'—');span.textContent=label;box.append(strong,span);parent.append(box);
  }
  function paragraph(parent,text) {const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
  function detail(parent,label,value) {
    const node=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
    summary.textContent=label;pre.textContent=typeof value==='string'?value:json(value);
    node.append(summary,pre);parent.append(node);return node;
  }
  function renderStatus(value) {
    const changed=current?.id!==value.id || current?.result?.sourceId!==value.result?.sourceId ||
      current?.result?.plan?.revision!==value.result?.plan?.revision;
    if(changed)clearSource();
    current=value;selected=value.id;remember('selected',value.id);
    $('handover-selected').hidden=false;
    $('handover-title').textContent=(value.kind==='EXPORT'?'Prepared handover':'Received handover')+' · '+value.id;
    const labels={EXPORTING:'Preparing the complete original archive.',UPLOADING:'Receiving original file bytes.',
      INSPECTING:'Inspecting complete archive and source history.',INSPECTED:'Source inspected. Review the contents, then receive the customer project.',
      RECEIVING:'Restoring the complete customer project and carried publications.',COMPLETE:'The original handover operation is complete.',
      FAILED:'The original operation needs continuation.',INTERRUPTED:'The saved operation can continue on this host.'};
    notice(labels[value.state]+(value.error?' '+value.error.message:''));
    const result=value.result,root=$('handover-summary');root.replaceChildren();
    if(result) {
      metric(root,'Project revision',result.sourceProject?.revision);
      metric(root,'Carried publications',result.completePublishedCount);
      metric(root,'Plan revision',result.plan?.revision??'None');
      metric(root,'Complete archive',bytes(result.archive?.bytes));
    }
    $('handover-receiving-path').textContent=result?.projectDirectory?'Received project: '+result.projectDirectory:'';
    $('handover-identity').textContent=json({id:value.id,kind:value.kind,state:value.state,phase:value.phase,
      createdAt:value.createdAt,updatedAt:value.updatedAt,archive:result?.archive,sourceId:result?.sourceId,project:result?.sourceProject});
    enable();schedule();
  }
  function schedule() {
    stopPoll();
    if(current?.active && visible())poll=setTimeout(()=>{
      poll=null;loadStatus(selected).catch(error=>notice(error.message,true));
    },2000);
  }
  async function loadStatus(id) {
    if(!id)return null;
    const context=scope(),ticket=++detailRead;
    const value=await api('/api/operating-handover?'+new URLSearchParams({id}),undefined,context.projectId);
    if(!same(context)||ticket!==detailRead||selected!==id)return null;
    renderStatus(validStatus(value,id));return value;
  }
  async function choose(id) {
    selectOperation(id);
    await loadStatus(id);
  }
  function renderList() {
    const root=$('handover-list');root.replaceChildren();
    if(!listing.items.length){paragraph(root,'No saved handovers on this page.');enable();return;}
    const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),labels=document.createElement('tr');
    for(const name of ['Handover','State','Original project','Updated','']){const th=document.createElement('th');th.textContent=name;labels.append(th);}
    head.append(labels);
    for(const item of listing.items) {
      const tr=document.createElement('tr');
      for(const text of [item.id,item.state,item.result?.sourceProject?.title||'Source receiving',item.updatedAt]) {
        const td=document.createElement('td');td.textContent=text;tr.append(td);
      }
      const td=document.createElement('td'),button=document.createElement('button');
      button.type='button';button.textContent=item.id===selected?'Refresh selected':'Open handover';
      button.addEventListener('click',()=>act(()=>choose(item.id)));td.append(button);tr.append(td);body.append(tr);
    }
    table.append(head,body);root.append(table);enable();
  }
  async function refreshList() {
    if(!projectId)return;
    const context=scope(),ticket=++listRead;
    const value=await api('/api/operating-handovers?'+new URLSearchParams({offset:String(offset),limit:String(PAGE)}),undefined,context.projectId);
    if(!same(context)||ticket!==listRead)return;
    if(value?.projectId!==projectId||!Array.isArray(value.items)||!Number.isSafeInteger(value.total))
      throw new Error('The complete handover catalog belongs to another project.');
    value.items.forEach(item=>validStatus(item));
    listing=value;
    $('handover-list-position').textContent=value.total?(value.offset+1)+'–'+(value.offset+value.items.length)+' of '+value.total:'0 handovers';
    renderList();
    if(!selected && value.items.length)selected=value.items[0].id;
    if(selected)await loadStatus(selected);
  }
  async function act(work) {
    if(working)return;
    working=true;enable();
    try{await work();}
    catch(error){message(error.message,true);if(current)notice(error.message);}
    finally{working=false;enable();}
  }
  function linkDownload(url,filename) {
    const link=document.createElement('a');link.href=url;link.download=filename||'';link.rel='noopener';document.body.append(link);link.click();link.remove();
  }
  function saveJson(value,filename) {
    const url=URL.createObjectURL(new Blob([json(value)+'\n'],{type:'application/json'}));
    linkDownload(url,filename);setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function downloadArchive() {
    if(!boundStatus()?.result?.archive)throw new Error('Open the original handover before downloading.');
    const context=scope(),id=selected;
    const result=await api('/api/operating-handover/download-ticket',{id},context.projectId);
    if(!same(context)||selected!==id)return;
    const url=new URL(result.url,location.href);
    if(url.origin!==location.origin||url.username||url.password||url.pathname!=='/operating-handover-download')
      throw new Error('The archive download must remain on this original workspace.');
    linkDownload(url.href,result.archive?.name||'economic-operating-handover.tar.gz');
  }
  async function readRetainedPlan({chooseDefault=false}={}) {
    const context=scope(),ticket=++retainedPlanRead,choice=planChoiceVersion;
    const value=await api('/api/operating-handover/current-plan',undefined,context.projectId);
    if(!same(context)||ticket!==retainedPlanRead)return null;
    if(value?.projectId!==projectId||value.plan!==null&&(!Array.isArray(value.plan?.revisions)||!value.plan.revisions.length))
      throw new Error('The retained customer plan is incomplete.');
    retainedPlan=value.plan;retainedPlanLoaded=true;
    if(chooseDefault && choice===planChoiceVersion)$('handover-plan-mode').value=retainedPlan?'retained':'none';
    $('handover-retained-plan-status').textContent=retainedPlan?
      retainedPlan.revisions.at(-1).title+' · '+retainedPlan.revisions.length+' saved customer revisions available.':
      'This workspace has no carried customer plan. You can choose a complete plan file.';
    enable();return retainedPlan;
  }
  async function prepareExport() {
    const context=scope(),state=getState(),pending=recall('export');
    let original=null;
    if(pending?.id && pending.projectId===projectId) {
      try {
        const saved=validStatus(await api('/api/operating-handover?'+new URLSearchParams({id:pending.id}),undefined,context.projectId),pending.id);
        if(!same(context))return;
        if(saved.active||saved.retryAction==='export'){renderStatus(saved);notice('The original export is retained. Continue it below.');return;}
      } catch(error) {
        if(error.status!==404&&error.code!=='ENOENT')throw error;
        if(!same(context))return;
        original=pending;
      }
    }
    const mode=$('handover-plan-mode').value;
    const selectedPlan=mode==='retained'?await readRetainedPlan():mode==='file'?planValue:null;
    if(!same(context))return;
    if(mode!=='none'&&!selectedPlan)throw new Error('Choose the complete plan to carry, or select source only.');
    const planSha256=await planDigest(selectedPlan);
    if(!same(context))return;
    if(original && (!original.capturedAt||original.planSha256!==planSha256))
      throw new Error('Keep the original export '+original.id+' and choose its same complete plan before continuing. Its saved request remains available.');
    const request={id:original?.id||freshId('handover'),expectedRevision:original?.expectedRevision??state.revision,
      capturedAt:original?.capturedAt||new Date().toISOString(),publicationIds:null,plan:selectedPlan};
    remember('export',{id:request.id,projectId,expectedRevision:request.expectedRevision,capturedAt:request.capturedAt,planSha256});
    selectOperation(request.id);
    const result=await api('/api/operating-handover/export',request,context.projectId);
    if(!same(context))return;
    renderStatus(validStatus(result,request.id));await refreshList();
  }
  function streamUpload(id,file,context) {
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();upload=xhr;enable();
      xhr.open('POST','/api/operating-handover/upload?'+new URLSearchParams({id,bytes:String(file.size)}));
      xhr.setRequestHeader('authorization','Bearer '+getToken());
      xhr.setRequestHeader('x-fred-project-id',context.projectId);
      xhr.setRequestHeader('content-type','application/octet-stream');
      xhr.responseType='json';
      const progress=$('handover-upload-progress');progress.hidden=false;progress.max=file.size;progress.value=0;
      $('handover-transfer-status').textContent='Uploading '+file.name+' · '+bytes(file.size);
      xhr.upload.onprogress=event=>{if(same(context)){progress.value=event.loaded;$('handover-transfer-status').textContent='Uploaded '+bytes(event.loaded)+' of '+bytes(file.size);}};
      const finish=()=>{if(upload===xhr)upload=null;enable();};
      xhr.onload=()=>{
        finish();
        const bound=xhr.getResponseHeader('x-fred-project-id');
        if(bound && bound!==context.projectId)return reject(new Error('The upload response belongs to another original project.'));
        const value=xhr.response;
        if(xhr.status<200||xhr.status>=300)return reject(Object.assign(new Error(value?.message||'The original upload needs continuation.'),{status:xhr.status,code:value?.code}));
        resolve(value);
      };
      xhr.onerror=()=>{finish();reject(new Error('Upload interrupted. The same operation is retained; reopen it before continuing.'));};
      xhr.onabort=()=>{finish();reject(new Error('Upload cancelled. Its saved operation remains available for continuation.'));};
      xhr.send(file);
    });
  }
  async function uploadArchive(retryId=null) {
    const file=$('handover-archive-file').files[0];
    if(!file)throw new Error('Choose the complete original handover archive.');
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_ARCHIVE)throw new Error('The complete archive must fit the supported '+bytes(MAX_ARCHIVE)+'.');
    const context=scope(),identity=fileIdentity(file),previous=recall('upload');
    let id=retryId;
    if(id && previous?.id===id && !sameFile(identity,previous.file))
      throw new Error('Choose the same original file to continue this upload.');
    if(!id && previous?.id && sameFile(identity,previous.file)) {
      try{
        const saved=validStatus(await api('/api/operating-handover?'+new URLSearchParams({id:previous.id}),undefined,context.projectId),previous.id);
        if(!same(context))return;
        if(saved.retryAction==='upload')id=previous.id;
        else {selected=saved.id;renderStatus(saved);await refreshList();return;}
      }catch(error){if(error.status!==404&&error.code!=='ENOENT')throw error;id=previous.id;}
    }
    id??=freshId('receiving');
    remember('upload',{id,file:identity});selectOperation(id);
    try {
      const value=await streamUpload(id,file,context);
      if(!same(context))return;
      $('handover-transfer-status').textContent='Complete upload retained. Inspecting the original source.';
      renderStatus(validStatus(value,id));await refreshList();
    }catch(error){
      if(same(context)){
        $('handover-transfer-status').textContent=error.message;
        await loadStatus(id).catch(()=>{});
      }
      throw error;
    }
  }
  async function continueOperation() {
    const id=selected,action=boundStatus()?.retryAction,context=scope();detailRead++;
    if(!id||!['export','upload','inspect','receive'].includes(action))throw new Error('Open a saved operation that can continue.');
    if(action==='upload')return uploadArchive(id);
    const result=await api('/api/operating-handover/'+action,{id},context.projectId);
    if(same(context)&&selected===id)renderStatus(validStatus(result,id));
  }
  async function receiveProject() {
    if(boundStatus()?.kind!=='IMPORT'||boundStatus()?.state!=='INSPECTED')throw new Error('Open the inspected original handover before receiving it.');
    const id=selected,context=scope();detailRead++;
    const result=await api('/api/operating-handover/receive',{id},context.projectId);
    if(same(context)&&selected===id)renderStatus(validStatus(result,id));
  }
  async function openProject() {
    if(boundStatus()?.state!=='COMPLETE'||!boundStatus()?.result?.projectDirectory)throw new Error('Open the completed original receiving operation first.');
    const id=selected,context=scope();
    const result=await api('/api/operating-handover/open',{id},context.projectId);
    if(!same(context)||id!==selected)return;
    if(result.projectId!==projectId||result.id!==id||typeof result.startup?.url!=='string'||
        result.startup.binding?.projectId!==current?.result?.sourceProject?.id)throw new Error('The received workspace binding is incomplete.');
    const url=new URL(result.startup.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('The received workspace URL is invalid.');
    location.assign(url.href);
  }
  function sections() {
    if(!source)return [];
    return [['history','Project history',source.history],
      ...Object.entries(source.inventory||{}).map(([key,value])=>['inventory:'+key,key,Array.isArray(value)?value:[value]]),
      ['publications','Current publications',source.published],['evidence','Original result references',source.evidence]]
      .map(([id,label,rows])=>({id,label,rows:Array.isArray(rows)?rows:[]}));
  }
  function renderSourceRows() {
    const section=sections().find(item=>item.id===$('handover-source-section').value),root=$('handover-source-rows');
    root.replaceChildren();if(!section)return;
    const table=document.createElement('table'),body=document.createElement('tbody');
    const rows=section.rows.slice(sourceOffset,sourceOffset+SOURCE_PAGE);
    for(let i=0;i<rows.length;i++){
      const row=rows[i],tr=document.createElement('tr'),index=document.createElement('td'),value=document.createElement('td');
      index.textContent=String(sourceOffset+i+1);
      const label=typeof row==='object'&&row ? row.title||row.id||row.name||(row.revision?'Revision '+row.revision:section.label) : String(row);
      detail(value,String(label),row);tr.append(index,value);body.append(tr);
    }
    table.append(body);root.append(table);
    $('handover-source-position').textContent=section.rows.length?(sourceOffset+1)+'–'+(sourceOffset+rows.length)+' of '+section.rows.length:'0 rows';
    $('handover-source-prev').disabled=sourceOffset===0;
    $('handover-source-next').disabled=sourceOffset+SOURCE_PAGE>=section.rows.length;
  }
  function renderPlan() {
    const summary=$('handover-plan-summary'),steps=$('handover-plan-steps');summary.replaceChildren();steps.replaceChildren();
    if(!plan)return;
    const revision=plan.revisions.find(item=>String(item.revision)===$('handover-plan-revision').value)||plan.revisions.at(-1);
    const title=document.createElement('h5');title.textContent=revision.title;summary.append(title);
    for(const name of ['customer','purpose','period','owner','receiving','notes'])if(revision[name])paragraph(summary,name+': '+revision[name]);
    for(const step of revision.steps) {
      const node=document.createElement('details'),heading=document.createElement('summary');
      heading.textContent=step.title+' · '+step.status;node.append(heading);
      for(const name of ['instruction','inputs','expectedResult','owner','due','recordedResult'])if(step[name])paragraph(node,name+': '+step[name]);
      if(step.argv?.length)detail(node,'Original command arguments',step.argv);
      if(step.selection)detail(node,'Retained command registration',step.selection);
      if(step.files?.length)detail(node,'Carried file inventory',step.files.map(({content,...file})=>file));
      steps.append(node);
    }
  }
  async function reviewSource() {
    if(!boundStatus()?.result?.sourceId)throw new Error('Open the original handover source first.');
    const context=scope(),id=selected,ticket=++sourceRead;
    const [descriptor,received]=await Promise.all([
      api('/api/operating-handover/source?'+new URLSearchParams({id}),undefined,context.projectId),
      api('/api/operating-handover/plan?'+new URLSearchParams({id}),undefined,context.projectId)]);
    if(!same(context)||selected!==id||ticket!==sourceRead)return;
    if(descriptor?.schema!=='stellar-forge.fred-operating-source.v1'||descriptor.id!==current?.result?.sourceId||
        received?.projectId!==projectId||received.id!==id)throw new Error('The original handover source or plan identity changed.');
    if(received.plan!==null && (!Array.isArray(received.plan?.revisions)||!received.plan.revisions.length))
      throw new Error('The complete original plan revision history is missing.');
    source=descriptor;plan=received.plan;sourceOffset=0;
    const root=$('handover-source-summary');root.replaceChildren();
    paragraph(root,source.project.title+' · project revision '+source.project.revision+' · captured '+source.capturedAt);
    detail(root,'Original economic selection',source.project.selection);
    const selector=$('handover-source-section');selector.replaceChildren();
    for(const section of sections()){const option=document.createElement('option');option.value=section.id;option.textContent=section.label+' · '+section.rows.length;selector.append(option);}
    const revisions=$('handover-plan-revision');revisions.replaceChildren();
    if(plan)for(const revision of plan.revisions){const option=document.createElement('option');option.value=String(revision.revision);option.textContent='Revision '+revision.revision+' · '+revision.savedAt;revisions.append(option);}
    if(plan)revisions.value=String(plan.revisions.at(-1).revision);
    $('handover-plan-status').textContent=plan?'All '+plan.revisions.length+' saved plan revisions are retained. Download the complete editable plan to continue in Operating plans.':'This archive carries the complete source without an operating plan.';
    $('handover-source-panel').hidden=false;renderSourceRows();renderPlan();enable();
  }
  async function receivePlanFile() {
    const ticket=++planRead,file=$('handover-plan-file').files[0];planChoiceVersion++;planFile=file||null;planValue=null;enable();
    if(!file){$('handover-plan-file-status').textContent='The archive will carry the complete economic source.';return;}
    if(file.size>MAX_PLAN)throw new Error('Choose a complete operating plan up to 32 MiB.');
    const raw=await file.text();
    if(ticket!==planRead||file!==planFile)return;
    const value=JSON.parse(raw);
    if(value?.schema!=='stellar-forge.operating-plan.v1'||!Array.isArray(value.revisions)||!value.revisions.length)
      throw new Error('Choose the complete original operating plan with all revisions.');
    planValue=value;$('handover-plan-mode').value='file';
    $('handover-plan-file-status').textContent=value.revisions.at(-1).title+' · '+value.revisions.length+' saved revisions. Original source binding will be checked.';
    enable();
  }
  function onState() {
    const id=getState()?.id;
    if(id!==projectId){
      generation++;listRead++;detailRead++;sourceRead++;planRead++;retainedPlanRead++;stopPoll();if(upload)upload.abort();
      projectId=id||null;selected=projectId?recall('selected'):null;current=null;listing=null;offset=0;
      planFile=null;planValue=null;retainedPlan=null;retainedPlanLoaded=false;$('handover-plan-mode').value='retained';$('handover-retained-plan-status').textContent='Opening retained customer plan…';$('handover-plan-file').value='';$('handover-archive-file').value='';
      $('handover-plan-file-status').textContent='';$('handover-selected').hidden=true;$('handover-list').replaceChildren();
      $('handover-transfer-status').textContent='';$('handover-upload-progress').hidden=true;clearSource();
    }
    enable();
  }
  async function onOpen(){onState();await Promise.all([refreshList(),readRetainedPlan({chooseDefault:!retainedPlanLoaded})]);}
  for(const [id,fn] of [['handover-refresh',refreshList],['handover-export',prepareExport],['handover-upload',()=>uploadArchive()],
    ['handover-download',downloadArchive],['handover-source',reviewSource],['handover-receive',receiveProject],['handover-open',openProject],['handover-retry',continueOperation]])
    $(id).addEventListener('click',()=>act(fn));
  $('handover-cancel-upload').addEventListener('click',()=>upload?.abort());
  $('handover-plan-file').addEventListener('change',()=>receivePlanFile().catch(error=>{ $('handover-plan-file-status').textContent=error.message;message(error.message,true);enable();}));
  $('handover-archive-file').addEventListener('change',enable);
  $('handover-plan-mode').addEventListener('change',()=>{planChoiceVersion++;enable();});
  $('handover-list-prev').addEventListener('click',()=>act(async()=>{offset=Math.max(0,offset-PAGE);await refreshList();}));
  $('handover-list-next').addEventListener('click',()=>act(async()=>{if(listing?.nextOffset!=null)offset=listing.nextOffset;await refreshList();}));
  $('handover-source-section').addEventListener('change',()=>{sourceOffset=0;renderSourceRows();});
  $('handover-source-prev').addEventListener('click',()=>{sourceOffset=Math.max(0,sourceOffset-SOURCE_PAGE);renderSourceRows();});
  $('handover-source-next').addEventListener('click',()=>{sourceOffset+=SOURCE_PAGE;renderSourceRows();});
  $('handover-plan-revision').addEventListener('change',renderPlan);
  $('handover-source-save').addEventListener('click',()=>{if(source)saveJson(source,'economic-operating-source.json');});
  $('handover-plan-save').addEventListener('click',()=>{if(plan)saveJson(plan,'economic-operating-plan.json');});
  document.addEventListener('visibilitychange',()=>{if(visible())schedule();else stopPoll();});
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.tab!=='recovery')stopPoll();}));
  window.addEventListener('pagehide',()=>{stopPoll();if(upload)upload.abort();});
  enable();
  return Object.freeze({onState,onOpen});
}
