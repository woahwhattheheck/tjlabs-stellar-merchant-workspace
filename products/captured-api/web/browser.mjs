// MIT. Saved original handover drafts, complete transfer and receiving browser.
const $=id=>document.getElementById(id);
const token=location.hash.slice(1),API='/api/captured-handover/';
const UUID=()=>crypto.randomUUID(),HASH=/^[a-f0-9]{64}$/;
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const amount=value=>Number(value??0).toLocaleString();
const size=value=>{const n=Number(value??0);return n>=1073741824?(n/1073741824).toFixed(2)+' GiB':n>=1048576?(n/1048576).toFixed(2)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' bytes';};
const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').classList.toggle('error',error);};
let info,storagePrefix,tab,editor,form,job,inventory,upload,pollTimer,busy=false;
let libraryKind='drafts',libraryOffset=0,inventoryOffset=0,documentView='summary',documentOffset=0;
let libraryGeneration=0,documentGeneration=0,editorMode='WORKING';
const local=(key,value)=>{
  if(value===undefined) {const text=localStorage.getItem(storagePrefix+key);return text?JSON.parse(text):null;}
  try{localStorage.setItem(storagePrefix+key,JSON.stringify(value));}
  catch{throw new Error('The browser could not retain this request. Resolve saved pending requests or free browser storage before sending it.');}
};
const forget=key=>localStorage.removeItem(storagePrefix+key);
function pendingRows() {
  const rows=[];
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);
    if(key?.startsWith(storagePrefix+'pending:')) {
      const value=JSON.parse(localStorage.getItem(key));rows.push({...value,key:key.slice(storagePrefix.length)});
    }
  }
  return rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
const workingKey=(id,revision)=>'working:'+tab+':'+id+':'+revision;
const workingPointer=id=>'working:'+tab+':'+id;
function retainWorking(value) {
  local(workingKey(value.id,value.revision),value);
  local(workingPointer(value.id),{revision:value.revision});
}
function workingForm(id,revision) {
  revision??=local(workingPointer(id))?.revision;
  return revision?local(workingKey(id,revision)):null;
}
function persistEditor() {
  if(!editor||!form)return;
  const value={id:editor.id,revision:editor.revision,form:clone(form),
    jobId:job?.id??null,mode:editorMode,dirty:!savedForm()};
  // Every selected base owns its working form. Saved history views never
  // replace that edit, even when another draft becomes the current page.
  if(editorMode==='WORKING')retainWorking(value);
  local('editor:'+tab,value);
}
function setLocation() {
  const url=new URL(location.href);url.searchParams.delete('draft');url.searchParams.delete('job');
  if(editor)url.searchParams.set('draft',editor.id);
  if(job)url.searchParams.set('job',job.id);
  history.replaceState(null,'',url);
}
async function api(path,body,{raw=false,bodyText}={}) {
  const response=await fetch(API+path,{
    method:body===undefined&&bodyText===undefined?'GET':'POST',
    credentials:'same-origin',headers:{'x-workspace-token':token,
      ...(body===undefined&&bodyText===undefined?{}:{'content-type':raw?'application/octet-stream':'application/json'})},
    ...(body===undefined&&bodyText===undefined?{}:{body:raw?body:bodyText??JSON.stringify(body)}),
  });
  let value;
  try{value=await response.json();}
  catch{throw Object.assign(new Error('The original workspace reply was interrupted. Continue the saved request.'),{outcomeUnknown:true});}
  if(!response.ok)throw Object.assign(new Error(value.error??'The original workspace request failed.'),{
    status:response.status,code:value.code,outcomeUnknown:value.outcomeUnknown===true,
  });
  return value;
}
function button(label,action,{locked=false}={}) {
  const node=make('button',label);node.type='button';node.dataset.locked=String(locked);node.disabled=busy||locked;
  node.addEventListener('click',()=>act(action));return node;
}
function lazyDetails(label,value) {
  const node=make('details'),summary=make('summary',label);node.append(summary);
  node.addEventListener('toggle',()=>{if(node.open&&node.childElementCount===1)node.append(make('pre',JSON.stringify(value,null,2)));});
  return node;
}
function table(headers) {
  const element=make('table'),head=make('thead'),tr=make('tr'),body=make('tbody');
  for(const label of headers)tr.append(make('th',label));head.append(tr);element.append(head,body);
  return {element,body};
}
function paging(target,{offset,total,limit},move) {
  target.replaceChildren();if(!total)return;
  target.append(make('span',(offset+1)+'–'+Math.min(offset+limit,total)+' of '+amount(total)));
  if(offset>0)target.append(button('Previous',()=>move(Math.max(0,offset-limit))));
  if(offset+limit<total)target.append(button('Next',()=>move(offset+limit)));
}
function lock(id,condition) {$(id).dataset.locked=String(condition);}
function savedForm() {return editor?.edition&&form&&canonical(form)===canonical(editor.edition.form);}
function controls() {
  lock('save-draft',!editor||editorMode==='HISTORY'||savedForm());
  lock('prepare',!editor||editor.kind!=='OUTGOING'||!savedForm()||!form.packages.length&&!form.sources.length);
  lock('inspect',!editor||editor.kind!=='RECEIVING'||!savedForm()||!form.bundle);
  lock('review-receiving',!editor||editor.kind!=='RECEIVING'||!savedForm()||!form.bundle||!HASH.test(form.manifestSha256));
  lock('upload',!$('archive-file').files[0]);
  lock('import-upload',upload?.state!=='COMPLETE');
  for(const node of document.querySelectorAll('button'))node.disabled=busy||node.dataset.locked==='true';
  for(const node of document.querySelectorAll('input,select'))node.disabled=busy||node.dataset.locked==='true'||
    editorMode==='HISTORY'&&(node.dataset.editField==='true'||['draft-label','bundle-directory','bundle-sha'].includes(node.id));
  document.body.classList.toggle('busy',busy);
}
async function act(work) {
  if(busy)return;
  busy=true;controls();
  try{return await work();}
  catch(error){notice(error.message,true);}
  finally{busy=false;renderPending();controls();}
}
async function retain(path,body,apply) {
  const requestId=body.requestId??body.id??UUID(),key='pending:'+encodeURIComponent(path)+':'+requestId;
  const bodyText=JSON.stringify(body),old=local(key);
  if(old&&old.bodyText!==bodyText)throw new Error('This saved request already owns different selected fields.');
  const pending=old??{path,bodyText,tab,createdAt:new Date().toISOString()};
  local(key,pending);renderPending();
  try {
    const result=await api(path,undefined,{bodyText:pending.bodyText});
    if(apply)await apply(result,JSON.parse(pending.bodyText));
    forget(key);renderPending();return result;
  } catch(error) {
    local(key,{...pending,error:{message:error.message,code:error.code,status:error.status,outcomeUnknown:error.outcomeUnknown}});
    renderPending();throw error;
  }
}
async function replayPending(row) {
  return retain(row.path,JSON.parse(row.bodyText),async(result,request)=>{
    if(row.path==='draft/create') {
      if(!editor||editor.id===result.id)adoptEditor(result);
    } else if(row.path==='draft/save') {
      if(!editor||editor.id===result.id) {
        const keep=editor&&form?clone(form):null;
        adoptEditor(result,keep&&canonical(keep)!==canonical(request.form)?keep:null);
      }
    } else if(row.path==='jobs/start'||row.path==='jobs/resume')await adoptJob(result);
    else if(row.path.startsWith('uploads/')){upload=result;renderUpload();}
    await refreshLibrary();notice('The original saved request has been continued.');
  });
}
function renderPending() {
  if(!storagePrefix)return;
  const rows=pendingRows();$('pending-section').hidden=!rows.length;$('pending-list').replaceChildren();
  for(const row of rows) {
    const card=make('div',undefined,'row-card'),request=JSON.parse(row.bodyText);
    card.append(make('strong',row.path.startsWith('draft/')?'Draft '+(request.form?.label??request.kind??'save'):
      row.path.startsWith('uploads/')?'File '+(request.name??request.id):request.command??'Continue original operation'));
    card.append(make('p',row.error?.message??'The original request is retained while its reply completes.','small'));
    const actions=make('div',undefined,'actions');
    actions.append(button('Continue original request',()=>replayPending(row)));
    if(row.path==='jobs/start'||row.path==='jobs/resume')
      actions.append(button('Open saved operation',()=>openJob(request.id)));
    if(row.error?.status>=400&&row.error.status<500&&!row.error.outcomeUnknown)
      actions.append(button('Keep saved work and release this rejected request',()=>{
        local('rejected:'+row.key,{...row,releasedAt:new Date().toISOString()});forget(row.key);renderPending();
        notice('The rejected browser request was retained in local history. Original server drafts and operations remain available.');
      }));
    card.append(actions,lazyDetails('Selected original fields',request));$('pending-list').append(card);
  }
}
function adoptEditor(value,preservedForm,{historical=false}={}) {
  if(!value.edition)throw new Error('Reopen this original draft to complete its retained first edition.');
  persistEditor();
  const retained=historical?null:workingForm(value.id,value.revision);
  editor=value;editorMode=historical?'HISTORY':'WORKING';
  form=preservedForm??(retained?clone(retained.form):clone(value.edition.form));inventoryOffset=0;
  persistEditor();setLocation();renderEditor();
}
async function openDraft(id,revision,{keepLocal=true,historical=Boolean(revision)}={}) {
  persistEditor();
  const working=!historical&&keepLocal?workingForm(id,revision):null;
  const selectedRevision=revision??(working?.dirty?working.revision:undefined);
  const value=await api('draft?'+new URLSearchParams({id,...(selectedRevision?{revision:selectedRevision}:{})}));
  const retained=!historical&&keepLocal?workingForm(id,value.revision):null;
  adoptEditor(value,retained?.form,{historical});
  if(value.kind==='OUTGOING'&&!inventory)await loadInventory();
}
async function newDraft(kind,initial) {
  const label=initial?.label??(kind==='OUTGOING'?'Merchant collection':'Received merchant collection');
  const prior=pendingRows().filter(row=>row.path==='draft/create'&&row.tab===tab)
    .map(row=>JSON.parse(row.bodyText)).find(row=>row.kind===kind&&row.label===label);
  const request=prior??{id:UUID(),kind,label};
  await retain('draft/create',request,value=>{
    adoptEditor(value);if(initial){form={...clone(form),...initial};persistEditor();renderEditor();}
  });
  await refreshLibrary();if(kind==='OUTGOING'&&!inventory)await loadInventory();
}
async function saveDraft() {
  if(!editor)throw new Error('Open a draft first.');
  if(editorMode==='HISTORY')throw new Error('Open the retained working form before saving an edit.');
  const originalForm=clone(form);
  const prior=pendingRows().filter(row=>row.path==='draft/save')
    .map(row=>JSON.parse(row.bodyText)).find(row=>row.id===editor.id&&row.expectedRevision===editor.revision);
  if(prior&&canonical(prior.form)!==canonical(originalForm))
    throw new Error('Continue the retained original save before saving the newer working form. Your current form is retained.');
  const request=prior??{id:editor.id,requestId:UUID(),expectedRevision:editor.revision,form:originalForm};
  try {
    await retain('draft/save',request,value=>adoptEditor(value));
    await refreshLibrary();notice('The complete draft edition is saved.');
  } catch(error) {
    if(error.code==='CAPTURED_DESK_DRAFT_CHANGED')await showCurrentDraft();
    throw error;
  }
}
async function showCurrentDraft() {
  if(!editor)return;
  const selectedId=editor.id,current=await api('draft?'+new URLSearchParams({id:selectedId}));
  if(editor?.id!==selectedId)return;
  const area=$('draft-conflict');area.hidden=false;area.replaceChildren(
    make('strong','A different saved edition is current.'),
    make('p','Your working form is still here. Compare the saved edition, then open it or make a new save from your current form.'),
    lazyDetails('Current saved edition '+current.edition.sequence,current.edition.form));
  const actions=make('div',undefined,'actions');
  actions.append(button('Open current saved edition',()=>adoptEditor(current,undefined,{historical:true})));
  actions.append(button('Keep my form for a new save',()=>{
    const uncertain=pendingRows().filter(row=>row.path==='draft/save'&&JSON.parse(row.bodyText).id===selectedId);
    if(uncertain.some(row=>row.error?.code!=='CAPTURED_DESK_DRAFT_CHANGED'))
      throw new Error('Continue the retained original save before changing its selected base.');
    for(const row of uncertain){local('rejected:'+row.key,{...row,releasedAt:new Date().toISOString()});forget(row.key);}
    adoptEditor(current,clone(form));renderPending();
    notice('Your form now has the displayed current edition as its base. Save it as a new edition.');
  }));area.append(actions);
}
function updateForm(key,value) {
  if(!form||editorMode==='HISTORY')return;form[key]=value;persistEditor();renderDraftMeta();controls();
}
function renderDraftMeta() {
  if(!editor)return;
  $('draft-meta').textContent='Draft '+editor.id+' · selected edition '+editor.edition.sequence+
    ' · '+(editorMode==='HISTORY'?'Viewing original saved fields':savedForm()?'Saved selected fields':'Working form has unsaved changes')+
    ' · SHA-256 '+editor.revision;
  $('draft-heading').textContent=form.label;
  if(editor.kind==='OUTGOING')$('selection-summary').textContent=amount(form.packages.length)+' merchants and '+
    amount(form.sources.length)+' explicit sources selected. Each merchant also carries its original captured source and reviews.';
}
function renderEditor() {
  $('draft-section').hidden=!editor;$('welcome').hidden=Boolean(editor);
  if(!editor)return;
  $('draft-kind').textContent=editor.kind==='OUTGOING'?'OUTGOING COLLECTION':'RECEIVING COLLECTION';
  $('draft-label').value=form.label;$('outgoing-form').hidden=editor.kind!=='OUTGOING';$('receiving-form').hidden=editor.kind!=='RECEIVING';
  $('draft-history').replaceChildren();
  for(const row of [...editor.history].reverse()) {
    const retained=workingForm(editor.id,row.revision);
    const option=make('option','Edition '+row.sequence+' · '+row.createdAt+
      (retained?.dirty?' · retained working edit':''));option.value=row.revision;
    option.selected=row.revision===editor.revision;$('draft-history').append(option);
  }
  $('draft-conflict').hidden=editorMode!=='HISTORY'&&editor.revision===editor.currentRevision;
  if(editorMode==='HISTORY') {
    const selected=editor;
    $('draft-conflict').replaceChildren(make('p','Viewing an original saved edition. Each working form is retained separately with its selected base.'));
    $('draft-conflict').append(button('Open retained working form',()=>openDraft(selected.id,undefined,{historical:false})),
      button('Work from this edition',()=>adoptEditor(selected)));
    if(editor.revision!==editor.currentRevision)$('draft-conflict').append(button('Compare current edition',showCurrentDraft));
  } else if(editor.revision!==editor.currentRevision) {
    $('draft-conflict').replaceChildren(make('p','This working form keeps its original saved base. Compare the current edition before making a new save.'));
    $('draft-conflict').append(button('Compare current edition',showCurrentDraft));
  }
  if(editor.kind==='OUTGOING')renderInventory();
  else {$('bundle-directory').value=form.bundle;$('bundle-sha').value=form.manifestSha256;renderMapping();}
  renderDraftMeta();controls();
}
async function loadInventory() {
  const original=await api('inventory');inventory=original;renderInventory();
  notice('Original saved merchant and captured-source inventory refreshed. Existing selections keep their saved identities.');
}
const sourceKey=row=>row.kind+':'+row.id+':'+(row.revision??'');
function renderInventory() {
  const target=$('inventory');target.replaceChildren();$('inventory-page').replaceChildren();
  if(!editor||editor.kind!=='OUTGOING')return;
  const kind=$('inventory-kind').value,filter=$('inventory-filter').value.trim().toLowerCase();
  let rows;
  if(kind==='selected')rows=[
    ...form.packages.map(row=>({kind:'package',...(typeof row==='string'?{name:row}:row),selected:true})),
    ...form.sources.map(row=>({kind:'source',selection:row,selected:true})),
  ];
  else if(!inventory){target.append(make('p','Open the original inventory to choose saved members.','empty'));return;}
  else rows=(inventory[kind]??[]).map(row=>({kind:kind==='packages'?'package':'source',...row}));
  rows=rows.filter(row=>!filter||canonical(row).toLowerCase().includes(filter));
  const page=rows.slice(inventoryOffset,inventoryOffset+25),grid=table(['Select','Original member','Identity and retained scope']);
  for(const row of page) {
    const tr=make('tr'),checkCell=make('td'),labelCell=make('td'),detailCell=make('td'),check=make('input');
    check.type='checkbox';check.dataset.editField='true';
    const selected=row.kind==='package'?form.packages.find(value=>(typeof value==='string'?value:value.name)===row.name):
      form.sources.find(value=>sourceKey(value)===sourceKey(row.selection));
    check.checked=Boolean(selected);check.dataset.locked=String(row.available===false);check.disabled=busy||row.available===false;
    check.setAttribute('aria-label','Include '+(row.name??row.label??row.selection?.id));
    check.addEventListener('change',()=>{
      if(row.kind==='package') {
        form.packages=form.packages.filter(value=>(typeof value==='string'?value:value.name)!==row.name);
        if(check.checked)form.packages.push({name:row.name,...(row.manifestSha256?{manifestSha256:row.manifestSha256}:{})});
      } else {
        form.sources=form.sources.filter(value=>sourceKey(value)!==sourceKey(row.selection));
        if(check.checked)form.sources.push(clone(row.selection));
      }
      persistEditor();renderDraftMeta();controls();if(kind==='selected')renderInventory();
    });
    checkCell.append(check);
    if(row.kind==='package') {
      labelCell.append(make('strong',row.title??row.name),make('span',row.name,'small'));
      detailCell.append(make('code',selected?.manifestSha256??row.manifestSha256??'Original manifest resolved at preparation'));
      if(row.routes!==undefined)detailCell.append(make('span',row.routes+' routes','small'));
      if(selected?.manifestSha256&&row.manifestSha256&&selected.manifestSha256!==row.manifestSha256)
        detailCell.append(make('p','Selection keeps an earlier manifest. Remove and select again to choose the refreshed merchant.','selected-note'));
    } else {
      labelCell.append(make('strong',row.label??row.selection.kind+' source'),
        make('span',row.selection.kind+' · complete capture and saved review history','small'));
      detailCell.append(make('code',row.selection.id));
      if(row.sourceBytes!==undefined)detailCell.append(make('span',size(row.sourceBytes),'small'));
      if(row.available===false)detailCell.append(make('span',row.error,'small'));
      if(kind==='selected') {
        const revision=make('input');revision.dataset.editField='true';revision.value=row.selection.revision??'';revision.maxLength=64;
        revision.placeholder='Optional required original review SHA-256';revision.setAttribute('aria-label','Required review for '+row.selection.id);
        revision.addEventListener('change',()=>{
          const index=form.sources.findIndex(value=>sourceKey(value)===sourceKey(row.selection));
          if(index<0)return;
          const next={kind:row.selection.kind,id:row.selection.id,...(revision.value.trim()?{revision:revision.value.trim()}:{})};
          form.sources[index]=next;row.selection=next;persistEditor();renderDraftMeta();controls();
        });detailCell.append(revision);
      }
    }
    tr.append(checkCell,labelCell,detailCell);grid.body.append(tr);
  }
  target.append(page.length?grid.element:make('p','No original members match this view.','empty'));
  paging($('inventory-page'),{offset:inventoryOffset,total:rows.length,limit:25},offset=>{inventoryOffset=offset;renderInventory();});
  controls();
}
function renderMapping() {
  const target=$('mapping');target.replaceChildren();if(!form?.names)return;
  const entries=Object.entries(form.names);
  if(!entries.length){target.append(make('p','No merchant names have been selected from an inspected collection. Source-only collections need no name mapping.','empty'));return;}
  const grid=table(['Original merchant','Receiving name']);
  for(const [name,targetName] of entries) {
    const tr=make('tr'),cell=make('td'),input=make('input');input.dataset.editField='true';input.value=targetName;input.maxLength=64;
    input.setAttribute('aria-label','Receiving name for '+name);
    input.addEventListener('input',()=>{form.names[name]=input.value;persistEditor();renderDraftMeta();controls();});
    tr.append(make('td',name));cell.append(input);tr.append(cell);grid.body.append(tr);
  }
  target.append(grid.element);
}
async function startCommand(command,selection) {
  const desired={command,...selection};
  const prior=pendingRows().filter(row=>row.path==='jobs/start'&&row.tab===tab)
    .map(row=>JSON.parse(row.bodyText)).find(({id,...row})=>canonical(row)===canonical(desired));
  const request=prior??{id:UUID(),...desired};
  return retain('jobs/start',request,adoptJob);
}
async function runDraft(command) {
  if(!savedForm())throw new Error('Save this complete draft edition before running its original operation.');
  await startCommand(command,{draftId:editor.id,revision:editor.revision});await refreshLibrary();
}
async function adoptJob(value) {
  clearTimeout(pollTimer);job=value;documentView='summary';documentOffset=0;setLocation();persistEditor();
  renderJob();if(job.state==='COMPLETE')await loadDocument();else schedulePoll();
}
async function openJob(id) {await adoptJob(await api('job?'+new URLSearchParams({id})));$('job-section').scrollIntoView({block:'start',behavior:'smooth'});}
function schedulePoll() {
  if(!job||job.state!=='RUNNING')return;
  const original=job.id;
  pollTimer=setTimeout(async()=>{
    if(job?.id!==original)return;
    try {
      const value=await api('job?'+new URLSearchParams({id:original}));
      if(job?.id!==original)return;
      job=value;renderJob();
      if(job.state==='COMPLETE'){await loadDocument();await refreshLibrary();notice('The original '+job.command.toLowerCase()+' operation completed.');}
      else schedulePoll();
    } catch(error) {
      if(job?.id!==original)return;
      notice(error.message,true);schedulePoll();
    }
  },3000);
}
function nativeLinks(value) {
  const area=make('div',undefined,'actions');
  for(const row of value.packages??[]) {
    const name=row.targetName??row.name;
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name??''))continue;
    const link=make('a','Open '+name);link.href='/?package='+encodeURIComponent(name)+'#'+token;area.append(link);
  }
  return area;
}
function renderJob() {
  $('job-section').hidden=!job;if(!job)return;
  $('job-heading').textContent=({PREPARE:'Prepare outgoing collection',PUBLISH:'Published collection',
    IMPORT:'Inspect uploaded handover',INSPECT:'Inspect retained collection',REVIEW:'Receiving review',
    RECEIVE:'Receive complete collection',REOPEN:'Reopen received collection'})[job.command]??job.command;
  $('job-state').textContent=job.state;
  $('job-meta').textContent=job.id+' · '+job.createdAt+' · original request SHA-256 '+job.requestSha256+
    (job.selected?.draftId?' · draft '+job.selected.draftId+' / '+job.selected.revision:'');
  $('job-error').hidden=!job.error;$('job-error').textContent=job.error?.message??'';
  const actions=$('job-actions');actions.replaceChildren();$('job-result').replaceChildren();
  if(job.state==='PENDING'||job.state==='INTERRUPTED') {
    const original=job;
    actions.append(button('Continue this original operation',()=>retain('jobs/resume',{
      id:original.id,requestSha256:original.requestSha256},adoptJob)));
  }
  if(job.selected?.draftId)actions.append(button('Open selected saved draft',()=>openDraft(job.selected.draftId,job.selected.revision)));
  if(job.state==='COMPLETE') {
    const original=job;
    if(job.command==='PREPARE')actions.append(button('Publish and create complete file',()=>startCommand('PUBLISH',{
      sourceJob:original.id,reviewSha256:original.result.reviewSha256})));
    if(job.command==='PUBLISH')actions.append(button('Download complete handover',()=>download(original.id)));
    if(['INSPECT','IMPORT'].includes(job.command))actions.append(button('Use this collection for receiving',()=>useCollection(original)));
    if(job.command==='REVIEW') {
      const summary=make('p',job.result.state==='READY'?'The original source and receiving names are ready.':
        'Resolve the named conflicts in the saved receiving draft, then review its new edition.');
      $('job-result').append(summary);
      const grid=table(['Original member','Receiving state','Details']);
      for(const row of [...job.result.packages,...job.result.sources]) {
        const tr=make('tr');tr.append(make('td',row.name??row.selection?.kind+' '+row.selection?.id),
          make('td',row.state),make('td',row.targetName??row.error?.message??'Original source and review history'));
        if(row.error)tr.lastChild.append(make('p',row.error.message,'small'));grid.body.append(tr);
      }
      $('job-result').append(grid.element);
      actions.append(button('Receive this reviewed collection',()=>startCommand('RECEIVE',{
        sourceJob:original.id,reviewSha256:original.result.reviewSha256}),{locked:job.result.state!=='READY'}));
    }
    if(['RECEIVE','REOPEN'].includes(job.command)) {
      $('job-result').append(make('p',job.result.state==='RECEIVED'?
        'The complete native collection is received. Its merchant packages and captured sources are available in this product.':
        'The original receiving operation has retained unfinished members. Continue its original Receive operation.'),
        nativeLinks(job.result),lazyDetails('Received source and package records',job.result));
      if(job.result.operationId)actions.append(button('Reopen and inspect received merchants',()=>startCommand('REOPEN',{operationId:original.result.operationId})));
    }
    if(job.command==='PUBLISH'&&job.result.archive) {
      $('job-result').append(make('p',size(job.result.archive.bytes)+' complete handover file'),
        make('p','File SHA-256 '+job.result.archive.sha256,'small wrap'));
    }
  }
  const hasDocument=job.state==='COMPLETE'&&['PREPARE','PUBLISH','IMPORT','INSPECT','REVIEW'].includes(job.command);
  $('document-tabs').hidden=!hasDocument;
  if(!hasDocument){$('document').replaceChildren();$('document-page').replaceChildren();}
  controls();
}
async function loadDocument() {
  if(!job||job.state!=='COMPLETE'||!['PREPARE','PUBLISH','IMPORT','INSPECT','REVIEW'].includes(job.command))return;
  const generation=++documentGeneration,id=job.id,view=documentView;
  const value=await api('document?'+new URLSearchParams({id,view,offset:String(documentOffset),limit:'25'}));
  if(job?.id!==id||generation!==documentGeneration)return;
  const target=$('document');target.replaceChildren();$('document-page').replaceChildren();
  for(const node of $('document-tabs').querySelectorAll('button'))node.classList.toggle('active',node.dataset.document===view);
  const summary=value.summary;
  if(view==='summary') {
    target.append(make('h3',summary.label));
    const stats=make('div',undefined,'stat-grid');
    for(const [label,value] of [['Merchants',amount(summary.packages)],['Captured sources',amount(summary.sources)],
      ['Original files',amount(summary.files)],['Native member bytes',size(summary.totalBytes)]]) {
      const card=make('div',undefined,'stat');card.append(make('strong',value),make('span',label));stats.append(card);
    }
    target.append(stats,make('p','Retained collection '+summary.directory,'small wrap'),
      make('p','Selected document SHA-256 '+summary.sha256,'small wrap'));
    if(job.command==='PREPARE')target.append(make('p','Review the merchant plans, captured histories and complete files using the tabs above. Publishing uses this exact prepared review.','muted'));
    return;
  }
  const grid=table(view==='packages'?['Merchant','Original package and source','Complete files']:
    view==='sources'?['Captured source','Retained review history','Complete files']:['Original file','Size','SHA-256']);
  for(const row of value.rows) {
    const tr=make('tr');
    if(view==='files')tr.append(make('td',row.name),make('td',size(row.bytes)),make('td',row.sha256,'wrap'));
    else if(view==='packages') {
      const detail=make('td');detail.append(make('code',row.package?.manifestSha256??row.package?.id??''),
        make('p',row.capturedSource?row.capturedSource.kind+' '+row.capturedSource.id:'Original merchant source','small wrap'),
        lazyDetails('Package, source and runtime environment',row));
      tr.append(make('td',row.name),detail,make('td',amount(row.files)+' files · '+size(row.totalBytes)));
    } else {
      const name=make('td');name.append(make('strong',row.kind),make('p',row.id,'small wrap'));
      const detail=make('td');detail.append(make('p',amount(row.revisions.length)+' saved reviews'+
        (row.kind==='refresh'?' · '+amount(row.previousRevisions.length)+' prior-edition reviews':'')),
        lazyDetails('Exact review identities and lineage',row));
      tr.append(name,detail,make('td',amount(row.files)+' files · '+size(row.totalBytes)));
    }
    grid.body.append(tr);
  }
  const wrapper=make('div',undefined,'table-wrap');wrapper.append(value.rows.length?grid.element:make('p','This collection has no rows in this view.','empty'));target.append(wrapper);
  paging($('document-page'),value,offset=>{documentOffset=offset;return loadDocument();});
}
async function useCollection(original) {
  const names={},seen=new Set();let offset=0,summary;
  do {
    const value=await api('document?'+new URLSearchParams({id:original.id,view:'packages',offset:String(offset),limit:'100'}));
    summary=value.summary;
    for(const row of value.rows){if(seen.has(row.name))throw new Error('The original collection page repeated.');seen.add(row.name);names[row.name]=row.name;}
    if(value.nextOffset===null)break;
    if(value.nextOffset<=offset)throw new Error('The original collection page did not advance.');
    offset=value.nextOffset;
  }while(true);
  const initial={label:summary.label,bundle:summary.directory,manifestSha256:summary.sha256,names};
  if(editorMode==='WORKING'&&editor?.kind==='RECEIVING'&&form.bundle===summary.directory) {
    initial.names=Object.fromEntries(Object.keys(names).map(name=>[name,form.names[name]??name]));
    form={...form,...initial};persistEditor();renderEditor();
  } else await newDraft('RECEIVING',initial);
  notice('The inspected collection and original names are in the receiving form. Save this edition, then review receiving.');
  $('draft-section').scrollIntoView({block:'start',behavior:'smooth'});
}
async function download(id) {
  const result=await api('download',{id});
  const url=new URL(result.url,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/captured-handover/download/'))
    throw new Error('The original download belongs to another workspace.');
  const anchor=make('a');anchor.href=url.href;anchor.download='';document.body.append(anchor);anchor.click();anchor.remove();
  notice('Downloading the retained complete handover. SHA-256 '+result.sha256);
}
async function refreshLibrary() {
  const generation=++libraryGeneration,kind=libraryKind,offset=libraryOffset;
  const value=await api(kind+'?'+new URLSearchParams({offset:String(offset),limit:'25'}));
  if(generation!==libraryGeneration||kind!==libraryKind)return;
  const area=$('library');area.replaceChildren();
  for(const node of $('library-tabs').querySelectorAll('button'))node.classList.toggle('active',node.dataset.library===kind);
  for(const row of value.rows) {
    const card=make('div',undefined,'row-card');
    if(kind==='drafts') {
      card.append(button(row.label,()=>openDraft(row.id)),make('p',row.kind+' · '+row.createdAt,'small'));
    } else if(kind==='jobs') {
      card.append(button(row.label??row.command,()=>openJob(row.id)),make('p',row.command+' · '+row.state,'small'));
      if(row.error)card.append(make('p',row.error.message,'small'));
    } else if(kind==='uploads') {
      card.append(button(row.name??'Retained file',async()=>{
        upload=await api('uploads/status?'+new URLSearchParams({id:row.id}));renderUpload();$('upload-section').scrollIntoView({block:'start',behavior:'smooth'});
        notice(upload.state==='COMPLETE'?'The complete original file is retained. Inspect it to create a receiving collection.':'Choose the same original file to continue its retained upload.');
      }),make('p',row.state+' · '+size(row.receivedBytes)+' / '+size(row.totalBytes),'small'));
    } else {
      card.append(button((row.names??[]).map(value=>value.targetName).join(', ')||'Captured source collection',
        ()=>startCommand('REOPEN',{operationId:row.operationId})),make('p',row.state,'small'),make('p',row.operationId,'small wrap'));
    }
    area.append(card);
  }
  if(!value.rows.length)area.append(make('p','No saved items in this view.','empty'));
  paging($('library-page'),value,async offset=>{libraryOffset=offset;await refreshLibrary();});
  controls();
}
function renderUpload() {
  $('new-upload').hidden=!upload;$('import-upload').hidden=upload?.state!=='COMPLETE';
  $('upload-progress').max=upload?.totalBytes??1;$('upload-progress').value=upload?.receivedBytes??0;
  $('archive-sha').value=upload?.expectedSha256??$('archive-sha').value;
  $('upload-status').textContent=upload?(upload.name??'Original file')+' · '+upload.state+' · '+
    size(upload.receivedBytes)+' / '+size(upload.totalBytes)+' · '+upload.id+
    (upload.sha256?' · SHA-256 '+upload.sha256:''):'Choose the original complete handover file.';
  controls();
}
async function chunkSha(buffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function importUpload() {
  if(upload?.state!=='COMPLETE')throw new Error('Finish the original complete file upload first.');
  await startCommand('IMPORT',{uploadId:upload.id});await refreshLibrary();
}
async function uploadFile() {
  const selected=$('archive-file').files[0];
  if(!selected)throw new Error('Choose the complete original handover file.');
  if(!upload) {
    const expectedSha256=$('archive-sha').value.trim();
    if(expectedSha256&&!HASH.test(expectedSha256))throw new Error('Use the sender’s full file SHA-256 or leave it empty.');
    const desired={name:selected.name,bytes:selected.size,...(expectedSha256?{expectedSha256}:{})};
    const prior=pendingRows().filter(row=>row.path==='uploads/init'&&row.tab===tab)
      .map(row=>JSON.parse(row.bodyText)).find(({id,...row})=>canonical(row)===canonical(desired));
    const request=prior??{id:UUID(),...desired};
    const priorFile=local('upload:'+request.id);
    if(priorFile&&priorFile.lastModified!==selected.lastModified)
      throw new Error('Choose the original file selected by the pending upload request.');
    local('upload:'+request.id,{...request,lastModified:selected.lastModified});
    await retain('uploads/init',request,value=>{upload=value;renderUpload();});
  } else {
    if(upload.name!==selected.name||upload.totalBytes!==selected.size)
      throw new Error('Choose the same original file name and complete size for this retained upload.');
    const localFile=local('upload:'+upload.id);
    if(localFile&&localFile.lastModified!==selected.lastModified)
      throw new Error('This file has changed since the original upload. Choose the original file or start another upload.');
    upload=await api('uploads/status?'+new URLSearchParams({id:upload.id}));renderUpload();
  }
  while(upload.state!=='COMPLETE'&&(upload.receivedBytes<upload.totalBytes||upload.pendingChunk)) {
    const originalId=upload.id,pending=upload.pendingChunk;
    const offset=pending?.offset??upload.receivedBytes;
    const length=pending?.bytes??Math.min(upload.chunkBytes??1048576,upload.totalBytes-offset);
    const bytes=await selected.slice(offset,offset+length).arrayBuffer(),sha256=await chunkSha(bytes);
    if(bytes.byteLength!==length||pending&&sha256!==pending.sha256)
      throw new Error('The selected file differs from the original retained chunk. Choose the original complete file.');
    upload=await api('uploads/chunk?'+new URLSearchParams({id:originalId,offset:String(offset),sha256}),bytes,{raw:true});
    renderUpload();notice('Retaining original handover file: '+size(upload.receivedBytes)+' / '+size(upload.totalBytes));
  }
  if(upload.state!=='COMPLETE')await retain('uploads/finish',{id:upload.id},value=>{upload=value;renderUpload();});
  await importUpload();
}
async function refreshAll() {
  info=await api('info');$('product-label').textContent=info.product;
  $('product-directory').textContent=info.directory;await refreshLibrary();
  if(job)await adoptJob(await api('job?'+new URLSearchParams({id:job.id})));
  renderPending();notice('Saved original drafts, files and operations refreshed.');
}
$('merchant-link').href='/#'+token;
$('new-outgoing').addEventListener('click',()=>act(()=>newDraft('OUTGOING')));
$('new-receiving').addEventListener('click',()=>act(()=>newDraft('RECEIVING')));
$('refresh').addEventListener('click',()=>act(refreshAll));
$('save-draft').addEventListener('click',()=>act(saveDraft));
$('draft-label').addEventListener('input',()=>updateForm('label',$('draft-label').value));
$('draft-history').addEventListener('change',()=>act(()=>openDraft(editor.id,$('draft-history').value)));
$('bundle-directory').addEventListener('input',()=>updateForm('bundle',$('bundle-directory').value));
$('bundle-sha').addEventListener('input',()=>updateForm('manifestSha256',$('bundle-sha').value.trim()));
$('refresh-inventory').addEventListener('click',()=>act(loadInventory));
$('inventory-kind').addEventListener('change',()=>{inventoryOffset=0;renderInventory();});
$('inventory-filter').addEventListener('input',()=>{inventoryOffset=0;renderInventory();});
$('prepare').addEventListener('click',()=>act(()=>runDraft('PREPARE')));
$('inspect').addEventListener('click',()=>act(()=>runDraft('INSPECT')));
$('review-receiving').addEventListener('click',()=>act(()=>runDraft('REVIEW')));
$('upload').addEventListener('click',()=>act(uploadFile));
$('import-upload').addEventListener('click',()=>act(importUpload));
$('archive-file').addEventListener('change',controls);
$('new-upload').addEventListener('click',()=>act(()=>{upload=null;$('archive-file').value='';$('archive-sha').value='';renderUpload();}));
for(const node of $('library-tabs').querySelectorAll('button'))node.addEventListener('click',()=>act(async()=>{
  libraryKind=node.dataset.library;libraryOffset=0;await refreshLibrary();
}));
for(const node of $('document-tabs').querySelectorAll('button'))node.addEventListener('click',()=>act(async()=>{
  documentView=node.dataset.document;documentOffset=0;await loadDocument();
}));
window.addEventListener('beforeunload',event=>{
  if(busy||editor&&!savedForm()){event.preventDefault();event.returnValue='';}
});
window.addEventListener('storage',event=>{if(storagePrefix&&event.key?.startsWith(storagePrefix+'pending:'))renderPending();});
await act(async()=>{
  if(!token)throw new Error('Open Merchant handover from the complete original product browser URL.');
  info=await api('info');storagePrefix='captured-handover:'+info.productId+':';
  tab=sessionStorage.getItem('captured-handover-tab');
  if(!tab){tab=UUID();sessionStorage.setItem('captured-handover-tab',tab);}
  $('product-label').textContent=info.product;$('product-directory').textContent=info.directory;
  await refreshLibrary();renderPending();
  const retained=local('editor:'+tab),query=new URL(location.href).searchParams;
  if(retained?.form&&retained.mode!=='HISTORY'&&!workingForm(retained.id,retained.revision))
    retainWorking({...retained,mode:'WORKING',dirty:true});
  const draftId=query.get('draft')??retained?.id,jobId=query.get('job')??retained?.jobId;
  if(draftId)await openDraft(draftId,retained?.id===draftId?retained.revision:undefined,{
    keepLocal:true,historical:retained?.id===draftId&&retained.mode==='HISTORY',
  });
  if(jobId)await openJob(jobId);
  renderUpload();notice('The original product is ready. Choose saved work or open a complete handover file.');
});
