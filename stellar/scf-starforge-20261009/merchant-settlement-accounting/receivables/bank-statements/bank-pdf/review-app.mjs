// SPDX-License-Identifier: MIT
import {createPdfReviewEditor} from './review-editor.mjs';
import {canonical,digest,decodeBase64,openWorkingCopy,PDF_LIMITS} from './model.mjs';
import {PDF_REVIEW_SCHEMAS,PDF_REVIEW_LIMITS,issuePdfReview,openPdfReviewIssue,createPdfReviewRecord,openPdfReviewRecord,pdfReviewWorkingCopy,editPdfReviewDraft,receivePdfWorkingCopy,savePdfReviewEdition,exportPdfReviewReturn,openPdfReviewReturn,validatePdfReviewCurrent,previewPdfReviewReturn,decidePdfReviewReturn,applyPdfReviewDecision,pdfReviewTransfer} from './review-model.mjs';
import {PDF_DESK_SCHEMA,PDF_DESK_MAX_BYTES,checkPdfDesk,openPdfReviewStorage,pdfDeskBytes} from './review-state.mjs';
import {verifyPdfReviewSources,buildPdfReviewHtml,buildPdfReviewProject} from './review-portable.mjs';
const $=id=>document.getElementById(id),copy=v=>structuredClone(v),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store=openPdfReviewStorage(),offline=globalThis.__PDF_REVIEW_OFFLINE===true;
let S=null,busy=true,blocked=false,dirty=false,timer=null,tail=Promise.resolve(),storageRevision=0,generation=0,manifest=null;
let work=null,pdfUrl=null,pdfDocument=null,pdfTask=null,pdfLoading=null,renderEpoch=0,pdfOpenEpoch=0,pdfOpening=null,config=null;
let casesCursor=null,conflictsCursor=null,caseRows=[],conflictRows=[];
let guided=null,guidedCase=null,guidedSync=false;
const identity=row=>String(row.id??row.page),hashPattern=/^[a-f0-9]{64}$/;
function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
function controls(){
 for(const el of document.querySelectorAll('button,input,select,textarea'))el.disabled=busy||blocked;
 for(const id of['download-live','reopen-current','refresh-conflicts','more-conflicts'])$(id).disabled=busy||!S;
 for(const el of $('conflicts').querySelectorAll('button'))el.disabled=busy;
 if(S){
  const raw=S.record.draft.rawDirty||Boolean(S.ui?.rawOverflow);
  for(const id of['new-item','collection','receive-recipient','edition-form','receive-current','compare','keep-all','adopt-all']){const el=$(id);if(el.tagName==='FORM')for(const f of el.elements)f.disabled=busy||blocked||raw;else el.disabled=busy||blocked||raw;}
  for(const b of $('interpretations').querySelectorAll('button'))b.disabled=busy||blocked||raw;
  $('discard-raw').disabled=busy||blocked||!raw;
  if(S.ui?.guidedDraft?.dirty||guided?.hasUnretainedChanges())for(const field of $('edition-form').elements)field.disabled=true;
 }
 $('more-cases').disabled=busy||blocked||!casesCursor;$('more-conflicts').disabled=busy||!S||!conflictsCursor;
 updateGuided();
}
function keepGuided(current,snapshot){
 if(!snapshot)return;current.guidedDraftHistory??=[];
 if(!current.guidedDraftHistory.some(row=>canonical(row)===canonical(snapshot)))current.guidedDraftHistory.push(copy(snapshot));
}
function guidedSelection(snapshot){return snapshot.selection.mode==='new'?{mode:'new',key:snapshot.selection.key}:{mode:'existing',id:snapshot.selection.key};}
function rememberGuided(snapshot){
 if(guidedSync||!S)return;
 const current=ui(),previous=current.guidedDraft;
 if(previous&&(snapshot===null||previous.formId!==snapshot.formId))keepGuided(current,previous);
 current.guidedDraft=snapshot===null?null:copy(snapshot);
 if(snapshot){current.collection=snapshot.collection;current.guidedSelection=guidedSelection(snapshot);}
 changed();
}
async function retainGuided(edit){
 if(!S||busy||blocked)throw new Error('Reopen the current saved review before retaining another proposed form.');
 const selectedCase=S.caseId,revision=work.revision;busy=true;controls();
 try{
  await flush();if(blocked||S.caseId!==selectedCase||work.revision!==revision)throw new Error('The selected interpretation changed before this form was retained.');
  await retainRawSelection(edit);message('Complete proposed form retained. Review the original source, reviewer and reason, then Apply it to the interpretation draft.');
 }catch(error){message(error.message,true);throw error;}
 finally{busy=false;controls();}
}
function resetGuided(){guided?.destroy();guided=null;guidedCase=null;}
async function selectGuided(collection,selection,{snapshot=null}={}){
 if(S.record.draft.rawDirty||ui().rawOverflow)throw new Error('Apply or preserve the current advanced draft before selecting another guided form.');
 const live=guided?.exportDraft()??ui().guidedDraft;
 if(live?.dirty&&!confirm('Keep this complete form in retained draft history and open the selected form?')){await render();return;}
 const next=copy(S);keepGuided(next.ui,live);
 next.ui.collection=collection;next.ui.guidedSelection=selection;next.ui.guidedDraft=snapshot?copy(snapshot):null;next.ui.itemOffset=0;
 resetGuided();await commit(next);
}
function updateGuided(){
 if(!S||!work||!$('guided-editor'))return;
 guidedSync=true;
 try{
  const current=ui();
  if(guidedCase!==S.caseId){resetGuided();guided=createPdfReviewEditor({mount:$('guided-editor'),onDraft:retainGuided,onFormDraft:rememberGuided,onError:error=>message(error.message??String(error),true)});guidedCase=S.caseId;}
  const rows=work[current.collection]??[],selection=current.guidedSelection??(rows.length?{mode:'existing',id:identity(rows[0])}:null);
  const retained=current.guidedDraft,existing=guided.exportDraft();
  if(retained&&existing&&canonical(existing)!==canonical(retained)){
   resetGuided();guided=createPdfReviewEditor({mount:$('guided-editor'),onDraft:retainGuided,onFormDraft:rememberGuided,onError:error=>message(error.message??String(error),true)});guidedCase=S.caseId;
  }
  guided.update({work,collection:current.collection,selection,rawDirty:S.record.draft.rawDirty||Boolean(current.rawOverflow),busy,blocked});
  if(retained&&canonical(guided.exportDraft())!==canonical(retained))guided.restoreDraft(copy(retained));
 }catch(error){message(error.message,true);}finally{guidedSync=false;}
}
function changed(){generation++;dirty=true;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void persist().catch(()=>{});},350);$('save-status').textContent='Unsaved local changes';}
function capture(){return copy(checkPdfDesk(S));}
function persist(){
 if(!S)return Promise.resolve();if(timer){clearTimeout(timer);timer=null;}const snapshot=capture(),g=generation,caseId=S.caseId;
 const task=tail.catch(()=>{}).then(async()=>{
  snapshot.storageRevision=storageRevision;
  try{const saved=await store.save(snapshot,storageRevision,{conflictOnly:blocked});storageRevision=saved.storageRevision;
   if(S?.caseId===caseId){S.storageRevision=storageRevision;if(generation===g){dirty=false;$('save-status').textContent='Saved locally · revision '+storageRevision;}}
   return saved;
  }catch(error){blocked=true;message(error.message+' Download the current complete local record before reopening.',true);$('save-status').textContent='Local save stopped; the complete in-memory draft remains available.';controls();throw error;}
 });tail=task;return task;
}
async function flush(){if(timer){clearTimeout(timer);timer=null;}if(dirty)await persist();else await tail;}
async function perform(fn,{rescue=false}={}){
 if(busy)return;busy=true;controls();
 try{if(!rescue){await flush();if(blocked)throw new Error('Preserve the current complete local record and reopen its saved version before another operation.');}await fn();}
 catch(error){message(error.message+(error.code?' ['+error.code+']':''),true);}
 finally{busy=false;controls();}
}
async function commit(next){checkPdfDesk(next);S=next;generation++;dirty=true;await persist();await render();}
async function fileContent(file,max=PDF_DESK_MAX_BYTES){
 if(!file)throw new Error('Choose the complete original JSON file.');if(file.size>max)throw new Error('The selected file exceeds '+max+' bytes.');
 const content=await file.text(),count=new TextEncoder().encode(content).length;if(count!==file.size)throw new Error('The selected JSON is not a complete UTF-8 file.');
 return {name:file.name,bytes:count,sha256:await digest(content),content};
}
function download(name,value,type='application/json'){
 const content=value instanceof Uint8Array?value:typeof value==='string'?value:JSON.stringify(value)+'\n';
 if(!(content instanceof Uint8Array)&&new TextEncoder().encode(content).length>PDF_DESK_MAX_BYTES)throw new Error('The complete download exceeds the reopen capacity.');
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function pinInput(next,file,role){if(!next.inputs.some(x=>x.sha256===file.sha256&&x.role===role))next.inputs.push({...file,role});}
function ui(){return S.ui??={tab:'source',page:1,textOffset:0,itemOffset:0,editionOffset:0,changeOffset:0,collection:'accounts',editReason:'',selectedReturn:null,choices:{},preview:null,decisionAuthor:S.record.issue.author,decisionReason:''};}
async function wrap(record,input=null){
 const checked=await openPdfReviewRecord(record),desk={schema:PDF_DESK_SCHEMA,caseId:checked.issue.reviewId,storageRevision:0,record:checked,currentWorkingCopy:copy(checked.issue.workingCopy),returns:[],decisions:[],inputs:[],priorRecords:[],receivingObservations:[],ui:null};
 if(input)pinInput(desk,input,'received original');return checkPdfDesk(desk);
}
async function verifyDesk(value){
 checkPdfDesk(value);await openPdfReviewRecord(value.record);await validatePdfReviewCurrent(value.record.issue,value.currentWorkingCopy);
 if(!Array.isArray(value.inputs)||!Array.isArray(value.receivingObservations))throw new Error('Retain the complete original file and receiving inventory.');
 const returns=new Map();
 for(const entry of value.returns){if(typeof entry.content!=='string'||new TextEncoder().encode(entry.content).length!==entry.bytes||await digest(entry.content)!==entry.sha256)throw new Error('An original returned file changed.');const returned=await openPdfReviewReturn(entry.content,{issue:value.record.issue});if(returned.sha256!==entry.returnSha256)throw new Error('The selected return identity changed.');returns.set(returned.sha256,returned);}
 for(const entry of value.inputs){if(typeof entry.content!=='string'||new TextEncoder().encode(entry.content).length!==entry.bytes||await digest(entry.content)!==entry.sha256)throw new Error('A retained original file changed.');}
 for(const row of value.decisions){const returned=returns.get(row.decision.returnSha256);if(!returned)throw new Error('The full source for an author decision is missing.');const result=await applyPdfReviewDecision({issue:value.record.issue,returned,currentWorkingCopy:row.beforeWorkingCopy,decision:row.decision});if(canonical(result.workingCopy)!==canonical(row.workingCopy))throw new Error('A retained resulting interpretation changed.');}
 return copy(value);
}
async function adoptDesk(value,{receiving=null}={}){
 const next=await verifyDesk(value),current=await store.read(next.caseId);
 if(current&&current.record.issue.sha256!==next.record.issue.sha256)throw new Error('This review identity already belongs to a different original issue.');
 if(current&&canonical({...current,storageRevision:0})!==canonical({...next,storageRevision:0})){
  if(!confirm('Keep the complete currently saved record in this received edition’s history and deliberately open the incoming record?'))return;
  next.priorRecords.push(current);
 }
 if(receiving)next.receivingObservations.push({name:receiving.name,bytes:receiving.bytes,sha256:receiving.sha256,receivedAt:new Date().toISOString(),originalStorageRevision:next.storageRevision});
 checkPdfDesk(next);S=next;storageRevision=current?.storageRevision??0;S.storageRevision=storageRevision;blocked=false;generation++;dirty=true;await persist();
 history.replaceState(null,'',location.pathname+'?case='+encodeURIComponent(S.caseId));await refreshCases();await render();message('Complete named review opened with its original PDF, source history and saved editions.');
}
async function openSelectedFile(){
 const file=await fileContent($('open-file').files[0]),value=JSON.parse(file.content);
 if(value.schema===PDF_DESK_SCHEMA)return adoptDesk(value,{receiving:file});
 if(value.schema==='stellar-forge.bank-pdf-review-project.v1'){
  await verifyPdfReviewSources(value.source);
  const next=await verifyDesk(value.desk),content=JSON.stringify(value.source)+'\n';
  pinInput(next,{name:file.name+'.original-source.json',content,bytes:new TextEncoder().encode(content).length,sha256:await digest(content),originalProject:{name:file.name,bytes:file.bytes,sha256:file.sha256}},'received original project source');
  checkPdfDesk(next);return adoptDesk(next,{receiving:file});
 }
 if(value.schema===PDF_REVIEW_SCHEMAS.record)return adoptDesk(await wrap(await openPdfReviewRecord(value)),{receiving:file});
 if(value.schema===PDF_REVIEW_SCHEMAS.issue){const issue=await openPdfReviewIssue(value),record=await createPdfReviewRecord(issue,{localId:crypto.randomUUID(),openedAt:new Date().toISOString()});return adoptDesk(await wrap(record,file));}
 throw new Error('Open a complete named issue, review working record or source project. Use “Issue a review” for an original PDF working copy.');
}
async function refreshCases({more=false}={}){
 const page=await store.listCases({after:more?casesCursor:null,limit:20});caseRows=more?caseRows.concat(page.items):page.items;casesCursor=page.nextCursor;
 $('saved-case').innerHTML='<option value="">Select a review</option>'+caseRows.map(row=>'<option value="'+esc(row.caseId)+'">'+esc(row.recipient+' · '+row.purpose.slice(0,75)+' · '+row.createdAt.slice(0,10))+'</option>').join('');
 if(S)$('saved-case').value=S.caseId;controls();
}
function preservePrior(next,prior){if(!prior)return;const material=v=>canonical({...v,storageRevision:0});if(material(next)!==material(prior)&&!next.priorRecords.some(row=>material(row)===material(prior)))next.priorRecords.push(copy(prior));}
async function loadSaved(caseId,{preserveLive=null}={}){const saved=await store.read(caseId);if(!saved)throw new Error('The original saved review is unavailable in this browser.');const next=await verifyDesk(saved);preservePrior(next,preserveLive);checkPdfDesk(next);S=next;storageRevision=S.storageRevision;dirty=false;blocked=false;generation++;if(preserveLive){dirty=true;await persist();}history.replaceState(null,'',location.pathname+'?case='+encodeURIComponent(caseId));await render();message('Saved complete review reopened; any distinct local record remains in its complete history.');}
async function sourceManifest(){if(manifest)return manifest;if(globalThis.__PDF_REVIEW_SOURCES){manifest=globalThis.__PDF_REVIEW_SOURCES;}else{const response=await fetch('./review-source.json',{cache:'no-store'});if(!response.ok)throw new Error('The complete offline source manifest could not be opened.');manifest=await response.json();}await verifyPdfReviewSources(manifest);return manifest;}
async function closePdf(){
 const render=pdfTask,document=pdfDocument,loading=pdfLoading,url=pdfUrl;
 pdfTask=null;pdfDocument=null;pdfLoading=null;pdfUrl=null;
 if(render){render.cancel();await render.promise.catch(()=>{});}if(document)await document.destroy();
 if(loading)await loading.destroy().catch(()=>{});if(url)URL.revokeObjectURL(url);
}
async function openPdfForCurrent(){
 const selectedCase=S.caseId,selectedWork=S.record.issue.workingCopy,signature=selectedWork.file.sha256,key=selectedCase+'|'+signature;
 if(pdfOpening?.key===key)return pdfOpening.promise;
 if($('page-display').dataset.pdf===signature&&pdfUrl)return;
 const epoch=++pdfOpenEpoch,current=()=>epoch===pdfOpenEpoch&&S?.caseId===selectedCase&&S?.record.issue.workingCopy.file.sha256===signature;
 const pending={key,promise:null};
 pending.promise=(async()=>{
  await closePdf();if(!current())return;
  const original=decodeBase64(selectedWork.file.dataBase64);pdfUrl=URL.createObjectURL(new Blob([original],{type:'application/pdf'}));$('page-display').dataset.pdf=signature;
  if(offline){$('page-status').textContent='Original PDF shown by this browser’s document viewer. Download or open the original if embedded display is unavailable. Retained source text and geometry are shown alongside it.';return;}
  let task=null;
  try{
   const selectedConfig=config??await fetch('./config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('PDF runtime configuration unavailable');return r.json();});
   if(!current())return;config=selectedConfig;
   const engine=await import(selectedConfig.pdfEngineUrl);if(!current())return;if(engine.version!==selectedConfig.pdfVersion)throw new Error('The installed original PDF.js version differs.');
   engine.GlobalWorkerOptions.workerSrc=selectedConfig.pdfWorkerUrl;
   task=engine.getDocument({data:original.slice(),stopAtErrors:true,enableXfa:false,isEvalSupported:false,useWasm:false,disableWorkerRendering:true,cMapUrl:selectedConfig.pdfRuntimeBase+'cmaps/',cMapPacked:true,standardFontDataUrl:selectedConfig.pdfRuntimeBase+'standard_fonts/',wasmUrl:selectedConfig.pdfRuntimeBase+'wasm/',iccUrl:selectedConfig.pdfRuntimeBase+'iccs/'});pdfLoading=task;
   task.onPassword=update=>{if(!current()){void task.destroy();return;}const secret=prompt('Enter the original PDF password for this opening. It is not retained.');if(secret===null){void task.destroy();return;}update(secret);};
   const opened=await task.promise;
   if(!current()||pdfLoading!==task){await opened.destroy();return;}
   pdfDocument=opened;pdfLoading=null;$('page-status').textContent='Original PDF rendered with the installed PDF.js '+engine.version+'.';
  }catch(error){if(task){if(pdfLoading===task)pdfLoading=null;await task.destroy().catch(()=>{});}if(current())$('page-status').textContent=error.message+' The complete original remains available through this browser’s PDF viewer and download.';}
 })();
 pdfOpening=pending;try{return await pending.promise;}finally{if(pdfOpening===pending)pdfOpening=null;}
}
async function drawPage(){
 if(!S||!work)return;const caseId=S.caseId,number=ui().page,sourceSha=S.record.issue.source.pdf.sha256,epoch=++renderEpoch;
 const current=()=>epoch===renderEpoch&&S?.caseId===caseId&&ui().page===number&&S.record.issue.source.pdf.sha256===sourceSha;
 const display=$('page-display');display.setAttribute('aria-busy','true');display.dataset.renderState='loading';delete display.dataset.renderPage;
 await openPdfForCurrent();if(!current())return;
 $('page-frame').hidden=!!pdfDocument;$('page-canvas').hidden=!pdfDocument;
 if(!pdfDocument){$('page-frame').src=pdfUrl+'#page='+number;display.dataset.renderState='browser-viewer';display.dataset.renderPage=String(number);display.dataset.renderSource=sourceSha;display.dataset.renderCase=caseId;display.setAttribute('aria-busy','false');return;}
 if(pdfTask){const previous=pdfTask;previous.cancel();await previous.promise.catch(()=>{});if(pdfTask===previous)pdfTask=null;if(!current())return;}
 const selectedDocument=pdfDocument,original=await selectedDocument.getPage(number);if(!current()||pdfDocument!==selectedDocument)return;
 const width=Math.max(260,$('page-display').clientWidth),viewport=original.getViewport({scale:width/work.extraction.pages[number-1].width}),canvas=$('page-canvas'),ratio=Math.min(devicePixelRatio||1,2);
 if(!current())return;canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
 const task=original.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});pdfTask=task;
 try{await task.promise;if(current()&&pdfDocument===selectedDocument){display.dataset.renderState='complete';display.dataset.renderPage=String(number);display.dataset.renderSource=sourceSha;display.dataset.renderCase=caseId;display.setAttribute('aria-busy','false');}}
 catch(error){if(error.name!=='RenderingCancelledException'&&current()){display.dataset.renderState='error';display.setAttribute('aria-busy','false');throw error;}}finally{if(pdfTask===task)pdfTask=null;}
}

function range(offset,total,size){return total?(offset+1)+'–'+Math.min(offset+size,total)+' of '+total:'No items';}
function json(value){return '<details><summary>'+esc(typeof value==='string'?value.slice(0,90):JSON.stringify(value)?.slice(0,90))+'</summary><pre>'+esc(JSON.stringify(value,null,2))+'</pre></details>';}
function tableButton(label,action,id){return '<button data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';}
function renderSource(){
 const current=ui(),page=work.extraction.pages[current.page-1];$('page-label').textContent='Page '+current.page+' of '+work.extraction.pages.length;
 const texts=page.items.slice(current.textOffset,current.textOffset+60);$('page-text').innerHTML=texts.map(item=>'<tr><td>'+esc(item.id)+'</td><td>'+esc(item.text)+'</td><td>'+esc(JSON.stringify(item.box))+'</td></tr>').join('');$('text-range').textContent=range(current.textOffset,page.items.length,60);
 $('collection').value=current.collection;const rows=work[current.collection];$('interpretations').innerHTML=rows.slice(current.itemOffset,current.itemOffset+25).map(row=>'<tr><td>'+esc(identity(row))+'</td><td>'+json(row)+'</td><td>'+tableButton('Edit proposal','edit',identity(row))+'</td></tr>').join('')||'<tr><td colspan="3">No interpretations in this collection.</td></tr>';$('item-range').textContent=range(current.itemOffset,rows.length,25);
 $('reviewer').value=S.record.draft.reviewer;$('edit-reason').value=current.editReason||'';$('raw-edit').value=current.rawOverflow??S.record.draft.raw;
}
function renderEditions(){
 const editions=S.record.editions,offset=ui().editionOffset;
 $('editions').innerHTML=editions.slice(offset,offset+20).map(e=>'<tr><td>'+e.sequence+' · '+esc(e.status)+'<br>'+esc(e.createdAt)+'</td><td>'+esc(e.reviewer)+'<br>'+esc(e.comment)+'</td><td>'+tableButton('Working copy','edition-copy',e.editionId)+(e.status==='submitted'?tableButton('Submitted return','edition-return',e.editionId):'')+'</td></tr>').join('')||'<tr><td colspan="3">No saved review editions. Save a complete draft or submitted edition.</td></tr>';
 $('edition-reviewer').value=S.record.draft.reviewer;$('edition-comment').value=S.record.draft.comment;$('edition-range').textContent=range(offset,editions.length,20);
}
function renderAuthor(){
 const current=ui();$('selected-return').innerHTML='<option value="">Choose retained submitted return</option>'+S.returns.map(row=>'<option value="'+row.sha256+'">'+esc(row.name)+' · '+row.sha256.slice(0,12)+'</option>').join('');$('selected-return').value=current.selectedReturn||'';
 const preview=current.preview;$('comparison').hidden=!preview;$('comparison-summary').textContent=preview?preview.counts.changes+' proposed fields · '+preview.counts.conflicts+' concurrent differences':'Current author revision '+S.currentWorkingCopy.revision;
 if(preview){$('changes').innerHTML=preview.changes.slice(current.changeOffset,current.changeOffset+20).map(row=>'<tr><td>'+esc(row.collection+' / '+row.id+' / '+row.field)+(row.conflict?'<br><span class="tag">Concurrent change</span>':'')+'</td><td>'+json(row.issued)+'</td><td>'+json(row.current)+'</td><td>'+json(row.returned)+'</td><td><select data-choice="'+esc(row.key)+'"><option value="">Choose…</option><option value="keep" '+(current.choices[row.key]==='keep'?'selected':'')+'>Keep current</option><option value="adopt" '+(current.choices[row.key]==='adopt'?'selected':'')+'>Adopt returned</option></select></td></tr>').join('')||'<tr><td colspan="5">The submitted edition proposes no changed fields.</td></tr>';$('change-range').textContent=range(current.changeOffset,preview.changes.length,20);}
 $('decision-author').value=current.decisionAuthor||S.record.issue.author;$('decision-reason').value=current.decisionReason||'';
 $('decisions').innerHTML=S.decisions.map((row,i)=>'<div class="card"><strong>Decision '+(i+1)+' · resulting revision '+row.workingCopy.revision+'</strong><p>'+esc(row.decision.author+' · '+row.decision.reason)+'</p><div class="row">'+tableButton('Decision JSON','decision',String(i))+tableButton('Resulting working copy','decision-copy',String(i))+tableButton('Select as current author copy','decision-current',String(i))+'</div></div>').join('')||'<p>No author decision has been retained.</p>';
}
function renderFiles(){
 $('original-files').innerHTML='<div class="row">'+tableButton('Original issued working copy','issued-copy','')+tableButton('Complete original extraction','extraction','')+'</div>'+S.inputs.map((row,i)=>'<div class="card"><strong>'+esc(row.name)+'</strong><p>'+esc(row.role)+' · '+row.bytes+' bytes</p><p class="break quiet">'+row.sha256+'</p>'+tableButton('Download exact original','input',String(i))+'</div>').join('')+S.returns.map((row,i)=>'<div class="card"><strong>'+esc(row.name)+'</strong><p>Original returned file · '+row.bytes+' bytes</p>'+tableButton('Download exact return','return-file',String(i))+'</div>').join('');
 const guidedRows=ui().guidedDraftHistory??[],guidedOffset=ui().guidedHistoryOffset??0;
 $('guided-history').innerHTML=guidedRows.slice(guidedOffset,guidedOffset+10).map((row,i)=>'<div class="card"><strong>'+esc(row.collection+' · original revision '+row.baseRevision)+'</strong><p>'+esc(row.selection?.mode+' '+row.selection?.key)+'</p><div class="row">'+tableButton('Download complete form draft','guided-download',String(guidedOffset+i))+tableButton('Reopen this form draft','guided-restore',String(guidedOffset+i))+'</div></div>').join('')||'<p>No earlier guided form drafts have been retained.</p>';
 $('guided-range').textContent=range(guidedOffset,guidedRows.length,10);
 $('record-summary').textContent=JSON.stringify({reviewId:S.caseId,originalPdf:S.record.issue.source.pdf,issuedRevision:S.record.issue.source.revision,currentAuthorRevision:S.currentWorkingCopy.revision,recipientRevision:work.revision,editions:S.record.editions.map(e=>({id:e.editionId,status:e.status,sha256:e.sha256})),returns:S.returns.map(r=>({name:r.name,bytes:r.bytes,sha256:r.sha256})),decisions:S.decisions.map(r=>r.decision.decisionId),priorCompleteRecords:S.priorRecords.length,receivingObservations:S.receivingObservations},null,2);
}
async function render(){
 $('case-content').hidden=!S;if(!S){controls();return;}work=await pdfReviewWorkingCopy(S.record);
 const current=ui();current.page=Math.max(1,Math.min(current.page,work.extraction.pages.length));$('case-title').textContent=S.record.issue.purpose;
 const issue=S.record.issue;$('case-summary').innerHTML=[['Author',issue.author],['Recipient',issue.recipient],['Original',issue.source.pdf.name+' · '+issue.source.pdf.bytes+' bytes'],['Issued interpretation','Revision '+issue.source.revision],['Local record','Revision '+storageRevision+' · '+(blocked?'save requires recovery':'saved review')]].map(([a,b])=>'<dt>'+esc(a)+'</dt><dd>'+esc(b)+'</dd>').join('');
 document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==current.tab);document.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tab===current.tab)));
 renderSource();renderEditions();renderAuthor();renderFiles();controls();if(current.tab==='source')void drawPage().catch(error=>message(error.message,true));
}
async function retainRawSelection(value){
 if(S.record.draft.rawDirty)throw new Error('Apply or discard the current raw edit before selecting another interpretation.');
 const next=copy(S);next.record.draft.raw=JSON.stringify(value,null,2);next.record.draft.rawDirty=true;await commit(next);
}
async function refreshConflicts({more=false}={}){
 if(!S)return;const page=await store.listConflicts(S.caseId,{after:more?conflictsCursor:null,limit:20});conflictRows=more?conflictRows.concat(page.items):page.items;conflictsCursor=page.nextCursor;
 $('conflicts').innerHTML=conflictRows.map(row=>'<div class="card"><strong>'+esc(row.at)+'</strong><p>Expected local revision '+row.expectedRevision+'; saved revision '+row.actualRevision+'</p><div class="row">'+tableButton('Download whole competing draft','conflict-download',row.id)+tableButton('Restore as explicit current draft','conflict-restore',row.id)+'</div></div>').join('')||'<p>No retained competing drafts for this named review.</p>';controls();
}
async function selectedReturn(){const row=S.returns.find(r=>r.sha256===ui().selectedReturn);if(!row)throw new Error('Choose the exact retained returned file.');return openPdfReviewReturn(row.content,{issue:S.record.issue});}
function bind(id,event,fn){$(id).addEventListener(event,e=>{e.preventDefault();void perform(()=>fn(e));});}
bind('open-file-button','click',openSelectedFile);bind('more-cases','click',()=>refreshCases({more:true}));bind('open-case','click',()=>loadSaved($('saved-case').value));
bind('issue-form','submit',async()=>{
 const original=await fileContent($('issue-file').files[0],PDF_LIMITS.transferBytes),workingCopy=await openWorkingCopy(original.content);
 const issue=await issuePdfReview({workingCopy,reviewId:crypto.randomUUID(),author:$('issue-author').value,recipient:$('issue-recipient').value,purpose:$('issue-purpose').value,createdAt:new Date().toISOString()}),record=await createPdfReviewRecord(issue,{localId:crypto.randomUUID(),openedAt:new Date().toISOString()});
 await adoptDesk(await wrap(record,original));
});
bind('download-issue','click',()=>download('pdf-review-'+S.caseId+'.issue.json',pdfReviewTransfer(S.record.issue)));
bind('download-working','click',()=>download('pdf-review-'+S.caseId+'.working.json',checkPdfDesk(S)));
bind('download-html','click',async()=>{const result=await buildPdfReviewHtml(S,await sourceManifest());download(result.name,result.content,result.type);message('Complete offline review downloaded · SHA-256 '+result.sha256);});
bind('download-project','click',async()=>{const result=await buildPdfReviewProject(S,await sourceManifest());download(result.name,result.content,result.type);message('Complete source project downloaded · SHA-256 '+result.sha256);});
bind('download-source','click',async()=>download('pdf-review-source.json',await sourceManifest()));
bind('download-pdf','click',()=>download(S.record.issue.workingCopy.file.name,decodeBase64(S.record.issue.workingCopy.file.dataBase64),'application/pdf'));
bind('open-pdf','click',async()=>{await openPdfForCurrent();window.open(pdfUrl+'#page='+ui().page,'_blank','noopener');});
for(const [id,delta]of[['previous-page',-1],['next-page',1]])bind(id,'click',async()=>{ui().page=Math.max(1,Math.min(work.extraction.pages.length,ui().page+delta));ui().textOffset=0;changed();await render();});
for(const [id,key,size,total]of[['previous-text','textOffset',-60,()=>work.extraction.pages[ui().page-1].items.length],['next-text','textOffset',60,()=>work.extraction.pages[ui().page-1].items.length],['previous-item','itemOffset',-25,()=>work[ui().collection].length],['next-item','itemOffset',25,()=>work[ui().collection].length],['previous-edition','editionOffset',-20,()=>S.record.editions.length],['next-edition','editionOffset',20,()=>S.record.editions.length],['previous-change','changeOffset',-20,()=>ui().preview?.changes.length||0],['next-change','changeOffset',20,()=>ui().preview?.changes.length||0]])bind(id,'click',async()=>{ui()[key]=Math.max(0,Math.min(Math.max(0,Math.floor((total()-1)/Math.abs(size))*Math.abs(size)),ui()[key]+size));changed();await render();});
for(const [id,delta]of[['previous-guided',-10],['next-guided',10]])bind(id,'click',async()=>{const n=ui().guidedDraftHistory?.length??0;ui().guidedHistoryOffset=Math.max(0,Math.min(Math.max(0,Math.floor((n-1)/10)*10),(ui().guidedHistoryOffset??0)+delta));changed();await render();});
bind('collection','change',async()=>selectGuided($('collection').value,null));
bind('new-item','click',async()=>selectGuided(ui().collection,{mode:'new',key:crypto.randomUUID()}));
bind('interpretation-form','submit',async()=>{
 if(ui().rawOverflow)throw new Error('The complete raw edit exceeds 256 KiB. Keep its full text in the working record, then reduce this edit before applying.');
 if(!S.record.draft.rawDirty)throw new Error('Select or write a complete interpretation edit.');
 const edit=JSON.parse(S.record.draft.raw),next=copy(S);next.record.draft.rawDirty=false;
 next.record=await editPdfReviewDraft(next.record,{action:edit.action,value:edit.value,actor:$('reviewer').value,reason:$('edit-reason').value});next.record.draft.raw='';await commit(next);message('Proposed interpretation recorded through the original PDF edit engine.');
});
bind('discard-raw','click',async()=>{if(!confirm('Discard only this unapplied text? Saved interpretations and editions remain.'))return;const next=copy(S);next.record.draft.raw='';next.record.draft.rawDirty=false;delete next.ui.rawOverflow;await commit(next);});
bind('download-recipient-copy','click',()=>download('pdf-recipient-'+S.caseId+'.working-copy.json',work));
bind('receive-recipient','click',async()=>{const file=await fileContent($('recipient-file').files[0],PDF_LIMITS.transferBytes),next=copy(S);next.record=await receivePdfWorkingCopy(next.record,file.content,{reviewer:$('reviewer').value,comment:next.record.draft.comment});pinInput(next,file,'recipient progressed working copy');await commit(next);message('Complete progressed interpretation received with original source and history.');});
bind('edition-form','submit',async()=>{if(ui().guidedDraft?.dirty||guided?.hasUnretainedChanges())throw new Error('Retain and apply the active guided form, or explicitly preserve/discard it, before saving a recipient edition. The complete form remains in this working record.');const next=copy(S);next.record=await savePdfReviewEdition(next.record,{editionId:crypto.randomUUID(),status:$('edition-status').value,reviewer:$('edition-reviewer').value,comment:$('edition-comment').value,createdAt:new Date().toISOString(),expectedEditionSha256:next.record.editions.at(-1)?.sha256??null});await commit(next);message('Complete immutable '+next.record.editions.at(-1).status+' edition retained.');});
bind('receive-return','click',async()=>{const file=await fileContent($('return-file').files[0],PDF_REVIEW_LIMITS.transferBytes),returned=await openPdfReviewReturn(file.content,{issue:S.record.issue}),next=copy(S);if(!next.returns.some(r=>r.sha256===file.sha256))next.returns.push({...file,returnSha256:returned.sha256,editionId:returned.editionId});next.ui.selectedReturn=file.sha256;next.ui.preview=null;next.ui.choices={};await commit(next);message('Exact original returned bytes retained. Select the author’s current copy and compare.');});
bind('receive-current','click',async()=>{const file=await fileContent($('current-file').files[0],PDF_LIMITS.transferBytes),current=await validatePdfReviewCurrent(S.record.issue,file.content),next=copy(S);next.currentWorkingCopy=current;pinInput(next,file,'selected current author working copy');next.ui.preview=null;next.ui.choices={};await commit(next);message('Author current working copy selected. Its original source and interpretation ancestry match.');});
bind('selected-return','change',async()=>{ui().selectedReturn=$('selected-return').value;ui().preview=null;ui().choices={};changed();await render();});
bind('compare','click',async()=>{const returned=await selectedReturn(),preview=await previewPdfReviewReturn({issue:S.record.issue,returned,currentWorkingCopy:S.currentWorkingCopy}),next=copy(S);next.ui.preview=preview;next.ui.choices={};next.ui.changeOffset=0;await commit(next);message('Complete comparison retained. Choose every proposed field before deciding.');});
for(const [id,choice]of[['keep-all','keep'],['adopt-all','adopt']])bind(id,'click',async()=>{if(!ui().preview)return;ui().choices=Object.fromEntries(ui().preview.changes.map(row=>[row.key,choice]));changed();await render();});
bind('decision-form','submit',async()=>{
 const returned=await selectedReturn(),result=await decidePdfReviewReturn({issue:S.record.issue,returned,currentWorkingCopy:S.currentWorkingCopy,preview:ui().preview,choices:ui().choices,decisionId:crypto.randomUUID(),author:$('decision-author').value,reason:$('decision-reason').value,createdAt:new Date().toISOString()});
 const replay=await applyPdfReviewDecision({issue:S.record.issue,returned,currentWorkingCopy:S.currentWorkingCopy,decision:result.decision}),next=copy(S);next.decisions.push({decision:replay.decision,beforeWorkingCopy:copy(S.currentWorkingCopy),workingCopy:replay.workingCopy});await commit(next);message('Author decision and complete resulting working copy retained. Financial receiving remains the original PDF/Bank action.');
});
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>void perform(async()=>{ui().tab=button.dataset.tab;changed();await render();if(ui().tab==='recovery')await refreshConflicts();})));
$('raw-edit').addEventListener('input',()=>{if(!S||busy||blocked)return;const value=$('raw-edit').value;if(new TextEncoder().encode(value).length>PDF_REVIEW_LIMITS.textBytes){ui().rawOverflow=value;S.record.draft.rawDirty=true;message('The complete raw text is retained in this working record but exceeds the 256 KiB edit limit. Reduce it before applying.',true);}else{delete ui().rawOverflow;S.record.draft.raw=value;S.record.draft.rawDirty=true;}changed();controls();});
for(const [id,set]of[['reviewer',v=>S.record.draft.reviewer=v],['edit-reason',v=>ui().editReason=v],['edition-reviewer',v=>S.record.draft.reviewer=v],['edition-comment',v=>S.record.draft.comment=v],['decision-author',v=>ui().decisionAuthor=v],['decision-reason',v=>ui().decisionReason=v]])$(id).addEventListener('input',()=>{if(!S||busy||blocked)return;set($(id).value);changed();});
$('changes').addEventListener('change',e=>{if(e.target.dataset.choice&&!busy&&!blocked){ui().choices[e.target.dataset.choice]=e.target.value;changed();}});
document.addEventListener('click',e=>{
 const button=e.target.closest('button[data-action]');if(!button)return;e.preventDefault();const action=button.dataset.action,id=button.dataset.id;
 void perform(async()=>{
  if(action==='edit'){await selectGuided(ui().collection,{mode:'existing',id});$('guided-editor').scrollIntoView({block:'nearest'});return;}
  if(action==='edition-copy')return download('pdf-edition-'+id+'.working-copy.json',await pdfReviewWorkingCopy(S.record,{editionId:id}));
  if(action==='edition-return')return download('pdf-review-'+S.caseId+'-'+id+'.return.json',pdfReviewTransfer(await exportPdfReviewReturn(S.record,{editionId:id})));
  if(action==='decision')return download('pdf-decision-'+S.decisions[Number(id)].decision.decisionId+'.json',S.decisions[Number(id)].decision);
  if(action==='decision-copy')return download('pdf-decided-'+S.decisions[Number(id)].decision.decisionId+'.working-copy.json',S.decisions[Number(id)].workingCopy);
  if(action==='decision-current'){const row=S.decisions[Number(id)];if(!confirm('Select this retained result as the author’s current interpretation for the next comparison?'))return;const next=copy(S);next.currentWorkingCopy=copy(row.workingCopy);next.ui.preview=null;next.ui.choices={};await commit(next);return;}
  if(action==='guided-download')return download('pdf-guided-form-'+id+'.json',ui().guidedDraftHistory[Number(id)]);
  if(action==='guided-restore'){
   if(S.record.draft.rawDirty||ui().rawOverflow)throw new Error('Apply or preserve the current raw edit before restoring another form.');
   const original=ui().guidedDraftHistory[Number(id)];if(!original)throw new Error('The retained complete guided form is unavailable.');
   if(!confirm('Reopen this retained form for review, preserving the current complete form in history? Stale source revisions remain blocked.'))return;
   ui().tab='source';await selectGuided(original.collection,guidedSelection(original),{snapshot:original});return;
  }
  if(action==='input'){const row=S.inputs[Number(id)];return download(row.name,row.content);}
  if(action==='return-file'){const row=S.returns[Number(id)];return download(row.name,row.content);}
  if(action==='issued-copy')return download('pdf-issued-'+S.caseId+'.working-copy.json',S.record.issue.workingCopy);
  if(action==='extraction')return download('pdf-original-extraction.json',S.record.issue.workingCopy.extraction);
  if(action==='conflict-download'){const row=await store.readConflict(S.caseId,id);return download('pdf-review-'+S.caseId+'-conflict-'+id+'.json',row.snapshot);}
  if(action==='conflict-restore'){const live=capture();if(timer){clearTimeout(timer);timer=null;}if(dirty)await persist().catch(()=>{});await tail.catch(()=>{});const conflict=await store.readConflict(S.caseId,id),current=await store.read(S.caseId);if(!confirm('Restore this complete competing draft as the current local record, preserving the current saved record in its history?'))return;const next=await verifyDesk(conflict.snapshot);preservePrior(next,current);preservePrior(next,live);checkPdfDesk(next);blocked=false;storageRevision=current?.storageRevision??0;next.storageRevision=storageRevision;await commit(next);await refreshConflicts();message('Selected competing draft restored explicitly; the former complete saved record remains in history.');}
 },{rescue:action.startsWith('conflict-')});
});
$('download-live').addEventListener('click',()=>{try{download('pdf-review-'+S.caseId+'-local-recovery.json',checkPdfDesk(S));message('Complete current local record downloaded.');}catch(error){message(error.message,true);}});
$('refresh-conflicts').addEventListener('click',()=>void perform(()=>refreshConflicts(),{rescue:true}));
$('more-conflicts').addEventListener('click',()=>void perform(()=>refreshConflicts({more:true}),{rescue:true}));
$('reopen-current').addEventListener('click',()=>void perform(async()=>{const live=capture();if(timer){clearTimeout(timer);timer=null;}if(dirty)await persist().catch(()=>{});await tail.catch(()=>{});await loadSaved(S.caseId,{preserveLive:live});await refreshConflicts();},{rescue:true}));
window.addEventListener('beforeunload',event=>{if(dirty||busy||blocked){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{renderEpoch++;pdfOpenEpoch++;if(pdfTask)pdfTask.cancel();if(pdfDocument)void pdfDocument.destroy();if(pdfLoading)void pdfLoading.destroy();});
window.addEventListener('resize',()=>{if(S&&ui().tab==='source')void drawPage().catch(error=>message(error.message,true));});
try{
 if(offline){$('pdf-desk-link').hidden=true;document.querySelector('a[href="./REVIEW.md"]').addEventListener('click',event=>{event.preventDefault();const guide=globalThis.__PDF_REVIEW_SOURCES?.files.find(f=>f.path==='REVIEW.md');if(guide)download('REVIEW.md',guide.content,'text/markdown');else message('The operating guide is available in the complete source project.');});}
 await refreshCases();
 if(globalThis.__PDF_REVIEW_DESK)await adoptDesk(globalThis.__PDF_REVIEW_DESK);
 else {const id=new URL(location.href).searchParams.get('case');if(id)await loadSaved(id);else message('Open a complete named review, or issue one from the original PDF working copy.');}
}catch(error){message(error.message,true);}finally{busy=false;controls();}
