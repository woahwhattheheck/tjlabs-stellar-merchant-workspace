// SPDX-License-Identifier: MIT
import {REVIEW_SCHEMA,REVIEW_DESK_SCHEMA,REVIEW_LIMITS,verifySourceReview,readSourceReviewBytes,newReviewDraft,saveReviewEdition,verifySourceReviewDesk,newSourceReviewDesk,retainedReviewFile,readRetainedReviewFile,reviewBytes,reviewEqual,verifySameIssue} from './source-review-model.mjs';
import {openSourceDeskState,listSourceReviewDesks} from './source-preparation-state.mjs';
import {decodeWholeBase64,bytesSha256} from './source-preparation-capsule.mjs';
import {loadReviewSourceProject,buildPortableSourceReview} from './source-review-portable.mjs';
const $=id=>document.getElementById(id),copy=value=>structuredClone(value),utf8=value=>new TextEncoder().encode(value),json=value=>JSON.stringify(value,null,2);
const error=message=>{throw new Error(message);};
let state=null,verified=null,storage=null,busy=false,blocked=false,incoming=null,selectedItem=null,filePage=0,selectedFile=null,caseCursor=null,conflictCursor=null;
let editVersion=0,savedVersion=0,persistedRevision=0,saveTimer=null,savePromise=Promise.resolve(),lastSaveError=null;
function notice(message,level='info'){$('notice').hidden=false;$('notice').dataset.level=level;$('notice').textContent=message;}
function download(name,bytes,type='application/json'){
 const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function fact(parent,label,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);parent.append(dt,dd);}
function button(label,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>action(handler));return b;}
function uneditedDraft(){return state&&verified&&reviewEqual(state.draft,newReviewDraft(verified));}
function updateStatus(){
 document.querySelector('main').setAttribute('aria-busy',String(busy));
 $('save-state').textContent=blocked?(lastSaveError?.code==='DRAFT_CONFLICT'?'Conflicting draft retained':'Unsaved local record'):lastSaveError?'Save needs attention':editVersion!==savedVersion?'Unsaved changes':state?'Saved revision '+persistedRevision:'Opening';
 $('conflict-panel').hidden=!blocked;
 $('conflict-title').textContent=lastSaveError?.code==='DRAFT_CONFLICT'?'Another page saved this review':'The local review could not be saved';
 $('conflict-description').textContent=lastSaveError?.code==='DRAFT_CONFLICT'?'Your complete conflicting draft is retained separately. Download it or restore a retained conflict explicitly after reopening the current review.':'Keep this page open and download your complete local record. Browser storage could not retain the latest changes; reopening the saved review will select its earlier saved edition.';
 $('editor-fields').disabled=busy||blocked||!state;
 for(const id of ['save-edition','submit-edition','save-work','export-portable','download-project','download-working','download-return','receive-incoming','reopen-current','open-package','open-working','refresh-cases','item-previous','item-next','refresh-conflicts','cases-first','cases-next','conflicts-first','conflicts-next'])$(id).disabled=busy||(blocked&&!['reopen-current','open-package','open-working','refresh-cases','cases-first','cases-next','refresh-conflicts','conflicts-first','conflicts-next'].includes(id));
 $('download-return').disabled=busy||blocked||!state||state.package.editions.at(-1)?.status!=='submitted'||!uneditedDraft();
 $('cases-next').disabled=busy||!caseCursor;$('conflicts-next').disabled=busy||!conflictCursor;
 if(!state){for(const id of ['save-edition','submit-edition','save-work','export-portable','download-project','download-working'])$(id).disabled=true;}
}
function markDirty(){editVersion++;lastSaveError=null;updateStatus();clearTimeout(saveTimer);saveTimer=setTimeout(()=>{persist().catch(e=>notice(e.message,'error'));},350);}
async function persist(){
 clearTimeout(saveTimer);
 savePromise=savePromise.catch(()=>{}).then(async()=>{
  if(!state||editVersion===savedVersion)return;
  if(blocked)error('Download or reopen the retained conflicting draft before saving another change.');
  while(editVersion!==savedVersion){
   const version=editVersion,snapshot=copy(state);
   try{
    reviewBytes(snapshot,REVIEW_LIMITS.workingBytes);
    const saved=await storage.save(snapshot,persistedRevision);persistedRevision=saved.revision;state.revision=saved.revision;savedVersion=version;lastSaveError=null;
   }catch(e){
    lastSaveError=e;blocked=true;
    if(e.code==='DRAFT_CONFLICT'&&version!==editVersion){
     try{await storage.preserveConflict(copy(state));}
     catch(failure){lastSaveError=Object.assign(new Error('The original conflicting snapshot is retained, but the latest local edits could not be saved. Download the complete local record before reopening. '+failure.message),{code:'RECOVERY_STORAGE'});}
    }
    updateStatus();throw lastSaveError;
   }
  }
  updateStatus();
 });
 return savePromise;
}
async function action(fn,{allowBlocked=false}={}){
 if(busy)return;
 busy=true;updateStatus();
 try{
  if(state&&editVersion!==savedVersion&&!blocked)await persist();
  if(blocked&&!allowBlocked)error('Your conflicting draft is retained. Download it or reopen the current saved review.');
  await fn();
 }catch(e){notice(e.message||String(e),'error');}
 finally{busy=false;updateStatus();}
}
function bind(id,fn,options){$(id).addEventListener('click',()=>action(fn,options));}
function caseStore(issue){return openSourceDeskState({workspaceId:issue.workspaceId,namespace:'source-review:'+issue.id,schema:REVIEW_DESK_SCHEMA});}
function setState(next,received,store){
 state=next;verified=received;storage=store;persistedRevision=next.revision;editVersion=0;savedVersion=0;lastSaveError=null;blocked=false;
 selectedItem=next.draft?.rawMapping?.itemId??next.draft?.items[0]?.id??null;filePage=0;selectedFile=null;render();
}
async function selectSaved(workspaceId,caseId){
 const store=openSourceDeskState({workspaceId,namespace:'source-review:'+caseId,schema:REVIEW_DESK_SCHEMA}),saved=await store.read();
 if(!saved.package)error('This review is not retained in this browser. Open its complete review package.');
 const checked=await verifySourceReviewDesk(saved);
 if(!saved.draft)saved.draft=newReviewDraft(checked.verified);
 setState(saved,checked.verified,store);notice('Opened the complete saved review and its original source files.');
}
async function stageFile(file,kind){
 if(!file)return;
 notice('Reading and verifying the complete original '+file.name+'…');
 const limit=kind==='working'?REVIEW_LIMITS.workingBytes:REVIEW_LIMITS.packageBytes;
 if(file.size>limit)error('This complete file exceeds the '+Math.round(limit/1048576)+' MiB receiving limit. Its contents were not changed.');
 const bytes=new Uint8Array(await file.arrayBuffer());let checked,value;
 if(kind==='working'){try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{error('Open a complete working-record JSON file.');}checked=await verifySourceReviewDesk(value);}
 else{checked=await readSourceReviewBytes(bytes);value=checked.value;}
 incoming={kind,name:file.name,bytes,value,verified:kind==='working'?checked.verified:checked};
 const issue=incoming.verified.issue;
 $('incoming-summary').textContent=issue.recipient+' · '+issue.author+' · '+issue.id+' · '+incoming.verified.collection.items.length+' original items · '+incoming.verified.value.editions.length+' editions. Receiving keeps the current saved record as a complete history file.';
 $('incoming').hidden=false;notice('Complete incoming file verified. Choose whether to receive it into this browser.');
}
async function receiveIncoming(){
 if(!incoming)error('Choose a complete incoming file.');
 const candidate=incoming,issue=candidate.verified.issue,store=caseStore(issue),saved=await store.read();
 let next;
 if(saved.package){
  await verifySourceReviewDesk(saved);verifySameIssue(saved.package,candidate.verified.value);
  if(candidate.kind==='working'){
   const oldContent=copy(saved),incomingContent=copy(candidate.value);
   delete oldContent.origin;delete oldContent.revision;delete incomingContent.origin;delete incomingContent.revision;
   if(reviewEqual(oldContent,incomingContent)){
    setState(saved,(await verifySourceReviewDesk(saved)).verified,store);incoming=null;$('incoming').hidden=true;
    notice('This complete working record is already retained. The current saved revision is preserved.');return;
   }
  }
  next=candidate.kind==='working'?copy(candidate.value):{...copy(saved),package:copy(candidate.value),draft:newReviewDraft(candidate.verified)};
 }else next=candidate.kind==='working'?copy(candidate.value):{...newSourceReviewDesk(candidate.value),draft:newReviewDraft(candidate.verified)};
 next.origin=location.origin;next.revision=saved.revision;
 next.receivedWorkingRecords=[...(next.receivedWorkingRecords??[])];
 if(saved.package){
  const prior=await retainedReviewFile('prior-review-'+saved.caseId+'-r'+saved.revision+'.json',reviewBytes(saved,REVIEW_LIMITS.workingBytes),REVIEW_LIMITS.workingBytes);
  if(!next.receivedWorkingRecords.some(f=>f.sha256===prior.sha256))next.receivedWorkingRecords.push(prior);
 }
 // A working record already contains its complete source/history. Do not nest that whole
 // record inside itself on every reopen: equal export and receive limits must stay usable.
 if(candidate.kind==='package'){
  const original=await retainedReviewFile(candidate.name,candidate.bytes,REVIEW_LIMITS.packageBytes);
  if(!next.receivedWorkingRecords.some(f=>f.sha256===original.sha256))next.receivedWorkingRecords.push(original);
 }else{
  const received={name:candidate.name,bytes:candidate.bytes.length,sha256:await bytesSha256(candidate.bytes),originalOrigin:candidate.value.origin,originalRevision:candidate.value.revision,receivedAt:new Date().toISOString()};
  next.receivingObservations=[...(next.receivingObservations??[])];
  if(!next.receivingObservations.some(f=>f.sha256===received.sha256))next.receivingObservations.push(received);
 }
 if(!next.draft)next.draft=newReviewDraft(candidate.verified);
 await verifySourceReviewDesk(next);reviewBytes(next,REVIEW_LIMITS.workingBytes);
 let retained;
 try{retained=await store.save(next,saved.revision);}catch(e){if(e.code==='DRAFT_CONFLICT')notice('Another page saved this case during receiving. The full incoming candidate is retained as a conflict; reopen the saved case to recover it.','error');throw e;}
 const checked=await verifySourceReviewDesk(retained);setState(retained,checked.verified,store);incoming=null;$('incoming').hidden=true;notice('Received the full review. Original incoming and prior local records remain in receiving history.');
}
function currentItem(){return state?.draft?.items.find(x=>x.id===selectedItem);}
function originalItem(){return verified?.collection.items.find(x=>x.id===selectedItem);}
function filteredItems(){const q=$('item-search').value.trim().toLowerCase();return verified.collection.items.filter(x=>!q||[x.id,x.file.name,x.mapping.format].join(' ').toLowerCase().includes(q));}
function renderItems(){
 const list=filteredItems(),select=$('item-select');select.replaceChildren();
 for(const item of list){const option=document.createElement('option');option.value=item.id;option.textContent=item.file.name+' · '+item.mapping.format;select.append(option);}
 if(!list.some(x=>x.id===selectedItem)&&!state.draft.rawMapping)selectedItem=list[0]?.id??null;
 if(selectedItem&&!list.some(x=>x.id===selectedItem)){
  const item=verified.collection.items.find(x=>x.id===selectedItem),option=document.createElement('option');option.value=item.id;option.textContent=item.file.name+' · unfinished mapping';select.prepend(option);
 }
 select.value=selectedItem??'';renderItem();
}
function renderItem(){
 const item=currentItem(),original=originalItem();$('item-editor').hidden=!item;
 $('item-position').textContent=filteredItems().length+' matching originals / '+verified.collection.items.length+' complete originals';
 if(!item)return;
 $('item-pin').textContent=original.file.name+' · '+original.file.bytes+' bytes · SHA-256 '+original.file.sha256+' · item '+original.id;
 $('included').checked=item.included;$('item-note').value=item.note;$('item-comment').value=item.comment;
 const raw=state.draft.rawMapping; $('mapping-json').value=raw?.itemId===item.id?raw.text:json(item.mapping);
 const pdf=original.mapping.format==='PDF_REVIEW';
 $('mapping-json').readOnly=pdf;$('apply-mapping').disabled=pdf;$('reset-mapping').disabled=pdf;
 $('mapping-help').textContent=pdf?'The original PDF interpretation stays in its dedicated desk. Record feedback in your comment and propose inclusion or note changes here.':'Edit the complete interpretation JSON, then apply it explicitly. Unfinished text is retained as written. Original keys, values and file-specific choices remain available.';
 $('baseline-mapping').textContent=json(original.mapping);
 renderEdition();
}
function renderHistory(){
 const select=$('edition-select'),old=select.value;select.replaceChildren();
 for(const e of state.package.editions){const o=document.createElement('option');o.value=e.sha256;o.textContent='Edition '+e.sequence+' · '+e.status+' · '+e.createdAt;select.append(o);}
 select.value=state.package.editions.some(e=>e.sha256===old)?old:state.package.editions.at(-1)?.sha256??'';
 $('download-edition').disabled=!state.package.editions.length;renderEdition();
 const head=state.package.editions.at(-1);
 $('edition-status').textContent=head?'Latest retained edition: '+head.sequence+' · '+head.status+'. Complete a new edition after making further changes before downloading the return.':'No edition saved yet. Keep an unfinished draft or complete this review explicitly.';
}
function renderEdition(){
 const box=$('edition-detail'),e=state?.package.editions.find(x=>x.sha256===$('edition-select').value);box.replaceChildren();
 if(!e){box.textContent='No saved edition.';return;}
 const info=document.createElement('p');info.textContent=e.reviewer+' · '+e.status+' · '+e.createdAt;box.append(info);
 const summary=document.createElement('p');summary.className='preserve-lines';summary.textContent=e.summary||'No summary entered.';box.append(summary);
 const row=e.items.find(x=>x.id===selectedItem);if(row){const pre=document.createElement('pre');pre.textContent=json(row);box.append(pre);}
}
function renderFiles(){
 const all=[...verified.capsule.files.values()],start=filePage*50,rows=all.slice(start,start+50),tbody=$('file-list');tbody.replaceChildren();
 for(const f of rows){const tr=document.createElement('tr');for(const v of [f.name,f.role,f.bytes,f.sha256]){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}const td=document.createElement('td');td.append(button('Open',async()=>openFile(f.name)));tr.append(td);tbody.append(tr);}
 $('files-position').textContent=all.length?(start+1)+'–'+Math.min(start+50,all.length)+' of '+all.length:'No files';$('files-previous').disabled=!filePage;$('files-next').disabled=start+50>=all.length;
}
function openFile(name){
 const file=verified.capsule.files.get(name);if(!file)error('Select an original file in this preparation.');selectedFile=name;$('file-view').hidden=false;$('file-title').textContent=file.name;
 $('file-description').textContent=file.bytes+' bytes · SHA-256 '+file.sha256;
 if(file.bytes>1000000){$('file-text').textContent='This original is larger than the on-page text viewer. Download and open the complete file in its intended application.';return;}
 try{$('file-text').textContent=new TextDecoder('utf-8',{fatal:true}).decode(file.bytesValue);}catch{$('file-text').textContent='This is a complete binary original. Download it and open it in its intended application.';}
}
function renderReceiving(){
 const box=$('receiving-list');box.replaceChildren();
 for(const f of state.receivedWorkingRecords){const a=document.createElement('article'),p=document.createElement('p');p.textContent=f.name+' · '+f.bytes+' bytes · '+f.sha256;a.append(p,button('Download complete original',async()=>download(f.name,await readRetainedReviewFile(f,REVIEW_LIMITS.workingBytes))));box.append(a);}
 for(const r of state.receivingObservations??[]){const a=document.createElement('article'),p=document.createElement('p');p.textContent='Complete record received: '+r.name+' · '+r.bytes+' bytes · '+r.sha256+' · original origin '+r.originalOrigin+' · revision '+r.originalRevision;a.append(p);box.append(a);}
 if(!state.receivedWorkingRecords.length&&!(state.receivingObservations??[]).length)box.textContent='No prior working record has been received.';
}
function render(){
 $('case-workspace').hidden=!state;if(!state){updateStatus();return;}
 const issue=verified.issue,facts=$('issue-facts');facts.replaceChildren();
 for(const [label,value]of [['Named reviewer',issue.recipient],['Issued by',issue.author],['Issued at',issue.createdAt],['Review ID',issue.id],['Collection',verified.collection.name],['Original revision',verified.collection.revision],['Complete original items',verified.collection.items.length]])fact(facts,label,value);
 $('purpose').textContent=issue.purpose;$('issue-json').textContent=json(issue);$('reviewer').value=state.draft.reviewer;$('summary').value=state.draft.summary;
 renderItems();renderHistory();renderFiles();renderReceiving();updateStatus();
}
async function readCases(after=null){
 const page=await listSourceReviewDesks({after,limit:20});caseCursor=page.nextCursor;const box=$('case-list');box.replaceChildren();
 for(const row of page.items){const a=document.createElement('article'),p=document.createElement('p');p.textContent=row.recipient+' · '+row.author+' · '+row.caseId+' · '+row.editions+' editions';a.append(p,button('Open saved review',async()=>selectSaved(row.workspaceId,row.caseId)));box.append(a);}
 if(!page.items.length)box.textContent=page.nextCursor?'No review in this scanned page; continue to the next page.':'No saved review in this page.';
 $('cases-next').disabled=!caseCursor;$('saved-cases').open=true;
}
async function readConflicts(after=null){
 if(!storage)error('Open a complete review first.');
 const page=await storage.listConflicts({after,limit:20});conflictCursor=page.nextCursor;const box=$('conflict-list');box.replaceChildren();
 for(const row of page.items){
  const a=document.createElement('article'),p=document.createElement('p');p.textContent=row.at+' · retained draft '+row.id;
  a.append(p,button('Download',async()=>{const record=await storage.readConflict(row.id);download('review-conflict-'+row.id+'.json',reviewBytes(record.snapshot,REVIEW_LIMITS.workingBytes));}));
  const restore=button('Restore and retain current',async()=>{
   const record=await storage.readConflict(row.id),raw=reviewBytes(record.snapshot,REVIEW_LIMITS.workingBytes);await verifySourceReviewDesk(record.snapshot);
   incoming={kind:'working',name:'review-conflict-'+row.id+'.json',bytes:raw,value:record.snapshot,verified:(await verifySourceReviewDesk(record.snapshot)).verified};await receiveIncoming();
  });restore.disabled=blocked;a.append(restore);box.append(a);
 }
 if(!page.items.length)box.textContent='No retained conflict in this page.';$('conflicts-next').disabled=!conflictCursor;
}
async function commitEdition(status){
 if(!state)error('Open a review first.');
 if(state.draft.rawMapping)error('Apply the unfinished mapping text before keeping this edition.');
 const next=await saveReviewEdition(state.package,state.draft,{status}),checked=await verifySourceReview(next);
 state.package=next;verified=checked;state.draft=newReviewDraft(checked);markDirty();await persist();render();notice(status==='submitted'?'Completed this review edition. Download its full return for the original author.':'Retained a complete draft edition. Continue reviewing the same original files.');
}
for(const [id,field]of [['summary','summary']])$(id).addEventListener('input',()=>{if(!state||busy||blocked)return;state.draft[field]=$(id).value;markDirty();});
$('included').addEventListener('change',()=>{if(!state||busy||blocked)return;currentItem().included=$('included').checked;markDirty();});
for(const [id,field]of [['item-note','note'],['item-comment','comment']])$(id).addEventListener('input',()=>{if(!state||busy||blocked)return;currentItem()[field]=$(id).value;markDirty();});
$('mapping-json').addEventListener('input',()=>{if(!state||busy||blocked||originalItem().mapping.format==='PDF_REVIEW')return;state.draft.rawMapping={itemId:selectedItem,text:$('mapping-json').value};markDirty();});
function chooseItem(id){if(state.draft.rawMapping&&state.draft.rawMapping.itemId!==id)error('Apply or explicitly restore the unfinished mapping text before selecting another item.');selectedItem=id;renderItems();}
$('item-select').addEventListener('change',()=>{try{chooseItem($('item-select').value);}catch(e){$('item-select').value=selectedItem;notice(e.message,'error');}});
$('item-search').addEventListener('input',()=>{if(state)renderItems();});
$('edition-select').addEventListener('change',renderEdition);
bind('item-previous',async()=>{const list=filteredItems(),at=list.findIndex(x=>x.id===selectedItem);if(at>0)chooseItem(list[at-1].id);});
bind('item-next',async()=>{const list=filteredItems(),at=list.findIndex(x=>x.id===selectedItem);if(at>=0&&at+1<list.length)chooseItem(list[at+1].id);});
bind('apply-mapping',async()=>{
 const item=currentItem();if(!item||originalItem().mapping.format==='PDF_REVIEW')error('The PDF mapping remains in its dedicated desk.');
 let mapping;try{mapping=JSON.parse($('mapping-json').value);}catch{error('The mapping text is incomplete JSON. It remains retained as written.');}
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||!mapping.columns||typeof mapping.columns!=='object'||Array.isArray(mapping.columns)||!['OFX','QFX','CSV','CAMT053'].includes(mapping.format)||JSON.stringify(mapping).length>REVIEW_LIMITS.mappingBytes)error('Use a complete supported interpretation with its original columns object.');
 item.mapping=mapping;state.draft.rawMapping=null;markDirty();await persist();renderItem();notice('Applied the complete proposed interpretation to this draft.');
});
bind('reset-mapping',async()=>{state.draft.rawMapping=null;markDirty();await persist();renderItem();notice('Restored the current draft’s applied mapping text.');});
bind('save-work',async()=>{await persist();notice('Saved the complete current working record.');});
bind('save-edition',()=>commitEdition('draft'));bind('submit-edition',()=>commitEdition('submitted'));
bind('download-return',async()=>{if(!uneditedDraft()||state.package.editions.at(-1)?.status!=='submitted')error('Complete the current changed draft as a review edition first.');await verifySourceReview(state.package);download('bank-source-review-'+state.caseId+'-return.json',reviewBytes(state.package));notice('Downloaded the whole review return with its complete original preparation and edition history.');});
bind('download-working',async()=>{await verifySourceReviewDesk(state);download('bank-source-review-'+state.caseId+'-working.json',reviewBytes(state,REVIEW_LIMITS.workingBytes));});
bind('download-local',async()=>{if(!state)error('No current record.');download('bank-source-review-'+state.caseId+'-local.json',reviewBytes(state,REVIEW_LIMITS.workingBytes));},{allowBlocked:true});
bind('reopen-current',async()=>{clearTimeout(saveTimer);await savePromise.catch(()=>{});await selectSaved(state.workspaceId,state.caseId);},{allowBlocked:true});
bind('download-item',async()=>{const item=originalItem();if(!item)error('Select an original item.');const bytes=decodeWholeBase64(item.file.dataBase64);if(bytes.length!==item.file.bytes||await bytesSha256(bytes)!==item.file.sha256)error('The original item changed.');download(item.file.name,bytes,'application/octet-stream');});
bind('download-capsule',async()=>download(verified.value.source.name,verified.sourceBytes));
bind('download-selected-file',async()=>{const f=verified.capsule.files.get(selectedFile);if(!f)error('Open a complete file first.');download(f.name,f.bytesValue,'application/octet-stream');});
bind('download-edition',async()=>{const e=state.package.editions.find(x=>x.sha256===$('edition-select').value);if(!e)error('Select an edition.');download('review-'+state.caseId+'-edition-'+e.sequence+'.json',reviewBytes(e));});
bind('export-portable',async()=>{notice('Receiving the exact complete application source and preparing the offline review…');const result=await buildPortableSourceReview({reviewPackage:state.package,workingRecord:state,sourceProject:await loadReviewSourceProject()});download(result.name,result.bytes,'text/html');notice('Downloaded the complete offline review, draft, original files and eight-file source project. Open that actual file before sending it.');});
bind('download-project',async()=>{const project=await loadReviewSourceProject();download('bank-source-review-project.json',utf8(json(project)+'\n'));notice('Downloaded all eight complete application source files with their original byte identities.');});
bind('refresh-cases',()=>readCases(),{allowBlocked:true});bind('cases-first',()=>readCases(),{allowBlocked:true});bind('cases-next',()=>readCases(caseCursor),{allowBlocked:true});
bind('refresh-conflicts',()=>readConflicts(),{allowBlocked:true});bind('conflicts-first',()=>readConflicts(),{allowBlocked:true});bind('conflicts-next',()=>readConflicts(conflictCursor),{allowBlocked:true});
bind('files-previous',async()=>{if(filePage>0)filePage--;renderFiles();});bind('files-next',async()=>{if((filePage+1)*50<verified.capsule.files.size)filePage++;renderFiles();});
bind('receive-incoming',receiveIncoming,{allowBlocked:true});bind('download-incoming',async()=>{if(incoming)download(incoming.name,incoming.bytes);},{allowBlocked:true});bind('dismiss-incoming',async()=>{incoming=null;$('incoming').hidden=true;},{allowBlocked:true});
for(const [id,kind]of [['open-package','package'],['open-working','working']])$(id).addEventListener('change',()=>{const file=$(id).files?.[0];action(()=>stageFile(file,kind),{allowBlocked:true});$(id).value='';});
window.addEventListener('beforeunload',e=>{if(busy||editVersion!==savedVersion){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state&&!blocked)persist().catch(e=>notice(e.message,'error'));});
async function start(){
 if(!globalThis.crypto?.subtle)error('This browser needs its secure local cryptography support to open complete source reviews.');
 const embedded=globalThis.__SOURCE_REVIEW_PORTABLE__;
 if(embedded){
  $('installed-navigation').hidden=true;
  const value=embedded.workingRecord??embedded.reviewPackage,kind=embedded.workingRecord?'working':'package',bytes=reviewBytes(value,kind==='working'?REVIEW_LIMITS.workingBytes:REVIEW_LIMITS.packageBytes);
  await stageFile(new File([bytes],'embedded-complete-review.json',{type:'application/json'}),kind);
  notice('This offline document contains the full original review and source project. Receive its complete record explicitly to work in this browser.');
 }else{
  const query=new URLSearchParams(location.search),caseId=query.get('case'),workspace=query.get('workspace');
  if(caseId&&workspace)await selectSaved(workspace,caseId);else await readCases();
 }
}
action(start,{allowBlocked:true});
