// MIT. Original Grist Operating Plans browser. No provider execution or second workspace.
const clone = value => value == null ? value : structuredClone(value);
const $ = id => document.getElementById(id);
const element = (tag, text, className) => { const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(className)e.className=className;return e; };
const json = value => JSON.stringify(value,null,2);
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const uuid = () => crypto.randomUUID();
const sourceKinds = ['documents','discoveries','captures','versions','operations'];
const fields = [['title','Title',300],['customer','Customer',1000],['purpose','Useful outcome',32000],['period','Period or recurrence',1000],['owner','Operating owner',1000],['receiving','Receiving and continuation',32000],['notes','Notes',32000]];
const stepFields = [['title','Step title',300],['instruction','Work to perform',32000],['inputs','Inputs',32000],['expectedResult','Expected result',32000],['owner','Step owner',300],['due','Due date',10],['recordedResult','Recorded result',32000]];
const message = e => [e.code,e.message||String(e)].filter(Boolean).join(': ');
const ordered = value => Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
function downloadable(name,content,type='application/json'){const u=URL.createObjectURL(new Blob([content],{type})),a=element('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function details(title,value){const d=element('details');d.append(element('summary',title),element('pre',json(value)));return d;}
function rowTable(parent,headings,rows){parent.replaceChildren();if(!rows.length){parent.append(element('p','No saved records.','help'));return;}const t=element('table'),head=element('tr');for(const h of headings)head.append(element('th',h));const th=element('thead');th.append(head);t.append(th);const body=element('tbody');for(const values of rows){const r=element('tr');for(const v of values){const c=element('td');c.append(v instanceof Node?v:element('span',v??'—'));r.append(c);}body.append(r);}t.append(body);parent.append(t);}

function validateDraft(value,planId,revision){
  if(!value||value.schema!=='stellar-forge.operating-plan-draft.v1'||value.planId!==planId||value.baseRevision!==revision||!value.content||!Array.isArray(value.content.steps))throw Error('Keep the original draft schema, plan identity, base revision and complete content.');
  const c=value.content;
  if(Object.keys(c).sort().join(',')!==[...fields.map(f=>f[0]),'steps'].sort().join(','))throw Error('Keep every original plan content field.');
  for(const [key,,maximum]of fields)if(typeof c[key]!=='string'||c[key].length>maximum||c[key].includes('\0'))throw Error('Invalid authored plan field: '+key);
  if(!c.title.trim()||c.steps.length>1000)throw Error('A titled procedure supports up to 1,000 steps.');
  const ids=new Set(),allowed=['id','title','instruction','inputs','expectedResult','owner','due','status','recordedResult','argv','selection'].sort().join(',');
  for(const step of c.steps){
    if(!step||Object.keys(step).filter(k=>k!=='files').sort().join(',')!==allowed||typeof step.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(step.id)||ids.has(step.id))throw Error('Keep complete steps with distinct original IDs.');ids.add(step.id);
    for(const [key,,maximum]of stepFields)if(typeof step[key]!=='string'||step[key].length>maximum||step[key].includes('\0'))throw Error('Invalid operating step field: '+key);
    if(!step.title.trim()||!['planned','in-progress','completed','skipped'].includes(step.status)||!Array.isArray(step.argv)||step.argv.length>256||step.argv.some(a=>typeof a!=='string'||a.length>32000||a.includes('\0'))||(step.selection!==null&&(typeof step.selection!=='object'||Array.isArray(step.selection))))throw Error('Keep the complete status, command arguments and original registration for each step.');
    if(Object.hasOwn(step,'files')&&!Array.isArray(step.files))throw Error('Keep the complete original step file records.');
    if(step.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(step.due)||!Number.isFinite(Date.parse(step.due+'T00:00:00Z'))||new Date(step.due+'T00:00:00Z').toISOString().slice(0,10)!==step.due))throw Error('Use a real YYYY-MM-DD due date.');
  }
  return value;
}

export function mountGristOperatingPlans({api,getContext,setBlocked,notice}){
  let working=false,pending=null,known=undefined,initialized=false,directory=null,epoch=0,editEpoch=0;
  let current=null,draft=null,dirty=false,version=null,selectedStep=null,offset=0,total=0;
  let sourceKind='documents',sourceOffset=0,sourceTotal=0,sourcePage=[],sourceEpoch=0;
  let incoming=null,incomingEpoch=0,review=null,decisions=new Map(),reviewEpoch=0;
  const selected=Object.fromEntries(sourceKinds.map(k=>[k,new Map()]));
  const key=kind=>'stellar.grist.operating.'+kind+'.v1:'+directory;
  const requestPrefix=()=>key('request')+':';
  const selectedInputs=()=>Object.fromEntries(sourceKinds.map(k=>[k,[...selected[k].keys()]]));
  const externalBlocked=()=>Boolean(getContext().blocked)||!getContext().ready;
  const externalActive=()=>Boolean(getContext().active)||!getContext().ready;
  const requireIdle=()=>{if(externalBlocked()||working||pending||editorInitializing||editorOpening)throw Error('Resolve the original active source or plan request first.');};
  const call=(method,args)=>api('/api/operating',{body:{method,args}});
  const fresh=()=>{if(getContext().directory!==directory)throw Error('The original workspace changed. Reopen the editor before continuing.');};

  const EDITOR_SCHEMA='stellar-forge.grist-operating-editor.v1',EDITOR_DB='stellar-grist-operating-editors-v1',EDITOR_LIMIT=256*1024*1024;
  let origin=null,editorId=uuid(),editorSequence=0,editorInitialized=false,editorInitializing=true,editorOpening=false;
  let editorSerial=Promise.resolve(),editorWrites=0,editorFault=null,editorDatabase=null,editorDatabasePromise=null;
  let commandEdits=Object.create(null),returnEdits=Object.create(null),returnDisplay=null,incomingFile=null,adoptFile=null,editorChangedFlag=false;
  const sameOrigin=(a,b)=>Boolean(a&&b&&a.settingsSha256===b.settingsSha256&&a.createdAt===b.createdAt);
  const editorScope=()=>directory&&origin?JSON.stringify([directory,origin.settingsSha256,origin.createdAt]):null;
  const editorPointer=()=> 'stellar.grist.operating.editor.v1:'+editorScope();
  const bindOrigin=value=>{
    if(!value||Object.keys(value).sort().join(',')!=='createdAt,settingsSha256'||!/^[a-f0-9]{64}$/.test(value.settingsSha256)||typeof value.createdAt!=='string')throw Error('Read the complete original Grist workspace identity.');
    const next={settingsSha256:value.settingsSha256,createdAt:value.createdAt};
    if(origin&&!sameOrigin(origin,next))throw Error('The original Grist workspace identity changed. Download this complete editor and reopen its original workspace.');
    origin=next;
  };
  function captureEditorState(){
    const creation=Object.fromEntries([...new FormData($('op-create'))].filter(([,v])=>typeof v==='string'));
    for(const el of document.querySelectorAll('[data-op-command]'))commandEdits[el.dataset.opCommand]=el.value;
    for(const row of $('op-return-comparison').querySelectorAll('[data-key]')){
      const v=row._choice;if(v)returnEdits[row.dataset.key]={take:v.select.value,custom:v.custom.value,note:v.note.value};
    }
    return clone({current,draft,dirty,version,selectedStep,offset,sourceKind,sourceOffset,
      selected:Object.fromEntries(sourceKinds.map(k=>[k,[...selected[k].values()]])),creation,
      incoming,incomingFile,adoptFile,review,returnDisplay,decisions:[...decisions],commandEdits,returnEdits,
      returnFields:{reviewId:$('op-review-id').value,reviewer:$('op-return-reviewer').value,notes:$('op-return-notes').value},
      captureScope:$('op-capture-scope').value,workflow:document.querySelector('[data-view][aria-current="page"]')?.dataset.view??'operating'});
  }
  function editorRequests(){
    const records=new Map();try{for(const m of markers())records.set(m.requestId,clone(m));}catch{}
    if(pending){
      const old=records.get(pending.requestId);
      if(old&&(!same(old.args,pending.args)||old.method!==pending.method))return [...records.values(),clone(pending)];
      records.set(pending.requestId,clone(pending));
    }
    return [...records.values()];
  }
  function editorSnapshot(){return {schema:EDITOR_SCHEMA,id:editorId,directory,origin:clone(origin),sequence:editorSequence,
    savedAt:new Date().toISOString(),state:captureEditorState(),requests:editorRequests()};}
  function downloadEditor(value=editorSnapshot(),filename='grist-complete-operating-editor.json'){
    downloadable(filename,json(value)+'\n');
  }
  async function editorDB(){
    if(editorDatabase)return editorDatabase;
    if(!editorDatabasePromise)editorDatabasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(EDITOR_DB,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('editors'))request.result.createObjectStore('editors',{keyPath:'id'});};
      request.onerror=()=>reject(request.error||Error('Complete editor storage could not open.'));
      request.onblocked=()=>reject(Error('Close an older editor connection before opening its storage.'));
      request.onsuccess=()=>{editorDatabase=request.result;editorDatabase.onversionchange=()=>{editorDatabase.close();editorDatabase=null;editorDatabasePromise=null;};resolve(editorDatabase);};
    }).catch(e=>{editorDatabasePromise=null;throw e;});
    return editorDatabasePromise;
  }
  async function readEditor(id){
    const db=await editorDB();return new Promise((resolve,reject)=>{
      const tx=db.transaction('editors','readonly'),request=tx.objectStore('editors').get(id);
      let result;request.onsuccess=()=>{result=request.result??null;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Editor read interrupted.'));
    });
  }
  async function writeEditor(snapshot){
    const db=await editorDB();return new Promise((resolve,reject)=>{
      const tx=db.transaction('editors','readwrite'),store=tx.objectStore('editors'),read=store.get(editorId);
      let saved,error;read.onsuccess=()=>{
        const old=read.result;
        if((old?.sequence??0)!==editorSequence||old&&(old.directory!==directory||!sameOrigin(old.origin,origin))){
          error=Error('This saved editor changed in another window. Download your complete current work, then explicitly open the desired saved copy.');tx.abort();return;
        }
        saved={...clone(snapshot),id:editorId,sequence:editorSequence+1};store.put(saved);
      };
      tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('Complete editor write interrupted.'));
    });
  }
  function queueEditor(){
    if(!editorInitialized||editorOpening||!origin)return;
    editorChangedFlag=true;let snapshot;try{snapshot=editorSnapshot();}catch(e){editorFault=e;notice(message(e),true);renderEditorStorage();return;}editorWrites++;renderEditorStorage();
    const job=editorSerial.then(async()=>{
      if(editorFault)throw editorFault;
      const saved=await writeEditor(snapshot);editorSequence=saved.sequence;
      try{sessionStorage.setItem(editorPointer(),editorId);}catch(e){notice('The complete editor is saved. Its window pointer could not be retained; use Open saved editor after reload. '+message(e),true);}
    });
    editorSerial=job.catch(e=>{editorFault=e;notice('Your full working editor remains available to download. '+message(e),true);}).finally(()=>{editorWrites--;renderEditorStorage();});
  }
  function renderEditorStorage(){
    $('op-editor-storage-state').textContent=editorInitializing?'Opening the original workspace editor…':editorOpening?'Receiving the complete editor…':
      editorFault?'Browser storage needs recovery. Download the complete current editor or open a retained copy.':
      editorWrites?'Saving the complete working editor…':editorInitialized?'Complete working editor retained for this original workspace.':'Complete editor download remains available.';
    for(const id of ['op-editor-open','op-editor-list','op-editor-open-saved'])$(id).disabled=working||Boolean(pending)||externalActive()||editorInitializing||editorOpening;
    $('op-editor-download').disabled=editorInitializing&&!directory;
  }
  function checkEditor(value){
    if(!value||value.schema!==EDITOR_SCHEMA||value.directory!==directory||!sameOrigin(value.origin,origin)||typeof value.id!=='string'||!Number.isSafeInteger(value.sequence)||value.sequence<0||
      !value.state||typeof value.state!=='object'||Array.isArray(value.state)||!Array.isArray(value.requests))throw Error('Open the complete editor for this original Grist workspace identity.');
    const v=value.state;
    if(!v.selected||sourceKinds.some(k=>!Array.isArray(v.selected[k])||v.selected[k].some(r=>!r||typeof r.id!=='string'))||
      !v.creation||typeof v.creation!=='object'||!v.returnFields||typeof v.returnFields!=='object'||
      !Array.isArray(v.decisions)||!v.commandEdits||typeof v.commandEdits!=='object'||!v.returnEdits||typeof v.returnEdits!=='object'||
      !sourceKinds.includes(v.sourceKind)||!Number.isSafeInteger(v.offset)||v.offset<0||!Number.isSafeInteger(v.sourceOffset)||v.sourceOffset<0)
      throw Error('Keep the complete original source selections and editable fields.');
    if(v.draft){
      if(!v.current||v.current.id!==v.draft.planId||!v.current.plan||!Array.isArray(v.current.plan.revisions)||!Number.isSafeInteger(v.version)||v.version<1||
        v.draft.schema!=='stellar-forge.operating-plan-draft.v1'||!v.draft.content||!Array.isArray(v.draft.content.steps)||
        !fields.every(([k])=>typeof v.draft.content[k]==='string'))throw Error('Keep the original plan, editable draft and source revision together.');
      for(const step of v.draft.content.steps)if(!step||typeof step.id!=='string'||!stepFields.every(([k])=>typeof step[k]==='string'))throw Error('Keep every original editable step field.');
    }else if(v.current!==null)throw Error('Keep the current saved procedure with its complete working draft.');
    if(v.incoming)planFrom(v.incoming);
    if(new TextEncoder().encode(json(value)).length>EDITOR_LIMIT)throw Error('Use a complete operating editor within 256 MiB.');
    const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    if(!object(v.creation)||Object.values(v.creation).some(x=>typeof x!=='string')||
      !object(v.returnFields)||Object.values(v.returnFields).some(x=>typeof x!=='string')||
      !object(v.commandEdits)||Object.values(v.commandEdits).some(x=>typeof x!=='string')||
      !object(v.returnEdits)||Object.values(v.returnEdits).some(x=>!object(x)||!['','current','incoming','base','custom'].includes(x.take)||typeof x.custom!=='string'||typeof x.note!=='string')||
      v.decisions.some(x=>!Array.isArray(x)||x.length!==2||typeof x[0]!=='string'||!object(x[1]))||
      typeof v.dirty!=='boolean')throw Error('Keep every original raw field and return decision.');
    if(v.current&&(!Array.isArray(v.current.bindings)||!Array.isArray(v.current.captures)||!Array.isArray(v.current.returns)||
      !v.current.origin||v.current.plan.revisions.some(x=>!x||!Array.isArray(x.steps))))throw Error('Keep the complete original procedure and retained source identity.');
    for(const display of [v.review,v.returnDisplay])if(display&&(!object(display.comparison)||!Array.isArray(display.comparison.rows)||
      !Array.isArray(display.comparison.issues)||!Array.isArray(display.comparison.unresolved)||!object(display.comparison.summary)))throw Error('Keep the complete original return comparison.');
    for(const f of [v.incomingFile,v.adoptFile])if(f&&(!object(f)||typeof f.name!=='string'||typeof f.text!=='string'))throw Error('Keep the complete selected original file.');
    return clone(value);
  }
  async function receiveEditorRequests(records){
    const existing=new Map(markers().map(m=>[m.requestId,m]));if(pending)existing.set(pending.requestId,pending);
    const prepared=new Map();
    for(const record of records){
      if(!record||record.schema!=='stellar-forge.grist-operating-browser-request.v1'||record.directory!==directory||
        !record.args||!['create','adopt','save','capture','receive','return_apply'].includes(record.method)||record.requestId!==record.args.requestId||record.origin&&!sameOrigin(record.origin,origin)||
        await hash({method:record.method,args:record.args})!==record.bodySha256)throw Error('Keep every retained request in its original workspace with its exact complete body.');
      const old=existing.get(record.requestId)??prepared.get(record.requestId);
      if(old&&(old.bodySha256!==record.bodySha256||!same({method:old.method,args:old.args},{method:record.method,args:record.args})))throw Error('A retained request identifier already belongs to different original work.');
      if(!old)prepared.set(record.requestId,clone(record));
    }
    for(const record of prepared.values()){
      const k=requestPrefix()+record.requestId,old=localStorage.getItem(k);
      if(old){const v=JSON.parse(old);if(v.origin&&!sameOrigin(v.origin,origin)||v.bodySha256!==record.bodySha256||!same({method:v.method,args:v.args},{method:record.method,args:record.args}))throw Error('Another window retained different work or another workspace origin under this request ID.');}
      else localStorage.setItem(k,JSON.stringify(record));
    }
  }
  function installEditor(value){
    const v=value.state;
    current=clone(v.current);draft=clone(v.draft);dirty=Boolean(v.dirty);version=v.version;selectedStep=v.selectedStep??null;
    offset=v.offset;sourceKind=v.sourceKind;sourceOffset=v.sourceOffset;sourcePage=[];sourceTotal=0;
    for(const k of sourceKinds){selected[k].clear();for(const row of v.selected[k])selected[k].set(row.id,clone(row));}
    for(const el of $('op-create').elements)if(el.name&&typeof v.creation[el.name]==='string')el.value=v.creation[el.name];
    incoming=clone(v.incoming);incomingFile=clone(v.incomingFile);adoptFile=clone(v.adoptFile);review=clone(v.review);returnDisplay=clone(v.returnDisplay??v.review);
    decisions=new Map(clone(v.decisions));commandEdits=Object.assign(Object.create(null),clone(v.commandEdits));returnEdits=Object.assign(Object.create(null),clone(v.returnEdits));
    $('op-review-id').value=v.returnFields.reviewId??'';$('op-return-reviewer').value=v.returnFields.reviewer??'';$('op-return-notes').value=v.returnFields.notes??'';
    $('op-capture-scope').value=v.captureScope==='selected'?'selected':'all';$('op-source-kind').value=sourceKind;
    const returnedPlan=incoming?planFrom(incoming):null;
    $('op-incoming').textContent=returnedPlan?'Returned '+returnedPlan.id+' · '+returnedPlan.revisions.length+' complete saved revisions. Original working review reopened.':incomingFile?'Retained original returned file: '+incomingFile.name+' · complete text preserved; select a valid complete plan to continue.':'No returned plan selected.';
    $('op-adopt-retained').textContent=adoptFile?'Retained complete adoption file: '+adoptFile.name:'';
    epoch++;editEpoch++;sourceEpoch++;incomingEpoch++;reviewEpoch++;
    renderSource();renderEditor();renderReturn();
    const workflow=document.querySelector('[data-view="'+(['overview','acquire','review','versions','deploy','operating'].includes(v.workflow)?v.workflow:'operating')+'"]');
    if(workflow){document.querySelectorAll('[data-panel]').forEach(el=>{el.hidden=el.dataset.panel!==workflow.dataset.view;});document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-current',el===workflow?'page':'false'));}
  }
  async function listEditors(){
    const db=await editorDB(),values=await new Promise((resolve,reject)=>{const tx=db.transaction('editors','readonly'),r=tx.objectStore('editors').getAll();let rows;r.onsuccess=()=>{rows=r.result;};tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    const select=$('op-editor-copies');select.replaceChildren();
    for(const row of values.filter(v=>v.directory===directory&&sameOrigin(v.origin,origin)).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))){
      const option=element('option',(row.state?.draft?.content?.title||row.state?.creation?.title||'Working editor')+' · '+new Date(row.savedAt).toLocaleString()+' · '+row.id);option.value=row.id;select.append(option);
    }
    if(!select.options.length){const option=element('option','No saved editor for this original workspace');option.value='';select.append(option);}
  }
  async function openEditor(load){
    if(working||pending||externalBlocked()||editorInitializing||editorOpening)return;
    editorOpening=true;sync();
    try{
      const received=checkEditor(await load());fresh();
      downloadEditor(editorSnapshot(),'grist-editor-before-opening.json');
      await editorSerial;fresh();await receiveEditorRequests(received.requests);fresh();
      installEditor(received);editorId=uuid();editorSequence=0;editorFault=null;editorInitialized=true;editorChangedFlag=true;
      pending=markers()[0]??null;known=undefined;
    }catch(e){notice(message(e),true);return;}
    finally{editorOpening=false;sync();}
    queueEditor();await editorSerial;await listEditors().catch(e=>notice(message(e),true));
    notice('Opened the complete original workspace editor. Saved source revisions remain selected until you explicitly reload or review them.');
  }
  async function initializeEditor(){
    if(!origin)throw Error('Read the original workspace identity before opening retained work.');
    let selectedId=null;try{selectedId=sessionStorage.getItem(editorPointer());}catch{}
    if(selectedId){const saved=await readEditor(selectedId);if(saved){const checked=checkEditor(saved);await receiveEditorRequests(checked.requests);installEditor(checked);}}
    editorId=uuid();editorSequence=0;editorInitialized=true;editorInitializing=false;queueEditor();
    await listEditors();
  }
  $('op-editor-download').addEventListener('click',()=>{try{downloadEditor();}catch(e){notice(message(e),true);}});
  $('op-editor-list').addEventListener('click',()=>{if(working||pending||editorOpening||editorInitializing||externalActive())return;listEditors().catch(e=>notice(message(e),true));});
  $('op-editor-open-saved').addEventListener('click',()=>{
    const id=$('op-editor-copies').value;if(!id)return;
    openEditor(async()=>{const value=await readEditor(id);if(!value)throw Error('The selected complete editor is unavailable.');return value;});
  });
  $('op-editor-open').addEventListener('change',()=>{
    const file=$('op-editor-open').files[0];if(!file)return;
    openEditor(async()=>{if(file.size>EDITOR_LIMIT)throw Error('Open the complete editor within 256 MiB.');return JSON.parse(await file.text());}).finally(()=>{$('op-editor-open').value='';});
  });

  function markers(){
    const out=[];if(!directory)return out;
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(requestPrefix())){const m=JSON.parse(localStorage.getItem(k));if(m.schema!=='stellar-forge.grist-operating-browser-request.v1'||m.directory!==directory||!m.args||m.requestId!==m.args.requestId)throw Error('A retained plan request is invalid; download and reconcile the original browser record.');if(origin&&m.origin&&!sameOrigin(m.origin,origin))continue;out.push(m);}}
    return out.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }
  function sync(){
    setBlocked(working||Boolean(pending)||editorInitializing||editorOpening,{working:working||editorInitializing||editorOpening});
    const blocked=working||externalActive()||editorInitializing||editorOpening;
    renderEditorStorage();
    $('op-recovery').hidden=!pending;
    $('op-check').disabled=blocked||!pending;
    $('op-retry').disabled=blocked||!pending||known!==null||!requestOrigin(pending);
    $('op-resume').disabled=blocked||!pending||known?.status!=='interrupted'||!requestOrigin(pending);
    $('op-ack').disabled=blocked||!pending||!(known?.status==='failed'||(known===null&&pending.rejected));
    $('op-request-download').disabled=!pending;
    if(pending){
      $('op-request-id').textContent=pending.requestId;
      $('op-request-state').textContent=!requestOrigin(pending)?'This earlier request has no retained workspace identity. Read its original receipt or download it for the original operator; automatic replay stays unavailable.':known?.status==='complete'?'The original result is recorded; finish reopening it.':
        known?.status==='interrupted'?'Continue this exact original request through its saved journal.':
        known?.status==='pending'?'The original operation is still pending. Read its receipt before any continuation.':
        known?.status==='failed'?'The original request has a recorded terminal failure: '+(known.error?.message??'See its receipt.'):
        known===null?'No original receipt is visible. Retry only the retained exact request, or acknowledge a positively rejected input.':'The response is uncertain. Read the original request receipt.';
    }
    $('op-save').disabled=!draft||!dirty;
    $('op-capture').disabled=!current||dirty;
    $('op-preview-return').disabled=!current||!incoming||dirty;
    $('op-receive').disabled=!current||!incoming||dirty;
    $('op-apply-return').disabled=!review?.comparison?.ready||dirty||review?.version!==version;
    $('op-reload').disabled=!current;
    $('op-add-step').disabled=!draft||draft.content.steps.length>=1000;
    $('op-draft-download').disabled=!draft;
    for(const b of document.querySelectorAll('[data-op-export]'))b.disabled=!current;
    $('op-state').textContent=current?'Plan '+current.id+' · procedure version '+version+' · saved plan revision '+current.plan.revisions.length+(dirty?' · unsaved local edits':' · saved'):
      'Choose or create a procedure in this original workspace.';
  }
  function draftCache(){queueEditor();}
  function edited(){dirty=true;editEpoch++;review=null;draftCache();sync();}
  function field(label,value,changed,{large=false,max=32000,type='text'}={}){
    const holder=element('label',label),input=element(large?'textarea':'input');if(!large)input.type=type;else input.rows=3;
    input.value=value??'';input.maxLength=max;input.addEventListener('input',()=>{if(working||pending||editorInitializing||editorOpening||externalBlocked())return;changed(input.value);});
    holder.append(input);return holder;
  }
  function button(text,action){const b=element('button',text);b.type='button';b.addEventListener('click',()=>run(action));return b;}
  async function run(action,{recovery=false}={}){
    if(working||editorInitializing||editorOpening||(recovery?externalActive():externalBlocked())||(!recovery&&pending))return;
    working=true;sync();try{fresh();await editorSerial;await action();}catch(e){notice(message(e),true);}finally{working=false;queueEditor();sync();}
  }
  function renderSource(){
    rowTable($('op-sources'),['Use','Original source','Retained identity'],sourcePage.map(item=>{
      const check=element('input');check.type='checkbox';check.checked=selected[sourceKind].has(String(item.id));check.setAttribute('aria-label','Select '+item.title);
      check.addEventListener('change',()=>{if(working||pending||externalBlocked())return;const id=String(item.id);if(check.checked)selected[sourceKind].set(id,clone({...item,id}));else selected[sourceKind].delete(id);renderSelection();queueEditor();});
      return [check,element('span',item.title+' · '+item.id),details(item.identitySha256,{identity:item.identity,observation:item.observation})];
    }));
    $('op-source-page').textContent=(sourceTotal?sourceOffset+1:0)+'–'+Math.min(sourceOffset+sourcePage.length,sourceTotal)+' of '+sourceTotal;
    $('op-source-prev').disabled=sourceOffset===0;$('op-source-next').disabled=sourceOffset+sourcePage.length>=sourceTotal;
    renderSelection();
  }
  function renderSelection(){
    const out=$('op-selected-sources');out.replaceChildren();
    for(const kind of sourceKinds)for(const item of selected[kind].values()){
      const line=element('div',null,'op-selection');line.append(element('span',kind+' · '+item.title+' · '+item.id),button('Remove',()=>{selected[kind].delete(item.id);renderSelection();queueEditor();}));out.append(line);
    }
    if(!out.childElementCount)out.append(element('p','Select retained sources, or create an empty procedure and author its manual steps.','help'));
  }
  async function sources(){
    const intent=++sourceEpoch,k=sourceKind,at=sourceOffset,result=await call('source',{kind:k,offset:at,limit:25});
    fresh();if(intent!==sourceEpoch||k!==sourceKind||at!==sourceOffset)return;
    bindOrigin(result.origin);sourcePage=result.items;sourceTotal=result.total;$('op-source-origin').textContent='Original workspace settings '+result.origin.settingsSha256+' · created '+result.origin.createdAt;renderSource();
  }
  async function list(){
    const requested=offset,result=await call('list',{offset:requested,limit:25});fresh();if(requested!==offset)return;
    bindOrigin(result.origin);total=result.total;rowTable($('op-plans'),['Procedure','Saved state','Open'],result.procedures.map(p=>[p.title+' · '+p.id,'v'+p.version+' · plan r'+p.planRevision+' · captures '+p.captures,button('Open',()=>open(p.id))]));
    $('op-plan-page').textContent=(total?offset+1:0)+'–'+Math.min(offset+result.procedures.length,total)+' of '+total;
    $('op-plan-prev').disabled=offset===0;$('op-plan-next').disabled=offset+result.procedures.length>=total;
  }
  function confirmReplace(){
    if((dirty||incoming||Object.keys(commandEdits).length)&&!confirm('Open different saved work? Your complete current editor will be downloaded first, including unfinished fields and returned work.'))return false;
    if(editorInitialized)downloadEditor(editorSnapshot(),'grist-editor-before-replacement.json');return true;
  }
  function install(result,{keepDraft=false}={}){
    if(!result?.procedure||!result.draft||result.draft.planId!==result.procedure.id||!Number.isSafeInteger(result.version))throw Error('The original procedure result is incomplete.');
    const changed=current?.id!==result.procedure.id;
    current=clone(result.procedure);version=result.version;if(!keepDraft){draft=clone(result.draft);dirty=false;}
    review=null;if(changed){commandEdits=Object.create(null);returnEdits=Object.create(null);returnDisplay=null;decisions=new Map();incoming=null;incomingFile=null;$('op-return-file').value='';$('op-incoming').textContent='No returned plan selected.';renderReturn();}
    selectedStep=draft.content.steps.some(s=>s.id===selectedStep)?selectedStep:draft.content.steps[0]?.id??null;
    renderEditor();draftCache();
  }
  async function open(id,{keepDraft=false}={}){
    if(!keepDraft&&!confirmReplace())return;
    const intent=++epoch,editing=editEpoch,result=await call('read',{planId:id});fresh();
    if(intent!==epoch||editing!==editEpoch)return;
    install(result,{keepDraft});
  }
  function renderEditor(){
    $('op-editor').hidden=!draft;if(!draft){sync();return;}
    const out=$('op-plan-fields');out.replaceChildren();
    for(const [name,label,max]of fields)out.append(field(label,draft.content[name],value=>{draft.content[name]=value;edited();},{large:max===32000,max}));
    const select=$('op-step');select.replaceChildren();
    for(const [index,step]of draft.content.steps.entries()){const option=element('option',(index+1)+'. '+step.title+' · '+step.status);option.value=step.id;select.append(option);}
    if(selectedStep&&!draft.content.steps.some(v=>v.id===selectedStep)){const missing=element('option','Original selected step · '+selectedStep);missing.value=selectedStep;select.append(missing);}
    if(selectedStep)select.value=selectedStep;renderStep();
    const history=$('op-history');history.replaceChildren();
    for(const r of [...current.plan.revisions].reverse()){
      const entry=element('div',null,'op-history-row');entry.append(element('span','Revision '+r.revision+' · '+new Date(r.savedAt).toLocaleString()+' · '+r.title),
        button('View',()=>{$('op-history-detail').replaceChildren(details('Complete saved revision '+r.revision,r));}),
        button('Use as editable draft',()=>{if(!confirmReplace())return;const {revision:old,savedAt,...content}=clone(r);draft={schema:'stellar-forge.operating-plan-draft.v1',planId:current.id,baseRevision:current.plan.revisions.length,content};selectedStep=content.steps[0]?.id??null;edited();renderEditor();}));
      history.append(entry);
    }
    $('op-bindings').replaceChildren(details('Retained source bindings',current.bindings),details('Source observations and captures',current.captures),details('Saved returned-plan reviews',current.returns));
    sync();
  }
  function renderFiles(parent,files,label){
    if(!Array.isArray(files)||!files.length)return;
    const out=element('section');out.append(element('h4',label));
    for(const file of files){
      const line=element('div',null,'op-selection');
      line.append(element('span',(file.name??file.id)+' · '+file.bytes+' bytes'+(file.note?' · '+file.note:'')));
      const b=element('button','Download '+(file.name??file.id));b.type='button';
      b.addEventListener('click',()=>{
        try{
          if(file.encoding!=='base64'||typeof file.content!=='string')throw Error('Keep the original complete binary file.');
          const binary=atob(file.content),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
          if(String(bytes.length)!==String(file.bytes))throw Error('The complete file differs from its retained byte length.');
          downloadable(file.name||file.id,bytes,file.mediaType||'application/octet-stream');
        }catch(e){notice(message(e),true);}
      });
      line.append(b);out.append(line);
    }
    parent.append(out);
  }
  function renderStep(){
    const out=$('op-step-fields');out.replaceChildren();const step=draft?.content.steps.find(s=>s.id===selectedStep);
    $('op-remove-step').disabled=!step;$('op-step-up').disabled=!step||draft.content.steps.indexOf(step)===0;$('op-step-down').disabled=!step||draft.content.steps.indexOf(step)===draft.content.steps.length-1;
    if(!step){out.append(element('p','Add a manual step or create a procedure from retained sources.','help'));return;}
    out.append(element('p','Stable step ID: '+step.id,'path'));
    for(const [name,label,max]of stepFields)out.append(field(label,step[name],value=>{step[name]=value;edited();},{large:max===32000,max,type:name==='due'?'date':'text'}));
    const status=element('label','Recorded status'),select=element('select');
    for(const value of ['planned','in-progress','completed','skipped']){const o=element('option',value);o.value=value;select.append(o);}select.value=step.status;
    select.addEventListener('change',()=>{if(working||pending||externalBlocked())return;step.status=select.value;edited();});status.append(select);out.append(status);
    out.append(details('Original registration and arguments — kept together',{selection:step.selection,argv:step.argv}));
    const commands=element('details'),legend=element('summary','Edit complete command binding');commands.append(legend,element('p','This is authored procedure text. Saving or capturing never executes these arguments. Keep the selected registration and its argv together.','help'));
    const area=element('textarea');area.rows=7;area.dataset.opCommand=step.id;area.value=commandEdits[step.id]??json({selection:step.selection,argv:step.argv});area.setAttribute('aria-label','Complete command binding JSON');
    area.addEventListener('input',()=>{commandEdits[step.id]=area.value;queueEditor();});
    renderFiles(out,step.files,'Current step files');
    commands.append(area,button('Apply command binding to draft',()=>{const value=JSON.parse(area.value);if(!value||Object.keys(value).sort().join(',')!=='argv,selection'||!Array.isArray(value.argv)||value.argv.some(a=>typeof a!=='string')||(value.selection!==null&&(typeof value.selection!=='object'||Array.isArray(value.selection))))throw Error('Keep exactly selection and an array of text argv in this binding.');step.selection=clone(value.selection);step.argv=clone(value.argv);delete commandEdits[step.id];renderStep();edited();}));out.append(commands);
  }
  async function retainRequest(method,args){
    const previous=markers();if(previous.length){pending=previous[0];known=undefined;throw Error('An earlier retained plan request needs its original receipt first.');}
    await verifyOrigin();
    const requestId=uuid(),payload={...clone(args),requestId},request={method,args:payload};
    const marker={schema:'stellar-forge.grist-operating-browser-request.v1',directory,origin:clone(origin),requestId,method,args:payload,bodySha256:await hash(request),createdAt:new Date().toISOString(),editor:{planId:draft?.planId??null,version,draftSha256:draft?await hash(draft):null}};
    fresh();localStorage.setItem(requestPrefix()+requestId,JSON.stringify(marker));
    const stored=JSON.parse(localStorage.getItem(requestPrefix()+requestId));if(!same(stored,marker))throw Error('The complete request could not be retained before dispatch.');
    pending=marker;known=undefined;sync();return marker;
  }
  function forgetRequest(){
    if(!pending)return;localStorage.removeItem(requestPrefix()+pending.requestId);pending=null;known=undefined;
    const remaining=markers();if(remaining.length)pending=remaining[0];sync();
  }
  async function finish(result,marker){
    if(marker.directory!==directory||result?.procedure?.id!==marker.args.planId)throw Error('The original result does not match this retained request.');
    // The journal returns its original edition. Reopen current saved work separately.
    const latest=await call('read',{planId:result.procedure.id});fresh();
    if(latest.procedure?.id!==result.procedure.id||!sameOrigin(latest.procedure.origin,result.procedure.origin)||latest.version<result.version||
      !result.procedure.plan.revisions.every((r,i)=>same(ordered(r),ordered(latest.procedure.plan.revisions[i]))))
      throw Error('The current procedure does not retain this original committed plan history.');
    const isSubmitted=async(value,savedVersion)=>{
      if(!value)return false;
      if(marker.editor)return value.planId===marker.editor.planId&&savedVersion===marker.editor.version&&await hash(value)===marker.editor.draftSha256;
      return marker.method==='save'&&same(value,marker.args.draft)&&savedVersion===marker.args.expectedVersion;
    };
    const protectDraft=dirty&&!await isSubmitted(draft,version);
    if(!protectDraft)install(latest);
    await list();fresh();
    if(pending?.requestId===marker.requestId)forgetRequest();
    notice('Original request '+marker.requestId+' recorded procedure version '+result.version+
      '; current saved version '+latest.version+'.'+(protectDraft?' Your local edits remain unchanged. Download or explicitly reload them before continuing.':' Current saved work reopened.'));
  }
  async function verifyOrigin(){const value=await call('list',{offset:0,limit:1});fresh();bindOrigin(value.origin);}
  function requestOrigin(marker){return marker?.origin??null;}
  async function boundRequest(marker,{readOnly=false}={}){
    await verifyOrigin();const expected=requestOrigin(marker);
    if(expected&&!sameOrigin(expected,origin))throw Error('This retained request belongs to another original workspace identity. Keep its complete download and reopen that workspace.');
    if(!expected&&!readOnly)throw Error('This legacy request has no retained workspace identity. Read its original receipt and preserve its complete download; it cannot be silently replayed into this store.');
  }
  async function check(){
    if(!pending)return;const marker=pending;await boundRequest(marker,{readOnly:true});
    if(await hash({method:marker.method,args:marker.args})!==marker.bodySha256)throw Error('The retained exact request changed; preserve its JSON for the original operator.');
    const result=await call('request',{requestId:marker.requestId});fresh();
    if(pending?.requestId!==marker.requestId)return;
    if(result!==null&&(result?.id!==marker.requestId||result.kind!=='OPERATING_PLAN'))throw Error('The receipt belongs to another original operation.');
    if(result&&result.inputSha256!==undefined){
      if(!sameOrigin(result.origin,origin)||result.inputSha256!==await hash(ordered({method:marker.method,args:marker.args})))throw Error('The original journal does not match this exact retained request and workspace.');
      if(!requestOrigin(marker)){
        const bound={...clone(marker),origin:clone(origin)};localStorage.setItem(requestPrefix()+marker.requestId,JSON.stringify(bound));
        if(!same(JSON.parse(localStorage.getItem(requestPrefix()+marker.requestId)),bound))throw Error('The verified original request identity could not be retained.');
        if(pending?.requestId===marker.requestId)pending=bound;marker.origin=clone(origin);
      }
    }
    if(result?.status==='complete'&&!requestOrigin(marker))throw Error('The original receipt has no receiving-workspace identity. Preserve this legacy request for the original operator.');
    known=result;sync();if(result?.status==='complete')await finish(result.result,marker);
    if(result)$('op-request-detail').replaceChildren(details('Original request receipt',result));else $('op-request-detail').replaceChildren();
  }
  async function send(marker,resume=false){
    await boundRequest(marker);
    if(await hash({method:marker.method,args:marker.args})!==marker.bodySha256)throw Error('The retained request no longer matches its original complete body.');
    try{const result=resume?await api('/api/resume',{body:{requestId:marker.requestId}}):await call(marker.method,marker.args);fresh();await finish(result,marker);}
    catch(e){
      if(pending?.requestId!==marker.requestId)throw e;
      if([400,409,413,415,422].includes(e.status)&&e.code){pending.rejected={status:e.status,message:message(e)};localStorage.setItem(requestPrefix()+marker.requestId,JSON.stringify(pending));}
      notice(message(e),true);try{await check();}catch(readError){notice(message(e)+' Original receipt unavailable: '+message(readError),true);}
    }
  }
  async function mutate(method,args){await send(await retainRequest(method,args));}
  function discardReview(){if(review)returnDisplay=clone(review);review=null;reviewEpoch++;queueEditor();sync();}
  function renderReturn(){
    const area=$('op-return-comparison');area.replaceChildren();const display=review??returnDisplay;if(!display){sync();return;}
    const c=display.comparison;if(!review)area.append(element('p','These retained choices need a fresh comparison before applying.','note'));area.append(element('h3','Returned work · shared revision '+c.commonRevision),
      element('p',c.summary.changes+' changes · '+c.summary.conflicts+' conflicts · '+c.unresolved.length+' unresolved · '+c.issues.length+' corrections required.','note'));
    for(const issue of c.issues)area.append(element('p',issue.key+': '+issue.message,'op-error'));
    for(const row of c.rows){
      const item=element('section',null,'op-return-row');item.append(element('h4',row.label),element('p',row.key+(row.conflict?' · Explicit decision required':''),'path'));
      if(row.reason)item.append(element('p',row.reason));
      const values=element('div',null,'op-return-values');for(const [key,label]of [['base','Shared original'],['current','Current'],['incoming','Returned']]){const value=row.alternatives?.[key]??row[key];values.append(details(label,value));renderFiles(values,row.key.endsWith('/files')?value:value?.files,label+' files');}item.append(values);
      const choice=element('label','Reviewed choice'),select=element('select');
      for(const [value,label]of [['','Use original automatic choice / unresolved'],['current','Keep current'],['incoming','Take returned'],['base','Use shared original'],['custom','Custom complete JSON value']]){const option=element('option',label);option.value=value;select.append(option);}
      const selected=decisions.get(row.key),raw=returnEdits[row.key];select.value=raw?.take??selected?.take??'';
      const custom=element('textarea');custom.rows=4;custom.setAttribute('aria-label','Custom value for '+row.label);custom.value=raw?.custom??json(selected?.take==='custom'?selected.value:row.value);custom.hidden=select.value!=='custom';
      const note=element('input');note.value=raw?.note??selected?.note??'';note.setAttribute('aria-label','Decision note for '+row.label);
      const changed=()=>{returnEdits[row.key]={take:select.value,custom:custom.value,note:note.value};discardReview();};
      select.addEventListener('change',()=>{custom.hidden=select.value!=='custom';changed();});
      note.addEventListener('input',changed);custom.addEventListener('input',changed);
      choice.append(select);item.append(choice,custom,field('Decision note',note.value,()=>{},{}));
      item.lastChild.replaceChildren(document.createTextNode('Decision note'),note);
      item.append(details('Proposed complete value · '+(row.reviewed?'reviewed':'automatic'),row.value));renderFiles(item,row.key.endsWith('/files')?row.value:row.value?.files,'Proposed files');
      item.dataset.key=row.key;item._choice={select,custom,note};
      area.append(item);
    }
    sync();
  }
  function collectedDecisions(){
    const rows=[...$('op-return-comparison').querySelectorAll('[data-key]')];
    for(const row of rows){const {select,custom,note}=row._choice;if(!select.value)decisions.delete(row.dataset.key);else decisions.set(row.dataset.key,{take:select.value,...(select.value==='custom'?{value:JSON.parse(custom.value)}:{}),note:note.value});}
    return [...decisions].map(([key,decision])=>({key,decision}));
  }
  async function previewReturn(){
    if(!current||!incoming||dirty)throw Error('Save or reload the current draft and select the complete returned plan.');
    const choices=collectedDecisions(),intent=++reviewEpoch,editing=editEpoch,expected=version;
    const result=await call('return_preview',{planId:current.id,incoming:clone(incoming),reviewId:$('op-review-id').value,reviewer:$('op-return-reviewer').value,notes:$('op-return-notes').value,decisions:choices});
    fresh();if(intent!==reviewEpoch||editing!==editEpoch||expected!==version)return;
    if(result.version!==version)throw Error('The saved procedure advanced. Preserve this return, reload current work, then review again.');
    review=result;returnDisplay=clone(result);renderReturn();queueEditor();
  }
  async function readFile(file){
    if(!file||file.size<1||file.size>24*1024*1024)throw Error('Choose a complete JSON procedure or plan within the native 24 MiB input limit.');
    return JSON.parse(await file.text());
  }
  function planFrom(value){
    if(value?.schema==='stellar-forge.operating-plan.v1'){if(typeof value.id!=='string'||!Array.isArray(value.revisions)||!value.revisions.length)throw Error('Keep the complete original plan identity and saved revisions.');return value;}
    if(value?.schema==='stellar-forge.grist-operating-procedure.v1')return planFrom(value.plan);
    throw Error('Choose the complete original operating plan or Grist procedure, including its revision history.');
  }
  $('op-create').addEventListener('input',()=>queueEditor());
  $('op-capture-scope').addEventListener('change',()=>queueEditor());
  for(const el of document.querySelectorAll('[data-view]'))el.addEventListener('click',()=>queueMicrotask(()=>queueEditor()));
  $('op-adopt-file').addEventListener('change',()=>run(async()=>{
    const file=$('op-adopt-file').files[0];if(!file)return;
    if(file.size<1||file.size>24*1024*1024)throw Error('Choose a complete original procedure within 24 MiB.');
    const text=await file.text();fresh();if(adoptFile)downloadEditor(editorSnapshot(),'grist-editor-before-adoption-file.json');
    adoptFile={name:file.name,text};$('op-adopt-retained').textContent='Retained complete adoption file: '+file.name;queueEditor();
    const value=JSON.parse(text);if(value.schema!=='stellar-forge.grist-operating-procedure.v1')throw Error('Keep the complete original procedure, bindings and history.');
    planFrom(value);
  }));
  $('op-refresh').addEventListener('click',()=>run(list));
  for(const [suffix,delta]of [['prev',-25],['next',25]]){
    $('op-plan-'+suffix).addEventListener('click',()=>run(async()=>{offset=Math.max(0,offset+delta);await list();}));
    $('op-source-'+suffix).addEventListener('click',()=>run(async()=>{sourceOffset=Math.max(0,sourceOffset+delta);await sources();}));
  }
  $('op-source-kind').addEventListener('change',()=>run(async()=>{sourceKind=$('op-source-kind').value;sourceOffset=0;await sources();}));
  $('op-source-refresh').addEventListener('click',()=>run(sources));
  $('op-create').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!confirmReplace())return;const form=new FormData(event.currentTarget),args={planId:String(form.get('planId')).trim(),expectedVersion:0,selection:selectedInputs()};
    for(const [name]of fields)args[name]=String(form.get(name)??'');
    await mutate('create',args);
  });});
  $('op-adopt').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!confirmReplace())return;const value=$('op-adopt-file').files[0]?await readFile($('op-adopt-file').files[0]):adoptFile?JSON.parse(adoptFile.text):await readFile(null);if(value.schema!=='stellar-forge.grist-operating-procedure.v1')throw Error('Adopt requires the complete original Grist procedure with bindings, observations and history.');
    if(!value.id)throw Error('The procedure has no original ID.');await mutate('adopt',{planId:value.id,expectedVersion:0,procedure:value});
  });});
  $('op-save').addEventListener('click',()=>run(()=>{if(Object.entries(commandEdits).some(([id,raw])=>{const step=draft.content.steps.find(v=>v.id===id);return step&&raw!==json({selection:step.selection,argv:step.argv});}))throw Error('Apply each edited complete command binding before saving. Its exact raw text remains in the complete editor download.');validateDraft(draft,current.id,current.plan.revisions.length);return mutate('save',{planId:current.id,expectedVersion:version,draft:clone(draft)});}));
  $('op-reload').addEventListener('click',()=>run(()=>open(current.id)));
  $('op-draft-download').addEventListener('click',()=>{if(draft)downloadable('grist-operating-draft.json',json({schema:'stellar-forge.grist-operating-browser-draft.v1',directory,origin:clone(origin),planId:draft.planId,version,draft})+'\n');});
  $('op-draft-file').addEventListener('change',()=>run(async()=>{
    const value=await readFile($('op-draft-file').files[0]);
    if(value.schema!=='stellar-forge.grist-operating-browser-draft.v1'||value.directory!==directory||value.origin&&!sameOrigin(value.origin,origin)||!value.draft||!current||value.planId!==current.id||value.draft.planId!==current.id)throw Error('Choose an editable draft for this original workspace and open procedure.');
    if(value.version!==version||value.draft.baseRevision!==current.plan.revisions.length)throw Error('This draft is based on another saved version. Keep it; use the complete returned-plan review for divergent saved work.');
    validateDraft(value.draft,current.id,current.plan.revisions.length);if(!confirmReplace())return;draft=clone(value.draft);selectedStep=draft.content.steps[0]?.id??null;edited();renderEditor();$('op-draft-file').value='';
  }));
  $('op-step').addEventListener('change',()=>{if(working||pending||externalBlocked())return;selectedStep=$('op-step').value;renderStep();queueEditor();});
  $('op-add-step').addEventListener('click',()=>run(()=>{const step={id:'step-'+uuid(),title:'New operating step',instruction:'',inputs:'',expectedResult:'',owner:'',due:'',status:'planned',recordedResult:'',argv:[],selection:null};draft.content.steps.push(step);selectedStep=step.id;edited();renderEditor();}));
  $('op-remove-step').addEventListener('click',()=>run(()=>{if(!confirm('Remove this step from the editable next revision? Saved history and original source bindings remain.'))return;draft.content.steps=draft.content.steps.filter(s=>s.id!==selectedStep);selectedStep=draft.content.steps[0]?.id??null;edited();renderEditor();}));
  for(const [id,delta]of [['op-step-up',-1],['op-step-down',1]])$(id).addEventListener('click',()=>run(()=>{const at=draft.content.steps.findIndex(s=>s.id===selectedStep),to=at+delta;if(at<0||to<0||to>=draft.content.steps.length)return;const [s]=draft.content.steps.splice(at,1);draft.content.steps.splice(to,0,s);edited();renderEditor();}));
  $('op-capture').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save the authored draft before retaining its source observations.');const stepIds=$('op-capture-scope').value==='all'?current.bindings.filter(b=>current.plan.revisions.at(-1).steps.some(step=>step.id===b.stepId)).map(b=>b.stepId):[selectedStep];if(!stepIds.length||stepIds.some(id=>!current.bindings.some(b=>b.stepId===id)))throw Error('Choose a source-bound step, or all retained source bindings.');return mutate('capture',{planId:current.id,expectedVersion:version,captureId:uuid(),stepIds:[...new Set(stepIds)]});}));
  for(const b of document.querySelectorAll('[data-op-export]'))b.addEventListener('click',()=>run(async()=>{
    const value=await call('export',{planId:current.id,format:b.dataset.opExport});
    const data=new TextEncoder().encode(value.content);if(data.length!==value.bytes||await hashBytes(data)!==value.sha256)throw Error('The complete export does not match its original byte/hash identity.');
    downloadable(value.filename,value.content,value.contentType);
  }));
  $('op-return-file').addEventListener('change',()=>run(async()=>{
    const intent=++incomingEpoch,file=$('op-return-file').files[0];if(!file||file.size<1||file.size>24*1024*1024)throw Error('Choose a complete returned file within 24 MiB.');const text=await file.text();if(intent!==incomingEpoch)return;
    if(incoming||incomingFile)downloadEditor(editorSnapshot(),'grist-editor-before-returned-file.json');
    incoming=null;incomingFile={name:file.name,text};decisions=new Map();returnEdits=Object.create(null);returnDisplay=null;review=null;$('op-review-id').value=uuid();$('op-return-comparison').replaceChildren();$('op-incoming').textContent='Retained original file: '+file.name+' · awaiting valid complete plan.';discardReview();
    const value=JSON.parse(text),displayPlan=planFrom(value);incoming=clone(value);
    $('op-incoming').textContent='Returned '+displayPlan.id+' · '+displayPlan.revisions.length+' complete saved revisions. Preview differences before receiving.';
  }));
  for(const id of ['op-return-reviewer','op-return-notes'])$(id).addEventListener('input',discardReview);
  $('op-preview-return').addEventListener('click',()=>run(previewReturn));
  $('op-receive').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save current edits first.');return mutate('receive',{planId:current.id,expectedVersion:version,incoming:clone(incoming)});}));
  $('op-apply-return').addEventListener('click',()=>run(()=>{if(!review?.comparison?.ready||review.version!==version||dirty)throw Error('Prepare a complete valid return review against this current saved version.');return mutate('return_apply',{planId:current.id,expectedVersion:version,review:clone(review.review)});}));
  $('op-review-download').addEventListener('click',()=>{try{downloadEditor(editorSnapshot(),'grist-complete-return-editor.json');}catch(e){notice(message(e),true);}});
  $('op-check').addEventListener('click',()=>run(check,{recovery:true}));
  $('op-retry').addEventListener('click',()=>run(async()=>{await check();if(pending&&known===null)await send(pending);},{recovery:true}));
  $('op-resume').addEventListener('click',()=>run(async()=>{await check();if(pending&&known?.status==='interrupted')await send(pending,true);},{recovery:true}));
  $('op-ack').addEventListener('click',()=>run(async()=>{await check();if(!pending)return;if(known?.status!=='failed'&&!(known===null&&pending.rejected))throw Error('An uncertain or active request cannot be dismissed.');if(confirm('Acknowledge this recorded failure? Its request and receipt stay in the original workspace.')){forgetRequest();await list();}},{recovery:true}));
  $('op-request-download').addEventListener('click',()=>{if(pending)downloadable('grist-operating-request-'+pending.requestId+'.json',json(pending)+'\n');});
  $('op-restore-draft').addEventListener('click',()=>run(async()=>{
    const saved=JSON.parse(localStorage.getItem(key('draft'))||'null');if(!saved||saved.directory!==directory)throw Error('No retained browser draft for this workspace.');
    if(!confirmReplace())return;const result=await call('read',{planId:saved.planId});
    validateDraft(saved.draft,saved.planId,saved.draft?.baseRevision);
    if(result.version!==saved.version||result.draft.baseRevision!==saved.draft.baseRevision){downloadable('grist-retained-draft.json',json(saved)+'\n');throw Error('The saved plan advanced; the earlier editable draft was downloaded intact. Reopen and reconcile it explicitly.');}
    if(saved.origin&&!sameOrigin(saved.origin,origin))throw Error('The earlier draft belongs to another original workspace.');
    if(!saved.origin&&!sameOrigin(saved.draft?.origin,origin)){downloadable('grist-retained-draft.json',json(saved)+'\n');if(!confirm('This older draft has no stored workspace origin. Its complete file was downloaded. Explicitly receive its authored fields into the currently open original plan?'))return;}
    install(result);draft=clone(saved.draft);dirty=!same(draft,result.draft);selectedStep=draft.content.steps[0]?.id??null;renderEditor();draftCache();
  }));
  window.addEventListener('beforeunload',event=>{if(dirty||pending||editorWrites||editorFault&&editorChangedFlag){event.preventDefault();event.returnValue='';}});
  window.addEventListener('storage',event=>{if(!directory||!event.key?.startsWith(requestPrefix())||working)return;try{const m=markers();if(!pending&&m.length){pending=m[0];known=undefined;}sync();}catch(e){setBlocked(true);notice(message(e),true);}});
  async function initialize(){
    if(working||editorOpening)return;
    if(initialized){if(!pending)await run(async()=>{await list();await sources();});return;}
    const context=getContext();if(!context.ready)return;directory=context.directory;working=true;editorInitializing=true;sync();
    try{
      await list();pending=markers()[0]??null;await initializeEditor();initialized=true;
      const saved=markers();pending=saved[0]??null;
      let retained=null;try{retained=JSON.parse(localStorage.getItem(key('draft'))||'null');}catch(e){notice('The earlier local draft could not be read. '+message(e),true);}
      $('op-draft-retained').textContent=retained?'An earlier local draft is available for explicit inspection and restoration. It remains separate from each window’s complete editor.':'No earlier local draft is retained.';
      await sources();if(pending)await check();
    }catch(e){
      if(origin){initialized=true;editorInitialized=true;editorFault=e;}
      notice('Your complete current editor remains available to download. '+message(e),true);
    }finally{working=false;editorInitializing=false;sync();}
  }
  document.querySelector('[data-view="operating"]').addEventListener('click',()=>{initialize();});
  sync();
  return {initialize,blocked:()=>working||Boolean(pending)||editorInitializing||editorOpening,contextChanged:sync};
}
async function hashBytes(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
