// SPDX-License-Identifier: MIT
import {createWorkingCopy,openWorkingCopy,editWorkingCopy,candidateRows,accountReview,prepareBankSource,pdfSourceInput,
 canonical,decodeBase64,encodeBase64,digest,checkTransferSize,PDF_LIMITS} from './model.mjs';
import {extractPdf} from './extractor.mjs';
import {BankStatementsClient} from './sdk/client.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config=await fetch('./config.json').then(r=>{if(!r.ok)throw new Error('Could not open the PDF desk configuration');return r.json();});
$('bank-link').href=config.bankUi;
const client=new BankStatementsClient({baseUrl:config.apiBase});
const state={work:null,page:1,accountId:'',selection:null,selected:new Set(),busy:false,generation:0,render:null,document:null,pdfjs:null,
 rowOffset:0,historyOffset:0,bank:null,preview:null,saveError:null,pending:null,editor:null,saveConflict:null};
const custody=new Map();
const custodyToken=row=>row?(row.writeId??'legacy:'+row.updatedAt+':'+row.value?.revision):null;
const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('starforge-bank-pdf-review',2);
 request.onupgradeneeded=()=>{const opened=request.result,tx=request.transaction;
  if(!opened.objectStoreNames.contains('copies'))opened.createObjectStore('copies',{keyPath:'id'});
  if(!opened.objectStoreNames.contains('pending'))opened.createObjectStore('pending',{keyPath:'id'});
  if(!opened.objectStoreNames.contains('metadata')){const metadata=opened.createObjectStore('metadata',{keyPath:'id'}),cursor=tx.objectStore('copies').openCursor();
   cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const row=item.value;metadata.put({id:row.id,name:row.name,updatedAt:row.updatedAt,revision:row.value?.revision??0});item.continue();};}
 };request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 request.onblocked=()=>message('Close another older PDF-desk tab to finish opening the local working-copy catalog.',true);
});
let writes=Promise.resolve();
function database(store,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),object=tx.objectStore(store);let request;try{request=work(object);}catch(error){reject(error);return;}tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Local save was aborted'));});}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function lock(){document.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=state.busy||Boolean(state.pending);});for(const id of['export','original'])$(id).disabled=state.busy||!state.work;$('save-conflict').disabled=state.busy||!state.saveConflict;for(const el of $('pending').querySelectorAll('button'))el.disabled=state.busy;}
async function perform(fn){if(state.busy)return;state.busy=true;lock();try{await fn();}catch(error){message(error.message+(error.code?' ['+error.code+']':''),true);}finally{state.busy=false;lock();}}
async function save(){
 const captured=state.work;if(!captured)return;checkTransferSize(captured);
 const row={id:captured.id,name:captured.name,updatedAt:new Date().toISOString(),writeId:crypto.randomUUID(),value:captured};
 const next=writes.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  const expected=custody.get(captured.id)??null,tx=db.transaction(['copies','metadata'],'readwrite'),copies=tx.objectStore('copies'),metadata=tx.objectStore('metadata'),read=copies.get(captured.id);let failure;
  read.onsuccess=()=>{const actual=custodyToken(read.result);
   if(actual!==expected){failure=Object.assign(new Error('Another tab saved a newer version. Download this complete working copy or save it as a separate review.'),{code:'PDF_SAVE_CONFLICT',details:{id:captured.id,expected,actual}});tx.abort();return;}
   copies.put(row);metadata.put({id:row.id,name:row.name,updatedAt:row.updatedAt,revision:captured.revision});
  };
  tx.oncomplete=()=>{custody.set(captured.id,row.writeId);resolve();};tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('Local save was aborted'));
 }));writes=next;
 try{await next;state.saveError=null;state.saveConflict=null;$('save-conflict').hidden=true;$('save-status').textContent='Saved locally · revision '+captured.revision;await savedList();}
 catch(error){state.saveError=error;if(error.code==='PDF_SAVE_CONFLICT'){state.saveConflict=error.details;$('save-conflict').hidden=false;}
  $('save-status').textContent=error.code==='PDF_SAVE_CONFLICT'?'Newer saved version preserved. Keep this complete version as a separate review.':'Local save failed. Download the complete working copy now.';throw error;}
}
async function saveConflictCopy(){
 if(!state.saveConflict||!state.work)return;const original=state.work,pending=state.pending,conflict=state.saveConflict,copy=structuredClone(original);
 copy.id=crypto.randomUUID();copy.receivedFrom={workingCopyId:original.id,revision:original.revision,reason:'Preserved complete conflicting local review',at:new Date().toISOString()};
 state.work=copy;custody.set(copy.id,null);
 try{
  await save();
  if(pending){const next={...pending,id:copy.id};await new Promise((resolve,reject)=>{
   const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),get=store.get(pending.id);
   get.onsuccess=()=>{store.put(next);if(samePending(get.result,pending))store.delete(pending.id);};
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});state.pending=next;}
  render();message('Complete current review saved separately. The other tab’s original saved version is preserved.');
 }catch(error){state.work=original;state.pending=pending;state.saveConflict=conflict;$('save-conflict').hidden=false;render();throw error;}
}
async function savedList(){const rows=await database('metadata','readonly',s=>s.getAll()),selected=$('saved').value;$('saved').innerHTML='<option value="">Choose a working copy</option>'+rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+' · '+esc(row.updatedAt)+'</option>').join('');$('saved').value=selected;}
function reviewIdentity(){return{actor:$('actor').value.trim(),reason:$('reason').value.trim()};}
async function edit(action,value){state.work=editWorkingCopy(state.work,action,value,reviewIdentity());state.preview=null;try{await save();}finally{render();}}
function download(name,value,type='application/json'){
 const bytes=value instanceof Uint8Array?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function engine(){
 if(state.pdfjs)return state.pdfjs;
 const module=await import(config.pdfEngineUrl);if(module.version!==config.pdfVersion)throw new Error('The installed PDF.js version differs from the selected runtime. Install bank-pdf '+config.pdfVersion+'.');
 module.GlobalWorkerOptions.workerSrc=config.pdfWorkerUrl;state.pdfjs=module;return module;
}
async function documentFor(bytes,password){
 const pdfjs=await engine(),base=config.pdfRuntimeBase;
 const task=pdfjs.getDocument({data:bytes.slice(),password,stopAtErrors:true,enableXfa:false,isEvalSupported:false,useWasm:false,disableWorkerRendering:true,
  cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/'});
 task.onPassword=(updatePassword,reason)=>{const secret=prompt(reason===pdfjs.PasswordResponses?.INCORRECT_PASSWORD?'The PDF password was not accepted. Enter the original document password:':'Enter the original PDF password. It is used only for this opening and is not saved.');if(secret===null){void task.destroy();return;}updatePassword(secret);};
 try{return await task.promise;}catch(error){await task.destroy().catch(()=>{});throw error;}
}
async function closeDocument(){
 state.generation++;if(state.render){state.render.cancel();await state.render.promise.catch(()=>{});state.render=null;}
 if(state.document){const original=state.document;state.document=null;await original.destroy();}
}
async function openWork(work){
 const bytes=decodeBase64(work.file.dataBase64),opened=await documentFor(bytes);
 let pending;try{
 pending=(await database('pending','readonly',s=>s.get(work.id)))??null;
 const saved=await database('copies','readonly',s=>s.get(work.id));
 if(saved&&canonical(saved.value)!==canonical(work)){
  if(pending)throw new Error('This original working copy has an unresolved Bank request. Open its saved review and recover that request before receiving another edition.');
  if(!confirm('A different edition with this working-copy identity is already saved. Preserve the incoming complete edition as a separate review?'))throw new Error('Incoming review left unopened; the saved original is unchanged.');
  const previous={workingCopyId:work.id,revision:work.revision,at:new Date().toISOString(),reason:'Received a separate complete working-copy edition'};work=structuredClone(work);work.id=crypto.randomUUID();work.receivedFrom=previous;custody.set(work.id,null);
 }else custody.set(work.id,custodyToken(saved));
 }catch(error){await opened.destroy();throw error;}
 await closeDocument();state.document=opened;
 state.work=work;state.page=1;state.accountId=work.accounts[0]?.id||'';state.selected.clear();state.selection=null;state.rowOffset=0;state.historyOffset=0;state.preview=null;
 state.pending=pending;state.saveConflict=null;$('save-conflict').hidden=true;render();await drawPage();
}
async function openPdf(file){
 if(file.size>config.fileBytes)throw new Error('Choose an original PDF no larger than '+config.fileBytes+' bytes.');
 const bytes=new Uint8Array(await file.arrayBuffer()),opened=await documentFor(bytes);let extraction,work;
 try{
  extraction=await extractPdf({bytes,pdfjs:state.pdfjs,document:opened,loadingOptions:{stopAtErrors:true,enableXfa:false,isEvalSupported:false,useWasm:false,disableWorkerRendering:true,cMapPacked:true},onProgress:p=>message('Reading original page '+(p.page??p.number??p)+' of '+opened.numPages)});
  work=await createWorkingCopy({name:file.name,file:{name:file.name,dataBase64:encodeBase64(bytes)},extraction});
 }catch(error){await opened.destroy();throw error;}
 await closeDocument();state.document=opened;state.work=work;custody.set(work.id,null);
 state.page=1;state.accountId='';state.selection=null;state.selected.clear();state.preview=null;state.pending=null;
 try{await save();}finally{render();await drawPage();}message('All '+extraction.pages.length+' original pages are retained. Add each statement account and map its cash table.');
}
const account=()=>state.work?.accounts.find(a=>a.id===state.accountId);
const page=()=>state.work?.extraction.pages.find(p=>p.number===state.page);
function selectedSource(){
 const p=page();if(!p)throw new Error('Open an original PDF page.');
 const selected=p.items.filter(item=>state.selected.has(item.id));
 let box=state.selection;if(selected.length)box=[Math.max(0,Math.min(...selected.map(x=>x.box[0]))),Math.max(0,Math.min(...selected.map(x=>x.box[1]))),Math.min(p.width,Math.max(...selected.map(x=>x.box[2]))),Math.min(p.height,Math.max(...selected.map(x=>x.box[3])))];
 if(!box)throw new Error('Select an original page rectangle or its text items.');
 const items=selected.length?selected:p.items.filter(item=>{const x=(item.box[0]+item.box[2])/2,y=(item.box[1]+item.box[3])/2;return x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3];});
 return{page:p.number,box:[...box],itemIds:items.map(x=>x.id)};
}
function renderText(){
 const p=page();$('text-items').innerHTML=p.items.map(item=>'<label class="text-item"><input type="checkbox" data-item="'+esc(item.id)+'" '+(state.selected.has(item.id)?'checked':'')+'><span><code>'+esc(item.id)+'</code> '+esc(item.text||'[empty text item]')+'</span></label>').join('');
 $('text-items').querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{if(el.checked)state.selected.add(el.dataset.item);else state.selected.delete(el.dataset.item);drawSelection();}));
 const review=state.work.pageReviews.find(x=>x.page===p.number);$('page-review').elements.disposition.value=review?.disposition||'CASH_MAPPED';$('page-review').elements.note.value=review?.note||'';
}
async function drawPage(){
 if(!state.document||!state.work)return;const generation=++state.generation;
 if(state.render){state.render.cancel();await state.render.promise.catch(()=>{});state.render=null;}
 const original=await state.document.getPage(state.page);if(generation!==state.generation)return;
 const geometry=page(),available=Math.max(250,$('page-scroll').clientWidth),factor=available/geometry.width*Number($('zoom').value),viewport=original.getViewport({scale:factor});
 const canvas=$('page-canvas'),overlay=$('selection-canvas'),dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
 overlay.width=canvas.width;overlay.height=canvas.height;overlay.style.width=viewport.width+'px';overlay.style.height=viewport.height+'px';
 state.viewScale=factor;state.pixelRatio=dpr;
 const task=original.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});state.render=task;
 try{await task.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;}finally{if(state.render===task)state.render=null;}
 if(generation!==state.generation)return;renderText();drawSelection();lock();
}
function drawSelection(){
 const canvas=$('selection-canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!state.work)return;
 let selection;try{selection=selectedSource();}catch{$('selection-summary').textContent='Drag a rectangle or select original text items.';return;}
 const scale=state.viewScale*state.pixelRatio,[x1,y1,x2,y2]=selection.box;ctx.strokeStyle='#111';ctx.lineWidth=2*state.pixelRatio;ctx.setLineDash([6*state.pixelRatio,3*state.pixelRatio]);ctx.strokeRect(x1*scale,y1*scale,(x2-x1)*scale,(y2-y1)*scale);
 $('selection-summary').textContent='Page '+selection.page+' · '+selection.itemIds.length+' original text items · '+selection.box.map(x=>x.toFixed(1)).join(', ')+' points';
}
function filteredRows(){const q=$('row-search').value.toLowerCase(),decision=$('row-filter').value;return state.work.rows.filter(row=>row.accountId===state.accountId&&(!decision||row.decision===decision)&&(!q||[row.postedDate,row.amount,row.memo,row.reference,row.note,row.source.text].some(v=>String(v).toLowerCase().includes(q))));}
function renderRows(){
 const rows=filteredRows(),max=Math.max(0,Math.ceil(rows.length/50)-1)*50;state.rowOffset=Math.min(state.rowOffset,max);
 const visible=rows.slice(state.rowOffset,state.rowOffset+50);
 $('rows').innerHTML=visible.map(row=>'<tr><td><button data-page-row="'+esc(row.id)+'">'+row.source.page+'</button></td><td>'+esc(row.postedDate||'Review date')+'</td><td>'+esc(row.memo||row.payee||row.source.text)+'</td><td class="amount">'+esc(row.amount||'Review amount')+'</td><td>'+esc(row.decision)+'</td><td><button data-edit-row="'+esc(row.id)+'">Review</button></td></tr>').join('')||'<tr><td colspan="6">No mapped rows for this account.</td></tr>';
 $('row-page').textContent=(rows.length?state.rowOffset+1:0)+'–'+Math.min(state.rowOffset+50,rows.length)+' of '+rows.length;
 $('rows').querySelectorAll('[data-edit-row]').forEach(el=>el.onclick=()=>rowEditor(state.work.rows.find(r=>r.id===el.dataset.editRow)));
 $('rows').querySelectorAll('[data-page-row]').forEach(el=>el.onclick=()=>perform(async()=>{const row=state.work.rows.find(r=>r.id===el.dataset.pageRow);state.page=row.source.page;state.selection=row.source.box;state.selected=new Set(row.source.itemIds);$('page').value=String(state.page);await drawPage();}));
}
function render(){
 const work=state.work;$('workspace').hidden=!work;if(!work){lock();return;}
 $('document-name').textContent=work.name;$('document-summary').textContent=work.extraction.pages.length+' pages · '+work.file.bytes.toLocaleString()+' bytes · revision '+work.revision+' · PDF.js '+work.extraction.engine.version;
 $('account').innerHTML='<option value="">Choose an account</option>'+work.accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name+' · '+a.accountId+' · '+a.currency)+'</option>').join('');$('account').value=state.accountId;
 $('page').innerHTML=work.extraction.pages.map(p=>'<option value="'+p.number+'">'+p.number+' / '+work.extraction.pages.length+(work.pageReviews.some(r=>r.page===p.number)?' · reviewed':'')+'</option>').join('');$('page').value=String(state.page);
 const a=account();if(a){
  const r=accountReview(work,a.id);$('account-review').innerHTML='<h2>'+esc(a.name)+'</h2><p>'+esc(a.bankId+' · '+a.accountId+' · '+a.from+' to '+a.until)+'</p><div class="account-totals">'+[['Included',r.included],['Needs review',r.unreviewed],['Movement',r.movement],['Balance difference',r.difference??'Choose balances']].map(([label,v])=>'<div>'+label+'<strong>'+esc(v)+'</strong></div>').join('')+'</div>'+r.problems.map(p=>'<p class="problem">'+esc(p.message)+(p.difference?' · '+esc(p.difference):'')+'</p>').join('');
 }else $('account-review').innerHTML='<h2>Account mapping</h2><p>Add each printed bank account separately, with its explicit currency and statement period.</p>';
 $('regions').innerHTML=work.regions.filter(r=>r.accountId===state.accountId).map(r=>'<div class="card"><strong>Page '+r.page+'</strong> · '+esc(r.amountMode)+'<p>'+esc(r.box.map(v=>v.toFixed(1)).join(', '))+'</p><button data-region="'+esc(r.id)+'">Edit mapping</button> <button data-extract="'+esc(r.id)+'">Generate rows for review</button></div>').join('')||'<p class="muted">Select a page region and map its table columns.</p>';
 $('regions').querySelectorAll('[data-region]').forEach(el=>el.onclick=()=>regionEditor(work.regions.find(r=>r.id===el.dataset.region)));
 $('regions').querySelectorAll('[data-extract]').forEach(el=>el.onclick=()=>perform(async()=>{const region=work.regions.find(r=>r.id===el.dataset.extract),rows=candidateRows(work,region);await edit('ROWS',rows);message(rows.length+' original candidate rows retained for explicit review. Existing row decisions were reset for this changed table interpretation.');}));
 renderRows();
 $('balances').innerHTML=work.balances.filter(b=>b.accountId===state.accountId).map(b=>'<div class="card"><strong>'+esc(b.kind)+' · '+esc(b.amount)+'</strong><p>'+esc(b.date)+' · page '+b.source.page+' · '+(b.selected?'Selected for bank review':'Retained alternative')+'</p><p>'+esc(b.note)+'</p><button data-balance="'+esc(b.id)+'">Review balance</button></div>').join('')||'<p class="muted">Select the original opening and closing balance locations.</p>';
 $('balances').querySelectorAll('[data-balance]').forEach(el=>el.onclick=()=>balanceEditor(work.balances.find(b=>b.id===el.dataset.balance)));
 const history=[...work.history].reverse();state.historyOffset=Math.min(state.historyOffset,Math.max(0,Math.ceil(history.length/50)-1)*50);
 $('history').innerHTML=history.slice(state.historyOffset,state.historyOffset+50).map(e=>'<tr><td>'+e.revision+'</td><td>'+esc(e.at)+'</td><td>'+esc(e.actor)+'</td><td>'+esc(e.action)+'</td><td>'+esc(e.reason)+'</td></tr>').join('');
 $('history-page').textContent=(history.length?state.historyOffset+1:0)+'–'+Math.min(history.length,state.historyOffset+50)+' of '+history.length;
 $('imports').innerHTML=work.bankImports.map(row=>'<div class="card"><strong>Bank import '+esc(row.importId)+'</strong><p>Workspace '+esc(row.workspaceId)+'</p><p>Original request '+esc(row.requestId)+' · working revision '+row.workingRevision+'</p><button data-import="'+esc(row.importId)+'">Read retained report</button> <button data-original-import="'+esc(row.importId)+'">Download retained PDF</button></div>').join('')||'<p class="muted">No bank import has been recorded in this working copy.</p>';
 $('imports').querySelectorAll('[data-import]').forEach(el=>el.onclick=()=>perform(async()=>{const current=await client.state(),record=work.bankImports.find(r=>r.importId===el.dataset.import);if(record.workspaceId!==current.workspaceId)throw new Error('Open the original accounting workspace before reading this retained import.');download('bank-pdf-retained-report.json',await client.importDetail(record.importId));}));
 $('imports').querySelectorAll('[data-original-import]').forEach(el=>el.onclick=()=>perform(async()=>{const current=await client.state(),record=work.bankImports.find(r=>r.importId===el.dataset.originalImport);if(record.workspaceId!==current.workspaceId)throw new Error('Open the original accounting workspace before downloading this PDF.');const result=await client.importFile(record.importId,'original');await downloadBinary(result,'original.pdf');}));
 $('bank-preview').hidden=!state.preview;renderPending();lock();
}
function input(name,label,value='',type='text',attrs=''){return'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';}
function select(name,label,options,value){return'<label>'+esc(label)+'<select name="'+name+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';}
function textarea(name,label,value='',rows=3){return'<label class="wide">'+esc(label)+'<textarea name="'+name+'" rows="'+rows+'">'+esc(value)+'</textarea></label>';}
function editor(title,body,save){state.editor=save;$('editor-title').textContent=title;$('editor-fields').innerHTML=body;$('editor').showModal();}
function requireAccount(){const a=account();if(!a)throw new Error('Select an account first.');return a;}
function accountEditor(existing){
 const value=existing||{name:'',bankId:'',accountId:'',branchId:'',accountType:'CHECKING',currency:'USD',scale:2,from:'',until:'',note:''};
 editor(existing?'Edit account interpretation':'Add printed account','<div class="form-grid">'+input('name','Account name',value.name)+input('bankId','Institution identifier',value.bankId)+input('accountId','Printed account identifier',value.accountId)+input('branchId','Branch identifier',value.branchId)+input('accountType','Account type',value.accountType)+input('currency','Currency',value.currency)+input('scale','Currency decimal places',value.scale,'number','min="0" max="6"')+input('from','Period from',value.from,'date')+input('until','Period through',value.until,'date')+textarea('note','Source and interpretation notes',value.note)+'</div>',async data=>{await edit('ACCOUNT',{...Object.fromEntries(data),id:existing?.id,scale:Number(data.get('scale'))});state.accountId=existing?.id||state.work.accounts.at(-1).id;render();});
}
function regionEditor(existing){
 const a=requireAccount(),source=existing?{page:existing.page,box:existing.box}:selectedSource(),b=source.box;
 const defaults={date:[b[0],b[0]+(b[2]-b[0])*.16],description:[b[0]+(b[2]-b[0])*.16,b[0]+(b[2]-b[0])*.58],debit:[b[0]+(b[2]-b[0])*.58,b[0]+(b[2]-b[0])*.72],credit:[b[0]+(b[2]-b[0])*.72,b[0]+(b[2]-b[0])*.85],balance:[b[0]+(b[2]-b[0])*.85,b[2]]},columns=existing?.columns||defaults;
 editor('Map original table columns','<p>Coordinates are points from the displayed page’s top-left. Each column uses [left, right]. Adjust against the original page; generated rows still require review.</p><div class="form-grid">'+
 input('page','Original page',source.page,'number')+input('box','Table [left, top, right, bottom]',b.join(', '))+
 select('amountMode','Amount layout',[['DEBIT_CREDIT','Separate debit and credit'],['SIGNED','Signed amount']],existing?.amountMode||'DEBIT_CREDIT')+
 select('dateFormat','Printed date order',[['MDY','Month/day/year'],['DMY','Day/month/year'],['YMD','Year/month/day']],existing?.dateFormat||'MDY')+
 input('year','Year when source omits its year',existing?.yearRule?.year||'','number')+input('century','Century for two-digit printed years',existing?.yearRule?.century??'','number')+
 input('amountPrefix','Explicit currency prefix to strip (for example $)',existing?.amountPrefix??'')+input('amountSuffix','Explicit currency suffix to strip',existing?.amountSuffix??'')+
 input('decimalSeparator','Decimal separator',existing?.decimalSeparator??'.')+input('groupSeparator','Thousands separator',existing?.groupSeparator??',')+
 input('lineTolerance','Line tolerance in points',existing?.lineTolerance??2,'number','step="0.1" min="0.1" max="20"')+
 select('negativeMeans','Signed negative amount means',[['DEBIT','Debit'],['CREDIT','Credit']],existing?.negativeMeans||'DEBIT')+
 Object.entries({date:'Date',description:'Description',debit:'Debit',credit:'Credit',amount:'Signed amount',reference:'Reference',balance:'Running balance'}).map(([k,label])=>input(k,label+' [left, right]',columns[k]?.join(', ')||'')).join('')+
 '<label class="inline-check wide"><input name="continuation" type="checkbox" '+(existing?.descriptionContinuation?'checked':'')+'>Join a following description-only line to the previous movement</label></div>',
 async data=>{const cols={};for(const key of['date','description','debit','credit','amount','reference','balance'])if(String(data.get(key)).trim())cols[key]=String(data.get(key)).split(',').map(Number);await edit('REGION',{id:existing?.id,accountId:a.id,page:Number(data.get('page')),box:String(data.get('box')).split(',').map(Number),columns:cols,dateFormat:data.get('dateFormat'),yearRule:{...(data.get('year')?{year:Number(data.get('year'))}:{}),...(data.get('century')?{century:Number(data.get('century'))}:{})},amountMode:data.get('amountMode'),amountPrefix:data.get('amountPrefix'),amountSuffix:data.get('amountSuffix'),decimalSeparator:data.get('decimalSeparator'),groupSeparator:data.get('groupSeparator'),lineTolerance:Number(data.get('lineTolerance')),descriptionContinuation:data.has('continuation'),negativeMeans:data.get('negativeMeans')});});
}
function rowEditor(existing){
 const a=requireAccount(),source=existing?.source||selectedSource(),raw=existing?.raw||{},value=existing||{postedDate:'',amount:'',memo:'',reference:'',runningBalance:'',note:'',decision:'REVIEW'};
 editor('Review original movement','<p>Original page '+source.page+' · '+source.itemIds.length+' text items</p><pre>'+esc(existing?.source.text||page().items.filter(x=>source.itemIds.includes(x.id)).map(x=>x.text).join(' '))+'</pre><div class="form-grid">'+
 input('postedDate','Posted calendar date',value.postedDate,'date')+input('amount','Signed exact amount ('+a.currency+')',value.amount)+input('reference','Printed reference',value.reference)+input('runningBalance','Original running balance',value.runningBalance)+textarea('memo','Description',value.memo)+select('decision','Decision',[['REVIEW','Needs review'],['INCLUDE','Include cash movement'],['EXCLUDE','Exclude original row']],value.decision)+textarea('note','Interpretation or exclusion reason',value.note)+'</div>',
 async data=>{await edit('ROWS',[{...value,...Object.fromEntries(data),id:existing?.id,accountId:a.id,source,raw}]);});
}
function balanceEditor(existing){
 const a=requireAccount(),source=existing?.source||selectedSource(),value=existing||{kind:'OPENING',date:'',amount:'',raw:'',selected:true,note:''};
 editor('Review original balance','<p>Original page '+source.page+' · '+source.itemIds.length+' text items</p><div class="form-grid">'+
 select('kind','Balance meaning',[['OPENING','Opening'],['CLOSING','Closing'],['RUNNING','Running'],['OTHER','Other printed total']],value.kind)+input('date','Balance calendar date',value.date,'date')+input('amount','Exact signed amount',value.amount)+input('raw','Original printed amount text',value.raw)+textarea('note','Interpretation notes',value.note)+
 '<label class="inline-check wide"><input name="selected" type="checkbox" '+(value.selected?'checked':'')+'>Select for this account’s bank review</label></div>',
 async data=>{await edit('BALANCE',{...Object.fromEntries(data),id:existing?.id,accountId:a.id,source,selected:data.has('selected')});});
}
async function downloadBinary(result,name){
 if(result&&typeof result.arrayBuffer==='function'){download(name,new Uint8Array(await result.arrayBuffer()),result.headers?.get?.('Content-Type')||'application/pdf');return;}
 const value=result?.bytes??result?.data??result?.body??result;
 if(value instanceof Blob){download(name,new Uint8Array(await value.arrayBuffer()),value.type);return;}
 if(value instanceof ArrayBuffer){download(name,new Uint8Array(value),'application/pdf');return;}
 if(value instanceof Uint8Array){download(name,value,'application/pdf');return;}
 throw new Error('The original bank download did not return complete binary bytes.');
}
async function reopenBankImport(importId,expectedWorkspaceId=null){
 const bank=await client.state();if(expectedWorkspaceId&&bank.workspaceId!==expectedWorkspaceId)throw new Error('Open the original accounting workspace before reopening this retained review.');
 const detail=await client.importDetail(importId);if(detail.import?.format!=='PDF_REVIEW'||!detail.report?.pdfReview?.workingCopy)throw new Error('This original import does not contain a complete PDF review.');
 const response=await client.importFile(importId,'original'),bytes=new Uint8Array(await response.arrayBuffer()),raw=structuredClone(detail.report.pdfReview.workingCopy);raw.file.dataBase64=encodeBase64(bytes);
 const work=await openWorkingCopy(canonical(raw));await openWork(work);
 if(!work.bankImports.some(r=>r.workspaceId===bank.workspaceId&&r.importId===importId)){
  state.work=editWorkingCopy(state.work,'BANK_IMPORT',{workspaceId:bank.workspaceId,importId,requestId:detail.import.requestId,
   bankAccountId:detail.import.accountId,workingRevision:raw.revision,accountId:detail.report.pdfReview.accountId,
   csvSha256:detail.report.pdfReview.csv.sha256,mappingSha256:detail.report.pdfReview.mappingSha256,pdfSha256:raw.file.sha256,reviewSha256:detail.import.reviewSha256},
   {actor:detail.import.actor||'Original bank importer',reason:'Reopened complete original PDF review from the retained accounting import'});
 }
 await save();render();message('Original PDF, complete page interpretation and original Bank binding reopened from the retained import.');
}
async function chooseBankImport(){
 const bank=await client.state(),imports=bank.imports.filter(i=>i.format==='PDF_REVIEW');if(!imports.length)throw new Error('This accounting workspace has no retained PDF reviews.');
 editor('Reopen retained PDF review',select('importId','Original retained import',imports.map(i=>[i.id,i.file.name+' · '+i.createdAt]),imports[0].id),async data=>reopenBankImport(data.get('importId'),bank.workspaceId));
}
async function previewBank(){
 const a=requireAccount(),review=accountReview(state.work,a.id);
 if(!review.receivable)throw new Error('Complete page coverage, row review and one opening/closing selection before bank preview.');
 let acknowledge=false;if(review.problems.length)acknowledge=confirm('The original balances differ by '+review.difference+'. Retain this mismatch for the bank’s separate reconciliation review?');
 const source=await pdfSourceInput(state.work,a.id,{acknowledgeBalanceDifference:acknowledge}),size=new TextEncoder().encode(JSON.stringify({source})).length;
 if(size>config.requestBytes-20000)throw new Error('The complete PDF and interpretation exceed this bank endpoint’s '+config.requestBytes+'-byte request limit. Export the full working copy and reduce the selected document at its original issuer source.');
 const bank=await client.state(),preview=await client.previewSource({source});
 const statement=preview.statements?.[0];if(!statement)throw new Error('The original bank preview returned no reviewed statement account.');
 state.bank=bank;state.preview={source,preview,bank,accountId:a.id,workingRevision:state.work.revision,statement,prepared:await prepareBankSource(state.work,a.id,{acknowledgeBalanceDifference:acknowledge})};
 renderBankPreview();$('bank-preview').hidden=false;$('bank-preview').scrollIntoView({behavior:'smooth'});
}
function renderBankPreview(){
 const p=state.preview;if(!p)return;const matching=p.bank.accounts.filter(a=>a.sourceIdentitySha256===p.statement.account.identitySha256&&a.currency.code===account().currency);
 const prior=p.bank.imports.filter(i=>i.file.sha256===state.work.file.sha256&&matching.some(a=>a.id===i.accountId)&&i.statementId===p.statement.id);
 $('bank-preview').innerHTML='<h2>Original bank intake</h2><p>Account '+esc(p.statement.account.accountId)+' · '+esc(p.statement.account.currency)+' · '+p.statement.summary.postedCount+' reviewed movements.</p><p>The original PDF and complete page interpretation will be retained in this accounting workspace.</p>'+
 '<p><code>'+esc(p.bank.workspaceId)+'</code></p>'+p.preview.issues.map(i=>'<p class="problem">'+esc(i.message)+'</p>').join('')+
 '<label>Original bank account<select id="bank-account"><option value="">Create a bound bank account</option>'+matching.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('')+'</select></label>'+
 '<label>Prior interpretation to correct<select id="supersedes"><option value="">No previous interpretation</option>'+prior.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.createdAt+' · '+i.id)+'</option>').join('')+'</select></label>'+
 '<div class="actions"><button id="receive-bank">Retain reviewed PDF in Bank</button><button id="preview-json">Download complete prepared source</button></div>';
 if(matching.length===1)$('bank-account').value=matching[0].id;
 $('receive-bank').onclick=()=>perform(receiveBank);$('preview-json').onclick=()=>download('reviewed-pdf-bank-source.json',JSON.stringify({source:p.source}));lock();
}
const samePending=(left,right)=>left?.body?.requestId===right?.body?.requestId&&left?.action===right?.action&&canonical(left?.body)===canonical(right?.body);
async function storePending(value){
 let held;await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),request=store.get(value.id);let failure;
  request.onsuccess=()=>{held=request.result;if(held&&!samePending(held,value)){failure=Object.assign(new Error('This working copy already has a different unresolved Bank request. Recover its original outcome first.'),{code:'PDF_PENDING_CONFLICT'});tx.abort();return;}store.put(held||value);};
  tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);
 }).catch(error=>{if(held){state.pending=held;renderPending();}throw error;});state.pending=held||value;renderPending();
}
async function clearPending(){
 const current=state.pending;if(!current)return;let held;
 await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),request=store.get(current.id);let failure;
  request.onsuccess=()=>{held=request.result;if(held&&!samePending(held,current)){failure=Object.assign(new Error('Another unresolved original request is retained. Its body has been preserved; recover that request.'),{code:'PDF_PENDING_CONFLICT'});tx.abort();return;}if(held)store.delete(current.id);};
  tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);
 }).catch(error=>{if(held){state.pending=held;renderPending();}throw error;});
 state.pending=null;renderPending();
}
function renderPending(){
 $('pending').hidden=!state.pending;if(!state.pending)return;
 $('pending').innerHTML='<strong>Original bank operation retained</strong><p>'+esc(state.pending.action)+' · '+esc(state.pending.body.requestId)+'</p><p>Keep this original request until its recorded outcome is recovered. Working-copy downloads remain available.</p><button id="recover-operation">Recover original outcome</button><button id="retry-operation">Retry the same request</button>';
 $('recover-operation').onclick=()=>perform(()=>recoverPending(false));$('retry-operation').onclick=()=>perform(()=>recoverPending(true));lock();
}
async function originalMutation(action,body){
 if(new TextEncoder().encode(JSON.stringify(body)).length>config.requestBytes)throw new Error('This exact original bank request exceeds the '+config.requestBytes+'-byte endpoint limit. Download the complete working copy.');
 const pending={id:state.work.id,action,body,createdAt:new Date().toISOString(),workingRevision:state.work.revision,accountId:state.accountId,prepared:state.preview?.prepared??null};
 await storePending(pending);
 try{const result=action==='account'?await client.saveAccount(body):await client.receiveSource(body);await acceptOutcome(pending,result);return result;}
 catch(error){if(error.status>=400&&error.status<500&&!/UNKNOWN|UNCERTAIN|TRANSPORT|INVALID_RESPONSE/i.test(error.code||'')){await clearPending();}throw error;}
}
async function acceptOutcome(pending,result){
 if(result.workspaceId!==pending.body.workspaceId)throw new Error('The bank outcome belongs to a different accounting workspace.');
 if(pending.action==='source'){
  const importId=result.import?.id;if(!importId)throw new Error('The original bank outcome did not include its retained import.');
  const exists=state.work.bankImports.some(x=>x.workspaceId===result.workspaceId&&x.importId===importId);
  if(!exists){state.work=editWorkingCopy(state.work,'BANK_IMPORT',{workspaceId:result.workspaceId,importId,requestId:pending.body.requestId,
   bankAccountId:pending.body.accountId,workingRevision:pending.workingRevision,accountId:pending.accountId,csvSha256:pending.prepared.csvSha256,mappingSha256:pending.prepared.mappingSha256,
   pdfSha256:state.work.file.sha256,reviewSha256:pending.body.reviewSha256},{actor:pending.body.actor,reason:'Retained actual original Bank PDF import outcome'});}
  await save();
 }
 await clearPending();state.preview=null;render();message(pending.action==='source'?'Original PDF, complete mapping and bank import are retained. Open Bank reconciliation for cash matching and the original balance difference.':'Original bank account is retained. Review the PDF intake again to select that account.');
}
async function recoverPending(retry){
 const pending=state.pending;if(!pending)return;const bank=await client.state();
 if(bank.workspaceId!==pending.body.workspaceId)throw new Error('Reopen the accounting workspace bound to this original request.');
 try{await acceptOutcome(pending,await client.getOperation(pending.body.requestId));return;}catch(error){if(error.code!=='BANK_OPERATION_NOT_FOUND'&&error.status!==404)throw error;}
 if(!retry){message('No recorded outcome exists for this original request. Use Retry the same request to attempt that exact retained body.');return;}
 const result=pending.action==='account'?await client.saveAccount(pending.body):await client.receiveSource(pending.body);await acceptOutcome(pending,result);
}
async function receiveBank(){
 const p=state.preview;if(!p||p.workingRevision!==state.work.revision)throw new Error('Review the current complete PDF interpretation first.');
 const identity=reviewIdentity();if(!identity.actor||!identity.reason)throw new Error('Name the reviewer and describe this retained interpretation.');
 await save();const current=await client.state();if(current.workspaceId!==p.bank.workspaceId||current.revision!==p.bank.revision)throw new Error('Accounting changed since preview. Review the current PDF intake again.');
 const bankAccount=$('bank-account').value;
 if(!bankAccount){await originalMutation('account',{revision:current.revision,workspaceId:current.workspaceId,requestId:crypto.randomUUID(),actor:identity.actor,
  account:{name:account().name,currency:{code:account().currency,scale:account().scale},sourceIdentitySha256:p.statement.account.identitySha256,note:account().note}});return;}
 const supersedesImportId=$('supersedes').value||undefined;
 await originalMutation('source',{revision:current.revision,workspaceId:current.workspaceId,requestId:crypto.randomUUID(),actor:identity.actor,
  accountId:bankAccount,statementId:p.statement.id,source:p.source,reviewSha256:p.preview.reviewSha256,...(supersedesImportId?{supersedesImportId}:{})});
}
$('save-conflict').onclick=()=>perform(saveConflictCopy);
$('pdf-file').onchange=()=>perform(async()=>{const file=$('pdf-file').files[0];if(file)await openPdf(file);$('pdf-file').value='';});
$('working-file').onchange=()=>perform(async()=>{const file=$('working-file').files[0];if(!file)return;if(file.size>PDF_LIMITS.transferBytes)throw new Error('Complete working copy exceeds 192 MiB.');const work=await openWorkingCopy(await file.text());await openWork(work);await save();message('Complete PDF, extraction, mappings, history and bank bindings reopened.');$('working-file').value='';});
$('open-saved').onclick=()=>perform(async()=>{const row=await database('copies','readonly',s=>s.get($('saved').value));if(!row)throw new Error('Choose a saved review.');await openWork(await openWorkingCopy(canonical(row.value)));message('Saved original PDF review reopened.');});
$('export').onclick=()=>perform(async()=>{if(!state.work)return;try{await writes;}catch{}download('pdf-statement-'+state.work.id+'.json',checkTransferSize(state.work));});
$('original').onclick=()=>{if(state.work)download(state.work.file.name,decodeBase64(state.work.file.dataBase64),'application/pdf');};
$('new-account').onclick=()=>perform(()=>accountEditor());
$('edit-account').onclick=()=>perform(()=>accountEditor(requireAccount()));
$('table-region').onclick=()=>perform(()=>regionEditor());
$('manual-row').onclick=()=>perform(()=>rowEditor());
$('balance').onclick=()=>perform(()=>balanceEditor());
$('account').onchange=()=>{state.accountId=$('account').value;state.rowOffset=0;state.preview=null;render();};
$('page').onchange=()=>perform(async()=>{state.page=Number($('page').value);state.selection=null;state.selected.clear();await drawPage();});
$('previous-page').onclick=()=>perform(async()=>{if(state.page>1){state.page--;state.selection=null;state.selected.clear();$('page').value=String(state.page);await drawPage();}});
$('next-page').onclick=()=>perform(async()=>{if(state.page<state.work.extraction.pages.length){state.page++;state.selection=null;state.selected.clear();$('page').value=String(state.page);await drawPage();}});
$('zoom').onchange=()=>perform(drawPage);
$('row-filter').onchange=()=>{state.rowOffset=0;renderRows();};$('row-search').oninput=()=>{state.rowOffset=0;renderRows();};
$('rows-prev').onclick=()=>{state.rowOffset=Math.max(0,state.rowOffset-50);renderRows();};$('rows-next').onclick=()=>{state.rowOffset+=50;renderRows();};
$('history-prev').onclick=()=>{state.historyOffset=Math.max(0,state.historyOffset-50);render();};$('history-next').onclick=()=>{state.historyOffset+=50;render();};
$('include-visible').onclick=()=>perform(async()=>{const visible=filteredRows().slice(state.rowOffset,state.rowOffset+50).filter(r=>r.decision==='REVIEW');if(!visible.length)throw new Error('There are no visible unreviewed rows.');await edit('ROWS',visible.map(row=>({...row,decision:'INCLUDE',note:reviewIdentity().reason})));message(visible.length+' visible source rows included after review.');});
$('page-review').onsubmit=event=>{event.preventDefault();perform(async()=>{const form=new FormData(event.target);await edit('PAGE_REVIEW',{page:state.page,...Object.fromEntries(form)});message('Original page '+state.page+' coverage retained.');});};
$('download-csv').onclick=()=>perform(async()=>{const a=requireAccount(),prepared=await prepareBankSource(state.work,a.id,{acknowledgeBalanceDifference:true});download(prepared.source.file.name,prepared.source.file.content,'text/csv;charset=utf-8');});
$('preview-bank').onclick=()=>perform(previewBank);
$('close-editor').onclick=()=>$('editor').close();
$('editor-form').onsubmit=event=>{event.preventDefault();perform(async()=>{await state.editor(new FormData(event.target));$('editor').close();message('Reviewed interpretation saved.');});};
let drag=null;
$('selection-canvas').onpointerdown=event=>{if(state.busy||state.pending||!page())return;const rect=event.currentTarget.getBoundingClientRect();drag=[(event.clientX-rect.left)/state.viewScale,(event.clientY-rect.top)/state.viewScale];state.selected.clear();event.currentTarget.setPointerCapture(event.pointerId);};
$('selection-canvas').onpointermove=event=>{if(!drag)return;const rect=event.currentTarget.getBoundingClientRect(),p=page(),x=Math.max(0,Math.min(p.width,(event.clientX-rect.left)/state.viewScale)),y=Math.max(0,Math.min(p.height,(event.clientY-rect.top)/state.viewScale));state.selection=[Math.min(drag[0],x),Math.min(drag[1],y),Math.max(drag[0],x),Math.max(drag[1],y)];drawSelection();};
$('selection-canvas').onpointerup=event=>{if(drag){drag=null;event.currentTarget.releasePointerCapture(event.pointerId);renderText();drawSelection();}};
$('selection-canvas').onpointercancel=()=>{drag=null;};
window.addEventListener('beforeunload',event=>{if(state.saveError||state.pending){event.preventDefault();event.returnValue='';}});
$('open-bank-import').onclick=()=>perform(chooseBankImport);
await savedList();lock();
