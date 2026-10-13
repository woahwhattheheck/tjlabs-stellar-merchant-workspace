// MIT. Complete unfinished Incident configuration, separate from the original watcher.
export const INCIDENT_WRITING_SCHEMA='stellar-forge.incident-writing.v1';
export const INCIDENT_WRITING_LIMIT=16*1024*1024;
const TEXT_LIMIT=240000,KEY='stellar-forge.incident-writing.v1',COPY=KEY+':copy:';
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const bytes=value=>new TextEncoder().encode(value).length;
export function incidentCanonical(value) {
  if(Array.isArray(value))return '['+value.map(incidentCanonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+incidentCanonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const same=(a,b)=>incidentCanonical(a)===incidentCanonical(b);
const now=()=>new Date().toISOString();
function time(value){return typeof value==='string'&&Number.isFinite(Date.parse(value));}
function base(value) {
  need(plain(value)&&Number.isSafeInteger(value.revision)&&value.revision>0&&
    typeof value.hash==='string'&&/^[a-f0-9]{64}$/.test(value.hash)&&plain(value.config),
    'Retain the complete original watcher revision, configuration and digest.');
}
function source(value) {
  need(plain(value)&&typeof value.id==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id)&&!['__proto__','prototype','constructor'].includes(value.id),
    'Retain the original registered incident source.');
}
function pending(value) {
  if(value===null)return;
  need(plain(value)&&time(value.requestedAt)&&plain(value.payload)&&
    Number.isSafeInteger(value.payload.expectedConfigRevision)&&value.payload.expectedConfigRevision>0&&
    plain(value.payload.config)&&typeof value.baseHash==='string'&&/^[a-f0-9]{64}$/.test(value.baseHash),
    'Retain the whole original configuration request.');
  need(value.writingText===undefined||typeof value.writingText==='string'&&bytes(value.writingText)<=TEXT_LIMIT,'Retain the original writing selected for this request.');
  if(value.accepted!==undefined)need(plain(value.accepted)&&time(value.accepted.at)&&
    Number.isSafeInteger(value.accepted.configRevision)&&value.accepted.configRevision>0&&
    typeof value.accepted.configHash==='string'&&/^[a-f0-9]{64}$/.test(value.accepted.configHash),'Retain the actual original server acceptance.');
}
function edition(value) {
  need(plain(value)&&time(value.at)&&typeof value.reason==='string','Retain each complete earlier working edition.');
  source(value.source);base(value.base);pending(value.pending);
  need(typeof value.text==='string'&&bytes(value.text)<=TEXT_LIMIT,'The complete configuration writing is too large.');
}
export function validateIncidentWriting(value) {
  need(plain(value)&&value.schema===INCIDENT_WRITING_SCHEMA,'Open an original Incident configuration working copy.');
  need(typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)&&
    typeof value.label==='string'&&value.label.length<=160&&time(value.createdAt)&&time(value.updatedAt),
    'Retain the original working-copy identity and dates.');
  source(value.source);base(value.base);pending(value.pending);
  need(typeof value.text==='string'&&bytes(value.text)<=TEXT_LIMIT,'The complete configuration writing is too large.');
  need(Array.isArray(value.editions)&&Array.isArray(value.requests),'Retain the earlier writing and original apply records.');
  for(const row of value.editions)edition(row);
  for(const row of value.requests){need(plain(row)&&time(row.at)&&typeof row.outcome==='string','Retain each original apply result.');pending(row.request);need(row.request!==null,'Retain the original apply request.');}
  need(bytes(JSON.stringify(value))<=INCIDENT_WRITING_LIMIT,'This complete working copy exceeds 16 MiB. Download the current copy before starting another.');
  return clone(value);
}
export function createIncidentWriting(current,{id=crypto.randomUUID(),at=now()}={}) {
  const value={schema:INCIDENT_WRITING_SCHEMA,id,label:current.source.label||current.source.id,
    createdAt:at,updatedAt:at,source:clone(current.source),
    base:{revision:current.configRevision,hash:current.configHash,config:clone(current.config)},
    text:JSON.stringify(current.config,null,2),pending:null,editions:[],requests:[]};
  return validateIncidentWriting(value);
}
export function readIncidentWriting(text) {
  need(typeof text==='string'&&bytes(text)<=INCIDENT_WRITING_LIMIT,'Open the complete working-copy JSON within 16 MiB.');
  return validateIncidentWriting(JSON.parse(text.replace(/^\uFEFF/,'')));
}
export function exportIncidentWriting(value) {
  const text=JSON.stringify(validateIncidentWriting(value))+'\n';
  need(bytes(text)<=INCIDENT_WRITING_LIMIT,'This complete export exceeds 16 MiB.');return text;
}
export function incidentWritingState(value,current) {
  const record=validateIncidentWriting(value);
  if(!current||record.source.id!==current.source.id)return 'OTHER_SOURCE';
  if(!same(record.source,current.source))return 'SOURCE_CHANGED';
  if(record.pending?.accepted){const receipt=record.pending.accepted;
    return receipt.configRevision===current.configRevision&&receipt.configHash===current.configHash?
      'REQUEST_ACCEPTED_CURRENT':'REQUEST_ACCEPTED_ADVANCED';}
  if(record.pending&&current.configRevision>=record.pending.payload.expectedConfigRevision&&same(record.pending.payload.config,current.config))return 'REQUEST_MATCHES_CURRENT';
  if(record.pending)return record.pending.payload.expectedConfigRevision===current.configRevision&&
    record.pending.baseHash===current.configHash?'REQUEST_ORIGINAL_REVISION':'REQUEST_CURRENT_DIFFERS';
  return record.base.revision===current.configRevision&&record.base.hash===current.configHash?'CURRENT':'CURRENT_CHANGED';
}
function retainEdition(record,reason) {
  record.editions.push({at:now(),reason,source:clone(record.source),base:clone(record.base),
    text:record.text,pending:clone(record.pending)});
}
function requestResult(record,outcome,current=null) {
  if(record.pending)record.requests.push({at:now(),outcome,request:clone(record.pending),
    observed:current?{revision:current.configRevision,hash:current.configHash,config:clone(current.config)}:null});
  record.pending=null;
}
export function advanceIncidentWriting(value,current,{keepText=false,reason='Reviewed current settings'}={}) {
  const record=validateIncidentWriting(value);need(current?.source.id===record.source.id,'Select this original source before continuing its writing.');
  retainEdition(record,reason);
  if(record.pending)requestResult(record,'RETAINED_FOR_CURRENT_REVIEW',current);
  record.source=clone(current.source);record.base={revision:current.configRevision,hash:current.configHash,config:clone(current.config)};
  if(!keepText)record.text=JSON.stringify(current.config,null,2);
  record.updatedAt=now();return validateIncidentWriting(record);
}
export function prepareIncidentApply(value,current,config) {
  const record=validateIncidentWriting(value);
  need(!record.pending,'Reconcile the retained original apply request before preparing another.');
  need(incidentWritingState(record,current)==='CURRENT','Review this writing against the current source and revision first.');
  need(plain(config),'Use a configuration object for the original watcher.');
  record.pending={requestedAt:now(),baseHash:record.base.hash,writingText:record.text,
    payload:{config:clone(config),expectedConfigRevision:record.base.revision}};
  record.updatedAt=now();return validateIncidentWriting(record);
}
export function recordIncidentAcceptance(value,result) {
  const record=validateIncidentWriting(value);need(record.pending,'Retain the original apply request.');
  need(Number.isSafeInteger(result?.configRevision)&&result.configRevision>=record.pending.payload.expectedConfigRevision&&
    typeof result.configHash==='string'&&/^[a-f0-9]{64}$/.test(result.configHash),'Retain the original server response revision and digest.');
  record.pending.accepted={at:now(),configRevision:result.configRevision,configHash:result.configHash};
  record.updatedAt=now();return validateIncidentWriting(record);
}
export function reconcileIncidentApply(value,current,{rejected=null}={}) {
  const record=validateIncidentWriting(value);if(!record.pending)return record;
  if(rejected){record.pending.lastRejection={at:now(),message:String(rejected).slice(0,400)};
    record.updatedAt=now();return validateIncidentWriting(record);}
  const state=incidentWritingState(record,current);
  if(state==='REQUEST_ACCEPTED_CURRENT'||state==='REQUEST_MATCHES_CURRENT'){
    const unchangedText=record.text===(record.pending.writingText??JSON.stringify(record.pending.payload.config,null,2));
    retainEdition(record,state==='REQUEST_ACCEPTED_CURRENT'?'Original server accepted configuration':'Current configuration matches retained request');
    requestResult(record,state==='REQUEST_ACCEPTED_CURRENT'?'SERVER_ACCEPTED':'CURRENT_SETTINGS_MATCH',current);
    record.source=clone(current.source);record.base={revision:current.configRevision,hash:current.configHash,config:clone(current.config)};
    if(unchangedText)record.text=JSON.stringify(current.config,null,2);record.updatedAt=now();
  }
  return validateIncidentWriting(record);
}

/** Tab-local recovery and immutable named browser copies; no watcher mutation. */
export function mountIncidentWriting({root,readCurrent,readDraft,restore,isBusy,onControls=()=>{},say=()=>{},signal}) {
  let records=Object.create(null),active=null,restored=null,disposed=false,storageWarning='',reviewedAt=null,retry=null;
  const add=(parent,tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.append(node);return node;};
  const panel=add(root,'section');panel.className='incident-writing';panel.id='incident-writing';
  add(panel,'h3','Configuration working copies');
  add(panel,'p','Unfinished text stays separate from the running watcher. Keep a named copy or download the whole writing, original settings and apply history.');
  const status=add(panel,'p');status.id='incident-writing-status';status.className='hint';status.setAttribute('role','status');
  const labelWrap=add(panel,'label','Working-copy name'),label=add(labelWrap,'input');label.id='incident-writing-label';label.maxLength=160;
  const actions=add(panel,'div');actions.className='actions';
  const button=(text,id,run)=>{const node=add(actions,'button',text);node.id=id;node.type='button';node.className='secondary';node.addEventListener('click',()=>{try{run();}catch(e){say(e.message,true);}}, {signal});return node;};
  const save=button('Keep named working copy','incident-writing-save',saveCopy);
  const downloadButton=button('Download complete writing','incident-writing-download',download);
  const copyWrap=add(panel,'label','Saved copies in this browser'),choices=add(copyWrap,'select');choices.id='incident-writing-copies';
  const open=button('Open selected working copy','incident-writing-open',openCopy);
  const importWrap=add(panel,'label','Open a complete configuration working file'),file=add(importWrap,'input');file.type='file';file.accept='.json,application/json';file.id='incident-writing-file';
  const comparison=add(panel,'details');comparison.id='incident-writing-comparison';
  add(comparison,'summary','Review original settings, current settings and unfinished text');
  const comparisonText=add(comparison,'p');comparisonText.className='hint';
  const baseText=add(comparison,'pre'),currentText=add(comparison,'pre'),draftText=add(comparison,'pre');
  for(const pre of [baseText,currentText,draftText])pre.tabIndex=0;
  const decision=add(comparison,'div');decision.className='actions';
  const decide=(title,id,keepText)=>{const node=add(decision,'button',title);node.type='button';node.id=id;node.className='secondary';
    node.addEventListener('click',()=>{try{
      const current=readCurrent();need(active&&current&&!isBusy(),'Wait for the current source.');
      need(reviewedAt===current.source.id+':'+current.configRevision+':'+current.configHash,'Open the comparison and review its current revision first.');
      capture();active=advanceIncidentWriting(active,current,{keepText,reason:keepText?'Operator retained writing against reviewed current settings':'Operator reopened reviewed current settings'});
      remember();apply();draw();onControls();say('Earlier writing and any original apply request are retained in this complete working copy.');
    }catch(e){say(e.message,true);}}, {signal});return node;};
  const keep=decide('Keep writing against reviewed current revision','incident-writing-rebase',true);
  const reload=decide('Use current settings and retain earlier writing','incident-writing-current',false);
  function readStorage(){
    try {const value=JSON.parse(sessionStorage.getItem(KEY)||'{}');need(plain(value),'The retained Incident writing list is invalid.');
      for(const [id,row]of Object.entries(value)){const record=validateIncidentWriting(row);need(record.source.id===id,'Retained writing has a different source.');records[id]=record;}
    }catch(e){storageWarning='Browser recovery could not be read: '+e.message;}
  }
  function remember(){
    if(!active)return;
    active.updatedAt=now();active=validateIncidentWriting(active);records[active.source.id]=clone(active);
    try{sessionStorage.setItem(KEY,JSON.stringify(records));storageWarning='';}
    catch(e){storageWarning='Browser storage is unavailable; this writing remains in this page. Download it before leaving.';}
  }
  function apply(){if(!active)return;
    const value={text:active.text,revision:active.base.revision,
      dirty:active.text!==JSON.stringify(active.base.config,null,2)||Boolean(active.pending)||incidentWritingState(active,readCurrent())!=='CURRENT'};
    const draft=readDraft();if(draft.text!==value.text||draft.revision!==value.revision||draft.dirty!==value.dirty)restore(value);
  }
  function draw(){
    if(disposed)return;const current=readCurrent(),state=active?incidentWritingState(active,current):null;
    const labels={CURRENT:'Writing is based on the current watcher revision.',CURRENT_CHANGED:'Current watcher settings advanced. Your complete earlier writing is retained.',
      SOURCE_CHANGED:'The registered source selection changed. Review both original and current settings.',
      OTHER_SOURCE:'Select this working copy’s registered source.',
      REQUEST_MATCHES_CURRENT:'Current settings match the retained original request.',
      REQUEST_ACCEPTED_CURRENT:'The original server acceptance matches this current revision.',
      REQUEST_ACCEPTED_ADVANCED:'The server accepted the original request; the current read has a different revision. Refresh or review both retained editions.',
      REQUEST_ORIGINAL_REVISION:'The original apply request is retained. The current read still has its original revision.',
      REQUEST_CURRENT_DIFFERS:'The original apply request is retained; current settings differ. Review before continuing.'};
    status.textContent=(labels[state]||'Choose a registered source.')+(active?' Base revision '+active.base.revision+'.':'')+
      (active?.pending?.lastRejection?' Latest attempt: '+active.pending.lastRejection.message+'. The original request remains retained.':'')+
      (storageWarning?' '+storageWarning:'');
    if(active&&document.activeElement!==label)label.value=active.label;
    const disabled=isBusy()||!active;
    for(const node of [label,save,downloadButton,file])node.disabled=disabled;
    open.disabled=disabled||!choices.value;keep.disabled=disabled||!current;reload.disabled=disabled||!current;
    if(retry){retry.hidden=!active?.pending||Boolean(active.pending.accepted);retry.disabled=isBusy()||!active?.pending||Boolean(active.pending.accepted)||!['REQUEST_ORIGINAL_REVISION','REQUEST_CURRENT_DIFFERS'].includes(state);}
    if(comparison.open)renderComparison();
  }
  function renderComparison(){
    const current=readCurrent();if(!active||!current)return;
    reviewedAt=current.source.id+':'+current.configRevision+':'+current.configHash;
    comparisonText.textContent='Original revision '+active.base.revision+' / '+active.base.hash+
      '; current revision '+current.configRevision+' / '+current.configHash+
      '. Continuing writing changes its base only; Apply configuration remains the original watcher action.';
    baseText.textContent='ORIGINAL SETTINGS\n'+JSON.stringify({source:active.source,config:active.base.config,pending:active.pending},null,2);
    currentText.textContent='CURRENT SETTINGS\n'+JSON.stringify({source:current.source,config:current.config},null,2);
    draftText.textContent='UNFINISHED TEXT\n'+active.text;
  }
  function capture(){
    if(disposed||!active)return;const draft=readDraft();
    need(typeof draft.text==='string'&&bytes(draft.text)<=TEXT_LIMIT,'Keep complete configuration writing within 240,000 bytes.');
    active.text=draft.text;active.label=label.value.slice(0,160);remember();draw();
  }
  function observe(current){
    if(disposed||!current)return;
    const sourceId=current.source.id;
    if(restored!==sourceId){
      active=records[sourceId]?validateIncidentWriting(records[sourceId]):createIncidentWriting(current);
      restored=sourceId;label.value=active.label;apply();listCopies();
    }
    if(active?.pending&&['REQUEST_MATCHES_CURRENT','REQUEST_ACCEPTED_CURRENT'].includes(incidentWritingState(active,current))){
      active=reconcileIncidentApply(active,current);remember();apply();
    }
    apply();draw();
  }
  function leave(){capture();restored=null;active=null;reviewedAt=null;draw();}
  function listCopies(){
    const selected=choices.value;choices.replaceChildren();add(choices,'option','Choose a saved copy').value='';
    try{
      const rows=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(COPY))continue;
        try{const row=readIncidentWriting(localStorage.getItem(key));if(!active||row.source.id===active.source.id)rows.push({key,row});}catch{}}
      rows.sort((a,b)=>b.row.updatedAt.localeCompare(a.row.updatedAt));
      for(const {key,row}of rows)add(choices,'option',row.label+' · '+row.updatedAt+' · revision '+row.base.revision).value=key;
      if(rows.some(row=>row.key===selected))choices.value=selected;
    }catch(e){storageWarning='Named browser copies are unavailable; complete file download remains available.';}
    draw();
  }
  function saveCopy(){
    capture();need(active,'Choose the original source first.');const key=COPY+crypto.randomUUID();
    localStorage.setItem(key,exportIncidentWriting(active));listCopies();choices.value=key;draw();
    say('Complete immutable working copy saved in this browser.');
  }
  function replace(value){
    const current=readCurrent(),incoming=validateIncidentWriting(value);
    need(current?.source.id===incoming.source.id,'Select the working copy’s original registered source first.');
    if(active){capture();const earlier=new Set(incoming.editions.map(incidentCanonical));
      for(const row of active.editions)if(!earlier.has(incidentCanonical(row))){incoming.editions.push(clone(row));earlier.add(incidentCanonical(row));}
      incoming.editions.push({at:now(),reason:'Writing retained before opening this complete file',
      source:clone(active.source),base:clone(active.base),text:active.text,pending:clone(active.pending)});
      const existing=new Set(incoming.requests.map(incidentCanonical));
      for(const row of active.requests)if(!existing.has(incidentCanonical(row)))incoming.requests.push(clone(row));}
    active=validateIncidentWriting(incoming);label.value=active.label;remember();apply();reviewedAt=null;comparison.open=true;draw();onControls();
    say('Complete writing opened. Review its retained revision before applying watcher settings.');
  }
  function openCopy(){need(choices.value,'Choose a saved working copy.');replace(readIncidentWriting(localStorage.getItem(choices.value)));}
  function download(){
    capture();const blob=new Blob([exportIncidentWriting(active)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=active.source.id+'-configuration-writing.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function prepare(config){
    capture();active=prepareIncidentApply(active,readCurrent(),config);remember();draw();return clone(active.pending.payload);
  }
  function accepted(result){if(active?.pending){active=recordIncidentAcceptance(active,result);remember();draw();}}
  function rejected(error){if(active?.pending&&[400,401,403,404,409,413,422].includes(error?.status)){
    active=reconcileIncidentApply(active,readCurrent(),{rejected:error.message});remember();draw();}}
  function retryPayload(){need(active?.pending&&!active.pending.accepted,'There is no unanswered original request to retry.');
    need(['REQUEST_ORIGINAL_REVISION','REQUEST_CURRENT_DIFFERS'].includes(incidentWritingState(active,readCurrent())),'The registered source changed. Review its complete original selection before preparing another request.');return clone(active.pending.payload);}
  function canApply(){return !active?.pending&&active&&incidentWritingState(active,readCurrent())==='CURRENT';}
  retry=button('Retry exact original apply','incident-writing-retry',()=>{});
  retry.hidden=true; // The enclosing desk supplies its original mutation transport.
  retry.addEventListener('click',()=>panel.dispatchEvent(new CustomEvent('incident-writing-retry',{bubbles:true})),{signal});
  function controls(){draw();}
  comparison.addEventListener('toggle',()=>{if(comparison.open){capture();renderComparison();}},{signal});
  choices.addEventListener('change',controls,{signal});
  label.addEventListener('input',capture,{signal});
  file.addEventListener('change',async()=>{const selected=file.files[0];if(!selected)return;const selection=readCurrent()?.source.id,record=active?.updatedAt;
    try{need(selected.size<=INCIDENT_WRITING_LIMIT,'Open a complete working file within 16 MiB.');const text=await selected.text();
      need(!disposed&&readCurrent()?.source.id===selection&&active?.updatedAt===record&&!isBusy(),'The current writing changed while this file was read. Open it again.');
      replace(readIncidentWriting(text));
    }catch(e){say(e.message,true);}finally{file.value='';}},{signal});
  readStorage();signal?.addEventListener('abort',()=>{disposed=true;},{once:true});
  return {panel,observe,capture,leave,controls,prepare,accepted,rejected,retryPayload,canApply,
    pending:()=>Boolean(active?.pending),reviewCurrent(){comparison.open=true;capture();renderComparison();},
    destroy(){disposed=true;panel.remove();}};
}
