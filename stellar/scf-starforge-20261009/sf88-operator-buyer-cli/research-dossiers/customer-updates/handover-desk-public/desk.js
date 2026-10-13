// MIT. Customer handover desk over the original retained programme and review requests.
const PAGE=20,MAX_DRAFT=16*1024*1024;
const $=id=>document.getElementById(id);
const clone=value=>JSON.parse(JSON.stringify(value));
const text=value=>typeof value==='string'?value:JSON.stringify(value,null,2);
const canonical=value=>JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?
 value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])));
const equal=(a,b)=>canonical(a)===canonical(b);
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const elem=(tag,body,cls)=>{const n=document.createElement(tag);if(body!==undefined)n.textContent=String(body);if(cls)n.className=cls;return n;};
const human=value=>String(value??'').replaceAll('_',' ').toLowerCase();
const size=value=>Number.isSafeInteger(value)?value.toLocaleString()+' bytes':'';
const query=params=>'?'+new URLSearchParams(params);
const code=error=>error?.code??'REQUEST_INCOMPLETE';
const state={status:null,key:null,owners:new Map(),poll:null,statusRequest:0,valueRequest:0,closed:false,notice:'',initializing:false,completing:false};
let token='';
const authKey='research-handover-desk-token:'+location.origin;
try{
 const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('token')??sessionStorage.getItem(authKey)??'';
 if(fragment.has('token')){sessionStorage.setItem(authKey,token);history.replaceState(null,'',location.pathname+location.search);}
}catch{const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('token')??token;if(fragment.has('token'))history.replaceState(null,'',location.pathname+location.search);}
function notice(message){state.notice=message;$('notice').textContent=message;}
async function response(path,{method='GET',body,raw=false}={}){
 need(token,'DESK_AUTH_REQUIRED');
 const headers={Authorization:'Bearer '+token};
 if(body!==undefined)headers['Content-Type']=raw?'application/octet-stream':'application/json';
 const r=await fetch(path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error'});
 if(!r.ok){let value;try{value=await r.json();}catch{}
  throw Object.assign(new Error(value?.code??value?.error?.code??'DESK_HTTP_'+r.status),{code:value?.code??value?.error?.code??'DESK_HTTP_'+r.status,status:r.status,details:value?.details});}
 return r;
}
async function api(path,options){const r=await response(path,options);return r.json();}
function active(){return state.owners.get(state.key)??null;}
function nativeBusy(){return state.status?.job?.state==='RUNNING';}
function isLocked(owner){return !!owner.remote?.request||!!owner.remote?.draft?.locked||!!owner.remote?.accepted||owner.dispatching||owner.uncertain;}
function currentOwner(key){let o=state.owners.get(key);if(!o){o={key,remote:null,editor:{reviewedBy:'',reviewNote:'',decisions:{}},baseSha:null,
 dirty:false,editVersion:0,saving:false,loading:false,loadRequest:0,dispatching:false,uncertain:false,conflict:null,page:0,filter:'all',uploading:false,error:null};
 state.owners.set(key,o);}return o;}
function fromDraft(value){
 const decisions={};for(const d of value?.decisions??[])decisions[d.itemId]={choice:d.choice,...(d.choice==='EDIT'?{valueText:JSON.stringify(d.value,null,2)}:{})};
 return {reviewedBy:value?.reviewedBy??'',reviewNote:value?.reviewNote??'',decisions};
}
function toDraft(owner){
 const review=owner.remote?.comparison;need(review,'DESK_COMPARISON_REQUIRED');
 const decisions=[];for(const item of review.items){const chosen=owner.editor.decisions[item.id];if(!chosen?.choice)continue;
  need(item.allowedChoices.includes(chosen.choice),'DESK_CHOICE_INVALID');
  const d={itemId:item.id,choice:chosen.choice};if(d.choice==='EDIT'){
   try{d.value=JSON.parse(chosen.valueText??'');}catch{throw Object.assign(new Error('EDIT_JSON_REQUIRED'),{code:'EDIT_JSON_REQUIRED',itemId:item.id});}}
  decisions.push(d);}
 return {reviewedBy:owner.editor.reviewedBy,reviewNote:owner.editor.reviewNote,decisions};
}
function touch(owner){
 owner.editVersion++;owner.dirty=true;owner.error=null;
 if(owner===active())renderControls();
}
function adopt(owner,draft){
 owner.editor=fromDraft(draft?.value);owner.baseSha=draft?.sha256??null;owner.dirty=false;owner.conflict=null;owner.editVersion++;
}
function updateOwner(owner,remote){
 need(remote.key===owner.key,'DESK_ROUND_CHANGED');
 if(owner.remote?.comparison&&remote.comparison)need(owner.remote.comparison.reviewId===remote.comparison.reviewId&&
  owner.remote.comparison.comparisonSha256===remote.comparison.comparisonSha256,'DESK_COMPARISON_CHANGED');
 const request=remote.request;
 if(request){
  need(!owner.remote?.request||equal(request,owner.remote.request),'DESK_RETAINED_REQUEST_CHANGED');
  // Keep local edits exportable until the operator explicitly selects the retained version.
  if(!owner.dirty)owner.editor=fromDraft(request);
  owner.requestEditor=fromDraft(request);owner.dispatching=false;owner.uncertain=false;
 }else if(!owner.dirty&&!owner.saving)adopt(owner,remote.draft);
 else if((remote.draft?.sha256??null)!==owner.baseSha)owner.conflict=remote.draft??{sha256:null,value:null};
 owner.remote=remote;
 if(!request&&!nativeBusy()){owner.dispatching=false;owner.uncertain=false;}
}
function fact(root,label,value){const box=elem('div',undefined,'fact');box.append(elem('small',label),elem('strong',value));root.append(box);}
function renderStatus(){
 const s=state.status;if(!s)return;
 $('customer').textContent=s.selection.customerLabel||'Handover and returns';$('scope').replaceChildren();
 fact($('scope'),'Operation',s.selection.operationId);fact($('scope'),'Dossier',s.selection.dossierId);
 fact($('scope'),'Starting revision',s.selection.expectedRevision);
 fact($('scope'),'Total reviewed items',s.selection.maximumTotalItems);
 fact($('scope'),'Total returns, including earlier returns',s.selection.maximumTotalReturns);
 $('initialize').hidden=s.initialized;$('initialize').disabled=nativeBusy()||state.initializing;
 const job=s.job;$('job').textContent=job?(human(job.action)+' — '+human(job.state)+(job.key?' · '+job.key:'')+
  (job.error?' · '+text(job.error.code??job.error):'')):'';
 const saved=new Map((s.course?.rounds??[]).map(r=>[r.key,r]));
 $('rounds').replaceChildren();for(const r of s.selection.rounds){
  const b=elem('button');b.type='button';b.dataset.round=r.key;b.setAttribute('aria-current',String(r.key===state.key));
  const status=s.course?.state==='COMPLETE'?'applied':saved.get(r.key)?.state??'awaiting source';
  b.append(elem('span',r.key),elem('small',human(status)));b.addEventListener('click',()=>selectRound(r.key));$('rounds').append(b);}
 $('complete').disabled=!s.initialized||nativeBusy()||state.completing||s.course?.state==='COMPLETE'||!s.selection.rounds.every(r=>saved.get(r.key)?.state==='APPLIED');
 const files=s.files??s.downloads??[];
 renderFiles($('final-files'),files);
 if(s.course?.state==='COMPLETE'&&!files.length)$('final-files').append(elem('p','Delivery complete. Refresh saved state to load its archive.'));
 renderControls();
}
function keepFocus(work){
 const a=document.activeElement,id=a?.id,start=a?.selectionStart,end=a?.selectionEnd;
 work();
 if(id&&$(id)&&a!==$(id)){const next=$(id);next.focus({preventScroll:true});if(typeof next.setSelectionRange==='function'&&Number.isInteger(start))next.setSelectionRange(start,end);}
}
function shownEditor(owner){return owner.remote?.request?(owner.requestEditor??fromDraft(owner.remote.request)):owner.remote?.draft?.locked?fromDraft(owner.remote.draft.value):owner.editor;}
function renderRound(){
 const o=active();if(!o)return;
 keepFocus(()=>{
 $('round-title').textContent='Return '+o.key;
 const r=o.remote,review=r?.comparison,locked=isLocked(o),editor=shownEditor(o);
 $('round-summary').textContent=o.loading?'Loading the saved round…':r?.accepted?'Accepted at revision '+(r.accepted.receipt?.revision??r.accepted.revision??'')+'.':
  r?.request?'The exact request is retained. Recover it to finish any interrupted response or exports.':review?'Complete comparison ready for explicit review.':'Retain the original returned dossier to begin.';
 $('source-panel').hidden=!state.status?.initialized;
 const selected=state.status?.selection.rounds.find(v=>v.key===o.key);
 $('source-note').textContent=r?.source?'Retained '+r.source.filename+' · '+size(r.source.bytes)+' · '+r.source.sha256:
  'Maximum selected file size: '+size(selected?.maximum_source_bytes??selected?.maximumSourceBytes);
 $('source').disabled=!!r?.source||nativeBusy()||o.uploading;
 $('upload').disabled=!!r?.source||nativeBusy()||o.uploading||!$('source').files?.length;
 $('prepare').disabled=nativeBusy()||o.uploading||!r?.source;
 $('review-panel').hidden=!review;
 $('comparison-facts').replaceChildren();
 if(review){
  fact($('comparison-facts'),'Changes',review.total);fact($('comparison-facts'),'Current revision',review.current?.revision);
  fact($('comparison-facts'),'Returned revision',review.returned?.revision);fact($('comparison-facts'),'Common base',review.base?.revision);
 }
 if($('reviewer').value!==editor.reviewedBy)$('reviewer').value=editor.reviewedBy;
 if($('review-note').value!==editor.reviewNote)$('review-note').value=editor.reviewNote;
 $('reviewer').disabled=locked;$('review-note').disabled=locked;$('import-draft').disabled=locked;
 $('filter').value=o.filter;
 $('draft-conflict').hidden=!o.conflict||locked;
 $('request-state').hidden=!locked;
 $('request-state').textContent=r?.request?'Saved request '+r.request.requestId+'. The fields below show its fixed decisions. Use Recover original request to reconcile that same operation.'+(o.dirty?' Your separate local edits remain available through Export current edits.':''):
  r?.draft?.locked?'The exact saved draft is frozen for its original request. Recover it to finish retaining and applying those same decisions.':
  o.uncertain?'The response was interrupted. Refresh saved state to read the original request before continuing.':
  o.dispatching?'The saved decisions are being applied.':'This round has an accepted result.';
 renderItems(o);renderFiles($('round-files'),r?.files??[]);$('downloads-section').hidden=!(r?.files?.length);
 renderControls();
 });
}
function renderItems(owner){
 const target=$('items');target.replaceChildren();const review=owner.remote?.comparison;if(!review)return;
 const editor=shownEditor(owner),all=review.items.filter(item=>owner.filter!=='undecided'||!editor.decisions[item.id]?.choice);
 owner.page=Math.max(0,Math.min(owner.page,Math.max(0,Math.ceil(all.length/PAGE)-1)));
 const start=owner.page*PAGE,items=all.slice(start,start+PAGE),locked=isLocked(owner);
 for(const item of items){
  const box=elem('article',undefined,'item');box.dataset.item=item.id;box.append(elem('h3',item.label??item.family??item.kind),
   elem('p',Array.isArray(item.path)?item.path.join(' / '):item.path??item.id,'identity'),
   elem('p',human(item.status)+(item.conflict?' · Both branches changed':'')));
  box.append(elem('p',text(item.effect??''),'effect'));
  const values=elem('div',undefined,'value-links');
  for(const side of ['base','current','returned']){
   const b=elem('button',side[0].toUpperCase()+side.slice(1)+(item[side]?.present?' — read complete value':' — absent'));
   b.type='button';b.dataset.side=side;b.disabled=!item[side]?.present;
   b.addEventListener('click',()=>showValue(owner,item,side));values.append(b);
  }box.append(values);
  const label=elem('label','Decision'),select=elem('select');select.id='choice-'+item.id;select.dataset.choice=item.id;
  select.append(new Option('Choose an action',''));for(const choice of item.allowedChoices)select.append(new Option(item.choiceLabels?.[choice]??choice,choice));
  select.value=editor.decisions[item.id]?.choice??'';select.disabled=locked;label.append(select);box.append(label);
  select.addEventListener('change',()=>{
   if(isLocked(owner))return;const old=owner.editor.decisions[item.id]??{};
   owner.editor.decisions[item.id]={...old,choice:select.value,...(select.value==='EDIT'&&!Object.hasOwn(old,'valueText')?{valueText:''}:{})};
   touch(owner);renderRound();
  });
  if(select.value==='EDIT'){
   const l=elem('label','Complete reviewed value (JSON)'),input=elem('textarea');input.id='edit-'+item.id;input.dataset.edit=item.id;
   input.className='edit-json';input.rows=8;input.spellcheck=false;input.value=editor.decisions[item.id]?.valueText??'';
   input.disabled=locked;input.addEventListener('input',()=>{if(isLocked(owner))return;owner.editor.decisions[item.id].valueText=input.value;touch(owner);});
   l.append(input);box.append(l);box.append(elem('p','Enter the complete original value with your reviewed edits. The native dependency check validates the result before applying it.'));
  }
  target.append(box);
 }
 if(!all.length)target.append(elem('p',owner.filter==='undecided'?'Every change has a choice.':'The comparison has no differing items. Save the named review to retain this explicit review.'));
 $('page-label').textContent=all.length?(start+1)+'–'+Math.min(start+PAGE,all.length)+' of '+all.length:'0 changes';
 $('previous').disabled=owner.page===0;$('next').disabled=start+PAGE>=all.length;
}
function renderControls(){
 const o=active();if(!o)return;const review=o.remote?.comparison,locked=isLocked(o),n=review?.items.filter(i=>shownEditor(o).decisions[i.id]?.choice).length??0;
 $('decision-count').textContent=n+' of '+(review?.total??0)+' changes selected';
 $('save-draft').disabled=!review||locked||o.saving||!!o.conflict;
 $('apply').disabled=!review||locked||o.saving||o.dirty||!!o.conflict||!o.baseSha||n!==review.total||!o.editor.reviewedBy.trim()||nativeBusy();
 $('export-draft').disabled=!review;$('recover').hidden=!o.remote?.request&&!o.remote?.draft?.locked&&!o.uncertain;
 $('recover').disabled=nativeBusy()||o.dispatching||(!o.remote?.request&&!o.remote?.draft?.locked&&o.uncertain);
 $('save-state').textContent=o.error?'Review retained on screen. '+o.error:o.saving?'Saving the complete draft…':
  o.dirty?'Unsaved edits. Save the draft or export your current edits before closing this page.':
  o.baseSha?'Draft saved. '+o.baseSha:'Save a review draft after making your selections.';
}
async function loadRound(owner){
 const request=++owner.loadRequest;owner.loading=true;if(owner===active())renderRound();
 try{const r=await api('/api/round'+query({key:owner.key}));if(request!==owner.loadRequest)return;
  updateOwner(owner,r);owner.error=null;
 }catch(error){owner.error=code(error);if(owner===active())notice('Could not read this saved round: '+code(error));}
 finally{if(request===owner.loadRequest){owner.loading=false;if(owner===active())renderRound();}}
}
async function selectRound(key){
 const o=currentOwner(key);state.key=key;$('source').value='';renderStatus();renderRound();await loadRound(o);
}
async function refresh({round=true}={}){
 const id=++state.statusRequest;
 try{
  const old=state.status,s=await api('/api/status');if(id!==state.statusRequest)return;
  need(s.selection&&Array.isArray(s.selection.rounds),'DESK_STATUS_INVALID');
  if(old)need(s.selection.operationId===old.selection.operationId&&s.selection.workspaceId===old.selection.workspaceId&&
   s.selection.dossierId===old.selection.dossierId,'DESK_SELECTION_CHANGED');
  state.status=s;state.initializing=false;state.completing=false;renderStatus();
  if(!state.key&&s.selection.rounds.length){await selectRound(s.selection.rounds[0].key);}
  else if(round&&active()&&!active().saving)await loadRound(active());
  if(state.notice==='Connecting to the selected workspace…')notice('');
  schedulePoll();
 }catch(error){notice('Saved state is unavailable: '+code(error)+'. Use the original private desk URL if this host was restarted.');schedulePoll();}
}
function schedulePoll(){
 clearTimeout(state.poll);if(state.closed)return;
 if(nativeBusy()||state.initializing||state.completing)state.poll=setTimeout(()=>refresh({round:true}),2000);
}
async function startJob(action,body,owner){
 try{
  const result=await api('/api/'+action,{method:'POST',body});state.status.job=result.job??result;
  notice('Started '+human(action)+(owner?' for '+owner.key:'')+'. Saved results remain available if the connection closes.');
  await refresh({round:true});schedulePoll();return result;
 }catch(error){
  if(owner&&action==='apply'){owner.uncertain=true;owner.dispatching=false;}
  notice('The '+human(action)+' response did not complete: '+code(error)+'. Refresh saved state to recover the original operation.');
  await refresh({round:true});return null;
 }finally{if(owner===active())renderRound();}
}
async function saveDraft(owner){
 if(owner.saving||isLocked(owner)||owner.conflict)return;
 let value;try{value=toDraft(owner);}catch(error){owner.error=code(error)+(error.itemId?' · '+error.itemId:'');renderControls();return;}
 const version=owner.editVersion,expected=owner.baseSha;owner.saving=true;owner.error=null;renderControls();
 try{
  const result=await api('/api/draft',{method:'POST',body:{key:owner.key,expectedSha256:expected,value}});
  need(result.sha256&&result.value,'DESK_DRAFT_RESPONSE_INVALID');owner.baseSha=result.sha256;
  owner.remote={...owner.remote,draft:result};
  if(owner.editVersion===version){owner.editor=fromDraft(result.value);owner.dirty=false;}
  owner.conflict=null;
 }catch(error){
  owner.error=code(error);notice('Your edits remain on screen. The saved draft could not be updated: '+code(error));
 }finally{
  owner.saving=false;if(owner===active())renderControls();
  await loadRound(owner);
 }
}
async function upload(owner){
 const file=$('source').files?.[0];if(!file||owner.uploading)return;
 const selected=state.status.selection.rounds.find(r=>r.key===owner.key),maximum=selected.maximum_source_bytes??selected.maximumSourceBytes;
 if(file.size>maximum){notice('This file exceeds the selected round size. Keep the original bytes and revise the agreed selection before starting another operation.');return;}
 owner.uploading=true;renderRound();
 try{
  const contentType=/\.(gz|gzip)$/i.test(file.name)?'application/gzip':/\.json$/i.test(file.name)?'application/json':'application/octet-stream';
  await api('/api/source'+query({key:owner.key,filename:file.name,contentType}),{method:'POST',body:file,raw:true});
  notice('Complete original file retained for '+owner.key+'. Prepare its full comparison.');
 }catch(error){notice('The original file response did not complete: '+code(error)+'. Refresh the round to reconcile its saved source.');}
 finally{owner.uploading=false;await loadRound(owner);}
}
function saveBlob(blob,name){
 const url=URL.createObjectURL(blob),a=elem('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportDraft(owner){
 const r=owner.remote.comparison;saveBlob(new Blob([JSON.stringify({schema:'research-handover-desk-edits.v1',
 operationId:state.status.selection.operationId,workspaceId:state.status.selection.workspaceId,dossierId:state.status.selection.dossierId,
 key:owner.key,reviewId:r.reviewId,comparisonSha256:r.comparisonSha256,expectedRevision:r.current.revision,
 savedDraftSha256:owner.baseSha,editor:owner.editor},null,2)+'\n'],{type:'application/json'}),'review-'+owner.key+'.json');
}
async function importDraft(owner,file){
 if(!file||isLocked(owner))return;
 try{
  need(file.size<=MAX_DRAFT,'DESK_DRAFT_SIZE_LIMIT');const raw=await file.text(),value=JSON.parse(raw),r=owner.remote?.comparison;
  need(value.schema==='research-handover-desk-edits.v1'&&value.operationId===state.status.selection.operationId&&
   value.workspaceId===state.status.selection.workspaceId&&value.dossierId===state.status.selection.dossierId&&
   value.key===owner.key&&value.reviewId===r?.reviewId&&value.comparisonSha256===r.comparisonSha256&&
   value.expectedRevision===r.current.revision,'DESK_DRAFT_SELECTION_CHANGED');
  need(typeof value.editor?.reviewedBy==='string'&&typeof value.editor.reviewNote==='string'&&
   value.editor.decisions&&typeof value.editor.decisions==='object'&&!Array.isArray(value.editor.decisions),'DESK_DRAFT_INVALID');
  for(const[id,d]of Object.entries(value.editor.decisions)){
   const item=r.items.find(i=>i.id===id);need(item&&typeof d.choice==='string'&&(!d.choice||item.allowedChoices.includes(d.choice))&&
    (d.choice!=='EDIT'||typeof d.valueText==='string'),'DESK_DRAFT_CHOICE_INVALID');
  }
  // An imported file is an explicit new local edit against the currently saved draft.
  need(!isLocked(owner),'DESK_REQUEST_ALREADY_RETAINED');owner.editor=clone(value.editor);touch(owner);renderRound();
  notice('Review edits imported. Read them, then save the draft before applying.');
 }catch(error){notice('Review file was not imported: '+code(error));}
}
async function showValue(owner,item,side){
 const id=++state.valueRequest,dialog=$('value-dialog');$('value-title').textContent=(side[0].toUpperCase()+side.slice(1))+' · '+(item.label??item.id);
 $('value-identity').textContent=item.id+' · '+item[side].sha256;$('value-body').textContent='Loading the complete value…';
 if(!dialog.open)dialog.showModal();
 try{
  const value=await api('/api/value'+query({key:owner.key,item:item.id,side}));
  need(value.reviewId===owner.remote.comparison.reviewId&&value.itemId===item.id&&value.side===side&&
   value.present===true&&value.sha256===item[side].sha256&&Object.hasOwn(value,'value'),'DESK_COMPLETE_VALUE_CHANGED');
  if(id===state.valueRequest)$('value-body').textContent=JSON.stringify(value.value,null,2);
 }catch(error){if(id===state.valueRequest)$('value-body').textContent='Complete value unavailable: '+code(error);}
}
function renderFiles(root,files){
 root.replaceChildren();for(const f of files){
  if(!f?.id)continue;const row=elem('div',undefined,'download'),b=elem('button',f.label??f.filename??'Download original');b.type='button';b.dataset.download=f.id;
  b.addEventListener('click',()=>download(f,b));row.append(b,elem('span',size(f.bytes)));root.append(row);
 }
}
async function download(file,button){
 button.disabled=true;
 try{
  const r=await response('/api/download'+query({id:file.id})),body=await r.arrayBuffer(),declared=r.headers.get('content-length');
  need(declared!==null&&/^[0-9]+$/.test(declared)&&body.byteLength===Number(declared),'DESK_DOWNLOAD_LENGTH_CHANGED');
  if(file.bytes!==undefined)need(body.byteLength===file.bytes,'DESK_DOWNLOAD_LENGTH_CHANGED');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const header=r.headers.get('x-content-sha256')??r.headers.get('x-sha256'),expected=file.sha256??header;
  need(typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&hash===expected&&(!header||header===hash),'DESK_DOWNLOAD_HASH_CHANGED');
  const disposition=r.headers.get('content-disposition')??'',utf=disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const name=utf?decodeURIComponent(utf[1]):disposition.match(/filename="([^"]+)"/i)?.[1]??file.filename??'research-handover.bin';
  need(name.length>0&&name.length<=512&&!/[\u0000-\u001f\u007f/\\]/.test(name),'DESK_DOWNLOAD_FILENAME_INVALID');
  saveBlob(new Blob([body],{type:r.headers.get('content-type')??'application/octet-stream'}),name);
  notice('Downloaded '+name+' · '+size(body.byteLength)+'. Complete bytes verified.');
 }catch(error){notice('Download could not be completed: '+code(error)+'. The original retained file remains selected.');}
 finally{button.disabled=false;}
}
$('refresh').addEventListener('click',()=>refresh());
$('initialize').addEventListener('click',()=>{state.initializing=true;renderStatus();startJob('init',{});});
$('complete').addEventListener('click',()=>{state.completing=true;renderStatus();startJob('complete',{});});
$('source').addEventListener('change',()=>{if(active())$('upload').disabled=!$('source').files?.length||active().uploading||nativeBusy()||!!active().remote?.source;});
$('upload').addEventListener('click',()=>active()&&upload(active()));
$('prepare').addEventListener('click',()=>active()&&startJob('prepare',{key:active().key},active()));
$('reviewer').addEventListener('input',()=>{const o=active();if(!o||isLocked(o))return;o.editor.reviewedBy=$('reviewer').value;touch(o);});
$('review-note').addEventListener('input',()=>{const o=active();if(!o||isLocked(o))return;o.editor.reviewNote=$('review-note').value;touch(o);});
$('save-draft').addEventListener('click',()=>active()&&saveDraft(active()));
$('export-draft').addEventListener('click',()=>active()&&exportDraft(active()));
$('import-draft').addEventListener('change',()=>{const owner=active(),file=$('import-draft').files?.[0];$('import-draft').value='';if(owner)importDraft(owner,file);});
$('use-saved').addEventListener('click',()=>{const o=active();if(!o||isLocked(o))return;adopt(o,o.remote?.draft);renderRound();});
$('apply').addEventListener('click',()=>{
 const o=active();if(!o||$('apply').disabled)return;o.dispatching=true;renderRound();startJob('apply',{key:o.key,draftSha256:o.baseSha},o);
});
$('recover').addEventListener('click',()=>{
 const o=active();if(!o||$('recover').disabled)return;o.dispatching=true;renderRound();startJob('apply',{key:o.key,draftSha256:o.remote?.request?null:o.remote?.draft?.sha256},o);
});
$('filter').addEventListener('change',()=>{const o=active();if(!o)return;o.filter=$('filter').value;o.page=0;renderItems(o);});
$('previous').addEventListener('click',()=>{const o=active();if(o){o.page--;renderItems(o);}});
$('next').addEventListener('click',()=>{const o=active();if(o){o.page++;renderItems(o);}});
$('close-value').addEventListener('click',()=>{state.valueRequest++;$('value-dialog').close();});
$('value-dialog').addEventListener('close',()=>{state.valueRequest++;});
window.addEventListener('beforeunload',event=>{
 if([...state.owners.values()].some(o=>o.dirty||o.saving)){event.preventDefault();event.returnValue='';}
});
window.addEventListener('pagehide',()=>{state.closed=true;clearTimeout(state.poll);});
window.addEventListener('pageshow',()=>{state.closed=false;refresh();});
if(!token)notice('Open this desk using the original private URL printed by its installed command.');
else refresh();
