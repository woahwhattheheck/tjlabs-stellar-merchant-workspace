// MIT. First-use handover selection over the original native producer and reviewed programme.
const $=id=>document.getElementById(id);
const copy=x=>JSON.parse(JSON.stringify(x));
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
const code=e=>e?.code??'INTAKE_REQUEST_INCOMPLETE';
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const qs=x=>'?'+new URLSearchParams(x);
const bytes=n=>Number.isSafeInteger(n)?n.toLocaleString()+' bytes':'';
const blank=()=>({baselineId:null,operationId:null,customerLabel:null,maximumTotalItems:null,maximumTotalReturns:null,
 rounds:[{key:null,maximumItems:null,maximumSourceBytes:null}],output:{filenameStem:null,maximumArchiveBytes:null}});
const state={status:null,editor:blank(),baseSha:null,dirty:false,editVersion:0,hydrated:false,saving:false,mutating:false,
 conflict:false,ack:null,closed:false,poll:null,statusSequence:0,dossiers:[],inventory:null,inventoryLoading:false,inventorySequence:0,
 dossierId:null,deliveries:[],deliveryPage:null,deliveryPin:null,deliveryId:null,deliveryLoading:false,deliverySequence:0};
let token='';
const storage='research-handover-intake-token:'+location.origin;
try{const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('token')??sessionStorage.getItem(storage)??'';
 if(fragment.has('token')){sessionStorage.setItem(storage,token);history.replaceState(null,'',location.pathname+location.search);}}
catch{const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('token')??token;
 if(fragment.has('token'))history.replaceState(null,'',location.pathname+location.search);}
function notice(message){$('notice').textContent=message;}
async function response(path,{method='GET',body}={}){
 need(token,'INTAKE_AUTH_REQUIRED');
 const r=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},
 body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error'});
 if(!r.ok){let value;try{value=await r.json();}catch{}
 throw Object.assign(new Error(value?.code??value?.error?.code??'INTAKE_HTTP_'+r.status),
 {code:value?.code??value?.error?.code??'INTAKE_HTTP_'+r.status,status:r.status});}return r;
}
async function api(path,options){return (await response(path,options)).json();}
const busy=()=>state.mutating||state.saving||state.status?.job?.state==='RUNNING';
const frozen=()=>!!state.status?.frozen||!!state.status?.prepared||!!state.status?.draft?.locked;
function fact(root,label,value){const item=el('div',undefined,'fact');item.append(el('small',label),el('strong',value??'—'));root.append(item);}
function touch(){state.editVersion++;state.dirty=true;state.ack=null;$('acknowledge').checked=false;renderControls();}
function numeric(value){if(value==='')return null;const n=Number(value);need(Number.isSafeInteger(n),'INTAKE_WHOLE_NUMBER_REQUIRED');return n;}
function setNumber(input,setter){input.addEventListener('input',()=>{if(frozen())return;try{setter(numeric(input.value));input.setCustomValidity('');touch();}
 catch{input.setCustomValidity('Enter a whole number.');state.dirty=true;state.ack=null;renderControls();}});}
function fillInput(id,value){$(id).value=value??'';}
function adopt(draft){
 state.editor=draft?copy(draft.value):blank();state.baseSha=draft?.sha256??null;state.dirty=false;state.conflict=false;
 state.editVersion++;state.ack=null;state.hydrated=true;renderEditor();
}
function renderEditor(){
 const v=state.editor;fillInput('operation-id',v.operationId);fillInput('customer-label',v.customerLabel);
 fillInput('scope-source-actor',v.sourceActor);fillInput('total-items',v.maximumTotalItems);
 fillInput('total-returns',v.maximumTotalReturns);fillInput('filename-stem',v.output?.filenameStem);
 fillInput('archive-bytes',v.output?.maximumArchiveBytes);$('acknowledge').checked=false;
 renderBaselines();renderRounds();renderControls();
}
function renderRounds(){
 const root=$('rounds');root.replaceChildren();
 for(const [index,row] of (Array.isArray(state.editor.rounds)?state.editor.rounds:[]).entries()){
  const container=el('div',undefined,'round');container.dataset.roundIndex=String(index);
  const fields=[['Round name','key','text'],['Maximum items','maximumItems','number'],['Maximum source bytes','maximumSourceBytes','number']];
  for(const [label,field,type] of fields){
   const wrapper=el('label',label),input=el('input');input.type=type;input.value=row[field]??'';input.dataset.field=field;
   input.disabled=frozen();if(type==='number'){input.min=field==='maximumItems'?'0':'1';input.max=field==='maximumItems'?'100000':'268435456';input.step='1';
    setNumber(input,v=>{row[field]=v;});}
   else{input.maxLength=120;input.autocomplete='off';input.addEventListener('input',()=>{if(!frozen()){row[field]=input.value||null;touch();}});}
   wrapper.append(input);container.append(wrapper);
  }
  const remove=el('button','Remove');remove.type='button';remove.dataset.removeRound=String(index);
  remove.disabled=frozen()||(state.editor.rounds?.length??0)===1;remove.setAttribute('aria-label','Remove return round '+(index+1));
  remove.addEventListener('click',()=>{if(frozen())return;state.editor.rounds.splice(index,1);touch();renderRounds();});container.append(remove);root.append(container);
 }
}
function selectedBaseline(){return (state.status?.baselines??[]).find(x=>x.id===state.editor.baselineId);}
function renderBaselines(){
 const select=$('baseline'),wanted=state.editor.baselineId;select.replaceChildren(el('option','Choose a retained handover'));select.firstChild.value='';
 for(const baseline of state.status?.baselines??[]){const option=el('option',(baseline.customerLabel||baseline.title||baseline.dossierId)+' · '+baseline.deliveryId+' · revision '+baseline.revision);
 option.value=baseline.id;select.append(option);}
 if(wanted&&!Array.from(select.options).some(x=>x.value===wanted)){const option=el('option','Previously selected handover is not in this saved state');option.value=wanted;select.append(option);}
 select.value=wanted??'';
 const root=$('baseline-facts');root.replaceChildren();const baseline=selectedBaseline();
 if(baseline){fact(root,'Dossier',baseline.dossierId);fact(root,'Published delivery',baseline.deliveryId);fact(root,'Historical revision',baseline.revision);
 fact(root,'Original manifest SHA-256',baseline.manifestSha256);fact(root,'Source workspace',baseline.sourceWorkspace?JSON.stringify(baseline.sourceWorkspace):'Not included');}
 $('baseline-note').textContent=(state.status?.baselines?.length??0)+' complete original handover(s) retained. Retaining a handover does not choose or approve its return scope.';
}
function safeDeskUrl(value){const url=new URL(value);need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&
 !url.username&&!url.password&&new URLSearchParams(url.hash.slice(1)).has('token'),'INTAKE_DESK_URL_INVALID');return url.href;}
function renderStatus(){
 const status=state.status;if(!status)return;
 const workspace=$('workspace');workspace.replaceChildren();fact(workspace,'Workspace',status.workspace?.workspaceId);
 fact(workspace,'Selection',frozen()?'Frozen original selection':'Editable scope');$('engine').textContent=JSON.stringify(status.engine,null,2);
 $('job').textContent=status.job?String(status.job.action)+' · '+status.job.state+(status.job.error?.code?' · '+status.job.error.code:''):'No native action is running.';
 renderBaselines();
 const preview=status.preview,root=$('preview-facts');root.replaceChildren();
 if(preview){const value=preview.value;fact(root,'Preview SHA-256',preview.sha256);fact(root,'Current revision',value.current?.revision);
 fact(root,'Current revision SHA-256',value.current?.sha256);fact(root,'Prior accepted returns',value.inheritedReturns);
 fact(root,'Prior reviewed items',value.reviewedItemCount);$('preview-json').textContent=JSON.stringify(value,null,2);}
 else $('preview-json').textContent='Save a complete scope and inspect it to produce the original preview.';
 $('prepared-note').textContent=status.prepared?'Original programme initialized at revision '+status.prepared.initialRevision+
 '. Its selection is retained; use the handover desk for the actual returns.':status.frozen?
 'The exact reviewed selection is frozen. Resume its original preparation after an interruption; scope edits cannot replace it.':'';
 const link=$('open-desk');link.hidden=true;link.removeAttribute('href');
 if(status.desk?.url){try{link.href=safeDeskUrl(status.desk.url);link.hidden=false;}catch(error){notice(code(error));}}
 renderFiles(status.files??[]);renderControls();
}
function renderControls(){
 const locked=frozen(),working=busy(),saved=state.status?.draft,preview=state.status?.preview;
 const exactSaved=!!saved&&!state.dirty&&!state.conflict&&saved.sha256===state.baseSha&&same(saved.value,state.editor);
 for(const id of ['operation-id','customer-label','scope-source-actor','total-items','total-returns','filename-stem','archive-bytes','baseline'])$(id).disabled=locked;
 for(const input of $('rounds').querySelectorAll('input'))input.disabled=locked;
 for(const button of $('rounds').querySelectorAll('button'))button.disabled=locked||(state.editor.rounds?.length??0)===1;
 $('add-round').disabled=locked||(state.editor.rounds?.length??0)>=32;
 $('save-draft').disabled=locked||working; $('use-saved').disabled=state.saving||!saved;
 $('preview').disabled=locked||working||!exactSaved;
 const exactPreview=!!preview&&preview.value.draftSha256===saved?.sha256&&exactSaved;
 $('acknowledge').disabled=locked||working||!exactPreview;
 if(state.ack!==preview?.sha256)$('acknowledge').checked=false;
 $('prepare').textContent=statusFrozen()?'Resume the exact preparation':'Prepare this reviewed selection';
 $('prepare').disabled=working||!!state.status?.prepared||(!statusFrozen()&&(!exactPreview||state.ack!==preview?.sha256));
 $('launch').disabled=working||!state.status?.prepared;
 $('load-dossiers').disabled=locked||working||state.inventoryLoading;
 $('more-dossiers').disabled=locked||working||state.inventoryLoading;
 $('dossier').disabled=locked||working||state.inventoryLoading||state.deliveryLoading;
 $('delivery').disabled=locked||working||state.deliveryLoading||!state.deliveryPin;
 $('more-deliveries').disabled=locked||working||state.deliveryLoading;
 $('source-library').disabled=locked||working;$('source-actor').disabled=locked||working;
 $('retain-baseline').disabled=locked||working||state.deliveryLoading||!state.deliveryId||!state.deliveryPin;
 const marker=$('draft-state');marker.classList.toggle('conflict',state.conflict);
 marker.textContent=locked?(state.dirty?'The original scope is frozen. Different local fields are preserved here for export; they cannot replace the selection.':'The original scope and selection are frozen.'):
 state.conflict?'Another window saved a different scope. Your local fields are preserved. Export them or load the saved scope before continuing.':
 state.saving?'Saving the exact scope snapshot…':state.dirty?'Local scope fields are not saved.':'Saved scope SHA-256: '+(state.baseSha??'no draft yet');
}
function statusFrozen(){return !!state.status?.frozen;}
async function refresh({quiet=false}={}){
 const sequence=++state.statusSequence;
 try{
  const status=await api('/api/status');if(sequence!==state.statusSequence||state.closed)return;
  const oldPreview=state.status?.preview?.sha256;state.status=status;
  if(oldPreview!==status.preview?.sha256){state.ack=null;$('acknowledge').checked=false;}
  if(!state.hydrated)adopt(status.draft);
  else if(!state.dirty&&!state.saving)adoptIfChanged(status.draft);
  else if(!state.saving&&state.baseSha!==(status.draft?.sha256??null))state.conflict=true;
  renderStatus();
  if(!quiet)notice(status.frozen?'The original selection is retained. Continue or recover that same preparation.':'Saved workspace and selection state refreshed.');
 }catch(error){if(sequence===state.statusSequence)notice('Saved state could not be read: '+code(error)+'. Local scope fields remain here.');}
 finally{if(sequence===state.statusSequence){clearTimeout(state.poll);if(!state.closed&&token)state.poll=setTimeout(()=>refresh({quiet:true}),state.status?.job?.state==='RUNNING'?1200:10000);}}
}
function adoptIfChanged(draft){if(state.baseSha!==(draft?.sha256??null)||!same(state.editor,draft?.value??blank()))adopt(draft);}
async function job(action,body){
 if(busy())return;state.mutating=true;renderControls();
 try{const result=await api('/api/'+action,{method:'POST',body});need(result.job,'INTAKE_JOB_RECEIPT_REQUIRED');
 if(state.status)state.status.job=result.job;notice('Original '+action+' action is '+result.job.state+'. Its saved state remains available if this window disconnects.');}
 catch(error){notice('Original '+action+' response was not confirmed: '+code(error)+'. Refresh and reconcile the retained state before another action.');}
 finally{state.mutating=false;await refresh({quiet:true});}
}
async function saveDraft(){
 if(busy()||frozen())return;
 need(Array.from(document.querySelectorAll('input')).every(x=>x.checkValidity()),'INTAKE_SCOPE_FIELD_INVALID');
 const value=copy(state.editor),expectedSha256=state.baseSha,version=state.editVersion;state.saving=true;renderControls();
 try{
  const draft=await api('/api/draft',{method:'POST',body:{expectedSha256,value}});
  need(sha(draft.sha256)&&same(draft.value,value),'INTAKE_SAVED_DRAFT_CHANGED');
  state.baseSha=draft.sha256;state.conflict=false;if(state.status)state.status.draft=draft;
  if(state.editVersion===version&&same(state.editor,value))state.dirty=false;state.ack=null;
  notice('The complete scope snapshot is saved. Inspect its original baseline and native history before preparation.');
 }catch(error){notice('Scope save was not confirmed: '+code(error)+'. Your complete local fields remain available for exact retry or export.');}
 finally{state.saving=false;await refresh({quiet:true});}
}
function pageNext(page,offset){need(Array.isArray(page.items)&&Number.isSafeInteger(page.total)&&page.offset===offset,'INTAKE_NATIVE_PAGE_CHANGED');
 if(page.nextOffset===null||page.complete===true)return null;need(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset,'INTAKE_NATIVE_PAGE_CHANGED');return page.nextOffset;}
async function loadDossiers(more=false){
 if(busy()||frozen()||state.inventoryLoading)return;
 const sequence=++state.inventorySequence,offset=more?state.inventory?.nextOffset:0;
 if(more&&offset===null)return;
 state.inventoryLoading=true;renderControls();
 try{
  const params={offset};if(more){need(state.inventory?.snapshot,'INTAKE_INVENTORY_SNAPSHOT_REQUIRED');params.snapshot=state.inventory.snapshot;}
  const page=await api('/api/dossiers'+qs(params));if(sequence!==state.inventorySequence)return;
  const nextOffset=pageNext(page,offset);need(page.snapshot&&(!more||page.snapshot===state.inventory.snapshot),'INTAKE_INVENTORY_SNAPSHOT_CHANGED');
  const rows=more?[...state.dossiers,...page.items]:page.items;
  need(new Set(rows.map(x=>x.id)).size===rows.length,'INTAKE_INVENTORY_REPEATED');
  state.dossiers=rows;state.inventory={snapshot:page.snapshot,nextOffset,total:page.total};
  const select=$('dossier'),chosen=state.dossierId;select.replaceChildren(el('option','Choose an original dossier'));select.firstChild.value='';
  for(const row of rows){const option=el('option',(row.title||row.id)+' · revision '+row.revision);option.value=row.id;select.append(option);}
  if(chosen&&!rows.some(x=>x.id===chosen)){state.dossierId=null;clearDeliveries();}select.value=state.dossierId??'';
  $('more-dossiers').hidden=nextOffset===null;$('inventory-note').textContent=rows.length+' of '+page.total+' dossiers from one immutable inventory snapshot.';
 }catch(error){notice('Dossiers could not be listed: '+code(error)+'. Reload the original inventory if its snapshot is no longer available.');}
 finally{state.inventoryLoading=false;renderControls();}
}
function clearDeliveries(){state.deliverySequence++;state.deliveries=[];state.deliveryPage=null;state.deliveryPin=null;state.deliveryId=null;
 $('delivery').replaceChildren(el('option','Choose a dossier first'));$('delivery').firstChild.value='';$('more-deliveries').hidden=true;$('delivery-note').textContent='';}
async function loadDeliveries(more=false){
 if(busy()||frozen()||!state.dossierId||state.deliveryLoading)return;
 const owner=state.dossierId,sequence=++state.deliverySequence,offset=more?state.deliveryPage?.nextOffset:0;
 if(more&&offset===null)return;
 state.deliveryLoading=true;renderControls();
 try{
  const params={dossierId:owner,offset};if(more)params.revision=state.deliveryPin.revision;
  const result=await api('/api/deliveries'+qs(params));if(sequence!==state.deliverySequence||owner!==state.dossierId)return;
  need(result.dossier.id===owner&&(!more||same(result.dossier,state.deliveryPin)),'INTAKE_DELIVERY_PIN_CHANGED');
  const nextOffset=pageNext(result.page,offset),rows=more?[...state.deliveries,...result.page.items]:result.page.items;
  need(new Set(rows.map(x=>x.id)).size===rows.length,'INTAKE_DELIVERY_REPEATED');
  state.deliveries=rows;state.deliveryPage={nextOffset,total:result.page.total};state.deliveryPin=result.dossier;
  const select=$('delivery');select.replaceChildren(el('option','Choose a published delivery'));select.firstChild.value='';
  for(const row of rows){const option=el('option',(row.title?row.title+' · ':'')+row.id+' · revision '+row.revision);option.value=row.id;select.append(option);}
  select.value=state.deliveryId??'';$('more-deliveries').hidden=nextOffset===null;
  $('delivery-note').textContent=rows.length+' of '+result.page.total+' deliveries listed at dossier revision '+result.dossier.revision+'. Select a record to inspect its complete original fields.';
 }catch(error){notice('Published deliveries could not be listed: '+code(error)+'. Your retained handovers and scope are unchanged.');}
 finally{state.deliveryLoading=false;renderControls();}
}
async function baseline(){
 const pin=copy(state.deliveryPin),deliveryId=state.deliveryId,dossierId=state.dossierId;
 const library=$('source-library').value,actor=$('source-actor').value;
 need((!library&&!actor)||(library&&actor),'INTAKE_SOURCE_LIBRARY_AND_ACTOR_REQUIRED');
 await job('baseline',{dossierId,deliveryId,revision:pin.revision,sourceWorkspace:library?{library,actor}:null});
}
function saveBlob(body,name){const url=URL.createObjectURL(body),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function download(file,button){
 button.disabled=true;
 try{
  need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=268435456&&sha(file.sha256),'INTAKE_FILE_DESCRIPTOR_INVALID');
  const r=await response('/api/download'+qs({id:file.id})),length=r.headers.get('content-length'),checksum=r.headers.get('x-content-sha256');
  need(length!==null&&/^[0-9]+$/.test(length)&&Number(length)===file.bytes&&checksum===file.sha256,'INTAKE_DOWNLOAD_DESCRIPTOR_CHANGED');
  need(r.body,'INTAKE_DOWNLOAD_BODY_REQUIRED');const reader=r.body.getReader(),parts=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;need(count<=file.bytes,'INTAKE_DOWNLOAD_EXCEEDS_DESCRIPTOR');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  need(count===file.bytes,'INTAKE_DOWNLOAD_LENGTH_CHANGED');
  const blob=new Blob(parts,{type:r.headers.get('content-type')??'application/octet-stream'}),body=await blob.arrayBuffer();
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body))).map(x=>x.toString(16).padStart(2,'0')).join('');
  need(actual===file.sha256,'INTAKE_DOWNLOAD_HASH_CHANGED');
  const disposition=r.headers.get('content-disposition')??'',match=disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const name=match?decodeURIComponent(match[1]):disposition.match(/filename="([^"]+)"/i)?.[1]??file.filename;
  need(typeof name==='string'&&name.length>0&&name.length<=512&&!/[\u0000-\u001f\u007f/\\]/.test(name),'INTAKE_DOWNLOAD_FILENAME_INVALID');
  saveBlob(blob,name);notice('Downloaded '+name+' · '+bytes(count)+'. Complete original bytes verified.');
 }catch(error){notice('Download could not be completed: '+code(error)+'. The original retained file is unchanged.');}
 finally{button.disabled=false;}
}
function renderFiles(files){const root=$('files');root.replaceChildren();
 for(const file of files){const row=el('div',undefined,'download'),button=el('button',file.label||file.filename);button.type='button';button.dataset.download=file.id;
 button.addEventListener('click',()=>download(file,button));row.append(button,el('span',bytes(file.bytes)+' · '+file.sha256));root.append(row);}
 if(!files.length)root.append(el('p','Retained original handovers and selection files will appear here.'));
}
function guarded(fn){return async()=>{try{await fn();}catch(error){notice('The operation could not continue: '+code(error)+'. Your saved original state is retained.');}};}
$('refresh').addEventListener('click',guarded(()=>refresh()));
$('load-dossiers').addEventListener('click',guarded(()=>loadDossiers(false)));
$('more-dossiers').addEventListener('click',guarded(()=>loadDossiers(true)));
$('more-deliveries').addEventListener('click',guarded(()=>loadDeliveries(true)));
$('dossier').addEventListener('change',()=>{if(frozen())return;state.dossierId=$('dossier').value||null;clearDeliveries();loadDeliveries(false);});
$('delivery').addEventListener('change',()=>{if(frozen())return;state.deliveryId=$('delivery').value||null;
 const row=state.deliveries.find(x=>x.id===state.deliveryId);$('delivery-note').textContent=row?JSON.stringify(row,null,2):'Choose a published delivery.';renderControls();});
$('retain-baseline').addEventListener('click',guarded(baseline));
$('baseline').addEventListener('change',()=>{if(frozen())return;state.editor.baselineId=$('baseline').value||null;
 const selected=selectedBaseline();if(!state.editor.customerLabel&&selected?.customerLabel){state.editor.customerLabel=selected.customerLabel;fillInput('customer-label',selected.customerLabel);}touch();renderBaselines();});
for(const [id,field] of [['operation-id','operationId'],['customer-label','customerLabel']])$(id).addEventListener('input',()=>{if(!frozen()){state.editor[field]=$(id).value||null;touch();}});
$('scope-source-actor').addEventListener('input',()=>{if(!frozen()){if($('scope-source-actor').value)state.editor.sourceActor=$('scope-source-actor').value;else delete state.editor.sourceActor;touch();}});
setNumber($('total-items'),x=>{state.editor.maximumTotalItems=x;});setNumber($('total-returns'),x=>{state.editor.maximumTotalReturns=x;});
setNumber($('archive-bytes'),x=>{state.editor.output??={};state.editor.output.maximumArchiveBytes=x;});
$('filename-stem').addEventListener('input',()=>{if(!frozen()){state.editor.output??={};state.editor.output.filenameStem=$('filename-stem').value||null;touch();}});
$('add-round').addEventListener('click',()=>{if(frozen()||(state.editor.rounds?.length??0)>=32)return;if(!Array.isArray(state.editor.rounds))state.editor.rounds=[];state.editor.rounds.push({key:null,maximumItems:null,maximumSourceBytes:null});touch();renderRounds();});
$('save-draft').addEventListener('click',guarded(saveDraft));
$('use-saved').addEventListener('click',()=>{if(state.status?.draft)adopt(state.status.draft);});
$('export-draft').addEventListener('click',()=>saveBlob(new Blob([JSON.stringify(state.editor,null,2)+'\n'],{type:'application/json'}),'research-handover-scope-draft.json'));
$('preview').addEventListener('click',guarded(()=>job('preview',{draftSha256:state.baseSha})));
$('acknowledge').addEventListener('change',()=>{state.ack=$('acknowledge').checked?state.status?.preview?.sha256:null;renderControls();});
$('prepare').addEventListener('click',guarded(()=>job('prepare',{previewSha256:state.status?.frozen?.previewSha256??state.status?.preview?.sha256})));
$('launch').addEventListener('click',guarded(()=>job('launch',{})));
window.addEventListener('beforeunload',event=>{if(state.dirty||state.saving){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{state.closed=true;clearTimeout(state.poll);});
window.addEventListener('pageshow',()=>{state.closed=false;if(token)refresh({quiet:true});});
renderEditor();if(token)refresh();else notice('Open the original private URL printed by the handover intake command.');
